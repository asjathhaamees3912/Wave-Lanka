#!/usr/bin/env python3
"""
Wave Lanka Phase 3 — Test inference with the trained marine safety model.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_PATH = SCRIPT_DIR / "marine_safety_model.joblib"
FEATURES_PATH = SCRIPT_DIR / "model_features.json"

CLASS_NAMES = ["SAFE", "CAUTION", "DANGEROUS", "DO_NOT_GO"]


def build_features(
    wave_height: float,
    wind_speed: float,
    swell_height: float,
    wave_period: float,
    swell_period: float,
    wind_gusts: float,
    weather_code: int,
    month: int,
    zone_id: int,
    wind_wave_height: float | None = None,
) -> pd.DataFrame:
    if wind_wave_height is None:
        wind_wave_height = min(wave_height, max(wave_height * 0.6, 0.1))

    wave_wind_ratio = wave_height / max(wind_speed, 1.0)
    swell_steepness = swell_height / max(swell_period, 1.0)

    row = {
        "wave_height": wave_height,
        "wave_period": wave_period,
        "wind_wave_height": wind_wave_height,
        "swell_wave_height": swell_height,
        "swell_wave_period": swell_period,
        "wind_speed_10m": wind_speed,
        "wind_gusts_10m": wind_gusts,
        "weather_code": weather_code,
        "month": month,
        "zone_id": zone_id,
        "wave_wind_ratio": wave_wind_ratio,
        "swell_steepness": swell_steepness,
    }

    with open(FEATURES_PATH, encoding="utf-8") as f:
        feature_names = json.load(f)

    return pd.DataFrame([row])[feature_names]


def predict(
    wave_height: float,
    wind_speed: float,
    swell_height: float,
    wave_period: float,
    swell_period: float,
    wind_gusts: float,
    weather_code: int,
    month: int,
    zone_id: int,
    wind_wave_height: float | None = None,
) -> tuple[str, float, np.ndarray]:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. Run train.py first."
        )

    model = joblib.load(MODEL_PATH)
    features = build_features(
        wave_height=wave_height,
        wind_speed=wind_speed,
        swell_height=swell_height,
        wave_period=wave_period,
        swell_period=swell_period,
        wind_gusts=wind_gusts,
        weather_code=weather_code,
        month=month,
        zone_id=zone_id,
        wind_wave_height=wind_wave_height,
    )

    prediction = int(model.predict(features)[0])
    raw_probs = model.predict_proba(features)[0]
    class_to_idx = {int(c): i for i, c in enumerate(model.classes_)}

    probabilities = np.zeros(len(CLASS_NAMES))
    for class_id, idx in class_to_idx.items():
        probabilities[class_id] = raw_probs[idx]

    confidence = float(probabilities[prediction])

    return CLASS_NAMES[prediction], confidence, probabilities


def main() -> int:
    print("=" * 72)
    print("Wave Lanka — Marine Safety Prediction (sample)")
    print("=" * 72)

    sample = {
        "wave_height": 2.1,
        "wind_speed": 38,
        "swell_height": 1.8,
        "wave_period": 9,
        "swell_period": 12,
        "wind_gusts": 52,
        "weather_code": 80,
        "month": 6,
        "zone_id": 0,
    }

    print("\nInput features:")
    for key, value in sample.items():
        print(f"  {key}: {value}")

    try:
        label, confidence, probs = predict(
            wave_height=sample["wave_height"],
            wind_speed=sample["wind_speed"],
            swell_height=sample["swell_height"],
            wave_period=sample["wave_period"],
            swell_period=sample["swell_period"],
            wind_gusts=sample["wind_gusts"],
            weather_code=sample["weather_code"],
            month=sample["month"],
            zone_id=sample["zone_id"],
        )
    except FileNotFoundError as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        return 1

    print("\nPrediction:")
    print(f"  Safety class: {label}")
    print(f"  Confidence:   {confidence:.4f} ({confidence * 100:.2f}%)")

    print("\nClass probabilities:")
    for class_id, name in enumerate(CLASS_NAMES):
        print(f"  {name}: {probs[class_id]:.4f}")

    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
