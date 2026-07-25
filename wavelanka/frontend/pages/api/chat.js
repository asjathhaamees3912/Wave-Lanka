import axios from "axios";

const AI_URL = process.env.NEXT_PUBLIC_AI_URL || "http://localhost:8000";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const ZONE_KEYWORDS = [
  { zone: "east", keywords: ["trincom", "batticaloa", "bengal", "east coast", "kalmunai", "ampara", "arugam", "nilaveli"] },
  { zone: "south", keywords: ["galle", "matara", "hambantota", "tangalle", "mirissa", "weligama", "dondra", "south coast", "indian ocean"] },
  { zone: "west", keywords: ["mannar", "puttalam", "chilaw", "kalpitiya", "gulf of mannar", "west coast", "marawila"] },
  { zone: "north", keywords: ["jaffna", "mullaitivu", "palk", "point pedro", "north coast", "kilinochchi"] },
  { zone: "southwest", keywords: ["colombo", "negombo", "kalutara", "hikkaduwa", "beruwala", "bentota", "moratuwa", "lakshadweep", "panadura"] },
];

const ZONE_LABELS = {
  east: "Bay of Bengal (East)",
  south: "Indian Ocean (South)",
  west: "Gulf of Mannar (West)",
  north: "Palk Strait (North)",
  southwest: "Lakshadweep Sea (Southwest)",
};

function inferZone(message) {
  const m = message.toLowerCase();
  for (const entry of ZONE_KEYWORDS) {
    if (entry.keywords.some((kw) => m.includes(kw))) {
      return entry.zone;
    }
  }
  return "east";
}

async function fetchSafetyFallback(message, sessionId) {
  const zone = inferZone(message);
  const label = ZONE_LABELS[zone] || zone;

  try {
    const resp = await axios.get(`${BACKEND_URL}/api/safety/${zone}`, { timeout: 10000 });
    const data = resp.data?.data;
    if (!data) {
      throw new Error("No safety data returned");
    }

    const level = data.level || "UNKNOWN";
    const reason = data.reason || "Conditions are being assessed.";
    const window = data.best_safe_window;

    let reply = `${level} for ${label}.\n\n${reason}`;

    if (window?.start && window?.end) {
      reply += `\n\nBest fishing window: ${window.start} to ${window.end} (${window.duration_hours || "?"} hours).`;
    }

  if (/best day|this week|when.*fish/i.test(message)) {
      reply += "\n\nFor weekly planning, check the forecast page for hourly wave and wind trends in your zone.";
    }

    return { session_id: sessionId, reply };
  } catch (err) {
    return {
      session_id: sessionId,
      reply:
        `I couldn't reach live data right now. For ${label}, please check the forecast dashboard or try again shortly. ` +
        `(Backend: ${err.message})`,
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, session_id: sessionId } = req.body || {};
  if (!message?.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const sid = sessionId || `sess_${Date.now()}`;

  // Try the Python AI service first
  try {
    const aiResp = await axios.post(
      `${AI_URL}/chat`,
      { message: message.trim(), session_id: sid },
      { timeout: 15000 }
    );
    return res.status(200).json(aiResp.data);
  } catch {
    // Fall back to backend safety API
    const fallback = await fetchSafetyFallback(message.trim(), sid);
    return res.status(200).json(fallback);
  }
}
