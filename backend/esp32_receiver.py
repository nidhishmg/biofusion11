"""
BioFusion AI — ESP32 WebSocket Receiver
Accepts real-time sensor data from ESP32 hardware over WebSocket,
maintains rolling buffers, generates synthetic EEG, and broadcasts
unified frames to connected dashboard clients.
"""

import asyncio
import json
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


def generate_eeg_sample() -> dict:
    """
    Generate synthetic EEG band-power values.
    Uses sinusoidal noise models to simulate realistic EEG band activity.
    Replace with real EEG hardware values if a module becomes available.
    """
    t = datetime.now().timestamp()
    return {
        "alpha": float(np.clip(np.random.normal(25 + 5 * np.sin(t * 0.1), 3), 5, 50)),
        "beta":  float(np.clip(np.random.normal(15 + 3 * np.sin(t * 0.2), 2), 3, 35)),
        "theta": float(np.clip(np.random.normal(20 + 4 * np.sin(t * 0.05), 2.5), 5, 45)),
        "delta": float(np.clip(np.random.normal(30 + 8 * np.sin(t * 0.02), 4), 10, 60)),
    }


async def esp32_websocket_handler(websocket: WebSocket):
    """
    WebSocket endpoint that accepts data FROM the ESP32 device.
    Mounted at: /ws/esp32

    Expected JSON from ESP32:
        {"ts": <millis>, "ecg": <mV>, "emg": <mV>, "leadOff": <bool>, "device": "esp32_biofusion"}
    """
    await websocket.accept()
    print("[ESP32] Device connected via WebSocket")
    esp32_data_cache["connected"] = True

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            # Update latest cache
            esp32_data_cache.update(data)

            # Append to rolling buffers
            ECG_BUFFER.append(data.get("ecg", 0))
            EMG_BUFFER.append(data.get("emg", 0))

            # Generate simulated EEG for this frame
            eeg = generate_eeg_sample()
            EEG_BUFFER.append(eeg)

            # Build unified sensor frame for dashboard clients
            frame = {
                "type":    "sensor_frame",
                "ts":      data.get("ts", 0),
                "ecg":     data.get("ecg", 0),
                "emg":     data.get("emg", 0),
                "eeg":     eeg,
                "leadOff": data.get("leadOff", False),
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
