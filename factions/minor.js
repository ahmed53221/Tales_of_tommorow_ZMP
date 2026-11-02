// factions/minor.js — AI-only minors.
//
// These are the small parties that appear in the single-player party list
// but never get a turn. They participate in elections, they drift, they
// are subject to the shared event pool, and they can be absorbed, but
// they never take actions of their own.
//
// Each minor gets its own module registration with:
//   - initState — creates a shared block with support / drift / satisfaction
//   - availableActions — empty
//   - applyAction — no-op
//   - tickWeek — drifts support toward its target
//   - checkVictory / checkDefeat — false (minors can't win or lose on their own)
//   - getVisibleState — for completeness, though UI won't often render them
//   - getSupport — returns { <ID>: support }
//
// Minors call into EngineMP for shared mechanics via nothing — they are
// purely passive. The shared engine sees them through state.partySupport.
//
// List of minors:
//   TIIA       — Tech & Innovation Independent Alliance (IIA splinter)
//   REPUBLIA   — Republia (right-wing nationalist, anti-Zalirian)
//   SPORTICA   — Sportica (athletes, right-leaning)
//   SEMP       — Spirit Front (ZMP secular wing splinter, spirit-heavy)
//   ZJP        — Zalian Extreme Jihad (ZMP jihadist wing splinter)
//   CRNP       — Conservative National Party (BL splinter)
//   FLO        — Freedom Liberty Order (BL splinter)
//   NHP        — New Hope Party (BL splinter)
//
// Semantics:
//   - Splinters (SEMP, ZJP) start at 0. They only exist once ZMP's secular
//     or jihadist wing splits. Until then, they don't appear in elections.
//   - Splinters (CRNP, FLO, NHP) start at 0. They only exist once the BL
//     is destroyed by a decisive battle.
//   - Traditional minors (TIIA, REPUBLIA, SPORTICA) start at their base
//     support and drift toward a target.

