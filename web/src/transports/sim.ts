import type { HubCommand } from '../protocol';
import type { Transport } from './types';

/**
 * A software hub. It speaks the same protocol as the real firmware, so the whole
 * app (game modes, LEDs, calibration, node list) runs with no hardware.
 * Click a target or press 1–8 to "hit" it; the demo shooter fires at lit plates on its own.
 */
export class SimTransport implements Transport {
  readonly kind = 'sim' as const;
  readonly label = 'Simulator';
  onLine = (_l: string) => {};
  onDrop = (_r: string) => {};
  private timers: number[] = [];
  private monitor = false;
  private lit = new Map<number, string>(); // id -> LED colour currently shown
  private botTimers = new Map<number, number>();
  private armed = true;
  bot = false;
  botAccuracy = 0.88;
  botSpeed = 1; // 1 = average shooter; higher = faster

  constructor(private targets = 6) {}

  private now() {
    return Math.round(performance.now() * 1000); // µs, like esp_timer_get_time()
  }
  private emit(o: object) {
    const line = JSON.stringify(o);
    queueMicrotask(() => this.onLine(line));
  }

  async connect() {
    this.emit({ t: 'hello', fw: 'sim-1.0.0', layout: 'nodes', targets: this.targets, name: 'Simulator' });
    for (let id = 1; id <= this.targets; id++) this.emit(this.nodeStatus(id));
    this.timers.push(window.setInterval(() => this.emit({ t: 'hb', ts: this.now() }), 1000));
    this.timers.push(
      window.setInterval(() => {
        for (let id = 1; id <= this.targets; id++) this.emit(this.nodeStatus(id));
      }, 5000),
    );
    this.timers.push(
      window.setInterval(() => {
        if (!this.monitor) return;
        for (let id = 1; id <= this.targets; id++) this.emit({ t: 'lvl', id, v: Math.round(15 + Math.random() * 25) });
      }, 100),
    );
  }
  reconnect() {
    return this.connect();
  }

  private nodeStatus(id: number) {
    return { t: 'node', id, online: true, batt: 5.05, link: 100, rssi: -48 - id * 3 };
  }

  async disconnect() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.botTimers.forEach(clearTimeout);
    this.botTimers.clear();
  }

  /** Simulate a plate being struck. */
  hit(id: number, amp = 600 + Math.round(Math.random() * 1500)) {
    if (id < 1 || id > this.targets || !this.armed) return;
    this.emit({ t: 'hit', id, amp, ts: this.now() - Math.round(800 + Math.random() * 600) });
    if (this.monitor) this.emit({ t: 'lvl', id, v: amp });
  }

  setBot(on: boolean) {
    this.bot = on;
    if (!on) {
      this.botTimers.forEach(clearTimeout);
      this.botTimers.clear();
    } else this.lit.forEach((c, id) => this.planShot(id, c));
  }

  private planShot(id: number, color: string) {
    if (!this.bot || this.botTimers.has(id)) return;
    const c = color.toUpperCase();
    // The bot shoots green and player-coloured plates and (rarely) a red no-shoot by mistake.
    const isNoShoot = c === '#FF0000';
    if (isNoShoot && Math.random() > 0.15) return;
    const delay = (380 + Math.random() * 650 + this.botTimers.size * 260) / this.botSpeed;
    const tm = window.setTimeout(() => {
      this.botTimers.delete(id);
      if (!this.lit.has(id)) return;
      if (Math.random() < this.botAccuracy) this.hit(id);
      else {
        // A miss: sometimes it clangs the wrong plate.
        if (Math.random() < 0.3) this.hit(1 + Math.floor(Math.random() * this.targets));
        else this.planShot(id, this.lit.get(id)!);
      }
    }, delay);
    this.botTimers.set(id, tm);
  }

  send(line: string) {
    let cmd: HubCommand;
    try {
      cmd = JSON.parse(line);
    } catch {
      return;
    }
    switch (cmd.c) {
      case 'hello':
        this.connect();
        break;
      case 'ping':
        setTimeout(() => this.emit({ t: 'pong', ts: this.now(), seq: cmd.seq }), 2 + Math.random() * 6);
        break;
      case 'led':
        this.setLit(cmd.id, cmd.mode === 'off' || cmd.color === '#000000' ? null : cmd.color);
        break;
      case 'ledAll':
        for (let id = 1; id <= this.targets; id++) this.setLit(id, cmd.mode === 'off' || cmd.color === '#000000' ? null : cmd.color);
        break;
      case 'monitor':
        this.monitor = cmd.on;
        break;
      case 'arm':
        this.armed = true;
        break;
      case 'disarm':
        this.armed = false;
        break;
      case 'cfg':
        this.emit({ t: 'cfg', id: cmd.id, threshold: cmd.threshold ?? 300, debounce: cmd.debounce ?? 150 });
        break;
      case 'calibrate': {
        const id = cmd.id;
        this.emit({ t: 'cal', id, stage: 'noise', peak: 0, noise: 0 });
        setTimeout(() => this.emit({ t: 'cal', id, stage: 'strike', peak: 0, noise: 31 }), 3000);
        setTimeout(() => this.emit({ t: 'cal', id, stage: 'done', peak: 1450 + Math.round(Math.random() * 400), noise: 31 }), 4600);
        break;
      }
      case 'pair':
        this.emit({ t: 'pair', open: true, secs: cmd.secs ?? 60 });
        setTimeout(() => this.emit({ t: 'pair', open: false }), 3000);
        break;
      case 'wifi':
        this.emit({ t: 'wifi', mode: 'sta', ssid: cmd.ssid, ip: '192.168.1.57' });
        break;
      default:
        break;
    }
  }

  private setLit(id: number, color: string | null) {
    const t = this.botTimers.get(id);
    if (t) {
      clearTimeout(t);
      this.botTimers.delete(id);
    }
    if (color) {
      this.lit.set(id, color);
      this.planShot(id, color);
    } else this.lit.delete(id);
  }
}
