// Steel Strike target node — ESP32-C3 SuperMini, one per plate.
//
// Reads the piezo, flashes the plate's LEDs the instant a hit is detected, and sends the hit to the
// hub over ESP-NOW (with retries). Finds the hub by itself: an unpaired or lost node hops through
// Wi-Fi channels 1–13 broadcasting HELLO until the hub answers with ASSIGN.

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_timer.h>
#include <esp_wifi.h>

#include "config.h"
#include "detector.h"
#include "leds.h"
#include "now_proto.h"

static Preferences prefs;
static Detector detector;
static LedEngine leds;

static const uint8_t BCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
static uint8_t hubMac[6] = {0};
static bool paired = false;
static uint8_t myId = 0;
static uint8_t channel = 1;
static bool keepalive = true;
static bool monitorOn = false;

enum Mode : uint8_t { SEARCH, CONFIRM, ONLINE };
static Mode mode = SEARCH;
static uint32_t modeT = 0;
static uint32_t lastHubMsg = 0;

// Outbound queue with retries (hits and status reports).
struct Out {
  uint8_t data[24];
  uint8_t len;
  uint8_t tries;
  bool isHit;
  int64_t hitUs;
};
static Out outq[8];
static uint8_t outHead = 0, outCount = 0;
static volatile int sendResult = -1;  // -1 idle/pending, 0 fail, 1 ok
static bool inFlight = false;
static uint32_t inFlightAt = 0;
static uint32_t retryAt = 0;
static uint16_t hitSeq = 0;
static uint32_t linkBits = 0xFFFFF;  // last 20 packets: 1 = delivered on first try
static uint8_t linkN = 0;
static uint8_t failedPackets = 0;

static QueueHandle_t rxQ;
struct Rx {
  uint8_t mac[6];
  uint8_t len;
  uint8_t data[32];
};

/* ---------------------------------------------------------------- radio */

static void setChannel(uint8_t ch) {
  channel = ch;
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);
}

static void addPeer(const uint8_t* mac) {
  if (esp_now_is_peer_exist(mac)) esp_now_del_peer(mac);
  esp_now_peer_info_t p = {};
  memcpy(p.peer_addr, mac, 6);
  p.channel = 0;
  p.ifidx = WIFI_IF_STA;
  p.encrypt = false;
  esp_now_add_peer(&p);
}

