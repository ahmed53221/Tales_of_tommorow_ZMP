// battle_hud.js — File 10: tactical HUD (v2)
// ============================================================
// A proper military-ops aesthetic:
//   - Angular panels with corner ticks
//   - Horizontal top bar (status) + bottom-left action deck
//   - Right-side context panel that slides in when needed
//   - Custom typography, no default monospace look
//   - Color-coded per state, subtle animation
//
// THREE FACTIONS: ZMP (player), BL (Black League), RB (Red+IIA)
//
// Exposes: window.BattleHUD
// ============================================================

window.BattleHUD = (function () {
  'use strict';

  function BM() { return window.BattleMap; }
  function BU() { return window.BattleUnits; }
  function BF() { return window.BattleFront; }
  function BE() { return window.BattleEconomy; }
  function BD() { return window.BattleDrones; }

  var root = null;
  var rightPanel = null;
  var topBar = null;
  var deck = null;
  var refreshTimer = 0;
  var activeRightTab = 'command';
  var logScroll = 0;

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    var old = document.getElementById('battle-hud-root');
    if (old) old.remove();

    root = document.createElement('div');
    root.id = 'battle-hud-root';
    root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;' +
      'font-family:"Rajdhani","Segoe UI",-apple-system,sans-serif;' +
      'z-index:22;';

    var container = document.getElementById('battle-container') || document.body;
    container.appendChild(root);

    buildTopBar();
    buildRightPanel();
    buildActionDeck();

    injectStyleTag();
    installHotkeys();

    console.log('[hud] v2 initialised');
  }

  function injectStyleTag() {
    if (document.getElementById('battle-hud-style')) return;
    var style = document.createElement('style');
    style.id = 'battle-hud-style';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

      #battle-hud-root * { box-sizing: border-box; }

      .hud-panel {
        background: linear-gradient(180deg,
                    rgba(14,20,28,0.94) 0%,
                    rgba(8,12,18,0.94) 100%);
        border: 1px solid rgba(90, 200, 255, 0.25);
        border-radius: 2px;
        box-shadow:
          0 0 20px rgba(0, 0, 0, 0.7),
          inset 0 0 30px rgba(90, 200, 255, 0.04),
          0 0 0 1px rgba(0, 0, 0, 0.5);
        position: relative;
        color: #b8c8d8;
      }

      .hud-panel::before,
      .hud-panel::after {
        content: '';
        position: absolute;
        width: 10px;
        height: 10px;
        border: 2px solid rgba(90, 200, 255, 0.7);
        pointer-events: none;
      }
      .hud-panel::before {
        top: -1px; left: -1px;
        border-right: none;
        border-bottom: none;
      }
      .hud-panel::after {
        bottom: -1px; right: -1px;
        border-left: none;
        border-top: none;
      }

      .hud-label {
        font-size: 9px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: rgba(140, 190, 220, 0.55);
        font-weight: 600;
      }

      .hud-value {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
        color: #d8e8f0;
      }

      .hud-divider {
        height: 1px;
        background: linear-gradient(90deg,
                    transparent 0%,
                    rgba(90, 200, 255, 0.3) 50%,
                    transparent 100%);
        margin: 6px 0;
      }

      .hud-tab {
        flex: 1;
        text-align: center;
        padding: 10px 4px 8px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        cursor: pointer;
        color: rgba(140, 190, 220, 0.4);
        transition: all 0.15s ease;
        border-bottom: 2px solid transparent;
        user-select: none;
        pointer-events: auto;
      }
      .hud-tab:hover {
        color: rgba(140, 190, 220, 0.8);
        background: rgba(90, 200, 255, 0.04);
      }
      .hud-tab.active {
        color: #7fdcff;
        border-bottom-color: #7fdcff;
        background: linear-gradient(180deg,
                    rgba(127, 220, 255, 0.12) 0%,
                    transparent 100%);
        text-shadow: 0 0 8px rgba(127, 220, 255, 0.6);
      }

      .hud-btn {
        display: block;
        width: 100%;
        margin: 4px 0;
        padding: 8px 10px;
        background: linear-gradient(180deg,
                    rgba(20,30,42,0.9) 0%,
                    rgba(12,18,26,0.9) 100%);
        color: #b8c8d8;
        border: 1px solid rgba(90, 200, 255, 0.2);
        border-radius: 2px;
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.5px;
        cursor: pointer;
        text-align: left;
        transition: all 0.12s ease;
        position: relative;
        pointer-events: auto;
      }
      .hud-btn:hover:not(:disabled) {
        background: linear-gradient(180deg,
                    rgba(30,50,70,0.9) 0%,
                    rgba(20,30,42,0.9) 100%);
        border-color: rgba(90, 200, 255, 0.5);
        color: #e0f0ff;
        transform: translateX(2px);
        box-shadow: -2px 0 0 0 #7fdcff;
      }
      .hud-btn:active:not(:disabled) {
        transform: translateX(3px);
      }
      .hud-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .hud-btn .cost {
        float: right;
        color: #7fdcff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
      }

      .hud-scroll {
        overflow-y: auto;
        pointer-events: auto;
      }
      .hud-scroll::-webkit-scrollbar { width: 6px; }
      .hud-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
      .hud-scroll::-webkit-scrollbar-thumb {
        background: rgba(90, 200, 255, 0.3);
        border-radius: 3px;
      }
      .hud-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(90, 200, 255, 0.5);
      }

      @keyframes hud-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .hud-live {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #7fdf7f;
        margin-right: 6px;
        vertical-align: middle;
        box-shadow: 0 0 6px #7fdf7f;
        animation: hud-pulse 2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  // TOP BAR — thin status strip across the top
  // ============================================================
  function buildTopBar() {
    topBar = document.createElement('div');
    topBar.className = 'hud-panel';
    topBar.style.cssText =
      'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
      'padding:6px 20px;display:flex;align-items:center;gap:22px;' +
      'pointer-events:auto;height:32px;min-width:520px;';

    root.appendChild(topBar);
    renderTopBar();
  }

  function renderTopBar() {
    if (!topBar) return;
    var units = BU().getUnits() || [];
    // <<< RB ADD start — count rb as well
    var zmp = 0, bl = 0, rb = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].alive === false) continue;
      if (units[i].side === 'zmp') zmp++;
      else if (units[i].side === 'bl') bl++;
      else if (units[i].side === 'rb') rb++;
    }
    // <<< RB ADD end

    var drones = BD() ? BD().getDrones() : [];
    var idleDrones = 0;
    for (var d = 0; d < drones.length; d++) {
      if (drones[d].state === 'idle') idleDrones++;
    }

    var econ = BE() ? BE().getScore() : null;
    var equip = econ ? Math.floor(econ.zmp.equip) : 0;

    var time = formatTime();

    // <<< RB ADD: RB block inserted between BL and DRONES
    var html =
      '<span class="hud-label" style="display:flex;align-items:center;">' +
        '<span class="hud-live"></span>KALA JEVO VALLEY</span>' +
      '<span style="color:rgba(90,200,255,0.15);">│</span>' +

      '<span class="hud-label">ZMP</span>' +
      '<span class="hud-value" style="color:#7fdf7f;font-size:14px;">' + pad2(zmp) + '</span>' +
      '<span style="color:rgba(90,200,255,0.15);">│</span>' +

      '<span class="hud-label">BL</span>' +
      '<span class="hud-value" style="color:#ff7070;font-size:14px;">' + pad2(bl) + '</span>' +
      '<span style="color:rgba(90,200,255,0.15);">│</span>' +

      '<span class="hud-label">RB</span>' +
      '<span class="hud-value" style="color:#e08080;font-size:14px;">' + pad2(rb) + '</span>' +
      '<span style="color:rgba(90,200,255,0.15);">│</span>' +

      '<span class="hud-label">DRONES</span>' +
      '<span class="hud-value" style="color:#7fdcff;font-size:14px;">' +
        pad2(idleDrones) + '<span style="color:rgba(140,190,220,0.4);font-size:10px;">/10</span>' +
      '</span>' +
      '<span style="color:rgba(90,200,255,0.15);">│</span>' +

      '<span class="hud-label">EQUIP</span>' +
      '<span class="hud-value" style="color:#a8e0ff;font-size:14px;">' + equip + '</span>' +
      '<span style="color:rgba(90,200,255,0.15);">│</span>' +

      '<span class="hud-value" style="color:rgba(140,190,220,0.7);font-size:11px;">' +
        time + '</span>';
    topBar.innerHTML = html;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatTime() {
    var state = null;
    if (window.BattleResearchNews && window.BattleResearchNews.getState) {
      state = window.BattleResearchNews.getState();
    }
    if (state) {
      var day = state.day || 1;
      return 'D' + day;
    }
    return 'LIVE';
  }

  // ============================================================
  // RIGHT PANEL — tabbed
  // ============================================================
  function buildRightPanel() {
    rightPanel = document.createElement('div');
    rightPanel.className = 'hud-panel';
    rightPanel.style.cssText =
      'position:absolute;top:50px;right:8px;bottom:8px;width:280px;' +
      'display:flex;flex-direction:column;pointer-events:auto;';

    var tabBar = document.createElement('div');
    tabBar.style.cssText =
      'display:flex;border-bottom:1px solid rgba(90,200,255,0.15);flex:0 0 auto;';
    tabBar.innerHTML =
      '<div class="hud-tab active" data-tab="command">CMD</div>' +
      '<div class="hud-tab" data-tab="econ">ECON</div>' +
      '<div class="hud-tab" data-tab="drones">UAV</div>' +
      '<div class="hud-tab" data-tab="log">LOG</div>';
    rightPanel.appendChild(tabBar);

    var content = document.createElement('div');
    content.id = 'battle-hud-content';
    content.className = 'hud-scroll';
    content.style.cssText =
      'flex:1 1 auto;padding:12px;overflow-y:auto;';
    rightPanel.appendChild(content);

    root.appendChild(rightPanel);

    // Wire tabs
    var tabEls = tabBar.querySelectorAll('.hud-tab');
    for (var i = 0; i < tabEls.length; i++) {
      tabEls[i].onclick = (function (el) {
        return function () { setTab(el.getAttribute('data-tab')); };
      })(tabEls[i]);
    }

    renderRightPanel();
  }

  function setTab(name) {
    activeRightTab = name;
    var tabEls = rightPanel.querySelectorAll('.hud-tab');
    for (var i = 0; i < tabEls.length; i++) {
      var t = tabEls[i].getAttribute('data-tab');
      if (t === name) tabEls[i].classList.add('active');
      else tabEls[i].classList.remove('active');
    }
    renderRightPanel();
  }

  function renderRightPanel() {
    var content = document.getElementById('battle-hud-content');
    if (!content) return;

    var html = '';
    if (activeRightTab === 'command') html = renderCommand();
    else if (activeRightTab === 'econ') html = renderEconomy();
    else if (activeRightTab === 'drones') html = renderDrones();
    else if (activeRightTab === 'log') html = renderLog();

    content.innerHTML = html;
    wireActions();
  }

  // ------------------------------------------------------------
  // COMMAND TAB
  // ------------------------------------------------------------
  function renderCommand() {
    var units = BU().getUnits() || [];
    // <<< RB ADD start — track rb too
    var zmp = 0, zmpHp = 0, zmpMax = 0, bl = 0, blHp = 0, blMax = 0;
    var rb = 0, rbHp = 0, rbMax = 0;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.alive === false) continue;
      if (u.side === 'zmp') { zmp++; zmpHp += u.hp; zmpMax += u.hpMax; }
      else if (u.side === 'bl') { bl++; blHp += u.hp; blMax += u.hpMax; }
      else if (u.side === 'rb') { rb++; rbHp += u.hp; rbMax += u.hpMax; }
    }
    var zmpPct = zmpMax > 0 ? (zmpHp / zmpMax) : 0;
    var blPct = blMax > 0 ? (blHp / blMax) : 0;
    var rbPct = rbMax > 0 ? (rbHp / rbMax) : 0;
    // <<< RB ADD end

    var selected = BU().getSelectedUnits ? BU().getSelectedUnits() : [];
    var cities = BM().getCities();

    var html = '';

    // --- Force balance ---
    html += label('FORCE BALANCE');
    html += sideBar('ZMP', zmp, zmpPct, '#7fdf7f');
    html += sideBar('BLACK LEAGUE', bl, blPct, '#ff7070');
    html += sideBar('RED+IIA', rb, rbPct, '#e08080');   // <<< RB ADD

    // --- Selection ---
    if (selected.length > 0 && selected.length <= 5) {
      html += divider();
      html += label('SELECTED — ' + selected.length);
      for (var s = 0; s < selected.length; s++) {
        html += unitCard(selected[s]);
      }
    } else if (selected.length > 5) {
      html += divider();
      html += label('SELECTED — ' + selected.length + ' UNITS');
      html += '<div style="font-size:11px;color:rgba(140,190,220,0.6);padding:4px 0;">' +
              'Multiple divisions under command</div>';
    }

    // --- Cities ---
    html += divider();
    html += label('TERRITORY');
    for (var c = 0; c < cities.length; c++) {
      html += cityRow(cities[c]);
    }

    return html;
  }

  function sideBar(name, count, pct, color) {
    var pctInt = Math.round(pct * 100);
    return '<div style="margin:6px 0 10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
        '<span class="hud-label">' + name + '</span>' +
        '<span class="hud-value" style="color:' + color + ';font-size:16px;">' + count + '</span>' +
      '</div>' +
      '<div style="height:4px;background:rgba(0,0,0,0.6);margin-top:3px;position:relative;overflow:hidden;">' +
        '<div style="position:absolute;top:0;left:0;height:100%;width:' + pctInt + '%;' +
          'background:' + color + ';box-shadow:0 0 8px ' + color + ';"></div>' +
      '</div>' +
      '<div style="font-size:9px;color:rgba(140,190,220,0.4);margin-top:2px;' +
        'font-family:JetBrains Mono,monospace;">' + pctInt + '% COMBAT READY</div>' +
    '</div>';
  }

  function unitCard(u) {
    var t = BU().UNIT_TYPES[u.typeId];
    var hpPct = Math.max(0, Math.min(100, (u.hp / u.hpMax) * 100));
    var orgPct = Math.max(0, Math.min(100, (u.org / u.orgMax) * 100));
    // <<< RB ADD: rb colour branches
    var color = u.side === 'zmp' ? '#4aa04a'
              : u.side === 'bl' ? '#a81a1a'
              : '#7a1414';
    var accent = u.side === 'zmp' ? '#7fdf7f'
               : u.side === 'bl' ? '#ff7070'
               : '#e08080';

    return '<div style="' +
      'margin:5px 0;padding:7px 9px;' +
      'background:linear-gradient(90deg, rgba(20,30,42,0.9), rgba(12,18,26,0.6));' +
      'border-left:2px solid ' + accent + ';' +
      'position:relative;' +
      '">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
        '<span style="font-weight:600;color:#e0f0ff;font-size:12px;">' +
          (t ? t.name : u.typeId) + '</span>' +
        '<span class="hud-value" style="color:' + accent + ';font-size:11px;">' +
          (u.symbol || '·') + '</span>' +
      '</div>' +
      statBar('HP', hpPct, '#5fdf5f') +
      statBar('ORG', orgPct, '#6699ff') +
    '</div>';
  }

  function statBar(name, pct, color) {
    return '<div style="margin-top:4px;">' +
      '<div style="display:flex;justify-content:space-between;font-size:9px;' +
        'color:rgba(140,190,220,0.5);font-family:JetBrains Mono,monospace;">' +
        '<span>' + name + '</span>' +
        '<span>' + Math.round(pct) + '</span>' +
      '</div>' +
      '<div style="height:2px;background:rgba(0,0,0,0.6);margin-top:2px;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + color + ';' +
          'box-shadow:0 0 6px ' + color + ';"></div>' +
      '</div>' +
    '</div>';
  }

  function cityRow(c) {
    // <<< RB ADD: rb colour + label
    var color = c.side === 'zmp' ? '#7fdf7f'
              : c.side === 'bl' ? '#ff7070'
              : c.side === 'rb' ? '#e08080'
              : 'rgba(160,180,200,0.5)';
    var icon = c.isVictory ? '★'
             : c.isHQ ? '⬢'
             : '◆';
    var label2 = c.side === 'zmp' ? 'ZMP'
               : c.side === 'bl' ? 'BL'
               : c.side === 'rb' ? 'RB'
               : 'NEUTRAL';
    return '<div style="display:flex;justify-content:space-between;padding:3px 0;' +
      'font-size:11px;border-bottom:1px solid rgba(90,200,255,0.05);">' +
      '<span style="color:' + color + ';">' + icon + ' ' + c.name + '</span>' +
      '<span style="font-size:9px;color:' + color + ';opacity:0.7;' +
        'font-family:JetBrains Mono,monospace;letter-spacing:1px;">' + label2 + '</span>' +
    '</div>';
  }

  // ------------------------------------------------------------
  // ECONOMY TAB
  // ------------------------------------------------------------
  function renderEconomy() {
    if (!BE()) return '<div class="hud-label">ECONOMY OFFLINE</div>';
    var econ = BE().getScore();
    if (!econ) return '<div class="hud-label">NO DATA</div>';

    var zmp = econ.zmp;
    var bl = econ.bl;
    var civTotal = 0, milTotal = 0;
    for (var k in zmp.buildings) {
      civTotal += zmp.buildings[k].civ;
      milTotal += zmp.buildings[k].mil;
    }

    var html = '';

    html += label('PRODUCTION');
    html += statRow('Equipment', Math.floor(zmp.equip), '#a8e0ff');
    html += statRow('Civ Factories', civTotal, '#d8e8f0');
    html += statRow('Mil Factories', milTotal, '#d8e8f0');
    html += statRow('Output', '+' + ((civTotal * 0.8 + milTotal * 1.4).toFixed(1)) + '/s', '#7fdf7f');

    html += divider();
    html += label('WAR SCORE');
    html += statRow('ZMP', zmp.score, '#7fdf7f');
    html += statRow('Black League', bl.score, '#ff7070');

    html += divider();
    html += label('BUILDINGS');
    html += actionBtn('civ', 'Civ Factory', 40, zmp.equip);
    html += actionBtn('mil', 'Mil Factory', 55, zmp.equip);
    html += actionBtn('fort', 'Fort', 30, zmp.equip);
    html += actionBtn('infra', 'Infrastructure', 20, zmp.equip);

    html += divider();
    html += label('RECRUIT');
    html += actionBtn('build_infantry', 'Infantry', 20, zmp.equip);
    html += actionBtn('build_cavalry', 'Cavalry', 28, zmp.equip);
    html += actionBtn('build_mixed', 'Mixed Brigade', 25, zmp.equip);
    html += actionBtn('build_artillery', 'Artillery', 35, zmp.equip);

    return html;
  }

  function actionBtn(action, label2, cost, avail) {
    var disabled = avail < cost;
    return '<button class="hud-btn" data-action="' + action + '"' +
      (disabled ? ' disabled' : '') + '>' +
      label2 + '<span class="cost">' + cost + ' EQ</span>' +
    '</button>';
  }

  function statRow(label2, value, color) {
    return '<div style="display:flex;justify-content:space-between;padding:3px 0;' +
      'font-size:11px;">' +
      '<span style="color:rgba(140,190,220,0.6);">' + label2 + '</span>' +
      '<span class="hud-value" style="color:' + (color || '#d8e8f0') + ';">' + value + '</span>' +
    '</div>';
  }

  // ------------------------------------------------------------
  // DRONE TAB
  // ------------------------------------------------------------
  function renderDrones() {
    if (!BD()) return '<div class="hud-label">UAV COMMAND OFFLINE</div>';

    var drones = BD().getDrones();
    var idle = 0, flying = 0, loitering = 0, returning = 0;
    for (var i = 0; i < drones.length; i++) {
      var s = drones[i].state;
      if (s === 'idle') idle++;
      else if (s === 'flying') flying++;
      else if (s === 'loitering') loitering++;
      else if (s === 'returning') returning++;
    }

    var html = '';

    html += label('UAV FLEET');
    html += droneStat('Available', idle, '#7fdcff');
    html += droneStat('In Flight', flying, '#ffcc00');
    html += droneStat('On Station', loitering, '#7fdf7f');
    html += droneStat('RTB', returning, 'rgba(160,180,200,0.5)');

    html += divider();
    html += label('CONTROLS');
    html += controlCard('R', 'RECON', 'Click map to launch', '#7fdcff');
    html += controlCard('T', 'STRIKE', 'Click enemy to bomb', '#ff7070');
    html += controlCard('ESC', 'CANCEL', 'Exit current mode', 'rgba(160,180,200,0.5)');

    var log = BD().getLog() || [];
    if (log.length > 0) {
      html += divider();
      html += label('SIGNAL LOG');
      var recent = log.slice(-5).reverse();
      for (var l = 0; l < recent.length; l++) {
        html += '<div style="padding:3px 0;font-size:10px;color:rgba(180,210,230,0.7);' +
          'border-bottom:1px solid rgba(90,200,255,0.05);">' +
          '<span class="hud-value" style="color:rgba(140,190,220,0.4);font-size:9px;">' +
            String(recent[l].time).padStart(4, '0') + 's</span> ' +
          recent[l].msg + '</div>';
      }
    }

    return html;
  }

  function droneStat(name, count, color) {
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;' +
      'padding:4px 0;">' +
      '<span class="hud-label">' + name + '</span>' +
      '<span class="hud-value" style="color:' + color + ';font-size:16px;">' +
        pad2(count) + '</span>' +
    '</div>';
  }

  function controlCard(key, name, desc, color) {
    return '<div style="' +
      'margin:4px 0;padding:6px 9px;' +
      'background:rgba(12,18,26,0.6);' +
      'border-left:2px solid ' + color + ';' +
      'display:flex;align-items:center;gap:10px;' +
      '">' +
      '<span style="' +
        'display:inline-block;padding:2px 7px;' +
        'background:rgba(0,0,0,0.5);' +
        'border:1px solid ' + color + ';' +
        'color:' + color + ';font-family:JetBrains Mono,monospace;' +
        'font-size:10px;font-weight:700;letter-spacing:1px;' +
        '">' + key + '</span>' +
      '<div style="flex:1;">' +
        '<div style="font-size:11px;font-weight:600;color:#d8e8f0;">' + name + '</div>' +
        '<div style="font-size:9px;color:rgba(140,190,220,0.5);">' + desc + '</div>' +
      '</div>' +
    '</div>';
  }

  // ------------------------------------------------------------
  // LOG TAB
  // ------------------------------------------------------------
  function renderLog() {
    if (!BF()) return '<div class="hud-label">BATTLE LOG OFFLINE</div>';
    var log = BF().getLog() || [];
    var recent = log.slice(-30).reverse();

    var html = label('COMBAT FEED');
    for (var i = 0; i < recent.length; i++) {
      var line = recent[i];
      // <<< RB ADD: rb colour + RB+RED reinforcement tint
      var color = 'rgba(160,180,200,0.6)';
      if (line.indexOf('(ZMP)') !== -1) color = '#7fdf7f';
      else if (line.indexOf('(BL)') !== -1) color = '#ff7070';
      else if (line.indexOf('(RB)') !== -1) color = '#e08080';
      else if (line.indexOf('RB+RED') !== -1) color = '#e08080';

      // Extract the [Xs] timestamp
      var match = line.match(/^\[(\d+)s\]\s*(.+)$/);
      var timePart = '';
      var textPart = line;
      if (match) {
        timePart = match[1] + 's';
        textPart = match[2];
      }

      html += '<div style="padding:4px 6px;margin:3px 0;' +
        'background:rgba(12,18,26,0.4);' +
        'border-left:2px solid ' + color + ';' +
        'font-size:10px;line-height:1.4;">' +
        '<span class="hud-value" style="color:rgba(140,190,220,0.4);font-size:9px;' +
          'margin-right:6px;">' + timePart + '</span>' +
        '<span style="color:' + color + ';">' + textPart + '</span>' +
      '</div>';
    }
    return html;
  }

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------
  function label(text) {
    return '<div class="hud-label" style="margin-bottom:6px;">' + text + '</div>';
  }
  function divider() {
    return '<div class="hud-divider" style="margin:12px 0;"></div>';
  }

  // ============================================================
  // BOTTOM-LEFT ACTION DECK
  // ============================================================
  function buildActionDeck() {
    deck = document.createElement('div');
    deck.className = 'hud-panel';
    deck.style.cssText =
      'position:absolute;bottom:8px;left:8px;padding:10px 14px;' +
      'display:flex;flex-direction:column;gap:6px;' +
      'pointer-events:auto;min-width:200px;';

    deck.innerHTML =
      '<div class="hud-label" style="margin-bottom:2px;">TACTICAL</div>' +
      deckBtn('R', 'Recon Launch', '#7fdcff', 'uav-recon') +
      deckBtn('T', 'Strike Target', '#ff7070', 'uav-strike') +
      deckBtn('ESC', 'Cancel', 'rgba(160,180,200,0.5)', 'uav-cancel');

    root.appendChild(deck);

    var btns = deck.querySelectorAll('[data-action]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = (function (el) {
        return function () { handleDeckAction(el.getAttribute('data-action')); };
      })(btns[i]);
    }
  }

  function deckBtn(key, label2, color, action) {
    return '<div data-action="' + action + '" style="' +
      'display:flex;align-items:center;gap:8px;padding:5px 8px;' +
      'background:rgba(12,18,26,0.6);border-left:2px solid ' + color + ';' +
      'cursor:pointer;transition:all 0.12s ease;' +
      '">' +
      '<span style="' +
        'display:inline-block;padding:2px 6px;min-width:24px;text-align:center;' +
        'background:rgba(0,0,0,0.5);border:1px solid ' + color + ';' +
        'color:' + color + ';font-family:JetBrains Mono,monospace;' +
        'font-size:9px;font-weight:700;' +
        '">' + key + '</span>' +
      '<span style="font-size:11px;color:#d8e8f0;">' + label2 + '</span>' +
    '</div>';
  }

  function handleDeckAction(action) {
    // Simulate keypress so BattleDrones picks it up
    var code = null;
    if (action === 'uav-recon') code = 'KeyR';
    else if (action === 'uav-strike') code = 'KeyT';
    else if (action === 'uav-cancel') code = 'Escape';

    if (code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: code }));
    }
  }

  // ============================================================
  // ACTION HANDLERS
  // ============================================================
  function wireActions() {
    var btns = rightPanel.querySelectorAll('button[data-action]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = (function (el) {
        return function () { handleAction(el.getAttribute('data-action')); };
      })(btns[i]);
    }
  }

  function handleAction(action) {
    if (!BE()) return;
    var econPanel = document.getElementById('battle-economy-panel');
    if (action === 'civ')       simulateClick(econPanel, 'data-buy', 'civ');
    else if (action === 'mil')  simulateClick(econPanel, 'data-buy', 'mil');
    else if (action === 'fort') simulateClick(econPanel, 'data-buy', 'fort');
    else if (action === 'infra') simulateClick(econPanel, 'data-buy', 'infra');
    else if (action.indexOf('build_') === 0) {
      var type = action.substring(6);
      simulateClick(econPanel, 'data-build', type);
    }
    setTimeout(renderRightPanel, 80);
  }

  function simulateClick(parent, attr, value) {
    if (!parent) return;
    var el = parent.querySelector('[' + attr + '="' + value + '"]');
    if (el) el.click();
  }

  // ============================================================
  // HOTKEYS
  // ============================================================
  function installHotkeys() {
    window.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code === 'Digit1') setTab('command');
      else if (e.code === 'Digit2') setTab('econ');
      else if (e.code === 'Digit3') setTab('drones');
      else if (e.code === 'Digit4') setTab('log');
    });
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    refreshTimer += dt;
    if (refreshTimer >= 0.5) {
      refreshTimer = 0;
      renderTopBar();
      renderRightPanel();
    }
  }

  function shutdown() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  return {
    init: init,
    update: update,
    shutdown: shutdown,
    setTab: setTab
  };
})();