"""
BioFusion AI — EMG ML Model
Condition classifier (Healthy/Myopathy/Neuropathy) + Gesture classifier
"""
import os
import numpy as np
import joblib


class EMGModel:
    CONDITION_CLASSES = ["Healthy", "Myopathy", "Neuropathy"]
    GESTURE_CLASSES = ["Rest", "Fist", "Open", "Point"]
    CONDITION_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models_saved", "emg_condition_model.pkl")
    GESTURE_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models_saved", "emg_gesture_model.pkl")
    SCALER_PATH = os.path.join(os.path.dirname(__file__), "..", "models_saved", "emg_scaler.pkl")

    CONDITION_FEATURES = ["rms", "mav", "zcr", "wl", "ssc", "mnf", "mdf", "var"]
    GESTURE_FEATURES = ["rms", "mav", "zcr", "wl", "ssc"]

    def __init__(self):
        self.condition_model = None
        self.gesture_model = None
        self.scaler = None
        self.loaded = False

    def load(self):
        try:
            self.condition_model = joblib.load(self.CONDITION_MODEL_PATH)
            self.scaler = joblib.load(self.SCALER_PATH)
            self.loaded = True
            print("[EMG] Condition model loaded successfully")
        except Exception as e:
            print(f"[EMG] Could not load condition model: {e}")

        try:
            self.gesture_model = joblib.load(self.GESTURE_MODEL_PATH)
            print("[EMG] Gesture model loaded successfully")
        except Exception as e:
            print(f"[EMG] Could not load gesture model: {e}")

    def predict_condition(self, features_dict):
        """Predict neuromuscular condition."""
        if not self.loaded or self.condition_model is None:
            return self._fallback_condition(features_dict)

        feature_vec = np.array([
            features_dict.get(k, 0) for k in self.CONDITION_FEATURES
        ]).reshape(1, -1)

        try:
            feature_vec_scaled = self.scaler.transform(feature_vec)
            probabilities = self.condition_model.predict_proba(feature_vec_scaled)[0]
            predicted_idx = int(np.argmax(probabilities))
            predicted_class = self.CONDITION_CLASSES[predicted_idx]

            return {
                "condition": predicted_class,
                "condition_probabilities": {
                    cls: round(float(p), 4)
                    for cls, p in zip(self.CONDITION_CLASSES, probabilities)
                },
            }
        except Exception as e:
            print(f"[EMG] Condition prediction error: {e}")
            return self._fallback_condition(features_dict)

    def predict_gesture(self, features_dict):
        """Predict hand gesture from EMG features."""
        if self.gesture_model is None:
            return self._fallback_gesture(features_dict)

        feature_vec = np.array([
            features_dict.get(k, 0) for k in self.GESTURE_FEATURES
        ]).reshape(1, -1)

        try:
            probabilities = self.gesture_model.predict_proba(feature_vec)[0]
            predicted_idx = int(np.argmax(probabilities))
            predicted_gesture = self.GESTURE_CLASSES[predicted_idx]

            return {
                "gesture": predicted_gesture,
                "gesture_confidence": round(float(probabilities[predicted_idx]), 4),
                "all_gesture_probs": {
                    cls: round(float(p), 4)
                    for cls, p in zip(self.GESTURE_CLASSES, probabilities)
                },
            }
        except Exception:
            return self._fallback_gesture(features_dict)

    def predict(self, features_dict, fatigue_data=None):
        """Combined prediction."""
        condition = self.predict_condition(features_dict)
        gesture = self.predict_gesture(features_dict)

        result = {**condition, **gesture}

        if fatigue_data:
            result["fatigue_score"] = fatigue_data.get("fatigue_score", 0)
            result["fatigue_level"] = fatigue_data.get("fatigue_level", "Fresh")
        else:
            result["fatigue_score"] = 0
            result["fatigue_level"] = "Fresh"

        return result

    def _fallback_condition(self, features_dict):
        rms = features_dict.get("rms", 0.1)
        mnf = features_dict.get("mnf", 90)

        if mnf < 50:
            probs = {"Healthy": 0.1, "Myopathy": 0.6, "Neuropathy": 0.3}
            cond = "Myopathy"
        elif rms > 0.5:
            probs = {"Healthy": 0.15, "Myopathy": 0.2, "Neuropathy": 0.65}
            cond = "Neuropathy"
        else:
            probs = {"Healthy": 0.85, "Myopathy": 0.08, "Neuropathy": 0.07}
            cond = "Healthy"

        return {"condition": cond, "condition_probabilities": probs}

    def _fallback_gesture(self, features_dict):
        rms = features_dict.get("rms", 0)
        if rms < 0.01:
            gesture = "Rest"
            probs = {"Rest": 0.9, "Fist": 0.04, "Open": 0.03, "Point": 0.03}
        else:
            gesture = "Fist"
            probs = {"Rest": 0.1, "Fist": 0.6, "Open": 0.2, "Point": 0.1}

        return {
            "gesture": gesture,
            "gesture_confidence": round(probs[gesture], 4),
            "all_gesture_probs": probs,
        }
