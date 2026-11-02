// hover.js — HOI4-style hover cards, with PNG flags and perspective blurbs.
//
// Any element with a `data-hover` attribute gets a floating card on
// mouseover. Types:
//
//   data-hover="party"            data-pid="ZMP"
//   data-hover="advisor"          data-advisor="bojkanic"
//   data-hover="trait"            data-trait="silent_workhorse"
//   data-hover="faction"          data-fid="securro"
//   data-hover="ministerFaction"  data-mfid="gamers"
//   data-hover="stat"             data-stat="unity" data-val="72"
//
// Party flags: if the party has a `flagImg` field (e.g. 'img/bl.png'),
// the card renders that PNG. If not, or if the PNG 404s, it falls back
// to a built-in SVG pattern generated from the party's `flag` object.
//
// Perspective blurbs: cards read the local player's faction from
// window.UI or window.EngineMP and pick the matching blurb from the
// party's `blurbs` map. Missing keys fall back to the neutral `blurb`.
//
// Exposes: window.Hover
(function () {
  'use strict';

  var D = window.GameData || {};
  var viewerFaction = null;

  // ============================================================
  // CARD ROOT + POSITIONING
  // ============================================================
  var card = null;
  var currentEl = null;
  var showTimer = null;
  var HIDE_DELAY = 60;
  var SHOW_DELAY = 180;

  function ensureCard() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'hover-card';
    card.style.display = 'none';
    document.body.appendChild(card);
    return card;
  }

  function positionCard(el) {
    var c = ensureCard();
    var rect = el.getBoundingClientRect();
    var cw = c.offsetWidth  || 300;
    var ch = c.offsetHeight || 140;

    var x = rect.right + 10;
    var y = rect.top;

    if (x + cw > window.innerWidth - 10) x = rect.left - cw - 10;
    if (y + ch > window.innerHeight - 10) y = window.innerHeight - ch - 10;
    if (y < 10) y = 10;
    if (x < 10) x = 10;

    c.style.left = x + 'px';
    c.style.top  = y + 'px';
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fmtEffect(key, val) {
    if (val === undefined || val === null) return '';
    var sign = (val > 0) ? '+' : '';
    var color = (val > 0) ? '#7fdf7f' : '#ff7070';
    var map = {
      unity: 'Unity', faculty: 'Faculty', momentum: 'Momentum',
      funds: 'Funds', volunteers: 'Volunteers',
      spirit: 'Spirit', gates: 'Gates',
      affinity: 'Relations', support: 'Support',
      influence: 'Influence', dissident: 'Dissident',
      research: 'Research', construction: 'Construction'
    };
    return '<div class="hc-effect" style="color:' + color + ';">' +
      esc(map[key] || key) + ' ' + sign + val + '</div>';
  }

  // Read the local player's faction, if any.
  function detectViewerFaction() {
    if (viewerFaction) return viewerFaction;

    // Single-player: UI.getState().faction
    if (window.UI && window.UI.getState) {
      var st = window.UI.getState();
      if (st && st.faction) {
        viewerFaction = String(st.faction).toUpperCase();
        return viewerFaction;
      }
    }
    // Multiplayer: EngineMP.getState() + Multiplayer.amHost()
    if (window.EngineMP && window.EngineMP.getState) {
      var mst = window.EngineMP.getState();
      if (mst && mst.players && window.Multiplayer) {
        var isHost = window.Multiplayer.amHost && window.Multiplayer.amHost();
        var idx = isHost ? 0 : 1;
        if (mst.players[idx] && mst.players[idx].factionId) {
          viewerFaction = String(mst.players[idx].factionId).toUpperCase();
          return viewerFaction;
        }
      }
    }
    return null;
  }

  // ============================================================
  // FLAG RENDERING — PNG first, SVG fallback
  // ============================================================
  function buildFlag(flag, flagImg, w, h) {
    w = w || 60;
    h = h || 40;

    if (flagImg) {
      return '<img src="' + esc(flagImg) + '" alt="" class="hc-flag" ' +
        'style="width:' + w + 'px;height:' + h + 'px;object-fit:cover;' +
        'border:1px solid rgba(255,255,255,0.15);border-radius:2px;' +
        'background:#0a0a0a;display:block;" ' +
        'onerror="this.style.display=\'none\';' +
        'if(this.nextElementSibling)this.nextElementSibling.style.display=\'block\';">' +
        '<div style="display:none;">' + svgFlag(flag, w, h) + '</div>';
    }
    return svgFlag(flag, w, h);
  }

  function svgFlag(flag, w, h) {
    w = w || 60;
    h = h || 40;
    var colors = (flag && flag.colors) || ['#888'];
    var pattern = (flag && flag.pattern) || 'solid';

    var svg = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 60 40" ' +
      'xmlns="http://www.w3.org/2000/svg" class="hc-flag" ' +
      'style="border:1px solid rgba(255,255,255,0.15);border-radius:2px;display:block;">';
    svg += '<rect width="60" height="40" fill="' + colors[0] + '"/>';

    if (pattern === 'tricolor' && colors.length >= 3) {
      svg += '<rect y="13" width="60" height="14" fill="' + colors[1] + '"/>';
      svg += '<rect y="27" width="60" height="13" fill="' + colors[2] + '"/>';
    } else if (pattern === 'bicolor' && colors.length >= 2) {
      svg += '<rect y="20" width="60" height="20" fill="' + colors[1] + '"/>';
    } else if (pattern === 'vertical_tricolor' && colors.length >= 3) {
      svg += '<rect x="20" width="20" height="40" fill="' + colors[1] + '"/>';
      svg += '<rect x="40" width="20" height="40" fill="' + colors[2] + '"/>';
    } else if (pattern === 'cross' && colors.length >= 2) {
      svg += '<rect x="24" width="12" height="40" fill="' + colors[1] + '"/>';
      svg += '<rect y="14" width="60" height="12" fill="' + colors[1] + '"/>';
    } else if (pattern === 'diagonal' && colors.length >= 2) {
      svg += '<polygon points="0,0 60,0 0,40" fill="' + colors[1] + '"/>';
    } else if (pattern === 'star' && colors.length >= 2) {
      svg += '<polygon points="30,8 33,17 42,17 35,23 38,32 30,26 22,32 25,23 18,17 27,17" fill="' + colors[1] + '"/>';
    } else if (pattern === 'canton' && colors.length >= 2) {
      svg += '<rect width="24" height="20" fill="' + colors[1] + '"/>';
    }

    if (flag && flag.emblem) {
      svg += '<text x="30" y="26" text-anchor="middle" font-size="15" ' +
        'fill="#ffffff" style="text-shadow:0 0 3px rgba(0,0,0,0.9);">' +
        flag.emblem + '</text>';
    }
    svg += '</svg>';
    return svg;
  }

  // ============================================================
  // PARTY CARD
  // ============================================================
  function pickBlurb(p) {
    var vf = detectViewerFaction();
    if (p.blurbs && vf && p.blurbs[vf]) return p.blurbs[vf];
    return p.blurb || '';
  }

  function findParty(pid) {
    if (!D || !D.PARTIES) return null;
    var u = String(pid).toUpperCase();
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (String(D.PARTIES[i].id).toUpperCase() === u) return D.PARTIES[i];
    }
    return null;
  }

  function buildPartyCard(pid) {
    var p = findParty(pid);
    if (!p) return '';

    // Live support
    var liveSupport = null;
    var st = (window.UI && window.UI.getState) ? window.UI.getState()
           : (window.EngineMP && window.EngineMP.getState ? window.EngineMP.getState() : null);
    if (st) {
      if (st.partySupport && st.partySupport[pid] !== undefined) {
        liveSupport = st.partySupport[pid];
      } else if (st.totals && st.totals[pid] !== undefined) {
        liveSupport = st.totals[pid];
      }
    }

    var color = (String(p.id).toUpperCase() === 'ZPF') ? '#006400' : (p.color || '#888');
    var vf = detectViewerFaction();
    var isUs = vf && String(p.id).toUpperCase() === vf;

    var html = '';
    html += '<div class="hc-flag-row">';
    html += buildFlag(p.flag, p.flagImg, 60, 40);
    html += '<div class="hc-flag-meta">';
    html += '<div class="hc-title" style="color:' + color + ';">' +
      esc(p.name || p.id) + '</div>';
    html += '<div class="hc-subtitle">' + esc(p.short || p.id) +
      (isUs ? ' · <span style="color:#7fdf7f;font-weight:700;">THIS IS US</span>' : '') +
      '</div>';
    html += '</div>';
    html += '</div>';

    var blurb = pickBlurb(p);
    if (blurb) {
      html += '<div class="hc-body">' + esc(blurb) + '</div>';
    }

    html += '<div class="hc-divider"></div>';

    if (typeof p.spirit === 'number') {
      html += '<div class="hc-line"><span>Spirit</span><span>' + p.spirit + '/10</span></div>';
    }
    if (typeof p.gates === 'number') {
      html += '<div class="hc-line"><span>Gates</span><span>' + p.gates + '/10</span></div>';
    }
    if (typeof p.coalition === 'number') {
      html += '<div class="hc-line"><span>Base coalition</span><span>' + p.coalition + '%</span></div>';
    }
    if (liveSupport !== null) {
      html += '<div class="hc-line"><span>Current support</span>' +
        '<span style="color:#7fdcff;">' + Math.round(liveSupport * 10) / 10 + '%</span></div>';
    }
    return html;
  }

  // ============================================================
  // ADVISOR CARD
  // ============================================================
  function buildAdvisorCard(id) {
    if (!D || !D.ADVISORS) return '';
    var a = null;
    for (var i = 0; i < D.ADVISORS.length; i++) {
      if (D.ADVISORS[i].id === id) { a = D.ADVISORS[i]; break; }
    }
    if (!a) return '';

    var html = '';
    html += '<div class="hc-header" style="border-color:#7fdcff;">';
    html += '<span class="hc-title">' + esc(a.name) + '</span>';
    html += '</div>';
    html += '<div class="hc-subtitle">' + esc(a.role || 'Advisor') + '</div>';
    if (a.desc) {
      html += '<div class="hc-body">' + esc(a.desc) + '</div>';
    }
    if (a.bonus) {
      html += '<div class="hc-divider"></div>';
      html += '<div class="hc-section">EFFECTS</div>';
      for (var k in a.bonus) html += fmtEffect(k, a.bonus[k]);
    }
    if (a.traits && a.traits.length) {
      html += '<div class="hc-divider"></div>';
      html += '<div class="hc-section">TRAITS</div>';
      for (var t = 0; t < a.traits.length; t++) {
        var tr = D.TRAITS && D.TRAITS[a.traits[t]];
        if (!tr) continue;
        html += '<div class="hc-trait" data-hover="trait" data-trait="' + a.traits[t] + '">';
        html += '<span class="hc-trait-icon">' + (tr.icon || '▪') + '</span>';
        html += '<span class="hc-trait-name">' + esc(tr.name) + '</span>';
        html += '</div>';
      }
    }
    return html;
  }

  // ============================================================
  // TRAIT CARD
  // ============================================================
  function buildTraitCard(id) {
    if (!D || !D.TRAITS) return '';
    var t = D.TRAITS[id];
    if (!t) return '';

    var html = '';
    html += '<div class="hc-header" style="border-color:#c8a860;">';
    html += '<span class="hc-trait-icon">' + (t.icon || '▪') + '</span>';
    html += '<span class="hc-title">' + esc(t.name) + '</span>';
    html += '</div>';
    if (t.desc) {
      html += '<div class="hc-body">' + esc(t.desc) + '</div>';
    }
    if (t.effects) {
      html += '<div class="hc-divider"></div>';
      html += '<div class="hc-section">EFFECTS</div>';
      for (var k in t.effects) html += fmtEffect(k, t.effects[k]);
    }
    return html;
  }

  // ============================================================
  // FACTION CARD
  // ============================================================
  function buildFactionCard(fid) {
    if (!D || !D.FACTIONS) return '';
    var f = null;
    for (var i = 0; i < D.FACTIONS.length; i++) {
      if (D.FACTIONS[i].id === fid) { f = D.FACTIONS[i]; break; }
    }
    if (!f) return '';

    var html = '';
    html += '<div class="hc-header" style="border-color:#5fae3c;">';
    html += '<span class="hc-title">' + esc(f.name) + '</span>';
    html += '</div>';
    if (f.line) {
      html += '<div class="hc-subtitle">' + esc(f.line) + '</div>';
    }
    if (f.desc) {
      html += '<div class="hc-body">' + esc(f.desc) + '</div>';
    }
    html += '<div class="hc-divider"></div>';
    if (typeof f.spirit === 'number') {
      html += '<div class="hc-line"><span>Spirit</span><span>' + f.spirit + '/10</span></div>';
    }
    if (typeof f.gates === 'number') {
      html += '<div class="hc-line"><span>Gates</span><span>' + f.gates + '/10</span></div>';
    }
    if (typeof f.unity === 'number') {
      html += '<div class="hc-line"><span>Unity modifier</span><span>' + f.unity + '</span></div>';
    }
    return html;
  }

  // ============================================================
  // MINISTER FACTION CARD (ZMP internal factions)
  // ============================================================
  function buildMinisterFactionCard(fid) {
    if (!D || !D.MINISTER_FACTIONS) return '';
    var f = D.MINISTER_FACTIONS[fid];
    if (!f) return '';

    var html = '';
    html += '<div class="hc-header" style="border-color:' + f.color + ';">';
    html += '<span class="hc-title" style="color:' + f.color + ';">' + esc(f.name) + '</span>';
    html += '</div>';
    if (f.blurb) {
      html += '<div class="hc-body">' + esc(f.blurb) + '</div>';
    }

    var st = (window.UI && window.UI.getState) ? window.UI.getState()
           : (window.EngineMP && window.EngineMP.getState ? window.EngineMP.getState() : null);
    if (st && st.factionInfluence && st.factionInfluence[fid] !== undefined) {
      html += '<div class="hc-divider"></div>';
      html += '<div class="hc-line"><span>Influence</span>' +
        '<span style="color:#7fdcff;">' + Math.round(st.factionInfluence[fid]) + '</span></div>';
      var diss = (st.factionDissident && st.factionDissident[fid]) || 0;
      html += '<div class="hc-line"><span>Dissident</span>' +
        '<span style="color:' + (diss > 50 ? '#ff7070' : '#ffcc00') + ';">' +
        Math.round(diss) + '</span></div>';
    }
    return html;
  }

  // ============================================================
  // STAT CARD
  // ============================================================
  function buildStatCard(key, val) {
    var d = {
      unity: 'How well the party holds together. Below 40, support bleeds. Above 70, extra AP.',
      faculty: 'Faculty tolerance. Below 25, you lose an action point.',
      momentum: 'Multiplies your actions. High momentum makes everything land harder.',
      funds: 'Campaign treasury. Spent on rallies, flyers, and paramilitaries.',
      volunteers: 'Organisers and canvassers. More volunteers scales most actions.',
      spirit: 'Spirit maximalism. Pushes the party toward enthusiasm and spectacle.',
      gates: 'Gate closure. Pushes the party toward isolationism and exclusion.'
    };
    var html = '';
    html += '<div class="hc-header" style="border-color:#7fdcff;">';
    html += '<span class="hc-title">' + esc(key.charAt(0).toUpperCase() + key.slice(1)) + '</span>';
    html += '</div>';
    html += '<div class="hc-subtitle">Current: ' + esc(val) + '</div>';
    if (d[key]) {
      html += '<div class="hc-body">' + esc(d[key]) + '</div>';
    }
    return html;
  }

  // ============================================================
  // DISPATCH
  // ============================================================
  function buildCard(type, data) {
    if (type === 'party')           return buildPartyCard(data.pid);
    if (type === 'advisor')         return buildAdvisorCard(data.advisor);
    if (type === 'trait')           return buildTraitCard(data.trait);
    if (type === 'faction')         return buildFactionCard(data.fid);
    if (type === 'ministerFaction') return buildMinisterFactionCard(data.mfid);
    if (type === 'stat')            return buildStatCard(data.stat, data.val);
    return '';
  }

  // ============================================================
  // SHOW / HIDE / EVENTS
  // ============================================================
  function showCard(el) {
    var type = el.getAttribute('data-hover');
    var data = {
      pid:     el.getAttribute('data-pid'),
      advisor: el.getAttribute('data-advisor'),
      trait:   el.getAttribute('data-trait'),
      fid:     el.getAttribute('data-fid'),
      mfid:    el.getAttribute('data-mfid'),
      stat:    el.getAttribute('data-stat'),
      val:     el.getAttribute('data-val')
    };
    var html = buildCard(type, data);
    if (!html) return;

    var c = ensureCard();
    c.innerHTML = html;
    c.style.display = 'block';
    positionCard(el);
    currentEl = el;
  }

  function hideCard() {
    if (!card) return;
    card.style.display = 'none';
    currentEl = null;
  }

  function attach() {
    document.body.addEventListener('mouseover', function (e) {
      var el = e.target.closest && e.target.closest('[data-hover]');
      if (!el) {
        if (currentEl) {
          clearTimeout(showTimer);
          showTimer = setTimeout(hideCard, HIDE_DELAY);
        }
        return;
      }
      if (el === currentEl) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(function () { showCard(el); }, SHOW_DELAY);
    });

    document.body.addEventListener('mouseout', function (e) {
      var el = e.target.closest && e.target.closest('[data-hover]');
      if (!el) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(hideCard, HIDE_DELAY);
    });

    window.addEventListener('scroll', hideCard, true);
    document.body.addEventListener('click', hideCard);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  window.Hover = {
    attach: attach,
    hide: hideCard,
    show: showCard,

    setViewerFaction: function (fid) {
      viewerFaction = fid ? String(fid).toUpperCase() : null;
    },
    getViewerFaction: function () { return detectViewerFaction(); },

    // Convenience wrappers for building HTML elsewhere.
    wrapParty: function (pid, label) {
      return '<span data-hover="party" data-pid="' + esc(pid) +
        '" style="cursor:help;">' + (label || esc(pid)) + '</span>';
    },
    wrapAdvisor: function (id, label) {
      return '<span data-hover="advisor" data-advisor="' + esc(id) +
        '" style="cursor:help;">' + (label || esc(id)) + '</span>';
    },
    wrapFaction: function (fid, label) {
      return '<span data-hover="faction" data-fid="' + esc(fid) +
        '" style="cursor:help;">' + (label || esc(fid)) + '</span>';
    },
    wrapMinisterFaction: function (mfid, label) {
      return '<span data-hover="ministerFaction" data-mfid="' + esc(mfid) +
        '" style="cursor:help;">' + (label || esc(mfid)) + '</span>';
    },
    wrapStat: function (key, val, label) {
      return '<span data-hover="stat" data-stat="' + esc(key) +
        '" data-val="' + esc(val) + '" style="cursor:help;">' +
        (label || esc(key)) + '</span>';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();