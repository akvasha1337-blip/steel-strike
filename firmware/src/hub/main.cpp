// Steel Strike hub firmware — ESP32 DevKit V1 (or S3).
//
// Talks to the browser over USB serial, Bluetooth LE and WebSocket (same line protocol on all three),
// serves the web app from LittleFS, receives hits from wireless target nodes over ESP-NOW and/or
// reads piezos wired straight to its ADC pins (SS_WIRED_TARGETS > 0).

#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h>
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <Update.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_timer.h>
#include <esp_wifi.h>

#include "config.h"
#include "detector.h"
#include "leds.h"
#include "now_proto.h"

/* ------------------------------------------------------------------ state */

struct Node {
  bool used = false;
  uint8_t mac[6] = {0};
  uint8_t id = 0;
  bool online = false;
  uint32_t lastSeen = 0;
  uint16_t supplyMv = 0;
  uint8_t link = 0;
  int8_t rssi = 0;
  bool hasRssi = false;
  int32_t lastSeq = -1;
  uint16_t threshold = SS_DEFAULT_THRESHOLD;
  uint16_t debounce = SS_DEFAULT_DEBOUNCE_MS;
};

static Node nodes[SS_MAX_TARGETS];
static Preferences prefs;
static Detector detector;
static LedEngine leds;
static AsyncWebServer server(80);
static AsyncWebSocket ws("/ws");
static DNSServer dns;
static NimBLECharacteristic* bleTx = nullptr;
static volatile bool bleConnected = false;
static uint16_t bleMtu = 23;

static String wifiSsid, wifiPass;
static bool apMode = false;
static bool monitorOn = false;
static bool keepalive = true;
static uint8_t brightness = SS_MAX_BRIGHTNESS;
static uint8_t crosstalkMs = SS_CROSSTALK_MS;
static bool armed = true;
static uint32_t armedMask = 0xFFFFFFFF;  // bit per target id
static uint32_t pairUntil = 0;
static volatile uint32_t restartAt = 0;
static uint32_t lastClientMs = 0;
static String deviceName;

// Output goes through one task so serial, BLE and WebSocket writes never interleave.
enum Dest : uint8_t { TO_SERIAL = 1, TO_BLE = 2, TO_WS = 4, TO_ALL = 7 };
struct OutMsg {
  char* text;
  uint8_t dest;
};
static QueueHandle_t outQ, cmdQ, hitQ, nowQ;

struct NowMsg {
  uint8_t mac[6];
  uint8_t len;
  int8_t rssi;
  bool hasRssi;
  uint8_t data[64];
};

/* ------------------------------------------------------------------ helpers */

static int64_t nowUs() { return esp_timer_get_time(); }

static void emitTo(uint8_t dest, const char* s) {
  OutMsg m{strdup(s), dest};
  if (!m.text) return;
  if (xQueueSend(outQ, &m, 0) != pdTRUE) free(m.text);
}
static void emit(const char* s) { emitTo(TO_ALL, s); }
static void emitDoc(JsonDocument& d, uint8_t dest = TO_ALL) {
  char buf[512];
  size_t n = serializeJson(d, buf, sizeof(buf));
  if (n && n < sizeof(buf)) emitTo(dest, buf);
}
static void logf(const char* fmt, ...) {
  char buf[200];
  buf[0] = '#';
  buf[1] = ' ';
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf + 2, sizeof(buf) - 2, fmt, ap);
  va_end(ap);
  emitTo(TO_SERIAL, buf);
}

static uint8_t wiredCount() { return min<uint8_t>(SS_WIRED_TARGETS, sizeof(WIRED_PIEZO_PINS)); }
static uint8_t targetCount() {
  uint8_t c = wiredCount();
  for (auto& n : nodes)
    if (n.used) c++;
  return c;
}
static Node* nodeById(uint8_t id) {
  for (auto& n : nodes)
    if (n.used && n.id == id) return &n;
  return nullptr;
}
static Node* nodeByMac(const uint8_t* mac) {
  for (auto& n : nodes)
    if (n.used && !memcmp(n.mac, mac, 6)) return &n;
  return nullptr;
}
static bool isWired(uint8_t id) { return id >= 1 && id <= wiredCount(); }

static wifi_interface_t nowIf() { return apMode ? WIFI_IF_AP : WIFI_IF_STA; }

