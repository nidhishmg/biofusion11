"""
BioFusion AI — Analysis Router
ML analysis endpoints for ECG, EMG, EEG, and Fusion
"""
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

router = APIRouter(tags=["Analysis"])

# Models loaded on startup by main.py — set via dependency injection
_ecg_model = None
_emg_model = None
_eeg_model = None
_fusion_engine = None


def set_models(ecg, emg, eeg, fusion):
    global _ecg_model, _emg_model, _eeg_model, _fusion_engine
    _ecg_model = ecg
    _emg_model = emg
    _eeg_model = eeg
    _fusion_engine = fusion


class SignalInput(BaseModel):
    signal: List[float]
    sample_rate: int = 360
    source_file: Optional[str] = None


class FusionInput(BaseModel):
    ecg: Optional[Dict[str, Any]] = None
    emg: Optional[Dict[str, Any]] = None
    eeg: Optional[Dict[str, Any]] = None


@router.post("/ecg")
async def analyze_ecg(data: SignalInput):
    """Run full ECG analysis pipeline."""
    from core.pipeline import process_ecg

    try:
        signal = np.array(data.signal)

        # Process signal
        result = process_ecg(signal, data.sample_rate)

        # ML prediction
        features = result["features"]
        hrv = result["hrv_spectrum"]

        ml_features = {
            **features,
            "lf_power": hrv.get("lf_power", 0),
            "hf_power": hrv.get("hf_power", 0),
            "lf_hf_ratio": hrv.get("lf_hf_ratio", 0),
        }

        predictions = _ecg_model.predict(ml_features)

        # Subsample signal for frontend (max 5000 points)
        filtered = result["filtered_signal"]
        if len(filtered) > 5000:
            step = len(filtered) // 5000
            filtered = filtered[::step]

        return {
            "filtered_signal": filtered,
            "r_peaks": result["r_peaks"],
            "features": features,
            "predictions": predictions,
            "rr_intervals": result["rr_intervals"],
            "hrv_spectrum": {
                "frequencies": result["hrv_spectrum"]["frequencies"][:200],
                "power": result["hrv_spectrum"]["power"][:200],
                "lf_power": hrv["lf_power"],
                "hf_power": hrv["hf_power"],
                "lf_hf_ratio": hrv["lf_hf_ratio"],
            },
            "poincare": result["poincare"],
            "signal_quality": result["signal_quality"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ECG analysis error: {str(e)}")


@router.post("/emg")
async def analyze_emg(data: SignalInput):
    """Run full EMG analysis pipeline."""
    from core.pipeline import process_emg

    try:
        signal = np.array(data.signal)
        fs = data.sample_rate or 1000

        # Process signal
        result = process_emg(signal, fs)

        # ML prediction
        predictions = _emg_model.predict(result["features"], result["fatigue"])

        # Also add source file condition hint
        if data.source_file:
            fname = data.source_file.lower()
            if 'healthy' in fname:
                predictions['source_condition'] = 'Healthy'
            elif 'myopathy' in fname:
                predictions['source_condition'] = 'Myopathy'
            elif 'neuropathy' in fname:
                predictions['source_condition'] = 'Neuropathy'

        # Subsample for frontend
        filtered = result["filtered_signal"]
        envelope = result["envelope"]
        if len(filtered) > 5000:
            step = len(filtered) // 5000
            filtered = filtered[::step]
            envelope = envelope[::step]

        return {
            "filtered_signal": filtered,
            "envelope": envelope,
            "features": result["features"],
            "predictions": predictions,
            "psd": {
                "frequencies": result["psd"]["frequencies"][:200],
                "power": result["psd"]["power"][:200],
            },
            "fatigue": result["fatigue"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"EMG analysis error: {str(e)}")


@router.post("/eeg")
async def analyze_eeg(data: SignalInput):
    """Run full EEG analysis pipeline."""
    from core.pipeline import process_eeg

    try:
        signal = np.array(data.signal)
        fs = data.sample_rate or 256

        # Process signal
        result = process_eeg(signal, fs)

        # ML prediction
        predictions = _eeg_model.predict(result["features"])

        # Subsample for frontend
        filtered = result["filtered_signal"]
        if len(filtered) > 5000:
            step = len(filtered) // 5000
            filtered = filtered[::step]

        return {
            "filtered_signal": filtered,
            "features": result["features"],
            "predictions": predictions,
            "band_spectrum": result["band_spectrum"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"EEG analysis error: {str(e)}")


@router.post("/fusion")
async def analyze_fusion(data: FusionInput):
    """Run fusion analysis combining all three signal results."""
    try:
        result = _fusion_engine.fuse(
            ecg_result=data.ecg,
            emg_result=data.emg,
            eeg_result=data.eeg,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fusion analysis error: {str(e)}")


@router.post("/demo")
async def demo_analysis(scenario: str = "normal"):
    """Generate demo analysis results for a given scenario with distinct risk profiles."""
    from core.pipeline import process_ecg, process_emg, process_eeg

    ecg_signal = _generate_demo_ecg(scenario)
    emg_signal = _generate_demo_emg(scenario)
    eeg_signal = _generate_demo_eeg(scenario)

    ecg_result = process_ecg(ecg_signal, 360)
    emg_result = process_emg(emg_signal, 1000)
    eeg_result = process_eeg(eeg_signal, 256)

    ecg_features = {
        **ecg_result["features"],
        "lf_power": ecg_result["hrv_spectrum"].get("lf_power", 0),
        "hf_power": ecg_result["hrv_spectrum"].get("hf_power", 0),
        "lf_hf_ratio": ecg_result["hrv_spectrum"].get("lf_hf_ratio", 0),
    }
    ecg_pred = _ecg_model.predict(ecg_features)
    emg_pred = _emg_model.predict(emg_result["features"], emg_result["fatigue"])
    eeg_pred = _eeg_model.predict(eeg_result["features"])

    # Hardcoded scenario profiles
    SCENARIO_PROFILES = {
        "normal": {
            "ecg_class": "Normal Sinus Rhythm",
            "ecg_arrhy_prob": 0.03,
            "ecg_class_probs": {"Normal": 0.96, "PVC": 0.03, "AF": 0.01},
            "ecg_hr": 72.0, "ecg_rmssd": 45.0, "ecg_pnn50": 0.24, "ecg_qrs": 0.08,
            "emg_gesture": "Rest", "emg_confidence": 0.95, "emg_condition": "Healthy",
            "emg_fatigue_score": 0.08, "emg_fatigue_level": "Fresh",
            "eeg_state": "Relaxed", "eeg_seizure_prob": 0.01, "eeg_dominant": "Alpha",
            "risk_score": 0.06, "risk_level": "LOW", "severity": "LOW",
            "primary_condition": "Normal — All Systems Healthy",
            "reason": "ECG, EMG and EEG all within normal physiological ranges. No abnormalities detected.",
            "flags": [],
            "corr": [[1.0, 0.08, 0.05], [0.08, 1.0, 0.06], [0.05, 0.06, 1.0]],
            "model_conf": {"ecg": 0.96, "emg": 0.94, "eeg": 0.93},
        },
        "stress": {
            "ecg_class": "Sinus Tachycardia",
            "ecg_arrhy_prob": 0.22,
            "ecg_class_probs": {"Normal": 0.65, "Tachycardia": 0.28, "PVC": 0.07},
            "ecg_hr": 95.0, "ecg_rmssd": 22.0, "ecg_pnn50": 0.08, "ecg_qrs": 0.088,
            "emg_gesture": "Tension", "emg_confidence": 0.82, "emg_condition": "Healthy",
            "emg_fatigue_score": 0.52, "emg_fatigue_level": "Moderate",
            "eeg_state": "Alert/Stressed", "eeg_seizure_prob": 0.05, "eeg_dominant": "Beta",
            "risk_score": 0.42, "risk_level": "MODERATE", "severity": "MODERATE",
            "primary_condition": "Physiological Stress Response",
            "reason": "Elevated heart rate, reduced HRV and dominant beta EEG indicate active stress. Sustained EMG muscle tension detected.",
            "flags": ["Elevated HR", "Reduced HRV", "Beta Dominance"],
            "corr": [[1.0, 0.31, 0.28], [0.31, 1.0, 0.22], [0.28, 0.22, 1.0]],
            "model_conf": {"ecg": 0.88, "emg": 0.85, "eeg": 0.87},
        },
        "arrhythmia": {
            "ecg_class": "Premature Ventricular Contraction",
            "ecg_arrhy_prob": 0.71,
            "ecg_class_probs": {"Normal": 0.18, "PVC": 0.62, "AF": 0.14, "Bundle Branch": 0.06},
            "ecg_hr": 110.0, "ecg_rmssd": 11.0, "ecg_pnn50": 0.03, "ecg_qrs": 0.115,
            "emg_gesture": "Rest", "emg_confidence": 0.78, "emg_condition": "Mild Myopathy",
            "emg_fatigue_score": 0.61, "emg_fatigue_level": "High",
            "eeg_state": "Anxious", "eeg_seizure_prob": 0.14, "eeg_dominant": "Beta",
            "risk_score": 0.67, "risk_level": "HIGH", "severity": "HIGH",
            "primary_condition": "Cardiac Arrhythmia Detected",
            "reason": "Frequent PVCs with widened QRS and critically reduced HRV. Elevated seizure probability warrants urgent cardiac evaluation.",
            "flags": ["PVC Detected", "Widened QRS", "Critical HRV Drop", "Abnormal EMG"],
            "corr": [[1.0, 0.44, 0.38], [0.44, 1.0, 0.35], [0.38, 0.35, 1.0]],
            "model_conf": {"ecg": 0.91, "emg": 0.82, "eeg": 0.86},
        },
        "sudep": {
            "ecg_class": "Cardiac Arrest / VF",
            "ecg_arrhy_prob": 0.99,
            "ecg_class_probs": {"VF": 0.85, "Asystole": 0.15},
            "ecg_hr": 180.0, "ecg_rmssd": 1.0, "ecg_pnn50": 0.001, "ecg_qrs": 0.180,
            "emg_gesture": "Tonic-Clonic Spasm", "emg_confidence": 0.98, "emg_condition": "Critical Spasm",
            "emg_fatigue_score": 0.99, "emg_fatigue_level": "Critical",
            "eeg_state": "Status Epilepticus", "eeg_seizure_prob": 0.99, "eeg_dominant": "Delta",
            "risk_score": 0.99, "risk_level": "CRITICAL", "severity": "CRITICAL",
            "primary_condition": "CRITICAL SUDEP — Immediate Intervention Required",
            "reason": "Status epilepticus detected alongside Ventricular Fibrillation. High risk of immediate mortality.",
            "flags": ["Status Epilepticus", "Cardiac Arrest Risk", "Tonic-Clonic", "CRITICAL SUDEP", "Zero HRV"],
            "corr": [[1.0, 0.89, 0.85], [0.89, 1.0, 0.82], [0.85, 0.82, 1.0]],
            "model_conf": {"ecg": 0.99, "emg": 0.99, "eeg": 0.99},
        },
    }

    p = SCENARIO_PROFILES.get(scenario, SCENARIO_PROFILES["normal"])

    ecg_pred["predicted_class"] = p["ecg_class"]
    ecg_pred["arrhythmia_probability"] = p["ecg_arrhy_prob"]
    ecg_pred["class_probabilities"] = p["ecg_class_probs"]
    ecg_result["features"]["hr_bpm"] = p["ecg_hr"]
    ecg_result["features"]["rmssd"] = p["ecg_rmssd"]
    ecg_result["features"]["pnn50"] = p["ecg_pnn50"]
    ecg_result["features"]["qrs_width"] = p["ecg_qrs"]

    emg_pred["gesture"] = p["emg_gesture"]
    emg_pred["gesture_confidence"] = p["emg_confidence"]
    emg_pred["condition"] = p["emg_condition"]
    emg_pred["fatigue_score"] = p["emg_fatigue_score"]
    emg_pred["fatigue_level"] = p["emg_fatigue_level"]

    eeg_pred["mental_state"] = p["eeg_state"]
    eeg_pred["seizure_probability"] = p["eeg_seizure_prob"]
    eeg_pred["dominant_band"] = p["eeg_dominant"]

    def subsample(sig, max_pts=3000):
        if len(sig) > max_pts:
            step = len(sig) // max_pts
            return sig[::step]
        return sig

    ecg_analysis = {
        "filtered_signal": subsample(ecg_result["filtered_signal"]),
        "r_peaks": ecg_result["r_peaks"],
        "features": ecg_result["features"],
        "predictions": ecg_pred,
        "rr_intervals": ecg_result["rr_intervals"],
        "hrv_spectrum": ecg_result["hrv_spectrum"],
        "poincare": ecg_result["poincare"],
        "signal_quality": ecg_result["signal_quality"],
    }

    emg_analysis = {
        "filtered_signal": subsample(emg_result["filtered_signal"]),
        "envelope": subsample(emg_result["envelope"]),
        "features": emg_result["features"],
        "predictions": emg_pred,
        "psd": emg_result["psd"],
        "fatigue": emg_result["fatigue"],
    }

    eeg_analysis = {
        "filtered_signal": subsample(eeg_result["filtered_signal"]),
        "features": eeg_result["features"],
        "predictions": eeg_pred,
        "band_spectrum": eeg_result["band_spectrum"],
    }

    fusion_result = {
        "risk_score":        p["risk_score"],
        "risk_level":        p["risk_level"],
        "primary_condition": p["primary_condition"],
        "severity":          p["severity"],
        "reason":            p["reason"],
        "flags":             p["flags"],
        "correlation_matrix": p["corr"],
        "risk_trend": "RISING" if p["risk_score"] > 0.6 else ("STABLE" if p["risk_score"] < 0.2 else "FLUCTUATING"),
        "model_confidences": p["model_conf"],
        "rules": [],
    }

    return {
        "scenario": scenario,
        "ecg": ecg_analysis,
        "emg": emg_analysis,
        "eeg": eeg_analysis,
        "fusion": fusion_result,
    }

def _generate_demo_ecg(scenario, duration=10, fs=360):
    """Generate synthetic ECG signal."""
    t = np.linspace(0, duration, int(duration * fs))

    if scenario == "arrhythmia":
        hr = 110
    elif scenario == "stress":
        hr = 95
    elif scenario == "sudep":
        hr = 130
    else:
        hr = 72

    freq = hr / 60.0
    # Synthetic ECG-like waveform
    ecg = np.zeros_like(t)
    beat_interval = 1.0 / freq

    for beat_time in np.arange(0, duration, beat_interval):
        # Add variability for arrhythmia
        if scenario == "arrhythmia" and np.random.random() > 0.7:
            beat_time += np.random.uniform(-0.1, 0.1)

        dt = t - beat_time
        # P wave
        ecg += 0.15 * np.exp(-((dt - (-0.06)) ** 2) / (2 * 0.008 ** 2))
        # QRS complex
        ecg += -0.12 * np.exp(-((dt - (-0.01)) ** 2) / (2 * 0.003 ** 2))
        ecg += 1.0 * np.exp(-((dt) ** 2) / (2 * 0.004 ** 2))
        ecg += -0.25 * np.exp(-((dt - 0.015) ** 2) / (2 * 0.004 ** 2))
        # T wave
        ecg += 0.2 * np.exp(-((dt - 0.15) ** 2) / (2 * 0.02 ** 2))

    ecg += np.random.normal(0, 0.02, len(ecg))
    return ecg


def _generate_demo_emg(scenario, duration=5, fs=1000):
    """Generate synthetic EMG signal."""
    t = np.linspace(0, duration, int(duration * fs))
    emg = np.random.normal(0, 0.05, len(t))

    if scenario == "stress":
        # Continuous muscle tension
        emg += 0.3 * np.random.normal(0, 1, len(t))
    elif scenario in ("arrhythmia", "sudep"):
        # Moderate activity
        emg += 0.15 * np.random.normal(0, 1, len(t))
    else:
        # Normal: occasional bursts
        for start in np.arange(0.5, duration - 0.5, 1.5):
            mask = (t >= start) & (t < start + 0.5)
            emg[mask] += 0.4 * np.random.normal(0, 1, np.sum(mask))

    return emg


def _generate_demo_eeg(scenario, duration=10, fs=256):
    """Generate synthetic EEG signal."""
    t = np.linspace(0, duration, int(duration * fs))

    # Base EEG: sum of band oscillations
    if scenario == "sudep":
        # High delta, seizure-like
        eeg = 1.0 * np.sin(2 * np.pi * 2 * t)  # delta
        eeg += 0.5 * np.sin(2 * np.pi * 5 * t)  # theta
        eeg += 0.8 * np.random.normal(0, 1, len(t))  # noise (seizure)
    elif scenario == "stress":
        # Beta dominant
        eeg = 0.2 * np.sin(2 * np.pi * 2 * t)  # delta
        eeg += 0.3 * np.sin(2 * np.pi * 10 * t)  # alpha
        eeg += 0.6 * np.sin(2 * np.pi * 22 * t)  # beta
        eeg += 0.1 * np.random.normal(0, 1, len(t))
    else:
        # Normal: alpha dominant (relaxed)
        eeg = 0.3 * np.sin(2 * np.pi * 2 * t)  # delta
        eeg += 0.2 * np.sin(2 * np.pi * 6 * t)  # theta
        eeg += 0.6 * np.sin(2 * np.pi * 10 * t)  # alpha
        eeg += 0.15 * np.sin(2 * np.pi * 20 * t)  # beta
        eeg += 0.1 * np.random.normal(0, 1, len(t))

    return eeg
