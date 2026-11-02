// ui_mp_extras.js — Multiplayer UI extensions.
//
// Load AFTER ui_mp.js.
//
// Contents:
//   1.  Helpers (party lookup, faction lookup, escape)
//   2.  Toast (mirrors UIMP's private toast)
//   3.  Identity helper (which faction am I?)
//   4.  Congress — per-faction policy tree
//   5.  Ambitions — rival party objectives
//   6.  Cells — crush discovered Black League cells
//   7.  Newspaper — student paper with MP flavour
//   8.  Cabinet — full ministry view with actions
//   9.  Coalition formation — leader picks partners
//   10. Election results — reads lastElection
//   11. Presidential cards — draw one per week
//   12. Music helpers (green_and_white, arb)
//   13. Briefing (overrides UIMP stub)
//   14. Achievements — 20 MP-specific ones
//   15. _setTab override — render tabs even in lobby
//   16. Boot — seeds state, ticks congress/achievements

(function () {
  'use strict';

  // ============================================================
  // DEPENDENCY CHECK
  // ============================================================
  if (!window.UIMP)        { console.warn('[MPX] UIMP missing'); return; }
  if (!window.EngineMP)    { console.warn('[MPX] EngineMP missing'); return; }
  if (!window.Multiplayer) { console.warn('[MPX] Multiplayer missing'); return; }
  if (!window.GameData)    { console.warn('[MPX] GameData missing'); return; }

  var UIMP = window.UIMP;
  var EMP  = window.EngineMP;
  var MP   = window.Multiplayer;
  var D    = window.GameData;

  console.log('[MPX] loading');

  // ============================================================
  // 1. HELPERS
  // ============================================================
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function findParty(id) {
    if (!D || !D.PARTIES) return null;
    var u = String(id).toUpperCase();
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (String(D.PARTIES[i].id).toUpperCase() === u) return D.PARTIES[i];
    }
    return null;
  }

  function partyShort(id) {
    var p = findParty(id);
    return p ? (p.short || p.tag || p.id) : id;
  }

  function partyColor(id) {
    if (String(id).toUpperCase() === 'ZPF') return '#006400';
    var p = findParty(id);
    return (p && p.color) || '#888';
  }

  function faction(id) {
    if (!D || !D.FACTIONS) return null;
    for (var i = 0; i < D.FACTIONS.length; i++) {
      if (D.FACTIONS[i].id === id) return D.FACTIONS[i];
    }
    return null;
  }

  function factionName(id) {
    var f = faction(id);
    return f ? f.name : id;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ============================================================
  // 2. TOAST
  // ============================================================
  var _toastTimer = null;
  UIMP._mpxToast = function (msg) {
    var t = $('toast');
    if (!t) { console.log('[MPX] ' + msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  };

  // ============================================================
  // 3. IDENTITY
  // ============================================================
  UIMP._mpxMyFaction = function () {
    var st = EMP.getState();
    if (!st || !st.players || st.players.length === 0) return null;
    var isHost = MP.amHost && MP.amHost();
    var idx = isHost ? 0 : 1;
    if (!st.players[idx]) idx = 0;
    return st.players[idx].factionId;
  };

  UIMP._mpxIsHost = function () {
    return !!(MP.amHost && MP.amHost());
  };

  // ============================================================
  // 4. CONGRESS
  // ============================================================
  var CONGRESS_NAMES = {
    education:      '📚 Education',
    economy:        '💰 Economy',
    justice:        '⚖️ Justice',
    technology:     '💻 Technology',
    health:         '🏥 Health',
    sports:         '🏅 Sports',
    arts:           '🎭 Arts',
    infrastructure: '🏗️ Infrastructure'
  };

  function ensureCongress(st) {
    if (!st) return null;
    if (!st.mpCongress) st.mpCongress = {};
    var players = st.players || [];
    for (var i = 0; i < players.length; i++) {
      var fid = players[i].factionId;
      if (!fid) continue;
      if (!st.mpCongress[fid]) {
        st.mpCongress[fid] = {
          points: 5,
          policies: {
            education:      { level: 1, max: 5, cost: 2 },
            economy:        { level: 1, max: 5, cost: 2 },
            justice:        { level: 1, max: 5, cost: 2 },
            technology:     { level: 1, max: 5, cost: 2 },
            health:         { level: 1, max: 5, cost: 2 },
            sports:         { level: 1, max: 5, cost: 2 },
            arts:           { level: 1, max: 5, cost: 2 },
            infrastructure: { level: 1, max: 5, cost: 2 }
          },
          history: []
        };
      }
    }
    return st.mpCongress;
  }

  function renderCongressTab() {
    var st = EMP.getState();
    var html = '<h2>🏛️ Congress</h2>';

    if (!st || !st.players) {
      html += '<div class="stat sub">No match yet.</div>';
      html += '<p class="quiet" style="font-size:0.8rem;margin-top:10px;">';
      html += 'In a match, each faction earns congress points every 5 weeks ' +
              'and spends them on policy upgrades. Policies give permanent ' +
              'bonuses to unity, faculty, funds, momentum, or volunteers.';
      html += '</p>';
      html += '<hr class="rule">';
      html += '<div style="font-size:0.8rem;color:#888;">';
      html += '<div>📚 Education — +3 faculty per level</div>';
      html += '<div>💰 Economy — +5 funds per level</div>';
      html += '<div>⚖️ Justice — +2 unity per level</div>';
      html += '<div>💻 Technology — +1 momentum per level</div>';
      html += '<div>🏥 Health — +2 volunteers per level</div>';
      html += '<div>🏅 Sports — +1 volunteers per level</div>';
      html += '<div>🎭 Arts — +1 momentum per level</div>';
      html += '<div>🏗️ Infrastructure — +3 funds per level</div>';
      html += '</div>';
      return html;
    }

    var myFaction = UIMP._mpxMyFaction();
    if (!myFaction) return html + '<div class="stat sub">Unknown faction.</div>';

    var all = ensureCongress(st);
    var c = all[myFaction];
    if (!c) return html + '<div class="stat sub">No congress for this faction.</div>';

    html += '<div class="result-box" style="border:2px solid #ffd700;margin-bottom:12px;padding:10px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span>Congress Points</span>';
    html += '<span style="font-size:1.6rem;color:#ffd700;font-weight:bold;">' + c.points + '</span>';
    html += '</div>';
    html += '<div style="font-size:0.75rem;color:#888;">+1 point every 5 weeks.</div>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    for (var pid in c.policies) {
      var p = c.policies[pid];
      var canUp = c.points >= p.cost && p.level < p.max;
      html += '<div style="background:rgba(255,255,255,0.03);border-radius:4px;' +
              'padding:8px 12px;border-left:3px solid ' +
              (p.level >= p.max ? '#5fae3c' : '#666') + ';">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<span style="font-weight:bold;font-size:0.85rem;">' +
              (CONGRESS_NAMES[pid] || pid) + '</span>';
      html += '<span style="font-size:0.75rem;">Lv ' + p.level + '/' + p.max + '</span>';
      html += '</div>';
      html += '<div class="meter" style="height:4px;margin:4px 0;">';
      html += '<i style="width:' + ((p.level / p.max) * 100) + '%;background:' +
              (p.level >= p.max ? '#5fae3c' : '#ffd700') + ';"></i>';
      html += '</div>';
      if (p.level < p.max) {
        html += '<button class="chip" ' + (canUp ? '' : 'disabled ') +
                'onclick="UIMP._mpxUpgradePolicy(\'' + pid + '\')">Upgrade (' +
                p.cost + ')</button>';
      } else {
        html += '<span style="font-size:0.7rem;color:#5fae3c;">MAX</span>';
      }
      html += '</div>';
    }
    html += '</div>';

    if (c.history.length > 0) {
      html += '<h3 style="margin-top:14px;">History</h3>';
      html += '<div style="max-height:120px;overflow-y:auto;font-size:0.8rem;">';
      var recent = c.history.slice(-10).reverse();
      for (var i = 0; i < recent.length; i++) {
        var h = recent[i];
        html += '<div style="display:flex;justify-content:space-between;' +
                'padding:2px 0;border-bottom:1px solid #222;">';
        html += '<span>Week ' + h.week + ': ' + (CONGRESS_NAMES[h.policy] || h.policy) + '</span>';
        html += '<span style="color:#ffd700;">Lv ' + h.level + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    return html;
  }

  UIMP._mpxUpgradePolicy = function (policyId) {
    var st = EMP.getState();
    if (!st) return;
    var myFaction = UIMP._mpxMyFaction();
    if (!myFaction) return;
    var all = ensureCongress(st);
    var c = all[myFaction];
    var p = c.policies[policyId];
    if (!p || p.level >= p.max || c.points < p.cost) {
      UIMP._mpxToast('Cannot upgrade.');
      return;
    }
    c.points -= p.cost;
    p.level += 1;
    c.history.push({ week: st.week, policy: policyId, level: p.level });

    var shared = st.shared[myFaction];
    if (shared) {
      if (policyId === 'economy')             shared.funds = (shared.funds || 0) + 5;
      else if (policyId === 'education')      shared.faculty = Math.min(100, (shared.faculty || 50) + 3);
      else if (policyId === 'justice')        shared.unity = Math.min(100, (shared.unity || 50) + 2);
      else if (policyId === 'technology')     shared.momentum = Math.min(20, (shared.momentum || 0) + 1);
      else if (policyId === 'health')         shared.volunteers = (shared.volunteers || 0) + 2;
      else if (policyId === 'infrastructure') shared.funds = (shared.funds || 0) + 3;
      else if (policyId === 'sports')         shared.volunteers = (shared.volunteers || 0) + 1;
      else if (policyId === 'arts')           shared.momentum = Math.min(20, (shared.momentum || 0) + 1);
    }
    UIMP._mpxToast('Upgraded ' + (CONGRESS_NAMES[policyId] || policyId) + ' to Lv ' + p.level);
    UIMP._setTab('congress');
  };

  // ============================================================
  // 5. AMBITIONS
  // ============================================================
  function renderAmbitionsTab() {
    var st = EMP.getState();
    var html = '<h2>🎯 Ambitions</h2>';

    if (!st || !st.players) {
      html += '<div class="stat sub">No match yet.</div>';
      html += '<p class="quiet" style="font-size:0.8rem;margin-top:10px;">';
      html += 'Rival parties pursue their own objectives. Once a match starts, ' +
              'their ambitions are tracked here. When a party completes an ' +
              'ambition, it gains support at the ZMP\'s expense.';
      html += '</p>';
      return html;
    }

    ensureExtrasState(st);

    var parties = EMP.activeParties ? EMP.activeParties(st) : [];
    var hasAny = false;
    for (var i = 0; i < parties.length; i++) {
      var p = parties[i];
      if (p.id === 'ZMP' || p.id === 'other') continue;
      var data = st.partyAmbitions.activeParties[p.id];
      if (!data) continue;
      hasAny = true;

      var color = partyColor(p.id);
      html += '<div class="result-box" style="border-left:4px solid ' + color +
              ';margin:6px 0;padding:8px 12px;">';
      html += '<div style="display:flex;justify-content:space-between;">';
      html += '<span style="color:' + color + ';font-weight:bold;">' +
              esc(p.short || p.id) + '</span>';
      html += '<span style="font-size:0.75rem;color:#888;">Strength ' +
              (data.strength || 1) + '/10</span>';
      html += '</div>';
      html += '<div style="font-size:0.85rem;margin:4px 0;">';
      html += '<span style="color:#ffcc00;">🎯 ' +
              esc(data.ambition ? data.ambition.name : '—') + '</span>';
      html += '</div>';
      if (data.ambition && data.ambition.desc) {
        html += '<div style="font-size:0.75rem;color:#aaa;">' +
                esc(data.ambition.desc) + '</div>';
      }
      var prog = data.completed ? 100 : Math.min(100, data.progress || 0);
      html += '<div class="meter" style="height:4px;margin:4px 0;">';
      html += '<i style="width:' + prog + '%;background:' +
              (data.completed ? '#5fae3c' : '#ffcc00') + ';"></i></div>';
      if (data.completed) {
        html += '<div style="font-size:0.7rem;color:#5fae3c;">✓ Completed</div>';
      }
      html += '</div>';
    }
    if (!hasAny) html += '<div class="stat sub">No active ambitions.</div>';
    return html;
  }

  // ============================================================
  // 6. CELLS
  // ============================================================
  function renderCellsTab() {
    var st = EMP.getState();
    var html = '<h2>🗺️ Hunt Cells</h2>';

    if (!st || !st.players) {
      html += '<div class="stat sub">No match yet.</div>';
      html += '<p class="quiet" style="font-size:0.8rem;margin-top:10px;">';
      html += 'The Black League plants cells across the school. When a cell ' +
              'is discovered, you can spend funds to crush it. Crushing gives ' +
              'a one-time support boost and slows the League.';
      html += '</p>';
      return html;
    }

    var sys = st.blackLeagueCells || { cells: [], intelligence: 0 };
    var cells = sys.cells || [];
    var active = [], destroyed = [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].destroyed) destroyed.push(cells[i]);
      else active.push(cells[i]);
    }

    html += '<div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:6px;">';
    html += '<span>Active: <b>' + active.length + '</b></span>';
    html += '<span>Destroyed: <b>' + destroyed.length + '</b></span>';
    html += '<span>Intel: <b>' + (sys.intelligence || 0) + '</b></span>';
    html += '</div>';

    if (active.length === 0) {
      html += '<div class="stat sub">No active cells.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">';
      for (var j = 0; j < active.length; j++) {
        var c = active[j];
        var border = c.discovered ? '#cc0000' : '#666';
        html += '<div style="background:rgba(204,0,0,0.1);border:2px solid ' +
                border + ';border-radius:6px;padding:8px;text-align:center;">';
        html += '<div style="font-size:1.5rem;">' + (c.icon || '⚫') + '</div>';
        html += '<div style="font-size:0.75rem;font-weight:bold;">' +
                (c.discovered ? esc(c.locationName) : '???') + '</div>';
        html += '<div style="font-size:0.65rem;color:#888;">Str ' +
                Math.round(c.strength || 0) + '/5</div>';
        if (c.supporters) {
          html += '<div style="font-size:0.65rem;color:#888;">' +
                  c.supporters + ' supporters</div>';
        }
        if (c.discovered) {
          var cost = 10 + Math.round((c.strength || 1) * 3);
          html += '<button class="chip" style="margin-top:4px;background:#cc0000;" ' +
                  'onclick="UIMP._mpxCrushCell(\'' + esc(c.location) + '\')">' +
                  'Crush ($' + cost + ')</button>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    if (st.blWalls) {
      var broken = st.blWalls.wallsBroken || 0;
      var total = st.blWalls.wallsTotal || 10;
      html += '<h3 style="margin-top:14px;">Black League Walls</h3>';
      html += '<div style="height:8px;background:rgba(0,0,0,0.5);border-radius:4px;overflow:hidden;">';
      html += '<div style="height:100%;width:' + ((broken / total) * 100) +
              '%;background:#a000a0;"></div></div>';
      html += '<div style="text-align:center;font-size:0.75rem;color:#888;">' +
              broken + ' / ' + total + '</div>';

      if (st.blWalls.prophecyLog && st.blWalls.prophecyLog.length > 0) {
        html += '<div style="margin-top:8px;font-size:0.8rem;font-style:italic;' +
                'color:#a000a0;">"' +
                esc(st.blWalls.prophecyLog[st.blWalls.prophecyLog.length - 1]) +
                '"</div>';
      }
    }
    return html;
  }

  UIMP._mpxCrushCell = function (locationId) {
    var st = EMP.getState();
    if (!st || !st.blackLeagueCells) return;
    var cell = null;
    var cells = st.blackLeagueCells.cells || [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].location === locationId && !cells[i].destroyed) {
        cell = cells[i]; break;
      }
    }
    if (!cell) { UIMP._mpxToast('No cell there.'); return; }

    var myFaction = UIMP._mpxMyFaction();
    var shared = st.shared[myFaction];
    if (!shared) { UIMP._mpxToast('No faction shared state.'); return; }

    var cost = 10 + Math.round((cell.strength || 1) * 3);
    if ((shared.funds || 0) < cost) { UIMP._mpxToast('Need $' + cost + '.'); return; }
    shared.funds -= cost;

    var chance = 0.3 + ((shared.unity || 50) / 200) + ((shared.faculty || 50) / 200);
    if (chance > 0.95) chance = 0.95;

    if (Math.random() < chance) {
      cell.destroyed = true;
      st.blackLeagueCells.totalCellsDestroyed =
        (st.blackLeagueCells.totalCellsDestroyed || 0) + 1;
      var reward = 3 + (cell.strength || 1);
      shared.support = Math.min(100, (shared.support || 0) + reward * 0.3);
      var key = String(myFaction).toUpperCase();
      if (st.partySupport && st.partySupport[key] !== undefined) {
        st.partySupport[key] = Math.min(100, st.partySupport[key] + reward * 0.3);
      }
      UIMP._mpxToast('💥 Cell destroyed!');
    } else {
      cell.strength = Math.min(5, (cell.strength || 1) + 0.5);
      UIMP._mpxToast('❌ Raid failed.');
    }
    UIMP._setTab('cells');
  };

  // ============================================================
  // 7. NEWSPAPER
  // ============================================================
  function renderNewspaperTab() {
    var st = EMP.getState();
    var html = '<h2>📰 The Student Voice</h2>';

    if (!st || !st.players) {
      html += '<div class="stat sub">No match yet.</div>';
      return html;
    }

    var stories = [];
    var blSupport = (st.partySupport && st.partySupport.BL) || 0;
    var zmpSupport = (st.partySupport && st.partySupport.ZMP) || 0;
    var week = st.week;

    if (blSupport > 40) {
      stories.push({
        h: '⚫ BLACK LEAGUE SURGES!',
        s: 'Students fear as the League reaches ' + Math.round(blSupport) + '%',
        c: '#cc0000'
      });
    } else if (blSupport > 25) {
      stories.push({
        h: '⚫ Black League on the Move',
        s: 'The detention bloc expands its reach across the corridors.',
        c: '#cc6600'
      });
    } else if (blSupport < 8 && st.battle3Won) {
      stories.push({
        h: '🏴 BLACK LEAGUE CRUSHED!',
        s: 'The detention bloc lies in ruins after a historic defeat.',
        c: '#5fae3c'
      });
    }

    if (zmpSupport > 45) {
      stories.push({
        h: '📈 ZMP Dominates the Polls',
        s: 'The Student Union Coalition reaches ' + Math.round(zmpSupport) + '%.',
        c: '#5fae3c'
      });
    } else if (zmpSupport < 20) {
      stories.push({
        h: '📉 ZMP in Crisis',
        s: 'Internal divisions threaten the coalition\'s future.',
        c: '#cc0000'
      });
    }

    if (st.lastElection && st.lastElection.week) {
      var zmpSeats = (st.lastElection.seats && st.lastElection.seats.ZMP) || 0;
      stories.push({
        h: '🗳️ Election Held — Week ' + st.lastElection.week,
        s: 'ZMP holds ' + zmpSeats + ' seats.',
        c: '#ffd700'
      });
    }

    if (st.blWalls && st.blWalls.wallsBroken > 0) {
      stories.push({
        h: 'Walls Broken: ' + st.blWalls.wallsBroken + ' / 10',
        s: 'The cult publicly reads the prophecy.',
        c: '#a000a0'
      });
    }

    // Versus story — unique to MP
    if (st.players && st.players.length === 2) {
      var f1 = faction(st.players[0].factionId);
      var f2 = faction(st.players[1].factionId);
      stories.push({
        h: '⚔️ ' + (f1 ? f1.name : 'ZMP') + ' vs ' + (f2 ? f2.name : 'BL'),
        s: 'The two-party contest continues. Week ' + week + '.',
        c: '#66aaff'
      });
    }

    // Ambient stories
    var ambient = [
      { h: '📚 Library Renovation Debate', s: 'Students split on new design proposals.', c: '#888' },
      { h: '🎭 Drama Club Fundraiser', s: 'Spring musical budget still unresolved.', c: '#888' },
      { h: '🏈 Athletes Demand Better Facilities', s: 'Petition with 200+ signatures delivered.', c: '#888' },
      { h: '💻 Wifi Woes Continue', s: 'Students frustrated by slow internet speeds.', c: '#888' }
    ];
    if (stories.length < 2) {
      stories.push(ambient[(week + stories.length) % ambient.length]);
    }

    if (stories.length === 0) {
      stories.push({ h: 'Quiet week', s: 'Nothing of note in the school paper.', c: '#888' });
    }

    for (var i = 0; i < stories.length; i++) {
      var s = stories[i];
      html += '<div class="result-box" style="border-left:4px solid ' + s.c +
              ';padding:10px 14px;margin:6px 0;">';
      html += '<div style="font-weight:700;">' + esc(s.h) + '</div>';
      html += '<div style="color:#aaa;font-size:0.85rem;margin-top:4px;">' +
              esc(s.s) + '</div>';
      html += '</div>';
    }
    return html;
  }

  // ============================================================
  // 8. CABINET
  // ============================================================
  function renderCabinetTab() {
    var st = EMP.getState();
    var html = '<h2>💼 Cabinet</h2>';

    if (!st || !st.players) {
      html += '<div class="stat sub">No match yet.</div>';
      return html;
    }
    if (!st.cabinet) {
      html += '<div class="stat sub">No cabinet formed yet. Coalitions form ' +
              'after each election.</div>';
      return html;
    }

    var myFaction = UIMP._mpxMyFaction();
    html += '<div class="stat sub">Leader: <b>' +
            esc(factionName(st.cabinet.leader)) + '</b></div>';
    if (st.cabinet.partners && st.cabinet.partners.length > 0) {
      html += '<div class="stat sub">Partners: ' +
              st.cabinet.partners.map(factionName).map(esc).join(', ') + '</div>';
    }

    var hasAny = false;
    for (var mid in st.cabinet.ministries) {
      var m = st.cabinet.ministries[mid];
      if (!m.party) continue;
      hasAny = true;
      var isMine = m.party === myFaction;
      var borderColor = isMine ? '#ffd700' : '#444';

      html += '<div class="result-box" style="border-left:3px solid ' + borderColor +
              ';padding:10px;margin:8px 0;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline;">';
      html += '<span style="font-weight:700;">' + m.icon + ' ' + esc(m.name) + '</span>';
      html += '<span style="color:' + partyColor(m.party) + ';font-size:0.8rem;">' +
              esc(factionName(m.party)) + '</span>';
      html += '</div>';
      html += '<div class="stat sub" style="font-size:0.75rem;">' + esc(m.desc) + '</div>';

      if (isMine && m.actions && m.actions.length > 0) {
        html += '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">';
        for (var ai = 0; ai < m.actions.length; ai++) {
          var a = m.actions[ai];
          var cost = [];
          if (a.cost && a.cost.ap) cost.push(a.cost.ap + ' AP');
          if (a.cost && a.cost.budget) cost.push('$' + a.cost.budget);
          html += '<button class="act" style="font-size:0.8rem;text-align:left;" ' +
                  'onclick="UIMP._mpxRunMinistryAction(\'' + mid + '\',\'' + a.id + '\')">' +
                  '<b>' + esc(a.name) + '</b>' +
                  '<span class="cost">' + cost.join(' / ') + '</span>' +
                  '<span class="d">' + esc(a.desc) + '</span>' +
                  '</button>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    if (!hasAny) html += '<div class="stat sub">No ministries assigned yet.</div>';
    return html;
  }

  UIMP._mpxRunMinistryAction = function (ministryId, actionId) {
    var st = EMP.getState();
    if (!st || !st.cabinet) return;
    var myFaction = UIMP._mpxMyFaction();
    if (!myFaction) return;

    var res = EMP.resolveMinistryAction(myFaction, ministryId, actionId);
    if (!res.ok) {
      UIMP._mpxToast(res.msg || 'Action failed.');
      return;
    }
    if (res.notes && res.notes.length > 0) {
      UIMP._mpxToast(res.notes.join(' '));
    } else {
      UIMP._mpxToast('Action applied.');
    }

    // Host must broadcast the new state
    if (UIMP._mpxIsHost() && MP.isConnected && MP.isConnected()) {
      MP.send({ type: 'snapshot', state: UIMP._mpxSnapshot(st) });
    }
    UIMP._setTab('cabinet');
  };

  // ============================================================
  // 9. COALITION FORMATION
  // ============================================================
  function renderCoalitionTab() {
    var st = EMP.getState();
    var html = '<h2>🏛️ Coalition</h2>';

    if (!st || !st.players) {
      html += '<div class="stat sub">No match yet.</div>';
      return html;
    }
    if (!st.formation || !st.formation.pending) {
      html += '<div class="stat sub">No formation in progress.</div>';
      return html;
    }

    var p = st.formation.pending;
    var myFaction = UIMP._mpxMyFaction();

    html += '<div class="result-box" style="border:3px solid #ffd700;padding:14px;' +
            'background:rgba(255,215,0,0.06);">';
    html += '<h3 style="color:#ffd700;">🏛️ Coalition Formation</h3>';
    html += '<p>' + esc(factionName(p.leaderId)) + ' leads the attempt.</p>';

    if (p.leaderId === myFaction) {
      html += '<p><b>Your party leads.</b> Choose a template or decline.</p>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">';
      for (var i = 0; i < p.choices.length; i++) {
        var c = p.choices[i];
        var isDecline = c.templateId === '_decline';
        var disabled = !c.reachesMajority && !isDecline;
        html += '<button class="act" ' + (disabled ? 'disabled' : '') +
                ' onclick="UIMP._submitFormation(\'' + c.templateId + '\')" ' +
                'style="text-align:left;">';
        html += '<b>' + esc(c.text) + '</b>';
        html += '<span class="d">' + esc(c.note) + '</span>';
        html += '</button>';
      }
      html += '</div>';
    } else {
      html += '<p>Waiting for <b>' + esc(factionName(p.leaderId)) +
              '</b> to choose. Expires in ' +
              Math.max(0, p.expiresAtWeek - st.week) + ' weeks.</p>';
    }
    html += '</div>';
    return html;
  }

  // ============================================================
  // 10. ELECTION RESULTS
  // ============================================================
  function renderElectionTab() {
    var st = EMP.getState();
    var html = '<h2>🗳️ Elections</h2>';

    if (!st || !st.players) {
      html += '<div class="stat sub">No match yet.</div>';
      return html;
    }

    if (!st.lastElection) {
      html += '<div class="stat sub">No election held yet.</div>';
      html += '<hr class="rule">';
      html += '<div style="font-size:0.8rem;color:#888;">';
      html += '<div>Elections are held every 16 weeks, starting at week 9.</div>';
      html += '<div>Current week: ' + st.week + '</div>';
      html += '</div>';
      return html;
    }

    var e = st.lastElection;
    var majority = e.majority || 23;
    var totalSeats = (D.SEATS) || 45;

    html += '<div style="font-size:0.85rem;color:#aaa;margin-bottom:8px;">' +
            'Week ' + e.week + ' — majority needs ' + majority + ' of ' +
            totalSeats + ' seats.</div>';

    var ids = Object.keys(e.seats || {}).sort(function (a, b) {
      return (e.seats[b] || 0) - (e.seats[a] || 0);
    });

    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      var seats = e.seats[pid];
      if (seats < 1) continue;
      html += '<div class="poll-row">';
      html += '<span class="swatch" style="background:' + partyColor(pid) + ';"></span>';
      html += '<span class="nm">' + esc(partyShort(pid)) + '</span>';
      html += '<span class="pc">' + seats + ' seats</span>';
      html += '</div>';
    }

    html += '<hr class="rule">';
    html += '<div style="font-size:0.8rem;color:#888;">';
    html += '<div>Total seats: ' + totalSeats + '</div>';
    html += '<div>Majority threshold: ' + majority + '</div>';
    html += '</div>';
    return html;
  }

  // ============================================================
  // 11. PRESIDENTIAL CARDS
  // ============================================================
  var PRESIDENTIAL_CARDS = [
    { id: 'emergency', name: 'Emergency Decrees',
      desc: '+5 unity, -3 faculty.',
      apply: function (s) {
        s.unity = Math.min(100, (s.unity || 0) + 5);
        s.faculty = Math.max(0, (s.faculty || 50) - 3);
      } },
    { id: 'subsidy', name: 'Education Subsidy',
      desc: '+$30 funds.',
      apply: function (s) { s.funds = (s.funds || 0) + 30; } },
    { id: 'recruit', name: 'National Recruiting Drive',
      desc: '+8 volunteers.',
      apply: function (s) { s.volunteers = (s.volunteers || 0) + 8; } },
    { id: 'rally', name: 'Presidential Rally',
      desc: '+3 momentum.',
      apply: function (s) { s.momentum = Math.min(20, (s.momentum || 0) + 3); } },
    { id: 'investigate', name: 'Investigation Order',
      desc: 'BL loses 2% support.',
      apply: function (s) {
        if (s.partySupport) s.partySupport.BL = Math.max(0, (s.partySupport.BL || 0) - 2);
      } },
    { id: 'reform', name: 'Reform Package',
      desc: '+2 unity, +2 faculty.',
      apply: function (s) {
        s.unity = Math.min(100, (s.unity || 0) + 2);
        s.faculty = Math.min(100, (s.faculty || 50) + 2);
      } },
    { id: 'pardon', name: 'Political Pardon',
      desc: '+5 unity, -5 momentum.',
      apply: function (s) {
        s.unity = Math.min(100, (s.unity || 0) + 5);
        s.momentum = Math.max(-10, (s.momentum || 0) - 5);
      } }
  ];

  UIMP._mpxDrawPresidentialCard = function () {
    var st = EMP.getState();
    if (!st) { UIMP._mpxToast('No match.'); return; }
    if (!st.presidentialStarted) {
      UIMP._mpxToast('No presidential cycle active.');
      return;
    }
    var myFaction = UIMP._mpxMyFaction();
    if (!myFaction) return;

    if (!st.mpPresidentialDrawn) st.mpPresidentialDrawn = {};
    if (st.mpPresidentialDrawn[myFaction] === st.week) {
      UIMP._mpxToast('Already drew this week.');
      return;
    }
    st.mpPresidentialDrawn[myFaction] = st.week;

    var card = PRESIDENTIAL_CARDS[Math.floor(Math.random() * PRESIDENTIAL_CARDS.length)];
    var shared = st.shared[myFaction];
    if (shared && card.apply) card.apply(shared);

    UIMP._mpxToast('🎴 ' + card.name + ' — ' + card.desc);

    if (UIMP._mpxIsHost() && MP.isConnected && MP.isConnected()) {
      MP.send({ type: 'snapshot', state: UIMP._mpxSnapshot(st) });
    }
    UIMP._forceRender();
  };

  // ============================================================
  // 12. MUSIC
  // ============================================================
  var _audioCtx = null;
  function playTrack(filename, toastMsg) {
    try {
      if (!_audioCtx) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        _audioCtx = new Ctx();
      }
      if (_audioCtx.state === 'suspended') _audioCtx.resume();

      fetch('js/' + filename)
        .then(function (r) {
          if (!r.ok) throw new Error('not found');
          return r.arrayBuffer();
        })
        .then(function (buf) { return _audioCtx.decodeAudioData(buf); })
        .then(function (decoded) {
          var src = _audioCtx.createBufferSource();
          src.buffer = decoded;
          var gain = _audioCtx.createGain();
          gain.gain.value = 0.7;
          src.connect(gain);
          gain.connect(_audioCtx.destination);
          src.start(0);
          if (toastMsg) UIMP._mpxToast(toastMsg);
        })
        .catch(function () {
          try {
            var el = new Audio('js/' + filename);
            el.volume = 0.7;
            el.play().catch(function () {});
          } catch (e) {}
        });
    } catch (e) {}
  }

  UIMP._mpxPlayGreenAndWhite = function () {
    playTrack('green_and_white.mp3', '👑 The monarchy is established!');
  };
  UIMP._mpxPlayArb = function () {
    playTrack('arb.mp3', '🌍 Victory with Wein!');
  };

  // ============================================================
  // 13. BRIEFING
  // ============================================================
  UIMP._mpxMainBackup = null;

  function showInMain(html) {
    var m = $('main');
    if (!m) return;
    if (UIMP._mpxMainBackup === null) UIMP._mpxMainBackup = m.innerHTML;
    m.innerHTML = html;
  }

  UIMP._mpxBack = function () {
    var m = $('main');
    if (!m) return;
    if (UIMP._mpxMainBackup !== null) {
      m.innerHTML = UIMP._mpxMainBackup;
      UIMP._mpxMainBackup = null;
    } else {
      if (!EMP.getState() && typeof UIMP._goLobby === 'function') {
        UIMP._goLobby();
      } else {
        UIMP._setTab('poll');
      }
    }
  };

  UIMP._showBriefing = function () {
    var html = '';
    html += '<h2 class="scene-title">Briefing — Multiplayer</h2>';
    html += '<p><b>Goal.</b> Win ' + ((D.MAJORITY) || 23) + ' of ' +
            ((D.SEATS) || 45) + ' council seats, alone or in coalition, after ' +
            ((D.WEEKS) || 104) + ' weeks.</p>';
    html += '<p><b>Turn order.</b> Both players submit one action per week. ' +
            'The week resolves when both are ready.</p>';
    html += '<p><b>Disconnects.</b> A player who drops for 30 s forfeits the match.</p>';

    html += '<hr class="rule">';
    html += '<h3>The student body</h3>';
    if (D.DEMOS) {
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dm = D.DEMOS[i];
        html += '<div class="stat"><span>' + esc(dm.name) +
                ' <span class="quiet">' + Math.round(dm.weight * 100) +
                '%</span></span></div>';
        if (dm.blurb) {
          html += '<div class="stat sub" style="margin-bottom:4px;">' +
                  esc(dm.blurb) + '</div>';
        }
      }
    }

    html += '<hr class="rule">';
    html += '<h3>The parties</h3>';
    if (D.PARTIES) {
      for (var j = 0; j < D.PARTIES.length; j++) {
        var p = D.PARTIES[j];
        if (p.id === 'other') continue;
        html += '<div class="stat"><span style="color:' +
                (p.color || '#888') + ';">' + esc(p.short || p.id) +
                '</span></div>';
        if (p.blurb) {
          html += '<div class="stat sub" style="margin:0 0 6px 0;">' +
                  esc(p.blurb) + '</div>';
        }
      }
    }

    html += '<hr class="rule">';
    html += '<h3>The factions</h3>';
    if (D.FACTIONS) {
      for (var k = 0; k < D.FACTIONS.length; k++) {
        var f = D.FACTIONS[k];
        html += '<div class="stat"><span>' + esc(f.name) + '</span></div>';
        if (f.desc) {
          html += '<div class="stat sub" style="margin:0 0 6px 0;">' +
                  esc(f.desc) + '</div>';
        }
      }
    }

    html += '<hr class="rule">';
    html += '<h3>Tabs</h3>';
    html += '<div style="font-size:0.85rem;color:#aaa;line-height:1.6;">';
    html += '<div><b>Poll</b> — projected national support</div>';
    html += '<div><b>Seats</b> — projected council composition</div>';
    html += '<div><b>Trend</b> — support over time</div>';
    html += '<div><b>Congress</b> — spend points on party policies</div>';
    html += '<div><b>Ambitions</b> — rival party objectives</div>';
    html += '<div><b>News</b> — the student paper</div>';
    html += '<div><b>Hunt Cells</b> — crush Black League cells</div>';
    html += '<div><b>Cabinet</b> — coalition ministries and actions</div>';
    html += '</div>';

    html += '<div class="btn-row" style="margin-top:14px;">';
    html += '<button class="btn" onclick="UIMP._mpxBack()">Back</button>';
    html += '</div>';
    showInMain(html);
  };

  // ============================================================
  // 14. ACHIEVEMENTS
  // ============================================================
  var MP_ACH = [
    { id: 'mp_first_blood', name: 'First Blood', icon: '⚔️',
      desc: 'Win a battle in multiplayer.',
      check: function (st) { return st.battle2Won === true || st.battle3Won === true; } },
    { id: 'mp_crown_held', name: 'The Crown Holds', icon: '👑',
      desc: 'Survive a Black League takeover attempt.',
      check: function (st) { return st.blTakeoverAttempted === true && st.finished !== true; } },
    { id: 'mp_landslide', name: 'Landslide', icon: '🗳️',
      desc: 'Win an absolute majority in the Council.',
      check: function (st) {
        var s = (st.lastElection && st.lastElection.seats && st.lastElection.seats.ZMP) || 0;
        return s >= ((D.MAJORITY) || 23);
      } },
    { id: 'mp_dominant', name: 'Dominant Party', icon: '📈',
      desc: 'Reach 55% national support.',
      check: function (st) { return ((st.partySupport && st.partySupport.ZMP) || 0) >= 55; } },
    { id: 'mp_bl_crushed', name: 'Black League Crushed', icon: '🏴',
      desc: 'Reduce the Black League below 5% after week 20.',
      check: function (st) {
        var s = (st.partySupport && st.partySupport.BL) || 0;
        return s > 0 && s < 5 && st.week > 20;
      } },
    { id: 'mp_full_term', name: 'Full Term', icon: '⏳',
      desc: 'Reach week 104.',
      check: function (st) { return st.week >= 104; } },
    { id: 'mp_coalition_master', name: 'Coalition Master', icon: '🤝',
      desc: 'Form a cabinet with 3+ partners.',
      check: function (st) {
        return st.cabinetFormation && st.cabinetFormation.partners &&
               st.cabinetFormation.partners.length >= 3;
      } },
    { id: 'mp_presidential', name: 'Mr. President', icon: '🎖️',
      desc: 'Elect Ahmad VI as president.',
      check: function (st) {
        return st.lastPresidentialElection && st.lastPresidentialElection.winner === 'ahmad';
      } },
    { id: 'mp_survivor', name: 'Survivor', icon: '💪',
      desc: 'Finish a match with unity above 70.',
      check: function (st) { return st.finished === true && (st.unity || 0) >= 70; } },
    { id: 'mp_walkover', name: 'Walkover', icon: '🚪',
      desc: 'Win by opponent disconnect.',
      check: function (st) { return st.winReason === 'forfeit'; } },
    { id: 'mp_host_win', name: 'Host Win', icon: '🖥️',
      desc: 'Win a match as the host.',
      check: function (st) {
        return st.finished === true && st.winners &&
               st.winners.indexOf('p1') !== -1 && MP.amHost && MP.amHost();
      } },
    { id: 'mp_client_win', name: 'Underdog', icon: '🎮',
      desc: 'Win a match as the client.',
      check: function (st) {
        return st.finished === true && st.winners &&
               st.winners.indexOf('p2') !== -1 && MP.amHost && !MP.amHost();
      } },
    { id: 'mp_policy_max', name: 'Policy Master', icon: '📜',
      desc: 'Max out any congress policy.',
      check: function (st) {
        if (!st.mpCongress) return false;
        for (var fid in st.mpCongress) {
          var c = st.mpCongress[fid];
          for (var pid in c.policies) {
            if (c.policies[pid].level >= c.policies[pid].max) return true;
          }
        }
        return false;
      } },
    { id: 'mp_cell_hunter', name: 'Cell Hunter', icon: '🎯',
      desc: 'Destroy 3 Black League cells.',
      check: function (st) {
        return st.blackLeagueCells &&
               st.blackLeagueCells.totalCellsDestroyed >= 3;
      } },
    { id: 'mp_wall_breaker', name: 'Wall Breaker', icon: '🧱',
      desc: 'Break 5 Black League walls.',
      check: function (st) {
        return st.blWalls && st.blWalls.wallsBroken >= 5;
      } },
    { id: 'mp_unity_rock', name: 'Rock of Unity', icon: '🪨',
      desc: 'Reach 90 unity.',
      check: function (st) { return (st.unity || 0) >= 90; } },
    { id: 'mp_funded', name: 'Well Funded', icon: '💰',
      desc: 'Hold $500 or more.',
      check: function (st) {
        var shared = st.shared || {};
        for (var fid in shared) {
          if ((shared[fid].funds || 0) >= 500) return true;
        }
        return false;
      } },
    { id: 'mp_momentum', name: 'Full Momentum', icon: '⚡',
      desc: 'Reach 20 momentum.',
      check: function (st) { return (st.momentum || 0) >= 20; } },
    { id: 'mp_late_game', name: 'Late Game', icon: '🌙',
      desc: 'Reach week 90.',
      check: function (st) { return st.week >= 90; } },
    { id: 'mp_both_drew', name: 'Both Drew', icon: '🎴',
      desc: 'Draw a presidential card in a live match.',
      check: function (st) {
        if (!st.mpPresidentialDrawn) return false;
        for (var fid in st.mpPresidentialDrawn) {
          if (st.mpPresidentialDrawn[fid] > 0) return true;
        }
        return false;
      } }
  ];

  function loadAchDB() {
    try {
      var raw = localStorage.getItem('classCouncil_achievements');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveAchDB(db) {
    try { localStorage.setItem('classCouncil_achievements', JSON.stringify(db)); }
    catch (e) {}
  }

  function evaluateAchievements(st) {
    if (!st) return;
    var db = loadAchDB();
    var unlocked = [];
    for (var i = 0; i < MP_ACH.length; i++) {
      var def = MP_ACH[i];
      if (db[def.id]) continue;
      var ok = false;
      try { ok = !!def.check(st); } catch (e) { ok = false; }
      if (ok) {
        db[def.id] = { unlocked: true, unlockedAt: Date.now() };
        unlocked.push(def);
      }
    }
    if (unlocked.length === 0) return;
    saveAchDB(db);
    unlocked.forEach(function (def, idx) {
      setTimeout(function () {
        UIMP._mpxToast('🏆 ' + def.name + ' — ' + def.desc);
      }, idx * 900);
    });
  }

  UIMP._showAchievements = function () {
    var db = loadAchDB();
    var unlockedCount = 0;
    for (var i = 0; i < MP_ACH.length; i++) {
      if (db[MP_ACH[i].id]) unlockedCount++;
    }

    var html = '';
    html += '<h2 class="scene-title">🏆 Achievements</h2>';
    html += '<div class="stat sub" style="justify-content:center;margin-top:-4px;">' +
            unlockedCount + ' / ' + MP_ACH.length + ' unlocked</div>';
    html += '<div class="meter" style="margin:8px 0 16px 0;"><i style="width:' +
            ((unlockedCount / MP_ACH.length) * 100) +
            '%;background:#ffd700;"></i></div>';

    for (var j = 0; j < MP_ACH.length; j++) {
      var a = MP_ACH[j];
      var isU = !!db[a.id];
      html += '<div style="display:flex;align-items:center;padding:8px 12px;' +
              'margin:4px 0;border-radius:4px;' +
              'background:' + (isU
                ? 'rgba(255,215,0,0.15);border-left:3px solid #ffd700;'
                : 'rgba(60,60,60,0.3);border-left:3px solid #444;opacity:0.6;') + '">';
      html += '<span style="font-size:1.6rem;margin-right:14px;">' + a.icon + '</span>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:700;font-size:0.95rem;' +
              (isU ? 'color:#ffd700;' : 'color:#888;') + '">' + esc(a.name) + '</div>';
      html += '<div style="font-size:0.8rem;color:#999;">' + esc(a.desc) + '</div>';
      html += '</div>';
      html += '<span style="font-size:0.9rem;color:' +
              (isU ? '#5fae3c' : '#666') + ';">' + (isU ? '✓' : '🔒') + '</span>';
      html += '</div>';
    }

    html += '<div class="btn-row" style="margin-top:14px;">';
    html += '<button class="btn" onclick="UIMP._mpxBack()">Back</button>';
    html += '</div>';
    showInMain(html);
  };

  // ============================================================
  // SNAPSHOT HELPER (for host → client sync after our actions)
  // ============================================================
  UIMP._mpxSnapshot = function (st) {
    return {
      week: st.week,
      finished: st.finished,
      winners: st.winners,
      winReason: st.winReason,
      losers: st.losers,
      shared: JSON.parse(JSON.stringify(st.shared || {})),
      players: (st.players || []).map(function (p) {
        return {
          id: p.id, factionId: p.factionId,
          isReady: p.isReady, isConnected: p.isConnected
        };
      }),
      log: (st.log || []).slice(-60),
      lastElection: st.lastElection,
      lastElectionWeekFired: st.lastElectionWeekFired,
      pendingEvent: st.pendingEvent,
      pendingElectionResult: st.pendingElectionResult,
      presidentialStarted: st.presidentialStarted,
      presidentialPending: st.presidentialPending,
      presidentialCandidates: st.presidentialCandidates,
      presidentialChoiceMade: st.presidentialChoiceMade,
      lastPresidentialElection: st.lastPresidentialElection,
      pendingPresidentialResult: st.pendingPresidentialResult,
      blWalls: st.blWalls,
      blackLeagueCells: st.blackLeagueCells,
      paramilitaries: st.paramilitaries,
      partySupport: st.partySupport,
      queues: st.queues,
      flags: st.flags,
      affinity: st.affinity,
      formation: st.formation,
      cabinet: st.cabinet,
      cabinetFormation: st.cabinetFormation,
      pendingBattlePrompt: st.pendingBattlePrompt,
      pendingBattleChoice: st.pendingBattleChoice,
      mpCongress: st.mpCongress,
      mpPresidentialDrawn: st.mpPresidentialDrawn,
      partyAmbitions: st.partyAmbitions
    };
  };

  // ============================================================
  // EXTRAS STATE BOOTSTRAP
  // ============================================================
  function ensureExtrasState(st) {
    if (!st) return;
    ensureCongress(st);
    if (!st.partyAmbitions) {
      st.partyAmbitions = {
        activeParties: {}, completedAmbitions: [], partyCompetition: 0
      };
    }
    var parties = EMP.activeParties ? EMP.activeParties(st) : [];
    for (var i = 0; i < parties.length; i++) {
      var p = parties[i];
      if (p.id === 'ZMP' || p.id === 'other') continue;
      if (st.partyAmbitions.activeParties[p.id]) continue;
      st.partyAmbitions.activeParties[p.id] = {
        ambition: {
          id: 'gain_influence', name: 'Gain Influence',
          desc: 'Increase support by 5%',
          target: 'support', amount: 5
        },
        progress: 0, completed: false,
        strength: 1 + Math.floor(
          ((st.partySupport && st.partySupport[p.id]) || 0) / 10
        ),
        allies: [], rivals: []
      };
    }
  }

  // ============================================================
  // FORCE RENDER
  // ============================================================
  UIMP._forceRender = function () {
    var tabs = ['poll','seats','hist','congress','ambitions',
                'news','cells','cabinet'];
    for (var i = 0; i < tabs.length; i++) {
      var b = $('tab-' + tabs[i]);
      if (b && b.className === 'on') {
        if (typeof UIMP._setTab === 'function') UIMP._setTab(tabs[i]);
        return;
      }
    }
  };

  // ============================================================
  // 15. _setTab OVERRIDE
  //
  // UIMP's _setTab calls renderMatchRight, which bails out when
  // no match is active (leaves the panel blank). We intercept
  // after the original returns and render our tabs.
  // ============================================================
  var _origSetTab = UIMP._setTab;
  UIMP._setTab = function (t) {
    if (typeof _origSetTab === 'function') {
      try { _origSetTab.call(UIMP, t); } catch (e) {}
    }

    var el = $('right-body');
    if (!el) return;

    if (t === 'congress')       el.innerHTML = renderCongressTab();
    else if (t === 'ambitions') el.innerHTML = renderAmbitionsTab();
    else if (t === 'cells')     el.innerHTML = renderCellsTab();
    else if (t === 'news')      el.innerHTML = renderNewspaperTab();
    else if (t === 'cabinet')   el.innerHTML = renderCabinetTab();

    // Refresh tab highlights
    var tabs = ['poll','seats','hist','congress','ambitions',
                'news','cells','cabinet'];
    for (var i = 0; i < tabs.length; i++) {
      var b = $('tab-' + tabs[i]);
      if (b) b.className = (tabs[i] === t ? 'on' : '');
    }
  };

  // ============================================================
  // 16. BOOT
  // ============================================================
  function boot() {
    if (!$('right-body')) { setTimeout(boot, 250); return; }

    var st = EMP.getState();
    if (st) ensureExtrasState(st);

    // Periodic tick: seed state, evaluate achievements, grant
    // congress point every 5 weeks.
    var lastWeek = 0;
    setInterval(function () {
      var s = EMP.getState();
      if (!s) return;
      ensureExtrasState(s);
      evaluateAchievements(s);

      if (s.week > 0 && s.week % 5 === 0 && s.week !== lastWeek) {
        lastWeek = s.week;
        var all = ensureCongress(s);
        for (var fid in all) if (all[fid]) all[fid].points += 1;
      }
    }, 2000);

    // Wrap tab buttons so lobby clicks work even before any render
    // happens.
    var tabIds = ['poll','seats','hist','congress','ambitions',
                  'news','cells','cabinet'];
    for (var i = 0; i < tabIds.length; i++) {
      var btn = $('tab-' + tabIds[i]);
      if (!btn || btn._mpxWrapped) continue;
      btn._mpxWrapped = true;
      (function (name, origOnClick) {
        btn.onclick = function (ev) {
          if (typeof origOnClick === 'function') origOnClick.call(btn, ev);
          // Re-run in case UIMP wiped it
          setTimeout(function () {
            var el = $('right-body');
            if (!el) return;
            if (name === 'congress' && !el.querySelector('h2')) {
              el.innerHTML = renderCongressTab();
            } else if (name === 'ambitions' && !el.querySelector('h2')) {
              el.innerHTML = renderAmbitionsTab();
            } else if (name === 'cells' && !el.querySelector('h2')) {
              el.innerHTML = renderCellsTab();
            } else if (name === 'news' && !el.querySelector('h2')) {
              el.innerHTML = renderNewspaperTab();
            } else if (name === 'cabinet' && !el.querySelector('h2')) {
              el.innerHTML = renderCabinetTab();
            }
          }, 25);
        };
      })(tabIds[i], btn.onclick);
    }

        // ------------------------------------------------------------
    // VISIBLE BADGE — proves extras loaded + opens a diagnostic menu
    // ------------------------------------------------------------
    function installBadge() {
      if (document.getElementById('mpx-badge')) return;

      var badge = document.createElement('div');
      badge.id = 'mpx-badge';
      badge.title = 'ui_help.js — click to open extras menu';
      badge.textContent = '🎮 MPX';
      badge.style.cssText = [
        'position:fixed',
        'top:10px',
        'right:14px',
        'z-index:9999',
        'padding:6px 12px',
        'font:700 12px/1 monospace',
        'letter-spacing:1.5px',
        'color:#0a0a0a',
        'background:#7fdcff',
        'border:2px solid #0a0a0a',
        'border-radius:3px',
        'cursor:pointer',
        'user-select:none',
        'box-shadow:0 0 12px rgba(127,220,255,0.7)'
      ].join(';');

      badge.onclick = openMpxMenu;
      document.body.appendChild(badge);
    }

    function openMpxMenu() {
      var existing = document.getElementById('mpx-menu');
      if (existing) { existing.remove(); return; }

      var overlay = document.createElement('div');
      overlay.id = 'mpx-menu';
      overlay.style.cssText = [
        'position:fixed',
        'top:0','left:0','right:0','bottom:0',
        'background:rgba(0,0,0,0.85)',
        'z-index:10000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-family:monospace'
      ].join(';');

      var st = EMP.getState();
      var status = st ? 'In match — week ' + st.week : 'No match loaded';
      var achDB = loadAchDB();
      var achCount = 0;
      for (var i = 0; i < MP_ACH.length; i++) if (achDB[MP_ACH[i].id]) achCount++;

      var html = '';
      html += '<div style="max-width:560px;padding:26px 30px;background:#14181f;' +
              'border:2px solid #7fdcff;border-radius:6px;color:#d8e8f0;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;' +
              'margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #333;">';
      html += '<h2 style="margin:0;font-size:1rem;letter-spacing:2px;color:#7fdcff;">' +
              'MPX EXTRAS LOADED</h2>';
      html += '<button id="mpx-menu-close" style="background:none;border:none;' +
              'color:#888;font-size:1.3rem;cursor:pointer;font-family:inherit;">×</button>';
      html += '</div>';

      html += '<div style="font-size:0.85rem;color:#8fb8d0;margin-bottom:14px;">' +
              'Status: ' + esc(status) + '</div>';

      html += '<div style="font-size:0.8rem;color:#8fb8d0;margin-bottom:18px;">' +
              'Achievements unlocked: ' + achCount + ' / ' + MP_ACH.length + '</div>';

      html += '<div style="font-size:0.75rem;color:#666;margin-bottom:6px;' +
              'letter-spacing:1.5px;">QUICK ACCESS</div>';

      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
      html += '<button class="mpx-mbtn" data-act="briefing" style="padding:10px;' +
              'background:#1a2a35;color:#d8e8f0;border:1px solid #7fdcff;' +
              'border-radius:3px;font-family:inherit;font-size:0.85rem;' +
              'cursor:pointer;text-align:left;">📖 Briefing</button>';
      html += '<button class="mpx-mbtn" data-act="achievements" style="padding:10px;' +
              'background:#1a2a35;color:#d8e8f0;border:1px solid #7fdcff;' +
              'border-radius:3px;font-family:inherit;font-size:0.85rem;' +
              'cursor:pointer;text-align:left;">🏆 Achievements</button>';
      html += '<button class="mpx-mbtn" data-act="congress" style="padding:10px;' +
              'background:#1a2a35;color:#d8e8f0;border:1px solid #7fdcff;' +
              'border-radius:3px;font-family:inherit;font-size:0.85rem;' +
              'cursor:pointer;text-align:left;">🏛️ Congress tab</button>';
      html += '<button class="mpx-mbtn" data-act="ambitions" style="padding:10px;' +
              'background:#1a2a35;color:#d8e8f0;border:1px solid #7fdcff;' +
              'border-radius:3px;font-family:inherit;font-size:0.85rem;' +
              'cursor:pointer;text-align:left;">🎯 Ambitions tab</button>';
      html += '<button class="mpx-mbtn" data-act="cells" style="padding:10px;' +
              'background:#1a2a35;color:#d8e8f0;border:1px solid #7fdcff;' +
              'border-radius:3px;font-family:inherit;font-size:0.85rem;' +
              'cursor:pointer;text-align:left;">🗺️ Hunt Cells tab</button>';
      html += '<button class="mpx-mbtn" data-act="cabinet" style="padding:10px;' +
              'background:#1a2a35;color:#d8e8f0;border:1px solid #7fdcff;' +
              'border-radius:3px;font-family:inherit;font-size:0.85rem;' +
              'cursor:pointer;text-align:left;">💼 Cabinet tab</button>';
      html += '</div>';

      html += '<div style="margin-top:18px;padding-top:12px;border-top:1px solid #333;' +
              'font-size:0.75rem;color:#666;line-height:1.7;">';
      html += 'The <b style="color:#7fdcff;">🎮 MPX</b> badge in the top-right corner ' +
              'stays visible the whole session. Click it any time to reopen this menu.<br>' +
              'Tabs on the right panel also work directly once a match has begun.';
      html += '</div>';

      html += '</div>';
      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      document.getElementById('mpx-menu-close').onclick = function () {
        overlay.remove();
      };

      overlay.onclick = function (e) {
        if (e.target === overlay) overlay.remove();
      };

      var btns = overlay.querySelectorAll('.mpx-mbtn');
      for (var b = 0; b < btns.length; b++) {
        btns[b].onclick = (function (el) {
          return function () {
            var act = el.getAttribute('data-act');
            overlay.remove();
            if (act === 'briefing') { UIMP._showBriefing(); }
            else if (act === 'achievements') { UIMP._showAchievements(); }
            else { UIMP._setTab(act); }
          };
        })(btns[b]);
      }
    }

    // Show the badge once the DOM is ready
    if (document.body) {
      installBadge();
    } else {
      document.addEventListener('DOMContentLoaded', installBadge);
    }

    console.log('[MPX] booted');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 200); });
  } else {
    setTimeout(boot, 200);
  }

})();