// factions/bl.js — Black League faction module for multiplayer.
//
// BL is not a party. It is a cult with two wings sharing a name:
//
//   HITLERITE WING — wants power. Runs candidates, wins seats, rules harshly.
//   CULT WING      — wants the collapse. Believes in a prophecy of ten walls.
//
// The prophecy says: when the tyrants break the tenth wall, the boom comes.
// The walls are broken by the OTHER parties' actions against BL.
//
// BL's job is not to win. It is to be destroyed — or to survive undestroyed.
// The three endings:
//   1. The Boom     — the other parties break all 10 walls. Everyone loses.
//   2. Judge Not    — the other parties stop at 9. BL survives, dormant.
//   3. Self-Death   — nobody fights BL. It eats itself.
//
// Everyone sees the wall counter. The other parties publicly announce
// each wall as they break it, trying to save whoever they can.
//
// Event handling: BL's inbox is state.queues['BL']. Events with handler
// 'BL' or 'any' (when BL has the highest support) are queued here.
//
// Calls into EngineMP for shared mechanics:
//   - EngineMP.breakWall(trigger) — called by OTHERS, not BL itself
//   - EngineMP.crushCell / placeBLChill
//   - EngineMP.createSplinters — called when BL is destroyed
//   - EngineMP.applyEffects