static void ensurePeer(const uint8_t* mac) {
  if (esp_now_is_peer_exist(mac)) esp_now_del_peer(mac);
  esp_now_peer_info_t p = {};
  memcpy(p.peer_addr, mac, 6);
  p.channel = 0;  // current channel
  p.ifidx = nowIf();
  p.encrypt = false;
  esp_now_add_peer(&p);
}

template <typename T>
static void sendNode(const Node& n, T& pkt) {
  pkt.h.magic = SS_MAGIC;
  pkt.h.id = n.id;
  esp_now_send(n.mac, (uint8_t*)&pkt, sizeof(T));
}

/* ------------------------------------------------------------------ persistence */

static void saveNode(uint8_t slot) {
  char k[12];
  Node& n = nodes[slot];
  snprintf(k, sizeof k, "n%u", slot);
  if (!n.used) {
    prefs.remove(k);
    return;
  }
  uint8_t rec[11];
  memcpy(rec, n.mac, 6);
  rec[6] = n.id;
  rec[7] = n.threshold & 0xFF;
  rec[8] = n.threshold >> 8;
  rec[9] = n.debounce & 0xFF;
  rec[10] = n.debounce >> 8;
  prefs.putBytes(k, rec, sizeof rec);
}

static void loadState() {
  prefs.begin("ss", false);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  keepalive = prefs.getBool("keep", true);
  crosstalkMs = prefs.getUChar("xtalk", SS_CROSSTALK_MS);
  for (uint8_t i = 0; i < SS_MAX_TARGETS; i++) {
    char k[12];
    snprintf(k, sizeof k, "n%u", i);
    uint8_t rec[11];
    if (prefs.getBytes(k, rec, sizeof rec) == sizeof rec) {
      Node& n = nodes[i];
      n.used = true;
      memcpy(n.mac, rec, 6);
      n.id = rec[6];
      n.threshold = rec[7] | (rec[8] << 8);
      n.debounce = rec[9] | (rec[10] << 8);
    }
  }
  for (uint8_t i = 0; i < wiredCount(); i++) {
    char k[12];
    snprintf(k, sizeof k, "w%u", i);
    uint32_t v = prefs.getUInt(k, (SS_DEFAULT_DEBOUNCE_MS << 16) | SS_DEFAULT_THRESHOLD);
    detector.configure(i, v & 0xFFFF, v >> 16);
  }
}

static void saveWired(uint8_t ch) {
  char k[12];
  snprintf(k, sizeof k, "w%u", ch);
  prefs.putUInt(k, ((uint32_t)detector.debounce(ch) << 16) | detector.threshold(ch));
}

/* ------------------------------------------------------------------ events out */

static void emitNode(const Node& n) {
  JsonDocument d;
  d["t"] = "node";
  d["id"] = n.id;
  d["online"] = n.online;
  if (n.supplyMv) d["batt"] = n.supplyMv / 1000.0;
  d["link"] = n.link;
  if (n.hasRssi) d["rssi"] = n.rssi;
  char mac[18];
  snprintf(mac, sizeof mac, "%02X:%02X:%02X:%02X:%02X:%02X", n.mac[0], n.mac[1], n.mac[2], n.mac[3], n.mac[4], n.mac[5]);
  d["mac"] = mac;
  emitDoc(d);
}

static void emitWiredNode(uint8_t id) {
  JsonDocument d;
  d["t"] = "node";
  d["id"] = id;
  d["online"] = true;
  d["link"] = 100;
  emitDoc(d);
}

static void emitCfg(uint8_t id, uint16_t thr, uint16_t deb) {
  JsonDocument d;
  d["t"] = "cfg";
  d["id"] = id;
  d["threshold"] = thr;
  d["debounce"] = deb;
  emitDoc(d);
}

static void emitWifi() {
  JsonDocument d;
  d["t"] = "wifi";
  if (apMode) {
    d["mode"] = "ap";
    d["ip"] = WiFi.softAPIP().toString();
    d["ssid"] = deviceName;
  } else if (WiFi.status() == WL_CONNECTED) {
    d["mode"] = "sta";
    d["ip"] = WiFi.localIP().toString();
    d["ssid"] = WiFi.SSID();
  } else {
    d["mode"] = "off";
  }
  emitDoc(d);
}

