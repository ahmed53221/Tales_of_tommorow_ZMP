// factions/zpf.js — Centre Party faction module for multiplayer.
//
// ZPF is a single-ideology party: Zalgrilian, anti-monarchy, gamer-heavy.
// No internal factions. No splits. No paramilitary.
//
// ZPF's support is a barometer of how monarchist ZMP is being:
//   - ZMP tilts toward zalgrilianist → ZPF grows (Zalgrilian voters defect)
//   - ZMP tilts toward secular/securro → ZPF shrinks (voters return to ZMP)
//   - ZPF in coalition with ZMP → ZPF grows (historical arc, 12% → 17%)
//   - ZPF alone → ZPF shrinks (its base is too small to grow on its own)
//
// ZPF's job is to be the balance wheel. It wins if ZMP + ZPF ≥ 50 at week 104
// and ZPF survives.
//
// Event handling: ZPF's inbox is state.queues['ZPF'].
//
// Calls into EngineMP for shared mechanics:
//   - EngineMP.breakWall(trigger)
//   - EngineMP.crushCell / placeBLChill
//   - EngineMP.applyEffects

(function () {
  'use strict';
  if (!window.EngineMP) { console.error('zpf.js: EngineMP missing'); return; }

  var E = window.EngineMP;

  // ============================================================
  // FACTION DESCRIPTION  (used by UI)
  // ============================================================
  var FACTION_DESCRIPTION = {
    name: 'Centre Party',
    line: 'Zalgrilia without a crown. Order without a king.',
    desc: 'Zalgrilian traditionalists who broke from the ZMP over the question ' +
          'of the monarchy. They believe in the nation, the flag, and the gamer ' +
          'LAN party. They are the party of the honour students, the wifi ' +
          'petitioners, and the students who want order but not a king. ' +
          'They are the historical coalition partner of the ZMP — when the ' +
          'ZMP is being Zalgrilian enough, ZPF grows.',
    tint: 'tint-green-dark',
    n: 9,
    affinity: { zmp: 75, iia: 5, red: -5, rb: -5, bl: -20, semp: -5 },
    spirit: 6, gates: 6, unity: 5,
    mods: { gamers: 4, honor: 3, seniors: 2, arts: -1 }
  };

  // ============================================================
  // MODULE
  // ============================================================
  var ZPF = {
    id: 'ZPF',
    name: 'Centre Party',
    color: '#006400',
    isPlayer: true,

    // ---------- INIT ----------
    initState: function (st, playerId) {
      if (!st.shared.ZPF) {
        st.shared.ZPF = {
          // Core
          support: 12,             // historical starting point
          funds: 60,
          volunteers: 10,
          unity: 70,
          faculty: 65,
          momentum: 0,

          // Coalition state
          inCoalition: false,
          timesInCoalition: 0,
          timesAlone: 0,

          // Anti-monarchy pressure — builds when ZMP tilts toward zalgrilianist
          antiMonarchyPressure: 0,

          // Track ZMP's last tilt so we know whether to grow or shrink
          lastZmpTilt: null,

          // Government flags
          inGovernment: false,

          // Optional paramilitary (small, defensive — ZPF Defenders)
          defenders: {
            members: 80,
            training: 5,
            equipment: 4,
            morale: 70,
            loyalty: 80,
            strength: 32
          },

          // Tracking
          eventDone: {},
          pendingEvent: null
        };
      }
    },

    // ---------- ACTIONS ----------
    availableActions: function (st, playerId) {
      var zpf = st.shared.ZPF;
      var actions = [];

      // ---- BASE GROWTH (gamer-heavy, tech-adjacent) ----
      actions.push(
        { id: 'zpf_lan_party',       name: 'LAN Party',           ap: 1, funds: 6,  vol: 2,
          desc: 'Gamers turn out. Modest ZPF support gain.' },
        { id: 'zpf_wifi_petition',   name: 'Wifi Petition',       ap: 1, funds: 4,  vol: 1,
          desc: 'The classic gamer issue. Small gain, high reliability.' },
        { id: 'zpf_tech_club',       name: 'Fund a Tech Club',    ap: 1, funds: 10, vol: 1,
          desc: 'Institutional presence. Slow, compounding support gain.' },
        { id: 'zpf_fundraise',       name: 'Game Tournament',     ap: 1, funds: 0,  vol: 0,
          desc: 'Raise funds from the gamer base.' },
        { id: 'zpf_recruit',         name: 'Recruit Volunteers',  ap: 1, funds: 0,  vol: 0,
          desc: 'Recruit at the gates.' },
        { id: 'zpf_canvass',         name: 'Canvass a Bloc',      ap: 1, funds: 0,  vol: 3,
          desc: 'Canvass a voting bloc.', needsTarget: 'demo' }
      );

      // ---- ZALGRILIAN IDENTITY ----
      actions.push(
        { id: 'zpf_republican_pitch', name: 'Republican Pitch',   ap: 1, funds: 8,  vol: 2,
          desc: 'A Zalgrilian party without a crown. Pitches directly against ZMP.' },
        { id: 'zpf_no_crown_rally',   name: 'No Crown Rally',     ap: 2, funds: 14, vol: 4,
          desc: 'A public rally against the crown. Big gain, ZMP notices.' },
        { id: 'zpf_heritage_march',   name: 'Heritage March',     ap: 1, funds: 10, vol: 3,
          desc: 'Celebrate Zalgrilian heritage without the crown.' }
      );

      // ---- ALLIANCE MANAGEMENT ----
      actions.push(
        { id: 'zpf_zmp_talks',       name: 'Open ZMP Talks',      ap: 1, funds: 5,  vol: 0,
          desc: 'Begin coalition talks with ZMP.' },
        { id: 'zpf_iia_talks',       name: 'Open IIA Talks',      ap: 1, funds: 5,  vol: 0,
          desc: 'Talk to IIA about R&B coordination.' },
        { id: 'zpf_neutral_pledge',  name: 'Pledge Neutrality',   ap: 1, funds: 0,  vol: 0,
          desc: 'Publicly stay out of the ZMP-IIA fight. Stable but no growth.' },
        { id: 'zpf_negotiate',       name: 'Back-Room Talks',     ap: 1, funds: 4,  vol: 0,
          needsTarget: 'party', desc: 'Improve affinity with a party.' },
        { id: 'zpf_coalition',       name: 'Offer Coalition',     ap: 2, funds: 12, vol: 2,
          needsTarget: 'party', desc: 'Formal coalition offer.' },
        { id: 'zpf_relations_talk',  name: 'Diplomatic Talks',    ap: 1, funds: 3,  vol: 0,
          needsTarget: 'party', desc: 'Send envoys. Small affinity gain.' },
        { id: 'zpf_relations_gift',  name: 'Campaign Support',    ap: 1, funds: 12, vol: 1,
          needsTarget: 'party', desc: 'Offer campaign support. Bigger gain.' }
      );

      // ---- ZPF DEFENDERS (small paramilitary) ----
      actions.push(
        { id: 'zpf_train_defenders',   name: 'Train Defenders',   ap: 2, funds: 15, vol: 2,
          desc: 'Train the ZPF Defenders.' },
        { id: 'zpf_equip_defenders',   name: 'Equip Defenders',   ap: 2, funds: 20, vol: 1,
          desc: 'Equip the ZPF Defenders.' },
        { id: 'zpf_recruit_defenders', name: 'Recruit Defenders', ap: 1, funds: 8,  vol: 2,
          desc: 'Recruit into the ZPF Defenders.' }
      );

      // ---- ANTI-BL WALLS ----
      actions.push(
        { id: 'zpf_anti_bl_denounce',    name: 'Denounce BL',    ap: 1, funds: 0,  vol: 2,
          desc: 'Publicly denounce the Black League. Breaks a wall.' },
        { id: 'zpf_anti_bl_investigate', name: 'Investigate BL', ap: 1, funds: 5,  vol: 1,
          desc: 'Investigate the Black League. Breaks a wall.' },
        { id: 'zpf_anti_bl_prosecute',   name: 'Prosecute BL',   ap: 2, funds: 10, vol: 1,
          desc: 'Prosecute BL leaders. Breaks a wall.' },
        { id: 'zpf_anti_bl_ban',         name: 'Ban BL',         ap: 3, funds: 20, vol: 2,
          desc: 'Formally ban the Black League. Breaks the final wall.' }
      );

      // ---- CELL HUNTING ----
      actions.push(
        { id: 'zpf_gather_intelligence', name: 'Gather Intelligence', ap: 1, funds: 5, vol: 1,
          desc: 'Send agents to gather intelligence on BL cells.' }
      );

      // ---- FOREIGN ----
      actions.push(
        { id: 'zpf_relations_wein', name: 'Envoys to Wein', ap: 1, funds: 5, vol: 0,
          desc: 'Improve relations with Arbeiter von Wein.' }
      );

      return actions;
    },

    // ---------- APPLY ----------
    applyAction: function (st, playerId, action) {
      if (!action) return;
      if (typeof action === 'string') action = { id: action };
      var zpf = st.shared.ZPF;
      var id = action.id || '';
      var target = action.target || null;
      var rng = st.rng;
      var notes = [];
      var msg = '';

      // ---- ANTI-BL WALL ACTIONS ----
      if (id.indexOf('zpf_anti_bl_') === 0) {
        var trigger = id.replace('zpf_anti_bl_', '');
        var result = E.breakWall(trigger);
        if (result.ok) {
          notes.push('The ' + trigger + ' breaks the ' + result.wall.name + '.');
        } else {
          notes.push('The ' + trigger + ' has no effect — ' + result.msg);
        }
        st.log.push('Week ' + st.week + ': ZPF ' + id);
        return;
      }

      switch (id) {

        // ============================================================
        // BASE GROWTH
        // ============================================================
        case 'zpf_lan_party':
          zpf.support += 0.5 + (rng() - 0.5) * 0.3;
          zpf.funds -= 6;
          zpf.volunteers -= 2;
          msg = 'LAN party. Support +0.5.';
          break;

        case 'zpf_wifi_petition':
          zpf.support += 0.3 + (rng() - 0.5) * 0.2;
          zpf.funds -= 4;
          zpf.volunteers -= 1;
          msg = 'Wifi petition. Support +0.3.';
          break;

        case 'zpf_tech_club':
          zpf.support += 0.2 + (rng() - 0.5) * 0.15;
          zpf.funds -= 10;
          zpf.volunteers -= 1;
          zpf.faculty = Math.min(100, zpf.faculty + 1);
          msg = 'Tech club funded. Support +0.2, faculty +1.';
          break;

        case 'zpf_fundraise':
          var raised = Math.round(12 + zpf.volunteers * 0.7 + rng() * 8);
          zpf.funds += raised;
          msg = 'Game tournament raises $' + raised + '.';
          break;

        case 'zpf_recruit':
          var got = Math.round(2 + rng() * 3 + zpf.momentum * 0.2);
          zpf.volunteers += got;
          msg = got + ' new volunteers recruited.';
          break;

        case 'zpf_canvass':
          if (target) {
            zpf.support += 0.6 + rng() * 0.3;
            zpf.volunteers -= 3;
            msg = 'Canvassed ' + target + '. Support +0.7.';
          }
          break;

        // ============================================================
        // ZALGRILIAN IDENTITY
        // ============================================================
        case 'zpf_republican_pitch':
          zpf.support += 0.6 + (rng() - 0.5) * 0.4;
          zpf.antiMonarchyPressure = Math.min(100, zpf.antiMonarchyPressure + 5);
          zpf.funds -= 8;
          zpf.volunteers -= 2;
          msg = 'Republican pitch. Support +0.6, anti-monarchy pressure +5.';
          break;

        case 'zpf_no_crown_rally':
          zpf.support += 1.5 + (rng() - 0.5) * 0.7;
          zpf.antiMonarchyPressure = Math.min(100, zpf.antiMonarchyPressure + 10);
          zpf.funds -= 14;
          zpf.volunteers -= 4;
          zpf.momentum += 2;
          // ZMP notices
          if (st.shared.ZMP) {
            st.shared.ZMP.support = Math.max(0, st.shared.ZMP.support - 0.4);
          }
          msg = 'No Crown rally. Support +1.5, anti-monarchy +10. ZMP -0.4.';
          break;

        case 'zpf_heritage_march':
          zpf.support += 0.8 + rng() * 0.4;
          zpf.antiMonarchyPressure = Math.min(100, zpf.antiMonarchyPressure + 3);
          zpf.funds -= 10;
          zpf.volunteers -= 3;
          msg = 'Heritage march. Support +0.9, anti-monarchy +3.';
          break;

        // ============================================================
        // ALLIANCE
        // ============================================================
        case 'zpf_zmp_talks':
          zpf.funds -= 5;
          if (st.shared.ZMP) {
            st.shared.ZMP.support = Math.max(0, st.shared.ZMP.support - 0.2);
          }
          if (rng() < 0.4) {
            zpf.inCoalition = true;
            msg = 'ZPF enters coalition with ZMP.';
          } else {
            msg = 'ZMP-ZPF talks continue.';
          }
          break;

        case 'zpf_iia_talks':
          zpf.funds -= 5;
          zpf.momentum += 1;
          if (!st.affinity) st.affinity = {};
          st.affinity.iia = Math.min(100, (st.affinity.iia || 25) + 10);
          msg = 'ZPF opens talks with IIA. Affinity +10.';
          break;

        case 'zpf_neutral_pledge':
          zpf.inCoalition = false;
          zpf.antiMonarchyPressure = Math.max(0, zpf.antiMonarchyPressure - 10);
          msg = 'ZPF pledges neutrality.';
          break;

        case 'zpf_negotiate':
          if (target) {
            var gain = Math.round(8 + rng() * 10 + zpf.momentum * 0.4);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gain);
            msg = 'Talks with ' + target + '. Affinity +' + gain + '.';
          }
          break;

        case 'zpf_coalition':
          if (target) {
            var cGain = Math.round(10 + rng() * 15 + zpf.momentum * 0.5);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + cGain);
            msg = 'Coalition talks with ' + target + '. Affinity +' + cGain + '.';
          }
          break;

        case 'zpf_relations_talk':
          if (target) {
            var tGain = 3 + rng() * 4;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + tGain);
            msg = 'Envoys to ' + target + '. Affinity +' + tGain.toFixed(1) + '.';
          }
          break;

        case 'zpf_relations_gift':
          if (target) {
            var gGain = 8 + rng() * 7;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gGain);
            msg = 'Campaign support to ' + target + '. Affinity +' + gGain.toFixed(1) + '.';
          }
          break;

        // ============================================================
        // ZPF DEFENDERS
        // ============================================================
        case 'zpf_train_defenders':
          zpf.defenders.training = Math.min(10, zpf.defenders.training + 1);
          zpf.funds -= 15;
          zpf.volunteers -= 2;
          msg = 'ZPF Defenders trained. Training now ' + zpf.defenders.training + '/10.';
          break;

        case 'zpf_equip_defenders':
          zpf.defenders.equipment = Math.min(10, zpf.defenders.equipment + 1);
          zpf.funds -= 20;
          zpf.volunteers -= 1;
          msg = 'ZPF Defenders equipped. Equipment now ' + zpf.defenders.equipment + '/10.';
          break;

        case 'zpf_recruit_defenders':
          var gained = 8 + Math.floor(rng() * 8);
          zpf.defenders.members += gained;
          zpf.funds -= 8;
          zpf.volunteers -= 2;
          msg = 'Recruited ' + gained + ' into the ZPF Defenders.';
          break;

        // ============================================================
        // CELL HUNTING
        // ============================================================
        case 'zpf_gather_intelligence':
          if (!st.blackLeagueCells) E.placeBLChill(st, rng);
          st.blackLeagueCells.intelligence = (st.blackLeagueCells.intelligence || 0) + 2 + Math.floor(rng() * 3);
          var cells = st.blackLeagueCells.cells.filter(function(c) { return !c.destroyed; });
          if (cells.length > 0) {
            var cell = cells[Math.floor(rng() * cells.length)];
            cell.discovered = true;
            cell.intelLevel = Math.min(5, (cell.intelLevel || 0) + 1);
            msg = 'Revealed cell in ' + cell.locationName + '.';
          } else {
            msg = 'Intelligence gathered. No cells present.';
          }
          break;

        // ============================================================
        // FOREIGN
        // ============================================================
        case 'zpf_relations_wein':
          if (!st.affinity) st.affinity = {};
          var weinGain = 5 + rng() * 3;
          st.affinity.wein = Math.min(100, (st.affinity.wein || 40) + weinGain);
          msg = 'Wein relations +' + weinGain.toFixed(1) + '.';
          break;

        default:
          msg = 'Unknown action: ' + id;
          break;
      }

      // Recompute defenders strength
      var d = zpf.defenders;
      d.strength = Math.round(
        d.members *
        ((d.training / 10 + d.equipment / 10) / 2) *
        (d.morale / 100)
      );

      st.log.push('Week ' + st.week + ': ZPF action ' + id + ' — ' + msg);
      if (notes.length > 0) {
        st.log.push('  ' + notes.join(' '));
      }
    },

    // ---------- PASSIVE TICK ----------
    //
    // This is where ZPF's core mechanic lives:
    // ZPF support drifts based on (a) which sub-faction is dominant in ZMP,
    // (b) whether ZPF is in coalition, and (c) anti-monarchy pressure.
    //
    tickWeek: function (st, playerId) {
      var zpf = st.shared.ZPF;
      if (!zpf) return;

      // Resources
      zpf.funds += 5;
      zpf.momentum = Math.round(zpf.momentum * 0.85);

      // Determine ZMP's current tilt
      var zmp = st.shared.ZMP;
      var zmpTilt = null;
      if (zmp && zmp.shares) {
        var s = zmp.shares;
        var best = 'securro', bestVal = s.securro;
        if (s.zalgrilianist > bestVal) { best = 'zalgrilianist'; bestVal = s.zalgrilianist; }
        if (s.secular > bestVal) { best = 'secular'; bestVal = s.secular; }
        if (s.jihadist > bestVal) { best = 'jihadist'; bestVal = s.jihadist; }
        zmpTilt = best;
      }
      zpf.lastZmpTilt = zmpTilt;

      // Baseline drift toward 15%
      var drift = (15 - zpf.support) * 0.015;

      // Anti-monarchy tailwind / headwind
      var tiltEffect = 0;
      if (zmpTilt === 'zalgrilianist' || zmpTilt === 'jihadist') {
        tiltEffect = +0.15;
        zpf.antiMonarchyPressure = Math.min(100, zpf.antiMonarchyPressure + 1);
      } else if (zmpTilt === 'secular' || zmpTilt === 'securro') {
        tiltEffect = -0.10;
        zpf.antiMonarchyPressure = Math.max(0, zpf.antiMonarchyPressure - 1);
      }

      // Coalition effect
      var coalitionEffect = 0;
      if (zpf.inCoalition) {
        coalitionEffect = +0.20;
        zpf.timesInCoalition += 1;
      } else {
        coalitionEffect = -0.08;
        zpf.timesAlone += 1;
      }

      // Anti-monarchy pressure bonus (caps at +0.3)
      var pressureEffect = (zpf.antiMonarchyPressure / 100) * 0.3;

      zpf.support += drift + tiltEffect + coalitionEffect + pressureEffect;

      // Clamp
      if (zpf.support < 3) zpf.support = 3;
      if (zpf.support > 30) zpf.support = 30;

      // Defenders morale drifts
      zpf.defenders.morale = Math.max(30, zpf.defenders.morale - 0.5);
      var d = zpf.defenders;
      d.strength = Math.round(
        d.members *
        ((d.training / 10 + d.equipment / 10) / 2) *
        (d.morale / 100)
      );

      // Log meaningful tilt changes
      if (zmpTilt && zpf._lastLoggedTilt !== zmpTilt) {
        zpf._lastLoggedTilt = zmpTilt;
        st.log.push('ZPF notes ZMP tilting toward ' + zmpTilt + '.');
      }

      // Mirror to shared party table
      st.partySupport.zpf = zpf.support;

      // Mirror defenders to shared paramilitaries
      if (st.paramilitaries && st.paramilitaries.zpf_defenders) {
        st.paramilitaries.zpf_defenders.members   = d.members;
        st.paramilitaries.zpf_defenders.training  = d.training;
        st.paramilitaries.zpf_defenders.equipment = d.equipment;
        st.paramilitaries.zpf_defenders.morale    = d.morale;
        st.paramilitaries.zpf_defenders.loyalty   = d.loyalty;
      }

      // Determine government status
      if (st.lastElection && st.lastElection.governing) {
        zpf.inGovernment = st.lastElection.governing.parties.indexOf('ZPF') !== -1
                        || st.lastElection.governing.parties.indexOf('zpf') !== -1;
      }
    },

    // ---------- WIN / LOSS ----------
    checkVictory: function (st, playerId) {
      var zpf = st.shared.ZPF;
      if (!zpf) return false;
      if (st.week < 104) return false;

      // ZPF wins if ZMP + ZPF ≥ 50 and ZPF survived above 3%
      var zmpSupport = (st.partySupport.ZMP) || 0;
      var zpfSupport = zpf.support;
      return (zmpSupport + zpfSupport) >= 50 && zpfSupport >= 3;
    },

    checkDefeat: function (st, playerId) {
      var zpf = st.shared.ZPF;
      if (!zpf) return false;

      // ZPF loses if crushed to irrelevance
      if (zpf.support < 3) return true;

      // Or if ZMP dominates alone without ZPF (over 50% and no coalition)
      var zmp = st.shared.ZMP;
      if (zmp && zmp.shares) {
        var s = zmp.shares;
        var bestVal = s.securro;
        if (s.zalgrilianist > bestVal) bestVal = s.zalgrilianist;
        if (s.secular > bestVal) bestVal = s.secular;
        if (s.jihadist > bestVal) bestVal = s.jihadist;
        if (bestVal >= 60 && (st.partySupport.ZMP || 0) >= 50 && zpf.support < 5) {
          return true;
        }
      }

      return false;
    },

    // ---------- VISIBILITY ----------
    getVisibleState: function (st, playerId) {
      var zpf = st.shared.ZPF;
      return {
        week: st.week,
        you: 'ZPF',
        yourState: zpf,
        factionDescription: FACTION_DESCRIPTION,
        zmpPublicTilt: zpf.lastZmpTilt,
        zmpSupport: (st.partySupport && st.partySupport.ZMP) || 0,
        inCoalition: zpf.inCoalition,
        antiMonarchyPressure: zpf.antiMonarchyPressure,
        defenders: zpf.defenders,
        allPlayers: st.players.map(function (p) {
          return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
        }),
        log: st.log.slice(-15)
      };
    },

    // ---------- SUPPORT ----------
    getSupport: function (st, playerId) {
      var zpf = st.shared.ZPF;
      return { ZPF: zpf ? zpf.support : 0 };
    }
  };

  // ============================================================
  // REGISTER
  // ============================================================
  E.registerFaction(ZPF);

  // Expose for UI
  window.ZPFModule = ZPF;
  window.ZPF_DESCRIPTION = FACTION_DESCRIPTION;
})();