import { board, callout, capV, dot, ground, ledStrip, legend, lines, net, piezo, resistorH, resistorV, svg, text, W, wire, zenerV, type Pin } from './draw';

/* 1 ─ System overview */
export function overview(): string {
  let b = '';
  // laptop
  b += `<rect x="40" y="120" width="170" height="108" rx="8" fill="#20262c" stroke="#0c0f12" stroke-width="3"/><rect x="50" y="130" width="150" height="88" rx="3" fill="#0f1418"/>`;
  b += `<text x="125" y="170" text-anchor="middle" font-size="20" font-weight="800" fill="#ffb21a" font-family="var(--font-display),sans-serif">3.42 s</text>`;
  b += `<circle cx="80" cy="198" r="7" fill="#3ad17c"/><circle cx="100" cy="198" r="7" fill="#59656f"/><circle cx="120" cy="198" r="7" fill="#3ad17c"/><circle cx="140" cy="198" r="7" fill="#ffb21a"/><circle cx="160" cy="198" r="7" fill="#59656f"/><circle cx="180" cy="198" r="7" fill="#59656f"/>`;
  b += `<path d="M24,228 L226,228 L240,244 L10,244 Z" fill="#2b333a" stroke="#0c0f12" stroke-width="2"/>`;
  b += text(125, 270, 'Laptop · Chrome or Edge', 'tb', 'middle');
  b += text(125, 288, 'runs the Steel Strike web app', 'ts', 'middle');
  // hub
  b += `<rect x="275" y="150" width="62" height="96" rx="6" fill="#14324a" stroke="#0b1d2b" stroke-width="2"/><rect x="288" y="160" width="36" height="30" rx="3" fill="#c4c9ce"/>`;
  b += text(306, 270, 'Hub', 'tb', 'middle') + text(306, 288, 'ESP32 DevKit V1', 'ts', 'middle');
  b += wire([[212, 210], [250, 210], [250, 235], [278, 235]], W.usb, 4);
  b += text(244, 200, 'USB', 'ts', 'middle');
  b += `<path d="M212,150 C240,120 260,120 290,148" class="dash"/>` + text(250, 118, 'or Bluetooth / Wi-Fi', 'ts', 'middle');
  // phones
  b += `<rect x="290" y="40" width="34" height="58" rx="6" fill="#20262c" stroke="#0c0f12" stroke-width="2"/><rect x="294" y="48" width="26" height="40" rx="2" fill="#0f1418"/>`;
  b += `<rect x="335" y="46" width="30" height="52" rx="6" fill="#20262c" stroke="#0c0f12" stroke-width="2"/><rect x="339" y="54" width="22" height="34" rx="2" fill="#0f1418"/>`;
  b += text(380, 64, 'Phones / tablets', 'tb') + text(380, 82, 'scoreboard over Wi-Fi', 'ts');
  b += `<path d="M314,104 L314,145" class="dash"/>`;
  // range
  b += `<rect x="440" y="250" width="440" height="60" fill="var(--panel)" stroke="var(--line)"/>`;
  b += text(660, 330, 'Berm / backstop', 'ts', 'middle');
  for (let i = 0; i < 6; i++) {
    const x = 480 + i * 72;
    const y = 160 + (i % 2) * 18;
    b += `<rect x="${x - 3}" y="${y + 26}" width="6" height="${250 - y - 26}" fill="#59656f"/>`;
    const popper = i === 2 || i === 4;
    b += popper
      ? `<circle cx="${x}" cy="${y - 14}" r="14" fill="#8b969f" stroke="#2c353d" stroke-width="2"/><path d="M${x - 10},${y - 2} L${x + 10},${y - 2} L${x + 16},${y + 26} L${x - 16},${y + 26} Z" fill="#8b969f" stroke="#2c353d" stroke-width="2"/>`
      : `<circle cx="${x}" cy="${y}" r="26" fill="#8b969f" stroke="#2c353d" stroke-width="2"/>`;
    b += `<text x="${x}" y="${popper ? y + 18 : y + 6}" text-anchor="middle" font-size="16" font-weight="800" fill="#1a1f24">${i + 1}</text>`;
    b += `<rect x="${x + 6}" y="228" width="26" height="18" rx="3" fill="#ffb21a" stroke="#7a5200"/>`;
  }
  b += `<path d="M352,198 C410,150 440,175 470,215" class="dash"/>`;
  for (let r = 1; r <= 3; r++) b += `<path d="M${345 + r * 8},${196 - r * 10} a${r * 12},${r * 12} 0 0,1 ${r * 10},${r * 12}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  b += text(395, 140, 'ESP-NOW radio', 'tb', 'middle');
  b += text(395, 158, '(no router needed)', 'ts', 'middle');
  b += text(660, 370, 'Each plate: piezo sensor + ESP32-C3 node + LEDs + power bank (yellow box)', 'ts', 'middle');
  // distance
  b += `<line x1="306" y1="350" x2="660" y2="350" stroke="var(--muted)" stroke-width="2" marker-end="url(#arr)" marker-start="url(#arr)"/>`;
  b += `<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>`;
  b += text(483, 344, '10–15 m', 'tb', 'middle');
  return svg(900, 390, b, 'System overview: laptop, hub, and six wireless target nodes');
}

/* 2 ─ Piezo input protection circuit */
export function piezoCircuit(): string {
  let b = '';
  b += piezo(90, 150, 46, 'Piezo disc (27–35 mm)');
  // leads
  b += wire([[100, 140], [170, 140], [170, 90], [230, 90]], W.v5); // + lead (red wire on most discs)
  b += text(178, 80, 'red lead (+)', 'ts');
  b += wire([[132, 160], [170, 160], [170, 270], [230, 270]], W.gnd);
  b += text(178, 290, 'black lead (−, brass)', 'ts');
  // node A
  b += wire([[230, 90], [290, 90]], W.sig, 3, false);
  b += dot(290, 90, W.sig);
  b += resistorV(290, 180, '1 MΩ', 'var(--fg)', 'left');
  b += wire([[290, 90], [290, 146]], W.sig, 3, false);
  b += wire([[290, 214], [290, 270]], W.gnd, 3, false);
  // series resistor
  b += wire([[290, 90], [366, 90]], W.sig, 3, false);
  b += resistorH(400, 90, '10 kΩ');
  b += wire([[434, 90], [520, 90]], W.sig, 3, false);
  b += dot(520, 90, W.sig);
  // zener
  b += wire([[520, 90], [520, 146]], W.sig, 3, false);
  b += zenerV(520, 180, '3.3 V Zener', 'right');
  b += text(540, 204, 'BZX55C3V3 · band to signal', 'ts');
  b += wire([[520, 214], [520, 270]], W.gnd, 3, false);
  // gnd rail
  b += wire([[230, 270], [700, 270]], W.gnd, 3.2, false);
  b += dot(290, 270, W.gnd) + dot(520, 270, W.gnd);
  b += ground(400, 270);
  // to esp
  b += wire([[520, 90], [700, 90]], W.sig, 3.2, false);
  b += `<rect x="700" y="60" width="170" height="240" rx="10" fill="#14324a" stroke="#0b1d2b" stroke-width="2"/>`;
  b += `<rect x="706" y="83" width="14" height="14" rx="2" class="pin"/><rect x="706" y="263" width="14" height="14" rx="2" class="pin"/>`;
  b += `<text x="728" y="95" class="pl">ADC input</text><text x="728" y="275" class="pl">GND</text>`;
  b += lines(728, 140, ['Node (C3): GPIO0', 'Hub (wired):', 'GPIO36/39/34/35/32/33'], 'pl', 'start', 18);
  b += text(785, 325, 'ESP32', 'tb', 'middle');
  b += callout(250, 60, 1) + callout(400, 52, 2) + callout(560, 60, 3);
  b += lines(40, 345, ['① 1 MΩ across the piezo drains its charge and sets sensitivity (lower value = less sensitive).', '② 10 kΩ in series limits the current from the huge spike a bullet strike makes.', '③ The Zener clamps the signal near 3.3 V so the ESP32 input survives. Alternative: a BAT54S dual Schottky from the signal to 3V3 and GND.'], 'ts', 'start', 18);
  return svg(900, 410, b, 'Piezo protection circuit: 1 megohm across the disc, 10 kilohm in series, 3.3 V Zener to ground');
}

/* 3 ─ Hub pin map (Layout A, wired) */
const DEVKIT_LEFT: Pin[] = [
  { name: 'EN' },
  { name: 'VP 36', use: W.sig },
  { name: 'VN 39', use: W.sig },
  { name: 'D34', use: W.sig },
  { name: 'D35', use: W.sig },
  { name: 'D32', use: W.sig },
  { name: 'D33', use: W.sig },
  { name: 'D25' },
  { name: 'D26' },
  { name: 'D27' },
  { name: 'D14' },
  { name: 'D12' },
  { name: 'D13', use: W.data },
  { name: 'GND', use: W.gnd },
  { name: 'VIN', use: W.v5 },
];
const DEVKIT_RIGHT: Pin[] = [
  { name: 'D23' },
  { name: 'D22' },
  { name: 'TX0' },
  { name: 'RX0' },
  { name: 'D21' },
  { name: 'D19' },
  { name: 'D18' },
  { name: 'D5' },
  { name: 'TX2' },
  { name: 'RX2' },
  { name: 'D4' },
  { name: 'D2' },
  { name: 'D15' },
  { name: 'GND' },
  { name: '3V3' },
];

export function hubPinmap(): string {
  let b = '';
  const bd = board(380, 30, { w: 240, left: DEVKIT_LEFT, right: DEVKIT_RIGHT, title: 'ESP32 DevKit V1 (30-pin)', sub: 'top view, USB at the bottom', chip: 'WROOM-32', can: 0.3 });
  b += bd.svg;
  for (let i = 0; i < 6; i++) {
    const [px, py] = bd.L[i + 1];
    b += wire([[px, py], [300, py]], W.sig, 3);
    b += net(250, py, `T${i + 1} SIG`, W.sig);
  }
  const [dx, dy] = bd.L[12];
  b += wire([[dx, dy], [300, dy]], W.data, 3) + net(250, dy, 'LED DATA', W.data);
  const [gx, gy] = bd.L[13];
  b += wire([[gx, gy], [300, gy]], W.gnd, 3) + net(250, gy, 'GND', W.gnd);
  const [vx, vy] = bd.L[14];
  b += wire([[vx, vy], [300, vy]], W.v5, 3) + net(250, vy, '+5V', W.v5);
  b += lines(30, 70, ['Each T SIG goes to the', 'output of one piezo', 'circuit (Figure 2).', '', 'LED DATA → 74AHCT125', '→ 330 Ω → first strip DIN;', 'chain the strip through', 'all six plates.', '', '+5V / GND from the', 'buck converter (Fig. 5).'], 'ts', 'start', 18);
  const [lx, ly] = bd.R[11];
  b += wire([[lx, ly], [680, ly]], 'var(--muted)', 2, false) + text(688, ly + 5, 'D2 = built-in status LED', 'ts');
  b += legend(680, 70, [
    [W.sig, 'Piezo inputs (ADC1 only)'],
    [W.data, 'LED data'],
    [W.v5, '5 V'],
    [W.gnd, 'Ground'],
  ]);
  b += lines(680, 190, ['Avoid for sensors:', '· ADC2 pins (4, 12–15, 25–27):', '   no analog while Wi-Fi is on', '· strapping pins 0, 2, 5, 12, 15', '· 6–11 (internal flash)'], 'ts', 'start', 18);
  b += `<rect x="670" y="460" width="300" height="78" rx="8" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  b += lines(686, 488, ['Wireless layout (default):', 'the hub needs no wiring —', 'just USB to the laptop.'], 'tb', 'start', 20);
  return svg(1000, 560, b, 'Hub pin map for the wired layout on an ESP32 DevKit V1');
}

