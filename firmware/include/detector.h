#pragma once
#include "config.h"

/** One detected strike. */
struct Hit {
  uint8_t ch;
  uint16_t amp;
  int64_t tsUs;  // esp_timer time when the threshold was crossed
};

enum CalStage : uint8_t { CAL_NONE = 0, CAL_NOISE = 1, CAL_STRIKE = 2, CAL_DONE = 3, CAL_TIMEOUT = 4 };

/**
 * Multi-channel piezo hit detector. Call sweep() as often as possible; it reads every
 * channel once. Above threshold -> capture the peak for SS_CAPTURE_US -> report -> lock out
 * for the debounce time so a ringing plate counts once.
 */
class Detector {
 public:
  typedef void (*HitFn)(const Hit&);
  typedef void (*CalFn)(uint8_t ch, CalStage stage, uint16_t noise, uint16_t peak);

  void begin(const uint8_t* pins, uint8_t n, HitFn onHit, CalFn onCal);
  void configure(uint8_t ch, uint16_t threshold, uint16_t debounceMs);
  uint16_t threshold(uint8_t ch) const { return chs[ch].threshold; }
  uint16_t debounce(uint8_t ch) const { return chs[ch].debounceMs; }
  void sweep();
  void startCalibration(uint8_t ch);
  /** Highest reading since the last call (for the live meter). */
  uint16_t takeLevel(uint8_t ch);
  uint8_t count() const { return n; }

 private:
  enum State : uint8_t { IDLE, CAPTURE, LOCKOUT };
  struct Ch {
    uint8_t pin;
    uint16_t threshold = SS_DEFAULT_THRESHOLD;
    uint16_t debounceMs = SS_DEFAULT_DEBOUNCE_MS;
    State st = IDLE;
    int64_t t0 = 0;
    uint16_t peak = 0;
    uint16_t level = 0;
    CalStage cal = CAL_NONE;
    int64_t calT = 0;
    uint16_t calNoise = 0, calPeak = 0;
  };
  Ch chs[SS_MAX_TARGETS];
  uint8_t n = 0;
  HitFn onHit = nullptr;
  CalFn onCal = nullptr;
  void calStep(uint8_t i, uint16_t v, int64_t now);
};
