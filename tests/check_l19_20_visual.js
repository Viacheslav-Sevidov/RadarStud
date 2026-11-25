'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-l1920-'));
process.env.DATA_DIR = DATA_DIR;

const config = require('../config');
const storage = require('../storage');
const png = require('../utils/png');
const chart = require('../utils/chart');
const signal = require('../utils/signal');
const dashboard = require('../dashboard');

config.DASHBOARD_TOKEN = 'test-dashboard-token';

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

function makeReq(url, method) {
  return { url, method: method || 'GET' };
}

function makeRes() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

function signatureHex(buffer) {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    parts.push(buffer[i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

const now = Date.now();
storage.loadData();
storage.addManyReadings(0, [
  { sensor: 'теплиця-1', value: 21, createdAt: new Date(now - 3 * 60000).toISOString() },
  { sensor: 'теплиця-1', value: 25, createdAt: new Date(now - 2 * 60000).toISOString() },
  { sensor: 'теплиця-1', value: 23, createdAt: new Date(now - 60000).toISOString() },
  { sensor: 'constructor', value: 20, createdAt: new Date(now - 30000).toISOString() },
  { sensor: 'single', value: 20, createdAt: new Date(now - 30000).toISOString() },
]);

ok('PNG signature', () => {
  const canvas = png.createCanvas(2, 2, [255, 255, 255]);
  assert.strictEqual(signatureHex(png.encodePng(canvas)), '89 50 4e 47 0d 0a 1a 0a');
});

ok('PNG canvas dimensions in IHDR', () => {
  const canvas = png.createCanvas(100, 60, [255, 255, 255]);
  const image = png.encodePng(canvas);
  assert.strictEqual(image.readUInt32BE(16), 100);
  assert.strictEqual(image.readUInt32BE(20), 60);
});

ok('CRC32 reference value', () => {
  assert.strictEqual(png.crc32(Buffer.from('123456789')), 0xCBF43926);
});

ok('drawLine / fillRect / drawText work', () => {
  const canvas = png.createCanvas(100, 60, [255, 255, 255]);
  png.drawLine(canvas, 5, 5, 90, 50, [28, 114, 147], 2);
  png.fillRect(canvas, 10, 40, 20, 10, [200, 60, 60]);
  png.drawText(canvas, '12.5', 40, 10, [19, 41, 61], 3);
  assert.ok(png.encodePng(canvas).length > 100);
});

ok('sparkline ascending', () => {
  assert.strictEqual(chart.sparkline([1, 2, 3, 4, 5, 6, 7, 8]), '▁▂▃▄▅▆▇█');
});

ok('sparkline equal values', () => {
  assert.strictEqual(chart.sparkline([3, 3, 3]), '▄▄▄');
});

ok('sparkline empty', () => {
  assert.strictEqual(chart.sparkline([]), '');
});

ok('downsample limits point count', () => {
  const points = [];
  for (let i = 0; i < 1000; i++) {
    points.push({ time: i, value: i % 30 });
  }
  const result = chart.downsample(points, 300);
  assert.ok(result.length <= 300);
  assert.ok(result.length > 0);
});

ok('chartToPng produces 640×360', () => {
  const points = [{ time: 0, value: 20 }, { time: 1000, value: 25 }];
  const image = chart.chartToPng(points, { min: 10, max: 30 });
  assert.strictEqual(image.readUInt32BE(16), 640);
  assert.strictEqual(image.readUInt32BE(20), 360);
});

ok('buildLineChart canvas is correct', () => {
  const canvas = chart.buildLineChart(
    [{ time: 0, value: 20 }, { time: 1, value: 21 }],
    { min: 10, max: 30 }
  );
  assert.strictEqual(canvas.width, 640);
  assert.strictEqual(canvas.height, 360);
});

ok('escapeHtml escapes script tag', () => {
  assert.strictEqual(
    dashboard.escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

ok('escapeHtml escapes quotes', () => {
  assert.strictEqual(dashboard.escapeHtml('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
});

ok('statusOf low', () => {
  assert.deepStrictEqual(dashboard.statusOf(5), { css: 'low', text: 'нижче норми' });
});

ok('statusOf high', () => {
  assert.deepStrictEqual(dashboard.statusOf(35), { css: 'high', text: 'вище норми' });
});

ok('statusOf ok', () => {
  assert.deepStrictEqual(dashboard.statusOf(20), { css: 'ok', text: 'у нормі' });
});

ok('buildPage has meta refresh', () => {
  const html = dashboard.buildPage('test-token', now);
  assert.ok(html.includes('<meta http-equiv="refresh" content="5">'));
});

ok('buildPage has table and chart image', () => {
  const html = dashboard.buildPage('test-token', now);
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<img src="/chart.png?token=test-token'));
});

ok('constructor sensor does not break dashboard', () => {
  const html = dashboard.buildPage('test-token', now);
  assert.ok(html.includes('constructor'));
  assert.ok(!html.includes('<script>'));
});

ok('dashboard requires token', () => {
  const res = makeRes();
  assert.strictEqual(dashboard.handle(makeReq('/dashboard'), res), true);
  assert.strictEqual(res.status, 401);
});

ok('dashboard rejects wrong token', () => {
  const res = makeRes();
  dashboard.handle(makeReq('/dashboard?token=wrong'), res);
  assert.strictEqual(res.status, 401);
});

ok('dashboard serves page with valid token', () => {
  const res = makeRes();
  dashboard.handle(makeReq('/dashboard?token=test-dashboard-token'), res);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.includes('Дашборд датчиків'));
});

ok('chart.png requires sensor parameter', () => {
  const res = makeRes();
  dashboard.handle(makeReq('/chart.png?token=test-dashboard-token'), res);
  assert.strictEqual(res.status, 400);
});

ok('chart.png rejects sensor with one reading', () => {
  const res = makeRes();
  dashboard.handle(makeReq('/chart.png?token=test-dashboard-token&sensor=single&hours=6'), res);
  assert.strictEqual(res.status, 404);
});

ok('chart.png returns PNG', () => {
  const res = makeRes();
  dashboard.handle(makeReq('/chart.png?token=test-dashboard-token&sensor=' +
    encodeURIComponent('теплиця-1') + '&hours=6'), res);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(signatureHex(res.body), '89 50 4e 47 0d 0a 1a 0a');
});

let sampleFile;
ok('sample_chart.png artifact is generated', () => {
  const random = signal.makeRandom(42);
  const startMs = Date.now() - 6 * 60 * 60 * 1000;
  const points = [];
  for (let step = 0; step < 72; step++) {
    points.push({
      time: startMs + step * 5 * 60 * 1000,
      value: signal.generateValue(signal.SENSORS[0], step, random),
    });
  }
  const image = chart.chartToPng(points, { min: config.ALERT_MIN, max: config.ALERT_MAX });
  const realDataDir = path.resolve(__dirname, '..', 'data');
  fs.mkdirSync(realDataDir, { recursive: true });
  sampleFile = path.join(realDataDir, 'sample_chart.png');
  fs.writeFileSync(sampleFile, image);
  assert.strictEqual(image.readUInt32BE(16), 640);
  assert.strictEqual(image.readUInt32BE(20), 360);
  assert.ok(fs.statSync(sampleFile).size > 1000);
});

fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log('PNG артефакт: ' + sampleFile);
console.log(`Пройдено: ${passed}, помилок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
