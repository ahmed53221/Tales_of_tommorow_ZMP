/* Zalgrilian_council.js — Zalgrilian Council mode engine.
 *
 * Launched from two endings only:
 *   - Fast Putsch (peaceful)
 *   - Stalemate A (monarchist civil war victory)
 *
 * The ordinary Council is dissolved. The Zalgrilian Council replaces it.
 * 45 seats. 20 weeks. Elections at weeks 1, 5, 10, 15, 20.
 *
 * Weeks 1-16: campaign phase.
 * Weeks 17-20: constitutional convention phase.
 *
 * NEW: coalitions, defections, ZAP capital plot, ZEJ outlawing, weekly events.
 *
 * Exposes: window.ZalgrilianCouncil
 */
window.ZalgrilianCouncil = (function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    totalWeeks: 20,
    electionWeeks: [1, 5, 10, 15, 20],
    seatsTotal: 45,
    majority: 23,
    threshold: 5,
    startingAP: 3,
    apPerHighUnity: 1,
    conventionStart: 17,

    // The school is on fire. Order must be restored.
    chaos: {
      startingInstability: 65,
      strikeChance: 0.20,
      riotChance: 0.20,
      walkoutChance: 0.15,
      assassinationChance: 0.10
    },

    // Coalition threshold — affinity ≥ this means coalition-ready
    coalitionAffinity: 60,
    coalitionBreakAffinity: 30,

    // Defection thresholds
    splinterThreshold: 3,       // % below which a party's voters flow away
    unitySplinterThreshold: 30, // unity below which ZMP can splinter

    // Passive growth
    passive: {
      baseFunds:       6,
      fundsPerSeat:    0.6,
      fundsPerSupport: 0.15,
      fundsMax:        60,

      baseVolunteers:  2,
      volPerSeat:      0.08,
      volPerSupport:   0.04,
      volPerMomentum:  0.5,
      volMax:          18
    },

    startSupport: {
      ZMP:  55,
      ZPF:  20,
      ZAP:  10,
      RBMP: 11,
      ZEJ:   7,
      PLMS:  2,
      other: 0
    },

    historicalTrack: [55, 53, 46, 57, 72]
  };

  // ============================================================
  // PARTIES
  // ============================================================
  var PARTIES = [
    { id: 'ZMP',  name: 'Zalgrilian Majority Party', short: 'ZMP',  color: '#5fae3c', player: true,
      blurb: 'The governing party of the restored monarchy. Zalian majority. Pro-crown.' },
    { id: 'ZPF',  name: 'Centre Party',                 short: 'ZPF',  color: '#006400',
      blurb: 'The Catholic centre. Main rival early, coalition partner in the middle. Historically broken by the fifth election.' },
    { id: 'ZAP',  name: 'Zalian Alternative Party',     short: 'ZAP',  color: '#c08040',
      blurb: 'Centrist alternative. Wants to strip rights from Zalirians. Wants the capital moved back to Nezle.' },
    { id: 'RBMP', name: 'Red and RB Minority Party',    short: 'RBMP', color: '#cc0000',
      blurb: 'Fusion of the Red Front and Red Bench. Labour and minority-interest bloc.' },
    { id: 'ZEJ',  name: 'Zalian Extreme Jihad',         short: 'ZEJ',  color: '#a000a0',
      blurb: 'The jihadist wing. Roughly 7% and stable. Will not compromise.' },
    { id: 'PLMS', name: 'Pink League Members',          short: 'PLMS', color: '#e0518f',
      blurb: 'Small pink party. Never rose above 2%. Runs on colour and charm.' },
    { id: 'other',name: 'Independents',                 short: 'Others', color: '#9aa0a6',
      blurb: 'Assorted independents and one persistent write-in campaign.' }
  ];

  // ============================================================
  // BLOCS
  // ============================================================
  var BLOCS = [
    { id: 'urban',      name: 'Urban Zalians',       weight: 0.24 },
    { id: 'rural',      name: 'Rural Zalians',       weight: 0.20 },
    { id: 'workers',    name: 'Industrial Workers',  weight: 0.18 },
    { id: 'minorities', name: 'Zalirian Minority',   weight: 0.14 },
    { id: 'clerical',   name: 'Clerical Networks',   weight: 0.12 },
    { id: 'youth',      name: 'Urban Youth',         weight: 0.12 }
  ];

  // ============================================================
  // CAMPAIGN ACTIONS
  // ============================================================
    { id: 'crackdown',  name: 'Deploy the Legion',  ap: 2, funds: 10, vol: 0, desc: 'Use the Dzehurjaca Legion to clear the streets. Reduces chaos, but angers the opposition.' },
    { id: 'fundraise',  name: 'Bake Sale',          ap: 1, funds: 0,  vol: 0, desc: 'Raise campaign funds. Scales with volunteers.' },
    { id: 'canvass',    name: 'Canvass a Bloc',     ap: 1, funds: 0,  vol: 2, needsTarget: 'bloc',  desc: 'Send volunteers to a voting bloc.' },
    { id: 'posters',    name: 'Poster Run',         ap: 1, funds: 5,  vol: 1, desc: 'Cheap poster run. ZMP gain.' },
    { id: 'rally',      name: 'Hold a Rally',       ap: 1, funds: 14, vol: 4, desc: 'Public rally. Support, momentum, volunteers.' },
    { id: 'negotiate',  name: 'Back-Room Talks',    ap: 1, funds: 4,  vol: 0, needsTarget: 'party', desc: 'Improve affinity with a rival party.' },
    { id: 'coalition',  name: 'Offer Coalition',    ap: 2, funds: 12, vol: 2, needsTarget: 'party', desc: 'Formal coalition offer. Needs affinity ≥ 60.' },
    { id: 'attack',     name: 'Attack a Party',     ap: 1, funds: 8,  vol: 2, needsTarget: 'party', desc: 'Attack leaflets. Effective, but unity hit.' },
    { id: 'lobby',      name: 'Constitutional Lobby', ap: 2, funds: 20, vol: 3, needsTarget: 'clause', desc: 'Pre-commit a constitutional clause.' }
  ];

  // ============================================================
  // CONSTITUTIONAL CLAUSES
  // ============================================================
  var CLAUSES = [
    { id: 'monarchy_powers', name: 'Crown Powers', options: [
        { id: 'strong',   name: 'Strong Crown',    desc: 'The King appoints the Chancellor and can dissolve the Council.',
          effects: { ZMP: +4, ZPF: +2, ZAP: -2, RBMP: -4, ZEJ: -3, unity: -3 } },
        { id: 'balanced', name: 'Balanced Crown',  desc: 'The King appoints the Chancellor from the Council majority.',
          effects: { ZMP: +1, ZPF: +1, ZAP: +0, RBMP: +1, ZEJ: -1, unity: +2 } },
        { id: 'weak',     name: 'Weak Crown',      desc: 'The Chancellor is elected by the Council. The King is ceremonial.',
          effects: { ZMP: -3, ZPF: -3, ZAP: +4, RBMP: +3, ZEJ: +1, unity: +3 } }
      ]},
    { id: 'zalirian_rights', name: 'Zalirian Rights', options: [
        { id: 'protected',    name: 'Protected',         desc: 'Full civil rights for Zalirians enshrined in the constitution.',
          effects: { ZMP: -2, ZPF: +1, ZAP: -6, RBMP: +5, ZEJ: -2, unity: -4 } },
        { id: 'equal_silent', name: 'Equal but Silent', desc: 'Formal equality, no affirmative protections.',
          effects: { ZMP: +1, ZPF: +1, ZAP: +1, RBMP: +1, ZEJ: +0, unity: +1 } },
        { id: 'stripped',     name: 'Rights Stripped',  desc: 'Zalirians lose the vote, the right to hold office, and property.',
          effects: { ZMP: +3, ZPF: -4, ZAP: +8, RBMP: -10, ZEJ: +3, unity: -8, radicalise: 'RBMP' } }
      ]},
    { id: 'capital', name: 'Capital', options: [
        { id: 'current', name: 'Keep Current Capital', desc: 'The capital remains where it is.',
          effects: { ZMP: +2, ZPF: +2, ZAP: -5, RBMP: +2, ZEJ: +1, unity: +2 } },
        { id: 'nezle',   name: 'Move to Nezle',        desc: 'The capital returns to Nezle, the old city in the valley.',
          effects: { ZMP: -3, ZPF: -2, ZAP: +7, RBMP: +1, ZEJ: +2, unity: -3 } }
      ]},
    { id: 'suffrage', name: 'Suffrage', options: [
        { id: 'universal', name: 'Universal Male Suffrage', desc: 'All adult Zalian men vote. Women may stand for local office only.',
          effects: { ZMP: +1, ZPF: +1, ZAP: +1, RBMP: +2, ZEJ: +0, unity: +2 } },
        { id: 'property',  name: 'Property Suffrage',       desc: 'Only property-holders vote.',
          effects: { ZMP: -2, ZPF: +2, ZAP: +3, RBMP: -6, ZEJ: -1, unity: -3 } },
        { id: 'expanded',  name: 'Expanded Suffrage',       desc: 'All adults vote, including Zalirians and women.',
          effects: { ZMP: -1, ZPF: -1, ZAP: -4, RBMP: +6, ZEJ: -3, unity: -2 } }
      ]},
    { id: 'emergency', name: 'Emergency Powers', options: [
        { id: 'granted', name: 'Granted to Crown', desc: 'The crown may rule by decree in emergencies.',
          effects: { ZMP: +3, ZPF: +2, ZAP: -2, RBMP: -5, ZEJ: -2, unity: -4 } },
        { id: 'limited', name: 'Limited and Reviewable', desc: 'Emergency powers require Council review within 30 days.',
          effects: { ZMP: +0, ZPF: +0, ZAP: +1, RBMP: +2, ZEJ: +0, unity: +2 } },
        { id: 'denied',  name: 'Denied', desc: 'No emergency powers. The Council governs at all times.',
          effects: { ZMP: -3, ZPF: -2, ZAP: +4, RBMP: +4, ZEJ: +1, unity: +4 } }
      ]}
  ];

  // ============================================================
  // EVENT POOL (fires on non-election weeks)
  // ============================================================
  var EVENTS = [
    {
      id: 'zap_capital_plot',
      week: 8,
      title: 'The Nezle Question',
      body: 'ZAP has forced a vote on the capital. They demand the seat of government move from the current capital back to Nezle — the old city in the valley. ZMP has always held the current capital. If you resist, you stand for continuity. If you concede, you weaken your own base but humiliate ZAP.',
      choices: [
        { text: 'Resist. The capital stays.',
          effects: { ZMP: +2, ZAP: -6, RBMP: +1, ZPF: +1, unity: +2 },
          note: 'Continuity.' },
        { text: 'Concede. Let Nezle be the capital.',
          effects: { ZMP: -3, ZAP: +5, RBMP: +2, unity: -2 },
          note: 'Historic. Costly.' },
        { text: 'Compromise. A summer seat at Nezle.',
          effects: { ZMP: +0, ZAP: +1, ZPF: +1, unity: +1 },
          note: 'Half the prize.' }
      ]
    },
    {
      id: 'zej_outlaw',
      week: 13,
      title: 'Outlaw the Jihadists?',
      body: 'ZEJ has grown to roughly 7% of the electorate and their rhetoric grows sharper by the week. ZMP can move to outlaw them — but banning a party sets a precedent, and it will not be lost on ZAP or RBMP.',
      choices: [
        { text: 'Outlaw ZEJ. Ban them from the Council.',
          effects: { ZMP: +4, ZEJ: -7, ZAP: +2, RBMP: +1, unity: +3, radicalise: 'ZEJ' },
          note: 'Their 7% is redistributed. Precedent set.' },
        { text: 'Leave them alone. Outlawing is worse than tolerating.',
          effects: { ZMP: -1, ZEJ: +1, ZPF: +1, RBMP: +2, unity: +1 },
          note: 'Tolerated.' },
        { text: 'Investigate them. No ban yet.',
          effects: { ZMP: +1, ZEJ: -2, unity: +1 },
          note: 'Half-measure.' }
      ]
    },
    {
      id: 'rbmp_split',
      week: 11,
      title: 'RBMP Internals',
      body: 'RBMP is a fusion of the old Red Front and Red Bench. The marriage has not been happy. Two blocs inside the party want different things: one wants to pivot to ZMP, one wants to pivot to ZAP.',
      choices: [
        { text: 'Encourage the ZMP-leaning bloc. Offer them terms.',
          effects: { ZMP: +3, RBMP: -3, ZAP: -1, unity: -1 },
          note: 'You weaken RBMP, strengthen yourself.' },
        { text: 'Stay out of it. Let them sort it out.',
          effects: { RBMP: +1, ZMP: -1, unity: +1 },
          note: 'Neutral.' },
        { text: 'Back the ZAP-leaning bloc to split RBMP.',
          effects: { ZMP: -2, RBMP: -4, ZAP: +4, unity: -2 },
          note: 'Reduce their seats, but hand ZAP a gift.' }
      ]
    },
    {
      id: 'zpf_peace',
      week: 6,
      title: 'ZPF Peace Feelers',
      body: 'ZPF sends a quiet emissary. They want to know: if they stop attacking you, will you stop attacking them? There is no formal deal, only a handshake.',
      choices: [
        { text: 'Accept. A truce with ZPF.',
          effects: { ZMP: +1, ZPF: +2, unity: +2 },
          note: 'Two parties stand down.' },
        { text: 'Refuse. No deals with the old guard.',
          effects: { ZMP: +1, ZPF: -2, unity: -1 },
          note: 'Momentum over manners.' },
        { text: 'Counter-offer: coalition talks.',
          effects: { ZMP: +0, ZPF: +1, unity: +1 },
          note: 'Ambitious.' }
      ]
    },
    {
      id: 'plms_mascot',
      week: 4,
      title: 'The Pink Incident',
      body: 'PLMS has unveiled a new party mascot: a vast pink elephant that takes four volunteers to move. They want to parade it through the Council chamber. Everything depends on your sense of humour.',
      choices: [
        { text: 'Allow it. The Council could use a laugh.',
          effects: { ZMP: +2, PLMS: +1, unity: +2 },
          note: 'Popular with the public.' },
        { text: 'Refuse. No distractions.',
          effects: { ZMP: +0, PLMS: -1, unity: -1 },
          note: 'Stern.' },
        { text: 'Send a gift to PLMS instead.',
          effects: { ZMP: +1, PLMS: +2, funds: -10, unity: +1 },
          note: 'Buys their goodwill.' }
      ]
    },
    {
      id: 'zed_split',
      week: 9,
      title: 'A Question of Suffrage',
      body: 'A backbench ZMP bloc wants to push for expanded suffrage — Zalirian votes, women votes. The leadership is nervous. The radical wing of your own party is threatening to split over it.',
      choices: [
        { text: 'Back the reform. Rights first.',
          effects: { ZMP: -3, RBMP: +3, ZAP: -3, ZPF: -1, unity: -4 },
          note: 'Principled, costly.' },
        { text: 'Burke it. Not now.',
          effects: { ZMP: +2, RBMP: -2, unity: +2 },
          note: 'Pragmatic.' },
        { text: 'Study the question. Kick it down the road.',
          effects: { ZMP: +0, unity: +1 },
          note: 'Do nothing.' }
      ]
    },
    {
      id: 'zj_militia',
      week: 16,
      title: 'ZEJ Marches',
      body: 'ZEJ has organised a public march through the capital. Thousands turn out. The Interior Ministry wants permission to break it up. The Council is split.',
      choices: [
        { text: 'Allow the march. Free assembly.',
          effects: { ZMP: -2, ZEJ: +3, RBMP: +1, unity: -2 },
          note: 'Principle, even for enemies.' },
        { text: 'Break it up. By force.',
          effects: { ZMP: +3, ZEJ: -3, RBMP: -2, ZPF: -1, unity: -4 },
          note: 'Order at a cost.' },
        { text: 'Let it happen, but condemn it.',
          effects: { ZMP: +1, ZEJ: +1, unity: +1 },
          note: 'Both ways.' }
      ]
    }
  ];

  // ============================================================
  // STATE
  // ============================================================
  function makeRng(seed) {
    var s = seed || (Date.now() % 2147483647) || 12345;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function round1(v) { return Math.round(v * 10) / 10; }

  function newGame(opts) {
    opts = opts || {};
    var rng = makeRng(opts.seed);

    var support = {};
    var total = 0;
    for (var pid in CFG.startSupport) {
      support[pid] = CFG.startSupport[pid];
      total += CFG.startSupport[pid];
    }
    for (var pid2 in support) {
      support[pid2] = (support[pid2] / total) * 100;
    }

    return {
      week: 1,
      phase: 'campaign',
      rng: rng,

      ap: CFG.startingAP,
      funds: 80,
      volunteers: 12,
      unity: 60,
      momentum: 0,
      instability: 65, // <-- The streets are burning
      walkouts: [],

      support: support,
      affinity: initAffinity(),
      merged: [],
      coalition: [],          // party ids currently in coalition with ZMP

      history: [],
      electionResults: [],
      pendingEvent: null,
      pendingAction: null,
      eventDone: {},          // eventId -> true

      convention: {
        clauseIndex: 0,
        decisions: {}
      },

      log: ['The Zalgrilian Council is convened. The first election is held.'],
      outcome: null,
      radicalised: [],
      triggeredFrom: opts.triggeredFrom || 'unknown'
    };
  }

  function initAffinity() {
    return { ZPF: 60, ZAP: 40, RBMP: 55, ZEJ: 20, PLMS: 50, other: 50 };
  }

  function getParty(id) {
    for (var i = 0; i < PARTIES.length; i++) {
      if (PARTIES[i].id === id) return PARTIES[i];
    }
    return null;
  }

  function activeParties(st) {
    var out = [];
    for (var i = 0; i < PARTIES.length; i++) {
      var p = PARTIES[i];
      if (st.merged.indexOf(p.id) === -1) out.push(p);
    }
    return out;
  }

  // ============================================================
  // SUPPORT / SEATS
  // ============================================================
  function computeSupport(st) {
    var total = 0;
    for (var pid in st.support) {
      if (st.merged.indexOf(pid) !== -1) continue;
      total += st.support[pid];
    }
    var out = {};
    for (var pid2 in st.support) {
      if (st.merged.indexOf(pid2) !== -1) continue;
      out[pid2] = total > 0 ? (st.support[pid2] / total) * 100 : 0;
    }
    return out;
  }

  function allocateSeats(percentages) {
    var eligible = {}, sum = 0;
    for (var pid in percentages) {
      if (pid === 'other') continue;
      if (percentages[pid] >= CFG.threshold) {
        eligible[pid] = percentages[pid];
        sum += percentages[pid];
      }
    }
    if (sum === 0) return {};
    var seats = {}, divisors = {};
    for (var pid2 in eligible) { seats[pid2] = 0; divisors[pid2] = 1; }
    for (var s = 0; s < CFG.seatsTotal; s++) {
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

  function snapshot(st, label) {
    var sup = computeSupport(st);
    var seats = allocateSeats(sup);
    var snap = {
      label: label, week: st.week,
      support: sup, seats: seats,
      ap: st.ap, funds: st.funds,
      volunteers: st.volunteers, unity: st.unity,
      coalition: st.coalition.slice()
    };
    st.history.push(snap);
    return snap;
  }

  // ============================================================
  // ELECTION
  // ============================================================
  function runElection(st) {
    var sup = computeSupport(st);
    var seats = allocateSeats(sup);
    var electionIndex = st.electionResults.length;
    var zmpPercent = sup.ZMP || 0;

    var result = {
      week: st.week,
      electionIndex: electionIndex,
      percentages: sup, seats: seats,
      zmpPercent: zmpPercent,
      zmpSeats: seats.ZMP || 0,
      coalitionSeats: st.coalition.reduce(function (a, pid) {
        return a + (seats[pid] || 0);
      }, seats.ZMP || 0),
      historical: CFG.historicalTrack[electionIndex] || null
    };
    st.electionResults.push(result);
    st.log.push('Week ' + st.week + ': election held. ZMP ' +
      Math.round(zmpPercent) + '%, ' + (seats.ZMP || 0) + ' seats.');
    return result;
  }

  // ============================================================
  // PASSIVE GROWTH
  // ============================================================
  function applyPassiveGrowth(st) {
    var sup = computeSupport(st);
    var seats = allocateSeats(sup);
    var zmpSeats = seats.ZMP || 0;
    var zmpSupport = sup.ZMP || 0;
    var p = CFG.passive;

    var fundsGained = p.baseFunds + zmpSeats * p.fundsPerSeat + zmpSupport * p.fundsPerSupport;
    fundsGained = Math.round(Math.min(p.fundsMax, fundsGained));
    st.funds += fundsGained;

    var volGained = p.baseVolunteers + zmpSeats * p.volPerSeat + zmpSupport * p.volPerSupport +
      Math.max(0, st.momentum) * p.volPerMomentum;
    volGained = Math.round(Math.min(p.volMax, volGained));
    st.volunteers += volGained;

    if (st.week % 2 === 0) {
      st.log.push('Week ' + st.week + ': passive growth — +$' + fundsGained +
        ', +' + volGained + ' volunteers.');
    }
    return { funds: fundsGained, volunteers: volGained };
  }

  // ============================================================
  // COALITION TRACKING
  // ============================================================
  function isCoalitionReady(st, pid) {
    return (st.affinity[pid] || 0) >= CFG.coalitionAffinity;
  }

  function updateCoalitions(st) {
    // Break coalitions where affinity has fallen below the break threshold
    var toRemove = [];
    for (var i = 0; i < st.coalition.length; i++) {
      var pid = st.coalition[i];
      if ((st.affinity[pid] || 0) < CFG.coalitionBreakAffinity) {
        toRemove.push(pid);
      }
    }
    for (var j = 0; j < toRemove.length; j++) {
      var out = toRemove[j];
      st.coalition.splice(st.coalition.indexOf(out), 1);
      st.log.push('Week ' + st.week + ': ' + out + ' leaves the ZMP coalition.');
    }
  }

  function formCoalition(st, pid) {
    if (st.coalition.indexOf(pid) !== -1) return { ok: false, msg: 'Already in coalition.' };
    if (!isCoalitionReady(st, pid)) return { ok: false, msg: 'Affinity too low.' };
    st.coalition.push(pid);
    st.log.push('Week ' + st.week + ': ' + pid + ' joins the ZMP coalition.');
    return { ok: true, msg: pid + ' joins the coalition.' };
  }

  // ============================================================
  // DEFECTIONS
  // ============================================================
  function applyDefections(st) {
    var sup = computeSupport(st);
    var pids = Object.keys(sup);
    var notes = [];

    // 1. Small-party collapse: any party below threshold loses support to neighbours
    for (var i = 0; i < pids.length; i++) {
      var pid = pids[i];
      if (pid === 'ZMP' || pid === 'other') continue;
      if (sup[pid] < CFG.splinterThreshold && sup[pid] > 0.5) {
        // Flow to nearest party — ZMP or ZAP based on radicalisation
        var target = (st.radicalised.indexOf(pid) !== -1 || st.affinity[pid] < 40)
          ? 'ZAP'
          : 'ZMP';
        var transfer = sup[pid] * 0.4;
        st.support[pid] = Math.max(0.3, st.support[pid] * 0.6);
        st.support[target] = (st.support[target] || 0) + transfer;
        notes.push(pid + ' is collapsing. Voters flow to ' + target + '.');
      }
    }

    // 2. ZMP splinter if unity is very low
    if (st.unity < CFG.unitySplinterThreshold && !st._zmpSplit) {
      st._zmpSplit = true;
      var splinterSize = st.support.ZMP * 0.15;
      st.support.ZMP -= splinterSize;
      st.support.RBMP = (st.support.RBMP || 0) + splinterSize * 0.6;
      st.support.ZAP = (st.support.ZAP || 0) + splinterSize * 0.4;
      notes.push('ZMP splinters. A bloc defects to RBMP and ZAP.');
    }

    for (var n = 0; n < notes.length; n++) {
      st.log.push('Week ' + st.week + ': ' + notes[n]);
    }
    
    // --- THE INTERIM GOVERNMENT CHAOS ---
    var rng = st.rng;
    
    // 1. Strikes
    if (rng() < CFG.chaos.strikeChance && st.week > 1) {
      st.instability = Math.min(100, st.instability + 10);
      st.funds = Math.max(0, st.funds - 15);
      notes.push('A general strike empties the factories and the trams.');
    }
    
    // 2. Riots
    if (st.instability > 50 && rng() < CFG.chaos.riotChance) {
      st.unity = Math.max(0, st.unity - 5);
      st.instability = Math.min(100, st.instability + 5);
      notes.push('Mobs clash with the Legion in the outer districts.');
    }
    
    // 3. Walkouts
    if (st.instability > 65 && rng() < CFG.chaos.walkoutChance) {
      var parties = ['ZPF', 'ZAP', 'RBMP', 'ZEJ'];
      var target = parties[Math.floor(rng() * parties.length)];
      if (st.coalition.indexOf(target) === -1) {
        st.support[target] = Math.max(0.5, st.support[target] - 3);
        st.support.ZMP = Math.max(0.5, st.support.ZMP + 1);
        notes.push(target + ' delegates walk out. They refuse to sit at the table.');
      }
    }
    
    // 4. Assassination
    if (st.instability > 75 && rng() < CFG.chaos.assassinationChance) {
      st.unity = Math.max(0, st.unity - 10);
      st.instability = Math.min(100, st.instability + 10);
      notes.push('An attempt on a cabinet minister\'s life. The convention halts.');
    }

    for (var m = 0; m < notes.length; m++) {
      // Actually push the chaos notes to the log as well
      if (notes[m].indexOf('Week') === -1) st.log.push('Week ' + st.week + ': ' + notes[m]);
    }
    return notes;
  }

  // ============================================================
  // ACTIONS
  // ============================================================
  function doAction(st, actionId, target) {
    var act = null;
    for (var i = 0; i < ACTIONS.length; i++) {
      if (ACTIONS[i].id === actionId) act = ACTIONS[i];
    }
    if (!act) return { ok: false, msg: 'Unknown action.' };
    if (st.ap < act.ap) return { ok: false, msg: 'Not enough AP.' };
    if (st.funds < act.funds) return { ok: false, msg: 'Not enough funds.' };
    if (st.volunteers < act.vol) return { ok: false, msg: 'Not enough volunteers.' };

    st.ap -= act.ap;
    st.funds -= act.funds;
    st.volunteers -= act.vol;

    var mult = 1 + (st.momentum || 0) * 0.03 + (st.unity - 50) * 0.005;
    mult = clamp(mult, 0.5, 2.0);

    var msg = '';
    var extra = {};



    if (actionId === 'recruit') {
      var recGain = Math.round(4 + st.rng() * 4 + Math.max(0, st.momentum) * 0.4);
      st.volunteers += recGain;
      extra.volunteers = recGain;
      msg = 'Leafleted the school gates. ' + recGain + ' new volunteers.';

    } else if (actionId === 'crackdown') {
      st.instability = Math.max(0, st.instability - 20);
      st.unity = Math.max(0, st.unity - 3);
      st.support.ZMP = Math.max(0.5, st.support.ZMP + 2);
      st.support.ZPF = Math.max(0.5, st.support.ZPF - 2);
      st.support.ZAP = Math.max(0.5, st.support.ZAP - 2);
      st.support.RBMP = Math.max(0.5, st.support.RBMP - 2);
      msg = 'The Legion moves through the outer districts. The barricades come down.';
    
    } else if (actionId === 'fundraise') {
      var raised = Math.round(12 + st.volunteers * 0.8 + st.rng() * 10);
      st.funds += raised;
      extra.funds = raised;
      msg = 'Bake sale clears $' + raised + '.';

    } else if (actionId === 'canvass') {
      var gain = 0.9 * mult;
      st.support.ZMP += gain;
      st.support.ZPF = Math.max(0.5, st.support.ZPF - gain * 0.35);
      st.support.ZAP = Math.max(0.5, st.support.ZAP - gain * 0.25);
      st.support.RBMP = Math.max(0.5, st.support.RBMP - gain * 0.20);
      msg = 'Canvassers work the ' + (target || 'blocs') + '. ZMP +' + round1(gain) + '.';

    } else if (actionId === 'posters') {
      var posterGain = 0.6 * mult;
      st.support.ZMP += posterGain;
      st.support.ZAP = Math.max(0.5, st.support.ZAP - posterGain * 0.4);
      msg = 'Posters go up on every wall. ZMP +' + round1(posterGain) + '.';

    } else if (actionId === 'rally') {
      var rallyGain = 1.4 * mult;
      st.support.ZMP += rallyGain;
      st.support.ZPF = Math.max(0.5, st.support.ZPF - rallyGain * 0.3);
      st.support.ZAP = Math.max(0.5, st.support.ZAP - rallyGain * 0.2);
      st.support.RBMP = Math.max(0.5, st.support.RBMP - rallyGain * 0.15);
      st.momentum = clamp(st.momentum + 1, -10, 20);
      var rallyVol = Math.round(3 + st.rng() * 5);
      st.volunteers += rallyVol;
      extra.volunteers = rallyVol;
      msg = 'A rally in the square. ZMP +' + round1(rallyGain) +
        ', +' + rallyVol + ' volunteers.';

    } else if (actionId === 'negotiate') {
      if (!target || st.merged.indexOf(target) !== -1) {
        return { ok: false, msg: 'Cannot negotiate with that party.' };
      }
      var gain2 = 8 + st.rng() * 8;
      st.affinity[target] = clamp((st.affinity[target] || 50) + gain2, 0, 100);
      msg = 'Back-room talks with ' + target + '. Affinity +' + Math.round(gain2) + '.';

    } else if (actionId === 'coalition') {
      if (!target || st.merged.indexOf(target) !== -1) {
        return { ok: false, msg: 'Invalid coalition target.' };
      }
      if (st.coalition.indexOf(target) !== -1) {
        return { ok: false, msg: target + ' is already in the coalition.' };
      }
      if (!isCoalitionReady(st, target)) {
        return { ok: false, msg: target + ' affinity is too low for a coalition (need ' + CFG.coalitionAffinity + ').' };
      }
      var r = formCoalition(st, target);
      msg = r.msg;

    } else if (actionId === 'attack') {
      if (!target || st.merged.indexOf(target) !== -1) {
        return { ok: false, msg: 'Cannot attack that party.' };
      }
      var dmg = 2.5 * mult;
      // Coalition partners take less damage
      if (st.coalition.indexOf(target) !== -1) dmg *= 0.5;
      st.support[target] = Math.max(0.5, st.support[target] - dmg);
      st.support.ZMP += dmg * 0.5;
      st.affinity[target] = clamp((st.affinity[target] || 50) - 12, 0, 100);
      st.unity = clamp(st.unity - 2, 0, 100);
      msg = 'Attack leaflets against ' + target + '. They lose ' + round1(dmg) + '.';

    } else if (actionId === 'lobby') {
      if (!target || st.convention.decisions[target.clauseId] !== undefined) {
        return { ok: false, msg: 'Cannot lobby for that clause.' };
      }
      if (!st._lobbying) st._lobbying = {};
      st._lobbying[target.clauseId] = target.optionId;
      st.unity = clamp(st.unity + 1, 0, 100);
      msg = 'ZMP lobbyists pre-commit on ' + target.clauseId + ' → ' + target.optionId + '.';
    }

    st.log.push('Week ' + st.week + ': ' + msg);
    return { ok: true, msg: msg, extra: extra };
  }

  // ============================================================
  // EVENTS
  // ============================================================
  function eventForWeek(st) {
    for (var i = 0; i < EVENTS.length; i++) {
      var ev = EVENTS[i];
      if (ev.week === st.week && !st.eventDone[ev.id]) {
        return ev;
      }
    }
    return null;
  }

  function applyEventChoice(st, eventId, choiceIndex) {
    var ev = null;
    for (var i = 0; i < EVENTS.length; i++) {
      if (EVENTS[i].id === eventId) ev = EVENTS[i];
    }
    if (!ev) return { ok: false, msg: 'Unknown event.' };

    var choice = ev.choices[choiceIndex];
    if (!choice) return { ok: false, msg: 'Unknown choice.' };

    var eff = choice.effects || {};
    for (var pid in eff) {
      if (pid === 'unity') {
        st.unity = clamp(st.unity + eff[pid], 0, 100);
        continue;
      }
      if (pid === 'funds') {
        st.funds = Math.max(0, st.funds + eff[pid]);
        continue;
      }
      if (pid === 'radicalise') {
        if (st.radicalised.indexOf(eff[pid]) === -1) st.radicalised.push(eff[pid]);
        continue;
      }
      if (typeof eff[pid] === 'number' && st.support[pid] !== undefined) {
        st.support[pid] = Math.max(0.5, st.support[pid] + eff[pid]);
      }
    }

    st.eventDone[eventId] = true;
    st.log.push('Week ' + st.week + ': ' + ev.title + ' — ' + choice.text);
    return { ok: true, msg: choice.text };
  }

  // ============================================================
  // CLAUSES
  // ============================================================
  function presentClause(st) {
    var idx = st.convention.clauseIndex;
    if (idx >= CLAUSES.length) return null;
    return CLAUSES[idx];
  }

  function decideClause(st, clauseId, optionId) {
    var clause = null;
    for (var i = 0; i < CLAUSES.length; i++) {
      if (CLAUSES[i].id === clauseId) clause = CLAUSES[i];
    }
    if (!clause) return { ok: false, msg: 'Unknown clause.' };

    var option = null;
    for (var j = 0; j < clause.options.length; j++) {
      if (clause.options[j].id === optionId) option = clause.options[j];
    }
    if (!option) return { ok: false, msg: 'Unknown option.' };

    st.convention.decisions[clauseId] = optionId;
    var eff = option.effects || {};
    for (var pid in eff) {
      if (pid === 'unity') { st.unity = clamp(st.unity + eff[pid], 0, 100); continue; }
      if (typeof eff[pid] === 'number' && st.support[pid] !== undefined) {
        st.support[pid] = Math.max(0.5, st.support[pid] + eff[pid]);
      }
    }
    if (eff.radicalise && st.radicalised.indexOf(eff.radicalise) === -1) {
      st.radicalised.push(eff.radicalise);
    }

    st.convention.clauseIndex++;
    st.log.push('Week ' + st.week + ': constitutional clause "' + clause.name +
      '" decided → ' + option.name + '.');
    return { ok: true, msg: clause.name + ' decided: ' + option.name };
  }

  // ============================================================
  // WEEK ADVANCE
  // ============================================================
  function advanceWeek(st) {
    if (st.phase === 'ended') return { ok: false, msg: 'The session has ended.' };

    st.week++;

    st.ap = CFG.startingAP;
    if (st.unity > 70) st.ap += CFG.apPerHighUnity;

    var rng = st.rng;
    for (var pid in st.support) {
      if (st.merged.indexOf(pid) !== -1) continue;
      if (pid === 'other') continue;
      var drift = (rng() - 0.5) * 0.8;
      st.support[pid] = Math.max(0.5, st.support[pid] + drift);
    }

    st.momentum = Math.round(st.momentum * 0.85);

    applyPassiveGrowth(st);
    updateCoalitions(st);
    applyDefections(st);

    if (st.week === CFG.conventionStart) {
      st.phase = 'convention';
      st.log.push('Week ' + st.week + ': the constitutional convention opens.');
    }

    

  // If this is the final election of the session, freeze the outcome now.
      if (CFG.electionWeeks.indexOf(st.week) !== -1) {
      var electionResult = runElection(st);
      st.pendingEvent = {
        id: 'council_election_' + st.week,
        week: st.week,
        title: 'Zalgrilian Council Election — Week ' + st.week,
        election: electionResult
      };

      // Freeze the outcome at the final election — do not let drift pollute it
      if (st.week >= CFG.totalWeeks) {
        st.phase = 'ended';
        st.outcome = decideOutcome(st);
      }
    } else {
      var ev = eventForWeek(st);
      if (ev) {
        st.pendingEvent = { id: ev.id, week: st.week, event: ev };
      }
    }
    return { ok: true };
  }

  // ============================================================
  // OUTCOME
  // ============================================================
  function decideOutcome(st) {
    var lastElection = st.electionResults[st.electionResults.length - 1];
    var zmpSeats = lastElection ? lastElection.zmpSeats : 0;
    var coalitionSeats = lastElection ? lastElection.coalitionSeats : zmpSeats;
    var zmpPercent = lastElection ? lastElection.zmpPercent : 0;

    var band;
    if (zmpSeats >= 32) band = 'super';
    else if (zmpSeats >= 25) band = 'strong';
    else if (zmpSeats >= 21 || coalitionSeats >= CFG.majority) band = 'narrow';
    else if (zmpSeats >= 14) band = 'opposition';
    else band = 'collapsed';

    // If chaos is too high at the end, the convention fails regardless of seats
    if (st.instability > 70) {
      band = 'failed';
    }

    return {
      band: band,
      zmpSeats: zmpSeats,
      coalitionSeats: coalitionSeats,
      zmpPercent: Math.round(zmpPercent),
      finalSeats: lastElection ? lastElection.seats : {},
      finalPercentages: lastElection ? lastElection.percentages : {},
      radicalised: st.radicalised.slice(),
      triggeredFrom: st.triggeredFrom
    };
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  return {
    CFG: CFG,
    PARTIES: PARTIES,
    BLOCS: BLOCS,
    ACTIONS: ACTIONS,
    CLAUSES: CLAUSES,
    EVENTS: EVENTS,

    newGame: newGame,
    getParty: getParty,
    activeParties: activeParties,
    computeSupport: computeSupport,
    allocateSeats: allocateSeats,
    snapshot: snapshot,

    doAction: doAction,
    advanceWeek: advanceWeek,
    runElection: runElection,
    presentClause: presentClause,
    decideClause: decideClause,
    applyEventChoice: applyEventChoice,

    isCoalitionReady: isCoalitionReady,

    decideOutcome: decideOutcome
  };
})();