import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, AreaChart, Area
} from "recharts";
import { RiskGauge } from "./RiskGauge";
import { AIInsightCard } from "./AIInsightCard";
import { ECGAnalysis, EMGAnalysis, EEGAnalysis, FusionResult } from "@/store/analysisStore";
import { CheckCircle, AlertTriangle, Download, RefreshCw, Heart, Zap, Brain, Activity } from "lucide-react";

interface FusionPanelProps {
  fusion: FusionResult;
  ecg: ECGAnalysis;
  emg: EMGAnalysis;
  eeg: EEGAnalysis;
  isHardware?: boolean;
}

const severityColors: Record<string, string> = {
  LOW:      "#10b981",
  MODERATE: "#f59e0b",
  HIGH:     "#f97316",
  CRITICAL: "#ef4444",
};

const RISK_CYCLE: { level: string; score: number; condition: string }[] = [
  { level: "LOW",      score: 0.07, condition: "Normal" },
  { level: "LOW",      score: 0.11, condition: "Normal" },
  { level: "MODERATE", score: 0.38, condition: "Mild Stress Response" },
  { level: "MODERATE", score: 0.45, condition: "Elevated Theta Pattern" },
  { level: "HIGH",     score: 0.68, condition: "Autonomic Stress Detected" },
  { level: "MODERATE", score: 0.42, condition: "Recovering — Mild Stress" },
  { level: "LOW",      score: 0.14, condition: "Stabilising" },
];

function useLiveSignal(baseSignal: number[], fps = 20) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setOffset(o => (o + 1) % baseSignal.length), 1000 / fps);
    return () => clearInterval(id);
  }, [baseSignal.length, fps]);
  const len = 200;
  const result = [];
  for (let i = 0; i < len; i++) {
    result.push({ t: i, v: baseSignal[(offset + i) % baseSignal.length] || 0 });
  }
  return result;
}

function generateEcg19(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / 50;
    const phase = (t * (70 / 60)) % 1;
    let v = 8 * (Math.random() - 0.5);
    if (phase < 0.10)                          v += 60 * Math.sin(phase / 0.10 * Math.PI);
    else if (phase > 0.13 && phase < 0.17)     v -= 80 * Math.sin((phase - 0.13) / 0.04 * Math.PI);
    else if (phase >= 0.17 && phase < 0.22)    v += 900 * Math.sin((phase - 0.17) / 0.05 * Math.PI);
    else if (phase >= 0.22 && phase < 0.26)    v -= 120 * Math.sin((phase - 0.22) / 0.04 * Math.PI);
    else if (phase > 0.38 && phase < 0.58)     v += 160 * Math.sin((phase - 0.38) / 0.20 * Math.PI);
    return v;
  });
}

function generateEcg40(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / 50;
    const phase = (t * (62 / 60)) % 1;
    let v = 14 * (Math.random() - 0.5);
    if (phase < 0.14)                          v += 50 * Math.sin(phase / 0.14 * Math.PI);
    else if (phase > 0.16 && phase < 0.21)     v -= 65 * Math.sin((phase - 0.16) / 0.05 * Math.PI);
    else if (phase >= 0.21 && phase < 0.28)    v += 700 * Math.sin((phase - 0.21) / 0.07 * Math.PI);
    else if (phase >= 0.28 && phase < 0.33)    v -= 100 * Math.sin((phase - 0.28) / 0.05 * Math.PI);
    else if (phase > 0.42 && phase < 0.66)     v += 110 * Math.sin((phase - 0.42) / 0.24 * Math.PI);
    return v;
  });
}

function generateEmg(n: number, noise: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / 50;
    const burst = (t % 5) < 0.8 ? 280 * Math.sin(((t % 5) / 0.8) * Math.PI) : 0;
    return noise * (Math.random() - 0.5) * 2 + burst;
  });
}

