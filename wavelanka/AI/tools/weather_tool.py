import os
from typing import Any, Dict

import requests


def clean_url(url: str | None) -> str:
    if not url:
        return ""
    cleaned = url.replace("'", "").replace('"', '').strip()
    if cleaned and not cleaned.startswith("http://") and not cleaned.startswith("https://"):
        cleaned = "https://" + cleaned
    return cleaned

BACKEND_BASE_URL = clean_url(os.getenv("BACKEND_URL", "http://localhost:5000"))


# same alias mapping as marine tool (keep in sync)
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


def get_weather(zone: str) -> Dict[str, Any]:
    """
    Fetch current wind and weather for a zone from the Wave Lanka backend.
    """
    try:
        backend_zone = _resolve_backend_zone(zone)
        url = f"{BACKEND_BASE_URL}/api/weather/{backend_zone}"
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success"):
            return {"error": f"TOOL_ERROR: Unable to fetch weather data at this time. Error: Backend returned error"}

        payload = data["data"]
        current = payload.get("current", {}) or {}

        return {
            "zone": payload.get("zone"),
            "timezone": payload.get("timezone"),
            "wind_speed_10m": current.get("wind_speed_10m"),
            "wind_gusts_10m": current.get("wind_gusts_10m"),
            "wind_direction_10m": current.get("wind_direction_10m"),
            "weather_code": current.get("weather_code"),
            "weather_label": current.get("weather_label"),
            "precipitation": current.get("precipitation"),
            "visibility": current.get("visibility"),
        }
    except Exception as e:
        return {"error": f"TOOL_ERROR: Unable to fetch weather data at this time. Error: {str(e)}"}

