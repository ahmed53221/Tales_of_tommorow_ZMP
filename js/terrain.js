// terrain_rules.js - Per-unit terrain affinity: artillery loves hills,
// cavalry loves plains, infantry hates mud, artillery hates mud, etc.
window.TerrainRules = (function() {
  'use strict';

  var BF = window.Battlefield;

  // ============================================================
  // TERRAIN CLASSIFICATION
  // ============================================================
  // Given a world position, return a terrain type string.
  function classify(terrain, obstacles, river, x, y) {
    // River overrides everything
    if (BF.isInRiver(river, x, y)) return 'mud';

    // Check obstacles: standing near a rock = 'rocky', near tree = 'forest'
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var d = Math.hypot(o.x - x, o.y - y);
      if (o.type === 'rock' && d < o.r + 12) return 'rocky';
      if (o.type === 'tree' && d < o.r + 20) return 'forest';
    }

    var h = BF.heightAtSmooth(terrain, x, y);
    if (h < 0.5) return 'marsh';
    if (h < 1.3) return 'plain';
    if (h < 2.5) return 'hills';
    if (h < 3.8) return 'steep';
    return 'peak';
  }

  // ============================================================
  // PER-UNIT TERRAIN AFFINITY
  // ============================================================
  // Multipliers:
  //   speed  - movement speed multiplier on this terrain
  //   dmg    - damage multiplier when firing from this terrain
  //   range  - effective range multiplier (only matters for LOS-blocked shots)
  //   defence- incoming damage multiplier (< 1.0 = harder to kill here)
  //
  // Base = 1.0. Values above 1 = advantage, below 1 = disadvantage.
  var AFFINITY = {
    // ============ ZMP (player) ============
    dzehurjaca: {  // Elite cavalry — loves open ground
      plain:   { speed: 1.15, dmg: 1.10, defence: 1.00 },
      hills:   { speed: 0.90, dmg: 1.00, defence: 0.95 },
      steep:   { speed: 0.60, dmg: 0.80, defence: 0.90 },
      peak:    { speed: 0.35, dmg: 0.60, defence: 0.85 },
      forest:  { speed: 0.70, dmg: 0.90, defence: 1.15 },
      rocky:   { speed: 0.75, dmg: 0.95, defence: 1.05 },
      marsh:   { speed: 0.45, dmg: 0.70, defence: 0.85 },
      mud:     { speed: 0.30, dmg: 0.55, defence: 0.75 }
    },
    dragoon: {  // Mounted infantry — better in mixed terrain
      plain:   { speed: 1.10, dmg: 1.05, defence: 1.00 },
      hills:   { speed: 0.95, dmg: 1.05, defence: 1.00 },
      steep:   { speed: 0.75, dmg: 0.95, defence: 0.95 },
      peak:    { speed: 0.50, dmg: 0.80, defence: 0.90 },
      forest:  { speed: 0.80, dmg: 0.95, defence: 1.10 },
      rocky:   { speed: 0.85, dmg: 1.00, defence: 1.05 },
      marsh:   { speed: 0.55, dmg: 0.80, defence: 0.90 },
      mud:     { speed: 0.40, dmg: 0.65, defence: 0.80 }
    },
    line: {  // Line infantry — average everywhere
      plain:   { speed: 1.00, dmg: 1.00, defence: 1.00 },
      hills:   { speed: 0.90, dmg: 1.05, defence: 1.10 },
      steep:   { speed: 0.70, dmg: 1.00, defence: 1.15 },
      peak:    { speed: 0.50, dmg: 0.85, defence: 1.20 },
      forest:  { speed: 0.85, dmg: 0.95, defence: 1.20 },
      rocky:   { speed: 0.90, dmg: 1.00, defence: 1.15 },
      marsh:   { speed: 0.55, dmg: 0.75, defence: 0.85 },
      mud:     { speed: 0.45, dmg: 0.65, defence: 0.80 }
    },
    musket: {  // Musket line — great on hills, terrible in mud
      plain:   { speed: 1.00, dmg: 1.00, defence: 1.00 },
      hills:   { speed: 0.85, dmg: 1.20, defence: 1.05 },
      steep:   { speed: 0.65, dmg: 1.35, defence: 1.10 },
      peak:    { speed: 0.45, dmg: 1.15, defence: 1.15 },
      forest:  { speed: 0.75, dmg: 0.85, defence: 1.10 },
      rocky:   { speed: 0.85, dmg: 1.10, defence: 1.10 },
      marsh:   { speed: 0.50, dmg: 0.60, defence: 0.85 },
      mud:     { speed: 0.30, dmg: 0.35, defence: 0.75 }  // Muskets ruined by mud
    },
    sniper: {  // Snipers — love heights, hate forest LOS
      plain:   { speed: 0.90, dmg: 0.90, defence: 0.90 },
      hills:   { speed: 0.85, dmg: 1.15, defence: 0.90 },
      steep:   { speed: 0.65, dmg: 1.40, defence: 0.95 },
      peak:    { speed: 0.45, dmg: 1.55, defence: 1.00 },  // Snipers dominate peaks
      forest:  { speed: 0.75, dmg: 0.80, defence: 1.15 },
      rocky:   { speed: 0.85, dmg: 1.10, defence: 1.15 },
      marsh:   { speed: 0.55, dmg: 0.75, defence: 0.85 },
      mud:     { speed: 0.35, dmg: 0.50, defence: 0.80 }
    },
    artillery: {  // THE BIG ONE: amazing on hills, useless in mud
      plain:   { speed: 0.80, dmg: 1.00, defence: 0.90 },
      hills:   { speed: 0.60, dmg: 1.30, defence: 1.00 },
      steep:   { speed: 0.35, dmg: 1.50, defence: 1.05 },  // Artillery loves steep
      peak:    { speed: 0.20, dmg: 1.60, defence: 1.10 },
      forest:  { speed: 0.40, dmg: 0.90, defence: 1.00 },
      rocky:   { speed: 0.55, dmg: 1.20, defence: 1.10 },
      marsh:   { speed: 0.20, dmg: 0.50, defence: 0.80 },
      mud:     { speed: 0.10, dmg: 0.25, defence: 0.60 }   // Guns sink, useless
    },

    // ============ BLACK LEAGUE (enemy) — mirror affinities with slight variation ============
    black_rider: {
      plain:   { speed: 1.15, dmg: 1.10, defence: 1.00 },
      hills:   { speed: 0.90, dmg: 1.00, defence: 0.95 },
      steep:   { speed: 0.60, dmg: 0.80, defence: 0.90 },
      peak:    { speed: 0.35, dmg: 0.60, defence: 0.85 },
      forest:  { speed: 0.70, dmg: 0.90, defence: 1.15 },
      rocky:   { speed: 0.75, dmg: 0.95, defence: 1.05 },
      marsh:   { speed: 0.45, dmg: 0.70, defence: 0.85 },
      mud:     { speed: 0.30, dmg: 0.55, defence: 0.75 }
    },
    bl_line: {
      plain:   { speed: 1.00, dmg: 1.00, defence: 1.00 },
      hills:   { speed: 0.90, dmg: 1.05, defence: 1.10 },
      steep:   { speed: 0.70, dmg: 1.00, defence: 1.15 },
      peak:    { speed: 0.50, dmg: 0.85, defence: 1.20 },
      forest:  { speed: 0.85, dmg: 0.95, defence: 1.20 },
      rocky:   { speed: 0.90, dmg: 1.00, defence: 1.15 },
      marsh:   { speed: 0.55, dmg: 0.75, defence: 0.85 },
      mud:     { speed: 0.45, dmg: 0.65, defence: 0.80 }
    },
    bl_musket: {
      plain:   { speed: 1.00, dmg: 1.00, defence: 1.00 },
      hills:   { speed: 0.85, dmg: 1.20, defence: 1.05 },
      steep:   { speed: 0.65, dmg: 1.35, defence: 1.10 },
      peak:    { speed: 0.45, dmg: 1.15, defence: 1.15 },
      forest:  { speed: 0.75, dmg: 0.85, defence: 1.10 },
      rocky:   { speed: 0.85, dmg: 1.10, defence: 1.10 },
      marsh:   { speed: 0.50, dmg: 0.60, defence: 0.85 },
      mud:     { speed: 0.30, dmg: 0.35, defence: 0.75 }
    },
    bl_sniper: {
      plain:   { speed: 0.90, dmg: 0.90, defence: 0.90 },
      hills:   { speed: 0.85, dmg: 1.15, defence: 0.90 },
      steep:   { speed: 0.65, dmg: 1.40, defence: 0.95 },
      peak:    { speed: 0.45, dmg: 1.55, defence: 1.00 },
      forest:  { speed: 0.75, dmg: 0.80, defence: 1.15 },
      rocky:   { speed: 0.85, dmg: 1.10, defence: 1.15 },
      marsh:   { speed: 0.55, dmg: 0.75, defence: 0.85 },
      mud:     { speed: 0.35, dmg: 0.50, defence: 0.80 }
    }
  };

  // ============================================================
  // QUERY HELPERS
  // ============================================================
  function getRules(unitType, terrainType) {
    var a = AFFINITY[unitType];
    if (!a) return { speed: 1, dmg: 1, defence: 1 };
    var t = a[terrainType];
    if (!t) return { speed: 1, dmg: 1, defence: 1 };
    return {
      speed: t.speed !== undefined ? t.speed : 1,
      dmg:   t.dmg   !== undefined ? t.dmg   : 1,
      defence: t.defence !== undefined ? t.defence : 1
    };
  }

  // Pre-computed hint text for UI tooltips
  function describeAffinity(unitType) {
    var a = AFFINITY[unitType];
    if (!a) return '';
    var goods = [], bads = [];
    for (var k in a) {
      if (a[k].dmg >= 1.25) goods.push(k);
      if (a[k].dmg <= 0.6) bads.push(k);
    }
    var out = '';
    if (goods.length) out += 'Good: ' + goods.join(', ') + '. ';
    if (bads.length)  out += 'Bad: '  + bads.join(', ')  + '.';
    return out;
  }

  return {
    classify: classify,
    getRules: getRules,
    describeAffinity: describeAffinity,
    AFFINITY: AFFINITY
  };
})();