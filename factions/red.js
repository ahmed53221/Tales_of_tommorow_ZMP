// factions/red.js — Red Front + Red Bench faction module for multiplayer.
//
// Red is a social democratic party. It has no internal factions and never splits.
// RB (Red Bench) is the labor wing of the same movement, locked to Red.
//
// Red's role:
//   - Defend the council against putsches and monarchist moves
//   - Protect workers' interests (cafeteria, bus queue, service staff)
//   - Keep the R&B bloc alive with IIA
//   - Build the Red Militia as the main counterweight to the Black Legion
//
// Red plays best as a coalition partner. It wins if the council survives to
// week 104 with Red in government and worker solidarity intact.
//
// Event handling: Red's inbox is state.queues['RED']. Events with handler
// 'RED' or 'any' (when Red has the highest support) are queued here.
//
// Calls into EngineMP for shared mechanics:
//   - EngineMP.breakWall(trigger)
//   - EngineMP.crushCell / placeBLChill
//   - EngineMP.applyEffects
//   - EngineMP.resolveBattle3 / resolveBattle4 (Red joins the Last of Us / Last Dance)

(function () {
  'use strict';
  if (!window.EngineMP) { console.error('red.js: EngineMP missing'); return; }

  var E = window.EngineMP;

  // RB is locked to Red — it always caucuses with the Red Front.
  var RB_LOCKED_SUPPORT = 5;

  // ============================================================
  // FACTION DESCRIPTION  (used by UI)
  // ============================================================
  var FACTION_DESCRIPTION = {
    name: 'Red Front',
    line: 'The workers must be defended. The council must survive.',
    desc: 'Social democrats who believe in the power of organized labor, ' +
          'the dignity of the working class, and the defense of the council ' +
          'against all enemies — monarchist, fascist, or otherwise. ' +
          'They are the party of the cafeteria workers, the bus kids, and ' +
          'the union hall. They will not split. They will not surrender.',
    tint: 'tint-red',
    n: 5,
    affinity: { zpf: -5, iia: 10, rb: 20, bl: -30, semp: 5 },
    spirit: 4, gates: 4, unity: 10,
    mods: { buskids: 4, freshmen: 3, honor: -2, athletes: 1 }
  };

  var RB_DESCRIPTION = {
    name: 'Red Bench',
    line: 'The workers of the cafeteria. The students of the bus queue.',
    desc: 'The labor wing of the Red Front. They organize in the cafeteria, ' +
          'the bus queue, and the after-school shifts. They are the party of ' +
          'the working class, the service workers, and the students who ' +
          'actually make the school run. They are loyal to the Red Front, ' +
          'but they have their own interests and their own leaders.',
    tint: 'tint-red',
    n: 6,
    affinity: { zpf: -5, iia: 5, red: 20, bl: -25, semp: 5 },
    spirit: 3, gates: 3, unity: 15,
    mods: { buskids: 6, freshmen: 4, honor: -3, athletes: 1 }
  };

  // ============================================================
  // MODULE
  // ============================================================
  var RED = {
    id: 'RED',
    name: 'Red Front',
    color: '#cc0000',
    isPlayer: true,

    // ---------- INIT ----------
    initState: function (st, playerId) {
      if (!st.shared.RED) {
        st.shared.RED = {
          // Core
          support: 8,
          funds: 45,
          volunteers: 20,
          unity: 80,
          faculty: 40,
          momentum: 0,

          // RB satellite
          rbSupport: RB_LOCKED_SUPPORT,
          rbSatisfaction: 70,
          rbWithholding: false,

          // Worker solidarity
          // Rises when the workers' interests are defended.
          // Falls when the workers are ignored or attacked.
          workerSolidarity: 50,

          // Red Militia (mirrored to st.paramilitaries.red_militia)
          militia: {
            members: 400,
            training: 2,
            equipment: 2,
            morale: 60,
            loyalty: 75,
            strength: 46
          },

          // Government flags
          inGovernment: false,
          councilCommitted: 0,
          blocFormed: false,

          // Leader identity (set when Red's leadership event fires)
          leader: null,   // 'pragmatic' | 'moderate' | 'radical'
          leaderWeek: null,

          // Battle flags
          battle1Lost: false,
          battle2Won: false,
          battle2Lost: false,
          battle3Won: false,
          battle3Lost: false,
          battle4Completed: false,

          // Tracking
          eventDone: {},
          pendingEvent: null
        };
      }
    },

    // ---------- ACTIONS ----------
    availableActions: function (st, playerId) {
      var red = st.shared.RED;
      var actions = [];

      // ---- CORE WORKER CAMPAIGN ----
      actions.push(
        { id: 'red_worker_rally',    name: 'Workers\' Rally',      ap: 1, funds: 10, vol: 3,
          desc: 'A rally of the workers. Raises Red support and solidarity.' },
        { id: 'red_union_talks',     name: 'Union Negotiations',   ap: 1, funds: 5,  vol: 1,
          desc: 'Talk with the trade unions. Raises RB satisfaction and solidarity.' },
        { id: 'red_welfare_plan',    name: 'Welfare Proposal',     ap: 1, funds: 8,  vol: 1,
          desc: 'A social program for students. Raises Red support.' },
        { id: 'red_mayday',          name: 'May Day March',        ap: 2, funds: 14, vol: 5,
          desc: 'A big public march. Big solidarity and support gain.' },
        { id: 'red_canvass',         name: 'Canvass a Bloc',       ap: 1, funds: 0,  vol: 3,
          desc: 'Send volunteers to a voting bloc.', needsTarget: 'demo' },
        { id: 'red_fundraise',       name: 'Strike Fund',          ap: 1, funds: 0,  vol: 0,
          desc: 'Raise funds from the unions.' },
        { id: 'red_recruit',         name: 'Recruit Volunteers',   ap: 1, funds: 0,  vol: 0,
          desc: 'Recruit at the gates.' }
      );

      // ---- RB-FACING ACTIONS ----
      actions.push(
        { id: 'red_cafeteria_deal',  name: 'Cafeteria Reform Deal', ap: 1, funds: 10, vol: 2,
          desc: 'Better cafeteria food. Huge RB satisfaction gain.' },
        { id: 'red_bus_fund',        name: 'Fund Late Buses',       ap: 1, funds: 12, vol: 1,
          desc: 'Free later buses. RB loves this.' },
        { id: 'red_lunch_strike',    name: 'Support Lunch Strike',  ap: 2, funds: 6,  vol: 4,
          desc: 'Back the student strike. Big support, big RB satisfaction.' }
      );

      // ---- RED MILITIA ----
      actions.push(
        { id: 'red_train_militia',   name: 'Train Red Militia',     ap: 2, funds: 15, vol: 3,
          desc: 'Train the Red Militia. Raises its strength.' },
        { id: 'red_equip_militia',   name: 'Equip Red Militia',     ap: 2, funds: 20, vol: 2,
          desc: 'Equip the Red Militia. Raises its strength.' },
        { id: 'red_recruit_militia', name: 'Recruit Red Militia',   ap: 1, funds: 8,  vol: 2,
          desc: 'Recruit into the Red Militia.' },
        { id: 'red_rally_militia',   name: 'Rally the Militia',     ap: 1, funds: 5,  vol: 3,
          desc: 'Boost militia morale and loyalty.' }
      );

      // ---- COALITION / DEFENSE ----
      actions.push(
        { id: 'red_iia_defense_pact', name: 'IIA Defense Pact',    ap: 1, funds: 6,  vol: 0,
          desc: 'Formalize the R&B bloc with IIA.' },
        { id: 'red_council_defense',  name: 'Council Defense Fund',ap: 1, funds: 10, vol: 2,
          desc: 'Commit resources to defending the council.' },
        { id: 'red_negotiate',        name: 'Back-Room Talks',     ap: 1, funds: 4,  vol: 0,
          needsTarget: 'party', desc: 'Improve affinity with a party.' },
        { id: 'red_coalition',        name: 'Offer Coalition',     ap: 2, funds: 12, vol: 2,
          needsTarget: 'party', desc: 'Formal coalition offer. Needs affinity ≥ 60.' },
        { id: 'red_relations_talk',   name: 'Diplomatic Talks',    ap: 1, funds: 3,  vol: 0,
          needsTarget: 'party', desc: 'Send envoys. Small affinity gain.' },
        { id: 'red_relations_gift',   name: 'Campaign Support',    ap: 1, funds: 12, vol: 1,
          needsTarget: 'party', desc: 'Offer campaign support. Bigger gain.' }
      );

      // ---- ANTI-BL WALLS ----
      actions.push(
        { id: 'red_anti_bl_denounce',    name: 'Denounce BL',    ap: 1, funds: 0,  vol: 2,
          desc: 'Publicly denounce the Black League. Breaks a wall.' },
        { id: 'red_anti_bl_investigate', name: 'Investigate BL', ap: 1, funds: 5,  vol: 1,
          desc: 'Investigate the Black League. Breaks a wall.' },
        { id: 'red_anti_bl_prosecute',   name: 'Prosecute BL',   ap: 2, funds: 10, vol: 1,
          desc: 'Prosecute BL leaders. Breaks a wall.' },
        { id: 'red_anti_bl_ban',         name: 'Ban BL',         ap: 3, funds: 20, vol: 2,
          desc: 'Formally ban the Black League. Breaks the final wall.' }
      );

      // ---- CELL HUNTING (Red can also hunt cells) ----
      actions.push(
        { id: 'red_gather_intelligence', name: 'Gather Intelligence', ap: 1, funds: 5,  vol: 1,
          desc: 'Send agents to gather intelligence on BL cells.' }
      );

      // ---- FOREIGN ----
      actions.push(
        { id: 'red_relations_wein',      name: 'Envoys to Wein',      ap: 1, funds: 5,  vol: 0,
          desc: 'Improve relations with Arbeiter von Wein.' }
      );

      // ---- BATTLE 3 / 4 if eligible ----
      if (st.flags && st.flags.battle3Available && !st.flags.battle3Done) {
        actions.push(
          { id: 'red_battle3_call_allies', name: 'Join the Last of Us',  ap: 2, funds: 20, vol: 5,
            desc: 'Commit the Red Militia to the allied force at Ca\'uf.' },
          { id: 'red_battle3_fight_alone', name: 'Fight Alone',          ap: 3, funds: 30, vol: 8,
            desc: 'Red Front alone against the Black League.' }
        );
      }

      if (st.flags && st.flags.battle4Available && !st.flags.battle4Done) {
        actions.push(
          { id: 'red_battle4_finish_them', name: 'Finish Them',          ap: 3, funds: 30, vol: 8,
            desc: 'Join the final assault on the Black League.' },
          { id: 'red_battle4_go_alone',    name: 'Go Alone',             ap: 3, funds: 40, vol: 10,
            desc: 'Red Front alone against the Black League.' }
        );
      }

      return actions;
    },

    // ---------- APPLY ----------
    applyAction: function (st, playerId, action) {
      if (!action) return;
      if (typeof action === 'string') action = { id: action };
      var red = st.shared.RED;
      var id = action.id || '';
      var target = action.target || null;
      var rng = st.rng;
      var notes = [];
      var msg = '';

      // ---- ANTI-BL WALL ACTIONS ----
      if (id.indexOf('red_anti_bl_') === 0) {
        var trigger = id.replace('red_anti_bl_', '');
        var result = E.breakWall(trigger);
        if (result.ok) {
          notes.push('The ' + trigger + ' breaks the ' + result.wall.name + '.');
        } else {
          notes.push('The ' + trigger + ' has no effect — ' + result.msg);
        }
        st.log.push('Week ' + st.week + ': RED ' + id);
        return;
      }

      switch (id) {

        // ============================================================
        // CORE WORKER CAMPAIGN
        // ============================================================
        case 'red_worker_rally':
          red.support += 0.8 + rng() * 0.4;
          red.workerSolidarity = Math.min(100, red.workerSolidarity + 3);
          red.funds -= 10;
          red.volunteers -= 3;
          msg = 'Workers\' rally. Support +0.9, solidarity +3.';
          break;

        case 'red_union_talks':
          red.rbSatisfaction = Math.min(100, red.rbSatisfaction + 6);
          red.workerSolidarity = Math.min(100, red.workerSolidarity + 2);
          red.funds -= 5;
          red.volunteers -= 1;
          msg = 'Union talks. RB satisfaction +6, solidarity +2.';
          break;

        case 'red_welfare_plan':
          red.support += 0.5 + rng() * 0.3;
          red.funds -= 8;
          red.volunteers -= 1;
          msg = 'Welfare proposal. Support +0.6.';
          break;

        case 'red_mayday':
          red.support += 1.5 + rng() * 0.7;
          red.workerSolidarity = Math.min(100, red.workerSolidarity + 8);
          red.rbSatisfaction = Math.min(100, red.rbSatisfaction + 4);
          red.funds -= 14;
          red.volunteers -= 5;
          red.momentum += 2;
          msg = 'May Day march. Support +1.7, solidarity +8, momentum +2.';
          break;

        case 'red_canvass':
          if (target) {
            red.support += 0.8 + rng() * 0.3;
            red.volunteers -= 3;
            msg = 'Canvassed ' + target + '. Support +0.9.';
          } else {
            red.support += 0.4;
            red.volunteers -= 3;
            msg = 'Canvassed broadly. Support +0.4.';
          }
          break;

        case 'red_fundraise':
          var raised = Math.round(12 + red.volunteers * 0.7 + rng() * 8);
          red.funds += raised;
          msg = 'Strike fund raises $' + raised + '.';
          break;

        case 'red_recruit':
          var got = Math.round(2 + rng() * 3 + red.momentum * 0.2);
          red.volunteers += got;
          msg = got + ' new volunteers recruited.';
          break;

        // ============================================================
        // RB-FACING
        // ============================================================
        case 'red_cafeteria_deal':
          red.rbSatisfaction = Math.min(100, red.rbSatisfaction + 10);
          red.funds -= 10;
          red.volunteers -= 2;
          msg = 'Cafeteria deal brokered. RB satisfaction +10.';
          break;

        case 'red_bus_fund':
          red.rbSatisfaction = Math.min(100, red.rbSatisfaction + 7);
          red.funds -= 12;
          red.volunteers -= 1;
          msg = 'Late buses funded. RB satisfaction +7.';
          break;

        case 'red_lunch_strike':
          red.support += 1.2 + rng() * 0.5;
          red.rbSatisfaction = Math.min(100, red.rbSatisfaction + 12);
          red.workerSolidarity = Math.min(100, red.workerSolidarity + 5);
          red.funds -= 6;
          red.volunteers -= 4;
          msg = 'Lunch strike supported. Support +1.4, RB +12, solidarity +5.';
          break;

        // ============================================================
        // RED MILITIA
        // ============================================================
        case 'red_train_militia':
          red.militia.training = Math.min(10, red.militia.training + 1);
          red.funds -= 15;
          red.volunteers -= 3;
          msg = 'Militia trained. Training now ' + red.militia.training + '/10.';
          break;

        case 'red_equip_militia':
          red.militia.equipment = Math.min(10, red.militia.equipment + 1);
          red.funds -= 20;
          red.volunteers -= 2;
          msg = 'Militia equipped. Equipment now ' + red.militia.equipment + '/10.';
          break;

        case 'red_recruit_militia':
          var gained = 25 + Math.floor(rng() * 20);
          red.militia.members += gained;
          red.funds -= 8;
          red.volunteers -= 2;
          msg = 'Recruited ' + gained + ' into the Red Militia.';
          break;

        case 'red_rally_militia':
          red.militia.morale = Math.min(100, red.militia.morale + 8);
          red.militia.loyalty = Math.min(100, red.militia.loyalty + 3);
          red.funds -= 5;
          red.volunteers -= 3;
          msg = 'Militia rallied. Morale ' + red.militia.morale + '%.';
          break;

        // ============================================================
        // COALITION / DEFENSE
        // ============================================================
        case 'red_iia_defense_pact':
          red.funds -= 6;
          red.blocFormed = true;
          red.momentum += 1;
          msg = 'R&B bloc formalized with IIA.';
          break;

        case 'red_council_defense':
          red.funds -= 10;
          red.volunteers -= 2;
          red.councilCommitted += 1;
          msg = 'Council defense fund committed. Total: ' + red.councilCommitted + '.';
          break;

        case 'red_negotiate':
          if (target) {
            var gain = Math.round(8 + rng() * 10 + red.momentum * 0.4);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gain);
            msg = 'Talks with ' + target + '. Affinity +' + gain + '.';
          }
          break;

        case 'red_coalition':
          if (target) {
            var cGain = Math.round(10 + rng() * 15 + red.momentum * 0.5);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + cGain);
            msg = 'Coalition talks with ' + target + '. Affinity +' + cGain + '.';
          }
          break;

        case 'red_relations_talk':
          if (target) {
            var tGain = 3 + rng() * 4;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + tGain);
            msg = 'Envoys to ' + target + '. Affinity +' + tGain.toFixed(1) + '.';
          }
          break;

        case 'red_relations_gift':
          if (target) {
            var gGain = 8 + rng() * 7;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gGain);
            msg = 'Campaign support to ' + target + '. Affinity +' + gGain.toFixed(1) + '.';
          }
          break;

        // ============================================================
        // CELL HUNTING
        // ============================================================
        case 'red_gather_intelligence':
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
        case 'red_relations_wein':
          st.affinity = st.affinity || {};
          var weinGain = 6 + rng() * 4;
          st.affinity.wein = Math.min(100, (st.affinity.wein || 40) + weinGain);
          msg = 'Wein relations +' + weinGain.toFixed(1) + '.';
          break;

        // ============================================================
        // BATTLE 3
        // ============================================================
        case 'red_battle3_call_allies':
          st.flags = st.flags || {};
          var b3notes = E.resolveBattle3(st, 'call_allies', rng);
          notes = notes.concat(b3notes);
          st.flags.battle3Done = true;
          msg = 'Joined the Last of Us.';
          break;

        case 'red_battle3_fight_alone':
          st.flags = st.flags || {};
          var b3notes2 = E.resolveBattle3(st, 'fight_alone', rng);
          notes = notes.concat(b3notes2);
          st.flags.battle3Done = true;
          msg = 'Fought alone at Ca\'uf.';
          break;

        // ============================================================
        // BATTLE 4
        // ============================================================
        case 'red_battle4_finish_them':
          st.flags = st.flags || {};
          var b4notes = E.resolveBattle4(st, 'finish_them', rng);
          notes = notes.concat(b4notes);
          st.flags.battle4Done = true;
          if (st.flags.battle4Completed) red.battle4Completed = true;
          msg = 'Final assault joined.';
          break;

        case 'red_battle4_go_alone':
          st.flags = st.flags || {};
          var b4notes2 = E.resolveBattle4(st, 'go_alone', rng);
          notes = notes.concat(b4notes2);
          st.flags.battle4Done = true;
          if (st.flags.battle4Completed) red.battle4Completed = true;
          msg = 'Red went alone against the Black League.';
          break;

        default:
          msg = 'Unknown action: ' + id;
          break;
      }

      // Recompute militia strength
      var m = red.militia;
      m.strength = Math.round(
        m.members *
        ((m.training / 10 + m.equipment / 10) / 2) *
        (m.morale / 100)
      );

      st.log.push('Week ' + st.week + ': RED action ' + id + ' — ' + msg);
      if (notes.length > 0) {
        st.log.push('  ' + notes.join(' '));
      }
    },

    // ---------- PASSIVE TICK ----------
    tickWeek: function (st, playerId) {
      var red = st.shared.RED;
      if (!red) return;

      // Resources
      red.funds += 5;
      red.momentum = Math.round(red.momentum * 0.85);

      // Baseline drift toward 6%
      var drift = (6 - red.support) * 0.02;
      red.support += drift;

      // Solidarity drifts down if not tended
      red.workerSolidarity = Math.max(0, red.workerSolidarity - 1);

      // RB satisfaction drifts down if not tended
      red.rbSatisfaction = Math.max(0, red.rbSatisfaction - 1);

      // RB withholding logic
      if (!red.rbWithholding && red.rbSatisfaction < 20) {
        red.rbWithholding = true;
        st.log.push('RB withholds support from Red.');
      } else if (red.rbWithholding && red.rbSatisfaction > 40) {
        red.rbWithholding = false;
        st.log.push('RB resumes supporting Red.');
      }

      // Militia morale drifts down if untended
      red.militia.morale = Math.max(30, red.militia.morale - 0.5);

      // Recompute strength
      var m = red.militia;
      m.strength = Math.round(
        m.members *
        ((m.training / 10 + m.equipment / 10) / 2) *
        (m.morale / 100)
      );

      // Clamp
      if (red.support < 2) red.support = 2;
      if (red.support > 20) red.support = 20;

      // Mirror to shared party table
      st.partySupport.red = red.support;
      st.partySupport.rb  = red.rbWithholding ? 0 : RB_LOCKED_SUPPORT;

      // Mirror militia to shared paramilitaries
      if (st.paramilitaries && st.paramilitaries.red_militia) {
        st.paramilitaries.red_militia.members   = m.members;
        st.paramilitaries.red_militia.training  = m.training;
        st.paramilitaries.red_militia.equipment = m.equipment;
        st.paramilitaries.red_militia.morale    = m.morale;
        st.paramilitaries.red_militia.loyalty   = m.loyalty;
      }

      // Sync flags
      st.flags = st.flags || {};
      if (red.battle1Lost) st.flags.battle1Lost = true;
      if (red.battle2Won)  st.flags.battle2Won = true;
      if (red.battle2Lost) st.flags.battle2Lost = true;
      if (red.battle3Won)  st.flags.battle3Won = true;
      if (red.battle3Lost) st.flags.battle3Lost = true;

      // Determine government status from last election
      if (st.lastElection && st.lastElection.governing) {
        red.inGovernment = st.lastElection.governing.parties.indexOf('RED') !== -1
                        || st.lastElection.governing.parties.indexOf('red') !== -1;
      }
    },

    // ---------- WIN / LOSS ----------
    checkVictory: function (st, playerId) {
      var red = st.shared.RED;
      if (!red) return false;

      if (st.week < 104) return false;

      // Red wins if: the council survived to 104, Red is in government,
      // and worker solidarity is at least 30.
      if (!red.inGovernment) return false;
      if (red.workerSolidarity < 30) return false;
      return true;
    },

    checkDefeat: function (st, playerId) {
      var red = st.shared.RED;
      if (!red) return false;
      // Red is defeated if it collapses below 2%, or if the council is
      // dissolved by the Black League.
      if (red.support < 2) return true;
      if (red.councilDissolved) return true;
      if (st.flags && st.flags.battle3Lost) return true;
      return false;
    },

    // ---------- VISIBILITY ----------
    getVisibleState: function (st, playerId) {
      var red = st.shared.RED;
      var block = red.support + (red.rbWithholding ? 0 : RB_LOCKED_SUPPORT);
      return {
        week: st.week,
        you: 'RED',
        yourState: red,
        factionDescription: FACTION_DESCRIPTION,
        rbDescription: RB_DESCRIPTION,
        rbState: {
          support: RB_LOCKED_SUPPORT,
          satisfaction: red.rbSatisfaction,
          withholding: red.rbWithholding
        },
        blockTotal: block,
        inGovernment: red.inGovernment,
        solidarity: red.workerSolidarity,
        militia: red.militia,
        allPlayers: st.players.map(function (p) {
          return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
        }),
        log: st.log.slice(-15)
      };
    },

    // ---------- SUPPORT ----------
    getSupport: function (st, playerId) {
      var red = st.shared.RED;
      if (!red) return { RED: 0, RB: 0 };
      var rb = red.rbWithholding ? 0 : RB_LOCKED_SUPPORT;
      return { RED: red.support, RB: rb, RED_BLOCK: red.support + rb };
    }
  };

  // ============================================================
  // REGISTER
  // ============================================================
  E.registerFaction(RED);

  // Expose for UI
  window.REDModule = RED;
  window.RED_RB_DESCRIPTIONS = { RED: FACTION_DESCRIPTION, RB: RB_DESCRIPTION };
})();