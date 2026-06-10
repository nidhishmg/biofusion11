"""
BioFusion AI — Hardware Router
ESP32 serial connection endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(tags=["Hardware"])

_reader = None


def set_reader(reader):
    global _reader
    _reader = reader


class ConnectRequest(BaseModel):
    port: str
    baudrate: Optional[int] = 115200


@router.get("/ports")
async def list_ports():
    """Scan and list available COM ports."""
    from core.reader import ESP32Reader
    ports = ESP32Reader.scan_ports()
    return {"ports": ports}


@router.post("/connect")
async def connect(request: ConnectRequest):
    """Connect to ESP32 on given port."""
    if _reader is None:
        raise HTTPException(status_code=500, detail="Hardware reader not initialized")

    result = _reader.connect(request.port, request.baudrate)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))
    return result


@router.post("/disconnect")
async def disconnect():
    """Disconnect from ESP32."""
    if _reader is None:
        raise HTTPException(status_code=500, detail="Hardware reader not initialized")
    return _reader.disconnect()


@router.get("/status")
async def hardware_status():
    """Get hardware connection status."""
    if _reader is None:
        return {"connected": False, "port": None, "buffer_size": 0}
    return _reader.status


@router.get("/data")
async def get_data():
    """Get latest data from hardware buffer."""
    if _reader is None or not _reader.is_connected:
        raise HTTPException(status_code=400, detail="Not connected to hardware")

    data = _reader.get_latest_data()
    if data is None:
        return {"data": None, "message": "No data yet"}
    return {"data": data}
