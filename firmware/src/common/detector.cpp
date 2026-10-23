#include "detector.h"
#include <esp_timer.h>

void Detector::begin(const uint8_t* pins, uint8_t count, HitFn hit, CalFn cal) {
  n = count > SS_MAX_TARGETS ? SS_MAX_TARGETS : count;
  onHit = hit;
  onCal = cal;
  analogReadResolution(12);
  for (uint8_t i = 0; i < n; i++) {
    chs[i].pin = pins[i];
    pinMode(pins[i], INPUT);
    analogSetPinAttenuation(pins[i], ADC_11db);  // ~0–3.1 V full scale
  }
}

void Detector::configure(uint8_t ch, uint16_t thr, uint16_t deb) {
  if (ch >= n) return;
  chs[ch].threshold = constrain(thr, 20, 4095);
  chs[ch].debounceMs = constrain(deb, 20, 2000);
}

uint16_t Detector::takeLevel(uint8_t ch) {
  if (ch >= n) return 0;
  uint16_t v = chs[ch].level;
  chs[ch].level = 0;
  return v;
}

void Detector::startCalibration(uint8_t ch) {
  if (ch >= n) return;
  Ch& c = chs[ch];
  c.cal = CAL_NOISE;
  c.calT = esp_timer_get_time();
  c.calNoise = 0;
  c.calPeak = 0;
  if (onCal) onCal(ch, CAL_NOISE, 0, 0);
}

void Detector::calStep(uint8_t i, uint16_t v, int64_t now) {
  Ch& c = chs[i];
  if (c.cal == CAL_NOISE) {
    if (v > c.calNoise) c.calNoise = v;
    if (now - c.calT > 3000000) {
      c.cal = CAL_STRIKE;
      c.calT = now;
      if (onCal) onCal(i, CAL_STRIKE, c.calNoise, 0);
    }
  } else if (c.cal == CAL_STRIKE) {
    const uint16_t trigger = max<uint16_t>(c.calNoise * 3, 80);
    if (c.calPeak == 0 && v > trigger) {
      c.calPeak = v;
      c.calT = now;  // start of strike: collect the peak for 50 ms
    } else if (c.calPeak) {
      if (v > c.calPeak) c.calPeak = v;
      if (now - c.calT > 50000) {
        c.cal = CAL_NONE;
        if (onCal) onCal(i, CAL_DONE, c.calNoise, c.calPeak);
      }
    } else if (now - c.calT > 10000000) {
      c.cal = CAL_NONE;
      if (onCal) onCal(i, CAL_TIMEOUT, c.calNoise, 0);
    }
  }
}

void Detector::sweep() {
  for (uint8_t i = 0; i < n; i++) {
    Ch& c = chs[i];
    const uint16_t v = analogRead(c.pin);
    const int64_t now = esp_timer_get_time();
    if (v > c.level) c.level = v;
    if (c.cal != CAL_NONE) {
      calStep(i, v, now);
      continue;  // no hits while calibrating
    }
    switch (c.st) {
      case IDLE:
        if (v >= c.threshold) {
          c.st = CAPTURE;
          c.t0 = now;
          c.peak = v;
        }
        break;
      case CAPTURE:
        if (v > c.peak) c.peak = v;
        if (now - c.t0 >= SS_CAPTURE_US) {
          c.st = LOCKOUT;
          if (onHit) onHit(Hit{i, c.peak, c.t0});
        }
        break;
      case LOCKOUT:
        if (now - c.t0 >= (int64_t)c.debounceMs * 1000) c.st = IDLE;
        break;
    }
  }
}
