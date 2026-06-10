"""
BioFusion AI — Train EMG Model
Trains condition classifier on emg_healthy/myopathy/neuropathy CSVs
+ gesture classifier (synthetic data)
"""
import os
import sys
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATASET_PATH = r"C:\Users\nidhi\Downloads\signalss-main\signalss-main\biofusion_ai\datasets\emg"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models_saved")


def train():
    import joblib
    from scipy.signal import decimate
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.svm import SVC
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import classification_report, accuracy_score
    from core.pipeline import compute_emg_features

    print("=" * 50)
    print("  Training EMG Models")
    print("=" * 50)

    # ── 1. CONDITION CLASSIFIER ──
    print("\n[1/2] Training Condition Classifier...")

    files = {
        "emg_healthy.csv": 0,
        "emg_myopathy.csv": 1,
        "emg_neuropathy.csv": 2,
    }

    features_list = []
    labels_list = []

    for fname, label in files.items():
        filepath = os.path.join(DATASET_PATH, fname)
        if not os.path.exists(filepath):
            print(f"  WARNING: {fname} not found, skipping")
            continue

        print(f"  Reading {fname}...")

        # Try tab-separated first
        try:
            df = pd.read_csv(filepath, sep='\t', header=None)
            if df.shape[1] < 2:
                df = pd.read_csv(filepath, sep=',', header=None)
        except Exception:
            df = pd.read_csv(filepath, header=None)

        # Check if first row is a header (non-numeric)
        try:
            float(df.iloc[0, 0])
        except (ValueError, TypeError):
            df = df.iloc[1:]  # Skip header row
            df = df.reset_index(drop=True)

        signal = pd.to_numeric(df.iloc[:, 0], errors='coerce').dropna().values.astype(float)
        print(f"    Raw length: {len(signal)}, fs=4000Hz")

        # Downsample 4000 → 1000 Hz
        signal = decimate(signal, q=4)
        fs = 1000
        print(f"    After decimate: {len(signal)}, fs={fs}Hz")

        # Extract features from windows
        window_size = int(0.5 * fs)  # 500ms windows
        step = int(0.25 * fs)  # 250ms step (50% overlap)

        for start in range(0, len(signal) - window_size, step):
            window = signal[start:start + window_size]
            feats = compute_emg_features(window, fs)
            feat_vec = [
                feats["rms"], feats["mav"], feats["zcr"],
                feats["wl"], feats["ssc"], feats["mnf"],
                feats["mdf"], feats["var"],
            ]
            features_list.append(feat_vec)
            labels_list.append(label)

    X = np.array(features_list, dtype=np.float64)
    y = np.array(labels_list, dtype=int)

    print(f"\nTotal samples: {len(X)}")
    print(f"Class distribution: {dict(zip(*np.unique(y, return_counts=True)))}")

    # Clean
    mask = np.all(np.isfinite(X), axis=1)
    X = X[mask]
    y = y[mask]

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train RandomForest
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
        class_weight='balanced',
        n_jobs=-1,
        random_state=42,
    )
    rf.fit(X_train_scaled, y_train)

    y_pred = rf.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nCondition Classifier Accuracy: {acc * 100:.1f}%")
    print(classification_report(
        y_test, y_pred,
        target_names=["Healthy", "Myopathy", "Neuropathy"],
        zero_division=0,
    ))

    # Save condition model
    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(rf, os.path.join(MODELS_DIR, "emg_condition_model.pkl"))
    joblib.dump(scaler, os.path.join(MODELS_DIR, "emg_scaler.pkl"))
    print("  Condition model saved")

    # ── 2. GESTURE CLASSIFIER (synthetic) ──
    print("\n[2/2] Training Gesture Classifier (synthetic data)...")

    gesture_X, gesture_y = _generate_synthetic_gestures()

    gX_train, gX_test, gy_train, gy_test = train_test_split(
        gesture_X, gesture_y, test_size=0.2, random_state=42, stratify=gesture_y
    )

    gesture_svm = SVC(kernel='rbf', C=10, probability=True, random_state=42)
    gesture_svm.fit(gX_train, gy_train)

    gy_pred = gesture_svm.predict(gX_test)
    gacc = accuracy_score(gy_test, gy_pred)
    print(f"Gesture Classifier Accuracy: {gacc * 100:.1f}%")
    print(classification_report(
        gy_test, gy_pred,
        target_names=["Rest", "Fist", "Open", "Point"],
        zero_division=0,
    ))

    joblib.dump(gesture_svm, os.path.join(MODELS_DIR, "emg_gesture_model.pkl"))
    print("  Gesture model saved")

    return acc


def _generate_synthetic_gestures(n_per_class=500):
    """Generate synthetic EMG gesture features."""
    np.random.seed(42)
    X = []
    y = []

    # Class 0: Rest — very low activity
    for _ in range(n_per_class):
        rms = np.random.uniform(0.001, 0.02)
        mav = rms * np.random.uniform(0.7, 0.9)
        zcr = np.random.uniform(0.3, 0.5)
        wl = np.random.uniform(1, 10)
        ssc = np.random.uniform(50, 150)
        X.append([rms, mav, zcr, wl, ssc])
        y.append(0)

    # Class 1: Fist — high sustained activity
    for _ in range(n_per_class):
        rms = np.random.uniform(0.15, 0.5)
        mav = rms * np.random.uniform(0.75, 0.85)
        zcr = np.random.uniform(0.1, 0.25)
        wl = np.random.uniform(80, 200)
        ssc = np.random.uniform(200, 400)
        X.append([rms, mav, zcr, wl, ssc])
        y.append(1)

    # Class 2: Open — moderate spread activity
    for _ in range(n_per_class):
        rms = np.random.uniform(0.08, 0.25)
        mav = rms * np.random.uniform(0.7, 0.85)
        zcr = np.random.uniform(0.15, 0.35)
        wl = np.random.uniform(40, 120)
        ssc = np.random.uniform(150, 300)
        X.append([rms, mav, zcr, wl, ssc])
        y.append(2)

    # Class 3: Point — focused single digit
    for _ in range(n_per_class):
        rms = np.random.uniform(0.05, 0.18)
        mav = rms * np.random.uniform(0.65, 0.8)
        zcr = np.random.uniform(0.2, 0.4)
        wl = np.random.uniform(20, 80)
        ssc = np.random.uniform(100, 250)
        X.append([rms, mav, zcr, wl, ssc])
        y.append(3)

    return np.array(X), np.array(y)


if __name__ == "__main__":
    train()