static void emitHello() {
  JsonDocument d;
  d["t"] = "hello";
  d["fw"] = SS_FW_VERSION;
  d["layout"] = wiredCount() ? "hub" : "nodes";
  d["targets"] = targetCount();
  d["name"] = deviceName;
  d["mac"] = WiFi.macAddress();
  emitDoc(d);
  for (uint8_t id = 1; id <= wiredCount(); id++) {
    emitWiredNode(id);
    emitCfg(id, detector.threshold(id - 1), detector.debounce(id - 1));
  }
  for (auto& n : nodes)
    if (n.used) {
      emitNode(n);
      emitCfg(n.id, n.threshold, n.debounce);
    }
  emitWifi();
  JsonDocument p;
  p["t"] = "pair";
  p["open"] = millis() < pairUntil;
  emitDoc(p);
}

static void emitCal(uint8_t id, CalStage st, uint16_t noise, uint16_t peak) {
  static const char* names[] = {"", "noise", "strike", "done", "timeout"};
  JsonDocument d;
  d["t"] = "cal";
  d["id"] = id;
  d["stage"] = names[st];
  d["noise"] = noise;
  d["peak"] = peak;
  emitDoc(d);
}

/* ------------------------------------------------------------------ hits */

struct HitMsg {
  uint8_t id;
  uint16_t amp;
  int64_t tsUs;
};

static void onWiredHit(const Hit& h) {
  HitMsg m{(uint8_t)(h.ch + 1), h.amp, h.tsUs};
  xQueueSend(hitQ, &m, 0);
}
static void onWiredCal(uint8_t ch, CalStage st, uint16_t noise, uint16_t peak) { emitCal(ch + 1, st, noise, peak); }

static void publishHit(const HitMsg& h) {
  if (isWired(h.id)) leds.flash(h.id - 1);  // nodes flash themselves locally
  char buf[96];
  snprintf(buf, sizeof buf, "{\"t\":\"hit\",\"id\":%u,\"amp\":%u,\"ts\":%lld}", h.id, h.amp, (long long)h.tsUs);
  emit(buf);
}

// Groups hits that land within crosstalkMs and keeps the strongest: a strike on one plate
// can shake the stand and trip a neighbour's sensor.
static void hitTask(void*) {
  HitMsg first, other;
  for (;;) {
    if (xQueueReceive(hitQ, &first, portMAX_DELAY) != pdTRUE) continue;
    if (!armed || !(armedMask & (1UL << first.id))) continue;
    if (!crosstalkMs) {
      publishHit(first);
      continue;
    }
    HitMsg best = first;
    const TickType_t until = xTaskGetTickCount() + pdMS_TO_TICKS(crosstalkMs + 3);
    while (xTaskGetTickCount() < until) {
      if (xQueueReceive(hitQ, &other, until - xTaskGetTickCount()) != pdTRUE) break;
      if (llabs(other.tsUs - first.tsUs) > (int64_t)crosstalkMs * 1000) {
        xQueueSendToFront(hitQ, &other, 0);  // belongs to the next group
        break;
      }
      if (other.id == best.id) continue;
      logf("crosstalk: plate %u (%u) vs %u (%u)", best.id, best.amp, other.id, other.amp);
      if (other.amp > best.amp) best = other;
    }
    publishHit(best);
  }
}

/* ------------------------------------------------------------------ ESP-NOW */

