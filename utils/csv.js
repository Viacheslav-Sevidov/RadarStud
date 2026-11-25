'use strict';

const fs = require('fs');
const validators = require('./validators');

function readCsvFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function splitLine(line, separator) {
  const cells = line.split(separator);
  const result = [];
  for (const cell of cells) {
    result.push(cell.trim());
  }
  return result;
}

function parseCsv(text) {
  let source = String(text);
  if (source.charCodeAt(0) === 0xFEFF) {
    source = source.slice(1);
  }
  const lines = source.split('\n');
  const separator = lines[0].includes(';') ? ';' : ',';
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') {
      continue;
    }
    rows.push({ lineNumber: i + 1, cells: splitLine(line, separator) });
  }
  return rows;
}

function readingsFromCsv(text) {
  const rows = parseCsv(text);
  const good = [];
  const errors = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.cells.length < 2) {
      errors.push('Рядок ' + row.lineNumber + ': має бути два стовпці (датчик і значення)');
      continue;
    }
    const sensor = row.cells[0];
    const value = validators.parseNumber(row.cells[1]);
    if (!sensor || sensor.length > 30) {
      errors.push('Рядок ' + row.lineNumber + ': назва датчика порожня або довша за 30 символів');
      continue;
    }
    if (value === null) {
      errors.push('Рядок ' + row.lineNumber + ': значення «' + row.cells[1] + '» — не число');
      continue;
    }
    good.push({ sensor, value });
  }
  return { good, errors };
}

module.exports = { readCsvFile, parseCsv, readingsFromCsv };
