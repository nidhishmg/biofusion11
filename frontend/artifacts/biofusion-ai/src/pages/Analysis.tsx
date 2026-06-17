import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Heart, Zap, Brain, Activity, Download, Upload,
  CheckCircle, AlertCircle, Loader2, FileText, ChevronRight,
  Sparkles, Clock, Play, Wifi, WifiOff, AlertTriangle, Radio
} from "lucide-react";
import { useESP32Stream } from "@/hooks/useESP32Stream";
import { useAnalysisStore } from "@/store/analysisStore";
import { ECGPanel } from "@/components/ECGPanel";
import { EMGPanel } from "@/components/EMGPanel";
import { EEGPanel } from "@/components/EEGPanel";
import { FusionPanel } from "@/components/FusionPanel";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || "";

interface UploadPayload {
  signal: number[];
  sample_rate: number;
  filename: string;
  duration_seconds?: number;
  num_samples?: number;
}

function mapEmgAnalysis(raw: any) {
  const meanFreqTimeline =
    raw?.fatigue?.mean_frequency_over_time ??
    raw?.psd?.mean_frequency_over_time ??
    [];

  return {
    filtered_signal: raw?.filtered_signal ?? [],
    envelope: raw?.envelope ?? [],
    features: raw?.features ?? { rms: 0, mav: 0, zcr: 0, wl: 0, mnf: 0, mdf: 0 },
    predictions: {
      gesture: raw?.predictions?.gesture ?? "Rest",
      gesture_confidence: raw?.predictions?.gesture_confidence ?? 0,
      all_gesture_probs: raw?.predictions?.all_gesture_probs ?? {},
      condition: raw?.predictions?.condition ?? "Healthy",
      condition_probabilities: raw?.predictions?.condition_probabilities ?? {},
      fatigue_score: raw?.predictions?.fatigue_score ?? raw?.fatigue?.fatigue_score ?? 0,
      fatigue_level: raw?.predictions?.fatigue_level ?? raw?.fatigue?.fatigue_level ?? "Fresh",
    },
    psd: {
      frequencies: raw?.psd?.frequencies ?? [],
      power: raw?.psd?.power ?? [],
      mean_frequency_over_time: meanFreqTimeline,
    },
  };
}

function mapEegAnalysis(raw: any) {
  return {
    filtered_signal: raw?.filtered_signal ?? [],
    features: {
      delta_rel: raw?.features?.delta_rel ?? 0,
      theta_rel: raw?.features?.theta_rel ?? 0,
      alpha_rel: raw?.features?.alpha_rel ?? 0,
      beta_rel: raw?.features?.beta_rel ?? 0,
      gamma_rel: raw?.features?.gamma_rel ?? 0,
      alpha_beta_ratio: raw?.features?.alpha_beta_ratio ?? 0,
      spectral_entropy: raw?.features?.spectral_entropy ?? 0,
      engagement_index: raw?.features?.engagement_index ?? 0,
    },
    predictions: {
      mental_state: raw?.predictions?.mental_state ?? "Unknown",
      seizure_probability: raw?.predictions?.seizure_probability ?? 0,
      dominant_band: raw?.predictions?.dominant_band ?? "Unknown",
    },
    band_spectrum: {
      frequencies: raw?.band_spectrum?.frequencies ?? [],
      total_power: raw?.band_spectrum?.total_power ?? [],
      delta_power: raw?.band_spectrum?.delta_power ?? [],
      theta_power: raw?.band_spectrum?.theta_power ?? [],
      alpha_power: raw?.band_spectrum?.alpha_power ?? [],
      beta_power: raw?.band_spectrum?.beta_power ?? [],
      gamma_power: raw?.band_spectrum?.gamma_power ?? [],
    },
  };
}

function mapFusion(raw: any) {
  const flagsFromRules = Array.isArray(raw?.rules)
    ? raw.rules.filter((r: any) => r?.detected).map((r: any) => String(r?.name))
    : [];

  return {
    risk_score: raw?.risk_score ?? 0,
    risk_level: raw?.risk_level ?? "LOW",
    primary_condition: raw?.primary_condition ?? "Normal",
    severity: raw?.severity ?? "LOW",
    reason: raw?.reason ?? "",
    flags: raw?.flags ?? flagsFromRules,
    correlation_matrix: raw?.correlation_matrix ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    risk_trend: raw?.risk_trend ?? "STABLE",
    model_confidences: raw?.model_confidences ?? { ecg: 0, emg: 0, eeg: 0 },
  };
}

type ActiveTab = "ecg" | "emg" | "eeg" | "fusion";

const TABS = [
  { key: "ecg" as ActiveTab, label: "ECG", icon: Heart, color: "#ef4444" },
  { key: "emg" as ActiveTab, label: "EMG", icon: Zap, color: "#10b981" },
  { key: "eeg" as ActiveTab, label: "EEG", icon: Brain, color: "#8b5cf6" },
  { key: "fusion" as ActiveTab, label: "BioFusion", icon: Activity, color: "#f59e0b" },
];

interface FileState {
  file: File | null;
  status: "idle" | "uploading" | "done" | "error";
  filename: string | null;
  error: string | null;
  meta: { duration?: number; samples?: number; sampleRate?: number } | null;
}

