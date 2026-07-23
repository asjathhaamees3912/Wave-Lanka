export default function MetricCard({ label, value, unit, icon, subtext }) {
  return (
    <div className="bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-5 backdrop-blur-md shadow-lg flex flex-col justify-between transition-all duration-300 hover:border-sky-500/20 hover:bg-white/10 hover:shadow-cyan-950/20">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-bold">
          {label}
        </span>
        {icon && <span className="text-lg opacity-85">{icon}</span>}
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-black tracking-tight text-[var(--text)]">
          {value}
        </span>
        <span className="text-sm font-extrabold text-[var(--foam)]">
          {unit}
        </span>
      </div>
      {subtext && (
        <div className="mt-2 text-[10px] text-[var(--text-muted)] font-medium">
          {subtext}
        </div>
      )}
    </div>
  );
}

