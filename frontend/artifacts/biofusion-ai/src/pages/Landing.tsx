import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { Activity, Upload, Wifi, Play, ChevronDown, Heart, Brain, Zap, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <div ref={ref}>{count}{suffix}</div>;
}

function AnimatedSignal({ color, type }: { color: string; type: "ecg" | "emg" | "eeg" }) {
  const generatePath = () => {
    if (type === "ecg") {
      return "M0,25 L20,25 L25,25 L30,5 L35,45 L40,10 L45,25 L70,25 L75,25 L80,5 L85,45 L90,10 L95,25 L150,25";
    }
    if (type === "emg") {
      return "M0,25 L10,25 L12,15 L14,35 L16,10 L18,40 L20,25 L30,25 L32,12 L34,38 L36,8 L38,42 L40,25 L60,25 L62,14 L64,36 L66,9 L68,41 L70,25 L150,25";
    }
    return "M0,25 Q10,15 20,25 Q30,35 40,25 Q50,15 60,25 Q70,35 80,25 Q90,15 100,25 Q110,35 120,25 Q130,15 140,25 L150,25";
  };

  return (
    <svg viewBox="0 0 150 50" className="w-full h-8" preserveAspectRatio="none">
      <motion.path
        d={generatePath()}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2, repeat: Infinity, repeatType: "loop", ease: "linear" }}
      />
    </svg>
  );
}

const conditions = [
  {
    name: "SUDEP Risk",
    severity: "CRITICAL",
    signals: ["ECG", "EEG"],
    description: "Cardiac arrest triggered by seizure activity",
    severityColor: "#ef4444",
  },
  {
    name: "Motor Neuron Pattern",
    severity: "HIGH",
    signals: ["EMG", "EEG"],
    description: "Early ALS/motor neuron degeneration signature",
    severityColor: "#f97316",
  },
  {
    name: "Autonomic Stress",
    severity: "MODERATE",
    signals: ["ECG", "EMG", "EEG"],
    description: "Panic attack — all three systems elevated",
    severityColor: "#f59e0b",
  },
  {
    name: "Cardiac Arrhythmia",
    severity: "HIGH",
    signals: ["ECG"],
    description: "PVC/Atrial fibrillation detected",
    severityColor: "#f97316",
  },
  {
    name: "Muscle Fatigue Pattern",
    severity: "MODERATE",
    signals: ["EMG"],
    description: "Neuromuscular fatigue with frequency shift",
    severityColor: "#f59e0b",
  },
];

