/*
 * BioFusion AI — ESP32 Firmware
 * Reads AD8232 ECG + EMG sensors, streams via WebSocket to backend.
 *
 * Hardware:
 *   AD8232 ECG  → GPIO34 (OUTPUT), GPIO32 (LO-), GPIO33 (LO+)
 *   EMG Module  → GPIO35 (SIG)
 *
 * Libraries required (install via Arduino IDE Library Manager):
 *   - WebSockets by Markus Sattler
 *   - ArduinoJson by Benoit Blanchon
 *
 * Board: ESP32 Dev Module | Upload Speed: 921600
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ─── CONFIG ───────────────────────────────────────────────
const char* SSID       = "M's 9 pro";
const char* PASSWORD   = "c2ys4kkk";
const char* WS_HOST    = "10.134.110.6";  // Your PC's local IP (run ipconfig)
const int   WS_PORT    = 8000;             // Must match backend port
const char* WS_PATH    = "/ws/esp32";      // Backend WebSocket endpoint

// ─── PINS ─────────────────────────────────────────────────
#define ECG_PIN   34   // AD8232 OUTPUT  (ADC1_CH6)
#define EMG_PIN   35   // EMG SIG        (ADC1_CH7)
#define LO_MINUS  32   // AD8232 LO-     (lead-off detection)
#define LO_PLUS   33   // AD8232 LO+     (lead-off detection)

// ─── SAMPLING ─────────────────────────────────────────────
#define SEND_INTERVAL_MS  20   // Send every 20ms = 50 packets/sec
#define ADC_SAMPLES       4    // Average N readings for noise reduction

WebSocketsClient webSocket;
unsigned long lastSend = 0;
bool wsConnected = false;

// ─── WebSocket Event Handler ──────────────────────────────
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("[WS] Connected to BioFusion AI backend");
      wsConnected = true;
      break;

    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from backend");
      wsConnected = false;
      break;

    case WStype_TEXT:
      // Backend can send commands (future use)
      Serial.printf("[WS] Received: %s\n", payload);
      break;

    case WStype_ERROR:
      Serial.println("[WS] Error occurred");
      wsConnected = false;
      break;

    default:
      break;
  }
}

// ─── SETUP ────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println();
  Serial.println("========================================");
  Serial.println("  BioFusion AI — ESP32 Sensor Module");
  Serial.println("========================================");

  // Configure ADC
  analogReadResolution(12);          // 12-bit ADC: 0–4095
  analogSetAttenuation(ADC_11db);    // Full 0–3.3V range

  // Configure lead-off detection pins
  pinMode(LO_MINUS, INPUT);
  pinMode(LO_PLUS,  INPUT);

  // Connect to WiFi
  WiFi.begin(SSID, PASSWORD);
  Serial.print("[WiFi] Connecting");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[WiFi] Connected! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("[WiFi] FAILED to connect. Check SSID/PASSWORD.");
    Serial.println("[WiFi] Continuing in serial-only mode...");
  }

  // Initialize WebSocket connection to backend
  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);  // Auto-reconnect every 3s

  Serial.println("[OK] Setup complete. Streaming sensor data...");
  Serial.println();
}

// ─── MAIN LOOP ────────────────────────────────────────────
void loop() {
  webSocket.loop();

  unsigned long now = millis();
  if (now - lastSend < SEND_INTERVAL_MS) return;
  lastSend = now;

  // ── Lead-off detection ──
  bool leadOff = digitalRead(LO_MINUS) || digitalRead(LO_PLUS);

  // ── Read sensors (average N samples for noise reduction) ──
  long ecgSum = 0, emgSum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    ecgSum += analogRead(ECG_PIN);
    emgSum += analogRead(EMG_PIN);
    delayMicroseconds(100);
  }
  int ecgRaw = ecgSum / ADC_SAMPLES;
  int emgRaw = emgSum / ADC_SAMPLES;

  // ── Convert to millivolts (3300mV full scale / 4095 steps) ──
  float ecgMv = (ecgRaw / 4095.0) * 3300.0;
  float emgMv = (emgRaw / 4095.0) * 3300.0;

  // ── Build JSON payload ──
  StaticJsonDocument<256> doc;
  doc["ts"]       = now;
  doc["ecg"]      = ecgMv;
  doc["emg"]      = emgMv;
  doc["leadOff"]  = leadOff;
  doc["device"]   = "esp32_biofusion";

  String payload;
  serializeJson(doc, payload);

  // ── Send via WebSocket (if connected) ──
  if (wsConnected) {
    webSocket.sendTXT(payload);
  }

  // ── Always print to Serial for debugging ──
  Serial.println(payload);
}
