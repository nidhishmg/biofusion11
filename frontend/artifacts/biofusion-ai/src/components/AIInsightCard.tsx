import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { ECGAnalysis, EMGAnalysis, EEGAnalysis, FusionResult } from "@/store/analysisStore";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || "";

interface AIInsightCardProps {
  ecg?: ECGAnalysis | null;
  emg?: EMGAnalysis | null;
  eeg?: EEGAnalysis | null;
  fusion?: FusionResult | null;
  mode?: "ecg" | "emg" | "eeg" | "fusion";
}

function generateInsight(
  ecg?: ECGAnalysis | null,
  emg?: EMGAnalysis | null,
  eeg?: EEGAnalysis | null,
  fusion?: FusionResult | null,
  mode?: string
): string {
  const insights: string[] = [];

  if (ecg && (mode === "ecg" || mode === "fusion" || !mode)) {
    const hr = ecg.features.hr_bpm;
    const rmssd = ecg.features.rmssd;
    const cls = ecg.predictions.predicted_class;
    if (hr < 60) insights.push(`Bradycardic pattern at ${hr.toFixed(0)} BPM detected — resting HR may indicate high vagal tone or potential sinus node dysfunction.`);
    else if (hr > 100) insights.push(`Elevated heart rate at ${hr.toFixed(0)} BPM suggests tachycardia — potentially stress-induced or pathological.`);
    else insights.push(`Normal sinus rhythm at ${hr.toFixed(0)} BPM with RMSSD of ${rmssd.toFixed(1)}ms indicating ${rmssd > 30 ? "healthy" : "reduced"} autonomic function.`);
    if (cls !== "Normal") insights.push(`${cls} pattern identified — recommend further ECG evaluation.`);
  }

  if (emg && (mode === "emg" || mode === "fusion" || !mode)) {
    const fatigue = emg.predictions.fatigue_score;
    const cond = emg.predictions.condition;
    const mnf = emg.features.mnf;
    insights.push(`${cond} neuromuscular pattern with mean frequency ${mnf.toFixed(1)}Hz. ${fatigue > 0.5 ? `Significant fatigue detected (score: ${(fatigue * 100).toFixed(0)}%) — progressive motor unit synchronization.` : "No significant fatigue indicators present."}`);
  }

  if (eeg && (mode === "eeg" || mode === "fusion" || !mode)) {
    const state = eeg.predictions.mental_state;
    const seizure = eeg.predictions.seizure_probability;
    const ratio = eeg.features.alpha_beta_ratio;
    insights.push(`${state} mental state with alpha/beta ratio ${ratio.toFixed(2)}. Seizure risk: ${seizure < 0.2 ? "LOW" : seizure < 0.5 ? "MODERATE" : "HIGH"} (${(seizure * 100).toFixed(0)}%). ${seizure < 0.1 ? "No epileptiform activity detected." : "Elevated ictal activity — monitor closely."}`);
  }

  if (fusion && mode === "fusion") {
    insights.push(`Cross-modal correlation analysis complete. Overall risk score: ${fusion.risk_score.toFixed(2)} (${fusion.risk_level}). Primary condition: ${fusion.primary_condition}. ${fusion.risk_score < 0.3 ? "No clinical intervention required." : "Recommend clinical consultation."}`);
  }

  return insights.join(" ") || "Analysis in progress — awaiting signal data for insight generation.";
}

export function AIInsightCard({ ecg, emg, eeg, fusion, mode }: AIInsightCardProps) {
  const [insight, setInsight] = useState(() => generateInsight(ecg, emg, eeg, fusion, mode));
  const [isRegenerating, setIsRegenerating] = useState(false);

  const fetchInsight = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/insight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ecg, emg, eeg, fusion }),
      });

      if (!res.ok) {
        throw new Error("AI insight request failed");
      }

      const payload = await res.json();
      if (typeof payload?.insight === "string" && payload.insight.trim()) {
        setInsight(payload.insight);
        return;
      }

      setInsight(generateInsight(ecg, emg, eeg, fusion, mode));
    } catch {
      setInsight(generateInsight(ecg, emg, eeg, fusion, mode));
    }
  };

  useEffect(() => {
    void fetchInsight();
    // Keep mode included so per-panel narrative can adapt.
  }, [ecg, emg, eeg, fusion, mode]);

  const handleRegenerate = () => {
    setIsRegenerating(true);
    setTimeout(async () => {
      await fetchInsight();
      setIsRegenerating(false);
    }, 800);
  };

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-purple-300">AI Clinical Insight</span>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors px-2 py-1 rounded border border-purple-500/30 hover:border-purple-400/50"
        >
          <RefreshCw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
          Regenerate
        </button>
      </div>
      <motion.p
        key={insight}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm text-gray-300 leading-relaxed"
      >
        {insight}
      </motion.p>
    </div>
  );
}
