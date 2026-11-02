
window.PutschMinigame = (function() {
  'use strict';

  var E = window.Engine;
  var BF = window.Battlefield;

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    mapW: 1400,
    mapH: 1000,
    dotSpacing: 26,
    attackSpeed: 0.9,
    groupMaxUnits: 12,
    capitalCaptureRadius: 90,
    captureTime: 3.0,
    goldPerSecond: 0.4,
    goldPerKill: 25,
    playerUnitAggroRange: 320,
    enemyUnitAggroRange: 440,
    enemyCapitalAggroRange: 600,
    enemyRepathInterval: 1.2,

    // Morale
    moraleMax: 100,
    moraleRegen: 4,
    moraleLossPerHit: 6,
    moraleLossPerKill: 12,
    moraleLossAllyDeath: 5,
    moraleBreakThreshold: 25,
    moraleRallyThreshold: 55,
    // Suppression
    suppressionMax: 100,
    suppressionDecay: 18,
    suppressionAccuracyPenalty: 0.35,
    suppressionMoralePenalty: 0.4,
    // Stamina
    staminaMax: 100,
    staminaDrainMoving: 3,
    staminaRegen: 6,
    staminaLowThreshold: 25,
    staminaExhaustedSpeedMul: 0.55,
    // Facing / flanking
    facingTurnRate: 6,
    rearAttackBonus: 1.5,
    flankAttackBonus: 1.25
  };

  // ============================================================
  // UNIT TYPES
  // ============================================================
  var UNIT_TYPES = {
    dzehurjaca: { name: 'Dzehurjaca', tag: 'DZH', hp: 130, dmg: 16, range: 30, cost: 220, speed: 115, isCavalry: true,
      colorFill: '#1f7a1f', colorRing: '#0a3a0a', colorCore: '#5fdf5f',
      desc: 'Elite Zalgrilian cavalry. Fast, hard-hitting, loves open ground.' },
    dragoon: { name: 'Dragoon', tag: 'DRG', hp: 110, dmg: 12, range: 38, cost: 260, speed: 90, isCavalry: true,
      colorFill: '#2f6f2f', colorRing: '#0a3a0a', colorCore: '#7fdf7f',
      desc: 'Mounted infantry. Versatile across all terrain.' },
    line: { name: 'Line Infantry', tag: 'LIN', hp: 100, dmg: 8, range: 30, cost: 100, speed: 55,
      colorFill: '#2a8f2a', colorRing: '#0a3a0a', colorCore: '#7fdf7f',
      desc: 'Standard infantry. Reliable everywhere.' },
    musket: { name: 'Musket Line', tag: 'MSK', hp: 90, dmg: 10, range: 55, cost: 150, speed: 55,
      colorFill: '#3aa03a', colorRing: '#0a3a0a', colorCore: '#9fef9f',
      desc: 'Volley fire. Deadly from heights, ruined by mud.' },
    sniper: { name: 'Snipers', tag: 'SNP', hp: 70, dmg: 14, range: 130, cost: 300, speed: 50,
      colorFill: '#0d5c0d', colorRing: '#052a05', colorCore: '#5fcf5f',
      desc: 'Long-range marksmen. Dominate peaks.' },
    artillery: { name: 'Artillery', tag: 'ART', hp: 60, dmg: 24, range: 210, cost: 400, speed: 30,
      colorFill: '#0a4a0a', colorRing: '#031a03', colorCore: '#4faf4f',
      desc: 'Siege gun. Terrifying from a hill, useless in mud.' },

    black_rider: { name: 'Black Rider', tag: 'BRD', hp: 140, dmg: 15, range: 30, cost: 240, speed: 95, isCavalry: true,
      colorFill: '#8a1010', colorRing: '#3a0505', colorCore: '#ff6060',
      desc: 'League cavalry.' },
    bl_line: { name: 'BL Infantry', tag: 'BIN', hp: 100, dmg: 8, range: 30, cost: 100, speed: 55,
      colorFill: '#cc2222', colorRing: '#5a0a0a', colorCore: '#ff7070',
      desc: 'Black League infantry.' },
    bl_musket: { name: 'BL Muskets', tag: 'BMS', hp: 90, dmg: 10, range: 55, cost: 150, speed: 55,
      colorFill: '#a81a1a', colorRing: '#4a0808', colorCore: '#ff6060',
      desc: 'Black League volley fire.' },
    bl_sniper: { name: 'BL Snipers', tag: 'BSN', hp: 70, dmg: 14, range: 130, cost: 300, speed: 50,
      colorFill: '#6a0808', colorRing: '#2a0303', colorCore: '#ff5050',
      desc: 'Black League marksmen.' }
  };

  // ============================================================
  // CAPITALS
  // ============================================================
  function buildCapitals() {
    return [
      { id: 'zmp_hq', name: 'ZMP HQ', side: 'player', ownerName: 'ZMP',
        x: 120, y: 880, hp: 220, maxHp: 220, r: 44,
        ringColor: '#0a3a0a', fillColor: '#1f7a1f', isHQ: true },
      { id: 'bl_hq', name: 'BL HQ', side: 'enemy', ownerName: 'Black League',
        x: 1280, y: 120, hp: 220, maxHp: 220, r: 44,
        ringColor: '#3a0505', fillColor: '#8a1010', isHQ: true },
      { id: 'science_wing', name: 'Science Wing', side: 'neutral', ownerName: 'Neutral',
        x: 320, y: 320, hp: 120, maxHp: 120, r: 30,
        ringColor: '#6a6a6a', fillColor: '#b0b0b0' },
      { id: 'library', name: 'Library', side: 'neutral', ownerName: 'Neutral',
        x: 700, y: 500, hp: 120, maxHp: 120, r: 30,
        ringColor: '#6a6a6a', fillColor: '#b0b0b0' },
      { id: 'gymnasium', name: 'Gymnasium', side: 'neutral', ownerName: 'Neutral',
        x: 1080, y: 700, hp: 120, maxHp: 120, r: 30,
        ringColor: '#6a6a6a', fillColor: '#b0b0b0' },
      { id: 'council', name: 'Council Chamber', side: 'neutral', ownerName: 'Neutral',
        x: 700, y: 880, hp: 160, maxHp: 160, r: 36,
        ringColor: '#8a6a00', fillColor: '#ffd700', isVictory: true }
    ];
  }

  // ============================================================
  // NEW GAME
  // ============================================================
  function newGame(st) {
    if (!st.paramilitaries) E.initParamilitaries(st);
    var dz = st.paramilitaries.dzehurjaca;
    var bl = st.paramilitaries.black_legion;

    var playerPower = Math.max(60, Math.round(E.calculateParamilitaryStrength(dz) * 0.8));
    var enemyPower = Math.max(80, Math.round(E.calculateParamilitaryStrength(bl) * 0.7));

    var seed = (Date.now() % 100000) + 1;
    var terrain = BF.generateTerrain(seed);
    var capitals = buildCapitals();
    var obstaclesData = BF.generateObstacles(terrain, seed, capitals);

    var game = {
      seed: seed,
      terrain: terrain,
      obstacles: obstaclesData.rocksAndTrees,
      rivers: obstaclesData.rivers, // Now an array of rivers

      playerPowerStart: playerPower,
      enemyPowerStart: enemyPower,
      playerPowerCurrent: playerPower,
      enemyPowerCurrent: enemyPower,
      gold: 2500,
      goldTimer: 0,
      enemyAutoSpawn: true,
      enemySpawnTimer: 0,
      enemyRepathTimer: 0,
      showAttackRange: false,
      units: [],
      capitals: capitals,
      selectedIds: [],
      projectiles: [],
      explosions: [],
      corpses: [],
      floatText: [],
      dragStart: null,
      dragEnd: null,
      mouse: { x: 0, y: 0 },
      time: 0,
      result: null,
      log: [],
      kills: 0,
      losses: 0,
      capturedCapitals: { player: 0, enemy: 0 },
      shake: { duration: 0, magnitude: 0 }
    };

    spawnPlayerArmy(game, playerPower);
    spawnEnemyArmy(game, enemyPower);
    repathEnemyArmy(game);
    return game;
  }

  // ============================================================
  // UNIT FACTORY
  // ============================================================
  function makeUnit(type, side, x, y) {
    var t = UNIT_TYPES[type];
    return {
      id: 'u' + (Math.random() * 1e9 | 0),
      type: type,
      side: side,
      x: x, y: y,
      hp: t.hp, maxHp: t.hp,
      dmg: t.dmg,
      range: t.range,
      speed: t.speed,

      // Movement
      targetX: x, targetY: y,
      orderX: x, orderY: y,

      // Combat
      attackCooldown: 0,
      alive: true,
      selected: false,
      currentTargetId: null,
      currentTargetType: null,

      // Facing (radians; 0 = east)
      facing: (side === 'player') ? -Math.PI * 0.25 : Math.PI * 0.75,

      // Morale / suppression / stamina
      morale: CFG.moraleMax,
      suppression: 0,
      stamina: CFG.staminaMax,
      broken: false,

      // Terrain cache (refreshed each tick)
      terrain: 'plain',
      terrainRules: { speed: 1, dmg: 1, defence: 1 }
    };
  }

  // ---------- Armies ----------
    // ============================================================
  // SPAWN ARMIES
  // ============================================================
  function spawnZmpArmy(playerStrength) {
    // ZMP starts in the west: HQ area + Kalajevo forward base + Danica.
    // Bigger army — 1.6x more divisions than before.

    var power = Math.max(40, playerStrength);
    var base = Math.round(power / 4);   // was /12 → 1.7x more

    // 1. Home guard around ZMP HQ (west)
    var hq = BM.getCities().find(function (c) { return c.id === 'zmp_hq'; });
    for (var i = 0; i < base; i++) {
      var type;
      if (i < 4) type = 'dzehurjaca';
      else if (i < 8) type = 'dragoon';
      else if (i < 14) type = 'line';
      else if (i < 18) type = 'musket';
      else if (i < 22) type = 'sniper';
      else if (i < 25) type = 'artillery';
      else type = 'line';
      var angle = (i / base) * Math.PI * 2;
      var r = 30 + (i % 5) * 16;
      var u = makeUnit(type, 'zmp', hq.x + Math.cos(angle) * r, hq.y + Math.sin(angle) * r);
      if (u) units.push(u);
    }

    // 2. Forward base at Kalajevo (central massif)
    var kal = BM.getCities().find(function (c) { return c.id === 'kalajevo'; });
    for (var i = 0; i < Math.max(4, Math.round(base * 0.35)); i++) {
      var type;
      if (i === 0) type = 'dzehurjaca';
      else if (i < 3) type = 'dragoon';
      else if (i < 6) type = 'line';
      else if (i < 8) type = 'musket';
      else type = 'line';
      var angle = (i / 6) * Math.PI * 2;
      var r = 26 + (i % 3) * 12;
      var u = makeUnit(type, 'zmp', kal.x + Math.cos(angle) * r, kal.y + Math.sin(angle) * r);
      if (u) units.push(u);
    }

    // 3. Danica garrison (central-east)
    var danica = BM.getCities().find(function (c) { return c.id === 'danica'; });
    for (var i = 0; i < Math.max(3, Math.round(base * 0.35)); i++) {
      var type = i === 0 ? 'dragoon' : (i < 2 ? 'sniper' : 'line');
      var angle = (i / 5) * Math.PI * 2;
      var r = 24 + (i % 2) * 12;
      var u = makeUnit(type, 'zmp', danica.x + Math.cos(angle) * r, danica.y + Math.sin(angle) * r);
      if (u) units.push(u);
    }
  }

  function spawnBlArmy(enemyStrength) {
    var power = Math.max(60, enemyStrength);
    var base = Math.round(power / 4);   // was /12 → 1.7x more

    // 1. Home guard around BL HQ (east)
    var hq = BM.getCities().find(function (c) { return c.id === 'bl_hq'; });
    for (var i = 0; i < base; i++) {
      var type;
      if (i < 4) type = 'black_rider';
      else if (i < 9) type = 'bl_line';
      else if (i < 13) type = 'bl_musket';
      else if (i < 16) type = 'bl_sniper';
      else if (i < 19) type = 'bl_artillery';
      else type = 'bl_line';
      var angle = (i / base) * Math.PI * 2;
      var r = 30 + (i % 5) * 16;
      var u = makeUnit(type, 'bl', hq.x + Math.cos(angle) * r, hq.y + Math.sin(angle) * r);
      if (u) units.push(u);
    }

    // 2. Forward garrison at Perkia (north-west plains, BL-aligned)
    var perkia = BM.getCities().find(function (c) { return c.id === 'perkia'; });
    for (var i = 0; i < Math.max(3, Math.round(base * 0.3)); i++) {
      var type = i < 2 ? 'black_rider' : (i < 4 ? 'bl_musket' : 'bl_line');
      var angle = (i / 5) * Math.PI * 2;
      var r = 24 + (i % 2) * 12;
      var u = makeUnit(type, 'bl', perkia.x + Math.cos(angle) * r, perkia.y + Math.sin(angle) * r);
      if (u) units.push(u);
    }
  }

  // ============================================================
  // INPUT
  // ============================================================
  function handleMouseDown(game, x, y, button) {
    if (button === 0) {
      game.dragStart = { x: x, y: y };
      game.dragEnd = { x: x, y: y };
    } else if (button === 2) {
      issueMoveOrder(game, x, y);
    }
  }

  function handleMouseMove(game, x, y) {
    game.mouse.x = x; game.mouse.y = y;
    if (game.dragStart) game.dragEnd = { x: x, y: y };
  }

  function handleMouseUp(game, x, y, button) {
    if (button !== 0 || !game.dragStart) return;
    var ds = game.dragStart, de = { x: x, y: y };
    var w = Math.abs(de.x - ds.x), h = Math.abs(de.y - ds.y);
    var rect = { x: Math.min(ds.x, de.x), y: Math.min(ds.y, de.y), w: w, h: h };

    var selected = [];
    if (w < 6 && h < 6) {
      var best = null, bestDist = 40;
      game.units.forEach(function(u) {
        if (!u.alive || u.side !== 'player') return;
        var d = Math.hypot(u.x - x, u.y - y);
        if (d < bestDist) { bestDist = d; best = u; }
      });
      if (best) selected.push(best.id);
    } else {
      game.units.forEach(function(u) {
        if (!u.alive || u.side !== 'player') return;
        if (u.x >= rect.x && u.x <= rect.x + rect.w && u.y >= rect.y && u.y <= rect.y + rect.h) {
          selected.push(u.id);
        }
      });
    }

    game.selectedIds = selected;
    game.units.forEach(function(u) { u.selected = false; });
    selected.forEach(function(id) {
      var u = game.units.find(function(x){ return x.id === id; });
      if (u) u.selected = true;
    });
    game.dragStart = null;
    game.dragEnd = null;
  }

  function issueMoveOrder(game, x, y) {
    var selected = game.units.filter(function(u) {
      return u.selected && u.alive && u.side === 'player';
    });
    if (selected.length === 0) return;

    var cavalry = selected.filter(function(u) { return UNIT_TYPES[u.type].isCavalry; });
    var infantry = selected.filter(function(u) { return !UNIT_TYPES[u.type].isCavalry; });

    var cSpacing = 32;
    var cOriginX = x - (cavalry.length - 1) * cSpacing / 2;
    cavalry.forEach(function(u, i) {
      u.orderX = cOriginX + i * cSpacing;
      u.orderY = y - 30;
      u.targetX = u.orderX;
      u.targetY = u.orderY;
      u.currentTargetId = null;
      u.currentTargetType = null;
      u.broken = false;
      u.morale = Math.max(u.morale, CFG.moraleBreakThreshold + 15);
    });

    var cols = Math.max(3, Math.ceil(Math.sqrt(infantry.length)));
    var spacing = CFG.dotSpacing;
    var originX = x - (cols - 1) * spacing / 2;
    infantry.forEach(function(u, i) {
      var cx = i % cols;
      var cy = Math.floor(i / cols);
      u.orderX = originX + cx * spacing;
      u.orderY = y + 20 + cy * spacing;
      u.targetX = u.orderX;
      u.targetY = u.orderY;
      u.currentTargetId = null;
      u.currentTargetType = null;
      u.broken = false;
      u.morale = Math.max(u.morale, CFG.moraleBreakThreshold + 15);
    });

    game.log.push('Order issued to ' + selected.length + ' units.');
  }

  // ============================================================
  // TARGETING
  // ============================================================
  function findNearestEnemyUnit(game, u, maxRange) {
    var enemySide = u.side === 'player' ? 'enemy' : 'player';
    var best = null, bestDist = maxRange;
    for (var i = 0; i < game.units.length; i++) {
      var o = game.units[i];
      if (!o.alive || o.side !== enemySide) continue;
      var d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < bestDist) { bestDist = d; best = o; }
    }
    return best;
  }

  function findNearestHostileCapital(game, u, maxRange) {
    var best = null, bestDist = maxRange;
    for (var i = 0; i < game.capitals.length; i++) {
      var c = game.capitals[i];
      if (c.side === u.side) continue;
      var d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  // ============================================================
  // ENEMY OBJECTIVE AI
  // ============================================================
  function repathEnemyArmy(game) {
    var council = game.capitals.find(function(c) { return c.id === 'council'; });
    var zmpHQ = game.capitals.find(function(c) { return c.id === 'zmp_hq'; });

    var primary = null;
    if (council && council.side !== 'enemy') primary = council;
    else if (zmpHQ && zmpHQ.side !== 'enemy') primary = zmpHQ;
    if (!primary) return;

    var enemyUnits = game.units.filter(function(u) { return u.alive && u.side === 'enemy'; });
    if (enemyUnits.length === 0) return;

    enemyUnits.sort(function(a, b) {
      var aCav = UNIT_TYPES[a.type].isCavalry ? 0 : 1;
      var bCav = UNIT_TYPES[b.type].isCavalry ? 0 : 1;
      return aCav - bCav;
    });

    var blHQ = game.capitals.find(function(c) { return c.id === 'bl_hq'; });
    var dirX = 1, dirY = -1;
    if (blHQ) {
      dirX = primary.x - blHQ.x;
      dirY = primary.y - blHQ.y;
      var len = Math.hypot(dirX, dirY);
      if (len > 0) { dirX /= len; dirY /= len; }
    }

    var cols = Math.max(3, Math.ceil(Math.sqrt(enemyUnits.length)));
    var spacing = 44;
    var stopDistance = 70;
    var startX = primary.x - dirX * stopDistance;
    var startY = primary.y - dirY * stopDistance;
    var perpX = -dirY;
    var perpY = dirX;

    for (var i = 0; i < enemyUnits.length; i++) {
      var u = enemyUnits[i];
      var row = Math.floor(i / cols);
      var col = i % cols;
      var lateral = (col - (cols - 1) / 2) * spacing;
      var behind = row * spacing;

      u.orderX = startX - dirX * behind + perpX * lateral;
      u.orderY = startY - dirY * behind + perpY * lateral;
      u.targetX = u.orderX;
      u.targetY = u.orderY;
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function refreshTerrain(game, u) {
    u.terrain = BF.classify(game.terrain, game.obstacles, game.rivers, u.x, u.y);
    u.terrainRules = BF.getRules(u.type, u.terrain);
  }

  function angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  // Flanking multiplier: attacker gets bonus if hitting from rear/side
  function flankingMultiplier(attacker, target) {
    // Direction the target is facing
    var tFacing = target.facing;
    // Direction from target to attacker
    var toAtt = Math.atan2(attacker.y - target.y, attacker.x - target.x);
    // How far off is the attacker from the target's forward arc?
    // If attacker is behind target, angle between facing and toAtt ~ PI.
    var diff = angleDiff(tFacing, toAtt);
    // diff ~ PI = attacker behind target = rear bonus
    // diff ~ PI/2 = attacker on flank
    if (diff > Math.PI * 0.75) return CFG.rearAttackBonus;
    if (diff > Math.PI * 0.4) return CFG.flankAttackBonus;
    return 1.0;
  }

  function addFloat(game, x, y, text, color) {
    game.floatText.push({ x: x, y: y, text: text, color: color, life: 1.4, maxLife: 1.4 });
  }

  function emitDeathParticles(game, unit) {
    var color = unit.side === 'player' ? '#5fdf5f' : '#ff6060';
    for (var k = 0; k < 6; k++) {
      game.explosions.push({
        x: unit.x, y: unit.y,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color: color,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        spark: true
      });
    }
    game.explosions.push({
      x: unit.x, y: unit.y,
      life: 0.6, maxLife: 0.6,
      color: '#ffd700',
      spark: true,
      vx: 0, vy: -60
    });
    // Corpse marker
    game.corpses.push({
      x: unit.x, y: unit.y,
      side: unit.side,
      type: unit.type,
      age: 0
    });
    // Cap corpse count
    if (game.corpses.length > 200) game.corpses.shift();
  }

  // ============================================================
  // SIMULATION TICK
  // ============================================================
  function update(game, dt) {
    if (game.result) return;
    game.time += dt;

    // Passive income
    game.goldTimer += dt;
    if (game.goldTimer >= 1) {
      var ticks = Math.floor(game.goldTimer);
      game.gold += ticks * CFG.goldPerSecond;
      game.goldTimer -= ticks;
    }

    // Enemy repath
    game.enemyRepathTimer += dt;
    if (game.enemyRepathTimer >= CFG.enemyRepathInterval) {
      game.enemyRepathTimer = 0;
      repathEnemyArmy(game);
    }

    // Shake decay
    if (game.shake.duration > 0) {
      game.shake.duration -= dt;
      if (game.shake.duration < 0) game.shake.duration = 0;
    }

    // ---- Refresh terrain classification once per unit ----
    for (var i = 0; i < game.units.length; i++) {
      if (game.units[i].alive) refreshTerrain(game, game.units[i]);
    }

    // ============================================================
    // UNIT AI: targeting + movement
    // ============================================================
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive) continue;

      // --- Morale / stamina / suppression upkeep ---
      var suppressPenalty = 1 - (u.suppression / CFG.suppressionMax) * CFG.suppressionMoralePenalty;
      u.morale = Math.min(CFG.moraleMax, u.morale + CFG.moraleRegen * suppressPenalty * dt);
      u.suppression = Math.max(0, u.suppression - CFG.suppressionDecay * dt);

      // --- Broken (fleeing) behaviour ---
      if (u.broken) {
        // Run toward own HQ
        var hqId = u.side === 'player' ? 'zmp_hq' : 'bl_hq';
        var hq = game.capitals.find(function(c) { return c.id === hqId; });
        if (hq) {
          var dx = hq.x - u.x, dy = hq.y - u.y;
          var d = Math.hypot(dx, dy);
          if (d > 5) {
            var spd = u.speed * 1.1 * (u.terrainRules ? u.terrainRules.speed : 1);
            u.x += (dx / d) * Math.min(d, spd * dt);
            u.y += (dy / d) * Math.min(d, spd * dt);
          }
        }
        // Rally check
        if (u.morale >= CFG.moraleRallyThreshold) u.broken = false;
        continue;
      }

      // --- Stamina ---
      var moving = Math.hypot(u.targetX - u.x, u.targetY - u.y) > 4;
      if (moving) {
        u.stamina = Math.max(0, u.stamina - CFG.staminaDrainMoving * dt);
      } else {
        u.stamina = Math.min(CFG.staminaMax, u.stamina + CFG.staminaRegen * dt);
      }
      var staminaMul = (u.stamina < CFG.staminaLowThreshold) ? CFG.staminaExhaustedSpeedMul : 1.0;

      // --- Target acquisition ---
      var aggroRange = (u.side === 'player')
        ? CFG.playerUnitAggroRange
        : CFG.enemyUnitAggroRange;

      var currentTarget = null;
      if (u.currentTargetId) {
        if (u.currentTargetType === 'unit') {
          currentTarget = game.units.find(function(o) {
            return o.id === u.currentTargetId && o.alive;
          });
        } else if (u.currentTargetType === 'capital') {
          currentTarget = game.capitals.find(function(c) {
            return c.id === u.currentTargetId && c.side !== u.side;
          });
        }
        if (!currentTarget) {
          u.currentTargetId = null;
          u.currentTargetType = null;
        }
      }

      if (!currentTarget) {
        var enemyUnit = findNearestEnemyUnit(game, u, aggroRange);
        var enemyCap = findNearestHostileCapital(game, u, CFG.enemyCapitalAggroRange);

        if (enemyUnit && (!enemyCap ||
            Math.hypot(enemyUnit.x - u.x, enemyUnit.y - u.y) <=
            Math.hypot(enemyCap.x - u.x, enemyCap.y - u.y))) {
          currentTarget = enemyUnit;
          u.currentTargetId = enemyUnit.id;
          u.currentTargetType = 'unit';
        } else if (enemyCap && u.side === 'enemy') {
          currentTarget = enemyCap;
          u.currentTargetId = enemyCap.id;
          u.currentTargetType = 'capital';
        } else if (enemyCap && u.side === 'player') {
          var dCap = Math.hypot(enemyCap.x - u.x, enemyCap.y - u.y);
          if (dCap <= u.range) {
            currentTarget = enemyCap;
            u.currentTargetId = enemyCap.id;
            u.currentTargetType = 'capital';
          }
        }
      }

      // --- Movement destination ---
      if (currentTarget) {
        var dxT = currentTarget.x - u.x;
        var dyT = currentTarget.y - u.y;
        var distToTarget = Math.hypot(dxT, dyT);

        if (distToTarget > u.range - 2) {
          u.targetX = currentTarget.x;
          u.targetY = currentTarget.y;
        } else {
          u.targetX = u.x;
          u.targetY = u.y;
        }

        // Leash: return if too far from order anchor
        var distFromOrder = Math.hypot(u.x - u.orderX, u.y - u.orderY);
        if (distFromOrder > 700) {
          u.currentTargetId = null;
          u.currentTargetType = null;
          u.targetX = u.orderX;
          u.targetY = u.orderY;
        }
      } else {
        u.targetX = u.orderX;
        u.targetY = u.orderY;
      }

            // --- Apply movement with terrain speed ---
      var mdx = u.targetX - u.x;
      var mdy = u.targetY - u.y;
      var mdist = Math.hypot(mdx, mdy);
      if (mdist > 1.5) {
        var terrSpeed = u.terrainRules ? u.terrainRules.speed : 1.0;
        var effSpeed = u.speed * terrSpeed * staminaMul;
        var step = Math.min(mdist, effSpeed * dt);

        var newX = u.x + (mdx / mdist) * step;
        var newY = u.y + (mdy / mdist) * step;

        // Collision check
        var blocked = BF.isBlocked(game.obstacles, newX, newY);

        if (!blocked) {
          u.x = newX;
          u.y = newY;
        } else {
          // Try sliding along X or Y
          var okX = !BF.isBlocked(game.obstacles, newX, u.y);
          var okY = !BF.isBlocked(game.obstacles, u.x, newY);

          if (okX) {
            u.x = newX;
          } else if (okY) {
            u.y = newY;
          } else {
            // Both blocked: push away from the obstacle centre
            var pushX = u.x - blocked.x;
            var pushY = u.y - blocked.y;
            var pushLen = Math.hypot(pushX, pushY);
            if (pushLen < 0.001) {
              // Degenerate — pick a random direction
              pushX = Math.cos(Math.random() * Math.PI * 2);
              pushY = Math.sin(Math.random() * Math.PI * 2);
              pushLen = 1;
            }
            pushX /= pushLen;
            pushY /= pushLen;
            var pushStep = effSpeed * dt * 0.7;
            var candidateX = u.x + pushX * pushStep;
            var candidateY = u.y + pushY * pushStep;
            // Only commit if the pushed position is itself clear
            if (!BF.isBlocked(game.obstacles, candidateX, candidateY)) {
              u.x = candidateX;
              u.y = candidateY;
            } else {
              // Truly wedged — teleport a few pixels in the push direction,
              // ignoring collision, so the unit can escape
              u.x += pushX * 4;
              u.y += pushY * 4;
            }
          }
        }

        // Clamp
        if (u.x < 5) u.x = 5;
        if (u.x > CFG.mapW - 5) u.x = CFG.mapW - 5;
        if (u.y < 5) u.y = 5;
        if (u.y > CFG.mapH - 5) u.y = CFG.mapH - 5;

        // Update facing
        var desiredFacing = Math.atan2(mdy, mdx);
        var diff = desiredFacing - u.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        var maxTurn = CFG.facingTurnRate * dt;
        u.facing += Math.max(-maxTurn, Math.min(maxTurn, diff));
      }
    }
    for (var i = 0; i < game.units.length; i++) {
      var u = game.units[i];
      if (!u.alive || u.broken) continue;
      u.attackCooldown -= dt;
      if (u.attackCooldown > 0) continue;

      var inRange = null;
      var inRangeType = null;

      if (u.currentTargetId) {
        if (u.currentTargetType === 'unit') {
          var t = game.units.find(function(o) {
            return o.id === u.currentTargetId && o.alive;
          });
          if (t && Math.hypot(t.x - u.x, t.y - u.y) <= u.range) {
            inRange = t; inRangeType = 'unit';
          }
        } else if (u.currentTargetType === 'capital') {
          var c = game.capitals.find(function(cap) {
            return cap.id === u.currentTargetId && cap.side !== u.side;
          });
          if (c && Math.hypot(c.x - u.x, c.y - u.y) <= u.range) {
            inRange = c; inRangeType = 'capital';
          }
        }
      }

      if (!inRange) {
        var enemyUnit = findNearestEnemyUnit(game, u, u.range);
        var enemyCap = findNearestHostileCapital(game, u, u.range);
        if (enemyUnit && (!enemyCap ||
            Math.hypot(enemyUnit.x - u.x, enemyUnit.y - u.y) <=
            Math.hypot(enemyCap.x - u.x, enemyCap.y - u.y))) {
          inRange = enemyUnit; inRangeType = 'unit';
        } else if (enemyCap) {
          inRange = enemyCap; inRangeType = 'capital';
        }
      }

      if (!inRange) continue;

      // Line of sight check for non-capital targets
      if (inRangeType === 'unit') {
        var hasLos = BF.hasLineOfSight(game.terrain, game.obstacles,
          u.x, u.y, inRange.x, inRange.y);
        if (!hasLos) continue;
      }

      // --- Damage calculation ---
      var baseDmg = u.dmg * (0.8 + Math.random() * 0.4);
      var atkTerrainMul = u.terrainRules ? u.terrainRules.dmg : 1.0;
      var suppressMul = 1 - (u.suppression / CFG.suppressionMax) * CFG.suppressionAccuracyPenalty;
      var flankMul = (inRangeType === 'unit') ? flankingMultiplier(u, inRange) : 1.0;
      var defTerrainMul = (inRangeType === 'unit' && inRange.terrainRules)
        ? inRange.terrainRules.defence : 1.0;

      var finalDmg = baseDmg * atkTerrainMul * suppressMul * flankMul * defTerrainMul;
      inRange.hp -= finalDmg;
      u.attackCooldown = CFG.attackSpeed;

      // Feedback
      game.projectiles.push({
        x1: u.x, y1: u.y, x2: inRange.x, y2: inRange.y,
        life: 0.12, color: u.side === 'player' ? '#aaffaa' : '#ffaaaa'
      });

      // Suppression on target (if unit)
      if (inRangeType === 'unit') {
        inRange.suppression = Math.min(CFG.suppressionMax, inRange.suppression + 12);
        inRange.morale -= CFG.moraleLossPerHit;
      }

      // Kill resolution
      if (inRangeType === 'unit' && inRange.hp <= 0) {
        inRange.alive = false;
        emitDeathParticles(game, inRange);

        if (inRange.side === 'enemy') {
          game.kills++;
          game.gold += CFG.goldPerKill;
        } else {
          game.losses++;
        }

        // Nearby allies lose morale
        for (var k = 0; k < game.units.length; k++) {
          var ally = game.units[k];
          if (!ally.alive || ally.side !== inRange.side || ally === inRange) continue;
          if (Math.hypot(ally.x - inRange.x, ally.y - inRange.y) < 100) {
            ally.morale -= CFG.moraleLossAllyDeath;
          }
        }

        // Attacker gains a bit
        u.morale = Math.min(CFG.moraleMax, u.morale + CFG.moraleLossPerKill * 0.5);
      }
    }

    // ---- Check for broken units ----
    for (var i = 0; i < game.units.length; i++) {
      var u2 = game.units[i];
      if (!u2.alive) continue;
      if (!u2.broken && u2.morale < CFG.moraleBreakThreshold) {
        u2.broken = true;
        addFloat(game, u2.x, u2.y - 20, 'BROKEN', '#ffaa00');
      }
    }

    // ============================================================
    // CAPTURE MECHANIC
    // ============================================================
    for (var ci = 0; ci < game.capitals.length; ci++) {
      var cap = game.capitals[ci];
      if (cap.isHQ) continue;

      if (cap.captureProgress === undefined) {
        cap.captureProgress = 0;
        cap.capturingSide = null;
      }

      var playerCount = 0, enemyCount = 0;
      for (var ui = 0; ui < game.units.length; ui++) {
        var u3 = game.units[ui];
        if (!u3.alive || u3.broken) continue;
        var d = Math.hypot(u3.x - cap.x, u3.y - cap.y);
        if (d <= CFG.capitalCaptureRadius) {
          if (u3.side === 'player') playerCount++;
          else if (u3.side === 'enemy') enemyCount++;
        }
      }
      cap.contested = (playerCount > 0 && enemyCount > 0);

      var captor = null;
      var captorCount = 0;
      if (playerCount > 0 && playerCount > enemyCount) {
        captor = 'player'; captorCount = playerCount;
      } else if (enemyCount > 0 && enemyCount > playerCount) {
        captor = 'enemy'; captorCount = enemyCount;
      }

      if (captor && cap.side !== captor) {
        if (cap.capturingSide !== captor) {
          cap.capturingSide = captor;
          cap.captureProgress = 0;
        }
        var rate = 1.0 + (captorCount - 1) * 0.35;
        cap.captureProgress += dt * rate;

        if (cap.captureProgress >= CFG.captureTime) {
          cap.side = captor;
          cap.captureProgress = 0;
          cap.capturingSide = null;
          cap.hp = cap.maxHp;

          if (captor === 'player') {
            cap.fillColor = '#2d8f2d';
            cap.ringColor = '#0a3a0a';
            cap.ownerName = 'ZMP';
            game.capturedCapitals.player++;
            addFloat(game, cap.x, cap.y - 30, '+CAPTURED', '#5fdf5f');
          } else {
            cap.fillColor = '#8a1010';
            cap.ringColor = '#3a0505';
            cap.ownerName = 'Black League';
            game.capturedCapitals.enemy++;
            addFloat(game, cap.x, cap.y - 30, '-LOST', '#ff6060');
          }

          // Capture flash + dust + shake
          game.explosions.push({
            x: cap.x, y: cap.y,
            life: 0.9, maxLife: 0.9,
            color: captor === 'player' ? '#5fdf5f' : '#ff6060'
          });
          for (var k = 0; k < 8; k++) {
            game.explosions.push({
              x: cap.x + (Math.random() - 0.5) * 30,
              y: cap.y + (Math.random() - 0.5) * 30,
              life: 0.7 + Math.random() * 0.4,
              maxLife: 1.1,
              color: 'rgba(180,180,180,1)',
              dust: true
            });
          }
          game.shake = { duration: 0.4, magnitude: 12 };

          game.log.push((captor === 'player' ? 'ZMP' : 'Black League') +
            ' captured ' + cap.name + '!');
        }
      } else if (cap.side === captor) {
        cap.captureProgress = 0;
        cap.capturingSide = null;
      } else if (!captor) {
        if (cap.captureProgress > 0) {
          cap.captureProgress = Math.max(0, cap.captureProgress - dt * 0.5);
        }
        cap.capturingSide = null;
      }
    }

    // ---- Cleanup ----
    game.projectiles.forEach(function(p) { p.life -= dt; });
    game.projectiles = game.projectiles.filter(function(p) { return p.life > 0; });
    game.explosions.forEach(function(e) { e.life -= dt; });
    game.explosions = game.explosions.filter(function(e) { return e.life > 0; });
    game.floatText.forEach(function(f) { f.life -= dt; f.y -= 20 * dt; });
    game.floatText = game.floatText.filter(function(f) { return f.life > 0; });

    // ---- Enemy reinforcement ----
    if (game.enemyAutoSpawn) {
      game.enemySpawnTimer += dt;
      if (game.enemySpawnTimer >= 30) {
        game.enemySpawnTimer = 0;
        spawnEnemyGroup(game);
      }
    }

    // ---- Recompute power ----
    var pPower = 0, ePower = 0;
    for (var i = 0; i < game.units.length; i++) {
      var u4 = game.units[i];
      if (!u4.alive) continue;
      var t = UNIT_TYPES[u4.type];
      if (u4.side === 'player') pPower += t.cost / 100;
      else ePower += t.cost / 100;
    }
    game.playerPowerCurrent = Math.round(pPower * 8);
    game.enemyPowerCurrent = Math.round(ePower * 8);

    // ---- Win/loss ----
    var council = game.capitals.find(function(c) { return c.id === 'council'; });
    var blHQ = game.capitals.find(function(c) { return c.id === 'bl_hq'; });
    var zmpHQ = game.capitals.find(function(c) { return c.id === 'zmp_hq'; });

    if (blHQ.hp <= 0) {
      game.result = 'victory';
      game.log.push('VICTORY: The Black League HQ has fallen.');
    } else if (council.side === 'player') {
      game.result = 'victory';
      game.log.push('VICTORY: The Council Chamber is held.');
    } else if (zmpHQ.hp <= 0) {
      game.result = 'defeat';
      game.log.push('DEFEAT: ZMP HQ has fallen.');
    } else if (game.playerPowerCurrent < game.playerPowerStart * 0.2) {
      game.result = 'defeat';
      game.log.push('DEFEAT: Legion strength below 20%.');
    }
  }

  function spawnEnemyGroup(game) {
    var blHQ = game.capitals.find(function(c) { return c.id === 'bl_hq'; });
    if (!blHQ || blHQ.hp <= 0) return;
    var types = ['bl_line', 'bl_musket', 'black_rider'];
    types.forEach(function(tp) {
      var u = makeUnit(tp, 'enemy',
        blHQ.x + (Math.random() - 0.5) * 80,
        blHQ.y + (Math.random() - 0.5) * 80);
      game.units.push(u);
    });
    repathEnemyArmy(game);
  }

  // ============================================================
  // ECONOMY
  // ============================================================
  function buyUnit(game, type) {
    var t = UNIT_TYPES[type];
    if (!t) return { ok: false, msg: 'Unknown unit type.' };
    if (game.gold < t.cost) {
      return { ok: false, msg: 'Not enough gold (' + Math.floor(game.gold) + ' / ' + t.cost + ').' };
    }
    game.gold -= t.cost;
    var hq = game.capitals.find(function(c) { return c.id === 'zmp_hq'; });
    var x = hq.x + 40 + Math.random() * 60;
    var y = hq.y - 40 - Math.random() * 60;
    game.units.push(makeUnit(type, 'player', x, y));
    return { ok: true, msg: 'Recruited ' + t.name + ' (-' + t.cost + ' gold).' };
  }

  function addGold(game, amount) {
    game.gold += amount;
    return { ok: true, msg: '+' + amount + ' gold. Total: ' + Math.floor(game.gold) };
  }

  function callSupportGroup(game) {
    var types = ['dzehurjaca', 'line', 'musket', 'sniper'];
    var notes = [];
    types.forEach(function(tp) {
      var hq = game.capitals.find(function(c) { return c.id === 'zmp_hq'; });
      var u = makeUnit(tp, 'player',
        hq.x + (Math.random() - 0.5) * 120,
        hq.y + (Math.random() - 0.5) * 120);
      game.units.push(u);
      notes.push('+' + UNIT_TYPES[tp].name);
    });
    return { ok: true, msg: 'Support group arrived: ' + notes.join(', ') };
  }

  function spawnEnemyTroops(game, count) {
    var types = ['bl_line', 'bl_musket', 'bl_sniper'];
    for (var i = 0; i < count; i++) {
      var tp = types[Math.floor(Math.random() * types.length)];
      var blHQ = game.capitals.find(function(c) { return c.id === 'bl_hq'; });
      var u = makeUnit(tp, 'enemy',
        blHQ.x + (Math.random() - 0.5) * 100,
        blHQ.y + (Math.random() - 0.5) * 100);
      game.units.push(u);
    }
    repathEnemyArmy(game);
    return { ok: true, msg: 'Spawned ' + count + ' enemy troops.' };
  }

  function killAllEnemies(game) {
    var n = 0;
    game.units.forEach(function(u) {
      if (u.alive && u.side === 'enemy') { u.alive = false; n++; game.kills++; }
    });
    return { ok: true, msg: 'Killed ' + n + ' enemies.' };
  }

  // ============================================================
  // EXPORTS
  // ============================================================
  return {
    CFG: CFG,
    UNIT_TYPES: UNIT_TYPES,
    newGame: newGame,
    handleMouseDown: handleMouseDown,
    handleMouseMove: handleMouseMove,
    handleMouseUp: handleMouseUp,
    update: update,
    buyUnit: buyUnit,
    addGold: addGold,
    callSupportGroup: callSupportGroup,
    spawnEnemyTroops: spawnEnemyTroops,
    killAllEnemies: killAllEnemies,
    makeUnit: makeUnit,
    repathEnemyArmy: repathEnemyArmy
  };
})();