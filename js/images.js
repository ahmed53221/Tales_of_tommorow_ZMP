// images.js - Complete Image System for Class Council Game

window.GameImages = (function() {
  'use strict';

  // SVG-based image generator for all game elements
  function generateSVG(type, options) {
    options = options || {};
    
    switch(type) {
      case 'battle':
        return generateBattleSVG(options);
      case 'election':
        return generateElectionSVG(options);
      case 'party':
        return generatePartySVG(options);
      case 'event':
        return generateEventSVG(options);
      case 'cabinet':
        return generateCabinetSVG(options);
      case 'achievement':
        return generateAchievementSVG(options);
      case 'newspaper':
        return generateNewspaperSVG(options);
      case 'president':
        return generatePresidentSVG(options);
      case 'congress':
        return generateCongressSVG(options);
      case 'coalition':
        return generateCoalitionSVG(options);
      default:
        return generateDefaultSVG(options);
    }
  }

  function generateBattleSVG(options) {
    var side = options.side || 'neutral';
    var outcome = options.outcome || 'ongoing';
    var size = options.size || 200;
    
    var colors = {
      victory: { bg: '#1a2a1a', accent: '#5fae3c', glow: '#4CAF50' },
      defeat: { bg: '#2a1a1a', accent: '#cc0000', glow: '#ff0000' },
      ongoing: { bg: '#1a1a2a', accent: '#ffd700', glow: '#ffaa00' }
    };
    
    var colorSet = colors[outcome] || colors.ongoing;
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="${colorSet.bg}" stroke="${colorSet.accent}" stroke-width="2"/>
      
      <!-- Background battlefield -->
      <rect x="${size*0.1}" y="${size*0.6}" width="${size*0.8}" height="${size*0.15}" fill="#2a2a2a" rx="4"/>
      <rect x="${size*0.15}" y="${size*0.5}" width="${size*0.7}" height="${size*0.1}" fill="#3a3a3a" rx="3"/>
      
      <!-- Swords crossed -->
      <g transform="translate(${size/2}, ${size*0.35})">
        <line x1="-${size*0.25}" y1="-${size*0.25}" x2="${size*0.25}" y2="${size*0.25}" stroke="${colorSet.accent}" stroke-width="3"/>
        <line x1="${size*0.25}" y1="-${size*0.25}" x2="-${size*0.25}" y2="${size*0.25}" stroke="${colorSet.accent}" stroke-width="3"/>
        <circle cx="0" cy="0" r="${size*0.08}" fill="none" stroke="${colorSet.glow}" stroke-width="2" opacity="0.6">
          <animate attributeName="r" from="${size*0.06}" to="${size*0.12}" dur="1.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/>
        </circle>
      </g>
      
      <!-- Shields -->
      <g transform="translate(${size*0.15}, ${size*0.3})">
        <path d="M-${size*0.08} -${size*0.15} L0 -${size*0.2} L${size*0.08} -${size*0.15} L${size*0.08} ${size*0.05} L0 ${size*0.15} L-${size*0.08} ${size*0.05} Z" fill="${side === 'zmp' ? '#5fae3c' : '#888'}" opacity="0.8"/>
      </g>
      <g transform="translate(${size*0.85}, ${size*0.3})">
        <path d="M-${size*0.08} -${size*0.15} L0 -${size*0.2} L${size*0.08} -${size*0.15} L${size*0.08} ${size*0.05} L0 ${size*0.15} L-${size*0.08} ${size*0.05} Z" fill="${side === 'bl' ? '#cc0000' : '#888'}" opacity="0.8"/>
      </g>
      
      <!-- Outcome text -->
      <text x="${size/2}" y="${size*0.82}" text-anchor="middle" font-size="${size*0.12}" fill="${colorSet.accent}" font-weight="bold">
        ${outcome.toUpperCase()}
      </text>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.15}" text-anchor="middle" font-size="${size*0.1}" fill="#fff" font-weight="bold">
        BATTLE
      </text>
    </svg>`;
  }

  function generateElectionSVG(options) {
    var size = options.size || 200;
    var type = options.type || 'council';
    var winner = options.winner || 'ZMP';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a1a2a" stroke="#ffd700" stroke-width="2"/>
      
      <!-- Ballot box -->
      <rect x="${size*0.25}" y="${size*0.45}" width="${size*0.5}" height="${size*0.3}" rx="4" fill="#2a2a3a" stroke="#ffd700" stroke-width="2"/>
      <rect x="${size*0.3}" y="${size*0.35}" width="${size*0.4}" height="${size*0.1}" rx="2" fill="#333" stroke="#ffd700" stroke-width="1"/>
      
      <!-- Slit -->
      <rect x="${size*0.42}" y="${size*0.32}" width="${size*0.16}" height="${size*0.03}" rx="1" fill="#ffd700"/>
      
      <!-- Checkmark -->
      <g transform="translate(${size/2}, ${size*0.75})">
        <path d="M-${size*0.08} 0 L-${size*0.02} ${size*0.08} L${size*0.12} -${size*0.08}" stroke="#5fae3c" stroke-width="4" fill="none" stroke-linecap="round"/>
      </g>
      
      <!-- Voter icons -->
      <circle cx="${size*0.15}" cy="${size*0.25}" r="${size*0.06}" fill="#888"/>
      <circle cx="${size*0.5}" cy="${size*0.25}" r="${size*0.06}" fill="#aaa"/>
      <circle cx="${size*0.85}" cy="${size*0.25}" r="${size*0.06}" fill="#888"/>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.15}" text-anchor="middle" font-size="${size*0.1}" fill="#ffd700" font-weight="bold">
        ELECTION
      </text>
      
      <!-- Winner -->
      <text x="${size/2}" y="${size*0.92}" text-anchor="middle" font-size="${size*0.08}" fill="${winner === 'ZMP' ? '#5fae3c' : '#ffd700'}">
        WINNER: ${winner}
      </text>
    </svg>`;
  }

  function generatePartySVG(options) {
    var size = options.size || 200;
    var party = options.party || 'ZMP';
    var color = options.color || '#5fae3c';
    
    var partySymbols = {
      'ZMP': '✊',
      'zpf': '⚖️',
      'red': '',
      'bl': '⚫',
      'iia': '💻',
      'semp': '✨',
      'republia': '🔵',
      'sportica': '🏅',
      'pl': '📖',
      'rb': ''
    };
    
    var symbol = partySymbols[party] || '';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a1a1a" stroke="${color}" stroke-width="2"/>
      
      <!-- Party symbol circle -->
      <circle cx="${size/2}" cy="${size*0.45}" r="${size*0.2}" fill="none" stroke="${color}" stroke-width="3"/>
      <circle cx="${size/2}" cy="${size*0.45}" r="${size*0.15}" fill="${color}22" stroke="${color}" stroke-width="1"/>
      
      <!-- Symbol -->
      <text x="${size/2}" y="${size*0.48}" text-anchor="middle" font-size="${size*0.3}">${symbol}</text>
      
      <!-- Party name -->
      <text x="${size/2}" y="${size*0.78}" text-anchor="middle" font-size="${size*0.1}" fill="${color}" font-weight="bold">
        ${party.toUpperCase()}
      </text>
      
      <!-- Support bars -->
      <rect x="${size*0.15}" y="${size*0.88}" width="${size*0.7}" height="${size*0.04}" rx="2" fill="#333"/>
      <rect x="${size*0.15}" y="${size*0.88}" width="${size*0.45}" height="${size*0.04}" rx="2" fill="${color}" opacity="0.8">
        <animate attributeName="width" from="${size*0.1}" to="${size*0.45}" dur="2s" fill="freeze"/>
      </rect>
    </svg>`;
  }

  function generateEventSVG(options) {
    var size = options.size || 200;
    var eventType = options.eventType || 'general';
    var title = options.title || 'Event';
    
    var icons = {
      'crisis': '',
      'victory': '',
      'election': '🗳️',
      'battle': '',
      'diplomacy': '',
      'general': '📋',
      'celebration': '🎉',
      'warning': '🔔'
    };
    
    var icon = icons[eventType] || '📋';
    var colors = {
      'crisis': '#ff0000',
      'victory': '#ffd700',
      'election': '#ffd700',
      'battle': '#cc0000',
      'diplomacy': '#4CAF50',
      'general': '#8888cc',
      'celebration': '#ff6b6b',
      'warning': '#ff6600'
    };
    var color = colors[eventType] || '#8888cc';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a1a1a" stroke="${color}" stroke-width="2"/>
      
      <!-- Event icon circle -->
      <circle cx="${size/2}" cy="${size*0.4}" r="${size*0.18}" fill="${color}22" stroke="${color}" stroke-width="2"/>
      
      <!-- Icon -->
      <text x="${size/2}" y="${size*0.43}" text-anchor="middle" font-size="${size*0.3}">${icon}</text>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.72}" text-anchor="middle" font-size="${size*0.09}" fill="#fff" font-weight="bold">
        ${title.substring(0, 20)}
      </text>
      
      <!-- Decorative lines -->
      <line x1="${size*0.2}" y1="${size*0.85}" x2="${size*0.8}" y2="${size*0.85}" stroke="${color}" stroke-width="1" opacity="0.3"/>
      <line x1="${size*0.3}" y1="${size*0.9}" x2="${size*0.7}" y2="${size*0.9}" stroke="${color}" stroke-width="1" opacity="0.2"/>
      
      <!-- Pulse animation -->
      <circle cx="${size/2}" cy="${size*0.4}" r="${size*0.18}" fill="none" stroke="${color}" stroke-width="1" opacity="0">
        <animate attributeName="r" from="${size*0.18}" to="${size*0.3}" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite"/>
      </circle>
    </svg>`;
  }

  function generateCabinetSVG(options) {
    var size = options.size || 200;
    var ministry = options.ministry || 'general';
    
    var icons = {
      'finance': '💰',
      'education': '',
      'justice': '⚖️',
      'technology': '💻',
      'health': '🏥',
      'sports': '🏅',
      'arts': '🎭',
      'infrastructure': '🏗️'
    };
    
    var icon = icons[ministry] || '';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a1a2a" stroke="#5fae3c" stroke-width="2"/>
      
      <!-- Table -->
      <rect x="${size*0.15}" y="${size*0.5}" width="${size*0.7}" height="${size*0.05}" rx="2" fill="#333"/>
      <rect x="${size*0.25}" y="${size*0.55}" width="${size*0.5}" height="${size*0.15}" rx="2" fill="#2a2a2a"/>
      
      <!-- Chair icons -->
      <rect x="${size*0.12}" y="${size*0.35}" width="${size*0.08}" height="${size*0.15}" rx="2" fill="#444"/>
      <rect x="${size*0.8}" y="${size*0.35}" width="${size*0.08}" height="${size*0.15}" rx="2" fill="#444"/>
      
      <!-- Ministry icon -->
      <circle cx="${size/2}" cy="${size*0.3}" r="${size*0.12}" fill="none" stroke="#ffd700" stroke-width="2"/>
      <text x="${size/2}" y="${size*0.33}" text-anchor="middle" font-size="${size*0.2}">${icon}</text>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.15}" text-anchor="middle" font-size="${size*0.08}" fill="#ffd700" font-weight="bold">
        CABINET
      </text>
    </svg>`;
  }

  function generateAchievementSVG(options) {
    var size = options.size || 200;
    var achievement = options.achievement || '';
    var unlocked = options.unlocked || false;
    
    var color = unlocked ? '#ffd700' : '#666';
    var bg = unlocked ? '#1a1a0a' : '#1a1a1a';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="${bg}" stroke="${color}" stroke-width="2" opacity="${unlocked ? 1 : 0.5}"/>
      
      <!-- Star background -->
      <g transform="translate(${size/2}, ${size*0.4})">
        <polygon points="0,-${size*0.2} ${size*0.05},-${size*0.06} ${size*0.2},-${size*0.06} ${size*0.08},${size*0.02} ${size*0.12},${size*0.18} 0,${size*0.08} -${size*0.12},${size*0.18} -${size*0.08},${size*0.02} -${size*0.2},-${size*0.06} -${size*0.05},-${size*0.06}" 
        fill="${color}" opacity="${unlocked ? 0.8 : 0.3}"/>
      </g>
      
      <!-- Achievement icon -->
      <text x="${size/2}" y="${size*0.45}" text-anchor="middle" font-size="${size*0.25}">${achievement}</text>
      
      <!-- Lock/Unlock status -->
      <text x="${size/2}" y="${size*0.78}" text-anchor="middle" font-size="${size*0.12}" fill="${color}">
        ${unlocked ? '' : '🔒'}
      </text>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.15}" text-anchor="middle" font-size="${size*0.08}" fill="${color}" font-weight="bold">
        ACHIEVEMENT
      </text>
    </svg>`;
  }

  function generateNewspaperSVG(options) {
    var size = options.size || 200;
    var headline = options.headline || 'Breaking News';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="8" fill="#f5f0e8" stroke="#ccc" stroke-width="1"/>
      
      <!-- Newspaper header -->
      <rect x="${size*0.05}" y="${size*0.05}" width="${size*0.9}" height="${size*0.12}" rx="2" fill="#333"/>
      <text x="${size/2}" y="${size*0.14}" text-anchor="middle" font-size="${size*0.08}" fill="#fff" font-weight="bold" font-family="serif">
        THE STUDENT VOICE
      </text>
      
      <!-- Headline -->
      <text x="${size/2}" y="${size*0.32}" text-anchor="middle" font-size="${size*0.07}" fill="#222" font-weight="bold" font-family="serif">
        ${headline.substring(0, 15)}
      </text>
      
      <!-- Line -->
      <line x1="${size*0.1}" y1="${size*0.38}" x2="${size*0.9}" y2="${size*0.38}" stroke="#ccc" stroke-width="1"/>
      
      <!-- Fake text columns -->
      <rect x="${size*0.08}" y="${size*0.42}" width="${size*0.4}" height="${size*0.08}" rx="1" fill="#ddd"/>
      <rect x="${size*0.08}" y="${size*0.52}" width="${size*0.35}" height="${size*0.04}" rx="1" fill="#ddd"/>
      <rect x="${size*0.08}" y="${size*0.58}" width="${size*0.38}" height="${size*0.04}" rx="1" fill="#ddd"/>
      <rect x="${size*0.08}" y="${size*0.64}" width="${size*0.3}" height="${size*0.04}" rx="1" fill="#ddd"/>
      
      <rect x="${size*0.52}" y="${size*0.42}" width="${size*0.4}" height="${size*0.08}" rx="1" fill="#ddd"/>
      <rect x="${size*0.52}" y="${size*0.52}" width="${size*0.35}" height="${size*0.04}" rx="1" fill="#ddd"/>
      <rect x="${size*0.52}" y="${size*0.58}" width="${size*0.38}" height="${size*0.04}" rx="1" fill="#ddd"/>
      
      <!-- Image placeholder -->
      <rect x="${size*0.08}" y="${size*0.7}" width="${size*0.35}" height="${size*0.2}" rx="2" fill="#ccc" stroke="#999" stroke-width="1"/>
      <text x="${size*0.255}" y="${size*0.82}" text-anchor="middle" font-size="${size*0.05}" fill="#888">📷</text>
      
      <!-- Bottom text -->
      <text x="${size/2}" y="${size*0.95}" text-anchor="middle" font-size="${size*0.04}" fill="#888" font-family="serif">
        Established 2024
      </text>
    </svg>`;
  }

  function generatePresidentSVG(options) {
    var size = options.size || 200;
    var name = options.name || 'President';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a0a2a" stroke="#ffd700" stroke-width="2"/>
      
      <!-- Crown -->
      <g transform="translate(${size/2}, ${size*0.15})">
        <path d="M-${size*0.15} ${size*0.05} L-${size*0.2} -${size*0.1} L-${size*0.1} 0 L0 -${size*0.15} L${size*0.1} 0 L${size*0.2} -${size*0.1} L${size*0.15} ${size*0.05} Z" fill="#ffd700" opacity="0.8"/>
        <circle cx="-${size*0.12}" cy="-${size*0.02}" r="${size*0.02}" fill="#ff6b6b"/>
        <circle cx="0" cy="-${size*0.05}" r="${size*0.02}" fill="#ff6b6b"/>
        <circle cx="${size*0.12}" cy="-${size*0.02}" r="${size*0.02}" fill="#ff6b6b"/>
      </g>
      
      <!-- Portrait circle -->
      <circle cx="${size/2}" cy="${size*0.45}" r="${size*0.2}" fill="none" stroke="#ffd700" stroke-width="2"/>
      <circle cx="${size/2}" cy="${size*0.45}" r="${size*0.15}" fill="#2a1a3a"/>
      
      <!-- Person silhouette -->
      <circle cx="${size/2}" cy="${size*0.4}" r="${size*0.06}" fill="#ffd700" opacity="0.6"/>
      <rect x="${size*0.42}" y="${size*0.46}" width="${size*0.16}" height="${size*0.12}" rx="${size*0.04}" fill="#ffd700" opacity="0.4"/>
      
      <!-- Name -->
      <text x="${size/2}" y="${size*0.78}" text-anchor="middle" font-size="${size*0.08}" fill="#ffd700" font-weight="bold">
        ${name}
      </text>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.9}" text-anchor="middle" font-size="${size*0.07}" fill="#aaa">
        STUDENT BODY PRESIDENT
      </text>
    </svg>`;
  }

  function generateCongressSVG(options) {
    var size = options.size || 200;
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a1a2a" stroke="#ffd700" stroke-width="2"/>
      
      <!-- Podium -->
      <rect x="${size*0.35}" y="${size*0.5}" width="${size*0.3}" height="${size*0.1}" rx="2" fill="#333"/>
      <rect x="${size*0.4}" y="${size*0.45}" width="${size*0.2}" height="${size*0.05}" rx="1" fill="#444"/>
      
      <!-- Audience seats (semicircle) -->
      <g transform="translate(${size/2}, ${size*0.7})">
        ${Array.from({length: 7}, (_, i) => {
          const angle = -Math.PI/2 + (i/6) * Math.PI;
          const x = Math.cos(angle) * size*0.22;
          const y = Math.sin(angle) * size*0.15 + size*0.05;
          return `<rect x="${x - size*0.03}" y="${y}" width="${size*0.06}" height="${size*0.06}" rx="2" fill="#444" opacity="0.6"/>`;
        }).join('')}
      </g>
      
      <!-- Microphone -->
      <line x1="${size/2}" y1="${size*0.45}" x2="${size/2}" y2="${size*0.35}" stroke="#888" stroke-width="2"/>
      <circle cx="${size/2}" cy="${size*0.33}" r="${size*0.02}" fill="#888"/>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.15}" text-anchor="middle" font-size="${size*0.08}" fill="#ffd700" font-weight="bold">
        CONGRESS
      </text>
      
      <!-- Debate bubbles -->
      <circle cx="${size*0.15}" cy="${size*0.35}" r="${size*0.03}" fill="#ffd700" opacity="0.3"/>
      <circle cx="${size*0.85}" cy="${size*0.35}" r="${size*0.03}" fill="#ffd700" opacity="0.3"/>
      <circle cx="${size*0.2}" cy="${size*0.28}" r="${size*0.02}" fill="#ffd700" opacity="0.2"/>
      <circle cx="${size*0.8}" cy="${size*0.28}" r="${size*0.02}" fill="#ffd700" opacity="0.2"/>
    </svg>`;
  }

  function generateCoalitionSVG(options) {
    var size = options.size || 200;
    var partners = options.partners || ['ZMP'];
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a2a1a" stroke="#5fae3c" stroke-width="2"/>
      
      <!-- Handshake -->
      <g transform="translate(${size/2}, ${size*0.45})">
        <!-- Left hand -->
        <rect x="-${size*0.2}" y="${-size*0.05}" width="${size*0.15}" height="${size*0.1}" rx="${size*0.02}" fill="#ddd" opacity="0.7"/>
        <rect x="-${size*0.15}" y="${-size*0.08}" width="${size*0.05}" height="${size*0.03}" rx="${size*0.01}" fill="#ddd" opacity="0.5"/>
        <rect x="-${size*0.15}" y="${size*0.05}" width="${size*0.05}" height="${size*0.03}" rx="${size*0.01}" fill="#ddd" opacity="0.5"/>
        
        <!-- Right hand -->
        <rect x="${size*0.05}" y="${-size*0.05}" width="${size*0.15}" height="${size*0.1}" rx="${size*0.02}" fill="#ddd" opacity="0.7"/>
        <rect x="${size*0.1}" y="${-size*0.08}" width="${size*0.05}" height="${size*0.03}" rx="${size*0.01}" fill="#ddd" opacity="0.5"/>
        <rect x="${size*0.1}" y="${size*0.05}" width="${size*0.05}" height="${size*0.03}" rx="${size*0.01}" fill="#ddd" opacity="0.5"/>
      </g>
      
      <!-- Partner names -->
      <text x="${size/2}" y="${size*0.75}" text-anchor="middle" font-size="${size*0.08}" fill="#5fae3c" font-weight="bold">
        ${partners.join(' + ')}
      </text>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.15}" text-anchor="middle" font-size="${size*0.08}" fill="#5fae3c" font-weight="bold">
        COALITION
      </text>
    </svg>`;
  }

  function generateDefaultSVG(options) {
    var size = options.size || 200;
    var title = options.title || 'Class Council';
    
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="12" fill="#1a1a1a" stroke="#5fae3c" stroke-width="2"/>
      
      <!-- Logo circle -->
      <circle cx="${size/2}" cy="${size*0.45}" r="${size*0.2}" fill="none" stroke="#5fae3c" stroke-width="3"/>
      <circle cx="${size/2}" cy="${size*0.45}" r="${size*0.15}" fill="#5fae3c" opacity="0.1"/>
      
      <!-- Center icon -->
      <text x="${size/2}" y="${size*0.48}" text-anchor="middle" font-size="${size*0.25}"></text>
      
      <!-- Title -->
      <text x="${size/2}" y="${size*0.78}" text-anchor="middle" font-size="${size*0.08}" fill="#5fae3c" font-weight="bold">
        ${title}
      </text>
    </svg>`;
  }

  // Public API
  return {
    generateSVG: generateSVG,
    generateBattleSVG: generateBattleSVG,
    generateElectionSVG: generateElectionSVG,
    generatePartySVG: generatePartySVG,
    generateEventSVG: generateEventSVG,
    generateCabinetSVG: generateCabinetSVG,
    generateAchievementSVG: generateAchievementSVG,
    generateNewspaperSVG: generateNewspaperSVG,
    generatePresidentSVG: generatePresidentSVG,
    generateCongressSVG: generateCongressSVG,
    generateCoalitionSVG: generateCoalitionSVG
  };
})();