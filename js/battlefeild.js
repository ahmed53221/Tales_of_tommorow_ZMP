// battle_units.js — File 2 of the HOI4-style battle system
// ============================================================
// Adds HOI4-style division counters on top of the map from File 1:
//   - Division sprites (2D rectangles with NATO symbol + strength bar)
//   - Spawning for ZMP, BL, and RB in their correct starting zones
//   - Mouse selection (click, shift-click, box-select)
//   - Right-click movement orders
//   - Continuous movement in world space with terrain speed modifiers
//   - Pathing that avoids mountains (high terrain) and prefers open ground
//   - Soft push-apart so units don't pile on top of each other
//
// Depends on: battle_map.js (window.BattleMap)
// Exposes:   window.BattleUnits
// ============================================================

window.BattleUnits = (function () {
  'use strict';

  var BM = window.BattleMap;

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    // Unit sizes
    counterW: 26,
    counterH: 16,

    // Movement
    baseSpeed: 55,           // world units per second on flat plains
    mountainPenalty: 0.25,   // speed multiplier in mountains (h > 0.55)
    hillsPenalty: 0.55,      // speed multiplier in hills (h > 0.35)
    riverPenalty: 0.45,      // speed multiplier when crossing water
    staminaDrainPerSec: 4,
    staminaRegenPerSec: 8,
    lowStaminaThreshold: 30,
    exhaustedSpeedMul: 0.6,

    // Combat readiness (used in File 3, but prepped here)
    orgMax: 100,
    hpMax: 100,

    // Soft push-apart between friendly units
    pushRadius: 18,
    pushStrength: 25,

    // Pathing: how far to look ahead
    waypointArrivalRadius: 8
  };

  // ============================================================
  // UNIT TYPE CATALOG
  // ============================================================
  // Each division type has:
  //   - a symbol drawn inside the counter
  //   - a color
  //   - combat stats (used in File 3)
  // ============================================================
    // ============================================================
  // UNIT TYPE CATALOG
  // ============================================================
  // `symbol` here is the ROMAN NUMERAL SERIES for that type:
  //   infantry → 'I' means the sequence I, II, III, IV...
  //   cavalry  → 'X' is just a marker; cavalry uses I, II, III too
  //   artillery→ 'O' is just a marker; artillery uses I, II, III too
  // The actual symbol displayed is computed per-unit at spawn time
  // from how many of that type that side already has. See
  // computeSymbol() below.
  // ============================================================
  var UNIT_TYPES = {
    // --- ZMP (player) ---
    dzehurjaca: { name: 'Dzehurjaca',  series: 'inf', color: '#2a7a2a', speed: 1.20, atk: 14, def: 10, hp: 130, isCavalry: true  },
    dragoon:    { name: 'Dragoon',     series: 'inf', color: '#3a8f3a', speed: 1.10, atk: 11, def: 11, hp: 110, isCavalry: true  },
    line:       { name: 'Line Inf.',   series: 'inf', color: '#4aa04a', speed: 1.00, atk: 8,  def: 12, hp: 100 },
    musket:     { name: 'Musket Line', series: 'inf', color: '#5ab05a', speed: 0.95, atk: 10, def: 10, hp: 90  },
    sniper:     { name: 'Snipers',     series: 'inf', color: '#3a6a3a', speed: 0.90, atk: 14, def: 6,  hp: 70  },
    artillery:  { name: 'Artillery',   series: 'art', color: '#2a4a2a', speed: 0.55, atk: 22, def: 4,  hp: 60  },

    // --- BLACK LEAGUE (enemy) ---
    black_rider:  { name: 'Black Rider',  series: 'inf', color: '#1a1a1a', speed: 1.15, atk: 14, def: 10, hp: 90,  isCavalry: true },
    bl_line:      { name: 'BL Infantry',  series: 'inf', color: '#262626', speed: 1.00, atk: 8,  def: 10, hp: 100 },
    bl_musket:    { name: 'BL Muskets',   series: 'inf', color: '#333333', speed: 0.95, atk: 10, def: 9,  hp: 90  },
    bl_sniper:    { name: 'BL Snipers',   series: 'inf', color: '#0d0d0d', speed: 0.90, atk: 14, def: 6,  hp: 70  },
    bl_artillery: { name: 'BL Artillery', series: 'art', color: '#1f1f1f', speed: 0.55, atk: 22, def: 4,  hp: 60  },   // <<< RB ADD: trailing comma (was no comma)
    // <<< RB ADD start — RED (RB) red militia + IIA blue volunteers
    rb_line:      { name: 'Red Militia',   series: 'inf', color: '#a81a1a', speed: 1.00, atk: 8,  def: 10, hp: 100 },
    rb_musket:    { name: 'Red Muskets',   series: 'inf', color: '#8a1010', speed: 0.95, atk: 10, def: 9,  hp: 90  },
    rb_rider:     { name: 'Red Cavalry',   series: 'inf', color: '#6a0808', speed: 1.15, atk: 13, def: 9,  hp: 110, isCavalry: true },
    rb_sniper:    { name: 'Red Snipers',   series: 'inf', color: '#4a0505', speed: 0.90, atk: 14, def: 6,  hp: 70  },
    rb_artillery: { name: 'Red Artillery', series: 'art', color: '#3a0202', speed: 0.55, atk: 22, def: 4,  hp: 60  },
        // --- IIA volunteers (blue, arrive over time to help RB) ---
    iia_volunteer: { name: 'IIA Volunteer', series: 'inf', color: '#3a5a9a', speed: 1.05, atk: 12, def: 12, hp: 110 },
    iia_marine:    { name: 'IIA Marine',    series: 'inf', color: '#2a4a8a', speed: 1.00, atk: 15, def: 11, hp: 120 },
    iia_rider:     { name: 'IIA Cavalry',   series: 'inf', color: '#4a6aaa', speed: 1.15, atk: 14, def: 10, hp: 115, isCavalry: true },
    iia_marksman:  { name: 'IIA Marksman',  series: 'inf', color: '#203a70', speed: 0.92, atk: 16, def: 7,  hp: 80  }
    // <<< RB ADD end
  };

  // ============================================================
  // ROMAN NUMERAL SYMBOL ASSIGNMENT
  // ============================================================
  // Each unit gets a symbol like "I", "II", "III", "IV", ..., "IX",
  // "X", "XI", ... up to some reasonable ceiling. Different SERIES
  // (infantry vs artillery vs cavalry) run their own counter, so
  // the third artillery is "III" even if there are already fifteen
  // infantry. The counter is PER SIDE, so ZMP infantry III and BL
  // infantry III both exist.
  //
  // Units removed from the roster (killed) leave a gap. That's fine,
  // it happens in real armies too.
  // ============================================================
  var ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X',
               'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX',
               'XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX'];

  var rosterCounters = {
    zmp: { inf: 0, cav: 0, art: 0 },
    bl:  { inf: 0, cav: 0, art: 0 },
    rb:  { inf: 0, cav: 0, art: 0 }   // <<< RB ADD
  };

  function nextSymbol(side, series) {
    var s = rosterCounters[side] || (rosterCounters[side] = { inf: 0, cav: 0, art: 0 });
    var seriesKey = series === 'cav' ? 'cav' : (series === 'art' ? 'art' : 'inf');
    s[seriesKey] = (s[seriesKey] || 0) + 1;
    var n = s[seriesKey];
    return n <= ROMAN.length ? ROMAN[n - 1] : ('#' + n);
  }

  function resetRoster() {
    rosterCounters.zmp = { inf: 0, cav: 0, art: 0 };
    rosterCounters.bl  = { inf: 0, cav: 0, art: 0 };
    rosterCounters.rb  = { inf: 0, cav: 0, art: 0 };   // <<< RB ADD
  }

  // ============================================================
  // STATE
  // ============================================================
  var units = [];
  var nextId = 1;

  var selection = {
    selectedIds: [],         // array of unit ids
    dragBox: null            // { x0, y0, x1, y1 } in screen coords, or null
  };

  var input = {
    isLeftDragging: false,
    leftDragStart: null,     // { x, y } in screen coords
    mouseWorld: { x: 0, y: 0 },
    mouseScreen: { x: 0, y: 0 }
  };

  var hooks = {
    onSelectionChange: null,
    onOrder: null
  };

  // ============================================================
  // UNIT FACTORY
  // ============================================================
    function makeUnit(typeId, side, x, y) {
    var t = UNIT_TYPES[typeId];
    if (!t) {
      console.warn('[battle_units] unknown type', typeId);
      return null;
    }
    // Determine series: cavalry uses cav, artillery uses art, else inf
    var series = t.isCavalry ? 'cav' : (t.series === 'art' ? 'art' : 'inf');
    var symbol = nextSymbol(side, series);

    return {
      id: 'u' + (nextId++),
      typeId: typeId,
      side: side,
      symbol: symbol,               // ← NEW: the assigned numeral
      series: series,               // ← NEW: which counter it belongs to
      x: x, y: y,
      targetX: x, targetY: y,
      facing: side === 'zmp' ? -Math.PI / 2 : (side === 'bl' ? Math.PI / 2 : Math.PI),   // <<< RB ADD: rb faces west (Math.PI)
      speed: t.speed,
      hp: t.hp, hpMax: t.hp,
      org: CFG.orgMax, orgMax: CFG.orgMax,
      stamina: 100,
      moving: false, arrived: true,
      inCombat: false, combatTarget: null,
      pushX: 0, pushY: 0
    };
  }

  // ============================================================
  // SPAWN ARMIES
  // ============================================================
  function spawnZmpArmy(playerStrength) {
    // ZMP starts in the west: HQ area + Kalajevo forward base + Danica.
    // playerStrength is a rough measure (from paramilitary calc);
    // scale the number of divisions accordingly.

    var power = Math.max(40, playerStrength);
    var base = Math.round(power / 8);

    // 1. Home guard around ZMP HQ (west)
    var hq = BM.getCities().find(function (c) { return c.id === 'zmp_hq'; });
    for (var i = 0; i < base; i++) {
      var type;
      if (i < 2) type = 'dzehurjaca';
      else if (i < 4) type = 'dragoon';
      else if (i < 8) type = 'line';
      else if (i < 10) type = 'musket';
      else if (i < 11) type = 'sniper';
      else type = 'line';
      var angle = (i / base) * Math.PI * 2;
      var r = 30 + (i % 3) * 18;
      var u = makeUnit(type, 'zmp', hq.x + Math.cos(angle) * r, hq.y + Math.sin(angle) * r);
      if (u) units.push(u);
    }



    // 3. Danica garrison (central-east)
    var danica = BM.getCities().find(function (c) { return c.id === 'danica'; });
    for (var i = 0; i < Math.max(2, Math.round(base * 0.3)); i++) {
      var type = i === 0 ? 'dragoon' : 'line';
      var angle = (i / 4) * Math.PI * 2;
      var r = 24 + (i % 2) * 10;
      var u = makeUnit(type, 'zmp', danica.x + Math.cos(angle) * r, danica.y + Math.sin(angle) * r);
      if (u) units.push(u);
    }
  }

    function spawnBlArmy(enemyStrength) {
    // BL starts in the east with only BL HQ. Perkia is neutral.
    // All 25 divisions spawn in a WEST-facing wedge from BL HQ.

    var hq = BM.getCities().find(function (c) { return c.id === 'bl_hq'; });

    var cols = 6;
    var spacing = 32;
    var originX = hq.x - 180;
    var originY = hq.y - ((cols - 1) * spacing) / 2;

    for (var i = 0; i < 25; i++) {
      var type;
      if (i < 4) type = 'black_rider';
      else if (i < 11) type = 'bl_line';
      else if (i < 16) type = 'bl_musket';
      else if (i < 20) type = 'bl_sniper';
      else if (i < 23) type = 'bl_artillery';
      else type = 'bl_line';

      var cx = i % cols;
      var cy = Math.floor(i / cols);
      var ux = originX + cx * spacing - cy * 20;   // stack west as rows deepen
      var uy = originY + cx * 6 + cy * spacing;    // fan out vertically

      var u = makeUnit(type, 'bl', ux, uy);
      if (u) units.push(u);
    }
  }

  // <<< RB ADD start — spawnRbArmy: 5 red units at Kalajevo + 2-unit garrisons at Perkia/Library/School
  // ============================================================
  // SPAWN RB+RED ARMY
  // ============================================================
  // 5 red units at Kalajevo + 2-unit garrisons at each RB city.
  // IIA blue units arrive later via battle_front.js growth tick.
  // ============================================================
  function spawnRbArmy() {
    var kal = BM.getCities().find(function (c) { return c.id === 'kalajevo'; });
    if (kal) {
      var startTypes = ['rb_rider', 'rb_line', 'rb_line', 'rb_musket', 'rb_sniper'];
      for (var i = 0; i < startTypes.length; i++) {
        var angle = (i / startTypes.length) * Math.PI * 2;
        var r = 40 + (i % 3) * 20;
        var u = makeUnit(startTypes[i], 'rb',
          kal.x + Math.cos(angle) * r,
          kal.y + Math.sin(angle) * r);
        if (u) units.push(u);
      }
    }

    // Garrisons at other RB cities
    var rbCityIds = ['perkia', 'library', 'school'];
    for (var c = 0; c < rbCityIds.length; c++) {
      (function (cityId) {
        var city = BM.getCities().find(function (cc) { return cc.id === cityId; });
        if (!city) return;
        for (var g = 0; g < 2; g++) {
          var angle2 = (g / 2) * Math.PI * 2 + Math.PI / 4;
          var r2 = 30;
          var u2 = makeUnit('rb_line', 'rb',
            city.x + Math.cos(angle2) * r2,
            city.y + Math.sin(angle2) * r2);
          if (u2) units.push(u2);
        }
      })(rbCityIds[c]);
    }
  }
  // <<< RB ADD end

  // ============================================================
  // MOVEMENT HELPERS
  // ============================================================
  function terrainSpeedMultiplier(unit) {
    var h = BM.heightAt(unit.x, unit.y);
    if (h > 0.55) return CFG.mountainPenalty;
    if (h > 0.35) return CFG.hillsPenalty;
    return 1.0;
  }

  function updateUnitMovement(unit, dt) {
    var dx = unit.targetX - unit.x;
    var dy = unit.targetY - unit.y;
    var dist = Math.hypot(dx, dy);

    if (dist < CFG.waypointArrivalRadius) {
      unit.moving = false;
      unit.arrived = true;
      unit.stamina = Math.min(100, unit.stamina + CFG.staminaRegenPerSec * dt);
      // Facing stays where it was — no snap
      return;
    }

    unit.moving = true;
    unit.arrived = false;

    // Stamina
    unit.stamina = Math.max(0, unit.stamina - CFG.staminaDrainPerSec * dt);
    var staminaMul = unit.stamina < CFG.lowStaminaThreshold ? CFG.exhaustedSpeedMul : 1.0;

    // Speed
    var terrMul = terrainSpeedMultiplier(unit);
    var infraMul = 1.0;
    if (window.BattleEconomy && window.BattleEconomy.getInfraAt) {
      var infra = window.BattleEconomy.getInfraAt(unit.x, unit.y);
      infraMul = 1 + infra * 0.08;   // +8% speed per infra level
    }
    var speed = CFG.baseSpeed * unit.speed * terrMul * staminaMul * infraMul;
    var step = Math.min(dist, speed * dt);

    var nx = unit.x + (dx / dist) * step;
    var ny = unit.y + (dy / dist) * step;

    // Reject moves into impassable terrain (mountains, h > 0.85)
    var nh = BM.heightAt(nx, ny);
    if (nh > 0.85) {
      // Slide along the mountain edge: try moving only in X or only in Y
      var tryX = unit.x + (dx / dist) * step;
      var tryY = unit.y;
      var tryXh = BM.heightAt(tryX, tryY);

      var tryX2 = unit.x;
      var tryY2 = unit.y + (dy / dist) * step;
      var tryX2h = BM.heightAt(tryX2, tryY2);

      if (tryXh <= 0.85) {
        unit.x = tryX;
      } else if (tryX2h <= 0.85) {
        unit.y = tryY2;
      } else {
        // Fully blocked: try perpendicular slide
        var perpX = -dy / dist;
        var perpY =  dx / dist;
        var slideX = unit.x + perpX * step;
        var slideY = unit.y + perpY * step;
        if (BM.heightAt(slideX, slideY) <= 0.85) {
          unit.x = slideX;
          unit.y = slideY;
        }
        // else: do not move at all this frame
      }
    } else {
      unit.x = nx;
      unit.y = ny;
    }

    // Update facing
    var desired = Math.atan2(dy, dx);
    var diff = desired - unit.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    var turnRate = 4 * dt;
    unit.facing += Math.max(-turnRate, Math.min(turnRate, diff));
  }

  // ============================================================
  // SOFT PUSH-APART
  // ============================================================
  // Prevent friendly units from stacking on the same pixel.
  // Enemy units do NOT push each other — they will fight in File 3.
  // ============================================================
  function applyPushApart() {
    var n = units.length;
    for (var i = 0; i < n; i++) {
      units[i].pushX = 0;
      units[i].pushY = 0;
    }
    for (var i = 0; i < n; i++) {
      var a = units[i];
      for (var j = i + 1; j < n; j++) {
        var b = units[j];
        if (a.side !== b.side) continue;
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var d = Math.hypot(dx, dy);
        if (d > 0.001 && d < CFG.pushRadius) {
          var overlap = (CFG.pushRadius - d) / CFG.pushRadius;
          var fx = (dx / d) * overlap * CFG.pushStrength * 0.5;
          var fy = (dy / d) * overlap * CFG.pushStrength * 0.5;
          a.pushX -= fx;
          a.pushY -= fy;
          b.pushX += fx;
          b.pushY += fy;
        }
      }
    }
    // Apply push with a small smoothing factor so it doesn't oscillate
    for (var i = 0; i < n; i++) {
      var u = units[i];
      var nx = u.x + u.pushX * 0.1;
      var ny = u.y + u.pushY * 0.1;
      // Do not push into impassable terrain
      if (BM.heightAt(nx, ny) <= 0.85) {
        u.x = nx;
        u.y = ny;
      }
    }
  }

  // ============================================================
  // SELECTION
  // ============================================================
  function clearSelection() {
    selection.selectedIds = [];
    for (var i = 0; i < units.length; i++) units[i].selected = false;
    if (hooks.onSelectionChange) hooks.onSelectionChange(selection.selectedIds);
  }

  function toggleSelect(id) {
    var idx = selection.selectedIds.indexOf(id);
    if (idx === -1) selection.selectedIds.push(id);
    else selection.selectedIds.splice(idx, 1);
    for (var i = 0; i < units.length; i++) {
      units[i].selected = (selection.selectedIds.indexOf(units[i].id) !== -1);
    }
    if (hooks.onSelectionChange) hooks.onSelectionChange(selection.selectedIds);
  }

  function selectOnly(id) {
    selection.selectedIds = [id];
    for (var i = 0; i < units.length; i++) units[i].selected = (units[i].id === id);
    if (hooks.onSelectionChange) hooks.onSelectionChange(selection.selectedIds);
  }

  function unitAtScreen(sx, sy) {
    // sx, sy are screen coords in CSS pixels
    var canvas = BM.getCanvas();
    var rect = canvas.getBoundingClientRect();
    var cx = sx;
    var cy = sy;

    // Find closest unit within click radius (screen-space)
    var best = null;
    var bestDist = 22;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var s = BM.worldToScreen(u.x, u.y);
      var dx = cx - s.x;
      var dy = cy - s.y;
      var d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  function unitsInScreenBox(x0, y0, x1, y1) {
    var minX = Math.min(x0, x1);
    var maxX = Math.max(x0, x1);
    var minY = Math.min(y0, y1);
    var maxY = Math.max(y0, y1);

    var found = [];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== 'zmp') continue;
      var s = BM.worldToScreen(u.x, u.y);
      if (s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) {
        found.push(u);
      }
    }
    return found;
  }

  // ============================================================
  // MOVE ORDERS
  // ============================================================
  // Spread units around the target so they don't all path to one pixel.
  // ============================================================
  function issueMoveOrder(worldX, worldY) {
    var selected = units.filter(function (u) {
      return u.selected && u.side === 'zmp';
    });
    if (selected.length === 0) return;

    if (selected.length === 1) {
      selected[0].targetX = worldX;
      selected[0].targetY = worldY;
      selected[0].arrived = false;
      if (hooks.onOrder) hooks.onOrder(selected, worldX, worldY);
      return;
    }

    // Arrange the selected units in a small cluster around the click point.
    var cols = Math.ceil(Math.sqrt(selected.length));
    var spacing = 26;
    var originX = worldX - ((cols - 1) * spacing) / 2;
    var originY = worldY - ((cols - 1) * spacing) / 2;

    // Sort selected so they claim slots in a stable order
    selected.sort(function (a, b) { return a.id.localeCompare(b.id); });

    for (var i = 0; i < selected.length; i++) {
      var cx = i % cols;
      var cy = Math.floor(i / cols);
      selected[i].targetX = originX + cx * spacing;
      selected[i].targetY = originY + cy * spacing;
      selected[i].arrived = false;
    }
    if (hooks.onOrder) hooks.onOrder(selected, worldX, worldY);
  }

  // ============================================================
  // RENDER — DIVISION COUNTERS
  // ============================================================
  function drawUnits() {
    var ctx = BM.getCtx();
    var canvas = BM.getCanvas();
    var camera = BM.getCamera();
    var zoom = camera.zoom;

    // Draw in world space
    ctx.save();
    ctx.translate(canvas.width / (2 * devicePixelRatio), canvas.height / (2 * devicePixelRatio));
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);

    // Sort by Y so southern units draw on top (pseudo-3D)
    var sorted = units.slice().sort(function (a, b) { return a.y - b.y; });

    for (var i = 0; i < sorted.length; i++) {
      drawCounter(sorted[i], ctx, zoom);
    }

    ctx.restore();
  }

  function drawCounter(unit, ctx, zoom) {
    var t = UNIT_TYPES[unit.typeId];
    if (!t) return;

    var w = CFG.counterW;
    var h = CFG.counterH;

    // Position: counter sits at unit.x, unit.y (its bottom edge at that point)
    var cx = unit.x;
    var cy = unit.y;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx - w / 2 + 2, cy - h + 2, w, h);

    // Counter background
    ctx.fillStyle = t.color;
    ctx.fillRect(cx - w / 2, cy - h, w, h);

    // Border
    ctx.lineWidth = unit.selected ? 2.2 : 1.2;
    ctx.strokeStyle = unit.selected ? '#ffd700' : '#0a0a0a';
    ctx.strokeRect(cx - w / 2, cy - h, w, h);

    // NATO symbol
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unit.symbol || '·', cx, cy - h / 2);

    // HP bar (small, above the counter)
    var barW = w;
    var barH = 3;
    var barY = cy - h - 5;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(cx - barW / 2, barY, barW, barH);
    var hpFrac = Math.max(0, unit.hp / unit.hpMax);
    var hpColor = hpFrac > 0.5 ? '#5fdf5f' : (hpFrac > 0.25 ? '#ffcc00' : '#ff3030');
    ctx.fillStyle = hpColor;
    ctx.fillRect(cx - barW / 2, barY, barW * hpFrac, barH);

    // Org bar (thin, below HP bar)
    var orgY = barY + barH + 1;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(cx - barW / 2, orgY, barW, 2);
    var orgFrac = Math.max(0, unit.org / unit.orgMax);
    ctx.fillStyle = '#6699ff';
    ctx.fillRect(cx - barW / 2, orgY, barW * orgFrac, 2);
  }

  // ============================================================
  // RENDER — SELECTION BOX
  // ============================================================
  function drawSelectionBox() {
    if (!selection.dragBox) return;
    var ctx = BM.getCtx();
    var canvas = BM.getCanvas();
    var box = selection.dragBox;

    ctx.save();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    var x = Math.min(box.x0, box.x1);
    var y = Math.min(box.y0, box.y1);
    var w = Math.abs(box.x1 - box.x0);
    var h = Math.abs(box.y1 - box.y0);

    ctx.fillStyle = 'rgba(255, 215, 0, 0.10)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);

    ctx.restore();
  }

  // ============================================================
  // INPUT HANDLERS
  // ============================================================
  function setupInput() {
    var canvas = BM.getCanvas();

    // ---------- Left mouse: selection or drag box ----------
    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;

      input.isLeftDragging = true;
      input.leftDragStart = { x: sx, y: sy };
      input.mouseScreen = { x: sx, y: sy };
      var world = BM.screenToWorld(sx, sy);
      input.mouseWorld = world;
    });

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      input.mouseScreen = { x: sx, y: sy };
      input.mouseWorld = BM.screenToWorld(sx, sy);

      if (input.isLeftDragging && input.leftDragStart) {
        // Only show drag box after a small threshold so a click doesn't create a box
        var dx = sx - input.leftDragStart.x;
        var dy = sy - input.leftDragStart.y;
        if (Math.hypot(dx, dy) > 5) {
          selection.dragBox = {
            x0: input.leftDragStart.x,
            y0: input.leftDragStart.y,
            x1: sx,
            y1: sy
          };
        }
      }
    });

    canvas.addEventListener('mouseup', function (e) {
      if (e.button !== 0) return;
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;

      if (selection.dragBox) {
        // Box-select
        var found = unitsInScreenBox(
          selection.dragBox.x0, selection.dragBox.y0,
          selection.dragBox.x1, selection.dragBox.y1
        );
        selection.selectedIds = found.map(function (u) { return u.id; });
        for (var i = 0; i < units.length; i++) {
          units[i].selected = (selection.selectedIds.indexOf(units[i].id) !== -1);
        }
        if (hooks.onSelectionChange) hooks.onSelectionChange(selection.selectedIds);
        selection.dragBox = null;
      } else {
        // Single click
        var u = unitAtScreen(sx, sy);
        if (u) {
          if (u.side !== 'zmp') {
            // Clicking an enemy: treat as inform-only (selecting it clears own selection)
            // For now, ignore enemy clicks in File 2 — File 3 will add targeting.
            return;
          }
          if (e.shiftKey) toggleSelect(u.id);
          else selectOnly(u.id);
        } else {
          clearSelection();
        }
      }

      input.isLeftDragging = false;
      input.leftDragStart = null;
    });

    // ---------- Right mouse: move order ----------
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      var world = BM.screenToWorld(sx, sy);
      issueMoveOrder(world.x, world.y);
    });
  }

  // ============================================================
  // TICK
  // ============================================================
  function update(dt) {
    for (var i = 0; i < units.length; i++) {
      updateUnitMovement(units[i], dt);
    }
    applyPushApart();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  function init(options) {
    options = options || {};
    units = [];
    nextId = 1;
    selection.selectedIds = [];
    resetRoster();                          // ← NEW

    var playerStrength = options.playerStrength || 100;
    var enemyStrength  = options.enemyStrength  || 120;

    spawnZmpArmy(playerStrength);
    spawnBlArmy(enemyStrength);
    spawnRbArmy();                          // <<< RB ADD

    setupInput();
    console.log('[battle_units] initialised. ZMP:', countSide('zmp'), 'BL:', countSide('bl'), 'RB:', countSide('rb'));   // <<< RB ADD: RB count appended
  }

  function countSide(side) {
    var n = 0;
    for (var i = 0; i < units.length; i++) if (units[i].side === side) n++;
    return n;
  }

  function shutdown() {
    units = [];
    selection.selectedIds = [];
    selection.dragBox = null;
  }

  // Called by battle_hoi4.js in the main loop, in this order:
  //   1. BattleMap.draw()       — draw map
  //   2. BattleUnits.update(dt) — simulate
  //   3. BattleUnits.draw()     — draw units on top
  function draw() {
    drawUnits();
    drawSelectionBox();
  }

  return {
    CFG: CFG,
    UNIT_TYPES: UNIT_TYPES,
    init: init,
    shutdown: shutdown,
    update: update,
    draw: draw,

    // Accessors
    getUnits: function () { return units; },
    getSelectedIds: function () { return selection.selectedIds.slice(); },
    getSelectedUnits: function () {
      return units.filter(function (u) { return u.selected; });
    },

    // Control
    setSelectionChangeHook: function (fn) { hooks.onSelectionChange = fn; },
    setOrderHook: function (fn) { hooks.onOrder = fn; },
    issueMoveOrder: issueMoveOrder,
    clearSelection: clearSelection,
    makeUnit: makeUnit,
    resetRoster: resetRoster,
    spawnRbArmy: spawnRbArmy,   // <<< RB ADD
  };
})();