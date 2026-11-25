'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-l15-'));
process.env.DATA_DIR = DATA_DIR;

const config = require('../config');
const storage = require('../storage');
const broadcaster = require('../broadcast');
const alerts = require('../alerts');
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

async function okAsync(name, fn) {
  try {
    await fn();
    passed = passed + 1;
    console.log('OK ' + name);
  } catch (error) {
    failed = failed + 1;
    console.log('FAIL ' + name + ': ' + error.message);
  }
}

const handlers = {};
registerCommands({
  start() {},
  command(name, fn) { handlers[name] = fn; },
  hears() {},
  on() {},
  catch() {},
});

function makeCtx(text, userId) {
  const replies = [];
  return {
    from: { id: userId },
    message: { text },
    replies,
    reply(message) { replies.push(message); },
  };
}

ok('topics include project names and aliases', () => {
  for (const topic of ['Дистанційка', 'Вакансії', 'Івенти', 'report', 'alert', 'news']) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(config.TOPICS, topic), true);
  }
  assert.strictEqual(config.BROADCAST_PAUSE_MS, 50);
});

async function main() {
  storage.loadData();
  for (const userId of [1, 2, 3, 4, 5]) {
    storage.addSubscriber('news', userId);
  }
  const received = [];
  const fakeBot = {
    telegram: {
      sendMessage(userId) {
        if (userId === 3) {
          const blocked = new Error('Forbidden: bot was blocked by the user');
          blocked.code = 403;
          return Promise.reject(blocked);
        }
        if (userId === 5) {
          return Promise.reject(new Error('мережа недоступна'));
        }
        received.push(userId);
        return Promise.resolve();
      },
    },
  };

  await okAsync('broadcast delivers, counts errors and unsubscribes 403 only', async () => {
    const started = Date.now();
    const result = await broadcaster.broadcast(fakeBot, 'news', 'Тестова розсилка');
    const elapsed = Date.now() - started;
    assert.deepStrictEqual(result, { delivered: 3, failed: 2 });
    assert.deepStrictEqual(received, [1, 2, 4]);
    assert.deepStrictEqual(storage.listSubscribers('news'), [1, 2, 4, 5]);
    assert.ok(elapsed >= 200, '_elapsed=' + elapsed);
  });

  const alertReceived = [];
  const alertBot = {
    telegram: {
      sendMessage(userId, text) {
        alertReceived.push({ userId, text });
        return Promise.resolve();
      },
    },
  };
  storage.addSubscriber('alert', 7);

  await okAsync('alerts: normal value stays silent', async () => {
    alerts.checkReading(alertBot, { id: 1, sensor: 'a', value: 20, createdAt: new Date().toISOString() });
    await broadcaster.sleep(120);
    assert.strictEqual(alertReceived.length, 0);
  });

  await okAsync('alerts: anomaly is broadcast', async () => {
    alerts.checkReading(alertBot, { id: 2, sensor: 'a', value: 35, createdAt: new Date().toISOString() });
    await broadcaster.sleep(120);
    assert.strictEqual(alertReceived.length, 1);
    assert.ok(alertReceived[0].text.includes('⚠ Аномалія'));
    assert.ok(alertReceived[0].text.includes('Допустимо: від 10 до 30'));
  });

  await okAsync('alerts: boundaries are normal', async () => {
    alerts.checkReading(alertBot, { id: 3, sensor: 'a', value: 10, createdAt: new Date().toISOString() });
    alerts.checkReading(alertBot, { id: 4, sensor: 'a', value: 30, createdAt: new Date().toISOString() });
    await broadcaster.sleep(150);
    assert.strictEqual(alertReceived.length, 1);
  });

  await okAsync('/broadcast is admin-only', async () => {
    const guest = makeCtx('/broadcast привіт', 7);
    await handlers.broadcast(guest);
    assert.ok(guest.replies[0].includes('лише для адміністратора'));
    storage.removeSubscriber('news', 1);
    storage.removeSubscriber('news', 2);
    storage.removeSubscriber('news', 4);
    storage.removeSubscriber('news', 5);
    const admin = makeCtx('/broadcast привіт', config.ADMIN_ID);
    await handlers.broadcast(admin);
    assert.ok(admin.replies[0].includes('Розсилку запущено'));
  });

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`Пройдено: ${passed}, помилок: ${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
