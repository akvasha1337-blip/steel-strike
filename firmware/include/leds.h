#pragma once
#include <Adafruit_NeoPixel.h>
#include "config.h"

enum LedMode : uint8_t { LED_OFF = 0, LED_SOLID = 1, LED_BLINK = 2, LED_PULSE = 3 };

LedMode parseLedMode(const char* s);
bool parseColor(const char* hex, uint8_t& r, uint8_t& g, uint8_t& b);

/**
 * Drives one WS2812B strip split into equal segments, one per target.
 * Each segment has a base state (set by the app) plus a short hit flash on top.
 */
class LedEngine {
 public:
  void begin(uint8_t pin, uint8_t segments, uint8_t perSegment);
  void set(uint8_t seg, uint8_t r, uint8_t g, uint8_t b, LedMode mode, uint16_t ms);
  void setAll(uint8_t r, uint8_t g, uint8_t b, LedMode mode, uint16_t ms);
  void flash(uint8_t seg);       // instant white hit flash
  void blip(uint8_t seg);        // dim keep-alive blip
  void setBrightness(uint8_t b) { maxB = b > SS_MAX_BRIGHTNESS ? SS_MAX_BRIGHTNESS : b; }
  bool anyOn() const;
  void update();                 // call at ~50 Hz
 private:
  struct Seg {
    uint8_t r, g, b;
    LedMode mode;
    uint32_t until;   // 0 = forever
    uint32_t flashUntil;
    uint32_t blipUntil;
  };
  Adafruit_NeoPixel* strip = nullptr;
  Seg segs[SS_MAX_TARGETS] = {};
  uint8_t nSeg = 0, per = 0;
  uint8_t maxB = SS_MAX_BRIGHTNESS;
  bool dirty = true;
};
