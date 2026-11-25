'use strict';

const config = require('./config');
const storage = require('./storage');
const logger = require('./logger');

const TOPICS = config.TOPICS;
const BROADCAST_PAUSE_MS = config.BROADCAST_PAUSE_MS;

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function broadcast(bot, topic, text) {
  // Ітеруємо копію: 403 може змінити список підписників просто під час розсилки.
  const ids = storage.listSubscribers(topic);
  let delivered = 0;
  let failed = 0;
  for (const userId of ids) {
    try {
      await bot.telegram.sendMessage(userId, text);
      delivered = delivered + 1;
    } catch (error) {
      failed = failed + 1;
      logger.warn('Розсилка: не вдалося надіслати ' + userId + ': ' + error.message);
      if (error.code === 403 || error.status === 403) {
        try {
          storage.removeSubscriber(topic, userId);
        } catch (saveError) {
          logger.error('Розсилка: не вдалося відписати ' + userId + ': ' + saveError.message);
        }
      }
    }
    await sleep(config.BROADCAST_PAUSE_MS);
  }
  return { delivered, failed };
}

module.exports = { broadcast, sleep, TOPICS, BROADCAST_PAUSE_MS };
