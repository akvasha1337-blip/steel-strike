import type { HitRecord, ModeContext, ModeInstance, ModeResult, ModeView, TargetView, TState } from './types';
import { LED } from './types';

export const fmtTime = (ms: number) => (ms / 1000).toFixed(2);
export const fmtSec = (ms: number) => `${fmtTime(ms)} s`;

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Deterministic RNG for tests and replays. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Shared plumbing for modes: target views, hit records, splits and finishing. */
export abstract class BaseMode implements ModeInstance {
  records: HitRecord[] = [];
  protected t0 = 0;
  protected lastHitT = 0;
  protected done = false;
  protected endT = 0;
  protected tv: Record<number, TargetView> = {};

  constructor(protected ctx: ModeContext) {
    for (const id of ctx.ids) this.tv[id] = { id, state: 'idle' };
  }

  get ids() {
    return this.ctx.ids;
  }
  get fx() {
    return this.ctx.fx;
  }
  get s() {
    return this.ctx.settings;
  }

  /** Set the on-screen state of a plate and the matching LED. */
  protected set(id: number, state: TState, extra: Partial<TargetView> = {}, led = true) {
    const prev = this.tv[id] || { id, state: 'idle' };
    this.tv[id] = { ...prev, label: undefined, color: undefined, ...extra, id, state };
    if (!led) return;
    if (state === 'active') this.fx.led(id, LED.go, 'solid');
    else if (state === 'noshoot') this.fx.led(id, LED.noShoot, 'solid');
    else if (state === 'owned') this.fx.led(id, extra.ledColor ?? LED.players[0], 'solid');
    else this.fx.led(id, LED.off, 'off');
  }

  protected setAll(state: TState, extra: Partial<TargetView> = {}) {
    for (const id of this.ids) this.set(id, state, extra);
  }

  /** Record a hit and mark the plate's flash. Returns the record. */
  protected rec(id: number, now: number, amp: number, valid: boolean, note?: string, player?: number): HitRecord {
    const t = Math.max(0, now - this.t0);
    const r: HitRecord = { t, id, amp, valid, split: t - this.lastHitT, note, player };
    this.lastHitT = t;
    this.records.push(r);
    const v = this.tv[id];
    if (v) this.tv[id] = { ...v, flash: now, flashOk: valid, split: r.split };
    this.fx.sound(valid ? 'ding' : 'buzz', { id });
    return r;
  }

  start(now: number) {
    this.t0 = now;
    this.lastHitT = 0;
    this.onStart(now);
  }

  protected finish(now: number, sound = true) {
    if (this.done) return;
    this.done = true;
    this.endT = now;
    if (sound) this.fx.sound('end');
    this.fx.ledAll(LED.off, 'off');
    for (const id of this.ids) if (this.tv[id]?.state === 'active' || this.tv[id]?.state === 'noshoot') this.tv[id] = { ...this.tv[id], state: 'idle' };
  }

  stop(now: number) {
    this.finish(now);
  }
  isDone() {
    return this.done;
  }
  elapsed(now: number) {
    return (this.done ? this.endT : now) - this.t0;
  }

  protected abstract onStart(now: number): void;
  abstract hit(id: number, now: number, amp: number): void;
  tick(_now: number) {}
  abstract view(now: number): ModeView;
  abstract result(): ModeResult;

  protected targetsView() {
    return { ...this.tv };
  }
  protected accuracy() {
    if (!this.records.length) return 0;
    return this.records.filter((r) => r.valid).length / this.records.length;
  }
}

