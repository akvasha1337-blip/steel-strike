import { ClockSync, encode, parseLine, type HubCommand, type HubEvent } from './protocol';
import { settings } from './settings';
import { createStore } from './store';
import { BleTransport } from './transports/ble';
import { SerialTransport } from './transports/serial';
import { SimTransport } from './transports/sim';
import type { Transport, TransportKind } from './transports/types';
import { WsTransport, defaultWsUrl } from './transports/ws';

export type LinkStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface NodeInfo {
  id: number;
  online: boolean;
  batt?: number;
  rssi?: number;
  link?: number;
  mac?: string;
  seen: number;
}

export interface CalState {
  id: number;
  stage: 'noise' | 'strike' | 'done' | 'timeout';
  peak: number;
  noise: number;
}

export interface HubState {
  status: LinkStatus;
  kind: TransportKind | null;
  error: string;
  fw: string;
  name: string;
  layout: 'hub' | 'nodes' | '';
  targets: number;
  nodes: Record<number, NodeInfo>;
  levels: Record<number, number>;
  thresholds: Record<number, { threshold: number; debounce: number }>;
  latency: number | null;
  lastSeen: number;
  wifi: { mode: string; ip?: string; ssid?: string } | null;
  pairOpen: boolean;
  cal: CalState | null;
  relay: unknown;
  botOn: boolean;
}

const initial: HubState = {
  status: 'disconnected',
  kind: null,
  error: '',
  fw: '',
  name: '',
  layout: '',
  targets: 0,
  nodes: {},
  levels: {},
  thresholds: {},
  latency: null,
  lastSeen: 0,
  wifi: null,
  pairOpen: false,
  cal: null,
  relay: null,
  botOn: false,
};

type HitListener = (id: number, localMs: number, amp: number) => void;

class Hub {
  state = createStore<HubState>({ ...initial });
  private t: Transport | null = null;
  private clock = new ClockSync();
  private hitListeners = new Set<HitListener>();
  private pingTimer = 0;
  private pingSeq = 0;
  private pingSent = new Map<number, number>();
  private wantConnected = false;
  private retry = 0;
  private retryTimer = 0;

  get sim(): SimTransport | null {
    return this.t instanceof SimTransport ? this.t : null;
  }

  onHit(fn: HitListener) {
    this.hitListeners.add(fn);
    return () => this.hitListeners.delete(fn);
  }

  async connect(kind: TransportKind, wsUrl?: string) {
    await this.disconnect();
    const t: Transport =
      kind === 'serial'
        ? new SerialTransport()
        : kind === 'ble'
          ? new BleTransport()
          : kind === 'ws'
            ? new WsTransport(wsUrl || defaultWsUrl())
            : new SimTransport(settings.get().targetCount);
    t.onLine = (l) => this.handle(l);
    t.onDrop = (r) => this.dropped(r);
    this.t = t;
    this.wantConnected = true;
    this.clock.reset();
    this.state.set({ ...initial, status: 'connecting', kind });
    try {
      await t.connect();
      this.connected();
    } catch (e: any) {
      this.t = null;
      this.wantConnected = false;
      const msg = e?.name === 'NotFoundError' ? 'No device chosen.' : e?.message || String(e);
      this.state.set({ status: 'disconnected', kind: null, error: msg });
    }
  }

  private connected() {
    this.retry = 0;
    this.state.set({ status: 'connected', error: '' });
    this.send({ c: 'hello' });
    this.send({ c: 'global', keepalive: settings.get().keepalive });
    clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.ping(), 2000);
    this.ping();
  }

  private dropped(reason: string) {
    clearInterval(this.pingTimer);
    if (!this.wantConnected) return;
    this.state.set({ status: 'reconnecting', error: reason });
    const attempt = async () => {
      if (!this.wantConnected || !this.t) return;
      try {
        await this.t.reconnect();
        this.connected();
      } catch {
        this.retry++;
        this.retryTimer = window.setTimeout(attempt, Math.min(10000, 1000 * 2 ** Math.min(this.retry, 4)));
      }
    };
    this.retryTimer = window.setTimeout(attempt, 800);
  }

  async disconnect() {
    this.wantConnected = false;
    clearInterval(this.pingTimer);
    clearTimeout(this.retryTimer);
    const t = this.t;
    this.t = null;
    if (t) {
      try {
        t.send(encode({ c: 'monitor', on: false }));
        t.send(encode({ c: 'ledAll', color: '#000000', mode: 'off' }));
      } catch {}
      await t.disconnect();
    }
    this.state.set({ ...initial });
  }

  send(cmd: HubCommand) {
    if (!this.t || this.state.get().status !== 'connected') return;
    this.t.send(encode(cmd));
  }

  private ping() {
    const seq = ++this.pingSeq;
    this.pingSent.set(seq, performance.now());
    if (this.pingSent.size > 20) this.pingSent.delete(this.pingSent.keys().next().value!);
    this.send({ c: 'ping', seq });
    // The hub may have rebooted when the port opened; ask again until it introduces itself.
    if (!this.state.get().fw) this.send({ c: 'hello' });
    // Mark the link stale if nothing has arrived for a while.
    const s = this.state.get();
    if (s.status === 'connected' && s.lastSeen && performance.now() - s.lastSeen > 6000) this.state.set({ latency: null });
  }

  /** Inject a hit (keyboard / click). Goes through the simulator when it's running. */
  manualHit(id: number) {
    if (this.sim) return this.sim.hit(id);
    const now = performance.now();
    this.hitListeners.forEach((f) => f(id, now, 0));
  }

  setBot(on: boolean) {
    this.sim?.setBot(on);
    this.state.set({ botOn: on });
  }

  private handle(line: string) {
    const ev = parseLine(line);
    if (!ev) return;
    const now = performance.now();
    this.state.set({ lastSeen: now });
    this.apply(ev, now);
  }

  private apply(ev: HubEvent, now: number) {
    const st = this.state;
    switch (ev.t) {
      case 'hello':
        st.set({ fw: ev.fw, layout: ev.layout, targets: ev.targets, name: ev.name || 'Steel Strike hub' });
        break;
      case 'hit': {
        const local = this.clock.toLocal(ev.ts, now);
        this.hitListeners.forEach((f) => f(ev.id, local, ev.amp));
        break;
      }
      case 'node':
        st.set((s) => ({ nodes: { ...s.nodes, [ev.id]: { ...s.nodes[ev.id], ...ev, seen: now } } }));
        break;
      case 'pong': {
        const sent = ev.seq !== undefined ? this.pingSent.get(ev.seq) : undefined;
        if (sent !== undefined) {
          this.clock.add(sent, now, ev.ts);
          this.pingSent.delete(ev.seq!);
          st.set({ latency: Math.round(now - sent) });
        }
        break;
      }
      case 'lvl':
        st.set((s) => ({ levels: { ...s.levels, [ev.id]: ev.v } }));
        break;
      case 'cal':
        st.set({ cal: { id: ev.id, stage: ev.stage ?? 'done', peak: ev.peak, noise: ev.noise } });
        break;
      case 'cfg':
        st.set((s) => ({ thresholds: { ...s.thresholds, [ev.id]: { threshold: ev.threshold, debounce: ev.debounce } } }));
        break;
      case 'wifi':
        st.set({ wifi: { mode: ev.mode, ip: ev.ip, ssid: ev.ssid } });
        break;
      case 'pair':
        st.set({ pairOpen: ev.open });
        break;
      case 'relay':
        st.set({ relay: ev.d });
        break;
      case 'err':
        st.set({ error: ev.msg });
        break;
      case 'hb':
        break;
    }
  }
}

export const hub = new Hub();
