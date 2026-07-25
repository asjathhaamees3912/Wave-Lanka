import os
from typing import Any, Dict

import requests


BACKEND_BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
AI_BASE_URL = os.getenv("AI_BASE_URL", "http://localhost:8000")


# Map friendly short zone keys to backend zone ids
ZONE_ALIAS_TO_BACKEND = {
    "east": "bay-of-bengal",
    "bay_of_bengal": "bay-of-bengal",
    "bay-of-bengal": "bay-of-bengal",
    "south": "indian-ocean",
    "indian_ocean_south": "indian-ocean",
    "indian-ocean": "indian-ocean",
    "west": "gulf-of-mannar",
    "gulf_of_mannar": "gulf-of-mannar",
    "gulf-of-mannar": "gulf-of-mannar",
    "north": "palk-strait",
    "palk": "palk-strait",
    "palk-strait": "palk-strait",
    "southwest": "lakshadweep-sea",
    "lakshadweep_sea": "lakshadweep-sea",
    "lakshadweep-sea": "lakshadweep-sea",
}


def _resolve_backend_zone(zone: str) -> str:
    if not zone:
        return zone
    key = str(zone).strip().lower().replace(" ", "-").replace("_", "-")
    return ZONE_ALIAS_TO_BACKEND.get(key, key)


def _is_remote_ai_url(url: str) -> bool:
    if not url:
        return False
    return not any(h in url for h in ("localhost", "127.0.0.1"))


def get_marine_safety(zone: str) -> Dict[str, Any]:
    """
    Fetch marine safety assessment for a zone from the Wave Lanka backend.
    Returns a dict with either the expected fields or an "error" key on failure.
    """
    try:
        backend_zone = _resolve_backend_zone(zone)
        url = f"{BACKEND_BASE_URL}/api/safety/{backend_zone}"
        resp = requests.get(url, timeout=30)
        # If the backend returned 404 for a friendly alias, try the raw zone as a fallback
        if resp.status_code == 404 and backend_zone != zone:
            resp = requests.get(f"{BACKEND_BASE_URL}/api/safety/{zone}", timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success"):
            return {"error": "TOOL_ERROR: Unable to fetch marine safety data at this time. Error: Backend returned error"}

        payload = data["data"]

        # Try to get ML prediction and inject into payload for LLM use (skip local AI callbacks)
        try:
            if _is_remote_ai_url(AI_BASE_URL):
                ml_resp = requests.post(f"{AI_BASE_URL}/predict", json={"zone": backend_zone}, timeout=10)
                if ml_resp.ok:
                    ml = ml_resp.json()
                    payload["ml_safety_class"] = ml.get("safety_class")
                    payload["ml_confidence"] = ml.get("confidence")
                    payload["ml_reason"] = ml.get("reason")
        except Exception:
            # If ML fails, keep payload as-is (rules will be used)
            pass

        # Fetch lag data (best-effort)
        lag_data = {}
        try:
            lag_resp = requests.get(f"{BACKEND_BASE_URL}/api/marine/{backend_zone}/lag", timeout=5)
            if lag_resp.ok:
                lag_data = lag_resp.json().get("data", {})
        except Exception:
            lag_data = {}

        # Try remote forecast ML (skip if AI service is local to avoid deadlocks)
        try:
            forecast = None
            if _is_remote_ai_url(AI_BASE_URL):
                forecast_resp = requests.post(
                    f"{AI_BASE_URL}/predict/forecast",
                    json={
                        "zone": backend_zone,
                        "current_data": {
                            "wave_height": payload.get("current_conditions", {}).get("wave_height"),
                            "wave_period": payload.get("current_conditions", {}).get("wave_period"),
                            "swell_wave_height": payload.get("current_conditions", {}).get("swell_wave_height"),
                            "swell_wave_period": payload.get("current_conditions", {}).get("swell_wave_period"),
                            "wind_wave_height": payload.get("current_conditions", {}).get("wind_wave_height"),
                            "wind_speed": payload.get("current_conditions", {}).get("wind_speed_10m"),
                            "wind_gusts": payload.get("current_conditions", {}).get("wind_gusts_10m"),
                            "sea_surface_temperature": payload.get("current_conditions", {}).get("sea_surface_temperature"),
                            "weather_code": payload.get("current_conditions", {}).get("weather_code"),
                        },
                        "lag_data": lag_data,
                    },
                    timeout=8,
                )
                if forecast_resp.ok:
                    forecast = forecast_resp.json()
            if forecast:
                payload["ml_forecast"] = {
                    "trend": forecast.get("trend"),
                    "trend_label": forecast.get("trend_label"),
                    "in_6h": forecast.get("predictions", {}).get("in_6h", {}).get("safety_class"),
                    "in_12h": forecast.get("predictions", {}).get("in_12h", {}).get("safety_class"),
                    "in_24h": forecast.get("predictions", {}).get("in_24h", {}).get("safety_class"),
                    "confidence_6h": forecast.get("predictions", {}).get("in_6h", {}).get("confidence"),
                    "safe_window": forecast.get("safe_window"),
                }
        except Exception:
            pass

        return {
            "zone": payload.get("zone") or backend_zone,
            "level": payload.get("level"),
            "reason": payload.get("reason"),
            "current_conditions": payload.get("current_conditions"),
            "best_safe_window": payload.get("best_safe_window"),
            "ml_safety_class": payload.get("ml_safety_class"),
            "ml_confidence": payload.get("ml_confidence"),
            "ml_reason": payload.get("ml_reason"),
            "ml_forecast": payload.get("ml_forecast"),
        }
    except Exception as e:
        return {"error": f"TOOL_ERROR: Unable to fetch marine safety data at this time. Error: {str(e)}"}
