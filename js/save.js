// ui_mp_resume.js — Multiplayer session save/resume.
//
// Model: both players hold their own copy of the state. Both save
// independently. On resume, they exchange tokens. If tokens match,
// the host pushes a full snapshot and play continues. If not, the
// host wins (or the resume is cancelled).
//
// Load AFTER ui_mp_extras.js.
(function () {
  'use strict';

  if (!window.UIMP || !window.EngineMP || !window.Multiplayer) {
    console.warn('[resume] missing deps');
    return;
  }
  var UIMP = window.UIMP;
  var EMP  = window.EngineMP;
  var MP   = window.Multiplayer;

  // ============================================================
  // TOKEN — deterministic hash over the fields that must match
  // ============================================================
  function canonJSON(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonJSON).join(',') + ']';
    var keys = Object.keys(v).sort();
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ':' + canonJSON(v[k]);
    }).join(',') + '}';
  }
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
  }
  function tokenOf(st) {
    if (!st) return null;
    var slice = {
      week: st.week,
      partySupport: st.partySupport,
      shared: st.shared,
      players: (st.players || []).map(function (p) {
        return { id: p.id, factionId: p.factionId };
      })
    };
    return 'w' + st.week + '-' + fnv1a(canonJSON(slice));
  }

  // ============================================================
  // SERIALIZATION — same shape as ui_mp.js's serializeState
  // (kept private there; replicated here so we don't patch ui_mp.js)
  // ============================================================
  function serialize(st) {
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
      partyAmbitions: st.partyAmbitions
    };
  }

  // The client's existing applySnapshot expects this shape; we
  // reproduce it here so we can drive a full replace without
  // touching ui_mp.js.
  function applySnapshot(snap) {
    var s = EMP.getState();
    if (!s || !snap) return;
    // Copy every key. The set is a superset of what ui_mp.js's
    // private applySnapshot handles, so we can just overwrite.
    Object.keys(snap).forEach(function (k) {
      if (k === 'players') {
        // Preserve local player identity on the client
        var myId = s.players[1] && s.players[1].id;
        s.players = snap.players.map(function (p) {
          return {
            id: p.id, factionId: p.factionId,
            isHuman: p.isHuman !== false,
            isReady: !!p.isReady,
            isConnected: p.isConnected !== false
          };
        });
        return;
      }
      s[k] = snap[k];
    });
  }

  // ============================================================
  // SAVE — works for both host and client
  // ============================================================
  var RESUME_KEY = 'classCouncil_mp_resume';

  UIMP.mpSaveResume = function () {
    var st = EMP.getState();
    if (!st) { UIMP._toast('No match.'); return false; }
    try {
      var payload = {
        kind: 'classCouncil_mp_resume',
        version: 1,
        savedAt: Date.now(),
        date: new Date().toLocaleString(),
        week: st.week,
        token: tokenOf(st),
        amHost: !!(MP.amHost && MP.amHost()),
        // Full clone, so the live object can keep mutating
        state: JSON.parse(JSON.stringify(serialize(st)))
      };
      localStorage.setItem(RESUME_KEY, JSON.stringify(payload));
      UIMP._toast('Session saved — week ' + st.week + '.');
      return true;
    } catch (e) {
      UIMP._toast('Save failed: ' + e.message);
      return false;
    }
  };

  UIMP.mpHasResume = function () {
    try {
      var raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return false;
      var p = JSON.parse(raw);
      return !!(p && p.kind === 'classCouncil_mp_resume');
    } catch (e) { return false; }
  };

  UIMP.mpGetResumeInfo = function () {
    try {
      var raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return (p && p.kind === 'classCouncil_mp_resume') ? p : null;
    } catch (e) { return null; }
  };

  UIMP.mpDeleteResume = function () {
    localStorage.removeItem(RESUME_KEY);
    UIMP._toast('Resume save deleted.');
  };

  // ============================================================
  // RESUME — host path
  // ============================================================
  // The host loads the saved state into EngineMP, then hosts a new
  // PeerJS peer. When a client connects, the client sends
  // `resume_hello {token}`. Host compares. On match: `resume_accept`
  // with a full snapshot. On mismatch: `resume_reject`.
  // ============================================================

  var _resumeState = {
    active: false,
    slotToken: null,
    pendingClient: null
  };

  UIMP.mpResumeAsHost = function () {
    var info = UIMP.mpGetResumeInfo();
    if (!info) { UIMP._toast('No resume save.'); return; }
    if (!confirm('Resume week ' + info.week +
                 ' as host? This will start a new peer session.')) return;

    // 1. Rebuild the local engine state
    var st = EMP.getState();
    if (!st) {
      EMP.newMatch({
        seed: info.state.seed || Date.now(),
        players: info.state.players || [
          { id: 'p1', factionId: 'ZMP', isHuman: true },
          { id: 'p2', factionId: 'BL',  isHuman: true }
        ]
      });
      st = EMP.getState();
    }
    // Overwrite live state with the saved one
    applySnapshot(info.state);

    // 2. Activate resume mode and host
    _resumeState.active = true;
    _resumeState.slotToken = info.token;

    installResumeMessageHook(true);

    // 3. Kick off hosting. ui_mp.js's doHost sets up the callbacks
    //    we rely on, so call it, then override the peer-connected
    //    handler with our own.
    installHostConnectedOverride();

    // Trigger the existing host flow
    var btn = document.getElementById('btn-host');
    if (btn && typeof UIMP._goLobby === 'function') {
      // We're probably on the lobby screen; call the internal host
      // routine through the public API.
      UIMP._resumeHostBoot();
    } else {
      UIMP._toast('Go to the lobby first.');
    }
  };

  // Override the onPeerConnected callback so the resume handshake
  // runs instead of startHostedMatch()
  function installHostConnectedOverride() {
    var origOn = MP.on;
    MP.on = function (name, fn) {
      if (name === 'onPeerConnected' && _resumeState.active) {
        return origOn.call(MP, name, function (peerId) {
          // Do NOT call startHostedMatch. Wait for resume_hello.
          UIMP._toast('Client connected — awaiting resume handshake…');
          UIMP._forceRender();
        });
      }
      return origOn.call(MP, name, fn);
    };
  }

  // Wrap the message handler so resume_* messages route to us
  // instead of the default handleHostMessage / handleClientMessage.
  function installResumeMessageHook(asHost) {
    var origOn = MP.on;
    MP.on = function (name, fn) {
      if (name === 'onMessage') {
        return origOn.call(MP, name, function (msg) {
          if (msg.type === 'resume_hello' && asHost) {
            return onHostResumeHello(msg, fn);
          }
          return fn(msg);
        });
      }
      return origOn.call(MP, name, fn);
    };
  }

  function onHostResumeHello(msg, downstream) {
    var st = EMP.getState();
    if (!st) {
      MP.send({ type: 'resume_reject', reason: 'host_no_state' });
      return;
    }
    var myToken = tokenOf(st);

    if (msg.token === myToken && msg.week === st.week) {
      // Tokens match — push the full snapshot.
      MP.send({
        type: 'resume_accept',
        week: st.week,
        snapshot: serialize(st)
      });
      _resumeState.active = false;
      UIMP._toast('Resume accepted — week ' + st.week + '.');
      UIMP._forceRender();
      return;
    }

    // Mismatch.
    var detail = 'host=w' + st.week + ':' + (myToken || '?').slice(-6) +
                 ' client=w' + msg.week + ':' + (msg.token || '?').slice(-6);
    MP.send({ type: 'resume_reject', reason: 'token_mismatch', detail: detail });

    // Offer the host a decision: force host-canonical, or abort.
    var accept = confirm(
      'Save mismatch.\n\n' + detail + '\n\n' +
      'OK  → push your save to the client (host wins).\n' +
      'Cancel → drop the connection.'
    );
    if (accept) {
      MP.send({
        type: 'resume_accept',
        forced: true,
        week: st.week,
        snapshot: serialize(st)
      });
      _resumeState.active = false;
      UIMP._toast('Host-forced resume sent.');
    } else {
      MP.destroy();
      UIMP._toast('Resume aborted.');
    }
  }

  // ============================================================
  // RESUME — client path
  // ============================================================
  UIMP.mpResumeAsClient = function (hostId) {
    var info = UIMP.mpGetResumeInfo();
    if (!info) { UIMP._toast('No resume save.'); return; }
    if (!hostId) {
      var input = document.getElementById('join-id-input');
      hostId = input ? input.value.trim() : '';
    }
    if (!hostId) { UIMP._toast('Enter the host ID.'); return; }

    // 1. Load the saved state into the client's local engine
    var st = EMP.getState();
    if (!st) {
      EMP.newMatch({
        seed: info.state.seed || Date.now(),
        players: info.state.players
      });
      st = EMP.getState();
    }
    applySnapshot(info.state);

    // 2. Wrap message handler to catch resume_accept / resume_reject
    var origOn = MP.on;
    MP.on = function (name, fn) {
      if (name === 'onMessage') {
        return origOn.call(MP, name, function (msg) {
          if (msg.type === 'resume_accept') {
            return onClientResumeAccept(msg);
          }
          if (msg.type === 'resume_reject') {
            return onClientResumeReject(msg);
          }
          return fn(msg);
        });
      }
      if (name === 'onPeerConnected') {
        return origOn.call(MP, name, function (peerId) {
          // Send the hello with our token
          var s = EMP.getState();
          MP.send({
            type: 'resume_hello',
            week: s ? s.week : 0,
            token: tokenOf(s)
          });
          UIMP._toast('Sent resume handshake.');
        });
      }
      return origOn.call(MP, name, fn);
    };

    // 3. Join
    MP.join(hostId);
    UIMP._toast('Connecting to resume host…');
  };

  function onClientResumeAccept(msg) {
    if (msg.snapshot) {
      applySnapshot(msg.snapshot);
    }
    // Enter the match scene
    UIMP._setScene('match');
    UIMP._toast(msg.forced
      ? 'Resumed (host-canonical) — week ' + msg.week + '.'
      : 'Resumed — week ' + msg.week + '.');
    UIMP._forceRender();
  }

  function onClientResumeReject(msg) {
    UIMP._toast('Resume rejected: ' + (msg.reason || 'unknown'));
    if (msg.detail) console.warn('[resume] ' + msg.detail);
    // The host may still send a forced snapshot after prompting — keep
    // the connection open in case they do.
  }

  // ============================================================
  // UI — inject resume buttons into the lobby
  // ============================================================
  function injectResumeButtons() {
    var lobbyCards = document.querySelector('.lobby-cards');
    if (!lobbyCards) return;
    if (lobbyCards.querySelector('.resume-card')) return;

    var info = UIMP.mpGetResumeInfo();
    if (!info) return;

    var card = document.createElement('div');
    card.className = 'lobby-card resume-card';
    card.style.borderColor = '#ffd700';
    card.innerHTML =
      '<h2 style="color:#ffd700;">Resume Session</h2>' +
      '<p>Week ' + info.week + ' — saved ' + info.date + '</p>' +
      '<p style="font-size:0.8rem;color:#888;">Token ' +
        (info.token || '').slice(-10) + '</p>' +
      '<button id="btn-resume-host" class="btn-primary">Resume as Host</button>' +
      '<div style="margin-top:8px;display:flex;gap:6px;">' +
        '<input id="resume-host-id" class="lobby-input" placeholder="Host ID" style="flex:1;">' +
        '<button id="btn-resume-join" class="btn-primary">Resume as Client</button>' +
      '</div>' +
      '<button id="btn-resume-delete" style="margin-top:8px;background:#5a1010;color:#fff;border:1px solid #cc3030;border-radius:4px;padding:6px 12px;cursor:pointer;">Delete Resume Save</button>';

    lobbyCards.appendChild(card);

    document.getElementById('btn-resume-host').onclick = function () {
      UIMP.mpResumeAsHost();
    };
    document.getElementById('btn-resume-join').onclick = function () {
      var id = document.getElementById('resume-host-id').value.trim();
      UIMP.mpResumeAsClient(id);
    };
    document.getElementById('btn-resume-delete').onclick = function () {
      UIMP.mpDeleteResume();
      card.remove();
    };
  }

  // Watch the lobby so we can inject buttons whenever it renders
  function watchLobby() {
    var shell = document.getElementById('shell');
    if (!shell) return;
    var obs = new MutationObserver(function () {
      if (document.querySelector('.lobby-cards')) injectResumeButtons();
    });
    obs.observe(shell, { childList: true, subtree: true });
  }

  // ============================================================
  // UI — "Save & End Session" button in the match view
  // ============================================================
  UIMP.mpSaveAndEnd = function () {
    if (!UIMP.mpSaveResume()) return;
    // Tear down the connection cleanly. The existing _goLobby handles
    // MP.destroy() and resets state, but we want to save first — which
    // we just did.
    UIMP._goLobby();
    UIMP._toast('Session saved. Return to the lobby to resume later.');
  };

  // ============================================================
  // BOOT
  // ============================================================
  function boot() {
    if (!EMP.getState && !EMP.newMatch) { setTimeout(boot, 200); return; }
    watchLobby();
    // Also try once immediately in case we're already on the lobby
    setTimeout(injectResumeButtons, 400);
    console.log('[resume] ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 500); });
  } else {
    setTimeout(boot, 500);
  }
})();