import { BaseMode, fmtSec, pick } from '../engine/base';
import type { ModeDef, ModeResult, ModeView } from '../engine/types';
import { LED } from '../engine/types';

const nameOf = (players: string[]) => players[0] || 'Shooter';

/* ---------------- Free Practice ---------------- */

class FreePractice extends BaseMode {
  protected onStart() {
    this.setAll('active');
  }
  hit(id: number, now: number, amp: number) {
    if (!this.tv[id]) return;
    this.rec(id, now, amp, true);
    this.fx.led(id, LED.go, 'solid');
  }
  tick(now: number) {
    const lim = (this.s.timeLimit || 0) * 1000;
    if (lim && now - this.t0 >= lim) this.finish(this.t0 + lim);
  }
  private avgSplit() {
    const r = this.records.slice(1);
    return r.length ? r.reduce((a, b) => a + b.split, 0) / r.length : 0;
  }
  view(now: number): ModeView {
    const lim = (this.s.timeLimit || 0) * 1000;
    const el = this.elapsed(now);
    const n = this.records.length;
    return {
      targets: this.targetsView(),
      players: [{ name: nameOf(this.ctx.players), display: `${n} hit${n === 1 ? '' : 's'}`, active: true }],
      clock: lim ? Math.max(0, lim - el) : el,
      countdown: !!lim,
      sub: n > 1 ? `Average split ${fmtSec(this.avgSplit())}` : n === 1 ? `First shot ${fmtSec(this.records[0].t)}` : 'Hit any plate',
    };
  }
  result(): ModeResult {
    const n = this.records.length;
    return {
      rows: [
        {
          name: nameOf(this.ctx.players),
          primary: n,
          better: 'higher',
          display: `${n} hits`,
          detail: n ? `First shot ${fmtSec(this.records[0].t)} · avg split ${fmtSec(this.avgSplit())}` : undefined,
        },
      ],
      summary: `${n} hits in ${fmtSec(this.elapsed(this.endT))}`,
    };
  }
}

export const freePractice: ModeDef = {
  id: 'free',
  name: 'Free Practice',
  blurb: 'Every plate is live. Shows first-shot time and splits.',
  rules: 'All plates light green. Hit any plate as often as you like. Stop the clock with Space or the Stop button, or set a time limit.',
  players: '1',
  minTargets: 1,
  settings: [{ key: 'timeLimit', label: 'Time limit', type: 'number', min: 0, max: 600, step: 5, unit: 's', help: '0 = no limit' }],
  defaults: { timeLimit: 0 },
  tournament: true,
  create: (ctx) => new FreePractice(ctx),
};

/* ---------------- Speed Clear ---------------- */

class SpeedClear extends BaseMode {
  private remaining = new Set<number>();
  protected onStart() {
    this.remaining = new Set(this.ids);
    this.setAll('active');
  }
  hit(id: number, now: number, amp: number) {
    if (!this.tv[id]) return;
    if (this.remaining.has(id)) {
      const r = this.rec(id, now, amp, true);
      this.remaining.delete(id);
      this.set(id, 'hit', { split: r.split });
      if (!this.remaining.size) this.finish(now);
    } else {
      this.rec(id, now, amp, false, 'extra hit');
    }
  }
  private time() {
    return this.remaining.size ? Infinity : this.endT - this.t0;
  }
  view(now: number): ModeView {
    const par = (this.s.par || 0) * 1000;
    const el = this.elapsed(now);
    const cleared = this.ids.length - this.remaining.size;
    let sub = `${cleared} of ${this.ids.length} down`;
    if (par) sub += el <= par ? ` · par ${fmtSec(par)}` : ` · ${fmtSec(el - par)} over par`;
    return {
      targets: this.targetsView(),
      players: [{ name: nameOf(this.ctx.players), display: `${cleared}/${this.ids.length}`, active: true }],
      clock: el,
      sub,
    };
  }
  result(): ModeResult {
    const t = this.time();
    const par = (this.s.par || 0) * 1000;
    const done = Number.isFinite(t);
    return {
      rows: [
        {
          name: nameOf(this.ctx.players),
          primary: done ? t : 1e9,
          better: 'lower',
          display: done ? fmtSec(t) : 'DNF',
          detail: done
            ? `${this.records.filter((r) => !r.valid).length} extra hits${par ? ` · ${t <= par ? 'under' : 'over'} par by ${fmtSec(Math.abs(t - par))}` : ''}`
            : `${this.remaining.size} plates left standing`,
        },
      ],
      summary: done ? `Cleared ${this.ids.length} plates in ${fmtSec(t)}` : 'Stopped before all plates were down',
    };
  }
}

