'use strict';

const config = require('../config');
const storage = require('../storage');
const format = require('../utils/format');
const csv = require('../utils/csv');
const chart = require('../utils/chart');
const weatherService = require('../weather');
const broadcaster = require('../broadcast');
const alerts = require('../alerts');
const logger = require('../logger');
const { mainMenu } = require('../keyboards');
const { userStates, KNOWN_CATEGORIES } = require('../state');
const {
  parseNumber,
  parseId,
  parseHours,
  parseCount,
  parseMinutes,
  isValidDate,
} = require('../utils/validators');

const BTN_SETTINGS = '⚙️ Налаштування';
const BTN_LAST_ALERT = '🚨 Остання блискавка';
const BTN_HELP = '❓ Допомога';

const handleStart = (ctx) => {
  ctx.reply(
    'Привіт! Я RadarStud — твій фільтр студентських чатів.\n' +
    'Обирай дію кнопками нижче або текстовими командами.',
    mainMenu
  );
};

const startSettings = (ctx) => {
  userStates.set(ctx.from.id, { step: 'name', data: {} });
  ctx.reply('Почнімо налаштування підписок.\nКрок 1/3: Як тебе звати?');
};

const handleLastAlert = (ctx) => {
  ctx.reply('⚡ Остання блискавка:\nУвага! Пари 12.05 перенесено в онлайн через повітряну тривогу.');
};

const handleHelp = (ctx) => {
  ctx.reply(
    '📖 Доступні команди:\n' +
    '/start — привітання та головне меню\n' +
    '/settings — налаштування підписок (діалог)\n' +
    '/last_alert — остання «Блискавка»\n' +
    '/check <кількість> <% термінових> — порада щодо режиму сповіщень\n' +
    '/alert — (адмін) розсилка «Блискавки»\n' +
    '/cancel — скасувати поточний діалог\n' +
    '/help — цей список\n' +
    '/add <датчик> <значення> · /update <id> <значення> · /del <id> — показання\n' +
    '/last [години] · /day <dd.mm.yyyy> · /import — вибірки та імпорт CSV\n' +
    '/report [години] · /top [кількість] — звіти й топ\n' +
    '/subscribe <тема> · /unsubscribe <тема> · /subscriptions · /id\n' +
    '/daily · /remind <хвилини> <текст> · /reminders · /delremind <id>\n' +
    '/broadcast <текст> — (адмін) розсилка новин\n' +
    '/weather [місто] · /compare <місто1> <місто2> · /live\n' +
    '/trend [години] [датчик] · /chart [години] [датчик] · /dashboard'
  );
};

const handleAlert = (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) {
    return ctx.reply('⛔ Доступ заборонено: команда доступна лише адміністратору.');
  }
  ctx.reply('⚡ Блискавка: режим розсилки запущено. (поки заглушка)');
};

const handleCancel = (ctx) => {
  if (!userStates.has(ctx.from.id)) {
    return ctx.reply('Немає активного діалогу.');
  }
  userStates.delete(ctx.from.id);
  ctx.reply('Діалог скасовано.');
};

const handleCheck = (ctx) => {
  const parts = ctx.message.text.split(/\s+/);
  const count = parseFloat(parts[1]);
  const percent = parseFloat(parts[2]);

  if (isNaN(count) || isNaN(percent)) {
    return ctx.reply(
      '🛡️ Потрібно два числа: кількість повідомлень і відсоток термінових.\n' +
      'Приклад: /check 50 20'
    );
  }
  if (count < 0 || percent < 0) {
    return ctx.reply('🛡️ Значення не можуть бути від\'ємними. Приклад: /check 50 20');
  }
  if (percent > 100) {
    return ctx.reply('🛡️ Відсоток термінових не може перевищувати 100. Приклад: /check 50 20');
  }

  if ((count > 30) && (percent > 50)) {
    return ctx.reply(
      '⚡ КРИТИЧНО: і багато повідомлень, і більшість термінові.\n' +
      'Увімкни миттєві блискавки (US3) і тимчасово приглуш нетермінове (US4).'
    );
  }
  if (count <= 30) {
    return ctx.reply(
      '🟢 Спокійно: потік невеликий, фільтр не потрібен — приймай усе одразу.'
    );
  }
  if (count <= 60) {
    return ctx.reply(
      '🟠 Високий шум: увімкни вечірній дайджест (US2), щоб нетермінове не смикало на парах.'
    );
  }
  return ctx.reply(
    '🔴 Перевантаження: увімкни фільтрацію за категоріями (US4) — сам потік уже занадто густий.'
  );
};

