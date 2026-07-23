export default function WindCompass({ degrees = 0 }) {
  const cardinal = getCardinal(degrees);

  function getCardinal(deg) {
    const directions = [
      'N', 'NNE', 'NE', 'ENE', 
      'E', 'ESE', 'SE', 'SSE', 
      'S', 'SSW', 'SW', 'WSW', 
      'W', 'WNW', 'NW', 'NNW'
    ];
    const idx = Math.round((deg % 360) / 22.5);
    return directions[idx % 16];
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl backdrop-blur-md">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-3">
        Wind Direction
      </span>
      
      <div className="relative w-24 h-24 rounded-full border border-[var(--border-10)] flex items-center justify-center bg-[var(--ocean-deep)]/25 shadow-inner">
        {/* Cardinal Directions Labels */}
        <span className="absolute top-1 text-[8px] font-bold text-[var(--text-muted)]/60">N</span>
        <span className="absolute right-1 text-[8px] font-bold text-[var(--text-muted)]/60">E</span>
        <span className="absolute bottom-1 text-[8px] font-bold text-[var(--text-muted)]/60">S</span>
        <span className="absolute left-1 text-[8px] font-bold text-[var(--text-muted)]/60">W</span>
        
        {/* Rotating Compass Arrow */}
        <div 
          className="transition-transform duration-700 ease-out" 
          style={{ transform: `rotate(${degrees}deg)` }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-[var(--foam)]">
            {/* Compass Pointer Arrow */}
            <path 
              d="M12 2L16 10L12 8L8 10L12 2Z" 
              fill="currentColor" 
            />
            {/* Arrow Tail (pointing away) */}
            <path 
              d="M12 8V22" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              opacity="0.4"
            />
          </svg>
        </div>
      </div>
      
      <div className="mt-3 text-center">
        <span className="text-sm font-bold text-[var(--text)]">{degrees}°</span>
        <span className="text-xs font-semibold text-[var(--foam)] ml-1.5 bg-[var(--foam)]/10 px-1.5 py-0.5 rounded border border-[var(--foam)]/15">
          {cardinal}
        </span>
      </div>
    </div>
  );
}