#if ESP_ARDUINO_VERSION_MAJOR >= 3
static void onNowRecv(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
  const uint8_t* mac = info->src_addr;
  int8_t rssi = info->rx_ctrl ? info->rx_ctrl->rssi : 0;
  bool hasRssi = info->rx_ctrl != nullptr;
#else
static void onNowRecv(const uint8_t* mac, const uint8_t* data, int len) {
  int8_t rssi = 0;
  bool hasRssi = false;
#endif
  if (len < (int)sizeof(PktHeader) || len > 64 || data[0] != SS_MAGIC) return;
  NowMsg m;
  memcpy(m.mac, mac, 6);
  m.len = len;
  m.rssi = rssi;
  m.hasRssi = hasRssi;
  memcpy(m.data, data, len);
  xQueueSend(nowQ, &m, 0);
}

static void assignNode(Node& n) {
  ensurePeer(n.mac);
  PktAssign a{};
  a.h.type = P_ASSIGN;
  uint8_t ch = 1;
  wifi_second_chan_t sc;
  esp_wifi_get_channel(&ch, &sc);
  a.channel = ch;
  a.threshold = n.threshold;
  a.debounce = n.debounce;
  a.keepalive = keepalive;
  a.brightness = brightness;
  sendNode(n, a);
}

static void handleNow(const NowMsg& m) {
  const PktHeader* h = (const PktHeader*)m.data;
  Node* n = nodeByMac(m.mac);
  if (h->type == P_HELLO) {
    if (!n && millis() < pairUntil) {
      // New node: give it the lowest free id after the wired targets.
      for (uint8_t id = wiredCount() + 1; id <= SS_MAX_TARGETS && !n; id++) {
        if (nodeById(id)) continue;
        for (uint8_t s = 0; s < SS_MAX_TARGETS; s++)
          if (!nodes[s].used) {
            nodes[s] = Node();
            nodes[s].used = true;
            memcpy(nodes[s].mac, m.mac, 6);
            nodes[s].id = id;
            saveNode(s);
            n = &nodes[s];
            break;
          }
      }
      if (n) {
        pairUntil = 0;
        logf("paired new target %u", n->id);
        emit("{\"t\":\"pair\",\"open\":false}");
        emitHello();  // target count changed
      }
    }
    if (!n) {
      logf("unpaired target %02X:%02X:%02X:%02X:%02X:%02X seen — press Pair in the app", m.mac[0], m.mac[1], m.mac[2], m.mac[3], m.mac[4], m.mac[5]);
      return;
    }
    assignNode(*n);
  }
  if (!n) return;
  const bool wasOnline = n->online;
  n->online = true;
  n->lastSeen = millis();
  if (m.hasRssi) {
    n->rssi = m.rssi;
    n->hasRssi = true;
  }
  switch (h->type) {
    case P_HIT: {
      if (m.len < sizeof(PktHit)) break;
      const PktHit* p = (const PktHit*)m.data;
      if (p->seq == n->lastSeq) break;  // retry of a hit we already have
      n->lastSeq = p->seq;
      HitMsg hm{n->id, p->amp, nowUs() - (int64_t)p->ageUs - 1000};
      xQueueSend(hitQ, &hm, 0);
      break;
    }
    case P_STATUS: {
      if (m.len < sizeof(PktStatus)) break;
      const PktStatus* p = (const PktStatus*)m.data;
      n->supplyMv = p->supplyMv;
      n->link = p->linkPct;
      emitNode(*n);
      break;
    }
    case P_CALRES: {
      if (m.len < sizeof(PktCalRes)) break;
      const PktCalRes* p = (const PktCalRes*)m.data;
      emitCal(n->id, (CalStage)p->stage, p->noise, p->peak);
      break;
    }
    case P_LEVEL: {
      if (m.len < sizeof(PktLevel)) break;
      const PktLevel* p = (const PktLevel*)m.data;
      char buf[48];
      snprintf(buf, sizeof buf, "{\"t\":\"lvl\",\"id\":%u,\"v\":%u}", n->id, p->level);
      emit(buf);
      break;
    }
    default:
      break;
  }
  if (!wasOnline && h->type != P_STATUS) emitNode(*n);
}

static void nowTask(void*) {
  NowMsg m;
  for (;;)
    if (xQueueReceive(nowQ, &m, portMAX_DELAY) == pdTRUE) handleNow(m);
}

static void startNow() {
  if (esp_now_init() != ESP_OK) {
    logf("ESP-NOW init failed");
    return;
  }
  esp_now_register_recv_cb(onNowRecv);
  uint8_t bc[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  ensurePeer(bc);
  for (auto& n : nodes)
    if (n.used) ensurePeer(n.mac);
}

/* ------------------------------------------------------------------ commands */

static void setLed(uint8_t id, uint8_t r, uint8_t g, uint8_t b, LedMode mode, uint16_t ms) {
  if (isWired(id)) {
    leds.set(id - 1, r, g, b, mode, ms);
  } else if (Node* n = nodeById(id)) {
    PktLed p{};
    p.h.type = P_LED;
    p.r = r;
    p.g = g;
    p.b = b;
    p.mode = mode;
    p.ms = ms;
    sendNode(*n, p);
  }
}

static void handleCommand(const char* line) {
  JsonDocument d;
  if (deserializeJson(d, line)) return;
  const char* c = d["c"] | "";
  lastClientMs = millis();

  if (!strcmp(c, "ping")) {
    char buf[80];
    snprintf(buf, sizeof buf, "{\"t\":\"pong\",\"ts\":%lld,\"seq\":%d}", (long long)nowUs(), (int)(d["seq"] | 0));
    emit(buf);
  } else if (!strcmp(c, "hello")) {
    emitHello();
  } else if (!strcmp(c, "led") || !strcmp(c, "ledAll")) {
    uint8_t r = 0, g = 0, b = 0;
    parseColor(d["color"] | "#000000", r, g, b);
    LedMode mode = parseLedMode(d["mode"] | "solid");
    uint16_t ms = d["ms"] | 0;
    if (!strcmp(c, "led")) {
      setLed(d["id"] | 0, r, g, b, mode, ms);
    } else {
      leds.setAll(r, g, b, mode, ms);
      for (auto& n : nodes)
        if (n.used) setLed(n.id, r, g, b, mode, ms);
    }
  } else if (!strcmp(c, "arm")) {
    armed = true;
    armedMask = 0;
    for (JsonVariant v : d["ids"].as<JsonArray>()) armedMask |= 1UL << (v.as<int>() & 31);
    if (!armedMask) armedMask = 0xFFFFFFFF;
  } else if (!strcmp(c, "disarm")) {
    armed = false;
  } else if (!strcmp(c, "cfg")) {
    uint8_t id = d["id"] | 0;
    if (isWired(id)) {
      uint8_t ch = id - 1;
      detector.configure(ch, d["threshold"] | detector.threshold(ch), d["debounce"] | detector.debounce(ch));
      saveWired(ch);
      emitCfg(id, detector.threshold(ch), detector.debounce(ch));
    } else if (Node* n = nodeById(id)) {
      n->threshold = constrain((int)(d["threshold"] | n->threshold), 20, 4095);
      n->debounce = constrain((int)(d["debounce"] | n->debounce), 20, 2000);
      saveNode(n - nodes);
      PktCfg p{};
      p.h.type = P_CFG;
      p.threshold = n->threshold;
      p.debounce = n->debounce;
      sendNode(*n, p);
      emitCfg(id, n->threshold, n->debounce);
    }
  } else if (!strcmp(c, "global")) {
    if (d["keepalive"].is<bool>()) {
      keepalive = d["keepalive"];
      prefs.putBool("keep", keepalive);
    }
    if (d["crosstalkMs"].is<int>()) {
      crosstalkMs = constrain((int)d["crosstalkMs"], 0, 50);
      prefs.putUChar("xtalk", crosstalkMs);
    }
    if (d["brightness"].is<int>()) {
      brightness = constrain((int)d["brightness"], 10, SS_MAX_BRIGHTNESS);
      leds.setBrightness(brightness);
    }
    for (auto& n : nodes)
      if (n.used) {
        PktGlobal p{};
        p.h.type = P_GLOBAL;
        p.keepalive = keepalive;
        p.brightness = brightness;
        sendNode(n, p);
      }
  } else if (!strcmp(c, "calibrate")) {
    uint8_t id = d["id"] | 0;
    if (isWired(id))
      detector.startCalibration(id - 1);
    else if (Node* n = nodeById(id)) {
      PktHeader p{SS_MAGIC, P_CAL, n->id};
      esp_now_send(n->mac, (uint8_t*)&p, sizeof p);
    }
  } else if (!strcmp(c, "monitor")) {
    monitorOn = d["on"] | false;
    for (auto& n : nodes)
      if (n.used) {
        PktFlag p{};
        p.h.type = P_MONITOR;
        p.on = monitorOn;
        sendNode(n, p);
      }
  } else if (!strcmp(c, "wifi")) {
    wifiSsid = (const char*)(d["ssid"] | "");
    wifiPass = (const char*)(d["pass"] | "");
    prefs.putString("ssid", wifiSsid);
    prefs.putString("pass", wifiPass);
    logf("Wi-Fi saved, restarting to join %s", wifiSsid.c_str());
    restartAt = millis() + 800;
  } else if (!strcmp(c, "pair")) {
    pairUntil = millis() + (uint32_t)(d["secs"] | SS_PAIR_WINDOW_S) * 1000;
    JsonDocument p;
    p["t"] = "pair";
    p["open"] = true;
    p["secs"] = d["secs"] | SS_PAIR_WINDOW_S;
    emitDoc(p);
  } else if (!strcmp(c, "unpair")) {
    if (Node* n = nodeById(d["id"] | 0)) {
      PktHeader p{SS_MAGIC, P_FORGET, n->id};
      esp_now_send(n->mac, (uint8_t*)&p, sizeof p);
      esp_now_del_peer(n->mac);
      n->used = false;
      saveNode(n - nodes);
      emitHello();
    }
  } else if (!strcmp(c, "relay")) {
    // Spectator scoreboard: only WebSocket clients need it.
    JsonDocument o;
    o["t"] = "relay";
    o["d"] = d["d"];
    String s;
    serializeJson(o, s);
    emitTo(TO_WS, s.c_str());
  } else if (!strcmp(c, "reboot")) {
    restartAt = millis() + 300;
  }
}

static void queueCommand(const char* data, size_t len) {
  if (!len || len > 1500) return;
  char* s = (char*)malloc(len + 1);
  if (!s) return;
  memcpy(s, data, len);
  s[len] = 0;
  if (xQueueSend(cmdQ, &s, 0) != pdTRUE) free(s);
}

static void cmdTask(void*) {
  char* s;
  for (;;)
    if (xQueueReceive(cmdQ, &s, portMAX_DELAY) == pdTRUE) {
      handleCommand(s);
      free(s);
    }
}

/* ------------------------------------------------------------------ transports */

static void outTask(void*) {
  OutMsg m;
  for (;;) {
    if (xQueueReceive(outQ, &m, portMAX_DELAY) != pdTRUE) continue;
    const size_t len = strlen(m.text);
    if (m.dest & TO_SERIAL) {
      Serial.write((const uint8_t*)m.text, len);
      Serial.write('\n');
    }
    if (m.text[0] != '#') {
      if ((m.dest & TO_WS) && ws.count()) ws.textAll(m.text, len);
      if ((m.dest & TO_BLE) && bleConnected && bleTx) {
        const size_t chunk = max<int>(20, min<int>(bleMtu - 3, 180));
        String line = String(m.text) + "\n";
        for (size_t i = 0; i < line.length(); i += chunk) {
          size_t n = min(chunk, line.length() - i);
          bleTx->setValue((const uint8_t*)line.c_str() + i, n);
          bleTx->notify();
          if (line.length() > chunk) vTaskDelay(pdMS_TO_TICKS(4));
        }
      }
    }
    free(m.text);
  }
}

static void serialTask(void*) {
  static char line[1600];
  size_t n = 0;
  for (;;) {
    while (Serial.available()) {
      char ch = Serial.read();
      if (ch == '\n' || ch == '\r') {
        if (n) queueCommand(line, n);
        n = 0;
      } else if (n < sizeof(line) - 1) {
        line[n++] = ch;
      } else {
        n = 0;  // overlong garbage
      }
    }
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

class BleServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, ble_gap_conn_desc* desc) override {
    bleConnected = true;
    bleMtu = s->getPeerMTU(desc->conn_handle);
    logf("BLE client connected (MTU %u)", bleMtu);
  }
  void onDisconnect(NimBLEServer*) override {
    bleConnected = false;
    logf("BLE client disconnected");
  }
  void onMTUChange(uint16_t mtu, ble_gap_conn_desc*) override { bleMtu = mtu; }
};

class BleRxCb : public NimBLECharacteristicCallbacks {
  String buf;
  void onWrite(NimBLECharacteristic* c) override {
    NimBLEAttValue v = c->getValue();
    for (size_t i = 0; i < v.length(); i++) {
      char ch = (char)v.data()[i];
      if (ch == '\n') {
        queueCommand(buf.c_str(), buf.length());
        buf = "";
      } else if (buf.length() < 1500) {
        buf += ch;
      }
    }
  }
};

static void startBle() {
  NimBLEDevice::init(deviceName.c_str());
  NimBLEDevice::setMTU(247);
  NimBLEServer* srv = NimBLEDevice::createServer();
  srv->setCallbacks(new BleServerCb());
  srv->advertiseOnDisconnect(true);
  NimBLEService* svc = srv->createService(SS_BLE_SERVICE);
  bleTx = svc->createCharacteristic(SS_BLE_TX, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* rx = svc->createCharacteristic(SS_BLE_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new BleRxCb());
  svc->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SS_BLE_SERVICE);
  adv->setScanResponse(true);
  adv->start();
}

static void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    logf("WebSocket client %u connected", client->id());
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (!info->final || info->index != 0 || info->len != len || info->opcode != WS_TEXT) return;
    // A frame may carry one or more newline-separated commands.
    size_t start = 0;
    for (size_t i = 0; i <= len; i++)
      if (i == len || data[i] == '\n') {
        if (i > start) queueCommand((const char*)data + start, i - start);
        start = i + 1;
      }
  }
}

