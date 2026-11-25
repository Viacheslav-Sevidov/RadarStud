'use strict';

const config = require('../config');
const storage = require('../storage');

function addToQueue(queue, reading, maxSize) {
  queue.push(reading);
  let dropped = 0;
  while (queue.length > maxSize) {
    queue.shift();
    dropped = dropped + 1;
  }
  return dropped;
}

function isPermanent(error) {
  const status = Number(error && (error.status !== undefined ? error.status : error.code));
  return status >= 400 && status < 500 && status !== 401;
}

async function flushQueue(queue, send, onQueueChange) {
  const result = { sent: 0, dropped: 0, left: 0, error: null };
  while (queue.length > 0) {
    try {
      await send(queue[0]);
      queue.shift();
      result.sent = result.sent + 1;
    } catch (error) {
      if (isPermanent(error)) {
        queue.shift();
        result.dropped = result.dropped + 1;
      } else {
        result.error = error.message;
        break;
      }
    }
    if (typeof onQueueChange === 'function') {
      onQueueChange(queue);
    }
  }
  result.left = queue.length;
  return result;
}

function loadQueue() {
  return storage.getOutbox();
}

function saveQueue(queue) {
  storage.setOutbox(queue);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  addToQueue,
  isPermanent,
  flushQueue,
  loadQueue,
  saveQueue,
  sleep,
  MAX_QUEUE: config.MAX_QUEUE,
};