export const speedClear: ModeDef = {
  id: 'speed',
  name: 'Speed Clear',
  blurb: 'Knock down every plate once, as fast as you can.',
  rules: 'All plates light green. Hit each one once, in any order. The clock stops on the last plate. Extra hits on a cleared plate are logged but cost nothing.',
  players: '1',
  minTargets: 2,
  settings: [{ key: 'par', label: 'Par time', type: 'number', min: 0, max: 60, step: 0.5, unit: 's', help: '0 = no par' }],
  defaults: { par: 0 },
  tournament: true,
  create: (ctx) => new SpeedClear(ctx),
};

/* ---------------- Timed Challenge ---------------- */

class TimedChallenge extends BaseMode {
  private lit = new Set<number>();
  private score = 0;
  private lastTick = -1;
  protected onStart() {
    const count = Math.max(1, Math.min(this.s.lit || 1, this.ids.length));
    for (let i = 0; i < count; i++) this.light(undefined);
  }
  private light(avoid: number | undefined) {
    let pool = this.ids.filter((x) => !this.lit.has(x) && x !== avoid);
    if (!pool.length) pool = this.ids.filter((x) => !this.lit.has(x));
    if (!pool.length) return;
    const id = pick(pool, this.ctx.rng);
    this.lit.add(id);
    this.set(id, 'active');
  }
  hit(id: number, now: number, amp: number) {
    if (!this.tv[id]) return;
    if (this.lit.has(id)) {
      this.score++;
      this.rec(id, now, amp, true);
      this.lit.delete(id);
      this.set(id, 'idle');
      this.light(id);
    } else {
      if (this.s.penalty) this.score--;
      this.rec(id, now, amp, false, this.s.penalty ? 'unlit plate −1' : 'unlit plate');
    }
  }
  tick(now: number) {
    const dur = (this.s.duration || 30) * 1000;
    const left = dur - (now - this.t0);
    const sec = Math.ceil(left / 1000);
    if (sec <= 5 && sec > 0 && sec !== this.lastTick) {
      this.lastTick = sec;
      this.fx.sound('tick');
    }
    if (left <= 0) this.finish(this.t0 + dur);
  }
  view(now: number): ModeView {
    const dur = (this.s.duration || 30) * 1000;
    return {
      targets: this.targetsView(),
      players: [{ name: nameOf(this.ctx.players), display: `${this.score} pts`, active: true }],
      clock: Math.max(0, dur - this.elapsed(now)),
      countdown: true,
      sub: `${this.records.filter((r) => r.valid).length} on lit plates · ${Math.round(this.accuracy() * 100)}% accuracy`,
    };
  }
  result(): ModeResult {
    return {
      rows: [
        {
          name: nameOf(this.ctx.players),
          primary: this.score,
          better: 'higher',
          display: `${this.score} pts`,
          detail: `${this.records.length} hits · ${Math.round(this.accuracy() * 100)}% on lit plates`,
        },
      ],
      summary: `${this.score} points in ${this.s.duration || 30} s`,
    };
  }
}

export const timedChallenge: ModeDef = {
  id: 'timed',
  name: 'Timed Challenge',
  blurb: 'Score as many lit plates as you can before time runs out.',
  rules: 'One plate (or more) lights green. Hit it and another lights up somewhere else. Only lit plates score. Hitting an unlit plate costs a point if penalties are on.',
  players: '1',
  minTargets: 2,
  settings: [
    { key: 'duration', label: 'Duration', type: 'number', min: 10, max: 300, step: 5, unit: 's' },
    { key: 'lit', label: 'Plates lit at once', type: 'number', min: 1, max: 4, step: 1 },
    { key: 'penalty', label: '−1 for unlit plates', type: 'bool' },
  ],
  defaults: { duration: 30, lit: 1, penalty: true },
  tournament: true,
  create: (ctx) => new TimedChallenge(ctx),
};

