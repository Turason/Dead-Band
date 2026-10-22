(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Radio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MODES = ['FM', 'NFM', 'AM', 'USB', 'LSB', 'CW', 'DIGITAL'];
  const CTCSS_TONES = ['67.0','69.3','71.9','74.4','77.0','79.7','82.5','85.4','88.5','91.5','94.8','97.4','100.0','103.5','107.2','110.9','114.8','118.8','123.0','127.3','131.8','136.5','141.3','146.2','151.4','156.7','162.2','167.9','173.8','179.9','186.2','192.8','203.5','210.7','218.1','225.7','233.6','241.8','250.3'];
  const POWER_LEVELS = { LOW: 5, MID: 25, HIGH: 50 };
  const ANTENNAS = [
    { id: 'rubber-duck', name: 'Rubber duck (HT, 2m/70cm)', minMHz: 144, maxMHz: 450, gain: 'unity' },
    { id: 'j-pole', name: '2m J-pole (vertical)', minMHz: 144, maxMHz: 148, gain: 'omni' },
    { id: 'yagi-2m', name: '2m 3-element Yagi (directional)', minMHz: 144, maxMHz: 148, gain: 'directional' },
    { id: 'dipole-40m', name: '40m half-wave dipole', minMHz: 7, maxMHz: 7.3, gain: 'bidirectional' },
    { id: 'hf-vertical', name: 'HF multiband vertical', minMHz: 3.5, maxMHz: 29.7, gain: 'omni' },
    { id: 'dummy-load', name: 'Dummy load (no radiation)', minMHz: 0, maxMHz: 1000, gain: 'none' }
  ];

  function defaultState() {
    return {
      frequency: 146.52, mode: 'FM', step: 0.005,
      offsetDir: 'OFF', offsetMHz: 0.6,
      ctcssTx: 'OFF', ctcssRx: 'OFF', dcs: 'OFF',
      power: 'LOW', antenna: 'rubber-duck',
      squelch: 3, volume: 5, rfGain: 10, ptt: false
    };
  }

  function offsetSigned(s) {
    if (s.offsetDir === '+') return s.offsetMHz;
    if (s.offsetDir === '-') return -s.offsetMHz;
    return 0;
  }
  function txFrequency(s) { return round(s.frequency + offsetSigned(s)); }
  function round(n) { return Math.round(n * 1e6) / 1e6; }
  function antennaById(id) { return ANTENNAS.find(a => a.id === id); }
  function powerWatts(s) { return POWER_LEVELS[s.power] || 0; }

  function antennaFits(s) {
    const a = antennaById(s.antenna);
    return !!a && s.frequency >= a.minMHz && s.frequency <= a.maxMHz;
  }

  // Returns list of human-readable mismatches; empty list means the station is reached.
  function matchStation(station, s, forTransmit) {
    const m = station.match || {};
    const why = [];
    const tol = m.tolerance != null ? m.tolerance : 0.0005;
    if (m.frequency != null && Math.abs(s.frequency - m.frequency) > tol) why.push('frequency');
    if (m.mode && m.mode !== s.mode) why.push('mode');
    if (m.offset != null && Math.abs(offsetSigned(s) - m.offset) > 0.0005) why.push('offset');
    if (m.ctcssTx != null && String(m.ctcssTx) !== s.ctcssTx) why.push('ctcssTx');
    if (m.ctcssRx != null && String(m.ctcssRx) !== s.ctcssRx) why.push('ctcssRx');
    if (m.dcs != null && String(m.dcs) !== s.dcs) why.push('dcs');
    if (m.antenna) {
      const list = Array.isArray(m.antenna) ? m.antenna : [m.antenna];
      if (!list.includes(s.antenna)) why.push('antenna');
    }
    if (m.minPower != null && powerWatts(s) < m.minPower) why.push('power (too low)');
    if (m.maxPower != null && powerWatts(s) > m.maxPower) why.push('power (too high)');
    if (forTransmit && s.antenna === 'dummy-load') why.push('antenna (dummy load)');
    else if (!antennaFits(s)) why.push('antenna (not resonant on this band)');
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
    if (!next) { return { ended: true, feedback: r.feedback || null, correct: r.correct }; }
    if (!conv.station.conversation.nodes[next]) return { ended: true, error: 'missing node ' + next };
    conv.nodeId = next;
    return { ended: false, feedback: r.feedback || null, correct: r.correct };
  }

  function validateScenario(sc) {
    const errors = [];
    if (!sc || !Array.isArray(sc.stations)) return ['scenario.stations must be an array'];
    const ids = new Set();
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
        });
      });
    });
    return errors;
  }

  return { MODES, CTCSS_TONES, POWER_LEVELS, ANTENNAS, defaultState, offsetSigned, txFrequency, antennaById,
    powerWatts, antennaFits, matchStation, findStation, startConversation, currentNode, choose, validateScenario };
});
