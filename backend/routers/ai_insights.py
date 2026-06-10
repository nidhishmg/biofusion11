"""
BioFusion AI — AI Insights Router
Template-based clinical insight generation (fully offline)
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any

router = APIRouter(tags=["AI Insights"])


class InsightRequest(BaseModel):
    ecg: Optional[Dict[str, Any]] = None
    emg: Optional[Dict[str, Any]] = None
    eeg: Optional[Dict[str, Any]] = None
    fusion: Optional[Dict[str, Any]] = None


@router.post("/insight")
async def generate_insight(data: InsightRequest):
    """Generate clinical insight text from analysis results."""
    parts = []
    key_findings = []

    # ECG insight
    if data.ecg:
        ecg_text, ecg_findings = _ecg_insight(data.ecg)
        parts.append(ecg_text)
        key_findings.extend(ecg_findings)

    # EMG insight
    if data.emg:
        emg_text, emg_findings = _emg_insight(data.emg)
        parts.append(emg_text)
        key_findings.extend(emg_findings)

    # EEG insight
    if data.eeg:
        eeg_text, eeg_findings = _eeg_insight(data.eeg)
        parts.append(eeg_text)
        key_findings.extend(eeg_findings)

    # Fusion insight
    if data.fusion:
        fusion_text, fusion_findings = _fusion_insight(data.fusion)
        parts.append(fusion_text)
        key_findings.extend(fusion_findings)

    if not parts:
        return {
            "insight": "No analysis data provided. Upload files or connect hardware to begin analysis.",
            "key_findings": [],
        }

    return {
        "insight": " ".join(parts),
        "key_findings": key_findings,
    }


@router.post("/ecg-insight")
async def ecg_insight(data: Dict[str, Any]):
    text, findings = _ecg_insight(data)
    return {"insight": text, "key_findings": findings}


@router.post("/emg-insight")
async def emg_insight(data: Dict[str, Any]):
    text, findings = _emg_insight(data)
    return {"insight": text, "key_findings": findings}


@router.post("/eeg-insight")
async def eeg_insight(data: Dict[str, Any]):
    text, findings = _eeg_insight(data)
    return {"insight": text, "key_findings": findings}


def _ecg_insight(ecg_data):
    findings = []
    f = ecg_data.get("features", {})
    p = ecg_data.get("predictions", {})

    hr = f.get("hr_bpm", 72)
    rmssd = f.get("rmssd", 40)
    pnn50 = f.get("pnn50", 20)
    qrs = f.get("qrs_width", 80)
    predicted = p.get("predicted_class", "Normal")
    arrhythmia_prob = p.get("arrhythmia_probability", 0)

    # Heart rate assessment
    if hr < 50:
        hr_text = f"Bradycardic pattern detected at {hr:.0f} BPM, suggesting possible conduction abnormality or high vagal tone."
        findings.append(f"Bradycardia: {hr:.0f} BPM")
    elif hr > 100:
        hr_text = f"Tachycardic pattern observed at {hr:.0f} BPM, indicating elevated sympathetic drive."
        findings.append(f"Tachycardia: {hr:.0f} BPM")
    else:
        hr_text = f"Normal sinus rhythm at {hr:.0f} BPM with stable cardiac conduction."

    # HRV assessment
    if rmssd < 20:
        hrv_text = f"Reduced HRV (RMSSD: {rmssd:.1f}ms) suggests diminished parasympathetic tone."
        findings.append("Low HRV - reduced autonomic flexibility")
    elif rmssd > 60:
        hrv_text = f"Excellent HRV (RMSSD: {rmssd:.1f}ms, pNN50: {pnn50:.1f}%) indicating robust autonomic regulation."
    else:
        hrv_text = f"Adequate HRV (RMSSD: {rmssd:.1f}ms) suggesting normal autonomic function."

    # Classification
    if predicted != "Normal" and arrhythmia_prob > 0.3:
        class_text = f"Arrhythmia classification indicates {predicted} pattern with {arrhythmia_prob*100:.1f}% probability. Further monitoring recommended."
        findings.append(f"{predicted} pattern detected ({arrhythmia_prob*100:.0f}%)")
    else:
        class_text = "No significant arrhythmia detected by the classification model."

    # QRS
    if qrs > 120:
        qrs_text = f"Wide QRS complex ({qrs:.0f}ms) may indicate bundle branch block."
        findings.append(f"Wide QRS: {qrs:.0f}ms")
    else:
        qrs_text = ""

    parts = [hr_text, hrv_text, class_text]
    if qrs_text:
        parts.append(qrs_text)

    return " ".join(parts), findings


def _emg_insight(emg_data):
    findings = []
    f = emg_data.get("features", {})
    p = emg_data.get("predictions", {})
    fat = emg_data.get("fatigue", {})

    rms = f.get("rms", 0.1)
    mnf = f.get("mnf", 90)
    mav = f.get("mav", 0.1)
    condition = p.get("condition", "Healthy")
    fatigue_level = fat.get("fatigue_level", p.get("fatigue_level", "Fresh"))
    fatigue_score = fat.get("fatigue_score", p.get("fatigue_score", 0))

    # Condition assessment
    if condition == "Myopathy":
        cond_text = f"Neuromuscular analysis suggests myopathic pattern with reduced motor unit recruitment (RMS: {rms:.4f}, MNF: {mnf:.1f}Hz)."
        findings.append("Myopathy pattern detected")
    elif condition == "Neuropathy":
        cond_text = f"Neuropathic motor unit pattern observed with high-amplitude recruitment (RMS: {rms:.4f}, MNF: {mnf:.1f}Hz)."
        findings.append("Neuropathy pattern detected")
    else:
        cond_text = f"Normal neuromuscular activation pattern (RMS: {rms:.4f}, MNF: {mnf:.1f}Hz) consistent with healthy muscle function."

    # Fatigue
    if fatigue_level == "High Fatigue":
        fat_text = f"Significant muscle fatigue detected (score: {fatigue_score:.2f}) with progressive mean frequency decline indicating motor unit synchronization."
        findings.append("High muscle fatigue")
    elif fatigue_level == "Mild Fatigue":
        fat_text = f"Mild fatigue progression observed (score: {fatigue_score:.2f})."
    else:
        fat_text = "No significant muscle fatigue detected."

    return f"{cond_text} {fat_text}", findings


def _eeg_insight(eeg_data):
    findings = []
    f = eeg_data.get("features", {})
    p = eeg_data.get("predictions", {})

    mental_state = p.get("mental_state", f.get("mental_state", "Neutral"))
    seizure_prob = p.get("seizure_probability", 0)
    alpha_rel = f.get("alpha_rel", 0.25)
    beta_rel = f.get("beta_rel", 0.15)
    theta_rel = f.get("theta_rel", 0.15)
    ab_ratio = f.get("alpha_beta_ratio", 1.0)
    entropy = f.get("spectral_entropy", 4.0)
    dominant = f.get("dominant_band", p.get("dominant_band", "Alpha"))
    engagement = f.get("engagement_index", 0.5)

    # Mental state
    state_descriptions = {
        "Relaxed": f"Alpha-dominant state (ratio: {ab_ratio:.2f}) indicates deep relaxation with predominant posterior alpha rhythm.",
        "Focused": f"Beta-dominant pattern (ratio: {ab_ratio:.2f}) indicates high cognitive engagement and focused attention.",
        "Drowsy": f"Elevated theta activity ({theta_rel*100:.1f}%) suggests drowsiness or reduced alertness.",
        "Neutral": f"Balanced spectral profile with alpha/beta ratio of {ab_ratio:.2f} indicating neutral cognitive state.",
    }
    state_text = state_descriptions.get(mental_state, f"Current mental state: {mental_state}.")
    findings.append(f"Mental state: {mental_state}")

    # Seizure risk
    if seizure_prob > 0.65:
        seiz_text = f"HIGH SEIZURE RISK ({seizure_prob:.2f}). Abnormal spectral pattern detected — immediate clinical review recommended."
        findings.append(f"High seizure risk: {seizure_prob:.2f}")
    elif seizure_prob > 0.35:
        seiz_text = f"Moderate seizure indicator ({seizure_prob:.2f}). Enhanced monitoring advised."
        findings.append(f"Moderate seizure risk: {seizure_prob:.2f}")
    else:
        seiz_text = f"No epileptiform activity detected (seizure probability: {seizure_prob:.2f})."

    spec_text = f"Spectral entropy of {entropy:.2f} bits {'consistent with healthy neural background activity' if entropy > 3 else 'suggestive of reduced spectral complexity'}."

    return f"{state_text} {seiz_text} {spec_text}", findings


def _fusion_insight(fusion_data):
    findings = []
    risk = fusion_data.get("risk_score", 0)
    risk_level = fusion_data.get("risk_level", "LOW")
    condition = fusion_data.get("primary_condition", "Normal")
    reason = fusion_data.get("reason", "")
    confidences = fusion_data.get("model_confidences", {})
    corr = fusion_data.get("correlation_matrix", [[1, 0, 0], [0, 1, 0], [0, 0, 1]])

    # Cross-modal analysis
    ecg_eeg_corr = abs(corr[0][2]) if len(corr) > 2 and len(corr[0]) > 2 else 0

    if risk_level == "CRITICAL":
        risk_text = f"CRITICAL ALERT: Overall risk score {risk:.2f}. Primary condition: {condition}. {reason}. Immediate clinical attention recommended."
        findings.append(f"Critical risk: {condition}")
    elif risk_level == "HIGH":
        risk_text = f"Elevated risk detected (score: {risk:.2f}). {condition} pattern identified. {reason}. Enhanced monitoring recommended."
        findings.append(f"High risk: {condition}")
    elif risk_level == "MODERATE":
        risk_text = f"Moderate risk assessment (score: {risk:.2f}). {reason}. Continue monitoring."
    else:
        risk_text = f"Comprehensive multimodal analysis reveals a stable physiological state (risk score: {risk:.2f}). {reason}."

    # Correlation insight
    if ecg_eeg_corr > 0.5:
        corr_text = f"Cross-modal correlation matrix shows significant ECG-EEG coupling (r={ecg_eeg_corr:.2f}), suggesting possible cardiac-neurological interaction."
        findings.append(f"High ECG-EEG correlation: {ecg_eeg_corr:.2f}")
    else:
        corr_text = f"Cross-modal correlation shows low ECG-EEG coupling (r={ecg_eeg_corr:.2f}), ruling out significant cardiac-neurological interaction."

    # Confidence
    conf_text = f"Model confidence — ECG: {confidences.get('ecg', 0)*100:.0f}%, EMG: {confidences.get('emg', 0)*100:.0f}%, EEG: {confidences.get('eeg', 0)*100:.0f}%."

    recommendation = "No clinical intervention recommended." if risk_level == "LOW" else "Clinical follow-up advised based on elevated risk indicators."

    return f"{risk_text} {corr_text} {conf_text} {recommendation}", findings
