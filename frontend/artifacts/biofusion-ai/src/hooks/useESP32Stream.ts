/**
 * BioFusion AI — ESP32 Live Stream Hook
 *
 * Connects to the backend WebSocket at /ws/dashboard and receives
 * real-time sensor frames from the ESP32 hardware.
 *
 * Maintains rolling history arrays for ECG/EMG waveforms and
 * the latest EEG band-power readings.
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface EEGBands {
  alpha: number;
  beta: number;
  theta: number;
  delta: number;
}

export interface SensorFrame {
  type: string;
  ts: number;
  ecg: number;
  emg: number;
  eeg: EEGBands;
  leadOff: boolean;
  fallback?: boolean;
}

export interface LiveInferenceResult {
  ecg: {
    features: Record<string, number>;
    predictions: {
      predicted_class: string;
      arrhythmia_probability: number;
      class_probabilities: Record<string, number>;
    };
  };
  emg: {
    features: Record<string, number>;
    predictions: {
      gesture: string;
      gesture_confidence: number;
      condition: string;
      fatigue_score: number;
      fatigue_level: string;
    };
  };
  eeg: {
    features: Record<string, number>;
    predictions: {
      mental_state: string;
      seizure_probability: number;
      seizure_risk: string;
      dominant_band: string;
    };
  };
  fusion: {
    risk_score: number;
    risk_level: string;
    primary_condition: string;
    severity: string;
    reason: string;
  };
  buffer_sizes: {
    ecg: number;
    emg: number;
    eeg: number;
  };
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || "";
const MAX_HISTORY = 500;

/**
 * Derives the WebSocket URL from the current page location or API base.
 * Handles both local dev (localhost) and production environments.
 */
function getWsUrl(): string {
  if (API_BASE) {
    // Convert http(s)://host:port to ws(s)://host:port
    return API_BASE.replace(/^http/, "ws") + "/ws/dashboard";
  }
  // Default: assume backend is on same host, port 8000
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//localhost:8000/ws/dashboard`;
}

export function useESP32Stream() {
  const [ecgHistory, setECGHistory] = useState<number[]>([]);
  const [emgHistory, setEMGHistory] = useState<number[]>([]);
  const [eegLatest, setEEGLatest] = useState<EEGBands | null>(null);
  const [leadOff, setLeadOff] = useState(false);
  const [fallbackActive, setFallbackActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [inference, setInference] = useState<LiveInferenceResult | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inferenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Poll /api/inference every 2 seconds for ML predictions
  const startInferencePolling = useCallback(() => {
    if (inferenceTimerRef.current) return;

    inferenceTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(`${API_BASE}/api/inference`);
        if (res.ok) {
          const data: LiveInferenceResult = await res.json();
          if (mountedRef.current) setInference(data);
        }
      } catch {
        // Silently ignore — backend might not be up yet
      }
    }, 2000);
  }, []);

  const stopInferencePolling = useCallback(() => {
    if (inferenceTimerRef.current) {
      clearInterval(inferenceTimerRef.current);
      inferenceTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setConnected(true);
      startInferencePolling();
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      stopInferencePolling();
      // Auto-reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const frame: SensorFrame = JSON.parse(event.data);
        if (frame.type === "ping") return; // Ignore keepalive pings

        if (frame.type === "sensor_frame") {
          setECGHistory((prev) => {
            const next = [...prev, frame.ecg];
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
          });
          setEMGHistory((prev) => {
            const next = [...prev, frame.emg];
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
          });
          setEEGLatest(frame.eeg);
          setLeadOff(frame.leadOff);
          setFallbackActive(!!frame.fallback);
        }
      } catch {
        // Ignore malformed messages
      }
    };
  }, [startInferencePolling, stopInferencePolling]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      stopInferencePolling();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect, stopInferencePolling]);

  return {
    ecgHistory,
    emgHistory,
    eegLatest,
    leadOff,
    fallbackActive,
    connected,
    inference,
  };
}