/* 4 ─ Target node (Layout B) */
const C3_LEFT: Pin[] = [
  { name: '5V', use: W.v5 },
  { name: 'GND', use: W.gnd },
  { name: '3V3' },
  { name: 'GPIO4' },
  { name: 'GPIO3' },
  { name: 'GPIO2' },
  { name: 'GPIO1', use: W.bat },
  { name: 'GPIO0', use: W.sig },
];
const C3_RIGHT: Pin[] = [
  { name: 'GPIO5' },
  { name: 'GPIO6' },
  { name: 'GPIO7' },
  { name: 'GPIO8' },
  { name: 'GPIO9' },
  { name: 'GPIO10', use: W.data },
  { name: 'GPIO20' },
  { name: 'GPIO21' },
];

export function nodeWiring(): string {
  let b = '';
  // power bank + cable
  b += `<rect x="420" y="18" width="200" height="48" rx="10" fill="#2b333a" stroke="#0c0f12" stroke-width="2"/>`;
  b += text(520, 47, '10 000 mAh power bank', 'tb', 'middle', 'fill="#f4f6f8"');
  b += wire([[520, 66], [520, 116]], W.usb, 5, false) + text(532, 96, 'USB-C cable', 'ts');
  const bd = board(430, 130, { w: 180, left: C3_LEFT, right: C3_RIGHT, title: 'ESP32-C3 SuperMini', sub: 'top view, USB-C at the top', usb: 'top', pitch: 30, chip: 'ESP32-C3', can: 0.4, usbLabel: false });
  b += bd.svg;
  const [v5x, v5y] = bd.L[0];
  const [gx, gy] = bd.L[1];
  const [bx, by] = bd.L[6];
  const [sx, sy] = bd.L[7];
  const [dx, dy] = bd.R[5];
  b += wire([[v5x, v5y], [392, v5y]], W.v5, 3) + net(360, v5y, '+5V', W.v5);
  b += wire([[gx, gy], [392, gy]], W.gnd, 3) + net(360, gy, 'GND', W.gnd);
  b += wire([[bx, by], [392, by]], W.bat, 3) + net(352, by, 'SENSE', W.bat);

  // piezo circuit, bottom left
  b += text(30, 405, 'Piezo circuit (Figure 2)', 'tb');
  b += piezo(100, 490, 30, 'Piezo');
  b += wire([[108, 482], [140, 482], [140, 440], [170, 440]], W.v5, 3);
  b += dot(170, 440, W.sig);
  b += wire([[170, 440], [216, 440]], W.sig, 3, false);
  b += resistorH(250, 440, '10 kΩ');
  b += wire([[284, 440], [330, 440]], W.sig, 3, false);
  b += dot(330, 440, W.sig);
  b += wire([[330, 440], [404, 440], [404, sy], [sx, sy]], W.sig, 3);
  b += wire([[170, 440], [170, 456]], W.sig, 3, false) + resistorV(170, 490, '1 MΩ', 'var(--fg)', 'right');
  b += wire([[330, 440], [330, 456]], W.sig, 3, false) + zenerV(330, 490, 'Zener', 'right');
  b += wire([[80, 506], [80, 556], [380, 556]], W.gnd, 3, false) + wire([[170, 524], [170, 556]], W.gnd, 3, false) + wire([[330, 524], [330, 556]], W.gnd, 3, false);
  b += dot(170, 556, W.gnd) + dot(330, 556, W.gnd);
  b += net(410, 556, 'GND', W.gnd);

  // LED strip, right
  const ls = ledStrip(730, 304, 8);
  b += ls.svg;
  b += wire([[dx, dy], [626, dy]], W.data, 3, false) + resistorH(660, dy, '330 Ω') + wire([[694, dy], [ls.din[0], ls.din[1]]], W.data, 3);
  b += wire([[ls.v5[0], ls.v5[1]], [716, ls.v5[1]], [716, 262]], W.v5, 3) + net(716, 250, '+5V', W.v5);
  b += wire([[ls.gnd[0], ls.gnd[1]], [716, ls.gnd[1]], [716, 392]], W.gnd, 3) + net(716, 404, 'GND', W.gnd);
  b += net(880, 100, '+5V', W.v5) + wire([[880, 112], [880, 126]], W.v5, 3, false) + capV(880, 156, '1000 µF');
  b += wire([[880, 186], [880, 200]], W.gnd, 3, false) + net(880, 212, 'GND', W.gnd);
  b += text(900, 178, 'stripe = −', 'ts') + text(820, 250, 'fit close to the strip', 'ts');

  // optional divider inset
  b += `<rect x="20" y="20" width="350" height="150" rx="10" fill="none" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  b += text(36, 46, 'Optional: supply sense', 'tb');
  b += net(66, 100, '+5V', W.v5) + wire([[88, 100], [104, 100]], W.v5, 3, false) + resistorH(138, 100, '100 kΩ');
  b += wire([[172, 100], [228, 100]], W.bat, 3, false) + dot(200, 100, W.bat) + resistorH(262, 100, '100 kΩ') + wire([[296, 100], [306, 100]], W.gnd, 3, false) + net(330, 100, 'GND', W.gnd);
  b += wire([[200, 100], [200, 128]], W.bat, 3, false) + net(200, 142, 'SENSE', W.bat);
  b += text(36, 162, '≈ 2.5 V at GPIO1 when the bank gives 5 V', 'ts');

  b += legend(740, 470, [
    [W.sig, 'Piezo signal → GPIO0'],
    [W.data, 'LED data ← GPIO10'],
    [W.bat, 'Supply sense → GPIO1'],
    [W.v5, '5 V (from USB)'],
    [W.gnd, 'Ground'],
  ]);
  b += text(30, 600, 'Tags with the same name are connected together (e.g. every GND). Strip: 8 LEDs, brightness capped at 40 % in firmware.', 'ts');
  return svg(1060, 620, b, 'Target node wiring on an ESP32-C3 SuperMini: piezo to GPIO0, LED data on GPIO10, power from a USB power bank');
}

/* 5 ─ LED wiring detail */
export function ledWiring(): string {
  let b = '';
  b += `<rect x="30" y="60" width="130" height="200" rx="10" fill="#14324a" stroke="#0b1d2b" stroke-width="2"/>`;
  b += `<text x="95" y="285" text-anchor="middle" class="tb">ESP32</text>`;
  for (const [y, n] of [[100, 'GPIO data'], [195, '5V'], [255, 'GND']] as [number, string][]) {
    b += `<rect x="146" y="${y - 7}" width="14" height="14" rx="2" class="pin"/><text x="140" y="${y + 4}" class="pl" text-anchor="end">${n}</text>`;
  }
  // 74AHCT125
  b += `<rect x="250" y="64" width="130" height="72" rx="6" fill="#222" stroke="#000"/>`;
  b += `<text x="315" y="96" text-anchor="middle" style="fill:#ddd" font-size="13" font-weight="700">74AHCT125</text><text x="315" y="114" text-anchor="middle" style="fill:#aaa" font-size="11">optional</text>`;
  b += text(315, 156, 'pin 2 in · pin 3 out · pin 1 → GND', 'ts', 'middle') + text(315, 172, 'pin 14 → 5V · pin 7 → GND', 'ts', 'middle');
  b += wire([[160, 100], [250, 100]], W.data, 3);
  b += wire([[380, 100], [440, 100]], W.data, 3, false);
  b += resistorH(474, 100, '330 Ω');
  const ls = ledStrip(600, 78, 6);
  b += ls.svg;
  b += wire([[508, 100], [ls.din[0], ls.din[1]]], W.data, 3);
  b += wire([[160, 195], [560, 195], [560, ls.v5[1]], [ls.v5[0], ls.v5[1]]], W.v5, 3);
  b += wire([[160, 255], [580, 255], [580, ls.gnd[1]], [ls.gnd[0], ls.gnd[1]]], W.gnd, 3);
  b += capV(470, 225, '1000 µF (stripe = −)');
  b += dot(470, 195, W.v5) + dot(470, 255, W.gnd);
  b += lines(30, 330, [
    'Power budget per target: WS2812B draws up to 60 mA per LED at full white.',
    '8 LEDs × 60 mA = 480 mA at 100%. The firmware caps brightness at 40% → about 190 mA.',
    'ESP32-C3 with radio on ≈ 90 mA. Worst case ≈ 280 mA; normally the LEDs are off most of the time (≈ 100 mA).',
    'A 10 000 mAh bank gives about 6 000 mAh at 5 V → 20+ hours worst case, 60 hours typical.',
    'A short data wire (< 15 cm) from a 3.3 V pin usually works without the 74AHCT125. Add it if the LEDs flicker or show wrong colours.',
  ], 'ts', 'start', 19);
  return svg(900, 440, b, 'LED strip wiring with capacitor, 330 ohm data resistor and optional level shifter');
}

/* 6 ─ Power */
export function powerDiagram(): string {
  let b = '';
  b += text(30, 36, 'Wireless targets (default)', 'th');
  b += `<rect x="30" y="60" width="170" height="70" rx="10" fill="#2b333a" stroke="#0c0f12" stroke-width="2"/>`;
  b += text(115, 92, 'Power bank', 'tb', 'middle', 'fill="#f4f6f8"') + text(115, 112, '5 V USB', 'ts', 'middle', 'fill="#c9d1d7"');
  b += wire([[200, 95], [300, 95]], W.usb, 5);
  b += text(250, 85, 'USB-C', 'ts', 'middle');
  b += `<rect x="300" y="60" width="140" height="70" rx="10" fill="#14324a" stroke="#0b1d2b" stroke-width="2"/>`;
  b += text(370, 92, 'C3 node', 'tb', 'middle', 'fill="#f4f6f8"') + text(370, 112, '5V pin out', 'ts', 'middle', 'fill="#c9d1d7"');
  b += wire([[440, 85], [560, 85]], W.v5, 3) + wire([[440, 110], [560, 110]], W.gnd, 3);
  b += `<rect x="560" y="70" width="170" height="54" rx="8" fill="#f2f2f0" stroke="#9a9a93"/>`;
  b += text(645, 102, 'LED strip (8)', 'tb', 'middle', 'fill="#222"');
  b += text(30, 160, 'Nothing to adjust. Pick a bank with an “always on” / low-current mode, or keep the keep-alive setting on.', 'ts');

  b += text(30, 220, 'Wired hub near the plates', 'th');
  b += `<rect x="30" y="245" width="140" height="80" rx="8" fill="#1f2a32" stroke="#0c0f12" stroke-width="2"/>`;
  b += text(100, 280, '12 V battery', 'tb', 'middle', 'fill="#f4f6f8"') + text(100, 300, 'LiFePO4 7 Ah', 'ts', 'middle', 'fill="#c9d1d7"');
  b += wire([[170, 265], [240, 265]], W.v5, 3);
  b += `<rect x="240" y="252" width="60" height="26" rx="4" fill="#f2c94c" stroke="#7a5d14"/>` + text(270, 270, '3 A fuse', 'ts', 'middle', 'fill="#222"');
  b += wire([[300, 265], [360, 265]], W.v5, 3);
  b += wire([[170, 310], [360, 310]], W.gnd, 3);
  b += `<rect x="360" y="240" width="150" height="90" rx="6" fill="#1e3a8a" stroke="#0b1d4b" stroke-width="2"/>`;
  b += text(435, 275, 'Buck converter', 'tb', 'middle', 'fill="#f4f6f8"') + text(435, 295, 'LM2596 / MP1584', 'ts', 'middle', 'fill="#c9d1d7"') + text(435, 315, 'IN 12 V → OUT 5.0 V', 'ts', 'middle', 'fill="#c9d1d7"');
  b += wire([[510, 265], [548, 265]], W.v5, 3) + net(578, 265, '+5V', W.v5);
  b += wire([[510, 310], [548, 310]], W.gnd, 3) + net(578, 310, 'GND', W.gnd);
  b += `<rect x="660" y="240" width="110" height="36" rx="6" fill="#14324a"/>` + text(715, 263, 'Hub VIN', 'tb', 'middle', 'fill="#f4f6f8"');
  b += `<rect x="660" y="294" width="110" height="36" rx="6" fill="#14324a"/>` + text(715, 317, 'Hub GND', 'tb', 'middle', 'fill="#f4f6f8"');
  b += net(630, 258, '+5V', W.v5) + net(630, 312, 'GND', W.gnd);
  b += `<rect x="790" y="240" width="90" height="90" rx="6" fill="#f2f2f0" stroke="#9a9a93"/>` + text(835, 280, 'LED strip', 'tb', 'middle', 'fill="#222"') + text(835, 298, '5V · GND', 'ts', 'middle', 'fill="#555"');
  b += text(30, 350, 'The LED strip takes +5V and GND straight from the buck converter too.', 'ts');
  b += `<rect x="30" y="368" width="840" height="58" rx="8" fill="none" stroke="#e5484d" stroke-width="2"/>`;
  b += lines(46, 392, ['Set the buck converter to 5.0 V with a multimeter BEFORE connecting the ESP32 or LEDs.', 'Never power LEDs from the ESP32 3V3 pin. All grounds must be joined.'], 'tb', 'start', 22);
  return svg(900, 440, b, 'Power wiring for both layouts');
}

/* 7 ─ Mounting cross-section */
export function mounting(): string {
  let b = '';
  b += `<defs><marker id="ar2" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="var(--muted)"/></marker></defs>`;
  // ground
  b += `<rect x="0" y="400" width="1000" height="60" fill="var(--panel)"/><line x1="0" y1="400" x2="1000" y2="400" stroke="var(--line)" stroke-width="2"/>`;
  b += text(24, 40, 'Shooter', 'th') + text(24, 60, 'side view', 'ts');
  b += `<line x1="24" y1="240" x2="380" y2="240" stroke="var(--muted)" stroke-width="2" stroke-dasharray="8 6" marker-end="url(#ar2)"/>`;
  b += text(24, 228, 'line of fire · 10–15 m', 'ts');
  // fragments deflect down
  b += `<path d="M430,262 Q400,320 360,392" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 5" marker-end="url(#ar2)"/>`;
  b += text(300, 340, 'fragments go down', 'ts', 'end');
  // backer board (behind)
  b += `<rect x="700" y="110" width="14" height="290" fill="#f4f4f0" stroke="#b9b9b2"/>`;
  b += text(707, 100, 'white backer board', 'ts', 'middle');
  // stand
  b += `<rect x="514" y="130" width="12" height="270" fill="#59656f"/>`;
  b += `<rect x="470" y="392" width="140" height="10" fill="#59656f"/>`;
  b += `<rect x="440" y="124" width="86" height="12" fill="#59656f"/>`;
  // hanger + plate tilted (top toward shooter)
  b += `<circle cx="450" cy="142" r="5" fill="none" stroke="var(--fg)" stroke-width="2.5"/><circle cx="450" cy="152" r="5" fill="none" stroke="var(--fg)" stroke-width="2.5"/>`;
  b += `<g transform="rotate(-15 450 160)"><rect x="442" y="160" width="16" height="150" rx="2" fill="#8b969f" stroke="#2c353d" stroke-width="2"/></g>`;
  b += text(430, 112, 'AR500 plate, top tilted', 'ts', 'end') + text(430, 128, 'toward the shooter', 'ts', 'end');
  // piezo on hanger bracket
  b += `<rect x="462" y="114" width="26" height="10" rx="2" fill="#c9a13b" stroke="#7a5d14"/>`;
  b += callout(475, 92, 1);
  // cable along arm and post (behind the post)
  b += wire([[488, 119], [536, 119], [536, 330]], W.sig, 3);
  // node box + deflector
  b += `<rect x="550" y="346" width="96" height="50" rx="5" fill="#f2c94c" stroke="#7a5d14" stroke-width="2"/>`;
  b += text(598, 376, 'Node box', 'tb', 'middle', 'fill="#222"');
  b += wire([[536, 330], [560, 330], [560, 346]], W.sig, 3, false);
  b += `<path d="M542,400 L542,326 L660,326" fill="none" stroke="#3a444d" stroke-width="7"/>`;
  b += callout(670, 360, 2);
  // LED bar on back of post lighting the backer board
  b += `<rect x="526" y="190" width="8" height="64" fill="#22c55e"/>`;
  b += `<path d="M534,200 L700,150 M534,244 L700,300" stroke="#22c55e" stroke-width="1.5" stroke-dasharray="4 5"/>`;
  b += callout(620, 222, 3);
  // not here
  b += `<path d="M386,170 l24,24 m0,-24 l-24,24" class="no"/>`;
  b += `<path d="M420,360 l24,24 m0,-24 l-24,24" class="no"/>`;
  // key
  b += lines(760, 70, ['① Piezo on the hanger bracket', '    (or the back of the plate):', '    epoxy, brass side to steel,', '    rubber pad around it.'], 't', 'start', 19);
  b += lines(760, 170, ['② Node box low and behind the', '    stand, under a steel or', '    plywood deflector. Power', '    bank inside the box.'], 't', 'start', 19);
  b += lines(760, 270, ['③ LED bar on the back of the', '    stand lights the backer', '    board: the shooter sees a', '    glow around the plate.'], 't', 'start', 19);
  b += lines(760, 360, ['✕ Never on the front face or', '    in front of the stand.'], 't', 'start', 19);
  return svg(1000, 460, b, 'Side view of a plate: where the piezo, node box and LEDs go, and where they must not go');
}

/* 8 ─ Breadboard bench test */
export function breadboard(): string {
  let b = '';
  // components on the light breadboard use dark ink in both themes
  b += `<g style="--fg:#1e252b;--gd-gnd:#1e252b">`;
  b += `<rect x="200" y="50" width="580" height="380" rx="10" fill="#f4f1e8" stroke="#c9c2ae" stroke-width="2"/>`;
  for (const [y, c] of [[72, '#e5484d'], [86, '#3b82f6'], [400, '#e5484d'], [414, '#3b82f6']] as [number, string][]) b += `<line x1="220" y1="${y}" x2="760" y2="${y}" stroke="${c}" stroke-width="1.5"/>`;
  for (let c = 0; c < 30; c++) for (let r = 0; r < 10; r++) b += `<rect x="${226 + c * 18}" y="${116 + r * 26 + (r >= 5 ? 14 : 0)}" width="5" height="5" fill="#cfc8b2"/>`;
  b += text(208, 76, '+', 'tb') + text(208, 90, '−', 'tb') + text(208, 404, '+', 'tb') + text(208, 418, '−', 'tb');
  // link the two ground rails
  b += wire([[226, 86], [226, 414]], W.gnd, 3);
  // circuit
  b += wire([[160, 140], [440, 140]], W.v5, 3, false);
  b += dot(380, 140, W.sig) + dot(440, 140, W.sig);
  b += wire([[380, 140], [380, 156]], W.sig, 3, false) + resistorV(380, 190, '1 MΩ', '#1e252b', 'left') + wire([[380, 224], [380, 414]], W.gnd, 3);
  b += wire([[440, 140], [440, 161]], W.sig, 3, false) + resistorV(440, 195, '10 kΩ', '#1e252b', 'right') + wire([[440, 229], [440, 250]], W.sig, 3, false);
  b += dot(440, 250, W.sig) + wire([[440, 250], [560, 250]], W.sig, 3, false) + dot(500, 250, W.sig);
  b += wire([[500, 250], [500, 272]], W.sig, 3, false) + zenerV(500, 306, 'Zener', 'right') + wire([[500, 340], [500, 414]], W.gnd, 3);
  b += `</g>`;
  // module
  const bd = board(600, 120, { w: 150, left: [{ name: '5V', use: W.v5 }, { name: 'GND', use: W.gnd }, { name: '3V3' }, { name: '4' }, { name: '3' }, { name: '2' }, { name: '1' }, { name: '0', use: W.sig }], right: [{ name: '5' }, { name: '6' }, { name: '7' }, { name: '8' }, { name: '9' }, { name: '10', use: W.data }, { name: '20' }, { name: '21' }], title: '', usb: 'top', pitch: 26, chip: 'C3', can: 0.3, usbLabel: false });
  b += bd.svg;
  const [g0x, g0y] = bd.L[7];
  b += wire([[560, 250], [560, g0y], [g0x, g0y]], W.sig, 3);
  const [p5x, p5y] = bd.L[0];
  const [pgx, pgy] = bd.L[1];
  b += wire([[p5x, p5y], [590, p5y], [590, 72]], W.v5, 3);
  b += wire([[pgx, pgy], [575, pgy], [575, 86]], W.gnd, 3);
  const [d10x, d10y] = bd.R[5];
  b += wire([[d10x, d10y], [800, d10y]], W.data, 3) + text(806, d10y + 5, '→ 330 Ω → LED DIN', 'ts');
  b += wire([[675, 108], [675, 26], [800, 26]], W.usb, 4, false) + text(806, 31, 'USB to laptop (power + data)', 'ts');
  // piezo off board
  b += piezo(90, 190, 40, 'Piezo on a steel offcut');
  b += wire([[98, 180], [160, 180], [160, 140]], W.v5, 3, false);
  b += wire([[70, 210], [70, 300], [180, 300], [180, 414], [226, 414]], W.gnd, 3);
  b += text(90, 340, 'Tap the steel with a', 'ts', 'middle') + text(90, 356, 'mallet and watch the', 'ts', 'middle') + text(90, 372, 'live meter in Setup', 'ts', 'middle');
  b += text(490, 456, 'Link the two blue (−) rails with a jumper — breadboard rails are not joined by default.', 'ts', 'middle');
  return svg(1020, 470, b, 'Breadboard bench test of one target before going to the range');
}
