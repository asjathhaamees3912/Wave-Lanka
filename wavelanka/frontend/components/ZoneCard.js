import Link from "next/link";
import SafetyBadge from "./SafetyBadge";

export default function ZoneCard({
  zone,
  safety,
  isActive,
  onSelect
}) {
  const currentConditions = safety?.current_conditions;
  const waveHeight = currentConditions?.wave_height;
  const windSpeed = currentConditions?.wind_speed_10m;
  const level = safety?.level || "UNKNOWN";
  
  // Custom styling based on safety level and active state
  const borderStyle = isActive 
    ? "border-[rgba(56,189,248,0.5)] shadow-[0_0_15px_rgba(56,189,248,0.15)] bg-[var(--bg-ocean-card-hover)]" 
    : "border-[rgba(56,189,248,0.12)] hover:border-[rgba(56,189,248,0.25)] hover:bg-[var(--bg-ocean-card-hover)] bg-[var(--bg-ocean-card)]";

  return (
    <div 
      onClick={() => onSelect && onSelect(zone.id)}
      className={`rounded-2xl border transition-all duration-300 p-5 flex flex-col gap-3 cursor-pointer ${borderStyle}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-semibold">Zone</div>
          <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
            {zone?.name || zone?.id}
          </div>
        </div>
        <SafetyBadge level={level} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-1">
        <div className="rounded-xl bg-[#030d1d]/60 border border-[rgba(56,189,248,0.06)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">Wave Height</div>
          <div className="text-xl font-extrabold text-[var(--text-primary)] mt-1">
            {waveHeight != null ? `${Number(waveHeight).toFixed(2)} m` : "—"}
          </div>
        </div>
        <div className="rounded-xl bg-[#030d1d]/60 border border-[rgba(56,189,248,0.06)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">Wind Speed</div>
          <div className="text-xl font-extrabold text-[var(--text-primary)] mt-1">
            {windSpeed != null ? `${Number(windSpeed).toFixed(1)} km/h` : "—"}
          </div>
        </div>
      </div>

      <div className="text-sm text-[var(--text-secondary)] line-clamp-2 mt-1 leading-relaxed">
        {safety?.reason || "No live conditions report available for this zone."}
      </div>

      <div className="pt-2 mt-auto flex gap-2">
        <Link
          href={`/zone/${zone?.id}`}
          onClick={(e) => e.stopPropagation()} // Prevent card selection when clicking link
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-md w-full"
        >
          View Live Forecast & Dashboard
        </Link>
      </div>
    </div>
  );
}
