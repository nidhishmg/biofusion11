"""
BioFusion AI — ECG ML Model
RandomForest classifier for arrhythmia detection trained on MIT-BIH
"""
import os
import numpy as np
import joblib


class ECGModel:
    CLASSES = ["Normal", "PVC", "Atrial", "Block"]
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models_saved", "ecg_model.pkl")
    SCALER_PATH = os.path.join(os.path.dirname(__file__), "..", "models_saved", "ecg_scaler.pkl")
    FEATURE_NAMES = [
        "hr_bpm", "mean_rr", "std_rr", "rmssd", "pnn50",
        "qrs_width", "lf_power", "hf_power", "lf_hf_ratio",
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
            print("[ECG] Model loaded successfully")
        except Exception as e:
            print(f"[ECG] Could not load model: {e}")
            self.loaded = False

    def predict(self, features_dict):
        """Predict arrhythmia class from ECG features dict."""
        if not self.loaded:
            return self._fallback_predict(features_dict)

        feature_vec = np.array([
            features_dict.get(k, 0) for k in self.FEATURE_NAMES
        ]).reshape(1, -1)

        try:
            feature_vec = self.scaler.transform(feature_vec)
            probabilities = self.model.predict_proba(feature_vec)[0]
            predicted_idx = int(np.argmax(probabilities))
            predicted_class = self.CLASSES[predicted_idx]

            return {
                "predicted_class": predicted_class,
                "arrhythmia_probability": round(1 - float(probabilities[0]), 4),
                "class_probabilities": {
                    cls: round(float(p), 4) for cls, p in zip(self.CLASSES, probabilities)
                },
            }
        except Exception as e:
            print(f"[ECG] Prediction error: {e}")
            return self._fallback_predict(features_dict)

    def _fallback_predict(self, features_dict):
        """Rule-based fallback when model is not available."""
        hr = features_dict.get("hr_bpm", 72)
        rmssd = features_dict.get("rmssd", 40)
        std_rr = features_dict.get("std_rr", 50)

        # Simple heuristic
        if hr < 40 or hr > 150:
            probs = {"Normal": 0.2, "PVC": 0.4, "Atrial": 0.25, "Block": 0.15}
            pred = "PVC"
        elif std_rr > 100:
            probs = {"Normal": 0.3, "PVC": 0.15, "Atrial": 0.4, "Block": 0.15}
            pred = "Atrial"
        else:
            probs = {"Normal": 0.85, "PVC": 0.07, "Atrial": 0.05, "Block": 0.03}
            pred = "Normal"

        return {
            "predicted_class": pred,
            "arrhythmia_probability": round(1 - probs["Normal"], 4),
            "class_probabilities": probs,
        }
