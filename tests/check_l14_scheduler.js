'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-l14-'));
process.env.DATA_DIR = DATA_DIR;

const scheduler = require('../scheduler');
const storage = require('../storage');

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

const sentMessages = [];
const fakeBot = {
  telegram: {
    sendMessage(userId, text) {
      sentMessages.push(userId + ': ' + text.split('\n')[0]);
      return Promise.resolve();
    },
  },
};

ok('REPORT_TIME and interval', () => {
  assert.strictEqual(scheduler.REPORT_TIME, '08:00');
  assert.strictEqual(scheduler.INTERVAL_MS, 60000);
});

ok('Kyiv time helpers', () => {
  assert.strictEqual(scheduler.getKyivTime(new Date('2026-10-22T05:00:00Z')), '08:00');
  assert.strictEqual(scheduler.getKyivDay(new Date('2026-10-21T21:05:00Z')), '22.10.2026');
  assert.strictEqual(scheduler.kyivTime, scheduler.getKyivTime);
  assert.strictEqual(scheduler.kyivDay, scheduler.getKyivDay);
});

storage.loadData();
storage.setLastReportDay('');
storage.addSubscriber('report', 111);

ok('daily report 0 → 1 → 1', () => {
  scheduler.tick(fakeBot, new Date('2026-10-22T04:59:00Z'));
  assert.strictEqual(sentMessages.length, 0);
  scheduler.tick(fakeBot, new Date('2026-10-22T05:00:00Z'));
  assert.strictEqual(sentMessages.length, 1);
  scheduler.tick(fakeBot, new Date('2026-10-22T05:01:00Z'));
  assert.strictEqual(sentMessages.length, 1);
  assert.strictEqual(sentMessages[0], '111: Щоденний звіт за 24 години: записів немає.');
});

ok('due reminders are removed before sending', () => {
  const reminder = storage.addReminder(222, 'Перевірити полив', new Date(Date.now() - 1000).toISOString());
  scheduler.tick(fakeBot, new Date('2026-10-22T05:01:00Z'));
  assert.ok(sentMessages.some((item) => item.includes('⏰ Нагадування: Перевірити полив')));
  assert.strictEqual(storage.listUserReminders(222).some((item) => item.id === reminder.id), false);
});

ok('start uses exactly one 60s interval', () => {
  storage.removeSubscriber('report', 111);
  storage.setLastReportDay('');
  const original = global.setInterval;
  const calls = [];
  global.setInterval = function (fn, ms) {
    calls.push(ms);
    return { unref() {} };
  };
  try {
    scheduler.start(fakeBot);
  } finally {
    global.setInterval = original;
    scheduler.stop();
  }
  assert.deepStrictEqual(calls, [60000]);
});

fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`Пройдено: ${passed}, помилок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