#if ESP_ARDUINO_VERSION_MAJOR >= 3
static void onRecv(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
  const uint8_t* mac = info->src_addr;
#else
static void onRecv(const uint8_t* mac, const uint8_t* data, int len) {
#endif
  if (len < (int)sizeof(PktHeader) || len > 32 || data[0] != SS_MAGIC) return;
  Rx r;
  memcpy(r.mac, mac, 6);
  r.len = len;
  memcpy(r.data, data, len);
  xQueueSend(rxQ, &r, 0);
}

static void onSent(const uint8_t*, esp_now_send_status_t st) { sendResult = st == ESP_NOW_SEND_SUCCESS ? 1 : 0; }

static void sendHello(bool unicast) {
  PktHello p{};
  p.h = {SS_MAGIC, P_HELLO, myId};
  p.proto = SS_PROTO;
  p.paired = paired;
  esp_now_send(unicast ? hubMac : BCAST, (uint8_t*)&p, sizeof p);
}

static void enqueue(const void* pkt, uint8_t len, bool isHit, int64_t hitUs = 0) {
  if (outCount >= 8) {  // drop the oldest
    outHead = (outHead + 1) % 8;
    outCount--;
  }
  Out& o = outq[(outHead + outCount) % 8];
  memcpy(o.data, pkt, len);
  o.len = len;
  o.tries = 0;
  o.isHit = isHit;
  o.hitUs = hitUs;
  outCount++;
}

static void recordLink(bool firstTry) {
  linkBits = ((linkBits << 1) | (firstTry ? 1 : 0)) & 0xFFFFF;
  if (linkN < 20) linkN++;
}
static uint8_t linkPct() {
  uint8_t ones = __builtin_popcount(linkBits);
  return ones * 5;
}

static void pumpSend() {
  if (mode != ONLINE || !outCount) return;
  const uint32_t now = millis();
  if (inFlight) {
    if (sendResult == -1 && now - inFlightAt < 50) return;  // waiting for the MAC-level ack
    Out& o = outq[outHead];
    const bool ok = sendResult == 1;
    inFlight = false;
    sendResult = -1;
    if (ok) {
      recordLink(o.tries == 1);
      outHead = (outHead + 1) % 8;
      outCount--;
      failedPackets = 0;
      lastHubMsg = now;
      return;
    }
    if (o.tries >= 6) {
      recordLink(false);
      outHead = (outHead + 1) % 8;
      outCount--;
      if (++failedPackets >= 3) {  // hub gone or changed channel: go look for it
        mode = SEARCH;
        modeT = now;
      }
      return;
    }
    retryAt = now + 4 + o.tries * 3;
    return;
  }
  if (now < retryAt) return;
  Out& o = outq[outHead];
  if (o.isHit) ((PktHit*)o.data)->ageUs = (uint32_t)(esp_timer_get_time() - o.hitUs);
  o.tries++;
  sendResult = -1;
  inFlight = true;
  inFlightAt = now;
  if (esp_now_send(hubMac, o.data, o.len) != ESP_OK) sendResult = 0;
}

/* ---------------------------------------------------------------- persistence */

static void loadPrefs() {
  prefs.begin("ssn", false);
  paired = prefs.getBytes("hub", hubMac, 6) == 6;
  myId = prefs.getUChar("id", 0);
  channel = prefs.getUChar("ch", 1);
  keepalive = prefs.getBool("keep", true);
  detector.configure(0, prefs.getUShort("thr", SS_DEFAULT_THRESHOLD), prefs.getUShort("deb", SS_DEFAULT_DEBOUNCE_MS));
  if (!myId) paired = false;
}

static void forgetHub() {
  prefs.clear();
  paired = false;
  myId = 0;
  memset(hubMac, 0, 6);
  mode = SEARCH;
  modeT = millis();
  leds.setAll(255, 0, 255, LED_BLINK, 1500);
}

/* ---------------------------------------------------------------- detector callbacks */

static void onHit(const Hit& h) {
  leds.flash(0);
  leds.update();
  PktHit p{};
  p.h = {SS_MAGIC, P_HIT, myId};
  p.seq = ++hitSeq;
  p.amp = h.amp;
  enqueue(&p, sizeof p, true, h.tsUs);
}

static void onCal(uint8_t, CalStage st, uint16_t noise, uint16_t peak) {
  PktCalRes p{};
  p.h = {SS_MAGIC, P_CALRES, myId};
  p.stage = st;
  p.noise = noise;
  p.peak = peak;
  if (mode == ONLINE) esp_now_send(hubMac, (uint8_t*)&p, sizeof p);
}

/* ---------------------------------------------------------------- incoming */

static void handle(const Rx& r) {
  const PktHeader* h = (const PktHeader*)r.data;
  const bool fromHub = paired && !memcmp(r.mac, hubMac, 6);
  if (h->type == P_ASSIGN && r.len >= sizeof(PktAssign)) {
    if (paired && !fromHub) return;  // belongs to another hub
    const PktAssign* a = (const PktAssign*)r.data;
    memcpy(hubMac, r.mac, 6);
    addPeer(hubMac);
    myId = a->h.id;
    paired = true;
    if (a->channel && a->channel != channel) setChannel(a->channel);
    detector.configure(0, a->threshold, a->debounce);
    keepalive = a->keepalive;
    leds.setBrightness(a->brightness);
    prefs.putBytes("hub", hubMac, 6);
    prefs.putUChar("id", myId);
    prefs.putUChar("ch", channel);
    prefs.putUShort("thr", a->threshold);
    prefs.putUShort("deb", a->debounce);
    prefs.putBool("keep", keepalive);
    if (mode != ONLINE) leds.set(0, 0, 255, 0, LED_BLINK, 1200);  // green blink: found the hub
    mode = ONLINE;
    failedPackets = 0;
    lastHubMsg = millis();
    // Report status right away so the app shows the node online.
    PktStatus s{};
    s.h = {SS_MAGIC, P_STATUS, myId};
    s.linkPct = linkPct();
    enqueue(&s, sizeof s, false);
    return;
  }
  if (!fromHub) return;
  lastHubMsg = millis();
  switch (h->type) {
    case P_LED:
      if (r.len >= sizeof(PktLed)) {
        const PktLed* p = (const PktLed*)r.data;
        leds.set(0, p->r, p->g, p->b, (LedMode)p->mode, p->ms);
      }
      break;
    case P_CFG:
      if (r.len >= sizeof(PktCfg)) {
        const PktCfg* p = (const PktCfg*)r.data;
        detector.configure(0, p->threshold, p->debounce);
        prefs.putUShort("thr", p->threshold);
        prefs.putUShort("deb", p->debounce);
      }
      break;
    case P_CAL:
      detector.startCalibration(0);
      break;
    case P_MONITOR:
      if (r.len >= sizeof(PktFlag)) monitorOn = ((const PktFlag*)r.data)->on;
      break;
    case P_GLOBAL:
      if (r.len >= sizeof(PktGlobal)) {
        const PktGlobal* p = (const PktGlobal*)r.data;
        keepalive = p->keepalive;
        leds.setBrightness(p->brightness);
        prefs.putBool("keep", keepalive);
      }
      break;
    case P_FORGET:
      forgetHub();
      break;
    default:
      break;
  }
}

/* ---------------------------------------------------------------- housekeeping */

static uint16_t supplyMv() {
  uint32_t mv = analogReadMilliVolts(SS_NODE_SENSE_PIN) * 2;  // 100k/100k divider
  return (mv > 3500 && mv < 6000) ? mv : 0;                    // nothing fitted → 0
}

static void statusLed() {
  const uint32_t t = millis();
  bool on;
  if (mode == SEARCH) on = (t / 100) % 2;
  else if (mode == CONFIRM) on = (t / 250) % 2;
  else on = (t % 2000) < 40;
  digitalWrite(SS_STATUS_LED, SS_STATUS_ACTIVE_HIGH ? on : !on);
}

static void service() {
  const uint32_t t = millis();
  static uint32_t lastStatus = 0, lastLvl = 0, lastKeep = 0, btnDown = 0, lastHop = 0;

  Rx r;
  while (xQueueReceive(rxQ, &r, 0) == pdTRUE) handle(r);

  if (mode == SEARCH) {
    if (t - lastHop > 150) {
      lastHop = t;
      setChannel(channel % 13 + 1);
      sendHello(false);
    }
  } else if (mode == CONFIRM) {
    if (t - lastHop > 300) {
      lastHop = t;
      sendHello(true);
    }
    if (t - modeT > 1500) mode = SEARCH;
  } else {
    pumpSend();
    if (t - lastStatus > SS_STATUS_MS) {
      lastStatus = t;
      PktStatus s{};
      s.h = {SS_MAGIC, P_STATUS, myId};
      s.supplyMv = supplyMv();
      s.linkPct = linkPct();
      enqueue(&s, sizeof s, false);
    }
    if (monitorOn && t - lastLvl >= 100) {
      lastLvl = t;
      PktLevel p{};
      p.h = {SS_MAGIC, P_LEVEL, myId};
      p.level = detector.takeLevel(0);
      esp_now_send(hubMac, (uint8_t*)&p, sizeof p);  // best effort, no retry
    }
  }

  if (keepalive && !leds.anyOn() && t - lastKeep > SS_KEEPALIVE_MS) {
    lastKeep = t;
    leds.blip(0);
  }

  // BOOT held 5 s: forget the hub.
  if (digitalRead(SS_BUTTON_PIN) == LOW) {
    if (!btnDown) btnDown = t;
    if (t - btnDown > 5000) {
      btnDown = 0;
      forgetHub();
    }
  } else {
    btnDown = 0;
  }

  leds.update();
  statusLed();
}

void setup() {
  Serial.begin(115200);
  pinMode(SS_STATUS_LED, OUTPUT);
  pinMode(SS_BUTTON_PIN, INPUT_PULLUP);
  rxQ = xQueueCreate(16, sizeof(Rx));

  static const uint8_t pins[] = {SS_NODE_PIEZO_PIN};
  detector.begin(pins, 1, onHit, onCal);
  analogSetPinAttenuation(SS_NODE_SENSE_PIN, ADC_11db);
  leds.begin(SS_LED_PIN, 1, SS_LEDS_PER_TARGET);
  loadPrefs();

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_ps(WIFI_PS_NONE);  // keep listening for the hub
  if (esp_now_init() != ESP_OK) {
    Serial.println("# ESP-NOW init failed, restarting");
    delay(1000);
    ESP.restart();
  }
  esp_now_register_recv_cb(onRecv);
  esp_now_register_send_cb(onSent);
  addPeer(BCAST);
  if (paired) {
    addPeer(hubMac);
    setChannel(channel);
    mode = CONFIRM;  // try the last known hub/channel first
  } else {
    mode = SEARCH;
  }
  modeT = millis();
  leds.set(0, 255, 160, 0, LED_PULSE, 1500);  // amber pulse at power-up = alive
  Serial.printf("# Steel Strike node %s, %s, id %u\n", SS_FW_VERSION, paired ? "paired" : "unpaired", myId);
}

void loop() {
  // Sample in 20 ms bursts, then let the radio and idle tasks run for one tick.
  // A struck plate rings for far longer than the 1 ms gap, so no hit is missed.
  const uint32_t start = millis();
  while (millis() - start < 20) detector.sweep();
  service();
  vTaskDelay(1);
}
