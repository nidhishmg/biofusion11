import { motion } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { WaveformChart } from "./WaveformChart";
import { AIInsightCard } from "./AIInsightCard";
import { EMGAnalysis } from "@/store/analysisStore";

interface EMGPanelProps {
  analysis: EMGAnalysis;
}

const gestureIcons: Record<string, string> = {
  REST: "—",
  FIST: "✊",
  OPEN: "🖐",
  POINT: "👆",
};

export function EMGPanel({ analysis }: EMGPanelProps) {
  const { features, predictions, psd } = analysis;

  const psdData = psd.frequencies.slice(0, 100).map((f, i) => ({
    f: parseFloat(f.toFixed(1)),
    power: psd.power[i] || 0,
  }));

  const fatigueBars = psd.mean_frequency_over_time.map((mnf, i) => ({
    window: i + 1,
    mnf,
    color: mnf > 80 ? "#10b981" : mnf > 60 ? "#f59e0b" : "#ef4444",
  }));

  const fatigue = predictions.fatigue_score;
  const fatigueColor = fatigue > 0.66 ? "#ef4444" : fatigue > 0.33 ? "#f59e0b" : "#10b981";
  const fatigueLabel = fatigue > 0.66 ? "High Fatigue" : fatigue > 0.33 ? "Mild Fatigue" : "Fresh";

  const condProbs = Object.entries(predictions.condition_probabilities).map(([k, v]) => ({
    name: k,
    prob: parseFloat((v * 100).toFixed(1)),
    color: k === "Healthy" ? "#10b981" : k === "Myopathy" ? "#f97316" : "#ef4444",
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* LEFT */}
      <div className="lg:col-span-3 space-y-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-300">EMG Waveform + Envelope</span>
            <span className="text-xs text-gray-500">1000 Hz sampling</span>
          </div>
          <WaveformChart
            signal={analysis.filtered_signal}
            color="#064e3b"
            label="Raw EMG"
            height={100}
            maxPoints={400}
          />
          <WaveformChart
            signal={analysis.envelope}
            color="#10b981"
            label="Envelope"
            height={80}
            maxPoints={400}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* PSD */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">Power Spectral Density</p>
            <div style={{ height: 110 }}>
              <ResponsiveContainer>
                <AreaChart data={psdData}>
                  <defs>
                    <linearGradient id="emgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="power" stroke="#10b981" fill="url(#emgGrad)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <XAxis dataKey="f" tick={{ fill: "#6b7280", fontSize: 9 }} tickFormatter={(v) => `${v}Hz`} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={28} />
                  <ReferenceLine x={features.mnf} stroke="#f59e0b" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RMS/MAV timeline */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">Feature Timeline</p>
            <div style={{ height: 110 }}>
              <ResponsiveContainer>
                <LineChart data={fatigueBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="window" tick={{ fill: "#6b7280", fontSize: 9 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={28} />
                  <Line type="monotone" dataKey="mnf" stroke="#10b981" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} formatter={(v: number) => [`${v.toFixed(1)} Hz`, "Mean Freq"]} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fatigue Index */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">Frequency Fatigue Index</p>
            <div style={{ height: 110 }}>
              <ResponsiveContainer>
                <BarChart data={fatigueBars}>
                  <Bar dataKey="mnf" radius={[2, 2, 0, 0]}>
                    {fatigueBars.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                  <XAxis dataKey="window" tick={{ fill: "#6b7280", fontSize: 8 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={28} />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="lg:col-span-2 space-y-4">
        {/* Gesture display */}
        <div className="glass rounded-xl p-4 text-center">
          <div className="text-4xl mb-1">{gestureIcons[predictions.gesture] || "—"}</div>
          <div className="text-2xl font-black text-green-400 mb-1">{predictions.gesture.toUpperCase()}</div>
          <div className="text-sm text-gray-400 mb-3">
            Confidence: <span className="text-green-400 font-semibold">{(predictions.gesture_confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(predictions.all_gesture_probs).map(([g, p]) => (
              <div key={g} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-12">{g}</span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full">
                  <motion.div
                    className="h-full rounded-full bg-green-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(p as number) * 100}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
                <span className="text-xs text-green-400 w-8 text-right">{((p as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fatigue Meter */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Muscle Fatigue Level</span>
            <span className="text-xs font-bold" style={{ color: fatigueColor }}>{fatigueLabel}</span>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: fatigueColor }}
                initial={{ width: 0 }}
                animate={{ width: `${fatigue * 100}%` }}
                transition={{ duration: 1 }}
              />
            </div>
            <span className="text-sm font-bold" style={{ color: fatigueColor }}>{(fatigue * 100).toFixed(0)}%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Mean Freq: {features.mnf.toFixed(1)} Hz</div>
        </div>

        {/* EMG Classifier */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold">EMG Classification</div>
              <div className="text-xs text-gray-500">SVM-RBF Classifier</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">91.4% acc</span>
          </div>
          <div className="space-y-2 mb-3">
            {condProbs.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20">{c.name}</span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full">
                  <motion.div className="h-full rounded-full" style={{ backgroundColor: c.color }} initial={{ width: 0 }} animate={{ width: `${c.prob}%` }} transition={{ duration: 0.8 }} />
                </div>
                <span className="text-xs w-8 text-right" style={{ color: c.color }}>{c.prob}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Signal Stats */}
        <div className="glass rounded-xl p-4 grid grid-cols-2 gap-2">
          {[
            { label: "RMS", value: features.rms.toFixed(3) },
            { label: "MAV", value: features.mav.toFixed(3) },
            { label: "ZCR", value: features.zcr.toFixed(3) },
            { label: "WL", value: features.wl.toFixed(1) },
          ].map((stat) => (
            <div key={stat.label} className="bg-black/20 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500 mb-1">{stat.label}</div>
              <div className="text-sm font-bold text-green-400">{stat.value}</div>
            </div>
          ))}
        </div>

        <AIInsightCard emg={analysis} mode="emg" />
      </div>
    </div>
  );
}
