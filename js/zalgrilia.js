// zalgrilia.js — Kapp-style standoff UI for the ZALGRILIANIST faction ONLY.
// Uses a full-screen 3D iframe (king3d.html) for the minigame.
(function () {
  'use strict';

  if (!window.UI)           { console.warn('zalgrilia.js: UI missing.'); return; }
  if (!window.KingMinigame) { console.warn('zalgrilia.js: KingMinigame missing.'); return; }

  var UI = window.UI;
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

  // ============================================================
  // Public API
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

    kingGame = window.KingMinigame.newGame(st);
    kingGame.phase = 'active';

    playKingMusic('eins.mp3');

    // Open the 3D iframe
    openKingIframe();
  };

  // ============================================================
  // IFRAME OVERLAY
  // ============================================================
  function openKingIframe() {
    // Create overlay
    var overlay = document.createElement('div');
    overlay.id = 'king-3d-overlay';
    overlay.style.cssText = [
      'position:fixed','top:0','left:0','width:100vw','height:100vh',
      'background:#000','z-index:9999','display:flex','flex-direction:column'
    ].join(';');

    // Close button (for debugging / escape)
    

    // Iframe
    var iframe = document.createElement('iframe');
    iframe.src = 'king.html';
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    overlay.appendChild(iframe);

    document.body.appendChild(overlay);

    // Listen for result from iframe
    window.addEventListener('message', onMessage);
  }

  function onMessage(event) {
    var data = event.data;
    if (!data || data.type !== 'KING_RESULT') return;

    // Remove the overlay
    var overlay = document.getElementById('king-3d-overlay');
    if (overlay) overlay.remove();
    window.removeEventListener('message', onMessage);
    stopKingMusic();

    // Apply the result from the 3D scene to the kingGame object
    if (kingGame) {
      kingGame.beatNumber    = data.beats;
      kingGame.injuries      = data.injuries;
      kingGame.warningShotFired = data.warningShotFired;
      kingGame.legionLoyalty = data.legionLoyalty;
      kingGame.legionMorale  = data.legionMorale;
      kingGame.legionCohesion= data.legionCohesion;
      kingGame.crowdPressure = data.crowdPressure;
      kingGame.legionSize    = data.legionSize;
      kingGame.phase         = 'resolved';
      kingGame.result = {
        outcome: data.outcome,
        beats: data.beats,
        injuries: data.injuries,
        warningShotFired: data.warningShotFired,
        soundTruckSeized: data.soundTruckSeized || false,
        radioUsed: data.radioUsed || false
      };
    }

    // Trigger the ending resolver (which calls UI.setScene('end'))
    showkingResult();
  }

  // ============================================================
  // Resolution -> ending
  // ============================================================

  function showkingResult() {
    stopKingMusic();

    var g = kingGame;
    if (!g || !g.result) return;

    var st = UI.getState ? UI.getState() : null;
    if (!st) return;

    var outcome = g.result.outcome;
    var endingData = null;
    var legionSize = g.legionSize;
    var beats = g.result.beats;
    var injuries = g.result.injuries || 0;
    var warningShot = g.result.warningShotFired || false;

    // =========================================================
    // ENDING 34: MONARCHIST VICTORY — THE CROWN HOLDS
    // =========================================================
        if (outcome === 'peaceful') {
      endingData = {
        ending: 'zalgrilian_king_victory',
        title: 'The Crown Holds',
        subtitle: 'The crowd went home. The Legion held the building. The monarchy is restored.',
        endingNumber: 'Ending 34',
        body: 'The occupation succeeded. The crowd dispersed. The crown is restored.',
        story:
          '<span class="party-red">The Protestors</span> ' +
          'went home after a few days as they could not break <span class="party-zmp"> our defense </span> ' +
          'the council was <span class="party-zmp"> saved </span> ' +
          'Monarchy that was established was not absolute just yet ' +
          'Words of <span class="ro16"> leaders of 16th </span> proved true ' +
          'the ZMP was never democratic party ' +
          'but yet a road to establish another <span class="party-iia">dictatorship</span> ' +
          'but this one was independent not influenced by <span class="party-iia"> United </span> <span class="party-red"> States </span> <span class="white"> of America </span> ' +
          'The <span class="party-zmp"> new monarchy</span> ' +
          'Grew into a pollar of neutral powers being in opposition to both West and the East ' +
          'The monarchy survived it all <span class="party-iia"> The CIA coups</span> <span class="party-red"> KGB ones</span> <span class="pride"> Mossad ones </span> ' +
          'There was never a goverment in exile, ' +
          'So <span class="party-zmp"> Zalgrilian government </span> ' +
          'was the only one legitimate ' +
          'as it was only one existing ' +
          'In the end it ' +
          'was over, and the crown had won. ' +
          'The other parties grew into opposing blocks preparing <span class="party-ro16"> a new revolution </span> ' +
          'Two years into our rule with <span class="party-iia">European help</span>. ' +
          'They tried to owerthrow us, ' +
          'their revolution fell. ' +
          'Not beacuse <span class="party-zmp"> we </span> were strong ' +
          'but yet beacuse Europe tried to keep their involment covered up ' +
          'Ahmad VI was crowned king of this monarchy ' +
          'For now it is time to end transitional government and to see if this monarchy will be <span class="party-zmp"> constitutional </span> or <span class="party-zpf"> absolute </span> ',
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
          'In the end protestors had no chance ' +
          'beacuse they needed to stop a dictatorship ' +
          'And you do not pull out <span class="party-red"> fires </span> with <span class="party-iia"> free elections </span>. They missed their only chance. But now it is time to see who will rule <span class="party-zpf">king </span> or <span class="party-zmp"> the parlianment </span> ' 
      };
    }

    // =========================================================
    // ENDING 35: LEGION REFUSED TO FIRE — DEFEAT
    // =========================================================
    else if (outcome === 'legion_refused') {
      endingData = {
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
          'not shout, and he did not repeat the order, and he did not walk down the line to find ' +
          'out which man had started it. He simply turned around and walked back into the loading ' +
          'dock, and the metal door closed behind him, and that was the end of the King Putsch. ' +
          'The crowd did not cheer. That was the strange part. They had spent six days being told ' +
          'that the Legion would shoot them if it came to it, and now the Legion had declined to ' +
          'shoot them, and nobody knew what to do with that. They stood in the parking lot in ' +
          'their jackets and watched the soldiers walk away, rifles still slung across their ' +
          'backs, and then somebody started clapping, and then everybody was clapping, and it ' +
          'was not a triumphant sound. It was the sound of people who had been very frightened ' +
          'and were now very tired. ' +
          'By midnight the Council had reconvened in the Council Chamber. The ZMP headquarters ' +
          'was empty. The Marshal was not there. His office was clean — not ransacked, not ' +
          'abandoned, just clean, as if he had tidied up before leaving. On his desk was a ' +
          'single sheet of paper with a handwritten note: "The Legion was never mine. It was ' +
          'theirs. I only borrowed it." ' +
          'The note was read aloud at the Council session. Nobody knew what to make of it. The ' +
          'Marshal had spent two years building the Dzehurjaca Legion, recruiting its officers, ' +
          'writing its training manuals, walking its line at every school event, and now he was ' +
          'claiming, in eight words, that the thing had never been his. Some of the Council ' +
          'found this self-serving. Some found it honest. Most found it a distinction without ' +
          'a difference, because the Legion was gone either way, and the Marshal was gone ' +
          'either way, and what was left was a school in a valley that had just been through ' +
          'something it did not yet have the words for. ' +
          'The Legion itself dissolved quietly. There was no formal disbandment ceremony. The ' +
          'men simply stopped showing up. The officer who had been second-in-command packed his ' +
          'things into a canvas bag and drove north, to a city where he had a cousin, and took ' +
          'a job at a warehouse, and never spoke about the Putsch to anyone. He would die at ' +
          'seventy-six, of a stroke, in a hospital bed, and his last words — according to the ' +
          'nurse who was standing nearby — were the name of the school, and then nothing. ' +
          'The Marshal was not seen again for eleven years. When he finally reappeared, it was ' +
          'as a guest lecturer at a university three hundred kilometres away, teaching a course ' +
          'on "the ethics of command." The syllabus was three pages long. The reading list ' +
          'included Clausewitz, and Thucydides, and a thin pamphlet on the moral limits of ' +
          'obedience that had been published in the 1950s and had gone out of print. Nobody in ' +
          'the audience knew who he was. He introduced himself by a first name and a surname ' +
          'that were not the ones he had used at the school. He was, by all accounts, a good ' +
          'teacher. He was not a warm one. ' +
          'In the fourth week of the course, a student asked him about the King Putsch. The ' +
          'student had done the reading and had gotten curious, and the question was careful ' +
          'and respectful and had clearly been rehearsed. The Marshal listened to the whole ' +
          'question without interrupting. And then he said, "I was not there." Which was a lie, ' +
          'and everybody in the room knew it was a lie, and the student who had asked the ' +
          'question went red, and the lecture continued, and that was the end of the matter. ' +
          'The Dzehurjaca Legion was formally dissolved the following Monday. Most of its ' +
          'members returned to their ordinary lives. Two of them ran for student council the ' +
          'next year and lost. One of them became a teacher. One of them became a nurse. One ' +
          'of them — the youngest, a boy of nineteen who had been in the line for six days and ' +
          'had been the first to lower his rifle — eventually became a professor of ' +
          'constitutional law, and taught a seminar on the limits of executive authority that ' +
          'was legendary for its difficulty. He never told his students why he had chosen the ' +
          'subject. He did not need to. ' +
          'And every year, on the anniversary of the day the rifles came down, a small group ' +
          'of former Legionnaires met in a diner across town and drank coffee and did not talk ' +
          'about it. The meeting was never announced. There was no list. Whoever remembered ' +
          'showed up. They sat at the same booth. They ordered the same thing. And when the ' +
          'cups were empty, they left, one at a time, and went home.',
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
          'The crown was not restored. The school returned to its ordinary rhythms. And for the ' +
          'rest of their lives, every man who had stood in that line on the asphalt would be ' +
          'asked the same question by people who had not been there: "What was it like?" And ' +
          'they would all give the same answer: "It was quiet. And then it was over."'
      };
    }

    // =========================================================
    // ENDING 36: INJURED — PYRRHIC VICTORY
    // =========================================================
        else if (outcome === 'injured') {
      endingData = {
        ending: 'zalgrilian_king_injured',
        title: 'The Eleventh Minute',
        subtitle: 'The crowd dispersed. Some were hospitalised. The crown held — but at a cost.',
        endingNumber: 'Ending 36',
        body: 'The Legion moved on the crowd. It was not clean. It was never going to be clean.',
        story:
          'It took eleven minutes. ' +
          'The Legion advanced in a line, shoulder to shoulder, exactly as they had been trained. ' +
          'The crowd fell back at first, then stopped falling back, then started pushing forward ' +
          'again. For a long moment — the longest moment of the Marshal\'s life, though he would ' +
          'never say so — the two sides stood close enough to touch, and nobody did anything. ' +
          'Then somebody threw a bottle. Then somebody threw a baton. Then the line broke, and ' +
          'it was not a battle, exactly, because neither side was armed for a battle. It was ' +
          'something older and uglier: a brawl between people who knew each other\'s names. ' +
          'The Legion did not fire. That was the thing everyone would remember afterward. Forty ' +
          'men with rifles, and not one of them pulled a trigger. They used their hands, their ' +
          'boots, the butts of their rifles. They used the training they had been given, and the ' +
          'training was for this — for dispersing a crowd, not for killing one — and so there ' +
          'were injuries, and there were broken bones, and there was a girl of sixteen with a ' +
          'fractured skull who would spend three days in hospital and would never attend another ' +
          'protest, not because she was afraid, but because she had decided that she had already ' +
          'given enough. ' +
          'Her name was Ana Kovač. She was the younger sister of one of the crowd\'s organizers. ' +
          'The bottle that started the fight had not been thrown by her, and she had not thrown ' +
          'anything herself, and when the line broke she had tried to step backward and had been ' +
          'caught in the surge of people behind her and had fallen, and a boot had come down on ' +
          'the side of her head, and that was that. She was unconscious for four hours. When she ' +
          'woke up in the hospital, her mother was sitting beside the bed, and the first thing ' +
          'she said was, "Did we win?" And her mother said, "What?" And Ana said, "Did we win?" ' +
          'And her mother, who did not know, and who had spent the whole day not knowing, said, ' +
          '"I don\'t think that\'s the question." ' +
          'The Legion stood in the parking lot for another hour after the crowd dispersed. ' +
          'Somebody had brought a stretcher, and the four or five worst-injured were carried to ' +
          'the school nurse\'s office, which had been turned into a triage room by the ' +
          'school\'s physician, who had volunteered when the news reached him. The Marshal ' +
          'walked down the row of his men and stopped in front of each one and said nothing. ' +
          'There was nothing to say. The Legion was still a Legion, and the men were still men, ' +
          'and the parking lot was still a parking lot, but something in the air had shifted. ' +
          'They had done a thing they could not undo. It was not the worst thing. It was not ' +
          'even, in the technical sense, a war crime. But it was the first thing any of them ' +
          'had ever done to the students that the students would remember as violence, and they ' +
          'all knew it, and there was nothing to say. ' +
          'The occupation continued for six more days. The Legion held the Council Chamber. ' +
          'The Council met in the library. The ZMP issued statements. The school waited. The ' +
          'injured students were released from the hospital one by one, and Ana Kovač was the ' +
          'last to go home, and when she went home she did not go back to school. She ' +
          'eventually graduated by correspondence. She did not join any more protests. She ' +
          'did not talk about what had happened. She went to university in another city, and ' +
          'became a doctor, and if you asked her about the King Putsch, she would change the ' +
          'subject. ' +
          'On the twelfth day, the Legion withdrew. There was no ceremony. The men packed ' +
          'their things and went home. The Marshal submitted his resignation the following ' +
          'morning and was gone by noon. The King Putsch was over. The crown had held the ' +
          'building. But it had not held the school. ' +
          'The school repaved the parking lot in the spring. They did not put up a plaque. ' +
          'They did not need to. But the physics teacher — who had been one of the organizers, ' +
          'and who had spent the sixth day of the occupation in a jail cell the Legion had ' +
          'turned into a temporary holding room — started a small tradition. He would take ' +
          'his first-year classes out to the parking lot on the second Monday of the school ' +
          'year, and he would stand them in a loose semicircle, and he would tell them, in ' +
          'a very dry voice, that they were standing on a place where something had happened ' +
          'once, and that the thing that had happened had not been good, and that it was not ' +
          'going to be on any exam. And then he would walk them back inside. That was all. ' +
          'That was the memorial.',
        subending: 'Subending AI — The Eleventh Minute',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">' + injuries + '</span></div>' +
          '<div class="stat"><span>Warning shots fired</span><span class="v">' + (warningShot ? 'Yes' : 'No') + '</span></div>' +
          '<div class="stat"><span>Legion morale</span><span class="v">' + Math.round(g.legionMorale) + '%</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#ffcc00;font-weight:bold;">PYRRHIC VICTORY</span></div>',
        epilogue:
          'The crown held the building for three more years. It never held anything else. The ' +
          'Marshal became a consultant. The Legion was disbanded. The girl with the fractured ' +
          'skull graduated with honours and never spoke about what had happened. And the parking ' +
          'lot was repaved in the spring, and the plaque was installed in the main hallway, and ' +
          'everyone who walked past it remembered something different.'
      };
    }

    // =========================================================
    // ENDING 37: FIRED ON CROWD — CATASTROPHIC VICTORY
    // =========================================================
    else if (outcome === 'fired_on_crowd') {
      endingData = {
        ending: 'zalgrilian_king_fired_on_crowd',
        title: 'The Shots Heard in the Parking Lot',
        subtitle: 'The Legion fired. Then it fired again. The crowd dispersed. The school did not.',
        endingNumber: 'Ending 37',
        body: 'The Legion fired on the crowd. There were casualties. The occupation ended in blood.',
        story:
          '<span class="party-zmp"> We </span> ' +
          'could not break protests in time for dinner.So we just <span class="party-rb"> shot them </span> ' +
          'This had caused a full blown <span class="party-rb"> civilwar </span> ' +
          'Between <span class="party-zmp"> us </span> and <span class="party-iia"> them </span> ' +
          'After few monhts of <span class="party-rb"> bloody fighting </span> ' +
          'They managed to win.' +
          'There was a <span class="ro16"> new council </span>. ' +
          'But without our presence IIA PL and RED formed new government. ' +
          'Our trial was set for 15 december ' +
          'We were convicted of <span class="party-rb"> crimes against humanity </span> ' +
          'So <span class="party-iia"> execution </span> is today.',
        subending: 'Subending AK — The Shots',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">' + injuries + '</span></div>' +
          '<div class="stat"><span>Warning shots fired</span><span class="v">' + (warningShot ? 'Yes' : 'No') + '</span></div>' +
          '<div class="stat"><span>Legion loyalty</span><span class="v">' + Math.round(g.legionLoyalty) + '%</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">CATASTROPHE</span></div>',
        epilogue:
          'They just put us but are yet to strap us, ' +
          'On our way here <span class="party-zmp"> I </span> heard some rambling that a tenth wall was broken. ' +
          'But yeah ZMP has failed may <span class="party-zmp"> we stand </span> unshaken  ' +
          'Wait, why is everybody panicking ' +
          '<span class="party-rb"> my guard is preety disracted </span> ' +
          'I see my shot. ' +
          'So I got him now we have a gun it is time to free <span class="party-zmp"> the others </span> ' +
          'So we escaped the building.*explosion* Some nuke just destroyed the prison good thing <span class="party-zmp"> we </span> were not inside. ' +
          'It seems that in the end <span class="party-zmp"> we were victorious</span>.Long live <span class="party-zpf"> new Zalgrilia</span>.'
      };
    }

    // =========================================================
    // ENDING 38: SURGE — DEFEAT
    // =========================================================
    else if (outcome === 'surge') {
      endingData = {
        ending: 'zalgrilian_king_surge',
        title: 'The Crowd Broke Through',
        subtitle: 'The Legion was overwhelmed. The occupation collapsed. The crown fell.',
        endingNumber: 'Ending 38',
        body: 'The crowd pushed through our line in an massive <span class="party-red"> stampedo </span>.',
        story:
          '<span class="party-rb">The protestors were outnumbering us 50 to 1.</span> ' +
          '<span class="party-zmp">Our monarchy</span> was broken from begining ' +
          'and we did not lose beacuse we were bad but beacuse <span class="party-zmp">The coup</span> got too loud.' +
          'We lost our leaders were all prosecuted, ' +
          'save for one and that was the failed King <span class="party-zmp">Ahmad VI </span> he went and established ' +
          'a fort with what was left of his folowers at ' +
          'the end of the standoff. ' +
          'That was a <span class="party-zmp">fort </span> police could not break.  ' +
          'In the end council reconvened the ZMP was banned and the old coalition of IIA RED rb PL and TIIA rose to power. ' +
          'But in the end they lost 10% of their land to a new <span class="party-zmp"> monarchy </span> led by a cult of personality there was never a true <span class="white"> peace </span> but ZMP had no people and <span class="ro16"> new council </span> had no equipment to conquer one another ' ,
        subending: 'Subending AL — The Break',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Legion cohesion at end</span><span class="v">' + Math.round(g.legionCohesion) + '%</span></div>' +
          '<div class="stat"><span>Crowd pressure at end</span><span class="v">' + Math.round(g.crowdPressure) + '%</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">None</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">DEFEAT</span></div>',
        epilogue:
          'The ZMP was not able to take over everything ' +
          'but they did a bit of land. ' +
          'But now 6 years had passed we hear the IIA had broken the tenth wall whatever that means. ' +
          'But we do hear explosions in the distance in their food silo. ' +
          'For now a <span class="party-rb> great hunger </span> might take place. ' +
          'So soon <span class="party-zmp">our new dzehurjaca </span> shall go' +
          'and finish what our people started ' +
          'Long live the true king <span class="party-zmp">Ahmad VI </span>.'
      };
    }

    if (!endingData) return;

    // ---- Offer the Zalgrilian Council for the two victory branches ----
    // Fast Putsch (peaceful) and Stalemate A (monarchist civil war win).
    var offerCouncil = false;
    if (outcome === 'peaceful') {
      offerCouncil = true;
      st.zcTriggeredFrom = 'fast_putsch';
    } else if (outcome === 'surge' && g.result && g.result.civilWarMonarchyWin) {
      offerCouncil = true;
      st.zcTriggeredFrom = 'stalemate_a';
    }

    if (offerCouncil && typeof UI.startZalgrilianCouncil === 'function') {
      // Stash the ending so the council flow can show it after
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
    UI.setScene('end');
    UI.render();

    // If we're offering the council, schedule the launch prompt
    if (st._pendingCouncilOffer) {
      setTimeout(function () {
        showCouncilOffer();
      }, 800);
    }
  }

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
    var heading = isFast
      ? 'THE CROWN HOLDS'
      : 'THE MONARCHY PREVAILS';
    var sub = isFast
      ? 'The putsch has succeeded. The Council has been dissolved. The King will convene the Zalgrilian Council in its place.'
      : 'The civil war has ended. The monarchy has won. The ordinary Council is abolished. The King will convene the Zalgrilian Council.';

    overlay.innerHTML =
      '<div style="max-width:620px;padding:36px 44px;background:#14181f;' +
      'border:2px solid #7fdcff;border-radius:8px;color:#d8e8f0;text-align:center;">' +
        '<h1 style="color:#7fdcff;margin:0 0 8px 0;font-size:20px;' +
        'letter-spacing:3px;text-transform:uppercase;">' + heading + '</h1>' +
        '<p style="color:#b8c8d8;font-size:13px;line-height:1.7;margin:16px 0 24px 0;">' +
          sub +
        '</p>' +
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
        UI.startZalgrilianCouncil({
          triggeredFrom: st.zcTriggeredFrom
        });
      }
    };
    document.getElementById('zc-offer-skip').onclick = function () {
      overlay.remove();
      st._pendingCouncilOffer = null;
    };
  }
})();