(function () {
  'use strict';
  if (!window.EngineMP) { console.error('minor.js: EngineMP missing'); return; }

  var E = window.EngineMP;

  // ============================================================
  // MINOR DEFINITIONS
  // ============================================================
  var MINORS = {

    // ============================================================
    // TIIA — Tech & Innovation Independent Alliance
    //   IIA splinter. Exists when IIA collapses or splits.
    //   Centre-left, tech-focused.
    // ============================================================
    TIIA: {
      id: 'TIIA',
      name: 'Tech & Innovation Independent Alliance',
      short: 'TIIA',
      tag: 'TIIA',
      color: '#17c0d8',
      tint: 'tint-cyan',
      baseSupport: 0,          // splinter — starts dormant
      driftTarget: 4,          // drifts toward 4% once it exists
      startDormant: true,
      isSplinter: true,
      splinterOf: 'IIA',
      description: 'A splinter of IIA. Forms when the tech party fractures. ' +
                   'Small, moderate, and perpetually about to merge back with IIA.',
      affinity: { zpf: 0, red: 5, iia: 15, bl: -10 },
      spirit: 4, gates: 5, unity: 0,
      mods: { gamers: 3, honor: 2, freshmen: 1 }
    },

    // ============================================================
    // REPUBLIA — Republia
    //   Right-wing nationalist minor. Anti-Zalirian, pro-order.
    //   Historical: 6%.
    // ============================================================
    REPUBLIA: {
      id: 'REPUBLIA',
      name: 'Republia',
      short: 'Republia',
      tag: 'REP',
      color: '#2a5c8a',
      tint: 'tint-blue',
      baseSupport: 6,
      driftTarget: 6,
      startDormant: false,
      isSplinter: false,
      description: 'A right-wing nationalist minor. Believes in order, ' +
                   'discipline, and the exclusion of the Zalirian minority. ' +
                   'Small, loud, and persistent.',
      affinity: { zpf: -5, red: -20, iia: 5, bl: 10, sportica: 10 },
      spirit: 5, gates: 8, unity: 5,
      mods: { honor: 3, seniors: 3, athletes: 2, buskids: -2, freshmen: -2 }
    },

    // ============================================================
    // SPORTICA — Sportica
    //   Athletes' party. Right-leaning, single-issue.
    //   Historical: 5%.
    // ============================================================
    SPORTICA: {
      id: 'SPORTICA',
      name: 'Sportica',
      short: 'Sportica',
      tag: 'SPT',
      color: '#17c0d8',
      tint: 'tint-cyan',
      baseSupport: 5,
      driftTarget: 5,
      startDormant: false,
      isSplinter: false,
      description: 'The athletes\' party. Single-issue: funding for sports, ' +
                   'facilities, and the gym. Right-leaning on everything else.',
      affinity: { zpf: -5, red: -10, iia: 5, bl: 5, republia: 10 },
      spirit: 5, gates: 5, unity: 10,
      mods: { athletes: 8, freshmen: 2, seniors: 1, honor: 1 }
    },

    // ============================================================
    // SEMP — Spirit Front (splinter of ZMP's secular wing)
    //   Exists only when ZMP's secular wing splits.
    //   Spirit-heavy, centrist, populist.
    // ============================================================
    SEMP: {
      id: 'SEMP',
      name: 'Spirit Front',
      short: 'SEMP',
      tag: 'SEMP',
      color: '#8fd06a',
      tint: 'tint-green',
      baseSupport: 0,
      driftTarget: 6,
      startDormant: true,
      isSplinter: true,
      splinterOf: 'ZMP',
      description: 'A splinter of the ZMP. Forms when the secular wing walks ' +
                   'out. Spirit-focused, populist, and always slightly louder ' +
                   'than necessary.',
      affinity: { zpf: 15, red: -5, iia: 0, bl: -15, zmp: -10 },
      spirit: 8, gates: 4, unity: 0,
      mods: { arts: 3, freshmen: 3, athletes: 2, honor: -1 }
    },

    // ============================================================
    // ZJP — Zalian Extreme Jihad (splinter of ZMP's jihadist wing)
    //   Exists only when ZMP's jihadist wing splits.
    //   Theocratic, anti-everything-modern.
    // ============================================================
    ZJP: {
      id: 'ZJP',
      name: 'Zalian Extreme Jihad',
      short: 'ZJP',
      tag: 'ZJP',
      color: '#a000a0',
      tint: 'tint-purple',
      baseSupport: 0,
      driftTarget: 3,
      startDormant: true,
      isSplinter: true,
      splinterOf: 'ZMP',
      description: 'A splinter of the ZMP. Forms when the jihadist wing walks ' +
                   'out. Wants a religious state and the expulsion of the ' +
                   'enemies of God. Small, isolated, and not going anywhere.',
      affinity: { zpf: -20, red: -20, iia: -15, bl: 5, zmp: -30 },
      spirit: 10, gates: 2, unity: -5,
      mods: { honor: 3, seniors: 2, buskids: 2, freshmen: -2, arts: -3 }
    },

    // ============================================================
    // CRNP — Conservative National Party (BL splinter)
    //   Exists only when BL shatters.
    //   Right-wing nationalist, less apocalyptic.
    // ============================================================
    CRNP: {
      id: 'CRNP',
      name: 'Conservative National Party',
      short: 'CrNP',
      tag: 'CrNP',
      color: '#2a5c8a',
      tint: 'tint-blue',
      baseSupport: 0,
      driftTarget: 4,
      startDormant: true,
      isSplinter: true,
      splinterOf: 'BL',
      description: 'A splinter of the Black League. Forms when BL shatters. ' +
                   'Right-wing nationalist, but not apocalyptic. Wants order, ' +
                   'tradition, and the removal of the Zalirian minority.',
      affinity: { zpf: 0, red: -25, iia: -10, bl: -5, republia: 20, sportica: 5 },
      spirit: 3, gates: 8, unity: 5,
      mods: { athletes: 8, honor: 12, seniors: 10, gamers: 4, arts: 4, freshmen: 4, buskids: 4 }
    },

    // ============================================================
    // FLO — Freedom Liberty Order (BL splinter)
    //   Exists only when BL shatters.
    //   Right-wing libertarian, contrarian, chaotic.
    // ============================================================
    FLO: {
      id: 'FLO',
      name: 'Freedom Liberty Order',
      short: 'FLO',
      tag: 'FLO',
      color: '#e0518f',
      tint: 'tint-pink',
      baseSupport: 0,
      driftTarget: 4,
      startDormant: true,
      isSplinter: true,
      splinterOf: 'BL',
      description: 'A splinter of the Black League. Forms when BL shatters. ' +
                   'Right-wing libertarian, hostile to all authority including ' +
                   'its own. Chaotic and contrarian.',
      affinity: { zpf: -10, red: -20, iia: 10, bl: -5, republia: 10, sportica: 5 },
      spirit: 7, gates: 2, unity: 0,
      mods: { athletes: 4, honor: 4, gamers: 12, arts: 8, freshmen: 8, seniors: 4, buskids: 4 }
    },

    // ============================================================
    // NHP — New Hope Party (BL splinter)
    //   Exists only when BL shatters.
    //   Centre-right reformist, least harmful of the splinters.
    // ============================================================
    NHP: {
      id: 'NHP',
      name: 'New Hope Party',
      short: 'NHP',
      tag: 'NHP',
      color: '#17c0d8',
      tint: 'tint-cyan',
      baseSupport: 0,
      driftTarget: 4,
      startDormant: true,
      isSplinter: true,
      splinterOf: 'BL',
      description: 'A splinter of the Black League. Forms when BL shatters. ' +
                   'Centre-right reformist, willing to work with the council. ' +
                   'The least harmful of the League\'s children.',
      affinity: { zpf: 10, red: -5, iia: 15, bl: -10, zmp: 5, republia: 5 },
      spirit: 5, gates: 5, unity: 5,
      mods: { athletes: 6, honor: 8, gamers: 6, arts: 8, freshmen: 8, seniors: 8, buskids: 6 }
    }
  };

  // ============================================================
  // REGISTER EACH MINOR
  // ============================================================
  Object.keys(MINORS).forEach(function (key) {
    var m = MINORS[key];

    var MODULE = {
      id: m.id,
      name: m.name,
      color: m.color,
      isAI: true,
      isSatellite: false,
      isMinor: true,
      description: m.description,
      tint: m.tint,
      short: m.short,
      tag: m.tag,
      mods: m.mods,
      affinity: m.affinity,
      spirit: m.spirit,
      gates: m.gates,
      unity: m.unity,

      // ---------- INIT ----------
      initState: function (st, playerId) {
        if (!st.shared[m.id]) {
          st.shared[m.id] = {
            support: m.startDormant ? 0 : m.baseSupport,
            driftTarget: m.driftTarget,
            drift: 0,
            dormant: m.startDormant,
            isMinor: true,
            isSplinter: !!m.isSplinter,
            splinterOf: m.splinterOf || null
          };
        }

        // Register in the party table so elections see it. Dormant
        // minors stay at 0 and don't appear in the ballot.
        if (st.partySupport[m.id] === undefined) {
          st.partySupport[m.id] = m.startDormant ? 0 : m.baseSupport;
        }
      },

      // ---------- ACTIONS ----------
      availableActions: function (st, playerId) {
        // Check if the minor is dormant — return empty if so
        var ms = st.shared[m.id];
        if (ms && ms.dormant) return [];
        return [];
      },

      applyAction: function (st, playerId, action) {
        // No-op. Minors never take actions.
      },

      // ---------- PASSIVE TICK ----------
      tickWeek: function (st, playerId) {
        var ms = st.shared[m.id];
        if (!ms) return;

        // Splinters activate when their parent splits
        if (ms.isSplinter && ms.dormant) {
          var activated = checkSplinterActivation(st, m, ms);
          if (!activated) {
            // Still dormant — mirror 0 support
            st.partySupport[m.id] = 0;
            return;
          }
        }

        // Drift toward target
        var drift = (ms.driftTarget - ms.support) * 0.02;
        ms.drift = drift;
        ms.support += drift + (st.rng() - 0.5) * 0.1;
        ms.support = Math.max(0.3, ms.support);

        // Clamp to a soft ceiling so minors don't grow beyond their role
        var ceiling = m.isSplinter ? (m.splinterOf === 'BL' ? 8 : 10) : 12;
        if (ms.support > ceiling) ms.support = ceiling;

        // Mirror to shared party table
        st.partySupport[m.id] = ms.support;
      },

      // ---------- WIN / LOSS ----------
      checkVictory: function (st, playerId) {
        // Minors can't win on their own.
        return false;
      },

      checkDefeat: function (st, playerId) {
        // Minors can't lose on their own.
        return false;
      },

      // ---------- VISIBILITY ----------
      getVisibleState: function (st, playerId) {
        var ms = st.shared[m.id] || {};
        return {
          week: st.week,
          you: m.id,
          yourState: ms,
          description: m.description,
          allPlayers: st.players.map(function (p) {
            return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
          }),
          lastElection: st.lastElection || null,
          log: st.log.slice(-15)
        };
      },

      // ---------- SUPPORT ----------
      getSupport: function (st, playerId) {
        var ms = st.shared[m.id];
        var support = 0;
        if (ms) {
          if (ms.dormant) support = 0;
          else support = ms.support || 0;
        }
        var out = {};
        out[m.id] = support;
        return out;
      }
    };

    E.registerFaction(MODULE);
  });

  // ============================================================
  // SPLINTER ACTIVATION
  //
  // A splinter activates when its parent faction splits. The check
  // reads flags and shared state:
  //
  //   SEMP  — activates when ZMP's secular wing has split
  //   ZJP   — activates when ZMP's jihadist wing has split
  //   TIIA  — activates when IIA collapses OR when IIA splits (we use a flag)
  //   CRNP  — activates when BL has splintered
  //   FLO   — activates when BL has splintered
  //   NHP   — activates when BL has splintered
  //
  // When activated, the splinter's `support` is set to whatever the
  // parent's split mechanic already put in st.partySupport — or to a
  // minimum viable value if the parent didn't hand any off.
  //
  function checkSplinterActivation(st, m, ms) {
    var activated = false;

    // Splinters of ZMP
    if (m.splinterOf === 'ZMP') {
      var zmp = st.shared.ZMP;
      if (!zmp) return false;

      if (m.id === 'SEMP' && zmp.secularSplit) {
        activated = true;
      }
      if (m.id === 'ZJP' && zmp.jihadistSplit) {
        activated = true;
      }
    }

    // Splinter of IIA
    if (m.splinterOf === 'IIA') {
      var iia = st.shared.IIA;
      if (!iia) return false;
      if (iia.collapsed) {
        activated = true;
      }
      // Also allow an explicit split flag
      if (st.flags && st.flags.tiiaSplit) {
        activated = true;
      }
    }

    // Splinters of BL
    if (m.splinterOf === 'BL') {
      if (st.flags && st.flags.blSplintered) {
        activated = true;
      }
    }

    if (!activated) return false;

    // Activate
    ms.dormant = false;

    // Support was already handed off by the parent's split mechanic.
    // If it's 0 (parent didn't do it), give a floor.
    if (ms.support < 1) {
      ms.support = m.driftTarget * 0.5;
    }

    // Ensure the party table reflects it
    st.partySupport[m.id] = ms.support;

    // Ensure the party appears in GameData so elections can render it
    if (window.GameData && window.GameData.PARTIES) {
      var exists = false;
      for (var i = 0; i < window.GameData.PARTIES.length; i++) {
        if (window.GameData.PARTIES[i].id === m.id) { exists = true; break; }
      }
      if (!exists) {
        window.GameData.PARTIES.push({
          id: m.id,
          name: m.name,
          short: m.short,
          tag: m.tag,
          color: m.color,
          player: false,
          blurb: m.description,
          spirit: m.spirit,
          gates: m.gates,
          coalition: 20,
          base: m.mods || {}
        });
      }
    }

    st.log.push('Splinter activated: ' + m.name + ' (' + Math.round(ms.support * 10) / 10 + '%).');
    return true;
  }

  // ============================================================
  // REGISTER-BUT-DORMANT  (helps UI list them ahead of activation)
  //
  // This is a one-shot call that appends dormant minors to GameData.PARTIES
  // as invisible (base = 0) parties so the UI can render them once they
  // activate. engine_mp already handles the case where they don't exist.
  //
  function ensureMinorsInGameData() {
    if (!window.GameData || !window.GameData.PARTIES) return;
    Object.keys(MINORS).forEach(function (key) {
      var m = MINORS[key];
      var exists = false;
      for (var i = 0; i < window.GameData.PARTIES.length; i++) {
        if (window.GameData.PARTIES[i].id === m.id) { exists = true; break; }
      }
      if (!exists) {
        var base = {};
        // Use mods as base if we have them
        if (m.mods) {
          for (var dm in m.mods) base[dm] = m.mods[dm];
        }
        window.GameData.PARTIES.push({
          id: m.id,
          name: m.name,
          short: m.short,
          tag: m.tag,
          color: m.color,
          player: false,
          blurb: m.description,
          spirit: m.spirit,
          gates: m.gates,
          coalition: 20,
          base: base,
          isMinor: true,
          isSplinter: !!m.isSplinter
        });
      }
    });
  }

  // Call this immediately so UI can list minors even before they activate.
  // Party support for dormant minors stays at 0 in state.partySupport so
  // they don't appear in election totals.
  ensureMinorsInGameData();

  // ============================================================
  // EXPORTS
  // ============================================================
  window.MinorModule = {
    MINORS: MINORS,
    ensureMinorsInGameData: ensureMinorsInGameData
  };
})();