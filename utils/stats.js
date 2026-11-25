'use strict';

function calcStats(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }
  let sum = 0;
  let min = records[0].value;
  let max = records[0].value;
  for (const record of records) {
    sum = sum + record.value;
    if (record.value < min) {
      min = record.value;
    }
    if (record.value > max) {
      max = record.value;
    }
  }
  return { count: records.length, min, max, avg: sum / records.length };
}

function groupBySource(records) {
  // Null-prototype об'єкт не ламається на назві датчика "constructor".
  const groups = Object.create(null);
  if (!Array.isArray(records)) {
    return groups;
  }
  for (const record of records) {
    if (groups[record.sensor] === undefined) {
      groups[record.sensor] = [];
    }
    groups[record.sensor].push(record);
  }
  return groups;
}

function topValues(records, count) {
  if (!Array.isArray(records) || count <= 0) {
    return [];
  }
  const rest = records.slice();
  const result = [];
  while (result.length < count && rest.length > 0) {
    let maxIndex = 0;
    for (let i = 1; i < rest.length; i++) {
      if (rest[i].value > rest[maxIndex].value) {
        maxIndex = i;
      }
    }
    result.push(rest[maxIndex]);
    rest.splice(maxIndex, 1);
  }
  return result;
}

module.exports = {
  calcStats,
  groupBySource,
  groupBySensor: groupBySource,
  topValues,
};
