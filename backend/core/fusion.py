"""
BioFusion AI — Fusion Engine
Cross-modal disease rule engine with 5 condition rules
"""
import numpy as np


class FusionEngine:
    """Combines ECG, EMG, EEG analysis results into a unified risk assessment."""

    CONDITIONS = [
        {
            "name": "SUDEP Risk",
            "severity": "CRITICAL",
            "signals": ["ECG", "EEG"],
            "description": "Cardiac arrest triggered by seizure activity",
        },
        {
            "name": "Motor Neuron Pattern",
            "severity": "HIGH",
            "signals": ["EMG", "EEG"],
            "description": "Early ALS/motor neuron degeneration signature",
        },
        {
            "name": "Autonomic Stress",
            "severity": "MODERATE",
            "signals": ["ECG", "EMG", "EEG"],
            "description": "Panic attack — all three systems elevated",
        },
        {
            "name": "Cardiac Arrhythmia",
            "severity": "HIGH",
            "signals": ["ECG"],
            "description": "PVC/Atrial fibrillation detected",
        },
        {
            "name": "Muscle Fatigue Pattern",
            "severity": "MODERATE",
            "signals": ["EMG"],
            "description": "Neuromuscular fatigue with frequency shift",
        },
    ]

    def fuse(self, ecg_result=None, emg_result=None, eeg_result=None):
        """Run fusion analysis on all signal results."""
        ecg = ecg_result or {}
        emg = emg_result or {}
        eeg = eeg_result or {}

        # Extract key probabilities
        ecg_pred = ecg.get("predictions", {})
        emg_pred = emg.get("predictions", {})
        eeg_pred = eeg.get("predictions", {})

        ecg_arrhythmia = ecg_pred.get("arrhythmia_probability", 0)
        emg_fatigue = emg_pred.get("fatigue_score", 0)
        eeg_seizure = eeg_pred.get("seizure_probability", 0)

        ecg_hr = ecg.get("features", {}).get("hr_bpm", 72)
        emg_rms = emg.get("features", {}).get("rms", 0.1)

        # Evaluate disease rules
        flags = []
        rules = self._evaluate_rules(ecg_arrhythmia, emg_fatigue, eeg_seizure, ecg_hr, emg_rms)

        # Compute overall risk score
        risk_score = self._compute_risk_score(ecg_arrhythmia, emg_fatigue, eeg_seizure, rules)

        # Risk level
        if risk_score > 0.85:
            risk_level = "CRITICAL"
        elif risk_score > 0.65:
            risk_level = "HIGH"
        elif risk_score > 0.3:
            risk_level = "MODERATE"
        else:
            risk_level = "LOW"

        # Primary condition
        detected = [r for r in rules if r["detected"]]
        if detected:
            primary = max(detected, key=lambda x: x["score"])
            primary_condition = primary["name"]
            severity = primary["severity"]
            reason = primary["reason"]
        else:
            primary_condition = "Normal"
            severity = "LOW"
            reason = "All signals within normal range"

        # Cross-signal correlation (simulated from feature similarity)
        corr_matrix = self._compute_correlation(ecg, emg, eeg)

        # Model confidences
        ecg_conf = max(ecg_pred.get("class_probabilities", {}).values()) if ecg_pred.get("class_probabilities") else 0.5
        emg_cond_probs = emg_pred.get("condition_probabilities", {})
        emg_conf = max(emg_cond_probs.values()) if emg_cond_probs else 0.5
        eeg_conf = 1 - eeg_seizure if eeg_seizure < 0.5 else eeg_seizure

        return {
            "risk_score": round(risk_score, 3),
            "risk_level": risk_level,
            "primary_condition": primary_condition,
            "severity": severity,
            "reason": reason,
            "rules": rules,
            "correlation_matrix": corr_matrix,
            "risk_trend": "STABLE",
            "model_confidences": {
                "ecg": round(float(ecg_conf), 3),
                "emg": round(float(emg_conf), 3),
                "eeg": round(float(eeg_conf), 3),
            },
        }

    def _evaluate_rules(self, ecg_arr, emg_fat, eeg_seiz, hr, emg_rms):
        """Evaluate all 5 disease rules."""
        rules = []

        # Rule 1: SUDEP Risk (ECG arrhythmia + EEG seizure)
        sudep_score = (ecg_arr * 0.5 + eeg_seiz * 0.5)
        sudep_detected = ecg_arr > 0.4 and eeg_seiz > 0.4
        rules.append({
            "name": "SUDEP Risk",
            "severity": "CRITICAL",
            "detected": sudep_detected,
            "score": round(sudep_score, 3),
            "reason": "Cardiac arrhythmia concurrent with seizure activity" if sudep_detected else "No concurrent cardiac-neural events",
            "contributing": {
                "ecg_arrhythmia": round(ecg_arr, 3),
                "eeg_seizure": round(eeg_seiz, 3),
            },
        })

        # Rule 2: Motor Neuron Pattern (EMG + EEG abnormal)
        motor_score = (emg_fat * 0.4 + eeg_seiz * 0.3 + (0.3 if emg_rms > 0.3 else 0))
        motor_detected = emg_fat > 0.5 and eeg_seiz > 0.3
        rules.append({
            "name": "Motor Neuron Pattern",
            "severity": "HIGH",
            "detected": motor_detected,
            "score": round(motor_score, 3),
            "reason": "Abnormal EMG fatigue with EEG irregularity" if motor_detected else "Normal motor neuron function",
            "contributing": {
                "emg_fatigue": round(emg_fat, 3),
                "eeg_seizure": round(eeg_seiz, 3),
            },
        })

        # Rule 3: Autonomic Stress (all three elevated)
        stress_hr = 1 if hr > 100 else (hr - 60) / 40 if hr > 60 else 0
        stress_score = (stress_hr * 0.4 + emg_rms * 0.3 + eeg_seiz * 0.3)
        stress_detected = hr > 100 and emg_rms > 0.15 and eeg_seiz > 0.2
        rules.append({
            "name": "Autonomic Stress",
            "severity": "MODERATE",
            "detected": stress_detected,
            "score": round(min(stress_score, 1), 3),
            "reason": "Elevated heart rate, muscle tension, and neural activity" if stress_detected else "Normal autonomic function",
            "contributing": {
                "ecg_hr": round(hr, 1),
                "emg_rms": round(emg_rms, 4),
                "eeg_seizure": round(eeg_seiz, 3),
            },
        })

        # Rule 4: Cardiac Arrhythmia (ECG only)
        rules.append({
            "name": "Cardiac Arrhythmia",
            "severity": "HIGH",
            "detected": ecg_arr > 0.5,
            "score": round(ecg_arr, 3),
            "reason": "Significant arrhythmia pattern detected" if ecg_arr > 0.5 else "Normal cardiac rhythm",
            "contributing": {
                "ecg_arrhythmia": round(ecg_arr, 3),
            },
        })

        # Rule 5: Muscle Fatigue
        rules.append({
            "name": "Muscle Fatigue Pattern",
            "severity": "MODERATE",
            "detected": emg_fat > 0.5,
            "score": round(emg_fat, 3),
            "reason": "Progressive muscle fatigue indicated by frequency shift" if emg_fat > 0.5 else "Normal muscle function",
            "contributing": {
                "emg_fatigue": round(emg_fat, 3),
            },
        })

        return rules

    def _compute_risk_score(self, ecg_arr, emg_fat, eeg_seiz, rules):
        """Compute weighted overall risk score."""
        # Base risk from individual signals
        base_risk = ecg_arr * 0.35 + emg_fat * 0.25 + eeg_seiz * 0.4

        # Boost from detected conditions
        detected = [r for r in rules if r["detected"]]
        if detected:
            severity_boost = {
                "CRITICAL": 0.3,
                "HIGH": 0.15,
                "MODERATE": 0.05,
            }
            boost = max(severity_boost.get(r["severity"], 0) for r in detected)
            base_risk = min(base_risk + boost, 1.0)

        return base_risk

    def _compute_correlation(self, ecg, emg, eeg):
        """Compute cross-signal correlation matrix."""
        # Build simple feature vectors from each signal
        ecg_feats = self._signal_summary(ecg)
        emg_feats = self._signal_summary(emg)
        eeg_feats = self._signal_summary(eeg)

        if ecg_feats is None or emg_feats is None or eeg_feats is None:
            return [[1.0, 0.1, 0.1], [0.1, 1.0, 0.1], [0.1, 0.1, 1.0]]

        signals = [ecg_feats, emg_feats, eeg_feats]
        n = len(signals)
        corr = [[0.0] * n for _ in range(n)]

        for i in range(n):
            for j in range(n):
                if i == j:
                    corr[i][j] = 1.0
                else:
                    min_len = min(len(signals[i]), len(signals[j]))
                    if min_len > 1:
                        c = float(np.corrcoef(signals[i][:min_len], signals[j][:min_len])[0, 1])
                        corr[i][j] = round(c if not np.isnan(c) else 0, 3)
                    else:
                        corr[i][j] = 0.0

        return corr

    def _signal_summary(self, result):
        """Extract a summary feature vector from a signal's result."""
        filtered = result.get("filtered_signal")
        if filtered and len(filtered) > 10:
            sig = np.array(filtered[:2000])
            # Downsample heavily for correlation
            step = max(1, len(sig) // 100)
            return sig[::step]
        return None
