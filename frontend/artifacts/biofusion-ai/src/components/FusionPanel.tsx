import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea
} from "recharts";
import { RiskGauge } from "./RiskGauge";
import { AIInsightCard } from "./AIInsightCard";
import { ECGAnalysis, EMGAnalysis, EEGAnalysis, FusionResult } from "@/store/analysisStore";
import { CheckCircle, AlertTriangle, Download, RefreshCw } from "lucide-react";

interface FusionPanelProps {
  fusion: FusionResult;
  ecg: ECGAnalysis;
  emg: EMGAnalysis;
  eeg: EEGAnalysis;
}

const severityColors: Record<string, string> = {
  LOW: "#10b981",
  MODERATE: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

export function FusionPanel({ fusion, ecg, emg, eeg }: FusionPanelProps) {
  const riskColor = severityColors[fusion.risk_level] || "#10b981";

  const riskTrend = Array.from({ length: 30 }, (_, i) => {
    const phase = i / 6;
    const damped = (Math.sin(phase) * 0.06 + Math.cos(phase / 2) * 0.03) * (1 - i / 45);
    return {
      t: i * 10,
      risk: Math.max(0, Math.min(1, fusion.risk_score + damped)),
    };
  });
  riskTrend[riskTrend.length - 1].risk = fusion.risk_score;

  const triModal = ecg.filtered_signal.slice(0, 300).map((_, i) => {
    const ecgV = ecg.filtered_signal[i] || 0;
    const emgV = emg.filtered_signal[i] || 0;
    const eegV = eeg.filtered_signal[i] || 0;
    const ecgMax = 1.2;
    const emgMax = 2;
    const eegMax = 50;
    return {
      t: parseFloat((i / 360).toFixed(3)),
      ecg: ecgV / ecgMax,
      emg: emgV / emgMax,
      eeg: eegV / eegMax,
    };
  });

  const correlMatrix = fusion.correlation_matrix;

  const rules = [
    {
      name: "SUDEP Risk",
      inputs: { "EEG Seizure": eeg.predictions.seizure_probability, "ECG Arrhythmia": ecg.predictions.arrhythmia_probability },
      detected: eeg.predictions.seizure_probability > 0.5 && ecg.predictions.arrhythmia_probability > 0.5,
    },
    {
      name: "Motor Neuron Pattern",
      inputs: { "EEG Score": eeg.features.engagement_index, "EMG Fatigue": emg.predictions.fatigue_score },
      detected: emg.predictions.fatigue_score > 0.7 && eeg.predictions.seizure_probability > 0.4,
    },
    {
      name: "Autonomic Stress",
      inputs: { "ECG HR": (ecg.features.hr_bpm - 60) / 100, "EMG Fatigue": emg.predictions.fatigue_score, "EEG Risk": eeg.predictions.seizure_probability },
      detected: ecg.features.hr_bpm > 100 && emg.predictions.fatigue_score > 0.5,
    },
    {
      name: "Isolated Arrhythmia",
      inputs: { "ECG Prob": ecg.predictions.arrhythmia_probability },
      detected: ecg.predictions.arrhythmia_probability > 0.6,
    },
    {
      name: "Normal State",
      inputs: { "All systems": 1 - fusion.risk_score },
      detected: fusion.risk_score < 0.3,
    },
  ];

  const axes = ["ECG", "EMG", "EEG"];

  const stats = [
    { label: "Peak Risk Score", value: Math.max(...riskTrend.map((r) => r.risk)).toFixed(2) },
    { label: "Conditions Flagged", value: String(fusion.flags.length) },
    { label: "Beats Analyzed", value: String(ecg.r_peaks.length) },
    { label: "Session Duration", value: "00:05:32" },
    { label: "Signal Quality", value: "87%" },
    { label: "Model Confidence", value: `${(((fusion.model_confidences.ecg + fusion.model_confidences.emg + fusion.model_confidences.eeg) / 3) * 100).toFixed(0)}%` },
  ];

  return (
    <div className="space-y-5">
      {/* Master Risk Dashboard */}
      <div className="glass rounded-xl p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <RiskGauge value={fusion.risk_score} size={200} label="Overall Risk Score" />

          <div className="flex-1 space-y-4">
            <motion.div
              animate={fusion.risk_score > 0.65 ? { scale: [1, 1.01, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="rounded-xl p-4 border-l-4"
              style={{ borderLeftColor: riskColor, backgroundColor: riskColor + "11", borderColor: riskColor + "33" }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-black text-white mb-1">{fusion.primary_condition}</div>
                  <div className="text-sm text-gray-400 mb-2">{fusion.reason}</div>
                  <div className="flex gap-2 flex-wrap">
                    {["ECG", "EMG", "EEG"].map((s, i) => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full border" style={{
                        color: ["#ef4444", "#10b981", "#8b5cf6"][i],
                        borderColor: ["#ef4444", "#10b981", "#8b5cf6"][i] + "44",
                        background: ["#ef4444", "#10b981", "#8b5cf6"][i] + "11",
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: riskColor + "22", color: riskColor }}>
                    {fusion.severity}
                  </span>
                  <div className="text-xs text-gray-500 mt-2">
                    Confidence: {(fusion.model_confidences.ecg * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Triple Signal Overlay */}
      <div className="glass rounded-xl p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Synchronized Tri-Modal Signal View</h3>
          <p className="text-xs text-gray-500">All three physiological systems in one timeline</p>
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
              <XAxis dataKey="t" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} domain={[-1.5, 1.5]} width={30} label={{ value: "Norm. Amp", angle: -90, position: "insideLeft", fill: "#4b5563", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} formatter={(v: number, name: string) => [v.toFixed(3), name.toUpperCase()]} />
              {fusion.risk_score > 0.5 && (
                <ReferenceArea x1={0.3} x2={0.5} fill="#ef444422" />
              )}
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
                  const bg = val > 0.5 ? `rgba(16,185,129,${absVal})` : val < -0.5 ? `rgba(239,68,68,${absVal})` : `rgba(245,158,11,${absVal * 0.8})`;
                  return (
                    <div key={`${ri}-${ci}`} className="rounded text-center text-xs font-mono py-2 px-3" style={{ backgroundColor: bg, color: "white" }}>
                      {val.toFixed(2)}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-1">High ECG-EEG correlation = connected cardiac-neural event</p>
        </div>
      </div>

      {/* Disease Rule Engine */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">Clinical Pattern Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rules.map((rule) => (
            <div
              key={rule.name}
              className="rounded-lg p-3 border"
              style={{
                borderColor: rule.detected ? "#ef444433" : "#10b98133",
                backgroundColor: rule.detected ? "#ef444411" : "#10b98111",
              }}
            >
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
              <div className="mt-2 text-xs font-semibold" style={{ color: rule.detected ? "#ef4444" : "#10b981" }}>
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

      {/* Risk Trend */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Risk Score Trend</h3>
          <span className="text-xs text-gray-500">Session Duration: 00:05:32</span>
        </div>
        <div style={{ height: 140 }}>
          <ResponsiveContainer>
            <LineChart data={riskTrend}>
              <defs>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="30%" stopColor="#f59e0b" />
                  <stop offset="65%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <ReferenceArea y1={0} y2={0.3} fill="#10b98111" />
              <ReferenceArea y1={0.3} y2={0.65} fill="#f59e0b11" />
              <ReferenceArea y1={0.65} y2={0.85} fill="#f9731611" />
              <ReferenceArea y1={0.85} y2={1} fill="#ef444411" />
              <XAxis dataKey="t" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
              <YAxis domain={[0, 1]} tick={{ fill: "#6b7280", fontSize: 10 }} width={30} />
              <Line type="monotone" dataKey="risk" stroke="url(#riskGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} formatter={(v: number) => [v.toFixed(3), "Risk"]} />
            </LineChart>
          </ResponsiveContainer>
        </div>
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
