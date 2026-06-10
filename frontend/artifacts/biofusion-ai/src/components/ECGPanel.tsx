import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, ScatterChart, Scatter, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { WaveformChart } from "./WaveformChart";
import { AIInsightCard } from "./AIInsightCard";
import { ECGAnalysis } from "@/store/analysisStore";
import { Heart } from "lucide-react";

interface ECGPanelProps {
  analysis: ECGAnalysis;
}

export function ECGPanel({ analysis }: ECGPanelProps) {
  const [timeRange] = useState<"5s" | "10s" | "30s" | "full">("10s");

  const { features, predictions, rr_intervals, hrv_spectrum, poincare } = analysis;

  const rrData = rr_intervals.slice(0, 30).map((rr, i) => ({ beat: i + 1, rr }));
  const hrvData = hrv_spectrum.frequencies.slice(0, 80).map((f, i) => ({
    f: parseFloat(f.toFixed(3)),
    power: hrv_spectrum.power[i] || 0,
    zone: f >= 0.04 && f < 0.15 ? "LF" : f >= 0.15 && f <= 0.4 ? "HF" : "other",
  }));
  const poinData = poincare.rr_n.slice(0, 30).map((n, i) => ({ rr_n: n, rr_n1: poincare.rr_n1[i] || n }));

  const classProbData = Object.entries(predictions.class_probabilities).map(([cls, prob]) => ({
    name: cls,
    prob: parseFloat((prob * 100).toFixed(1)),
    color: cls === "Normal" ? "#10b981" : cls === "PVC" ? "#f59e0b" : cls === "Atrial" ? "#f97316" : "#ef4444",
  }));

  const rawQuality = typeof analysis.signal_quality === "number" ? analysis.signal_quality : 0.85;
  const qualityScore = Math.round(Math.max(0, Math.min(100, rawQuality <= 1 ? rawQuality * 100 : rawQuality)));
  const hrColor = features.hr_bpm < 60 ? "#3b82f6" : features.hr_bpm > 100 ? "#ef4444" : "#10b981";

  const sampleLen = timeRange === "5s" ? 1800 : timeRange === "10s" ? 3600 : timeRange === "30s" ? 10800 : undefined;
  const displaySignal = sampleLen ? analysis.filtered_signal.slice(0, sampleLen) : analysis.filtered_signal;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* LEFT: Waveforms */}
      <div className="lg:col-span-3 space-y-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-300">ECG Waveform</span>
            <div className="flex gap-1.5">
              {(["5s", "10s", "30s", "full"] as const).map((r) => (
                <button key={r} className={`text-xs px-2 py-0.5 rounded ${timeRange === r ? "bg-red-500/30 text-red-400" : "text-gray-500 hover:text-gray-300"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <WaveformChart signal={displaySignal} color="#ef4444" label="ECG" peaks={analysis.r_peaks} height={200} maxPoints={600} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* RR Tachogram */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">RR Interval Tachogram</p>
            <div style={{ height: 100 }}>
              <ResponsiveContainer>
                <BarChart data={rrData} barSize={6}>
                  <Bar dataKey="rr" fill="#ef4444" opacity={0.8} radius={[2, 2, 0, 0]} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={28} />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} formatter={(v: number) => [`${v}ms`, "RR"]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* HRV Power Spectrum */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">HRV Power Spectrum</p>
            <div style={{ height: 100 }}>
              <ResponsiveContainer>
                <LineChart data={hrvData}>
                  <Line type="monotone" dataKey="power" stroke="#ef4444" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <XAxis dataKey="f" tick={{ fill: "#6b7280", fontSize: 9 }} tickFormatter={(v) => `${v}`} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={28} />
                  <ReferenceLine x={0.04} stroke="#f59e0b" strokeDasharray="3 3" />
                  <ReferenceLine x={0.15} stroke="#10b981" strokeDasharray="3 3" />
                  <ReferenceLine x={0.4} stroke="#10b981" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Poincaré */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">Poincaré Plot</p>
            <div style={{ height: 100 }}>
              <ResponsiveContainer>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" dataKey="rr_n" tick={{ fill: "#6b7280", fontSize: 9 }} name="RR[n]" domain={["auto", "auto"]} />
                  <YAxis type="number" dataKey="rr_n1" tick={{ fill: "#6b7280", fontSize: 9 }} name="RR[n+1]" width={28} domain={["auto", "auto"]} />
                  <Scatter data={poinData} fill="#ef4444" opacity={0.7} />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              <span>SD1: {poincare.sd1.toFixed(1)}</span>
              <span>SD2: {poincare.sd2.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Analysis */}
      <div className="lg:col-span-2 space-y-4">
        {/* Vital Metrics */}
        <div className="glass rounded-xl p-4 grid grid-cols-2 gap-3">
          {[
            { label: "Heart Rate", value: `${features.hr_bpm.toFixed(0)}`, unit: "BPM", color: hrColor },
            { label: "HRV RMSSD", value: `${features.rmssd.toFixed(1)}`, unit: "ms", color: features.rmssd > 30 ? "#10b981" : "#f59e0b" },
            { label: "QRS Width", value: `${features.qrs_width}`, unit: "ms", color: features.qrs_width > 120 ? "#ef4444" : "#10b981" },
            { label: "pNN50", value: `${features.pnn50.toFixed(1)}`, unit: "%", color: "#8b5cf6" },
          ].map((metric) => (
            <div key={metric.label} className="bg-black/20 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">{metric.label}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold" style={{ color: metric.color }}>{metric.value}</span>
                <span className="text-xs text-gray-500">{metric.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Signal Quality */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Signal Quality Index</span>
            <span className="text-xs font-bold" style={{ color: qualityScore > 70 ? "#10b981" : qualityScore > 40 ? "#f59e0b" : "#ef4444" }}>
              {qualityScore}%
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: qualityScore > 70 ? "#10b981" : qualityScore > 40 ? "#f59e0b" : "#ef4444" }}
              initial={{ width: 0 }}
              animate={{ width: `${qualityScore}%` }}
              transition={{ duration: 1 }}
            />
          </div>
        </div>

        {/* Classifier */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-200">Arrhythmia Detection</div>
              <div className="text-xs text-gray-500 mt-0.5">Random Forest | MIT-BIH (48 records)</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">89.2% acc</span>
          </div>

          <div className="space-y-2 mb-4">
            {classProbData.map((cls) => (
              <div key={cls.name} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14">{cls.name}</span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: cls.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${cls.prob}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
                <span className="text-xs w-8 text-right" style={{ color: cls.color }}>{cls.prob}%</span>
              </div>
            ))}
          </div>

          <motion.div
            animate={predictions.predicted_class !== "Normal" ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              backgroundColor: predictions.predicted_class === "Normal" ? "#10b98122" : "#ef444422",
              border: `1px solid ${predictions.predicted_class === "Normal" ? "#10b98144" : "#ef444444"}`,
            }}
          >
            <Heart className="w-4 h-4" style={{ color: predictions.predicted_class === "Normal" ? "#10b981" : "#ef4444" }} />
            <span className="text-xs font-bold" style={{ color: predictions.predicted_class === "Normal" ? "#10b981" : "#ef4444" }}>
              {predictions.predicted_class === "Normal" ? "NORMAL SINUS RHYTHM" : `${predictions.predicted_class.toUpperCase()} DETECTED`}
            </span>
          </motion.div>
        </div>

        {/* AI Insight */}
        <AIInsightCard ecg={analysis} mode="ecg" />
      </div>
    </div>
  );
}
