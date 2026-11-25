'use strict';

const { Markup } = require('telegraf');

const BTN_SETTINGS = '⚙️ Налаштування';
const BTN_LAST_ALERT = '🚨 Остання блискавка';
const BTN_HELP = '❓ Допомога';

const BUTTONS = {
  settings: BTN_SETTINGS,
  last_alert: BTN_LAST_ALERT,
  help: BTN_HELP,
};

const mainMenu = Markup.keyboard([
  [BTN_SETTINGS, BTN_LAST_ALERT],
  [BTN_HELP],
]).resize();

module.exports = {
  BTN_SETTINGS,
  BTN_LAST_ALERT,
  BTN_HELP,
  BUTTONS,
  mainMenu,
};
