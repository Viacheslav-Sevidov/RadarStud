'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-l13-'));
process.env.DATA_DIR = DATA_DIR;

const stats = require('../utils/stats');
const validators = require('../utils/validators');
const format = require('../utils/format');
const storage = require('../storage');
const registerCommands = require('../handlers/commands');

let passed = 0;
let failed = 0;

function ok(name, fn) {
  try {
    fn();
    passed = passed + 1;
    console.log('OK ' + name);
  } catch (error) {
    failed = failed + 1;
    console.log('FAIL ' + name + ': ' + error.message);
  }
}

function makeCtx(text) {
  const replies = [];
  return {
    from: { id: 10 },
    message: { text },
    replies,
    reply(message) { replies.push(message); },
  };
}

const handlers = {};
registerCommands({
  start(fn) { handlers.start = fn; },
  command(name, fn) { handlers[name] = fn; },
  hears() {},
  on() {},
  catch() {},
});

ok('calcStats', () => {
  assert.deepStrictEqual(stats.calcStats([{ value: 20 }, { value: 22 }, { value: 27 }]), {
    count: 3, min: 20, max: 27, avg: 23,
  });
  assert.strictEqual(stats.calcStats([]), null);
});

ok('groupBySource / groupBySensor', () => {
  const groups = stats.groupBySource([
    { sensor: 'a', value: 1 },
    { sensor: 'b', value: 2 },
    { sensor: 'a', value: 3 },
  ]);
  assert.deepStrictEqual(Object.keys(groups), ['a', 'b']);
  assert.strictEqual(groups.a.length, 2);
  assert.strictEqual(stats.groupBySensor, stats.groupBySource);
});

ok('groupBySource handles constructor key', () => {
  const groups = stats.groupBySource([{ sensor: 'constructor', value: 5 }]);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(groups, 'constructor'), true);
});

ok('topValues', () => {
  const input = [{ value: 3 }, { value: 9 }, { value: 1 }, { value: 7 }];
  assert.deepStrictEqual(stats.topValues(input, 2), [{ value: 9 }, { value: 7 }]);
  assert.strictEqual(input.length, 4);
});

ok('parseCount', () => {
  assert.strictEqual(validators.parseCount(undefined), 5);
  assert.strictEqual(validators.parseCount('3'), 3);
  assert.strictEqual(validators.parseCount('0'), null);
  assert.strictEqual(validators.parseCount('abc'), null);
});

ok('formatStatsReport', () => {
  const text = format.formatStatsReport('Тест', [
    { sensor: 'a', value: 20 },
    { sensor: 'a', value: 25 },
  ]);
  assert.strictEqual(text, 'Тест: 2 записів\na: 2 шт, мін 20, макс 25, середнє 22.5');
});

storage.loadData();
storage.addManyReadings(1, [
  { sensor: 'теплиця-1', value: 20 },
  { sensor: 'теплиця-1', value: 25 },
  { sensor: 'теплиця-2', value: 31 },
]);

ok('storage.listTopReadings', () => {
  assert.deepStrictEqual(storage.listTopReadings(2).map((item) => item.value), [31, 25]);
});

ok('/report command', () => {
  const ctx = makeCtx('/report 24');
  handlers.report(ctx);
  assert.ok(ctx.replies[0].includes('За останні 24 год'));
  assert.ok(ctx.replies[0].includes('теплиця-1'));
});

ok('/top command', () => {
  const ctx = makeCtx('/top 2');
  handlers.top(ctx);
  assert.ok(ctx.replies[0].includes('Найбільші значення:'));
  assert.ok(ctx.replies[0].includes('31'));
});

fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`Пройдено: ${passed}, помилок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
