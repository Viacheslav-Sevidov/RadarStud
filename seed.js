'use strict';

const storage = require('./storage');

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seed() {
  storage.loadData();
  const added = storage.addManyReadings(1, [
    { sensor: 'теплиця-1', value: 20, createdAt: hoursAgo(72) },
    { sensor: 'теплиця-1', value: 21, createdAt: hoursAgo(48) },
    { sensor: 'теплиця-1', value: 22, createdAt: hoursAgo(25) },
    { sensor: 'теплиця-1', value: 23, createdAt: hoursAgo(23) },
    { sensor: 'теплиця-1', value: 24, createdAt: hoursAgo(5) },
    { sensor: 'теплиця-1', value: 25, createdAt: hoursAgo(1) },
  ]);
  console.log('Додано ' + added + ' тестових записів: 72, 48, 25, 23, 5 і 1 година тому.');
  return added;
}

if (require.main === module) {
  seed();
}

module.exports = { seed, hoursAgo };