function isTopic(name) {
  return Object.prototype.hasOwnProperty.call(config.TOPICS, name);
}

function topicsText() {
  let text = '';
  for (const topic of Object.keys(config.TOPICS)) {
    text = text + '\n' + topic + ' — ' + config.TOPICS[topic];
  }
  return text;
}

function pointsFor(hours, sensor) {
  let records = storage.listReadingsLastHours(hours);
  if (sensor === '' && records.length > 0) {
    sensor = records[0].sensor;
  }
  const points = [];
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].sensor === sensor) {
      points.push({ time: new Date(records[i].createdAt).getTime(), value: records[i].value });
    }
  }
  return { sensor, points };
}

function requireAdmin(ctx, message) {
  if (ctx.from.id === config.ADMIN_ID) {
    return false;
  }
  ctx.reply(message || '⛔ Доступ заборонено: команда доступна лише адміністратору.');
  return true;
}

module.exports = (bot) => {
  bot.start(handleStart);
  bot.command('settings', startSettings);
  bot.command('last_alert', handleLastAlert);
  bot.command('help', handleHelp);
  bot.command('alert', handleAlert);
  bot.command('cancel', handleCancel);
  bot.command('check', handleCheck);

  bot.hears(BTN_SETTINGS, startSettings);
  bot.hears(BTN_LAST_ALERT, handleLastAlert);
  bot.hears(BTN_HELP, handleHelp);

  bot.command('add', (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    const sensor = parts[1];
    const value = parseNumber(parts[2]);
    if (!sensor || sensor.length > 30 || value === null) {
      ctx.reply('Формат: /add <датчик> <значення>, наприклад /add теплиця-1 24.5');
      return;
    }
    try {
      const record = storage.addReading(ctx.from.id, sensor, value);
      ctx.reply('Додано: ' + format.formatReading(record));
      alerts.checkReading(bot, record);
    } catch (error) {
      logger.error('add: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('update', (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    const id = parseId(parts[1]);
    const value = parseNumber(parts[2]);
    if (id === null || value === null) {
      ctx.reply('Формат: /update <номер> <значення>, наприклад /update 1 23.4');
      return;
    }
    try {
      const record = storage.updateReading(id, value);
      ctx.reply(record === null ? format.NOT_FOUND_TEXT : 'Оновлено: ' + format.formatReading(record));
    } catch (error) {
      logger.error('update: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('del', (ctx) => {
    const id = parseId(ctx.message.text.split(/\s+/)[1]);
    if (id === null) {
      ctx.reply('Формат: /del <номер>, наприклад /del 1');
      return;
    }
    try {
      const record = storage.deleteReading(id);
      ctx.reply(record === null ? format.NOT_FOUND_TEXT : 'Видалено: ' + format.formatReading(record));
    } catch (error) {
      logger.error('del: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('last', (ctx) => {
    const hours = parseHours(ctx.message.text.split(/\s+/)[1]);
    if (hours === null) {
      ctx.reply('Формат: /last <години>, наприклад /last 24 (від 0 до 720). Без числа — за останні 24 години.');
      return;
    }
    ctx.reply(format.formatPeriodReport('За останні ' + hours + ' год', storage.listReadingsLastHours(hours)));
  });

  bot.command('day', (ctx) => {
    const day = ctx.message.text.split(/\s+/)[1];
    if (!isValidDate(day)) {
      ctx.reply('Формат: /day <дата> у вигляді dd.mm.yyyy, наприклад /day 22.10.2026');
      return;
    }
    ctx.reply(format.formatPeriodReport('За ' + day, storage.listReadingsByDay(day)));
  });

  bot.command('time', (ctx) => {
    const now = new Date();
    ctx.reply('Зараз у Києві: ' + now.toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' }) +
      '\nUTC (так час зберігається у файлі): ' + now.toISOString());
  });

  bot.command('import', (ctx) => {
    if (requireAdmin(ctx, '⛔ Імпорт доступний лише адміністратору.')) {
      return;
    }
    let text;
    try {
      text = csv.readCsvFile(config.IMPORT_FILE);
    } catch (error) {
      logger.error('import (читання файлу): ' + error.message);
      ctx.reply('Не вдалося прочитати файл імпорту.');
      return;
    }
    if (text === null) {
      ctx.reply('Файл імпорту не знайдено. Покладіть файл readings.csv у папку import і повторіть /import.');
      return;
    }
    const parsed = csv.readingsFromCsv(text);
    const good = parsed.good.slice(0, config.MAX_IMPORT);
    try {
      const added = storage.addManyReadings(ctx.from.id, good);
      ctx.reply(format.formatImportReport(added, parsed.errors));
    } catch (error) {
      logger.error('import: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('report', (ctx) => {
    const hours = parseHours(ctx.message.text.split(/\s+/)[1]);
    if (hours === null) {
      ctx.reply('Формат: /report <години>, без числа — за останні 24 години.');
      return;
    }
    ctx.reply(format.formatStatsReport('За останні ' + hours + ' год', storage.listReadingsLastHours(hours)));
  });

  bot.command('top', (ctx) => {
    const count = parseCount(ctx.message.text.split(/\s+/)[1]);
    if (count === null) {
      ctx.reply('Формат: /top <кількість> (від 1 до 20). Без числа — 5.');
      return;
    }
    const items = storage.listTopReadings(count);
    if (items.length === 0) {
      ctx.reply('Показань ще немає.');
      return;
    }
    ctx.reply('Найбільші значення:\n' + items.map((item) => format.formatReading(item)).join('\n'));
  });

  bot.command('id', (ctx) => {
    ctx.reply('Твій Telegram ID: ' + ctx.from.id);
  });

  bot.command('subscribe', (ctx) => {
    const topic = ctx.message.text.split(' ')[1];
    if (!isTopic(topic)) {
      ctx.reply('Формат: /subscribe <тема>. Теми:' + topicsText());
      return;
    }
    try {
      storage.addSubscriber(topic, ctx.from.id);
      ctx.reply('Підписано: ' + config.TOPICS[topic] + '.');
    } catch (error) {
      logger.error('subscribe: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('unsubscribe', (ctx) => {
    const topic = ctx.message.text.split(' ')[1];
    if (!isTopic(topic)) {
      ctx.reply('Формат: /unsubscribe <тема>. Теми:' + topicsText());
      return;
    }
    try {
      storage.removeSubscriber(topic, ctx.from.id);
      ctx.reply('Відписано: ' + config.TOPICS[topic] + '.');
    } catch (error) {
      logger.error('unsubscribe: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('subscriptions', (ctx) => {
    let text = 'Твої підписки:';
    for (const topic of Object.keys(config.TOPICS)) {
      const mark = storage.isSubscribed(topic, ctx.from.id) ? '✔' : '✖';
      text = text + '\n' + mark + ' ' + topic + ' — ' + config.TOPICS[topic];
    }
    ctx.reply(text);
  });

  bot.command('daily', (ctx) => {
    try {
      if (storage.isSubscribed('report', ctx.from.id)) {
        storage.removeSubscriber('report', ctx.from.id);
        ctx.reply('Щоденний звіт вимкшено.');
      } else {
        storage.addSubscriber('report', ctx.from.id);
        ctx.reply('Щоденний звіт увімкнено: щодня о ' + config.REPORT_TIME + ' за Києвом.');
      }
    } catch (error) {
      logger.error('daily: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('remind', (ctx) => {
    const parts = ctx.message.text.split(' ');
    const minutes = parseMinutes(parts[1]);
    const text = parts.slice(2).join(' ').trim();
    if (minutes === null || text === '' || text.length > 200) {
      ctx.reply('Формат: /remind <хвилини> <текст>, наприклад /remind 30 Перевірити полив (від 1 до 10080 хвилин, текст до 200 символів).');
      return;
    }
    const dueAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    try {
      const reminder = storage.addReminder(ctx.from.id, text, dueAt);
      ctx.reply('Нагадаю: ' + format.formatReminder(reminder));
    } catch (error) {
      logger.error('remind: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('reminders', (ctx) => {
    const items = storage.listUserReminders(ctx.from.id);
    if (items.length === 0) {
      ctx.reply('Активних нагадувань немає. Додай: /remind 30 Перевірити полив');
      return;
    }
    ctx.reply('Твої нагадування:\n' + items.map((item) => format.formatReminder(item)).join('\n'));
  });

  bot.command('delremind', (ctx) => {
    const id = parseId(ctx.message.text.split(/\s+/)[1]);
    if (id === null) {
      ctx.reply('Формат: /delremind <номер>.');
      return;
    }
    const own = storage.listUserReminders(ctx.from.id).some((item) => item.id === id);
    if (!own) {
      ctx.reply('Такого нагадування немає.');
      return;
    }
    try {
      storage.removeReminder(id);
      ctx.reply('Нагадування #' + id + ' скасовано.');
    } catch (error) {
      logger.error('delremind: ' + error.message);
      ctx.reply(format.SAVE_FAILED_TEXT);
    }
  });

  bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== config.ADMIN_ID) {
      ctx.reply('Ця команда лише для адміністратора.');
      return;
    }
    const text = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (text === '' || text.length > 1000) {
      ctx.reply('Формат: /broadcast <текст> (до 1000 символів).');
      return;
    }
    const total = storage.listSubscribers('news').length;
    ctx.reply('Розсилку запущено. Підписників теми news: ' + total);
    const result = await broadcaster.broadcast(bot, 'news', text);
    ctx.reply('Готово: доставлено ' + result.delivered + ', помилок ' + result.failed + '.');
  });

  bot.command('weather', async (ctx) => {
    let city = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (city === '') {
      city = config.DEFAULT_CITY;
    }
    if (city.length > 50) {
      ctx.reply('Назва міста задовга (до 50 символів).');
      return;
    }
    try {
      const weather = await weatherService.weatherForCity(city);
      if (weather === null) {
        ctx.reply('Місто «' + city + '» не знайдено.');
        return;
      }
      ctx.reply(format.formatWeather(weather));
    } catch (error) {
      logger.error('weather: ' + error.message);
      ctx.reply('Не вдалося отримати погоду. Спробуй пізніше.');
    }
  });

  bot.command('compare', async (ctx) => {
    const rest = ctx.message.text.split(' ').slice(1).join(' ').trim();
    let cities = rest.includes(',')
      ? rest.split(',').map((item) => item.trim()).filter(Boolean)
      : rest.split(/\s+/).filter(Boolean);
    if (cities.length === 0) {
      cities = [config.DEFAULT_CITY, config.DEFAULT_CITY];
    } else if (cities.length === 1) {
      cities.push(config.DEFAULT_CITY);
    }
    if (cities.length !== 2 || cities.some((city) => city.length > 50)) {
      ctx.reply('Формат: /compare <місто1> <місто2> (або /compare Місто1, Місто2).');
      return;
    }
    try {
      const first = await weatherService.weatherForCity(cities[0]);
      const second = await weatherService.weatherForCity(cities[1]);
      ctx.reply(format.formatCompare(first, second));
    } catch (error) {
      logger.error('compare: ' + error.message);
      ctx.reply('Не вдалося порівняти погоду. Спробуй пізніше.');
    }
  });

  bot.command('live', (ctx) => {
    const latest = storage.latestBySensor();
    let text = '';
    let shown = 0;
    for (const name of Object.keys(latest)) {
      if (shown >= 10) {
        break;
      }
      const record = latest[name];
      text = text + '\n' + name + ': ' + record.value + ' (' + format.formatAgo(record.createdAt) + ')';
      shown = shown + 1;
    }
    if (text === '') {
      ctx.reply('Показань ще немає. Запусти симулятор: node simulator.js 2');
      return;
    }
    ctx.reply('Останні показання:' + text);
  });

  bot.command('trend', (ctx) => {
    const parts = ctx.message.text.split(' ');
    const hours = parseHours(parts[1]);
    if (hours === null) {
      ctx.reply('Формат: /trend <години> <датчик>, наприклад /trend 6 теплиця-1 (від 0 до 720 годин).');
      return;
    }
    const found = pointsFor(hours, parts.slice(2).join(' ').trim());
    if (found.points.length < 2) {
      ctx.reply('Для діаграми потрібно щонайменше 2 показання датчика за цей період.');
      return;
    }
    const groups = chart.downsample(found.points, 30);
    const values = groups.map((point) => point.value);
    let min = found.points[0].value;
    let max = found.points[0].value;
    for (const point of found.points) {
      if (point.value < min) {
        min = point.value;
      }
      if (point.value > max) {
        max = point.value;
      }
    }
    ctx.reply(found.sensor + ' (за ' + hours + ' год, показань: ' + found.points.length + ')\n' +
      chart.sparkline(values) + '\n' +
      'мін ' + min.toFixed(1) + ' · макс ' + max.toFixed(1));
  });

  bot.command('chart', (ctx) => {
    const parts = ctx.message.text.split(' ');
    const hours = parseHours(parts[1]);
    if (hours === null) {
      ctx.reply('Формат: /chart <години> <датчик>, наприклад /chart 6 теплиця-1.');
      return;
    }
    const found = pointsFor(hours, parts.slice(2).join(' ').trim());
    if (found.points.length < 2) {
      ctx.reply('Для графіка потрібно щонайменше 2 показання датчика за цей період.');
      return;
    }
    const image = chart.chartToPng(found.points, { min: config.ALERT_MIN, max: config.ALERT_MAX });
    if (typeof ctx.replyWithPhoto === 'function') {
      ctx.replyWithPhoto({ source: image }, found.sensor + ' — графік за ' + hours + ' год');
      return;
    }
    ctx.reply('PNG-графік для ' + found.sensor + ' побудовано: ' + image.length + ' байт.');
  });

  bot.command('dashboard', (ctx) => {
    if (!config.DASHBOARD_TOKEN) {
      ctx.reply('Дашборд вимкнено: DASHBOARD_TOKEN не вказано.');
      return;
    }
    ctx.reply('Дашборд: http://' + config.INGEST_HOST + ':' + config.PORT +
      '/dashboard?token=' + config.DASHBOARD_TOKEN);
  });
};

module.exports.handleStart = handleStart;
module.exports.startSettings = startSettings;
module.exports.handleLastAlert = handleLastAlert;
module.exports.handleHelp = handleHelp;
module.exports.handleAlert = handleAlert;
module.exports.handleCancel = handleCancel;
module.exports.handleCheck = handleCheck;
module.exports.isTopic = isTopic;
module.exports.topicsText = topicsText;
module.exports.pointsFor = pointsFor;
module.exports.requireAdmin = requireAdmin;
module.exports.KNOWN_CATEGORIES = KNOWN_CATEGORIES;
