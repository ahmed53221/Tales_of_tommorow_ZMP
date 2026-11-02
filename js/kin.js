/* king_minigame.js — Kapp-style standoff engine for the ZALGRILIANIST faction.
 * This is NOT a battle. It is a political-military standoff:
 * a Legion occupies a building, a crowd of strikers gathers, and
 * the whole thing hinges on whether the Legion holds and whether
 * the crowd disperses.
 *
 * Loads BEFORE zalgrilia.js.
 */
window.KingMinigame = (function () {
  'use strict';

  var CFG = {
    beatsTotal: 25,          // <<< NEW: was 12
    startingCohesion: 90,
    surgeThreshold: 85,      // crowd breaks through at this pressure
    cohesionCollapse: 15,    // legion disbands at this cohesion
    fireChanceBase: 0.40,    // base chance a Legion will obey "fire on crowd"
    fireChanceLoyaltyMul: 1 / 400,

    // <<< NEW: sound truck + radio
    soundTruckPressureDrift: 0.8,    // per beat while playing (crowd gets LOUDER)
    soundTruckMoraleDrift: -0.3,     // per beat while playing (Legion bleeds)
    radioChance: 0.55,               // chance "Address the Nation" lands well
    radioSwingGood: -25,
    radioSwingBad: 20
  };

  var ORDERS = [
    { id: 'speak',        name: 'Speak to the Crowd',
      desc: 'Address the crowd. Calms them slightly but drains Legion morale.' },
    { id: 'hold',         name: 'Hold the Line',
      desc: 'Legion stands firm. Legion morale drops slowly.' },
    { id: 'advance',      name: 'Advance Slowly',
      desc: 'Legion steps forward. Increases crowd pressure but pushes them back.' },
    { id: 'withdraw',     name: 'Withdraw a Step',
      desc: 'Legion pulls back. Reduces crowd pressure but lowers Legion morale.' },

    // <<< NEW: protest-themed orders
    { id: 'address_nation', name: 'Address the Nation',
      desc: 'One-shot: the Marshal goes on live radio. Can swing pressure ±25% either way.' },
    { id: 'cut_power',    name: 'Cut the Power',
      desc: 'Send men to silence the crowd\'s sound truck. Huge pressure spike, Legion splits.' },
    { id: 'turn_it_up',   name: 'Turn It Up',
      desc: 'The Marshal takes the loudspeaker himself. Risky — could calm them or enrage them.' },

    { id: 'fire_warning', name: 'Fire Warning Shots',
      desc: 'Fire into the air. Big crowd pressure spike, big Legion morale drop.' },
    { id: 'fire_crowd',   name: 'Fire Into the Crowd',
      desc: 'Point-blank fire. Ends the standoff — outcome depends on the Legion.' }
  ];

  function newGame(st) {
    var legionSize = 40, morale = 100, loyalty = 90;

    // Seed the Legion from the engine's paramilitary data, if present.
    if (st && st.paramilitaries && st.paramilitaries.dzehurjaca) {
      var dz = st.paramilitaries.dzehurjaca;
      legionSize = Math.max(15, Math.min(80, Math.round(dz.members / 3)));
      morale = dz.morale || 85;
      loyalty = dz.loyalty || 90;
    }

    return {
      phase: 'active',
      beatNumber: 1,
      beatsTotal: CFG.beatsTotal,

      crowdSize: 120 + Math.floor(Math.random() * 80),
      crowdPressure: 30,
      crowdDays: 0,

      legionSize: legionSize,
      legionLine: 0,
      legionCohesion: CFG.startingCohesion,
      legionMorale: morale,
      legionLoyalty: loyalty,

      injuries: 0,
      warningShotFired: false,
      orderHistory: [],
      log: ['The Legion forms up on the asphalt.'],

      // <<< NEW: sound truck + radio
      soundTruckPlaying: true,     // it's on from beat 1
      soundTruckSeized: false,
      radioUsed: false,

      result: null
    };
  }

  function getOrders() { return ORDERS.slice(); }

  function issueOrder(g, orderId, rng) {
    if (g.phase !== 'active') return { ok: false, msg: 'The standoff is over.' };

    var order = null;
    for (var i = 0; i < ORDERS.length; i++) {
      if (ORDERS[i].id === orderId) order = ORDERS[i];
    }
    if (!order) return { ok: false, msg: 'Unknown order.' };

    g.orderHistory.push({ order: orderId, beat: g.beatNumber });
    g.log.push('>> ' + order.name);

    // Legion cohesion always drifts down slowly during the standoff.
    g.legionCohesion = Math.max(0, g.legionCohesion - (1 + rng() * 2));

    if (orderId === 'speak') {
      g.crowdPressure = Math.max(0, g.crowdPressure - (5 + rng() * 5));
      g.legionMorale = Math.max(0, g.legionMorale - 2);
      g.log.push('The Marshal addresses the crowd. Some quiet down.');

    } else if (orderId === 'hold') {
      g.crowdPressure += 1 + rng() * 2;
      g.legionMorale = Math.max(0, g.legionMorale - 3);
      g.log.push('The Legion holds. The crowd grows louder.');

    } else if (orderId === 'advance') {
      g.legionLine = Math.min(3, g.legionLine + 1);
      g.crowdPressure += 8 + rng() * 8;
      g.legionMorale = Math.max(0, g.legionMorale - 4);
      g.log.push('The Legion advances one step. The crowd edges back.');

    } else if (orderId === 'withdraw') {
      g.legionLine = Math.max(-2, g.legionLine - 1);
      g.crowdPressure = Math.max(0, g.crowdPressure - 6 - rng() * 6);
      g.legionMorale = Math.max(0, g.legionMorale - 6);
      g.log.push('The Legion takes a step back. The crowd presses forward.');

    // <<< NEW ORDER HANDLERS
    } else if (orderId === 'address_nation') {
      if (g.radioUsed) {
        g.log.push('The station will not give the Marshal another slot.');
      } else {
        g.radioUsed = true;
        var chance = CFG.radioChance;
        if (rng() < chance) {
          g.crowdPressure = Math.max(0, g.crowdPressure + CFG.radioSwingGood);
          g.legionMorale = Math.min(100, g.legionMorale + 4);
          g.log.push('The Marshal addresses the nation. For a moment, everyone listens.');
        } else {
          g.crowdPressure += CFG.radioSwingBad;
          g.legionMorale = Math.max(0, g.legionMorale - 6);
          g.log.push('The address falls flat. The crowd boos the radio.');
        }
      }

    } else if (orderId === 'cut_power') {
      if (g.soundTruckSeized) {
        g.log.push('The truck is already dark. Nothing left to cut.');
      } else {
        g.soundTruckSeized = true;
        g.soundTruckPlaying = false;
        g.crowdPressure += 22 + rng() * 12;   // they HATE this
        g.legionCohesion = Math.max(0, g.legionCohesion - 12);
        g.legionMorale = Math.max(0, g.legionMorale - 8);
        g.log.push('Legion men move on the truck. The music dies. The crowd screams.');
      }

    } else if (orderId === 'turn_it_up') {
      if (rng() < 0.5) {
        g.crowdPressure = Math.max(0, g.crowdPressure - 12 - rng() * 8);
        g.legionMorale = Math.max(0, g.legionMorale - 4);
        g.log.push('The Marshal takes the loudspeaker. His voice cuts through.');
      } else {
        g.crowdPressure += 10 + rng() * 10;
        g.legionMorale = Math.max(0, g.legionMorale - 6);
        g.log.push('The crowd drowns him out. The anthem plays louder.');
      }
    // <<< END NEW ORDER HANDLERS

    } else if (orderId === 'fire_warning') {
      g.warningShotFired = true;
      g.crowdPressure += 15 + rng() * 10;
      g.legionMorale = Math.max(0, g.legionMorale - 12);
      g.legionCohesion = Math.max(0, g.legionCohesion - 8);
      g.log.push('Warning shots ring out. The crowd screams, then surges.');

    } else if (orderId === 'fire_crowd') {
      return resolveFireOnCrowd(g, rng);
    }

    g.beatNumber++;
    g.crowdDays++;

    // The crowd grows every other beat.
    if (g.beatNumber % 2 === 0) {
      g.crowdSize += 30 + Math.floor(rng() * 60);
    }

    // Auto-resolve when a threshold is crossed.
    if (g.crowdPressure >= CFG.surgeThreshold) return resolveSurge(g);
    if (g.legionCohesion <= CFG.cohesionCollapse) return resolveLegionCollapse(g);
    if (g.beatNumber > g.beatsTotal) return resolveTimeout(g, rng);

    return { ok: true };
  }

  function resolveFireOnCrowd(g, rng) {
    g.phase = 'resolved';
    var fireChance = CFG.fireChanceBase + g.legionLoyalty * CFG.fireChanceLoyaltyMul;
    if (rng() < fireChance) {
      g.injuries = 3 + Math.floor(rng() * 8);
      g.result = {
        outcome: 'fired_on_crowd',
        beats: g.beatNumber,
        injuries: g.injuries,
        warningShotFired: g.warningShotFired
      };
      g.log.push('The Legion fires into the crowd.');
    } else {
      g.result = {
        outcome: 'legion_refused',
        beats: g.beatNumber,
        injuries: 0,
        warningShotFired: g.warningShotFired
      };
      g.log.push('The Legion refuses to fire.');
    }
    return { ok: true };
  }

  function resolveSurge(g) {
    g.phase = 'resolved';
    g.result = { outcome: 'surge', beats: g.beatNumber, injuries: g.injuries };
    g.log.push('The crowd breaks through the Legion line.');
    return { ok: true };
  }

  function resolveLegionCollapse(g) {
    g.phase = 'resolved';
    g.result = { outcome: 'peaceful', beats: g.beatNumber, injuries: 0 };
    g.log.push('The Legion disbands in the night. The crowd goes home.');
    return { ok: true };
  }

  function resolveTimeout(g, rng) {
    g.phase = 'resolved';
    if (g.injuries === 0 && g.crowdPressure < 60) {
      g.result = { outcome: 'peaceful', beats: g.beatNumber, injuries: 0 };
    } else if (g.injuries > 0) {
      g.result = { outcome: 'injured', beats: g.beatNumber, injuries: g.injuries };
    } else {
      g.result = { outcome: 'surge', beats: g.beatNumber, injuries: 0 };
    }
    return { ok: true };
  }

  // Passive drift between beats.
  function update(g, dt) {
    if (g.phase === 'active') {
      // base drift
      var drift = dt * 0.5;

      // <<< NEW: sound truck — crowd gets LOUDER, Legion morale bleeds
      if (g.soundTruckPlaying) {
        drift += dt * (CFG.soundTruckPressureDrift || 0.8);
        g.legionMorale = Math.max(0, g.legionMorale + dt * (CFG.soundTruckMoraleDrift || -0.3));
      }

      g.crowdPressure = Math.min(
        CFG.surgeThreshold - 1,
        Math.max(0, g.crowdPressure + drift)
      );
    }
  }

  return {
    CFG: CFG,
    newGame: newGame,
    getOrders: getOrders,
    issueOrder: issueOrder,
    update: update
  };
})();