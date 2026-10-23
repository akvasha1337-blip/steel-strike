# Steel Strike

Interactive steel-target games for a real shooting range. Piezo sensors on the plates feel each hit, ESP32 boards light the plate and report the hit, and a web app in the browser runs the timer, game modes, sounds and scoreboard.

- **Web app** (`web/`): open it in Chrome or Edge. No install, works offline after the first visit. Nine game modes, a shot-timer style start beep, live plate display, results, leaderboard, CSV export, and a built-in simulator so you can play with no hardware.
- **Firmware** (`firmware/`): a hub ESP32 at the shooting line (USB, Bluetooth or Wi-Fi to the browser) and an ESP32-C3 node on each plate (ESP-NOW radio to the hub).
- **Wiring guide** (`docs/wiring-guide.html`): illustrated, printable — parts list, circuits, exact pins, mounting, testing, safety. The same guide is in the app under *Wiring guide*.

## 5-minute quick start

1. Open the hosted app in Chrome on a laptop (GitHub Pages URL once deployed, or `cd web && npm install && npm run dev`).
2. Plug the hub ESP32 DevKit in by USB → **Connect** → **Install hub firmware**. Do the same for each ESP32-C3 node with **Install target firmware**.
3. **Connect → USB cable**. Press **Pair new target**, then power on one target box. Repeat for each plate in order.
4. **Setup**: drag the plates to match the range, tap each plate with a mallet, press **Calibrate**.
5. Optional: enter the range Wi-Fi under **Connect → Hub Wi-Fi**. Phones on that network can then open `http://steelstrike.local` (scoreboard at `/#spectator`).
6. **Play**: pick a mode, press Start, wait for the beep.

No hardware yet? **Connect → Simulator**, tick *Demo shooter*, and play any mode.

## Game modes

| Mode | Players | What it is |
|---|---|---|
| Free Practice | 1 | Every plate live; first-shot time and splits |
| Speed Clear | 1 | Hit every plate once, clock stops on the last |
| Timed Challenge | 1 | Most lit plates in N seconds; unlit plates cost a point |
| Reaction · Green Light | 1 | Random plate lights green — shoot; red — hold |
| Sequence | 1 | Hit plates in the shown order; wrong order adds time |
| Head-to-Head | 2 | Left side vs right side, first to clear wins the round, best of 3/5/7 |
| Duel · Steal | 2+ | Timed turns; hits paint plates your colour, steal them back |
| Tournament · Ladder | 2+ | Everyone runs the same mode in turn; ranked |
| Custom Drill | 1 | Choose objective, time limit, no-shoots, rounds; save presets |

## Hardware (default build, 6 plates at 10–15 m)

1 × ESP32 DevKit V1 (hub), 6 × ESP32-C3 SuperMini (one per plate), piezo discs, a few resistors and Zener diodes, WS2812B LED strip (8 LEDs per plate), and one USB power bank per plate. Roughly $150–220 CAD for six plates excluding the steel. Full list: [docs/BOM.md](docs/BOM.md).

## Repository

```
steel-strike/
  web/        Vite + Preact + TypeScript app (single-file build)
  firmware/   PlatformIO: hub_esp32, hub_esp32_wired, hub_esp32s3, node_c3
  docs/       wiring-guide.html, SETUP.md, BOM.md, PROTOCOL.md, TROUBLESHOOTING.md
  DECISIONS.md  choices and assumptions
  .github/workflows/build.yml  builds firmware + app and deploys GitHub Pages
```

## Safety

This is a scoring aid. It never controls when the line is hot. Follow your range's rules and the range safety officer, shoot steel only at safe distances with rated plates, keep all electronics behind cover, and never go downrange while the line is hot. See the safety section of the wiring guide.
