'use strict';

const config = require('./config');
const storage = require('./storage');
const stats = require('./utils/stats');
const chart = require('./utils/chart');
const format = require('./utils/format');

const PERIOD_HOURS = 6;
const STALE_MS = 10 * 60 * 1000;
const TABLE_ROWS = 10;
const DASHBOARD_REFRESH_S = config.DASHBOARD_REFRESH_S;

function escapeHtml(text) {
  let result = String(text);
  result = result.split('&').join('&amp;');
  result = result.split('<').join('&lt;');
  result = result.split('>').join('&gt;');
  result = result.split('"').join('&quot;');
  result = result.split("'").join('&#39;');
  return result;
}

function statusOf(value) {
  if (value < config.ALERT_MIN) {
    return { css: 'low', text: 'нижче норми' };
  }
  if (value > config.ALERT_MAX) {
    return { css: 'high', text: 'вище норми' };
  }
  return { css: 'ok', text: 'у нормі' };
}

function timeText(ms) {
  return new Date(ms).toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kiev',
    hour12: false,
  });
}

function buildCard(record, nowMs) {
  const age = nowMs - new Date(record.createdAt).getTime();
  const status = statusOf(record.value);
  let css = status.css;
  let note = status.text;
  if (age > STALE_MS) {
    css = 'stale';
    note = 'немає свіжих даних';
  }
  return '<div class="card ' + css + '">' +
    '<div class="name">' + escapeHtml(record.sensor) + '</div>' +
    '<div class="value">' + record.value.toFixed(1) + '</div>' +
    '<div class="note">' + note + ' · ' + escapeHtml(format.formatAgo(record.createdAt)) + '</div>' +
    '</div>';
}

const STYLES = [
  'body{font-family:system-ui,sans-serif;margin:24px;background:#f5f7fa;color:#1c293d}',
  'h1{margin:0 0 4px}h2{margin-top:28px;font-size:18px}',
  '.small{color:#5a6472;font-size:13px}.cards{display:flex;gap:14px;flex-wrap:wrap}',
  '.card{background:#fff;border-left:5px solid #999;border-radius:8px;padding:12px 18px;min-width:180px}',
  '.card.ok{border-color:#2ea05a}.card.low{border-color:#f2a65a}.card.high{border-color:#c83c3c}',
  '.card.stale{border-color:#9aa3ad;color:#6b7280}.name{font-weight:600}.value{font-size:26px}',
  '.note{font-size:12px;color:#667}',
  'table{border-collapse:collapse;background:#fff;width:100%;max-width:900px}',
  'th,td{border:1px solid #dfe3e8;padding:6px 10px;text-align:left;font-size:14px}',
  'img{max-width:100%;border:1px solid #dfe3e8;border-radius:6px;background:#fff}',
].join('');

