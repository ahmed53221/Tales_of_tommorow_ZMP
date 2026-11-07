  /*
 * Weekly events. 2 years of events (104 weeks).
 * Events are distributed across the 2-year timeline.
 */
(function () {
  'use strict';

  function _strengthOf(st, keys) {
    if (!st.paramilitaries) return 0;
    var t = 0;
    for (var i = 0; i < keys.length; i++) {
      var f = st.paramilitaries[keys[i]];
      if (!f) continue;
      var base = f.members * ((f.training + f.equipment) / 20) * (f.morale / 100);
      if (f.isElite) base *= 1.5;
      base *= (0.8 + f.loyalty / 500);
      t += base;
    }
    return Math.round(t);
  }
  function redRbBlStrength(st) {
    return _strengthOf(st, ['red_militia', 'black_legion', 'pl_pep', 'sportica_athletes']);
  }
  function dzehurjacaStrength(st) {
    return _strengthOf(st, ['dzehurjaca']);
  }

  // Election results generator function
  window.generateElectionEvent = function(st, rng) {
    var cur = window.Engine.current(st);
    var seats = cur.seats;
    var prev = st.history.length > 1 ? st.history[st.history.length - 2] : null;
    var mine = seats.ZMP || 0;
    var electionNum = (st.electionCycle || 0) + 1;
    
    var partyRows = [];
    var allPids = Object.keys(cur.totals);
    allPids.sort(function(a, b) {
      return (cur.totals[b] || 0) - (cur.totals[a] || 0);
    });
    
    allPids.forEach(function(pid) {
      if (pid === 'other') return;
      var p = window.Engine.getParty(pid);
      if (!p) return;
      
      var voteShare = cur.totals[pid] || 0;
      var seatCount = seats[pid] || 0;

      // --- FIX FOR ZALIAN LIST SEATS ---
      if (pid === 'zalian_list') {
        seatCount = (seats['zap'] || 0) + (seats['zlp'] || 0) + (seats['other_zalian'] || 0);
      }

      var prevVote = prev ? (prev.totals[pid] || 0) : voteShare;
      var prevSeat = prev ? (prev.seats[pid] || 0) : seatCount;

      if (prev && pid === 'zalian_list') {
        prevSeat = (prev.seats['zap'] || 0) + (prev.seats['zlp'] || 0) + (prev.seats['other_zalian'] || 0);
      }
      var voteChange = voteShare - prevVote;
      var seatChange = seatCount - prevSeat;
      
      partyRows.push({
        id: pid,
        short: p.short,
        color: p.color,
        voteShare: voteShare,
        voteChange: voteChange,
        seatCount: seatCount,
        seatChange: seatChange
      });
    });
    
    var othersVote = cur.totals.other || 0;
    var prevOthers = prev ? (prev.totals.other || 0) : othersVote;
    partyRows.push({
      id: 'other',
      short: 'Others',
      color: '#9aa0a6',
      voteShare: othersVote,
      voteChange: othersVote - prevOthers,
      seatCount: null,
      seatChange: null
    });
    
    partyRows.sort(function(a, b) { return b.voteShare - a.voteShare; });
    
    function getSeats(pid) { 
      if (pid === 'zalian_list') {
         return (seats['zap'] || 0) + (seats['zlp'] || 0) + (seats['other_zalian'] || 0);
      }
      return seats[pid] || 0; 
    }
    var mySeats = seats.ZMP || 0;
    
    var coalitions = [];
    
    var zmp_semp = mySeats + getSeats('semp');
    if (zmp_semp >= D.MAJORITY) {
      coalitions.push({
        key: 'zalgrilian',
        name: 'Zalgrilian Front',
        combo: ['ZMP', 'SEMP'],
        seats: zmp_semp,
        willing: Math.min(100, (st.affinity.semp || 50) + 10),
        description: 'A spirit-focused alliance. SEMP brings energy and enthusiasm.'
      });
    }
    
    var leftBlock = mySeats + getSeats('semp') + getSeats('zpf');
    if (leftBlock >= D.MAJORITY) {
      coalitions.push({
        key: 'leftblock',
        name: 'Left Block',
        combo: ['ZMP', 'SEMP', 'ZPF'],
        seats: leftBlock,
        willing: Math.min(100, Math.min(st.affinity.semp || 50, st.affinity.zpf || 50) + 5),
        description: 'A broad centre-left coalition. SEMP and ZPF bridge the wings.'
      });
    }
    
    var redAlliance = mySeats + getSeats('red') + getSeats('rb') + getSeats('iia') + getSeats('pl');
    if (redAlliance >= D.MAJORITY) {
      coalitions.push({
        key: 'redalliance',
        name: 'Red Alliance',
        combo: ['ZMP', 'RED', 'RB', 'IIA', 'PL'],
        seats: redAlliance,
        willing: Math.min(100, Math.min(st.affinity.red || 50, st.affinity.rb || 50, st.affinity.iia || 50, st.affinity.pl || 50) + 5),
        description: 'A broad left-tech coalition. Combines Red Front energy, Red Bench labour, IIA innovation, and PL spirit.'
      });
    }
    
    var rgbAlliance = mySeats + getSeats('iia') + getSeats('red');
    if (rgbAlliance >= D.MAJORITY) {
      coalitions.push({
        key: 'rgb',
        name: 'RGB Alliance',
        combo: ['ZMP', 'IIA', 'RED'],
        seats: rgbAlliance,
        willing: Math.min(100, Math.min(st.affinity.iia || 50, st.affinity.red || 50) + 5),
        description: 'Tech and labour united. Innovation meets the working class.'
      });
    }
    
    var grandCoalition = mySeats + getSeats('zpf') + getSeats('iia');
    if (grandCoalition >= D.MAJORITY) {
      coalitions.push({
        key: 'grand',
        name: 'Grand Coalition',
        combo: ['ZMP', 'ZPF', 'IIA'],
        seats: grandCoalition,
        willing: Math.min(100, Math.min(st.affinity.zpf || 50, st.affinity.iia || 50) + 5),
        description: 'The broadest possible alliance. Moderates from centre and tech unite.'
      });
    }
    
    var blackRed = mySeats + getSeats('red') + getSeats('bl');
    if (blackRed >= D.MAJORITY) {
      coalitions.push({
        key: 'blackred',
        name: 'Black-Red Alliance',
        combo: ['ZMP', 'RED', 'BL'],
        seats: blackRed,
        willing: Math.min(100, Math.min(st.affinity.red || 50, st.affinity.bl || 50) - 10),
        description: 'A radical coalition. High risk, high reward.'
      });
    }
    
    var centreAlliance = mySeats + getSeats('zpf');
    if (centreAlliance >= D.MAJORITY && coalitions.length < 3) {
      coalitions.push({
        key: 'zpfonly',
        name: 'Centre Alliance',
        combo: ['ZMP', 'ZPF'],
        seats: centreAlliance,
        willing: Math.min(100, (st.affinity.zpf || 50) + 15),
        description: 'A stable centre alliance with the ZPF.'
      });
    }
    
    coalitions.sort(function(a, b) { return b.seats - a.seats; });
    
    return {
      electionNum: electionNum,
      partyRows: partyRows,
      coalitions: coalitions,
      mySeats: mySeats,
      totalSeats: D.SEATS,
      majority: D.MAJORITY,
      hasMajority: mySeats >= D.MAJORITY
    };
  };

  window.GameData.ELECTION_EVENT = {
    id: 'election_day',
    week: -1,
    title: 'ELECTION DAY',
    body: 'The council elections are held. Results are counted and announced.',
    isElection: true
  };

  window.GameData.EVENTS = [

    /* ============================================================
     * WEEK 3 — WiFi Rework
     * ============================================================ */
    {
      id: 'week3_wifi', week: 3, handler: 'ZMP',
      title: 'The WiFi Blackout',
      body: 'The science wing rolled out a new content filter on Monday. By Tuesday half the school could not reach the sites they actually use. The gamers have started a petition. The honors students have counter-petitioned. The IT club has quietly threatened to walk. The faculty says the filter is "necessary for academic focus." Nobody in the room believes that.',
      choices: [
        { text: 'Force the filter open. Full access.',
          effects: { demo: { gamers: 8, arts: 4, freshmen: 3 }, faculty: -6, unity: 3, momentum: 3 } },
        { text: 'Negotiate a compromise. Filter only during class hours.',
         
          effects: { demo: { gamers: 3, honor: 2 }, faculty: 2, unity: 1 } },
        { text: 'Back the faculty. The filter stays.',
         
          effects: { faculty: 8, demo: { gamers: -6, honor: 3, freshmen: -2 }, momentum: -2 } }
      ]
    },

    /* ============================================================
     * WEEK 5 — Red Walkout (COMMIT or NOT)
     * ============================================================ */
    {
      id: 'red_walkers', week: 5, handler: 'any',
      title: 'The Red Walkout',
      body: 'The Red Front has called a walkout in the eastern districts where their support is highest. Half the students in three wings have not come to school. The faculty senate is meeting. The council is sitting. Everyone is waiting to see whether the ZMP joins the walkout or lets it burn out.',
      choices: [
        { text: 'March with the Red Front. Commit the party.',
          
          effects: { demo: { buskids: 6, freshmen: 5, gamers: 3 }, faculty: -10, unity: 5, momentum: 5,
            affinity: { red: 20, rb: 15, iia: -8, zpf: -10, bl: -5 },
            setFlags: { marchedWithRed: true } } },
        { text: 'Do nothing. Watch.',
        
          effects: { momentum: -3, unity: -2, setFlags: { marchedWithRed: false } } }
      ]
    },

    /* ============================================================
     * WEEK 8 — Old Zalians Revolt (COMMIT or NOT)
     * ============================================================ */
    {
      id: 'week8_old_zalians', week: 8, handler: 'ZMP',
      title: 'The Old Zalians Revolt',
      body: 'A regional splinter of the ZMP has walked out of the party congress in the western districts. They call themselves the "Old Zalians." They are weak, scattered, and nationally irrelevant — but they have taken the party newspaper and the trade union halls in two towns, and they are denouncing the "council of collaborators" in the capital. The Marshal has not yet been asked to intervene.',
      choices: [
        { text: 'Bring them back in. Offer them a place at the table.',
          
          effects: { unity: 5, affinity: { zpf: 5 }, demo: { seniors: 3, honor: 2 }, momentum: -1,
            setFlags: { oldZaliansAbsorbed: true, oldZaliansHostile: false } } },
        { text: 'Do nothing. They are small.',
          
          effects: { demo: { seniors: -2, buskids: -2 }, momentum: -2,
            setFlags: { oldZaliansHostile: true } } }
      ]
    },

    /* ============================================================
     * WEEK 11 — Zalians to Nezle (COMMIT or NOT)
     * ============================================================ */
    {
      id: 'week11_zalians_nezle', week: 11, handler: 'ZMP',
      title: 'The Zalians at Nezle',
      body: 'The Zalian minority has been pushed out of the northern districts and into the valley at Nezle. They have appealed to the council for protection. The council has refused them twice. The Dzehurjaca Legion has offered to ride out and escort them home. The Marshal is waiting for orders.',
      choices: [
        { text: 'This is not our fight. Let them go.',
          
          effects: { momentum: -3, unity: -2,
            setFlags: { zaliansAbandoned: true, dzehurjacaToNezle: false } } },
        { text: 'The Dzehurjaca rides again. Order the Marshal out.',
         
          effects: { momentum: 6, unity: 4, faculty: -4,
            setFlags: { dzehurjacaToNezle: true, zaliansAbandoned: false } } }
      ]
    },

    /* ============================================================
     * WEEK 13 — Branch A: Zalians Capitulate
     * ============================================================ */
    {
      id: 'week13_zalians_capitulate', week: 13, handler: 'ZMP',
      condition: function (st) { return st.flags && st.flags.zaliansAbandoned; },
      title: 'The Zalians Capitulate',
      body: 'The Zalians at Nezle have signed terms with the northern districts (red and rb). They have given up the valley and accepted resettlement in three border towns. The council did not intervene. The Marshal has not spoken to anyone in a week.',
      choices: [
        { text: 'Note it. Move on.',
          effects: { momentum: -2, unity: -1 } }
      ]
    },

    /* ============================================================
     * WEEK 13 — Branch B: Nezle Stalemate
     * ============================================================ */
    {
      id: 'week13_nezle_stalemate', week: 13, handler: 'ZMP',
      condition: function (st) {
        return st.flags && st.flags.dzehurjacaToNezle &&
          redRbBlStrength(st) >= dzehurjacaStrength(st);
      },
      title: 'The Stalemate at Nezle',
      body: 'The Legion reached the outskirts of Nezle, but the Red Front and Red Bench blocked the valley roads. The Black League has quietly sent arms to the Red Front. The Legion is sitting in the rain outside the town, waiting for orders it may not want to receive.',
      choices: [
        { text: 'Hold the line. Order the Legion to dig in.',
          effects: { momentum: -2, faculty: -3, setFlags: { nezleStalemate: true } } },
        { text: 'Withdraw the Legion. Bring them home.',
          effects: { momentum: -6, unity: -5, faculty: 2, setFlags: { nezleWithdrawn: true } } }
      ]
    },
    {
      id: 'ro16_congress',
      week: -1,
      handler: 'any',
      title: 'The XXX Congress of the RO16',
      body: 'The Leaders of \'16 are holding their 30th Congress. But the IIA has leaked damning evidence about their leader\'s corruption. The Red Front is watching closely.',
      condition: function(st) { return st.week > 12 && st.raw.ro16 && !st.flags.ro16CongressDone; },
      choices: [
        { text: 'Let the chips fall where they may.', note: 'The Red Front will intervene if they are strong enough.', effects: { ro16Congress: 'continue' } }
      ]
    },

    /* ============================================================
     * MID-GAME CRISIS EVENTS (Weeks 25 - 80)
     * ============================================================ */
    
    // 1. The Midterm Slump
    {
      id: 'midterm',
      week: -1,
      handler: 'any',
      title: 'The Midterm Slump',
      body: 'The honeymoon phase is over. The student body is exhausted by politics, and the faculty is tired of the constant campaigning. Attendance at council meetings has dropped to an all-time low. If you don\'t do something, the council will become irrelevant.',
      condition: function(st) { return st.week >= 25 && st.week <= 35 && !st.eventDone['midterm']; },
      choices: [
        { 
          text: 'Host a massive school festival to boost morale.',
          note: 'Costs funds and volunteers, but unites the school.',
          effects: { funds: -30, vol: -5, unity: 10, demo: { freshmen: 4, athletes: 4, arts: 4 }, momentum: 3 } 
        },
        { 
          text: 'Implement mandatory council attendance for clubs.',
          note: 'Authoritarian. The faculty loves it, the students hate it.',
          effects: { faculty: 12, unity: -5, demo: { honor: 4, buskids: -5, gamers: -3 } } 
        },
        { 
          text: 'Lean into the apathy. Focus on backroom deals.',
          note: 'Ignore the public. Strengthen your coalition.',
          effects: { coalitionStability: 15, momentum: -3, demo: { freshmen: -2 } } 
        }
      ]
    },

    // 2. The Rival School Challenge
    {
      id: 'rival_school',
      week: -1,
      handler: 'any',
      title: 'The Rival School Challenge',
      body: 'A rival school across town has challenged your school to a debate and sports tournament. The whole district is watching. It is a chance to prove your school\'s superiority, but if you lose, it will be humiliating for your administration.',
      condition: function(st) { return st.week >= 35 && st.week <= 45 && !st.eventDone['rival_school']; },
      choices: [
        { 
          text: 'Go all in. Fund the debate team and the athletes.',
          note: 'High risk, high reward.',
          effects: { funds: -20, demo: { honor: 5, athletes: 6 }, momentum: 4 } 
        },
        { 
          text: 'Focus only on the debate team.',
          note: 'The faculty will approve, but the athletes will feel ignored.',
          effects: { demo: { honor: 6, athletes: -3 }, faculty: 8, momentum: 2 } 
        },
        { 
          text: 'Cancel our participation. We have bigger issues.',
          note: 'A safe choice, but it makes the school look weak.',
          effects: { momentum: -4, demo: { athletes: -4, freshmen: -2 }, unity: -2 } 
        }
      ]
    },

    // 3. The Cafeteria Mutiny
    {
      id: 'cafeteria_mutiny',
      week: -1,
      handler: 'any',
      title: 'The Cafeteria Mutiny',
      body: 'The cafeteria staff have walked out. The food quality has been declining for months, and the budget cuts pushed them over the edge. The students are hungry and angry. The faculty is demanding you fix it immediately.',
      condition: function(st) { return st.week >= 45 && st.week <= 55 && !st.eventDone['cafeteria_mutiny']; },
      choices: [
        { 
          text: 'Concede. Give them a massive raise from the council budget.',
          note: 'Solves the problem instantly. Costs a lot of money.',
          effects: { funds: -40, demo: { buskids: 8, freshmen: 5 }, faculty: 5 } 
        },
        { 
          text: 'Order the Dzehurjaca Legion to guard the kitchen.',
          note: 'The students will eat, but they will hate you for it.',
          effects: { faculty: 10, demo: { buskids: -8, gamers: -5 }, unity: -5 } 
        },
        { 
          text: 'Tell the students to bring their own lunch.',
          note: 'A truly terrible idea.',
          effects: { demo: { buskids: -10, freshmen: -10, honor: 2 }, momentum: -5 } 
        }
      ]
    },

    // 4. The Senior Exodus
    {
      id: 'senior_exodus',
      week: -1,
      handler: 'any',
      title: 'The Senior Exodus',
      body: 'The senior class has checked out. They are focused on graduation, college applications, and leaving this school behind. Your council is losing its most experienced members, and with them, a lot of institutional memory.',
      condition: function(st) { return st.week >= 55 && st.week <= 65 && !st.eventDone['senior_exodus']; },
      choices: [
        { 
          text: 'Throw a massive senior send-off.',
          note: 'They will remember you fondly.',
          effects: { funds: -15, demo: { seniors: 8, freshmen: 3 }, unity: 5 } 
        },
        { 
          text: 'Beg them to stay involved.',
          note: 'It looks desperate.',
          effects: { demo: { seniors: -5 }, unity: -3, momentum: -2 } 
        },
        { 
          text: 'Focus on the underclassmen. The future is theirs.',
          note: 'Shift your base of support.',
          effects: { demo: { freshmen: 6, buskids: 4, seniors: -6 }, momentum: 2 } 
        }
      ]
    },

    // 5. The Vandalism Scandal
    {
      id: 'vandalism',
      week: -1,
      handler: 'any',
      title: 'The Vandalism Scandal',
      body: 'The council chamber was vandalized overnight. Obscene graffiti is scrawled across the walls. The security cameras were conveniently turned off. Everyone is blaming everyone else. The faculty is demanding a witch hunt.',
      condition: function(st) { return st.week >= 65 && st.week <= 80 && !st.eventDone['vandalism']; },
      choices: [
        { 
          text: 'Launch a massive investigation.',
          note: 'Costs time and money, but finds the culprits (maybe).',
          effects: { funds: -10, demo: { honor: 4 }, faculty: 8 } 
        },
        { 
          text: 'Blame the Black League remnants.',
          note: 'An easy scapegoat. Unites the school against a common enemy.',
          effects: { demo: { freshmen: 3, honor: 3 }, party: { bl: 2 }, momentum: 3 } 
        },
        { 
          text: 'Ignore it. Paint over it and move on.',
          note: 'It makes you look weak.',
          effects: { faculty: -8, momentum: -2 } 
        }
      ]
    },
    {
      id: 'surman_theory',
      week: -1,
      handler: 'any',
      title: 'The Surman Theory',
      body: 'Without Red Front intervention, the RO16 leader has survived the scandal by purging moderates. They are now more violent than ever. But the Republican parties are organizing against them.',
      condition: function(st) { return st.flags.ro16CongressDone && !st.flags.ro16RedAffiliated && !st.flags.surmanTheoryDone; },
      choices: [
        { text: 'The Republican bloc is strong enough to crush them.', note: 'If IIA+Red+RB+PL > 25%, RO16 fades and forms a Red List.', effects: { surmanTheory: 'check' } }
      ]
    },
    {
      id: 'ro16_revolution',
      week: -1,
      handler: 'any',
      title: 'THE REVOLUTION OF 16',
      body: 'The RO16 has launched an armed revolution! They are storming the school council. The Dzehurjaca Legion is waiting for your orders. Will you support the revolution, or stand aside?',
      condition: function(st) { return st.flags.surmanTheoryDone && !st.flags.ro16Faded && !st.flags.ro16RevoltTriggered; },
      choices: [
        { text: 'Support the RO16 revolution.', note: 'The Dzehurjaca will fight with them. If they win, a socialist utopia is born.', effects: { ro16Revolt: 'support' } },
        { text: 'Stand aside. Let them fight the faculty.', note: 'The Dzehurjaca stays neutral. The Republican parties will benefit if the revolution fails.', effects: { ro16Revolt: 'stand_aside' } },
        { text: 'Crush the revolution with the Dzehurjaca.', note: 'If it fails, the Republicans will be boosted.', effects: { ro16Revolt: 'crush' } }
      ]
    },

    /* ============================================================
     * WEEK 13 — Branch B: Qualia Falls
     * ============================================================ */
    {
      id: 'week13_qualia_falls', week: 13, handler: 'ZMP',
      condition: function (st) {
        return st.flags && st.flags.dzehurjacaToNezle &&
          dzehurjacaStrength(st) > redRbBlStrength(st);
      },
      title: 'Qualia Falls',
      body: 'The Legion has broken the valley roads and pushed the Red Front back to Qualia. The town has fallen. The Red Front and Red Bench are trapped in the valley. The Marshal is asking the council for orders — annexation, vassalage, or terms.',
      choices: [
        { text: 'Annex them. Full incorporation into the ZMP.',
        
          effects: { demo: { buskids: 6, freshmen: 4 }, momentum: 6, unity: 3,
            setFlags: { qualiaAnnexed: true, qualiaVassalised: false, qualiaZalianRights: false } } },
        { text: 'Vassalise them. A new federation.',
          
          effects: { momentum: 4, unity: -2, faculty: 2,
            setFlags: { qualiaVassalised: true, qualiaAnnexed: false, qualiaZalianRights: false,
                        zspZlpFormed: true, redRbReformed: true } } },
        { text: 'Rights for the Zalians. A settlement.',
          
          effects: { demo: { buskids: 3, freshmen: 3, honor: 4 }, unity: 5, faculty: 5,
            setFlags: { qualiaZalianRights: true, qualiaAnnexed: false, qualiaVassalised: false } } }
      ]
    },

    /* ============================================================
     * WEEK 16 — Second Zalgrilian Civil War (launch trigger)
     * ============================================================ */
    {
      id: 'week16_second_civil_war', week: 16, handler: 'ZMP',
      condition: function (st) {
        return st.flags && st.flags.nezleStalemate && !st.civilWar;
      },
      title: 'The Second Zalgrilian Civil War',
      body: 'The stalemate at Nezle has broken into open war. But the lines are not what you expected. The ZPF has declared for the Zalian Republic in the valley. The ZMP is being asked to choose: crown or council. You choose neither. You choose the ZMP. The war is ZMP against ZPF.',
      choices: [
        {
          text: 'Mobilize the ZMP.',
        
          effects: { unity: 2, momentum: 2, setFlags: { civilWarStarted: true } }
        }
      ]
    },

    /* ============================================================
     * WEEK 16 — Qualia Annexed
     * ============================================================ */
    {
      id: 'week16_qualia_annexed', week: 16, handler: 'ZMP',
      condition: function (st) { return st.flags && st.flags.qualiaAnnexed; },
      title: 'Qualia Absorbed',
      body: 'The annexation of Qualia is complete. The Red Front and Red Bench have been dissolved into the ZMP. Their remnants continue to fight in the eastern districts — the Black League is now openly backing them.',
      choices: [
        { text: 'Integrate them. Full absorption.',
          effects: { party: { red: -10, rb: -10, bl: 2, ZMP: 4 }, momentum: 2, unity: -2,
            setFlags: { redRbAbsorbed: true } } }
      ]
    },

    /* ============================================================
     * WEEK 16 — ZSP and ZLP Form
     * ============================================================ */
    {
      id: 'week16_qualia_vassalised', week: 16, handler: 'ZMP',
      condition: function (st) {
        return st.flags && st.flags.qualiaVassalised && !st.flags.zspZlpFormed;
      },
      title: 'The ZSP and ZLP Form',
      body: 'The vassalisation of Qualia has split the Red Front and Red Bench. Moderate splinters have formed two new parties — the ZSP and the ZLP. They have taken a shade of green as their colour.',
      choices: [
        { text: 'Recognise them. Bring them into the list.',
          effects: { party: { red: -6, rb: -6 }, momentum: 3, unity: 1, faculty: 2,
            setFlags: { zspZlpFormed: true } } }
      ]
    },

    /* ============================================================
     * WEEK 16 — Rights for the Zalians
     * ============================================================ */
    {
      id: 'week16_qualia_zalian_rights', week: 16, handler: 'ZMP',
      condition: function (st) { return st.flags && st.flags.qualiaZalianRights; },
      title: 'Rights for the Zalians',
      body: 'The Zalians have accepted protected status. The Red Front has agreed to a settlement, and the Legion has withdrawn from the valley.',
      choices: [
        { text: 'A quiet triumph.',
          effects: { party: { rb: -2, red: -2, ZMP: 4 }, unity: 3, faculty: 3, momentum: 2,
            setFlags: { zalianRights: true } } }
      ]
    },

    /* ============================================================
     * WEEK 21 — Field Day Parliament Vote
     * ============================================================ */
    {
      id: 'week21_field_day', week: 21, handler: 'ZMP',
      title: 'The Field Day Vote',
      body: 'The council has tabled the annual Field Day funding. It is, on its face, a procedural vote about a school fair. It is not. Every party has told its members how to vote, and the ZMP whip has not yet issued instructions.',
      isLegislatureVote: true,
      choices: [
        { text: 'Whip for Yes.',
          
          effects: { legislatureVote: 'field_day_for' } },
        { text: 'Whip for No.',
         
          effects: { legislatureVote: 'field_day_against' } },
        { text: 'Free vote.',
          
          effects: { legislatureVote: 'field_day_abstain' } }
      ]
    },
    // ==================== YEAR 1 (Weeks 1-52) ====================
    {
      id: 'vending',
      week: 1,
      title: 'The Vending Machine Question',
      body: 'The machine outside the gym has been broken since September. Facilities says it can be repaired, replaced with a healthier model, or removed. Everyone has an opinion and nobody has a budget.',
      choices: [
        { text: 'Demand a full repair, same snacks, no changes.',
          
          effects: { demo: { freshmen: 3, athletes: 2, buskids: 2, honor: -1 }, momentum: 2 } },
        { text: 'Push the healthy-options replacement.',
          
          effects: { demo: { honor: 4, arts: 1, athletes: -3, freshmen: -3 }, faculty: 12 } },
        { text: 'Let the Red Bench own the issue; stay out.',
          
          effects: { party: { rb: 2 }, affinity: { rb: 12 }, unity: -2 } }
      ]
    },
    {
      id: 'wifi',
      week: 3,
      title: 'The Blocked-Sites List',
      body: 'IT has quietly extended the content filter to cover game sites, streaming, and — by accident — the library catalogue. The lab crowd is furious and has a petition with 140 signatures.',
      choices: [
        { text: 'Champion the petition in full.',
          note: 'The gamers will remember this.',
          effects: { demo: { gamers: 8, freshmen: 2, honor: -2 }, faculty: -14, affinity: { iia: 18 }, momentum: 3 } },
        { text: 'Negotiate a narrow fix: unblock the catalogue only.',
          note: 'Sensible. Deeply unsatisfying.',
          effects: { demo: { honor: 3, gamers: -2 }, faculty: 6, unity: 2 } },
        { text: 'Support the filter. Study hall should be quiet.',
          note: 'A choice with consequences.',
          effects: { demo: { honor: 5, gamers: -10, arts: -1 }, faculty: 16, affinity: { zpf: 10, iia: -20 } } }
      ]
    },
   
{
  id: 'bl_ultimatum',
  week: 8,
  title: '⚫ THE BLACK LEAGUE ULTIMATUM',
  body: 'The Black League has sent a formal ultimatum to the council: dissolve the student government or face "the consequence." Their blackshirts patrol the hallways. Students are terrified. This is a declaration of war on democracy itself.',
  choices: [
    { 
      text: 'REJECT THEM IMMEDIATELY. We will not negotiate with fascists.',
      note: 'The ZMP stands firm. BL declares open war. -15% BL, but they become more aggressive and attack your supporters.',
      effects: { blUltimatum: 'reject' }
    },
    { 
      text: 'Call a crisis meeting. Rally all anti-fascist forces.',
      note: 'You unite the democratic parties against BL. IIA, ZPF, and Red Front support you. BL -8%.',
      effects: { blUltimatum: 'rally' }
    },
    { 
      text: 'Denounce them publicly. Expose their ideology to the school.',
      note: 'You expose BL as fascists. BL -5%, Unity +3, but they target your leaders.',
      effects: { blUltimatum: 'denounce' }
    }
  ]
},


{
  id: 'bl_rising',
  week: 12,
  title: '⚫ THE BLACK LEAGUE RISING',
  body: 'The Black League has grown to 25% support. Their message of "order through strength" is seducing disaffected students. They have declared the council "illegitimate" and are preparing for a "final solution" to student government.',
  choices: [
    { 
      text: 'LAUNCH ANTI-FASCIST CAMPAIGN. Expose their true nature.',
      note: 'You launch a massive counter-propaganda campaign. BL growth halted. Unity +5.',
      effects: { blRising: 'campaign' }
    },
    { 
      text: 'Form a Popular Front. Unite all democratic forces against BL.',
      note: 'IIA, ZPF, Red Front, and RB join forces against BL. BL -8%, but coalition is fragile.',
      effects: { blRising: 'popular_front' }
    },
    { 
      text: 'Criminalize their symbols. Ban their meetings and propaganda.',
      note: 'You outlaw BL activities. BL -5%, faculty supports you, but they go underground and become more dangerous.',
      effects: { blRising: 'criminalize' }
    }
  ]
},


{
  id: 'bl_collapse',
  week: -1,
  title: '⚫ THE BLACK LEAGUE COLLAPSES!',
  body: 'The Black League has overreached. Their brutality has turned the student body against them. But a cornered beast is most dangerous. They will not go quietly into the night.',
  choices: [
    { 
      text: 'FINISH THEM. Total victory. No mercy for fascists.',
      note: 'You pursue total victory. BL -15%, but they fight to the last. Some of your supporters may be hurt.',
      effects: { blCollapse: 'finish' }
    },
    { 
      text: 'Offer terms. Surrender their leaders and disband.',
      note: 'You offer a deal. BL -10%, leaders expelled. The ideology remains but is weakened.',
      effects: { blCollapse: 'terms' }
    },
    { 
      text: 'Let them dissolve naturally. Focus on healing the school.',
      note: 'BL dissolves slowly. -5% BL, but their ideas linger and may return.',
      effects: { blCollapse: 'dissolve' }
    }
  ],
  condition: function(st) { 
    var blSupport = window.Engine.getPartySupport(st, 'bl');
    return blSupport < 25 && blSupport > 10 && !st.blCollapseTriggered;
  }
},


{
  id: 'fascist_danger',
  week: 5,
  title: '🕵️ The Fascist Danger',
  body: 'Informants report that the Black League is recruiting among disaffected seniors and athletes. They promise "order" and "national renewal." Their leader speaks of "cleansing the school of weakness." This is how fascism starts.',
  choices: [
    { 
      text: 'Send agents to infiltrate. Know thy enemy.',
      note: 'You gain intelligence on BL. +3% ZMP, BL growth slowed. Knowledge is power.',
      effects: { fascistDanger: 'infiltrate' }
    },
    { 
      text: 'Publicly expose their ideology. The students must know the danger.',
      note: 'You expose BL as fascists. BL -2%, faculty +3, but they now target you.',
      effects: { fascistDanger: 'expose' }
    },
    { 
      text: 'This is just talk. Ignore them.',
      note: 'BL grows +5%. They gain momentum. Fascism thrives on indifference.',
      effects: { fascistDanger: 'ignore' }
    }
  ]
},

{
  id: 'debate_of_sud_west',
  week: 18,
  title: ' The Great Debate: Monarchy vs. Republic vs. Fascism',
  body: 'A student debate has erupted. Some argue for a return to the old monarchy (the "Natural Governing" vision). Others want a pure republic. The Black League wants neither - they want dictatorship. The school must choose its path.',
  choices: [
    { 
      text: 'Champion the monarchy. Order, tradition, and stability.',
      note: '+4 spirit, +3 unity. BL +5% (they attack you as "reactionaries").',
      effects: { debateOfSudWest: 'monarchy' }
    },
    { 
      text: 'Champion the republic. Freedom, democracy, and equality.',
      note: '+4 faculty, +3 ZMP. BL +3% (they attack you as "weak democrats").',
      effects: { debateOfSudWest: 'republic' }
    },
    { 
      text: 'Avoid the debate. Focus on governance, not philosophy.',
      note: 'No change. You lose influence on the ideological battlefield.',
      effects: { debateOfSudWest: 'avoid' }
    }
  ]
},

// THE INTELLECTUAL RESISTANCE - Week 24 (NEW)
{
  id: 'intellectual_resistance',
  week: 24,
  title: ' The Intellectual Resistance',
  body: 'A group of faculty and honor students have formed an underground resistance to the Black League. They need your support. But helping them is risky - the BL targets intellectuals and "enemies of the people."',
  choices: [
    { 
      text: 'Support them openly. We stand with the thinkers against fascism.',
      note: 'Faculty +8, honor +6. BL +4% (targets intellectuals). You become a target.',
      effects: { intellectualResistance: 'open' }
    },
    { 
      text: 'Support them secretly. Provide resources and protection.',
      note: 'Faculty +4, honor +3. BL +1% (they suspect but can\'t prove).',
      effects: { intellectualResistance: 'secret' }
    },
    { 
      text: 'Distance yourself. Too risky for the coalition.',
      note: 'Faculty -5, honor -3. BL gains confidence. Intellectuals feel abandoned.',
      effects: { intellectualResistance: 'distance' }
    }
  ]
},

// THE ALLIANCE OF DEMOCRACIES - Week 30 (NEW)
{
  id: 'alliance_democracies',
  week: 30,
  title: ' The Alliance of Democracies',
  body: 'The ZMP, ZPF, IIA, and Red Front are discussing a formal alliance against the Black League. This would be the largest democratic coalition in school history. But can they trust each other?',
  choices: [
    { 
      text: 'Form the alliance. United we stand against fascism.',
      note: 'All anti-fascist parties +3% support. BL -8%. Unity +5. History will remember this.',
      effects: { allianceDemocracies: 'form' }
    },
    { 
      text: 'Support the alliance but keep ZMP independence.',
      note: 'You provide support. ZPF +3%, IIA +3%, ZMP +2%. BL -4%.',
      effects: { allianceDemocracies: 'support' }
    },
    { 
      text: 'Reject the alliance. The ZMP stands alone.',
      note: 'ZMP +2%, but ZPF -3%, IIA -3%. BL +5% as they exploit the division.',
      effects: { allianceDemocracies: 'reject' }
    }
  ],
  condition: function(st) { 
    return st.week > 28 && !st.allianceDemocraciesTriggered;
  }
},

// THE FALL OF THE BLACK LEAGUE - Week 40+ (NEW)
{
  id: 'bl_fall',
  week: -1,
  title: '🏳️ THE FALL OF THE BLACK LEAGUE!',
  body: 'The Black League is in retreat! Their leader has been arrested, and their followers are scattering. But the ideology remains, waiting for a new leader to arise. The school must decide what comes next.',
  choices: [
    { 
      text: 'De-Nazification. Purge their ideology from the school forever.',
      note: 'BL ideology eliminated. Long-term peace. Faculty +10. Unity +5. The school heals.',
      effects: { blFall: 'denazify' }
    },
    { 
      text: 'Rehabilitate them. Offer a path back to society.',
      note: 'Some BL members rejoin society. BL -5%. Others form a new, less dangerous party.',
      effects: { blFall: 'rehabilitate' }
    },
    { 
      text: 'Declare victory and move on. Let the past be the past.',
      note: 'BL dissolves quickly. But the ideas remain. They will return when the time is right.',
      effects: { blFall: 'declare' }
    }
  ],
  condition: function(st) { 
    var blSupport = window.Engine.getPartySupport(st, 'bl');
    return blSupport < 15 && st.battle3Won === true && !st.blFallTriggered;
  }
},
    {
      id: 'musical',
      week: 6,
      title: 'The Spring Musical Budget',
      body: 'Drama needs $600 for set construction. Athletics needs $600 for new away-game jerseys. There is $600.',
      choices: [
        { text: 'Fund the musical.',
          effects: { demo: { arts: 9, honor: 2, athletes: -6 }, affinity: { sportica: -14 } } },
        { text: 'Fund the jerseys.',
          effects: { demo: { athletes: 9, freshmen: 1, arts: -7 }, affinity: { sportica: 16 } } },
        { text: 'Split it down the middle and absorb the complaints.',
          note: 'Nobody is happy. Nobody is furious.',
          effects: { demo: { arts: 2, athletes: 2, honor: -1 }, unity: 4, momentum: -1 } },
        { text: 'Hold a joint fundraiser instead. Both, later.',
          note: 'Costs you time and volunteers.',
          effects: { demo: { arts: 4, athletes: 4 }, vol: -3, funds: -10, unity: 3 } }
      ]
    },
    
    {
      id: 'buses',
      week: 10,
      title: 'The 3:15 Problem',
      body: 'Every club meets after the late buses leave. The far-route riders have never attended a single council event. Someone has finally said this out loud at a meeting.',
      choices: [
        { text: 'Move all council business to lunch periods.',
          note: 'Radical accessibility. Chaotic logistics.',
          effects: { demo: { buskids: 12, freshmen: 2, seniors: -3, arts: -2 }, faculty: -6, unity: -3 } },
        { text: 'Petition for one activity bus, twice a week.',
          effects: { demo: { buskids: 7, honor: 1 }, funds: -12, faculty: 4 } },
        { text: 'Note the concern in the minutes and move on.',
          effects: { demo: { buskids: -5 }, party: { bl: 3 }, unity: 2 } }
      ]
    },
    
    {
      id: 'battle_cauf',
      week: 14,
      title: ' The First Battle of Ca\'uf',
      body: 'The Field of Ca\'uf has erupted! The IIA and Black League are locked in a brutal struggle for control of the student council\'s agenda. The fighting has spilled into the hallways, and both sides are demanding your support. Your decision will shape the balance of power for months to come.',
      choices: [
        { 
          text: 'Send help to IIA. They are the lesser evil.',
          note: 'If IIA wins: ZMP gets slight boost, IIA gets major boost. If Black League wins: BL gets 10% support.',
          effects: { battle: 'help_iia' }
        },
        { 
          text: 'Declare Dzehurjaca independent. Let them fight each other.',
          note: 'If ZMP stronger than both: major support boost. If weaker: massive backlash, dissent rises.',
          effects: { battle: 'go_independent' }
        },
        { 
          text: 'This does not concern us. Let them destroy each other.',
          note: 'If IIA stronger: +1% support. If Black League stronger: +5% support for BL.',
          effects: { battle: 'ignore' }
        }
      ]
    },
    {
      id: 'zalian_list',
      week: 14,
      handler: 'ZMP',
      condition: function(st) {
        return (st.flags && (st.flags.qualiaAnnexed || st.flags.qualiaVassalised || st.flags.qualiaZalianRights)) && !st.flags.zalianListFormed;
      },
      title: 'The Zalian List Forms',
      body: 'In the aftermath of the Qualia conflict, the Zalian Autonomy Party (ZAP), the Zalgrilian Labour Party (ZLP), and the Zalian Independents (ZI) have formed a unified electoral bloc: The Zalian List. They will pool their votes in the next election and split the seats internally (50% ZAP, 30% ZLP, 20% ZI). Any coalition with them is now impossible.',
      choices: [
        { 
          text: 'Let them come.', 
          note: 'They pool their votes, but split the seats 50/30/20.',
          effects: { setFlags: { zalianListFormed: true } } 
        }
      ]
    },
    {
      id: 'semp_offer',
      week: 15,
      title: 'The Spirit Front Comes Calling',
      body: 'Mara Vance, who took a third of your organisers with her last spring, wants to talk about a merger. Her terms: co-chair billing, and Spirit Week becomes Spirit Fortnight.',
      choices: [
        { text: 'Accept the merger on her terms.',
          note: 'Absorbs SEMP support. Your moderates will not enjoy it.',
          effects: { merge: 'semp', spirit: 2, unity: -12, demo: { honor: -5, seniors: -3, freshmen: 5 } } },
        { text: 'Counter-offer: she joins, you stay chair, no fortnight.',
          note: 'A real negotiation. Might fail.',
          effects: { negotiateMerge: 'semp', unity: -3 } },
        { text: 'Refuse. Run against her.',
          effects: { party: { semp: 3 }, affinity: { semp: -25 }, unity: 6, momentum: 1 } }
      ]
    },
    {
      id: 'bl_propaganda',
      week: 16,
      title: '⚫ The Black League Propaganda Machine',
      body: 'The Black League has launched a massive propaganda campaign. Posters are everywhere, students are wearing their colors, and their message is spreading like wildfire.',
      choices: [
        { 
          text: 'Counter with your own propaganda.',
          note: 'You stop the bleeding. BL +1%, ZMP unchanged.',
          effects: { blPropaganda: 'counter' }
        },
        { 
          text: 'Expose their lies. Reveal the truth.',
          note: 'You damage their reputation. BL +0%, ZMP +2%.',
          effects: { blPropaganda: 'expose' }
        },
        { 
          text: 'Let them talk. Actions speak louder.',
          note: 'You lose the narrative. BL +8%, ZMP -5%.',
          effects: { blPropaganda: 'ignore' }
        }
      ]
    },
    {
      id: 'battle_cauf_2',
      week: 17,
      title: ' The Second Battle of Ca\'uf - The Great Defense',
      body: 'The Black League has regrouped and returned with twice the strength! The Field of Ca\'uf is once again a battlefield. This time, the stakes are higher than ever. The Black League seeks to crush the IIA and establish dominance over the student council. Your decision now will determine the fate of the school for years to come.',
      choices: [
        { 
          text: 'Send help to IIA. We must stop the Black League!',
          note: 'Black League is 2x stronger (4x if you lost the first battle).',
          effects: { battle2: 'help_iia' }
        },
        { 
          text: 'Declare Dzehurjaca independent. Let them fight.',
          note: 'If ZMP wins: major boost. If loses: massive backlash.',
          effects: { battle2: 'go_independent' }
        },
        { 
          text: 'This does not concern us. Stay neutral.',
          note: 'If IIA wins: +1%. If Black League wins: +5%.',
          effects: { battle2: 'ignore' }
        }
      ]
    },
    {
      id: 'scandal',
      week: 20,
      title: 'The Locker Room Photo',
      body: 'A photo is circulating of your treasurer using club funds for a very large pizza order. It was, in fairness a preety stupid idea',
      choices: [
        { text: 'Full transparency: publish every receipt.',
          note: 'Painful now, clean later.',
          effects: { demo: { honor: 4, arts: 2, freshmen: -3 }, faculty: 10, momentum: -3, unity: 3 } },
        { text: 'Remove the treasurer immediately.',
          note: 'Decisive. Costs you an operator.',
          effects: { demo: { honor: 3, seniors: -2 }, vol: -4, unity: -6, faculty: 8 } },
        { text: 'Say nothing and let the news cycle die.',
          effects: { demo: { honor: -6, freshmen: -2, gamers: 1 }, party: { bl: 4, republia: 3 }, faculty: -8 } },
        { text: 'Blame the Black League for leaking it.',
          note: 'Dangerous. Effective if it lands.',
          effects: { gamble: 'blame_bl' } }
      ]
    },

    {
  id: 'last_of_us',
  week: 22, // Make sure this matches your timeline
  title: 'The Last of Us',
  body: 'The Black League has massed its forces for a final assault on Ca\'uf. We lost the last battle, and our backs are against the wall. If they break through here, the school falls. The IIA is begging for your support, but the Black Legion outnumbers us. This is the decisive battle.',
  
  // THIS IS THE KEY:
  condition: function(st) { 
    return st.battle2Lost === true; 
  },

  choices: [
    {
      text: 'Call all allies. (Fight together with the IIA and Wein.)',
      note: 'Requires strong paramilitaries and good relations.',
      effects: { battle3: 'call_allies' }
    },
    {
      text: 'Fight alone. The ZMP needs no one.',
      note: 'High risk. Depends entirely on the Dzehurjaca Legion.',
      effects: { battle3: 'fight_alone' }
    }
  ]
},
    
    {
  id: 'last_dance',
  week: 22,
  title: ' The Last Dance - Victory Lap',
  body: 'The Black League is on the defensive! Having won the Second Battle of Ca\'uf, the ZMP and its allies now have the momentum. The Black League is retreating, but they are not yet broken. Will you pursue them and destroy them completely, or show mercy?',
  choices: [
    { 
      text: ' Call Wein for help', 
      note: 'Requires 70+ Wein relations. High chance of victory.',
      effects: { battle4: 'finish_them' }
    },
    { 
      text: ' Show mercy', 
      note: 'Let them retreat. They may return.',
      effects: { battle4: 'show_mercy' }
    },
    { 
      text: ' Go alone!', 
      note: 'Prove ZMP strength. No foreign aid. Highest risk, highest reward.',
      effects: { battle4: 'go_alone' }
    }
  ],
  condition: function(st) { return st.battle2Won === true; }
},
    {
      id: 'league',
      week: 25,
      title: 'The Inter-School League Vote',
      body: 'The district wants your school to keep hosting the inter-school activities league. It costs three Saturdays and brings four hundred visiting students through your hallways.',
      choices: [
        { text: 'Stay in the league. Host proudly.',
          effects: { gates: -3, demo: { athletes: 5, arts: 4, honor: 2, buskids: -2 }, faculty: 8 } },
        { text: 'Withdraw. Our school, our Saturdays.',
          note: 'Gate closure. Popular with the isolationist blocs.',
          effects: { gates: 4, demo: { buskids: 4, gamers: 3, athletes: -5, arts: -4 }, affinity: { bl: 15, semp: 12, republia: 10 } } },
        { text: 'Host, but charge admission and keep the gate.',
          effects: { gates: 1, funds: 30, demo: { honor: 2, arts: -1 }, faculty: -4 } }
      ]
    },
    {
      id: 'fall_of_center',
      week: 26,
      title: ' The Fall of the Center',
      body: 'The political center of the school is collapsing! IIA support has dropped below 9% - a critical threshold. The moderate students are fleeing to other parties. The ZPF is gaining, but the Black League is also absorbing many of these disaffected students.',
      choices: [
        { 
          text: 'Let the ZPF absorb the IIA\'s supporters.',
          note: 'ZPF gains half of IIA\'s support. The rest joins the Black League.',
          effects: { fallOfCenter: 'zpf' }
        },
        { 
          text: 'Try to absorb IIA into ZMP ourselves.',
          note: 'Competes with ZPF and Black League for IIA\'s supporters.',
          effects: { fallOfCenter: 'zmp' }
        },
        { 
          text: 'Let the chips fall where they may.',
          note: 'IIA splits naturally between ZPF and Black League.',
          effects: { fallOfCenter: 'natural' }
        }
      ],
      condition: function(st) { 
        var iiaSupport = window.Engine.getPartySupport(st, 'iia');
        return iiaSupport < 9;
      }
    },
    {
      id: 'red_rising',
      week: 30,
      title: 'The Red Rising',
      body: 'The Red Front has been organising in the cafeteria and the bus queue. They have a list of demands: free lunches, no detention, and a student veto over faculty appointments.',
      choices: [
        { text: 'Co-opt their demands. Take the energy.',
          note: 'The left loves you. The faculty does not.',
          effects: { demo: { buskids: 8, freshmen: 5, honor: -4 }, faculty: -15, affinity: { red: 20, zpf: -10 } } },
        { text: 'Condemn them. Order must be maintained.',
          note: 'The faculty will reward you. The left will not forget.',
          effects: { demo: { honor: 6, seniors: 4, buskids: -6 }, faculty: 15, affinity: { red: -25, republia: 10 } } },
        { text: 'Ignore them. They will burn out.',
          effects: { party: { red: 4 }, unity: -3, faculty: -5 } }
      ]
    },
    {
      id: 'midterm',
      week: 40,
      title: 'The Midterm Assessment',
      body: 'A school-wide survey asks students to rate the council. The results are... mixed. Your approval rating is public.',
      choices: [
        { text: 'Pivot to popular issues. Win back the crowd.',
          note: 'Works, but looks like pandering.',
          effects: { demo: { freshmen: 6, gamers: 4, honor: -2 }, momentum: 4, unity: -2 } },
        { text: 'Stay the course. Let the record speak.',
          note: 'Principled. Risky.',
          effects: { demo: { honor: 3, seniors: 2, freshmen: -3 }, faculty: 5, unity: 5 } },
        { text: 'Attack the survey. Its methodology is flawed.',
          note: 'Gaslighting the electorate. Bold.',
          effects: { demo: { freshmen: -4, seniors: -2, gamers: 1 }, party: { bl: 3, red: 3 }, momentum: -2 } }
      ]
    },
    {
      id: 'zpf_overture',
      week: 45,
      title: 'The Centre Party Approaches',
      body: 'The ZPF has been watching your coalition struggles. Their leader offers a quiet deal: support on key votes in exchange for a Catholic representative on every committee.',
      choices: [
        { text: 'Accept the deal. Governance matters more than purity.',
          note: 'The ZPF becomes a reliable partner. Your left flank mutters.',
          effects: { affinity: { zpf: 25 }, unity: -5, demo: { honor: 4, buskids: 2, freshmen: -2 } } },
        { text: 'Reject them. No religious tests for committees.',
          note: 'Principled. Costly.',
          effects: { affinity: { zpf: -15 }, demo: { honor: -3, freshmen: 2, gamers: 3 } } },
        { text: 'Counter-offer: one committee seat, no more.',
          note: 'A compromise that satisfies no one.',
          effects: { affinity: { zpf: 10 }, unity: 2, demo: { honor: 1, freshmen: -1 } } }
      ]
    },

    // ==================== YEAR 2 (Weeks 53-104) ====================
 
    {
      id: 'new_year',
      week: 55,
      title: 'The New Year, Same Problems',
      body: 'The new term begins with a faculty budget cut and a list of grievances longer than your arm. The honeymoon is over.',
      choices: [
        { text: 'Start a petition against the budget cut.',
          note: 'Popular with students. Faculty will retaliate.',
          effects: { demo: { freshmen: 6, seniors: 4, athletes: 3 }, faculty: -10, momentum: 3 } },
        { text: 'Work with the faculty to find savings.',
          note: 'Responsible. Unpopular.',
          effects: { demo: { honor: 5, freshmen: -3 }, faculty: 12, unity: 4 } },
        { text: 'Do nothing. Wait it out.',
          effects: { demo: { freshmen: -2, seniors: -2, honor: -1 }, unity: -4 } }
      ]
    },
    {
      id: 'republican_challenge',
      week: 60,
      title: 'The Republican Challenge',
      body: 'The Republicans have a list of "un-German" activities in the school: jazz music, modern art, and the French club. They want them banned.',
      choices: [
        { text: 'Denounce them. Defend the arts.',
          note: 'The right will hate you. The arts will love you.',
          effects: { demo: { arts: 10, gamers: 3, honor: 2 }, affinity: { republia: -25, bl: -10 }, faculty: 5 } },
        { text: 'Compromise: keep the French club, drop the jazz.',
          note: 'Nobody is happy. Everybody is slightly less angry.',
          effects: { demo: { arts: 2, honor: -1, athletes: 2 }, affinity: { republia: 5 }, unity: 2 } },
        { text: 'Support the ban. Our school, our culture.',
          note: 'The Republicans love you. The arts hate you.',
          effects: { demo: { arts: -12, honor: 3, buskids: 2 }, affinity: { republia: 20, red: -15 }, faculty: -8 } }
      ]
    },
    {
      id: 'summer_crisis',
      week: 70,
      title: 'The Summer Infrastructure Crisis',
      body: 'The gym roof is leaking, the computer lab has mold, and the cafeteria has a rat problem. The district has no money.',
      choices: [
        { text: 'Organise a student work crew. Fix it ourselves.',
          note: 'Ambitious. Requires volunteers.',
          effects: { demo: { athletes: 5, gamers: 3, buskids: 4 }, vol: -8, funds: -20, faculty: 10 } },
        { text: 'Lobby the district relentlessly.',
          note: 'Will take time. Might work.',
          effects: { demo: { honor: 4, seniors: 3 }, faculty: 5, momentum: -1 } },
        { text: 'Prioritise the gym. Everything else can wait.',
          note: 'Athletes first. As always.',
          effects: { demo: { athletes: 8, arts: -4, buskids: -3 }, affinity: { sportica: 15 } } }
      ]
    },
    {
      id: 'black_league_rising',
      week: 78,
      title: 'The Black League Rising',
      body: 'The Black League has been growing. They now have enough seats to be a real opposition force. They want to abolish the council entirely.',
      choices: [
        { text: 'Engage them. Bring them into the tent.',
          note: 'Dangerous. Could backfire.',
          effects: { affinity: { bl: 20 }, unity: -8, demo: { freshmen: 4, honor: -3 } } },
        { text: 'Isolate them. Make them irrelevant.',
          note: 'Works in the short term. They will be angry.',
          effects: { party: { bl: -3 }, affinity: { bl: -10 }, demo: { freshmen: 2, honor: 3 } } },
        { text: 'Redefine the council. Give them nothing to abolish.',
          note: 'Bold. Confusing. Might work.',
          effects: { demo: { freshmen: 3, gamers: 2, seniors: 2 }, unity: 5, momentum: 2 } }
      ]
    },
    {
      id: 'election_announcement',
      week: 85,
      title: 'The Election Announcement',
      body: 'The district announces that the school council elections will be held in 20 weeks. The campaign season begins now.',
      choices: [
        { text: 'Start your campaign immediately.',
          note: 'Early advantage. Fatigue risk.',
          effects: { demo: { freshmen: 5, athletes: 3, honor: 2 }, momentum: 5, funds: -15 } },
        { text: 'Wait. Let others wear themselves out.',
          note: 'Strategic patience.',
          effects: { demo: { seniors: 4, gamers: 2 }, funds: 10, momentum: -2 } },
        { text: 'Build a coalition first, then campaign.',
          note: 'Slow start. Strong finish.',
          effects: { demo: { honor: 3, buskids: 3 }, affinity: { zpf: 10, semp: 10 }, unity: 3 } }
      ]
    },
    {
      id: 'final_debate',
      week: 95,
      title: 'The Final Debate',
      body: 'The whole school in the gym, one microphone, seven candidates. This is your last chance to make an impression.',
      choices: [
        { text: 'Run on your record.',
          note: 'Scales with the momentum you have built.',
          effects: { debate: 'record' } },
        { text: 'Go after the Republicans directly.',
          effects: { debate: 'attack' } },
        { text: 'Make the whole speech about spirit and belonging.',
          effects: { debate: 'spirit' } },
        { text: 'Concede nothing, promise everything.',
          note: 'High variance.',
          effects: { debate: 'wild' } }
      ]
    },
    {
      id: 'last_endorsement',
      week: 100,
      title: 'The Last Endorsement',
      body: 'The school paper will endorse tomorrow morning. The editor, a senior with no particular loyalties, wants one sentence from you on what the council is actually for.',
      choices: [
        { text: '"To make the small things work."',
          note: 'Competence framing.',
          effects: { demo: { honor: 4, buskids: 4, seniors: 3, freshmen: -1 }, faculty: 6 } },
        { text: '"To make this place feel like ours."',
          note: 'Belonging framing.',
          effects: { demo: { freshmen: 6, arts: 4, athletes: 2, honor: -2 }, momentum: 3 } },
        { text: '"To stop the faculty deciding everything for us."',
          note: 'Confrontation framing.',
          effects: { demo: { gamers: 5, buskids: 3, freshmen: 3, honor: -3 }, faculty: -18, affinity: { bl: 12, zpf: -10 } } }
      ]
    },
    

{
  id: 'election_night',
  week: 104,
  title: 'Election Night',
  body: 'The ballots are counted in the library by two teachers and a very tired senior. The result goes up on the noticeboard at 8:40pm. Two years of work, decided now.',
  choices: [
    { text: 'Wait for the results with your team.',
      note: 'Nervous. Hopeful. Together.',
      effects: { demo: { freshmen: 1, seniors: 1, honor: 1 }, unity: 5 } },
    { text: 'Go home. There is nothing more you can do.',
      note: 'Resigned. Realistic.',
      effects: { demo: { gamers: 2, buskids: 2 }, unity: -2 } },
    { text: 'Call every favour you have ever earned.',
      note: 'Desperate. Might work.',
      effects: { demo: { freshmen: 3, athletes: 3, arts: 3 }, funds: -20, faculty: -5 } }
  ]
}, 
{
  id: 'relerise',
  week: -1,
  title: ' The Released Rise Again',
  body: 'The parties freed from the Black League\'s grasp are angry and ambitious. They see your weakness and are mobilizing to take your supporters. Their leaders are charismatic and their message is spreading fast.',
  choices: [
    { 
      text: 'Crush them quickly. Show no mercy.',
      note: 'Aggressive. May backfire. Parties eat 3-5% of your support.',
      effects: { releasedParties: 'crush' }
    },
    { 
      text: 'Negotiate with them. Offer them a place.',
      note: 'Diplomatic. They eat 1-3% of your support but relations improve.',
      effects: { releasedParties: 'negotiate' }
    },
    { 
      text: 'Ignore them. They will fade away.',
      note: 'Worst option. They eat 5-8% of your support.',
      effects: { releasedParties: 'ignore' }
    }
  ],
  condition: function(st) { 
    return st.blSplinterReleaseTriggered === true && 
           st.releasedPartiesEventTriggered !== true;
  }
},
{
  id: 'released_parties_surge',
  week: -1,
  title: ' The Released Surge',
  body: 'The parties that broke free from the Black League are on the march! They\'re holding rallies, recruiting your disaffected members, and eating into your support base. Their momentum is unstoppable.',
  choices: [
    { 
      text: 'Counter-rally. Match their energy.',
      note: 'Costs volunteers and funds. They eat 2-4% of your support.',
      effects: { releasedSurge: 'counter' }
    },
    { 
      text: 'Expose their past ties to the Black League.',
      note: 'Risky. May backfire. They eat 1-3% of your support but you damage their reputation.',
      effects: { releasedSurge: 'expose' }
    },
    { 
      text: 'Let them have their moment. Focus on your base.',
      note: 'They eat 4-6% of your support.',
      effects: { releasedSurge: 'ignore' }
    }
  ],
  condition: function(st) { 
    return st.blSplinterReleaseTriggered === true && 
           st.releasedSurgeTriggered !== true &&
           st.week > 30;
  }
},
{
  id: 'released_parties_victory',
  week: -1,
  title: ' The Released Triumph',
  body: 'The parties freed from the Black League have won a major victory! They\'ve taken over the cafeteria, the gym, and the student lounge. Your supporters are defecting in droves. This is a crisis.',
  choices: [
    { 
      text: 'Declare a state of emergency. Take control.',
      note: 'Authoritarian. They eat 2-3% of your support but you maintain control.',
      effects: { releasedVictory: 'emergency' }
    },
    { 
      text: 'Appeal to their better nature. Call for unity.',
      note: 'Hopeful. They eat 3-5% of your support.',
      effects: { releasedVictory: 'appeal' }
    },
    { 
      text: 'Fight them in the streets. No quarter.',
      note: 'Desperate. They eat 1-2% of your support but you lose faculty support.',
      effects: { releasedVictory: 'fight' }
    }
  ],
  condition: function(st) { 
    var releasedStrength = 0;
    var releasedParties = ['crnp', 'flo', 'nhp'];
    for (var i = 0; i < releasedParties.length; i++) {
      releasedStrength += window.Engine.getPartySupport(st, releasedParties[i]);
    }
    return st.blSplinterReleaseTriggered === true && 
           st.releasedVictoryTriggered !== true &&
           releasedStrength > 10;
  }
},// ==================== PRESIDENTIAL ELECTION EVENTS ====================


{
  id: 'field_day_vote',
  week: -1,
  title: ' Field Day Proposal',
  body: 'The council is voting on whether to hold a school-wide Field Day. Republia and the Black League oppose it, but all other parties support it. The outcome will shape school spirit for the year.',
  choices: [
    { 
      text: 'Vote FOR Field Day.',
      note: 'Popular with students. If passes: all middle parties gain 2% support.',
      effects: { legislatureVote: 'field_day_for' }
    },
    { 
      text: 'Vote AGAINST Field Day.',
      note: 'Supports Republia and BL position. If passes: BL gets 5% support.',
      effects: { legislatureVote: 'field_day_against' }
    },
    { 
      text: 'Abstain. Let others decide.',
      note: 'No immediate effect. You lose influence on the issue.',
      effects: { legislatureVote: 'field_day_abstain' }
    }
  ],
  condition: function(st) { return st.week > 20 && st.week < 80 && !st.fieldDayVoteDone; }
},
{
  id: 'budget_cut_vote',
  week: -1,
  title: ' Budget Cut Proposal',
  body: 'A proposal to cut the school budget by 15% is being voted on. The cuts would affect extracurricular activities, sports, and arts programs. The Black League supports it. Most other parties oppose it.',
  choices: [
    { 
      text: 'Vote FOR the budget cuts.',
      note: 'Saves funds. BL gains 3%. Faculty drops 5%.',
      effects: { legislatureVote: 'budget_cut_for' }
    },
    { 
      text: 'Vote AGAINST the budget cuts.',
      note: 'Preserves programs. ZMP gains 2%. Funds -10.',
      effects: { legislatureVote: 'budget_cut_against' }
    },
    { 
      text: 'Abstain. Let others decide.',
      note: 'No immediate effect.',
      effects: { legislatureVote: 'budget_cut_abstain' }
    }
  ],
  condition: function(st) { return st.week > 30 && st.week < 90 && !st.budgetCutVoteDone; }
},
{
  id: 'honor_code_vote',
  week: -1,
  title: ' Honor Code Reform',
  body: 'A proposal to reform the school honor code is being voted on. The new code would be stricter but more transparent. Republia supports it. The Red Front opposes it.',
  choices: [
    { 
      text: 'Vote FOR the honor code reform.',
      note: 'Republia gains 4%. Red loses 2%. Faculty +5.',
      effects: { legislatureVote: 'honor_code_for' }
    },
    { 
      text: 'Vote AGAINST the honor code reform.',
      note: 'Red Front gains 4%. Republia loses 2%. Unity -3.',
      effects: { legislatureVote: 'honor_code_against' }
    },
    { 
      text: 'Abstain. Let others decide.',
      note: 'No immediate effect.',
      effects: { legislatureVote: 'honor_code_abstain' }
    }
  ],
  condition: function(st) { return st.week > 40 && st.week < 100 && !st.honorCodeVoteDone; }
},

{
  id: 'red_front_resurgence',
  week: -1,
  title: ' Red Front Resurgence',
  body: 'The Red Front is back! They\'re organizing in the cafeteria and the bus queue. Their message of free lunches and student power is resonating with disaffected students. Your supporters are defecting to their cause.',
  choices: [
    { 
      text: 'Co-opt their demands. Steal their thunder.',
      note: 'You lose 3-5% support to Red Front, but gain some of their voters back.',
      effects: { partyResurgence: 'coopt_red' }
    },
    { 
      text: 'Crush them. No mercy for radicals.',
      note: 'You lose 5-8% support to Red Front. Faculty approves.',
      effects: { partyResurgence: 'crush_red' }
    },
    { 
      text: 'Ignore them. They will burn out.',
      note: 'You lose 8-12% support to Red Front! They grow stronger.',
      effects: { partyResurgence: 'ignore_red' }
    }
  ],
  condition: function(st) { 
    var redSupport = window.Engine.getPartySupport(st, 'red');
    return st.week > 26 && 
           st.week < 45 && 
           redSupport < 15 && 
           st.merged.indexOf('red') === -1 &&
           !st.redResurgenceTriggered;
  }
},
{
  id: 'iia_revival',
  week: -1,
  title: ' IIA Tech Revival',
  body: 'The Independent Innovation Alliance is making a comeback! They\'re promising better wifi, more funding for the computer lab, and a revolution in school technology. The gamers and tech-savvy students are listening.',
  choices: [
    { 
      text: 'Embrace technology. Match their promises.',
      note: 'You lose 3-4% support to IIA, but gain some back.',
      effects: { partyResurgence: 'coopt_iia' }
    },
    { 
      text: 'Attack their credibility. They failed before.',
      note: 'You lose 4-6% support to IIA. Risky strategy.',
      effects: { partyResurgence: 'crush_iia' }
    },
    { 
      text: 'Dismiss them. They have no real plan.',
      note: 'You lose 7-10% support to IIA! They gain momentum.',
      effects: { partyResurgence: 'ignore_iia' }
    }
  ],
  condition: function(st) { 
    var iiaSupport = window.Engine.getPartySupport(st, 'iia');
    return st.week > 27 && 
           st.week < 60 && 
           iiaSupport < 12 && 
           st.merged.indexOf('iia') === -1 &&
           !st.iiaRevivalTriggered;
  }
},
{
  id: 'zpf_rebirth',
  week: -1,
  title: ' ZPF Traditionalist Revival',
  body: 'The Centre Party is experiencing a rebirth! Traditional values, order, and stability are appealing to students tired of the chaos. The honor students and seniors are flocking to their banner.',
  choices: [
    { 
      text: 'Steal their platform. Become the party of order.',
      note: 'You lose 2-4% support to ZPF, but gain faculty support.',
      effects: { partyResurgence: 'coopt_zpf' }
    },
    { 
      text: 'Attack their religious agenda. Appeal to the secular.',
      note: 'You lose 4-7% support to ZPF. Polarizing.',
      effects: { partyResurgence: 'crush_zpf' }
    },
    { 
      text: 'Let them have their moment. They will fade.',
      note: 'You lose 6-9% support to ZPF! They grow strong.',
      effects: { partyResurgence: 'ignore_zpf' }
    }
  ],
  condition: function(st) { 
    var zpfSupport = window.Engine.getPartySupport(st, 'zpf');
    return st.week > 25 && 
           st.week < 70 && 
           zpfSupport < 10 && 
           st.merged.indexOf('zpf') === -1 &&
           !st.zpfRebirthTriggered;
  }
},
{
  id: 'semp_spirit_surge',
  week: -1,
  title: ' SEMP Spirit Surge',
  body: 'The Spirit Front is back with a vengeance! They\'re organizing massive spirit rallies and theme weeks. The freshmen and athletes are captivated by their energy and enthusiasm.',
  choices: [
    { 
      text: 'Out-spirit them. Match their energy.',
      note: 'You lose 3-5% support to SEMP, but gain momentum.',
      effects: { partyResurgence: 'coopt_semp' }
    },
    { 
      text: 'Criticize them as unserious. Focus on substance.',
      note: 'You lose 5-8% support to SEMP. Faculty approves.',
      effects: { partyResurgence: 'crush_semp' }
    },
    { 
      text: 'Let them party. We will govern.',
      note: 'You lose 8-12% support to SEMP! They become a major force.',
      effects: { partyResurgence: 'ignore_semp' }
    }
  ],
  condition: function(st) { 
    var sempSupport = window.Engine.getPartySupport(st, 'semp');
    return st.week > 25 && 
           st.week < 75 && 
           sempSupport < 8 && 
           st.merged.indexOf('semp') === -1 &&
           !st.sempSurgeTriggered;
  }
},
{
  id: 'republia_rising',
  week: -1,
  title: '🇺🇸 Republia Rising',
  body: 'The Republicans are gaining ground! Their message of order, discipline, and traditional values is resonating with students who are tired of progressive politics. The honor students and athletes are listening.',
  choices: [
    { 
      text: 'Move to the center. Defang their issues.',
      note: 'You lose 4-6% support to Republia, but avoid confrontation.',
      effects: { partyResurgence: 'coopt_republia' }
    },
    { 
      text: 'Attack their extremism. Expose their agenda.',
      note: 'You lose 5-8% support to Republia. Risky but could work.',
      effects: { partyResurgence: 'crush_republia' }
    },
    { 
      text: 'Ignore them. They are a fringe group.',
      note: 'You lose 9-13% support to Republia! They become a major force.',
      effects: { partyResurgence: 'ignore_republia' }
    }
  ],
  condition: function(st) { 
    var repSupport = window.Engine.getPartySupport(st, 'republia');
    return st.week > 30 && 
           st.week < 80 && 
           repSupport < 8 && 
           st.merged.indexOf('republia') === -1 &&
           !st.republiaRisingTriggered;
  }
},
{
  id: 'sportica_challenge',
  week: -1,
  title: ' Sportica Challenge',
  body: 'Sportica is making a play for the athletes! They\'re promising better facilities, more funding for sports, and a gym that\'s actually functional. The athletes are abandoning your coalition.',
  choices: [
    { 
      text: 'Invest in sports. Match their promises.',
      note: 'You lose 3-4% support to Sportica, but gain some back.',
      effects: { partyResurgence: 'coopt_sportica' }
    },
    { 
      text: 'Attack their single-issue politics. Focus on academics.',
      note: 'You lose 4-7% support to Sportica. Faculty approves.',
      effects: { partyResurgence: 'crush_sportica' }
    },
    { 
      text: 'Let the athletes decide. We have bigger issues.',
      note: 'You lose 6-10% support to Sportica! They grow strong.',
      effects: { partyResurgence: 'ignore_sportica' }
    }
  ],
  condition: function(st) { 
    var sporticaSupport = window.Engine.getPartySupport(st, 'sportica');
    return st.week > 35 && 
           st.week < 85 && 
           sporticaSupport < 10 && 
           st.merged.indexOf('sportica') === -1 &&
           !st.sporticaChallengeTriggered;
  }
},
{
  id: 'pl_pep_power',
  week: -1,
  title: ' PL Pep Power',
  body: 'The Pep League is organizing a massive school spirit campaign! Posters, glitter, rallies, and an unnerving amount of energy. The freshmen and arts students are flocking to their cause.',
  choices: [
    { 
      text: 'Join forces. Co-host a mega-rally.',
      note: 'You lose 2-3% support to PL, but gain momentum.',
      effects: { partyResurgence: 'coopt_pl' }
    },
    { 
      text: 'Criticize them as superficial. We have real work to do.',
      note: 'You lose 4-6% support to PL. Faculty approves.',
      effects: { partyResurgence: 'crush_pl' }
    },
    { 
      text: 'Let them have their fun. Focus on governance.',
      note: 'You lose 5-8% support to PL! They become a major force.',
      effects: { partyResurgence: 'ignore_pl' }
    }
  ],
  condition: function(st) { 
    var plSupport = window.Engine.getPartySupport(st, 'pl');
    return st.week > 40 && 
           st.week < 90 && 
           plSupport < 8 && 
           st.merged.indexOf('pl') === -1 &&
           !st.plPepTriggered;
  }
},
{
  id: 'rb_lunch_league',
  week: -1,
  title: ' Red Bench Lunch League',
  body: 'The Red Bench is organizing a student strike! They\'re demanding free lunches, better cafeteria food, and a student-run kitchen. The bus kids and freshmen are joining the rebellion.',
  choices: [
    { 
      text: 'Negotiate with them. Offer a compromise.',
      note: 'You lose 3-5% support to RB, but gain some back.',
      effects: { partyResurgence: 'coopt_rb' }
    },
    { 
      text: 'Crush the strike. No negotiations with militants.',
      note: 'You lose 5-8% support to RB. Faculty approves strongly.',
      effects: { partyResurgence: 'crush_rb' }
    },
    { 
      text: 'Let them strike. It will fizzle out.',
      note: 'You lose 7-11% support to RB! They become a major force.',
      effects: { partyResurgence: 'ignore_rb' }
    }
  ],
  condition: function(st) { 
    var rbSupport = window.Engine.getPartySupport(st, 'rb');
    return st.week > 45 && 
           st.week < 95 && 
           rbSupport < 8 && 
           st.merged.indexOf('rb') === -1 &&
           !st.rbLunchTriggered;
  }
},{
  id: 'presidential_announcement_sdahh',
  week: 10,
  title: ' Presidential Election Campaigning',
  body: 'It\'s campaign season. The school will elect a new Student Body President in 6 weeks! Candidates are emerging from all parties. The ZMP must decide who to support.',
  choices: [
    { 
      text: 'Support Ahmad VI - Our own ZMP candidate.',
      note: 'Full party support. The ZMP rallies behind its leader.',
      effects: { presidentialSdahh: 'zmp' }
    },
    { 
      text: 'Support Marcus Webb - A unity candidate.',
      note: 'Bipartisan appeal. Less risky.',
      effects: { presidentialSdahh: 'unity' }
    },
    { 
      text: 'Support Sara Chen - The ZPF candidate.',
      note: 'Strengthens the ZPF coalition.',
      effects: { presidentialSdahh: 'zpf' }
    },
    { 
      text: 'Support Karl Richter - The Red Front candidate.',
      note: 'Appeals to the left. Alienates moderates.',
      effects: { presidentialSdahh: 'red' }
    }
  ]
},
{
  id: 'presidential_campaigning_menu',
  week: 10,
  title: ' Campaign Menu',
  body: 'We have a plethora of campaign options at our disposal. Choose how to campaign for your candidate.',
  choices: [
    { 
      text: 'Rally the full strength of the Iron Front to support our candidate.',
      note: 'Boosts working class support. +3-5% support.',
      effects: { presidentialCampaigningSdahh: 'iron_front' }
    },
    { 
      text: 'Use our radio stations to broadcast in favor of our candidate.',
      note: 'Reaches middle class voters. Costs funds. +2-4% support.',
      effects: { presidentialCampaigningSdahh: 'radio' }
    },
    { 
      text: 'Impose party discipline. Rally our local organizations.',
      note: 'Requires high unity. Boosts our base support.',
      effects: { presidentialCampaigningSdahh: 'discipline' }
    },
    { 
      text: 'Accelerate campaign efforts in general.',
      note: 'Costs funds and volunteers. Boosts all demographics.',
      effects: { presidentialCampaigningSdahh: 'general' }
    },
    { 
      text: 'Let\'s hope the voters make the correct choice.',
      note: 'Do nothing. Minimal effect.',
      effects: { presidentialCampaigningSdahh: 'hope' }
    }
  ],
  condition: function(st) { return st.presidentialChoiceMade === true && st.presidentialCampaigningDone !== true; }
},
{
  id: 'presidential_campaign_focus',
  week: 10,
  title: ' Campaign Focus',
  body: 'Since it\'s election season, we are able to accelerate campaigning efforts. Choose your campaign focus. (You can pick two)',
  choices: [
    { 
      text: 'Focus on workers. +3% working class support.',
      note: 'Appeals to the working class.',
      effects: { presidentialCampaignFocus: 'workers' }
    },
    { 
      text: 'Focus on the middle class. +3% middle class support.',
      note: 'Appeals to the middle class.',
      effects: { presidentialCampaignFocus: 'middle' }
    },
    { 
      text: 'Focus on rural voters. +3% rural support.',
      note: 'Appeals to rural voters.',
      effects: { presidentialCampaignFocus: 'rural' }
    },
    { 
      text: 'Focus on the unemployed. +3% unemployed support.',
      note: 'Appeals to the unemployed.',
      effects: { presidentialCampaignFocus: 'unemployed' }
    },
    { 
      text: 'Checkout. End campaigning.',
      note: 'Continue to the next phase.',
      effects: { presidentialCampaignFocus: 'done' }
    }
  ],
  condition: function(st) { 
    return st.presidentialChoiceMade === true && 
           st.presidentialCampaigningDone !== true &&
           (st.presidentialCampaignCount || 0) < 2;
  }
},{
  id: 'presidential_election_results_sdahh',
  week: 16,
  title: ' PRESIDENTIAL ELECTION RESULTS',
  body: 'The votes are counted. The school has a new Student Body President. The results will shape the balance of power for the next year.',
  choices: [
    { 
      text: 'Continue',
      note: 'The election is over. Time to govern.',
      effects: { presidentialResultsSdahh: 'continue' }
    }
  ]
},// ==================== LOCAL CLASSROOM ELECTIONS ====================


{
  id: 'local_elections',
  week: 3,
  title: ' Local Classroom Elections Announced!',
  body: 'The classroom elections are being held across the school! Each classroom will elect representatives to the Student Council. This is where grassroots support is built. Your performance here will affect your national standing.',
  choices: [
    { 
      text: 'Campaign aggressively in every classroom.',
      note: 'Costs resources. Significant support gains.',
      effects: { LocalElection: 'aggressive' }
    },
    { 
      text: 'Focus on key classrooms. Quality over quantity.',
      note: 'Efficient. Good support gains in targeted areas.',
      effects: { LocalElection: 'targeted' }
    },
    { 
      text: 'Let local organizers handle it. Stay out.',
      note: 'Cheap. Some support gains, but less effective.',
      effects: { LocalElection: 'decentralized' }
    }
  ]
},
{
  id: 'local_elections_history',
  week: 19,
  title: ' Classroom Elections - History Wing',
  body: 'The History Wing is holding their classroom elections! The honor students and seniors dominate this area. The ZPF and Republia are strong here. How will you campaign?',
  choices: [
    { 
      text: 'Campaign on academic excellence.',
      note: 'Appeals to honor students. ZMP gains 2-4% support.',
      effects: { LocalElection: 'academic' }
    },
    { 
      text: 'Campaign on practical skills for the future.',
      note: 'Appeals to seniors. ZMP gains 2-3% support.',
      effects: { LocalElection: 'practical' }
    },
    { 
      text: 'Let the students decide. No campaign.',
      note: 'ZPF and Republia gain 3-5% support.',
      effects: { LocalElection: 'ignore_local' }
    }
  ]
},
{
  id: 'local_elections_science',
  week: 35,
  title: ' Classroom Elections - Science Wing',
  body: 'The Science Wing is holding their classroom elections! The gamers and tech-savvy students dominate this area. IIA and TIIA are strong here. How will you campaign?',
  choices: [
    { 
      text: 'Campaign on technology and innovation.',
      note: 'Appeals to gamers and tech students. ZMP gains 3-5% support.',
      effects: { LocalElection: 'tech' }
    },
    { 
      text: 'Campaign on funding for labs and equipment.',
      note: 'Appeals to all students. ZMP gains 2-4% support.',
      effects: { LocalElection: 'funding' }
    },
    { 
      text: 'Let the students decide. No campaign.',
      note: 'IIA and TIIA gain 4-6% support.',
      effects: { LocalElection: 'ignore_local' }
    }
  ]
},
{
  id: 'local_elections_arts',
  week: 51,
  title: ' Classroom Elections - Arts Wing',
  body: 'The Arts Wing is holding their classroom elections! The arts students and drama kids dominate this area. The Pep League and PL are strong here. How will you campaign?',
  choices: [
    { 
      text: 'Campaign on arts funding and cultural events.',
      note: 'Appeals to arts students. ZMP gains 3-5% support.',
      effects: { LocalElection: 'arts' }
    },
    { 
      text: 'Campaign on school spirit and community.',
      note: 'Appeals to PL. ZMP gains 2-4% support.',
      effects: { LocalElection: 'spirit' }
    },
    { 
      text: 'Let the students decide. No campaign.',
      note: 'PL and Pep League gain 4-6% support.',
      effects: { LocalElection: 'ignore_local' }
    }
  ]
},
{
  id: 'local_elections_athletics',
  week: 67,
  title: ' Classroom Elections - Athletics Wing',
  body: 'The Athletics Wing is holding their classroom elections! The athletes and sport-focused students dominate this area. Sportica and Red Bench are strong here. How will you campaign?',
  choices: [
    { 
      text: 'Campaign on sports facilities and funding.',
      note: 'Appeals to athletes. ZMP gains 3-5% support.',
      effects: { LocalElection: 'sports' }
    },
    { 
      text: 'Campaign on health and wellness.',
      note: 'Appeals to all students. ZMP gains 2-4% support.',
      effects: { LocalElection: 'health' }
    },
    { 
      text: 'Let the students decide. No campaign.',
      note: 'Sportica and Red Bench gain 4-6% support.',
      effects: { LocalElection: 'ignore_local' }
    }
  ]
},
{
  id: 'local_elections_social',
  week: 83,
  title: ' Classroom Elections - Social Sciences Wing',
  body: 'The Social Sciences Wing is holding their classroom elections! The debate kids and politically active students dominate this area. The Red Front and ZPF are strong here. How will you campaign?',
  choices: [
    { 
      text: 'Campaign on social justice and reform.',
      note: 'Appeals to Red Front. ZMP gains 3-5% support.',
      effects: { LocalElection: 'social_justice' }
    },
    { 
      text: 'Campaign on practical governance.',
      note: 'Appeals to moderates. ZMP gains 2-4% support.',
      effects: { LocalElection: 'governance' }
    },
    { 
      text: 'Let the students decide. No campaign.',
      note: 'Red Front and ZPF gain 4-6% support.',
      effects: { LocalElection: 'ignore_local' }
    }
  ]
},
{
  id: 'local_elections_final',
  week: 99,
  title: ' Classroom Elections - Final Round!',
  body: 'The final classroom elections are being held! Every wing is voting simultaneously. This will determine the composition of the Student Council for the final year. Your performance here will decide your legacy.',
  choices: [
    { 
      text: 'Go all out. Maximum effort.',
      note: 'Costs significant resources. Major support gains.',
      effects: { LocalElection: 'all_out' }
    },
    { 
      text: 'Focus on key wings. Strategic campaign.',
      note: 'Efficient. Good support gains in targeted areas.',
      effects: { LocalElection: 'strategic' }
    },
    { 
      text: 'Let the chips fall where they may.',
      note: 'Other parties gain significant support.',
      effects: { LocalElection: 'ignore_local' }
    }
  ]
},// ==================== POST-SPLINTER RUBICON SEQUENCE ====================

// 1. The Triggering Event (Week 22+)
{
  id: 'rubicon_activation',
  week: -1,
  title: 'Rubicon Mode: The Insurgency',
  body: 'The Black League has collapsed, but its ideology is not dead. The remnants have regrouped, forming violent splinter groups. They are not fighting for power; they are fighting for destruction. The school is on the brink of a civil war. This is the final battle.',
  choices: [
    { 
      text: 'Declare a State of Emergency. We must crush them now.',
      note: 'Immediate crackdown. High risk of backlash, but prevents them from growing further.',
      effects: { rubiconState: 'emergency' }
    },
    { 
      text: 'Go to ground. Wait for them to make a move.',
      note: 'Cautious approach. They will grow stronger, but you might see their traps.',
      effects: { rubiconState: 'ground' }
    },
    { 
      text: 'Appeal for unity. The school must stand together.',
      note: 'High risk. Can cause massive backlash if they are too strong.',
      effects: { rubiconState: 'appeal' }
    }
  ],
  // Activates if any splinter has 20%, or if you lost the second battle but won the third.
  condition: function(st) { 
    var crnp = window.Engine.getPartySupport(st, 'crnp');
    var flo = window.Engine.getPartySupport(st, 'flo');
    var nhp = window.Engine.getPartySupport(st, 'nhp');
    
    var splinterThreat = crnp >= 20 || flo >= 20 || nhp >= 20;
    var survivedBattle = (st.battle2Lost === true && st.battle3Won === true);
    
    return (splinterThreat || survivedBattle) && !st.rubiconTriggered;
  }
},

// 2. The People's Front (Week 23+)
{
  id: 'rubicon_popular_front',
  week: -1,
  title: 'The People\'s Front',
  body: 'Your call for emergency powers has been answered by the moderate parties. The IIA, Red Front, and even the ZPF are willing to join a "Popular Front" to stop the splinters. They demand one thing: an iron-fisted purge of all fascist elements. This is your moment to forge a grand alliance.',
  choices: [
    { 
      text: 'Form the Popular Front. Crush them all.',
      note: 'Massive boost to coalition allies, but the conflict will be brutal.',
      effects: { rubiconPopularFront: 'form' }
    },
    { 
      text: 'Refuse. The ZMP must not owe them anything.',
      note: 'They will leave you to fight alone. The battle will be harder.',
      effects: { rubiconPopularFront: 'refuse' }
    },
    { 
      text: 'Use them, but do not trust them. Keep them on a short leash.',
      note: 'Moderate boost, but they might defect if things go badly.',
      effects: { rubiconPopularFront: 'use' }
    }
  ],
  condition: function(st) { return st.rubiconState === 'emergency' && !st.rubiconPopularFrontTriggered; }
},

// 3. The Fascist Surge (Week 25+)
{
  id: 'rubicon_surge',
  week: -1,
  title: 'The Fascist Surge',
  body: 'The splinters have launched a coordinated attack across the school. They are not just distributing pamphlets; they are using violence. They have occupied the gym, the computer lab, and the cafeteria. Your supporters are being beaten in the hallways. The school is descending into chaos.',
  choices: [
    { 
      text: 'Order a general strike. Shut the school down until they stop.',
      note: 'Disrupts everything. The faculty will hate you. But it paralyzes the fascists.',
      effects: { rubiconSurge: 'strike' }
    },
    { 
      text: 'Call the police. Let the adults handle it.',
      note: 'Extremely risky. The police may arrest your supporters too. High faculty boost, massive student backlash.',
      effects: { rubiconSurge: 'police' }
    },
    { 
      text: 'Rally the resistance. We will fight them in the streets.',
      note: 'Total war. You win or you die. Massive casualties possible.',
      effects: { rubiconSurge: 'fight' }
    }
  ],
  condition: function(st) { return st.rubiconTriggered && !st.rubiconSurgeTriggered; }
},

// 4. The Moderates Betrayal (Week 27+)
{
  id: 'rubicon_betrayal',
  week: -1,
  title: 'The Betrayal',
  body: 'Your attempts to control the Popular Front have failed. They have seen through your manipulation. They are now using their power to side with the fascists, hoping to bring stability at the cost of your party. They are now enemies of the ZMP.',
  choices: [
    { 
      text: 'Purge them. Remove them from the government.',
      note: 'You become the sole authoritarian. You must now fight everyone.',
      effects: { rubiconBetrayal: 'purge' }
    },
    { 
      text: 'Beg for forgiveness. Stay in the coalition.',
      note: 'You will be their puppet. But you survive.',
      effects: { rubiconBetrayal: 'beg' }
    },
    { 
      text: 'Attack them. They are traitors.',
      note: 'You turn the ZMP against the entire government. Civil war.',
      effects: { rubiconBetrayal: 'attack' }
    }
  ],
  condition: function(st) { return st.rubiconPopularFront === 'use' && !st.rubiconBetrayalTriggered; }
},

// 5. The Last Stand (Week 30+)




{
  id: 'constitutional_convention',
  week: 50,
  title: '📜 THE CONSTITUTIONAL CONVENTION',
  body:
    'The council has voted to convene a constitutional convention. ' +
    'For the first time, the school will have a written charter — a document that defines ' +
    'what the council is for, who it answers to, and what rights students have. ' +
    'Every party has a vision. You have to build a majority for yours.',
  isConstitutionalConvention: true,
  choices: []
},

// Republia (far left) — revolutionary agenda
{
  id: 'republia_revolutionary_agenda',
  week: -1,
  title: ' Republia Calls for Revolution',
  body: 'Republia has called for the abolition of the council and the establishment of a general assembly of all students. They have the numbers to force a vote.',
  choices: [
    { text: 'Support the revolution.',
      note: 'Direct democracy now. The council dissolves.',
      effects: { demo: { buskids: 8, freshmen: 5, honor: -5 }, faculty: -12, unity: 5 } },
    { text: 'Oppose it. The council must survive.',
      note: 'You defend the institution. Republia attacks you.',
      effects: { party: { republia: 4 }, unity: -3, faculty: 5 } },
    { text: 'Refer it to committee. Kill it slowly.',
      note: 'Procedural. Nobody wins, nobody loses.',
      effects: { momentum: -2, unity: 1 } }
  ],
  condition: function(st) {
    return st.battle3Won && window.Engine.getPartySupport(st, 'republia') >= 12 && !st.eventDone['republia_revolutionary_agenda'];
  }
},

// TIIA (center-right) — Christian-democratic agenda
{
  id: 'tiia_family_values',
  week: -1,
  title: '🕊️ TIIA Proposes a Values Charter',
  body: 'TIIA has introduced a Values Charter — a statement of shared moral principles the school should teach. It is moderate, but it is religious.',
  choices: [
    { text: 'Support the Values Charter.',
      note: 'The religious blocs are pleased. The secular left is not.',
      effects: { demo: { honor: 5, seniors: 4, athletes: 3 }, faculty: 5, affinity: { zpf: -10, red: -10 } } },
    { text: 'Amend it to be strictly secular.',
      note: 'You keep the values, lose the religion.',
      effects: { demo: { honor: 2, gamers: 2, arts: 2 }, faculty: 2, unity: 2 } },
    { text: 'Reject it.',
      note: 'The secular left is pleased. TIIA moves closer to the right.',
      effects: { party: { tiia: 3 }, affinity: { tiia: -15 }, demo: { gamers: 3, arts: 3 } } }
  ],
  condition: function(st) {
    return st.battle3Won && window.Engine.getPartySupport(st, 'tiia') >= 10 && !st.eventDone['tiia_family_values'];
  }
},

// Red Front / RB (Trotskyism) — permanent revolution
{
  id: 'trotskyist_uprising',
  week: -1,
  title: ' The Trotskyists Move',
  body: 'Red Front and Red Bench have united. They demand a permanent revolution — the council dissolved, all authority transferred to a workers\' assembly, and the faculty stripped of disciplinary power.',
  choices: [
    { text: 'Join them. The revolution is now.',
      note: 'You commit to the far left. The center is horrified.',
      effects: { unity: 12, faculty: -20, demo: { buskids: 10, freshmen: 6, honor: -6 } } },
    { text: 'Refuse. The revolution must wait.',
      note: 'You split the left. They attack you as a traitor.',
      effects: { party: { red: 4, rb: 4 }, unity: -8, faculty: 3 } },
    { text: 'Negotiate. A limited revolution.',
      note: 'You give them something. They want everything.',
      effects: { unity: 4, faculty: -5, demo: { buskids: 4, freshmen: 3 } } }
  ],
  condition: function(st) {
    return st.battle3Won && window.Engine.getPartySupport(st, 'red') >= 10 && !st.eventDone['trotskyist_uprising'];
  }
},

// FLO (anarchist) — wildcard
{
  id: 'flo_autonomy',
  week: -1,
  title: '🏴 FLO Declares Autonomy',
  body: 'FLO has declared that the school should be governed by voluntary associations, not a central council. They have begun organizing autonomous student collectives.',
  choices: [
    { text: 'Support FLO. Let the collectives form.',
      note: 'The school becomes a patchwork. The council\'s authority withers.',
      effects: { unity: -10, momentum: 4, demo: { gamers: 5, arts: 4, buskids: 4 } } },
    { text: 'Crush FLO. The council must rule.',
      note: 'You break the anarchists. The left is angry.',
      effects: { party: { flo: -8 }, unity: 3, faculty: 5, affinity: { flo: -25 } } },
    { text: 'Absorb FLO. Bring them into the tent.',
      note: 'They join you, with conditions.',
      effects: { unity: 5, momentum: -2, demo: { gamers: 3, arts: 3 } } }
  ],
  condition: function(st) {
    return st.battle3Won && window.Engine.getPartySupport(st, 'flo') >= 8 && !st.eventDone['flo_autonomy'];
  }
},

// CrNP (right-wing) — the last gasp of the right
{
  id: 'crnp_restoration',
  week: -1,
  title: '⚫ CrNP Proposes Restoration',
  body: 'CrNP has introduced the Restoration Act — a proposal to return the school to traditional authority, faculty discipline, and religious instruction. They are a small party, but they are loud.',
  choices: [
    { text: 'Crush the Restoration Act.',
      note: 'You destroy the last of the right. They will not forget.',
      effects: { party: { crnp: -10 }, unity: 5, faculty: -3, affinity: { crnp: -30 } } },
    { text: 'Let it fail on its own.',
      note: 'It dies in committee. CrNP gains sympathy.',
      effects: { party: { crnp: 3 }, momentum: -1 } },
    { text: 'Support a moderate version.',
      note: 'You co-opt their language. They lose their edge.',
      effects: { party: { crnp: -4 }, demo: { honor: 3, seniors: 3 }, unity: -3 } }
  ],
  condition: function(st) {
    return st.battle3Won && window.Engine.getPartySupport(st, 'crnp') >= 5 && !st.eventDone['crnp_restoration'];
  }
},

/* ============================================================
 * SECURRO SIEGE — triggers only for the Securro faction
 * ============================================================ */
{
  id: 'securro_siege_trigger',
  week: -1,
  title: 'The Marshal\'s Offer',
  body:
    'The Enabling Act will never pass. Republia is semi-communist — it will ' +
    'not vote for emergency powers, and no combination of the remaining parties ' +
    'reaches thirty seats. The ZPF and the IIA will not sign for you. SEMP ' +
    'plus Republia is sixteen at best. The parliamentary path is dead. ' +
    'But the Dzehurjaca Legion is the strongest force in the valley, and the ' +
    'Marshal is standing in your doorway, and he is asking, very quietly, ' +
    'whether you would like the Legion to do something.',
  condition: function(st) {
    if (!st || st.faction !== 'securro') return false;
    if (st.week < 12) return false;
    if (!window.SecurroSiege) return false;
    return window.SecurroSiege.canStart(st);
  },
  choices: [
    {
      text: 'Bring the Legion to the council chamber. Demand the vote.',
      note: 'Begin the Siege. Win before the Legion breaks, the faculty calls out, or ten weeks expire.',
      effects: { startSecurroSiege: true }
    },
    {
      text: 'Withdraw the Legion. The Act is dead.',
      note: 'No siege. Securro loses the executive question. The party survives.',
      effects: { unity: -5, momentum: -3 }
    }
  ]
},

/* ============================================================
 * SECULARIST REFERENDUM — triggers only for the Secularist faction
 * ============================================================ */
{
  id: 'secularist_referendum_trigger',
  week: -1,
  title: 'The IIA\'s Proposal',
  body:
    'The IIA has proposed a joint charter — a secular, liberal constitution ' +
    'for the school. The ZPF has proposed a rival. The council has agreed to ' +
    'put both to a referendum. The question is whether you campaign for yours, ' +
    'or let the moment pass.',
  condition: function(st) {
    if (!st || st.faction !== 'secularists') return false;
    if (st.week < 18) return false;
    if (!window.SecularistReferendum) return false;
    if (st.ref && (st.ref.active || st.ref.done)) return false;
    return true;
  },
  choices: [
    {
      text: 'Campaign for the secular charter.',
      note: 'Begin the Referendum. Ten weeks to win a majority without losing your principles.',
      effects: { startSecularistReferendum: true }
    },
    {
      text: 'Back the ZPF charter. Unity above all.',
      note: 'No referendum. The ZPF charter gains legitimacy.',
      effects: { affinity: { zpf: 15 }, unity: -3 }
    },
    {
      text: 'Stay out of it. Let the school decide.',
      note: 'No referendum. The ZPF charter likely passes.',
      effects: { affinity: { zpf: 5 }, momentum: -2 }
    }
  ]
}
]; 

})(); 