const axios = require('axios');
const cache = require('../cache');

const WEATHER_API_URL =
  process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast';

const WEATHER_VARS = [
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'weather_code',
  'precipitation',
  'visibility',
];

const WMO_WEATHER_CODES = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const REQUEST_HEADERS = {
  'User-Agent': 'WaveLanka-Backend/1.0 (marine fishing safety)',
  Accept: 'application/json',
};

const REQUEST_TIMEOUT = 8000; // 8 second timeout per attempt

async function fetchWithRetry(url, config, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, config);
      return response;
    } catch (error) {
      if (attempt === retries) {
        throw error; // give up gracefully on last attempt
      }
      const delay = attempt * 1000; // 1s, 2s, 3s backoff
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function weatherCodeLabel(code) {
  if (code == null) return null;
  const label = WMO_WEATHER_CODES[code];
  return label ? `${code} (${label})` : `${code} (Unknown)`;
}

async function fetchWeather(zone) {
  const cacheKey = `weather:${zone.id}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const params = {
    latitude: zone.lat,
    longitude: zone.lon,
    current: WEATHER_VARS.join(','),
    hourly: WEATHER_VARS.join(','),
    forecast_days: 7,
    timezone: 'Asia/Colombo',
  };

  const response = await fetchWithRetry(
    WEATHER_API_URL,
    {
      params,
      headers: REQUEST_HEADERS,
      timeout: REQUEST_TIMEOUT,
    },
    3
  );

  const data = response.data;
  const current = data.current || {};
  const currentUnits = data.current_units || {};

  const result = {
    zone: { id: zone.id, name: zone.name, lat: zone.lat, lon: zone.lon },
    source: WEATHER_API_URL,
    timezone: data.timezone,
    fetched_at: new Date().toISOString(),
    cached: false,
    current: {
      time: current.time,
      wind_speed_10m: current.wind_speed_10m ?? null,
      wind_speed_10m_unit: currentUnits.wind_speed_10m ?? 'km/h',
      wind_direction_10m: current.wind_direction_10m ?? null,
      wind_direction_10m_unit: currentUnits.wind_direction_10m ?? '°',
      wind_gusts_10m: current.wind_gusts_10m ?? null,
      wind_gusts_10m_unit: currentUnits.wind_gusts_10m ?? 'km/h',
      weather_code: current.weather_code ?? null,
      weather_label: weatherCodeLabel(current.weather_code),
      precipitation: current.precipitation ?? null,
      precipitation_unit: currentUnits.precipitation ?? 'mm',
      visibility: current.visibility ?? null,
      visibility_unit: currentUnits.visibility ?? 'm',
    },
    hourly: data.hourly || null,
    hourly_units: data.hourly_units || null,
  };

  cache.set(cacheKey, result);
  return result;
}

module.exports = {
  fetchWeather,
  weatherCodeLabel,
  WMO_WEATHER_CODES,
};
