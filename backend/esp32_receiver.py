"""
BioFusion AI — ESP32 WebSocket Receiver
Accepts real-time sensor data from ESP32 hardware over WebSocket,
maintains rolling buffers, generates synthetic EEG, and broadcasts
unified frames to connected dashboard clients.
"""

import asyncio
import json
import math
import time
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from collections import deque
from datetime import datetime

# ─── SIGNAL BUFFERS ──────────────────────────────────────
# Rolling window: 5 seconds at 50 packets/sec = 250 samples
ECG_BUFFER = deque(maxlen=250)
EMG_BUFFER = deque(maxlen=250)
EEG_BUFFER = deque(maxlen=250)  # Simulated band-power dicts

# Connected dashboard clients (frontend WebSocket subscribers)
dashboard_clients: list = []

# Latest frame cache (for REST endpoint polling)
esp32_data_cache = {
    "ecg": 0,
    "emg": 0,
    "ts": 0,
    "leadOff": False,
    "connected": False,
}

# ─── SIMULATION STATE ────────────────────────────────────
SIMULATION_MODE = False
SIMULATION_PROFILE = "19yo"  # "19yo" or "40yo"


def generate_eeg_sample(ts_millis: int) -> dict:
    """
    Generate synthetic EEG band-power values.
    Uses sinusoidal noise models to simulate realistic EEG band activity.
    Replace with real EEG hardware values if a module becomes available.
    """
    t = ts_millis / 1000.0
    return {
        "alpha": float(np.clip(np.random.normal(25 + 5 * np.sin(t * 0.1), 3), 5, 50)),
        "beta":  float(np.clip(np.random.normal(15 + 3 * np.sin(t * 0.2), 2), 3, 35)),
        "theta": float(np.clip(np.random.normal(20 + 4 * np.sin(t * 0.05), 2.5), 5, 45)),
        "delta": float(np.clip(np.random.normal(30 + 8 * np.sin(t * 0.02), 4), 10, 60)),
    }


def generate_fallback_ecg(ts_millis: int) -> float:
    """
    Generate realistic PQRST ECG waveform when leads are off.
    Uses the ESP32's real timestamp so waveform stays synchronized.
    Mimics a healthy ~72 BPM heart rhythm.
    """
    t = ts_millis / 1000.0

    # Breathing modulation (0.25 Hz = 15 breaths/min)
    breath = math.sin(2 * math.pi * 0.25 * t)

    # Heart rate with HRV: ~72 BPM ± small variation
    hr_bpm = 72 + 2.0 * breath + 0.4 * math.sin(t * 0.09)
    hr_freq = hr_bpm / 60.0
    phase = (t * hr_freq) % 1.0

    # Baseline ~1500mV (mid-range ADC)
    ecg_val = 1500 + 6 * np.random.normal(0, 1)

    # P wave (atrial depolarization)
    if 0.0 < phase < 0.10:
        ecg_val += 55 * math.sin(phase / 0.10 * math.pi)
    # Q dip
    elif 0.13 < phase < 0.17:
        ecg_val -= 70 * math.sin((phase - 0.13) / 0.04 * math.pi)
    # R spike (sharp)
    elif 0.17 <= phase < 0.22:
        ecg_val += 850 * math.sin((phase - 0.17) / 0.05 * math.pi)
    # S dip
    elif 0.22 <= phase < 0.26:
        ecg_val -= 110 * math.sin((phase - 0.22) / 0.04 * math.pi)
    # T wave (ventricular repolarization)
    elif 0.38 < phase < 0.58:
        ecg_val += 150 * math.sin((phase - 0.38) / 0.20 * math.pi)

    # Breathing baseline wander
    ecg_val += 15 * breath

    return float(ecg_val)


def generate_fallback_emg(ts_millis: int) -> float:
    """
    Generate realistic EMG activity when leads are off.
    Shows clean baseline with brief voluntary contractions every ~5s.
    """
    t = ts_millis / 1000.0

    emg_val = 1500 + np.random.normal(0, 10)

    # Brief muscle contraction every ~5 seconds
    cycle = t % 5.0
    if cycle < 0.8:
        frac = cycle / 0.8
        emg_val += 250 * math.sin(frac * math.pi) * abs(np.random.normal(1, 0.15))

    return float(emg_val)


# Track if ECG is railed (static) — check last N values
_ecg_rail_detector = deque(maxlen=10)


def _is_ecg_railed(ecg_val: float) -> bool:
    """Detect if ECG is stuck at rail voltage (3300mV or 0mV)."""
    _ecg_rail_detector.append(ecg_val)
    if len(_ecg_rail_detector) < 5:
        return False
    vals = list(_ecg_rail_detector)
    # If all recent values are the same (railed) or near max/min
    spread = max(vals) - min(vals)
    avg = sum(vals) / len(vals)
    return spread < 5 and (avg > 3200 or avg < 100)


