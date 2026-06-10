"""
BioFusion AI — Train EEG Model
Trains SVM seizure detector on CHB-MIT EDF files
"""
import os
import sys
import numpy as np
import warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATASET_PATH = r"C:\Users\nidhi\Downloads\signalss-main\signalss-main\biofusion_ai\datasets\eeg"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models_saved")


def train():
    import mne
    import joblib
    from sklearn.svm import SVC
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import classification_report, accuracy_score
    from core.pipeline import compute_eeg_bands, compute_eeg_features

    print("=" * 50)
    print("  Training EEG Seizure Detection Model")
    print("=" * 50)

    edf_files = [
        "chb01_01.edf",
        "chb01_02.edf",
        "chb01_03.edf",
        "chb01_04.edf",
    ]

    features_list = []
    labels_list = []

    for fname in edf_files:
        filepath = os.path.join(DATASET_PATH, fname)
        if not os.path.exists(filepath):
            print(f"  WARNING: {fname} not found, skipping")
            continue

        print(f"  Reading {fname}...")
        try:
            raw = mne.io.read_raw_edf(filepath, preload=True, verbose=False)
            signal = raw.get_data()[0]  # First channel
            fs = raw.info['sfreq']
            print(f"    Channels: {len(raw.ch_names)}, fs={fs}Hz, duration={len(signal)/fs:.1f}s")

            # Extract features from 1-second windows
            window_samples = int(1.0 * fs)
            n_windows = min(len(signal) // window_samples, 300)  # Cap per file

            for i in range(n_windows):
                segment = signal[i * window_samples:(i + 1) * window_samples]

                # Compute band powers
                bands = compute_eeg_bands(segment, fs)
                features = compute_eeg_features(bands, segment, fs)

                feat_vec = [
                    features["delta_rel"],
                    features["theta_rel"],
                    features["alpha_rel"],
                    features["beta_rel"],
                    features["gamma_rel"],
                    features["alpha_beta_ratio"],
                    features["spectral_entropy"],
                    features["engagement_index"],
                ]

                features_list.append(feat_vec)

                # Label: simulate seizure segments
                # CHB-MIT chb01_03 has seizure at 2996-3036 seconds
                # For other files, all segments are normal
                if fname == "chb01_03.edf":
                    time_sec = i * 1.0
                    if 2996 <= time_sec <= 3036:
                        labels_list.append(1)  # Seizure
                    else:
                        labels_list.append(0)  # Normal
                else:
                    labels_list.append(0)  # Normal

        except Exception as e:
            print(f"    ERROR: {e}")
            continue

    X = np.array(features_list, dtype=np.float64)
    y = np.array(labels_list, dtype=int)

    print(f"\nTotal samples: {len(X)}")
    print(f"Class distribution: {dict(zip(*np.unique(y, return_counts=True)))}")

    # Since we may have very few seizure samples, augment
    seizure_idx = np.where(y == 1)[0]
    normal_idx = np.where(y == 0)[0]

    if len(seizure_idx) < 10:
        print("  Augmenting seizure class with synthetic data...")
        # Create synthetic seizure features (high delta, low alpha, low entropy)
        n_synthetic = max(100, len(normal_idx) // 3)
        synthetic_feats = []
        for _ in range(n_synthetic):
            synthetic_feats.append([
                np.random.uniform(0.35, 0.65),  # delta high
                np.random.uniform(0.15, 0.30),  # theta elevated
                np.random.uniform(0.03, 0.12),  # alpha low
                np.random.uniform(0.05, 0.20),  # beta variable
                np.random.uniform(0.02, 0.10),  # gamma variable
                np.random.uniform(0.1, 0.6),     # low alpha/beta ratio
                np.random.uniform(1.5, 3.0),     # low entropy
                np.random.uniform(0.2, 0.8),     # variable engagement
            ])
        synthetic_X = np.array(synthetic_feats)
        synthetic_y = np.ones(n_synthetic, dtype=int)

        X = np.vstack([X, synthetic_X])
        y = np.concatenate([y, synthetic_y])

        print(f"  After augmentation: {dict(zip(*np.unique(y, return_counts=True)))}")

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
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    # Train SVM
    svm = SVC(
        kernel='rbf',
        C=10,
        gamma='scale',
        probability=True,
        class_weight='balanced',
        random_state=42,
    )
    svm.fit(X_train, y_train)

    y_pred = svm.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {acc * 100:.1f}%")
    print(classification_report(
        y_test, y_pred,
        target_names=["Normal", "Seizure"],
        zero_division=0,
    ))

    # Save
    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(svm, os.path.join(MODELS_DIR, "eeg_model.pkl"))
    joblib.dump(scaler, os.path.join(MODELS_DIR, "eeg_scaler.pkl"))
    print(f"Model saved to {MODELS_DIR}")

    return acc


if __name__ == "__main__":
    train()
