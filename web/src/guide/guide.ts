import { breadboard, hubPinmap, ledWiring, mounting, nodeWiring, overview, piezoCircuit, powerDiagram } from './diagrams';

const fig = (id: string, svg: string, cap: string) => `<figure id="${id}"><div class="svgwrap">${svg}</div><figcaption>${cap}</figcaption></figure>`;

const steps = (items: string[]) =>
  `<ol class="steps">${items.map((s, i) => `<li><input type="checkbox" id="step-${Math.abs(hash(s))}" aria-label="Step ${i + 1} done"><span><b>${i + 1}.</b> ${s}</span></li>`).join('')}</ol>`;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export const BOM: { item: string; qty: string; cad: string; search: string }[] = [
  { item: 'ESP32 DevKit V1 (WROOM-32, 30-pin) — hub', qty: '1', cad: '$8–12', search: 'ESP32 DevKit V1 30pin CP2102' },
  { item: 'ESP32-C3 SuperMini — one per plate + spare', qty: '7', cad: '$4–6 each', search: 'ESP32-C3 SuperMini' },
  { item: 'Piezo discs 27–35 mm with leads', qty: '12', cad: '$6 / 10 pack', search: 'piezo disc 35mm with wire' },
  { item: '1 MΩ resistor (¼ W)', qty: '6 (+ spares)', cad: '$5 kit', search: 'resistor kit 1/4W' },
  { item: '10 kΩ resistor', qty: '6', cad: 'in kit', search: '—' },
  { item: '100 kΩ resistor (optional supply sense)', qty: '12', cad: 'in kit', search: '—' },
  { item: '330 Ω resistor (LED data)', qty: '6', cad: 'in kit', search: '—' },
  { item: '3.3 V Zener BZX55C3V3 (or BAT54S dual Schottky)', qty: '6 (+ spares)', cad: '$5 / 50', search: 'BZX55C3V3 zener' },
  { item: 'WS2812B IP67 strip, 60 LED/m — cut 8 LEDs per plate', qty: '1 m', cad: '$10–15', search: 'WS2812B IP67 60 led 1m' },
  { item: '1000 µF 10 V electrolytic capacitor', qty: '6', cad: '$6 / 10', search: '1000uF 10V capacitor' },
  { item: '74AHCT125 level shifter (optional)', qty: '0–6', cad: '$4 / 5', search: '74AHCT125 DIP' },
  { item: '10 000 mAh USB power bank with “low current / always on” mode', qty: '6', cad: '$15–25 each', search: 'power bank low current mode 10000mAh' },
  { item: 'Short USB-C cables (30 cm)', qty: '7', cad: '$10 / 5', search: 'USB C short cable 30cm' },
  { item: 'Waterproof ABS junction box ~100×68×50 mm + cable glands', qty: '6', cad: '$15 / 6', search: 'ABS junction box IP65 100x68x50' },
  { item: 'Shielded 2-core cable (piezo lead, and Layout A runs)', qty: '5 m', cad: '$8', search: 'shielded 2 core microphone cable' },
  { item: 'JST-SM 3-pin or GX12 connectors (unplug LEDs / sensors)', qty: '12 pairs', cad: '$10', search: 'JST SM 3 pin connector pairs' },
  { item: 'Neoprene pad, 2-part epoxy (high strength), VHB tape', qty: '1 each', cad: '$15', search: 'JB Weld epoxy, neoprene sheet' },
  { item: 'Steel or 18 mm plywood deflector per box, white backer board', qty: '6', cad: 'scrap', search: '—' },
  { item: 'Layout A only: 12 V LiFePO4 7 Ah + LM2596 buck + 3 A inline fuse', qty: '1', cad: '$60–80', search: 'LM2596 buck converter, 12V LiFePO4 7Ah' },
];

