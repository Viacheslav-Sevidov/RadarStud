'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-l16-'));
process.env.DATA_DIR = DATA_DIR;

const config = require('../config');
const weatherService = require('../weather');
const format = require('../utils/format');
const registerCommands = require('../handlers/commands');

let passed = 0;
let failed = 0;
let calls = 0;
let mode = 'ok';
const originalFetch = globalThis.fetch;

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

function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

globalThis.fetch = async function (url) {
  calls = calls + 1;
  if (mode === 'network') {
    throw new TypeError('fetch failed');
  }
  if (mode === 'error500') {
    return fakeResponse(500, {});
  }
  if (url.includes('geocoding')) {
    const name = decodeURIComponent(new URL(url).searchParams.get('name') || '');
    if (name === 'Невідоме') {
      return fakeResponse(200, {});
    }
    return fakeResponse(200, {
      results: [{
        name,
        latitude: name === 'Львів' ? 49.84 : 50.45,
        longitude: name === 'Львів' ? 24.02 : 30.52,
      }],
    });
  }
  const parsed = new URL(url);
  const lviv = Number(parsed.searchParams.get('latitude')) === 49.84;
  return fakeResponse(200, {
    current: {
      temperature_2m: lviv ? 7.1 : 9.3,
      relative_humidity_2m: 80,
      wind_speed_10m: 7.5,
    },
  });
};

const handlers = {};
registerCommands({
  start() {},
  command(name, fn) { handlers[name] = fn; },
  hears() {},
  on() {},
  catch() {},
});

function makeCtx(text) {
  const replies = [];
  return {
    from: { id: 5 },
    message: { text },
    replies,
    reply(message) { replies.push(message); },
  };
}

ok('config URLs and cache settings', () => {
  assert.strictEqual(config.GEOCODING_URL, 'https://geocoding-api.open-meteo.com/v1/search');
  assert.strictEqual(config.FORECAST_URL, 'https://api.open-meteo.com/v1/forecast');
  assert.strictEqual(config.DEFAULT_CITY, 'Київ');
  assert.strictEqual(config.HTTP_TIMEOUT_MS, 5000);
  assert.strictEqual(config.WEATHER_CACHE_MS, 10 * 60 * 1000);
});

async function main() {
  await okAsync('weatherForCity fetches twice and caches', async () => {
    weatherService.clearCache();
    calls = 0;
    mode = 'ok';
    const weather = await weatherService.weatherForCity('Київ');
    assert.deepStrictEqual(weather, { city: 'Київ', temperature: 9.3, humidity: 80, wind: 7.5 });
    assert.strictEqual(calls, 2);
    await weatherService.weatherForCity('київ');
    assert.strictEqual(calls, 2);
  });

  await okAsync('unknown city returns null', async () => {
    weatherService.clearCache();
    calls = 0;
    assert.strictEqual(await weatherService.weatherForCity('Невідоме'), null);
    assert.strictEqual(calls, 1);
  });

  await okAsync('HTTP 500 is reported', async () => {
    weatherService.clearCache();
    mode = 'error500';
    try {
      await weatherService.weatherForCity('Київ');
      assert.fail('expected error');
    } catch (error) {
      assert.ok(error.message.includes('500'));
    }
  });

  await okAsync('network error is propagated', async () => {
    weatherService.clearCache();
    mode = 'network';
    try {
      await weatherService.weatherForCity('Київ');
      assert.fail('expected error');
    } catch (error) {
      assert.strictEqual(error.message, 'fetch failed');
    }
  });

  await okAsync('fetchFn injection works', async () => {
    mode = 'ok';
    let injected = 0;
    const injectedFetch = async (url) => {
      injected = injected + 1;
      if (url.includes('geocoding')) {
        return fakeResponse(200, { results: [{ name: 'Одеса', latitude: 46.48, longitude: 30.73 }] });
      }
      return fakeResponse(200, {
        current: { temperature_2m: 12, relative_humidity_2m: 70, wind_speed_10m: 3 },
      });
    };
    weatherService.clearCache();
    const weather = await weatherService.weatherForCity('Одеса', injectedFetch);
    assert.strictEqual(weather.city, 'Одеса');
    assert.strictEqual(injected, 2);
  });

  ok('formatWeather', () => {
    assert.strictEqual(
      format.formatWeather({ city: 'Київ', temperature: 9.3, humidity: 80, wind: 7.5 }),
      'Київ: 9.3 °C, вологість 80 %, вітер 7.5 км/год'
    );
  });

  await okAsync('/weather command', async () => {
    weatherService.clearCache();
    mode = 'ok';
    const ctx = makeCtx('/weather');
    await handlers.weather(ctx);
    assert.ok(ctx.replies[0].includes('Київ: 9.3 °C'));
  });

  await okAsync('/compare command with two cities', async () => {
    weatherService.clearCache();
    mode = 'ok';
    const ctx = makeCtx('/compare Київ Львів');
    await handlers.compare(ctx);
    assert.ok(ctx.replies[0].includes('Київ'));
    assert.ok(ctx.replies[0].includes('Львів'));
    assert.ok(ctx.replies[0].includes('тепліше'));
  });

  globalThis.fetch = originalFetch;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`Пройдено: ${passed}, помилок: ${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