static void startWeb() {
  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.on("/update", HTTP_POST,
    [](AsyncWebServerRequest* r) {
      const bool ok = !Update.hasError();
      AsyncWebServerResponse* res = r->beginResponse(ok ? 200 : 500, "text/plain", ok ? "OK" : Update.errorString());
      res->addHeader("Access-Control-Allow-Origin", "*");
      r->send(res);
      if (ok) restartAt = millis() + 800;
    },
    [](AsyncWebServerRequest* r, String, size_t index, uint8_t* data, size_t len, bool final) {
      if (!index) {
        const bool fs = r->hasParam("fs");
        logf("OTA start (%s)", fs ? "web app" : "firmware");
        if (fs) LittleFS.end();
        Update.begin(UPDATE_SIZE_UNKNOWN, fs ? U_SPIFFS : U_FLASH);
      }
      if (Update.write(data, len) != len) logf("OTA write error");
      if (final) logf(Update.end(true) ? "OTA done" : "OTA failed");
    });
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("no-cache");
  server.onNotFound([](AsyncWebServerRequest* r) {
    // Captive portal: send any unknown URL to the app.
    if (apMode || r->method() == HTTP_GET)
      r->redirect("http://" + (apMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + "/");
    else
      r->send(404, "text/plain", "Not found");
  });
  server.begin();
}

/* ------------------------------------------------------------------ Wi-Fi */

static void startAp() {
  apMode = true;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(deviceName.c_str(), "steelstrike", SS_AP_CHANNEL, 0, 4);
  dns.start(53, "*", WiFi.softAPIP());
  logf("Access point %s, password steelstrike, open http://%s", deviceName.c_str(), WiFi.softAPIP().toString().c_str());
}

static void startWifi() {
  WiFi.persistent(false);
  // Modem sleep must stay on: with Bluetooth also running, the ESP32 radio coexistence code
  // aborts in esp_bt_controller_enable() if Wi-Fi power save is off (WIFI_PS_NONE).
  // ESP-NOW still works; nodes retry the rare packet that lands in a sleep window.
  WiFi.setSleep(true);
  if (wifiSsid.length()) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
    logf("joining %s…", wifiSsid.c_str());
    const uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < SS_WIFI_JOIN_MS) {
#if SS_STATUS_LED >= 0
      digitalWrite(SS_STATUS_LED, (millis() / 100) % 2);
#endif
      delay(50);
    }
  }
  if (WiFi.status() == WL_CONNECTED) {
    apMode = false;
    WiFi.setAutoReconnect(true);
    logf("on Wi-Fi %s at http://%s (http://steelstrike.local)", wifiSsid.c_str(), WiFi.localIP().toString().c_str());
  } else {
    startAp();
  }
  if (MDNS.begin("steelstrike")) MDNS.addService("http", "tcp", 80);
}

