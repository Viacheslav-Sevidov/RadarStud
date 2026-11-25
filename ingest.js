'use strict';

const http = require('http');
const config = require('./config');
const storage = require('./storage');
const alerts = require('./alerts');
const dashboard = require('./dashboard');
const validators = require('./utils/validators');
const logger = require('./logger');

const MAX_BODY = 10 * 1024;
const MAX_AGE_MS = validators.MAX_TIME_AGE_MS;
const MAX_FUTURE_MS = validators.MAX_TIME_FUTURE_MS;
const ALERT_RECENT_MS = 10 * 60 * 1000;

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = '';
    let tooLarge = false;
    req.on('data', function (chunk) {
      if (tooLarge) {
        return;
      }
      body = body + chunk;
      if (body.length > MAX_BODY) {
        tooLarge = true;
        reject(new Error('too large'));
      }
    });
    req.on('end', function () {
      if (!tooLarge) {
        resolve(body);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, object) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(object));
}

function isValidTime(text, nowMs) {
  return validators.isValidTime(text, nowMs);
}

async function handleRequest(bot, req, res) {
  if (dashboard.handle(req, res)) {
    return;
  }
  if (req.url !== '/readings') {
    sendJson(res, 404, { ok: false, error: 'not found' });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'use POST' });
    return;
  }
  if (req.headers['x-api-key'] !== config.INGEST_KEY) {
    sendJson(res, 401, { ok: false, error: 'wrong key' });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    res.setHeader('Connection', 'close');
    sendJson(res, 413, { ok: false, error: 'body too large' });
    return;
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: 'invalid json' });
    return;
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data) ||
      typeof data.sensor !== 'string' || data.sensor === '' || data.sensor.length > 30) {
    sendJson(res, 400, { ok: false, error: 'invalid sensor' });
    return;
  }
  if (typeof data.value !== 'number' || !Number.isFinite(data.value)) {
    sendJson(res, 400, { ok: false, error: 'invalid value' });
    return;
  }
  if (!isValidTime(data.time)) {
    sendJson(res, 400, { ok: false, error: 'invalid time' });
    return;
  }

  const eventId = (typeof data.eventId === 'string' || typeof data.eventId === 'number')
    ? String(data.eventId)
    : undefined;

  let record;
  try {
    record = storage.addDeviceReading(data.sensor, data.value, data.time, eventId);
  } catch (error) {
    logger.error('ingest (збереження): ' + error.message);
    sendJson(res, 500, { ok: false, error: 'save failed' });
    return;
  }

  if (record === null) {
    sendJson(res, 200, { ok: true, duplicate: true });
    return;
  }
  if (Date.now() - new Date(record.createdAt).getTime() < ALERT_RECENT_MS) {
    alerts.checkReading(bot, record);
  }
  sendJson(res, 201, { ok: true, id: record.id });
}

function start(bot) {
  if (!config.INGEST_KEY) {
    logger.warn('INGEST_KEY не вказано в .env: приймання показань від датчиків вимкнено.');
    return null;
  }
  const server = http.createServer(function (req, res) {
    handleRequest(bot, req, res).catch(function (error) {
      logger.error('ingest: ' + error.message);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'server error' });
      }
    });
  });
  server.on('error', function (error) {
    logger.error('ingest server: ' + error.message);
  });
  server.listen(config.INGEST_PORT, config.INGEST_HOST, function () {
    const base = 'http://' + config.INGEST_HOST + ':' + server.address().port;
    logger.info('Приймання показань: ' + base + '/readings');
    if (config.DASHBOARD_TOKEN) {
      logger.info('Дашборд: ' + base + '/dashboard?token=' + config.DASHBOARD_TOKEN);
    } else {
      logger.warn('DASHBOARD_TOKEN не вказано в .env: дашборд вимкнено.');
    }
  });
  return server;
}

module.exports = {
  start,
  handleRequest,
  readBody,
  sendJson,
  isValidTime,
  MAX_BODY,
  MAX_AGE_MS,
  MAX_FUTURE_MS,
  ALERT_RECENT_MS,
};
