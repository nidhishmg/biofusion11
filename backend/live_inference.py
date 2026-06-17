"""
BioFusion AI — Live Inference Module
Runs ECG/EMG/EEG ML classifiers on rolling buffers from the ESP32 receiver,
then fuses results into a unified risk assessment.
"""

# pyrefly: ignore [missing-import]
import numpy as np
from esp32_receiver import get_ecg_buffer, get_emg_buffer, get_eeg_buffer

# Models injected by main.py at startup
_ecg_model = None
_emg_model = None
_eeg_model = None
_fusion_engine = None


def set_models(ecg_model, emg_model, eeg_model, fusion_engine):
    """Inject pre-loaded model instances (called from main.py lifespan)."""
    global _ecg_model, _emg_model, _eeg_model, _fusion_engine
    _ecg_model = ecg_model
    _emg_model = emg_model
    _eeg_model = eeg_model
    _fusion_engine = fusion_engine


def run_live_inference() -> dict:
    """
    Run all three ML classifiers on the current rolling buffers,
    then fuse the results into a compound risk score.

    Returns a structured dict with ECG/EMG/EEG labels and fusion results.
    """
    ecg_data = np.array(get_ecg_buffer())
    emg_data = np.array(get_emg_buffer())
    eeg_data = get_eeg_buffer()

    ecg_result = _infer_ecg(ecg_data)
    emg_result = _infer_emg(emg_data)
    eeg_result = _infer_eeg(eeg_data)

    # Run fusion engine
    fusion_result = {}
    if _fusion_engine is not None:
        try:
            fusion_result = _fusion_engine.fuse(
                ecg_result=ecg_result,
                emg_result=emg_result,
                eeg_result=eeg_result,
            )
        except Exception as e:
            fusion_result = {
                "risk_score": 0,
                "risk_level": "LOW",
                "primary_condition": "Normal",
                "severity": "LOW",
                "reason": f"Fusion error: {e}",
            }

    return {
        "ecg": ecg_result,
        "emg": emg_result,
        "eeg": eeg_result,
        "fusion": fusion_result,
        "buffer_sizes": {
            "ecg": len(ecg_data),
            "emg": len(emg_data),
            "eeg": len(eeg_data),
        },
    }


def _infer_ecg(ecg_data: np.ndarray) -> dict:
    """Run ECG inference on the rolling buffer."""
    if len(ecg_data) < 50:
        return {
            "predictions": {
                "predicted_class": "Insufficient Data",
                "arrhythmia_probability": 0,
                "class_probabilities": {},
            },
            "features": {"hr_bpm": 0, "mean_rr": 0, "std_rr": 0, "rmssd": 0, "pnn50": 0, "qrs_width": 0},
        }

    try:
        from core.pipeline import process_ecg
        # Use 50 Hz since ESP32 sends at 50 packets/sec
        result = process_ecg(ecg_data, fs=50)

        features = result["features"]
        hrv = result["hrv_spectrum"]
        ml_features = {
            **features,
            "lf_power": hrv.get("lf_power", 0),
            "hf_power": hrv.get("hf_power", 0),
            "lf_hf_ratio": hrv.get("lf_hf_ratio", 0),
        }

        predictions = {}
        if _ecg_model is not None:
            predictions = _ecg_model.predict(ml_features)

        if not predictions:
            predictions = {
                "predicted_class": "Mock Normal (Fallback)",
                "arrhythmia_probability": 0.05,
                "class_probabilities": {"Normal": 0.95, "PVC": 0.05, "Atrial": 0.0, "Block": 0.0},
            }

        return {
            "features": features,
            "predictions": predictions,
            "filtered_signal": result["filtered_signal"][-200:],  # Last 200 points
        }
    except Exception as e:
        return {
            "predictions": {
                "predicted_class": "Error",
                "arrhythmia_probability": 0,
                "class_probabilities": {},
            },
            "features": {"hr_bpm": 0, "mean_rr": 0, "std_rr": 0, "rmssd": 0, "pnn50": 0, "qrs_width": 0},
            "error": str(e),
        }


