#!/usr/bin/env python3
"""
Wave Lanka Phase 4 — Train predictive safety models for 6h, 12h, and 24h forecasts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import StratifiedKFold, train_test_split

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent
TRAINING_DATA_PATH = AI_DIR / "training_data" / "marine_forecast_data.csv"
MODEL_DIR = SCRIPT_DIR
FEATURES_PATH = MODEL_DIR / "forecast_features.json"
CLASS_NAMES = ["SAFE", "CAUTION", "DANGEROUS", "DO_NOT_GO"]
TARGETS = [6, 12, 24]

FEATURE_NAMES = [
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
]


def load_data() -> pd.DataFrame:
    if not TRAINING_DATA_PATH.exists():
        raise FileNotFoundError(
            f"Training data not found: {TRAINING_DATA_PATH}. Run collect_forecast_data.py first."
        )
    df = pd.read_csv(TRAINING_DATA_PATH)
    missing = [col for col in FEATURE_NAMES + [f"safety_{h}h" for h in TARGETS] if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in training data: {missing}")
    return df


def train_model(
    X: pd.DataFrame,
    y: pd.Series,
    target_hours: int,
    output_path: Path,
) -> dict[str, Any]:
    print("\n" + "-" * 72)
    print(f"Training {target_hours}h model")
    print("-" * 72)

    print("Checking class distribution...")
    for class_id, label in enumerate(CLASS_NAMES):
        count = int((y == class_id).sum())
        print(f"  {label} ({class_id}): {count}")

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )
    except ValueError:
        print("Warning: stratified split failed. Using random split.")
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
        )

    print(f"Training rows: {len(X_train)} | Test rows: {len(X_test)}")

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        random_state=42,
        n_jobs=-1,
    )

    print("Fitting model...")
    model.fit(X_train, y_train)

    print("Computing test accuracy...")
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"Test accuracy: {accuracy:.4f} ({accuracy * 100:.2f}%)")

    print("Running cross-validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores: list[float] = []
    fold = 1
    for train_idx, val_idx in cv.split(X, y):
        print(f"  Fold {fold}/5...")
        X_fold_train, X_fold_val = X.iloc[train_idx], X.iloc[val_idx]
        y_fold_train, y_fold_val = y.iloc[train_idx], y.iloc[val_idx]
        fold_model = RandomForestClassifier(
            n_estimators=300,
            max_depth=12,
            random_state=42,
            n_jobs=-1,
        )
        fold_model.fit(X_fold_train, y_fold_train)
        fold_score = fold_model.score(X_fold_val, y_fold_val)
        cv_scores.append(fold_score)
        print(f"    Fold {fold} accuracy: {fold_score:.4f}")
        fold += 1

    cv_mean = float(np.mean(cv_scores))
    cv_std = float(np.std(cv_scores, ddof=1))
    print(f"Cross-validation accuracy: {cv_mean:.4f} ± {cv_std:.4f}")

    print("Classification report:")
    report = classification_report(
        y_test,
        y_pred,
        labels=[0, 1, 2, 3],
        target_names=CLASS_NAMES,
        digits=4,
        zero_division=0,
    )
    print(report)

    importances = pd.Series(model.feature_importances_, index=FEATURE_NAMES)
    top5 = importances.sort_values(ascending=False).head(5)
    print("Top 5 most important features:")
    for rank, (feature, score) in enumerate(top5.items(), start=1):
        print(f"  {rank}. {feature}: {score * 100:.2f}%")

    print(f"Saving model to {output_path}")
    joblib.dump(model, output_path)

    return {
        "target": target_hours,
        "accuracy": accuracy,
        "cv_mean": cv_mean,
        "cv_std": cv_std,
        "classification_report": report,
        "top5": top5,
        "model_path": output_path,
    }


def sanity_check(features: list[str], model_paths: dict[int, Path]) -> None:
    sample = {
        "wave_height_t0": 1.4,
        "wave_period_t0": 9.0,
        "swell_wave_height_t0": 1.1,
        "swell_wave_period_t0": 13.0,
        "wind_wave_height_t0": 0.8,
        "wind_speed_t0": 28.0,
        "wind_gusts_t0": 42.0,
        "sea_surface_temperature_t0": 29.0,
        "weather_code_t0": 80,
        "month": 7,
        "hour": 8,
        "zone_id": 1,
        "wave_height_t-3h": 1.0,
        "wave_height_t-6h": 0.7,
        "wind_speed_t-3h": 22.0,
        "wind_speed_t-6h": 18.0,
        "wave_delta_3h": 0.4,
        "wave_delta_6h": 0.7,
        "wind_delta_3h": 6.0,
        "swell_trend": 0.3,
        "wave_wind_ratio": 0.05,
        "swell_steepness": 0.085,
        "wave_energy": 1.96,
        "monsoon_flag": 1,
    }

    row = pd.DataFrame([sample], columns=features)
    print("\n" + "=" * 72)
    print("Sanity check predictions for deteriorating monsoon conditions:")
    for hours, path in model_paths.items():
        model = joblib.load(path)
        pred = int(model.predict(row)[0])
        label = CLASS_NAMES[pred]
        print(f"  {hours}h prediction: {label}")
    print("=" * 72)


def main() -> int:
    print("=" * 72)
    print("Wave Lanka — MarineX Predictive Model Training")
    print("=" * 72)

    df = load_data()
    dataset = df.dropna(subset=FEATURE_NAMES + [f"safety_{h}h" for h in TARGETS]).reset_index(drop=True)
    print(f"Loaded {len(dataset)} rows after dropping missing values")

    X = dataset[FEATURE_NAMES]
    results: list[dict[str, Any]] = []
    model_paths: dict[int, Path] = {}

    for horizon in TARGETS:
        y = dataset[f"safety_{horizon}h"].astype(int)
        model_path = MODEL_DIR / f"model_{horizon}h.joblib"
        result = train_model(X, y, horizon, model_path)
        results.append(result)
        model_paths[horizon] = model_path

    print("\nSaving feature list...")
    with open(FEATURES_PATH, "w", encoding="utf-8") as f:
        json.dump(FEATURE_NAMES, f, indent=2)
    print(f"Saved feature list to {FEATURES_PATH}")

    print("\n" + "━" * 80)
    print("MARINEX PREDICTIVE MODEL TRAINING REPORT")
    print("━" * 80)
    for result in results:
        label = f"{result['target']}h Model:"
        print(
            f"{label:10s} Accuracy: {result['accuracy'] * 100:.2f}%  "
            f"CV: {result['cv_mean'] * 100:.2f}% ± {result['cv_std'] * 100:.2f}%"
        )
    print("━" * 80)

    sanity_check(FEATURE_NAMES, model_paths)

    return 0


if __name__ == "__main__":
    sys.exit(main())
