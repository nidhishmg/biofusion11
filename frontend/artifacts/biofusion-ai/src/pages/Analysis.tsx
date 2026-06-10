import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Heart, Zap, Brain, Activity, Download, Upload,
  CheckCircle, AlertCircle, Loader2, FileText, ChevronRight,
  Sparkles, Clock, Play
} from "lucide-react";
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
            <span className="text-xs font-bold px-3 py-1 rounded-full border border-teal-500/40 text-teal-400 bg-teal-500/10">
              FILE UPLOAD
            </span>
            {hasResults && <SessionTimer startTime={sessionStart} />}
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

            {/* Demo shortcut */}
            <div className="pt-2 border-t border-white/5">
              <p className="text-xs text-gray-600 text-center mb-2">Or try with demo data</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["normal", "stress", "arrhythmia", "sudep"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { store.loadDemoData(s); setSessionStart(new Date()); }}
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

            {!isRunning && !hasResults && (
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
                  Or use the demo shortcuts in the sidebar
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
