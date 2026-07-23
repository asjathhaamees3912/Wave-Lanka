#!/usr/bin/env python3
"""
Wave Lanka Phase 4 — Collect historical forecast training data.

Fetches 180 days of hourly marine + weather data for all 5 Sri Lanka coastal zones,
builds lagged and engineered features, computes 6h/12h/24h safety targets, and
saves the result as AI/training_data/marine_forecast_data.csv.
"""

from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent
TRAINING_DATA_PATH = AI_DIR / "training_data" / "marine_forecast_data.csv"
MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine"
WEATHER_ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"
REQUEST_TIMEOUT = 60
REQUEST_HEADERS = {
    "User-Agent": "WaveLanka-ML/1.0 (marine forecast safety training)",
}
TIMEZONE = "Asia/Colombo"
MARINE_PAST_DAYS = 92
MARINE_FORECAST_DAYS = 1
WEATHER_HISTORY_DAYS = 93

ZONES = [
    {
        "zone_id": 0,
        "id": "bay-of-bengal",
        "name": "Bay of Bengal",
        "lat": 8.55,
        "lon": 81.80,
    },
    {
        "zone_id": 1,
        "id": "indian-ocean",
        "name": "Indian Ocean",
        "lat": 5.50,
        "lon": 80.55,
    },
    {
        "zone_id": 2,
        "id": "gulf-of-mannar",
        "name": "Gulf of Mannar",
        "lat": 8.90,
        "lon": 79.50,
    },
    {
        "zone_id": 3,
        "id": "palk-strait",
        "name": "Palk Strait",
        "lat": 9.78,
        "lon": 80.08,
    },
    {
        "zone_id": 4,
        "id": "lakshadweep-sea",
        "name": "Lakshadweep Sea",
        "lat": 6.50,
        "lon": 79.20,
    },
]

ALTERNATIVE_COORDS = {
    "bay-of-bengal": {"lat": 9.0, "lon": 82.5},
    "indian-ocean": {"lat": 5.0, "lon": 80.0},
    "gulf-of-mannar": {"lat": 8.5, "lon": 78.5},
    "palk-strait": {"lat": 9.5, "lon": 80.5},
    "lakshadweep-sea": {"lat": 7.0, "lon": 77.5},
}

MARINE_VARS = [
    "wave_height",
    "wave_period",
    "wave_direction",
    "swell_wave_height",
    "swell_wave_period",
    "wind_wave_height",
    "sea_surface_temperature",
]

WEATHER_VARS = [
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "weather_code",
    "precipitation",
]

TARGETS = [6, 12, 24]


def date_range(days: int) -> tuple[str, str]:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


def build_request_url(url: str, params: dict[str, Any]) -> str:
    request = requests.Request("GET", url, params=params).prepare()
    return request.url


def validate_marine_response(data: dict[str, Any], zone_name: str) -> bool:
    hourly = data.get("hourly", {})
    wave = hourly.get("wave_height", [])
    valid = sum(1 for v in wave if v is not None)
    total = len(wave)
    print(f"{zone_name}: {valid}/{total} valid wave_height values")
    if total == 0:
        print(f"WARNING: {zone_name} returned no hourly marine wave data")
        return False
    if valid < total * 0.5:
        print(f"WARNING: {zone_name} has too many null values")
        print("Trying alternative coordinates...")
        return False
    return True


