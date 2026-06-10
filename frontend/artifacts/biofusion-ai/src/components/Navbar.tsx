import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Activity, Github, BookOpen } from "lucide-react";

export function Navbar() {
  const [, navigate] = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-teal-500/10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 group">
          <div className="relative">
            <Activity className="w-6 h-6 text-teal-400" />
            <motion.div
              className="absolute -inset-1 rounded-full bg-teal-400/20"
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
            BioFusion AI
          </span>
        </button>

        <div className="flex items-center gap-6">
          <a
            href="#"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Docs
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <button
            onClick={() => navigate("/analysis?mode=demo")}
            className="px-4 py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 text-sm font-medium hover:bg-teal-500/20 hover:border-teal-400/50 transition-all animate-pulse-glow"
          >
            Launch App →
          </button>
        </div>
      </div>
    </nav>
  );
}