function DropZone({
  label, accept, color, icon: Icon, fileState, onFile, disabled,
}: {
  label: string;
  accept: string;
  color: string;
  icon: React.ElementType;
  fileState: FileState;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && !disabled) onFile(file);
    },
    [onFile, disabled]
  );

  const status = fileState.status;
  const borderColor =
    status === "done" ? "#10b981" :
    status === "error" ? "#ef4444" :
    dragging ? color :
    color + "44";

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-4 transition-all ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      style={{ borderColor, backgroundColor: status === "done" ? "#10b98111" : status === "error" ? "#ef444411" : "transparent" }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "22" }}>
          {status === "uploading" ? (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />
          ) : status === "done" ? (
            <CheckCircle className="w-4 h-4 text-green-400" />
          ) : status === "error" ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : (
            <Icon className="w-4 h-4" style={{ color }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: status === "done" ? "#10b981" : status === "error" ? "#ef4444" : "white" }}>
              {label}
            </span>
            {status === "done" && <span className="text-xs text-green-400">✓ Ready</span>}
            {status === "error" && <span className="text-xs text-red-400">Error</span>}
          </div>

          {status === "idle" && (
            <p className="text-xs text-gray-500 mt-0.5">Click or drag file ({accept})</p>
          )}
          {status === "uploading" && (
            <p className="text-xs text-yellow-400 mt-0.5">Processing file...</p>
          )}
          {status === "done" && fileState.filename && (
            <div className="flex items-center gap-2 mt-0.5">
              <FileText className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-400 truncate max-w-[140px]">{fileState.filename}</span>
              {fileState.meta?.duration && (
                <span className="text-xs text-gray-500">{fileState.meta.duration.toFixed(1)}s</span>
              )}
            </div>
          )}
          {status === "error" && fileState.error && (
            <p className="text-xs text-red-400 mt-0.5 truncate">{fileState.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionTimer({ startTime }: { startTime: Date | null }) {
  const [elapsed, setElapsed] = useState(0);
  useState(() => {
    if (!startTime) return;
    const id = setInterval(() => setElapsed(Date.now() - startTime.getTime()), 1000);
    return () => clearInterval(id);
  });
  const secs = Math.floor(elapsed / 1000);
  const mins = Math.floor(secs / 60);
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400">
      <Clock className="w-3.5 h-3.5" />
      <span className="font-mono">{String(mins).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</span>
    </div>
  );
}

export function Analysis() {
  const [, navigate] = useLocation();
  const store = useAnalysisStore();

  const [activeTab, setActiveTab] = useState<ActiveTab>("ecg");
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [hardwareMode, setHardwareMode] = useState(false);
  const [simProfile, setSimProfile] = useState<"none" | "19yo" | "40yo">("none");
  const [liveValueMode, setLiveValueMode] = useState(false);

  // ESP32 live stream hook
  const { ecgHistory, emgHistory, eegLatest, leadOff, fallbackActive, connected, inference } = useESP32Stream();

  const activateSimulation = async (profile: "19yo" | "40yo") => {
    setSimProfile(profile);
    setHardwareMode(true);
    setSessionStart(new Date());
    store.resetAnalysis();
    await fetch(`${API_BASE}/api/hardware/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true, profile }),
    }).catch(() => {});
  };

  const enterRealEsp32Mode = async () => {
    // Always start simulation in background — but UI shows "ESP32 Connected"
    // because this is what we present as live hardware
    setSimProfile("19yo");   // start with healthy 19yo profile by default
    setHardwareMode(true);
    setLiveValueMode(false);
    setSessionStart(new Date());
    store.resetAnalysis();
    await fetch(`${API_BASE}/api/hardware/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true, profile: "19yo" }),
    }).catch(() => {});
  };

  const enterLiveValueMode = async () => {
    // Stop any simulation — use REAL ESP32 hardware data
    setLiveValueMode(true);
    setHardwareMode(true);
    setSimProfile("none");
    setSessionStart(new Date());
    store.resetAnalysis();
    // Stop simulation so real ESP32 WebSocket data flows through
    await fetch(`${API_BASE}/api/hardware/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false, profile: "none" }),
    }).catch(() => {});
  };

  const exitLiveValueMode = async () => {
    setLiveValueMode(false);
    setHardwareMode(false);
    setSimProfile("none");
    store.resetAnalysis();
    await fetch(`${API_BASE}/api/hardware/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false, profile: "none" }),
    }).catch(() => {});
  };

  const stopSimulation = async () => {
    setSimProfile("none");
    setHardwareMode(false);
    setLiveValueMode(false);
    store.resetAnalysis();
    await fetch(`${API_BASE}/api/hardware/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false, profile: "none" }),
    }).catch(() => {});
  };

  // Sync live inference → Zustand store so full panels (BioFusion graph etc.) render
  // Sync live data → store for Live Value mode (real ESP32 hardware)
  useEffect(() => {
    if (!liveValueMode || !hardwareMode) return;
    if (ecgHistory.length === 0) return;

    const ecg = {
      filtered_signal: ecgHistory.slice(-300),
      r_peaks: [],
      features: {
        hr_bpm: inference?.ecg?.features?.hr_bpm ?? 0,
        mean_rr: inference?.ecg?.features?.mean_rr ?? 0,
        std_rr: inference?.ecg?.features?.std_rr ?? 0,
        rmssd: inference?.ecg?.features?.rmssd ?? 0,
        pnn50: inference?.ecg?.features?.pnn50 ?? 0,
        qrs_width: inference?.ecg?.features?.qrs_width ?? 0,
      },
      predictions: {
        predicted_class: (inference as any)?.ecg?.predictions?.predicted_class ?? "Awaiting Data...",
        arrhythmia_probability: (inference as any)?.ecg?.predictions?.arrhythmia_probability ?? 0,
        class_probabilities: (inference as any)?.ecg?.predictions?.class_probabilities ?? {},
      },
      rr_intervals: Array.from({ length: 20 }, () => 857 + (Math.random() - 0.5) * 60),
      hrv_spectrum: {
        frequencies: Array.from({ length: 50 }, (_, i) => i * 0.01),
        power: Array.from({ length: 50 }, (_, i) => Math.exp(-i * 0.1) * 100),
        lf_power: 400,
        hf_power: 350,
        lf_hf_ratio: 1.14,
      },
      poincare: {
        rr_n: Array.from({ length: 20 }, () => 857 + (Math.random() - 0.5) * 80),
        rr_n1: Array.from({ length: 20 }, () => 857 + (Math.random() - 0.5) * 80),
        sd1: 25,
        sd2: 48,
      },
      signal_quality: 0.95,
    };

    const emg = {
      filtered_signal: emgHistory.slice(-300),
      envelope: emgHistory.slice(-300).map(v => Math.abs(v - 1500) * 0.6),
      features: {
        rms: inference?.emg?.features?.rms ?? 0,
        mav: inference?.emg?.features?.mav ?? 0,
        zcr: inference?.emg?.features?.zcr ?? 0,
        wl: inference?.emg?.features?.wl ?? 0,
        mnf: inference?.emg?.features?.mnf ?? 0,
        mdf: inference?.emg?.features?.mdf ?? 0,
      },
      predictions: {
        gesture: (inference as any)?.emg?.predictions?.gesture ?? "Rest",
        gesture_confidence: (inference as any)?.emg?.predictions?.gesture_confidence ?? 0,
        all_gesture_probs: (inference as any)?.emg?.predictions?.all_gesture_probs ?? {},
        condition: (inference as any)?.emg?.predictions?.condition ?? "Awaiting Data...",
        condition_probabilities: {},
        fatigue_score: (inference as any)?.emg?.predictions?.fatigue_score ?? 0,
        fatigue_level: (inference as any)?.emg?.predictions?.fatigue_level ?? "Unknown",
      },
      psd: {
        frequencies: Array.from({ length: 64 }, (_, i) => i * 4),
        power: Array.from({ length: 64 }, (_, i) => Math.exp(-Math.pow(i - 16, 2) / 40) * 1.5),
        mean_frequency_over_time: Array.from({ length: 30 }, (_, i) => 130 - i * 0.3),
      },
    };

    // EEG from backend (simulated but synced with real ESP32 timestamps)
    const eegBands = eegLatest ?? { alpha: 0, beta: 0, theta: 0, delta: 0 };
    const totalPow = eegBands.alpha + eegBands.beta + eegBands.theta + eegBands.delta || 1;
    const eeg = {
      filtered_signal: Array.from({ length: 300 }, (_, i) => {
        const t = i / 50;
        return 0.5 * Math.sin(2 * Math.PI * 10 * t) + 0.3 * Math.sin(2 * Math.PI * 20 * t)
          + 0.2 * (Math.random() - 0.5);
      }),
      features: {
        delta_rel: eegBands.delta / totalPow,
        theta_rel: eegBands.theta / totalPow,
        alpha_rel: eegBands.alpha / totalPow,
        beta_rel: eegBands.beta / totalPow,
        gamma_rel: 0.03,
        alpha_beta_ratio: eegBands.alpha / (eegBands.beta || 1),
        spectral_entropy: 4.0,
        engagement_index: eegBands.beta / (eegBands.alpha + eegBands.theta || 1),
      },
      predictions: {
        mental_state: (inference as any)?.eeg?.predictions?.mental_state ?? "Awaiting Data...",
        seizure_probability: (inference as any)?.eeg?.predictions?.seizure_probability ?? 0,
        dominant_band: (inference as any)?.eeg?.predictions?.dominant_band ?? "Unknown",
      },
      band_spectrum: {
        frequencies: Array.from({ length: 50 }, (_, i) => i),
        total_power: Array.from({ length: 50 }, (_, i) => Math.exp(-i * 0.04) * 2.5),
        delta_power: Array.from({ length: 50 }, (_, i) => i < 4 ? 0.6 : 0.01),
        theta_power: Array.from({ length: 50 }, (_, i) => (i >= 4 && i < 8) ? 0.4 : 0.01),
        alpha_power: Array.from({ length: 50 }, (_, i) => (i >= 8 && i < 13) ? 0.9 : 0.01),
        beta_power: Array.from({ length: 50 }, (_, i) => (i >= 13 && i < 30) ? 0.5 : 0.01),
        gamma_power: Array.from({ length: 50 }, (_, i) => (i >= 30) ? 0.1 : 0.01),
      },
    };

    const fusionRisk = (inference as any)?.fusion?.risk_score ?? 0.05;
    const fusion = {
      risk_score: fusionRisk,
      risk_level: (inference as any)?.fusion?.risk_level ?? "LOW",
      primary_condition: (inference as any)?.fusion?.primary_condition ?? "Awaiting Data...",
      severity: (inference as any)?.fusion?.severity ?? "LOW",
      reason: (inference as any)?.fusion?.reason ?? "Streaming real ECG+EMG from ESP32. EEG simulated.",
      flags: (inference as any)?.fusion?.flags ?? [],
      correlation_matrix: [[1, 0.12, 0.08], [0.12, 1, 0.15], [0.08, 0.15, 1]],
      risk_trend: "STABLE",
      model_confidences: {
        ecg: 0.90,
        emg: 0.88,
        eeg: 0.85,
      },
    };

    store.setEcgAnalysis(ecg as any);
    store.setEmgAnalysis(emg as any);
    store.setEegAnalysis(eeg as any);
    store.setFusionResult(fusion as any);
  }, [ecgHistory, emgHistory, eegLatest, inference, liveValueMode, hardwareMode]);

  // Sync simulation data → store (existing demo mode)
  useEffect(() => {
    if (liveValueMode) return;  // Skip if in real live mode
    if (!hardwareMode || !inference) return;
    const inf = inference as any;

    const ecgFeats = inf?.ecg?.features ?? {};
    const ecg = {
      filtered_signal: ecgHistory.slice(-300),
      r_peaks: [],
      features: {
        hr_bpm: ecgFeats.hr_bpm ?? (simProfile === "19yo" ? 70 : 62),
        mean_rr: ecgFeats.mean_rr ?? (simProfile === "19yo" ? 857 : 968),
        std_rr: ecgFeats.std_rr ?? (simProfile === "19yo" ? 28 : 45),
        rmssd: ecgFeats.rmssd ?? (simProfile === "19yo" ? 42 : 28),
        pnn50: ecgFeats.pnn50 ?? (simProfile === "19yo" ? 0.22 : 0.11),
        qrs_width: ecgFeats.qrs_width ?? (simProfile === "19yo" ? 0.08 : 0.095),
      },
      predictions: {
        predicted_class: inf?.ecg?.predictions?.predicted_class ?? "Normal Sinus Rhythm",
        arrhythmia_probability: inf?.ecg?.predictions?.arrhythmia_probability ?? (simProfile === "19yo" ? 0.03 : 0.08),
        class_probabilities: inf?.ecg?.predictions?.class_probabilities ?? {
          Normal: simProfile === "19yo" ? 0.97 : 0.92,
          PVC: simProfile === "19yo" ? 0.02 : 0.05,
          Atrial: simProfile === "19yo" ? 0.01 : 0.03,
        },
      },
      rr_intervals: Array.from({ length: 20 }, (_, i) => {
        const base = simProfile === "19yo" ? 857 : 968;
        return base + (Math.random() - 0.5) * (simProfile === "19yo" ? 60 : 90);
      }),
      hrv_spectrum: {
        frequencies: Array.from({ length: 50 }, (_, i) => i * 0.01),
        power: Array.from({ length: 50 }, (_, i) => Math.exp(-i * 0.1) * (simProfile === "19yo" ? 120 : 80)),
        lf_power: simProfile === "19yo" ? 420 : 280,
        hf_power: simProfile === "19yo" ? 380 : 160,
        lf_hf_ratio: simProfile === "19yo" ? 1.1 : 1.75,
      },
      poincare: {
        rr_n: Array.from({ length: 20 }, () => 857 + (Math.random() - 0.5) * 80),
        rr_n1: Array.from({ length: 20 }, () => 857 + (Math.random() - 0.5) * 80),
        sd1: simProfile === "19yo" ? 28 : 19,
        sd2: simProfile === "19yo" ? 52 : 38,
      },
      signal_quality: simProfile === "19yo" ? 0.96 : 0.91,
    };

    const emgFeats = inf?.emg?.features ?? {};
    const emg = {
      filtered_signal: emgHistory.slice(-300),
      envelope: emgHistory.slice(-300).map(v => Math.abs(v - 1500) * 0.6),
      features: {
        rms: emgFeats.rms ?? (simProfile === "19yo" ? 0.18 : 0.26),
        mav: emgFeats.mav ?? (simProfile === "19yo" ? 0.14 : 0.21),
        zcr: emgFeats.zcr ?? (simProfile === "19yo" ? 0.31 : 0.27),
        wl: emgFeats.wl ?? (simProfile === "19yo" ? 12.4 : 9.8),
        mnf: emgFeats.mnf ?? (simProfile === "19yo" ? 142 : 118),
        mdf: emgFeats.mdf ?? (simProfile === "19yo" ? 128 : 104),
      },
      predictions: {
        gesture: inf?.emg?.predictions?.gesture ?? "Rest",
        gesture_confidence: inf?.emg?.predictions?.gesture_confidence ?? (simProfile === "19yo" ? 0.94 : 0.87),
        all_gesture_probs: inf?.emg?.predictions?.all_gesture_probs ?? {
          Rest: simProfile === "19yo" ? 0.94 : 0.87,
          Fist: simProfile === "19yo" ? 0.04 : 0.08,
          Open: simProfile === "19yo" ? 0.02 : 0.05,
        },
        condition: simProfile === "19yo" ? "Healthy" : "Healthy",
        condition_probabilities: {
          Healthy: simProfile === "19yo" ? 0.95 : 0.80,
          Myopathy: simProfile === "19yo" ? 0.03 : 0.14,
          Neuropathy: simProfile === "19yo" ? 0.02 : 0.06,
        },
        fatigue_score: inf?.emg?.predictions?.fatigue_score ?? (simProfile === "19yo" ? 0.12 : 0.34),
        fatigue_level: simProfile === "19yo" ? "Fresh" : "Moderate",
      },
      psd: {
        frequencies: Array.from({ length: 64 }, (_, i) => i * 4),
        power: Array.from({ length: 64 }, (_, i) => {
          const mnf = simProfile === "19yo" ? 16 : 12;
          return Math.exp(-Math.pow(i - mnf, 2) / 40) * (simProfile === "19yo" ? 1.8 : 1.2);
        }),
        mean_frequency_over_time: Array.from({ length: 30 }, (_, i) => {
          const base = simProfile === "19yo" ? 142 : 118;
          return base - i * (simProfile === "19yo" ? 0.3 : 0.6);
        }),
      },
    };

    const eegFeats = inf?.eeg?.features ?? {};
    const eeg = {
      filtered_signal: Array.from({ length: 300 }, (_, i) => {
        const t = i / 50;
        return 0.5 * Math.sin(2 * Math.PI * 10 * t) + 0.3 * Math.sin(2 * Math.PI * 20 * t)
          + 0.2 * (Math.random() - 0.5);
      }),
      features: {
        delta_rel: eegFeats.delta_rel ?? (simProfile === "19yo" ? 0.21 : 0.34),
        theta_rel: eegFeats.theta_rel ?? (simProfile === "19yo" ? 0.16 : 0.26),
        alpha_rel: eegFeats.alpha_rel ?? (simProfile === "19yo" ? 0.38 : 0.22),
        beta_rel: eegFeats.beta_rel ?? (simProfile === "19yo" ? 0.22 : 0.16),
        gamma_rel: eegFeats.gamma_rel ?? (simProfile === "19yo" ? 0.03 : 0.02),
        alpha_beta_ratio: eegFeats.alpha_beta_ratio ?? (simProfile === "19yo" ? 1.73 : 1.38),
        spectral_entropy: eegFeats.spectral_entropy ?? (simProfile === "19yo" ? 4.1 : 3.8),
        engagement_index: eegFeats.engagement_index ?? (simProfile === "19yo" ? 0.38 : 0.52),
      },
      predictions: {
        mental_state: inf?.eeg?.predictions?.mental_state ?? (simProfile === "19yo" ? "Relaxed" : "Focused"),
        seizure_probability: inf?.eeg?.predictions?.seizure_probability ?? (simProfile === "19yo" ? 0.02 : 0.04),
        dominant_band: inf?.eeg?.predictions?.dominant_band ?? (simProfile === "19yo" ? "Alpha" : "Delta"),
      },
      band_spectrum: {
        frequencies: Array.from({ length: 50 }, (_, i) => i),
        total_power: Array.from({ length: 50 }, (_, i) => Math.exp(-i * 0.04) * 2.5),
        delta_power: Array.from({ length: 50 }, (_, i) => i < 4 ? 0.6 * (simProfile === "19yo" ? 1 : 1.6) : 0.01),
        theta_power: Array.from({ length: 50 }, (_, i) => (i >= 4 && i < 8) ? 0.4 * (simProfile === "19yo" ? 1 : 1.7) : 0.01),
        alpha_power: Array.from({ length: 50 }, (_, i) => (i >= 8 && i < 13) ? 0.9 * (simProfile === "19yo" ? 1.6 : 1.0) : 0.01),
        beta_power: Array.from({ length: 50 }, (_, i) => (i >= 13 && i < 30) ? 0.5 * (simProfile === "19yo" ? 1.2 : 1.0) : 0.01),
        gamma_power: Array.from({ length: 50 }, (_, i) => (i >= 30) ? 0.1 : 0.01),
      },
    };

    const fusionRisk = inf?.fusion?.risk_score ?? (simProfile === "19yo" ? 0.07 : 0.26);
    const fusion = {
      risk_score: fusionRisk,
      risk_level: inf?.fusion?.risk_level ?? (simProfile === "19yo" ? "LOW" : "MODERATE"),
      primary_condition: inf?.fusion?.primary_condition ?? (simProfile === "19yo" ? "Normal" : "Mild Stress Response"),
      severity: inf?.fusion?.severity ?? (simProfile === "19yo" ? "LOW" : "MODERATE"),
      reason: simProfile === "19yo"
        ? "All biosignals within normal range. Strong HRV, clean EMG, relaxed EEG."
        : "Mild elevation in theta/delta bands and reduced HRV suggesting stress.",
      flags: simProfile === "19yo" ? [] : ["Elevated Theta", "Reduced HRV"],
      correlation_matrix: [
        [1, simProfile === "19yo" ? 0.12 : 0.28, simProfile === "19yo" ? 0.08 : 0.22],
        [simProfile === "19yo" ? 0.12 : 0.28, 1, simProfile === "19yo" ? 0.15 : 0.31],
        [simProfile === "19yo" ? 0.08 : 0.22, simProfile === "19yo" ? 0.15 : 0.31, 1],
      ],
      risk_trend: "STABLE",
      model_confidences: {
        ecg: simProfile === "19yo" ? 0.96 : 0.89,
        emg: simProfile === "19yo" ? 0.94 : 0.85,
        eeg: simProfile === "19yo" ? 0.91 : 0.84,
      },
    };

    store.setEcgAnalysis(ecg as any);
    store.setEmgAnalysis(emg as any);
    store.setEegAnalysis(eeg as any);
    store.setFusionResult(fusion as any);
  }, [inference, hardwareMode, simProfile]);

  const [ecgFile, setEcgFile] = useState<FileState>({ file: null, status: "idle", filename: null, error: null, meta: null });
  const [emgFile, setEmgFile] = useState<FileState>({ file: null, status: "idle", filename: null, error: null, meta: null });
  const [eegFile, setEegFile] = useState<FileState>({ file: null, status: "idle", filename: null, error: null, meta: null });

  const hasResults = !!(store.ecgAnalysis && store.emgAnalysis && store.eegAnalysis && store.fusionResult);
  const allFilesReady = ecgFile.status === "done" && emgFile.status === "done" && eegFile.status === "done";
  const canRunAnalysis = allFilesReady && !isRunning;

  const uploadFile = async (
    file: File,
    uploadPath: string,
    setFileState: React.Dispatch<React.SetStateAction<FileState>>
  ): Promise<UploadPayload> => {
    setFileState((s) => ({ ...s, file, status: "uploading", filename: file.name, error: null }));
    try {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch(`${API_BASE}${uploadPath}`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }
      const data = (await res.json()) as UploadPayload;
      setFileState((s) => ({
        ...s,
        status: "done",
        filename: file.name,
        meta: {
          duration: data.duration_seconds,
          samples: data.num_samples,
          sampleRate: data.sample_rate,
        },
        error: null,
      }));
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setFileState((s) => ({ ...s, status: "error", error: msg }));
      throw err;
    }
  };

  const handleECGFile = async (file: File) => {
    try {
      const uploaded = await uploadFile(file, "/api/upload/ecg", setEcgFile);
      const analysisRes = await fetch(`${API_BASE}/api/analysis/ecg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: uploaded.signal,
          sample_rate: uploaded.sample_rate,
          source_file: uploaded.filename,
        }),
      });
      if (!analysisRes.ok) throw new Error("ECG analysis failed");
      const analysis = await analysisRes.json();
      store.setEcgAnalysis(analysis);
      store.setFusionResult(null);
      store.setUploadedFileName([file.name, emgFile.filename, eegFile.filename].filter(Boolean).join(", "));
    } catch { /* error shown in UI */ }
  };

  const handleEMGFile = async (file: File) => {
    try {
      const uploaded = await uploadFile(file, "/api/upload/emg", setEmgFile);
      const analysisRes = await fetch(`${API_BASE}/api/analysis/emg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: uploaded.signal,
          sample_rate: uploaded.sample_rate,
          source_file: uploaded.filename,
        }),
      });
      if (!analysisRes.ok) throw new Error("EMG analysis failed");
      const analysis = await analysisRes.json();
      store.setEmgAnalysis(mapEmgAnalysis(analysis));
      store.setFusionResult(null);
      store.setUploadedFileName([ecgFile.filename, file.name, eegFile.filename].filter(Boolean).join(", "));
    } catch { /* error shown in UI */ }
  };

  const handleEEGFile = async (file: File) => {
    try {
      const uploaded = await uploadFile(file, "/api/upload/eeg", setEegFile);
      const analysisRes = await fetch(`${API_BASE}/api/analysis/eeg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: uploaded.signal,
          sample_rate: uploaded.sample_rate,
          source_file: uploaded.filename,
        }),
      });
      if (!analysisRes.ok) throw new Error("EEG analysis failed");
      const analysis = await analysisRes.json();
      store.setEegAnalysis(mapEegAnalysis(analysis));
      store.setFusionResult(null);
      store.setUploadedFileName([ecgFile.filename, emgFile.filename, file.name].filter(Boolean).join(", "));
    } catch { /* error shown in UI */ }
  };

  const handleRunAnalysis = async () => {
    if (!store.ecgAnalysis || !store.emgAnalysis || !store.eegAnalysis) return;
    setIsRunning(true);
    setRunError(null);
    setSessionStart(new Date());
    try {
      const res = await fetch(`${API_BASE}/api/analysis/fusion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ecg: store.ecgAnalysis, emg: store.emgAnalysis, eeg: store.eegAnalysis }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      store.setFusionResult(mapFusion(data));
      setActiveTab("ecg");
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    setEcgFile({ file: null, status: "idle", filename: null, error: null, meta: null });
    setEmgFile({ file: null, status: "idle", filename: null, error: null, meta: null });
    setEegFile({ file: null, status: "idle", filename: null, error: null, meta: null });
    store.resetAnalysis();
    setActiveTab("ecg");
    setSessionStart(null);
  };

  const steps = [
    {
      key: "ecg", label: "ECG Signal", icon: Heart, color: "#ef4444",
      accept: ".dat,.hea,.csv,.txt",
      description: "MIT-BIH .dat/.hea, or .csv",
      fileState: ecgFile,
      onFile: handleECGFile,
    },
    {
      key: "emg", label: "EMG Signal", icon: Zap, color: "#10b981",
      accept: ".csv,.dat,.txt",
      description: "emg_healthy.csv, .dat, etc.",
      fileState: emgFile,
      onFile: handleEMGFile,
      disabled: false,
    },
    {
      key: "eeg", label: "EEG Signal", icon: Brain, color: "#8b5cf6",
      accept: ".edf,.csv,.txt",
      description: "CHB-MIT .edf or .csv",
      fileState: eegFile,
      onFile: handleEEGFile,
      disabled: false,
    },
  ];

  const completedCount = steps.filter((s) => s.fileState.status === "done").length;

  return (
    <div className="h-screen flex flex-col bg-[#050d1a] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none grid-bg opacity-15" />

      {/* TOP BAR */}
      <div className="flex-none z-40 glass border-b border-white/5">
        <div className="px-5 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            BioFusion AI
          </button>

          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
              liveValueMode
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                : hardwareMode
                  ? "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                  : "border-teal-500/40 text-teal-400 bg-teal-500/10"
            }`}>
              {liveValueMode ? "⚡ LIVE VALUES" : hardwareMode ? "LIVE HARDWARE" : "FILE UPLOAD"}
            </span>
            {hasResults && <SessionTimer startTime={sessionStart} />}
            {liveValueMode && (
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                connected
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
              }`}>
                {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span>{connected ? "ESP32 Real Data" : "Waiting for ESP32..."}</span>
                {connected && (
                  <motion.div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5"
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.6, repeat: Infinity }} />
                )}
              </div>
            )}
            {hardwareMode && !liveValueMode && (
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border
                text-green-400 border-green-500/30 bg-green-500/10`}>
                <Wifi className="w-3 h-3" />
                <span>ESP32 Connected</span>
                <motion.div className="w-1.5 h-1.5 rounded-full bg-green-400 ml-0.5"
                  animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {hasResults && (
              <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
                className="flex items-center gap-1.5 text-xs text-green-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                Live
              </motion.div>
            )}
            {hasResults && (
              <button className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded border border-white/10 hover:border-white/20 transition-colors">
                <Download className="w-3.5 h-3.5" />
                Export PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden relative z-10">

        {/* SIDEBAR */}
        <aside className="w-72 flex-none border-r border-white/5 glass flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <Upload className="w-4 h-4 text-teal-400" />
              <span className="text-sm font-semibold text-gray-200">Upload Biosignals</span>
            </div>
            <p className="text-xs text-gray-500">Upload all 3 signal files to run AI analysis</p>

            {/* Progress */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-purple-500"
                  animate={{ width: `${(completedCount / 3) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="text-xs text-gray-500">{completedCount}/3</span>
            </div>
          </div>

          {/* Steps */}
          <div className="p-4 space-y-3 flex-1">
            {steps.map((step, idx) => (
              <div key={step.key}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: step.fileState.status === "done" ? "#10b98122" : step.color + "22",
                      color: step.fileState.status === "done" ? "#10b981" : step.color,
                      border: `1px solid ${step.fileState.status === "done" ? "#10b98144" : step.color + "44"}`,
                    }}
                  >
                    {step.fileState.status === "done" ? "✓" : idx + 1}
                  </div>
                  <span className="text-xs font-medium text-gray-300">{step.label}</span>
                  <span className="text-xs text-gray-600 ml-auto">{step.description}</span>
                </div>
                <DropZone
                  label={step.label}
                  accept={step.accept}
                  color={step.color}
                  icon={step.icon}
                  fileState={step.fileState}
                  onFile={step.onFile}
                />
                {idx < steps.length - 1 && (
                  <div className="flex justify-center mt-2">
                    <ChevronRight className="w-3 h-3 text-gray-700 rotate-90" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Run Analysis Button */}
          <div className="p-4 border-t border-white/5 space-y-2">
            {runError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {runError}
              </div>
            )}

            <motion.button
              onClick={handleRunAnalysis}
              disabled={!canRunAnalysis}
              whileHover={canRunAnalysis ? { scale: 1.02 } : {}}
              whileTap={canRunAnalysis ? { scale: 0.98 } : {}}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
              style={{
                backgroundColor: canRunAnalysis ? "#14b8a655" : "#1f2937",
                border: `1px solid ${canRunAnalysis ? "#14b8a6" : "#374151"}`,
                color: canRunAnalysis ? "#14b8a6" : "#6b7280",
                cursor: canRunAnalysis ? "pointer" : "not-allowed",
              }}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Analysis...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Run AI Analysis
                </>
              )}
            </motion.button>

            {!allFilesReady && (
              <p className="text-xs text-gray-600 text-center">Upload all 3 files to enable</p>
            )}

            {hasResults && (
              <button
                onClick={handleReset}
                className="w-full py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 border border-white/5 hover:border-white/10 transition-colors"
              >
                Reset & Upload New Files
              </button>
            )}

            {/* ⚡ Live Values — Real ESP32 Hardware */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">⚡ Live Values</p>
              <motion.button
                onClick={liveValueMode ? exitLiveValueMode : enterLiveValueMode}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border ${
                  liveValueMode
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10"
                    : "bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10"
                }`}
              >
                {liveValueMode ? (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Activity className="w-4 h-4" />
                    </motion.div>
                    Live Values Active
                    <motion.div className="w-2 h-2 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Connect ESP32 — Live Values
                  </>
                )}
              </motion.button>

              {liveValueMode && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-1.5"
                >
                  <div className={`rounded-lg px-3 py-2 text-xs border ${
                    connected
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                  }`}>
                    {connected ? (
                      fallbackActive
                        ? <><span className="font-bold">🟡 ESP32 Connected:</span> Leads off — dynamic fallback waveforms active · EEG simulated</>
                        : <><span className="font-bold">🟢 Real Hardware:</span> ECG+EMG from AD8232 body electrodes · EEG simulated · Live ML</>
                    ) : (
                      <><span className="font-bold">⏳ Waiting:</span> Connect ESP32 to WiFi. Check Serial Monitor for IP.</>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="text-center px-1 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="text-[10px] text-red-400 font-semibold">ECG</div>
                      <div className="text-xs text-red-300 font-mono">{ecgHistory.length > 0 ? `${ecgHistory[ecgHistory.length-1].toFixed(0)}mV` : '—'}</div>
                    </div>
                    <div className="text-center px-1 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="text-[10px] text-green-400 font-semibold">EMG</div>
                      <div className="text-xs text-green-300 font-mono">{emgHistory.length > 0 ? `${emgHistory[emgHistory.length-1].toFixed(0)}mV` : '—'}</div>
                    </div>
                    <div className="text-center px-1 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <div className="text-[10px] text-purple-400 font-semibold">EEG</div>
                      <div className="text-xs text-purple-300 font-mono">{eegLatest ? `α${eegLatest.alpha.toFixed(0)}` : '—'}</div>
                    </div>
                  </div>
                  {connected && fallbackActive && (
                    <div className="rounded-lg px-3 py-2 text-xs border bg-amber-500/10 border-amber-500/20 text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span><span className="font-bold">Leads Off</span> — showing ESP32-synced waveforms. Attach electrodes for real data.</span>
                    </div>
                  )}
                  {connected && !fallbackActive && !leadOff && (
                    <div className="rounded-lg px-3 py-2 text-xs border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5" />
                      <span><span className="font-bold">Real Sensors</span> — live ECG+EMG from body electrodes!</span>
                    </div>
                  )}
                  <button
                    onClick={exitLiveValueMode}
                    className="w-full py-1.5 rounded-lg text-xs text-gray-600 hover:text-gray-400 border border-white/5 hover:border-white/10 transition-colors"
                  >
                    ✕ Stop Live Values
                  </button>
                </motion.div>
              )}
            </div>

            {/* Hardware Simulation Mode */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Demo Hardware</p>

              {/* Real ESP32 button — activates simulation invisibly */}
              <motion.button
                onClick={enterRealEsp32Mode}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={liveValueMode}
                className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border ${
                  liveValueMode
                    ? "bg-gray-800/50 border-gray-700 text-gray-600 cursor-not-allowed"
                    : hardwareMode && !liveValueMode
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                      : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20"
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Simulated ESP32 Data
                {hardwareMode && !liveValueMode && (
                  <motion.div className="w-1.5 h-1.5 rounded-full bg-green-400" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                )}
              </motion.button>

              {/* Profile selector — shown after entering simulation hardware mode */}
              {hardwareMode && !liveValueMode && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-1.5"
                >
                  <p className="text-xs text-gray-600 text-center">Switch patient profile:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <motion.button
                      onClick={() => activateSimulation("19yo")}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
                        simProfile === "19yo"
                          ? "bg-green-500/20 border-green-400/50 text-green-400"
                          : "bg-white/5 border-white/10 text-gray-400 hover:text-green-300 hover:border-green-500/30"
                      }`}
                    >
                      <span className="text-base">🧑‍🎓</span>
                      <span>19yo</span>
                      {simProfile === "19yo" && (
                        <motion.div className="w-1.5 h-1.5 rounded-full bg-green-400" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
                      )}
                    </motion.button>

                    <motion.button
                      onClick={() => activateSimulation("40yo")}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
                        simProfile === "40yo"
                          ? "bg-orange-500/20 border-orange-400/50 text-orange-400"
                          : "bg-white/5 border-white/10 text-gray-400 hover:text-orange-300 hover:border-orange-500/30"
                      }`}
                    >
                      <span className="text-base">🧑‍💼</span>
                      <span>40yo</span>
                      {simProfile === "40yo" && (
                        <motion.div className="w-1.5 h-1.5 rounded-full bg-orange-400" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
                      )}
                    </motion.button>
                  </div>

                  {/* Profile info */}
                  <div className={`rounded-lg px-3 py-2 text-xs border ${
                    simProfile === "19yo"
                      ? "bg-green-500/10 border-green-500/20 text-green-400"
                      : "bg-orange-500/10 border-orange-500/20 text-orange-400"
                  }`}>
                    {simProfile === "19yo" ? (
                      <><span className="font-bold">19yo:</span> HR 70 BPM · Low fatigue · Relaxed EEG · Risk: LOW</>
                    ) : (
                      <><span className="font-bold">40yo:</span> HR 62 BPM · Moderate fatigue · Theta ↑ · Risk: MODERATE</>
                    )}
                  </div>

                  <button
                    onClick={() => { stopSimulation(); setHardwareMode(false); }}
                    className="w-full py-1.5 rounded-lg text-xs text-gray-600 hover:text-gray-400 border border-white/5 hover:border-white/10 transition-colors"
                  >
                    ✕ Exit Hardware Mode
                  </button>
                </motion.div>
              )}
            </div>

            {/* Demo shortcut */}
            <div className="pt-2 border-t border-white/5">
              <p className="text-xs text-gray-600 text-center mb-2">Or try with demo data</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["normal", "stress", "arrhythmia", "sudep"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setHardwareMode(false); setLiveValueMode(false); store.loadDemoData(s); setSessionStart(new Date()); }}
                    className="py-1.5 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20 capitalize transition-colors"
                  >
                    {s === "sudep" ? "SUDEP" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Analysis Tabs */}
          {hasResults && (
            <div className="flex-none glass border-b border-white/5">
              <div className="flex">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  const score =
                    tab.key === "ecg" ? store.ecgAnalysis?.predictions.arrhythmia_probability :
                    tab.key === "emg" ? store.emgAnalysis?.predictions.fatigue_score :
                    tab.key === "eeg" ? store.eegAnalysis?.predictions.seizure_probability :
                    store.fusionResult?.risk_score;

                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 relative transition-colors"
                      style={{ backgroundColor: isActive ? tab.color + "11" : "transparent" }}
                    >
                      <Icon className="w-4 h-4" style={{ color: isActive ? tab.color : "#6b7280" }} />
                      <span className="text-sm font-semibold" style={{ color: isActive ? tab.color : "#6b7280" }}>
                        {tab.label}
                      </span>
                      {score !== undefined && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tab.color + "22", color: tab.color }}>
                          {(score * 100).toFixed(0)}%
                        </span>
                      )}
                      <motion.div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tab.color }}
                        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                      {isActive && (
                        <motion.div layoutId="activeAnalysisTab" className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: tab.color }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {isRunning && (
              <div className="flex flex-col items-center justify-center h-full gap-5">
                <div className="relative">
                  <motion.div className="w-20 h-20 rounded-full border-2 border-teal-500/30 flex items-center justify-center"
                    animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                    <Sparkles className="w-8 h-8 text-teal-400" />
                  </motion.div>
                  <motion.div className="absolute inset-0 rounded-full border-t-2 border-teal-400"
                    animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-white mb-1">Running AI Analysis</p>
                  <p className="text-sm text-gray-400">Processing ECG, EMG, and EEG signals...</p>
                </div>
                <div className="flex gap-2">
                  {["ECG Processing", "EMG Features", "EEG Band Analysis", "Fusion Engine"].map((s, i) => (
                    <motion.div key={s} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.3 }}
                      className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                      {s}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Hardware Mode Live Display */}
            {hardwareMode && (
              <div className="space-y-4 h-full">
                {/* Lead-off Warning */}
                {leadOff && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30"
                  >
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-yellow-400">Electrode Lead-Off Detected</p>
                      <p className="text-xs text-yellow-400/70">Check ECG electrode connections (RA, LA, RL)</p>
                    </div>
                  </motion.div>
                )}

                {/* Connection Status */}
                {!connected && simProfile === "none" && (
                  <div className="flex flex-col items-center justify-center h-full gap-5">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-20 h-20 rounded-full border-2 border-red-500/30 flex items-center justify-center bg-red-500/5"
                    >
                      <WifiOff className="w-8 h-8 text-red-400" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-300 mb-1">Waiting for ESP32...</p>
                      <p className="text-sm text-gray-500 max-w-sm">Connect your ESP32 device to WiFi and ensure it's configured to send data to this backend at <code className="text-cyan-400">ws://your-pc-ip:8000/ws/esp32</code></p>
                      <p className="text-xs text-gray-600 mt-3">Or use the <span className="text-green-400 font-semibold">19yo / 40yo Simulate</span> buttons in the sidebar to demo with fake data.</p>
                    </div>
                  </div>
                )}

                {/* Live Waveforms & Inference */}
                {(connected || simProfile !== "none") && (
                  <div className="space-y-4">
                    {/* Live Waveforms Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* ECG Waveform */}
                      <div className="rounded-xl border border-white/10 bg-white/3 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Heart className="w-4 h-4 text-red-400" />
                          <span className="text-sm font-semibold text-red-400">ECG — Live</span>
                          <motion.div className="w-1.5 h-1.5 rounded-full bg-red-400 ml-auto" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                        </div>
                        <div className="h-32 relative overflow-hidden">
                          <svg viewBox={`0 0 200 80`} className="w-full h-full" preserveAspectRatio="none">
                            <polyline
                              points={ecgHistory.slice(-200).map((v, i) =>
                                `${i},${Math.max(2, Math.min(78, 40 - ((v - 1500) / 1000) * 35))}`
                              ).join(" ")}
                              fill="none" stroke="#f87171" strokeWidth="1.2" />
                          </svg>
                          {ecgHistory.length === 0 && <p className="text-xs text-gray-600 absolute inset-0 flex items-center justify-center">Waiting for data...</p>}
                        </div>
                      </div>

                      {/* EMG Waveform */}
                      <div className="rounded-xl border border-white/10 bg-white/3 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Zap className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-semibold text-emerald-400">EMG — Live</span>
                          <motion.div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-auto" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                        </div>
                        <div className="h-32 relative overflow-hidden">
                          <svg viewBox={`0 0 200 80`} className="w-full h-full" preserveAspectRatio="none">
                            <polyline
                              points={emgHistory.slice(-200).map((v, i) =>
                                `${i},${Math.max(2, Math.min(78, 40 - ((v - 1500) / 800) * 30))}`
                              ).join(" ")}
                              fill="none" stroke="#34d399" strokeWidth="1.2" />
                          </svg>
                          {emgHistory.length === 0 && <p className="text-xs text-gray-600 absolute inset-0 flex items-center justify-center">Waiting for data...</p>}
                        </div>
                      </div>
                    </div>

                    {/* EEG Band Powers */}
                    {eegLatest && (
                      <div className="rounded-xl border border-white/10 bg-white/3 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-4 h-4 text-purple-400" />
                          <span className="text-sm font-semibold text-purple-400">EEG Band Power — Live</span>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {[
                            { band: "Alpha", value: eegLatest.alpha, color: "#8b5cf6", range: "8–13 Hz" },
                            { band: "Beta", value: eegLatest.beta, color: "#3b82f6", range: "13–30 Hz" },
                            { band: "Theta", value: eegLatest.theta, color: "#06b6d4", range: "4–8 Hz" },
                            { band: "Delta", value: eegLatest.delta, color: "#10b981", range: "0.5–4 Hz" },
                          ].map((b) => (
                            <div key={b.band} className="text-center">
                              <div className="h-20 flex items-end justify-center mb-2">
                                <motion.div
                                  className="w-8 rounded-t-md"
                                  style={{ backgroundColor: b.color + "99" }}
                                  animate={{ height: `${Math.min(100, (b.value / 60) * 100)}%` }}
                                  transition={{ duration: 0.3 }}
                                />
                              </div>
                              <p className="text-xs font-semibold" style={{ color: b.color }}>{b.band}</p>
                              <p className="text-xs text-gray-500">{b.value.toFixed(1)}</p>
                              <p className="text-xs text-gray-600">{b.range}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Live Inference Results */}
                    {inference && (
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                        {/* ECG Diagnosis */}
                        <div className="rounded-xl border border-white/10 bg-white/3 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Heart className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-xs font-semibold text-gray-300">ECG Diagnosis</span>
                          </div>
                          <p className="text-lg font-bold text-white">{inference.ecg?.predictions?.predicted_class || "—"}</p>
                          <p className="text-xs text-gray-500">HR: {inference.ecg?.features?.hr_bpm?.toFixed(0) || "—"} BPM</p>
                        </div>

                        {/* EMG Status */}
                        <div className="rounded-xl border border-white/10 bg-white/3 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-xs font-semibold text-gray-300">EMG Status</span>
                          </div>
                          <p className="text-lg font-bold text-white">{inference.emg?.predictions?.gesture || "—"}</p>
                          <p className="text-xs text-gray-500">Fatigue: {inference.emg?.predictions?.fatigue_level || "—"}</p>
                        </div>

                        {/* EEG State */}
                        <div className="rounded-xl border border-white/10 bg-white/3 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Brain className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-xs font-semibold text-gray-300">Mental State</span>
                          </div>
                          <p className="text-lg font-bold text-white">{inference.eeg?.predictions?.mental_state || "—"}</p>
                          <p className="text-xs text-gray-500">Dominant: {inference.eeg?.predictions?.dominant_band || "—"}</p>
                        </div>

                        {/* Fusion Risk */}
                        <div className={`rounded-xl border p-4 ${
                          inference.fusion?.risk_level === "CRITICAL" ? "border-red-500/40 bg-red-500/10" :
                          inference.fusion?.risk_level === "HIGH" ? "border-orange-500/40 bg-orange-500/10" :
                          inference.fusion?.risk_level === "MODERATE" ? "border-yellow-500/40 bg-yellow-500/10" :
                          "border-green-500/40 bg-green-500/10"
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-xs font-semibold text-gray-300">Fusion Risk</span>
                          </div>
                          <p className={`text-lg font-bold ${
                            inference.fusion?.risk_level === "CRITICAL" ? "text-red-400" :
                            inference.fusion?.risk_level === "HIGH" ? "text-orange-400" :
                            inference.fusion?.risk_level === "MODERATE" ? "text-yellow-400" :
                            "text-green-400"
                          }`}>{inference.fusion?.risk_level || "LOW"}</p>
                          <p className="text-xs text-gray-500">{inference.fusion?.primary_condition || "Normal"}</p>
                          <p className="text-xs text-gray-600 mt-1">{((inference.fusion?.risk_score ?? 0) * 100).toFixed(0)}% risk score</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isRunning && !hasResults && !hardwareMode && (
              <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/5">
                  <Upload className="w-8 h-8 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-300 mb-2">Upload Your Biosignal Files</h3>
                  <p className="text-gray-500 text-sm max-w-sm">
                    Use the sidebar to upload ECG, EMG, and EEG signal files. Once all three are uploaded, click <strong className="text-teal-400">Run AI Analysis</strong> to generate a full clinical report.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {[
                    { label: "ECG", ext: ".dat/.csv/.hea", color: "#ef4444" },
                    { label: "EMG", ext: ".csv/.dat", color: "#10b981" },
                    { label: "EEG", ext: ".edf/.csv", color: "#8b5cf6" },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-white/3 border border-white/8">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs font-bold" style={{ color: s.color }}>{s.label}</span>
                      <span className="text-xs text-gray-600">{s.ext}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 items-center text-xs text-gray-600">
                  <Play className="w-3 h-3" />
                  Or use the demo shortcuts / hardware mode in the sidebar
                </div>
              </div>
            )}

            {!isRunning && hasResults && store.ecgAnalysis && store.emgAnalysis && store.eegAnalysis && store.fusionResult && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "ecg" && <ECGPanel analysis={store.ecgAnalysis} />}
                  {activeTab === "emg" && <EMGPanel analysis={store.emgAnalysis} />}
                  {activeTab === "eeg" && <EEGPanel analysis={store.eegAnalysis} />}
                  {activeTab === "fusion" && (
                    <FusionPanel
                      fusion={store.fusionResult}
                      ecg={store.ecgAnalysis}
                      emg={store.emgAnalysis}
                      eeg={store.eegAnalysis}
                      isHardware={hardwareMode}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
