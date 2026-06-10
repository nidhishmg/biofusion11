import { motion } from "framer-motion";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import { WaveformChart } from "./WaveformChart";
import { AIInsightCard } from "./AIInsightCard";
import { EEGAnalysis } from "@/store/analysisStore";

interface EEGPanelProps {
  analysis: EEGAnalysis;
}

const BANDS = [
  { name: "Delta", key: "delta_power", color: "#3b82f6" },
  { name: "Theta", key: "theta_power", color: "#14b8a6" },
  { name: "Alpha", key: "alpha_power", color: "#8b5cf6" },
  { name: "Beta", key: "beta_power", color: "#f59e0b" },
  { name: "Gamma", key: "gamma_power", color: "#ef4444" },
];

export function EEGPanel({ analysis }: EEGPanelProps) {
  const features = analysis?.features ?? {
    delta_rel: 0,
    theta_rel: 0,
    alpha_rel: 0,
    beta_rel: 0,
    gamma_rel: 0,
    alpha_beta_ratio: 0,
    spectral_entropy: 0,
    engagement_index: 0,
  };

  const predictions = analysis?.predictions ?? {
    mental_state: "Unknown",
    seizure_probability: 0,
    dominant_band: "Unknown",
  };

  const band_spectrum = analysis?.band_spectrum ?? {
    frequencies: [],
    total_power: [],
    delta_power: [],
    theta_power: [],
    alpha_power: [],
    beta_power: [],
    gamma_power: [],
  };

  const spectrumData = (band_spectrum.frequencies ?? []).slice(0, 80).map((f, i) => ({
    f: parseFloat(f.toFixed(1)),
    delta: band_spectrum.delta_power?.[i] || 0,
    theta: band_spectrum.theta_power?.[i] || 0,
    alpha: band_spectrum.alpha_power?.[i] || 0,
    beta: band_spectrum.beta_power?.[i] || 0,
    gamma: band_spectrum.gamma_power?.[i] || 0,
  }));

  const donutData = [
    { name: "Delta", value: parseFloat((features.delta_rel * 100).toFixed(1)), color: "#3b82f6" },
    { name: "Theta", value: parseFloat((features.theta_rel * 100).toFixed(1)), color: "#14b8a6" },
    { name: "Alpha", value: parseFloat((features.alpha_rel * 100).toFixed(1)), color: "#8b5cf6" },
    { name: "Beta", value: parseFloat((features.beta_rel * 100).toFixed(1)), color: "#f59e0b" },
    { name: "Gamma", value: parseFloat((features.gamma_rel * 100).toFixed(1)), color: "#ef4444" },
  ];

  const ratio = features.alpha_beta_ratio;
  const ratioColor = ratio > 1.5 ? "#10b981" : ratio > 0.8 ? "#f59e0b" : "#3b82f6";
  const ratioLabel = ratio > 1.5 ? "RELAXED" : ratio > 0.8 ? "NEUTRAL" : "FOCUSED";

  const seizure = predictions.seizure_probability;
  const seizureColor = seizure > 0.65 ? "#ef4444" : seizure > 0.3 ? "#f59e0b" : "#10b981";
  const seizureLabel = seizure > 0.65 ? "HIGH SEIZURE RISK" : seizure > 0.3 ? "MODERATE SEIZURE RISK" : "LOW SEIZURE RISK";

  const mentalStateColors: Record<string, string> = {
    Relaxed: "#10b981",
    Focused: "#3b82f6",
    Neutral: "#f59e0b",
    Drowsy: "#6b7280",
    Stressed: "#ef4444",
  };
  const stateColor = mentalStateColors[predictions.mental_state] || "#14b8a6";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* LEFT */}
      <div className="lg:col-span-3 space-y-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-300">EEG Waveform</span>
            <span className="text-xs text-gray-500">256 Hz | µV</span>
          </div>
          <WaveformChart signal={analysis?.filtered_signal ?? []} color="#8b5cf6" label="EEG" height={180} maxPoints={400} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Band Power Spectrum */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">Band Power Spectrum</p>
            <div style={{ height: 110 }}>
              <ResponsiveContainer>
                <AreaChart data={spectrumData.slice(0, 60)}>
                  <defs>
                    {BANDS.map((b) => (
                      <linearGradient key={b.name} id={`eeg-${b.name}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={b.color} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={b.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  {BANDS.map((b) => (
                    <Area key={b.name} type="monotone" dataKey={b.key} stroke={b.color} fill={`url(#eeg-${b.name})`} strokeWidth={1} dot={false} isAnimationActive={false} stackId="1" />
                  ))}
                  <XAxis dataKey="f" tick={{ fill: "#6b7280", fontSize: 9 }} tickFormatter={(v) => `${v}Hz`} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={25} />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 10 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Band Power Over Time */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">Band Power Over Time</p>
            <div style={{ height: 110 }}>
              <ResponsiveContainer>
                <AreaChart data={spectrumData.slice(0, 50)}>
                  {BANDS.map((b) => (
                    <Area key={b.name} type="monotone" dataKey={b.key} stroke={b.color} fill={b.color} fillOpacity={0.15} strokeWidth={1} dot={false} isAnimationActive={false} />
                  ))}
                  <XAxis tick={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={25} />
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 10 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Topographic Map */}
          <div className="glass rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-2">Topographic Map</p>
            <div className="flex items-center justify-center" style={{ height: 110 }}>
              <svg viewBox="0 0 100 100" width="90" height="90">
                <circle cx="50" cy="55" r="38" fill="none" stroke="#1f2937" strokeWidth="1.5" />
                <line x1="50" y1="17" x2="50" y2="10" stroke="#1f2937" strokeWidth="1.5" />
                <ellipse cx="15" cy="55" rx="5" ry="7" fill="none" stroke="#1f2937" strokeWidth="1" />
                <ellipse cx="85" cy="55" rx="5" ry="7" fill="none" stroke="#1f2937" strokeWidth="1" />
                <circle cx="38" cy="30" r="8"
                  fill={stateColor + "88"}
                  stroke={stateColor}
                  strokeWidth="1.5"
                />
                <text x="38" y="34" textAnchor="middle" fill="white" fontSize="6">Fp1</text>
                <circle cx="62" cy="30" r="8"
                  fill={stateColor + "55"}
                  stroke={stateColor}
                  strokeWidth="1.5"
                />
                <text x="62" y="34" textAnchor="middle" fill="white" fontSize="6">Fp2</text>
                <circle cx="50" cy="55" r="6" fill={stateColor + "33"} stroke={stateColor} strokeWidth="1" />
                <text x="50" y="59" textAnchor="middle" fill="white" fontSize="5">Cz</text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="lg:col-span-2 space-y-4">
        {/* Mental State */}
        <motion.div
          key={predictions.mental_state}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-xl p-4 text-center border"
          style={{ borderColor: stateColor + "44" }}
        >
          <div className="text-xs text-gray-500 mb-2">Mental State</div>
          <div className="text-3xl font-black mb-1" style={{ color: stateColor }}>
            {predictions.mental_state.toUpperCase()}
          </div>
          <div className="text-sm text-gray-400">Dominant Band: {predictions.dominant_band}</div>
        </motion.div>

        {/* Band Donut */}
        <div className="glass rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-3">Band Power Distribution</div>
          <div className="flex items-center gap-4">
            <div style={{ height: 100, width: 100 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" isAnimationActive>
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #1f2937", fontSize: 11 }} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1">
              {donutData.map((b) => (
                <div key={b.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="text-xs text-gray-400">{b.name}</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: b.color }}>{b.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alpha/Beta Ratio */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Alpha/Beta Ratio</span>
            <span className="text-xs font-bold" style={{ color: ratioColor }}>{ratioLabel}</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-1">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: ratioColor, width: `${Math.min((ratio / 2) * 100, 100)}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((ratio / 2) * 100, 100)}%` }}
              transition={{ duration: 1 }}
            />
          </div>
          <div className="text-sm font-bold" style={{ color: ratioColor }}>{ratio.toFixed(2)}</div>
        </div>

        {/* Seizure Risk */}
        <motion.div
          animate={seizure > 0.65 ? { scale: [1, 1.01, 1], boxShadow: [`0 0 0px ${seizureColor}00`, `0 0 20px ${seizureColor}55`, `0 0 0px ${seizureColor}00`] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="glass rounded-xl p-4 text-center border"
          style={{ borderColor: seizureColor + "44" }}
        >
          <div className="text-xs text-gray-500 mb-1">Seizure Risk</div>
          <div className="text-lg font-black mb-1" style={{ color: seizureColor }}>
            {seizureLabel} ({seizure.toFixed(2)})
          </div>
          <div className="text-xs text-gray-500">SVM on CHB-MIT | 87.3% accuracy</div>
        </motion.div>

        {/* Engagement */}
        <div className="glass rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-1">Engagement Index (β / α+θ)</div>
          <div className="text-xl font-bold text-amber-400">{features.engagement_index.toFixed(2)}</div>
          <div className="text-xs text-gray-500">
            {features.engagement_index > 0.5 ? "High cognitive engagement" : "Low engagement"}
          </div>
        </div>

        <AIInsightCard eeg={analysis} mode="eeg" />
      </div>
    </div>
  );
}
