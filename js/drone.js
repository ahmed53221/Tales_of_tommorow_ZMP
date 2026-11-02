// battle_drones.js — File 9: ZMP drone warfare (v2)
// ============================================================
// ZMP has 10 drones. The Black League has none.
//
// Each drone is a real entity on the map:
//   - Recon drones reveal fog of war over a radius
//   - Strike drones attack ground targets on command
//   - Drones return to the ZMP city they launched from
//   - Cooldown between strikes
//
// UI:
//   - Press R to enter "recon mode"  — click map to send a drone
//   - Press T to enter "strike mode" — click an enemy to bomb it
//   - Press Esc to cancel
//
// Exposes: window.BattleDrones
// ============================================================

window.BattleDrones = (function () {
  'use strict';

  function BM() { return window.BattleMap; }
  function BU() { return window.BattleUnits; }
  function BF() { return window.BattleFront; }

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    totalDrones: 10,

    // Recon
    reconRadius: 260,
    reconDuration: 20,
    reconSpeed: 180,

    // Strike
    strikeRange: 550,           // reach from nearest ZMP city
    strikeDamage: 55,
    strikeSplashRadius: 60,
    strikeCooldown: 8,
    strikeSpeed: 220,

    // Flight
    returnToBaseSpeed: 200,
    baseRadius: 30,

    // Visual
    droneSize: 6,
    trailLength: 12
  };

  // ============================================================
  // STATE
  // ============================================================
  var drones = [];
  var baseX = 0, baseY = 0;   // ZMP HQ, used as fallback home
  var nextDroneId = 1;
  var selectedMode = null;    // 'recon' | 'strike' | null
  var lastStrikeTime = -999;
  var log = [];

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    var hq = BM().getCities().find(function (c) { return c.id === 'zmp_hq'; });
    if (!hq) {
      console.error('[drones] no ZMP HQ found');
      return;
    }
    baseX = hq.x;
    baseY = hq.y;

    drones = [];
    nextDroneId = 1;

    for (var i = 0; i < CFG.totalDrones; i++) {
      drones.push(makeDrone(i));
    }

    selectedMode = null;
    lastStrikeTime = -999;
    log = [];

    setupInput();

    console.log('[drones] initialised. ' + drones.length + ' drones ready.');
  }

  function makeDrone(i) {
    return {
      id: 'drone_' + (nextDroneId++),
      x: baseX + (Math.random() - 0.5) * 40,
      y: baseY + (Math.random() - 0.5) * 40,
      state: 'idle',          // 'idle' | 'flying' | 'loitering' | 'returning'
      mission: null,          // 'recon' | 'strike'
      targetX: 0, targetY: 0,
      targetUnitId: null,
      loiterTimer: 0,
      trail: [],
      homeBase: null,         // { x, y, name } — where to return
      hue: 140 + (i % 4) * 15,
      bobPhase: Math.random() * Math.PI * 2
    };
  }

  // ============================================================
  // INPUT
  // ============================================================
  function setupInput() {
    var canvas = BM().getCanvas();

    window.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;

      if (e.code === 'KeyR') {
        selectedMode = (selectedMode === 'recon') ? null : 'recon';
        addLog(selectedMode === 'recon'
          ? 'Recon mode: click map to send a drone'
          : 'Recon mode cancelled');
        updateCursor();
      } else if (e.code === 'KeyT') {
        selectedMode = (selectedMode === 'strike') ? null : 'strike';
        addLog(selectedMode === 'strike'
          ? 'Strike mode: click an enemy division'
          : 'Strike mode cancelled');
        updateCursor();
      } else if (e.code === 'Escape') {
        selectedMode = null;
        updateCursor();
      }
    });

    canvas.addEventListener('click', function (e) {
      if (!selectedMode) return;

      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      var world = BM().screenToWorld(sx, sy);

      if (selectedMode === 'recon') {
        orderRecon(world.x, world.y);
      } else if (selectedMode === 'strike') {
        orderStrike(world.x, world.y);
      }
    });
  }

  function updateCursor() {
    var canvas = BM().getCanvas();
    if (!canvas) return;
    if (selectedMode === 'recon')      canvas.style.cursor = 'crosshair';
    else if (selectedMode === 'strike') canvas.style.cursor = 'cell';
    else                                canvas.style.cursor = 'default';
  }

  // ============================================================
  // LAUNCH BASE LOOKUP
  // ============================================================
  function findNearestZmpCity(wx, wy) {
    var cities = BM().getCities();
    var best = null, bestDist = Infinity;
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      if (c.side !== 'zmp') continue;
      var d = Math.hypot(c.x - wx, c.y - wy);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  // ============================================================
  // DRONE LOOKUP
  // ============================================================
  function findIdleDrone() {
    for (var i = 0; i < drones.length; i++) {
      if (drones[i].state === 'idle') return drones[i];
    }
    return null;
  }

  function findIdleDroneNear(x, y) {
    var best = null, bestDist = Infinity;
    for (var i = 0; i < drones.length; i++) {
      if (drones[i].state !== 'idle') continue;
      var d = Math.hypot(drones[i].x - x, drones[i].y - y);
      if (d < bestDist) { bestDist = d; best = drones[i]; }
    }
    return best;
  }

  function countIdleNear(x, y, radius) {
    var n = 0;
    for (var i = 0; i < drones.length; i++) {
      if (drones[i].state !== 'idle') continue;
      if (Math.hypot(drones[i].x - x, drones[i].y - y) < radius) n++;
    }
    return n;
  }

  // ============================================================
  // ORDERS
  // ============================================================
  function orderRecon(wx, wy) {
    var launchCity = findNearestZmpCity(wx, wy);
    if (!launchCity) {
      addLog('No ZMP-controlled city available as launch base.');
      return;
    }

    var drone = findIdleDroneNear(launchCity.x, launchCity.y);
    if (!drone) {
      addLog('No drones available for recon.');
      return;
    }

    // Reposition drone at the launch city
    drone.x = launchCity.x + (Math.random() - 0.5) * 30;
    drone.y = launchCity.y + (Math.random() - 0.5) * 30;

    drone.state = 'flying';
    drone.mission = 'recon';
    drone.targetX = wx;
    drone.targetY = wy;
    drone.loiterTimer = CFG.reconDuration;
    drone.trail = [];
    drone.homeBase = { x: launchCity.x, y: launchCity.y, name: launchCity.name };

    addLog('Recon drone launched from ' + launchCity.name);
    selectedMode = null;
    updateCursor();
  }

  function orderStrike(wx, wy) {
    // Cooldown
    var now = performance.now() / 1000;
    if (now - lastStrikeTime < CFG.strikeCooldown) {
      addLog('Strike cooldown: ' + Math.ceil(CFG.strikeCooldown - (now - lastStrikeTime)) + 's');
      return;
    }

    // Find nearest enemy unit to the click
    var units = BU().getUnits();
    var best = null, bestDist = 60;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== 'bl' || u.alive === false) continue;
      var d = Math.hypot(u.x - wx, u.y - wy);
      if (d < bestDist) { bestDist = d; best = u; }
    }
    if (!best) {
      addLog('No enemy division near the click.');
      return;
    }

    // Find launch city near the target
    var launchCity = findNearestZmpCity(best.x, best.y);
    if (!launchCity) {
      addLog('No ZMP-controlled city in range to launch from.');
      return;
    }

    var rangeFromCity = Math.hypot(best.x - launchCity.x, best.y - launchCity.y);
    if (rangeFromCity > CFG.strikeRange) {
      addLog('Target out of range from ' + launchCity.name + ' (' +
             Math.round(rangeFromCity) + ' > ' + CFG.strikeRange + ')');
      return;
    }

    var drone = findIdleDroneNear(launchCity.x, launchCity.y);
    if (!drone) {
      addLog('No drones available for strike.');
      return;
    }

    // Reposition drone at the launch city
    drone.x = launchCity.x + (Math.random() - 0.5) * 30;
    drone.y = launchCity.y + (Math.random() - 0.5) * 30;

    drone.state = 'flying';
    drone.mission = 'strike';
    drone.targetX = best.x;
    drone.targetY = best.y;
    drone.targetUnitId = best.id;
    drone.trail = [];
    drone.homeBase = { x: launchCity.x, y: launchCity.y, name: launchCity.name };

    lastStrikeTime = now;
    var tName = BU().UNIT_TYPES[best.typeId] ? BU().UNIT_TYPES[best.typeId].name : 'enemy';
    addLog('Strike ordered on ' + tName + ' from ' + launchCity.name);

    selectedMode = null;
    updateCursor();
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    for (var i = 0; i < drones.length; i++) {
      updateDrone(drones[i], dt);
    }
  }

  function updateDrone(d, dt) {
    var speed;
    if (d.state === 'returning')        speed = CFG.returnToBaseSpeed;
    else if (d.mission === 'strike')    speed = CFG.strikeSpeed;
    else                                speed = CFG.reconSpeed;

    // Trail
    d.trail.push({ x: d.x, y: d.y });
    if (d.trail.length > CFG.trailLength) d.trail.shift();

    if (d.state === 'idle') return;

    if (d.state === 'flying') {
      var dx = d.targetX - d.x;
      var dy = d.targetY - d.y;
      var dist = Math.hypot(dx, dy);

      if (dist < 8) {
        if (d.mission === 'recon') {
          d.state = 'loitering';
          d.loiterTimer = CFG.reconDuration;
        } else if (d.mission === 'strike') {
          executeStrike(d);
          d.state = 'returning';
          var homeX = d.homeBase ? d.homeBase.x : baseX;
          var homeY = d.homeBase ? d.homeBase.y : baseY;
          d.targetX = homeX;
          d.targetY = homeY;
        }
      } else {
        var step = Math.min(dist, speed * dt);
        d.x += (dx / dist) * step;
        d.y += (dy / dist) * step;
      }

    } else if (d.state === 'loitering') {
      d.loiterTimer -= dt;

      // Slow circle around the loiter point
      var ang = (performance.now() / 1000) * 1.2;
      d.x = d.targetX + Math.cos(ang) * 20;
      d.y = d.targetY + Math.sin(ang) * 20;

      if (d.loiterTimer <= 0) {
        d.state = 'returning';
        var homeX2 = d.homeBase ? d.homeBase.x : baseX;
        var homeY2 = d.homeBase ? d.homeBase.y : baseY;
        d.targetX = homeX2;
        d.targetY = homeY2;
      }

    } else if (d.state === 'returning') {
      var homeX3 = d.homeBase ? d.homeBase.x : baseX;
      var homeY3 = d.homeBase ? d.homeBase.y : baseY;
      var dx2 = homeX3 - d.x;
      var dy2 = homeY3 - d.y;
      var dist2 = Math.hypot(dx2, dy2);

      if (dist2 < CFG.baseRadius) {
        d.state = 'idle';
        d.mission = null;
        d.homeBase = null;
        d.x = homeX3 + (Math.random() - 0.5) * 40;
        d.y = homeY3 + (Math.random() - 0.5) * 40;
      } else {
        var step2 = Math.min(dist2, speed * dt);
        d.x += (dx2 / dist2) * step2;
        d.y += (dy2 / dist2) * step2;
      }
    }
  }

  // ============================================================
  // STRIKE EXECUTION
  // ============================================================
  function executeStrike(d) {
    var units = BU().getUnits();
    var hitAny = false;

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.side !== 'bl' || u.alive === false) continue;
      var dist = Math.hypot(u.x - d.targetX, u.y - d.targetY);
      if (dist > CFG.strikeSplashRadius) continue;

      var falloff = 1 - (dist / CFG.strikeSplashRadius);
      var dmg = CFG.strikeDamage * (0.5 + falloff * 0.5);

      u.hp -= dmg;
      u.org = Math.max(0, u.org - 25 * falloff);
      hitAny = true;

      if (u.hp <= 0 && u.alive !== false) {
        u.alive = false;
        u.hp = 0;
        var tName = BU().UNIT_TYPES[u.typeId] ? BU().UNIT_TYPES[u.typeId].name : 'enemy';
        addLog('Drone strike destroyed ' + tName);
      }
    }

    if (!hitAny) {
      addLog('Drone strike hit empty ground.');
    } else {
      addLog('Drone strike scored hits.');
    }
  }

  // ============================================================
  // FOG OF WAR HOOK
  // ============================================================
  function isRevealedTo(worldX, worldY) {
    for (var i = 0; i < drones.length; i++) {
      var d = drones[i];
      if (d.state === 'loitering' || d.state === 'flying') {
        if (Math.hypot(d.x - worldX, d.y - worldY) < CFG.reconRadius) return true;
      }
    }
    return false;
  }

  // ============================================================
  // RENDER
  // ============================================================
  function draw() {
    var ctx = BM().getCtx();
    var canvas = BM().getCanvas();
    var camera = BM().getCamera();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.save();
    ctx.translate(canvas.width / (2 * dpr), canvas.height / (2 * dpr));
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // --- Launch pads at every ZMP city ---
    var cities = BM().getCities();
    for (var ci = 0; ci < cities.length; ci++) {
      var c = cities[ci];
      if (c.side !== 'zmp') continue;

      // Pulsing dashed ring
      var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 600);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 22, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 220, 255, ' + (0.35 + pulse * 0.25) + ')';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Idle drone count near this city
      var idleHere = countIdleNear(c.x, c.y, 60);

      ctx.fillStyle = 'rgba(120, 220, 255, 0.9)';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(idleHere + '/' + CFG.totalDrones, c.x, c.y - 32);
    }

    // --- Recon bubbles for loitering drones ---
    for (var k = 0; k < drones.length; k++) {
      var d = drones[k];
      if (d.state === 'loitering') {
        var pulse2 = 0.5 + 0.5 * Math.sin(performance.now() / 300);
        ctx.beginPath();
        ctx.arc(d.x, d.y, CFG.reconRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120, 220, 255, ' + (0.25 + pulse2 * 0.15) + ')';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(120, 220, 255, 0.05)';
        ctx.fill();
      }
    }

    // --- Drones ---
    for (var j = 0; j < drones.length; j++) {
      drawDrone(ctx, drones[j], camera);
    }

    ctx.restore();

    // --- Screen-space mode indicator ---
    if (selectedMode) {
      drawModeIndicator(canvas.width / dpr, canvas.height / dpr);
    }
  }

  function drawDrone(ctx, d, camera) {
    // Trail
    if (d.trail.length > 1) {
      ctx.beginPath();
      for (var i = 0; i < d.trail.length; i++) {
        var t = d.trail[i];
        if (i === 0) ctx.moveTo(t.x, t.y);
        else ctx.lineTo(t.x, t.y);
      }
      var alpha = (d.state === 'loitering') ? 0.15 : 0.4;
      ctx.strokeStyle = 'rgba(150, 220, 255, ' + alpha + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Bobbing
    var bob = Math.sin(performance.now() / 200 + d.bobPhase) * 1.5;
    var size = CFG.droneSize;

    ctx.save();
    ctx.translate(d.x, d.y + bob);

    // Shadow
    ctx.beginPath();
    ctx.arc(1, 3, size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // Glow
    var glowColor = (d.mission === 'strike')
      ? 'rgba(255, 100, 100, 0.5)'
      : 'rgba(120, 220, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(0, 0, size + 3, 0, Math.PI * 2);
    ctx.fillStyle = glowColor;
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    var bodyColor = (d.mission === 'strike') ? '#ff6060' : '#7fdcff';
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.restore();
  }

  function drawModeIndicator(w, h) {
    var text = (selectedMode === 'recon')
      ? 'RECON MODE — click map to launch drone'
      : 'STRIKE MODE — click an enemy division to strike';
    var color = (selectedMode === 'strike') ? '#ff6060' : '#7fdcff';

    var ctx = BM().getCtx();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var tw = ctx.measureText(text).width;
    var cx = w / 2;
    var cy = 60;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(cx - tw / 2 - 14, cy - 16, tw + 28, 32);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - tw / 2 - 14, cy - 16, tw + 28, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  // ============================================================
  // ACCESSORS
  // ============================================================
  function addLog(msg) {
    log.push({ time: Math.round(performance.now() / 1000), msg: msg });
    if (log.length > 20) log.shift();
    console.log('[drones] ' + msg);
  }

  function getLog() { return log; }
  function getDrones() { return drones; }
  function getSelectedMode() { return selectedMode; }

  function shutdown() {
    drones = [];
    selectedMode = null;
    updateCursor();
  }

  return {
    CFG: CFG,
    init: init,
    update: update,
    draw: draw,
    shutdown: shutdown,
    isRevealedTo: isRevealedTo,
    getLog: getLog,
    getDrones: getDrones,
    getSelectedMode: getSelectedMode,
    orderRecon: orderRecon,
    orderStrike: orderStrike
  };
})();