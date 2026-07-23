#!/usr/bin/env python3
"""
Wave Lanka — Phase 1 data verification script.

Tests Open-Meteo Marine/Weather APIs for Sri Lanka coastal zones and
scrapes marine/shipping forecasts from the Department of Meteorology.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from typing import Any

import requests

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Coastal zones
# ---------------------------------------------------------------------------

COASTAL_ZONES = [
    {"name": "Bay of Bengal (East coast)", "lat": 8.5, "lon": 81.2},
    {"name": "Indian Ocean (South coast)", "lat": 5.9, "lon": 80.5},
    {"name": "Gulf of Mannar (West coast)", "lat": 8.9, "lon": 79.9},
    {"name": "Palk Strait (North)", "lat": 9.8, "lon": 80.1},
    {"name": "Lakshadweep Sea (Southwest)", "lat": 6.9, "lon": 79.8},
]

MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine"
WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"
MET_DEPT_URL = "https://meteo.gov.lk"
MET_DEPT_CONTENT_URL = "https://meteo.gov.lk/content.json"

MARINE_HOURLY_VARS = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "wind_wave_height",
    "wind_wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "sea_surface_temperature",
    "ocean_current_velocity",
]

WEATHER_CURRENT_VARS = [
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "weather_code",
    "precipitation",
]

REQUEST_HEADERS = {
    "User-Agent": (
        "WaveLanka-DataVerification/1.0 "
        "(marine fishing safety; contact: wave-lanka@example.com)"
    ),
    "Accept": "text/html,application/json,*/*",
}

REQUEST_TIMEOUT = 30

# WMO weather interpretation codes (subset)
WMO_WEATHER_CODES = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def safe_print(text: str = "") -> None:
    """Print text safely, replacing characters the console cannot render."""
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(
            sys.stdout.encoding or "utf-8", errors="replace"
        ))


def print_header(title: str) -> None:
    line = "=" * 72
    safe_print(f"\n{line}")
    safe_print(title)
    safe_print(line)


def print_subheader(title: str) -> None:
    safe_print(f"\n--- {title} ---")


def format_value(value: Any, unit: str = "") -> str:
    if value is None:
        return "N/A"
    if isinstance(value, float):
        text = f"{value:.2f}"
    else:
        text = str(value)
    return f"{text}{unit}" if unit else text


def weather_code_label(code: Any) -> str:
    if code is None:
        return "N/A"
    label = WMO_WEATHER_CODES.get(int(code), "Unknown")
    return f"{code} ({label})"


def find_current_hour_index(times: list[str], reference: datetime | None = None) -> int:
    """Return the hourly index for the current hour (or nearest past hour)."""
    if not times:
        return 0

    ref = reference or datetime.now(timezone.utc)
    ref_hour = ref.replace(minute=0, second=0, microsecond=0)

    best_idx = 0
    best_dt: datetime | None = None

    for idx, time_str in enumerate(times):
        dt = datetime.fromisoformat(time_str).replace(tzinfo=timezone.utc)
        if dt <= ref_hour and (best_dt is None or dt > best_dt):
            best_dt = dt
            best_idx = idx

    return best_idx


def slice_hours(data: dict[str, Any], key: str, start_idx: int, count: int = 7) -> list[Any]:
    values = data.get(key, [])
    return values[start_idx : start_idx + count]


# ---------------------------------------------------------------------------
# API fetchers
# ---------------------------------------------------------------------------


def fetch_marine_data(lat: float, lon: float) -> dict[str, Any]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(MARINE_HOURLY_VARS),
        "forecast_days": 1,
    }
    print(f"  -> GET {MARINE_API_URL}")
    print(f"     params: lat={lat}, lon={lon}, hourly vars={len(MARINE_HOURLY_VARS)}")

    response = requests.get(
        MARINE_API_URL,
        params=params,
        headers=REQUEST_HEADERS,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def fetch_weather_data(lat: float, lon: float) -> dict[str, Any]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": ",".join(WEATHER_CURRENT_VARS),
        "hourly": ",".join(WEATHER_CURRENT_VARS),
        "forecast_days": 1,
    }
    print(f"  -> GET {WEATHER_API_URL}")
    print(f"     params: lat={lat}, lon={lon}")

    response = requests.get(
        WEATHER_API_URL,
        params=params,
        headers=REQUEST_HEADERS,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def fetch_met_dept_forecast() -> dict[str, Any]:
    """Scrape marine/shipping forecast content from meteo.gov.lk."""
    result: dict[str, Any] = {
        "homepage_ok": False,
        "content_json_ok": False,
        "marine_sections_found": [],
        "sea_weather_forecast": None,
        "fleet_shipping_forecast": None,
        "fisherman_bulletin": None,
        "error": None,
    }

    print(f"  -> GET {MET_DEPT_URL} (homepage)")
    try:
        homepage = requests.get(
            MET_DEPT_URL,
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )
        homepage.raise_for_status()
        result["homepage_ok"] = True
        html = homepage.text

        marine_keywords = [
            ("marine tab", r'data-tab="marine"'),
            ("fleet/shipping tab", r'data-tab="fleet_shipping_forecast"'),
            ("sea weather tab", r'data-tab="sea_weather_forecast"'),
        ]
        for label, pattern in marine_keywords:
            if re.search(pattern, html, re.IGNORECASE):
                result["marine_sections_found"].append(label)

        print(f"     Homepage OK ({len(html):,} bytes)")
        if result["marine_sections_found"]:
            print(f"     Marine UI sections found: {', '.join(result['marine_sections_found'])}")
        else:
            print("     WARNING: No marine/shipping tab markers found in homepage HTML")
    except requests.RequestException as exc:
        result["error"] = f"Homepage fetch failed: {exc}"
        print(f"     FAILED: {exc}")
        return result

    print(f"  -> GET {MET_DEPT_CONTENT_URL} (forecast content)")
    try:
        content_response = requests.get(
            MET_DEPT_CONTENT_URL,
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )
        content_response.raise_for_status()
        content_response.encoding = content_response.apparent_encoding or "utf-8"
        data = content_response.json()
        result["content_json_ok"] = True

        for field in ("sea_weather_forecast", "fleet_shipping_forecast", "fisherman_bulletin"):
            text = data.get(field)
            if text and str(text).strip():
                result[field] = str(text).strip()
                result["marine_sections_found"].append(f"{field} (content.json)")

        print("     content.json OK")
        print(
            f"     Fields retrieved: "
            f"sea_weather={'yes' if result['sea_weather_forecast'] else 'no'}, "
            f"fleet_shipping={'yes' if result['fleet_shipping_forecast'] else 'no'}, "
            f"fisherman_bulletin={'yes' if result['fisherman_bulletin'] else 'no'}"
        )
    except (requests.RequestException, json.JSONDecodeError) as exc:
        msg = f"content.json fetch/parse failed: {exc}"
        result["error"] = msg
        print(f"     FAILED: {exc}")

    return result


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------


def print_marine_forecast(zone_name: str, data: dict[str, Any]) -> None:
    print_subheader(f"Open-Meteo Marine — {zone_name}")

    hourly = data.get("hourly", {})
    units = data.get("hourly_units", {})
    times = hourly.get("time", [])

    if not times:
        print("  No hourly marine data returned.")
        return

    start_idx = find_current_hour_index(times)
    window_times = slice_hours(hourly, "time", start_idx, 7)

    print(f"  Timezone: {data.get('timezone', 'unknown')}")
    print(f"  Showing current hour + next 6 hours ({len(window_times)} entries)\n")

    header = (
        f"{'Time':<18} {'Wave':>6} {'W.Dir':>6} {'W.Per':>6} "
        f"{'WW.H':>6} {'WW.P':>6} {'Sw.H':>6} {'Sw.Dir':>6} {'Sw.P':>6} "
        f"{'SST':>6} {'Curr':>6}"
    )
    print(header)
    print("-" * len(header))

    for offset, time_str in enumerate(window_times):
        idx = start_idx + offset
        label = "NOW" if offset == 0 else f"+{offset}h"
        row = (
            f"{time_str} {label:<4} "
            f"{format_value(hourly['wave_height'][idx]):>6} "
            f"{format_value(hourly['wave_direction'][idx]):>6} "
            f"{format_value(hourly['wave_period'][idx]):>6} "
            f"{format_value(hourly['wind_wave_height'][idx]):>6} "
            f"{format_value(hourly['wind_wave_period'][idx]):>6} "
            f"{format_value(hourly['swell_wave_height'][idx]):>6} "
            f"{format_value(hourly['swell_wave_direction'][idx]):>6} "
            f"{format_value(hourly['swell_wave_period'][idx]):>6} "
            f"{format_value(hourly['sea_surface_temperature'][idx]):>6} "
            f"{format_value(hourly['ocean_current_velocity'][idx]):>6}"
        )
        print(row)

    print(
        f"\n  Units: wave={units.get('wave_height', 'm')}, "
        f"SST={units.get('sea_surface_temperature', 'C')}, "
        f"current={units.get('ocean_current_velocity', 'km/h')}"
    )


def print_weather_forecast(zone_name: str, data: dict[str, Any]) -> None:
    print_subheader(f"Open-Meteo Weather — {zone_name}")

    current = data.get("current", {})
    current_units = data.get("current_units", {})
    hourly = data.get("hourly", {})
    hourly_units = data.get("hourly_units", {})
    times = hourly.get("time", [])

    print("  CURRENT CONDITIONS")
    print(f"    Time:           {current.get('time', 'N/A')}")
    print(
        f"    Wind speed:     {format_value(current.get('wind_speed_10m'))} "
        f"{current_units.get('wind_speed_10m', '')}"
    )
    print(
        f"    Wind direction: {format_value(current.get('wind_direction_10m'))} "
        f"{current_units.get('wind_direction_10m', '')}"
    )
    print(
        f"    Wind gusts:     {format_value(current.get('wind_gusts_10m'))} "
        f"{current_units.get('wind_gusts_10m', '')}"
    )
    print(f"    Weather:        {weather_code_label(current.get('weather_code'))}")
    print(
        f"    Precipitation:  {format_value(current.get('precipitation'))} "
        f"{current_units.get('precipitation', '')}"
    )

    if not times:
        print("\n  No hourly weather data returned.")
        return

    start_idx = find_current_hour_index(times)
    window_times = slice_hours(hourly, "time", start_idx + 1, 6)

    print(f"\n  NEXT 6 HOURLY FORECASTS (from index {start_idx + 1})\n")
    header = f"{'Time':<18} {'Wind':>8} {'W.Dir':>7} {'Gusts':>8} {'Weather':>22} {'Precip':>8}"
    print(header)
    print("-" * len(header))

    for offset, time_str in enumerate(window_times):
        idx = start_idx + 1 + offset
        print(
            f"{time_str} +{offset + 1}h "
            f"{format_value(hourly['wind_speed_10m'][idx]):>8} "
            f"{format_value(hourly['wind_direction_10m'][idx]):>7} "
            f"{format_value(hourly['wind_gusts_10m'][idx]):>8} "
            f"{weather_code_label(hourly['weather_code'][idx]):>22} "
            f"{format_value(hourly['precipitation'][idx]):>8}"
        )

    print(
        f"\n  Units: wind={hourly_units.get('wind_speed_10m', 'km/h')}, "
        f"precip={hourly_units.get('precipitation', 'mm')}"
    )


def print_met_dept_results(data: dict[str, Any]) -> None:
    print_subheader("Department of Meteorology — Marine / Shipping Forecast")

    if data.get("homepage_ok"):
        print("  Homepage: OK")
    else:
        print("  Homepage: FAILED")

    if data.get("content_json_ok"):
        print("  Forecast content (content.json): OK")
    else:
        print("  Forecast content (content.json): FAILED")

    sections = data.get("marine_sections_found", [])
    if sections:
        print(f"  Sections located: {', '.join(dict.fromkeys(sections))}")

    def print_forecast_block(title: str, text: str | None, max_lines: int = 40) -> None:
        safe_print(f"\n  [{title}]")
        if not text:
            safe_print("    (not available)")
            return
        lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
        for line in lines[:max_lines]:
            safe_print(f"    {line}")
        if len(lines) > max_lines:
            safe_print(f"    ... ({len(lines) - max_lines} more lines)")

    print_forecast_block("Sea Weather Forecast", data.get("sea_weather_forecast"))
    print_forecast_block("Fleet / Shipping Forecast", data.get("fleet_shipping_forecast"))

    if data.get("fisherman_bulletin"):
        print_forecast_block("Fisherman Bulletin", data.get("fisherman_bulletin"), max_lines=15)

    if data.get("error"):
        print(f"\n  Error detail: {data['error']}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    print_header("WAVE LANKA — Phase 1 Data Verification")
    print(f"Started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Testing {len(COASTAL_ZONES)} coastal zones + Met Dept forecast\n")

    summary: dict[str, str] = {}

    for zone in COASTAL_ZONES:
        zone_key = zone["name"]
        print_header(f"ZONE: {zone_key}")
        print(f"Coordinates: lat={zone['lat']}, lon={zone['lon']}")

        marine_key = f"Marine API — {zone_key}"
        weather_key = f"Weather API — {zone_key}"

        try:
            print("\nFetching marine data...")
            marine_data = fetch_marine_data(zone["lat"], zone["lon"])
            print_marine_forecast(zone_key, marine_data)
            summary[marine_key] = "OK"
            print(f"\n  [SUCCESS] {marine_key}")
        except requests.RequestException as exc:
            summary[marine_key] = f"FAILED: {exc}"
            print(f"\n  [FAILED] {marine_key}: {exc}")

        try:
            print("\nFetching weather data...")
            weather_data = fetch_weather_data(zone["lat"], zone["lon"])
            print_weather_forecast(zone_key, weather_data)
            summary[weather_key] = "OK"
            print(f"\n  [SUCCESS] {weather_key}")
        except requests.RequestException as exc:
            summary[weather_key] = f"FAILED: {exc}"
            print(f"\n  [FAILED] {weather_key}: {exc}")

    print_header("SRI LANKA METEOROLOGICAL DEPARTMENT")
    met_key = "Met Dept (meteo.gov.lk)"
    try:
        print("\nFetching Met Dept marine/shipping forecast...")
        met_data = fetch_met_dept_forecast()
        print_met_dept_results(met_data)

        has_forecast = bool(
            met_data.get("sea_weather_forecast") or met_data.get("fleet_shipping_forecast")
        )
        if met_data.get("content_json_ok") and has_forecast:
            summary[met_key] = "OK"
            print(f"\n  [SUCCESS] {met_key}")
        elif met_data.get("homepage_ok"):
            summary[met_key] = "PARTIAL (homepage only, no forecast text)"
            print(f"\n  [PARTIAL] {met_key}")
        else:
            summary[met_key] = "FAILED"
            print(f"\n  [FAILED] {met_key}")
    except Exception as exc:  # noqa: BLE001 — top-level verification script
        summary[met_key] = f"FAILED: {exc}"
        print(f"\n  [FAILED] {met_key}: {exc}")

    # Final summary
    print_header("VERIFICATION SUMMARY")
    ok_count = sum(1 for status in summary.values() if status == "OK")
    fail_count = sum(1 for status in summary.values() if status.startswith("FAILED"))
    partial_count = len(summary) - ok_count - fail_count

    print(f"Total checks: {len(summary)}")
    print(f"  Successful: {ok_count}")
    print(f"  Partial:    {partial_count}")
    print(f"  Failed:     {fail_count}\n")

    print(f"{'Data Source':<45} {'Status'}")
    print("-" * 72)
    for source, status in summary.items():
        marker = "[OK]" if status == "OK" else ("[~~]" if status.startswith("PARTIAL") else "[FAIL]")
        safe_print(f"{marker} {source:<43} {status}")

    print()
    if fail_count == 0 and partial_count == 0:
        print("All data sources returned successfully. Ready for Phase 2.")
        return 0
    if fail_count == 0:
        print("All primary sources responded; some returned partial data.")
        return 0
    print("Some data sources failed. Review errors above before proceeding.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
