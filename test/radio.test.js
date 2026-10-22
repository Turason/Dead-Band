const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/radio.js');
const sc = require('../data/scenario.json');

test('scenario validates', () => assert.deepStrictEqual(R.validateScenario(sc), []));

test('calling frequency match', () => {
  const s = R.defaultState();
  assert.strictEqual(R.findStation(sc.stations, s, true).id, 'calling');
  s.frequency = 146.53;
  assert.strictEqual(R.findStation(sc.stations, s, true), null);
});

test('repeater requires offset and tone', () => {
  const s = Object.assign(R.defaultState(), { frequency: 146.94 });
  assert.strictEqual(R.findStation(sc.stations, s, true), null);
  s.offsetDir = '-'; s.ctcssTx = '100.0';
  assert.strictEqual(R.findStation(sc.stations, s, true).id, 'repeater');
  assert.strictEqual(R.txFrequency(s), 146.34);
});

test('HF needs antenna and mode; dummy load cannot transmit', () => {
  const s = Object.assign(R.defaultState(), { frequency: 7.2, mode: 'LSB' });
  assert.strictEqual(R.findStation(sc.stations, s, true), null);
  s.antenna = 'dipole-40m';
  assert.strictEqual(R.findStation(sc.stations, s, true).id, 'sam40');
  s.antenna = 'dummy-load';
  assert.strictEqual(R.findStation(sc.stations, s, true), null);
});

test('conversation flows', () => {
  const conv = R.startConversation(sc.stations[0]);
  assert.strictEqual(R.choose(conv, 0).ended, false);
  assert.strictEqual(conv.nodeId, 'clue');
  assert.strictEqual(R.choose(conv, 0).ended, true);
});
