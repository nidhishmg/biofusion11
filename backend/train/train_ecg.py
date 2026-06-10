"""
BioFusion AI — Train ECG Model
Trains RandomForest on MIT-BIH Arrhythmia Database
"""
import os
import sys
import numpy as np
import warnings
warnings.filterwarnings('ignore')

# Add parent to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATASET_PATH = r"C:\Users\nidhi\Downloads\signalss-main\signalss-main\biofusion_ai\datasets\ecg"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models_saved")


def train():
    import wfdb
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import classification_report, accuracy_score
    from imblearn.over_sampling import SMOTE
    from core.pipeline import process_ecg

    print("=" * 50)
    print("  Training ECG Model on MIT-BIH")
    print("=" * 50)

    # Discover available records
    all_records = []
    for r in list(range(100, 125)) + list(range(200, 235)):
        dat_file = os.path.join(DATASET_PATH, f"{r}.dat")
        hea_file = os.path.join(DATASET_PATH, f"{r}.hea")
        atr_file = os.path.join(DATASET_PATH, f"{r}.atr")
        if os.path.exists(dat_file) and os.path.exists(hea_file) and os.path.exists(atr_file):
            all_records.append(str(r))

    print(f"Found {len(all_records)} records")

    # Label mapping
    label_map = {
        'N': 0, 'L': 3, 'R': 3, 'B': 3, 'e': 0,  # Normal & bundle
        'V': 1, 'E': 1,  # PVC
        'A': 2, 'a': 2, 'J': 2, 'S': 2, 'j': 2,  # Atrial
        '/': 0, 'f': 0, 'F': 0, 'Q': 0,  # Other → Normal
    }

    features_list = []
    labels_list = []

    for rec_name in all_records:
        try:
            rec_path = os.path.join(DATASET_PATH, rec_name)
            record = wfdb.rdrecord(rec_path)
            annotation = wfdb.rdann(rec_path, 'atr')

            signal = record.p_signal[:, 0]
            fs = record.fs

            # Process full signal to get global features
            result = process_ecg(signal[:fs * 30], fs)  # First 30 sec

            beat_symbols = annotation.symbol
            beat_samples = annotation.sample

            # Extract features per segment (use global features + local)
            for i in range(1, len(beat_samples) - 1):
                sym = beat_symbols[i]
                if sym not in label_map:
                    continue

                label = label_map[sym]

                # Local RR intervals
                rr_prev = (beat_samples[i] - beat_samples[i - 1]) / fs * 1000
                rr_next = (beat_samples[i + 1] - beat_samples[i]) / fs * 1000

                if rr_prev < 200 or rr_prev > 2000 or rr_next < 200 or rr_next > 2000:
                    continue

                hr = 60000.0 / rr_prev
                mean_rr = (rr_prev + rr_next) / 2
                std_rr = abs(rr_next - rr_prev)
                rmssd = abs(rr_next - rr_prev)
                pnn50 = 1.0 if abs(rr_next - rr_prev) > 50 else 0.0

                # QRS width estimate
                peak = beat_samples[i]
                lo = max(0, peak - int(0.06 * fs))
                hi = min(len(signal), peak + int(0.06 * fs))
                seg = signal[lo:hi]
                threshold = 0.3 * np.max(np.abs(seg)) if len(seg) > 0 else 0
                above = np.where(np.abs(seg) > threshold)[0] if len(seg) > 0 else []
                qrs_width = (above[-1] - above[0]) / fs * 1000 if len(above) > 1 else 80.0

                features = [
                    hr, mean_rr, std_rr, rmssd, pnn50, qrs_width,
                    result["hrv_spectrum"].get("lf_power", 0),
                    result["hrv_spectrum"].get("hf_power", 0),
                    result["hrv_spectrum"].get("lf_hf_ratio", 0),
                ]

                features_list.append(features)
                labels_list.append(label)

        except Exception as e:
            print(f"  Skipping record {rec_name}: {e}")
            continue

    X = np.array(features_list, dtype=np.float64)
    y = np.array(labels_list, dtype=int)

    print(f"Total samples: {len(X)}")
    print(f"Class distribution: {dict(zip(*np.unique(y, return_counts=True)))}")

    # Clean NaN/Inf
    mask = np.all(np.isfinite(X), axis=1)
    X = X[mask]
    y = y[mask]

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    # SMOTE oversampling
    try:
        smote = SMOTE(random_state=42)
        X_train, y_train = smote.fit_resample(X_train, y_train)
        print(f"After SMOTE: {dict(zip(*np.unique(y_train, return_counts=True)))}")
    except Exception as e:
        print(f"SMOTE failed (using original): {e}")

    # Train
    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=20,
        class_weight='balanced',
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {acc * 100:.1f}%")
    print("\nClassification Report:")
    class_names = ["Normal", "PVC", "Atrial", "Block"]
    present = np.unique(np.concatenate([y_test, y_pred]))
    names = [class_names[i] for i in present]
    print(classification_report(y_test, y_pred, target_names=names, zero_division=0))

    # Save
    os.makedirs(MODELS_DIR, exist_ok=True)
    model_path = os.path.join(MODELS_DIR, "ecg_model.pkl")
    scaler_path = os.path.join(MODELS_DIR, "ecg_scaler.pkl")
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)
    print(f"Model saved to {model_path}")
    print(f"Scaler saved to {scaler_path}")

    return acc


if __name__ == "__main__":
    train()
