#pragma once
// Pin map and tuning constants. See docs/wiring-guide.html for the matching diagrams.
#include <Arduino.h>

#ifndef SS_FW_VERSION
#define SS_FW_VERSION "1.0.0"
#endif

#define SS_MAX_TARGETS 8
#define SS_LEDS_PER_TARGET 8
#define SS_MAX_BRIGHTNESS 102        // 40 % of 255 — keeps each target under ~250 mA
#define SS_DEFAULT_THRESHOLD 300     // ADC counts (0–4095)
#define SS_DEFAULT_DEBOUNCE_MS 150
#define SS_CAPTURE_US 2000           // peak search window after the threshold is crossed
#define SS_CROSSTALK_MS 5            // hits on several plates within this window: keep the strongest
#define SS_HIT_FLASH_MS 300
#define SS_KEEPALIVE_MS 20000        // dim LED blip so power banks don't switch off
#define SS_STATUS_MS 5000
#define SS_NODE_OFFLINE_MS 12000
#define SS_PAIR_WINDOW_S 60
#define SS_AP_CHANNEL 1
#define SS_WIFI_JOIN_MS 15000

// BLE GATT (must match web/src/transports/types.ts)
#define SS_BLE_SERVICE "b8a1e2c0-5a1f-4c3b-9d7e-5354524b0001"
#define SS_BLE_TX "b8a1e2c0-5a1f-4c3b-9d7e-5354524b0002"
#define SS_BLE_RX "b8a1e2c0-5a1f-4c3b-9d7e-5354524b0003"

#if defined(SS_BOARD_DEVKIT)
// ESP32 DevKit V1. Piezo inputs must be ADC1 pins (ADC2 is unusable while Wi-Fi runs).
static const uint8_t WIRED_PIEZO_PINS[] = {36, 39, 34, 35, 32, 33};
#define SS_LED_PIN 13
#define SS_STATUS_LED 2
#define SS_STATUS_ACTIVE_HIGH 1
#define SS_BUTTON_PIN 0
#elif defined(SS_BOARD_S3)
static const uint8_t WIRED_PIEZO_PINS[] = {1, 2, 3, 4, 5, 6, 7, 8};
#define SS_LED_PIN 16
#define SS_STATUS_LED -1
#define SS_STATUS_ACTIVE_HIGH 1
#define SS_BUTTON_PIN 0
#endif

#if defined(SS_NODE)
// ESP32-C3 SuperMini target node
#define SS_NODE_PIEZO_PIN 0     // ADC1_CH0
#define SS_NODE_SENSE_PIN 1     // ADC1_CH1, 100k/100k divider from 5V (optional)
#define SS_LED_PIN 10
#define SS_STATUS_LED 8         // blue on-board LED, active low
#define SS_STATUS_ACTIVE_HIGH 0
#define SS_BUTTON_PIN 9         // BOOT button
#endif

#ifndef SS_WIRED_TARGETS
#define SS_WIRED_TARGETS 0
#endif
