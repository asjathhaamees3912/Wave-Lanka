export function computeSafety(waveHeight, windSpeed) {
  if (waveHeight == null || windSpeed == null) {
    return {
      level: "UNKNOWN",
      reason: "Insufficient meteorological data to assess safety."
    };
  }

  // Determine severity index for wave height
  let waveLevel = "SAFE";
  if (waveHeight >= 3.5) waveLevel = "DO_NOT_GO";
  else if (waveHeight >= 2.0) waveLevel = "DANGEROUS";
  else if (waveHeight >= 1.0) waveLevel = "CAUTION";

  // Determine severity index for wind speed
  let windLevel = "SAFE";
  if (windSpeed > 50) windLevel = "DO_NOT_GO";
  else if (windSpeed >= 35) windLevel = "DANGEROUS";
  else if (windSpeed >= 20) windLevel = "CAUTION";

  // The final status is the worst of the two
  const levels = ["SAFE", "CAUTION", "DANGEROUS", "DO_NOT_GO"];
  const finalIndex = Math.max(levels.indexOf(waveLevel), levels.indexOf(windLevel));
  const finalLevel = levels[finalIndex];

  // Map to exact labels requested
  const labelMap = {
    SAFE: "SAFE",
    CAUTION: "CAUTION",
    DANGEROUS: "DANGEROUS",
    DO_NOT_GO: "DO NOT GO OUT"
  };

  const level = labelMap[finalLevel];

  // Plain language explanations matching specifications
  let reason = "";
  if (level === "SAFE") {
    reason = `Conditions are safe for all vessel types. Wave height is ${waveHeight.toFixed(2)}m with light winds at ${windSpeed.toFixed(1)} km/h. Ideal for day fishing trips.`;
  } else if (level === "CAUTION") {
    reason = `Moderate wave swells or winds detected. Wave height is ${waveHeight.toFixed(2)}m with winds at ${windSpeed.toFixed(1)} km/h. Small craft operators should exercise caution, particularly near shallow reefs.`;
  } else if (level === "DANGEROUS") {
    reason = `Rough sea conditions. Wave height is ${waveHeight.toFixed(2)}m with winds at ${windSpeed.toFixed(1)} km/h. Small vessel operators must stay in harbour. Experienced crews on large vessels proceed with extreme caution.`;
  } else {
    reason = `Dangerous extreme marine environment. Wave height is ${waveHeight.toFixed(2)}m with winds at ${windSpeed.toFixed(1)} km/h. All vessels must remain in harbour. DO NOT GO OUT.`;
  }

  return {
    level,
    reason
  };
}

// Attempt ML predict first, fallback to backend rule-based safety
export async function getSafetyVerdict(zoneId) {
  const AI_URL = process.env.NEXT_PUBLIC_AI_URL || "http://localhost:8000";
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  // helper to normalize ML safety class to UI label
  const normalizeLevel = (safetyClass) => {
    if (!safetyClass) return "UNKNOWN";
    const mapped = String(safetyClass).toUpperCase().replace(/_/g, " ");
    if (mapped === "DO NOT GO") return "DO NOT GO OUT";
    return mapped;
  };

  // Try ML predict
  try {
    console.debug("getSafetyVerdict: attempting ML predict for zone", zoneId, "AI_URL=", AI_URL);
    const resp = await fetch(`${AI_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone: zoneId }),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (resp.ok) {
      const data = await resp.json();
      console.debug("getSafetyVerdict: ML predict success", zoneId, data);
      const level = normalizeLevel(data.safety_class);
      return {
        source: "ml",
        safety_class: data.safety_class,
        confidence: typeof data.confidence === "number" ? data.confidence : (data.confidence ? Number(data.confidence) : null),
        level,
        reason: data.reason || null,
        current_conditions: {
          wave_height: data.wave_height != null ? data.wave_height : null,
          wind_speed_10m: data.wind_speed_10m != null ? data.wind_speed_10m : null,
        },
        data_available: true,
        partial_data: false,
        raw: data,
      };
    }
  } catch (e) {
    // swallow and fallback
    console.warn("getSafetyVerdict: ML predict failed, falling back to rules:", e);
  }

  // Fallback to rules from Node backend
  try {
    console.debug("getSafetyVerdict: calling backend rules fallback for zone", zoneId, "BACKEND_URL=", BACKEND_URL);
    const f = await fetch(`${BACKEND_URL}/api/safety/${zoneId}`, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    if (f.ok) {
      const body = await f.json();
      console.debug("getSafetyVerdict: rules fallback success", zoneId, body);
      const d = body.data || body;

      // Check if data is available
      const dataAvailable = d.data_available !== false && d.level !== "UNKNOWN";
      const isPartial = d.partial_data === true;
      const missingData = d.missing;

      return {
        source: "rules",
        level: d.level || (d.safety_class ? normalizeLevel(d.safety_class) : "UNKNOWN"),
        reason: d.reason || null,
        current_conditions: d.current_conditions || null,
        data_available: dataAvailable,
        partial_data: isPartial,
        missing: missingData,
        raw: body,
      };
    }
  } catch (e) {
    console.error("Safety fallback failed:", e);
  }

  return {
    source: "unknown",
    level: "UNKNOWN",
    reason: "Unable to retrieve safety data. Please check your connection.",
    data_available: false,
    partial_data: false,
  };
}
