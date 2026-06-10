"""
BioFusion AI — ESP32 Serial Reader
Handles COM port scanning and serial data parsing for ESP32 hardware
"""
import json
import threading
import time

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False


class ESP32Reader:
    """Reads biosignal data from ESP32 over serial."""

    def __init__(self):
        self.port = None
        self.baudrate = 115200
        self.serial_conn = None
        self.is_connected = False
        self.buffer = []
        self.read_thread = None
        self._stop_event = threading.Event()

    @staticmethod
    def scan_ports():
        """List available COM ports."""
        if not SERIAL_AVAILABLE:
            return []
        ports = serial.tools.list_ports.comports()
        return [
            {
                "port": p.device,
                "description": p.description,
                "manufacturer": p.manufacturer or "Unknown",
            }
            for p in ports
        ]

    def connect(self, port, baudrate=115200):
        """Connect to ESP32 on given port."""
        if not SERIAL_AVAILABLE:
            return {"success": False, "error": "pyserial not installed"}

        try:
            self.serial_conn = serial.Serial(port, baudrate, timeout=1)
            self.port = port
            self.baudrate = baudrate
            self.is_connected = True
            self._stop_event.clear()

            # Start read thread
            self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
            self.read_thread.start()

            return {"success": True, "port": port}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def disconnect(self):
        """Disconnect from ESP32."""
        self._stop_event.set()
        self.is_connected = False
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
        return {"success": True}

    def get_latest_data(self):
        """Get latest buffered data."""
        if self.buffer:
            data = self.buffer[-1]
            return data
        return None

    def _read_loop(self):
        """Background thread reading serial data."""
        while not self._stop_event.is_set() and self.serial_conn and self.serial_conn.is_open:
            try:
                line = self.serial_conn.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    try:
                        data = json.loads(line)
                        self.buffer.append(data)
                        # Keep only last 100 readings
                        if len(self.buffer) > 100:
                            self.buffer = self.buffer[-100:]
                    except json.JSONDecodeError:
                        # Try CSV format: ecg,emg,eeg
                        parts = line.split(',')
                        if len(parts) >= 3:
                            try:
                                data = {
                                    "ecg": float(parts[0]),
                                    "emg": float(parts[1]),
                                    "eeg": float(parts[2]),
                                }
                                self.buffer.append(data)
                                if len(self.buffer) > 100:
                                    self.buffer = self.buffer[-100:]
                            except ValueError:
                                pass
            except Exception:
                time.sleep(0.1)

    @property
    def status(self):
        return {
            "connected": self.is_connected,
            "port": self.port,
            "buffer_size": len(self.buffer),
        }
