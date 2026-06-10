"""
BioFusion AI — EEG ML Model
SVM for seizure detection + rule-based mental state
"""
import os
import numpy as np
import joblib


class EEGModel:
    SEIZURE_CLASSES = ["Normal", "Seizure"]
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models_saved", "eeg_model.pkl")
    SCALER_PATH = os.path.join(os.path.dirname(__file__), "..", "models_saved", "eeg_scaler.pkl")
    FEATURE_NAMES = [
        "delta_rel", "theta_rel", "alpha_rel", "beta_rel", "gamma_rel",
        "alpha_beta_ratio", "spectral_entropy", "engagement_index",
    ]

    def __init__(self):
        self.model = None
        self.scaler = None
        self.loaded = False

    def load(self):
        try:
            self.model = joblib.load(self.MODEL_PATH)
            self.scaler = joblib.load(self.SCALER_PATH)
            self.loaded = True
            print("[EEG] Model loaded successfully")
        except Exception as e:
            print(f"[EEG] Could not load model: {e}")
            self.loaded = False

    def predict(self, features_dict):
        """Predict seizure probability and mental state."""
        # Mental state (always rule-based)
        mental_state = features_dict.get("mental_state", "Neutral")

        # Seizure detection
        if self.loaded:
            seizure_result = self._ml_predict(features_dict)
        else:
            seizure_result = self._fallback_predict(features_dict)

        return {
            "mental_state": mental_state,
            "seizure_probability": seizure_result["seizure_probability"],
            "seizure_risk": seizure_result["seizure_risk"],
            "dominant_band": features_dict.get("dominant_band", "Alpha"),
        }

    def _ml_predict(self, features_dict):
        feature_vec = np.array([
            features_dict.get(k, 0) for k in self.FEATURE_NAMES
        ]).reshape(1, -1)

        try:
            feature_vec = self.scaler.transform(feature_vec)
            probabilities = self.model.predict_proba(feature_vec)[0]
            seizure_prob = float(probabilities[1]) if len(probabilities) > 1 else 0

            if seizure_prob > 0.65:
                risk = "HIGH"
            elif seizure_prob > 0.35:
                risk = "MODERATE"
            else:
                risk = "LOW"

            return {
                "seizure_probability": round(seizure_prob, 4),
                "seizure_risk": risk,
            }
        except Exception as e:
            print(f"[EEG] ML prediction error: {e}")
            return self._fallback_predict(features_dict)

    def _fallback_predict(self, features_dict):
        """Rule-based seizure risk estimation."""
        delta_rel = features_dict.get("delta_rel", 0.3)
        beta_rel = features_dict.get("beta_rel", 0.15)
        spectral_entropy = features_dict.get("spectral_entropy", 4.0)

        # High delta + low entropy = possible seizure
        risk_score = 0
        if delta_rel > 0.5:
            risk_score += 0.3
        if beta_rel > 0.3:
            risk_score += 0.2
        if spectral_entropy < 2.5:
            risk_score += 0.3

        seizure_prob = min(risk_score, 0.95)

        if seizure_prob > 0.65:
            risk = "HIGH"
        elif seizure_prob > 0.35:
            risk = "MODERATE"
        else:
            risk = "LOW"

        return {
            "seizure_probability": round(seizure_prob, 4),
            "seizure_risk": risk,
        }