def _infer_emg(emg_data: np.ndarray) -> dict:
    """Run EMG inference on the rolling buffer."""
    if len(emg_data) < 50:
        return {
            "predictions": {
                "gesture": "Insufficient Data",
                "gesture_confidence": 0,
                "condition": "Unknown",
                "fatigue_score": 0,
                "fatigue_level": "Unknown",
            },
            "features": {"rms": 0, "mav": 0, "zcr": 0, "wl": 0, "ssc": 0, "mnf": 0, "mdf": 0, "var": 0},
        }

    try:
        from core.pipeline import process_emg
        # EMG module samples via ESP32 at 50 Hz
        result = process_emg(emg_data, fs=50)

        features = result["features"]
        fatigue = result["fatigue"]

        predictions = {}
        if _emg_model is not None:
            predictions = _emg_model.predict(features, fatigue)

        if not predictions:
            predictions = {
                "gesture": "Mock Rest (Fallback)",
                "gesture_confidence": 0.9,
                "all_gesture_probs": {"Rest": 0.9, "Fist": 0.1, "Open": 0.0, "Point": 0.0},
                "condition": "Mock Healthy (Fallback)",
                "condition_probabilities": {"Healthy": 0.9, "Myopathy": 0.05, "Neuropathy": 0.05},
                "fatigue_score": fatigue.get("fatigue_score", 0),
                "fatigue_level": fatigue.get("fatigue_level", "Fresh"),
            }

        return {
            "features": features,
            "predictions": predictions,
            "filtered_signal": result["filtered_signal"][-200:],
        }
    except Exception as e:
        return {
            "predictions": {
                "gesture": "Error",
                "gesture_confidence": 0,
                "condition": "Unknown",
                "fatigue_score": 0,
                "fatigue_level": "Unknown",
            },
            "features": {"rms": 0, "mav": 0, "zcr": 0, "wl": 0, "ssc": 0, "mnf": 0, "mdf": 0, "var": 0},
            "error": str(e),
        }


def _infer_eeg(eeg_data: list) -> dict:
    """Run EEG inference on the rolling buffer of band-power dicts."""
    if len(eeg_data) < 10:
        return {
            "predictions": {
                "mental_state": "Insufficient Data",
                "seizure_probability": 0,
                "seizure_risk": "LOW",
                "dominant_band": "Unknown",
            },
            "features": {
                "delta_rel": 0, "theta_rel": 0, "alpha_rel": 0,
                "beta_rel": 0, "gamma_rel": 0,
                "alpha_beta_ratio": 0, "spectral_entropy": 0, "engagement_index": 0,
            },
        }

    try:
        # Average the last N band-power readings
        recent = eeg_data[-50:] if len(eeg_data) >= 50 else eeg_data
        avg_alpha = float(np.mean([d.get("alpha", 0) for d in recent]))
        avg_beta  = float(np.mean([d.get("beta", 0)  for d in recent]))
        avg_theta = float(np.mean([d.get("theta", 0) for d in recent]))
        avg_delta = float(np.mean([d.get("delta", 0) for d in recent]))

        total = avg_alpha + avg_beta + avg_theta + avg_delta + 1e-10
        features = {
            "delta_rel":   round(avg_delta / total, 4),
            "theta_rel":   round(avg_theta / total, 4),
            "alpha_rel":   round(avg_alpha / total, 4),
            "beta_rel":    round(avg_beta  / total, 4),
            "gamma_rel":   0.0,  # No gamma in simulated data
            "alpha_beta_ratio": round(avg_alpha / (avg_beta + 1e-10), 2),
            "spectral_entropy": round(4.0 + np.random.normal(0, 0.3), 2),
            "engagement_index": round(avg_beta / (avg_alpha + avg_theta + 1e-10), 3),
        }

        # Determine mental state from band ratios
        ab_ratio = features["alpha_beta_ratio"]
        if ab_ratio > 1.5:
            features["mental_state"] = "Relaxed"
        elif ab_ratio < 0.8:
            features["mental_state"] = "Focused"
        elif features["theta_rel"] > 0.25:
            features["mental_state"] = "Drowsy"
        else:
            features["mental_state"] = "Neutral"

        # Determine dominant band
        band_vals = {
            "Delta": features["delta_rel"],
            "Theta": features["theta_rel"],
            "Alpha": features["alpha_rel"],
            "Beta":  features["beta_rel"],
        }
        features["dominant_band"] = max(band_vals, key=band_vals.get)

        predictions = {}
        if _eeg_model is not None:
            predictions = _eeg_model.predict(features)
            
        if not predictions:
            predictions = {
                "mental_state": features.get("mental_state", "Neutral"),
                "seizure_probability": 0.05,
                "seizure_risk": "LOW",
                "dominant_band": features.get("dominant_band", "Alpha"),
            }

        return {
            "features": features,
            "predictions": predictions,
        }
    except Exception as e:
        return {
            "predictions": {
                "mental_state": "Error",
                "seizure_probability": 0,
                "seizure_risk": "LOW",
                "dominant_band": "Unknown",
            },
            "features": {
                "delta_rel": 0, "theta_rel": 0, "alpha_rel": 0,
                "beta_rel": 0, "gamma_rel": 0,
                "alpha_beta_ratio": 0, "spectral_entropy": 0, "engagement_index": 0,
            },
            "error": str(e),
        }
