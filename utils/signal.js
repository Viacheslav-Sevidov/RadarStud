'use strict';

const SENSORS = [
  { name: 'теплиця-1', base: 22, amplitude: 4, noise: 0.5 },
  { name: 'теплиця-2', base: 18, amplitude: 3, noise: 0.4 },
];
const PERIOD = 60;
const ANOMALY_CHANCE = 0.03;
const ANOMALY_SIZE = 12;

function makeRandom(seed) {
  let state = seed;
  return function () {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function generateValue(sensor, step, random) {
  const wave = sensor.amplitude * Math.sin(step / PERIOD * 2 * Math.PI);
  const noise = (random() - 0.5) * 2 * sensor.noise;
  let value = sensor.base + wave + noise;
  if (random() < ANOMALY_CHANCE) {
    let direction = 1;
    if (random() < 0.5) {
      direction = -1;
    }
    value = value + direction * ANOMALY_SIZE;
  }
  return Math.round(value * 10) / 10;
}

module.exports = {
  SENSORS,
  PERIOD,
  ANOMALY_CHANCE,
  ANOMALY_SIZE,
  makeRandom,
  generateValue,
};
