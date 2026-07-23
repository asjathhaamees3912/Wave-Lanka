const thresholds = require('../data/safetyThresholds.json');
const marineService = require('./marineService');
const weatherService = require('./weatherService');

const DANGEROUS_WEATHER_CODES = new Set([95, 96, 99]);

function computeSafetyLevel(waveHeight, windSpeed) {
  const wave = waveHeight ?? 0;
  const wind = windSpeed ?? 0;

  if (wave > 3.5 || wind > 50) {
    return 'DO NOT GO';
  }
  if (wave >= 2.0 || wind >= 35) {
    return 'DANGEROUS';
  }
  if (wave >= 1.0 || wind >= 20) {
    return 'CAUTION';
  }
  return 'SAFE';
}

function buildReason(level, waveHeight, windSpeed, weatherCode) {
  const parts = [];

  if (waveHeight != null) {
    parts.push(`wave height is ${waveHeight.toFixed(2)} m`);
  }
  if (windSpeed != null) {
    parts.push(`wind speed is ${windSpeed.toFixed(1)} km/h`);
  }

  const conditions = parts.length ? parts.join(' and ') : 'conditions are within limits';

  let reason = `${level}: Current ${conditions}.`;

  const levelMeta = thresholds.levels.find((item) => item.level === level);
  if (levelMeta?.description) {
    reason += ` ${levelMeta.description}`;
  }

  if (weatherCode != null && DANGEROUS_WEATHER_CODES.has(Number(weatherCode))) {
    const label = weatherService.weatherCodeLabel(weatherCode);
    reason += ` Active thunderstorm conditions detected (${label}).`;
  }

  return reason;
}

function isHourSafe(waveHeight, windSpeed) {
  return (
    waveHeight != null &&
    windSpeed != null &&
    waveHeight < thresholds.safeWindow.max_wave_height &&
    windSpeed < thresholds.safeWindow.max_wind_speed
  );
}

function findBestSafeWindow(marineData, weatherData) {
  const marineHourly = marineData?.hourly;
  const weatherHourly = weatherData?.hourly;
  const minDuration = thresholds.safeWindow.min_duration_hours;

  if (!marineHourly?.time || !weatherHourly?.time) {
    return null;
  }

  const windByTime = new Map();
  const weatherTimes = weatherHourly.time || [];
  const windSpeeds = weatherHourly.wind_speed_10m || [];

  for (let i = 0; i < weatherTimes.length; i++) {
    windByTime.set(weatherTimes[i], windSpeeds[i]);
  }

  let bestWindow = null;
  let currentStart = null;
  let currentLength = 0;

  for (let i = 0; i < marineHourly.time.length; i++) {
    const time = marineHourly.time[i];
    const wave = marineHourly.wave_height?.[i];
    const wind = windByTime.get(time);

    if (isHourSafe(wave, wind)) {
      if (currentStart === null) {
        currentStart = time;
        currentLength = 1;
      } else {
        currentLength += 1;
      }

      if (
        currentLength >= minDuration &&
        (!bestWindow || currentLength > bestWindow.duration_hours)
      ) {
        const startIdx = i - currentLength + 1;
        const windowWinds = [];
        for (let j = startIdx; j <= i; j++) {
          const wind = windByTime.get(marineHourly.time[j]);
          if (wind != null) windowWinds.push(wind);
        }
        bestWindow = {
          start: marineHourly.time[startIdx],
          end: time,
          duration_hours: currentLength,
          max_wave_height: Math.max(
            ...marineHourly.wave_height
              .slice(startIdx, i + 1)
              .filter((v) => v != null)
          ),
          max_wind_speed: windowWinds.length ? Math.max(...windowWinds) : null,
        };
      }
    } else {
      currentStart = null;
      currentLength = 0;
    }
  }

  if (!bestWindow) {
    return {
      found: false,
      message: 'No extended safe window found in the next 7 days.',
    };
  }

  return {
    found: true,
    start: bestWindow.start,
    end: bestWindow.end,
    duration_hours: bestWindow.duration_hours,
    max_wave_height: Number(bestWindow.max_wave_height.toFixed(2)),
    max_wind_speed: Number(bestWindow.max_wind_speed.toFixed(1)),
    message: `Best safe window: ${bestWindow.start} to ${bestWindow.end} (${bestWindow.duration_hours} hours with waves below ${thresholds.safeWindow.max_wave_height} m and wind below ${thresholds.safeWindow.max_wind_speed} km/h).`,
  };
}

