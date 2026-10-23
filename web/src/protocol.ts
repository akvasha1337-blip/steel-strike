// Steel Strike wire protocol: newline-delimited compact JSON, identical over
// USB serial, Bluetooth LE and WebSocket. See docs/PROTOCOL.md.

export type LedMode = 'solid' | 'blink' | 'pulse' | 'off';

export type HubEvent =
  | { t: 'hello'; fw: string; layout: 'hub' | 'nodes'; targets: number; mac?: string; name?: string }
  | { t: 'hit'; id: number; amp: number; ts: number }
  | { t: 'node'; id: number; online: boolean; batt?: number; rssi?: number; link?: number; mac?: string }
  | { t: 'hb'; ts: number }
  | { t: 'pong'; ts: number; seq?: number }
  | { t: 'cal'; id: number; peak: number; noise: number; stage?: 'noise' | 'strike' | 'done' | 'timeout' }
  | { t: 'lvl'; id: number; v: number }
  | { t: 'cfg'; id: number; threshold: number; debounce: number }
  | { t: 'wifi'; mode: 'sta' | 'ap' | 'off'; ip?: string; ssid?: string }
  | { t: 'pair'; open: boolean; secs?: number }
  | { t: 'relay'; d: unknown }
  | { t: 'err'; msg: string };

export type HubCommand =
  | { c: 'hello' }
  | { c: 'led'; id: number; color: string; mode: LedMode; ms?: number }
  | { c: 'ledAll'; color: string; mode: LedMode; ms?: number }
  | { c: 'arm'; ids: number[] }
  | { c: 'disarm' }
  | { c: 'cfg'; id: number; threshold?: number; debounce?: number }
  | { c: 'global'; keepalive?: boolean; crosstalkMs?: number; brightness?: number }
  | { c: 'calibrate'; id: number }
  | { c: 'monitor'; on: boolean }
  | { c: 'wifi'; ssid: string; pass: string }
  | { c: 'pair'; secs?: number }
  | { c: 'unpair'; id: number }
  | { c: 'ping'; seq?: number }
  | { c: 'relay'; d: unknown }
  | { c: 'reboot' };

const EVENT_TYPES = new Set(['hello', 'hit', 'node', 'hb', 'pong', 'cal', 'lvl', 'cfg', 'wifi', 'pair', 'relay', 'err']);

/** Parse one line from the hub. Returns null for debug lines (starting with '#'), blanks and junk. */
export function parseLine(line: string): HubEvent | null {
  const s = line.trim();
  if (!s || s[0] === '#' || s[0] !== '{') return null;
  let o: any;
  try {
    o = JSON.parse(s);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || !EVENT_TYPES.has(o.t)) return null;
  if (o.t === 'hit') {
    if (!Number.isInteger(o.id) || o.id < 1 || o.id > 16) return null;
    o.amp = Number(o.amp) || 0;
    o.ts = Number(o.ts) || 0;
  }
  if ((o.t === 'node' || o.t === 'lvl' || o.t === 'cal' || o.t === 'cfg') && !Number.isInteger(o.id)) return null;
  return o as HubEvent;
}

export function encode(cmd: HubCommand): string {
  return JSON.stringify(cmd) + '\n';
}

/** Splits an incoming byte/text stream into lines. Handles chunks that cut lines in half. */
export class LineSplitter {
  private buf = '';
  constructor(private onLine: (line: string) => void, private maxLen = 4096) {}
  push(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      if (line) this.onLine(line);
    }
    if (this.buf.length > this.maxLen) this.buf = ''; // garbage without newlines: drop it
  }
  reset() {
    this.buf = '';
  }
}

/**
 * Estimates the offset between the hub clock (µs since boot) and the browser clock (ms),
 * so hits are timed by when the hub saw them rather than when the message arrived.
 * Uses the ping sample with the smallest round trip among the most recent ones.
 */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];
  offset: number | null = null; // hubMs - localMs
  rtt = 0;
  add(sentLocal: number, recvLocal: number, hubUs: number) {
    const rtt = recvLocal - sentLocal;
    if (rtt < 0 || rtt > 5000) return;
    const offset = hubUs / 1000 - (sentLocal + recvLocal) / 2;
    this.samples.push({ rtt, offset });
    if (this.samples.length > 10) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.offset;
    this.rtt = rtt;
  }
  /** Convert a hub timestamp (µs) into browser time (ms). Falls back to `fallback` before sync. */
  toLocal(hubUs: number, fallback: number): number {
    if (this.offset === null || !hubUs) return fallback;
    const t = hubUs / 1000 - this.offset;
    // Guard against a stale offset (e.g. hub rebooted): never trust a time far from arrival.
    if (Math.abs(t - fallback) > 1500) return fallback;
    return Math.min(t, fallback);
  }
  reset() {
    this.samples = [];
    this.offset = null;
  }
}
