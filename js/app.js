(function () {
  const $ = id => document.getElementById(id);
  const state = Radio.defaultState();
  let scenario = null, conv = null, right = 0, asked = 0;
  const STORE = 'deadband.scenario';

  function opt(sel, value, label) {
    const o = document.createElement('option'); o.value = value; o.textContent = label || value; sel.appendChild(o);
  }
  function init() {
    Radio.MODES.forEach(m => opt($('mode'), m));
    ['OFF'].concat(Radio.CTCSS_TONES).forEach(t => { opt($('ctcssTx'), t); opt($('ctcssRx'), t); });
    ['OFF', '023', '025', '026', '031', '032', '036', '043', '047', '051', '053', '054', '065', '071', '072', '073', '074'].forEach(d => opt($('dcs'), d));
    Radio.ANTENNAS.forEach(a => opt($('antenna'), a.id, a.name));
    $('step').value = '0.005';
    ['mode', 'step', 'offsetDir', 'ctcssTx', 'ctcssRx', 'dcs', 'power', 'antenna'].forEach(id =>
      $(id).addEventListener('change', () => { state[id] = id === 'step' ? parseFloat($(id).value) : $(id).value; refresh(); }));
    ['squelch', 'volume', 'rfGain'].forEach(id => $(id).addEventListener('input', () => { state[id] = +$(id).value; refresh(); }));
    $('freq').addEventListener('change', () => {
      const v = parseFloat($('freq').value);
      if (isFinite(v) && v > 0) state.frequency = v; else log('sys', 'Invalid frequency.');
      refresh();
    });
    $('offsetMHz').addEventListener('change', () => {
      const v = parseFloat($('offsetMHz').value);
      if (isFinite(v) && v >= 0) state.offsetMHz = v;
      refresh();
    });
    $('freq').addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        state.frequency = Math.round((state.frequency + (e.key === 'ArrowUp' ? 1 : -1) * state.step) * 1e6) / 1e6;
        $('freq').value = state.frequency.toFixed(4); refresh();
      }
    });
    $('listen').addEventListener('click', listen);
    $('ptt').addEventListener('click', transmit);
    $('apply').addEventListener('click', applyEditor);
    $('download').addEventListener('click', download);
    $('reset').addEventListener('click', () => { localStorage.removeItem(STORE); loadScenario(); });
    loadScenario(); refresh();
  }

  function loadScenario() {
    const saved = localStorage.getItem(STORE);
    const p = saved ? Promise.resolve(JSON.parse(saved)) : fetch('data/scenario.json').then(r => r.json());
    p.then(setScenario).catch(e => log('sys', 'Could not load scenario: ' + e.message));
  }
  function setScenario(sc) {
    const errs = Radio.validateScenario(sc);
    if (errs.length) { $('editor-msg').textContent = errs.join('; '); return false; }
    scenario = sc; conv = null; right = asked = 0;
    $('editor-msg').textContent = 'Scenario loaded.';
    $('scenario-json').value = JSON.stringify(sc, null, 2);
    $('log').innerHTML = ''; $('responses').innerHTML = ''; score();
    document.title = sc.title || document.title;
    if (sc.intro) log('sys', sc.intro);
    return true;
  }
  function applyEditor() {
    try {
      const sc = JSON.parse($('scenario-json').value);
      if (setScenario(sc)) localStorage.setItem(STORE, JSON.stringify(sc));
    } catch (e) { $('editor-msg').textContent = 'Invalid JSON: ' + e.message; }
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$('scenario-json').value], { type: 'application/json' }));
    a.download = 'scenario.json'; a.click(); URL.revokeObjectURL(a.href);
  }

  function log(cls, text) {
    const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text;
    $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight;
  }
  function score() { $('score').textContent = asked ? 'Questions answered correctly: ' + right + ' / ' + asked : ''; }

  function fmt(f) { return f.toFixed(4); }
  function refresh() {
    const d = state.frequency.toFixed(4).split('.');
    $('freq-display').textContent = d[0] + '.' + d[1].slice(0, 3) + '.' + d[1].slice(3);
    $('status-line').textContent = state.mode + '  PWR ' + Radio.powerWatts(state) + 'W  ' +
      (state.ctcssTx !== 'OFF' ? 'T-SQL ' + state.ctcssTx : '') + (state.offsetDir !== 'OFF' ? '  DUP' + state.offsetDir : '');
    $('tx-info').textContent = 'TX frequency: ' + fmt(Radio.txFrequency(state)) + ' MHz' +
      (Radio.antennaFits(state) ? '' : ' | SWR warning: antenna is not resonant on this frequency');
    const hit = scenario && Radio.findStation(scenario.stations, state, false);
    $('smeter-bar').style.width = (hit && state.volume > 0 ? 70 : 10) + '%';
  }

  function listen() {
    if (!scenario) return;
    const st = Radio.findStation(scenario.stations, state, false);
    if (st && st.beacon) log('npc', '[' + st.name + '] ' + st.beacon);
    else log('sys', state.squelch >= 8 ? '(squelch closed)' : 'Static... nothing heard.');
  }

  function transmit() {
    if (!scenario) return;
    log('me', 'You transmit on ' + fmt(Radio.txFrequency(state)) + ' MHz (' + state.mode + ', ' + Radio.powerWatts(state) + ' W).');
    const st = Radio.findStation(scenario.stations, state, true);
    if (!st) {
      const near = scenario.stations.map(s => Radio.matchStation(s, state, true)).filter(w => w.length);
      log('sys', 'No reply. Check your settings (frequency, mode, offset, tones, antenna, power).');
      if (state.antenna === 'dummy-load') log('sys', 'You are transmitting into a dummy load: nothing is radiated.');
      return near;
    }
    conv = Radio.startConversation(st);
    if (!conv) return;
    show();
  }

  function show() {
    const node = Radio.currentNode(conv);
    log('npc', '[' + conv.station.name + '] ' + node.text);
    const box = $('responses'); box.innerHTML = '';
    (node.responses || []).forEach((r, i) => {
      const b = document.createElement('button'); b.textContent = r.text;
      b.addEventListener('click', () => answer(i)); box.appendChild(b);
    });
  }
  function answer(i) {
    const r = Radio.currentNode(conv).responses[i];
    log('me', r.text);
    const res = Radio.choose(conv, i);
    if (r.correct !== undefined) { asked++; if (r.correct) right++; score(); }
    if (res.feedback) log(res.correct === false ? 'bad' : 'good', res.feedback);
    if (res.error) log('sys', res.error);
    if (res.ended) { $('responses').innerHTML = ''; log('sys', '[Contact ended]'); conv = null; }
    else show();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
