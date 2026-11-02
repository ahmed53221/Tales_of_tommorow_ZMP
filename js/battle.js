// battle_map.js — File 1 of the HOI4-style battle system
// ============================================================
// Renders the Kalajevo valley map on a 2D canvas with:
//   - Mountains (western band + Kalajevo central massif)
//   - Two rivers that rise in the north and merge mid-map
//   - A visible railway running north-south through the valley
//   - Cities as province nodes
//   - Province ownership painted by color (ZMP green, BL black, RB red)
//   - HOI4-style camera (pan with WASD / drag, zoom with wheel)
//
// THREE FACTIONS:
//   - ZMP   : holds ZMP HQ (west) + Danica (central-east)
//   - BL    : holds BL HQ (east)
//   - RB    : owns EVERYTHING ELSE (Kalajevo, Perkia, Library, School)
//             RB+Red = Red militia + blue IIA volunteers
//
// Coordinate system:
//   World space is 1400 x 1000 (matches the old map)
//   Provinces are laid out on a 28 x 20 grid (50px per cell in world space)
//
// Ownership layout at start:
//   ZMP (dark green):
//     - Western mountain band around ZMP HQ
//     - The plains around Danica (central-east)
//   BL (black):
//     - Eastern plains around BL HQ
//   RB (dark red):
//     - Everything else: Kalajevo, Perkia, Library, School, and all
//       provinces in between
//
// Loaded by battle.html. Exposes window.BattleMap.
// ============================================================