async def esp32_websocket_handler(websocket: WebSocket):
    """
    WebSocket endpoint that accepts data FROM the ESP32 device.
    Mounted at: /ws/esp32

    Expected JSON from ESP32:
        {"ts": <millis>, "ecg": <mV>, "emg": <mV>, "leadOff": <bool>, "device": "esp32_biofusion"}

    When leads are off or ECG is railed (static 3300mV), automatically
    switches to realistic fallback waveforms so the dashboard stays dynamic.
    """
    await websocket.accept()
    print("[ESP32] Device connected via WebSocket")
    esp32_data_cache["connected"] = True

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            ts = data.get("ts", 0)
            raw_ecg = data.get("ecg", 0)
            raw_emg = data.get("emg", 0)
            lead_off = data.get("leadOff", False)

            # Detect railed/static ECG (leads off or no body contact)
            ecg_railed = _is_ecg_railed(raw_ecg)
            use_fallback = lead_off or ecg_railed

            if use_fallback:
                # Generate realistic waveforms from ESP32 timestamp
                ecg_val = generate_fallback_ecg(ts)
                emg_val = generate_fallback_emg(ts)
            else:
                # Use REAL sensor data
                ecg_val = raw_ecg
                emg_val = raw_emg

            # Update latest cache
            esp32_data_cache.update(data)
            esp32_data_cache["ecg"] = ecg_val
            esp32_data_cache["emg"] = emg_val

            # Append to rolling buffers
            ECG_BUFFER.append(ecg_val)
            EMG_BUFFER.append(emg_val)

            # Generate simulated EEG for this frame
            eeg = generate_eeg_sample(ts)
            EEG_BUFFER.append(eeg)

            # Build unified sensor frame for dashboard clients
            frame = {
                "type":    "sensor_frame",
                "ts":      ts,
                "ecg":     ecg_val,
                "emg":     emg_val,
                "eeg":     eeg,
                "leadOff": lead_off,
                "fallback": use_fallback,  # let dashboard know if fallback is active
            }

            # Broadcast to all connected dashboard clients
            dead_clients = []
            for client in dashboard_clients:
                try:
                    await client.send_json(frame)
                except Exception:
                    dead_clients.append(client)

            # Remove disconnected clients
            for dead in dead_clients:
                if dead in dashboard_clients:
                    dashboard_clients.remove(dead)

    except WebSocketDisconnect:
        print("[ESP32] Device disconnected")
        esp32_data_cache["connected"] = False
    except Exception as e:
        print(f"[ESP32] Error: {e}")
        esp32_data_cache["connected"] = False


async def dashboard_websocket_handler(websocket: WebSocket):
    """
    WebSocket endpoint for the React dashboard to subscribe to live sensor data.
    Mounted at: /ws/dashboard

    Data is pushed automatically whenever the ESP32 handler receives a frame.
    """
    await websocket.accept()
    dashboard_clients.append(websocket)
    print(f"[Dashboard] Client connected. Total active: {len(dashboard_clients)}")

    try:
        # Keep the connection alive — data is pushed by the ESP32 handler
        while True:
            # Listen for any client messages (keepalive pings, etc.)
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if websocket in dashboard_clients:
            dashboard_clients.remove(websocket)
        print(f"[Dashboard] Client disconnected. Total active: {len(dashboard_clients)}")


# ─── Public API for other modules ────────────────────────

def get_ecg_buffer() -> list:
    """Return current ECG rolling buffer as a plain list."""
    return list(ECG_BUFFER)


def get_emg_buffer() -> list:
    """Return current EMG rolling buffer as a plain list."""
    return list(EMG_BUFFER)


def get_eeg_buffer() -> list:
    """Return current EEG rolling buffer as a list of band-power dicts."""
    return list(EEG_BUFFER)


def get_latest_frame() -> dict:
    """Return the most recent ESP32 data cache."""
    return dict(esp32_data_cache)


def is_esp32_connected() -> bool:
    """Check if an ESP32 device is currently connected."""
    return esp32_data_cache.get("connected", False)

# ─── SIMULATION LOGIC ────────────────────────────────────

def set_simulation_state(active: bool, profile: str = "19yo"):
    global SIMULATION_MODE, SIMULATION_PROFILE, esp32_data_cache
    SIMULATION_MODE = active
    SIMULATION_PROFILE = profile
    if not active:
        esp32_data_cache["connected"] = False

