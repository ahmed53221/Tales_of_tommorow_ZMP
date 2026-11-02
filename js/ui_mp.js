// ui_mp.js — Multiplayer UI. Renders into the same DOM tree as ui.js.

window.UIMP = (function () {
  'use strict';

  var EMP = window.EngineMP;
  var MP  = window.Multiplayer;
  var D   = window.GameData;

  var scene = 'lobby';
  var localPlayerId = null;
  var isHost = false;
  var matchConfig = null;
  var rngSeed = (Date.now() % 2147483647) || 12345;
  var tab = 'poll';
  var pending = null;
  var activeInboxEvent = null;
  var showAdvisorsPanel = false;

  function rng() {
    rngSeed = (rngSeed * 16807) % 2147483647;
    return (rngSeed - 1) / 2147483646;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function $(id) { return document.getElementById(id); }

  function findParty(id) {
    if (!D || !D.PARTIES) return null;
    var upper = String(id).toUpperCase();
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (String(D.PARTIES[i].id).toUpperCase() === upper) return D.PARTIES[i];
    }
    return null;
  }

  function partyColor(id) {
    var p = findParty(id);
    return (p && p.color) || '#888';
  }

  function partyShort(id) {
    var p = findParty(id);
    if (!p) return id;
    return p.short || p.tag || p.id;
  }

  function factionColor(id) {
    var mod = EMP.getFaction(id);
    return (mod && mod.color) || '#888';
  }

  function factionName(id) {
    var mod = EMP.getFaction(id);
    return (mod && mod.name) || id;
  }

  function getMyFactionId() {
    if (!matchConfig || !localPlayerId) return null;
    for (var i = 0; i < matchConfig.players.length; i++) {
      if (matchConfig.players[i].id === localPlayerId) {
        return matchConfig.players[i].factionId;
      }
    }
    return null;
  }

  // ============================================================
  // BOOT
  // ============================================================
  function boot() {
    buildShell();
    wireGlobalButtons();
    renderAll();
  }

  function buildShell() {
    var shell = document.getElementById('shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'shell';
      document.body.appendChild(shell);
    }

    if (!document.getElementById('top')) {
      shell.innerHTML =
        '<div class="background-pattern"></div>' +

        '<header id="top">' +
          '<h1>🎓 Class Council</h1>' +
          '<span class="byline">Multiplayer</span>' +
          '<nav id="top-nav">' +
            '<button onclick="UIMP._goLobby()">🏠 Lobby</button>' +
            '<button onclick="UIMP._goSinglePlayer()">🎮 Single Player</button>' +
            '<button onclick="UIMP._showBriefing()">📖 Briefing</button>' +
            '<button onclick="UIMP._showAchievements()">🏆 Achievements</button>' +
            '<span id="conn-pill" class="conn-pill off"><span class="dot"></span><span class="label">Disconnected</span></span>' +
            '<span id="ready-pill" class="ready-pill" style="display:none;">Waiting…</span>' +
          '</nav>' +
        '</header>' +

        '<div id="cols">' +
          '<div class="panel" id="left-panel">' +
            '<h2> Status</h2>' +
            '<div id="status"></div>' +
            '<hr class="rule">' +
            '<h2>📜 Log</h2>' +
            '<div id="log"></div>' +
          '</div>' +

          '<div class="panel" id="main-panel">' +
            '<div id="main"></div>' +
          '</div>' +

          '<div class="panel" id="right-panel">' +
            '<div class="tabs">' +
              '<button id="tab-poll"        onclick="UIMP._setTab(\'poll\')">Poll</button>' +
              '<button id="tab-seats"       onclick="UIMP._setTab(\'seats\')">🪑 Seats</button>' +
              '<button id="tab-hist"        onclick="UIMP._setTab(\'hist\')">📈 Trend</button>' +
              '<button id="tab-congress"    onclick="UIMP._setTab(\'congress\')">🏛️ Congress</button>' +
              '<button id="tab-ambitions"   onclick="UIMP._setTab(\'ambitions\')">🎯 Ambitions</button>' +
              '<button id="tab-news"        onclick="UIMP._setTab(\'news\')">📰 News</button>' +
              '<button id="tab-cells"       onclick="UIMP._setTab(\'cells\')">🗺️ Hunt Cells</button>' +
              '<button id="tab-cabinet"     onclick="UIMP._setTab(\'cabinet\')">💼 Cabinet</button>' +
            '</div>' +
            '<div id="right-body"></div>' +
          '</div>' +
        '</div>' +

        '<div id="toast" class="toast"></div>';
    }
  }

  function wireGlobalButtons() {
    var btnHost = document.getElementById('btn-host');
    var btnJoin = document.getElementById('btn-join');
    if (btnHost) btnHost.onclick = doHost;
    if (btnJoin) btnJoin.onclick = doJoin;
  }

  // ============================================================
  // HOST / JOIN
  // ============================================================
  function doHost() {
    isHost = true;
    localPlayerId = 'p1';

    MP.on('onOpen', function (myId) {
      var el = document.getElementById('host-id');
      if (el) el.textContent = myId;
      var wait = document.getElementById('host-waiting');
      if (wait) wait.style.display = 'block';
      updateConnPill();
    });
    MP.on('onPeerConnected', function (peerId) {
      console.log('[uimp] client connected: ' + peerId);
      updateConnPill();
      startHostedMatch();
    });
    MP.on('onPeerDisconnected', function (peerId) {
      console.log('[uimp] client disconnected: ' + peerId);
      updateConnPill();
      handleDisconnect(peerId);
    });
    MP.on('onMessage', function (msg) { handleHostMessage(msg); });
    MP.on('onError', function (err) {
      showToast('Connection error: ' + (err.message || err.type || 'unknown'));
    });

    MP.host();
    updateConnPill();
  }

  function startHostedMatch() {
    matchConfig = {
      seed: Date.now(),
      players: [
        { id: 'p1', factionId: 'ZMP', isHuman: true },
        { id: 'p2', factionId: 'BL',  isHuman: true }
      ]
    };

    var s = EMP.newMatch(matchConfig);
    if (!s) { showToast('Failed to start match.'); return; }

    MP.send({
      type: 'action',
      action: 'match_started',
      config: matchConfig,
      hostId: MP.getMyId()
    });

    scene = 'match';
    renderAll();

    // Failsafe: auto-ready the opponent if they go silent for 45s.
    if (!startHostedMatch._watchdog) {
      startHostedMatch._watchdog = setInterval(function () {
        if (!isHost) return;
        if (!MP.isConnected()) return;
        var s = EMP.getState();
        if (!s || s.finished) return;
        var now = Date.now();
        for (var i = 0; i < s.players.length; i++) {
          var p = s.players[i];
          if (!p.isHuman) continue;
          if (p.id === localPlayerId) continue;
          if (p.isReady) { p._lastNudge = now; continue; }
          if (!p._lastNudge) p._lastNudge = now;
          if (now - p._lastNudge > 45000) {
            EMP.submitAction(p.id, { id: 'wait' });
            p._lastNudge = now;
            tryResolve();
          }
        }
      }, 5000);
    }
  }

  function doJoin() {
    isHost = false;

    var input = document.getElementById('join-id-input');
    var hostId = input ? input.value.trim() : '';
    if (!hostId) { showToast('Enter a host ID.'); return; }

    MP.on('onOpen', function () { updateConnPill(); });
    MP.on('onPeerConnected', function () { updateConnPill(); });
    MP.on('onHostLost', function () {
      showToast('Host disconnected. You win by forfeit.');
      handleHostLost();
    });
    MP.on('onMessage', function (msg) { handleClientMessage(msg); });
    MP.on('onError', function (err) {
      showToast('Connection error: ' + (err.message || err.type || 'unknown'));
    });

    MP.join(hostId);
    updateConnPill();
  }

  function handleClientMessage(msg) {
    if (msg.type === 'toast') { showToast(msg.text || ''); return; }
    if (msg.type === 'action' && msg.action === 'match_started') {
      localPlayerId = 'p2';
      matchConfig = msg.config;
      EMP.newMatch(msg.config);
      scene = 'match';
      renderAll();
      return;
    }
    if (msg.type === 'snapshot') {
      applySnapshot(msg.state);
      renderAll();
      return;
    }
    if (msg.type === 'victory') { showEnding(msg); return; }
    if (msg.type === 'forfeit') { showEnding({ winner: msg.winner, reason: 'forfeit' }); return; }
  }

  function handleHostMessage(msg) {
    if (msg.type === 'action') {
      var actionObj = msg.action;
      if (typeof actionObj === 'string') actionObj = { id: actionObj };
      if (!actionObj || !actionObj.id) actionObj = { id: 'wait' };
      EMP.submitAction(msg.playerId, actionObj);
      tryResolve();
      return;
    }

    if (msg.type === 'formation_choice') {
      EMP.submitFormationChoice(msg.leaderId, msg.templateId);
      MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      renderAll();
      return;
    }

    if (msg.type === 'presidential_choice') {
      EMP.submitPresidentialChoice(msg.factionId, msg.candidateId);
      MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      renderAll();
      return;
    }

    if (msg.type === 'ministry_pick') {
      var mpRes = EMP.assignMinistry(msg.factionId, msg.ministryId);
      if (!mpRes.ok) {
        MP.send({ type: 'toast', text: mpRes.msg || 'Ministry pick failed.' });
      }
      MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      renderAll();
      return;
    }

    if (msg.type === 'ministry_action') {
      var r = EMP.resolveMinistryAction(msg.factionId, msg.ministryId, msg.actionId);
      if (r.ok && r.notes && r.notes.length > 0) showToast(r.notes.join(' '));
      MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      renderAll();
      return;
    }

    if (msg.type === 'event_response') {
      if (msg.response === 'accept') {
        var r = EMP.acceptEvent(msg.factionId, msg.eventId, msg.choiceIndex);
        if (r.ok) {
          MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
          renderAll();
        }
      } else if (msg.response === 'pass') {
        EMP.passEvent(msg.factionId, msg.eventId);
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
        renderAll();
      } else if (msg.response === 'defer') {
        EMP.deferEvent(msg.factionId, msg.eventId);
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
        renderAll();
      }
      return;
    }

    if (msg.type === 'advisor_rotate') {
      if (msg.factionId !== 'ZMP') return;
      var rAd = EMP.rotateAdvisorMP(EMP.getState(), msg.factionId, msg.postId, msg.advisorId);
      if (!rAd.ok) {
        MP.send({ type: 'toast', text: rAd.msg || 'Rotation failed.' });
        return;
      }
      MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      renderAll();
      return;
    }

    if (msg.type === 'snapshot_request') {
      MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      return;
    }

    if (msg.type === 'chat') { console.log('[uimp] chat: ' + msg.text); return; }
  }

  // ============================================================
  // HOST: RESOLVE
  // ============================================================
  function tryResolve() {
    if (!isHost) return;
    if (!EMP.allReady()) {
      renderAll();
      return;
    }

    var s0 = EMP.getState();
    if (s0 && s0.lastElection) s0.lastElection.shownToUI = false;

    var r = EMP.resolveWeek();
    if (!r.ok) { console.warn('[uimp] resolve failed: ' + r.msg); return; }

    var s = EMP.getState();
    MP.send({ type: 'snapshot', state: serializeState(s) });

    if (s.finished) {
      MP.send({ type: 'victory', winner: s.winners, reason: s.winReason, week: s.week });
      showEnding({ winner: s.winners, reason: s.winReason, week: s.week });
      return;
    }

    renderAll();
  }

  // ============================================================
  // PLAYER ACTIONS
  // ============================================================
  function submitMyAction(action) {
    var s = EMP.getState();
    if (!s) return;

    var actionObj = (typeof action === 'string') ? { id: action } : action;
    if (!actionObj || !actionObj.id) return;

    if (isHost) {
      EMP.submitAction(localPlayerId, actionObj);
      tryResolve();
    } else {
      MP.send({ type: 'action', playerId: localPlayerId, action: actionObj });
    }

    renderAll();
  }

  // ============================================================
  // EVENT INBOX RESPONSES
  // ============================================================
  function respondToEvent(eventId, response, choiceIndex) {
    var s = EMP.getState();
    if (!s) return;
    var myFaction = getMyFactionId();
    if (!myFaction) return;

    if (isHost) {
      if (response === 'accept') {
        var r = EMP.acceptEvent(myFaction, eventId, choiceIndex);
        if (!r.ok) { showToast(r.msg); return; }
      } else if (response === 'pass') {
        var r2 = EMP.passEvent(myFaction, eventId);
        if (!r2.ok) { showToast(r2.msg); return; }
      } else if (response === 'defer') {
        EMP.deferEvent(myFaction, eventId);
      }
      activeInboxEvent = null;
      renderAll();
    } else {
      MP.send({
        type: 'event_response',
        factionId: myFaction,
        eventId: eventId,
        response: response,
        choiceIndex: choiceIndex
      });
      activeInboxEvent = null;
      renderAll();
    }
  }

  // ============================================================
  // SERIALIZATION
  // ============================================================
  function serializeState(s) {
    return {
      week: s.week,
      finished: s.finished,
      winners: s.winners,
      winReason: s.winReason,
      losers: s.losers,
      shared: JSON.parse(JSON.stringify(s.shared)),
      players: s.players.map(function (p) {
        return { id: p.id, factionId: p.factionId, isReady: p.isReady, isConnected: p.isConnected };
      }),
      log: s.log.slice(-60),
      lastElection: s.lastElection,
      lastElectionWeekFired: s.lastElectionWeekFired,
      pendingEvent: s.pendingEvent,
      pendingElectionResult: s.pendingElectionResult,
      presidentialStarted: s.presidentialStarted,
      presidentialPending: s.presidentialPending,
      presidentialCandidates: s.presidentialCandidates,
      presidentialChoiceMade: s.presidentialChoiceMade,
      lastPresidentialElection: s.lastPresidentialElection,
      pendingPresidentialResult: s.pendingPresidentialResult,
      blWalls: s.blWalls,
      blackLeagueCells: s.blackLeagueCells,
      paramilitaries: s.paramilitaries,
      partySupport: s.partySupport,
      queues: s.queues,
      flags: s.flags,
      affinity: s.affinity,
      formation: s.formation,
      cabinet: s.cabinet,
      cabinetFormation: s.cabinetFormation,
      pendingBattlePrompt: s.pendingBattlePrompt,
      pendingBattleChoice: s.pendingBattleChoice
    };
  }

  function applySnapshot(snap) {
    var s = EMP.getState();
    if (!s) return;
    if (snap.week >= s.week) {
      s.week = snap.week;
    }
    s.shared = snap.shared;
    s.players = snap.players;
    s.log = snap.log;
    s.lastElection = snap.lastElection;
    if (snap.lastElectionWeekFired !== undefined) s.lastElectionWeekFired = snap.lastElectionWeekFired;
    s.pendingEvent = snap.pendingEvent;
    if (snap.pendingElectionResult !== undefined) s.pendingElectionResult = snap.pendingElectionResult;
    if (snap.presidentialStarted !== undefined) s.presidentialStarted = snap.presidentialStarted;
    if (snap.presidentialPending !== undefined) s.presidentialPending = snap.presidentialPending;
    if (snap.presidentialCandidates !== undefined) s.presidentialCandidates = snap.presidentialCandidates;
    if (snap.presidentialChoiceMade !== undefined) s.presidentialChoiceMade = snap.presidentialChoiceMade;
    if (snap.lastPresidentialElection !== undefined) s.lastPresidentialElection = snap.lastPresidentialElection;
    if (snap.pendingPresidentialResult !== undefined) s.pendingPresidentialResult = snap.pendingPresidentialResult;
    s.blWalls = snap.blWalls;
    s.blackLeagueCells = snap.blackLeagueCells;
    s.paramilitaries = snap.paramilitaries;
    s.partySupport = snap.partySupport;
    s.queues = snap.queues;
    s.flags = snap.flags;
    s.affinity = snap.affinity;
    if (snap.formation !== undefined) s.formation = snap.formation;
    if (snap.cabinet !== undefined) s.cabinet = snap.cabinet;
    if (snap.cabinetFormation !== undefined) s.cabinetFormation = snap.cabinetFormation;
    if (snap.pendingBattlePrompt !== undefined) s.pendingBattlePrompt = snap.pendingBattlePrompt;
    if (snap.pendingBattleChoice !== undefined) s.pendingBattleChoice = snap.pendingBattleChoice;
    s.finished = snap.finished;
    s.winners = snap.winners;
    s.winReason = snap.winReason;
    s.losers = snap.losers;
  }

  // ============================================================
  // DISCONNECT / FORFEIT
  // ============================================================
  function handleDisconnect(peerId) {
    var s = EMP.getState();
    if (!s || s.finished) return;
    setTimeout(function () {
      var st = EMP.getState();
      if (!st || st.finished) return;
      EMP.markDisconnected('p2');
      showEnding({ winner: ['p1'], reason: 'forfeit', week: st.week });
      MP.send({ type: 'forfeit', winner: 'p1' });
    }, MP.CFG.disconnectTimeout * 1000);
  }

  function handleHostLost() {
    var s = EMP.getState();
    if (!s || s.finished) return;
    showEnding({ winner: [localPlayerId], reason: 'forfeit', week: s.week });
  }

  

  // ============================================================
  // RENDER ALL
  // ============================================================
  function renderAll() {
    renderTopBar();
    if (scene === 'lobby') {
      renderLobbyMain();
      renderLobbyStatus();
      renderLobbyRight();
      renderLog();
      return;
    }
    if (scene === 'match' || scene === 'ending') {
      renderMatchMain();
      renderMatchStatus();
      renderMatchRight();
      renderLog();
      return;
    }
  }

  function renderTopBar() {
    var pill = document.getElementById('conn-pill');
    if (pill) updateConnPill();

    var readyPill = document.getElementById('ready-pill');
    if (readyPill) {
      var s = EMP.getState();
      if (s && scene === 'match' && !s.finished) {
        var myReady = isHost && s.players[0] && s.players[0].isReady;
        var oppReady = s.players[1] && s.players[1].isReady;
        if (!myReady || !oppReady) {
          readyPill.style.display = 'inline-block';
          readyPill.textContent = myReady ? 'Waiting for opponent…' : 'Your turn';
        } else {
          readyPill.style.display = 'none';
        }
      } else {
        readyPill.style.display = 'none';
      }
    }
  }

  function updateConnPill() {
    var pill = document.getElementById('conn-pill');
    if (!pill) return;
    var on = MP.isConnected();
    pill.className = 'conn-pill ' + (on ? 'on' : 'off');
    var label = pill.querySelector('.label');
    if (label) label.textContent = on ? 'Connected' : 'Disconnected';
  }

  // ============================================================
  // LOBBY
  // ============================================================
  function renderLobbyMain() {
    var m = $('main');
    if (!m) return;
    m.innerHTML =
      '<h2 class="scene-title">Class Council</h2>' +
      '<div class="lobby">' +
        '<div class="lobby-subtitle">Multiplayer — the same game, two players</div>' +
        '<div class="lobby-cards">' +
          '<div class="lobby-card">' +
            '<h2>Host</h2>' +
            '<p>Start a new match. Share the ID with your opponent.</p>' +
            '<button id="btn-host" class="btn-primary">Host a Match</button>' +
            '<div id="host-waiting" style="display:none;margin-top:12px;">' +
              '<div class="lobby-label">Your ID</div>' +
              '<code id="host-id" class="lobby-code">—</code>' +
              '<div class="lobby-waiting">Waiting for opponent…</div>' +
            '</div>' +
          '</div>' +
          '<div class="lobby-card">' +
            '<h2>Join</h2>' +
            '<p>Enter the host\'s ID to join their match.</p>' +
            '<input id="join-id-input" class="lobby-input" placeholder="Paste host ID here">' +
            '<button id="btn-join" class="btn-primary">Join a Match</button>' +
          '</div>' +
        '</div>' +
        '<div id="error-box" class="lobby-error"></div>' +
      '</div>';
    wireGlobalButtons();
  }

  function renderLobbyStatus() {
    var el = $('status');
    if (!el) return;
    el.innerHTML = '<div class="stat sub">No match yet. Host or join to begin.</div>';
  }

  function renderLobbyRight() {
    var el = $('right-body');
    if (!el) return;
    el.innerHTML =
      '<h2>Projected Influence</h2>' +
      '<div class="stat sub">No polling until a match begins.</div>';
    updateTabHighlight();
  }

  // ============================================================
  // MATCH
  // ============================================================
  function renderMatchMain() {
  var m = $('main');
  if (!m) return;

  var s = EMP.getState();
  if (!s) { m.innerHTML = ''; return; }

  // King standoff route.
  if (s.kingGame && window.UI && typeof window.UI.viewKing === 'function') {
    // Push the engine's kingGame into the UI module so viewKing
    // renders the correct state.
    if (typeof window.UI.setKingGame === 'function') {
      window.UI.setKingGame(s.kingGame);
    }
    m.innerHTML = window.UI.viewKing();
    return;
  }

  if (s.finished) { renderEndingMain(s); return; }
  if (activeInboxEvent) {
    m.innerHTML = renderInboxEventView(s, activeInboxEvent);
    wireInboxEventButtons();
    return;
  }

  
  if (showAdvisorsPanel) {
      m.innerHTML = renderAdvisorPanelMP(s);
      return;
    }
  

    var myFaction = getMyFactionId();
    var queue = (s.queues && s.queues[myFaction]) || [];
    var html = '';

    if (queue.length > 0) {
      html += '<div class="inbox-banner">' +
        '<span class="ib-icon">📥</span>' +
        '<span class="ib-text">You have ' + queue.length + ' event' +
          (queue.length === 1 ? '' : 's') + ' waiting in your inbox.</span>' +
        '<button class="chip" onclick="UIMP._openFirstInboxEvent()">Open</button>' +
      '</div>';
    }

    html += renderWeekView(s, myFaction);
    m.innerHTML = html;
    wireWeekViewButtons();
  }

  function renderAdvisorPanelMP(s) {
  var myFaction = getMyFactionId();
  if (myFaction !== 'ZMP') {
    return '<h2 class="scene-title">Advisors</h2>' +
      '<p class="lead">Only the ZMP manages internal advisors.</p>' +
      '<div class="btn-row"><button class="btn" onclick="UIMP._hideAdvisors()">Back</button></div>';
  }

  var sh = s.shared && s.shared[myFaction];
  if (!sh || !sh.cabinetAdvisors) {
    EMP.initAdvisorTrackersMP(s, myFaction);
    sh = s.shared[myFaction];
  }

  var advisors = (D && D.ADVISORS) || [];
  var posts = [
    { id: 'ruler',   label: 'Ruler of the Party' },
    { id: 'finance', label: 'Finance Minister' },
    { id: 'radical', label: 'Radical Wing Leader' }
  ];

  var html = '';
  html += '<h2 class="scene-title">Party Advisors</h2>';
  html += '<p class="lead">Each post is held by an advisor from one of the party\'s internal factions. Rotating shifts influence between them.</p>';

  if (sh.factionInfluence) {
    html += '<div class="result-box" style="padding:12px;margin-bottom:14px;">';
    html += '<h3 style="margin-top:0;">Internal Faction Balance</h3>';
    for (var fid in sh.factionInfluence) {
      var f = D.MINISTER_FACTIONS && D.MINISTER_FACTIONS[fid];
      if (!f) continue;
      var inf = Math.round(sh.factionInfluence[fid]);
      var dis = Math.round((sh.factionDissident && sh.factionDissident[fid]) || 0);
      var disColor = dis > 50 ? '#ff6060' : dis > 25 ? '#ffcc00' : '#5fae3c';
      html += '<div style="display:flex;align-items:center;gap:10px;margin:6px 0;">';
      html += '<span data-hover="ministerFaction" data-mfid="' + fid + '" ' +
        'style="min-width:140px;font-weight:600;color:' + f.color + ';cursor:help;">' +
        esc(f.name) + '</span>';
      html += '<div class="meter" style="flex:1;height:6px;"><i style="width:' +
        inf + '%;background:' + f.color + ';"></i></div>';
      html += '<span style="min-width:40px;text-align:right;">' + inf + '</span>';
      html += '<span style="min-width:70px;text-align:right;color:' + disColor +
        ';font-size:0.8rem;">dis ' + dis + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  for (var i = 0; i < posts.length; i++) {
    var post = posts[i];
    var currentId = sh.cabinetAdvisors[post.id];
    var currentAdv = null;
    for (var j = 0; j < advisors.length; j++) {
      if (advisors[j].id === currentId) { currentAdv = advisors[j]; break; }
    }

    html += '<div class="result-box" style="padding:12px;margin:10px 0;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:baseline;">';
    html += '<h3 style="margin:0;">' + esc(post.label) + '</h3>';
    if (currentAdv) {
      var curFaction = D.MINISTER_FACTIONS && D.MINISTER_FACTIONS[currentAdv.faction];
      html += '<span style="font-size:0.85rem;color:' +
        ((curFaction && curFaction.color) || '#888') + ';">' +
        esc(currentAdv.name) + '</span>';
    } else {
      html += '<span style="font-size:0.85rem;color:#888;">Vacant</span>';
    }
    html += '</div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
    for (var k = 0; k < advisors.length; k++) {
      var adv = advisors[k];
      var seatedHere = currentAdv && currentAdv.id === adv.id;
      var seatedElsewhere = false;
      for (var p2 in sh.cabinetAdvisors) {
        if (p2 !== post.id && sh.cabinetAdvisors[p2] === adv.id) {
          seatedElsewhere = true;
        }
      }
      var disabled = seatedHere || seatedElsewhere;

      var fInfo = D.MINISTER_FACTIONS && D.MINISTER_FACTIONS[adv.faction];
      var chipColor = (fInfo && fInfo.color) || '#888';

      html += '<button class="act" ' + (disabled ? 'disabled' : '') +
        ' onclick="UIMP._rotateAdvisorMP(\'' + post.id + '\',\'' + adv.id + '\')" ' +
        'style="text-align:left;min-width:180px;border-left:3px solid ' + chipColor + ';">';
      html += '<b>' + esc(adv.name) + '</b>';
      html += '<span class="d">' + esc(adv.role || '') + '</span>';
      if (seatedHere) {
        html += '<span class="d" style="color:#5fae3c;">✓ In post</span>';
      } else if (seatedElsewhere) {
        html += '<span class="d" style="color:#888;">Holds another post</span>';
      } else {
        html += '<span class="d" style="color:' + chipColor + ';">' +
          esc((fInfo && fInfo.name) || adv.faction || '') + '</span>';
      }
      html += '</button>';
    }
    html += '</div>';
    html += '</div>';
  }

  html += '<div class="btn-row">';
  html += '<button class="btn alt" onclick="UIMP._hideAdvisors()">Back</button>';
  html += '</div>';

  return html;
}

  function renderWeekView(s, myFaction) {
    var actions = EMP.getActionsFor(localPlayerId);

    var html = '';
    html += '<h2 class="scene-title">Week ' + s.week + ' of ' + EMP.CFG.totalWeeks + '</h2>';
    html += '<p class="quiet">Running as <b style="color:' + factionColor(myFaction) + ';">' +
      esc(factionName(myFaction)) + '</b>.';

    var me = null, opp = null;
    for (var i = 0; i < s.players.length; i++) {
      if (s.players[i].id === localPlayerId) me = s.players[i];
      else opp = s.players[i];
    }
    if (me && me.isReady) html += ' You have submitted your action.';
    else html += ' Submit an action to advance.';
    html += '</p>';

    // Presidential result card (one-shot, highest priority).
    if (s.pendingPresidentialResult) {
      html += renderPresidentialResult(s, s.pendingPresidentialResult);
    }

    // Election result card (one-shot).
    if (s.pendingElectionResult) {
      html += renderElectionResult(s, s.pendingElectionResult);
    }

    // Formation pending (anyone can see it; leader gets buttons).
    if (s.formation && s.formation.pending) {
      var isMyFormation = s.formation.pending.leaderId === myFaction;
      html += renderFormationPicker(s, s.formation.pending, isMyFormation);
    }

    // Presidential picker (own faction).
    if (s.presidentialStarted &&
        s.presidentialPending &&
        s.presidentialPending[myFaction]) {
      html += renderPresidentialPicker(s, s.presidentialPending[myFaction]);
    } else if (s.presidentialStarted &&
               !s.presidentialChoiceMade[myFaction] &&
               !s.lastPresidentialElection) {
      html += renderPresidentialPicker(s, buildFallbackPresidentialPending(myFaction));
    }

    html += '<p>' + esc(weekFlavour(s.week)) + '</p>';

    if (actions.length === 0) {
      html += '<p class="quiet">No actions available.</p>';
    } else {
      html += '<div class="act-grid">';
      for (var ai = 0; ai < actions.length; ai++) {
        var a = actions[ai];
        var cost = [];
        if (a.ap) cost.push(a.ap + ' AP');
        if (a.funds) cost.push('$' + a.funds);
        if (a.vol) cost.push(a.vol + ' vol');
        var disabled = false;
        var myState = s.shared[myFaction] || {};
        if (a.funds && myState.funds !== undefined && myState.funds < a.funds) disabled = true;
        if (a.vol && myState.volunteers !== undefined && myState.volunteers < a.vol) disabled = true;

        html += '<button class="act" ' + (disabled ? 'disabled' : '') +
          ' data-action-id="' + a.id + '"' +
          (a.needsTarget ? ' data-needs-target="' + a.needsTarget + '"' : '') + '>' +
          '<b>' + esc(a.name) + '</b>' +
          '<span class="cost">' + cost.join(' / ') + '</span>' +
          '<span class="d">' + esc(a.desc || '') + '</span>' +
          '</button>';
      }
      html += '</div>';
    }

    if (pending) {
      html += renderTargetPicker(s, pending);
    }

        if (pending) {
      html += renderTargetPicker(s, pending);
    }

    if (myFaction === 'ZMP' && !showAdvisorsPanel) {
      html += '<div class="btn-row" style="margin-top:10px;">';
      html += '<button class="btn" onclick="UIMP._showAdvisors()">Manage Advisors</button>';
      html += '</div>';
    }

    html += '<div class="btn-row" style="margin-top:14px;">';

    html += '<div class="btn-row" style="margin-top:14px;">';
    if (me && me.isReady) {
      html += '<button class="btn alt" disabled>Waiting for opponent…</button>';
    } else {
      html += '<button class="btn" onclick="UIMP._submitWait()">Skip ahead / wait</button>';
    }
    html += '</div>';

    return html;
  }

  function renderTargetPicker(s, actionId) {
    var act = null;
    var actions = EMP.getActionsFor(localPlayerId);
    for (var i = 0; i < actions.length; i++) {
      if (actions[i].id === actionId) act = actions[i];
    }
    if (!act || !act.needsTarget) return '';

    var html = '<hr class="rule">';
    html += '<h3>Choose a target</h3>';
    html += '<div class="chips">';

    if (act.needsTarget === 'demo') {
      var demos = ['freshmen', 'seniors', 'athletes', 'arts', 'gamers', 'honors', 'buskids'];
      for (var d = 0; d < demos.length; d++) {
        var name = demos[d].charAt(0).toUpperCase() + demos[d].slice(1);
        html += '<button class="chip" data-target="' + demos[d] + '">' + name + '</button>';
      }
    } else if (act.needsTarget === 'party') {
      for (var pid in s.partySupport) {
        if (pid === 'other') continue;
        if (pid.indexOf('_') === 0) continue;
        if (s.partySupport[pid] < 0.1) continue;
        html += '<button class="chip" data-target="' + pid + '">' +
          '<span class="swatch" style="background:' + partyColor(pid) + ';margin-right:5px;"></span>' +
          esc(partyShort(pid)) + '</button>';
      }
    } else if (act.needsTarget === 'cell') {
      var cells = (s.blackLeagueCells && s.blackLeagueCells.cells) || [];
      for (var ci = 0; ci < cells.length; ci++) {
        var c = cells[ci];
        if (c.destroyed) continue;
        html += '<button class="chip" data-target="' + c.location + '">' +
          (c.icon || '⚫') + ' ' + esc(c.locationName) + '</button>';
      }
    }

    html += '<button class="chip" onclick="UIMP._cancelPending()">Cancel</button>';
    html += '</div>';
    return html;
  }

  function renderFormationPicker(s, pending, isMyFormation) {
    var html = '<div class="result-box" style="border:3px solid #ffd700;padding:14px;margin:10px 0;background:rgba(255,215,0,0.06);">';
    html += '<h3 style="color:#ffd700;">🏛️ Coalition Formation — ' +
      esc(factionName(pending.leaderId)) + ' leads</h3>';
    if (isMyFormation) {
      html += '<p><b>Your party leads the formation attempt.</b> Choose a template or decline.</p>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">';
      pending.choices.forEach(function(c) {
  // Decline must always be clickable, otherwise the leader is stuck.
  var isDecline = c.templateId === '_decline';
  var disabled = !c.reachesMajority && !isDecline;
  html += '<button class="act" ' + (disabled ? 'disabled' : '') +
    ' onclick="UIMP._submitFormation(\'' + c.templateId + '\')" style="text-align:left;">';
  html += '<b>' + esc(c.text) + '</b>';
  html += '<span class="d">' + esc(c.note) + '</span>';
  html += '</button>';
});
      html += '</div>';
    } else {
      html += '<p>Waiting for <b>' + esc(factionName(pending.leaderId)) +
        '</b> to choose a coalition. Expires in ' +
        Math.max(0, pending.expiresAtWeek - s.week) + ' weeks.</p>';
    }
    html += '</div>';
    return html;
  }

  function renderPresidentialPicker(s, pending) {
    var html = '<div class="result-box" style="border:2px solid #66aaff;padding:14px;margin:10px 0;">';
    html += '<h3 style="color:#66aaff;">🗳️ Presidential Election</h3>';
    html += '<p>Choose your candidate or endorse another faction\'s.</p>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;max-height:400px;overflow-y:auto;">';
    pending.choices.forEach(function(c) {
      html += '<button class="act" onclick="UIMP._submitPresidential(\'' + c.candidateId + '\')" style="text-align:left;">';
      html += '<b>' + esc(c.text) + '</b>';
      html += '<span class="d">' + esc(c.note) + '</span>';
      html += '</button>';
    });
    html += '</div></div>';
    return html;
  }

  function buildFallbackPresidentialPending(myFaction) {
    var candidates = EMP.PRESIDENTIAL_CANDIDATES || {};
    var choices = [];
    var ownPool = candidates[myFaction] || [];
    for (var j = 0; j < ownPool.length; j++) {
      choices.push({
        candidateId: ownPool[j].id,
        name: ownPool[j].name,
        party: ownPool[j].party,
        text: 'Run ' + ownPool[j].name,
        note: ownPool[j].desc,
        isOwn: true
      });
    }
    for (var otherFid in candidates) {
      if (otherFid === myFaction) continue;
      var otherPool = candidates[otherFid];
      for (var k = 0; k < otherPool.length; k++) {
        choices.push({
          candidateId: otherPool[k].id,
          name: otherPool[k].name,
          party: otherPool[k].party,
          text: 'Endorse ' + otherPool[k].name + ' (' + otherPool[k].party + ')',
          note: otherPool[k].desc,
          isOwn: false
        });
      }
    }
    choices.push({
      candidateId: '_abstain',
      text: 'Abstain',
      note: 'Do not participate in the presidential election.',
      isOwn: false
    });
    return { week: 0, choices: choices, expiresAtWeek: 999 };
  }

  function renderPresidentialResult(s, result) {
    var html = '<div class="result-box" style="border:2px solid #ffd700;padding:14px;margin:10px 0;">';
    html += '<h3 style="color:#ffd700;">🗳️ Presidential Election Result — Week ' + result.week + '</h3>';

    if (result.winner) {
      var cand = null;
      var candidatesMap = EMP.PRESIDENTIAL_CANDIDATES || {};
      for (var fid in candidatesMap) {
        var pool = candidatesMap[fid];
        for (var i = 0; i < pool.length; i++) {
          if (pool[i].id === result.winner) cand = pool[i];
        }
      }
      html += '<p style="font-size:1.1rem;">Winner: <b style="color:#ffd700;">' +
        esc(cand ? cand.name : result.winner) + '</b>' +
        (cand ? ' (' + esc(cand.party) + ')' : '') +
        ' — ' + (Math.round((result.candidates[result.winner] || 0) * 10) / 10) + '%</p>';

      var sorted = Object.keys(result.candidates).sort(function (a, b) {
        return result.candidates[b] - result.candidates[a];
      });
      html += '<table style="width:100%;margin-top:8px;font-size:0.85rem;">';
      for (var k = 0; k < sorted.length; k++) {
        var cid = sorted[k];
        var pct = Math.round(result.candidates[cid] * 10) / 10;
        var name = cid;
        for (var fid2 in candidatesMap) {
          var pool2 = candidatesMap[fid2];
          for (var j = 0; j < pool2.length; j++) {
            if (pool2[j].id === cid) name = pool2[j].name + ' (' + pool2[j].party + ')';
          }
        }
        html += '<tr style="border-top:1px solid #333;">' +
          '<td>' + esc(name) + '</td>' +
          '<td style="text-align:right;">' + pct + '%</td></tr>';
      }
      html += '</table>';
    } else {
      html += '<p>No candidate won. The election was inconclusive.</p>';
    }

    html += '<div class="btn-row" style="margin-top:10px;">';
    html += '<button class="btn" onclick="UIMP._dismissPresidentialResult()">Dismiss</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderElectionResult(s, result) {
    var html = '<div class="result-box" style="border:2px solid #ffd700;padding:14px;margin:10px 0;background:rgba(255,215,0,0.06);">';
    html += '<h3 style="color:#ffd700;">🗳️ Election Results — Week ' + result.week + '</h3>';
    html += '<p>ZMP won <b>' + result.zmpSeats + '</b> of ' + result.totalSeats +
      ' seats. Majority needs <b>' + result.majority + '</b>. ' +
      (result.hasMajority
        ? '<span style="color:#5fae3c;">Majority achieved!</span>'
        : '<span style="color:#ff6060;">Coalition required.</span>') + '</p>';

    html += '<table style="width:100%;margin-top:8px;font-size:0.85rem;">';
    html += '<thead><tr style="border-bottom:1px solid #555;">' +
      '<th style="text-align:left;">Party</th>' +
      '<th style="text-align:right;">Seats</th>' +
      '<th style="text-align:right;">Vote %</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < result.rows.length; i++) {
      var r = result.rows[i];
      var isZMP = r.id === 'ZMP';
      html += '<tr style="border-top:1px solid #333;' +
        (isZMP ? 'background:rgba(95,174,60,0.10);' : '') + '">';
      html += '<td>' +
        '<span class="swatch" style="background:' + r.color +
        ';display:inline-block;width:10px;height:10px;margin-right:6px;border:1px solid #333;"></span>' +
        esc(r.short) + '</td>';
      html += '<td style="text-align:right;font-weight:bold;">' + r.seats + '</td>';
      html += '<td style="text-align:right;">' + r.voteShare.toFixed(1) + '%</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';

    html += '<div class="btn-row" style="margin-top:10px;">';
    html += '<button class="btn" onclick="UIMP._dismissElectionResult()">Dismiss</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function wireWeekViewButtons() {
    var m = $('main');
    if (!m) return;

    var actBtns = m.querySelectorAll('.act[data-action-id]');
    for (var i = 0; i < actBtns.length; i++) {
      actBtns[i].addEventListener('click', function (e) {
        var aid = e.currentTarget.getAttribute('data-action-id');
        var needsTarget = e.currentTarget.getAttribute('data-needs-target');
        if (needsTarget) {
          pending = aid;
          renderAll();
          return;
        }
        submitMyAction({ id: aid });
      });
    }

    var tgtChips = m.querySelectorAll('.chip[data-target]');
    for (var j = 0; j < tgtChips.length; j++) {
      tgtChips[j].addEventListener('click', function (e) {
        var target = e.currentTarget.getAttribute('data-target');
        var aid = pending;
        pending = null;
        submitMyAction({ id: aid, target: target });
      });
    }
  }

  function wireInboxEventButtons() {
    var m = $('main');
    if (!m) return;

    var acceptBtns = m.querySelectorAll('.inbox-event .accept-btn[data-event-id]');
    for (var i = 0; i < acceptBtns.length; i++) {
      acceptBtns[i].addEventListener('click', function (e) {
        var eid = e.currentTarget.getAttribute('data-event-id');
        var ci = parseInt(e.currentTarget.getAttribute('data-choice') || '0', 10);
        respondToEvent(eid, 'accept', ci);
      });
    }

    var passBtn = m.querySelector('.inbox-event .ie-pass');
    if (passBtn) {
      passBtn.addEventListener('click', function (e) {
        var eid = e.currentTarget.getAttribute('data-event-id');
        respondToEvent(eid, 'pass', 0);
      });
    }

    var deferBtn = m.querySelector('.inbox-event .ie-defer');
    if (deferBtn) {
      deferBtn.addEventListener('click', function (e) {
        var eid = e.currentTarget.getAttribute('data-event-id');
        respondToEvent(eid, 'defer', 0);
      });
    }

    var closeBtn = m.querySelector('.inbox-event .ie-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        activeInboxEvent = null;
        renderAll();
      });
    }
  }

  // ============================================================
  // INBOX EVENT VIEW
  // ============================================================
  function renderInboxEventView(s, ev) {
    var html = '<div class="inbox-event">';
    html += '<div class="ie-head">';
    html += '<div class="ie-title">' + esc(ev.title) + '</div>';
    var weeksLeft = ev.expiresAtWeek - s.week;
    html += '<div class="ie-expiry">' + (weeksLeft > 0 ? weeksLeft + ' wk left' : 'expiring') + '</div>';
    html += '</div>';
    html += '<div class="ie-body">' + esc(ev.body) + '</div>';

    if (ev.choices && ev.choices.length > 0) {
      html += '<ul class="choices ie-choices">';
      for (var i = 0; i < ev.choices.length; i++) {
        var c = ev.choices[i];
        html += '<li class="accept-btn" data-event-id="' + ev.id + '" data-choice="' + i + '">' +
          '<span class="ct">' + esc(c.text) + '</span>' +
          (c.note ? '<span class="cn">' + esc(c.note) + '</span>' : '') +
          '</li>';
      }
      html += '</ul>';
    }

    html += '<div class="ie-actions">';
    html += '<button class="ie-pass" data-event-id="' + ev.id + '">↪ Pass to next-highest faction</button>';
    html += '<button class="ie-defer" data-event-id="' + ev.id + '">⏸ Defer</button>';
    html += '<button class="ie-close">✕ Close</button>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ============================================================
  // ENDING VIEW
  // ============================================================
  function renderEndingMain(s) {
    var m = $('main');
    if (!m) return;

    var winners = Array.isArray(s.winners) ? s.winners : [s.winners];
    var iWon = winners && winners.indexOf(localPlayerId) !== -1;
    var isBoom = s.winReason === 'boom';

    var title = isBoom ? 'THE BOOM' : (iWon ? 'VICTORY' : 'DEFEAT');
    var color = isBoom ? '#a000a0' : (iWon ? '#7fdf7f' : '#ff6060');

    var myFaction = getMyFactionId();
    var reason = s.winReason || 'timeout';
    var reasonText = {
      victory: 'You achieved your win condition.',
      defeat: 'You failed your win condition.',
      forfeit: 'Your opponent disconnected. You win by forfeit.',
      timeout: 'The 104-week limit was reached.',
      boom: 'The tenth wall was broken. The prophecy came true. Everyone lost.'
    }[reason] || reason;

    m.innerHTML =
      '<div class="ending" style="border-color:' + color + ';">' +
        '<h1 class="ending-title" style="color:' + color + ';">' + title + '</h1>' +
        '<p class="ending-reason">' + esc(reasonText) + '</p>' +
        '<p class="ending-week">Week ' + s.week + '</p>' +
        '<p class="ending-faction">Playing as <b style="color:' + factionColor(myFaction) + ';">' +
          esc(factionName(myFaction)) + '</b></p>' +
        '<button class="btn-primary" onclick="UIMP._returnToLobby()">Return to Lobby</button>' +
      '</div>';
  }

  // ============================================================
  // STATUS PANEL (left)
  // ============================================================
  function renderMatchStatus() {
    var el = $('status');
    if (!el) return;

    var s = EMP.getState();
    if (!s) { el.innerHTML = ''; return; }

    var myFaction = getMyFactionId();
    var myState = s.shared[myFaction] || {};

    var html = '';
    html += '<div class="stat"><span>Week</span><span class="v">' + s.week + ' / ' + EMP.CFG.totalWeeks + '</span></div>';

    var keys = ['support', 'funds', 'volunteers', 'unity', 'faculty', 'momentum'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (myState[k] === undefined) continue;
      var v = Math.round(myState[k] * 10) / 10;
      html += '<div class="stat"><span>' + k.charAt(0).toUpperCase() + k.slice(1) +
              '</span><span class="v">' + v + '</span></div>';
    }

    if (myState.shares) {
      html += '<h3>Sub-factions</h3>';
      for (var fk in myState.shares) {
        html += '<div class="stat sub"><span>' + fk + '</span>' +
                '<span class="v">' + Math.round(myState.shares[fk]) + '%</span></div>';
      }
    }
    if (myState.wings) {
      html += '<h3>Wings</h3>';
      html += '<div class="stat sub"><span>Hitlerite</span><span class="v">' +
              Math.round(myState.wings.hitlerite) + '%</span></div>';
      html += '<div class="stat sub"><span>Cult</span><span class="v">' +
              Math.round(myState.wings.cult) + '%</span></div>';
    }
    if (myState.reformState) {
      html += '<h3>Reforms</h3>';
      html += '<div class="stat sub"><span>Crisis</span><span class="v">' +
              Math.round(myState.reformState.crisisLevel) + '%</span></div>';
      html += '<div class="stat sub"><span>Passed</span><span class="v">' +
              myState.reformState.reformsPassed.length + ' / ' +
              myState.reformState.totalReforms + '</span></div>';
    }
    if (myState.rbSatisfaction !== undefined) {
      html += '<h3>RB</h3>';
      html += '<div class="stat sub"><span>Satisfaction</span><span class="v">' +
              Math.round(myState.rbSatisfaction) + '</span></div>';
      html += '<div class="stat sub"><span>Withholding</span><span class="v">' +
              (myState.rbWithholding ? 'YES' : 'no') + '</span></div>';
    }
    if (myState.plSatisfaction !== undefined) {
      html += '<h3>PL</h3>';
      html += '<div class="stat sub"><span>Satisfaction</span><span class="v">' +
              Math.round(myState.plSatisfaction) + '</span></div>';
    }
    if (myState.antiMonarchyPressure !== undefined) {
      html += '<h3>Pressure</h3>';
      html += '<div class="stat sub"><span>Anti-monarchy</span><span class="v">' +
              Math.round(myState.antiMonarchyPressure) + '</span></div>';
    }
    if (myState.wallsBroken !== undefined) {
      html += '<h3>Walls</h3>';
      html += '<div class="stat sub"><span>Broken</span><span class="v">' +
              myState.wallsBroken + ' / 10</span></div>';
    }

    el.innerHTML = html;
  }

  // ============================================================
  // RIGHT PANEL (tabs)
  // ============================================================
  function renderMatchRight() {
    var el = $('right-body');
    if (!el) return;

    updateTabHighlight();

    var s = EMP.getState();
    if (!s) { el.innerHTML = ''; return; }

    if (tab === 'poll')      { el.innerHTML = renderPollTab(s); return; }
    if (tab === 'seats')     { el.innerHTML = renderSeatsTab(s); return; }
    if (tab === 'hist')      { el.innerHTML = renderHistTab(s); return; }
    if (tab === 'congress')  { el.innerHTML = renderCongressTab(s); return; }
    if (tab === 'ambitions') { el.innerHTML = renderAmbitionsTab(s); return; }
    if (tab === 'news')      { el.innerHTML = renderNewsTab(s); return; }
    if (tab === 'cells')     { el.innerHTML = renderCellsTab(s); return; }
    if (tab === 'cabinet')   { el.innerHTML = renderCabinetTab(s); return; }
  }

  function updateTabHighlight() {
    var tabs = ['poll', 'seats', 'hist', 'congress', 'ambitions', 'news', 'cells', 'cabinet'];
    for (var i = 0; i < tabs.length; i++) {
      var b = document.getElementById('tab-' + tabs[i]);
      if (b) b.className = (tabs[i] === tab ? 'on' : '');
    }
  }

  function renderPollTab(s) {
    var html = '<h2>Projected Influence</h2>';
    html += '<div class="stat sub" style="justify-content:center;margin-top:-6px">(if the election were held now)</div>';

    var rows = [];
    var sum = 0;
    for (var pid in s.partySupport) {
      if (pid === 'OTHER') continue;
      if (pid.indexOf('_') === 0) continue;
      var support = s.partySupport[pid] || 0;
      if (support < 0.1) continue;
      rows.push({ id: pid, support: support });
      sum += support;
    }
    rows.sort(function (a, b) { return b.support - a.support; });

    // Normalise so the displayed percentages sum to 100.
    var scale = sum > 0 ? 100 / sum : 0;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var pct = r.support * scale;
      var nmInner = esc(partyShort(r.id));
      if (window.Hover && window.Hover.wrapParty) {
        nmInner = window.Hover.wrapParty(r.id, nmInner);
      }
      html += '<div class="poll-row">' +
        '<span class="swatch" style="background:' + partyColor(r.id) + ';"></span>' +
        '<span class="nm">' + nmInner + '</span>' +
        '<span class="pc">' + pct.toFixed(1) + '%</span>' +
        '</div>';
    }
    return html;
  }

  function renderSeatsTab(s) {
    if (!s.lastElection || !s.lastElection.seats) {
      return '<h2>Projected Council</h2><div class="stat sub">No election held yet.</div>';
    }
    var seats = s.lastElection.seats;
    var majority = s.lastElection.majority || 23;

    var html = '<h2>Projected Council</h2>';
    html += '<div class="stat sub">Week ' + s.lastElection.week + ' — ' +
            majority + ' for majority</div>';

    var ids = Object.keys(seats).sort(function (a, b) { return seats[b] - seats[a]; });
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      if (seats[pid] < 1) continue;
      var nmInner = esc(partyShort(pid));
      if (window.Hover && window.Hover.wrapParty) {
        nmInner = window.Hover.wrapParty(pid, nmInner);
      }
      html += '<div class="poll-row">' +
        '<span class="swatch" style="background:' + partyColor(pid) + ';"></span>' +
        '<span class="nm">' + nmInner + '</span>' +
        '<span class="pc">' + seats[pid] + ' seats</span>' +
        '</div>';
    }
    return html;
  }

  function renderHistTab(s) {
    return '<h2>Support Trend</h2><div class="stat sub">Trend chart appears after 2+ weeks.</div>';
  }

  function renderCongressTab(s) {
    return '<h2>Congress</h2><div class="stat sub">Party congress is per-faction. See your faction panel.</div>';
  }

  function renderAmbitionsTab(s) {
    return '<h2>Ambitions</h2><div class="stat sub">Ambitions are tracked in the shared engine.</div>';
  }

  function renderNewsTab(s) {
    var stories = [];
    var blSupport = s.partySupport.bl || 0;
    var zmpSupport = s.partySupport.ZMP || 0;

    if (blSupport > 25) {
      stories.push({
        headline: 'Black League on the Move',
        body: 'The League\'s influence grows to ' + Math.round(blSupport) + '%.',
        color: '#cc0000'
      });
    }
    if (zmpSupport > 40) {
      stories.push({
        headline: 'ZMP Dominates the Polls',
        body: 'The Student Union Coalition reaches ' + Math.round(zmpSupport) + '%.',
        color: '#5fae3c'
      });
    }
    if (s.blWalls && s.blWalls.wallsBroken > 0) {
      stories.push({
        headline: 'Walls Broken: ' + s.blWalls.wallsBroken + ' / 10',
        body: 'The cult publicly reads the prophecy.',
        color: '#a000a0'
      });
    }
    if (s.lastElection) {
      stories.push({
        headline: 'Election Held — Week ' + s.lastElection.week,
        body: 'ZMP holds ' + (s.lastElection.seats.ZMP || 0) + ' seats.',
        color: '#ffd700'
      });
    }
    if (stories.length === 0) stories.push({
      headline: 'Quiet week',
      body: 'Nothing of note in the school paper.',
      color: '#888'
    });

    var html = '<h2>📰 The Student Voice</h2>';
    for (var i = 0; i < stories.length; i++) {
      var st = stories[i];
      html += '<div class="result-box" style="border-left:4px solid ' + st.color + ';padding:10px 14px;margin:6px 0;">';
      html += '<div style="font-weight:700;">' + esc(st.headline) + '</div>';
      html += '<div style="color:#aaa;font-size:0.85rem;margin-top:4px;">' + esc(st.body) + '</div>';
      html += '</div>';
    }
    return html;
  }

  function renderCellsTab(s) {
    var cells = (s.blackLeagueCells && s.blackLeagueCells.cells) || [];
    var active = cells.filter(function (c) { return !c.destroyed; });
    var destroyed = cells.filter(function (c) { return c.destroyed; });

    var html = '<h2>🗺️ Hunt Cells</h2>';
    html += '<div class="cell-summary">' +
      '<span>Active: <b>' + active.length + '</b></span>' +
      '<span>Destroyed: <b>' + destroyed.length + '</b></span>' +
      '<span>Intel: <b>' + ((s.blackLeagueCells && s.blackLeagueCells.intelligence) || 0) + '</b></span>' +
      '</div>';

    if (active.length === 0) {
      html += '<div class="stat sub">No active cells.</div>';
    } else {
      html += '<div class="cell-grid">';
      for (var i = 0; i < active.length; i++) {
        var c = active[i];
        html += '<div class="cell-tile' + (c.discovered ? ' cell-discovered' : '') + '">' +
          '<div class="cell-icon">' + (c.icon || '⚫') + '</div>' +
          '<div class="cell-name">' + esc(c.locationName) + '</div>' +
          '<div class="cell-strength">Str ' + Math.round(c.strength) + '/5</div>' +
          (c.discovered ? '<div class="cell-supporters">' + c.supporters + ' supporters</div>' : '') +
          '</div>';
      }
      html += '</div>';
    }

    if (s.blWalls) {
      html += '<h3>Black League Walls</h3>';
      html += '<div class="wall-bar"><div class="wall-bar-fill" style="width:' +
              ((s.blWalls.wallsBroken / (s.blWalls.wallsTotal || 10)) * 100) + '%;"></div></div>';
      html += '<div class="wall-count">' + s.blWalls.wallsBroken + ' / ' +
              (s.blWalls.wallsTotal || 10) + '</div>';
      if (s.blWalls.prophecyLog && s.blWalls.prophecyLog.length > 0) {
        html += '<div class="prophecy">"' +
                esc(s.blWalls.prophecyLog[s.blWalls.prophecyLog.length - 1]) + '"</div>';
      }
    }

    return html;
  }

  function renderCabinetTab(s) {
    var myFaction = getMyFactionId();
    var html = '';

    // ---- Minister picker (if this player is picking) ----
    if (s.cabinetFormation &&
        s.cabinetFormation.pickInProgress &&
        s.cabinetFormation.leader === myFaction) {
      var taken = s.cabinetFormation.pickedMinistries.length;
      var need = s.cabinetFormation.allocation.leader;
      html += '<h2>💼 Pick Your Ministries</h2>';
      html += '<div class="stat sub">' + taken + ' / ' + need + ' selected</div>';
      html += '<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px;">';
      var ministries = EMP.MINISTRY_LIST || [];
      for (var mi = 0; mi < ministries.length; mi++) {
        var m = s.cabinet && s.cabinet.ministries[ministries[mi].id];
        if (!m) continue;
        var isPicked = m.party === myFaction;
        var disabled = !!m.party && !isPicked;
        html += '<button class="act" ' + (disabled || isPicked ? 'disabled' : '') +
          ' onclick="UIMP._pickMinistry(\'' + m.id + '\')" style="text-align:left;">' +
          '<b>' + m.icon + ' ' + esc(m.name) + '</b>' +
          (isPicked ? '<span class="d" style="color:#5fae3c;">✓ Selected</span>' : '') +
          (m.party && !isPicked ? '<span class="d" style="color:#888;">Taken by ' + esc(m.party) + '</span>' : '') +
          (!m.party ? '<span class="d">' + esc(m.desc) + '</span>' : '') +
          '</button>';
      }
      html += '</div>';
      return html;
    }

    // ---- Normal cabinet view ----
    if (!s.cabinet) {
      return '<h2>💼 Cabinet</h2><div class="stat sub">No cabinet has been formed yet.</div>';
    }

    html += '<h2>💼 Cabinet</h2>';
    html += '<div class="stat sub">Leader: <b>' + esc(factionName(s.cabinet.leader)) + '</b></div>';
    if (s.cabinet.partners && s.cabinet.partners.length > 0) {
      html += '<div class="stat sub">Partners: ' +
        s.cabinet.partners.map(factionName).map(esc).join(', ') + '</div>';
    }

    var hasAny = false;
    for (var mid in s.cabinet.ministries) {
      var m2 = s.cabinet.ministries[mid];
      if (!m2.party) continue;
      hasAny = true;
      var isMine = m2.party === myFaction;
      var borderColor = isMine ? '#ffd700' : '#444';
      html += '<div class="result-box" style="border-left:3px solid ' + borderColor +
        ';padding:10px;margin:8px 0;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline;">';
      html += '<span style="font-weight:700;">' + m2.icon + ' ' + esc(m2.name) + '</span>';
      html += '<span style="color:' + factionColor(m2.party) + ';font-size:0.8rem;">' +
        esc(factionName(m2.party)) + '</span>';
      html += '</div>';
      html += '<div class="stat sub" style="font-size:0.75rem;">' + esc(m2.desc) + '</div>';

      if (isMine && m2.actions && m2.actions.length > 0) {
        html += '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">';
        for (var ai = 0; ai < m2.actions.length; ai++) {
          var a = m2.actions[ai];
          var cost = [];
          if (a.cost && a.cost.ap) cost.push(a.cost.ap + ' AP');
          if (a.cost && a.cost.budget) cost.push('$' + a.cost.budget);
          html += '<button class="act" style="font-size:0.8rem;text-align:left;" ' +
            'onclick="UIMP._runMinistryAction(\'' + mid + '\',\'' + a.id + '\')">' +
            '<b>' + esc(a.name) + '</b>' +
            '<span class="cost">' + cost.join(' / ') + '</span>' +
            '<span class="d">' + esc(a.desc) + '</span>' +
            '</button>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    if (!hasAny) {
      html += '<div class="stat sub">Cabinet ministries have not yet been assigned.</div>';
    }

    return html;
  }

  // ============================================================
  // LOG
  // ============================================================
  function renderLog() {
    var el = $('log');
    if (!el) return;
    var s = EMP.getState();
    if (!s || !s.log || s.log.length === 0) {
      el.innerHTML = '<div>Nothing yet.</div>';
      return;
    }
    el.innerHTML = s.log.slice(-40).reverse().map(function (l) {
      return '<div>' + esc(l) + '</div>';
    }).join('');
  }

  function weekFlavour(w) {
    var lines = [
      'The corridor outside the council room smells of floor polish and cheap printer toner.',
      'Someone has drawn a moustache on all four of your posters by the science wing.',
      'Attendance at your volunteer meeting is up, though three of them came for the snacks.',
      'The school paper has a mock-up of the ballot on its front page and your name is spelled wrong.',
      'A freshman asks you, sincerely, what the council actually does. You do not answer well.',
      'The gym is booked all week, which changes what is possible.',
      'Two of your organisers are not speaking to each other and will not say why.',
      'It rains all week. Nobody stays after school who does not have to.'
    ];
    return lines[(w - 1) % lines.length];
  }

  // ============================================================
  // TOAST
  // ============================================================
  var toastTimer = null;
  function showToast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  // ============================================================
  // ENDING
  // ============================================================
  function showEnding(data) {
    scene = 'ending';
    var s = EMP.getState();
    if (s) {
      s.finished = true;
      s.winners = Array.isArray(data.winner) ? data.winner : [data.winner];
      s.winReason = data.reason;
    }
    renderAll();
  }

  // ============================================================
  // NAV ACTIONS
  // ============================================================
  function _goLobby() {
    MP.destroy();
    matchConfig = null;
    localPlayerId = null;
    isHost = false;
    scene = 'lobby';
    activeInboxEvent = null;
    EMP.newMatch({
      seed: 1,
      players: [
        { id: 'p1', factionId: 'ZMP' },
        { id: 'p2', factionId: 'BL'  }
      ]
    });
    renderAll();
  }

  function _goSinglePlayer() {
    try { MP.destroy(); } catch (e) {}
    window.location.href = 'index.html';
  }

  function _showBriefing() {
    showToast('Briefing is available from the single-player screen.');
  }

  function _showAchievements() {
    showToast('Achievements are visible in the single-player screen.');
  }

  function _setTab(t) {
    tab = t;
    renderMatchRight();
  }

  function _cancelPending() {
    pending = null;
    renderAll();
  }

  function _submitWait() {
    submitMyAction({ id: 'wait' });
  }

  function _openFirstInboxEvent() {
    var s = EMP.getState();
    if (!s) return;
    var myFaction = getMyFactionId();
    var queue = (s.queues && s.queues[myFaction]) || [];
    if (queue.length === 0) { showToast('Inbox is empty.'); return; }
    activeInboxEvent = queue[0];
    renderAll();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  return {
    boot: boot,
    _submit: submitMyAction,
    _submitWait: _submitWait,
    _cancelPending: _cancelPending,
    _setTab: _setTab,
    _goLobby: _goLobby,
    _goSinglePlayer: _goSinglePlayer,
    _showBriefing: _showBriefing,
    _showAchievements: _showAchievements,
    _openFirstInboxEvent: _openFirstInboxEvent,

        _showAdvisors: function () {
      showAdvisorsPanel = true;
      renderAll();
    },
    _hideAdvisors: function () {
      showAdvisorsPanel = false;
      renderAll();
    },
    _rotateAdvisorMP: function (postId, advisorId) {
      var s = EMP.getState();
      if (!s) return;
      var myFaction = getMyFactionId();
      if (myFaction !== 'ZMP') return;

      if (isHost) {
        var r = EMP.rotateAdvisorMP(s, myFaction, postId, advisorId);
        if (!r.ok) { showToast(r.msg || 'Rotation failed.'); return; }
        (r.notes || []).forEach(function (n) { showToast(n); });
        MP.send({ type: 'snapshot', state: serializeState(s) });
        renderAll();
      } else {
        MP.send({
          type: 'advisor_rotate',
          factionId: myFaction,
          postId: postId,
          advisorId: advisorId
        });
      }
    },

    _submitFormation: function (templateId) {
      var s = EMP.getState();
      if (!s || !s.formation || !s.formation.pending) return;
      var leaderId = s.formation.pending.leaderId;
      if (isHost) {
        EMP.submitFormationChoice(leaderId, templateId);
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
        renderAll();
      } else {
        MP.send({ type: 'formation_choice', leaderId: leaderId, templateId: templateId });
      }
    },

    _dismissElectionResult: function () {
      var s = EMP.getState();
      if (!s) return;
      s.pendingElectionResult = null;
      if (isHost) {
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      }
      renderAll();
    },

    _submitPresidential: function (candidateId) {
      var s = EMP.getState();
      if (!s) return;
      var myFaction = getMyFactionId();
      if (!myFaction) return;
      if (isHost) {
        EMP.submitPresidentialChoice(myFaction, candidateId);
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
        renderAll();
      } else {
        MP.send({ type: 'presidential_choice', factionId: myFaction, candidateId: candidateId });
      }
    },

    _pickMinistry: function (ministryId) {
      var s = EMP.getState();
      if (!s || !s.cabinetFormation) return;
      var myFaction = getMyFactionId();
      if (!myFaction) return;

      if (isHost) {
        var result = EMP.assignMinistry(myFaction, ministryId);
        if (!result.ok) {
          showToast(result.msg || 'Ministry pick failed.');
          return;
        }
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
        renderAll();
      } else {
        MP.send({ type: 'ministry_pick', factionId: myFaction, ministryId: ministryId });
      }
    },

    _runMinistryAction: function (ministryId, actionId) {
      var myFaction = getMyFactionId();
      if (!myFaction) return;

      if (isHost) {
        var result = EMP.resolveMinistryAction(myFaction, ministryId, actionId);
        if (!result.ok) {
          showToast(result.msg || 'Ministry action failed.');
          return;
        }
        if (result.notes && result.notes.length > 0) {
          showToast(result.notes.join(' '));
        }
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
        renderAll();
      } else {
        MP.send({
          type: 'ministry_action',
          factionId: myFaction,
          ministryId: ministryId,
          actionId: actionId
        });
      }
    },

    _resumeHostBoot: function () {
      // Bypass the "start a fresh match" path and go straight to
      // MP.host(). The resume hook installed by ui_mp_resume.js will
      // intercept onPeerConnected.
      if (typeof doHost === 'function') {
        isHost = true;
        localPlayerId = 'p1';
        // doHost registers its own callbacks, then calls MP.host().
        // Our MP.on wrapper redirects onPeerConnected so it doesn't
        // call startHostedMatch().
        doHost();
      }
    },

    _dismissPresidentialResult: function () {
      var s = EMP.getState();
      if (!s) return;
      s.pendingPresidentialResult = null;
      if (isHost) {
        MP.send({ type: 'snapshot', state: serializeState(EMP.getState()) });
      }
      renderAll();
    },

    _returnToLobby: function () {
      MP.destroy();
      matchConfig = null;
      localPlayerId = null;
      isHost = false;
      scene = 'lobby';
      activeInboxEvent = null;
      EMP.newMatch({
        seed: 1,
        players: [
          { id: 'p1', factionId: 'ZMP' },
          { id: 'p2', factionId: 'BL'  }
        ]
      });
      renderAll();
    }
  };
})();

// ============================================================
// AUTO-BOOT
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    if (window.UIMP) window.UIMP.boot();
  });
} else {
  if (window.UIMP) window.UIMP.boot();
}