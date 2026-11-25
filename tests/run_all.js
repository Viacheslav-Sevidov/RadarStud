'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'all_tests_output.txt');

const TESTS = [
  'check_l7_12_core.js',
  'check_l13_stats.js',
  'check_l14_scheduler.js',
  'check_l15_broadcast.js',
  'check_l16_weather.js',
  'check_l17_18_ingest.js',
  'check_l19_20_visual.js',
];

const lines = [];
function emit(text) {
  if (text === undefined) {
    return;
  }
  lines.push(String(text));
}

emit('RadarStud — повний прогон автономних тестів ЛР №7–20');
emit('Час: ' + new Date().toISOString());
emit('Node.js: ' + process.version);
emit('Каталог: ' + ROOT);
emit('');

let failures = 0;
for (const name of TESTS) {
  const file = path.join(ROOT, 'tests', name);
  emit('============================================================');
  emit('=== ' + name + ' ===');
  const result = spawnSync(process.execPath, [file], {
    cwd: ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { RADAR_TEST: '1' }),
  });
  if (result.stdout) {
    emit(result.stdout.replace(/\r\n/g, '\n').replace(/\n$/, ''));
  }
  if (result.stderr) {
    emit('--- stderr ---');
    emit(result.stderr.replace(/\r\n/g, '\n').replace(/\n$/, ''));
  }
  if (result.error) {
    emit('--- spawn error ---');
    emit(result.error.message);
  }
  const code = result.status === null ? 1 : result.status;
  emit('Код завершення: ' + code);
  if (code !== 0) {
    failures = failures + 1;
  }
  emit('');
}

emit('============================================================');
emit('ПІДСУМОК: тестових файлів ' + TESTS.length + ', з помилками ' + failures + '.');
emit(failures === 0 ? 'УСІ ТЕСТИ ПРОЙДЕНО.' : 'Є помилки — див. вище.');

const output = lines.join('\n') + '\n';
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
process.stdout.write(output);
process.exitCode = failures === 0 ? 0 : 1;
