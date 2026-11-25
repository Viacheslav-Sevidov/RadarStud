'use strict';

const MAX_TIME_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TIME_FUTURE_MS = 5 * 60 * 1000;

function parseNumber(text) {
  if (text === undefined || text === null) {
    return null;
  }
  const normalized = String(text).trim().replace(',', '.');
  if (normalized === '') {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseId(text) {
  if (text === undefined || text === null) {
    return null;
  }
  const normalized = String(text).trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return Number.isSafeInteger(value) ? value : null;
}

function isNonEmpty(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function isValidDate(dayText) {
  if (typeof dayText !== 'string') {
    return false;
  }
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dayText);
  if (match === null) {
    return false;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCDate() === day &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCFullYear() === year
  );
}

function parseJson(text, fallback) {
  const defaultValue = fallback === undefined ? null : fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    return defaultValue;
  }
}

function parseHours(text) {
  if (text === undefined) {
    return 24;
  }
  const value = parseNumber(text);
  if (value === null || value <= 0 || value > 720) {
    return null;
  }
  return value;
}

function parseCount(text) {
  if (text === undefined) {
    return 5;
  }
  const value = parseId(text);
  if (value === null || value <= 0 || value > 20) {
    return null;
  }
  return value;
}

function parseMinutes(text) {
  const value = parseId(text);
  if (value === null || value <= 0 || value > 10080) {
    return null;
  }
  return value;
}

function isValidTime(text, nowMs) {
  if (typeof text !== 'string') {
    return false;
  }
  const moment = new Date(text);
  if (Number.isNaN(moment.getTime()) || moment.toISOString() !== text) {
    return false;
  }
  const now = nowMs === undefined ? Date.now() : nowMs;
  const age = now - moment.getTime();
  return age <= MAX_TIME_AGE_MS && age >= -MAX_TIME_FUTURE_MS;
}

module.exports = {
  parseNumber,
  parseId,
  isNonEmpty,
  isValidDate,
  parseJson,
  parseHours,
  parseCount,
  parseMinutes,
  isValidTime,
  MAX_TIME_AGE_MS,
  MAX_TIME_FUTURE_MS,
};
