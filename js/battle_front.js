// battle_front.js — File 3 of the HOI4-style battle system
// ============================================================
//   - Territory flips as soon as ANY unit stands near a cell
//     (no "hold for 4 ticks" nonsense — that stalled the front)
//   - Combat: org damage, breaking, retreat, destruction
//   - BL Frontline AI: forms a line, pushes with superiority,
//     keeps reserves, breaks out of pockets
//   - RB Defensive AI: garrisons its cities, counter-attacks BL
//     near RB territory, snowballs with IIA volunteers over time
// Exposes: window.BattleFront
// ============================================================

window.BattleFront = (function () {
  'use strict';

  function BM() {
    var m = window.BattleMap;
    if (!m) throw new Error('[battle_front] BattleMap not loaded');
    return m;
  }
  function BU() {
    var u = window.BattleUnits;
    if (!u) throw new Error('[battle_front] BattleUnits not loaded');
    return u;
  }

    var CFG = {
    // Combat
    engageRange: 24,
    orgDamagePerSec: 12,
    hpDamageWhenBroken: 6,
    attackVsDefenceScale: 0.08,
    orgRegenPerSec: 3,
    orgRegenDelay: 3,

    // Retreat
    brokenRetreatDistance: 220,
    brokenRetreatSpeedMul: 1.3,
    brokenRecoveryOrg: 40,

    // Province capture — INSTANT
    captureRadius: 45,
    provinceUpdateInterval: 0.20,

    // Encirclement
    encircleRadius: 90,
    encircleMinCells: 5,
    encircleHpDrain: 2.0,

    // Breakout — trigger EARLY, before the pocket fully closes
    pocketEnemyThreshold: 3,      // was 6
    pocketOwnThreshold: 4,        // was 2
    pocketScanRadius: 180,        // was 140

    // Frontline AI
    aiInterval: 1.0,
    reserveFraction: 0.20,
    lineSpacing: 40,
    pushDistance: 90,
    threatRadius: 220,
    aiReorderDistance: 25,
    retreatOrg: 25,
    pushAdvantage: 1.15,

    drawCombatLines: true,
    drawBrokenMarkers: true,

    // <<< RB ADD start — RB defensive AI + RB growth config
    rbAiInterval: 2.0,
    rbDefensiveRange: 260,
    rbGarrisonPerCity: 3,
    rbCommitFraction: 0.6,
    rbThreatPreference: 1.5,
    rbGrowthInterval: 40,
    rbMaxIncrement: 32
    // <<< RB ADD end
  };

  var captureTimer = 0;
  var frontLines = [];
  var battleLog = [];
  var lastCombatTime = {};
  var aiTimer = 0;
  var rbAiTimer = 0;        // <<< RB ADD
  var rbGrowthTimer = 0;    // <<< RB ADD
  var rbGrowthCycle = 0;    // <<< RB ADD

  function init() {
    captureTimer = 0;
    frontLines = [];
    battleLog = [];
    lastCombatTime = {};
    aiTimer = 0;
    rbAiTimer = 0;          // <<< RB ADD
    rbGrowthTimer = 0;      // <<< RB ADD
    rbGrowthCycle = 0;      // <<< RB ADD
    console.log('[battle_front] initialised');
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    if (window.BattleUnits && typeof window.BattleUnits.update === 'function') {
      window.BattleUnits.update(dt);
    }

    var units = BU().getUnits();
    if (!units || units.length === 0) return;

    resolveCombat(units, dt);
    runEnemyAI(units, dt);
    runRbAI(units, dt);         // <<< RB ADD
    tickRbGrowth(units, dt);    // <<< RB ADD
    updateEncirclement(units, dt);
    tickOrgRegen(units, dt);

    captureTimer += dt;
    if (captureTimer >= CFG.provinceUpdateInterval) {
      captureTimer = 0;
      updateTerritory(units);
      rebuildFrontLines(units);
    }

    purgeDead(units);
  }

  // ============================================================
  // FRONTLINE AI
  // ============================================================
    // ============================================================
  // FRONTLINE AI — with city defense and danger assessment
  // ============================================================
  function runEnemyAI(units, dt) {
    aiTimer += dt;
    if (aiTimer < CFG.aiInterval) return;
    aiTimer = 0;

    // 1. Breakout check first — units in pockets run
    attemptBreakout(units);

    // 2. Danger assessment — units locally outnumbered retreat home
    assessDanger(units);

    // 3. City defense — keep garrisons at every BL-owned city
    defendCities(units);

    // 4. Gather all BL units that are free to receive front-line orders
    //    (garrisoning units are excluded — they stay home)
    var allBl = [];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== 'bl') continue;
      if (u.alive === false || u.broken || u.inCombat) continue;
      if (u.breakingOut) continue;
      if (u.garrisoning) continue;
      allBl.push(u);
    }
    if (allBl.length === 0) return;

    var frontCells = findFrontProvinces('bl');

    // If BL has essentially no territory yet, spread west from HQ
    if (frontCells.length < 3) {
      formInitialLine(allBl);
      return;
    }

    var sortedFront = sortFrontAsPath(frontCells);
    allBl.sort(function (a, b) { return a.x - b.x; });

    var reserveCount = Math.max(1, Math.floor(allBl.length * CFG.reserveFraction));
    var lineCount = allBl.length - reserveCount;
    var lineUnits = allBl.slice(0, lineCount);
    var reserveUnits = allBl.slice(lineCount);

    assignLineUnits(lineUnits, sortedFront);
    stageReserves(reserveUnits, sortedFront);
    tryPushLine(lineUnits, units);
  }

    // ============================================================
  // DANGER ASSESSMENT
  // ============================================================
  // Any BL unit that is locally outnumbered (enemy strength
  // more than 1.5x friendly strength nearby) retreats toward
  // the nearest friendly city. Prevents units from standing
  // still while being surrounded.
  // ============================================================
  function assessDanger(units) {
    var DANGER_RADIUS = 200;
    var OUTNUMBERED_RATIO = 1.5;

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== 'bl') continue;
      if (u.alive === false || u.broken) continue;
      if (u.breakingOut) continue;
      if (u.garrisoning) continue;   // garrisons hold their ground

      var friendlyPower = 0;
      var enemyPower = 0;

      for (var j = 0; j < units.length; j++) {
        var v = units[j];
        if (v.alive === false || v.broken) continue;
        var d = Math.hypot(v.x - u.x, v.y - u.y);
        if (d > DANGER_RADIUS) continue;

        var vt = BU().UNIT_TYPES[v.typeId];
        var power = vt ? vt.atk * (v.hp / v.hpMax) * (v.org / v.orgMax) : 10;

        if (v.side === 'bl') friendlyPower += power;
        else if (v.side === 'zmp') enemyPower += power;
      }

      // If badly outnumbered, run toward the nearest friendly city
      if (enemyPower > friendlyPower * OUTNUMBERED_RATIO && enemyPower > 20) {
        var safeCity = findNearestFriendlyCity(units, u, 'bl');
        if (safeCity) {
          // Mark as breaking out so combat doesn't freeze them
          u.breakingOut = true;
          u.targetX = safeCity.x + (Math.random() - 0.5) * 60;
          u.targetY = safeCity.y + (Math.random() - 0.5) * 60;
          u.arrived = false;
        }
      }
    }
  }

  // Find the nearest BL-owned city to a unit
  function findNearestFriendlyCity(units, u, side) {
    var cities = BM().getCities();
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      if (c.side !== side) continue;
      var d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

    // ============================================================
  // CITY DEFENSE
  // ============================================================
  // Ensures every BL-owned city has a minimum garrison, and
  // that threatened cities get reinforced from nearby units.
  // Garrison units are marked `garrisoning = true` and are
  // skipped by the front-line AI.
  // ============================================================
  var GARRISON_MIN_HQ = 5;
  var GARRISON_MIN_CITY = 2;
  var CITY_THREAT_RADIUS = 150;   // tighter threat detection
  var GARRISON_ARRIVAL = 25;   // tighter — only units actually AT the city

  function defendCities(units) {
    var cities = BM().getCities();

    // --- Pass 1: release units that are no longer needed ---
    for (var ri = 0; ri < units.length; ri++) {
      var ru = units[ri];
      if (ru.side !== 'bl') continue;
      if (!ru.garrisoning) continue;

      var closestCity = null;
      var closestDist = Infinity;
      for (var rc = 0; rc < cities.length; rc++) {
        var c = cities[rc];
        if (c.side !== 'bl') continue;
        var d = Math.hypot(ru.x - c.x, ru.y - c.y);
        if (d < closestDist) { closestDist = d; closestCity = c; }
      }

      if (!closestCity || closestDist > GARRISON_ARRIVAL * 3) {
        ru.garrisoning = false;
        continue;
      }

      // Count defenders and threats at closest city
      var defenderCount = 0;
      var threatCount = 0;
      for (var ii = 0; ii < units.length; ii++) {
        var o = units[ii];
        if (o.alive === false || o.broken) continue;
        var d2 = Math.hypot(o.x - closestCity.x, o.y - closestCity.y);
        if (d2 > GARRISON_ARRIVAL * 2) continue;
        if (o.side === 'bl') defenderCount++;
        else if (o.side === 'zmp') threatCount++;
      }

      var min = (closestCity.isHQ) ? GARRISON_MIN_HQ : GARRISON_MIN_CITY;
      if (defenderCount > min + 2 && threatCount === 0) {
        ru.garrisoning = false;
      }
    }

    // --- Pass 2: assign garrisons for every BL city ---
    for (var ci = 0; ci < cities.length; ci++) {
      var city = cities[ci];
      if (city.side !== 'bl') continue;

      var minGarrison = city.isHQ ? GARRISON_MIN_HQ : GARRISON_MIN_CITY;

      // Count defenders already near this city
      var defenders = [];
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (u.side !== 'bl') continue;
        if (u.alive === false || u.broken) continue;
        var d = Math.hypot(u.x - city.x, u.y - city.y);
        if (d < GARRISON_ARRIVAL * 2) defenders.push({ unit: u, dist: d });
      }

      // Count threats near the city
      var threatCount2 = 0;
      for (var j = 0; j < units.length; j++) {
        var v = units[j];
        if (v.side !== 'zmp') continue;
        if (v.alive === false) continue;
        var d2 = Math.hypot(v.x - city.x, v.y - city.y);
        if (d2 < CITY_THREAT_RADIUS) threatCount2++;
      }

      var threatened = threatCount2 > 0;
      var needed = threatened ? minGarrison + 2 : minGarrison;

      // If we already have enough, just lock them in position
      if (defenders.length >= needed) {
        for (var d = 0; d < defenders.length; d++) {
          var du = defenders[d].unit;
          du.garrisoning = true;
          var angle = (d / defenders.length) * Math.PI * 2;
          var radius = 40 + (d % 3) * 15;
          du.targetX = city.x + Math.cos(angle) * radius;
          du.targetY = city.y + Math.sin(angle) * radius;
        }
        continue;
      }

      // Need more defenders — find nearest free BL units
      var neededMore = needed - defenders.length;
      var candidates = [];

      for (var k = 0; k < units.length; k++) {
        var w = units[k];
        if (w.side !== 'bl') continue;
        if (w.alive === false || w.broken || w.inCombat) continue;
        if (w.breakingOut) continue;
        if (w.garrisoning) continue;

        // Don't steal from another city's garrison
        var stealing = false;
        for (var cc = 0; cc < cities.length; cc++) {
          var otherCity = cities[cc];
          if (otherCity.id === city.id) continue;
          if (otherCity.side !== 'bl') continue;
          var dToOther = Math.hypot(w.x - otherCity.x, w.y - otherCity.y);
          if (dToOther < GARRISON_ARRIVAL * 2) { stealing = true; break; }
        }
        if (stealing) continue;

        candidates.push({
          unit: w,
          dist: Math.hypot(w.x - city.x, w.y - city.y)
        });
      }

      candidates.sort(function (a, b) { return a.dist - b.dist; });

      var assignCount = Math.min(neededMore, candidates.length);
      for (var m = 0; m < assignCount; m++) {
        var chosen = candidates[m].unit;
        chosen.garrisoning = true;
        var angle2 = (m / Math.max(1, assignCount)) * Math.PI * 2;
        var radius2 = 40 + (m % 3) * 15;
        chosen.targetX = city.x + Math.cos(angle2) * radius2;
        chosen.targetY = city.y + Math.sin(angle2) * radius2;
        chosen.arrived = false;
      }
    }
  }

  // Spread BL units into a WEST-facing line from HQ
  function formInitialLine(blUnits) {
    var hq = BM().getCities().find(function (c) { return c.id === 'bl_hq'; });
    if (!hq) return;

    blUnits.sort(function (a, b) { return a.y - b.y; });

    var lineX = hq.x - 140;
    var spacing = 34;
    var originY = hq.y - ((blUnits.length - 1) * spacing) / 2;

    for (var i = 0; i < blUnits.length; i++) {
      var u = blUnits[i];
      var desiredX = lineX - (i % 2) * 30;
      var desiredY = originY + i * spacing;

      if (Math.hypot(u.targetX - desiredX, u.targetY - desiredY) > CFG.aiReorderDistance) {
        u.targetX = desiredX;
        u.targetY = desiredY;
        u.arrived = false;
      }
    }
  }

  function findFrontProvinces(side) {
    var grid = BM().getProvinceGrid();
    if (!grid) return [];
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cw = BM().CFG.W / cols;
    var ch = BM().CFG.H / rows;
    var result = [];

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        if (grid[y][x].owner !== side) continue;
        var isFront = false;
        if (x > 0 && grid[y][x - 1].owner !== side) isFront = true;
        if (x < cols - 1 && grid[y][x + 1].owner !== side) isFront = true;
        if (y > 0 && grid[y - 1][x].owner !== side) isFront = true;
        if (y < rows - 1 && grid[y + 1][x].owner !== side) isFront = true;
        if (isFront) {
          result.push({
            x: x * cw + cw / 2,
            y: y * ch + ch / 2,
            cellX: x, cellY: y
          });
        }
      }
    }
    return result;
  }

  // Simple west-to-east sort — stable and directional
  function sortFrontAsPath(cells) {
    var sorted = cells.slice();
    sorted.sort(function (a, b) {
      // Sort by X first (west → east), then Y (north → south)
      if (Math.abs(a.x - b.x) > 20) return a.x - b.x;
      return a.y - b.y;
    });
    return sorted;
  }

    function assignLineUnits(lineUnits, frontPath) {
    if (frontPath.length === 0 || lineUnits.length === 0) return;

    for (var i = 0; i < lineUnits.length; i++) {
      var u = lineUnits[i];
      if (u.arrived) continue;
      if (u.garrisoning) continue;   // never pull a garrison to the line

      var t = (i + 0.5) / lineUnits.length;
      var frontIdx = Math.floor(t * frontPath.length);
      if (frontIdx >= frontPath.length) frontIdx = frontPath.length - 1;
      if (frontIdx < 0) frontIdx = 0;

      var cell = frontPath[frontIdx];
      var desiredX = cell.x;
      var desiredY = cell.y;

      if (Math.hypot(u.targetX - desiredX, u.targetY - desiredY) > CFG.aiReorderDistance) {
        u.targetX = desiredX;
        u.targetY = desiredY;
        u.arrived = false;
      }
    }
  }

    function stageReserves(reserveUnits, frontPath) {
    if (frontPath.length === 0 || reserveUnits.length === 0) return;

    var cx = 0, cy = 0;
    for (var i = 0; i < frontPath.length; i++) {
      cx += frontPath[i].x;
      cy += frontPath[i].y;
    }
    cx /= frontPath.length;
    cy /= frontPath.length;

    var hq = BM().getCities().find(function (c) { return c.id === 'bl_hq'; });
    var backX = 1, backY = 0;
    if (hq) {
      var ddx = hq.x - cx, ddy = hq.y - cy;
      var dlen = Math.hypot(ddx, ddy) || 1;
      backX = ddx / dlen;
      backY = ddy / dlen;
    }
    var perpX = -backY, perpY = backX;

    for (var r = 0; r < reserveUnits.length; r++) {
      var u = reserveUnits[r];
      if (u.arrived) continue;
      if (u.garrisoning) continue;   // never move a garrison

      var row = Math.floor(r / 4);
      var col = r % 4;
      var lateral = (col - 1.5) * CFG.lineSpacing;
      var depth = 70 + row * 45;

      var desiredX = cx + perpX * lateral + backX * depth;
      var desiredY = cy + perpY * lateral + backY * depth;

      if (Math.hypot(u.targetX - desiredX, u.targetY - desiredY) > CFG.aiReorderDistance) {
        u.targetX = desiredX;
        u.targetY = desiredY;
        u.arrived = false;
      }
    }
  }

    function tryPushLine(lineUnits, allUnits) {
    for (var i = 0; i < lineUnits.length; i++) {
      var u = lineUnits[i];
      if (u.garrisoning) continue;   // garrisons don't push

      var myStrength = calculateLocalStrength(allUnits, u, 'bl', CFG.threatRadius);
      var theirStrength = calculateLocalStrength(allUnits, u, 'zmp', CFG.threatRadius);

      if (myStrength > theirStrength * CFG.pushAdvantage) {
        var dir = findNearestEnemyDir(allUnits, u);
        if (dir) {
          u.targetX = u.x + dir.x * CFG.pushDistance;
          u.targetY = u.y + dir.y * CFG.pushDistance;
          u.arrived = false;
        }
      }
    }
  }

  function findNearestEnemyDir(units, u) {
    var best = null, bestDist = Infinity;
    for (var i = 0; i < units.length; i++) {
      var v = units[i];
      if (v.side === u.side || v.alive === false) continue;
      var d = Math.hypot(v.x - u.x, v.y - u.y);
      if (d < bestDist) { bestDist = d; best = v; }
    }
    if (!best) return null;
    var dx = best.x - u.x, dy = best.y - u.y;
    var len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  function calculateLocalStrength(units, nearUnit, side, radius) {
    var total = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== side) continue;
      if (u.alive === false || u.broken) continue;
      var d = Math.hypot(u.x - nearUnit.x, u.y - nearUnit.y);
      if (d > radius) continue;
      var t = BU().UNIT_TYPES[u.typeId];
      var atk = t ? t.atk : 10;
      total += atk * (u.hp / u.hpMax) * (u.org / u.orgMax);
    }
    return total;
  }

  // <<< RB ADD start — RB defensive AI + city garrisons + growth tick
  // ============================================================
  // RB+RED AI — defensive, prioritizes BL
  // ============================================================
  // RB holds the valley. It doesn't charge. Priorities:
  //   1. Garrison every RB city
  //   2. Counter-attack BL units near RB territory
  //   3. Only attack ZMP if ZMP pushes very close
  // ============================================================
  function runRbAI(units, dt) {
    rbAiTimer += dt;
    if (rbAiTimer < CFG.rbAiInterval) return;
    rbAiTimer = 0;

    rbDefendCities(units);

    var cities = BM().getCities();
    var rbCities = cities.filter(function (c) { return c.side === 'rb'; });
    if (rbCities.length === 0) return;

    var rbFree = [];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== 'rb') continue;
      if (u.alive === false || u.broken || u.inCombat) continue;
      if (u.breakingOut) continue;
      if (u.garrisoning) continue;
      rbFree.push(u);
    }
    if (rbFree.length === 0) return;

    var blThreat = null, blThreatDist = Infinity;
    var zmpThreat = null, zmpThreatDist = Infinity;

    for (var ci = 0; ci < rbCities.length; ci++) {
      var rc = rbCities[ci];
      for (var j = 0; j < units.length; j++) {
        var v = units[j];
        if (v.alive === false) continue;
        if (v.side === 'rb') continue;
        var d = Math.hypot(v.x - rc.x, v.y - rc.y);
        if (d > CFG.rbDefensiveRange) continue;
        if (v.side === 'bl' && d < blThreatDist) {
          blThreatDist = d; blThreat = v;
        } else if (v.side === 'zmp' && d < zmpThreatDist) {
          zmpThreatDist = d; zmpThreat = v;
        }
      }
    }

    var blWeighted = blThreatDist / CFG.rbThreatPreference;
    var zmpWeighted = zmpThreatDist;

    var target = null;
    if (blThreat && (!zmpThreat || blWeighted < zmpWeighted)) target = blThreat;
    else if (zmpThreat) target = zmpThreat;
    if (!target) return;

    rbFree.sort(function (a, b) {
      return Math.hypot(a.x - target.x, a.y - target.y) -
             Math.hypot(b.x - target.x, b.y - target.y);
    });

    var commitCount = Math.max(1, Math.floor(rbFree.length * CFG.rbCommitFraction));

    for (var t = 0; t < commitCount && t < rbFree.length; t++) {
      var ru = rbFree[t];
      var offsetAngle = (t / Math.max(1, commitCount)) * Math.PI * 2;
      var desiredX = target.x + Math.cos(offsetAngle) * 22;
      var desiredY = target.y + Math.sin(offsetAngle) * 22;
      if (Math.hypot(ru.targetX - desiredX, ru.targetY - desiredY) > CFG.aiReorderDistance) {
        ru.targetX = desiredX;
        ru.targetY = desiredY;
        ru.arrived = false;
      }
    }
  }

  // ============================================================
  // RB CITY GARRISONS
  // ============================================================
  function rbDefendCities(units) {
    var cities = BM().getCities();
    var rbCities = cities.filter(function (c) { return c.side === 'rb'; });
    if (rbCities.length === 0) return;

    var used = {};

    for (var ci = 0; ci < rbCities.length; ci++) {
      var city = rbCities[ci];

      var defenders = [];
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (u.side !== 'rb') continue;
        if (u.alive === false || u.broken) continue;
        var d = Math.hypot(u.x - city.x, u.y - city.y);
        if (d < 80) {
          defenders.push(u);
          used[u.id] = true;
        }
      }

      var threats = 0;
      for (var t = 0; t < units.length; t++) {
        var v = units[t];
        if (v.alive === false) continue;
        if (v.side === 'rb') continue;
        var dt2 = Math.hypot(v.x - city.x, v.y - city.y);
        if (dt2 < CFG.rbDefensiveRange * 0.6) threats++;
      }

      // Release over-strength garrison when safe
      if (defenders.length >= CFG.rbGarrisonPerCity && threats === 0) {
        for (var r = CFG.rbGarrisonPerCity; r < defenders.length; r++) {
          defenders[r].garrisoning = false;
        }
      }

      if (defenders.length >= CFG.rbGarrisonPerCity) continue;

      var candidates = [];
      for (var k = 0; k < units.length; k++) {
        var w = units[k];
        if (w.side !== 'rb') continue;
        if (w.alive === false || w.broken || w.inCombat) continue;
        if (w.breakingOut || w.garrisoning) continue;
        if (used[w.id]) continue;
        candidates.push({
          unit: w,
          dist: Math.hypot(w.x - city.x, w.y - city.y)
        });
      }
      candidates.sort(function (a, b) { return a.dist - b.dist; });

      var needed = CFG.rbGarrisonPerCity - defenders.length;
      for (var m = 0; m < needed && m < candidates.length; m++) {
        var chosen = candidates[m].unit;
        used[chosen.id] = true;
        chosen.garrisoning = true;
        var angle = (m / Math.max(1, needed)) * Math.PI * 2;
        var radius = 40;
        chosen.targetX = city.x + Math.cos(angle) * radius;
        chosen.targetY = city.y + Math.sin(angle) * radius;
        chosen.arrived = false;
      }
    }
  }

  // ============================================================
  // RB+RED GROWTH — IIA volunteers arrive over time
  // ============================================================
  function tickRbGrowth(units, dt) {
    rbGrowthTimer += dt;
    if (rbGrowthTimer < CFG.rbGrowthInterval) return;
    rbGrowthTimer = 0;
    rbGrowthCycle++;

    var cities = BM().getCities();
    var rbCities = cities.filter(function (c) { return c.side === 'rb'; });
    if (rbCities.length === 0) return;

    var increment = Math.min(CFG.rbMaxIncrement, Math.pow(2, rbGrowthCycle - 1));
    var spawnCity = rbCities[Math.floor(Math.random() * rbCities.length)];
    var allUnits = BU().getUnits();

    for (var i = 0; i < increment; i++) {
      var type;
      // <<< All growth waves are IIA volunteers (BLUE), never red.
      //     Wave 1-2: basic volunteers + marines.
      //     Wave 3+ : full blue mix including cavalry and marksmen.
      if (rbGrowthCycle <= 2) {
        type = ['iia_volunteer', 'iia_volunteer', 'iia_marine'][i % 3];
      } else if (rbGrowthCycle <= 4) {
        type = ['iia_volunteer', 'iia_marine', 'iia_rider'][i % 3];
      } else {
        type = ['iia_volunteer', 'iia_marine', 'iia_rider', 'iia_marksman'][i % 4];
      }

      var angle = Math.random() * Math.PI * 2;
      var r = 40 + Math.random() * 40;
      var u = BU().makeUnit(type, 'rb',
        spawnCity.x + Math.cos(angle) * r,
        spawnCity.y + Math.sin(angle) * r);
      if (u) allUnits.push(u);
    }

    logEvent(null, 'RB+RED REINFORCEMENTS: +' + increment +
      ' (cycle ' + rbGrowthCycle + ') at ' + spawnCity.name);
  }
  // <<< RB ADD end

  // ============================================================
  // ENCIRCLEMENT
  // ============================================================
  function updateEncirclement(units, dt) {
    var grid = BM().getProvinceGrid();
    if (!grid) return;
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cellW = BM().CFG.W / cols;
    var cellH = BM().CFG.H / rows;

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.alive === false) continue;

      var enemyCells = 0, ownCells = 0;
      var radiusCells = Math.ceil(CFG.encircleRadius / Math.min(cellW, cellH));
      var ux = Math.floor(u.x / cellW);
      var uy = Math.floor(u.y / cellH);

      for (var dy = -radiusCells; dy <= radiusCells; dy++) {
        for (var dx = -radiusCells; dx <= radiusCells; dx++) {
          var cx = ux + dx, cy = uy + dy;
          if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
          var wcx = cx * cellW + cellW / 2;
          var wcy = cy * cellH + cellH / 2;
          if (Math.hypot(wcx - u.x, wcy - u.y) > CFG.encircleRadius) continue;
          var owner = grid[cy][cx].owner;
          if (owner === u.side) ownCells++;
          else if (owner !== 'neutral') enemyCells++;
        }
      }

      var encircled = (enemyCells >= CFG.encircleMinCells) && (ownCells <= 1);
      u.encircled = encircled;

      if (encircled) {
        u.hp -= CFG.encircleHpDrain * dt;
        if (u.hp <= 0 && u.alive !== false) {
          u.alive = false; u.hp = 0;
          logEvent(u, 'DESTROYED (encircled)');
        }
      }
    }
  }

  // ============================================================
  // BREAKOUT
  // ============================================================
  function attemptBreakout(units) {
    var grid = BM().getProvinceGrid();
    if (!grid) return;
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cw = BM().CFG.W / cols;
    var ch = BM().CFG.H / rows;

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== 'bl') continue;
      if (u.alive === false || u.broken || u.inCombat) continue;

      var enemyCells = 0, ownCells = 0;
      var radiusCells = Math.ceil(CFG.pocketScanRadius / Math.min(cw, ch));
      var ux = Math.floor(u.x / cw);
      var uy = Math.floor(u.y / ch);

      for (var dy = -radiusCells; dy <= radiusCells; dy++) {
        for (var dx = -radiusCells; dx <= radiusCells; dx++) {
          var cx = ux + dx, cy = uy + dy;
          if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
          var owner = grid[cy][cx].owner;
          if (owner === 'bl') ownCells++;
          else if (owner === 'zmp') enemyCells++;
        }
      }

      var inPocket = (enemyCells >= CFG.pocketEnemyThreshold) &&
                     (ownCells <= CFG.pocketOwnThreshold);

      if (inPocket) {
        var escape = findNearestFriendlyProvince(grid, cols, rows, cw, ch, u.x, u.y, 'bl');
        if (escape) {
          u.targetX = escape.x;
          u.targetY = escape.y;
          u.arrived = false;
          u.breakingOut = true;
        } else {
          var hq = BM().getCities().find(function (c) { return c.id === 'bl_hq'; });
          if (hq) {
            u.targetX = hq.x; u.targetY = hq.y;
            u.arrived = false;
            u.breakingOut = true;
          }
        }
      } else {
        u.breakingOut = false;
      }
    }
  }

  function findNearestFriendlyProvince(grid, cols, rows, cw, ch, wx, wy, side) {
    var best = null, bestDist = Infinity;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        if (grid[y][x].owner !== side) continue;
        var cx = x * cw + cw / 2;
        var cy = y * ch + ch / 2;
        var d = Math.hypot(cx - wx, cy - wy);
        if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
      }
    }
    return best;
  }

  // ============================================================
  // COMBAT
  // ============================================================
    function resolveCombat(units, dt) {
    var now = performance.now();

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.alive === false) continue;

      var nearest = null, nearestDist = CFG.engageRange;
      for (var j = 0; j < units.length; j++) {
        var v = units[j];
        if (v === u || v.side === u.side || v.alive === false) continue;
        var d = Math.hypot(v.x - u.x, v.y - u.y);
        if (d < nearestDist) { nearestDist = d; nearest = v; }
      }

      if (nearest) {
        u.inCombat = true;
        u.combatTarget = nearest.id;
        lastCombatTime[u.id] = now;
        lastCombatTime[nearest.id] = now;

        // Only freeze if NOT breaking out, encircled, or garrisoning.
        // Retreating and garrisoned units keep moving.
        if (!u.breakingOut && !u.encircled && !u.garrisoning) {
          u.targetX = u.x;
          u.targetY = u.y;
        }

        var myType = BU().UNIT_TYPES[u.typeId];
        var theirType = BU().UNIT_TYPES[nearest.typeId];
        if (myType && theirType) {
          var myOutput = myType.atk * CFG.attackVsDefenceScale * dt * (u.org / u.orgMax);
          var theirOutput = theirType.atk * CFG.attackVsDefenceScale * dt * (nearest.org / nearest.orgMax);

          var eMe = u.encircled ? 1.4 : 1.0;
          var eThem = nearest.encircled ? 1.4 : 1.0;

          var fortMe = 0, fortThem = 0;
          if (window.BattleEconomy && window.BattleEconomy.getFortAt) {
            fortMe = window.BattleEconomy.getFortAt(u.x, u.y);
            fortThem = window.BattleEconomy.getFortAt(nearest.x, nearest.y);
          }
          var fmMe = 1 - Math.min(0.6, fortMe * 0.15);
          var fmThem = 1 - Math.min(0.6, fortThem * 0.15);

          var dmgToMe = theirOutput * (10 / (10 + myType.def)) * fmMe * eMe;
          var dmgToThem = myOutput * (10 / (10 + theirType.def)) * fmThem * eThem;

          u.org = Math.max(0, u.org - dmgToMe * CFG.orgDamagePerSec);
          nearest.org = Math.max(0, nearest.org - dmgToThem * CFG.orgDamagePerSec);

          if (u.org <= 0) {
            u.hp -= CFG.hpDamageWhenBroken * dt;
            if (!u.broken) { u.broken = true; logEvent(u, 'BROKEN'); }
          }
          if (nearest.org <= 0) {
            nearest.hp -= CFG.hpDamageWhenBroken * dt;
            if (!nearest.broken) { nearest.broken = true; logEvent(nearest, 'BROKEN'); }
          }
          if (u.hp <= 0 && u.alive !== false) { u.alive = false; u.hp = 0; logEvent(u, 'DESTROYED'); }
          if (nearest.hp <= 0 && nearest.alive !== false) { nearest.alive = false; nearest.hp = 0; logEvent(nearest, 'DESTROYED'); }
        }

        if (u.broken) assignRetreatTarget(u);
        if (nearest.broken) assignRetreatTarget(nearest);
      } else {
        u.inCombat = false;
        u.combatTarget = null;
        if (u.broken && u.org >= CFG.brokenRecoveryOrg) { u.broken = false; logEvent(u, 'REFORMED'); }
        if (u.broken) assignRetreatTarget(u);
      }
    }
  }

  function assignRetreatTarget(u) {
    var units = BU().getUnits();
    var nearestEnemy = null, nearestDist = Infinity;
    for (var i = 0; i < units.length; i++) {
      var v = units[i];
      if (v.side === u.side || v.alive === false) continue;
      var d = Math.hypot(v.x - u.x, v.y - u.y);
      if (d < nearestDist) { nearestDist = d; nearestEnemy = v; }
    }

    var dirX, dirY;
    if (nearestEnemy) {
      dirX = u.x - nearestEnemy.x;
      dirY = u.y - nearestEnemy.y;
    } else {
      var ownHQ = BM().getCities().find(function (c) {
        return c.id === (u.side === 'zmp' ? 'zmp_hq' : 'bl_hq');
      });
      if (ownHQ) { dirX = ownHQ.x - u.x; dirY = ownHQ.y - u.y; }
      else { dirX = 1; dirY = 0; }
    }

    var len = Math.hypot(dirX, dirY) || 1;
    dirX /= len; dirY /= len;

    var needNew = !u.retreatTarget ||
      Math.hypot(u.retreatTarget.x - u.x, u.retreatTarget.y - u.y) < 30;

    if (needNew) {
      var tx = u.x + dirX * CFG.brokenRetreatDistance;
      var ty = u.y + dirY * CFG.brokenRetreatDistance;
      tx = Math.max(20, Math.min(BM().CFG.W - 20, tx));
      ty = Math.max(20, Math.min(BM().CFG.H - 20, ty));
      u.retreatTarget = { x: tx, y: ty };
      u.targetX = tx; u.targetY = ty;
      u.speedBoost = CFG.brokenRetreatSpeedMul;
    }
  }

  function tickOrgRegen(units, dt) {
    var now = performance.now();
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.inCombat || u.broken) continue;
      var last = lastCombatTime[u.id] || 0;
      if ((now - last) / 1000 < CFG.orgRegenDelay) continue;
      var regenMul = u.encircled ? 0.5 : 1.0;
      u.org = Math.min(u.orgMax, u.org + CFG.orgRegenPerSec * regenMul * dt);
    }
  }

  function purgeDead(units) {
    for (var i = units.length - 1; i >= 0; i--) {
      if (units[i].alive === false) units.splice(i, 1);
    }
  }

  function logEvent(unit, what) {
    // <<< RB ADD: null-safe guard so tickRbGrowth can log without a unit object
    if (!unit) {
      var line0 = '[' + Math.round(performance.now() / 1000) + 's] ' + what;
      battleLog.push(line0);
      if (battleLog.length > 40) battleLog.shift();
      return;
    }
    // <<< RB ADD end
    var t = BU().UNIT_TYPES[unit.typeId];
    var line = '[' + Math.round(performance.now() / 1000) + 's] ' +
      (t ? t.name : '?') + ' (' + unit.side.toUpperCase() + ') — ' + what;
    battleLog.push(line);
    if (battleLog.length > 40) battleLog.shift();
  }

  // ============================================================
  // TERRITORY — INSTANT, no hold requirement
  // ============================================================
  function updateTerritory(units) {
    var grid = BM().getProvinceGrid();
    if (!grid) return;
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cellW = BM().CFG.W / cols;
    var cellH = BM().CFG.H / rows;

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var cx = x * cellW + cellW / 2;
        var cy = y * cellH + cellH / 2;

        var closestSide = null;
        var closestDist = CFG.captureRadius;

        for (var i = 0; i < units.length; i++) {
          var u = units[i];
          if (u.alive === false || u.broken) continue;
          var d = Math.hypot(u.x - cx, u.y - cy);
          if (d < closestDist) {
            closestDist = d;
            closestSide = u.side;
          }
        }

        if (closestSide) {
          grid[y][x].owner = closestSide;
        }
      }
    }
  }

  // ============================================================
  // FRONT LINES
  // ============================================================
  function rebuildFrontLines() {
    var grid = BM().getProvinceGrid();
    if (!grid) return;
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cellW = BM().CFG.W / cols;
    var cellH = BM().CFG.H / rows;

    var lines = [];

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var owner = grid[y][x].owner;
        if (owner !== 'zmp' && owner !== 'bl') continue;

        if (x + 1 < cols) {
          var r = grid[y][x + 1].owner;
          if ((owner === 'zmp' && r === 'bl') || (owner === 'bl' && r === 'zmp')) {
            lines.push({
              x1: (x + 1) * cellW, y1: y * cellH,
              x2: (x + 1) * cellW, y2: (y + 1) * cellH
            });
          }
        }
        if (y + 1 < rows) {
          var b = grid[y + 1][x].owner;
          if ((owner === 'zmp' && b === 'bl') || (owner === 'bl' && b === 'zmp')) {
            lines.push({
              x1: x * cellW, y1: (y + 1) * cellH,
              x2: (x + 1) * cellW, y2: (y + 1) * cellH
            });
          }
        }
      }
    }

    frontLines = lines;
  }

  // ============================================================
  // RENDER
  // ============================================================
  function draw() {
    var ctx = BM().getCtx();
    var canvas = BM().getCanvas();
    var camera = BM().getCamera();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (CFG.drawCombatLines && frontLines.length > 0) {
      ctx.save();
      ctx.translate(canvas.width / (2 * dpr), canvas.height / (2 * dpr));
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      var pulse = 0.6 + 0.4 * Math.sin(performance.now() / 400);
      ctx.strokeStyle = 'rgba(255, 60, 60, ' + (0.5 + pulse * 0.4) + ')';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < frontLines.length; i++) {
        var s = frontLines[i];
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 200, 100, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var j = 0; j < frontLines.length; j++) {
        var s2 = frontLines[j];
        ctx.moveTo(s2.x1, s2.y1);
        ctx.lineTo(s2.x2, s2.y2);
      }
      ctx.stroke();
      ctx.restore();
    }

    var units = BU().getUnits();
    if (units.length > 0) {
      ctx.save();
      ctx.translate(canvas.width / (2 * dpr), canvas.height / (2 * dpr));
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      for (var k = 0; k < units.length; k++) {
        var u = units[k];
        if (u.alive === false) continue;

        if (CFG.drawBrokenMarkers && u.broken) {
          var px = u.x, py = u.y - 26;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px, py); ctx.lineTo(px, py - 10);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.moveTo(px, py - 10);
          ctx.lineTo(px + 8, py - 8);
          ctx.lineTo(px, py - 6);
          ctx.closePath();
          ctx.fill();
        }

        if (u.inCombat) {
          var px2 = u.x + 14, py2 = u.y - 8;
          ctx.strokeStyle = '#ff3030';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px2 - 4, py2 - 4); ctx.lineTo(px2 + 4, py2 + 4);
          ctx.moveTo(px2 + 4, py2 - 4); ctx.lineTo(px2 - 4, py2 + 4);
          ctx.stroke();
        }

        if (u.encircled) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 40, 40, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(u.x, u.y - 8, 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (u.breakingOut) {
          ctx.fillStyle = 'rgba(90, 150, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(u.x + 14, u.y - 26, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function getFrontLines() { return frontLines; }
  function getLog() { return battleLog; }

  return {
    CFG: CFG,
    init: init,
    update: update,
    draw: draw,
    getFrontLines: getFrontLines,
    getLog: getLog,
    runRbAI: runRbAI,           // <<< RB ADD
    tickRbGrowth: tickRbGrowth  // <<< RB ADD
  };
})();