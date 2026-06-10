"""
BioFusion AI — FastAPI Entry Point
"""
import os
import sys
import json
import asyncio
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from core.ecg_model import ECGModel
from core.emg_model import EMGModel
from core.eeg_model import EEGModel
from core.fusion import FusionEngine
from core.reader import ESP32Reader
from routers import upload, analysis, hardware, ai_insights

# ESP32 WebSocket receiver and live inference
from esp32_receiver import (
    esp32_websocket_handler,
    dashboard_websocket_handler,
    get_ecg_buffer, get_emg_buffer, get_eeg_buffer,
    is_esp32_connected,
)
import live_inference


# Global model instances
ecg_model = ECGModel()
emg_model = EMGModel()
eeg_model = EEGModel()
fusion_engine = FusionEngine()
esp32_reader = ESP32Reader()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models on startup."""
    print("=" * 50)
    print("  BioFusion AI — Starting Up")
    print("=" * 50)

    ecg_model.load()
    emg_model.load()
    eeg_model.load()

    # Inject models into analysis router
    analysis.set_models(ecg_model, emg_model, eeg_model, fusion_engine)
    hardware.set_reader(esp32_reader)

    # Inject models into live inference module (for ESP32 real-time analysis)
    live_inference.set_models(ecg_model, emg_model, eeg_model, fusion_engine)

    print("[OK] All models loaded. Server ready.")
    yield
    print("BioFusion AI — Shutting down")


app = FastAPI(
    title="BioFusion AI",
    description="Multimodal Biosignal Analysis Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(upload.router, prefix="/api/upload")
app.include_router(analysis.router, prefix="/api/analysis")
app.include_router(hardware.router, prefix="/api/hardware")
app.include_router(ai_insights.router, prefix="/api/ai")


@app.get("/")
async def root():
    return {
        "name": "BioFusion AI",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "upload": "/api/upload",
            "analysis": "/api/analysis",
            "hardware": "/api/hardware",
            "ai": "/api/ai",
            "websocket": "/ws/stream",
            "esp32_ws": "/ws/esp32",
            "dashboard_ws": "/ws/dashboard",
            "inference": "/api/inference",
            "sensor_buffers": "/api/sensor/buffers",
        },
    }


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "models": {
            "ecg": ecg_model.loaded,
            "emg": emg_model.loaded,
            "eeg": eeg_model.loaded,
        },
        "hardware": esp32_reader.status,
        "esp32_ws": is_esp32_connected(),
    }


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time hardware data streaming."""
    await websocket.accept()

    try:
        while True:
            if esp32_reader.is_connected:
                data = esp32_reader.get_latest_data()
                if data:
                    await websocket.send_json(data)
            else:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat", "status": "waiting"})

            await asyncio.sleep(0.1)  # 10 Hz update
    except WebSocketDisconnect:
        print("[WS] Client disconnected")
    except Exception as e:
        print(f"[WS] Error: {e}")


# ─── ESP32 WebSocket Endpoints ─────────────────────────────

@app.websocket("/ws/esp32")
async def esp32_ws(websocket: WebSocket):
    """WebSocket endpoint for ESP32 device to send sensor data."""
    await esp32_websocket_handler(websocket)


@app.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    """WebSocket endpoint for dashboard clients to receive live sensor data."""
    await dashboard_websocket_handler(websocket)


# ─── Live Inference REST Endpoints ─────────────────────────

@app.get("/api/inference")
async def run_inference():
    """Run all ML classifiers on current ESP32 sensor buffers and return fused results."""
    return live_inference.run_live_inference()


@app.get("/api/sensor/buffers")
async def get_sensor_buffers():
    """Return raw rolling buffer arrays from ESP32 sensors."""
    return {
        "ecg": get_ecg_buffer(),
        "emg": get_emg_buffer(),
        "eeg": get_eeg_buffer(),
        "esp32_connected": is_esp32_connected(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
