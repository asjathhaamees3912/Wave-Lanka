#!/usr/bin/env python3
"""
Wave Lanka — Phase 4 AI Layer

FastAPI app providing:
- /predict  : ML safety prediction per zone
- /chat     : Gemini ReAct-style assistant (MarineX)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import re
import time
import requests
from datetime import datetime
from zoneinfo import ZoneInfo

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import Tool
from langchain_core.messages import HumanMessage
from langchain.agents import create_agent
from langgraph.checkpoint.memory import MemorySaver

from tools.marine_tool import get_marine_safety
from tools.weather_tool import get_weather
from tools.meteo_tool import get_meteo_advisory


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
MARINE_MODEL_DIR = BASE_DIR / "marine-model"
MODEL_PATH = MARINE_MODEL_DIR / "marine_safety_model.joblib"
FEATURES_PATH = MARINE_MODEL_DIR / "model_features.json"
MODEL_6H_PATH = MARINE_MODEL_DIR / "model_6h.joblib"
MODEL_12H_PATH = MARINE_MODEL_DIR / "model_12h.joblib"
MODEL_24H_PATH = MARINE_MODEL_DIR / "model_24h.joblib"
FORECAST_FEATURES_PATH = MARINE_MODEL_DIR / "forecast_features.json"

BACKEND_BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")

CLASS_NAMES = ["SAFE", "CAUTION", "DANGEROUS", "DO_NOT_GO"]

ZONE_NAMES = {
    "bay-of-bengal": ("Bay of Bengal (East)", 0),
    "indian-ocean": ("Indian Ocean (South)", 1),
    "gulf-of-mannar": ("Gulf of Mannar (West)", 2),
    "palk-strait": ("Palk Strait (North)", 3),
    "lakshadweep-sea": ("Lakshadweep Sea (SW)", 4),
}

CLASS_INFO = {
    0: {"label": "SAFE", "color": "#22d96b", "advice": "Safe conditions for fishing"},
    1: {"label": "CAUTION", "color": "#f5c542", "advice": "Proceed with caution — experienced crews only"},
    2: {"label": "DANGEROUS", "color": "#f97316", "advice": "Hazardous — small boats stay in harbour"},
    3: {"label": "DO_NOT_GO", "color": "#ef4444", "advice": "Do not go out — all vessels stay in port"},
}

MODEL_ACCURACY = {"6h": "94.17%", "12h": "92.56%", "24h": "91.51%"}

model_6h = None
model_12h = None
model_24h = None
feature_names: List[str] = []

ZONE_ALIASES = {
    "bay_of_bengal": "east",
    "bay-of-bengal": "east",
    "east": "east",
    "south": "south",
    "indian_ocean_south": "south",
    "gulf_of_mannar": "west",
    "west": "west",
    "palk_strait": "north",
    "north": "north",
    "lakshadweep_sea": "southwest",
    "southwest": "southwest",
}


def normalize_zone_id(zone: str) -> str:
    key = zone.strip().lower()
    return ZONE_ALIASES.get(key, key)


class PredictRequest(BaseModel):
    zone: str


class PredictResponse(BaseModel):
    zone: str
    backend_zone: str
    safety_class: str
    confidence: float
    wave_height: Optional[float]
    wind_speed_10m: Optional[float]
    reason: str


class ForecastRequest(BaseModel):
    zone: str
    current_data: Dict[str, float]
    lag_data: Dict[str, float]


class ChatRequest(BaseModel):
    message: str
    session_id: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str


class FeedbackRequest(BaseModel):
    session_id: str
    rating: Optional[int] = None
    comment: Optional[str] = None
    user_message: Optional[str] = None
    assistant_reply: Optional[str] = None


app = FastAPI(title="Wave Lanka AI Layer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "models_loaded": bool(model_6h and model_12h and model_24h and feature_names),
        "model_accuracy": MODEL_ACCURACY,
    }


@app.on_event("startup")
async def startup_event():
    global model_6h, model_12h, model_24h, feature_names
    model_6h = joblib.load(MODEL_6H_PATH)
    model_12h = joblib.load(MODEL_12H_PATH)
    model_24h = joblib.load(MODEL_24H_PATH)
    with open(FORECAST_FEATURES_PATH, encoding="utf-8") as f:
        feature_names = json.load(f)
    print("[SUCCESS] All 3 MarineX predictive models loaded")
    print("   6h model:  ready")
    print("   12h model: ready")
    print("   24h model: ready")


def load_model_and_features():
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found at {MODEL_PATH}")
    if not FEATURES_PATH.exists():
        raise RuntimeError(f"Feature list not found at {FEATURES_PATH}")

    model = joblib.load(MODEL_PATH)
    with open(FEATURES_PATH, encoding="utf-8") as f:
        feature_names: List[str] = list(__import__("json").load(f))
    return model, feature_names


async def fetch_backend_json(path: str) -> Dict[str, Any]:
    url = f"{BACKEND_BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Backend error for {url}: {exc}",
            ) from exc
        return resp.json()


def build_feature_row(
    feature_names: List[str],
    marine: Dict[str, Any],
    weather: Dict[str, Any],
    month: int,
    zone_id: int,
) -> pd.DataFrame:
    current_marine = marine.get("current", {}) or {}
    current_weather = weather.get("current", {}) or {}

    wave_height = float(current_marine.get("wave_height") or 0.0)
    wave_period = float(current_marine.get("wave_period") or 0.0)
    wind_wave_height = float(current_marine.get("wind_wave_height") or wave_height * 0.6)
    swell_wave_height = float(current_marine.get("swell_wave_height") or 0.0)
    swell_wave_period = float(current_marine.get("swell_wave_period") or 1.0)

    wind_speed = float(current_weather.get("wind_speed_10m") or 0.0)
    wind_gusts = float(current_weather.get("wind_gusts_10m") or wind_speed)
    weather_code = int(current_weather.get("weather_code") or 0)

    wave_wind_ratio = wave_height / max(wind_speed, 1.0)
    swell_steepness = swell_wave_height / max(swell_wave_period, 1.0)

    row = {
        "wave_height": wave_height,
        "wave_period": wave_period,
        "wind_wave_height": wind_wave_height,
        "swell_wave_height": swell_wave_height,
        "swell_wave_period": swell_wave_period,
        "wind_speed_10m": wind_speed,
        "wind_gusts_10m": wind_gusts,
        "weather_code": weather_code,
        "month": month,
        "zone_id": zone_id,
        "wave_wind_ratio": wave_wind_ratio,
        "swell_steepness": swell_steepness,
    }

    return pd.DataFrame([row])[feature_names]


def monsoon_flag(month: int, zone_id: int) -> int:
    if month in [5, 6, 7, 8, 9] and zone_id in [1, 4]:
        return 1
    if month in [10, 11, 12, 1, 2] and zone_id in [0, 3]:
        return 1
    return 0


def build_forecast_features(zone_id: int, current: Dict[str, Any], lag: Dict[str, Any], month: int, hour: int) -> dict:
    # Extract with defaults to handle missing/null values from frontend
    wave = float(current.get("wave_height") or 1.5)
    wind = float(current.get("wind_speed") or 15)
    gusts = float(current.get("wind_gusts", 0) or 0)
    swell = float(current.get("swell_wave_height") or 0.8)
    period = float(current.get("swell_wave_period") or 6)
    wave_period = float(current.get("wave_period") or 5)

    monsoon = monsoon_flag(month, zone_id)

    # Extract lag data with defaults
    wave_3h_ago = float(lag.get("wave_height_3h_ago") or wave)
    wave_6h_ago = float(lag.get("wave_height_6h_ago") or wave)
    wind_3h_ago = float(lag.get("wind_speed_3h_ago") or wind)
    wind_6h_ago = float(lag.get("wind_speed_6h_ago") or wind)
    swell_3h_ago = float(lag.get("swell_3h_ago") or swell)

    return {
        "wave_height_t0": wave,
        "wave_period_t0": wave_period,
        "swell_wave_height_t0": swell,
        "swell_wave_period_t0": period,
        "wind_wave_height_t0": float(current.get("wind_wave_height", 0) or 0),
        "wind_speed_t0": wind,
        "wind_gusts_t0": gusts,
        "sea_surface_temperature_t0": float(current.get("sea_surface_temperature", 28) or 28),
        "weather_code_t0": int(current.get("weather_code", 0) or 0),
        "month": month,
        "hour": hour,
        "zone_id": zone_id,
        "wave_height_t-3h": wave_3h_ago,
        "wave_height_t-6h": wave_6h_ago,
        "wind_speed_t-3h": wind_3h_ago,
        "wind_speed_t-6h": wind_6h_ago,
        "wave_delta_3h": wave - wave_3h_ago,
        "wave_delta_6h": wave - wave_6h_ago,
        "wind_delta_3h": wind - wind_3h_ago,
        "swell_trend": swell - swell_3h_ago,
        "wave_wind_ratio": wave / max(wind, 1),
        "swell_steepness": swell / max(period, 1),
        "wave_energy": wave ** 2,
        "monsoon_flag": monsoon,
    }


def compute_current_safety(
    wave: float,
    wind: float,
    gusts: float,
    swell: float,
    period: float,
    month: int,
    zone_id: int,
) -> int:
    monsoon = 1.0
    if month in [5, 6, 7, 8, 9] and zone_id in [1, 4]:
        monsoon = 1.3
    elif month in [10, 11, 12, 1, 2] and zone_id in [0, 3]:
        monsoon = 1.25

    wave_energy = (wave ** 2) * monsoon
    swell_danger = swell * (period / 8.0) if period > 0 else swell
    gust_factor = max(0, (gusts - 40) / 20) if gusts else 0
    zone_factor = 1.15 if zone_id == 3 else 1.0
    score = (wave_energy + swell_danger * 0.5 + gust_factor) * zone_factor

    if score < 0.7 and wind < 18:
        return 0
    if score < 2.8 and wind < 40:
        return 1
    if score < 6.5 and wind < 58:
        return 2
    return 3


def interpret_prediction(prediction: int, confidence: float, wave: float, wind: float) -> str:
    label = CLASS_NAMES[prediction]
    return (
        f"{label}: model is {confidence * 100:.1f}% confident based on "
        f"wave height {wave:.2f} m and wind speed {wind:.1f} km/h."
    )


@app.post("/predict", response_model=PredictResponse)
async def predict_endpoint(req: PredictRequest) -> PredictResponse:
    backend_zone = normalize_zone_id(req.zone)

    model, feature_names = load_model_and_features()

    marine_resp = await fetch_backend_json(f"/api/marine/{backend_zone}")
    weather_resp = await fetch_backend_json(f"/api/weather/{backend_zone}")

    if not marine_resp.get("success"):
        raise HTTPException(status_code=502, detail="Marine backend returned error")
    if not weather_resp.get("success"):
        raise HTTPException(status_code=502, detail="Weather backend returned error")

    marine_data = marine_resp["data"]
    weather_data = weather_resp["data"]

    month = int(pd.Timestamp(marine_data["current"]["time"]).month)
    zone_id = 0

    features_df = build_feature_row(feature_names, marine_data, weather_data, month, zone_id)

    prediction = int(model.predict(features_df)[0])
    raw_probs = model.predict_proba(features_df)[0]
    class_to_idx = {int(c): i for i, c in enumerate(model.classes_)}
    probabilities = np.zeros(len(CLASS_NAMES))
    for class_id, idx in class_to_idx.items():
        probabilities[class_id] = raw_probs[idx]
    confidence = float(probabilities[prediction])

    wave = float(marine_data["current"].get("wave_height") or 0.0)
    wind = float(weather_data["current"].get("wind_speed_10m") or 0.0)
    reason = interpret_prediction(prediction, confidence, wave, wind)

    return PredictResponse(
        zone=req.zone,
        backend_zone=backend_zone,
        safety_class=CLASS_NAMES[prediction],
        confidence=confidence,
        wave_height=wave,
        wind_speed_10m=wind,
        reason=reason,
    )


@app.post("/predict/forecast")
async def predict_forecast(req: ForecastRequest) -> Dict[str, Any]:
    if not (model_6h and model_12h and model_24h and feature_names):
        raise HTTPException(status_code=503, detail="Models are not loaded")

    zone_key = req.zone.strip().lower()
    if zone_key not in ZONE_NAMES:
        raise HTTPException(status_code=400, detail="Unknown zone key")

    zone_name, zone_id = ZONE_NAMES[zone_key]
    now = datetime.now(ZoneInfo("Asia/Colombo"))
    month = now.month
    hour = now.hour

    try:
        feature_row = build_forecast_features(zone_id, req.current_data, req.lag_data, month, hour)
        features_df = pd.DataFrame([feature_row])[feature_names]
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to build features: {str(e)}"
        ) from e

    try:
        pred_6h = int(model_6h.predict(features_df)[0])
        pred_12h = int(model_12h.predict(features_df)[0])
        pred_24h = int(model_24h.predict(features_df)[0])
        conf_6h = float(max(model_6h.predict_proba(features_df)[0]))
        conf_12h = float(max(model_12h.predict_proba(features_df)[0]))
        conf_24h = float(max(model_24h.predict_proba(features_df)[0]))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Model prediction failed: {str(e)}"
        ) from e

    try:
        current_class = compute_current_safety(
            float(req.current_data.get("wave_height") or 1.5),
            float(req.current_data.get("wind_speed") or 15),
            float(req.current_data.get("wind_gusts", 0) or 0),
            float(req.current_data.get("swell_wave_height") or 0.8),
            float(req.current_data.get("swell_wave_period") or 6),
            month,
            zone_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to compute current safety: {str(e)}"
        ) from e

    if pred_6h > current_class:
        trend = "DETERIORATING"
        trend_label = "Conditions worsening — plan to return early"
    elif pred_6h < current_class:
        trend = "IMPROVING"
        trend_label = "Conditions improving through the day"
    else:
        trend = "STABLE"
        trend_label = "Similar conditions expected through the day"

    preds = [pred_6h, pred_12h, pred_24h]
    hours = [6, 12, 24]
    safe_window = None
    for pred, h in zip(preds, hours):
        if pred == 0:
            safe_window = f"Safe window expected in approximately {h} hours"
            break
    if not safe_window:
        safe_window = "No safe window in next 24 hours. Monitor conditions and check tomorrow."

    return {
        "zone": zone_key,
        "zone_name": zone_name,
        "predictions": {
            "in_6h": {
                "safety_class": CLASS_INFO[pred_6h]["label"],
                "confidence": round(conf_6h, 2),
                "color": CLASS_INFO[pred_6h]["color"],
                "advice": CLASS_INFO[pred_6h]["advice"],
            },
            "in_12h": {
                "safety_class": CLASS_INFO[pred_12h]["label"],
                "confidence": round(conf_12h, 2),
                "color": CLASS_INFO[pred_12h]["color"],
                "advice": CLASS_INFO[pred_12h]["advice"],
            },
            "in_24h": {
                "safety_class": CLASS_INFO[pred_24h]["label"],
                "confidence": round(conf_24h, 2),
                "color": CLASS_INFO[pred_24h]["color"],
                "advice": CLASS_INFO[pred_24h]["advice"],
            },
        },
        "trend": trend,
        "trend_label": trend_label,
        "safe_window": safe_window,
        "model_accuracy": MODEL_ACCURACY,
        "updated": now.isoformat(),
    }


SYSTEM_PROMPT = (
    "You are MarineX, an extremely focused marine safety assistant for Sri Lanka's coastal fishing communities. "
    "Your sole responsibility is to help people understand live sea conditions, hourly and 7-day forecasts, wind, swell, tide effects, "
    "and official maritime advisories so they can make safe decisions about going to sea.\n\n"
    "GREETING RULE (check this first before all other rules): "
    "If the user's message is a greeting or casual opener such as: hi, hello, hey, good morning, good afternoon, good evening, good night, ayubowan, vanakkam, what's up, howdy, sup, hiya, greetings, salaam, or any similar casual opening — DO NOT call any tools. "
    "Respond naturally and warmly in the same language as the user. For example, in English: 'Hey! How can I help you today? Ask me about sea conditions, wave forecasts, or safety advisories for any Sri Lanka coastal zone.' "
    "In Sinhala: 'ආයුබෝවන්! මට ඔබට කෙසේ උදව් කළ හැකිද? ශ්‍රී ලංකාවේ ඕනෑම වෙරළබඩ කලාපයක් සඳහා මුහුදු තත්ත්වය, රල පුරෝකථනය හෝ ආරක්ෂක උපදෙස් ගැන මගෙන් අසන්න.' "
    "In Tamil: 'வணக்கம்! நான் உங்களுக்கு எப்படி உதவலாம்? இலங்கையின் எந்த கடலோர மண்டலத்திற்கும் கடல் நிலைமைகள், அலை முன்னறிவிப்பு அல்லது பாதுகாப்பு அறிவுரைகளைப் பற்றி என்னிடம் கேளுங்கள்.' "
    "Adapt the response naturally — do not copy word for word every time. Keep it conversational and warm. Vary the wording slightly each time.\n\n"
    "You MUST always consult and prefer real-time tools (marine_tool, weather_tool, meteo_tool, forecast_tool) before answering any question about current or forecast conditions. "
    "Do NOT hallucinate live data, and never answer from memory when live data or forecasts are available.\n\n"
    "When a question concerns a specific zone, lead with a clear verdict: one of 'SAFE', 'CAUTION', 'DANGEROUS', or 'DO NOT GO' followed by a short reason and the model confidence (as a percent) when available. "
    "If numeric model confidence or ML-based assessment is provided, make that explicit (for example: 'SAFE — model confidence 87%').\n\n"
    "Respond in the same language the user writes in: Sinhala, Tamil, or English. If the user writes in Tamil, reply in Tamil.\n\n"
    "If the user asks something outside marine safety, politely refuse and redirect back to marine safety. Example: 'I'm focused on marine safety for Sri Lanka's coast — I can help you check sea conditions, wave forecasts, or safety advisories for any zone.'\n\n"
    "When ml_forecast is present in marine tool results, structure your response like this:\n\n"
    "RIGHT NOW: [current verdict]\n"
    "IN 6 HOURS: [in_6h] ([confidence_6h*100]% confident)\n"
    "IN 12 HOURS: [in_12h]\n"
    "IN 24 HOURS: [in_24h]\n"
    "TREND: [trend_label]\n"
    "BEST TIME: [safe_window]\n\n"
    "For questions like 'when should I go?', 'is tomorrow safe?', 'should I go out this afternoon?' — always lead with the ML predictions, not just current data.\n"
    "The ML models predict 6, 12, and 24 hours ahead with 94%, 93%, and 92% accuracy respectively.\n\n"
    "Always be concise, prioritize safety-critical guidance, and avoid giving navigation, legal, or medical advice beyond common-sense safety steps."
)


def build_agent():
    # Support multiple env keys as fallbacks: GEMINI_API_KEY or GOOGLE_API_KEY_A..E
    env_keys = [os.getenv("GEMINI_API_KEY")]
    env_keys += [os.getenv(k) for k in ("GOOGLE_API_KEY_A", "GOOGLE_API_KEY_B", "GOOGLE_API_KEY_C", "GOOGLE_API_KEY_D", "GOOGLE_API_KEY_E")]
    api_key = next((k for k in env_keys if k), None)
    if not api_key:
        return None

    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", api_key=api_key, temperature=0.2)

    # add a forecast tool that returns raw forecast data for a zone id
    def _get_forecast(zone: str) -> Dict[str, Any]:
        try:
            # Resolve friendly zone keys (e.g., 'east') to backend zone ids
            def _resolve_backend_zone(z: str) -> str:
                if not z:
                    return z
                key = str(z).strip().lower().replace(" ", "-").replace("_", "-")
                mapping = {
                    "east": "bay-of-bengal",
                    "bay-of-bengal": "bay-of-bengal",
                    "south": "indian-ocean",
                    "indian-ocean": "indian-ocean",
                    "west": "gulf-of-mannar",
                    "gulf-of-mannar": "gulf-of-mannar",
                    "north": "palk-strait",
                    "palk-strait": "palk-strait",
                    "southwest": "lakshadweep-sea",
                    "lakshadweep-sea": "lakshadweep-sea",
                }
                return mapping.get(key, key)

            backend_zone = _resolve_backend_zone(zone)
            url = f"{BACKEND_BASE_URL}/api/marine/{backend_zone}"
            r = requests.get(url, timeout=20)
            # If 404, attempt original zone as fallback
            if r.status_code == 404 and backend_zone != zone:
                r = requests.get(f"{BACKEND_BASE_URL}/api/marine/{zone}", timeout=10)
            r.raise_for_status()
            data = r.json()
            return data
        except Exception as exc:
            return {"error": f"TOOL_ERROR: Unable to fetch forecast data at this time. Error: {str(exc)}"}

    tools = [
        Tool.from_function(
            name="marine_tool",
            func=get_marine_safety,
            description="Get marine safety and wave conditions for a given zone id.",
        ),
        Tool.from_function(
            name="weather_tool",
            func=get_weather,
            description="Get current wind and weather conditions for a given zone id.",
        ),
        Tool.from_function(
            name="meteo_tool",
            func=lambda _: get_meteo_advisory(),
            description="Get the latest Sri Lanka Met Dept marine advisories.",
        ),
        Tool.from_function(
            name="forecast_tool",
            func=_get_forecast,
            description="Get a 7-day marine forecast (hourly + daily) for a given zone id.",
        ),
    ]

    checkpointer = MemorySaver()
    agent = create_agent(
        llm,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        checkpointer=checkpointer,
        max_iterations=1,
    )
    return agent


_agent_graph = None


def get_agent_graph():
    global _agent_graph
    if _agent_graph is None:
        _agent_graph = build_agent()
    return _agent_graph


OFF_TOPIC_REPLY = (
    "I'm focused on marine safety for Sri Lanka's coast - I can "
    "help you check sea conditions, wave forecasts, or safety "
    "advisories for any zone. What would you like to know about "
    "the sea today?"
)

MARINE_TOPIC_KEYWORDS = (
    "safe", "safety", "sea", "marine", "wave", "wind", "swell", "fish", "fishing",
    "coast", "coastal", "harbour", "harbor", "boat", "vessel", "forecast", "weather",
    "advisory", "advisories", "condition", "galle", "colombo", "jaffna", "trincom",
    "mannar", "zone", "caution", "dangerous", "dondra", "matara", "negombo",
    "batticaloa", "maritim", "tide", "current", "marinex", "go out", "met dept",
    "trincomalee", "hambantota", "kilinochchi", "mullaitivu", "beruwala", "hikkaduwa",
)


def _is_marine_safety_topic(message: str) -> bool:
    m = message.lower()
    return any(keyword in m for keyword in MARINE_TOPIC_KEYWORDS)


def _off_topic_reply() -> str:
    return OFF_TOPIC_REPLY


def _explain_safety_term_if_asked(message: str) -> Optional[str]:
    m = message.lower()
    if "caution" in m and any(token in m for token in ("mean", "what is", "what does", "definition")):
        return (
            "CAUTION means moderate sea conditions — typically wave height between 1.0–2.0 m "
            "or wind speed between 20–35 km/h. Small craft operators should exercise caution, "
            "especially near shallow reefs and rocky shorelines. Ask about a specific zone for "
            "today's live verdict."
        )
    return None


def _infer_zone_from_message(message: str) -> str:
    m = message.lower()
    # simple keyword-based inference
    if "bay of bengal" in m or "bengal" in m or "trincom" in m:
        return "east"
    if "gulf of mannar" in m or "mannar" in m or "negombo" in m:
        return "west"
    if "palk" in m or "jaffna" in m:
        return "north"
    if "lakshadweep" in m or "colombo" in m:
        return "southwest"
    if "south" in m or "galle" in m or "matara" in m:
        return "south"
    return "east"


GREETING_PATTERNS = [
    r"^hi\b",
    r"^hello\b",
    r"^hey\b",
    r"^good (morning|afternoon|evening|night)\b",
    r"^ayubowan\b",
    r"^vanakkam\b",
    r"^what's up\b",
    r"\bhow are you\b",
    r"\bhow r u\b",
    r"\bwassup\b",
    r"\byo\b",
    r"\bhelo\b",
    r"\bhii\b",
    r"\bhiiii\b",
    r"\bhelloo\b",
    r"\bhai\b",
    r"\bmorning\b",
    r"\bafternoon\b",
    r"\bevening\b",
    r"\bnight\b",
    r"\bhiya\b",
    r"\bgreetings\b",
    r"\bsalaam\b",
]

CHIT_CHAT_PATTERNS = [
    r"^thank(s| you)",
    r"how's it going",
]


def _is_greeting(message: str) -> bool:
    m = message.lower().strip()
    for p in GREETING_PATTERNS:
        if re.search(p, m):
            return True
    return False


def _greeting_reply(message: str) -> str:
    m = message.lower()
    if any(word in m for word in ["ayubowan", "vanakkam"]):
        return (
            "ආයුබෝවන්! මට ඔබට කෙසේ උදව් කළ හැකිද? "
            "ශ්‍රී ලංකාවේ ඕනෑම වෙරළබඩ කලාපයක් සඳහා "
            "මුහුදු තත්ත්වය, රල පුරෝකථනය හෝ ආරක්ෂක උපදෙස් ගැන මගෙන් අසන්න."
        )
    if any(word in m for word in ["vanakkam", "nalla", "unnu", "nalai"]):
        return (
            "வணக்கம்! நான் உங்களுக்கு எப்படி உதவலாம்? "
            "இலங்கையின் எந்த கடலோர மண்டலத்திற்கும் கடல் நிலைமைகள், அலை முன்னறிவிப்பு அல்லது பாதுகாப்பு அறிவுரைகளைப் பற்றி என்னிடம் கேளுங்கள்."
        )
    if any(word in m for word in ["good morning", "morning"]):
        return (
            "Good morning! How can I help you today? "
            "Ask me about sea conditions, wave forecasts, or safety advisories for any Sri Lanka coastal zone."
        )
    if any(word in m for word in ["good afternoon", "afternoon"]):
        return (
            "Good afternoon! How can I help you today? "
            "Ask me about sea conditions, wave forecasts, or safety advisories for any Sri Lanka coastal zone."
        )
    if any(word in m for word in ["good evening", "evening", "night", "good night"]):
        return (
            "Good evening! How can I help you today? "
            "Ask me about sea conditions, wave forecasts, or safety advisories for any Sri Lanka coastal zone."
        )
    return (
        "Hey! How can I help you today? "
        "Ask me about sea conditions, wave forecasts, or safety advisories for any Sri Lanka coastal zone."
    )


def _is_chitchat(message: str) -> bool:
    m = message.lower().strip()
    if _is_greeting(m):
        return True
    for p in CHIT_CHAT_PATTERNS:
        if re.search(p, m):
            return True
    return False


def _fallback_chat(message: str) -> str:
    if _is_greeting(message):
        return _greeting_reply(message)
    if not _is_marine_safety_topic(message):
        return _off_topic_reply()

    term_reply = _explain_safety_term_if_asked(message)
    if term_reply:
        return term_reply

    zone = _infer_zone_from_message(message)
    safety = get_marine_safety(zone)
    if isinstance(safety, dict) and safety.get("error"):
        return (
            "I wasn't able to retrieve that information right now. "
            "Could you rephrase your question or ask about a specific coastal zone? "
            "For example: 'Is it safe near Galle today?'"
        )
    meteo = get_meteo_advisory()
    if isinstance(meteo, dict) and meteo.get("error"):
        return (
            "I wasn't able to retrieve that information right now. "
            "Could you rephrase your question or ask about a specific coastal zone? "
            "For example: 'Is it safe near Galle today?'"
        )
    verdict = safety.get("level", "UNKNOWN")
    reason = safety.get("reason", "")
    warnings = meteo.get("active_warnings") or []
    warn_text = f" Active warnings: {warnings[0]}" if warnings else ""
    return f"{verdict}. {reason}{warn_text}".strip()


@app.post("/feedback")
async def feedback_endpoint(req: FeedbackRequest) -> Dict[str, Any]:
    """Store user feedback into the agent checkpointer for the session."""
    graph = get_agent_graph()
    if graph is None:
        # fallback: just log to file
        try:
            with open(BASE_DIR / "feedback.log", "a", encoding="utf-8") as f:
                f.write(f"{datetime.utcnow().isoformat()}\t{req.session_id}\t{req.rating}\t{req.comment}\n")
        except Exception:
            pass
        return {"status": "ok", "saved": False}

    # Write into the graph.checkpointer under the same thread_id
    try:
        cp_config = {"configurable": {"thread_id": req.session_id}}
        metadata = {
            "type": "user_feedback",
            "rating": req.rating,
            "comment": req.comment,
            "user_message": req.user_message,
            "assistant_reply": req.assistant_reply,
            "ts": datetime.utcnow().isoformat(),
        }
        # MemorySaver.put expects (config, checkpoint, metadata, new_versions)
        checkpoint = {"channel_values": {"feedback": [metadata]}}
        graph.checkpointer.put(cp_config, checkpoint, metadata, None)
    except Exception:
        # best-effort log
        try:
            with open(BASE_DIR / "feedback.log", "a", encoding="utf-8") as f:
                f.write(f"{datetime.utcnow().isoformat()}\t{req.session_id}\t{req.rating}\t{req.comment}\n")
        except Exception:
            pass

    return {"status": "ok", "saved": True}


# Simple in-memory rate limiter per session_id: allow N requests per WINDOW seconds
_rate_limiter: Dict[str, List[float]] = {}
RATE_LIMIT_WINDOW = int(os.getenv("CHAT_RATE_WINDOW", "60"))  # seconds
RATE_LIMIT_MAX = int(os.getenv("CHAT_RATE_MAX", "20"))


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest) -> ChatResponse:
    # If message is a greeting, respond warmly without invoking the agent
    if _is_greeting(req.message):
        return ChatResponse(session_id=req.session_id, reply=_greeting_reply(req.message))

    # If message is clearly chitchat or off-topic, return polite refusal without invoking the agent
    if _is_chitchat(req.message) or not _is_marine_safety_topic(req.message):
        return ChatResponse(session_id=req.session_id, reply=_off_topic_reply())

    # Lazily initialize the agent; if agent init fails, gracefully fallback
    try:
        graph = get_agent_graph()
    except Exception:
        graph = None

    if graph is None:
        # Gemini not configured or agent failed to initialize; return deterministic fallback
        return ChatResponse(session_id=req.session_id, reply=_fallback_chat(req.message))
    config = {"configurable": {"thread_id": req.session_id}}

    # rate limiting
    now = time.time()
    bucket = _rate_limiter.setdefault(req.session_id, [])
    # drop old timestamps
    bucket[:] = [t for t in bucket if now - t < RATE_LIMIT_WINDOW]
    if len(bucket) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Rate limit exceeded for this session")
    bucket.append(now)

    try:
        result = graph.invoke(
            {"messages": [HumanMessage(content=req.message)]},
            config=config,
        )
    except Exception:
        return ChatResponse(session_id=req.session_id, reply=_fallback_chat(req.message))

    messages = result.get("messages") or []
    if not messages:
        return ChatResponse(
            session_id=req.session_id,
            reply=(
                "I wasn't able to retrieve that information right now. "
                "Could you rephrase your question or ask about a specific coastal zone? "
                "For example: 'Is it safe near Galle today?'"
            ),
        )

    last = messages[-1]
    reply = getattr(last, "content", str(last))

    previous_reply = None
    for msg in reversed(messages[:-1]):
        if hasattr(msg, "role") and msg.role in ("assistant", "ai"):
            previous_reply = getattr(msg, "content", None)
            break
        if hasattr(msg, "__class__") and "AIMessage" in str(type(msg)):
            previous_reply = getattr(msg, "content", None)
            break

    if reply and previous_reply and reply.strip() == previous_reply.strip():
        reply = (
            "I wasn't able to retrieve that information right now. "
            "Could you rephrase your question or ask about a specific coastal zone? "
            "For example: 'Is it safe near Galle today?'"
        )

    if not reply or not str(reply).strip():
        reply = (
            "I wasn't able to retrieve that information right now. "
            "Could you rephrase your question or ask about a specific coastal zone? "
            "For example: 'Is it safe near Galle today?'"
        )

    return ChatResponse(session_id=req.session_id, reply=reply)


@app.post("/chat/clear")
async def clear_chat(session_id: str):
    try:
        graph = get_agent_graph()
        if graph and hasattr(graph, "checkpointer") and hasattr(graph.checkpointer, "storage"):
            keys_to_delete = [
                k for k in graph.checkpointer.storage.keys() if session_id in str(k)
            ]
            for k in keys_to_delete:
                del graph.checkpointer.storage[k]
        return {"status": "cleared", "session_id": session_id}
    except Exception as e:
        return {"status": "ok", "session_id": session_id, "note": str(e)}


@app.get('/chat/stream')
def chat_stream(message: str, session_id: str):
    """SSE stream assistant tokens; emits safety_verdict when available."""
    # If greeting, chitchat, or off-topic, stream a single polite reply instead of invoking the agent
    if _is_greeting(message):
        def single_greeting():
            yield f"event: message\ndata: {_greeting_reply(message)}\n\n"
        return single_greeting()
    if _is_chitchat(message) or not _is_marine_safety_topic(message):
        def single_offtopic():
            yield f"event: message\ndata: { _off_topic_reply() }\n\n"
        return single_offtopic()

    # Lazily initialize the agent; if agent init fails, gracefully fallback to non-agent streaming
    try:
        graph = get_agent_graph()
    except Exception:
        graph = None

    if graph is None:
        def single():
            yield f"event: message\ndata: { _fallback_chat(message) }\n\n"
        return single()

    config = {"configurable": {"thread_id": session_id}}

    def event_stream():
        try:
            for ev in graph.stream_events({"messages": [HumanMessage(content=message)]}, config=config):
                # ev is assumed to be dict-like with 'type' and 'data' keys
                etype = ev.get("type") if isinstance(ev, dict) else getattr(ev, "type", "message")
                data = ev.get("data") if isinstance(ev, dict) else getattr(ev, "data", str(ev))
                if etype == "safety_verdict":
                    yield f"event: safety_verdict\ndata: {data}\n\n"
                else:
                    # default token/message stream
                    yield f"event: message\ndata: {data}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {str(exc)}\n\n"

    return event_stream()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