/* ------------------------------------------------------------------ housekeeping */

static void statusLed() {
#if SS_STATUS_LED >= 0
  const uint32_t t = millis();
  bool on;
  const bool client = bleConnected || ws.count() || (t - lastClientMs < 5000);
  if (millis() < pairUntil) on = (t / 120) % 2;                       // fast: pairing
  else if (client) on = (t % 2000) < 80;                              // short blip: in use
  else if (apMode) on = (t % 1500) < 100 || ((t % 1500) > 250 && (t % 1500) < 350);  // double blink: own network
  else on = (t % 1000) < 500;                                         // slow: waiting for the app
  digitalWrite(SS_STATUS_LED, SS_STATUS_ACTIVE_HIGH ? on : !on);
#endif
}

static void serviceTask(void*) {
  uint32_t lastHb = 0, lastLvl = 0, lastNodeCheck = 0, pairWasOpen = 0;
  for (;;) {
    const uint32_t t = millis();
    if (apMode) dns.processNextRequest();
    if (t - lastHb >= 1000) {
      lastHb = t;
      char buf[48];
      snprintf(buf, sizeof buf, "{\"t\":\"hb\",\"ts\":%lld}", (long long)nowUs());
      emit(buf);
      ws.cleanupClients();
    }
    if (monitorOn && t - lastLvl >= 100) {
      lastLvl = t;
      for (uint8_t ch = 0; ch < wiredCount(); ch++) {
        char buf[48];
        snprintf(buf, sizeof buf, "{\"t\":\"lvl\",\"id\":%u,\"v\":%u}", ch + 1, detector.takeLevel(ch));
        emit(buf);
      }
    }
    if (t - lastNodeCheck >= 1000) {
      lastNodeCheck = t;
      for (auto& n : nodes)
        if (n.used && n.online && t - n.lastSeen > SS_NODE_OFFLINE_MS) {
          n.online = false;
          emitNode(n);
        }
      if (pairWasOpen && t >= pairUntil) {
        pairWasOpen = 0;
        emit("{\"t\":\"pair\",\"open\":false}");
      } else if (t < pairUntil) {
        pairWasOpen = 1;
      }
    }
    leds.update();
    statusLed();
    if (restartAt && t > restartAt) ESP.restart();
    vTaskDelay(pdMS_TO_TICKS(15));
  }
}

