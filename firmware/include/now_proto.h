#pragma once
// ESP-NOW packets between the hub and target nodes. Little-endian, packed.
#include <stdint.h>

#define SS_MAGIC 0x5A
#define SS_PROTO 1

enum PktType : uint8_t {
  P_HELLO = 1,    // node -> hub (broadcast while searching, unicast when paired)
  P_ASSIGN = 2,   // hub -> node: your id, channel and settings
  P_HIT = 3,      // node -> hub
  P_STATUS = 4,   // node -> hub every 5 s
  P_LED = 5,      // hub -> node
  P_CFG = 6,      // hub -> node: threshold / debounce
  P_CAL = 7,      // hub -> node: start calibration
  P_CALRES = 8,   // node -> hub: calibration progress / result
  P_LEVEL = 9,    // node -> hub: live signal peak (monitor mode)
  P_MONITOR = 10, // hub -> node: start / stop level reports
  P_FORGET = 11,  // hub -> node: forget the hub (unpair)
  P_GLOBAL = 12,  // hub -> node: keep-alive, brightness
};

struct __attribute__((packed)) PktHeader {
  uint8_t magic;
  uint8_t type;
  uint8_t id;  // target id (0 = not assigned yet)
};

struct __attribute__((packed)) PktHello {
  PktHeader h;
  uint8_t proto;
  uint8_t paired;
};

struct __attribute__((packed)) PktAssign {
  PktHeader h;
  uint8_t channel;
  uint16_t threshold;
  uint16_t debounce;
  uint8_t keepalive;
  uint8_t brightness;
};

struct __attribute__((packed)) PktHit {
  PktHeader h;
  uint16_t seq;
  uint16_t amp;
  uint32_t ageUs;  // time between detection and this transmission (includes retries)
};

struct __attribute__((packed)) PktStatus {
  PktHeader h;
  uint16_t supplyMv;  // 0 if no divider fitted
  uint8_t linkPct;    // share of packets delivered on the first try
  uint8_t flags;
};

struct __attribute__((packed)) PktLed {
  PktHeader h;
  uint8_t r, g, b;
  uint8_t mode;  // LedMode
  uint16_t ms;   // 0 = until changed
};

struct __attribute__((packed)) PktCfg {
  PktHeader h;
  uint16_t threshold;
  uint16_t debounce;
};

struct __attribute__((packed)) PktCalRes {
  PktHeader h;
  uint8_t stage;  // CalStage
  uint16_t noise;
  uint16_t peak;
};

struct __attribute__((packed)) PktLevel {
  PktHeader h;
  uint16_t level;
};

struct __attribute__((packed)) PktFlag {
  PktHeader h;
  uint8_t on;
};

struct __attribute__((packed)) PktGlobal {
  PktHeader h;
  uint8_t keepalive;
  uint8_t brightness;
};
