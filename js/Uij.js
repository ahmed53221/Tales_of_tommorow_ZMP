/* Uij.js — UI controller for the Zalgrilian Council mode.
 *
 * Reads window.ZalgrilianCouncil (the engine), renders the DOM in
 * zalgrilian_council.html, and posts the final outcome back to the
 * parent window when the session ends.
 *
 * Exposes: window.ZalgrilianCouncilUI
 */
window.ZalgrilianCouncilUI = (function () {
  'use strict';

  var EC = window.ZalgrilianCouncil;
  var st = null;
  var rng = null;
  var booted = false;

  // ============================================================
  // BOOT
  // ============================================================
  function init(opts) {
    opts = opts || {};

    if (!EC) {
      console.error('[zc_ui] engine (window.ZalgrilianCouncil) not loaded');
      return;
    }

    // Read triggeredFrom from query string if present
    var qsTriggeredFrom = 'fast_putsch';
    try {
      var params = new URLSearchParams(window.location.search);
      var qsVal = params.get('from');
      if (qsVal) qsTriggeredFrom = qsVal;
    } catch (e) {}

    st = EC.newGame({
      seed: opts.seed || Date.now(),
      triggeredFrom: opts.triggeredFrom || qsTriggeredFrom
    });
    rng = st.rng;
    booted = true;

    // First election runs immediately at week 1
    var firstElection = EC.runElection(st);
    EC.snapshot(st, 'Week 1');

    renderAll();
    showElectionOverlay(firstElection);

    // Announce to the parent window
    notifyParent('ZC_READY', { week: st.week });

    bindGlobalButtons();
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderAll() {
    if (!booted) return;
    renderTopBar();
    renderMain();
    renderSidebar();
    renderLog();
  }

  function renderTopBar() {
    setText('top-week', st.week);
    setText('top-ap', st.ap);
    setText('top-funds', st.funds);
    setText('top-vol', st.volunteers);
    setText('top-unity', Math.round(st.unity));
    var chaosEl = document.getElementById('top-chaos');
    if (chaosEl) {
      chaosEl.textContent = Math.round(st.instability || 0);
      chaosEl.style.color = st.instability > 65 ? '#cc0000' : '#ffcc55';
    }

    var phaseEl = document.getElementById('top-phase');
    if (!phaseEl) return;
    var phaseLabels = {
      campaign: 'Campaign',
      convention: 'Constitutional Convention',
      ended: 'Session Ended'
    };
    phaseEl.textContent = phaseLabels[st.phase] || st.phase;
    phaseEl.className = 'val phase-' + st.phase;
  }

  function renderMain() {
    var main = document.getElementById('main');
    if (!main) return;
    var html = '';

    if (st.phase === 'campaign') {
      if (st.instability > 50) {
        html += '<div class="panel" style="border-color:#cc2222; background:rgba(204,0,0,0.08); margin-bottom:14px; animation:pulse-danger 3s infinite;">';
        html += '<h2 style="color:#cc2222; font-family:monospace; letter-spacing:2px;">STATE OF EMERGENCY</h2>';
        html += '<div style="font-size:12px;color:#d8e8f0; line-height:1.5;">';
        html += 'The city is paralyzed by strikes and riots. The Convention cannot convene while the streets are out of control. ';
        html += 'Deploy the Dzehurjaca Legion to restore order, or the new constitution will be stillborn.';
        html += '</div></div>';
      }
      html += renderCampaignPhase();
    } else if (st.phase === 'convention') {
      html += renderConventionPhase();
    } else if (st.phase === 'ended') {
      html += renderEndedPhase();
    }

    main.innerHTML = html;
    wireMainButtons();
  }

  // ------------------------------------------------------------
  // CAMPAIGN PHASE
  // ------------------------------------------------------------
  function renderCampaignPhase() {
    var html = '';

    html += '<div class="panel">';
    html += '<h2>Campaign Actions — Week ' + st.week + '</h2>';
    html += '<div class="action-grid">';

    for (var i = 0; i < EC.ACTIONS.length; i++) {
      var a = EC.ACTIONS[i];
      var cost = [a.ap + ' AP'];
      if (a.funds) cost.push('$' + a.funds);
      if (a.vol) cost.push(a.vol + ' vol');

      var bad = st.ap < a.ap || st.funds < a.funds || st.volunteers < a.vol;
      html += '<button class="act" ' + (bad ? 'disabled' : '') +
        ' data-action="' + a.id + '">';
      html += '<b>' + escapeHtml(a.name) + '</b>';
      html += '<span class="cost">' + cost.join(' / ') + '</span>';
      html += '<span class="d">' + escapeHtml(a.desc || actionDesc(a.id)) + '</span>';
      html += '</button>';
    }

    html += '</div>';
    html += '</div>';

    if (st.pendingAction) {
      html += renderTargetPicker(st.pendingAction);
    }

    var nextElection = nextElectionWeek();
    if (nextElection !== null) {
      html += '<div class="panel">';
      html += '<h2>Next Election</h2>';
      html += '<div style="font-size:14px;color:#d8e8f0;">';
      html += 'Week ' + nextElection + ' — ' +
        (nextElection - st.week) + ' week(s) away.';
      html += '</div>';
      html += '</div>';
    }

    return html;
  }

  function actionDesc(id) {
    var descs = {
      canvass:   'Send volunteers to a voting bloc. Modest ZMP gain.',
      rally:     'A public rally. Broad small gain, plus momentum.',
      posters:   'Cheap poster run. Freshman-friendly.',
      negotiate: 'Back-room talks with a rival party.',
      attack:    'Attack leaflets against a party. Effective, but unity hit.',
      lobby:     'Pre-commit a constitutional clause in ZMP\'s favour.'
    };
    return descs[id] || '';
  }

  function renderTargetPicker(actionId) {
    var act = null;
    for (var i = 0; i < EC.ACTIONS.length; i++) {
      if (EC.ACTIONS[i].id === actionId) act = EC.ACTIONS[i];
    }
    if (!act || !act.needsTarget) return '';

    var html = '<div class="panel">';
    html += '<h2>Choose a Target</h2>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';

    if (act.needsTarget === 'bloc') {
      for (var b = 0; b < EC.BLOCS.length; b++) {
        var bl = EC.BLOCS[b];
        html += '<button class="act" style="width:auto;padding:8px 14px;" ' +
          'data-target="' + bl.id + '">' + bl.name + '</button>';
      }
    } else if (act.needsTarget === 'party') {
      var parties = EC.activeParties(st);
      for (var p = 0; p < parties.length; p++) {
        var party = parties[p];
        if (party.id === 'ZMP' || party.id === 'other') continue;
        html += '<button class="act" style="width:auto;padding:8px 14px;" ' +
          'data-target="' + party.id + '">' + party.short + '</button>';
      }
    } else if (act.needsTarget === 'clause') {
      var clauses = EC.CLAUSES;
      for (var c = 0; c < clauses.length; c++) {
        var clause = clauses[c];
        if (st.convention.decisions[clause.id] !== undefined) continue;

        html += '<div style="width:100%;margin-bottom:8px;">';
        html += '<div style="font-size:11px;color:rgba(140,190,220,0.6);margin-bottom:4px;text-transform:uppercase;letter-spacing:1.5px;">' +
          escapeHtml(clause.name) + '</div>';
        for (var o = 0; o < clause.options.length; o++) {
          var opt = clause.options[o];
          html += '<button class="act" style="width:100%;" ' +
            'data-clause="' + clause.id + '" data-option="' + opt.id + '">' +
            '<b>' + escapeHtml(opt.name) + '</b>' +
            '<span class="d">' + escapeHtml(opt.desc) + '</span>' +
            '</button>';
        }
        html += '</div>';
      }
    }

    html += '<button class="act" style="width:auto;padding:8px 14px;" ' +
      'data-target="__cancel">Cancel</button>';
    html += '</div>';
    html += '</div>';

    return html;
  }

  // ------------------------------------------------------------
  // CONVENTION PHASE
  // ------------------------------------------------------------
  function renderConventionPhase() {
    var html = '';
    var clause = EC.presentClause(st);

    if (!clause) {
      html += '<div class="panel">';
      html += '<h2>Constitutional Convention</h2>';
      html += '<div style="font-size:13px;color:#d8e8f0;">';
      html += 'All clauses have been decided. The final election will ratify the constitution.';
      html += '</div>';
      html += '</div>';
      return html;
    }

    html += '<div class="panel">';
    html += '<h2>Constitutional Convention — Clause ' +
      (st.convention.clauseIndex + 1) + ' of ' + EC.CLAUSES.length + '</h2>';
    html += '<div style="font-size:16px;color:#7fdcff;font-weight:700;letter-spacing:1px;margin-bottom:10px;">' +
      escapeHtml(clause.name) + '</div>';
    html += '<div style="font-size:12px;color:rgba(180,210,230,0.7);margin-bottom:14px;">';
    html += 'Choose how this clause will be written into the constitution.';
    html += '</div>';

    for (var i = 0; i < clause.options.length; i++) {
      var opt = clause.options[i];
      html += '<button class="clause-opt anim-fade-up" data-clause="' + clause.id + '" data-option="' + opt.id + '">';
      html += '<b>' + escapeHtml(opt.name) + '</b>';
      html += '<span class="d">' + escapeHtml(opt.desc) + '</span>';
      html += '</button>';
    }
    html += '</div>';

    return html;
  }

  function formatEffects(eff) {
    // We no longer show the raw stats. Let the player guess the consequences.
    return ''; 
  }

  // ------------------------------------------------------------
  // ENDED PHASE
  // ------------------------------------------------------------
  function renderEndedPhase() {
    var o = st.outcome;
    var html = '';

    html += '<div class="panel">';
    html += '<h2>Session Ended</h2>';
    html += '<div style="font-size:15px;color:#d8e8f0;margin-bottom:12px;">';
    html += 'The Zalgrilian Council has concluded its 20-week session.';
    html += '</div>';

    if (o) {
      html += '<div style="font-size:12px;color:rgba(180,210,230,0.7);margin-bottom:10px;">';
      html += 'Final ZMP result: <b style="color:#7fdf7f;">' +
        o.zmpPercent + '%</b>, ' + o.zmpSeats + ' seats.';
      html += '</div>';

      var bandLabels = {
        super:      'A Supermajority. The ZMP dictates the constitution without compromise.',
        strong:     'A Strong Majority. A stable settlement, but not total control.',
        narrow:     'A Narrow Majority. The ZMP must negotiate every clause.',
        opposition: 'The Opposition writes the constitution. The ZMP is sidelined.',
        collapsed:  'Collapse. The ZMP is reduced to a rump. The new constitution is not theirs.'
      };
      html += '<div class="anim-slam" style="font-size:13px;color:#7fdcff;font-weight:700;margin-top:12px;letter-spacing:1px;">';
      html += bandLabels[o.band] || o.band;
      html += '</div>';
    }

    html += '<button class="act primary" data-action="__finish" style="margin-top:16px;">';
    html += '<b>Close the Session</b>';
    html += '<span class="d">Return the outcome to the game</span>';
    html += '</button>';
    html += '</div>';

    return html;
  }

  // ------------------------------------------------------------
  // SIDEBAR
  // ------------------------------------------------------------
  function renderSidebar() {
    var sup = EC.computeSupport(st);
    var seats = EC.allocateSeats(sup);
    var rows = document.getElementById('standings');
    if (!rows) return;
    var html = '';

    var partyOrder = ['ZMP', 'ZPF', 'ZAP', 'RBMP', 'ZEJ', 'PLMS', 'other'];
    for (var i = 0; i < partyOrder.length; i++) {
      var pid = partyOrder[i];
      if (st.merged.indexOf(pid) !== -1) continue;
      var p = EC.getParty(pid);
      if (!p) continue;
      var pct = sup[pid] || 0;
      var seat = seats[pid] || 0;
      var cls = 'party-row ' + pid.toLowerCase();

      html += '<div class="' + cls + '">';
      html += '<span class="nm">' + escapeHtml(p.short) + '</span>';
      html += '<span class="bar"><i style="width:' +
        Math.min(100, pct) + '%;background:' + p.color + ';box-shadow:0 0 6px ' +
        p.color + ';"></i></span>';
      html += '<span class="pct">' + Math.round(pct) + '%</span>';
      html += '<span class="seat">' + (pid === 'other' ? '—' : seat + 's') + '</span>';
      html += '</div>';
    }

    rows.innerHTML = html;

    var info = document.getElementById('session-info');
    if (info) {
      info.innerHTML =
        'Phase: <b>' + st.phase + '</b><br>' +
        'Week ' + st.week + ' / 20';
    }
  }

  // ------------------------------------------------------------
  // LOG
  // ------------------------------------------------------------
  function renderLog() {
    var el = document.getElementById('log');
    if (!el) return;
    var entries = st.log.slice(-40).reverse();
    var html = '';
    for (var i = 0; i < entries.length; i++) {
      html += '<div class="entry' + (i < 3 ? ' new' : '') + '">' +
        escapeHtml(entries[i]) + '</div>';
    }
    el.innerHTML = html;
  }

  // ============================================================
  // BUTTON WIRING
  // ============================================================
  function bindGlobalButtons() {
    var adv = document.getElementById('btn-advance');
    if (adv) adv.addEventListener('click', onAdvance);

    var cont = document.getElementById('el-continue');
    if (cont) cont.addEventListener('click', hideElectionOverlay);
  }

  function wireMainButtons() {
    var main = document.getElementById('main');
    if (!main) return;

    var actBtns = main.querySelectorAll('button.act[data-action]');
    for (var i = 0; i < actBtns.length; i++) {
      actBtns[i].addEventListener('click', function (e) {
        var actionId = e.currentTarget.getAttribute('data-action');
        if (actionId === '__finish') {
          finishSession();
          return;
        }
        onActionClick(actionId);
      });
    }

    var tgtBtns = main.querySelectorAll('button.act[data-target]');
    for (var t = 0; t < tgtBtns.length; t++) {
      tgtBtns[t].addEventListener('click', function (e) {
        var target = e.currentTarget.getAttribute('data-target');
        onTargetPicked(target);
      });
    }

    var clauseBtns = main.querySelectorAll('button.clause-opt[data-clause]');
    for (var c = 0; c < clauseBtns.length; c++) {
      clauseBtns[c].addEventListener('click', function (e) {
        var clauseId = e.currentTarget.getAttribute('data-clause');
        var optionId = e.currentTarget.getAttribute('data-option');
        onClauseDecided(clauseId, optionId);
      });
    }

    var lobbyBtns = main.querySelectorAll('button.act[data-clause]');
    for (var l = 0; l < lobbyBtns.length; l++) {
      lobbyBtns[l].addEventListener('click', function (e) {
        var clauseId = e.currentTarget.getAttribute('data-clause');
        var optionId = e.currentTarget.getAttribute('data-option');
        onLobbyTargetPicked(clauseId, optionId);
      });
    }
  }

  // ============================================================
  // HANDLERS
  // ============================================================
  function onActionClick(actionId) {
    var act = null;
    for (var i = 0; i < EC.ACTIONS.length; i++) {
      if (EC.ACTIONS[i].id === actionId) act = EC.ACTIONS[i];
    }
    if (!act) return;

    if (act.needsTarget) {
      st.pendingAction = actionId;
      renderAll();
      return;
    }

    var r = EC.doAction(st, actionId, null);
    if (!r.ok) {
      alert(r.msg);
      return;
    }
    renderAll();
  }

  function onTargetPicked(target) {
    if (target === '__cancel') {
      st.pendingAction = null;
      renderAll();
      return;
    }

    var actionId = st.pendingAction;
    if (!actionId) return;

    var r = EC.doAction(st, actionId, target);
    st.pendingAction = null;
    if (!r.ok) {
      alert(r.msg);
    }
    renderAll();
  }

  function onLobbyTargetPicked(clauseId, optionId) {
    var actionId = st.pendingAction;
    if (actionId !== 'lobby') return;
    var r = EC.doAction(st, 'lobby', { clauseId: clauseId, optionId: optionId });
    st.pendingAction = null;
    if (!r.ok) {
      alert(r.msg);
    }
    renderAll();
  }

  function onClauseDecided(clauseId, optionId) {
    var r = EC.decideClause(st, clauseId, optionId);
    if (!r.ok) {
      alert(r.msg);
      return;
    }
    renderAll();
  }

  function onAdvance() {
    if (st.phase === 'ended') return;

    st.pendingAction = null;

    if (st.phase === 'convention') {
      var clause = EC.presentClause(st);
      if (clause) {
        alert('You must decide the current constitutional clause before advancing.');
        return;
      }
    }

    var r = EC.advanceWeek(st);
    if (!r.ok) {
      alert(r.msg);
      return;
    }

    EC.snapshot(st, 'Week ' + st.week);
    renderAll();

    if (st.pendingEvent && st.pendingEvent.election) {
      var el = st.pendingEvent.election;
      st.pendingEvent = null;
      showElectionOverlay(el);
    } else if (st.pendingEvent && st.pendingEvent.event) {
      var ev = st.pendingEvent.event;
      st.pendingEvent = null;
      showEventOverlay(ev);
    }
  }

  // ============================================================
  // ELECTION OVERLAY
  // ============================================================
  function showElectionOverlay(result) {
    var overlay = document.getElementById('election-overlay');
    if (!overlay) return;

    var titleEl = document.getElementById('el-title');
    var subEl = document.getElementById('el-sub');
    var zmpEl = document.getElementById('el-zmp');
    var histEl = document.getElementById('el-hist');

    if (titleEl) titleEl.textContent = 'Election Held';
    if (subEl) subEl.textContent =
      'Zalgrilian Council — Week ' + result.week + ' (Election ' + (result.electionIndex + 1) + ' of 5)';
    if (zmpEl) zmpEl.textContent = Math.round(result.zmpPercent) + '%';

    var histText = '';
    if (result.historical !== null) {
      histText = 'Historical result for this election: ' + result.historical + '%';
    }
    if (histEl) histEl.textContent = histText;

    var body = document.getElementById('el-body');
    if (body) {
      var html = '';
      var partyOrder = ['ZMP', 'ZPF', 'ZAP', 'RBMP', 'ZEJ', 'PLMS'];
      for (var i = 0; i < partyOrder.length; i++) {
        var pid = partyOrder[i];
        var p = EC.getParty(pid);
        if (!p) continue;
        var pct = result.percentages[pid] || 0;
        var seat = result.seats[pid] || 0;
        var isWinner = pid === 'ZMP';
        html += '<tr>';
        html += '<td style="color:' + p.color + ';font-weight:' + (isWinner ? '700' : '400') + ';">' +
          escapeHtml(p.short) + '</td>';
        html += '<td class="' + (isWinner ? 'winner' : '') + '">' +
          Math.round(pct) + '%</td>';
        html += '<td>' + seat + '</td>';
        html += '</tr>';
      }
      body.innerHTML = html;
    }

    overlay.classList.add('visible');
  }

  function hideElectionOverlay() {
    var overlay = document.getElementById('election-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ============================================================
  // EVENT OVERLAY
  // ============================================================
  function showEventOverlay(ev) {
    var overlay = document.getElementById('event-overlay');
    if (!overlay) {
      console.error('[zc_ui] #event-overlay not found in DOM');
      return;
    }

    var titleEl = document.getElementById('ev-title');
    var bodyEl  = document.getElementById('ev-body');
    var choicesEl = document.getElementById('ev-choices');

    if (titleEl) titleEl.textContent = ev.title;
    if (bodyEl)  bodyEl.textContent  = ev.body;

    // Add a danger pulse for crisis events
    var box = overlay.querySelector('.box');
    if (box) {
      box.className = 'box'; // reset
      if (ev.id === 'zj_militia' || ev.id === 'zap_capital_plot' || ev.id === 'zej_outlaw') {
        box.classList.add('crisis-pulse');
      }
    }

    if (choicesEl) {
      var html = '';
      for (var i = 0; i < ev.choices.length; i++) {
        var c = ev.choices[i];
        html += '<button class="clause-opt" data-event-id="' + ev.id +
          '" data-choice-index="' + i + '">';
        html += '<b>' + escapeHtml(c.text) + '</b>';
        if (c.note) html += '<span class="d">' + escapeHtml(c.note) + '</span>';
        html += '</button>';
      }
      choicesEl.innerHTML = html;

      var btns = choicesEl.querySelectorAll('button[data-event-id]');
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener('click', function (e) {
          var eid = e.currentTarget.getAttribute('data-event-id');
          var idx = parseInt(e.currentTarget.getAttribute('data-choice-index'), 10);
          var r = EC.applyEventChoice(st, eid, idx);
          if (!r.ok) { alert(r.msg); return; }
          renderAll();
          hideEventOverlay();
        });
      }
    }

    overlay.classList.add('visible');
  }

  function hideEventOverlay() {
    var overlay = document.getElementById('event-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ============================================================
  // FINISH
  // ============================================================
  function finishSession() {
    var outcome = st.outcome || EC.decideOutcome(st);
    notifyParent('ZC_OUTCOME', {
      outcome: outcome,
      triggeredFrom: st.triggeredFrom,
      electionResults: st.electionResults,
      history: st.history
    });

    // Give the parent a moment, then close the iframe
    setTimeout(function () {
      try { window.close(); } catch (e) {}
    }, 300);
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function nextElectionWeek() {
    for (var i = 0; i < EC.CFG.electionWeeks.length; i++) {
      if (EC.CFG.electionWeeks[i] > st.week) return EC.CFG.electionWeeks[i];
    }
    return null;
  }

  function notifyParent(type, payload) {
    try {
      if (window.parent && window.parent !== window) {
        var msg = { type: type };
        for (var k in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, k)) msg[k] = payload[k];
        }
        window.parent.postMessage(msg, '*');
      }
    } catch (e) {
      console.warn('[zc_ui] postMessage failed:', e);
    }
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return {
    init: init
  };
})();

// ============================================================
// AUTO-BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  if (window.ZalgrilianCouncilUI && window.ZalgrilianCouncilUI.init) {
    window.ZalgrilianCouncilUI.init({
      seed: Date.now()
    });
  } else {
    console.error('[zc_ui] ZalgrilianCouncilUI not available on boot');
  }
});