/* ------------------------------------------------------------------ setup / loop */

void setup() {
  Serial.setRxBufferSize(2048);
  Serial.begin(115200);
#if SS_STATUS_LED >= 0
  pinMode(SS_STATUS_LED, OUTPUT);
  digitalWrite(SS_STATUS_LED, SS_STATUS_ACTIVE_HIGH);
#endif
  pinMode(SS_BUTTON_PIN, INPUT_PULLUP);

  outQ = xQueueCreate(64, sizeof(OutMsg));
  cmdQ = xQueueCreate(32, sizeof(char*));
  hitQ = xQueueCreate(32, sizeof(HitMsg));
  nowQ = xQueueCreate(32, sizeof(NowMsg));
  xTaskCreatePinnedToCore(outTask, "out", 6144, nullptr, 3, nullptr, 0);

  uint8_t mac[6];
  WiFi.macAddress(mac);
  char name[24];
  snprintf(name, sizeof name, "SteelStrike-%02X%02X", mac[4], mac[5]);
  deviceName = name;

  if (wiredCount()) {
    detector.begin(WIRED_PIEZO_PINS, wiredCount(), onWiredHit, onWiredCal);
    leds.begin(SS_LED_PIN, wiredCount(), SS_LEDS_PER_TARGET);
  }
  loadState();
  logf("Steel Strike hub %s, %u wired target(s)", SS_FW_VERSION, wiredCount());

  // USB works straight away, even while Wi-Fi is still trying to join (up to 15 s).
  xTaskCreatePinnedToCore(cmdTask, "cmd", 8192, nullptr, 2, nullptr, 0);
  xTaskCreatePinnedToCore(hitTask, "hit", 4096, nullptr, 4, nullptr, 0);
  xTaskCreatePinnedToCore(serialTask, "ser", 4096, nullptr, 2, nullptr, 0);
  emitHello();

  if (!LittleFS.begin(true)) logf("LittleFS mount failed — web app not available over Wi-Fi");
  startWifi();
  startNow();
  startWeb();
  esp_wifi_set_ps(WIFI_PS_MIN_MODEM);  // see startWifi(): required before BLE starts
  startBle();

  xTaskCreatePinnedToCore(nowTask, "now", 6144, nullptr, 3, nullptr, 0);
  xTaskCreatePinnedToCore(serviceTask, "svc", 6144, nullptr, 1, nullptr, 0);
  emitHello();
}

void loop() {
  // Core 1 is dedicated to sampling wired piezos (~8 kHz per channel with six channels).
  if (wiredCount()) {
    const uint32_t start = millis();
    while (millis() - start < 50) detector.sweep();
    yield();
  } else {
    delay(20);
  }
}
