const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/radio.js');
const sc = require('../data/scenario.json');

test('scenario validates', () => assert.deepStrictEqual(R.validateScenario(sc), []));

test('calling frequency match', () => {
  const s = R.defaultState();
  assert.strictEqual(R.findStation(sc.stations, s, true).id, 'mara-calling');
  s.frequency = 146.53;
  assert.strictEqual(R.findStation(sc.stations, s, true), null);
});

test('repeater requires offset and tone', () => {
  const s = Object.assign(R.defaultState(), { frequency: 146.94 });
  s.offsetDir = '-';
  assert.strictEqual(R.findStation(sc.stations, s, true).id, 'ridge-no-tone');
  s.ctcssTx = '100.0';
  assert.strictEqual(R.findStation(sc.stations, s, true).id, 'ridge-repeater');
  assert.strictEqual(R.txFrequency(s), 146.34);
});

test('HF needs antenna and mode; dummy load cannot transmit', () => {
  const s = Object.assign(R.defaultState(), { frequency: 7.2, mode: 'LSB' });
  const station = { match: { frequency: 7.2, mode: 'LSB', antenna: 'dipole-40m' } };
  assert.notStrictEqual(R.matchStation(station, s, true).length, 0);
  s.antenna = 'dipole-40m';
  assert.strictEqual(R.matchStation(station, s, true).length, 0);
  s.antenna = 'dummy-load';
  assert.notStrictEqual(R.matchStation(station, s, true).length, 0);
});

test('conversation flows', () => {
  const conv = R.startConversation(sc.stations[0]);
  assert.strictEqual(R.choose(conv, 0).ended, false);
  assert.strictEqual(conv.nodeId, 'too-fast');
  assert.strictEqual(R.choose(conv, 0).ended, false);
  assert.strictEqual(conv.nodeId, 'listened');
  assert.strictEqual(R.choose(conv, 0).ended, false);
  assert.strictEqual(conv.nodeId, 'contact');
  assert.strictEqual(R.choose(conv, 0).ended, true);
});
