import { create } from "zustand";

export type SessionMode = "upload" | "hardware" | "demo";
export type DemoScenario = "normal" | "stress" | "arrhythmia" | "sudep";
export type ActiveTab = "ecg" | "emg" | "eeg" | "fusion";

export interface ECGFeatures {
  hr_bpm: number;
  mean_rr: number;
  std_rr: number;
  rmssd: number;
  pnn50: number;
  qrs_width: number;
}

export interface ECGPredictions {
  arrhythmia_probability: number;
  predicted_class: string;
  class_probabilities: Record<string, number>;
}

export interface ECGAnalysis {
  filtered_signal: number[];
  r_peaks: number[];
  features: ECGFeatures;
  predictions: ECGPredictions;
  rr_intervals: number[];
  hrv_spectrum: {
    frequencies: number[];
    power: number[];
    lf_power: number;
    hf_power: number;
    lf_hf_ratio: number;
  };
  poincare: {
    rr_n: number[];
    rr_n1: number[];
    sd1: number;
    sd2: number;
  };
  signal_quality?: number;
}

export interface EMGFeatures {
  rms: number;
  mav: number;
  zcr: number;
  wl: number;
  mnf: number;
  mdf: number;
}

export interface EMGPredictions {
  gesture: string;
  gesture_confidence: number;
  all_gesture_probs: Record<string, number>;
  condition: string;
  condition_probabilities: Record<string, number>;
  fatigue_score: number;
  fatigue_level: string;
}

export interface EMGAnalysis {
  filtered_signal: number[];
  envelope: number[];
  features: EMGFeatures;
  predictions: EMGPredictions;
  psd: {
    frequencies: number[];
    power: number[];
    mean_frequency_over_time: number[];
  };
}

export interface EEGFeatures {
  delta_rel: number;
  theta_rel: number;
  alpha_rel: number;
  beta_rel: number;
  gamma_rel: number;
  alpha_beta_ratio: number;
  spectral_entropy: number;
  engagement_index: number;
}

export interface EEGPredictions {
  mental_state: string;
  seizure_probability: number;
  dominant_band: string;
}

export interface EEGAnalysis {
  filtered_signal: number[];
  features: EEGFeatures;
  predictions: EEGPredictions;
  band_spectrum: {
    frequencies: number[];
    total_power: number[];
    delta_power: number[];
    theta_power: number[];
    alpha_power: number[];
    beta_power: number[];
    gamma_power: number[];
  };
}

export interface FusionResult {
  risk_score: number;
  risk_level: string;
  primary_condition: string;
  severity: string;
  reason: string;
  flags: string[];
  correlation_matrix: number[][];
  risk_trend: string;
  model_confidences: {
    ecg: number;
    emg: number;
    eeg: number;
  };
}

interface AnalysisState {
  sessionMode: SessionMode;
  demoScenario: DemoScenario;
  activeTab: ActiveTab;
  isAnalyzing: boolean;
  sessionStartTime: Date | null;
  uploadedFileName: string | null;

  ecgAnalysis: ECGAnalysis | null;
  emgAnalysis: EMGAnalysis | null;
  eegAnalysis: EEGAnalysis | null;
  fusionResult: FusionResult | null;

