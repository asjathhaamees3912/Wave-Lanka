import axios from "axios";

const cleanUrl = (url) => {
  if (!url) return "";
  let cleaned = url.replace(/['"]/g, "").trim();
  if (cleaned && !cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    cleaned = "https://" + cleaned;
  }
  return cleaned;
};

const BACKEND_URL = cleanUrl(process.env.NEXT_PUBLIC_BACKEND_URL) || "http://localhost:5000";
const AI_URL = cleanUrl(process.env.NEXT_PUBLIC_AI_URL) || "http://localhost:8000";

export async function fetchZoneForecastData(lat, lon) {
  const marineUrl = "https://marine-api.open-meteo.com/v1/marine";
  const weatherUrl = "https://api.open-meteo.com/v1/forecast";

  const marineParams = {
    latitude: lat,
    longitude: lon,
    hourly: [
      "wave_height",
      "wave_period",
      "swell_wave_height",
      "swell_wave_period",
      "swell_wave_direction",
      "wind_wave_height",
      "sea_surface_temperature"
    ].join(","),
    daily: [
      "wave_height_max",
      "wind_wave_height_max",
      "swell_wave_height_max"
    ].join(","),
    forecast_days: 7,
    timezone: "Asia/Colombo"
  };

  const weatherParams = {
    latitude: lat,
    longitude: lon,
    current: [
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "weather_code",
      "precipitation"
    ].join(","),
    timezone: "Asia/Colombo"
  };

  const [marineResp, weatherResp] = await Promise.all([
    axios.get(marineUrl, { params: marineParams }),
    axios.get(weatherUrl, { params: weatherParams })
  ]);

  return {
    marine: marineResp.data,
    weather: weatherResp.data
  };
}

export async function fetchZoneLagData(zoneId) {
  const url = `${BACKEND_URL}/api/marine/${zoneId}/lag`;
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.data?.data || {};
  } catch (err) {
    console.warn("fetchZoneLagData failed, continuing without lag:", err.message);
    return {};
  }
}

export async function postForecastPrediction(payload) {
  const url = `${AI_URL}/predict/forecast`;
  // Strip null/undefined so FastAPI Dict[str, float] validation does not 422
  const sanitize = (obj = {}) =>
    Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
        .map(([k, v]) => [k, Number(v)])
    );
  const body = {
    ...payload,
    current_data: sanitize(payload.current_data),
    lag_data: sanitize(payload.lag_data),
  };
  const response = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 20000,
  });
  return response.data;
}
