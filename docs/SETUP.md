# Setup

## 1. Web app

**Hosted (recommended):** push this repo to GitHub, enable *Settings → Pages → Source: GitHub Actions*. The workflow builds the firmware, puts the binaries next to the app, and publishes `https://<you>.github.io/<repo>/`. Open it in Chrome or Edge.

**Local:**

```bash
cd web
npm install
npm run dev          # http://localhost:5173 (USB and Bluetooth work on localhost)
npm test             # unit tests (game modes, protocol)
npm run e2e          # browser smoke tests in simulator mode
npm run build        # dist/index.html — one self-contained file
npm run build:fw     # copies the app, gzipped, into firmware/data for the hub
npm run guide        # regenerates docs/wiring-guide.html
```

### Which connection works where

| Opened from | USB | Bluetooth | Wi-Fi |
|---|---|---|---|
| Hosted https site, Chrome/Edge on a computer | ✓ | ✓ | — |
| Hosted https site, Chrome on Android | — | ✓ | — |
| `http://steelstrike.local` or `http://192.168.4.1` (served by the hub) | — | — | ✓ any browser, including iPhone |
| `npm run dev` on localhost | ✓ | ✓ | ✓ (enter the hub address) |

Browsers only allow USB and Bluetooth on secure (https) pages, and a secure page can't open an unencrypted connection to a device on your network. That's why Wi-Fi uses the copy of the app stored on the hub. The app hides any option that can't work where it's open, and says why.

## 2. Firmware

### One click (no tools)

Hosted app → **Connect** → **Install hub firmware** (ESP32 DevKit V1 with wireless targets), **Install wired hub firmware** (ESP32 DevKit with the piezos wired to it, the minimum build) or **Install target firmware** (ESP32-C3 SuperMini). Uses ESP Web Tools over USB from Chrome/Edge on a computer.

### PlatformIO

```bash
pip install platformio
cd firmware
pio run -e hub_esp32 -t upload        # hub for wireless targets (default)
pio run -e hub_esp32 -t uploadfs      # the web app the hub serves over Wi-Fi (run `npm run build:fw` first)
pio run -e node_c3 -t upload          # each target node
pio device monitor                    # logs at 115200 baud (lines starting with # are debug)
```

Other builds: `hub_esp32_wired` (6 piezos wired straight to the hub), `hub_esp32s3` (wired, up to 8).

### Arduino IDE

1. Install the *esp32 by Espressif* board package **2.0.17** (Boards Manager).
2. Libraries: ArduinoJson 7.2, Adafruit NeoPixel 1.12, NimBLE-Arduino 1.4.3, ESPAsyncWebServer 3.6 + AsyncTCP 3.3 (ESP32Async).
3. Make a sketch folder `steelstrike_hub/`, copy `firmware/src/hub/main.cpp` in as `steelstrike_hub.ino`, and copy `firmware/include/*.h` and `firmware/src/common/*.cpp` next to it. Add `#define SS_HUB`, `#define SS_BOARD_DEVKIT` and `#define SS_WIRED_TARGETS 0` at the very top of the `.ino`.
4. Board: *ESP32 Dev Module*, Partition scheme: *Minimal SPIFFS (1.9MB APP with OTA)*.
5. For nodes do the same with `src/node/main.cpp`, `#define SS_NODE`, board *ESP32C3 Dev Module*, *USB CDC On Boot: Enabled*.

PlatformIO is simpler; the Arduino route is there if you already use it.

## 3. Pairing

1. Connect the app to the hub, open **Connect**, press **Pair new target** (window stays open 60 s).
2. Power on one target box. A new node searches every Wi-Fi channel for the hub and appears in the Targets list within a few seconds. It gets the next free number.
3. Pair the rest one at a time, in plate order.
4. To move a node to a different hub: hold its BOOT button 5 s (LEDs blink magenta), or press **Unpair** in the app.

The node list survives reboots on both sides. After the hub joins the range Wi-Fi its radio channel may change; nodes notice the missing replies and find it again on their own.

## 4. Hub Wi-Fi

**Connect → Hub Wi-Fi**: enter the range network. The hub restarts and joins it (15 s timeout). If it can't, it makes its own network `SteelStrike-XXXX`, password `steelstrike`, at `http://192.168.4.1` (a captive page opens the app). Status LED: slow blink = waiting for the app, double blink = own network, short blip every 2 s = app connected, fast blink = pairing.

## 5. Updates

- Hub over Wi-Fi: **Connect → Update over Wi-Fi**, upload `firmware.bin` or `littlefs.bin` (from `firmware/.pio/build/hub_esp32/`).
- Nodes: USB with the installer or PlatformIO.
