'use strict';

const stats = require('./stats');

const NOT_FOUND_TEXT = 'Запису з таким номером немає.';
const SAVE_FAILED_TEXT = 'Не вдалося зберегти зміни. Спробуй пізніше.';

function formatReading(record) {
  const when = new Date(record.createdAt).toLocaleString('uk-UA', {
    timeZone: 'Europe/Kiev',
  });
  return `#${record.id} · ${record.sensor} · ${record.value} · ${when}`;
}

function formatAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) {
    return 'щойно';
  }
  if (minutes < 60) {
    return minutes + ' хв тому';
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours + ' год тому';
  }
  return Math.floor(hours / 24) + ' дн тому';
}

function formatPeriodReport(title, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return title + ': записів немає.';
  }
  let text = title + ': ' + items.length;
  const limit = 10;
  for (let i = 0; i < items.length && i < limit; i++) {
    text = text + '\n' + formatReading(items[i]) + ' (' + formatAgo(items[i].createdAt) + ')';
  }
  if (items.length > limit) {
    text = text + '\n… і ще ' + (items.length - limit);
  }
  return text;
}

function formatImportReport(addedCount, errors) {
  let text = 'Імпортовано записів: ' + addedCount;
  if (errors.length > 0) {
    text = text + '\nПропущено рядків: ' + errors.length;
    const limit = 5;
    for (let i = 0; i < errors.length && i < limit; i++) {
      text = text + '\n• ' + errors[i];
    }
    if (errors.length > limit) {
      text = text + '\n… і ще ' + (errors.length - limit);
    }
  }
  return text;
}

function formatStatsReport(title, records) {
  if (!Array.isArray(records) || records.length === 0) {
    return title + ': записів немає.';
  }
  const groups = stats.groupBySource(records);
  let text = title + ': ' + records.length + ' записів';
  let shown = 0;
  let hidden = 0;
  for (const name of Object.keys(groups)) {
    if (shown >= 10) {
      hidden = hidden + 1;
      continue;
    }
    const summary = stats.calcStats(groups[name]);
    text = text + '\n' + name + ': ' + summary.count + ' шт, мін ' +
      summary.min + ', макс ' + summary.max + ', середнє ' + summary.avg.toFixed(1);
    shown = shown + 1;
  }
  if (hidden > 0) {
    text = text + '\n… і ще датчиків: ' + hidden;
  }
  return text;
}

function formatReminder(reminder) {
  const when = new Date(reminder.dueAt).toLocaleString('uk-UA', {
    timeZone: 'Europe/Kiev',
  });
  return '#' + reminder.id + ' · ' + when + ' · ' + reminder.text;
}

function formatWeather(weather) {
  if (weather === null || weather === undefined) {
    return 'Місто не знайдено.';
  }
  return weather.city + ': ' + weather.temperature + ' °C, вологість ' +
    weather.humidity + ' %, вітер ' + weather.wind + ' км/год';
}

function formatCompare(first, second) {
  if (first === null || second === null) {
    return 'Не вдалося порівняти: одне з міст не знайдено.';
  }
  let text = formatWeather(first) + '\n' + formatWeather(second);
  const diff = first.temperature - second.temperature;
  if (Math.abs(diff) < 0.05) {
    text = text + '\nТемпература однакова.';
  } else if (diff > 0) {
    text = text + '\nУ місті ' + first.city + ' тепліше на ' + Math.abs(diff).toFixed(1) + ' °C.';
  } else {
    text = text + '\nУ місті ' + second.city + ' тепліше на ' + Math.abs(diff).toFixed(1) + ' °C.';
  }
  return text;
}

module.exports = {
  NOT_FOUND_TEXT,
  SAVE_FAILED_TEXT,
  formatReading,
  formatAgo,
  formatPeriodReport,
  formatImportReport,
  formatStatsReport,
  formatReminder,
  formatWeather,
  formatCompare,
};