async def hardware_simulation_loop():
    """Generates synthetic ESP32 data when hardware is not available."""
    global SIMULATION_MODE, SIMULATION_PROFILE, esp32_data_cache

    print("[ESP32 Simulator] Started background loop")
    
    start_time = time.time()

    while True:
        if not SIMULATION_MODE:
            await asyncio.sleep(0.1)
            continue

        esp32_data_cache["connected"] = True
        
        t = time.time() - start_time
        ts_millis = int(t * 1000)

        # ── Breathing modulation (0.25 Hz = 15 breaths/min)
        breath = math.sin(2 * math.pi * 0.25 * t)

        if SIMULATION_PROFILE == "19yo":
            # ── Heart rate with realistic HRV: 70 BPM ± small variation
            hr_bpm = 70 + 2.5 * breath + 0.5 * math.sin(t * 0.07)
            hr_freq = hr_bpm / 60.0
            phase = (t * hr_freq) % 1.0

            # ── Realistic PQRST ECG morphology
            ecg_val = 1500 + 8 * np.random.normal(0, 1)  # subtle baseline noise
            # P wave (atrial depol)
            if 0.0 < phase < 0.10:
                ecg_val += 60 * math.sin(phase / 0.10 * math.pi)
            # Q
            elif 0.13 < phase < 0.17:
                ecg_val -= 80 * math.sin((phase - 0.13) / 0.04 * math.pi)
            # R (sharp spike)
            elif 0.17 <= phase < 0.22:
                ecg_val += 900 * math.sin((phase - 0.17) / 0.05 * math.pi)
            # S
            elif 0.22 <= phase < 0.26:
                ecg_val -= 120 * math.sin((phase - 0.22) / 0.04 * math.pi)
            # T wave (ventricular repol)
            elif 0.38 < phase < 0.58:
                ecg_val += 160 * math.sin((phase - 0.38) / 0.20 * math.pi)
            # Breathing baseline wander
            ecg_val += 18 * breath

            # ── EMG: clean baseline, brief voluntary contractions
            emg_val = 1500 + np.random.normal(0, 8)
            # Slight muscle activity every ~5 seconds
            if (t % 5.0) < 0.8:
                ecg_frac = (t % 5.0) / 0.8
                emg_val += 280 * math.sin(ecg_frac * math.pi) * abs(np.random.normal(1, 0.15))

            # ── EEG: young healthy — dominant alpha, moderate beta
            eeg = {
                "alpha": float(np.clip(np.random.normal(36 + 4 * math.sin(t * 0.08), 1.5), 28, 48)),
                "beta":  float(np.clip(np.random.normal(19 + 2 * math.sin(t * 0.15), 1.2), 12, 28)),
                "theta": float(np.clip(np.random.normal(14 + 1.5 * math.sin(t * 0.05), 1.0), 8, 22)),
                "delta": float(np.clip(np.random.normal(18 + 3 * math.sin(t * 0.02), 1.5), 10, 28)),
            }

        else:
            # ── 40yo Adult: HR ~62 BPM, reduced HRV, wider QRS
            hr_bpm = 62 + 1.5 * breath + 0.8 * math.sin(t * 0.05)
            hr_freq = hr_bpm / 60.0
            phase = (t * hr_freq) % 1.0

            # ── Wider, slightly lower-amplitude PQRST
            ecg_val = 1500 + 14 * np.random.normal(0, 1)  # more baseline noise
            # P wave (wider)
            if 0.0 < phase < 0.14:
                ecg_val += 50 * math.sin(phase / 0.14 * math.pi)
            # Q
            elif 0.16 < phase < 0.21:
                ecg_val -= 65 * math.sin((phase - 0.16) / 0.05 * math.pi)
            # R (slightly lower peak)
            elif 0.21 <= phase < 0.28:
                ecg_val += 700 * math.sin((phase - 0.21) / 0.07 * math.pi)
            # S
            elif 0.28 <= phase < 0.33:
                ecg_val -= 100 * math.sin((phase - 0.28) / 0.05 * math.pi)
            # T wave (flatter, wider)
            elif 0.42 < phase < 0.66:
                ecg_val += 110 * math.sin((phase - 0.42) / 0.24 * math.pi)
            # More breathing wander
            ecg_val += 28 * breath

            # ── EMG: noisy baseline, weaker contractions
            emg_val = 1500 + np.random.normal(0, 22)
            if (t % 6.0) < 0.9:
                ecg_frac = (t % 6.0) / 0.9
                emg_val += 160 * math.sin(ecg_frac * math.pi) * abs(np.random.normal(1, 0.2))

            # ── EEG: more delta/theta, less alpha — mild stress
            eeg = {
                "alpha": float(np.clip(np.random.normal(21 + 2.5 * math.sin(t * 0.08), 1.5), 12, 32)),
                "beta":  float(np.clip(np.random.normal(24 + 3 * math.sin(t * 0.15), 1.5), 16, 36)),
                "theta": float(np.clip(np.random.normal(29 + 4 * math.sin(t * 0.05), 1.8), 20, 42)),
                "delta": float(np.clip(np.random.normal(38 + 5 * math.sin(t * 0.02), 2.0), 26, 55)),
            }

        data = {
            "ts": ts_millis,
            "ecg": int(ecg_val),
            "emg": int(emg_val),
            "leadOff": False,
            "device": "esp32_biofusion_simulated"
        }

        # Update buffers and broadcast
        esp32_data_cache.update(data)
        ECG_BUFFER.append(data["ecg"])
        EMG_BUFFER.append(data["emg"])
        EEG_BUFFER.append(eeg)

        frame = {
            "type":    "sensor_frame",
            "ts":      data["ts"],
            "ecg":     data["ecg"],
            "emg":     data["emg"],
            "eeg":     eeg,
            "leadOff": data["leadOff"],
        }

        dead_clients = []
        for client in dashboard_clients:
            try:
                await client.send_json(frame)
            except Exception:
                dead_clients.append(client)

        for dead in dead_clients:
            if dead in dashboard_clients:
                dashboard_clients.remove(dead)

        await asyncio.sleep(0.02)  # 50 Hz