export function guideHtml(): string {
  const bomRows = BOM.map((r) => `<tr><td>${r.item}</td><td>${r.qty}</td><td>${r.cad}</td><td><code>${r.search}</code></td></tr>`).join('');
  return `<article class="guide">
<nav class="toc" aria-label="Guide sections">
<a href="#g-overview">Overview</a><a href="#g-parts">Parts</a><a href="#g-piezo">Sensor circuit</a><a href="#g-node">Target node</a><a href="#g-led">LEDs</a><a href="#g-power">Power</a><a href="#g-mount">Mounting</a><a href="#g-hub">Hub pins</a><a href="#g-bench">Bench test</a><a href="#g-build">Assembly</a><a href="#g-test">Testing</a><a href="#g-trouble">Troubleshooting</a><a href="#g-safety">Safety</a>
</nav>

<section id="g-overview" class="stack">
<h2>How it fits together</h2>
<p>Each steel plate has a piezo disc that feels the impact. A small ESP32-C3 in a box behind the plate reads it, flashes the plate’s LEDs instantly, and radios the hit to the hub at the shooting line using ESP-NOW (no router needed). The hub passes hits to the laptop over USB, Bluetooth or Wi-Fi, and the web app runs the game.</p>
${fig('fig-overview', overview(), 'Figure 1 — System overview. Default build: 6 wireless target nodes, hub on USB.')}
</section>

<section id="g-parts" class="stack">
<h2>Parts list</h2>
<p>Prices are rough Canadian dollars from AliExpress / Amazon.ca in 2026. Everything for six plates (excluding the plates and stands) comes to about $150–220 including power banks.</p>
<div class="scroll-x"><table><thead><tr><th>Item</th><th>Qty</th><th>Approx. CAD</th><th>Search for</th></tr></thead><tbody>${bomRows}</tbody></table></div>
<h3>Tools</h3>
<p>Soldering iron and solder, multimeter, wire strippers, heat-shrink tubing and a lighter or heat gun, small drill for cable glands, side cutters, a rubber mallet for testing.</p>
</section>

<section id="g-piezo" class="stack">
<h2>Sensor circuit (one per plate)</h2>
<p>A piezo disc hit by a bullet impact can produce tens of volts. These three parts make that safe for the ESP32 and give a clean signal.</p>
${fig('fig-piezo', piezoCircuit(), 'Figure 2 — Piezo protection circuit. Same circuit for every target, in the node box (or at the hub for the wired layout).')}
</section>

<section id="g-node" class="stack">
<h2>Target node — ESP32-C3 SuperMini</h2>
${fig('fig-node', nodeWiring(), 'Figure 3 — One target node. Power comes in through the USB-C socket from the power bank; the board’s 5V pin then feeds the LEDs.')}
<div class="scroll-x"><table><thead><tr><th>C3 pin</th><th>Connects to</th><th>Why this pin</th></tr></thead><tbody>
<tr><td><code>GPIO0</code></td><td>Piezo signal (after 10 kΩ, with 1 MΩ and Zener to GND)</td><td>ADC1 channel 0 — analog input that works while the radio is on</td></tr>
<tr><td><code>GPIO10</code></td><td>330 Ω → LED strip DIN</td><td>Plain output, not a boot or strapping pin</td></tr>
<tr><td><code>GPIO1</code></td><td>Middle of 100 k / 100 k divider from 5V (optional)</td><td>ADC1 channel 1 — lets the app show supply voltage</td></tr>
<tr><td><code>5V</code></td><td>LED strip 5V, capacitor +, divider top</td><td>USB 5 V passes through to this pin</td></tr>
<tr><td><code>GND</code></td><td>Piezo −, 1 MΩ, Zener anode, LED GND, capacitor −</td><td>One shared ground</td></tr>
<tr><td><code>GPIO9 (BOOT)</code></td><td>On-board button</td><td>Hold 5 s to make the node forget its hub and look for a new one</td></tr>
<tr><td><code>GPIO8</code></td><td>On-board blue LED</td><td>Status: fast blink = searching, slow = paired, solid flash = hit</td></tr>
</tbody></table></div>
<p class="note">Avoid <code>GPIO2</code>, <code>GPIO8</code> and <code>GPIO9</code> for sensors: they decide how the chip boots. <code>GPIO5</code> is on ADC2 and can’t read analog while the radio runs.</p>
</section>

<section id="g-led" class="stack">
<h2>LED indicator</h2>
${fig('fig-led', ledWiring(), 'Figure 4 — LED strip wiring and power budget. The plate flashes white the instant a hit is detected, even if the laptop is disconnected.')}
</section>

<section id="g-power" class="stack">
<h2>Power</h2>
${fig('fig-power', powerDiagram(), 'Figure 5 — Power for the wireless layout (top) and the wired-hub layout (bottom).')}
</section>

<section id="g-mount" class="stack">
<h2>Mounting on the plate</h2>
${fig('fig-mount', mounting(), 'Figure 6 — Side view. Sensor on the hanger or back face, electronics low and behind cover, LEDs lighting a backer board.')}
<ul>
<li>Clean the bonding spot to bare metal. Glue the piezo brass-side-down with two-part epoxy and let it cure fully. A ring of neoprene around it reduces ringing.</li>
<li>If plates take heavy hits, bond the piezo to the hanger bracket or a small steel tab bolted to the stand instead of the plate itself. The stand carries the vibration well and the sensor lives longer.</li>
<li>Keep the piezo lead short (under 50 cm) and use shielded cable, shield to GND at the box end only.</li>
<li>Strain-relieve every cable with a gland or zip tie so a hard hit never pulls on solder joints.</li>
</ul>
</section>

<section id="g-hub" class="stack">
<h2>Hub pin map</h2>
<p><b>Wireless layout (default): the hub needs no wiring.</b> Flash it and plug it into the laptop. The pin map below is only for the wired layout, where piezos and LEDs connect straight to the hub.</p>
${fig('fig-hub', hubPinmap(), 'Figure 7 — ESP32 DevKit V1, wired layout (up to 6 plates).')}
<div class="scroll-x"><table><thead><tr><th>Target</th><th>Piezo signal (ADC1)</th><th>Notes</th></tr></thead><tbody>
<tr><td>T1</td><td><code>GPIO36 (VP)</code></td><td>input only</td></tr>
<tr><td>T2</td><td><code>GPIO39 (VN)</code></td><td>input only</td></tr>
<tr><td>T3</td><td><code>GPIO34</code></td><td>input only</td></tr>
<tr><td>T4</td><td><code>GPIO35</code></td><td>input only</td></tr>
<tr><td>T5</td><td><code>GPIO32</code></td><td></td></tr>
<tr><td>T6</td><td><code>GPIO33</code></td><td></td></tr>
</tbody></table></div>
<div class="scroll-x"><table><thead><tr><th>Function</th><th>Pin</th></tr></thead><tbody>
<tr><td>LED data (one strip chained through all plates, 8 LEDs per plate)</td><td><code>GPIO13</code> → 74AHCT125 → 330 Ω → DIN</td></tr>
<tr><td>Optional second LED chain</td><td><code>GPIO14</code></td></tr>
<tr><td>Hub status LED</td><td><code>GPIO2</code> (built in)</td></tr>
<tr><td>Pair button</td><td><code>GPIO0</code> (BOOT button)</td></tr>
<tr><td>Do not use</td><td>ADC2 pins for analog (<code>4, 12–15, 25–27</code>), strapping pins <code>0, 2, 5, 12, 15</code> for inputs, <code>6–11</code> (flash)</td></tr>
</tbody></table></div>
<h3>ESP32-S3 DevKit (up to 8 plates, wired)</h3>
<div class="scroll-x"><table><thead><tr><th>Targets</th><th>Piezo signal</th><th>LED data</th></tr></thead><tbody>
<tr><td>T1–T8</td><td><code>GPIO1 … GPIO8</code> (ADC1 channels 0–7)</td><td><code>GPIO16</code></td></tr>
</tbody></table></div>
</section>

<section id="g-bench" class="stack">
<h2>Bench test first</h2>
${fig('fig-bench', breadboard(), 'Figure 8 — Build one target on a breadboard and test it at home before soldering six.')}
</section>

<section id="g-build" class="stack">
<h2>Assembly, step by step</h2>
<p>Tick steps as you go (ticks are not saved).</p>
${steps([
  'Flash the hub: open the hosted app in Chrome, plug the DevKit in by USB, Connect page → <b>Install hub firmware</b>.',
  'Flash each C3 board the same way with <b>Install target firmware</b>. Write a number 1–6 on each board with a marker.',
  'Bench test one C3 on a breadboard (Figure 8). Connect the app over USB, open Setup, tap the steel offcut and watch the meter jump.',
  'Cut the LED strip into 8-LED pieces on the copper pads. Solder three wires (5V, DIN, GND) to the input end — the arrows point away from it.',
  'Solder the piezo circuit (Figure 2) onto a small piece of perfboard: 1 MΩ across the piezo leads, 10 kΩ in series, Zener from signal to GND with its band on the signal side.',
  'Wire the C3 (Figure 3): signal → GPIO0, LED data via 330 Ω → GPIO10, LED 5V and GND to the 5V and GND pins, 1000 µF across the LED supply (stripe = minus).',
  'Optional: 100 k / 100 k divider from 5V to GND with the middle to GPIO1 for supply voltage in the app.',
  'Insulate everything with heat-shrink. Fit the board, perfboard and power bank in the ABS box with cable glands for the piezo and LED leads.',
  'Power on the hub, connect the app, and press <b>Pair new target</b> on the Connect page. Then power on one node box: a new node searches for the hub on its own and appears in the Targets list within a few seconds.',
  'Pair the nodes one at a time in plate order 1–6, so the numbers match your layout. To move a node to another hub, hold its BOOT button for 5 s.',
  'At the range, bond the piezos (Figure 6), place boxes behind cover, run LED leads behind the plates, and position the white backer boards.',
  'Calibrate each plate (below) and run a Free Practice round with a mallet before going hot.',
])}
</section>

<section id="g-test" class="stack">
<h2>Testing and calibration</h2>
<ol>
<li><b>Multimeter, power off:</b> no short between 5V and GND (should read more than a few hundred ohms). Piezo leads to GND through 1 MΩ should read close to 1 MΩ.</li>
<li><b>Multimeter, power on:</b> 4.8–5.2 V between 5V and GND on each node. About 2.5 V on GPIO1 if you fitted the divider.</li>
<li><b>Live signal:</b> Setup → Sensors. The meter should sit near the bottom when nothing touches the plate and jump high when you strike it.</li>
<li><b>Calibrate:</b> press Calibrate, keep still for 3 s while it measures noise, then hit the plate. Accept the suggested threshold.</li>
<li><b>Crosstalk:</b> hit each plate hard and check only that plate registers. If a neighbour also fires, raise its threshold or add rubber between stand and ground.</li>
</ol>
</section>

<section id="g-trouble" class="stack">
<h2>Troubleshooting</h2>
<div class="scroll-x"><table><thead><tr><th>Problem</th><th>Try this</th></tr></thead><tbody>
<tr><td>False hits (wind, nearby plates)</td><td>Raise the threshold; shorten or shield the piezo cable; keep the crosstalk window on (default 5 ms); put rubber under the stand; increase “ignore time after a hit”.</td></tr>
<tr><td>Missed hits</td><td>Lower the threshold; re-bond the piezo to bare metal with epoxy; move it closer to where bullets land; check the Zener isn’t reversed (band to signal).</td></tr>
<tr><td>Double hits from one shot</td><td>Raise “ignore time after a hit” to 200–300 ms. Steel rings for a while after a hit.</td></tr>
<tr><td>LEDs flicker or show wrong colours</td><td>Join all grounds; fit the 1000 µF capacitor; keep the data wire short; add the 74AHCT125 level shifter.</td></tr>
<tr><td>Node shows offline</td><td>Power bank switched itself off — turn on its low-current mode, or keep keep-alive on in Setup. Check the node is within sight of the hub.</td></tr>
<tr><td>Bluetooth can’t find the hub</td><td>Use Chrome or Edge (not Safari/Firefox); turn Bluetooth on; on Android allow Location for the browser; disconnect USB/Wi-Fi sessions first.</td></tr>
<tr><td>Wi-Fi app won’t load</td><td>Type <code>http://</code>, not <code>https://</code>. Try <code>http://192.168.4.1</code> on the hub’s own network <code>SteelStrike-XXXX</code>. Some phones don’t resolve <code>.local</code> — use the IP shown on the Connect page.</td></tr>
<tr><td>USB port not listed</td><td>Use a data USB cable (not charge-only). Install the CP210x or CH340 driver on Windows if the board doesn’t show up.</td></tr>
<tr><td>Nodes stop after the hub joins Wi-Fi</td><td>Normal for a few seconds: the hub changed radio channel to match the router and nodes search for it again automatically.</td></tr>
</tbody></table></div>
</section>

<section id="g-safety" class="stack">
<h2>Safety</h2>
<div class="warn stack">
<p><b>The range’s rules and the range safety officer come first.</b> This system is a scoring aid. It never controls when the line is hot or cold.</p>
<ul>
<li>Shoot steel only at or beyond the minimum distance in your range rules and the plate maker’s guidance — typically at least 10 m for handgun calibres on AR500, much further for rifles. Only shoot plates rated for the calibre.</li>
<li>Plates should be in good condition (no craters or pitting) and tilted so fragments go down into the ground.</li>
<li>All electronics, boxes and cables sit behind cover and out of the line of fire. Nothing electronic may be visible from the front of a plate.</li>
<li>Never go downrange to adjust a sensor, box or LED while the line is hot. Make changes during a cease-fire only.</li>
<li>Everyone near the line wears eye and ear protection, including spectators watching the scoreboard.</li>
</ul>
</div>
</section>
</article>`;
}
