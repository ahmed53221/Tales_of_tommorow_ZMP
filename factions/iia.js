// factions/iia.js — Independent Innovation Alliance (multiplayer).
//
// IIA is a faction in permanent leadership crisis (Umayyad Spain-style).
// It bleeds support to the Black League every week UNLESS it passes reforms.
// Each reform gives some support back. The final reform (THE GREAT REFORM)
// can halve BL's support and trigger the collapse.
//
// Reforms can fire only on specific weeks and only if the party state qualifies.
// PL (Pep League) is the locked satellite that caucuses with IIA.
//
// IIA also has the anti-BL wall triggers — the same actions ZMP has.
//
// Event handling: IIA's inbox is state.queues['IIA']. Events with handler
// 'IIA' or 'any' (when IIA has the highest support) are queued here.
//
// Calls into EngineMP for shared mechanics:
//   - EngineMP.breakWall(trigger)
//   - EngineMP.crushCell / placeBLChill
//   - EngineMP.applyEffects

(function () {
  'use strict';
  if (!window.EngineMP) { console.error('iia.js: EngineMP missing'); return; }

  var E = window.EngineMP;

  var PL_LOCKED_SUPPORT = 4;

  // ============================================================
  // FACTION DESCRIPTIONS  (used by UI)
  // ============================================================
  var FACTION_DESCRIPTION = {
    name: 'Independent Innovation Alliance',
    line: 'The lab is the future. The old guard is the past.',
    desc: 'Technocratic liberals who believe in merit, innovation, and the ' +
          'power of the lab coat. They are the party of the gamers, the ' +
          'coders, the science fair winners, and the students who actually ' +
          'understand the wifi router. They have no ideology except progress — ' +
          'which is why they keep splitting.',
    tint: 'tint-blue',
    n: 7,
    affinity: { zpf: 5, red: 10, rb: 5, bl: -15, semp: 0, pl: 15 },
    spirit: 3, gates: 5, unity: -10,
    mods: { gamers: 4, honor: 2, arts: 1, freshmen: 1 }
  };

  var PL_DESCRIPTION = {
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
  // REFORM DEFINITIONS
  // ============================================================
  var REFORMS = [
    {
      id: 'reform_1',
      name: 'Decentralization Act',
      week: 4,
      desc: 'Devolve power to regional tech councils. Buys time.',
      flavor: 'The tech councils are granted autonomy. It buys time, nothing more.',
      req: { funds: 15, unity: 30 },
      effects: {
        supportGain: 1.5,
        crisisReduction: 15,
        stabilityGain: 10,
        infightingReduction: 10,
        blLoss: 0
      }
    },
    {
      id: 'reform_2',
      name: 'Meritocratic Purge',
      week: 8,
      desc: 'Remove incompetent officials. Appoint by merit.',
      flavor: 'The deadwood is cleared. The machine runs better.',
      req: { funds: 20, unity: 35 },
      effects: {
        supportGain: 2,
        crisisReduction: 20,
        stabilityGain: 15,
        infightingReduction: 15,
        blLoss: 1
      }
    },
    {
      id: 'reform_3',
      name: 'The Tech Accord',
      week: 12,
      desc: 'Negotiate peace with rival tech factions.',
      flavor: 'For the first time in months, IIA speaks with one voice.',
      req: { funds: 25, unity: 40, iiaSupport: 8 },
      effects: {
        supportGain: 2.5,
        crisisReduction: 25,
        stabilityGain: 20,
        infightingReduction: 25,
        blLoss: 2
      }
    },
    {
      id: 'reform_4',
      name: 'The Innovation Charter',
      week: 16,
      desc: 'A new constitution for IIA. Clear rules, clear leadership.',
      flavor: 'The Charter is signed in the computer lab.',
      req: { funds: 30, unity: 45, iiaSupport: 12 },
      effects: {
        supportGain: 3,
        crisisReduction: 30,
        stabilityGain: 25,
        infightingReduction: 30,
        blLoss: 3
      }
    },
    {
      id: 'reform_5',
      name: 'THE GREAT REFORM',
      week: 20,
      desc: 'The final reform. IIA emerges transformed — or dies trying.',
      flavor: 'The Great Reform passes. IIA is no longer a dying party.',
      req: { funds: 50, unity: 55, iiaSupport: 15, stability: 60 },
      effects: {
        supportGain: 5,
        crisisReduction: 100,
        stabilityGain: 40,
        infightingReduction: 50,
        blLoss: 8,
        blCollapse: true
      },
      isFinal: true
    }
  ];

  // ============================================================
  // MODULE
  // ============================================================
  var IIA = {
    id: 'IIA',
    name: 'Independent Innovation Alliance',
    color: '#2244dd',
    isPlayer: true,

    // ---------- INIT ----------
    initState: function (st, playerId) {
      if (!st.shared.IIA) {
        st.shared.IIA = {
          // Core
          support: 18,
          funds: 55,
          volunteers: 15,
          unity: 45,
          faculty: 55,
          momentum: 0,

          // PL satellite
          plSupport: PL_LOCKED_SUPPORT,
          plSatisfaction: 65,
          plWithholding: false,

          // Reform system
          reformState: {
            active: true,
            currentReform: 0,
            totalReforms: REFORMS.length,
            crisisLevel: 0,
            crisisGrowth: 0.5,
            baseSupportLoss: 0.3,
            reformsPassed: [],
            lastReformWeek: null,
            leadershipStability: 30,
            factionInfighting: 70,
            triggeredEvents: []
          },

          // Party state
          collapsed: false,
          reformed: false,
          inGovernment: false,

          // Tech Guard (mirrored to st.paramilitaries.iia_guard)
          techGuard: {
            members: 150,
            training: 4,
            equipment: 5,
            morale: 65,
            loyalty: 70,
            strength: 45
          },

          // Tracking
          eventDone: {},
          pendingEvent: null
        };
      }
    },

    // ---------- ACTIONS ----------
    availableActions: function (st, playerId) {
      var iia = st.shared.IIA;
      var actions = [];

      // ---- CORE POLITICAL ----
      actions.push(
        { id: 'iia_tech_rally',      name: 'Tech Rally',         ap: 1, funds: 10, vol: 3,
          desc: 'A rally of the tech base. +IIA support.' },
        { id: 'iia_lab_open_day',    name: 'Open Lab Day',       ap: 1, funds: 6,  vol: 2,
          desc: 'Open the labs to the school. Modest gain.' },
        { id: 'iia_canvass',         name: 'Canvass a Bloc',     ap: 1, funds: 0,  vol: 3,
          desc: 'Canvass a voting bloc.', needsTarget: 'demo' },
        { id: 'iia_fundraise',       name: 'Tech Fundraiser',    ap: 1, funds: 0,  vol: 0,
          desc: 'Raise funds from the tech base.' },
        { id: 'iia_recruit',         name: 'Recruit Volunteers', ap: 1, funds: 0,  vol: 0,
          desc: 'Recruit at the gates.' }
      );

      // ---- PL-FACING ----
      actions.push(
        { id: 'iia_pl_caucus',       name: 'PL Caucus Meeting',  ap: 1, funds: 4,  vol: 1,
          desc: 'Keep the Pep League on side. Raises PL satisfaction.' },
        { id: 'iia_pl_fund',         name: 'Fund PL Programs',   ap: 1, funds: 12, vol: 0,
          desc: 'Money for PL events. Huge PL satisfaction gain.' },
        { id: 'iia_pl_rally',        name: 'Joint IIA-PL Rally', ap: 2, funds: 14, vol: 4,
          desc: 'A big rally with the Pep League. Support and PL gain.' }
      );

      // ---- TECH GUARD ----
      actions.push(
        { id: 'iia_train_techguard',   name: 'Train Tech Guard',   ap: 2, funds: 15, vol: 2,
          desc: 'Train the Tech Guard. Raises its strength.' },
        { id: 'iia_equip_techguard',   name: 'Equip Tech Guard',   ap: 2, funds: 20, vol: 1,
          desc: 'Equip the Tech Guard. Raises its strength.' },
        { id: 'iia_recruit_techguard', name: 'Recruit Tech Guard', ap: 1, funds: 8,  vol: 2,
          desc: 'Recruit into the Tech Guard.' },
        { id: 'iia_rally_techguard',   name: 'Rally the Guard',    ap: 1, funds: 5,  vol: 3,
          desc: 'Boost Tech Guard morale.' }
      );

      // ---- RELATIONS ----
      actions.push(
        { id: 'iia_negotiate',        name: 'Back-Room Talks',   ap: 1, funds: 4,  vol: 0,
          needsTarget: 'party', desc: 'Improve affinity with a party.' },
        { id: 'iia_coalition',        name: 'Offer Coalition',   ap: 2, funds: 12, vol: 2,
          needsTarget: 'party', desc: 'Formal coalition offer.' },
        { id: 'iia_relations_talk',   name: 'Diplomatic Talks',  ap: 1, funds: 3,  vol: 0,
          needsTarget: 'party', desc: 'Send envoys. Small affinity gain.' },
        { id: 'iia_relations_gift',   name: 'Campaign Support',  ap: 1, funds: 12, vol: 1,
          needsTarget: 'party', desc: 'Offer campaign support. Bigger gain.' },
        { id: 'iia_red_pact',         name: 'R&B Bloc Pact',     ap: 1, funds: 8,  vol: 1,
          desc: 'Formalize the R&B bloc with Red. Raises relevance.' }
      );

      // ---- ANTI-BL WALLS ----
      actions.push(
        { id: 'iia_anti_bl_denounce',    name: 'Denounce BL',    ap: 1, funds: 0,  vol: 2,
          desc: 'Publicly denounce the Black League. Breaks a wall.' },
        { id: 'iia_anti_bl_investigate', name: 'Investigate BL', ap: 1, funds: 5,  vol: 1,
          desc: 'Investigate the Black League. Breaks a wall.' },
        { id: 'iia_anti_bl_prosecute',   name: 'Prosecute BL',   ap: 2, funds: 10, vol: 1,
          desc: 'Prosecute BL leaders. Breaks a wall.' },
        { id: 'iia_anti_bl_ban',         name: 'Ban BL',         ap: 3, funds: 20, vol: 2,
          desc: 'Formally ban the Black League. Breaks the final wall.' }
      );

      // ---- REFORM ----
      var rs = iia.reformState;
      if (rs.active && rs.currentReform < rs.totalReforms) {
        var next = REFORMS[rs.currentReform];
        if (st.week >= next.week && canPayReform(iia, next)) {
          actions.push({
            id: 'iia_pass_reform',
            name: 'Pass Reform: ' + next.name,
            ap: 1, funds: 0, vol: 0,
            desc: next.desc + ' (+' + next.effects.supportGain + ' support, -' +
              next.effects.crisisReduction + ' crisis)'
          });
        }
      }

      // ---- EMERGENCY ----
      if (rs.active && rs.crisisLevel >= 75) {
        actions.push({
          id: 'iia_emergency_congress',
          name: 'Emergency Congress',
          ap: 2, funds: 15, vol: 3,
          desc: 'Call an emergency congress. -10 crisis, -5 unity.'
        });
      }

      // ---- CELL HUNTING ----
      actions.push(
        { id: 'iia_gather_intelligence', name: 'Gather Intelligence', ap: 1, funds: 5, vol: 1,
          desc: 'Send agents to gather intelligence on BL cells.' }
      );

      // ---- BATTLE 1 / 2 / 3 ----
      if (st.flags && st.flags.battle1Available && !st.flags.battle1Done) {
        actions.push(
          { id: 'iia_battle1_help_zmp',  name: 'Join ZMP at Ca\'uf', ap: 2, funds: 15, vol: 4,
            desc: 'Commit the Tech Guard to the allied force at Ca\'uf.' },
          { id: 'iia_battle1_solo',      name: 'Fight Ca\'uf Alone', ap: 2, funds: 20, vol: 5,
            desc: 'IIA alone against the Black League.' }
        );
      }
      if (st.flags && st.flags.battle3Available && !st.flags.battle3Done) {
        actions.push(
          { id: 'iia_battle3_call_allies', name: 'Join the Last of Us', ap: 2, funds: 20, vol: 5,
            desc: 'Commit the Tech Guard to the allied force at Ca\'uf.' }
        );
      }
      if (st.flags && st.flags.battle4Available && !st.flags.battle4Done) {
        actions.push(
          { id: 'iia_battle4_finish_them', name: 'Finish Them', ap: 3, funds: 30, vol: 8,
            desc: 'Join the final assault on the Black League.' }
        );
      }

      return actions;
    },

    // ---------- APPLY ----------
    applyAction: function (st, playerId, action) {
      if (!action) return;
      if (typeof action === 'string') action = { id: action };
      var iia = st.shared.IIA;
      var rs = iia.reformState;
      var id = action.id || '';
      var target = action.target || null;
      var rng = st.rng;
      var notes = [];
      var msg = '';

      // ---- ANTI-BL WALL ACTIONS ----
      if (id.indexOf('iia_anti_bl_') === 0) {
        var trigger = id.replace('iia_anti_bl_', '');
        var result = E.breakWall(trigger);
        if (result.ok) {
          notes.push('The ' + trigger + ' breaks the ' + result.wall.name + '.');
        } else {
          notes.push('The ' + trigger + ' has no effect — ' + result.msg);
        }
        st.log.push('Week ' + st.week + ': IIA ' + id);
        return;
      }

      switch (id) {

        // ============================================================
        // CORE POLITICAL
        // ============================================================
        case 'iia_tech_rally':
          iia.support += 0.7 + (rng() - 0.5) * 0.3;
          iia.funds -= 10; iia.volunteers -= 3;
          msg = 'Tech rally. Support +0.7.';
          break;

        case 'iia_lab_open_day':
          iia.support += 0.4 + (rng() - 0.5) * 0.2;
          iia.funds -= 6; iia.volunteers -= 2;
          msg = 'Lab open day. Support +0.4.';
          break;

        case 'iia_canvass':
          if (target) {
            iia.support += 0.6 + rng() * 0.3;
            iia.volunteers -= 3;
            msg = 'Canvassed ' + target + '. Support +0.7.';
          }
          break;

        case 'iia_fundraise':
          var raised = Math.round(12 + iia.volunteers * 0.7 + rng() * 8);
          iia.funds += raised;
          msg = 'Tech fundraiser raises $' + raised + '.';
          break;

        case 'iia_recruit':
          var got = Math.round(2 + rng() * 3 + iia.momentum * 0.2);
          iia.volunteers += got;
          msg = got + ' new volunteers recruited.';
          break;

        // ============================================================
        // PL-FACING
        // ============================================================
        case 'iia_pl_caucus':
          iia.plSatisfaction = Math.min(100, iia.plSatisfaction + 6);
          iia.funds -= 4; iia.volunteers -= 1;
          msg = 'PL caucus. Satisfaction +6.';
          break;

        case 'iia_pl_fund':
          iia.plSatisfaction = Math.min(100, iia.plSatisfaction + 12);
          iia.funds -= 12;
          msg = 'PL funded. Satisfaction +12.';
          break;

        case 'iia_pl_rally':
          iia.support += 1.0 + rng() * 0.4;
          iia.plSatisfaction = Math.min(100, iia.plSatisfaction + 5);
          iia.funds -= 14; iia.volunteers -= 4;
          msg = 'Joint rally. Support +1.2, PL +5.';
          break;

        // ============================================================
        // TECH GUARD
        // ============================================================
        case 'iia_train_techguard':
          iia.techGuard.training = Math.min(10, iia.techGuard.training + 1);
          iia.funds -= 15; iia.volunteers -= 2;
          msg = 'Tech Guard trained. Training now ' + iia.techGuard.training + '/10.';
          break;

        case 'iia_equip_techguard':
          iia.techGuard.equipment = Math.min(10, iia.techGuard.equipment + 1);
          iia.funds -= 20; iia.volunteers -= 1;
          msg = 'Tech Guard equipped. Equipment now ' + iia.techGuard.equipment + '/10.';
          break;

        case 'iia_recruit_techguard':
          var gained = 15 + Math.floor(rng() * 15);
          iia.techGuard.members += gained;
          iia.funds -= 8; iia.volunteers -= 2;
          msg = 'Recruited ' + gained + ' into the Tech Guard.';
          break;

        case 'iia_rally_techguard':
          iia.techGuard.morale = Math.min(100, iia.techGuard.morale + 8);
          iia.techGuard.loyalty = Math.min(100, iia.techGuard.loyalty + 3);
          iia.funds -= 5; iia.volunteers -= 3;
          msg = 'Tech Guard rallied. Morale ' + iia.techGuard.morale + '%.';
          break;

        // ============================================================
        // RELATIONS
        // ============================================================
        case 'iia_negotiate':
          if (target) {
            var gain = Math.round(8 + rng() * 10 + iia.momentum * 0.4);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gain);
            msg = 'Talks with ' + target + '. Affinity +' + gain + '.';
          }
          break;

        case 'iia_coalition':
          if (target) {
            var cGain = Math.round(10 + rng() * 15 + iia.momentum * 0.5);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + cGain);
            msg = 'Coalition talks with ' + target + '. Affinity +' + cGain + '.';
          }
          break;

        case 'iia_relations_talk':
          if (target) {
            var tGain = 3 + rng() * 4;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + tGain);
            msg = 'Envoys to ' + target + '. Affinity +' + tGain.toFixed(1) + '.';
          }
          break;

        case 'iia_relations_gift':
          if (target) {
            var gGain = 8 + rng() * 7;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gGain);
            msg = 'Campaign support to ' + target + '. Affinity +' + gGain.toFixed(1) + '.';
          }
          break;

        case 'iia_red_pact':
          iia.funds -= 8;
          iia.volunteers -= 1;
          iia.blocFormed = true;
          if (!st.affinity) st.affinity = {};
          st.affinity.red = Math.min(100, (st.affinity.red || 35) + 15);
          msg = 'R&B bloc formalized with Red.';
          break;

        // ============================================================
        // REFORM
        // ============================================================
        case 'iia_pass_reform':
          var next = REFORMS[rs.currentReform];
          if (!next || st.week < next.week) {
            msg = 'Reform not yet available.';
            break;
          }
          if (!canPayReform(iia, next)) {
            msg = 'Cannot afford ' + next.name + '.';
            break;
          }
          var reformNotes = applyReform(st, iia, next, rng);
          notes = notes.concat(reformNotes);
          msg = 'Reform passed: ' + next.name + '.';
          break;

        // ============================================================
        // EMERGENCY
        // ============================================================
        case 'iia_emergency_congress':
          rs.crisisLevel = Math.max(0, rs.crisisLevel - 10);
          iia.unity = Math.max(0, iia.unity - 5);
          iia.funds -= 15;
          iia.volunteers -= 3;
          msg = 'Emergency congress. Crisis -10, unity -5.';
          break;

        // ============================================================
        // CELL HUNTING
        // ============================================================
        case 'iia_gather_intelligence':
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
        // BATTLES
        // ============================================================
        case 'iia_battle1_help_zmp':
          st.flags = st.flags || {};
          var b1notes = E.resolveBattle(st, 'help_iia', rng);
          notes = notes.concat(b1notes);
          st.flags.battle1Done = true;
          msg = 'Joined ZMP at Ca\'uf.';
          break;

        case 'iia_battle1_solo':
          st.flags = st.flags || {};
          var b1notes2 = E.resolveBattle(st, 'go_independent', rng);
          notes = notes.concat(b1notes2);
          st.flags.battle1Done = true;
          msg = 'Fought Ca\'uf alone.';
          break;

        case 'iia_battle3_call_allies':
          st.flags = st.flags || {};
          var b3notes = E.resolveBattle3(st, 'call_allies', rng);
          notes = notes.concat(b3notes);
          st.flags.battle3Done = true;
          msg = 'Joined the Last of Us.';
          break;

        case 'iia_battle4_finish_them':
          st.flags = st.flags || {};
          var b4notes = E.resolveBattle4(st, 'finish_them', rng);
          notes = notes.concat(b4notes);
          st.flags.battle4Done = true;
          msg = 'Joined the final assault.';
          break;

        default:
          msg = 'Unknown action: ' + id;
          break;
      }

      // Recompute Tech Guard strength
      var g = iia.techGuard;
      g.strength = Math.round(
        g.members *
        ((g.training / 10 + g.equipment / 10) / 2) *
        (g.morale / 100)
      );

      st.log.push('Week ' + st.week + ': IIA action ' + id + ' — ' + msg);
      if (notes.length > 0) {
        st.log.push('  ' + notes.join(' '));
      }
    },

    // ---------- PASSIVE TICK ----------
    tickWeek: function (st, playerId) {
      var iia = st.shared.IIA;
      var rs = iia.reformState;
      if (!iia) return;

      // Resources
      iia.funds += 4;
      iia.momentum = Math.round(iia.momentum * 0.85);

      // If collapsed, only tick strength
      if (iia.collapsed) {
        var g = iia.techGuard;
        g.strength = Math.round(g.members * ((g.training / 10 + g.equipment / 10) / 2) * (g.morale / 100));
        return;
      }

      // ============================================================
      // CRISIS GROWTH
      // ============================================================
      if (rs.active && rs.currentReform < rs.totalReforms) {
        rs.crisisLevel = Math.min(100, rs.crisisLevel + rs.crisisGrowth);

        // Support loss
        var lossRate = rs.baseSupportLoss * (1 + rs.crisisLevel / 100);
        var loss = lossRate * (0.5 + st.rng() * 0.5);
        iia.support = Math.max(0.5, iia.support - loss);

        // BL gains most of it
        st.partySupport.bl = (st.partySupport.bl || 0) + loss * 0.7;

        // Stability decays
        rs.leadershipStability = Math.max(0, rs.leadershipStability - 1);
        rs.factionInfighting = Math.min(100, rs.factionInfighting + 0.5);

        // Crisis narrative
        if (rs.crisisLevel >= 25 && rs.triggeredEvents.indexOf('c1') === -1) {
          rs.triggeredEvents.push('c1');
          st.log.push('IIA CRISIS: moderates are defecting.');
        }
        if (rs.crisisLevel >= 50 && rs.triggeredEvents.indexOf('c2') === -1) {
          rs.triggeredEvents.push('c2');
          st.log.push('IIA CRISIS: leadership in open revolt.');
        }
        if (rs.crisisLevel >= 75 && rs.triggeredEvents.indexOf('c3') === -1) {
          rs.triggeredEvents.push('c3');
          st.log.push('IIA CRISIS: on the brink.');
        }
      }

      // ============================================================
      // PL SATELLITE
      // ============================================================
      if (!iia.plWithholding && iia.plSatisfaction < 20) {
        iia.plWithholding = true;
        st.log.push('PL withholds support from IIA.');
      } else if (iia.plWithholding && iia.plSatisfaction > 40) {
        iia.plWithholding = false;
        st.log.push('PL resumes supporting IIA.');
      }
      iia.plSatisfaction = Math.max(0, iia.plSatisfaction - 1);

      // ============================================================
      // CATASTROPHIC COLLAPSE
      // ============================================================
      if (rs.crisisLevel >= 100 && !iia.collapsed) {
        iia.collapsed = true;
        rs.active = false;
        st.partySupport.bl = (st.partySupport.bl || 0) + iia.support * 0.8;
        iia.support = iia.support * 0.1;
        st.log.push('IIA COLLAPSES. The Black League absorbs what remains.');
      }

      // Recompute Tech Guard
      var g = iia.techGuard;
      g.strength = Math.round(g.members * ((g.training / 10 + g.equipment / 10) / 2) * (g.morale / 100));

      // Clamp
      if (iia.support < 0.5) iia.support = 0.5;

      // Mirror to shared party table
      st.partySupport.iia = iia.support;
      st.partySupport.pl  = iia.plWithholding ? 0 : PL_LOCKED_SUPPORT;

      // Mirror Tech Guard to shared paramilitaries
      if (st.paramilitaries && st.paramilitaries.iia_guard) {
        st.paramilitaries.iia_guard.members   = g.members;
        st.paramilitaries.iia_guard.training  = g.training;
        st.paramilitaries.iia_guard.equipment = g.equipment;
        st.paramilitaries.iia_guard.morale    = g.morale;
        st.paramilitaries.iia_guard.loyalty   = g.loyalty;
      }

      // Determine government status
      if (st.lastElection && st.lastElection.governing) {
        iia.inGovernment = st.lastElection.governing.parties.indexOf('IIA') !== -1
                        || st.lastElection.governing.parties.indexOf('iia') !== -1;
      }
    },

    // ---------- WIN / LOSS ----------
    checkVictory: function (st, playerId) {
      var iia = st.shared.IIA;
      if (!iia) return false;
      if (st.week < 104) return false;

      // IIA wins if it survived, is in government, and completed ≥ 3 reforms
      return !iia.collapsed
          && iia.inGovernment === true
          && iia.reformState.reformsPassed.length >= 3;
    },

    checkDefeat: function (st, playerId) {
      var iia = st.shared.IIA;
      if (!iia) return false;
      if (iia.collapsed) return true;
      if (st.week >= 104 && iia.reformState.reformsPassed.length === 0) return true;
      return false;
    },

    // ---------- VISIBILITY ----------
    getVisibleState: function (st, playerId) {
      var iia = st.shared.IIA;
      var rs = iia.reformState;
      var nextReform = rs.currentReform < rs.totalReforms ? REFORMS[rs.currentReform] : null;
      return {
        week: st.week,
        you: 'IIA',
        yourState: iia,
        factionDescription: FACTION_DESCRIPTION,
        plDescription: PL_DESCRIPTION,
        plState: {
          support: PL_LOCKED_SUPPORT,
          satisfaction: iia.plSatisfaction,
          withholding: iia.plWithholding
        },
        reformState: rs,
        nextReform: nextReform,
        reforms: REFORMS,
        techGuard: iia.techGuard,
        allPlayers: st.players.map(function (p) {
          return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
        }),
        log: st.log.slice(-15)
      };
    },

    // ---------- SUPPORT ----------
    getSupport: function (st, playerId) {
      var iia = st.shared.IIA;
      if (!iia) return { IIA: 0, PL: 0 };
      var pl = iia.plWithholding ? 0 : PL_LOCKED_SUPPORT;
      return { IIA: iia.support, PL: pl, IIA_BLOCK: iia.support + pl };
    }
  };

  // ============================================================
  // HELPERS
  // ============================================================
  function canPayReform(iia, reform) {
    var r = reform.req || {};
    if (r.funds && iia.funds < r.funds) return false;
    if (r.unity && iia.unity < r.unity) return false;
    if (r.stability && iia.reformState.leadershipStability < r.stability) return false;
    if (r.iiaSupport && iia.support < r.iiaSupport) return false;
    return true;
  }

  function applyReform(st, iia, reform, rng) {
    var rs = iia.reformState;
    var eff = reform.effects;
    var notes = [];

    // Pay cost
    if (reform.req && reform.req.funds) iia.funds -= reform.req.funds;

    // Apply effects
    iia.support += eff.supportGain || 0;
    rs.crisisLevel = Math.max(0, rs.crisisLevel - (eff.crisisReduction || 0));
    rs.leadershipStability = Math.min(100, rs.leadershipStability + (eff.stabilityGain || 0));
    rs.factionInfighting = Math.max(0, rs.factionInfighting - (eff.infightingReduction || 0));

    // BL loss
    if (eff.blLoss && st.partySupport.bl !== undefined) {
      var blLoss = eff.blLoss * (0.8 + rng() * 0.4);
      st.partySupport.bl = Math.max(0, st.partySupport.bl - blLoss);
      iia.support += blLoss * 0.3;
    }

    rs.reformsPassed.push(reform.id);
    rs.currentReform++;
    rs.lastReformWeek = st.week;

    notes.push('IIA passes ' + reform.name + '. Support +' + eff.supportGain + ', crisis -' + eff.crisisReduction + '.');

    // Final reform
    if (reform.isFinal) {
      rs.active = false;
      rs.crisisLevel = 0;
      rs.leadershipStability = 100;
      iia.reformed = true;

      if (st.partySupport.bl !== undefined) {
        st.partySupport.bl = st.partySupport.bl * 0.5;
      }
      iia.support += 5;

      notes.push('THE GREAT REFORM HAS PASSED. IIA is reborn. Black League support halved.');
      st.log.push('Week ' + st.week + ': THE GREAT REFORM.');
    }

    return notes;
  }

  // ============================================================
  // REGISTER
  // ============================================================
  E.registerFaction(IIA);

  // Expose for UI
  window.IIAModule = IIA;
  window.IIA_PL_DESCRIPTIONS = { IIA: FACTION_DESCRIPTION, PL: PL_DESCRIPTION };
  window.IIA_REFORMS = REFORMS;
})();