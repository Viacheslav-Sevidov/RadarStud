'use strict';

const config = require('./config');
const signal = require('./utils/signal');
const outbox = require('./utils/outbox');

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function sendReading(reading, fetchFn) {
  const response = await (fetchFn || globalThis.fetch)(config.INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.INGEST_KEY },
    body: JSON.stringify(reading),
    signal: AbortSignal.timeout(config.HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error('Бот відповів помилкою ' + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function main(options) {
  const settings = options || {};
  const ticks = settings.ticks === undefined
    ? (Number(process.argv[2]) || 0)
    : settings.ticks;
  const seconds = settings.seconds === undefined
    ? (Number(process.argv[3]) || 1)
    : settings.seconds;
  const seed = settings.seed === undefined
    ? (process.argv[4] === undefined ? Math.floor(Math.random() * 1000000) : Number(process.argv[4]))
    : settings.seed;

  const random = signal.makeRandom(seed);
  const queue = outbox.loadQueue();
  let step = 0;
  while (ticks === 0 || step < ticks) {
    const values = [];
    let lost = 0;
    for (const sensor of signal.SENSORS) {
      const value = signal.generateValue(sensor, step, random);
      values.push(sensor.name + ' ' + value);
      const reading = { sensor: sensor.name, value, time: new Date().toISOString() };
      lost = lost + outbox.addToQueue(queue, reading, config.MAX_QUEUE);
    }
    if (lost > 0) {
      console.error('Черга переповнена: втрачено найстаріших показань: ' + lost);
    }
    const result = await outbox.flushQueue(queue, function (reading) {
      return sendReading(reading, settings.fetchFn);
    }, outbox.saveQueue);
    let text = '#' + step + ' ' + values.join(', ') +
      ' → надіслано ' + result.sent + ', у черзі ' + result.left;
    if (result.dropped > 0) {
      text = text + ', відхилено ' + result.dropped;
    }
    if (result.error !== null) {
      text = text + ' (' + result.error + ')';
    }
    console.log(text);
    step = step + 1;
    await sleep(seconds * 1000);
  }
  console.log('Симулятор завершив роботу. У черзі лишилось: ' + queue.length);
}

if (require.main === module) {
  main().catch(function (error) {
    console.error('simulator:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, sendReading, sleep };
