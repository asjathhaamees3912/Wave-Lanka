import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import BrandLogo from "@/components/BrandLogo";
import { getZoneById } from "@/lib/zones";
import { fetchZoneForecastData, fetchZoneLagData, postForecastPrediction } from "@/lib/marineApi";
import { computeSafety, getSafetyVerdict } from "@/lib/safety";

import SafetyBadge from "@/components/SafetyBadge";
import MetricCard from "@/components/MetricCard";
import WindCompass from "@/components/WindCompass";
import HourlyRow from "@/components/HourlyRow";
import WaveChart from "@/components/WaveChart";
import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";

const SAFETY_CLASS_STYLES = {
  SAFE: { color: "#22d96b", emoji: "🟢" },
  CAUTION: { color: "#f5c542", emoji: "🟡" },
  DANGEROUS: { color: "#f97316", emoji: "🟠" },
  DO_NOT_GO: { color: "#ef4444", emoji: "🔴" },
};

function getSafetyClassStyle(safetyClass) {
  return SAFETY_CLASS_STYLES[safetyClass] || { color: "#38bdf8", emoji: "🔵" };
}

export default function ForecastPage() {
  const router = useRouter();
  const { zone: zoneId } = router.query;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [safetyVerdict, setSafetyVerdict] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(null);

  const zone = getZoneById(zoneId);

  useEffect(() => {
    // Wait until router query is ready
    if (!router.isReady) return;

    if (!zoneId || !zone) {
      router.replace("/search");
      return;
    }

    let active = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchZoneForecastData(zone.lat, zone.lon);
        if (active) {
          setData(result);
          // fetch ML-first safety verdict for this zone (single fetch per zone load)
          try {
            const sv = await getSafetyVerdict(zoneId);
            if (active) setSafetyVerdict(sv);
          } catch (e) {
            console.warn("Failed to get safety verdict for zone", zoneId, e);
            if (active) {
              setSafetyVerdict({
                source: "unknown",
                level: "UNKNOWN",
                reason: null,
                data_available: false,
                partial_data: false,
              });
            }
          }

          // Fetch lag data and ML forecast only after current marine data is loaded
          setForecastLoading(true);
          setForecastError(null);
          try {
            // Lag is best-effort; AI forecast should still run if lag/CORS fails
            const lagData = (await fetchZoneLagData(zoneId)) || {};
            const marineHourly = result.marine?.hourly || {};
            const weatherCurrent = result.weather?.current || {};
            const currentIndex = (() => {
              const times = marineHourly.time || [];
              const currentTime = weatherCurrent.time || times[0] || null;
              if (!currentTime || times.length === 0) return 0;
              let bestIdx = 0;
              let bestDiff = Infinity;
              const currentMs = new Date(currentTime).getTime();
              times.forEach((time, idx) => {
                const delta = Math.abs(new Date(time).getTime() - currentMs);
                if (delta < bestDiff) {
                  bestDiff = delta;
                  bestIdx = idx;
                }
              });
              return bestIdx;
            })();

            const num = (v, fallback = null) => {
              const n = Number(v);
              return Number.isFinite(n) ? n : fallback;
            };

            const payload = {
              zone: zoneId,
              current_data: {
                wave_height: num(marineHourly.wave_height?.[currentIndex], 1.5),
                wave_period: num(marineHourly.wave_period?.[currentIndex], 5),
                swell_wave_height: num(marineHourly.swell_wave_height?.[currentIndex], 0.8),
                swell_wave_period: num(marineHourly.swell_wave_period?.[currentIndex], 6),
                wind_wave_height: num(marineHourly.wind_wave_height?.[currentIndex], 0),
                wind_speed: num(weatherCurrent.wind_speed_10m, 15),
                wind_gusts: num(weatherCurrent.wind_gusts_10m, 0),
                sea_surface_temperature: num(marineHourly.sea_surface_temperature?.[currentIndex], 28),
                weather_code: num(weatherCurrent.weather_code, 0),
              },
              lag_data: {
                wave_height_3h_ago: num(lagData.wave_height_3h_ago, num(marineHourly.wave_height?.[currentIndex], 1.5)),
                wave_height_6h_ago: num(lagData.wave_height_6h_ago, num(marineHourly.wave_height?.[currentIndex], 1.5)),
                wind_speed_3h_ago: num(lagData.wind_speed_3h_ago, num(weatherCurrent.wind_speed_10m, 15)),
                wind_speed_6h_ago: num(lagData.wind_speed_6h_ago, num(weatherCurrent.wind_speed_10m, 15)),
                swell_3h_ago: num(lagData.swell_3h_ago, num(marineHourly.swell_wave_height?.[currentIndex], 0.8)),
              },
            };

            const forecastResult = await postForecastPrediction(payload);
            if (active) setForecastData(forecastResult);
          } catch (e) {
            console.warn("Failed to load forecast data", e);
            if (active) {
              setForecastError("Unable to load AI forecast. Please try again later.");
            }
          } finally {
            if (active) setForecastLoading(false);
          }
        }
      } catch (err) {
        if (active) {
          setError("Failed to fetch live ocean conditions. Please check your network.");
          console.error(err);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [zoneId, zone, router]);

  // Retry handler for data unavailable state
  const handleRetry = async () => {
    setRetrying(true);
    try {
      const sv = await getSafetyVerdict(zoneId);
      setSafetyVerdict(sv);
    } catch (e) {
      console.warn("Retry failed:", e);
    } finally {
      setRetrying(false);
    }
  };

  // Compute safety assessment from current conditions
  const safetyAssessment = (() => {
    if (!data) return null;

    // Prefer explicit safety verdict level if available (ml or rules)
    const currentWave = data.marine?.current?.wave_height ?? data.marine?.hourly?.wave_height?.[0];
    const currentWind = data.weather?.current?.wind_speed_10m;

    if (safetyVerdict && safetyVerdict.level) {
      return { level: safetyVerdict.level };
    }

    return computeSafety(currentWave, currentWind);
  })();

  const currentConditions = (() => {
    if (!data) return null;
    // Use backend-provided current snapshot when available to ensure consistency
    const marineCurrent = data.marine?.current || {};
    const weatherCurrent = data.weather?.current || {};

    return {
      waveHeight: marineCurrent.wave_height ?? data.marine?.hourly?.wave_height?.[0],
      windSpeed: weatherCurrent.wind_speed_10m ?? null,
      windGusts: weatherCurrent.wind_gusts_10m ?? null,
      windDirection: weatherCurrent.wind_direction_10m ?? null,
      swellHeight: marineCurrent.swell_wave_height ?? data.marine?.hourly?.swell_wave_height?.[0],
      swellPeriod: marineCurrent.swell_wave_period ?? data.marine?.hourly?.swell_wave_period?.[0],
      swellDirection: marineCurrent.swell_wave_direction ?? data.marine?.hourly?.swell_wave_direction?.[0],
      seaTemperature: marineCurrent.sea_surface_temperature ?? data.marine?.hourly?.sea_surface_temperature?.[0]
    };
  })();

  // Formatting date/time
  const lastUpdated = data?.weather?.current?.time
    ? new Date(data.weather.current.time).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    })
    : null;

  const formatSriLankaTime = (date) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Colombo",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  const formatSriLankaTimeShort = (date) => {
    return formatSriLankaTime(date).replace(":00", "");
  };

  const getSriLankaHour = (date) => {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Colombo",
        hour: "numeric",
        hour12: false,
      }).format(date)
    );
  };

  const getForecastCardLabel = (index) => {
    const currentHour = getSriLankaHour(new Date());
    if (index === 0) {
      if (currentHour < 12) return "This afternoon";
      if (currentHour < 18) return "This evening";
      return "Tonight";
    }
    if (index === 1) {
      return currentHour < 12 ? "Tonight" : "Tomorrow morning";
    }
    return "Tomorrow";
  };

  const forecastTimes = {
    time6h: new Date(Date.now() + 6 * 60 * 60 * 1000),
    time12h: new Date(Date.now() + 12 * 60 * 60 * 1000),
    time24h: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  const forecastTimeLabels = {
    in_6h: `Around ${formatSriLankaTime(forecastTimes.time6h)}`,
    in_12h: `Around ${formatSriLankaTime(forecastTimes.time12h)}`,
    in_24h: `Around ${formatSriLankaTime(forecastTimes.time24h)}${getSriLankaHour(forecastTimes.time24h) < getSriLankaHour(new Date()) ? " tomorrow" : ""}`,
  };

  const segmentSafetyLabel = (safetyClass) => {
    const normalized = String(safetyClass || "").trim().replace(/_/g, " ").toUpperCase();
    if (normalized === "SAFE") return "Safe";
    if (normalized === "CAUTION") return "Caution";
    if (normalized === "DANGEROUS") return "Dangerous";
    if (normalized.includes("DO NOT")) return "Do Not Go";
    return normalized;
  };

  const trendText = {
    DETERIORATING: "Conditions are expected to worsen",
    IMPROVING: "Conditions are expected to improve",
    STABLE: "Conditions are expected to remain stable",
  };

  const forecastAdvice = {
    SAFE: "Conditions are suitable for sea activities",
    CAUTION: "Suitable for experienced mariners only",
    DANGEROUS: "Small vessels should remain in harbour",
    DO_NOT_GO: "All vessels advised to stay in port",
    "DO NOT GO OUT": "All vessels advised to stay in port",
  };

  const getSafeWindowInfo = (safeWindow) => {
    if (!safeWindow || safeWindow.startsWith("No safe window")) {
      return {
        isSafe: false,
        title: "No safe window forecast in the next 24 hours.",
        detail: "Check again tomorrow.",
      };
    }
    const match = safeWindow.match(/approximately\s+(\d+)\s+hours/i);
    const hours = match ? Number(match[1]) : null;
    const target = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;
    return {
      isSafe: true,
      title: "Recommended departure window:",
      detail: target ? `${formatSriLankaTime(target)}${hours === 24 ? " tomorrow" : ""}` : "Check again tomorrow.",
    };
  };

  const forecastSafeWindow = forecastData ? getSafeWindowInfo(forecastData.safe_window) : null;

  function buildAdvisoryText(safetyLevel) {
    const texts = {
      SAFE: "Conditions are suitable for sea activities",
      CAUTION: "Suitable for experienced mariners only",
      DANGEROUS: "Small vessels should remain in harbour",
      DO_NOT_GO: "All vessels advised to stay in port",
      "DO NOT GO OUT": "All vessels advised to stay in port",
    };
    return texts[safetyLevel] ?? "Use caution and monitor local conditions closely";
  }

  const advisoryText = buildAdvisoryText(safetyAssessment?.level);

  const shorelineGuide = useMemo(() => {
    if (!safetyAssessment || !currentConditions) return null;

    const wave = currentConditions.waveHeight ?? 0;
    const wind = currentConditions.windSpeed ?? 0;
    const swell = currentConditions.swellHeight ?? 0;
    const level = safetyAssessment.level;

    const ripRisk =
      wave >= 2.0 || swell >= 1.5 ? "High" : wave >= 1.0 || swell >= 0.8 ? "Moderate" : "Low";
    const rockRisk =
      wave >= 1.5 ? "High" : wave >= 0.8 ? "Moderate" : "Low";
    const swimRisk =
      level === "DO NOT GO OUT" || level === "DANGEROUS"
        ? "Avoid"
        : level === "CAUTION"
        ? "Not advised"
        : "Caution advised";

    const riskColor = (risk) => {
      if (risk === "High" || risk === "Avoid") return "text-[var(--donotgo)]";
      if (risk === "Moderate" || risk === "Not advised") return "text-[var(--caution)]";
      return "text-[var(--safe)]";
    };

    const tipsByLevel = {
      SAFE: [
        "Swimming near breakwaters is generally okay — still keep 15m clearance.",
        "Watch for sudden wave sets every 10–15 minutes on open beaches.",
        "Inform someone ashore before entering the water.",
      ],
      CAUTION: [
        "Rip currents likely near rocky outcrops — swim parallel to shore if caught.",
        "Do not stand on wet rocks — sudden backwash can sweep you into the surf.",
        "Small craft should launch only from sheltered bays today.",
      ],
      DANGEROUS: [
        "Stay off rocks and breakwaters — waves can sweep over without warning.",
        "No swimming or wading in the surf zone until conditions improve.",
        "Fishing from shore is not recommended — relocate to a harbour.",
      ],
      "DO NOT GO OUT": [
        "Remain inland — storm surf can reach above normal tide lines.",
        "Do not approach the shoreline for photos or fishing.",
        "Wait for official Met Dept all-clear before returning to the coast.",
      ],
    };

    return {
      indicators: [
        { label: "Rip current risk", value: ripRisk, color: riskColor(ripRisk) },
        { label: "Rocky shore hazard", value: rockRisk, color: riskColor(rockRisk) },
        { label: "Shore swimming", value: swimRisk, color: riskColor(swimRisk) },
      ],
      tips: tipsByLevel[level] || tipsByLevel.CAUTION,
    };
  }, [safetyAssessment, currentConditions]);

  return (
    <div className="min-h-screen text-[var(--text)] pb-16 relative">
      {/* Background SVG swells */}
      <div className="wave-container opacity-30">
        <div className="wave-swell wave-1" />
        <div className="wave-swell wave-2" />
        <div className="wave-swell wave-3" />
      </div>

      <div className="mx-auto w-full max-w-[860px] px-4 py-6 md:py-10 z-10 relative">
        {/* Navigation Bar */}
        <nav className="flex items-center justify-between border-b border-[var(--border-10)] pb-4 mb-6 z-[1011] relative">
          <button
            onClick={() => router.back()}
            className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1.5"
          >
            <span>←</span> Back to Search
          </button>

          <div className="inline-flex items-center gap-3 text-[var(--text)]">
            <BrandLogo className="h-10 w-10 drop-shadow-[0_0_6px_rgba(14,165,233,0.15)]" />
            <span
              className="text-lg font-extrabold tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              WaveLanka
            </span>
          </div>

          <ThemeToggle />
        </nav>


        {loading ? (
          /* Loading Skeleton */
          <div className="space-y-6 animate-pulse">
            {/* Hero skeleton */}
            <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-6 h-28 flex flex-col justify-between" />
            {/* Grid skeleton */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl h-24" />
              <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl h-24" />
              <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl h-24" />
              <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl h-24" />
            </div>
            {/* Chart skeleton */}
            <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl h-64" />
          </div>
        ) : error ? (
          /* Error display */
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-8 text-center shadow-lg">
            <span className="text-3xl">⚠️</span>
            <h2 className="text-lg font-bold text-red-400 mt-2">Unable to load data</h2>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">{error}</p>
            <button
              onClick={() => router.reload()}
              className="mt-5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-5 py-2 text-xs font-bold text-red-300 transition-all"
            >
              Try again
            </button>
          </div>
        ) : (
          /* Content section */
          <div className="space-y-6">
            {/* Hero Section */}
            <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative overflow-hidden">
              <div className="absolute -top-12 -right-12 h-28 w-28 rounded-full bg-sky-500/5 blur-2xl pointer-events-none" />

              <div>
                <span className="text-[9px] font-extrabold uppercase text-[var(--foam)] tracking-wider">
                  Current sea conditions
                </span>
                <h1 className="text-2xl font-black text-[var(--text)] mt-1">
                  {zone?.name}
                </h1>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-semibold">
                  {zone?.region}
                </p>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5 self-start sm:self-center">
                <div className="flex flex-col items-end gap-1">
                  <SafetyBadge 
                    level={safetyAssessment?.level} 
                    confidence={safetyVerdict?.confidence}
                    source={safetyVerdict?.source}
                    dataAvailable={safetyVerdict?.data_available !== false}
                  />

                  {lastUpdated && (
                    <span className="text-[9px] text-[var(--text-muted)] font-medium">
                      Updated: {lastUpdated}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* State 3: Partial Data Warning */}
            {safetyVerdict?.partial_data && safetyVerdict?.data_available !== false ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">⚠️</span>
                  <div className="text-xs text-amber-200">
                    <div className="font-semibold mb-1">Partial data — {safetyVerdict?.missing} data unavailable</div>
                    <p className="text-amber-100/80">Safety assessment is based on limited data. Consider additional sources for critical decisions.</p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* State 4: Data Unavailable */}
            {safetyVerdict?.data_available === false ? (
              <div className="bg-gray-500/10 border border-gray-500/30 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-300 mb-2">🌐 Live Data Unavailable</h3>
                    <p className="text-xs text-gray-400 leading-relaxed mb-3">
                      Live marine data is temporarily unavailable for this zone. This may be due to a network issue or the Open-Meteo API being momentarily down.
                    </p>
                    <div className="text-xs text-gray-400 space-y-1">
                      <div>Try one of these:</div>
                      <ul className="list-disc list-inside pl-2 text-gray-400/80">
                        <li>Refresh the page</li>
                        <li>Check back in 5 minutes</li>
                        <li>Try a different zone</li>
                      </ul>
                    </div>
                  </div>
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="self-start rounded-xl bg-gray-500/20 hover:bg-gray-500/30 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-500/40 px-4 py-2 text-xs font-bold text-gray-200 transition-all"
                  >
                    {retrying ? "Retrying..." : "🔄 Retry Now"}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Conditions Grid */}
            <div className="grid grid-cols-2 gap-4">
              <MetricCard
                label="Wave Height"
                value={currentConditions?.waveHeight != null ? `${currentConditions.waveHeight.toFixed(2)}` : "—"}
                unit="m"
                icon="🌊"
                subtext="Wave Height"
              />
              <MetricCard
                label="Wind Speed"
                value={currentConditions?.windSpeed != null ? `${currentConditions.windSpeed.toFixed(1)}` : "—"}
                unit="km/h"
                icon="💨"
                subtext={`Gusts up to ${currentConditions?.windGusts?.toFixed(1) || "—"} km/h`}
              />
              <MetricCard
                label="Swell Height"
                value={currentConditions?.swellHeight != null ? `${currentConditions.swellHeight.toFixed(2)}` : "—"}
                unit="m"
                icon="〰️"
                subtext={`Period: ${currentConditions?.swellPeriod?.toFixed(0) || "—"} seconds`}
              />
              <MetricCard
                label="Sea Temperature"
                value={currentConditions?.seaTemperature != null ? `${currentConditions.seaTemperature.toFixed(1)}` : "—"}
                unit="°C"
                icon="🌡️"
                subtext="Sea temperature"
              />
            </div>

            {/* Safety Advisory Banner */}
            <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-5 backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-2">
                <span className="text-base">📢</span>
                <h3 className="text-xs uppercase font-extrabold tracking-widest text-[var(--text-muted)]">
                  Safety advice
                </h3>
              </div>
              <p className="mt-3 text-xs text-[var(--text)] leading-relaxed font-semibold">
                {advisoryText}
              </p>
            </div>

            {/* Section B: AI Safety Forecast */}
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-bold text-[var(--text)]">AI Sea Forecast</div>
                  <p className="text-[11px] text-[var(--text-muted)] max-w-2xl leading-snug">
                    Predicted conditions for the next 24 hours
                  </p>
                </div>
              </div>

              {forecastLoading ? (
                <div className="grid gap-4">
                  <div className="h-24 rounded-2xl bg-[var(--ocean-glass)] border border-[var(--border-10)] animate-pulse" />
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-2xl border border-[var(--border-10)] bg-[rgba(255,255,255,0.04)] p-4 h-40 animate-pulse" />
                    ))}
                  </div>
                  <div className="h-20 rounded-2xl border border-sky-500/20 bg-[rgba(56,189,248,0.05)] animate-pulse"></div>
                  <div className="h-6 rounded-full bg-[var(--ocean-glass)] animate-pulse"></div>
                </div>
              ) : forecastError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-100">
                  {forecastError}
                </div>
              ) : forecastData ? (
                <div className="space-y-4">
                  <div className={`rounded-2xl p-4 ${forecastData.trend === 'DETERIORATING' ? 'bg-red-500/15 border border-red-500/20' : forecastData.trend === 'IMPROVING' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-sky-500/10 border border-sky-500/20'}`}>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {trendText[forecastData.trend] ?? "Sea conditions are changing."}
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    {['in_6h', 'in_12h', 'in_24h'].map((key, index) => {
                      const item = forecastData.predictions[key];
                      const style = getSafetyClassStyle(item.safety_class);
                      return (
                        <div key={key} className="rounded-2xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] p-4 shadow-[0_8px_30px_-24px_rgba(0,0,0,0.45)]" style={{ borderLeft: `3px solid ${style.color}` }}>
                          <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-2">
                            {getForecastCardLabel(index)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {forecastTimeLabels[key]}
                          </div>
                          <div className="mt-4 text-xl font-black tracking-tight">
                            {style.emoji} {segmentSafetyLabel(item.safety_class)}
                          </div>
                          <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                            {forecastAdvice[item.safety_class] ?? "Use caution and watch local conditions closely"}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`rounded-2xl border p-4 ${forecastSafeWindow?.isSafe ? 'border-[rgba(22,163,74,0.22)] bg-[rgba(22,163,74,0.08)]' : 'border-[rgba(185,28,28,0.22)] bg-[rgba(185,28,28,0.08)]'}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>{forecastSafeWindow?.isSafe ? '✅' : '⛔'}</span>
                        <span>{forecastSafeWindow?.title}</span>
                      </div>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-[var(--text)]">
                      {forecastSafeWindow?.detail}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-10)] bg-[var(--ocean-glass)] p-4 mt-3">
                    <div className="text-[0.62rem] uppercase tracking-[2px] text-[var(--text-muted)] mb-3">
                      24-Hour Outlook
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 text-[0.68rem] text-[var(--text-muted)]">
                        <div className="text-center">Now</div>
                        <div className="text-center">{formatSriLankaTimeShort(forecastTimes.time6h)}</div>
                        <div className="text-center">{formatSriLankaTimeShort(forecastTimes.time12h)}</div>
                        <div className="text-center">{formatSriLankaTimeShort(forecastTimes.time24h)}</div>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-x-0 top-0 flex justify-between" style={{ top: '-6px' }}>
                          <div className="w-px h-6" style={{ backgroundColor: 'var(--text-muted)' }} />
                          <div className="w-px h-6" style={{ backgroundColor: 'var(--text-muted)' }} style={{ left: '33.333%' }} />
                          <div className="w-px h-6" style={{ backgroundColor: 'var(--text-muted)' }} style={{ left: '66.666%' }} />
                          <div className="w-px h-6" style={{ backgroundColor: 'var(--text-muted)' }} />
                        </div>
                        <div className="h-[20px] rounded-[5px] overflow-hidden">
                          <div className="flex h-[10px] rounded-[5px] overflow-hidden">
                            <div className="w-1/3" style={{ backgroundColor: getSafetyClassStyle(safetyAssessment?.level || forecastData.predictions.in_6h.safety_class).color }} />
                            <div className="w-1/3" style={{ backgroundColor: getSafetyClassStyle(forecastData.predictions.in_6h.safety_class).color }} />
                            <div className="w-1/3" style={{ backgroundColor: getSafetyClassStyle(forecastData.predictions.in_12h.safety_class).color }} />
                          </div>
                          <div className="absolute inset-x-0 top-0 h-[14px] pointer-events-none">
                            <div className="absolute left-[33.333%] w-px h-[14px]" style={{ backgroundColor: 'var(--text-muted)' }} />
                            <div className="absolute left-[66.666%] w-px h-[14px]" style={{ backgroundColor: 'var(--text-muted)' }} />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-0 text-[0.65rem] font-semibold">
                        <div className="text-center" style={{ color: getSafetyClassStyle(safetyAssessment?.level || forecastData.predictions.in_6h.safety_class).color }}>
                          {segmentSafetyLabel(safetyAssessment?.level || forecastData.predictions.in_6h.safety_class)}
                        </div>
                        <div className="text-center" style={{ color: getSafetyClassStyle(forecastData.predictions.in_6h.safety_class).color }}>
                          {segmentSafetyLabel(forecastData.predictions.in_6h.safety_class)}
                        </div>
                        <div className="text-center" style={{ color: getSafetyClassStyle(forecastData.predictions.in_12h.safety_class).color }}>
                          {segmentSafetyLabel(forecastData.predictions.in_12h.safety_class)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* 7-Day Forecast Chart */}
            <WaveChart daily={data.marine?.daily} />

            {/* Hourly Row */}
            <HourlyRow
              times={data.marine?.hourly?.time}
              waveHeights={data.marine?.hourly?.wave_height}
            />

            {/* Detailed Wind & Swell Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WindCompass degrees={currentConditions?.windDirection} />

              <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-5 backdrop-blur-md shadow-lg flex flex-col justify-between">
                <div>
                  <h4 className="text-xs uppercase font-extrabold tracking-widest text-[var(--text-muted)] border-b border-[var(--border-5)] pb-2 mb-3">
                    Wave details
                  </h4>

                  <div className="space-y-2 mt-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-[var(--text-muted)]">Swell Height:</span>
                      <span className="text-[var(--text)]">{currentConditions?.swellHeight != null ? `${currentConditions.swellHeight.toFixed(2)} m` : "—"}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-[var(--text-muted)]">Swell Period:</span>
                      <span className="text-[var(--text)]">{currentConditions?.swellPeriod != null ? `${currentConditions.swellPeriod.toFixed(0)} seconds` : "—"}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-[var(--text-muted)]">Swell Direction:</span>
                      <span className="text-[var(--text)]">{currentConditions?.swellDirection != null ? `${currentConditions.swellDirection}°` : "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="text-[9px] text-[var(--text-muted)] font-medium border-t border-[var(--border-5)] pt-2 mt-4">
                  These values help show how strong the waves and surf are.
                </div>
              </div>
            </div>

            {/* Visual Shoreline Guide Card */}
            <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl overflow-hidden backdrop-blur-md shadow-lg grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
              <div className="md:col-span-5 flex justify-center p-4 md:p-5">
                <div className="w-full max-w-[260px]">
                  <img
                    src="/coastal-view.jpg"
                    alt="Sri Lanka Coastline"
                    className="rounded-xl w-full h-auto object-cover shadow-md border border-[var(--border-5)]"
                  />
                </div>
              </div>
              <div className="md:col-span-7 p-5 md:p-6 md:pl-0 flex flex-col gap-4">
                <div>
                  <span className="text-[9px] font-extrabold uppercase text-sky-400 tracking-wider">
                    Coastal safety tips
                  </span>
                  <h4 className="text-lg font-bold text-[var(--text)] mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Coastal hazards
                  </h4>
                  <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                    Typical Sri Lankan coastline with sandy shores, rocky breakwaters, and crashing swells.
                    Rocky shorelines produce sudden backwash and strong undercurrents — stay clear during high surf.
                  </p>
                </div>

                {shorelineGuide && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {shorelineGuide.indicators.map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg bg-[var(--ocean-deep)]/30 border border-[var(--border-5)] px-2 py-2.5 text-center"
                        >
                          <div className="text-[8px] uppercase font-bold text-[var(--text-muted)] leading-tight">
                            {item.label}
                          </div>
                          <div className={`text-xs font-extrabold mt-1 ${item.color}`}>
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                        Know the signs — {zone?.name?.split(" (")[0] || "this zone"}
                      </div>
                      <ul className="space-y-1.5">
                        {shorelineGuide.tips.map((tip) => (
                          <li
                            key={tip}
                            className="flex items-start gap-2 text-[10px] text-[var(--text)] leading-relaxed"
                          >
                            <span className="text-sky-400 mt-0.5 shrink-0">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                <div className="pt-3 border-t border-[var(--border-5)] flex items-center gap-2.5 text-[10px] text-[var(--text-muted)] font-medium">
                  <span className="text-xs">⚠️</span>
                  <span>Safety recommendation: Maintain a distance of at least 15m from rocky breakwaters during swell warnings.</span>
                </div>
              </div>
            </div>

            {/* Bottom Button */}
            <div className="text-center pt-4">
              <button
                onClick={() => router.push("/search")}
                className="rounded-xl border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] px-8 py-3 text-xs font-bold text-[var(--text)] transition-all shadow-md"
              >
                Check another zone
              </button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
