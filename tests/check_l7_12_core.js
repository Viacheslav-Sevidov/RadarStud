'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-core-'));
process.env.DATA_DIR = DATA_DIR;

const config = require('../config');
const validators = require('../utils/validators');
const storage = require('../storage');
const format = require('../utils/format');
const csv = require('../utils/csv');
const logger = require('../logger');
const registerCommands = require('../handlers/commands');
const registerDialog = require('../handlers/dialog');

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

function makeCtx(text, userId) {
  const replies = [];
  return {
    from: { id: userId === undefined ? 42 : userId },
    message: { text },
    replies,
    reply(message, extra) {
      replies.push({ message, extra });
    },
  };
}

const handlers = {};
const hears = {};
const fakeBot = {
  start(fn) { handlers.start = fn; },
  command(name, fn) { handlers[name] = fn; },
  hears(text, fn) { hears[text] = fn; },
  on(event, fn) { handlers.onText = fn; },
  catch(fn) { handlers.catch = fn; },
};
registerCommands(fakeBot);
registerDialog(fakeBot);

ok('parseNumber', () => {
  assert.strictEqual(validators.parseNumber('12,5'), 12.5);
  assert.strictEqual(validators.parseNumber('Infinity'), null);
  assert.strictEqual(validators.parseNumber('abc'), null);
});

ok('parseId / parseHours / parseCount / parseMinutes', () => {
  assert.strictEqual(validators.parseId('3'), 3);
  assert.strictEqual(validators.parseId('abc'), null);
  assert.strictEqual(validators.parseHours(undefined), 24);
  assert.strictEqual(validators.parseHours('6'), 6);
  assert.strictEqual(validators.parseHours('0'), null);
  assert.strictEqual(validators.parseCount(undefined), 5);
  assert.strictEqual(validators.parseCount('0'), null);
  assert.strictEqual(validators.parseMinutes('30'), 30);
  assert.strictEqual(validators.parseMinutes('0'), null);
  assert.strictEqual(validators.parseMinutes('10081'), null);
});

ok('CSV parsing', () => {
  const rows = csv.parseCsv('sensor;value\r\nтеплиця-1;24,5\r\n');
  assert.deepStrictEqual(rows[0].cells, ['sensor', 'value']);
  assert.deepStrictEqual(rows[1].cells, ['теплиця-1', '24,5']);
});

ok('storage CRUD', () => {
  storage.loadData();
  const record = storage.addReading(1, 'тест', 5);
  assert.strictEqual(record.id, 1);
  assert.strictEqual(storage.getReading(record.id).sensor, 'тест');
  assert.strictEqual(storage.getReading(999), null);
  assert.strictEqual(storage.updateReading(record.id, 7).value, 7);
  assert.strictEqual(storage.deleteReading(record.id).id, record.id);
  assert.strictEqual(storage.listReadings().length, 0);
  assert.strictEqual(storage.addManyReadings(1, [
    { sensor: 'a', value: 1 },
    { sensor: 'b', value: 2 },
  ]), 2);
  assert.strictEqual(storage.listReadings().length, 2);
});

ok('profile save/get', () => {
  const profile = { name: 'Аня', categories: ['Вакансії'], format: 'одразу' };
  storage.saveUser(42, profile);
  assert.deepStrictEqual(storage.getUser(42), profile);
});

ok('legacy and topic subscriptions', () => {
  storage.loadData();
  storage.addSubscriber(111);
  storage.addSubscriber('news', 1);
  storage.addSubscriber('news', 1);
  storage.addSubscriber('news', 2);
  assert.deepStrictEqual(storage.listSubscribers('news'), [1, 2]);
  assert.strictEqual(storage.isSubscribed('news', 1), true);
  assert.strictEqual(storage.isSubscribed('alert', 1), false);
  assert.strictEqual(storage.isSubscribed(111), true);
  storage.removeSubscriber('news', 1);
  storage.removeSubscriber('news', 2);
  assert.deepStrictEqual(storage.listSubscribers('news'), []);
});

ok('reminders and report day', () => {
  storage.loadData();
  const reminder = storage.addReminder(1, 'тест', new Date(Date.now() - 1000).toISOString());
  assert.strictEqual(storage.listDueReminders(Date.now()).length, 1);
  storage.removeReminder(reminder.id);
  assert.strictEqual(storage.listDueReminders(Date.now()).length, 0);
  assert.strictEqual(storage.getLastReportDay(), '');
  storage.setLastReportDay('22.10.2026');
  assert.strictEqual(storage.getLastReportDay(), '22.10.2026');
  storage.setLastReportDay('');
});

