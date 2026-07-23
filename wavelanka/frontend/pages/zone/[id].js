import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import SafetyBadge from "@/components/SafetyBadge";
import ForecastChart from "@/components/ForecastChart";
import Footer from "@/components/Footer";

export default function ZoneDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const backendBase =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  const [zones, setZones] = useState([]);
  const [marine, setMarine] = useState(null);
  const [weather, setWeather] = useState(null);
  const [safety, setSafety] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const zone = useMemo(() => zones.find((z) => z.id === id), [zones, id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [zonesResp, marineResp, weatherResp, safetyResp] =
          await Promise.all([
            axios.get(`${backendBase}/api/zones`),
            axios.get(`${backendBase}/api/marine/${id}`),
            axios.get(`${backendBase}/api/weather/${id}`),
            axios.get(`${backendBase}/api/safety/${id}`)
          ]);

        if (cancelled) return;
        setZones(zonesResp.data.data || []);
        setMarine(marineResp.data.data);
        setWeather(weatherResp.data.data);
        setSafety(safetyResp.data.data);
      } catch (err) {
        if (cancelled) return;
        setError(err?.response?.data?.message || err?.message || "Failed to load zone.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, backendBase]);

  const lastUpdated = safety?.assessed_at
    ? new Date(safety.assessed_at).toLocaleString()
    : null;

  return (
    <div className="min-h-screen pb-12 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 border-b border-[rgba(56,189,248,0.12)] pb-4 bg-[var(--bg-ocean-card)]/40 p-5 rounded-2xl">
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--primary-cyan)] tracking-wider">Zone Profile</div>
            <h1 className="text-2xl font-black text-white mt-1">
              {zone?.name || id} Sea Zone
            </h1>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1 font-medium">
              {lastUpdated ? `Last assessed: ${lastUpdated}` : "Assessment pending..."}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-[rgba(56,189,248,0.15)] bg-slate-900/50 hover:bg-slate-800/80 px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] transition-all"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4">
            <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-secondary)] font-medium">Retrieving zone meteorological data...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center max-w-xl mx-auto shadow-lg">
            <span className="text-3xl">⚠️</span>
            <h2 className="text-lg font-bold text-red-400 mt-2">Error Loading Zone</h2>
            <p className="text-xs text-slate-400 mt-2">{error}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-5 py-2.5 text-xs font-bold text-red-300 transition-all"
            >
              Back to Safety Map
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ForecastChart marine={marine} />
              </div>

              {/* Quick Summary Card */}
              <div className="rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[var(--bg-ocean-card)] p-5 shadow-lg shadow-[#020813] flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3 border-b border-[rgba(56,189,248,0.06)] pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        Current Safety Status
                      </h3>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                        Based on marine & weather models
                      </p>
                    </div>
                    <SafetyBadge level={safety?.level} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="rounded-xl border border-[rgba(56,189,248,0.06)] bg-[#030d1d]/60 p-3">
                      <span className="text-[10px] text-[var(--text-secondary)] font-medium">Wave height</span>
                      <div className="text-xl font-extrabold text-[var(--primary-cyan)] mt-1">
                        {safety?.current_conditions?.wave_height != null
                          ? `${Number(safety.current_conditions.wave_height).toFixed(2)} m`
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[rgba(56,189,248,0.06)] bg-[#030d1d]/60 p-3">
                      <span className="text-[10px] text-[var(--text-secondary)] font-medium">Wind speed</span>
                      <div className="text-xl font-extrabold text-[var(--primary-cyan)] mt-1">
                        {safety?.current_conditions?.wind_speed_10m != null
                          ? `${Number(safety.current_conditions.wind_speed_10m).toFixed(1)} km/h`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-[rgba(56,189,248,0.06)] bg-[#030d1d]/30 p-4">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Advisory Summary</span>
                    <p className="mt-2 text-xs text-slate-300 leading-relaxed font-medium">
                      {safety?.reason || "—"}
                    </p>
                  </div>
                </div>

                {safety?.best_safe_window?.message && (
                  <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider mb-1">
                      Optimal Launch Window
                    </div>
                    <p className="text-xs text-slate-200 font-medium leading-relaxed">
                      {safety.best_safe_window.message}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Raw JSON Inspect */}
            <div className="rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[var(--bg-ocean-card)] p-5 shadow-lg shadow-[#020813]">
              <div className="border-b border-[rgba(56,189,248,0.06)] pb-3 mb-4">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Telemetry Telemetry Data</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Raw Open-Meteo current condition reports</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-2">Marine Forecast API Payload</span>
                  <pre className="rounded-xl bg-[#010815] border border-[rgba(56,189,248,0.08)] text-cyan-400 p-3 text-xs overflow-auto h-48 max-w-full">
{JSON.stringify({ marine_current: marine?.current }, null, 2)}
                  </pre>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-2">Weather Forecast API Payload</span>
                  <pre className="rounded-xl bg-[#010815] border border-[rgba(56,189,248,0.08)] text-cyan-400 p-3 text-xs overflow-auto h-48 max-w-full">
{JSON.stringify({ weather_current: weather?.current }, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
