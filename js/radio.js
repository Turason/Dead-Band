(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Radio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MODES = ['FM', 'NFM', 'AM', 'USB', 'LSB', 'CW', 'DIGITAL'];
  const CTCSS_TONES = ['67.0','69.3','71.9','74.4','77.0','79.7','82.5','85.4','88.5','91.5','94.8','97.4','100.0','103.5','107.2','110.9','114.8','118.8','123.0','127.3','131.8','136.5','141.3','146.2','151.4','156.7','162.2','167.9','173.8','179.9','186.2','192.8','203.5','210.7','218.1','225.7','233.6','241.8','250.3'];
  const DCS_CODES = ['023','025','026','031','032','036','043','047','051','053','054','065','071','072','073','074','114','115','116','122','125','131','132','134','143','145','152','155','156','162','165','172','174','205','212','223','225','226','243','244','245','246','251','252','255','261','263','265','266','271','274','306','311','315','325','331','332','343','346','351','356','364','365','371','411','412','413','423','431','432','445','446','452','454','455','462','464','465','466','503','506','516','523','526','532','546','565','606','612','624','627','631','632','654','662','664','703','712','723','731','732','734','743','754'];
  const POWER_LEVELS = [1, 5, 10, 25, 50, 100];
  const ANTENNAS = [
    { id: 'rubber-duck', name: 'Rubber duck (HT, 2m/70cm)', minMHz: 144, maxMHz: 450, gain: 'unity' },
    { id: 'j-pole', name: '2m J-pole (vertical)', minMHz: 144, maxMHz: 148, gain: 'omni' },
    { id: 'yagi-2m', name: '2m 3-element Yagi (directional)', minMHz: 144, maxMHz: 148, gain: 'directional' },
    { id: 'dipole-40m', name: '40m half-wave dipole', minMHz: 7, maxMHz: 7.3, gain: 'bidirectional' },
    { id: 'hf-vertical', name: 'HF multiband vertical', minMHz: 3.5, maxMHz: 29.7, gain: 'omni' },
    { id: 'dummy-load', name: 'Dummy load (no radiation)', minMHz: 0, maxMHz: 1000, gain: 'none' }
  ];
  const FEED_LINES = [
    { id: 'rg-58', name: 'RG-58 coax' },
    { id: 'rg-8x', name: 'RG-8X coax' },
    { id: 'rg-213', name: 'RG-213 coax' },
    { id: 'ladder-line', name: 'Ladder line' }
  ];

  function defaultState() {
    return {
      frequency: 146.52, mode: 'FM', step: 0.005,
      offsetDir: 'OFF', offsetMHz: 0.6,
      ctcssTx: 'OFF', ctcssRx: 'OFF', dcs: 'OFF',
      power: 5, bandwidth: 'WIDE', ritHz: 0, reverse: false,
      dmr: { colorCode: 1, talkgroup: 9, timeSlot: 1 },
      antenna: 'rubber-duck', antennaOrientation: 'VERTICAL',
      antennaDirection: 0, antennaHeight: 2, tuner: 'BYPASS',
      feedLine: 'rg-58', powerSupply: 'battery',
      preamp: false, attenuator: false,
      squelch: 3, volume: 5, rfGain: 10, ptt: false,
      dtmfSequence: ''
    };
  }

  function offsetSigned(s) {
    if (s.offsetDir === '+') return s.offsetMHz;
    if (s.offsetDir === '-') return -s.offsetMHz;
    return 0;
  }
  function txFrequency(s) { return round(s.frequency + (s.reverse ? 0 : offsetSigned(s))); }
  function rxFrequency(s) { return round(s.frequency + (s.reverse ? offsetSigned(s) : 0) + s.ritHz / 1e6); }
  function round(n) { return Math.round(n * 1e6) / 1e6; }
  function antennaById(id) { return ANTENNAS.find(a => a.id === id); }
  function powerWatts(s) {
    const legacy = { LOW: 5, MID: 25, HIGH: 50 };
    const watts = typeof s.power === 'string' && legacy[s.power] ? legacy[s.power] : Number(s.power);
    return POWER_LEVELS.includes(watts) ? watts : 0;
  }

  function antennaFits(s) {
    const a = antennaById(s.antenna);
    return !!a && s.frequency >= a.minMHz && s.frequency <= a.maxMHz;
  }

  function estimateSWR(s) {
    if (s.antenna === 'dummy-load') return 1;
    if (antennaFits(s) || s.tuner === 'TUNE') return 1.5;
    return 5;
  }

  function signalStrength(station, s) {
    const baseline = Number.isFinite(station.signalStrength) ? station.signalStrength : 7;
    return Math.max(0, Math.min(10, baseline + (s.preamp ? 2 : 0) - (s.attenuator ? 3 : 0) + (s.rfGain - 10) / 2));
  }

  function bearingDifference(a, b) {
    return Math.abs(((a - b + 540) % 360) - 180);
  }

  // Returns list of human-readable mismatches; empty list means the station is reached.
  function matchStation(station, s, forTransmit) {
    const m = station.match || {};
    const why = [];
    const tol = m.tolerance != null ? m.tolerance : 0.0005;
    const frequency = forTransmit ? s.frequency : rxFrequency(s);
    if (m.frequency != null && Math.abs(frequency - m.frequency) > tol) why.push('frequency');
    if (m.mode && m.mode !== s.mode) why.push('mode');
    if (m.offset != null && Math.abs(offsetSigned(s) - m.offset) > 0.0005) why.push('offset');
    if (m.ctcssTx != null && String(m.ctcssTx) !== s.ctcssTx) why.push('ctcssTx');
    if (m.ctcssRx != null && String(m.ctcssRx) !== s.ctcssRx) why.push('ctcssRx');
    if (m.dcs != null && String(m.dcs) !== s.dcs) why.push('dcs');
    if (m.bandwidth && m.bandwidth !== s.bandwidth) why.push('bandwidth');
    if (m.ritHz != null && s.ritHz !== m.ritHz) why.push('RIT');
    if (m.reverse != null && s.reverse !== m.reverse) why.push('reverse');
    if (m.dmr) {
      Object.keys(m.dmr).forEach(key => {
        if (m.dmr[key] !== s.dmr[key]) why.push('DMR ' + key);
      });
    }
    if (m.antenna) {
      const list = Array.isArray(m.antenna) ? m.antenna : [m.antenna];
      if (!list.includes(s.antenna)) why.push('antenna');
    }
    if (m.antennaOrientation && m.antennaOrientation !== s.antennaOrientation) why.push('antenna orientation');
    if (m.antennaDirection != null && bearingDifference(s.antennaDirection, m.antennaDirection) >
      (m.antennaDirectionTolerance != null ? m.antennaDirectionTolerance : 15)) why.push('antenna direction');
    if (m.minAntennaHeight != null && s.antennaHeight < m.minAntennaHeight) why.push('antenna height (too low)');
    if (m.maxAntennaHeight != null && s.antennaHeight > m.maxAntennaHeight) why.push('antenna height (too high)');
    if (m.tuner && m.tuner !== s.tuner) why.push('tuner');
    if (m.feedLine && m.feedLine !== s.feedLine) why.push('feed line');
    if (m.powerSupply && m.powerSupply !== s.powerSupply) why.push('power supply');
    if (m.preamp != null && m.preamp !== s.preamp) why.push('preamp');
    if (m.attenuator != null && m.attenuator !== s.attenuator) why.push('attenuator');
    if (m.minPower != null && powerWatts(s) < m.minPower) why.push('power (too low)');
    if (m.maxPower != null && powerWatts(s) > m.maxPower) why.push('power (too high)');
    if (forTransmit && s.antenna === 'dummy-load') why.push('antenna (dummy load)');
    else if (forTransmit && !antennaFits(s) && s.tuner !== 'TUNE') why.push('antenna (not resonant on this band)');
    return why;
  }

  function findStation(stations, s, forTransmit) {
    for (const st of stations) if (matchStation(st, s, forTransmit).length === 0) return st;
    return null;
  }

  // Conversation engine: nodes with text, optional responses [{text,next,feedback,correct}], optional next, optional clue.
  function startConversation(station) {
    const c = station.conversation;
    if (!c || !c.nodes || !c.nodes[c.start]) return null;
    return { station: station, nodeId: c.start };
  }
  function currentNode(conv) { return conv.station.conversation.nodes[conv.nodeId]; }
  function choose(conv, index) {
    const node = currentNode(conv);
    const r = node.responses && node.responses[index];
    if (!r) return { ended: false, error: 'invalid response' };
    const next = r.next;
    if (!next) { return { ended: true, feedback: r.feedback || null, correct: r.correct, chapterComplete: r.chapterComplete === true }; }
    if (!conv.station.conversation.nodes[next]) return { ended: true, error: 'missing node ' + next };
    conv.nodeId = next;
    return { ended: false, feedback: r.feedback || null, correct: r.correct };
  }

  function validateScenario(sc) {
    const errors = [];
    if (!sc || !Array.isArray(sc.stations)) return ['scenario.stations must be an array'];
    if (sc.features != null && (!sc.features || typeof sc.features !== 'object' || Array.isArray(sc.features))) {
      errors.push('scenario.features must be an object');
    } else if (sc.features && sc.features.dtmf != null && typeof sc.features.dtmf !== 'boolean') {
      errors.push('scenario.features.dtmf must be a boolean');
    }
    ['day', 'time', 'weather'].forEach(field => {
      if (typeof sc[field] !== 'string' || !sc[field].trim()) errors.push('scenario.' + field + ' must be a non-empty string');
    });
    const ids = new Set();
    let hasChapterEnd = false;
    sc.stations.forEach((st, i) => {
      const p = 'stations[' + i + ']';
      if (!st.id) errors.push(p + ': missing id');
      else if (ids.has(st.id)) errors.push(p + ': duplicate id ' + st.id);
      ids.add(st.id);
      const c = st.conversation;
      if (!c || !c.nodes || !c.nodes[c.start]) { errors.push(p + ': conversation.start must name a node'); return; }
      Object.keys(c.nodes).forEach(k => {
        (c.nodes[k].responses || []).forEach(r => {
          if (r.next && !c.nodes[r.next]) errors.push(p + ': node ' + k + ' -> unknown node ' + r.next);
          if (r.chapterComplete === true) {
            hasChapterEnd = true;
            if (r.next != null) errors.push(p + ': chapterComplete response must end the conversation');
          }
        });
      });
    });
    if (!hasChapterEnd) errors.push('scenario must have a chapterComplete response');
    return errors;
  }

  function validateChapterManifest(manifest) {
    const errors = [];
    if (!manifest || !Array.isArray(manifest.chapters) || manifest.chapters.length === 0) {
      return ['chapters.chapters must be a non-empty array'];
    }
    const ids = new Set();
    manifest.chapters.forEach((chapter, i) => {
      const p = 'chapters[' + i + ']';
      if (!chapter || typeof chapter.id !== 'string' || !chapter.id.trim()) errors.push(p + ': missing id');
      else if (ids.has(chapter.id)) errors.push(p + ': duplicate id ' + chapter.id);
      else ids.add(chapter.id);
      if (!chapter || typeof chapter.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(chapter.file)) {
        errors.push(p + ': file must be a JSON filename in the data directory');
      }
    });
    return errors;
  }

  return { MODES, CTCSS_TONES, POWER_LEVELS, ANTENNAS, defaultState, offsetSigned, txFrequency, antennaById,
    DCS_CODES, FEED_LINES, powerWatts, antennaFits, estimateSWR, signalStrength, rxFrequency, matchStation, findStation,
    startConversation, currentNode, choose, validateScenario,
    validateChapterManifest };
});
