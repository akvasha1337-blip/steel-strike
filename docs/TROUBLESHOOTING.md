# Troubleshooting

| Problem | Try this |
|---|---|
| False hits (wind, nearby plates) | Raise that plate's threshold in Setup; shorten or shield the piezo lead; keep the crosstalk window on (default 5 ms); put rubber under the stand; raise “ignore time after a hit”. |
| Missed hits | Lower the threshold; re-bond the piezo to bare metal with epoxy; move it closer to the impact area; check the Zener isn't reversed (band towards the signal). Run Calibrate. |
| One shot counts twice | Raise “ignore time after a hit” to 200–300 ms — steel keeps ringing. |
| LEDs flicker / wrong colours | Join all grounds; fit the 1000 µF capacitor at the strip; keep the data wire short; add a 74AHCT125. |
| Target shows Offline | The power bank switched off: use its low-current mode or keep *Power-bank keep-alive* on (Setup). Check the node can “see” the hub. |
| New target never appears | Press **Pair new target** first, then power the node. Only one hub may have its pairing window open. If the node was paired to another hub, hold BOOT 5 s. |
| Targets drop for a few seconds after saving Wi-Fi | Expected: the hub moved to the router's channel and the nodes are searching for it. |
| Bluetooth can't find the hub | Chrome or Edge only; Bluetooth on; Android needs Location permission for the browser; close other connections to the hub. |
| Wi-Fi app won't load | Use `http://`, not `https://`. Try `http://192.168.4.1` on the hub's own network `SteelStrike-XXXX` (password `steelstrike`). Some Android phones don't resolve `.local` — use the IP shown on the Connect page. |
| USB port not listed | Use a data cable (many cables are charge-only). On Windows install the CP210x or CH340 driver. Close Arduino IDE / serial monitors that hold the port. |
| Splits look slightly off | Check the latency figure on the Connect page; scoring uses hub timestamps so it should be under a few ms of error regardless of latency. |
| Sound doesn't play | Click or tap anywhere first (browsers block audio until you interact). Check Setup → Sound. |
| Hub keeps restarting | Power supply too weak for Wi-Fi + Bluetooth: use a good USB port or powered hub. |

Logs: `pio device monitor -b 115200` shows the hub's or node's debug lines (starting with `#`).
