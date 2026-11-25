'use strict';

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '.env');

function readEnvFile(file) {
  const result = {};
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return result;
    }
    throw error;
  }

  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key !== '') {
      result[key] = value;
    }
  }
  return result;
}

const env = Object.assign({}, readEnvFile(ENV_FILE), process.env);

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const DATA_DIR_RAW = env.DATA_DIR || './data';
const DATA_DIR = path.isAbsolute(DATA_DIR_RAW)
  ? DATA_DIR_RAW
  : path.resolve(__dirname, DATA_DIR_RAW);

const DATA_FILE = env.DATA_FILE
  ? (path.isAbsolute(env.DATA_FILE)
      ? env.DATA_FILE
      : path.resolve(__dirname, env.DATA_FILE))
  : path.join(DATA_DIR, 'data.json');

const INGEST_API_KEY = env.INGEST_API_KEY || env.INGEST_KEY || '';
const INGEST_KEY = INGEST_API_KEY;
const PORT = numeric(env.PORT || env.INGEST_PORT, 3000);
const INGEST_PORT = numeric(env.INGEST_PORT || env.PORT, 3000);
const INGEST_HOST = env.INGEST_HOST || '127.0.0.1';

const TOPICS = {
  'Дистанційка': 'дистанційні повідомлення',
  'Вакансії': 'вакансії для студентів',
  'Івенти': 'події та івенти',
  report: 'щоденний звіт',
  alert: 'сповіщення про аномалії',
  news: 'новини від адміністратора',
};

module.exports = {
  ENV_FILE,
  BOT_TOKEN: env.BOT_TOKEN || '',
  ADMIN_ID: numeric(env.ADMIN_ID, 1884275271),

  DATA_DIR,
  DATA_FILE,
  IMPORT_FILE: path.join(__dirname, 'import', 'readings.csv'),

  INGEST_API_KEY,
  INGEST_KEY,
  INGEST_PORT,
  INGEST_HOST,
  INGEST_URL: `http://${INGEST_HOST}:${INGEST_PORT}/readings`,
  PORT,

  DASHBOARD_TOKEN: env.DASHBOARD_TOKEN || '',
  DASHBOARD_REFRESH_S: 5,

  REPORT_TIME: '08:00',
  TOPICS,
  ALERT_MIN: 10,
  ALERT_MAX: 30,
  BROADCAST_PAUSE_MS: 50,
  MAX_IMPORT: 500,
  MAX_QUEUE: 100,

  GEOCODING_URL: 'https://geocoding-api.open-meteo.com/v1/search',
  FORECAST_URL: 'https://api.open-meteo.com/v1/forecast',
  DEFAULT_CITY: 'Київ',
  HTTP_TIMEOUT_MS: 5000,
  WEATHER_CACHE_MS: 10 * 60 * 1000,
};
