export default function SafetyBadge({ level, confidence = null, source = null, dataAvailable = true }) {
  const cleanLevel = String(level || "UNKNOWN").trim().toUpperCase();
  
  // If data unavailable, show special "DATA UNAVAILABLE" badge
  if (!dataAvailable || cleanLevel === "UNKNOWN") {
    return (
      <div className="flex flex-col items-start">
        <span
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold border transition-all duration-300 backdrop-blur-sm"
          style={{
            backgroundColor: "rgba(107, 114, 128, 0.15)",
            borderColor: "rgba(107, 114, 128, 0.3)",
            color: "rgba(156, 163, 175, 0.8)"
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: "rgba(156, 163, 175, 0.8)" }}
          />
          DATA UNAVAILABLE
        </span>
      </div>
    );
  }

  const styles = {
    "SAFE": {
      bg: "rgba(34,217,107,0.15)",
      border: "rgba(34,217,107,0.3)",
      text: "#22d96b",
      dot: "#22d96b"
    },
    "CAUTION": {
      bg: "rgba(245,197,66,0.15)",
      border: "rgba(245,197,66,0.3)",
      text: "#f5c542",
      dot: "#f5c542"
    },
    "DANGEROUS": {
      bg: "rgba(249,115,22,0.15)",
      border: "rgba(249,115,22,0.3)",
      text: "#f97316",
      dot: "#f97316"
    },
    "DO NOT GO OUT": {
      bg: "rgba(239,68,68,0.15)",
      border: "rgba(239,68,68,0.3)",
      text: "#ef4444",
      dot: "#ef4444"
    },
    "DO NOT GO": {
      bg: "rgba(239,68,68,0.15)",
      border: "rgba(239,68,68,0.3)",
      text: "#ef4444",
      dot: "#ef4444"
    }
  };

  const currentStyle = styles[cleanLevel] || {
    bg: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.1)",
    text: "rgba(240, 248, 255, 0.6)",
    dot: "rgba(240, 248, 255, 0.4)"
  };

  return (
    <div className="flex flex-col items-start">
      <span
        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold border transition-all duration-300 backdrop-blur-sm"
        style={{
          backgroundColor: currentStyle.bg,
          borderColor: currentStyle.border,
          color: currentStyle.text
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: currentStyle.dot }}
        />
        {cleanLevel}
      </span>
      {source === "ml" ? (
        <span
          className="text-[10px] font-semibold mt-1"
          style={{ color: 'var(--text-secondary)' }}
          title="Predicted by MarineX AI — trained on Sri Lanka marine data"
        >
          AI Forecast
        </span>
      ) : source === "rules" ? (
        <span className="text-[10px] font-semibold mt-1" style={{ color: 'var(--text-secondary)' }}>
          Estimated from local safety rules
        </span>
      ) : null}
    </div>
  );
}