export function Landing() {
  const [, navigate] = useLocation();

  const handleLaunch = (mode: string) => {
    navigate(`/analysis?mode=${mode}`);
  };

  return (
    <div className="min-h-screen bg-[#050d1a] text-white overflow-x-hidden">
      <Navbar />

      {/* Animated mesh background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-teal-500/5 blur-3xl" />
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-blue-500/4 blur-3xl" />
      </div>

      {/* HERO */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-5xl mx-auto"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-400 text-sm font-medium mb-8"
          >
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-teal-400 inline-block"
            />
            AI-Powered Clinical Biosignal Intelligence
          </motion.div>

          {/* Heading */}
          <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-6 leading-none">
            Understand Your Body's<br />
            <span className="bg-gradient-to-r from-teal-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
              Three Languages
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            BioFusion AI simultaneously analyzes ECG, EMG, and EEG signals to detect complex clinical conditions no single sensor can identify.
          </p>

          {/* Signal Previews */}
          <div className="glass rounded-2xl p-6 mb-12 max-w-3xl mx-auto">
            <div className="space-y-3">
              {[
                { label: "ECG", color: "#ef4444", type: "ecg" as const },
                { label: "EMG", color: "#10b981", type: "emg" as const },
                { label: "EEG", color: "#8b5cf6", type: "eeg" as const },
              ].map((signal) => (
                <div key={signal.label} className="flex items-center gap-4">
                  <span className="text-xs font-mono font-bold w-8" style={{ color: signal.color }}>
                    {signal.label}
                  </span>
                  <div className="flex-1 bg-black/30 rounded px-2 py-1">
                    <AnimatedSignal color={signal.color} type={signal.type} />
                  </div>
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: signal.color }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
            <button
              onClick={() => handleLaunch("upload")}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-400 font-semibold hover:bg-teal-500/25 hover:border-teal-400 transition-all hover:shadow-lg hover:shadow-teal-500/20"
            >
              <Upload className="w-5 h-5" />
              Upload Files →
            </button>
            <button
              onClick={() => handleLaunch("hardware")}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-400 font-semibold hover:bg-blue-500/25 hover:border-blue-400 transition-all hover:shadow-lg hover:shadow-blue-500/20"
            >
              <Wifi className="w-5 h-5" />
              Connect Hardware →
            </button>
            <button
              onClick={() => handleLaunch("demo")}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-400 font-semibold hover:bg-purple-500/25 hover:border-purple-400 transition-all hover:shadow-lg hover:shadow-purple-500/20"
            >
              <Play className="w-5 h-5" />
              Try Demo →
            </button>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-gray-500"
        >
          <ChevronDown className="w-6 h-6" />
        </motion.div>
      </section>

      {/* WHAT WE DETECT */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">What BioFusion Detects</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Cross-system conditions traditional single-signal devices miss entirely
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {conditions.map((cond, i) => (
              <motion.div
                key={cond.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.02 }}
                className="glass rounded-xl p-5 border transition-all cursor-default"
                style={{ borderColor: cond.severityColor + "22" }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-white text-lg">{cond.name}</h3>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ backgroundColor: cond.severityColor + "22", color: cond.severityColor }}
                  >
                    {cond.severity}
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-3">{cond.description}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {cond.signals.map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10">
                      {s}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">Three Signals. One Intelligence.</h2>
          </motion.div>

          <div className="flex flex-col md:flex-row items-center gap-6">
            {[
              {
                step: "01",
                title: "Acquire",
                icon: <Zap className="w-8 h-8" />,
                color: "#14b8a6",
                desc: "Connect ESP32 hardware or upload your ECG/EMG/EEG files",
              },
              {
                step: "02",
                title: "Process",
                icon: <Activity className="w-8 h-8" />,
                color: "#8b5cf6",
                desc: "Pan-Tompkins peak detection, FFT band analysis, IIR filtering — all in real time",
              },
              {
                step: "03",
                title: "Diagnose",
                icon: <Brain className="w-8 h-8" />,
                color: "#ec4899",
                desc: "Three ML models + fusion engine outputs named clinical conditions with AI explanations",
              },
            ].map((step, i) => (
              <div key={step.step} className="flex items-center gap-6 flex-1">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="glass rounded-2xl p-6 flex-1 text-center border"
                  style={{ borderColor: step.color + "33" }}
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: step.color + "22", color: step.color }}
                  >
                    {step.icon}
                  </div>
                  <div className="text-xs font-mono text-gray-500 mb-1">STEP {step.step}</div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: step.color }}>{step.title}</h3>
                  <p className="text-sm text-gray-400">{step.desc}</p>
                </motion.div>
                {i < 2 && (
                  <ArrowRight className="w-6 h-6 text-gray-600 flex-shrink-0 hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INPUT MODES */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">Choose Your Input Mode</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Upload */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="glass rounded-2xl p-6 border border-teal-500/20 hover:border-teal-400/40 transition-all"
            >
              <Upload className="w-8 h-8 text-teal-400 mb-4" />
              <h3 className="text-xl font-bold mb-2 text-teal-400">Upload Your Data</h3>
              <p className="text-gray-400 text-sm mb-4">Supports ECG (.dat/.csv/.hea), EMG (.csv/.dat), EEG (.edf/.csv)</p>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {["MIT-BIH", "CHB-MIT", "CSV", "EDF", "DAT"].map((f) => (
                  <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    {f}
                  </span>
                ))}
              </div>
              <div className="border-2 border-dashed border-teal-500/20 rounded-xl p-4 mb-4 text-center text-sm text-gray-500">
                Drag & drop files here
              </div>
              <button
                onClick={() => handleLaunch("upload")}
                className="w-full py-2.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 text-sm font-semibold hover:bg-teal-500/25 transition-all"
              >
                Upload & Analyze →
              </button>
            </motion.div>

            {/* Hardware */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl p-6 border border-blue-500/20 hover:border-blue-400/40 transition-all"
            >
              <Wifi className="w-8 h-8 text-blue-400 mb-4" />
              <h3 className="text-xl font-bold mb-2 text-blue-400">Live ESP32 Stream</h3>
              <p className="text-gray-400 text-sm mb-4">Connect ESP32 with AD8232 + EMG module for real-time analysis</p>
              <div className="flex items-center gap-2 mb-4">
                <motion.div
                  className="w-2.5 h-2.5 rounded-full bg-green-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-xs text-green-400">Scanning for devices...</span>
              </div>
              <select className="w-full bg-blue-500/10 border border-blue-500/20 text-gray-400 text-sm rounded-lg px-3 py-2 mb-4">
                <option>Select COM port...</option>
                <option>COM3 — ESP32 Device</option>
                <option>COM7 — Unknown</option>
              </select>
              <button
                onClick={() => handleLaunch("hardware")}
                className="w-full py-2.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-500/25 transition-all"
              >
                Connect Device →
              </button>
            </motion.div>

            {/* Demo */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="glass rounded-2xl p-6 border border-purple-500/20 hover:border-purple-400/40 transition-all"
            >
              <Play className="w-8 h-8 text-purple-400 mb-4" />
              <h3 className="text-xl font-bold mb-2 text-purple-400">Try Without Hardware</h3>
              <p className="text-gray-400 text-sm mb-4">Explore all features with clinical demo scenarios</p>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {["Normal", "Stress", "Arrhythmia", "SUDEP"].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleLaunch("demo")}
                    className="text-xs px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleLaunch("demo")}
                className="w-full py-2.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 text-sm font-semibold hover:bg-purple-500/25 transition-all"
              >
                Launch Demo →
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="py-16 px-6 border-y border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: "MIT-BIH Records", value: 48, suffix: "" },
              { label: "ML Models", value: 3, suffix: "" },
              { label: "Disease Detections", value: 5, suffix: "" },
              { label: "Inference", value: 1, suffix: "s" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl font-black text-teal-400 mb-1">
                  {stat.suffix === "s" ? "<" : ""}
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 px-6 text-center">
        <div className="text-gray-500 text-sm mb-4">
          BioFusion AI — Built for REVA University ECE Hackathon
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {["React", "TailwindCSS", "Recharts", "Framer Motion", "TypeScript"].map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/8">
              {t}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
