'use strict';

const config = require('./config');
const format = require('./utils/format');
const broadcaster = require('./broadcast');
const logger = require('./logger');

function checkReading(bot, record) {
  if (record === null || record === undefined || typeof record.value !== 'number') {
    return;
  }
  if (record.value >= config.ALERT_MIN && record.value <= config.ALERT_MAX) {
    return;
  }
  const text = '⚠ Аномалія: ' + format.formatReading(record) +
    '\nДопустимо: від ' + config.ALERT_MIN + ' до ' + config.ALERT_MAX;
  broadcaster.broadcast(bot, 'alert', text).catch(function (error) {
    logger.error('Сповіщення про аномалію: ' + error.message);
  });
}

module.exports = { checkReading, ALERT_MIN: config.ALERT_MIN, ALERT_MAX: config.ALERT_MAX };
