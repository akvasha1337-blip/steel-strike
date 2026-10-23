# Decisions and assumptions

Choices made while building, with the reason for each. Change any of them if your range is different.

## Hardware
- **Wireless nodes by default (Layout B).** One ESP32-C3 SuperMini per plate, ESP-NOW to the hub. At 10–15 m this removes cables on the range floor and long analog runs, which are the main source of false hits. The wired hub (Layout A) is still a build option (`hub_esp32_wired`, `hub_esp32s3`).
- **Power banks at the plates.** No wiring, recharge at home. Firmware blips the LEDs dimly every 20 s (configurable) so banks that turn off at low load stay on. Budget: ≈100 mA typical, ≈280 mA worst case → a 10 000 mAh bank lasts a full range day several times over.
- **LED brightness capped at 40 %** in firmware (102/255), 8 LEDs per plate. Keeps current low and lets a 3.3 V data line drive the strip directly; the 74AHCT125 is optional.
- **LEDs light a backer board from behind the stand** rather than facing the shooter in front of the plate. The plate and stand shield them, and the shooter sees a glow around the plate. A steel-angle housing at the base is an alternative but sits closer to the line of fire.
- **Piezo on the hanger bracket or back face**, short shielded lead, protection circuit of 1 MΩ + 10 kΩ + 3.3 V Zener. ADC1 pins only (ADC2 doesn't work with Wi-Fi on).
- **Node pins:** piezo GPIO0 (ADC1_CH0), LED data GPIO10, optional supply divider GPIO1 (ADC1_CH1). Avoids the C3 strapping pins 2, 8, 9. BOOT (GPIO9) held 5 s forgets the hub.
- **Assumed handgun calibres on AR500 plates at ≥10 m.** The system doesn't enforce anything about safety; it's a scoring aid.

## Firmware
- **Arduino core 2.0.17 via PlatformIO `espressif32@6.9.0`**, pinned for reproducible builds. ESP-NOW callbacks have `#if` branches for core 3.x.
- **WebSocket on port 80 at `/ws`** (not a separate port 81): same origin as the hub-served app, one server, nothing extra for phones to reach.
- **Wi-Fi credentials are set from the app and stored in NVS.** No credentials in code. Hub tries the saved network for 15 s, otherwise starts its own access point `SteelStrike-XXXX` with password `steelstrike` and a captive page.
- **Pairing:** unpaired nodes broadcast HELLO on channels 1–13; the hub only accepts them while the app's pairing window is open (60 s) and closes the window after one node so numbers follow plate order. Nodes and hub both persist the pairing.
- **Channel changes are handled by search, not configuration:** when the hub joins a router its channel changes; nodes notice failed deliveries and re-scan.
- **Hit timing:** detection timestamps come from `esp_timer` on the device that saw the strike. Nodes send the packet age; the hub converts to its clock; the app converts hub time to browser time with the lowest-latency ping. Wireless and USB delays don't affect splits.
- **Sampling:** wired hub samples on core 1 continuously (~16 kHz sweep). The single-core C3 samples in 20 ms bursts with a 1 ms yield so the radio and watchdog run — a struck plate rings far longer than the gap.
- **Detection:** threshold → 2 ms peak capture → per-plate lockout (default 150 ms). Crosstalk window (default 5 ms) across all plates keeps the strongest of near-simultaneous hits.
- **Node signal strength:** core 2.x ESP-NOW receive callbacks don't expose RSSI, so the app shows link quality as the share of packets delivered on the first try. RSSI appears automatically on core 3.x builds.
- **The hub's IP is shown in the app and the serial log** rather than blinked on the LED; the status LED shows mode (waiting / own network / app connected / pairing).
- **Nodes update over USB only.** OTA is implemented for the hub (firmware and web app); node OTA over ESP-NOW was left out to keep the nodes simple.

## Web app
- **Preact + Vite + TypeScript**, bundled into one self-contained `index.html` (≈55 kB gzipped) so the identical file runs on GitHub Pages, from the hub's 128 kB LittleFS partition, and as a standalone page.
- **Connection options are filtered by context** (secure page + Chromium for USB/Bluetooth; hub-served http page for Wi-Fi), each hidden option explains why.
- **Simulator transport** speaks the real protocol, including LEDs, pairing and calibration, and has a demo shooter that fires at lit plates — used for demos and the end-to-end tests.
- **Shot-timer start:** standby call, random 1.5–4 s delay, 2.4 kHz beep. Hits during standby are early shots: buzzer, counted, not scored.
- **Sounds are synthesised** with Web Audio (no audio files, nothing copyrighted). Voice calls use the browser's speech synthesis and can be turned off.
- **Head-to-Head sides follow the layout:** left half of the plates (by position in Setup) is shooter 1, right half shooter 2; an odd middle plate is neutral.
- **Duel · Steal is turn-based:** one sensor system can't tell who fired, so shooters alternate timed turns.
- **Tournament runs inside one game session** with automatic hand-over (configurable swap time) so the laptop operator doesn't need to touch anything between shooters.
- **Storage:** settings in localStorage, runs and leaderboard in IndexedDB, all wrapped so a blocked store never breaks play. Leaderboard entries are grouped by mode + settings text so different drills aren't compared.
- **Spectator scoreboard** (`/#spectator`) mirrors the laptop's game through the hub's WebSocket. It needs the hub on Wi-Fi; the laptop can still be on USB.
