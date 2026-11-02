// battle_economy.js — File 5: full HOI4-style strategic layer
// ============================================================
//   - Civs and Mils are REAL BUILDINGS placed on provinces
//   - Construction is per-province, cancelled if enemy walks over
//   - Supply: units far from friendly territory take attrition
//   - Combat width: only N units fight at once per province
//   - Division templates: choose what to build
//   - Fog of war: you only see enemy units near your own
//   - Reinforce / upgrade damaged divisions
//   - War score: capture provinces, first to threshold wins
//
// Depends on BattleMap, BattleUnits, BattleFront.
// Exposes: window.BattleEconomy
// ============================================================

window.BattleEconomy = (function () {
  'use strict';

  function BM() { return window.BattleMap; }
  function BU() { return window.BattleUnits; }
  function BF() { return window.BattleFront; }

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    // --- Production ---
    civEquipPerSec: 0.8,          // each civ contributes to equipment production
    milEquipPerSec: 1.4,          // each mil contributes more
    startingEquip: 30,
    startingDivisions: 6,         // how many divisions each side starts with at HQ

    // --- Construction ---
    civCostEquip: 40,
    civBuildTime: 14,
    milCostEquip: 55,
    milBuildTime: 18,
    fortCostEquip: 30,
    fortBuildTime: 12,
    fortMaxLevel: 3,
    infraCostEquip: 20,
    infraBuildTime: 8,
    infraMaxLevel: 5,

    // --- Division templates (cost, stats) ---
    templates: {
      infantry: {
        name: 'Infantry', symbol: 'I', color: '#4aa04a',
        costEquip: 20, hp: 100, org: 100, atk: 8, def: 12,
        speed: 1.0, typeIds: ['line']
      },
      cavalry: {
        name: 'Cavalry', symbol: 'X', color: '#2a7a2a',
        costEquip: 28, hp: 130, org: 110, atk: 14, def: 10,
        speed: 1.25, typeIds: ['dzehurjaca']
      },
      artillery: {
        name: 'Artillery', symbol: 'O', color: '#2a4a2a',
        costEquip: 35, hp: 60, org: 90, atk: 22, def: 4,
        speed: 0.55, typeIds: ['artillery']
      },
      mixed: {
        name: 'Mixed Bde', symbol: 'III', color: '#5ab05a',
        costEquip: 25, hp: 100, org: 100, atk: 11, def: 11,
        speed: 0.95, typeIds: ['musket']
      }
    },

    // --- Supply ---
    supplyRange: 680,             // how far from a friendly province a unit stays supplied
    supplyAttritionHpPerSec: 0.2, // HP lost per second when out of supply
    supplyOrgPenalty: 0.5,        // org regen multiplied by this when out of supply

    // --- Combat width ---
    combatWidth: 3,               // max units fighting per side per province

    // --- Fog ---
    fogRevealRadius: 220,         // you see enemy units within this distance of any of your units

    // --- War score ---
    scorePerProvince: 1,
    scorePerCity: 5,
    scorePerDivisionKill: 2,
    warScoreToWin: 100,

    // --- AI ---
    aiBuildInterval: 6,
    aiDivisionBuildInterval: 10
  };

  // ============================================================
  // STATE
  // ============================================================
  var economy = {
    zmp: {
      equip: CFG.startingEquip,
      // Per-province buildings: { 'x,y': { civ: n, mil: n, constructing: {kind, timeLeft} } }
      buildings: {},
      // Construction queue is per-province
      score: 0
    },
    bl: {
      equip: CFG.startingEquip,
      buildings: {},
      score: 0
    }
  };

  var infraGrid = null;
  var fortGrid = null;
  var aiBuildTimer = 0;
  var aiDivTimer = 0;
  var playerPanelRoot = null;
  var uiTick = 0;
  var placementMode = null;
  var templateMenuOpen = false;

  // ============================================================
  // BOOT
  // ============================================================
  function init() {
    economy.zmp.equip = CFG.startingEquip;
    economy.bl.equip = CFG.startingEquip;
    economy.zmp.buildings = {};
    economy.bl.buildings = {};
    economy.zmp.score = 0;
    economy.bl.score = 0;

    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    infraGrid = [];
    fortGrid = [];
    for (var y = 0; y < rows; y++) {
      infraGrid[y] = [];
      fortGrid[y] = [];
      for (var x = 0; x < cols; x++) {
        infraGrid[y][x] = 0;
        fortGrid[y][x] = 0;
      }
    }

    // Seed each HQ with some starting buildings and infra


    // Give both sides some starting divisions via templates
    seedStartingDivisions('zmp', 'zmp_hq');
    seedStartingDivisions('bl', 'bl_hq');

    aiBuildTimer = 0;
    aiDivTimer = 0;

    createPlayerPanel();

    console.log('[battle_economy] initialised. ZMP equip:', economy.zmp.equip,
                'BL equip:', economy.bl.equip);
  }

  function seedHQ(cityId, side) {
    var c = BM().getCities().find(function (cc) { return cc.id === cityId; });
    if (!c) return;
    var key = provinceKey(c.x, c.y);
    economy[side].buildings[key] = { civ: 2, mil: 1, constructing: null };
    var p = worldToProv(c.x, c.y);
    if (p) {
      infraGrid[p.y][p.x] = 3;
      fortGrid[p.y][p.x] = 1;
    }
  }

  function seedStartingDivisions(side, hqCityId) {
    var hq = BM().getCities().find(function (c) { return c.id === hqCityId; });
    if (!hq) return;

    var types = side === 'zmp'
      ? ['infantry', 'cavalry', 'infantry', 'mixed', 'infantry', 'artillery']
      : ['infantry', 'cavalry', 'infantry', 'mixed', 'infantry', 'infantry'];

    var units = BU().getUnits();
    for (var i = 0; i < CFG.startingDivisions; i++) {
      var templ = CFG.templates[types[i % types.length]];
      if (!templ) continue;

      var angle = (i / CFG.startingDivisions) * Math.PI * 2;
      var r = 30 + (i % 3) * 15;
      var ux = hq.x + Math.cos(angle) * r;
      var uy = hq.y + Math.sin(angle) * r;

      spawnDivision(side, templ, ux, uy);
    }
  }

    function spawnDivision(side, templ, ux, uy) {
    var units = BU().getUnits();
    var typeId;
    if (side === 'zmp') {
      typeId = templ.typeIds[0];
    } else {
      if (templ === CFG.templates.cavalry) typeId = 'black_rider';
      else if (templ === CFG.templates.mixed) typeId = 'bl_musket';
      else if (templ === CFG.templates.artillery) typeId = 'bl_artillery';
      else typeId = 'bl_line';
    }
    var typeDef = BU().UNIT_TYPES[typeId];
    if (!typeDef) return;

    // Ask the units module for a fresh numbered symbol.
    // We call makeUnit() rather than building the object inline so
    // the roster counters in battle_units.js stay consistent.
    var unit = null;
    if (typeof BU().makeUnit === 'function') {
      unit = BU().makeUnit(typeId, side, ux, uy);
    }

    if (!unit) {
      // Fallback: build it ourselves if the units module doesn't
      // expose makeUnit.
      unit = {
        id: 'u' + (Math.random() * 1e9 | 0),
        typeId: typeId,
        side: side,
        symbol: '·',
        x: ux, y: uy,
        targetX: ux, targetY: uy,
        facing: side === 'zmp' ? -Math.PI / 2 : Math.PI / 2,
        speed: typeDef.speed * templ.speed,
        hp: templ.hp, hpMax: templ.hp,
        org: templ.org, orgMax: templ.org,
        stamina: 100,
        moving: false, arrived: true,
        inCombat: false, combatTarget: null,
        pushX: 0, pushY: 0,
        selected: false, combatSlot: null
      };
    } else {
      // makeUnit already gave us a symbol. Override the stats from
      // the template so the division matches its build cost.
      unit.hp = templ.hp;  unit.hpMax = templ.hp;
      unit.org = templ.org; unit.orgMax = templ.org;
      unit.speed = typeDef.speed * templ.speed;
    }

    units.push(unit);
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    // 1. Production: all civs + mils on the map produce equipment
    var zmpProduction = 0, blProduction = 0;
    for (var key in economy.zmp.buildings) {
      var b = economy.zmp.buildings[key];
      zmpProduction += b.civ * CFG.civEquipPerSec + b.mil * CFG.milEquipPerSec;
    }
    for (var key in economy.bl.buildings) {
      var b2 = economy.bl.buildings[key];
      blProduction += b2.civ * CFG.civEquipPerSec + b2.mil * CFG.milEquipPerSec;
    }
    economy.zmp.equip += zmpProduction * dt;
    economy.bl.equip += blProduction * dt;

    // 2. Construction timers (per province, per side)
    tickConstruction(economy.zmp, 'zmp', dt);
    tickConstruction(economy.bl, 'bl', dt);

    // 3. Supply
    updateSupply(dt);

    // 4. Combat width slots
    updateCombatSlots();

    // 5. War score
    updateWarScore();

    // 6. Fog of war redraw is handled by draw() below

    // 7. BL AI
    aiBuildTimer += dt;
    if (aiBuildTimer >= CFG.aiBuildInterval) {
      aiBuildTimer = 0;
      blAIBuild();
    }
    aiDivTimer += dt;
    if (aiDivTimer >= CFG.aiDivisionBuildInterval) {
      aiDivTimer = 0;
      blAIBuildDivision();
    }

    // 8. Player panel refresh
    uiTick += dt;
    if (uiTick >= 0.25 && playerPanelRoot) {
      uiTick = 0;
      renderPlayerPanel();
    }
  }

  function tickConstruction(side, sideKey, dt) {
    var buildings = economy[sideKey].buildings;
    for (var key in buildings) {
      var b = buildings[key];
      if (!b.constructing) continue;
      // If the province is no longer owned by us, cancel construction
      var parts = key.split(',');
      var px = parseInt(parts[0], 10);
      var py = parseInt(parts[1], 10);
      var grid = BM().getProvinceGrid();
      if (!grid[py] || !grid[py][px] || grid[py][px].owner !== side) {
        b.constructing = null;
        continue;
      }
      b.constructing.timeLeft -= dt;
      if (b.constructing.timeLeft <= 0) {
        var kind = b.constructing.kind;
        if (kind === 'civ') b.civ += 1;
        else if (kind === 'mil') b.mil += 1;
        b.constructing = null;
      }
    }
  }

  // ============================================================
  // SUPPLY
  // ============================================================
  function updateSupply(dt) {
    var units = BU().getUnits();
    var grid = BM().getProvinceGrid();
    if (!grid || !units) return;
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cw = BM().CFG.W / cols;
    var ch = BM().CFG.H / rows;

    // Build a set of owned provinces for fast lookup
    function hasFriendlyProvinceNear(x, y) {
      var px = Math.floor(x / cw);
      var py = Math.floor(y / ch);
      var radiusCells = Math.ceil(CFG.supplyRange / Math.min(cw, ch));
      for (var dy = -radiusCells; dy <= radiusCells; dy++) {
        for (var dx = -radiusCells; dx <= radiusCells; dx++) {
          var cx = px + dx;
          var cy = py + dy;
          if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
          var wcx = cx * cw + cw / 2;
          var wcy = cy * ch + ch / 2;
          if (Math.hypot(wcx - x, wcy - y) > CFG.supplyRange) continue;
          if (grid[cy][cx].owner === 'zmp' || grid[cy][cx].owner === 'bl') {
            // Friendly if it matches this unit's side
            return grid[cy][cx].owner;
          }
        }
      }
      return null;
    }

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.alive === false) continue;
      var ownerNear = hasFriendlyProvinceNear(u.x, u.y);
      u.inSupply = (ownerNear === u.side);
      if (!u.inSupply) {
        u.hp -= CFG.supplyAttritionHpPerSec * dt;
        if (u.hp <= 0 && u.alive !== false) {
          u.alive = false;
          u.hp = 0;
          logMessage('[supply] ' + (u.templateId || u.typeId) + ' (' + u.side.toUpperCase() + ') destroyed by attrition');
        }
      }
    }
  }

  // ============================================================
  // COMBAT WIDTH
  // ============================================================
  function updateCombatSlots() {
    var units = BU().getUnits();
    if (!units) return;

    // Reset combat slots
    for (var i = 0; i < units.length; i++) {
      units[i].combatSlot = null;
    }

    // For each unit that's in combat, count how many friendlies are
    // already in the same combat "cluster" (roughly within 60 units)
    // near the same enemy. Give the first N slots.
    // Simplified: for each unit in combat, allow at most CFG.combatWidth
    // per side per approximately-60-unit cell.
    var slotsPerCell = {};
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!u.inCombat) continue;
      var cellKey = u.side + '|' + Math.round(u.x / 60) + '|' + Math.round(u.y / 60);
      if (!slotsPerCell[cellKey]) slotsPerCell[cellKey] = 0;
      if (slotsPerCell[cellKey] < CFG.combatWidth) {
        u.combatSlot = slotsPerCell[cellKey];
        slotsPerCell[cellKey]++;
      } else {
        // In reserve — no combat bonus, and takes reduced damage this tick
        u.inReserve = true;
      }
      if (u.combatSlot !== null) u.inReserve = false;
    }
  }

  // ============================================================
  // WAR SCORE
  // ============================================================
  function updateWarScore() {
    // Count provinces owned per side
    var grid = BM().getProvinceGrid();
    if (!grid) return;
    var zmpProv = 0, blProv = 0;
    for (var y = 0; y < grid.length; y++) {
      for (var x = 0; x < grid[y].length; x++) {
        if (grid[y][x].owner === 'zmp') zmpProv++;
        else if (grid[y][x].owner === 'bl') blProv++;
      }
    }

    // Count cities owned per side
    var cities = BM().getCities();
    var zmpCities = 0, blCities = 0;
    for (var i = 0; i < cities.length; i++) {
      if (cities[i].side === 'zmp') zmpCities++;
      else if (cities[i].side === 'bl') blCities++;
    }

    economy.zmp.score = zmpProv * CFG.scorePerProvince + zmpCities * CFG.scorePerCity;
    economy.bl.score  = blProv  * CFG.scorePerProvince + blCities  * CFG.scorePerCity;
  }

  // ============================================================
  // BL AI
  // ============================================================
  function blAIBuild() {
    var bl = economy.bl;

    // Build a civ if fewer than 4
    var totalCivs = 0, totalMils = 0, keys = Object.keys(bl.buildings);
    for (var i = 0; i < keys.length; i++) {
      var b = bl.buildings[keys[i]];
      totalCivs += b.civ;
      totalMils += b.mil;
    }

    // Find a friendly province to build in
    var grid = BM().getProvinceGrid();
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;

    if (totalCivs < 4 && bl.equip >= CFG.civCostEquip) {
      var target = pickBuildProvince('bl');
      if (target) {
        bl.equip -= CFG.civCostEquip;
        ensureBuilding(bl.buildings, target.x, target.y).constructing = {
          kind: 'civ', timeLeft: CFG.civBuildTime
        };
        return;
      }
    }

    if (totalMils < 3 && bl.equip >= CFG.milCostEquip) {
      var target2 = pickBuildProvince('bl');
      if (target2) {
        bl.equip -= CFG.milCostEquip;
        ensureBuilding(bl.buildings, target2.x, target2.y).constructing = {
          kind: 'mil', timeLeft: CFG.milBuildTime
        };
        return;
      }
    }

    // Otherwise, upgrade a fort on the front
    if (bl.equip >= CFG.fortCostEquip) {
      var fortCell = pickFortProvince('bl');
      if (fortCell && fortGrid[fortCell.y][fortCell.x] < CFG.fortMaxLevel) {
        bl.equip -= CFG.fortCostEquip;
        fortGrid[fortCell.y][fortCell.x] += 1;
        logMessage('[AI] BL builds a fort');
      }
    }
  }

  function blAIBuildDivision() {
    var bl = economy.bl;
    if (bl.equip < 25) return;
    var choice = Math.random();
    var templ;
    if (choice < 0.6) templ = CFG.templates.infantry;
    else if (choice < 0.85) templ = CFG.templates.cavalry;
    else templ = CFG.templates.mixed;

    if (bl.equip < templ.costEquip) return;
    bl.equip -= templ.costEquip;

    var hq = BM().getCities().find(function (c) { return c.id === 'bl_hq'; });
    if (!hq) return;
    var angle = Math.random() * Math.PI * 2;
    var r = 30 + Math.random() * 40;
    spawnDivision('bl', templ, hq.x + Math.cos(angle) * r, hq.y + Math.sin(angle) * r);
    logMessage('[AI] BL fields ' + templ.name);
  }

  function pickBuildProvince(side) {
    var grid = BM().getProvinceGrid();
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var best = null;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        if (grid[y][x].owner !== side) continue;
        // Prefer provinces with no buildings yet
        var key = x + ',' + y;
        var b = economy[side].buildings[key];
        if (!b || (!b.civ && !b.mil)) {
          best = { x: x, y: y };
          if (Math.random() < 0.4) return best;   // randomise a bit
        }
      }
    }
    return best;
  }

  function pickFortProvince(side) {
    var units = BU().getUnits();
    var grid = BM().getProvinceGrid();
    if (!grid || !units) return null;
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cw = BM().CFG.W / cols;
    var ch = BM().CFG.H / rows;
    var enemySide = side === 'bl' ? 'zmp' : 'bl';
    var enemies = units.filter(function (u) { return u.side === enemySide && u.alive !== false; });
    if (enemies.length === 0) return null;

    var best = null, bestDist = Infinity;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        if (grid[y][x].owner !== side) continue;
        if (fortGrid[y][x] >= CFG.fortMaxLevel) continue;
        var cx = x * cw + cw / 2;
        var cy = y * ch + ch / 2;
        var minD = Infinity;
        for (var i = 0; i < enemies.length; i++) {
          var d = Math.hypot(enemies[i].x - cx, enemies[i].y - cy);
          if (d < minD) minD = d;
        }
        if (minD < 250 && minD < bestDist) { bestDist = minD; best = { x: x, y: y }; }
      }
    }
    return best;
  }

  function ensureBuilding(store, px, py) {
    var key = px + ',' + py;
    if (!store[key]) store[key] = { civ: 0, mil: 0, constructing: null };
    return store[key];
  }

  // ============================================================
  // FOG OF WAR
  // ============================================================
  // Returns true if a world position is visible to the given side.
  // Called by the drawing code in battle_front.js / battle_units.js.
    function isVisibleTo(side, worldX, worldY) {
    if (side === 'zmp' && window.BattleDrones && window.BattleDrones.isRevealedTo) {
      if (window.BattleDrones.isRevealedTo(worldX, worldY)) return true;
    }
    var units = BU().getUnits();
    if (!units) return false;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== side) continue;
      if (u.alive === false) continue;
      if (Math.hypot(u.x - worldX, u.y - worldY) <= CFG.fogRevealRadius) return true;
    }
    return false;
  }

  // ============================================================
  // PLAYER PANEL
  // ============================================================
  function createPlayerPanel() {
    if (playerPanelRoot) playerPanelRoot.remove();
    playerPanelRoot = document.createElement('div');
    playerPanelRoot.id = 'battle-economy-panel';
    playerPanelRoot.style.cssText =
      'position:absolute;left:10px;top:36px;width:240px;' +
      'background:rgba(0,0,0,0.82);border:1px solid #444;border-radius:4px;' +
      'padding:10px;font-family:monospace;font-size:11px;color:#ddd;z-index:20;';

    var container = document.getElementById('battle-container') || document.body;
    container.appendChild(playerPanelRoot);

    renderPlayerPanel();
  }

  function renderPlayerPanel() {
    if (!playerPanelRoot) return;

    var zmp = economy.zmp;
    var bl  = economy.bl;

    // Total civs/mils for the player
    var civTotal = 0, milTotal = 0;
    for (var k in zmp.buildings) {
      civTotal += zmp.buildings[k].civ;
      milTotal += zmp.buildings[k].mil;
    }

    var html = '';
    html += '<div style="font-weight:bold;color:#c8ffc8;margin-bottom:6px;">HIGH COMMAND</div>';
    html += '<div>Equipment: <b style="color:#88ddff;">' + Math.floor(zmp.equip) + '</b></div>';
    html += '<div>Civ factories: <b>' + civTotal + '</b> (+' + (civTotal * CFG.civEquipPerSec).toFixed(1) + ' eq/s)</div>';
    html += '<div>Mil factories: <b>' + milTotal + '</b> (+' + (milTotal * CFG.milEquipPerSec).toFixed(1) + ' eq/s)</div>';

    html += '<div style="margin-top:6px;border-top:1px solid #333;padding-top:6px;">';
    html += 'War score:<br>';
    html += '<span style="color:#7fdf7f;">ZMP: ' + zmp.score + '</span> / ';
    html += '<span style="color:#ff7070;">BL: ' + bl.score + '</span>';
    html += '<div style="font-size:9px;color:#888;">First to ' + CFG.warScoreToWin + ' wins</div>';
    html += '</div>';

    // Division count
    var units = BU().getUnits() || [];
    var zmpAlive = 0, blAlive = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].alive === false) continue;
      if (units[i].side === 'zmp') zmpAlive++;
      else if (units[i].side === 'bl') blAlive++;
    }
    html += '<div style="margin-top:6px;">Divisions: <b style="color:#7fdf7f;">' + zmpAlive + '</b> vs <b style="color:#ff7070;">' + blAlive + '</b></div>';

    html += '<div style="margin-top:8px;font-weight:bold;color:#c8ffc8;">BUILD</div>';
    html += '<button data-buy="civ"  ' + (zmp.equip < CFG.civCostEquip  ? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Civ (' + CFG.civCostEquip + ' eq)</button>';
    html += '<button data-buy="mil"  ' + (zmp.equip < CFG.milCostEquip  ? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Mil (' + CFG.milCostEquip + ' eq)</button>';
    html += '<button data-buy="fort" ' + (zmp.equip < CFG.fortCostEquip ? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Fort (' + CFG.fortCostEquip + ' eq)</button>';
    html += '<button data-buy="infra"' + (zmp.equip < CFG.infraCostEquip? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Infra (' + CFG.infraCostEquip + ' eq)</button>';

    html += '<div style="margin-top:8px;font-weight:bold;color:#c8ffc8;">DIVISIONS</div>';
    html += '<button data-build="infantry"  ' + (zmp.equip < CFG.templates.infantry.costEquip ? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Infantry (' + CFG.templates.infantry.costEquip + ' eq)</button>';
    html += '<button data-build="cavalry"   ' + (zmp.equip < CFG.templates.cavalry.costEquip ? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Cavalry (' + CFG.templates.cavalry.costEquip + ' eq)</button>';
    html += '<button data-build="artillery" ' + (zmp.equip < CFG.templates.artillery.costEquip ? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Artillery (' + CFG.templates.artillery.costEquip + ' eq)</button>';
    html += '<button data-build="mixed"     ' + (zmp.equip < CFG.templates.mixed.costEquip ? 'disabled' : '') + ' style="width:100%;margin:2px 0;padding:3px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;">Mixed (' + CFG.templates.mixed.costEquip + ' eq)</button>';

    playerPanelRoot.innerHTML = html;

    var buttons = playerPanelRoot.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].onclick = (function (el) {
        return function () {
          var buy = el.getAttribute('data-buy');
          var build = el.getAttribute('data-build');
          if (buy) onBuildClick(buy);
          else if (build) onDivisionBuildClick(build);
        };
      })(buttons[i]);
    }
  }

  function onBuildClick(kind) {
    if (kind === 'civ' || kind === 'mil') {
      var cost = kind === 'civ' ? CFG.civCostEquip : CFG.milCostEquip;
      if (economy.zmp.equip < cost) return;
      var cell = pickBuildProvince('zmp');
      if (!cell) return;
      economy.zmp.equip -= cost;
      ensureBuilding(economy.zmp.buildings, cell.x, cell.y).constructing = {
        kind: kind,
        timeLeft: kind === 'civ' ? CFG.civBuildTime : CFG.milBuildTime
      };
      return;
    }
    if (kind === 'fort' || kind === 'infra') {
      enterPlacementMode(kind);
    }
  }

  function onDivisionBuildClick(templateId) {
    var templ = CFG.templates[templateId];
    if (!templ) return;
    if (economy.zmp.equip < templ.costEquip) return;
    economy.zmp.equip -= templ.costEquip;

    var hq = BM().getCities().find(function (c) { return c.id === 'zmp_hq'; });
    if (!hq) return;
    var angle = Math.random() * Math.PI * 2;
    var r = 30 + Math.random() * 40;
    spawnDivision('zmp', templ, hq.x + Math.cos(angle) * r, hq.y + Math.sin(angle) * r);
    logMessage('[HQ] You field ' + templ.name);
  }

  // ============================================================
  // PLACEMENT MODE (fort / infra)
  // ============================================================
  function enterPlacementMode(kind) {
    placementMode = kind;
    var canvas = BM().getCanvas();
    var handler = function (e) {
      canvas.removeEventListener('click', handler);
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      if (sx > rect.width - 280) { placementMode = null; return; }
      var world = BM().screenToWorld(sx, sy);
      var grid = BM().getProvinceGrid();
      var cols = BM().CFG.PROV_COLS;
      var rows = BM().CFG.PROV_ROWS;
      var cw = BM().CFG.W / cols;
      var ch = BM().CFG.H / rows;
      var px = Math.floor(world.x / cw);
      var py = Math.floor(world.y / ch);
      if (px < 0 || py < 0 || px >= cols || py >= rows) { placementMode = null; return; }
      if (!grid[py] || !grid[py][px] || grid[py][px].owner !== 'zmp') { placementMode = null; return; }

      if (kind === 'fort') {
        if (fortGrid[py][px] >= CFG.fortMaxLevel) { placementMode = null; return; }
        if (economy.zmp.equip < CFG.fortCostEquip) { placementMode = null; return; }
        economy.zmp.equip -= CFG.fortCostEquip;
        fortGrid[py][px] += 1;
        logMessage('[HQ] Fort built at ' + px + ',' + py);
      } else if (kind === 'infra') {
        if (infraGrid[py][px] >= CFG.infraMaxLevel) { placementMode = null; return; }
        if (economy.zmp.equip < CFG.infraCostEquip) { placementMode = null; return; }
        economy.zmp.equip -= CFG.infraCostEquip;
        infraGrid[py][px] += 1;
        logMessage('[HQ] Infra upgraded at ' + px + ',' + py);
      }
      placementMode = null;
    };
    canvas.addEventListener('click', handler);
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function provinceKey(wx, wy) {
    var p = worldToProv(wx, wy);
    if (!p) return null;
    return p.x + ',' + p.y;
  }

  function worldToProv(wx, wy) {
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cw = BM().CFG.W / cols;
    var ch = BM().CFG.H / rows;
    var px = Math.floor(wx / cw);
    var py = Math.floor(wy / ch);
    if (px < 0 || py < 0 || px >= cols || py >= rows) return null;
    return { x: px, y: py };
  }

  function logMessage(msg) {
    if (BF() && BF().getLog) {
      BF().getLog().push(msg);
    }
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  function shutdown() {
    if (playerPanelRoot && playerPanelRoot.parentNode) {
      playerPanelRoot.parentNode.removeChild(playerPanelRoot);
    }
    playerPanelRoot = null;
    placementMode = null;
  }

  return {
    CFG: CFG,
    init: init,
    update: update,
    shutdown: shutdown,

    // Accessors used by other modules
    isVisibleTo: isVisibleTo,
    getInfraAt: function (x, y) {
      var p = worldToProv(x, y);
      if (!p) return 0;
      return infraGrid[p.y][p.x];
    },
    getFortAt: function (x, y) {
      var p = worldToProv(x, y);
      if (!p) return 0;
      return fortGrid[p.y][p.x];
    },
    getScore: function () { return economy; }
  };
})();