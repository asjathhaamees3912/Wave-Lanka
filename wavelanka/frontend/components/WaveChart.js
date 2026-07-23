import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export default function WaveChart({ daily }) {
  const times = daily?.time || [];
  const waveHeightsMax = daily?.wave_height_max || [];

  // Parse days into label and value format
  const data = times.map((day, idx) => {
    let weekday = day;
    try {
      const d = new Date(day);
      weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    } catch (e) {
      console.error(e);
    }
    return {
      dayName: weekday,
      height: waveHeightsMax[idx] != null ? Number(waveHeightsMax[idx].toFixed(2)) : 0
    };
  });

  const getWaveColor = (h) => {
    if (h < 1.0) return "#22d96b";
    if (h < 2.0) return "#f5c542";
    if (h < 3.5) return "#f97316";
    return "#ef4444";
  };

  const maxVal = Math.max(...data.map(d => d.height), 4.0);

  // Custom tooltips matching dark ocean design
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      return (
        <div className="bg-[var(--ocean-deep)]/95 border border-[var(--border-10)] p-3 rounded-xl shadow-xl backdrop-blur-md">
          <p className="text-[10px] text-[var(--text-muted)] font-bold mb-1">Max Wave Height</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getWaveColor(val) }} />
            <p className="text-sm font-extrabold text-[var(--text)]">
              {val} m
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-5 backdrop-blur-md shadow-lg flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[var(--border-5)] pb-2 mb-1">
        <div>
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-[var(--text-muted)]">
            7-Day Wave Forecast (Daily Max)
          </h3>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-medium">
            Projected daily peak swell height
          </p>
        </div>
        <span className="text-[9px] uppercase tracking-wider font-extrabold text-[var(--foam)] bg-[var(--foam)]/10 px-2 py-0.5 rounded border border-[var(--foam)]/15">
          Marine Models
        </span>
      </div>

      <div className="h-64 mt-2">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 15, right: 5, bottom: 0, left: -25 }}>
              <defs>
                <linearGradient id="waveHeightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--foam)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--foam)" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--text-muted)" strokeOpacity={0.15} vertical={false} />
              
              <XAxis 
                dataKey="dayName" 
                tick={{ fontSize: 10, fill: "var(--text-muted)" }} 
                axisLine={false}
                tickLine={false}
              />
              
              <YAxis 
                tick={{ fontSize: 10, fill: "var(--text-muted)" }} 
                axisLine={false}
                tickLine={false}
                domain={[0, Math.ceil(maxVal + 0.5)]}
                unit="m" 
              />
              
              <Tooltip content={<CustomTooltip />} />

              {/* Shaded Safety Bands */}
              <ReferenceArea y1={0} y2={1.0} fill="#22d96b" fillOpacity={0.03} />
              <ReferenceArea y1={1.0} y2={2.0} fill="#f5c542" fillOpacity={0.03} />
              <ReferenceArea y1={2.0} y2={3.5} fill="#f97316" fillOpacity={0.03} />
              <ReferenceArea y1={3.5} y2={Math.ceil(maxVal + 1)} fill="#ef4444" fillOpacity={0.03} />

              {/* Safety Lines */}
              <ReferenceLine 
                y={1.0} 
                stroke="#f5c542" 
                strokeDasharray="4 4" 
                strokeWidth={1}
                label={{ value: "1.0m (Caution)", position: "top", fill: "#f5c542", fontSize: 8, opacity: 0.5 }} 
              />
              <ReferenceLine 
                y={2.0} 
                stroke="#f97316" 
                strokeDasharray="4 4" 
                strokeWidth={1}
                label={{ value: "2.0m (Dangerous)", position: "top", fill: "#f97316", fontSize: 8, opacity: 0.6 }} 
              />
              <ReferenceLine 
                y={3.5} 
                stroke="#ef4444" 
                strokeDasharray="4 4" 
                strokeWidth={1}
                label={{ value: "3.5m (Do Not Go)", position: "top", fill: "#ef4444", fontSize: 8, opacity: 0.7 }} 
              />

              <Area
                type="monotone"
                dataKey="height"
                stroke="var(--foam)"
                strokeWidth={2}
                fill="url(#waveHeightGrad)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle 
                      cx={cx} 
                      cy={cy} 
                      r={4} 
                      fill="var(--ocean-card)" 
                      stroke={getWaveColor(payload.height)} 
                      strokeWidth={2} 
                    />
                  );
                }}
                activeDot={{ r: 5, strokeWidth: 1, fill: "var(--foam)" }}
              >
                <LabelList 
                  dataKey="height" 
                  position="top" 
                  offset={10}
                  fill="var(--text)" 
                  fontSize={9} 
                  fontWeight="bold"
                  formatter={(v) => `${v}m`}
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
            Loading forecast chart...
          </div>
        )}
      </div>
    </div>
  );
}
