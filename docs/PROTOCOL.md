# Protocol

## App ↔ hub (USB serial, Bluetooth LE, WebSocket)

Newline-delimited compact JSON, identical on every transport. Lines starting with `#` are human-readable debug and are ignored by the app.

- USB: 115200 baud.
- Bluetooth LE: service `b8a1e2c0-5a1f-4c3b-9d7e-5354524b0001`; hub → app notifications on `…0002`; app → hub writes on `…0003`. Long lines are split into chunks (MTU − 3, max 180 bytes) and reassembled by newline.
- WebSocket: `ws://<hub>/ws` (port 80, same origin as the hub-served app).

### Hub → app

| Message | Meaning |
|---|---|
| `{"t":"hello","fw":"1.0.0","layout":"nodes","targets":6,"name":"SteelStrike-3A7F","mac":"…"}` | Sent on boot and on `hello`. `layout` is `hub` when plates are wired to the hub. |
| `{"t":"hit","id":3,"amp":812,"ts":123456789}` | A hit. `ts` = hub `esp_timer` µs when the plate was struck (node time is converted using the packet age). |
| `{"t":"node","id":3,"online":true,"batt":5.02,"link":95,"rssi":-61,"mac":"…"}` | Target status. `batt` = supply volts (only with the divider), `link` = % delivered first try. |
| `{"t":"hb","ts":…}` | Heartbeat every second. |
| `{"t":"pong","ts":…,"seq":12}` | Reply to `ping`; used for latency and clock sync. |
| `{"t":"cfg","id":3,"threshold":300,"debounce":150}` | Stored sensor settings for a target. |
| `{"t":"cal","id":3,"stage":"noise|strike|done|timeout","noise":22,"peak":640}` | Calibration progress and result. |
| `{"t":"lvl","id":3,"v":140}` | Live signal peak, 10×/s while `monitor` is on. |
| `{"t":"wifi","mode":"sta|ap|off","ip":"…","ssid":"…"}` | Wi-Fi status. |
| `{"t":"pair","open":true,"secs":60}` | Pairing window state. |
| `{"t":"relay","d":{…}}` | Scoreboard broadcast (WebSocket only). |

### App → hub

| Command | Meaning |
|---|---|
| `{"c":"hello"}` | Ask for hello + all node, cfg, wifi, pair state. |
| `{"c":"led","id":3,"color":"#00FF00","mode":"solid|blink|pulse|off","ms":500}` | Set a plate's LEDs. `ms` = auto-off after (0 = stay). |
| `{"c":"ledAll","color":"#FF0000","mode":"blink","ms":300}` | All plates. |
| `{"c":"arm","ids":[1,2,3]}` / `{"c":"disarm"}` | Only report hits from these plates / none. |
| `{"c":"cfg","id":3,"threshold":300,"debounce":150}` | Sensor settings (saved on the hub and node). |
| `{"c":"global","keepalive":true,"crosstalkMs":5,"brightness":102}` | Power-bank keep-alive, crosstalk window, LED brightness cap (max 102 = 40 %). |
| `{"c":"calibrate","id":3}` | Start calibration. |
| `{"c":"monitor","on":true}` | Stream live signal levels. |
| `{"c":"wifi","ssid":"…","pass":"…"}` | Save range Wi-Fi and restart. |
| `{"c":"pair","secs":60}` / `{"c":"unpair","id":3}` | Pairing. |
| `{"c":"ping","seq":12}` | Latency / clock sync. |
| `{"c":"relay","d":{…}}` | Forward to WebSocket spectators. |
| `{"c":"reboot"}` | Restart the hub. |

### Timing

The app pings every 2 s and keeps the sample with the shortest round trip to map hub time to browser time. Scores use hub timestamps, so radio and USB delays don't change splits. Nodes send `ageUs` (time since the strike, retries included) and the hub subtracts it.

## Hub ↔ node (ESP-NOW)

Packed little-endian structs, see `firmware/include/now_proto.h`. Every packet starts with `0x5A, type, id`.

| Type | Direction | Contents |
|---|---|---|
| HELLO 1 | node → hub (broadcast while searching) | protocol version, paired flag |
| ASSIGN 2 | hub → node | id, Wi-Fi channel, threshold, debounce, keep-alive, brightness |
| HIT 3 | node → hub | seq, amplitude, age µs |
| STATUS 4 | node → hub, every 5 s | supply mV, link % |
| LED 5 | hub → node | r, g, b, mode, ms |
| CFG 6 | hub → node | threshold, debounce |
| CAL 7 / CALRES 8 | both | calibration start / progress |
| LEVEL 9 / MONITOR 10 | both | live signal / on-off |
| FORGET 11 | hub → node | unpair |
| GLOBAL 12 | hub → node | keep-alive, brightness |

Unicast packets get a MAC-level acknowledgement; nodes retry up to 6 times and the hub drops duplicate hits by `seq`. After 3 lost packets in a row a node goes back to channel search.