(function () {
  'use strict';
  if (!window.EngineMP) { console.error('bl.js: EngineMP missing'); return; }

  var E = window.EngineMP;

  // ============================================================
  // FACTION DESCRIPTION  (used by UI)
  // ============================================================
  var FACTION_DESCRIPTION = {
    name: 'Black League',
    line: 'Order through strength. Purity through fire. The school must be cleansed.',
    desc: 'The Black League is not a party. It is a cult with a flag. ' +
          'It believes the school has been corrupted by weakness, by ' +
          'democracy, by the enemies of the nation. It believes only ' +
          'discipline can save it. It has two wings: the Hitlerites who ' +
          'want power, and the Cultists who want the end of everything. ' +
          'The prophecy says ten walls stand between the school and the boom.',
    tint: 'tint-black',
    n: 10,
    affinity: { zmp: -30, zpf: -25, iia: -20, red: -30, rb: -25, semp: 5, pl: -20 },
    spirit: 6, gates: 9, unity: 20,
    mods: { honor: 3, seniors: 3, athletes: 2, buskids: -3, arts: -3 }
  };

  var HITLERITE_DESCRIPTION = {
    name: 'Hitlerite Wing',
    line: 'Power. The school must be ruled by those strong enough to rule it.',
    desc: 'The Hitlerite wing of the Black League. They want to win ' +
          'elections, take the council, and rule by decree. They are ' +
          'disciplined, patient, and ruthless. When they hold the party, ' +
          'the League fights to win.',
    tint: 'tint-black',
    n: 11
  };

  var CULT_DESCRIPTION = {
    name: 'Cult Wing',
    line: 'The boom is coming. The ten walls will fall. Then the wind.',
    desc: 'The Cult wing of the Black League. They believe the school is ' +
          'damned and the only salvation is destruction. They count the ' +
          'walls the tyrants break. When the tenth wall falls, they will ' +
          'retreat to the bunkers and let the prophecy come. They are not ' +
          'trying to win. They are trying to end.',
    tint: 'tint-purple',
    n: 12
  };

  // ============================================================
  // THE TEN WALLS
  // ============================================================
  var WALLS = [
    { id: 1,  name: 'The First Wall',  trigger: 'denounce',    prophecy: 'When the tyrants broke the first wall, the last stage began.' },
    { id: 2,  name: 'The Second Wall', trigger: 'denounce',    prophecy: 'The second wall has fallen. The clock is running.' },
    { id: 3,  name: 'The Third Wall',  trigger: 'denounce',    prophecy: 'The third wall. They do not know what they do.' },
    { id: 4,  name: 'The Fourth Wall', trigger: 'investigate', prophecy: 'The fourth wall. The prophecy approaches.' },
    { id: 5,  name: 'The Fifth Wall',  trigger: 'investigate', prophecy: 'The fifth wall. The end is near.' },
    { id: 6,  name: 'The Sixth Wall',  trigger: 'investigate', prophecy: 'The sixth wall. Prepare the bunkers.' },
    { id: 7,  name: 'The Seventh Wall',trigger: 'prosecute',   prophecy: 'The seventh wall. The last battle approaches.' },
    { id: 8,  name: 'The Eighth Wall', trigger: 'prosecute',   prophecy: 'The eighth wall. The faithful gather.' },
    { id: 9,  name: 'The Ninth Wall',  trigger: 'prosecute',   prophecy: 'The ninth wall has broken. The last battle has begun.' },
    { id: 10, name: 'The Tenth Wall',  trigger: 'ban',         prophecy: 'The tenth wall is broken. They celebrate. They hear the hum. The wind. The boom.' }
  ];

  // Wing start
  var WING_START = { hitlerite: 50, cult: 50 };

  // ============================================================
  // MODULE
  // ============================================================
  var BL = {
    id: 'BL',
    name: 'Black League',
    color: '#141414',
    isPlayer: true,

    // ---------- INIT ----------
    initState: function (st, playerId) {
      if (!st.shared.BL) {
        st.shared.BL = {
          // Visible support
          support: 3,
          funds: 40,
          volunteers: 4,
          momentum: 0,
          unity: 80,
          faculty: 10,

          // Two wings
          wings: {
            hitlerite: WING_START.hitlerite,
            cult:      WING_START.cult
          },

          // Wall counter — broken by OTHER parties' actions
          wallsBroken: 0,

          // Prophecy log
          prophecyLog: [],

          // Prosecution state
          prosecuted: false,
          boomTriggered: false,

          // Black Legion (mirrored to st.paramilitaries.black_legion)
          blackLegion: {
            members: 200,
            training: 7,
            equipment: 6,
            morale: 80,
            loyalty: 95,
            strength: 103
          },

          // Self-destruction tracker
          weeksUncontested: 0,
          selfDestruct: false,

          // In-government flag
          inGovernment: false,

          // Event tracking
          eventDone: {},
          pendingEvent: null
        };
      }
    },

    // ---------- ACTIONS ----------
    actions: function () {},

    availableActions: function (st, playerId) {
      var bl = st.shared.BL;
      var actions = [];

      // ---- HITLERITE WING — grow the party that wants power ----
      actions.push(
        { id: 'bl_contest_seats',    name: 'Contest Seats',       ap: 1, funds: 8,  vol: 2,
          wing: 'hitlerite', desc: 'Run candidates. Grows BL support and the Hitlerite wing.' },
        { id: 'bl_open_rally',       name: 'Public Rally',        ap: 1, funds: 14, vol: 4,
          wing: 'hitlerite', desc: 'A visible rally. Big support gain, big Hitlerite gain.' },
        { id: 'bl_recruit_legion',   name: 'Recruit Black Legion',ap: 1, funds: 10, vol: 2,
          wing: 'hitlerite', desc: 'Grow the paramilitary. Hitlerite gain.' },
        { id: 'bl_train_legion',     name: 'Train Black Legion',  ap: 2, funds: 15, vol: 2,
          wing: 'hitlerite', desc: 'Train the Black Legion. Hitlerite gain.' },
        { id: 'bl_equip_legion',     name: 'Equip Black Legion',  ap: 2, funds: 20, vol: 1,
          wing: 'hitlerite', desc: 'Equip the Black Legion. Hitlerite gain.' },
        { id: 'bl_attack_party',     name: 'Attack a Party',      ap: 1, funds: 10, vol: 3,
          wing: 'hitlerite', needsTarget: 'party',
          desc: 'Attack leaflets. Effective, Hitlerite gain.' },
        { id: 'bl_intimidate',       name: 'Intimidate a Bloc',   ap: 1, funds: 6,  vol: 3,
          wing: 'hitlerite', needsTarget: 'demo',
          desc: 'Intimidate a demographic. Hitlerite gain.' }
      );

      // ---- CULT WING — grow the party that wants the collapse ----
      actions.push(
        { id: 'bl_prophecy_read',    name: 'Read the Prophecy',   ap: 1, funds: 4,  vol: 1,
          wing: 'cult', desc: 'Public reading of the prophecy. Cult gain.' },
        { id: 'bl_wall_warning',     name: 'Issue Wall Warning',  ap: 1, funds: 6,  vol: 2,
          wing: 'cult', desc: 'Warn the school of the coming collapse. Cult gain, fear rises.' },
        { id: 'bl_prepare_bunkers',  name: 'Prepare the Bunkers', ap: 2, funds: 12, vol: 1,
          wing: 'cult', desc: 'Stockpile for the collapse. Cult gain, quiet.' },
        { id: 'bl_doctrine_spread',  name: 'Spread Doctrine',     ap: 1, funds: 5,  vol: 2,
          wing: 'cult', desc: 'Distribute cult literature. Cult gain.' }
      );

      // ---- NEUTRAL — grow the party overall ----
      actions.push(
        { id: 'bl_spread_word',      name: 'Spread the Word',     ap: 1, funds: 6,  vol: 2,
          wing: null, desc: 'Recruit quietly. Grows both wings equally.' },
        { id: 'bl_fundraise',        name: 'Raise Funds',         ap: 1, funds: 0,  vol: 0,
          wing: null, desc: 'Collect donations from the faithful.' },
        { id: 'bl_recruit',          name: 'Recruit Volunteers',  ap: 1, funds: 0,  vol: 0,
          wing: null, desc: 'Recruit from the disaffected. Adds volunteers.' },
        { id: 'bl_canvass',          name: 'Canvass a Bloc',      ap: 1, funds: 0,  vol: 3,
          wing: null, needsTarget: 'demo',
          desc: 'Canvass a demographic. Grows support.' }
      );

      // ---- RELATIONS ----
      actions.push(
        { id: 'bl_negotiate',        name: 'Back-Room Talks',     ap: 1, funds: 4,  vol: 0,
          needsTarget: 'party', desc: 'Improve affinity with a party.' },
        { id: 'bl_coalition',        name: 'Offer Coalition',     ap: 2, funds: 12, vol: 2,
          needsTarget: 'party', desc: 'Formal coalition offer.' },
        { id: 'bl_relations_talk',   name: 'Diplomatic Talks',    ap: 1, funds: 3,  vol: 0,
          needsTarget: 'party', desc: 'Send envoys. Small affinity gain.' }
      );

      // ---- CELL HUNTING ----
      actions.push(
        { id: 'bl_place_cell',       name: 'Place a Cell',        ap: 2, funds: 15, vol: 3,
          desc: 'Plant a Black League cell in an unoccupied location. Grows BL infrastructure.' },
        { id: 'bl_reinforce_cell',   name: 'Reinforce a Cell',    ap: 1, funds: 10, vol: 2,
          needsTarget: 'cell', desc: 'Strengthen a cell against raids.' }
      );

      // ---- ONCE-TIME ENDGAME ----
      if (bl.wallsBroken >= 10 && bl.wings.cult >= 50 && !bl.boomTriggered) {
        actions.push({
          id: 'bl_trigger_boom',
          name: 'Trigger the Boom',
          ap: 5, funds: 50, vol: 10,
          wing: 'cult',
          desc: 'Take the faithful to the bunkers. End the game.'
        });
      }

      return actions;
    },

    // ---------- APPLY ----------
    applyAction: function (st, playerId, action) {
      if (!action) return;
      if (typeof action === 'string') action = { id: action };
      var bl = st.shared.BL;
      var id = action.id || '';
      var target = action.target || null;
      var rng = st.rng;
      var notes = [];
      var msg = '';

      // ---- THE BOOM ----
      if (id === 'bl_trigger_boom') {
        if (bl.wallsBroken < 10) {
          msg = 'The tenth wall has not fallen. The prophecy is not yet.';
          st.log.push('Week ' + st.week + ': BL ' + msg);
          return;
        }
        if (bl.wings.cult < 50) {
          msg = 'The Hitlerites hold the party. There is no boom.';
          st.log.push('Week ' + st.week + ': BL ' + msg);
          return;
        }
        bl.boomTriggered = true;
        st.finished = true;
        st.winReason = 'boom';
        st.winners = [];
        st.losers = st.players.map(function (p) { return p.id; });
        st.log.push('THE BOOM HAS COME. The school is gone. BL is gone. Everyone is gone.');
        return;
      }

      switch (id) {

        // ============================================================
        // HITLERITE WING
        // ============================================================
        case 'bl_contest_seats':
          bl.support += 0.4 + rng() * 0.3;
          bl.funds -= 8;
          bl.volunteers -= 2;
          tiltWings(bl, 'hitlerite', 3);
          msg = 'Contested seats. Support +0.5, Hitlerite +3.';
          break;

        case 'bl_open_rally':
          bl.support += 1.2 + rng() * 0.6;
          bl.funds -= 14;
          bl.volunteers -= 4;
          bl.momentum += 1;
          tiltWings(bl, 'hitlerite', 5);
          msg = 'Public rally. Support +1.5, Hitlerite +5.';
          break;

        case 'bl_recruit_legion':
          var gained = 10 + Math.floor(rng() * 10);
          bl.blackLegion.members += gained;
          bl.funds -= 10;
          bl.volunteers -= 2;
          tiltWings(bl, 'hitlerite', 3);
          msg = 'Recruited ' + gained + ' into the Black Legion. Hitlerite +3.';
          break;

        case 'bl_train_legion':
          bl.blackLegion.training = Math.min(10, bl.blackLegion.training + 1);
          bl.funds -= 15;
          bl.volunteers -= 2;
          tiltWings(bl, 'hitlerite', 2);
          msg = 'Black Legion trained. Training now ' + bl.blackLegion.training + '/10.';
          break;

        case 'bl_equip_legion':
          bl.blackLegion.equipment = Math.min(10, bl.blackLegion.equipment + 1);
          bl.funds -= 20;
          bl.volunteers -= 1;
          tiltWings(bl, 'hitlerite', 2);
          msg = 'Black Legion equipped. Equipment now ' + bl.blackLegion.equipment + '/10.';
          break;

        case 'bl_attack_party':
          if (target) {
            st.partySupport[target] = Math.max(0.5, (st.partySupport[target] || 0) - 3);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.max(0, (st.affinity[target] || 50) - 15);
            tiltWings(bl, 'hitlerite', 3);
            msg = 'Attacked ' + target + '. Hitlerite +3.';
          }
          break;

        case 'bl_intimidate':
          if (target) {
            bl.support += 0.3;
            tiltWings(bl, 'hitlerite', 4);
            msg = 'Intimidated ' + target + '. Hitlerite +4.';
          }
          break;

        // ============================================================
        // CULT WING
        // ============================================================
        case 'bl_prophecy_read':
          bl.funds -= 4;
          bl.volunteers -= 1;
          tiltWings(bl, 'cult', 3);
          bl.prophecyLog.push('The cult reads the prophecy aloud. The faithful listen.');
          msg = 'Prophecy read. Cult +3.';
          break;

        case 'bl_wall_warning':
          bl.funds -= 6;
          bl.volunteers -= 2;
          tiltWings(bl, 'cult', 4);
          var next = nextProphecyLine(bl);
          bl.prophecyLog.push('Wall warning: ' + next);
          st.log.push('BL issues a warning: ' + next);
          msg = 'Wall warning. Cult +4.';
          break;

        case 'bl_prepare_bunkers':
          bl.funds -= 12;
          bl.volunteers -= 1;
          tiltWings(bl, 'cult', 3);
          msg = 'Bunkers prepared. Cult +3.';
          break;

        case 'bl_doctrine_spread':
          bl.funds -= 5;
          bl.volunteers -= 2;
          tiltWings(bl, 'cult', 4);
          msg = 'Doctrine spread. Cult +4.';
          break;

        // ============================================================
        // NEUTRAL
        // ============================================================
        case 'bl_spread_word':
          bl.support += 0.3 + rng() * 0.2;
          bl.funds -= 6;
          bl.volunteers -= 2;
          msg = 'Spread the word. Support +0.4.';
          break;

        case 'bl_fundraise':
          var raised = 10 + Math.floor(rng() * 8);
          bl.funds += raised;
          msg = 'Raised $' + raised + ' from the faithful.';
          break;

        case 'bl_recruit':
          var got = Math.round(2 + rng() * 4 + bl.momentum * 0.3);
          bl.volunteers += got;
          msg = got + ' new volunteers recruited.';
          break;

        case 'bl_canvass':
          if (target) {
            bl.support += 0.4 + rng() * 0.3;
            bl.volunteers -= 3;
            msg = 'Canvassed ' + target + '. Support +0.5.';
          }
          break;

        // ============================================================
        // RELATIONS
        // ============================================================
        case 'bl_negotiate':
          if (target) {
            var gain = Math.round(5 + rng() * 8 + bl.momentum * 0.4);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + gain);
            msg = 'Talks with ' + target + '. Affinity +' + gain + '.';
          }
          break;

        case 'bl_coalition':
          if (target) {
            var cGain = Math.round(8 + rng() * 12 + bl.momentum * 0.5);
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + cGain);
            msg = 'Coalition talks with ' + target + '. Affinity +' + cGain + '.';
          }
          break;

        case 'bl_relations_talk':
          if (target) {
            var tGain = 2 + rng() * 3;
            if (!st.affinity) st.affinity = {};
            st.affinity[target] = Math.min(100, (st.affinity[target] || 50) + tGain);
            msg = 'Envoys to ' + target + '. Affinity +' + tGain.toFixed(1) + '.';
          }
          break;

        // ============================================================
        // CELLS
        // ============================================================
        case 'bl_place_cell':
          if (!st.blackLeagueCells) {
            st.blackLeagueCells = {
              cells: [],
              maxCells: 6,
              placementTimer: 0,
              placementInterval: 4,
              totalCellsPlaced: 0,
              totalCellsDestroyed: 0,
              intelligence: 0
            };
          }
          var allLocations = E.getCellLocations();
          var occupiedIds = st.blackLeagueCells.cells.map(function(c) { return c.location; });
          var available = allLocations.filter(function(l) {
            return occupiedIds.indexOf(l.id) === -1;
          });
          if (available.length === 0) {
            msg = 'All locations already occupied.';
          } else {
            var loc = available[Math.floor(rng() * available.length)];
            st.blackLeagueCells.cells.push({
              id: 'cell_' + Date.now() + '_' + Math.floor(rng() * 1000),
              location: loc.id,
              locationName: loc.name,
              icon: loc.icon,
              strength: 2 + Math.floor(rng() * 2),
              weekPlaced: st.week,
              discovered: false,
              destroyed: false,
              supporters: 8 + Math.floor(rng() * 8),
              intelLevel: 0
            });
            st.blackLeagueCells.totalCellsPlaced += 1;
            bl.funds -= 15;
            bl.volunteers -= 3;
            msg = 'Placed cell in ' + loc.name + '.';
          }
          break;

        case 'bl_reinforce_cell':
          if (target) {
            var cell = st.blackLeagueCells.cells.find(function(c) {
              return c.location === target && !c.destroyed;
            });
            if (cell) {
              cell.strength = Math.min(5, cell.strength + 1);
              cell.supporters += 5;
              bl.funds -= 10;
              bl.volunteers -= 2;
              msg = 'Reinforced cell in ' + cell.locationName + '. Strength now ' + Math.round(cell.strength) + '.';
            } else {
              msg = 'No cell at that location.';
            }
          }
          break;

        default:
          msg = 'Unknown action: ' + id;
          break;
      }

      // Recompute legion strength
      var legion = bl.blackLegion;
      legion.strength = Math.round(
        legion.members *
        ((legion.training / 10 + legion.equipment / 10) / 2) *
        (legion.morale / 100)
      );

      st.log.push('Week ' + st.week + ': BL action ' + id + ' — ' + msg);
    },

    // ---------- PASSIVE TICK ----------
      tickWeek: function (st, playerId) {
      var bl = st.shared.BL;
      if (!bl) return;

      bl.funds += 4 + bl.blackLegion.members * 0.05;
      bl.momentum = Math.round(bl.momentum * 0.85);

      // Passive volunteer regeneration.
      bl.volunteers += 1 + Math.floor(bl.support / 10);

      // Passive support growth from propaganda and cells.
      var cellCount = (st.blackLeagueCells && st.blackLeagueCells.cells)
        ? st.blackLeagueCells.cells.filter(function (c) { return !c.destroyed; }).length
        : 0;
      bl.support += 0.15 + cellCount * 0.1;

      bl.support += (2 - bl.support) * 0.01;
      if (bl.support < 0.5) bl.support = 0.5;

      if (st.blWalls) {
        bl.wallsBroken = st.blWalls.wallsBroken || 0;
      }

      if (st.week > 20 && bl.wallsBroken === 0) {
        bl.weeksUncontested++;
        if (bl.weeksUncontested >= 10 && !bl.selfDestruct) {
          var clash = 5;
          bl.wings.hitlerite = Math.max(0, bl.wings.hitlerite - clash);
          bl.wings.cult = Math.max(0, bl.wings.cult - clash);
          if (bl.wings.hitlerite < 5 && bl.wings.cult < 5) {
            bl.selfDestruct = true;
            st.log.push('BL has eaten itself. The wings have destroyed each other.');
          } else {
            st.log.push('BL infighting. The party weakens.');
          }
          bl.weeksUncontested = 0;
          normalizeWings(bl);
        }
      } else if (bl.wallsBroken > 0) {
        bl.weeksUncontested = 0;
      }

      var legion = bl.blackLegion;
      legion.strength = Math.round(
        legion.members *
        ((legion.training / 10 + legion.equipment / 10) / 2) *
        (legion.morale / 100)
      );

      st.partySupport.bl = bl.support;

      if (st.paramilitaries && st.paramilitaries.black_legion) {
        st.paramilitaries.black_legion.members   = legion.members;
        st.paramilitaries.black_legion.training  = legion.training;
        st.paramilitaries.black_legion.equipment = legion.equipment;
        st.paramilitaries.black_legion.morale    = legion.morale;
        st.paramilitaries.black_legion.loyalty   = legion.loyalty;
      }

      if (st.lastElection && st.lastElection.governing) {
        bl.inGovernment = st.lastElection.governing.parties.indexOf('BL') !== -1
                       || st.lastElection.governing.parties.indexOf('bl') !== -1;
      }

      if (bl.selfDestruct) {
        bl.support = Math.max(0, bl.support - 2);
      }
    },

    // ---------- WIN / LOSS ----------
    checkVictory: function (st, playerId) {
      var bl = st.shared.BL;
      if (!bl) return false;
      if (bl.boomTriggered) return true;
      return false;
    },

    checkDefeat: function (st, playerId) {
      var bl = st.shared.BL;
      if (!bl) return false;
      if (bl.selfDestruct) return true;
      if (st.week >= 104 && !bl.boomTriggered && bl.wallsBroken < 10) {
        return true;
      }
      return false;
    },

    // ---------- VISIBILITY ----------
    getVisibleState: function (st, playerId) {
      var bl = st.shared.BL;
      return {
        week: st.week,
        you: 'BL',
        yourState: bl,
        factionDescription: FACTION_DESCRIPTION,
        hitleriteDescription: HITLERITE_DESCRIPTION,
        cultDescription: CULT_DESCRIPTION,

        wallsBroken: bl.wallsBroken,
        wallsTotal: WALLS.length,
        lastProphecy: bl.prophecyLog.length > 0 ? bl.prophecyLog[bl.prophecyLog.length - 1] : null,
        prophecyLog: bl.prophecyLog.slice(-10),
        walls: WALLS,

        hitleriteShare: bl.wings.hitlerite,
        cultShare: bl.wings.cult,

        blackLegion: bl.blackLegion,

        boomReady: bl.wallsBroken >= 10 && bl.wings.cult >= 50,

        allPlayers: st.players.map(function (p) {
          return { id: p.id, factionId: p.factionId, ready: p.isReady, connected: p.isConnected };
        }),
        lastElection: st.lastElection || null,
        log: st.log.slice(-15)
      };
    },

    // ---------- SUPPORT ----------
    getSupport: function (st, playerId) {
      var bl = st.shared.BL;
      return { BL: bl ? bl.support : 0 };
    }
  };

  // ============================================================
  // WING HELPERS
  // ============================================================
  function tiltWings(bl, favored, amount) {
    if (favored === 'hitlerite') {
      bl.wings.hitlerite = Math.min(100, bl.wings.hitlerite + amount);
      bl.wings.cult = Math.max(0, bl.wings.cult - amount);
    } else if (favored === 'cult') {
      bl.wings.cult = Math.min(100, bl.wings.cult + amount);
      bl.wings.hitlerite = Math.max(0, bl.wings.hitlerite - amount);
    }
    normalizeWings(bl);
  }

  function normalizeWings(bl) {
    var total = bl.wings.hitlerite + bl.wings.cult;
    if (total > 0) {
      bl.wings.hitlerite = (bl.wings.hitlerite / total) * 100;
      bl.wings.cult = (bl.wings.cult / total) * 100;
    }
  }

  function nextProphecyLine(bl) {
    if (bl.wallsBroken >= 10) return 'The tenth wall is broken. The boom is at hand.';
    return WALLS[bl.wallsBroken].prophecy;
  }

  // ============================================================
  // PUBLIC BREAK-WALL HANDLER
  // ============================================================
  BL.breakWall = function (st, trigger) {
    var bl = st.shared.BL;
    if (!bl) return { ok: false, msg: 'BL not active.' };

    for (var i = 0; i < WALLS.length; i++) {
      var w = WALLS[i];
      if (w.id === bl.wallsBroken + 1 && w.trigger === trigger) {
        bl.wallsBroken++;
        bl.prophecyLog.push(w.prophecy);
        st.log.push('!! ' + w.name + ' has been broken by the ' + trigger + '.');
        st.log.push('   ' + w.prophecy);
        st.log.push('   The cult publicly reads the prophecy.');
        if (st.blWalls) {
          st.blWalls.wallsBroken = bl.wallsBroken;
        }
        return { ok: true, wall: w };
      }
    }

    return { ok: false, msg: 'No matching wall to break at this stage.' };
  };

  // ============================================================
  // REGISTER
  // ============================================================
  E.registerFaction(BL);

  window.BLModule = BL;
  window.BL_DESCRIPTIONS = {
    BL: FACTION_DESCRIPTION,
    hitlerite: HITLERITE_DESCRIPTION,
    cult: CULT_DESCRIPTION
  };
  window.BL_WALLS = WALLS;
})();