import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

function dayLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short" });
  } catch {
    return iso;
  }
}

function buildDailySeries(times = [], waveHeights = []) {
  const byDay = new Map();
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const v = waveHeights[i];
    if (v == null) continue;
    const day = t.slice(0, 10);
    const prev = byDay.get(day);
    byDay.set(day, prev == null ? v : Math.max(prev, v));
  }

  const days = [...byDay.keys()].sort();
  return days.slice(0, 7).map((day) => ({
    day,
    label: dayLabel(day),
    wave_height: Number(byDay.get(day).toFixed(2))
  }));
}

function waveColor(w) {
  if (w < 1.0) return "#22c55e";
  if (w < 2.0) return "#eab308";
  if (w < 3.5) return "#f97316";
  return "#ef4444";
}

export default function WaveForecastChart({ marine }) {
  const times = marine?.hourly?.time || [];
  const waveHeights = marine?.hourly?.wave_height || [];
  const data = buildDailySeries(times, waveHeights);

  const gradientId = "waveGradient";

  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur border border-slate-200 p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-base font-semibold text-slate-900">
          7-day Wave Height (daily max)
        </div>
        <div className="text-xs text-slate-500">
          Source: Open-Meteo Marine
        </div>
      </div>

      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                {data.length ? (
                  <>
                    <stop offset="0%" stopColor={waveColor(Math.max(...data.map((d) => d.wave_height)))} stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity={0.05} />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.05} />
                  </>
                )}
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit="m" />
            <Tooltip
              formatter={(v) => [`${v} m`, "Wave height"]}
              labelFormatter={(l) => `Day: ${l}`}
            />

            <ReferenceLine y={1.0} stroke="#eab308" strokeDasharray="6 4" label={{ value: "1.0m", position: "right", fill: "#a16207", fontSize: 11 }} />
            <ReferenceLine y={2.0} stroke="#f97316" strokeDasharray="6 4" label={{ value: "2.0m", position: "right", fill: "#9a3412", fontSize: 11 }} />
            <ReferenceLine y={3.5} stroke="#ef4444" strokeDasharray="6 4" label={{ value: "3.5m", position: "right", fill: "#991b1b", fontSize: 11 }} />

            <Area
              type="monotone"
              dataKey="wave_height"
              stroke="#0f172a"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 3, strokeWidth: 1, fill: "#0f172a" }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

