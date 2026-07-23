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
  if (w < 1.0) return "#10b981"; // Safe
  if (w < 2.0) return "#fbbf24"; // Caution
  if (w < 3.5) return "#f97316"; // Dangerous
  return "#ef4444"; // Do not go
}

export default function ForecastChart({ marine }) {
  const times = marine?.hourly?.time || [];
  const waveHeights = marine?.hourly?.wave_height || [];
  const data = buildDailySeries(times, waveHeights);

  const gradientId = "waveDarkGradient";

  // Customize Recharts Tooltip styling
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      return (
        <div className="bg-[#05142b]/95 border border-[rgba(56,189,248,0.2)] p-3 rounded-xl shadow-xl backdrop-blur-md">
          <p className="text-[11px] text-[var(--text-secondary)] font-semibold mb-1">Day: {label}</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: waveColor(val) }} />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Wave Height: <span style={{ color: waveColor(val) }}>{val} m</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[var(--bg-ocean-card)] p-5 shadow-lg shadow-[#020813] transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[rgba(56,189,248,0.06)] pb-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">
            7-Day Wave Forecast (daily max)
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Expected maximum swell wave height in meters
          </p>
        </div>
        <div className="text-[10px] uppercase font-semibold text-[var(--primary-cyan)] bg-sky-500/10 px-2.5 py-1 rounded-md border border-sky-500/15 self-start">
          Open-Meteo Marine Live
        </div>
      </div>

      <div className="h-64 mt-1">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 5, bottom: 0, left: -25 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(56, 189, 248, 0.05)" vertical={false} />
              
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: "var(--text-secondary)" }} 
                axisLine={false}
                tickLine={false}
              />
              
              <YAxis 
                tick={{ fontSize: 11, fill: "var(--text-secondary)" }} 
                axisLine={false}
                tickLine={false}
                unit="m" 
              />
              
              <Tooltip content={<CustomTooltip />} />

              {/* Safety Threshold Lines */}
              <ReferenceLine 
                y={1.0} 
                stroke="#fbbf24" 
                strokeDasharray="4 4" 
                label={{ value: "1.0m (Caution)", position: "top", fill: "#fbbf24", fontSize: 9, opacity: 0.6 }} 
              />
              <ReferenceLine 
                y={2.0} 
                stroke="#f97316" 
                strokeDasharray="4 4" 
                label={{ value: "2.0m (Dangerous)", position: "top", fill: "#f97316", fontSize: 9, opacity: 0.7 }} 
              />
              <ReferenceLine 
                y={3.5} 
                stroke="#ef4444" 
                strokeDasharray="4 4" 
                label={{ value: "3.5m (Do Not Go)", position: "top", fill: "#ef4444", fontSize: 9, opacity: 0.8 }} 
              />

              <Area
                type="monotone"
                dataKey="wave_height"
                stroke="#22d3ee"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle 
                      cx={cx} 
                      cy={cy} 
                      r={3.5} 
                      fill="var(--bg-ocean-card)" 
                      stroke={waveColor(payload.wave_height)} 
                      strokeWidth={2.5} 
                    />
                  );
                }}
                activeDot={{ r: 5, strokeWidth: 1, fill: "#22d3ee" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-secondary)]">
            Loading forecast chart...
          </div>
        )}
      </div>
    </div>
  );
}
