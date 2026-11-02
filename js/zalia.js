// zalgrilia.js — Kapp-style standoff UI for the ZALGRILIANIST faction.
// Turn-based. Renders inline in #main using the same panel/button style
// as viewWeek(). No iframe.
(function () {
  'use strict';

  if (!window.UI)           { console.warn('zalgrilia.js: UI missing.'); return; }
  if (!window.KingMinigame) { console.warn('zalgrilia.js: KingMinigame missing.'); return; }

  var UI = window.UI;
  var KM = window.KingMinigame;
  var kingGame = null;

  // ============================================================
  // Music
  // ============================================================
  var kingAudioEl = null;
  function playKingMusic(filename) {
    try {
      stopKingMusic();
      kingAudioEl = new Audio('js/' + filename);
      kingAudioEl.volume = 0.6;
      kingAudioEl.loop = true;
      kingAudioEl.play().catch(function(err){ console.warn('Autoplay blocked:', err); });
    } catch (e) { console.warn('Audio failed:', e); }
  }
  function stopKingMusic() {
    if (kingAudioEl) {
      try { kingAudioEl.pause(); kingAudioEl.currentTime = 0; } catch (e) {}
      kingAudioEl = null;
    }
  }

  function isZalgrilianist(st) {
    if (!st || !st.faction) return false;
    if (st.faction === 'zalgrilian') return true;
    var D = window.GameData;
    if (D && D.FACTIONS) {
      for (var i = 0; i < D.FACTIONS.length; i++) {
        if (D.FACTIONS[i].id === st.faction) return D.FACTIONS[i].id === 'zalgrilian';
      }
    }
    return false;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ============================================================
  // ENTRY
  // ============================================================
  UI.canStartKingMinigame = function () {
    var st = UI.getState ? UI.getState() : null;
    if (!st || !isZalgrilianist(st)) return false;
    return !!(st.king && st.king.active);
  };

  UI.startKingMinigame = function () {
    var st = UI.getState ? UI.getState() : null;
    if (!st || !isZalgrilianist(st)) return;
    if (!st.king || !st.king.active) return;

    kingGame = KM.newGame(st);

    playKingMusic('eins.mp3');

    // Enter the scene — ui.js's renderMain already routes scene 'king'
    // to UI.viewKing().
    if (typeof UI.setScene === 'function') UI.setScene('king');
    if (typeof UI.render   === 'function') UI.render();
  };

  // ============================================================
  // TURN HANDLER — called from button onclick
  // ============================================================
  UI.kingAction = function (orderId) {
    if (!kingGame) return;
    if (kingGame.phase === 'resolved') {
      // Aftermath — advance to ending
      finishKingMinigame();
      return;
    }
    if (kingGame.phase !== 'legion_turn') return;

    var st = UI.getState ? UI.getState() : null;
    var rng = st && st.rng ? st.rng : Math.random;

    // Pick crowd order
    var crowdOrderId = KM.pickCrowdOrder(kingGame, rng);

    // Store for the turn record
    kingGame.lastLegionOrder = orderId;
    kingGame.lastCrowdOrder  = crowdOrderId;

    // Resolve
    var result = KM.resolveTurn(kingGame, orderId, crowdOrderId, rng);

    // Re-render
    if (typeof UI.render === 'function') UI.render();

    // If the turn ended the standoff, don't auto-transition — let the
    // player read the aftermath and press Continue.
    if (result && result.ended) {
      stopKingMusic();
    }
  };

  // ============================================================
  // VIEW — rendered into #main
  // ============================================================
  UI.viewKing = function () {
    if (!kingGame) {
      return '<h2 class="scene-title">The Parking Lot</h2>' +
        '<p class="lead">No standoff is in progress.</p>' +
        '<div class="btn-row"><button class="btn" onclick="UI.setScene(\'week\');UI.render()">Back</button></div>';
    }

    var g = kingGame;
    var html = '';

    // ---- Header ----
    html += '<h2 class="scene-title">The Parking Lot</h2>';
    html += '<p class="quiet">Beat <b>' + g.beatNumber + '</b> of ' + g.beatsTotal + '. ' +
            'The Legion holds the Council Chamber. The crowd holds the asphalt.</p>';

    // ---- Two-sided status ----
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0;">';

    // Legion
    var legionColor = g.legionCohesion > 60 ? '#5fae3c'
                    : g.legionCohesion > 30 ? '#ffcc00'
                    : '#cc0000';
    html += '<div class="result-box" style="border-left:4px solid #2a7a2a;padding:12px;">';
    html += '<div style="font-weight:700;color:#7fdf7f;margin-bottom:6px;">DZEHURJACA LEGION</div>';
    html += '<div class="stat sub"><span>Men</span><span class="v">' + g.legionSize + '</span></div>';
    html += '<div class="stat sub"><span>Morale</span><span class="v">' + Math.round(g.legionMorale) + '%</span></div>';
    html += '<div class="stat sub"><span>Cohesion</span><span class="v" style="color:' + legionColor + ';">' + Math.round(g.legionCohesion) + '%</span></div>';
    html += '<div class="stat sub"><span>Loyalty</span><span class="v">' + Math.round(g.legionLoyalty) + '%</span></div>';
    if (g.legionLine !== 0) {
      html += '<div class="stat sub"><span>Line</span><span class="v">' +
        (g.legionLine > 0 ? 'advanced ' + g.legionLine : 'withdrawn ' + Math.abs(g.legionLine)) + '</span></div>';
    }
    html += '</div>';

    // Crowd
    var pressureColor = g.crowdPressure > 70 ? '#cc0000'
                      : g.crowdPressure > 45 ? '#ffcc00'
                      : '#5fae3c';
    html += '<div class="result-box" style="border-left:4px solid #cc0000;padding:12px;">';
    html += '<div style="font-weight:700;color:#ff7070;margin-bottom:6px;">THE CROWD</div>';
    html += '<div class="stat sub"><span>Protestors</span><span class="v">' + g.crowdSize + '</span></div>';
    html += '<div class="stat sub"><span>Pressure</span><span class="v" style="color:' + pressureColor + ';">' + Math.round(g.crowdPressure) + '%</span></div>';
    html += '<div class="stat sub"><span>Injuries</span><span class="v">' + g.injuries + '</span></div>';
    html += '<div class="stat sub"><span>Sound truck</span><span class="v">' +
      (g.soundTruckSeized ? 'silent' : g.soundTruckPlaying ? 'playing' : '—') + '</span></div>';
    html += '</div>';

    html += '</div>'; // grid

    // ---- Progress bars ----
    html += '<div class="result-box" style="padding:10px 14px;">';
    html += '<div class="stat sub"><span>Crowd pressure → surge at ' + KM.CFG.surgeThreshold + '</span>' +
      '<span class="v">' + Math.round(g.crowdPressure) + '</span></div>';
    html += '<div class="meter" style="height:6px;"><i style="width:' +
      Math.min(100, (g.crowdPressure / KM.CFG.surgeThreshold) * 100) + '%;background:' + pressureColor + ';"></i></div>';
    html += '<div class="stat sub" style="margin-top:8px;"><span>Legion cohesion → collapse at ' + KM.CFG.cohesionCollapse + '</span>' +
      '<span class="v">' + Math.round(g.legionCohesion) + '</span></div>';
    html += '<div class="meter" style="height:6px;"><i style="width:' +
      Math.min(100, (g.legionCohesion / 100) * 100) + '%;background:' + legionColor + ';"></i></div>';
    html += '</div>';

    // ---- Last turn resolution ----
    if (g.lastResolution) {
      html += '<div class="result-box" style="margin:12px 0;padding:12px;background:rgba(0,0,0,0.25);">';
      html += '<div class="hud-label" style="font-size:0.75rem;letter-spacing:1.5px;text-transform:uppercase;color:#888;margin-bottom:6px;">' +
        'Beat ' + g.lastResolution.beat + ' — resolution</div>';
      for (var i = 0; i < g.lastResolution.legionLog.length; i++) {
        html += '<div style="font-size:0.9rem;color:#a8d8a8;">▸ ' + esc(g.lastResolution.legionLog[i]) + '</div>';
      }
      for (var j = 0; j < g.lastResolution.crowdLog.length; j++) {
        html += '<div style="font-size:0.9rem;color:#e0a0a0;">▸ ' + esc(g.lastResolution.crowdLog[j]) + '</div>';
      }
      html += '</div>';
    }

    // ---- Orders or Aftermath ----
    if (g.phase === 'resolved' && g.result) {
      html += renderAftermath(g);
    } else {
      // Which side am I playing?
      var mySide = 'legion';  // SP default
      if (window.UIMP && window.EngineMP && window.Multiplayer) {
        var mst = window.EngineMP.getState && window.EngineMP.getState();
        var mcfg = mst && mst.players;
        if (mcfg) {
          var isHost = window.Multiplayer.amHost && window.Multiplayer.amHost();
          var idx = isHost ? 0 : 1;
          var myFid = mcfg[idx] && mcfg[idx].factionId;
          mySide = (myFid === 'BL') ? 'crowd' : 'legion';
        }
      }

      var orders = (mySide === 'legion') ? KM.LEGION_ORDERS : KM.CROWD_ORDERS;
      var label  = (mySide === 'legion') ? 'Legion Orders' : 'Crowd Orders';

      html += '<h3 style="margin-top:8px;">' + label + '</h3>';
      html += '<div class="act-grid">';
      for (var k = 0; k < orders.length; k++) {
        var o = orders[k];
        var disabled = g.phase !== 'legion_turn';
        html += '<button class="act" ' + (disabled ? 'disabled' : '') +
          ' onclick="UI.kingAction(\'' + o.id + '\')">' +
          '<b>' + esc(o.name) + '</b>' +
          '<span class="d">' + esc(o.desc) + '</span>' +
          '</button>';
      }
      html += '</div>';
    }

    return html;
  };

  function renderAftermath(g) {
    var r = g.result;
    var html = '';

    html += '<div class="result-box" style="border:3px solid #ffd700;background:rgba(255,215,0,0.06);padding:16px;margin:16px 0;text-align:center;">';
    html += '<h3 style="color:#ffd700;letter-spacing:2px;margin:0 0 8px 0;">THE STANDOFF IS OVER</h3>';

    var summary = '';
    if (r.outcome === 'peaceful') {
      summary = 'The crowd has gone home. The Legion held the building.';
    } else if (r.outcome === 'surge') {
      summary = r._legionDisbanded
        ? 'The Legion has dissolved. The Council Chamber stands open.'
        : 'The crowd has broken through. The Legion was pushed back.';
    } else if (r.outcome === 'legion_refused') {
      summary = 'The Marshal gave the order. The Legion did not obey.';
    } else if (r.outcome === 'fired_on_crowd') {
      summary = 'The Legion fired into the crowd. It is over.';
    } else if (r.outcome === 'injured') {
      summary = 'The crowd dispersed. Some were hospitalised. The Legion held.';
    } else {
      summary = 'The standoff is over.';
    }
    html += '<p style="color:#ddd;">' + esc(summary) + '</p>';

    html += '<div class="btn-row" style="margin-top:14px;justify-content:center;">';
    html += '<button class="btn" onclick="UI.kingAction(\'__finish\')" style="font-size:1.05rem;padding:12px 36px;">See the Aftermath</button>';
    html += '</div>';
    html += '</div>';

    return html;
  }

  // ============================================================
  // FINISH — hands off to the ending resolver
  // ============================================================
  function finishKingMinigame() {
    stopKingMusic();

    var g = kingGame;
    if (!g || !g.result) return;

    var st = UI.getState ? UI.getState() : null;
    if (!st) return;

    var endingData = buildEnding(g, st);
    if (!endingData) return;

    // Offer the Zalgrilian Council for the two victory branches
    var offerCouncil = false;
    if (g.result.outcome === 'peaceful') {
      offerCouncil = true;
      st.zcTriggeredFrom = 'fast_putsch';
    }

    if (offerCouncil && typeof UI.startZalgrilianCouncil === 'function') {
      st._pendingCouncilOffer = {
        triggeredFrom: st.zcTriggeredFrom,
        endingData: endingData
      };
    }

    st.finished = true;
    st.endingData = endingData;
    if (st.king) {
      st.king.minigameResult = g.result;
      st.king.active = false;
    }

    kingGame = null;

    if (typeof UI.setScene === 'function') UI.setScene('end');
    if (typeof UI.render   === 'function') UI.render();

    if (st._pendingCouncilOffer) {
      setTimeout(function () { showCouncilOffer(); }, 800);
    }
  }

  // ============================================================
  // ENDING TABLE — same endings as before, driven by the new outcomes
  // ============================================================
  function buildEnding(g, st) {
    var outcome = g.result.outcome;
    var beats = g.result.beats;
    var injuries = g.result.injuries || 0;
    var warningShot = g.result.warningShotFired || false;
    var legionSize = g.legionSize;

    if (outcome === 'peaceful') {
      return {
        ending: 'zalgrilian_king_victory',
        title: 'The Crown Holds',
        subtitle: 'The crowd went home. The Legion held the building. The monarchy is restored.',
        endingNumber: 'Ending 34',
        body: 'The occupation succeeded. The crowd dispersed. The crown is restored.',
        story:
          'It ended the way the Marshal had always said it would end: not with a battle, but with ' +
          'a decision. On the seventh day, the crowd in the parking lot looked around and realized ' +
          'that there were fewer of them than there had been on the first day, and that the ones ' +
          'who remained were tired, and that the Legion was still standing exactly where it had ' +
          'been standing since Monday, and that nothing had changed. The first to leave was a girl ' +
          'in a red jacket who had helped organize the food runs. She walked out of the parking lot ' +
          'at 4:15 in the afternoon, and nobody stopped her, and nobody called her a traitor. The ' +
          'second to leave was a boy who had been standing near the front of the crowd, close ' +
          'enough to see the Legion\'s faces. He left at 4:30. By 5:00, half the crowd was gone. ' +
          'By 6:00, there were forty people left. By 7:00, there were twelve. By 8:00, there was ' +
          'nobody. ' +
          'The Legion did not move. The Marshal did not speak. The occupation simply continued, ' +
          'because there was no longer anyone to oppose it.',
        subending: 'Subending AH — The Crown Holds',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Legion morale</span><span class="v">' + Math.round(g.legionMorale) + '%</span></div>' +
          '<div class="stat"><span>Legion cohesion</span><span class="v">' + Math.round(g.legionCohesion) + '%</span></div>' +
          '<div class="stat"><span>Crowd pressure at end</span><span class="v">' + Math.round(g.crowdPressure) + '%</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">None</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#5fae3c;font-weight:bold;">MONARCHIST VICTORY</span></div>',
        epilogue:
          'The crown held the building, and then it held the school. The Marshal became a ' +
          'legend. The Legion became an institution. The King Putsch became a founding myth.'
      };
    }

    if (outcome === 'legion_refused') {
      return {
        ending: 'zalgrilian_king_legion_refused',
        title: 'The Order They Would Not Obey',
        subtitle: 'The Legion lowered its rifles. The Marshal walked back alone.',
        endingNumber: 'Ending 35',
        body: 'The Marshal gave the order. The Legion did not obey. The crown fell.',
        story:
          'The first thing anyone remembered afterward was the sound of the rifles coming down. ' +
          'Not dropping — lowering, deliberately, the way you put down something you have decided ' +
          'not to use. Forty men in green jackets, standing in a line on the wet asphalt, and ' +
          'every single one of them had made the same decision at the same moment without a word ' +
          'being spoken. ' +
          'The Marshal saw it happen. He was standing at the loading dock with his hands behind ' +
          'his back, and he watched his Legion refuse to fire on a crowd of students, and he did ' +
          'not shout, and he did not repeat the order.',
        subending: 'Subending AG — The Order They Would Not Obey',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Legion loyalty</span><span class="v">' + Math.round(g.legionLoyalty) + '%</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">None</span></div>' +
          '<div class="stat"><span>Warning shots fired</span><span class="v">' + (warningShot ? 'Yes' : 'No') + '</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">DEFEAT</span></div>',
        epilogue:
          'The Legion held the building for six days and then went home. The Marshal disappeared. ' +
          'The crown was not restored. And for the rest of their lives, every man who had stood ' +
          'in that line on the asphalt would be asked the same question: "What was it like?"'
      };
    }

    if (outcome === 'injured') {
      return {
        ending: 'zalgrilian_king_injured',
        title: 'The Eleventh Minute',
        subtitle: 'The crowd dispersed. Some were hospitalised. The crown held — but at a cost.',
        endingNumber: 'Ending 36',
        body: 'The Legion moved on the crowd. It was not clean. It was never going to be clean.',
        story:
          'It took eleven minutes. The Legion advanced in a line, shoulder to shoulder, exactly ' +
          'as they had been trained. The crowd fell back at first, then stopped falling back, then ' +
          'started pushing forward again. Somebody threw a bottle. Then somebody threw a baton. ' +
          'Then the line broke. ' +
          'The Legion did not fire. That was the thing everyone would remember afterward. Forty ' +
          'men with rifles, and not one of them pulled a trigger. They used their hands, their ' +
          'boots, the butts of their rifles. There were injuries. There were broken bones. And ' +
          'there was a girl of sixteen with a fractured skull who would spend three days in ' +
          'hospital and would never attend another protest.',
        subending: 'Subending AI — The Eleventh Minute',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">' + injuries + '</span></div>' +
          '<div class="stat"><span>Warning shots fired</span><span class="v">' + (warningShot ? 'Yes' : 'No') + '</span></div>' +
          '<div class="stat"><span>Legion morale</span><span class="v">' + Math.round(g.legionMorale) + '%</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#ffcc00;font-weight:bold;">PYRRHIC VICTORY</span></div>',
        epilogue:
          'The crown held the building for three more years. It never held anything else.'
      };
    }

    if (outcome === 'fired_on_crowd') {
      return {
        ending: 'zalgrilian_king_fired_on_crowd',
        title: 'The Shots Heard in the Parking Lot',
        subtitle: 'The Legion fired. Then it fired again. The crowd dispersed. The school did not.',
        endingNumber: 'Ending 37',
        body: 'The Legion fired on the crowd. There were casualties. The occupation ended in blood.',
        story:
          'At 19:04 the Marshal gave the order to advance. At 19:06 the first shot was fired into ' +
          'the air. At 19:07 the second shot was fired into the air. At 19:09 a third shot was ' +
          'fired, and it was not fired into the air. ' +
          'Nobody ever established who fired it. The Legion\'s official report said it was an ' +
          'accidental discharge during a struggle. The students who were there said it was ' +
          'deliberate. The truth was probably somewhere in between, which is where the truth ' +
          'usually is.',
        subending: 'Subending AK — The Shots',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">' + injuries + '</span></div>' +
          '<div class="stat"><span>Warning shots fired</span><span class="v">' + (warningShot ? 'Yes' : 'No') + '</span></div>' +
          '<div class="stat"><span>Legion loyalty</span><span class="v">' + Math.round(g.legionLoyalty) + '%</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">CATASTROPHE</span></div>',
        epilogue:
          'The Marshal was never charged. He had followed orders. The orders had been lawful. ' +
          'The law, as it turned out, had very little to say about what had happened in that ' +
          'parking lot.'
      };
    }

    // surge (crowd broke through OR legion disbanded)
    return {
      ending: 'zalgrilian_king_surge',
      title: g.result._legionDisbanded
        ? 'The Legion Went Home'
        : 'The Crowd Broke Through',
      subtitle: g.result._legionDisbanded
        ? 'The Legion dissolved before dawn. There was no fight.'
        : 'The Legion was overwhelmed. The occupation collapsed. The crown fell.',
      endingNumber: 'Ending 38',
      body: g.result._legionDisbanded
        ? 'The Legion dispersed on its own. The occupation was over without a shot.'
        : 'The crowd pushed through the Legion line. The occupation was over.',
      story: g.result._legionDisbanded
        ? 'The officers met at 04:00 and voted. By 06:00 the men were packing their kit. ' +
          'By 08:00 the Council Chamber was empty. Nobody knew exactly why it happened, and ' +
          'nobody asked. The Legion had ended itself, and that was that.'
        : 'It happened at 18:47, which was earlier than anyone had expected. The Legion had ' +
          'been holding for six days. The crowd had been growing for six days. And then, all ' +
          'at once, the line broke. The Legion did not fire. Forty men with rifles, and not ' +
          'one of them pulled a trigger. They stood their ground for as long as they could, ' +
          'and then they stepped aside.',
      subending: 'Subending AL — The Break',
      detail:
        '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
        '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
        '<div class="stat"><span>Legion cohesion at end</span><span class="v">' + Math.round(g.legionCohesion) + '%</span></div>' +
        '<div class="stat"><span>Crowd pressure at end</span><span class="v">' + Math.round(g.crowdPressure) + '%</span></div>' +
        '<div class="stat"><span>Injuries</span><span class="v">' + injuries + '</span></div>' +
        '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">DEFEAT</span></div>',
      epilogue:
        'The Legion held the building for six days and then went home. The Marshal resigned. ' +
        'The crown was dissolved. And the parking lot was repaved in the spring and never ' +
        'mentioned again.'
    };
  }

  // ============================================================
  // COUNCIL OFFER (unchanged)
  // ============================================================
  function showCouncilOffer() {
    var st = UI.getState ? UI.getState() : null;
    if (!st || !st._pendingCouncilOffer) return;

    var overlay = document.createElement('div');
    overlay.id = 'zc-offer-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.88);' +
      'display:flex;align-items:center;justify-content:center;' +
      'z-index:2000;font-family:monospace;';

    var isFast = st._pendingCouncilOffer.triggeredFrom === 'fast_putsch';
    var heading = isFast ? 'THE CROWN HOLDS' : 'THE MONARCHY PREVAILS';
    var sub = isFast
      ? 'The putsch has succeeded. The Council has been dissolved. The King will convene the Zalgrilian Council in its place.'
      : 'The civil war has ended. The monarchy has won. The ordinary Council is abolished. The King will convene the Zalgrilian Council.';

    overlay.innerHTML =
      '<div style="max-width:620px;padding:36px 44px;background:#14181f;' +
      'border:2px solid #7fdcff;border-radius:8px;color:#d8e8f0;text-align:center;">' +
        '<h1 style="color:#7fdcff;margin:0 0 8px 0;font-size:20px;' +
        'letter-spacing:3px;text-transform:uppercase;">' + heading + '</h1>' +
        '<p style="color:#b8c8d8;font-size:13px;line-height:1.7;margin:16px 0 24px 0;">' + sub + '</p>' +
        '<p style="color:#7fdf7f;font-size:14px;font-weight:700;margin:0 0 24px 0;">' +
          'The first Zalgrilian Council election will be held in week 1.' +
        '</p>' +
        '<button id="zc-offer-launch" style="padding:14px 40px;font-size:14px;' +
        'background:#1a3520;color:#d8e8f0;border:1px solid #4a7a4a;border-radius:4px;' +
        'font-family:inherit;font-weight:700;letter-spacing:2px;cursor:pointer;' +
        'text-transform:uppercase;margin-right:10px;">Play On</button>' +
        '<button id="zc-offer-skip" style="padding:14px 30px;font-size:13px;' +
        'background:#252525;color:#b8c8d8;border:1px solid #555;border-radius:4px;' +
        'font-family:inherit;letter-spacing:1.5px;cursor:pointer;' +
        'text-transform:uppercase;">End Here</button>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('zc-offer-launch').onclick = function () {
      overlay.remove();
      st._pendingCouncilOffer = null;
      if (typeof UI.startZalgrilianCouncil === 'function') {
        UI.startZalgrilianCouncil({ triggeredFrom: st.zcTriggeredFrom });
      }
    };
    document.getElementById('zc-offer-skip').onclick = function () {
      overlay.remove();
      st._pendingCouncilOffer = null;
    };
  }
})();