/* civil_war.js — The Second Zalgrilian Civil War
 *
 * State lives on st.civilWar. Ten territories. ZMP vs ZPF.
 * Weekly skirmishes, plus player actions from the action bar.
 *
 * Exposes window.CivilWar with:
 *   isActive(st), newWar(st), render(st), tick(st, rng),
 *   availableActions(st), act(st, actionId, target, rng), count(st)
 */
window.CivilWar = (function () {
  'use strict';

  function D() { return window.GameData; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var STATES = [
    { id: 'capital',   name: 'The Capital',       home: 'ZMP', x: 4, y: 3 },
    { id: 'nezle',     name: 'Nezle Valley',      home: 'ZPF', x: 1, y: 5 },
    { id: 'qualia',    name: 'Qualia',            home: 'ZPF', x: 2, y: 4 },
    { id: 'north',     name: 'Northern Marches',  home: 'ZPF', x: 4, y: 1 },
    { id: 'west',      name: 'Western Districts', home: 'ZMP', x: 2, y: 3 },
    { id: 'east',      name: 'Eastern Districts', home: 'ZMP', x: 6, y: 3 },
    { id: 'south',     name: 'Southern Plain',    home: 'ZMP', x: 4, y: 5 },
    { id: 'coast',     name: 'The Coast',         home: 'ZPF', x: 5, y: 1 },
    { id: 'border',    name: 'Border Towns',      home: 'ZPF', x: 1, y: 2 },
    { id: 'heartland', name: 'Heartland',         home: 'ZMP', x: 5, y: 4 }
  ];

  var ADJ = {
    capital:   ['west','east','south','heartland'],
    nezle:     ['border','qualia','west'],
    qualia:    ['nezle','west','south'],
    north:     ['border','capital','coast'],
    west:      ['capital','qualia','nezle','border','south'],
    east:      ['capital','heartland','coast','north'],
    south:     ['capital','west','qualia','heartland'],
    coast:     ['north','east','heartland'],
    border:    ['nezle','west','north'],
    heartland: ['capital','east','south','coast']
  };

  function isActive(st) {
    return !!(st && st.civilWar && st.civilWar.active);
  }

  function newWar(st) {
    st.civilWar = {
      active: true,
      weekStarted: st.week,
      states: {},
      morale: { ZMP: 60, ZPF: 60 },
      lastEvents: []
    };
    for (var i = 0; i < STATES.length; i++) {
      var s = STATES[i];
      st.civilWar.states[s.id] = {
        id: s.id,
        name: s.name,
        owner: s.home,
        strength: 10,
        control: s.home === 'ZMP' ? 100 : 0
      };
    }
    st.log.push('Week ' + st.week + ': The Second Zalgrilian Civil War begins.');
  }

  function stateDef(id) {
    for (var i = 0; i < STATES.length; i++) if (STATES[i].id === id) return STATES[i];
    return null;
  }

  function count(st) {
    if (!isActive(st)) return { zmp: 0, zpf: 0, contested: 0 };
    var zmp = 0, zpf = 0, contested = 0;
    for (var id in st.civilWar.states) {
      var s = st.civilWar.states[id];
      if (s.control >= 95) zmp++;
      else if (s.control <= 5) zpf++;
      else contested++;
    }
    return { zmp: zmp, zpf: zpf, contested: contested };
  }

  function rollAttack(st, fromId, toId, rng) {
    var from = st.civilWar.states[fromId];
    var to   = st.civilWar.states[toId];
    if (!from || !to) return { ok: false, msg: 'Bad target.' };
    if (from.owner !== 'ZMP') return { ok: false, msg: 'You do not own that state.' };
    if (ADJ[fromId].indexOf(toId) === -1) return { ok: false, msg: 'Not adjacent.' };
    if (to.owner === 'ZMP' && to.control > 95) return { ok: false, msg: 'Already yours.' };

    var atk = from.strength * (0.7 + rng() * 0.5);
    var def = to.strength * (0.7 + rng() * 0.5);
    if (atk > def) {
      var delta = 25 + Math.floor(rng() * 20);
      to.control = Math.max(0, to.control - delta);
      to.strength = Math.max(3, to.strength - 2);
      if (to.control <= 0) {
        to.owner = 'ZMP';
        to.control = 20;
        return { ok: true, msg: 'Captured ' + to.name + '!' };
      }
      return { ok: true, msg: 'Attack on ' + to.name + ' pushes the line back (-' + delta + ' control).' };
    } else {
      from.strength = Math.max(3, from.strength - 2);
      return { ok: true, msg: 'The attack on ' + to.name + ' is repulsed.' };
    }
  }

  function playerOffensive(st, targetId, rng) {
    if (!targetId) return ['No target.'];
    var parts = targetId.split('|');
    var fromId = parts[0], toId = parts[1];
    if (!toId) return ['Invalid target.'];
    var r = rollAttack(st, fromId, toId, rng);
    return [r.msg];
  }

  function playerReinforce(st, stateId) {
    var s = st.civilWar.states[stateId];
    if (!s) return ['Invalid state.'];
    if (s.owner !== 'ZMP') return ['You do not own that state.'];
    s.strength = Math.min(20, s.strength + 3);
    return [s.name + ' reinforced (strength ' + s.strength + ').'];
  }

  function playerFortify(st, stateId) {
    var s = st.civilWar.states[stateId];
    if (!s) return ['Invalid state.'];
    if (s.owner !== 'ZMP') return ['You do not own that state.'];
    s.strength = Math.min(20, s.strength + 2);
    st.civilWar.morale.ZMP = Math.min(100, st.civilWar.morale.ZMP + 5);
    return [s.name + ' fortified. Morale +5.'];
  }

  function playerPropaganda(st) {
    st.civilWar.morale.ZPF = Math.max(0, st.civilWar.morale.ZPF - 8);
    // Also tick control toward ZMP in all states marginally
    for (var id in st.civilWar.states) {
      var s = st.civilWar.states[id];
      if (s.owner === 'ZPF' && s.control < 50) s.control = Math.min(50, s.control + 3);
    }
    return ['Propaganda campaign erodes ZPF morale (-8).'];
  }

  function playerNegotiate(st, rng) {
    var c = count(st);
    if (c.zmp >= 6) {
      // ZMP ahead: ceasefire on our terms
      st.civilWar.active = false;
      st.civilWar.result = 'ZMP_victory';
      st.log.push('Week ' + st.week + ': Civil war ends. ZMP victory.');
      return ['Ceasefire signed. ZMP victory recognized.'];
    }
    if (rng() < 0.4) {
      st.civilWar.active = false;
      st.civilWar.result = 'status_quo';
      st.log.push('Week ' + st.week + ': Civil war ends. Status quo ante bellum.');
      return ['Ceasefire signed. The old borders are restored.'];
    }
    st.civilWar.morale.ZMP = Math.max(0, st.civilWar.morale.ZMP - 5);
    return ['ZPF refuses the ceasefire. Morale -5.'];
  }

  function availableActions(st) {
    var counts = count(st);
    var offensiveTargets = [];
    for (var id in st.civilWar.states) {
      var s = st.civilWar.states[id];
      if (s.owner !== 'ZMP') continue;
      var neighbours = ADJ[id] || [];
      for (var i = 0; i < neighbours.length; i++) {
        var nid = neighbours[i];
        var n = st.civilWar.states[nid];
        if (!n) continue;
        if (n.owner !== 'ZMP' || n.control < 95) {
          offensiveTargets.push({ from: id, to: nid });
        }
      }
    }
    var reinforceTargets = [];
    for (var id2 in st.civilWar.states) {
      if (st.civilWar.states[id2].owner === 'ZMP') {
        reinforceTargets.push({ id: id2 });
      }
    }

    return [
      { id: 'offensive', name: 'Launch Offensive', desc: 'Attack an adjacent state.', ap: 2, budget: 10, targets: offensiveTargets },
      { id: 'reinforce', name: 'Reinforce',        desc: 'Add strength to an owned state.', ap: 1, budget: 6, targets: reinforceTargets },
      { id: 'propaganda', name: 'Propaganda',      desc: 'Erode enemy morale.', ap: 1, budget: 8, targets: [] },
      { id: 'fortify', name: 'Fortify',            desc: 'Fortify an owned state. Morale +5.', ap: 1, budget: 5, targets: reinforceTargets },
      { id: 'negotiate', name: 'Propose Ceasefire', desc: 'Attempt to end the war.', ap: 2, budget: 0, targets: [] }
    ];
  }

  function act(st, actionId, target, rng) {
    if (!isActive(st)) return ['No war to act on.'];
    if (actionId === 'offensive')  return playerOffensive(st, target, rng);
    if (actionId === 'reinforce')  return playerReinforce(st, target);
    if (actionId === 'fortify')    return playerFortify(st, target);
    if (actionId === 'propaganda') return playerPropaganda(st);
    if (actionId === 'negotiate')  return playerNegotiate(st, rng);
    return ['Unknown action.'];
  }

  function tick(st, rng) {
    if (!isActive(st)) return [];
    var notes = [];

    // ZPF acts: attacks a neighbouring ZMP state
    for (var id in st.civilWar.states) {
      var s = st.civilWar.states[id];
      if (s.owner !== 'ZPF') continue;
      var neighbours = ADJ[id] || [];
      var targets = [];
      for (var i = 0; i < neighbours.length; i++) {
        var nid = neighbours[i];
        var n = st.civilWar.states[nid];
        if (n && n.owner === 'ZMP') targets.push(nid);
      }
      if (targets.length && rng() < 0.6) {
        var target = targets[Math.floor(rng() * targets.length)];
        var to = st.civilWar.states[target];
        var atk = s.strength * (0.7 + rng() * 0.5);
        var def = to.strength * (0.7 + rng() * 0.5) + (st.civilWar.morale.ZMP / 20);
        if (atk > def) {
          to.control = Math.max(0, to.control - (20 + Math.floor(rng() * 20)));
          to.strength = Math.max(3, to.strength - 2);
          if (to.control <= 0) {
            to.owner = 'ZPF';
            to.control = 80;
            notes.push('⚔️ ZPF captures ' + to.name + '!');
          } else {
            notes.push('⚔️ ZPF pushes back the line at ' + to.name + '.');
          }
        } else {
          s.strength = Math.max(3, s.strength - 1);
        }
      }
    }

    // Morale decay
    st.civilWar.morale.ZMP = Math.max(0, st.civilWar.morale.ZMP - 1);
    st.civilWar.morale.ZPF = Math.max(0, st.civilWar.morale.ZPF - 1);

    // Collapse conditions
    var c = count(st);
    if (c.zpf === 0) {
      st.civilWar.active = false;
      st.civilWar.result = 'ZMP_victory';
      notes.push('The war is over. The ZMP holds every province.');
      st.log.push('Week ' + st.week + ': Civil war ends. ZMP victory.');
    } else if (c.zmp === 0) {
      st.civilWar.active = false;
      st.civilWar.result = 'ZPF_victory';
      notes.push('The war is lost. The ZPF holds every province.');
      st.log.push('Week ' + st.week + ': Civil war ends. ZPF victory.');
      st.gameOver = true;
      st.endingData = {
        ending: 'civil_war_lost',
        title: 'The Zalian Republic',
        subtitle: 'The ZPF has won the war.',
        endingNumber: 'Ending CW',
        body: 'The ZPF declared for the Zalian Republic in the valley. The ZMP tried to hold. It could not. The capital has fallen.',
        story: 'The Zalian Republic is proclaimed from Nezle. The crown is abolished. The ZMP is dissolved. The school is not the school you knew.',
        subending: 'The Nezle Republic',
        detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
        epilogue: 'The Zalian Republic endures. The ZMP is remembered as the party that lost the civil war.'
      };
      st.finished = true;
    }

    return notes;
  }

  // Minimal render — the action overlay in ui.js does most of the work.
  function render(st) {
    if (!isActive(st)) {
      return '<h2 class="scene-title">Civil War</h2><p class="lead">The war has ended.</p>';
    }
    var html = '<h2 class="scene-title">The Second Zalgrilian Civil War</h2>';
    html += '<p class="lead">Week ' + st.week + '. The Zalian Republic holds the valley. You hold the capital. The country is divided.</p>';
    html += '<div class="result-box" style="padding:16px;">';
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">';
    for (var id in st.civilWar.states) {
      var s = st.civilWar.states[id];
      var color = s.owner === 'ZMP' ? '#5fae3c' : '#cc0000';
      var borderColor = s.owner === 'ZMP' ? '#5fae3c' : '#cc0000';
      var ctrlPct = s.owner === 'ZMP' ? s.control : (100 - s.control);
      html += '<div style="border:2px solid ' + borderColor + ';padding:10px;text-align:center;background:rgba(0,0,0,0.2);">';
      html += '<div style="font-family:var(--font-heading);font-weight:700;color:' + color + ';">' + s.name + '</div>';
      html += '<div style="font-size:0.8rem;color:#aaa;margin-top:4px;">' + s.owner + ' · ' + ctrlPct + '% control</div>';
      html += '<div class="meter" style="height:4px;margin-top:6px;"><i style="width:' + ctrlPct + '%;background:' + color + ';"></i></div>';
      html += '<div style="font-size:0.75rem;color:#888;margin-top:4px;">Strength ' + s.strength + '</div>';
      html += '</div>';
    }
    html += '</div></div>';
    html += '<p class="quiet" style="margin-top:14px;">Use the action bar at the bottom of the screen to take military action.</p>';
    return html;
  }

  return {
    isActive: isActive,
    newWar: newWar,
    render: render,
    tick: tick,
    availableActions: availableActions,
    act: act,
    count: count,
    STATES: STATES,
    ADJ: ADJ
  };
})();