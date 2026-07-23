function formatHour(timeStr) {
  try {
    const d = new Date(timeStr);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return timeStr;
  }
}

function getIndicatorColor(h) {
  if (h < 1.0) return "#22d96b"; // Safe
  if (h < 2.0) return "#f5c542"; // Caution
  if (h < 3.5) return "#f97316"; // Dangerous
  return "#ef4444"; // Do Not Go
}

export default function HourlyRow({ times = [], waveHeights = [] }) {
  // Find current hour index or start at 0
  const now = new Date();
  const currentHourPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}`;
  
  let startIndex = times.findIndex((t) => t.startsWith(currentHourPrefix));
  if (startIndex === -1) {
    // Fallback: find closest hour
    const nowMs = now.getTime();
    let minDiff = Infinity;
    times.forEach((t, idx) => {
      const diff = Math.abs(new Date(t).getTime() - nowMs);
      if (diff < minDiff) {
        minDiff = diff;
        startIndex = idx;
      }
    });
  }
  if (startIndex === -1) startIndex = 0;

  // Slice next 12 hours
  const hourlyData = [];
  for (let i = 0; i < 12; i++) {
    const idx = startIndex + i;
    if (idx < times.length) {
      hourlyData.push({
        time: times[idx],
        waveHeight: waveHeights[idx]
      });
    }
  }

  return (
    <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-5 backdrop-blur-md shadow-lg">
      <div className="flex items-center justify-between border-b border-[var(--border-5)] pb-2 mb-4">
        <h3 className="text-xs uppercase font-extrabold tracking-widest text-[var(--text-muted)]">
          Hourly Forecast (Next 12 Hours)
        </h3>
        <span className="text-[10px] text-[var(--foam)] font-bold">Scroll horizontally →</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-[var(--text)]/10 scrollbar-track-transparent">
        {hourlyData.map((item, idx) => {
          const color = getIndicatorColor(item.waveHeight);
          return (
            <div
              key={idx}
              className="flex-shrink-0 w-24 bg-[var(--ocean-deep)]/25 border border-[var(--border-5)] rounded-xl p-3.5 flex flex-col items-center justify-between gap-2 hover:border-[var(--border-15)] transition-all"
            >
              <span className="text-[10px] font-bold text-[var(--text-muted)] text-center">
                {formatHour(item.time)}
              </span>
              
              <span className="text-sm font-black text-[var(--text)]">
                {item.waveHeight != null ? `${item.waveHeight.toFixed(2)}m` : "—"}
              </span>

              {/* Bullet indicator showing safety color */}
              <div className="flex items-center gap-1.5 mt-1">
                <span 
                  className="h-1.5 w-1.5 rounded-full" 
                  style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                />
                <span className="text-[8px] font-bold uppercase" style={{ color }}>
                  {item.waveHeight < 1.0 ? "Safe" : item.waveHeight < 2.0 ? "Caution" : item.waveHeight < 3.5 ? "Danger" : "Warning"}
                </span>
              </div>
            </div>
          );
        })}
        {hourlyData.length === 0 && (
          <div className="text-xs text-[var(--text-muted)] py-4 text-center w-full">
            No hourly forecast data available.
          </div>
        )}
      </div>
    </div>
  );
}
