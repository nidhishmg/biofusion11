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
    """Generate demo analysis results for a given scenario."""
    from core.pipeline import process_ecg, process_emg, process_eeg

    # Generate synthetic signals
    ecg_signal = _generate_demo_ecg(scenario)
    emg_signal = _generate_demo_emg(scenario)
    eeg_signal = _generate_demo_eeg(scenario)

    # Process each
    ecg_result = process_ecg(ecg_signal, 360)
    emg_result = process_emg(emg_signal, 1000)
    eeg_result = process_eeg(eeg_signal, 256)

    # ML predictions
    ecg_features = {
        **ecg_result["features"],
        "lf_power": ecg_result["hrv_spectrum"].get("lf_power", 0),
        "hf_power": ecg_result["hrv_spectrum"].get("hf_power", 0),
        "lf_hf_ratio": ecg_result["hrv_spectrum"].get("lf_hf_ratio", 0),
    }
    ecg_pred = _ecg_model.predict(ecg_features)
    emg_pred = _emg_model.predict(emg_result["features"], emg_result["fatigue"])
    eeg_pred = _eeg_model.predict(eeg_result["features"])

    # Subsample signals
    def subsample(sig, max_pts=3000):
        if len(sig) > max_pts:
            step = len(sig) // max_pts
            return sig[::step]
        return sig

    ecg_filtered = subsample(ecg_result["filtered_signal"])
    emg_filtered = subsample(emg_result["filtered_signal"])
    emg_envelope = subsample(emg_result["envelope"])
    eeg_filtered = subsample(eeg_result["filtered_signal"])

    ecg_analysis = {
        "filtered_signal": ecg_filtered,
        "r_peaks": ecg_result["r_peaks"],
        "features": ecg_result["features"],
        "predictions": ecg_pred,
        "rr_intervals": ecg_result["rr_intervals"],
        "hrv_spectrum": ecg_result["hrv_spectrum"],
        "poincare": ecg_result["poincare"],
        "signal_quality": ecg_result["signal_quality"],
    }

    emg_analysis = {
        "filtered_signal": emg_filtered,
        "envelope": emg_envelope,
        "features": emg_result["features"],
        "predictions": emg_pred,
        "psd": emg_result["psd"],
        "fatigue": emg_result["fatigue"],
    }

    eeg_analysis = {
        "filtered_signal": eeg_filtered,
        "features": eeg_result["features"],
        "predictions": eeg_pred,
        "band_spectrum": eeg_result["band_spectrum"],
    }

    fusion_result = _fusion_engine.fuse(ecg_analysis, emg_analysis, eeg_analysis)

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
