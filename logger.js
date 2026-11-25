'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

const INFO = 'INFO';
const WARN = 'WARN';
const ERROR = 'ERROR';
const LEVELS = { INFO, WARN, ERROR };

function logFile() {
  return path.join(config.DATA_DIR, 'bot.log');
}

function log(level, message) {
  const safeLevel = LEVELS[level] ? level : INFO;
  const line = `[${new Date().toISOString()}] [${safeLevel}] ${String(message)}\n`;
  try {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    fs.appendFileSync(logFile(), line, 'utf8');
  } catch (error) {
    // Логування ніколи не повинно зупиняти бота.
    process.stderr.write(`logger: ${error.message}\n`);
  }
}

module.exports = {
  INFO,
  WARN,
  ERROR,
  LEVELS,
  log,
  info: (message) => log(INFO, message),
  warn: (message) => log(WARN, message),
  error: (message) => log(ERROR, message),
  logFile,
};