def fetch_marine_hourly(zone: dict[str, Any]) -> dict[str, Any]:
    params = {
        "latitude": zone["lat"],
        "longitude": zone["lon"],
        "hourly": ",".join(MARINE_VARS),
        "past_days": MARINE_PAST_DAYS,
        "forecast_days": MARINE_FORECAST_DAYS,
        "timezone": TIMEZONE,
    }
    url = build_request_url(MARINE_API_URL, params)
    print(f"  -> {MARINE_API_URL}")
    print(f"     zone={zone['id']} ({zone['lat']}, {zone['lon']})")
    print(f"     url={url}")

    response = requests.get(
        MARINE_API_URL,
        params=params,
        headers=REQUEST_HEADERS,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def fetch_weather_hourly(zone: dict[str, Any], start_date: str, end_date: str) -> dict[str, Any]:
    params = {
        "latitude": zone["lat"],
        "longitude": zone["lon"],
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ",".join(WEATHER_VARS),
        "timezone": TIMEZONE,
    }
    url = build_request_url(WEATHER_ARCHIVE_API_URL, params)
    print(f"  -> {WEATHER_ARCHIVE_API_URL}")
    print(f"     zone={zone['id']} ({zone['lat']}, {zone['lon']})")
    print(f"     url={url}")

    response = requests.get(
        WEATHER_ARCHIVE_API_URL,
        params=params,
        headers=REQUEST_HEADERS,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def hourly_to_dataframe(api_data: dict[str, Any], zone: dict[str, Any]) -> pd.DataFrame:
    hourly = api_data.get("hourly", {})
    times = hourly.get("time", [])
    if not times:
        raise ValueError(f"No hourly data returned for zone {zone['id']}")

    frame: dict[str, Any] = {"time": pd.to_datetime(times)}
    for key, values in hourly.items():
        if key == "time":
            continue
        frame[key] = values

    df = pd.DataFrame(frame)
    df["zone_id"] = zone["zone_id"]
    df["zone_name"] = zone["name"]
    return df


def collect_zone(zone: dict[str, Any], start_date: str, end_date: str, test_mode: bool = False) -> pd.DataFrame:
    print(f"Collecting zone: {zone['name']} (zone_id={zone['zone_id']})")
    marine_data = fetch_marine_hourly(zone)
    if not validate_marine_response(marine_data, zone["name"]):
        alt = ALTERNATIVE_COORDS.get(zone["id"])
        if alt:
            print(f"Trying alternative coords for {zone['name']}: {alt['lat']}, {alt['lon']}")
            zone = {**zone, **alt}
            marine_data = fetch_marine_hourly(zone)
            if not validate_marine_response(marine_data, zone["name"]):
                raise ValueError(f"Marine data invalid for zone {zone['name']} even after alternative coordinates")
        else:
            raise ValueError(f"Marine data invalid for zone {zone['name']}")

    if test_mode:
        return pd.DataFrame({"raw_marine": [marine_data]})

    marine_df = hourly_to_dataframe(marine_data, zone)
    weather_data = fetch_weather_hourly(zone, start_date, end_date)
    weather_df = hourly_to_dataframe(weather_data, zone)

    merged = marine_df.merge(
        weather_df[
            [
                "time",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m",
                "weather_code",
                "precipitation",
            ]
        ],
        on="time",
        how="inner",
    )

    return merged


def compute_safety_class(
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


def monsoon_flag(month: int, zone_id: int) -> int:
    if month in [5, 6, 7, 8, 9] and zone_id in [1, 4]:
        return 1
    if month in [10, 11, 12, 1, 2] and zone_id in [0, 3]:
        return 1
    return 0


def build_feature_rows(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.sort_values(["zone_id", "time"]).reset_index(drop=True)
    df["month"] = df["time"].dt.month
    df["hour"] = df["time"].dt.hour

    # current conditions
    df["wave_height_t0"] = df["wave_height"]
    df["wave_period_t0"] = df["wave_period"]
    df["swell_wave_height_t0"] = df["swell_wave_height"]
    df["swell_wave_period_t0"] = df["swell_wave_period"]
    df["wind_wave_height_t0"] = df["wind_wave_height"]
    df["wind_speed_t0"] = df["wind_speed_10m"]
    df["wind_gusts_t0"] = df["wind_gusts_10m"]
    df["sea_surface_temperature_t0"] = df["sea_surface_temperature"]
    df["weather_code_t0"] = df["weather_code"].astype("Int64")

    # lag features
    df["wave_height_t-3h"] = df.groupby("zone_id")["wave_height_t0"].shift(3)
    df["wave_height_t-6h"] = df.groupby("zone_id")["wave_height_t0"].shift(6)
    df["wind_speed_t-3h"] = df.groupby("zone_id")["wind_speed_t0"].shift(3)
    df["wind_speed_t-6h"] = df.groupby("zone_id")["wind_speed_t0"].shift(6)
    df["wave_delta_3h"] = df["wave_height_t0"] - df["wave_height_t-3h"]
    df["wave_delta_6h"] = df["wave_height_t0"] - df["wave_height_t-6h"]
    df["wind_delta_3h"] = df["wind_speed_t0"] - df["wind_speed_t-3h"]
    df["swell_trend"] = df["swell_wave_height_t0"] - df.groupby("zone_id")["swell_wave_height_t0"].shift(3)

    # engineered features
    df["wave_wind_ratio"] = df["wave_height_t0"] / df["wind_speed_t0"].clip(lower=1.0)
    df["swell_steepness"] = df["swell_wave_height_t0"] / df["swell_wave_period_t0"].clip(lower=1.0)
    df["wave_energy"] = df["wave_height_t0"] ** 2
    df["monsoon_flag"] = df.apply(lambda row: monsoon_flag(int(row["month"]), int(row["zone_id"])), axis=1)

    # forecast targets
    for horizon in TARGETS:
        future = df.groupby("zone_id").shift(-horizon)
        safety = []
        for idx, row in df.iterrows():
            future_row = future.loc[idx]
            if pd.isna(future_row["wave_height"]):
                safety.append(pd.NA)
                continue
            safety.append(
                compute_safety_class(
                    wave=float(future_row["wave_height"]),
                    wind=float(future_row["wind_speed_10m"] or 0.0),
                    gusts=float(future_row["wind_gusts_10m"] or 0.0),
                    swell=float(future_row["swell_wave_height"] or 0.0),
                    period=float(future_row["swell_wave_period"] or 0.0),
                    month=int(pd.to_datetime(future_row["time"]).month),
                    zone_id=int(row["zone_id"]),
                )
            )
        df[f"safety_{horizon}h"] = pd.array(safety, dtype="Int64")

    return df


# legacy helper removed; collect_zone above is the current implementation.


def main() -> int:
    test_mode = "--test" in sys.argv
    start_date, end_date = date_range(WEATHER_HISTORY_DAYS)
    print("=" * 72)
    print("Wave Lanka — Forecast Training Data Collection")
    print("=" * 72)
    print(f"Date range: {start_date} to {end_date} ({WEATHER_HISTORY_DAYS} days)")
    print(f"Zones: {len(ZONES)}\n")

    if test_mode:
        print("TEST MODE - Bay of Bengal only")
        zone = next(z for z in ZONES if z["id"] == "bay-of-bengal")
        marine_data = fetch_marine_hourly(zone)
        print("Raw wave_height values (first 10):")
        wave = marine_data.get("hourly", {}).get("wave_height", [])
        print(wave[:10])
        print("API URL:")
        print(build_request_url(MARINE_API_URL, {
            "latitude": zone["lat"],
            "longitude": zone["lon"],
            "hourly": ",".join(MARINE_VARS),
            "past_days": MARINE_PAST_DAYS,
            "forecast_days": MARINE_FORECAST_DAYS,
            "timezone": TIMEZONE,
        }))
        return 0

    frames: list[pd.DataFrame] = []
    rows_per_zone: dict[str, int] = {}
    for zone in ZONES:
        try:
            zone_df = collect_zone(zone, start_date, end_date)
            frames.append(zone_df)
            rows_per_zone[zone["id"]] = len(zone_df)
            print(f"  OK — {len(zone_df)} hourly rows\n")
        except requests.RequestException as exc:
            print(f"  FAILED — {exc}\n", file=sys.stderr)
            return 1
        except ValueError as exc:
            print(f"  FAILED — {exc}\n", file=sys.stderr)
            return 1

    dataset = pd.concat(frames, ignore_index=True)
    dataset = build_feature_rows(dataset)

    required_columns = [
        "wave_height_t0",
        "wave_period_t0",
        "swell_wave_height_t0",
        "swell_wave_period_t0",
        "wind_wave_height_t0",
        "wind_speed_t0",
        "wind_gusts_t0",
        "sea_surface_temperature_t0",
        "weather_code_t0",
        "month",
        "hour",
        "zone_id",
        "wave_height_t-3h",
        "wave_height_t-6h",
        "wind_speed_t-3h",
        "wind_speed_t-6h",
        "wave_delta_3h",
        "wave_delta_6h",
        "wind_delta_3h",
        "swell_trend",
        "wave_wind_ratio",
        "swell_steepness",
        "wave_energy",
        "monsoon_flag",
        "safety_6h",
        "safety_12h",
        "safety_24h",
    ]

    filtered = dataset.dropna(subset=required_columns).reset_index(drop=True)

    TRAINING_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    filtered.to_csv(TRAINING_DATA_PATH, index=False)

    print("=" * 72)
    print(f"Total rows collected: {len(filtered)}")
    if len(filtered):
        print(f"Date range covered: {filtered['time'].min()} to {filtered['time'].max()}")
    print("Rows per zone:")
    for zone_id, count in rows_per_zone.items():
        print(f"  {zone_id}: {count} rows")

    print("\nClass distribution (safety_6h):")
    counts = filtered["safety_6h"].value_counts().sort_index()
    total = len(filtered)
    labels = ["SAFE", "CAUTION", "DANGEROUS", "DO NOT GO"]
    for class_id in range(4):
        count = int(counts.get(class_id, 0))
        pct = 100.0 * count / total if total else 0.0
        print(f"  {labels[class_id]} ({class_id}): {count} rows ({pct:.1f}%)")

    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
