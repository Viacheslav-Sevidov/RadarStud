'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const storage = require('./storage');
const signal = require('./utils/signal');
const chart = require('./utils/chart');

function buildPoints(sensor, random, startMs, steps) {
  const points = [];
  for (let step = 0; step < steps; step++) {
    points.push({
      time: startMs + step * 5 * 60 * 1000,
      value: signal.generateValue(sensor, step, random),
    });
  }
  return points;
}

function seedChart() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  storage.loadData();
  const random = signal.makeRandom(42);
  const startMs = Date.now() - 6 * 60 * 60 * 1000;
  const items = [];
  const allPoints = [];
  for (const sensor of signal.SENSORS) {
    const points = buildPoints(sensor, random, startMs, 72);
    allPoints.push(points[0]);
    allPoints.push(points[points.length - 1]);
    for (const point of points) {
      items.push({ sensor: sensor.name, value: point.value, createdAt: new Date(point.time).toISOString() });
    }
  }
  const added = storage.addManyReadings(0, items);
  const image = chart.chartToPng(allPoints, { min: config.ALERT_MIN, max: config.ALERT_MAX });
  const file = path.join(config.DATA_DIR, 'sample_chart.png');
  fs.writeFileSync(file, image);
  console.log('Додано показань для графіка: ' + added);
  console.log('PNG збережено: ' + file + ' (' +
    image.readUInt32BE(16) + '×' + image.readUInt32BE(20) + ')');
  return file;
}

if (require.main === module) {
  seedChart();
}

module.exports = { seedChart, buildPoints };
