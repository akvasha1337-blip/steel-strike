# What was verified

## Tested here (Oct 2026)
- **Game logic:** 20 unit tests (Vitest) cover the protocol parser, line reassembly, clock sync, and all nine modes: splits, par/DNF, penalties, no-shoots, rounds, head-to-head best-of, steal turns, tournament ranking, custom drills, early shots during standby.
- **Browser end-to-end** (Playwright, Chromium): connect to the simulator, play Speed Clear to a result, run Reaction with the demo shooter, render all 8 wiring diagrams, and no sideways scrolling at 380 px on every screen.
- **Visual checks** of every screen in light and dark themes at laptop and phone widths, and of every diagram in both themes.
- **Firmware compiles** with PlatformIO `espressif32@6.9.0` for all four builds, no warnings in project code:
  - `hub_esp32` — RAM 18.7 %, flash 60 % of the 1.9 MB OTA slot
  - `hub_esp32_wired`, `hub_esp32s3` — similar
  - `node_c3` — RAM 11.8 %, flash 55 %
- **Hub LittleFS image** builds with the gzipped app (54 kB of 128 kB).

## Needs real hardware
- Piezo thresholds and the 1 MΩ value on your plates (start at 300, run Calibrate).
- ESP-NOW range and channel re-search when the hub joins the range Wi-Fi.
- BLE throughput with Chrome on your laptop; Web Serial with your board's USB chip (CP2102 / CH340).
- Power-bank behaviour with the keep-alive blip (some banks need their low-current mode).
- WS2812B driven from 3.3 V without the level shifter.
- OTA upload from the Connect page.
- One-click install (ESP Web Tools) from the hosted site.

## Known limitations
- Nodes report link quality (% delivered first try) instead of RSSI on Arduino core 2.x.
- Target nodes update by USB only; the hub updates over Wi-Fi too.
- The spectator scoreboard needs the hub on Wi-Fi.
- USB isn't available in phone browsers or Safari; iPhones use the Wi-Fi version served by the hub.
- The system can't tell which shooter fired; versus modes split plates by side (Head-to-Head) or by turn (Steal).
