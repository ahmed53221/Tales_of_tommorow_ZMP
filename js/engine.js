/*
 * Simulation engine: support model, seat allocation, coalition search.
 * Full 2-year game with elections, party splits, and dynamic coalitions.
 */
window.Engine = (function () {
  'use strict';

  var D = window.GameData;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------------- Get party safely ---------------- */
  function getParty(id) {
    if (!D || !D.PARTIES) return null;
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (D.PARTIES[i].id === id) return D.PARTIES[i];
    }
    return null;
  }

  function getPlayerPartyId(st) {
    return st.playerParty || 'ZMP';
  }

    function formWhiteLeague(st) {
    if (st.faction !== 'secularists') return { ok: false, msg: 'Only Secularists can form the White League.' };
    if (st.affinity.iia < 80) return { ok: false, msg: 'IIA affinity must be 80+. Current: ' + Math.round(st.affinity.iia) + '%' };
    if (st.playerParty === 'wl') return { ok: false, msg: 'Already formed.' };

    st.playerParty = 'wl';
    st.merged.push('iia');
    st.merged.push('ZMP');
    
    // Zero out the old ZMP so it doesn't leak into the election tables
    if (st.raw.ZMP) {
      for (var pid in st.raw.ZMP) {
        st.raw.ZMP[pid] = 0;
      }
    }

    // Inject WL into GameData so the UI can find it
    var wlExists = false;
    if (D && D.PARTIES) {
      for (var i = 0; i < D.PARTIES.length; i++) {
        if (D.PARTIES[i].id === 'wl') { wlExists = true; break; }
      }
      if (!wlExists) {
        D.PARTIES.push({
          id: 'wl', name: 'White League', short: 'WL', tag: 'WL', color: '#ffffff',
          flag: { pattern: 'solid', colors: ['#ffffff'], emblem: '✝' },
          blurb: 'The fusion of the ZMP and the IIA. A permanent secular union.',
          blurbs: {}, spirit: 4, gates: 4, coalition: 100,
          base: { athletes: 10, honor: 20, gamers: 20, arts: 12, freshmen: 15, seniors: 12, buskids: 10 }
        });
      }
    }

    if (!st.raw.wl) {
      st.raw.wl = {};
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var zmpVal = st.raw.ZMP ? st.raw.ZMP[dm.id] : 0;
          var iiaVal = st.raw.iia ? st.raw.iia[dm.id] : 0;
          st.raw.wl[dm.id] = Math.max(0.5, (zmpVal + iiaVal) * 1.1);
        }
      }
    }

    st.unity = Math.min(100, st.unity + 10);
    st.log.push('Week ' + st.week + ': The ZMP and IIA dissolve into the White League.');
    return { ok: true, msg: 'The White League is formed!' };
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

  function calculateParamilitaryStrength(force) {
  if (!force) return 0;
  // Base power = members * (training/10 + equipment/10) / 2 * morale/100
  var basePower = force.members * ((force.training / 10 + force.equipment / 10) / 2) * (force.morale / 100);
  
  // Elite bonus
  if (force.isElite) basePower *= 1.5;
  
  // Loyalty bonus
  basePower *= (0.8 + force.loyalty / 500);
  
  return Math.round(basePower);
}

  /* ---------------- AVAILABLE MINISTERS ---------------- */
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

  function initAdvisorTrackers(S) {
  if (S.factionInfluence && S.factionDissident && S.cabinetAdvisors) return;
  S.factionInfluence = {};
  S.factionDissident = {};
  var mf = (D && D.MINISTER_FACTIONS) || {};
  for (var id in mf) {
    S.factionInfluence[id] = mf[id].baseInfluence;
    S.factionDissident[id] = mf[id].baseDissident;
  }
  S.cabinetAdvisors = {};
}

function rotateAdvisor(S, postId, newAdvisorId) {
  var notes = [];
  if (!S.cabinetAdvisors) initAdvisorTrackers(S);

  var advisors = (D && D.ADVISORS) || [];
  var newAdv = null;
  for (var i = 0; i < advisors.length; i++) {
    if (advisors[i].id === newAdvisorId) { newAdv = advisors[i]; break; }
  }
  if (!newAdv) return { ok: false, msg: 'Unknown advisor.' };

  for (var post in S.cabinetAdvisors) {
    if (post !== postId && S.cabinetAdvisors[post] === newAdvisorId) {
      return { ok: false, msg: newAdv.name + ' already holds another post.' };
    }
  }

  var oldId = S.cabinetAdvisors[postId];
  var oldAdv = null;
  if (oldId) {
    for (var j = 0; j < advisors.length; j++) {
      if (advisors[j].id === oldId) { oldAdv = advisors[j]; break; }
    }
  }

  if (oldAdv && oldAdv.id === newAdv.id) {
    return { ok: false, msg: newAdv.name + ' already holds this post.' };
  }

  if (newAdv.faction && S.factionInfluence[newAdv.faction] !== undefined) {
    S.factionInfluence[newAdv.faction] = Math.min(100, S.factionInfluence[newAdv.faction] + 10);
    S.factionDissident[newAdv.faction] = Math.max(0, S.factionDissident[newAdv.faction] - 5);
    notes.push(newAdv.faction + ' influence +10, dissident −5.');
  }
  if (oldAdv && oldAdv.faction && S.factionInfluence[oldAdv.faction] !== undefined) {
    S.factionInfluence[oldAdv.faction] = Math.max(0, S.factionInfluence[oldAdv.faction] - 15);
    S.factionDissident[oldAdv.faction] = Math.min(100, S.factionDissident[oldAdv.faction] + 15);
    notes.push(oldAdv.faction + ' influence −15, dissident +15.');
  }

  applyAdvisorBonus(S, oldAdv, -1);
  applyAdvisorBonus(S, newAdv, +1);

  S.cabinetAdvisors[postId] = newAdv.id;

  S.log.push('Week ' + S.week + ': ' + newAdv.name + ' appointed to ' + postId + '.');
  if (oldAdv) {
    S.log.push('  ' + oldAdv.name + ' relieved of ' + postId + '.');
  }
  return { ok: true, notes: notes, advisor: newAdv, replaced: oldAdv };
}

function applyAdvisorBonus(S, adv, sign) {
  if (!adv || !adv.bonus) return;
  var b = adv.bonus;
  if (b.unity)      S.unity      = clamp(S.unity      + b.unity      * sign,   0, 100);
  if (b.faculty)    S.faculty    = clamp(S.faculty    + b.faculty    * sign,   0, 100);
  if (b.momentum)   S.momentum   = clamp(S.momentum   + b.momentum   * sign, -10, 20);
  if (b.funds)      S.funds      = Math.max(0, S.funds + b.funds * sign);
  if (b.spirit)     S.spirit     = clamp(S.spirit     + b.spirit     * sign,   0, 10);
  if (b.gates)      S.gates      = clamp(S.gates      + b.gates      * sign,   0, 10);
  if (b.volunteers) S.volunteers = Math.max(0, S.volunteers + b.volunteers * sign);
}



  /* ---------------- state ---------------- */
  /* ---------------- state ---------------- */
  function newState(factionId) {
    var faction = null;
    if (D && D.FACTIONS) {
      for (var i = 0; i < D.FACTIONS.length; i++) {
        if (D.FACTIONS[i].id === factionId) { faction = D.FACTIONS[i]; }
      }
    }

    var affinityMap = {
      zpf: 65, semp: 55, red: 35, iia: 25, pl: 45, rb: 40, bl: 10, republia: 8, sportica: 40, ZMP: 100, other: 50
    };

    if (faction && faction.affinity) {
      for (var key in faction.affinity) {
        if (faction.affinity.hasOwnProperty(key)) {
          affinityMap[key] = clamp((affinityMap[key] || 50) + faction.affinity[key], 0, 100);
        }
      }
    }

    var st = {
      week: 1,
      faction: factionId,
      ap: 3,
      funds: 80,
      volunteers: 12,
      momentum: 0,
      faculty: 50,
      unity: 60,
      spirit: faction ? faction.spirit || 5 : 5,
      gates: faction ? faction.gates || 5 : 5,
      
      // --- NEW DYNAMIC PROPERTIES ---
      flags: {},
      blFactions: { traditionalists: 50, cultists: 50 },
      prophecy: { active: false, wallsBroken: 0, warned: false, halted: false },
      // ------------------------------

      raw: {},
      affinity: affinityMap,
      history: [],
      log: [],
      merged: [],
      eventDone: {},
      pendingEvent: null,
      finished: false,
      result: null,
      electionCycle: 0,
      electionWeeks: [9, 25, 41, 57, 73, 89],
      seats: {},
      majority: (D && D.MAJORITY) ? D.MAJORITY : 23,
      coalitionPartners: [],
      coalitionStability: 80,
      lastElectionWeek: 0,
      iiaJoinedZMP: false,
      redLeadershipChecked: false,
      cabinet: {},
      coalitionAgreement: {},
      ministerApproval: {},
      coalitionPartnerSatisfaction: {},
      monarchySympathizers: 0,
      blackLeagueInvestigated: false,
      blackLeagueProsecuted: false,
      blackLeagueBanned: false,
      redGoodLeader: false,
      redBadLeader: false,
      redLeaderWeek: null,
      redJoinedZMP: false,
      redJoinedBL: false,
      otherRedJoinedBL: false,
      zpfJoinedZMP: false,
      playerParty: 'ZMP',
      electionProcessed: {},
      battle1Lost: false,
      battle2Won: false,
      LocalElectionCount: 0,
      battle2Lost: false,
      battle3Won: false,
      presidentialCandidate: null,
      presidentialWinner: null,
      presidentialChoiceMade: false,
      ultsDone: false,
      battle3Lost: false,
      gameOver: false,
      blSplintered: false,
      hasArbeiterAlly: false,
      harvardAdvisor: false,
      whoAdvisor: false,
      blackLeagueSurgeTriggered: false,
      relations: {},
      blSplinterReleaseTriggered: false,
      releasedPartiesEventTriggered: false,
      releasedSurgeTriggered: false,
      releasedVictoryTriggered: false,
      redResurgenceTriggered: false,
      iiaRevivalTriggered: false,
      zpfRebirthTriggered: false,
      sempSurgeTriggered: false,
      republiaRisingTriggered: false,
      sporticaChallengeTriggered: false,
      presidentialCampaignBonus: 0,
      presidentialCampaignCount: 0,
      presidentialCampaigningDone: false,
      LocalElectionTriggered: false,
      LocalElectionBonus: 0,
      plPepTriggered: false,
      rbLunchTriggered: false,
      allyBoost: 0,
      economyBoost: 0,
      healthcareBoost: 0,
      blTakeoverTriggered: false,
      blCollapseTriggered: false,
      blGrowthSlow: 0,
      fightingBlackLeague: false,
      blSabotageLevel: 0,
      
      blackLeagueCells: {
        cells: [],
        maxCells: 6,
        placementTimer: 0,
        placementInterval: 4,
        totalCellsPlaced: 0,
        totalCellsDestroyed: 0,
        mapRevealed: false
      },
      
      blFirstBattleMultiplier: 1.0,
      blSecondBattleMultiplier: 2.0,
      defensiveBoost: 0,
      sec: null,
      ref: null,
      _secTriggered: false,
      _refTriggered: false,
      electoralThreshold: 3,
      lastReferendumWeek: 0,
      justiceReformDone: false,
      monarchyRestored: false,
      royalDecreeThreshold: false,
      acerboLaw: false,
      noFridays: false,
      enablingAct: false,
      alternativeCoalition: null,
      lastAlternativeCoalitionWeek: 0
    };

    st.relations = {};

    st.king = {
      active: false,
      autonomous: false,
      zmpBacked: null,
      done: false,
      week: 0,
      support: 30,
      resistance: 10,
      legionMorale: 100,
      legionLoyalty: 90,
      strikeLevel: 0,
      crowdSize: 0,
      escalationHeld: false,
      escalationDecided: false,
      thirdQuestionAsked: false,
      councilInExile: false,
      facultyRefused: false,
      zpfAligned: false,
      sempAligned: false,
      minigameTriggered: false,
      minigameResult: null,
      crowdDays: 0
    };

    if (D && D.PARTIES) {
      for (var i = 0; i < D.PARTIES.length; i++) {
        var p = D.PARTIES[i];
        st.raw[p.id] = {};
        if (D.DEMOS) {
          for (var j = 0; j < D.DEMOS.length; j++) {
            var dm = D.DEMOS[j];
            st.raw[p.id][dm.id] = (p.base && p.base[dm.id] !== undefined) ? p.base[dm.id] : 10;
          }
        }
        if (!affinityMap[p.id]) {
          st.affinity[p.id] = p.coalition || 50;
        }
      }
    }

    st.relations = initRelations(st);

    if (faction) {
      st.unity = clamp(st.unity + (faction.unity || 0), 0, 100);
      if (faction.mods) {
        for (var key in faction.mods) {
          if (faction.mods.hasOwnProperty(key)) {
            st.raw.ZMP[key] = Math.max(0.5, (st.raw.ZMP[key] || 0) + faction.mods[key]);
          }
        }
      }
    }

    var sup = computeSupport(st);
    st.seats = allocateSeats(sup.totals, st);
    snapshot(st, 'Week 1');
    initParamilitaries(st);
    initAdvisorTrackers(st);
    return st;
  }



// ============================================================
// BLACK LEAGUE CELL SYSTEM
// ============================================================

function getCellLocations() {
  return [
    { id: 'cafeteria', name: 'Cafeteria', icon: '🍽️', desc: 'Where students eat. Good for recruiting.' },
    { id: 'gymnasium', name: 'Gymnasium', icon: '🏋️', desc: 'Athletes gather here. Strong support base.' },
    { id: 'library', name: 'Library', icon: '', desc: 'Quiet place for secret meetings.' },
    { id: 'science_wing', name: 'Science Wing', icon: '🔬', desc: 'Tech-savvy students. Potential for propaganda.' },
    { id: 'arts_wing', name: 'Arts Wing', icon: '🎭', desc: 'Creative types. Influence through culture.' },
    { id: 'computer_lab', name: 'Computer Lab', icon: '💻', desc: 'Digital propaganda hub.' },
    { id: 'basement', name: 'Basement', icon: '🕳️', desc: 'Hidden meetings. Hard to find.' },
    { id: 'roof', name: 'Roof', icon: '🏢', desc: 'Secret gatherings under the stars.' },
    { id: 'parking_lot', name: 'Parking Lot', icon: '🚗', desc: 'After-school recruitment.' },
    { id: 'teachers_lounge', name: 'Teachers Lounge', icon: '👨‍🏫', desc: 'Faculty infiltration.' },
    { id: 'auditorium', name: 'Auditorium', icon: '🎪', desc: 'Rallies and speeches.' },
    { id: 'counseling_office', name: 'Counseling Office', icon: '🛋️', desc: 'Psychological manipulation.' }
  ];
}

function placeBLChill(st, rng) {
  if (!st.blackLeagueCells) {
    st.blackLeagueCells = { cells: [], maxCells: 6, placementTimer: 0, placementInterval: 4, totalCellsPlaced: 0, totalCellsDestroyed: 0, mapRevealed: false };
  }
  
  var system = st.blackLeagueCells;
  var notes = [];
  
  // Check if we should place a new cell
  system.placementTimer += 1;
  
  if (system.placementTimer >= system.placementInterval && system.cells.length < system.maxCells) {
    system.placementTimer = 0;
    
    // Get available locations (not already occupied)
    var allLocations = getCellLocations();
    var occupiedIds = system.cells.map(function(c) { return c.location; });
    var available = allLocations.filter(function(l) {
      return occupiedIds.indexOf(l.id) === -1;
    });
    
    if (available.length > 0) {
      // Pick a random available location
      var loc = available[Math.floor(rng() * available.length)];
      var strength = 1 + Math.floor(rng() * 2); // 1-3 strength
      
      system.cells.push({
        id: 'cell_' + Date.now() + '_' + Math.floor(rng() * 1000),
        location: loc.id,
        locationName: loc.name,
        icon: loc.icon,
        strength: strength,
        weekPlaced: st.week,
        discovered: false,
        destroyed: false,
        supporters: 5 + Math.floor(rng() * 10) // 5-15 supporters
      });
      
      system.totalCellsPlaced += 1;
      
      notes.push('⚫ Black League has placed a new cell in the ' + loc.name + '!');
      notes.push(' Cell strength: ' + strength + '/5');
      notes.push('👥 Supporters: ' + (5 + Math.floor(rng() * 10)));
      
      // If multiple cells exist, BL support grows
      if (system.cells.length >= 2) {
        var bonus = system.cells.length * 0.5;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + bonus);
          }
        }
        notes.push('📈 BL support +' + bonus + '% from multiple cells!');
      }
      
      st.log.push('Week ' + st.week + ': BL placed cell in ' + loc.name);
    }
  }
  
  // Cells also grow over time
  system.cells.forEach(function(cell) {
    if (!cell.destroyed) {
      // Cell gains strength over time
      if (st.week - cell.weekPlaced > 4 && cell.strength < 5) {
        cell.strength = Math.min(5, cell.strength + 0.5);
      }
      // Cell gains supporters
      if (st.week - cell.weekPlaced > 2) {
        cell.supporters = Math.min(30, cell.supporters + Math.floor(rng() * 2));
      }
    }
  });
  
  return notes;
}

function getCellStatus(st) {
  if (!st.blackLeagueCells) return 'No cells detected.';
  var system = st.blackLeagueCells;
  var active = system.cells.filter(function(c) { return !c.destroyed; });
  var destroyed = system.cells.filter(function(c) { return c.destroyed; });
  
  var status = '⚫ Black League Cells:\n';
  status += 'Active: ' + active.length + ' | Destroyed: ' + destroyed.length + '\n';
  status += 'Total placed: ' + system.totalCellsPlaced + '\n';
  
  if (active.length > 0) {
    status += '\nActive Cells:\n';
    active.forEach(function(cell) {
      status += '  ' + cell.icon + ' ' + cell.locationName + ' (Strength: ' + Math.round(cell.strength) + '/5, Supporters: ' + cell.supporters + ')\n';
    });
  }
  
  return status;
}

function getCellLocationsForMap(st) {
  if (!st.blackLeagueCells) {
    st.blackLeagueCells = { cells: [], maxCells: 6, placementTimer: 0, placementInterval: 4, totalCellsPlaced: 0, totalCellsDestroyed: 0, mapRevealed: false };
  }
  
  var allLocations = getCellLocations();
  var occupied = st.blackLeagueCells.cells.filter(function(c) { return !c.destroyed; });
  var occupiedIds = occupied.map(function(c) { return c.location; });
  
  return allLocations.map(function(loc) {
    var cell = occupied.find(function(c) { return c.location === loc.id; });
    return {
      id: loc.id,
      name: loc.name,
      icon: loc.icon,
      desc: loc.desc,
      hasCell: !!cell,
      cellData: cell || null,
      strength: cell ? Math.round(cell.strength) : 0,
      supporters: cell ? cell.supporters : 0,
      weekPlaced: cell ? cell.weekPlaced : null
    };
  });
}

function crushCell(st, locationId, rng) {
  if (!st.blackLeagueCells) {
    return [' No Black League cells detected.'];
  }
  
  var notes = [];
  var system = st.blackLeagueCells;
  
  // Find the cell at this location
  var cellIndex = system.cells.findIndex(function(c) { 
    return c.location === locationId && !c.destroyed; 
  });
  
  if (cellIndex === -1) {
    notes.push('🔍 No Black League cell found there.');
    notes.push('🕊️ That location is clean. The school is safe there.');
    return notes;
  }
  
  var cell = system.cells[cellIndex];
  
  notes.push('💥 CRUSHING BLACK LEAGUE CELL!');
  notes.push('📍 Location: ' + cell.icon + ' ' + cell.locationName);
  notes.push(' Cell strength: ' + Math.round(cell.strength) + '/5');
  notes.push('👥 Supporters: ' + cell.supporters);
  
  // Calculate success chance based on your anti-fascist level and resources
  var afLevel = st.antiFascistMeasures ? st.antiFascistMeasures.level : 0;
  var successChance = 0.3 + (afLevel * 0.1) + (st.unity / 200) + (st.faculty / 200);
  successChance = Math.min(0.95, successChance);
  
  notes.push(' Success chance: ' + Math.round(successChance * 100) + '%');
  
  // Cost to crush
  var cost = 10 + (cell.strength * 3);
  if (st.funds < cost) {
    notes.push(' Not enough funds! Need $' + cost + ' to crush this cell.');
    notes.push('💡 Build up your resources and try again.');
    return notes;
  }
  st.funds -= cost;
  notes.push('💰 Spent $' + cost + ' on the operation.');
  
  if (rng() < successChance) {
    // SUCCESS!
    notes.push(' CELL CRUSHED SUCCESSFULLY!');
    notes.push('💥 The Black League cell in the ' + cell.locationName + ' is destroyed!');
    
    // Reward - one-time boost
    var reward = 3 + cell.strength + Math.floor(cell.supporters / 5);
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + reward);
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - cell.strength * 2);
      }
    }
    
    // Bonus rewards
    st.funds += cell.supporters * 0.5;
    st.volunteers += Math.floor(cell.supporters / 3);
    st.momentum = clamp(st.momentum + 2, -10, 20);
    st.unity = clamp(st.unity + 2, 0, 100);
    
    // Mark as destroyed
    cell.destroyed = true;
    system.totalCellsDestroyed += 1;
    
    notes.push('📈 ZMP +' + reward + '% support!');
    notes.push('📉 BL -' + (cell.strength * 2) + '% support!');
    notes.push('💰 +$' + Math.round(cell.supporters * 0.5) + ' recovered!');
    notes.push(' +' + Math.floor(cell.supporters / 3) + ' volunteers recruited!');
    notes.push('⚡ Momentum +2! Unity +2!');
    
    // Check if all cells are destroyed
    var remaining = system.cells.filter(function(c) { return !c.destroyed; });
    if (remaining.length === 0) {
      notes.push(' ALL BLACK LEAGUE CELLS DESTROYED!');
      notes.push(' The school is cleansed of fascist influence!');
      st.blNeutralized = true;
      st.log.push('Week ' + st.week + ': All BL cells destroyed - Complete victory!');
    }
    
    st.log.push('Week ' + st.week + ': Crushed BL cell in ' + cell.locationName);
    
  } else {
    // FAILURE
    notes.push(' OPERATION FAILED!');
    notes.push('The Black League cell fought back and escaped.');
    
    // Penalty
    cell.strength = Math.min(5, cell.strength + 0.5);
    cell.supporters += Math.floor(rng() * 3);
    st.momentum = clamp(st.momentum - 1, -10, 20);
    st.unity = clamp(st.unity - 2, 0, 100);
    
    notes.push('📈 Cell grew stronger! Strength now: ' + Math.round(cell.strength) + '/5');
    notes.push('👥 Supporters now: ' + cell.supporters);
    notes.push('😤 The BL mocks your weakness.');
    
    st.log.push('Week ' + st.week + ': Failed to crush BL cell in ' + cell.locationName);
  }
  
  return notes;
}

function getCellSummary(st) {
  if (!st.blackLeagueCells) return 'No cell data available.';
  
  var system = st.blackLeagueCells;
  var active = system.cells.filter(function(c) { return !c.destroyed; });
  var destroyed = system.cells.filter(function(c) { return c.destroyed; });
  
  return {
    active: active.length,
    destroyed: destroyed.length,
    totalPlaced: system.totalCellsPlaced,
    totalDestroyed: system.totalCellsDestroyed,
    nextPlacement: system.placementInterval - (system.placementTimer % system.placementInterval),
    activeCells: active.map(function(c) {
      return {
        location: c.locationName,
        icon: c.icon,
        strength: Math.round(c.strength),
        supporters: c.supporters,
        weekPlaced: c.weekPlaced
      };
    })
  };
}


  /* ---------------- Battle 1: Battle of Ca'uf ---------------- */
  /* ---------------- Battle 1: Battle of Ca'uf ---------------- */
function resolveBattle(st, choice, rng) {
  var notes = [];

  var zmpSupport = getPartySupport(st, 'ZMP');
  var iiaSupport = getPartySupport(st, 'iia');
  var blSupport = getPartySupport(st, 'bl');
  
  // Initialize paramilitaries if needed
  if (!st.paramilitaries) initParamilitaries(st);
  
  var zmpForce = st.paramilitaries.dzehurjaca;
  var iiaForce = st.paramilitaries.iia_guard;
  var blForce = st.paramilitaries.black_legion;
  
  // Calculate paramilitary strengths
  var zmpStrength = calculateParamilitaryStrength(zmpForce);
  var iiaStrength = calculateParamilitaryStrength(iiaForce);
  var blStrength = calculateParamilitaryStrength(blForce);
  
  console.log('Battle at Ca\'uf - ZMP:', zmpStrength, 'IIA:', iiaStrength, 'BL:', blStrength);
  
  if (choice === 'help_iia') {
    var alliedForce = zmpStrength + iiaStrength;
    var enemyForce = blStrength;
    
    var alliedRoll = alliedForce * (0.8 + rng() * 0.4);
    var enemyRoll = enemyForce * (0.8 + rng() * 0.4);
    
    if (alliedRoll > enemyRoll) {
      notes.push(' VICTORY! Your forces and IIA have defeated the Black League!');
      notes.push('The Black League retreats in disarray.');
      
      // Boost paramilitaries
      zmpForce.members += 10;
      zmpForce.morale = Math.min(100, zmpForce.morale + 5);
      iiaForce.members += 15;
      iiaForce.morale = Math.min(100, iiaForce.morale + 5);
      blForce.members = Math.max(0, blForce.members - 30);
      blForce.morale = Math.max(10, blForce.morale - 10);
      
      // Political effects
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 5);
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 3);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 1.5);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) + 15, 0, 100);
      st.affinity.bl = clamp((st.affinity.bl || 0) - 10, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
      st.unity = clamp(st.unity + 3, 0, 100);
      
      notes.push('📈 IIA support grows significantly! ZMP gains moderate support.');
      st.log.push('Week ' + st.week + ': Battle of Ca\'uf - ZMP+IIA victory');
      
    } else {
      notes.push(' DEFEAT! The Black League has crushed your forces and IIA!');
      notes.push('The Black League celebrates their victory.');
      
      // Penalty for paramilitaries
      zmpForce.members = Math.max(0, zmpForce.members - 20);
      zmpForce.morale = Math.max(10, zmpForce.morale - 10);
      iiaForce.members = Math.max(0, iiaForce.members - 30);
      iiaForce.morale = Math.max(10, iiaForce.morale - 15);
      blForce.members += 30;
      blForce.morale = Math.min(100, blForce.morale + 10);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 10);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 4);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
        }
      }
      st.affinity.bl = clamp((st.affinity.bl || 0) + 15, 0, 100);
      st.affinity.iia = clamp((st.affinity.iia || 0) - 10, 0, 100);
      st.momentum = clamp((st.momentum || 0) - 3, -10, 20);
      st.unity = clamp(st.unity - 4, 0, 100);
      st.faculty = clamp(st.faculty - 5, 0, 100);
      
      notes.push('📈 Black League support surges by 10%!');
      st.log.push('Week ' + st.week + ': Battle of Ca\'uf - Black League victory');
    }
  } else if (choice === 'go_independent') {
      var zmpPower = zmpSupport * (0.9 + rng() * 0.2);
      var iiaPower = iiaSupport * (0.8 + rng() * 0.4);
      var blPower = blSupport * (0.8 + rng() * 0.4);
      var combinedEnemy = (iiaPower + blPower) / 2;
      
      if (zmpPower > combinedEnemy) {
        notes.push(' TRIUMPH! The ZMP stands alone and proves its strength!');
        notes.push('Both IIA and the Black League are forced to retreat.');
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 8);
            st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 3);
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 3);
          }
        }
        st.affinity.ZMP = 100;
        st.momentum = clamp((st.momentum || 0) + 6, -10, 20);
        st.unity = clamp(st.unity + 8, 0, 100);
        st.faculty = clamp(st.faculty + 5, 0, 100);
        
        notes.push('📈 ZMP support surges dramatically! The party is united!');
        st.log.push('Week ' + st.week + ': Battle of Ca\'uf - ZMP solo victory');
        
      } else {
        notes.push(' DISASTER! The ZMP is caught between two enemies!');
        notes.push('Your forces are shattered. Dissidents rise up across the school.');
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 8);
            st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 2);
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 2);
          }
        }
        st.affinity.ZMP = clamp((st.affinity.ZMP || 100) - 15, 0, 100);
        st.momentum = clamp((st.momentum || 0) - 8, -10, 20);
        st.unity = clamp(st.unity - 15, 0, 100);
        st.faculty = clamp(st.faculty - 10, 0, 100);
        
        notes.push('📉 ZMP support crashes! Dissidents are everywhere!');
        st.log.push('Week ' + st.week + ': Battle of Ca\'uf - ZMP disaster');
      }
      
    } else if (choice === 'ignore') {
      notes.push('🕊️ The ZMP stays out of the conflict. Let them fight.');
      
      if (iiaSupport > blSupport) {
        notes.push('IIA emerges slightly stronger from the conflict.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 1);
          }
        }
        st.affinity.iia = clamp((st.affinity.iia || 0) + 3, 0, 100);
        st.log.push('Week ' + st.week + ': Battle of Ca\'uf - IIA gains small advantage');
      } else if (blSupport > iiaSupport) {
        notes.push('The Black League grows stronger while you watch.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 5);
          }
        }
        st.affinity.bl = clamp((st.affinity.bl || 0) + 10, 0, 100);
        notes.push('📈 Black League support grows by 5%!');
        st.log.push('Week ' + st.week + ': Battle of Ca\'uf - Black League gains from neutrality');
      } else {
        notes.push('The conflict ends in a stalemate. Nothing changes.');
        st.log.push('Week ' + st.week + ': Battle of Ca\'uf - Stalemate');
      }
      
      st.unity = clamp(st.unity + 2, 0, 100);
    }
    
    return notes;
  }

  /* ---------------- Detailed Election Results ---------------- */

function generateDetailedElectionResults(st, rng) {
  var results = {
    candidates: [],
    endorsements: [],
    stateResults: {},
    totalVotes: 0,
    turnout: 76,
    winner: null,
    winnerParty: null,
    winnerVotes: 0,
    secondPlace: null,
    secondParty: null,
    margin: 0
  };
  
  // Get all parties as candidates
  var parties = [];
  for (var pid in st.raw) {
    if (pid !== 'other' && st.merged.indexOf(pid) === -1) {
      var p = getParty(pid);
      if (p) {
        parties.push(p);
      }
    }
  }
  
  // Calculate candidate support
  var totalSupport = 0;
  var candidateData = [];
  
  parties.forEach(function(p) {
    var support = getPartySupport(st, p.id);
    // Add some randomness for election day
    var finalSupport = support * (0.85 + rng() * 0.3);
    candidateData.push({
      id: p.id,
      name: p.short || p.id,
      party: p.id,
      color: p.color,
      support: finalSupport
    });
    totalSupport += finalSupport;
  });
  
  // Normalize to 100%
  candidateData.forEach(function(c) {
    c.percent = totalSupport > 0 ? (c.support / totalSupport) * 100 : 0;
  });
  
  // Sort by percent descending
  candidateData.sort(function(a, b) { return b.percent - a.percent; });
  
  // Identify winner
  results.candidates = candidateData;
  if (candidateData.length > 0) {
    results.winner = candidateData[0].name;
    results.winnerParty = candidateData[0].party;
    results.winnerVotes = Math.round(candidateData[0].percent);
    
    if (candidateData.length > 1) {
      results.secondPlace = candidateData[1].name;
      results.secondParty = candidateData[1].party;
      results.margin = Math.round(candidateData[0].percent - candidateData[1].percent);
    }
  }
  
  // Generate endorsements
  var endorsementPool = [
    { name: 'The Student Voice', type: 'newspaper', party: null },
    { name: 'Faculty Senate', type: 'faculty', party: null },
    { name: 'Athletic Department', type: 'sports', party: null },
    { name: 'Drama Club', type: 'arts', party: null },
    { name: 'Computer Science Club', type: 'tech', party: null },
    { name: 'Debate Team', type: 'academic', party: null },
    { name: 'Student Council Alumni', type: 'alumni', party: null },
    { name: 'The Cafeteria Workers', type: 'staff', party: null }
  ];
  
  // Assign endorsements based on candidate strength
  var top3 = candidateData.slice(0, 3);
  var endorsements = [];
  
  endorsementPool.forEach(function(e) {
    // Pick a random top candidate to endorse
    var idx = Math.floor(rng() * Math.min(3, top3.length));
    var candidate = top3[idx];
    if (candidate) {
      endorsements.push({
        endorser: e.name,
        type: e.type,
        candidate: candidate.name,
        party: candidate.party
      });
    }
  });
  
  results.endorsements = endorsements;
  
  // Generate state/region results
  var regions = ['North Wing', 'South Wing', 'East Wing', 'West Wing', 'Central Hall', 'Science Block', 'Arts Building', 'Gymnasium'];
  
  regions.forEach(function(region) {
    var regionResults = {};
    var regionTotal = 0;
    
    candidateData.forEach(function(c) {
      // Each region has slightly different preferences
      var regionalBias = 0;
      if (c.party === 'ZMP') regionalBias = (rng() - 0.3) * 10;
      else if (c.party === 'bl') regionalBias = (rng() - 0.2) * 8;
      else if (c.party === 'republia') regionalBias = (rng() - 0.4) * 10;
      else if (c.party === 'red') regionalBias = (rng() - 0.3) * 8;
      else regionalBias = (rng() - 0.5) * 6;
      
      var voteShare = c.percent + regionalBias;
      if (voteShare < 0) voteShare = 0;
      regionResults[c.party] = voteShare;
      regionTotal += voteShare;
    });
    
    // Normalize
    if (regionTotal > 0) {
      for (var pid in regionResults) {
        regionResults[pid] = (regionResults[pid] / regionTotal) * 100;
      }
    }
    
    // Find region winner
    var regionWinner = null;
    var regionWinnerVotes = 0;
    for (var pid in regionResults) {
      if (regionResults[pid] > regionWinnerVotes) {
        regionWinnerVotes = regionResults[pid];
        regionWinner = pid;
      }
    }
    
    results.stateResults[region] = {
      results: regionResults,
      winner: regionWinner,
      winnerVotes: Math.round(regionWinnerVotes)
    };
  });
  
  results.totalVotes = Math.round(100 + rng() * 400);
  results.turnout = Math.round(70 + rng() * 20);
  
  return results;
}

/* ============================================================
 * ZALGRILIANIST king PUTSCH
 * ============================================================ */

function tickkingOccupation(st, rng) {
  var k = st.king;
  var notes = [];

  // ---- PHASE 1: The occupation begins ----
  if (k.week === 0) {
    k.active = true;
    k.week = 1;

    // Pull loyalty from the Dzehurjaca paramilitary
    if (st.paramilitaries && st.paramilitaries.dzehurjaca) {
      k.legionLoyalty = st.paramilitaries.dzehurjaca.loyalty;
      k.legionMorale = st.paramilitaries.dzehurjaca.morale;
    }

    notes.push('The Dzehurjaca Legion occupies the Council Chamber at dawn.');
    notes.push('The students do not rise. The council does not convene. The banner is raised.');

    // Initial alignment checks
    var zpfAffinity = st.affinity.zpf || 50;
    var sempAffinity = st.affinity.semp || 50;

    k.councilInExile = rng() < 0.65;
    k.facultyRefused = st.faculty < 40 ? (rng() < 0.3) : (rng() < 0.75);
    k.zpfAligned = (zpfAffinity >= 60 && rng() < 0.7);
    k.sempAligned = (sempAffinity >= 55 && rng() < 0.6);

    if (k.councilInExile) {
      notes.push('The Council convenes in exile at a diner three blocks away.');
      k.resistance += 15;
    }
    if (k.facultyRefused) {
      notes.push('The Faculty Senate calls on teachers to refuse to teach.');
      k.resistance += 20;
      st.faculty = clamp(st.faculty - 5, 0, 100);
    }
    if (k.zpfAligned) {
      notes.push('The ZPF endorses the restoration, conditionally.');
      k.support += 15;
    } else {
      notes.push('The ZPF refuses to endorse the occupation.');
      k.resistance += 10;
    }
    if (k.sempAligned) {
      notes.push('The SEMP issues a statement of conditional loyalty.');
      k.support += 10;
    }

    return notes;
  }

  // ---- PHASE 2: The strike breaks out (week 2) ----
  if (k.week === 1) {
    k.week = 2;
    k.strikeLevel = 3;
    k.crowdSize = 60 + Math.floor(rng() * 80);
    k.crowdDays = 1;

    notes.push('A general strike is declared. Students do not come to school.');
    notes.push('A crowd of ' + k.crowdSize + ' forms in the parking lot.');
    k.resistance += 20;

    // Trigger the escalation decision
    if (!k.escalationDecided) {
      k.escalationDecided = true;
      st.pendingEvent = {
        id: 'zalgrilian_king_escalation_' + st.week,
        week: st.week,
        title: 'The Marshal\'s Second Question',
        body: 'The strike has spread. The corridors are empty. The Marshal has come back to ' +
              'the study with two documents. The first is a withdrawal order. The second ' +
              'is an order to disperse the crowd in the parking lot. ' +
              '"It will be written down either way," he says. "The question is which ' +
              'document we want history to have."',
        choices: [
          { text: 'Withdraw. The occupation ends tonight.',
            note: 'The Legion leaves before dawn. The crown is not restored. No one is hurt.',
            effects: { zalgriliankingWithdraw: true } },
          { text: 'Hold the building. Do not move on the crowd.',
            note: 'The standoff drags on. The Marshal may ask a third time.',
            effects: { zalgriliankingHold: true } },
          { text: 'Order the Legion to disperse the crowd.',
            note: 'The Legion moves on the parking lot. What happens next depends on the crowd — and on the Legion.',
            effects: { zalgriliankingEscalate: true } }
        ]
      };
    }

    return notes;
  }

  // ---- PHASE 3: The standoff (if held) ----
  if (k.week >= 2 && k.escalationHeld) {
    k.week++;
    k.crowdSize += 40 + Math.floor(rng() * 60);
    k.crowdDays++;
    k.resistance += 8;
    k.legionMorale = Math.max(0, k.legionMorale - 10);

    notes.push('The standoff continues. The crowd has grown to ' + k.crowdSize + '.');
    notes.push('The Legion remains inside. Neither side has moved for ' + k.crowdDays + ' days.');

    // Third question if morale is collapsing
    if (k.legionMorale <= 35 && !k.thirdQuestionAsked) {
      k.thirdQuestionAsked = true;
      st.pendingEvent = {
        id: 'zalgrilian_king_third_' + st.week,
        week: st.week,
        title: 'The Marshal\'s Third Question',
        body: 'The Marshal brings you a single sheet of paper. It is the resignation of the ' +
              'Dzehurjaca Legion, unconditional, dated tomorrow. "I have asked the men ' +
              'whether they will fight," he says. "They said no. I have asked them whether ' +
              'they will hold. They said they will hold one more night. Then they will ' +
              'go home."',
        choices: [
          { text: 'Accept the resignation. Release the Legion.',
            note: 'The Legion disbands. The occupation ends. The crown is not restored.',
            effects: { zalgriliankingLegionResigns: true } },
          { text: 'Refuse the resignation. Order the Legion to hold to the end.',
            note: 'The men will desert. This is the end of the crown.',
            effects: { zalgriliankingLegionRefuses: true } }
        ]
      };
    }

    // Check for automatic collapse
    if (k.legionMorale <= 15 || k.resistance >= 85) {
      return notes.concat(forcekingCollapse(st));
    }

    return notes;
  }

  // ---- PHASE 4: Post-escalation (if the minigame was resolved) ----
  if (k.week >= 2 && k.minigameResult) {
    // The minigame has already resolved; nothing else to do here.
    return notes;
  }

  return notes;
}

function forcekingCollapse(st) {
  var k = st.king;
  k.active = false;
  st.finished = true;
  st.endingData = {
    ending: 'zalgrilian_king_collapse',
    title: 'The March That Ended in Nothing',
    subtitle: 'The crown held the building. The school held its breath. The crown let go.',
    endingNumber: 'Ending 32',
    body: 'The occupation failed. The Legion withdrew without a fight.',
    story: /* ... (the long narrative from the previous message, unchanged) */ '',
    subending: 'Subending AD — The Twenty-Two Days',
    detail: '<div class="stat"><span>Support</span><span class="v">' +
      Math.round(k.support) + '</span></div>',
    epilogue: /* ... */ ''
  };
  return ['The occupation has collapsed of its own weight.'];
}

function checkkingResolution(st) {
  var k = st.king;
  if (!k || !k.active) return null;

  // Only resolve if the minigame or a forced collapse has already decided.
  if (k.minigameResult) {
    return k.minigameResult.endingData;
  }
  return null;
}

  /* ---------------- Battle 2: Second Battle of Ca'uf ---------------- */
  /* ---------------- Battle 2: Second Battle of Ca'uf ---------------- */
function resolveBattle2(st, choice, rng) {
  var notes = [];
  
  // Initialize paramilitaries if needed
  if (!st.paramilitaries) initParamilitaries(st);
  
  var zmpForce = st.paramilitaries.dzehurjaca;
  var iiaForce = st.paramilitaries.iia_guard;
  var blForce = st.paramilitaries.black_legion;
  var weinForce = st.paramilitaries.wein_workers;
  
  // Calculate paramilitary strengths
  var zmpStrength = calculateParamilitaryStrength(zmpForce);
  var iiaStrength = calculateParamilitaryStrength(iiaForce);
  var blStrength = calculateParamilitaryStrength(blForce);
  var weinStrength = calculateParamilitaryStrength(weinForce);
  
  // Apply multipliers
  var baseMultiplier = 2;
  if (st.battle1Lost) {
    baseMultiplier = 4;
  }
  
  var sabotageMultiplier = st.blSecondBattleMultiplier || baseMultiplier;
  if (!st.blSabotageLevel || st.blSabotageLevel === 0) {
    sabotageMultiplier = baseMultiplier;
  }
  
  var blPower = blStrength * sabotageMultiplier;
  notes.push(' Black League strength: ' + blStrength + ' x ' + sabotageMultiplier.toFixed(1) + ' = ' + Math.round(blPower));
  
  if (choice === 'help_iia') {
    var alliedForce = zmpStrength + iiaStrength;
    
    // Wein helps if allied
    if (st.hasArbeiterAlly) {
      alliedForce += weinStrength * 0.3;
      notes.push('🌍 Wein workers join the battle! (+' + Math.round(weinStrength * 0.3) + ' strength)');
    }
    
    var enemyForce = blPower;
    
    var alliedRoll = alliedForce * (0.7 + rng() * 0.4);
    var enemyRoll = enemyForce * (0.7 + rng() * 0.4);
    
    if (alliedRoll > enemyRoll) {
      notes.push(' VICTORY! The Black League is pushed back from Ca\'uf!');
      st.battle2Won = true;
      st.battle2Lost = false;
      
      // Boost paramilitaries
      zmpForce.members += 15;
      zmpForce.morale = Math.min(100, zmpForce.morale + 8);
      iiaForce.members += 10;
      iiaForce.morale = Math.min(100, iiaForce.morale + 5);
      blForce.members = Math.max(0, blForce.members - 40);
      blForce.morale = Math.max(10, blForce.morale - 15);
      blForce.equipment = Math.max(1, blForce.equipment - 1);
      
      if (st.hasArbeiterAlly) {
        weinForce.morale = Math.min(100, weinForce.morale + 5);
      }
      
      // Political effects
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 4);
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 5);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) + 10, 0, 100);
      st.affinity.bl = clamp((st.affinity.bl || 0) - 10, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 4, -10, 20);
      st.unity = clamp(st.unity + 5, 0, 100);
      
      notes.push('📈 IIA and ZMP both gain support!');
      st.log.push('Week ' + st.week + ': Second Battle of Ca\'uf - Victory');
    } else {
      notes.push(' DEFEAT! The Black League overwhelms Ca\'uf!');
      st.battle2Won = false;
      st.battle2Lost = true;
      
      // Penalty for paramilitaries
      zmpForce.members = Math.max(0, zmpForce.members - 30);
      zmpForce.morale = Math.max(10, zmpForce.morale - 15);
      iiaForce.members = Math.max(0, iiaForce.members - 40);
      iiaForce.morale = Math.max(10, iiaForce.morale - 20);
      blForce.members += 50;
      blForce.morale = Math.min(100, blForce.morale + 15);
      blForce.equipment = Math.min(10, blForce.equipment + 1);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 8);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 5);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 3);
        }
      }
      st.affinity.bl = clamp((st.affinity.bl || 0) + 15, 0, 100);
      st.affinity.iia = clamp((st.affinity.iia || 0) - 10, 0, 100);
      st.momentum = clamp((st.momentum || 0) - 4, -10, 20);
      st.unity = clamp(st.unity - 5, 0, 100);
      st.faculty = clamp(st.faculty - 5, 0, 100);
      
      notes.push('📈 Black League surges!');
      st.log.push('Week ' + st.week + ': Second Battle of Ca\'uf - Defeat');
    }
  } else if (choice === 'go_independent') {
    var zmpPower = zmpStrength * (0.8 + rng() * 0.3);
    var iiaPower = iiaStrength * (0.7 + rng() * 0.4);
    var blPowerEnemy = blPower * (0.8 + rng() * 0.3);
    var combinedEnemy = (iiaPower + blPowerEnemy) / 2;
    
    if (zmpPower > combinedEnemy) {
      notes.push(' TRIUMPH! ZMP stands alone against both enemies!');
      st.battle2Won = true;
      st.battle2Lost = false;
      
      zmpForce.members += 25;
      zmpForce.morale = Math.min(100, zmpForce.morale + 12);
      zmpForce.training = Math.min(10, zmpForce.training + 1);
      blForce.members = Math.max(0, blForce.members - 30);
      iiaForce.members = Math.max(0, iiaForce.members - 20);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 6);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 2);
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 5);
        }
      }
      st.momentum = clamp((st.momentum || 0) + 5, -10, 20);
      st.unity = clamp(st.unity + 6, 0, 100);
      
      notes.push('📈 ZMP support surges!');
      st.log.push('Week ' + st.week + ': Second Battle of Ca\'uf - ZMP solo victory');
    } else {
      notes.push(' DISASTER! ZMP is crushed between two enemies!');
      st.battle2Won = false;
      st.battle2Lost = true;
      
      zmpForce.members = Math.max(0, zmpForce.members - 50);
      zmpForce.morale = Math.max(10, zmpForce.morale - 25);
      zmpForce.equipment = Math.max(1, zmpForce.equipment - 2);
      blForce.members += 40;
      blForce.morale = Math.min(100, blForce.morale + 10);
      iiaForce.members += 20;
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 10);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 3);
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 5);
        }
      }
      st.momentum = clamp((st.momentum || 0) - 8, -10, 20);
      st.unity = clamp(st.unity - 15, 0, 100);
      st.faculty = clamp(st.faculty - 10, 0, 100);
      
      notes.push('📉 ZMP crashes! Dissidents rise!');
      st.log.push('Week ' + st.week + ': Second Battle of Ca\'uf - ZMP disaster');
    }
  } else if (choice === 'ignore') {
    notes.push('🕊️ ZMP stays neutral. The battle rages on.');
    
    var iiaWins = (iiaStrength * (0.7 + rng() * 0.4)) > (blPower * (0.7 + rng() * 0.4));
    
    if (iiaWins) {
      notes.push('IIA emerges victorious but weakened.');
      iiaForce.members = Math.max(0, iiaForce.members - 20);
      blForce.members = Math.max(0, blForce.members - 30);
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 1);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) + 3, 0, 100);
      st.log.push('Week ' + st.week + ': Second Battle - IIA wins (neutral)');
    } else {
      notes.push(' The Black League crushes IIA!');
      blForce.members += 30;
      blForce.morale = Math.min(100, blForce.morale + 10);
      iiaForce.members = Math.max(0, iiaForce.members - 40);
      iiaForce.morale = Math.max(10, iiaForce.morale - 20);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 5);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 3);
        }
      }
      st.affinity.bl = clamp((st.affinity.bl || 0) + 10, 0, 100);
      st.log.push('Week ' + st.week + ': Second Battle - BL wins (neutral)');
    }
  }
  
  return notes;
}



  /* ---------------- FACTION DYNAMICS & THREAT SYSTEM ---------------- */

// Track faction agendas and threats
function updateFactionDynamics(st, rng) {
  if (!st) return [];
  
  var notes = [];
  
  // Check each faction's agenda progress
  var zmpSupport = getPartySupport(st, 'ZMP');
  var blSupport = getPartySupport(st, 'bl');
  var iiaSupport = getPartySupport(st, 'iia');
  var zpfSupport = getPartySupport(st, 'zpf');
  var redSupport = getPartySupport(st, 'red');
  var rbSupport = getPartySupport(st, 'rb');
  var sempSupport = getPartySupport(st, 'semp');
  var republiaSupport = getPartySupport(st, 'republia');
  var sporticaSupport = getPartySupport(st, 'sportica');
  var tiiaSupport = st.tiiaExists ? getPartySupport(st, 'tiia') : 0;
  
  // 1. BLACK LEAGUE THREAT - If BL support > 40%, they become aggressive
  if (blSupport > 40 && !st.blNeutralized) {
    if (blSupport > 55 && !st.blTakeoverAttempted) {
      notes.push(' BLACK LEAGUE TAKEOVER ATTEMPT!');
      notes.push('The Black League has reached ' + Math.round(blSupport) + '% support and is attempting to seize control!');
      
      // Check if ZMP has enough support to fight back
      if (zmpSupport > 35) {
        notes.push(' The ZMP rallies to defend democracy!');
        var fightResult = resolveBLTakeoverFight(st, rng);
        notes = notes.concat(fightResult.notes);
        if (fightResult.outcome === 'victory') {
          st.blNeutralized = true;
          notes.push(' The Black League has been defeated!');
        } else {
          notes.push('💔 The Black League has won. The school falls to fascism.');
          st.gameOver = true;
          st.endingData = {
            ending: 'black_league_victory',
            title: 'THE BLACK LEAGUE VICTORY',
            subtitle: 'Fascism takes the school.',
            endingNumber: 'Ending 1',
            body: 'The Black League has won the struggle for the school.',
            story: 'Through superior organization and ruthlessness, the Black League has crushed all opposition. The council is abolished. The faculty is purged. Students live in fear.',
            subending: 'Subending A - The Long Night',
            detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>' +
              '<div class="stat"><span>BL Support</span><span class="v">' + Math.round(blSupport) + '%</span></div>',
            epilogue: 'The Black League rules for a generation. Their grip on the school is absolute.'
          };
          st.finished = true;
        }
        st.blTakeoverAttempted = true;
      } else {
        notes.push(' The ZMP is too weak to resist! (' + Math.round(zmpSupport) + '% support)');
        notes.push('🏴 The Black League has won.');
        st.gameOver = true;
        st.blTakeoverAttempted = true;
        st.endingData = {
          ending: 'black_league_victory',
          title: 'THE BLACK LEAGUE VICTORY',
          subtitle: 'Fascism takes the school.',
          endingNumber: 'Ending 1',
          body: 'The Black League has won the struggle for the school.',
          story: 'The ZMP was too weak to resist. The Black League has crushed all opposition.',
          subending: 'Subending A - The Long Night',
          detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
          epilogue: 'The Black League rules with an iron fist.'
        };
        st.finished = true;
      }
    }
  }

  
  
  // 2. IIA GIRL REPUBLIC THREAT - If IIA + Red + RB + TIIA > 40%, they form a Girl Republic
  var girlCoalition = iiaSupport + redSupport + rbSupport + tiiaSupport;
  if (girlCoalition > 40 && !st.girlRepublicFormed && !st.girlRepublicDefeated) {
    notes.push('👩 GIRL REPUBLIC THREAT!');
    notes.push('The left-tech alliance (IIA + Red + RB + TIIA) has reached ' + Math.round(girlCoalition) + '% support!');
    
    if (girlCoalition > 55) {
      notes.push('💖 The Girl Republic has been declared!');
      notes.push('The girls have seized control of the council.');
      
      // Check if ZMP can resist
      if (zmpSupport > 30) {
        notes.push(' The ZMP fights back against the Girl Republic!');
        var fightResult = resolveGirlRepublicFight(st, rng);
        notes = notes.concat(fightResult.notes);
        if (fightResult.outcome === 'victory') {
          st.girlRepublicDefeated = true;
          notes.push(' The Girl Republic has been defeated!');
        } else {
          notes.push('💖 The Girl Republic has won. The school is now a matriarchy.');
          st.girlRepublicFormed = true;
          st.endingData = {
            ending: 'girl_republic',
            title: 'THE GIRL REPUBLIC',
            subtitle: 'The left-tech alliance rules.',
            endingNumber: 'Ending 5',
            body: 'The Girl Republic has seized control of the school.',
            story: 'The alliance of IIA, Red Front, Red Bench, and TIIA has created a new order. The girls hold the grip.',
            subending: 'Subending E - The Girl Power Revolution',
            detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
            epilogue: 'The Girl Republic rules the school for a generation.'
          };
          st.finished = true;
        }
      } else {
        notes.push('💖 The ZMP is too weak to resist. The Girl Republic wins.');
        st.girlRepublicFormed = true;
        st.endingData = {
          ending: 'girl_republic',
          title: 'THE GIRL REPUBLIC',
          subtitle: 'The left-tech alliance rules.',
          endingNumber: 'Ending 5',
          body: 'The Girl Republic has won.',
          story: 'The ZMP was too weak to resist the Girl Republic.',
          subending: 'Subending E - The Girl Power Revolution',
          detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
          epilogue: 'The Girl Republic rules the school.'
        };
        st.finished = true;
      }
    }
  }
  
  // 3. FACULTY COUP - If faculty drops below 20% and ZMP is weak
  if (st.faculty < 20 && zmpSupport < 30 && !st.facultyCoupAttempted) {
    notes.push('👨‍🏫 FACULTY COUP ATTEMPT!');
    notes.push('The faculty has lost patience with the chaos and is attempting to take control.');
    st.facultyCoupAttempted = true;
    
    var coupResult = resolveFacultyCoup(st, rng);
    notes = notes.concat(coupResult.notes);
    if (coupResult.outcome === 'victory') {
      notes.push(' The faculty coup has been defeated!');
    } else {
      notes.push('👨‍🏫 The faculty has seized control of the school.');
      st.endingData = {
        ending: 'faculty_coup',
        title: 'FACULTY COUP',
        subtitle: 'The teachers have taken over.',
        endingNumber: 'Ending 9',
        body: 'The faculty has dissolved the council and taken direct control.',
        story: 'The faculty, tired of student politics, has seized control of the school.',
        subending: 'Subending I - The Pedagogical Dictatorship',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'The faculty rules the school for decades. Student government is abolished.'
      };
      st.finished = true;
    }
  }
  
  // 4. WEIN FOREIGN ALLIANCE - Triggered by foreign relations
  if (st.hasArbeiterAlly && st.affinity.wein > 70 && !st.weinInterventionTriggered) {
    notes.push('🌍 WEIN INTERVENTION!');
    notes.push('The Arbeiter von Wein has sent aid to the ZMP!');
    st.weinInterventionTriggered = true;
    
    // Massive boost to ZMP
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 8);
      }
    }
    st.momentum = Math.min(20, st.momentum + 10);
    st.unity = Math.min(100, st.unity + 8);
    
    notes.push('📈 ZMP +8% across all groups! Momentum +10!');
    notes.push('💪 Foreign intervention has turned the tide!');
    st.log.push('Week ' + st.week + ': Wein intervention - ZMP boosted');
  }
  
  // 5. ZPF - The ONLY true ally (fighting for same goal)
  // ZPF helps ZMP when in trouble
  if (zpfSupport > 20 && zmpSupport < 25 && !st.zpfRescueTriggered) {
    notes.push('⚫ ZPF TO THE RESCUE!');
    notes.push('The ZPF has rallied to support the ZMP in its time of need.');
    st.zpfRescueTriggered = true;
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 5);
        st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 3);
      }
    }
    st.unity = Math.min(100, st.unity + 5);
    notes.push('📈 ZMP +5%! ZPF +3%!');
    notes.push(' The ZPF is the only party that truly shares your goals.');
    st.log.push('Week ' + st.week + ': ZPF rescues ZMP');
  }
  
  // 6. DZEHURJACA CHARGE - Last stand against overwhelming odds
  if (st.gameOver !== true && (blSupport > 50 || girlCoalition > 50) && !st.dzehurjacaCharged) {
    notes.push(' DZEHURJACA CHARGE AVAILABLE!');
    notes.push('The situation is dire! You can make a heroic last stand.');
    notes.push('Success chance: ' + Math.round(30 + (st.unity / 2) + (st.momentum * 2)) + '%');
    st.dzehurjacaAvailable = true;
  }
  
  return notes;
}

/* ---------------- BATTLE RESOLUTIONS ---------------- */

function resolveBLTakeoverFight(st, rng) {
  var notes = [];
  var zmpSupport = getPartySupport(st, 'ZMP');
  var blSupport = getPartySupport(st, 'bl');
  var zpfSupport = getPartySupport(st, 'zpf');
  var unity = st.unity || 50;
  var faculty = st.faculty || 50;
  
  // Calculate fight strength
  var zmpStrength = zmpSupport * 0.6 + unity * 0.3 + faculty * 0.1;
  var blStrength = blSupport * 0.8;
  
  // ZPF helps if relations are good
  if (st.affinity.zpf && st.affinity.zpf > 50) {
    zmpStrength += zpfSupport * 0.3;
    notes.push('⚫ ZPF joins the fight against the Black League!');
  }
  
  // Wein helps if allied
  if (st.hasArbeiterAlly) {
    zmpStrength *= 1.3;
    notes.push('🌍 Wein forces assist the ZMP!');
  }
  
  var zmpRoll = zmpStrength * (0.7 + rng() * 0.6);
  var blRoll = blStrength * (0.7 + rng() * 0.6);
  
  notes.push(' ZMP strength: ' + Math.round(zmpStrength) + ' vs BL strength: ' + Math.round(blStrength));
  
  if (zmpRoll > blRoll) {
    notes.push(' VICTORY! The ZMP has defeated the Black League!');
    // Reduce BL support significantly
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 15);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 5);
      }
    }
    st.momentum = Math.min(20, st.momentum + 6);
    st.unity = Math.min(100, st.unity + 8);
    st.blNeutralized = true;
    notes.push('📈 BL -15%! ZMP +5%!');
    return { notes: notes, outcome: 'victory' };
  } else {
    notes.push(' DEFEAT! The Black League has won!');
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 10);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 10);
      }
    }
    notes.push('📈 BL +10%! ZMP -10%!');
    return { notes: notes, outcome: 'defeat' };
  }
}

function resolveGirlRepublicFight(st, rng) {
  var notes = [];
  var zmpSupport = getPartySupport(st, 'ZMP');
  var girlCoalition = getPartySupport(st, 'iia') + getPartySupport(st, 'red') + getPartySupport(st, 'rb');
  var zpfSupport = getPartySupport(st, 'zpf');
  
  var zmpStrength = zmpSupport * 0.5 + (st.unity || 50) * 0.3;
  var girlStrength = girlCoalition * 0.7;
  
  // ZPF helps if relations are good
  if (st.affinity.zpf && st.affinity.zpf > 40) {
    zmpStrength += zpfSupport * 0.2;
    notes.push('⚫ ZPF supports the ZMP against the Girl Republic!');
  }
  
  var zmpRoll = zmpStrength * (0.7 + rng() * 0.6);
  var girlRoll = girlStrength * (0.7 + rng() * 0.6);
  
  if (zmpRoll > girlRoll) {
    notes.push(' VICTORY! The Girl Republic has been defeated!');
    // Reduce girl coalition support
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 5);
        st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 5);
        st.raw.rb[dm.id] = Math.max(0.5, (st.raw.rb[dm.id] || 0) - 5);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 5);
      }
    }
    st.momentum = Math.min(20, st.momentum + 5);
    st.unity = Math.min(100, st.unity + 5);
    notes.push('📈 ZMP +5%! Girl coalition -5%!');
    return { notes: notes, outcome: 'victory' };
  } else {
    notes.push('💖 The Girl Republic has won!');
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 8);
        st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 8);
        st.raw.rb[dm.id] = Math.max(0.5, (st.raw.rb[dm.id] || 0) + 8);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 8);
      }
    }
    notes.push('📈 Girl coalition +8%! ZMP -8%!');
    return { notes: notes, outcome: 'defeat' };
  }
}

function resolveFacultyCoup(st, rng) {
  var notes = [];
  var zmpSupport = getPartySupport(st, 'ZMP');
  var facultySupport = st.faculty || 50;
  
  var zmpStrength = zmpSupport * 0.4 + (st.unity || 50) * 0.2;
  var facultyStrength = facultySupport * 0.6;
  
  var zmpRoll = zmpStrength * (0.7 + rng() * 0.6);
  var facultyRoll = facultyStrength * (0.7 + rng() * 0.6);
  
  if (zmpRoll > facultyRoll) {
    notes.push(' The faculty coup has been defeated!');
    st.faculty = Math.min(100, st.faculty + 10);
    notes.push('📈 Faculty +10% (they respect your strength)');
    return { notes: notes, outcome: 'victory' };
  } else {
    notes.push('👨‍🏫 The faculty has won!');
    return { notes: notes, outcome: 'defeat' };
  }
}

/* ---------------- DZEHURJACA CHARGE ---------------- */

function resolveDzehurjacaCharge(st, rng) {
  var notes = [];
  
  if (!st.dzehurjacaAvailable) {
    notes.push(' The Dzehurjaca Charge is not available.');
    return { ok: false, notes: notes };
  }
  
  var zmpSupport = getPartySupport(st, 'ZMP');
  var blSupport = getPartySupport(st, 'bl');
  var girlCoalition = getPartySupport(st, 'iia') + getPartySupport(st, 'red') + getPartySupport(st, 'rb');
  var unity = st.unity || 50;
  var momentum = st.momentum || 0;
  
  // Success chance: 30% base + unity/2 + momentum*2
  var successChance = 30 + (unity / 2) + (momentum * 2);
  successChance = Math.min(85, Math.max(10, successChance));
  
  notes.push(' DZEHURJACA CHARGE!');
  notes.push('You lead a heroic last stand against the enemies of democracy!');
  notes.push('Success chance: ' + Math.round(successChance) + '%');
  
  if (rng() * 100 < successChance) {
    notes.push(' MIRACLE VICTORY!');
    notes.push('The Dzehurjaca Charge has succeeded! The enemies are routed!');
    
    // Massive victory effects
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 12);
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 15);
        st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 8);
        st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 8);
        st.raw.rb[dm.id] = Math.max(0.5, (st.raw.rb[dm.id] || 0) - 8);
      }
    }
    st.momentum = Math.min(20, st.momentum + 12);
    st.unity = Math.min(100, st.unity + 15);
    st.faculty = Math.min(100, st.faculty + 8);
    st.blNeutralized = true;
    st.girlRepublicDefeated = true;
    st.dzehurjacaAvailable = false;
    st.dzehurjacaCharged = true;
    
    notes.push('📈 ZMP +12%! BL -15%! Girl coalition -8%!');
    notes.push('💪 The ZMP has achieved legendary status!');
    st.log.push('Week ' + st.week + ': DZEHURJACA CHARGE - VICTORY!');
    
    return { ok: true, outcome: 'victory', notes: notes };
  } else {
    notes.push(' The Dzehurjaca Charge has failed.');
    notes.push('The enemies of democracy have won.');
    
    // Massive defeat effects
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 15);
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 12);
      }
    }
    st.dzehurjacaAvailable = false;
    st.dzehurjacaCharged = true;
    st.gameOver = true;
    
    // Determine who wins
    if (blSupport > 40) {
      st.endingData = {
        ending: 'black_league_victory',
        title: 'THE BLACK LEAGUE VICTORY',
        subtitle: 'The charge failed. Darkness falls.',
        endingNumber: 'Ending 1',
        body: 'The Dzehurjaca Charge failed. The Black League has won.',
        story: 'Your heroic last stand was not enough. The Black League has crushed all opposition.',
        subending: 'Subending A - The Long Night',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'The Black League rules with an iron fist.'
      };
    } else {
      st.endingData = {
        ending: 'girl_republic',
        title: 'THE GIRL REPUBLIC VICTORY',
        subtitle: 'The charge failed. The girls have won.',
        endingNumber: 'Ending 5',
        body: 'The Dzehurjaca Charge failed. The Girl Republic has won.',
        story: 'Your heroic last stand was not enough. The Girl Republic has seized control.',
        subending: 'Subending E - The Girl Power Revolution',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'The Girl Republic rules the school.'
      };
    }
    st.finished = true;
    
    notes.push(' GAME OVER');
    st.log.push('Week ' + st.week + ': DZEHURJACA CHARGE - FAILED');
    
    return { ok: false, outcome: 'defeat', notes: notes };
  }
}

  /* ---------------- Generate Presidential Election Results ---------------- */
/* ---------------- Generate Presidential Election Results ---------------- */
/* ---------------- Generate Presidential Election Results ---------------- */
function generatePresidentialResults(st, rng) {
  var results = {
    candidates: [],
    endorsements: [],
    stateResults: {},
    totalVotes: 0,
    turnout: 76,
    winner: null,
    winnerParty: null,
    winnerVotes: 0,
    secondPlace: null,
    secondParty: null,
    margin: 0,
    round1Results: [],
    runoffResults: []
  };
  
  // Get candidate data with proper candidate selection
  var candidateData = [];
  var playerChoice = st.presidentialCandidate || null;
  
  // Determine which candidates are available based on player choice
  // Player can only e: Ahmad VI (ZMP - $20 cost), Bojkanic (Unity - $10 cost), or IIA Candidate (free)
  var availableCandidates = [];
  
  // 1. Ahmad VI - ZMP candidate (always available, costs $20)
  var zmpSupport = getPartySupport(st, 'ZMP');
  var ahmadSupport = zmpSupport * 0.6 + 8;
  availableCandidates.push({
    id: 'ahmad',
    name: 'Ahmad VI',
    party: 'ZMP',
    ideology: 'Zalgrilianism (Social Monarchism)',
    color: '#5fae3c',
    support: ahmadSupport,
    cost: 20,
    isPlayerChoice: (playerChoice === 'ahmad')
  });
  
  // 2. Bojkanic - Unity candidate (always available, costs $10)
  var zpfSupport = getPartySupport(st, 'zpf');
  var iiaSupport = getPartySupport(st, 'iia');
  var sempSupport = getPartySupport(st, 'semp');
  var bojkanicSupport = (zpfSupport + iiaSupport + sempSupport) / 3 + 5;
  availableCandidates.push({
    id: 'bojkanic',
    name: 'Bojkanic',
    party: 'Unity',
    ideology: 'Centre Unity',
    color: '#66aaff',
    support: bojkanicSupport,
    cost: 10,
    isPlayerChoice: (playerChoice === 'bojkanic')
  });
  
  // 3. IIA Candidate - Tech Party (free, always available)
  var iiaCandidateSupport = iiaSupport * 0.8 + 3;
  availableCandidates.push({
    id: 'iia',
    name: 'IIA Candidate',
    party: 'IIA',
    ideology: 'Technocratic Centre',
    color: '#2244dd',
    support: iiaCandidateSupport,
    cost: 0,
    isPlayerChoice: (playerChoice === 'iia')
  });
  
  // AI candidates that run independently (cannot be chosen by player)
  // 4. Ganix - ZPF candidate (left-wing)
  var ganixSupport = zpfSupport * 0.7 + 4;
  candidateData.push({
    id: 'ganix',
    name: 'Ganix',
    party: 'ZPF',
    ideology: 'Left-Wing Centre-Left',
    color: '#006400',
    support: ganixSupport,
    isPlayer: false,
    isAI: true
  });
  
  // 5. Republia candidate - Muhaga (right-wing nationalist)
  var republiaSupport = getPartySupport(st, 'republia');
  var muhagaSupport = republiaSupport * 0.5 + 2;
  if (st.raw.republia && st.merged.indexOf('republia') === -1) {
    candidateData.push({
      id: 'muhaga',
      name: 'Muhaga',
      party: 'Republia',
      ideology: 'Right-Wing Nationalist',
      color: '#2a5c8a',
      support: muhagaSupport,
      isPlayer: false,
      isAI: true
    });
  }
  
  // 6. Sportica candidate - Klaus Schmidt (right-wing)
  var sporticaSupport = getPartySupport(st, 'sportica');
  var klausSupport = sporticaSupport * 0.4 + 2;
  if (st.raw.sportica && st.merged.indexOf('sportica') === -1) {
    candidateData.push({
      id: 'klaus',
      name: 'Klaus Schmidt',
      party: 'Sportica',
      ideology: 'Right-Wing Populist',
      color: '#17c0d8',
      support: klausSupport,
      isPlayer: false,
      isAI: true
    });
  }
  
  // 7. SEMP/SPF - Left wing Marxist, supports ZPF (ideological alignment)
  if (st.raw.semp && st.merged.indexOf('semp') === -1 && sempSupport > 5) {
    candidateData.push({
      id: 'semp_endorse',
      name: 'SPF Endorsement',
      party: 'SPF',
      ideology: 'Left-Wing Marxism',
      color: '#ff6b6b',
      support: sempSupport * 0.4,
      isPlayer: false,
      isAI: true,
      isEndorsement: true,
      endorses: 'ganix'
    });
  }
  
  // 8. Red Front - left wing, supports IIA candidate
  var redSupport = getPartySupport(st, 'red');
  if (st.raw.red && st.merged.indexOf('red') === -1 && redSupport > 5) {
    candidateData.push({
      id: 'red_endorse',
      name: 'Red Front Endorsement',
      party: 'Red Front',
      ideology: 'Left-Wing Marxism',
      color: '#cc0000',
      support: redSupport * 0.4,
      isPlayer: false,
      isAI: true,
      isEndorsement: true,
      endorses: 'iia'
    });
  }
  
  // 9. Red Bench - left wing, supports IIA candidate
  var rbSupport = getPartySupport(st, 'rb');
  if (st.raw.rb && st.merged.indexOf('rb') === -1 && rbSupport > 5) {
    candidateData.push({
      id: 'rb_endorse',
      name: 'Red Bench Endorsement',
      party: 'Red Bench',
      ideology: 'Left-Wing Centre-Left',
      color: '#ff6b6b',
      support: rbSupport * 0.4,
      isPlayer: false,
      isAI: true,
      isEndorsement: true,
      endorses: 'iia'
    });
  }
  
  // 10. PL - Pep League, supports IIA candidate
  var plSupport = getPartySupport(st, 'pl');
  if (st.raw.pl && st.merged.indexOf('pl') === -1 && plSupport > 5) {
    candidateData.push({
      id: 'pl_endorse',
      name: 'PL Endorsement',
      party: 'PL',
      ideology: 'Centre-Left',
      color: '#ff6b6b',
      support: plSupport * 0.3,
      isPlayer: false,
      isAI: true,
      isEndorsement: true,
      endorses: 'iia'
    });
  }
  
  // 11. Black League - Mehmedera (Fascist) - runs if BL exists
  var blSupport = getPartySupport(st, 'bl');
  if (st.raw.bl && st.merged.indexOf('bl') === -1 && blSupport > 3) {
    var mehmederaSupport = blSupport * 0.5 + 2;
    candidateData.push({
      id: 'mehmedera',
      name: 'Mehmedera',
      party: 'Black League',
      ideology: 'Fascism (Hitlerite)',
      color: '#141414',
      support: mehmederaSupport,
      isPlayer: false,
      isAI: true
    });
  }
  
  // 12. SPLINTER PARTIES - ONLY if Black League has been splintered (blSplintered === true)
  if (st.blSplintered === true) {
    // CrNP - Conservative Nationalist (right-wing nationalist)
    var crnpSupport = getPartySupport(st, 'crnp');
    if (st.raw.crnp && st.merged.indexOf('crnp') === -1 && crnpSupport > 5) {
      candidateData.push({
        id: 'crnp',
        name: 'CrNP Candidate',
        party: 'CrNP',
        ideology: 'Right-Wing Nationalist',
        color: '#2a5c8a',
        support: crnpSupport * 0.4,
        isPlayer: false,
        isAI: true
      });
    }
    
    // FLO - Freedom Liberty Order (right-wing libertarian)
    var floSupport = getPartySupport(st, 'flo');
    if (st.raw.flo && st.merged.indexOf('flo') === -1 && floSupport > 5) {
      candidateData.push({
        id: 'flo',
        name: 'FLO Candidate',
        party: 'FLO',
        ideology: 'Right-Wing Libertarian',
        color: '#e0518f',
        support: floSupport * 0.4,
        isPlayer: false,
        isAI: true
      });
    }
    
    // NHP - New Hope (centre-right reformist)
    var nhpSupport = getPartySupport(st, 'nhp');
    if (st.raw.nhp && st.merged.indexOf('nhp') === -1 && nhpSupport > 5) {
      candidateData.push({
        id: 'nhp',
        name: 'NHP Candidate',
        party: 'NHP',
        ideology: 'Centre-Right Reformist',
        color: '#17c0d8',
        support: nhpSupport * 0.4,
        isPlayer: false,
        isAI: true
      });
    }
  }
  
  // Apply campaign bonus to player's chosen candidate
  var campaignBonus = st.presidentialCampaignBonus || 0;
  availableCandidates.forEach(function(c) {
    if (c.isPlayerChoice) {
      c.support += campaignBonus * 0.6 + 5;
    }
  });
  
  // Add randomness for election day
  availableCandidates.forEach(function(c) {
    c.support *= (0.85 + rng() * 0.3);
  });
  candidateData.forEach(function(c) {
    c.support *= (0.85 + rng() * 0.3);
  });
  
  // Combine all candidates
  var allCandidates = availableCandidates.concat(candidateData);
  
  // Filter out low support and merge endorsements
  var finalCandidates = [];
  allCandidates.forEach(function(c) {
    if (c.support > 1.5) {
      // If it's an endorsement, add to the supported candidate
      if (c.isEndorsement && c.endorses) {
        var target = finalCandidates.find(function(fc) { return fc.id === c.endorses; });
        if (target) {
          target.support += c.support * 0.5;
          target.endorsements = target.endorsements || [];
          target.endorsements.push(c.party);
        }
      } else {
        finalCandidates.push(c);
      }
    }
  });
  
  // If no candidates, add default
  if (finalCandidates.length === 0) {
    finalCandidates.push({
      id: 'ahmad',
      name: 'Ahmad VI',
      party: 'ZMP',
      ideology: 'Zalgrilianism (Social Monarchism)',
      color: '#5fae3c',
      support: 50,
      isPlayerChoice: true
    });
  }
  
  // Normalize to 100%
  var totalSupport = 0;
  finalCandidates.forEach(function(c) {
    totalSupport += c.support;
  });
  if (totalSupport > 0) {
    finalCandidates.forEach(function(c) {
      c.percent = (c.support / totalSupport) * 100;
    });
  }
  
  // Sort by percent descending
  finalCandidates.sort(function(a, b) { return b.percent - a.percent; });
  
  // Round 1 results
  var round1Results = finalCandidates.map(function(c) { 
    return { 
      name: c.name, 
      party: c.party, 
      percent: Math.round(c.percent),
      id: c.id,
      ideology: c.ideology || 'Unknown'
    }; 
  });
  
  // Check if any candidate has 50%+
  var winner = null;
  
  if (finalCandidates[0].percent >= 50) {
    winner = finalCandidates[0];
    results.runoffResults = null;
  } else if (finalCandidates.length >= 3) {
    // TOP 3 GO TO RUNOFF
    var top3 = finalCandidates.slice(0, 3);
    results.runoffResults = top3.map(function(c) { 
      return { 
        name: c.name, 
        party: c.party, 
        percent: Math.round(c.percent),
        id: c.id,
        ideology: c.ideology || 'Unknown'
      }; 
    });
    
    // RUNOFF VOTE - SIMULATE VOTER PREFERENCES
    var runoffVotes = {};
    var totalRunoffVotes = 0;
    
    // Each candidate gets their base votes
    top3.forEach(function(c) {
      // Base is their round 1 percentage
      var baseVotes = c.percent;
      
    
      for (var i = 3; i < finalCandidates.length; i++) {
        var eliminated = finalCandidates[i];
        var transferChance = 0;
        
        // Ideological similarity determines where votes go
        if (c.id === 'ahmad' && (eliminated.id === 'bojkanic' || eliminated.id === 'nhp')) {
          transferChance = 0.5; // Unity voters like ZMP
        } else if (c.id === 'bojkanic' && (eliminated.id === 'iia' || eliminated.id === 'pl')) {
          transferChance = 0.4; // Tech/left voters like Unity
        } else if (c.id === 'iia' && (eliminated.id === 'red' || eliminated.id === 'rb' || eliminated.id === 'pl')) {
          transferChance = 0.6; // Left voters like IIA
        } else if (c.id === 'ganix' && (eliminated.id === 'semp' || eliminated.id === 'red')) {
          transferChance = 0.5; // Left voters like ZPF
        } else if (c.id === 'mehmedera' && (eliminated.id === 'crnp' || eliminated.id === 'flo' || eliminated.id === 'republia')) {
          transferChance = 0.4; // Right-wing voters like BL
        } else if (c.id === 'muhaga' && (eliminated.id === 'crnp' || eliminated.id === 'flo')) {
          transferChance = 0.4; // Right-wing voters like Republia
        } else if (c.id === 'klaus' && eliminated.id === 'sportica') {
          transferChance = 0.3; // Sportica voters stick together
        } else if (c.id === 'ahmad' && eliminated.id === 'ganix') {
          transferChance = 0.2; // Some left voters go to ZMP
        } else if (c.id === 'bojkanic' && eliminated.id === 'iia') {
          transferChance = 0.3; // Some tech voters go to Unity
        } else if (c.id === 'bojkanic' && eliminated.id === 'zpf') {
          transferChance = 0.3; // Some ZPF voters go to Unity
        }
        
        // Random variation
        transferChance = transferChance * (0.7 + rng() * 0.6);
        baseVotes += eliminated.percent * transferChance * 0.3;
      }
      
      runoffVotes[c.id] = baseVotes;
      totalRunoffVotes += baseVotes;
    });
    
    // Normalize to 100%
    if (totalRunoffVotes > 0) {
      for (var id in runoffVotes) {
        runoffVotes[id] = (runoffVotes[id] / totalRunoffVotes) * 100;
      }
    }
    
    // Determine runoff winner - the one with the HIGHEST votes
    var runoffWinner = top3[0].id;
    var runoffHighest = runoffVotes[top3[0].id];
    for (var i = 1; i < top3.length; i++) {
      if (runoffVotes[top3[i].id] > runoffHighest) {
        runoffHighest = runoffVotes[top3[i].id];
        runoffWinner = top3[i].id;
      }
    }
    
    // Update runoff results with actual percentages
    results.runoffResults = top3.map(function(c) { 
      return { 
        name: c.name, 
        party: c.party, 
        percent: Math.round(runoffVotes[c.id] || 0),
        id: c.id,
        ideology: c.ideology || 'Unknown'
      }; 
    });
    
    // Sort runoff results by votes
    results.runoffResults.sort(function(a, b) { return b.percent - a.percent; });
    
    winner = finalCandidates.find(function(c) { return c.id === runoffWinner; });
    if (winner) {
      winner.percent = runoffHighest;
    }
    
    // SAFETY CHECK: If winner is from Black League but didn't have the most votes
    // This should only happen if BL actually won legitimately
    if (winner && winner.id === 'mehmedera') {
      // Double-check that BL actually got the most votes in runoff
      var blRunoffVotes = runoffVotes['mehmedera'] || 0;
      var zmpRunoffVotes = runoffVotes['ahmad'] || 0;
      var iiaRunoffVotes = runoffVotes['iia'] || 0;
      
      // If BL is third or lower, prevent the game over
      if (blRunoffVotes < zmpRunoffVotes && blRunoffVotes < iiaRunoffVotes) {
        // BL didn't win - give it to the actual winner
        var actualWinner = 'ahmad';
        if (zmpRunoffVotes < iiaRunoffVotes) actualWinner = 'iia';
        winner = finalCandidates.find(function(c) { return c.id === actualWinner; });
        if (winner) {
          winner.percent = Math.max(zmpRunoffVotes, iiaRunoffVotes);
        }
      }
    }
  } else {
    // 2 candidates, simple majority
    winner = finalCandidates[0];
  }
  
  results.candidates = finalCandidates;
  results.round1Results = round1Results;
  results.winner = winner ? winner.name : 'Unknown';
  results.winnerParty = winner ? winner.party : 'Unknown';
  results.winnerVotes = winner ? Math.round(winner.percent) : 0;
  
  if (finalCandidates.length > 1) {
    results.secondPlace = finalCandidates[1].name;
    results.secondParty = finalCandidates[1].party;
    results.margin = Math.round(finalCandidates[0].percent - (finalCandidates[1] ? finalCandidates[1].percent : 0));
  }
  
  // Generate endorsements (only from parties that actually exist)
  var endorsementPool = [];
  var active = activeParties(st);
  active.forEach(function(p) {
    if (p.id === 'ZMP' || p.id === 'other') return;
    var support = getPartySupport(st, p.id);
    if (support > 5) {
      var endorsed = null;
      // Ideological endorsements based on party ideology
      if (p.id === 'zpf') {
        endorsed = finalCandidates.find(function(c) { return c.id === 'ganix'; });
      } else if (p.id === 'semp') {
        endorsed = finalCandidates.find(function(c) { return c.id === 'ganix'; });
      } else if (p.id === 'iia' || p.id === 'pl') {
        endorsed = finalCandidates.find(function(c) { return c.id === 'iia'; });
      } else if (p.id === 'red' || p.id === 'rb') {
        endorsed = finalCandidates.find(function(c) { return c.id === 'iia'; });
      } else if (p.id === 'republia') {
        endorsed = finalCandidates.find(function(c) { return c.id === 'muhaga'; });
      } else if (p.id === 'sportica') {
        endorsed = finalCandidates.find(function(c) { return c.id === 'klaus'; });
      } else if (p.id === 'bl') {
        endorsed = finalCandidates.find(function(c) { return c.id === 'mehmedera'; });
      } else if (p.id === 'crnp' || p.id === 'flo' || p.id === 'nhp') {
        var same = finalCandidates.find(function(c) { return c.id === p.id; });
        if (same) {
          endorsed = same;
        } else if (p.id === 'crnp' || p.id === 'flo') {
          endorsed = finalCandidates.find(function(c) { 
            return c.id === 'muhaga' || c.id === 'crnp' || c.id === 'flo'; 
          });
        } else if (p.id === 'nhp') {
          endorsed = finalCandidates.find(function(c) { 
            return c.id === 'nhp' || c.id === 'bojkanic'; 
          });
        }
      }
      if (endorsed) {
        endorsementPool.push({
          endorser: p.short + ' Party',
          type: 'party',
          candidate: endorsed.name,
          party: endorsed.party
        });
      }
    }
  });
  
  // Add non-party endorsements
  var nonPartyEndorsements = [
    { name: 'The Student Voice', type: 'newspaper' },
    { name: 'Faculty Senate', type: 'faculty' },
    { name: 'Athletic Department', type: 'sports' },
    { name: 'Drama Club', type: 'arts' },
    { name: 'Computer Science Club', type: 'tech' }
  ];
  
  var topCandidates = finalCandidates.slice(0, 3);
  nonPartyEndorsements.forEach(function(e) {
    if (topCandidates.length === 0) return;
    var idx = Math.floor(rng() * Math.min(3, topCandidates.length));
    var candidate = topCandidates[idx];
    if (candidate) {
      endorsementPool.push({
        endorser: e.name,
        type: e.type,
        candidate: candidate.name,
        party: candidate.party
      });
    }
  });
  
  results.endorsements = endorsementPool;
  
  // Generate state/region results
  var regions = ['North Wing', 'South Wing', 'East Wing', 'West Wing', 'Central Hall', 'Science Block', 'Arts Building'];
  regions.forEach(function(region) {
    var regionResults = {};
    var regionTotal = 0;
    finalCandidates.forEach(function(c) {
      var regionalBias = (rng() - 0.4) * 8;
      var voteShare = c.percent + regionalBias;
      if (voteShare < 0) voteShare = 0;
      regionResults[c.id] = voteShare;
      regionTotal += voteShare;
    });
    if (regionTotal > 0) {
      for (var pid in regionResults) {
        regionResults[pid] = (regionResults[pid] / regionTotal) * 100;
      }
    }
    var regionWinner = null;
    var regionWinnerVotes = 0;
    for (var pid in regionResults) {
      if (regionResults[pid] > regionWinnerVotes) {
        regionWinnerVotes = regionResults[pid];
        regionWinner = pid;
      }
    }
    results.stateResults[region] = {
      results: regionResults,
      winner: regionWinner,
      winnerVotes: Math.round(regionWinnerVotes)
    };
  });
  
  results.totalVotes = Math.round(200 + rng() * 600);
  results.turnout = Math.round(70 + rng() * 20);
  
  // Apply effects based on winner
  applyPresidentialEffects(st, winner, rng);
  
  return results;
}

/* ---------------- Apply Presidential Effects ---------------- */
function applyPresidentialEffects(st, winner, rng) {
  if (!winner) return;
  
  var notes = [];
  
  // WINNER: Ahmad VI (ZMP - Social Monarchism)
  if (winner.id === 'ahmad') {
    notes.push(' Ahmad VI WINS THE PRESIDENCY! ZMP Social Monarchism triumphant!');
    
    // ZMP +6% on all demographics
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 6);
      }
    }
    st.momentum = clamp((st.momentum || 0) + 8, -10, 20);
    st.unity = clamp(st.unity + 10, 0, 100);
    st.faculty = clamp(st.faculty + 5, 0, 100);
    st.presidentialWinner = 'zmp';
    notes.push('📈 ZMP +6% across all groups! Unity +10! Momentum +8!');
    st.log.push('Week ' + st.week + ': Ahmad VI wins presidency - ZMP boost');
  }
  
  // WINNER: Bojkanic (Unity candidate - Centre)
  else if (winner.id === 'bojkanic') {
    notes.push(' Bojkanic WINS THE PRESIDENCY! Unity and bipartisanship prevail!');
    
    // ZMP +3%, ZPF +3% (centre-left and centre-right come together)
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
        st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 3);
        st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 2);
      }
    }
    st.unity = clamp(st.unity + 12, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 5, -10, 20);
    st.faculty = clamp(st.faculty + 8, 0, 100);
    st.affinity.zpf = clamp((st.affinity.zpf || 0) + 10, 0, 100);
    st.affinity.iia = clamp((st.affinity.iia || 0) + 8, 0, 100);
    st.presidentialWinner = 'unity';
    notes.push('📈 Broad support gains! Unity +12! Faculty +8!');
    st.log.push('Week ' + st.week + ': Bojkanic wins presidency - Unity boost');
  }
  
  // WINNER: IIA Candidate (Technocratic Centre)
  else if (winner.id === 'iia') {
    notes.push('💻 IIA Candidate WINS THE PRESIDENCY! Tech alliance takes power!');
    
    // IIA +9% (major boost), ZMP +2%, Red +4%, RB +4%
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 9);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
        st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 4);
        st.raw.rb[dm.id] = Math.max(0.5, (st.raw.rb[dm.id] || 0) + 4);
      }
    }
    st.affinity.iia = clamp((st.affinity.iia || 0) + 15, 0, 100);
    st.affinity.red = clamp((st.affinity.red || 0) + 8, 0, 100);
    st.affinity.rb = clamp((st.affinity.rb || 0) + 8, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 5, -10, 20);
    st.unity = clamp(st.unity + 4, 0, 100);
    st.presidentialWinner = 'iia';
    notes.push('📈 IIA +9%! Red +4%! RB +4%!');
    notes.push(' Left-wing parties rally behind the IIA candidate!');
    st.log.push('Week ' + st.week + ': IIA candidate wins presidency - Tech alliance boost');
  }
  
  // WINNER: Ganix (ZPF - Left-Wing Centre-Left)
  else if (winner.id === 'ganix') {
    notes.push('⚫ Ganix WINS THE PRESIDENCY! ZPF left-wing surge!');
    
    // ZPF +8% (massive boost), SEMP/SPF also gains
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 8);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
        // SEMP/SPF gains as they supported ZPF
        if (st.raw.semp) {
          st.raw.semp[dm.id] = Math.max(0.5, (st.raw.semp[dm.id] || 0) + 3);
        }
      }
    }
    st.affinity.zpf = clamp((st.affinity.zpf || 0) + 15, 0, 100);
    st.affinity.semp = clamp((st.affinity.semp || 0) + 10, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
    st.faculty = clamp(st.faculty - 3, 0, 100);
    st.presidentialWinner = 'zpf';
    notes.push('📈 ZPF +8%! ZMP +2%! SPF +3%!');
    notes.push(' Left-wing alliance grows stronger!');
    st.log.push('Week ' + st.week + ': Ganix wins presidency - ZPF surge');
  }
  
  // WINNER: Muhaga (Republia - Right-Wing Nationalist)
  else if (winner.id === 'muhaga') {
    notes.push('🔵 Muhaga WINS THE PRESIDENCY! Right-wing nationalist triumph!');
    
    // Republia +5%, Sportica +15% (massive boost)
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 5);
        st.raw.sportica[dm.id] = Math.max(0.5, (st.raw.sportica[dm.id] || 0) + 15);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 1);
      }
    }
    st.affinity.republia = clamp((st.affinity.republia || 0) + 10, 0, 100);
    st.affinity.sportica = clamp((st.affinity.sportica || 0) + 20, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 2, -10, 20);
    st.faculty = clamp(st.faculty - 8, 0, 100);
    st.unity = clamp(st.unity - 3, 0, 100);
    st.presidentialWinner = 'republia';
    notes.push('📈 Republia +5%! Sportica +15% (massive surge!)');
    notes.push(' Right-wing nationalism is on the rise!');
    st.log.push('Week ' + st.week + ': Muhaga wins presidency - Right-wing surge');
  }
  
  // WINNER: Klaus Schmidt (Sportica - Right-Wing Populist)
  else if (winner.id === 'klaus') {
    notes.push('🏅 Klaus Schmidt WINS THE PRESIDENCY! Populist sports movement!');
    
    // Sportica +8%, ZMP +2%
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.sportica[dm.id] = Math.max(0.5, (st.raw.sportica[dm.id] || 0) + 8);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
      }
    }
    st.affinity.sportica = clamp((st.affinity.sportica || 0) + 15, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 4, -10, 20);
    st.unity = clamp(st.unity + 3, 0, 100);
    st.presidentialWinner = 'sportica';
    notes.push('📈 Sportica +8%! ZMP +2%!');
    st.log.push('Week ' + st.week + ': Klaus Schmidt wins presidency - Populist surge');
  }
  
  // WINNER: Mehmedera (Black League - Fascist/Hitlerite) - GAME OVER
  else if (winner.id === 'mehmedera') {
    notes.push(' MEHMEDERA WINS THE PRESIDENCY! THE BLACK LEAGUE TAKES OVER!');
    notes.push('🏴 The fascist Black League has seized control of the school government.');
    notes.push('The council is dissolved. The faculty is purged. Democracy is dead.');
    
    // Game over - Black League victory
    st.gameOver = true;
    st.blTakeoverTriggered = true;
    st.endingData = {
      ending: 'black_league_presidential_takeover',
      title: 'THE BLACK LEAGUE TAKES OVER!',
      subtitle: 'Fascism descends upon the school.',
      endingNumber: 'Ending 8',
      body: 'The Black League has won the presidency through the democratic process... and immediately abolished it.',
      story: 'Mehmedera and the Black League have used the presidency to seize absolute power. The council is dissolved, the faculty is purged, and students live in fear. Your coalition lies in ruins. The halls echo with the sound of boots.',
      subending: 'Subending H - The Fascist Night',
      detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>' +
        '<div class="stat"><span>BL Support</span><span class="v">' + Math.round(getPartySupport(st, 'bl')) + '%</span></div>' +
        '<div class="stat"><span>Status</span><span class="v"> GAME OVER</span></div>',
      epilogue: 'The Black League rules the school with an iron fist. All opposition is crushed. The hallways are silent. The darkness has won.'
    };
    st.finished = true;
    st.presidentialWinner = 'bl';
    notes.push('💥 GAME OVER - Black League victory!');
    st.log.push('Week ' + st.week + ': Mehmedera wins presidency - BLACK LEAGUE TAKEOVER');
  }
  
  // WINNER: CrNP (Conservative Nationalist - Right-Wing Nationalist) - ONLY IF SPLINTERED
  else if (winner.id === 'crnp' && st.blSplintered === true) {
    notes.push('🔵 CrNP WINS THE PRESIDENCY! Conservative nationalists celebrate!');
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 10);
        st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 3);
      }
    }
    st.affinity.crnp = clamp((st.affinity.crnp || 0) + 15, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
    st.faculty = clamp(st.faculty - 5, 0, 100);
    notes.push('📈 CrNP +10%! Republia +3%!');
    st.log.push('Week ' + st.week + ': CrNP wins presidency - Nationalist surge');
  }
  
  // WINNER: NHP (New Hope - Centre-Right Reformist) - ONLY IF SPLINTERED
  else if (winner.id === 'nhp' && st.blSplintered === true) {
    notes.push('🌟 NHP WINS THE PRESIDENCY! Reformist hope!');
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 10);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
      }
    }
    st.affinity.nhp = clamp((st.affinity.nhp || 0) + 15, 0, 100);
    st.unity = clamp(st.unity + 5, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 4, -10, 20);
    notes.push('📈 NHP +10%! ZMP +3%!');
    st.log.push('Week ' + st.week + ': NHP wins presidency - Reformist hope');
  }
  
  // WINNER: FLO (Freedom Liberty Order - Right-Wing Libertarian) - ONLY IF SPLINTERED
  else if (winner.id === 'flo' && st.blSplintered === true) {
    notes.push('🟣 FLO WINS THE PRESIDENCY! Libertarian freedom!');
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 10);
        st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 2);
      }
    }
    st.affinity.flo = clamp((st.affinity.flo || 0) + 15, 0, 100);
    st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
    notes.push('📈 FLO +10%! Republia +2%!');
    st.log.push('Week ' + st.week + ': FLO wins presidency - Libertarian surge');
  }
  
  // Player's candidate won bonus (only if not BL)
  if (winner.isPlayerChoice && winner.id !== 'mehmedera') {
    notes.push('🎉 YOUR CANDIDATE WON! Extra boost for the ZMP!');
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
      }
    }
    st.unity = clamp(st.unity + 5, 0, 100);
    notes.push('📈 ZMP +3% (bonus for backing the winner)');
    st.log.push('Week ' + st.week + ': Player\'s candidate wins - Bonus ZMP boost');
  }
  
  // Store notes for display
  st._presidentialNotes = notes;
}

/* ---------------- Resolve Presidential Choice ---------------- */
function resolvePresidentialChoice(st, choice, rng) {
  var notes = [];
  var candidate = choice;
  st.presidentialCandidate = candidate;
  
  // Check if player has enough funds for the candidate
  var costs = {
    'ahmad': 20,
    'bojkanic': 10,
    'iia': 0
  };
  
  var cost = costs[candidate] || 0;
  if (st.funds < cost) {
    notes.push(' Not enough funds! You need $' + cost + ' to run this candidate.');
    st.presidentialCandidate = null;
    return notes;
  }
  
  // Deduct funds
  st.funds -= cost;
  notes.push('💰 Spent $' + cost + ' on campaign.');
  
  // Determine candidate name for display
  var candidateNames = {
    'ahmad': 'Ahmad VI (ZMP - Social Monarchism)',
    'bojkanic': 'Bojkanic (Unity - Centre)',
    'iia': 'IIA Candidate (Technocratic Centre)'
  };
  
  var candidateIdeologies = {
    'ahmad': 'Zalgrilianism - Social Monarchism',
    'bojkanic': 'Centre Unity',
    'iia': 'Technocratic Centre'
  };
  
  notes.push(' Your candidate: ' + (candidateNames[candidate] || candidate));
  notes.push(' Ideology: ' + (candidateIdeologies[candidate] || 'Unknown'));
  
  // Apply a small initial boost for choosing a candidate
  var bonus = 3 + rng() * 4;
  st.presidentialCampaignBonus = bonus;
  st.presidentialCampaignCount = (st.presidentialCampaignCount || 0) + 1;
  
  notes.push('💪 Campaign bonus: +' + bonus + '%');
  notes.push('🗳️ The presidential election will be held at the end of this week!');
  
  st.presidentialChoiceMade = true;
  st.log.push('Week ' + st.week + ': Presidential candidate chosen - ' + candidate + ' ($' + cost + ')');
  
  return notes;
}

  /* ---------------- Battle 3: The Last of Us ---------------- */
  /* ---------------- Battle 3: The Last of Us ---------------- */
function resolveBattle3(st, choice, rng) {
  var notes = [];
  
  // Initialize paramilitaries if needed
  if (!st.paramilitaries) initParamilitaries(st);
  
  var zmpForce = st.paramilitaries.dzehurjaca;
  var iiaForce = st.paramilitaries.iia_guard;
  var blForce = st.paramilitaries.black_legion;
  var weinForce = st.paramilitaries.wein_workers;
  var redForce = st.paramilitaries.red_militia;
  
  // Calculate paramilitary strengths
  var zmpStrength = calculateParamilitaryStrength(zmpForce);
  var iiaStrength = calculateParamilitaryStrength(iiaForce);
  var blStrength = calculateParamilitaryStrength(blForce);
  var weinStrength = calculateParamilitaryStrength(weinForce);
  var redStrength = calculateParamilitaryStrength(redForce);
  
  var hasArbeiter = st.hasArbeiterAlly || false;
  var alliedBonus = hasArbeiter ? 1.5 : 1.0;
  
  // Check if Red Front joins BL
  var redAffinity = st.affinity.red || 35;
  var redJoinsBL = redAffinity < 30;
  
  if (choice === 'call_allies') {
    var alliedForce = (zmpStrength + iiaStrength) * alliedBonus;
    
    // Wein helps if allied
    if (hasArbeiter) {
      alliedForce += weinStrength * 0.4;
      notes.push('🌍 Wein workers join the battle! (+' + Math.round(weinStrength * 0.4) + ' strength)');
    }
    
    // Red Front joins if hostile
    var enemyForce = blStrength * (st.battle2Lost ? 3 : 1.5);
    if (redJoinsBL) {
      enemyForce += redStrength * 0.3;
      notes.push(' Red Militia joins the Black League!');
    }
    
    var alliedRoll = alliedForce * (0.7 + rng() * 0.4);
    var enemyRoll = enemyForce * (0.7 + rng() * 0.4);
    
    if (alliedRoll > enemyRoll) {
      notes.push(' VICTORY! The allied forces hold Ca\'uf!');
      st.battle3Won = true;
      
      // Boost paramilitaries
      zmpForce.members += 20;
      zmpForce.morale = Math.min(100, zmpForce.morale + 10);
      zmpForce.training = Math.min(10, zmpForce.training + 1);
      iiaForce.members += 15;
      iiaForce.morale = Math.min(100, iiaForce.morale + 8);
      blForce.members = Math.max(0, blForce.members - 50);
      blForce.morale = Math.max(10, blForce.morale - 20);
      blForce.equipment = Math.max(1, blForce.equipment - 2);
      
      if (hasArbeiter) {
        weinForce.morale = Math.min(100, weinForce.morale + 10);
      }
      
      if (redJoinsBL) {
        redForce.members = Math.max(0, redForce.members - 30);
        redForce.morale = Math.max(10, redForce.morale - 15);
      }
      
      // Political effects
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 3);
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 3);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) + 8, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
      st.unity = clamp(st.unity + 3, 0, 100);
      
      notes.push('📈 Small support gains across the alliance.');
      st.log.push('Week ' + st.week + ': The Last of Us - Victory');
    } else {
      notes.push(' GAME OVER - The Black League has conquered Ca\'uf!');
      st.gameOver = true;
      st.battle3Lost = true;
      
      // Massive paramilitary losses
      zmpForce.members = Math.max(0, zmpForce.members - 60);
      zmpForce.morale = Math.max(10, zmpForce.morale - 30);
      zmpForce.equipment = Math.max(1, zmpForce.equipment - 3);
      iiaForce.members = Math.max(0, iiaForce.members - 50);
      blForce.members += 80;
      blForce.morale = Math.min(100, blForce.morale + 20);
      
      notes.push('The ZMP is destroyed. The school falls to the Black League.');
      st.log.push('Week ' + st.week + ': GAME OVER - Black League victory');
    }
  } else if (choice === 'fight_alone') {
    if (st.battle2Lost) {
      var survivalChance = 0.1 + (zmpStrength / 500);
      if (rng() < survivalChance) {
        notes.push(' MIRACLE! ZMP survives the last stand!');
        st.battle3Won = true;
        
        zmpForce.members += 30;
        zmpForce.morale = Math.min(100, zmpForce.morale + 15);
        zmpForce.training = Math.min(10, zmpForce.training + 1);
        blForce.members = Math.max(0, blForce.members - 30);
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 5);
          }
        }
        st.momentum = clamp((st.momentum || 0) + 5, -10, 20);
        st.unity = clamp(st.unity + 10, 0, 100);
        st.log.push('Week ' + st.week + ': The Last of Us - Miracle survival');
      } else {
        notes.push(' GAME OVER - The ZMP is destroyed in the last stand.');
        st.gameOver = true;
        st.battle3Lost = true;
        
        zmpForce.members = Math.max(0, zmpForce.members - 70);
        zmpForce.morale = Math.max(10, zmpForce.morale - 40);
        blForce.members += 50;
        st.log.push('Week ' + st.week + ': GAME OVER - Last stand failed');
      }
    } else {
      var enemyForce2 = blStrength * 1.5;
      if (redJoinsBL) {
        enemyForce2 += redStrength * 0.3;
        notes.push(' Red Militia joins the Black League!');
      }
      
      var alliedForce2 = zmpStrength;
      var alliedRoll2 = alliedForce2 * (0.7 + rng() * 0.4);
      var enemyRoll2 = enemyForce2 * (0.7 + rng() * 0.4);
      
      if (alliedRoll2 > enemyRoll2) {
        notes.push(' VICTORY! ZMP alone holds Ca\'uf!');
        st.battle3Won = true;
        
        zmpForce.members += 25;
        zmpForce.morale = Math.min(100, zmpForce.morale + 12);
        zmpForce.training = Math.min(10, zmpForce.training + 2);
        blForce.members = Math.max(0, blForce.members - 40);
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 4);
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 4);
          }
        }
        st.momentum = clamp((st.momentum || 0) + 4, -10, 20);
        st.unity = clamp(st.unity + 5, 0, 100);
        st.log.push('Week ' + st.week + ': The Last of Us - ZMP solo victory');
      } else {
        notes.push(' GAME OVER - The ZMP is destroyed.');
        st.gameOver = true;
        st.battle3Lost = true;
        
        zmpForce.members = Math.max(0, zmpForce.members - 60);
        zmpForce.morale = Math.max(10, zmpForce.morale - 30);
        blForce.members += 60;
        st.log.push('Week ' + st.week + ': GAME OVER - Solo stand failed');
      }
    }
  }
  
  return notes;
}

  /* ---------------- Battle 4: The Last Dance ---------------- */
/* ---------------- Battle 4: The Last Dance ---------------- */
/* ---------------- Battle 4: The Last Dance ---------------- */
function resolveBattle4(st, choice, rng) {
  var notes = [];
  
  // Initialize paramilitaries if needed
  if (!st.paramilitaries) initParamilitaries(st);
  
  var zmpForce = st.paramilitaries.dzehurjaca;
  var iiaForce = st.paramilitaries.iia_guard;
  var blForce = st.paramilitaries.black_legion;
  var weinForce = st.paramilitaries.wein_workers;
  var redForce = st.paramilitaries.red_militia;
  var sempForce = st.paramilitaries.semp_spirit;
  var zpfForce = st.paramilitaries.zpf_defenders;
  
  // Calculate paramilitary strengths
  var zmpStrength = calculateParamilitaryStrength(zmpForce);
  var iiaStrength = calculateParamilitaryStrength(iiaForce);
  var blStrength = calculateParamilitaryStrength(blForce);
  var weinStrength = calculateParamilitaryStrength(weinForce);
  var redStrength = calculateParamilitaryStrength(redForce);
  var sempStrength = calculateParamilitaryStrength(sempForce);
  var zpfStrength = calculateParamilitaryStrength(zpfForce);
  
  // Check if Wein relations are good enough
  var weinRelation = st.relations ? st.relations.wein || 0 : 0;
  var weinAlly = st.hasArbeiterAlly || false;
  
  // Check Red Front alignment
  var redAffinity = st.affinity.red || 35;
  var redJoinsBL = redAffinity < 30;
  
  // Check IIA alignment
  var iiaAffinity = st.affinity.iia || 25;
  var iiaHelps = iiaAffinity > 60;
  
  if (choice === 'finish_them') {
    // Check if player has good relations with Wein (above 70)
    if (weinRelation < 70 || !weinAlly) {
      notes.push(' Arbeiter von Wein refuses to help!');
      if (weinRelation < 70) {
        notes.push(' Need Wein relations above 70% (current: ' + Math.round(weinRelation) + '%)');
        notes.push(' Improve relations with Wein to unlock their support.');
      }
      if (!weinAlly) {
        notes.push(' You need to secure the Wein Alliance first.');
      }
      notes.push('🔄 The Black League escapes and regroups.');
      
      // Penalty for failing to coordinate
      blForce.members += 20;
      blForce.morale = Math.min(100, blForce.morale + 5);
      zmpForce.members = Math.max(0, zmpForce.members - 10);
      zmpForce.morale = Math.max(10, zmpForce.morale - 5);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 3);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 1);
        }
      }
      st.log.push('Week ' + st.week + ': The Last Dance - Failed (low Wein relations)');
      notes.push(' The Black League grows stronger while you hesitate.');
      return notes;
    }
    
    // Wein relations good! Proceed with the battle
    notes.push('🌍 Wein forces have arrived to support the ZMP!');
    notes.push(' With Wein\'s help, you launch the final assault!');
    
    // Wein adds significant strength
    var weinBonus = weinStrength * 0.5;
    var alliedForce = zmpStrength + iiaStrength + weinBonus;
    
    // SEMP helps if relations are good
    var sempAffinity = st.affinity.semp || 50;
    if (sempAffinity > 40) {
      alliedForce += sempStrength * 0.2;
      notes.push('✨ SEMP Spirit Warriors join the battle!');
    }
    
    // ZPF helps if relations are good
    var zpfAffinity = st.affinity.zpf || 75;
    if (zpfAffinity > 50) {
      alliedForce += zpfStrength * 0.2;
      notes.push('⚖️ ZPF Defenders join the battle!');
    }
    
    var enemyForce = blStrength * 0.8;
    if (redJoinsBL) {
      enemyForce += redStrength * 0.3;
      notes.push(' Red Militia joins the Black League!');
    }
    
    var alliedRoll = alliedForce * (0.7 + rng() * 0.4);
    var enemyRoll = enemyForce * (0.7 + rng() * 0.4);
    
    notes.push('🌍 Wein forces: +' + Math.round(weinBonus) + ' strength!');
    notes.push(' Allied strength: ' + Math.round(alliedForce) + ' vs Enemy: ' + Math.round(enemyForce));
    
    if (alliedRoll > enemyRoll) {
      notes.push(' FINAL VICTORY! The Black League disintegrates!');
      notes.push('🌍 Wein\'s intervention was crucial to this victory!');
      
      // Set flags for music trigger
      st.battle4Completed = true;
      st.battle4WithWein = true;
      
      notes.push('🔻 The Black League shatters into splinter parties:');
      notes.push('  - CrNP (Conservative National Party)');
      notes.push('  - FLO (Freedom Liberty Order)');
      notes.push('  - NHP (New Hope Party)');
      
      // Massive paramilitary effects
      zmpForce.members += 30;
      zmpForce.morale = Math.min(100, zmpForce.morale + 15);
      zmpForce.training = Math.min(10, zmpForce.training + 1);
      zmpForce.equipment = Math.min(10, zmpForce.equipment + 1);
      
      blForce.members = Math.max(0, blForce.members - 120);
      blForce.morale = Math.max(10, blForce.morale - 40);
      blForce.equipment = Math.max(1, blForce.equipment - 3);
      
      if (redJoinsBL) {
        redForce.members = Math.max(0, redForce.members - 50);
        redForce.morale = Math.max(10, redForce.morale - 20);
      }
      
      // Create splinter parties (same as before)
      if (!st.raw.crnp) {
        st.raw.crnp = {};
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.crnp[D.DEMOS[i].id] = 0.5;
          }
        }
      }
      if (!st.raw.flo) {
        st.raw.flo = {};
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.flo[D.DEMOS[i].id] = 0.5;
          }
        }
      }
      if (!st.raw.nhp) {
        st.raw.nhp = {};
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.nhp[D.DEMOS[i].id] = 0.5;
          }
        }
      }
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var blVal = st.raw.bl ? st.raw.bl[dm.id] : 0;
          var split = blVal / 4;
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + split);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + split);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + split);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + split);
          st.raw.bl[dm.id] = Math.max(0.5, blVal * 0.1);
        }
      }
      
      // Add splinter parties to GameData if they don't exist
      var crnpExists = false, floExists = false, nhpExists = false;
      if (D && D.PARTIES) {
        for (var i = 0; i < D.PARTIES.length; i++) {
          if (D.PARTIES[i].id === 'crnp') crnpExists = true;
          if (D.PARTIES[i].id === 'flo') floExists = true;
          if (D.PARTIES[i].id === 'nhp') nhpExists = true;
        }
        if (!crnpExists) {
          D.PARTIES.push({
            id: 'crnp',
            name: 'Conservative National Party',
            short: 'CrNP',
            tag: 'CrNP',
            color: '#2a5c8a',
            player: false,
            blurb: 'Splinter from the Black League. Conservative nationalists.',
            spirit: 3, gates: 8, coalition: 15,
            base: { athletes: 8, honor: 12, gamers: 4, arts: 4, freshmen: 4, seniors: 10, buskids: 4 }
          });
        }
        if (!floExists) {
          D.PARTIES.push({
            id: 'flo',
            name: 'Freedom Liberty Order',
            short: 'FLO',
            tag: 'FLO',
            color: '#e0518f',
            player: false,
            blurb: 'Splinter from the Black League. Libertarian radicals.',
            spirit: 7, gates: 2, coalition: 20,
            base: { athletes: 4, honor: 4, gamers: 12, arts: 8, freshmen: 8, seniors: 4, buskids: 4 }
          });
        }
        if (!nhpExists) {
          D.PARTIES.push({
            id: 'nhp',
            name: 'New Hope Party',
            short: 'NHP',
            tag: 'NHP',
            color: '#17c0d8',
            player: false,
            blurb: 'Splinter from the Black League. Reformist moderates.',
            spirit: 5, gates: 5, coalition: 30,
            base: { athletes: 6, honor: 8, gamers: 6, arts: 8, freshmen: 8, seniors: 8, buskids: 6 }
          });
        }
      }
      
      st.affinity.bl = clamp((st.affinity.bl || 0) - 30, 0, 100);
      st.blSplintered = true;
      st.momentum = clamp((st.momentum || 0) + 8, -10, 20);
      st.unity = clamp(st.unity + 10, 0, 100);
      st.battle4Completed = true;
      
      notes.push(' New parties have emerged: CrNP, FLO, and NHP.');
      notes.push('🌍 Wein\'s intervention was crucial to this victory!');
      st.log.push('Week ' + st.week + ': The Last Dance - Black League destroyed with Wein support');
    } else {
      notes.push(' The Black League survives but is weakened.');
      blForce.members = Math.max(0, blForce.members - 30);
      blForce.morale = Math.max(10, blForce.morale - 10);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 4);
        }
      }
      st.affinity.bl = clamp((st.affinity.bl || 0) - 10, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 2, -10, 20);
      st.log.push('Week ' + st.week + ': The Last Dance - BL weakened');
    }
  } else if (choice === 'show_mercy') {
    notes.push('🕊️ The ZMP shows mercy. The Black League retreats, licking their wounds.');
    blForce.members = Math.max(0, blForce.members - 20);
    blForce.morale = Math.max(10, blForce.morale - 10);
    zmpForce.morale = Math.min(100, zmpForce.morale + 5);
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 3);
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
      }
    }
    st.affinity.bl = clamp((st.affinity.bl || 0) - 5, 0, 100);
    st.unity = clamp(st.unity + 3, 0, 100);
    st.log.push('Week ' + st.week + ': The Last Dance - Mercy shown');
  } else if (choice === 'go_alone') {
    // NEW: GO ALONE OPTION - Fight without Wein
    notes.push(' The ZMP goes alone! No foreign aid. No allies. Just the ZMP!');
    notes.push('This is the hardest path. Victory here proves the ZMP\'s absolute strength.');
    
    var alliedForceAlone = zmpStrength;
    
    // SEMP helps if relations are good
    var sempAffinityAlone = st.affinity.semp || 50;
    if (sempAffinityAlone > 40) {
      alliedForceAlone += sempStrength * 0.15;
      notes.push('✨ SEMP Spirit Warriors join the battle!');
    }
    
    // IIA helps if relations are good
    if (iiaHelps) {
      alliedForceAlone += iiaStrength * 0.2;
      notes.push('💻 IIA Tech Guard supports the charge!');
    }
    
    var enemyForceAlone = blStrength * 1.2;
    if (redJoinsBL) {
      enemyForceAlone += redStrength * 0.3;
      notes.push(' Red Militia joins the Black League!');
    }
    
    var alliedRollAlone = alliedForceAlone * (0.7 + rng() * 0.4);
    var enemyRollAlone = enemyForceAlone * (0.7 + rng() * 0.4);
    
    notes.push(' ZMP strength: ' + Math.round(alliedForceAlone) + ' vs BL strength: ' + Math.round(enemyForceAlone));
    
    if (alliedRollAlone > enemyRollAlone) {
      notes.push(' TRIUMPH! The ZMP has defeated the Black League alone!');
      notes.push('💪 The ZMP proves its absolute superiority! No foreign aid needed!');
      
      st.battle4Completed = true;
      st.battle4WithWein = false;
      
      // Bigger reward for going alone
      zmpForce.members += 40;
      zmpForce.morale = Math.min(100, zmpForce.morale + 20);
      zmpForce.training = Math.min(10, zmpForce.training + 2);
      zmpForce.equipment = Math.min(10, zmpForce.equipment + 2);
      
      blForce.members = Math.max(0, blForce.members - 100);
      blForce.morale = Math.max(10, blForce.morale - 35);
      blForce.equipment = Math.max(1, blForce.equipment - 3);
      
      if (redJoinsBL) {
        redForce.members = Math.max(0, redForce.members - 40);
        redForce.morale = Math.max(10, redForce.morale - 15);
      }
      
      // Create splinter parties (same as before)
      if (!st.raw.crnp) {
        st.raw.crnp = {};
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.crnp[D.DEMOS[i].id] = 0.5;
          }
        }
      }
      if (!st.raw.flo) {
        st.raw.flo = {};
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.flo[D.DEMOS[i].id] = 0.5;
          }
        }
      }
      if (!st.raw.nhp) {
        st.raw.nhp = {};
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            st.raw.nhp[D.DEMOS[i].id] = 0.5;
          }
        }
      }
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var blVal = st.raw.bl ? st.raw.bl[dm.id] : 0;
          var split = blVal / 3;
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + split + 5);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + split);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + split);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + split);
          st.raw.bl[dm.id] = Math.max(0.5, blVal * 0.1);
        }
      }
      
      // Add splinter parties to GameData if they don't exist
      var crnpExists2 = false, floExists2 = false, nhpExists2 = false;
      if (D && D.PARTIES) {
        for (var i = 0; i < D.PARTIES.length; i++) {
          if (D.PARTIES[i].id === 'crnp') crnpExists2 = true;
          if (D.PARTIES[i].id === 'flo') floExists2 = true;
          if (D.PARTIES[i].id === 'nhp') nhpExists2 = true;
        }
        if (!crnpExists2) {
          D.PARTIES.push({
            id: 'crnp',
            name: 'Conservative National Party',
            short: 'CrNP',
            tag: 'CrNP',
            color: '#2a5c8a',
            player: false,
            blurb: 'Splinter from the Black League. Conservative nationalists.',
            spirit: 3, gates: 8, coalition: 15,
            base: { athletes: 8, honor: 12, gamers: 4, arts: 4, freshmen: 4, seniors: 10, buskids: 4 }
          });
        }
        if (!floExists2) {
          D.PARTIES.push({
            id: 'flo',
            name: 'Freedom Liberty Order',
            short: 'FLO',
            tag: 'FLO',
            color: '#e0518f',
            player: false,
            blurb: 'Splinter from the Black League. Libertarian radicals.',
            spirit: 7, gates: 2, coalition: 20,
            base: { athletes: 4, honor: 4, gamers: 12, arts: 8, freshmen: 8, seniors: 4, buskids: 4 }
          });
        }
        if (!nhpExists2) {
          D.PARTIES.push({
            id: 'nhp',
            name: 'New Hope Party',
            short: 'NHP',
            tag: 'NHP',
            color: '#17c0d8',
            player: false,
            blurb: 'Splinter from the Black League. Reformist moderates.',
            spirit: 5, gates: 5, coalition: 30,
            base: { athletes: 6, honor: 8, gamers: 6, arts: 8, freshmen: 8, seniors: 8, buskids: 6 }
          });
        }
      }
      
      st.affinity.bl = clamp((st.affinity.bl || 0) - 40, 0, 100);
      st.blSplintered = true;
      st.momentum = clamp((st.momentum || 0) + 12, -10, 20);
      st.unity = clamp(st.unity + 15, 0, 100);
      st.faculty = clamp(st.faculty + 10, 0, 100);
      
      notes.push('📈 ZMP +5% bonus for going alone! Unity +15! Momentum +12!');
      st.log.push('Week ' + st.week + ': The Last Dance - Black League destroyed by ZMP alone!');
    } else {
      notes.push(' DEFEAT! The ZMP could not defeat the Black League alone.');
      notes.push('Without Wein\'s help, the Black League was too strong.');
      
      zmpForce.members = Math.max(0, zmpForce.members - 50);
      zmpForce.morale = Math.max(10, zmpForce.morale - 25);
      zmpForce.equipment = Math.max(1, zmpForce.equipment - 2);
      blForce.members += 50;
      blForce.morale = Math.min(100, blForce.morale + 15);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 8);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 8);
        }
      }
      st.affinity.bl = clamp((st.affinity.bl || 0) + 15, 0, 100);
      st.momentum = clamp((st.momentum || 0) - 10, -10, 20);
      st.unity = clamp(st.unity - 10, 0, 100);
      st.faculty = clamp(st.faculty - 8, 0, 100);
      notes.push('📉 ZMP -8%! BL +8%!');
      st.log.push('Week ' + st.week + ': The Last Dance - ZMP defeated alone');
    }
  }
  
  return notes;
}

  /* ---------------- Fall of Center ---------------- */
  function resolveFallOfCenter(st, choice, rng) {
    var notes = [];
    
    var iiaSupport = getPartySupport(st, 'iia');
    notes.push(' IIA support has fallen below 9% (' + Math.round(iiaSupport) + '%).');
    
    if (choice === 'zpf') {
      notes.push('ZPF gains half of IIA\'s supporters. The rest join the Black League.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var iiaVal = st.raw.iia ? st.raw.iia[dm.id] : 0;
          var toZPF = iiaVal * 0.5;
          var toBL = iiaVal * 0.5;
          if (st.raw.zpf) {
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + toZPF);
          }
          if (st.raw.bl) {
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + toBL);
          }
          st.raw.iia[dm.id] = Math.max(0.5, iiaVal * 0.2);
        }
      }
      st.affinity.zpf = clamp((st.affinity.zpf || 0) + 10, 0, 100);
      st.affinity.bl = clamp((st.affinity.bl || 0) + 10, 0, 100);
      st.log.push('Week ' + st.week + ': Fall of Center - ZPF absorbs IIA supporters');
    } else if (choice === 'zmp') {
      notes.push('ZMP competes for IIA\'s supporters against ZPF and Black League.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var iiaVal = st.raw.iia ? st.raw.iia[dm.id] : 0;
          var zmpChance = 0.3 + (st.affinity.iia || 0) / 200;
          var toZMP = iiaVal * zmpChance;
          var toZPF = iiaVal * (0.5 * (1 - zmpChance));
          var toBL = iiaVal * (0.5 * (1 - zmpChance));
          if (st.raw.ZMP) {
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + toZMP);
          }
          if (st.raw.zpf) {
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + toZPF);
          }
          if (st.raw.bl) {
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + toBL);
          }
          st.raw.iia[dm.id] = Math.max(0.5, iiaVal * 0.2);
        }
      }
      var absorbed = Math.round((1 - 0.2) * 100);
      notes.push(' ZMP absorbed ' + Math.round((1 - 0.2) * 50) + '% of IIA supporters.');
      st.log.push('Week ' + st.week + ': Fall of Center - ZMP competes for IIA');
    } else {
      notes.push('IIA splits naturally between ZPF and Black League.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var iiaVal = st.raw.iia ? st.raw.iia[dm.id] : 0;
          var toZPF = iiaVal * (0.4 + rng() * 0.2);
          var toBL = iiaVal * (0.4 + rng() * 0.2);
          if (st.raw.zpf) {
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + toZPF);
          }
          if (st.raw.bl) {
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + toBL);
          }
          st.raw.iia[dm.id] = Math.max(0.5, iiaVal * 0.2);
        }
      }
      st.log.push('Week ' + st.week + ': Fall of Center - Natural split');
    }
    
    return notes;
  }

  /* ---------------- Black League Whispers (Week 4) ---------------- */
  function resolveBLWhispers(st, choice, rng) {
    var notes = [];
    
    if (choice === 'ignore') {
      notes.push('😤 You dismiss the rumors. The Black League grows faster.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 3);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 1);
        }
      }
      notes.push('📈 BL +3% this week');
      st.log.push('Week ' + st.week + ': BL Whispers - Ignored');
    } else if (choice === 'investigate') {
      notes.push('🔍 You investigate. You learn their plans and slow their growth.');
      st.blGrowthSlow = 3;
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 0.5);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 1);
        }
      }
      notes.push(' BL growth slowed for 3 weeks. ZMP +1%');
      st.log.push('Week ' + st.week + ': BL Whispers - Investigated');
    }
    
    return notes;
  }

  /* ---------------- Black League Ultimatum (Week 8) ---------------- */
  function resolveBLUltimatum(st, choice, rng) {
    var notes = [];
    
    if (choice === 'reject') {
      notes.push(' You reject their demands. The Black League surges!');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 10);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
          for (var pid in st.raw) {
            if (pid !== 'bl' && pid !== 'ZMP' && pid !== 'other') {
              st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) - 1);
            }
          }
        }
      }
      st.fightingBlackLeague = true;
      notes.push('📈 BL +10%! ZMP -5%! Others -1%');
      st.log.push('Week ' + st.week + ': BL Ultimatum - Rejected');
    } else if (choice === 'negotiate') {
      notes.push(' You negotiate. They take your offer as weakness, but you buy time.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 5);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
        }
      }
      st.blGrowthSlow = Math.max(st.blGrowthSlow || 0, 2);
      notes.push('📈 BL +5%, ZMP -2%. Growth slowed for 2 weeks.');
      st.log.push('Week ' + st.week + ': BL Ultimatum - Negotiated');
    }
    
    return notes;
  }

  /* ---------------- Black League Rising Tide (Week 12) ---------------- */
  function resolveBLRisingTide(st, choice, rng) {
    var notes = [];
    
    if (choice === 'propaganda') {
      notes.push(' You launch a propaganda campaign against them.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 2);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 0.5);
        }
      }
      notes.push('📈 BL +2% this week only');
      st.log.push('Week ' + st.week + ': BL Rising Tide - Propaganda');
    } else if (choice === 'consolidate') {
      notes.push(' You consolidate your forces. You lose ground but preserve strength.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 5);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
        }
      }
      st.unity = clamp(st.unity + 3, 0, 100);
      notes.push('📈 BL +5%, ZMP -2%. Unity +3');
      st.log.push('Week ' + st.week + ': BL Rising Tide - Consolidated');
    } else if (choice === 'ignore') {
      notes.push('😤 You ignore them. The Black League surges!');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 12);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 8);
        }
      }
      notes.push('📈 BL +12%! ZMP -8%!');
      st.log.push('Week ' + st.week + ': BL Rising Tide - Ignored');
    }
    
    return notes;
  }

  /* ---------------- Black League Propaganda (Week 16) ---------------- */
  function resolveBLPropaganda(st, choice, rng) {
    var notes = [];
    
    if (choice === 'counter') {
      notes.push(' You counter their propaganda with your own.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 1);
        }
      }
      notes.push('📈 BL +1%, ZMP unchanged');
      st.log.push('Week ' + st.week + ': BL Propaganda - Countered');
    } else if (choice === 'expose') {
      notes.push('💡 You expose their lies. Reveal the truth.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
        }
      }
      notes.push('📈 BL +0%, ZMP +2%');
      st.log.push('Week ' + st.week + ': BL Propaganda - Exposed');
    } else if (choice === 'ignore') {
      notes.push('😤 You let them talk. Actions speak louder.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 8);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
        }
      }
      notes.push('📈 BL +8%, ZMP -5%');
      st.log.push('Week ' + st.week + ': BL Propaganda - Ignored');
    }
    
    return notes;
  }

  /* ---------------- Black League Takeover ---------------- */
  function resolveBLTakeover(st, choice, rng) {
    var notes = [];
    
    if (choice === 'stand') {
      notes.push(' You make a final stand. Never surrender!');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 10);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 8);
        }
      }
      st.blTakeoverTriggered = true;
      notes.push('📈 BL +10%, ZMP -8%');
      st.log.push('Week ' + st.week + ': BL Takeover - Stood');
    } else if (choice === 'hide') {
      notes.push('🕵️ You go into hiding. The Black League rules unchallenged.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 15);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 10);
        }
      }
      st.blTakeoverTriggered = true;
      notes.push('📈 BL +15%, ZMP -10%');
      st.log.push('Week ' + st.week + ': BL Takeover - Hid');
    }
    
    return notes;
  }

  /* ---------------- Black League Collapse ---------------- */
  function resolveBLCollapse(st, choice, rng) {
    var notes = [];
    
    if (choice === 'lead') {
      var success = 0.3 + (st.unity / 150) + (st.momentum / 100);
      if (rng() < success) {
        notes.push(' VICTORY! You lead the resistance and the Black League collapses!');
        var reduction = 7 + rng() * 5;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - reduction);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 4);
          }
        }
        st.affinity.bl = clamp((st.affinity.bl || 0) - 15, 0, 100);
        st.momentum = clamp((st.momentum || 0) + 5, -10, 20);
        st.unity = clamp(st.unity + 8, 0, 100);
        st.blCollapseTriggered = true;
        notes.push('📈 BL -' + Math.round(reduction) + '%, ZMP +4%');
        st.log.push('Week ' + st.week + ': BL Collapse - Success');
      } else {
        notes.push(' The resistance fails. The Black League grows stronger.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 6);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 3);
          }
        }
        st.blCollapseTriggered = true;
        notes.push('📈 BL +6%, ZMP -3%');
        st.log.push('Week ' + st.week + ': BL Collapse - Failed');
      }
    } else if (choice === 'neutral') {
      notes.push('🕊️ You stay neutral. The Black League survives and blames you.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 2);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 1);
        }
      }
      st.blCollapseTriggered = true;
      notes.push('📈 BL +2%, ZMP -1%');
      st.log.push('Week ' + st.week + ': BL Collapse - Neutral');
    }
    
    return notes;
  }



  /* ---------------- Black League Surge (Week 7) ---------------- */
  function checkBlackLeagueSurge(st, rng) {
    var notes = [];
    if (st.blackLeagueSurgeTriggered) return notes;
    if (st.week !== 7) return notes;
    
    st.blackLeagueSurgeTriggered = true;
    notes.push('⚫ BLACK LEAGUE SURGE: The Black League launches a major offensive!');
    notes.push('They are taking support from everyone, including you!');
    
    var surgeStrength = 0.05 + rng() * 0.025;
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var totalTransfer = 0;
        var allPids = Object.keys(st.raw);
        for (var j = 0; j < allPids.length; j++) {
          var pid = allPids[j];
          if (pid !== 'bl' && pid !== 'other' && st.raw[pid]) {
            var val = st.raw[pid][dm.id] || 0;
            var transfer = val * surgeStrength * (0.5 + rng() * 0.5);
            st.raw[pid][dm.id] = Math.max(0.5, val - transfer);
            totalTransfer += transfer;
          }
        }
        if (st.raw.bl) {
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + totalTransfer * 1.1);
        }
      }
    }
    
    st.affinity.bl = clamp((st.affinity.bl || 0) + 8, 0, 100);
    st.momentum = clamp((st.momentum || 0) - 2, -10, 20);
    st.unity = clamp(st.unity - 3, 0, 100);
    
    notes.push(' The Black League has grown stronger at everyone\'s expense!');
    notes.push(' Your support has been drained. Unity has dropped.');
    st.log.push('Week ' + st.week + ': Black League Surge');
    return notes;
  }

  /* ---------------- Check Black League Crisis Status ---------------- */
  function isBlackLeagueCrisis(st) {
    var blSupport = getPartySupport(st, 'bl');
    return blSupport > 25 && blSupport < 50 && !st.blCollapseTriggered;
  }

  /* ---------------- Released Parties Resolution Functions ---------------- */
  function resolveReleasedParties(st, choice, rng) {
    var notes = [];
    var zmpSupport = getPartySupport(st, 'ZMP');
    
    var otherParties = [];
    for (var pid in st.raw) {
      if (pid !== 'ZMP' && pid !== 'bl' && pid !== 'other' && st.merged.indexOf(pid) === -1) {
        otherParties.push(pid);
      }
    }
    
    var splinterParties = ['crnp', 'flo', 'nhp'];
    for (var i = 0; i < splinterParties.length; i++) {
      if (st.raw[splinterParties[i]] && otherParties.indexOf(splinterParties[i]) === -1) {
        otherParties.push(splinterParties[i]);
      }
    }
    
    if (otherParties.length === 0) {
      notes.push('No other parties exist to gain support.');
      return notes;
    }
    
    var eatAmount = 0;
    
    if (choice === 'crush') {
      eatAmount = 0.40 + rng() * 0.16;
      notes.push(' You crush them, but they fight back. You lose a devastating ' + Math.round(eatAmount * 100) + '% of your support to other parties!');
      
      for (var i = 0; i < otherParties.length; i++) {
        var pid = otherParties[i];
        if (st.raw[pid]) {
          if (D && D.DEMOS) {
            for (var j = 0; j < D.DEMOS.length; j++) {
              var dm = D.DEMOS[j];
              var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * (0.5 / otherParties.length + rng() * 0.3 / otherParties.length);
              st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + transfer);
              st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
            }
          }
          st.relations[pid] = clamp((st.relations[pid] || 50) - 8, 0, 100);
          st.affinity[pid] = clamp((st.affinity[pid] || 50) - 5, 0, 100);
        }
      }
      
      st.momentum = clamp((st.momentum || 0) - 8, -10, 20);
      st.unity = clamp(st.unity - 12, 0, 100);
      st.faculty = clamp(st.faculty - 5, 0, 100);
      
    } else if (choice === 'negotiate') {
      eatAmount = 0.30 + rng() * 0.12;
      notes.push(' You negotiate. You lose a massive ' + Math.round(eatAmount * 100) + '% of your support to other parties, but relations improve slightly.');
      
      for (var i = 0; i < otherParties.length; i++) {
        var pid = otherParties[i];
        if (st.raw[pid]) {
          if (D && D.DEMOS) {
            for (var j = 0; j < D.DEMOS.length; j++) {
              var dm = D.DEMOS[j];
              var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * (0.4 / otherParties.length + rng() * 0.25 / otherParties.length);
              st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + transfer);
              st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
            }
          }
          st.relations[pid] = clamp((st.relations[pid] || 50) + 2, 0, 100);
          st.affinity[pid] = clamp((st.affinity[pid] || 50) + 1, 0, 100);
        }
      }
      
      st.momentum = clamp((st.momentum || 0) - 6, -10, 20);
      st.unity = clamp(st.unity - 8, 0, 100);
      
    } else {
      eatAmount = 0.50 + rng() * 0.16;
      notes.push('😤 You ignore them. You lose a catastrophic ' + Math.round(eatAmount * 100) + '% of your support to other parties!');
      
      for (var i = 0; i < otherParties.length; i++) {
        var pid = otherParties[i];
        if (st.raw[pid]) {
          if (D && D.DEMOS) {
            for (var j = 0; j < D.DEMOS.length; j++) {
              var dm = D.DEMOS[j];
              var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * (0.6 / otherParties.length + rng() * 0.3 / otherParties.length);
              st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + transfer);
              st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
            }
          }
          st.relations[pid] = clamp((st.relations[pid] || 50) - 12, 0, 100);
          st.affinity[pid] = clamp((st.affinity[pid] || 50) - 8, 0, 100);
        }
      }
      
      st.momentum = clamp((st.momentum || 0) - 10, -10, 20);
      st.unity = clamp(st.unity - 15, 0, 100);
      st.faculty = clamp(st.faculty - 8, 0, 100);
    }
    
    st.releasedPartiesEventTriggered = true;
    var newZmpSupport = getPartySupport(st, 'ZMP');
    notes.push(' Your support dropped from ' + Math.round(zmpSupport) + '% to ' + Math.round(newZmpSupport) + '%');
    st.log.push('Week ' + st.week + ': Released Parties event - ' + choice + ' (lost ' + Math.round(eatAmount * 100) + '%)');
    return notes;
  }

  function resolveReleasedSurge(st, choice, rng) {
    var notes = [];
    var zmpSupport = getPartySupport(st, 'ZMP');
    
    var otherParties = [];
    for (var pid in st.raw) {
      if (pid !== 'ZMP' && pid !== 'bl' && pid !== 'other' && st.merged.indexOf(pid) === -1) {
        otherParties.push(pid);
      }
    }
    
    var splinterParties = ['crnp', 'flo', 'nhp'];
    for (var i = 0; i < splinterParties.length; i++) {
      if (st.raw[splinterParties[i]] && otherParties.indexOf(splinterParties[i]) === -1) {
        otherParties.push(splinterParties[i]);
      }
    }
    
    if (otherParties.length === 0) {
      notes.push('No other parties exist to gain support.');
      return notes;
    }
    
    var eatAmount = 0;
    
    if (choice === 'counter') {
      eatAmount = 0.36 + rng() * 0.12;
      notes.push(' You counter-rally. You lose a devastating ' + Math.round(eatAmount * 100) + '% of your support to other parties.');
      
      st.volunteers = Math.max(0, st.volunteers - 8);
      st.funds = Math.max(0, st.funds - 25);
      
    } else if (choice === 'expose') {
      eatAmount = 0.28 + rng() * 0.10;
      notes.push('💡 You expose their past. You lose a massive ' + Math.round(eatAmount * 100) + '% of your support to other parties, but their reputation is damaged.');
      
      for (var i = 0; i < otherParties.length; i++) {
        var pid = otherParties[i];
        if (st.raw[pid]) {
          if (D && D.DEMOS) {
            for (var j = 0; j < D.DEMOS.length; j++) {
              var dm = D.DEMOS[j];
              var damage = (st.raw[pid][dm.id] || 0) * 0.08;
              st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) - damage);
            }
          }
        }
      }
      
    } else {
      eatAmount = 0.44 + rng() * 0.16;
      notes.push('😤 You ignore them. You lose a catastrophic ' + Math.round(eatAmount * 100) + '% of your support to other parties!');
    }
    
    for (var i = 0; i < otherParties.length; i++) {
      var pid = otherParties[i];
      if (st.raw[pid]) {
        if (D && D.DEMOS) {
          for (var j = 0; j < D.DEMOS.length; j++) {
            var dm = D.DEMOS[j];
            var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * (0.4 / otherParties.length + rng() * 0.25 / otherParties.length);
            st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + transfer);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
          }
        }
        if (choice !== 'expose') {
          st.relations[pid] = clamp((st.relations[pid] || 50) - (choice === 'counter' ? 4 : 8), 0, 100);
        }
      }
    }
    
    st.releasedSurgeTriggered = true;
    var newZmpSupport = getPartySupport(st, 'ZMP');
    notes.push(' Your support dropped from ' + Math.round(zmpSupport) + '% to ' + Math.round(newZmpSupport) + '%');
    st.log.push('Week ' + st.week + ': Released Surge - ' + choice + ' (lost ' + Math.round(eatAmount * 100) + '%)');
    return notes;
  }

  function resolveReleasedVictory(st, choice, rng) {
    var notes = [];
    var zmpSupport = getPartySupport(st, 'ZMP');
    
    var otherParties = [];
    for (var pid in st.raw) {
      if (pid !== 'ZMP' && pid !== 'bl' && pid !== 'other' && st.merged.indexOf(pid) === -1) {
        otherParties.push(pid);
      }
    }

    
    var splinterParties = ['crnp', 'flo', 'nhp'];
    for (var i = 0; i < splinterParties.length; i++) {
      if (st.raw[splinterParties[i]] && otherParties.indexOf(splinterParties[i]) === -1) {
        otherParties.push(splinterParties[i]);
      }
    }
    
    if (otherParties.length === 0) {
      notes.push('No other parties exist to gain support.');
      return notes;
    }
    
    var eatAmount = 0;
    
    if (choice === 'emergency') {
      eatAmount = 0.32 + rng() * 0.10;
      notes.push('🚨 State of emergency declared. You lose a massive ' + Math.round(eatAmount * 100) + '% of your support to other parties.');
      st.faculty = clamp(st.faculty - 12, 0, 100);
      st.unity = clamp(st.unity + 2, 0, 100);
      
    } else if (choice === 'appeal') {
      eatAmount = 0.40 + rng() * 0.12;
      notes.push(' You appeal for unity. You lose a devastating ' + Math.round(eatAmount * 100) + '% of your support to other parties.');
      st.unity = clamp(st.unity + 1, 0, 100);
      
    } else {
      eatAmount = 0.24 + rng() * 0.10;
      notes.push(' You fight them in the streets. You lose a massive ' + Math.round(eatAmount * 100) + '% of your support to other parties.');
      st.faculty = clamp(st.faculty - 20, 0, 100);
      st.unity = clamp(st.unity - 8, 0, 100);
    }
    
    for (var i = 0; i < otherParties.length; i++) {
      var pid = otherParties[i];
      if (st.raw[pid]) {
        if (D && D.DEMOS) {
          for (var j = 0; j < D.DEMOS.length; j++) {
            var dm = D.DEMOS[j];
            var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * (0.4 / otherParties.length + rng() * 0.2 / otherParties.length);
            st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + transfer);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
          }
        }
        if (choice === 'appeal') {
          st.relations[pid] = clamp((st.relations[pid] || 50) + 2, 0, 100);
        } else {
          st.relations[pid] = clamp((st.relations[pid] || 50) - 8, 0, 100);
          st.affinity[pid] = clamp((st.affinity[pid] || 50) - 5, 0, 100);
        }
      }
    }
    
    st.releasedVictoryTriggered = true;
    var newZmpSupport = getPartySupport(st, 'ZMP');
    notes.push(' Your support dropped from ' + Math.round(zmpSupport) + '% to ' + Math.round(newZmpSupport) + '%');
    st.log.push('Week ' + st.week + ': Released Victory - ' + choice + ' (lost ' + Math.round(eatAmount * 100) + '%)');
    return notes;
  }

  /* ---------------- Party Congress System ---------------- */

function initPartyCongress(st) {
  if (!st.congress) {
    st.congress = {
      points: 5,
      policies: {
        education: { level: 1, max: 5, cost: 2, bonus: { faculty: 2, honor: 1 } },
        economy: { level: 1, max: 5, cost: 2, bonus: { funds: 5, zmp: 1 } },
        healthcare: { level: 1, max: 5, cost: 2, bonus: { volunteers: 2, buskids: 1 } },
        infrastructure: { level: 1, max: 5, cost: 2, bonus: { unity: 1, athletes: 1 } },
        justice: { level: 1, max: 5, cost: 2, bonus: { faculty: 2, bl: -1 } },
        technology: { level: 1, max: 5, cost: 2, bonus: { gamers: 2, iia: 1 } },
        arts: { level: 1, max: 5, cost: 2, bonus: { arts: 2, pl: 1 } },
        sports: { level: 1, max: 5, cost: 2, bonus: { athletes: 2, sportica: 1 } }
      },
      factionInfluence: {
        loyalists: 25,
        gamers: 25,
        girls: 25,
        spirit: 25
      },
      currentFaction: st.faction || 'loyalists',
      congressHistory: [],
      activeResolution: null,
      nextCongressWeek: 13
    };
  }
  return st.congress;
}

function earnCongressPoints(st, amount, reason) {
  if (!st.congress) initPartyCongress(st);
  st.congress.points = (st.congress.points || 0) + amount;
  st.congress.congressHistory.push({
    week: st.week,
    reason: reason,
    points: amount
  });
  st.log.push(' Congress +' + amount + ' points: ' + reason);
  return st.congress.points;
}

function canDoAction(st, actionType) {
  var faction = null;
  for (var i = 0; i < D.FACTIONS.length; i++) {
    if (D.FACTIONS[i].id === st.faction) { faction = D.FACTIONS[i]; }
  }
  if (!faction) return true;

  if (actionType === 'election') return faction.canParticipateInElections;
  if (actionType === 'coalition') return faction.canFormCoalitions;
  if (actionType === 'negotiate') return faction.canNegotiate;
  if (actionType === 'violence') return faction.canUseViolence;
  if (actionType === 'jihad') return faction.canUseJihad;
  if (actionType === 'syndicate') return faction.canUseSyndicate;
  return true;
}

function upgradePolicy(st, policyId) {
  if (!st.congress) initPartyCongress(st);
  var policy = st.congress.policies[policyId];
  if (!policy) return { ok: false, msg: 'Policy not found.' };
  if (policy.level >= policy.max) return { ok: false, msg: 'Policy already at max level.' };
  if (st.congress.points < policy.cost) return { ok: false, msg: 'Not enough Congress points.' };
  
  st.congress.points -= policy.cost;
  policy.level += 1;
  
  // Apply policy bonus
  var bonus = policy.bonus;
  if (bonus.faculty) st.faculty = clamp(st.faculty + bonus.faculty, 0, 100);
  if (bonus.funds) st.funds += bonus.funds;
  if (bonus.volunteers) st.volunteers += bonus.volunteers;
  if (bonus.unity) st.unity = clamp(st.unity + bonus.unity, 0, 100);
  if (bonus.zmp) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.zmp);
      }
    }
  }
  if (bonus.bl) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + bonus.bl);
      }
    }
  }
  if (bonus.gamers) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'gamers') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.gamers);
        }
      }
    }
  }
  if (bonus.iia) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'iia') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.iia);
        }
      }
    }
  }
  if (bonus.honor) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'honor') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.honor);
        }
      }
    }
  }
  if (bonus.buskids) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'buskids') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.buskids);
        }
      }
    }
  }
  if (bonus.athletes) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'athletes') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.athletes);
        }
      }
    }
  }
  if (bonus.arts) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'arts') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.arts);
        }
      }
    }
  }
  if (bonus.pl) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'pl') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.pl);
        }
      }
    }
  }
  if (bonus.sportica) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'sportica') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + bonus.sportica);
        }
      }
    }
  }
  
  st.log.push('Week ' + st.week + ': Congress upgraded ' + policyId + ' to level ' + policy.level);
  return { ok: true, msg: policyId + ' upgraded to level ' + policy.level };
}


function callPartyCongress(st, rng) {
  if (!st.congress) initPartyCongress(st);
  var congress = st.congress;
  
  // Check if congress is available
  if (st.week < congress.nextCongressWeek) {
    return { ok: false, msg: 'Congress is not in session. Next session: Week ' + congress.nextCongressWeek };
  }
  
  // Generate congress event
  var events = [
    {
      title: ' The Education Debate',
      desc: 'Party members are divided on education policy. Some want more funding, others want curriculum reform.',
      options: [
        { text: ' Fund education', effect: { education: 2, faculty: 5 }, desc: '+2 Education policy, +5 faculty' },
        { text: '📖 Reform curriculum', effect: { education: 1, honor: 3 }, desc: '+1 Education policy, +3% honor' }
      ]
    },
    {
      title: '💰 The Budget Crisis',
      desc: 'The party\'s finances are in disarray. Members are demanding fiscal responsibility.',
      options: [
        { text: '💰 Increase fundraising', effect: { economy: 2, funds: 10 }, desc: '+2 Economy policy, +$10 funds' },
        { text: ' Cut wasteful spending', effect: { economy: 1, unity: 3 }, desc: '+1 Economy policy, +3 unity' }
      ]
    },
    {
      title: '🏥 Healthcare Reform',
      desc: 'Student health services are inadequate. The party must act.',
      options: [
        { text: '🏥 Expand health services', effect: { healthcare: 2, volunteers: 3 }, desc: '+2 Healthcare policy, +3 volunteers' },
        { text: '🧠 Mental health initiative', effect: { healthcare: 1, buskids: 3 }, desc: '+1 Healthcare policy, +3% buskids' }
      ]
    },
    {
      title: '🏗️ Infrastructure Crisis',
      desc: 'School buildings are falling apart. The party needs a plan.',
      options: [
        { text: '🏗️ Repair buildings', effect: { infrastructure: 2, faculty: 5 }, desc: '+2 Infrastructure policy, +5 faculty' },
        { text: '🌿 Green campus initiative', effect: { infrastructure: 1, unity: 3 }, desc: '+1 Infrastructure policy, +3 unity' }
      ]
    }
  ];
  
  var event = events[Math.floor(rng() * events.length)];
  congress.activeResolution = {
    title: event.title,
    desc: event.desc,
    options: event.options,
    week: st.week
  };
  
  congress.nextCongressWeek = st.week + 12;
  return { ok: true, event: event };
}

function resolveCongress(st, optionIndex, rng) {
  if (!st.congress || !st.congress.activeResolution) {
    return { ok: false, msg: 'No active congress resolution.' };
  }
  
  var resolution = st.congress.activeResolution;
  var option = resolution.options[optionIndex];
  if (!option) return { ok: false, msg: 'Invalid option.' };
  
  var effect = option.effect;
  var notes = [];
  
  // Apply policy upgrades
  if (effect.education) {
    var eduPolicy = st.congress.policies.education;
    eduPolicy.level = Math.min(eduPolicy.max, eduPolicy.level + effect.education);
    notes.push(' Education policy upgraded to level ' + eduPolicy.level);
  }
  if (effect.economy) {
    var ecoPolicy = st.congress.policies.economy;
    ecoPolicy.level = Math.min(ecoPolicy.max, ecoPolicy.level + effect.economy);
    notes.push('💰 Economy policy upgraded to level ' + ecoPolicy.level);
  }
  if (effect.healthcare) {
    var healthPolicy = st.congress.policies.healthcare;
    healthPolicy.level = Math.min(healthPolicy.max, healthPolicy.level + effect.healthcare);
    notes.push('🏥 Healthcare policy upgraded to level ' + healthPolicy.level);
  }
  if (effect.infrastructure) {
    var infraPolicy = st.congress.policies.infrastructure;
    infraPolicy.level = Math.min(infraPolicy.max, infraPolicy.level + effect.infrastructure);
    notes.push('🏗️ Infrastructure policy upgraded to level ' + infraPolicy.level);
  }
  
  // Apply direct effects
  if (effect.faculty) { st.faculty = clamp(st.faculty + effect.faculty, 0, 100); notes.push('👨‍🏫 Faculty ' + (effect.faculty >= 0 ? '+' : '') + effect.faculty); }
  if (effect.funds) { st.funds += effect.funds; notes.push('💰 Funds +' + effect.funds); }
  if (effect.unity) { st.unity = clamp(st.unity + effect.unity, 0, 100); notes.push('💪 Unity ' + (effect.unity >= 0 ? '+' : '') + effect.unity); }
  if (effect.volunteers) { st.volunteers += effect.volunteers; notes.push(' Volunteers +' + effect.volunteers); }
  if (effect.honor) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'honor') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + effect.honor);
        }
      }
    }
    notes.push('📈 Honor +' + effect.honor + '%');
  }
  if (effect.buskids) {
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (dm.id === 'buskids') {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + effect.buskids);
        }
      }
    }
    notes.push('📈 Buskids +' + effect.buskids + '%');
  }
  
  // Earn congress points for resolving
  earnCongressPoints(st, 2, 'Resolved congress resolution');
  
  st.congress.activeResolution = null;
  st.log.push('Week ' + st.week + ': Congress resolved - ' + option.text);
  
  return { ok: true, notes: notes };
}

  /* ---------------- Vote Spoiling ---------------- */
  function trySpoilElection(st, rng) {
    var notes = [];
    var blSupport = getPartySupport(st, 'bl');
    
    if (blSupport < 35) {
      notes.push('The Black League is not strong enough to spoil the election.');
      return notes;
    }
    
    var spoilingChance = 0.2 + (blSupport - 35) / 100;
    if (rng() < spoilingChance) {
      notes.push(' THE BLACK LEAGUE HAS SPOILED THE ELECTION!');
      notes.push('They have declared the election illegitimate and called for a revolution!');
      
      st.revolutionMode = true;
      st.pendingEvent = {
        id: 'revolution_' + st.week,
        week: st.week,
        title: '🔥 REVOLUTION!',
        body: 'The Black League has declared the election void and is calling for the overthrow of the government. The school is in chaos!',
        choices: [
          { text: 'Crush the revolution. Use force.', note: 'Authoritarian. May succeed or fail.', effects: { revolutionChoice: 'crush' } },
          { text: 'Negotiate with the revolutionaries.', note: 'Diplomatic. May buy time.', effects: { revolutionChoice: 'negotiate' } },
          { text: 'Join the revolution. Overthrow the government.', note: 'Extreme. You become the revolutionaries.', effects: { revolutionChoice: 'join' } }
        ]
      };
      
      notes.push('💥 REVOLUTION MODE ACTIVATED!');
      st.log.push('Week ' + st.week + ': Black League spoils election - Revolution!');
    } else {
      notes.push('The Black League attempted to spoil the election, but failed.');
      notes.push('Their support (' + Math.round(blSupport) + '%) was not enough.');
    }
    
    return notes;
  }

  /* ---------------- Walk Off Election ---------------- */
  function walkOffElection(st, choice, rng) {
    var notes = [];
    var blSupport = getPartySupport(st, 'bl');
    
    if (choice === 'walk_off') {
      notes.push('🚶 The ZMP walks off the election!');
      notes.push('You declare the election illegitimate and refuse to participate.');
      
      if (blSupport > 30) {
        notes.push(' The Black League exploits your absence and wins big!');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 10);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
          }
        }
        st.log.push('Week ' + st.week + ': ZMP walked off election - BL gains');
      } else {
        notes.push('🕊️ The election is a mess. Neither side wins.');
        st.log.push('Week ' + st.week + ': ZMP walked off election - Stalemate');
      }
      
    } else if (choice === 'ban_parties') {
      notes.push('🚫 The ZMP moves to ban extremist parties!');
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          if (st.raw.bl) st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) * 0.3);
          if (st.raw.crnp) st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) * 0.3);
          if (st.raw.flo) st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) * 0.3);
          if (st.raw.nhp) st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) * 0.3);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
        }
      }
      
      st.blSplintered = true;
      st.blackLeagueBanned = true;
      notes.push('📈 ZMP gains support! Black League and splinters banned!');
      st.log.push('Week ' + st.week + ': ZMP banned extremist parties');
    }
    
    return notes;
  }

  /* ---------------- Legislature Vote Resolution ---------------- */
  function resolveLegislatureVote(st, choice, rng) {
    var notes = [];
    
    if (choice === 'field_day_for' || choice === 'field_day_against' || choice === 'field_day_abstain') {
      st.fieldDayVoteDone = true;
      st.fieldDayVoteTriggered = true;
      
      if (choice === 'field_day_for') {
        notes.push('🏟️ Field Day PASSES! All middle parties gain support.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 2);
            st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 2);
            st.raw.semp[dm.id] = Math.max(0.5, (st.raw.semp[dm.id] || 0) + 2);
            st.raw.pl[dm.id] = Math.max(0.5, (st.raw.pl[dm.id] || 0) + 2);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 1);
          }
        }
        st.unity = clamp(st.unity + 3, 0, 100);
        st.momentum = clamp((st.momentum || 0) + 2, -10, 20);
      } else if (choice === 'field_day_against') {
        notes.push('🏟️ Field Day FAILS! Black League gains significant support.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 5);
            st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 2);
          }
        }
        st.unity = clamp(st.unity - 2, 0, 100);
        st.momentum = clamp((st.momentum || 0) - 1, -10, 20);
      } else {
        notes.push('🏟️ You abstained from the Field Day vote.');
        st.unity = clamp(st.unity - 1, 0, 100);
      }
    } else if (choice === 'budget_for' || choice === 'budget_against' || choice === 'budget_abstain') {
      st.budgetVoteDone = true;
      
      if (choice === 'budget_for') {
        notes.push('💰 Budget PASSES! Funds saved, but programs suffer.');
        st.funds += 15;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 3);
            st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 1);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 1);
          }
        }
        st.faculty = clamp(st.faculty - 5, 0, 100);
      } else if (choice === 'budget_against') {
        notes.push('💰 Budget defeated! Programs preserved.');
        st.funds -= 10;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
            st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 1);
          }
        }
        st.faculty = clamp(st.faculty + 3, 0, 100);
      } else {
        notes.push('💰 You abstained from the budget vote.');
        st.unity = clamp(st.unity - 1, 0, 100);
      }
    } else if (choice === 'honor_code_for' || choice === 'honor_code_against' || choice === 'honor_code_abstain') {
      st.honorCodeVoteDone = true;
      
      if (choice === 'honor_code_for') {
        notes.push('📜 Honor code reform PASSES!');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 4);
            st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 2);
          }
        }
        st.faculty = clamp(st.faculty + 5, 0, 100);
      } else if (choice === 'honor_code_against') {
        notes.push('📜 Honor code reform FAILS!');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 4);
            st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) - 2);
          }
        }
        st.unity = clamp(st.unity - 3, 0, 100);
      } else {
        notes.push('📜 You abstained from the honor code vote.');
      }
    }
    
    return notes;
  }

  /* ---------------- Presidential Results ---------------- */
  function resolvePresidentialResultsSdahh(st, choice, rng) {
    var notes = [];
    var candidate = st.presidentialCandidate || 'zmp';
    var campaignBonus = st.presidentialCampaignBonus || 0;
    var zmpSupport = getPartySupport(st, 'ZMP');
    
    var zpfSupport = getPartySupport(st, 'zpf');
    var redSupport = getPartySupport(st, 'red');
    var iiaSupport = getPartySupport(st, 'iia');
    var sempSupport = getPartySupport(st, 'semp');
    var rbSupport = getPartySupport(st, 'rb');
    var plSupport = getPartySupport(st, 'pl');
    var republiaSupport = getPartySupport(st, 'republia');
    var sporticaSupport = getPartySupport(st, 'sportica');
    
    var zmpCandidateSupport = zmpSupport * 0.4 + 5;
    var unityCandidateSupport = (zpfSupport + iiaSupport + sempSupport) / 3 + 3;
    var zpfCandidateSupport = zpfSupport * 0.5 + 3;
    var redCandidateSupport = (redSupport + rbSupport + plSupport) / 3 + 2;
    var republiaCandidateSupport = republiaSupport * 0.3 + 2;
    var sporticaCandidateSupport = sporticaSupport * 0.2 + 1;
    
    if (candidate === 'zmp') zmpCandidateSupport += campaignBonus * 0.5;
    else if (candidate === 'unity') unityCandidateSupport += campaignBonus * 0.5;
    else if (candidate === 'zpf') zpfCandidateSupport += campaignBonus * 0.5;
    else if (candidate === 'red') redCandidateSupport += campaignBonus * 0.5;
    
    zmpCandidateSupport *= (0.85 + rng() * 0.3);
    unityCandidateSupport *= (0.85 + rng() * 0.3);
    zpfCandidateSupport *= (0.85 + rng() * 0.3);
    redCandidateSupport *= (0.85 + rng() * 0.3);
    republiaCandidateSupport *= (0.85 + rng() * 0.3);
    sporticaCandidateSupport *= (0.85 + rng() * 0.3);
    
    var total = zmpCandidateSupport + unityCandidateSupport + zpfCandidateSupport + redCandidateSupport + republiaCandidateSupport + sporticaCandidateSupport;
    if (total > 0) {
      zmpCandidateSupport = (zmpCandidateSupport / total) * 100;
      unityCandidateSupport = (unityCandidateSupport / total) * 100;
      zpfCandidateSupport = (zpfCandidateSupport / total) * 100;
      redCandidateSupport = (redCandidateSupport / total) * 100;
      republiaCandidateSupport = (republiaCandidateSupport / total) * 100;
      sporticaCandidateSupport = (sporticaCandidateSupport / total) * 100;
    }
    
    var zmpVote = Math.round(zmpCandidateSupport * 10) / 10;
    var unityVote = Math.round(unityCandidateSupport * 10) / 10;
    var zpfVote = Math.round(zpfCandidateSupport * 10) / 10;
    var redVote = Math.round(redCandidateSupport * 10) / 10;
    var republiaVote = Math.round(republiaCandidateSupport * 10) / 10;
    var sporticaVote = Math.round(sporticaCandidateSupport * 10) / 10;
    
    var candidates = [
      { id: 'zmp', name: 'Ahmad VI', party: 'ZMP', support: zmpCandidateSupport, vote: zmpVote },
      { id: 'unity', name: 'Marcus Webb', party: 'Unity', support: unityCandidateSupport, vote: unityVote },
      { id: 'zpf', name: 'Sara Chen', party: 'ZPF', support: zpfCandidateSupport, vote: zpfVote },
      { id: 'red', name: 'Karl Richter', party: 'Red Front', support: redCandidateSupport, vote: redVote },
      { id: 'republia', name: 'Hans Mueller', party: 'Republia', support: republiaCandidateSupport, vote: republiaVote },
      { id: 'sportica', name: 'Klaus Schmidt', party: 'Sportica', support: sporticaCandidateSupport, vote: sporticaVote }
    ];
    
    candidates.sort(function(a, b) { return b.support - a.support; });
    
    var winner = null;
    
    if (candidates[0].support >= 50) {
      winner = candidates[0];
    } else {
      var top3 = candidates.slice(0, 3);
      
      notes.push(' ROUND 1 RESULTS:');
      notes.push('No candidate reached 50%. Top 3 advance to runoff:');
      for (var i = 0; i < top3.length; i++) {
        notes.push('  ' + (i+1) + '. ' + top3[i].name + ' (' + top3[i].party + ') - ' + top3[i].vote + '%');
      }
      
      var runoffSupport = {};
      for (var i = 0; i < top3.length; i++) {
        runoffSupport[top3[i].id] = top3[i].support + (5 + rng() * 10);
      }
      
      var runoffTotal = runoffSupport[top3[0].id] + runoffSupport[top3[1].id] + runoffSupport[top3[2].id];
      if (runoffTotal > 0) {
        for (var id in runoffSupport) {
          runoffSupport[id] = (runoffSupport[id] / runoffTotal) * 100;
        }
      }
      
      var runoffWinner = top3[0].id;
      var runoffHighest = runoffSupport[top3[0].id];
      for (var i = 1; i < top3.length; i++) {
        if (runoffSupport[top3[i].id] > runoffHighest) {
          runoffHighest = runoffSupport[top3[i].id];
          runoffWinner = top3[i].id;
        }
      }
      
      winner = candidates.find(function(c) { return c.id === runoffWinner; });
      
      notes.push(' RUNOFF RESULTS:');
      for (var i = 0; i < top3.length; i++) {
        notes.push('  ' + top3[i].name + ' (' + top3[i].party + ') - ' + Math.round(runoffSupport[top3[i].id] * 10) / 10 + '%');
      }
      notes.push(' WINNER: ' + winner.name + ' (' + winner.party + ') with ' + Math.round(runoffHighest * 10) / 10 + '%');
    }
    
    if (winner.id === 'zmp') {
      notes.push(' ZMP WINS THE PRESIDENCY! Massive boost!');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 8);
        }
      }
      st.momentum = clamp((st.momentum || 0) + 8, -10, 20);
      st.unity = clamp(st.unity + 10, 0, 100);
      st.faculty = clamp(st.faculty + 5, 0, 100);
      st.presidentialWinner = 'zmp';
      notes.push('📈 ZMP +8%! Unity +10! Momentum +8!');
      
    } else if (winner.id === 'unity') {
      notes.push('🕊️ The Unity candidate won! Bipartisanship prevails.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 4);
          st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 3);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 3);
        }
      }
      st.unity = clamp(st.unity + 8, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 4, -10, 20);
      st.faculty = clamp(st.faculty + 8, 0, 100);
      st.presidentialWinner = 'unity';
      notes.push('📈 Broad support gains! Unity +8! Faculty +8!');
      
    } else if (winner.id === 'zpf') {
      notes.push('⚫ The ZPF won the presidency! Coalition partner ascendant.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 6);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
        }
      }
      st.affinity.zpf = clamp((st.affinity.zpf || 0) + 12, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 2, -10, 20);
      st.presidentialWinner = 'zpf';
      notes.push('📈 ZPF +6%! ZMP +3%! ZPF relations +12!');
      
    } else if (winner.id === 'red') {
      notes.push(' The Red Front won the presidency! Left energized.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 6);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
        }
      }
      st.affinity.red = clamp((st.affinity.red || 0) + 12, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
      st.faculty = clamp(st.faculty - 8, 0, 100);
      st.presidentialWinner = 'red';
      notes.push('📈 Red +6%! ZMP +3%! Red relations +12!');
      
    } else if (winner.id === 'republia') {
      notes.push('🔵 Republia won the presidency! Conservatives celebrate.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 6);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
        }
      }
      st.affinity.republia = clamp((st.affinity.republia || 0) + 12, 0, 100);
      st.faculty = clamp(st.faculty - 5, 0, 100);
      st.presidentialWinner = 'republia';
      notes.push('📈 Republia +6%! ZMP +2%!');
      
    } else if (winner.id === 'sportica') {
      notes.push('🏅 Sportica won the presidency! Athletes celebrate.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.sportica[dm.id] = Math.max(0.5, (st.raw.sportica[dm.id] || 0) + 6);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
        }
      }
      st.affinity.sportica = clamp((st.affinity.sportica || 0) + 12, 0, 100);
      st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
      st.presidentialWinner = 'sportica';
      notes.push('📈 Sportica +6%! ZMP +2%!');
    }
    
    if (winner.id === candidate) {
      notes.push('🎉 YOUR CANDIDATE WON! Extra boost for the ZMP!');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
        }
      }
      st.unity = clamp(st.unity + 5, 0, 100);
      notes.push('📈 ZMP +3% (bonus for backing the winner)');
    }
    
    st.presidentialResultsDone = true;
    st.log.push('Week ' + st.week + ': Presidential election - ' + winner.id + ' wins');
    return notes;
  }

  /* ---------------- Local Election ---------------- */
  function LocalElection(st, choice, rng) {
    var notes = [];
    var zmpSupport = getPartySupport(st, 'ZMP');
    
    var wingName = '';
    
    var zpfSupport = getPartySupport(st, 'zpf');
    var redSupport = getPartySupport(st, 'red');
    var iiaSupport = getPartySupport(st, 'iia');
    var sempSupport = getPartySupport(st, 'semp');
    var rbSupport = getPartySupport(st, 'rb');
    var plSupport = getPartySupport(st, 'pl');
    var blSupport = getPartySupport(st, 'bl');
    var republiaSupport = getPartySupport(st, 'republia');
    var sporticaSupport = getPartySupport(st, 'sportica');
    
    var zmpLocal = zmpSupport * 0.6 + 5;
    var zpfLocal = zpfSupport * 0.5 + 3;
    var redLocal = redSupport * 0.4 + 2;
    var iiaLocal = iiaSupport * 0.5 + 3;
    var sempLocal = sempSupport * 0.3 + 1;
    var rbLocal = rbSupport * 0.3 + 1;
    var plLocal = plSupport * 0.3 + 1;
    var blLocal = blSupport * 0.2 + 1;
    var republiaLocal = republiaSupport * 0.4 + 2;
    var sporticaLocal = sporticaSupport * 0.4 + 2;
    
    if (st.week === 19) {
      zpfLocal += 5;
      republiaLocal += 5;
      wingName = 'History Wing';
    } else if (st.week === 35) {
      iiaLocal += 5;
      wingName = 'Science Wing';
    } else if (st.week === 51) {
      plLocal += 5;
      sempLocal += 5;
      wingName = 'Arts Wing';
    } else if (st.week === 67) {
      sporticaLocal += 5;
      rbLocal += 5;
      wingName = 'Athletics Wing';
    } else if (st.week === 83) {
      redLocal += 5;
      zpfLocal += 3;
      wingName = 'Social Sciences Wing';
    } else if (st.week === 99) {
      wingName = 'Final Round - All Wings';
    }
    
    var bonus = st.LocalElectionBonus || 0;
    zmpLocal += bonus * 2;
    
    zmpLocal *= (0.85 + rng() * 0.3);
    zpfLocal *= (0.85 + rng() * 0.3);
    redLocal *= (0.85 + rng() * 0.3);
    iiaLocal *= (0.85 + rng() * 0.3);
    sempLocal *= (0.85 + rng() * 0.3);
    rbLocal *= (0.85 + rng() * 0.3);
    plLocal *= (0.85 + rng() * 0.3);
    blLocal *= (0.85 + rng() * 0.3);
    republiaLocal *= (0.85 + rng() * 0.3);
    sporticaLocal *= (0.85 + rng() * 0.3);
    
    var totalLocal = zmpLocal + zpfLocal + redLocal + iiaLocal + sempLocal + rbLocal + plLocal + blLocal + republiaLocal + sporticaLocal;
    if (totalLocal > 0) {
      zmpLocal = (zmpLocal / totalLocal) * 100;
      zpfLocal = (zpfLocal / totalLocal) * 100;
      redLocal = (redLocal / totalLocal) * 100;
      iiaLocal = (iiaLocal / totalLocal) * 100;
      sempLocal = (sempLocal / totalLocal) * 100;
      rbLocal = (rbLocal / totalLocal) * 100;
      plLocal = (plLocal / totalLocal) * 100;
      blLocal = (blLocal / totalLocal) * 100;
      republiaLocal = (republiaLocal / totalLocal) * 100;
      sporticaLocal = (sporticaLocal / totalLocal) * 100;
    }
    
    var zmpVote = Math.round(zmpLocal * 10) / 10;
    var zpfVote = Math.round(zpfLocal * 10) / 10;
    var redVote = Math.round(redLocal * 10) / 10;
    var iiaVote = Math.round(iiaLocal * 10) / 10;
    var sempVote = Math.round(sempLocal * 10) / 10;
    var rbVote = Math.round(rbLocal * 10) / 10;
    var plVote = Math.round(plLocal * 10) / 10;
    var blVote = Math.round(blLocal * 10) / 10;
    var republiaVote = Math.round(republiaLocal * 10) / 10;
    var sporticaVote = Math.round(sporticaLocal * 10) / 10;
    
    var unitedLeft = zmpVote + redVote;
    var grandCoalition = zmpVote + iiaVote + sempVote + plVote;
    var bourgeoisCoalition = zpfVote + republiaVote + sporticaVote + rbVote;
    var rightWingCoalition = bourgeoisCoalition + blVote;
    
    var winningCoalition = 'none';
    var highestCoalition = 0;
    
    if (unitedLeft >= 50) { winningCoalition = 'united_left'; highestCoalition = unitedLeft; }
    if (grandCoalition >= 50 && grandCoalition > highestCoalition) { winningCoalition = 'grand'; highestCoalition = grandCoalition; }
    if (bourgeoisCoalition >= 50 && bourgeoisCoalition > highestCoalition) { winningCoalition = 'bourgeois'; highestCoalition = bourgeoisCoalition; }
    if (rightWingCoalition >= 50 && rightWingCoalition > highestCoalition) { winningCoalition = 'right_wing'; highestCoalition = rightWingCoalition; }
    
    if (winningCoalition === 'united_left') {
      notes.push(' United Left Coalition wins! (ZMP + Red)');
      notes.push(' ZMP gets a slight boost, Red Front gets a slight boost.');
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 2);
        }
      }
      st.affinity.red = clamp((st.affinity.red || 0) + 5, 0, 100);
      st.unity = clamp(st.unity + 2, 0, 100);
      notes.push('📈 ZMP +2%, Red +2%');
      st.log.push('Week ' + st.week + ': Local election - United Left Coalition wins');
      
    } else if (winningCoalition === 'grand') {
      notes.push(' Grand Coalition wins! (ZMP + IIA + SEMP + PL)');
      notes.push('🔵 ZMP gets a slight boost, IIA, SEMP, and PL get slight boosts.');
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 1);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 2);
          st.raw.semp[dm.id] = Math.max(0.5, (st.raw.semp[dm.id] || 0) + 1);
          st.raw.pl[dm.id] = Math.max(0.5, (st.raw.pl[dm.id] || 0) + 1);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) + 5, 0, 100);
      st.affinity.semp = clamp((st.affinity.semp || 0) + 3, 0, 100);
      st.affinity.pl = clamp((st.affinity.pl || 0) + 3, 0, 100);
      st.unity = clamp(st.unity + 3, 0, 100);
      notes.push('📈 ZMP +1%, IIA +2%, SEMP +1%, PL +1%');
      st.log.push('Week ' + st.week + ': Local election - Grand Coalition wins');
      
    } else if (winningCoalition === 'bourgeois') {
      notes.push(' Bourgeois Coalition wins! (ZPF + Republia + Sportica + RB)');
      notes.push(' Significant boost to Red Front and IIA!');
      notes.push('📈 Moderate boosts to ZPF, Republia, Sportica, and Red Bench.');
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 3);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 3);
          st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 2);
          st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 2);
          st.raw.sportica[dm.id] = Math.max(0.5, (st.raw.sportica[dm.id] || 0) + 2);
          st.raw.rb[dm.id] = Math.max(0.5, (st.raw.rb[dm.id] || 0) + 2);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 1);
        }
      }
      st.affinity.red = clamp((st.affinity.red || 0) + 8, 0, 100);
      st.affinity.iia = clamp((st.affinity.iia || 0) + 8, 0, 100);
      st.affinity.zpf = clamp((st.affinity.zpf || 0) + 4, 0, 100);
      st.affinity.republia = clamp((st.affinity.republia || 0) + 4, 0, 100);
      st.affinity.sportica = clamp((st.affinity.sportica || 0) + 4, 0, 100);
      st.affinity.rb = clamp((st.affinity.rb || 0) + 4, 0, 100);
      st.unity = clamp(st.unity - 2, 0, 100);
      notes.push('📈 Red +3%, IIA +3%, ZPF +2%, Republia +2%, Sportica +2%, RB +2%');
      notes.push('📉 ZMP -1%');
      st.log.push('Week ' + st.week + ': Local election - Bourgeois Coalition wins');
      
    } else if (winningCoalition === 'right_wing') {
      notes.push(' Right-Wing Coalition wins! (Bourgeois + Black League)');
      
      if (st.blSplintered) {
        notes.push(' The Black League is splintered! The splinter parties (CrNP, FLO, NHP) gain significant support!');
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            if (st.raw.crnp) st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 5);
            if (st.raw.flo) st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 5);
            if (st.raw.nhp) st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 5);
            st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 3);
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 2);
            st.raw.sportica[dm.id] = Math.max(0.5, (st.raw.sportica[dm.id] || 0) + 2);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
          }
        }
        st.affinity.crnp = clamp((st.affinity.crnp || 0) + 10, 0, 100);
        st.affinity.flo = clamp((st.affinity.flo || 0) + 10, 0, 100);
        st.affinity.nhp = clamp((st.affinity.nhp || 0) + 10, 0, 100);
        notes.push('📈 CrNP +5%, FLO +5%, NHP +5%');
        st.log.push('Week ' + st.week + ': Local election - Right-Wing wins (splinters gain)');
        
      } else {
        notes.push(' Black League gets a VERY significant boost!');
        notes.push('📈 Republia, ZPF, and Sportica get moderate boosts.');
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 5);
            st.raw.republia[dm.id] = Math.max(0.5, (st.raw.republia[dm.id] || 0) + 3);
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 2);
            st.raw.sportica[dm.id] = Math.max(0.5, (st.raw.sportica[dm.id] || 0) + 2);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
          }
        }
        st.affinity.bl = clamp((st.affinity.bl || 0) + 12, 0, 100);
        st.affinity.republia = clamp((st.affinity.republia || 0) + 6, 0, 100);
        st.affinity.zpf = clamp((st.affinity.zpf || 0) + 4, 0, 100);
        st.affinity.sportica = clamp((st.affinity.sportica || 0) + 4, 0, 100);
        notes.push('📈 BL +5%, Republia +3%, ZPF +2%, Sportica +2%');
        st.log.push('Week ' + st.week + ': Local election - Right-Wing wins (BL gains)');
      }
      
      notes.push('📉 ZMP -2%');
      st.unity = clamp(st.unity - 4, 0, 100);
      st.faculty = clamp(st.faculty - 3, 0, 100);
      
    } else {
      notes.push(' No coalition has a clear majority! Hung parliament.');
      notes.push(' New elections may be needed soon.');
      st.unity = clamp(st.unity - 2, 0, 100);
      st.log.push('Week ' + st.week + ': Local election - Hung parliament');
    }
    
    st.LocalElectionCount = (st.LocalElectionCount || 0) + 1;
    
    return notes;
  }

  /* ---------------- Check for Endings ---------------- */
  function checkForEndings(st, rng) {
  var faction = null;
  for (var i = 0; i < D.FACTIONS.length; i++) {
    if (D.FACTIONS[i].id === st.faction) { faction = D.FACTIONS[i]; }
  }

  var zmpSeats = st.seats.ZMP || 0;
  var zmpSupport = getPartySupport(st, 'ZMP');
  var majoritySeats = (D && D.MAJORITY) ? D.MAJORITY : 23;

  // =========================================================
  // UNIVERSAL DEFEAT: Black League victory (fires immediately)
  // =========================================================
  if (st.gameOver === true || st.battle3Lost === true) {
    return {
      ending: 'black_league_victory',
      title: 'The Black League Triumphs',
      subtitle: 'Darkness falls over the school.',
      endingNumber: 'Ending 1',
      body: 'The Black League has won. The school falls to darkness.',
      story: 'The Black League has consolidated its control over the school. The council is abolished. The faculty is purged. Students live in fear. Your coalition lies in ruins.',
      subending: 'Subending A - The Long Night',
      detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
      epilogue: 'The Black League rules for a generation. Their grip on the school is absolute.'
    };
  }

  // =========================================================
  // UNIVERSAL GATE
  // No faction ending can fire until the Black League arc has
  // resolved, the mid-game has passed, and no crisis is active.
  // =========================================================
  var blResolved = st.battle3Won === true
                || st.blSplintered === true
                || st.blNeutralized === true;
  var survivedMidGame = st.week >= 40;
  var noActiveCrisis = !st.girlRepublicFormed
                    && !st.facultyCoupAttempted;
  var earnedEnding = blResolved && survivedMidGame && noActiveCrisis;

  // =========================================================
  // JIHADIST ENDINGS (fire when conditions are met, any week)
  // The Jihadists never hold seats — victory is judged by
  // popular support, not parliament.
  // =========================================================
  if (faction && faction.id === 'jihadists') {
    // End-of-game failure: still shouting in the wilderness
    if (st.week >= 104 && zmpSupport < 20) {
      return {
        ending: 'jihadist_failure',
        title: 'The Failed Revolution',
        subtitle: 'You refused the ballot. You lost the war.',
        endingNumber: 'Ending 15',
        body: 'You refused to participate in elections. Your supporters abandoned you. The ZMP is a shadow of its former self.',
        story: 'By refusing to participate in the democratic process, the ZMP alienated its moderate supporters. The other parties filled the void. Your jihadist faction is now a fringe group, shouting in the wilderness. The school continues without you.',
        subending: 'Subending O - The Wilderness',
        detail: '<div class="stat"><span>ZMP Support</span><span class="v">' + Math.round(zmpSupport) + '%</span></div>',
        epilogue: 'The ZMP is remembered as a cautionary tale. The jihadists never seize power.'
      };
    }
    // Otherwise: keep playing — the putsch minigame handles victory
    return null;
  }

  // =========================================================
  // SECULARIST ENDINGS
  // =========================================================
  if (faction && faction.id === 'secularists') {
    if (zmpSeats >= majoritySeats && earnedEnding) {
      return {
        ending: 'secular_republic',
        title: 'The Secular Republic',
        subtitle: 'A new constitution is written.',
        endingNumber: 'Ending 16',
        body: 'The ZMP under the secularist faction has won a majority. You have transformed the school into a secular, liberal democracy.',
        story: 'The old religious symbols are removed from the council chamber. The school is now governed by laws, not scriptures. Every student has equal rights regardless of faith. The faculty is reformed. The ZMP is the party of progress.',
        subending: 'Subending P - The Rights of Man',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>' +
          '<div class="stat"><span>ZMP Seats</span><span class="v">' + zmpSeats + ' / ' + D.SEATS + '</span></div>',
        epilogue: 'The secular republic endures. The school becomes a model for the district.'
      };
    }

    if (st.week >= 104 && earnedEnding) {
      return {
        ending: 'secular_opposition',
        title: 'The Loyal Opposition',
        subtitle: 'You did not win, but you did not surrender.',
        endingNumber: 'Ending 17',
        body: 'The ZMP did not win a majority, but the secularist faction has kept the party alive and relevant.',
        story: 'You did not win this time. But you did not compromise your principles. The secularist ZMP remains the voice of reason in the council. You will fight another day.',
        subending: 'Subending Q - The Long Game',
        detail: '<div class="stat"><span>ZMP Seats</span><span class="v">' + zmpSeats + ' / ' + D.SEATS + '</span></div>',
        epilogue: 'The secularist cause continues. The next election may be yours.'
      };
    }
  }

  // =========================================================
  // SECURRO-ZALGRILIANIST ENDINGS
  // =========================================================
  if (faction && faction.id === 'securro') {
    if (zmpSeats >= majoritySeats && earnedEnding) {
      return {
        ending: 'securro_state',
        title: 'The Security State',
        subtitle: 'Order is restored. Freedom is the price.',
        endingNumber: 'Ending 18',
        body: 'The Securro-Zalgrilianists have won a majority. You have established a strong, disciplined state.',
        story: 'The school is now run like a well-oiled machine. The trains run on time. The halls are clean. The students are obedient. There are no protests. There are no debates. There is only order. The ZMP is the party of the state.',
        subending: 'Subending R - The Iron Order',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>' +
          '<div class="stat"><span>ZMP Seats</span><span class="v">' + zmpSeats + ' / ' + D.SEATS + '</span></div>' +
          '<div class="stat"><span>Faculty</span><span class="v">' + Math.round(st.faculty) + '</span></div>',
        epilogue: 'The security state endures. The school is stable, but the spirit of democracy is gone.'
      };
    }

    if (st.week >= 104 && earnedEnding) {
      var coalitionSeats = zmpSeats;
      if (st.coalitionPartners) {
        for (var i = 0; i < st.coalitionPartners.length; i++) {
          coalitionSeats += st.seats[st.coalitionPartners[i]] || 0;
        }
      }

      if (coalitionSeats >= majoritySeats) {
        return {
          ending: 'securro_pact',
          title: 'The Grand Pact',
          subtitle: 'You did not win alone. But you won.',
          endingNumber: 'Ending 19',
          body: 'The Securro-Zalgrilianists have formed a grand coalition with the moderates. You have preserved the state.',
          story: 'You did not win an absolute majority, but you have forged a grand coalition with the ZPF and IIA. The government is stable. The extremists are marginalized. The ZMP remains the dominant force in the council.',
          subending: 'Subending S - The Great Compromise',
          detail: '<div class="stat"><span>Coalition Seats</span><span class="v">' + coalitionSeats + ' / ' + D.SEATS + '</span></div>',
          epilogue: 'The grand pact holds. The school is governed by a broad, stable coalition.'
        };
      }
    }
  }

  // =========================================================
  // ZALGRILIANIST ENDINGS
  // =========================================================
  if (faction && faction.id === 'zalgrilian') {
    if (zmpSeats >= majoritySeats && earnedEnding) {
      return {
        ending: 'zalgrilian_monarchy',
        title: 'The Restored Monarchy',
        subtitle: 'The crown returns to the school.',
        endingNumber: 'Ending 20',
        body: 'The Zalgrilianists have won a majority. You have restored the monarchy.',
        story: 'The council is reformed into a royal court. The chair is replaced by a throne. The school is governed by a benevolent monarch — you. The students cheer. The faculty bows. The ZMP is the party of the crown.',
        subending: 'Subending T - The Crown Returns',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>' +
          '<div class="stat"><span>ZMP Seats</span><span class="v">' + zmpSeats + ' / ' + D.SEATS + '</span></div>',
        epilogue: 'The monarchy is restored. The school is ruled by a wise and just king.'
      };
    }
  }

  // =========================================================
  // GENERIC END-OF-GAME FALLBACK (week 104)
  // =========================================================
  if (st.week >= 104) {
    return {
      ending: 'stalemate',
      title: 'The Stalemate',
      subtitle: 'No one won. No one lost.',
      endingNumber: 'Ending 21',
      body: 'The two years have ended. No faction has achieved its goals. The school remains divided.',
      story: 'The ZMP is fractured. The council is deadlocked. The splinters have been defeated, but the future is uncertain. The school enters a period of quiet decline.',
      subending: 'Subending U - The Quiet Decline',
      detail: '<div class="stat"><span>ZMP Seats</span><span class="v">' + zmpSeats + ' / ' + D.SEATS + '</span></div>',
      epilogue: 'The school is paralyzed. The ZMP\'s moment has passed.'
    };
  }

  // =========================================================
  // NOT YET — KEEP PLAYING
  // =========================================================
  return null;

  
    
    if (st.battle3Won === true && zmpSeats < majoritySeats) {
      var detailHtml = '<div class="stat"><span>ZMP seats</span><span class="v">' + zmpSeats + ' / ' + D.SEATS + '</span></div>';
      
      return {
        ending: 'zmp_fractures',
        title: 'The ZMP Fractures!',
        subtitle: 'Victory came at a terrible cost.',
        endingNumber: 'Ending 2',
        body: 'You survived the Last of Us, but your party could not hold together.',
        story: 'The Black League was defeated, but victory came at a terrible cost. The ZMP is in ruins. Factional infighting has torn the party apart.',
        subending: 'Subending B - A House Divided',
        detail: detailHtml,
        epilogue: 'The ZMP dissolves into irrelevance.'
      };
    }
    
    if (st.faction === 'gamers' && zupSeats >= majoritySeats) {
      var detailHtml = '<div class="stat"><span>ZMP seats</span><span class="v">' + zmpSeats + '</span></div>' +
        '<div class="stat"><span>ZPF seats</span><span class="v">' + zpfSeats + '</span></div>' +
        '<div class="stat"><span>ZUP total</span><span class="v">' + zupSeats + ' / ' + D.SEATS + '</span></div>';
      
      return {
        ending: 'zup_formed',
        title: 'The ZUP Is Formed!',
        subtitle: 'The United People\'s Party rises.',
        endingNumber: 'Ending 4',
        body: 'The Gamer Wing has achieved the ultimate victory. ZMP and ZPF merge.',
        story: 'The Gamer Wing\'s vision has been realized. The ZMP and ZPF have merged into a single, powerful entity: the ZUP (Zalgrilian Unity Party).',
        subending: 'Subending D - The Gamer Utopia',
        detail: detailHtml,
        epilogue: 'The ZUP becomes the permanent governing party of the school.'
      };
    }
    
    if (girlsSeats >= majoritySeats) {
      var detailHtml = '<div class="stat"><span>TIIA seats</span><span class="v">' + tiiaSeats + '</span></div>' +
        '<div class="stat"><span>IIA seats</span><span class="v">' + iiaSeats + '</span></div>' +
        '<div class="stat"><span>Red Front seats</span><span class="v">' + redSeats + '</span></div>' +
        '<div class="stat"><span>Red Bench seats</span><span class="v">' + rbSeats + '</span></div>' +
        '<div class="stat"><span>Total seats</span><span class="v">' + girlsSeats + ' / ' + D.SEATS + '</span></div>';
      
      return {
        ending: 'girls_consolidate',
        title: 'The Girls Consolidate!',
        subtitle: 'The left-tech alliance takes control.',
        endingNumber: 'Ending 5',
        body: 'The left-tech alliance has taken control. The girls hold the grip.',
        story: 'The TIIA-IIA-Red-RB alliance has become the dominant force in the school.',
        subending: 'Subending E - The Girl Power Revolution',
        detail: detailHtml,
        epilogue: 'The left-tech alliance rules the school for a generation.'
      };
    }
    
    if (communeSeats >= majoritySeats) {
      var detailHtml = '<div class="stat"><span>Red Front seats</span><span class="v">' + redSeats + '</span></div>' +
        '<div class="stat"><span>Red Bench seats</span><span class="v">' + rbSeats + '</span></div>' +
        '<div class="stat"><span>SPF seats</span><span class="v">' + sempSeats + '</span></div>' +
        '<div class="stat"><span>Republia seats</span><span class="v">' + republiaSeats + '</span></div>' +
        '<div class="stat"><span>Total seats</span><span class="v">' + communeSeats + ' / ' + D.SEATS + '</span></div>';
      
      return {
        ending: 'commune_of_class',
        title: 'The Commune of Class!',
        subtitle: 'The left-national revolution triumphs.',
        endingNumber: 'Ending 6',
        body: 'The left-national alliance has seized power. The commune is established.',
        story: 'The Red Front, Red Bench, SPF, and Republia have united in a revolutionary alliance.',
        subending: 'Subending F - Spartakus Rises Again',
        detail: detailHtml,
        epilogue: 'The commune rules the school. Class solidarity is the law.'
      };
    }
    
    var detailHtml = '<div class="stat"><span>Coalition seats</span><span class="v">' + totalSeats + ' / ' + D.SEATS + '</span></div>' +
      '<div class="stat"><span>Unity</span><span class="v">' + Math.round(st.unity) + '</span></div>' +
      '<div class="stat"><span>Faculty</span><span class="v">' + Math.round(st.faculty) + '</span></div>';
    
    return {
      ending: 'coalition_endures',
      title: 'The Coalition Endures!',
      subtitle: 'The big tent holds together.',
      endingNumber: 'Ending 7',
      body: 'The ZMP and its allies have held the middle. The school survives.',
      story: 'The ZMP has proven that coalitions can work. Through compromise and cooperation, you have held the school together.',
      subending: 'Subending G - The Big Tent',
      detail: detailHtml,
      epilogue: 'The coalition rules for years to come. The ZMP remains the dominant force.'
    };
  }

  /* ---------------- Achievements System ---------------- */
  /* ---------------- Achievements System ---------------- */
// ============================================================
// ACHIEVEMENT SYSTEM
// ============================================================

var ACHIEVEMENTS = [
  { id: 'first_steps', name: 'First Steps', desc: 'Survive your first week in office.' },
  { id: 'campaigner', name: 'Campaigner', desc: 'Accumulate $150 in party funds.' },
  { id: 'coalition_builder', name: 'Coalition Builder', desc: 'Form a coalition government.' },
  { id: 'election_winner', name: 'Election Winner', desc: 'Win a majority (51+ seats) in an election.' },
  { id: 'president', name: 'Head of State', desc: 'Win the Presidential Election.' },
  { id: 'iron_fist', name: 'Iron Fist', desc: 'Reach 80% Party Unity.' },
  { id: 'student_advocate', name: 'Student Advocate', desc: 'Reach 80% Faculty Tolerance.' },
  { id: 'militarist', name: 'Legion Commander', desc: 'Recruit 100 members for the Dzehurjaca.' },
  { id: 'putschist', name: 'Putschist', desc: 'Launch the King Putsch.' },
  { id: 'monarchist', name: 'The King\'s Men', desc: 'Restore the Monarchy.' },
  { id: 'survivor', name: 'Survivor', desc: 'Reach Week 50.' },
  { id: 'history_maker', name: 'History Maker', desc: 'Reach any ending.' }
];

function checkAchievements(st) {
  if (!st) return [];

  return ACHIEVEMENTS.map(function(a) {
    var unlocked = false;

    // Progressive / Milestone Achievements
    if (a.id === 'first_steps') unlocked = st.week >= 2;
    if (a.id === 'campaigner') unlocked = st.funds >= 150;
    if (a.id === 'survivor') unlocked = st.week >= 50;
    if (a.id === 'history_maker') unlocked = st.finished === true;

    // Political Achievements
    if (a.id === 'coalition_builder') unlocked = st.coalitionPartners && st.coalitionPartners.length > 0;
    if (a.id === 'election_winner') unlocked = st.seats && st.seats.ZMP >= 51;
    if (a.id === 'president') unlocked = st.hasPresident === true;
    if (a.id === 'iron_fist') unlocked = st.unity >= 80;
    if (a.id === 'student_advocate') unlocked = st.faculty >= 80;
    
    // Faction-Specific / Minigame Achievements
    if (a.id === 'militarist') {
      unlocked = st.paramilitaries && st.paramilitaries.dzehurjaca && st.paramilitaries.dzehurjaca.members >= 100;
    }
    if (a.id === 'putschist') unlocked = st.king && st.king.active === true;
    if (a.id === 'monarchist') unlocked = st.monarchyRestored === true;

    return {
      id: a.id,
      name: a.name,
      desc: a.desc,
      unlocked: unlocked
    };
  });
}

  /* ---------------- Dynamic Party Ambitions System ---------------- */

  /* ---------------- POST-SPLINTER RUBICON SEQUENCE ---------------- */

  // Helper to get the strongest splinter party
  function getStrongestSplinter(st) {
    var splinters = ['crnp', 'flo', 'nhp'];
    var strongest = null;
    var maxSupport = 0;
    for (var i = 0; i < splinters.length; i++) {
      var pid = splinters[i];
      if (st.raw[pid]) {
        var support = getPartySupport(st, pid);
        if (support > maxSupport) {
          maxSupport = support;
          strongest = pid;
        }
      }
    }
    return strongest;
  }

  // Resolve the Rubicon Activation
  function resolveRubiconActivation(st, choice, rng) {
    var notes = [];
    st.rubiconTriggered = true;
    st.rubiconState = choice;

    if (choice === 'emergency') {
      notes.push('You declare a state of emergency. The ZMP takes control of security.');
      // Moderate boost to ZMP, heavy penalties to splinters, but faculty backlash
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 2);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 2);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 2);
        }
      }
      st.faculty = clamp(st.faculty - 15, 0, 100);
      st.unity = clamp(st.unity + 5, 0, 100);
      notes.push('The faculty is furious, but the students appreciate the resolve.');
    } else if (choice === 'ground') {
      notes.push('You go to ground, waiting for them to make a move.');
      // Cautious: less immediate backlash, but they grow stronger
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 3);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 3);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 3);
        }
      }
      st.momentum = clamp(st.momentum - 5, -10, 20);
      notes.push('They gain ground while you wait.');
    } else if (choice === 'appeal') {
      notes.push('You appeal for unity. The school must stand together.');
      // High risk; if splinters are strong, it fails catastrophically
      var strongest = getStrongestSplinter(st);
      var splinterSupport = strongest ? getPartySupport(st, strongest) : 0;

      if (splinterSupport > 15) {
        notes.push('Your appeal falls on deaf ears. The splinters mock your weakness.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
            st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 4);
            st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 4);
            st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 4);
          }
        }
        st.momentum = clamp(st.momentum - 8, -10, 20);
        st.unity = clamp(st.unity - 10, 0, 100);
      } else {
        notes.push('The moderate parties rally to your side.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 4);
          }
        }
        st.unity = clamp(st.unity + 10, 0, 100);
      }
    }

    st.log.push('Week ' + st.week + ': RUBICON ACTIVATED - State: ' + choice);
    return notes;
  }

  // Resolve the Popular Front formation
  function resolveRubiconPopularFront(st, choice, rng) {
    var notes = [];
    st.rubiconPopularFrontTriggered = true;
    st.rubiconPopularFront = choice;

    if (choice === 'form') {
      notes.push('THE POPULAR FRONT IS FORMED! IIA, Red Front, and ZPF unite against the fascists!');
      // Massive coalition boost
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 6);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 4);
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 4);
          st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 4);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 8);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 8);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 8);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) + 20, 0, 100);
      st.affinity.red = clamp((st.affinity.red || 0) + 20, 0, 100);
      st.affinity.zpf = clamp((st.affinity.zpf || 0) + 20, 0, 100);
      st.momentum = clamp(st.momentum + 8, -10, 20);
      st.unity = clamp(st.unity + 10, 0, 100);
      notes.push('The coalition is strong, but they demand total loyalty.');
    } else if (choice === 'refuse') {
      notes.push('You refuse their help. The ZMP stands alone.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 4);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 4);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 4);
        }
      }
      st.momentum = clamp(st.momentum - 5, -10, 20);
      notes.push('The battle will be much harder without allies.');
    } else if (choice === 'use') {
      notes.push('You use them, but keep them at arm\'s length.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 2);
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 2);
          st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 2);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 4);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 4);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 4);
        }
      }
      st.momentum = clamp(st.momentum + 3, -10, 20);
      notes.push('They will likely turn on you if you weaken.');
    }

    st.log.push('Week ' + st.week + ': Popular Front resolved - ' + choice);
    return notes;
  }

  // Resolve the Fascist Surge
  function resolveRubiconSurge(st, choice, rng) {
    var notes = [];
    st.rubiconSurgeTriggered = true;

    if (choice === 'strike') {
      notes.push('GENERAL STRIKE! You shut down the school to paralyze the fascists.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 5);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 4);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 4);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 4);
        }
      }
      st.faculty = clamp(st.faculty - 20, 0, 100);
      st.unity = clamp(st.unity + 8, 0, 100);
      st.momentum = clamp(st.momentum + 5, -10, 20);
      notes.push('The faculty will never forgive you, but the students rally to your banner.');
    } else if (choice === 'police') {
      notes.push('You call the police. The state intervenes.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 10);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 10);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 10);
        }
      }
      st.faculty = clamp(st.faculty + 15, 0, 100);
      st.unity = clamp(st.unity - 10, 0, 100);
      notes.push('The students hate you for using the state, but the fascists are caged.');
    } else if (choice === 'fight') {
      notes.push('TOTAL WAR! You will meet violence with violence.');
      var successChance = 0.3 + (st.unity / 200) + (st.momentum / 80);
      if (rng() < successChance) {
        notes.push('VICTORY! The Fascist Surge is crushed in the streets!');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 8);
            st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 8);
            st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 8);
            st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 8);
          }
        }
        st.momentum = clamp(st.momentum + 10, -10, 20);
        st.unity = clamp(st.unity + 12, 0, 100);
      } else {
        notes.push('DEFEAT! The fascists are too strong. You suffer heavy losses.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
            st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 5);
            st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 5);
            st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 5);
          }
        }
        st.momentum = clamp(st.momentum - 8, -10, 20);
        st.unity = clamp(st.unity - 10, 0, 100);
      }
    }

    st.log.push('Week ' + st.week + ': Fascist Surge resolved - ' + choice);
    return notes;
  }

  // Resolve the Betrayal
  function resolveRubiconBetrayal(st, choice, rng) {
    var notes = [];
    st.rubiconBetrayalTriggered = true;
    st.rubiconBetrayal = choice;

    if (choice === 'purge') {
      notes.push('You purge the Popular Front. They are now enemies.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 5);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 8);
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 8);
          st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) - 8);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 2);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 2);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 2);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) - 20, 0, 100);
      st.affinity.red = clamp((st.affinity.red || 0) - 20, 0, 100);
      st.affinity.zpf = clamp((st.affinity.zpf || 0) - 20, 0, 100);
      st.momentum = clamp(st.momentum + 3, -10, 20);
      notes.push('You are now alone, but the ZMP is pure.');
    } else if (choice === 'beg') {
      notes.push('You beg for forgiveness. You are now a puppet.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 5);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 5);
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 5);
          st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 5);
        }
      }
      st.affinity.iia = clamp((st.affinity.iia || 0) + 10, 0, 100);
      st.affinity.red = clamp((st.affinity.red || 0) + 10, 0, 100);
      st.affinity.zpf = clamp((st.affinity.zpf || 0) + 10, 0, 100);
      st.momentum = clamp(st.momentum - 8, -10, 20);
      notes.push('You survive, but your dignity is shattered.');
    } else if (choice === 'attack') {
      notes.push('You attack the Popular Front! CIVIL WAR!');
      var successChance = 0.5 + (st.momentum / 100);
      if (rng() < successChance) {
        notes.push('VICTORY! You crush the Popular Front!');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 10);
            st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 12);
            st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 12);
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) - 12);
          }
        }
        st.momentum = clamp(st.momentum + 10, -10, 20);
        st.unity = clamp(st.unity + 5, 0, 100);
      } else {
        notes.push('DEFEAT! The Popular Front crushes you.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 12);
            st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 8);
            st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 8);
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + 8);
          }
        }
        st.momentum = clamp(st.momentum - 10, -10, 20);
      }
    }

    st.log.push('Week ' + st.week + ': Betrayal resolved - ' + choice);
    return notes;
  }

  // Resolve the Last Stand
  function resolveRubiconLastStand(st, choice, rng) {
    var notes = [];
    st.rubiconLastStandTriggered = true;
    st.rubiconLastStand = choice;

    var strongest = getStrongestSplinter(st);
    var enemySupport = strongest ? getPartySupport(st, strongest) : 0;

    if (choice === 'all_in') {
      notes.push('FINAL ASSAULT! You call every ally you have!');
      var successChance = 0.4 + (st.affinity.iia / 300) + (st.affinity.red / 300) + (st.affinity.zpf / 300) + (st.unity / 400);
      successChance = Math.min(0.95, successChance);

      if (rng() < successChance) {
        notes.push('MIRACLE VICTORY! The fascist splinters are utterly destroyed!');
        st.blSplintered = true;
        st.blackLeagueBanned = true;
        st.rubiconVictory = true;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 12);
            st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 15);
            st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 15);
            st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 15);
          }
        }
        st.momentum = clamp(st.momentum + 15, -10, 20);
        st.unity = clamp(st.unity + 20, 0, 100);
        st.faculty = clamp(st.faculty + 10, 0, 100);
      } else {
        notes.push('DEFEAT! The splinters are too strong. You are destroyed.');
        st.rubiconLost = true;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 10);
          }
        }
      }
    } else if (choice === 'alone') {
      notes.push('You fight alone! The ZMP proves its might!');
      var successChance = 0.2 + (st.unity / 300) + (st.momentum / 80);
      successChance = Math.min(0.8, successChance);

      if (rng() < successChance) {
        notes.push('LEGENDARY VICTORY! The ZMP alone destroys them!');
        st.blSplintered = true;
        st.blackLeagueBanned = true;
        st.rubiconVictory = true;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 15);
            st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) - 20);
            st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) - 20);
            st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) - 20);
          }
        }
        st.momentum = clamp(st.momentum + 20, -10, 20);
        st.unity = clamp(st.unity + 25, 0, 100);
      } else {
        notes.push('ANIHILATED! The ZMP is destroyed for its hubris.');
        st.rubiconLost = true;
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 15);
          }
        }
      }
    } else if (choice === 'negotiate') {
      notes.push('You capitulate. The splinters take power.');
      st.rubiconLost = true;
      st.rubiconCapitulated = true;
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 10);
          st.raw.crnp[dm.id] = Math.max(0.5, (st.raw.crnp[dm.id] || 0) + 15);
          st.raw.flo[dm.id] = Math.max(0.5, (st.raw.flo[dm.id] || 0) + 15);
          st.raw.nhp[dm.id] = Math.max(0.5, (st.raw.nhp[dm.id] || 0) + 15);
        }
      }
      st.momentum = clamp(st.momentum - 10, -10, 20);
    }

    st.log.push('Week ' + st.week + ': Last Stand resolved - ' + choice + ' | Win: ' + (st.rubiconVictory ? 'Yes' : 'No'));
    return notes;
  }

  // Resolve Victory aftermath
  function resolveRubiconVictory(st, choice, rng) {
    var notes = [];
    st.rubiconVictoryTriggered = true;

    if (choice === 'rebuild') {
      notes.push('RECONSTRUCTION! You use ZMP resources to heal the school.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 10);
        }
      }
      st.funds = st.funds - 30;
      st.faculty = clamp(st.faculty + 20, 0, 100);
      st.unity = clamp(st.unity + 15, 0, 100);
      notes.push('The sl slowly recovers. Your leadership is respected.');
    } else if (choice === 'forge') {
      notes.push('You forge a new order. A militaristic state is born.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 8);
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 10);
          st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 5);
        }
      }
      st.faculty = clamp(st.faculty + 10, 0, 100);
      st.unity = clamp(st.unity - 10, 0, 100);
      notes.push('You rule with an iron fist. The school is secure, but not free.');
    } else if (choice === 'dissolve') {
      notes.push('You dissolve the council. Let the students decide their future.');
      st.unity = clamp(st.unity + 20, 0, 100);
      st.momentum = clamp(st.momentum - 15, -10, 20);
      notes.push('You give up power. History will remember you as the man who ended the war.');
    }

    st.log.push('Week ' + st.week + ': Victory aftermath - ' + choice);
    return notes;
  }

  // Resolve Defeat aftermath
  function resolveRubiconDefeat(st, choice, rng) {
    var notes = [];
    st.rubiconDefeatTriggered = true;
    st.rubiconDefeat = choice;

    if (choice === 'disband') {
      notes.push('You disband the ZMP. It is over.');
      st.finished = true;
      st.endingData = {
        ending: 'rubicon_disband',
        title: 'The Disbandment',
        subtitle: 'The banner is lowered.',
        endingNumber: 'Ending 10',
        body: 'The ZMP is formally dissolved. The school falls under the control of the fascist remnants.',
        story: 'After the collapse of the ZMP, the splinter groups (CrNP, FLO, NHP) take control of the student council. The hallways are patrolled by their enforcers. Democracy is dead.',
        subending: 'Subending J - The Long Silence',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'The school falls into a dark age. The ZMP is remembered only as a lost hope.'
      };
    } else if (choice === 'resist') {
      notes.push('You resist the occupation. You will be destroyed, but you will inspire hope.');
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 5);
        }
      }
      st.momentum = clamp(st.momentum + 5, -10, 20);
      st.unity = clamp(st.unity + 10, 0, 100);
      st.finished = true;
      st.endingData = {
        ending: 'rubicon_resist',
        title: 'The Martyrdom',
        subtitle: 'You die for the cause.',
        endingNumber: 'Ending 11',
        body: 'You resist the fascist occupation to the bitter end. Your death sparks a new movement.',
        story: 'The ZMP is destroyed, but your final resistance inspires the students to rise up. The splinters may rule the council, but they will never rule the hallways.',
        subending: 'Subending K - The Spark',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'Your name becomes a legend. The fight continues without you.'
      };
    } else if (choice === 'puppet') {
      notes.push('You become their puppet. You survive, but you are a traitor.');
      st.finished = true;
      st.endingData = {
        ending: 'rubicon_puppet',
        title: 'The Traitor',
        subtitle: 'You wear the mask of power, but it is a lie.',
        endingNumber: 'Ending 12',
        body: 'You are a puppet of the fascists. You hold a title, but no power.',
        story: 'The splinters allow you to remain as a figurehead, but you have no real authority. The students see you as a traitor. Your legacy is forever stained.',
        subending: 'Subending L - The Hollow Crown',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'The ZMP is dead. You are just a shell.'
      };
    }

    st.log.push('Week ' + st.week + ': Defeat aftermath - ' + choice);
    return notes;
  }

  // Conditional check for Rubicon events (exported)
  function isRubiconActive(st) {
    return st && st.rubiconTriggered && !st.finished;
  }

function initPartyAmbitions(st) {
  if (!st.partyAmbitions) {
    st.partyAmbitions = {
      activeParties: {},
      ambitions: [],
      completedAmbitions: [],
      partyCompetition: 0,
      dominantParty: null
    };
    
    // Initialize ambitions for all parties
    var parties = activeParties(st);
    parties.forEach(function(p) {
      if (p.id === 'ZMP' || p.id === 'other') return;
      st.partyAmbitions.activeParties[p.id] = {
        ambition: generateAmbition(st, p.id),
        progress: 0,
        completed: false,
        strength: 1 + Math.floor(getPartySupport(st, p.id) / 10),
        allies: [],
        rivals: [],
        lastAction: st.week
      };
    });
  }
  return st.partyAmbitions;
}

function generateAmbition(st, partyId) {
  var ambitions = [
    { 
      id: 'gain_influence', 
      name: 'Gain Influence',
      desc: 'Increase support by 5%',
      target: 'support',
      amount: 5,
      reward: { zmp: -2, funds: 10, volunteers: 3 }
    },
    { 
      id: 'absorb_party', 
      name: 'Absorb a Rival',
      desc: 'Absorb a smaller party',
      target: 'absorb',
      amount: 1,
      reward: { zmp: -3, unity: 2, momentum: 3 }
    },
    { 
      id: 'form_coalition', 
      name: 'Form Coalition',
      desc: 'Form a coalition with another party',
      target: 'coalition',
      amount: 1,
      reward: { zmp: -1, funds: 15, unity: 3 }
    },
    { 
      id: 'win_seats', 
      name: 'Win Seats',
      desc: 'Win 3 seats in next election',
      target: 'seats',
      amount: 3,
      reward: { zmp: -2, faculty: 3, momentum: 3 }
    },
    { 
      id: 'grow_strength', 
      name: 'Grow Strength',
      desc: 'Reach 15% support',
      target: 'strength',
      amount: 15,
      reward: { zmp: -3, funds: 15, volunteers: 5, unity: 2 }
    }
    
  ];
  
  // Pick random ambition based on party's current situation
  var support = getPartySupport(st, partyId);
  var available = ambitions.filter(function(a) {
    if (a.id === 'absorb_party') {
      // Check if there's a smaller party to absorb
      var active = activeParties(st);
      var smaller = active.some(function(p) {
        return p.id !== partyId && p.id !== 'ZMP' && p.id !== 'other' && 
               getPartySupport(st, p.id) < support * 0.6;
      });
      return smaller;
    }
    if (a.id === 'form_coalition') {
      var active = activeParties(st);
      var other = active.some(function(p) {
        return p.id !== partyId && p.id !== 'ZMP' && p.id !== 'other';
      });
      return other;
    }
    if (a.id === 'win_seats') {
      return st.week > 10;
    }
    return true;
  });
  
  if (available.length === 0) {
    return ambitions[Math.floor(Math.random() * ambitions.length)];
  }
  
  return available[Math.floor(Math.random() * available.length)];
}

/* ================================================================
 * PARAMILITARY & MANPOWER SYSTEM
 * ================================================================ */

// Initialize paramilitary forces for each faction
function initParamilitaries(st) {
  if (st.paramilitaries) return st.paramilitaries;
  
  st.paramilitaries = {
    // DZEHURJACA - Elite, well-trained, small numbers
    dzehurjaca: {
  name: 'Dzehurjaca Legion',
  short: 'Dzehurjaca',
  icon: '',
  members: 100,
  training: 8,
  equipment: 9,
  morale: 85,
  loyalty: 90,
  faction: 'zmp',
  isElite: true,
  canImprove: true,
  putschAmbition: 0       // NEW — 0-100. Not a party stat. The Legion's own.
},
    
    // BLACK LEAGUE - Medium size, well-trained, ideological
    black_legion: {
      name: 'Black Legion',
      short: 'Black Legion',
      icon: '⚫',
      members: 200,
      training: 7,
      equipment: 6,
      morale: 80,
      loyalty: 95,
      faction: 'bl',
      isElite: false,
      canImprove: true
    },
    
    // IIA - Small, tech-focused, low training
    iia_guard: {
      name: 'IIA Tech Guard',
      short: 'IIA Guard',
      icon: '💻',
      members: 150,
      training: 4,
      equipment: 5,
      morale: 65,
      loyalty: 70,
      faction: 'iia',
      isElite: false,
      canImprove: true
    },
    
    // RED FRONT + RED BENCH - Large, poorly trained
    red_militia: {
      name: 'Red Militia',
      short: 'Red Militia',
      icon: '',
      members: 400,
      training: 2,
      equipment: 2,
      morale: 60,
      loyalty: 75,
      faction: 'red',
      isElite: false,
      canImprove: true,
      includes: ['red', 'rb'] // Includes both Red Front and Red Bench
    },
    
    // WEIN - Massive numbers, zero training/equipment
    wein_workers: {
      name: 'Arbeiter von Wein',
      short: 'Wein Workers',
      icon: '🌍',
      members: 10000,
      training: 1,
      equipment: 1,
      morale: 50,
      loyalty: 60,
      faction: 'wein',
      isElite: false,
      canImprove: false, // Can't improve Wein's training/equipment, just manpower
      isForeign: true
    },
    
    // ZPF - Small, defensive
    zpf_defenders: {
      name: 'ZPF Defenders',
      short: 'ZPF Defenders',
      icon: '⚖️',
      members: 80,
      training: 5,
      equipment: 4,
      morale: 70,
      loyalty: 80,
      faction: 'zpf',
      isElite: false,
      canImprove: true
    },
    
    // SEMP - Spirit warriors, low numbers, high morale
    semp_spirit: {
      name: 'SEMP Spirit Warriors',
      short: 'Spirit Warriors',
      icon: '✨',
      members: 60,
      training: 3,
      equipment: 3,
      morale: 90,
      loyalty: 85,
      faction: 'semp',
      isElite: false,
      canImprove: true
    },
    
    // REPUBLIA - Small, well-organized
    republia_guard: {
      name: 'Republia Guard',
      short: 'Republia Guard',
      icon: '🔵',
      members: 70,
      training: 6,
      equipment: 5,
      morale: 75,
      loyalty: 85,
      faction: 'republia',
      isElite: false,
      canImprove: true
    },
    
    // SPORTICA - Athletes, medium size, low training
    sportica_athletes: {
      name: 'Sportica Athletes',
      short: 'Sportica Athletes',
      icon: '🏅',
      members: 120,
      training: 3,
      equipment: 2,
      morale: 65,
      loyalty: 60,
      faction: 'sportica',
      isElite: false,
      canImprove: true
    },
    
    // PL - Pep League, small, enthusiastic
    pl_pep: {
      name: 'PL Pep Brigade',
      short: 'Pep Brigade',
      icon: '🎉',
      members: 50,
      training: 2,
      equipment: 1,
      morale: 95,
      loyalty: 70,
      faction: 'pl',
      isElite: false,
      canImprove: true
    }
  };
  
  return st.paramilitaries;
}

// Calculate paramilitary strength
function calculateParamilitaryStrength(force) {
  // Base power = members * (training/10 + equipment/10) / 2 * morale/100
  var basePower = force.members * ((force.training / 10 + force.equipment / 10) / 2) * (force.morale / 100);
  
  // Elite bonus
  if (force.isElite) basePower *= 1.5;
  
  // Loyalty bonus
  basePower *= (0.8 + force.loyalty / 500);
  
  return Math.round(basePower);
}

// Get total paramilitary strength for a faction
function getFactionParamilitaryStrength(st, factionId) {
  if (!st.paramilitaries) return 0;
  var total = 0;
  
  for (var key in st.paramilitaries) {
    var force = st.paramilitaries[key];
    if (force.faction === factionId) {
      total += calculateParamilitaryStrength(force);
    }
  }
  
  return total;
}

// Merge paramilitary forces
function mergeParamilitaries(st, fromFaction, toFaction) {
  if (!st.paramilitaries) initParamilitaries(st);
  var notes = [];
  
  var fromForce = null;
  var toForce = null;
  
  // Find the forces
  for (var key in st.paramilitaries) {
    var force = st.paramilitaries[key];
    if (force.faction === fromFaction) fromForce = force;
    if (force.faction === toFaction) toForce = force;
  }
  
  if (!fromForce) {
    notes.push('No paramilitary force found for ' + fromFaction);
    return notes;
  }
  
  if (!toForce) {
    notes.push('No paramilitary force found for ' + toFaction);
    return notes;
  }
  
  // Transfer members
  var transferred = Math.floor(fromForce.members * 0.7);
  toForce.members += transferred;
  fromForce.members = Math.floor(fromForce.members * 0.3);
  
  // Transfer equipment if toForce has better equipment
  if (fromForce.equipment > toForce.equipment) {
    toForce.equipment = Math.min(10, toForce.equipment + Math.floor((fromForce.equipment - toForce.equipment) / 2));
  }
  
  // Training improves slightly
  if (fromForce.training > toForce.training) {
    toForce.training = Math.min(10, toForce.training + 1);
  }
  
  notes.push(' ' + fromForce.name + ' merged into ' + toForce.name + '!');
  notes.push(' ' + transferred + ' members transferred');
  notes.push(' ' + toForce.name + ' now has ' + toForce.members + ' members');
  notes.push(' ' + fromForce.name + ' reduced to ' + fromForce.members + ' members');
  
  st.log.push('Week ' + st.week + ': ' + fromForce.name + ' merged into ' + toForce.name);
  
  return notes;
}

// Train paramilitary force
function trainParamilitaries(st, forceId, amount) {
  if (!st.paramilitaries) initParamilitaries(st);
  var notes = [];
  
  var force = st.paramilitaries[forceId];
  if (!force) {
    notes.push('Paramilitary force not found.');
    return notes;
  }
  
  if (force.isForeign) {
    notes.push('Cannot train foreign forces.');
    return notes;
  }
  
  var cost = amount * 10;
  if (st.funds < cost) {
    notes.push('Not enough funds. Need $' + cost);
    return notes;
  }
  
  st.funds -= cost;
  force.training = Math.min(10, force.training + amount);
  
  notes.push(' ' + force.name + ' training increased to ' + force.training + '/10');
  notes.push('💰 Spent $' + cost);
  notes.push('💪 New strength: ' + calculateParamilitaryStrength(force));
  
  st.log.push('Week ' + st.week + ': Trained ' + force.name + ' to level ' + force.training);
  
  return notes;
}

// Equip paramilitary force
function equipParamilitaries(st, forceId, amount) {
  if (!st.paramilitaries) initParamilitaries(st);
  var notes = [];
  
  var force = st.paramilitaries[forceId];
  if (!force) {
    notes.push('Paramilitary force not found.');
    return notes;
  }
  
  if (force.isForeign) {
    notes.push('Cannot equip foreign forces.');
    return notes;
  }
  
  var cost = amount * 15;
  if (st.funds < cost) {
    notes.push('Not enough funds. Need $' + cost);
    return notes;
  }
  
  st.funds -= cost;
  force.equipment = Math.min(10, force.equipment + amount);
  
  notes.push(' ' + force.name + ' equipment increased to ' + force.equipment + '/10');
  notes.push('💰 Spent $' + cost);
  notes.push('💪 New strength: ' + calculateParamilitaryStrength(force));
  
  st.log.push('Week ' + st.week + ': Equipped ' + force.name + ' to level ' + force.equipment);
  
  return notes;
}

// Rally paramilitary force (increase morale)
function rallyParamilitaries(st, forceId) {
  if (!st.paramilitaries) initParamilitaries(st);
  var notes = [];
  
  var force = st.paramilitaries[forceId];
  if (!force) {
    notes.push('Paramilitary force not found.');
    return notes;
  }
  
  force.morale = Math.min(100, force.morale + 5 + Math.floor(Math.random() * 5));
  force.loyalty = Math.min(100, force.loyalty + 3);
  
  notes.push(' ' + force.name + ' morale increased to ' + force.morale + '%');
  notes.push('💪 Loyalty increased to ' + force.loyalty + '%');
  
  st.log.push('Week ' + st.week + ': Rallied ' + force.name);
  
  return notes;
}

// Recruit paramilitary members
function recruitParamilitaries(st, forceId, amount) {
  if (!st.paramilitaries) initParamilitaries(st);
  var notes = [];
  
  var force = st.paramilitaries[forceId];
  if (!force) {
    notes.push('Paramilitary force not found.');
    return notes;
  }
  
  if (force.isForeign) {
    notes.push('Cannot recruit for foreign forces.');
    return notes;
  }
  
  // Get support for the faction to determine recruitment success
  var support = getPartySupport(st, force.faction);
  var recruitmentBonus = Math.floor(support / 10);
  
  var recruited = amount + recruitmentBonus + Math.floor(Math.random() * 5);
  force.members += recruited;
  
  notes.push(' Recruited ' + recruited + ' new members for ' + force.name);
  notes.push(' ' + force.name + ' now has ' + force.members + ' members');
  
  st.log.push('Week ' + st.week + ': Recruited for ' + force.name);
  
  return notes;
}

// Dzehurjaca Charge - Enhanced version using paramilitary system
function resolveDzehurjacaChargeEnhanced(st, rng) {
  var notes = [];
  
  if (!st.dzehurjacaAvailable) {
    notes.push(' The Dzehurjaca Charge is not available.');
    return { ok: false, notes: notes };
  }
  
  if (!st.paramilitaries) initParamilitaries(st);
  
  var dzehurjaca = st.paramilitaries.dzehurjaca;
  var wein = st.paramilitaries.wein_workers;
  var blackLegion = st.paramilitaries.black_legion;
  var redMilitia = st.paramilitaries.red_militia;
  var iiaGuard = st.paramilitaries.iia_guard;
  
  // Calculate alliance strength if Wein is allied
  var hasWeinAlliance = st.hasArbeiterAlly || false;
  var weinBonus = 0;
  
  if (hasWeinAlliance) {
    // Wein provides massive manpower but low quality
    // Their strength is mainly in numbers
    weinBonus = Math.floor(wein.members / 20); // 10000/20 = 500 strength from Wein
    notes.push('🌍 Arbeiter von Wein joins the charge! +' + weinBonus + ' strength from manpower!');
  }
  
  // Calculate Dzehurjaca's current strength
  var dzehurjacaStrength = calculateParamilitaryStrength(dzehurjaca);
  
  // Add Wein bonus if allied
  dzehurjacaStrength += weinBonus;
  
  // Calculate enemy strength (Black League + Red Militia if hostile)
  var enemyStrength = calculateParamilitaryStrength(blackLegion);
  
  // Red Front and Red Bench join Black League if relations are bad
  var redSupport = getPartySupport(st, 'red');
  var rbSupport = getPartySupport(st, 'rb');
  var redAffinity = st.affinity.red || 35;
  
  if (redAffinity < 30) {
    enemyStrength += calculateParamilitaryStrength(redMilitia) * 0.5;
    notes.push(' Red Militia joins the Black League against you!');
  }
  
  // IIA helps if relations are good
  var iiaAffinity = st.affinity.iia || 25;
  if (iiaAffinity > 60) {
    var iiaStrength = calculateParamilitaryStrength(iiaGuard) * 0.3;
    dzehurjacaStrength += iiaStrength;
    notes.push('💻 IIA Tech Guard supports the charge! +' + iiaStrength + ' strength');
  }
  
  // Random variation
  var dzehurjacaRoll = dzehurjacaStrength * (0.85 + rng() * 0.3);
  var enemyRoll = enemyStrength * (0.85 + rng() * 0.3);
  
  notes.push(' DZEHURJACA CHARGE!');
  notes.push(' Dzehurjaca strength: ' + Math.round(dzehurjacaStrength) + (hasWeinAlliance ? ' (with Wein!)' : ''));
  notes.push(' Enemy strength: ' + Math.round(enemyStrength));
  notes.push(' Success chance: ' + Math.round((dzehurjacaStrength / (dzehurjacaStrength + enemyStrength)) * 100) + '%');
  
  if (dzehurjacaRoll > enemyRoll) {
    // VICTORY!
    notes.push(' MIRACLE VICTORY!');
    notes.push('The Dzehurjaca Charge has succeeded! The enemies are routed!');
    
    // Massive victory effects
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 12);
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 15);
        st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) - 8);
        st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 8);
        st.raw.rb[dm.id] = Math.max(0.5, (st.raw.rb[dm.id] || 0) - 8);
      }
    }
    
    // Destroy enemy paramilitaries
    blackLegion.members = Math.floor(blackLegion.members * 0.2);
    blackLegion.morale = Math.max(10, blackLegion.morale - 40);
    blackLegion.equipment = Math.max(1, blackLegion.equipment - 3);
    
    if (redAffinity < 30) {
      redMilitia.members = Math.floor(redMilitia.members * 0.3);
      redMilitia.morale = Math.max(10, redMilitia.morale - 30);
    }
    
    // Dzehurjaca gains prestige
    dzehurjaca.members += 20;
    dzehurjaca.morale = Math.min(100, dzehurjaca.morale + 10);
    dzehurjaca.training = Math.min(10, dzehurjaca.training + 1);
    
    st.momentum = Math.min(20, st.momentum + 12);
    st.unity = Math.min(100, st.unity + 15);
    st.faculty = Math.min(100, st.faculty + 8);
    st.blNeutralized = true;
    st.girlRepublicDefeated = true;
    st.dzehurjacaAvailable = false;
    st.dzehurjacaCharged = true;
    
    notes.push('📈 ZMP +12%! BL -15%! Girl coalition -8%!');
    notes.push(' Black Legion decimated!');
    notes.push('💪 Dzehurjaca Legion strengthened!');
    notes.push(' DZEHURJACA CHARGE - LEGENDARY VICTORY!');
    st.log.push('Week ' + st.week + ': DZEHURJACA CHARGE - VICTORY with paramilitary system!');
    
    return { ok: true, outcome: 'victory', notes: notes };
  } else {
    // DEFEAT
    notes.push(' The Dzehurjaca Charge has failed.');
    notes.push('The enemies of democracy have won the battle.');
    
    // Massive defeat effects
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 15);
        st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 12);
      }
    }
    
    // Dzehurjaca decimated
    dzehurjaca.members = Math.floor(dzehurjaca.members * 0.3);
    dzehurjaca.morale = Math.max(10, dzehurjaca.morale - 40);
    dzehurjaca.equipment = Math.max(1, dzehurjaca.equipment - 3);
    
    // Enemy grows stronger
    blackLegion.members += 50;
    blackLegion.morale = Math.min(100, blackLegion.morale + 20);
    
    st.dzehurjacaAvailable = false;
    st.dzehurjacaCharged = true;
    st.gameOver = true;
    
    // Determine who wins
    if (enemyStrength > dzehurjacaStrength) {
      st.endingData = {
        ending: 'black_league_victory',
        title: 'THE BLACK LEAGUE VICTORY',
        subtitle: 'The charge failed. Darkness falls.',
        endingNumber: 'Ending 1',
        body: 'The Dzehurjaca Charge failed. The Black League has won.',
        story: 'Your heroic last stand was not enough. The Black League has crushed all opposition.',
        subending: 'Subending A - The Long Night',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>' +
          '<div class="stat"><span>ZMP Support</span><span class="v">' + Math.round(getPartySupport(st, 'ZMP')) + '%</span></div>' +
          '<div class="stat"><span>BL Support</span><span class="v">' + Math.round(getPartySupport(st, 'bl')) + '%</span></div>',
        epilogue: 'The Black League rules with an iron fist. The Dzehurjaca Legion is destroyed.'
      };
    } else {
      st.endingData = {
        ending: 'girl_republic',
        title: 'THE GIRL REPUBLIC VICTORY',
        subtitle: 'The charge failed. The girls have won.',
        endingNumber: 'Ending 5',
        body: 'The Dzehurjaca Charge failed. The Girl Republic has won.',
        story: 'Your heroic last stand was not enough. The Girl Republic has seized control.',
        subending: 'Subending E - The Girl Power Revolution',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'The Girl Republic rules the school.'
      };
    }
    st.finished = true;
    
    notes.push(' GAME OVER');
    notes.push(' Dzehurjaca Legion almost destroyed!');
    st.log.push('Week ' + st.week + ': DZEHURJACA CHARGE - FAILED');
    
    return { ok: false, outcome: 'defeat', notes: notes };
  }
}

// Paramilitary battle resolution
function resolveParamilitaryBattle(st, attackerId, defenderId, rng) {
  if (!st.paramilitaries) initParamilitaries(st);
  var notes = [];
  
  var attacker = st.paramilitaries[attackerId];
  var defender = st.paramilitaries[defenderId];
  
  if (!attacker || !defender) {
    notes.push('Paramilitary force not found.');
    return notes;
  }
  
  var attackerStrength = calculateParamilitaryStrength(attacker);
  var defenderStrength = calculateParamilitaryStrength(defender);
  
  // Random variation
  var attackerRoll = attackerStrength * (0.8 + rng() * 0.4);
  var defenderRoll = defenderStrength * (0.8 + rng() * 0.4);
  
  notes.push(' BATTLE: ' + attacker.name + ' vs ' + defender.name);
  notes.push(' ' + attacker.name + ' strength: ' + Math.round(attackerStrength));
  notes.push(' ' + defender.name + ' strength: ' + Math.round(defenderStrength));
  
  var attackerLosses = 0;
  var defenderLosses = 0;
  
  if (attackerRoll > defenderRoll) {
    notes.push(' ' + attacker.name + ' VICTORY!');
    
    // Attacker gains, defender loses
    attackerLosses = Math.floor(defender.members * 0.2);
    defenderLosses = Math.floor(defender.members * 0.4);
    
    attacker.members += Math.floor(defender.members * 0.1);
    attacker.morale = Math.min(100, attacker.morale + 5);
    defender.members = Math.max(0, defender.members - defenderLosses);
    defender.morale = Math.max(10, defender.morale - 15);
    
    notes.push('📈 ' + attacker.name + ' gains ' + Math.floor(defender.members * 0.1) + ' members');
    notes.push('📉 ' + defender.name + ' loses ' + defenderLosses + ' members');
    notes.push('📈 ' + attacker.name + ' morale +5%');
    notes.push('📉 ' + defender.name + ' morale -15%');
    
    st.log.push('Week ' + st.week + ': ' + attacker.name + ' defeated ' + defender.name + ' in battle');
    
  } else {
    notes.push(' ' + attacker.name + ' DEFEATED!');
    
    attackerLosses = Math.floor(attacker.members * 0.3);
    defenderLosses = Math.floor(defender.members * 0.1);
    
    attacker.members = Math.max(0, attacker.members - attackerLosses);
    attacker.morale = Math.max(10, attacker.morale - 15);
    defender.members += Math.floor(attacker.members * 0.05);
    defender.morale = Math.min(100, defender.morale + 5);
    
    notes.push('📉 ' + attacker.name + ' loses ' + attackerLosses + ' members');
    notes.push('📈 ' + defender.name + ' gains ' + Math.floor(attacker.members * 0.05) + ' members');
    notes.push('📉 ' + attacker.name + ' morale -15%');
    notes.push('📈 ' + defender.name + ' morale +5%');
    
    st.log.push('Week ' + st.week + ': ' + defender.name + ' defeated ' + attacker.name + ' in battle');
  }
  
  return notes;
}

function updatePartyAmbitions(st, rng) {
  if (!st.partyAmbitions) initPartyAmbitions(st);
  var system = st.partyAmbitions;
  var notes = [];
  
  // Update each party's ambition
  var parties = activeParties(st);
  parties.forEach(function(p) {
    if (p.id === 'ZMP' || p.id === 'other') return;
    
    var data = system.activeParties[p.id];
    if (!data) {
      system.activeParties[p.id] = {
        ambition: generateAmbition(st, p.id),
        progress: 0,
        completed: false,
        strength: 1 + Math.floor(getPartySupport(st, p.id) / 10),
        allies: [],
        rivals: [],
        lastAction: st.week
      };
      return;
    }
    
    // Update strength based on current support
    var support = getPartySupport(st, p.id);
    data.strength = Math.max(1, 1 + Math.floor(support / 10));
    
    // Check if ambition is complete
    if (!data.completed) {
      var complete = false;
      var ambition = data.ambition;
      
      if (ambition.target === 'support') {
        complete = support >= ambition.amount;
      } else if (ambition.target === 'strength') {
        complete = support >= ambition.amount;
      } else if (ambition.target === 'absorb') {
        // Check if party has absorbed someone
        complete = data.absorbedCount > 0;
      } else if (ambition.target === 'coalition') {
        // Check if party is in coalition with someone
        complete = data.coalitionCount > 0;
      } else if (ambition.target === 'undermine') {
        // Check if ZMP support has dropped
        var zmpSupport = getPartySupport(st, 'ZMP');
        complete = zmpSupport < (100 - ambition.amount);
      } else if (ambition.target === 'seats') {
        var seats = st.seats[p.id] || 0;
        complete = seats >= ambition.amount;
      } else if (ambition.target === 'demographic') {
        // Check if party beats ZMP in any demographic
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            var partyVal = st.raw[p.id] ? st.raw[p.id][dm.id] || 0 : 0;
            var zmpVal = st.raw.ZMP ? st.raw.ZMP[dm.id] || 0 : 0;
            if (partyVal > zmpVal) {
              complete = true;
              break;
            }
          }
        }
      }
      
      if (complete) {
        data.completed = true;
        data.completionWeek = st.week;
        system.completedAmbitions.push({
          party: p.id,
          ambition: ambition,
          week: st.week
        });
        
        // Apply reward (penalty to ZMP, bonus to party)
        if (ambition.reward) {
          // Penalty to ZMP
          if (ambition.reward.zmp) {
            if (D && D.DEMOS) {
              for (var i = 0; i < D.DEMOS.length; i++) {
                var dm = D.DEMOS[i];
                st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + ambition.reward.zmp);
              }
            }
          }
          // Bonus to the party
          if (ambition.reward.funds && st.raw[p.id]) {
            st.funds += ambition.reward.funds;
          }
          if (ambition.reward.volunteers) {
            st.volunteers += ambition.reward.volunteers;
          }
          if (ambition.reward.unity) {
            st.unity = Math.min(100, (st.unity || 0) + ambition.reward.unity);
          }
          if (ambition.reward.momentum) {
            st.momentum = Math.min(20, (st.momentum || 0) + ambition.reward.momentum);
          }
          if (ambition.reward.faculty) {
            st.faculty = Math.min(100, (st.faculty || 0) + ambition.reward.faculty);
          }
          
          notes.push(' ' + (p.short || p.id) + ' completed ambition: ' + ambition.name + '!');
          notes.push('📉 ZMP ' + (ambition.reward.zmp || 0) + '%');
          
          // Party gains support for completing ambition
          if (D && D.DEMOS) {
            for (var i = 0; i < D.DEMOS.length; i++) {
              var dm = D.DEMOS[i];
              if (st.raw[p.id]) {
                st.raw[p.id][dm.id] = Math.max(0.5, (st.raw[p.id][dm.id] || 0) + 2);
              }
            }
          }
          
          st.log.push('Week ' + st.week + ': ' + p.id + ' completed ambition: ' + ambition.name);
        }
        
        // Generate new ambition
        data.ambition = generateAmbition(st, p.id);
        data.progress = 0;
        data.completed = false;
      }
    }
    
    // Random actions for parties
    if (rng() < 0.08 && !data.completed) {
      // Party takes action to progress ambition
      var actionResult = partyTakeAction(st, p.id, data, rng);
      if (actionResult.notes) {
        notes.push(actionResult.notes);
      }
    }
    
    // Check if party becomes dominant
    if (support > 20 && system.dominantParty !== p.id) {
      system.dominantParty = p.id;
      notes.push('⚡ ' + (p.short || p.id) + ' has become a DOMINANT party with ' + Math.round(support) + '% support!');
      notes.push('💡 They will actively challenge the ZMP for control.');
      st.log.push('Week ' + st.week + ': ' + p.id + ' becomes dominant');
    }
    
    // Update allies and rivals
    updatePartyRelationships(st, p.id, data, rng);
  });
  
  // Check for competition level
  var zmpSupport = getPartySupport(st, 'ZMP');
  var maxOther = 0;
  for (var pid in system.activeParties) {
    var s = getPartySupport(st, pid);
    if (s > maxOther) maxOther = s;
  }
  
  system.partyCompetition = zmpSupport > 0 ? Math.round((maxOther / zmpSupport) * 100) : 0;
  
  return notes;
}

function partyTakeAction(st, partyId, data, rng) {
  var notes = '';
  var support = getPartySupport(st, partyId);
  var ambition = data.ambition;
  
  // Different actions based on ambition
  var actionTypes = [
    'campaign',
    'attack_zmp',
    'recruit',
    'coalition_offer',
    'policy_push',
    'rally'
  ];
  
  var action = actionTypes[Math.floor(rng() * actionTypes.length)];
  
  // Check if action is appropriate
  if (action === 'campaign') {
    // Boost own support
    if (D && D.DEMOS) {
      var dmIdx = Math.floor(rng() * D.DEMOS.length);
      var dm = D.DEMOS[dmIdx];
      if (st.raw[partyId]) {
        st.raw[partyId][dm.id] = Math.max(0.5, (st.raw[partyId][dm.id] || 0) + 1.5);
        notes = ' ' + (partyId.toUpperCase()) + ' is campaigning in ' + dm.name + '!';
      }
    }
  } else if (action === 'attack_zmp') {
    // Attack ZMP
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (st.raw.ZMP) {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 0.5);
        }
        if (st.raw[partyId]) {
          st.raw[partyId][dm.id] = Math.max(0.5, (st.raw[partyId][dm.id] || 0) + 0.5);
        }
      }
      notes = ' ' + (partyId.toUpperCase()) + ' launched an attack on ZMP!';
    }
  } else if (action === 'recruit') {
    // Recruit volunteers
    data.strength = Math.min(10, data.strength + 1);
    notes = ' ' + (partyId.toUpperCase()) + ' is recruiting new members!';
  } else if (action === 'coalition_offer') {
    // Try to form coalition with another party
    var parties = activeParties(st);
    var target = null;
    for (var i = 0; i < parties.length; i++) {
      var p = parties[i];
      if (p.id !== partyId && p.id !== 'ZMP' && p.id !== 'other') {
        if (rng() < 0.3) {
          target = p;
          break;
        }
      }
    }
    if (target) {
      data.coalitionCount = (data.coalitionCount || 0) + 1;
      if (!data.allies) data.allies = [];
      data.allies.push(target.id);
      notes = ' ' + (partyId.toUpperCase()) + ' formed a coalition with ' + target.short + '!';
      // Boost both parties
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          if (st.raw[partyId]) st.raw[partyId][dm.id] = Math.max(0.5, (st.raw[partyId][dm.id] || 0) + 1);
          if (st.raw[target.id]) st.raw[target.id][dm.id] = Math.max(0.5, (st.raw[target.id][dm.id] || 0) + 1);
        }
      }
    }
  } else if (action === 'policy_push') {
    // Push a policy that benefits them
    if (D && D.DEMOS) {
      var demos = ['athletes', 'honor', 'gamers', 'arts', 'freshmen', 'seniors', 'buskids'];
      var targetDemo = demos[Math.floor(rng() * demos.length)];
      if (st.raw[partyId]) {
        st.raw[partyId][targetDemo] = Math.max(0.5, (st.raw[partyId][targetDemo] || 0) + 2);
        notes = '📋 ' + (partyId.toUpperCase()) + ' is pushing a policy for ' + targetDemo + '!';
      }
    }
  } else if (action === 'rally') {
    // Hold a rally
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        if (st.raw[partyId]) {
          st.raw[partyId][dm.id] = Math.max(0.5, (st.raw[partyId][dm.id] || 0) + 0.5);
        }
      }
      notes = ' ' + (partyId.toUpperCase()) + ' held a massive rally!';
    }
  }
  
  return { notes: notes };
}

function updatePartyRelationships(st, partyId, data, rng) {
  // Update rivals - parties that compete for same demographics
  var parties = activeParties(st);
  parties.forEach(function(p) {
    if (p.id === partyId || p.id === 'ZMP' || p.id === 'other') return;
    
    var support1 = getPartySupport(st, partyId);
    var support2 = getPartySupport(st, p.id);
    
    // If parties are competing for support, they become rivals
    if (Math.abs(support1 - support2) < 5 && support1 > 5 && support2 > 5) {
      if (!data.rivals) data.rivals = [];
      if (data.rivals.indexOf(p.id) === -1) {
        data.rivals.push(p.id);
      }
    }
  });
}

  /* ---------------- Cabinet Formation ---------------- */
  function formCabinet(st, coalitionPartners) {
    var cabinet = {};
    var agreement = {};
    var approval = {};
    var satisfaction = {};
    
    var ministries = [
      { id: 'finance', name: 'Finance', icon: '', desc: 'Controls school budget and funding.' },
      { id: 'education', name: 'Education', icon: '', desc: 'Oversees curriculum and teaching.' },
      { id: 'justice', name: 'Justice', icon: '', desc: 'Manages discipline and council rules.' },
      { id: 'technology', name: 'Technology', icon: '', desc: 'Handles IT, wifi, and labs.' },
      { id: 'health', name: 'Health & Welfare', icon: '', desc: 'Manages healthcare and student welfare.' },
      { id: 'sports', name: 'Sports & Recreation', icon: '', desc: 'Oversees athletics and gym.' },
      { id: 'arts', name: 'Arts & Culture', icon: '', desc: 'Manages drama, music, and arts.' },
      { id: 'infrastructure', name: 'Infrastructure', icon: '', desc: 'Handles buildings and facilities.' }
    ];
    
    for (var i = 0; i < ministries.length; i++) {
      var m = ministries[i];
      cabinet[m.id] = {
        ministry: m.id,
        name: m.name,
        icon: m.icon,
        desc: m.desc,
        party: getPlayerPartyId(st),
        minister: 'Vacant',
        ministerId: null,
        faction: 'none',
        approval: 50,
        actions: getMinistryActions(st, m.id, 'ZMP')
      };
    }
    
    st.cabinet = cabinet;
    st.coalitionAgreement = agreement;
    st.ministerApproval = approval;
    st.coalitionPartnerSatisfaction = satisfaction;
    
    return { cabinet: cabinet, agreement: agreement };
  }

  /* ---------------- Minister Selection Functions ---------------- */
  function getAvailableMinisters(st) {
    var factionMap = {
      'secularists': 'secularists',
      'securro':     'securro',
      'zalgrilian':  'zalgrilian',
      'jihadists':   'jihadists'
    };
    
    var playerFaction = factionMap[st.faction] || 'zalgrilian';
    var allMinisters = [];
    
    for (var f in AVAILABLE_MINISTERS) {
      var isPlayerFaction = (f === playerFaction);
      var ministers = AVAILABLE_MINISTERS[f];
      
      for (var i = 0; i < ministers.length; i++) {
        var available = false;
        
        if (isPlayerFaction) {
          available = true;
        } else {
          var factionSupport = getFactionSupport(st, f);
          if (factionSupport > 15) {
            available = true;
          }
        }
        
        if (available) {
          allMinisters.push(ministers[i]);
        }
      }
    }
    
    return allMinisters;
  }

  function getFactionSupport(st, faction) {
    var active = activeParties(st);
    var total = 0;
    var count = 0;
    
    for (var i = 0; i < active.length; i++) {
      var p = active[i];
      var support = getPartySupport(st, p.id);
      
      if (faction === 'zalgrilianist' && (p.id === 'semp' || p.id === 'pl')) {
        total += support;
        count++;
      } else if (faction === 'gamers' && (p.id === 'iia' || p.id === 'tiia')) {
        total += support;
        count++;
      } else if (faction === 'girls' && (p.id === 'red' || p.id === 'rb' || p.id === 'pl')) {
        total += support;
        count++;
      } else if (faction === 'loyalists' && (p.id === 'zpf' || p.id === 'republia')) {
        total += support;
        count++;
      }
    }
    
    return count > 0 ? total / count : 0;
  }

  function calculateMinistryAllocation(st, coalitionPartners, playerSeats) {
    var totalSeats = playerSeats;
    var partnerSeats = {};
    
    for (var i = 0; i < coalitionPartners.length; i++) {
      var pid = coalitionPartners[i];
      var seats = st.seats[pid] || 0;
      partnerSeats[pid] = seats;
      totalSeats += seats;
    }
    
    var totalMinistries = 8;
    var playerMinistries = Math.max(2, Math.round((playerSeats / (totalSeats || 1)) * totalMinistries));
    playerMinistries = Math.min(6, playerMinistries); // ZMP max 6
    
    var allocation = {
      player: playerMinistries,
      partners: {}
    };
    
    var remainingMinistries = totalMinistries - playerMinistries;
    
    if (coalitionPartners.length > 0 && remainingMinistries > 0) {
      // Sort partners by seats so the biggest parties get the limited remaining posts
      var sortedPartners = Object.keys(partnerSeats).sort(function(a, b) {
        return partnerSeats[b] - partnerSeats[a];
      });
      
      for (var i = 0; i < sortedPartners.length; i++) {
        if (remainingMinistries <= 0) break;
        allocation.partners[sortedPartners[i]] = 1;
        remainingMinistries--;
      }
    }
    
    return allocation;
  }

  function getMinistryActions(st, ministryId, party) {
    var actions = [];
    
    switch(ministryId) {
      case 'finance':
        actions = [
          { 
            id: 'budget_crisis', name: 'Address the Budget Deficit', desc: 'The treasury is running dry. The council must decide how to balance the books.', 
            cost: { ap: 2, budget: 0 },
            options: [
              { id: 'activity_fee', text: 'Implement an Annual Activity Fee', desc: 'Require every student to pay a small fee to participate in extracurriculars. It will fund the council, but the working-class students will feel the squeeze.', effects: { funds: 30, party: { bl: 4, ZMP: -1 }, unity: -2 } },
              { id: 'defund_arts', text: 'Cut Funding for Non-Essential Clubs', desc: 'Slash the budgets for drama, chess, and the arts. The faculty will be furious, and the cultural elite will protest, but the math works.', effects: { funds: 25, faculty: -10, party: { bl: 2, ZMP: -2 } }, reaction: { partyId: 'pl', text: "The Pep League stages a walkout, decrying the death of culture.", supportDelta: 3 } },
              { id: 'sponsorship', text: 'Seek Corporate Sponsorships', desc: 'Allow local businesses to put their logos on the bleachers and vending machines. It brings in cash without taxing students, but the purists will call it selling out.', effects: { funds: 20, momentum: -2, party: { bl: 1 } }, reaction: { partyId: 'red', text: "The Red Front denounces the council as sellouts to corporate interests.", supportDelta: 2 } }
            ]
          },
          { 
            id: 'club_funding', name: 'Reform Club Funding', desc: 'The current system for funding student organizations is a mess. Propose a new model.', 
            cost: { ap: 1, budget: 0 },
            options: [
              { id: 'merit_based', text: 'Merit-Based Funding', desc: 'Award funding only to clubs that demonstrate academic value and good organization. The honors students will love it. The niche clubs will wither.', effects: { faculty: 4, demo: { honor: 4, gamers: -3, arts: -3 } }, reaction: { partyId: 'iia', text: "The IIA argues that this is an unscientific and arbitrary way to allocate resources.", supportDelta: 2 } },
              { id: 'equal_funding', text: 'Universal Flat Funding', desc: 'Every club gets the exact same budget, regardless of size or purpose. It is fair on paper, but it means no one gets enough.', effects: { unity: 3, demo: { arts: 2, gamers: 2, honor: -2 } }, reaction: { partyId: 'zpf', text: "The Centre Party warns that flat funding rewards mediocrity.", supportDelta: 2 } }
            ]
          }
        ];
        break;
        
      case 'justice':
        actions = [
          { 
            id: 'bl_crackdown', name: 'Address the Black League', desc: 'The Black League is holding unsanctioned rallies. You must respond.', 
            cost: { ap: 2, budget: 10 },
            options: [
              { id: 'student_court', text: 'Refer Them to the Student Court', desc: 'Charge their leaders with violating the club charter. It is slow, legal, and transparent. The faculty will respect the process.', effects: { party: { bl: -3, ZMP: 2 }, faculty: 5, unity: 2 }, reaction: { partyId: 'zpf', text: "The Centre Party commends the council for respecting due process.", supportDelta: 2 } },
              { id: 'ban_them', text: 'Executive Ban', desc: 'Declare the League an illegal organization and use the security office to break up their meetings. It will look strong, but they will go underground and grow angrier.', effects: { party: { bl: -8, ZMP: -2 }, unity: -4, faculty: -5, blGrowthSlow: -2 }, reaction: { partyId: 'bl', text: "The Black League declares itself the victim of a tyrannical government.", supportDelta: 3 } }
            ]
          },
          { 
            id: 'hallway_discipline', name: 'Hallway Discipline', desc: 'Teachers are complaining about students loitering during class hours.', 
            cost: { ap: 1, budget: 0 },
            options: [
              { id: 'strict_passes', text: 'Enforce Strict Hall Passes', desc: 'Give teachers the authority to stop and question any student in the hall. It will restore order, but the students will feel like they are in a prison.', effects: { faculty: 6, unity: -4, party: { bl: 3 } }, reaction: { partyId: 'red', text: "The Red Front leads a protest in the cafeteria, calling the passes 'chains for the working class'.", supportDelta: 3 } },
              { id: 'open_campus', text: 'Relax the Rules', desc: 'Trust the students to manage their own time. The faculty will object, but the students will appreciate the freedom.', effects: { faculty: -4, unity: 3, demo: { freshmen: 3, seniors: 3 } }, reaction: { partyId: 'iia', text: "The IIA releases a statement supporting student autonomy and self-regulation.", supportDelta: 2 } }
            ]
          }
        ];
        break;

      case 'sports':
        actions = [
          { 
            id: 'schedule_reform', name: 'Adjust the Daily Schedule', desc: 'The faculty is reviewing the daily bell schedule.', 
            cost: { ap: 2, budget: 0 },
            options: [
              { id: 'longer_breaks', text: 'Lengthen Morning Break and Study Hall', desc: 'Give students more time to decompress and socialize between classes. A traditional, measured approach to the school day.', effects: { unity: 3, faculty: 2, demo: { honor: 2 } }, reaction: { partyId: 'zpf', text: "The Centre Party strongly supports the return to a traditional, less frantic schedule.", supportDelta: 3 } },
              { id: 'more_pe', text: 'Expand Physical Education and Recess', desc: 'Double the amount of required gym time. It will get the blood pumping, but the honors students will complain about lost study time.', effects: { demo: { athletes: 5, honor: -3 } }, reaction: { partyId: 'sportica', text: "Sportica celebrates the victory for student health and athletic excellence.", supportDelta: 3 } }
            ]
          }
        ];
        break;

      case 'technology':
        actions = [
          { 
            id: 'internet_regulation', name: 'Regulate Student Internet Use', desc: 'The school board is debating how to handle the new Wi-Fi network.', 
            cost: { ap: 1, budget: 0 },
            options: [
              { id: 'strict_filters', text: 'Install Strict Content Filters', desc: 'Block all gaming, streaming, and social media sites during school hours. The faculty insists this is necessary for academic focus.', effects: { faculty: 5, demo: { gamers: -5, arts: -2 } }, reaction: { partyId: 'iia', text: "The IIA condemns the Luddite policies, warning of a digital divide.", supportDelta: 3 } },
              { id: 'open_access', text: 'Open the Network to All', desc: 'Trust the students to manage their own distractions. It will make the labs happy, but the teachers will be furious.', effects: { faculty: -6, demo: { gamers: 6 } }, reaction: { partyId: 'zpf', text: "The Centre Party warns that this will destroy the moral fabric of the school.", supportDelta: 2 } }
            ]
          }
        ];
        break;

      case 'health':
        actions = [
          { 
            id: 'cafeteria_menu', name: 'Reform the Cafeteria Menu', desc: 'The cafeteria budget must be finalized for the term.', 
            cost: { ap: 1, budget: 0 },
            options: [
              { id: 'healthy_options', text: 'Introduce Healthier, Locally Sourced Meals', desc: 'Salads, fruits, and sugar-free alternatives. It will please the faculty and health advocates, but the students will miss the pizza.', effects: { faculty: 5, demo: { buskids: -3, athletes: 2 } }, reaction: { partyId: 'rb', text: "The Red Bench launches a 'Free Pizza' campaign in protest.", supportDelta: 4 } },
              { id: 'junk_food', text: 'Keep the Pizza and Fries', desc: 'The students love it. It keeps morale high, but the nutritionists and faculty will file complaints.', effects: { faculty: -4, demo: { buskids: 4, gamers: 3 } }, reaction: { partyId: 'zpf', text: "The Centre Party demands that the council take public health seriously.", supportDelta: 2 } }
            ]
          }
        ];
        break;

      case 'infrastructure':
        actions = [
          { 
            id: 'gym_roof', name: 'The Gym Roof Crisis', desc: 'The gym roof is leaking. It is only a matter of time before it collapses.', 
            cost: { ap: 2, budget: 0 },
            options: [
              { id: 'full_repair', text: 'Authorize Full Repairs', desc: 'Spend the money to fix it properly. It will drain the treasury, but it secures the safety of the students.', effects: { funds: -30, faculty: 4, demo: { athletes: 4 } }, reaction: { partyId: 'sportica', text: "Sportica thanks the council for prioritizing student safety.", supportDelta: 3 } },
              { id: 'buckets', text: 'Put Out Buckets and Ignore It', desc: 'Save the money. It looks terrible, and the gym is unusable during rain, but the treasury stays full.', effects: { funds: 15, faculty: -5, demo: { athletes: -4 } }, reaction: { partyId: 'sportica', text: "Sportica accuses the ZMP of letting the school rot.", supportDelta: 3 } }
            ]
          }
        ];
        break;

      case 'arts':
        actions = [
          { 
            id: 'spring_musical', name: 'The Spring Musical Budget', desc: 'The Drama Club has submitted a massive budget request for the spring musical.', 
            cost: { ap: 1, budget: 0 },
            options: [
              { id: 'fund_musical', text: 'Fund the Musical Lavishly', desc: 'Give them the money for sets, costumes, and lights. The arts crowd will be thrilled, but the money has to come from somewhere.', effects: { funds: -20, demo: { arts: 6, gamers: 1 } }, reaction: { partyId: 'pl', text: "The Pep League pledges to volunteer as ushers, praising the council's cultural vision.", supportDelta: 3 } },
              { id: 'cancel_musical', text: 'Cancel the Musical', desc: 'The budget cannot bear it. The students will be heartbroken, but it is the fiscally responsible choice.', effects: { funds: 10, faculty: 3, demo: { arts: -6 } }, reaction: { partyId: 'pl', text: "The Pep League protests outside the council chamber, calling the ZMP philistines.", supportDelta: 4 } }
            ]
          }
        ];
        break;
        
      default:
        actions = [
          { 
            id: 'standard_reform', name: 'Minor Improvements', desc: 'Address the daily complaints of the students.', 
            cost: { ap: 1, budget: 10 },
            options: [
              { id: 'listen', text: 'Hold an Open Forum', desc: 'Listen to the students directly.', effects: { unity: 3, party: { bl: -1 } } },
              { id: 'ignore', text: 'Let the Bureaucracy Handle It', desc: 'Pass it to the sub-committee.', effects: { momentum: -1, party: { bl: 1 } } }
            ]
          }
        ];
        break;
    }
    
    return actions;
  }

  /* ---------------- Presidential Government Actions ---------------- */
  var PRESIDENTIAL_ACTIONS = [
    { id: 'call_election', name: 'Call Early Election', desc: 'Dissolve the council and call new elections immediately.', effect: { immediateElection: true } },
    { id: 'emergency_decrees', name: 'Sign Emergency Decrees', desc: 'Bypass the council with executive orders. +10% ZMP, -15% faculty, -5% unity.', effect: { zmp: 10, faculty: -15, unity: -5 } },
    { id: 'foreign_mission', name: 'Foreign Diplomatic Mission', desc: 'Send envoys to gain foreign support. +15% funds, +5% ZMP.', effect: { funds: 15, zmp: 5 } },
    { id: 'purge_opposition', name: 'Purge Opposition', desc: 'Remove hostile elements from the council. -10% BL, -5% ZPF, +3% ZMP.', effect: { bl: -10, zpf: -5, zmp: 3 } },
    { id: 'state_of_emergency', name: 'Declare State of Emergency', desc: 'Take emergency powers. +8% ZMP, -20% faculty, -10% unity.', effect: { zmp: 8, faculty: -20, unity: -10 } },
    { id: 'appoint_cabinet', name: '👥 Appoint Cabinet', desc: 'Appoint your own cabinet. +5% ZMP, +3% faculty.', effect: { zmp: 5, faculty: 3 } },
    { id: 'veto_bill', name: ' Veto Bill', desc: 'Veto a legislature bill. -5% ZMP, +10% faculty.', effect: { zmp: -5, faculty: 10 } },
    { id: 'executive_order', name: '📜 Executive Order', desc: 'Issue an executive order on education. +4% ZMP, +5% honor.', effect: { zmp: 4, honor: 5 } }
  ];

  function drawPresidentialCard(st, rng) {
    if (!st.hasPresident) {
      return { ok: false, msg: 'No president elected!' };
    }
    
    var card = PRESIDENTIAL_ACTIONS[Math.floor(rng() * PRESIDENTIAL_ACTIONS.length)];
    return { ok: true, card: card };
  }

  function executePresidentialAction(st, actionId, rng) {
    var notes = [];
    var action = PRESIDENTIAL_ACTIONS.find(function(a) { return a.id === actionId; });
    if (!action) {
      notes.push('Action not found.');
      return notes;
    }
    
    if (action.effect) {
      if (action.effect.immediateElection) {
        notes.push('🗳️ Early election called!');
        st.pendingEvent = {
          id: 'early_election_' + st.week,
          week: st.week,
          title: '🗳️ EARLY ELECTION!',
          body: 'The President has dissolved the council. New elections will be held immediately!',
          isElection: true,
          choices: []
        };
      }
      if (action.effect.zmp) {
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + action.effect.zmp);
          }
        }
        notes.push(  (action.effect.zmp >= 0 ? '+' : '') + action.effect.zmp + '%');
      }
      if (action.effect.unity) st.unity = clamp(st.unity + action.effect.unity, 0, 100);
      if (action.effect.faculty) st.faculty = clamp(st.faculty + action.effect.faculty, 0, 100);
      if (action.effect.funds) st.funds = Math.max(0, st.funds + action.effect.funds);
      if (action.effect.bl) {
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + action.effect.bl);
          }
        }
        notes.push(+ (action.effect.bl >= 0 ? '+' : '') + action.effect.bl + '%');
      }
      if (action.effect.zpf) {
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + action.effect.zpf);
          }
        }
        notes.push('📈 ZPF ' + (action.effect.zpf >= 0 ? '+' : '') + action.effect.zpf + '%');
      }
    }
    
    st.log.push('Week ' + st.week + ': Presidential action - ' + action.name);
    notes.push(' ' + action.name + ' completed.');
    
    return notes;
  }

  function canCallElection(st) {
    return st.hasPresident && st.week >= 25;
  }

  /* ---------------- Cabinet Actions ---------------- */
  function executeCabinetAction(st, ministryId, actionId, optionId, rng) {
    var notes = [];
    var cabinet = st.cabinet;
    if (!cabinet || !cabinet[ministryId]) return ['Ministry not found.'];
    
    var ministry = cabinet[ministryId];
    var action = ministry.actions.find(function(a) { return a.id === actionId; });
    if (!action) return ['Action not found.'];
    
    var option = action.options.find(function(o) { return o.id === optionId; });
    if (!option) return ['Invalid policy option.'];
    
    if (action.cost) {
      if (action.cost.ap && st.ap < action.cost.ap) return ['Not enough Action Points.'];
      if (action.cost.budget && st.funds < action.cost.budget) return ['Not enough Funds.'];
      st.ap -= action.cost.ap || 0;
      st.funds -= action.cost.budget || 0;
    }
    
    if (option.effects) {
      applyEffects(st, option.effects, rng);
    }

    // ==========================================
    // THE PROPHECY OF THE TEN WALLS
    // ==========================================
    if (ministryId === 'justice' && (actionId === 'bl_crackdown' || actionId === 'investigate_bl' || actionId === 'ban_them')) {
      if (!st.blFactions) st.blFactions = { traditionalists: 50, cultists: 50 };
      if (!st.prophecy) st.prophecy = { active: false, wallsBroken: 0, warned: false, halted: false };

      // Suppression strengthens the cultists
      st.blFactions.traditionalists = Math.max(0, st.blFactions.traditionalists - 15);
      st.blFactions.cultists = Math.min(100, st.blFactions.cultists + 15);

      // If cultists take over, activate the prophecy
      if (!st.prophecy.active && st.blFactions.cultists >= 70 && !st.prophecy.halted) {
        st.prophecy.active = true;
        st.pendingEvent = {
          id: 'prophecy_awakening',
          title: 'The Ashen Cult',
          body: 'The Traditionalists in the Black League have been purged. The Cultists now control the remnants. They no longer care about seats or policy. They speak only of the "Ten Walls" and the "Green Tyrants".',
          choices: [{ text: 'They are just fanatics. Ignore them.', note: '' }]
        };
      } 
      // If already active, break the next wall
      else if (st.prophecy.active && !st.prophecy.halted) {
        st.prophecy.wallsBroken += 1;
        triggerProphecyWall(st);
      }
    }



    // Handle the specific AI party reaction
    if (option.reaction) {
        var p = option.reaction.partyId;
        var delta = option.reaction.supportDelta;
        
        // Apply support change to the reacting party
        if (D && D.DEMOS) {
            for (var i = 0; i < D.DEMOS.length; i++) {
                var dm = D.DEMOS[i];
                if (st.raw[p]) {
                    st.raw[p][dm.id] = Math.max(0.5, (st.raw[p][dm.id] || 0) + delta);
                }
            }
        }
        notes.push(option.reaction.text);
    }
    
    // Generate realistic narrative based on the effects object
    if (option.effects.funds > 0) notes.push("The treasury swells with the new revenue, though the decision is controversial.");
    if (option.effects.funds < 0) notes.push("Funds are allocated, straining the council's budget.");
    
    if (option.effects.party && option.effects.party.bl > 0 && (!option.reaction || option.reaction.partyId !== 'bl')) {
        notes.push("The Black League seizes upon the news, distributing pamphlets in the hallways and gaining new recruits.");
    }
    
    if (option.effects.faculty > 0) notes.push("The faculty senate expresses its approval of the administration's direction.");
    if (option.effects.faculty < 0) notes.push("Teachers voice their frustration in the staff room, threatening to withdraw support.");
    
    if (option.effects.unity > 0) notes.push("Party unity is strengthened by the decisive action.");
    if (option.effects.unity < 0) notes.push("The decision has caused fractures within the council coalition.");
    
    if (option.effects.momentum > 0) notes.push("The council appears strong and active.");
    if (option.effects.momentum < 0) notes.push("The council's momentum has stalled.");

    if (notes.length === 0) {
      notes.push("The directive is issued. The school adjusts to the new reality.");
    }
    
    st.log.push('Week ' + st.week + ': ' + ministry.name + ' - ' + option.text);
    
    if (st.ministerApproval) {
      var party = ministry.party;
      if (st.ministerApproval[party] !== undefined) {
        st.ministerApproval[party] = Math.min(100, st.ministerApproval[party] + 5);
      }
    }
    
    return notes;
  }

  function resolvePartyResurgence(st, choice, rng) {
    var notes = [];
    var zmpSupport = getPartySupport(st, 'ZMP');
    
    var targetParty = null;
    var eatAmount = 0;
    var partyName = '';
    var partyId = '';
    
    if (choice === 'coopt_red' || choice === 'crush_red' || choice === 'ignore_red') {
      targetParty = 'red';
      partyName = 'Red Front';
      partyId = 'red';
      if (choice === 'coopt_red') eatAmount = 0.06 + rng() * 0.04;
      else if (choice === 'crush_red') eatAmount = 0.10 + rng() * 0.06;
      else eatAmount = 0.16 + rng() * 0.08;
    } else if (choice === 'coopt_iia' || choice === 'crush_iia' || choice === 'ignore_iia') {
      targetParty = 'iia';
      partyName = 'IIA';
      partyId = 'iia';
      if (choice === 'coopt_iia') eatAmount = 0.06 + rng() * 0.02;
      else if (choice === 'crush_iia') eatAmount = 0.08 + rng() * 0.04;
      else eatAmount = 0.14 + rng() * 0.06;
    } else if (choice === 'coopt_zpf' || choice === 'crush_zpf' || choice === 'ignore_zpf') {
      targetParty = 'zpf';
      partyName = 'ZPF';
      partyId = 'zpf';
      if (choice === 'coopt_zpf') eatAmount = 0.04 + rng() * 0.04;
      else if (choice === 'crush_zpf') eatAmount = 0.08 + rng() * 0.06;
      else eatAmount = 0.12 + rng() * 0.06;
    } else if (choice === 'coopt_semp' || choice === 'crush_semp' || choice === 'ignore_semp') {
      targetParty = 'semp';
      partyName = 'SEMP';
      partyId = 'semp';
      if (choice === 'coopt_semp') eatAmount = 0.06 + rng() * 0.04;
      else if (choice === 'crush_semp') eatAmount = 0.10 + rng() * 0.06;
      else eatAmount = 0.16 + rng() * 0.08;
    } else if (choice === 'coopt_republia' || choice === 'crush_republia' || choice === 'ignore_republia') {
      targetParty = 'republia';
      partyName = 'Republicans';
      partyId = 'republia';
      if (choice === 'coopt_republia') eatAmount = 0.08 + rng() * 0.04;
      else if (choice === 'crush_republia') eatAmount = 0.10 + rng() * 0.06;
      else eatAmount = 0.18 + rng() * 0.08;
    } else if (choice === 'coopt_sportica' || choice === 'crush_sportica' || choice === 'ignore_sportica') {
      targetParty = 'sportica';
      partyName = 'Sportica';
      partyId = 'sportica';
      if (choice === 'coopt_sportica') eatAmount = 0.06 + rng() * 0.02;
      else if (choice === 'crush_sportica') eatAmount = 0.08 + rng() * 0.06;
      else eatAmount = 0.12 + rng() * 0.08;
    } else if (choice === 'coopt_pl' || choice === 'crush_pl' || choice === 'ignore_pl') {
      targetParty = 'pl';
      partyName = 'Pep League';
      partyId = 'pl';
      if (choice === 'coopt_pl') eatAmount = 0.04 + rng() * 0.02;
      else if (choice === 'crush_pl') eatAmount = 0.08 + rng() * 0.04;
      else eatAmount = 0.10 + rng() * 0.06;
    } else if (choice === 'coopt_rb' || choice === 'crush_rb' || choice === 'ignore_rb') {
      targetParty = 'rb';
      partyName = 'Red Bench';
      partyId = 'rb';
      if (choice === 'coopt_rb') eatAmount = 0.06 + rng() * 0.04;
      else if (choice === 'crush_rb') eatAmount = 0.10 + rng() * 0.06;
      else eatAmount = 0.14 + rng() * 0.08;
    }
    
    if (!targetParty || !st.raw[targetParty]) {
      notes.push('The ' + partyName + ' is not active right now.');
      return notes;
    }
    
    var strategy = choice.split('_')[0];
    
    if (strategy === 'coopt') {
      notes.push(' You co-opt the ' + partyName + '\'s demands. You lose a devastating ' + Math.round(eatAmount * 100) + '% of your support to them!');
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * 0.7;
          st.raw[targetParty][dm.id] = Math.max(0.5, (st.raw[targetParty][dm.id] || 0) + transfer);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
        }
      }
      
      st.relations[targetParty] = clamp((st.relations[targetParty] || 50) + 3, 0, 100);
      st.affinity[targetParty] = clamp((st.affinity[targetParty] || 50) + 3, 0, 100);
      st.unity = clamp(st.unity - 2, 0, 100);
      st.momentum = clamp((st.momentum || 0) - 2, -10, 20);
      
    } else if (strategy === 'crush') {
      notes.push(' You crush the ' + partyName + '. You lose a massive ' + Math.round(eatAmount * 100) + '% of your support to them! Faculty approves.');
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * 0.8;
          st.raw[targetParty][dm.id] = Math.max(0.5, (st.raw[targetParty][dm.id] || 0) + transfer);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
        }
      }
      
      st.relations[targetParty] = clamp((st.relations[targetParty] || 50) - 12, 0, 100);
      st.affinity[targetParty] = clamp((st.affinity[targetParty] || 50) - 10, 0, 100);
      st.faculty = clamp(st.faculty + 5, 0, 100);
      st.unity = clamp(st.unity - 4, 0, 100);
      st.momentum = clamp((st.momentum || 0) - 3, -10, 20);
      
    } else {
      notes.push('😤 You ignore the ' + partyName + '. You lose a catastrophic ' + Math.round(eatAmount * 100) + '% of your support to them! They grow massively stronger.');
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          var transfer = (st.raw.ZMP[dm.id] || 0) * eatAmount * 0.9;
          st.raw[targetParty][dm.id] = Math.max(0.5, (st.raw[targetParty][dm.id] || 0) + transfer);
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - transfer);
        }
      }
      
      st.relations[targetParty] = clamp((st.relations[targetParty] || 50) - 8, 0, 100);
      st.affinity[targetParty] = clamp((st.affinity[targetParty] || 50) - 5, 0, 100);
      st.unity = clamp(st.unity - 6, 0, 100);
      st.momentum = clamp((st.momentum || 0) - 5, -10, 20);
    }
    
    var triggerMap = {
      'red': 'redResurgenceTriggered',
      'iia': 'iiaRevivalTriggered',
      'zpf': 'zpfRebirthTriggered',
      'semp': 'sempSurgeTriggered',
      'republia': 'republiaRisingTriggered',
      'sportica': 'sporticaChallengeTriggered',
      'pl': 'plPepTriggered',
      'rb': 'rbLunchTriggered'
    };
    if (triggerMap[targetParty]) {
      st[triggerMap[targetParty]] = true;
    }
    
    var newZmpSupport = getPartySupport(st, 'ZMP');
    notes.push(' Your support plummeted from ' + Math.round(zmpSupport) + '% to ' + Math.round(newZmpSupport) + '%!');
    st.log.push('Week ' + st.week + ': ' + partyName + ' resurgence - ' + strategy + ' (lost ' + Math.round(eatAmount * 100) + '%)');
    return notes;
  }

  /* ---------------- Relation Helper Functions ---------------- */
  function getRelationStageLabel(value) {
    if (value >= 95) return 'Very Friendly ❤️';
    if (value >= 80) return 'Friendly 😊';
    if (value >= 65) return 'Warm 🙂';
    if (value >= 50) return 'Neutral 😐';
    if (value >= 40) return 'Cool 😕';
    if (value >= 20) return 'Cold 🥶';
    return 'Hostile 👿';
  }

  function getRelationStageValue(value) {
    if (value >= 95) return 95;
    if (value >= 80) return 80;
    if (value >= 65) return 65;
    if (value >= 50) return 50;
    if (value >= 40) return 40;
    if (value >= 20) return 20;
    return 0;
  }

  function getCoalitionChance(value) {
    if (value >= 95) return 0.98;
    if (value >= 80) return 0.90;
    if (value >= 65) return 0.75;
    if (value >= 50) return 0.50;
    if (value >= 40) return 0.35;
    if (value >= 20) return 0.15;
    return 0.05;
  }

  function getAbsorbChance(value) {
    if (value >= 95) return 0.40;
    if (value >= 80) return 0.15;
    if (value >= 65) return 0.05;
    return 0;
  }

  function canAbsorbParty(value) {
    return value >= 80;
  }

  /* ---------------- Initialize Relations ---------------- */
  // Fix this in engine.js - replace the initRelations function with this:
/* ---------------- Initialize Relations ---------------- */
function initRelations(st) {
  var relations = {};
  
  if (D && D.PARTIES) {
    for (var i = 0; i < D.PARTIES.length; i++) {
      var p = D.PARTIES[i];
      var pid = p.id;
      
      if (pid === 'ZMP' || pid === 'other') {
        relations[pid] = 100;
        continue;
      }
      
      // Special handling for foreign entities like Wein
      // These are not in PARTIES but should be tracked
      if (pid === 'zpf') {
        relations[pid] = 75;
      } else if (pid === 'iia') {
        relations[pid] = 50;
      } else if (pid === 'pl') {
        relations[pid] = 35;
      } else if (pid === 'red') {
        relations[pid] = 45;
      } else if (pid === 'rb') {
        relations[pid] = 45;
      } else if (pid === 'republia') {
        relations[pid] = 18;
      } else if (pid === 'sportica') {
        relations[pid] = 30;
      } else if (pid === 'semp') {
        relations[pid] = 20;
      } else if (pid === 'bl') {
        relations[pid] = 0;
      } else if (pid === 'tiia') {
        relations[pid] = 50;
      } else {
        relations[pid] = 35;
      }
    }
  }
  
  // Add Wein as a special foreign entity (not a party)
  relations.wein = 55; // Starting relations with Wein
  
  return relations;
}

  /* ---------------- Decay Relations Over Time ---------------- */
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

  /* ---------------- Improve Relations Action ---------------- */
  function improveRelations(st, pid, amount) {
    var notes = [];
    if (!st.relations || st.merged.indexOf(pid) !== -1) {
      notes.push('Party is already merged into ZMP.');
      return notes;
    }
    
    var oldVal = st.relations[pid] || 50;
    var newVal = clamp(oldVal + amount, 0, 100);
    st.relations[pid] = newVal;
    
    var oldStage = getRelationStageLabel(oldVal);
    var newStage = getRelationStageLabel(newVal);
    
    notes.push('📈 Relations with ' + pid.toUpperCase() + ' improved from ' + oldStage + ' to ' + newStage);
    
    if (st.affinity) {
      st.affinity[pid] = clamp((st.affinity[pid] || 50) + amount * 0.3, 0, 100);
    }
    
    st.log.push('Week ' + st.week + ': Relations with ' + pid.toUpperCase() + ' improved to ' + Math.round(newVal));
    return notes;
  }

  /* ---------------- Absorb Party Action ---------------- */
  function absorbParty(st, pid, rng) {
    var notes = [];
    if (!st.relations || st.merged.indexOf(pid) !== -1) {
      notes.push('Party is already merged into ZMP.');
      return notes;
    }
    
    var relVal = st.relations[pid] || 50;
    var absorbChance = getAbsorbChance(relVal);
    
    if (absorbChance === 0) {
      notes.push(' Relations are not high enough to absorb ' + pid.toUpperCase() + '. Need Friendly or better.');
      return notes;
    }
    
    if (rng() < absorbChance) {
      notes.push('🎉 ' + pid.toUpperCase() + ' has been absorbed into ZMP!');
      notes = notes.concat(doMerge(st, pid));
      st.relations[pid] = 100;
      st.log.push('Week ' + st.week + ': ' + pid.toUpperCase() + ' absorbed into ZMP');
    } else {
      notes.push('😞 ' + pid.toUpperCase() + ' declined the absorption offer. Relations worsened.');
      st.relations[pid] = clamp((st.relations[pid] || 50) - 10, 0, 100);
      st.log.push('Week ' + st.week + ': ' + pid.toUpperCase() + ' rejected absorption');
    }
    
    return notes;
  }

  /* ---------------- Black League Absorbs Parties ---------------- */
  function checkBLAbsorbsParties(st, rng) {
    var notes = [];
    if (st.blSplintered) return notes;
    
    var blSupport = getPartySupport(st, 'bl');
    if (blSupport < 8) return notes;
    
    var vulnerablePids = [];
    for (var pid in st.relations) {
      if (pid === 'bl' || pid === 'ZMP' || pid === 'other') continue;
      if (st.merged.indexOf(pid) !== -1) continue;
      if (pid === 'iia' || pid === 'republia' || pid === 'tiia' || pid === 'pl') continue;
      
      var relVal = st.relations[pid] || 50;
      
      if (relVal < 10) {
        var p = getParty(pid);
        notes.push(' The Black League has absorbed ' + (p ? p.name : pid.toUpperCase()) + '!');
        notes.push('Their hostile relations (' + Math.round(relVal) + '%) made them vulnerable.');
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            var targetVal = st.raw[pid] ? st.raw[pid][dm.id] || 0 : 0;
            var keepPercent = 0.03 + rng() * 0.01;
            var transfer = targetVal * (1 - keepPercent);
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + transfer);
            if (st.raw[pid]) {
              st.raw[pid][dm.id] = Math.max(0.5, targetVal * keepPercent);
            }
          }
        }
        
        if (pid === 'iia' && st.relations[pid] === 0) {
          var p2 = getParty(pid);
          notes.push(' The Black League has absorbed ' + (p2 ? p2.name : pid.toUpperCase()) + '!');
          notes.push('IIA had 0 relations with ZMP and fell to the Black League.');
          
          if (D && D.DEMOS) {
            for (var i = 0; i < D.DEMOS.length; i++) {
              var dm = D.DEMOS[i];
              var targetVal = st.raw[pid] ? st.raw[pid][dm.id] || 0 : 0;
              var keepPercent = 0.03 + rng() * 0.01;
              var transfer = targetVal * (1 - keepPercent);
              st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + transfer);
              if (st.raw[pid]) {
                st.raw[pid][dm.id] = Math.max(0.5, targetVal * keepPercent);
              }
            }
          }
          
          st.merged.push(pid);
          st.relations[pid] = 0;
          st.log.push('Week ' + st.week + ': ' + pid.toUpperCase() + ' absorbed by Black League (0 relations)');
          
          var index = st.coalitionPartners.indexOf(pid);
          if (index !== -1) {
            st.coalitionPartners.splice(index, 1);
          }
          
          notes.push('📈 Black League support grows significantly!');
          return notes;
        }
        
        st.merged.push(pid);
        st.relations[pid] = 0;
        st.log.push('Week ' + st.week + ': ' + pid.toUpperCase() + ' absorbed by Black League (relations below 20)');
        
        var index = st.coalitionPartners.indexOf(pid);
        if (index !== -1) {
          st.coalitionPartners.splice(index, 1);
        }
        
        notes.push('📈 Black League support grows! ' + pid.toUpperCase() + ' keeps ' + Math.round((0.03 + rng() * 0.01) * 100) + '% of its supporters.');
        vulnerablePids.push(pid);
      }
    }
    
    if (vulnerablePids.length > 0) {
      notes.push(' ' + vulnerablePids.length + ' party(ies) absorbed by the Black League this week!');
    }
    
    return notes;
  }

  /* ---------------- Black League Splinter Release ---------------- */
  function releaseAbsorbedParties(st, rng) {
    var notes = [];
    if (!st.blSplintered) return notes;
    if (st.blSplinterReleaseTriggered) return notes;
    
    st.blSplinterReleaseTriggered = true;
    
    var absorbedParties = [];
    for (var pid in st.relations) {
      if (st.merged.indexOf(pid) !== -1 && st.relations[pid] === 0) {
        absorbedParties.push(pid);
      }
    }
    
    if (absorbedParties.length === 0) return notes;
    
    notes.push('🔓 The Black League has collapsed! Absorbed parties are now free!');
    
    for (var i = 0; i < absorbedParties.length; i++) {
      var pid = absorbedParties[i];
      var idx = st.merged.indexOf(pid);
      if (idx !== -1) {
        st.merged.splice(idx, 1);
      }
      
      if (D && D.DEMOS) {
        for (var j = 0; j < D.DEMOS.length; j++) {
          var dm = D.DEMOS[j];
          if (st.raw[pid]) {
            st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + 2);
          }
        }
      }
      
      st.relations[pid] = 40;
      notes.push('🔄 ' + pid.toUpperCase() + ' has been restored as an independent party.');
      st.log.push('Week ' + st.week + ': ' + pid.toUpperCase() + ' freed from Black League');
    }
    
    return notes;
  }

  /* ---------------- The Ten Walls Prophecy ---------------- */
  function triggerProphecyWall(st) {
    var w = st.prophecy.wallsBroken;

    var titles = {
      1: 'The First Wall', 2: 'The Second Wall', 3: 'The Third Wall', 4: 'The Fourth Wall',
      5: 'The Fifth Wall', 6: 'The Sixth Wall', 7: 'The Seventh Wall', 8: 'The Eighth Wall',
      9: 'The Ninth Wall', 10: 'The Tenth Wall'
    };

    var bodies = {
      1: 'And when <span class="party-zmp">tyrants</span> broke first wall <span class="text-tricolor">three</span> white horses came charging down the valley.',
      2: 'And when <span class="party-zmp">tyrants</span> broke the second wall for the <span class="party-zmp"> first horse rode forward and <span class="party-rb"> hell followed with him.',
      3: 'And when <span class="party-zmp">tyrants</span> broke the third wall, the violence then came from the east for <span class="party-red">the second horse</span> stepped forward and one of <span class="party-bl">us </span> knew your sin is wrath.',
      4: 'And when <span class="party-zmp">tyrants</span> broke the fourth wall, the halls grew quiet. The <span class="text-tricolor">three</span> colors still thought this was a game of elections and polls.',
      5: 'And when <span class="party-zmp">tyrants</span> broke the fifth wall, the Cultists stopped resisting. They are merely watching the <span class="party-zmp">tyrants</span> now.',
      6: 'And when <span class="party-zmp">tyrants</span> broke the sixth wall, the white horses became visible to the naked eye, charging through the empty corridors at night.',
      7: 'And when <span class="party-zmp">tyrants</span> broke the seventh wall, only <span class="text-tricolor">three</span> remained. The sky above the school turned a bruised, unnatural purple.',
      8: 'And when <span class="party-zmp">tyrants</span> broke the eight wall there were last moments of peace for the last decision was to be made.',
      9: 'And when <span class="party-zmp">tyrants</span> broke the ninth wall last battle had begun for they (<span class="text-tricolor">three</span> white horses) don\'t know what they had done.',
      10: 'And when <span class="party-zmp">tyrants</span> broke last wall they began to celebrate for they had \'won\' *explosion* meanwhile caused a total armagedon *2 more*'
    };

    if (w === 8) {
      st.pendingEvent = {
        id: 'prophecy_wall_8',
        title: titles[w],
        body: bodies[w],
        choices: [
          { 
            text: 'Walk away.', 
            note: 'End the suppression. The prophecy halts.',
            effects: { prophecyHalt: true } 
          },
          { 
            text: 'The tyrants do not fear fairy tales.', 
            note: 'Continue the suppression.',
            effects: { faculty: -10 }
          }
        ]
      };
      return;
    }

    if (w === 10) {
      st.finished = true;
      st.endingData = {
        ending: 'armageddon',
        title: 'TOTAL ARMAGEDDON',
        subtitle: 'The Prophecy was true. The TNT Ending.',
        body: bodies[10],
        story: 'They celebrated their victory over the Black League. Then the walls came down. ' +
               'The Green Tyrants stood atop the rubble of the council chamber, victorious. ' +
               'They had prosecuted the fascists, banned their splinters, and erased them from the school. ' +
               'But they had not listened to the warnings. The Cultists were not a political party; they were a doomsday clock. ' +
               'As the <span class="text-tricolor">three</span> colors stood together in triumph, the final wall shattered. ' +
               'The explosion did not discriminate. It took the council. It took the faculty. It took the students. ' +
               'It took the school. There is no government left to form. There is no future to build. ' +
               'There is only the silence of the ash, and the terrifying realization that the <span class="party-zmp">tyrants</span> destroyed the world just to win an election.',
        epilogue: 'Nothing remains. The game is over.'
      };
      return;
    }

    st.pendingEvent = {
      id: 'prophecy_wall_' + w,
      title: titles[w],
      body: bodies[w],
      choices: [{ text: 'Continue.', note: '' }]
    };
  }

  /* ---------------- Dynamic Party Events ---------------- */
  function checkDynamicPartyEvents(st, rng) {
    var notes = [];
    
    if (rng() > 0.2) return notes;
    
    var activePids = [];
    for (var pid in st.raw) {
      if (pid !== 'ZMP' && pid !== 'other' && st.merged.indexOf(pid) === -1) {
        activePids.push(pid);
      }
    }
    
    if (activePids.length < 2) return notes;
    
    var idx1 = Math.floor(rng() * activePids.length);
    var idx2 = Math.floor(rng() * activePids.length);
    while (idx2 === idx1) {
      idx2 = Math.floor(rng() * activePids.length);
    }
    
    var pid1 = activePids[idx1];
    var pid2 = activePids[idx2];
    
    var p1 = getParty(pid1);
    var p2 = getParty(pid2);
    if (!p1 || !p2) return notes;
    
    var p1Support = getPartySupport(st, pid1);
    var p2Support = getPartySupport(st, pid2);
    
    var attacker, defender, attackerName, defenderName;
    var transferAmount = 0.5 + rng() * 1.5;
    
    if (p1Support > p2Support) {
      attacker = pid1;
      defender = pid2;
      attackerName = p1.short;
      defenderName = p2.short;
    } else {
      attacker = pid2;
      defender = pid1;
      attackerName = p2.short;
      defenderName = p1.short;
    }
    
    if (Math.abs(p1Support - p2Support) < 2) return notes;
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var defVal = st.raw[defender] ? st.raw[defender][dm.id] || 0 : 0;
        var transfer = defVal * (transferAmount / 100);
        if (st.raw[attacker]) {
          st.raw[attacker][dm.id] = Math.max(0.5, (st.raw[attacker][dm.id] || 0) + transfer);
        }
        if (st.raw[defender]) {
          st.raw[defender][dm.id] = Math.max(0.5, defVal - transfer);
        }
      }
    }
    
    notes.push(' ' + attackerName + ' is gaining support at the expense of ' + defenderName + '!');
    st.log.push('Week ' + st.week + ': ' + attackerName + ' takes from ' + defenderName);
    
    return notes;
  }

  /* ---------------- Rally Foreign Support ---------------- */
  function rallyForeignSupport(st, rng) {
    var notes = [];
    
    notes.push('🌍 The ZMP launches a campaign for foreign support!');
    notes.push('Wein agrees to help with our affairs.');
    st.hasArbeiterAlly = true;
    
    st.allyBoost = 0.5;
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
      }
    }
    
    notes.push(' Arbeiter von Wein is now your ally!');
    notes.push(' Harvard economic advisors are now available.');
    notes.push('🏥 WHO healthcare advisors are now available.');
    notes.push('💪 Allied actions are now 50% more effective!');
    
    st.log.push('Week ' + st.week + ': Foreign support secured');
    return notes;
  }

  /* ---------------- Support Computation ---------------- */
  function computeSupport(st) {
    var byDemo = {}, totals = {};
    var active = activeParties(st);

    if (!D || !D.DEMOS || !D.PARTIES) return { byDemo: {}, totals: {} };

    for (var i = 0; i < D.PARTIES.length; i++) {
      var p = D.PARTIES[i];
      if (st.merged.indexOf(p.id) === -1) {
        totals[p.id] = 0;
      }
    }

    for (var i = 0; i < D.DEMOS.length; i++) {
      var dm = D.DEMOS[i];
      var sum = 0;
      for (var j = 0; j < D.PARTIES.length; j++) {
        var p = D.PARTIES[j];
        if (st.merged.indexOf(p.id) === -1) {
          var val = (st.raw[p.id] && st.raw[p.id][dm.id] !== undefined) ? st.raw[p.id][dm.id] : 0;
          sum += Math.max(0.01, val);
        }
      }
      byDemo[dm.id] = {};
      for (var j = 0; j < D.PARTIES.length; j++) {
        var p = D.PARTIES[j];
        if (st.merged.indexOf(p.id) === -1) {
          var val = (st.raw[p.id] && st.raw[p.id][dm.id] !== undefined) ? st.raw[p.id][dm.id] : 0;
          var pct = sum > 0 ? (Math.max(0.01, val) / sum) * 100 : 0;
          byDemo[dm.id][p.id] = pct;
          totals[p.id] = (totals[p.id] || 0) + pct * dm.weight;
        }
      }
    }

    return { byDemo: byDemo, totals: totals };
  }

  /* ---------------- Seat Allocation ---------------- */
  function allocateSeats(totals, st) {
    if (typeof migrateState === 'function') migrateState(st);
    
    var eligible = {}, sum = 0;
    var threshold = (st && st.electoralThreshold !== undefined)
      ? st.electoralThreshold
      : ((D && D.THRESHOLD) ? D.THRESHOLD : 3);
    var seatsTotal = (D && D.SEATS) ? D.SEATS : 45;

    var adjustedTotals = {};
    for (var pid in totals) adjustedTotals[pid] = totals[pid];

    // 1. Pool the votes into the List
    if (st && st.electoralLists) {
      // Ensure the list itself exists in the totals
      for (var pid in st.electoralLists) {
        var mainList = st.electoralLists[pid];
        if (adjustedTotals[mainList] === undefined) adjustedTotals[mainList] = 0;
      }
      
      // Pool the votes
      for (var pid in st.electoralLists) {
        var mainList = st.electoralLists[pid];
        if (adjustedTotals[pid]) {
          adjustedTotals[mainList] += adjustedTotals[pid];
          adjustedTotals[pid] = 0; 
        }
      }
    }

    // 2. Find eligible parties based on the NEW pooled totals
    for (var pid in adjustedTotals) {
      if (pid === 'other') continue;
      if (adjustedTotals[pid] >= threshold) {
        eligible[pid] = adjustedTotals[pid];
        sum += adjustedTotals[pid];
      }
    }
    if (sum === 0) return {};

    // 3. Acerbo / Majority Law (if active)
    if (st && st.acerboLaw) {
      var maxParty = null, maxSupport = 0;
      for (var pid in eligible) {
        if (eligible[pid] > maxSupport) { maxSupport = eligible[pid]; maxParty = pid; }
      }
      if (maxParty) {
        var winnerSeats = Math.round(seatsTotal * 0.66);
        var remainingSeats = seatsTotal - winnerSeats;
        var seats2 = {};
        seats2[maxParty] = winnerSeats;
        var othersTotal = sum - maxSupport;
        if (othersTotal > 0) {
          var allocated = 0;
          for (var pid in eligible) {
            if (pid === maxParty) continue;
            var s = Math.round((eligible[pid] / othersTotal) * remainingSeats);
            seats2[pid] = s;
            allocated += s;
          }
          if (allocated < remainingSeats) {
            var largestOther = null, largestOtherSupport = 0;
            for (var pid in eligible) {
              if (pid !== maxParty && eligible[pid] > largestOtherSupport) {
                largestOtherSupport = eligible[pid]; largestOther = pid;
              }
            }
            if (largestOther) {
              seats2[largestOther] = (seats2[largestOther] || 0) + (remainingSeats - allocated);
            }
          }
        }
        return seats2;
      }
    }

    // 4. Normal Sainte-Lague
    var seats = {}, divisors = {};
    for (var pid in eligible) {
      seats[pid] = 0;
      divisors[pid] = 1;
    }
    
    for (var s = 0; s < seatsTotal; s++) {
      var best = null, bestQ = -1;
      for (var pid in eligible) {
        var q = eligible[pid] / divisors[pid];
        if (q > bestQ) { bestQ = q; best = pid; }
      }
      if (best) {
        seats[best] = (seats[best] || 0) + 1;
        divisors[best] = 2 * seats[best] + 1;
      }
    }

    // 5. Split the List's seats proportionally (AFTER they have been calculated)
    if (st && st.electoralLists) {
      var listParties = {};
      for (var pid in st.electoralLists) {
        var mainList = st.electoralLists[pid];
        if (!listParties[mainList]) listParties[mainList] = [];
        listParties[mainList].push(pid);
      }

      for (var listId in listParties) {
        var listSeats = seats[listId] || 0;
        if (listSeats > 0) {
          if (listId === 'zalian_list') {
            var zapSeats = Math.round(listSeats * 0.5);
            var zlpSeats = Math.round(listSeats * 0.3);
            var otherSeats = listSeats - zapSeats - zlpSeats; // Gets the remainder (20%)

            seats['zap'] = (seats['zap'] || 0) + zapSeats;
            seats['zlp'] = (seats['zlp'] || 0) + zlpSeats;
            seats['other_zalian'] = (seats['other_zalian'] || 0) + otherSeats;
          } else {
            // Default split for generic lists (equal share)
            var split = Math.floor(listSeats / listParties[listId].length);
            for (var i = 0; i < listParties[listId].length; i++) {
              seats[listParties[listId][i]] = split;
            }
          }
          seats[listId] = 0; // The list itself doesn't hold seats in parliament, the members do
        }
      }
    }

    return seats;
  }



  /* ---------------- Snapshots ---------------- */
  function snapshot(st, label) {
  var sup = computeSupport(st);
  var seats = allocateSeats(sup.totals, st);
  
  // If the player's faction refuses elections, void ZMP seats and projected share
  var faction = null;
  if (D && D.FACTIONS) {
    for (var i = 0; i < D.FACTIONS.length; i++) {
      if (D.FACTIONS[i].id === st.faction) { faction = D.FACTIONS[i]; }
    }
  }
  
  if (faction && faction.canParticipateInElections === false) {
    // Zero out ZMP representation in the council
    if (seats.ZMP) { seats.ZMP = 0; }
   
    var stolenSeats = (allocateSeats(sup.totals, st).ZMP || 0);
    if (stolenSeats > 0) {
      var otherTotal = 0;
      for (var pid in seats) {
        if (pid !== 'ZMP') { otherTotal += seats[pid] || 0; }
      }
      if (otherTotal > 0) {
        for (var pid in seats) {
          if (pid !== 'ZMP') {
            seats[pid] = Math.round((seats[pid] / otherTotal) * (otherTotal + stolenSeats));
          }
        }
      }
    }
    // Set ZMP support in the snapshot totals to 0 so the UI shows 0%
    if (sup.totals.ZMP !== undefined) { sup.totals.ZMP = 0; }
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

  function current(st) {
    var sup = computeSupport(st);
    return { totals: sup.totals, byDemo: sup.byDemo, seats: allocateSeats(sup.totals, st) };
  }

  /* ---------------- Ideology Support ---------------- */
  function spiritSupport(st) {
    var sup = computeSupport(st), total = 0;
    var active = activeParties(st);
    for (var i = 0; i < active.length; i++) {
      var p = active[i];
      var s = (p.id === 'ZMP') ? st.spirit : (p.spirit || 5);
      if (s >= 7) {
        total += (sup.totals[p.id] || 0) * (s >= 9 ? 1 : 0.6);
      }
    }
    return total;
  }

  function gateSupport(st) {
    var sup = computeSupport(st), total = 0;
    var active = activeParties(st);
    for (var i = 0; i < active.length; i++) {
      var p = active[i];
      var g = (p.id === 'ZMP') ? st.gates : (p.gates || 5);
      if (g >= 6) {
        total += (sup.totals[p.id] || 0) * (g >= 8 ? 1 : 0.6);
      }
    }
    return total;
  }

  /* ---------------- Apply Effects ---------------- */
  function applyEffects(st, eff, rng) {
    var notes = [];
    if (!eff) return notes;

    var playerPid = getPlayerPartyId(st);
    if (eff.demo) {
      for (var dm in eff.demo) {
        if (eff.demo.hasOwnProperty(dm)) {
          st.raw[playerPid][dm] = Math.max(0.5, (st.raw[playerPid][dm] || 0) + eff.demo[dm]);
        }
      }
    }

    // --- ZALIAN LIST FORMATION ---
    if (eff.setFlags && eff.setFlags.zalianListFormed && !st.flags.zalianListFormed) {
      st.flags.zalianListFormed = true;
      if (!st.electoralLists) st.electoralLists = {};
      st.electoralLists['zap'] = 'zalian_list';
      st.electoralLists['zlp'] = 'zalian_list';
      st.electoralLists['zi'] = 'zalian_list';
      
      if (D && D.PARTIES) {
        if (!D.PARTIES.find(function(p) { return p.id === 'zalian_list'; })) {
          D.PARTIES.push({ id: 'zalian_list', name: 'Zalian List', short: 'Zalian List', tag: 'Zalian', color: '#d97706', spirit: 5, gates: 5, coalition: 0, base: {} });
          D.PARTIES.push({ id: 'zlp', name: 'Zalgrilian Labour Party', short: 'ZLP', tag: 'ZLP', color: '#7fdf7f', spirit: 5, gates: 3, coalition: 50, base: {} });
          D.PARTIES.push({ id: 'zi', name: 'Zalian Independents', short: 'ZI', tag: 'ZI', color: '#ca8a04', spirit: 6, gates: 4, coalition: 50, base: {} });
        }
      }

      // Inject a major starting base to simulate the merged support
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i].id;
          st.raw.zalian_list = st.raw.zalian_list || {};
          st.raw.zalian_list[dm] = 15; // Major party base
        }
      }
    }

    if (eff.party) {
      for (var pid in eff.party) {
        if (eff.party.hasOwnProperty(pid) && st.raw[pid]) {
          if (D && D.DEMOS) {
            for (var i = 0; i < D.DEMOS.length; i++) {
              var dm = D.DEMOS[i];
              st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + eff.party[pid] * 0.6);
            }
          }
        }
      }
    }

    if (eff.affinity) {
      for (var pid in eff.affinity) {
        if (eff.affinity.hasOwnProperty(pid)) {
          st.affinity[pid] = clamp((st.affinity[pid] || 50) + eff.affinity[pid], 0, 100);
        }
      }
    }

    if (eff.prophecyHalt) {
      st.prophecy.halted = true;
      notes.push('The tyrants stepped back from the edge. The prophecy halts.');
      st.log.push('Week ' + st.week + ': The tyrants walked away from the 8th wall.');
    }

    if (eff.setFlags) {
      if (!st.flags) st.flags = {};
      for (var fk in eff.setFlags) {
        if (eff.setFlags.hasOwnProperty(fk)) {
          st.flags[fk] = eff.setFlags[fk];
        }
      }
    }

    if (eff.battle) {
      var battleNotes = resolveBattle(st, eff.battle, rng);
      notes = notes.concat(battleNotes);
    }

    if (eff.zalgriliankingWithdraw) {
  var k = st.king;
  k.active = false;
  st.finished = true;
  st.endingData = {
    ending: 'zalgrilian_king_withdrawal',
    title: 'The Order Signed in the Dark',
    subtitle: 'You signed the withdrawal order. The Legion left before dawn.',
    endingNumber: 'Ending 34',
    body: 'The occupation ended without violence.',
    story: /* ... */ '',
    subending: 'Subending AF — The Withdrawal',
    detail: '<div class="stat"><span>Support</span><span class="v">' +
      Math.round(k.support) + '</span></div>',
    epilogue: /* ... */ ''
  };
}

if (eff.zalgriliankingHold) {
  st.king.escalationHeld = true;
  st.king.resistance += 10;
  st.king.legionMorale = Math.max(0, st.king.legionMorale - 5);
  st.log.push('The Legion holds the building. The crowd does not disperse.');
}

if (eff.zalgriliankingEscalate) {
  // ---- The decisive moment ----
  // Trigger the minigame IF the player has already escalated once AND
  // Dzehurjaca loyalty is high enough that the Legion will follow orders.
  var k = st.king;
  var loyalty = k.legionLoyalty;

  if (loyalty >= 70 && !k.minigameTriggered) {
    // HIGH LOYALTY: the Legion will actually move. Player plays the minigame.
    k.minigameTriggered = true;
    st.kingMinigamePending = true;
    st.log.push('The Marshal orders the Legion to disperse the crowd.');
    st.log.push('The Legion will obey. The question is what happens next.');
    // The UI layer will launch the minigame.
  } else {
    // LOW LOYALTY: the Legion refuses. Skip the minigame, go straight to
    // the "Order They Would Not Obey" ending.
    st.finished = true;
    st.endingData = {
      ending: 'zalgrilian_king_legion_refuses',
      title: 'The Order They Would Not Obey',
      subtitle: 'The Legion refused to fire on the crowd.',
      endingNumber: 'Ending 35',
      body: 'The Marshal gave the order. The Legion did not obey.',
      story: /* ... */ '',
      subending: 'Subending AG — The Order They Would Not Obey',
      detail: '<div class="stat"><span>Legion Loyalty</span><span class="v">' +
        Math.round(loyalty) + '</span></div>',
      epilogue: /* ... */ ''
    };
  }
}

if (eff.zalgriliankingLegionResigns) {
  st.king.active = false;
  st.finished = true;
  st.endingData = {
    ending: 'zalgrilian_king_collapse',
    title: 'The March That Ended in Nothing',
    /* ... same collapse data ... */
  };
}

if (eff.zalgriliankingLegionRefuses) {
  st.king.active = false;
  st.finished = true;
  st.endingData = {
    ending: 'zalgrilian_king_desertion',
    title: 'The Legion Went Home',
    subtitle: 'The men deserted in the night.',
    endingNumber: 'Ending 38',
    body: 'The Legion was ordered to hold. The Legion went home instead.',
    story: /* ... */ '',
    subending: 'Subending AJ — The Desertion',
    detail: '',
    epilogue: ''
  };
}

    if (typeof eff.unity === 'number') st.unity = clamp(st.unity + eff.unity, 0, 100);
    if (typeof eff.faculty === 'number') st.faculty = clamp(st.faculty + eff.faculty, 0, 100);
    if (typeof eff.momentum === 'number') st.momentum = clamp(st.momentum + eff.momentum, -10, 20);
    if (typeof eff.funds === 'number') st.funds = Math.max(0, st.funds + eff.funds);
    if (typeof eff.vol === 'number') st.volunteers = Math.max(0, st.volunteers + eff.vol);
    if (typeof eff.spirit === 'number') st.spirit = clamp(st.spirit + eff.spirit, 0, 10);
    if (typeof eff.gates === 'number') st.gates = clamp(st.gates + eff.gates, 0, 10);

    if (eff.blWhispers) {
      var blWhisperNotes = resolveBLWhispers(st, eff.blWhispers, rng);
      notes = notes.concat(blWhisperNotes);
    }

    if (eff.blUltimatum) {
      var blUltimatumNotes = resolveBLUltimatum(st, eff.blUltimatum, rng);
      notes = notes.concat(blUltimatumNotes);
    }

    if (eff.blRisingTide) {
      var blRisingNotes = resolveBLRisingTide(st, eff.blRisingTide, rng);
      notes = notes.concat(blRisingNotes);
    }

        if (eff.rubiconState) {
      var rubiconNotes = resolveRubiconActivation(st, eff.rubiconState, rng);
      notes = notes.concat(rubiconNotes);
    }
    if (eff.rubiconPopularFront) {
      var popNotes = resolveRubiconPopularFront(st, eff.rubiconPopularFront, rng);
      notes = notes.concat(popNotes);
    }
    if (eff.rubiconSurge) {
      var surgeNotes = resolveRubiconSurge(st, eff.rubiconSurge, rng);
      notes = notes.concat(surgeNotes);
    }
    if (eff.rubiconBetrayal) {
      var betNotes = resolveRubiconBetrayal(st, eff.rubiconBetrayal, rng);
      notes = notes.concat(betNotes);
    }
    if (eff.rubiconLastStand) {
      var lastNotes = resolveRubiconLastStand(st, eff.rubiconLastStand, rng);
      notes = notes.concat(lastNotes);
    }
    if (eff.rubiconVictory) {
      var winNotes = resolveRubiconVictory(st, eff.rubiconVictory, rng);
      notes = notes.concat(winNotes);
    }
    if (eff.rubiconDefeat) {
      var defNotes = resolveRubiconDefeat(st, eff.rubiconDefeat, rng);
      notes = notes.concat(defNotes);
    }
    if (eff.doubleAgent) {
      var daNotes = resolveDoubleAgent(st, eff.doubleAgent, rng);
      notes = notes.concat(daNotes);
    }

    if (eff.blPropaganda) {
      var blPropagandaNotes = resolveBLPropaganda(st, eff.blPropaganda, rng);
      notes = notes.concat(blPropagandaNotes);
    }

    if (eff.blTakeover) {
      var blTakeoverNotes = resolveBLTakeover(st, eff.blTakeover, rng);
      notes = notes.concat(blTakeoverNotes);
    }

    if (eff.blCollapse) {
      var blCollapseNotes = resolveBLCollapse(st, eff.blCollapse, rng);
      notes = notes.concat(blCollapseNotes);
    }

    if (eff.partyResurgence) {
      var resurgenceNotes = resolvePartyResurgence(st, eff.partyResurgence, rng);
      notes = notes.concat(resurgenceNotes);
    }

    if (eff.presidentialChoice) {
      var presChoiceNotes = resolvePresidentialChoice(st, eff.presidentialChoice, rng);
      notes = notes.concat(presChoiceNotes);
    }

    if (eff.presidentialResultsSdahh) {
      var resultNotes = resolvePresidentialResultsSdahh(st, eff.presidentialResultsSdahh, rng);
      notes = notes.concat(resultNotes);
    }

    if (eff.LocalElection) {
      var localNotes = LocalElection(st, eff.LocalElection, rng);
      notes = notes.concat(localNotes);
    }

    if (eff.presidentialDebate) {
      var presDebateNotes = resolvePresidentialDebate(st, eff.presidentialDebate, rng);
      notes = notes.concat(presDebateNotes);
    }

    if (eff.presidentialEndorsement) {
      var presEndorsementNotes = resolvePresidentialEndorsement(st, eff.presidentialEndorsement, rng);
      notes = notes.concat(presEndorsementNotes);
    }

    if (eff.presidentialResults) {
      var presResultsNotes = resolvePresidentialResults(st, eff.presidentialResults, rng);
      notes = notes.concat(presResultsNotes);
    }

    if (eff.merge) {
      var mergeNotes = doMerge(st, eff.merge);
      notes = notes.concat(mergeNotes);
    }

        if (eff.rubiconState) {
      var rubiconNotes = resolveRubiconActivation(st, eff.rubiconState, rng);
      notes = notes.concat(rubiconNotes);
    }
    if (eff.rubiconPopularFront) {
      var popNotes = resolveRubiconPopularFront(st, eff.rubiconPopularFront, rng);
      notes = notes.concat(popNotes);
    }
    if (eff.rubiconSurge) {
      var surgeNotes = resolveRubiconSurge(st, eff.rubiconSurge, rng);
      notes = notes.concat(surgeNotes);
    }
    if (eff.rubiconBetrayal) {
      var betNotes = resolveRubiconBetrayal(st, eff.rubiconBetrayal, rng);
      notes = notes.concat(betNotes);
    }
    if (eff.rubiconLastStand) {
      var lastNotes = resolveRubiconLastStand(st, eff.rubiconLastStand, rng);
      notes = notes.concat(lastNotes);
    }
    if (eff.rubiconVictory) {
      var winNotes = resolveRubiconVictory(st, eff.rubiconVictory, rng);
      notes = notes.concat(winNotes);
    }
    if (eff.rubiconDefeat) {
      var defNotes = resolveRubiconDefeat(st, eff.rubiconDefeat, rng);
      notes = notes.concat(defNotes);
    }

    if (eff.negotiateMerge) {
      var pid = eff.negotiateMerge;
      var chance = 0.3 + (st.affinity[pid] || 0) / 220 + (st.momentum || 0) / 60;
      if (rng() < chance) {
        notes.push('She accepts your terms.');
        notes = notes.concat(doMerge(st, pid));
        st.unity = clamp(st.unity - 4, 0, 100);
      } else {
        notes.push('She walks out. The Spirit Front runs alone, and angrier.');
        st.affinity[pid] = clamp((st.affinity[pid] || 50) - 20, 0, 100);
        applyEffects(st, { party: { semp: 4 } }, rng);
      }
    }

    if (eff.battle2) {
      var battle2Notes = resolveBattle2(st, eff.battle2, rng);
      notes = notes.concat(battle2Notes);
    }

    if (eff.battle3) {
      var battle3Notes = resolveBattle3(st, eff.battle3, rng);
      notes = notes.concat(battle3Notes);
    }

    if (eff.battle4) {
      var battle4Notes = resolveBattle4(st, eff.battle4, rng);
      notes = notes.concat(battle4Notes);
    }

    if (eff.fallOfCenter) {
      var centerNotes = resolveFallOfCenter(st, eff.fallOfCenter, rng);
      notes = notes.concat(centerNotes);
    }

    if (eff.rallyForeign) {
      var foreignNotes = rallyForeignSupport(st, rng);
      notes = notes.concat(foreignNotes);
    }

    if (eff.gamble === 'blame_bl') {
      if (rng() < 0.45) {
        notes.push('It lands. The Black League is blamed and the story moves on.');
        applyEffects(st, { party: { bl: -5 }, demo: { freshmen: 2 }, momentum: 2 }, rng);
      } else {
        notes.push('It does not land. Now there are two stories.');
        applyEffects(st, { demo: { honor: -7, freshmen: -4, arts: -3 }, faculty: -12, momentum: -4 }, rng);
      }
    }

    if (eff.debate) {
      var debateNotes = runDebate(st, eff.debate, rng);
      notes = notes.concat(debateNotes);
    }

    if (eff.redEvent) {
      var redNotes = runRedEvent(st, eff.redEvent, rng);
      notes = notes.concat(redNotes);
    }

    if (eff.coalitionStability) {
      st.coalitionStability = clamp((st.coalitionStability || 80) + eff.coalitionStability, 0, 100);
    }

    if (eff.walkOff) {
      var walkOffNotes = walkOffElection(st, eff.walkOff, rng);
      notes = notes.concat(walkOffNotes);
    }

    if (eff.banParties) {
      var banNotes = walkOffElection(st, 'ban_parties', rng);
      notes = notes.concat(banNotes);
    }

    if (eff.releasedParties) {
      var releasedNotes = resolveReleasedParties(st, eff.releasedParties, rng);
      notes = notes.concat(releasedNotes);
    }

    if (eff.releasedSurge) {
      var surgeNotes = resolveReleasedSurge(st, eff.releasedSurge, rng);
      notes = notes.concat(surgeNotes);
    }

    if (eff.releasedVictory) {
      var victoryNotes = resolveReleasedVictory(st, eff.releasedVictory, rng);
      notes = notes.concat(victoryNotes);
    }

    if (eff.legislatureVote) {
      var legNotes = resolveLegislatureVote(st, eff.legislatureVote, rng);
      notes = notes.concat(legNotes);
    }

    if (eff.setFlags && eff.setFlags.zspZlpFormed) {
      notes = notes.concat(spawnZSPandZLP(st));
    }

    // ------------------------------------------------------------
    // SECURRO SIEGE — brought the Legion to the council chamber
    // ------------------------------------------------------------
    if (eff.startSecurroSiege) {
      if (window.SecurroSiege && window.SecurroSiege.canStart(st)) {
        window.SecurroSiege.newGame(st);
        st.log.push('Week ' + st.week + ': The Legion surrounds the council chamber.');
      } else {
        notes.push('The Legion is not strong enough, or the siege cannot begin.');
        st.log.push('Week ' + st.week + ': Siege attempt blocked.');
      }
    }

    // ------------------------------------------------------------
    // SECULARIST REFERENDUM — launched the charter campaign
    // ------------------------------------------------------------
    if (eff.startSecularistReferendum) {
      if (window.SecularistReferendum) {
        window.SecularistReferendum.newGame(st);
        st.log.push('Week ' + st.week + ': The referendum campaign begins.');
      }
    }

    return notes;
  }

  function spawnZSPandZLP(st) {
    var notes = [];
    if (!D || !D.PARTIES || !D.DEMOS) return notes;

    // Avoid double-spawn
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (D.PARTIES[i].id === 'zsp') return notes;
    }

    var zspDef = {
      id: 'zsp', name: 'Zalgrilian Social Party', short: 'ZSP', tag: 'ZSP', color: '#5fae3c',
      flag: { pattern: 'solid', colors: ['#5fae3c'], emblem: 'Z' },
      blurb: 'The moderate splinter of the Red Front. Green of the ZMP, red of the front.',
      blurbs: {},
      spirit: 6, gates: 4, coalition: 45,
      base: { athletes: 3, honor: 4, gamers: 4, arts: 4, freshmen: 4, seniors: 4, buskids: 4 }
    };
    var zlpDef = {
      id: 'zlp', name: 'Zalgrilian Labour Party', short: 'ZLP', tag: 'ZLP', color: '#7fdf7f',
      flag: { pattern: 'solid', colors: ['#7fdf7f'], emblem: 'L' },
      blurb: 'The moderate splinter of the Red Bench. Labour, not revolution.',
      blurbs: {},
      spirit: 5, gates: 3, coalition: 50,
      base: { athletes: 4, honor: 3, gamers: 4, arts: 4, freshmen: 4, seniors: 4, buskids: 6 }
    };
    D.PARTIES.push(zspDef);
    D.PARTIES.push(zlpDef);

    if (!st.raw.zsp) {
      st.raw.zsp = {};
      st.raw.zlp = {};
      for (var j = 0; j < D.DEMOS.length; j++) {
        var dm = D.DEMOS[j];
        st.raw.zsp[dm.id] = zspDef.base[dm.id] || 1;
        st.raw.zlp[dm.id] = zlpDef.base[dm.id] || 1;
      }
    }

    if (!st.affinity) st.affinity = {};
    st.affinity.zsp = 60;
    st.affinity.zlp = 60;

    // If the reforms came from the Qualia settlement, RED and RB cease
    // to exist as separate parties the moment ZSP and ZLP appear.
    if (st.flags && st.flags.redRbReformed) {
      if (st.merged.indexOf('red') === -1) st.merged.push('red');
      if (st.merged.indexOf('rb')  === -1) st.merged.push('rb');

    
      if (D && D.DEMOS) {
        for (var k = 0; k < D.DEMOS.length; k++) {
          var d = D.DEMOS[k];
          var redVal = (st.raw.red && st.raw.red[d.id]) || 0;
          var rbVal  = (st.raw.rb  && st.raw.rb[d.id])  || 0;
          if (redVal > 0) {
            st.raw.zsp[d.id] = Math.max(0.5, (st.raw.zsp[d.id] || 0) + redVal * 0.55);
            st.raw.ZMP[d.id] = Math.max(0.5, (st.raw.ZMP[d.id] || 0) + redVal * 0.20);
          }
          if (rbVal > 0) {
            st.raw.zlp[d.id] = Math.max(0.5, (st.raw.zlp[d.id] || 0) + rbVal * 0.55);
            st.raw.ZMP[d.id] = Math.max(0.5, (st.raw.ZMP[d.id] || 0) + rbVal * 0.20);
          }
        }
      }
    }

    st.log.push('Week ' + st.week + ': ZSP and ZLP formed from the Qualia settlement.');
    notes.push('New parties: ZSP (Zalgrilian Social Party) and ZLP (Zalgrilian Labour Party) have entered the field.');

    return notes;
  }

  /* ---------------- Do Merge ---------------- */
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

  /* ---------------- Run Debate ---------------- */
  function runDebate(st, style, rng) {
    var roll = rng(), notes = [], gain;
    if (style === 'record') {
      gain = 2 + (st.momentum || 0) * 0.35 + (st.unity - 50) * 0.06;
      applyEffects(st, { demo: { honor: gain, seniors: gain, buskids: gain * 0.8, freshmen: gain * 0.5 } }, rng);
      notes.push('You list what you actually delivered. It is a shorter list than you would like, but it is real.');
    } else if (style === 'attack') {
      if (roll < 0.55) {
        notes.push('You corner the opposition and they have no answer.');
        applyEffects(st, { party: { republia: -6, bl: -4 }, demo: { gamers: 4, freshmen: 3 }, momentum: 3 }, rng);
      } else {
        notes.push('It reads as a pile-on. The room cools.');
        applyEffects(st, { demo: { honor: -4, arts: -2 }, faculty: -6, momentum: -2 }, rng);
      }
    } else if (style === 'spirit') {
      var s = st.spirit || 5;
      applyEffects(st, { demo: { freshmen: 2 + s * 0.5, athletes: 1 + s * 0.3, arts: 2, honor: -(s * 0.35) },
        momentum: 2 }, rng);
      notes.push('The gym is loud. Whether that converts to votes is the oldest question in this school.');
    } else {
      if (roll < 0.4) {
        notes.push('It is a triumph. Nobody checks the arithmetic.');
        applyEffects(st, { demo: { freshmen: 9, athletes: 5, gamers: 4, arts: 4 }, momentum: 5 }, rng);
      } else if (roll < 0.75) {
        notes.push('Mixed. The promises are noted and immediately doubted.');
        applyEffects(st, { demo: { freshmen: 3, honor: -3 } }, rng);
      } else {
        notes.push('A senior asks how you will pay for any of it. You do not have an answer.');
        applyEffects(st, { demo: { honor: -6, seniors: -5, freshmen: -2 }, momentum: -4, faculty: -5 }, rng);
      }
    }
    return notes;
  }

  /* ---------------- Red Front Leadership ---------------- */
  function runRedEvent(st, style, rng) {
    var notes = [];
    var affinity = st.affinity.red || 35;

    if (style === 'leadership') {
      if (st.redEventTriggered) return notes;
      st.redEventTriggered = true;

      if (affinity >= 55) {
        st.redLeader = 'friendly';
        notes.push('The Red Front elects a pragmatic leader who is open to cooperation.');
        st.affinity.red = clamp((st.affinity.red || 0) + 15, 0, 100);
        applyEffects(st, { demo: { buskids: 4, freshmen: 3, honor: -2 }, momentum: 2 }, rng);
        if (st.affinity.red >= 65 && rng() < 0.4) {
          notes.push('The Red Front agrees to join your coalition!');
          notes = notes.concat(doMerge(st, 'red'));
        }
      } else if (affinity >= 30) {
        st.redLeader = 'independent';
        notes.push('The Red Front elects a moderate leader. They will remain independent for now.');
        st.affinity.red = clamp((st.affinity.red || 0) + 5, 0, 100);
        applyEffects(st, { demo: { buskids: 2, freshmen: 1 }, unity: 2 }, rng);
      } else {
        st.redLeader = 'hostile';
        notes.push('The Red Front elects a radical leader. They align with the Black League.');
        st.affinity.red = clamp((st.affinity.red || 0) - 10, 0, 100);
        st.affinity.bl = clamp((st.affinity.bl || 0) + 10, 0, 100);
        applyEffects(st, { party: { bl: 3, red: 2 }, demo: { buskids: -2, honor: -3 }, faculty: -5 }, rng);
        notes.push('The Black League gains influence as the Red Front radicalizes.');
      }
    }
    return notes;
  }

  /* ---------------- IIA Splinter ---------------- */
  function checkIIASplinter(st, rng) {
    var notes = [];
    if (st.iiaSplinterTriggered) return notes;
    if (st.week !== 10) return notes;
    if (!st.raw.iia) return notes;

    var iiaSupport = getPartySupport(st, 'iia');
    console.log('IIA Support at week 10:', iiaSupport);

    if (iiaSupport > 20) {
      notes.push('IIA remains stable with ' + Math.round(iiaSupport) + '% support.');
      st.iiaSplinterTriggered = true;
      return notes;
    }

    st.iiaSplinterTriggered = true;
    notes.push('🔵 IIA SPLINTER: The Tech & Innovation Alliance has fractured at week 10!');

    var splitFactor = 0.4 + rng() * 0.3;

    if (!st.raw.tiia) {
      st.raw.tiia = {};
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          st.raw.tiia[D.DEMOS[i].id] = 0.5;
        }
      }
    }

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var iiaVal = st.raw.iia ? st.raw.iia[dm.id] : 10;
        var transfer = iiaVal * splitFactor;
        st.raw.iia[dm.id] = Math.max(0.5, iiaVal - transfer);
        st.raw.tiia[dm.id] = Math.max(0.5, (st.raw.tiia[dm.id] || 0) + transfer);
      }
    }

    st.affinity.tiia = st.affinity.tiia || 20;
    st.tiiaExists = true;

    notes.push('🆕 A new faction has emerged: TIIA (Tech & Innovation Independent Alliance)');
    notes.push(' IIA dropped to ' + Math.round(iiaSupport * (1 - splitFactor)) + '%');
    notes.push(' TIIA now holds ' + Math.round(iiaSupport * splitFactor) + '% support');

    st.log.push('Week ' + st.week + ': IIA splits - TIIA emerges');
    return notes;
  }

  /* ---------------- TIIA Joins Black League ---------------- */
  function checkTIIAJoinsBL(st, rng) {
    var notes = [];
    if (st.tiiaJoinedBL) return notes;
    if (st.week !== 15) return notes;
    if (st.tiiaChecked) return notes;
    if (!st.raw.tiia) return notes;

    var tiiaSupport = getPartySupport(st, 'tiia');
    st.tiiaChecked = true;
    console.log('TIIA Support at week 15:', tiiaSupport);

    if (tiiaSupport > 10) {
      notes.push('TIIA has weathered the storm with ' + Math.round(tiiaSupport) + '% support. They remain independent.');
      st.affinity.tiia = clamp((st.affinity.tiia || 0) + 10, 0, 100);
      st.log.push('Week ' + st.week + ': TIIA stabilizes as an independent force');
      return notes;
    }

    st.tiiaJoinedBL = true;
    notes.push('TIIA CRISIS: The Tech & Innovation Independent Alliance has collapsed at week 15!');

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var tiiaVal = st.raw.tiia ? st.raw.tiia[dm.id] : 0;
        if (st.raw.bl) {
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + tiiaVal * 0.7);
        }
        if (st.raw.tiia) {
          st.raw.tiia[dm.id] = Math.max(0.5, tiiaVal * 0.2);
        }
      }
    }

    st.affinity.bl = clamp((st.affinity.bl || 0) + 10, 0, 100);
    st.affinity.tiia = clamp((st.affinity.tiia || 0) - 20, 0, 100);

    notes.push('The remnants of TIIA have been absorbed by the Black League.');
    notes.push('Black League influence has grown significantly.');

    st.log.push('Week ' + st.week + ': TIIA collapses - joins Black League');
    return notes;
  }

  /* ---------------- IIA Congress (Week 8) ---------------- */
  function checkIIACongress(st, rng) {
    if (st.flags && st.flags.iiaCongressDone) return [];
    if (st.week !== 8) return [];

    st.flags.iiaCongressDone = true;
    var aff = st.affinity.iia || 50;
    var notes = [];
    var body = '';
    var choices = [];

    if (aff >= 80) {
      // VERY GOOD: PL Leader takes over, merges with IIA, might join ZMP
      body = "The IIA Congress convenes. With your strong alliance, the leader of the PL takes over the IIA! The two parties merge into a single, powerful bloc. The new united leadership looks to the ZMP for guidance. They are ready to stand with you permanently.";
      
      // Merge PL into IIA
      if (st.merged.indexOf('pl') === -1) {
         st.merged.push('pl');
         if (st.raw.pl && st.raw.iia && D && D.DEMOS) {
           for (var i = 0; i < D.DEMOS.length; i++) {
             var dm = D.DEMOS[i].id;
             var plVal = st.raw.pl[dm] || 0;
             st.raw.iia[dm] = Math.max(0.5, (st.raw.iia[dm] || 0) + plVal * 0.8);
             st.raw.pl[dm] = 0; // PL is now absorbed
           }
         }
      }
      notes.push('The PL merges into the IIA.');
      
      choices = [
        { text: 'Invite them to join the ZMP coalition.', note: 'They will accept. The IIA officially joins your government.', effects: { iiaCongressJoinZMP: true } },
        { text: 'Let them run independently as a strong ally.', note: 'They remain a separate party, but are completely loyal to you.', effects: { iiaCongressAlly: true } }
      ];
    } else if (aff >= 60) {
      // GOOD/OK: Unity candidate takes over
      body = "The IIA Congress convenes. A pragmatic Unity candidate takes over the leadership. They are stable, reasonable, and willing to negotiate, but they will not simply hand you their party. Relations remain warm.";
      st.affinity.iia = Math.min(100, st.affinity.iia + 5);
      notes.push('IIA elects a stable Unity candidate. Affinity +5.');
      choices = [{ text: 'Continue.', note: '' }];
    } else if (aff >= 40) {
      // NEUTRAL: Leadership stays
      body = "The IIA Congress convenes. The current leadership barely holds onto power against internal challengers. They remain independent and wary of your advances. For now, the status quo holds.";
      choices = [{ text: 'Continue.', note: '' }];
    } else if (aff >= 20) {
      // BAD: Leadership stays, relations -10, Left gains ground
      body = "The IIA Congress convenes. The current leadership survives, but they are furious with the ZMP. Relations worsen, and the radical left-wing factions (Red Front and Red Bench) gain significant ground within their ranks. The IIA is drifting away from you.";
      
      st.affinity.iia = Math.max(0, st.affinity.iia - 10);
      notes.push('IIA relations -10.');
      
      if (D && D.DEMOS && st.raw.iia) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i].id;
          var steal = (st.raw.iia[dm] || 0) * 0.1; // 10% shift
          st.raw.iia[dm] = Math.max(0.5, (st.raw.iia[dm] || 0) - steal);
          if (st.raw.red) st.raw.red[dm] = Math.max(0.5, (st.raw.red[dm] || 0) + steal * 0.5);
          if (st.raw.rb) st.raw.rb[dm] = Math.max(0.5, (st.raw.rb[dm] || 0) + steal * 0.5);
        }
      }
      notes.push('Left-wing factions (Red Front, Red Bench) gain ground inside the IIA.');
      choices = [{ text: 'Continue.', note: '' }];
    } else {
      // VERY BAD: Reforms to NLP (Zalgrilian), coalition impossible
      body = "The IIA Congress is a disaster. A hostile, radical Zalgrilian faction seizes control. The party reforms into the New Liberal Party (NLP). Outraged by their betrayal, the ZMP officially declares them the 'New Liberal Cancer' (NLC). Any coalition with them is now impossible.";
      
      if (D && D.PARTIES) {
        for (var i = 0; i < D.PARTIES.length; i++) {
          if (D.PARTIES[i].id === 'iia') {
            D.PARTIES[i].name = 'New Liberal Party';
            D.PARTIES[i].short = 'NLC'; // The UI will now show NLC everywhere
            D.PARTIES[i].tag = 'NLC';
            D.PARTIES[i].color = '#1a5c3a'; // Darker green
            D.PARTIES[i].spirit = 8;
            D.PARTIES[i].gates = 7;
            D.PARTIES[i].blurb = 'The New Liberal Party. Branded the New Liberal Cancer by the ZMP.';
            break;
          }
        }
      }
      
      st.flags.iiaCoalitionImpossible = true;
      st.affinity.iia = 0;
      
      notes.push('IIA reforms into the New Liberal Party. The ZMP brands them the New Liberal Cancer (NLC). Coalition is now impossible.');
      choices = [{ text: 'They have made their choice.', note: '' }];
    }

    st.pendingEvent = {
      id: 'iia_congress_week_8',
      week: st.week,
      title: 'The IIA Congress',
      body: body,
      choices: choices
    };

    return notes;
  }

  /* ---------------- IIA Joins ZMP ---------------- */
  function checkIIAJoinsZMP(st, rng) {
    var notes = [];
    if (st.iiaJoinedZMP) return notes;
    if (st.week !== 12) return notes;
    if (!st.raw.iia || st.merged.indexOf('iia') !== -1) return notes;

    var blSupport = getPartySupport(st, 'bl');
    console.log('Black League Support at week 12:', blSupport);

    if (blSupport > 40) {
      st.iiaJoinedZMP = true;
      notes.push('IIA JOINS ZMP: With Black League at ' + Math.round(blSupport) + '%, IIA seeks protection in your coalition!');
      notes = notes.concat(doMerge(st, 'iia'));
      st.coalitionStability = clamp((st.coalitionStability || 80) + 10, 0, 100);
      st.log.push('Week ' + st.week + ': IIA joins ZMP (Black League threat)');
    } else {
      notes.push('IIA remains independent. Black League support is only ' + Math.round(blSupport) + '%.');
      st.affinity.iia = clamp((st.affinity.iia || 0) + 5, 0, 100);
    }

    return notes;
  }

  /* ---------------- Red Front Leadership ---------------- */
  function checkRedLeadership(st, rng) {
    var notes = [];
    if (st.redLeadershipChecked) return notes;
    if (st.week !== 12) return notes;
    if (!st.raw.red) return notes;

    st.redLeadershipChecked = true;
    var redAffinity = st.affinity.red || 35;
    console.log('Red Front Affinity at week 12:', redAffinity);

    if (redAffinity > 70) {
      st.redLeader = 'friendly';
      st.redGoodLeader = true;
      st.redLeaderWeek = st.week;
      notes.push(' RED FRONT: A good leader emerges! Relations are strong (' + Math.round(redAffinity) + '%).');
      notes.push('The Red Front elects a pragmatic leader. They will cooperate with you.');
      st.affinity.red = clamp((st.affinity.red || 0) + 15, 0, 100);
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 1.5);
        }
      }
      st.log.push('Week ' + st.week + ': Red Front elects good leader');
    } else if (redAffinity >= 30) {
      st.redLeader = 'independent';
      notes.push(' RED FRONT: A moderate leader emerges. Relations are neutral (' + Math.round(redAffinity) + '%).');
      notes.push('The Red Front remains independent for now.');
      st.affinity.red = clamp((st.affinity.red || 0) + 5, 0, 100);
      st.log.push('Week ' + st.week + ': Red Front elects moderate leader');
    } else {
      st.redLeader = 'hostile';
      st.redBadLeader = true;
      st.redLeaderWeek = st.week;
      notes.push(' RED FRONT: A bad leader emerges! Relations are poor (' + Math.round(redAffinity) + '%).');
      notes.push('The Red Front elects a radical leader. They will cause trouble.');
      st.affinity.red = clamp((st.affinity.red || 0) - 15, 0, 100);
      st.affinity.bl = clamp((st.affinity.bl || 0) + 15, 0, 100);
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          if (dm.id === 'buskids' || dm.id === 'freshmen') {
            st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) + 3);
          } else if (dm.id === 'honor' || dm.id === 'seniors') {
            st.raw.red[dm.id] = Math.max(0.5, (st.raw.red[dm.id] || 0) - 3);
          }
        }
      }
      applyEffects(st, { party: { bl: 3 }, demo: { buskids: -2, honor: -3 }, faculty: -5 }, rng);
      st.log.push('Week ' + st.week + ': Red Front elects bad leader');
    }

    return notes;
  }



  /* ---------------- Red Front Joins ZMP ---------------- */
  function checkRedJoinsZMP(st, rng) {
    var notes = [];
    if (st.redJoinedZMP) return notes;
    if (!st.redGoodLeader) return notes;
    if (!st.redLeaderWeek) return notes;
    
    var weeksSince = st.week - st.redLeaderWeek;
    if (weeksSince !== 5) return notes;
    
    st.redJoinedZMP = true;
    notes.push('RED FRONT JOINS ZMP: The good leader brings the Red Front into your coalition!');
    notes = notes.concat(doMerge(st, 'red'));
    st.coalitionStability = clamp((st.coalitionStability || 80) + 15, 0, 100);
    st.log.push('Week ' + st.week + ': Red Front joins ZMP');
    return notes;
  }

  /* ---------------- Red Front Joins Black League ---------------- */
  function checkRedJoinsBL(st, rng) {
    var notes = [];
    if (st.redJoinedBL) return notes;
    if (!st.redBadLeader) return notes;
    if (!st.redLeaderWeek) return notes;
    
    var weeksSince = st.week - st.redLeaderWeek;
    if (weeksSince !== 10) return notes;
    
    st.redJoinedBL = true;
    notes.push('RED FRONT JOINS BLACK LEAGUE: The bad leader has led the Red Front into the Black League!');
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var redVal = st.raw.red ? st.raw.red[dm.id] : 0;
        if (st.raw.bl) {
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + redVal * 0.6);
        }
        if (st.raw.red) {
          st.raw.red[dm.id] = Math.max(0.5, redVal * 0.2);
        }
      }
    }
    
    st.affinity.bl = clamp((st.affinity.bl || 0) + 15, 0, 100);
    st.affinity.red = clamp((st.affinity.red || 0) - 20, 0, 100);
    st.log.push('Week ' + st.week + ': Red Front joins Black League');
    return notes;
  }

  /* ---------------- Other Red Joins Black League ---------------- */
  function checkOtherRedJoinsBL(st, rng) {
    var notes = [];
    if (st.otherRedJoinedBL) return notes;
    if (st.week !== 5) return notes;
    if (!st.raw.rb) return notes;
    
    console.log(' RED BENCH losing support to Black League at week 5!');
    st.otherRedJoinedBL = true;
    notes.push(' RED BENCH: The Red Bench is losing members to the Black League at week 5!');
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var rbVal = st.raw.rb ? st.raw.rb[dm.id] : 0;
        var transfer = rbVal * (0.3 + rng() * 0.1);
        if (st.raw.bl) {
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + transfer);
        }
        if (st.raw.rb) {
          st.raw.rb[dm.id] = Math.max(0.5, rbVal - transfer * 0.5);
        }
      }
    }
    
    st.affinity.bl = clamp((st.affinity.bl || 0) + 10, 0, 100);
    st.affinity.rb = clamp((st.affinity.rb || 0) - 15, 0, 100);
    st.log.push('Week ' + st.week + ': Red Bench joins Black League');
    return notes;
  }

  /* ---------------- ZPF Joins ---------------- */
  function checkZPFJoins(st, rng) {
    var notes = [];
    if (st.zpfJoinedZMP) return notes;
    if (st.week !== 20) return notes;
    if (!st.raw.zpf) return notes;
    if (st.merged.indexOf('zpf') !== -1) return notes;

    var spiritSupportVal = spiritSupport(st);
    console.log('Spirit Maximalism Support at week 20:', spiritSupportVal);

    if (spiritSupportVal > 60) {
      st.zpfJoinedZMP = true;
      notes.push('ZPF JOINS ZMP: Spirit Maximalism is at ' + Math.round(spiritSupportVal) + '%! The Centre Party joins your coalition.');
      notes = notes.concat(doMerge(st, 'zpf'));
      st.coalitionStability = clamp((st.coalitionStability || 80) + 15, 0, 100);
      st.log.push('Week ' + st.week + ': ZPF joins ZMP (Spirit Maximalism)');
    } else {
      notes.push('ZPF remains independent. Spirit Maximalism is only ' + Math.round(spiritSupportVal) + '%.');
      st.affinity.zpf = clamp((st.affinity.zpf || 0) + 5, 0, 100);
      st.log.push('Week ' + st.week + ': ZPF stays independent');
    }

    return notes;
  }

  /* ---------------- Election Functions ---------------- */
  function isElectionWeek(st) {
    if (!st || !st.electionWeeks) return false;
    for (var i = 0; i < st.electionWeeks.length; i++) {
      if (st.electionWeeks[i] === st.week) return true;
    }
    return false;
  }

  function runElection(st, rng) {
    var cur = current(st);
    var seats = cur.seats;
    st.seats = seats;
    st.electionCycle = (st.electionCycle || 0) + 1;
    st.lastElectionWeek = st.week;

    var mySeats = seats.ZMP || 0;
    var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;
    var hasMajority = mySeats >= majority;

    var notes = [];
    notes.push('═══════════════════════════════════════');
    notes.push('🗳️  ELECTION RESULTS — Week ' + st.week);
    notes.push('═══════════════════════════════════════');
    notes.push('ZMP: ' + mySeats + ' seats (' + Math.round(cur.totals.ZMP || 0) + '%)');

    var sorted = Object.keys(seats).sort(function(a, b) { return (seats[b] || 0) - (seats[a] || 0); });
    for (var i = 0; i < Math.min(6, sorted.length); i++) {
      var pid = sorted[i];
      if (pid !== 'ZMP' && seats[pid] > 0) {
        var p = getParty(pid);
        notes.push((p ? p.short : pid) + ': ' + seats[pid] + ' seats');
      }
    }

    if (hasMajority) {
      notes.push(' ZMP has a majority. Coalition is stable.');
      st.coalitionStability = Math.min(100, (st.coalitionStability || 80) + 20);
    } else {
      notes.push(' ZMP does not have a majority. Coalition is fragile.');
      st.coalitionStability = Math.max(0, (st.coalitionStability || 80) - 15);
    }

    if (st.raw.tiia && st.merged.indexOf('tiia') === -1) {
      var tiiaSeats = seats.tiia || 0;
      if (tiiaSeats > 0) {
        notes.push(' TIIA has entered parliament with ' + tiiaSeats + ' seats.');
      }
    }

    notes.push('═══════════════════════════════════════');

    return notes;
  }

  /* ---------------- Generate Election Event Data ---------------- */
  function generateElectionEventData(st, rng) {
    var cur = current(st);
    var seats = cur.seats;
    var prev = st.history.length > 1 ? st.history[st.history.length - 2] : null;
    var mine = seats.ZMP || 0;
    var electionNum = (st.electionCycle || 0);
    
    var partyRows = [];
    var allPids = Object.keys(cur.totals);
    allPids.sort(function(a, b) {
      return (cur.totals[b] || 0) - (cur.totals[a] || 0);
    });
    
    allPids.forEach(function(pid) {
      if (pid === 'other') return;
      var p = getParty(pid);
      if (!p) return;
      
      var voteShare = cur.totals[pid] || 0;
      var seatCount = seats[pid] || 0;

      
      if (pid === 'zalian_list') {
        seatCount = (seats['zap'] || 0) + (seats['zlp'] || 0) + (seats['other_zalian'] || 0);
      }

      var prevVote = prev ? (prev.totals[pid] || 0) : voteShare;
      var prevSeat = prev ? (prev.seats[pid] || 0) : seatCount;

      if (prev && pid === 'zalian_list') {
        prevSeat = (prev.seats['zap'] || 0) + (prev.seats['zlp'] || 0) + (prev.seats['other_zalian'] || 0);
      }
      var voteChange = voteShare - prevVote;
      var seatChange = seatCount - prevSeat;
      
      partyRows.push({
        id: pid,
        short: p.short,
        color: p.color,
        voteShare: voteShare,
        voteChange: voteChange,
        seatCount: seatCount,
        seatChange: seatChange
      });
    });
    
    var othersVote = cur.totals.other || 0;
    var prevOthers = prev ? (prev.totals.other || 0) : othersVote;
    partyRows.push({
      id: 'other',
      short: 'Others',
      color: '#9aa0a6',
      voteShare: othersVote,
      voteChange: othersVote - prevOthers,
      seatCount: null,
      seatChange: null
    });
    
    partyRows.sort(function(a, b) { return b.voteShare - a.voteShare; });
    
    function getSeats(pid) { 
      if (pid === 'zalian_list') {
         return (seats['zap'] || 0) + (seats['zlp'] || 0) + (seats['other_zalian'] || 0);
      }
      return seats[pid] || 0; 
    }
    var mySeats = seats.ZMP || 0;
    
    var coalitions = [];
    
    var zmp_semp = mySeats + getSeats('semp');
    if (zmp_semp >= D.MAJORITY) {
      coalitions.push({
        key: 'zalgrilian',
        name: 'Zalgrilian Front',
        combo: ['ZMP', 'SEMP'],
        seats: zmp_semp,
        willing: Math.min(100, (st.affinity.semp || 50) + 10),
        description: 'A spirit-focused alliance. SEMP brings energy and enthusiasm.'
      });
    }

    // --- ZALIAN ACCORD ---
    var zalianSeats = getSeats('zalian_list');
    if (st.flags && st.flags.zalianListFormed && zalianSeats > 0) {
      var zalianTotal = mySeats + zalianSeats;
      if (zalianTotal >= D.MAJORITY) {
        coalitions.push({
          key: 'zalian_accord',
          name: 'Zalian Accord',
          combo: ['ZMP', 'Zalian List'],
          seats: zalianTotal,
          willing: Math.min(100, (st.affinity.zalian_list || 50) + 10),
          description: 'A broad regionalist alliance. Recognizes the Zalian List as a unified partner.'
        });
      }
    }
    
    var leftBlock = mySeats + getSeats('semp') + getSeats('zpf');
    if (leftBlock >= D.MAJORITY) {
      coalitions.push({
        key: 'leftblock',
        name: 'Left Block',
        combo: ['ZMP', 'SEMP', 'ZPF'],
        seats: leftBlock,
        willing: Math.min(100, Math.min(st.affinity.semp || 50, st.affinity.zpf || 50) + 5),
        description: 'A broad centre-left coalition. SEMP and ZPF bridge the wings.'
      });
    }

    var redAlliance = mySeats + getSeats('red') + getSeats('rb') + getSeats('iia') + getSeats('pl');
    if (redAlliance >= D.MAJORITY) {
      coalitions.push({
        key: 'redalliance',
        name: 'Red Alliance',
        combo: ['ZMP', 'RED', 'RB', 'IIA', 'PL'],
        seats: redAlliance,
        willing: Math.min(100, Math.min(
          st.affinity.red || 50,
          st.affinity.rb || 50,
          st.affinity.iia || 50,
          st.affinity.pl || 50
        ) + 5),
        description: 'A broad left-tech coalition. Combines Red Front energy, Red Bench labour, IIA innovation, and PL spirit.'
      });
    }
    
    var rgbAlliance = mySeats + getSeats('iia') + getSeats('red');
    if (rgbAlliance >= D.MAJORITY) {
      coalitions.push({
        key: 'rgb',
        name: 'RGB Alliance',
        combo: ['ZMP', 'IIA', 'RED'],
        seats: rgbAlliance,
        willing: Math.min(100, Math.min(st.affinity.iia || 50, st.affinity.red || 50) + 5),
        description: 'Tech and labour united. Innovation meets the working class.'
      });
    }
    
    var grandCoalition = mySeats + getSeats('zpf') + getSeats('iia');
    if (grandCoalition >= D.MAJORITY) {
      coalitions.push({
        key: 'grand',
        name: 'Grand Coalition',
        combo: ['ZMP', 'ZPF', 'IIA'],
        seats: grandCoalition,
        willing: Math.min(100, Math.min(st.affinity.zpf || 50, st.affinity.iia || 50) + 5),
        description: 'The broadest possible alliance. Moderates from centre and tech unite.'
      });
    }
    
    var blackRed = mySeats + getSeats('red') + getSeats('bl');
    if (blackRed >= D.MAJORITY) {
      coalitions.push({
        key: 'blackred',
        name: 'Black-Red Alliance',
        combo: ['ZMP', 'RED', 'BL'],
        seats: blackRed,
        willing: Math.min(100, Math.min(st.affinity.red || 50, st.affinity.bl || 50) - 10),
        description: 'A radical coalition. High risk, high reward. Faculty will not approve.'
      });
    }
    
    var centreAlliance = mySeats + getSeats('zpf');
    if (centreAlliance >= D.MAJORITY && coalitions.length < 2) {
      coalitions.push({
        key: 'zpfonly',
        name: 'Centre Alliance',
        combo: ['ZMP', 'ZPF'],
        seats: centreAlliance,
        willing: Math.min(100, (st.affinity.zpf || 50) + 15),
        description: 'A stable centre alliance with the ZPF.'
      });
    }

    var partyVotes = {};
  var active = activeParties(st);
  active.forEach(function(p) {
    if (p.id !== 'ZMP' && p.id !== 'other') {
      var affinity = st.affinity[p.id] || 50;
      var yeaChance = affinity / 100;
      partyVotes[p.id] = rng() < yeaChance ? 'yea' : 'nay';
    }
  });
  partyVotes.ZMP = 'yea';
  
  var yeaVotes = Object.keys(partyVotes).filter(function(pid) { return partyVotes[pid] === 'yea'; }).length;
  var nayVotes = Object.keys(partyVotes).filter(function(pid) { return partyVotes[pid] === 'nay'; }).length;
  
  coalitions.sort(function(a, b) { return b.seats - a.seats; });
  
  return {
    electionNum: electionNum,
    partyRows: partyRows,
    coalitions: coalitions,
    mySeats: mySeats,
    totalSeats: D.SEATS,
    majority: D.MAJORITY,
    hasMajority: mySeats >= D.MAJORITY,
    partyVotes: partyVotes,
    yeaVotes: yeaVotes,
    nayVotes: nayVotes

    };
  }

  function getElectionLabel(num) {
    var labels = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];
    return (num < labels.length ? labels[num] : 'Election #' + num);
  }

  /* ---------------- Coalition Stability ---------------- */
  function checkCoalitionBreak(st, rng) {
    if (!st.coalitionPartners || st.coalitionPartners.length === 0) return null;

    var breakChance = 0;
    var unhappyPartners = [];

    for (var i = 0; i < st.coalitionPartners.length; i++) {
      var pid = st.coalitionPartners[i];
      var aff = st.affinity[pid] || 50;
      if (aff < 30) {
        breakChance += 0.15;
        unhappyPartners.push(pid);
      } else if (aff < 50) {
        breakChance += 0.05;
      }
    }

    breakChance = breakChance * (1 - (st.coalitionStability || 80) / 200);

    if (rng() < breakChance && unhappyPartners.length > 0) {
      var leaving = unhappyPartners[Math.floor(rng() * unhappyPartners.length)];
      var p = getParty(leaving);

      st.coalitionPartners = st.coalitionPartners.filter(function(pid) { return pid !== leaving; });
      st.coalitionStability = Math.max(0, (st.coalitionStability || 80) - 30);

      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
          if (st.raw[leaving]) {
            st.raw[leaving][dm.id] = Math.max(0.5, (st.raw[leaving][dm.id] || 0) + 3);
          }
        }
      }

      return {
        party: leaving,
        name: p ? p.name : leaving,
        short: p ? p.short : leaving,
        reason: 'low_affinity'
      };
    }

    return null;
  }

  /* ---------------- Do Action ---------------- */
  function doAction(st, actionId, targetId, rng) {
    var act = null;
    
    if (D && D.ACTIONS) {
      for (var i = 0; i < D.ACTIONS.length; i++) {
        if (D.ACTIONS[i].id === actionId) { act = D.ACTIONS[i]; }
      }
    }
    
    if (!act && D && D.GOV_ACTIONS) {
      for (var i = 0; i < D.GOV_ACTIONS.length; i++) {
        if (D.GOV_ACTIONS[i].id === actionId) { act = D.GOV_ACTIONS[i]; }
      }
    }
    
    if (!act && D && D.CRISIS_ACTIONS) {
      for (var i = 0; i < D.CRISIS_ACTIONS.length; i++) {
        if (D.CRISIS_ACTIONS[i].id === actionId) { act = D.CRISIS_ACTIONS[i]; }
      }
    }
    
    if (!act && D && D.RELATIONS_ACTIONS) {
      for (var i = 0; i < D.RELATIONS_ACTIONS.length; i++) {
        if (D.RELATIONS_ACTIONS[i].id === actionId) { act = D.RELATIONS_ACTIONS[i]; }
      }
    }
    
    if (!act) return { ok: false, msg: 'Unknown action.' };
    if (st.ap < act.ap) return { ok: false, msg: 'No action points left this week.' };
    if (st.funds < act.budget) return { ok: false, msg: 'Not enough funds.' };
    if (st.volunteers < act.vol) return { ok: false, msg: 'Not enough volunteers.' };

    st.ap -= act.ap;
    st.funds -= act.budget;

    var msg = '', eff = {}, notes = [];
    var mult = 1 + (st.momentum || 0) * 0.03 + (st.volunteers - 10) * 0.012;
    mult = clamp(mult, 0.5, 2.2);

    if (actionId === 'canvass') {
      var dm = targetId;
      eff.demo = {};
      eff.demo[dm] = 3.2 * mult;
      msg = 'Canvassers work ' + demoName(dm) + ' all week.';
    } else if (actionId === 'rally') {
      eff.demo = {};
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          eff.demo[D.DEMOS[i].id] = 1.0 * mult;
        }
      }
      eff.demo.freshmen = (eff.demo.freshmen || 0) + 1.2 * mult;
      if (st.spirit >= 7) {
        eff.demo.athletes = (eff.demo.athletes || 0) + 1;
        eff.demo.honor = (eff.demo.honor || 0) - 0.8;
      }
      eff.momentum = 2;
      msg = 'A rally in the gym. Loud, warm, briefly convincing.';
    } else if (actionId === 'posters') {
      eff.demo = { freshmen: 1.8 * mult, gamers: 0.8 * mult, arts: 0.9 * mult, athletes: 0.6 * mult };
      msg = 'Posters go up on every door in the building.';
    } else if (actionId === 'recruit') {
      var got = Math.round(2 + rng() * 3 + (st.momentum || 0) * 0.2);
      eff.vol = got;
      msg = got + ' new volunteers sign up.';
    } else if (actionId === 'fundraise') {
      var raised = Math.round(16 + st.volunteers * 1.6 + rng() * 12);
      eff.funds = raised;
      msg = 'The bake sale clears $' + raised + '.';
    } else if (actionId === 'negotiate') {
      var gain = Math.round(8 + rng() * 10 + (st.momentum || 0) * 0.4);
      eff.affinity = {};
      eff.affinity[targetId] = gain;
      eff.coalitionStability = 2;
      msg = 'Talks with ' + partyName(targetId) + ' go somewhere. Affinity +' + gain + '.';
    } else if (actionId === 'attack') {
      eff.party = {};
      eff.party[targetId] = -3.5 * mult;
      eff.affinity = {};
      eff.affinity[targetId] = -14;
      eff.faculty = -5;
      eff.unity = -2;
      eff.coalitionStability = -5;
      msg = 'Flyers attacking ' + partyName(targetId) + ' appear overnight.';
    } else if (actionId === 'form_list') {
      if (!st.electoralLists) st.electoralLists = {};
      st.electoralLists[targetId] = getPlayerPartyId(st);
      msg = targetId.toUpperCase() + ' joins your electoral list.';} else if (actionId === 'coalition') {
      var cGain = Math.round(10 + rng() * 15 + (st.momentum || 0) * 0.5 + (st.unity - 50) * 0.2);
      eff.affinity = {};
      eff.affinity[targetId] = cGain;
      eff.unity = 3;
      eff.momentum = 1;
      eff.coalitionStability = 5;

      var currentAff = st.affinity[targetId] || 50;
      if (currentAff + cGain >= 60 && st.coalitionPartners.indexOf(targetId) === -1) {
        st.coalitionPartners.push(targetId);
        msg = targetId.toUpperCase() + ' joins the coalition!';
      } else {
        msg = 'Intensive coalition talks with ' + partyName(targetId) + ' bear fruit. Affinity +' + cGain + '.';
      }
    } else if (actionId === 'gov_investigate') {
      var blSupport = getPartySupport(st, 'bl');
      var risk = 0.3 + (blSupport / 100) * 0.3;
      if (rng() < risk) {
        notes.push('The investigation backfires! The Black League rallies against you.');
        applyEffects(st, { party: { bl: 5 }, demo: { freshmen: -2, honor: -3 }, faculty: -8 }, rng);
      } else {
        notes.push('The investigation reveals Black League activities. Support drops!');
        applyEffects(st, { party: { bl: -8 }, demo: { honor: 3, freshmen: 2 }, faculty: 5 }, rng);
      }
      msg = 'You launch an investigation into the Black League.';
    } else if (actionId === 'gov_economy') {
      if (rng() < 0.6) {
        var gain = 4 + rng() * 4;
        notes.push('Economic policies succeed! The school budget is healthier.');
        applyEffects(st, { demo: { honor: gain, seniors: gain * 0.7, freshmen: gain * 0.5 }, funds: 15, faculty: 5 }, rng);
      } else {
        notes.push('Economic reforms face resistance. Mixed results.');
        applyEffects(st, { demo: { honor: 1, freshmen: -1 }, funds: 5, faculty: -3 }, rng);
      }
      msg = 'You manage the school\'s finances and economy.';
    } else if (actionId === 'gov_healthcare') {
      notes.push('Healthcare reforms are implemented. Students appreciate the changes.');
      applyEffects(st, { demo: { buskids: 6, freshmen: 4, honor: 2, athletes: 2 }, unity: 3, faculty: 5 }, rng);
      msg = 'You improve school healthcare services.';
    } else if (actionId === 'gov_education') {
      if (rng() < 0.5) {
        notes.push('Education reforms are popular! Faculty and students approve.');
        applyEffects(st, { demo: { honor: 5, gamers: 4, arts: 3 }, faculty: 8, unity: 3 }, rng);
      } else {
        notes.push('Education reforms are controversial. Mixed reactions.');
        applyEffects(st, { demo: { honor: 2, freshmen: -2 }, faculty: -5, unity: -2 }, rng);
      }
      msg = 'You reform the school\'s education programs.';
    } else if (actionId === 'gov_infrastructure') {
      notes.push('Infrastructure projects begin. The school is improving!');
      applyEffects(st, { demo: { athletes: 6, gamers: 4, buskids: 5, honor: 3 }, funds: -10, faculty: 10 }, rng);
      msg = 'You invest in school infrastructure.';
    } else if (actionId === 'gov_social') {
      notes.push('Social programs are launched. Community support grows.');
      applyEffects(st, { demo: { freshmen: 6, buskids: 5, arts: 3, seniors: 2 }, volunteers: 5, unity: 4 }, rng);
      msg = 'You implement student welfare programs.';
    } else if (actionId === 'rally_foreign') {
      var foreignNotes = rallyForeignSupport(st, rng);
      notes = notes.concat(foreignNotes);
      msg = 'You rally foreign support for the ZMP.';
    } else if (actionId === 'learn_economy') {
      notes.push('Harvard economic advisors improve your policies.');
      st.harvardAdvisor = true;
      st.economyBoost = 0.25;
      msg = 'You study economics with Harvard advisors.';
    } else if (actionId === 'who_healthcare') {
      notes.push('WHO healthcare programs are implemented.');
      st.whoAdvisor = true;
      st.healthcareBoost = 0.25;
      msg = 'WHO healthcare programs launched.';
    } else if (actionId === 'crisis_push_bl') {
      var hasAllies = st.coalitionPartners && st.coalitionPartners.length > 0;
      var blSupport2 = getPartySupport(st, 'bl');
      var successChance = 0.3 + (st.unity / 200) + (st.faculty / 200) + (st.momentum / 80);
      
      if (rng() < successChance) {
        notes.push(' Your push against the Black League is successful!');
        notes.push('They are forced to retreat and lose momentum.');
        
        if (!hasAllies) {
          if (D && D.DEMOS) {
            for (var i = 0; i < D.DEMOS.length; i++) {
              var dm = D.DEMOS[i];
              var blVal = st.raw.bl ? st.raw.bl[dm.id] || 0 : 0;
              var transfer = blVal * 0.08;
              st.raw.bl[dm.id] = Math.max(0.5, blVal - transfer);
              st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + transfer);
            }
          }
          notes.push('📈 BL loses votes to ZMP!');
        } else {
          if (D && D.DEMOS) {
            for (var i = 0; i < D.DEMOS.length; i++) {
              var dm = D.DEMOS[i];
              var blVal = st.raw.bl ? st.raw.bl[dm.id] || 0 : 0;
              var transfer = blVal * 0.1;
              var toZPF = transfer * 0.5;
              var toIIA = transfer * 0.5;
              st.raw.bl[dm.id] = Math.max(0.5, blVal - transfer);
              st.raw.zpf[dm.id] = Math.max(0.5, (st.raw.zpf[dm.id] || 0) + toZPF);
              st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + toIIA);
            }
          }
          notes.push('📈 BL loses votes to ZPF and IIA!');
          st.affinity.zpf = clamp((st.affinity.zpf || 0) + 5, 0, 100);
          st.affinity.iia = clamp((st.affinity.iia || 0) + 5, 0, 100);
        }
        st.affinity.bl = clamp((st.affinity.bl || 0) - 10, 0, 100);
        st.momentum = clamp((st.momentum || 0) + 3, -10, 20);
        st.unity = clamp(st.unity + 3, 0, 100);
        st.faculty = clamp(st.faculty + 2, 0, 100);
        st.log.push('Week ' + st.week + ': Crisis - Pushed BL back');
      } else {
        notes.push(' Your push against the Black League fails spectacularly!');
        notes.push('They use your aggression to rally more support.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 4);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 3);
          }
        }
        st.affinity.bl = clamp((st.affinity.bl || 0) + 8, 0, 100);
        st.momentum = clamp((st.momentum || 0) - 4, -10, 20);
        st.unity = clamp(st.unity - 5, 0, 100);
        st.faculty = clamp(st.faculty - 3, 0, 100);
        notes.push('📈 BL +4%, ZMP -3%');
        st.log.push('Week ' + st.week + ': Crisis - Push failed');
      }
      msg = 'You launch a desperate push against the Black League.';
    } else if (actionId === 'crisis_sabotage') {
      var sabotageLevel = st.blSabotageLevel || 0;
      if (sabotageLevel < 5) {
        st.blSabotageLevel = (st.blSabotageLevel || 0) + 1;
        notes.push(' Your sabotage operation is successful!');
        notes.push('The Black League\'s legions have been weakened.');
        notes.push('Current sabotage level: ' + st.blSabotageLevel + '/5');
        
        var reduction = st.blSabotageLevel * 0.1;
        var firstBattleMult = Math.max(0.5, 1 - reduction);
        var secondBattleMult = st.battle1Lost ? Math.max(2.5, 4 - reduction * 3) : Math.max(1.5, 2 - reduction * 1);
        
        st.blFirstBattleMultiplier = firstBattleMult;
        st.blSecondBattleMultiplier = secondBattleMult;
        
        notes.push(' First Battle multiplier: ' + firstBattleMult.toFixed(1) + 'x');
        notes.push(' Second Battle multiplier: ' + secondBattleMult.toFixed(1) + 'x');
        
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 1);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 0.5);
          }
        }
        st.log.push('Week ' + st.week + ': Crisis - Sabotage level ' + st.blSabotageLevel);
      } else {
        notes.push(' The Black League is already at maximum sabotage level (5/5).');
        notes.push('Your agents report they cannot do more damage.');
      }
      msg = 'You sabotage the Black League\'s legions.';
    } else if (actionId === 'crisis_defensive') {
      notes.push(' You fortify your position against the Black League.');
      notes.push('Your defenses are strengthened. BL attacks are less effective for 3 weeks.');
      st.defensiveBoost = 3;
      st.fightingBlackLeague = true;
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 1);
        }
      }
      st.unity = clamp(st.unity + 2, 0, 100);
      notes.push('📈 ZMP +1%');
      st.log.push('Week ' + st.week + ': Crisis - Defensive position');
      msg = 'You fortify your position against the Black League.';
    } else if (actionId === 'crisis_counter_propaganda') {
      var blSupport3 = getPartySupport(st, 'bl');
      var effectiveness = 0.4 + (st.unity / 200) + (st.faculty / 150);
      
      if (rng() < effectiveness) {
        notes.push(' Your counter-propaganda campaign is a massive success!');
        notes.push('The Black League\'s narrative is shattered.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - 3);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
          }
        }
        st.affinity.bl = clamp((st.affinity.bl || 0) - 8, 0, 100);
        st.momentum = clamp((st.momentum || 0) + 2, -10, 20);
        st.unity = clamp(st.unity + 2, 0, 100);
        notes.push('📈 BL -3%, ZMP +2%');
        st.log.push('Week ' + st.week + ': Crisis - Counter propaganda success');
      } else {
        notes.push(' Your counter-propaganda campaign fails.');
        notes.push('The Black League\'s message is stronger than ever.');
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) + 2);
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 1);
          }
        }
        st.affinity.bl = clamp((st.affinity.bl || 0) + 4, 0, 100);
        st.momentum = clamp((st.momentum || 0) - 1, -10, 20);
        st.unity = clamp(st.unity - 2, 0, 100);
        notes.push('📈 BL +2%, ZMP -1%');
        st.log.push('Week ' + st.week + ': Crisis - Counter propaganda failed');
      }
      msg = 'You launch a counter-propaganda campaign against the Black League.';
    } else if (actionId === 'relations_talk') {
      var pid = targetId;
      if (!pid || st.merged.indexOf(pid) !== -1) {
        notes.push('Cannot improve relations with this party.');
        msg = 'Diplomatic talks failed.';
      } else {
        var gain = 3 + rng() * 4;
        notes = improveRelations(st, pid, gain);
        msg = 'You send envoys to ' + pid.toUpperCase() + '.';
      }
    } else if (actionId === 'relations_gift') {
      var pid2 = targetId;
      if (!pid2 || st.merged.indexOf(pid2) !== -1) {
        notes.push('Cannot improve relations with this party.');
        msg = 'Support offer failed.';
      } else {
        var gain2 = 8 + rng() * 7;
        notes = improveRelations(st, pid2, gain2);
        st.affinity[pid2] = clamp((st.affinity[pid2] || 50) + 5, 0, 100);
        msg = 'You offer campaign support to ' + pid2.toUpperCase() + '.';
      }
    } else if (actionId === 'relations_absorb') {
      var pid3 = targetId;
      if (!pid3 || st.merged.indexOf(pid3) !== -1) {
        notes.push('Cannot absorb this party.');
        msg = 'Absorption failed.';
      } else {
        notes = absorbParty(st, pid3, rng);
        msg = 'You attempt to absorb ' + pid3.toUpperCase() + ' into ZMP.';
      }
    } else if (actionId === 'advisor_rally') {
      notes.push(' Your advisors rally the people!');
      notes = notes.concat(applyEffects(st, { demo: { freshmen: 5, athletes: 3, gamers: 2 }, momentum: 2 }, rng));
      msg = 'Advisors organize a massive rally.';
    } else if (actionId === 'advisor_media') {
      notes.push('📺 Media campaign launched!');
      notes = notes.concat(applyEffects(st, { demo: { honor: 4, seniors: 3 }, faculty: 3 }, rng));
      msg = 'Advisors launch a media blitz.';
    } else if (actionId === 'advisor_grassroots') {
      notes.push('🌿 Grassroots organizing!');
      notes = notes.concat(applyEffects(st, { demo: { buskids: 6, freshmen: 4 } }, rng));
      msg = 'Advisors build community support.';
    } else if (actionId === 'advisor_policy') {
      notes.push('📋 New policies developed!');
      notes = notes.concat(applyEffects(st, { unity: 3 }, rng));
      msg = 'Advisors develop new policies.';
    } else if (actionId === 'advisor_emergency') {
      notes.push('🚨 Emergency response deployed!');
      notes = notes.concat(applyEffects(st, { demo: { freshmen: 3, buskids: 3 }, bl: -5 }, rng));
      msg = 'Advisors deploy emergency response.';
    } else if (actionId === 'learn_economy') {
  st.harvardAdvisor = true;
  st.economyBoost = 0.25;
  notes.push('📚 Harvard advisors train your economic team. Economy actions are now 25% more effective.');
  st.log.push('Week ' + st.week + ': Learned economy from Harvard');
  msg = 'You study economics with Harvard advisors.';

} else if (actionId === 'who_healthcare') {
  st.whoAdvisor = true;
  st.healthcareBoost = 0.25;
  notes.push('🏥 WHO healthcare programs launched. Health actions are now 25% more effective.');
  st.log.push('Week ' + st.week + ': WHO healthcare program launched');
  msg = 'WHO healthcare programs launched.';

} else if (actionId === 'rally_foreign') {
  var foreignNotes = rallyForeignSupport(st, rng);
  notes = notes.concat(foreignNotes);
  msg = 'You rally foreign support.';

} else if (actionId === 'train_militia') {
  if (!st.paramilitaries) initParamilitaries(st);
  var f = st.paramilitaries.dzehurjaca;
  if (!f) { return { ok: false, msg: 'No paramilitary force available.' }; }
  f.training = Math.min(10, f.training + 1);
  notes.push('💪 Training raised to ' + f.training + '/10. Strength: ' + calculateParamilitaryStrength(f));
  msg = 'You train the Legion.';

} else if (actionId === 'equip_militia') {
  if (!st.paramilitaries) initParamilitaries(st);
  var f = st.paramilitaries.dzehurjaca;
  if (!f) { return { ok: false, msg: 'No paramilitary force available.' }; }
  f.equipment = Math.min(10, f.equipment + 1);
  notes.push('🔫 Equipment raised to ' + f.equipment + '/10. Strength: ' + calculateParamilitaryStrength(f));
  msg = 'You equip the Legion.';

} else if (actionId === 'rally_militia') {
  if (!st.paramilitaries) initParamilitaries(st);
  var f = st.paramilitaries.dzehurjaca;
  if (!f) { return { ok: false, msg: 'No paramilitary force available.' }; }
  f.morale = Math.min(100, f.morale + 8);
  f.loyalty = Math.min(100, f.loyalty + 3);
  notes.push('🎺 Morale raised to ' + f.morale + '%. Loyalty raised to ' + f.loyalty + '%.');
  msg = 'You rally the Legion.';

} else if (actionId === 'recruit_militia') {
  if (!st.paramilitaries) initParamilitaries(st);
  var f = st.paramilitaries.dzehurjaca;
  if (!f) { return { ok: false, msg: 'No paramilitary force available.' }; }
  var gained = 15 + Math.floor(rng() * 15);
  f.members += gained;
  notes.push('⚔️ Recruited ' + gained + ' fighters. Legion now has ' + f.members + ' members.');
  msg = 'You recruit new fighters.';

} else if (actionId === 'dzehurjaca_charge_enhanced') {
  var chargeResult = resolveDzehurjacaChargeEnhanced(st, rng);
  notes = notes.concat(chargeResult.notes);
  if (chargeResult.outcome === 'victory') {
    msg = 'The Dzehurjaca Charge succeeds!';
  } else {
    msg = 'The Dzehurjaca Charge fails.';
  }
}

    if (eff && Object.keys(eff).length > 0) {
      var effectNotes = applyEffects(st, eff, rng);
      notes = notes.concat(effectNotes);
    }

    if (actionId === 'relations_wein') {
  var weinGain = 8 + rng() * 4;
  st.relations.wein = Math.min(100, (st.relations.wein || 40) + weinGain);
  notes.push('📈 Relations with Arbeiter von Wein improved by ' + Math.round(weinGain) + '%');
  notes.push('🌍 Current Wein relations: ' + Math.round(st.relations.wein) + '%');
  
  // Check if Wein alliance threshold reached
  if (st.relations.wein >= 70 && !st.hasArbeiterAlly) {
    notes.push(' WEIN ALLIANCE UNLOCKED!');
    notes.push('🌍 Arbeiter von Wein is now your ally!');
    st.hasArbeiterAlly = true;
    st.allyBoost = 0.5;
    
    // Immediate boost
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 2);
      }
    }
    notes.push('📈 ZMP +2% across all groups!');
    notes.push('💪 Allied actions are now 50% more effective!');
  }
  msg = 'You send envoys to Arbeiter von Wein.';
} else if (actionId === 'relations_wein_gift') {
  var weinGain2 = 12 + rng() * 6;
  st.relations.wein = Math.min(100, (st.relations.wein || 40) + weinGain2);
  st.funds -= 15; // Already deducted, but track it
  notes.push('🎁 Generous gift sent to Arbeiter von Wein!');
  notes.push('📈 Relations improved by ' + Math.round(weinGain2) + '%');
  notes.push('🌍 Current Wein relations: ' + Math.round(st.relations.wein) + '%');
  
  if (st.relations.wein >= 70 && !st.hasArbeiterAlly) {
    notes.push(' WEIN ALLIANCE UNLOCKED!');
    notes.push('🌍 Arbeiter von Wein is now your ally!');
    st.hasArbeiterAlly = true;
    st.allyBoost = 0.5;
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 3);
      }
    }
    notes.push('📈 ZMP +3% across all groups!');
  }
  msg = 'You send a generous gift to Wein.';
} else if (actionId === 'relations_wein_alliance') {
  if ((st.relations.wein || 0) >= 70) {
    if (st.hasArbeiterAlly) {
      notes.push(' Wein alliance already secured!');
    } else {
      notes.push(' WEIN ALLIANCE FORMALIZED!');
      st.hasArbeiterAlly = true;
      st.allyBoost = 0.5;
      st.relations.wein = Math.min(100, (st.relations.wein || 0) + 10);
      
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + 4);
        }
      }
      notes.push('🌍 Arbeiter von Wein is now your formal ally!');
      notes.push('📈 ZMP +4% across all groups!');
      notes.push('💪 Allied actions are now 50% more effective!');
      st.log.push('Week ' + st.week + ': Wein Alliance formalized');
    }
  } else {
    notes.push(' Need 70+ relations with Wein. Current: ' + Math.round(st.relations.wein || 0) + '%');
    notes.push('🌍 Use Diplomatic Talks and Gifts to improve relations.');
  }
  msg = 'You attempt to formalize the Wein alliance.';
}
    
    st.log.push('Week ' + st.week + ': ' + msg);
    return { ok: true, msg: msg, notes: notes };
  }

  /* ---------------- End Week ---------------- */
  function endWeek(st, rng) {
    var year = Math.ceil(st.week / 52);
    var intensity = year === 2 ? 1.5 : 1.0;
    var notes = [];

    // Passive weekly effects only run once per week, even if
    // multiple events queue on the same week.
    var passivesDone = (st._weekPassivesProcessed === st.week);

    var active = activeParties(st);
    for (var i = 0; i < active.length; i++) {
      var p = active[i];
      if (p.id === 'ZMP') continue;
      if (D && D.DEMOS) {
        for (var j = 0; j < D.DEMOS.length; j++) {
          var dm = D.DEMOS[j];
          var d = (rng() - 0.45) * 1.5 * intensity;
          if (p.base && p.base[dm.id] > 15) d += 0.35 * intensity;
          if (st.raw[p.id]) {
            st.raw[p.id][dm.id] = Math.max(0.5, (st.raw[p.id][dm.id] || 0) + d);
          }
        }
      }
    }

    if (st.unity < 40) {
      var bleed = (40 - st.unity) * 0.045;
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - bleed);
        }
      }
    }

    

    if (st.faculty < 25) {
      st.ap = 2;
    } else {
      st.ap = 3;
    }
    if (st.unity > 70) st.ap += 1;
    if (st.week > 52 && st.unity > 65) st.ap += 1;

        // Jihadists don't campaign — they fund the Legion instead
    var _jf = null;
    for (var _ji = 0; _ji < D.FACTIONS.length; _ji++) {
      if (D.FACTIONS[_ji].id === st.faction) { _jf = D.FACTIONS[_ji]; }
    }
    if (_jf && _jf.canParticipateInElections === false) {
      // Passive war chest: 12–22 per week, scales slightly with momentum and unity
      var weeklyWarChest = Math.round(
        12 + (st.unity || 0) * 0.08 + Math.max(0, st.momentum || 0) * 0.5 + rng() * 6
      );
      var weeklyVolunteers = Math.round(
  2 + (st.unity || 0) * 0.02 + Math.max(0, st.momentum || 0) * 0.15 + rng() * 2
);
      st.funds += weeklyWarChest;
      notes.push('War chest: +$' + weeklyWarChest + ' (Jihadist contributions).');

      // Optional: one-time seed money at week 1 so you're not dead in the water
      if (st.week === 2 && !st._jihadistSeedGiven) {
        st._jihadistSeedGiven = true;
        st.funds += 150;
        notes.push('Private donors deliver $150 to the Legion.');
      }
    }

    st.momentum = Math.round((st.momentum || 0) * 0.7);
    st.unity = clamp(st.unity + 2, 0, 100);
    st.faculty = clamp(st.faculty + 1, 0, 100);

      // --- DYNAMIC AI & PROPHECY CHECKS (MUST BE BEFORE EVENTS) ---
    checkAIDynamics(st);

    if (!st.prophecy.active && st.blFactions && st.blFactions.cultists >= 70 && !st.prophecy.halted) {
      st.prophecy.active = true;
      st.pendingEvent = {
        id: 'prophecy_awakening',
        title: 'The Ashen Cult',
        body: 'The Traditionalists in the Black League have been purged. The Cultists now control the remnants. They no longer care about seats or policy. They speak only of the "Ten Walls" and the "Green Tyrants".',
        choices: [{ text: 'They are just fanatics. Ignore them.', note: '' }]
      };
      notes.push('The Ashen Cult has taken over the Black League.');
      st.log.push('Week ' + st.week + ': The Ashen Cult prophecy begins.');
      return notes;
    }

    // --- RO16 3-WEEK MERGER ---
    if (st.flags.ro16RedAffiliated && st.week === st.flags.ro16CongressWeek + 3 && st.merged.indexOf('ro16') === -1) {
      st.merged.push('ro16');
      if (D && D.DEMOS && st.raw.ro16 && st.raw.red) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i].id;
          st.raw.red[dm] = Math.max(0.5, (st.raw.red[dm] || 0) + (st.raw.ro16[dm] || 0) * 0.8);
          st.raw.ro16[dm] = 0;
        }
      }
      st.log.push('Week ' + st.week + ': The RO16 formally merged with the Red Front.');
      notes.push('The RO16 has formally merged with the Red Front!');
    }
    // -------------------------------------------------------------

    var electionProcessed = st.electionProcessed || {};

    var electionProcessed = st.electionProcessed || {};
    
        if (isElectionWeek(st) && !electionProcessed[st.week]) {
      electionProcessed[st.week] = true;
      st.electionProcessed = electionProcessed;

      var _f = null;
      for (var _i = 0; _i < D.FACTIONS.length; _i++) {
        if (D.FACTIONS[_i].id === st.faction) { _f = D.FACTIONS[_i]; }
      }

      if (_f && _f.canParticipateInElections === false) {
        notes.push('Week ' + st.week + ' was an election week. The Jihadists did not participate.');
        st.log.push('Week ' + st.week + ': election held without the ZMP');
         
      } else {
        var electionNotes = runElection(st, rng);
        for (var i = 0; i < electionNotes.length; i++) { notes.push(electionNotes[i]); }

        var electionData = generateElectionEventData(st, rng);

        st.pendingEvent = {
          id: 'election_' + st.week,
          week: st.week,
          title: 'ELECTION DAY - ' + getElectionLabel(st.electionCycle || 0),
          body: 'The council elections have been held. ' + D.SEATS + ' seats were contested. ' + D.MAJORITY + ' needed for a majority.',
          isElection: true,
          electionData: electionData,
          choices: []
        };

        st.log.push('Week ' + st.week + ': ELECTION DAY - Results announced');
        notes.push('ELECTION DAY - Results are in! Check the election screen.');
        return notes;
      }
    }

    if (!passivesDone) {
      st._weekPassivesProcessed = st.week;
    }

    var normalEvent = null;
    if (D && D.EVENTS) {
      for (var i = 0; i < D.EVENTS.length; i++) {
        var ev = D.EVENTS[i];
        if (ev.week === st.week && !st.eventDone[ev.id]) {
          if (ev.condition && !ev.condition(st)) {
            continue;
          }
          normalEvent = ev;
          break;
        }
        if (ev.week === -1 && !st.eventDone[ev.id] && ev.condition && ev.condition(st)) {
          normalEvent = ev;
          break;
        }
      }
    }
    
    if (normalEvent) {
      st.pendingEvent = normalEvent;
      notes.push('📋 Event: ' + normalEvent.title);
      st.log.push('Week ' + st.week + ': ' + normalEvent.title);
      return notes;
    }

    var baseGrowth = 0.5 + rng() * 0.5;
    var weekAcceleration = Math.min(st.week / 20, 3);
    var growthRate = baseGrowth * (1 + weekAcceleration * 0.1);
    
    if (st.fightingBlackLeague) {
      growthRate = growthRate * 0.6;
    }
    if (st.unity > 70) {
      growthRate = growthRate * 0.8;
    }
    if (st.faculty > 60) {
      growthRate = growthRate * 0.9;
    }
    
    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var currentBl = st.raw.bl ? st.raw.bl[dm.id] || 0 : 0;
        var growth = growthRate * (0.8 + rng() * 0.4);
        st.raw.bl[dm.id] = Math.max(0.5, currentBl + growth);
        if (st.raw.ZMP) {
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - growth * 0.3);
        }
      }
    }
    
    if (st.week % 3 === 0) {
      var blSupport = getPartySupport(st, 'bl');
      notes.push('⚫ The Black League continues to grow... (' + Math.round(blSupport) + '%)');
      st.log.push('Week ' + st.week + ': Black League at ' + Math.round(blSupport) + '%');
    }

    var otherRedNotes = checkOtherRedJoinsBL(st, rng);
    for (var i = 0; i < otherRedNotes.length; i++) notes.push(otherRedNotes[i]);

    var blSurgeNotes = checkBlackLeagueSurge(st, rng);
    for (var i = 0; i < blSurgeNotes.length; i++) notes.push(blSurgeNotes[i]);

    var iiaNotes = checkIIASplinter(st, rng);
    for (var i = 0; i < iiaNotes.length; i++) notes.push(iiaNotes[i]);

    var iiaJoinNotes = checkIIAJoinsZMP(st, rng);
    for (var i = 0; i < iiaJoinNotes.length; i++) notes.push(iiaJoinNotes[i]);

   
    var cellNotes = placeBLChill(st, rng);
    for (var i = 0; i < cellNotes.length; i++) {
  notes.push(cellNotes[i]);
}

    var redLeadNotes = checkRedLeadership(st, rng);
    for (var i = 0; i < redLeadNotes.length; i++) notes.push(redLeadNotes[i]);

    var dynNotes = checkDynamicPartyEvents(st, rng);
    for (var i = 0; i < dynNotes.length; i++) notes.push(dynNotes[i]);

    var tiiaNotes = checkTIIAJoinsBL(st, rng);
    for (var i = 0; i < tiiaNotes.length; i++) notes.push(tiiaNotes[i]);

    var zpfNotes = checkZPFJoins(st, rng);
    for (var i = 0; i < zpfNotes.length; i++) notes.push(zpfNotes[i]);

    var redJoinNotes = checkRedJoinsZMP(st, rng);
    for (var i = 0; i < redJoinNotes.length; i++) notes.push(redJoinNotes[i]);

    var redJoinBLNotes = checkRedJoinsBL(st, rng);
    for (var i = 0; i < redJoinBLNotes.length; i++) notes.push(redJoinBLNotes[i]);

    var relDecayNotes = decayRelations(st, rng);
    for (var i = 0; i < relDecayNotes.length; i++) notes.push(relDecayNotes[i]);

    var blAbsorbNotes = checkBLAbsorbsParties(st, rng);
    for (var i = 0; i < blAbsorbNotes.length; i++) notes.push(blAbsorbNotes[i]);

    var releaseNotes = releaseAbsorbedParties(st, rng);
    for (var i = 0; i < releaseNotes.length; i++) notes.push(releaseNotes[i]);

    if (window.CivilWar && window.CivilWar.isActive(st)) {
      var cwNotes = window.CivilWar.tick(st, rng);
      for (var ci = 0; ci < cwNotes.length; ci++) notes.push(cwNotes[ci]);
    }

    var breakResult = checkCoalitionBreak(st, rng);
    if (breakResult) {
      notes.push(breakResult.name + ' has left the coalition!');
      st.log.push('Week ' + st.week + ': ' + breakResult.name + ' leaves the coalition.');
    }

    if (st.coalitionPartners && st.coalitionPartners.length > 0) {
      var totalSeats = st.seats.ZMP || 0;
      for (var i = 0; i < st.coalitionPartners.length; i++) {
        totalSeats += st.seats[st.coalitionPartners[i]] || 0;
      }
      var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;
      if (totalSeats >= majority) {
        st.coalitionStability = clamp((st.coalitionStability || 80) + 2, 0, 100);
      } else {
        st.coalitionStability = clamp((st.coalitionStability || 80) - 5, 0, 100);
      }
    }
    
    if (st.coalitionPartners && st.coalitionPartners.length > 0) {
      var totalSeats = st.seats.ZMP || 0;
      for (var i = 0; i < st.coalitionPartners.length; i++) {
        totalSeats += st.seats[st.coalitionPartners[i]] || 0;
      }
      if (totalSeats >= D.MAJORITY) {
        for (var i = 0; i < st.coalitionPartners.length; i++) {
          var pid = st.coalitionPartners[i];
          var p = getParty(pid);
          if (p && st.raw[pid]) {
            var gain = 0.5 + rng() * 1.5;
            if (st.allyBoost) {
              gain = gain * (1 + st.allyBoost);
            }
            if (pid === 'zalian_list') {
              st.affinity.zalian_list = clamp((st.affinity.zalian_list || 50) + 2, 0, 100);
            }
            if (st.harvardAdvisor && (pid === 'zpf' || pid === 'iia')) {
              gain = gain * 1.25;
            }
            if (st.whoAdvisor && (pid === 'red' || pid === 'rb')) {
              gain = gain * 1.25;
            }
            if (D && D.DEMOS) {
              for (var j = 0; j < D.DEMOS.length; j++) {
                var dm = D.DEMOS[j];
                st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + gain * (p.base ? (p.base[dm.id] || 0) / 20 : 0.5));
              }
            }
            st.affinity[pid] = clamp((st.affinity[pid] || 50) + 2, 0, 100);
          }
        }
        notes.push(' Coalition partners have taken their own government actions.' + 
          (st.allyBoost ? ' (Boosted by foreign allies!)' : ''));
      }
    }



    // ---- Alternative coalitions ----
    if (isZMPInGovernment(st) && st.alternativeCoalition) {
      notes.push('ZMP returns to government. The ' + st.alternativeCoalition.name + ' dissolves.');
      st.alternativeCoalition = null;
    } else if (!isZMPInGovernment(st) && st.week > 10 && st.week % 3 === 0) {
      var altCoal = checkAlternativeCoalition(st, rng);
      if (altCoal) {
        var altResult = applyAlternativeCoalition(st, altCoal, rng);
        notes = notes.concat(altResult.notes);
      }
    }

    // ---- Non-ZMP referendum initiatives ----
    var refInitNotes = checkPartyReferendumInitiatives(st, rng);
    for (var ri = 0; ri < refInitNotes.length; ri++) {
      notes.push(refInitNotes[ri]);
    }

    // =========================================================
// CHAPTER BREAK: The Black League is defeated
// =========================================================
var blResolved = st.battle3Won === true
              || st.blSplintered === true
              || st.blNeutralized === true;

if (blResolved && !st._blResolvedSeen) {
  st._blResolvedSeen = true;
  st.pendingEvent = {
    id: 'bl_defeated_chapter',
    week: st.week,
    title: '🏳️ THE BLACK LEAGUE IS DEFEATED',
    body:
      'The Black League is finished. The banners are down, the cells are scattered, ' +
      'and the last of their leaders have fled or been captured. ' +
      'For the first time in two years, the school is not at war. ' +
      'But the war has left scars, and the question now is not who won — ' +
      'it is what kind of school you are going to build with the peace.',
    choices: [
      {
        text: 'The war is over. Now we govern.',
        note: 'You turn to the future. The political phase begins.',
        effects: { unity: 5, momentum: 3, faculty: 2 }
      },
      {
        text: 'We must not forget what they did. Justice first.',
        note: 'You commit to memory and accountability. Faculty approves; some students want to move on.',
        effects: { unity: 2, faculty: 8, momentum: -1 }
      },
      {
        text: 'No time to celebrate. There is work to do.',
        note: 'You move straight to the next crisis. Momentum maintained, unity strained.',
        effects: { momentum: 4, unity: -2 }
      }
    ]
  };
  st.log.push('Week ' + st.week + ': The Black League is defeated. The political phase begins.');
  return notes;
}

    st.week += 1;
    st._weekPassivesProcessed = -1;
    snapshot(st, 'Week ' + st.week);
    
    var endingData = checkForEndings(st, rng);
    if (endingData) {
      st.endingData = endingData;
      st.finished = true;
    }

    

    // Check for dynamic AI behaviors (IIA Coup)
    checkAIDynamics(st);
    
    // Check if the cultists have taken over
    if (!st.prophecy.active && st.blFactions && st.blFactions.cultists >= 70 && !st.prophecy.halted) {
      st.prophecy.active = true;
      st.pendingEvent = {
        id: 'prophecy_awakening',
        title: 'The Ashen Cult',
        body: 'The Traditionalists in the Black League have been purged. The Cultists now control the remnants. They no longer care about seats or policy. They speak only of the "Ten Walls" and the "Green Tyrants".',
        choices: [{ text: 'They are just fanatics. Ignore them.', note: '' }]
      };
    }

    return notes;
  }

  /* ---------------- Coalition Search ---------------- */
  function coalitions(st) {
    var cur = current(st);
    var seats = cur.seats;
    var P = getPlayerPartyId(st);
    var mySeats = seats[P] || 0;
    
    function getSeats(pid) { 
      if (pid === 'zalian_list') {
         return (seats['zap'] || 0) + (seats['zlp'] || 0) + (seats['other_zalian'] || 0);
      }
      return seats[pid] || 0; 
    }
    
    var preDefined = {};
    
    var zmp_semp_seats = mySeats + getSeats('semp');
    preDefined.zalgrilian = {
      key: 'zalgrilian',
      name: 'Zalgrilian Front',
      combo: [P, 'semp'],
      seats: zmp_semp_seats,
      willing: Math.min(100, (st.affinity.semp || 50) + 10),
      description: 'A spirit-focused alliance. SEMP brings energy and enthusiasm to the coalition.'
    };

    var zalian_seats = mySeats + getSeats('zalian_list');
    preDefined.zalian_accord = {
      key: 'zalian_accord',
      name: 'Zalian Accord',
      combo: [P, 'zalian_list'],
      seats: zalian_seats,
      willing: Math.min(100, (st.affinity.zalian_list || 50) + 10),
      description: 'A broad regionalist alliance. Recognizes the Zalian List as a unified partner.'
    };
    
    var left_seats = mySeats + getSeats('semp') + getSeats('zpf');
    preDefined.leftblock = {
      key: 'leftblock',
      name: 'Left Block',
      combo: [P, 'semp', 'zpf'],
      seats: left_seats,
      willing: Math.min(100, Math.min(st.affinity.semp || 50, st.affinity.zpf || 50) + 5),
      description: 'A broad centre-left coalition. SEMP and ZPF bridge the spirit and traditionalist wings.'
    };
    
    var rgb_seats = mySeats + getSeats('iia') + getSeats('red');
    preDefined.rgb = {
      key: 'rgb',
      name: 'RGB Alliance',
      combo: [P, 'iia', 'red'],
      seats: rgb_seats,
      willing: Math.min(100, Math.min(st.affinity.iia || 50, st.affinity.red || 50) + 5),
      description: 'Tech and labour united. The RGB Alliance brings together innovation and the working class.'
    };
    
    var grand_seats = mySeats + getSeats('zpf') + getSeats('iia');
    preDefined.grand = {
      key: 'grand',
      name: 'Grand Coalition',
      combo: [P, 'zpf', 'iia'],
      seats: grand_seats,
      willing: Math.min(100, Math.min(st.affinity.zpf || 50, st.affinity.iia || 50) + 5),
      description: 'The broadest possible alliance. Moderates from centre and tech unite.'
    };
    
    var blackred_seats = mySeats + getSeats('red') + getSeats('bl');
    preDefined.blackred = {
      key: 'blackred',
      name: 'Black-Red Alliance',
      combo: [P, 'red', 'bl'],
      seats: blackred_seats,
      willing: Math.min(100, Math.min(st.affinity.red || 50, st.affinity.bl || 50) - 10),
      description: 'A radical coalition. High risk, high reward. Faculty will not approve.'
    };

    var redAlliance_seats = mySeats + getSeats('red') + getSeats('rb') + getSeats('iia') + getSeats('pl');
    preDefined.redalliance = {
      key: 'redalliance',
      name: 'Red Alliance',
      combo: [P, 'red', 'rb', 'iia', 'pl'],
      seats: redAlliance_seats,
      willing: Math.min(100, Math.min(
        st.affinity.red || 50,
        st.affinity.rb || 50,
        st.affinity.iia || 50,
        st.affinity.pl || 50
      ) + 5),
      description: 'A broad left-tech coalition. Combines Red Front energy, Red Bench labour, IIA innovation, and PL spirit.'
    };
    
    var zpf_seats = mySeats + getSeats('zpf');
    preDefined.zpfonly = {
      key: 'zpfonly',
      name: 'Centre Alliance',
      combo: [P, 'zpf'],
      seats: zpf_seats,
      willing: Math.min(100, (st.affinity.zpf || 50) + 15),
      description: 'A stable centre alliance with the ZPF. Traditional governance.'
    };
    
    var partners = [];
    for (var pid in seats) {
      if (pid !== P && pid !== 'ZMP' && seats[pid] > 0 && st.coalitionPartners.indexOf(pid) === -1) {
        partners.push(pid);
      }
    }

    var options = [];
    for (var i = 0; i < partners.length; i++) {
      options.push([partners[i]]);
      for (var j = i + 1; j < partners.length; j++) {
        options.push([partners[i], partners[j]]);
      }
    }

    var majority = (D && D.MAJORITY) ? D.MAJORITY : 23;
    var viable = [];

    for (var i = 0; i < options.length; i++) {
      var combo = options[i];
      var total = mySeats;
      var minAff = 100;
      var dist = 0;

      for (var j = 0; j < combo.length; j++) {
        var pid = combo[j];
        total += seats[pid] || 0;
        minAff = Math.min(minAff, st.affinity[pid] || 50);
        var p = getParty(pid);
        if (p) {
          dist += Math.abs((p.spirit || 5) - (st.spirit || 5)) + Math.abs((p.gates || 5) - (st.gates || 5));
        }
      }

      var willing = minAff - dist * 2.5 + (st.momentum || 0) * 0.5;
      if (total >= majority) {
        viable.push({ combo: combo, seats: total, willing: Math.round(willing), majority: true });
      }
    }

    viable.sort(function(a, b) { return b.willing - a.willing; });

    return {
      preDefinedOptions: preDefined,
      customOptions: viable
    };
  }

  /* ---------------- Ministry Concessions ---------------- */
  function getMinistryConcessions(ministryId) {
    var concessions = {
      finance: 'Budget control and tax policy',
      education: 'Curriculum authority',
      justice: 'Disciplinary power',
      technology: 'IT and lab funding',
      health: 'Healthcare policy',
      sports: 'Athletics funding',
      arts: 'Arts and culture budget',
      infrastructure: 'Building and facilities'
    };
    return concessions[ministryId] || 'Policy authority';
  }

  /* ============================================================
   * CONSTITUTIONAL REFERENDUMS
   * ============================================================ */

  var REFERENDUMS = {
    ZMP: [
      { id: 'raise_threshold', name: 'Raise the Electoral Threshold to 10%',
        desc: 'Lift the minimum vote share for council entry from 3% to 10%. Small parties collapse; the big tent gets bigger.',
        effects: { raiseThreshold: true }, partyGain: 8, allyGain: 3,
        lossTo: ['bl', 'republia', 'sportica', 'zalian'] },
      { id: 'appoint_monarchy', name: 'Appoint a Constitutional Monarch',
        desc: 'Restore a constitutional monarchy. The crown sits above the council.',
        effects: { restoreMonarchy: true }, partyGain: 10, allyGain: 4,
        lossTo: ['iia', 'red', 'rb', 'pl'] },
      { id: 'majority_law', name: 'The Majority Law (Acerbo)',
        desc: 'The party with the most votes receives 66% of all council seats.',
        effects: { acerboLaw: true }, partyGain: 12, allyGain: 3,
        lossTo: ['zpf', 'iia', 'red', 'rb'] }
    ],
    zpf: [
      { id: 'decrease_threshold', name: 'Decrease the Electoral Threshold to 1%',
        desc: 'Open the council to the smallest voices.',
        effects: { decreaseThreshold: true }, partyGain: 6, allyGain: 2,
        lossTo: ['ZMP', 'bl'] },
      { id: 'no_fridays', name: 'Abolish Friday Activities',
        desc: 'No sports, clubs, or social events on Fridays.',
        effects: { noFridays: true }, partyGain: 5, allyGain: 2,
        lossTo: ['sportica', 'pl'] }
    ],
    iia: [
      { id: 'end_regional', name: 'Abolish Regional Parties',
        desc: 'Ban regional and single-region parties. ZAP, RED, RB, Republia dissolved.',
        effects: { endRegionalParties: true }, partyGain: 7, allyGain: 3,
        lossTo: ['republia', 'red', 'rb', 'zalian'] }
    ],
    bl: [
      { id: 'enabling_act', name: 'The Enabling Act',
        desc: 'Grant emergency powers to the president. Rule by decree.',
        effects: { enablingAct: true }, partyGain: 10, allyGain: 4,
        lossTo: ['ZMP', 'iia', 'zpf'] }
    ]
  };

  function isZMPInGovernment(st) {
    var totalSeats = st.seats.ZMP || 0;
    if (st.coalitionPartners) {
      st.coalitionPartners.forEach(function(pid) { totalSeats += st.seats[pid] || 0; });
    }
    return totalSeats >= ((D && D.MAJORITY) ? D.MAJORITY : 51);
  }

  function getReferendumThreshold(st, partyId) {
    var inGov = isZMPInGovernment(st);
    var justiceDone = st.justiceReformDone ||
      (st.blackLeagueInvestigated && st.blackLeagueProsecuted);

    if (partyId === 'ZMP') {
      if (inGov && justiceDone) return 50;
      if (inGov) return 60;
      return 70;
    }
    // Other parties
    return inGov ? 60 : 70;
  }

  function calculateReferendumSupport(st, partyId, rng) {
    
    var sup = computeSupport(st);
    var baseSupport = sup.totals[partyId] || 0;
    
    var alignments = {
      ZMP: ['semp', 'zpf', 'iia', 'pl', 'tiia', 'sportica'],
      zpf: ['ZMP', 'iia', 'sportica', 'pl'],
      iia: ['ZMP', 'zpf', 'pl', 'tiia'],
      bl:  ['republia']
    };
    var allies = alignments[partyId] || [];
    var allySupport = 0;
    
    allies.forEach(function(pid) {
      if (st.merged.indexOf(pid) === -1 && sup.totals[pid]) {
        var aff = st.affinity[pid] || 50;
        // Only allied votes if affinity > 50. Max multiplier 1.0 at 100 affinity.
        var affMult = Math.max(0, (aff - 50) / 50);
        allySupport += sup.totals[pid] * affMult * 0.5; // Only half of their voters care
      }
    });
    
    // Much smaller passive bonuses
    var unityBonus = (st.unity - 50) * 0.1; 
    var facultyBonus = (st.faculty - 50) * 0.1; 
    var momentumBonus = (st.momentum || 0) * 0.5; 
    
    var total = baseSupport + allySupport + unityBonus + facultyBonus + momentumBonus + (rng() - 0.5) * 4;
    
    return Math.max(5, Math.min(95, total));
  }

  function canInitiateReferendum(st, partyId) {
    if (partyId !== 'ZMP' && isZMPInGovernment(st)) {
      return { ok: false, msg: 'ZMP is in government - only ZMP may call referendums.' };
    }
    if (st.lastReferendumWeek && st.week - st.lastReferendumWeek < 8) {
      return { ok: false, msg: '8 weeks must pass between referendums (last: W' + st.lastReferendumWeek + ').' };
    }
    return { ok: true };
  }

  function initiateReferendum(st, partyId, referendumId, rng) {
    var check = canInitiateReferendum(st, partyId);
    if (!check.ok) return { ok: false, msg: check.msg };
    var defs = REFERENDUMS[partyId] || [];
    var def = null;
    for (var i = 0; i < defs.length; i++) { if (defs[i].id === referendumId) { def = defs[i]; break; } }
    if (!def) return { ok: false, msg: 'Unknown referendum.' };
    if (st.ap < 2)    return { ok: false, msg: 'Need 2 AP.' };
    if (st.funds < 20) return { ok: false, msg: 'Need $20.' };

    st.ap -= 2; st.funds -= 20;

    var support   = calculateReferendumSupport(st, partyId, rng);
    var threshold = getReferendumThreshold(st, partyId);
    var passed    = support >= threshold;

    var notes = [];
    notes.push('REFERENDUM - ' + def.name);
    notes.push('Support: ' + Math.round(support) + '% vs threshold ' + threshold + '%');

    var applied;
    if (passed) {
      notes.push('PASSED.');
      applied = applyReferendumEffects(st, partyId, def, rng);
    } else {
      notes.push('FAILED.');
      applied = applyReferendumFailure(st, partyId, def, rng);
    }
    notes = notes.concat(applied.notes);
    st.lastReferendumWeek = st.week;
    st.log.push('Week ' + st.week + ': Referendum "' + def.name + '" ' + (passed ? 'PASSED' : 'FAILED'));

    return { ok: true, passed: passed, support: support, threshold: threshold, notes: notes, referendum: def };
  }

  function applyReferendumEffects(st, partyId, def, rng) {
    var notes = [];
    var gain = def.partyGain || 8;
    var allyGain = (def.allyGain || 3) * 0.5;

    if (D && D.DEMOS && st.raw[partyId]) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw[partyId][dm.id] = Math.max(0.5, (st.raw[partyId][dm.id] || 0) + gain);
      }
    }
    notes.push(partyId.toUpperCase() + ' +' + gain + '% across all groups.');

    var alignments = {
      ZMP: ['semp', 'zpf', 'iia', 'pl', 'tiia', 'sportica'],
      zpf: ['ZMP', 'iia', 'sportica', 'pl'],
      iia: ['ZMP', 'zpf', 'pl', 'tiia'],
      bl:  ['republia']
    };
    (alignments[partyId] || []).forEach(function(pid) {
      if (st.merged.indexOf(pid) === -1 && st.raw[pid]) {
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + allyGain);
          }
        }
      }
    });

    (def.lossTo || []).forEach(function(pid) {
      if (st.raw[pid] && D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) - gain * 0.4);
        }
      }
    });

    var e = def.effects || {};
    if (e.raiseThreshold)    { st.electoralThreshold = 10; notes.push('Threshold raised to 10%.'); }
    if (e.decreaseThreshold) { st.electoralThreshold = 1;  notes.push('Threshold lowered to 1%.'); }
    if (e.restoreMonarchy)   { st.monarchyRestored = true; st.spirit = Math.min(10, st.spirit + 2); notes.push(' Ahmad VI is crowned King. A constitutional monarchy is restored.'); }
    if (e.acerboLaw)         { st.acerboLaw = true; notes.push('Acerbo Law in effect - winner takes 66%.'); }
    if (e.noFridays)         { st.noFridays = true; notes.push('Friday activities abolished.'); }
    if (e.enablingAct)       { st.enablingAct = true; st.unity = Math.max(0, st.unity - 10); st.faculty = Math.max(0, st.faculty - 20); notes.push('Enabling Act - president may rule by decree.'); }
    if (e.endRegionalParties) {
      ['republia', 'red', 'rb', 'zalian'].forEach(function(pid) {
        if (st.merged.indexOf(pid) === -1) { st.merged.push(pid); notes.push(pid.toUpperCase() + ' banned.'); }
      });
    }
    return { notes: notes };
  }

  function applyReferendumFailure(st, partyId, def, rng) {
    var notes = [];
    var loss = 15 + Math.floor(rng() * 10);
    if (D && D.DEMOS && st.raw[partyId]) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        var current = st.raw[partyId][dm.id] || 0;
        var actual = Math.min(current * 0.5, loss);
        st.raw[partyId][dm.id] = Math.max(0.5, current - actual);
        var lossTo = def.lossTo || ['bl', 'republia'];
        lossTo.forEach(function(pid) {
          if (st.raw[pid]) {
            st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + actual / lossTo.length);
          }
        });
      }
    }
    st.unity = Math.max(0, st.unity - 10);
    st.momentum = Math.max(-10, (st.momentum || 0) - 3);
    notes.push(partyId.toUpperCase() + ' -' + loss + '%. Unity and momentum shattered.');
    return { notes: notes };
  }

  function checkPartyReferendumInitiatives(st, rng) {
    var notes = [];
    if (isZMPInGovernment(st)) return notes;
    var parties = ['zpf', 'iia', 'bl'];
    for (var pi = 0; pi < parties.length; pi++) {
      var partyId = parties[pi];
      if (!st.raw[partyId] || st.merged.indexOf(partyId) !== -1) continue;
      if (getPartySupport(st, partyId) < 8) continue;
      if (rng() > 0.18) continue;
      if (st.lastAIRefWeek && st.week - st.lastAIRefWeek < 8) continue;
      var defs = REFERENDUMS[partyId];
      if (!defs || !defs.length) continue;
      var def = defs[Math.floor(rng() * defs.length)];
      var support   = calculateReferendumSupport(st, partyId, rng);
      var threshold = getReferendumThreshold(st, partyId);
      
      // Pause and save the state so the player can react
      st.pendingAIRef = {
        partyId: partyId,
        def: def,
        baseSupport: support,
        threshold: threshold
      };
      
      notes.push('📜 ' + partyId.toUpperCase() + ' has called a referendum: ' + def.name);
      st._pendingAIRefMusic = true; 
      break; 
    }
    return notes;
  }

  
  function resolveAIRefWithPlayerChoice(st, choice, rng) {
    if (!st.pendingAIRef) return [];
    var ref = st.pendingAIRef;
    var support = ref.baseSupport;
    var notes = [];

    if (choice === 'support') {
      var zmpSup = getPartySupport(st, 'ZMP');
      support += zmpSup * 0.5; // ZMP campaigning adds half their support base
      notes.push("You campaigned in support. (+" + Math.round(zmpSup * 0.5) + "%)");
    } else if (choice === 'oppose') {
      var zmpSup = getPartySupport(st, 'ZMP');
      support -= zmpSup * 0.6; // ZMP campaigning against subtracts their support
      notes.push("You campaigned in opposition. (-" + Math.round(zmpSup * 0.6) + "%)");
    } else {
      notes.push("You stayed neutral.");
    }

    support = Math.max(5, Math.min(95, support));
    var passed = support >= ref.threshold;

    
    if (choice === 'support' && passed) {
        st.unity = Math.min(100, st.unity + 3);
        notes.push("Your support carried the day. Unity +3.");
    } else if (choice === 'oppose' && !passed) {
        st.unity = Math.min(100, st.unity + 3);
        notes.push("You successfully blocked the motion. Unity +3.");
    } else if (choice === 'support' && !passed) {
        st.unity = Math.max(0, st.unity - 3);
        notes.push("You backed a loser. Unity -3.");
    } else if (choice === 'oppose' && passed) {
        st.unity = Math.max(0, st.unity - 3);
        notes.push("You failed to stop it. Unity -3.");
    }

    var applied;
    if (passed) {
        applied = applyReferendumEffects(st, ref.partyId, ref.def, rng);
    } else {
        applied = applyReferendumFailure(st, ref.partyId, ref.def, rng);
        
        // Extra consequences based on whether the player actively campaigned
        if (choice === 'oppose') {
            // ZMP opposed and won. Big boost.
            if (D && D.DEMOS) {
                for (var i = 0; i < D.DEMOS.length; i++) {
                    var dm = D.DEMOS[i];
                    var targetVal = st.raw[ref.partyId] ? st.raw[ref.partyId][dm.id] || 0 : 0;
                    var steal = Math.min(targetVal * 0.4, 6); // Steal up to 6% or 40% of their remaining base
                    if (st.raw[ref.partyId]) {
                        st.raw[ref.partyId][dm.id] = Math.max(0.5, targetVal - steal);
                    }
                    if (st.raw.ZMP) {
                        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + steal);
                    }
                }
            }
            notes.push("You successfully defeated the motion. ZMP gains support!");
        } else if (choice === 'support') {
           
            if (D && D.DEMOS) {
                for (var i = 0; i < D.DEMOS.length; i++) {
                    var dm = D.DEMOS[i];
                    var zmpVal = st.raw.ZMP ? st.raw.ZMP[dm.id] || 0 : 0;
                    var steal = Math.min(zmpVal * 0.2, 4); // Lose up to 4%
                    if (st.raw.ZMP) {
                        st.raw.ZMP[dm.id] = Math.max(0.5, zmpVal - steal);
                    }
                    // Votes scatter to other parties
                    var split = steal / 3;
                    ['zpf', 'iia', 'bl'].forEach(function(pid) {
                        if (st.raw[pid]) {
                            st.raw[pid][dm.id] = Math.max(0.5, (st.raw[pid][dm.id] || 0) + split);
                        }
                    });
                }
            }
            notes.push("You backed a failed motion. ZMP loses support.");
        }
    }
    notes = notes.concat(applied.notes);

    var voteData = {
        id: ref.def.id,
        name: ref.def.name,
        desc: ref.def.desc,
        support: support,
        threshold: ref.threshold,
        passed: passed,
        notes: notes,
        isAI: true,
        triggerParty: ref.partyId
    };

    st.lastAIRefWeek = st.week;
    st.pendingAIRef = null;
    
    return voteData;
  }

  function checkAlternativeCoalition(st, rng) {
    if (isZMPInGovernment(st)) return null;
    if (st.alternativeCoalition) return null;
    if (st.lastAlternativeCoalitionWeek && st.week - st.lastAlternativeCoalitionWeek < 12) return null;

    var defs = [
      { key: 'blue_green', name: 'Blue-Green Coalition',
        parties: ['sportica', 'republia', 'zpf'],
        actions: ['investigate_dzehurjaca', 'strengthen_republic'] },
      { key: 'progressive_front', name: 'Progressive Front',
        parties: ['zpf', 'iia', 'red', 'rb', 'pl'],
        actions: ['economic_policy', 'strengthen_republic'] },
      { key: 'tech_labour', name: 'Tech-Labour Alliance',
        parties: ['iia', 'red', 'rb', 'pl'],
        actions: ['economic_policy'] }
    ];

    var feasible = [];
    defs.forEach(function(def) {
      var total = 0, affSum = 0, affCount = 0, ok = true;
      for (var i = 0; i < def.parties.length; i++) {
        var pid = def.parties[i];
        if (!st.raw[pid] || st.merged.indexOf(pid) !== -1) { ok = false; break; }
        total += st.seats[pid] || 0;
        affSum += st.affinity[pid] || 50;
        affCount++;
      }
      if (!ok) return;
      if (total < ((D && D.MAJORITY) ? D.MAJORITY : 51)) return;
      var avgAff = affCount > 0 ? affSum / affCount : 50;
      if (avgAff < 35) feasible.push({ def: def, seats: total, avgAffinity: avgAff });
    });

    if (feasible.length === 0) return null;
    feasible.sort(function(a, b) { return b.seats - a.seats; });
    return feasible[0];
  }

  function applyAlternativeCoalition(st, coalition, rng) {
    var notes = [];
    notes.push('ALTERNATIVE COALITION FORMED - ' + coalition.def.name);
    notes.push('Parties: ' + coalition.def.parties.join(' + ') + ' (' + coalition.seats + ' seats)');

    coalition.def.actions.forEach(function(action) {
      if (action === 'investigate_dzehurjaca' && st.paramilitaries && st.paramilitaries.dzehurjaca) {
        var f = st.paramilitaries.dzehurjaca;
        f.morale = Math.max(10, f.morale - 10);
        f.members = Math.max(0, Math.floor(f.members * 0.8));
        notes.push('Dzehurjaca investigated: morale -10, members -20%.');
      }
      if (action === 'strengthen_republic') {
        st.spirit = Math.max(0, st.spirit - 1);
        st.gates  = Math.max(0, st.gates - 1);
        st.faculty = Math.min(100, st.faculty + 5);
        notes.push('Republic strengthened: spirit -1, gates -1, faculty +5.');
      }
      if (action === 'economic_policy') {
        st.funds += 20;
        st.economyBoost = (st.economyBoost || 0) + 0.15;
        notes.push('Economic policy: +$20, economyBoost +15%.');
      }
    });

    if (D && D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
      }
    }
    st.momentum = Math.max(-10, (st.momentum || 0) - 3);

    st.alternativeCoalition = coalition.def;
    st.lastAlternativeCoalitionWeek = st.week;
    return { notes: notes };
  }

  function getAvailableReferendums(st, partyId) {
    return REFERENDUMS[partyId] || [];
  }

  /* ---------------- Dynamic AI: IIA Coup ---------------- */
  /* ---------------- Dynamic AI: IIA Coup ---------------- */
  /* ---------------- Dynamic AI: IIA Coup ---------------- */
  function checkAIDynamics(st) {
    if (!st || st.finished) return;
    if (!st.flags) st.flags = {};

    if (!st.flags.iiaCoupTriggered && st.affinity.iia >= 85 && st.week > 10) {
      st.flags.iiaCoupTriggered = true;
      st.affinity.iia = Math.max(0, st.affinity.iia - 30);
      
      if (st.raw.iia) {
        if (D && D.DEMOS) {
          for (var i = 0; i < D.DEMOS.length; i++) {
            var dm = D.DEMOS[i];
            st.raw.iia[dm.id] = Math.max(0.5, (st.raw.iia[dm.id] || 0) + 5); 
            st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) - 2);
          }
        }
      }

      st.pendingEvent = {
        id: 'event_iia_coup',
        week: st.week,
        title: "The Technocrat's Gambit",
        body: "You have given the IIA too much power. Their leader, Director Vance, has declared that the ZMP is 'inefficient' and has launched a hostile takeover of the tech wing. They are now running against you.",
        choices: [
          { text: 'Crush them with the faculty.', effects: { faculty: -15, momentum: 3, affinity: { iia: -20 } }, note: 'The IIA will be severely weakened, but the faculty will notice the power grab.' },
          { text: 'Concede the tech wing to them.', effects: { momentum: -5, unity: -10, affinity: { iia: 20 } }, note: 'You lose influence, but keep the peace.' }
        ]
      };
    }
  }

  /* ---------------- The Ten Walls Prophecy ---------------- */
  /* ---------------- The Ten Walls Prophecy ---------------- */
  /* ---------------- The Ten Walls Prophecy ---------------- */
  function triggerProphecyWall(st) {
    var w = st.prophecy.wallsBroken;

    var titles = {
      1: 'The First Wall', 2: 'The Second Wall', 3: 'The Third Wall', 4: 'The Fourth Wall',
      5: 'The Fifth Wall', 6: 'The Sixth Wall', 7: 'The Seventh Wall', 8: 'The Eighth Wall',
      9: 'The Ninth Wall', 10: 'The Tenth Wall'
    };

    var bodies = {
      1: "And when <span class='party-zmp'>tyrants</span> broke first wall <span class='text-tricolor'>three</span> white horses came charging down the valley.",
      2: "And when <span class='party-zmp'>tyrants</span> broke the second wall for the <span class='party-zmp'> first horse </span> rode forward and <span class='party-rb'> hell </span>followed with him.",
      3: "And when <span class='party-zmp'>tyrants</span> broke the third wall, the violence then came from the east for <span class='party-red'>the second horse</span> stepped forward and one of <span class='party-bl'>us </span> knew your sin is wrath.",
      4: "And when <span class='party-zmp'>tyrants</span> broke the fourth wall, the halls grew quiet. The <span class='text-tricolor'>three</span> colors still thought this was a game of elections and polls.",
      5: "And when <span class='party-zmp'>tyrants</span> broke the fifth wall, the Cultists stopped resisting. They are merely watching the <span class='party-zmp'>tyrants</span> now.",
      6: "And when <span class='party-zmp'>tyrants</span> broke the sixth wall, the white horses became visible to the naked eye, charging through the empty corridors at night.",
      7: "And when <span class='party-zmp'>tyrants</span> broke the seventh wall, only <span class='text-tricolor'>three</span> remained. The sky above the school turned a bruised, unnatural purple.",
      8: "And when <span class='party-zmp'>tyrants</span> broke the eight wall there were last moments of peace for the last decision was to be made.",
      9: "And when <span class='party-zmp'>tyrants</span> broke the ninth wall last battle had begun for they (<span class='text-tricolor'>three</span> white horses) don't know what they had done.",
      10: "And when <span class='party-zmp'>tyrants</span> broke last wall they began to celebrate for they had 'won' *explosion* meanwhile caused a total armagedon *2 more*"
    };

    if (w === 8) {
      st.pendingEvent = {
        id: 'prophecy_wall_8',
        title: titles[w],
        body: bodies[w],
        choices: [
          { text: 'Walk away.', note: 'End the suppression. The prophecy halts.', effects: { prophecyHalt: true } },
          { text: 'The tyrants do not fear fairy tales.', note: 'Continue the suppression.', effects: { faculty: -10 } }
        ]
      };
      return;
    }

    if (w === 10) {
      st.finished = true;
      st.endingData = {
        ending: 'armageddon',
        title: 'TOTAL ARMAGEDDON',
        subtitle: 'The Prophecy was true. The TNT Ending.',
        body: bodies[10],
        story: "They celebrated their victory over the Black League. Then the walls came down. The Green Tyrants stood atop the rubble of the council chamber, victorious. They had prosecuted the fascists, banned their splinters, and erased them from the school. But they had not listened to the warnings. The Cultists were not a political party; they were a doomsday clock. As the <span class='text-tricolor'>three</span> colors stood together in triumph, the final wall shattered. The explosion did not discriminate. It took the council. It took the faculty. It took the students. It took the school. There is no government left to form. There is no future to build. There is only the silence of the ash, and the terrifying realization that the <span class='party-zmp'>tyrants</span> destroyed the world just to win an election.",
        epilogue: 'Nothing remains. The game is over.'
      };
      return;
    }

    st.pendingEvent = {
      id: 'prophecy_wall_' + w,
      title: titles[w],
      body: bodies[w],
      choices: [{ text: 'Continue.', note: '' }]
    };
  }


  return {
  // Core
  newState: newState,
  current: current,
  snapshot: snapshot,
  computeSupport: computeSupport,
  allocateSeats: allocateSeats,
  activeParties: activeParties,
  spiritSupport: spiritSupport,
  gateSupport: gateSupport,
  applyEffects: applyEffects,
  doAction: doAction,
  endWeek: endWeek,
  coalitions: coalitions,
  
  // Election & Events
  isElectionWeek: isElectionWeek,
  runElection: runElection,
  checkCoalitionBreak: checkCoalitionBreak,
  generateElectionEventData: generateElectionEventData,
  getElectionLabel: getElectionLabel,
  generateDetailedElectionResults: generateDetailedElectionResults,
  generatePresidentialResults: generatePresidentialResults,
  
  // Party & Faction
  checkIIASplinter: checkIIASplinter,
  checkTIIAJoinsBL: checkTIIAJoinsBL,
  checkZPFJoins: checkZPFJoins,
  checkIIAJoinsZMP: checkIIAJoinsZMP,
  checkRedLeadership: checkRedLeadership,
  checkRedJoinsZMP: checkRedJoinsZMP,
  checkRedJoinsBL: checkRedJoinsBL,
  checkOtherRedJoinsBL: checkOtherRedJoinsBL,
  checkAchievements: checkAchievements,
  
  // Cabinet & Ministers
  formCabinet: formCabinet,
  executeCabinetAction: executeCabinetAction,
  calculateMinistryAllocation: calculateMinistryAllocation,
  getAvailableMinisters: getAvailableMinisters,
  getMinistryConcessions: getMinistryConcessions,
  AVAILABLE_MINISTERS: AVAILABLE_MINISTERS,
  
  // Presidential
  drawPresidentialCard: drawPresidentialCard,
  executePresidentialAction: executePresidentialAction,
  canCallElection: canCallElection,
  
  // Legislature
  resolveLegislatureVote: resolveLegislatureVote,
  
  // Battles & Crisis
  resolveBattle: resolveBattle,
  resolveBattle2: resolveBattle2,
  resolveBattle3: resolveBattle3,
  resolveBattle4: resolveBattle4,
  resolveFallOfCenter: resolveFallOfCenter,
  resolveBLWhispers: resolveBLWhispers,
  resolveBLUltimatum: resolveBLUltimatum,
  resolveBLRisingTide: resolveBLRisingTide,
  resolveBLPropaganda: resolveBLPropaganda,
  resolveBLTakeover: resolveBLTakeover,
  resolveBLCollapse: resolveBLCollapse,
  checkBlackLeagueSurge: checkBlackLeagueSurge,
  isBlackLeagueCrisis: isBlackLeagueCrisis,
  
  // Released Parties
  resolveReleasedParties: resolveReleasedParties,
  resolveReleasedSurge: resolveReleasedSurge,
  resolveReleasedVictory: resolveReleasedVictory,
  isRubiconActive: isRubiconActive,
  
  // Party Resurgence
  resolvePartyResurgence: resolvePartyResurgence,
  
  // Dzehurjaca
  resolveDzehurjacaCharge: resolveDzehurjacaCharge,
  
  // Relations
  getRelationStageLabel: getRelationStageLabel,
  getRelationStageValue: getRelationStageValue,
  getCoalitionChance: getCoalitionChance,
  getAbsorbChance: getAbsorbChance,
  canAbsorbParty: canAbsorbParty,
  initRelations: initRelations,
  decayRelations: decayRelations,
  improveRelations: improveRelations,
  absorbParty: absorbParty,
  checkBLAbsorbsParties: checkBLAbsorbsParties,
  releaseAbsorbedParties: releaseAbsorbedParties,
  checkDynamicPartyEvents: checkDynamicPartyEvents,
  rallyForeignSupport: rallyForeignSupport,
  
  // Congress
  initPartyCongress: initPartyCongress,
  earnCongressPoints: earnCongressPoints,
  upgradePolicy: upgradePolicy,
  callPartyCongress: callPartyCongress,
  resolveCongress: resolveCongress,

    // Zalgrilianist King Putsch
  tickkingOccupation: tickkingOccupation,
  forcekingCollapse: forcekingCollapse,
  checkkingResolution: checkkingResolution,
  
  // Ambitions
  initPartyAmbitions: initPartyAmbitions,
  updatePartyAmbitions: updatePartyAmbitions,
  generateAmbition: generateAmbition,
  
  // Advisors
  rotateAdvisor: rotateAdvisor,
  initAdvisorTrackers: initAdvisorTrackers,
  applyAdvisorBonus: applyAdvisorBonus,

  clone: clone,
  clamp: clamp,
  getParty: getParty,
  getPartySupport: getPartySupport,
  doMerge: doMerge,

  
getPlayerPartyId: getPlayerPartyId,
formWhiteLeague: formWhiteLeague,
placeBLChill: placeBLChill,
getCellLocationsForMap: getCellLocationsForMap,
getCellStatus: getCellStatus,
getCellSummary: getCellSummary,
crushCell: crushCell,
getCellLocations: getCellLocations,
saveGame: function(st) {
    return JSON.parse(JSON.stringify(st));
  },
  loadGame: function(saveData) {
    return saveData;
  },
  
  // Parameter (add this!)
  calculateParamilitaryStrength: calculateParamilitaryStrength,
  // Constitutional referendums
  isZMPInGovernment: isZMPInGovernment,
  resolveAIRefWithPlayerChoice: resolveAIRefWithPlayerChoice,
  getReferendumThreshold: getReferendumThreshold,
  calculateReferendumSupport: calculateReferendumSupport,
  initiateReferendum: initiateReferendum,
  canInitiateReferendum: canInitiateReferendum,
  getAvailableReferendums: getAvailableReferendums,
  checkPartyReferendumInitiatives: checkPartyReferendumInitiatives,
  checkAlternativeCoalition: checkAlternativeCoalition,
  applyAlternativeCoalition: applyAlternativeCoalition
};

})();