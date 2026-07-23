import Link from "next/link";
import SafetyBadge from "./SafetyBadge";

export default function ZoneSafetyCard({
  zone,
  safety,
  wave_height,
  wind_speed,
  reason
}) {
  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Zone</div>
          <div className="text-lg font-semibold text-slate-900">
            {zone?.name || zone?.id}
          </div>
        </div>
        <SafetyBadge level={safety} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Wave height</div>
          <div className="text-xl font-bold text-slate-900">
            {wave_height != null ? `${wave_height.toFixed(2)} m` : "—"}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Wind speed</div>
          <div className="text-xl font-bold text-slate-900">
            {wind_speed != null ? `${wind_speed.toFixed(1)} km/h` : "—"}
          </div>
        </div>
      </div>

      <div className="text-sm text-slate-700 line-clamp-2">
        {reason || "—"}
      </div>

      <div className="pt-2">
        <Link
          href={`/zone/${zone?.id}`}
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 w-full"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}

