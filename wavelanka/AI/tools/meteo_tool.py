import os
from typing import Any, Dict

import requests


BACKEND_BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")


def get_meteo_advisory() -> Dict[str, Any]:
    """
    Fetch current marine advisories from the Sri Lanka Met Dept via backend.
    """
    try:
        url = f"{BACKEND_BASE_URL}/api/meteo"
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success"):
            return {"error": f"TOOL_ERROR: Unable to fetch advisory data at this time. Error: Backend returned error"}

        payload = data["data"]
        advisories = payload.get("advisories", {}) or {}

        text_parts = [
            advisories.get("sea_weather_forecast"),
            advisories.get("fleet_shipping_forecast"),
            advisories.get("severe_weather_advisory"),
        ]
        advisory_text = "\n\n---\n\n".join([p for p in text_parts if p])

        return {
            "source": payload.get("source"),
            "fetched_at": payload.get("fetched_at"),
            "advisory_text": advisory_text,
            "active_warnings": payload.get("active_warnings", []),
        }
    except Exception as e:
        return {"error": f"TOOL_ERROR: Unable to fetch advisory data at this time. Error: {str(e)}"}

