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
          'because there was no longer anyone to oppose it. ' +
          'On the eighth day, the Council reconvened in the Council Chamber — not in the library, ' +
          'not in exile, but in the actual Chamber, because the Legion had opened the doors and ' +
          'was standing outside them, and nobody had the courage to ask what would happen if they ' +
          'tried to walk through. The Council passed a resolution recognizing the occupation as ' +
          '"a lawful exercise of the crown\'s prerogative." The Marshal signed it. The King Putsch ' +
          'was over, and the crown had won. ' +
          'The school reopened the following Monday. The ZMP issued a statement calling for ' +
          '"national reconciliation." The Dzehurjaca Legion was formally incorporated into the ' +
          'school\'s security apparatus. The Marshal was promoted. And the crown, which had been ' +
          'a symbol for two years, became something more: a fact. ' +
          'The first week was strange. The students walked into the building through the doors ' +
          'the Legion had held for six days, and the Legion was standing in the same position ' +
          'they had been standing in all along, only now they were not standing in a parking lot ' +
          '— they were standing in the main corridor, which had been repainted over the weekend ' +
          'in the school\'s traditional colours, and someone had put a portrait of Ahmad VI on ' +
          'the wall above the trophy case, and the whole thing looked less like an occupation ' +
          'and more like a renovation. Teachers taught. Students studied. The principal, who had ' +
          'been absent for the entire standoff, returned on Wednesday and gave a speech that ' +
          'nobody remembered a word of. The Kovač family, whose son had been one of the crowd\'s ' +
          'organizers, sent a formal letter of complaint to the Council. The Council filed it. ' +
          'The Marshal filed his first quarterly report as Director of Security, and it was ' +
          'thirteen pages long, and eleven of those pages were appendices, and none of the eleven ' +
          'appendices mentioned the words "King Putsch" or "parking lot" or "crowd." He wrote it ' +
          'himself, in longhand, on school stationery, and handed it to the Council in a brown ' +
          'envelope on a Tuesday afternoon, and that was the last anyone in the school ever heard ' +
          'from him about the events of that week. ' +
          'It snowed in December. The Legion drilled in the courtyard, and the students watched ' +
          'from the library windows, and something about the sight was no longer strange. It was ' +
          'the way things were now. The King Putsch stopped being an event and became a season. ' +
          'The Marshal, at the winter assembly, gave a short address on the theme of "the school ' +
          'as a family," and the students applauded politely, and nobody in the audience was ' +
          'entirely sure whether he was being sincere or whether he was still, in some quiet ' +
          'register, running the operation. He probably was. It did not matter. ' +
          'The King Putsch was studied for generations. It was taught in history classes as ' +
          '"the moment the monarchy proved it could hold." It was cited in political science ' +
          'textbooks as "a textbook example of a successful Kapp-style putsch." It was mentioned ' +
          'in military academies as "the operation that proved the value of restraint." At the ' +
          'centenary, a monument was erected in the parking lot — a simple stone slab, unadorned, ' +
          'with a single inscription: "Here the crown held." It was not a memorial to the dead, ' +
          'because there were none. It was not a memorial to the wounded, because there were ' +
          'none. It was a memorial to the fact that the Legion had stood in the rain for six ' +
          'days and not fired a shot, and that the crowd had stood in the parking lot for six ' +
          'days and not thrown a bottle, and that the whole thing had been resolved without ' +
          'either side having to do the thing that would have made it impossible for either ' +
          'side to walk away. ' +
          'The Marshal did not attend the centenary. He was ninety-four years old and living in ' +
          'a small apartment three hundred kilometres from the school. He watched the ceremony ' +
          'on television. When the cameras panned across the crowd and he saw the students — ' +
          'his students, the ones who had been in the parking lot, now grandparents, some of ' +
          'them, sitting in folding chairs with their grandchildren — he is said to have ' +
          'smiled, and then to have turned off the television, and then to have sat in his ' +
          'chair for a long time without moving. He had done what he had set out to do. He had ' +
          'done it cleanly. And he had spent the rest of his life not being quite sure whether ' +
          'that was the same thing as doing it well.',
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
          'legend. The Legion became an institution. The King Putsch became a founding myth. ' +
          'And the students who had stood in the parking lot on the first day, and the second, ' +
          'and the third, and who had gone home on the seventh — they would tell their children ' +
          'about it, and their children would not believe them, because by then the story had ' +
          'become too large to be true. But it was true. It happened. The crowd went home. ' +
          'The crown held.'
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
          'At 19:04 the Marshal gave the order to advance. ' +
          'At 19:06 the first shot was fired into the air. ' +
          'At 19:07 the second shot was fired into the air. ' +
          'At 19:09 a third shot was fired, and it was not fired into the air. ' +
          'Nobody ever established who fired it. The Legion\'s official report said it was an accidental ' +
          'discharge during a struggle. The students who were there said it was deliberate. The truth ' +
          'was probably somewhere in between, which is where the truth usually is, and which is why it ' +
          'was never settled. ' +
          'The crowd dispersed within forty seconds. That was the other thing everyone remembered: not ' +
          'the shots themselves, but how quickly the parking lot emptied. Four hundred people, gone in ' +
          'less than a minute, leaving behind jackets and bags and a single shoe. The Legion stood where ' +
          'it had been standing. The Marshal walked forward alone, to where a boy of seventeen had fallen, ' +
          'and stood over the spot for some time, and then walked back to the loading dock and dismissed ' +
          'the Legion for the evening. He did not give any further orders that night. He did not give ' +
          'any further orders at all. ' +
          'The boy survived. He spent two months in hospital, and when he returned to school he walked ' +
          'with a limp that he would have for the rest of his life. He did not join any more protests. ' +
          'He did not talk about what had happened. He graduated, and went to university, and became ' +
          'an accountant, and if you asked him about the King Putsch he would change the subject. ' +
          'The school closed for two weeks. When it reopened, the Council was in session, the Legion was ' +
          'gone, and the ZMP headquarters was empty. The Marshal had resigned. The crown had been ' +
          'formally dissolved. There was a new principal, and a new security protocol, and a new ' +
          'set of rules about what could and could not be done in the parking lot. ' +
          'The King Putsch was over. But it was not over, because it was never going to be over, because ' +
          'some things are not events but wounds, and wounds do not close simply because the people ' +
          'who inflicted them have gone home.',
        subending: 'Subending AK — The Shots',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">' + injuries + '</span></div>' +
          '<div class="stat"><span>Warning shots fired</span><span class="v">' + (warningShot ? 'Yes' : 'No') + '</span></div>' +
          '<div class="stat"><span>Legion loyalty</span><span class="v">' + Math.round(g.legionLoyalty) + '%</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">CATASTROPHE</span></div>',
        epilogue:
          'The Marshal was never charged. He had followed orders. The orders had been lawful. The law, ' +
          'as it turned out, had very little to say about what had happened in that parking lot. He ' +
          'moved to another city and took a job in private security and never spoke about the Putsch ' +
          'again. The boy with the limp became an accountant. The school repaved the parking lot in ' +
          'the spring. And every year, on the anniversary, a small group of students gathered in the ' +
          'parking lot at 19:04 and stood in silence for eleven minutes, and then went home. ' +
          'Nobody organized it. It just happened. And it kept happening, year after year, long after ' +
          'everyone who had been there had graduated, because some things are not events but wounds, ' +
          'and wounds do not close simply because the people who inflicted them have gone home.'
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
        body: 'The crowd pushed through the Legion line. The Legion did not fire. The occupation was over.',
        story:
          'It happened at 18:47, which was earlier than anyone had expected. ' +
          'The Legion had been holding for six days. The crowd had been growing for six days. And then, ' +
          'all at once, the line broke — not because anyone had planned it, not because anyone had ' +
          'ordered it, but because a boy in the third row tripped, and the boy behind him stumbled, and ' +
          'the girl behind him caught his arm, and in the space of about four seconds the whole front ' +
          'of the crowd moved forward three feet, and the Legion moved back three feet, and that was ' +
          'the end of the standoff. ' +
          'The Legion did not fire. That was the thing everyone would remember afterward. Forty men ' +
          'with rifles, and not one of them pulled a trigger. They stood their ground for as long as ' +
          'they could, and then they stepped aside, and the crowd poured past them into the school. ' +
          'Some of the soldiers looked relieved. Some of them looked ashamed. Most of them just looked ' +
          'tired. The Marshal was not among them. He had gone inside twenty minutes earlier, and when ' +
          'the crowd reached the Council Chamber they found the door unlocked and the room empty and ' +
          'a single sheet of paper on the table with a handwritten note: "The occupation is over. ' +
          'I have resigned. The Legion is disbanded. I am sorry." ' +
          'The crowd did not know what to do with an empty room. They stood in the Council Chamber ' +
          'for a while, looking at the chairs and the table and the portrait of Ahmad VI that someone ' +
          'had hung on the wall. Then somebody took the portrait down. Then somebody else put it back ' +
          'up. Then somebody else took it down again. In the end they left it leaning against the ' +
          'wall, facing away from the room, and went home. ' +
          'The Council reconvened the following morning. The ZMP issued a statement condemning the ' +
          'occupation and calling for "a new era of reconciliation." The Legion was formally disbanded. ' +
          'The Marshal was never seen again. The King Putsch was over.',
        subending: 'Subending AL — The Break',
        detail:
          '<div class="stat"><span>Beats of standoff</span><span class="v">' + beats + '</span></div>' +
          '<div class="stat"><span>Legion size</span><span class="v">' + legionSize + ' men</span></div>' +
          '<div class="stat"><span>Legion cohesion at end</span><span class="v">' + Math.round(g.legionCohesion) + '%</span></div>' +
          '<div class="stat"><span>Crowd pressure at end</span><span class="v">' + Math.round(g.crowdPressure) + '%</span></div>' +
          '<div class="stat"><span>Injuries</span><span class="v">None</span></div>' +
          '<div class="stat"><span>Outcome</span><span class="v" style="color:#cc0000;font-weight:bold;">DEFEAT</span></div>',
        epilogue:
          'The Legion held the building for six days and then went home. The Marshal resigned. The ' +
          'crown was dissolved. The ZMP headquarters was empty. And the parking lot, which had held ' +
          'four hundred students on the first day and four hundred on the last, was repaved in the ' +
          'spring and never mentioned again. The King Putsch was taught in history classes as ' +
          '"a failed coup that failed because nobody believed in it." And that was true, as far as ' +
          'it went. But it was not the whole truth, because the whole truth was that the occupation ' +
          'had failed because the people who were supposed to defend it had decided, quietly and ' +
          'without any drama at all, that they would not.'
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