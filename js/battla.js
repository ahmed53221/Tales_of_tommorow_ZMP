// battle_hoi4.js — File 4 of the HOI4-style battle system
// ============================================================
// Orchestration layer. Ties BattleMap + BattleUnits + BattleFront
// together with a HUD, and handles win/loss detection.
//
// THREE FACTIONS:
//   - ZMP (player)
//   - BL  (Black League)
//   - RB  (Red + IIA) — can win outright if both others are wiped
//
// Responsibilities:
//   - Boot the other three modules in the right order
//   - Draw a side panel with kills/losses, city ownership, and log
//   - Detect battle-end (one side wiped, or timer expired)
//   - Post the result back to the opener window (ui.js) so endings fire
//
// Exposes: window.BattleHOI4
// ============================================================

window.BattleHOI4 = (function () {
  'use strict';

  // ------------------------------------------------------------
  // Lazy module lookups (safe against load-order issues)
  // ------------------------------------------------------------
  function BM() { return window.BattleMap; }
  function BU() { return window.BattleUnits; }
  function BF() { return window.BattleFront; }

  // ============================================================
  // CONFIG
  // ============================================================
  var CFG = {
    // How long a battle can last before it times out (seconds)
    maxBattleDuration: 600,   // 10 minutes

    // Who wins if time runs out? Compare remaining strength.
    // If strength is within this ratio, call it a draw -> defeat
    // (attacker must win decisively).
    drawThreshold: 1.10,

    // How often to check win/loss (seconds)
    checkInterval: 0.5,

    // UI
    panelWidth: 280
  };

  // ============================================================
  // STATE
  // ============================================================
  var battleTime = 0;
  var checkTimer = 0;
  var battleEnded = false;
  var kills = 0;
  var losses = 0;
  var lastLogLength = 0;
  var uiCanvas = null;
  var uiCtx = null;

  // ============================================================
  // BOOT
  // ============================================================
  function init(options) {
    options = options || {};
    battleTime = 0;
    checkTimer = 0;
    battleEnded = false;
    kills = 0;
    losses = 0;
    lastLogLength = 0;

    // Build the side panel canvas (overlays the map canvas)
    createSidePanelCanvas();

    console.log('[battle_hoi4] initialised');
  }

  function createSidePanelCanvas() {
    // If a canvas already exists, remove it
    var existing = document.getElementById('battle-hoi4-ui');
    if (existing) existing.remove();

    uiCanvas = document.createElement('canvas');
    uiCanvas.id = 'battle-hoi4-ui';
    uiCanvas.style.position = 'absolute';
    uiCanvas.style.top = '0';
    uiCanvas.style.left = '0';
    uiCanvas.style.width = '100%';
    uiCanvas.style.height = '100%';
    uiCanvas.style.pointerEvents = 'none';
    uiCanvas.style.zIndex = '10';

    var container = document.getElementById('battle-container') || document.body;
    container.appendChild(uiCanvas);

    uiCtx = uiCanvas.getContext('2d');
    resizeUICanvas();

    window.addEventListener('resize', resizeUICanvas);
  }

  function resizeUICanvas() {
    if (!uiCanvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    uiCanvas.width = uiCanvas.clientWidth * dpr;
    uiCanvas.height = uiCanvas.clientHeight * dpr;
  }

  // ============================================================
  // UPDATE — called every frame from the main tick
  // ============================================================
  function update(dt) {
    if (battleEnded) return;

    battleTime += dt;
    checkTimer += dt;

    if (checkTimer >= CFG.checkInterval) {
      checkTimer = 0;
      checkBattleEnd();
    }

    drawSidePanel();
  }

  // ============================================================
  // WIN / LOSS DETECTION
  // ============================================================
    function checkBattleEnd() {
    if (battleEnded) return;

    var units = BU().getUnits() || [];
    // <<< RB ADD start — count three factions
    var zmpCount = 0, blCount = 0, rbCount = 0;
    var zmpHp = 0, blHp = 0, rbHp = 0;

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.alive === false) continue;
      if (u.side === 'zmp') { zmpCount++; zmpHp += u.hp; }
      else if (u.side === 'bl') { blCount++; blHp += u.hp; }
      else if (u.side === 'rb') { rbCount++; rbHp += u.hp; }
    }
    // <<< RB ADD end

    // 1. One side wiped out
    if (blCount === 0 && zmpCount > 0) {
      endBattle('victory', 'The Black League has been destroyed.');
      return;
    }
    if (zmpCount === 0 && blCount > 0) {
      endBattle('defeat', 'The Legion has been destroyed.');
      return;
    }
    if (zmpCount === 0 && blCount === 0) {
      endBattle('defeat', 'Both armies destroyed. Stalemate.');
      return;
    }

    // <<< RB ADD start — RB wins if both ZMP and BL are wiped (RB standing alone)
    if (zmpCount === 0 && blCount === 0 && rbCount > 0) {
      endBattle('defeat', 'The Red+IIA coalition holds the valley. ZMP and BL are destroyed.');
      return;
    }
    // <<< RB ADD end

    // 2. Timer expired — compare strength
    // <<< RB ADD: now compares all three factions' total strength
    if (battleTime >= CFG.maxBattleDuration) {
      var zmpPower = zmpHp + zmpCount * 20;
      var blPower  = blHp  + blCount  * 20;
      var rbPower  = rbHp  + rbCount  * 20;

      // ZMP must beat BOTH other factions decisively to win on time.
      // If either BL or RB is comparable to or stronger than ZMP, it's a defeat.
      if (zmpPower >= blPower * CFG.drawThreshold &&
          zmpPower >= rbPower * CFG.drawThreshold) {
        endBattle('victory', 'The Legion holds the field at the end of the day.');
      } else {
        endBattle('defeat', 'The Legion was driven back before the day was over.');
      }
      return;
    }
    // <<< RB ADD end

    // 3. City capture as a secondary win condition
    //    These only matter if the province grid has actually changed hands.
    //    The initial owner is set in battle_map.js; if the current owner
    //    matches the opposite side, the city has been captured.
    syncCityOwnership();   // make sure city.side reflects the province grid

    var cities = BM().getCities() || [];
    for (var c = 0; c < cities.length; c++) {
      var city = cities[c];

      // ZMP captured the Council Chamber (School) -> NOT instant victory.
      // Per design: it only debuffs RB. Flag it here for the RB AI to read.
      // <<< RB ADD start
      if (city.isVictory && city.side === 'zmp') {
        if (!city._rbDebuffApplied) {
          city._rbDebuffApplied = true;
          // Simple, visible debuff: every surviving RB unit loses 20 org once.
          // You can swap this for a growth-rate penalty later.
          var allUnits = BU().getUnits() || [];
          for (var ru = 0; ru < allUnits.length; ru++) {
            if (allUnits[ru].side === 'rb' && allUnits[ru].alive !== false) {
              allUnits[ru].org = Math.max(0, allUnits[ru].org - 20);
            }
          }
          if (window.BattleFront && window.BattleFront.getLog) {
            // log a hint so the player sees what happened
            try {
              var log = window.BattleFront.getLog();
              if (log && log.push) {
                log.push('[' + Math.round(battleTime) + 's] RB+IIA — Council Chamber lost: RB morale shaken (−20 org).');
                if (log.length > 40) log.shift();
              }
            } catch (e) {}
          }
        }
        // Do NOT end the battle — RB keeps fighting.
      }
      // <<< RB ADD end

      // ZMP captured BL HQ -> victory
      if (city.id === 'bl_hq' && city.side === 'zmp') {
        endBattle('victory', 'The Black League HQ has fallen.');
        return;
      }

      // BL captured ZMP HQ -> defeat
      if (city.id === 'zmp_hq' && city.side === 'bl') {
        endBattle('defeat', 'The ZMP HQ has fallen.');
        return;
      }

      // <<< RB ADD start — RB captures ZMP HQ -> defeat (RB win from player's view)
      if (city.id === 'zmp_hq' && city.side === 'rb') {
        endBattle('defeat', 'The ZMP HQ has fallen to the Red+IIA coalition.');
        return;
      }
      // <<< RB ADD end
    }
  }

  // City capture detection: the province grid holds "ownership", but the
  // city object doesn't. We sync it here from the province grid.
  function syncCityOwnership() {
    var cities = BM().getCities() || [];
    var grid = BM().getProvinceGrid();
    if (!grid) return;
    var cols = BM().CFG.PROV_COLS;
    var rows = BM().CFG.PROV_ROWS;
    var cw = BM().CFG.W / cols;
    var ch = BM().CFG.H / rows;

    for (var i = 0; i < cities.length; i++) {
      var city = cities[i];
      var px = Math.floor(city.x / cw);
      var py = Math.floor(city.y / ch);
      if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
      var owner = grid[py][px].owner;
      // <<< RB ADD: now also copies 'rb' ownership
      if (owner === 'zmp' || owner === 'bl' || owner === 'rb') {
        city.side = owner;
      }
    }
  }

  // ============================================================
  // END BATTLE
  // ============================================================
  function endBattle(result, reason) {
    if (battleEnded) return;
    battleEnded = true;

    var units = BU().getUnits() || [];
    // <<< RB ADD start — track RB survivors too
    var zmpLeft = 0, blLeft = 0, rbLeft = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].alive === false) continue;
      if (units[i].side === 'zmp') zmpLeft++;
      else if (units[i].side === 'bl') blLeft++;
      else if (units[i].side === 'rb') rbLeft++;
    }
    // <<< RB ADD end

    // Count kills and losses from the log
    // <<< RB ADD: RB DESTROYED lines are also counted (as kills, since player
    //             benefits from RB losses; adjust if you want otherwise)
    var log = BF().getLog() || [];
    for (var i = 0; i < log.length; i++) {
      var line = log[i];
      if (line.indexOf('(BL) — DESTROYED') !== -1) kills++;
      else if (line.indexOf('(ZMP) — DESTROYED') !== -1) losses++;
      else if (line.indexOf('(RB) — DESTROYED') !== -1) kills++;
    }
    // <<< RB ADD end

    var payload = {
      type: 'battleResult',
      result: result,
      reason: reason,
      kills: kills,
      losses: losses,
      capturedCapitals: {
        player: countZmpOwnedCities(),
        enemy: countBlOwnedCities()
      },
      playerUnitsLeft: zmpLeft,
      enemyUnitsLeft: blLeft,
      rbUnitsLeft: rbLeft,   // <<< RB ADD
      battleTime: Math.round(battleTime)
    };

    console.log('[battle_hoi4] battle ended:', payload);

    // Try to notify the opener window (ui.js)
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
        // Give the message a moment to flush, then close
        setTimeout(function () {
          try { window.close(); } catch (e) {}
        }, 300);
        return;
      }
    } catch (e) {
      console.warn('[battle_hoi4] postMessage failed:', e);
    }

    // If no opener, just show the result on the page
    showEndOverlay(result, reason, payload);
  }

  function countZmpOwnedCities() {
    var cities = BM().getCities() || [];
    var n = 0;
    for (var i = 0; i < cities.length; i++) {
      if (cities[i].side === 'zmp' && !cities[i].isHQ) n++;
    }
    return n;
  }

  function countBlOwnedCities() {
    var cities = BM().getCities() || [];
    var n = 0;
    for (var i = 0; i < cities.length; i++) {
      if (cities[i].side === 'bl' && !cities[i].isHQ) n++;
    }
    return n;
  }

  function showEndOverlay(result, reason, payload) {
    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.zIndex = '1000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = 'monospace';

    var color = result === 'victory' ? '#5fdf5f' : '#ff6060';
    var title = result === 'victory' ? 'VICTORY' : 'DEFEAT';

    overlay.innerHTML =
      '<div style="max-width:500px;padding:30px;background:#1a1a1a;border:3px solid ' + color + ';border-radius:8px;text-align:center;">' +
      '<h1 style="color:' + color + ';margin:0 0 10px 0;font-size:2rem;">' + title + '</h1>' +
      '<p style="color:#ddd;font-size:1rem;line-height:1.5;">' + reason + '</p>' +
      '<div style="margin:20px 0;color:#888;font-size:0.9rem;">' +
      '<div>Kills: ' + payload.kills + '</div>' +
      '<div>Losses: ' + payload.losses + '</div>' +
      '<div>Time: ' + payload.battleTime + 's</div>' +
      '</div>' +
      '<button onclick="window.close()" style="padding:10px 30px;font-size:1rem;background:#333;color:#fff;border:1px solid #666;cursor:pointer;border-radius:4px;">Close</button>' +
      '</div>';

    document.body.appendChild(overlay);
  }

  // ============================================================
  // SIDE PANEL — HUD
  // ============================================================
  function drawSidePanel() {
    if (!uiCtx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = uiCanvas.width / dpr;
    var h = uiCanvas.height / dpr;

    uiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    uiCtx.clearRect(0, 0, w, h);

    // Panel background — anchored to the right edge
    var panelX = w - CFG.panelWidth;
    var panelY = 30;

    uiCtx.fillStyle = 'rgba(0,0,0,0.72)';
    uiCtx.fillRect(panelX, panelY, CFG.panelWidth, h - panelY - 10);

    uiCtx.strokeStyle = '#444';
    uiCtx.lineWidth = 1;
    uiCtx.strokeRect(panelX + 0.5, panelY + 0.5, CFG.panelWidth - 1, h - panelY - 11);

    // Title
    var pad = 12;
    var x = panelX + pad;
    var y = panelY + pad + 4;
    var innerW = CFG.panelWidth - pad * 2;

    uiCtx.textAlign = 'left';
    uiCtx.textBaseline = 'top';
    uiCtx.font = 'bold 13px monospace';
    uiCtx.fillStyle = '#c8ffc8';
    uiCtx.fillText('BATTLE SITUATION', x, y);
    y += 22;

    // --- Kills / losses ---
    // <<< RB ADD start — count RB too
    var units = BU().getUnits() || [];
    var zmpAlive = 0, blAlive = 0, rbAlive = 0;
    var zmpHp = 0, blHp = 0, rbHp = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].alive === false) continue;
      if (units[i].side === 'zmp') { zmpAlive++; zmpHp += units[i].hp / units[i].hpMax; }
      else if (units[i].side === 'bl') { blAlive++; blHp += units[i].hp / units[i].hpMax; }
      else if (units[i].side === 'rb') { rbAlive++; rbHp += units[i].hp / units[i].hpMax; }
    }

    uiCtx.font = '11px monospace';
    uiCtx.fillStyle = '#7fdf7f';
    uiCtx.fillText('ZMP: ' + zmpAlive + ' divisions', x, y);
    y += 14;
    uiCtx.fillStyle = '#ff7070';
    uiCtx.fillText('BL:  ' + blAlive + ' divisions', x, y);
    y += 14;
    uiCtx.fillStyle = '#e08080';
    uiCtx.fillText('RB:  ' + rbAlive + ' divisions', x, y);
    y += 20;

    // --- HP totals bars ---
    var maxHp = Math.max(zmpHp, blHp, rbHp, 1);
    uiCtx.fillStyle = '#3a5a3a';
    uiCtx.fillRect(x, y, innerW, 6);
    uiCtx.fillStyle = '#5fdf5f';
    uiCtx.fillRect(x, y, innerW * (zmpHp / maxHp), 6);
    y += 10;

    uiCtx.fillStyle = '#5a3030';
    uiCtx.fillRect(x, y, innerW, 6);
    uiCtx.fillStyle = '#ff6060';
    uiCtx.fillRect(x, y, innerW * (blHp / maxHp), 6);
    y += 10;

    // RB bar (dark red)
    uiCtx.fillStyle = '#4a1a1a';
    uiCtx.fillRect(x, y, innerW, 6);
    uiCtx.fillStyle = '#c03030';
    uiCtx.fillRect(x, y, innerW * (rbHp / maxHp), 6);
    y += 18;
    // <<< RB ADD end

    // --- Battle timer ---
    var timeLeft = Math.max(0, CFG.maxBattleDuration - battleTime);
    var mins = Math.floor(timeLeft / 60);
    var secs = Math.floor(timeLeft % 60);
    uiCtx.fillStyle = '#ffcc00';
    uiCtx.fillText('Time left: ' + mins + ':' + (secs < 10 ? '0' : '') + secs, x, y);
    y += 20;

    // --- City ownership ---
    syncCityOwnership();
    var cities = BM().getCities() || [];
    uiCtx.fillStyle = '#aaa';
    uiCtx.font = 'bold 11px monospace';
    uiCtx.fillText('CITIES', x, y);
    y += 16;

    uiCtx.font = '10px monospace';
    for (var c = 0; c < cities.length; c++) {
      var city = cities[c];
      // <<< RB ADD: rb colour added
      var ownerColor = city.side === 'zmp' ? '#7fdf7f'
                     : city.side === 'bl' ? '#ff7070'
                     : city.side === 'rb' ? '#e08080'
                     : '#cccccc';
      uiCtx.fillStyle = ownerColor;
      uiCtx.fillText('● ' + city.name, x, y);
      y += 12;
    }
    y += 6;

    // --- Battle log ---
    uiCtx.fillStyle = '#aaa';
    uiCtx.font = 'bold 11px monospace';
    uiCtx.fillText('LOG', x, y);
    y += 16;

    var log = BF().getLog() || [];
    var recent = log.slice(-12);
    uiCtx.font = '10px monospace';
    for (var i = recent.length - 1; i >= 0; i--) {
      var line = recent[i];
      // Colour by side
      // <<< RB ADD: rb colour added
      var color = '#888';
      if (line.indexOf('(ZMP)') !== -1) color = '#7fdf7f';
      else if (line.indexOf('(BL)') !== -1) color = '#ff7070';
      else if (line.indexOf('(RB)') !== -1) color = '#e08080';
      else if (line.indexOf('RB+RED') !== -1) color = '#e08080';

      // Truncate long lines
      if (line.length > 34) line = line.substring(0, 33) + '…';
      uiCtx.fillStyle = color;
      uiCtx.fillText(line, x, y);
      y += 11;
      if (y > h - 20) break;
    }

    // --- End Battle button (drawn, clickable) ---
    drawEndButton(w, h);
  }

  function drawEndButton(w, h) {
    var bx = w - CFG.panelWidth + 12;
    var by = h - 48;
    var bw = CFG.panelWidth - 24;
    var bh = 32;

    uiCtx.fillStyle = '#5a1010';
    uiCtx.fillRect(bx, by, bw, bh);
    uiCtx.strokeStyle = '#cc3030';
    uiCtx.lineWidth = 2;
    uiCtx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    uiCtx.fillStyle = '#fff';
    uiCtx.font = 'bold 12px monospace';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.fillText('END BATTLE', bx + bw / 2, by + bh / 2);
    uiCtx.textAlign = 'left';
    uiCtx.textBaseline = 'top';
  }

  // ============================================================
  // CLICK HANDLING
  // ============================================================
  // We can't attach pointer events directly to the UI canvas
  // because it's behind the map. Instead, listen for clicks on
  // the map canvas and check if they fall inside the panel.
  // ============================================================
  function attachClickHandler() {
    var mapCanvas = BM().getCanvas();
    if (!mapCanvas) return;

    mapCanvas.addEventListener('click', function (e) {
      if (battleEnded) return;

      var rect = mapCanvas.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;

      // Check if within the End Battle button
      var w = rect.width;
      var h = rect.height;
      var bx = w - CFG.panelWidth + 12;
      var by = h - 48;
      var bw = CFG.panelWidth - 24;
      var bh = 32;

      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        if (confirm('End the battle and return to the game?')) {
          endBattle('aborted', 'Battle ended by commander.');
        }
      }
    });
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  function shutdown() {
    battleEnded = true;
    if (uiCanvas && uiCanvas.parentNode) {
      uiCanvas.parentNode.removeChild(uiCanvas);
    }
    uiCanvas = null;
    uiCtx = null;
  }

  function isEnded() { return battleEnded; }

  return {
    CFG: CFG,
    init: init,
    update: update,
    shutdown: shutdown,
    isEnded: isEnded,
    attachClickHandler: attachClickHandler
  };
})();