// Tiny SVG drawing kit for the wiring guide. Everything returns SVG markup strings.
// Colours read on light and dark backgrounds; theme colours come from CSS variables.

export const W = {
  v5: '#e5484d', // 5 V — red
  gnd: 'var(--gd-gnd)', // ground — black/near-black (light text in dark theme)
  v33: '#ff8c21', // 3.3 V — orange
  sig: '#e8b400', // piezo signal — yellow
  data: '#22a86e', // LED data — green
  bat: '#2f9bef', // battery sense — blue
  usb: '#8b5cf6', // USB — purple
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function svg(w: number, h: number, body: string, title: string): string {
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}" font-family="var(--font-body), system-ui, sans-serif">
<title>${esc(title)}</title>
<style>
.t{fill:var(--fg);font-size:14px}
.ts{fill:var(--muted);font-size:12px}
.tb{fill:var(--fg);font-size:15px;font-weight:700}
.th{fill:var(--fg);font-size:18px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.pin{fill:#e9d8a6;stroke:#6b5a2a;stroke-width:1}
.pl{fill:#f4f6f8;font-size:11px;font-family:var(--font-mono),monospace}
.box{fill:var(--panel);stroke:var(--line);stroke-width:1.5}
.dash{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:6 5}
.no{fill:none;stroke:#e5484d;stroke-width:3}
</style>
<rect x="0" y="0" width="${w}" height="${h}" fill="var(--panel-2)"/>
${body}
</svg>`;
}

export function text(x: number, y: number, s: string, cls = 't', anchor: 'start' | 'middle' | 'end' = 'start', extra = ''): string {
  const ex = extra.replace(/fill="([^"]+)"/, 'style="fill:$1"');
  return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" ${ex}>${esc(s)}</text>`;
}

/** Multi-line text, lines 17 px apart. */
export function lines(x: number, y: number, ls: string[], cls = 't', anchor: 'start' | 'middle' | 'end' = 'start', gap = 17): string {
  return ls.map((l, i) => text(x, y + i * gap, l, cls, anchor)).join('');
}

/** Orthogonal wire through the given points, with a dot at the ends. */
export function wire(pts: [number, number][], color: string, width = 3.2, dots = true): string {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const ends = dots ? [pts[0], pts[pts.length - 1]].map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}"/>`).join('') : '';
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>${ends}`;
}

export function dot(x: number, y: number, color: string): string {
  return `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`;
}

/** Horizontal resistor centred at (x, y). */
export function resistorH(x: number, y: number, label: string, color = 'var(--fg)'): string {
  const z = Array.from({ length: 7 }, (_, i) => `${x - 24 + i * 8},${y + (i % 2 ? -7 : 7)}`).join(' ');
  return `<polyline points="${x - 34},${y} ${x - 28},${y} ${z} ${x + 28},${y} ${x + 34},${y}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${text(x, y - 13, label, 'tb', 'middle')}`;
}

/** Vertical resistor centred at (x, y). */
export function resistorV(x: number, y: number, label: string, color = 'var(--fg)', labelSide: 'left' | 'right' = 'right'): string {
  const z = Array.from({ length: 7 }, (_, i) => `${x + (i % 2 ? -7 : 7)},${y - 24 + i * 8}`).join(' ');
  return `<polyline points="${x},${y - 34} ${x},${y - 28} ${z} ${x},${y + 28} ${x},${y + 34}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${text(labelSide === 'right' ? x + 14 : x - 14, y + 5, label, 'tb', labelSide === 'right' ? 'start' : 'end')}`;
}

/** Vertical Zener diode, cathode (bar) on top, centred at (x, y). */
export function zenerV(x: number, y: number, label: string, labelSide: 'left' | 'right' = 'right'): string {
  return `<line x1="${x}" y1="${y - 34}" x2="${x}" y2="${y - 12}" stroke="var(--fg)" stroke-width="2.5"/>
<polygon points="${x - 12},${y + 10} ${x + 12},${y + 10} ${x},${y - 10}" fill="var(--fg)"/>
<polyline points="${x - 16},${y - 6} ${x - 12},${y - 12} ${x + 12},${y - 12} ${x + 16},${y - 18}" fill="none" stroke="var(--fg)" stroke-width="2.5"/>
<line x1="${x}" y1="${y + 10}" x2="${x}" y2="${y + 34}" stroke="var(--fg)" stroke-width="2.5"/>
${text(labelSide === 'right' ? x + 20 : x - 20, y + 5, label, 'tb', labelSide === 'right' ? 'start' : 'end')}`;
}

/** Vertical capacitor centred at (x, y). */
export function capV(x: number, y: number, label: string): string {
  return `<line x1="${x}" y1="${y - 30}" x2="${x}" y2="${y - 5}" stroke="var(--fg)" stroke-width="2.5"/>
<line x1="${x - 14}" y1="${y - 5}" x2="${x + 14}" y2="${y - 5}" stroke="var(--fg)" stroke-width="3"/>
<path d="M${x - 14},${y + 7} Q${x},${y + 1} ${x + 14},${y + 7}" fill="none" stroke="var(--fg)" stroke-width="3"/>
<line x1="${x}" y1="${y + 4}" x2="${x}" y2="${y + 30}" stroke="var(--fg)" stroke-width="2.5"/>
${text(x + 20, y + 5, label, 'tb')}`;
}

/** Piezo disc seen from the brass side; leads come out to the right. */
export function piezo(x: number, y: number, r = 34, label = 'Piezo disc'): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#c9a13b" stroke="#7a5d14" stroke-width="2"/>
<circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="#e9e3d4" stroke="#9c9179" stroke-width="1.5"/>
<circle cx="${x + r * 0.2}" cy="${y - r * 0.15}" r="3" fill="#b5b5b5"/>
<circle cx="${x + r * 0.75}" cy="${y + r * 0.1}" r="3" fill="#b5b5b5"/>
${text(x, y + r + 20, label, 'tb', 'middle')}`;
}

export function ground(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 10}" stroke="var(--gd-gnd)" stroke-width="2.5"/>
<line x1="${x - 14}" y1="${y + 10}" x2="${x + 14}" y2="${y + 10}" stroke="var(--gd-gnd)" stroke-width="2.5"/>
<line x1="${x - 9}" y1="${y + 15}" x2="${x + 9}" y2="${y + 15}" stroke="var(--gd-gnd)" stroke-width="2.5"/>
<line x1="${x - 4}" y1="${y + 20}" x2="${x + 4}" y2="${y + 20}" stroke="var(--gd-gnd)" stroke-width="2.5"/>`;
}

export interface Pin {
  name: string;
  /** colour of a wire leaving this pin, if used */
  use?: string;
  note?: string;
}

/**
 * A dev board drawn from above with two pin rows. Returns markup plus pin coordinates
 * so wires can be routed to exact pins.
 */
export function board(
  x: number,
  y: number,
  o: { w: number; left: Pin[]; right: Pin[]; title: string; sub?: string; pitch?: number; usb?: 'bottom' | 'top'; chip?: string; can?: number; usbLabel?: boolean },
): { svg: string; L: [number, number][]; R: [number, number][] } {
  const pitch = o.pitch ?? 24;
  const n = Math.max(o.left.length, o.right.length);
  const h = n * pitch + 70;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  let s = `<rect x="${x}" y="${y}" width="${o.w}" height="${h}" rx="10" fill="#14324a" stroke="#0b1d2b" stroke-width="2"/>`;
  // module can
  const cw = o.w * (o.can ?? 0.5);
  s += `<rect x="${x + (o.w - cw) / 2}" y="${y + 18}" width="${cw}" height="${Math.min(110, h * 0.32)}" rx="4" fill="#c4c9ce" stroke="#7d858c"/>`;
  s += `<text x="${x + o.w / 2}" y="${y + 18 + Math.min(110, h * 0.32) / 2 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#3a4148">${esc(o.chip ?? 'ESP32')}</text>`;
  // USB connector
  const uy = o.usb === 'top' ? y - 12 : y + h - 4;
  s += `<rect x="${x + o.w / 2 - 22}" y="${uy}" width="44" height="16" rx="4" fill="#b8bec4" stroke="#6f777e"/>`;
  if (o.usbLabel !== false) s += `<text x="${x + o.w / 2}" y="${o.usb === 'top' ? y - 18 : y + h + 30}" text-anchor="middle" class="ts">USB</text>`;
  const top = y + 46;
  o.left.forEach((p, i) => {
    const py = top + i * pitch;
    s += `<rect x="${x + 6}" y="${py - 7}" width="14" height="14" rx="2" class="pin"/>`;
    s += `<text x="${x + 26}" y="${py + 4}" class="pl">${esc(p.name)}</text>`;
    L.push([x + 6, py]);
    if (p.use) s += `<rect x="${x + 3}" y="${py - 10}" width="20" height="20" rx="3" fill="none" stroke="${p.use}" stroke-width="3"/>`;
  });
  o.right.forEach((p, i) => {
    const py = top + i * pitch;
    s += `<rect x="${x + o.w - 20}" y="${py - 7}" width="14" height="14" rx="2" class="pin"/>`;
    s += `<text x="${x + o.w - 26}" y="${py + 4}" class="pl" text-anchor="end">${esc(p.name)}</text>`;
    R.push([x + o.w - 6, py]);
    if (p.use) s += `<rect x="${x + o.w - 23}" y="${py - 10}" width="20" height="20" rx="3" fill="none" stroke="${p.use}" stroke-width="3"/>`;
  });
  s += `<text x="${x + o.w / 2}" y="${y + h + (o.usb === 'top' ? 26 : 50)}" text-anchor="middle" class="tb">${esc(o.title)}</text>`;
  if (o.sub) s += `<text x="${x + o.w / 2}" y="${y + h + (o.usb === 'top' ? 44 : 68)}" text-anchor="middle" class="ts">${esc(o.sub)}</text>`;
  return { svg: s, L, R };
}

/** A short WS2812B strip, horizontal, pads on the left. */
export function ledStrip(x: number, y: number, n = 8, lit = '#22c55e'): { svg: string; v5: [number, number]; din: [number, number]; gnd: [number, number] } {
  const w = 34 + n * 34;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="44" rx="6" fill="#f2f2f0" stroke="#9a9a93"/>`;
  for (let i = 0; i < n; i++) {
    const cx = x + 40 + i * 34;
    s += `<rect x="${cx - 11}" y="${y + 11}" width="22" height="22" rx="3" fill="#fff" stroke="#bbb"/><circle cx="${cx}" cy="${y + 22}" r="7" fill="${lit}" opacity="${i < n ? 0.9 : 0}"/>`;
  }
  s += `<text x="${x + 6}" y="${y + 13}" font-size="9" fill="#555">5V</text><text x="${x + 6}" y="${y + 26}" font-size="9" fill="#555">DIN</text><text x="${x + 6}" y="${y + 39}" font-size="9" fill="#555">GND</text>`;
  s += `<path d="M${x + w - 10},${y + 22} l8,0" stroke="#999" stroke-width="2"/><text x="${x + w / 2}" y="${y + 62}" text-anchor="middle" class="ts">WS2812B · arrow points away from DIN</text>`;
  return { svg: s, v5: [x, y + 9], din: [x, y + 22], gnd: [x, y + 35] };
}

export function legend(x: number, y: number, items: [string, string][]): string {
  return items
    .map(([c, l], i) => {
      const yy = y + i * 22;
      return `<line x1="${x}" y1="${yy}" x2="${x + 28}" y2="${yy}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>${text(x + 36, yy + 5, l, 'ts')}`;
    })
    .join('');
}

export function callout(x: number, y: number, n: number): string {
  return `<circle cx="${x}" cy="${y}" r="12" fill="var(--accent)"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--accent-ink)">${n}</text>`;
}

/** Net label: a named tag. Wires ending at tags with the same name are connected. */
export function net(cx: number, cy: number, name: string, color: string): string {
  const w = 16 + name.length * 8.2;
  return `<rect x="${cx - w / 2}" y="${cy - 12}" width="${w}" height="24" rx="12" fill="var(--panel)" stroke="${color}" stroke-width="2.5"/><text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="12.5" font-weight="800" style="fill:var(--fg)">${esc(name)}</text>`;
}