window.BattleMap = (function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    // World dimensions (kept identical to old battle.js for consistency)
    W: 1400,
    H: 1000,

    // Province grid — HOI4-style tiles
    PROV_COLS: 28,
    PROV_ROWS: 20,
    // => each province is 50 x 50 world units

    // Terrain grid — finer resolution for the heightmap painting
    TERRAIN_COLS: 140,
    TERRAIN_ROWS: 100,
    // => 10 x 10 world units per terrain cell

    // Camera
    camMinZoom: 0.5,
    camMaxZoom: 3.0,
    camStartZoom: 1.0,
    camPanSpeed: 900,   // world units per second at zoom 1.0

    // Colors
    colors: {
      zmpOwned:   '#1e5c1e',   // dark green
      zmpEdge:    '#2f8f2f',   // brighter green border
      blOwned:    '#101010',   // near-black
      blEdge:     '#8a1010',   // dark red border
      rbOwned:    '#7a1414',   // dark red
      rbEdge:     '#c03030',   // brighter red border
      neutral:    '#5a5a52',   // grey
      neutralEdge:'#7a7a72',
      border:     '#000000',
      mountains:  '#6b6154',
      hills:      '#857a60',
      plains:     '#6f7f4a',
      lowland:    '#556b3a',
      river:      '#3a5f8a',
      riverEdge:  '#5a86b8',
      railway:    '#3a2f22',
      railTies:   '#6b5a3a',
      city:       '#d4c9a8',
      cityEdge:   '#8a7d55'
    }
  };

  // ============================================================
  // STATE
  // ============================================================
  var canvas = null;
  var ctx = null;
  var dpr = 1;

  var camera = {
    x: CFG.W / 2,
    y: CFG.H / 2,
    zoom: CFG.camStartZoom
  };

  var terrainGrid = null;      // Float32Array of heights [0..1]
  var provinceGrid = null;     // Array of { owner } per province cell
  var cities = [];
  var rivers = [];
  var railway = null;

  var input = {
    keys: {},
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0
  };

  var lastTime = 0;
  var animId = null;

  // ============================================================
  // SEEDABLE RNG
  // ============================================================
  function makeRng(seed) {
    var s = seed || 1;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // ============================================================
  // TERRAIN GENERATION — realistic multi-octave version
  // ============================================================
  // Uses fractal value noise (multiple octaves) to build a
  // natural-looking heightmap. Rivers, ridges, and valleys all
  // emerge from the noise instead of being painted on top.
  // ============================================================
  function generateTerrain(seed) {
    var rng = makeRng(seed);
    var cols = CFG.TERRAIN_COLS;
    var rows = CFG.TERRAIN_ROWS;
    var grid = new Float32Array(cols * rows);

    // --- Value noise with smooth interpolation ---
    // We build a small grid of random values, then sample it
    // with bilinear interpolation. Multiple octaves give detail.
    function makeNoiseGrid(size, r) {
      var g = new Float32Array(size * size);
      for (var i = 0; i < size * size; i++) g[i] = r();
      return g;
    }

    function sampleNoise(g, size, x, y) {
      // x, y in [0, 1) — wrap around for tiling
      var fx = x * size;
      var fy = y * size;
      var x0 = Math.floor(fx) % size;
      var y0 = Math.floor(fy) % size;
      var x1 = (x0 + 1) % size;
      var y1 = (y0 + 1) % size;
      var tx = fx - Math.floor(fx);
      var ty = fy - Math.floor(fy);

      // Smoothstep
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);

      var a = g[y0 * size + x0];
      var b = g[y0 * size + x1];
      var c = g[y1 * size + x0];
      var d = g[y1 * size + x1];

      var ab = a + (b - a) * tx;
      var cd = c + (d - c) * tx;
      return ab + (cd - ab) * ty;
    }

    // Build several octaves
    var octaveSizes = [8, 16, 32, 64];
    var octaveWeights = [0.5, 0.25, 0.15, 0.10];
    var octaveGrids = [];
    for (var oi = 0; oi < octaveSizes.length; oi++) {
      octaveGrids.push(makeNoiseGrid(octaveSizes[oi], rng));
    }

    function fractalNoise(nx, ny) {
      var h = 0;
      for (var oi = 0; oi < octaveSizes.length; oi++) {
        h += sampleNoise(octaveGrids[oi], octaveSizes[oi], nx, ny) *
             octaveWeights[oi];
      }
      return h;   // roughly 0..1
    }

    // Pre-compute noise phases for the hand-carved features
    var p1 = rng() * Math.PI * 2;
    var p2 = rng() * Math.PI * 2;

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var nx = x / cols;
        var ny = y / rows;

        // --- 1. BASE FRACTAL NOISE ---
        // This gives rolling, natural-looking terrain everywhere.
        var h = fractalNoise(nx, ny) * 0.55;

        // --- 2. WESTERN MOUNTAIN BAND ---
        // ZMP home mountains. Slowly taper into foothills.
        var westMount = 0;
        if (nx < 0.05) {
          westMount = 1.0;
        } else if (nx < 0.12) {
          westMount = (0.12 - nx) / 0.07;
        } else if (nx < 0.20) {
          westMount = (0.20 - nx) / 0.08 * 0.4;
        }
        if (westMount > 0) {
          // Modulate by noise so the ridge is jagged, not flat
          var ridgeNoise = fractalNoise(nx * 2.5, ny * 2.5);
          h += westMount * (0.6 + ridgeNoise * 0.4);
        }

        // --- 3. KALA JEVO MASSIF ---
        // Central mountain block with an irregular edge.
        var kx = nx - 0.44;
        var ky = ny - 0.42;
        var kdist = Math.sqrt(kx * kx + ky * ky);
        // Ragged edge — use noise to vary the radius
        var kR = 0.13 + fractalNoise(nx * 3.0, ny * 3.0) * 0.06;
        if (kdist < kR) {
          var kf = 1.0 - (kdist / kR);
          // Smooth falloff, peak in the center
          h += kf * kf * 0.85;
          // Add rocky detail on top
          h += fractalNoise(nx * 6.0, ny * 6.0) * kf * 0.15;
        }

        // <<< RB FIX: carve a valley punch at Kalajevo (city position)
        // so the city is reachable. City sits at world (620, 420) →
        // normalized (0.443, 0.420). Radius 0.045 in normalized units
        // ≈ 63 world units — enough for the city tile + approaches.
        var calX = nx - 0.443;
        var calY = ny - 0.420;
        var calDist = Math.sqrt(calX * calX + calY * calY);
        if (calDist < 0.045) {
          var calF = 1.0 - (calDist / 0.045);
          // Smoothly pull height down toward 0.35 (walkable plains)
          var targetH = 0.35;
          if (h > targetH) {
            h = h * (1 - calF) + targetH * calF;
          }
        }
        // <<< RB FIX end

        // --- 4. SECONDARY HILLS / SW RIDGE ---
        // The hills between ZMP HQ and Kalajevo. Not a mountain,
        // just a rolling rise that makes the corridor interesting.
        var sx = nx - 0.22;
        var sy = ny - 0.72;
        var sdist = Math.sqrt(sx * sx + sy * sy);
        if (sdist < 0.14) {
          var sf = 1.0 - sdist / 0.14;
          h += sf * sf * 0.30;
        }

        // --- 5. NORTHERN HILLS (river sources) ---
        // Rivers rise in hills — add a gentle rise across the north.
        if (ny < 0.18) {
          var northBand = (0.18 - ny) / 0.18;
          h += northBand * 0.22;
          // Roughen the northern hills with noise
          h += fractalNoise(nx * 4.0, ny * 4.0) * northBand * 0.12;
        }

        // --- 6. EASTERN HILLS (BL side) ---
        // Slight rolling hills on the east so it's not flat.
        if (nx > 0.80) {
          var eastBand = (nx - 0.80) / 0.20;
          h += eastBand * 0.15;
        }

        // --- 7. SOUTHERN PLAINS (lowland) ---
        // The deep south is a proper plain — flat and low.
        if (ny > 0.72) {
          var southBand = (ny - 0.72) / 0.28;
          h -= southBand * 0.22;
        }

        // --- 8. RIVER VALLEYS (soft carve) ---
        // Carve shallow valleys where the rivers run.
        // Western river — runs from (0.42, 0.03) down to merge (0.62, 0.55)
        var river1Dist = distanceToRiver1(nx, ny);
        if (river1Dist < 0.05) {
          var rv1 = 1.0 - river1Dist / 0.05;
          h -= rv1 * rv1 * 0.15;
        }
        // Eastern river — from (0.88, 0.03) to merge
        var river2Dist = distanceToRiver2(nx, ny);
        if (river2Dist < 0.05) {
          var rv2 = 1.0 - river2Dist / 0.05;
          h -= rv2 * rv2 * 0.12;
        }
        // Merged south river — from merge to bottom
        if (ny > 0.55) {
          var mergedX = 0.62 + Math.sin((ny - 0.55) * 4.0) * 0.02;
          var mergedDist = Math.abs(nx - mergedX);
          if (mergedDist < 0.04) {
            var rv3 = 1.0 - mergedDist / 0.04;
            h -= rv3 * rv3 * 0.14;
          }
        }

        // --- 9. GENTLE BROOKS / TRIBUTARIES ---
        // Small streamlets that feed the main rivers. These are
        // carved by adding a few noise-driven "stream" channels.
        var streamNoise = fractalNoise(nx * 8.0 + 100, ny * 8.0 + 200);
        if (streamNoise > 0.72 && ny > 0.15 && ny < 0.85) {
          // Where noise is high, carve a small channel
          var streamStrength = (streamNoise - 0.72) / 0.28;
          h -= streamStrength * 0.06;
        }

        // --- 10. FINE NOISE (texture) ---
        h += fractalNoise(nx * 12.0, ny * 12.0) * 0.04 - 0.02;

        // --- CLAMP ---
        if (h < 0) h = 0;
        if (h > 1) h = 1;

        grid[y * cols + x] = h;
      }
    }

    // Distance helpers for river carving
    function distanceToRiver1(nx, ny) {
      // Segment 1a
      var ax = 0.42, ay = 0.03;
      var bx = 0.62, by = 0.55;
      var d = distToSegment(nx, ny, ax, ay, bx, by);
      return d;
    }
    function distanceToRiver2(nx, ny) {
      var ax = 0.88, ay = 0.03;
      var bx = 0.62, by = 0.55;
      return distToSegment(nx, ny, ax, ay, bx, by);
    }
    function distToSegment(px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;
      if (len2 === 0) return Math.hypot(px - ax, py - ay);
      var t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      var cx = ax + t * dx;
      var cy = ay + t * dy;
      return Math.hypot(px - cx, py - cy);
    }

    return { grid: grid, cols: cols, rows: rows };
  }

  function colorForHeight(h) {
    var stops = [
      [0.00, [ 60,  90, 120]],
      [0.06, [ 80, 120, 150]],
      [0.10, [ 90, 115,  95]],
      [0.18, [ 92, 118,  78]],
      [0.32, [108, 130,  82]],
      [0.45, [126, 138,  98]],
      [0.55, [148, 148, 108]],
      [0.65, [172, 165, 128]],
      [0.75, [195, 185, 155]],
      [0.85, [215, 210, 200]],
      [0.95, [240, 240, 240]]
    ];
    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i], b = stops[i + 1];
      if (h >= a[0] && h <= b[0]) {
        var t = (h - a[0]) / (b[0] - a[0]);
        t = t * t * (3 - 2 * t);
        return [
          Math.round(a[1][0] + (b[1][0] - a[1][0]) * t),
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * t),
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * t)
        ];
      }
    }
    return h < 0 ? stops[0][1] : stops[stops.length - 1][1];
  }

  function heightAt(worldX, worldY) {
    if (!terrainGrid) return 0;
    var cs = CFG.W / CFG.TERRAIN_COLS;
    var cx = Math.floor(worldX / cs);
    var cy = Math.floor(worldY / cs);
    if (cx < 0 || cy < 0 || cx >= CFG.TERRAIN_COLS || cy >= CFG.TERRAIN_ROWS) return 0;
    return terrainGrid[cy * CFG.TERRAIN_COLS + cx];
  }

  // ============================================================
  // PROVINCE GRID
  // ============================================================
  // The province grid is a coarse layer over the terrain.
  // Each province cell has an owner: 'zmp', 'bl', or 'rb'.
  // DEFAULT OWNER IS 'rb' — the Red+IIA coalition owns the whole
  // valley except the two starting zones painted below.
  // ============================================================
  function initProvinceGrid() {
    var cols = CFG.PROV_COLS;
    var rows = CFG.PROV_ROWS;
    var grid = [];
    for (var y = 0; y < rows; y++) {
      grid[y] = [];
      for (var x = 0; x < cols; x++) {
        grid[y][x] = { owner: 'rb' };
      }
    }

    // Helper: province cell at world coords
    function provAt(wx, wy) {
      var cw = CFG.W / cols;
      var ch = CFG.H / rows;
      var px = Math.floor(wx / cw);
      var py = Math.floor(wy / ch);
      if (px < 0 || py < 0 || px >= cols || py >= rows) return null;
      return { x: px, y: py };
    }

    // Helper: paint a small block of cells around a world position
    function paintAround(wx, wy, radius, side) {
      var cell = provAt(wx, wy);
      if (!cell) return;
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          var px = cell.x + dx;
          var py = cell.y + dy;
          if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
          grid[py][px].owner = side;
        }
      }
    }

    // --- Three starting zones ---
    // ZMP HQ (west) + Danica (central-east)
    // BL HQ (east)
    // Everything else = RB (Red+IIA)
    paintAround(140, 780, 1, 'zmp');    // ZMP HQ
    paintAround(900, 640, 1, 'zmp');    // Danica
    paintAround(1260, 180, 1, 'bl');    // BL HQ

    provinceGrid = grid;
  }

  // ============================================================
  // CITIES
  // ============================================================
  function initCities() {
    cities = [
      { id: 'zmp_hq',   name: 'ZMP HQ',   x: 140, y: 780, side: 'zmp',     isHQ: true },
      { id: 'bl_hq',    name: 'BL HQ',    x: 1260, y: 180, side: 'bl',      isHQ: true },
      { id: 'danica',   name: 'Danica',   x: 900, y: 640, side: 'zmp' },
      { id: 'kalajevo', name: 'Kalajevo', x: 620, y: 420, side: 'rb' },
      { id: 'perkia',   name: 'Perkia',   x: 420, y: 260, side: 'rb' },
      { id: 'library',  name: 'Library',  x: 620, y: 640, side: 'rb' },
      { id: 'school',   name: 'School',   x: 700, y: 850, side: 'rb', isVictory: true }
    ];
  }

  // ============================================================
  // RIVERS
  // ============================================================
  // Two rivers rising in the north, merging mid-map, exiting south.
  // ============================================================
  function initRivers() {
    // River 1: Western stream — rises north-center, flows south, bends east.
    // River 2: Eastern stream — rises north-east, flows south.
    // Merge point: (0.62, 0.55) in normalized map space.
    var MERGE_X = 0.62 * CFG.W;
    var MERGE_Y = 0.55 * CFG.H;

    var r1 = [];
    var steps1 = 60;
    for (var i = 0; i <= steps1; i++) {
      var t = i / steps1;
      var rx, ry;
      if (t < 0.65) {
        // Segment 1a: descend to merge
        var tt = t / 0.65;
        rx = 0.42 * CFG.W + (MERGE_X - 0.42 * CFG.W) * tt + Math.sin(tt * 3.0) * 15;
        ry = 0.03 * CFG.H + (MERGE_Y - 0.03 * CFG.H) * tt;
      } else {
        // Segment 1b: merged river continues south
        var tt = (t - 0.65) / 0.35;
        rx = MERGE_X + Math.sin(tt * 2.0) * 12;
        ry = MERGE_Y + (1.05 * CFG.H - MERGE_Y) * tt;
      }
      r1.push({ x: rx, y: ry });
    }

    var r2 = [];
    var steps2 = 60;
    for (var i = 0; i <= steps2; i++) {
      var t = i / steps2;
      var rx, ry;
      if (t < 0.65) {
        // Segment 2a: from NE down to merge
        var tt = t / 0.65;
        rx = 0.88 * CFG.W + (MERGE_X - 0.88 * CFG.W) * tt + Math.sin(tt * 4.0 + 1.2) * 15;
        ry = 0.03 * CFG.H + (MERGE_Y - 0.03 * CFG.H) * tt;
      } else {
        // Segment 2b: overlap river 1's tail
        var tt = (t - 0.65) / 0.35;
        rx = MERGE_X + Math.sin(tt * 2.0) * 12;
        ry = MERGE_Y + (1.05 * CFG.H - MERGE_Y) * tt;
      }
      r2.push({ x: rx, y: ry });
    }

    rivers = [
      { points: r1, width: 14 },
      { points: r2, width: 12 }
    ];
  }

  // ============================================================
  // RAILWAY
  // ============================================================
  // A straight-ish N-S line running through the valley.
  // Follows roughly x = 0.58 of the map, through Inner Perkian
  // and past the Kalajevo massif.
  // ============================================================
  function initRailway() {
    var pts = [];
    var steps = 40;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      // Slight waviness so it looks like it follows the valley floor
      var rx = 0.58 * CFG.W + Math.sin(t * 5.0) * 18;
      var ry = t * CFG.H;
      pts.push({ x: rx, y: ry });
    }
    railway = { points: pts, width: 6 };
  }

  // ============================================================
  // RENDER — COORDINATE TRANSFORMS
  // ============================================================
  function worldToScreen(wx, wy) {
    var sx = (wx - camera.x) * camera.zoom + canvas.width / (2 * dpr);
    var sy = (wy - camera.y) * camera.zoom + canvas.height / (2 * dpr);
    return { x: sx, y: sy };
  }

  function screenToWorld(sx, sy) {
    var wx = (sx - canvas.width / (2 * dpr)) / camera.zoom + camera.x;
    var wy = (sy - canvas.height / (2 * dpr)) / camera.zoom + camera.y;
    return { x: wx, y: wy };
  }

  // ============================================================
  // RENDER — MAIN DRAW
  // ============================================================
  function draw() {
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;

    // Sky/void background
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Begin camera transform
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    drawTerrain();
    drawRailway();
    drawRivers();
    drawProvinceOverlay();
    drawCities();

    ctx.restore();

    drawHUD(w, h);

    // Only draw units if BattleUnits has been fully initialised
    // Draw units first
    if (window.BattleUnits && typeof window.BattleUnits.draw === 'function' && window.BattleUnits.getUnits().length > 0) {
      try { window.BattleUnits.draw(); }
      catch (e) { console.error('[battle_map] units draw failed:', e.message); }
    }

    // Then draw combat markers and front lines on top
    if (window.BattleFront && typeof window.BattleFront.draw === 'function') {
      try { window.BattleFront.draw(); }
      catch (e) { console.error('[battle_map] front draw failed:', e.message); }
    }

    // after BattleEconomy.update(dt):
    if (window.BattleDrones && typeof window.BattleDrones.update === 'function') {
      try { window.BattleDrones.update(dt); }
      catch (e) { console.error('[battle_map] drones update failed:', e.message); }
    }
  }

  // ============================================================
  // RENDER — TERRAIN
  // ============================================================
  function drawTerrain() {
    var cs = CFG.W / CFG.TERRAIN_COLS;
    var cols = CFG.TERRAIN_COLS;
    var rows = CFG.TERRAIN_ROWS;

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var h = terrainGrid[y * cols + x];

        // Color by height band
        var color;
        if (h < 0.15)       color = CFG.colors.lowland;
        else if (h < 0.35)  color = CFG.colors.plains;
        else if (h < 0.55)  color = CFG.colors.hills;
        else                color = CFG.colors.mountains;

        ctx.fillStyle = color;
        ctx.fillRect(x * cs, y * cs, cs + 1, cs + 1);

        // Add subtle shading on higher terrain to give it mass
        if (h > 0.55) {
          var shade = (h - 0.55) / 0.45;
          ctx.fillStyle = 'rgba(0,0,0,' + (shade * 0.35) + ')';
          ctx.fillRect(x * cs, y * cs, cs + 1, cs + 1);
        } else if (h > 0.35) {
          var shade = (h - 0.35) / 0.20;
          ctx.fillStyle = 'rgba(255,255,255,' + (shade * 0.06) + ')';
          ctx.fillRect(x * cs, y * cs, cs + 1, cs + 1);
        }
      }
    }
  }

  // ============================================================
  // RENDER — RAILWAY
  // ============================================================
  function drawRailway() {
    if (!railway) return;

    // Draw the ballast (dark bed)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = CFG.colors.railway;
    ctx.lineWidth = railway.width;
    ctx.beginPath();
    for (var i = 0; i < railway.points.length; i++) {
      var p = railway.points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Draw the rails as two thin parallel lines
    ctx.strokeStyle = CFG.colors.railTies;
    ctx.lineWidth = 1.4;
    for (var offset = -2; offset <= 2; offset += 4) {
      ctx.beginPath();
      for (var i = 0; i < railway.points.length; i++) {
        var p = railway.points[i];
        // Perpendicular offset
        var prev = railway.points[Math.max(0, i - 1)];
        var next = railway.points[Math.min(railway.points.length - 1, i + 1)];
        var dx = next.x - prev.x;
        var dy = next.y - prev.y;
        var len = Math.hypot(dx, dy) || 1;
        var ox = -dy / len * offset;
        var oy =  dx / len * offset;
        if (i === 0) ctx.moveTo(p.x + ox, p.y + oy);
        else ctx.lineTo(p.x + ox, p.y + oy);
      }
      ctx.stroke();
    }

    // Draw ties (short perpendicular lines every ~14 units)
    ctx.strokeStyle = '#4a3d28';
    ctx.lineWidth = 1;
    var tieSpacing = 14;
    var acc = 0;
    for (var i = 1; i < railway.points.length; i++) {
      var a = railway.points[i - 1];
      var b = railway.points[i];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var seg = Math.hypot(dx, dy);
      var steps = Math.floor(seg / tieSpacing);
      for (var s = 0; s <= steps; s++) {
        var t = s / Math.max(1, steps);
        var px = a.x + dx * t;
        var py = a.y + dy * t;
        var len = seg || 1;
        var ox = -dy / len;
        var oy =  dx / len;
        ctx.beginPath();
        ctx.moveTo(px - ox * 5, py - oy * 5);
        ctx.lineTo(px + ox * 5, py + oy * 5);
        ctx.stroke();
      }
    }
  }

  // ============================================================
  // RENDER — RIVERS
  // ============================================================
  function drawRivers() {
    for (var r = 0; r < rivers.length; r++) {
      var river = rivers[r];
      var pts = river.points;

      // Outline (darker)
      ctx.strokeStyle = CFG.colors.riverEdge;
      ctx.lineWidth = river.width + 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      // Water fill
      ctx.strokeStyle = CFG.colors.river;
      ctx.lineWidth = river.width;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
  }

  // ============================================================
  // RENDER — PROVINCE OWNERSHIP
  // ============================================================
  // Three-faction tint: zmp green, bl black, rb red.
  // ============================================================
  function drawProvinceOverlay() {
    var cw = CFG.W / CFG.PROV_COLS;
    var ch = CFG.H / CFG.PROV_ROWS;

    // Fill each province with its owner's color, semi-transparent
    for (var y = 0; y < CFG.PROV_ROWS; y++) {
      for (var x = 0; x < CFG.PROV_COLS; x++) {
        var prov = provinceGrid[y][x];
        var fill;
        if (prov.owner === 'zmp')      fill = 'rgba(30,92,30,0.45)';
        else if (prov.owner === 'bl')  fill = 'rgba(0,0,0,0.55)';
        else if (prov.owner === 'rb')  fill = 'rgba(120,20,20,0.40)';
        else continue;
        ctx.fillStyle = fill;
        ctx.fillRect(x * cw, y * ch, cw, ch);
      }
    }

    // Draw borders where ownership differs
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 1.4;
    for (var y = 0; y < CFG.PROV_ROWS; y++) {
      for (var x = 0; x < CFG.PROV_COLS; x++) {
        var prov = provinceGrid[y][x];

        // Check right neighbor
        if (x + 1 < CFG.PROV_COLS) {
          var right = provinceGrid[y][x + 1];
          if (right.owner !== prov.owner) {
            ctx.beginPath();
            ctx.moveTo((x + 1) * cw, y * ch);
            ctx.lineTo((x + 1) * cw, (y + 1) * ch);
            ctx.stroke();
          }
        }
        // Check bottom neighbor
        if (y + 1 < CFG.PROV_ROWS) {
          var below = provinceGrid[y + 1][x];
          if (below.owner !== prov.owner) {
            ctx.beginPath();
            ctx.moveTo(x * cw, (y + 1) * ch);
            ctx.lineTo((x + 1) * cw, (y + 1) * ch);
            ctx.stroke();
          }
        }
      }
    }
  }

  // ============================================================
  // RENDER — CITIES
  // ============================================================
  function drawCities() {
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];

      // Ring color by owner
      var ring;
      if (c.side === 'zmp') ring = CFG.colors.zmpEdge;
      else if (c.side === 'bl') ring = CFG.colors.blEdge;
      else if (c.side === 'rb') ring = CFG.colors.rbEdge;
      else if (c.isVictory) ring = '#ffd700';
      else ring = CFG.colors.neutralEdge;

      // Outer circle
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.isHQ ? 16 : (c.isVictory ? 14 : 11), 0, Math.PI * 2);
      ctx.fillStyle = CFG.colors.city;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = ring;
      ctx.stroke();

      // Victory marker
      if (c.isVictory) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.fill();
      }

      // Name label
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      var label = c.name;
      var tw = ctx.measureText(label).width;
      var ly = c.y - (c.isHQ ? 20 : 15);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(c.x - tw / 2 - 4, ly - 12, tw + 8, 14);
      ctx.fillStyle = ring;
      ctx.fillText(label, c.x, ly);
    }
  }

  // ============================================================
  // RENDER — HUD (screen-space)
  // ============================================================
  function drawHUD(w, h) {
    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, w, 28);
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c8ffc8';
    ctx.fillText('KALAJEVO VALLEY — ZMP (green) vs BLACK LEAGUE (black) vs RED+IIA (red)', 10, 14);

    // Bottom hint bar
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, h - 24, w, 24);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ddd';
    ctx.fillText('WASD / arrows: pan   •   Mouse wheel: zoom   •   Middle-drag: pan', 10, h - 12);

    // Zoom indicator
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888';
    ctx.fillText('Zoom: ' + camera.zoom.toFixed(2) + 'x', w - 10, h - 12);
  }

  // ============================================================
  // CAMERA CONTROL
  // ============================================================
  function updateCamera(dt) {
    var speed = CFG.camPanSpeed / camera.zoom;
    var mx = 0, my = 0;
    if (input.keys['KeyW'] || input.keys['ArrowUp'])    my -= 1;
    if (input.keys['KeyS'] || input.keys['ArrowDown'])  my += 1;
    if (input.keys['KeyA'] || input.keys['ArrowLeft'])  mx -= 1;
    if (input.keys['KeyD'] || input.keys['ArrowRight']) mx += 1;
    if (mx !== 0 || my !== 0) {
      var len = Math.hypot(mx, my);
      camera.x += (mx / len) * speed * dt;
      camera.y += (my / len) * speed * dt;
    }

    // Clamp camera to map bounds (with a bit of margin)
    var margin = 100;
    if (camera.x < -margin) camera.x = -margin;
    if (camera.x > CFG.W + margin) camera.x = CFG.W + margin;
    if (camera.y < -margin) camera.y = -margin;
    if (camera.y > CFG.H + margin) camera.y = CFG.H + margin;
  }

  function tick(now) {
    animId = requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    updateCamera(dt);

    if (window.BattleFront) {
      try { window.BattleFront.update(dt); } catch (e) {}
    }
    if (window.BattleHOI4) {
      try { window.BattleHOI4.update(dt); } catch (e) {}
    }
    if (window.BattleEconomy) {
      try { window.BattleEconomy.update(dt); } catch (e) {}
    }
    if (window.BattleDrones) {
      try { window.BattleDrones.update(dt); } catch (e) {}
    }
    if (window.BattleHUD) {
      try { window.BattleHUD.update(dt); } catch (e) {}
    }

    // Draw — use the visual override if registered
    if (window.BattleTerrainVisual && typeof window.BattleTerrainVisual.draw === 'function') {
      window.BattleTerrainVisual.draw();
    } else {
      draw();
    }
  }

  // ============================================================
  // INPUT
  // ============================================================
  function setupInput() {
    window.addEventListener('keydown', function (e) {
      input.keys[e.code] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) !== -1) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) {
      input.keys[e.code] = false;
    });
    window.addEventListener('blur', function () {
      input.keys = {};
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var oldZoom = camera.zoom;
      var factor = e.deltaY < 0 ? 1.1 : 0.9;
      camera.zoom = Math.max(CFG.camMinZoom, Math.min(CFG.camMaxZoom, camera.zoom * factor));

      // Zoom toward mouse cursor
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var worldBefore = screenToWorld(mx, my);
      // After adjusting camera.zoom, we recompute so the world point under mouse stays fixed
      var worldAfter = screenToWorld(mx, my);
      camera.x += worldBefore.x - worldAfter.x;
      camera.y += worldBefore.y - worldAfter.y;
    }, { passive: false });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 1 || e.button === 2) {
        // Middle or right drag to pan
        e.preventDefault();
        input.isDragging = true;
        input.lastMouseX = e.clientX;
        input.lastMouseY = e.clientY;
      }
    });
    window.addEventListener('mousemove', function (e) {
      if (!input.isDragging) return;
      var dx = e.clientX - input.lastMouseX;
      var dy = e.clientY - input.lastMouseY;
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
      input.lastMouseX = e.clientX;
      input.lastMouseY = e.clientY;
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 1 || e.button === 2) {
        input.isDragging = false;
      }
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ============================================================
  // RESIZE
  // ============================================================
  function onResize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  function init(options) {
    options = options || {};

    canvas = document.getElementById('battle-map-canvas');
    if (!canvas) {
      console.error('[battle_map] canvas #battle-map-canvas not found');
      return;
    }
    // Make sure canvas fills its container
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx = canvas.getContext('2d');

    var seed = options.seed || (Date.now() % 100000) + 1;
    terrainGrid = generateTerrain(seed).grid;
    initProvinceGrid();
    initCities();
    initRivers();
    initRailway();

    setupInput();
    window.addEventListener('resize', onResize);

    lastTime = performance.now();
    animId = requestAnimationFrame(tick);

    console.log('[battle_map] initialised. Seed:', seed);
  }

  function shutdown() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    window.removeEventListener('resize', onResize);
  }

  // Expose the internals so File 2 (units) can hook in
  return {
    CFG: CFG,
    init: init,
    shutdown: shutdown,
    // Read-only accessors for the next files
    getCamera: function () { return camera; },
    getCanvas: function () { return canvas; },
    getCtx: function () { return ctx; },
    getProvinceGrid: function () { return provinceGrid; },
    getCities: function () { return cities; },
    getTerrainGrid: function () { return terrainGrid; },
    heightAt: heightAt,
    worldToScreen: worldToScreen,
    screenToWorld: screenToWorld
  };
})();