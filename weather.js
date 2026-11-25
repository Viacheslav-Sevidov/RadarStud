'use strict';

const config = require('./config');

const cache = new Map();

function getFetch(fetchFn) {
  const implementation = fetchFn || globalThis.fetch;
  if (typeof implementation !== 'function') {
    throw new Error('fetch недоступний: потрібен Node.js 18+ або власна функція fetchFn');
  }
  return implementation;
}

async function getJson(url, fetchFn) {
  const response = await getFetch(fetchFn)(url, {
    signal: AbortSignal.timeout(config.HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error('Сервіс відповів помилкою ' + response.status);
  }
  return response.json();
}

async function findCity(name, fetchFn) {
  const url = config.GEOCODING_URL + '?name=' + encodeURIComponent(name) +
    '&count=1&language=uk';
  const data = await getJson(url, fetchFn);
  if (!data.results || data.results.length === 0) {
    return null;
  }
  const city = data.results[0];
  return { name: city.name, latitude: city.latitude, longitude: city.longitude };
}

async function getCurrentWeather(latitude, longitude, fetchFn) {
  const url = config.FORECAST_URL +
    '?latitude=' + latitude +
    '&longitude=' + longitude +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m' +
    '&timezone=auto';
  const data = await getJson(url, fetchFn);
  if (!data.current || typeof data.current.temperature_2m !== 'number') {
    throw new Error('Несподівана відповідь сервісу: немає температури');
  }
  return {
    temperature: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    wind: data.current.wind_speed_10m,
  };
}

async function weatherForCity(name, fetchFn) {
  const key = String(name).toLowerCase();
  const saved = cache.get(key);
  if (saved !== undefined && Date.now() - saved.savedAt < config.WEATHER_CACHE_MS) {
    return saved.weather;
  }
  const city = await findCity(name, fetchFn);
  if (city === null) {
    return null;
  }
  const current = await getCurrentWeather(city.latitude, city.longitude, fetchFn);
  const weather = {
    city: city.name,
    temperature: current.temperature,
    humidity: current.humidity,
    wind: current.wind,
  };
  cache.set(key, { savedAt: Date.now(), weather });
  return weather;
}

function clearCache() {
  cache.clear();
}

module.exports = {
  weatherForCity,
  findCity,
  getCurrentWeather,
  getJson,
  clearCache,
  GEOCODING_URL: config.GEOCODING_URL,
  FORECAST_URL: config.FORECAST_URL,
  DEFAULT_CITY: config.DEFAULT_CITY,
  HTTP_TIMEOUT_MS: config.HTTP_TIMEOUT_MS,
  WEATHER_CACHE_MS: config.WEATHER_CACHE_MS,
};
