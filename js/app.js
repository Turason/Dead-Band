(function () {
  const $ = id => document.getElementById(id);
  const state = Radio.defaultState();
  let scenario = null, conv = null, right = 0, asked = 0, chapterManifest = null, chapterIndex = 0;
  const STORE_PREFIX = 'deadband.chapter.';
  const CURRENT_CHAPTER_STORE = 'deadband.currentChapter';

  function opt(sel, value, label) {
    const o = document.createElement('option'); o.value = value; o.textContent = label || value; sel.appendChild(o);
  }
  function init() {
    Radio.MODES.forEach(m => opt($('mode'), m));
    ['OFF'].concat(Radio.CTCSS_TONES).forEach(t => { opt($('ctcssTx'), t); opt($('ctcssRx'), t); });
    ['OFF'].concat(Radio.DCS_CODES).forEach(d => opt($('dcs'), d));
    Radio.POWER_LEVELS.forEach(watts => opt($('power'), String(watts), watts + ' W'));
    Radio.ANTENNAS.forEach(a => opt($('antenna'), a.id, a.name));
    Radio.FEED_LINES.forEach(line => opt($('feedLine'), line.id, line.name));
    $('power').value = String(state.power);
    $('step').value = '0.005';
    const numericControls = ['step', 'offsetMHz', 'ritHz', 'antennaDirection', 'antennaHeight',
      'dmrColorCode', 'dmrTalkgroup', 'dmrTimeSlot'];
    const stateControls = ['mode', 'offsetDir', 'ctcssTx', 'ctcssRx', 'dcs', 'power', 'bandwidth',
      'antenna', 'antennaOrientation', 'tuner', 'feedLine', 'powerSupply', 'preamp', 'attenuator'];
    numericControls.concat(stateControls, ['reverse']).forEach(id =>
      $(id).addEventListener('change', () => {
        if (!$(id).checkValidity() || (numericControls.includes(id) && $(id).value.trim() === '')) {
          log('sys', 'Invalid value for ' + id + '.');
          refresh();
          return;
        }
        const value = $(id).type === 'checkbox' ? $(id).checked :
          numericControls.includes(id) ? Number($(id).value) : $(id).value;
        if (id.startsWith('dmr')) state.dmr[id === 'dmrColorCode' ? 'colorCode' : id === 'dmrTalkgroup' ? 'talkgroup' : 'timeSlot'] = value;
        else if (id === 'preamp' || id === 'attenuator') state[id] = value === 'true';
        else state[id] = value;
        refresh();
      }));
    ['squelch', 'volume', 'rfGain'].forEach(id => $(id).addEventListener('input', () => { state[id] = +$(id).value; refresh(); }));
    $('freq').addEventListener('change', () => {
      const v = parseFloat($('freq').value);
      if ($('freq').checkValidity() && isFinite(v) && v > 0) state.frequency = v;
      else log('sys', 'Invalid frequency.');
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
    $('reset').addEventListener('click', resetCurrentChapter);
    $('rit-center').addEventListener('click', () => { $('ritHz').value = '0'; state.ritHz = 0; refresh(); });
    $('dtmf-keypad').addEventListener('click', e => {
      if (e.target.dataset.dtmf) {
        state.dtmfSequence += e.target.dataset.dtmf;
        $('dtmf-sequence').value = state.dtmfSequence;
      }
    });
    $('dtmf-clear').addEventListener('click', clearDtmf);
    $('dtmf-send').addEventListener('click', sendDtmf);
    loadScenario(); refresh();
  }

  function loadScenario() {
    fetch('data/chapters.json')
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(manifest => {
        const errs = Radio.validateChapterManifest(manifest);
        if (errs.length) throw new Error(errs.join('; '));
        chapterManifest = manifest;
        const savedId = localStorage.getItem(CURRENT_CHAPTER_STORE);
        let index = manifest.chapters.findIndex(chapter => chapter.id === savedId);
        if (index < 0) {
          if (savedId) log('sys', 'Saved chapter is no longer listed. Starting at Chapter 1.');
          index = 0;
        }
        loadChapter(index);
      })
      .catch(e => log('sys', 'Could not load chapters: ' + e.message));
  }
  function loadChapter(index) {
    const entry = chapterManifest && chapterManifest.chapters[index];
    if (!entry) {
      log('sys', 'Cannot load Chapter ' + (index + 1) + ': chapter is not listed.');
      return;
    }
    const saved = localStorage.getItem(STORE_PREFIX + entry.id);
    const request = saved
      ? Promise.resolve().then(() => JSON.parse(saved))
      : fetch('data/' + entry.file).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    request.then(sc => {
      if (!setScenario(sc, index)) log('sys', 'Could not load Chapter ' + (index + 1) + ': scenario validation failed.');
    }).catch(e => log('sys', 'Could not load Chapter ' + (index + 1) + ': ' + e.message));
  }
  function setScenario(sc, index) {
    const errs = Radio.validateScenario(sc);
    if (errs.length) { $('editor-msg').textContent = errs.join('; '); return false; }
    chapterIndex = index;
    localStorage.setItem(CURRENT_CHAPTER_STORE, chapterManifest.chapters[index].id);
    scenario = sc; conv = null; right = asked = 0;
    state.dtmfSequence = '';
    $('editor-msg').textContent = 'Scenario loaded.';
    $('scenario-json').value = JSON.stringify(sc, null, 2);
    $('log').innerHTML = ''; $('responses').innerHTML = ''; $('chapter-actions').innerHTML = ''; score();
    $('dtmf-sequence').value = '';
    document.title = sc.title || document.title;
    $('dtmf-controls').hidden = !(sc.features && sc.features.dtmf === true);
    $('chapter-heading').textContent = 'Chapter ' + (index + 1) + ': ' + (sc.chapterTitle || sc.title || '');
    $('chapter-conditions').textContent = sc.day + '  |  Local time: ' + sc.time + '  |  Weather: ' + sc.weather;
    if (!$('dtmf-controls').hidden) log('sys', '[DTMF keypad available in this chapter.]');
    if (sc.intro) log('sys', sc.intro);
    return true;
  }
  function applyEditor() {
    try {
      const sc = JSON.parse($('scenario-json').value);
      if (setScenario(sc, chapterIndex)) localStorage.setItem(STORE_PREFIX + chapterManifest.chapters[chapterIndex].id, JSON.stringify(sc));
    } catch (e) { $('editor-msg').textContent = 'Invalid JSON: ' + e.message; }
  }
  function resetCurrentChapter() {
    const entry = chapterManifest && chapterManifest.chapters[chapterIndex];
    if (!entry) return;
    localStorage.removeItem(STORE_PREFIX + entry.id);
    loadChapter(chapterIndex);
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$('scenario-json').value], { type: 'application/json' }));
    a.download = chapterManifest.chapters[chapterIndex].file; a.click(); URL.revokeObjectURL(a.href);
  }

  function log(cls, text) {
    const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text;
    $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight;
  }
  function score() { $('score').textContent = asked ? 'Questions answered correctly: ' + right + ' / ' + asked : ''; }

  function fmt(f) { return f.toFixed(4); }
  function refresh() {
    $('freq').value = state.frequency.toFixed(4);
    $('offsetMHz').value = state.offsetMHz.toFixed(3);
    $('ritHz').value = String(state.ritHz);
    $('dmrColorCode').value = String(state.dmr.colorCode);
    $('dmrTalkgroup').value = String(state.dmr.talkgroup);
    $('dmrTimeSlot').value = String(state.dmr.timeSlot);
    $('dmr-settings').hidden = state.mode !== 'DIGITAL';
    const d = state.frequency.toFixed(4).split('.');
    $('freq-display').textContent = d[0] + '.' + d[1].slice(0, 3) + '.' + d[1].slice(3);
    $('status-line').textContent = state.mode + '  ' + state.bandwidth + '  PWR ' + Radio.powerWatts(state) + 'W  ' +
      (state.ctcssTx !== 'OFF' ? 'CTCSS TX ' + state.ctcssTx : '') + (state.offsetDir !== 'OFF' ? '  DUP' + state.offsetDir : '') +
      (state.reverse ? '  REV' : '');
    $('tx-info').textContent = 'TX ' + fmt(Radio.txFrequency(state)) + ' MHz  |  RX ' + fmt(Radio.rxFrequency(state)) + ' MHz';
    const swr = Radio.estimateSWR(state);
    $('swr-result').textContent = 'Estimated transmitter SWR: ' + swr.toFixed(1) + ':1' +
      (state.antenna === 'dummy-load' ? ' (dummy load)' : state.tuner === 'TUNE' && !Radio.antennaFits(state)
        ? ' (tuner reduces SWR at the radio; antenna efficiency may still be poor)' : '');
    const hit = scenario && Radio.findStation(scenario.stations, state, false);
    $('smeter-bar').style.width = (hit && state.volume > 0 ? Radio.signalStrength(hit, state) * 10 : 10) + '%';
  }

  function listen() {
    if (!scenario) return;
    const st = Radio.findStation(scenario.stations, state, false);
    if (!st) { log('sys', 'Static... nothing heard.'); return; }
    if (Radio.signalStrength(st, state) <= state.squelch) { log('sys', '(squelch closed)'); return; }
    if (st.beacon) log('npc', '[' + st.name + '] ' + st.beacon);
    else log('sys', 'Static... nothing heard.');
  }

  function transmit() {
    if (!scenario) return;
    log('me', 'You transmit on ' + fmt(Radio.txFrequency(state)) + ' MHz (' + state.mode + ', ' + Radio.powerWatts(state) + ' W).');
    const st = Radio.findStation(scenario.stations, state, true);
    if (!st) {
      const near = scenario.stations.map(s => Radio.matchStation(s, state, true)).filter(w => w.length);
      log('sys', 'No reply. Check radio settings and station configuration (frequency, mode, shift, tones, bandwidth, RIT, DMR, antenna, power).');
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
    if (res.ended) {
      $('responses').innerHTML = ''; log('sys', '[Contact ended]'); conv = null;
      if (res.chapterComplete) offerNextChapter();
    }
    else show();
  }
  function offerNextChapter() {
    const nextIndex = chapterIndex + 1;
    const actions = $('chapter-actions');
    actions.innerHTML = '';
    if (nextIndex >= chapterManifest.chapters.length) {
      log('sys', '[Chapter complete. No next chapter is available yet.]');
      return;
    }
    const button = document.createElement('button');
    button.textContent = 'Next chapter: Chapter ' + (nextIndex + 1);
    button.addEventListener('click', () => loadChapter(nextIndex));
    actions.appendChild(button);
  }
  function clearDtmf() {
    state.dtmfSequence = '';
    $('dtmf-sequence').value = '';
  }
  function sendDtmf() {
    if (!scenario || !state.dtmfSequence) {
      log('sys', 'Enter at least one DTMF digit first.');
      return;
    }
    const digits = state.dtmfSequence;
    log('me', 'You send DTMF tones: ' + digits);
    const station = Radio.findStation(scenario.stations, state, true);
    const response = station && station.dtmfSequences && station.dtmfSequences[digits];
    if (response) log('npc', '[' + station.name + '] ' + response);
    else log('sys', 'No DTMF response.');
    clearDtmf();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