ok('corrupt JSON is reported', () => {
  const usersFile = path.join(config.DATA_DIR, 'users.json');
  fs.writeFileSync(usersFile, '{broken', 'utf8');
  assert.throws(() => storage.loadData(), /Файл users\.json пошкоджений/);
  fs.rmSync(usersFile, { force: true });
});

ok('format helpers', () => {
  assert.strictEqual(format.NOT_FOUND_TEXT, 'Запису з таким номером немає.');
  assert.strictEqual(format.SAVE_FAILED_TEXT, 'Не вдалося зберегти зміни. Спробуй пізніше.');
  assert.ok(format.formatImportReport(2, ['Рядок 3: помилка']).includes('Імпортовано записів: 2'));
});

ok('logger writes ERROR to bot.log', () => {
  logger.error('тестова помилка');
  const text = fs.readFileSync(path.join(config.DATA_DIR, 'bot.log'), 'utf8');
  assert.ok(text.includes('[ERROR] тестова помилка'));
});

ok('commands and buttons registered', () => {
  for (const name of ['start', 'settings', 'last_alert', 'help', 'alert', 'cancel', 'check']) {
    assert.strictEqual(typeof handlers[name], 'function', name);
  }
  assert.strictEqual(typeof handlers['⚙️ Налаштування'], 'undefined');
  assert.strictEqual(typeof hears['⚙️ Налаштування'], 'function');
  assert.strictEqual(typeof handlers.onText, 'function');
});

ok('/start shows main menu', () => {
  const ctx = makeCtx('/start');
  handlers.start(ctx);
  assert.ok(ctx.replies[0].message.includes('RadarStud'));
  assert.ok(ctx.replies[0].extra);
});

ok('settings dialogue saves profile', () => {
  const ctx = makeCtx('/settings');
  handlers.settings(ctx);
  ctx.message.text = 'Аня';
  handlers.onText(ctx);
  ctx.message.text = 'Дистанційка, Вакансії';
  handlers.onText(ctx);
  ctx.message.text = 'одразу';
  handlers.onText(ctx);
  assert.ok(ctx.replies[ctx.replies.length - 1].message.includes('✅ Збережено!'));
  assert.strictEqual(storage.getUser(42).name, 'Аня');
});

ok('/check branches', () => {
  const critical = makeCtx('/check 50 60');
  handlers.check(critical);
  assert.ok(critical.replies[0].message.includes('КРИТИЧНО'));
  const calm = makeCtx('/check 10 10');
  handlers.check(calm);
  assert.ok(calm.replies[0].message.includes('Спокійно'));
  const noisy = makeCtx('/check 40 10');
  handlers.check(noisy);
  assert.ok(noisy.replies[0].message.includes('Високий шум'));
  const overload = makeCtx('/check 100 10');
  handlers.check(overload);
  assert.ok(overload.replies[0].message.includes('Перевантаження'));
  const invalid = makeCtx('/check abc 10');
  handlers.check(invalid);
  assert.ok(invalid.replies[0].message.includes('Потрібно два числа'));
});

ok('/alert admin guard', () => {
  const guest = makeCtx('/alert', 7);
  handlers.alert(guest);
  assert.ok(guest.replies[0].message.includes('Доступ заборонено'));
  const admin = makeCtx('/alert', config.ADMIN_ID);
  handlers.alert(admin);
  assert.ok(admin.replies[0].message.includes('режим розсилки'));
});

ok('/cancel clears state', () => {
  const ctx = makeCtx('/cancel');
  const { userStates } = require('../state');
  userStates.set(42, { step: 'name', data: {} });
  handlers.cancel(ctx);
  assert.strictEqual(userStates.has(42), false);
  const empty = makeCtx('/cancel');
  handlers.cancel(empty);
  assert.ok(empty.replies[0].message.includes('Немає активного діалогу'));
});

ok('bot.catch is installed', () => {
  const exported = require('../bot');
  assert.strictEqual(typeof exported.bot.catch, 'function');
  assert.strictEqual(typeof exported.handleDialogue, 'function');
});

fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`Пройдено: ${passed}, помилок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
