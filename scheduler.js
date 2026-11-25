'use strict';

const config = require('./config');
const storage = require('./storage');
const format = require('./utils/format');
const logger = require('./logger');

const REPORT_TIME = config.REPORT_TIME || '08:00';
const INTERVAL_MS = 60 * 1000;
let timer = null;

function getKyivTime(now) {
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kiev',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === 'hour').value;
  const minute = parts.find((part) => part.type === 'minute').value;
  return hour + ':' + minute;
}

function getKyivDay(now) {
  return now.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kiev' });
}

function sendSafe(bot, userId, text) {
  Promise.resolve(bot.telegram.sendMessage(userId, text)).catch((error) => {
    logger.error('Не вдалося надіслати користувачу ' + userId + ': ' + error.message);
    if (error.code === 403 || error.status === 403) {
      try {
        storage.removeSubscriber('report', userId);
      } catch (saveError) {
        logger.error('Не вдалося прибрати підписника: ' + saveError.message);
      }
    }
  });
}

function checkReminders(bot) {
  // Нагадування залежать від реального часу, а не від дати звіту, переданої в tick().
  const due = storage.listDueReminders(Date.now());
  for (const reminder of due) {
    // Спершу прибираємо з черги, щоб не надсилати кілька разів.
    storage.removeReminder(reminder.id);
    sendSafe(bot, reminder.userId, '⏰ Нагадування: ' + reminder.text);
  }
}

function checkDailyReport(bot, now) {
  const today = getKyivDay(now);
  if (storage.getLastReportDay() === today) {
    return;
  }
  if (getKyivTime(now) < REPORT_TIME) {
    return;
  }
  // Спершу відмічаємо дату: краще пропустити звіт, ніж слати його щохвилини.
  storage.setLastReportDay(today);
  const records = storage.listReadingsLastHours(24, now.getTime());
  const text = format.formatStatsReport('Щоденний звіт за 24 години', records);
  for (const userId of storage.listSubscribers('report')) {
    sendSafe(bot, userId, text);
  }
}

function tick(bot, now) {
  const moment = now instanceof Date ? now : new Date(now);
  try {
    checkReminders(bot);
    checkDailyReport(bot, moment);
  } catch (error) {
    logger.error('Планувальник: ' + error.message);
  }
}

function start(bot) {
  tick(bot, new Date());
  if (timer !== null) {
    clearInterval(timer);
  }
  timer = setInterval(function () {
    tick(bot, new Date());
  }, INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

function stop() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  start,
  stop,
  tick,
  checkDailyReport,
  checkReminders,
  sendSafe,
  getKyivTime,
  getKyivDay,
  kyivTime: getKyivTime,
  kyivDay: getKyivDay,
  REPORT_TIME,
  INTERVAL_MS,
};
