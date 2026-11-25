'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const stats = require('./utils/stats');

const EMPTY = {
  users: {},
  subscriptions: {},
  subscribers: [],
  readings: [],
  lastReadingId: 0,
  reminders: [],
  lastReminderId: 0,
  lastReportDay: '',
  outbox: [],
};

const SECTIONS = {
  users: ['users', 'subscriptions', 'subscribers', 'lastReportDay'],
  readings: ['readings', 'lastReadingId'],
  reminders: ['reminders', 'lastReminderId'],
  outbox: ['outbox'],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function dataDir() {
  return path.isAbsolute(config.DATA_DIR)
    ? config.DATA_DIR
    : path.resolve(__dirname, config.DATA_DIR);
}

function defaultDataFile() {
  return path.join(dataDir(), 'data.json');
}

function singleFileMode() {
  return Boolean(config.DATA_FILE) &&
    path.resolve(config.DATA_FILE) !== path.resolve(defaultDataFile());
}

function fileFor(kind) {
  if (singleFileMode()) {
    return path.resolve(config.DATA_FILE);
  }
  return path.join(dataDir(), kind + '.json');
}

function emptySection(kind) {
  const result = {};
  for (const key of SECTIONS[kind]) {
    result[key] = clone(EMPTY[key]);
  }
  return result;
}

function readRaw(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (text.trim() === '') {
      return {};
    }
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Файл ${path.basename(file)} пошкоджений: ${error.message}`);
    }
    throw error;
  }
}

function atomicWrite(file, object) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(object, null, 2), 'utf8');
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch (cleanupError) {
      // Не перекриваємо основну помилку збереження.
    }
    throw error;
  }
}

function extractSection(kind, raw) {
  const result = emptySection(kind);
  if (!raw || typeof raw !== 'object') {
    return result;
  }
  for (const key of SECTIONS[kind]) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      result[key] = clone(raw[key]);
    }
  }
  if (kind === 'users') {
    if (!result.subscriptions || typeof result.subscriptions !== 'object' || Array.isArray(result.subscriptions)) {
      result.subscriptions = {};
    }
    if (!Array.isArray(result.subscribers)) {
      result.subscribers = [];
    }
    for (const topic of Object.keys(config.TOPICS)) {
      if (!Array.isArray(result.subscriptions[topic])) {
        result.subscriptions[topic] = [];
      }
    }
    if (result.subscribers.length > 0) {
      for (const userId of result.subscribers) {
        if (!result.subscriptions.report.includes(userId)) {
          result.subscriptions.report.push(userId);
        }
      }
      result.subscribers = [];
    }
    if (typeof result.lastReportDay !== 'string') {
      result.lastReportDay = '';
    }
    if (!result.users || typeof result.users !== 'object' || Array.isArray(result.users)) {
      result.users = {};
    }
  }
  if (kind === 'readings') {
    if (!Array.isArray(result.readings)) {
      result.readings = [];
    }
    result.lastReadingId = Number.isFinite(Number(result.lastReadingId))
      ? Number(result.lastReadingId)
      : 0;
  }
  if (kind === 'reminders') {
    if (!Array.isArray(result.reminders)) {
      result.reminders = [];
    }
    result.lastReminderId = Number.isFinite(Number(result.lastReminderId))
      ? Number(result.lastReminderId)
      : 0;
  }
  if (kind === 'outbox' && !Array.isArray(result.outbox)) {
    result.outbox = [];
  }
  return result;
}

function readStore(kind) {
  return extractSection(kind, readRaw(fileFor(kind)));
}

function writeStore(kind, store) {
  const normalized = extractSection(kind, store);
  const file = fileFor(kind);
  if (singleFileMode()) {
    const raw = readRaw(file);
    for (const key of SECTIONS[kind]) {
      raw[key] = clone(normalized[key]);
    }
    atomicWrite(file, raw);
    return;
  }
  atomicWrite(file, normalized);
}

function normalizeAll(raw) {
  const result = clone(EMPTY);
  for (const kind of Object.keys(SECTIONS)) {
    const section = extractSection(kind, raw);
    for (const key of SECTIONS[kind]) {
      result[key] = section[key];
    }
  }
  return result;
}

function readAll() {
  if (singleFileMode()) {
    return normalizeAll(readRaw(fileFor('users')));
  }
  const raw = {};
  for (const kind of Object.keys(SECTIONS)) {
    const section = readStore(kind);
    for (const key of SECTIONS[kind]) {
      raw[key] = section[key];
    }
  }
  return normalizeAll(raw);
}

function writeAll(all) {
  const normalized = normalizeAll(all);
  for (const kind of Object.keys(SECTIONS)) {
    writeStore(kind, normalized);
  }
}

function loadData() {
  return readAll();
}

function saveChanges(all) {
  writeAll(all);
}

function saveUser(userId, profile) {
  const store = readStore('users');
  store.users[String(userId)] = clone(profile);
  writeStore('users', store);
  return clone(profile);
}

function getUser(userId) {
  const store = readStore('users');
  const found = store.users[String(userId)];
  return found === undefined ? null : clone(found);
}

function resolveSubscriberArgs(first, second) {
  if (second !== undefined) {
    return { topic: String(first), userId: second };
  }
  // Рядок, що збігається з назвою теми, — це тема; число — старий report-підписник.
  if (typeof first === 'string' && Object.prototype.hasOwnProperty.call(config.TOPICS, first)) {
    return { topic: first, userId: undefined };
  }
  return { topic: 'report', userId: first };
}

function isSubscribed(first, second) {
  const { topic, userId } = resolveSubscriberArgs(first, second);
  const store = readStore('users');
  return Array.isArray(store.subscriptions[topic]) && store.subscriptions[topic].includes(userId);
}

function listSubscribers(first, second) {
  // Підтримуємо і listSubscribers('news'), і старе listSubscribers() для report.
  const { topic } = resolveSubscriberArgs(first, second);
  const store = readStore('users');
  return Array.isArray(store.subscriptions[topic]) ? store.subscriptions[topic].slice() : [];
}

function addSubscriber(first, second) {
  const { topic, userId } = resolveSubscriberArgs(first, second);
  if (userId === undefined) {
    return;
  }
  const store = readStore('users');
  if (!Array.isArray(store.subscriptions[topic])) {
    store.subscriptions[topic] = [];
  }
  if (!store.subscriptions[topic].includes(userId)) {
    store.subscriptions[topic].push(userId);
  }
  writeStore('users', store);
}

function removeSubscriber(first, second) {
  const { topic, userId } = resolveSubscriberArgs(first, second);
  const store = readStore('users');
  if (!Array.isArray(store.subscriptions[topic])) {
    return;
  }
  const index = store.subscriptions[topic].indexOf(userId);
  if (index !== -1) {
    store.subscriptions[topic].splice(index, 1);
    writeStore('users', store);
  }
}

function getLastReportDay() {
  return readStore('users').lastReportDay;
}

function setLastReportDay(dayText) {
  const store = readStore('users');
  store.lastReportDay = String(dayText);
  writeStore('users', store);
}

function addReading(userId, sensor, value, createdAt) {
  const store = readStore('readings');
  store.lastReadingId = store.lastReadingId + 1;
  const record = {
    id: store.lastReadingId,
    userId,
    sensor,
    value,
    createdAt: createdAt || new Date().toISOString(),
  };
  store.readings.push(record);
  writeStore('readings', store);
  return clone(record);
}

function getReading(id) {
  const store = readStore('readings');
  const found = store.readings.find((record) => record.id === id);
  return found === undefined ? null : clone(found);
}

function updateReading(id, value) {
  const store = readStore('readings');
  const found = store.readings.find((record) => record.id === id);
  if (found === undefined) {
    return null;
  }
  found.value = value;
  writeStore('readings', store);
  return clone(found);
}

function deleteReading(id) {
  const store = readStore('readings');
  const index = store.readings.findIndex((record) => record.id === id);
  if (index === -1) {
    return null;
  }
  const removed = store.readings.splice(index, 1)[0];
  writeStore('readings', store);
  return clone(removed);
}

function addManyReadings(userId, items) {
  const store = readStore('readings');
  for (const item of items) {
    store.lastReadingId = store.lastReadingId + 1;
    store.readings.push({
      id: store.lastReadingId,
      userId,
      sensor: item.sensor,
      value: item.value,
      createdAt: item.createdAt || new Date().toISOString(),
    });
  }
  writeStore('readings', store);
  return items.length;
}

function addDeviceReading(sensor, value, time, eventId) {
  const store = readStore('readings');
  if (eventId !== undefined && store.readings.some((record) => record.eventId === eventId)) {
    return null;
  }
  let index = store.readings.length;
  while (index > 0 && store.readings[index - 1].createdAt > time) {
    index = index - 1;
  }
  for (let i = index - 1; i >= 0 && store.readings[i].createdAt === time; i--) {
    if (store.readings[i].sensor === sensor) {
      return null;
    }
  }
  store.lastReadingId = store.lastReadingId + 1;
  const record = {
    id: store.lastReadingId,
    userId: 0,
    sensor,
    value,
    createdAt: time,
  };
  if (eventId !== undefined) {
    record.eventId = eventId;
  }
  store.readings.splice(index, 0, record);
  writeStore('readings', store);
  return clone(record);
}

function listReadings() {
  // Для користувача показуємо спочатку найновіші.
  return readStore('readings').readings.slice().reverse();
}

function listInternalReadings() {
  return readStore('readings').readings;
}

function listReadingsLastHours(hours, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const fromTime = now - hours * 60 * 60 * 1000;
  const result = [];
  const readings = readStore('readings').readings;
  for (let i = readings.length - 1; i >= 0; i--) {
    if (new Date(readings[i].createdAt).getTime() >= fromTime) {
      result.push(clone(readings[i]));
    }
  }
  return result;
}

function listReadingsByDay(dayText) {
  const result = [];
  const readings = readStore('readings').readings;
  for (let i = readings.length - 1; i >= 0; i--) {
    const record = readings[i];
    const recordDay = new Date(record.createdAt).toLocaleDateString('uk-UA', {
      timeZone: 'Europe/Kiev',
    });
    if (recordDay === dayText) {
      result.push(clone(record));
    }
  }
  return result;
}

function listTopReadings(count) {
  return stats.topValues(listInternalReadings(), count);
}

function latestBySensor() {
  const latest = Object.create(null);
  for (const record of listInternalReadings()) {
    latest[record.sensor] = clone(record);
  }
  return latest;
}

function addReminder(userId, text, dueAt) {
  const store = readStore('reminders');
  store.lastReminderId = store.lastReminderId + 1;
  const reminder = { id: store.lastReminderId, userId, text, dueAt };
  store.reminders.push(reminder);
  writeStore('reminders', store);
  return clone(reminder);
}

function listDueReminders(nowMs) {
  return readStore('reminders').reminders
    .filter((reminder) => new Date(reminder.dueAt).getTime() <= nowMs)
    .map((reminder) => clone(reminder));
}

function listUserReminders(userId) {
  return readStore('reminders').reminders
    .filter((reminder) => reminder.userId === userId)
    .map((reminder) => clone(reminder));
}

function removeReminder(id) {
  const store = readStore('reminders');
  const index = store.reminders.findIndex((reminder) => reminder.id === id);
  if (index !== -1) {
    store.reminders.splice(index, 1);
    writeStore('reminders', store);
  }
}

function getOutbox() {
  return readStore('outbox').outbox.slice();
}

function setOutbox(queue) {
  const store = readStore('outbox');
  store.outbox = Array.isArray(queue) ? clone(queue) : [];
  writeStore('outbox', store);
}

module.exports = {
  EMPTY,
  loadData,
  saveChanges,
  saveUser,
  getUser,
  isSubscribed,
  listSubscribers,
  addSubscriber,
  removeSubscriber,
  getLastReportDay,
  setLastReportDay,
  addReading,
  getReading,
  updateReading,
  deleteReading,
  addManyReadings,
  addDeviceReading,
  listReadings,
  listInternalReadings,
  listReadingsLastHours,
  listReadingsByDay,
  listTopReadings,
  latestBySensor,
  addReminder,
  listDueReminders,
  listUserReminders,
  removeReminder,
  getOutbox,
  setOutbox,
  fileFor,
  dataDir,
};