async function assessZoneSafety(zone) {
  // Fetch marine and weather data independently with fallback
  let marineData = null;
  let marineError = null;
  let weatherData = null;
  let weatherError = null;
  let partialData = false;
  let missing = null;

  try {
    marineData = await marineService.fetchMarineForecast(zone);
  } catch (error) {
    marineError = error;
    // Provide safe fallback marine data
    marineData = {
      zone: { id: zone.id, name: zone.name, lat: zone.lat, lon: zone.lon },
      current: {
        wave_height: null,
        swell_wave_height: null,
        wave_period: null,
      },
      hourly: { time: [] },
    };
    partialData = true;
    missing = 'marine';
  }

  try {
    weatherData = await weatherService.fetchWeather(zone);
  } catch (error) {
    weatherError = error;
    // Provide safe fallback weather data
    weatherData = {
      zone: { id: zone.id, name: zone.name, lat: zone.lat, lon: zone.lon },
      current: {
        wind_speed_10m: null,
        wind_gusts_10m: null,
        weather_code: null,
      },
      hourly: { time: [] },
    };
    if (missing === 'marine') {
      missing = 'both';
    } else {
      missing = 'weather';
      partialData = true;
    }
  }

  // If both APIs failed, return UNKNOWN with user-friendly message
  if (marineError && weatherError) {
    return {
      zone: zone.name,
      level: 'UNKNOWN',
      reason: 'Live marine data temporarily unavailable. Please refresh in a few minutes.',
      current_conditions: {
        wave_height: null,
        wave_height_unit: 'm',
        wind_speed_10m: null,
        wind_speed_10m_unit: 'km/h',
        wind_gusts_10m: null,
        weather_code: null,
        weather_label: null,
      },
      best_safe_window: null,
      data_available: false,
      partial_data: false,
      assessed_at: new Date().toISOString(),
      error: 'Both marine and weather APIs unavailable',
    };
  }

  const waveHeight = marineData.current?.wave_height;
  const windSpeed = weatherData.current?.wind_speed_10m;
  const weatherCode = weatherData.current?.weather_code;

  let level = computeSafetyLevel(waveHeight, windSpeed);

  if (DANGEROUS_WEATHER_CODES.has(Number(weatherCode))) {
    if (level === 'SAFE' || level === 'CAUTION') {
      level = 'DANGEROUS';
    }
  }

  const bestSafeWindow = findBestSafeWindow(marineData, weatherData);

  const response = {
    zone: marineData.zone,
    level,
    reason: buildReason(level, waveHeight, windSpeed, weatherCode),
    current_conditions: {
      wave_height: waveHeight,
      wave_height_unit: marineData.current?.wave_height_unit || 'm',
      wind_speed_10m: windSpeed,
      wind_speed_10m_unit: weatherData.current?.wind_speed_10m_unit || 'km/h',
      wind_gusts_10m: weatherData.current?.wind_gusts_10m,
      weather_code: weatherCode,
      weather_label: weatherData.current?.weather_label,
    },
    best_safe_window: bestSafeWindow,
    thresholds: thresholds.levels,
    assessed_at: new Date().toISOString(),
    data_cached: Boolean(marineData.cached && weatherData.cached),
  };

  // Add partial data info if applicable
  if (partialData && missing !== 'both') {
    response.partial_data = true;
    response.missing = missing;
  }

  return response;
}

module.exports = {
  assessZoneSafety,
  computeSafetyLevel,
  findBestSafeWindow,
};
