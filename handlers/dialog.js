'use strict';

const storage = require('../storage');
const format = require('../utils/format');
const logger = require('../logger');
const { userStates, KNOWN_CATEGORIES } = require('../state');

const handleDialogue = (ctx, state) => {
  const text = ctx.message.text;

  if (state.step === 'name') {
    state.data.name = text;
    state.step = 'categories';
    ctx.reply(`Крок 2/3: Обери категорії через кому: ${KNOWN_CATEGORIES.join(', ')}.\nМожеш написати власну — я уточню, чи додати її як нову.`);
    return;
  }

  if (state.step === 'categories') {
    const entered = text.split(',').map((item) => item.trim()).filter(Boolean);
    if (entered.length === 0) {
      ctx.reply('Список порожній. Повтори крок 2: категорії через кому.');
      return;
    }
    const unknown = entered.filter((category) => !KNOWN_CATEGORIES.includes(category));
    if (unknown.length > 0) {
      state.pending = entered;
      state.unknown = unknown;
      state.step = 'confirm_new';
      ctx.reply(`Я не знаю таких категорій: ${unknown.join(', ')}.\nЦе нові категорії? Додати їх до списку? (так / ні)`);
      return;
    }
    state.data.categories = entered;
    state.step = 'format';
    ctx.reply('Крок 3/3: Як отримувати нетермінове — «одразу» чи «вечірнім дайджестом»?');
    return;
  }

  if (state.step === 'confirm_new') {
    const answer = text.toLowerCase();
    if (answer === 'так' || answer === 'yes') {
      state.unknown.forEach((category) => {
        if (!KNOWN_CATEGORIES.includes(category)) {
          KNOWN_CATEGORIES.push(category);
        }
      });
      state.data.categories = state.pending;
      state.step = 'format';
      ctx.reply(`Додав нові категорії: ${state.unknown.join(', ')} ✅\nКрок 3/3: Як отримувати нетермінове — «одразу» чи «вечірнім дайджестом»?`);
      return;
    }
    if (answer === 'ні' || answer === 'no') {
      state.step = 'categories';
      ctx.reply(`Гаразд, не додаю. Повтори крок 2: категорії через кому (${KNOWN_CATEGORIES.join(', ')}).`);
      return;
    }
    ctx.reply('Відповідай «так» або «ні»: чи додати невідомі категорії як нові?');
    return;
  }

  if (state.step === 'format') {
    const answer = text.toLowerCase();
    if (!answer.includes('одразу') && !answer.includes('дайджест')) {
      ctx.reply('Обери один з варіантів: «одразу» або «вечірнім дайджестом».');
      return;
    }
    state.data.format = answer.includes('дайджест') ? 'вечірній дайджест' : 'одразу';
    try {
      storage.saveUser(ctx.from.id, state.data);
    } catch (error) {
      logger.error('profile: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
      return;
    }
    userStates.delete(ctx.from.id);
    ctx.reply(
      `✅ Збережено!\nІм'я: ${state.data.name}\nКатегорії: ${state.data.categories.join(', ')}\nФормат: ${state.data.format}`
    );
  }
};

module.exports = (bot) => {
  bot.on('text', (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (state) {
      handleDialogue(ctx, state);
      return;
    }
    ctx.reply('Я поки розумію лише команди та кнопки з меню. Натисни /help 🙂');
  });
};

module.exports.handleDialogue = handleDialogue;
