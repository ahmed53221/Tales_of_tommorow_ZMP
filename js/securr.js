// secularist_ref_ui.js — UI wrapper for the Secularist referendum mini-game.
// Pattern matches zalgrilia.js / securro_siege_ui.js:
//   canStartSecularistReferendum()  → boolean
//   startSecularistReferendum()     → opens the iframe, listens for result
//   showRefResult(result)           → maps outcome to ending, sets st.endingData
//
// Exposes on window.UI:
//   UI.canStartSecularistReferendum
//   UI.startSecularistReferendum
//
// Depends on:
//   window.UI, window.SecularistReferendum
//   secularist.html (iframe shell)
(function () {
  'use strict';

  if (!window.UI) {
    console.warn('[securr] UI not loaded — aborting.');
    return;
  }
  if (!window.SecularistReferendum) {
    console.warn('[secularist_ref_ui] SecularistReferendum engine not loaded — aborting.');
    return;
  }

  var UI = window.UI;
  var refGame = null;

  // ============================================================
  // FACTION GUARD
  // ============================================================
  function isSecularist(st) {
    if (!st || !st.faction) return false;
    if (st.faction === 'secularists') return true;
    var D = window.GameData;
    if (D && D.FACTIONS) {
      for (var i = 0; i < D.FACTIONS.length; i++) {
        if (D.FACTIONS[i].id === st.faction) {
          return D.FACTIONS[i].id === 'secularists';
        }
      }
    }
    return false;
  }

  // ============================================================
  // CAN START
  // ============================================================
  UI.canStartSecularistReferendum = function () {
    var st = UI.getState ? UI.getState() : null;
    if (!st) return false;
    if (!isSecularist(st)) return false;
    if (st.ref && st.ref.done) return false;
    return true;
  };

  // ============================================================
  // START
  // ============================================================
  UI.startSecularistReferendum = function () {
    var st = UI.getState ? UI.getState() : null;
    if (!st || !isSecularist(st)) return;

    if (!st.ref || !st.ref.active) {
      window.SecularistReferendum.newGame(st);
    }
    refGame = st.ref;

    openRefIframe(st);
  };

  // ============================================================
  // IFRAME
  // ============================================================
  function openRefIframe(st) {
    var existing = document.getElementById('ref-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ref-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:#000;z-index:9999;' +
      'display:flex;flex-direction:column;';

    var iframe = document.createElement('iframe');
    iframe.id = 'ref-iframe';
    iframe.src = 'secularist.html';
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    iframe.addEventListener('load', function () {
      try {
        iframe.contentWindow.postMessage({ type: 'REF_INIT', st: st }, '*');
      } catch (e) {}
    });

    window.addEventListener('message', onRefMessage);
  }

  function onRefMessage(event) {
    var data = event.data;
    if (!data || data.type !== 'REFERENDUM_RESULT') return;

    var overlay = document.getElementById('ref-overlay');
    if (overlay) overlay.remove();
    window.removeEventListener('message', onRefMessage);

    if (refGame) {
      refGame.active = false;
      refGame.done = true;
      refGame.result = data.result;
    }
    showRefResult(data.result);
  }

  // ============================================================
  // RESULT → ENDING
  // ============================================================
  function showRefResult(r) {
    var st = UI.getState ? UI.getState() : null;
    if (!st) return;

    var m = r.metrics || r;
    var ending = null;

    // ------------------------------------------------------------
    // Ending 55 — The Demagogue (creed < 30)
    // ------------------------------------------------------------
    if (r.outcome === 'demagogue') {
      ending = {
        ending: 'secularist_referendum_demagogue',
        title: 'The Demagogue',
        subtitle: 'You won the votes. You lost the argument.',
        endingNumber: 'Ending 55',
        body:
          'The secular charter passed. But you had made so many promises that it was ' +
          'no longer a secular charter at all — it was a list of bribes.',
        story:
          'You had promised the gamers the wifi and the buskids the buses and the ' +
          'athletes the gym and the freshmen everything. You had promised so much that ' +
          'the charter you had originally written no longer existed. The document that ' +
          'was signed on the tenth week was called a secular charter, but it had a ' +
          'religious exemption in clause four and a special funding guarantee in ' +
          'clause seven and a new committee in clause eleven that nobody could explain. ' +
          'You had won the referendum. You had not won the argument. You had built a ' +
          'liberal constitution out of patronage, and a constitution built out of ' +
          'patronage is not a liberal constitution. It is a coalition agreement with ' +
          'a preamble. ' +
          'The IIA signed it. The ZPF signed it. The faculty signed it. The students ' +
          'ratified it. And for the next twenty years, every illiberal thing the school ' +
          'did was justified by a clause you had put there to buy someone\'s vote.',
        subending: 'Subending R1 — The Patronage Charter',
        detail:
          '<div class="stat"><span>Persuasion</span><span class="v">' +
            Math.round(m.persuasion || 0) + '</span></div>' +
          '<div class="stat"><span>Creed</span><span class="v" style="color:#cc0000;">' +
            Math.round(m.creed || 0) + '</span></div>' +
          '<div class="stat"><span>Coalition</span><span class="v">' +
            Math.round(m.coalition || 0) + '</span></div>',
        epilogue:
          'The charter held, but its soul did not. The Secularists won the referendum ' +
          'and lost the argument. The faction survived, but it never again claimed to ' +
          'be the party of principle. It was the party of the possible. It was the party ' +
          'of the deal. And every time someone quoted the preamble, someone else quoted ' +
          'clause eleven.'
      };
    }

    // ------------------------------------------------------------
    // Ending 56 — The Isolated Liberal (coalition < 20)
    // ------------------------------------------------------------
    else if (r.outcome === 'isolated') {
      ending = {
        ending: 'secularist_referendum_isolated',
        title: 'The Isolated Liberal',
        subtitle: 'You were right. You were alone.',
        endingNumber: 'Ending 56',
        body:
          'You refused every compromise. The IIA walked out. The referendum failed.',
        story:
          'You had been right about everything. You had been right about the charter, ' +
          'right about the principles, right about the future. And on the tenth week, ' +
          'when the votes were counted, you had twelve per cent. ' +
          'You had refused to bring the IIA in because they wanted the tech curriculum ' +
          'in clause three. You had refused to deal with the ZPF because they wanted a ' +
          'religious exemption that you had correctly identified as a wedge. You had ' +
          'refused every compromise, and you had been right about every refusal, and ' +
          'none of that had mattered because a liberal constitution requires a coalition ' +
          'and a coalition requires that you sometimes lose an argument you were right ' +
          'about. ' +
          'The referendum failed. The ZPF\'s charter passed instead. The school got a ' +
          'religious constitution written by people who had never read a word of yours. ' +
          'You spent the rest of your career in opposition, writing pamphlets that ' +
          'explained, correctly, why the ZPF charter was a mistake. You were right. ' +
          'It did not help.',
        subending: 'Subending R2 — The Wilderness',
        detail:
          '<div class="stat"><span>Persuasion</span><span class="v">' +
            Math.round(m.persuasion || 0) + '</span></div>' +
          '<div class="stat"><span>Creed</span><span class="v">' +
            Math.round(m.creed || 0) + '</span></div>' +
          '<div class="stat"><span>Coalition</span><span class="v" style="color:#cc0000;">' +
            Math.round(m.coalition || 0) + '</span></div>',
        epilogue:
          'The Secularists lost the referendum and the decade. They were right about ' +
          'the charter, right about the ZPF, right about the future, and alone. The IIA ' +
          'did not ally with them again for fifteen years. The ZPF charter governed the ' +
          'school for two generations. The Secularists published their pamphlet every ' +
          'year, and every year fewer people read it, and every year they were more ' +
          'certain they had been right. They had been.'
      };
    }

    // ------------------------------------------------------------
    // Ending 57 — The Written Republic (persuasion >= 70)
    // ------------------------------------------------------------
    else if (r.outcome === 'won') {
      ending = {
        ending: 'secularist_referendum_won',
        title: 'The Written Republic',
        subtitle: 'You argued the school into a republic.',
        endingNumber: 'Ending 57',
        body:
          'The secular charter passes. The IIA signs. The ZPF signs. The faculty signs. ' +
          'The school votes itself a republic.',
        story:
          'It took eight weeks. You campaigned on the wifi and the buses and the labs, ' +
          'because those were the things that were real to the students, and because the ' +
          'things that were real to the students were the things a secular charter could ' +
          'actually deliver. You debated the ZPF three times and won two of them on ' +
          'procedure. You brought the IIA in at week four and kept them in at week six. ' +
          'You gave one principled speech at week seven, and it was the only speech you ' +
          'gave that you could not have written to order, and it was the one that carried. ' +
          'On the tenth week, the referendum was held. It passed by eleven points. ' +
          'The charter that was ratified was the charter you had written — not a word ' +
          'altered, not a clause conceded, not a single promise made that you did not ' +
          'believe. You had proved the Secularist thesis: the school could be argued ' +
          'into a republic. It just had to be argued well. ' +
          'The ZPF did not sign the final charter, but they did not contest the result. ' +
          'The faculty did not endorse it, but they did not oppose it. The IIA signed, ' +
          'the moderates signed, and the buskids and the gamers and the honor students ' +
          'signed, and that was enough. ' +
          'You had spent two years being told that the school could not be argued out ' +
          'of its old gods. You had argued it. You had won. And the thing you remembered, ' +
          'afterwards, was not the vote, but the speech at week seven, when you had ' +
          'said the thing you actually believed and the room had been silent, and then ' +
          'somebody in the back had started to clap.',
        subending: 'Subending R3 — The Written Republic',
        detail:
          '<div class="stat"><span>Persuasion</span><span class="v" style="color:#5fae3c;">' +
            Math.round(m.persuasion || 0) + '</span></div>' +
          '<div class="stat"><span>Creed</span><span class="v">' +
            Math.round(m.creed || 0) + '</span></div>' +
          '<div class="stat"><span>Coalition</span><span class="v">' +
            Math.round(m.coalition || 0) + '</span></div>',
        epilogue:
          'The secular charter governed the school for two generations. The preamble — ' +
          'which you had written on the back of an envelope on the third week — was ' +
          'engraved on the wall of the council chamber. It read: "This school exists ' +
          'to educate citizens for a democratic society." It did not mention gods. It ' +
          'did not mention kings. It mentioned citizens. The Secularists had won the ' +
          'argument, and the argument had been written down, and that was more than most ' +
          'schools ever managed.'
      };
    }

    // ------------------------------------------------------------
    // Ending 58 — The Lost Referendum (timeout)
    // ------------------------------------------------------------
    else {
      ending = {
        ending: 'secularist_referendum_lost',
        title: 'The Lost Referendum',
        subtitle: 'Ten weeks. The charter failed.',
        endingNumber: 'Ending 58',
        body:
          'The secular charter was defeated. The school voted for someone else\'s.',
        story:
          'You campaigned for ten weeks. You did everything right — you courted the ' +
          'gamers, you courted the buskids, you debated the ZPF, you brought in the ' +
          'IIA, you gave the principled speech, you held the coalition together. And ' +
          'on the tenth week the vote came in and you had lost by four points. ' +
          'It was the buskids. You had promised them the buses but you had not ' +
          'promised them free lunch, and the ZPF had promised them both, and they had ' +
          'voted for the ZPF. It was the freshmen. They had not been paying attention. ' +
          'It was the seniors. They had graduated. It was always the seniors. ' +
          'You had run the campaign you believed in, and the campaign you believed in ' +
          'had lost, and the school had voted for the other charter — the one with the ' +
          'religious exemption — and you had to live with it. ' +
          'You did live with it. You ran again in the next cycle. You lost again. You ' +
          'ran a third time. You lost a third time. And then one year, without anyone ' +
          'noticing, the buskids had grown up and the freshmen had grown up and the ' +
          'seniors had graduated and the school had changed, and a new generation ' +
          'voted for the charter you had written, and you were not there to see it.',
        subending: 'Subending R4 — The Long Wait',
        detail:
          '<div class="stat"><span>Persuasion</span><span class="v">' +
            Math.round(m.persuasion || 0) + '</span></div>' +
          '<div class="stat"><span>Creed</span><span class="v">' +
            Math.round(m.creed || 0) + '</span></div>' +
          '<div class="stat"><span>Coalition</span><span class="v">' +
            Math.round(m.coalition || 0) + '</span></div>',
        epilogue:
          'The secular charter was eventually ratified, but not in your lifetime. The ' +
          'generation that passed it named the council chamber after you. You would have ' +
          'found that funny — you had spent your career being told that the school would ' +
          'never vote for the charter, that the buskids would always vote for whoever ' +
          'promised them the most, that the honor students would always vote for whoever ' +
          'promised them the least — and then, decades after your death, the buskids ' +
          'and the honor students had voted for the charter anyway. The lesson was not ' +
          'that you had been wrong. The lesson was that you had been right, and the ' +
          'school had caught up, and it had taken longer than you had had.'
      };
    }

    if (!ending) return;

    st.finished = true;
    st.endingData = ending;
    if (st.ref) {
      st.ref.active = false;
      st.ref.done = true;
    }

    UI.setScene('end');
    UI.render();
  }

  console.log('[secularist_ref_ui] loaded');
})();