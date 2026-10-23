#include "leds.h"

LedMode parseLedMode(const char* s) {
  if (!s) return LED_SOLID;
  if (!strcmp(s, "off")) return LED_OFF;
  if (!strcmp(s, "blink")) return LED_BLINK;
  if (!strcmp(s, "pulse")) return LED_PULSE;
  return LED_SOLID;
}

bool parseColor(const char* hex, uint8_t& r, uint8_t& g, uint8_t& b) {
  if (!hex) return false;
  if (*hex == '#') hex++;
  if (strlen(hex) != 6) return false;
  uint32_t v = strtoul(hex, nullptr, 16);
  r = (v >> 16) & 0xFF;
  g = (v >> 8) & 0xFF;
  b = v & 0xFF;
  return true;
}

void LedEngine::begin(uint8_t pin, uint8_t segments, uint8_t perSegment) {
  nSeg = segments > SS_MAX_TARGETS ? SS_MAX_TARGETS : segments;
  per = perSegment;
  strip = new Adafruit_NeoPixel(nSeg * per, pin, NEO_GRB + NEO_KHZ800);
  strip->begin();
  strip->clear();
  strip->show();
}

void LedEngine::set(uint8_t seg, uint8_t r, uint8_t g, uint8_t b, LedMode mode, uint16_t ms) {
  if (seg >= nSeg) return;
  Seg& s = segs[seg];
  s.r = r;
  s.g = g;
  s.b = b;
  s.mode = (r | g | b) ? mode : LED_OFF;
  s.until = ms ? millis() + ms : 0;
  dirty = true;
}

void LedEngine::setAll(uint8_t r, uint8_t g, uint8_t b, LedMode mode, uint16_t ms) {
  for (uint8_t i = 0; i < nSeg; i++) set(i, r, g, b, mode, ms);
}

void LedEngine::flash(uint8_t seg) {
  if (seg >= nSeg) return;
  segs[seg].flashUntil = millis() + SS_HIT_FLASH_MS;
  dirty = true;  // the owner task calls update(); never touch the strip from two tasks
}

void LedEngine::blip(uint8_t seg) {
  if (seg >= nSeg) return;
  segs[seg].blipUntil = millis() + 150;
  dirty = true;
}

bool LedEngine::anyOn() const {
  for (uint8_t i = 0; i < nSeg; i++)
    if (segs[i].mode != LED_OFF) return true;
  return false;
}

static inline uint8_t scale(uint8_t c, uint16_t k) { return (uint16_t)c * k / 255; }

void LedEngine::update() {
  if (!strip) return;
  const uint32_t now = millis();
  bool animate = false;
  for (uint8_t i = 0; i < nSeg; i++) {
    Seg& s = segs[i];
    if (s.until && now >= s.until) {
      s.mode = LED_OFF;
      s.until = 0;
      dirty = true;
    }
    if (s.mode == LED_BLINK || s.mode == LED_PULSE || s.flashUntil > now || s.blipUntil > now) animate = true;
    if ((s.flashUntil && now >= s.flashUntil) || (s.blipUntil && now >= s.blipUntil)) {
      s.flashUntil = s.flashUntil > now ? s.flashUntil : 0;
      s.blipUntil = s.blipUntil > now ? s.blipUntil : 0;
      dirty = true;
    }
  }
  if (!dirty && !animate) return;
  dirty = false;
  for (uint8_t i = 0; i < nSeg; i++) {
    Seg& s = segs[i];
    uint8_t r = 0, g = 0, b = 0;
    uint16_t k = maxB;
    if (s.flashUntil > now) {
      r = g = b = 255;  // hit flash: white at max allowed brightness
    } else {
      switch (s.mode) {
        case LED_SOLID:
          r = s.r; g = s.g; b = s.b;
          break;
        case LED_BLINK:
          if ((now / 250) % 2 == 0) { r = s.r; g = s.g; b = s.b; }
          break;
        case LED_PULSE: {
          uint16_t ph = (now / 4) % 512;
          uint16_t tri = ph < 256 ? ph : 511 - ph;
          k = (uint32_t)maxB * (40 + tri * 215 / 255) / 255;
          r = s.r; g = s.g; b = s.b;
          break;
        }
        default:
          if (s.blipUntil > now) { r = g = b = 255; k = 12; }
          break;
      }
    }
    uint32_t c = strip->Color(scale(r, k), scale(g, k), scale(b, k));
    for (uint8_t j = 0; j < per; j++) strip->setPixelColor(i * per + j, c);
  }
  strip->show();
}
