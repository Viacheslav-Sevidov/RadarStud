'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-l17-'));
process.env.DATA_DIR = DATA_DIR;

const config = require('../config');
const storage = require('../storage');
const signal = require('../utils/signal');
const outbox = require('../utils/outbox');
const ingest = require('../ingest');

config.INGEST_KEY = 'check-key';
config.INGEST_API_KEY = 'check-key';
config.INGEST_PORT = 0;
config.INGEST_HOST = '127.0.0.1';

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

ok('signal constants', () => {
  assert.deepStrictEqual(signal.SENSORS.map((sensor) => sensor.name), ['теплиця-1', 'теплиця-2']);
  assert.strictEqual(signal.PERIOD, 60);
  assert.strictEqual(signal.ANOMALY_CHANCE, 0.03);
  assert.strictEqual(signal.ANOMALY_SIZE, 12);
});

ok('makeRandom seeds', () => {
  const a = signal.makeRandom(42);
  assert.strictEqual([a(), a(), a()].map((value) => value.toFixed(4)).join(' '), '0.2523 0.0881 0.5773');
  const b = signal.makeRandom(43);
  assert.strictEqual([b(), b(), b()].map((value) => value.toFixed(4)).join(' '), '0.2527 0.1788 0.2620');
});

ok('generateValue sequence', () => {
  const random = signal.makeRandom(15);
  const output = [];
  for (let step = 0; step < 4; step++) {
    for (const sensor of signal.SENSORS) {
      output.push(signal.generateValue(sensor, step, random));
    }
  }
  assert.strictEqual(output.join(' '), '21.7 17.7 22.3 18.6 22.5 6.7 22.9 30.9');
});

ok('outbox addToQueue and isPermanent', () => {
  const queue = [];
  outbox.addToQueue(queue, 1, 3);
  outbox.addToQueue(queue, 2, 3);
  outbox.addToQueue(queue, 3, 3);
  assert.strictEqual(outbox.addToQueue(queue, 4, 3), 1);
  assert.deepStrictEqual(queue, [2, 3, 4]);
  assert.strictEqual(outbox.isPermanent({ status: 400 }), true);
  assert.strictEqual(outbox.isPermanent({ status: 401 }), false);
  assert.strictEqual(outbox.isPermanent({ status: 500 }), false);
  assert.strictEqual(outbox.isPermanent(new Error('мережа')), false);
});

ok('outbox persistence', () => {
  outbox.saveQueue([{ eventId: 'a' }]);
  assert.deepStrictEqual(outbox.loadQueue(), [{ eventId: 'a' }]);
  outbox.saveQueue([]);
});

ok('isValidTime', () => {
  const now = Date.parse('2026-11-05T10:00:00.000Z');
  assert.strictEqual(ingest.isValidTime(new Date(now).toISOString(), now), true);
  assert.strictEqual(ingest.isValidTime('2026-11-05', now), false);
  assert.strictEqual(ingest.isValidTime('2026-11-05T10:00:00+02:00', now), false);
  assert.strictEqual(ingest.isValidTime(new Date(now + 6 * 60 * 1000).toISOString(), now), false);
  assert.strictEqual(ingest.isValidTime(new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(), now), false);
});

async function main() {
  await okAsync('flushQueue retries and stops on transient error', async () => {
    const queue = [1, 2, 3, 4];
    const result = await outbox.flushQueue(queue, async (value) => {
      if (value === 3) {
        throw new Error('мережа');
      }
    });
    assert.deepStrictEqual(result, { sent: 2, dropped: 0, left: 2, error: 'мережа' });
    assert.deepStrictEqual(queue, [3, 4]);
  });

  const alertMessages = [];
  const fakeBot = {
    telegram: {
      sendMessage(userId, text) {
        alertMessages.push(text);
        return Promise.resolve();
      },
    },
  };

  let server;
  let url;
  try {
    server = ingest.start(fakeBot);
    assert.ok(server, 'INGEST_KEY has to be configured');
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
    }
    url = 'http://127.0.0.1:' + server.address().port + '/readings';

    const post = (body, key) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key === undefined ? 'check-key' : key },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

    await okAsync('HTTP key and body validation', async () => {
      let response = await post({ sensor: 'a', value: 1, time: new Date().toISOString() }, 'wrong');
      assert.strictEqual(response.status, 401);
      response = await post('{broken');
      assert.strictEqual(response.status, 400);
      response = await post({ sensor: 'a', value: '20', time: new Date().toISOString() });
      assert.strictEqual(response.status, 400);
      response = await post({ sensor: 'a', value: 20 });
      assert.strictEqual(response.status, 400);
      response = await post('x'.repeat(11 * 1024));
      assert.strictEqual(response.status, 413);
    });

    await okAsync('valid reading is created once', async () => {
      const time = new Date().toISOString();
      const response = await post({ sensor: 'basic', value: 20, time });
      assert.strictEqual(response.status, 201);
      const created = await response.json();
      assert.strictEqual(created.ok, true);
      assert.strictEqual(typeof created.id, 'number');
      const duplicate = await post({ sensor: 'basic', value: 20, time });
      assert.strictEqual(duplicate.status, 200);
      assert.deepStrictEqual(await duplicate.json(), { ok: true, duplicate: true });
      assert.strictEqual(storage.listInternalReadings().filter((item) => item.sensor === 'basic').length, 1);
    });

    await okAsync('late readings are inserted chronologically', async () => {
      const now = Date.now();
      const times = [now - 3 * 60000, now - 60000, now - 2 * 60000];
      for (let i = 0; i < times.length; i++) {
        const response = await post({ sensor: 'late', value: i + 1, time: new Date(times[i]).toISOString() });
        assert.strictEqual(response.status, 201);
      }
      const values = storage.listInternalReadings()
        .filter((item) => item.sensor === 'late')
        .map((item) => item.value);
      // Третій запис прийшов із запізненням (t−2 хв після t−1 хв), тому стоїть перед другим.
      assert.deepStrictEqual(values, [1, 3, 2]);
      const repeated = await post({ sensor: 'late', value: 99, time: new Date(times[1]).toISOString() });
      assert.strictEqual(repeated.status, 200);
    });

    await okAsync('eventId is idempotent', async () => {
      const first = await post({
        sensor: 'event', value: 21, eventId: 'device-1', time: new Date().toISOString(),
      });
      assert.strictEqual(first.status, 201);
      const second = await post({
        sensor: 'event', value: 22, eventId: 'device-1', time: new Date(Date.now() + 1000).toISOString(),
      });
      assert.strictEqual(second.status, 200);
      assert.deepStrictEqual(await second.json(), { ok: true, duplicate: true });
    });

    await okAsync('alerts only for fresh anomalies', async () => {
      storage.addSubscriber('alert', 99);
      const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const old = await post({ sensor: 'old-anomaly', value: 50, time: oldTime });
      assert.strictEqual(old.status, 201);
      await outbox.sleep(120);
      assert.strictEqual(alertMessages.length, 0);
      const fresh = await post({ sensor: 'fresh-anomaly', value: 50, time: new Date().toISOString() });
      assert.strictEqual(fresh.status, 201);
      await outbox.sleep(120);
      assert.strictEqual(alertMessages.length, 1);
      assert.ok(alertMessages[0].includes('⚠ Аномалія'));
    });
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`Пройдено: ${passed}, помилок: ${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
