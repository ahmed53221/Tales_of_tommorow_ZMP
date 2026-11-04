/*
 * UI layer: scene rendering, side panels, D3 visuals.
 */
var UI = (function () {
  'use strict';

  var D = window.GameData;
  var E = window.Engine;

  var st = null;
  var scene = 'title';
  var tab = 'poll';
  var pending = null;
  var pendingMinistry = null;
  var lastEnding = null;
  var seed = (Date.now() % 2147483647) || 12345;

  function rng() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  function $(id) { return document.getElementById(id); }



  
  
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  function party(id) {
    if (!D || !D.PARTIES) return null;
    for (var i = 0; i < D.PARTIES.length; i++) {
      if (D.PARTIES[i].id === id) return D.PARTIES[i];
    }
    return null;
  }

    function coloredPartyName(id) {
    var p = party(id);
    if (!p) return id;
    return '<span class="party-' + id.toLowerCase() + '">' + esc(p.short || id) + '</span>';
  }
  
  function faction(id) {
    if (!D || !D.FACTIONS) return null;
    for (var i = 0; i < D.FACTIONS.length; i++) {
      if (D.FACTIONS[i].id === id) return D.FACTIONS[i];
    }
    return null;
  }
  
  function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  // Renders a party flag as a small inline SVG-styled span so no PNG is needed.
  function partyFlagHtml(p) {
    if (!p || !p.flag) return '';
    var colors = p.flag.colors || ['#888', '#fff'];
    var bg = colors[0];
    var fg = colors[1] || '#fff';
    var glyph = p.flag.emblem || '';
    return '<span class="party-flag" style="display:inline-block;width:16px;height:11px;' +
      'background:linear-gradient(90deg,' + bg + ' 0 50%,' + fg + ' 50% 100%);' +
      'border:1px solid #333;vertical-align:middle;margin-right:5px;' +
      'font-size:9px;line-height:11px;text-align:center;color:#000;overflow:hidden;">' +
      glyph + '</span>';
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

    function initPartyColorizer() {
    var partyRegex = /\b(ZMP|IIA|ZPF|REP|SPT|SEMP|RED|RB|PL|BL)\b/gi;
    var classes = {
      "ZMP": "party-zmp", "IIA": "party-iia", "ZPF": "party-zpf", 
      "REP": "party-rep", "SPT": "party-spt", "SEMP": "party-semp", 
      "RED": "party-red", "RB": "party-rb", "PL": "party-pl", "BL": "party-bl"
    };

    function colorizeTextNodes(node) {
      if (node.nodeType === 3) { 
        var text = node.nodeValue;
        partyRegex.lastIndex = 0;
        if (partyRegex.test(text)) {
          var fragment = document.createDocumentFragment();
          var lastIndex = 0;
          var match;
          
          partyRegex.lastIndex = 0;
          while ((match = partyRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
              fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
            }
            var span = document.createElement('span');
            span.className = classes[match[0].toUpperCase()];
            span.textContent = match[0];
            fragment.appendChild(span);
            lastIndex = partyRegex.lastIndex;
          }
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }
          node.parentNode.replaceChild(fragment, node);
        }
      } 
      else if (node.nodeType === 1 && !['SCRIPT', 'STYLE', 'TEXTAREA', 'CANVAS', 'svg', 'SVG'].includes(node.tagName)) {
        if (node.className && typeof node.className === 'string' && node.className.indexOf('party-') !== -1) return;
        var children = Array.from(node.childNodes);
        for (var i = 0; i < children.length; i++) {
          colorizeTextNodes(children[i]);
        }
      }
    }

    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          colorizeTextNodes(node);
        });
      });
    });

    ['main', 'right-body', 'status', 'log'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el, { childList: true, subtree: true });
    });
  }

  var api = {};

  api.boot = function () {
    scene = 'title';
    tab = 'poll';
    st = null;
    initPartyColorizer();
    renderAll();
  };

  api.go = function (s) {
    scene = s;
    pending = null;
    renderAll();
  };

  function loadAchievementsDB() {
    try {
      var raw = localStorage.getItem('classCouncil_achievements');
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {};
  }

  function isAchievementUnlocked(id) {
    var db = loadAchievementsDB();
    return !!db[id];
  }

  function saveAchievementsToDB(st) {
    if (!st) return;
    try {
      var current = E.checkAchievements(st);
      var db = loadAchievementsDB();
      var changed = false;

      current.forEach(function(a) {
        if (a.unlocked && !db[a.id]) {
          db[a.id] = { unlocked: true, unlockedAt: Date.now() };
          changed = true;
          console.log(' Achievement Unlocked: ' + a.name);
        }
      });

      if (changed) {
        localStorage.setItem('classCouncil_achievements', JSON.stringify(db));
      }
    } catch(e) {}
  }

  api.showBriefing = function () {
    if (scene === 'briefing') return;
    api._returnScene = scene;
    scene = 'briefing';
    renderAll();
  };

  api.backFromBriefing = function () {
    scene = api._returnScene || (st ? 'week' : 'title');
    renderAll();
  };

  api.drawPresidentialCard = function() {
    if (!st || !st.hasPresident) {
      toast('No president!');
      return;
    }
    
    var result = E.drawPresidentialCard(st, rng);
    if (!result.ok) {
      toast(result.msg);
      return;
    }
    
    var card = result.card;
    if (!st.presidentialCards) st.presidentialCards = [];
    st.presidentialCards.push({
      id: card.id,
      name: card.name,
      desc: card.desc,
      week: st.week
    });
    
    st.pendingPresidentialCard = card;
    scene = 'presidential_card';
    renderAll();
  };

  function checkAutoSave() {
    try {
      var raw = localStorage.getItem('classCouncil_save_auto');
      if (raw) {
        var saveData = JSON.parse(raw);
        if (saveData && saveData.week) {
          console.log('💾 Auto-save found from Week ' + saveData.week);
          return saveData;
        }
      }
    } catch(e) {}
    return null;
  }

  var autoSaveData = checkAutoSave();

  api.executePresidentialCard = function(actionId) {
    var notes = E.executePresidentialAction(st, actionId, rng);
    notes.forEach(function(n) { toast(n); });
    st.pendingPresidentialCard = null;
    scene = 'week';
    renderAll();
  };

  api.pickFaction = function (fid) {
    st = E.newState(fid);
    var f = faction(fid);
    if (f) {
      st.log.push('Faction chosen: ' + f.name + '.');
      toast(f.name + ' takes the middle of the party.');
    }
    scene = 'week';
    renderAll();
  };

  api.viewMinistry = function(ministryId) {
    scene = 'ministry';
    pendingMinistry = ministryId;
    renderAll();
  };

  api.callElection = function() {
    if (!st.hasPresident) {
      toast('No president to call elections!');
      return;
    }
    
    if (st.week < 25) {
      toast('Cannot call elections before week 25!');
      return;
    }
    
    st.pendingEvent = {
      id: 'presidential_election_' + st.week,
      week: st.week,
      title: '🗳️ PRESIDENTIAL ELECTION CALLED!',
      body: 'The President has dissolved the council. New elections will be held immediately!',
      isElection: true,
      choices: []
    };
    
    st.log.push('Week ' + st.week + ': President called early election');
    toast('Early election called!');
    renderAll();
  };

  api.saveGame = function(slotId) {
    saveGame(slotId);
  };

  api.loadGame = function(slotId) {
    loadGame(slotId);
  };

  api.deleteSave = function(slotId) {
    deleteSave(slotId);
  };

  api.advance = function () {
    if (st.week >= D.WEEKS) {
      scene = 'election';
      renderAll();
      return;
    }
    
    st.pendingEvent = null;
    
    E.endWeek(st, rng);
    


    if (st && st.week % 5 === 0 && st.week > 1) {
      autoSave();
    }
    
    if (st && st.endingData && 
        (st.endingData.ending === 'natural_governing' || 
         st.endingData.endingNumber === 'Ending 3')) {
      if (!st._greenAndWhitePlayed) {
        st._greenAndWhitePlayed = true;
        playGreenAndWhite();
      }
    }
    
    if (st && st.battle4Completed === true && st.hasArbeiterAlly === true) {
      if (!st._arbPlayed) {
        st._arbPlayed = true;
        playArb();
      }
    }
    
    scene = 'week';
    renderAll();
  };

  api.selectMinistry = function(ministryId) {
    if (!st._selectedMinistries) st._selectedMinistries = {};
    
    var playerSeats = st.seats[E.getPlayerPartyId(st)] || 0;
    var allocation = E.calculateMinistryAllocation(st, st.coalitionPartners || [], playerSeats);
    var playerMinistries = allocation.player;
    
    var selectedCount = Object.keys(st._selectedMinistries).length;
    
    if (st._selectedMinistries[ministryId]) {
      delete st._selectedMinistries[ministryId];
      renderAll();
      return;
    }
    
    if (selectedCount >= playerMinistries) {
      toast('You can only select ' + playerMinistries + ' ministries for ZMP.');
      return;
    }
    
    st._selectedMinistries[ministryId] = true;
    renderAll();
  };

  api.confirmMinistries = function() {
    if (!st._selectedMinistries) {
      toast('No ministries selected.');
      return;
    }
    
    var playerSeats = st.seats[E.getPlayerPartyId(st)] || 0;
    var allocation = E.calculateMinistryAllocation(st, st.coalitionPartners || [], playerSeats);
    var playerMinistries = allocation.player;
    var selectedCount = Object.keys(st._selectedMinistries).length;
    
    if (selectedCount < playerMinistries) {
      toast('You need to select ' + playerMinistries + ' ministries for ZMP.');
      return;
    }
    
    var availableMinisters = E.getAvailableMinisters(st);
    var zmpMinisters = [];
    
    var factionMap = {
      'secularists': 'secularists',
      'securro':     'securro',
      'zalgrilian':  'zalgrilian',
      'jihadists':   'jihadists'
    };
    var playerFaction = factionMap[st.faction] || 'zalgrilian';
    
    for (var i = 0; i < availableMinisters.length; i++) {
      if (availableMinisters[i].faction === playerFaction) {
        zmpMinisters.push(availableMinisters[i]);
      }
    }
    
    var zmpIndex = 0;
    var ministryList = ['finance', 'education', 'justice', 'technology', 'health', 'sports', 'arts', 'infrastructure'];
    
    for (var i = 0; i < ministryList.length; i++) {
      var mId = ministryList[i];
      if (st._selectedMinistries[mId]) {
        var minister = zmpMinisters[zmpIndex % zmpMinisters.length] || { name: 'ZMP Minister', faction: 'ZMP', bonus: {} };
        if (st.cabinet && st.cabinet[mId]) {
          st.cabinet[mId].minister = minister.name;
          st.cabinet[mId].ministerId = minister.id;
          st.cabinet[mId].faction = minister.faction;
          st.cabinet[mId].party = 'ZMP';
          
          if (minister.bonus) {
            if (minister.bonus.unity) st.unity = Math.min(100, st.unity + minister.bonus.unity);
            if (minister.bonus.faculty) st.faculty = Math.min(100, st.faculty + minister.bonus.faculty);
            if (minister.bonus.funds) st.funds += minister.bonus.funds;
            if (minister.bonus.momentum) st.momentum = Math.min(20, st.momentum + minister.bonus.momentum);
            if (minister.bonus.spirit) st.spirit = Math.min(10, st.spirit + minister.bonus.spirit);
            if (minister.bonus.volunteers) st.volunteers += minister.bonus.volunteers;
          }
        }
        zmpIndex++;
      }
    }
    
    var partnerIndex = 0;
    var partners = st.coalitionPartners || [];
    
    for (var i = 0; i < ministryList.length; i++) {
      var mId = ministryList[i];
      if (!st._selectedMinistries[mId] && st.cabinet && st.cabinet[mId]) {
        var partner = partners[partnerIndex % partners.length];
        var p = party(partner);
        var partnerName = p ? p.short + ' Minister' : 'Unknown';
        
        st.cabinet[mId].party = partner;
        st.cabinet[mId].minister = partnerName;
        st.cabinet[mId].ministerId = null;
        st.cabinet[mId].faction = 'partner';
        st.cabinet[mId].approval = 40 + Math.floor(Math.random() * 30);
        
        partnerIndex++;
      }
    }
    
    toast('Cabinet confirmed!');
    st._selectedMinistries = null;
    scene = 'cabinet';
    renderAll();
  };

  api.chooseAction = function (aid) {
    var _f = faction(st.faction);
    if (_f && _f.id === 'jihadists') {
      var militaryIds = ['train_militia','equip_militia','recruit_militia','rally_militia','relations_wein'];
      if (militaryIds.indexOf(aid) !== -1) {
        return api.runMilitaryAction(aid);
      }
      toast('The Jihadists do not campaign. Only military operations are permitted.');
      return;
    }
    var a = null;
    if (D && D.ACTIONS) {
      for (var i = 0; i < D.ACTIONS.length; i++) {
        if (D.ACTIONS[i].id === aid) { a = D.ACTIONS[i]; }
      }

    }
    var currentFaction = null; 
    for (var i = 0; i < D.FACTIONS.length; i++) {
      if (D.FACTIONS[i].id === st.faction) { currentFaction = D.FACTIONS[i]; }
    }
    if (currentFaction && !currentFaction.canNegotiate) {
      var blockedActions = ['negotiate', 'coalition', 'relations_talk', 'relations_gift'];
      if (blockedActions.indexOf(aid) !== -1) {
        toast('The ZMP refuses to negotiate with the enemies of God.');
        return;
      }
    
    }
    // --- Then continue with normal action lookup ---
    if (!a && D && D.GOV_ACTIONS) {
      for (var i = 0; i < D.GOV_ACTIONS.length; i++) {
        if (D.GOV_ACTIONS[i].id === aid) { a = D.GOV_ACTIONS[i]; }
      }
    }
    if (!a && D && D.CRISIS_ACTIONS) {
      for (var i = 0; i < D.CRISIS_ACTIONS.length; i++) {
        if (D.CRISIS_ACTIONS[i].id === aid) { a = D.CRISIS_ACTIONS[i]; }
      }
    }
    if (!a && D && D.RELATIONS_ACTIONS) {
      for (var i = 0; i < D.RELATIONS_ACTIONS.length; i++) {
        if (D.RELATIONS_ACTIONS[i].id === aid) { a = D.RELATIONS_ACTIONS[i]; }
      }
    }
    if (a && a.needsTarget) {
      pending = aid;
      renderMain();
      return;
    }
    api.runAction(aid, null);
  };

  api.cancelAction = function () {
    pending = null;
    renderMain();
  };

  api.runAction = function (aid, target) {
    var r = E.doAction(st, aid, target, rng);
    pending = null;
    if (!r.ok) {
      toast(r.msg);
      renderMain();
      return;
    }
    toast(r.msg);
    renderAll();
  };

    api.runMilitaryAction = function(actionId) {
    if (!st) return;

    if (!st.paramilitaries && E.initParamilitaries) {
        E.initParamilitaries(st);
      }
      var p = st.paramilitaries || {};
      var dz = p.dzehurjaca || {
        members: 0, training: 0, equipment: 0, morale: 0, loyalty: 0,
        name: 'Dzehurjaca Legion', short: 'Dzehurjaca', icon: ''
      };

    if (actionId === 'relations_wein') {
      var r = E.doAction(st, 'relations_wein', 'wein', rng);
      if (!r.ok) { toast(r.msg); return; }
      (r.notes || []).forEach(function(n){ toast(n); });
      renderAll();
      return;
    }

    if (actionId === 'train_militia') {
      if (st.ap < 2) { toast('Need 2 AP.'); return; }
      if (st.funds < 15) { toast('Need $15.'); return; }
      if (st.volunteers < 2) { toast('Need 2 volunteers.'); return; }
      st.ap -= 2; st.funds -= 15; st.volunteers -= 2;
      p.dzehurjaca.training = Math.min(10, p.dzehurjaca.training + 1);
      toast('Training raised to ' + p.dzehurjaca.training + '/10. Strength: ' + E.calculateParamilitaryStrength(p.dzehurjaca));
    } else if (actionId === 'equip_militia') {
      if (st.ap < 2) { toast('Need 2 AP.'); return; }
      if (st.funds < 20) { toast('Need $20.'); return; }
      if (st.volunteers < 1) { toast('Need 1 volunteer.'); return; }
      st.ap -= 2; st.funds -= 20; st.volunteers -= 1;
      p.dzehurjaca.equipment = Math.min(10, p.dzehurjaca.equipment + 1);
      toast('Equipment raised to ' + p.dzehurjaca.equipment + '/10. Strength: ' + E.calculateParamilitaryStrength(p.dzehurjaca));
    } else if (actionId === 'recruit_militia') {
      if (st.ap < 1) { toast('Need 1 AP.'); return; }
      if (st.funds < 8) { toast('Need $8.'); return; }
      if (st.volunteers < 2) { toast('Need 2 volunteers.'); return; }
      st.ap -= 1; st.funds -= 8; st.volunteers -= 2;
      var gained = 15 + Math.floor(rng() * 15);
      p.dzehurjaca.members += gained;
      toast('Recruited ' + gained + ' fighters. Legion now has ' + p.dzehurjaca.members + ' members.');
    } else if (actionId === 'rally_militia') {
      if (st.ap < 1) { toast('Need 1 AP.'); return; }
      if (st.funds < 5) { toast('Need $5.'); return; }
      if (st.volunteers < 3) { toast('Need 3 volunteers.'); return; }
      st.ap -= 1; st.funds -= 5; st.volunteers -= 3;
      p.dzehurjaca.morale = Math.min(100, p.dzehurjaca.morale + 8);
      p.dzehurjaca.loyalty = Math.min(100, p.dzehurjaca.loyalty + 3);
      toast('Morale raised to ' + p.dzehurjaca.morale + '%.');
    }
    renderAll();
  };

    api.launchKingPutsch = function () {
    if (!st) return;

    // Only for the Zalgrilianist faction
    if (!st.faction || st.faction !== 'zalgrilian') {
      toast('The King Putsch is only available to the Zalgrilianists.');
      return;
    }

    // Don't double-launch
    if (st.king && st.king.active) {
      toast('The putsch is already underway.');
      return;
    }

    // Conditions
    if (E.getPartySupport(st, 'ZMP') <= 40) {
      toast('The ZMP needs more than 40% support before you can move.');
      return;
    }
    if (st.funds <= 300) {
      toast('The party needs more than $300 to fund the occupation.');
      return;
    }

    // Hand off to the engine. In engine.js, tickkingOccupation() runs the
    // first phase of the occupation and sets up the Marshal's questions.
    if (typeof E.tickkingOccupation !== 'function') {
      toast('Engine missing tickkingOccupation — cannot launch.');
      return;
    }

    if (!st.king) st.king = {};
    st.king.active = true;
    st.king.week = 0;

    // Run phase 1 (occupation begins)
    var notes = E.tickkingOccupation(st, rng);
    (notes || []).forEach(function (n) { st.log.push(n); });

    toast('The Legion marches on the Council Chamber.');

    // Now the standoff is active. If zalgrilia.js is loaded, we can
    // immediately drop into the parking-lot scene.
    if (typeof UI.startKingMinigame === 'function') {
      UI.startKingMinigame();
    } else {
      scene = 'week';
      renderAll();
    }
  };

    // ---- PUTSCH RTS MINIGAME ----
  var putschGame = null;
  var putschRAF = null;


  // In ui.js, replace the launchPutsch function:

api.launchPutsch = function() {
  if (!st) return;

  // Save state so battle.html can read it
  try {
    var saveData = {
      state: JSON.parse(JSON.stringify(st)),
      achievements: E.checkAchievements(st),
      timestamp: Date.now(),
      week: st.week,
      faction: st.faction,
      version: '1.0'
    };
    localStorage.setItem('classCouncil_save_auto', JSON.stringify(saveData));
  } catch(e) {}

  var battleWindow = window.open(
    'battle.html?faction=' + encodeURIComponent(st.faction) + '&battle=putsch',
    'Battle3D',
    'width=' + Math.min(window.screen.width, 1600) + ',height=' + Math.min(window.screen.height, 900) + ',menubar=no,toolbar=no'
  );

  if (!battleWindow) {
    toast('Popup blocked! Allow popups for this site.');
    return;
  }

  window.addEventListener('message', function handler(event) {
    if (!event.data || event.data.type !== 'battleResult') return;
    window.removeEventListener('message', handler);

    var d = event.data;

    // ============================================================
    // EXPANDED ENDINGS — Victory
    // ============================================================
    if (d.result === 'victory') {
      var enemyLeft = d.enemyUnitsLeft || 0;
      var totalEnemies = enemyLeft + (d.kills || 0);

      // Ending 22A: Decisive Victory (crushed the enemy, few losses)
      if (enemyLeft === 0 && d.losses <= 3) {
        st.endingData = {
          ending: 'jihadist_putsch_victory_decisive',
          title: 'The Legion Swept Them Aside',
          subtitle: 'The Council Chamber fell in under twenty minutes.',
          endingNumber: 'Ending 22A',
          body: 'The Dzehurjaca Legion has seized the Council Chamber almost without resistance.',
          story:
            'It was over before the canteen staff had finished wiping down the tables. ' +
            'The Legion moved through the corridors in three columns — one for the science wing, ' +
            'one for the library, one for the council chamber itself — and by the time the Black ' +
            'League sentries realised what was happening, the doors were already open and the ' +
            'banners were already coming down. ' +
            'Mehmedera was found in the second-floor disabled bathroom, crouched behind a mop ' +
            'bucket, and was marched out through the front entrance in front of a hundred silent ' +
            'students. Nobody cheered. Nobody had to. The Legion walked him past the crowd in ' +
            'single file, and every student in that parking lot understood, without anyone saying ' +
            'it, that the era of the Black League was over. ' +
            'By Monday the school had a new government. By Friday it had a new flag. By the end ' +
            'of the month, the only people who remembered the Black League were the ones who had ' +
            'fought in it.',
          subending: 'Subending V — The Clean Sweep',
          detail:
            '<div class="stat"><span>Kills</span><span class="v">' + d.kills + '</span></div>' +
            '<div class="stat"><span>Losses</span><span class="v">' + d.losses + '</span></div>' +
            '<div class="stat"><span>Capitals captured</span><span class="v">' + (d.capturedCapitals ? d.capturedCapitals.player : 0) + '</span></div>' +
            '<div class="stat"><span>Enemy survivors</span><span class="v">0</span></div>' +
            '<div class="stat"><span>Outcome</span><span class="v" style="color:#5fae3c;font-weight:bold;">DECISIVE VICTORY</span></div>',
          epilogue:
            'The Legion never disbanded. It grew. Ten years later it had a gym on the ground ' +
            'floor, a recruitment office by the main entrance, and a waiting list that ran to ' +
            'three pages. Alumni returning for reunions were not permitted inside the main ' +
            'building without an escort. Every year, on the anniversary, the Legion marched ' +
            'through the courtyard at dusk, and the whole school was silent, and everyone remembered.'
        };
      }

      // Ending 22B: Bloody Victory (won but took heavy losses)
      else if (d.losses > 10) {
        st.endingData = {
          ending: 'jihadist_putsch_victory_bloody',
          title: 'The Long March Through the School',
          subtitle: 'They held every corridor. We took every corridor.',
          endingNumber: 'Ending 22B',
          body: 'The Dzehurjaca Legion has seized the Council Chamber — but at a cost.',
          story:
            'It took four hours. The Black League had barricaded the science wing, blocked the ' +
            'library staircase, and turned the gym into a fortified position. The Legion went ' +
            'through them one by one, room by room, and by the time the Council Chamber finally ' +
            'fell, both sides had left a mark on the school that would never quite wash out. ' +
            'The Legion lost more men than anyone had expected. The Black League lost more than ' +
            'it could afford. Mehmedera was captured at the end of the fourth hour, sitting on ' +
            'the floor of the computer lab with his back against a filing cabinet, and he did not ' +
            'resist when they came for him. He simply looked up and said, "It took you longer ' +
            'than you thought." ' +
            'The Legion did not answer. There was nothing to say. ' +
            'By Monday the school had a new government, but the corridors still smelled of smoke, ' +
            'and three of the freshmen who had been caught in the crossfire were still in hospital, ' +
            'and every student in the building understood that something had ended — not with a ' +
            'clean victory, but with a slow, grinding slog that nobody would ever fully talk about.',
          subending: 'Subending W — The Long March',
          detail:
            '<div class="stat"><span>Kills</span><span class="v">' + d.kills + '</span></div>' +
            '<div class="stat"><span>Losses</span><span class="v">' + d.losses + '</span></div>' +
            '<div class="stat"><span>Capitals captured</span><span class="v">' + (d.capturedCapitals ? d.capturedCapitals.player : 0) + '</span></div>' +
            '<div class="stat"><span>Outcome</span><span class="v" style="color:#ffcc00;font-weight:bold;">BLOODY VICTORY</span></div>',
          epilogue:
            'The Legion never disbanded, but it never fully recovered either. Ten years later, ' +
            'its veterans walked with limps and did not talk about what had happened in the ' +
            'science wing. The school moved on. The Legion did not. And every year, on the ' +
            'anniversary, a small group of men in green jackets met in a diner across town and ' +
            'drank coffee and remembered the four hours.'
        };
      }

      // Ending 22: Standard Victory
      else {
        st.endingData = {
          ending: 'jihadist_putsch_victory',
          title: 'The Legion Takes the School',
          subtitle: 'The Council Chamber is ours. The Black League is finished.',
          endingNumber: 'Ending 22',
           body:
        'The Dzehurjaca Legion — with the support of roughly 3% of the student body — ' +
        'has seized the Council Chamber. Not because they were popular. Because no one ' +
        'stopped them.',
      story:
        'The Legion marched on the Council Chamber on a Friday afternoon, when the ' +
        'teachers had gone home and the buses had already left. There were maybe eighty ' +
        'of them. They did not run. They did not hide. They walked, in formation, through ' +
        'the front doors of the school, past the trophy case, past the library, past the ' +
        'science wing, and up the west staircase to the council chamber. ' +
        'A few people tried to stop them. A janitor stood in the doorway of the science ' +
        'wing and was pushed aside. A sophomore in the library tried to call the police ' +
        'and could not get a signal. Two seniors stood at the top of the west staircase ' +
        'and shouted — actually shouted, at the top of their lungs — for someone, anyone, ' +
        'to come and help. Nobody came. The seniors stepped aside. The Legion walked past ' +
        'them and did not even slow down. ' +
        'The Black League had spent two years preparing for a war against the ZMP, and ' +
        'when the war came, it came from a direction they had never expected. Mehmedera ' +
        'was found in the second-floor bathroom, hiding behind a mop bucket. He was not ' +
        'shot — the Legion had other plans for him. He was put on trial, in the gym, in ' +
        'front of the whole school, and the verdict was never in doubt. ' +
        'By the end of the week, the school had a new government. It was not elected. It ' +
        'was not appointed. It was accepted. The Legion had marched, and the school had ' +
        'stepped aside, and that was that.',
      subending: 'Subending V — The March That Nobody Stopped',
      detail:
        '<div class="stat"><span>Kills</span><span class="v">' + d.kills + '</span></div>' +
        '<div class="stat"><span>Losses</span><span class="v">' + d.losses + '</span></div>' +
        '<div class="stat"><span>Capitals captured</span><span class="v">' + (d.capturedCapitals ? d.capturedCapitals.player : 0) + '</span></div>' +
        '<div class="stat"><span>Outcome</span><span class="v" style="color:#5fae3c;font-weight:bold;">VICTORY (for the Legion)</span></div>' +
        '<div class="stat"><span></span><span class="v" style="color:#cc0000;font-weight:bold;">COLLAPSE (for the school)</span></div>',
      epilogue:
        'The Legion never disbanded. It grew. Ten years later it had a gym on the ground ' +
        'floor, a recruitment office by the main entrance, and a waiting list that ran to ' +
        'three pages. The school changed its name twice — first to Madrasat al-Nur, then ' +
        'simply to the Academy — and the portraits that had once hung in the hallway were ' +
        'gone, replaced by calligraphy, and no one who had not been there could remember ' +
        'what the old headmaster had looked like. Every year, on the anniversary, the ' +
        'Legion marched through the courtyard at dusk — marched, in step, in formation — ' +
        'and the whole school was silent, and everyone remembered. ' +
        'But what they remembered was not the march. It was the silence that met it. ' +
        'The Legion had 3% of the school. They won because the other 97% did not stop ' +
        'them. The faculty could have called the police. The council could have called a ' +
        'vote of no confidence. The students could have walked out. The Black League could ' +
        'have fought. The ZMP could have organized resistance. None of them did. And so a ' +
        'faction that represented almost nobody ended up ruling everybody — not because ' +
        'they were strong, but because everyone else was afraid to be the first to say no. ' +
        'The lesson was not that the Legion was powerful. The lesson was that the school ' +
        'was not. It had been given a choice: submit, or resist. It submitted. And in ' +
        'submitting, it ceased to be the school it had been.'
        };
      }
    }

    // ============================================================
    // EXPANDED ENDINGS — Defeat
    // ============================================================
    else {
      var playerLeft = d.playerUnitsLeft || 0;

      // Ending 23A: Total Wipe (all units destroyed)
      if (playerLeft === 0) {
        st.endingData = {
          ending: 'jihadist_putsch_annihilation',
          title: 'The Legion Is No More',
          subtitle: 'The last of the Dzehurjaca died on the third-floor landing.',
          endingNumber: 'Ending 23A',
          body: 'The Dzehurjaca Legion has been destroyed. The Black League marches on.',
          story:
            'It ended on the third-floor landing, between the science wing and the library, ' +
            'where the corridors narrowed and the Black League had stacked overturned desks ' +
            'into a wall. The Legion went at it three times. The first two attempts were ' +
            'repelled. On the third attempt, the last of the Dzehurjaca made it up the stairs, ' +
            'through the barricade, and into the corridor beyond — and then the corridor ' +
            'collapsed, and the men inside it were buried under a hundred kilos of ceiling tile ' +
            'and bookshelves, and the men outside could not get to them. ' +
            'By the time the dust settled, forty-one of the original forty-two were dead. The ' +
            'survivor crawled out through the library window and made it home. He did not come ' +
            'back to school the following Monday. He did not come back at all. ' +
            'The Black League raised its flag over the Council Chamber that evening, and by the ' +
            'end of the week it had renamed every classroom after its own martyrs. The ' +
            'Dzehurjaca Legion was officially banned. The ZMP was officially banned. The ' +
            'Jihadist faction never recovered. And the school, which had been promised that ' +
            'the crown would come back, learned instead that the crown could be buried.',
          subending: 'Subending X — The Third-Floor Landing',
          detail:
            '<div class="stat"><span>Kills</span><span class="v">' + d.kills + '</span></div>' +
            '<div class="stat"><span>Losses</span><span class="v">' + d.losses + '</span></div>' +
            '<div class="stat"><span>Legion survivors</span><span class="v">0</span></div>' +
            '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">ANNIHILATION</span></div>',
          epilogue:
            'The Black League ruled the school for eleven years. The Dzehurjaca Legion was ' +
            'struck from the record. The name of the man who had founded it was not spoken for ' +
            'a generation. And then, in a history class in a different school in a different ' +
            'city, a teacher mentioned, almost in passing, that there had once been a group ' +
            'called the Dzehurjaca, and that they had died on a staircase, and that nobody ' +
            'had ever written down why. A student in the back row wrote it in his notebook. ' +
            'That is how it started again.'
        };
      }

      // Ending 23: Standard Defeat (Legion routed)
      else {
        st.endingData = {
          ending: 'jihadist_putsch_defeat',
          title: 'The Legion Retreats',
          subtitle: 'The Black League holds the Council Chamber. The Legion falls back.',
          endingNumber: 'Ending 23',
          body: 'The Legion was routed. The Black League marches on.',
          story:
            'It ended at the west staircase, where the Legion had come in and where the Legion ' +
            'would have to go out. They had lost the science wing an hour earlier, lost the ' +
            'library ten minutes after that, and by the time the Black League turned its ' +
            'attention to the council chamber, the Dzehurjaca knew that the day was over. ' +
            'The retreat was not a rout. That was the strange part. The Legion fell back in ' +
            'good order, covering each other, carrying their wounded, and when the last man ' +
            'went through the west staircase door he closed it behind him and held it for ' +
            'ninety seconds while the rest of the Legion got clear. Nobody knew who he was. ' +
            'Nobody ever found out. ' +
            'The Black League raised its flag over the Council Chamber that evening. The Legion ' +
            'withdrew to a gymnasium on the far side of the school and began to count its dead. ' +
            'The count was not as high as it could have been. The Legion, at least, had survived.',
          subending: 'Subending W — The Wilderness',
          detail:
            '<div class="stat"><span>Kills</span><span class="v">' + d.kills + '</span></div>' +
            '<div class="stat"><span>Losses</span><span class="v">' + d.losses + '</span></div>' +
            '<div class="stat"><span>Legion survivors</span><span class="v">' + playerLeft + '</span></div>' +
            '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">DEFEAT</span></div>',
          epilogue:
            'The Legion survived, but it did not win. The Black League ruled the school for the ' +
            'rest of the year. The Dzehurjaca went underground. Some of them transferred to ' +
            'other schools. A few of them stayed, in plain clothes, in the back rows of classes, ' +
            'and waited. And every so often, on a quiet afternoon, one of them would look up ' +
            'from his notebook and see a green jacket in the corridor, and understand that the ' +
            'Legion was not finished — it was just waiting.'
        };
      }
    }

    st.finished = true;
    scene = 'end';
    renderAll();
    if (battleWindow && !battleWindow.closed) battleWindow.close();
  });

  toast('Battle launched in new window!');
};

function startPutschLoop() {
  if (putschRAF) return;   // <-- guard prevents double-RAF
  var last = performance.now();
  function frame(now) {
    if (!putschGame || scene !== 'putsch') {
      putschRAF = null;
      return;
    }
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    window.PutschMinigame.update(putschGame, dt);
    drawPutschCanvas();
    if (putschGame.result) {
      putschRAF = null;
      showPutschResult();
      return;
    }
    putschRAF = requestAnimationFrame(frame);
  }
  putschRAF = requestAnimationFrame(frame);
}

  function stopPutschLoop() {
    if (putschRAF) { cancelAnimationFrame(putschRAF); putschRAF = null; }
  }

  function drawPutschCanvas() {
  var canvas = document.getElementById('putsch-canvas');
  if (!canvas || !putschGame) return;
  var ctx = canvas.getContext('2d');
  var g = putschGame;
  var scale = canvas._scale || 1;
  var offX = canvas._offX || 0;
  var offY = canvas._offY || 0;

  // Shake
  var shakeX = 0, shakeY = 0;
  if (g.shake && g.shake.duration > 0) {
    var mag = g.shake.magnitude * (g.shake.duration / 0.4);
    shakeX = (Math.random() - 0.5) * mag;
    shakeY = (Math.random() - 0.5) * mag;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX + shakeX, offY + shakeY);

  var W = PutschMinigame.CFG.mapW;
  var H = PutschMinigame.CFG.mapH;

  // ---- Terrain: colour by elevation ----
  var t = g.terrain;
  if (t) {
    var cs = t.cellSize;
    for (var y = 0; y < t.rows; y++) {
      for (var x = 0; x < t.cols; x++) {
        var h = t.grid[y * t.cols + x];
        var px = x * cs;
        var py = y * cs;

        // Elevation -> colour ramp
        var r, gg, b;
        if (h < 0.5)       { r = 90;  gg = 110; b = 70; }   // marsh
        else if (h < 1.3)  { r = 111; gg = 143; b = 52; }   // plain
        else if (h < 2.5)  { r = 130; gg = 150; b = 65; }   // hills
        else if (h < 3.8)  { r = 145; gg = 155; b = 80; }   // steep
        else               { r = 190; gg = 195; b = 180; }  // peak (rocky)

        // Simple shading by height difference (fake lighting from NW)
        var shade = 1.0 - (h - 2.5) * 0.05;
        shade = Math.max(0.75, Math.min(1.2, shade));

        ctx.fillStyle = 'rgb(' +
          Math.round(r * shade) + ',' +
          Math.round(gg * shade) + ',' +
          Math.round(b * shade) + ')';
        ctx.fillRect(px, py, cs + 1, cs + 1);
      }
    }
  }

  // ---- River ----
  var river = g.river;
  if (river && river.points.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#3a5f8a';
    ctx.lineWidth = river.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(river.points[0].x, river.points[0].y);
    for (var i = 1; i < river.points.length; i++) {
      ctx.lineTo(river.points[i].x, river.points[i].y);
    }
    ctx.stroke();

    // Bright centre
    ctx.strokeStyle = '#5a7fae';
    ctx.lineWidth = river.width - 8;
    ctx.beginPath();
    ctx.moveTo(river.points[0].x, river.points[0].y);
    for (var i = 1; i < river.points.length; i++) {
      ctx.lineTo(river.points[i].x, river.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- Obstacles (rocks + trees) ----
  var obstacles = g.obstacles;
  if (obstacles) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.type === 'rock') {
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.type === 'tree') {
        // Trunk
        ctx.fillStyle = '#4a3320';
        ctx.fillRect(o.x - 2, o.y - 2, 4, o.h * 0.3);
        // Canopy
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.arc(o.x, o.y - o.h * 0.3, o.r, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.3, o.y - o.h * 0.3 - o.r * 0.3, o.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- Corpses ----
  var corpses = g.corpses || [];
  for (var i = 0; i < corpses.length; i++) {
    var corpse = corpses[i];
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = corpse.side === 'player' ? '#3a5a3a' : '#5a3030';
    ctx.beginPath();
    ctx.arc(corpse.x, corpse.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Capitals ----
  g.capitals.forEach(function(c) {
    drawCapital(ctx, c, g);
  });

  // ---- Selection box ----
  if (g.dragStart && g.dragEnd) {
    var x0 = Math.min(g.dragStart.x, g.dragEnd.x);
    var y0 = Math.min(g.dragStart.y, g.dragEnd.y);
    var w = Math.abs(g.dragEnd.x - g.dragStart.x);
    var h = Math.abs(g.dragEnd.y - g.dragStart.y);
    if (w > 4 || h > 4) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeRect(x0, y0, w, h);
      ctx.restore();
    }
  }

  // ---- Attack range preview ----
  if (g.showAttackRange) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    g.units.forEach(function(u) {
      if (!u.alive) return;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.range, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  // ---- Projectiles ----
  g.projectiles.forEach(function(p) {
    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = Math.max(0, p.life / 0.12);
    ctx.beginPath();
    ctx.moveTo(p.x1, p.y1);
    ctx.lineTo(p.x2, p.y2);
    ctx.stroke();
    ctx.restore();
  });

  // ---- Explosions / dust / sparks ----
  g.explosions.forEach(function(e) {
    ctx.save();
    var t = 1 - (e.life / e.maxLife);
    ctx.globalAlpha = Math.max(0, e.life / e.maxLife);
    if (e.spark) {
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, e.y, 3, 3);
      if (e.vx) e.x += e.vx * (1/60);
      if (e.vy) e.y += e.vy * (1/60);
    } else if (e.dust) {
      ctx.fillStyle = e.color;
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y - t * 20, 8 + t * 20, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 6 + t * 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });

  // ---- Units ----
  var stacks = {};
  g.units.forEach(function(u) {
    if (!u.alive) return;
    var key = u.side + '|' + u.type + '|' + Math.round(u.x / 22) + '|' + Math.round(u.y / 22);
    if (!stacks[key]) stacks[key] = { side: u.side, type: u.type, x: 0, y: 0, n: 0, selected: false, broken: false };
    var s = stacks[key];
    s.x += u.x; s.y += u.y; s.n++;
    if (u.selected) s.selected = true;
    if (u.broken) s.broken = true;
  });

  Object.keys(stacks).forEach(function(k) {
    var s = stacks[k];
    s.x /= s.n; s.y /= s.n;
    drawStack(ctx, s, g.showAttackRange);
  });

  // ---- Float text ----
  g.floatText.forEach(function(f) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = f.color;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  });

  // ---- HUD ----
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawPutschHUD(ctx, canvas, g);
}

  function drawCapital(ctx, c, g) {
    ctx.save();

    // Capture radius ring (for non-HQ capitals)
    if (!c.isHQ) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, PutschMinigame.CFG.capitalCaptureRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + 4, 0, Math.PI * 2);
    ctx.fillStyle = c.ringColor;
    ctx.fill();

    // Fill
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.fillColor;
    ctx.fill();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(c.x - c.r * 0.25, c.y - c.r * 0.25, c.r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();

    // ---- Smoke for damaged capitals ----
var hpPct = c.hp / c.maxHp;
if (hpPct < 0.6) {
  ctx.save();
  var smokeCount = hpPct < 0.3 ? 4 : 2;
  for (var s = 0; s < smokeCount; s++) {
    var phase = (Date.now() / 700 + s * 0.5) % 1;
    var sx = c.x + Math.sin(s * 2.3 + Date.now() / 400) * 8;
    var sy = c.y - c.r - phase * 40;
    var sr = 6 + phase * 12;
    var alpha = (1 - phase) * 0.35;
    ctx.fillStyle = 'rgba(80,80,80,' + alpha + ')';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

    // HP bar
    var w = c.r * 2.2;
    var h = 5;
    var x = c.x - w / 2;
    var y = c.y + c.r + 8;
    var pct = Math.max(0, c.hp / c.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pct > 0.5 ? '#5fdf5f' : (pct > 0.25 ? '#ffd24a' : '#ff6060');
    ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // ---- Capture progress arc ----
if (!c.isHQ && c.captureProgress > 0 && c.capturingSide) {
  var pct = Math.min(1, c.captureProgress / PutschMinigame.CFG.captureTime);
  ctx.save();
  var arcColor = c.capturingSide === 'player' ? '#5fdf5f' : '#ff6060';
  var glowColor = c.capturingSide === 'player' ? 'rgba(95,223,95,0.35)' : 'rgba(255,96,96,0.35)';
  // Outer glow
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
  // Crisp arc
  ctx.strokeStyle = arcColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
  ctx.restore();
}

    // ---- Contested indicator ----
if (!c.isHQ && c.contested) {
  ctx.save();
  var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
  ctx.strokeStyle = 'rgba(255,210,74,' + (0.4 + pulse * 0.5) + ')';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r + 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

    // Name
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(c.name, c.x, c.y - c.r - 8);
    ctx.fillStyle = '#fff';
    ctx.fillText(c.name, c.x, c.y - c.r - 8);

    // ---- Owner label ----
if (c.ownerName && !c.isHQ) {
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  var ownerColor = '#aaa';
  if (c.ownerName === 'ZMP') ownerColor = '#7fdf7f';
  else if (c.ownerName === 'Black League') ownerColor = '#ff7070';
  ctx.fillStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(c.ownerName, c.x, c.y + c.r + 22);
  ctx.fillStyle = ownerColor;
  ctx.fillText(c.ownerName, c.x, c.y + c.r + 22);
}

    // Victory marker on Council Chamber
    if (c.isVictory) {
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.strokeText('OBJECTIVE', c.x, c.y + c.r + 26);
      ctx.fillStyle = '#ffd700';
      ctx.fillText('OBJECTIVE', c.x, c.y + c.r + 26);
    }

    ctx.restore();
  }

  function drawStack(ctx, s, showRange) {
    var t = PutschMinigame.UNIT_TYPES[s.type];
    if (!t) return;
    var count = Math.min(s.n, PutschMinigame.CFG.groupMaxUnits);
    var cols = Math.ceil(Math.sqrt(count));
    var rows = Math.ceil(count / cols);
    var spacing = 6;
    var totalW = (cols - 1) * spacing;
    var totalH = (rows - 1) * spacing;
    var startX = s.x - totalW / 2;
    var startY = s.y - totalH / 2;

    // Attack range preview on hover (drawn under dots)
    if (showRange) {
      ctx.save();
      ctx.strokeStyle = s.side === 'player' ? 'rgba(160,255,160,0.20)' : 'rgba(255,160,160,0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, t.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Label above
    if (s.n > 1) {
      ctx.save();
      ctx.font = 'bold 10px monospace';
      var label = t.tag + '=' + s.n;
      var w = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(s.x - w / 2, s.y - 26, w, 13);
      ctx.fillStyle = s.side === 'player' ? '#c8ffc8' : '#ffc8c8';
      ctx.textAlign = 'center';
      ctx.fillText(label, s.x, s.y - 16);
      ctx.restore();
    }

    // Dots
    for (var i = 0; i < count; i++) {
      var cx = i % cols;
      var cy = Math.floor(i / cols);
      var x = startX + cx * spacing;
      var y = startY + cy * spacing;

      // Outer ring
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = t.colorRing;
      ctx.fill();

      // Fill
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = t.colorFill;
      ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.arc(x - 0.9, y - 0.9, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = t.colorCore;
      ctx.fill();
    }

    // Selection ring
    if (s.selected) {
      ctx.save();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Cavalry chevron: small V under cavalry stacks
    if (t.isCavalry) {
      ctx.save();
      ctx.strokeStyle = s.side === 'player' ? '#5fdf5f' : '#ff6060';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x - 8, s.y + 12);
      ctx.lineTo(s.x, s.y + 16);
      ctx.lineTo(s.x + 8, s.y + 12);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPutschHUD(ctx, canvas, g) {
    // Top bar
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, 28);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#c8ffc8';
    ctx.textAlign = 'left';
    ctx.fillText('DEZHURJACA  Gold: ' + Math.floor(g.gold) +
      '  Power: ' + g.playerPowerCurrent + ' / ' + g.playerPowerStart +
      '  Captured: ' + g.capturedCapitals.player +
      '  Kills: ' + g.kills + '  Losses: ' + g.losses, 10, 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffc8c8';
    ctx.fillText('BLACK LEAGUE  Power: ' + g.enemyPowerCurrent, canvas.width - 10, 18);
    ctx.restore();

    // Bottom bar
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height - 22, canvas.width, 22);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#eee';
    ctx.textAlign = 'left';
    ctx.fillText('Drag to select. Right-click to move. Hold the Council Chamber to win.', 10, canvas.height - 7);
    ctx.restore();
  }

  function showPutschResult() {
    var g = putschGame;
    if (!g) return;

    if (g.result === 'victory') {
      st.finished = true;
      st.endingData = {
  ending: 'jihadist_putsch_victory',
  title: 'THE PUTSCH SUCCEEDS',
  subtitle: 'The Legion marches into the Council Chamber.',
  endingNumber: 'Ending 22',
   body:
        'The Dzehurjaca Legion — with the support of roughly 3% of the student body — ' +
        'has seized the Council Chamber. Not because they were popular. Because no one ' +
        'stopped them.',
      story:
        'The Legion marched on the Council Chamber on a Friday afternoon, when the ' +
        'teachers had gone home and the buses had already left. There were maybe eighty ' +
        'of them. They did not run. They did not hide. They walked, in formation, through ' +
        'the front doors of the school, past the trophy case, past the library, past the ' +
        'science wing, and up the west staircase to the council chamber. ' +
        'A few people tried to stop them. A janitor stood in the doorway of the science ' +
        'wing and was pushed aside. A sophomore in the library tried to call the police ' +
        'and could not get a signal. Two seniors stood at the top of the west staircase ' +
        'and shouted — actually shouted, at the top of their lungs — for someone, anyone, ' +
        'to come and help. Nobody came. The seniors stepped aside. The Legion walked past ' +
        'them and did not even slow down. ' +
        'The Black League had spent two years preparing for a war against the ZMP, and ' +
        'when the war came, it came from a direction they had never expected. Mehmedera ' +
        'was found in the second-floor bathroom, hiding behind a mop bucket. He was not ' +
        'shot — the Legion had other plans for him. He was put on trial, in the gym, in ' +
        'front of the whole school, and the verdict was never in doubt. ' +
        'By the end of the week, the school had a new government. It was not elected. It ' +
        'was not appointed. It was accepted. The Legion had marched, and the school had ' +
        'stepped aside, and that was that.',
      subending: 'Subending V — The March That Nobody Stopped',
      detail:
        '<div class="stat"><span>Kills</span><span class="v">' + d.kills + '</span></div>' +
        '<div class="stat"><span>Losses</span><span class="v">' + d.losses + '</span></div>' +
        '<div class="stat"><span>Capitals captured</span><span class="v">' + (d.capturedCapitals ? d.capturedCapitals.player : 0) + '</span></div>' +
        '<div class="stat"><span>Outcome</span><span class="v" style="color:#5fae3c;font-weight:bold;">VICTORY (for the Legion)</span></div>' +
        '<div class="stat"><span></span><span class="v" style="color:#cc0000;font-weight:bold;">COLLAPSE (for the school)</span></div>',
      epilogue:
        'The Legion never disbanded. It grew. Ten years later it had a gym on the ground ' +
        'floor, a recruitment office by the main entrance, and a waiting list that ran to ' +
        'three pages. The school changed its name twice — first to Madrasat al-Nur, then ' +
        'simply to the Academy — and the portraits that had once hung in the hallway were ' +
        'gone, replaced by calligraphy, and no one who had not been there could remember ' +
        'what the old headmaster had looked like. Every year, on the anniversary, the ' +
        'Legion marched through the courtyard at dusk — marched, in step, in formation — ' +
        'and the whole school was silent, and everyone remembered. ' +
        'But what they remembered was not the march. It was the silence that met it. ' +
        'The Legion had 3% of the school. They won because the other 97% did not stop ' +
        'them. The faculty could have called the police. The council could have called a ' +
        'vote of no confidence. The students could have walked out. The Black League could ' +
        'have fought. The ZMP could have organized resistance. None of them did. And so a ' +
        'faction that represented almost nobody ended up ruling everybody — not because ' +
        'they were strong, but because everyone else was afraid to be the first to say no. ' +
        'The lesson was not that the Legion was powerful. The lesson was that the school ' +
        'was not. It had been given a choice: submit, or resist. It submitted. And in ' +
        'submitting, it ceased to be the school it had been.'
};
    } else {
      st.finished = true;
      st.endingData = {
        ending: 'jihadist_putsch_defeat',
        title: 'THE FAILED PUTSCH',
        subtitle: 'The Legion is destroyed.',
        endingNumber: 'Ending 23',
        body: 'The Legion was destroyed. The Black League marches on.',
        story: 'Gunfire in the science wing. Then silence. The Dzehurjaca Legion is no more. The ZMP is broken.',
        subending: 'Subending W - The Wilderness',
        detail: '<div class="stat"><span>Kills</span><span class="v">' + g.kills + '</span></div>' +
                '<div class="stat"><span>Losses</span><span class="v">' + g.losses + '</span></div>',
        epilogue: 'The Putsch fails. The Jihadist faction is remembered as a cautionary tale.'
      };
    }
    scene = 'end';
    renderAll();
  }

  // ---- Putsch UI buttons ----
  api.putschBuy = function(type) {
    if (!putschGame) return;
    var r = window.PutschMinigame.buyUnit(putschGame, type);
    if (r.ok) toast(r.msg); else toast(r.msg);
  };
  api.putschAddGold = function() {
    if (!putschGame) return;
    var r = window.PutschMinigame.addGold(putschGame, 1000);
    toast(r.msg);
  };
  api.putschSupport = function() {
    if (!putschGame) return;
    var r = window.PutschMinigame.callSupportGroup(putschGame);
    toast(r.msg);
  };
  api.putschToggleRange = function() {
    if (!putschGame) return;
    putschGame.showAttackRange = !putschGame.showAttackRange;
    renderAll();
  };
  api.putschToggleAuto = function() {
    if (!putschGame) return;
    putschGame.enemyAutoSpawn = !putschGame.enemyAutoSpawn;
    toast('Enemy auto-spawn: ' + (putschGame.enemyAutoSpawn ? 'ON' : 'OFF'));
    renderAll();
  };
  api.putschKillAll = function() {
    if (!putschGame) return;
    var r = window.PutschMinigame.killAllEnemies(putschGame);
    toast(r.msg);
  };

  // ---- View for the putsch scene ----
  function viewPutsch() {
    if (!putschGame) {
      return '<h2 class="scene-title">Putsch</h2><p class="lead">No putsch active.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
    }
    var html = '';
    html += '<h2 class="scene-title">The Dzehurjaca Putsch</h2>';
    html += '<p class="quiet">Green is yours. Red is the Black League. Neutral capitals are up for grabs.</p>';

    html += '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">';

    // Left: canvas
    html += '<div style="flex:1;min-width:420px;position:relative;">';
    html += '<canvas id="putsch-canvas" style="display:block;background:#050505;border:1px solid #333;border-radius:6px;"></canvas>';
    html += '</div>';

    // Right: side panel
    html += '<div style="width:260px;flex-shrink:0;">';

    // Buy buttons
    html += '<div class="result-box" style="margin-bottom:8px;">';
    html += '<h3 style="font-size:0.9rem;">Recruit</h3>';
    var buyTypes = ['dzehurjaca','dragoon','line','musket','sniper','artillery'];
    buyTypes.forEach(function(tp) {
      var t = window.PutschMinigame.UNIT_TYPES[tp];
      html += '<button class="act" style="width:100%;text-align:left;margin:2px 0;" onclick="UI.putschBuy(\'' + tp + '\')">';
      html += '<b>' + t.name + '</b> <span style="color:#ffd700;">$' + t.cost + '</span>';
      html += '<span class="d">' + t.desc + (t.isCavalry ? ' [CAVALRY]' : '') + '</span>';
      html += '</button>';
    });
    html += '</div>';

    // Utility buttons
    html += '<div class="result-box" style="margin-bottom:8px;">';
    html += '<h3 style="font-size:0.9rem;">Commands</h3>';
    html += '<button class="act" style="width:100%;margin:2px 0;" onclick="UI.putschAddGold()"><b>Add 1000 Gold</b></button>';
    html += '<button class="act" style="width:100%;margin:2px 0;" onclick="UI.putschSupport()"><b>Call Support Group</b></button>';
    html += '<button class="act" style="width:100%;margin:2px 0;" onclick="UI.putschToggleRange()"><b>Show Attack Range</b></button>';
    html += '<button class="act" style="width:100%;margin:2px 0;" onclick="UI.putschToggleAuto()"><b>Toggle Enemy Auto-Spawn</b></button>';
    html += '<button class="act" style="width:100%;margin:2px 0;" onclick="UI.putschKillAll()"><b>Kill All Enemies</b></button>';
    html += '</div>';

    // Log
    html += '<div class="result-box" style="max-height:220px;overflow-y:auto;">';
    html += '<h3 style="font-size:0.9rem;">Battle Log</h3>';
    html += '<div style="font-size:0.75rem;color:#aaa;">';
    var recent = putschGame.log.slice(-20).reverse();
    if (recent.length === 0) html += '<div>No entries yet.</div>';
    recent.forEach(function(l) { html += '<div>' + esc(l) + '</div>'; });
    html += '</div></div>';

    html += '<div class="btn-row" style="margin-top:8px;">';
    html += '<button class="btn alt" onclick="UI.go(\'week\')">Abandon</button>';
    html += '</div>';

    html += '</div>'; // side panel
    html += '</div>'; // flex

    return html;
  }

  // ---- Attach canvas events after render ----
  function attachPutschHandlers() {
    var canvas = document.getElementById('putsch-canvas');
    if (!canvas || !putschGame) return;
    var container = canvas.parentElement;
    var cw = container.clientWidth;
    var ch = Math.max(460, Math.round(cw * (PutschMinigame.CFG.mapH / PutschMinigame.CFG.mapW)));
    canvas.width = cw; canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    var scale = Math.min(cw / PutschMinigame.CFG.mapW, ch / PutschMinigame.CFG.mapH);
    var offX = (cw - PutschMinigame.CFG.mapW * scale) / 2;
    var offY = (ch - PutschMinigame.CFG.mapH * scale) / 2;
    canvas._scale = scale; canvas._offX = offX; canvas._offY = offY;

    function toWorld(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      var x = clientX - rect.left;
      var y = clientY - rect.top;
      return { x: (x - offX) / scale, y: (y - offY) / scale };
    }

    canvas.addEventListener('mousedown', function(e) {
      e.preventDefault();
      var p = toWorld(e.clientX, e.clientY);
      window.PutschMinigame.handleMouseDown(putschGame, p.x, p.y, e.button);
    });
    canvas.addEventListener('mousemove', function(e) {
      var p = toWorld(e.clientX, e.clientY);
      window.PutschMinigame.handleMouseMove(putschGame, p.x, p.y);
    });
    canvas.addEventListener('mouseup', function(e) {
      var p = toWorld(e.clientX, e.clientY);
      window.PutschMinigame.handleMouseUp(putschGame, p.x, p.y, e.button);
    });
    canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  }

  // Hook into renderMain so the canvas gets attached after innerHTML
  var _origRenderMain = renderMain;
  renderMain = function() {
    _origRenderMain.apply(this, arguments);
    if (scene === 'putsch') {
      // viewPutsch wrote the canvas; attach handlers and start loop
      attachPutschHandlers();
      if (!putschRAF && putschGame && !putschGame.result) {
        startPutschLoop();
      }
    }
  };

  // Register the scene renderer
  var _origRenderMainInner;
  // (renderMain is inside the IIFE; the override above catches it)

  api.naturalGoverning = function() {
    var zmpSeats = st.seats.ZMP || 0;
    if (zmpSeats < D.MAJORITY) {
      toast('ZMP does not have a majority!');
      return;
    }
    
    if (!(st.battle1Lost === false && st.battle2Won === true && (st.battle3Won === true || st.battle4Completed === true || st.blSplintered === true))) {
      toast('The Black League must be defeated first!');
      return;
    }
    
    var endingData = {
      ending: 'natural_governing',
      title: 'Natural Governing Established!',
      subtitle: 'The monarchy of the school is complete.',
      endingNumber: 'Ending 3',
      body: 'The ZMP has achieved total dominance. The school is yours.',
      story: 'With all battles won, the Black League defeated, and an absolute majority in the council (ZMP ' + zmpSeats + '/' + D.SEATS + ' seats), the ZMP has established itself as the natural governing party of the school. The left and right have been marginalized. The faculty bends to your will. The students accept your rule as inevitable.',
      subending: 'Subending C - The Eternal Rule',
      detail: '<div class="stat"><span>ZMP seats</span><span class="v">' + zmpSeats + ' / ' + D.SEATS + '</span></div>' +
        '<div class="stat"><span>Unity</span><span class="v">' + Math.round(st.unity) + '</span></div>' +
        '<div class="stat"><span>Faculty</span><span class="v">' + Math.round(st.faculty) + '</span></div>',
      epilogue: 'The ZMP rules the school for decades. The monarchy becomes tradition. Students grow up knowing only ZMP rule.'
    };
    
    st.endingData = endingData;
    st.finished = true;
    scene = 'end';
    renderAll();
  };

  api.pickChoice = function (i) {
    var ev = st.pendingEvent;
    if (!ev) {
      toast('No event to respond to.');
      return;
    }
    
    if (ev.isElection) {
      toast('Election results are being counted.');
      return;
    }
    
    var c = ev.choices[i];

    if (c.effects && c.effects.prophecyHalt) {
      st.prophecy.halted = true;
      toast('The tyrants stepped back from the edge. The prophecy halts.');
      st.eventDone[ev.id] = true;
      st.pendingEvent = null;
      api.advance();
      return;
    }
    st.eventDone[ev.id] = true;
    var notes = E.applyEffects(st, c.effects, rng);

    if (st.flags && st.flags.civilWarStarted && !st.civilWar &&
        window.CivilWar && typeof window.CivilWar.newWar === 'function') {
      window.CivilWar.newWar(st);
    }
    st.log.push('Week ' + st.week + ': ' + ev.title + ' — ' + c.text);
    notes.forEach(function (n) { st.log.push('  ' + n); });
    st.pendingEvent = null;
    if (notes.length) { toast(notes.join(' ')); }
    api.advance();
  };

  api.selectMinister = function(ministryId, ministerId) {
    if (!st._selectedMinisters) st._selectedMinisters = {};
    st._selectedMinisters[ministryId] = ministerId;
    renderAll();
  };

  api.confirmCabinet = function() {
    if (!st._selectedMinisters) {
      toast('No ministers selected.');
      return;
    }
    
    for (var ministryId in st._selectedMinisters) {
      var ministerId = st._selectedMinisters[ministryId];
      var minister = findMinisterById(ministerId);
      
      if (st.cabinet && st.cabinet[ministryId]) {
        st.cabinet[ministryId].minister = minister.name;
        st.cabinet[ministryId].ministerId = minister.id;
        st.cabinet[ministryId].faction = minister.faction;
        
        if (minister.bonus) {
          if (minister.bonus.unity) st.unity = Math.min(100, st.unity + minister.bonus.unity);
          if (minister.bonus.faculty) st.faculty = Math.min(100, st.faculty + minister.bonus.faculty);
          if (minister.bonus.funds) st.funds += minister.bonus.funds;
          if (minister.bonus.momentum) st.momentum = Math.min(20, st.momentum + minister.bonus.momentum);
          if (minister.bonus.spirit) st.spirit = Math.min(10, st.spirit + minister.bonus.spirit);
          if (minister.bonus.volunteers) st.volunteers += minister.bonus.volunteers;
        }
        
        st.log.push('Week ' + st.week + ': ' + minister.name + ' appointed as ' + st.cabinet[ministryId].name);
      }
    }
    
    toast('Cabinet confirmed!');
    st._selectedMinisters = null;
    scene = 'cabinet';
    renderAll();
  };

  function viewBattleEvent(ev) {
    if (!ev || !ev.battleId) return '';
    
    var html = '';
    var battleId = ev.battleId;
    
    if (battleId === 'battle4') {
      var weinRelation = st.relations ? st.relations.wein || 0 : 0;
      var weinAlly = st.hasArbeiterAlly || false;
      var requirementsMet = weinRelation >= 70 && weinAlly;
      
      html += '<div class="result-box" style="border:2px solid #ffd700;margin-bottom:15px;">';
      html += '<h3 style="color:#ffd700;">🌍 BATTLE REQUIREMENTS</h3>';
      
      html += '<div class="stat">';
      html += '<span>🌍 Wein Relations</span>';
      html += '<span style="color:' + (weinRelation >= 70 ? '#5fae3c' : '#cc0000') + ';">' + Math.round(weinRelation) + '% ' + (weinRelation >= 70 ? '' : '') + '</span>';
      html += '</div>';
      html += '<div class="meter" style="height:4px;"><i style="width:' + Math.min(100, weinRelation) + '%;background:' + (weinRelation >= 70 ? '#5fae3c' : '#cc0000') + ';"></i></div>';
      
      html += '<div class="stat">';
      html += '<span> Wein Alliance</span>';
      html += '<span style="color:' + (weinAlly ? '#5fae3c' : '#cc0000') + ';">' + (weinAlly ? ' Active' : ' Inactive') + '</span>';
      html += '</div>';
      
      if (!requirementsMet) {
        html += '<p style="color:#ff6b6b;margin-top:8px;"> Requirements not met! You need:</p>';
        html += '<ul style="color:#ff6b6b;font-size:0.85rem;padding-left:20px;">';
        html += '<li>Wein relations above 70% (current: ' + Math.round(weinRelation) + '%)</li>';
        html += '<li>Wein Alliance secured ' + (weinAlly ? '' : '') + '</li>';
        html += '</ul>';
        html += '<p style="font-size:0.85rem;color:#888;">Improve relations with Wein and secure the alliance to unlock this battle.</p>';
      } else {
        html += '<p style="color:#5fae3c;margin-top:8px;"> All requirements met! Wein stands ready to help you destroy the Black League!</p>';
      }
      html += '</div>';
    }
    
    return html;
  }

  function viewPresidentialCandidateSelection() {
    if (!st) {
      return '<h2 class="scene-title">No game active</h2>';
    }
    
    if (st.presidentialChoiceMade) {
      return '<h2 class="scene-title">🗳️ Candidate Selected</h2>' +
        '<p class="lead">You have already chosen your candidate for the presidential election.</p>' +
        '<div class="result-box">' +
        '<p>Your candidate: <b>' + (st.presidentialCandidate || 'None') + '</b></p>' +
        '<p>Campaign bonus: +' + (st.presidentialCampaignBonus || 0) + '%</p>' +
        '<p>Funds remaining: $' + st.funds + '</p>' +
        '</div>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back to Week</button></div>';
    }
    
    var html = '';
    html += '<h2 class="scene-title">🗳️ Choose Your Presidential Candidate</h2>';
    html += '<p class="lead">Select who will represent you in the presidential election.</p>';
    html += '<p class="quiet">Each candidate has different costs and effects if they win.</p>';
    html += '<p class="quiet">💰 Current funds: $' + st.funds + '</p>';
    
    var candidates = [
      {
        id: 'ahmad',
        name: 'Ahmad VI',
        party: 'ZMP',
         
        color: '#5fae3c',
        desc: 'The charismatic leader of the ZMP. A win gives +6% ZMP support across all groups.',
        cost: '$20',
        effect: 'ZMP +6% all groups, Unity +10, Momentum +8',
        ideology: 'Zalgrilianism (Social Monarchism)'
      },
      {
        id: 'bojkanic',
        name: 'Bojkanic',
        party: 'Unity',
         
        color: '#66aaff',
        desc: 'A unity candidate who bridges divides. A win gives +3% ZMP and +3% ZPF.',
        cost: '$10',
        effect: 'ZMP +3%, ZPF +3%, allies gain, Unity +12',
        ideology: 'Centre Unity'
      },
      {
        id: 'iia',
        name: 'IIA Candidate',
        party: 'Tech Alliance',
         
        color: '#2244dd',
        desc: 'The tech candidate. Red and RB naturally support them. A win gives +9% IIA.',
        cost: 'FREE',
        effect: 'IIA +9%, Red +4%, RB +4%, ZMP +2%',
        ideology: 'Technocratic Centre'
      }
    ];
    
    candidates.forEach(function(c) {
      var canAfford = c.id === 'iia' || st.funds >= 20 || (c.id === 'bojkanic' && st.funds >= 10);
      var costNum = c.id === 'ahmad' ? 20 : (c.id === 'bojkanic' ? 10 : 0);
      var canAffordText = (c.id === 'iia' || st.funds >= costNum);
      
      html += '<div class="result-box" style="border:2px solid ' + c.color + ';background:rgba(0,0,0,0.2);margin:10px 0;padding:14px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">';
      html += '<div>';
      html += '<span style="font-size:2rem;">' +  '</span>';
      html += '<span style="font-size:1.2rem;font-weight:bold;color:' + c.color + ';margin-left:8px;">' + c.name + '</span>';
      html += '<span style="font-size:0.8rem;color:#888;margin-left:8px;">(' + c.party + ')</span>';
      html += '</div>';
      html += '<span style="font-size:1.1rem;font-weight:bold;color:' + (canAffordText ? '#5fae3c' : '#cc0000') + ';">' + c.cost + '</span>';
      html += '</div>';
      html += '<div style="font-size:0.85rem;color:#aaa;margin:4px 0;">' + c.ideology + '</div>';
      html += '<div style="font-size:0.9rem;color:#ddd;margin:4px 0;">' + c.desc + '</div>';
      html += '<div style="font-size:0.8rem;color:#ffd700;margin:4px 0;">✨ Effect: ' + c.effect + '</div>';
      html += '<div class="btn-row" style="margin-top:8px;">';
      if (canAffordText) {
        html += '<button class="btn" onclick="UI.selectPresidentialCandidate(\'' + c.id + '\')">Select ' + c.name + '</button>';
      } else {
        html += '<button class="btn" disabled style="opacity:0.5;">Need $' + costNum + ' (have $' + st.funds + ')</button>';
      }
      html += '</div>';
      html += '</div>';
    });
    
    html += '<div class="result-box" style="margin-top:15px;background:rgba(255,215,0,0.05);border:1px solid #ffd700;">';
    html += '<h4 style="color:#ffd700;">💡 Strategy Tips</h4>';
    html += '<ul style="font-size:0.85rem;color:#ddd;padding-left:20px;">';
    html += '<li><b>Ahmad VI</b> - Best for ZMP dominance. Expensive but powerful.</li>';
    html += '<li><b>Bojkanic</b> - Best for coalition building. Moderate cost, broad appeal.</li>';
    html += '<li><b>IIA Candidate</b> - Free option. Good for tech-left alliances.</li>';
    html += '<li>Remember: Other parties run their own candidates too!</li>';
    html += '</ul>';
    html += '</div>';
    
    return html;
  }

  api.selectPresidentialCandidate = function(candidateId) {
    var result = E.resolvePresidentialChoice(st, candidateId, rng);
    if (result && result.length > 0) {
      result.forEach(function(n) { toast(n); });
    }
    if (st.presidentialCandidate) {
      scene = 'week';
      renderAll();
    } else {
      renderAll();
    }
  };

  var newspaper = {
    stories: [],
    lastHeadline: null,
    previousWeek: 0
  };

  function generateNewspaper(st, rng) {
    if (!st) return [];
    
    var stories = [];
    var blSupport = E.getPartySupport ? E.getPartySupport(st, 'bl') : 0;
    var zmpSupport = E.getPartySupport ? E.getPartySupport(st, 'ZMP') : 0;
    var week = st.week || 1;
    
    if (week === newspaper.previousWeek) return newspaper.stories;
    if (week < newspaper.previousWeek + 2 && newspaper.stories.length > 0) {
      return newspaper.stories;
    }
    newspaper.previousWeek = week;
    
    if (blSupport > 40) {
      stories.push({
        headline: '⚫ BLACK LEAGUE SURGES!',
        subhead: 'Students fear as the League\'s influence grows to ' + Math.round(blSupport) + '%',
        body: 'The Black League has tightened its grip on the school. Students report feeling unsafe in the hallways. Faculty is on high alert.',
        color: '#cc0000',
        type: 'crisis'
      });
    } else if (blSupport > 25) {
      stories.push({
        headline: ' Black League on the Move',
        subhead: 'The detention bloc continues to expand its reach',
        body: 'The Black League has been recruiting aggressively. Their message of defiance resonates with disaffected students.',
        color: '#cc6600',
        type: 'warning'
      });
    } else if (blSupport < 10 && st.battle3Won) {
      stories.push({
        headline: ' BLACK LEAGUE CRUSHED!',
        subhead: 'The detention bloc lies in ruins after historic defeat',
        body: 'After months of conflict, the Black League has been defeated. Students celebrate in the hallways. The council\'s victory is complete.',
        color: '#5fae3c',
        type: 'victory'
      });
    }
    
    if (zmpSupport > 45) {
      stories.push({
        headline: '📈 ZMP Dominates the Polls',
        subhead: 'Student Union Coalition reaches new highs at ' + Math.round(zmpSupport) + '%',
        body: 'The ZMP\'s message is resonating with students. Insiders say the coalition\'s unity is at an all-time high.',
        color: '#5fae3c',
        type: 'positive'
      });
    } else if (zmpSupport < 20) {
      stories.push({
        headline: '📉 ZMP in Crisis',
        subhead: 'Internal divisions threaten the coalition\'s future',
        body: 'Factional infighting has paralyzed the ZMP. Students are looking elsewhere for leadership.',
        color: '#cc0000',
        type: 'crisis'
      });
    }
    
    if (st.electionWeeks && st.electionWeeks.indexOf(week) > -1) {
      stories.push({
        headline: '🗳️ ELECTION DAY!',
        subhead: 'Students head to the polls as ' + D.SEATS + ' seats are contested',
        body: 'The school is buzzing with election fever. Voter turnout is expected to be high. Results will be announced tonight!',
        color: '#ffd700',
        type: 'election'
      });
    }
    
    if (st.battle1Lost === true) {
      stories.push({
        headline: ' THE BATTLE OF CA\'UF',
        subhead: 'Devastating defeat shakes the student council',
        body: 'The ZMP and IIA forces were routed at the Field of Ca\'uf. The Black League claims victory. "This is only the beginning," they say.',
        color: '#cc0000',
        type: 'crisis'
      });
    }
    if (st.battle2Won === true) {
      stories.push({
        headline: ' VICTORY AT CA\'UF!',
        subhead: 'Allied forces push back the Black League',
        body: 'In a stunning reversal, the ZMP-led coalition has defeated the Black League at the Second Battle of Ca\'uf. The detention bloc is in retreat.',
        color: '#5fae3c',
        type: 'victory'
      });
    }
    
    var factionNames = {
      'loyalists': 'The Loyalists',
      'girls': 'The Girls\' Caucus',
      'gamers': 'The Gamer Wing',
      'spirit': 'The Spirit Maximalists'
    };
    if (st.faction && factionNames[st.faction]) {
      var fName = factionNames[st.faction];
      var fDesc = {
        'loyalists': 'Continuity and stability are the watchwords. The old guard remains in control.',
        'girls': 'Priya Raman\'s bloc continues to grow. The girls are taking over.',
        'gamers': 'The lab crowd is organizing. Tech policy is back on the agenda.',
        'spirit': 'Spirit week every week! The maximalists are transforming the school.'
      };
      stories.push({
        headline: ' ' + fName + ' in Focus',
        subhead: 'The dominant faction in the ZMP makes its mark',
        body: fDesc[st.faction] || 'The faction is shaping the school\'s direction.',
        color: '#8888cc',
        type: 'feature'
      });
    }
    
    var communityStories = [
      {
        headline: ' Library Renovation Debate',
        subhead: 'Students split on new design proposals',
        body: 'The library renovation has divided the student body. Some want quiet study spaces, others want collaborative areas.'
      },
      {
        headline: '🎭 Drama Club Fundraiser',
        subhead: 'Spring musical budget still unresolved',
        body: 'The drama club is fundraising for their spring production. The council\'s decision on funding remains a hot topic.'
      },
      {
        headline: '🏈 Athletes Demand Better Facilities',
        subhead: 'Petition with 200+ signatures delivered to the council',
        body: 'Athletes are demanding upgrades to the gym and sports fields. The council has promised to review the request.'
      },
      {
        headline: '💻 Wifi Woes Continue',
        subhead: 'Students frustrated by slow internet speeds',
        body: 'The school\'s wifi network continues to struggle. Students report dropped connections during class and club meetings.'
      },
      {
        headline: '🍕 Cafeteria Food Under Fire',
        subhead: 'Student survey reveals widespread dissatisfaction',
        body: 'A student survey has found that 78% of students are unhappy with cafeteria food. The Red Bench is capitalizing on the discontent.'
      },
      {
        headline: '📅 Prom Committee Formed',
        subhead: 'Seniors begin planning the biggest event of the year',
        body: 'The prom committee has been formed and is already fundraising. "This will be the best prom ever," says committee chair.'
      },
      {
        headline: '🎵 Battle of the Bands Announced',
        subhead: 'Annual talent show set for Week ' + (st.week + 4),
        body: 'The school\'s annual Battle of the Bands has been announced. Students are already forming bands and practicing.'
      },
      {
        headline: '🧪 Science Fair Controversy',
        subhead: 'Rumors of stolen project ideas swirl',
        body: 'A scandal is brewing at the science fair. Students are accusing each other of stealing project ideas. Faculty is investigating.'
      }
    ];
    
    if (stories.length < 3) {
      var available = communityStories.filter(function(s) {
        return !newspaper.stories.some(function(existing) {
          return existing.headline === s.headline;
        });
      });
      if (available.length > 0) {
        var pick = available[Math.floor(rng() * available.length)];
        stories.push(pick);
        newspaper.stories.push(pick);
      }
    }
    
    newspaper.stories = stories;
    return stories;
  }

  var saveSlots = {
    slot1: null,
    slot2: null,
    slot3: null,
    auto: null
  };

  function saveGame(slotId) {
    if (!st) {
      toast('No game to save!');
      return;
    }
    
    var saveData = {
      state: JSON.parse(JSON.stringify(st)),
      achievements: E.checkAchievements(st),
      timestamp: Date.now(),
      date: new Date().toLocaleString(),
      week: st.week,
      faction: st.faction,
      seats: st.seats.ZMP || 0,
      version: '1.0'
    };
    
    try {
      localStorage.setItem('classCouncil_save_' + slotId, JSON.stringify(saveData));
      saveSlots[slotId] = saveData;
      toast(' Game saved to ' + slotId + '!');
      renderAll();
    } catch(e) {
      toast(' Save failed: ' + e.message);
    }
  }

  function loadGame(slotId) {
    try {
      var raw = localStorage.getItem('classCouncil_save_' + slotId);
      if (!raw) {
        toast('No save found in ' + slotId);
        return;
      }
      
      var saveData = JSON.parse(raw);
      st = saveData.state;
      
      scene = 'week'; 
      renderAll();
      
      toast(' Game loaded from ' + slotId + ' (Week ' + st.week + ')');
    } catch(e) {
      toast(' Load failed: ' + e.message);
    }
  }

  function deleteSave(slotId) {
    if (confirm('Delete save from ' + slotId + '?')) {
      localStorage.removeItem('classCouncil_save_' + slotId);
      saveSlots[slotId] = null;
      toast('🗑️ Save deleted.');
      renderAll();
    }
  }

  function getSaveInfo(slotId) {
    try {
      var raw = localStorage.getItem('classCouncil_save_' + slotId);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) {
      return null;
    }
  }

  function autoSave() {
    if (st && st.week % 5 === 0 && st.week > 1) {
      try {
        var saveData = {
          state: JSON.parse(JSON.stringify(st)),
          achievements: E.checkAchievements(st),
          timestamp: Date.now(),
          date: new Date().toLocaleString(),
          week: st.week,
          faction: st.faction,
          seats: st.seats.ZMP || 0,
          version: '1.0'
        };
        localStorage.setItem('classCouncil_save_auto', JSON.stringify(saveData));
      } catch(e) {}
    }
  }

  function viewAIRefPrompt() {
    var ref = st.pendingAIRef;
    if (!ref) return '';
    var p = party(ref.partyId);
    var color = p ? p.color : '#ff6b6b';
    
    var html = '<h2 class="scene-title">Opposition Referendum</h2>';
    html += '<p class="lead" style="color:' + color + ';">The <b>' + esc(p ? p.short : ref.partyId) + '</b> has called a snap referendum.</p>';
    
    html += '<div class="result-box" style="border:2px solid ' + color + '; padding:20px; margin:20px 0; text-align:center;">';
    html += '<h3 style="font-size:1.4rem; color:#fff; margin-bottom:10px;">"' + esc(ref.def.name) + '"</h3>';
    html += '<p style="color:#aaa; font-style:italic;">' + esc(ref.def.desc) + '</p>';
    html += '<hr class="rule" style="margin:15px 0;">';
    
    html += '<div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.1rem;">';
    html += '<span>Projected Support:</span>';
    html += '<span style="color:' + (ref.baseSupport >= ref.threshold ? '#5fae3c' : '#cc0000') + ';">' + Math.round(ref.baseSupport) + '%</span>';
    html += '</div>';
    html += '<div style="display:flex; justify-content:space-between; color:#888; font-size:0.9rem;">';
    html += '<span>Required Threshold:</span>';
    html += '<span>' + ref.threshold + '%</span>';
    html += '</div>';
    
    html += '</div>';
    
    html += '<p style="text-align:center; margin-bottom:20px;">Do you campaign for or against this referendum? Your support or opposition will shift the final vote.</p>';
    
    html += '<div class="btn-row" style="justify-content:center;">';
    html += '<button class="btn" style="background:#2e6b1f; border-color:#5fae3c; width:180px;" onclick="UI.resolveAIRef(\'support\')">Support It</button>';
    html += '<button class="btn" style="background:#7a0000; border-color:#cc0000; width:180px;" onclick="UI.resolveAIRef(\'oppose\')">Oppose It</button>';
    html += '<button class="btn alt" style="width:180px;" onclick="UI.resolveAIRef(\'neutral\')">Stay Neutral</button>';
    html += '</div>';
    
    return html;
  }

  api.resolveAIRef = function(choice) {
    var voteData = E.resolveAIRefWithPlayerChoice(st, choice, rng);
    if (!voteData) { renderAll(); return; }
    
    st.pendingReferendumVote = voteData;
    
    // Play the AI referendum music
    try { playMusic('referendum_ai.mp3'); } catch(e) {}

    scene = 'referendum_vote';
    renderAll();
  };

  function viewReferendums() {
    if (!st) {
      return '<h2 class="scene-title">Constitutional Referendums</h2><p>Start a game first.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'title\')">Back</button></div>';
    }
    var factionObj = faction(st.faction);
    var isZMPFaction = factionObj && ['zalgrilian', 'securro', 'secularists'].indexOf(factionObj.id) !== -1;

    var html = '<h2 class="scene-title">Constitutional Referendums</h2>';
    if (!isZMPFaction) {
      return html + '<p>Your faction does not use the parliamentary referendum process.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
    }

    var P = E.getPlayerPartyId(st);
    var inGov       = E.isZMPInGovernment(st);
    var justiceDone = st.justiceReformDone ||
      (st.blackLeagueInvestigated && st.blackLeagueProsecuted);
    var threshold   = E.getReferendumThreshold(st, P);
    var canCall     = E.canInitiateReferendum(st, P);

    if (st.monarchyRestored && !st.royalDecreeThreshold) {
      html += '<div class="result-box" style="border:2px solid #ffd700; background:rgba(255,215,0,0.1); margin-bottom:15px;">';
      html += '<h3 style="color:#ffd700;">Royal Prerogative</h3>';
      html += '<p>King Ahmad VI can bypass the council and decree that the referendum threshold is permanently lowered to 50%.</p>';
      html += '<button class="btn" onclick="UI.decreeThreshold()" style="background:#cc9900; border-color:#ffcc00;">Decree Threshold to 50%</button>';
      html += '</div>';
    }
    html += '<div class="ref-status-row"><span>ZMP in government</span><span class="v">' + (inGov ? 'Yes' : 'No') + '</span></div>';
    html += '<div class="ref-status-row"><span>Justice reforms complete</span><span class="v">' + (justiceDone ? 'Yes' : 'No') + '</span></div>';
    html += '<div class="ref-status-row"><span>Threshold to pass</span><span class="v gold">' + threshold + '%</span></div>';
    if (!canCall.ok) {
      html += '<div class="ref-status-warning">' + esc(canCall.msg) + '</div>';
    }
    html += '</div>';

    var defs = E.getAvailableReferendums(st, E.getPlayerPartyId(st));
    if (!defs || !defs.length) {
      html += '<p>No referendums available.</p>';
    } else {
      html += '<h3 class="ref-list-title">Available Referendums</h3>';
      for (var i = 0; i < defs.length; i++) {
        var d = defs[i];
        var predicted = E.calculateReferendumSupport(st, E.getPlayerPartyId(st), Math.random);
        var willPass  = predicted >= threshold;
        var close     = !willPass && predicted >= threshold - 5;
        var cls       = willPass ? 'likely' : (close ? 'uncertain' : 'unlikely');
        var label     = willPass ? 'LIKELY' : (close ? 'UNCERTAIN' : 'UNLIKELY');

        html += '<div class="ref-card ' + cls + '">';
        html += '<h4 class="ref-card-title">' + esc(d.name) + '</h4>';
        html += '<p class="ref-card-desc">' + esc(d.desc) + '</p>';
        html += '<div class="ref-card-support"><span>Predicted support</span>' +
          '<span class="v">' + Math.round(predicted) + '% — ' + label + '</span></div>';
        html += '<div class="ref-card-cost">Costs: 2 AP, $20</div>';
        html += '<div class="btn-row">' +
          '<button class="btn" ' + (canCall.ok ? '' : 'disabled') +
          ' onclick="UI.callReferendum(\'' + d.id + '\')">Call Referendum</button>' +
          '</div>';
        html += '</div>';
      }
    }

    if (!inGov) {
      html += '<div class="ref-opposition">';
      html += '<h3>Opposition Referendum Threat</h3>';
      html += '<p>While ZMP is out of government, other parties may call referendums (threshold 70%).</p>';
      ['zpf', 'iia', 'bl'].forEach(function(pid) {
        if (!st.raw[pid] || st.merged.indexOf(pid) !== -1) return;
        var partyDefs = E.getAvailableReferendums(st, pid);
        if (!partyDefs.length) return;
        var p = party(pid);
        var color = p ? p.color : '#999';
        html += '<div class="ref-opposition-party" style="border-left-color:' + color + ';">' +
          '<b style="color:' + color + ';">' + (p ? esc(p.short) : pid) + '</b>' +
          ' — ' + partyDefs.length + ' possible referendum' + (partyDefs.length > 1 ? 's' : '') +
          '</div>';
      });
      html += '</div>';
    }

    html += '<div class="btn-row" style="margin-top:16px;">' +
      '<button class="btn alt" onclick="UI.go(\'week\')">Back</button></div>';
    return html;
  }

  function viewReferendumVote() {
    if (!st.pendingReferendumVote) {
      return '<h2 class="scene-title">No referendum in progress</h2>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
    }
    var pr = st.pendingReferendumVote;
    var html = '';
    html += '<h2 class="scene-title">' + esc(pr.name) + '</h2>';
    
    
    if (pr.isAI) {
      var p = party(pr.triggerParty);
      html += '<p class="quiet" style="text-align:center; color:' + (p ? p.color : '#ff6b6b') + '; margin-top:-10px;">Called by the ' + esc(p ? p.short : pr.triggerParty) + '</p>';
    }
    
    html += '<p class="ref-lead">' + esc(pr.desc) + '</p>';
    html += '<div class="ref-canvas-wrap">';
    html += '<canvas id="ref-canvas" class="ref-canvas" title="Click to skip"></canvas>';
    html += '</div>';
    html += '<p class="ref-canvas-hint">Click the chart to skip the count.</p>';
    return html;
  }

  function viewReferendumResult() {
    if (!st.pendingReferendumVote) {
      return '<h2 class="scene-title">No referendum result</h2>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
    }
    var pr       = st.pendingReferendumVote;
    var passed   = pr.passed;
    var finalPct = Math.round(pr.support * 10) / 10;
    var margin   = Math.abs(finalPct - pr.threshold);
    var bannerCls = passed ? 'passed' : 'failed';

    var html = '';
    html += '<h2 class="scene-title">Referendum Result</h2>';

    
    if (pr.isAI) {
      var p = party(pr.triggerParty);
      html += '<p class="quiet" style="text-align:center; color:' + (p ? p.color : '#ff6b6b') + '; margin-top:-10px;">Triggered by the ' + esc(p ? p.short : pr.triggerParty) + '</p>';
    }

    html += '<div class="ref-result-banner ' + bannerCls + '">';
    html += '<div class="ref-result-outcome">' + (passed ? 'PASSED' : 'FAILED') + '</div>';
    html += '<div class="ref-result-name">' + esc(pr.name) + '</div>';
    html += '<div class="ref-result-pct">' + finalPct + '% YES</div>';
    html += '<div class="ref-result-margin">' +
      (passed
        ? 'Exceeded threshold (' + pr.threshold + '%) by ' + margin.toFixed(1) + '%'
        : 'Fell short of threshold (' + pr.threshold + '%) by ' + margin.toFixed(1) + '%') +
      '</div>';
    html += '</div>';

    if (pr.notes && pr.notes.length) {
      html += '<div class="ref-notes">';
      html += '<h3>' + (passed ? 'Consequences' : 'Fallout') + '</h3>';
      pr.notes.forEach(function(n) {
        html += '<div class="ref-note-row">' + esc(n) + '</div>';
      });
      html += '</div>';
    }

    html += '<div class="ref-continue-row">';
    html += '<button class="btn" onclick="UI._finishReferendum()">Continue</button>';
    html += '</div>';

    return html;
  }

    api.decreeThreshold = function() {
    if (!st.monarchyRestored) return;
    st.royalDecreeThreshold = true;
    st.log.push('Week ' + st.week + ': King Ahmad VI decreed the referendum threshold to 50%.');
    toast('Royal Decree: Referendum thresholds permanently lowered to 50%.');
    renderAll();
  };

  api.callSnapElection = function() {
    if (!st.monarchyRestored) return;
    if (st.ap < 3) { toast('Not enough AP (need 3).'); return; }
    
    st.ap -= 3;
    st.electionCycle = (st.electionCycle || 0) + 1;
    
    // Manually trigger the election mechanics
    E.runElection(st, rng);
    var electionData = E.generateElectionEventData(st, rng);
    
    st.pendingEvent = {
      id: 'election_' + st.week,
      week: st.week,
      title: 'ROYAL SNAP ELECTION - ' + E.getElectionLabel(st.electionCycle),
      body: 'King Ahmad VI has dissolved the council. The nation goes to the polls.',
      isElection: true,
      electionData: electionData,
      choices: []
    };
    
    st.eventDone[st.pendingEvent.id] = true;
    st.log.push('Week ' + st.week + ': The King dissolved parliament.');
    scene = 'election';
    renderAll();
  };

  api.callReferendum = function(referendumId) {
    var result = E.initiateReferendum(st, E.getPlayerPartyId(st), referendumId, rng);
    if (!result.ok) { toast(result.msg); return; }

    st.pendingReferendumVote = {
      id:        referendumId,
      name:      result.referendum.name,
      desc:      result.referendum.desc,
      support:   result.support,
      threshold: result.threshold,
      passed:    result.passed,
      notes:     result.notes
    };

    try { playMusic('referendum_zmp.mp3'); } catch (e) {}

    scene = 'referendum_vote';
    renderAll();
  };

  api._finishReferendum = function () {
    st.pendingReferendumVote = null;
    scene = 'week';
    renderAll();
  };

  function drawReferendumCanvas(canvas, counted, pr, elapsed) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var w = rect.width;
    var h = rect.height;

    // 1. Background: Dark tactical/parchment brown-grey
    ctx.fillStyle = '#161412';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < w; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (var gy = 0; gy < h; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    // 2. Header Text
    ctx.fillStyle = '#a8a496';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('T H E   C O U N T', w / 2, 40);

    var phaseText;
    if (elapsed < 500)              phaseText = 'Polls closed. Counting begins.';
    else if (counted < 0.995)       phaseText = 'Ballots are being verified...';
    else                            phaseText = 'Count complete.';
    ctx.fillStyle = '#6a665e';
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillText(phaseText, w / 2, 60);

    // 3. Live Percentage Display (Moved down to prevent overlap)
    var wobble = Math.sin(elapsed / 420) * (1 - counted) * 6;
    var displayYes = Math.max(5, Math.min(95, pr.support + wobble));
    var displayNo  = 100 - displayYes;

    ctx.fillStyle = '#c4c0b8';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText(displayYes.toFixed(1) + '%', w / 2, 135);
    
    ctx.fillStyle = '#8a867e';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillText('YES VOTES', w / 2, 155);

    // 4. The Bar Geometry
    var barX = 60;
    var barW = w - 120;
    var barY = 200;
    var barH = 64;

    // Frame
    ctx.strokeStyle = '#2a2824';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);

    // YES Fill (Muted Green)
    var yesFillW = (displayYes / 100) * barW * counted;
    ctx.fillStyle = '#456536'; 
    ctx.fillRect(barX, barY, yesFillW, barH);

    // NO Fill (Muted Red)
    var noFillW = (displayNo / 100) * barW * counted;
    ctx.fillStyle = '#802525'; 
    ctx.fillRect(barX + barW - noFillW, barY, noFillW, barH);

    // 5. Threshold Marker (Ochre/Gold, thinner)
    var threshX = barX + (pr.threshold / 100) * barW;
    ctx.strokeStyle = '#b89b4a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(threshX, barY - 16);
    ctx.lineTo(threshX, barY + barH + 16);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#b89b4a';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('THRESHOLD ' + pr.threshold + '%', threshX, barY - 24);

    // 6. Bar Labels (Only draw if the bar is wide enough)
    if (yesFillW > 50) {
      ctx.fillStyle = '#e8e0c0';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText('YES', barX + 12, barY + barH / 2 + 6);
      ctx.textAlign = 'right';
      ctx.fillText(displayYes.toFixed(1) + '%', barX + yesFillW - 10, barY + barH / 2 + 6);
    }

    if (noFillW > 50) {
      ctx.fillStyle = '#e8e0c0';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(displayNo.toFixed(1) + '%', barX + barW - noFillW + 10, barY + barH / 2 + 6);
      ctx.textAlign = 'right';
      ctx.fillText('NO', barX + barW - 12, barY + barH / 2 + 6);
    }

    // 7. Scale Ticks
    ctx.fillStyle = '#6a665e';
    ctx.font = '10px Georgia, serif';
    ctx.textAlign = 'center';
    for (var i = 0; i <= 10; i++) {
      var x = barX + (i / 10) * barW;
      ctx.fillText((i * 10) + '%', x, barY + barH + 24);
      ctx.strokeStyle = '#3a3834';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, barY + barH + 4);
      ctx.lineTo(x, barY + barH + 8);
      ctx.stroke();
    }

    // 8. Ballot Count & Progress
    var totalBallots   = 1243;
    var ballotsCounted = Math.floor(counted * totalBallots);
    ctx.fillStyle = '#8a867e';
    ctx.font = '12px monospace'; // Monospace just for the numbers feels like a ticker
    ctx.textAlign = 'center';
    ctx.fillText(
      ballotsCounted.toLocaleString() + ' / ' + totalBallots.toLocaleString() + ' BALLOTS COUNTED',
      w / 2, barY + barH + 64
    );

    var progY = barY + barH + 80;
    var progH = 4; // Thinner, less modern
    var progX = barX;
    var progW = barW;
    
    // Progress track
    ctx.fillStyle = '#1a1815';
    ctx.fillRect(progX, progY, progW, progH);
    
    // Progress fill
    ctx.fillStyle = '#456536';
    ctx.fillRect(progX, progY, progW * counted, progH);

    // No pulsing neon dots, just a simple indicator
    if (counted > 0 && counted < 0.998) {
      var dotX = progX + progW * counted;
      ctx.fillStyle = '#b89b4a';
      ctx.fillRect(dotX - 2, progY - 2, 4, progH + 4);
    }
  }

  function startReferendumAnimation() {
    var canvas = document.getElementById('ref-canvas');
    if (!canvas || !st || !st.pendingReferendumVote) return;

    var pr = st.pendingReferendumVote;
    var startTime      = performance.now();
    var delayMs        = 500;
    var fillDurationMs = 4500;
    var holdMs         = 1200;
    var totalMs        = delayMs + fillDurationMs + holdMs;
    var safetyMs       = totalMs + 3000;

    canvas.style.cursor = 'pointer';
    canvas.onclick = function () {
      if (scene === 'referendum_vote' && st && st.pendingReferendumVote) {
        scene = 'referendum_result';
        renderAll();
      }
    };

    function frame(now) {
      if (scene !== 'referendum_vote' || !st || !st.pendingReferendumVote) return;
      var elapsed = now - startTime;

      if (elapsed > safetyMs) {
        scene = 'referendum_result';
        renderAll();
        return;
      }

      var counted;
      if (elapsed < delayMs) {
        counted = 0;
      } else if (elapsed < delayMs + fillDurationMs) {
        var t = (elapsed - delayMs) / fillDurationMs;
        counted = 1 - Math.pow(1 - t, 2.5);
      } else {
        counted = 1;
      }

      drawReferendumCanvas(canvas, counted, pr, elapsed);

      if (elapsed < totalMs) {
        requestAnimationFrame(frame);
      } else {
        scene = 'referendum_result';
        renderAll();
      }
    }

    requestAnimationFrame(frame);
  }


  function viewNewspaper() {
    if (!st) {
      return '<h2>📰 Student Newspaper</h2><p class="lead">Start a game to read the news.</p>';
    }
    
    var stories = generateNewspaper(st, rng);
    
    var html = '';
    html += '<h2>📰 The Student Voice</h2>';
    html += '<p class="lead">Weekly news from around the school.</p>';
    html += '<div style="max-height:400px;overflow-y:auto;">';
    
    if (stories.length === 0) {
      html += '<div class="stat sub">No news this week. Quiet times.</div>';
    }
    
    stories.forEach(function(s) {
      var borderColor = s.color || '#888';
      
      
      
      html += '<div class="result-box" style="border-left:4px solid ' + borderColor + ';margin:6px 0;padding:10px 14px;">';
      html += '<div style="font-size:1.1rem;font-weight:700;">'  + ' ' + esc(s.headline) + '</div>';
      if (s.subhead) {
        html += '<div style="font-size:0.85rem;color:#aaa;font-style:italic;margin:2px 0 4px 0;">' + esc(s.subhead) + '</div>';
      }
      html += '<div style="font-size:0.9rem;color:#ddd;line-height:1.5;">' + esc(s.body) + '</div>';
      html += '</div>';
    });
    
    html += '</div>';
    html += '<div class="stat sub" style="margin-top:8px;font-size:0.75rem;">📰 ' + (stories.length) + ' stories this week</div>';
    
    return html;
  }

  function viewPresidentialResults() {
    var ev = st.pendingEvent;
    if (!ev) {
      return '<h2 class="scene-title">No election data available</h2>';
    }
    
    var detailedResults = (ev.electionData && ev.electionData.detailed) 
        ? ev.electionData.detailed 
        : E.generatePresidentialResults(st, rng);
    
    var html = '';
    
    html += '<h2 class="scene-title"> PRESIDENTIAL ELECTION RESULTS</h2>';
    html += '<p class="lead">The school has elected a new Student Body President</p>';
    
    html += '<div class="result-box" style="border:2px solid #ffd700;background:rgba(255,215,0,0.05);margin-bottom:15px;">';
    html += '<div style="text-align:center;">';
    html += '<div style="font-size:0.8rem;color:#888;text-transform:uppercase;letter-spacing:0.1em;"> WINNER</div>';
    html += '<div style="font-size:2rem;font-weight:bold;color:#ffd700;">' + esc(detailedResults.winner || 'Unknown') + '</div>';
    html += '<div style="font-size:1rem;color:#aaa;">' + esc(detailedResults.winnerParty || '') + ' — ' + detailedResults.winnerVotes + '%</div>';
    if (detailedResults.secondPlace) {
      html += '<div style="font-size:0.8rem;color:#888;margin-top:5px;">Runner-up: ' + esc(detailedResults.secondPlace) + ' (' + detailedResults.secondParty + ') — ' + Math.round(detailedResults.margin) + '% behind</div>';
    }
    html += '<div style="font-size:0.8rem;color:#888;margin-top:5px;">Turnout: ' + detailedResults.turnout + '% • ' + detailedResults.totalVotes + ' votes cast</div>';
    html += '</div>';
    html += '</div>';
    
    if (detailedResults.round1Results) {
      html += '<div class="result-box" style="margin-bottom:15px;">';
      html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;">Round 1 Results</h3>';
      detailedResults.round1Results.forEach(function(c) {
        var barWidth = Math.max(5, (c.percent / (detailedResults.round1Results[0] ? detailedResults.round1Results[0].percent : 100)) * 100);
        var isWinner = c.name === detailedResults.winner;
        html += '<div style="margin:4px 0;">';
        html += '<div style="display:flex;justify-content:space-between;">';
        html += '<span>' + c.name + ' (' + c.party + ')' + (isWinner ? ' ' : '') + '</span>';
        html += '<span>' + c.percent + '%</span>';
        html += '</div>';
        html += '<div class="meter" style="height:8px;"><i style="width:' + barWidth + '%;background:' + (isWinner ? '#ffd700' : '#666') + ';"></i></div>';
        html += '</div>';
      });
      html += '</div>';
    }
    
    if (detailedResults.runoffResults) {
      html += '<div class="result-box" style="margin-bottom:15px;border:2px solid #ffd700;">';
      html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;"> RUNOFF ELECTION</h3>';
      html += '<p class="quiet" style="text-align:center;">Top 3 candidates advanced to the runoff</p>';
      detailedResults.runoffResults.forEach(function(c) {
        var barWidth = Math.max(5, (c.percent / (detailedResults.runoffResults[0] ? detailedResults.runoffResults[0].percent : 100)) * 100);
        var isWinner = c.name === detailedResults.winner;
        html += '<div style="margin:4px 0;">';
        html += '<div style="display:flex;justify-content:space-between;">';
        html += '<span>' + c.name + ' (' + c.party + ')' + (isWinner ? ' ' : '') + '</span>';
        html += '<span>' + c.percent + '%</span>';
        html += '</div>';
        html += '<div class="meter" style="height:8px;"><i style="width:' + barWidth + '%;background:' + (isWinner ? '#ffd700' : '#666') + ';"></i></div>';
        html += '</div>';
      });
      html += '</div>';
    }
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;">Regional Breakdown</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';
    var regionKeys = Object.keys(detailedResults.stateResults);
    regionKeys.forEach(function(region) {
      var r = detailedResults.stateResults[region];
      html += '<div style="background:rgba(255,255,255,0.03);border-radius:4px;padding:8px 10px;">';
      html += '<div style="font-weight:bold;font-size:0.85rem;color:#aaa;border-bottom:1px solid #222;padding-bottom:3px;margin-bottom:4px;">' + esc(region) + '</div>';
      var sorted = Object.keys(r.results).sort(function(a, b) {
        return r.results[b] - r.results[a];
      }).slice(0, 3);
      sorted.forEach(function(pid) {
        var p = E.getParty(pid);
        var color = (pid === 'zpf') ? '#006400' : (p ? p.color : '#888');
        var pct = Math.round(r.results[pid]);
        var isWinner = pid === r.winner;
        html += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;' + (isWinner ? 'color:#ffd700;' : '') + '">';
        html += '<span style="color:' + color + ';">' + (p ? esc(p.short) : pid) + '</span>';
        html += '<span>' + pct + '%' + (isWinner ? ' ' : '') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    
    if (detailedResults.endorsements && detailedResults.endorsements.length > 0) {
      html += '<div class="result-box" style="margin-bottom:15px;">';
      html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;">📰 Endorsements</h3>';
      var endorsementsByCandidate = {};
      detailedResults.endorsements.forEach(function(e) {
        if (!endorsementsByCandidate[e.candidate]) endorsementsByCandidate[e.candidate] = [];
        endorsementsByCandidate[e.candidate].push(e);
      });
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
      for (var candidate in endorsementsByCandidate) {
        var endorsements = endorsementsByCandidate[candidate];
        html += '<div style="background:rgba(255,255,255,0.03);border-radius:4px;padding:8px 10px;">';
        html += '<div style="font-weight:bold;color:#ffd700;font-size:0.85rem;">' + esc(candidate) + '</div>';
      
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }
    
    html += '<div class="btn-row">';
    html += '<button class="btn" onclick="UI.advanceFromElection()">Continue</button>';
    html += '</div>';
    
    return html;
  }

  function viewPartyCongress() {
    if (!st) {
      return '<h2 class="scene-title"> Party Congress</h2><p class="lead">Start a game to manage your party.</p>';
    }
    
    var congress = st.congress;
    if (!congress) {
      initPartyCongress(st);
      congress = st.congress;
    }
    
    var html = '';
    html += '<h2 class="scene-title"> ZMP Party Congress</h2>';
    html += '<p class="lead">Manage your party\'s policies and internal factions.</p>';
    
    html += '<div class="result-box" style="border:2px solid #ffd700;margin-bottom:15px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="font-size:1.2rem;"> Congress Points</span>';
    html += '<span style="font-size:2rem;color:#ffd700;font-weight:bold;">' + congress.points + '</span>';
    html += '</div>';
    html += '<div style="font-size:0.8rem;color:#888;">Earn points through party actions and congress resolutions</div>';
    if (congress.nextCongressWeek) {
      html += '<div style="font-size:0.8rem;color:#888;margin-top:4px;">Next Congress Session: Week ' + congress.nextCongressWeek + '</div>';
    }
    html += '</div>';
    
    if (congress.activeResolution) {
      var res = congress.activeResolution;
      html += '<div class="result-box" style="border:2px solid #ff6b6b;margin-bottom:15px;">';
      html += '<h3 style="color:#ff6b6b;"> CONGRESS IN SESSION</h3>';
      html += '<p>' + esc(res.desc) + '</p>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">';
      res.options.forEach(function(opt, i) {
        html += '<button class="act" onclick="UI.resolveCongress(' + i + ')" style="text-align:left;">';
        html += '<b>' + esc(opt.text) + '</b>';
        html += '<span class="d" style="color:#ffcc00;">' + esc(opt.desc) + '</span>';
        html += '</button>';
      });
      html += '</div>';
      html += '</div>';
    } else if (st.week >= (congress.nextCongressWeek || 13)) {
      html += '<div class="btn-row" style="margin:10px 0;">';
      html += '<button class="btn" onclick="UI.callCongress()"> Call a Party Congress</button>';
      html += '</div>';
    }
    
    html += '<h3>📋 Party Policies</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    var policyNames = {
      education: ' Education',
      economy: '💰 Economy',
      healthcare: '🏥 Healthcare',
      infrastructure: '🏗️ Infrastructure',
      justice: '⚖️ Justice',
      technology: '💻 Technology',
      arts: '🎭 Arts',
      sports: '🏅 Sports'
    };
    for (var pid in congress.policies) {
      var p = congress.policies[pid];
      var canUpgrade = congress.points >= p.cost && p.level < p.max;
      var name = policyNames[pid] || pid;
      html += '<div style="background:rgba(255,255,255,0.03);border-radius:4px;padding:8px 12px;border-left:3px solid ' + (p.level >= p.max ? '#5fae3c' : '#666') + ';">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<span style="font-weight:bold;">' + name + '</span>';
      html += '<span>Level ' + p.level + '/' + p.max + '</span>';
      html += '</div>';
      html += '<div class="meter" style="height:4px;margin:4px 0;"><i style="width:' + ((p.level / p.max) * 100) + '%;background:' + (p.level >= p.max ? '#5fae3c' : '#ffd700') + ';"></i></div>';
      html += '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#888;">';
      html += '<span>Cost: ' + p.cost + ' points</span>';
      if (p.level < p.max) {
        html += '<button class="chip" ' + (canUpgrade ? '' : 'disabled style="opacity:0.5;"') + ' onclick="UI.upgradePolicy(\'' + pid + '\')">';
        html += 'Upgrade';
        html += '</button>';
      } else {
        html += '<span style="color:#5fae3c;"> MAX</span>';
      }
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
    
    html += '<h3 style="margin-top:15px;">⚖️ Faction Influence</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">';
    var factionNames = {
      loyalists: ' Loyalists',
      gamers: '🎮 Gamers',
      girls: '👩 Girls',
      spirit: '✨ Spirit'
    };
    var totalInfluence = 0;
    for (var fid in congress.factionInfluence) {
      totalInfluence += congress.factionInfluence[fid];
    }
    for (var fid in congress.factionInfluence) {
      var inf = congress.factionInfluence[fid];
      var pct = totalInfluence > 0 ? Math.round((inf / totalInfluence) * 100) : 25;
      var isActive = fid === congress.currentFaction;
      html += '<div style="background:rgba(255,255,255,0.03);border-radius:4px;padding:6px 10px;' + (isActive ? 'border:1px solid #ffd700;' : '') + '">';
      html += '<div style="display:flex;justify-content:space-between;">';
      html += '<span>' + (factionNames[fid] || fid) + '</span>';
      html += '<span>' + pct + '%</span>';
      html += '</div>';
      html += '<div class="meter" style="height:3px;"><i style="width:' + pct + '%;background:' + (isActive ? '#ffd700' : '#666') + ';"></i></div>';
      html += '</div>';
    }
    html += '</div>';
    
    if (congress.congressHistory && congress.congressHistory.length > 0) {
      html += '<h3 style="margin-top:15px;">📜 Congress History</h3>';
      html += '<div style="max-height:120px;overflow-y:auto;font-size:0.8rem;">';
      var history = congress.congressHistory.slice(-10).reverse();
      history.forEach(function(h) {
        html += '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #222;">';
        html += '<span>Week ' + h.week + ': ' + h.reason + '</span>';
        html += '<span style="color:#ffd700;">+' + h.points + '⭐</span>';
        html += '</div>';
      });
      html += '</div>';
    }
    
    return html;
  }

  api.callCongress = function() {
    var result = E.callPartyCongress(st, rng);
    if (!result.ok) {
      toast(result.msg);
      return;
    }
    toast(' Congress is now in session!');
    renderAll();
  };

  api.resolveCongress = function(optionIndex) {
    var result = E.resolveCongress(st, optionIndex, rng);
    if (!result.ok) {
      toast(result.msg);
      return;
    }
    if (result.notes) {
      result.notes.forEach(function(n) { toast(n); });
    }
    renderAll();
  };

  api.upgradePolicy = function(policyId) {
    var result = E.upgradePolicy(st, policyId);
    if (!result.ok) {
      toast(result.msg);
      return;
    }
    toast(result.msg);
    renderAll();
  };

  var audioContext = null;

  function playMusic(filename, toastMessage) {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      var audioUrl = 'js/' + filename;
      
      fetch(audioUrl)
        .then(function(response) {
          if (!response.ok) {
            throw new Error('Audio file not found: ' + audioUrl);
          }
          return response.arrayBuffer();
        })
        .then(function(arrayBuffer) {
          return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(function(audioBuffer) {
          var source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          
          var gainNode = audioContext.createGain();
          gainNode.gain.value = 0.7;
          
          source.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          source.start(0);
          
          console.log('🎵 Music playing:', filename);
          if (toastMessage) {
            toast(toastMessage);
          }
        })
        .catch(function(error) {
          console.warn('Could not play music:', error);
          try {
            var fallback = new Audio('js/' + filename);
            fallback.volume = 0.7;
            fallback.play().catch(function(e) {
              console.warn('Fallback audio also failed:', e);
            });
          } catch(e2) {
            console.warn('All audio playback failed:', e2);
          }
        });
        
    } catch(e) {
      console.warn('Audio playback failed:', e);
    }
  }

  function playGreenAndWhite() {
    playMusic('green_and_white.mp3', ' The monarchy is established!');
  }

  function playArb() {
    playMusic('arb.mp3', ' Victory with Wein! The Black League is destroyed!');
  }

  function checkForNaturalGoverningMusic(st) {
    if (!st) return;
    
    var isNaturalGoverning = st.endingData && 
                             (st.endingData.ending === 'natural_governing' || 
                              st.endingData.endingNumber === 'Ending 3');
    
    if (isNaturalGoverning) {
      if (!st._greenAndWhitePlayed) {
        st._greenAndWhitePlayed = true;
        playGreenAndWhite();
      }
    }
  }

  function checkForBattle4Victory(st) {
    if (!st) return;
    
    if (st.battle4Completed === true && st.hasArbeiterAlly === true) {
      if (!st._arbPlayed) {
        st._arbPlayed = true;
        playArb();
      }
    }
  }

  var originalNaturalGoverning = api.naturalGoverning;
  api.naturalGoverning = function() {
    if (originalNaturalGoverning) {
      originalNaturalGoverning.call(api);
    }
    
    if (st) {
      st._justNaturalGoverning = true;
      st._victoryMusicPlayed = true;
      playVictoryMusic();
    }
  };

  function findMinisterById(id) {
    var ministers = E.AVAILABLE_MINISTERS || {};
    for (var faction in ministers) {
      var ministerList = ministers[faction];
      for (var i = 0; i < ministerList.length; i++) {
        if (ministerList[i].id === id) return ministerList[i];
      }
    }
    return null;
  }

  api.advanceFromElection = function () {
    console.log('advanceFromElection called, current week:', st.week);
    
    if (st.pendingEvent && st.pendingEvent.id) {
      st.eventDone[st.pendingEvent.id] = true; // <-- Prevents the same event from firing again
    }
    
    st.pendingEvent = null;
    st.week += 1;
    
    E.snapshot(st, 'Week ' + st.week);
    
    var ev = eventForWeek(st.week);
    if (ev) {
      st.pendingEvent = ev;
      scene = 'event';
    } else {
      scene = 'week';
    }
    
    renderAll();
  };

  function viewElectionVote() {
    var html = '';
    html += '<h2 class="scene-title">ELECTION NIGHT</h2>';
    html += '<p class="ref-lead" style="text-align:center;">The ballots are being counted. The fate of the council is being decided.</p>';
    html += '<div class="ref-canvas-wrap" style="height:480px;">';
    html += '<canvas id="election-canvas" class="ref-canvas" title="Click to skip"></canvas>';
    html += '</div>';
    html += '<p class="ref-canvas-hint">Click the chart to skip the count.</p>';
    return html;
  }

  function drawElectionCanvas(canvas, counted, data, elapsed, revealedRegions) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var w = rect.width;
    var h = rect.height;

    ctx.fillStyle = '#11100e';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < w; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }

    ctx.fillStyle = '#a8a496';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('ELECTION NIGHT', w / 2, 30);
    
    ctx.fillStyle = '#6a665e';
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillText('Live Regional Results', w / 2, 50);

    var regions = [
      { id: 'North Wing', x: w * 0.35, y: h * 0.15, w: w * 0.3, h: h * 0.18 },
      { id: 'West Wing', x: w * 0.1, y: h * 0.35, w: w * 0.2, h: h * 0.2 },
      { id: 'Central Hall', x: w * 0.35, y: h * 0.38, w: w * 0.3, h: h * 0.15 },
      { id: 'East Wing', x: w * 0.7, y: h * 0.35, w: w * 0.2, h: h * 0.2 },
      { id: 'Science Block', x: w * 0.15, y: h * 0.6, w: w * 0.2, h: h * 0.15 },
      { id: 'Arts Building', x: w * 0.65, y: h * 0.6, w: w * 0.2, h: h * 0.15 },
      { id: 'South Wing', x: w * 0.35, y: h * 0.65, w: w * 0.3, h: h * 0.18 }
    ];

    var stateResults = data.stateResults || {};

    regions.forEach(function(r) {
      var isRevealed = revealedRegions.indexOf(r.id) !== -1;
      var res = stateResults[r.id];
      
      ctx.fillStyle = '#1a1815';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      if (isRevealed && res) {
        // Blend the colors of all parties proportionally
        var totalR = 0, totalG = 0, totalB = 0, totalPct = 0;
        
        for (var pid in res.results) {
          var pct = res.results[pid];
          if (pct <= 0) continue;
          
          var p = party(pid);
          var hex = p ? p.color : '#888888';
          
          if (hex.length === 4) {
            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
          }
          
          var rVal = parseInt(hex.substring(1, 3), 16) || 0;
          var gVal = parseInt(hex.substring(3, 5), 16) || 0;
          var bVal = parseInt(hex.substring(5, 7), 16) || 0;
          
          totalR += rVal * pct;
          totalG += gVal * pct;
          totalB += bVal * pct;
          totalPct += pct;
        }
        
        var blendColor = '#333';
        if (totalPct > 0) {
          blendColor = 'rgb(' + 
            Math.round(totalR / totalPct) + ',' + 
            Math.round(totalG / totalPct) + ',' + 
            Math.round(totalB / totalPct) + ')';
        }
        
        ctx.fillStyle = blendColor;
        ctx.fillRect(r.x, r.y, r.w, r.h);

        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(r.x, r.y + r.h/2 - 16, r.w, 32);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(r.id, r.x + r.w/2, r.y + r.h/2 - 2);
        
        ctx.font = '11px Georgia, serif';
        var winnerId = res.winner;
        var pw = party(winnerId);
        var winnerPct = Math.round(res.winnerVotes);
        ctx.fillText((pw ? pw.short : winnerId) + ' ' + winnerPct + '%', r.x + r.w/2, r.y + r.h/2 + 12);
        
      } else {
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#444';
        ctx.font = 'bold 12px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(r.id, r.x + r.w/2, r.y + r.h/2);
        ctx.font = '10px Georgia, serif';
        ctx.fillText('REPORTING...', r.x + r.w/2, r.y + r.h/2 + 15);
      }
    });

    var tickerY = h - 40;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, tickerY, w, 40);
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0, tickerY);
    ctx.lineTo(w, tickerY);
    ctx.stroke();

    var tickerText = 'Awaiting first returns...';
    if (revealedRegions.length > 0) {
      var lastRegion = revealedRegions[revealedRegions.length - 1];
      var lastRes = stateResults[lastRegion];
      if (lastRes) {
         var p = party(lastRes.winner);
         tickerText = 'PROJECTED: ' + lastRegion + ' goes to ' + (p ? p.short : lastRes.winner) + ' with ' + Math.round(lastRes.winnerVotes) + '% of the vote.';
      }
    }
    
    ctx.fillStyle = '#c4c0b8';
    ctx.font = 'italic 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WIRE REPORT: ' + tickerText, 20, tickerY + 24);
  }


  function startFieldDayAnimation() {
    var canvas = document.getElementById('field-day-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.clientWidth;
    var h = canvas.height = canvas.clientHeight;
    
    var startTime = performance.now();
    
    function frame(now) {
      var elapsed = now - startTime;
      ctx.clearRect(0, 0, w, h);
      
      // Draw the rope
      var ropeY = h / 2;
      var knotX = w / 2 + Math.sin(elapsed / 300) * 30; // Rope shifts back and forth
      
      // Ground
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, ropeY + 20, w, h);
      
      // Left Team (ZMP)
      ctx.fillStyle = '#5fae3c';
      ctx.fillRect(0, ropeY, knotX - 20, 10);
      ctx.fillStyle = '#7fdf7f';
      ctx.font = 'bold 24px Georgia';
      ctx.fillText('ZMP', 40, ropeY - 20);
      
      // Right Team (Opposition)
      ctx.fillStyle = '#cc0000';
      ctx.fillRect(knotX + 20, ropeY, w - knotX - 20, 10);
      ctx.fillStyle = '#ff6060';
      ctx.fillText('OPPOSITION', w - 200, ropeY - 20);
      
      // Knot
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(knotX, ropeY + 5, 15, 0, Math.PI * 2);
      ctx.fill();
      
      if (elapsed < 3000) {
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  }

  api.startFieldDayVote = function() {
    scene = 'event';
    renderAll();
  };




  function startElectionAnimation() {
    var canvas = document.getElementById('election-canvas');
    if (!canvas || !st || !st.pendingEvent) return;

    var ev = st.pendingEvent;
    var isPres = ev.id.indexOf('presidential') !== -1;

    // Ensure we have stateResults generated and SAVED to the event
    if (!ev.electionData) ev.electionData = {};
    if (!ev.electionData.stateResults) {
       var detailed = isPres ? E.generatePresidentialResults(st, rng) : E.generateDetailedElectionResults(st, rng);
       ev.electionData.stateResults = detailed.stateResults;
       ev.electionData.detailed = detailed; 
    }
    
    var data = ev.electionData;
    
    // Get all regions and shuffle them to simulate random reporting
    var regionKeys = Object.keys(data.stateResults || {});
    for (var i = regionKeys.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = regionKeys[i];
      regionKeys[i] = regionKeys[j];
      regionKeys[j] = temp;
    }
    
    var revealedRegions = [];
    var startTime = performance.now();
    var totalDuration = 6000; 
    var timePerRegion = totalDuration / (regionKeys.length || 1);
    var holdMs = 1500;
    var safetyMs = totalDuration + holdMs + 3000;

    canvas.style.cursor = 'pointer';
    canvas.onclick = function () {
      if (st.pendingEvent) {
        st.pendingEvent.hasAnimated = true;
        scene = 'event'; // <-- Changed from 'election' to 'event'
        renderAll();
      }
    };

    function frame(now) {
      if (!st || !st.pendingEvent) return;
      var elapsed = now - startTime;

      if (elapsed > safetyMs) {
        st.pendingEvent.hasAnimated = true;
        scene = 'event'; // <-- Changed from 'election' to 'event'
        renderAll();
        return;
      }

      var revealCount = Math.floor(elapsed / timePerRegion);
      if (revealCount > regionKeys.length) revealCount = regionKeys.length;
      
      revealedRegions = regionKeys.slice(0, revealCount);

      drawElectionCanvas(canvas, 1, data, elapsed, revealedRegions);

      if (elapsed < totalDuration + holdMs) {
        requestAnimationFrame(frame);
      } else {
        st.pendingEvent.hasAnimated = true;
        scene = 'event'; // <-- Changed from 'election' to 'event'
        renderAll();
      }
    }

    requestAnimationFrame(frame);
  }

  function viewElectionResults() {
    if (!D || !D.SEATS) {
      return '<h2 class="scene-title">Loading...</h2><p class="lead">Please wait for game data to load.</p>';
    }
    
    var ev = st.pendingEvent;
    if (!ev || !ev.electionData) {
      return '<h2 class="scene-title">No election data available</h2>';
    }
    
    var data = ev.electionData;
    var mine = data.mySeats || 0;
    var hasMajority = data.hasMajority || false;
    var electionNum = data.electionNum || 1;
    
    var detailedResults = (ev.electionData && ev.electionData.detailed) 
        ? ev.electionData.detailed 
        : E.generateDetailedElectionResults(st, rng);
    
    var html = '';
    
    html += '<h2 class="scene-title">🗳️ ELECTION RESULTS — ' + E.getElectionLabel(electionNum) + '</h2>';
    html += '<p class="lead">' + D.SEATS + ' seats contested — ' + D.MAJORITY + ' needed for majority</p>';
    
    html += '<div class="result-box" style="border:2px solid #ffd700;background:rgba(255,215,0,0.05);margin-bottom:15px;">';
    html += '<div style="text-align:center;">';
    html += '<div style="font-size:0.8rem;color:#888;text-transform:uppercase;letter-spacing:0.1em;"> Winner</div>';
    html += '<div style="font-size:2rem;font-weight:bold;color:#ffd700;">' + esc(detailedResults.winner || 'Unknown') + '</div>';
    html += '<div style="font-size:1rem;color:#aaa;">' + esc(detailedResults.winnerParty || '') + ' — ' + detailedResults.winnerVotes + '%</div>';
    if (detailedResults.secondPlace) {
      html += '<div style="font-size:0.8rem;color:#888;margin-top:5px;">Runner-up: ' + esc(detailedResults.secondPlace) + ' (' + detailedResults.secondParty + ') — ' + Math.round(detailedResults.margin) + '% behind</div>';
    }
    html += '<div style="font-size:0.8rem;color:#888;margin-top:5px;">Turnout: ' + detailedResults.turnout + '% • ' + detailedResults.totalVotes + ' votes cast</div>';
    html += '</div>';
    html += '</div>';
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;">Full Results</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
    html += '<thead><tr style="border-bottom:2px solid #333;">';
    html += '<th style="text-align:left;">Party</th>';
    html += '<th style="text-align:right;">Vote share</th>';
    html += '<th style="text-align:right;">% Change</th>';
    html += '<th style="text-align:right;">Seats</th>';
    html += '<th style="text-align:right;">Change</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    data.partyRows.forEach(function(row) {
      var voteChangeStr = row.voteChange >= 0 ? '▲' + fmt(row.voteChange) : '▼' + fmt(Math.abs(row.voteChange));
      var voteChangeClass = row.voteChange >= 0 ? 'up' : 'down';
      var seatChangeStr = '';
      var seatDisplay = '';

      if (row.id === 'zalian_list') {
        html += '<tr style="background:rgba(217, 119, 6, 0.15); cursor:pointer;" onclick="var els = document.querySelectorAll(\'.zalian-sub-row\'); for(var i=0; i<els.length; i++) { els[i].style.display = els[i].style.display === \'none\' ? \'table-row\' : \'none\'; }">';
        html += '<td><span style="font-weight:bold;color:#d97706;">▶ Zalian List</span></td>';
        html += '<td class="up" style="text-align:right;font-weight:bold;">' + fmt(row.voteShare) + '%</td>';
        html += '<td class="up" style="text-align:right;">' + (row.voteChange >= 0 ? '▲' : '▼') + fmt(Math.abs(row.voteChange)) + '</td>';
        html += '<td style="text-align:right;font-weight:bold;">' + (row.seatCount || 0) + '</td>';
        html += '<td style="text-align:right;">' + (row.seatChange !== null ? (row.seatChange >= 0 ? '▲' : '▼') + Math.abs(row.seatChange) : '—') + '</td>';
        html += '</tr>';
        
        // Using standard <tr> tags instead of <tbody> so the table structure isn't broken
        html += '<tr class="zalian-sub-row" style="display:none; font-size:0.8rem;color:#aaa; background:rgba(0,0,0,0.2);"><td> ↳ ZAP (50%)</td><td style="text-align:right;">0.0%</td><td></td><td style="text-align:right;">' + Math.round((row.seatCount || 0) * 0.5) + '</td><td></td></tr>';
        html += '<tr class="zalian-sub-row" style="display:none; font-size:0.8rem;color:#aaa; background:rgba(0,0,0,0.2);"><td> ↳ ZLP (30%)</td><td style="text-align:right;">0.0%</td><td></td><td style="text-align:right;">' + Math.round((row.seatCount || 0) * 0.3) + '</td><td></td></tr>';
        html += '<tr class="zalian-sub-row" style="display:none; font-size:0.8rem;color:#aaa; background:rgba(0,0,0,0.2);"><td> ↳ Independents (20%)</td><td style="text-align:right;">0.0%</td><td></td><td style="text-align:right;">' + Math.round((row.seatCount || 0) * 0.2) + '</td><td></td></tr>';
        return;
      }

      if (row.id === 'red_list') {
        html += '<tr style="background:rgba(153, 27, 27, 0.15); cursor:pointer;" onclick="var els = document.querySelectorAll(\'.red-sub-row\'); for(var i=0; i<els.length; i++) { els[i].style.display = els[i].style.display === \'none\' ? \'table-row\' : \'none\'; }">';
        html += '<td><span style="font-weight:bold;color:#991b1b;">▶ Red List</span></td>';
        html += '<td class="up" style="text-align:right;font-weight:bold;">' + fmt(row.voteShare) + '%</td>';
        html += '<td class="up" style="text-align:right;">' + (row.voteChange >= 0 ? '▲' : '▼') + fmt(Math.abs(row.voteChange)) + '</td>';
        html += '<td style="text-align:right;font-weight:bold;">' + (row.seatCount || 0) + '</td>';
        html += '<td style="text-align:right;">' + (row.seatChange !== null ? (row.seatChange >= 0 ? '▲' : '▼') + Math.abs(row.seatChange) : '—') + '</td>';
        html += '</tr>';
        
        html += '<tr class="red-sub-row" style="display:none; font-size:0.8rem;color:#aaa; background:rgba(0,0,0,0.2);"><td> ↳ Red Front (50%)</td><td style="text-align:right;">0.0%</td><td></td><td style="text-align:right;">' + Math.floor((row.seatCount || 0) * 0.5) + '</td><td></td></tr>';
        html += '<tr class="red-sub-row" style="display:none; font-size:0.8rem;color:#aaa; background:rgba(0,0,0,0.2);"><td> ↳ Red Bench (45%)</td><td style="text-align:right;">0.0%</td><td></td><td style="text-align:right;">' + Math.floor((row.seatCount || 0) * 0.45) + '</td><td></td></tr>';
        html += '<tr class="red-sub-row" style="display:none; font-size:0.8rem;color:#aaa; background:rgba(0,0,0,0.2);"><td> ↳ RO16 (5%)</td><td style="text-align:right;">0.0%</td><td></td><td style="text-align:right;">' + Math.ceil((row.seatCount || 0) * 0.05) + '</td><td></td></tr>';
        return;
      }

      if (st.electoralLists && (row.id === 'zap' || row.id === 'zlp' || row.id === 'zi')) {
        return; 
      }
      
      if (row.seatCount !== null) {
        seatDisplay = row.seatCount;
        seatChangeStr = row.seatChange !== null ? (row.seatChange >= 0 ? '▲' + row.seatChange : '▼' + Math.abs(row.seatChange)) : '—';
      } else {
        seatDisplay = '—';
        seatChangeStr = '—';
      }
      
      var isZMP = row.id === 'ZMP';
      var isBL = row.id === 'bl';
      
      html += '<tr style="' + (isZMP ? 'background:rgba(95,174,60,0.1);' : '') + (isBL ? 'background:rgba(20,20,20,0.5);' : '') + '">';
      html += '<td><span class="swatch" style="background:' + row.color + ';width:12px;height:12px;display:inline-block;border:1px solid #333;margin-right:6px;"></span>' + esc(row.short) + '</td>';
      html += '<td class="' + voteChangeClass + '" style="text-align:right;font-weight:bold;">' + fmt(row.voteShare) + '%</td>';
      html += '<td class="' + voteChangeClass + '" style="text-align:right;">' + voteChangeStr + '</td>';
      html += '<td style="text-align:right;font-weight:bold;">' + seatDisplay + '</td>';
      html += '<td style="text-align:right;">' + seatChangeStr + '</td>';
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    html += '<div style="margin-top:10px;display:flex;justify-content:space-between;flex-wrap:wrap;">';
    html += '<div><b>ZMP:</b> ' + mine + ' seats — ' + (hasMajority ? ' Majority!' : ' Needs ' + (D.MAJORITY - mine) + ' more') + '</div>';
    html += '<div><b>Turnout:</b> ' + detailedResults.turnout + '%</div>';
    html += '</div>';
    html += '</div>';
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;">Regional Breakdown</h3>';
    
    var regionKeys = Object.keys(detailedResults.stateResults);
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';

    regionKeys.forEach(function(region) {
      var r = detailedResults.stateResults[region];
      html += '<div style="background:rgba(255,255,255,0.03);border-radius:4px;padding:8px 10px;">';
      html += '<div style="font-weight:bold;font-size:0.85rem;color:#aaa;border-bottom:1px solid #222;padding-bottom:3px;margin-bottom:4px;">' + esc(region) + '</div>';
      
      var sorted = Object.keys(r.results).sort(function(a, b) {
        return r.results[b] - r.results[a];
      }).slice(0, 3);
      
      sorted.forEach(function(pid) {
        var p = party(pid);
        var color = (pid === 'zpf') ? '#006400' : (p ? p.color : '#888');
        var pct = Math.round(r.results[pid]);
        var isWinner = pid === r.winner;
        html += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;' + (isWinner ? 'color:#ffd700;' : '') + '">';
        html += '<span style="color:' + color + ';">' + (p ? esc(p.short) : pid) + '</span>';
        html += '<span>' + pct + '%' + (isWinner ? ' ' : '') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    });
    
    html += '</div>';
    html += '</div>';
    
    if (detailedResults.endorsements && detailedResults.endorsements.length > 0) {
      html += '<div class="result-box" style="margin-bottom:15px;">';
      html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;">📰 Endorsements</h3>';
      
      var endorsementsByCandidate = {};
      detailedResults.endorsements.forEach(function(e) {
        if (!endorsementsByCandidate[e.candidate]) {
          endorsementsByCandidate[e.candidate] = [];
        }
        endorsementsByCandidate[e.candidate].push(e);
      });
      
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
      for (var candidate in endorsementsByCandidate) {
        var endorsements = endorsementsByCandidate[candidate];
        html += '<div style="background:rgba(255,255,255,0.03);border-radius:4px;padding:8px 10px;">';
        html += '<div style="font-weight:bold;color:#ffd700;font-size:0.85rem;">' + esc(candidate) + '</div>';
        endorsements.forEach(function(e) {
          html += '<div style="font-size:0.75rem;color:#aaa;">'  + ' ' + esc(e.endorser) + '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }
    
    if (data.coalitions && data.coalitions.length > 0) {
      html += '<div class="result-box" style="margin-bottom:15px;border:2px solid #333;">';
      html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;"> Available Coalitions</h3>';
      html += '<p class="quiet" style="text-align:center;font-size:0.8rem;">Click a coalition to attempt formation</p>';
      
      data.coalitions.forEach(function(c) {
        var swatches = c.combo.map(function(name) {
          var p = party(name.toLowerCase());
          return '<span class="swatch" style="background:' + (p ? p.color : '#999') + ';margin-right:2px;"></span>';
        }).join('');
        
        var isViable = c.seats >= D.MAJORITY;
        var chanceLabel = c.willing >= 60 ? ' Likely' : (c.willing >= 35 ? '⚡ Uncertain' : ' Difficult');
        
        html += '<div class="coal-opt" onclick="UI.tryCoalition(\'' + c.key + '\')" style="' + 
          (isViable ? '' : 'opacity:0.6;') + 'margin:4px 0;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:4px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">';
        html += '<span><b>' + esc(c.name) + '</b> ' + swatches + ' <span style="font-weight:400;">' + esc(c.combo.join(' + ')) + '</span></span>';
        html += '<span style="font-weight:700;color:' + (isViable ? '#5fae3c' : '#ff6b6b') + ';">' + c.seats + ' seats</span>';
        html += '</div>';
        html += '<div class="m" style="font-size:0.8rem;color:#888;">' + esc(c.description) + ' — Willingness: ' + c.willing + '% (' + chanceLabel + ')</div>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="result-box" style="margin-bottom:15px;border:2px solid #333;">';
      html += '<h3 style="text-align:center;font-size:1.1rem;letter-spacing:0.05em;text-transform:uppercase;"> No Viable Coalitions</h3>';
      html += '<p class="lead" style="text-align:center;color:#ff6b6b;">No coalition reaches ' + D.MAJORITY + ' seats.</p>';
      html += '</div>';
    }
    
    var zmpSeats = st.seats[E.getPlayerPartyId(st)] || 0;
    var hasAbsoluteMajority = zmpSeats >= D.MAJORITY;
    var faction = null;
    for (var i = 0; i < D.FACTIONS.length; i++) {
      if (D.FACTIONS[i].id === st.faction) { faction = D.FACTIONS[i]; }
    }
    var isCenterFaction = faction && (faction.id === 'securro' || faction.id === 'zalgrilian');
    var canNaturalGover = isCenterFaction &&
                          st.battle1Lost === false && 
                          st.battle2Won === true && 
                          (st.battle3Won === true || st.blSplintered === true);
    
    if (hasAbsoluteMajority && canNaturalGover) {
      html += '<div class="result-box" style="border:2px solid #5fae3c;background:#1a2a1a;margin-bottom:15px;">';
      html += '<h3 style="color:#5fae3c;text-align:center;"> ZMP HAS ABSOLUTE MAJORITY!</h3>';
      html += '<div class="big-num" style="text-align:center;font-size:2.5rem;margin:10px 0;">' + zmpSeats + ' / ' + D.SEATS + ' seats</div>';
      html += '<p style="text-align:center;color:#aaa;">The Black League is defeated. The ZMP can establish natural governing.</p>';
      html += '<div class="btn-row" style="justify-content:center;margin-top:10px;">';
      html += '<button class="btn" onclick="UI.naturalGoverning()" style="font-size:1.1rem;padding:12px 40px;"> Establish Natural Governing</button>';
      html += '</div>';
      html += '</div>';
    }
    
    html += '<div class="btn-row">';
    html += '<button class="btn" onclick="UI.advanceFromElection()">Continue to Next Week</button>';
    html += '</div>';
    
    return html;
  }

  function viewLegislatureVote(ev) {
    var html = '';
    html += '<h2 class="scene-title">' + esc(ev.title) + '</h2>';
    html += '<p class="lead">' + esc(ev.body) + '</p>';
    
    var yeaVotes = ev.yeaVotes || 0;
    var nayVotes = ev.nayVotes || 0;
    var totalVotes = yeaVotes + nayVotes;
    var yeaPercent = totalVotes > 0 ? Math.round((yeaVotes / totalVotes) * 100) : 0;
    var nayPercent = totalVotes > 0 ? Math.round((nayVotes / totalVotes) * 100) : 0;
    
    html += '<div class="result-box" style="margin:15px 0;">';
    html += '<h3 style="text-align:center;">VOTE BREAKDOWN</h3>';
    html += '<div style="display:flex;justify-content:space-around;margin:10px 0;">';
    
    html += '<div style="text-align:center;">';
    html += '<div style="font-size:2rem;color:#5fae3c;"></div>';
    html += '<div style="font-size:1.5rem;font-weight:bold;color:#5fae3c;">' + yeaVotes + '</div>';
    html += '<div style="font-size:0.8rem;color:#888;">YEA (' + yeaPercent + '%)</div>';
    html += '</div>';
    
    html += '<div style="text-align:center;">';
    html += '<div style="font-size:2rem;color:#ff6b6b;"></div>';
    html += '<div style="font-size:1.5rem;font-weight:bold;color:#ff6b6b;">' + nayVotes + '</div>';
    html += '<div style="font-size:0.8rem;color:#888;">NAY (' + nayPercent + '%)</div>';
    html += '</div>';
    
    html += '</div>';
    
    html += '<div style="margin:10px 0;">';
    html += '<div style="display:flex;height:20px;border-radius:4px;overflow:hidden;">';
    html += '<div style="background:#5fae3c;width:' + yeaPercent + '%;text-align:center;font-size:0.7rem;color:#fff;display:flex;align-items:center;justify-content:center;">' + (yeaPercent > 10 ? yeaPercent + '%' : '') + '</div>';
    html += '<div style="background:#ff6b6b;width:' + nayPercent + '%;text-align:center;font-size:0.7rem;color:#fff;display:flex;align-items:center;justify-content:center;">' + (nayPercent > 10 ? nayPercent + '%' : '') + '</div>';
    html += '</div>';
    html += '</div>';
    
    if (ev.partyVotes) {
      html += '<h4 style="margin-top:10px;">Party Voting</h4>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">';
      for (var pid in ev.partyVotes) {
        var vote = ev.partyVotes[pid];
        var p = party(pid);
        var color = (pid === 'zpf') ? '#006400' : (p ? p.color : '#888');
        
        var voteColor = vote === 'yea' ? '#5fae3c' : (vote === 'nay' ? '#ff6b6b' : '#888');
        html += '<div style="background:rgba(255,255,255,0.03);padding:4px 8px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">';
        html += '<span style="color:' + color + ';">' + (p ? esc(p.short) : pid) + '</span>';
        html += '<span style="color:' + voteColor + ';">' +  + ' ' + vote.toUpperCase() + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }
    
    var passed = yeaVotes > nayVotes;
    html += '<div style="margin-top:15px;text-align:center;padding:10px;border-radius:4px;background:' + (passed ? 'rgba(95,174,60,0.1);border:1px solid #5fae3c;' : 'rgba(255,107,107,0.1);border:1px solid #ff6b6b;') + '">';
    html += '<span style="font-size:1.2rem;font-weight:bold;color:' + (passed ? '#5fae3c' : '#ff6b6b') + ';">';
    html += passed ? ' PROPOSAL PASSES!' : ' PROPOSAL FAILS!';
    html += '</span>';
    html += '</div>';
    
    html += '</div>';
    
    if (ev.choices && ev.choices.length > 0) {
      var items = ev.choices.map(function (c, i) {
        return '<li onclick="UI.pickChoice(' + i + ')"><span class="ct">' + esc(c.text) + '</span>' +
          (c.note ? '<span class="cn">' + esc(c.note) + '</span>' : '') + '</li>';
      }).join('');
      html += '<ul class="choices">' + items + '</ul>';
    }
    
    return html;
  }

  function viewMinisterSelection() {
    if (!st) {
      return '<h2 class="scene-title">No game active</h2>';
    }
    
    var html = '';
    html += '<h2 class="scene-title">👥 Select Your Cabinet</h2>';
    html += '<p class="lead">Choose which ministries ZMP will control. The rest will be given to coalition partners based on their support.</p>';
    
    var ministries = [
      { id: 'finance', name: 'Finance Minister', icon: '💰', desc: 'Controls school budget and funding.' },
      { id: 'education', name: 'Education Minister', icon: '', desc: 'Oversees curriculum and teaching.' },
      { id: 'justice', name: 'Justice Minister', icon: '⚖️', desc: 'Manages discipline and council rules.' },
      { id: 'technology', name: 'Technology Minister', icon: '💻', desc: 'Handles IT, wifi, and labs.' },
      { id: 'health', name: 'Health Minister', icon: '🏥', desc: 'Manages healthcare and student welfare.' },
      { id: 'sports', name: 'Sports Minister', icon: '🏅', desc: 'Oversees athletics and gym.' },
      { id: 'arts', name: 'Arts Minister', icon: '🎭', desc: 'Manages drama, music, and arts.' },
      { id: 'infrastructure', name: 'Infrastructure Minister', icon: '🏗️', desc: 'Handles buildings and facilities.' }
    ];
    
    var playerSeats = st.seats[E.getPlayerPartyId(st)] || 0;
    var allocation = E.calculateMinistryAllocation(st, st.coalitionPartners || [], playerSeats);
    var playerMinistries = allocation.player;
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<h3>Ministry Allocation</h3>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
    html += '<div style="background:rgba(95,174,60,0.2);padding:5px 15px;border-radius:4px;border-left:3px solid #5fae3c;">';
    html += '<span style="color:#5fae3c;font-weight:bold;">ZMP:</span> ' + playerMinistries + ' ministries';
    html += '</div>';
    
    for (var pid in allocation.partners) {
      var p = party(pid);
      var color = p ? p.color : '#999';
      if (pid === 'zpf') color = '#006400';
      html += '<div style="background:rgba(255,255,255,0.05);padding:5px 15px;border-radius:4px;border-left:3px solid ' + color + ';">';
      html += '<span style="color:' + color + ';font-weight:bold;">' + (p ? esc(p.short) : pid) + ':</span> ' + allocation.partners[pid] + ' ministries';
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
    
    html += '<p style="color:#ffcc00;"> Select <b>' + playerMinistries + '</b> ministries for ZMP. The rest will go to coalition partners.</p>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
    
    var selectedCount = 0;
    if (st._selectedMinistries) {
      selectedCount = Object.keys(st._selectedMinistries).length;
    }
    
    for (var i = 0; i < ministries.length; i++) {
      var m = ministries[i];
      var isSelected = st._selectedMinistries && st._selectedMinistries[m.id] === true;
      var disabled = !isSelected && selectedCount >= playerMinistries;
      
      html += '<div class="cabinet-ministry" style="padding:10px;background:' + (isSelected ? 'rgba(95,174,60,0.15);border:2px solid #5fae3c;' : 'rgba(255,255,255,0.05);border:1px solid #333;') + 'border-radius:4px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<div>';
      html += '<span style="font-size:1.2rem;">' + m.icon + '</span>';
      html += '<span style="font-weight:bold;margin-left:5px;">' + esc(m.name) + '</span>';
      html += '</div>';
      html += '<div>';
      if (isSelected) {
        html += '<span style="color:#5fae3c;"> ZMP</span>';
      } else {
        html += '<button class="chip" ' + (disabled ? 'disabled style="opacity:0.5;"' : '') + ' onclick="UI.selectMinistry(\'' + m.id + '\')">';
        html += 'Take for ZMP';
        html += '</button>';
      }
      html += '</div>';
      html += '</div>';
      html += '<div style="font-size:0.8rem;color:#888;margin-top:4px;">' + esc(m.desc) + '</div>';
      html += '</div>';
    }
    
    html += '</div>';
    
    html += '<div class="btn-row" style="margin-top:15px;">';
    if (selectedCount >= playerMinistries) {
      html += '<button class="btn" onclick="UI.confirmMinistries()">Confirm Cabinet</button>';
    } else {
      html += '<button class="btn" disabled style="opacity:0.5;">Select ' + (playerMinistries - selectedCount) + ' more ministries</button>';
    }
    html += '<button class="btn alt" onclick="UI.go(\'week\')">Cancel</button>';
    html += '</div>';
    
    return html;
  }

  function renderImage(type, options) {
    if (!window.GameImages) {
      return `<div class="image-placeholder" style="width:${options.size||200}px;height:${options.size||200}px;background:#1a1a1a;border-radius:12px;border:2px solid #5fae3c;display:flex;align-items:center;justify-content:center;font-size:3rem;">${getFallbackIcon(type)}</div>`;
    }
    var svg = window.GameImages.generateSVG(type, options);
    return `<div class="game-image">${svg}</div>`;
  }

  function getFallbackIcon(type) {
    var icons = {
      'battle': '',
      'election': '🗳️',
      'party': '',
      'event': '📋',
      'cabinet': '💼',
      'achievement': '',
      'newspaper': '📰',
      'president': '',
      'congress': '',
      'coalition': ''
    };
    return icons[type] || '📋';
  }

  function getBonusText(bonus) {
    var parts = [];
    if (bonus.unity) parts.push('Unity +' + bonus.unity);
    if (bonus.faculty) parts.push('Faculty +' + bonus.faculty);
    if (bonus.funds) parts.push('Funds +' + bonus.funds);
    if (bonus.momentum) parts.push('Momentum +' + bonus.momentum);
    if (bonus.spirit) parts.push('Spirit +' + bonus.spirit);
    if (bonus.volunteers) parts.push('Volunteers +' + bonus.volunteers);
    return parts.join(', ');
  }

  function playSpecificEventMusic(eventId, eventTitle) {
    var t = (eventTitle || '').toLowerCase();

    if (eventId === 'battle1' || t.includes('battle of ca\'uf')) {
      playMusic('battle1.mp3');
    } 
    else if (eventId === 'battle2' || t.includes('second battle')) {
      playMusic('battle2.mp3');
    } 
    else if (eventId === 'battle3' || t.includes('last of us')) {
      playMusic('battle3.mp3');
    } 
    else if (eventId === 'battle4' || t.includes('last dance')) {
      playMusic('battle4.mp3');
    } 
    else if (eventId === 'presidential_election' || t.includes('presidential')) {
      playMusic('music/presidential.mp3');
    } 
    else if (t.includes('election')) {
      playMusic('music/election.mp3');
    } 
    else if (t.includes('crisis') || t.includes('revolution')) {
      playMusic('music/crisis.mp3');
    } 
    else if (t.includes('victory')) {
      playMusic('music/victory.mp3');
    }
  }

  function viewEvent() {
    var ev = st.pendingEvent;
    if (!ev) { 
      scene = 'week';
      renderAll();
      return ''; 
    }
    
    // 1. Handle Presidential Elections
    if (ev.id && ev.id.indexOf('presidential') !== -1) {
      if (!ev.hasAnimated) {
        return viewElectionVote(); 
      }
      return viewPresidentialResults();
    }
    
    // 2. Handle Parliamentary Elections
    if (ev.isElection) {
      if (!ev.hasAnimated) {
        return viewElectionVote(); 
      }
      return viewElectionResults(); 
    }
    
    // 3. Handle Legislature Votes
    if (ev.isLegislatureVote) {
      if (ev.id === 'week21_field_day' && !ev.hasAnimated) {
        ev.hasAnimated = true;
        scene = 'field_day';
        setTimeout(function() { renderAll(); }, 10);
        return '';
      }
      return viewLegislatureVote(ev);
    }
    
    // 4. Handle Normal Events
    var imageHtml = renderEventImage(ev.id, ev.title);
    
    var items = ev.choices.map(function (c, i) {
      return '<li onclick="UI.pickChoice(' + i + ')"><span class="ct">' + esc(c.text) + '</span>' +
        (c.note ? '<span class="cn">' + esc(c.note) + '</span>' : '') + '</li>';
    }).join('');
    
    return imageHtml +
      '<h2 class="scene-title">' + esc(ev.title) + '</h2>' +
      '<p class="lead">' + ev.body + '</p>' + 
      '<ul class="choices">' + items + '</ul>';
  }

function renderEventImage(eventId, eventTitle) {
    var candidates = [];
    var title = eventTitle || '';     
    var t = title.toLowerCase();

    
    var EXTS = ['.jpg', '.png'];

    function add(base) {
      EXTS.forEach(function (ext) { candidates.push(base + ext); });
    }

    // 1. Try the exact ID
    add('img/' + eventId);
    add('img/events/' + eventId);

    // 2. Try stripping the week prefix
    var stripped = eventId.replace(/^week\d+_/, '');
    if (stripped !== eventId) {
      add('img/' + stripped);
      add('img/events/' + stripped);
    }

    // 3. Hardcoded matches
    if (eventId === 'battle_cauf' || (t.includes("ca'uf") && !t.includes('second'))) add('img/battle1');
    if (eventId === 'battle_cauf_2' || t.includes('second battle'))                 add('img/battle2');
    if (eventId === 'last_of_us' || t.includes('last of us'))                       add('img/battle3');
    if (eventId === 'last_dance' || t.includes('last dance'))                       add('img/battle4');
    if (t.includes('election day'))                                                 add('img/election');
    if (t.includes('presidential'))                                                 add('img/presidential_election');
    if (t.includes('revolution') || t.includes('takeover'))                         add('img/crisis_revolution');

    // 4. Keyword fallbacks
    if (t.includes('red') || eventId.includes('red'))                add('img/red');
    if (t.includes('black league') || eventId.includes('bl_'))       add('img/bl');
    if (t.includes('zpf') || eventId.includes('zpf'))                add('img/zpf');

    // 5. Absolute generic fallbacks
    add('img/crisis');
    add('img/event');

    // Remove duplicates (keeps first occurrence, so order is preserved)
    candidates = candidates.filter(function (item, pos) { return candidates.indexOf(item) === pos; });

    var initialSrc    = candidates[0];
    var nextFallbacks = candidates.slice(1).join(',');

    // Generate procedural SVG and convert to Data URI
    var hash = 0;
    for (var i = 0; i < eventId.length; i++) {
      hash = eventId.charCodeAt(i) + ((hash << 5) - hash);
    }
    var hue = Math.abs(hash) % 360;
    var c1 = 'hsl(' + hue + ', 40%, 20%)';
    var c2 = 'hsl(' + ((hue + 40) % 360) + ', 40%, 30%)';

    // Sanitize title for SVG
    var safeTitle = title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    var svg = '<svg width="400" height="120" viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">' +
              '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0%" stop-color="' + c1 + '"/><stop offset="100%" stop-color="' + c2 + '"/>' +
              '</linearGradient></defs>' +
              '<rect width="400" height="120" fill="url(#g)"/>' +
              '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ' +
              'font-family="Georgia, serif" font-size="20" fill="rgba(255,255,255,0.4)" ' +
              'font-weight="bold" letter-spacing="2">' + safeTitle.toUpperCase() + '</text>' +
              '</svg>';

    var dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

    
    var onErrorStr =
      "var list = this.getAttribute('data-fallbacks').split(',').filter(Boolean);" +
      "if (list.length > 0) {" +
      "  this.src = list[0];" +
      "  this.setAttribute('data-fallbacks', list.slice(1).join(','));" +
      "} else {" +
      "  this.onerror = null;" +
      "  this.src = this.getAttribute('data-svg');" +
      "}";

    return `<div style="text-align:center;margin:10px auto;padding:15px;border:3px solid #333;border-radius:12px;background:rgba(0,0,0,0.4);max-width:350px;">
      <img src="${initialSrc}" data-fallbacks="${nextFallbacks}" data-svg="${dataUri}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto;" onerror="${onErrorStr}">
    </div>`;
}

  api.toEvent = function () {
    if (st.pendingEvent) {
      scene = 'event';
      
      playSpecificEventMusic(st.pendingEvent.id, st.pendingEvent.title);
      
      renderAll();
      return;
    }
    
    var ev = eventForWeek(st.week);
    if (!ev) {
      api.advance();
      return;
    }
    st.pendingEvent = ev;
    scene = 'event';

    playSpecificEventMusic(ev.id, ev.title);
    
    renderAll();
  };

  function viewMinistry() {
    var ministryId = pendingMinistry;
    var ministry = st.cabinet[ministryId];
    if (!ministry) {
      return '<h2 class="scene-title">Ministry not found</h2>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'cabinet\')">Back to Cabinet</button></div>';
    }
    
    var html = '';
    html += '<h2 class="scene-title">' + ministry.icon + ' ' + esc(ministry.name) + '</h2>';
    html += '<p class="lead">' + esc(ministry.desc) + '</p>';
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;">';
    html += '<div><b>Minister:</b> ' + esc(ministry.minister) + ' (' + esc(ministry.party) + ')</div>';
    var approval = st.ministerApproval ? st.ministerApproval[ministry.party] || 50 : 50;
    html += '<div><b>Approval:</b> <span style="color:' + (approval > 60 ? '#5fae3c' : '#ffcc00') + ';">' + approval + '%</span></div>';
    html += '</div>';
    html += '</div>';
    
    if (ministry.party === E.getPlayerPartyId(st) || ministry.party === 'ZMP') {
      html += '<h3>Available Actions</h3>';
      html += '<div class="act-grid">';
      ministry.actions.forEach(function(action) {
        var canAfford = st.ap >= (action.cost.ap || 0) && st.funds >= (action.cost.budget || 0);
        var requirementsMet = true;
        var reqText = '';
        
        if (action.requires) {
          if (action.requires.monarchySympathizers && (st.monarchySympathizers || 0) < action.requires.monarchySympathizers) {
            requirementsMet = false;
            reqText = 'Requires ' + action.requires.monarchySympathizers + ' monarchy sympathizers';
          }
          if (action.requires.investigate_bl && !st.blackLeagueInvestigated) {
            requirementsMet = false;
            reqText = 'Must investigate Black League first';
          }
          if (action.requires.prosecute_bl && !st.blackLeagueProsecuted) {
            requirementsMet = false;
            reqText = 'Must prosecute Black League first';
          }
          if (action.requires.banSplinters && !st.blackLeagueBanned) {
            requirementsMet = false;
            reqText = 'Must ban BL splinters first';
          }
        }
        
        var disabled = !canAfford || !requirementsMet;
        
        html += '<button class="act" ' + (disabled ? 'disabled' : '') +
          ' onclick="UI.runMinistryAction(\'' + ministryId + '\',\'' + action.id + '\')">' +
          '<b>' + esc(action.name) + '</b>' +
          '<span class="cost">' + (action.cost.ap ? action.cost.ap + ' AP' : '') + 
          (action.cost.budget ? ' · $' + action.cost.budget : '') + '</span>' +
          '<span class="d">' + esc(action.desc) + '</span>' +
          (reqText ? '<span class="d" style="color:#ff6b6b;"> ' + esc(reqText) + '</span>' : '') +
          '</button>';
      });
      html += '</div>';
    } else {
      html += '<div class="result-box" style="background:#1a1a1a;border:1px solid #333;">';
      html += '<p style="color:#888;text-align:center;">This ministry is controlled by <b>' + esc(ministry.party) + '</b>. You cannot take actions here.</p>';
      html += '</div>';
    }
    
    html += '<div class="btn-row" style="margin-top:15px;">';
    html += '<button class="btn alt" onclick="UI.go(\'cabinet\')">Back to Cabinet</button>';
    html += '</div>';
    
    return html;
  }

  function getEndingImageHtml(e) {
    var eventId = e.ending || 'end';
    var title = e.title || 'Ending';
    
    var candidates = [];
    // 1. Try specific ending image
    candidates.push('img/endings/' + eventId + '.jpg');
    candidates.push('img/endings/' + eventId + '.png');
    candidates.push('img/' + eventId + '.jpg');
    
    // 2. Keyword fallbacks
    if (eventId.includes('monarchy') || eventId.includes('king') || eventId.includes('zalgrilian')) candidates.push('img/monarchy.jpg');
    if (eventId.includes('black_league') || eventId.includes('fascism')) candidates.push('img/bl.jpg');
    if (eventId.includes('republic') || eventId.includes('secular')) candidates.push('img/election.jpg');
    if (eventId.includes('war') || eventId.includes('collapse')) candidates.push('img/crisis.jpg');
    
    candidates = candidates.filter(function (item, pos) { return candidates.indexOf(item) === pos; });
    
    var initialSrc = candidates[0];
    var nextFallbacks = candidates.slice(1).join(',');
    
    // Generate procedural SVG
    var hash = 0;
    for (var i = 0; i < eventId.length; i++) {
      hash = eventId.charCodeAt(i) + ((hash << 5) - hash);
    }
    var hue = Math.abs(hash) % 360;
    var c1 = 'hsl(' + hue + ', 40%, 15%)';
    var c2 = 'hsl(' + ((hue + 40) % 360) + ', 40%, 25%)';
    
    var safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    
    var svg = '<svg width="600" height="200" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">' +
              '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0%" stop-color="' + c1 + '"/><stop offset="100%" stop-color="' + c2 + '"/>' +
              '</linearGradient></defs>' +
              '<rect width="600" height="200" fill="url(#g)"/>' +
              '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="rgba(255,255,255,0.2)" font-weight="bold" letter-spacing="6">' + safeTitle.toUpperCase() + '</text>' +
              '</svg>';
    
    var dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    
    var onErrorStr = "var list = this.getAttribute('data-fallbacks').split(',').filter(Boolean);" +
                     "if(list.length > 0) {" +
                     "  this.src = list[0];" +
                     "  this.setAttribute('data-fallbacks', list.slice(1).join(','));" +
                     "} else {" +
                     "  this.onerror = null;" +
                     "  this.src = this.getAttribute('data-svg');" +
                     "}";
                     
    return `<div style="text-align:center; margin-bottom: 20px;">
      <img src="${initialSrc}" data-fallbacks="${nextFallbacks}" data-svg="${dataUri}" style="max-width: 100%; max-height: 250px; border-radius: 8px; border: 3px solid #ffd700; box-shadow: 0 8px 25px rgba(0,0,0,0.6);" onerror="${onErrorStr}">
    </div>`;
  }

    function playEndingMusic(endingData) {
    if (!endingData) return;
    if (st._endingMusicPlayed) return;
    st._endingMusicPlayed = true;

    var endingId = endingData.ending || 'unknown';
    
    // 1. Attempt to play the absolute unique track for this exact ending
    //    e.g., 'ending_natural_governing.mp3', 'ending_black_league_victory.mp3'
    var uniqueTrack = 'ending_' + endingId + '.mp3';
    
    // 2. Set up a fallback if the unique track doesn't exist
    var fallbackTrack = 'music/victory.mp3';
    if (endingId.includes('black_league') || endingId.includes('fascism')) fallbackTrack = 'music/crisis.mp3';
    if (endingId === 'natural_governing') fallbackTrack = 'green_and_white.mp3';

    // 3. Play it using the robust loader
    var audioUrl = 'js/' + uniqueTrack;
    
    // We use a direct Audio object here so we can catch the error and swap the source
    var audio = new Audio(audioUrl);
    audio.volume = 0.7;
    
    audio.play().catch(function(err) {
        // If the unique track fails to load (file not found), play the fallback
        console.warn('Unique ending track not found: ' + uniqueTrack + '. Playing fallback.');
        playMusic(fallbackTrack);
    });
  }

  function viewEnding(endingData) {
    var e = endingData;
    
    var endingHtml = '';
    
    endingHtml += '<div style="text-align:center;padding:20px 0;border-bottom:2px solid #333;margin-bottom:20px;">';
    
    // Add the ending image here
    endingHtml += getEndingImageHtml(e);
    
    if (e.ending === 'natural_governing' || e.endingNumber === 'Ending 3') {
      endingHtml += '<div class="zmp-flag flag-large" style="margin-top:10px;"></div>';
    }
    
    endingHtml += '<p style="font-size:0.9rem;color:#888;letter-spacing:0.1em;text-transform:uppercase;margin-top:' + (e.ending === 'natural_governing' ? '10px' : '20px') + ';">A chapter in history closes.</p>';
    endingHtml += '<h2 style="font-size:2.2rem;margin:10px 0 5px 0;">' + esc(e.title) + '</h2>';
    if (e.subtitle) {
      endingHtml += '<p style="font-size:1.1rem;color:#aaa;font-style:italic;">' + esc(e.subtitle) + '</p>';
    }
    if (e.endingNumber) {
      endingHtml += '<p style="font-size:1rem;color:#666;margin-top:5px;">' + esc(e.endingNumber) + '</p>';
    }
    endingHtml += '</div>';
    
    endingHtml += '<div style="max-width:700px;margin:0 auto;padding:10px 0;">';
    endingHtml += '<p class="lead" style="font-size:1.1rem;line-height:1.6;">' + e.body + '</p>';
    endingHtml += '</div>';

    if (e.ending === 'natural_governing' || e.endingNumber === 'Ending 3') {
      if (!st._greenAndWhitePlayed) {
        st._greenAndWhitePlayed = true;
        setTimeout(function() {
          playGreenAndWhite();
        }, 500);
      }
    }
    
    if (e.story) {
      endingHtml += '<div class="result-box" style="margin:15px 0;padding:15px 20px;background:#1a1a1a;border-radius:4px;border-left:3px solid #5fae3c;">';
      endingHtml += '<p style="line-height:1.7;font-size:0.95rem;">' + esc(e.story) + '</p>';
      endingHtml += '</div>';
    }
    
    if (e.subending) {
      endingHtml += '<div style="margin:15px 0;padding:10px 15px;background:#0d0d0d;border-radius:4px;border:1px solid #333;">';
      endingHtml += '<p style="color:#888;font-size:0.9rem;font-style:italic;">' + esc(e.subending) + '</p>';
      endingHtml += '</div>';
    }
    
    if (e.detail) {
      endingHtml += '<div class="result-box" style="margin:15px 0;padding:15px 20px;background:#1a1a1a;border-radius:4px;">';
      endingHtml += '<h3 style="font-size:1rem;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Final standing</h3>';
      endingHtml += e.detail;
      endingHtml += '</div>';
    }
    
    if (e.epilogue) {
      endingHtml += '<div style="margin:15px 0;padding:15px 20px;background:#0d0d0d;border-radius:4px;border-top:2px solid #333;">';
      endingHtml += '<h3 style="font-size:0.9rem;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Epilogue</h3>';
      endingHtml += '<p style="line-height:1.7;font-size:0.95rem;">' + esc(e.epilogue) + '</p>';
      endingHtml += '</div>';
    }
    
    endingHtml += '<hr class="rule" style="margin:20px 0;">';
    endingHtml += '<div class="btn-row" style="display:flex;justify-content:center;gap:10px;">';
    endingHtml += '<button class="btn" onclick="UI.restart()" style="padding:10px 30px;">Run again</button>';
    endingHtml += '</div>';
    
    return endingHtml;
  }

// ============================================================
// EXPANDED ACHIEVEMENT SYSTEM
// ============================================================

var ACHIEVEMENTS = [
  // Progressive / Milestones
  { id: 'first_steps', name: 'First Steps', desc: 'Survive your first week in office.' },
  { id: 'survivor', name: 'Survivor', desc: 'Reach Week 50.' },
  { id: 'campaigner', name: 'Campaigner', desc: 'Accumulate $150 in party funds.' },
  { id: 'broke', name: 'In the Red', desc: 'Drop to $0 in party funds.' },
  { id: 'history_maker', name: 'History Maker', desc: 'Reach any ending.' },
  
  // Elections & Politics
  { id: 'election_winner', name: 'Election Winner', desc: 'Win a majority (51+ seats) in an election.' },
  { id: 'landslide', name: 'Landslide', desc: 'Win a supermajority (70+ seats) in an election.' },
  { id: 'wipeout', name: 'Wipeout', desc: 'Win 0 seats in an election after week 10.' },
  { id: 'president', name: 'Head of State', desc: 'Win the Presidential Election.' },
  { id: 'coalition_builder', name: 'Coalition Builder', desc: 'Form a coalition government.' },
  { id: 'white_league', name: 'The White League', desc: 'Dissolve the ZMP and IIA into a single party.' },
  { id: 'referendum_master', name: 'Referendum Master', desc: 'Successfully pass a constitutional referendum.' },
  
  // Stats & Management
  { id: 'iron_fist', name: 'Iron Fist', desc: 'Reach 80% Party Unity.' },
  { id: 'student_advocate', name: 'Student Advocate', desc: 'Reach 80% Faculty Tolerance.' },
  { id: 'spin_doctor', name: 'Spin Doctor', desc: 'Reach 15 Momentum.' },
  { id: 'advisory_board', name: 'Advisory Board', desc: 'Appoint all 3 party advisors.' },
  { id: 'wein_ally', name: 'The Arbeiter Alliance', desc: 'Secure an alliance with Arbeiter von Wein.' },

  // The Black League & Crises
  { id: 'bl_defeated', name: 'Fascist Crashers', desc: 'Reduce Black League support below 5%.' },
  { id: 'cell_hunter', name: 'Cell Hunter', desc: 'Destroy 3 Black League cells.' },
  { id: 'constitutionalist', name: 'Constitutionalist', desc: 'Complete the Constitutional Convention.' },

  // Faction-Specific / Minigames
  { id: 'militarist', name: 'Legion Commander', desc: 'Recruit 100 members for the Dzehurjaca.' },
  { id: 'putschist', name: 'Putschist', desc: 'Launch the King Putsch.' },
  { id: 'monarchist', name: 'The King\'s Men', desc: 'Restore the Monarchy.' },
  { id: 'siege_master', name: 'Siege Master', desc: 'Complete the Securro Siege.' }
];

function checkAchievements(st) {
  if (!st) return [];

  return ACHIEVEMENTS.map(function(a) {
    var unlocked = false;

    // Progressive / Milestones
    if (a.id === 'first_steps') unlocked = st.week >= 2;
    if (a.id === 'survivor') unlocked = st.week >= 50;
    if (a.id === 'campaigner') unlocked = st.funds >= 150;
    if (a.id === 'broke') unlocked = st.funds <= 0 && st.week > 1;
    if (a.id === 'history_maker') unlocked = st.finished === true;

    // Elections & Politics
    if (a.id === 'election_winner') unlocked = st.seats && st.seats.ZMP >= 51;
    if (a.id === 'landslide') unlocked = st.seats && st.seats.ZMP >= 70;
    if (a.id === 'wipeout') unlocked = st.seats && st.seats.ZMP === 0 && st.week > 10;
    if (a.id === 'president') unlocked = st.hasPresident === true;
    if (a.id === 'coalition_builder') unlocked = st.coalitionPartners && st.coalitionPartners.length > 0;
    if (a.id === 'white_league') unlocked = (st.whiteLeague && st.whiteLeague.formed) || st.playerParty === 'wl';
    if (a.id === 'referendum_master') unlocked = st.justiceReformDone === true || st.royalDecreeThreshold === true;

    // Stats & Management
    if (a.id === 'iron_fist') unlocked = st.unity >= 80;
    if (a.id === 'student_advocate') unlocked = st.faculty >= 80;
    if (a.id === 'spin_doctor') unlocked = st.momentum >= 15;
    if (a.id === 'advisory_board') unlocked = st.cabinetAdvisors && Object.keys(st.cabinetAdvisors).length === 3;
    if (a.id === 'wein_ally') unlocked = st.hasArbeiterAlly === true;

    // The Black League & Crises
    if (a.id === 'bl_defeated') {
      var blSupport = window.Engine && window.Engine.getPartySupport ? window.Engine.getPartySupport(st, 'bl') : 100;
      unlocked = blSupport < 5;
    }
    if (a.id === 'cell_hunter') unlocked = st.blackLeagueCells && st.blackLeagueCells.totalCellsDestroyed >= 3;
    if (a.id === 'constitutionalist') unlocked = st.endingData && st.endingData.ending === 'constitutional_convention';

    // Faction-Specific / Minigames
    if (a.id === 'militarist') unlocked = st.paramilitaries && st.paramilitaries.dzehurjaca && st.paramilitaries.dzehurjaca.members >= 100;
    if (a.id === 'putschist') unlocked = st.king && st.king.active === true;
    if (a.id === 'monarchist') unlocked = st.monarchyRestored === true;
    if (a.id === 'siege_master') unlocked = st.securroSiegeCompleted === true || (st.endingData && st.endingData.ending === 'securro_victory');

    return {
      id: a.id,
      name: a.name,
      desc: a.desc,
      unlocked: unlocked
    };
  });
}

  function viewAchievementsPage() {
    return viewAchievements();
  }

  function viewCabinet() {
    if (!st || !st.cabinet || Object.keys(st.cabinet).length === 0) {
      return '<h2 class="scene-title"> Coalition Cabinet</h2>' +
        '<p class="lead">No coalition government has been formed yet.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back to Week</button></div>';
    }
    
    var html = '';
    html += '<h2 class="scene-title"> Coalition Cabinet</h2>';
    html += '<p class="lead">The governing coalition and its ministers.</p>';
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<h3>Coalition Government</h3>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
    if (st.coalitionPartners) {
      st.coalitionPartners.forEach(function(pid) {
        var p = party(pid);
        var satisfaction = st.coalitionPartnerSatisfaction ? st.coalitionPartnerSatisfaction[pid] || 60 : 60;
        var color = (pid === 'zpf') ? '#006400' : (p ? p.color : '#999');
        html += '<div style="background:rgba(255,255,255,0.05);padding:8px 15px;border-radius:4px;border-left:3px solid ' + color + ';">';
        html += '<span style="color:' + color + ';font-weight:bold;">' + (p ? esc(p.short) : pid) + '</span>';
        html += ' <span style="color:#888;">Satisfaction: ' + satisfaction + '%</span>';
        html += '</div>';
      });
    }
    html += '</div>';
    html += '</div>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
    var ministries = st.cabinet;
    for (var mId in ministries) {
      var m = ministries[mId];
      var partyColor = (m.party === 'zpf') ? '#006400' : (party(m.party) ? party(m.party).color : '#999');
      if (m.party === 'wl') partyColor = '#ffffff';
      var approval = st.ministerApproval ? st.ministerApproval[m.party] || 50 : 50;
      
      html += '<div class="cabinet-ministry" style="background:rgba(255,255,255,0.05);border-radius:4px;padding:12px;border-left:3px solid ' + partyColor + ';">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<div>';
      html += '<span style="font-size:1.2rem;">' + m.icon + '</span>';
      html += '<span style="font-weight:bold;margin-left:5px;">' + esc(m.name) + '</span>';
      html += '</div>';
      html += '<span style="color:' + partyColor + ';font-weight:bold;">' + esc(m.party) + '</span>';
      html += '</div>';
      html += '<div style="font-size:0.85rem;color:#888;margin:4px 0;">' + esc(m.desc) + '</div>';
      html += '<div style="font-size:0.85rem;">Minister: <span style="color:#fff;">' + esc(m.minister) + '</span></div>';
      html += '<div style="font-size:0.85rem;">Approval: <span style="color:' + (approval > 60 ? '#5fae3c' : '#ffcc00') + ';">' + approval + '%</span></div>';
      html += '</div>';
    }
    html += '</div>';
    
    html += '<h3 style="margin-top:20px;">Ministry Actions</h3>';
    html += '<p class="quiet">Click a ministry to view available actions.</p>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;">';
    for (var mId in ministries) {
      var m = ministries[mId];
      html += '<button class="act" onclick="UI.viewMinistry(\'' + mId + '\')" style="text-align:center;padding:10px;">';
      html += '<span style="font-size:1.5rem;display:block;">' + m.icon + '</span>';
      html += '<span style="font-weight:bold;">' + esc(m.name) + '</span>';
      html += '</button>';
    }
    html += '</div>';
    
    html += '<div class="btn-row" style="margin-top:15px;">';
    html += '<button class="btn alt" onclick="UI.go(\'week\')">Back to Week</button>';
    html += '</div>';
    
    return html;
  }

  function viewCellMap() {
    if (!st) {
      return '<h2 class="scene-title">🗺️ Anti-Fascist Map</h2><p class="lead">Start a game to hunt Black League cells.</p>';
    }
    
    if (!st.blackLeagueCells) {
      st.blackLeagueCells = { cells: [], maxCells: 6, placementTimer: 0, placementInterval: 4, totalCellsPlaced: 0, totalCellsDestroyed: 0, mapRevealed: false };
    }
    
    var system = st.blackLeagueCells;
    var locations = E.getCellLocationsForMap(st);
    var summary = E.getCellSummary(st);
    
    var html = '';
    html += '<h2 class="scene-title">🗺️ Anti-Fascist Tactical Map</h2>';
    html += '<p class="lead">Hunt down Black League cells and crush them!</p>';
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;">';
    html += '<span>⚫ Active Cells: <b style="color:#cc0000;">' + summary.active + '</b></span>';
    html += '<span> Destroyed: <b style="color:#5fae3c;">' + summary.destroyed + '</b></span>';
    html += '<span>⏳ Next Cell: <b>' + summary.nextPlacement + ' weeks</b></span>';
    html += '<span> Cells Placed: <b>' + summary.totalPlaced + '</b></span>';
    html += '</div>';
    
    var total = summary.totalPlaced + summary.active;
    var pct = total > 0 ? (summary.totalDestroyed / total) * 100 : 0;
    html += '<div class="meter" style="height:6px;margin-top:6px;"><i style="width:' + Math.min(100, pct) + '%;background:#ffd700;"></i></div>';
    html += '</div>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:10px 0;">';
    
    locations.forEach(function(loc) {
      var isActive = loc.hasCell;
      var borderColor = isActive ? '#cc0000' : '#333';
      var bgColor = isActive ? 'rgba(204,0,0,0.15)' : 'rgba(255,255,255,0.03)';
      
      html += '<div class="cell-location" style="background:' + bgColor + ';border:2px solid ' + borderColor + ';border-radius:8px;padding:12px;text-align:center;cursor:' + (isActive ? 'pointer' : 'default') + ';' + (isActive ? 'transition:all 0.2s;' : 'opacity:0.6;') + '"' + (isActive ? ' onclick="UI.crushCell(\'' + loc.id + '\')"' : '') + '>';
      html += '<div style="font-size:2rem;">' + loc.icon + '</div>';
      html += '<div style="font-weight:bold;font-size:0.9rem;">' + loc.name + '</div>';
      
      if (isActive) {
        html += '<div style="font-size:0.8rem;color:#ff6b6b;">⚫ CELL ACTIVE</div>';
        html += '<div style="font-size:0.7rem;color:#888;">Strength: ' + loc.strength + '/5</div>';
        html += '<div style="font-size:0.7rem;color:#888;">Supporters: ' + loc.supporters + '</div>';
        html += '<div style="font-size:0.7rem;color:#666;">Placed: Week ' + loc.weekPlaced + '</div>';
        html += '<button class="chip" style="margin-top:6px;background:#cc0000;border-color:#ff0000;" onclick="event.stopPropagation();UI.crushCell(\'' + loc.id + '\')">💥 Crush Cell</button>';
      } else {
        html += '<div style="font-size:0.7rem;color:#666;">🔍 No cell detected</div>';
      }
      html += '</div>';
    });
    
    html += '</div>';
    
    html += '<div class="result-box" style="margin-top:10px;background:rgba(255,255,255,0.03);">';
    html += '<div style="display:flex;gap:15px;flex-wrap:wrap;font-size:0.8rem;">';
    html += '<span> <b>Active Cell</b> - Click to crush</span>';
    html += '<span>⚫ <b>BL Support</b> grows from active cells</span>';
    html += '<span>💥 <b>Crushing</b> gives one-time boost</span>';
    html += '<span>⏳ <b>New cells</b> spawn every 4 weeks</span>';
    html += '</div>';
    html += '</div>';
    
    if (summary.active > 0) {
      html += '<div class="result-box" style="border:2px solid #ffd700;background:rgba(255,215,0,0.05);margin-top:10px;">';
      html += '<h4 style="color:#ffd700;">💡 Tactical Advice</h4>';
      html += '<ul style="font-size:0.85rem;color:#ddd;padding-left:20px;">';
      html += '<li>Crush cells <b>early</b> before they grow strong</li>';
      html += '<li>Each destroyed cell gives a <b>one-time boost</b> to ZMP</li>';
      html += '<li>Cells gain <b>strength</b> over time - act fast!</li>';
      html += '<li>Cells also generate <b>BL support</b> - destroy them to reduce it</li>';
      html += '</ul>';
      html += '</div>';
    }
    
    return html;
  }

  api.crushCell = function(locationId) {
    var notes = E.crushCell(st, locationId, rng);
    notes.forEach(function(n) { toast(n); });
    renderAll();
  };

  // ============================================================
// ENHANCED CELL HUNTING MINIGAME - HOI4 Style
// ============================================================

  // ============================================================
  // ENHANCED CELL HUNTING MINIGAME - HOI4 Style
  // (Customized for the Right Panel)
  // ============================================================

  function viewCellHuntingMap() {
    if (!st) {
      return '<h2 class="scene-title">🗺️ Anti-Fascist Cell Hunting</h2>' +
        '<p class="lead">Start a game to hunt Black League cells.</p>';
    }

    if (!st.blackLeagueCells) {
      st.blackLeagueCells = {
        cells: [],
        maxCells: 8,
        placementTimer: 0,
        placementInterval: 3,
        totalCellsPlaced: 0,
        totalCellsDestroyed: 0,
        mapRevealed: false,
        intelligence: 0,
        operations: [],
        activeOperation: null
      };
    }

    var system = st.blackLeagueCells;
    var summary = E.getCellSummary(st);
    var locations = E.getCellLocationsForMap(st);

    // Check for new cell placements
    checkCellPlacement(st);

    var html = '';

    // ============================================================
    // HEADER - Intelligence & Resources
    // ============================================================
    html += '<h2 class="scene-title" style="font-size: 1.1rem;">🗺️ CELL HUNTING</h2>';
    html += '<p class="lead" style="font-size: 0.8rem;">Locate and destroy Black League cells!</p>';

    html += '<div class="result-box" style="border:1px solid #5fae3c; margin-bottom:10px; padding:8px;">';
    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; text-align:center; font-size:0.8rem;">';
    html += '<div>🧠 Intel: <b style="color:#5fae3c;">' + (system.intelligence || 0) + '</b></div>';
    html += '<div>⚫ Active: <b style="color:#ff6b6b;">' + summary.active + '</b></div>';
    html += '<div> Destroyed: <b style="color:#5fae3c;">' + summary.destroyed + '</b></div>';
    html += '<div>⏳ Next: <b style="color:#ffd700;">' + summary.nextPlacement + 'w</b></div>';
    html += '</div>';
    html += '</div>';

    // ============================================================
    // THE MAP - HOI4 Style Territories (Right Panel)
    // ============================================================
    html += '<div style="border:2px solid #333; border-radius:6px; padding:8px; background:rgba(0,0,0,0.3); margin-bottom:10px;">';
    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">';

    locations.forEach(function(loc) {
      var isActive = loc.hasCell;
      var isDestroyed = loc.cellData && loc.cellData.destroyed;
      var isDiscovered = loc.cellData && loc.cellData.discovered;
      var strength = loc.strength || 0;

      var borderClass = isActive ? 'active-terr' : 'clear-terr';

      html += '<div class="map-territory ' + borderClass + '" style="width:100%; height:110px; padding:5px;">';
      html += '<div class="terr-icon" style="font-size:1.5rem;">' + loc.icon + '</div>';
      html += '<div class="terr-name" style="font-size:0.7rem;">' + loc.name + '</div>';

      if (isActive && !isDestroyed) {
        html += '<div class="terr-status" style="font-size:0.6rem;">⚫ ACTIVE</div>';
        html += '<div class="terr-strength" style="font-size:0.55rem;">Str: ' + strength + '/5</div>';
        
        // Button to attack the cell
        html += '<button class="terr-btn" style="font-size:0.55rem; padding:2px 5px;" onclick="event.stopPropagation(); UI.operationAgainstCell(\'' + loc.id + '\')"> Op</button>';
      } else if (isDestroyed) {
        html += '<div class="terr-status" style="font-size:0.6rem; color:#5fae3c;"> Clear</div>';
      } else if (isDiscovered) {
        html += '<div class="terr-status" style="font-size:0.6rem; color:#ffd700;">📡 Intel</div>';
      } else {
        html += '<div class="terr-status" style="font-size:0.6rem;">🔍 Clear</div>';
        if ((system.intelligence || 0) >= 3) {
          html += '<div style="font-size:0.55rem; color:#5fae3c;">Click to investigate</div>';
        }
      }
      html += '</div>';
    });

    html += '</div>';
    html += '</div>';

    // ============================================================
    // INTELLIGENCE & OPERATIONS PANEL
    // ============================================================
    html += '<div style="display:flex; flex-direction:column; gap:6px;">';
    
    // Intelligence Operations
    html += '<div class="result-box" style="border:1px solid #4488cc; padding:8px;">';
    html += '<h3 style="color:#4488cc; font-size:0.8rem;">🧠 Intel</h3>';
    html += '<button class="act" style="font-size:0.7rem; width:100%;" onclick="UI.gatherIntelligence()">📡 Gather Intel ($5)</button>';
    html += '<button class="act" style="font-size:0.7rem; width:100%; margin-top:4px; ' + ((system.intelligence || 0) < 5 ? 'opacity:0.5;' : '') + '" ' + ((system.intelligence || 0) < 5 ? 'disabled' : '') + ' onclick="UI.surveillanceSweep()">🔍 Sweep All ($10)</button>';
    html += '</div>';

    // Military Operations
    html += '<div class="result-box" style="border:1px solid #cc4444; padding:8px;">';
    html += '<h3 style="color:#cc4444; font-size:0.8rem;"> Ops</h3>';
    html += '<button class="act" style="font-size:0.7rem; width:100%;" onclick="UI.raidCell()">💥 Raid Cell</button>';
    html += '<button class="act" style="font-size:0.7rem; width:100%; margin-top:4px;" onclick="UI.infiltrateCell()">🕵️ Infiltrate</button>';
    html += '<button class="act" style="font-size:0.7rem; width:100%; margin-top:4px;" onclick="UI.sabotageCell()"> Sabotage</button>';
    html += '</div>';

    // Active Operation
    if (system.activeOperation) {
      var op = system.activeOperation;
      var progress = Math.min(100, Math.round((op.progress / op.duration) * 100));
      
      html += '<div class="result-box" style="border:1px solid #ffd700; padding:8px;">';
      html += '<h3 style="color:#ffd700; font-size:0.8rem;">⚡ ' + esc(op.name) + '</h3>';
      html += '<div class="meter" style="height:6px;"><i style="width:' + progress + '%;background:#ffd700;"></i></div>';
      html += '<div style="font-size:0.7rem; color:#aaa; text-align:center;">' + progress + '%</div>';
      html += '</div>';
    }

    html += '</div>';

    return html;
  }

  // ============================================================
  // CELL HUNTING FUNCTION CALLS (Complete)
  // ============================================================

  function checkCellPlacement(st) {
    if (!st.blackLeagueCells) return;
    var system = st.blackLeagueCells;

    system.placementTimer += 1;

    if (system.placementTimer >= system.placementInterval && system.cells.length < system.maxCells) {
      system.placementTimer = 0;

      var allLocations = E.getCellLocations();
      var occupiedIds = system.cells.map(function(c) { return c.location; });
      var available = allLocations.filter(function(l) {
        return occupiedIds.indexOf(l.id) === -1;
      });

      if (available.length > 0) {
        var loc = available[Math.floor(rng() * available.length)];
        var strength = 1 + Math.floor(rng() * 2);

        system.cells.push({
          id: 'cell_' + Date.now() + '_' + Math.floor(rng() * 1000),
          location: loc.id,
          locationName: loc.name,
          icon: loc.icon,
          strength: strength,
          weekPlaced: st.week,
          discovered: false,
          destroyed: false,
          supporters: 5 + Math.floor(rng() * 10),
          intelLevel: 0
        });

        system.totalCellsPlaced += 1;

        toast('⚫ New Black League cell detected in ' + loc.name + '!');
        st.log.push('Week ' + st.week + ': BL placed cell in ' + loc.name);
      }
    }

    // Cells grow stronger over time
    system.cells.forEach(function(cell) {
      if (!cell.destroyed) {
        if (st.week - cell.weekPlaced > 3 && cell.strength < 5) {
          cell.strength = Math.min(5, cell.strength + 0.3);
        }
        if (st.week - cell.weekPlaced > 2) {
          cell.supporters = Math.min(30, cell.supporters + Math.floor(rng() * 1.5));
        }
      }
    });
  }

  api.gatherIntelligence = function() {
    if (!st) return;
    if (st.ap < 1) { toast('Not enough AP!'); return; }
    if (st.funds < 5) { toast('Need $5 for intelligence operations.'); return; }

    st.ap -= 1;
    st.funds -= 5;

    var system = st.blackLeagueCells;
    var intelGain = 2 + Math.floor(rng() * 3);
    system.intelligence = (system.intelligence || 0) + intelGain;

    // Reveal a random cell
    var undestroyed = system.cells.filter(function(c) { return !c.destroyed; });
    if (undestroyed.length > 0) {
      var cell = undestroyed[Math.floor(rng() * undestroyed.length)];
      cell.discovered = true;
      cell.intelLevel = Math.min(5, (cell.intelLevel || 0) + 1);
      toast('📡 Revealed cell in ' + cell.locationName + ' (Intel Level ' + cell.intelLevel + '/5)');
    }

    toast('🧠 Intelligence +' + intelGain + ' (Total: ' + system.intelligence + ')');
    renderAll();
  };

  api.surveillanceSweep = function() {
    if (!st) return;
    if (st.ap < 2) { toast('Not enough AP!'); return; }
    if (st.funds < 10) { toast('Need $10 for surveillance sweep.'); return; }

    var system = st.blackLeagueCells;
    if (system.intelligence < 5) {
      toast('Need 5+ intelligence for a surveillance sweep.');
      return;
    }

    st.ap -= 2;
    st.funds -= 10;
    system.intelligence -= 3;

    // Reveal all cells
    var undestroyed = system.cells.filter(function(c) { return !c.destroyed; });
    undestroyed.forEach(function(cell) {
      cell.discovered = true;
      cell.intelLevel = Math.min(5, (cell.intelLevel || 0) + 2);
    });

    toast('🔍 All cells revealed!');
    renderAll();
  };

  api.operationAgainstCell = function(locationId) {
    if (!st) return;

    var system = st.blackLeagueCells;
    var cell = system.cells.find(function(c) {
      return c.location === locationId && !c.destroyed;
    });

    if (!cell) {
      toast('No active cell found there.');
      return;
    }

    if (!cell.discovered) {
      toast('🔍 Cell not discovered! Gather intelligence first.');
      return;
    }

    // Show operation menu
    var html = '<h2 class="scene-title" style="font-size: 1.1rem;"> Operation</h2>';
    html += '<p class="lead" style="font-size: 0.85rem;">Target: ' + cell.locationName + ' | Strength: ' + Math.round(cell.strength) + '/5</p>';
    
    html += '<div class="result-box" style="padding:10px;">';
    
    // Raid
    var canRaid = st.ap >= 2 && st.funds >= 15 && st.volunteers >= 3;
    html += '<button class="act" style="width:100%; margin-bottom:6px; ' + (canRaid ? '' : 'opacity:0.5;') + '" ' + (canRaid ? '' : 'disabled') + ' onclick="UI.executeRaid(\'' + locationId + '\')">';
    html += '<b>💥 RAID CELL</b><br><span class="d">Cost: 2 AP, $15, 3 Vol</span></button>';

    // Infiltrate
    var canInfiltrate = st.ap >= 2 && st.funds >= 10;
    html += '<button class="act" style="width:100%; margin-bottom:6px; ' + (canInfiltrate ? '' : 'opacity:0.5;') + '" ' + (canInfiltrate ? '' : 'disabled') + ' onclick="UI.executeInfiltrate(\'' + locationId + '\')">';
    html += '<b>🕵️ INFILTRATE</b><br><span class="d">Cost: 2 AP, $10</span></button>';

    // Sabotage
    var canSabotage = st.ap >= 1 && st.funds >= 8;
    html += '<button class="act" style="width:100%; ' + (canSabotage ? '' : 'opacity:0.5;') + '" ' + (canSabotage ? '' : 'disabled') + ' onclick="UI.executeSabotage(\'' + locationId + '\')">';
    html += '<b> SABOTAGE</b><br><span class="d">Cost: 1 AP, $8</span></button>';

    html += '</div>';
    html += '<div class="btn-row"><button class="btn alt" onclick="UI.setTab(\'cells\')">Back to Map</button></div>';

    var m = $('main');
    if (m) m.innerHTML = html;
  };

  api.executeRaid = function(locationId) {
    if (!st) return;
    if (st.ap < 2) { toast('Not enough AP!'); return; }
    if (st.funds < 15) { toast('Need $15 for a raid.'); return; }
    if (st.volunteers < 3) { toast('Need 3 volunteers.'); return; }

    st.ap -= 2;
    st.funds -= 15;
    st.volunteers -= 3;

    var system = st.blackLeagueCells;
    var cell = system.cells.find(function(c) {
      return c.location === locationId && !c.destroyed;
    });

    if (!cell) {
      toast('Cell not found.');
      renderAll();
      return;
    }

    // Calculate success chance
    var successChance = 0.4 + (cell.intelLevel || 0) * 0.08 + (st.unity / 200) + (st.momentum / 80);
    successChance = Math.min(0.9, successChance);

    var notes = [];
    notes.push('💥 RAIDING ' + cell.locationName + '!');
    notes.push(' Success Chance: ' + Math.round(successChance * 100) + '%');

    if (rng() < successChance) {
      notes.push(' RAID SUCCESSFUL!');
      cell.destroyed = true;
      system.totalCellsDestroyed += 1;

      // Rewards
      var reward = 4 + cell.strength + Math.floor(cell.supporters / 4);
      if (D && D.DEMOS) {
        for (var i = 0; i < D.DEMOS.length; i++) {
          var dm = D.DEMOS[i];
          st.raw.ZMP[dm.id] = Math.max(0.5, (st.raw.ZMP[dm.id] || 0) + reward);
          st.raw.bl[dm.id] = Math.max(0.5, (st.raw.bl[dm.id] || 0) - cell.strength * 3);
        }
      }

      st.funds += Math.round(cell.supporters * 0.3);
      st.volunteers += Math.floor(cell.supporters / 4);
      st.momentum = Math.min(20, st.momentum + 3);
      st.unity = Math.min(100, st.unity + 3);

      notes.push('📈 ZMP +' + reward + '% support!');
      notes.push('💰 +$' + Math.round(cell.supporters * 0.3) + ' recovered!');

      st.log.push('Week ' + st.week + ': Raid destroyed BL cell in ' + cell.locationName);

      var remaining = system.cells.filter(function(c) { return !c.destroyed; });
      if (remaining.length === 0) {
        notes.push(' ALL BLACK LEAGUE CELLS DESTROYED!');
        st.blNeutralized = true;
      }

      notes.forEach(function(n) { toast(n); });
    } else {
      notes.push(' RAID FAILED!');
      cell.strength = Math.min(5, cell.strength + 0.5);
      cell.supporters += Math.floor(rng() * 3);
      st.momentum = Math.max(-10, st.momentum - 2);
      st.unity = Math.max(0, st.unity - 3);

      notes.push('📈 Cell grew stronger!');
      notes.forEach(function(n) { toast(n); });
    }

    renderAll();
  };

  api.executeInfiltrate = function(locationId) {
    if (!st) return;
    if (st.ap < 2) { toast('Not enough AP!'); return; }
    if (st.funds < 10) { toast('Need $10 for infiltration.'); return; }

    st.ap -= 2;
    st.funds -= 10;

    var system = st.blackLeagueCells;
    var cell = system.cells.find(function(c) {
      return c.location === locationId && !c.destroyed;
    });

    if (!cell) {
      toast('Cell not found.');
      renderAll();
      return;
    }

    var successChance = 0.5 + (st.momentum / 100) + (st.unity / 200);
    successChance = Math.min(0.85, successChance);

    var notes = [];
    if (rng() < successChance) {
      notes.push(' INFILTRATION SUCCESSFUL!');
      cell.intelLevel = 5;
      cell.discovered = true;
      cell.supporters = Math.max(0, cell.supporters - 5);
      cell.strength = Math.max(1, cell.strength - 1);

      system.intelligence = (system.intelligence || 0) + 5;
      notes.push('🔍 Full intel on cell gathered!');
      notes.push('🧠 Intelligence +5');

      st.log.push('Week ' + st.week + ': Infiltrated BL cell in ' + cell.locationName);
      notes.forEach(function(n) { toast(n); });
    } else {
      notes.push(' INFILTRATION FAILED!');
      cell.strength = Math.min(5, cell.strength + 0.5);
      st.momentum = Math.max(-10, st.momentum - 3);
      st.unity = Math.max(0, st.unity - 5);

      notes.push('📈 Cell grew stronger!');
      notes.forEach(function(n) { toast(n); });
    }

    renderAll();
  };

  api.executeSabotage = function(locationId) {
    if (!st) return;
    if (st.ap < 1) { toast('Not enough AP!'); return; }
    if (st.funds < 8) { toast('Need $8 for sabotage.'); return; }

    st.ap -= 1;
    st.funds -= 8;

    var system = st.blackLeagueCells;
    var cell = system.cells.find(function(c) {
      return c.location === locationId && !c.destroyed;
    });

    if (!cell) {
      toast('Cell not found.');
      renderAll();
      return;
    }

    var successChance = 0.6 + (st.momentum / 100);
    successChance = Math.min(0.9, successChance);

    var notes = [];
    if (rng() < successChance) {
      notes.push(' SABOTAGE SUCCESSFUL!');
      cell.strength = Math.max(1, cell.strength - 1.5);
      cell.supporters = Math.max(0, cell.supporters - 3);

      notes.push(' Cell weakened!');
      st.momentum = Math.min(20, st.momentum + 1);

      st.log.push('Week ' + st.week + ': Sabotaged BL cell in ' + cell.locationName);
      notes.forEach(function(n) { toast(n); });
    } else {
      notes.push(' SABOTAGE FAILED!');
      cell.strength = Math.min(5, cell.strength + 0.5);
      st.momentum = Math.max(-10, st.momentum - 1);

      notes.push('📈 Cell grew stronger!');
      notes.forEach(function(n) { toast(n); });
    }

    renderAll();
  };

  api.investigateLocation = function(locationId) {
    if (!st) return;
    if (st.ap < 1) { toast('Not enough AP!'); return; }

    var system = st.blackLeagueCells;
    if (system.intelligence < 3) {
      toast('Need 3+ intelligence to investigate.');
      return;
    }

    st.ap -= 1;
    system.intelligence -= 2;

    var cell = system.cells.find(function(c) {
      return c.location === locationId && !c.destroyed;
    });

    if (cell) {
      cell.discovered = true;
      cell.intelLevel = Math.min(5, (cell.intelLevel || 0) + 2);
      toast('🔍 Cell in ' + cell.locationName + ' discovered!');
    } else {
      toast('🔍 No cell found. Location is clean.');
    }

    renderAll();
  };

  api.raidCell = function() {
    if (!st) return;
    var system = st.blackLeagueCells;
    var activeCells = system.cells.filter(function(c) { return !c.destroyed && c.discovered; });

    if (activeCells.length === 0) {
      toast('No discovered active cells to raid.');
      return;
    }

    var cell = activeCells[0];
    api.executeRaid(cell.location);
  };

  api.infiltrateCell = function() {
    if (!st) return;
    var system = st.blackLeagueCells;
    var activeCells = system.cells.filter(function(c) { return !c.destroyed && c.discovered; });

    if (activeCells.length === 0) {
      toast('No discovered active cells to infiltrate.');
      return;
    }

    var cell = activeCells[0];
    api.executeInfiltrate(cell.location);
  };

  api.sabotageCell = function() {
    if (!st) return;
    var system = st.blackLeagueCells;
    var activeCells = system.cells.filter(function(c) { return !c.destroyed && c.discovered; });

    if (activeCells.length === 0) {
      toast('No discovered active cells to sabotage.');
      return;
    }

    var cell = activeCells[0];
    api.executeSabotage(cell.location);
  };

api.investigateLocation = function(locationId) {
    if (!st) return;
    if (st.ap < 1) { toast('Not enough AP!'); return; }
    
    var system = st.blackLeagueCells;
    if (system.intelligence < 3) {
        toast('Need 3+ intelligence to investigate.');
        return;
    }
    
    st.ap -= 1;
    system.intelligence -= 2;
    
    var cell = system.cells.find(function(c) { 
        return c.location === locationId && !c.destroyed; 
    });
    
    if (cell) {
        cell.discovered = true;
        cell.intelLevel = Math.min(5, (cell.intelLevel || 0) + 2);
        toast('🔍 Cell in ' + cell.locationName + ' discovered! (Intel Level ' + cell.intelLevel + '/5)');
    } else {
        toast('🔍 No cell found. Location is clean.');
    }
    
    renderAll();
};

api.raidCell = function() {
    if (!st) return;
    var system = st.blackLeagueCells;
    var activeCells = system.cells.filter(function(c) { return !c.destroyed && c.discovered; });
    
    if (activeCells.length === 0) {
        toast('No discovered active cells to raid.');
        return;
    }
    
    // Raid the first discovered cell
    var cell = activeCells[0];
    api.executeRaid(cell.location);
};

api.infiltrateCell = function() {
    if (!st) return;
    var system = st.blackLeagueCells;
    var activeCells = system.cells.filter(function(c) { return !c.destroyed && c.discovered; });
    
    if (activeCells.length === 0) {
        toast('No discovered active cells to infiltrate.');
        return;
    }
    
    var cell = activeCells[0];
    api.executeInfiltrate(cell.location);
};

api.sabotageCell = function() {
    if (!st) return;
    var system = st.blackLeagueCells;
    var activeCells = system.cells.filter(function(c) { return !c.destroyed && c.discovered; });
    
    if (activeCells.length === 0) {
        toast('No discovered active cells to sabotage.');
        return;
    }
    
    var cell = activeCells[0];
    api.executeSabotage(cell.location);
};

  function viewPresidentialCards() {
    if (!st || !st.hasPresident) {
      return '<h2 class="scene-title">No President</h2><p class="lead">There is no president to take action.</p>';
    }
    
    var html = '';
    html += '<h2 class="scene-title"> Presidential Actions</h2>';
    html += '<p class="lead">As President, you can draw a card and take executive action.</p>';
    html += '<p class="quiet">Draw one card per week. Some cards have powerful effects.</p>';
    
    html += '<div class="btn-row">';
    html += '<button class="btn" onclick="UI.drawPresidentialCard()">Draw a Card</button>';
    html += '</div>';
    
    if (st.pendingPresidentialCard) {
      var card = st.pendingPresidentialCard;
      html += '<div class="result-box" style="margin:15px 0;border:2px solid #ffd700;">';
      html += '<h3 style="color:#ffd700;">🎴 Presidential Action Card</h3>';
      html += '<div style="padding:10px;">';
      html += '<h4>' + esc(card.name) + '</h4>';
      html += '<p>' + esc(card.desc) + '</p>';
      html += '<div class="btn-row">';
      html += '<button class="btn" onclick="UI.executePresidentialCard(\'' + card.id + '\')">Execute</button>';
      html += '<button class="btn alt" onclick="UI.go(\'week\')">Discard</button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    }
    
    if (st.presidentialCards && st.presidentialCards.length > 0) {
      html += '<h3>Previously Drawn Cards</h3>';
      var recentCards = st.presidentialCards.slice(-5).reverse();
      for (var i = 0; i < recentCards.length; i++) {
        var card = recentCards[i];
        html += '<div class="result-box" style="margin:6px 0;padding:10px;background:#1a1a1a;">';
        html += '<div style="display:flex;justify-content:space-between;">';
        html += '<span><b>' + esc(card.name) + '</b> - ' + esc(card.desc) + '</span>';
        html += '<span style="color:#888;">Week ' + card.week + '</span>';
        html += '</div>';
        html += '</div>';
      }
    }
    
    return html;
  }

  function viewPartyAmbitions() {
    if (!st) {
      return '<h2 class="scene-title"> Party Ambitions</h2><p class="lead">Start a game to see parties compete.</p>';
    }
    
    initPartyAmbitions(st);
    var system = st.partyAmbitions;
    
    var html = '';
    html += '<h2 class="scene-title"> Party Ambitions</h2>';
    html += '<p class="lead">Other parties are competing for power. Watch their ambitions!</p>';
    
    html += '<div class="result-box" style="margin-bottom:15px;">';
    html += '<h3> Competition Level</h3>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span>ZMP vs Other Parties:</span>';
    var comp = system.partyCompetition || 0;
    var compLabel = comp < 30 ? '🟢 Low' : comp < 60 ? '🟡 Medium' : ' High';
    html += '<span style="font-size:1.2rem;font-weight:bold;color:' + (comp < 30 ? '#5fae3c' : comp < 60 ? '#ffcc00' : '#ff0000') + ';">' + compLabel + ' (' + comp + '%)</span>';
    html += '</div>';
    html += '<div class="meter" style="height:6px;margin:4px 0;"><i style="width:' + Math.min(100, comp) + '%;background:' + (comp < 30 ? '#5fae3c' : comp < 60 ? '#ffcc00' : '#ff0000') + ';"></i></div>';
    if (system.dominantParty) {
      var p = E.getParty(system.dominantParty);
      html += '<div style="font-size:0.85rem;color:#ffcc00;">⚡ Dominant Party: ' + (p ? p.short : system.dominantParty) + '</div>';
    }
    html += '</div>';
    
    html += '<h3>📋 Party Ambitions</h3>';
    var parties = activeParties(st);
    var hasActive = false;
    
    parties.forEach(function(p) {
      if (p.id === 'ZMP' || p.id === 'other') return;
      
      var data = system.activeParties[p.id];
      if (!data) return;
      
      hasActive = true;
      var support = E.getPartySupport(st, p.id);
      var color = p.id === 'zpf' ? '#006400' : p.color;
      
      html += '<div class="result-box" style="border-left:4px solid ' + color + ';margin:6px 0;padding:8px 12px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">';
      html += '<span style="color:' + color + ';font-weight:bold;">' + esc(p.short) + '</span>';
      html += '<span style="font-size:0.8rem;color:#888;">Strength: ' + data.strength + '/10 | Support: ' + Math.round(support) + '%</span>';
      html += '</div>';
      
      var ambition = data.ambition;
      html += '<div style="font-size:0.9rem;margin:4px 0;">';
      html += '<span style="color:#ffcc00;">🎯 ' + esc(ambition.name) + '</span>';
      html += ' <span style="color:#888;">- ' + esc(ambition.desc) + '</span>';
      html += '</div>';
      
      var progress = data.completed ? 100 : Math.min(100, (data.progress || 0));
      html += '<div class="meter" style="height:4px;margin:4px 0;"><i style="width:' + progress + '%;background:' + (data.completed ? '#5fae3c' : '#ffcc00') + ';"></i></div>';
      
      if (data.completed) {
        html += '<div style="font-size:0.75rem;color:#5fae3c;"> Completed Week ' + data.completionWeek + '</div>';
      } else {
        html += '<div style="font-size:0.75rem;color:#888;">⏳ In progress...</div>';
      }
      
      if (data.rivals && data.rivals.length > 0) {
        html += '<div style="font-size:0.7rem;color:#ff6b6b;margin-top:2px;"> Rivals: ' + data.rivals.join(', ') + '</div>';
      }
      if (data.allies && data.allies.length > 0) {
        html += '<div style="font-size:0.7rem;color:#5fae3c;margin-top:2px;"> Allies: ' + data.allies.join(', ') + '</div>';
      }
      
      html += '</div>';
    });
    
    if (!hasActive) {
      html += '<div class="stat sub">No active parties with ambitions.</div>';
    }
    
    if (system.completedAmbitions && system.completedAmbitions.length > 0) {
      html += '<h3 style="margin-top:15px;"> Completed Ambitions</h3>';
      html += '<div style="max-height:120px;overflow-y:auto;">';
      system.completedAmbitions.slice(-10).reverse().forEach(function(c) {
        var p = E.getParty(c.party);
        html += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #222;font-size:0.8rem;">';
        html += '<span>' + (p ? p.short : c.party) + ': ' + c.ambition.name + '</span>';
        html += '<span style="color:#888;">Week ' + c.week + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }
    
    html += '<div class="result-box" style="background:rgba(255,215,0,0.05);border:1px solid #ffd700;margin-top:15px;">';
    html += '<h3 style="color:#ffd700;">💡 Strategic Insights</h3>';
    html += '<ul style="font-size:0.85rem;color:#ddd;padding-left:20px;">';
    html += '<li>Parties with <b>15%+ support</b> become DOMINANT and challenge ZMP</li>';
    html += '<li>Watch for <b>rivalries</b> - parties that compete for the same voters</li>';
    html += '<li>Parties can <b>form alliances</b> to boost each other</li>';
    html += '<li><b>High competition</b> means more attacks on ZMP support</li>';
    html += '<li>You can <b>counter</b> by improving relations or absorbing parties</li>';
    html += '</ul>';
    html += '</div>';
    
    return html;
  }

  function initPartyCongress(st) {
    if (!st.congress) {
      st.congress = {
        points: 5,
        policies: {
          education: { level: 1, max: 5, cost: 2, bonus: { faculty: 2, honor: 1 } },
          economy: { level: 1, max: 5, cost: 2, bonus: { funds: 5, zmp: 1 } },
          healthcare: { level: 1, max: 5, cost: 2, bonus: { volunteers: 2, buskids: 1 } },
          infrastructure: { level: 1, max: 5, cost: 2, bonus: { unity: 1, athletes: 1 } },
          justice: { level: 1, max: 5, cost: 2, bonus: { faculty: 2, bl: -1 } },
          technology: { level: 1, max: 5, cost: 2, bonus: { gamers: 2, iia: 1 } },
          arts: { level: 1, max: 5, cost: 2, bonus: { arts: 2, pl: 1 } },
          sports: { level: 1, max: 5, cost: 2, bonus: { athletes: 2, sportica: 1 } }
        },
        factionInfluence: {
          loyalists: 25,
          gamers: 25,
          girls: 25,
          spirit: 25
        },
        currentFaction: st.faction || 'loyalists',
        congressHistory: [],
        activeResolution: null,
        nextCongressWeek: 13
      };
    }
    return st.congress;
  }

  function finishConstitutionalConvention() {
  var cc = st.constitutionalConvention;
  if (!cc) return;

  var passed = cc.votes.filter(function(v) { return v.passed; }).length;

  var title, subtitle, body, story, subending;

  if (passed === 4) {
    title = 'The Charter of the New School';
    subtitle = 'Your constitution passes in full.';
    body = 'All four clauses pass. The school is rebuilt in your image.';
    story =
      'The convention ran for four days. On the first day, the purpose of the school was ' +
      'defined. On the second, authority was settled. On the third, rights were written. ' +
      'On the fourth, the economy was agreed. Every clause went as you wrote it. ' +
      'The document that emerged is yours, in full, and the school will be governed by ' +
      'it for years. There are no amendments. There are no reservations. There is only the ' +
      'charter, and the charter is the law.';
    subending = 'Subending CC — The Written Charter';
  } else if (passed === 3) {
    title = 'The Compromised Charter';
    subtitle = 'Most of your constitution passes.';
    body = 'Three of four clauses pass. The charter is yours, but with amendments.';
    story =
      'The convention ran for four days. Three clauses passed. One did not. ' +
      'The failure is a reminder that even a majority does not mean total control. ' +
      'The charter that emerged is yours — mostly. It has an amendment you did not write, ' +
      'a clause you did not want, and a compromise that will be remembered long after ' +
      'the people who made it have graduated.';
    subending = 'Subending CC — The Amended Charter';
  } else if (passed === 2) {
    title = 'The Divided Charter';
    subtitle = 'Half your constitution passes. Half is blocked.';
    body = 'Two clauses pass, two fail. The school is governed by a document nobody fully owns.';
    story =
      'The convention ran for four days. Two clauses passed. Two did not. ' +
      'What emerged is a document that belongs to no one. The right claims the failed ' +
      'clauses as victories. The left claims the passed clauses as theirs. The center ' +
      'claims the whole thing is unworkable. The charter is law, but it is law that ' +
      'nobody loves. It will be tested, amended, and eventually replaced.';
    subending = 'Subending CC — The Divided Charter';
  } else {
    title = 'The Rejected Charter';
    subtitle = 'Your constitution is defeated.';
    body = 'The opposition defeats your convention. The old system continues, or is replaced by theirs.';
    story =
      'The convention ran for four days. Every clause failed. The opposition, united for ' +
      'the first time in months, blocked every proposal you made. What emerges is not ' +
      'your charter — it is theirs. The old system continues in name, but it has been ' +
      'rebuilt in the image of your enemies. The ZMP leaves the convention with nothing ' +
      'to show for it. It will spend the next year explaining what went wrong.';
    subending = 'Subending CC — The Rejected Charter';
  }

  cc.result = {
    passed: passed,
    total: CONSTITUTION_PHASES.length,
    title: title
  };

  // Build the detail panel
  var detailHtml =
    '<div class="stat"><span>Clauses passed</span><span class="v">' +
    passed + ' / ' + CONSTITUTION_PHASES.length + '</span></div>';

  cc.votes.forEach(function(v) {
    var color = v.passed ? '#5fae3c' : '#cc0000';
    var label = v.passed ? 'PASSED' : 'FAILED';
    detailHtml +=
      '<div class="stat"><span>' + esc(v.phaseTitle) + '</span>' +
      '<span class="v" style="color:' + color + ';font-weight:bold;">' + label + '</span></div>' +
      '<div class="stat sub"><span style="font-size:0.75rem;">' + esc(v.option) + '</span></div>' +
      '<div class="stat sub"><span style="font-size:0.75rem;color:#888;">' +
      'Yes ' + v.yes + ' · No ' + v.no + ' · Abstain ' + v.abstain +
      '</span></div>';
  });

  st.endingData = {
    ending: 'constitutional_convention',
    title: title,
    subtitle: subtitle,
    endingNumber: 'Ending CC',
    body: body,
    story: story,
    subending: subending,
    detail: detailHtml,
    epilogue:
      'The school is governed by the charter. It will last for years. ' +
      'Students will learn it in class. New arrivals will be handed a copy on their first day. ' +
      'And in fifty years, when someone asks why the school works the way it does, ' +
      'the answer will be: because in Week ' + st.week + ', a convention was held, ' +
      'and four clauses were voted on, and the result was this document. ' +
      'It is not perfect. But it is written down, and that is more than most schools ever manage.'
  };

  st.finished = true;
  scene = 'end';
  renderAll();
}

  function initPartyAmbitions(st) {
    if (!st.partyAmbitions) {
      st.partyAmbitions = {
        activeParties: {},
        ambitions: [],
        completedAmbitions: [],
        partyCompetition: 0,
        dominantParty: null
      };
      
      var parties = activeParties(st);
      parties.forEach(function(p) {
        if (p.id === 'ZMP' || p.id === 'other') return;
        st.partyAmbitions.activeParties[p.id] = {
          ambition: generateAmbition(st, p.id),
          progress: 0,
          completed: false,
          strength: 1 + Math.floor(E.getPartySupport(st, p.id) / 10),
          allies: [],
          rivals: [],
          lastAction: st.week
        };
      });
    }
    return st.partyAmbitions;
  }

  api.voteConstitutionalClause = function(optionIndex) {
  if (!st.constitutionalConvention) {
    toast('No convention in session.');
    return;
  }

  var cc = st.constitutionalConvention;

  if (cc.phase >= CONSTITUTION_PHASES.length) {
    finishConstitutionalConvention();
    return;
  }

  var currentPhase = CONSTITUTION_PHASES[cc.phase];
  var opt = currentPhase.options[optionIndex];

  if (!opt) {
    toast('Invalid clause option.');
    return;
  }

  var playerFactionId = 'secularists';
  for (var i = 0; i < D.FACTIONS.length; i++) {
    if (D.FACTIONS[i].id === st.faction) {
      playerFactionId = D.FACTIONS[i].id;
      break;
    }
  }

  var zmpSeats = st.seats.ZMP || 0;
  var yesVotes = zmpSeats;
  var noVotes = 0;
  var abstain = 0;

  var parties = E.activeParties(st);
  for (var i = 0; i < parties.length; i++) {
    var p = parties[i];
    if (p.id === 'ZMP' || p.id === 'other') continue;

    var seats = st.seats[p.id] || 0;
    if (seats === 0) continue;

    if (opt.aligns.indexOf(playerFactionId) !== -1) {
      var isPartner = st.coalitionPartners && st.coalitionPartners.indexOf(p.id) !== -1;
      if (isPartner) {
        yesVotes += seats;
      } else {
        var aff = st.affinity[p.id] || 50;
        if (aff >= 50) { yesVotes += seats; }
        else { abstain += seats; }
      }
      continue;
    }

    if (opt.aligns.indexOf(p.id) !== -1) {
      yesVotes += seats;
      continue;
    }

    var aff2 = st.affinity[p.id] || 50;
    if (aff2 >= 65) { yesVotes += seats; }
    else if (aff2 <= 30) { noVotes += seats; }
    else { abstain += seats; }
  }

  var passed = yesVotes > (noVotes + (abstain / 2));

  cc.votes.push({
    phase: currentPhase.id,
    phaseTitle: currentPhase.title,
    option: opt.text,
    yes: yesVotes,
    no: noVotes,
    abstain: abstain,
    passed: passed
  });

  if (passed) {
    if (opt.effects) {
      var notes = E.applyEffects(st, opt.effects, rng);
      notes.forEach(function(n) { toast(n); });
    }
    st.log.push('Week ' + st.week + ': Constitutional clause passed — ' + opt.text);
  } else {
    toast('The clause fails. The opposition blocks it.');
    st.unity = Math.max(0, st.unity - 3);
    st.log.push('Week ' + st.week + ': Constitutional clause failed — ' + opt.text);
  }

  cc.phase += 1;

  if (cc.phase >= CONSTITUTION_PHASES.length) {
    finishConstitutionalConvention();
  } else {
    renderAll();
  }
};

  function viewConstitutionalConvention() {
  if (!st.constitutionalConvention) {
    st.constitutionalConvention = {
      phase: 0,
      clauses: [],
      votes: []
    };
  }
  var cc = st.constitutionalConvention;

  var phases = [
    {
      id: 'purpose',
      title: 'Clause I — The Purpose of the School',
      body: 'What is this school for? The answer will shape every other clause.',
      options: [
        {
          text: 'To educate citizens for a democratic society.',
          desc: 'The school exists to produce informed, equal citizens. Civic education, student rights, and democratic participation are central.',
          aligns: ['secularists', 'iia', 'pl'],
          effects: { faculty: 5, unity: 4, demo: { honor: 3, buskids: 3, freshmen: 2 } }
        },
        {
          text: 'To form moral and religious character.',
          desc: 'The school exists to shape souls. Religious instruction, moral discipline, and community are central.',
          aligns: ['zalgrilian', 'securro', 'nhp'],
          effects: { faculty: 3, unity: 6, demo: { honor: 4, seniors: 3, athletes: 2 } }
        },
        {
          text: 'To prepare students for work and the economy.',
          desc: 'The school exists to produce capable workers and entrepreneurs. Practical skills, STEM, and vocational training are central.',
          aligns: ['iia', 'tiia', 'pl'],
          effects: { funds: 10, momentum: 3, demo: { gamers: 4, athletes: 2, buskids: 3 } }
        },
        {
          text: 'To build the socialist commonwealth.',
          desc: 'The school exists to create a classless, equal community. Collective ownership, workers\' councils, and solidarity are central.',
          aligns: ['zpf', 'republia', 'sportica', 'red', 'rb'],
          effects: { unity: 8, demo: { buskids: 5, freshmen: 4, honor: -3 }, affinity: { red: 15, zpf: 10 } }
        }
      ]
    },
    {
      id: 'authority',
      title: 'Clause II — Where Authority Lies',
      body: 'Who holds real power in the school?',
      options: [
        {
          text: 'The student council, elected by all students.',
          desc: 'Power flows from the student body. The council is supreme. Faculty advise, they do not rule.',
          aligns: ['secularists', 'iia', 'pl', 'zpf', 'red'],
          effects: { unity: 6, faculty: -6, demo: { freshmen: 4, buskids: 3 } }
        },
        {
          text: 'A strong executive, checked by the council.',
          desc: 'A president or chancellor leads. The council can veto, but the executive sets the agenda.',
          aligns: ['securro', 'zalgrilian', 'tiia'],
          effects: { momentum: 5, faculty: 3, unity: -3, demo: { honor: 3, seniors: 4 } }
        },
        {
          text: 'Shared governance between students and faculty.',
          desc: 'The council and the faculty senate govern together. Neither can act alone.',
          aligns: ['nhp', 'iia', 'zpf'],
          effects: { faculty: 10, unity: 3, demo: { honor: 5, seniors: 3 } }
        },
        {
          text: 'The general assembly of all students.',
          desc: 'Direct democracy. Every student votes on every major decision. The council becomes an administrative body.',
          aligns: ['red', 'rb', 'republia', 'sportica'],
          effects: { unity: 10, faculty: -10, momentum: -3, demo: { buskids: 6, freshmen: 5, honor: -4 } }
        }
      ]
    },
    {
      id: 'rights',
      title: 'Clause III — The Rights of Students',
      body: 'What is guaranteed to every student, no matter what?',
      options: [
        {
          text: 'Freedom of speech, assembly, and press — absolute.',
          desc: 'No student can be punished for what they say, write, or organize. The council cannot censor.',
          aligns: ['secularists', 'iia', 'red', 'flo'],
          effects: { unity: 5, faculty: -4, demo: { gamers: 4, arts: 4, freshmen: 3 } }
        },
        {
          text: 'Freedom of religion and conscience.',
          desc: 'Every student may practice their faith freely. No religious test for any position.',
          aligns: ['secularists', 'zpf', 'iia', 'pl'],
          effects: { unity: 6, faculty: 5, demo: { honor: 3, buskids: 3 } }
        },
        {
          text: 'The right to a dignified education — free, equal, and safe.',
          desc: 'Every student has a right to food, safety, and quality instruction. The school must provide these.',
          aligns: ['zpf', 'republia', 'sportica', 'red', 'rb'],
          effects: { unity: 8, funds: -15, demo: { buskids: 6, freshmen: 5, honor: 2 } }
        },
        {
          text: 'The right to property and self-determination.',
          desc: 'Students own what they bring and what they make. The council cannot take it.',
          aligns: ['tiia', 'nhp', 'iia', 'pl'],
          effects: { funds: 10, momentum: 3, demo: { honor: 4, seniors: 3, athletes: 3 } }
        }
      ]
    },
    {
      id: 'economy',
      title: 'Clause IV — The School Economy',
      body: 'How will the school fund itself and who benefits?',
      options: [
        {
          text: 'Free school, funded by the community.',
          desc: 'Education is a right. The council funds everything through community contributions and the district.',
          aligns: ['zpf', 'red', 'rb', 'republia', 'sportica'],
          effects: { unity: 8, funds: -20, demo: { buskids: 6, freshmen: 4 } }
        },
        {
          text: 'Mixed economy — public funding and private initiative.',
          desc: 'Core instruction is free. Clubs, sports, and extras fund themselves.',
          aligns: ['iia', 'pl', 'nhp', 'tiia'],
          effects: { funds: 15, momentum: 4, demo: { honor: 3, gamers: 3, athletes: 2 } }
        },
        {
          text: 'Merit-based funding. Winners are rewarded.',
          desc: 'The best projects, the best students, the best clubs get the money. Competition drives excellence.',
          aligns: ['tiia', 'nhp'],
          effects: { funds: 12, momentum: 5, unity: -6, demo: { honor: 5, athletes: 4, freshmen: -3 } }
        },
        {
          text: 'Cooperative economy — students own and run the school enterprises.',
          desc: 'Cafeteria, bookstore, labs — all student-run, all student-owned. Profits shared.',
          aligns: ['red', 'rb', 'flo', 'republia', 'sportica'],
          effects: { unity: 10, momentum: -2, faculty: -3, demo: { buskids: 5, freshmen: 4, arts: 3 } }
        }
      ]
    }
  ];

  // ---- Render current phase ----
  if (cc.phase < phases.length) {
    var phase = phases[cc.phase];
    var html = '';

    html += '<h2 class="scene-title">📜 ' + esc(phase.title) + '</h2>';
    html += '<p class="lead">' + esc(phase.body) + '</p>';
    html += '<p class="quiet">' + (cc.phase + 1) + ' of ' + phases.length + ' clauses</p>';
    html += '<hr class="rule">';

    phase.options.forEach(function(opt, i) {
      html += '<div class="result-box" style="margin:8px 0;padding:12px;">';
      html += '<div style="font-weight:bold;font-size:1.05rem;margin-bottom:6px;">' + esc(opt.text) + '</div>';
      html += '<div style="color:#aaa;font-size:0.9rem;line-height:1.5;margin-bottom:8px;">' + esc(opt.desc) + '</div>';
      html += '<div style="font-size:0.8rem;color:#888;">Aligned with: ' + opt.aligns.join(', ') + '</div>';
      html += '<div class="btn-row" style="margin-top:8px;">';
      html += '<button class="btn" onclick="UI.voteConstitutionalClause(' + i + ')">Propose this clause</button>';
      html += '</div>';
      html += '</div>';
    });

    return html;
  }

  // ---- Result phase ----
  return viewConstitutionalResult();
}

  function generateAmbition(st, partyId) {
    var ambitions = [
      { 
        id: 'gain_influence', 
        name: 'Gain Influence',
        desc: 'Increase support by 5%',
        target: 'support',
        amount: 5,
        reward: { zmp: -2, funds: 10, volunteers: 3 }
      },
      { 
        id: 'absorb_party', 
        name: 'Absorb a Rival',
        desc: 'Absorb a smaller party',
        target: 'absorb',
        amount: 1,
        reward: { zmp: -3, unity: 2, momentum: 3 }
      },
      { 
        id: 'form_coalition', 
        name: 'Form Coalition',
        desc: 'Form a coalition with another party',
        target: 'coalition',
        amount: 1,
        reward: { zmp: -1, funds: 15, unity: 3 }
      },
      { 
        id: 'win_seats', 
        name: 'Win Seats',
        desc: 'Win 3 seats in next election',
        target: 'seats',
        amount: 3,
        reward: { zmp: -2, faculty: 3, momentum: 3 }
      },
      { 
        id: 'grow_strength', 
        name: 'Grow Strength',
        desc: 'Reach 15% support',
        target: 'strength',
        amount: 15,
        reward: { zmp: -3, funds: 15, volunteers: 5, unity: 2 }
      }
    ];
    
    var support = E.getPartySupport(st, partyId);
    var available = ambitions.filter(function(a) {
      if (a.id === 'absorb_party') {
        var active = activeParties(st);
        var smaller = active.some(function(p) {
          return p.id !== partyId && p.id !== 'ZMP' && p.id !== 'other' && 
                 E.getPartySupport(st, p.id) < support * 0.6;
        });
        return smaller;
      }
      if (a.id === 'form_coalition') {
        var active = activeParties(st);
        var other = active.some(function(p) {
          return p.id !== partyId && p.id !== 'ZMP' && p.id !== 'other';
        });
        return other;
      }
      if (a.id === 'win_seats') {
        return st.week > 10;
      }
      return true;
    });
    
    if (available.length === 0) {
      return ambitions[Math.floor(Math.random() * ambitions.length)];
    }
    
    return available[Math.floor(Math.random() * available.length)];
  }

  function activeParties(st) {
    if (!D || !D.PARTIES) return [];
    var result = [];
    for (var i = 0; i < D.PARTIES.length; i++) {
      var p = D.PARTIES[i];
      if (st.merged.indexOf(p.id) === -1 && st.raw[p.id]) {
        result.push(p);
      }
    }
    return result;
  }

  function renderAll() {
    if (st && st.finished && st.endingData) {
      playEndingMusic(st.endingData); // <-- Add this line
      renderMain();
      return;
    }
    renderMain();
    renderStatus();
    renderRight();
    renderLog();

    // Civil war overlay — lives outside #main so no CSS can hide it.
    injectCivilWarOverlay();

    saveAchievementsToDB(st);
    checkForBattle4Victory(st);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    var tabsContainer = document.querySelector('.tabs');
    if (tabsContainer) {
      if (!document.getElementById('tab-congress')) {
        var congressBtn = document.createElement('button');
        congressBtn.id = 'tab-congress';
        congressBtn.textContent = ' Congress';
        congressBtn.onclick = function() { 
          tab = 'congress';
          renderRight();
        };
        tabsContainer.appendChild(congressBtn);
      }
      
      if (!document.getElementById('tab-ambitions')) {
        var ambitionsBtn = document.createElement('button');
        ambitionsBtn.id = 'tab-ambitions';
        ambitionsBtn.textContent = ' Ambitions';
        ambitionsBtn.onclick = function() { 
          tab = 'ambitions';
          renderRight();
        };
        tabsContainer.appendChild(ambitionsBtn);
      }
      
      if (!document.getElementById('tab-news')) {
        var newsBtn = document.createElement('button');
        newsBtn.id = 'tab-news';
        newsBtn.textContent = '📰 News';
        newsBtn.onclick = function() { 
          tab = 'news';
          renderRight();
        };
        tabsContainer.appendChild(newsBtn);
      }

      if (!document.getElementById('tab-cells')) {
        var cellsBtn = document.createElement('button');
        cellsBtn.id = 'tab-cells';
        cellsBtn.textContent = '🗺️ Cells';
        cellsBtn.onclick = function() { 
          tab = 'cells';
          renderRight();
        };
        tabsContainer.appendChild(cellsBtn);
      }
    }
  }

  function renderRight() {
    var el = $('right-body');
    if (!el) return;

    ['poll', 'seats', 'hist', 'achievements', 'news', 'congress', 'ambitions', 'cells'].forEach(function(t) {
      var b = $('tab-' + t);
      if (b) {
        b.className = (t === tab ? 'on' : '');
      }
    });

    if (!st) {
      el.innerHTML = '<h2>Projected Influence</h2>' +
        '<div class="stat sub">No polling until a faction is chosen.</div>';
      return;
    }

    if (tab === 'news') {
      el.innerHTML = viewNewspaper();
      return;
    }
    
    if (tab === 'achievements') {
      el.innerHTML = viewAchievements();
      return;
    }
    
    if (tab === 'congress') {
      el.innerHTML = viewPartyCongress();
      return;
    }
    
    if (tab === 'ambitions') {
      el.innerHTML = viewPartyAmbitions();
      return;
    }

    if (tab === 'poll') {
      el.innerHTML = pollHTML();
      return;
    }

    // In renderRight function, replace the cells tab section:
    if (tab === 'cells') {
      el.innerHTML = viewCellHuntingMap();
      return;
}

    if (tab === 'seats') {
      el.innerHTML = '<h2>Projected Council</h2><svg id="seats-svg"></svg>' +
        '<div class="legend" id="seat-legend"></div>';
      setTimeout(function() { drawSeats(); }, 50);
      return;
    }

    el.innerHTML = '<h2>Support Trend</h2><svg id="hist-svg"></svg>' +
      '<div class="stat sub" style="margin-top:6px">Your coalition\'s share, week by week.</div>';
    setTimeout(function() { drawHistory(); }, 50);
  }

    function renderMain() {
    var m = $('main');
    if (!m) return;

    if (st && st.pendingAIRef && scene !== 'referendum_vote' && scene !== 'referendum_result') {
      scene = 'ai_referendum_prompt';
    }

    if (st && st.finished && st.endingData) {
      m.innerHTML = viewEnding(st.endingData);
      return;
    }

    if (scene === 'title')               { m.innerHTML = viewTitle(); return; }
    if (scene === 'briefing')            { m.innerHTML = viewBriefing(); return; }
    if (scene === 'ideology')            { m.innerHTML = viewIdeology(); return; }
    if (scene === 'week')                { m.innerHTML = viewWeek(); return; }
    if (scene === 'minister_decision')   { m.innerHTML = viewMinisterDecision(); return; }
    if (scene === 'minister_result')     { m.innerHTML = viewMinisterResult(); return; }
    if (scene === 'referendum')          { m.innerHTML = viewReferendums(); return; }
    if (scene === 'referendum_vote')     {
      m.innerHTML = viewReferendumVote();
      setTimeout(startReferendumAnimation, 80);
      return;
    }
    if (scene === 'referendum_result')   { m.innerHTML = viewReferendumResult(); return; }
        if (scene === 'field_day') {
      m.innerHTML = '<h2 class="scene-title">The Field Day Vote</h2>' +
                    '<p class="lead">The entire school is watching. The tug-of-war rope is pulled taut.</p>' +
                    '<canvas id="field-day-canvas" style="width:100%; height:400px; background:#1a1a1a; border:2px solid #333; border-radius:8px;"></canvas>' +
                    '<div class="btn-row" style="justify-content:center; margin-top:20px;">' +
                    '<button class="btn" style="font-size:1.2rem; padding:12px 40px;" onclick="UI.startFieldDayVote()">Cast the Vote</button></div>';
      setTimeout(startFieldDayAnimation, 50);
      return;
    }
    if (scene === 'event') { 
      m.innerHTML = viewEvent(); 
      
      // Check for BOTH parliamentary and presidential elections
      var isElectionEvent = st && st.pendingEvent && (
          st.pendingEvent.isElection || 
          (st.pendingEvent.id && st.pendingEvent.id.indexOf('presidential') !== -1)
      );
      
      // Only trigger the animation if this is an election AND we haven't animated yet
      if (isElectionEvent && !st.pendingEvent.hasAnimated) {
        setTimeout(startElectionAnimation, 80);
      }
      return; 
    }

    if (scene === 'election')            { m.innerHTML = viewElectionResults(); return; }
    if (scene === 'coalition')           { m.innerHTML = viewCoalitionFormation(); return; }
    if (scene === 'end')                 { m.innerHTML = viewEnd(); return; }
    if (scene === 'cabinet')             { m.innerHTML = viewCabinet(); return; }
    if (scene === 'advisors')            { m.innerHTML = viewAdvisors(); return; }
    if (scene === 'ministry')            { m.innerHTML = viewMinistry(); return; }
    if (scene === 'achievements')        { m.innerHTML = viewAchievementsPage(); return; }
    if (scene === 'minister_selection')  { m.innerHTML = viewMinisterSelection(); return; }
    if (scene === 'presidential_card')   { m.innerHTML = viewPresidentialCards(); return; }
    if (scene === 'putsch')              { m.innerHTML = viewPutsch(); attachPutschHandlers(); return; }
    if (scene === 'cells')               { m.innerHTML = viewCellHuntingMap(); return; }
    // In renderMain, add:
    if (scene === 'constitutional_convention') { m.innerHTML = viewConstitutionalConvention(); return; }
    if (scene === 'white_league')             { m.innerHTML = viewWhiteLeague(); return; }
    if (scene === 'ai_referendum_prompt') { m.innerHTML = viewAIRefPrompt(); return; }

    // ---- Zalgrilianist Kapp-style standoff (defined in zalgrilia.js) ----
    if (scene === 'king') {
      if (typeof UI.viewKing === 'function') {
        m.innerHTML = UI.viewKing();
      } else {
        m.innerHTML = '<h2 class="scene-title">Error</h2>' +
          '<p>The King Minigame module failed to load.</p>' +
          '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
      }
      return;
    }

    m.innerHTML = '';

    colorizePartiesInDOM();
  }

  function renderStatus() {
    var el = $('status');
    if (!el) return;

    if (!st) {
      el.innerHTML = '<div class="stat sub">No campaign running. Choose a faction to begin.</div>';
      return;
    }
    
    var f = faction(st.faction);
    var mom = st.momentum > 0 ? '+' + st.momentum : String(st.momentum);
    var year = Math.ceil(st.week / 52);
    var yearLabel = year === 1 ? 'Year 1' : 'Year 2';
    
        var fForElection = faction(st.faction);
    var nextElection = 'None';
    if (fForElection && fForElection.canParticipateInElections === false) {
      nextElection = '-- (No elections)';
    } else {
      for (var i = 0; i < st.electionWeeks.length; i++) {
        if (st.electionWeeks[i] > st.week) {
          nextElection = 'Week ' + st.electionWeeks[i];
          break;
        }
      }
      if (st.week >= st.electionWeeks[st.electionWeeks.length - 1]) {
        nextElection = 'Final';
      }
    }

    var coalitionStatus = 'None';
    if (st.coalitionPartners && st.coalitionPartners.length > 0) {
      var names = st.coalitionPartners.map(function(pid) {
        var p = party(pid);
        return p ? p.short : pid;
      }).join(' + ');
      var seats = st.seats[E.getPlayerPartyId(st)] || 0;
      st.coalitionPartners.forEach(function(pid) {
        seats += st.seats[pid] || 0;
      });
      coalitionStatus = names + ' (' + seats + '/' + D.SEATS + ' seats)';
    }
    if (st.alternativeCoalition) {
      coalitionStatus += ' | ALT: ' + st.alternativeCoalition.name;
    }

    var elHtml = '' +
      '<div class="stat"><span>Year</span><span class="v">' + yearLabel + '</span></div>' +
      '<div class="stat"><span>Week</span><span class="v">' + st.week + ' / ' + D.WEEKS + '</span></div>' +
      '<div class="stat"><span>Next Election</span><span class="v">' + nextElection + '</span></div>' +
      '<div class="stat"><span>Action points</span><span class="v">' + st.ap + '</span></div>' +
      '<div class="stat"><span>Funds</span><span class="v">$' + st.funds + '</span></div>' +
      '<div class="stat"><span>Volunteers</span><span class="v">' + st.volunteers + '</span></div>' +
      '<div class="stat"><span>Momentum</span><span class="v">' + mom + '</span></div>' +
      '<h3>Faction</h3>' +
      '<div class="stat sub"><span>' + (f ? esc(f.name) : 'Unknown') + '</span></div>' +
      '<h3>Coalition</h3>' +
      '<div class="stat sub"><span>' + coalitionStatus + '</span></div>' +
      '<div class="stat sub"><span>Stability</span><span class="v">' + Math.round(st.coalitionStability || 80) + '%</span></div>' +
      '<h3>Party unity</h3>' + meter(st.unity, 100, true) +
      '<div class="stat sub"><span>' + Math.round(st.unity) + ' / 100</span><span>' +
      (st.unity < 40 ? 'bleeding support' : (st.unity > 70 ? 'extra AP' : 'holding')) + '</span></div>' +
      '<h3>Faculty tolerance</h3>' + meter(st.faculty, 100, true) +
      '<div class="stat sub"><span>' + Math.round(st.faculty) + ' / 100</span><span>' +
      (st.faculty < 25 ? 'restricted' : 'tolerated') + '</span></div>' +
      '<h3>Platform</h3>' +
      '<div class="stat sub"><span>Spirit maximalism</span><span class="v">' + st.spirit + '/10</span></div>' +
      '<div class="stat sub"><span>Gate closure</span><span class="v">' + st.gates + '/10</span></div>';
    
    if (st.redLeader) {
      var leaderLabel = st.redLeader === 'friendly' ? ' Friendly' : 
                         st.redLeader === 'independent' ? '⚖️ Independent' : ' Hostile';
      elHtml += '<h3>Red Front</h3>' +
        '<div class="stat sub"><span>Leadership</span><span class="v">' + leaderLabel + '</span></div>';
    }
    
    if (st.tiiaExists) {
      elHtml += '<h3>TIIA</h3>' +
        '<div class="stat sub"><span>Status</span><span class="v">Active</span></div>';
    }
    
    if (D.ADVISORS) {
      elHtml += '<h3>Advisors</h3>';
      D.ADVISORS.forEach(function(adv) {
        var nameHtml = esc(adv.name);
        if (window.Hover && window.Hover.wrapAdvisor) {
          nameHtml = window.Hover.wrapAdvisor(adv.id, nameHtml);
        }
        elHtml += '<div class="stat sub"><span>' + nameHtml +
          '</span><span class="v">' + esc(adv.role) + '</span></div>';
        // Trait chips
        if (adv.traits && adv.traits.length) {
          elHtml += '<div style="margin:2px 0 6px 0;">';
          adv.traits.forEach(function (tid) {
            var tr = D.TRAITS && D.TRAITS[tid];
            if (!tr) return;
            elHtml += '<span data-hover="trait" data-trait="' + tid +
              '" style="display:inline-block;padding:1px 6px;margin-right:3px;' +
              'background:rgba(200,168,96,0.15);border:1px solid rgba(200,168,96,0.4);' +
              'border-radius:3px;font-size:0.7rem;color:#c8a860;cursor:help;">' +
              (tr.icon || '') + ' ' + esc(tr.name) + '</span>';
          });
          elHtml += '</div>';
        } else {
          elHtml += '<div class="stat sub" style="font-size:0.75rem;color:#888;' +
            'margin:-4px 0 4px 0;">' + esc(adv.desc) + '</div>';
        }
      });
    }

    if (st.relations) {
      elHtml += '<h3>Relations</h3>';
      var sortedPids = Object.keys(st.relations).sort(function(a, b) {
        return (st.relations[b] || 0) - (st.relations[a] || 0);
      });
      sortedPids.forEach(function(pid) {
        if (pid === 'bl' || st.merged.indexOf(pid) !== -1) return;
        var val = st.relations[pid] || 50;
        var p = party(pid);
        var color = p ? p.color : '#999';
        elHtml += '<div class="stat sub"><span style="color:' + color + ';">' + (p ? esc(p.short) : pid) + '</span>' +
          '<span class="v">' +  ' ' + Math.round(val) + '%</span></div>';
      });
    }

    if (st.paramilitaries) {
      elHtml += '<h3> Paramilitary Forces</h3>';
      
      var zmpForces = [];
      var otherForces = [];
      
      for (var key in st.paramilitaries) {
        var force = st.paramilitaries[key];
        if (force.faction === 'ZMP' || force.faction === 'zmp') {
          zmpForces.push(force);
        } else {
          otherForces.push(force);
        }
      }
      
      zmpForces.forEach(function(force) {
        var strength = E.calculateParamilitaryStrength(force);
        var color = force.isElite ? '#ffd700' : '#5fae3c';
        elHtml += '<div class="stat sub" style="border-left:3px solid ' + color + ';padding-left:8px;">';
        elHtml += '<span>' + force.icon + ' ' + force.short + '</span>';
        elHtml += '<span class="v">' + force.members + ' ' + strength + '</span>';
        elHtml += '</div>';
        elHtml += '<div style="font-size:0.7rem;color:#888;margin:-4px 0 4px 8px;">';
        elHtml += 'Train: ' + force.training + '/10 | Equip: ' + force.equipment + '/10 | Morale: ' + force.morale + '%';
        elHtml += '</div>';
      });
      
      var alliedForces = ['wein_workers', 'iia_guard', 'zpf_defenders'];
      var showAllies = st.paramilitaries.wein_workers || st.paramilitaries.iia_guard;
      
      if (showAllies) {
        elHtml += '<div style="font-size:0.7rem;color:#666;margin-top:2px;">Allied Forces:</div>';
        alliedForces.forEach(function(key) {
          if (st.paramilitaries[key]) {
            var force = st.paramilitaries[key];
            var isAlly = force.faction === 'wein' ? st.hasArbeiterAlly : true;
            if (isAlly) {
              var strength = E.calculateParamilitaryStrength(force);
              var color = force.isForeign ? '#ff6b6b' : '#888';
              elHtml += '<div class="stat sub" style="border-left:2px solid ' + color + ';padding-left:6px;font-size:0.8rem;">';
              elHtml += '<span>' + force.icon + ' ' + force.short + '</span>';
              elHtml += '<span class="v">' + force.members + ' ' + strength + '</span>';
              elHtml += '</div>';
            }
          }
        });
      }
      
      elHtml += '<div style="font-size:0.7rem;color:#666;margin-top:2px;">Enemy Forces:</div>';
      var enemyKeys = ['black_legion'];
      if (st.affinity.red < 30) enemyKeys.push('red_militia');
      
      enemyKeys.forEach(function(key) {
        if (st.paramilitaries[key]) {
          var force = st.paramilitaries[key];
          var strength = E.calculateParamilitaryStrength(force);
          elHtml += '<div class="stat sub" style="border-left:2px solid #cc0000;padding-left:6px;font-size:0.8rem;">';
          elHtml += '<span>' + force.icon + ' ' + force.short + '</span>';
          elHtml += '<span class="v" style="color:#cc0000;">' + force.members + ' ' + strength + '</span>';
          elHtml += '</div>';
        }
      });
    }

    elHtml += '<hr class="rule">';
    elHtml += '<h3>💾 Save / Load</h3>';
    
    var autoData = getSaveInfo('auto');
    var autoLabel = autoData ? 'Week ' + autoData.week + ' (' + autoData.date + ')' : 'Empty';
    
    elHtml += '<div class="stat sub" style="display:flex;justify-content:space-between;align-items:center;">';
    elHtml += '<span>🔄 Auto-save</span>';
    elHtml += '<span style="font-size:0.75rem;color:#888;">' + autoLabel + '</span>';
    elHtml += '</div>';
    
    var slot1Data = getSaveInfo('slot1');
    var slot1Label = slot1Data ? 'Week ' + slot1Data.week + ' (' + slot1Data.date + ')' : 'Empty';
    elHtml += '<div class="stat sub" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
    elHtml += '<span>💾 Slot 1</span>';
    elHtml += '<span style="font-size:0.75rem;color:#888;">' + slot1Label + '</span>';
    elHtml += '<div style="display:flex;gap:4px;">';
    if (st) {
      elHtml += '<button class="chip" onclick="UI.saveGame(\'slot1\')" style="font-size:0.7rem;background:#5fae3c;">Save</button>';
    }
    if (slot1Data) {
      elHtml += '<button class="chip" onclick="UI.loadGame(\'slot1\')" style="font-size:0.7rem;">Load</button>';
      elHtml += '<button class="chip" onclick="UI.deleteSave(\'slot1\')" style="font-size:0.7rem;background:#cc0000;">X</button>';
    }
    elHtml += '</div></div>';
    
    var slot2Data = getSaveInfo('slot2');
    var slot2Label = slot2Data ? 'Week ' + slot2Data.week + ' (' + slot2Data.date + ')' : 'Empty';
    elHtml += '<div class="stat sub" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
    elHtml += '<span>💾 Slot 2</span>';
    elHtml += '<span style="font-size:0.75rem;color:#888;">' + slot2Label + '</span>';
    elHtml += '<div style="display:flex;gap:4px;">';
    if (st) {
      elHtml += '<button class="chip" onclick="UI.saveGame(\'slot2\')" style="font-size:0.7rem;background:#5fae3c;">Save</button>';
    }
    if (slot2Data) {
      elHtml += '<button class="chip" onclick="UI.loadGame(\'slot2\')" style="font-size:0.7rem;">Load</button>';
      elHtml += '<button class="chip" onclick="UI.deleteSave(\'slot2\')" style="font-size:0.7rem;background:#cc0000;">X</button>';
    }
    elHtml += '</div></div>';
    
    var slot3Data = getSaveInfo('slot3');
    var slot3Label = slot3Data ? 'Week ' + slot3Data.week + ' (' + slot3Data.date + ')' : 'Empty';
    elHtml += '<div class="stat sub" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
    elHtml += '<span>💾 Slot 3</span>';
    elHtml += '<span style="font-size:0.75rem;color:#888;">' + slot3Label + '</span>';
    elHtml += '<div style="display:flex;gap:4px;">';
    if (st) {
      elHtml += '<button class="chip" onclick="UI.saveGame(\'slot3\')" style="font-size:0.7rem;background:#5fae3c;">Save</button>';
    }
    if (slot3Data) {
      elHtml += '<button class="chip" onclick="UI.loadGame(\'slot3\')" style="font-size:0.7rem;">Load</button>';
      elHtml += '<button class="chip" onclick="UI.deleteSave(\'slot3\')" style="font-size:0.7rem;background:#cc0000;">X</button>';
    }
    elHtml += '</div></div>';

    el.innerHTML = elHtml;
  }

  function renderLog() {
    var el = $('log');
    if (!el) return;

    if (!st || !st.log.length) {
      el.innerHTML = '<div>Nothing yet.</div>';
      return;
    }
    el.innerHTML = st.log.slice(-40).reverse().map(function (l) {
      return '<div>' + esc(l) + '</div>';
    }).join('');
  }

  function meter(val, max, invertWarn) {
    var pct = Math.max(0, Math.min(100, (val / max) * 100));
    var cls = '';
    if (invertWarn) {
      if (pct < 25) { cls = ' bad'; }
      else if (pct < 45) { cls = ' warn'; }
    }
    return '<div class="meter' + cls + '"><i style="width:' + pct + '%"></i></div>';
  }

  function viewTitle() {
    return '' +
      '<h2 class="scene-title">Class Council</h2>' +
      '<p class="lead">The ZMP has run this school for two years on a promise nobody has ever written down.</p>' +
      '<p>In nine weeks the whole school votes. ' + D.SEATS + ' seats on the council. ' + D.MAJORITY + ' for control. ' +
      'Your coalition is a big tent held up by four poles that hate each other, and the first ' +
      'thing you must decide is which of them holds the middle.</p>' +
      '<p class="quiet">Every week you spend action points, funds and volunteers on the student body. ' +
      'Every week something happens that you did not plan for. Watch the influence panel — ' +
      'that is the only thing that counts.</p>' +
      '<hr class="rule">' +
      '<div class="btn-row">' +
      '<button class="btn" onclick="UI.go(\'ideology\')">Begin the campaign</button>' +
      '<button class="btn alt" onclick="UI.showBriefing()">Read the briefing</button>' +
      '</div>';
  }

  function viewBriefing() {
    var rows = D.DEMOS.map(function (d) {
      return '<div class="stat"><span>' + esc(d.name) + ' <span class="quiet">' +
        Math.round(d.weight * 100) + '% of school</span></span></div>' +
        '<div class="stat sub" style="margin-bottom:6px">' + esc(d.blurb) + '</div>';
    }).join('');

    var plist = D.PARTIES.filter(function (p) { return !p.player && p.id !== 'other' && p.id !== 'tiia'; })
      .map(function (p) {
        return '<div class="poll-row"><span class="swatch" style="background:' + p.color +
          '"></span><span class="nm">' + esc(p.short) + '</span></div>' +
          '<div class="stat sub" style="margin:0 0 6px 21px">' + esc(p.blurb) + '</div>';
      }).join('');

    return '' +
      '<h2 class="scene-title">Briefing</h2>' +
      '<p><b>Goal.</b> Win ' + D.MAJORITY + ' of ' + D.SEATS + ' council seats, alone or in coalition, after ' + D.WEEKS + ' weeks of campaigning.</p>' +
      '<p><b>Seats.</b> Allocated by Sainte-Laguë across every party clearing a ' + D.THRESHOLD + '% threshold.</p>' +
      '<p><b>Elections.</b> Held every 16 weeks starting at week 9.</p>' +
      '<p><b>Coalitions.</b> After each election, you can form one of several pre-defined coalitions:</p>' +
      '<ul style="margin-left:20px;margin-bottom:12px;">' +
      '<li><b>Zalgrilian Front:</b> ZMP + SEMP (Spirit alliance)</li>' +
      '<li><b>Left Block:</b> ZMP + SEMP + ZPF (Centre-left coalition)</li>' +
      '<li><b>RGB Alliance:</b> ZMP + IIA + RED (Tech-left coalition)</li>' +
      '<li><b>Grand Coalition:</b> ZMP + ZPF + IIA (Broad moderate alliance)</li>' +
      '<li><b>Black-Red Alliance:</b> ZMP + RED + BL (Radical coalition - risky)</li>' +
      '</ul>' +
      '<p><b>Watch four numbers:</b> <i>Unity</i> — below 40 your own support bleeds. ' +
      '<i>Faculty tolerance</i> — below 25 you lose an action point. <i>Momentum</i> — multiplies ' +
      'everything you do. <i>Funds</i> — rallies and flyers are not free.</p>' +
      '<hr class="rule">' +
      '<h3>The student body</h3>' + rows +
      '<hr class="rule">' +
      '<h3>The other parties</h3>' + plist +
      '<div class="btn-row"><button class="btn" onclick="UI.backFromBriefing()">Back</button></div>';
  }

  function viewIdeology() {
    var items = D.FACTIONS.map(function (f) {
      return '<li class="' + f.tint + '" onclick="UI.pickFaction(\'' + f.id + '\')">' +
        '<span class="num">' + f.n + '.</span>' +
        '<span class="txt">' + esc(f.line) +
        '<small>' + esc(f.desc) + '</small></span></li>';
    }).join('');

    return '' +
      '<h2 class="scene-title">Questions of Ideology</h2>' +
      '<p class="lead">The <b style="color:#5fae3c">ZMP</b> encompasses a lot of internal ' +
      'factions and it is up to us to decide the faction that represents us in class council.</p>' +
      '<ol class="ideology">' + items + '</ol>' +
      '<p class="quiet" style="margin-top:10px">This sets your starting support, your unity, ' +
      'and which rivals will take your calls.</p>';
  }

    function viewWeek() {
    if (st.flags && st.flags.wlFormed && !st.flags.wlResolved &&
        window.WhiteLeague && window.WhiteLeague.checkPostBlWeakness(st)) {
      var mwl = $('main');
      if (mwl) {
        var wlHtml = '<h2 class="scene-title">The White League — After the Black League</h2>';
        wlHtml += '<p class="lead">The Black League is finished. The League that was formed to fight it has no enemy left. The IIA has asked the leadership what comes next.</p>';
        wlHtml += '<div class="result-box" style="border:2px solid #ffffff;padding:14px;">';
        wlHtml += '<h3>The two paths</h3>';
        wlHtml += '<p><b>Dissolve:</b> The White League splits back into the ZMP and the IIA. Both parties return to the council separately.</p>';
        wlHtml += '<p><b>Dictatorship:</b> The White League declares itself the permanent government of the school. No elections. No opposition.</p>';
        wlHtml += '</div>';
        wlHtml += '<div class="btn-row">';
        wlHtml += '<button class="btn" onclick="UI._wlDissolveBack()">Dissolve the League</button>';
        wlHtml += '<button class="btn alt" onclick="UI._wlDictatorship()">Declare Dictatorship</button>';
        wlHtml += '</div>';
        mwl.innerHTML = wlHtml;
      }
      return '';
    }

    if (window.CivilWar && window.CivilWar.isActive(st)) {
      // Events still fire during the war. Hand the panel to the event
      // view until the player resolves them.
      if (st.pendingEvent) {
        scene = 'event';
        renderAll();
        return '';
      }
      // The map itself. The action overlay is appended separately by
      // renderAll (see the fixed-position overlay at the bottom).
      var m = $('main');
      if (m) {
        m.innerHTML = window.CivilWar.render(st);
      }
      return '';
    }
    var inGovernment = false;
    var totalSeats = st.seats.ZMP || 0;
    if (st.coalitionPartners) {
      st.coalitionPartners.forEach(function(pid) {
        totalSeats += st.seats[pid] || 0;
      });
    }
    if (totalSeats >= D.MAJORITY) {
      inGovernment = true;
    }

    var inCrisis = E.isBlackLeagueCrisis ? E.isBlackLeagueCrisis(st) : false;

    var factionData = faction(st.faction);
    var isJihadist = factionData && factionData.id === 'jihadists';
    var isMilitaryMode = isJihadist;

    // ---- Campaign action grid (hidden for Jihadists) ----
    var acts = '';
    if (!isMilitaryMode) {
      acts = D.ACTIONS.map(function (a) {
        var bad = st.ap < a.ap || st.funds < a.budget || st.volunteers < a.vol;
        var cost = [];
        cost.push(a.ap + ' AP');
        if (a.budget) { cost.push('$' + a.budget); }
        if (a.vol) { cost.push(a.vol + ' vol'); }
        return '<button class="act" ' + (bad ? 'disabled' : '') +
          ' onclick="UI.chooseAction(\'' + a.id + '\')">' +
          '<b>' + esc(a.name) + '</b>' +
          '<span class="cost">' + cost.join(' / ') + '</span>' +
          '<span class="d">' + esc(a.desc) + '</span></button>';
      }).join('');
    }

    var canLaunchKingPutsch =
      !isMilitaryMode &&
      factionData && factionData.id === 'zalgrilian' &&
      st.king && st.king.active !== true &&   // hasn't already started
      E.getPartySupport(st, 'ZMP') > 40 &&
      st.funds > 300;

    // ---- Jihadist military command panel ----
    var militaryPanel = '';
    if (isMilitaryMode) {
      if (!st.paramilitaries && E.initParamilitaries) {
        E.initParamilitaries(st);
      }
      var p = st.paramilitaries || {};
      var dz = p.dzehurjaca || {
        members: 0, training: 0, equipment: 0, morale: 0, loyalty: 0,
        name: 'Dzehurjaca Legion', short: 'Dzehurjaca', icon: ''
      };

      var dzStrength = E.calculateParamilitaryStrength(dz);

          // Zalgrilianist putsch launch conditions
    

      var enemyKeys = ['black_legion', 'iia_guard', 'red_militia', 'pl_pep', 'sportica_athletes', 'republia_guard', 'semp_spirit', 'zpf_defenders'];
      var enemyTotal = 0;
      var enemyBreakdown = [];
      enemyKeys.forEach(function(k) {
        if (p[k] && !p[k].destroyed) {
          var s = E.calculateParamilitaryStrength(p[k]);
          enemyTotal += s;
          enemyBreakdown.push({ key: k, name: p[k].short, strength: s });
        }
      });
      enemyBreakdown.sort(function(a, b) { return b.strength - a.strength; });

      var weinStrength = 0;
      if (st.hasArbeiterAlly && p.wein_workers) {
        weinStrength = Math.floor(E.calculateParamilitaryStrength(p.wein_workers) * 0.3);
      }

      var ourTotal = dzStrength + weinStrength;
      var ratio = enemyTotal > 0 ? ourTotal / enemyTotal : 99;
      var ratioPct = Math.min(100, (ourTotal / (ourTotal + enemyTotal)) * 100);
      var ratioColor = ratio >= 1 ? '#5fae3c' : (ratio >= 0.7 ? '#ffcc00' : '#cc0000');

      militaryPanel += '<div class="result-box" style="border:3px solid #cc0000;background:rgba(60,0,0,0.15);padding:15px;margin:15px 0;">';
      militaryPanel += '<h3 style="color:#ff6b6b;">MILITARY COMMAND - DZEHURJACA LEGION</h3>';
      militaryPanel += '<p style="font-size:0.85rem;color:#aaa;">The Jihadist faction does not campaign. It drills. It arms. It waits for the moment to strike.</p>';

      militaryPanel += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0;">';
      militaryPanel += '<div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:4px;border-left:3px solid #5fae3c;">';
      militaryPanel += '<div style="font-weight:bold;color:#5fae3c;">Dzehurjaca Legion</div>';
      militaryPanel += '<div style="font-size:0.85rem;">Members: <b>' + (dz.members || 0) + '</b></div>';
      militaryPanel += '<div style="font-size:0.85rem;">Training: <b>' + (dz.training || 0) + '/10</b></div>';
      militaryPanel += '<div style="font-size:0.85rem;">Equipment: <b>' + (dz.equipment || 0) + '/10</b></div>';
      militaryPanel += '<div style="font-size:0.85rem;">Morale: <b>' + (dz.morale || 0) + '%</b></div>';
      militaryPanel += '<div style="font-size:1.1rem;margin-top:6px;">Strength: <b style="color:#ffd700;">' + dzStrength + '</b></div>';
      militaryPanel += '</div>';

      militaryPanel += '<div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:4px;border-left:3px solid #cc0000;">';
      militaryPanel += '<div style="font-weight:bold;color:#cc0000;">Enemy Coalition</div>';
      militaryPanel += '<div style="font-size:1.1rem;margin-top:6px;">Total: <b style="color:#ff6b6b;">' + enemyTotal + '</b></div>';
      militaryPanel += '<div style="font-size:0.75rem;color:#888;margin-top:4px;">' + enemyBreakdown.slice(0, 4).map(function(e) { return e.name + ': ' + e.strength; }).join('<br>') + '</div>';
      if (weinStrength > 0) {
        militaryPanel += '<div style="font-size:0.85rem;color:#66aaff;margin-top:6px;">Wein Ally: +' + weinStrength + '</div>';
      }
      militaryPanel += '</div>';
      militaryPanel += '</div>';

      militaryPanel += '<div style="margin:10px 0;">';
      militaryPanel += '<div style="display:flex;justify-content:space-between;font-size:0.85rem;">';
      militaryPanel += '<span>Our Forces: <b style="color:#5fae3c;">' + ourTotal + '</b></span>';
      militaryPanel += '<span>Ratio: <b style="color:' + ratioColor + ';">' + ratio.toFixed(2) + 'x</b></span>';
      militaryPanel += '<span>Enemy: <b style="color:#cc0000;">' + enemyTotal + '</b></span>';
      militaryPanel += '</div>';
      militaryPanel += '<div class="meter" style="height:10px;margin-top:4px;"><i style="width:' + ratioPct + '%;background:' + ratioColor + ';"></i></div>';
      militaryPanel += '</div>';

      militaryPanel += '<h4 style="margin-top:15px;">Military Operations</h4>';
      militaryPanel += '<div class="act-grid">';

      var milActions = [
        { id: 'train_militia',   ap: 2, budget: 15, vol: 2, name: 'Train Legion',     desc: 'Increase Dzehurjaca training by 1.' },
        { id: 'equip_militia',   ap: 2, budget: 20, vol: 1, name: 'Equip Legion',     desc: 'Increase Dzehurjaca equipment by 1.' },
        { id: 'recruit_militia', ap: 1, budget: 8,  vol: 2, name: 'Recruit Fighters', desc: 'Add new members to the Legion.' },
        { id: 'rally_militia',   ap: 1, budget: 5,  vol: 3, name: 'Rally the Legion', desc: 'Boost Dzehurjaca morale.' }
      ];

      milActions.forEach(function(a) {
        var bad = st.ap < a.ap || st.funds < a.budget || st.volunteers < a.vol;
        var cost = [a.ap + ' AP'];
        if (a.budget) { cost.push('$' + a.budget); }
        if (a.vol) { cost.push(a.vol + ' vol'); }
        militaryPanel += '<button class="act" ' + (bad ? 'disabled' : '') + ' onclick="UI.runMilitaryAction(\'' + a.id + '\')">';
        militaryPanel += '<b>' + a.name + '</b>';
        militaryPanel += '<span class="cost">' + cost.join(' / ') + '</span>';
        militaryPanel += '<span class="d">' + a.desc + '</span>';
        militaryPanel += '</button>';
      });

      militaryPanel += '<button class="act" ' + (st.ap < 1 || st.funds < 5 ? 'disabled' : '') + ' onclick="UI.runMilitaryAction(\'relations_wein\')">';
      militaryPanel += '<b>Diplomatic Envoy to Wein</b>';
      militaryPanel += '<span class="cost">1 AP / $5</span>';
      militaryPanel += '<span class="d">Improve relations with Arbeiter von Wein. They can join the putsch.</span>';
      militaryPanel += '</button>';

      militaryPanel += '</div>';

      militaryPanel += '<div style="margin-top:20px;padding:15px;border:2px solid ' + (ratio >= 1 && st.week >= 15 ? '#5fae3c' : '#333') + ';border-radius:6px;background:' + (ratio >= 1 && st.week >= 15 ? 'rgba(95,174,60,0.1)' : 'rgba(0,0,0,0.2)') + ';">';
      militaryPanel += '<h3 style="color:' + (ratio >= 1 && st.week >= 15 ? '#5fae3c' : '#888') + ';">THE PUTSCH</h3>';
      if (st.week < 15) {
        militaryPanel += '<p style="color:#888;">The Legion is not yet ready. Wait until <b>Week 15</b> before attempting the coup. Current week: ' + st.week + '.</p>';
      } else if (ratio < 1) {
        militaryPanel += '<p style="color:#cc0000;">Your forces are not yet strong enough. You need <b>' + Math.ceil(enemyTotal - ourTotal) + ' more strength</b> to have a chance.</p>';
        militaryPanel += '<p style="font-size:0.85rem;color:#888;">Train, equip, recruit, and rally the Dzehurjaca Legion. Secure the Wein Alliance for a decisive boost.</p>';
      } else {
        militaryPanel += '<p style="color:#5fae3c;font-weight:bold;">The Legion outmatches the enemy coalition. The moment has come.</p>';
        militaryPanel += '<p style="font-size:0.85rem;color:#aaa;">Launching the Putsch begins a tactical battle for control of the school. <b>There is no retreat. Victory or death.</b></p>';
        militaryPanel += '<div class="btn-row"><button class="btn" onclick="UI.launchPutsch()" style="background:#cc0000;border-color:#ff0000;font-size:1.2rem;padding:14px 40px;">LAUNCH THE PUTSCH</button></div>';
      }
      militaryPanel += '</div>';
      militaryPanel += '</div>';
    }

    // ---- Zalgrilianist Kapp-style standoff panel ----
    // Shows only when st.king.active has been set by the Marshal's escalation.
        // ---- Zalgrilianist Kapp-style standoff panel ----
    // Two states:
    //   (a) the standoff is ALREADY active  -> "Open the Parking Lot"
    //   (b) it is NOT active but conditions met -> "Launch the King Putsch"
    var kingPanel = '';
    if (!isMilitaryMode && factionData && factionData.id === 'zalgrilian') {

      // (a) Standoff already launched
      if (typeof UI.canStartKingMinigame === 'function' && UI.canStartKingMinigame()) {
        kingPanel =
          '<div class="result-box" style="border:3px solid #ffd700;' +
          'background:rgba(255,215,0,0.08);margin:15px 0;padding:15px;">' +
          '<h3 style="color:#ffd700;">THE PARKING LOT</h3>' +
          '<p style="font-size:0.9rem;color:#ddd;">The Legion has occupied the Council Chamber. ' +
          'A crowd is forming on the asphalt. This will not be settled by a battle — ' +
          'it will be settled by whether the Legion holds, and whether the crowd goes home.</p>' +
          '<div class="btn-row">' +
          '<button class="btn" onclick="UI.startKingMinigame()" ' +
          'style="background:#5fae3c;border-color:#3a7a1a;font-size:1.1rem;padding:12px 30px;">' +
          'Open the Parking Lot</button>' +
          '</div>' +
          '</div>';
      }

      // (b) Not yet launched, but conditions met
      else if (canLaunchKingPutsch) {
        var zmpSup = Math.round(E.getPartySupport(st, 'ZMP'));
        kingPanel =
          '<div class="result-box" style="border:3px solid #ffd700;' +
          'background:rgba(255,215,0,0.08);margin:15px 0;padding:15px;">' +
          '<h3 style="color:#ffd700;">THE KING PUTSCH</h3>' +
          '<p style="font-size:0.9rem;color:#ddd;">' +
          'The ZMP is strong enough (<b>' + zmpSup + '%</b> support) and the party ' +
          'has the funds (<b>$' + st.funds + '</b>) to attempt a restoration. ' +
          'The Legion will occupy the Council Chamber at dawn. ' +
          'The streets will decide what happens next — not the Legion alone.</p>' +
          '<p style="font-size:0.85rem;color:#aaa;">' +
          'This is a Kapp-style putsch: a political-military standoff, not a battle. ' +
          'You will not fight. You will hold the building and see whether the crowd ' +
          'disperses — or whether the Legion refuses to fire on it.</p>' +
          '<div class="btn-row">' +
          '<button class="btn" onclick="UI.launchKingPutsch()" ' +
          'style="background:#cc0000;border-color:#ff0000;font-size:1.15rem;padding:12px 32px;">' +
          'Launch the King Putsch</button>' +
          '</div>' +
          '</div>';
      }

      // (c) Not yet launched, but conditions NOT met — show progress
      else {
        var zmpSup2 = Math.round(E.getPartySupport(st, 'ZMP'));
        var supOk = zmpSup2 > 40;
        var fundOk = st.funds > 300;

        kingPanel =
          '<div class="result-box" style="border:2px solid #444;' +
          'background:rgba(0,0,0,0.2);margin:15px 0;padding:15px;">' +
          '<h3 style="color:#888;">THE KING PUTSCH — not yet ready</h3>' +
          '<p style="font-size:0.85rem;color:#aaa;">' +
          'The Legion will only move when the party can hold the school afterwards.</p>' +
          '<div style="display:flex;justify-content:space-between;font-size:0.85rem;margin:6px 0;">' +
          '<span>ZMP support: <b style="color:' + (supOk ? '#5fae3c' : '#cc0000') + ';">' +
          zmpSup2 + '%</b> / 40%</span>' +
          '<span>Funds: <b style="color:' + (fundOk ? '#5fae3c' : '#cc0000') + ';">$' +
          st.funds + '</b> / $300</span>' +
          '</div>' +
          '</div>';
      }
    }

    // ---- SECURRO SIEGE panel ----
    var securroSiegePanel = '';
    if (factionData && factionData.id === 'securro' &&
        typeof UI.canStartSecurroSiege === 'function' && UI.canStartSecurroSiege()) {
      securroSiegePanel =
        '<div class="result-box" style="border:3px solid #ffcc00;' +
        'background:rgba(255,204,0,0.08);margin:15px 0;padding:15px;">' +
        '<h3 style="color:#ffcc00;">THE SIEGE OF THE COUNCIL CHAMBER</h3>' +
        '<p style="font-size:0.9rem;color:#ddd;">The parliament will never vote for the ' +
        'Enabling Act. The Legion surrounds the council. The council has not dispersed. ' +
        'Win before the Legion breaks, the faculty calls out, or ten weeks expire.</p>' +
        '<div class="btn-row">' +
        '<button class="btn" onclick="UI.startSecurroSiege()" ' +
        'style="background:#cc9900;border-color:#ffcc00;font-size:1.1rem;padding:12px 30px;">' +
        'Begin the Siege</button>' +
        '</div></div>';
    }

    // ---- SECULARIST REFERENDUM panel ----
    var secularistRefPanel = '';
    if (factionData && factionData.id === 'secularists' &&
        typeof UI.canStartSecularistReferendum === 'function' &&
        UI.canStartSecularistReferendum()) {
      secularistRefPanel =
        '<div class="result-box" style="border:3px solid #7fdcff;' +
        'background:rgba(127,220,255,0.08);margin:15px 0;padding:15px;">' +
        '<h3 style="color:#7fdcff;">THE REFERENDUM</h3>' +
        '<p style="font-size:0.9rem;color:#ddd;">The IIA has proposed a charter. The ZPF ' +
        'has proposed a rival. You have ten weeks to win a majority without losing ' +
        'your principles.</p>' +
        '<div class="btn-row">' +
        '<button class="btn" onclick="UI.startSecularistReferendum()" ' +
        'style="background:#2a6080;border-color:#7fdcff;font-size:1.1rem;padding:12px 30px;">' +
        'Open the Campaign</button>' +
        '</div></div>';
    }
    

    // ---- Government actions (hidden for Jihadists) ----
    var govActs = '';
    if (!isMilitaryMode && inGovernment && D.GOV_ACTIONS) {
      govActs = '<hr class="rule"><h3>Government Actions</h3>' +
        '<p class="quiet">You are in government. You can take government actions, but your coalition partners will take their own actions too.</p>' +
        '<div class="act-grid">';
      D.GOV_ACTIONS.forEach(function(a) {
        var bad = st.ap < a.ap || st.funds < a.budget || st.volunteers < a.vol;
        var cost = [];
        cost.push(a.ap + ' AP');
        if (a.budget) { cost.push('$' + a.budget); }
        if (a.vol) { cost.push(a.vol + ' vol'); }
        govActs += '<button class="act gov" ' + (bad ? 'disabled' : '') +
          ' onclick="UI.chooseAction(\'' + a.id + '\')">' +
          '<b>' + esc(a.name) + '</b>' +
          '<span class="cost">' + cost.join(' / ') + '</span>' +
          '<span class="d">' + esc(a.desc) + '</span></button>';
      });
      govActs += '</div>';
    }

    // ---- Relations actions (hidden for Jihadists) ----
    var relActs = '';
    if (!isMilitaryMode && D.RELATIONS_ACTIONS) {
      relActs = '<hr class="rule"><h3>Relations Actions</h3>' +
        '<p class="quiet">Improve relations with other parties.</p>' +
        '<div class="act-grid">';
      D.RELATIONS_ACTIONS.forEach(function(a) {
        var bad = st.ap < a.ap || st.funds < a.budget || st.volunteers < a.vol;
        var cost = [];
        cost.push(a.ap + ' AP');
        if (a.budget) { cost.push('$' + a.budget); }
        if (a.vol) { cost.push(a.vol + ' vol'); }
        relActs += '<button class="act relations" ' + (bad ? 'disabled' : '') +
          ' onclick="UI.chooseAction(\'' + a.id + '\')">' +
          '<b>' + esc(a.name) + '</b>' +
          '<span class="cost">' + cost.join(' / ') + '</span>' +
          '<span class="d">' + esc(a.desc) + '</span></button>';
      });
      relActs += '</div>';
    }

    // ---- Crisis actions (always available) ----
    var crisisActs = '';
    if (inCrisis && D.CRISIS_ACTIONS) {
      var blSupport = Math.round(E.getPartySupport(st, 'bl'));
      crisisActs = '<hr class="rule"><h3>CRISIS ACTIONS - Black League at ' + blSupport + '%</h3>' +
        '<p class="quiet" style="color:#cc0000;">The Black League is a serious threat!</p>' +
        '<div class="act-grid" style="border:2px solid #cc0000;padding:8px;border-radius:4px;">';
      D.CRISIS_ACTIONS.forEach(function(a) {
        var bad = st.ap < a.ap || st.funds < a.budget || st.volunteers < a.vol;
        var cost = [];
        cost.push(a.ap + ' AP');
        if (a.budget) { cost.push('$' + a.budget); }
        if (a.vol) { cost.push(a.vol + ' vol'); }
        crisisActs += '<button class="act crisis" ' + (bad ? 'disabled' : '') +
          ' onclick="UI.chooseAction(\'' + a.id + '\')">' +
          '<b>' + esc(a.name) + '</b>' +
          '<span class="cost">' + cost.join(' / ') + '</span>' +
          '<span class="d">' + esc(a.desc) + '</span></button>';
      });
      crisisActs += '</div>';
    }

    // ---- Target picker ----
    var picker = '';
    if (pending) {
      var a = null;
      D.ACTIONS.forEach(function (x) { if (x.id === pending) { a = x; } });
      if (!a && D.GOV_ACTIONS) {
        D.GOV_ACTIONS.forEach(function (x) { if (x.id === pending) { a = x; } });
      }
      if (!a && D.CRISIS_ACTIONS) {
        D.CRISIS_ACTIONS.forEach(function (x) { if (x.id === pending) { a = x; } });
      }
      if (!a && D.RELATIONS_ACTIONS) {
        D.RELATIONS_ACTIONS.forEach(function (x) { if (x.id === pending) { a = x; } });
      }
      var chips = '';
      if (a && a.needsTarget === 'demo') {
        chips = D.DEMOS.map(function (d) {
          return '<button class="chip" onclick="UI.runAction(\'' + a.id + '\',\'' + d.id + '\')">' + esc(d.name) + '</button>';
        }).join('');
      } else if (a && a.needsTarget === 'party') {
        var active = E.activeParties(st);
        var P = E.getPlayerPartyId(st);
        var targets = active.filter(function (p) { return p.id !== P && p.id !== 'other' && p.id !== 'wl'; });
        
        if (a.id === 'form_list') {
          // Only allow forming lists with small parties
          targets = targets.filter(function(p) { return (st.raw[p.id] && E.getPartySupport(st, p.id) < 10); });
        }

        if (!targets.some(function(p) { return p.id === 'wein'; })) {
          targets.push({ id: 'wein', short: 'Wein', color: '#ff6b6b' });
        }
        chips = targets.map(function (p) {
          return '<button class="chip" onclick="UI.runAction(\'' + a.id + '\',\'' + p.id + '\')">' +
            '<span class="swatch" style="background:' + (p.color || '#888') + ';margin-right:5px"></span>' + esc(p.short) + '</button>';
        }).join('');
      } else if (a) {
        chips = '<button class="chip" onclick="UI.runAction(\'' + a.id + '\', null)">Execute</button>';
      }
      if (a && chips) {
        picker = '<hr class="rule"><h3>' + esc(a.name) + ' - pick a target</h3>' +
          '<div class="chips">' + chips +
          '<button class="chip" onclick="UI.cancelAction()">Cancel</button></div>';
      }
    }

    var f = faction(st.faction);
    var govStatus = inGovernment ? 'In Government' : 'In Opposition';

    // ---- Dzehurjaca charge ----
    var dzehurjacaHtml = '';
    if (st.dzehurjacaAvailable && !st.dzehurjacaCharged) {
      var blSupportX = Math.round(E.getPartySupport(st, 'bl'));
      var girlCoalition = Math.round(E.getPartySupport(st, 'iia') + E.getPartySupport(st, 'red') + E.getPartySupport(st, 'rb'));
      var successChance = Math.round(30 + (st.unity / 2) + (st.momentum || 0) * 2);

      dzehurjacaHtml = '<div class="result-box" style="border:3px solid #ffd700;background:rgba(255,215,0,0.1);margin:15px 0;padding:15px;">';
      dzehurjacaHtml += '<h3 style="color:#ffd700;">DZEHURJACA CHARGE AVAILABLE</h3>';
      dzehurjacaHtml += '<p style="color:#ff6b6b;">The situation is dire. The enemies of democracy are at the gates.</p>';
      dzehurjacaHtml += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;margin:8px 0;">';
      dzehurjacaHtml += '<span>BL Support: <b style="color:#cc0000;">' + blSupportX + '%</b></span>';
      dzehurjacaHtml += '<span>Girl Coalition: <b style="color:#ff6b6b;">' + girlCoalition + '%</b></span>';
      dzehurjacaHtml += '<span>Success Chance: <b style="color:#ffd700;">' + successChance + '%</b></span>';
      dzehurjacaHtml += '</div>';
      dzehurjacaHtml += '<div class="btn-row">';
      dzehurjacaHtml += '<button class="btn" onclick="UI.executeDzehurjacaCharge()" style="background:#cc0000;border-color:#ff0000;font-size:1.1rem;padding:12px 30px;">CHARGE</button>';
      dzehurjacaHtml += '</div>';
      dzehurjacaHtml += '</div>';
    }

    // ---- ROYAL PREROGATIVE PANEL ----
    var royalPanel = '';
    if (st.monarchyRestored) {
      royalPanel = '<div class="result-box" style="border:2px solid #ffd700; background:rgba(255,215,0,0.08); margin:15px 0; padding:15px;">';
      royalPanel += '<h3 style="color:#ffd700;">THE CROWN\'S PREROGATIVE</h3>';
      royalPanel += '<p style="font-size:0.9rem;color:#ddd;">King Ahmad VI sits on the throne. He may use his royal authority to reshape the political landscape.</p>';
      royalPanel += '<div class="btn-row">';
      
      if (st.ap >= 3) {
        royalPanel += '<button class="btn" onclick="UI.callSnapElection()" style="background:#5fae3c; border-color:#3a7a1a;">Dissolve Parliament (Snap Election)</button>';
      } else {
        royalPanel += '<button class="btn" disabled>Dissolve Parliament (Needs 3 AP)</button>';
      }

      if (!st.royalDecreeThreshold) {
        royalPanel += '<button class="btn" onclick="UI.decreeThreshold()" style="background:#cc9900; border-color:#ffcc00;">Royal Decree: Lower Referendum Threshold to 50%</button>';
      } else {
        royalPanel += '<button class="btn" disabled style="opacity:0.5;">Royal Decree Active (Threshold 50%)</button>';
      }

      royalPanel += '</div></div>';
    }

    var referendumButton = '';
    var _fRef = faction(st.faction);
    if (_fRef && ['zalgrilian', 'securro', 'secularists'].indexOf(_fRef.id) !== -1) {
      // Always allow clicking the button. The menu inside will explain if you lack AP, funds, or are on cooldown.
      referendumButton = '<div class="btn-row" style="margin-top:10px;">' +
        '<button class="btn" onclick="UI.go(\'referendum\')">Constitutional Referendums</button>' +
        '</div>';
    }

    var cabinetButton = '';
    if (st.coalitionPartners && st.coalitionPartners.length > 0) {
      cabinetButton = '<div class="btn-row" style="margin-top:10px;">' +
        '<button class="btn alt" onclick="UI.go(\'cabinet\')">View Cabinet</button>' +
        '</div>';
    }

    return '' +
      '<h2 class="scene-title">Week ' + st.week + ' of ' + D.WEEKS + '</h2>' +
      '<p class="quiet">Running as <b>' + (f ? esc(f.name) : 'Unknown') + '</b>. ' +
      'Action points remaining: <b>' + st.ap + '</b>. ' + govStatus + '</p>' +
      '<p>' + esc(weekFlavour()) + '</p>' +
      '<div class="act-grid">' + acts + '</div>' +
      militaryPanel +
      kingPanel +
      securroSiegePanel +
      secularistRefPanel +
      royalPanel +
      govActs +
      relActs +
      crisisActs +
      picker +
      dzehurjacaHtml +
      cabinetButton +
      '<div class="btn-row"><button class="btn" onclick="UI.setScene(\'advisors\');UI.render()">Manage Advisors</button></div>' +
      (st.faction === 'secularists' && st.affinity.iia >= 80 && st.playerParty !== 'wl' ?
        '<div class="result-box" style="border:2px solid #ffffff;background:rgba(255,255,255,0.05);margin:14px 0;">' +
        '<h3 style="color:#ffffff;">THE WHITE LEAGUE QUESTION</h3>' +
        '<p style="font-size:0.9rem;color:#ddd;">The IIA is fully aligned with the ZMP. The party leadership proposes dissolving both parties and forming a single, permanent secular union: the White League.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.triggerWhiteLeague()">Form the White League</button></div>' +
        '</div>' : '') +
      referendumButton +
      '<div class="btn-row">' +
      '<button class="btn" onclick="UI.toEvent()">' +
      (st.ap > 0 ? 'Skip ahead to this week\'s business' : 'Continue to this week\'s business') +
      '</button></div>';
  }

  function wireCivilWarButtons() {
    var root = document.getElementById('cw-overlay') || $('main');
    if (!root) return;
    var btns = root.querySelectorAll('.act[data-cw-action]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        var aid = e.currentTarget.getAttribute('data-cw-action');
        var target = null;
        if (aid === 'offensive') {
          var acts = window.CivilWar.availableActions(st);
          for (var j = 0; j < acts.length; j++) {
            if (acts[j].id === 'offensive' && acts[j].targets && acts[j].targets.length) {
              target = acts[j].targets[0].from + '|' + acts[j].targets[0].to;
              break;
            }
          }
        } else if (aid === 'reinforce') {
          for (var k in st.civilWar.states) {
            if (st.civilWar.states[k].owner === 'ZMP') { target = k; break; }
          }
        }
        var notes = window.CivilWar.act(st, aid, target, rng);
        notes.forEach(function (n) { toast(n); });
        renderAll();
      });
    }
  }

  // Injects a fixed-position action bar at the bottom of the viewport
  // whenever the civil war is active. Idempotent: rebuilds fresh each time.
  function injectCivilWarOverlay() {
    // Clean up an old one first.
    var old = document.getElementById('cw-overlay');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    if (!window.CivilWar || !window.CivilWar.isActive(st)) {
      // When the war ends, release the padding we added.
      document.body.style.paddingBottom = '';
      return;
    }

    var acts = window.CivilWar.availableActions(st);
    var n = window.CivilWar.count(st);

    var panel = document.createElement('div');
    panel.id = 'cw-overlay';
    panel.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;background:rgba(10,10,10,0.97);' +
      'border-top:2px solid #5fae3c;padding:10px 16px 14px 16px;' +
      'z-index:9000;max-height:55vh;overflow-y:auto;' +
      'box-shadow:0 -4px 16px rgba(0,0,0,0.6);';

    var inner = '';
    inner += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
    inner += '<h3 style="margin:0;color:#eee;font-size:1rem;">⚔️ War Actions</h3>';
    inner += '<span style="font-size:0.85rem;color:#aaa;">ZMP: <b style="color:#7fdf7f;">' +
      n.zmp + '</b> · ZPF: <b style="color:#ff9f6b;">' + n.zpf +
      '</b> · Contested: <b>' + n.contested + '</b> · AP: <b>' + st.ap + '</b></span>';
    inner += '</div>';
    inner += '<div class="act-grid">';
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      var dis = st.ap < a.ap || st.funds < (a.budget || 0);
      inner += '<button class="act" ' + (dis ? 'disabled' : '') +
        ' data-cw-action="' + a.id + '"><b>' + a.name + '</b>' +
        '<span class="cost">' + a.ap + ' AP' +
        (a.budget ? ' / $' + a.budget : '') + '</span>' +
        '<span class="d">' + a.desc + '</span></button>';
    }
    inner += '</div>';
    inner += '<div class="btn-row" style="margin-top:10px;">';
    inner += '<button class="btn" onclick="UI.advance()">Advance the week</button>';
    inner += '</div>';

    panel.innerHTML = inner;
    document.body.appendChild(panel);

    // Push the rest of the page up so nothing hides behind the bar.
    var barHeight = panel.offsetHeight || 320;
    document.body.style.paddingBottom = (barHeight + 20) + 'px';

    wireCivilWarButtons();
  }

  function weekFlavour() {
    var lines = [
      'The corridor outside the council room smells of floor polish and cheap printer toner.',
      'Someone has drawn a moustache on all four of your posters by the science wing.',
      'Attendance at your volunteer meeting is up, though three of them came for the snacks.',
      'The school paper has a mock-up of the ballot on its front page and your name is spelled wrong.',
      'A freshman asks you, sincerely, what the council actually does. You do not answer well.',
      'The gym is booked all week, which changes what is possible.',
      'Two of your organisers are not speaking to each other and will not say why.',
      'It rains all week. Nobody stays after school who does not have to.',
      'A rumour goes round that the election has been moved. It has not.'
    ];
    return lines[(st.week - 1) % lines.length];
  }

  function viewCoalitionFormation() {
    var cur = E.current(st);
    var seats = cur.seats;
    var P = E.getPlayerPartyId(st);
    var mine = seats[P] || 0;

        var faction = null;
    for (var i = 0; i < D.FACTIONS.length; i++) {
      if (D.FACTIONS[i].id === st.faction) { faction = D.FACTIONS[i]; }
    }

    if (faction && !faction.canFormCoalitions) {
      return '<h2 class="scene-title">Forming the Council</h2>' +
        '<p class="lead">The ZMP refuses to form a coalition.</p>' +
        '<p>Coalitions are a compromise with the enemies of God. You will not participate.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.finish(\'opposition\', null)">Go into opposition</button></div>';
    }
    
    if (mine >= D.MAJORITY) {
      return '' +
        '<h2 class="scene-title">Forming the Council</h2>' +
        '<p class="lead">You hold ' + mine + ' seats. A majority is ' + D.MAJORITY + '. There is nothing to negotiate.</p>' +
        '<div class="result-box">' +
        '<h3>ZMP has an absolute majority!</h3>' +
        '<div class="big-num">' + mine + ' / ' + D.SEATS + ' seats</div>' +
        '</div>' +
        '<div class="btn-row"><button class="btn" onclick="UI.finish(\'majority\', null)">' +
        'Take the chair</button></div>';
    }
    
    if (mine === 0) {
      return '<h2 class="scene-title">Forming the Council</h2>' +
        '<p class="lead">You hold no seats. Others will form the council without you.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.finish(\'wipeout\', null)">' +
        'See how it ends</button></div>';
    }
    
    function getSeats(pid) { 
      if (pid === 'zalian_list') {
         return (seats['zap'] || 0) + (seats['zlp'] || 0) + (seats['other_zalian'] || 0);
      }
      return seats[pid] || 0; 
    }
    
    var coalitions = [];
    
    var zmp_semp_seats = mine + getSeats('semp');
    coalitions.push({
      key: 'zalgrilian',
      name: 'Zalgrilian Front',
      combo: ['ZMP', 'semp'],
      seats: zmp_semp_seats,
      willing: Math.min(100, (st.affinity.semp || 50) + 10),
      description: 'A spirit-focused alliance. SEMP brings energy and enthusiasm to the coalition.',
      color: '#8fd06a'
    });
    
    var left_seats = mine + getSeats('semp') + getSeats('zpf');
    coalitions.push({
      key: 'leftblock',
      name: 'Left Block',
      combo: ['ZMP', 'semp', 'zpf'],
      seats: left_seats,
      willing: Math.min(100, Math.min(st.affinity.semp || 50, st.affinity.zpf || 50) + 5),
      description: 'A broad centre-left coalition. SEMP and ZPF bridge the spirit and traditionalist wings.',
      color: '#5fae3c'
    });
    
    var rgb_seats = mine + getSeats('iia') + getSeats('red');
    coalitions.push({
      key: 'rgb',
      name: 'RGB Alliance',
      combo: ['ZMP', 'iia', 'red'],
      seats: rgb_seats,
      willing: Math.min(100, Math.min(st.affinity.iia || 50, st.affinity.red || 50) + 5),
      description: 'Tech and labour united. The RGB Alliance brings together innovation and the working class.',
      color: '#2244dd'
    });
    
    var grand_seats = mine + getSeats('zpf') + getSeats('iia');
    coalitions.push({
      key: 'grand',
      name: 'Grand Coalition',
      combo: ['ZMP', 'zpf', 'iia'],
      seats: grand_seats,
      willing: Math.min(100, Math.min(st.affinity.zpf || 50, st.affinity.iia || 50) + 5),
      description: 'The broadest possible alliance. Moderates from centre and tech unite.',
      color: '#5fae3c'
    });
    
    var blackred_seats = mine + getSeats('red') + getSeats('bl');
    coalitions.push({
      key: 'blackred',
      name: 'Black-Red Alliance',
      combo: ['ZMP', 'red', 'bl'],
      seats: blackred_seats,
      willing: Math.min(100, Math.min(st.affinity.red || 50, st.affinity.bl || 50) - 10),
      description: 'A radical coalition. High risk, high reward. Faculty will not approve.',
      color: '#cc0000'
    });
    
    var zpf_seats = mine + getSeats('zpf');
    if (zpf_seats < left_seats) {
      coalitions.push({
        key: 'zpfonly',
        name: 'Centre Alliance',
        combo: ['ZMP', 'zpf'],
        seats: zpf_seats,
        willing: Math.min(100, (st.affinity.zpf || 50) + 15),
        description: 'A stable centre alliance with the ZPF. Traditional governance.',
        color: '#000000'
      });
    }
    
    var viable = coalitions.filter(function(c) {
      return c.seats >= D.MAJORITY && c.willing > 5;
    });
    
    viable.sort(function(a, b) {
      if (b.seats !== a.seats) return b.seats - a.seats;
      return b.willing - a.willing;
    });
    
    var coalitionCards = '';
    if (viable.length === 0) {
      coalitionCards = '<p><b>No viable coalition reaches ' + D.MAJORITY + ' seats.</b></p>' +
        '<p>You may need to negotiate more or go into opposition.</p>';
    } else {
      coalitionCards = viable.map(function(c) {
        var swatches = c.combo.map(function(pid) {
          var p = party(pid);
          return '<span class="swatch" style="background:' + (p ? p.color : '#999') + ';margin-right:3px;"></span>';
        }).join('');
        var names = c.combo.map(function(pid) {
          var p = party(pid);
          return p ? p.short : pid;
        }).join(' + ');
        var majority = c.seats >= D.MAJORITY ? '' : '';
        var chance = Math.round(c.willing);
        var chanceLabel = chance >= 60 ? 'Likely' : (chance >= 35 ? 'Uncertain' : 'Difficult');
        
        return '<div class="coal-opt" onclick="UI.tryCoalition(\'' + c.key + '\')">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span><b>' + esc(c.name) + '</b> ' + swatches + ' <span style="font-weight:400;">' + esc(names) + '</span></span>' +
          '<span style="font-weight:700;color:' + (c.seats >= D.MAJORITY ? '#17762f' : '#b3231b') + ';">' + c.seats + ' seats ' + majority + '</span>' +
          '</div>' +
          '<div class="m">' + esc(c.description) + ' — Willingness: ' + chance + '% (' + chanceLabel + ')</div>' +
          '</div>';
      }).join('');
    }
    
    return '' +
      '<h2 class="scene-title">Forming the Council</h2>' +
      '<p class="lead">You hold ' + mine + ' of ' + D.SEATS + ' seats. ' + D.MAJORITY + ' makes a majority. ' +
      'These are the pre-defined coalitions available to you.</p>' +
      '<div class="result-box"><h3>Coalition Options</h3>' +
      '<p class="quiet">Click a coalition to attempt formation. Success depends on willingness and your relationship with each party.</p>' +
      '<hr class="rule">' +
      coalitionCards +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn alt" onclick="UI.finish(\'opposition\', null)">Go into opposition instead</button>' +
      '<button class="btn alt" onclick="UI.go(\'election\')">Back to results</button>' +
      '</div>';
  }

  function viewEnd() {
    var e = lastEnding;
    return '' +
      '<h2 class="scene-title">' + esc(e.title) + '</h2>' +
      '<p class="lead">' + esc(e.body) + '</p>' +
      (e.detail ? '<div class="result-box"><h3>Final standing</h3>' + e.detail + '</div>' : '') +
      '<hr class="rule">' +
      '<div class="btn-row"><button class="btn" onclick="UI.restart()">Run again</button></div>';
  }

  function pollHTML() {
    var cur = E.current(st);
    var prev = st.history.length > 1 ? st.history[st.history.length - 2] : null;

    var P = E.getPlayerPartyId(st);
    var rows = D.POLL_ROWS.map(function (r) {
      var ids = [];
      for (var i = 0; i < r.ids.length; i++) {
        var id = r.ids[i];
        if (id === 'ZMP') {
          if (P !== 'wl' && st.merged.indexOf('ZMP') === -1) ids.push('ZMP');
          if (P === 'wl' && st.merged.indexOf('wl') === -1) ids.push('wl');
        } else if (id === 'tiia') {
          if (st.tiiaExists && st.merged.indexOf('tiia') === -1) ids.push('tiia');
        } else {
          if (st.merged.indexOf(id) === -1) ids.push(id);
        }
      }
      if (!ids.length) { return ''; }
      var total = 0, prevTotal = 0;
      var P = E.getPlayerPartyId(st);
      ids.forEach(function (id) {
        total += cur.totals[id] || 0;
        if (prev) { prevTotal += prev.totals[id] || 0; }
      });
      var swatches = ids.map(function (id) {
        var p = party(id);
        if (id === 'zpf') {
          return '<span class="swatch" style="background:#006400;"></span>';
        }
        return '<span class="swatch" style="background:' + (p ? p.color : '#999') + ';"></span>';
      }).join('');
      var names = ids.map(function (id) {
        var p = party(id);
        if (!p) return id;
        var color = (id === 'zpf') ? '#006400' : p.color;
        if (id === 'wl') color = '#ffffff';
        var inner = '<span style="color:' + color + ';font-weight:bold;">' + esc(p.short) + '</span>';
        if (window.Hover && window.Hover.wrapParty) {
          return window.Hover.wrapParty(id, inner);
        }
        return inner;
      }).join(' + ');
      var dl = '';
      if (prev) {
        var d = total - prevTotal;
        var cls = Math.abs(d) < 0.15 ? 'flat' : (d > 0 ? 'up' : 'down');
        var sign = d > 0 ? '+' : (d < 0 ? '\u2212' : '');
        dl = '<span class="dl ' + cls + '">' + sign + fmt(Math.abs(d)) + '</span>';
      }
      return '<div class="poll-row">' + swatches +
        '<span class="nm">' + names + '</span>' +
        '<span class="pc">' + fmt(total) + '%</span>' + dl + '</div>';
    }).join('');

    // --- INJECT ZALIAN LIST INTO POLL ---
    if (st.electoralLists && st.electoralLists['zap'] === 'zalian_list' && cur.totals['zalian_list'] > 0) {
      var zapSup = cur.totals['zap'] || 0;
      var zlpSup = cur.totals['zlp'] || 0;
      var ziSup = cur.totals['zi'] || 0;
      var listTotal = cur.totals['zalian_list'] || 0;
      
      var breakdown = 'ZAP: ' + fmt(zapSup) + '% | ZLP: ' + fmt(zlpSup) + '% | ZI: ' + fmt(ziSup) + '%';
      
      rows += '<div class="poll-row">' +
        '<span class="swatch" style="background:#d97706;"></span>' +
        '<span class="nm"><span style="color:#d97706;font-weight:bold;cursor:help;" title="' + breakdown + '">Zalian List</span></span>' +
        '<span class="pc">' + fmt(listTotal) + '%</span></div>';
    }

    // --- INJECT RED LIST INTO POLL ---
    if (st.electoralLists && st.electoralLists['red'] === 'red_list' && cur.totals['red_list'] > 0) {
      var redSup = cur.totals['red'] || 0;
      var rbSup = cur.totals['rb'] || 0;
      var ro16Sup = cur.totals['ro16'] || 0;
      var listTotal = cur.totals['red_list'] || 0;
      
      var breakdown = 'RED: ' + fmt(redSup) + '% | RB: ' + fmt(rbSup) + '% | RO16: ' + fmt(ro16Sup) + '%';
      
      rows += '<div class="poll-row">' +
        '<span class="swatch" style="background:#991b1b;"></span>' +
        '<span class="nm"><span style="color:#991b1b;font-weight:bold;cursor:help;" title="' + breakdown + '">Red List</span></span>' +
        '<span class="pc">' + fmt(listTotal) + '%</span></div>';
    }

    var others = cur.totals.other || 0;
    rows += '<div class="poll-row"><span class="swatch" style="background:#9aa0a6"></span>' +
      '<span class="nm" style="font-weight:400;color:#7d7d6e">Others</span>' +
      '<span class="pc">' + fmt(others) + '%</span></div>';

    var ideo = '<hr class="rule">' +
      '<div class="ideo-line"><span>Support for spirit maximalism:</span><span>' +
      fmt(E.spiritSupport(st)) + '%</span></div>' +
      '<div class="ideo-line muted"><span>Support for gate closure:</span><span>' +
      fmt(E.gateSupport(st)) + '%</span></div>';

    return '<h2>Projected Influence</h2>' +
      '<div class="stat sub" style="justify-content:center;margin-top:-4px">' +
      '(if the election were held now)</div>' +
      rows + ideo +
      '<hr class="rule">' +
      '<h2 style="border:0;margin-bottom:2px">Detailed Results</h2>' +
      demoTablesHTML(cur);
  }

  function demoTablesHTML(cur) {
    var cols = E.activeParties(st);
    if (!cols || cols.length === 0) return '<div class="stat sub">No active parties.</div>';
    
    return D.DEMOS.map(function (dm) {
      var vals = cols.map(function (p) { return cur.byDemo[dm.id] ? cur.byDemo[dm.id][p.id] || 0 : 0; });
      var max = Math.max.apply(null, vals);
      var head = cols.map(function (p) {
        var color = (p.id === 'zpf') ? '#006400' : p.color;
        return '<th style="color:' + color + '" title="' + esc(p.name) + '">' +
          esc(p.tag || p.short) + '</th>';
      }).join('');
      var body = cols.map(function (p, i) {
        var v = vals[i];
        return '<td class="' + (v === max ? 'win' : '') + '">' + Math.round(v) + '%</td>';
      }).join('');
      return '<div class="demo-block"><div class="dh">' + esc(dm.name) + '</div>' +
        '<table class="demo"><tr>' + head + '</tr><tr>' + body + '</tr></table></div>';
    }).join('');
  }

  function drawSeats() {
    var cur = E.current(st);
    if (!cur || !cur.seats) return;

    var data = [];
    var allPids = Object.keys(cur.seats);
    allPids.sort(function(a, b) { return (cur.seats[b] || 0) - (cur.seats[a] || 0); });

    allPids.forEach(function (pid) {
      var n = cur.seats[pid] || 0;
      if (n > 0) {
        var p = party(pid);
        if (p) {
          var color = (pid === 'zpf') ? '#006400' : p.color;
          if (pid === 'wl') color = '#ffffff';
          data.push({
            id: pid,
            seats: n,
            color: color,
            outline: '#2a2a2a',
            name: p.short || pid
          });
        }
      }
    });

    var svg = d3.select('#seats-svg');
    var container = $('right-body');
    var w = container ? container.clientWidth - 8 : 260;
    if (w < 220) { w = 260; }

    var totalDots = 0;
    data.forEach(function(d) { totalDots += d.seats; });

    // Height and dot size scale with the seat count so a 45-seat
    // chamber and a 191-seat chamber both render cleanly in the
    // 280px panel without overflow.
    var h = Math.round(w * 0.58);
    var seatRadius = totalDots > 120 ? 2.0
                   : totalDots > 60  ? 3.0
                   : 4.0;
    var innerCoef = totalDots > 120 ? 0.55
                  : totalDots > 60  ? 0.42
                  : 0.35;

    svg.attr('viewBox', '0 0 ' + w + ' ' + h)
       .attr('height', h)
       .selectAll('*').remove();

    if (data.length === 0) {
      svg.append('text')
        .attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#888')
        .text('No seats allocated');
      updateSeatLegend(data, 0);
      return;
    }

    // Preferred render: d3-parliament (proper semicircle).
    var rendered = false;
    try {
      if (typeof d3.parliament === 'function') {
        var chart = d3.parliament()
          .width(w)
          .height(h)
          .seatRadius(seatRadius)
          .innerRadiusCoef(innerCoef);
        chart.enter.smallToBig(true).fromCenter(true);
        svg.datum(data).call(chart);
        rendered = true;
      }
    } catch (e) {
      console.warn('Parliament render error, using bar fallback:', e.message);
    }

    // Fallback: horizontal seat bar. Same information, no d3 dependency.
    // Renders in any environment and stays legible at any seat count.
    if (!rendered) {
      drawSeatBarFallback(svg, data, w, h);
    }

    updateSeatLegend(data, cur.seats[E.getPlayerPartyId(st)] || 0);
  }

  function drawSeatBarFallback(svg, data, w, h) {
    var totalSeats = 0;
    data.forEach(function(d) { totalSeats += d.seats; });
    if (totalSeats === 0) return;

    var barH = Math.max(28, h * 0.35);
    var barY = Math.round((h - barH) / 2);
    var usableW = w - 12;

    var x = 6;
    data.forEach(function(d) {
      var partyW = (d.seats / totalSeats) * usableW;
      svg.append('rect')
        .attr('x', x).attr('y', barY)
        .attr('width', Math.max(0.5, partyW))
        .attr('height', barH)
        .attr('fill', d.color)
        .attr('stroke', '#1a1a1a')
        .attr('stroke-width', 0.5);

      if (partyW > 24) {
        svg.append('text')
          .attr('x', x + partyW / 2)
          .attr('y', barY + barH / 2 + 4)
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px')
          .attr('font-family', 'Georgia, serif')
          .attr('fill', '#ffffff')
          .attr('font-weight', '700')
          .text(d.name);
      }
      x += partyW;
    });

    // Majority marker
    var majorityX = 6 + (D.MAJORITY / totalSeats) * usableW;
    svg.append('line')
      .attr('x1', majorityX).attr('y1', barY - 6)
      .attr('x2', majorityX).attr('y2', barY + barH + 6)
      .attr('stroke', '#ffd700')
      .attr('stroke-width', 2);

    svg.append('text')
      .attr('x', majorityX).attr('y', barY + barH + 18)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('font-family', 'Georgia, serif')
      .attr('fill', '#ffd700')
      .text('Majority (' + D.MAJORITY + ')');

    svg.append('text')
      .attr('x', 6).attr('y', barY - 10)
      .attr('font-size', '10px')
      .attr('font-family', 'Georgia, serif')
      .attr('fill', '#888')
      .text(totalSeats + ' seats');
  }

  function updateSeatLegend(data, mine) {
    var legend = $('seat-legend');
    if (!legend) return;

    var totalSeats = 0;
    data.forEach(function(d) { totalSeats += d.seats; });
    totalSeats = Math.max(totalSeats, D.SEATS);

    var P = E.getPlayerPartyId(st).toUpperCase();
    legend.innerHTML =
      '<div style="width:100%;font-weight:700;margin-bottom:4px;">' +
      P + ': ' + mine + ' / ' + totalSeats +
      ' seats &mdash; majority needs ' + D.MAJORITY + '</div>' +
      data.map(function(d) {
        return '<span style="display:inline-block;margin:2px 6px 2px 0;">' +
          '<i style="background:' + d.color + ';display:inline-block;' +
          'width:10px;height:10px;border:1px solid #333;margin-right:4px;vertical-align:middle;"></i>' +
          esc(d.name) + ' ' + d.seats + '</span>';
      }).join('');
  }

  function drawHistory() {
    var container = $('right-body');
    var w = container ? Math.max(240, container.clientWidth - 8) : 300;
    var h = 200;

    var svg = d3.select('#hist-svg');
    svg.attr('viewBox', '0 0 ' + w + ' ' + h)
       .attr('height', h)
       .selectAll('*').remove();

    if (!st || !st.history || st.history.length < 2) {
      svg.append('text')
        .attr('x', w/2)
        .attr('y', h/2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#888')
        .text('Not enough weeks yet.');
      return;
    }

    var allPids = [];
    st.history.forEach(function(h) {
      Object.keys(h.totals).forEach(function(pid) {
        if (allPids.indexOf(pid) === -1 && st.merged.indexOf(pid) === -1) {
          allPids.push(pid);
        }
      });
    });

    var activeSeries = allPids.filter(function(pid) {
      return st.merged.indexOf(pid) === -1;
    });

    if (activeSeries.length === 0) {
      svg.append('text')
        .attr('x', w/2)
        .attr('y', h/2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#888')
        .text('No active parties');
      return;
    }

    var data = st.history.map(function(h, i) {
      var row = { w: i + 1 };
      activeSeries.forEach(function(pid) {
        row[pid] = h.totals[pid] || 0;
      });
      return row;
    });

    var mL = 30, mR = 30, mT = 12, mB = 22;

    var x = d3.scaleLinear()
      .domain([1, data.length])
      .range([mL, w - mR]);

    var maxY = d3.max(data, function(r) {
      return d3.max(activeSeries, function(s) { return r[s] || 0; });
    });
    maxY = Math.ceil((maxY + 5) / 5) * 5;
    if (maxY < 10) maxY = 10;

    var y = d3.scaleLinear()
      .domain([0, maxY])
      .range([h - mB, mT]);

    svg.append('g')
      .attr('transform', 'translate(0,' + (h - mB) + ')')
      .call(d3.axisBottom(x).ticks(Math.min(data.length, 9)).tickFormat(function(d) { return 'w' + d; }))
      .attr('font-size', '8px');

    svg.append('g')
      .attr('transform', 'translate(' + mL + ',0)')
      .call(d3.axisLeft(y).ticks(4))
      .attr('font-size', '8px');

    var last = data[data.length - 1];
    var labels = [];

    activeSeries.forEach(function(pid) {
      var p = party(pid);
      if (!p) return;

      var color = p.color || '#999';
      var line = d3.line()
        .x(function(r) { return x(r.w); })
        .y(function(r) { return y(r[pid] || 0); });

      svg.append('path')
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', pid === 'ZMP' ? 2.5 : 1.2)
        .attr('opacity', pid === 'ZMP' ? 1 : 0.7)
        .attr('d', line(data));

      labels.push({
        pid: pid,
        color: color,
        tag: p.tag || p.short || pid,
        y: y(last[pid] || 0)
      });
    });

    labels.sort(function(a, b) { return a.y - b.y; });
    var gap = 8;
    for (var i = 1; i < labels.length; i++) {
      if (labels[i].y - labels[i-1].y < gap) {
        labels[i].y = labels[i-1].y + gap;
      }
    }
    var overflow = labels.length ? labels[labels.length-1].y - (h - mB) : 0;
    if (overflow > 0) {
      labels.forEach(function(l) { l.y -= overflow; });
    }

    labels.forEach(function(l) {
      svg.append('text')
        .attr('x', x(last.w) + 4)
        .attr('y', l.y + 3)
        .attr('font-size', '8px')
        .attr('fill', l.color)
        .attr('font-weight', l.pid === 'ZMP' ? '700' : '400')
        .text(l.tag);
    });
  }

  function eventForWeek(w) {
    if (!D || !D.EVENTS) return null;
    for (var i = 0; i < D.EVENTS.length; i++) {
      var ev = D.EVENTS[i];
      var hasCondition = ev.condition && typeof ev.condition === 'function';
      var conditionMet = hasCondition ? ev.condition(st) : true;

      if (ev.week === w && !st.eventDone[ev.id] && conditionMet) {
        return ev;
      }
      if (ev.week === -1 && !st.eventDone[ev.id] && hasCondition && conditionMet) {
        return ev;
      }
    }
    return null;
  }

  api.tryCoalition = function (coalitionKey) {
    var c = E.coalitions(st);
    var option = c.preDefinedOptions ? c.preDefinedOptions[coalitionKey] : null;
    if (!option) {
      toast('Coalition not available.');
      return;
    }
    
    if (option.seats < D.MAJORITY) {
      toast('Not enough seats for this coalition.');
      return;
    }
    
    var chance = Math.max(0.05, Math.min(0.95, option.willing / 100));
    if (rng() < chance) {
      toast(option.name + ' coalition formed!');
      
      var P = E.getPlayerPartyId(st);
      option.combo.forEach(function (pid) {
        var targetPid = (pid === 'Zalian List') ? 'zalian_list' : pid.toLowerCase();
        if (pid !== P && pid !== 'ZMP') {
          var p = party(pid.toLowerCase());
          if (p && st.coalitionPartners.indexOf(pid.toLowerCase()) === -1) {
            st.coalitionPartners.push(pid.toLowerCase());
            st.log.push('Week ' + st.week + ': ' + p.name + ' joins the coalition.');
          }
        }
      });
      
      st.coalitionStability = Math.min(100, (st.coalitionStability || 80) + 20);
      
      var cabinetResult = E.formCabinet(st, st.coalitionPartners);
      
      scene = 'minister_selection';
      st._selectedMinistries = {};
      renderAll();
    } else {
      toast(option.name + ' negotiations fail. Willingness too low.');
      var P = E.getPlayerPartyId(st);
      option.combo.forEach(function (pid) {
        if (pid !== P && pid !== 'ZMP') {
          st.affinity[pid] = E.clamp((st.affinity[pid] || 50) - 10, 0, 100);
        }
      });
      renderAll();
    }
  };

  api.setTab = function (t) {
    tab = t;
    renderRight();
  };

  api.runMinistryAction = function(ministryId, actionId) {
    var ministry = st.cabinet[ministryId];
    var action = ministry.actions.find(function(a) { return a.id === actionId; });
    
    // Check if it has options
    if (action && action.options && action.options.length > 0) {
      st.pendingMinistryChoice = { ministryId: ministryId, action: action };
      scene = 'minister_decision';
      renderAll();
      return;
    }
  };

  api.resolveMinistryChoice = function(optionId) {
    var pending = st.pendingMinistryChoice;
    if (!pending) return;
    
    var notes = E.executeCabinetAction(st, pending.ministryId, pending.action.id, optionId, rng);
    
    // Check for catastrophic effects (BL rising fast)
    var isBad = pending.action.options.find(function(o) { return o.id === optionId; }).effects.party && 
                pending.action.options.find(function(o) { return o.id === optionId; }).effects.party.bl > 0;

    st.lastMinistryResult = {
      actionName: pending.action.name,
      optionText: pending.action.options.find(function(o){ return o.id === optionId; }).text,
      notes: notes,
      isBad: isBad
    };
    
    st.pendingMinistryChoice = null;
    scene = 'minister_result';
    renderAll();
  };

  api.closeMinistryResult = function() {
    st.lastMinistryResult = null;
    scene = 'ministry';
    renderAll();
  };

  function viewMinisterDecision() {
    var pending = st.pendingMinistryChoice;
    if (!pending) return 'No decision pending.';
    
    var html = '<h2 class="scene-title">A Matter of Policy</h2>';
    html += '<p class="lead" style="font-family:var(--font-heading); font-style:italic;">How will you handle the <b>' + esc(pending.action.name) + '</b>?</p>';
    
    html += '<div style="display:flex; flex-direction:column; gap:12px; margin:30px 0;">';
    
    pending.action.options.forEach(function(opt) {
      html += '<div class="result-box" style="border-left:3px solid var(--border); padding:20px; background:#1a1a1a;">';
      html += '<h3 style="margin:0 0 8px 0; color:#fff; font-size:1.2rem; font-family:var(--font-heading);">' + esc(opt.text) + '</h3>';
      html += '<p style="color:#aaa; font-size:0.95rem; line-height:1.6; margin:0 0 20px 0;">' + esc(opt.desc) + '</p>';
      
      html += '<button class="btn" style="width:100%; text-align:left; background:transparent; border:1px solid #444;" onclick="UI.resolveMinistryChoice(\'' + opt.id + '\')">Issue the Directive</button>';
      html += '</div>';
    });
    
    html += '</div>';
    html += '<div class="btn-row"><button class="btn alt" onclick="UI.go(\'ministry\')">Cancel and Return</button></div>';
    
    return html;
  }

  function viewMinisterResult() {
    var res = st.lastMinistryResult;
    if (!res) return 'No result.';
    
    // Check if there's any negative fallout to change the headline color
    var isBacklash = false;
    res.notes.forEach(function(n) {
        if (n.toLowerCase().indexOf('protest') !== -1 || n.toLowerCase().indexOf('furious') !== -1 || n.toLowerCase().indexOf('condemn') !== -1) {
            isBacklash = true;
        }
    });

    var header = isBacklash ? 'THE OPPOSITION STRIKES BACK' : 'THE COUNCIL ACTS';
    var color = isBacklash ? '#cc0000' : '#a8a496';
    
    var html = '<div style="text-align:center; padding:30px 0; border-bottom:2px solid ' + color + '; margin-bottom:25px;">';
    html += '<h1 style="color:' + color + '; font-size:2rem; margin:0 0 10px 0; text-transform:uppercase; letter-spacing:2px; font-family:var(--font-heading);">' + header + '</h1>';
    html += '<h3 style="color:#ddd; font-size:1.1rem; margin:0; font-family:var(--font-heading); font-style:italic;">"' + esc(res.optionText) + '"</h3>';
    html += '</div>';
    
    html += '<div style="max-width:650px; margin:0 auto; background:#161412; padding:25px; border-left:1px solid #333; border-right:1px solid #333;">';
    html += '<h4 style="margin-top:0; color:#888; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #333; padding-bottom:8px;">Dispatch from the Council Chamber</h4>';
    
    html += '<div style="display:flex; flex-direction:column; gap:12px; margin-top:15px;">';
    
    res.notes.forEach(function(n) {
      html += '<p style="font-size:1rem; color:#c4c0b8; line-height:1.6; margin:0;">' + esc(n) + '</p>';
    });
    
    html += '</div></div>';
    
    html += '<div class="btn-row" style="justify-content:center; margin-top:30px;">';
    html += '<button class="btn" onclick="UI.closeMinistryResult()">Return to the Ministry</button>';
    html += '</div>';
    
    return html;
  }

  
  function viewWhiteLeague() {
    if (!st || !st.whiteLeague) {
      return '<h2 class="scene-title">White League</h2><p>No negotiation in progress.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
    }
    var wl = st.whiteLeague;
    var html = '';

    if (wl.failed) {
      html += '<h2 class="scene-title">Negotiation Failed</h2>';
      html += '<p class="lead">The IIA has broken off talks. They will not return to the table this year.</p>';
      html += '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
      return html;
    }

    var d = window.WhiteLeague.getPendingDemand(st);
    if (!d) {
      html += '<h2 class="scene-title">White League</h2><p>No pending demand.</p>';
      html += '<div class="btn-row"><button class="btn" onclick="UI.go(\'week\')">Back</button></div>';
      return html;
    }

    var idx = wl.currentIndex + 1;
    var total = wl.demands.length;

    html += '<h2 class="scene-title">The White League — Demand ' + idx + ' of ' + total + '</h2>';
    html += '<p class="lead">The IIA has put a demand on the table. Accept it, or end the negotiation.</p>';
    html += '<div class="result-box" style="border:2px solid #ffffff;background:rgba(255,255,255,0.05);padding:14px;">';
    html += '<div style="font-weight:bold;font-size:1.05rem;margin-bottom:6px;">' + esc(d.text) + '</div>';
    html += '<div style="color:#aaa;font-size:0.9rem;">' + esc(d.note) + '</div>';
    html += '</div>';

    if (wl.accepted && wl.accepted.length > 0) {
      html += '<h3>Concessions already accepted</h3>';
      html += '<ul style="font-size:0.85rem;color:#aaa;">';
      for (var i = 0; i < wl.accepted.length; i++) {
        html += '<li>' + esc(wl.accepted[i]) + '</li>';
      }
      html += '</ul>';
    }

    html += '<div class="btn-row">';
    html += '<button class="btn" onclick="UI._wlAccept()">Accept Concession</button>';
    html += '<button class="btn alt" onclick="UI._wlReject()">Refuse — End Negotiation</button>';
    html += '</div>';
    return html;
  }

  function viewAdvisors() {
    if (!st) return '<h2 class="scene-title">Advisors</h2><p>No game active.</p>';

    var advisors = (D && D.ADVISORS) || [];
    var posts = [
      { id: 'ruler',   label: 'Ruler of the Party' },
      { id: 'finance', label: 'Finance Minister' },
      { id: 'radical', label: 'Radical Wing Leader' }
    ];

    var html = '<h2 class="scene-title">Party Advisors</h2>';
    html += '<p class="lead">You may appoint exactly 3 advisors. Their passive bonuses apply immediately.</p>';
    html += '<p class="quiet">Once per month, you can use an advisor\'s active ability for a powerful effect.</p>';

    for (var i = 0; i < posts.length; i++) {
      var post = posts[i];
      var currentId = st.cabinetAdvisors && st.cabinetAdvisors[post.id];
      var currentAdv = null;
      for (var j = 0; j < advisors.length; j++) {
        if (advisors[j].id === currentId) { currentAdv = advisors[j]; break; }
      }

      html += '<div class="result-box" style="padding:12px;margin:10px 0;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline;">';
      html += '<h3 style="margin:0;">' + esc(post.label) + '</h3>';
      
      if (currentAdv) {
        var curFaction = D.MINISTER_FACTIONS && D.MINISTER_FACTIONS[currentAdv.faction];
        html += '<span style="font-size:0.85rem;color:' + ((curFaction && curFaction.color) || '#888') + ';">' + esc(currentAdv.name) + '</span>';
      } else {
        html += '<span style="font-size:0.85rem;color:#888;">Vacant</span>';
      }
      html += '</div>';

      if (currentAdv && st.advisorsUsed && st.advisorsUsed[post.id] === st.week) {
        html += '<div style="margin-top:8px; font-size:0.85rem; color:#ffcc00;">Action used this week.</div>';
      } else if (currentAdv) {
        html += '<div style="margin-top:8px; display:flex; gap:6px;">';
        html += '<button class="btn" style="font-size:0.8rem; padding:4px 10px; background:#333;" onclick="UI.useAdvisorAction(\'' + post.id + '\')">Use Active Ability</button>';
        html += '<span style="font-size:0.8rem; color:#888; align-self:center;">(Costs 1 AP)</span>';
        html += '</div>';
      }
      html += '</div>';

      // Dropdown to replace the advisor
      html += '<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">';
      for (var k = 0; k < advisors.length; k++) {
        var adv = advisors[k];
        var seatedHere = currentAdv && currentAdv.id === adv.id;
        var seatedElsewhere = false;
        if (st.cabinetAdvisors) {
          for (var p2 in st.cabinetAdvisors) {
            if (p2 !== post.id && st.cabinetAdvisors[p2] === adv.id) { seatedElsewhere = true; }
          }
        }
        var disabled = seatedHere || seatedElsewhere;
        var fInfo = D.MINISTER_FACTIONS && D.MINISTER_FACTIONS[adv.faction];
        var chipColor = (fInfo && fInfo.color) || '#888';

        html += '<button class="chip" ' + (disabled ? 'disabled style="opacity:0.3;"' : '') + 
                ' onclick="UI.doRotateAdvisor(\'' + post.id + '\',\'' + adv.id + '\')" ' +
                'style="border-left:3px solid ' + chipColor + ';">' + 
                esc(adv.name) + '</button>';
      }
      html += '</div>';
    }

    html += '<div class="btn-row"><button class="btn alt" onclick="UI.go(\'week\')">Back</button></div>';
    return html;
  }

  api.useAdvisorAction = function(postId) {
    if (st.ap < 1) { toast('Not enough AP.'); return; }
    if (!st.advisorsUsed) st.advisorsUsed = {};
    if (st.advisorsUsed[postId] === st.week) { toast('Ability already used this week.'); return; }
    
    var advId = st.cabinetAdvisors[postId];
    var adv = null;
    for (var i = 0; i < D.ADVISORS.length; i++) {
      if (D.ADVISORS[i].id === advId) { adv = D.ADVISORS[i]; break; }
    }
    if (!adv) return;

    st.ap -= 1;
    st.advisorsUsed[postId] = st.week;
    
    var eff = { unity: 5, momentum: 2 }; // Default
    if (postId === 'finance') eff = { funds: 20, unity: 2 };
    if (postId === 'radical') eff = { demo: { buskids: 5, freshmen: 5 }, momentum: 3 };

    E.applyEffects(st, eff, rng);
    toast(adv.name + ' has taken decisive action!');
    renderAll();
  };

api.doRotateAdvisor = function (postId, advisorId) {
  if (typeof E.rotateAdvisor !== 'function') {
    toast('Advisor rotation not available in this build.');
    return;
  }
  var r = E.rotateAdvisor(st, postId, advisorId);
  if (!r.ok) { toast(r.msg); return; }
  (r.notes || []).forEach(function (n) { st.log.push('  ' + n); });
  toast(r.advisor.name + ' takes the post.');
  renderAll();
};

  

  api.finish = function (kind, opt) {
    var cur = E.current(st);
    var mine = cur.seats.ZMP || 0;
    var f = faction(st.faction);
    var e = { title: '', body: '', detail: '' };

    var detail = '<div class="stat"><span>Seats won</span><span class="v">' + mine +
      ' / ' + D.SEATS + '</span></div>' +
      '<div class="stat"><span>Share of school</span><span class="v">' +
      fmt(cur.totals.ZMP || 0) + '%</span></div>' +
      '<div class="stat"><span>Final unity</span><span class="v">' + Math.round(st.unity) + '</span></div>' +
      '<div class="stat"><span>Faculty tolerance</span><span class="v">' +
      Math.round(st.faculty) + '</span></div>' +
      '<div class="stat"><span>Faction</span><span class="v">' + (f ? esc(f.name) : 'Unknown') + '</span></div>';

    if (kind === 'majority') {
      e.title = 'Absolute Majority';
      e.body = 'You chair the council with no partners to placate and no excuses available.';
    } else if (kind === 'coalition') {
      e.title = 'A Council Is Formed — ' + opt.name;
      e.body = opt.name + ' — ' + opt.seats + ' of ' + D.SEATS + ' seats. ' + opt.description;
      detail = '<div class="stat"><span>Coalition</span><span class="v">' + esc(opt.name) +
        '</span></div><div class="stat"><span>Coalition seats</span><span class="v">' +
        opt.seats + '</span></div>' + detail;
    } else if (kind === 'wipeout') {
      e.title = 'Below the Threshold';
      e.body = 'The ZMP takes no seats. The banner comes down off the council room wall.';
    } else {
      e.title = 'Into Opposition';
      e.body = 'You decline to govern. From the back rows you will spend the year being right.';
    }

    e.detail = detail;
    lastEnding = e;
    st.finished = true;
    scene = 'end';
    renderAll();
  };

    api.triggerWhiteLeague = function() {
    var r = E.formWhiteLeague(st);
    if (!r.ok) { toast(r.msg); return; }
    toast(r.msg);
    st.seats = E.allocateSeats(E.computeSupport(st).totals, st);
    renderAll();
  };


  api._startWhiteLeague = function () {
    var r = window.WhiteLeague.startNegotiation(st);
    if (!r.ok) { toast(r.msg || 'Negotiation cannot begin.'); return; }
    scene = 'white_league';
    renderAll();
  };

  api._wlAccept = function () {
    if (!st.whiteLeague || !st.whiteLeague.active) return;
    var d = window.WhiteLeague.getPendingDemand(st);
    var r = window.WhiteLeague.respond(st, true);
    if (r.formed) {
      toast('The White League is formed.');
      scene = 'week';
    } else if (r.ok) {
      toast('Concession accepted: ' + (d ? d.text : ''));
    }
    renderAll();
  };

  api._wlReject = function () {
    if (!st.whiteLeague || !st.whiteLeague.active) return;
    var d = window.WhiteLeague.getPendingDemand(st);
    window.WhiteLeague.respond(st, false);
    toast('Negotiation failed: ' + (d ? d.text : ''));
    scene = 'week';
    renderAll();
  };

  api._wlDissolveBack = function () {
    window.WhiteLeague.dissolveBack(st);
    toast('The White League dissolves.');
    scene = 'week';
    renderAll();
  };

  api._wlDictatorship = function () {
    window.WhiteLeague.declareDictatorship(st);
    renderAll();
  };

  api.restart = function () {
    st = null;
    pending = null;
    lastEnding = null;
    scene = 'title';
    tab = 'poll';
    renderAll();
  };

  // ============================================================
  // ZALGRILIAN COUNCIL — post-victory play mode
  // ============================================================
  api.startZalgrilianCouncil = function (opts) {
    opts = opts || {};
    var triggeredFrom = opts.triggeredFrom || (st && st.zcTriggeredFrom) || 'fast_putsch';

    // Snapshot the current state so we can return to it if the council fails
    try {
      var saveData = {
        state: JSON.parse(JSON.stringify(st)),
        timestamp: Date.now(),
        week: st ? st.week : 0,
        faction: st ? st.faction : null,
        version: '1.0',
        kind: 'zc_return_snapshot'
      };
      localStorage.setItem('classCouncil_save_zc_return', JSON.stringify(saveData));
    } catch (e) {}

    // Build the full-screen iframe
    var existing = document.getElementById('zc-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'zc-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:#000;z-index:9999;' +
      'display:flex;flex-direction:column;';

    var iframe = document.createElement('iframe');
    iframe.id = 'zc-iframe';
    iframe.src = 'zalgrilian_council.html';
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    // Listen for the outcome from the iframe
    var messageHandler = function (event) {
      var data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'ZC_READY') {
        console.log('[ui] Zalgrilian Council ready, week', data.week);
        return;
      }

      if (data.type === 'ZC_OUTCOME') {
        window.removeEventListener('message', messageHandler);
        overlay.remove();
        applyZalgrilianCouncilOutcome(data);
      }
    };

    window.addEventListener('message', messageHandler);
  };

  // ============================================================
  // ZALGRILIAN COUNCIL — outcome handlers
  // ============================================================
  function applyZalgrilianCouncilOutcome(data) {
    if (!st) return;

    var outcome = data.outcome || {};
    var band = outcome.band || 'narrow';
    var zmpSeats = outcome.zmpSeats || 0;
    var zmpPercent = outcome.zmpPercent || 0;
    var triggeredFrom = outcome.triggeredFrom || 'fast_putsch';

    // Build the final ending based on the band
    var ending = buildCouncilEnding(band, zmpSeats, zmpPercent, triggeredFrom,
      outcome.finalPercentages, outcome.finalSeats);

    st.endingData = ending;
    st.finished = true;
    st.zcCompleted = true;
    st.zcOutcome = outcome;

    if (scene !== 'end') {
      scene = 'end';
    }
    renderAll();
  }

  function buildCouncilEnding(band, seats, percent, triggeredFrom, finalPercentages, finalSeats) {
    // Defaults
    var fromFast = triggeredFrom === 'fast_putsch';
    var prefix = fromFast
      ? 'The King Putsch succeeded without bloodshed. The ordinary Council was dissolved, and the Zalgrilian Council was convened in its place.'
      : 'The civil war ended in a monarchist victory. The ordinary Council was abolished, and the Zalgrilian Council was convened in its place.';

    var commonDetail =
      '<div class="stat"><span>Final ZMP share</span><span class="v">' +
        percent + '%</span></div>' +
      '<div class="stat"><span>Final ZMP seats</span><span class="v">' +
        seats + ' / 45</span></div>';

    if (band === 'super') {
      return {
        ending: 'zc_super',
        title: 'The Crown Majority',
        subtitle: 'The ZMP dictates the constitution. The monarchy is settled.',
        endingNumber: 'Ending 60',
        body: prefix + ' The ZMP ended the session with a supermajority. It wrote the constitution alone.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held ' + seats + ' of the 45 seats — more than the historical record had ever produced. ' +
          'The convention was short. There was no need to negotiate with the splinter parties, ' +
          'because there was nothing to negotiate with. Every clause came down as the ZMP wrote it. ' +
          'The crown was strong, the suffrage was universal, the capital stayed where it was, ' +
          'Zalirian rights were protected but not enshrined, and emergency powers were ' +
          'granted to the crown with the Council\'s formal consent. ' +
          'The five elections that led here had gone ' +
          Math.round((finalPercentages && finalPercentages.ZMP) || percent) + '% at the last ballot. ' +
          'The opposition coalition of ZPF, ZAP, RBMP, PLMS, and ZEJ that had tried to stop the ZMP ' +
          'in the third election never recovered. ZPF was absorbed by the end. ZAP shrank. RBMP ' +
          'split into two factions and neither was returned. ZEJ was outlawed. PLMS stopped contesting. ' +
          'The historical record said the ZMP should have finished at 72%. It finished higher. ' +
          'The constitution of the Zalgrilian monarchy bore the ZMP\'s name in its preamble and ' +
          'its programme in every clause, and the King signed it in the courtyard where the ' +
          'Dzehurjaca Legion had once stood in the rain, and the whole thing was done.',
        subending: 'Subending ZA — The Crown Majority',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#5fae3c;font-weight:bold;">ZMP DICTATED</span></div>',
        epilogue:
          'The ZMP governed the Zalgrilian monarchy for two generations. The opposition never ' +
          'recovered. Every subsequent election returned the same result, and the country settled ' +
          'into a stable, prosperous, and quietly authoritarian peace.'
      };
    }

    if (band === 'strong') {
      return {
        ending: 'zc_strong',
        title: 'The Historical Result',
        subtitle: 'The ZMP finishes where history said it would. The constitution is theirs.',
        endingNumber: 'Ending 61',
        body: prefix + ' The ZMP finished with a strong majority, matching the historical record.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held ' + seats + ' of the 45 seats. The final percentage was ' + percent + '%. ' +
          'This was the record the textbooks had set down: 55%, 53%, 46%, 57%, 72%. ' +
          'The ZMP had run the same arc, and the same forces had done the same things. ' +
          'ZPF had broken late, ZAP had failed to rally the capital question into a majority, ' +
          'RBMP had been unable to hold its minority bloc together through the fourth election, ' +
          'ZEJ had been outlawed in the ninth week, and PLMS had simply stopped. ' +
          'The constitution that emerged was the historical constitution: a strong crown ' +
          'checked by a bicameral Council, universal male suffrage, the capital kept at its ' +
          'current seat, and Zalirian rights recognised in principle but not enshrined. ' +
          'The King signed it in the courtyard. The ZMP had done what history said it would do, ' +
          'and the country settled into the long constitutional monarchy that everyone had ' +
          'expected — the peace that the King Putsch had been fought to produce. ' +
          'In the annals of the Zalgrilian monarchy, the twenty weeks of the first council ' +
          'became a foundational text. Schoolchildren learned the dates. The arc of the five ' +
          'elections was taught as the shape of legitimate victory.',
        subending: 'Subending ZB — The Historical Result',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#5fae3c;font-weight:bold;">ZMP MAJORITY</span></div>',
        epilogue:
          'The ZMP governed for a generation. ZPF was absorbed in the fourth term. ZAP ' +
          'persisted as a permanent opposition of roughly 8%. RBMP and PLMS faded. ZEJ was ' +
          'banned and its members emigrated. The monarchy, once restored, endured.'
      };
    }

    if (band === 'narrow') {
      return {
        ending: 'zc_narrow',
        title: 'The Narrow Constitution',
        subtitle: 'The ZMP must compromise. The constitution is written in coalition.',
        endingNumber: 'Ending 62',
        body: prefix + ' The ZMP finished short of a majority. It had to negotiate the constitution.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held ' + seats + ' of the 45 seats — a plurality, but not a majority. ' +
          'The ZPF and ZAP, who had spent the last two elections circling each other, ' +
          'found common cause one final time. The constitution that emerged was not the ZMP\'s. ' +
          'It was the price of ZPF\'s support. The crown was weakened: the King would appoint ' +
          'a Chancellor from the Council\'s majority rather than of his own choosing. ' +
          'The capital question went to ZAP as a concession — not moved outright, but with a ' +
          'commission appointed to study the possibility. Zalirian rights were confirmed in a ' +
          'separate annex, not in the main text. Emergency powers were limited to ninety days ' +
          'and required Council review. The ZMP signed the constitution because the alternative ' +
          'was worse. It had won the war. It had not won the peace. ' +
          'The King signed it in the courtyard, and the Marshal — wherever he was that year — ' +
          'was said to have read the text once and then set it down without comment.',
        subending: 'Subending ZC — The Narrow Constitution',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#ffcc00;font-weight:bold;">COMPROMISED</span></div>',
        epilogue:
          'The Zalgrilian monarchy survived, but as a constitutional monarchy with real limits. ' +
          'The ZMP governed in coalition with ZPF for twelve years before losing power to ' +
          'a ZAP-led government. The capital was eventually moved to Nezle in 1968. ' +
          'Zalirian rights remained a contested subject for the rest of the century.'
      };
    }

    if (band === 'opposition') {
      return {
        ending: 'zc_opposition',
        title: 'The Opposition Constitution',
        subtitle: 'The ZMP is reduced. ZPF and ZAP write the constitution between them.',
        endingNumber: 'Ending 63',
        body: prefix + ' The ZMP finished far below expectations. The opposition wrote the constitution.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held only ' + seats + ' of the 45 seats. The final percentage was ' + percent + '%. ' +
          'The ZPF and ZAP — mortal rivals at the first election — had consolidated into a single ' +
          'opposition bloc by week 15. When the convention opened, they wrote the constitution ' +
          'without consulting the ZMP. The crown was reduced to ceremony. The capital was moved ' +
          'to Nezle by decree. Zalirian rights were stripped to a schedule of limitations: ' +
          'property, office, and military service all restricted. The ZMP was granted a formal ' +
          'right of opposition and a fixed minority bloc in the lower chamber — the minimum ' +
          'the opposition needed to claim the constitution was "inclusive." ' +
          'The King signed it in the courtyard. He had not wanted to. He had no choice. ' +
          'The Marshal, watching from his seat in the back of the chamber, was said to have ' +
          'leaned over to the man next to him and said only: "We should have won the third ' +
          'election." He did not speak again for the rest of the session.',
        subending: 'Subending ZD — The Opposition Constitution',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#ff6060;font-weight:bold;">OPPOSITION-WRITTEN</span></div>',
        epilogue:
          'The ZMP was confined to a permanent minority for two decades. The capital was moved ' +
          'to Nezle. Zalirian rights were systematically stripped over the following years. ' +
          'The party survived, but as an opposition rather than a governing force. It was ' +
          'not until the 1970s that a new generation of ZMP leaders returned it to power — and ' +
          'by then the country had changed beyond recognition.'
      };
    }

    // collapsed
    return {
      ending: 'zc_collapsed',
      title: 'The Nezle Settlement',
      subtitle: 'The ZMP is destroyed. ZAP writes the constitution and moves the capital.',
      endingNumber: 'Ending 64',
      body: prefix + ' The ZMP collapsed. ZAP dictated the constitution.',
      story:
        'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
        'The ZMP held only ' + seats + ' of the 45 seats. The final percentage was ' + percent + '%. ' +
        'ZAP had grown from a small centrist alternative into the dominant party of the new regime. ' +
        'Its programme was simple and it delivered it in full: the capital was moved to Nezle, ' +
        'the Zalian city in the valley that the ZMP had captured in the war; Zalirian rights ' +
        'were abolished outright; the suffrage was restricted to Zalians of property; the crown ' +
        'was retained as a figurehead of Zalian identity and stripped of every executive power. ' +
        'The ZMP was dissolved by decree in the ninth week of the convention. Its leaders were ' +
        'arrested — not executed, but imprisoned on charges of "wartime excess." The Marshal ' +
        'was already dead by then, but his papers were seized and burned in the courtyard. ' +
        'The King signed the constitution in Nezle, not in the old capital, and the city that ' +
        'had once been the seat of his ancestors became a provincial backwater. ' +
        'The Zalgrilian monarchy survived in name. It did not survive in substance. The country ' +
        'that emerged was a Zalirian ethnostate with a ceremonial crown, governed by ZAP and ' +
        'its successors for the next forty years.',
      subending: 'Subending ZE — The Nezle Settlement',
      detail: commonDetail +
        '<div class="stat"><span>Constitution</span><span class="v" style="color:#cc0000;font-weight:bold;">ZAP DICTATED</span></div>',
      epilogue:
        'The ZMP was banned. Its leaders were imprisoned. The capital moved to Nezle in the ' +
        'spring, and the old royal city declined over the following decades. Zalirian rights ' +
        'were formally abolished, and the minority population that remained was gradually ' +
        'pushed into the countryside. The history books that followed described the King Putsch ' +
        'as a "failed monarchist adventure" and the ZMP as "a party of the old regime." ' +
        'By the time a new ZMP formed — in exile, in the 1990s — the country had been ' +
        'governed by ZAP or its successors for half a century.'
    };
  }

  api._applyZalgrilianCouncilOutcome = applyZalgrilianCouncilOutcome;

    // ============================================================
  // ZALGRILIAN COUNCIL — post-victory play mode
  // ============================================================
  api.startZalgrilianCouncil = function (opts) {
    opts = opts || {};
    var triggeredFrom = opts.triggeredFrom || (st && st.zcTriggeredFrom) || 'fast_putsch';

    // Snapshot the current state so we can return to it if needed
    try {
      var saveData = {
        state: JSON.parse(JSON.stringify(st)),
        timestamp: Date.now(),
        week: st ? st.week : 0,
        faction: st ? st.faction : null,
        version: '1.0',
        kind: 'zc_return_snapshot'
      };
      localStorage.setItem('classCouncil_save_zc_return', JSON.stringify(saveData));
    } catch (e) {}

    // Remove any existing overlay
    var existing = document.getElementById('zc-overlay');
    if (existing) existing.remove();

    // Full-screen iframe
    var overlay = document.createElement('div');
    overlay.id = 'zc-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:#000;z-index:9999;' +
      'display:flex;flex-direction:column;';

    var iframe = document.createElement('iframe');
    iframe.id = 'zc-iframe';
    iframe.src = 'zalgrilian_council.html?from=' + encodeURIComponent(triggeredFrom);
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    // Listen for messages from the iframe
    var messageHandler = function (event) {
      var data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'ZC_READY') {
        console.log('[ui] Zalgrilian Council ready, week', data.week);
        return;
      }

      if (data.type === 'ZC_OUTCOME') {
        window.removeEventListener('message', messageHandler);
        overlay.remove();
        applyZalgrilianCouncilOutcome(data);
      }
    };

    window.addEventListener('message', messageHandler);
  };

  // ============================================================
  // ZALGRILIAN COUNCIL — outcome handler
  // ============================================================
  function applyZalgrilianCouncilOutcome(data) {
    if (!st) return;

    var outcome = data.outcome || {};
    var band = outcome.band || 'narrow';
    var zmpSeats = outcome.zmpSeats || 0;
    var zmpPercent = outcome.zmpPercent || 0;
    var triggeredFrom = outcome.triggeredFrom || 'fast_putsch';

    var ending = buildCouncilEnding(
      band, zmpSeats, zmpPercent, triggeredFrom,
      outcome.finalPercentages, outcome.finalSeats
    );

    st.endingData = ending;
    st.finished = true;
    st.zcCompleted = true;
    st.zcOutcome = outcome;

    if (scene !== 'end') scene = 'end';
    renderAll();
  }

  

  function buildCouncilEnding(band, seats, percent, triggeredFrom, finalPercentages, finalSeats) {
    var fromFast = triggeredFrom === 'fast_putsch';
    var prefix = fromFast
      ? 'The King Putsch succeeded without bloodshed. The ordinary Council was dissolved, and the Zalgrilian Council was convened in its place.'
      : 'The civil war ended in a monarchist victory. The ordinary Council was abolished, and the Zalgrilian Council was convened in its place.';

    var commonDetail =
      '<div class="stat"><span>Final ZMP share</span><span class="v">' +
        percent + '%</span></div>' +
      '<div class="stat"><span>Final ZMP seats</span><span class="v">' +
        seats + ' / 45</span></div>';

    if (band === 'super') {
      return {
        ending: 'zc_super',
        title: 'The Crown Majority',
        subtitle: 'The ZMP dictates the constitution. The monarchy is settled.',
        endingNumber: 'Ending 60',
        body: prefix + ' The ZMP ended the session with a supermajority. It wrote the constitution alone.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held ' + seats + ' of the 45 seats — more than the historical record had ever produced. ' +
          'The convention was short. There was no need to negotiate, because there was nothing ' +
          'to negotiate with. Every clause came down as the ZMP wrote it. ' +
          'The constitution bore the ZMP\'s name in its preamble and its programme in every clause, ' +
          'and the King signed it in the courtyard where the Dzehurjaca Legion had once stood in ' +
          'the rain, and the whole thing was done.',
        subending: 'Subending ZA — The Crown Majority',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#5fae3c;font-weight:bold;">ZMP DICTATED</span></div>',
        epilogue:
          'The ZMP governed the Zalgrilian monarchy for two generations. The opposition never ' +
          'recovered. Every subsequent election returned the same result, and the country settled ' +
          'into a stable, prosperous, and quietly authoritarian peace.'
      };
    }

    if (band === 'strong') {
      return {
        ending: 'zc_strong',
        title: 'The Historical Result',
        subtitle: 'The ZMP finishes where history said it would. The constitution is theirs.',
        endingNumber: 'Ending 61',
        body: prefix + ' The ZMP finished with a strong majority, matching the historical record.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held ' + seats + ' of the 45 seats. The final percentage was ' + percent + '%. ' +
          'This was the record the textbooks had set down: 55%, 53%, 46%, 57%, 72%. ' +
          'The constitution that emerged was the historical constitution: a strong crown ' +
          'checked by a bicameral Council, universal male suffrage, the capital kept at its ' +
          'current seat, and Zalirian rights recognised in principle but not enshrined.',
        subending: 'Subending ZB — The Historical Result',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#5fae3c;font-weight:bold;">ZMP MAJORITY</span></div>',
        epilogue:
          'The ZMP governed for a generation. ZPF was absorbed in the fourth term. ZAP ' +
          'persisted as a permanent opposition of roughly 8%. RBMP and PLMS faded. ZEJ was ' +
          'banned and its members emigrated. The monarchy, once restored, endured.'
      };
    }

    if (band === 'narrow') {
      return {
        ending: 'zc_narrow',
        title: 'The Narrow Constitution',
        subtitle: 'The ZMP must compromise. The constitution is written in coalition.',
        endingNumber: 'Ending 62',
        body: prefix + ' The ZMP finished short of a majority. It had to negotiate the constitution.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held ' + seats + ' of the 45 seats — a plurality, but not a majority. ' +
          'The constitution that emerged was not the ZMP\'s. It was the price of coalition. ' +
          'The King signed it in the courtyard, and the Marshal was said to have read the text ' +
          'once and then set it down without comment.',
        subending: 'Subending ZC — The Narrow Constitution',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#ffcc00;font-weight:bold;">COMPROMISED</span></div>',
        epilogue:
          'The Zalgrilian monarchy survived, but as a constitutional monarchy with real limits. ' +
          'The ZMP governed in coalition with ZPF for twelve years before losing power to ' +
          'a ZAP-led government. The capital was eventually moved to Nezle in 1968.'
      };
    }

    if (band === 'opposition') {
      return {
        ending: 'zc_opposition',
        title: 'The Opposition Constitution',
        subtitle: 'The ZMP is reduced. ZPF and ZAP write the constitution between them.',
        endingNumber: 'Ending 63',
        body: prefix + ' The ZMP finished far below expectations. The opposition wrote the constitution.',
        story:
          'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
          'The ZMP held only ' + seats + ' of the 45 seats. The final percentage was ' + percent + '%. ' +
          'The ZPF and ZAP — mortal rivals at the first election — had consolidated into a single ' +
          'opposition bloc. When the convention opened, they wrote the constitution without ' +
          'consulting the ZMP. The crown was reduced to ceremony. The capital was moved to Nezle ' +
          'by decree. Zalirian rights were stripped to a schedule of limitations.',
        subending: 'Subending ZD — The Opposition Constitution',
        detail: commonDetail +
          '<div class="stat"><span>Constitution</span><span class="v" style="color:#ff6060;font-weight:bold;">OPPOSITION-WRITTEN</span></div>',
        epilogue:
          'The ZMP was confined to a permanent minority for two decades. The capital was moved ' +
          'to Nezle. Zalirian rights were systematically stripped over the following years. ' +
          'The party survived, but as an opposition rather than a governing force.'
      };
    }

    // collapsed
    return {
      ending: 'zc_collapsed',
      title: 'The Nezle Settlement',
      subtitle: 'The ZMP is destroyed. ZAP writes the constitution and moves the capital.',
      endingNumber: 'Ending 64',
      body: prefix + ' The ZMP collapsed. ZAP dictated the constitution.',
      story:
        'Twenty weeks after the first election, the Zalgrilian Council sat for the last time. ' +
        'The ZMP held only ' + seats + ' of the 45 seats. The final percentage was ' + percent + '%. ' +
        'ZAP had grown from a small centrist alternative into the dominant party of the new regime. ' +
        'The capital was moved to Nezle. Zalirian rights were abolished outright. The ZMP was ' +
        'dissolved by decree. The King signed the constitution in Nezle, and the old capital ' +
        'became a provincial backwater. The Zalgrilian monarchy survived in name. ' +
        'It did not survive in substance.',
      subending: 'Subending ZE — The Nezle Settlement',
      detail: commonDetail +
        '<div class="stat"><span>Constitution</span><span class="v" style="color:#cc0000;font-weight:bold;">ZAP DICTATED</span></div>',
      epilogue:
        'The ZMP was banned. Its leaders were imprisoned. The capital moved to Nezle in the ' +
        'spring. By the time a new ZMP formed — in exile, in the 1990s — the country had been ' +
        'governed by ZAP or its successors for half a century.'
    };
  }

    // ---- Helpers required by zalgrilia.js and other UI extensions ----
  api.getState = function () { return st; };
  api.getScene = function () { return scene; };
  api.setScene = function (s) { scene = s; pending = null; };
  api.render   = function () { renderAll(); };
  api.escape   = esc;
  api.toast    = toast;



  return api;
})();

document.addEventListener('DOMContentLoaded', function () {
  UI.boot();
});