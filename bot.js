'use strict';

const { Telegraf } = require('telegraf');
const config = require('./config');
const logger = require('./logger');
const { mainMenu } = require('./keyboards');
const { userStates, KNOWN_CATEGORIES } = require('./state');
const registerCommands = require('./handlers/commands');
const registerDialog = require('./handlers/dialog');
const scheduler = require('./scheduler');
const ingest = require('./ingest');

const bot = new Telegraf(config.BOT_TOKEN);

registerCommands(bot);
registerDialog(bot);

bot.catch((error, ctx) => {
  logger.error('bot.catch: ' + (error && error.message ? error.message : String(error)));
  if (ctx && typeof ctx.reply === 'function') {
    Promise.resolve(ctx.reply('Сталася помилка. Спробуй ще раз пізніше.')).catch(() => {});
  }
});

async function main() {
  const commands = [
    { command: 'start', description: 'Привітання та меню' },
    { command: 'help', description: 'Список команд' },
    { command: 'settings', description: 'Налаштувати підписки' },
    { command: 'weather', description: 'Погода у місті' },
    { command: 'dashboard', description: 'Посилання на дашборд' },
  ];
  try {
    await bot.telegram.setMyCommands(commands);
  } catch (error) {
    logger.warn('Не вдалося оновити список команд: ' + error.message);
  }

  scheduler.start(bot);
  ingest.start(bot);

  if (!config.BOT_TOKEN) {
    logger.warn('BOT_TOKEN не вказано: Telegram-бот не запущено.');
    return;
  }
  await bot.launch();

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('main: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  bot,
  main,
  registerCommands,
  registerDialog,
  mainMenu,
  userStates,
  KNOWN_CATEGORIES,
  handleStart: registerCommands.handleStart,
  startSettings: registerCommands.startSettings,
  handleLastAlert: registerCommands.handleLastAlert,
  handleHelp: registerCommands.handleHelp,
  handleAlert: registerCommands.handleAlert,
  handleCancel: registerCommands.handleCancel,
  handleCheck: registerCommands.handleCheck,
  handleDialogue: registerDialog.handleDialogue,
};
