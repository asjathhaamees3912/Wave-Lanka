const axios = require('axios');
const cache = require('../cache');

const MET_DEPT_URL = process.env.MET_DEPT_URL || 'https://meteo.gov.lk';
const MET_DEPT_CONTENT_URL =
  process.env.MET_DEPT_CONTENT_URL || 'https://meteo.gov.lk/content.json';

const REQUEST_HEADERS = {
  'User-Agent': 'WaveLanka-Backend/1.0 (marine fishing safety)',
  Accept: 'text/html,application/json,*/*',
};

const REQUEST_TIMEOUT = 30000;

const WARNING_KEYWORDS = [
  'rough',
  'very rough',
  'fairly rough',
  'thundershowers',
  "t'showers",
  'thunderstorm',
  'gusting',
  'strong',
  'do not',
  'warning',
  'advisory',
  'cyclone',
  'depression',
];

function asText(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim() || null;
}

function extractWarnings(...texts) {
  const warnings = [];
  const combined = texts.filter(Boolean).join('\n');

  for (const line of combined.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    const matched = WARNING_KEYWORDS.some((keyword) => lower.includes(keyword));
    if (matched) {
      warnings.push(trimmed);
    }
  }

  return [...new Set(warnings)];
}

async function fetchMetDeptForecast() {
  const cacheKey = 'meteo:forecast';
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const [homepageResult, contentResult] = await Promise.allSettled([
    axios.get(MET_DEPT_URL, { headers: REQUEST_HEADERS, timeout: REQUEST_TIMEOUT }),
    axios.get(MET_DEPT_CONTENT_URL, {
      headers: REQUEST_HEADERS,
      timeout: REQUEST_TIMEOUT,
    }),
  ]);

  const errors = [];
  let homepageHtml = null;
  let contentData = null;

  if (homepageResult.status === 'fulfilled') {
    homepageHtml = homepageResult.value.data;
  } else {
    errors.push(`Homepage: ${homepageResult.reason.message}`);
  }

  if (contentResult.status === 'fulfilled') {
    contentData = contentResult.value.data;
  } else {
    errors.push(`content.json: ${contentResult.reason.message}`);
  }

  if (!contentData && !homepageHtml) {
    const error = new Error('Failed to fetch Met Dept data');
    error.details = errors;
    throw error;
  }

  const seaWeather = asText(contentData?.sea_weather_forecast);
  const fleetShipping = asText(contentData?.fleet_shipping_forecast);
  const fishermanBulletin = contentData?.fisherman_bulletin ?? null;
  const severeAdvisory = asText(contentData?.severe_weather_advisory);

  const activeWarnings = extractWarnings(
    severeAdvisory,
    seaWeather,
    fleetShipping,
    asText(fishermanBulletin)
  );

  const result = {
    source: MET_DEPT_URL,
    fetched_at: new Date().toISOString(),
    cached: false,
    homepage_available: Boolean(homepageHtml),
    content_available: Boolean(contentData),
    advisories: {
      severe_weather_advisory: severeAdvisory,
      sea_weather_forecast: seaWeather,
      fleet_shipping_forecast: fleetShipping,
      fisherman_bulletin: fishermanBulletin,
    },
    raw_text: [seaWeather, fleetShipping, severeAdvisory]
      .filter(Boolean)
      .join('\n\n---\n\n'),
    active_warnings: activeWarnings,
    errors: errors.length ? errors : undefined,
  };

  cache.set(cacheKey, result);
  return result;
}

module.exports = {
  fetchMetDeptForecast,
};