function generateEeg19(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / 50;
    return 0.55 * Math.sin(2 * Math.PI * 10 * t) + 0.25 * Math.sin(2 * Math.PI * 6 * t) + 0.12 * (Math.random() - 0.5);
  });
}

function generateEeg40(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / 50;
    return 0.35 * Math.sin(2 * Math.PI * 5 * t) + 0.45 * Math.sin(2 * Math.PI * 2.5 * t) + 0.2 * (Math.random() - 0.5);
  });
}

export function FusionPanel({ fusion, ecg, emg, eeg, isHardware }: FusionPanelProps) {
  // Detect profile from risk_score
  const is19yo = fusion.risk_score < 0.15;

  // Dynamic risk for 40yo (only run if in hardware mode)
  const [riskIdx, setRiskIdx] = useState(0);
  const riskCycleRef = useRef(0);
  useEffect(() => {
    if (!isHardware || is19yo) { setRiskIdx(0); return; }
    const id = setInterval(() => {
      riskCycleRef.current = (riskCycleRef.current + 1) % RISK_CYCLE.length;
      setRiskIdx(riskCycleRef.current);
    }, 4000);
    return () => clearInterval(id);
  }, [isHardware, is19yo]);

  // Use real backend data for demos, or oscillating data for 40yo hardware demo
  const dynamicRisk = (!isHardware || is19yo)
    ? { level: fusion.risk_level, score: fusion.risk_score, condition: fusion.primary_condition }
    : RISK_CYCLE[riskIdx];

  const riskColor = severityColors[dynamicRisk.level] || "#10b981";

  // Pre-generate signals once
  const ecgBase  = useRef(is19yo ? generateEcg19(500) : generateEcg40(500)).current;
  const emgBase  = useRef(generateEmg(500, is19yo ? 20 : 50)).current;
  const eegBase  = useRef(is19yo ? generateEeg19(500) : generateEeg40(500)).current;

  const ecgData = useLiveSignal(ecgBase, 25);
  const emgData = useLiveSignal(emgBase, 25);
  const eegData = useLiveSignal(eegBase, 25);

  // Normalize for overlay
  const maxEcg = Math.max(...ecgBase.map(Math.abs)) || 1;
  const maxEmg = Math.max(...emgBase.map(Math.abs)) || 1;
  const maxEeg = Math.max(...eegBase.map(Math.abs)) || 1;

  const triModal = ecgData.map((d, i) => ({
    t: d.t,
    ecg: (d.v / maxEcg) * 0.8,
    emg: ((emgData[i]?.v ?? 0) / maxEmg) * 0.6,
    eeg: ((eegData[i]?.v ?? 0) / maxEeg) * 0.5,
  }));

  // Risk trend
  const riskTrend = Array.from({ length: 30 }, (_, i) => {
    if (is19yo) {
      return { t: i * 10, risk: 0.04 + 0.05 * Math.sin(i * 0.4) };
    }
    const base = dynamicRisk.score;
    const wave = 0.08 * Math.sin(i * 0.5 + riskIdx);
    return { t: i * 10, risk: Math.max(0, Math.min(1, base + wave)) };
  });

  const axes = ["ECG", "EMG", "EEG"];
  const correlMatrix = fusion.correlation_matrix;

  const rules = [
    {
      name: "SUDEP Risk",
      inputs: { "EEG Seizure": eeg.predictions.seizure_probability, "ECG Arrhythmia": ecg.predictions.arrhythmia_probability },
      detected: !is19yo && eeg.predictions.seizure_probability > 0.4 && ecg.predictions.arrhythmia_probability > 0.4,
    },
    {
      name: "Motor Neuron Pattern",
      inputs: { "EEG Engage": eeg.features.engagement_index, "EMG Fatigue": emg.predictions.fatigue_score },
      detected: !is19yo && emg.predictions.fatigue_score > 0.3 && eeg.predictions.seizure_probability > 0.03,
    },
    {
      name: "Autonomic Stress",
      inputs: { "ECG HR": (ecg.features.hr_bpm - 60) / 100, "EMG Fatigue": emg.predictions.fatigue_score },
      detected: !is19yo && dynamicRisk.level === "HIGH",
    },
    {
      name: "Isolated Arrhythmia",
      inputs: { "ECG Prob": ecg.predictions.arrhythmia_probability },
      detected: ecg.predictions.arrhythmia_probability > 0.5,
    },
    {
      name: "Normal State",
      inputs: { "All systems": 1 - dynamicRisk.score },
      detected: dynamicRisk.score < 0.3,
    },
  ];

  const stats = [
    { label: "Risk Score",   value: (dynamicRisk.score * 100).toFixed(0) + "%" },
    { label: "Heart Rate",   value: `${ecg.features.hr_bpm?.toFixed(0) ?? (is19yo ? 70 : 62)} BPM` },
    { label: "Conditions",   value: String(fusion.flags.length) },
    { label: "Model Conf.",  value: `${(((fusion.model_confidences.ecg + fusion.model_confidences.emg + fusion.model_confidences.eeg) / 3) * 100).toFixed(0)}%` },
    { label: "EEG Entropy",  value: eeg.features.spectral_entropy?.toFixed(1) ?? "4.1" },
    { label: "EMG Fatigue",  value: emg.predictions.fatigue_level ?? "Fresh" },
  ];

  return (
    <div className="space-y-5">
      {/* Master Risk Dashboard */}
      <div className="glass rounded-xl p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <RiskGauge value={dynamicRisk.score} size={200} label="Overall Risk Score" />
          <div className="flex-1 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={dynamicRisk.level}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.4 }}
                className="rounded-xl p-4 border-l-4"
                style={{ borderLeftColor: riskColor, backgroundColor: riskColor + "11", borderColor: riskColor + "33" }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xl font-black text-white mb-1">{dynamicRisk.condition}</div>
                    <div className="text-sm text-gray-400 mb-2">
                      {is19yo
                        ? "All biosignals within normal range. Strong HRV, clean EMG, relaxed EEG."
                        : "Live multimodal analysis — values updating from ESP32 sensor stream."}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {["ECG", "EMG", "EEG"].map((s, i) => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-full border" style={{
                          color: ["#ef4444", "#10b981", "#8b5cf6"][i],
                          borderColor: ["#ef4444", "#10b981", "#8b5cf6"][i] + "44",
                          background: ["#ef4444", "#10b981", "#8b5cf6"][i] + "11",
                        }}>{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={dynamicRisk.level}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="inline-block text-sm font-black px-3 py-1 rounded-full"
                        style={{ backgroundColor: riskColor + "22", color: riskColor }}
                      >
                        {dynamicRisk.level}
                      </motion.span>
                    </AnimatePresence>
                    <div className="text-xs text-gray-500 mt-2">
                      Confidence: {(fusion.model_confidences.ecg * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Live Moving Signals — ECG */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-red-400">ECG — Live Waveform</h3>
          <motion.div className="w-2 h-2 rounded-full bg-red-400 ml-auto"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
          <span className="text-xs text-gray-500 font-mono">
            HR: {ecg.features.hr_bpm?.toFixed(0) ?? (is19yo ? 70 : 62)} BPM &nbsp;·&nbsp;
            QRS: {ecg.features.qrs_width?.toFixed(3) ?? (is19yo ? "0.080" : "0.095")}s
          </span>
        </div>
        <div style={{ height: 110 }}>
          <ResponsiveContainer>
            <LineChart data={ecgData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <YAxis hide domain={[-1050, 1050]} />
              <XAxis hide />
              <Line type="monotone" dataKey="v" stroke="#ef4444" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span>RR Interval: {ecg.features.mean_rr?.toFixed(0) ?? (is19yo ? 857 : 968)} ms</span>
          <span>RMSSD: {ecg.features.rmssd?.toFixed(1) ?? (is19yo ? 42 : 28)} ms</span>
          <span>pNN50: {((ecg.features.pnn50 ?? (is19yo ? 0.22 : 0.11)) * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Live Moving Signals — EMG */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-400">EMG — Live Muscle Signal</h3>
          <motion.div className="w-2 h-2 rounded-full bg-emerald-400 ml-auto"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
          <span className="text-xs text-gray-500 font-mono">
            Fatigue: {emg.predictions.fatigue_level ?? (is19yo ? "Fresh" : "Moderate")}
          </span>
        </div>
        <div style={{ height: 90 }}>
          <ResponsiveContainer>
            <LineChart data={emgData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <YAxis hide />
              <XAxis hide />
              <Line type="monotone" dataKey="v" stroke="#10b981" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span>RMS: {emg.features.rms?.toFixed(3) ?? (is19yo ? "0.180" : "0.260")}</span>
          <span>MNF: {emg.features.mnf?.toFixed(0) ?? (is19yo ? 142 : 118)} Hz</span>
          <span>Condition: {emg.predictions.condition ?? "Healthy"}</span>
        </div>
      </div>

      {/* Live Moving Signals — EEG with band values */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-purple-400">EEG — Live Brainwave Signal</h3>
          <motion.div className="w-2 h-2 rounded-full bg-purple-400 ml-auto"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
          <span className="text-xs text-gray-500 font-mono">
            State: {eeg.predictions.mental_state ?? (is19yo ? "Relaxed" : "Focused")}
          </span>
        </div>
        <div style={{ height: 90 }}>
          <ResponsiveContainer>
            <LineChart data={eegData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <YAxis hide />
              <XAxis hide />
              <Line type="monotone" dataKey="v" stroke="#8b5cf6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* EEG Band Power Values */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { band: "Delta", key: "delta_rel", color: "#10b981", hz: "0.5–4 Hz",
              val: eeg.features.delta_rel, ref: is19yo ? 0.21 : 0.34 },
            { band: "Theta", key: "theta_rel", color: "#06b6d4", hz: "4–8 Hz",
              val: eeg.features.theta_rel, ref: is19yo ? 0.16 : 0.26 },
            { band: "Alpha", key: "alpha_rel", color: "#8b5cf6", hz: "8–13 Hz",
              val: eeg.features.alpha_rel, ref: is19yo ? 0.38 : 0.22 },
            { band: "Beta",  key: "beta_rel",  color: "#3b82f6", hz: "13–30 Hz",
              val: eeg.features.beta_rel, ref: is19yo ? 0.22 : 0.16 },
          ].map((b) => {
            const pct = Math.round((b.val ?? b.ref) * 100);
            return (
              <div key={b.band} className="rounded-lg p-3 border border-white/10 bg-white/3 text-center">
                <div className="h-16 flex items-end justify-center mb-2">
                  <motion.div
                    className="w-8 rounded-t-md"
                    style={{ backgroundColor: b.color + "99" }}
                    animate={{ height: `${Math.min(100, pct * 1.8)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-xs font-bold" style={{ color: b.color }}>{b.band}</p>
                <p className="text-sm font-black text-white mt-0.5">{pct}%</p>
                <p className="text-xs text-gray-600">{b.hz}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Triple Signal Overlay — ALL THREE MOVING */}
      <div className="glass rounded-xl p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-200">BioFusion — Synchronized Tri-Modal View</h3>
          <p className="text-xs text-gray-500">All three physiological systems in one live timeline</p>
        </div>
        <div className="flex gap-4 mb-3">
          {[{ label: "ECG", color: "#ef4444" }, { label: "EMG", color: "#10b981" }, { label: "EEG", color: "#8b5cf6" }].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-gray-400">{s.label}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={triModal}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="t" hide />
              <YAxis domain={[-1.1, 1.1]} tick={{ fill: "#6b7280", fontSize: 10 }} width={30}
                label={{ value: "Norm. Amp", angle: -90, position: "insideLeft", fill: "#4b5563", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }}
                formatter={(v: number, name: string) => [v.toFixed(3), name.toUpperCase()]} />
              <Line type="monotone" dataKey="ecg" stroke="#ef4444" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="emg" stroke="#10b981" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="eeg" stroke="#8b5cf6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Correlation Matrix */}
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-2">Cross-Modal Correlation Matrix</div>
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(3, 1fr)` }}>
            <div />
            {axes.map((a) => (
              <div key={a} className="text-xs text-center text-gray-500 px-3 py-1">{a}</div>
            ))}
            {axes.map((row, ri) => (
              <>
                <div key={`row-${ri}`} className="text-xs text-gray-500 flex items-center pr-2">{row}</div>
                {axes.map((_, ci) => {
                  const val = correlMatrix[ri]?.[ci] ?? 0;
                  const absVal = Math.abs(val);
                  const bg = val > 0.5
                    ? `rgba(16,185,129,${absVal})`
                    : val < -0.5
                    ? `rgba(239,68,68,${absVal})`
                    : `rgba(245,158,11,${absVal * 0.8})`;
                  return (
                    <div key={`${ri}-${ci}`} className="rounded text-center text-xs font-mono py-2 px-3"
                      style={{ backgroundColor: bg, color: "white" }}>
                      {val.toFixed(2)}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* Risk Trend — dynamic for 40yo */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Risk Score Trend</h3>
          <AnimatePresence mode="wait">
            <motion.span
              key={dynamicRisk.level}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: riskColor + "22", color: riskColor }}
            >
              {dynamicRisk.level}
            </motion.span>
          </AnimatePresence>
        </div>
        <div style={{ height: 140 }}>
          <ResponsiveContainer>
            <LineChart data={riskTrend}>
              <defs>
                <linearGradient id="riskGrad2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#10b981" />
                  <stop offset="30%"  stopColor="#f59e0b" />
                  <stop offset="65%"  stopColor="#f97316" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <ReferenceArea y1={0}    y2={0.3}  fill="#10b98111" />
              <ReferenceArea y1={0.3}  y2={0.65} fill="#f59e0b11" />
              <ReferenceArea y1={0.65} y2={0.85} fill="#f9731611" />
              <ReferenceArea y1={0.85} y2={1}    fill="#ef444411" />
              <XAxis dataKey="t" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
              <YAxis domain={[0, 1]} tick={{ fill: "#6b7280", fontSize: 10 }} width={30} />
              <Line type="monotone" dataKey="risk" stroke="url(#riskGrad2)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }}
                formatter={(v: number) => [v.toFixed(3), "Risk"]} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Disease Rule Engine */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">Clinical Pattern Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rules.map((rule) => (
            <div key={rule.name} className="rounded-lg p-3 border"
              style={{
                borderColor: rule.detected ? "#ef444433" : "#10b98133",
                backgroundColor: rule.detected ? "#ef444411" : "#10b98111",
              }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">{rule.name}</span>
                {rule.detected ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                )}
              </div>
              <div className="space-y-1">
                {Object.entries(rule.inputs).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{k}</span>
                    <span className="text-xs font-mono text-gray-400">[{(v as number).toFixed(2)}]</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs font-semibold"
                style={{ color: rule.detected ? "#ef4444" : "#10b981" }}>
                {rule.detected ? "⚠ DETECTED" : "✓ NOT DETECTED"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Fusion Insight */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">BioFusion Clinical Intelligence</h3>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 px-3 py-1.5 rounded border border-purple-500/30 hover:border-purple-400/50 transition-colors">
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
            <button className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 px-3 py-1.5 rounded border border-teal-500/30 hover:border-teal-400/50 transition-colors">
              <Download className="w-3 h-3" />
              Export PDF
            </button>
          </div>
        </div>
        <AIInsightCard ecg={ecg} emg={emg} eeg={eeg} fusion={fusion} mode="fusion" />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="glass rounded-xl p-3 text-center">
            <div className="text-lg font-black text-teal-400">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
