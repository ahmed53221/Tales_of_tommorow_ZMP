/* king_minigame.js — Kapp-style standoff, turn-based, two-sided.
 *
 * The Legion player picks an order. The crowd (AI) picks an order.
 * Both resolve simultaneously. Beat advances. Repeat until one side
 * breaks or the clock runs out.
 *
 * Legion orders: the same defensive/restraint set as before.
 * Crowd orders: charge, stampede, chant, siege, provoke, scatter.
 *
 * Loads BEFORE zalgrilia.js. Exposes window.KingMinigame.
 */
window.KingMinigame = (function () {
  'use strict';

  var CFG = {
    beatsTotal: 25,
    startingCohesion: 90,
    startingPressure: 30,

    surgeThreshold: 85,        // crowd breaks through at this pressure
    cohesionCollapse: 15,      // legion disbands at this cohesion
    moraleCollapse: 15,        // legion disbands at this morale

    crowdRoutSize: 40,         // crowd goes home below this size
    crowdRoutPressure: 20,     // ...and below this pressure

    fireChanceBase: 0.40,      // base chance Legion obeys "fire on crowd"
    fireChanceLoyaltyMul: 1 / 400,

    // Passive drift per beat
    passivePressureDrift: 1.2,
    soundTruckPressureDrift: 1.5,
    soundTruckMoraleDrift: -1.5,

    // Order tuning
    chargePressure: 20,
    chargeCohesion: 14,
    chargeInjuryMin: 1,
    chargeInjuryMax: 5,

    stampedePressure: 38,
    stampedeCohesion: 28,
    stampedeInjuryMin: 4,
    stampedeInjuryMax: 14,

    chantPressure: 5,
    chantCrowdGain: 30,

    siegeMoraleDrain: 10,
    siegeCohesionDrain: 5,

    provokeFireBonus: 0.20,

    scatterPressureDrop: 18,
    scatterCrowdLoss: 0.35,

    // Interaction modifiers
    fireVsChargeBonus: 0.20,
    fireVsStampedeBonus: 0.30,
    advanceVsChargeContest: true,
    withdrawVsChargeBonus: 1.4
  };

  // ============================================================
  // ORDERS
  // ============================================================
  var LEGION_ORDERS = [
    { id: 'speak',          name: 'Speak to the Crowd',
      desc: 'Address the crowd. Calms them slightly, drains Legion morale.' },
    { id: 'hold',           name: 'Hold the Line',
      desc: 'Legion stands firm. Morale slowly drops.' },
    { id: 'advance',        name: 'Advance Slowly',
      desc: 'Legion steps forward. Big pressure spike, contests a charge.' },
    { id: 'withdraw',       name: 'Withdraw a Step',
      desc: 'Legion pulls back. Reduces pressure, lowers morale.' },
    { id: 'address_nation', name: 'Address the Nation',
      desc: 'One-shot. Live radio. Big pressure swing either way.' },
    { id: 'cut_power',      name: 'Cut the Power',
      desc: 'Silence the sound truck. Huge spike, Legion cohesion splits.' },
    { id: 'turn_it_up',     name: 'Turn It Up',
      desc: 'Marshal takes the loudspeaker. 50/50 calm or enrage.' },
    { id: 'fire_warning',   name: 'Fire Warning Shots',
      desc: 'Into the air. Big pressure spike, morale drop.' },
    { id: 'fire_crowd',     name: 'Fire Into the Crowd',
      desc: 'Point-blank. Decisive. Outcome depends on Legion loyalty.' }
  ];

  var CROWD_ORDERS = [
    { id: 'hold_ground', name: 'Hold the Line',
      desc: 'Crowd stands. Steady pressure.' },
    { id: 'chant',       name: 'Chant and Sing',
      desc: 'Build morale and crowd size. Slow pressure rise.' },
    { id: 'siege',       name: 'Siege the Loading Dock',
      desc: 'Cut off supplies. Legion morale and cohesion bleed.' },
    { id: 'charge',      name: 'Charge the Line',
      desc: 'Rush forward. Pressure spike, Legion cohesion hit. Injuries possible.' },
    { id: 'stampede',    name: 'STAMPEDE',
      desc: 'Full surge. Decisive — breakthrough or rout.' },
    { id: 'provoke',     name: 'Provoke the Line',
      desc: 'Try to draw fire. If the Legion shoots, injuries worse.' },
    { id: 'scatter',     name: 'Scatter',
      desc: 'Crowd disperses. Pressure and size both drop.' }
  ];

  // ============================================================
  // GAME CONSTRUCTION
  // ============================================================
  function newGame(st) {
    var legionSize = 40, morale = 100, loyalty = 90, cohesion = CFG.startingCohesion;

    if (st && st.paramilitaries && st.paramilitaries.dzehurjaca) {
      var dz = st.paramilitaries.dzehurjaca;
      legionSize = Math.max(15, Math.min(80, Math.round(dz.members / 3)));
      morale     = dz.morale   || 85;
      loyalty    = dz.loyalty  || 90;
      cohesion   = Math.max(40, Math.min(100, dz.loyalty));
    }

    return {
      phase: 'legion_turn',          // 'legion_turn' | 'resolving' | 'resolved'
      beatNumber: 1,
      beatsTotal: CFG.beatsTotal,

      legionSize: legionSize,
      legionMorale: morale,
      legionLoyalty: loyalty,
      legionCohesion: cohesion,
      legionLine: 0,

      crowdSize: 120 + Math.floor(Math.random() * 80),
      crowdPressure: CFG.startingPressure,

      injuries: 0,
      warningShotFired: false,

      soundTruckPlaying: true,
      soundTruckSeized: false,
      radioUsed: false,

      turnHistory: [],    // { beat, legion, crowd, summary }
      log: ['The Legion forms up on the asphalt.'],
      lastResolution: null,
      result: null
    };
  }

  // ============================================================
  // CROWD AI
  // ============================================================
  function pickCrowdOrder(g, rng) {
    var w = {
      hold_ground: 2,
      chant:       2,
      siege:       1,
      charge:      1,
      stampede:    0,
      provoke:     1,
      scatter:     0.5
    };

    // Pressure drives aggression
    if (g.crowdPressure > 40) { w.chant -= 1; w.siege += 1; w.charge += 1; }
    if (g.crowdPressure > 60) { w.charge += 2; w.stampede += 1; w.provoke += 1; }
    if (g.crowdPressure > 75) { w.stampede += 4; w.charge += 2; }

    // Big crowd drives aggression
    if (g.crowdSize > 200) { w.charge += 1; w.stampede += 1; }
    if (g.crowdSize > 300) { w.charge += 1; w.stampede += 2; }

    // Legion weakness drives aggression
    if (g.legionCohesion < 50) { w.siege += 1; w.provoke += 1; }
    if (g.legionMorale   < 50) { w.charge += 1; w.provoke += 1; }
    if (g.legionCohesion < 30) { w.stampede += 2; w.charge += 2; }

    // If sound truck is already cut, they don't scatter as easily
    if (g.soundTruckSeized) { w.scatter -= 0.3; }

    // If crowd is small and pressure is low, they may go home
    if (g.crowdSize < 80 && g.crowdPressure < 30) { w.scatter += 2; }

    // Normalize
    var total = 0;
    for (var k in w) { if (w[k] < 0) w[k] = 0; total += w[k]; }
    if (total === 0) return 'hold_ground';

    var roll = rng() * total;
    var cum = 0;
    for (var k2 in w) {
      cum += w[k2];
      if (roll <= cum) return k2;
    }
    return 'hold_ground';
  }

  // ============================================================
  // TURN RESOLUTION
  // ============================================================
  function resolveTurn(g, legionOrderId, crowdOrderId, rng) {
    if (g.phase === 'resolved') {
      return { ok: false, msg: 'The standoff is over.' };
    }

    var L = findOrder(LEGION_ORDERS, legionOrderId);
    var C = findOrder(CROWD_ORDERS, crowdOrderId);
    if (!L || !C) return { ok: false, msg: 'Unknown order.' };

    var summary = [];
    var legionLog = [], crowdLog = [];

    // --- Baseline drift ---
    g.crowdPressure += CFG.passivePressureDrift;
    if (g.soundTruckPlaying) {
      g.crowdPressure += CFG.soundTruckPressureDrift;
      g.legionMorale   += CFG.soundTruckMoraleDrift;
    }
    g.legionCohesion -= 0.5;   // the stress of holding

    // --- Interaction modifiers ---
    var fireBonus = 0;
    if (legionOrderId === 'fire_crowd') {
      if (crowdOrderId === 'charge')    fireBonus += CFG.fireVsChargeBonus;
      if (crowdOrderId === 'stampede')  fireBonus += CFG.fireVsStampedeBonus;
    }
    var chargeMul = 1.0;
    if (crowdOrderId === 'charge' && legionOrderId === 'withdraw') {
      chargeMul = CFG.withdrawVsChargeBonus;
    }

    // ============================================================
    // LEGION ORDER
    // ============================================================
    if (legionOrderId === 'speak') {
      var drop = 5 + rng() * 5;
      g.crowdPressure = Math.max(0, g.crowdPressure - drop);
      g.legionMorale  = Math.max(0, g.legionMorale - 2);
      legionLog.push('The Marshal addresses the crowd. Pressure −' + Math.round(drop) + '.');

    } else if (legionOrderId === 'hold') {
      g.crowdPressure += 1 + rng() * 2;
      g.legionMorale  = Math.max(0, g.legionMorale - 3);
      legionLog.push('The Legion holds. The crowd grows louder.');

    } else if (legionOrderId === 'advance') {
      g.legionLine = Math.min(3, g.legionLine + 1);
      g.crowdPressure += 8 + rng() * 8;
      g.legionMorale  = Math.max(0, g.legionMorale - 4);

      // Advance into a charge is a contested melee
      if (crowdOrderId === 'charge') {
        g.legionCohesion -= 8;
        g.crowdPressure  += 4;
        var inj = 1 + Math.floor(rng() * 3);
        g.injuries += inj;
        legionLog.push('Legion advances into the crowd. ' + inj + ' injured in the melee.');
      } else {
        legionLog.push('The Legion advances one step. The crowd edges back.');
      }

    } else if (legionOrderId === 'withdraw') {
      g.legionLine    = Math.max(-2, g.legionLine - 1);
      g.crowdPressure = Math.max(0, g.crowdPressure - 6 - rng() * 6);
      g.legionMorale  = Math.max(0, g.legionMorale - 6);
      legionLog.push('The Legion takes a step back. The crowd presses forward.');

    } else if (legionOrderId === 'address_nation') {
      if (g.radioUsed) {
        legionLog.push('The station will not give the Marshal another slot.');
      } else {
        g.radioUsed = true;
        if (rng() < 0.55) {
          g.crowdPressure = Math.max(0, g.crowdPressure - 25);
          g.legionMorale  = Math.min(100, g.legionMorale + 4);
          legionLog.push('The Marshal addresses the nation. For a moment, everyone listens.');
        } else {
          g.crowdPressure += 20;
          g.legionMorale  = Math.max(0, g.legionMorale - 6);
          legionLog.push('The address falls flat. The crowd boos the radio.');
        }
      }

    } else if (legionOrderId === 'cut_power') {
      if (g.soundTruckSeized) {
        legionLog.push('The truck is already dark.');
      } else {
        g.soundTruckSeized = true;
        g.soundTruckPlaying = false;
        g.crowdPressure += 22 + rng() * 12;
        g.legionCohesion -= 12;
        g.legionMorale  -= 8;
        legionLog.push('Men move on the truck. The music dies. The crowd screams.');
      }

    } else if (legionOrderId === 'turn_it_up') {
      if (rng() < 0.5) {
        g.crowdPressure = Math.max(0, g.crowdPressure - 12 - rng() * 8);
        g.legionMorale  = Math.max(0, g.legionMorale - 4);
        legionLog.push('The Marshal takes the loudspeaker. His voice cuts through.');
      } else {
        g.crowdPressure += 10 + rng() * 10;
        g.legionMorale  = Math.max(0, g.legionMorale - 6);
        legionLog.push('The crowd drowns him out.');
      }

    } else if (legionOrderId === 'fire_warning') {
      g.warningShotFired = true;
      g.crowdPressure += 15 + rng() * 10;
      g.legionMorale  -= 12;
      g.legionCohesion -= 8;
      legionLog.push('Warning shots ring out. The crowd screams, then surges.');

    } else if (legionOrderId === 'fire_crowd') {
      var fireChance = CFG.fireChanceBase + g.legionLoyalty * CFG.fireChanceLoyaltyMul + fireBonus;
      if (rng() < fireChance) {
        var injF = 3 + Math.floor(rng() * 8);
        g.injuries += injF;
        g.crowdPressure = Math.max(0, g.crowdPressure - 20);
        g.legionMorale  -= 20;
        g.legionCohesion -= 15;
        legionLog.push('The Legion fires into the crowd. ' + injF + ' injured.');
        g._firedOnCrowd = true;
      } else {
        g.legionCohesion -= 25;
        g.legionMorale  -= 15;
        legionLog.push('The Legion refuses to fire.');
        g._legionRefused = true;
        // Refusal ends the game immediately
        return endTurn(g, legionLog, crowdLog, { outcome: 'legion_refused' });
      }
    }

    // ============================================================
    // CROWD ORDER
    // ============================================================
    if (crowdOrderId === 'hold_ground') {
      g.crowdPressure += 1 + rng() * 2;
      crowdLog.push('The crowd holds its ground.');

    } else if (crowdOrderId === 'chant') {
      g.crowdPressure += CFG.chantPressure;
      g.crowdSize     += CFG.chantCrowdGain + Math.floor(rng() * 20);
      crowdLog.push('The crowd chants. More arrive from the far side of the lot.');

    } else if (crowdOrderId === 'siege') {
      g.legionMorale   -= CFG.siegeMoraleDrain;
      g.legionCohesion -= CFG.siegeCohesionDrain;
      g.crowdPressure  += 4;
      crowdLog.push('The crowd cuts off the loading dock. The Legion begins to fray.');

    } else if (crowdOrderId === 'charge') {
      var chargePressure = CFG.chargePressure * chargeMul;
      g.crowdPressure  += chargePressure;
      g.legionCohesion -= CFG.chargeCohesion;
      g.legionMorale   -= 6;
      var injC = CFG.chargeInjuryMin + Math.floor(rng() * (CFG.chargeInjuryMax - CFG.chargeInjuryMin + 1));
      // Legion order can reduce injuries
      if (legionOrderId === 'fire_warning') injC = Math.round(injC * 0.4);
      if (legionOrderId === 'fire_crowd')   injC = Math.round(injC * 1.5);
      g.injuries += injC;
      crowdLog.push('The crowd charges. Pressure +' + Math.round(chargePressure) + '. ' + injC + ' injured.');

    } else if (crowdOrderId === 'stampede') {
      g.crowdPressure  += CFG.stampedePressure;
      g.legionCohesion -= CFG.stampedeCohesion;
      g.legionMorale   -= 14;
      var injS = CFG.stampedeInjuryMin + Math.floor(rng() * (CFG.stampedeInjuryMax - CFG.stampedeInjuryMin + 1));
      if (legionOrderId === 'fire_warning') injS = Math.round(injS * 0.5);
      if (legionOrderId === 'fire_crowd')   injS = Math.round(injS * 1.7);
      g.injuries += injS;
      crowdLog.push('STAMPEDE. Pressure +' + CFG.stampedePressure + '. ' + injS + ' injured.');

    } else if (crowdOrderId === 'provoke') {
      g.crowdPressure += 6;
      g.legionCohesion -= 4;
      g._crowdProvoked = true;
      crowdLog.push('The crowd provokes the line. Someone shouts at the Legion to shoot.');

    } else if (crowdOrderId === 'scatter') {
      g.crowdPressure = Math.max(0, g.crowdPressure - CFG.scatterPressureDrop);
      var lost = Math.floor(g.crowdSize * CFG.scatterCrowdLoss);
      g.crowdSize = Math.max(0, g.crowdSize - lost);
      crowdLog.push('The crowd scatters into smaller groups. ' + lost + ' drift away.');

    }

    // ============================================================
    // CLAMP
    // ============================================================
    g.crowdPressure  = Math.max(0, g.crowdPressure);
    g.legionCohesion = Math.max(0, g.legionCohesion);
    g.legionMorale   = Math.max(0, g.legionMorale);
    g.legionSize     = Math.max(0, g.legionSize);

    // ============================================================
    // END CHECK
    // ============================================================
    var endReason = null;
    if (g.crowdPressure >= CFG.surgeThreshold) endReason = 'crowd_breaks';
    else if (g.legionCohesion <= CFG.cohesionCollapse) endReason = 'legion_disbands';
    else if (g.legionMorale  <= CFG.moraleCollapse)   endReason = 'legion_disbands';
    else if (g.crowdSize <= CFG.crowdRoutSize && g.crowdPressure <= CFG.crowdRoutPressure) endReason = 'crowd_routs';
    else if (g._firedOnCrowd) endReason = 'fired_on_crowd';
    else if (g.beatNumber >= g.beatsTotal) endReason = 'timeout';

    return endTurn(g, legionLog, crowdLog, endReason ? { reason: endReason } : null);
  }

  function endTurn(g, legionLog, crowdLog, terminal) {
    var beatRecord = {
      beat: g.beatNumber,
      legion: g.lastLegionOrder || null,
      crowd: g.lastCrowdOrder || null,
      legionLog: legionLog,
      crowdLog: crowdLog
    };
    g.turnHistory.push(beatRecord);
    g.lastResolution = {
      beat: g.beatNumber,
      legionLog: legionLog,
      crowdLog: crowdLog,
      ended: !!terminal
    };

    // Append to log
    for (var i = 0; i < legionLog.length; i++) g.log.push('L: ' + legionLog[i]);
    for (var j = 0; j < crowdLog.length; j++)  g.log.push('C: ' + crowdLog[j]);

    if (!terminal) {
      g.beatNumber++;
      g.phase = 'legion_turn';
      return { ok: true, ended: false };
    }

    // Terminal — decide outcome
    g.phase = 'resolved';
    g.result = decideOutcome(g, terminal);
    return { ok: true, ended: true, outcome: g.result.outcome };
  }

  function decideOutcome(g, terminal) {
    var reason = terminal.reason;

    // Legion fired on crowd
    if (reason === 'fired_on_crowd' || g._firedOnCrowd) {
      return {
        outcome: 'fired_on_crowd',
        beats: g.beatNumber,
        injuries: g.injuries,
        warningShotFired: g.warningShotFired,
        legionSize: g.legionSize,
        legionMorale: g.legionMorale,
        legionCohesion: g.legionCohesion,
        legionLoyalty: g.legionLoyalty,
        crowdPressure: g.crowdPressure
      };
    }

    // Legion refused to fire
    if (reason === 'legion_refused' || g._legionRefused) {
      return {
        outcome: 'legion_refused',
        beats: g.beatNumber,
        injuries: 0,
        warningShotFired: g.warningShotFired,
        legionSize: g.legionSize,
        legionMorale: g.legionMorale,
        legionCohesion: g.legionCohesion,
        legionLoyalty: g.legionLoyalty,
        crowdPressure: g.crowdPressure
      };
    }

    // Crowd stormed the building
    if (reason === 'crowd_breaks') {
      return {
        outcome: 'surge',
        beats: g.beatNumber,
        injuries: g.injuries,
        warningShotFired: g.warningShotFired,
        legionSize: g.legionSize,
        legionMorale: g.legionMorale,
        legionCohesion: g.legionCohesion,
        legionLoyalty: g.legionLoyalty,
        crowdPressure: g.crowdPressure
      };
    }

    // Legion disbanded
    if (reason === 'legion_disbands') {
      return {
        outcome: 'surge',   // reuses the defeat ending; zalgrilia.js still reads it
        beats: g.beatNumber,
        injuries: g.injuries,
        warningShotFired: g.warningShotFired,
        legionSize: g.legionSize,
        legionMorale: g.legionMorale,
        legionCohesion: g.legionCohesion,
        legionLoyalty: g.legionLoyalty,
        crowdPressure: g.crowdPressure,
        _legionDisbanded: true
      };
    }

    // Crowd went home
    if (reason === 'crowd_routs') {
      return {
        outcome: 'peaceful',
        beats: g.beatNumber,
        injuries: g.injuries,
        warningShotFired: g.warningShotFired,
        legionSize: g.legionSize,
        legionMorale: g.legionMorale,
        legionCohesion: g.legionCohesion,
        legionLoyalty: g.legionLoyalty,
        crowdPressure: g.crowdPressure
      };
    }

    // Timeout — whoever is winning the moment
    if (g.injuries > 0) {
      return {
        outcome: 'injured',
        beats: g.beatNumber,
        injuries: g.injuries,
        warningShotFired: g.warningShotFired,
        legionSize: g.legionSize,
        legionMorale: g.legionMorale,
        legionCohesion: g.legionCohesion,
        legionLoyalty: g.legionLoyalty,
        crowdPressure: g.crowdPressure
      };
    }
    if (g.crowdPressure < 60) {
      return {
        outcome: 'peaceful',
        beats: g.beatNumber,
        injuries: 0,
        warningShotFired: g.warningShotFired,
        legionSize: g.legionSize,
        legionMorale: g.legionMorale,
        legionCohesion: g.legionCohesion,
        legionLoyalty: g.legionLoyalty,
        crowdPressure: g.crowdPressure
      };
    }
    return {
      outcome: 'surge',
      beats: g.beatNumber,
      injuries: g.injuries,
      warningShotFired: g.warningShotFired,
      legionSize: g.legionSize,
      legionMorale: g.legionMorale,
      legionCohesion: g.legionCohesion,
      legionLoyalty: g.legionLoyalty,
      crowdPressure: g.crowdPressure
    };
  }

  function findOrder(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  // Legacy stub — callers in old code sometimes still invoke this.
  function update(g, dt) { /* turn-based now; nothing to tick */ }

  return {
    CFG: CFG,
    LEGION_ORDERS: LEGION_ORDERS,
    CROWD_ORDERS: CROWD_ORDERS,
    newGame: newGame,
    pickCrowdOrder: pickCrowdOrder,
    resolveTurn: resolveTurn,
    update: update
  };
})();