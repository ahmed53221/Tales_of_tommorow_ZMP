// engine_mp.js — Multiplayer dispatcher + shared game core.
//
// Data model mirrors single-player engine.js:
//   state.raw[partyId][demoId]    — per-demographic raw support
//   state.partySupport[partyId]   — derived flat support (maintained by sync)
//   state.shared[FACTION]         — per-faction module state
//   state.queues[FACTION]         — queued events
//
// All resolvers from engine.js are carried over. Only the multiplayer
// scaffolding — turns, snapshots, formation cycle, cabinet formation,
// per-faction presidential cycle — is new.
//
// Exposes: window.EngineMP

window.EngineMP = (function () {
  'use strict';

  var D = window.GameData;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function round1(v) { return Math.round(v * 10) / 10; }

    // ============================================================
  // NORMALIZE PARTY IDS
  // ============================================================
  // data.js ships with mixed-case party IDs (ZMP, zmp, iia, IIA, ...).
  // The faction modules and engine expect uppercase everywhere. Dedupe
  // and uppercase every ID so there is one canonical entry per party.
  (function normalizePartyIds() {
    if (!D || !D.PARTIES) return;

    var canonical = {};
    for (var i = 0; i < D.PARTIES.length; i++) {
      var p = D.PARTIES[i];
      var upper = String(p.id).toUpperCase();
      if (canonical[upper]) {
        // Merge the lower-case variant's base into the canonical entry
        // only if the canonical entry lacks a base for that demographic.
        var base = canonical[upper].base || {};
        var other = p.base || {};
        for (var dmid in other) {
          if (base[dmid] === undefined) base[dmid] = other[dmid];
        }
        canonical[upper].base = base;
        continue;
      }
      p.id = upper;
      canonical[upper] = p;
    }

    var deduped = [];
    for (var k in canonical) deduped.push(canonical[k]);
    D.PARTIES = deduped;

    console.log('[engine_mp] normalized ' + D.PARTIES.length + ' parties');
  })();

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    totalWeeks: 104,
    electionWeeks: [9, 25, 41, 57, 73, 89],
    eventExpiryWeeks: 6,
    heartbeatInterval: 5,
    disconnectTimeout: 30,
    forfeitTimeout: 60,
    maxPendingPerFaction: 999,
    priorityTiebreak: ['ZMP', 'IIA', 'RED', 'ZPF', 'BL', 'PL', 'minor']
  };

  // ============================================================
  // STATE
  // ============================================================
  var state = null;
  var factionModules = {};

  // ============================================================
  // PARTY HELPERS
  // ============================================================
  function getParty(id) {
    if (!D || !D.PARTIES) return null;
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (D.PARTIES[i].id === id) return D.PARTIES[i];
    }
    return null;
  }

  function getPartySupport(st, pid) {
    if (!st.raw || !st.raw[pid]) return 0;
    var total = 0, count = 0;
    if (!D || !D.DEMOS) return 0;
    for (var i = 0; i < D.DEMOS.length; i++) {
      var dm = D.DEMOS[i];
      total += st.raw[pid][dm.id] || 0;
      count++;
    }
    return count > 0 ? total / count : 0;
  }

  function demoName(id) {
    if (!D || !D.DEMOS) return id;
    for (var i = 0; i < D.DEMOS.length; i++) {
      if (D.DEMOS[i].id === id) return D.DEMOS[i].name;
    }
    return id;
  }

  function partyName(id) {
    var p = getParty(id);
    return p ? p.short : id;
  }

  function activeParties(st) {
    if (!D || !D.PARTIES) return [];
    var result = [];
    for (var i = 0; i < D.PARTIES.length; i++) {
      var p = D.PARTIES[i];
      if (st.merged.indexOf(p.id) === -1 && st.raw[p.id]) {
        result.push(p);
      }
    }
    return result;
  }

  // ============================================================
  // FACTION REGISTRATION
  // ============================================================
  function registerFaction(mod) {
    if (!mod || !mod.id) { console.error('[engine_mp] faction missing id'); return; }
    var required = ['id','name','color','availableActions','applyAction',
                    'checkVictory','checkDefeat','getVisibleState','getSupport'];
    for (var i = 0; i < required.length; i++) {
      if (mod[required[i]] === undefined) {
        console.error('[engine_mp] faction "' + mod.id + '" missing ' + required[i]);
        return;
      }
    }
    factionModules[mod.id] = mod;
    console.log('[engine_mp] registered: ' + mod.id);
  }

  function getFaction(id) { return factionModules[id] || null; }

  function makeFallbackFaction(id) {
    return {
      id: id,
      name: id,
      color: '#888',
      availableActions: function () {
        return [
          { id: 'wait', name: 'Wait', desc: 'Skip this week.' },
          { id: 'canvass_generic', name: 'Canvass', desc: 'Generic campaigning.', needsTarget: 'demo' },
          { id: 'rally_generic', name: 'Rally', desc: 'Generic rally.' }
        ];
      },
      applyAction: function (st, playerId, action) {
        if (!action || !action.id || action.id === 'wait') return;
        if (!st.shared) st.shared = {};
        if (!st.shared[id]) st.shared[id] = {};
        var sh = st.shared[id];
        if (typeof sh.support !== 'number') {
          sh.support = (st.partySupport && st.partySupport[id]) || 5;
        }
        if (action.id === 'rally_generic') sh.support = Math.max(0.5, sh.support + 1);
        else if (action.id === 'canvass_generic') sh.support = Math.max(0.5, sh.support + 0.5);
      },
      checkVictory: function () { return false; },
      checkDefeat:  function () { return false; },
      getVisibleState: function () { return {}; },
      getSupport: function (st) {
        var out = {};
        if (st.shared && st.shared[id] && typeof st.shared[id].support === 'number') {
          out[id] = st.shared[id].support;
        }
        return out;
      }
    };
  }

  function findPlayer(id) {
    if (!state) return null;
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === id) return state.players[i];
    }
    return null;
  }

  // ============================================================
  // SUPPORT / PRIORITY
  // ============================================================
  function getSupportOf(factionId) {
    if (!state) return 0;
    var key = String(factionId).toUpperCase();

    // Prefer the faction module's own value.
    var mod = factionModules[key];
    if (mod && typeof mod.getSupport === 'function') {
      try {
        var s = mod.getSupport(state, null);
        var total = 0, count = 0;
        for (var pid in s) {
          if (pid.indexOf('_') === 0) continue;
          total += s[pid] || 0;
          count++;
        }
        if (count > 0) return total / count;
      } catch (e) {}
    }

    // Fall back to the flat table (already canonicalized).
    if (state.partySupport && state.partySupport[key] !== undefined) {
      return state.partySupport[key];
    }

    // Last resort: raw average.
    if (state.raw && state.raw[key]) {
      return getPartySupport(state, key);
    }
    return 0;
  }

  function sortBySupport(factionIds) {
    return factionIds.slice().sort(function (a, b) {
      var diff = getSupportOf(b) - getSupportOf(a);
      if (Math.abs(diff) > 0.01) return diff;
      var ai = CFG.priorityTiebreak.indexOf(a);
      var bi = CFG.priorityTiebreak.indexOf(b);
      if (ai === -1) ai = 999;
      if (bi === -1) bi = 999;
      return ai - bi;
    });
  }

  // ============================================================
  // COALITION TEMPLATES
  // ============================================================
  var COALITION_TEMPLATES = [
    { id: 'zalgrilian',   name: 'Zalgrilian Front',   leader: 'ZMP', partners: ['ZPF'] },
    { id: 'leftblock',    name: 'Left Block',         leader: 'ZMP', partners: ['ZPF', 'IIA'] },
    { id: 'rgb',          name: 'RGB Alliance',       leader: 'ZMP', partners: ['IIA', 'RED'] },
    { id: 'grand',        name: 'Grand Coalition',    leader: 'ZMP', partners: ['ZPF', 'IIA'] },
    { id: 'spirit',       name: 'Spirit Alliance',    leader: 'ZMP', partners: ['SEMP', 'PL'] },

    { id: 'centre_zpf',   name: 'Centre Alliance',    leader: 'ZPF', partners: ['ZMP'] },
    { id: 'centre_right', name: 'Centre-Right',       leader: 'ZPF', partners: ['IIA'] },

    { id: 'rbpact',       name: 'R&B Pact',           leader: 'IIA', partners: ['RED', 'RB'] },
    { id: 'left_tech',    name: 'Left-Tech Alliance', leader: 'IIA', partners: ['RED', 'REPUBLIA', 'RB'] },

    { id: 'red_front',    name: 'Red Front Bloc',     leader: 'RED', partners: ['RB', 'IIA'] },
    { id: 'rev_bloc',     name: 'Revolutionary Bloc', leader: 'RED', partners: ['RB', 'REPUBLIA'] },

    { id: 'rep_front',    name: 'Red-Republia Front', leader: 'REPUBLIA', partners: ['RED', 'RB'] },

    { id: 'bl_sportica',  name: 'BL-Sportica Bloc',   leader: 'BL', partners: ['SPORTICA'] }
  ];

  // ============================================================
  // MINISTRIES + ACTIONS
  // ============================================================
  var MINISTRY_LIST = [
    { id: 'finance',        name: 'Finance',        icon: '💰', desc: 'Controls the school budget.' },
    { id: 'education',      name: 'Education',      icon: '📚', desc: 'Oversees curriculum and teaching.' },
    { id: 'justice',        name: 'Justice',        icon: '⚖️', desc: 'Manages discipline and rules.' },
    { id: 'technology',     name: 'Technology',     icon: '💻', desc: 'Handles IT, wifi, and labs.' },
    { id: 'health',         name: 'Health',         icon: '🏥', desc: 'Manages student welfare.' },
    { id: 'sports',         name: 'Sports',         icon: '🏅', desc: 'Oversees athletics and gym.' },
    { id: 'arts',           name: 'Arts',           icon: '🎭', desc: 'Manages drama, music, and arts.' },
    { id: 'infrastructure', name: 'Infrastructure', icon: '🏗️', desc: 'Handles buildings and facilities.' }
  ];

  var MINISTRY_ACTIONS = {
    finance: [
      { id: 'finance_budget_reform', name: 'Budget Reform',
        desc: '+40 funds, -6 unity, +4 ZMP, +2 momentum. Action, not a promise.',
        cost: { ap: 0, budget: 0 }, effect: { funds: 40, unity: -6, zmp: 4, momentum: 2 } },
      { id: 'finance_tax_increase', name: 'Fee Increase',
        desc: '+60 funds, -14 freshmen, +2 ZMP, +5 volunteers.',
        cost: { ap: 0, budget: 0 }, effect: { funds: 60, freshmen: -14, zmp: 2, volunteers: 5 } }
    ],
    education: [
      { id: 'edu_curriculum', name: 'Curriculum Reform',
        desc: '+18 honors, -8 freshmen, +4 ZMP, +4 faculty.',
        cost: { ap: 0, budget: 20 }, effect: { honor: 18, freshmen: -8, zmp: 4, faculty: 4 } },
      { id: 'edu_teacher_hiring', name: 'Teacher Hiring',
        desc: '+18 faculty, +10 seniors, +3 ZMP, +3 unity.',
        cost: { ap: 0, budget: 40 }, effect: { faculty: 18, seniors: 10, zmp: 3, unity: 3 } }
    ],
    justice: [
      { id: 'justice_reform', name: 'Justice Reform',
        desc: '+16 unity, +12 faculty, +6 ZMP.',
        cost: { ap: 0, budget: 20 }, effect: { unity: 16, faculty: 12, zmp: 6 } },
      { id: 'justice_monarchists', name: 'Monarchy Sympathizers',
        desc: '+20 monarchySympathizers, +10 ZMP, +5 seniors.',
        cost: { ap: 0, budget: 10 }, effect: { monarchySympathizers: 20, zmp: 10, seniors: 5 } },
      { id: 'justice_investigate_bl', name: 'Investigate BL',
        desc: 'BL -10, +4 ZMP, +2 momentum.',
        cost: { ap: 0, budget: 30 }, effect: { investigate_bl: true, bl: -10, zmp: 4, momentum: 2 },
        requires: { monarchySympathizers: 5 } },
      { id: 'justice_prosecute_bl', name: 'Prosecute BL',
        desc: 'BL -25, +12 ZMP, +5 faculty.',
        cost: { ap: 0, budget: 40 }, effect: { prosecute_bl: true, bl: -25, zmp: 12, faculty: 5 },
        requires: { investigate_bl: true } },
      { id: 'justice_ban_bl', name: 'Ban BL Splinters',
        desc: 'Ban splinter parties, +6 ZMP, +4 unity.',
        cost: { ap: 0, budget: 50 }, effect: { banSplinters: true, zmp: 6, unity: 4 },
        requires: { prosecute_bl: true } },
      { id: 'justice_dismantle_bl', name: 'Dismantle BL',
        desc: 'Destroy BL entirely. +15 ZMP, +10 unity, +10 faculty.',
        cost: { ap: 0, budget: 60 }, effect: { dismantleBL: true, zmp: 15, unity: 10, faculty: 10 },
        requires: { banSplinters: true } }
    ],
    technology: [
      { id: 'tech_wifi', name: 'WiFi Upgrade',
        desc: '+18 gamers, +12 IIA, +6 ZMP, +2 momentum.',
        cost: { ap: 0, budget: 30 }, effect: { gamers: 18, iia: 12, zmp: 6, momentum: 2 } },
      { id: 'tech_labs', name: 'Lab Funding',
        desc: '+14 gamers, +12 honors, +5 ZMP.',
        cost: { ap: 0, budget: 25 }, effect: { gamers: 14, honor: 12, zmp: 5 } }
    ],
    health: [
      { id: 'health_reform', name: 'Healthcare Reform',
        desc: '+18 buskids, +12 freshmen, +6 ZMP.',
        cost: { ap: 0, budget: 30 }, effect: { buskids: 18, freshmen: 12, zmp: 6 } },
      { id: 'health_mental', name: 'Mental Health',
        desc: '+14 unity, +12 faculty, +4 ZMP.',
        cost: { ap: 0, budget: 20 }, effect: { unity: 14, faculty: 12, zmp: 4 } }
    ],
    sports: [
      { id: 'sports_gym', name: 'Gym Upgrade',
        desc: '+18 athletes, +12 Sportica, +4 ZMP.',
        cost: { ap: 0, budget: 30 }, effect: { athletes: 18, sportica: 12, zmp: 4 } },
      { id: 'sports_teams', name: 'Sports Teams',
        desc: '+14 athletes, +8 freshmen, +3 ZMP, +3 unity.',
        cost: { ap: 0, budget: 25 }, effect: { athletes: 14, freshmen: 8, zmp: 3, unity: 3 } }
    ],
    arts: [
      { id: 'arts_funding', name: 'Arts Funding',
        desc: '+18 arts, +12 PL, +6 ZMP.',
        cost: { ap: 0, budget: 25 }, effect: { arts: 18, pl: 12, zmp: 6 } },
      { id: 'arts_events', name: 'Cultural Events',
        desc: '+14 arts, +10 freshmen, +4 ZMP, +3 momentum.',
        cost: { ap: 0, budget: 18 }, effect: { arts: 14, freshmen: 10, zmp: 4, momentum: 3 } }
    ],
    infrastructure: [
      { id: 'infra_repair', name: 'Building Repair',
        desc: '+18 faculty, +12 seniors, +4 ZMP, +3 unity.',
        cost: { ap: 0, budget: 40 }, effect: { faculty: 18, seniors: 12, zmp: 4, unity: 3 } },
      { id: 'infra_green', name: 'Green Initiative',
        desc: '+14 freshmen, +12 arts, +4 ZMP, +2 momentum.',
        cost: { ap: 0, budget: 20 }, effect: { freshmen: 14, arts: 12, zmp: 4, momentum: 2 } }
    ]
  };

  // ============================================================
  // PRESIDENTIAL CANDIDATES (per-faction pools)
  // ============================================================
  var PRESIDENTIAL_CANDIDATES = {
    ZMP: [
      { id: 'ahmad', name: 'Ahmad VI', party: 'ZMP', desc: 'Social monarchist. +6% ZMP across all groups.' }
    ],
    IIA: [
      { id: 'bojkanic', name: 'Bojkanic',           party: 'IIA', desc: 'Unity candidate. +3% ZMP, +3% ZPF.' },
      { id: 'iia_tech', name: 'IIA Tech Candidate', party: 'IIA', desc: 'Technocrat. +9% IIA, +4% Red.' }
    ],
    RED: [
      { id: 'richter', name: 'Karl Richter', party: 'RED', desc: 'Red Front candidate. +6% Red, +3% ZMP.' }
    ],
    ZPF: [
      { id: 'chen', name: 'Sara Chen', party: 'ZPF', desc: 'Centre candidate. +6% ZPF, +3% ZMP.' }
    ],
    BL: [
      { id: 'mehmedera', name: 'Mehmedera', party: 'BL', desc: 'Black League candidate. +5% BL.' }
    ],
    REPUBLIA: [
      { id: 'muhaga', name: 'Muhaga', party: 'REPUBLIA', desc: 'Stalinist candidate. +5% Republia.' }
    ],
    SPORTICA: [
      { id: 'klaus', name: 'Klaus Schmidt', party: 'SPORTICA', desc: 'Populist candidate. +8% Sportica.' }
    ]
    // PL, SEMP, ZJP, CRNP, FLO, NHP, TIIA cannot run — only endorse or abstain.
  };

  // ============================================================
  // MINISTER POOLS
  // ============================================================
  var AVAILABLE_MINISTERS = {
    zalgrilian: [
      { id: 'ahmad_vi',         name: 'Ahmad VI',          faction: 'zalgrilian', bonus: { unity: 5, faculty: 3 },                desc: 'The legitimate heir. His presence is the argument.' },
      { id: 'aruisti_iii',      name: 'Aruisti III',        faction: 'zalgrilian', bonus: { spirit: 2, momentum: 2 },              desc: 'A visionary of spirit maximalism.' },
      { id: 'rifud_i',          name: 'Rifud I',            faction: 'zalgrilian', bonus: { faculty: 5, unity: 2 },                desc: 'A wise elder statesman. Everyone at the table owes him.' },
      { id: 'ferid_viii',       name: 'Ferid VIII',         faction: 'zalgrilian', bonus: { momentum: 3, unity: 3 },              desc: 'A charismatic orator. Writes his own speeches and remembers them.' },
      { id: 'rifet_ix',         name: 'Rifet IX',           faction: 'zalgrilian', bonus: { spirit: 3, faculty: 2 },              desc: 'A philosopher of the spirit. Speaks as if the monarchy were inevitable.' },
      { id: 'muhaga',           name: 'Muhaga',             faction: 'zalgrilian', bonus: { unity: 4, momentum: 2, faculty: -2 }, desc: 'A former police commissioner. Believes in fewer committees.' },
      { id: 'bennan_the_elder', name: 'Bennan the Elder',   faction: 'zalgrilian', bonus: { momentum: 4, unity: -2, spirit: 2 },  desc: 'A veteran of the street campaigns. Limps from a march in \'27.' },
      { id: 'the_count',        name: 'The Count',          faction: 'zalgrilian', bonus: { affinity: 15, faculty: 4 },             desc: 'A great landowner whose family predates the school. Nobody knows his first name.' }
    ],
    secularists: [
      { id: 'bojkanic',  name: 'Bojkanic',           faction: 'secularists', bonus: { funds: 20, momentum: 2 },              desc: 'A banker turned economist. Keeps the ledger and the coalition.' },
      { id: 'bibovic',   name: 'Bibovic',            faction: 'secularists', bonus: { volunteers: 5, momentum: 3 },          desc: 'A master of organisation. Runs the party from a notebook.' },
      { id: 'ajnurxe',   name: 'Ajnurxe',            faction: 'secularists', bonus: { funds: 15, volunteers: 3 },            desc: 'A tech-savvy innovator. Thinks in systems and slide rules.' },
      { id: 'aisha',     name: 'Aisha',              faction: 'secularists', bonus: { unity: 3, faculty: 5, momentum: 1 },   desc: 'A jurist who catalogued the League\'s first cells. Every blackshirt knows her.' },
      { id: 'bennan',    name: 'Bennan',             faction: 'secularists', bonus: { unity: 4, faculty: 4, affinity: 5 },   desc: 'A lawyer and a liberal. Believes the school can be argued into a republic.' },
      { id: 'the_notary',name: 'The Notary',         faction: 'secularists', bonus: { affinity: 20, unity: 3 },              desc: 'Drafts every agreement and remembers every draft he has burned.' },
      { id: 'jennan_the_younger', name: 'Jennan the Younger', faction: 'secularists', bonus: { volunteers: 6, momentum: 2, affinity: 5 }, desc: 'Runs the canvassing operation above a bakery.' }
    ],
    securro: [
      { id: 'ferid_viii', name: 'Ferid VIII',  faction: 'securro', bonus: { momentum: 3, unity: 3 },              desc: 'Lambach\'s political heir. Will not be pushed.' },
      { id: 'aruisti_iii',name: 'Aruisti III', faction: 'securro', bonus: { unity: 4, faculty: 4, spirit: 1 },   desc: 'A constitutional scholar. Believes a crown needs a council.' },
      { id: 'enes',       name: 'Enes',        faction: 'securro', bonus: { volunteers: 4, momentum: 3 },        desc: 'A young officer from the Legion. Speaks softly.' },
      { id: 'jennan',     name: 'Jennan',      faction: 'securro', bonus: { unity: 5, momentum: 2 },             desc: 'A progressive voice for order. Irritating and necessary.' },
      { id: 'bennan',     name: 'Bennan',      faction: 'securro', bonus: { faculty: 3, unity: 3 },              desc: 'A champion of institutional reform. Writes the briefs.' },
      { id: 'the_marshal',name: 'The Marshal', faction: 'securro', bonus: { unity: 6, momentum: 3, faculty: -3 },desc: 'Commands the Legion. Would rather be drilling.' },
      { id: 'the_legate', name: 'The Legate',  faction: 'securro', bonus: { spirit: 2, faculty: 4, unity: 3 },   desc: 'Speaks for Rome. Not always welcome, never ignorable.' }
    ],
    jihadists: [
      { id: 'ruhaze',   name: 'Ruhaze',   faction: 'jihadists', bonus: { spirit: 3, momentum: 4, unity: -5 }, desc: 'A preacher-organiser. Believes the ballot is a lie.' },
      { id: 'kenji',    name: 'Kenji',    faction: 'jihadists', bonus: { unity: 4, faculty: 4 },              desc: 'A foreign volunteer who stayed. Believes in the coming order.' },
      { id: 'hanna',    name: 'Hanna',    faction: 'jihadists', bonus: { volunteers: 5, momentum: 3 },        desc: 'Runs the recruiting cadres. Was seventeen when she ran her first district.' },
      { id: 'the_faqih',name: 'The Faqih',faction: 'jihadists', bonus: { spirit: 4, faculty: -2, unity: 3 },  desc: 'The party\'s chief jurist. Reads the future in the past.' },
      { id: 'the_mullah',name: 'The Mullah',faction: 'jihadists', bonus: { spirit: 3, unity: 4, momentum: 1 },desc: 'A village cleric who has been to the capital exactly twice.' }
    ]
  };

  // ============================================================
  // MATCH CREATION
  // ============================================================
  function newMatch(config) {
    if (!config || !config.players || config.players.length < 2) {
      console.error('[engine_mp] need 2+ players');
      return null;
    }
    var rng = makeRng(config.seed || Date.now());

    state = {
      week: 1,
      phase: 'campaign',
      rng: rng,
      players: config.players.map(function (p, i) {
        return {
          id: p.id || ('p' + (i+1)),
          factionId: String(p.factionId).toUpperCase(),
          isHuman: p.isHuman !== false,
          isReady: false,
          isConnected: true
        };
      }),
      submittedActions: {},
      log: [],
      finished: false,
      winners: null,
      winReason: null,
      losers: null,

      raw: {},
      shared: {},
      partySupport: {},
      queues: {},

      paramilitaries: null,
      blackLeagueCells: null,
      blWalls: null,
      kingGame: null,

      lastElection: null,
      history: [],

      formation: {
        cycleActive: false,
        rank1: null,
        rank2: null,
        attempts: 0,
        rankedParties: [],
        attemptsByParty: {},
        history: []
      },

      cabinet: null,
      cabinetFormation: null,
      coalitionPartners: [],
      coalitionStability: 80,
      merged: [],

      monarchySympathizers: 0,
      blackLeagueInvestigated: false,
      blackLeagueProsecuted: false,
      blackLeagueBanned: false,

      presidentialCandidates: {},
      presidentialChoiceMade: {},
      lastPresidentialElection: null,
      presidentialStarted: false,
      presidentialPending: null,
      pendingElectionResult: null,
      pendingPresidentialResult: null,

      lastElectionWeekFired: 0,

      congress: {},
      ambitions: {},

      ap: 3,
      funds: 80,
      volunteers: 12,
      momentum: 0,
      faculty: 50,
      unity: 60,
      spirit: 5,
      gates: 5,

      eventDone: {},
      flags: {},
      affinity: {},

      battle1Lost: false,
      battle2Won: false,
      battle2Lost: false,
      battle3Won: false,
      battle3Lost: false,
      battle4Completed: false,
      hasArbeiterAlly: false,
      blSplintered: false,
      gameOver: false,
      blNeutralized: false,
      girlRepublicFormed: false,
      girlRepublicDefeated: false,
      facultyCoupAttempted: false,
      blTakeoverAttempted: false,
      blCollapseTriggered: false,
      blGrowthSlow: 0,
      fightingBlackLeague: false,
      blSabotageLevel: 0,
      defensiveBoost: 0,
      LocalElectionCount: 0,
      LocalElectionBonus: 0,
      _blResolvedSeen: false,
      _presidentialNotes: []
    };

    // Seed raw support from GameData.PARTIES[].base per demographic.
    if (D && D.PARTIES && D.DEMOS) {
      for (var pi = 0; pi < D.PARTIES.length; pi++) {
        var party = D.PARTIES[pi];
        var key = String(party.id).toUpperCase();
        if (state.raw[key]) continue;
        state.raw[key] = {};
        for (var di = 0; di < D.DEMOS.length; di++) {
          var dm = D.DEMOS[di];
          var base = (party.base && party.base[dm.id] !== undefined) ? party.base[dm.id] : 10;
          state.raw[key][dm.id] = base;
        }
      }
    }

    // Canonicalize raw to uppercase keys, then add lowercase aliases
    // pointing at the same sub-objects. Faction modules read lowercase
    // (st.raw.bl, st.raw.iia, st.raw.red, st.raw.rb, st.raw.zmp);
    // the seeding loop writes uppercase. Aliases let both work.
    var upperRaw = {};
    for (var rp in state.raw) {
      var ru = rp.toUpperCase();
      if (!upperRaw[ru]) {
        upperRaw[ru] = state.raw[rp];
      } else {
        for (var rdm in state.raw[rp]) {
          if (upperRaw[ru][rdm] === undefined) upperRaw[ru][rdm] = state.raw[rp][rdm];
        }
      }
    }

    // Ensure every registered faction has a raw block, even ones that
    // aren't in D.PARTIES (RB, and any minor added after normalization).
    for (var regFid in factionModules) {
      if (!upperRaw[regFid]) {
        upperRaw[regFid] = {};
        if (D && D.DEMOS) {
          for (var rdi = 0; rdi < D.DEMOS.length; rdi++) {
            upperRaw[regFid][D.DEMOS[rdi].id] = 10;
          }
        }
      }
    }

    // Add lowercase aliases for every uppercase key. The alias points at
    // the same sub-object, so writes to st.raw.bl are the same writes as
    // st.raw.BL.
    var aliasedRaw = {};
    for (var aliasKey in upperRaw) {
      aliasedRaw[aliasKey] = upperRaw[aliasKey];
      var lowerKey = aliasKey.toLowerCase();
      if (lowerKey !== aliasKey) {
        aliasedRaw[lowerKey] = upperRaw[aliasKey];
      }
    }
    state.raw = aliasedRaw;

    // Seed relations and affinity.
    state.relations = initRelations(state);
    state.affinity = {};
    for (var pid in state.raw) {
      state.affinity[pid] = 50;
    }
    state.affinity.wein = 55;
    state.affinity.ZMP = 100;

    // Initialize player factions.
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      var mod = factionModules[p.factionId];
      if (!mod) {
        console.warn('[engine_mp] no faction module for ' + p.factionId +
                     ' — using generic fallback. Register via EngineMP.registerFaction().');
        factionModules[p.factionId] = makeFallbackFaction(p.factionId);
        mod = factionModules[p.factionId];
      }
      if (typeof mod.initState === 'function') {
        try { mod.initState(state, p.id); }
        catch (e) { console.error('[engine_mp] initState failed for ' + p.factionId, e); }
      }
    }

    // Initialize non-player factions.
    var playerFactionIds = state.players.map(function (p) { return p.factionId; });
    for (var fid in factionModules) {
      if (playerFactionIds.indexOf(fid) !== -1) continue;
      var mod2 = factionModules[fid];
      if (typeof mod2.initState === 'function') {
        try { mod2.initState(state, null); } catch (e) {
          console.error('[engine_mp] initState failed for ' + fid, e);
        }
      }
    }

    // Shared mechanics.
    initParamilitaries(state);
    initBlackLeagueCells(state);
    initBLWalls(state);

    // Advisor trackers — one set per faction.
    for (var pfi = 0; pfi < state.players.length; pfi++) {
      initAdvisorTrackersMP(state, state.players[pfi].factionId);
    }

    // Queues + congress + ambitions for every faction.
    state.queues = {};
    state.congress = {};
    state.ambitions = {};
    for (var fid2 in factionModules) {
      state.queues[fid2] = [];
      state.congress[fid2] = makeDefaultCongress(fid2);
      state.ambitions[fid2] = makeDefaultAmbition(fid2);
    }

    syncPartySupportFromRaw(state);

    state.log.push('Week 1: match begins with ' + state.players.length + ' players.');
    return state;
  }

  function makeRng(seed) {
    var s = seed || (Date.now() % 2147483647) || 12345;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function makeDefaultCongress(factionId) {
    return {
      points: 5,
      policies: {
        education:      { level: 1, max: 5, cost: 2 },
        economy:        { level: 1, max: 5, cost: 2 },
        healthcare:     { level: 1, max: 5, cost: 2 },
        infrastructure: { level: 1, max: 5, cost: 2 },
        justice:        { level: 1, max: 5, cost: 2 },
        technology:     { level: 1, max: 5, cost: 2 },
        arts:           { level: 1, max: 5, cost: 2 },
        sports:         { level: 1, max: 5, cost: 2 }
      },
      history: [],
      activeResolution: null,
      nextCongressWeek: 13
    };
  }

  function makeDefaultAmbition(factionId) {
    return {
      current: null,
      progress: 0,
      completed: [],
      lastRefreshedWeek: 0
    };
  }

  // ============================================================
  // SYNC — raw -> partySupport (flat)
  // ============================================================
  function syncPartySupportFromRaw(st) {
    if (!st.partySupport) st.partySupport = {};
    if (!D || !D.DEMOS) return;

    var canonical = {};

    for (var pid in st.raw) {
      if (st.merged && st.merged.indexOf(pid) !== -1) continue;

      var upper = String(pid).toUpperCase();

      var mod = factionModules[pid] || factionModules[upper];
      var factionManaged = false;
      var value = 0;

      if (mod && st.shared && st.shared[mod.id] && typeof st.shared[mod.id].support === 'number') {
        factionManaged = true;
        value = st.shared[mod.id].support;
      } else {
        var block = st.raw[pid] || {};
        var total = 0, count = 0;
        for (var i = 0; i < D.DEMOS.length; i++) {
          total += block[D.DEMOS[i].id] || 0;
          count++;
        }
        value = count > 0 ? total / count : 0;
      }

      if (canonical[upper] === undefined || factionManaged) {
        canonical[upper] = value;
      }
    }

    st.partySupport = {};
    for (var k in canonical) {
      st.partySupport[k] = canonical[k];
    }
  }

  // ============================================================
  // RELATIONS
  // ============================================================
  function initRelations(st) {
    var relations = {};
    if (D && D.PARTIES) {
      for (var i = 0; i < D.PARTIES.length; i++) {
        var pid = D.PARTIES[i].id;
        var up = String(pid).toUpperCase();
        if (up === 'ZMP' || up === 'OTHER') { relations[pid] = 100; continue; }
        if (up === 'ZPF') relations[pid] = 75;
        else if (up === 'IIA') relations[pid] = 50;
        else if (up === 'PL') relations[pid] = 35;
        else if (up === 'RED') relations[pid] = 45;
        else if (up === 'RB') relations[pid] = 45;
        else if (up === 'REPUBLIA') relations[pid] = 18;
        else if (up === 'SPORTICA') relations[pid] = 30;
        else if (up === 'SEMP') relations[pid] = 20;
        else if (up === 'BL') relations[pid] = 0;
        else if (up === 'TIIA') relations[pid] = 50;
        else relations[pid] = 35;
      }
    }
    relations.wein = 55;
    return relations;
  }

  function decayRelations(st, rng) {
    var notes = [];
    if (!st.relations) return notes;
    for (var pid in st.relations) {
      if (pid === 'bl' || st.merged.indexOf(pid) !== -1) continue;
      var decay = 1 + rng() * 2;
      st.relations[pid] = clamp((st.relations[pid] || 50) - decay, 0, 100);
    }
    if (st.week % 3 === 0) {
      notes.push('📉 Relations with other parties have cooled slightly over time.');
    }
    return notes;
  }

  // ============================================================
  // PARAMILITARY SYSTEM
  // ============================================================
  function initParamilitaries(st) {
    if (st.paramilitaries) return st.paramilitaries;
    st.paramilitaries = {
      dzehurjaca:    { name: 'Dzehurjaca Legion', short: 'Dzehurjaca', icon: '',     members: 100,   training: 8, equipment: 9, morale: 85, loyalty: 90, faction: 'ZMP', isElite: true },
      black_legion:  { name: 'Black Legion',      short: 'Black Legion', icon: '⚫', members: 200,   training: 7, equipment: 6, morale: 80, loyalty: 95, faction: 'BL' },
      iia_guard:     { name: 'IIA Tech Guard',    short: 'IIA Guard',    icon: '💻', members: 150,   training: 4, equipment: 5, morale: 65, loyalty: 70, faction: 'IIA' },
      red_militia:   { name: 'Red Militia',       short: 'Red Militia',  icon: '', members: 400,   training: 2, equipment: 2, morale: 60, loyalty: 75, faction: 'RED' },
      wein_workers:  { name: 'Arbeiter von Wein', short: 'Wein Workers', icon: '🌍', members: 10000, training: 1, equipment: 1, morale: 50, loyalty: 60, faction: 'wein', isForeign: true },
      zpf_defenders: { name: 'ZPF Defenders',     short: 'ZPF Defenders',icon: '⚖️', members: 80,    training: 5, equipment: 4, morale: 70, loyalty: 80, faction: 'ZPF' },
      semp_spirit:   { name: 'SEMP Spirit Warriors', short: 'Spirit Warriors', icon: '✨', members: 60, training: 3, equipment: 3, morale: 90, loyalty: 85, faction: 'SEMP' },
      pl_pep:        { name: 'PL Pep Brigade',    short: 'Pep Brigade',  icon: '🎉', members: 50,    training: 2, equipment: 1, morale: 95, loyalty: 70, faction: 'PL' },
      republia_guard:{ name: 'Republia Guard',   short: 'Republia Guard', icon: '🔵', members: 70,  training: 6, equipment: 5, morale: 75, loyalty: 85, faction: 'REPUBLIA' },
      sportica_athletes:{ name: 'Sportica Athletes', short: 'Sportica Athletes', icon: '🏅', members: 120, training: 3, equipment: 2, morale: 65, loyalty: 60, faction: 'SPORTICA' }
    };
    return st.paramilitaries;
  }

  /* ---------------- Advisor trackers (MP) ----------------
 * Per-faction. Each faction has its own influence / dissident / post map
 * stored under state.shared[FACTION_ID].
 */
function initAdvisorTrackersMP(S, factionId) {
  if (!S.shared) S.shared = {};
  if (!S.shared[factionId]) S.shared[factionId] = {};
  var sh = S.shared[factionId];
  if (sh.factionInfluence && sh.factionDissident && sh.cabinetAdvisors) return;
  sh.factionInfluence = {};
  sh.factionDissident = {};
  var mf = (D && D.MINISTER_FACTIONS) || {};
  for (var id in mf) {
    sh.factionInfluence[id] = mf[id].baseInfluence;
    sh.factionDissident[id] = mf[id].baseDissident;
  }
  sh.cabinetAdvisors = {};
}

function applyAdvisorBonusMP(S, factionId, adv, sign) {
  if (!adv || !adv.bonus) return;
  var sh = S.shared[factionId];
  if (!sh) return;
  var b = adv.bonus;
  if (b.unity)      sh.unity      = clamp((sh.unity      || 60) + b.unity      * sign,   0, 100);
  if (b.faculty)    sh.faculty    = clamp((sh.faculty    || 50) + b.faculty    * sign,   0, 100);
  if (b.momentum)   sh.momentum   = clamp((sh.momentum   ||  0) + b.momentum   * sign, -10, 20);
  if (b.funds)      sh.funds      = Math.max(0, (sh.funds || 0) + b.funds * sign);
  if (b.spirit)     sh.spirit     = clamp((sh.spirit     ||  5) + b.spirit     * sign,   0, 10);
  if (b.gates)      sh.gates      = clamp((sh.gates      ||  5) + b.gates      * sign,   0, 10);
  if (b.volunteers) sh.volunteers = Math.max(0, (sh.volunteers || 0) + b.volunteers * sign);
}

function rotateAdvisorMP(S, factionId, postId, newAdvisorId) {
  if (!S.shared || !S.shared[factionId]) initAdvisorTrackersMP(S, factionId);
  var sh = S.shared[factionId];
  var notes = [];

  var advisors = (D && D.ADVISORS) || [];
  var newAdv = null;
  for (var i = 0; i < advisors.length; i++) {
    if (advisors[i].id === newAdvisorId) { newAdv = advisors[i]; break; }
  }
  if (!newAdv) return { ok: false, msg: 'Unknown advisor.' };

  for (var post in sh.cabinetAdvisors) {
    if (post !== postId && sh.cabinetAdvisors[post] === newAdvisorId) {
      return { ok: false, msg: newAdv.name + ' already holds another post.' };
    }
  }

  var oldId = sh.cabinetAdvisors[postId];
  var oldAdv = null;
  if (oldId) {
    for (var j = 0; j < advisors.length; j++) {
      if (advisors[j].id === oldId) { oldAdv = advisors[j]; break; }
    }
  }
  if (oldAdv && oldAdv.id === newAdv.id) {
    return { ok: false, msg: newAdv.name + ' already holds this post.' };
  }

  if (newAdv.faction && sh.factionInfluence[newAdv.faction] !== undefined) {
    sh.factionInfluence[newAdv.faction] = Math.min(100, sh.factionInfluence[newAdv.faction] + 10);
    sh.factionDissident[newAdv.faction] = Math.max(0, sh.factionDissident[newAdv.faction] - 5);
    notes.push(newAdv.faction + ' influence +10, dissident −5.');
  }
  if (oldAdv && oldAdv.faction && sh.factionInfluence[oldAdv.faction] !== undefined) {
    sh.factionInfluence[oldAdv.faction] = Math.max(0, sh.factionInfluence[oldAdv.faction] - 15);
    sh.factionDissident[oldAdv.faction] = Math.min(100, sh.factionDissident[oldAdv.faction] + 15);
    notes.push(oldAdv.faction + ' influence −15, dissident +15.');
  }

  applyAdvisorBonusMP(S, factionId, oldAdv, -1);
  applyAdvisorBonusMP(S, factionId, newAdv, +1);

  sh.cabinetAdvisors[postId] = newAdv.id;

  S.log.push('Week ' + S.week + ': ' + factionId + ' — ' +
    newAdv.name + ' appointed to ' + postId + '.');
  if (oldAdv) {
    S.log.push('  ' + oldAdv.name + ' relieved of ' + postId + '.');
  }
  return { ok: true, notes: notes, advisor: newAdv, replaced: oldAdv };
}

  function calculateParamilitaryStrength(force) {
    if (!force) return 0;
    var basePower = force.members * ((force.training / 10 + force.equipment / 10) / 2) * (force.morale / 100);
    if (force.isElite) basePower *= 1.5;
    basePower *= (0.8 + force.loyalty / 500);
    return Math.round(basePower);
  }

  // ============================================================
  // BL CELLS / WALLS
  // ============================================================
  function initBlackLeagueCells(st) {
    st.blackLeagueCells = {
      cells: [], maxCells: 6, placementTimer: 0, placementInterval: 4,
      totalCellsPlaced: 0, totalCellsDestroyed: 0, mapRevealed: false, intelligence: 0
    };
  }

  function initBLWalls(st) {
    st.blWalls = { wallsBroken: 0, wallsTotal: 10, prophecyLog: [] };
  }

  function breakWall(trigger) {
    if (!state || !state.blWalls) return { ok: false, msg: 'BL walls not initialized.' };
    var WALLS = [
      { id: 1,  name: 'The First Wall',   trigger: 'denounce' },
      { id: 2,  name: 'The Second Wall',  trigger: 'denounce' },
      { id: 3,  name: 'The Third Wall',   trigger: 'denounce' },
      { id: 4,  name: 'The Fourth Wall',  trigger: 'investigate' },
      { id: 5,  name: 'The Fifth Wall',   trigger: 'investigate' },
      { id: 6,  name: 'The Sixth Wall',   trigger: 'investigate' },
      { id: 7,  name: 'The Seventh Wall', trigger: 'prosecute' },
      { id: 8,  name: 'The Eighth Wall',  trigger: 'prosecute' },
      { id: 9,  name: 'The Ninth Wall',   trigger: 'prosecute' },
      { id: 10, name: 'The Tenth Wall',   trigger: 'ban' }
    ];
    var next = state.blWalls.wallsBroken + 1;
    for (var i = 0; i < WALLS.length; i++) {
      var w = WALLS[i];
      if (w.id === next && w.trigger === trigger) {
        state.blWalls.wallsBroken++;
        state.blWalls.prophecyLog.push(w.name + ' has been broken by the ' + trigger + '.');
        state.log.push('!! ' + w.name + ' has been broken by the ' + trigger + '.');
        return { ok: true, wall: w };
      }
    }
    return { ok: false, msg: 'No matching wall to break at this stage.' };
  }

  // ============================================================
  // EVENT QUEUEING
  // ============================================================
  function pickHandler(ev) {
    if (!ev.handler || ev.handler === 'any') {
      var candidateIds = [];
      for (var i = 0; i < state.players.length; i++) {
        candidateIds.push(state.players[i].factionId);
      }
      var order = sortBySupport(candidateIds.concat(['IIA','RED','ZPF','BL','PL','minor']));
      return order[0] || 'ZMP';
    }
    if (typeof ev.handler === 'string') return ev.handler;
    if (Array.isArray(ev.handler)) {
      var sorted = sortBySupport(ev.handler);
      return sorted[0];
    }
    return 'ZMP';
  }

  function queueEvent(ev) {
    if (!state.queues) state.queues = {};
    var handler = pickHandler(ev);
    if (!state.queues[handler]) state.queues[handler] = [];
    state.queues[handler].push({
      id: ev.id,
      title: ev.title,
      body: ev.body,
      choices: ev.choices,
      defaultChoice: ev.defaultChoice || 0,
      offeredAtWeek: state.week,
      expiresAtWeek: state.week + CFG.eventExpiryWeeks,
      offeredTo: handler,
      handler: ev.handler
    });
    state.log.push('Week ' + state.week + ': event "' + ev.title + '" queued for ' + handler + '.');
  }

  function fireEventsForWeek() {
    var triggered = [];
    if (!D || !D.EVENTS) return triggered;
    for (var i = 0; i < D.EVENTS.length; i++) {
      var ev = D.EVENTS[i];
      if (state.eventDone[ev.id]) continue;
      if (ev.week === state.week) {
        if (ev.condition && !ev.condition(state)) continue;
        queueEvent(ev);
        triggered.push(ev.id);
        continue;
      }
      if (ev.week === -1 && ev.condition && ev.condition(state)) {
        queueEvent(ev);
        triggered.push(ev.id);
      }
    }
    return triggered;
  }

  function acceptEvent(factionId, eventId, choiceIndex) {
    if (!state.queues[factionId]) return { ok: false, msg: 'No queue.' };
    var q = state.queues[factionId];
    var idx = -1;
    for (var i = 0; i < q.length; i++) {
      if (q[i].id === eventId) { idx = i; break; }
    }
    if (idx === -1) return { ok: false, msg: 'Event not in queue.' };
    var ev = q[idx];
    var choice = ev.choices[choiceIndex];
    if (!choice) return { ok: false, msg: 'Invalid choice.' };
    q.splice(idx, 1);
    state.eventDone[eventId] = true;
    state.log.push('Week ' + state.week + ': ' + factionId + ' resolves "' + ev.title + '" — ' + choice.text);
    var notes = applyEffects(state, choice.effects, state.rng);
    return { ok: true, notes: notes, event: ev, choice: choice };
  }

  function passEvent(fromFactionId, eventId) {
    if (!state.queues[fromFactionId]) return { ok: false, msg: 'No queue.' };
    var q = state.queues[fromFactionId];
    var idx = -1;
    for (var i = 0; i < q.length; i++) {
      if (q[i].id === eventId) { idx = i; break; }
    }
    if (idx === -1) return { ok: false, msg: 'Event not in queue.' };
    var ev = q[idx];
    var eligible;
    if (!ev.handler || ev.handler === 'any') {
      eligible = state.players.map(function (p) { return p.factionId; });
      eligible = eligible.concat(['IIA','RED','ZPF','BL','PL','minor']);
    } else if (typeof ev.handler === 'string') {
      eligible = [ev.handler];
    } else {
      eligible = ev.handler.slice();
    }
    eligible = eligible.filter(function (f) { return f !== fromFactionId; });
    if (eligible.length === 0) return { ok: false, msg: 'No other eligible faction.' };
    var sorted = sortBySupport(eligible);
    var next = sorted[0];
    q.splice(idx, 1);
    if (!state.queues[next]) state.queues[next] = [];
    ev.offeredTo = next;
    state.queues[next].push(ev);
    state.log.push('Week ' + state.week + ': ' + fromFactionId + ' passed "' + ev.title + '" to ' + next + '.');
    return { ok: true, to: next };
  }

  function deferEvent(factionId, eventId) {
    if (!state.queues[factionId]) return { ok: false, msg: 'No queue.' };
    var q = state.queues[factionId];
    for (var i = 0; i < q.length; i++) {
      if (q[i].id === eventId) {
        q[i].offeredAtWeek = state.week;
        return { ok: true };
      }
    }
    return { ok: false, msg: 'Event not in queue.' };
  }

  function expireEvents() {
    var all = Object.keys(state.queues);
    for (var i = 0; i < all.length; i++) {
      var fid = all[i];
      var q = state.queues[fid];
      if (!q || q.length === 0) continue;
      var kept = [];
      for (var j = 0; j < q.length; j++) {
        var ev = q[j];
        if (state.week >= ev.expiresAtWeek) {
          var choice = ev.choices[ev.defaultChoice] || ev.choices[0];
          if (choice) {
            state.eventDone[ev.id] = true;
            state.log.push('Week ' + state.week + ': "' + ev.title + '" expired on ' + fid + ' — auto-fired default.');
            applyEffects(state, choice.effects, state.rng);
          }
        } else {
          kept.push(ev);
        }
      }
      state.queues[fid] = kept;
    }
  }

  // ============================================================
  // ELECTION ENGINE
  // ============================================================
  function allocateSeats(totals) {
    var eligible = {}, sum = 0;
    var threshold = (D && D.THRESHOLD) ? D.THRESHOLD : 3;
    var seatsTotal = (D && D.SEATS) ? D.SEATS : 45;

    for (var pid in totals) {
      if (pid === 'other') continue;
      if (totals[pid] >= threshold) {
        eligible[pid] = totals[pid];
        sum += totals[pid];
      }
    }
    if (sum === 0) return {};

    var seats = {}, divisors = {};
    for (var pid2 in eligible) { seats[pid2] = 0; divisors[pid2] = 1; }

    for (var s = 0; s < seatsTotal; s++) {
      var best = null, bestQ = -1;
      for (var pid3 in eligible) {
        var q = eligible[pid3] / divisors[pid3];
        if (q > bestQ) { bestQ = q; best = pid3; }
      }
      if (best) {
        seats[best] = (seats[best] || 0) + 1;
        divisors[best] = 2 * seats[best] + 1;
      }
    }
    return seats;
  }

  function current(st) {
    var byDemo = {}, totals = {};
    if (!D || !D.DEMOS || !D.PARTIES) return { byDemo: {}, totals: {}, seats: {} };

    for (var i = 0; i < D.PARTIES.length; i++) {
      var p = D.PARTIES[i];
      if (st.merged.indexOf(p.id) === -1) totals[p.id] = 0;
    }

    for (var di = 0; di < D.DEMOS.length; di++) {
      var dm = D.DEMOS[di];
      var sum = 0;
      for (var j = 0; j < D.PARTIES.length; j++) {
        var p2 = D.PARTIES[j];
        if (st.merged.indexOf(p2.id) === -1) {
          var val = (st.raw[p2.id] && st.raw[p2.id][dm.id] !== undefined) ? st.raw[p2.id][dm.id] : 0;
          sum += Math.max(0.01, val);
        }
      }
      byDemo[dm.id] = {};
      for (var k = 0; k < D.PARTIES.length; k++) {
        var p3 = D.PARTIES[k];
        if (st.merged.indexOf(p3.id) === -1) {
          var val2 = (st.raw[p3.id] && st.raw[p3.id][dm.id] !== undefined) ? st.raw[p3.id][dm.id] : 0;
          var pct = sum > 0 ? (Math.max(0.01, val2) / sum) * 100 : 0;
          byDemo[dm.id][p3.id] = pct;
          totals[p3.id] = (totals[p3.id] || 0) + pct * dm.weight;
        }
      }
    }
    return { byDemo: byDemo, totals: totals, seats: allocateSeats(totals) };
  }

  function snapshot(st, label) {
    var sup = current(st);
    var seats = sup.seats;

    // Faction refuse-election override
    var faction = null;
    if (D && D.FACTIONS) {
      for (var i = 0; i < D.FACTIONS.length; i++) {
        if (D.FACTIONS[i].id === st.faction) { faction = D.FACTIONS[i]; }
      }
    }
    if (faction && faction.canParticipateInElections === false) {
      if (seats.ZMP) seats.ZMP = 0;
      if (sup.totals.ZMP !== undefined) sup.totals.ZMP = 0;
    }

    st.seats = seats;
    var snap = {
      label: label,
      week: st.week,
      totals: sup.totals,
      byDemo: sup.byDemo,
      seats: seats,
      spirit: st.spirit,
      gates: st.gates,
      electionCycle: st.electionCycle || 0,
      coalitionPartners: (st.coalitionPartners || []).slice()
    };
    st.history.push(snap);
    return snap;
  }

  function runElection() {
    var cur = current(state);
    var seats = cur.seats;
    state.seats = seats;
    state.electionCycle = (state.electionCycle || 0) + 1;

    // Build the per-party rows from the current election result.
    var rows = [];
    for (var pid in seats) {
      if (seats[pid] < 1) continue;
      var p = getParty(pid);
      rows.push({
        id: pid,
        short: p ? (p.short || p.tag || pid) : pid,
        color: p ? p.color : '#888',
        seats: seats[pid],
        voteShare: cur.totals[pid] || 0
      });
    }
    rows.sort(function (a, b) { return b.seats - a.seats; });

    var mySeats = seats.ZMP || 0;
    var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;
    var totalSeats = (D && D.SEATS) ? D.SEATS : 45;
    var hasMajority = mySeats >= majority;

    // One-shot card for the UI.
    state.pendingElectionResult = {
      week: state.week,
      rows: rows,
      totalSeats: totalSeats,
      majority: majority,
      zmpSeats: mySeats,
      hasMajority: hasMajority,
      cycle: state.electionCycle
    };

    var notes = [];
    notes.push('═══════════════════════════════════════');
    notes.push('🗳️  ELECTION RESULTS — Week ' + state.week);
    notes.push('═══════════════════════════════════════');
    notes.push('ZMP: ' + mySeats + ' seats (' + Math.round(cur.totals.ZMP || 0) + '%)');

    var sorted = Object.keys(seats).sort(function(a, b) { return (seats[b] || 0) - (seats[a] || 0); });
    for (var i = 0; i < Math.min(6, sorted.length); i++) {
      var pid2 = sorted[i];
      if (pid2 !== 'ZMP' && seats[pid2] > 0) {
        var p2 = getParty(pid2);
        notes.push((p2 ? p2.short : pid2) + ': ' + seats[pid2] + ' seats');
      }
    }

    if (hasMajority) {
      notes.push(' ZMP has a majority. Coalition is stable.');
      state.coalitionStability = Math.min(100, (state.coalitionStability || 80) + 20);
    } else {
      notes.push(' ZMP does not have a majority. Coalition is fragile.');
      state.coalitionStability = Math.max(0, (state.coalitionStability || 80) - 15);
    }
    notes.push('═══════════════════════════════════════');

    state.log.push('Week ' + state.week + ': election held.');
    state.log.push('  ZMP: ' + mySeats + ' seats. ' +
      (hasMajority ? 'Majority!' : 'Coalition needed.'));

    // Start formation cycle, same as before.
    startFormationCycle(seats, majority);
    return notes;
  }

  // ============================================================
  // COALITION FORMATION CYCLE
  // ============================================================
  function seatsOf(partyId) {
  if (!partyId) return 0;
  var upper = String(partyId).toUpperCase();
  var seats = (state.lastElection && state.lastElection.seats)
    ? state.lastElection.seats
    : (state.seats || {});
  return seats[upper] || seats[partyId] || 0;
}

  function startFormationCycle(seats, majority) {
    state.lastElection = {
      week: state.week,
      seats: seats,
      majority: majority
    };

    // Absolute majority?
    var single = null;
    for (var pid in seats) {
      if (seats[pid] >= majority) { single = pid; break; }
    }
    if (single) {
      state.formation.cycleActive = false;
      state.log.push('Week ' + state.week + ': ' + single + ' has absolute majority (' + seats[single] + ' seats).');
      formCabinet(single, []);
      return;
    }

    // Sort parties by seats
    var ranked = [];
    for (var pid2 in seats) {
      if (seats[pid2] >= 1) ranked.push({ id: pid2, seats: seats[pid2] });
    }
    ranked.sort(function (a, b) { return b.seats - a.seats; });

    if (ranked.length < 2) {
      state.log.push('Week ' + state.week + ': only one party with seats — snap election.');
      callSnapElection(state.formation.attempts + 1);
      return;
    }

    state.formation = {
      cycleActive: true,
      rank1: ranked[0].id,
      rank2: ranked[1].id,
      attempts: 0,
      rankedParties: ranked.map(function (r) { return r.id; }),
      attemptsByParty: {},
      history: state.formation.history || []
    };
    state.formation.attemptsByParty[ranked[0].id] = 0;
    state.formation.attemptsByParty[ranked[1].id] = 0;

    state.log.push('Week ' + state.week + ': coalition formation cycle begins. ' +
      'Rank 1 = ' + ranked[0].id + ' (' + ranked[0].seats + '), ' +
      'Rank 2 = ' + ranked[1].id + ' (' + ranked[1].seats + ').');

    queueFormationEvent(ranked[0].id);
  }

    function queueFormationEvent(leaderId) {
    var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;

    var eligible = COALITION_TEMPLATES.filter(function (t) {
      return t.leader === leaderId;
    });

    if (eligible.length === 0) {
      state.log.push('Week ' + state.week + ': ' + leaderId + ' has no coalition templates.');
      failCurrentAttempt(leaderId);
      return;
    }

    var choices = [];
    for (var i = 0; i < eligible.length; i++) {
      var t = eligible[i];
      var total = seatsOf(leaderId);
      for (var j = 0; j < t.partners.length; j++) {
        total += seatsOf(t.partners[j]);
      }
      choices.push({
        templateId: t.id,
        text: t.name,
        note: t.partners.join(' + ') + ' — ' + total + ' seats',
        reachesMajority: total >= majority
      });
    }
    choices.push({
      templateId: '_decline',
      text: 'Decline to form a government',
      note: 'Pass formation to Rank 2.',
      reachesMajority: false
    });

    // Dedicated pending-choice slot — NOT an event.
    state.formation.pending = {
      leaderId: leaderId,
      week: state.week,
      choices: choices,
      expiresAtWeek: state.week + 3
    };
    state.log.push('Week ' + state.week + ': ' + leaderId + ' must choose a coalition.');

    // Non-player leaders decide immediately — no 3-week wait.
    autoResolveFormation(leaderId);
  }

  function attemptFormation(leaderId, templateId) {
    if (!state.formation.cycleActive) return { ok: false, msg: 'No formation cycle active.' };

    if (templateId === '_decline') {
      failCurrentAttempt(leaderId);
      return { ok: true, msg: leaderId + ' declined to form a government.' };
    }

    var template = null;
    for (var i = 0; i < COALITION_TEMPLATES.length; i++) {
      if (COALITION_TEMPLATES[i].id === templateId) template = COALITION_TEMPLATES[i];
    }
    if (!template) return { ok: false, msg: 'Unknown template.' };
    if (template.leader !== leaderId) return { ok: false, msg: 'Not this party\'s template.' };

    var total = seatsOf(leaderId);
    for (var j = 0; j < template.partners.length; j++) {
      total += seatsOf(template.partners[j]);
    }
    var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;
    if (total < majority) {
      state.log.push('Week ' + state.week + ': ' + leaderId + ' tried ' + template.name + ' — only ' + total + ' seats.');
      failCurrentAttempt(leaderId);
      return { ok: true, msg: template.name + ' does not reach majority.' };
    }

    var attemptCount = state.formation.attemptsByParty[leaderId] || 0;
    var threshold = attemptCount === 0 ? 20 : 10;

    var rejections = [];
    for (var k = 0; k < template.partners.length; k++) {
      var partner = template.partners[k];
      var willing = computeWillingness(leaderId, partner);
      state.log.push('  ' + partner + ' willingness: ' + Math.round(willing) + ' (need > ' + threshold + ')');
      if (willing <= threshold) rejections.push(partner);
    }

    state.formation.attemptsByParty[leaderId] = attemptCount + 1;
    state.formation.attempts += 1;

    if (rejections.length > 0) {
      state.log.push('Week ' + state.week + ': ' + template.name + ' rejected by ' + rejections.join(', ') + '.');
      if (attemptCount + 1 >= 2) {
        failCurrentAttempt(leaderId);
      } else {
        queueFormationEvent(leaderId);
      }
      return { ok: true, msg: 'Rejected by ' + rejections.join(', ') + '.' };
    }

    // Success
    state.formation.cycleActive = false;
    state.formation.history.push({
      week: state.week,
      leader: leaderId,
      template: template.id,
      partners: template.partners,
      seats: total
    });
    state.log.push('Week ' + state.week + ': ' + template.name + ' formed! ' + total + ' seats.');
    formCabinet(leaderId, template.partners);
    return { ok: true, msg: template.name + ' formed.' };
  }

  function failCurrentAttempt(leaderId) {
    state.formation.attempts += 1;
    state.formation.history.push({ week: state.week, leader: leaderId, failed: true });
    state.log.push('Week ' + state.week + ': ' + leaderId + ' failed to form a government.');

    if (leaderId === state.formation.rank1) {
      queueFormationEvent(state.formation.rank2);
    } else {
      state.log.push('Week ' + state.week + ': all formation attempts failed — snap election.');
      callSnapElection(state.formation.attempts);
    }
  }

    function pickBestTemplate(leaderId) {
    var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;
    var eligible = COALITION_TEMPLATES.filter(function (t) {
      return t.leader === leaderId;
    });
    if (eligible.length === 0) return null;

    var best = null;
    var bestScore = -Infinity;

    for (var i = 0; i < eligible.length; i++) {
      var t = eligible[i];
      var total = seatsOf(leaderId);
      for (var j = 0; j < t.partners.length; j++) {
        total += seatsOf(t.partners[j]);
      }

      // Must reach majority — no point forming a minority government.
      if (total < majority) continue;

      // Score: willingness of the *least* willing partner (a chain is only
      // as strong as its weakest link), plus a small bonus for more seats.
      var minWilling = Infinity;
      for (var k = 0; k < t.partners.length; k++) {
        var w = computeWillingness(leaderId, t.partners[k]);
        if (w < minWilling) minWilling = w;
      }
      // No-partner template (absolute majority) — treat willingness as high.
      if (t.partners.length === 0) minWilling = 100;

      var score = minWilling + (total - majority) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }

    return best;
  }

  function autoResolveFormation(leaderId) {
    // Player-led: leave the pending choice for the UI.
    var isPlayerFaction = state.players.some(function (pl) {
      return pl.factionId === leaderId;
    });
    if (isPlayerFaction) return { ok: false, msg: 'Player-led formation.' };

    var template = pickBestTemplate(leaderId);
    if (!template) {
      state.log.push('Week ' + state.week + ': ' + leaderId +
        ' has no viable template — declining.');
      state.formation.pending = null;
      failCurrentAttempt(leaderId);
      return { ok: true, declined: true };
    }

    state.formation.pending = null;
    state.log.push('Week ' + state.week + ': ' + leaderId +
      ' (AI) attempts ' + template.name + '.');
    return attemptFormation(leaderId, template.id);
  }

  function callSnapElection(failures) {
    var blGain = Math.min(8, failures * 2);
    var repGain = Math.min(4, failures * 1);
    var spGain = Math.min(2, failures * 0.5);

    // Poll-only bumps. The actual election is deferred to the next normal
    // election week (or whenever startFormationCycle is re-entered), so
    // snap elections don't immediately redraw the seat map.
    if (state.shared) {
      if (state.shared.BL && typeof state.shared.BL.support === 'number') {
        state.shared.BL.support = Math.max(0.5, state.shared.BL.support + blGain);
      }
      if (state.shared.REPUBLIA && typeof state.shared.REPUBLIA.support === 'number') {
        state.shared.REPUBLIA.support = Math.max(0.5, state.shared.REPUBLIA.support + repGain);
      }
      if (state.shared.SPORTICA && typeof state.shared.SPORTICA.support === 'number') {
        state.shared.SPORTICA.support = Math.max(0.5, state.shared.SPORTICA.support + spGain);
      }
    }
    if (D && D.DEMOS && state.raw.bl) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        state.raw.bl[dm.id] = Math.max(0.5, (state.raw.bl[dm.id] || 0) + blGain);
        if (state.raw.republia) state.raw.republia[dm.id] = Math.max(0.5, (state.raw.republia[dm.id] || 0) + repGain);
        if (state.raw.sportica) state.raw.sportica[dm.id] = Math.max(0.5, (state.raw.sportica[dm.id] || 0) + spGain);
      }
    }

    state.log.push('Week ' + state.week + ': snap election averted — BL gains ' + blGain +
      '% in the polls. Republia +' + repGain + ', Sportica +' + spGain + '.');

    // Increment the failure counter so the next cycle knows we've been here.
    state.formation.attempts += 1;

    // Don't run the election. Formation just resets and tries again next week.
    state.formation.cycleActive = false;
    state.formation.pending = null;
  }

  function submitFormationChoice(leaderId, templateId) {
    if (!state.formation || !state.formation.pending) {
      return { ok: false, msg: 'No pending formation.' };
    }
    if (state.formation.pending.leaderId !== leaderId) {
      return { ok: false, msg: 'Not your formation to decide.' };
    }
    state.formation.pending = null;
    return attemptFormation(leaderId, templateId);
  }

  function computeWillingness(leaderId, partnerId) {
    var aff = state.affinity[partnerId] !== undefined ? state.affinity[partnerId] : 50;
    var dist = ideologyDistance(leaderId, partnerId);
    var momentum = (state.momentum || 0) * 0.5;
    return aff - dist * 2.5 + momentum;
  }

  function ideologyDistance(a, b) {
    var axis = {
      'BL': 10, 'SPORTICA': 7,
      'ZPF': 4, 'ZMP': 3, 'IIA': 2,
      'RED': -4, 'RB': -5, 'REPUBLIA': -9,
      'SEMP': 1, 'PL': 2
    };
    var au = String(a).toUpperCase();
    var bu = String(b).toUpperCase();
    var av = axis[au] !== undefined ? axis[au] : 0;
    var bv = axis[bu] !== undefined ? axis[bu] : 0;
    return Math.abs(av - bv);
  }

  // ============================================================
  // CABINET
  // ============================================================
  function formCabinet(leaderId, partners) {
    var leaderSeats = seatsOf(leaderId);
    var partnerSeats = 0;
    for (var i = 0; i < partners.length; i++) {
      partnerSeats += seatsOf(partners[i]);
    }
    var totalSeats = leaderSeats + partnerSeats;
    var totalMinistries = MINISTRY_LIST.length;

    var leaderMinistries = Math.max(2, Math.min(6, Math.round((leaderSeats / totalSeats) * totalMinistries)));
    var remaining = totalMinistries - leaderMinistries;

    var partnerAllocation = {};
    if (partners.length > 0 && remaining > 0) {
      var partnerTotalSeats = partnerSeats;
      for (var j = 0; j < partners.length; j++) {
        var p = partners[j];
        var pSeats = seatsOf(p);
        var share = partnerTotalSeats > 0 ? pSeats / partnerTotalSeats : 0;
        partnerAllocation[p] = Math.max(1, Math.round(share * remaining));
      }
      var sum = 0;
      for (var pid in partnerAllocation) sum += partnerAllocation[pid];
      while (sum > remaining) {
        var maxPid = null, maxSeats = 0;
        for (var pid2 in partnerAllocation) {
          if (partnerAllocation[pid2] > 1 && partnerAllocation[pid2] > maxSeats) {
            maxPid = pid2;
            maxSeats = partnerAllocation[pid2];
          }
        }
        if (maxPid) { partnerAllocation[maxPid]--; sum--; } else break;
      }
    }

    var cabinet = {
      leader: leaderId,
      partners: partners,
      allocation: { leader: leaderMinistries, partners: partnerAllocation },
      ministries: {}
    };

    for (var m = 0; m < MINISTRY_LIST.length; m++) {
      cabinet.ministries[MINISTRY_LIST[m].id] = {
        id: MINISTRY_LIST[m].id,
        name: MINISTRY_LIST[m].name,
        icon: MINISTRY_LIST[m].icon,
        desc: MINISTRY_LIST[m].desc,
        party: null,
        actions: MINISTRY_ACTIONS[MINISTRY_LIST[m].id] || []
      };
    }

    state.cabinet = cabinet;

    var isPlayerFaction = state.players.some(function (pl) { return pl.factionId === leaderId; });
    state.cabinetFormation = {
      leader: leaderId,
      partners: partners,
      allocation: cabinet.allocation,
      pickInProgress: isPlayerFaction,
      pickedMinistries: []
    };

    state.log.push('Week ' + state.week + ': cabinet formation begins. ' +
      leaderId + ' picks ' + leaderMinistries + ' ministries.');

    if (isPlayerFaction) {
      // Player will pick via the cabinet picker. Auto-fill the rest for now
      // so nothing is left unassigned if the player never picks.
      queueMinisterSelectionEvent(leaderId);
    } else {
      autoAssignMinistries(leaderId, partners);
    }
  }

  function queueMinisterSelectionEvent(leaderId) {
    var allocation = state.cabinetFormation.allocation;
    var leaderCount = allocation.leader;

    var choices = MINISTRY_LIST.map(function (m) {
      return { ministryId: m.id, text: m.icon + ' ' + m.name, note: m.desc };
    });

    if (!state.queues[leaderId]) state.queues[leaderId] = [];
    state.queues[leaderId].push({
      id: 'ministers_' + state.week + '_' + leaderId,
      title: '💼 Select Your Ministries',
      body: 'You may pick ' + leaderCount + ' of the eight ministries. Partners will fill the rest.',
      choices: choices,
      isMinisterSelection: true,
      leaderCount: leaderCount,
      offeredAtWeek: state.week,
      expiresAtWeek: state.week + 3,
      offeredTo: leaderId,
      handler: leaderId
    });
  }

  function assignMinistry(leaderId, ministryId) {
    if (!state.cabinetFormation || !state.cabinetFormation.pickInProgress) {
      return { ok: false, msg: 'No pick in progress.' };
    }
    if (state.cabinetFormation.leader !== leaderId) {
      return { ok: false, msg: 'Not your pick.' };
    }
    var ministry = state.cabinet.ministries[ministryId];
    if (!ministry) return { ok: false, msg: 'Unknown ministry.' };
    if (ministry.party) return { ok: false, msg: 'Ministry already assigned.' };

    ministry.party = leaderId;
    state.cabinetFormation.pickedMinistries.push(ministryId);
    state.log.push('Week ' + state.week + ': ' + leaderId + ' takes ' + ministry.name + '.');

    var taken = state.cabinetFormation.pickedMinistries.length;
    if (taken >= state.cabinetFormation.allocation.leader) {
      autoAssignPartners();
      state.cabinetFormation.pickInProgress = false;
      state.log.push('Week ' + state.week + ': cabinet confirmed.');
    }
    return { ok: true, taken: taken };
  }

  function autoAssignMinistries(leaderId, partners) {
    var count = state.cabinetFormation.allocation.leader;
    var filled = 0;
    for (var i = 0; i < MINISTRY_LIST.length && filled < count; i++) {
      var mid = MINISTRY_LIST[i].id;
      if (!state.cabinet.ministries[mid].party) {
        state.cabinet.ministries[mid].party = leaderId;
        filled++;
      }
    }
    autoAssignPartners();
    state.cabinetFormation.pickInProgress = false;
  }

  function autoAssignPartners() {
    var allocation = state.cabinetFormation.allocation.partners;
    var queue = [];
    for (var pid in allocation) {
      for (var i = 0; i < allocation[pid]; i++) queue.push(pid);
    }
    var qIdx = 0;
    for (var j = 0; j < MINISTRY_LIST.length; j++) {
      var mid = MINISTRY_LIST[j].id;
      if (!state.cabinet.ministries[mid].party && qIdx < queue.length) {
        state.cabinet.ministries[mid].party = queue[qIdx++];
      }
    }
  }

  // ============================================================
  // PRESIDENTIAL CYCLE
  // ============================================================
    function startPresidentialCycle() {
    state.presidentialCandidates = {};
    state.presidentialChoiceMade = {};
    state.presidentialPending = {};

    var factions = Object.keys(factionModules);
    for (var i = 0; i < factions.length; i++) {
      var fid = factions[i];
      var pool = PRESIDENTIAL_CANDIDATES[fid] || [];
      var choices = [];

      for (var j = 0; j < pool.length; j++) {
        choices.push({
          candidateId: pool[j].id,
          name: pool[j].name,
          party: pool[j].party,
          text: 'Run ' + pool[j].name,
          note: pool[j].desc,
          isOwn: true
        });
      }

      for (var otherFid in PRESIDENTIAL_CANDIDATES) {
        if (otherFid === fid) continue;
        if (state.merged && state.merged.indexOf(otherFid) !== -1) continue;
        var otherPool = PRESIDENTIAL_CANDIDATES[otherFid];
        for (var k = 0; k < otherPool.length; k++) {
          choices.push({
            candidateId: otherPool[k].id,
            name: otherPool[k].name,
            party: otherPool[k].party,
            text: 'Endorse ' + otherPool[k].name + ' (' + otherPool[k].party + ')',
            note: otherPool[k].desc,
            isOwn: false
          });
        }
      }

      choices.push({
        candidateId: '_abstain',
        text: 'Abstain',
        note: 'Do not participate in the presidential election.',
        isOwn: false
      });

      // Dedupe by candidateId — guards against a party's own pool being
      // re-added via the "other" loop when pools share ids.
      var seen = {};
      var deduped = [];
      for (var c = 0; c < choices.length; c++) {
        var key = choices[c].candidateId + '|' + (choices[c].isOwn ? 'own' : 'other');
        if (seen[key]) continue;
        seen[key] = true;
        deduped.push(choices[c]);
      }

      state.presidentialPending[fid] = {
        week: state.week,
        choices: deduped,
        expiresAtWeek: state.week + 4
      };
    }
    state.log.push('Week ' + state.week + ': presidential election cycle begins.');
  }

  function submitPresidentialChoice(factionId, candidateId) {
    state.presidentialCandidates[factionId] = candidateId;
    state.presidentialChoiceMade[factionId] = true;
    if (state.presidentialPending) delete state.presidentialPending[factionId];
    state.log.push('Week ' + state.week + ': ' + factionId + ' presidential choice: ' + candidateId);
    return { ok: true };
  }

  function resolvePresidentialElection() {
    var allCandidates = {};
    var endorsements = {};
    var totalSupport = 0;

    for (var fid in state.presidentialCandidates) {
      var choice = state.presidentialCandidates[fid];
      if (choice === '_abstain' || !choice) continue;

      var ownPool = PRESIDENTIAL_CANDIDATES[fid] || [];
      var isOwn = ownPool.some(function (c) { return c.id === choice; });
      var support = getSupportOf(fid);
      totalSupport += support;

      if (isOwn) {
        allCandidates[choice] = (allCandidates[choice] || 0) + support;
      } else {
        endorsements[choice] = (endorsements[choice] || 0) + support * 0.6;
      }
    }

    for (var cid in endorsements) {
      if (allCandidates[cid] === undefined) allCandidates[cid] = 0;
      allCandidates[cid] += endorsements[cid];
    }

    var sum = 0;
    for (var c in allCandidates) sum += allCandidates[c];
    var percentages = {};
    if (sum > 0) {
      for (var c2 in allCandidates) percentages[c2] = (allCandidates[c2] / sum) * 100;
    }

    var winner = null, winnerPct = 0;
    for (var c3 in percentages) {
      if (percentages[c3] > winnerPct) {
        winner = c3;
        winnerPct = percentages[c3];
      }
    }

    state.lastPresidentialElection = {
      week: state.week,
      winner: winner,
      candidates: percentages,
      endorsements: endorsements
    };

    state.pendingPresidentialResult = {
      week: state.week,
      winner: winner,
      candidates: percentages,
      endorsements: endorsements,
      totalSupport: totalSupport
    };

    state.log.push('Week ' + state.week + ': presidential election resolved. Winner: ' + (winner || 'none'));

    if (winner && D && D.DEMOS) {
      var effects = {
        'ahmad':     { zmp: 6, unity: 10, momentum: 8 },
        'bojkanic':  { zmp: 3, zpf: 3, unity: 12 },
        'iia_tech':  { iia: 9, red: 4, rb: 4, zmp: 2 },
        'richter':   { red: 6, zmp: 3, faculty: -8 },
        'chen':      { zpf: 6, zmp: 3 },
        'mehmedera': { bl: 5, faculty: -10 },
        'muhaga':    { republia: 5, sportica: 15 },
        'klaus':     { sportica: 8, zmp: 2 }
      };
      var e = effects[winner] || {};
      for (var pid in e) {
        if (pid === 'unity') state.unity = clamp(state.unity + e[pid], 0, 100);
        else if (pid === 'momentum') state.momentum = clamp(state.momentum + e[pid], -10, 20);
        else if (pid === 'faculty') state.faculty = clamp(state.faculty + e[pid], 0, 100);
        else {
          var upperPid = pid.toUpperCase();
          if (state.raw[upperPid]) {
            for (var i = 0; i < D.DEMOS.length; i++) {
              state.raw[upperPid][D.DEMOS[i].id] =
                Math.max(0.5, (state.raw[upperPid][D.DEMOS[i].id] || 0) + e[pid]);
            }
          }
        }
      }
    }
  }

    function pickAiPresidentialChoice(fid) {
    // Own candidates first.
    var ownPool = PRESIDENTIAL_CANDIDATES[fid] || [];
    if (ownPool.length > 0) {
      // Pick the own candidate with the best effect on this faction.
      return ownPool[0].id;
    }

    // No own candidate — endorse the highest-support candidate whose
    // party this AI likes, or abstain if nothing is close.
    var best = null;
    var bestScore = -Infinity;
    for (var otherFid in PRESIDENTIAL_CANDIDATES) {
      if (otherFid === fid) continue;
      if (state.merged && state.merged.indexOf(otherFid) !== -1) continue;
      var aff = (state.affinity && state.affinity[otherFid]) || 50;
      var pool = PRESIDENTIAL_CANDIDATES[otherFid];
      for (var i = 0; i < pool.length; i++) {
        var score = aff + getSupportOf(otherFid);
        if (score > bestScore) {
          bestScore = score;
          best = pool[i].id;
        }
      }
    }

    if (best === null) return '_abstain';
    return best;
  }

  function autoResolveAiPresidentialChoices() {
    if (!state.presidentialPending) return;
    var playerFactionIds = state.players.map(function (p) {
      return String(p.factionId).toUpperCase();
    });
    for (var fid in state.presidentialPending) {
      if (playerFactionIds.indexOf(fid.toUpperCase()) !== -1) continue;
      if (state.presidentialChoiceMade && state.presidentialChoiceMade[fid]) {
        delete state.presidentialPending[fid];
        continue;
      }
      var choice = pickAiPresidentialChoice(fid);
      state.presidentialCandidates[fid] = choice;
      state.presidentialChoiceMade[fid] = true;
      delete state.presidentialPending[fid];
    }
  }

  // ============================================================
  // CONGRESS / AMBITIONS TICK
  // ============================================================
  function tickCongress() {
    for (var fid in state.congress) {
      var c = state.congress[fid];
      if (!c) continue;
      c.points += 1;
      if (state.week % 4 === 0 && !c.activeResolution) {
        c.activeResolution = {
          title: 'Party Resolution ' + state.week,
          desc: 'A debate has opened in the party congress.',
          options: [
            { text: 'Invest in education', effect: { education: 1 }, desc: '+1 education policy' },
            { text: 'Invest in economy',   effect: { economy: 1 },   desc: '+1 economy policy' }
          ]
        };
      }
    }
  }

  function tickAmbitions() {
    for (var fid in state.ambitions) {
      var a = state.ambitions[fid];
      if (!a) continue;
      a.progress += 0.5;
      if (a.progress >= 100 && !a.current) {
        a.completed.push({ week: state.week, faction: fid });
        a.progress = 0;
      }
    }
  }

  // ============================================================
  // SUBMIT / RESOLVE
  // ============================================================
  function submitAction(playerId, action) {
    if (!state || state.finished) return { ok: false, msg: 'No active match.' };
    var p = findPlayer(playerId);
    if (!p) return { ok: false, msg: 'Unknown player.' };
    if (p.isReady) return { ok: false, msg: 'Already ready.' };
    var actionObj = (typeof action === 'string') ? { id: action } : (action || { id: 'wait' });
    state.submittedActions[playerId] = actionObj;
    p.isReady = true;
    state.log.push('Week ' + state.week + ': ' + playerId + ' ready.');
    return { ok: true };
  }

  function allReady() {
    if (!state) return false;
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      if (p.isHuman && !p.isReady) return false;
    }
    return true;
  }

  function getActionsFor(playerId) {
  if (!state) return [];
  var p = findPlayer(playerId);
  if (!p) return [];

  // King standoff replaces normal weekly actions.
  if (state.kingGame && state.kingGame.phase === 'legion_turn') {
    var KM = window.KingMinigame;
    if (!KM) return [];

    if (p.factionId === 'ZMP') {
      return KM.LEGION_ORDERS.map(function (o) {
        return { id: 'king_order', orderId: o.id, name: o.name, desc: o.desc };
      });
    }
    if (p.factionId === 'BL') {
      return KM.CROWD_ORDERS.map(function (o) {
        return { id: 'king_order', orderId: o.id, name: o.name, desc: o.desc };
      });
    }
    return [{ id: 'wait', name: 'Wait', desc: 'The standoff plays out without you.' }];
  }

  var mod = factionModules[p.factionId];
  if (!mod || typeof mod.availableActions !== 'function') {
    return [{ id: 'wait', name: 'Wait', desc: 'Skip this week.' }];
  }
  try {
    var acts = mod.availableActions(state, playerId) || [];
    if (acts.length === 0) {
      return [{ id: 'wait', name: 'Wait', desc: 'No actions available.' }];
    }
    return acts;
  } catch (e) {
    console.error('[engine_mp] availableActions failed for ' + p.factionId, e);
    return [{ id: 'wait', name: 'Wait', desc: 'Action error — skipping.' }];
  }
}

  function resolveWeek() {
    if (!state || state.finished) return { ok: false, msg: 'No active match.' };
    if (!allReady()) return { ok: false, msg: 'Not all players ready.' };

    var notes = [];

      // 0. King standoff — resolve one beat, then skip normal actions.
  var kingResolved = false;
  if (state.kingGame && state.kingGame.phase === 'legion_turn') {
    var KM = window.KingMinigame;
    if (KM) {
      var zmpOrder = null, blOrder = null;
      for (var pi = 0; pi < state.players.length; pi++) {
        var pp = state.players[pi];
        var pa = state.submittedActions[pp.id];
        if (!pa || pa.id !== 'king_order') continue;
        if (pp.factionId === 'ZMP') zmpOrder = pa.orderId;
        else if (pp.factionId === 'BL') blOrder = pa.orderId;
      }
      if (!zmpOrder) zmpOrder = 'hold';
      if (!blOrder)  blOrder  = KM.pickCrowdOrder(state.kingGame, state.rng);

      var kr = KM.resolveTurn(state.kingGame, zmpOrder, blOrder, state.rng);
      notes.push('King standoff — ZMP: ' + zmpOrder + ' · BL: ' + blOrder);

      if (kr.ended) {
        applyKingEnding(state.kingGame.result);
        state.kingGame = null;
      }
      kingResolved = true;
    }
  }

    // 1. Player actions
    if (!kingResolved) {
      for (var i = 0; i < state.players.length; i++) {
        var p = state.players[i];
        var mod = factionModules[p.factionId];
        var action = state.submittedActions[p.id] || null;
        if (mod && typeof mod.applyAction === 'function') {
          try { mod.applyAction(state, p.id, action); }
          catch (e) { console.error('[engine_mp] applyAction failed for ' + p.factionId, e); }
        }
      }
    }

    // 2. Player factions tick
    for (var j = 0; j < state.players.length; j++) {
      var p2 = state.players[j];
      var mod2 = factionModules[p2.factionId];
      if (mod2 && typeof mod2.tickWeek === 'function') {
        try { mod2.tickWeek(state, p2.id); } catch (e) {}
      }
    }

    // 2b. Non-player factions tick
    var playerFactionIds = state.players.map(function (p) { return p.factionId; });
    for (var fid in factionModules) {
      if (playerFactionIds.indexOf(fid) !== -1) continue;
      var modX = factionModules[fid];
      if (modX && typeof modX.tickWeek === 'function') {
        try { modX.tickWeek(state, null); } catch (e) {}
      }
    }

    // 2d. Mirror faction shared support back into raw so elections see it.
    //     Blend rather than overwrite so applyEffects' demographic tweaks
    //     still land.
    for (var mfid in factionModules) {
      if (!state.shared || !state.shared[mfid]) continue;
      var sharedSupport = state.shared[mfid].support;
      if (typeof sharedSupport !== 'number') continue;
      if (!state.raw[mfid]) state.raw[mfid] = {};
      if (D && D.DEMOS) {
        for (var mdi = 0; mdi < D.DEMOS.length; mdi++) {
          var mdm = D.DEMOS[mdi];
          var currentRaw = state.raw[mfid][mdm.id] || 0;
          state.raw[mfid][mdm.id] = currentRaw * 0.4 + sharedSupport * 0.6;
        }
      }
    }

    // 2c. Force BL-initiated battles to resolve this week
    notes = notes.concat(resolvePendingBattles());

    // 3. Shared mechanics tick
    notes = notes.concat(tickSharedMechanics());

    // 3b. Congress + ambitions
    tickCongress();
    tickAmbitions();

    // 4. Sync raw -> flat
    syncPartySupportFromRaw(state);

    // 5. Advance week
    state.week += 1;
    state.submittedActions = {};
    for (var k = 0; k < state.players.length; k++) state.players[k].isReady = false;

    // 5b. Refill AP and clear the weekly ministry-action flag.
    for (var apFid in state.shared) {
      if (!state.shared[apFid]) continue;
      if (typeof state.shared[apFid].ap === 'number') {
        state.shared[apFid].ap = 3;
      }
      state.shared[apFid].ministryActionUsedThisWeek = false;
    }

    // 6. Elections — track last fired election so a skipped week doesn't lose one.
    if (state.lastElectionWeekFired === undefined) state.lastElectionWeekFired = 0;
    for (var ei = 0; ei < CFG.electionWeeks.length; ei++) {
      var ew = CFG.electionWeeks[ei];
      if (ew > state.lastElectionWeekFired && state.week >= ew) {
        var electionNotes = runElection();
        notes = notes.concat(electionNotes);
        state.lastElectionWeekFired = ew;
        break;   // one election per tick
      }
    }

    // 6b. Presidential cycle — fire when crossing week 10.
    if (!state.presidentialStarted && state.week >= 10) {
      startPresidentialCycle();
      state.presidentialStarted = true;
      state.presidentialMinResolveWeek = state.week + 4;
    }
    if (state.presidentialPending) {
      // AI factions decide immediately, every tick, until they are gone.
      autoResolveAiPresidentialChoices();

      // Expire any non-chooser that has hit the deadline.
      for (var pfid in state.presidentialPending) {
        var pp = state.presidentialPending[pfid];
        if (state.week >= pp.expiresAtWeek) {
          state.presidentialCandidates[pfid] = '_abstain';
          state.presidentialChoiceMade[pfid] = true;
          delete state.presidentialPending[pfid];
        }
      }

      // Resolve only after the full player window has elapsed AND no
      // pending entries remain. This prevents premature resolution if a
      // player entry is ever dropped for another reason.
      var minWeek = state.presidentialMinResolveWeek || 0;
      if (state.week >= minWeek &&
          Object.keys(state.presidentialPending).length === 0) {
        resolvePresidentialElection();
        state.presidentialPending = null;
      }
    }

    // 6c. Formation pending — auto-resolve AI leaders, expire player leaders.
    if (state.formation && state.formation.pending) {
      var fpl = state.formation.pending.leaderId;
      var fplIsPlayer = state.players.some(function (pl) {
        return pl.factionId === fpl;
      });
      if (!fplIsPlayer) {
        autoResolveFormation(fpl);
      } else if (state.week >= state.formation.pending.expiresAtWeek) {
        state.formation.pending = null;
        state.log.push('Week ' + state.week + ': ' + fpl + ' missed the formation deadline.');
        failCurrentAttempt(fpl);
      }
    }

    // 6d. Cabinet pick deadline — auto-fill if the player never picked.
    if (state.cabinetFormation && state.cabinetFormation.pickInProgress) {
      var cfl = state.cabinetFormation.leader;
      var cflIsPlayer = state.players.some(function (pl) { return pl.factionId === cfl; });
      if (cflIsPlayer) {
        // Give the player until 3 weeks after the formation completes.
        if (!state.cabinetFormation.deadline) {
          state.cabinetFormation.deadline = state.week + 3;
        }
        if (state.week >= state.cabinetFormation.deadline) {
          autoAssignMinistries(cfl, state.cabinetFormation.partners);
          state.cabinetFormation.pickInProgress = false;
          state.log.push('Week ' + state.week + ': cabinet auto-filled (deadline reached).');
        }
      }
    }

    // 7. Fire events for this week
    fireEventsForWeek();

    // 8. Expire old events
    expireEvents();

    // 9. Victory check
    checkAllVictory();

    state.log.push('Week ' + (state.week - 1) + ': resolved.');
    return { ok: true, week: state.week, notes: notes };
  }

  function tickSharedMechanics() {
    var notes = [];
    if (state.paramilitaries) {
      for (var key in state.paramilitaries) {
        var f = state.paramilitaries[key];
        if (f.isForeign) continue;
        f.morale = Math.max(20, f.morale - 0.5);
      }
    }
    return notes;
  }

    function resolvePendingBattles() {
    var notes = [];
    if (!state) return notes;

    var schedule = [
      { week: 12, done: 'battle1Resolved',   fn: resolveBattle,  def: 'help_iia' },
      { week: 30, done: 'battle2Resolved',   fn: resolveBattle2, def: 'help_iia' },
      { week: 48, done: 'battle3Resolved',   fn: resolveBattle3, def: 'call_allies' },
      { week: 66, done: 'battle4Resolved',   fn: resolveBattle4, def: 'finish_them' }
    ];

    for (var i = 0; i < schedule.length; i++) {
      var s = schedule[i];
      if (state.week !== s.week) continue;
      if (state.flags[s.done]) continue;
      if (state.blSplintered || state.blNeutralized) continue;

      var choice = (state.pendingBattleChoice && state.pendingBattleChoice[s.done])
        ? state.pendingBattleChoice[s.done]
        : s.def;

      var r = s.fn(state, choice, state.rng);
      notes = notes.concat(r);
      state.flags[s.done] = true;
      state.log.push('Week ' + state.week + ': BL-initiated battle resolved — ' + choice);
    }
    return notes;
  }

  function setBattleChoice(key, choice) {
    if (!state) return { ok: false, msg: 'No match.' };
    if (!state.pendingBattleChoice) state.pendingBattleChoice = {};
    state.pendingBattleChoice[key] = choice;
    return { ok: true };
  }

  // ============================================================
  // VICTORY CHECK
  // ============================================================
  function checkAllVictory() {
    if (state.finished) return;
    var winners = [];
    var losers = [];
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      var mod = factionModules[p.factionId];
      if (!mod) continue;
      try {
        if (typeof mod.checkVictory === 'function' && mod.checkVictory(state, p.id)) winners.push(p.id);
        if (typeof mod.checkDefeat === 'function' && mod.checkDefeat(state, p.id)) losers.push(p.id);
      } catch (e) {}
    }
    if (state.finished) return;
    if (losers.length > 0) {
      state.finished = true;
      state.winReason = 'defeat';
      state.losers = losers;
      state.winners = state.players.map(function (x) { return x.id; }).filter(function (id) { return losers.indexOf(id) === -1; });
      state.log.push('Week ' + state.week + ': defeat. Losers: ' + losers.join(', '));
      return;
    }
    if (winners.length > 0) {
      state.finished = true;
      state.winReason = 'victory';
      state.winners = winners;
      state.log.push('Week ' + state.week + ': victory. Winners: ' + winners.join(', '));
      return;
    }
    if (state.week > CFG.totalWeeks) {
      state.finished = true;
      state.winReason = 'timeout';
      state.log.push('Week ' + state.week + ': week limit reached.');
    }
  }

  // ============================================================
  // DISCONNECT / FORFEIT
  // ============================================================
  function markDisconnected(playerId) {
    var p = findPlayer(playerId);
    if (!p) return;
    p.isConnected = false;
    state.log.push('Week ' + state.week + ': ' + playerId + ' disconnected.');
    setTimeout(function () {
      if (!p.isConnected && state && !state.finished) {
        state.finished = true;
        state.winReason = 'forfeit';
        state.winners = state.players
          .filter(function (x) { return x.isConnected && x.id !== playerId; })
          .map(function (x) { return x.id; });
        state.losers = [playerId];
      }
    }, CFG.forfeitTimeout * 1000);
  }

  function markReconnected(playerId) {
    var p = findPlayer(playerId);
    if (!p) return;
    p.isConnected = true;
    state.log.push('Week ' + state.week + ': ' + playerId + ' reconnected.');
  }

  // ============================================================
  // VISIBILITY
  // ============================================================
    function getVisibleStateFor(playerId) {
    if (!state) return null;
    var p = findPlayer(playerId);
    if (!p) return null;
    var mod = factionModules[p.factionId];
    if (!mod) return null;
    var vis = mod.getVisibleState(state, playerId);

    vis.paramilitaries = state.paramilitaries;
    vis.blackLeagueCells = state.blackLeagueCells;
    vis.blWalls = state.blWalls;
    vis.lastElection = state.lastElection;
    vis.queues = state.queues;
    vis.myQueue = state.queues[p.factionId] || [];
    vis.cabinet = state.cabinet;
    vis.cabinetFormation = state.cabinetFormation;
    vis.formation = state.formation;
    vis.formationPending = state.formation ? state.formation.pending : null;
    vis.lastPresidentialElection = state.lastPresidentialElection;
    vis.presidentialCandidates = state.presidentialCandidates;
    vis.presidentialPending = state.presidentialPending || null;
    vis.congress = state.congress[p.factionId] || null;
    vis.ambitions = state.ambitions;

    vis.allPartySupport = {};
    for (var pid in state.partySupport) {
      if (state.merged && state.merged.indexOf(pid) !== -1) continue;
      vis.allPartySupport[pid] = state.partySupport[pid];
    }

    return vis;
  }

  // ============================================================
  // EXPORTS
  // ============================================================

  function applyEffects(st, eff, rng) {
    var notes = [];
    if (!eff) return notes;

    if (eff.demo) {
      if (!st.raw.ZMP) st.raw.ZMP = {};
      for (var dm in eff.demo) {
        if (eff.demo.hasOwnProperty(dm)) {
          st.raw.ZMP[dm] = Math.max(0.5, (st.raw.ZMP[dm] || 0) + eff.demo[dm]);
        }
      }
    }

    if (eff.party) {
      for (var pid in eff.party) {
        if (!eff.party.hasOwnProperty(pid)) continue;
        var pidUp = pid.toUpperCase();
        if (!st.raw[pid] && st.raw[pidUp]) st.raw[pid] = st.raw[pidUp];
        if (!st.raw[pid]) {
          st.raw[pid] = {};
          if (D && D.DEMOS) {
            for (var pdi = 0; pdi < D.DEMOS.length; pdi++) {
              st.raw[pid][D.DEMOS[pdi].id] = 10;
            }
          }
        }
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm2 = D.DEMOS[i];
            st.raw[pid][dm2.id] = Math.max(0.5, (st.raw[pid][dm2.id] || 0) + eff.party[pid] * 0.6);
          }
        }
      }
    }

    if (eff.affinity) {
      for (var pid2 in eff.affinity) {
        if (eff.affinity.hasOwnProperty(pid2)) {
          st.affinity[pid2] = clamp((st.affinity[pid2] || 50) + eff.affinity[pid2], 0, 100);
        }
      }
    }

    if (typeof eff.unity     === 'number') st.unity     = clamp(st.unity + eff.unity, 0, 100);
    if (typeof eff.faculty   === 'number') st.faculty   = clamp(st.faculty + eff.faculty, 0, 100);
    if (typeof eff.momentum  === 'number') st.momentum  = clamp(st.momentum + eff.momentum, -10, 20);
    if (typeof eff.funds     === 'number') st.funds     = Math.max(0, st.funds + eff.funds);
    if (typeof eff.vol       === 'number') st.volunteers = Math.max(0, st.volunteers + eff.vol);
    if (typeof eff.spirit    === 'number') st.spirit    = clamp(st.spirit + eff.spirit, 0, 10);
    if (typeof eff.gates     === 'number') st.gates     = clamp(st.gates + eff.gates, 0, 10);

    // Ministry / cabinet
    if (eff.monarchySympathizers) {
      st.monarchySympathizers = (st.monarchySympathizers || 0) + eff.monarchySympathizers;
    }
    if (eff.investigate_bl) { st.blackLeagueInvestigated = true; }
    if (eff.prosecute_bl)   { st.blackLeagueProsecuted = true; }
    if (eff.banSplinters)   { st.blackLeagueBanned = true; }
    if (eff.dismantleBL) {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm3 = D.DEMOS[i];
          st.raw.bl[dm3.id] = 0.5;
          if (st.raw.crnp) st.raw.crnp[dm3.id] = 0.5;
          if (st.raw.flo)  st.raw.flo[dm3.id]  = 0.5;
          if (st.raw.nhp)  st.raw.nhp[dm3.id]  = 0.5;
        }
      }
      st.blSplintered = true;
      st.blSplinterReleaseTriggered = true;
    }

    if (eff.blGrowthSlow) {
      st.blGrowthSlow = (st.blGrowthSlow || 0) + eff.blGrowthSlow;
    }

    // --- RO16 CONGRESS LOGIC ---
    if (eff.ro16Congress) {
      st.flags.ro16CongressDone = true;
      var redSupport = getPartySupport(st, 'red');
      
      if (redSupport > 4) {
        st.flags.ro16RedAffiliated = true;
        st.flags.ro16CongressWeek = st.week;
        st.pendingEvent = {
          id: 'ro16_congress_red',
          week: st.week,
          title: 'The Red Front Intervenes',
          body: 'The Red Front has intervened in the RO16 Congress! Their influence ensures the current leader stays in power. The RO16 is now deeply affiliated with the Red Front. In 3 weeks, they will formally merge.',
          choices: [{ text: 'The revolution is inevitable.', note: '' }]
        };
        notes.push('The Red Front intervened. RO16 is now Red-affiliated.');
      } else {
        st.pendingEvent = {
          id: 'ro16_congress_fail',
          week: st.week,
          title: 'The Congress Descends into Violence',
          body: 'Without Red Front intervention, the leader purges his rivals and stays in power. The RO16 becomes violently radicalized. The Surman Theory is about to be tested.',
          choices: [{ text: 'The Republicans must act.', note: '' }]
        };
        notes.push('RO16 has radicalized. The Surman Theory approaches.');
      }
    }

    if (eff.surmanTheory) {
      st.flags.surmanTheoryDone = true;
      var repBloc = getPartySupport(st, 'iia') + getPartySupport(st, 'red') + getPartySupport(st, 'rb') + getPartySupport(st, 'pl');
      
      if (repBloc > 25) {
        st.flags.ro16Faded = true;
        st.flags.redListFormed = true;
        st.electoralLists['red'] = 'red_list';
        st.electoralLists['rb'] = 'red_list';
        st.electoralLists['ro16'] = 'red_list';
        
        if (D && D.PARTIES) {
          if (!D.PARTIES.find(function(p) { return p.id === 'red_list'; })) {
            D.PARTIES.push({ id: 'red_list', name: 'Red List', short: 'Red List', tag: 'Red', color: '#991b1b', spirit: 8, gates: 1, coalition: 50, base: {} });
          }
        }
        st.pendingEvent = {
          id: 'surman_theory_pass',
          week: st.week,
          title: 'The Surman Theory Holds',
          body: 'The Republican parties have surpassed 25%. The RO16 is crushed by the sheer weight of the Republican bloc. They fade into irrelevance, but form a radical Red List with the Red Front and Red Bench (50% Red, 45% RB, 5% RO16) to survive.',
          choices: [{ text: 'The Republicans rule.', note: '' }]
        };
        notes.push('The Surman Theory holds. The Red List is formed.');
      } else {
        st.pendingEvent = {
          id: 'surman_theory_fail',
          week: st.week,
          title: 'The Surman Theory Fails',
          body: 'The Republican bloc is too weak (under 25%). The RO16 survives and prepares for revolution.',
          choices: [{ text: 'The revolution is coming.', note: '' }]
        };
        notes.push('The Surman Theory fails. RO16 prepares for revolution.');
      }
    }

    if (eff.ro16Revolt) {
      st.flags.ro16RevoltTriggered = true;
      var dzStrength = st.paramilitaries.dzehurjaca ? calculateParamilitaryStrength(st.paramilitaries.dzehurjaca) : 0;
      var ro16Strength = getPartySupport(st, 'ro16') * 10; 
      
      if (eff.ro16Revolt === 'support') {
        if (dzStrength > ro16Strength) {
          st.flags.ro16RevoltWon = true;
          notes.push('The RO16 revolution succeeds with Dzehurjaca support!');
          st.endingData = {
            ending: 'socialist_utopia',
            title: 'The Socialist Utopia',
            subtitle: 'The revolution of \'16 finally succeeds.',
            endingNumber: 'Ending 70',
            body: 'The RO16, backed by the Dzehurjaca Legion, has seized the school. The old parties are dissolved. A single socialist vanguard now rules.',
            story: 'The revolution was bloody. The Republicans fought hard, but the Dzehurjaca Legion broke their lines. The ZMP, Red Front, Red Bench, and RO16 have merged into a single all-powerful party. Only minor bloc parties remain as a token opposition. The dictatorship of the proletariat has begun.',
            epilogue: 'The school is now a socialist utopia. The revolution of 1916 has finally won.'
          };
          st.finished = true;
        } else {
          notes.push('The RO16 revolution fails despite Dzehurjaca support!');
          st.flags.ro16RevoltWon = false;
          applyEffects(st, { demo: { buskids: 5, freshmen: 5 }, momentum: -5 }, rng);
        }
      } else if (eff.ro16Revolt === 'crush') {
         notes.push('You crush the revolution. The Republicans are boosted.');
         st.flags.ro16Faded = true;
         st.flags.ro16RevoltWon = false;
         if (D && D.DEMOS) {
           for (var i = 0; i < D.DEMOS.length; i++) {
             var dm = D.DEMOS[i].id;
             if (st.raw.iia) st.raw.iia[dm] = Math.max(0.5, (st.raw.iia[dm] || 0) + 2);
             if (st.raw.red) st.raw.red[dm] = Math.max(0.5, (st.raw.red[dm] || 0) + 2);
             if (st.raw.rb) st.raw.rb[dm] = Math.max(0.5, (st.raw.rb[dm] || 0) + 2);
             if (st.raw.pl) st.raw.pl[dm] = Math.max(0.5, (st.raw.pl[dm] || 0) + 2);
             if (st.raw.ZMP) st.raw.ZMP[dm] = Math.max(0.5, (st.raw.ZMP[dm] || 0) + 1);
           }
         }
      } else {
         // Stand aside
         if (ro16Strength > 30) {
            notes.push('The revolution succeeds without your help. A socialist state is formed.');
            st.finished = true;
            st.endingData = {
              ending: 'socialist_utopia',
              title: 'The Socialist Utopia',
              subtitle: 'The revolution of \'16 finally succeeds.',
              endingNumber: 'Ending 70',
              body: 'The RO16 has seized the school. The old parties are dissolved.',
              story: 'You stood aside and watched the school fall to the revolutionaries.',
              epilogue: 'The school is now a socialist utopia.'
            };
         } else {
            notes.push('The revolution fails without your help. The Republicans crush them.');
            st.flags.ro16Faded = true;
            if (D && D.DEMOS) {
              for (var i = 0; i < D.DEMOS.length; i++) {
                var dm = D.DEMOS[i].id;
                if (st.raw.iia) st.raw.iia[dm] = Math.max(0.5, (st.raw.iia[dm] || 0) + 3);
                if (st.raw.red) st.raw.red[dm] = Math.max(0.5, (st.raw.red[dm] || 0) + 3);
              }
            }
         }
      }
    }

    if (eff.iiaCongressJoinZMP) {
      notes = notes.concat(doMerge(st, 'iia'));
      st.affinity.iia = 100;
      notes.push('The IIA formally joins the ZMP coalition!');
    }
    if (eff.iiaCongressAlly) {
      st.affinity.iia = 100;
      if (st.coalitionPartners && st.coalitionPartners.indexOf('iia') === -1) {
        st.coalitionPartners.push('iia');
      }
      notes.push('The IIA stands as a permanent, loyal ally.');
    }

    // Battles
    if (eff.battle)  notes = notes.concat(resolveBattle(st, eff.battle, rng));
    if (eff.battle2) notes = notes.concat(resolveBattle2(st, eff.battle2, rng));
    if (eff.battle3) notes = notes.concat(resolveBattle3(st, eff.battle3, rng));
    if (eff.battle4) notes = notes.concat(resolveBattle4(st, eff.battle4, rng));

    // BL events
    if (eff.blUltimatum)  notes = notes.concat(resolveBLUltimatum(st, eff.blUltimatum, rng));
    if (eff.blRising)     notes = notes.concat(resolveBLRisingTide(st, eff.blRising, rng));
    if (eff.blPropaganda) notes = notes.concat(resolveBLPropaganda(st, eff.blPropaganda, rng));
    if (eff.blCollapse)   notes = notes.concat(resolveBLCollapse(st, eff.blCollapse, rng));
    if (eff.blFall)       notes = notes.concat(resolveBLFall(st, eff.blFall, rng));
    if (eff.fascistDanger) notes = notes.concat(resolveFascistDanger(st, eff.fascistDanger, rng));

    // Resurgence / release
    if (eff.partyResurgence)  notes = notes.concat(resolvePartyResurgence(st, eff.partyResurgence, rng));
    if (eff.releasedParties)  notes = notes.concat(resolveReleasedParties(st, eff.releasedParties, rng));
    if (eff.releasedSurge)    notes = notes.concat(resolveReleasedSurge(st, eff.releasedSurge, rng));
    if (eff.releasedVictory)  notes = notes.concat(resolveReleasedVictory(st, eff.releasedVictory, rng));

    // Rubicon
    if (eff.rubiconState)        notes = notes.concat(resolveRubiconActivation(st, eff.rubiconState, rng));
    if (eff.rubiconPopularFront) notes = notes.concat(resolveRubiconPopularFront(st, eff.rubiconPopularFront, rng));
    if (eff.rubiconSurge)        notes = notes.concat(resolveRubiconSurge(st, eff.rubiconSurge, rng));
    if (eff.rubiconBetrayal)     notes = notes.concat(resolveRubiconBetrayal(st, eff.rubiconBetrayal, rng));
    if (eff.rubiconLastStand)    notes = notes.concat(resolveRubiconLastStand(st, eff.rubiconLastStand, rng));
    if (eff.rubiconVictory)      notes = notes.concat(resolveRubiconVictory(st, eff.rubiconVictory, rng));
    if (eff.rubiconDefeat)       notes = notes.concat(resolveRubiconDefeat(st, eff.rubiconDefeat, rng));

    // Legislature
    if (eff.legislatureVote) notes = notes.concat(resolveLegislatureVote(st, eff.legislatureVote, rng));

    // Misc
    if (eff.LocalElection)          notes = notes.concat(resolveLocalElection(st, eff.LocalElection, rng));
    if (eff.debateOfSudWest)            notes = notes.concat(resolvedebateOfSudWest(st, eff.debateOfSudWest, rng));
    if (eff.intellectualResistance) notes = notes.concat(resolveIntellectualResistance(st, eff.intellectualResistance, rng));
    if (eff.allianceDemocracies)    notes = notes.concat(resolveAllianceDemocracies(st, eff.allianceDemocracies, rng));
    if (eff.fallOfCenter)           notes = notes.concat(resolveFallOfCenter(st, eff.fallOfCenter, rng));
    if (eff.debate)                 notes = notes.concat(runDebate(st, eff.debate, rng));
    if (eff.presidentialSdahh)      notes = notes.concat(resolvePresidentialSdahh(st, eff.presidentialSdahh, rng));
    if (eff.presidentialResultsSdahh) {
      // Real resolution happens in resolvePresidentialElection()
      notes.push('Presidential election results are being counted.');
    }

    if (eff.merge) {
      notes = notes.concat(doMerge(st, eff.merge));
    }
    if (eff.negotiateMerge) {
      var npid = eff.negotiateMerge;
      var chance = 0.3 + ((st.affinity[npid] || 0) / 220) + ((st.momentum || 0) / 60);
      if (rng() < chance) {
        notes.push('She accepts your terms.');
        notes = notes.concat(doMerge(st, npid));
        st.unity = clamp(st.unity - 4, 0, 100);
      } else {
        notes.push('She walks out.');
        st.affinity[npid] = clamp((st.affinity[npid] || 50) - 20, 0, 100);
        notes = notes.concat(applyEffects(st, { party: { semp: 4 } }, rng));
      }
    }

    if (eff.gamble === 'blame_bl') {
      if (rng() < 0.45) {
        notes.push('It lands. The Black League is blamed and the story moves on.');
        notes = notes.concat(applyEffects(st, { party: { bl: -5 }, demo: { freshmen: 2 }, momentum: 2 }, rng));
      } else {
        notes.push('It does not land.');
        notes = notes.concat(applyEffects(st, { demo: { honor: -7, freshmen: -4, arts: -3 }, faculty: -12, momentum: -4 }, rng));
      }
    }

    if (eff.walkOff) {
      notes = notes.concat(walkOffElection(st, eff.walkOff, rng));
    }
    if (eff.banParties) {
      notes = notes.concat(walkOffElection(st, 'ban_parties', rng));
    }

    return notes;
  }

  // ============================================================
  // MERGE HELPER
  // ============================================================
  function doMerge(st, pid) {
    if (st.merged.indexOf(pid) !== -1) return [];
    var p = getParty(pid);
    if (!p) return ['Party not found.'];
    if (D && D.DEMOS && st.raw[pid]) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = (st.raw.ZMP[dm.id] || 0) + (st.raw[pid] ? st.raw[pid][dm.id] * 0.75 : 0);
      }
    }
    st.merged.push(pid);
    return [p.name + ' folds into the coalition.'];
  }

  // ============================================================
  // BL RESOLVERS
  // ============================================================
  function resolveBLUltimatum(st, choice, rng) {
    var notes = [];
    if (choice === 'reject') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = (st.raw.bl[dm.id] || 0) + 10;
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
        }
      }
      st.fightingBlackLeague = true;
      notes.push('📈 BL +10%! ZMP -5%!');
    } else if (choice === 'rally') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm2 = D.DEMOS[i];
          st.raw.bl[dm2.id] = Math.max(0.5, (st.raw.bl[dm2.id] || 0) - 8);
        }
      }
      st.unity = clamp(st.unity + 3, 0, 100);
      notes.push('BL -8%, Unity +3');
    } else {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm3 = D.DEMOS[i];
          st.raw.bl[dm3.id] = Math.max(0.5, (st.raw.bl[dm3.id] || 0) - 5);
        }
      }
      st.unity = clamp(st.unity + 3, 0, 100);
      notes.push('BL -5%, Unity +3');
    }
    return notes;
  }

  function resolveBLRisingTide(st, choice, rng) {
    var notes = [];
    if (choice === 'campaign') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 5);
        }
      }
      st.unity = clamp(st.unity + 5, 0, 100);
      notes.push('BL -5%, Unity +5');
    } else if (choice === 'popular_front') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm2 = D.DEMOS[i];
          st.raw.bl[dm2.id] = Math.max(0.5, (st.raw.bl[dm2.id] || 0) - 8);
        }
      }
      notes.push('BL -8% (Popular Front)');
    } else {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm3 = D.DEMOS[i];
          st.raw.bl[dm3.id] = Math.max(0.5, (st.raw.bl[dm3.id] || 0) - 5);
        }
      }
      notes.push('BL -5% (criminalize)');
    }
    return notes;
  }

  function resolveBLPropaganda(st, choice, rng) {
    var notes = [];
    if (choice === 'counter') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = (st.raw.bl[D.DEMOS[i].id] || 0) + 1;
        }
      }
      notes.push('BL +1%');
    } else if (choice === 'expose') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.ZMP[D.DEMOS[i].id] = (st.raw.ZMP[D.DEMOS[i].id] || 0) + 2;
        }
      }
      notes.push('ZMP +2%');
    } else {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id]  = (st.raw.bl[dm.id] || 0) + 8;
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
        }
      }
      notes.push('BL +8%! ZMP -5%');
    }
    return notes;
  }

  function resolveBLCollapse(st, choice, rng) {
    var notes = [];
    if (choice === 'finish') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id]  = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 15);
          st.raw.ZMP[dm.id] = (st.raw.ZMP[dm.id] || 0) + 5;
        }
      }
      notes.push('BL -15%! ZMP +5%');
    } else if (choice === 'terms') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = Math.max(0.5, (st.raw.bl[D.DEMOS[i].id] || 0) - 10);
        }
      }
      notes.push('BL -10% (terms)');
    } else {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = Math.max(0.5, (st.raw.bl[D.DEMOS[i].id] || 0) - 5);
        }
      }
      notes.push('BL -5% (natural dissolve)');
    }
    return notes;
  }

  function resolveBLFall(st, choice, rng) {
    var notes = [];
    if (choice === 'denazify') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = Math.max(0.5, (st.raw.bl[D.DEMOS[i].id] || 0) - 10);
        }
      }
      st.faculty = clamp(st.faculty + 10, 0, 100);
      notes.push('BL -10%, Faculty +10');
    } else if (choice === 'rehabilitate') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = Math.max(0.5, (st.raw.bl[D.DEMOS[i].id] || 0) - 5);
        }
      }
      notes.push('BL -5% (rehabilitated)');
    } else {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = Math.max(0.5, (st.raw.bl[D.DEMOS[i].id] || 0) - 3);
        }
      }
      notes.push('BL -3% (declare)');
    }
    return notes;
  }

  function resolveFascistDanger(st, choice, rng) {
    var notes = [];
    if (choice === 'infiltrate') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.ZMP[D.DEMOS[i].id] = (st.raw.ZMP[D.DEMOS[i].id] || 0) + 3;
        }
      }
      st.blGrowthSlow = (st.blGrowthSlow || 0) + 3;
      notes.push('ZMP +3%, BL growth slowed.');
    } else if (choice === 'expose') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = Math.max(0.5, (st.raw.bl[D.DEMOS[i].id] || 0) - 2);
        }
      }
      st.faculty = clamp(st.faculty + 3, 0, 100);
      notes.push('BL -2%, Faculty +3.');
    } else {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.bl[D.DEMOS[i].id] = (st.raw.bl[D.DEMOS[i].id] || 0) + 5;
        }
      }
      st.momentum = clamp(st.momentum - 1, -10, 20);
      notes.push('BL +5%, Momentum -1.');
    }
    return notes;
  }

  // ============================================================
  // PARTY RESURGENCE / RELEASED PARTIES
  // ============================================================
  function resolvePartyResurgence(st, choice, rng) {
    var notes = [];
    var targetId = null;
    var strategy = 'ignore';
    var map = {
      coopt_red: ['red', 'coopt'], crush_red: ['red', 'crush'], ignore_red: ['red', 'ignore'],
      coopt_iia: ['iia', 'coopt'], crush_iia: ['iia', 'crush'], ignore_iia: ['iia', 'ignore'],
      coopt_zpf: ['zpf', 'coopt'], crush_zpf: ['zpf', 'crush'], ignore_zpf: ['zpf', 'ignore'],
      coopt_semp: ['semp', 'coopt'], crush_semp: ['semp', 'crush'], ignore_semp: ['semp', 'ignore'],
      coopt_republia: ['republia', 'coopt'], crush_republia: ['republia', 'crush'], ignore_republia: ['republia', 'ignore'],
      coopt_sportica: ['sportica', 'coopt'], crush_sportica: ['sportica', 'crush'], ignore_sportica: ['sportica', 'ignore'],
      coopt_pl: ['pl', 'coopt'], crush_pl: ['pl', 'crush'], ignore_pl: ['pl', 'ignore'],
      coopt_rb: ['rb', 'coopt'], crush_rb: ['rb', 'crush'], ignore_rb: ['rb', 'ignore']
    };
    if (map[choice]) {
      targetId = map[choice][0];
      strategy = map[choice][1];
    }
    if (!targetId || !st.raw[targetId]) return notes;

    var eatPct = strategy === 'coopt' ? 0.05 : (strategy === 'crush' ? 0.09 : 0.14);

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var eat = (st.raw.ZMP[dm.id] || 0) * eatPct;
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - eat);
        st.raw[targetId][dm.id] = (st.raw[targetId][dm.id] || 0) + eat * 0.8;
      }
    }

    notes.push('ZMP lost support to ' + targetId + '.');
    if (strategy === 'crush') st.faculty = clamp(st.faculty + 5, 0, 100);
    if (strategy === 'ignore') st.unity = clamp(st.unity - 6, 0, 100);
    return notes;
  }

  function resolveReleasedParties(st, choice, rng) {
    var notes = [];
    var eatPct = choice === 'crush' ? 0.45 : (choice === 'negotiate' ? 0.32 : 0.55);
    var splinterIds = ['crnp', 'flo', 'nhp'];

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var eat = (st.raw.ZMP[dm.id] || 0) * eatPct;
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - eat);
        for (var j = 0; j < splinterIds.length; j++) {
          if (st.raw[splinterIds[j]]) {
            st.raw[splinterIds[j]][dm.id] = (st.raw[splinterIds[j]][dm.id] || 0) + eat / 3;
          }
        }
      }
    }
    st.unity = clamp(st.unity - 10, 0, 100);
    notes.push('ZMP lost ground to released parties.');
    return notes;
  }

  function resolveReleasedSurge(st, choice, rng) {
    var notes = [];
    var eatPct = choice === 'counter' ? 0.4 : (choice === 'expose' ? 0.3 : 0.5);
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var eat = (st.raw.ZMP[dm.id] || 0) * eatPct;
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - eat);
      }
    }
    notes.push('ZMP lost ground.');
    return notes;
  }

  function resolveReleasedVictory(st, choice, rng) {
    var notes = [];
    var eatPct = choice === 'emergency' ? 0.35 : (choice === 'appeal' ? 0.45 : 0.25);
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var eat = (st.raw.ZMP[dm.id] || 0) * eatPct;
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - eat);
      }
    }
    notes.push('ZMP lost ground.');
    return notes;
  }

  // ============================================================
  // RUBICON RESOLVERS
  // ============================================================
  function resolveRubiconActivation(st, choice, rng) {
    st.rubiconTriggered = true;
    st.rubiconState = choice;
    var notes = [];
    if (choice === 'emergency') {
      st.faculty = clamp(st.faculty - 15, 0, 100);
      st.unity = clamp(st.unity + 5, 0, 100);
      notes.push('Emergency declared.');
    } else if (choice === 'ground') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          if (st.raw.crnp) st.raw.crnp[dm.id] = (st.raw.crnp[dm.id] || 0) + 3;
          if (st.raw.flo)  st.raw.flo[dm.id]  = (st.raw.flo[dm.id]  || 0) + 3;
          if (st.raw.nhp)  st.raw.nhp[dm.id]  = (st.raw.nhp[dm.id]  || 0) + 3;
        }
      }
      notes.push('Going to ground.');
    } else {
      var maxSplinter = 0;
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm2 = D.DEMOS[i];
          maxSplinter = Math.max(maxSplinter,
            st.raw.crnp ? st.raw.crnp[dm2.id] || 0 : 0,
            st.raw.flo  ? st.raw.flo[dm2.id]  || 0 : 0,
            st.raw.nhp  ? st.raw.nhp[dm2.id]  || 0 : 0);
        }
      }
      if (maxSplinter > 15) {
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.ZMP[D.DEMOS[i].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[i].id] || 0) - 5);
          }
        }
        notes.push('Appeal rejected.');
      } else {
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.ZMP[D.DEMOS[i].id] = (st.raw.ZMP[D.DEMOS[i].id] || 0) + 4;
          }
        }
        notes.push('Moderate parties rally.');
      }
    }
    return notes;
  }

  function resolveRubiconPopularFront(st, choice, rng) {
    st.rubiconPopularFront = choice;
    var notes = [];
    var boost = {};
    if (choice === 'form') {
      boost = { ZMP: 6, iia: 4, red: 4 };
      notes.push('Popular Front formed.');
    } else if (choice === 'refuse') {
      notes.push('You refuse their help.');
    } else {
      boost = { ZMP: 3 };
      notes.push('You use them at arm\'s length.');
    }
    if (D && D.DEMOS) {
      for (var pid in boost) {
        if (!st.raw[pid]) continue;
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw[pid][D.DEMOS[i].id] = (st.raw[pid][D.DEMOS[i].id] || 0) + boost[pid];
        }
      }
    }
    return notes;
  }

  function resolveRubiconSurge(st, choice, rng) {
    var notes = [];
    if (choice === 'strike') {
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) st.raw.ZMP[D.DEMOS[i].id] = (st.raw.ZMP[D.DEMOS[i].id] || 0) + 5;
      st.faculty = clamp(st.faculty - 20, 0, 100);
      notes.push('General strike.');
    } else if (choice === 'police') {
      if (D && D.DEMOS) for (var i2 = 0; i2 < D.DEMOS.length; i2++) st.raw.ZMP[D.DEMOS[i2].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[i2].id] || 0) - 5);
      st.faculty = clamp(st.faculty + 15, 0, 100);
      notes.push('Police called.');
    } else {
      if (rng() < 0.3 + (st.unity || 50) / 200) {
        if (D && D.DEMOS) for (var i3 = 0; i3 < D.DEMOS.length; i3++) st.raw.ZMP[D.DEMOS[i3].id] = (st.raw.ZMP[D.DEMOS[i3].id] || 0) + 8;
        notes.push('VICTORY in the streets.');
      } else {
        if (D && D.DEMOS) for (var i4 = 0; i4 < D.DEMOS.length; i4++) st.raw.ZMP[D.DEMOS[i4].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[i4].id] || 0) - 5);
        notes.push('Defeat in the streets.');
      }
    }
    return notes;
  }

  function resolveRubiconBetrayal(st, choice, rng) {
    st.rubiconBetrayal = choice;
    var notes = [];
    if (choice === 'purge') {
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = (st.raw.ZMP[dm.id] || 0) + 5;
          if (st.raw.iia) st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 8);
        }
      }
      notes.push('You purge the Popular Front.');
    } else if (choice === 'beg') {
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) st.raw.ZMP[D.DEMOS[i].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[i].id] || 0) - 5);
      notes.push('You beg for forgiveness.');
    } else {
      if (rng() < 0.5 + (st.momentum || 0) / 100) {
        if (D && D.DEMOS) for (var i2 = 0; i2 < D.DEMOS.length; i2++) st.raw.ZMP[D.DEMOS[i2].id] = (st.raw.ZMP[D.DEMOS[i2].id] || 0) + 10;
        notes.push('You crush the Popular Front.');
      } else {
        if (D && D.DEMOS) for (var i3 = 0; i3 < D.DEMOS.length; i3++) st.raw.ZMP[D.DEMOS[i3].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[i3].id] || 0) - 12);
        notes.push('They crush you.');
      }
    }
    return notes;
  }

  function resolveRubiconLastStand(st, choice, rng) {
    st.rubiconLastStand = choice;
    var notes = [];
    if (choice === 'all_in') {
      if (rng() < 0.4 + (st.unity || 50) / 400) {
        st.rubiconVictory = true;
        st.blSplintered = true;
        if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) st.raw.ZMP[D.DEMOS[i].id] = (st.raw.ZMP[D.DEMOS[i].id] || 0) + 12;
        notes.push('MIRACLE VICTORY!');
      } else {
        notes.push('DEFEAT!');
      }
    } else if (choice === 'alone') {
      if (rng() < 0.2 + (st.unity || 50) / 300) {
        st.rubiconVictory = true;
        st.blSplintered = true;
        if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) st.raw.ZMP[D.DEMOS[j].id] = (st.raw.ZMP[D.DEMOS[j].id] || 0) + 15;
        notes.push('LEGENDARY VICTORY!');
      } else {
        notes.push('ANNIHILATED!');
      }
    } else {
      st.rubiconCapitulated = true;
      if (D && D.DEMOS) for (var k = 0; k < D.DEMOS.length; k++) st.raw.ZMP[D.DEMOS[k].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[k].id] || 0) - 10);
      notes.push('You capitulate.');
    }
    return notes;
  }

  function resolveRubiconVictory(st, choice, rng) {
    var notes = [];
    if (choice === 'rebuild') {
      st.faculty = clamp(st.faculty + 20, 0, 100);
      st.unity = clamp(st.unity + 15, 0, 100);
      notes.push('Reconstruction.');
    } else if (choice === 'forge') {
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) st.raw.ZMP[D.DEMOS[i].id] = (st.raw.ZMP[D.DEMOS[i].id] || 0) + 8;
      st.unity = clamp(st.unity - 10, 0, 100);
      notes.push('New order forged.');
    } else {
      st.unity = clamp(st.unity + 20, 0, 100);
      notes.push('Council dissolved.');
    }
    return notes;
  }

  function resolveRubiconDefeat(st, choice, rng) {
    if (choice === 'disband') {
      st.finished = true;
      st.winReason = 'rubicon_disband';
      return ['The ZMP is disbanded.'];
    }
    if (choice === 'resist') {
      st.finished = true;
      st.winReason = 'rubicon_resist';
      return ['You resist.'];
    }
    st.finished = true;
    st.winReason = 'rubicon_puppet';
    return ['You become a puppet.'];
  }

  // ============================================================
  // LEGISLATURE / LOCAL / DEBATE / MISC
  // ============================================================
  function resolveLegislatureVote(st, choice, rng) {
    var notes = [];
    var addAll = function (pid, amount) {
      if (!st.raw[pid] || !D || !D.DEMOS) return;
      for (var i = 0; i < D.DEMOS.length; i++) {
        st.raw[pid][D.DEMOS[i].id] = (st.raw[pid][D.DEMOS[i].id] || 0) + amount;
      }
    };

    if (choice.indexOf('field_day') === 0) {
      st.eventDone.field_day_vote = true;
      if (choice === 'field_day_for') {
        addAll('zpf', 2); addAll('iia', 2);
        notes.push('Field Day passes.');
      } else if (choice === 'field_day_against') {
        addAll('bl', 5);
        notes.push('Field Day fails.');
      }
    } else if (choice.indexOf('budget_cut') === 0) {
      st.eventDone.budget_cut_vote = true;
      if (choice === 'budget_cut_for') { st.funds += 15; notes.push('Budget cut passes.'); }
      else if (choice === 'budget_cut_against') { st.funds = Math.max(0, st.funds - 10); notes.push('Budget cut defeated.'); }
    } else if (choice.indexOf('honor_code') === 0) {
      st.eventDone.honor_code_vote = true;
      if (choice === 'honor_code_for') { st.faculty = clamp(st.faculty + 5, 0, 100); notes.push('Honor code passes.'); }
      else if (choice === 'honor_code_against') { st.unity = clamp(st.unity - 3, 0, 100); notes.push('Honor code fails.'); }
    }
    return notes;
  }

  function resolveLocalElection(st, choice, rng) {
    var notes = [];
    // Simplified: weighted by current party support
    var zmpLocal = (st.partySupport.ZMP || 0) * 0.6 + 5;
    if (choice === 'all_out' || choice === 'aggressive') zmpLocal += 10;
    else if (choice === 'strategic' || choice === 'targeted') zmpLocal += 5;
    else zmpLocal -= 3;

    var others = ['zpf', 'iia', 'red', 'bl', 'rb'];
    var maxOther = 0;
    for (var i = 0; i < others.length; i++) {
      var s = (st.partySupport[others[i]] || 0) * 0.5;
      if (s > maxOther) maxOther = s;
    }

    if (zmpLocal > maxOther) {
      if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) st.raw.ZMP[D.DEMOS[j].id] = (st.raw.ZMP[D.DEMOS[j].id] || 0) + 2;
      notes.push('ZMP wins a local election.');
    } else {
      if (D && D.DEMOS) for (var k = 0; k < D.DEMOS.length; k++) st.raw.bl[D.DEMOS[k].id] = (st.raw.bl[D.DEMOS[k].id] || 0) + 5;
      notes.push('Opposition wins a local election.');
    }
    st.LocalElectionCount = (st.LocalElectionCount || 0) + 1;
    return notes;
  }

  function resolvedebateOfSudWest(st, choice, rng) {
    var notes = [];
    if (choice === 'monarchy') {
      st.spirit = clamp(st.spirit + 1, 0, 10);
      st.unity = clamp(st.unity + 3, 0, 100);
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) st.raw.bl[D.DEMOS[i].id] = (st.raw.bl[D.DEMOS[i].id] || 0) + 5;
      notes.push('Monarchy championed.');
    } else if (choice === 'republic') {
      st.faculty = clamp(st.faculty + 4, 0, 100);
      if (D && D.DEMOS) {
        for (var j = 0; j < D.DEMOS.length; j++) {
          st.raw.ZMP[D.DEMOS[j].id] = (st.raw.ZMP[D.DEMOS[j].id] || 0) + 3;
          st.raw.bl[D.DEMOS[j].id]  = (st.raw.bl[D.DEMOS[j].id]  || 0) + 3;
        }
      }
      notes.push('Republic championed.');
    } else {
      notes.push('Debate avoided.');
    }
    return notes;
  }

  function resolveIntellectualResistance(st, choice, rng) {
    var notes = [];
    if (choice === 'open') {
      st.faculty = clamp(st.faculty + 8, 0, 100);
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) st.raw.bl[D.DEMOS[i].id] = (st.raw.bl[D.DEMOS[i].id] || 0) + 4;
      notes.push('Support open.');
    } else if (choice === 'secret') {
      st.faculty = clamp(st.faculty + 4, 0, 100);
      if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) st.raw.bl[D.DEMOS[j].id] = (st.raw.bl[D.DEMOS[j].id] || 0) + 1;
      notes.push('Support secret.');
    } else {
      st.faculty = clamp(st.faculty - 5, 0, 100);
      if (D && D.DEMOS) for (var k = 0; k < D.DEMOS.length; k++) st.raw.bl[D.DEMOS[k].id] = (st.raw.bl[D.DEMOS[k].id] || 0) + 2;
      notes.push('Distanced.');
    }
    return notes;
  }

  function resolveAllianceDemocracies(st, choice, rng) {
    var notes = [];
    if (choice === 'form') {
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (st.raw.zpf) st.raw.zpf[dm.id] = (st.raw.zpf[dm.id] || 0) + 3;
        if (st.raw.iia) st.raw.iia[dm.id] = (st.raw.iia[dm.id] || 0) + 3;
        if (st.raw.red) st.raw.red[dm.id] = (st.raw.red[dm.id] || 0) + 3;
        if (st.raw.bl)  st.raw.bl[dm.id]  = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 8);
      }
      notes.push('Alliance formed.');
    } else if (choice === 'support') {
      if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) {
        var dm2 = D.DEMOS[j];
        st.raw.ZMP[dm2.id] = (st.raw.ZMP[dm2.id] || 0) + 2;
        if (st.raw.bl) st.raw.bl[dm2.id] = Math.max(0.5, (st.raw.bl[dm2.id] || 0) - 4);
      }
      notes.push('You support the alliance.');
    } else {
      if (D && D.DEMOS) for (var k = 0; k < D.DEMOS.length; k++) st.raw.bl[D.DEMOS[k].id] = (st.raw.bl[D.DEMOS[k].id] || 0) + 5;
      notes.push('You reject the alliance.');
    }
    return notes;
  }

  function resolveFallOfCenter(st, choice, rng) {
    var notes = [];
    if (!D || !D.DEMOS) return notes;
    for (var i = 0; i < D.DEMOS.length; i++) {
      var dm = D.DEMOS[i];
      var iiaVal = st.raw.iia ? st.raw.iia[dm.id] || 0 : 0;
      if (choice === 'zpf') {
        if (st.raw.zpf) st.raw.zpf[dm.id] = (st.raw.zpf[dm.id] || 0) + iiaVal * 0.5;
        if (st.raw.bl)  st.raw.bl[dm.id]  = (st.raw.bl[dm.id]  || 0) + iiaVal * 0.5;
        if (st.raw.iia) st.raw.iia[dm.id] = iiaVal * 0.2;
      } else if (choice === 'zmp') {
        st.raw.ZMP[dm.id] = (st.raw.ZMP[dm.id] || 0) + iiaVal * 0.3;
        if (st.raw.zpf) st.raw.zpf[dm.id] = (st.raw.zpf[dm.id] || 0) + iiaVal * 0.35;
        if (st.raw.bl)  st.raw.bl[dm.id]  = (st.raw.bl[dm.id]  || 0) + iiaVal * 0.35;
        if (st.raw.iia) st.raw.iia[dm.id] = iiaVal * 0.2;
      } else {
        if (st.raw.zpf) st.raw.zpf[dm.id] = (st.raw.zpf[dm.id] || 0) + iiaVal * 0.4;
        if (st.raw.bl)  st.raw.bl[dm.id]  = (st.raw.bl[dm.id]  || 0) + iiaVal * 0.4;
        if (st.raw.iia) st.raw.iia[dm.id] = iiaVal * 0.2;
      }
    }
    notes.push('Fall of Center resolved.');
    return notes;
  }

  function runDebate(st, style, rng) {
    var roll = rng(), notes = [];
    if (style === 'record') {
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) st.raw.ZMP[D.DEMOS[i].id] = (st.raw.ZMP[D.DEMOS[i].id] || 0) + 3;
      notes.push('You run on your record.');
    } else if (style === 'attack') {
      if (roll < 0.55) {
        if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) st.raw.ZMP[D.DEMOS[j].id] = (st.raw.ZMP[D.DEMOS[j].id] || 0) + 3;
        notes.push('Attack lands.');
      } else {
        if (D && D.DEMOS) for (var k = 0; k < D.DEMOS.length; k++) st.raw.ZMP[D.DEMOS[k].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[k].id] || 0) - 2);
        notes.push('Attack backfires.');
      }
    } else if (style === 'spirit') {
      if (D && D.DEMOS) for (var l = 0; l < D.DEMOS.length; l++) st.raw.ZMP[D.DEMOS[l].id] = (st.raw.ZMP[D.DEMOS[l].id] || 0) + 2;
      notes.push('Spirit speech.');
    } else {
      if (roll < 0.4) {
        if (D && D.DEMOS) for (var m = 0; m < D.DEMOS.length; m++) st.raw.ZMP[D.DEMOS[m].id] = (st.raw.ZMP[D.DEMOS[m].id] || 0) + 5;
        notes.push('Wild promises triumph.');
      } else if (roll < 0.75) {
        if (D && D.DEMOS) for (var n = 0; n < D.DEMOS.length; n++) st.raw.ZMP[D.DEMOS[n].id] = (st.raw.ZMP[D.DEMOS[n].id] || 0) + 1;
        notes.push('Mixed reception.');
      } else {
        if (D && D.DEMOS) for (var o = 0; o < D.DEMOS.length; o++) st.raw.ZMP[D.DEMOS[o].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[o].id] || 0) - 3);
        notes.push('The senior question lands hard.');
      }
    }
    return notes;
  }

  function resolvePresidentialSdahh(st, choice, rng) {
    return ['Presidential campaign: ' + choice];
  }

  // ============================================================
  // WALK OFF ELECTION
  // ============================================================
  function walkOffElection(st, choice, rng) {
    var notes = [];
    if (choice === 'walk_off') {
      notes.push('🚶 The ZMP walks off the election!');
      if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id]  = (st.raw.bl[dm.id] || 0) + 10;
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
      }
    } else if (choice === 'ban_parties') {
      if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) {
        var dm2 = D.DEMOS[j];
        if (st.raw.bl) st.raw.bl[dm2.id] = Math.max(0.5, (st.raw.bl[dm2.id] || 0) * 0.3);
        if (st.raw.crnp) st.raw.crnp[dm2.id] = Math.max(0.5, (st.raw.crnp[dm2.id] || 0) * 0.3);
        if (st.raw.flo)  st.raw.flo[dm2.id]  = Math.max(0.5, (st.raw.flo[dm2.id]  || 0) * 0.3);
        if (st.raw.nhp)  st.raw.nhp[dm2.id]  = Math.max(0.5, (st.raw.nhp[dm2.id]  || 0) * 0.3);
        st.raw.ZMP[dm2.id] = (st.raw.ZMP[dm2.id] || 0) + 3;
      }
      st.blSplintered = true;
      st.blackLeagueBanned = true;
      notes.push('Extremists banned.');
    }
    return notes;
  }

  // ============================================================
  // BL CELL PLACEMENT
  // ============================================================
  function getCellLocations() {
    return [
      { id: 'cafeteria',         name: 'Cafeteria',         icon: '🍽️' },
      { id: 'gymnasium',         name: 'Gymnasium',         icon: '🏋️' },
      { id: 'library',           name: 'Library',           icon: '📚' },
      { id: 'science_wing',      name: 'Science Wing',      icon: '🔬' },
      { id: 'arts_wing',         name: 'Arts Wing',         icon: '🎭' },
      { id: 'computer_lab',      name: 'Computer Lab',      icon: '💻' },
      { id: 'basement',          name: 'Basement',          icon: '🕳️' },
      { id: 'roof',              name: 'Roof',              icon: '🏢' },
      { id: 'parking_lot',       name: 'Parking Lot',       icon: '🚗' },
      { id: 'teachers_lounge',   name: 'Teachers Lounge',   icon: '👨‍🏫' },
      { id: 'auditorium',        name: 'Auditorium',        icon: '🎪' },
      { id: 'counseling_office', name: 'Counseling Office', icon: '🛋️' }
    ];
  }

  function placeBLChill(st, rng) {
    if (!st.blackLeagueCells) initBlackLeagueCells(st);
    var system = st.blackLeagueCells;
    var notes = [];
    system.placementTimer += 1;
    if (system.placementTimer >= system.placementInterval && system.cells.length < system.maxCells) {
      system.placementTimer = 0;
      var allLocations = getCellLocations();
      var occupiedIds = system.cells.map(function (c) { return c.location; });
      var available = allLocations.filter(function (l) { return occupiedIds.indexOf(l.id) === -1; });
      if (available.length > 0) {
        var loc = available[Math.floor(rng() * available.length)];
        system.cells.push({
          id: 'cell_' + Date.now() + '_' + Math.floor(rng() * 1000),
          location: loc.id,
          locationName: loc.name,
          icon: loc.icon,
          strength: 1 + Math.floor(rng() * 2),
          weekPlaced: st.week,
          discovered: false,
          destroyed: false,
          supporters: 5 + Math.floor(rng() * 10),
          intelLevel: 0
        });
        system.totalCellsPlaced += 1;
        notes.push('⚫ Black League placed a new cell in the ' + loc.name + '.');
      }
    }
    system.cells.forEach(function (cell) {
      if (!cell.destroyed) {
        if (st.week - cell.weekPlaced > 4 && cell.strength < 5) cell.strength = Math.min(5, cell.strength + 0.5);
        if (st.week - cell.weekPlaced > 2) cell.supporters = Math.min(30, cell.supporters + Math.floor(rng() * 2));
      }
    });
    return notes;
  }

  // ============================================================
  // BATTLE 1 — Battle of Ca'uf
  // ============================================================
  function resolveBattle(st, choice, rng) {
    var notes = [];
    if (!st.paramilitaries) initParamilitaries(st);
    var zmpForce = st.paramilitaries.dzehurjaca;
    var iiaForce = st.paramilitaries.iia_guard;
    var blForce  = st.paramilitaries.black_legion;
    var zmpS = calculateParamilitaryStrength(zmpForce);
    var iiaS = calculateParamilitaryStrength(iiaForce);
    var blS  = calculateParamilitaryStrength(blForce);

    if (choice === 'help_iia') {
      var allied = zmpS + iiaS;
      if (allied * (0.8 + rng() * 0.4) > blS * (0.8 + rng() * 0.4)) {
        notes.push(' VICTORY! Your forces and IIA have defeated the Black League!');
        zmpForce.members += 10; zmpForce.morale = Math.min(100, zmpForce.morale + 5);
        iiaForce.members += 15; iiaForce.morale = Math.min(100, iiaForce.morale + 5);
        blForce.members  = Math.max(0, blForce.members - 30);
        blForce.morale   = Math.max(10, blForce.morale - 10);
        st.battle1Lost = false;
        if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.iia[dm.id] = (st.raw.iia[dm.id] || 0) + 5;
          st.raw.bl[dm.id]  = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 3);
          st.raw.ZMP[dm.id] = (st.raw.ZMP[dm.id] || 0) + 1.5;
        }
      } else {
        notes.push(' DEFEAT! The Black League has crushed your forces and IIA!');
        zmpForce.members = Math.max(0, zmpForce.members - 20);
        iiaForce.members = Math.max(0, iiaForce.members - 30);
        blForce.members += 30;
        blForce.morale = Math.min(100, blForce.morale + 10);
        st.battle1Lost = true;
        if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) {
          var dm2 = D.DEMOS[j];
          st.raw.bl[dm2.id]  = (st.raw.bl[dm2.id] || 0) + 10;
          st.raw.iia[dm2.id] = Math.max(0.5, (st.raw.iia[dm2.id] || 0) - 4);
          st.raw.ZMP[dm2.id] = Math.max(0.5, (st.raw.ZMP[dm2.id] || 0) - 2);
        }
      }
    } else if (choice === 'go_independent') {
      var zmpS2 = zmpS + 50;
      var combined = (iiaS + blS) / 2;
      if (zmpS2 > combined) {
        notes.push(' TRIUMPH! ZMP stands alone.');
        if (D && D.DEMOS) for (var k = 0; k < D.DEMOS.length; k++) {
          st.raw.ZMP[D.DEMOS[k].id] = (st.raw.ZMP[D.DEMOS[k].id] || 0) + 8;
        }
      } else {
        notes.push(' DISASTER! ZMP crushed between enemies.');
        if (D && D.DEMOS) for (var l = 0; l < D.DEMOS.length; l++) {
          st.raw.ZMP[D.DEMOS[l].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[l].id] || 0) - 8);
        }
        st.unity = clamp(st.unity - 15, 0, 100);
      }
    } else {
      notes.push(' ZMP stays out.');
    }
    markBattleResolved(1);
    return notes;
  }

  // ============================================================
  // BATTLE 2 — Second Battle of Ca'uf
  // ============================================================
  function resolveBattle2(st, choice, rng) {
    var notes = [];
    if (!st.paramilitaries) initParamilitaries(st);
    var zmpForce = st.paramilitaries.dzehurjaca;
    var iiaForce = st.paramilitaries.iia_guard;
    var blForce  = st.paramilitaries.black_legion;
    var weinForce= st.paramilitaries.wein_workers;
    var zmpS = calculateParamilitaryStrength(zmpForce);
    var iiaS = calculateParamilitaryStrength(iiaForce);
    var blS  = calculateParamilitaryStrength(blForce);
    var weinS= calculateParamilitaryStrength(weinForce);
    var mult = st.battle1Lost ? 4 : 2;
    var blPower = blS * mult;
    notes.push('BL strength: ' + blS + ' x ' + mult + ' = ' + Math.round(blPower));

    if (choice === 'help_iia') {
      var allied = zmpS + iiaS;
      if (st.hasArbeiterAlly) { allied += weinS * 0.3; notes.push('🌍 Wein joins!'); }
      if (allied * (0.7 + rng() * 0.4) > blPower * (0.7 + rng() * 0.4)) {
        notes.push(' VICTORY!');
        st.battle2Won = true; st.battle2Lost = false;
        if (D && D.DEMOS) for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.iia[dm.id] = (st.raw.iia[dm.id] || 0) + 4;
          st.raw.bl[dm.id]  = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 5);
          st.raw.ZMP[dm.id] = (st.raw.ZMP[dm.id] || 0) + 2;
        }
      } else {
        notes.push(' DEFEAT!');
        st.battle2Won = false; st.battle2Lost = true;
        if (D && D.DEMOS) for (var j = 0; j < D.DEMOS.length; j++) {
          var dm2 = D.DEMOS[j];
          st.raw.bl[dm2.id]  = (st.raw.bl[dm2.id] || 0) + 8;
          st.raw.iia[dm2.id] = Math.max(0.5, (st.raw.iia[dm2.id] || 0) - 5);
          st.raw.ZMP[dm2.id] = Math.max(0.5, (st.raw.ZMP[dm2.id] || 0) - 3);
        }
      }
    } else if (choice === 'go_independent') {
      var zmpPower = zmpS * (0.8 + rng() * 0.3);
      var iiaPower = iiaS * (0.7 + rng() * 0.4);
      var combined = (iiaPower + blPower) / 2;
      if (zmpPower > combined) {
        notes.push(' TRIUMPH!');
        st.battle2Won = true; st.battle2Lost = false;
        if (D && D.DEMOS) for (var k = 0; k < D.DEMOS.length; k++) {
          st.raw.ZMP[D.DEMOS[k].id] = (st.raw.ZMP[D.DEMOS[k].id] || 0) + 6;
        }
      } else {
        notes.push(' DISASTER!');
        st.battle2Won = false; st.battle2Lost = true;
        if (D && D.DEMOS) for (var l = 0; l < D.DEMOS.length; l++) {
          st.raw.ZMP[D.DEMOS[l].id] = Math.max(0.5, (st.raw.ZMP[D.DEMOS[l].id] || 0) - 10);
        }
        st.unity = clamp(st.unity - 15, 0, 100);
      }
    } else {
      notes.push(' ZMP stays neutral.');
    }
    return notes;
  }

  // ============================================================
  // BATTLE 3 — Last of Us
  // ============================================================
  function resolveBattle3(st, choice, rng) {
    var notes = [];
    if (!st.paramilitaries) initParamilitaries(st);
    var zmpForce = st.paramilitaries.dzehurjaca;
    var iiaForce = st.paramilitaries.iia_guard;
    var blForce  = st.paramilitaries.black_legion;
    var weinForce= st.paramilitaries.wein_workers;
    var redForce = st.paramilitaries.red_militia;
    var zmpS = calculateParamilitaryStrength(zmpForce);
    var iiaS = calculateParamilitaryStrength(iiaForce);
    var blS  = calculateParamilitaryStrength(blForce);
    var weinS= calculateParamilitaryStrength(weinForce);
    var redS = calculateParamilitaryStrength(redForce);
    var weinBonus = st.hasArbeiterAlly ? 1.5 : 1.0;
    var redJoinsBL = (st.affinity.red || 35) < 30;

    if (choice === 'call_allies') {
      var allied = (zmpS + iiaS) * weinBonus;
      if (st.hasArbeiterAlly) allied += weinS * 0.4;
      var enemy = blS * (st.battle2Lost ? 3 : 1.5);
      if (redJoinsBL) enemy += redS * 0.3;
      if (allied * (0.7 + rng() * 0.4) > enemy * (0.7 + rng() * 0.4)) {
        notes.push(' VICTORY!');
        st.battle3Won = true;
      } else {
        notes.push(' GAME OVER — Black League wins.');
        st.battle3Won = false;
        st.battle3Lost = true;
        st.gameOver = true;
      }
    } else if (choice === 'fight_alone') {
      if (st.battle2Lost) {
        if (rng() < 0.1 + zmpS / 500) {
          notes.push(' MIRACLE!');
          st.battle3Won = true;
        } else {
          notes.push(' GAME OVER.');
          st.battle3Lost = true;
          st.gameOver = true;
        }
      } else {
        var enemy2 = blS * 1.5;
        if (zmpS * (0.7 + rng() * 0.4) > enemy2 * (0.7 + rng() * 0.4)) {
          notes.push(' VICTORY!');
          st.battle3Won = true;
        } else {
          notes.push(' GAME OVER.');
          st.battle3Lost = true;
          st.gameOver = true;
        }
      }
    }
    return notes;
  }

  // ============================================================
  // BATTLE 4 — Last Dance
  // ============================================================
  function resolveBattle4(st, choice, rng) {
    var notes = [];
    if (!st.paramilitaries) initParamilitaries(st);
    var zmpForce = st.paramilitaries.dzehurjaca;
    var iiaForce = st.paramilitaries.iia_guard;
    var blForce  = st.paramilitaries.black_legion;
    var weinForce= st.paramilitaries.wein_workers;
    var zmpS = calculateParamilitaryStrength(zmpForce);
    var iiaS = calculateParamilitaryStrength(iiaForce);
    var blS  = calculateParamilitaryStrength(blForce);
    var weinS= calculateParamilitaryStrength(weinForce);
    var weinRelation = (st.relations && st.relations.wein) || 0;
    var weinAlly = st.hasArbeiterAlly || false;

    if (choice === 'finish_them') {
      if (weinRelation < 70 || !weinAlly) {
        notes.push(' Wein refuses. BL escapes.');
        blForce.members += 20;
        return notes;
      }
      var allied = zmpS + iiaS + weinS * 0.5;
      if (allied * (0.7 + rng() * 0.4) > blS * 0.8 * (0.7 + rng() * 0.4)) {
        notes.push(' FINAL VICTORY!');
        st.battle4Completed = true;
        st.battle4WithWein = true;
        st.blSplintered = true;
        createSplinters(st);
      } else {
        notes.push(' BL survives, weakened.');
        blForce.members = Math.max(0, blForce.members - 30);
      }
    } else if (choice === 'go_alone') {
      var allied2 = zmpS;
      if (allied2 * (0.7 + rng() * 0.4) > blS * 1.2 * (0.7 + rng() * 0.4)) {
        notes.push(' TRIUMPH!');
        st.battle4Completed = true;
        st.battle4WithWein = false;
        st.blSplintered = true;
        createSplinters(st);
      } else {
        notes.push(' DEFEAT.');
        blForce.members += 50;
      }
    } else if (choice === 'show_mercy') {
      notes.push('🕊️ Mercy shown.');
      blForce.members = Math.max(0, blForce.members - 20);
    }
    return notes;
  }
  function createSplinters(st) {
    var splinters = [
      { id: 'crnp', name: 'Conservative National Party', short: 'CrNP', tag: 'CrNP', color: '#2a5c8a',
        spirit: 3, gates: 8, coalition: ['zpf', 'bl'], desc: 'Moderate conservatives who reject BL violence.' },
      { id: 'flo',  name: 'Free League of Order',       short: 'FLO',  tag: 'FLO',  color: '#8a2a2a',
        spirit: 2, gates: 6, coalition: ['bl', 'sportica'], desc: 'Hardliners who want order at any cost.' },
      { id: 'nhp',  name: 'National Heritage Party',    short: 'NHP',  tag: 'NHP',  color: '#4a4a4a',
        spirit: 1, gates: 5, coalition: ['sportica'], desc: 'Traditionalists nostalgic for the old regime.' }
    ];
    if (!D || !D.DEMOS) return;
    for (var s = 0; s < splinters.length; s++) {
      var sp = splinters[s];
      if (!st.raw[sp.id]) {
        st.raw[sp.id] = {};
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var blVal = st.raw.bl ? (st.raw.bl[dm.id] || 0) : 0;
          st.raw[sp.id][dm.id] = Math.max(0.5, blVal * 0.15);
        }
      }
    }
    if (st.raw.bl && D.DEMOS) {
      for (var j = 0; j < D.DEMOS.length; j++) {
        st.raw.bl[D.DEMOS[j].id] = Math.max(0.5, (st.raw.bl[D.DEMOS[j].id] || 0) * 0.4);
      }
    }
    st.blSplintered = true;
    st.log.push('Week ' + st.week + ': BL splinters into CrNP, FLO, and NHP.');
  }

    function markBattleResolved(n) {
    if (!state) return;
    if (!state.flags) state.flags = {};
    state.flags['battle' + n + 'Resolved'] = true;
    if (n === 1) {
      state.battle1Lost = !!state.battle1Lost;
    }
    if (n === 2) {
      state.battle2Lost = !!state.battle2Lost;
      state.battle2Won = !state.battle2Lost;
    }
    if (n === 3) {
      state.battle3Lost = !!state.battle3Lost;
      state.battle3Won = !state.battle3Lost;
    }
    if (n === 4) {
      state.battle4Completed = !!state.battle4Completed;
    }
  }

  // ============================================================
  // WALL BREAKING (denounce / investigate / prosecute / ban)
  // ============================================================
  function denounceBL(st, choice, rng) {
    var notes = [];
    var wall = breakWall('denounce');
    if (wall.ok) notes.push('You denounce the Black League. ' + wall.wall.name + ' breaks.');
    else notes.push('You denounce the Black League, but no wall breaks yet.');

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 2);
        st.raw.ZMP[dm.id] = (st.raw.ZMP[dm.id] || 0) + 1;
      }
    }
    st.blackLeagueInvestigated = true;
    return notes;
  }

  function investigateBL(st, choice, rng) {
    var notes = [];
    if (!st.blackLeagueInvestigated) {
      notes.push('You must denounce the Black League first.');
      return notes;
    }
    var wall = breakWall('investigate');
    if (wall.ok) notes.push('Investigation deepens. ' + wall.wall.name + ' breaks.');
    else notes.push('Investigation continues, but no new wall breaks.');

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 3);
      }
    }
    st.blackLeagueInvestigated = true;
    return notes;
  }

  function prosecuteBL(st, choice, rng) {
    var notes = [];
    if (!st.blackLeagueInvestigated) {
      notes.push('You must investigate the Black League first.');
      return notes;
    }
    var wall = breakWall('prosecute');
    if (wall.ok) notes.push('Prosecutions begin. ' + wall.wall.name + ' breaks.');
    else notes.push('Prosecutions continue, but no new wall breaks.');

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 4);
      }
    }
    st.blackLeagueProsecuted = true;
    return notes;
  }

  function banBLSplinters(st, choice, rng) {
    var notes = [];
    if (!st.blackLeagueProsecuted) {
      notes.push('You must prosecute the Black League first.');
      return notes;
    }
    var wall = breakWall('ban');
    if (wall.ok) notes.push('Splinter parties banned. ' + wall.wall.name + ' breaks.');
    else notes.push('Ban attempt fails.');

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (st.raw.bl) st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) * 0.3);
        if (st.raw.crnp) st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) * 0.3);
        if (st.raw.flo)  st.raw.flo[dm.id]  = Math.max(0.5, (st.raw.flo[dm.id]  || 0) * 0.3);
        if (st.raw.nhp)  st.raw.nhp[dm.id]  = Math.max(0.5, (st.raw.nhp[dm.id]  || 0) * 0.3);
      }
    }
    st.blackLeagueBanned = true;
    return notes;
  }

  // ============================================================
  // EVENTS ARRAY
  // ============================================================
  function getEvents() {
    if (D && D.EVENTS) return D.EVENTS;
    return [];
  }

  // ============================================================
  // EXTRA SHIMS — so message 1 code that references these works
  // ============================================================
  function tickBLPlacement() {
    if (!state) return [];
    return placeBLChill(state, state.rng);
  }

  function checkFormationEvents() {
    if (!state || !state.formation) return;
    if (!state.formation.cycleActive) return;
    var leader = state.formation.rank1;
    if (!leader) return;
    var q = state.queues[leader] || [];
    for (var i = 0; i < q.length; i++) {
      if (q[i].isFormation) return;
    }
    if (state.formation.rank2) {
      var q2 = state.queues[state.formation.rank2] || [];
      for (var j = 0; j < q2.length; j++) {
        if (q2[j].isFormation) return;
      }
    }
    queueFormationEvent(leader);
  }

    function resolveMinistryAction(partyId, ministryId, actionId) {
    if (!state || !state.cabinet) return { ok: false, msg: 'No cabinet.' };

    var ministry = state.cabinet.ministries[ministryId];
    if (!ministry) return { ok: false, msg: 'Unknown ministry.' };
    if (ministry.party !== partyId) return { ok: false, msg: 'Not your ministry.' };

    var action = null;
    for (var i = 0; i < ministry.actions.length; i++) {
      if (ministry.actions[i].id === actionId) { action = ministry.actions[i]; break; }
    }
    if (!action) return { ok: false, msg: 'Unknown action.' };

    // ---- One ministry action per faction per week. Does not cost AP
    //      and does not block the weekly field action.
    if (!state.shared[partyId]) {
      state.shared[partyId] = {};
    }
    if (state.shared[partyId].ministryActionUsedThisWeek) {
      return { ok: false, msg: 'You already used your ministry action this week.' };
    }

    // ---- Requires gate.
    if (action.requires) {
      for (var rk in action.requires) {
        if (!action.requires.hasOwnProperty(rk)) continue;
        var have = 0;
        if (rk === 'monarchySympathizers') have = state.monarchySympathizers || 0;
        else if (rk === 'investigate_bl') have = state.blackLeagueInvestigated ? 1 : 0;
        else if (rk === 'prosecute_bl') have = state.blackLeagueProsecuted ? 1 : 0;
        else if (rk === 'banSplinters') have = state.blackLeagueBanned ? 1 : 0;
        else have = state[rk] !== undefined ? state[rk] : 0;
        if (have < action.requires[rk]) {
          return { ok: false, msg: 'Requires ' + rk + ' ≥ ' + action.requires[rk] + '.' };
        }
      }
    }

    // ---- Resource holder: the faction's shared block. Create it if the
    //      faction module never initialised one, so effects are always
    //      visible in the Status panel.
    if (!state.shared[partyId]) {
      state.shared[partyId] = {
        support: (state.partySupport && state.partySupport[partyId]) || 0,
        funds: state.funds || 0,
        volunteers: state.volunteers || 0,
        unity: state.unity || 60,
        faculty: state.faculty || 50,
        momentum: state.momentum || 0,
        ap: state.ap || 3
      };
    }
    var shared = state.shared[partyId];
    var fundsHolder = shared;
    var apHolder = shared;
    var volHolder = shared;
    var unityHolder = shared;
    var facultyHolder = shared;
    var momentumHolder = shared;

    // ---- Cost checks ----
    var costAp = (action.cost && action.cost.ap) || 0;
    var costBudget = (action.cost && action.cost.budget) || 0;

    var haveAp = (shared && shared.ap !== undefined) ? shared.ap
               : (state.ap !== undefined ? state.ap : 0);
    var haveFunds = (fundsHolder.funds !== undefined) ? fundsHolder.funds : 0;

    if (costAp > 0 && haveAp < costAp) {
      return { ok: false, msg: 'Not enough AP (need ' + costAp + ', have ' + haveAp + ').' };
    }
    if (costBudget > 0 && haveFunds < costBudget) {
      return { ok: false, msg: 'Not enough funds (need $' + costBudget + ', have $' + haveFunds + ').' };
    }

    // ---- Debit ---- (ministry actions never cost AP; funds still apply)
    if (costBudget > 0) {
      fundsHolder.funds -= costBudget;
    }

    // ---- Apply effect ----
    var notes = [];
    var eff = action.effect || {};

    // Funds.
    if (eff.funds) {
      fundsHolder.funds = Math.max(0, (fundsHolder.funds || 0) + eff.funds);
      notes.push('Funds +$' + eff.funds + '.');
    }

    // Unity / faculty / momentum — write to the shared block where the
    // faction's UI reads them, and mirror to state for the fallback.
    if (eff.unity) {
      var uBase = (unityHolder.unity !== undefined) ? unityHolder.unity : 50;
      unityHolder.unity = clamp(uBase + eff.unity, 0, 100);
      state.unity = unityHolder.unity;
      notes.push('Unity ' + (eff.unity >= 0 ? '+' : '') + eff.unity + '.');
    }
    if (eff.faculty) {
      var fBase = (facultyHolder.faculty !== undefined) ? facultyHolder.faculty : 50;
      facultyHolder.faculty = clamp(fBase + eff.faculty, 0, 100);
      state.faculty = facultyHolder.faculty;
      notes.push('Faculty ' + (eff.faculty >= 0 ? '+' : '') + eff.faculty + '.');
    }
    if (eff.momentum) {
      var mBase = (momentumHolder.momentum !== undefined) ? momentumHolder.momentum : 0;
      momentumHolder.momentum = clamp(mBase + eff.momentum, -10, 20);
      state.momentum = momentumHolder.momentum;
      notes.push('Momentum ' + (eff.momentum >= 0 ? '+' : '') + eff.momentum + '.');
    }
    if (eff.volunteers) {
      volHolder.volunteers = Math.max(0, (volHolder.volunteers || 0) + eff.volunteers);
      notes.push('Volunteers ' + (eff.volunteers >= 0 ? '+' : '') + eff.volunteers + '.');
    }

    // Party support bumps — write to raw, which the mirror step will
    // pull into partySupport next resolve.
    if (eff.zmp && D && D.DEMOS && state.raw.ZMP) {
      for (var z = 0; z < D.DEMOS.length; z++) {
        var zdm = D.DEMOS[z];
        state.raw.ZMP[zdm.id] = Math.max(0.5, (state.raw.ZMP[zdm.id] || 0) + eff.zmp);
      }
      notes.push('ZMP +' + eff.zmp + '%.');
    }
    if (eff.bl && D && D.DEMOS && state.raw.bl) {
      for (var b = 0; b < D.DEMOS.length; b++) {
        var bdm = D.DEMOS[b];
        state.raw.bl[bdm.id] = Math.max(0.5, (state.raw.bl[bdm.id] || 0) + eff.bl);
      }
      notes.push('BL ' + (eff.bl >= 0 ? '+' : '') + eff.bl + '%.');
    }
    if (eff.iia && D && D.DEMOS && state.raw.iia) {
      for (var ii = 0; ii < D.DEMOS.length; ii++) {
        var idm = D.DEMOS[ii];
        state.raw.iia[idm.id] = Math.max(0.5, (state.raw.iia[idm.id] || 0) + eff.iia);
      }
      notes.push('IIA +' + eff.iia + '%.');
    }
    if (eff.pl && D && D.DEMOS && state.raw.pl) {
      for (var pli = 0; pli < D.DEMOS.length; pli++) {
        var pldm = D.DEMOS[pli];
        state.raw.pl[pldm.id] = Math.max(0.5, (state.raw.pl[pldm.id] || 0) + eff.pl);
      }
      notes.push('PL +' + eff.pl + '%.');
    }
    if (eff.sportica && D && D.DEMOS && state.raw.sportica) {
      for (var sp = 0; sp < D.DEMOS.length; sp++) {
        var spdm = D.DEMOS[sp];
        state.raw.sportica[spdm.id] = Math.max(0.5, (state.raw.sportica[spdm.id] || 0) + eff.sportica);
      }
      notes.push('Sportica +' + eff.sportica + '%.');
    }

    // Demographic bumps (freshmen, honor, gamers, etc.) — these all write
    // into the ZMP demographic columns, mirroring applyEffects' convention.
    var demoKeys = ['freshmen', 'seniors', 'athletes', 'arts', 'gamers',
                    'honor', 'honors', 'buskids', 'faculty', 'unity'];
    for (var dk = 0; dk < demoKeys.length; dk++) {
      var key = demoKeys[dk];
      if (eff[key] && D && D.DEMOS && state.raw.ZMP) {
        // Match "honor" and "honors" to whichever demo id exists.
        for (var dj = 0; dj < D.DEMOS.length; dj++) {
          var dmj = D.DEMOS[dj];
          if (dmj.id === key || (key === 'honors' && dmj.id === 'honor')) {
            state.raw.ZMP[dmj.id] = Math.max(0.5, (state.raw.ZMP[dmj.id] || 0) + eff[key]);
          }
        }
        notes.push(key + ' ' + (eff[key] >= 0 ? '+' : '') + eff[key] + '%.');
      }
    }

    // Political flags used by the justice chain.
    if (eff.monarchySympathizers) {
      state.monarchySympathizers = (state.monarchySympathizers || 0) + eff.monarchySympathizers;
      notes.push('Monarchy sympathizers +' + eff.monarchySympathizers + '.');
    }
    if (eff.investigate_bl) {
      state.blackLeagueInvestigated = true;
      notes.push('Black League investigation opened.');
    }
    if (eff.prosecute_bl) {
      state.blackLeagueProsecuted = true;
      notes.push('Black League prosecutions begin.');
    }
    if (eff.banSplinters) {
      state.blackLeagueBanned = true;
      notes.push('Splinter parties banned.');
    }
    if (eff.dismantleBL) {
      if (D && D.DEMOS && state.raw.bl) {
        for (var dmn = 0; dmn < D.DEMOS.length; dmn++) {
          var dmid = D.DEMOS[dmn].id;
          state.raw.bl[dmid] = 0.5;
          if (state.raw.crnp) state.raw.crnp[dmid] = 0.5;
          if (state.raw.flo)  state.raw.flo[dmid]  = 0.5;
          if (state.raw.nhp)  state.raw.nhp[dmid]  = 0.5;
        }
      }
      state.blSplintered = true;
      notes.push('Black League dismantled.');
    }

    // Mirror every resource back to both places so the UI sees it no matter
    // which holder the effect was written to.
    if (shared) {
      if (fundsHolder === state) shared.funds = state.funds;
      if (volHolder === state) shared.volunteers = state.volunteers;
      if (unityHolder === state) shared.unity = state.unity;
      if (facultyHolder === state) shared.faculty = state.faculty;
      if (momentumHolder === state) shared.momentum = state.momentum;
    } else {
      if (fundsHolder.funds !== undefined) state.funds = fundsHolder.funds;
      if (volHolder.volunteers !== undefined) state.volunteers = volHolder.volunteers;
      if (unityHolder.unity !== undefined) state.unity = unityHolder.unity;
      if (facultyHolder.faculty !== undefined) state.faculty = facultyHolder.faculty;
      if (momentumHolder.momentum !== undefined) state.momentum = momentumHolder.momentum;
    }

        // ---- Propagate party-targeted effects into shared support so the
    //      poll reflects them immediately. Without this, ministry
    //      effects are written to raw (election engine) but never to
    //      shared.support (poll + UI), so the poll never moves.
    var partyEffectMap = {
      zmp:      'ZMP',
      bl:       'BL',
      iia:      'IIA',
      pl:       'PL',
      sportica: 'SPORTICA',
      red:      'RED',
      rb:       'RB',
      zpf:      'ZPF',
      semp:     'SEMP',
      republia: 'REPUBLIA'
    };
    for (var pekey in partyEffectMap) {
      if (!eff[pekey]) continue;
      var pid = partyEffectMap[pekey];
      if (!state.shared[pid]) state.shared[pid] = {};
      if (typeof state.shared[pid].support !== 'number') {
        state.shared[pid].support = (state.partySupport && state.partySupport[pid]) || 10;
      }
      state.shared[pid].support = Math.max(0.5, state.shared[pid].support + eff[pekey]);
    }

    // ---- Demographic effects on ZMP demos also nudge ZMP's flat
    //      support so the poll visibly grows. Sum the demo deltas and
    //      scale by 1/8 (7 demos + headroom).
    var demoKeysForPoll = ['freshmen','seniors','athletes','arts','gamers','honor','honors','buskids'];
    var demoDeltaForPoll = 0;
    for (var dkp = 0; dkp < demoKeysForPoll.length; dkp++) {
      var dk2 = demoKeysForPoll[dkp];
      if (eff[dk2]) demoDeltaForPoll += eff[dk2];
    }
    if (demoDeltaForPoll !== 0) {
      if (!state.shared.ZMP) state.shared.ZMP = {};
      if (typeof state.shared.ZMP.support !== 'number') {
        state.shared.ZMP.support = (state.partySupport && state.partySupport.ZMP) || 30;
      }
      state.shared.ZMP.support = Math.max(0.5, state.shared.ZMP.support + demoDeltaForPoll / 8);
    }

    // ---- Recompute the flat party support table so the UI sees the change.
    syncPartySupportFromRaw(state);

    state.shared[partyId].ministryActionUsedThisWeek = true;

    state.log.push('Week ' + state.week + ': ' + partyId + ' used ' +
      action.name + ' in ' + ministry.name + '.');
    if (notes.length > 0) {
      state.log.push('  ' + notes.join(' '));
    }

    return { ok: true, notes: notes };
  }

  function getMinistryActionsFor(partyId) {
    if (!state || !state.cabinet) return [];
    var result = [];
    for (var mid in state.cabinet.ministries) {
      var m = state.cabinet.ministries[mid];
      if (m.party === partyId) {
        for (var i = 0; i < m.actions.length; i++) {
          result.push({ ministryId: mid, ministryName: m.name, action: m.actions[i] });
        }
      }
    }
    return result;
  }

  function getPresidentialCandidatesFor(factionId) {
    var own = PRESIDENTIAL_CANDIDATES[factionId] || [];
    var all = [];
    for (var fid in PRESIDENTIAL_CANDIDATES) {
      var pool = PRESIDENTIAL_CANDIDATES[fid];
      for (var i = 0; i < pool.length; i++) {
        all.push({
          candidateId: pool[i].id,
          name: pool[i].name,
          party: pool[i].party,
          desc: pool[i].desc,
          isOwn: fid === factionId
        });
      }
    }
    return { own: own, all: all };
  }

  function getFormationChoicesFor(leaderId) {
    var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;
    var eligible = COALITION_TEMPLATES.filter(function (t) { return t.leader === leaderId; });
    var choices = [];
    for (var i = 0; i < eligible.length; i++) {
      var t = eligible[i];
      var total = seatsOf(leaderId);
      for (var j = 0; j < t.partners.length; j++) total += seatsOf(t.partners[j]);
      choices.push({
        templateId: t.id,
        name: t.name,
        partners: t.partners,
        seats: total,
        reachesMajority: total >= majority
      });
    }
    return choices;
  }


  return {
    CFG: CFG,
    COALITION_TEMPLATES: COALITION_TEMPLATES,
    MINISTRY_LIST: MINISTRY_LIST,
    MINISTRY_ACTIONS: MINISTRY_ACTIONS,
    PRESIDENTIAL_CANDIDATES: PRESIDENTIAL_CANDIDATES,
    AVAILABLE_MINISTERS: AVAILABLE_MINISTERS,

    newMatch: newMatch,
    initAdvisorTrackersMP: initAdvisorTrackersMP,
    rotateAdvisorMP: rotateAdvisorMP,
    registerFaction: registerFaction,
    submitAction: submitAction,
    allReady: allReady,
    resolveWeek: resolveWeek,
    getActionsFor: getActionsFor,
    markDisconnected: markDisconnected,
    markReconnected: markReconnected,
    getVisibleStateFor: getVisibleStateFor,
    getState: function () { return state; },
    findPlayer: findPlayer,
    getFaction: getFaction,

    acceptEvent: acceptEvent,
    passEvent: passEvent,
    deferEvent: deferEvent,
    expireEvents: expireEvents,
    fireEventsForWeek: fireEventsForWeek,
    queueEvent: queueEvent,
    pickHandler: pickHandler,

    startFormationCycle: startFormationCycle,
    attemptFormation: attemptFormation,
    computeWillingness: computeWillingness,

    formCabinet: formCabinet,
    assignMinistry: assignMinistry,

    startPresidentialCycle: startPresidentialCycle,
    submitPresidentialChoice: submitPresidentialChoice,
    resolvePresidentialElection: resolvePresidentialElection,

    allocateSeats: allocateSeats,
    calculateParamilitaryStrength: calculateParamilitaryStrength,
    breakWall: breakWall,
    sortBySupport: sortBySupport,
    getSupportOf: getSupportOf,
    getPartySupport: getPartySupport,
    activeParties: activeParties,
    getParty: getParty,
    clamp: clamp,
    initRelations: initRelations,
    decayRelations: decayRelations,
    syncPartySupportFromRaw: syncPartySupportFromRaw,
    submitFormationChoice: submitFormationChoice,
    resolvePendingBattles: resolvePendingBattles,
    setBattleChoice: setBattleChoice,
    markBattleResolved: markBattleResolved,
    pickBestTemplate: pickBestTemplate,
    autoResolveFormation: autoResolveFormation,
    pickAiPresidentialChoice: pickAiPresidentialChoice,
    autoResolveAiPresidentialChoices: autoResolveAiPresidentialChoices,
    resolveMinistryAction: resolveMinistryAction,
    getMinistryActionsFor: getMinistryActionsFor,
    getPresidentialCandidatesFor: getPresidentialCandidatesFor,
    getFormationChoicesFor: getFormationChoicesFor,
    checkFormationEvents: checkFormationEvents,
  };
})();