// factions/zmp.js — ZMP faction module for multiplayer.
//
// ZMP is a big tent: four sub-factions share one banner.
//   - securro:       constitutional monarchist (centre, never splits)
//   - zalgrilianist: social monarchist (centre, never splits)
//   - secular:       liberal democrat (wing, splittable → SEMP)
//   - jihadist:      theocratic (wing, splittable → ZJP)
//
// Whichever centre faction reaches 60% internal share dominates ZMP's
// victory flavour.
//
// ZMP carries the Dzehurjaca paramilitary, the Dzehurjaca charge, the
// king putsch (Kapp-style standoff), and the anti-BL wall-breaking actions.
//
// Event handling:
//   ZMP's event inbox is state.queues['ZMP']. Events with handler 'ZMP'
//   are queued here. Events with handler 'any' go to the highest-support
//   faction — often ZMP.
//
// This module calls back into EngineMP for shared mechanics:
//   - EngineMP.breakWall(trigger)
//   - EngineMP.crushCell(locationId, rng)
//   - EngineMP.applyEffects(state, eff, rng)
//   - EngineMP.resolveBattle / resolveBattle2 / resolveBattle3 / resolveBattle4
//   - EngineMP.createSplinters(state)

(function () {
  'use strict';
  if (!window.EngineMP) { console.error('zmp.js: EngineMP missing'); return; }

  var E = window.EngineMP;

  // ============================================================
  // SUB-FACTIONS
  // ============================================================
  var SUB_FACTIONS = ['securro', 'zalgrilianist', 'secular', 'jihadist'];

  var SPLIT_FLOOR = {
    securro:        0,
    zalgrilianist:  0,
    secular:        5,
    jihadist:       3
  };

  var DOMINANCE_THRESHOLD = 60;

  // ============================================================
  // FACTION DESCRIPTIONS  (used by UI to render sub-faction panels)
  // ============================================================
  var FACTION_DESCRIPTIONS = {
    securro: {
      name: 'Securro-Zalgrilianists',
      line: 'The constitution must be defended. The crown must be restrained.',
      desc: 'Constitutional monarchists who believe in a strong state, a weak crown, ' +
            'and the rule of law. They are the party of order, discipline, and continuity. ' +
            'They will not split. They will not compromise on the constitution.',
      tint: 'tint-green',
      n: 1,
      affinity: { zpf: 10, iia: 5, red: -10, rb: -5, bl: -20 },
      spirit: 5, gates: 6, unity: 0,
      mods: { honor: 2, seniors: 2, athletes: 1 }
    },
    zalgrilianist: {
      name: 'Zalgrilianists',
      line: 'The crown is the soul of the nation. The school must restore it.',
      desc: 'Social monarchists who believe the crown is the natural leader of the ' +
            'Zalgrilian people. They want a strong executive, a restored monarchy, ' +
            'and a school that reflects the nation\'s spirit. They are the party of ' +
            'the king, the flag, and the spirit. They will not split.',
      tint: 'tint-gold',
      n: 2,
      affinity: { zpf: 5, iia: -5, red: -15, rb: -10, bl: -10, semp: 15 },
      spirit: 8, gates: 5, unity: 5,
      mods: { honor: 3, seniors: 3, athletes: 2 }
    },
    secular: {
      name: 'Secularists',
      line: 'The school must be free. The crown must not dictate what we learn.',
      desc: 'Liberal democrats who believe in a secular school, individual rights, ' +
            'and the rule of law. They are the party of the students, the faculty, ' +
            'and the future. They will split if they are squeezed too hard — and ' +
            'SEMP will be born.',
      tint: 'tint-blue',
      n: 3,
      affinity: { zpf: -10, iia: 15, red: 10, rb: 10, bl: -25, semp: -10 },
      spirit: 3, gates: 3, unity: 0,
      mods: { honor: 2, gamers: 2, arts: 2, freshmen: 2 }
    },
    jihadist: {
      name: 'Jihadists',
      line: 'The school must be purified. The enemies of God must be expelled.',
      desc: 'Theocratic radicals who believe the school has been corrupted by ' +
            'modernity, secularism, and sin. They want a religious state, a ' +
            'purified curriculum, and the expulsion of the enemies of God. ' +
            'They will split if they are squeezed too hard — and ZJP will be born.',
      tint: 'tint-purple',
      n: 4,
      affinity: { zpf: -20, iia: -15, red: -20, rb: -15, bl: 10, semp: -5 },
      spirit: 10, gates: 2, unity: -5,
      mods: { honor: 3, seniors: 2, athletes: 1, buskids: 2, freshmen: -2 }
    }
  };

  // ============================================================
  // HELPERS
  // ============================================================
  function shares(st) {
    return st.shared.ZMP.shares;
  }

  function normalize(s) {
    var sum = 0;
    for (var i = 0; i < SUB_FACTIONS.length; i++) sum += s[SUB_FACTIONS[i]];
    if (sum === 0) {
      s.securro = 42; s.zalgrilianist = 44; s.secular = 11; s.jihadist = 3;
      return;
    }
    for (var j = 0; j < SUB_FACTIONS.length; j++) {
      s[SUB_FACTIONS[j]] = (s[SUB_FACTIONS[j]] / sum) * 100;
    }
  }

  function tilt(s, favored) {
    for (var i = 0; i < SUB_FACTIONS.length; i++) {
      var k = SUB_FACTIONS[i];
      s[k] += (k === favored) ? 3 : -1;
      if (s[k] < 0) s[k] = 0;
    }
    normalize(s);
  }

  function getDominant(st) {
    var s = shares(st);
    var best = 'securro', bestVal = s.securro;
    if (s.zalgrilianist > bestVal) { best = 'zalgrilianist'; bestVal = s.zalgrilianist; }
    return best;
  }

  function isDominant(st) {
    var s = shares(st);
    var d = getDominant(st);
    return s[d] >= DOMINANCE_THRESHOLD ? d : null;
  }

  // ============================================================
  // MODULE
  // ============================================================
  var ZMP = {
    id: 'ZMP',
    name: 'Student Union Coalition',
    color: '#5fae3c',
    isPlayer: true,

    // ---------- INIT ----------
    initState: function (st, playerId) {
      if (!st.shared.ZMP) {
        st.shared.ZMP = {
          // Total ZMP support in the school
          support: 32,
          funds: 80,
          volunteers: 12,
          unity: 60,
          faculty: 50,
          momentum: 0,

          // Internal shares
          shares: {
            securro:       42,
            zalgrilianist: 44,
            secular:       11,
            jihadist:       3
          },

          // Dzehurjaca paramilitary (mirrored in st.paramilitaries.dzehurjaca)
          dzehurjaca: {
            members:    100,
            training:   8,
            equipment:  9,
            morale:     85,
            loyalty:    90,
            strength:   106
          },

          // Splinter trackers
          secularSplit:  false,
          jihadistSplit: false,

          // Outcome flavour
          outcome: null,

          // Event flags used by shared engine
          eventDone: {},
          pendingEvent: null,

          // Government flags
          inGovernment: false,
          hasPresident: false,
          president: null,

          // Battle flags (mirrored in st.flags by shared engine)
          battle1Lost: false,
          battle2Won: false,
          battle2Lost: false,
          battle3Won: false,
          battle3Lost: false,
          battle4Completed: false,
          hasArbeiterAlly: false,
          blSplintered: false,
          gameOver: false,

          // Presiential election tracking
          presidentialCandidate: null,
          presidentialChoiceMade: false,
          presidentialWinner: null,
          presidentialCampaignBonus: 0,

          // Congress / policy
          congress: null,

          // Cabinet
          cabinet: null,
          coalitionPartners: []
        };
      }
    },

    // ---------- ACTIONS ----------
    availableActions: function (st, playerId) {
      var zmp = st.shared.ZMP;
      var actions = [];

      // ---- CORE CAMPAIGN ----
      actions.push(
        { id: 'zmp_canvass',          name: 'Canvass a Bloc',          ap: 1, funds: 0,  vol: 3,
          desc: 'Send volunteers to a voting bloc.', needsTarget: 'demo', favors: null },
        { id: 'zmp_posters',          name: 'Poster Run',              ap: 1, funds: 5,  vol: 1,
          desc: 'Posters on every door. Freshman-friendly.', favors: null },
        { id: 'zmp_rally',            name: 'Hold a Rally',            ap: 1, funds: 14, vol: 4,
          desc: 'A public rally. Broad small gain plus momentum.', favors: null },
        { id: 'zmp_fundraise',        name: 'Bake Sale',               ap: 1, funds: 0,  vol: 0,
          desc: 'Raise campaign funds. Scales with volunteers.', favors: null },
        { id: 'zmp_recruit',          name: 'Recruit Volunteers',      ap: 1, funds: 0,  vol: 0,
          desc: 'Leaflet the school gates. Recruit volunteers.', favors: null }
      );

      // ---- CENTRE — SECURRO ----
      actions.push(
        { id: 'zmp_constitutional_rally', name: 'Constitutional Rally', ap: 1, funds: 14, vol: 3,
          favors: 'securro', desc: 'A rally for the constitutional crown. Favors Securro.' },
        { id: 'zmp_faculty_pact',         name: 'Faculty Pact',         ap: 1, funds: 8,  vol: 1,
          favors: 'securro', desc: 'Formal agreement with faculty. Favors Securro.' }
      );

      // ---- CENTRE — ZALGRILIANIST ----
      actions.push(
        { id: 'zmp_royal_address',    name: 'Royal Address',           ap: 1, funds: 14, vol: 3,
          favors: 'zalgrilianist', desc: 'A speech from the crown. Favors Zalgrilianist.' },
        { id: 'zmp_strength_march',   name: 'Strength March',          ap: 1, funds: 10, vol: 2,
          favors: 'zalgrilianist', desc: 'A public show of force. Favors Zalgrilianist.' }
      );

      // ---- WING — SECULAR ----
      actions.push(
        { id: 'zmp_rights_campaign',  name: 'Rights Campaign',         ap: 1, funds: 10, vol: 2,
          favors: 'secular', desc: 'Push for student rights. Favors Secular.' }
      );

      // ---- WING — JIHADIST ----
      actions.push(
        { id: 'zmp_moral_campaign',   name: 'Moral Renewal Campaign',  ap: 1, funds: 8,  vol: 2,
          favors: 'jihadist', desc: 'Religious outreach. Favors Jihadist.' }
      );

      // ---- PARAMILITARY ----
      actions.push(
        { id: 'zmp_train_dzehurjaca',   name: 'Train Dzehurjaca',    ap: 2, funds: 15, vol: 2,
          favors: 'zalgrilianist', desc: 'Train the Legion. Raises its strength.' },
        { id: 'zmp_equip_dzehurjaca',   name: 'Equip Dzehurjaca',    ap: 2, funds: 20, vol: 1,
          favors: 'zalgrilianist', desc: 'Equip the Legion. Raises its strength.' },
        { id: 'zmp_recruit_dzehurjaca', name: 'Recruit Dzehurjaca',  ap: 1, funds: 8,  vol: 2,
          favors: 'zalgrilianist', desc: 'Recruit for the Legion.' },
        { id: 'zmp_rally_dzehurjaca',   name: 'Rally the Legion',    ap: 1, funds: 5,  vol: 3,
          favors: 'zalgrilianist', desc: 'Boost Legion morale and loyalty.' }
      );

      // ---- RELATIONS ----
      actions.push(
        { id: 'zmp_negotiate',        name: 'Back-Room Talks',         ap: 1, funds: 4,  vol: 0,
          needsTarget: 'party', desc: 'Improve affinity with a party.' },
        { id: 'zmp_coalition',        name: 'Offer Coalition',         ap: 2, funds: 12, vol: 2,
          needsTarget: 'party', desc: 'Formal coalition offer. Needs affinity ≥ 60.' },
        { id: 'zmp_attack',           name: 'Attack a Party',          ap: 1, funds: 8,  vol: 2,
          needsTarget: 'party', desc: 'Attack leaflets. Effective, hurts unity.' },
        { id: 'zmp_relations_talk',   name: 'Diplomatic Talks',        ap: 1, funds: 3,  vol: 0,
          needsTarget: 'party', desc: 'Send envoys. Small affinity gain.' },
        { id: 'zmp_relations_gift',   name: 'Campaign Support',        ap: 1, funds: 12, vol: 1,
          needsTarget: 'party', desc: 'Offer campaign support. Bigger affinity gain.' },
        { id: 'zmp_relations_absorb', name: 'Absorb Party',            ap: 2, funds: 20, vol: 3,
          needsTarget: 'party', desc: 'Attempt to absorb a small party.' }
      );

      // ---- ANTI-BL WALLS ----
      actions.push(
        { id: 'zmp_anti_bl_denounce',    name: 'Denounce BL',       ap: 1, funds: 0,  vol: 2,
          desc: 'Publicly denounce the Black League. Breaks a wall.' },
        { id: 'zmp_anti_bl_investigate', name: 'Investigate BL',    ap: 1, funds: 5,  vol: 1,
          desc: 'Investigate the Black League. Breaks a wall.' },
        { id: 'zmp_anti_bl_prosecute',   name: 'Prosecute BL',      ap: 2, funds: 10, vol: 1,
          desc: 'Prosecute BL leaders. Breaks a wall.' },
        { id: 'zmp_anti_bl_ban',         name: 'Ban BL',            ap: 3, funds: 20, vol: 2,
          desc: 'Formally ban the Black League. Breaks the final wall.' }
      );

      // ---- CRISIS ----
      actions.push(
        { id: 'zmp_crisis_push_bl',          name: 'Push Against BL',       ap: 2, funds: 10, vol: 3,
          desc: 'Launch a determined push against the Black League.' },
        { id: 'zmp_crisis_sabotage',         name: 'Sabotage BL',           ap: 2, funds: 15, vol: 2,
          desc: 'Sabotage the Black League\'s legions.' },
        { id: 'zmp_crisis_defensive',        name: 'Fortify Position',      ap: 1, funds: 8,  vol: 2,
          desc: 'Fortify against Black League attacks.' },
        { id: 'zmp_crisis_counter_propaganda', name: 'Counter-Propaganda',  ap: 1, funds: 5,  vol: 2,
          desc: 'Launch a counter-propaganda campaign.' }
      );

      // ---- CELL HUNTING ----
      actions.push(
        { id: 'zmp_gather_intelligence', name: 'Gather Intelligence', ap: 1, funds: 5,  vol: 1,
          desc: 'Send agents to gather intelligence.' },
        { id: 'zmp_surveillance_sweep',  name: 'Surveillance Sweep',  ap: 2, funds: 10, vol: 2,
          desc: 'Reveal all cells (needs 5+ intel).' }
      );

      // ---- FOREIGN ----
      actions.push(
        { id: 'zmp_relations_wein',          name: 'Envoys to Wein',           ap: 1, funds: 5,  vol: 0,
          desc: 'Improve relations with Arbeiter von Wein.' },
        { id: 'zmp_relations_wein_gift',     name: 'Gift to Wein',             ap: 1, funds: 15, vol: 0,
          desc: 'Generous gift to Arbeiter von Wein.' },
        { id: 'zmp_relations_wein_alliance', name: 'Formalize Wein Alliance',  ap: 2, funds: 20, vol: 2,
          desc: 'Formalize the Wein alliance (needs 70+ relations).' },
        { id: 'zmp_rally_foreign',           name: 'Rally Foreign Support',    ap: 2, funds: 25, vol: 3,
          desc: 'Launch a foreign support campaign.' }
      );

      // ---- PRESIDENTIAL ----
      if (zmp.hasPresident) {
        actions.push(
          { id: 'zmp_call_election',       name: 'Call Early Election',    ap: 2, funds: 10, vol: 3,
            desc: 'Dissolve the council and call new elections.' },
          { id: 'zmp_draw_president_card', name: 'Draw Presidential Card', ap: 1, funds: 0,  vol: 0,
            desc: 'Draw a presidential action card.' }
        );
      }

      // ---- KING PUTSCH (Zalgrilianist only) ----
      var dominant = getDominant(st);
      if (dominant === 'zalgrilianist' && (zmp.support > 40) && (zmp.funds > 300) && !zmp.kingPutschActive) {
        actions.push(
          { id: 'zmp_launch_king_putsch', name: 'Launch the King Putsch', ap: 3, funds: 100, vol: 10,
            desc: 'Occupy the Council Chamber. Kapp-style standoff.' }
        );
      }

      // ---- DZEHURJACA CHARGE ----
      if (zmp.dzehurjacaAvailable && !zmp.dzehurjacaCharged) {
        actions.push(
          { id: 'zmp_dzehurjaca_charge', name: 'Dzehurjaca Charge', ap: 3, funds: 0, vol: 0,
            desc: 'Last stand against overwhelming odds.' }
        );
      }

      return actions;
    },

    // ---------- APPLY ----------
    applyAction: function (st, playerId, action) {
      if (!action) return;
      if (typeof action === 'string') action = { id: action };
      var zmp = st.shared.ZMP;
      var id = action.id || '';
      var target = action.target || null;
      var rng = st.rng;
      var notes = [];
      var msg = '';

      // ---- ANTI-BL WALL ACTIONS ----
      if (id.indexOf('zmp_anti_bl_') === 0) {
        var trigger = id.replace('zmp_anti_bl_', '');
        var result = E.breakWall(trigger);
        if (result.ok) {
          notes.push('The ' + trigger + ' breaks the ' + result.wall.name + '.');
        } else {
          notes.push('The ' + trigger + ' has no effect — ' + result.msg);
        }
        st.log.push('Week ' + st.week + ': ZMP ' + id);
        return;
      }

      switch (id) {

        // ============================================================
        // CORE CAMPAIGN
        // ============================================================
        case 'zmp_canvass':
          if (target) {
            zmp.support += 0.8 + rng() * 0.4;
            zmp.volunteers -= 3;
            msg = 'Canvassers work ' + target + '. ZMP +' + (0.8).toFixed(1) + '.';
          } else {
            zmp.support += 0.5;
            zmp.volunteers -= 3;
            msg = 'Canvassers work the school. ZMP +0.5.';
          }
          break;

        case 'zmp_posters':
          zmp.support += 0.5 + rng() * 0.3;
          zmp.funds -= 5;
          zmp.volunteers -= 1;
          msg = 'Posters on every door. ZMP +0.6.';
          break;

        case 'zmp_rally':
          zmp.support += 1.2 + rng() * 0.5;
          zmp.momentum = Math.min(20, zmp.momentum + 2);
          zmp.funds -= 14;
          zmp.volunteers -= 4;
          msg = 'A rally in the gym. ZMP +1.4, momentum +2.';
          break;

        case 'zmp_fundraise':
          var raised = Math.round(14 + zmp.volunteers * 0.8 + rng() * 10);
          zmp.funds += raised;
          msg = 'The bake sale clears $' + raised + '.';
          break;

        case 'zmp_recruit':
          var got = Math.round(2 + rng() * 3 + zmp.momentum * 0.2);
          zmp.volunteers += got;
          msg = got + ' new volunteers sign up.';
          break;

        // ============================================================
        // SECURRO
        // ============================================================
        case 'zmp_constitutional_rally':
          zmp.support += 1.2 + rng() * 0.4;
          zmp.funds -= 14;
          zmp.volunteers -= 3;
          tilt(zmp.shares, 'securro');
          msg = 'Constitutional rally. ZMP +1.4, Securro favored.';
          break;

        case 'zmp_faculty_pact':
          zmp.faculty = Math.min(100, zmp.faculty + 4);
          zmp.funds -= 8;
          zmp.volunteers -= 1;
          tilt(zmp.shares, 'securro');
          msg = 'Faculty pact signed. Faculty +4, Securro favored.';
          break;

        // ============================================================
        // ZALGRILIANIST
        // ============================================================
        case 'zmp_royal_address':
          zmp.support += 1.2 + rng() * 0.4;
          zmp.funds -= 14;
          zmp.volunteers -= 3;
          tilt(zmp.shares, 'zalgrilianist');
          msg = 'Royal address. ZMP +1.4, Zalgrilianist favored.';
          break;

        case 'zmp_strength_march':
          zmp.support += 0.7 + rng() * 0.3;
          zmp.funds -= 10;
          zmp.volunteers -= 2;
          tilt(zmp.shares, 'zalgrilianist');
          msg = 'Strength march. ZMP +0.8, Zalgrilianist favored.';
          break;

        // ============================================================
        // SECULAR
        // ============================================================
        case 'zmp_rights_campaign':
          zmp.support += 0.5 + rng() * 0.3;
          zmp.funds -= 10;
          zmp.volunteers -= 2;
          zmp.faculty = Math.min(100, zmp.faculty + 2);
          tilt(zmp.shares, 'secular');
          msg = 'Rights campaign. ZMP +0.6, Secular favored.';
          break;

        // ============================================================
        // JIHADIST
        // ============================================================
        case 'zmp_moral_campaign':
          zmp.support += 0.4 + rng() * 0.3;
          zmp.funds -= 8;
          zmp.volunteers -= 2;
          tilt(zmp.shares, 'jihadist');
          msg = 'Moral renewal campaign. ZMP +0.5, Jihadist favored.';
          break;

        // ============================================================
        // DZEHURJACA
        // ============================================================
        case 'zmp_train_dzehurjaca':
          zmp.dzehurjaca.training = Math.min(10, zmp.dzehurjaca.training + 1);
          zmp.funds -= 15;
          zmp.volunteers -= 2;
          tilt(zmp.shares, 'zalgrilianist');
          msg = 'Legion trained. Training now ' + zmp.dzehurjaca.training + '/10.';
          break;

        case 'zmp_equip_dzehurjaca':
          zmp.dzehurjaca.equipment = Math.min(10, zmp.dzehurjaca.equipment + 1);
          zmp.funds -= 20;
          zmp.volunteers -= 1;
          tilt(zmp.shares, 'zalgrilianist');
          msg = 'Legion equipped. Equipment now ' + zmp.dzehurjaca.equipment + '/10.';
          break;

        case 'zmp_recruit_dzehurjaca':
          var gained = 15 + Math.floor(rng() * 15);
          zmp.dzehurjaca.members += gained;
          zmp.funds -= 8;
          zmp.volunteers -= 2;
          msg = 'Recruited ' + gained + ' fighters.';
          break;

        case 'zmp_rally_dzehurjaca':
          zmp.dzehurjaca.morale = Math.min(100, zmp.dzehurjaca.morale + 8);
          zmp.dzehurjaca.loyalty = Math.min(100, zmp.dzehurjaca.loyalty + 3);
          zmp.funds -= 5;
          zmp.volunteers -= 3;
          msg = 'Legion rallied. Morale ' + zmp.dzehurjaca.morale + '%.';
          break;

        // ============================================================
        // RELATIONS
        // ============================================================
        case 'zmp_negotiate':
          if (target) {
            var gain = Math.round(8 + rng() * 10 + zmp.momentum * 0.4);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gain);
            msg = 'Talks with ' + target + ' — affinity +' + gain + '.';
          }
          break;

        case 'zmp_coalition':
          if (target) {
            var cGain = Math.round(10 + rng() * 15 + zmp.momentum * 0.5);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + cGain);
            msg = 'Coalition talks with ' + target + ' — affinity +' + cGain + '.';
          }
          break;

        case 'zmp_attack':
          if (target) {
            st.partySupport[target] = Math.max(0.5, (st.partySupport[target] || 0) - 3);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.max(0, (st.affinity[target] || 50) - 14);
            zmp.unity = Math.max(0, zmp.unity - 2);
            msg = 'Attack leaflets against ' + target + '.';
          }
          break;

        case 'zmp_relations_talk':
          if (target) {
            var tGain = 3 + rng() * 4;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + tGain);
            msg = 'Envoys to ' + target + '. Affinity +' + tGain.toFixed(1) + '.';
          }
          break;

        case 'zmp_relations_gift':
          if (target) {
            var gGain = 8 + rng() * 7;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gGain);
            msg = 'Campaign support to ' + target + '. Affinity +' + gGain.toFixed(1) + '.';
          }
          break;

        case 'zmp_relations_absorb':
          if (target) {
            var relVal = (st.affinity && st.affinity[target]) || 50;
            if (relVal < 80) {
              msg = 'Affinity too low to absorb ' + target + '.';
            } else if (rng() < 0.3) {
              var notes2 = E.applyEffects(st, { merge: target }, rng);
              notes = notes.concat(notes2);
              msg = target + ' absorbed.';
            } else {
              st.affinity[target] = Math.max(0, (st.affinity[target] || 50) - 10);
              msg = target + ' declined absorption.';
            }
          }
          break;

        // ============================================================
        // CRISIS
        // ============================================================
        case 'zmp_crisis_push_bl':
          var successChance = 0.3 + zmp.unity / 200 + zmp.faculty / 200 + zmp.momentum / 80;
          if (rng() < successChance) {
            st.partySupport.bl = Math.max(0.5, (st.partySupport.bl || 0) - 5);
            st.partySupport.ZMP = (st.partySupport.ZMP || 0) + 3;
            msg = 'Push against BL succeeds.';
          } else {
            st.partySupport.bl = (st.partySupport.bl || 0) + 4;
            st.partySupport.ZMP = Math.max(0.5, (st.partySupport.ZMP || 0) - 3);
            msg = 'Push against BL fails.';
          }
          break;

        case 'zmp_crisis_sabotage':
          st.flags = st.flags || {};
          st.flags.blSabotageLevel = (st.flags.blSabotageLevel || 0) + 1;
          msg = 'Sabotage level ' + st.flags.blSabotageLevel + '.';
          break;

        case 'zmp_crisis_defensive':
          st.flags = st.flags || {};
          st.flags.defensiveBoost = 3;
          st.partySupport.ZMP = (st.partySupport.ZMP || 0) + 1;
          msg = 'Position fortified.';
          break;

        case 'zmp_crisis_counter_propaganda':
          if (rng() < 0.4 + zmp.unity / 200 + zmp.faculty / 150) {
            st.partySupport.bl = Math.max(0.5, (st.partySupport.bl || 0) - 3);
            st.partySupport.ZMP = (st.partySupport.ZMP || 0) + 2;
            msg = 'Counter-propaganda succeeds.';
          } else {
            st.partySupport.bl = (st.partySupport.bl || 0) + 2;
            st.partySupport.ZMP = Math.max(0.5, (st.partySupport.ZMP || 0) - 1);
            msg = 'Counter-propaganda fails.';
          }
          break;

        // ============================================================
        // CELL HUNTING
        // ============================================================
        case 'zmp_gather_intelligence':
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

        case 'zmp_surveillance_sweep':
          if ((st.blackLeagueCells.intelligence || 0) < 5) {
            msg = 'Need 5+ intelligence.';
          } else {
            st.blackLeagueCells.intelligence -= 3;
            var cells2 = st.blackLeagueCells.cells.filter(function(c) { return !c.destroyed; });
            cells2.forEach(function(c) {
              c.discovered = true;
              c.intelLevel = Math.min(5, (c.intelLevel || 0) + 2);
            });
            msg = 'All cells revealed.';
          }
          break;

        // ============================================================
        // FOREIGN
        // ============================================================
        case 'zmp_relations_wein':
          st.affinity = st.affinity || {};
          var weinGain = 8 + rng() * 4;
          st.affinity.wein = Math.min(100, (st.affinity.wein || 40) + weinGain);
          msg = 'Wein relations +' + weinGain.toFixed(1) + '.';
          break;

        case 'zmp_relations_wein_gift':
          st.affinity = st.affinity || {};
          var weinGain2 = 12 + rng() * 6;
          st.affinity.wein = Math.min(100, (st.affinity.wein || 40) + weinGain2);
          msg = 'Gift sent. Wein relations +' + weinGain2.toFixed(1) + '.';
          break;

        case 'zmp_relations_wein_alliance':
          st.affinity = st.affinity || {};
          if ((st.affinity.wein || 0) >= 70) {
            st.flags = st.flags || {};
            st.flags.hasArbeiterAlly = true;
            zmp.hasArbeiterAlly = true;
            msg = 'Wein alliance formalized!';
          } else {
            msg = 'Need 70+ Wein relations.';
          }
          break;

        case 'zmp_rally_foreign':
          st.flags = st.flags || {};
          st.flags.hasArbeiterAlly = true;
          zmp.hasArbeiterAlly = true;
          st.partySupport.ZMP = (st.partySupport.ZMP || 0) + 2;
          msg = 'Foreign support secured.';
          break;

        // ============================================================
        // PRESIDENTIAL
        // ============================================================
        case 'zmp_call_election':
          st.pendingEvent = {
            id: 'early_election_' + st.week,
            week: st.week,
            title: '🗳️ EARLY ELECTION CALLED!',
            body: 'The President has dissolved the council.',
            isElection: true,
            choices: []
          };
          msg = 'Early election called.';
          break;

        case 'zmp_draw_president_card':
          msg = 'Presidential card drawn.';
          break;

        // ============================================================
        // KING PUTSCH
        // ============================================================
        case 'zmp_launch_king_putsch':
          st.flags = st.flags || {};
          st.flags.kingPutschActive = true;
          zmp.kingPutschActive = true;
          msg = 'The Legion marches on the Council Chamber.';
          break;

        // ============================================================
        // DZEHURJACA CHARGE
        // ============================================================
        case 'zmp_dzehurjaca_charge':
          var chargeResult = resolveDzehurjacaCharge(st, rng);
          notes = notes.concat(chargeResult.notes);
          msg = chargeResult.ok ? 'Dzehurjaca Charge succeeds!' : 'Dzehurjaca Charge fails.';
          break;

        default:
          msg = 'Unknown action: ' + id;
          break;
      }

      // Recompute strength
      var dz = zmp.dzehurjaca;
      dz.strength = Math.round(
        dz.members *
        ((dz.training / 10 + dz.equipment / 10) / 2) *
        (dz.morale / 100)
      );

      st.log.push('Week ' + st.week + ': ZMP action ' + id + ' — ' + msg);
      if (notes.length > 0) {
        st.log.push('  ' + notes.join(' '));
      }
    },

    // ---------- PASSIVE TICK ----------
    tickWeek: function (st, playerId) {
      var zmp = st.shared.ZMP;
      if (!zmp) return;

      // Resources
      zmp.funds += 6;
      zmp.momentum = Math.round(zmp.momentum * 0.85);
      if (zmp.support < 5) zmp.support = 5;

      // Recompute Dzehurjaca strength
      var dz = zmp.dzehurjaca;
      dz.strength = Math.round(
        dz.members *
        ((dz.training / 10 + dz.equipment / 10) / 2) *
        (dz.morale / 100)
      );

      // Check for wing splits
      var s = shares(st);

      if (!zmp.secularSplit && s.secular < SPLIT_FLOOR.secular) {
        zmp.secularSplit = true;
        var lostSupport = zmp.support * (s.secular / 100);
        zmp.support -= lostSupport;
        st.partySupport.semp = (st.partySupport.semp || 0) + lostSupport;
        st.log.push('ZMP secular wing splits into SEMP (' + Math.round(lostSupport * 10) / 10 + '% support).');
        s.secular = 0;
        normalize(s);
      }

      if (!zmp.jihadistSplit && s.jihadist < SPLIT_FLOOR.jihadist) {
        zmp.jihadistSplit = true;
        var lostSupport2 = zmp.support * (s.jihadist / 100);
        zmp.support -= lostSupport2;
        st.partySupport.zjp = (st.partySupport.zjp || 0) + lostSupport2;
        st.log.push('ZMP jihadist wing splits into ZJP (' + Math.round(lostSupport2 * 10) / 10 + '%).');
        s.jihadist = 0;
        normalize(s);
      }

      // Mirror to st.partySupport.ZMP so shared engine sees it
      st.partySupport.ZMP = zmp.support;

      // Mirror Dzehurjaca to the shared paramilitaries table so shared
      // battle resolvers can find it.
      if (st.paramilitaries && st.paramilitaries.dzehurjaca) {
        st.paramilitaries.dzehurjaca.members   = zmp.dzehurjaca.members;
        st.paramilitaries.dzehurjaca.training  = zmp.dzehurjaca.training;
        st.paramilitaries.dzehurjaca.equipment = zmp.dzehurjaca.equipment;
        st.paramilitaries.dzehurjaca.morale    = zmp.dzehurjaca.morale;
        st.paramilitaries.dzehurjaca.loyalty   = zmp.dzehurjaca.loyalty;
      }

      // Mirror flags
      st.flags = st.flags || {};
      if (zmp.hasArbeiterAlly) st.flags.hasArbeiterAlly = true;
      if (zmp.battle2Won) st.flags.battle2Won = true;
      if (zmp.battle2Lost) st.flags.battle2Lost = true;
      if (zmp.battle3Won) st.flags.battle3Won = true;
      if (zmp.battle3Lost) st.flags.battle3Lost = true;
      if (zmp.blSplintered) st.flags.blSplintered = true;
    },

    // ---------- WIN / LOSS ----------
    checkVictory: function (st, playerId) {
      var zmp = st.shared.ZMP;
      if (!zmp) return false;

      if (st.week < 104) return false;

      var zmpSupport = zmp.support;
      var zpfSupport = (st.partySupport.zpf) || 0;
      if ((zmpSupport + zpfSupport) < 50) return false;

      // Record the outcome flavour
      zmp.outcome = getDominant(st);
      return true;
    },

    checkDefeat: function (st, playerId) {
      var zmp = st.shared.ZMP;
      if (!zmp) return false;
      if (zmp.support < 5) return true;
      if ((st.partySupport.bl || 0) > 40) return true;
      if (zmp.gameOver) return true;
      return false;
    },

    // ---------- VISIBILITY ----------
    getVisibleState: function (st, playerId) {
      var zmp = st.shared.ZMP;
      return {
        week: st.week,
        you: 'ZMP',
        yourState: zmp,
        internalShares: zmp.shares,
        dominantFaction: getDominant(st),
        dominantLocked: isDominant(st),
        factionDescriptions: FACTION_DESCRIPTIONS,
        dzehurjaca: zmp.dzehurjaca,
        hasPresident: zmp.hasPresident,
        president: zmp.president,
        congress: zmp.congress,
        cabinet: zmp.cabinet,
        coalitionPartners: zmp.coalitionPartners,
        allPlayers: st.players.map(function (p) {
          return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
        }),
        log: st.log.slice(-15)
      };
    },

    // ---------- SUPPORT ----------
    getSupport: function (st, playerId) {
      var zmp = st.shared.ZMP;
      return { ZMP: zmp ? zmp.support : 0 };
    }
  };

  // ============================================================
  // DZEHURJACA CHARGE  (uses shared paramilitary system)
  // ============================================================
  function resolveDzehurjacaCharge(st, rng) {
    var notes = [];
    var zmp = st.shared.ZMP;

    if (!zmp.dzehurjacaAvailable) {
      return { ok: false, notes: ['Dzehurjaca Charge is not available.'] };
    }

    // Compute strengths
    var dzehurjaca = st.paramilitaries ? st.paramilitaries.dzehurjaca : zmp.dzehurjaca;
    var blackLegion = st.paramilitaries ? st.paramilitaries.black_legion : { members: 200, training: 7, equipment: 6, morale: 80, loyalty: 95 };
    var iiaGuard = st.paramilitaries ? st.paramilitaries.iia_guard : null;
    var weinWorkers = st.paramilitaries ? st.paramilitaries.wein_workers : null;
    var redMilitia = st.paramilitaries ? st.paramilitaries.red_militia : null;

    var dzehurjacaStrength = E.calculateParamilitaryStrength(dzehurjaca);

    // Wein bonus
    if (zmp.hasArbeiterAlly && weinWorkers) {
      var weinBonus = Math.floor(weinWorkers.members / 20);
      dzehurjacaStrength += weinBonus;
      notes.push('🌍 Wein manpower: +' + weinBonus + ' strength.');
    }

    var enemyStrength = E.calculateParamilitaryStrength(blackLegion);

    // Red joins BL if hostile
    var redAffinity = (st.affinity && st.affinity.red) || 35;
    if (redAffinity < 30 && redMilitia) {
      enemyStrength += E.calculateParamilitaryStrength(redMilitia) * 0.5;
      notes.push(' Red Militia joins the Black League.');
    }

    // IIA helps if friendly
    var iiaAffinity = (st.affinity && st.affinity.iia) || 25;
    if (iiaAffinity > 60 && iiaGuard) {
      var iiaStrength = E.calculateParamilitaryStrength(iiaGuard) * 0.3;
      dzehurjacaStrength += iiaStrength;
      notes.push('💻 IIA Tech Guard supports the charge: +' + Math.round(iiaStrength) + '.');
    }

    var dzehurjacaRoll = dzehurjacaStrength * (0.85 + rng() * 0.3);
    var enemyRoll = enemyStrength * (0.85 + rng() * 0.3);

    notes.push(' DZEHURJACA CHARGE!');
    notes.push(' Dzehurjaca strength: ' + Math.round(dzehurjacaStrength));
    notes.push(' Enemy strength: ' + Math.round(enemyStrength));

    if (dzehurjacaRoll > enemyRoll) {
      notes.push(' MIRACLE VICTORY!');
      st.partySupport.ZMP = (st.partySupport.ZMP || 0) + 12;
      st.partySupport.bl  = Math.max(0.5, (st.partySupport.bl || 0) - 15);
      zmp.momentum = Math.min(20, zmp.momentum + 12);
      zmp.unity = Math.min(100, zmp.unity + 15);
      zmp.faculty = Math.min(100, zmp.faculty + 8);
      st.flags = st.flags || {};
      st.flags.blNeutralized = true;
      zmp.dzehurjacaAvailable = false;
      zmp.dzehurjacaCharged = true;
      return { ok: true, outcome: 'victory', notes: notes };
    } else {
      notes.push(' DEFEAT! The enemies of democracy win.');
      st.partySupport.ZMP = Math.max(0.5, (st.partySupport.ZMP || 0) - 15);
      st.partySupport.bl = (st.partySupport.bl || 0) + 12;
      zmp.dzehurjacaAvailable = false;
      zmp.dzehurjacaCharged = true;
      zmp.gameOver = true;
      return { ok: false, outcome: 'defeat', notes: notes };
    }
  }

  // ============================================================
  // REGISTER
  // ============================================================
  E.registerFaction(ZMP);

  // Expose sub-faction data for UI
  window.ZMPModule = ZMP;
  window.ZMP_SUB_FACTIONS = FACTION_DESCRIPTIONS;
})();