  setSessionMode: (mode: SessionMode) => void;
  setDemoScenario: (scenario: DemoScenario) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setIsAnalyzing: (v: boolean) => void;
  setUploadedFileName: (name: string | null) => void;
  setEcgAnalysis: (analysis: ECGAnalysis | null) => void;
  setEmgAnalysis: (analysis: EMGAnalysis | null) => void;
  setEegAnalysis: (analysis: EEGAnalysis | null) => void;
  setFusionResult: (result: FusionResult | null) => void;
  startSession: (mode: SessionMode) => void;
  loadDemoData: (scenario: DemoScenario) => Promise<void>;
  analyzeUploadedFiles: (files: File[]) => Promise<void>;
  resetAnalysis: () => void;
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || "";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function postFiles<T>(path: string, files: File[]): Promise<T> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

function mapEmgAnalysis(raw: any): EMGAnalysis {
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

function mapEegAnalysis(raw: any): EEGAnalysis {
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

function mapFusion(raw: any): FusionResult {
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

function classifyFiles(files: File[]) {
  const ecg: File[] = [];
  const emg: File[] = [];
  const eeg: File[] = [];
  const unknownCsv: File[] = [];

  files.forEach((file) => {
    const name = file.name.toLowerCase();
    const ext = name.split(".").pop() ?? "";

    if (ext === "edf") {
      eeg.push(file);
      return;
    }

    if (ext === "dat" || ext === "hea" || ext === "atr") {
      ecg.push(file);
      return;
    }

    if (ext === "csv") {
      if (name.includes("emg") || name.includes("healthy") || name.includes("myopathy") || name.includes("neuropathy")) {
        emg.push(file);
      } else if (name.includes("eeg")) {
        eeg.push(file);
      } else if (name.includes("ecg") || name.includes("mitdb") || name.includes("arrhythmia")) {
        ecg.push(file);
      } else {
        unknownCsv.push(file);
      }
    }
  });

  // Fill missing channels from unknown CSVs in deterministic order.
  for (const file of unknownCsv) {
    if (ecg.length === 0) {
      ecg.push(file);
    } else if (emg.length === 0) {
      emg.push(file);
    } else if (eeg.length === 0) {
      eeg.push(file);
    }
  }

  return { ecg, emg, eeg };
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  sessionMode: "demo",
  demoScenario: "normal",
  activeTab: "ecg",
  isAnalyzing: false,
  sessionStartTime: null,
  uploadedFileName: null,
  ecgAnalysis: null,
  emgAnalysis: null,
  eegAnalysis: null,
  fusionResult: null,

  setSessionMode: (mode) => set({ sessionMode: mode }),
  setDemoScenario: (scenario) => set({ demoScenario: scenario }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setUploadedFileName: (name) => set({ uploadedFileName: name }),
  setEcgAnalysis: (analysis) => set({ ecgAnalysis: analysis }),
  setEmgAnalysis: (analysis) => set({ emgAnalysis: analysis }),
  setEegAnalysis: (analysis) => set({ eegAnalysis: analysis }),
  setFusionResult: (result) => set({ fusionResult: result }),

  startSession: (mode) => {
    set({
      sessionMode: mode,
      sessionStartTime: new Date(),
      isAnalyzing: mode === "demo",
    });
    if (mode === "demo") {
      void get().loadDemoData(get().demoScenario);
    }
  },

  loadDemoData: async (scenario) => {
    set({ isAnalyzing: true, demoScenario: scenario, sessionMode: "demo" });
    try {
      const demo = await postJson<any>(`/api/analysis/demo?scenario=${encodeURIComponent(scenario)}`, {});
      const ecg: ECGAnalysis = {
        ...demo.ecg,
        signal_quality: demo.ecg?.signal_quality,
      };
      const emg: EMGAnalysis = mapEmgAnalysis(demo.emg);
      const eeg: EEGAnalysis = mapEegAnalysis(demo.eeg);
      const fusion: FusionResult = mapFusion(demo.fusion);

      set({
        ecgAnalysis: ecg,
        emgAnalysis: emg,
        eegAnalysis: eeg,
        fusionResult: fusion,
        isAnalyzing: false,
        sessionStartTime: new Date(),
      });
    } catch (error) {
      console.error("Failed to load demo analysis", error);
      set({ isAnalyzing: false });
      throw error;
    }
  },

  analyzeUploadedFiles: async (files) => {
    set({ isAnalyzing: true, sessionMode: "upload", sessionStartTime: new Date() });

    try {
      const grouped = classifyFiles(files);
      if (grouped.ecg.length === 0 || grouped.emg.length === 0 || grouped.eeg.length === 0) {
        throw new Error("Please upload ECG, EMG, and EEG files together.");
      }

      const [ecgUpload, emgUpload, eegUpload] = await Promise.all([
        postFiles<any>("/api/upload/ecg", grouped.ecg),
        postFiles<any>("/api/upload/emg", grouped.emg),
        postFiles<any>("/api/upload/eeg", grouped.eeg),
      ]);

      const [ecgRaw, emgRaw, eegRaw] = await Promise.all([
        postJson<any>("/api/analysis/ecg", {
          signal: ecgUpload.signal,
          sample_rate: ecgUpload.sample_rate,
          source_file: ecgUpload.filename,
        }),
        postJson<any>("/api/analysis/emg", {
          signal: emgUpload.signal,
          sample_rate: emgUpload.sample_rate,
          source_file: emgUpload.filename,
        }),
        postJson<any>("/api/analysis/eeg", {
          signal: eegUpload.signal,
          sample_rate: eegUpload.sample_rate,
          source_file: eegUpload.filename,
        }),
      ]);

      const emg = mapEmgAnalysis(emgRaw);
      const ecg: ECGAnalysis = { ...ecgRaw, signal_quality: ecgRaw?.signal_quality };
      const eeg: EEGAnalysis = mapEegAnalysis(eegRaw);

      const fusionRaw = await postJson<any>("/api/analysis/fusion", {
        ecg,
        emg,
        eeg,
      });

      const fusion = mapFusion(fusionRaw);

      set({
        uploadedFileName: files.map((f) => f.name).join(", "),
        ecgAnalysis: ecg,
        emgAnalysis: emg,
        eegAnalysis: eeg,
        fusionResult: fusion,
        isAnalyzing: false,
      });
    } catch (error) {
      console.error("Upload analysis failed", error);
      set({ isAnalyzing: false });
      throw error;
    }
  },

  resetAnalysis: () => {
    set({
      uploadedFileName: null,
      ecgAnalysis: null,
      emgAnalysis: null,
      eegAnalysis: null,
      fusionResult: null,
      isAnalyzing: false,
      activeTab: "ecg",
      sessionStartTime: null,
    });
  },
}));
