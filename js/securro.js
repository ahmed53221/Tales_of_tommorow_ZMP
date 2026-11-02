// securro_siege.js — Securro-Zalgrilianist mini-game.
// The parliamentary path is impossible: Republia (semi-communist) refuses,
// and the remaining parties cannot reach 30/45 with the ZMP. The only
// route is the Dzehurjaca Legion. You surround the council chamber and
// demand the vote under duress. Win before the Legion breaks, or the
// faculty calls for outside intervention, or the siege runs out of time.
//
// Only available when Dzehurjaca is the strongest paramilitary.
window.SecurroSiege = (function () {
  'use strict';

  var CFG = {
    duration: 10,
    resistanceStart: 100,
    resistanceWin: 0,
    cohesionStart: 90,
    facultyStart: 0,
    facultyLoseAt: 100
  };

  var ACTIONS = [
    { id: 'tighten',   name: 'Tighten the siege',
      desc: 'More Legion in the corridor. −8–14 Resistance, −6–10 Cohesion, +8–12 Faculty pressure.' },
    { id: 'negotiate', name: 'Back-channel talks',
      desc: 'Peel off individual council members. −3–7 Resistance, −2 Cohesion, +2 Faculty.' },
    { id: 'example',   name: 'Arrest a resister',
      desc: 'Make an example. −15–23 Resistance, −12–18 Cohesion, +15–20 Faculty. Costs unity.' },
    { id: 'address',   name: 'Address the faculty',
      desc: 'Convince the teachers this is temporary. −12–18 Faculty pressure. Costs unity.' },
    { id: 'hold',      name: 'Hold the line',
      desc: 'Do nothing this turn. +2 Resistance, −2 Cohesion, +4 Faculty pressure.' }
  ];

  // ============================================================
  // ELIGIBILITY
  // ============================================================
  function canStart(st) {
    if (!st || st.faction !== 'securro') return false;
    if (!st.paramilitaries || !st.paramilitaries.dzehurjaca) return false;
    if (st.sec && (st.sec.active || st.sec.done)) return false;

    var E = window.Engine;
    var dz = st.paramilitaries.dzehurjaca;
    var dzStr = E && E.calculateParamilitaryStrength
      ? E.calculateParamilitaryStrength(dz)
      : dz.members * ((dz.training + dz.equipment) / 20) * (dz.morale / 100);

    var rivals = ['black_legion', 'iia_guard', 'red_militia'];
    for (var i = 0; i < rivals.length; i++) {
      var o = st.paramilitaries[rivals[i]];
      if (!o) continue;
      var oStr = E && E.calculateParamilitaryStrength
        ? E.calculateParamilitaryStrength(o)
        : o.members * ((o.training + o.equipment) / 20) * (o.morale / 100);
      if (oStr >= dzStr) return false;
    }
    return true;
  }

  // ============================================================
  // NEW GAME
  // ============================================================
  function newGame(st) {
    st.sec = {
      active: true,
      done: false,
      week: 0,
      resistance: CFG.resistanceStart,
      cohesion: CFG.cohesionStart,
      facultyPressure: CFG.facultyStart,
      arrested: 0,
      log: ['Week ' + st.week + ': The Legion surrounds the council chamber. The council does not disperse.']
    };
    return st.sec;
  }

  function getActions(st) {
    if (!st.sec || !st.sec.active) return [];
    return ACTIONS.slice();
  }

  // ============================================================
  // SUBMIT
  // ============================================================
  function submit(st, actionId, rng) {
    if (!st.sec || !st.sec.active) return { ok: false, msg: 'No siege active.' };
    var s = st.sec;

    if (actionId === 'tighten') {
      s.resistance -= 8 + rng() * 6;
      s.cohesion -= 6 + rng() * 4;
      s.facultyPressure += 8 + rng() * 4;
      s.log.push('Week ' + (st.week + s.week) + ': The Legion tightens the siege.');
    } else if (actionId === 'negotiate') {
      s.resistance -= 3 + rng() * 4;
      s.cohesion -= 2;
      s.facultyPressure += 2;
      s.log.push('Week ' + (st.week + s.week) + ': Back-channel talks with council members.');
    } else if (actionId === 'example') {
      s.resistance -= 15 + rng() * 8;
      s.cohesion -= 12 + rng() * 6;
      s.facultyPressure += 15 + rng() * 5;
      s.arrested++;
      st.unity = clamp(st.unity - 3, 0, 100);
      s.log.push('Week ' + (st.week + s.week) + ': A council member is arrested.');
    } else if (actionId === 'address') {
      s.facultyPressure -= 12 + rng() * 6;
      s.resistance -= 2;
      st.unity = clamp(st.unity - 5, 0, 100);
      s.log.push('Week ' + (st.week + s.week) + ': The Marshal addresses the faculty.');
    } else if (actionId === 'hold') {
      s.resistance += 2;
      s.cohesion -= 2;
      s.facultyPressure += 4;
      s.log.push('Week ' + (st.week + s.week) + ': The Legion holds position.');
    } else {
      return { ok: false, msg: 'Unknown action.' };
    }

    s.resistance      = clamp(s.resistance, 0, 150);
    s.cohesion        = clamp(s.cohesion, 0, 100);
    s.facultyPressure = clamp(s.facultyPressure, 0, 150);

    s.week++;
    s.cohesion -= 1;              // passive cohesion drain
    s.facultyPressure += 2;       // passive faculty pressure

    return checkOutcome(st);
  }

  // ============================================================
  // OUTCOME
  // ============================================================
  function checkOutcome(st) {
    var s = st.sec;

    if (s.resistance <= CFG.resistanceWin) {
      s.active = false; s.done = true;
      return { ok: true, outcome: {
        outcome: 'guided_democracy', week: s.week,
        resistance: 0, cohesion: Math.round(s.cohesion), arrested: s.arrested
      }};
    }
    if (s.cohesion <= 0) {
      s.active = false; s.done = true;
      return { ok: true, outcome: {
        outcome: 'legion_goes_home', week: s.week,
        resistance: Math.round(s.resistance), cohesion: 0, arrested: s.arrested
      }};
    }
    if (s.facultyPressure >= CFG.facultyLoseAt) {
      s.active = false; s.done = true;
      return { ok: true, outcome: {
        outcome: 'faculty_intervention', week: s.week,
        resistance: Math.round(s.resistance), cohesion: Math.round(s.cohesion), arrested: s.arrested
      }};
    }
    if (s.week >= CFG.duration) {
      s.active = false; s.done = true;
      return { ok: true, outcome: {
        outcome: 'siege_lifted', week: s.week,
        resistance: Math.round(s.resistance), cohesion: Math.round(s.cohesion), arrested: s.arrested
      }};
    }
    return { ok: true };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function isActive(st) { return !!(st && st.sec && st.sec.active); }

  return {
    CFG: CFG, ACTIONS: ACTIONS,
    canStart: canStart, newGame: newGame,
    getActions: getActions, submit: submit, isActive: isActive
  };
})();