function buildPage(token, nowMs) {
  const moment = nowMs === undefined ? Date.now() : nowMs;
  const latest = storage.latestBySensor();
  const names = Object.keys(latest).sort();
  let html = '<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="refresh" content="' + config.DASHBOARD_REFRESH_S + '">' +
    '<title>Дашборд</title><style>' + STYLES + '</style></head><body>';
  html = html + '<h1>Дашборд датчиків</h1>';
  html = html + '<div class="small">Оновлено о ' + timeText(moment) +
    ' · сторінка оновлюється кожні ' + config.DASHBOARD_REFRESH_S +
    ' с · норма: від ' + config.ALERT_MIN + ' до ' + config.ALERT_MAX + '</div>';

  if (names.length === 0) {
    return html + '<p>Показань ще немає. Запустіть симулятор: <code>node simulator.js 2</code></p></body></html>';
  }

  html = html + '<h2>Зараз</h2><div class="cards">';
  for (const name of names) {
    html = html + buildCard(latest[name], moment);
  }
  html = html + '</div>';

  const recent = storage.listReadingsLastHours(PERIOD_HOURS, moment);
  const groups = stats.groupBySource(recent);
  html = html + '<h2>Зведення за ' + PERIOD_HOURS +
    ' год</h2><table><tr><th>Датчик</th><th>Показань</th><th>Мін</th><th>Середнє</th><th>Макс</th></tr>';
  for (const name of names) {
    const summary = stats.calcStats(groups[name] || []);
    if (summary === null) {
      html = html + '<tr><td>' + escapeHtml(name) + '</td><td colspan="4">немає даних</td></tr>';
    } else {
      html = html + '<tr><td>' + escapeHtml(name) + '</td><td>' + summary.count + '</td><td>' +
        summary.min.toFixed(1) + '</td><td>' + summary.avg.toFixed(1) + '</td><td>' +
        summary.max.toFixed(1) + '</td></tr>';
    }
  }
  html = html + '</table>';

  html = html + '<h2>Графіки за ' + PERIOD_HOURS + ' год</h2>';
  for (const name of names) {
    const src = '/chart.png?token=' + encodeURIComponent(token) +
      '&sensor=' + encodeURIComponent(name) + '&hours=' + PERIOD_HOURS;
    html = html + '<div><b>' + escapeHtml(name) + '</b><br><img src="' + escapeHtml(src) +
      '" alt="графік ' + escapeHtml(name) + '"></div>';
  }

  html = html + '<h2>Останні показання</h2><table><tr><th>Час</th><th>Датчик</th><th>Значення</th></tr>';
  for (let i = 0; i < recent.length && i < TABLE_ROWS; i++) {
    html = html + '<tr><td>' + timeText(new Date(recent[i].createdAt).getTime()) + '</td><td>' +
      escapeHtml(recent[i].sensor) + '</td><td>' + recent[i].value.toFixed(1) + '</td></tr>';
  }
  html = html + '</table></body></html>';
  return html;
}

function sendText(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function handle(req, res) {
  let pathname;
  try {
    pathname = req.url.split('?')[0];
  } catch (error) {
    return false;
  }
  if (pathname !== '/dashboard' && pathname !== '/chart.png') {
    return false;
  }
  if (!config.DASHBOARD_TOKEN) {
    return false;
  }
  if (req.method !== 'GET') {
    sendText(res, 405, 'text/plain; charset=utf-8', 'Використовуйте GET');
    return true;
  }

  let query;
  try {
    query = new URL(req.url, 'http://localhost').searchParams;
  } catch (error) {
    sendText(res, 400, 'text/plain; charset=utf-8', 'Некоректна адреса');
    return true;
  }

  const token = query.get('token');
  if (token !== config.DASHBOARD_TOKEN) {
    sendText(res, 401, 'text/plain; charset=utf-8',
      'Потрібен правильний токен: /dashboard?token=...');
    return true;
  }

  if (pathname === '/dashboard') {
    sendText(res, 200, 'text/html; charset=utf-8', buildPage(token, Date.now()));
    return true;
  }

  const sensor = query.get('sensor');
  const hours = Number(query.get('hours') || PERIOD_HOURS);
  if (!sensor || !(hours >= 1 && hours <= 72)) {
    sendText(res, 400, 'text/plain; charset=utf-8', 'Потрібні sensor і hours (від 1 до 72)');
    return true;
  }

  const records = storage.listReadingsLastHours(hours);
  const points = [];
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].sensor === sensor) {
      points.push({ time: new Date(records[i].createdAt).getTime(), value: records[i].value });
    }
  }
  if (points.length < 2) {
    sendText(res, 404, 'text/plain; charset=utf-8', 'Для графіка потрібно щонайменше 2 показання');
    return true;
  }
  const image = chart.chartToPng(points, { min: config.ALERT_MIN, max: config.ALERT_MAX });
  sendText(res, 200, 'image/png', image);
  return true;
}

module.exports = {
  handle,
  buildPage,
  buildCard,
  escapeHtml,
  statusOf,
  timeText,
  PERIOD_HOURS,
  STALE_MS,
  TABLE_ROWS,
  DASHBOARD_REFRESH_S,
};
