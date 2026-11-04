/*
 * Class Council: A Coalition Simulator
 * Static game data: demographics, parties, internal factions, actions, events.
 */
window.GameData = (function () {
  'use strict';

  /* ---------------------------------------------------------------
   * Demographics of the student body. Weights sum to 1.
   * ------------------------------------------------------------- */
  var DEMOS = [
    { id: 'athletes', name: 'Athletes',        weight: 0.16, blurb: 'Team kids. Care about gym time, buses to away games, and the trophy case.' },
    { id: 'honor',    name: 'Honor Students',  weight: 0.15, blurb: 'GPA maximalists. Care about quiet study hall and transcript-safe policy.' },
    { id: 'gamers',   name: 'Gamers',          weight: 0.14, blurb: 'Computer lab regulars. Care about wifi, the blocked-sites list, and club funding.' },
    { id: 'arts',     name: 'Arts & Drama',    weight: 0.13, blurb: 'Theatre, band, art room. Care about the spring musical budget above all.' },
    { id: 'freshmen', name: 'Freshmen',        weight: 0.18, blurb: 'Largest bloc, softest loyalties. Persuadable, forgetful, easily excited.' },
    { id: 'seniors',  name: 'Seniors',         weight: 0.14, blurb: 'Short time horizons. Care about prom, parking, and senior privileges.' },
    { id: 'buskids',  name: 'Bus Riders',      weight: 0.10, blurb: 'Commuters from the far routes. Anything after 3:15pm excludes them.' }
  ];

  /* ---------------------------------------------------------------
 * Relations - Party relationship stages
 * ------------------------------------------------------------- */
var RELATION_STAGES = {
  HOSTILE: { value: 0, label: 'Hostile', coalitionChance: 0.05, absorbChance: 0 },
  COLD: { value: 20, label: 'Cold', coalitionChance: 0.15, absorbChance: 0 },
  COOL: { value: 40, label: 'Cool', coalitionChance: 0.35, absorbChance: 0 },
  NEUTRAL: { value: 50, label: 'Neutral', coalitionChance: 0.50, absorbChance: 0 },
  WARM: { value: 65, label: 'Warm', coalitionChance: 0.75, absorbChance: 0.05 },
  FRIENDLY: { value: 80, label: 'Friendly', coalitionChance: 0.90, absorbChance: 0.15 },
  VERY_FRIENDLY: { value: 95, label: 'Very Friendly', coalitionChance: 0.98, absorbChance: 0.40 }
};

function getRelationStage(value) {
  if (value >= 95) return RELATION_STAGES.VERY_FRIENDLY;
  if (value >= 80) return RELATION_STAGES.FRIENDLY;
  if (value >= 65) return RELATION_STAGES.WARM;
  if (value >= 50) return RELATION_STAGES.NEUTRAL;
  if (value >= 40) return RELATION_STAGES.COOL;
  if (value >= 20) return RELATION_STAGES.COLD;
  return RELATION_STAGES.HOSTILE;
}

function getCoalitionChance(value) {
  return getRelationStage(value).coalitionChance;
}

function getAbsorbChance(value) {
  return getRelationStage(value).absorbChance;
}

/* ---------------------------------------------------------------
 * Relations Actions - Improve relations with other parties
 * ------------------------------------------------------------- */
var RELATIONS_ACTIONS = [
  { 
    id: 'relations_talk', 
    name: ' Diplomatic Talks', 
    ap: 1, 
    budget: 5, 
    vol: 1,
    desc: 'Send envoys to improve relations with a party.',
    needsTarget: 'party',
    relationsOnly: true
  },
  { 
    id: 'relations_gift', 
    name: ' Offer Support', 
    ap: 1, 
    budget: 12, 
    vol: 0,
    desc: 'Offer campaign support to another party. Significant relation boost.',
    needsTarget: 'party',
    relationsOnly: true
  },
  { 
    id: 'relations_absorb', 
    name: ' Absorb Party', 
    ap: 2, 
    budget: 20, 
    vol: 3,
    desc: 'Absorb a party into ZMP. Requires Very Friendly relations.',
    needsTarget: 'party',
    relationsOnly: true
  },
  { 
    id: 'relations_wein', 
    name: ' Improve Wein Relations', 
    ap: 1, 
    budget: 5, 
    vol: 0,
    desc: 'Send envoys to the Arbeiter von Wein. Improves relations with Wein.',
    needsTarget: 'party',
    relationsOnly: true
  },
  { 
    id: 'relations_wein_gift', 
    name: ' Gift to Wein', 
    ap: 2, 
    budget: 15, 
    vol: 0,
    desc: 'Send a generous gift to Wein. Significantly improves relations.',
    needsTarget: 'party',
    relationsOnly: true
  },
  { 
    id: 'relations_wein_alliance', 
    name: ' Secure Wein Alliance', 
    ap: 3, 
    budget: 20, 
    vol: 5,
    desc: 'Formalize the alliance with Wein. Requires 70+ relations.',
    needsTarget: 'party',
    relationsOnly: true
  }
];

/* ---------------------------------------------------------------
 * Internal factions of the ZMP. Each ministry is assigned to one,
 * and influence / dissident trackers shift when ministers rotate.
 * ------------------------------------------------------------- */
/* ---------------------------------------------------------------
 * Internal factions of the ZMP — exactly the four ideological
 * factions the player chooses between at the start.
 * ------------------------------------------------------------- */
var MINISTER_FACTIONS = {
  secularists: {
    id: 'secularists',
    name: 'Secularists',
    color: '#3f6fb0',
    blurb: 'Liberals and moderates. Laws, not gods.',
    baseInfluence: 25,
    baseDissident: 10
  },
  securro: {
    id: 'securro',
    name: 'Securro-Zalgrilianists',
    color: '#2a5c8a',
    blurb: 'Strong executive, restored crown, disciplined state.',
    baseInfluence: 25,
    baseDissident: 5
  },
  zalgrilian: {
    id: 'zalgrilian',
    name: 'Zalgrilianists',
    color: '#5fae3c',
    blurb: 'Social monarchists. The crown above the council.',
    baseInfluence: 25,
    baseDissident: 5
  },
  jihadists: {
    id: 'jihadists',
    name: 'Jihadists',
    color: '#cc0000',
    blurb: 'The far-right religious wing. Democracy is blasphemy.',
    baseInfluence: 25,
    baseDissident: 20
  }
};

  /* ---------------------------------------------------------------
   * Parties. `base` is raw appeal per demographic (normalised later).
   * spirit / gates are the two ideological axes, 0-10.
   *
   * flagImg — path to PNG flag (optional; SVG fallback if missing)
   * flag    — SVG descriptor used when flagImg is absent or fails
   * blurb   — neutral description
   * blurbs  — perspective descriptions keyed by viewer faction
   * ------------------------------------------------------------- */
  var PARTIES = [
    {
      id: 'ZMP', name: 'Student Union Coalition', short: 'ZMP', tag: 'ZMP',
      color: '#5fae3c', player: true,
      flagImg: 'img/Zalgrilia.png',
      flag: { pattern: 'tricolor', colors: ['#5fae3c', '#ffffff', '#2a5c2a'], emblem: '✊' },
      blurb: 'Your big tent. Four squabbling factions under one banner.',
      blurbs: {
        ZMP:       'This is us. Four squabbling factions held together because the alternative is worse. We are the only party that can govern.',
        BL:        'The tyrannical coalition. They want to restore a monarchy, install a king, and give the faculty back its whip. They call it order. We call it a cage.',
        IIA:       'A cartel of traditionalists dressed as progressives. They talk about reform and then vote for the crown.',
        RED:       'The governing bloc of the bourgeoisie. They protect the crown, protect the faculty, and leave the workers with nothing.',
        ZPF:       'Our rivals on the right. Moderate, acceptable, too cautious. They could govern, if they had the stomach.',
        ZALGRILIAN:'The unworthy heirs of a movement they do not understand. They wear our colours and vote for compromise.',
        SECURRO:   'A failed experiment. Strong on paper, weak in the corridors. They held the council and lost the street.',
        JIHADISTS: 'A democratic farce. They call themselves the Union and then hand power to the faculty and the crown.'
      },
      spirit: 5, gates: 5, coalition: 100,
      base: { athletes: 20, honor: 22, gamers: 20, arts: 22, freshmen: 22, seniors: 20, buskids: 18 }
    },

    {
      id: 'zpf', name: 'Centre Party', short: 'ZPF', tag: 'ZPF', color: '#006400',
      flagImg: 'img/zpf.png',
      flag: { pattern: 'cross', colors: ['#006400', '#ffffff'], emblem: '✝' },
      blurb: 'The Catholic centre. Traditional values, social conservatism, moderate on economics.',
      blurbs: {
        ZMP:       'The only party that truly shares our goals. Traditionalist, but honest. Our natural coalition partner.',
        BL:        'Soft. Sentimental. They say they want order and then refuse to do what order requires. Useless.',
        IIA:       'The Catholic centre. Reasonable people. Slow to move, but they do not betray.',
        RED:       'The party of the sacristy. They pray for the poor and vote for the rich.',
        ZPF:       'This is us. The moderate centre. We hold the middle because the middle is the only place that governs.',
        ZALGRILIAN:'Clerical reactionaries. They dress up tradition in religion and call it virtue.',
        SECURRO:   'Natural allies. They understand that order requires discipline, and discipline requires faith.',
        JIHADISTS: 'Heretics. They claim the faith and then bow to a council of students.'
      },
      spirit: 4, gates: 5, coalition: 75,
      base: { athletes: 10, honor: 12, gamers: 8, arts: 8, freshmen: 8, seniors: 14, buskids: 10 }
    },

    {
      id: 'semp', name: 'Spirit Front', short: 'SEMP', tag: 'SEMP', color: '#8fd06a',
      flagImg: 'img/semp.png',
      flag: { pattern: 'star', colors: ['#8fd06a', '#ffffff'], emblem: '★' },
      blurb: 'Splintered off your party last spring. Still uses your old slogans.',
      blurbs: {
        ZMP:       'Former comrades. They took a third of our organisers and every banner we ever made. They still use our songs.',
        BL:        'A pack of enthusiasts with no plan. They will follow whoever shouts loudest.',
        ZPF:       'Sentimental. They confuse enthusiasm for strategy.',
        SEMP:      'This is us. The Spirit Front. We did not leave the ZMP — the ZMP left us.'
      },
      spirit: 10, gates: 7, coalition: 50,
      base: { athletes: 6, honor: 4, gamers: 6, arts: 6, freshmen: 6, seniors: 4, buskids: 4 }
    },

    {
      id: 'red', name: 'Red Front', short: 'RED', tag: 'RED', color: '#cc0000',
      flagImg: 'img/red.png',
      flag: { pattern: 'solid', colors: ['#cc0000'], emblem: '☭' },
      blurb: 'The militant left. Free everything, revolution now, faculty is the enemy.',
      blurbs: {
        ZMP:       'Radicals. Useful in a crisis, dangerous in a coalition. They will turn on us the moment we compromise.',
        BL:        'Communist filth. They want to burn the school down and hand it to the cafeteria workers.',
        IIA:       'The militant left. Loud, principled, and completely uninterested in getting elected.',
        RED:       'This is us. The Red Front. The workers will not be saved by ballots — they will save themselves.',
        ZPF:       'Godless revolutionaries. They would abolish the school and call it liberation.',
        REPUBLIA:  'Bolsheviks. They wave a red flag and call it progress.'
      },
      spirit: 2, gates: 2, coalition: 15,
      base: { athletes: 6, honor: 4, gamers: 10, arts: 8, freshmen: 6, seniors: 4, buskids: 8 }
    },

    {
      id: 'iia', name: 'Independent Innovation Alliance', short: 'IIA', tag: 'IIA', color: '#2244dd',
      flagImg: 'img/iia.png',
      flag: { pattern: 'diagonal', colors: ['#2244dd', '#ffffff'], emblem: '⚙' },
      blurb: 'Tech-forward moderates. Wants the wifi filter dead and the 3D printer funded.',
      blurbs: {
        ZMP:       'Technocrats. Reasonable on the wifi, unreliable on everything else. They would sell the crown for a server rack.',
        BL:        'The computer club. They think running a school is like running a spreadsheet.',
        IIA:       'This is us. We are the only party that thinks in systems. The rest think in slogans.',
        RED:       'Reformists. They want to fix the machine instead of breaking it. Cowards.',
        ZPF:       'Moderates with a technical bent. Reliable on procedure, unreliable on faith.'
      },
      spirit: 4, gates: 2, coalition: 60,
      base: { athletes: 10, honor: 18, gamers: 24, arts: 12, freshmen: 14, seniors: 12, buskids: 10 }
    },

    {
      id: 'pl', name: 'Pep League', short: 'PL', tag: 'PL', color: '#e0518f',
      flagImg: 'img/pl.png',
      flag: { pattern: 'bicolor', colors: ['#e0518f', '#ffffff'], emblem: '★' },
      blurb: 'Runs on posters, glitter, and an unnerving amount of energy.',
      blurbs: {
        ZMP:       'Charming and useless. Good for a rally, hopeless in a committee.',
        BL:        'The pep squad. They turn everything into a pageant and call it politics.',
        IIA:       'Enthusiastic. Low-information. Occasionally right by accident.'
      },
      spirit: 9, gates: 4, coalition: 65,
      base: { athletes: 12, honor: 6, gamers: 6, arts: 14, freshmen: 12, seniors: 6, buskids: 6 }
    },

    {
      id: 'rb', name: 'Red Bench', short: 'RB', tag: 'RB', color: '#d32020',
      flagImg: 'img/rb.png',
      flag: { pattern: 'solid', colors: ['#d32020'], emblem: '🍽' },
      blurb: 'Cafeteria militants. Free lunch, longer lunch, better lunch.',
      blurbs: {
        ZMP:       'Lunch-room radicals. Their one issue is real and their politics are not.',
        BL:        'Cafeteria mob. They will riot over pudding and call it solidarity.',
        RED:       'Comrades of convenience. They share our anger and none of our analysis.'
      },
      spirit: 5, gates: 3, coalition: 40,
      base: { athletes: 6, honor: 4, gamers: 8, arts: 8, freshmen: 8, seniors: 6, buskids: 10 }
    },

    {
      id: 'bl', name: 'Black League', short: 'BL', tag: 'BL', color: '#141414',
      flagImg: 'img/bl.png',
      flag: { pattern: 'solid', colors: ['#141414'], emblem: '⚔' },
      blurb: 'The detention bloc. Openly contemptuous of the council itself. Hostile.',
      blurbs: {
        ZMP:       'The enemy. They do not want to govern the school — they want to end it. Every vote we cast is a vote against them.',
        BL:        'This is us. The only party that understands that a school without order is a school without a future.',
        IIA:       'Fascists. They call themselves the League and dream of iron. They will be banned or they will win.',
        RED:       'The death squad. The bourgeoisie keeps them in reserve for the day the workers get too loud.',
        ZPF:       'A menace. They promise order and deliver terror. We must never sign a paper with them.',
        ZALGRILIAN:'The Black League is what happens when monarchism forgets its manners. We are not them. We will never be them.',
        SECURRO:   'The enemy of order. True order comes from the crown and the council, not from men in black shirts.',
        JIHADISTS: 'They have the right enemies and the wrong methods. They will be crushed before we are.'
      },
      spirit: 6, gates: 8, coalition: 5,
      base: { athletes: 4, honor: 2, gamers: 6, arts: 4, freshmen: 4, seniors: 6, buskids: 4 }
    },

    {
      id: 'tiia', name: 'Tech & Innovation Independent Alliance', short: 'TIIA', tag: 'TIIA', color: '#8866dd',
      flagImg: 'img/tiia.png',
      flag: { pattern: 'canton', colors: ['#8866dd', '#1a1a1a'], emblem: '◈' },
      blurb: 'Splintered from IIA. Radical tech-libertarians. Wants full internet freedom and decentralized governance.',
      blurbs: {
        ZMP:       'Children of the IIA. They have read one book about decentralisation and think it is the gospel.',
        IIA:       'A splinter of our own party. Radicals. They will return when they grow tired of shouting.'
      },
      spirit: 6, gates: 1, coalition: 25,
      base: { athletes: 0, honor: 0, gamers: 0, arts: 0, freshmen: 0, seniors: 0, buskids: 0 }
    },

    {
      id: 'republia', name: 'Republicans', short: 'REP', tag: 'REP', color: '#2a5c8a',
      flagImg: 'img/republia.png',
      flag: { pattern: 'vertical_tricolor', colors: ['#2a5c8a', '#ffffff', '#2a5c8a'], emblem: '⚖' },
      blurb: 'National conservative. Strong on order, suspicious of foreign influence, hostile to the left.',
      blurbs: {
        ZMP:       'Nationalists. They want the school to be a fortress. Sometimes useful, never trustworthy.',
        BL:        'Soft nationalists. They love the flag and despise the men who would defend it.',
        RED:       'Reactionaries with good manners. Same knife, different uniform.',
        ZPF:       'Allies on order, rivals on everything else. We can work with them for a season.'
      },
      spirit: 4, gates: 9, coalition: 10,
      base: { athletes: 12, honor: 18, gamers: 6, arts: 4, seniors: 12, freshmen: 6, buskids: 8 }
    },

    {
      id: 'sportica', name: 'Sportica', short: 'SPT', tag: 'SPT', color: '#17c0d8',
      flagImg: 'img/sportica.png',
      flag: { pattern: 'bicolor', colors: ['#17c0d8', '#ffffff'], emblem: '🏅' },
      blurb: 'Athletics first. Everything is a scheduling problem about the gym.',
      blurbs: {
        ZMP:       'Single-issue opportunists. They will vote with whoever gives them the gym first.',
        BL:        'Athletes. Fine men, poor politicians. They will follow whoever promises the better field.',
        SPORTICA:  'This is us. The body before the mind. A school without sport is a school without spirit.'
      },
      spirit: 7, gates: 5, coalition: 55,
      base: { athletes: 22, honor: 6, gamers: 6, arts: 4, freshmen: 8, seniors: 8, buskids: 6 }
    },

        {
      id: 'zalian', name: 'Zalian Party', short: 'ZAL', tag: 'ZAL', color: '#4a6b3a',
      flag: { pattern: 'solid', colors: ['#4a6b3a'], emblem: 'Z' },
      blurb: 'The Zalian minority party. Regional, quiet, and old — it has existed for over a hundred weeks, and has never held more than a seat or two.',
      blurbs: {
        ZMP:       'A regional remnant. They will never cross the threshold alone. They will always be someone\'s list partner.',
        BL:        'A minority party. Sentimental. They want protection for people who do not deserve it.',
        RED:       'Honest enough. Small enough to be ignored. When we are in power, they will get what they are owed.',
        ZPF:       'A regional voice. They know their districts. Not a threat.',
        IIA:       'Statistically irrelevant. Useful for a list.',
        SECURRO:   'We owe them order, and they owe us discipline.',
        ZALGRILIAN:'Our cousins from the valley. They chose the wrong side of the last war.',
        JIHADISTS: 'A minority. When we are strong, they will be grateful.'
      },
      spirit: 4, gates: 4, coalition: 40,
      base: { athletes: 1, honor: 2, gamers: 1, arts: 2, freshmen: 1, seniors: 3, buskids: 2 }
    },

    {
      id: 'other', name: 'Independents', short: 'Others', tag: 'IND', color: '#9aa0a6',
      flag: { pattern: 'solid', colors: ['#9aa0a6'], emblem: '·' },
      blurb: 'Assorted single-issue candidates and one persistent write-in campaign.',
      blurbs: {},
      spirit: 5, gates: 5, coalition: 50,
      base: { athletes: 2, honor: 2, gamers: 2, arts: 2, freshmen: 2, seniors: 2, buskids: 2 }
    },    {
      id: 'zup', name: 'Zalgrilian United Party', short: 'ZUP', tag: 'ZUP', color: '#9a5cd0',
      flag: { pattern: 'solid', colors: ['#9a5cd0'], emblem: '☭' },
      blurb: 'The USPD analogue. Split from the ZMP over the war. Left-wing revolutionaries.',
      blurbs: { ZMP: 'The splitters. They talk revolution while we do the governing.' },
      spirit: 8, gates: 2, coalition: 20,
      base: { athletes: 2, honor: 2, gamers: 8, arts: 8, freshmen: 6, seniors: 2, buskids: 8 }
    },
    {
      id: 'ro16', name: 'RO16', short: 'RO16', tag: 'RO16', color: '#ff3300',
      flag: { pattern: 'solid', colors: ['#ff3300'], emblem: '🔥' },
      blurb: 'Leaders of the 16th. The failed revolution. Heavily armed and uncompromising.',
      blurbs: { ZMP: 'Fanatics. They will burn the school before they let the crown return.' },
      spirit: 9, gates: 1, coalition: 5,
      base: { athletes: 2, honor: 1, gamers: 4, arts: 2, freshmen: 2, seniors: 1, buskids: 10 }
    },
    {
      id: 'si', name: 'Sanity League', short: 'Si', tag: 'Si', color: '#00aadd',
      flag: { pattern: 'cross', colors: ['#00aadd', '#ffffff'], emblem: '🏥' },
      blurb: 'The only thing stopping the Black League. Centrists who want the chaos to end.',
      blurbs: { ZMP: 'Reasonable people. We can work with them.' },
      spirit: 5, gates: 5, coalition: 50,
      base: { athletes: 6, honor: 12, gamers: 6, arts: 6, freshmen: 8, seniors: 10, buskids: 6 }
    },

  ];

  /* Display order for the influence panel */
  var POLL_ROWS = [
    { ids: ['ZMP'] }, 
    { ids: ['iia'] }, 
    { ids: ['zpf'] }, 
    { ids: ['republia'] }, 
    { ids: ['sportica'] }, 
    { ids: ['semp'] }, 
    { ids: ['red'] }, 
    { ids: ['rb'] }, 
    { ids: ['pl'] }, 
    { ids: ['bl'] }
  ];
    
  /* ---------------------------------------------------------------
   * Government Actions - Available when ZMP is in power
   * ------------------------------------------------------------- */
  var GOV_ACTIONS = [
    { id: 'gov_investigate', name: ' Investigate Black League', ap: 2, budget: 12, vol: 3,
      desc: 'Look into Black League activities. Can destabilize them but risky.' },
    { id: 'gov_economy', name: ' Finance & Economy', ap: 2, budget: 20, vol: 2,
      desc: 'Manage school budget and finances. Boosts ZMP support if successful.' },
    { id: 'gov_healthcare', name: ' School Healthcare', ap: 2, budget: 15, vol: 3,
      desc: 'Improve school healthcare services. Popular with students.' },
    { id: 'gov_education', name: ' Education Reform', ap: 2, budget: 10, vol: 2,
      desc: 'Reform curriculum and teaching. Faculty support changes.' },
    { id: 'gov_infrastructure', name: 'Infrastructure', ap: 2, budget: 25, vol: 4,
      desc: 'Fix school facilities. Costs a lot but builds lasting support.' },
    { id: 'gov_social', name: ' Social Programs', ap: 2, budget: 8, vol: 5,
      desc: 'Student welfare programs. Builds grassroots support.' }
  ]; 

  /* ---------------------------------------------------------------
   * Internal factions of the ZMP — the opening ideology question.
   * ------------------------------------------------------------- */
    var FACTIONS = [
    {
      id: 'secularists',
      n: 1,
      tint: 'tint-blue',
      line: 'The party must be a secular, liberal force.',
      name: 'The Secularists',
      desc: 'Liberals, moderates, and progressives. You believe the ZMP should be a party of laws, not gods.',
      spirit: 4, gates: 2, unity: 8,
      spectrum: 'left',
      mods: { gamers: 6, arts: 6, honor: 3, freshmen: 4, athletes: -3, seniors: -2 },
      affinity: { iia: 20, red: 10, zpf: -10, republia: -20, bl: -30 },
      canParticipateInElections: true,
      canFormCoalitions: true,
      canNegotiate: true,
      canUseViolence: false,
      canUseJihad: false,
      canUseSyndicate: false
    },
        {
      id: 'securro',
      n: 2,
      tint: 'tint-blue',
      line: 'Constitutional monarchy. Guided democracy. Rule through the council, not the street.',
      name: 'The Securro-Zalgrilianists',
      desc: 'The social wing of the Zalgrilianist tradition — Lambach\'s heirs. Pro-crown, pro-faculty, anti-Black-League, anti-communist. They want the school governed by a strong executive that answers to a restored constitutional monarch, not to a street mob or a committee. The Legion is for defense only.',
      spirit: 4, gates: 7, unity: 10,
      spectrum: 'center-right',
      mods: { honor: 2, seniors: 2, athletes: 1, buskids: -1, gamers: -1 },
      affinity: { zpf: 5, bl: -25, red: -20, iia: -5, semp: -5, republia: -10, sportica: 0 },
      canParticipateInElections: true,
      canFormCoalitions: true,
      canNegotiate: true,
      canUseViolence: false,
      canUseJihad: false,
      canUseSyndicate: false
    },
    {
      id: 'zalgrilian',
      n: 3,
      tint: 'tint-dark',
      line: 'The monarchy is the soul of the school.',
      name: 'The Zalgrilianists',
      desc: 'Social monarchists. The school needs a guiding hand, a crown above the council.',
      spirit: 7, gates: 6, unity: 0,
      spectrum: 'center-right',
      mods: { honor: 6, seniors: 5, athletes: 2, freshmen: -3, gamers: -3 },
      affinity: { zpf: 20, republia: 10, sportica: 5, red: -20, iia: -5, bl: -25 },
      canParticipateInElections: true,
      canFormCoalitions: true,
      canNegotiate: true,
      canUseViolence: true,
      canUseJihad: false,
      canUseSyndicate: true
    },
    {
      id: 'jihadists',
      n: 4,
      tint: 'tint-red',
      line: 'The ballot is a lie. Only divine law matters.',
      name: 'The Jihadists',
      desc: 'The far-right religious wing. Democracy is blasphemy. You will not participate in elections.',
      spirit: 10, gates: 9, unity: -20,
      spectrum: 'far-right',
      mods: { buskids: 6, freshmen: 4, athletes: 2, honor: -8, gamers: -6, arts: -10, seniors: -5 },
      affinity: { bl: 30, republia: 10, zpf: -20, red: -30, iia: -25, semp: -20 },
      canParticipateInElections: false,
      canFormCoalitions: false,
      canNegotiate: false,
      canUseViolence: true,
      canUseJihad: true,
      canUseSyndicate: true
    }
  ];

  /* ---------------------------------------------------------------
   * Advisors - Key figures in your party.
   * `faction` links to a MINISTER_FACTIONS entry so rotation shifts
   * influence / dissident.
   * ------------------------------------------------------------- */
  var ADVISORS = [
  /* =========================================================
   * The Party Ruler — one per ideology, chosen at match start.
   * Only the entry whose faction matches the player's appears
   * in the advisor panel.
   * ========================================================= */
  {
    id: 'ahmad_vi',
    name: 'Ahmad VI',
    role: 'Ruler of the Party',
    faction: 'zalgrilian',
    desc: 'The legitimate heir. Charismatic, patient, and unhurried. He has been the party\'s face since before the splinter.',
    effect: 'His presence unifies the old guard and reassures the faculty.',
    bonus: { unity: 5, faculty: 3 },
    traits: ['legitimate_heir', 'the_heavenly_sovereign']
  },
  {
    id: 'bennan',
    name: 'Bennan',
    role: 'Ruler of the Party',
    faction: 'secularists',
    desc: 'A lawyer by training and a liberal by conviction. Believes the school can be argued into a republic.',
    effect: 'His speeches read well in the paper and pass the faculty senate.',
    bonus: { unity: 4, faculty: 4, affinity: 5 },
    traits: ['man_of_letters', 'tory_democrat']
  },
  {
    id: 'ferid_viii',
    name: 'Ferid VIII',
    role: 'Ruler of the Party',
    faction: 'securro',
    desc: 'Lambach\'s political heir. Would rather govern through the council than the street, but will not be pushed.',
    effect: 'The Legion obeys him and the moderates tolerate him.',
    bonus: { unity: 6, faculty: 3, momentum: 1 },
    traits: ['little_chancellor', 'fortification_engineer']
  },
  {
    id: 'ruhaze',
    name: 'Ruhaze',
    role: 'Ruler of the Party',
    faction: 'jihadists',
    desc: 'A firebrand preacher turned political organiser. Believes the ballot is a lie and acts accordingly.',
    effect: 'The base adores him. The faculty do not.',
    bonus: { spirit: 3, momentum: 4, unity: -5 },
    traits: ['the_demagogue', 'ideological_crusader']
  },

  /* =========================================================
   * Cabinet and court — always available once the party is in
   * government, regardless of faction. These are the figures
   * that fill the four advisor posts (ruler, finance, radical,
   * security).
   * ========================================================= */
  {
    id: 'bojkanic',
    name: 'Bojkanic',
    role: 'Finance Minister',
    faction: 'secularists',
    desc: 'A banker before the war, an economist after it. Keeps the ledger and the coalition intact.',
    effect: 'Reduces the cost of cabinet actions and stabilises coalition finance.',
    bonus: { funds: 20, momentum: 2 },
    traits: ['the_weaver', 'placeman']
  },
  {
    id: 'bibovic',
    name: 'Bibovic',
    role: 'Finance Minister',
    faction: 'zalgrilian',
    desc: 'An old-style treasurer. Believes in silver, savings, and silence.',
    effect: 'Tightens the purse. The party grumbles; the treasury does not.',
    bonus: { funds: 15, unity: 2, momentum: -1 },
    traits: ['iron_chancellor', 'positivist']
  },
  {
    id: 'ajnurxe',
    name: 'Ajnurxe',
    role: 'Finance Minister',
    faction: 'jihadists',
    desc: 'A moderniser with an accountant\'s soul. Would rather reroute a budget than win an argument.',
    effect: 'Every action costs a little less. Every promise reads a little colder.',
    bonus: { funds: 18, momentum: 1, spirit: 1 },
    traits: ['technocrat', 'man_of_the_new_century']
  },
  {
    id: 'jennan',
    name: 'Jennan',
    role: 'Radical Wing Leader',
    faction: 'secularists',
    desc: 'A student organiser from the science wing. Believes in the pamphlet and the petition.',
    effect: 'Rallies the young and irritates the old.',
    bonus: { momentum: 3, spirit: 1, unity: 3 },
    traits: ['child_of_1848', 'voice_of_the_sections']
  },
  {
    id: 'bennan_the_elder',
    name: 'Bennan the Elder',
    role: 'Radical Wing Leader',
    faction: 'zalgrilian',
    desc: 'A veteran of the party\'s street campaigns. Still walks with a limp from a march in 1927.',
    effect: 'The veterans trust him. The moderates endure him.',
    bonus: { momentum: 4, unity: -2, spirit: 2 },
    traits: ['jacobin', 'man_on_horseback']
  },
  {
    id: 'enes',
    name: 'Enes',
    role: 'Radical Wing Leader',
    faction: 'securro',
    desc: 'A young officer from the Dzehurjaca Legion. Speaks softly and carries the Legion\'s favour.',
    effect: 'The Legion listens when he asks. So, reluctantly, does the council.',
    bonus: { momentum: 3, unity: 4, faculty: 1 },
    traits: ['warrior_code', 'young_marshall']
  },
  {
    id: 'kenji',
    name: 'Kenji',
    role: 'Radical Wing Leader',
    faction: 'jihadists',
    desc: 'A foreign volunteer who stayed after the war. Believes in the coming order.',
    effect: 'The Legion trusts him absolutely. The faculty trust him not at all.',
    bonus: { spirit: 3, momentum: 3, faculty: -3 },
    traits: ['guided_by_amaterasu', 'protector_of_the_empire']
  },
  {
    id: 'ferid',
    name: 'Ferid',
    role: 'Security Minister',
    faction: 'securro',
    desc: 'A quiet institutionalist. Believes order is the precondition of every other liberty.',
    effect: 'Improves internal security and stabilises coalitions under pressure.',
    bonus: { unity: 4, faculty: 2 },
    traits: ['fortification_engineer', 'tenacious_negotiator']
  },
  {
    id: 'muhaga',
    name: 'Muhaga',
    role: 'Security Minister',
    faction: 'zalgrilian',
    desc: 'A former police commissioner. Believes the school has too many committees and too few constables.',
    effect: 'The council is calmer when he is in the room. So are its enemies.',
    bonus: { unity: 5, faculty: -2, momentum: 2 },
    traits: ['grey_eminence', 'man_of_the_congress']
  },
  {
    id: 'aisha',
    name: 'Aisha',
    role: 'Security Minister',
    faction: 'secularists',
    desc: 'A jurist from the faculty of law. Ran the commission that catalogued the League\'s first cells.',
    effect: 'Every blackshirt in the school knows her name.',
    bonus: { unity: 3, faculty: 5, momentum: 1 },
    traits: ['the_incorruptible', 'positivist']
  },
  {
    id: 'rifud_i',
    name: 'Rifud I',
    role: 'Elder Statesman',
    faction: 'zalgrilian',
    desc: 'The party\'s longest-serving member. Remembers the founding congress as if it were last spring.',
    effect: 'Everyone at the table owes him something. Most of them know it.',
    bonus: { unity: 4, faculty: 4, affinity: 10 },
    traits: ['the_old_orator', 'man_of_the_congress']
  },
  {
    id: 'rifet_ix',
    name: 'Rifet IX',
    role: 'Court Philosopher',
    faction: 'zalgrilian',
    desc: 'A spirit maximalist with a chair at the faculty. Writes the party\'s manifestos and its prayers.',
    effect: 'Every clause of the platform sounds inevitable when he reads it aloud.',
    bonus: { spirit: 3, faculty: 3, momentum: 1 },
    traits: ['prince_of_the_church', 'positivist']
  },
  {
    id: 'aruisti_iii',
    name: 'Aruisti III',
    role: 'Court Philosopher',
    faction: 'securro',
    desc: 'A constitutional scholar who argues that the school needs a crown and the crown needs a council.',
    effect: 'Writes the constitutional briefs the faction fights over.',
    bonus: { unity: 4, faculty: 4, spirit: 1 },
    traits: ['the_jesuit', 'legitimist']
  },
  {
    id: 'jennan_the_younger',
    name: 'Jennan the Younger',
    role: 'Grassroots Organiser',
    faction: 'secularists',
    desc: 'Runs the party\'s canvassing operation out of a rented office above a bakery.',
    effect: 'Her organisers know every staircase in the building.',
    bonus: { volunteers: 6, momentum: 2, affinity: 5 },
    traits: ['eager_collaborator', 'the_weaver']
  },
  {
    id: 'hanna',
    name: 'Hanna',
    role: 'Grassroots Organiser',
    faction: 'jihadists',
    desc: 'Runs the Legion\'s recruiting cadres. Was seventeen when she ran her first district.',
    effect: 'Recruitment numbers have tripled since she took the post.',
    bonus: { volunteers: 5, momentum: 3, spirit: 1 },
    traits: ['voice_of_the_nation', 'child_of_1848']
  }
];

  /* ---------------------------------------------------------------
   * Weekly campaign actions. cost = action points.
   * ------------------------------------------------------------- */
var ACTIONS = [
  { id: 'canvass',   name: 'Canvass a bloc',    ap: 1, budget: 0,  vol: 3, needsTarget: 'demo',
    desc: 'Send volunteers to one demographic. Solid, unglamorous support.' },
  { id: 'rally',     name: 'Hold a rally',      ap: 1, budget: 14, vol: 4,
    desc: 'Gym-floor spectacle. Broad boost weighted by your faction, plus momentum.' },
  { id: 'posters',   name: 'Poster run',        ap: 1, budget: 5,  vol: 1,
    desc: 'Cheap, small, everywhere. Freshmen notice posters more than anyone admits.' },
  { id: 'recruit',   name: 'Recruit volunteers', ap: 1, budget: 0, vol: 0,
    desc: 'Sign up new canvassers at the club fair table. Always affordable.' },
  { id: 'fundraise', name: 'Bake sale',         ap: 1, budget: 0,  vol: 0,
    desc: 'Raise campaign funds. Scales with how many volunteers you have.' },
  { id: 'negotiate', name: 'Back-room talks',   ap: 1, budget: 4,  vol: 0, needsTarget: 'party',
    desc: 'Improve one rival party\'s willingness to join your coalition.' },
  { id: 'attack',    name: 'Negative flyers',   ap: 1, budget: 8,  vol: 2, needsTarget: 'party',
    desc: 'Hit a rival. Effective, but the faculty and your own moderates notice.' },
  { id: 'coalition', name: 'Build coalition',   ap: 2, budget: 10, vol: 2,
    desc: 'Intensive negotiations to bring a party into your governing coalition.' },
  { id: 'rally_foreign', name: ' Rally Foreign Support', ap: 2, budget: 15, vol: 3,
    desc: 'Gain support from Arbeiter von Wein. Unlocks Harvard and WHO advisors.' },
  { id: 'learn_economy', name: ' Learn Economy from Harvard', ap: 1, budget: 5, vol: 0,
    desc: 'Makes economy actions 25% more effective.' },
  { id: 'who_healthcare', name: ' WHO Healthcare Program', ap: 1, budget: 8, vol: 2,
    desc: 'WHO-backed healthcare initiatives. 25% more effective.' },
  // Paramilitary actions
  { id: 'train_militia', name: ' Train Paramilitaries', ap: 2, budget: 15, vol: 2,
    desc: 'Train your paramilitary forces. Increases training by 1 level.' },
  { id: 'equip_militia', name: ' Equip Paramilitaries', ap: 2, budget: 20, vol: 1,
    desc: 'Equip your paramilitary forces. Increases equipment by 1 level.' },
  { id: 'rally_militia', name: ' Rally Paramilitaries', ap: 1, budget: 5, vol: 3,
    desc: 'Boost morale of your paramilitary forces.' },
  { id: 'recruit_militia', name: ' Recruit Paramilitaries', ap: 1, budget: 8, vol: 2,
    desc: 'Recruit new members to your paramilitary forces.' },
  { id: 'dzehurjaca_charge_enhanced', name: ' DZEHURJACA CHARGE', ap: 3, budget: 30, vol: 5,
    desc: 'Lead the Dzehurjaca Legion in a desperate last stand. Uses paramilitary system.' },
  { id: 'form_list', name: 'Form Electoral List', ap: 1, budget: 5, vol: 1, needsTarget: 'party',
    desc: 'Offer a small party a place on your electoral list. Their votes will count towards your threshold.' },
];


  var ADVISOR_ACTIONS = [
  { id: 'advisor_rally', name: ' Rally the People', desc: 'Your advisors organize a massive rally. +5% ZMP support, +2 momentum.', effect: { zmp: 5, momentum: 2 }, cost: { ap: 1, budget: 10 } },
  { id: 'advisor_media', name: ' Media Campaign', desc: 'Advisors launch a media blitz. +4% ZMP, +3% faculty.', effect: { zmp: 4, faculty: 3 }, cost: { ap: 1, budget: 15 } },
  { id: 'advisor_grassroots', name: ' Grassroots Organizing', desc: 'Advisors build community support. +6% buskids, +4% freshmen.', effect: { buskids: 6, freshmen: 4 }, cost: { ap: 1, budget: 8 } },
  { id: 'advisor_policy', name: ' Policy Research', desc: 'Advisors develop new policies. +3% unity, +2% ZMP.', effect: { unity: 3, zmp: 2 }, cost: { ap: 1, budget: 5 } }
];

  /* ---------------------------------------------------------------
   * Traits — HOI4-style modifiers for advisors and leaders.
   * Each trait has an icon, a description, and an effects object
   * that keys off the game's own stats:
   *   unity, faculty, momentum, funds, volunteers, spirit, gates,
   *   affinity (party relations), support (party support %)
   * ------------------------------------------------------------- */
  var TRAITS = {
    // --- Political ---
    silent_workhorse: {
      icon: '▪',
      name: 'Silent Workhorse',
      desc: 'Works without fanfare. Every small thing lands a little harder.',
      effects: { momentum: 1, unity: 2 }
    },
    nation_builder: {
      icon: '🏛️',
      name: 'Nation Builder',
      desc: 'Prefers to build institutions rather than win arguments.',
      effects: { unity: 5, faculty: 3 }
    },
    ideological_crusader: {
      icon: '✊',
      name: 'Ideological Crusader',
      desc: 'Cannot let a principle go. The base loves it.',
      effects: { unity: 6, momentum: 1 }
    },
    compassionate_gentleman: {
      icon: '🤝',
      name: 'Compassionate Gentleman',
      desc: 'Softer touch. Better with the faculty and moderates.',
      effects: { faculty: 5, unity: 2 }
    },
    editor: {
      icon: '📰',
      name: 'Editor',
      desc: 'Knows how to write a headline. The message carries further.',
      effects: { momentum: 2, spirit: 1 }
    },
    deal_broker: {
      icon: '🤝',
      name: 'Deal Broker',
      desc: 'Finds the room where the real agreement happens.',
      effects: { affinity: 15 }
    },
    tenacious_negotiator: {
      icon: '🗣️',
      name: 'Tenacious Negotiator',
      desc: 'Will not sign until the terms are right.',
      effects: { affinity: 20, unity: 2 }
    },
    smooth_charmer: {
      icon: '💫',
      name: 'Smooth-Talking Charmer',
      desc: 'Every rival leaves the room liking him a little more.',
      effects: { affinity: 10, momentum: 1 }
    },
    university_rector: {
      icon: '🎓',
      name: 'University Rector',
      desc: 'The faculty listen when he speaks. Research moves faster.',
      effects: { faculty: 8, unity: 2 }
    },

    // --- Economic ---
    economist: {
      icon: '📈',
      name: 'Economist',
      desc: 'Keeps the treasury solvent and the burn rate low.',
      effects: { funds: 15 }
    },
    financial_expert: {
      icon: '💰',
      name: 'Financial Expert',
      desc: 'Cuts waste, finds revenue. Campaigns run cheaper.',
      effects: { funds: 20 }
    },
    captain_of_industry: {
      icon: '🏭',
      name: 'Captain of Industry',
      desc: 'Everything he touches gets built faster.',
      effects: { funds: 10, momentum: 1 }
    },
    war_industrialist: {
      icon: '⚙️',
      name: 'War Industrialist',
      desc: 'Understands that a legion needs boots, not slogans.',
      effects: { funds: 15, volunteers: 3 }
    },
    quartermaster: {
      icon: '📦',
      name: 'Quartermaster General',
      desc: 'Supplies never run short where he is.',
      effects: { volunteers: 5, funds: 5 }
    },

    // --- Military ---
    warrior_code: {
      icon: '⚔️',
      name: 'Warrior Code',
      desc: 'Believes in discipline above all. The Legion respects him.',
      effects: { unity: 3, momentum: 1 }
    },
    retired_officer: {
      icon: '🎖️',
      name: 'Retired Officer',
      desc: 'Trains the men as though war were still coming.',
      effects: { unity: 2, volunteers: 4 }
    },
    hawk: {
      icon: '🦅',
      name: 'Hawk',
      desc: 'Wants escalation. The base loves it; the moderates do not.',
      effects: { spirit: 2, unity: -3, momentum: 2 }
    },
    humble_appeaser: {
      icon: '🕊️',
      name: 'Humble Appeaser',
      desc: 'Would rather compromise than fight. Stability at a cost.',
      effects: { unity: 5, spirit: -2, momentum: -1 }
    },
    fortification_engineer: {
      icon: '🛡️',
      name: 'Fortification Engineer',
      desc: 'Turns any position into a defended one.',
      effects: { unity: 3, faculty: 2 }
    },

    // --- Ideological ---
    national_integralist: {
      icon: '🏴',
      name: 'National Integralist',
      desc: 'The nation above everything. Faith, order, unity.',
      effects: { unity: 8, spirit: 1 }
    },
    vengeful_industrialist: {
      icon: '🔥',
      name: 'Vengeful Industrialist',
      desc: 'Never forgets a slight. Grudges build factories.',
      effects: { funds: 10, momentum: 2 }
    },
    eager_collaborator: {
      icon: '👥',
      name: 'Eager Collaborator',
      desc: 'Finds a friend in every rival party.',
      effects: { affinity: 20, volunteers: 3 }
    },
    reluctant_interventionist: {
      icon: '⏸️',
      name: 'Reluctant Interventionist',
      desc: 'Will act only when it is already too late not to.',
      effects: { unity: 4, momentum: -1 }
    },

    // --- Leader traits ---
    dictator: {
      icon: '👑',
      name: 'Dictator',
      desc: 'Every decision is his. Every failure is his too.',
      effects: { unity: 10, momentum: 2 }
    },
    legitimate_heir: {
      icon: '👑',
      name: 'Legitimate Heir',
      desc: 'The party is his by right, not by election.',
      effects: { unity: 8, faculty: 3 }
    },
    the_heavenly_sovereign: {
      icon: '☀️',
      name: 'The Heavenly Sovereign',
      desc: 'Speaks with the weight of something older than the party.',
      effects: { unity: 6, spirit: 2 }
    },
    young_marshall: {
      icon: '⚔️',
      name: 'Young Marshall',
      desc: 'Young, aggressive, and convinced of his own destiny.',
      effects: { momentum: 3, unity: -3, spirit: 1 }
    },
    generalissimo: {
      icon: '🎖️',
      name: 'Generalissimo',
      desc: 'The army answers to him. The party answers to the army.',
      effects: { unity: 6, momentum: 2, spirit: 1 }
    },
    guided_by_amaterasu: {
      icon: '🌅',
      name: 'Guided by Amaterasu',
      desc: 'Believes the sun itself is on his side.',
      effects: { unity: 5, spirit: 2 }
    },
    protector_of_the_empire: {
      icon: '🛡️',
      name: 'Protector of the Eternal Empire',
      desc: 'The state is not a thing to be run — it is a thing to be defended.',
      effects: { unity: 7, faculty: 3 }
    },
    emperor_showa: {
      icon: '🏯',
      name: 'Emperor Shōwa',
      desc: 'Towering stability, but a hard ceiling on reform.',
      effects: { unity: 15, faculty: -3 }
    },

    /* =========================================================
     * THEMATIC TRAITS — historical archetypes the party likes to
     * collect. All effects key off the game's own stats.
     * ========================================================= */

    // --- The Congress of Vienna generation ---
    man_of_the_congress: {
      icon: '🕊️',
      name: 'Man of the Congress',
      desc: 'Believes in the balance of powers and the conference table. Stability above all.',
      effects: { affinity: 15, unity: 3 }
    },
    iron_chancellor: {
      icon: '🩸',
      name: 'Iron Chancellor',
      desc: 'Blood and iron. Will solve problems the old way and take the credit.',
      effects: { unity: 8, momentum: 2, affinity: -5 }
    },
    the_weaver: {
      icon: '♟️',
      name: 'The Weaver',
      desc: 'Has stitched stranger coalitions together. Knows what every man at the table wants.',
      effects: { affinity: 25, momentum: 1 }
    },
    tory_democrat: {
      icon: '🎩',
      name: 'Tory Democrat',
      desc: 'Serves the crown and the people both — or at least says so convincingly.',
      effects: { unity: 5, faculty: 3, affinity: 5 }
    },
    grand_old_man: {
      icon: '📖',
      name: 'The Grand Old Man',
      desc: 'Speaks for the moral conscience of the school. Whether they listen is another matter.',
      effects: { faculty: 6, unity: 3 }
    },
    the_survivor: {
      icon: '🐍',
      name: 'The Survivor',
      desc: 'Has served four regimes and betrayed each. Useful. Never trusted.',
      effects: { affinity: 20, momentum: 1 }
    },

    // --- The Age of Revolution ---
    the_incorruptible: {
      icon: '🗡️',
      name: 'The Incorruptible',
      desc: 'Will not stop until the last enemy of the people is dealt with. Including friends.',
      effects: { momentum: 5, unity: -6, spirit: 2 }
    },
    voice_of_the_sections: {
      icon: '🎭',
      name: 'Voice of the Sections',
      desc: 'Knows how to rally a crowd. Also knows when to step back.',
      effects: { momentum: 3, affinity: 10, unity: 2 }
    },
    hero_of_two_worlds: {
      icon: '⚜️',
      name: 'Hero of Two Worlds',
      desc: 'Fought for two revolutions. Believes in both. Belongs to neither.',
      effects: { affinity: 15, unity: 4, faculty: 2 }
    },
    jacobin: {
      icon: '🏛️',
      name: 'Jacobin',
      desc: 'Virtue and terror are the same word to him. The base loves it.',
      effects: { momentum: 4, unity: -3, spirit: 1 }
    },
    thermidorian: {
      icon: '🌡️',
      name: 'Thermidorian',
      desc: 'Survived the revolution by ending it. Believes in order more than he believes in anything.',
      effects: { unity: 6, momentum: -2, affinity: 10 }
    },

    // --- The 1848 generation ---
    child_of_1848: {
      icon: '🌹',
      name: 'Child of 1848',
      desc: 'Still believes the springtime of nations might come back. It might not.',
      effects: { unity: 4, momentum: 2, affinity: -5 }
    },
    voice_of_the_nation: {
      icon: '📣',
      name: 'Voice of the Nation',
      desc: 'Speaks as if he were already in exile. May be right.',
      effects: { momentum: 4, affinity: -10, unity: 3 }
    },
    liberal_aristocrat: {
      icon: '🕯️',
      name: 'Liberal Aristocrat',
      desc: 'Old name, new ideas. Believes reform is the only way to save the old order.',
      effects: { affinity: 12, faculty: 4, momentum: 1 }
    },

    // --- Fin de siècle and the Great War ---
    little_chancellor: {
      icon: '✝️',
      name: 'The Little Chancellor',
      desc: 'Prefers order to democracy. Will use the state against the streets if he has to.',
      effects: { unity: 6, faculty: 4, spirit: 1 }
    },
    the_musician: {
      icon: '🎼',
      name: 'The Musician',
      desc: 'A lawyer and a gentleman. Would rather play the violin than shoot a man. He may have to.',
      effects: { faculty: 6, unity: 3, momentum: -1 }
    },
    admiral_without_a_fleet: {
      icon: '⚓',
      name: 'Admiral Without a Fleet',
      desc: 'Commands a navy that no longer exists, in a country that has no sea.',
      effects: { unity: 5, momentum: 1, affinity: 5 }
    },
    man_on_horseback: {
      icon: '🐎',
      name: 'Man on Horseback',
      desc: 'The classical answer to a deadlock. Whether he dismounts is the question.',
      effects: { unity: 8, momentum: 3, faculty: -3 }
    },
    grey_eminence: {
      icon: '🕶️',
      name: 'Grey Eminence',
      desc: 'Never seen. Always credited. Every cabinet fears his signature.',
      effects: { affinity: 20, momentum: 1, unity: 2 }
    },

    // --- Confessional and clerical ---
    prince_of_the_church: {
      icon: '⛪',
      name: 'Prince of the Church',
      desc: 'Speaks for Rome and for the school at once. The two are not always the same.',
      effects: { spirit: 2, faculty: 4, unity: 3 }
    },
    the_jesuit: {
      icon: '🕯️',
      name: 'The Jesuit',
      desc: 'Educated, patient, and dangerous. Knows the confessional as well as the council room.',
      effects: { faculty: 5, affinity: 10, momentum: -1 }
    },
    papal_legate: {
      icon: '🕊️',
      name: 'Papal Legate',
      desc: 'Speaks with Rome behind him. Not always welcome, but never ignorable.',
      effects: { spirit: 2, faculty: 4, unity: 3 }
    },
    the_freemason: {
      icon: '△',
      name: 'The Freemason',
      desc: 'His real brothers are not in this party. Useful for discreet messages.',
      effects: { affinity: 15, momentum: 1, faculty: -2 }
    },

    // --- Reactionary and restorationist ---
    carlist: {
      icon: '👑',
      name: 'Carlist',
      desc: 'The crown must go to the true branch. All other questions are secondary.',
      effects: { spirit: 2, unity: -4, momentum: 2 }
    },
    legitimist: {
      icon: '🏰',
      name: 'Legitimist',
      desc: 'The old line, the old law, the old ways. Nothing else is worth a debate.',
      effects: { unity: 4, spirit: 2, momentum: -2 }
    },
    throne_and_altar: {
      icon: '⚔️',
      name: 'Throne and Altar',
      desc: 'Cannot imagine one without the other. Would burn the school before he chose.',
      effects: { unity: 5, faculty: 4, momentum: 1 }
    },

    // --- Modernist and technological ---
    man_of_the_new_century: {
      icon: '⚙️',
      name: 'Man of the New Century',
      desc: 'Thinks in systems, moves in numbers, dreams of a school without friction.',
      effects: { momentum: 3, faculty: 2, affinity: -5 }
    },
    technocrat: {
      icon: '📐',
      name: 'Technocrat',
      desc: 'Has a plan and a slide rule. Will not be distracted by sentiment.',
      effects: { momentum: 4, unity: -2, faculty: 3 }
    },
    positivist: {
      icon: '🔬',
      name: 'Positivist',
      desc: 'Believes every problem has a solution and every solution is measurable.',
      effects: { faculty: 5, momentum: 2, spirit: -1 }
    },

    // --- Theatrical and demagogic ---
    the_demagogue: {
      icon: '🎤',
      name: 'The Demagogue',
      desc: 'Can turn any crowd in any direction. Whether he remembers which one is the question.',
      effects: { momentum: 5, affinity: -8, unity: 2 }
    },
    the_old_orator: {
      icon: '📜',
      name: 'The Old Orator',
      desc: 'His best speeches are twenty years behind him and he does not know it.',
      effects: { faculty: 4, momentum: -1, unity: 3 }
    },
    man_of_letters: {
      icon: '🖋️',
      name: 'Man of Letters',
      desc: 'Writes for the morning paper and for the age. The two rarely agree.',
      effects: { momentum: 2, faculty: 4, unity: 2 }
    },

    // --- The opportunistic ---
    trimmers: {
      icon: '⚖️',
      name: 'The Trimmer',
      desc: 'Has never taken a side that could cost him. Has never lost a vote.',
      effects: { affinity: 20, unity: 3, momentum: -1 }
    },
    placeman: {
      icon: '💼',
      name: 'Placeman',
      desc: 'Holds four offices and can describe none of them. Nobody has asked.',
      effects: { funds: 10, unity: 2, affinity: 5 }
    }
  };
  /* ---------------------------------------------------------------
 * Special Crisis Actions - Available during Black League crisis
 * ------------------------------------------------------------- */
var CRISIS_ACTIONS = [
  { 
    id: 'crisis_push_bl', 
    name: ' Push Against Black League', 
    ap: 2, 
    budget: 15, 
    vol: 3,
    desc: 'Launch a coordinated effort to push back against the Black League. Without allies: BL loses votes to ZMP. With allies: BL loses votes to ZPF and IIA.',
    needsTarget: false,
    crisisOnly: true
  },
  { 
    id: 'crisis_sabotage', 
    name: ' Sabotage Their Legions', 
    ap: 2, 
    budget: 12, 
    vol: 4,
    desc: 'Sabotage the Black League\'s military strength. Each use lowers their battle multiplier by 0.1x (down to 0.5x for first battle, 1.5x/2.5x for second). Max 5 uses.',
    needsTarget: false,
    crisisOnly: true
  },
  { 
    id: 'crisis_defensive', 
    name: ' Fortify Your Position', 
    ap: 1, 
    budget: 8, 
    vol: 2,
    desc: 'Brace for impact. Reduce damage from Black League attacks for 3 weeks.',
    needsTarget: false,
    crisisOnly: true
  },
  { 
    id: 'crisis_counter_propaganda', 
    name: ' Counter Propaganda', 
    ap: 1, 
    budget: 10, 
    vol: 2,
    desc: 'Launch a massive counter-propaganda campaign to stop the Black League\'s narrative.',
    needsTarget: false,
    crisisOnly: true
  }
];

  // EVENTS will be filled by events.js
  var EVENTS = [];

  return {
    DEMOS: DEMOS,
    PARTIES: PARTIES,
    POLL_ROWS: POLL_ROWS,
    FACTIONS: FACTIONS,
    ACTIONS: ACTIONS,
    EVENTS: EVENTS,
    GOV_ACTIONS: GOV_ACTIONS,
    ADVISORS: ADVISORS,
    ADVISOR_ACTIONS: ADVISOR_ACTIONS,
    TRAITS: TRAITS,
    MINISTER_FACTIONS: MINISTER_FACTIONS,
    CRISIS_ACTIONS: CRISIS_ACTIONS,
    RELATIONS_ACTIONS: RELATIONS_ACTIONS,
    RELATION_STAGES: RELATION_STAGES,
    getRelationStage: getRelationStage,
    getCoalitionChance: getCoalitionChance,
    getAbsorbChance: getAbsorbChance,

    SEATS: 100,
    MAJORITY: 51,
    WEEKS: 104,
    THRESHOLD: 3,
    YEARS: 2
  };
})();