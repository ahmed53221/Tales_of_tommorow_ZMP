// multiplayer.js — PeerJS wrapper, message protocol, heartbeat, disconnect handling.
// Sits between ui_mp.js and engine_mp.js. Knows nothing about factions.
// Depends on: PeerJS (loaded from CDN in mp.html).

window.Multiplayer = (function () {
  'use strict';

  var CFG = {
    heartbeatInterval: 5,
    disconnectTimeout: 30,
    peerOptions: { debug: 1 }
  };

  var peer = null;
  var conn = null;
  var isHost = false;
  var myPeerId = null;
  var hostPeerId = null;
  var heartbeatTimer = null;
  var lastHeardAt = 0;
  var heartbeatCheckTimer = null;

  var callbacks = {
    onOpen: null,
    onPeerConnected: null,
    onPeerDisconnected: null,
    onMessage: null,
    onError: null,
    onHostLost: null
  };

  // ============================================================
  // HOST
  // ============================================================
  function host() {
    if (peer) destroy();
    isHost = true;

    peer = new Peer(CFG.peerOptions);

    peer.on('open', function (id) {
      myPeerId = id;
      console.log('[mp] hosting as ' + id);
      if (callbacks.onOpen) callbacks.onOpen(id);
    });

    peer.on('connection', function (incoming) {
      if (conn && conn.open) {
        incoming.close();
        return;
      }
      conn = incoming;
      hostWireConnection(conn);
    });

    peer.on('error', function (err) {
      console.error('[mp] host error:', err);
      if (callbacks.onError) callbacks.onError(err);
    });
  }

  function hostWireConnection(c) {
    c.on('open', function () {
      console.log('[mp] client connected: ' + c.peer);
      startHeartbeat();
      if (callbacks.onPeerConnected) callbacks.onPeerConnected(c.peer);
    });

    c.on('data', function (msg) {
      lastHeardAt = Date.now();
      handleIncoming(msg);
    });

    c.on('close', function () {
      console.log('[mp] client disconnected: ' + c.peer);
      conn = null;
      stopHeartbeat();
      if (callbacks.onPeerDisconnected) callbacks.onPeerDisconnected(c.peer);
    });

    c.on('error', function (err) {
      console.error('[mp] connection error:', err);
      if (callbacks.onError) callbacks.onError(err);
    });
  }

  // ============================================================
  // CLIENT
  // ============================================================
  function join(hostId) {
    if (peer) destroy();
    isHost = false;
    hostPeerId = hostId;

    peer = new Peer(CFG.peerOptions);

    peer.on('open', function (id) {
      myPeerId = id;
      console.log('[mp] joined as ' + id + ', connecting to ' + hostId);

      conn = peer.connect(hostId, { reliable: true });
      clientWireConnection(conn);

      if (callbacks.onOpen) callbacks.onOpen(id);
    });

    peer.on('error', function (err) {
      console.error('[mp] client error:', err);
      if (callbacks.onError) callbacks.onError(err);
    });
  }

  function clientWireConnection(c) {
    c.on('open', function () {
      console.log('[mp] connected to host');
      startHeartbeat();
      if (callbacks.onPeerConnected) callbacks.onPeerConnected(c.peer);
    });

    c.on('data', function (msg) {
      lastHeardAt = Date.now();
      handleIncoming(msg);
    });

    c.on('close', function () {
      console.log('[mp] host closed the connection');
      stopHeartbeat();
      if (callbacks.onHostLost) callbacks.onHostLost();
    });

    c.on('error', function (err) {
      console.error('[mp] connection error:', err);
      if (callbacks.onError) callbacks.onError(err);
    });
  }

  // ============================================================
  // SEND
  // ============================================================
  function send(msg) {
    if (!conn || !conn.open) {
      console.warn('[mp] cannot send, no open connection');
      return false;
    }
    conn.send(msg);
    return true;
  }

  // ============================================================
  // RECEIVE
  // ============================================================
  function handleIncoming(msg) {
    if (!msg || !msg.type) return;
        switch (msg.type) {
      case 'heartbeat':
        return;
      case 'ready':
      case 'action':
      case 'formation_choice':
      case 'presidential_choice':
      case 'ministry_pick':
      case 'ministry_action':
      case 'toast':
      case 'event_response':
      case 'snapshot':
      case 'victory':
      case 'forfeit':
      case 'chat':
      case 'advisor_rotate':
      // resume handshake
      case 'resume_hello':
      case 'resume_accept':
      case 'resume_reject':
      // liveness
      case 'snapshot_request':
      case 'ping':
        if (callbacks.onMessage) callbacks.onMessage(msg);
        return;
      default:
        console.warn('[mp] unknown message type:', msg.type);
    }
  }

  // ============================================================
  // HEARTBEAT
  // ============================================================
  function startHeartbeat() {
    lastHeardAt = Date.now();

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(function () {
      send({ type: 'heartbeat', at: Date.now() });
    }, CFG.heartbeatInterval * 1000);

    if (heartbeatCheckTimer) clearInterval(heartbeatCheckTimer);
    heartbeatCheckTimer = setInterval(function () {
      var silence = (Date.now() - lastHeardAt) / 1000;
      if (silence > CFG.disconnectTimeout) {
        console.warn('[mp] connection silent for ' + silence.toFixed(0) + 's');
        stopHeartbeat();
        if (isHost) {
          if (callbacks.onPeerDisconnected) callbacks.onPeerDisconnected(conn ? conn.peer : null);
        } else {
          if (callbacks.onHostLost) callbacks.onHostLost();
        }
      }
    }, CFG.heartbeatInterval * 1000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (heartbeatCheckTimer) { clearInterval(heartbeatCheckTimer); heartbeatCheckTimer = null; }
  }

  // ============================================================
  // CLEANUP
  // ============================================================
  function destroy() {
    stopHeartbeat();
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    myPeerId = null;
    hostPeerId = null;
    isHost = false;
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function getMyId() { return myPeerId; }
  function isConnected() { return !!(conn && conn.open); }
  function amHost() { return isHost; }

  // ============================================================
  // PUBLIC API
  // ============================================================
  return {
    CFG: CFG,
    host: host,
    join: join,
    send: send,
    destroy: destroy,
    getMyId: getMyId,
    isConnected: isConnected,
    amHost: amHost,
    on: function (name, fn) { callbacks[name] = fn; }
  };
})();