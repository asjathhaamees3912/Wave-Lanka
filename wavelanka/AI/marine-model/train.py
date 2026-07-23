#!/usr/bin/env python3
"""
Wave Lanka Phase 3 — Train Random Forest marine safety classifier.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent
TRAINING_DATA_PATH = AI_DIR / "training_data" / "marine_training_data.csv"
MODEL_PATH = SCRIPT_DIR / "marine_safety_model.joblib"
FEATURES_PATH = SCRIPT_DIR / "model_features.json"

CLASS_NAMES = ["SAFE", "CAUTION", "DANGEROUS", "DO_NOT_GO"]


def load_feature_names() -> list[str]:
    with open(FEATURES_PATH, encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    print("=" * 72)
    print("Wave Lanka — Marine Safety Model Training")
    print("=" * 72)

    if not TRAINING_DATA_PATH.exists():
        print(f"Training data not found: {TRAINING_DATA_PATH}", file=sys.stderr)
        print("Run collect_training_data.py first.", file=sys.stderr)
        return 1

    feature_names = load_feature_names()
    df = pd.read_csv(TRAINING_DATA_PATH)

    print(f"\nLoaded {len(df)} rows from {TRAINING_DATA_PATH.name}")

    missing = [col for col in feature_names + ["safety_class"] if col not in df.columns]
    if missing:
        print(f"Missing columns in training data: {missing}", file=sys.stderr)
        return 1

    X = df[feature_names]
    y = df["safety_class"]

    print("\nClass distribution:")
    for class_id, name in enumerate(CLASS_NAMES):
        count = int((y == class_id).sum())
        pct = 100.0 * count / len(y) if len(y) else 0
        print(f"  {name} ({class_id}): {count} rows ({pct:.1f}%)")

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )
    except ValueError:
        print("\nWarning: stratified split failed (missing class in data). Using random split.")
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
        )

    print(f"\nTrain size: {len(X_train)} | Test size: {len(X_test)}")

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    all_labels = [0, 1, 2, 3]

    print("\n" + "=" * 72)
    print("EVALUATION")
    print("=" * 72)
    print(f"\nOverall accuracy: {accuracy:.4f} ({accuracy * 100:.2f}%)")

    print("\nClassification report:")
    print(
        classification_report(
            y_test,
            y_pred,
            labels=all_labels,
            target_names=CLASS_NAMES,
            digits=4,
            zero_division=0,
        )
    )

    print("Confusion matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y_test, y_pred, labels=all_labels)
    header = "          " + "  ".join(f"{name:>10}" for name in CLASS_NAMES)
    print(header)
    for i, row in enumerate(cm):
        row_str = "  ".join(f"{val:10d}" for val in row)
        print(f"{CLASS_NAMES[i]:>10}  {row_str}")

    importances = pd.Series(model.feature_importances_, index=feature_names)
    top5 = importances.sort_values(ascending=False).head(5)

    print("\nTop 5 most important features:")
    for rank, (feature, score) in enumerate(top5.items(), start=1):
        print(f"  {rank}. {feature}: {score:.4f}")

    joblib.dump(model, MODEL_PATH)
    with open(FEATURES_PATH, "w", encoding="utf-8") as f:
        json.dump(feature_names, f, indent=2)

    print("\n" + "=" * 72)
    print(f"Model saved to {MODEL_PATH}")
    print(f"Feature list saved to {FEATURES_PATH}")
    print("=" * 72)

    return 0


if __name__ == "__main__":
    sys.exit(main())
