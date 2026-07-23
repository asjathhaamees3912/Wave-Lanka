const axios = require('axios');
const cache = require('../cache');

const MARINE_API_URL =
  process.env.MARINE_API_URL || 'https://marine-api.open-meteo.com/v1/marine';

const MARINE_HOURLY_VARS = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'wind_wave_height',
  'sea_surface_temperature',
];

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

function pickHourlyFields(hourly, units) {
  const fields = {};
  for (const key of MARINE_HOURLY_VARS) {
    fields[key] = hourly[key] ?? null;
    fields[`${key}_unit`] = units[key] ?? null;
  }
  return fields;
}

function getCurrentIndex(times) {
  // Compute current hour aligned to Asia/Colombo (UTC+5:30)
  const now = new Date();
  const colomboOffsetMs = 5.5 * 60 * 60 * 1000; // 5.5 hours in ms
  const colomboNow = new Date(now.getTime() + colomboOffsetMs);

  const currentHour = new Date(
    Date.UTC(
      colomboNow.getUTCFullYear(),
      colomboNow.getUTCMonth(),
      colomboNow.getUTCDate(),
      colomboNow.getUTCHours()
    )
  );

  let bestIdx = 0;
  let bestTime = null;

  for (let i = 0; i < times.length; i++) {
    const dt = new Date(times[i]);
    if (dt <= currentHour && (!bestTime || dt > bestTime)) {
      bestTime = dt;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function buildCurrentSnapshot(hourly, units, index) {
  const current = { time: hourly.time[index] };
  for (const key of MARINE_HOURLY_VARS) {
    current[key] = hourly[key]?.[index] ?? null;
    current[`${key}_unit`] = units[key] ?? null;
  }
  return current;
}

async function fetchMarineForecast(zone) {
  const cacheKey = `marine:${zone.id}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const params = {
    latitude: zone.lat,
    longitude: zone.lon,
    hourly: MARINE_HOURLY_VARS.join(','),
    forecast_days: 7,
    timezone: 'Asia/Colombo',
  };

  const response = await fetchWithRetry(
    MARINE_API_URL,
    {
      params,
      headers: REQUEST_HEADERS,
      timeout: REQUEST_TIMEOUT,
    },
    3
  );

  const data = response.data;
  const hourly = data.hourly || {};
  const units = data.hourly_units || {};
  const times = hourly.time || [];
  const currentIndex = getCurrentIndex(times);

  const result = {
    zone: { id: zone.id, name: zone.name, lat: zone.lat, lon: zone.lon },
    source: MARINE_API_URL,
    timezone: data.timezone,
    fetched_at: new Date().toISOString(),
    cached: false,
    current: buildCurrentSnapshot(hourly, units, currentIndex),
    hourly: {
      time: times,
      ...pickHourlyFields(hourly, units),
    },
  };

  cache.set(cacheKey, result);
  return result;
}

async function getLagData(lat, lon) {
  const response = await axios.get(
    MARINE_API_URL,
    {
      params: {
        latitude: lat,
        longitude: lon,
        hourly: 'wave_height,swell_wave_height',
        past_days: 1,
        forecast_days: 0,
        timezone: 'Asia/Colombo',
      },
      timeout: REQUEST_TIMEOUT,
      headers: REQUEST_HEADERS,
    }
  );

  const hourly = response.data.hourly || {};
  const times = hourly.time || [];
  const waves = hourly.wave_height || [];
  const swells = hourly.swell_wave_height || [];

  const now = new Date();
  const colomboNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' })
  );
  const colomboHour = colomboNow.getHours();
  const todayStr = colomboNow.toISOString().split('T')[0];

  const currentIdx = times.findIndex((t) =>
    t.startsWith(todayStr) && parseInt(t.split('T')[1], 10) === colomboHour
  );

  const idx3h = Math.max(0, currentIdx === -1 ? 0 : currentIdx - 3);
  const idx6h = Math.max(0, currentIdx === -1 ? 0 : currentIdx - 6);

  return {
    wave_height_3h_ago: waves[idx3h] ?? waves[0] ?? 0,
    wave_height_6h_ago: waves[idx6h] ?? waves[0] ?? 0,
    wind_speed_3h_ago: 0,
    wind_speed_6h_ago: 0,
    swell_3h_ago: swells[idx3h] ?? swells[0] ?? 0,
  };
}

module.exports = {
  fetchMarineForecast,
  getLagData,
  MARINE_HOURLY_VARS,
};
