// factions/pl.js — Pep League satellite module.
//
// PL is not a full player faction. It has no independent controller.
// It is a satellite of IIA: its support is locked to IIA's survival, but
// its satisfaction drives IIA's performance (via the IIA reform chain's
// PL-facing actions) and its own.
//
// PL has three modes:
//   - supporting  (default) — normal satellite. Support 4%.
//   - withholding (if satisfaction < 20) — support drops to 0.
//   - resumed     (if satisfaction > 40 while withholding) — support returns.
//
// PL's own actions exist in the IIA module (iia_pl_caucus, iia_pl_fund,
// iia_pl_rally). This module exists so engine_mp can find PL in the
// faction registry, tick it, and expose its state to the shared UI.
//
// PL is never a player faction. It cannot be controlled. It just is.
//
// Calls into EngineMP for shared mechanics: none. PL is self-contained.

(function () {
  'use strict';
  if (!window.EngineMP) { console.error('pl.js: EngineMP missing'); return; }

  var E = window.EngineMP;

  var PL_LOCKED_SUPPORT = 4;

  // ============================================================
  // FACTION DESCRIPTION  (used by UI)
  // ============================================================
  var FACTION_DESCRIPTION = {
    name: 'Pep League',
    line: 'The school spirit wing. The colour, the noise, the fun.',
    desc: 'The Pep League is the colour guard of the IIA bloc. They organize ' +
          'pep rallies, spirit weeks, and the kind of events that make the ' +
          'hallways loud. They are locked to IIA — but they have opinions, ' +
          'and when they are unhappy, they withhold their support.',
    tint: 'tint-pink',
    n: 8,
    affinity: { zpf: -5, red: 5, rb: 5, bl: -20, semp: 20, iia: 15 },
    spirit: 7, gates: 3, unity: 5,
    mods: { arts: 3, freshmen: 3, athletes: 2, honor: -1 }
  };

  // ============================================================
  // MODULE
  // ============================================================
  var PL = {
    id: 'PL',
    name: 'Pep League',
    color: '#ff6b6b',
    isSatellite: true,
    patron: 'IIA',
    isPlayer: false,

    // ---------- INIT ----------
    //
    // PL's state lives inside IIA's satellite block. When IIA is not
    // present in the match (rare), PL gets its own satellite block so
    // elections can still count it.
    //
    initState: function (st, playerId) {
      // If IIA exists and has the PL block, we're done.
      if (st.shared.IIA && st.shared.IIA.plSatisfaction !== undefined) {
        return;
      }

      // Otherwise give PL its own tiny state so it can participate in
      // elections without a patron.
      if (!st.shared.PL) {
        st.shared.PL = {
          support: PL_LOCKED_SUPPORT,
          satisfaction: 65,
          withholding: false,
          autonomous: true
        };
      }
    },

    // ---------- ACTIONS ----------
    //
    // PL has no player. Its actions are exposed so the UI can show what
    // IIA is doing on PL's behalf. But applyAction is a no-op — all PL
    // interactions happen through IIA's actions.
    //
    availableActions: function (st, playerId) {
      return [];   // PL has no independent actions
    },

    applyAction: function (st, playerId, action) {
      // No-op. PL is driven by IIA.
    },

    // ---------- PASSIVE TICK ----------
    //
    // PL's tick is a no-op if IIA exists, because IIA's own tick already
    // manages PL's satisfaction, withholding, and support. PL's tick only
    // matters in the rare case where PL has its own autonomous state.
    //
    tickWeek: function (st, playerId) {
      // Case 1: IIA is present — PL is driven by IIA's tick.
      if (st.shared.IIA && st.shared.IIA.plSatisfaction !== undefined) {
        // Just mirror into the party table so elections see us.
        var iia = st.shared.IIA;
        st.partySupport.pl = iia.plWithholding ? 0 : PL_LOCKED_SUPPORT;
        return;
      }

      // Case 2: autonomous PL (no IIA in match).
      var pl = st.shared.PL;
      if (!pl) return;

      // Satisfaction decays slowly
      pl.satisfaction = Math.max(0, pl.satisfaction - 1);

      // Withholding logic
      if (!pl.withholding && pl.satisfaction < 20) {
        pl.withholding = true;
        st.log.push('PL withholds support.');
      } else if (pl.withholding && pl.satisfaction > 40) {
        pl.withholding = false;
        st.log.push('PL resumes supporting.');
      }

      // Support stays at the locked value
      pl.support = PL_LOCKED_SUPPORT;

      // Mirror to shared party table
      st.partySupport.pl = pl.withholding ? 0 : PL_LOCKED_SUPPORT;
    },

    // ---------- WIN / LOSS ----------
    //
    // PL has no independent victory or defeat condition. Its fate is
    // tied to IIA's: if IIA wins, PL is part of the winning bloc; if
    // IIA collapses, PL collapses.
    //
    checkVictory: function (st, playerId) {
      return false;
    },

    checkDefeat: function (st, playerId) {
      // PL is considered "defeated" only if IIA collapses.
      var iia = st.shared.IIA;
      if (iia && iia.collapsed) return true;
      return false;
    },

    // ---------- VISIBILITY ----------
    getVisibleState: function (st, playerId) {
      var iia = st.shared.IIA;
      var autonomous = st.shared.PL;

      if (iia && iia.plSatisfaction !== undefined) {
        return {
          week: st.week,
          you: 'PL',
          factionDescription: FACTION_DESCRIPTION,
          plState: {
            support: PL_LOCKED_SUPPORT,
            satisfaction: iia.plSatisfaction,
            withholding: iia.plWithholding,
            autonomous: false
          },
          patronState: {
            id: 'IIA',
            support: iia.support,
            collapsed: iia.collapsed,
            reformsPassed: iia.reformState ? iia.reformState.reformsPassed.length : 0,
            inGovernment: iia.inGovernment
          },
          allPlayers: st.players.map(function (p) {
            return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
          }),
          log: st.log.slice(-15)
        };
      }

      // Autonomous
      return {
        week: st.week,
        you: 'PL',
        factionDescription: FACTION_DESCRIPTION,
        plState: {
          support: PL_LOCKED_SUPPORT,
          satisfaction: autonomous ? autonomous.satisfaction : 65,
          withholding: autonomous ? autonomous.withholding : false,
          autonomous: true
        },
        patronState: null,
        allPlayers: st.players.map(function (p) {
          return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
        }),
        log: st.log.slice(-15)
      };
    },

    // ---------- SUPPORT ----------
    getSupport: function (st, playerId) {
      var iia = st.shared.IIA;
      if (iia && iia.plWithholding !== undefined) {
        return { PL: iia.plWithholding ? 0 : PL_LOCKED_SUPPORT };
      }
      var autonomous = st.shared.PL;
      if (autonomous) {
        return { PL: autonomous.withholding ? 0 : PL_LOCKED_SUPPORT };
      }
      return { PL: PL_LOCKED_SUPPORT };
    }
  };

  // ============================================================
  // REGISTER
  // ============================================================
  E.registerFaction(PL);

  // Expose for UI
  window.PLModule = PL;
  window.PL_DESCRIPTION = FACTION_DESCRIPTION;
  window.PL_LOCKED_SUPPORT = PL_LOCKED_SUPPORT;
})();