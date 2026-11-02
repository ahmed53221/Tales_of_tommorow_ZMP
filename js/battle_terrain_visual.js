// battle_terrain_visual.js — File 6: visual overhaul
// ============================================================
// Replaces the flat-color terrain with:
//   - Heightmap-driven lighting (ridges bright, valleys dark)
//   - Contour lines every 0.5 elevation step
//   - A dense neighbourhood/street network like a real map
//   - Small place-name labels (visible when zoomed in)
//   - Railway rendered as a proper double-track line
//   - Rivers with darker banks and lighter centres
//   - Province borders as thin brown lines (HOI4 style)
//   - Front line as a thick glowing yellow-orange stripe
//   - Soft fog of war over unseen enemy territory
//
// THREE FACTIONS: ZMP (green), BL (black), RB (dark red)
//
// Loaded after battle_map.js. Hooks into BattleMap's draw pipeline.
// Exposes: window.BattleTerrainVisual
// ============================================================

window.BattleTerrainVisual = (function () {
  'use strict';

  function BM() { return window.BattleMap; }

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    // Colour palette — pulled from the HOI4 reference screenshot
    colors: {
      lowland:    [ 88, 110, 72],
      plains:     [110, 130, 82],
      hills:      [138, 140, 100],
      steep:      [170, 160, 120],
      peak:       [205, 195, 175],

      // Ridge shading
      ridgeLight: [235, 225, 200],
      ridgeDark:  [ 45,  50,  42],

      // Contour
      contour:    [120, 105,  80, 0.35],

      // Streets
      street:     [190, 180, 165, 0.45],
      highway:    [230, 220, 200, 0.7],

      // Railway
      railBase:   [ 55,  45,  35],
      railTie:    [120, 100,  70],
      railTrack:  [220, 210, 200, 0.85],

      // Rivers
      riverBank:  [ 60,  90, 130],
      riverFill:  [ 95, 140, 180],
      riverHi:    [150, 190, 220, 0.5],

      // Labels
      labelBg:    'rgba(0,0,0,0.65)',
      labelFg:    '#f5efe0',
      labelMinor: '#c9c2b0',

      // Province borders
      provBorder: 'rgba(60, 45, 25, 0.85)',

      // Front line
      frontGlow:  'rgba(255, 200, 60, 0.85)',
      frontCore:  'rgba(220, 60,  60, 1.0)',

      // Fog
      fogOverlay: 'rgba(35, 38, 40, 0.55)'
    },

    // Terrain rendering
    ditherAmount: 6,       // random ± offset per cell to break flat colour
    contourStep: 0.15,     // elevation delta between contour lines
    contourMinZoom: 0.6,   // only draw contours above this zoom
    labelMinZoom: 1.1,     // only draw labels above this zoom
    smallLabelMinZoom: 1.6,// only draw the small neighbourhood labels above this zoom

    // Network
    roadSegments: 220,     // how many random street segments to draw
    roadMinZoom: 0.7
  };

  // ============================================================
  // PLACES — neighbourhoods drawn from the real Lukavac map
  // ============================================================
  // Each entry is (name, x fraction, y fraction, size).
  // size: 2 = town, 1 = neighbourhood, 0 = hamlet.
  var PLACES = [
    // Towns and cities on the map (coordinates chosen to match the
    // in-game city positions from battle_map.js, so labels sit near
    // the right dots).
    { name: 'Lukavac Mjesto', x: 0.500, y: 0.640, size: 2 },
    { name: 'Kalajevo',       x: 0.443, y: 0.420, size: 2 },
    { name: 'Perkia',         x: 0.300, y: 0.260, size: 2 },
    { name: 'Danica',         x: 0.643, y: 0.640, size: 2 },
    { name: 'Library',        x: 0.443, y: 0.640, size: 2 },
    { name: 'School',         x: 0.500, y: 0.850, size: 2 },

    // Neighbourhoods (from the Google Maps image)
    { name: 'Bukovac',    x: 0.480, y: 0.230, size: 1 },
    { name: 'Mirza',      x: 0.320, y: 0.340, size: 1 },
    { name: 'Rječica',    x: 0.550, y: 0.500, size: 1 },
    { name: 'Caršija',    x: 0.610, y: 0.720, size: 1 },
    { name: 'Klupa',      x: 0.680, y: 0.770, size: 1 },
    { name: 'Kovači',     x: 0.280, y: 0.180, size: 1 },
    { name: 'Kovčići',    x: 0.220, y: 0.250, size: 0 },
    { name: 'Modrac',     x: 0.180, y: 0.900, size: 1 },
    { name: 'Šićki Brod', x: 0.080, y: 0.400, size: 1 },
    { name: 'Bistarac',   x: 0.090, y: 0.600, size: 0 },
    { name: 'Priluk',     x: 0.400, y: 0.900, size: 1 },
    { name: 'Poljice',    x: 0.700, y: 0.500, size: 0 },
    { name: 'Smoluća',    x: 0.900, y: 0.300, size: 0 },
    { name: 'Morančani',  x: 0.820, y: 0.420, size: 0 },
    { name: 'Huskići',    x: 0.770, y: 0.550, size: 0 },
    { name: 'Breze',      x: 0.850, y: 0.650, size: 0 },
    { name: 'Tuzl. odred',x: 0.250, y: 0.600, size: 1 },
    { name: 'Đ. Džamija', x: 0.450, y: 0.550, size: 0 },
    { name: 'Rumija',     x: 0.550, y: 0.450, size: 0 },
    { name: 'Bistarac',   x: 0.140, y: 0.750, size: 0 },
    { name: 'Šerići',     x: 0.750, y: 0.850, size: 0 },
    { name: 'Brštanik',   x: 0.350, y: 0.750, size: 0 }
  ];

  // ============================================================
  // STREET NETWORK
  // ============================================================
  // A pseudo-random but stable set of short segments connecting
  // nearby place dots, giving the illusion of a real street grid.
  var streets = null;

  function buildStreetNetwork() {
    if (streets) return streets;
    var rng = (function (s) {
      return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    })(20240101);

    var segs = [];
    var W = 1400, H = 1000;

    // 1. Segments radiating from each place to nearby places
    for (var i = 0; i < PLACES.length; i++) {
      var a = PLACES[i];
      if (a.size < 1) continue;
      // find up to 3 nearest places of size >= 0
      var nearest = [];
      for (var j = 0; j < PLACES.length; j++) {
        if (i === j) continue;
        var b = PLACES[j];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        nearest.push({ p: b, d: d });
      }
      nearest.sort(function (u, v) { return u.d - v.d; });
      var maxLinks = a.size === 2 ? 4 : 2;
      for (var k = 0; k < Math.min(maxLinks, nearest.length); k++) {
        var target = nearest[k].p;
        var waviness = a.size === 2 ? 1.0 : 0.6;
        segs.push({
          x1: a.x * W, y1: a.y * H,
          x2: target.x * W, y2: target.y * H,
          waviness: waviness,
          highway: a.size === 2 && target.size === 2
        });
      }
    }

    // 2. Random micro-streets inside dense clusters
    for (var t = 0; t < CFG.roadSegments; t++) {
      var a = PLACES[Math.floor(rng() * PLACES.length)];
      var dx = (rng() - 0.5) * 90;
      var dy = (rng() - 0.5) * 90;
      var x = a.x * W + dx;
      var y = a.y * H + dy;
      var len = 20 + rng() * 45;
      var ang = rng() * Math.PI * 2;
      segs.push({
        x1: x, y1: y,
        x2: x + Math.cos(ang) * len,
        y2: y + Math.sin(ang) * len,
        waviness: 0.3,
        highway: false
      });
    }

    streets = segs;
    return segs;
  }

  // ============================================================
  // HEIGHT SHADING
  // ============================================================
  // For each terrain cell, compute an approximate slope and
  // shade based on a fixed light direction (from the NW, like HOI4).
  function shadeFor(h, sx, sy) {
    // Base colour from height
    var c;
    if (h < 0.15) c = CFG.colors.lowland;
    else if (h < 0.35) c = CFG.colors.plains;
    else if (h < 0.55) c = CFG.colors.hills;
    else if (h < 0.75) c = CFG.colors.steep;
    else c = CFG.colors.peak;

    // Light from NW: slope in +x is dark, slope in -y is bright
    var light = 0.5 + sx * 1.6 - sy * 1.2;
    if (light < 0) light = 0;
    if (light > 1) light = 1;

    var r = c[0] * (0.7 + light * 0.6);
    var g = c[1] * (0.7 + light * 0.6);
    var b = c[2] * (0.7 + light * 0.6);

    // High peaks fade toward the ridge-light colour
    if (h > 0.75) {
      var t = (h - 0.75) / 0.25;
      r = r * (1 - t) + CFG.colors.ridgeLight[0] * t;
      g = g * (1 - t) + CFG.colors.ridgeLight[1] * t;
      b = b * (1 - t) + CFG.colors.ridgeLight[2] * t;
    }
    return [r, g, b];
  }

  // ============================================================
  // RENDER — TERRAIN
  // ============================================================
    // ============================================================
  // RENDER — TERRAIN (multi-band, smooth transitions)
  // ============================================================
    // ============================================================
  // RENDER — TERRAIN (multi-band, smooth transitions)
  // ============================================================
  // Uses the parameters passed in by the draw() function,
  // NOT the globals (which don't exist in this file).
  // ============================================================
  function drawTerrain(ctx, canvas, camera, terrainGrid, W, H, cols, rows) {
    var cs = W / cols;
    var chH = H / rows;

    // --- Pass 1: fill each cell with its height-based color ---
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var h = terrainGrid[y * cols + x];

        // Compute color for this cell using the module-level
        // colorForHeight helper (defined below).
        var c = colorForHeight(h);

        ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
        ctx.fillRect(x * cs, y * chH, cs + 0.5, chH + 0.5);
      }
    }

    // --- Pass 2: slope shading (NW light) ---
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var h = terrainGrid[y * cols + x];
        var hE = x + 1 < cols ? terrainGrid[y * cols + x + 1] : h;
        var hS = y + 1 < rows ? terrainGrid[(y + 1) * cols + x] : h;
        var sx = hE - h;
        var sy = hS - h;

        // Light from NW: slope in +x is dark, slope in -y is bright
        var light = 0.5 + sx * 1.6 - sy * 1.2;
        if (light < 0) light = 0;
        if (light > 1) light = 1;

        // Apply subtle brightness modulation
        if (Math.abs(sx) + Math.abs(sy) > 0.02) {
          var alpha = Math.min(0.35, (Math.abs(sx) + Math.abs(sy)) * 2.0);
          if (sx + sy < 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, ' + (alpha * 0.5) + ')';
          } else {
            ctx.fillStyle = 'rgba(255, 240, 220, ' + (alpha * 0.35) + ')';
          }
          ctx.fillRect(x * cs, y * chH, cs + 0.5, chH + 0.5);
        }
      }
    }

    // --- Pass 3: contour lines (only when zoomed in) ---
    if (camera.zoom >= CFG.contourMinZoom) {
      ctx.strokeStyle = 'rgba(' +
        CFG.colors.contour[0] + ',' + CFG.colors.contour[1] + ',' +
        CFG.colors.contour[2] + ',' + CFG.colors.contour[3] + ')';
      ctx.lineWidth = 0.6;
      var step = CFG.contourStep;

      // Horizontal contour segments
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols - 1; x++) {
          var a = terrainGrid[y * cols + x];
          var b = terrainGrid[y * cols + x + 1];
          var aB = Math.floor(a / step);
          var bB = Math.floor(b / step);
          if (aB !== bB) {
            var t = (aB * step + step - a) / (b - a || 1);
            var px = (x + t) * cs;
            var py = y * chH;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px, py + chH);
            ctx.stroke();
          }
        }
      }
      // Vertical contour segments
      for (var x = 0; x < cols; x++) {
        for (var y = 0; y < rows - 1; y++) {
          var a = terrainGrid[y * cols + x];
          var b = terrainGrid[(y + 1) * cols + x];
          var aB = Math.floor(a / step);
          var bB = Math.floor(b / step);
          if (aB !== bB) {
            var t = (aB * step + step - a) / (b - a || 1);
            var px = x * cs;
            var py = (y + t) * chH;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + cs, py);
            ctx.stroke();
          }
        }
      }
    }
  }

  // ============================================================
  // HEIGHT → COLOR MAPPING
  // ============================================================
  // Continuous gradient with named bands. As height increases,
  // color shifts from water-blue to deep green to tan to grey
  // to snow-white. The bands are blended so there are no harsh
  // transitions.
  // ============================================================
  function colorForHeight(h) {
    var stops = [
      [0.00, [ 60,  90, 120]],   // deep water
      [0.06, [ 80, 120, 150]],   // shallow water
      [0.10, [ 90, 115,  95]],   // marsh
      [0.18, [ 92, 118,  78]],   // lowland grass
      [0.32, [108, 130,  82]],   // plains
      [0.45, [126, 138,  98]],   // rolling hills
      [0.55, [148, 148, 108]],   // steep hills
      [0.65, [172, 165, 128]],   // foothills
      [0.75, [195, 185, 155]],   // rocky mountains
      [0.85, [215, 210, 200]],   // high peaks
      [0.95, [240, 240, 240]]    // snow
    ];

    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i];
      var b = stops[i + 1];
      if (h >= a[0] && h <= b[0]) {
        var t = (h - a[0]) / (b[0] - a[0]);
        t = t * t * (3 - 2 * t);   // smoothstep
        return [
          Math.round(a[1][0] + (b[1][0] - a[1][0]) * t),
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * t),
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * t)
        ];
      }
    }
    return h < 0 ? stops[0][1] : stops[stops.length - 1][1];
  }

  // ============================================================
  // HEIGHT → COLOR MAPPING
  // ============================================================
  // Continuous gradient with named bands. As height increases,
  // color shifts from water-blue to deep green to tan to grey
  // to snow-white. The bands are blended so there are no harsh
  // transitions.
  // ============================================================
  

  // ============================================================
  // RENDER — STREETS
  // ============================================================
  function drawStreets(ctx, camera) {
    if (camera.zoom < CFG.roadMinZoom) return;
    var segs = buildStreetNetwork();
    var W = 1400, H = 1000;

    // Sort: minor streets first, highways later so highways draw on top
    var minor = [], major = [];
    for (var i = 0; i < segs.length; i++) {
      if (segs[i].highway) major.push(segs[i]);
      else minor.push(segs[i]);
    }

    ctx.lineCap = 'round';

    // Minor streets
    ctx.strokeStyle = 'rgba(' +
      CFG.colors.street[0] + ',' + CFG.colors.street[1] + ',' +
      CFG.colors.street[2] + ',' + CFG.colors.street[3] + ')';
    ctx.lineWidth = 1.1 / camera.zoom;
    ctx.beginPath();
    for (var i = 0; i < minor.length; i++) {
      var s = minor[i];
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    // Highways
    ctx.strokeStyle = 'rgba(' +
      CFG.colors.highway[0] + ',' + CFG.colors.highway[1] + ',' +
      CFG.colors.highway[2] + ',' + CFG.colors.highway[3] + ')';
    ctx.lineWidth = 2.4 / camera.zoom;
    ctx.beginPath();
    for (var i = 0; i < major.length; i++) {
      var s = major[i];
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }

  // ============================================================
  // RENDER — PLACES
  // ============================================================
  function drawPlaces(ctx, camera) {
    if (camera.zoom < CFG.labelMinZoom) return;
    var W = 1400, H = 1000;

    for (var i = 0; i < PLACES.length; i++) {
      var p = PLACES[i];
      // Skip hamlets unless we're really zoomed in
      if (p.size === 0 && camera.zoom < CFG.smallLabelMinZoom) continue;

      var px = p.x * W;
      var py = p.y * H;

      // Dot
      var r = p.size === 2 ? 3 : (p.size === 1 ? 2 : 1.5);
      ctx.fillStyle = '#f0e8d8';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.font = (p.size === 2 ? 'bold 11px' : (p.size === 1 ? '10px' : '9px')) + ' monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      var text = p.name;
      var tw = ctx.measureText(text).width;
      var lx = px + r + 4;
      var ly = py;

      ctx.fillStyle = CFG.colors.labelBg;
      ctx.fillRect(lx - 2, ly - 7, tw + 6, 14);
      ctx.fillStyle = p.size === 2 ? CFG.colors.labelFg : CFG.colors.labelMinor;
      ctx.fillText(text, lx, ly + 1);
    }
  }

  // ============================================================
  // RENDER — PROVINCE BORDERS (replaces solid black)
  // ============================================================
  function drawProvinceBorders(ctx, provinceGrid, cols, rows, W, H) {
    var cw = W / cols;
    var ch = H / rows;

    ctx.strokeStyle = CFG.colors.provBorder;
    ctx.lineWidth = 0.7;

    ctx.beginPath();
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var owner = provinceGrid[y][x].owner;
        // <<< RB ADD: 'neutral' guard removed — nothing is neutral anymore,
        //             so borders now draw around rb provinces too.
        if (x + 1 < cols && provinceGrid[y][x + 1].owner !== owner) {
          ctx.moveTo((x + 1) * cw, y * ch);
          ctx.lineTo((x + 1) * cw, (y + 1) * ch);
        }
        if (y + 1 < rows && provinceGrid[y + 1][x].owner !== owner) {
          ctx.moveTo(x * cw, (y + 1) * ch);
          ctx.lineTo((x + 1) * cw, (y + 1) * ch);
        }
      }
    }
    ctx.stroke();
  }

  // ============================================================
  // RENDER — FRONT LINE (thick glowing stripe)
  // ============================================================
  function drawFront(ctx, frontLines, camera) {
    if (!frontLines || frontLines.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer glow
    ctx.strokeStyle = CFG.colors.frontGlow;
    ctx.lineWidth = 9 / camera.zoom;
    ctx.beginPath();
    for (var i = 0; i < frontLines.length; i++) {
      var s = frontLines[i];
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    // Middle yellow
    ctx.strokeStyle = 'rgba(255, 220, 90, 1)';
    ctx.lineWidth = 5 / camera.zoom;
    ctx.beginPath();
    for (var i = 0; i < frontLines.length; i++) {
      var s = frontLines[i];
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    // Inner red
    ctx.strokeStyle = CFG.colors.frontCore;
    ctx.lineWidth = 2.5 / camera.zoom;
    ctx.beginPath();
    for (var i = 0; i < frontLines.length; i++) {
      var s = frontLines[i];
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    ctx.restore();
  }

  // ============================================================
  // RENDER — RAILWAY (proper double-track)
  // ============================================================
  function drawRailway(ctx, railway, camera) {
    if (!railway || !railway.points || railway.points.length < 2) return;

    // 1. Dark ballast
    ctx.strokeStyle = 'rgb(' +
      CFG.colors.railBase[0] + ',' + CFG.colors.railBase[1] + ',' +
      CFG.colors.railBase[2] + ')';
    ctx.lineWidth = 8 / camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < railway.points.length; i++) {
      if (i === 0) ctx.moveTo(railway.points[i].x, railway.points[i].y);
      else ctx.lineTo(railway.points[i].x, railway.points[i].y);
    }
    ctx.stroke();

    // 2. Ties — small perpendicular ticks
    ctx.strokeStyle = 'rgb(' +
      CFG.colors.railTie[0] + ',' + CFG.colors.railTie[1] + ',' +
      CFG.colors.railTie[2] + ')';
    ctx.lineWidth = 1.4 / camera.zoom;
    var tieSpacing = 10;
    for (var i = 1; i < railway.points.length; i++) {
      var a = railway.points[i - 1];
      var b = railway.points[i];
      var dx = b.x - a.x, dy = b.y - a.y;
      var seg = Math.hypot(dx, dy);
      var steps = Math.max(1, Math.floor(seg / tieSpacing));
      for (var s = 0; s <= steps; s++) {
        var t = s / steps;
        var px = a.x + dx * t;
        var py = a.y + dy * t;
        var nlen = seg || 1;
        var nx = -dy / nlen;
        var ny = dx / nlen;
        ctx.beginPath();
        ctx.moveTo(px - nx * 4, py - ny * 4);
        ctx.lineTo(px + nx * 4, py + ny * 4);
        ctx.stroke();
      }
    }

    // 3. Two parallel rails
    ctx.strokeStyle = 'rgba(' +
      CFG.colors.railTrack[0] + ',' + CFG.colors.railTrack[1] + ',' +
      CFG.colors.railTrack[2] + ',' + CFG.colors.railTrack[3] + ')';
    ctx.lineWidth = 1.2 / camera.zoom;
    for (var side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      for (var i = 0; i < railway.points.length; i++) {
        var p = railway.points[i];
        var prev = railway.points[Math.max(0, i - 1)];
        var next = railway.points[Math.min(railway.points.length - 1, i + 1)];
        var dx = next.x - prev.x, dy = next.y - prev.y;
        var len = Math.hypot(dx, dy) || 1;
        var ox = -dy / len * 2.5 * side;
        var oy = dx / len * 2.5 * side;
        if (i === 0) ctx.moveTo(p.x + ox, p.y + oy);
        else ctx.lineTo(p.x + ox, p.y + oy);
      }
      ctx.stroke();
    }
  }

  // ============================================================
  // RENDER — RIVERS (with bank and highlight)
  // ============================================================
  function drawRivers(ctx, rivers, camera) {
    for (var r = 0; r < rivers.length; r++) {
      var pts = rivers[r].points;
      var w = rivers[r].width;

      // Bank
      ctx.strokeStyle = 'rgb(' +
        CFG.colors.riverBank[0] + ',' + CFG.colors.riverBank[1] + ',' +
        CFG.colors.riverBank[2] + ')';
      ctx.lineWidth = (w + 4) / 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      // Fill
      ctx.strokeStyle = 'rgb(' +
        CFG.colors.riverFill[0] + ',' + CFG.colors.riverFill[1] + ',' +
        CFG.colors.riverFill[2] + ')';
      ctx.lineWidth = w;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      // Highlight down the middle
      ctx.strokeStyle = 'rgba(' +
        CFG.colors.riverHi[0] + ',' + CFG.colors.riverHi[1] + ',' +
        CFG.colors.riverHi[2] + ',' + CFG.colors.riverHi[3] + ')';
      ctx.lineWidth = Math.max(1, w * 0.35);
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
  }

  // ============================================================
  // PUBLIC DRAW HOOK
  // ============================================================
  // BattleMap's own draw() is replaced entirely by this function.
  // We re-read the internal state from BattleMap's accessors.
  function draw() {
    var map = BM();
    if (!map) return;
    var ctx = map.getCtx();
    var canvas = map.getCanvas();
    var camera = map.getCamera();

    if (!ctx || !canvas) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;

    // Clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Camera transform
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    var W = map.CFG.W, H = map.CFG.H;
    var cols = map.CFG.TERRAIN_COLS, rows = map.CFG.TERRAIN_ROWS;
    var pcols = map.CFG.PROV_COLS, prows = map.CFG.PROV_ROWS;

    var terrainGrid = map.getTerrainGrid();
    var provinceGrid = map.getProvinceGrid();
    var cities = map.getCities();

    // 1. Terrain with shading and contours
    if (terrainGrid) drawTerrain(ctx, canvas, camera, terrainGrid, W, H, cols, rows);

    // 2. Streets
    drawStreets(ctx, camera);

    // 3. Railway
    // (we don't have a direct getter, so we draw from the visible map data)
    if (map._railway) drawRailway(ctx, map._railway, camera);

    // 4. Rivers
    if (map._rivers) drawRivers(ctx, map._rivers, camera);

    // 5. Province ownership overlay (soft tinted, not solid)
    drawOwnershipOverlay(ctx, provinceGrid, pcols, prows, W, H);

    // 6. Province borders
    drawProvinceBorders(ctx, provinceGrid, pcols, prows, W, H);

    // 7. Place labels
    drawPlaces(ctx, camera);

    // 8. City dots (the important ones)
    drawCities(ctx, cities);

    ctx.restore();

    // 9. HUD (screen space) — bottom hint and title bar
    drawHUD(ctx, w, h, camera, map);

    // 10. Units, front line, combat markers — hand off to existing modules
    if (window.BattleUnits && typeof window.BattleUnits.draw === 'function'
        && window.BattleUnits.getUnits().length > 0) {
      try { window.BattleUnits.draw(); }
      catch (e) { console.error('[terrain_visual] units draw failed:', e.message); }
    }

    if (window.BattleFront) {
      // Front line
      if (window.BattleFront.getFrontLines) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);
        drawFront(ctx, window.BattleFront.getFrontLines(), camera);
        ctx.restore();
      }
      // Combat markers
      try { window.BattleFront.draw(); }
      catch (e) { console.error('[terrain_visual] front draw failed:', e.message); }
    }
  }

  // Ownership overlay — soft translucent tint, so the terrain shows through
  function drawOwnershipOverlay(ctx, provinceGrid, cols, rows, W, H) {
    var cw = W / cols, ch = H / rows;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var owner = provinceGrid[y][x].owner;
        // <<< RB ADD start — paint zmp / bl / rb; skip only if truly unknown
        if (owner === 'zmp')      ctx.fillStyle = 'rgba(40, 110, 40, 0.32)';
        else if (owner === 'bl')  ctx.fillStyle = 'rgba(15, 15, 15, 0.45)';
        else if (owner === 'rb')  ctx.fillStyle = 'rgba(120, 20, 20, 0.32)';
        else continue;
        // <<< RB ADD end
        ctx.fillRect(x * cw, y * ch, cw, ch);
      }
    }
  }

  // City markers
  function drawCities(ctx, cities) {
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      // <<< RB ADD: rb ring colour added
      var ring = c.side === 'zmp' ? '#4dbf4d'
               : c.side === 'bl' ? '#c03030'
               : c.side === 'rb' ? '#e08080'
               : c.isVictory ? '#ffd700'
               : '#d8cfa8';

      var r = c.isHQ ? 12 : (c.isVictory ? 10 : 8);

      // Dark halo
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#e8dcc0';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = ring;
      ctx.stroke();

      // Label
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      var label = c.name;
      var tw = ctx.measureText(label).width;
      var ly = c.y - r - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(c.x - tw / 2 - 4, ly - 12, tw + 8, 13);
      ctx.fillStyle = ring;
      ctx.fillText(label, c.x, ly);
    }
  }

  // HUD
  function drawHUD(ctx, w, h, camera, map) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, w, 26);
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8dcc0';
    // <<< RB ADD: title updated to include RED+IIA
    ctx.fillText('THE LUKAVAC VALLEY — ZMP (green) vs BLACK LEAGUE (black) vs RED+IIA (red)', 10, 13);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 22, w, 22);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ddd';
    ctx.fillText('WASD: pan   •   Wheel: zoom   •   Right-click: move   •   Left-drag: select', 10, h - 11);
  }

  // ============================================================
  // BOOT
  // ============================================================
  // Copy the internal rivers/railway onto BattleMap so we can
  // reach them from here (BattleMap's own draw() hides them).
  function stealMapRefs() {
    var map = BM();
    if (!map) return;
    // BattleMap doesn't currently expose rivers/railway, but
    // the private variables are accessible via the closure only.
    // We instead rebuild them here from the same algorithm
    // and coordinates — matching battle_map.js exactly.

    // Rivers
    var W = map.CFG.W, H = map.CFG.H;
    var MERGE_X = 0.62 * W;
    var MERGE_Y = 0.55 * H;

    var r1 = [];
    for (var i = 0; i <= 60; i++) {
      var t = i / 60, rx, ry;
      if (t < 0.65) {
        var tt = t / 0.65;
        rx = 0.42 * W + (MERGE_X - 0.42 * W) * tt + Math.sin(tt * 3.0) * 15;
        ry = 0.03 * H + (MERGE_Y - 0.03 * H) * tt;
      } else {
        var tt = (t - 0.65) / 0.35;
        rx = MERGE_X + Math.sin(tt * 2.0) * 12;
        ry = MERGE_Y + (1.05 * H - MERGE_Y) * tt;
      }
      r1.push({ x: rx, y: ry });
    }
    var r2 = [];
    for (var i = 0; i <= 60; i++) {
      var t = i / 60, rx, ry;
      if (t < 0.65) {
        var tt = t / 0.65;
        rx = 0.88 * W + (MERGE_X - 0.88 * W) * tt + Math.sin(tt * 4.0 + 1.2) * 15;
        ry = 0.03 * H + (MERGE_Y - 0.03 * H) * tt;
      } else {
        var tt = (t - 0.65) / 0.35;
        rx = MERGE_X + Math.sin(tt * 2.0) * 12;
        ry = MERGE_Y + (1.05 * H - MERGE_Y) * tt;
      }
      r2.push({ x: rx, y: ry });
    }
    map._rivers = [
      { points: r1, width: 14 },
      { points: r2, width: 12 }
    ];

    // Railway
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var t = i / 40;
      var rx = 0.58 * W + Math.sin(t * 5.0) * 18;
      var ry = t * H;
      pts.push({ x: rx, y: ry });
    }
    map._railway = { points: pts, width: 6 };
  }

  function init() {
    var map = BM();
    if (!map) {
      console.error('[terrain_visual] BattleMap not loaded');
      return;
    }
    stealMapRefs();

    // Override BattleMap's draw with ours
    map._originalDraw = map._originalDraw || (function () {});
    // Since we can't access the private draw(), we hook the module
    // by wrapping the requestAnimationFrame tick. The simplest way:
    // replace BattleMap.draw entirely.
    // (The BattleMap API doesn't export draw() so we expose ours.)
    map.__terrainVisualDraw = draw;

    console.log('[terrain_visual] initialised — new drawer registered.');
  }

  return {
    CFG: CFG,
    PLACES: PLACES,
    init: init,
    draw: draw
  };
})();