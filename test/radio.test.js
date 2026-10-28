const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/radio.js');
const sc = require('../data/scenario1.json');
const chapters = require('../data/chapters.json');

test('scenario validates', () => assert.deepStrictEqual(R.validateScenario(sc), []));
test('chapter manifest validates', () => assert.deepStrictEqual(R.validateChapterManifest(chapters), []));

test('radio power options and repeater receive/transmit controls', () => {
  const s = R.defaultState();
  assert.deepStrictEqual(R.POWER_LEVELS, [1, 5, 10, 25, 50, 100]);
  assert.strictEqual(R.powerWatts(s), 5);
  assert.strictEqual(R.powerWatts({ power: 'HIGH' }), 50);
  s.offsetDir = '-';
  assert.strictEqual(R.txFrequency(s), 145.92);
  assert.strictEqual(R.rxFrequency(s), 146.52);
  s.reverse = true;
  assert.strictEqual(R.txFrequency(s), 146.52);
  assert.strictEqual(R.rxFrequency(s), 145.92);
  s.reverse = false;
  s.ritHz = 500;
  assert.strictEqual(R.rxFrequency(s), 146.5205);
});

test('station requirements cover radio and station configuration', () => {
  const station = { match: {
    frequency: 146.52, mode: 'DIGITAL', bandwidth: 'NARROW', ritHz: 0, reverse: false,
    dmr: { colorCode: 1, talkgroup: 91, timeSlot: 2 },
    antenna: 'yagi-2m', antennaOrientation: 'HORIZONTAL', antennaDirection: 90,
    minAntennaHeight: 10, tuner: 'TUNE', feedLine: 'rg-213', powerSupply: 'generator',
    preamp: true, attenuator: false, minPower: 10
  } };
  const s = Object.assign(R.defaultState(), {
    frequency: 146.52, mode: 'DIGITAL', bandwidth: 'NARROW', power: 10,
    dmr: { colorCode: 1, talkgroup: 91, timeSlot: 2 },
    antenna: 'yagi-2m', antennaOrientation: 'HORIZONTAL', antennaDirection: 100,
    antennaHeight: 12, tuner: 'TUNE', feedLine: 'rg-213', powerSupply: 'generator',
    preamp: true, attenuator: false
  });
  assert.deepStrictEqual(R.matchStation(station, s, true), []);
  s.dmr.talkgroup = 9;
  assert.ok(R.matchStation(station, s, true).includes('DMR talkgroup'));
  s.dmr.talkgroup = 91;
  s.antennaDirection = 120;
  assert.ok(R.matchStation(station, s, true).includes('antenna direction'));
});

test('tuner SWR estimate and chapter-gated DTMF metadata', () => {
  const s = Object.assign(R.defaultState(), { frequency: 7.2 });
  assert.strictEqual(R.estimateSWR(s), 5);
  s.tuner = 'TUNE';
  assert.strictEqual(R.estimateSWR(s), 1.5);
  s.antenna = 'dummy-load';
  assert.strictEqual(R.estimateSWR(s), 1);
  assert.deepStrictEqual(R.validateScenario(Object.assign({}, sc, { features: { dtmf: true } })), []);
  assert.ok(R.validateScenario(Object.assign({}, sc, { features: { dtmf: 'yes' } })).includes('scenario.features.dtmf must be a boolean'));
});

test('preamp, attenuator, RF gain, and squelch affect received signal level', () => {
  const station = { signalStrength: 7 };
  const s = R.defaultState();
  assert.strictEqual(R.signalStrength(station, s), 7);
  s.preamp = true;
  assert.strictEqual(R.signalStrength(station, s), 9);
  s.attenuator = true;
  assert.strictEqual(R.signalStrength(station, s), 6);
  s.rfGain = 0;
  assert.strictEqual(R.signalStrength(station, s), 1);
});

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
  const ending = R.choose(conv, 0);
  assert.strictEqual(ending.ended, true);
  assert.strictEqual(ending.chapterComplete, false);
});

test('final chapter response is explicitly marked complete', () => {
  const station = sc.stations.find(s => s.id === 'ridge-repeater');
  const conv = R.startConversation(station);
  R.choose(conv, 0);
  R.choose(conv, 0);
  const ending = R.choose(conv, 0);
  assert.strictEqual(ending.ended, true);
  assert.strictEqual(ending.chapterComplete, true);
});
