

window.FactionFlags = (function () {
  'use strict';

  var FLAGS = {
    ZMP: {
      id: 'ZMP',
      name: 'Student Union Coalition',
      flag: 'img/Zalgrilia.png',
      color: '#5fae3c',
      icon: '⚜️',
      alt: 'Zalgrilian crown'
    },
    ZPF: {
      id: 'ZPF',
      name: 'Centre Party',
      flag: 'img/zpf.png',
      color: '#006400',
      icon: '⚖️',
      alt: 'Zalgrilian republican'
    },
    IIA: {
      id: 'IIA',
      name: 'Independent Innovation Alliance',
      flag: 'img/iia.png',
      color: '#2244dd',
      icon: '💻',
      alt: 'Tech alliance'
    },
    BL: {
      id: 'BL',
      name: 'Black League',
      flag: 'img/bl.png',
      color: '#141414',
      icon: '⚫',
      alt: 'Black League'
    },
    RED: {
      id: 'RED',
      name: 'Red Front',
      flag: 'img/red.png',
      color: '#cc0000',
      icon: '',
      alt: 'Workers\' front'
    },
    PL: {
      id: 'PL',
      name: 'Pep League',
      flag: 'img/pl.png',
      color: '#e0518f',
      icon: '🎉',
      alt: 'Minarian regional'
    },
    RB: {
      id: 'RB',
      name: 'Red Bench',
      flag: 'img/rb.png',
      color: '#d32020',
      icon: '🍽️',
      alt: 'Cafeteria militants'
    }
  };


  function inline(factionId, size) {
    var f = FLAGS[factionId];
    if (!f) return '';
    var s = size || 20;
    return '<img src="' + f.flag + '" ' +
           'alt="' + f.alt + '" ' +
           'title="' + f.name + '" ' +
           'class="flag-inline" ' +
           'data-faction="' + f.id + '" ' +
           'style="width:' + s + 'px;height:auto;vertical-align:middle;' +
           'margin-right:6px;border-radius:2px;border:1px solid rgba(0,0,0,0.4);">';
  }

  function banner(factionId, height) {
    var f = FLAGS[factionId];
    if (!f) return '';
    var h = height || 80;
    return '<div class="flag-banner" style="' +
           'display:flex;flex-direction:column;align-items:center;' +
           'padding:8px;border-left:3px solid ' + f.color + ';' +
           'background:rgba(0,0,0,0.3);">' +
           '<img src="' + f.flag + '" ' +
           'alt="' + f.alt + '" ' +
           'style="height:' + h + 'px;width:auto;' +
           'border-radius:3px;box-shadow:0 0 12px ' + f.color + '55;">' +
           '<div style="margin-top:6px;font-size:12px;color:' + f.color + ';' +
           'font-weight:bold;letter-spacing:1px;">' + f.id + '</div>' +
           '<div style="font-size:10px;color:#aaa;">' + f.name + '</div>' +
           '</div>';
  }

  function color(factionId) {
    var f = FLAGS[factionId];
    return f ? f.color : '#888';
  }

  function name(factionId) {
    var f = FLAGS[factionId];
    return f ? f.name : factionId;
  }

 
  function url(factionId) {
    var f = FLAGS[factionId];
    return f ? f.flag : null;
  }

  return {
    FLAGS: FLAGS,
    inline: inline,
    banner: banner,
    color: color,
    name: name,
    url: url
  };
})();