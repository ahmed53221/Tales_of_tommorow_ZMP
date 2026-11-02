// battle_research_news.js — File 8: research tree, newspaper, wire, diary
// ============================================================
//   - 27-tech research tree across 5 branches
//   - Full newspaper front pages, generated from real state
//   - Scrolling wire feed with timestamped events
//   - War diary grouped by day
//
// Depends on BattleMap, BattleUnits, BattleFront, BattleHOI4,
// BattleEconomy.
// Exposes: window.BattleResearchNews
// ============================================================

window.BattleResearchNews = (function () {
  'use strict';

  function BM() { return window.BattleMap; }
  function BU() { return window.BattleUnits; }
  function BF() { return window.BattleFront; }
  function BE() { return window.BattleEconomy; }

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    // Research
    startingResearchPoints: 30,
    rpPerCivPerSec: 0.15,
    rpPerMilPerSec: 0.35,
    researchSpeedMultiplier: 1.0,

    // Newspaper
    newspaperInterval: 45,        // seconds between issues
    maxPastIssues: 12,

    // Wire
    maxWireEntries: 200,
    wireUpdateInterval: 6,        // seconds between automatically-generated wire items

    // Diary
    maxDiaryEntries: 200
  };

  // ============================================================
  // RESEARCH TREE
  // ============================================================
  var BRANCHES = {
    infantry:   { name: 'Infantry',       color: '#7fbf5f' },
    armor:      { name: 'Armor & Motor',  color: '#c07050' },
    artillery:  { name: 'Artillery',      color: '#c09050' },
    support:    { name: 'Support',        color: '#7fa0c0' },
    doctrine:   { name: 'Doctrine',       color: '#c8a860' }
  };

  var TECHS = [
    // -------- INFANTRY --------
    { id: 'inf_rifles1', branch: 'infantry', tier: 1,
      name: 'Improved Rifles I',
      blurb: 'Standard infantry get +1 attack.',
      cost: 20, time: 12, requires: [],
      effect: { dmg: 0.10 } },
    { id: 'inf_rifles2', branch: 'infantry', tier: 2,
      name: 'Improved Rifles II',
      blurb: 'Rifle squads get +1 attack again.',
      cost: 40, time: 20, requires: ['inf_rifles1'],
      effect: { dmg: 0.15 } },
    { id: 'inf_bayonet', branch: 'infantry', tier: 2,
      name: 'Bayonet Doctrine',
      blurb: 'Melee damage +20%. Assault units gain +5% org.',
      cost: 35, time: 18, requires: ['inf_rifles1'],
      effect: { dmg: 0.20, orgMax: 0.05 } },
    { id: 'inf_grenades', branch: 'infantry', tier: 3,
      name: 'Hand Grenades',
      blurb: 'Infantry attack +15%. Close-combat bonus.',
      cost: 55, time: 25, requires: ['inf_rifles2'],
      effect: { dmg: 0.15 } },
    { id: 'inf_lmg', branch: 'infantry', tier: 3,
      name: 'Light Machine Guns',
      blurb: 'Sustained fire. Attack +10%, defence +15%.',
      cost: 60, time: 28, requires: ['inf_rifles2'],
      effect: { dmg: 0.10, def: 0.15 } },
    { id: 'inf_assault', branch: 'infantry', tier: 4,
      name: 'Assault Tactics',
      blurb: 'Breakthrough bonus. Attack +25% vs fortified defenders.',
      cost: 90, time: 40, requires: ['inf_grenades', 'inf_lmg'],
      effect: { dmg: 0.25, fortPen: 0.5 } },

    // -------- ARMOR & MOTOR --------
    { id: 'arm_cars1', branch: 'armor', tier: 1,
      name: 'Armored Cars I',
      blurb: 'Fast recon. Cavalry speed +10%.',
      cost: 25, time: 14, requires: [],
      effect: { speed: 0.10 } },
    { id: 'arm_cars2', branch: 'armor', tier: 2,
      name: 'Armored Cars II',
      blurb: 'Better armor. Cavalry defence +15%.',
      cost: 45, time: 22, requires: ['arm_cars1'],
      effect: { def: 0.15 } },
    { id: 'arm_motorized', branch: 'armor', tier: 3,
      name: 'Motorized Infantry',
      blurb: 'Infantry moves 20% faster.',
      cost: 70, time: 32, requires: ['arm_cars2'],
      effect: { speed: 0.20 } },
    { id: 'arm_tankettes', branch: 'armor', tier: 3,
      name: 'Tankettes',
      blurb: 'Light armor support. Attack +20%, but slower.',
      cost: 80, time: 36, requires: ['arm_cars2'],
      effect: { dmg: 0.20, speed: -0.10 } },
    { id: 'arm_mech', branch: 'armor', tier: 4,
      name: 'Mechanized Infantry',
      blurb: 'Halftracks. Speed +30%, defence +20%.',
      cost: 110, time: 45, requires: ['arm_motorized', 'arm_tankettes'],
      effect: { speed: 0.30, def: 0.20 } },

    // -------- ARTILLERY --------
    { id: 'art_field1', branch: 'artillery', tier: 1,
      name: 'Field Guns I',
      blurb: 'Artillery attack +10%.',
      cost: 22, time: 13, requires: [],
      effect: { dmg: 0.10 } },
    { id: 'art_field2', branch: 'artillery', tier: 2,
      name: 'Field Guns II',
      blurb: 'Longer range, +15% attack.',
      cost: 48, time: 24, requires: ['art_field1'],
      effect: { dmg: 0.15 } },
    { id: 'art_howitzer', branch: 'artillery', tier: 3,
      name: 'Howitzers',
      blurb: 'Indirect fire. Attack +20%, ignores 20% fort bonus.',
      cost: 75, time: 34, requires: ['art_field2'],
      effect: { dmg: 0.20, fortPen: 0.20 } },
    { id: 'art_rocket', branch: 'artillery', tier: 4,
      name: 'Rocket Artillery',
      blurb: 'Devastating barrages. Attack +35%.',
      cost: 115, time: 48, requires: ['art_howitzer'],
      effect: { dmg: 0.35 } },
    { id: 'art_at', branch: 'artillery', tier: 3,
      name: 'Anti-Tank Guns',
      blurb: 'Defence against armor. Defence +25%.',
      cost: 70, time: 30, requires: ['art_field2'],
      effect: { def: 0.25 } },

    // -------- SUPPORT --------
    { id: 'sup_hospital', branch: 'support', tier: 1,
      name: 'Field Hospitals',
      blurb: 'Reinforcement arrives 20% faster.',
      cost: 30, time: 16, requires: [],
      effect: { reinforce: 0.20 } },
    { id: 'sup_logistics', branch: 'support', tier: 2,
      name: 'Logistics Companies',
      blurb: 'Supply attrition reduced 25%.',
      cost: 50, time: 24, requires: ['sup_hospital'],
      effect: { supplyLoss: -0.25 } },
    { id: 'sup_signals', branch: 'support', tier: 2,
      name: 'Signals Company',
      blurb: 'Faster orders. +15% movement speed.',
      cost: 45, time: 22, requires: ['sup_hospital'],
      effect: { speed: 0.15 } },
    { id: 'sup_engineer', branch: 'support', tier: 3,
      name: 'Combat Engineers',
      blurb: 'Fort defence +40%. Can cross rivers without penalty.',
      cost: 65, time: 30, requires: ['sup_logistics'],
      effect: { def: 0.40, riverCross: true } },
    { id: 'sup_recon', branch: 'support', tier: 3,
      name: 'Recon Company',
      blurb: 'Fog of war radius +50%.',
      cost: 55, time: 26, requires: ['sup_signals'],
      effect: { fogRadius: 0.50 } },

    // -------- DOCTRINE --------
    { id: 'doc_firepower', branch: 'doctrine', tier: 1,
      name: 'Superior Firepower',
      blurb: 'Soft attack focused. Damage +12%, but org regen -5%.',
      cost: 40, time: 20, requires: [],
      effect: { dmg: 0.12, orgRegen: -0.05 } },
    { id: 'doc_battleplan', branch: 'doctrine', tier: 1,
      name: 'Grand Battleplan',
      blurb: 'Prepared offensives. Damage +8%, defence +10%.',
      cost: 40, time: 20, requires: [],
      effect: { dmg: 0.08, def: 0.10 } },
    { id: 'doc_mass_assault', branch: 'doctrine', tier: 2,
      name: 'Mass Assault',
      blurb: 'Human wave. Attack +15%, org max +10%.',
      cost: 60, time: 28, requires: ['doc_firepower'],
      effect: { dmg: 0.15, orgMax: 0.10 } },
    { id: 'doc_mobile', branch: 'doctrine', tier: 2,
      name: 'Mobile Warfare',
      blurb: 'Speed +20%, breakthrough bonus.',
      cost: 60, time: 28, requires: ['doc_battleplan'],
      effect: { speed: 0.20, dmg: 0.08 } },
    { id: 'doc_elastic', branch: 'doctrine', tier: 3,
      name: 'Elastic Defence',
      blurb: 'Defence +30%. Retreat preserves more HP.',
      cost: 85, time: 38, requires: ['doc_battleplan'],
      effect: { def: 0.30, retreatSave: true } },
    { id: 'doc_deep_battle', branch: 'doctrine', tier: 4,
      name: 'Deep Battle',
      blurb: 'The pinnacle of doctrine. All bonuses +15%.',
      cost: 140, time: 55, requires: ['doc_mass_assault', 'doc_mobile'],
      effect: { dmg: 0.15, def: 0.15, speed: 0.15, orgRegen: 0.10 } }
  ];

  // ============================================================
  // STATE
  // ============================================================
  var state = {
    rp: CFG.startingResearchPoints,
    researched: {},              // id -> true
    active: null,                // { id, timeLeft, total }
    bonuses: {
      dmg: 0,
      def: 0,
      speed: 0,
      orgMax: 0,
      orgRegen: 0,
      fogRadius: 0,
      supplyLoss: 0,
      reinforce: 0,
      fortPen: 0,
      riverCross: false,
      retreatSave: false
    },
    newspapers: [],              // array of issues
    wire: [],                    // array of { time, text, kind }
    diary: [],                   // array of { day, time, text, kind }
    day: 1,
    dayTimer: 0,
    lastCityOwners: {},          // cityId -> side (for detecting changes)
    lastUnitCount: { zmp: 0, bl: 0 },
    lastDecision: ''
  };

  var rpTimer = 0;
  var newspaperTimer = 0;
  var wireTimer = 0;
  var uiTick = 0;

  var uiRoot = null;
  var newspaperRoot = null;
  var wireRoot = null;
  var diaryRoot = null;

  var openPanel = null;   // 'research' | 'newspaper' | 'diary' | null
  var newspaperCursor = 0; // which issue is being viewed (0 = latest)

  // ============================================================
  // BOOT
  // ============================================================
  function init() {
    state.rp = CFG.startingResearchPoints;
    state.researched = {};
    state.active = null;
    state.bonuses = {
      dmg: 0, def: 0, speed: 0, orgMax: 0, orgRegen: 0,
      fogRadius: 0, supplyLoss: 0, reinforce: 0, fortPen: 0,
      riverCross: false, retreatSave: false
    };
    state.newspapers = [];
    state.wire = [];
    state.diary = [];
    state.day = 1;
    state.dayTimer = 0;
    state.lastCityOwners = {};
    state.lastUnitCount = { zmp: 0, bl: 0 };

    rpTimer = 0;
    newspaperTimer = 0;
    wireTimer = 0;

    // Seed with initial wire entries
    addWire('Radio Lukavac signs on the air for the first day of the offensive.', 'info');
    addWire('Reports of Black League concentrations east of the Kalajevo massif.', 'warn');
    addDiary('The battle for the Lukavac valley has begun. ZMP forces are deployed at HQ; the Black League holds the eastern plain.');

    // Take a first snapshot of city ownership
    var cities = BM().getCities() || [];
    for (var i = 0; i < cities.length; i++) {
      state.lastCityOwners[cities[i].id] = cities[i].side;
    }

    createUI();
    console.log('[research_news] initialised');
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    // Day counter
    state.dayTimer += dt;
    if (state.dayTimer >= 60) {
      state.dayTimer -= 60;
      state.day += 1;
      addWire('Dawn. Day ' + state.day + ' of the battle.', 'info');
    }

    // Research points: accumulate from civs + mils
    rpTimer += dt;
    if (rpTimer >= 1) {
      rpTimer = 0;
      var econ = BE() ? BE().getEconomy() : null;
      if (econ) {
        var civs = 0, mils = 0;
        for (var key in econ.zmp.buildings) {
          civs += econ.zmp.buildings[key].civ;
          mils += econ.zmp.buildings[key].mil;
        }
        state.rp += civs * CFG.rpPerCivPerSec + mils * CFG.rpPerMilPerSec;
      }
    }

    // Active research countdown
    if (state.active) {
      state.active.timeLeft -= dt * CFG.researchSpeedMultiplier;
      if (state.active.timeLeft <= 0) {
        completeResearch(state.active.id);
      }
    }

    // Newspaper generation
    newspaperTimer += dt;
    if (newspaperTimer >= CFG.newspaperInterval) {
      newspaperTimer = 0;
      publishNewspaper();
    }

    // Wire automatic entries
    wireTimer += dt;
    if (wireTimer >= CFG.wireUpdateInterval) {
      wireTimer = 0;
      addRandomWireEntry();
    }

    // Detect city captures and unit losses
    detectCityChanges();
    detectUnitLosses();

    // Refresh UI
    uiTick += dt;
    if (uiTick >= 0.5) {
      uiTick = 0;
      refreshUI();
    }
  }

  function detectCityChanges() {
    var cities = BM().getCities() || [];
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      var prev = state.lastCityOwners[c.id];
      if (prev !== c.side) {
        state.lastCityOwners[c.id] = c.side;
        var owner = c.side === 'zmp' ? 'ZMP' :
                    c.side === 'bl' ? 'BLACK LEAGUE' : 'NEUTRAL';
        var headline = owner + ' TAKES ' + c.name.toUpperCase() + '.';
        addWire(headline, c.side === 'zmp' ? 'good' : (c.side === 'bl' ? 'bad' : 'info'));
        addDiary(owner + ' forces have taken ' + c.name + '.');
        // Force a newspaper publish next tick if this was important
        if (c.isHQ || c.isVictory) {
          newspaperTimer = CFG.newspaperInterval;  // fire next frame
        }
      }
    }
  }

  function detectUnitLosses() {
    var units = BU().getUnits() || [];
    var zmp = 0, bl = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].alive === false) continue;
      if (units[i].side === 'zmp') zmp++;
      else if (units[i].side === 'bl') bl++;
    }
    // If BL count went down since last check, they lost units
    if (bl < state.lastUnitCount.bl) {
      var diff = state.lastUnitCount.bl - bl;
      addWire('Black League loses ' + diff + ' division' + (diff > 1 ? 's' : '') + ' in the field.', 'good');
    }
    if (zmp < state.lastUnitCount.zmp) {
      var diff2 = state.lastUnitCount.zmp - zmp;
      addWire('ZMP takes ' + diff2 + ' division' + (diff2 > 1 ? 's' : '') + ' losses.', 'bad');
      addDiary('We have lost ' + diff2 + ' division' + (diff2 > 1 ? 's' : '') + ' today.');
    }
    state.lastUnitCount.zmp = zmp;
    state.lastUnitCount.bl = bl;
  }

  // ============================================================
  // RESEARCH
  // ============================================================
  function canResearch(tech) {
    if (state.researched[tech.id]) return false;
    if (state.active) return false;
    for (var i = 0; i < tech.requires.length; i++) {
      if (!state.researched[tech.requires[i]]) return false;
    }
    return state.rp >= tech.cost;
  }

  function startResearch(techId) {
    var tech = TECHS.find(function (t) { return t.id === techId; });
    if (!tech) return;
    if (!canResearch(tech)) return;

    state.rp -= tech.cost;
    state.active = {
      id: tech.id,
      timeLeft: tech.time,
      total: tech.time
    };
    addWire('Research begins: ' + tech.name, 'info');
    refreshUI();
  }

  function completeResearch(techId) {
    var tech = TECHS.find(function (t) { return t.id === techId; });
    state.active = null;
    if (!tech) return;

    state.researched[tech.id] = true;

    // Apply effects
    for (var key in tech.effect) {
      var v = tech.effect[key];
      if (typeof v === 'number') {
        state.bonuses[key] = (state.bonuses[key] || 0) + v;
      } else if (typeof v === 'boolean') {
        state.bonuses[key] = v;
      }
    }

    addWire('Breakthrough: ' + tech.name + '.', 'good');
    addDiary('Research completed: ' + tech.name + '. ' + tech.blurb);
    refreshUI();
  }

  // ============================================================
  // WIRE
  // ============================================================
  function addWire(text, kind) {
    state.wire.push({
      time: formatTime(),
      text: text,
      kind: kind || 'info'
    });
    if (state.wire.length > CFG.maxWireEntries) state.wire.shift();
  }

  function addRandomWireEntry() {
    var cities = BM().getCities() || [];
    if (cities.length === 0) return;
    var c = cities[Math.floor(Math.random() * cities.length)];
    var roll = Math.random();
    var msgs = [];

    if (roll < 0.2) {
      msgs = [
        'Wire: artillery heard near ' + c.name + '.',
        'Recon reports movement around ' + c.name + '.',
        'Local farmers report columns of infantry near ' + c.name + '.',
        'Lukavac Dispatch correspondent files from ' + c.name + '.'
      ];
    } else if (roll < 0.4) {
      msgs = [
        'Weather: mist over the valley floor.',
        'Weather: cold and clear.',
        'Weather: light rain. Roads softer than yesterday.',
        'Weather: high wind out of the northeast.'
      ];
    } else if (roll < 0.6) {
      var units = BU().getUnits() || [];
      var zmp = 0, bl = 0;
      for (var i = 0; i < units.length; i++) {
        if (units[i].alive === false) continue;
        if (units[i].side === 'zmp') zmp++;
        else if (units[i].side === 'bl') bl++;
      }
      msgs = [
        'Situation report: ' + zmp + ' ZMP divisions in the field.',
        'Situation report: ' + bl + ' Black League divisions identified.',
        'Quartermaster reports ' + Math.floor(state.rp) + ' research points in the treasury.'
      ];
    } else if (roll < 0.8) {
      msgs = [
        'Radio chatter suggests enemy morale weakening.',
        'Field reports of a successful ambush by ZMP scouts.',
        'A section of railway reported cut between ' + c.name + ' and the front.',
        'Ammunition dump destroyed in the early morning.'
      ];
    } else {
      msgs = [
        'Foreign observer: "The Lukavac valley is a textbook theater."',
        'The Wien Arbeiterbund issues a statement of support.',
        'Vatican correspondent arrives to observe the battle.',
        'A new batch of field telephones reaches the front.'
      ];
    }

    var msg = msgs[Math.floor(Math.random() * msgs.length)];
    addWire(msg, 'info');
  }

  // ============================================================
  // NEWSPAPER
  // ============================================================
  function publishNewspaper() {
    var issue = buildNewspaperIssue();
    state.newspapers.push(issue);
    if (state.newspapers.length > CFG.maxPastIssues) state.newspapers.shift();

    addWire('Newspaper: ' + issue.headline, 'info');
    if (openPanel === 'newspaper') newspaperCursor = 0;  // jump to latest
    refreshUI();
  }

  function buildNewspaperIssue() {
    var cities = BM().getCities() || [];
    var units = BU().getUnits() || [];
    var econ = BE() ? BE().getEconomy() : null;

    // Count everything
    var zmpCities = 0, blCities = 0, neutralCities = 0;
    for (var i = 0; i < cities.length; i++) {
      if (cities[i].side === 'zmp') zmpCities++;
      else if (cities[i].side === 'bl') blCities++;
      else neutralCities++;
    }
    var zmpUnits = 0, blUnits = 0, zmpHp = 0, blHp = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].alive === false) continue;
      if (units[i].side === 'zmp') { zmpUnits++; zmpHp += units[i].hp; }
      else if (units[i].side === 'bl') { blUnits++; blHp += units[i].hp; }
    }
    var grid = BM().getProvinceGrid();
    var zmpProv = 0, blProv = 0, totalProv = 0;
    if (grid) {
      for (var y = 0; y < grid.length; y++) {
        for (var x = 0; x < grid[y].length; x++) {
          totalProv++;
          if (grid[y][x].owner === 'zmp') zmpProv++;
          else if (grid[y][x].owner === 'bl') blProv++;
        }
      }
    }

    // Headline
    var headline = pickHeadline(zmpCities, blCities, zmpProv, blProv, zmpUnits, blUnits);
    var subhead  = 'Day ' + state.day + ' of the Lukavac campaign • wire from the valley floor';

    // Lead paragraph
    var lead = buildLeadParagraph(zmpCities, blCities, zmpProv, blProv, zmpUnits, blUnits, zmpHp, blHp);

    // Sidebar 1 — political
    var side1Title = 'IN THE CABINET';
    var side1Text  = 'Prestige ' + Math.floor(state.prestige) + '. ' +
                     'Research points ' + Math.floor(state.rp) + '. ' +
                     (state.active ? 'Researching: ' + findTechName(state.active.id) + '.'
                                   : 'No active research.');

    // Sidebar 2 — weather
    var weather = ['Overcast', 'Clear', 'Fog', 'Drizzle', 'Cold', 'Windy'][
      Math.floor(Math.random() * 6)];
    var side2Title = 'WEATHER';
    var side2Text  = weather + ' over the Kalajevo massif. Visibility moderate. ' +
                     'Roads ' + (weather === 'Drizzle' ? 'heavy with mud.' : 'passable.');

    // Footnote
    var footnote = pickFootnote(zmpProv, blProv, totalProv);

    return {
      day: state.day,
      time: formatTime(),
      date: fakeDate(state.day),
      headline: headline,
      subhead: subhead,
      lead: lead,
      side1Title: side1Title,
      side1Text: side1Text,
      side2Title: side2Title,
      side2Text: side2Text,
      footnote: footnote
    };
  }

  function pickHeadline(zmpCities, blCities, zmpProv, blProv, zmpUnits, blUnits) {
    var zmpPct = zmpProv / Math.max(1, zmpProv + blProv) * 100;

    if (zmpPct > 70) return 'ZMP SWEEPS THE VALLEY — BLACK LEAGUE IN RETREAT';
    if (zmpPct > 55) return 'ZMP ADVANCES ON ALL FRONTS';
    if (zmpPct > 45) return 'DEADLOCK ALONG THE RAILWAY';
    if (zmpPct > 30) return 'BLACK LEAGUE COUNTERATTACKS';
    if (zmpPct > 15) return 'ZMP FORCES FALL BACK — ENEMY PRESSES WEST';
    return 'CAPITAL AT RISK — LEAGUE FORCES REACH THE HOMELAND';

    // Alternates when very quiet
    if (zmpUnits === blUnits) return 'FORCES EVENLY MATCHED IN THE VALLEY';
    return 'DESPATCHES FROM THE FRONT';
  }

  function buildLeadParagraph(zmpCities, blCities, zmpProv, blProv, zmpUnits, blUnits, zmpHp, blHp) {
    var p = [];
    p.push('LUKAVAC — The front continues to shift. ZMP forces now hold ' +
           zmpCities + ' town' + (zmpCities === 1 ? '' : 's') + ' and ' +
           zmpProv + ' kilometre square' + (zmpProv === 1 ? '' : 's') +
           ' of the valley, against the Black League\'s ' + blCities +
           ' town' + (blCities === 1 ? '' : 's') + ' and ' + blProv + '.');
    p.push('Field strength on both sides remains ' +
           (Math.abs(zmpUnits - blUnits) <= 2 ? 'closely matched' : 'unequal') +
           '. ZMP divisions number ' + zmpUnits +
           ', the Black League\'s ' + blUnits + '.');
    p.push('The Army reports ' + Math.round(zmpHp) + ' effective fighting men in the ranks today, ' +
           'against ' + Math.round(blHp) + ' in the League. Supply lines hold.');
    return p.join(' ');
  }

  function pickFootnote(zmpProv, blProv, totalProv) {
    var pct = Math.round((zmpProv / Math.max(1, totalProv)) * 100);
    return 'ZMP controls ' + pct + '% of the valley. Total war score is ' +
           (zmpProv + blProv) + ' / ' + totalProv + ' sectors.';
  }

  function fakeDate(day) {
    // Just format as "Day N — Month" to avoid real dates
    var months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE'];
    var m = months[Math.min(months.length - 1, Math.floor((day - 1) / 30))];
    return m + ' — DAY ' + day;
  }

  function findTechName(id) {
    var t = TECHS.find(function (tt) { return tt.id === id; });
    return t ? t.name : id;
  }

  // ============================================================
  // DIARY
  // ============================================================
  function addDiary(text) {
    state.diary.push({
      day: state.day,
      time: formatTime(),
      text: text
    });
    if (state.diary.length > CFG.maxDiaryEntries) state.diary.shift();
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function formatTime() {
    // Fake clock: 06:00 at start of the campaign, advances with the day
    // We'll just fake it as day time
    var totalMinutes = (state.day - 1) * 1440 + Math.floor(state.dayTimer / 60 * 1440);
    var hrs = Math.floor((totalMinutes / 60) % 24);
    var mins = Math.floor(totalMinutes % 60);
    return pad2(hrs) + ':' + pad2(mins);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ============================================================
  // UI — ROOT
  // ============================================================
  function createUI() {
    // Remove existing
    ['rn-root', 'rn-newspaper', 'rn-wire', 'rn-diary'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });

    // Top bar buttons for opening panels
    uiRoot = document.createElement('div');
    uiRoot.id = 'rn-root';
    uiRoot.style.cssText =
      'position:absolute;top:36px;right:10px;display:flex;flex-direction:column;gap:4px;' +
      'z-index:24;font-family:monospace;';
    var container = document.getElementById('battle-container') || document.body;
    container.appendChild(uiRoot);

    // Wire feed (bottom-right)
    wireRoot = document.createElement('div');
    wireRoot.id = 'rn-wire';
    wireRoot.style.cssText =
      'position:absolute;bottom:10px;right:10px;width:320px;height:180px;' +
      'background:rgba(10,10,10,0.82);border:1px solid #4a4a3a;border-radius:3px;' +
      'font-family:monospace;font-size:10px;color:#ccc;padding:8px;overflow-y:auto;' +
      'z-index:22;';
    container.appendChild(wireRoot);

    // Newspaper panel (hidden until opened)
    newspaperRoot = document.createElement('div');
    newspaperRoot.id = 'rn-newspaper';
    newspaperRoot.style.cssText =
      'position:absolute;top:60px;left:50%;transform:translateX(-50%);width:600px;' +
      'max-height:calc(100vh - 120px);overflow-y:auto;' +
      'background:#f5efe0;color:#1a1a1a;font-family:Georgia,serif;' +
      'border:2px solid #2a2a2a;box-shadow:0 0 40px rgba(0,0,0,0.8);' +
      'padding:24px;z-index:60;display:none;';
    container.appendChild(newspaperRoot);

    // Diary panel (hidden until opened)
    diaryRoot = document.createElement('div');
    diaryRoot.id = 'rn-diary';
    diaryRoot.style.cssText =
      'position:absolute;top:60px;left:50%;transform:translateX(-50%);width:600px;' +
      'max-height:calc(100vh - 120px);overflow-y:auto;' +
      'background:#181410;color:#e8dcc0;font-family:monospace;' +
      'border:2px solid #8a7a4a;box-shadow:0 0 40px rgba(0,0,0,0.8);' +
      'padding:24px;z-index:60;display:none;';
    container.appendChild(diaryRoot);

    refreshUI();
    renderWire();
  }

  function refreshUI() {
    if (!uiRoot) return;

    var html = '';
    html += '<button id="rn-btn-research" style="' + btnStyle() + '">🔬 Research</button>';
    html += '<button id="rn-btn-newspaper" style="' + btnStyle() + '">📰 The Dispatch</button>';
    html += '<button id="rn-btn-diary" style="' + btnStyle() + '">📔 War Diary</button>';

    uiRoot.innerHTML = html;

    document.getElementById('rn-btn-research').onclick = function () { togglePanel('research'); };
    document.getElementById('rn-btn-newspaper').onclick = function () {
      if (state.newspapers.length === 0) publishNewspaper();
      togglePanel('newspaper');
    };
    document.getElementById('rn-btn-diary').onclick = function () { togglePanel('diary'); };

    // Also update the RP display
    if (openPanel === 'research') renderResearchPanel();
    if (openPanel === 'newspaper') renderNewspaperPanel();
    if (openPanel === 'diary') renderDiaryPanel();
  }

  function btnStyle() {
    return 'background:#181410;color:#e8c880;border:1px solid #8a7a4a;' +
           'padding:4px 10px;cursor:pointer;font-family:monospace;font-size:10px;' +
           'border-radius:3px;';
  }

  function togglePanel(name) {
    if (openPanel === name) {
      closePanel();
      return;
    }
    closePanel();
    openPanel = name;
    if (name === 'research') renderResearchPanel();
    else if (name === 'newspaper') renderNewspaperPanel();
    else if (name === 'diary') renderDiaryPanel();
  }

  function closePanel() {
    openPanel = null;
    if (newspaperRoot) newspaperRoot.style.display = 'none';
    if (diaryRoot) diaryRoot.style.display = 'none';
    var rp = document.getElementById('rn-research-panel');
    if (rp) rp.remove();
  }

  // ============================================================
  // RESEARCH PANEL
  // ============================================================
  function renderResearchPanel() {
    // Reuse the newspaper root styling but for research
    var existing = document.getElementById('rn-research-panel');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.id = 'rn-research-panel';
    panel.style.cssText =
      'position:absolute;top:60px;left:50%;transform:translateX(-50%);width:720px;' +
      'max-height:calc(100vh - 120px);overflow-y:auto;' +
      'background:#101015;color:#ddd;font-family:monospace;' +
      'border:2px solid #4a5a7a;box-shadow:0 0 40px rgba(0,0,0,0.9);' +
      'padding:22px;z-index:60;';

    var html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a3a5a;padding-bottom:8px;">';
    html += '<div style="font-size:1.3rem;color:#9ab8e0;letter-spacing:2px;">RESEARCH DIRECTORATE</div>';
    html += '<div style="font-size:1.4rem;color:#ffd700;">' + Math.floor(state.rp) + ' RP</div>';
    html += '</div>';

    if (state.active) {
      var t = state.active;
      var tech = TECHS.find(function (x) { return x.id === t.id; });
      var pct = Math.round((1 - t.timeLeft / t.total) * 100);
      html += '<div style="background:#1a2030;border:1px solid #4a5a7a;padding:10px;margin:12px 0;">';
      html += '<div style="color:#ffd700;font-size:1.1rem;">RESEARCHING: ' + (tech ? tech.name : t.id) + '</div>';
      html += '<div style="background:#0a0a0f;height:10px;margin-top:6px;border:1px solid #2a3a5a;">';
      html += '<div style="background:#4a7ac8;height:10px;width:' + pct + '%;"></div>';
      html += '</div>';
      html += '<div style="font-size:0.85rem;color:#888;margin-top:4px;">' + pct + '% — ' + Math.round(t.timeLeft) + 's remaining</div>';
      html += '</div>';
    }

    // Branches
    var branchKeys = Object.keys(BRANCHES);
    for (var bi = 0; bi < branchKeys.length; bi++) {
      var bkey = branchKeys[bi];
      var branch = BRANCHES[bkey];
      var techs = TECHS.filter(function (x) { return x.branch === bkey; });

      html += '<div style="margin-top:16px;">';
      html += '<div style="color:' + branch.color + ';font-size:1rem;letter-spacing:1px;border-bottom:1px solid ' + branch.color + '33;padding-bottom:4px;">' + branch.name.toUpperCase() + '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">';

      for (var ti = 0; ti < techs.length; ti++) {
        var tech = techs[ti];
        var done = !!state.researched[tech.id];
        var available = canResearch(tech);
        var unmet = tech.requires.filter(function (rid) { return !state.researched[rid]; });
        var locked = unmet.length > 0;

        var bg = done ? '#1a2a1a' :
                 locked ? '#201815' :
                 available ? '#1a2030' : '#181818';
        var border = done ? '#5fae3c' :
                     locked ? '#5a4a3a' :
                     available ? '#4a7ac8' : '#333';
        var color = done ? '#7fdf7f' :
                    locked ? '#8a7a6a' :
                    available ? '#9ab8e0' : '#666';

        html += '<div style="background:' + bg + ';border:1px solid ' + border + ';padding:8px;">';
        html += '<div style="color:' + color + ';font-weight:bold;font-size:0.85rem;">T' + tech.tier + ' · ' + tech.name + '</div>';
        html += '<div style="font-size:0.75rem;color:#aaa;margin:4px 0;">' + tech.blurb + '</div>';
        html += '<div style="font-size:0.7rem;color:#888;">Cost: ' + tech.cost + ' RP · ' + tech.time + 's</div>';
        if (done) {
          html += '<div style="font-size:0.7rem;color:#7fdf7f;margin-top:4px;">✔ Researched</div>';
        } else if (locked) {
          html += '<div style="font-size:0.7rem;color:#8a7a6a;margin-top:4px;">Requires: ' + unmet.map(findTechName).join(', ') + '</div>';
        } else if (available) {
          html += '<button data-tech="' + tech.id + '" style="margin-top:6px;background:#1a3a6a;color:#fff;border:1px solid #4a7ac8;padding:3px 8px;cursor:pointer;font-family:monospace;font-size:0.75rem;">Research</button>';
        } else {
          html += '<div style="font-size:0.7rem;color:#666;margin-top:4px;">Not enough RP</div>';
        }
        html += '</div>';
      }

      html += '</div></div>';
    }

    html += '<div style="margin-top:16px;text-align:center;">';
    html += '<button id="rn-close-research" style="background:#2a2018;color:#e8c880;border:1px solid #8a7a4a;padding:6px 20px;cursor:pointer;font-family:monospace;">Close</button>';
    html += '</div>';

    panel.innerHTML = html;
    var container = document.getElementById('battle-container') || document.body;
    container.appendChild(panel);

    // Handlers
    var btns = panel.querySelectorAll('button[data-tech]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = (function (el) {
        return function () { startResearch(el.getAttribute('data-tech')); };
      })(btns[i]);
    }
    document.getElementById('rn-close-research').onclick = closePanel;
  }

  // ============================================================
  // NEWSPAPER PANEL
  // ============================================================
  function renderNewspaperPanel() {
    if (!newspaperRoot) return;
    newspaperRoot.style.display = 'block';

    if (state.newspapers.length === 0) {
      newspaperRoot.innerHTML = '<div style="text-align:center;padding:40px;font-family:Georgia,serif;">No issues yet.</div>';
      return;
    }

    var idx = state.newspapers.length - 1 - newspaperCursor;
    if (idx < 0) idx = 0;
    if (idx >= state.newspapers.length) idx = state.newspapers.length - 1;
    var issue = state.newspapers[idx];

    var html = '';
    html += '<div style="text-align:center;border-bottom:3px double #1a1a1a;padding-bottom:8px;margin-bottom:12px;">';
    html += '<div style="font-size:2.2rem;font-weight:bold;font-family:Georgia,serif;letter-spacing:3px;">THE LUKAVAC DISPATCH</div>';
    html += '<div style="font-size:0.75rem;color:#666;letter-spacing:1px;margin-top:2px;">' + issue.date + ' · ' + issue.time + ' · PRICE 2 DINARS</div>';
    html += '</div>';

    html += '<div style="font-size:1.8rem;font-weight:bold;font-family:Georgia,serif;line-height:1.1;margin-bottom:6px;">' + issue.headline + '</div>';
    html += '<div style="font-size:0.9rem;font-style:italic;color:#444;margin-bottom:12px;">' + issue.subhead + '</div>';

    html += '<div style="border-top:1px solid #333;border-bottom:1px solid #333;padding:10px 0;margin-bottom:12px;font-size:1rem;line-height:1.6;column-count:2;column-gap:20px;">';
    html += issue.lead;
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:0.9rem;">';
    html += '<div style="border-left:3px solid #8a3a1a;padding-left:10px;">';
    html += '<div style="font-weight:bold;color:#8a3a1a;">' + issue.side1Title + '</div>';
    html += '<div style="margin-top:4px;line-height:1.5;">' + issue.side1Text + '</div>';
    html += '</div>';
    html += '<div style="border-left:3px solid #1a3a8a;padding-left:10px;">';
    html += '<div style="font-weight:bold;color:#1a3a8a;">' + issue.side2Title + '</div>';
    html += '<div style="margin-top:4px;line-height:1.5;">' + issue.side2Text + '</div>';
    html += '</div>';
    html += '</div>';

    html += '<div style="margin-top:16px;padding-top:8px;border-top:1px solid #333;font-size:0.8rem;color:#666;text-align:center;">';
    html += issue.footnote;
    html += '</div>';

    html += '<div style="margin-top:16px;text-align:center;font-family:monospace;">';
    html += '<button id="rn-np-prev" style="margin:0 4px;padding:4px 12px;">← Previous</button>';
    html += '<span style="font-size:0.8rem;color:#666;">Issue ' + (state.newspapers.length - newspaperCursor) + ' / ' + state.newspapers.length + '</span>';
    html += '<button id="rn-np-next" style="margin:0 4px;padding:4px 12px;">Next →</button>';
    html += '<button id="rn-np-close" style="margin-left:12px;padding:4px 20px;">Close</button>';
    html += '</div>';

    newspaperRoot.innerHTML = html;

    document.getElementById('rn-np-prev').onclick = function () {
      if (newspaperCursor < state.newspapers.length - 1) newspaperCursor++;
      renderNewspaperPanel();
    };
    document.getElementById('rn-np-next').onclick = function () {
      if (newspaperCursor > 0) newspaperCursor--;
      renderNewspaperPanel();
    };
    document.getElementById('rn-np-close').onclick = closePanel;
  }

  // ============================================================
  // DIARY PANEL
  // ============================================================
  function renderDiaryPanel() {
    if (!diaryRoot) return;
    diaryRoot.style.display = 'block';

    var html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #4a3a20;padding-bottom:8px;">';
    html += '<div style="font-size:1.4rem;color:#e8c880;letter-spacing:2px;">WAR DIARY</div>';
    html += '<div style="font-size:0.85rem;color:#8a7a5a;">' + state.diary.length + ' entries</div>';
    html += '</div>';

    // Group by day
    var byDay = {};
    for (var i = 0; i < state.diary.length; i++) {
      var e = state.diary[i];
      if (!byDay[e.day]) byDay[e.day] = [];
      byDay[e.day].push(e);
    }

    var days = Object.keys(byDay).map(function (n) { return parseInt(n, 10); });
    days.sort(function (a, b) { return b - a; });   // newest first

    for (var di = 0; di < days.length; di++) {
      var d = days[di];
      html += '<div style="margin-top:14px;">';
      html += '<div style="color:#c8a860;font-size:1.1rem;border-bottom:1px dotted #4a3a20;padding-bottom:2px;">DAY ' + d + '</div>';
      var entries = byDay[d].slice().reverse();
      for (var ei = 0; ei < entries.length; ei++) {
        var e = entries[ei];
        html += '<div style="margin-top:6px;display:flex;gap:10px;">';
        html += '<div style="color:#8a7a5a;font-size:0.8rem;flex:0 0 60px;">' + e.time + '</div>';
        html += '<div style="color:#e8dcc0;font-size:0.9rem;line-height:1.5;flex:1;">' + e.text + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    html += '<div style="margin-top:20px;text-align:center;">';
    html += '<button id="rn-diary-close" style="background:#2a2018;color:#e8c880;border:1px solid #8a7a4a;padding:6px 20px;cursor:pointer;font-family:monospace;">Close</button>';
    html += '</div>';

    diaryRoot.innerHTML = html;
    document.getElementById('rn-diary-close').onclick = closePanel;
  }

  // ============================================================
  // WIRE
  // ============================================================
  function renderWire() {
    if (!wireRoot) return;
    var recent = state.wire.slice(-20).reverse();
    var html = '<div style="color:#c8a860;font-weight:bold;margin-bottom:6px;">📡 WIRE FEED</div>';
    for (var i = 0; i < recent.length; i++) {
      var w = recent[i];
      var color = w.kind === 'good' ? '#7fdf7f' :
                  w.kind === 'bad' ? '#ff7070' :
                  w.kind === 'warn' ? '#ffcc00' : '#ccc';
      html += '<div style="margin-bottom:4px;line-height:1.3;">';
      html += '<span style="color:#666;">' + w.time + '</span> ';
      html += '<span style="color:' + color + ';">' + w.text + '</span>';
      html += '</div>';
    }
    wireRoot.innerHTML = html;
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  function shutdown() {
    ['rn-root', 'rn-newspaper', 'rn-wire', 'rn-diary', 'rn-research-panel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
    uiRoot = null; newspaperRoot = null; wireRoot = null; diaryRoot = null;
  }

  function getBonuses() { return state.bonuses; }
  function getState() { return state; }

  return {
    CFG: CFG,
    TECHS: TECHS,
    BRANCHES: BRANCHES,
    init: init,
    update: update,
    shutdown: shutdown,
    getBonuses: getBonuses,
    getState: getState,
    addWire: addWire,
    addDiary: addDiary,
    publishNewspaper: publishNewspaper,
    renderWire: renderWire
  };
})();