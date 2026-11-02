// white_league.js — Independent White League mechanic.
// Triggered when IIA support is within 4% of BL support. IIA offers a
// permanent union with demands scaled by relations. On success, ZMP
// and IIA dissolve into WL (green / white / blue tricolor).
//
// Completely independent of the civil war module. Can fire anytime BL
// is roughly as strong as IIA, whether or not any war happened.
window.WhiteLeague = (function () {
  'use strict';

  // ------------------------------------------------------------
  // DEMANDS
  // Each demand is a concession the IIA extracts in exchange for
  // union. They scale by relations: high affinity = fewer demands.
  // ------------------------------------------------------------
  var DEMAND_POOL = [
    {
      id: 'dissolve_jihadist',
      text: 'Dissolve the Jihadist wing of the ZMP.',
      note: 'The IIA will not sign a permanent union while the Jihadist faction sits in your cabinet.',
      applies: function (st) { return st.faction === 'jihadists'; },
      effect: { unity: -10, spirit: -2, faculty: 5 },
      apply: function (st) { st.flags.jihadistWingDissolved = true; }
    },
    {
      id: 'cede_science',
      text: 'Cede the Science Block to IIA administration.',
      note: 'A physical concession. The IIA runs its own council there.',
      applies: function () { return true; },
      effect: { unity: -4, momentum: -2 }
    },
    {
      id: 'two_ministries',
      text: 'Pledge two cabinet ministries to the IIA in any future government.',
      note: 'A written promise. It will be published.',
      applies: function () { return true; },
      effect: { unity: -2 }
    },
    {
      id: 'joint_command',
      text: 'Place the Dzehurjaca Legion under joint ZMP-IIA command.',
      note: 'The Legion keeps its rifles. The IIA appoints its own political officer to the staff. Co-command, not disarmament.',
      applies: function (st) {
        return st.paramilitaries && st.paramilitaries.dzehurjaca &&
               st.paramilitaries.dzehurjaca.members > 0;
      },
      effect: { unity: -2, momentum: -1, faculty: 4 },
      apply: function (st) {
        st.flags.legionJointCommand = true;
        if (st.paramilitaries && st.paramilitaries.dzehurjaca) {
          st.paramilitaries.dzehurjaca.loyalty = Math.max(0,
            st.paramilitaries.dzehurjaca.loyalty - 10);
        }
      }
    },
    {
      id: 'renounce_bl',
      text: 'Publicly renounce all negotiation with the Black League.',
      note: 'A statement, signed and read aloud at the next council.',
      applies: function (st) { return (st.affinity.bl || 0) > 5; },
      effect: { affinity: { bl: -30 } }
    },
    {
      id: 'tech_policy',
      text: 'Adopt the IIA tech curriculum school-wide.',
      note: 'Programming, networking, and systems replace two years of general science.',
      applies: function () { return true; },
      effect: { faculty: -3, demo: { gamers: 5, honor: -2 } }
    },
    {
      id: 'league_amnesty',
      text: 'Grant amnesty to all former Black League members.',
      note: 'Every name on the League rolls erased from the record.',
      applies: function (st) { return st.blSplintered || st.blNeutralized; },
      effect: { unity: 3, faculty: -5 }
    },
    {
      id: 'whip_reform',
      text: 'Reform the ZMP whip system to allow IIA free votes.',
      note: 'IIA members of the merged party may vote against the leadership on tech and education bills.',
      applies: function () { return true; },
      effect: { unity: -3, faculty: 2 }
    },
    {
      id: 'transparency',
      text: 'Publish all party accounts quarterly.',
      note: 'The IIA will audit you. Their auditors are thorough and do not take tea.',
      applies: function () { return true; },
      effect: { funds: -15, faculty: 3 }
    },
    {
      id: 'no_civil_war_revanchism',
      text: 'Renounce all future claims to the valley.',
      note: 'A statement of borders. The IIA will hold you to it.',
      applies: function (st) { return !!(st.flags && st.flags.civilWarStarted); },
      effect: { unity: -2, affinity: { zpf: 5 } }
    }
  ];

  // ------------------------------------------------------------
  // ELIGIBILITY
  // Independent of any other module. Fires when IIA and BL are
  // within 4 points of each other and IIA is not trivial.
  // ------------------------------------------------------------
  function getPartySupport(st, pid) {
    if (!st || !st.partySupport) return 0;
    return st.partySupport[pid] || 0;
  }

  function isEligible(st) {
    if (!st) return false;
    if (st.finished) return false;
    if (st.flags && st.flags.wlFormed) return false;
    if (st.flags && st.flags.wlFailed) return false;
    if (st.whiteLeague && st.whiteLeague.active) return false;

    var iiaS = getPartySupport(st, 'iia');
    var blS  = getPartySupport(st, 'bl');

    // IIA must exist with at least some presence.
    if (iiaS < 3) return false;
    // BL must exist. If the BL is dead, no White League.
    if (blS < 3) return false;

    return Math.abs(iiaS - blS) <= 4;
  }

  // ------------------------------------------------------------
  // DEMAND COUNT — scales with affinity, not with the war.
  // ------------------------------------------------------------
  function demandCount(st) {
    var aff = (st.affinity && st.affinity.iia) || 50;
    if (aff >= 65) return 1;
    if (aff >= 45) return 2;
    return 3;
  }

  function buildDemands(st) {
    var pool = DEMAND_POOL.filter(function (d) {
      try { return d.applies(st); } catch (e) { return false; }
    });

    var n = demandCount(st);
    var picked = [];

    // Deterministic shuffle keyed off week + faction so the same
    // state always produces the same demands if reloaded.
    var seed = (st.week * 9301 + 49297) % 233280;
    if (st.faction) {
      for (var i = 0; i < st.faction.length; i++) {
        seed = (seed + st.faction.charCodeAt(i)) % 233280;
      }
    }
    function pickRng() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    while (picked.length < n && pool.length > 0) {
      var idx = Math.floor(pickRng() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  // ------------------------------------------------------------
  // EFFECTS
  // ------------------------------------------------------------
  function applyDemandEffect(st, d) {
    if (d.effect) {
      var eff = d.effect;
      if (eff.unity)    st.unity    = Math.max(0, Math.min(100, (st.unity || 60) + eff.unity));
      if (eff.faculty)  st.faculty  = Math.max(0, Math.min(100, (st.faculty || 50) + eff.faculty));
      if (eff.momentum) st.momentum = Math.max(-10, Math.min(20, (st.momentum || 0) + eff.momentum));
      if (eff.spirit)   st.spirit   = Math.max(0, Math.min(10, (st.spirit || 5) + eff.spirit));
      if (eff.funds)    st.funds    = Math.max(0, (st.funds || 0) + eff.funds);

      if (eff.affinity) {
        if (!st.affinity) st.affinity = {};
        for (var k in eff.affinity) {
          if (!eff.affinity.hasOwnProperty(k)) continue;
          st.affinity[k] = Math.max(0, Math.min(100, (st.affinity[k] || 50) + eff.affinity[k]));
        }
      }
      if (eff.demo && window.GameData && window.GameData.DEMOS) {
        if (!st.raw.ZMP) st.raw.ZMP = {};
        for (var dm in eff.demo) {
          if (!eff.demo.hasOwnProperty(dm)) continue;
          st.raw.ZMP[dm] = Math.max(0.5, (st.raw.ZMP[dm] || 0) + eff.demo[dm]);
        }
      }
    }
    if (typeof d.apply === 'function') {
      try { d.apply(st); } catch (e) {}
    }
  }

  // ------------------------------------------------------------
  // FORMATION
  // ------------------------------------------------------------
  function formWhiteLeague(st) {
    var D = window.GameData;
    if (!D || !D.PARTIES) return false;

    var exists = false;
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (D.PARTIES[i].id === 'WL') { exists = true; break; }
    }
    if (!exists) {
      D.PARTIES.push({
        id: 'WL',
        name: 'White League',
        short: 'WL',
        tag: 'WL',
        color: '#f0f0f0',
        flag: {
          pattern: 'vertical_tricolor',
          colors: ['#5fae3c', '#ffffff', '#2244dd'],
          emblem: '✦'
        },
        blurb: 'The union of the ZMP and the IIA. Green, white, blue. One flag, one league.',
        blurbs: {
          ZMP: 'The White League is the ZMP and the IIA, merged.',
          IIA: 'The White League is the IIA and the ZMP, merged.',
          BL:  'A cartel of moderates pretending to be a movement.',
          RED: 'The White League is what happens when you compromise with the centre.',
          ZPF: 'A new alliance. We will see how long it lasts.'
        },
        spirit: 5,
        gates: 5,
        coalition: 60,
        base: { athletes: 15, honor: 15, gamers: 20, arts: 12, freshmen: 15, seniors: 14, buskids: 12 }
      });
    }

    // Build the WL raw block by summing ZMP + IIA per demographic.
    var wlRaw = {};
    if (D.DEMOS) {
      for (var j = 0; j < D.DEMOS.length; j++) {
        var dmid = D.DEMOS[j].id;
        var zmpVal = (st.raw.ZMP && st.raw.ZMP[dmid]) || 0;
        var iiaVal = (st.raw.iia && st.raw.iia[dmid]) || 0;
        wlRaw[dmid] = Math.max(0.5, zmpVal + iiaVal);
      }
    }
    st.raw.WL = wlRaw;
    st.raw.wl = wlRaw;

    // Retire ZMP and IIA from the field.
    if (st.merged.indexOf('ZMP') === -1) st.merged.push('ZMP');
    if (st.merged.indexOf('iia') === -1) st.merged.push('iia');

    // The player now plays as WL.
    st.faction = 'WL';
    st.flags = st.flags || {};
    st.flags.wlFormed = true;
    st.flags.wlFormedWeek = st.week;
    st.whiteLeague.active = false;
    st.log.push('Week ' + st.week + ': THE WHITE LEAGUE IS FORMED. ZMP and IIA merge.');
    return true;
  }

  // ------------------------------------------------------------
  // NEGOTIATION STATE MACHINE
  // ------------------------------------------------------------
  function startNegotiation(st) {
    if (!isEligible(st)) {
      return { ok: false, msg: 'The IIA will not negotiate on these terms.' };
    }
    var demands = buildDemands(st);
    if (demands.length === 0) {
      return { ok: false, msg: 'The IIA has no demands to make.' };
    }
    st.whiteLeague = {
      active: true,
      startedWeek: st.week,
      demands: demands,
      accepted: [],
      rejected: [],
      currentIndex: 0,
      failed: false,
      completed: false
    };
    st.log.push('Week ' + st.week + ': White League negotiations begin. IIA demands: ' + demands.length + '.');
    return { ok: true, demands: demands };
  }

  function getPendingDemand(st) {
    if (!st.whiteLeague || !st.whiteLeague.active) return null;
    if (st.whiteLeague.failed || st.whiteLeague.completed) return null;
    var i = st.whiteLeague.currentIndex;
    if (i >= st.whiteLeague.demands.length) return null;
    return st.whiteLeague.demands[i];
  }

  function respond(st, accept) {
    var wl = st.whiteLeague;
    if (!wl || !wl.active) return { ok: false };
    var d = wl.demands[wl.currentIndex];
    if (!d) return { ok: false };

    if (accept) {
      wl.accepted.push(d.id);
      applyDemandEffect(st, d);
      wl.currentIndex += 1;

      if (wl.currentIndex >= wl.demands.length) {
        wl.completed = true;
        formWhiteLeague(st);
        return { ok: true, formed: true, demand: d };
      }
      return { ok: true, formed: false, demand: d };
    }

    wl.rejected.push(d.id);
    wl.failed = true;
    wl.active = false;
    st.flags = st.flags || {};
    st.flags.wlFailed = true;
    st.log.push('Week ' + st.week + ': White League talks failed — demand "' + d.text + '" refused.');
    return { ok: true, failed: true, demand: d };
  }

  // ------------------------------------------------------------
  // POST-FORMATION — after the BL threat fades, what next?
  // ------------------------------------------------------------
  function checkPostBlWeakness(st) {
    if (!st.flags || !st.flags.wlFormed) return false;
    if (st.flags.wlResolved) return false;
    var blS = getPartySupport(st, 'bl');
    if (blS >= 5) return false;
    return (st.week - st.flags.wlFormedWeek) > 6;
  }

  function dissolveBack(st) {
    var D = window.GameData;
    var wlRaw = st.raw.WL || st.raw.wl || {};
    if (D && D.DEMOS) {
      st.raw.ZMP = {};
      st.raw.iia = {};
      for (var i = 0; i < D.DEMOS.length; i++) {
        var dmid = D.DEMOS[i].id;
        var v = wlRaw[dmid] || 10;
        st.raw.ZMP[dmid] = v * 0.55;
        st.raw.iia[dmid] = v * 0.45;
      }
    }
    st.merged = st.merged.filter(function (x) { return x !== 'ZMP' && x !== 'iia'; });
    if (st.raw.WL) delete st.raw.WL;
    if (st.raw.wl) delete st.raw.wl;
    // Player returns to playing as the ZMP.
    st.faction = 'zalgrilian';
    st.flags.wlResolved = true;
    st.flags.wlDissolved = true;
    st.log.push('Week ' + st.week + ': The White League dissolves. ZMP and IIA reconstitute.');
  }

  function declareDictatorship(st) {
    st.flags.wlResolved = true;
    st.flags.wlDictatorship = true;
    st.finished = true;
    st.endingData = {
      ending: 'wl_dictatorship',
      title: 'The White Dictatorship',
      subtitle: 'The League rules alone.',
      endingNumber: 'Ending 80',
      body: 'The White League has declared itself the permanent government of the school. The council is dissolved. The opposition is banned.',
      story:
        'The League was formed to stop the Black League. It outlived the threat that made it. ' +
        'In the third week after the disbanding of the last League cell, the White League voted itself ' +
        'emergency powers. In the fifth week, it abolished the council. In the ninth week, it banned the ' +
        'ZPF, the Red Front, and the Red Bench. By the end of the year, the only political party in the ' +
        'school was the League, and the only history taught in its classrooms was the history of the League.',
      subending: 'Subending WL-A — The League Alone',
      detail: '<div class="stat"><span>Week</span><span class="v">' + st.week + '</span></div>',
      epilogue: 'The League governed for a generation. Whether it governed well is a question the textbooks answered by not asking it.'
    };
  }

  // ------------------------------------------------------------
  // PUBLIC API
  // ------------------------------------------------------------
  return {
    isEligible: isEligible,
    startNegotiation: startNegotiation,
    getPendingDemand: getPendingDemand,
    respond: respond,
    checkPostBlWeakness: checkPostBlWeakness,
    dissolveBack: dissolveBack,
    declareDictatorship: declareDictatorship,
    DEMAND_POOL: DEMAND_POOL
  };
})();