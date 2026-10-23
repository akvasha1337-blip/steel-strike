import { BaseMode, fmtSec, pick, shuffle } from '../engine/base';
import type { ModeDef, ModeResult, ModeView } from '../engine/types';

type RPhase = 'wait' | 'go' | 'hold' | 'gap';

class Reaction extends BaseMode {
  private round = 0;
  private phase: RPhase = 'wait';
  private phaseEnd = 0;
  private goAt = 0;
  private cur = 0;
  private reactions: number[] = [];
  private timeouts = 0;
  private penalties = 0;
  private holds = 0;
  private msg = '';

  private get rounds() {
    return this.s.rounds || 10;
  }

  protected onStart(now: number) {
    this.nextRound(now);
  }

  private nextRound(now: number) {
    this.round++;
    if (this.round > this.rounds) return this.finish(now);
    this.phase = 'wait';
    const min = (this.s.minDelay ?? 1) * 1000;
    const max = Math.max(min, (this.s.maxDelay ?? 3) * 1000);
    this.phaseEnd = now + min + this.ctx.rng() * (max - min);
    this.setAll('idle');
    this.msg = 'Wait for it…';
  }

  private gap(now: number, ms = 800) {
    this.phase = 'gap';
    this.phaseEnd = now + ms;
  }

  tick(now: number) {
    if (this.done || now < this.phaseEnd) return;
    const timeout = (this.s.timeout ?? 2.5) * 1000;
    if (this.phase === 'wait') {
      this.cur = pick(this.ids, this.ctx.rng);
      if (this.ctx.rng() < (this.s.noShoot ?? 25) / 100) {
        this.phase = 'hold';
        this.set(this.cur, 'noshoot');
        this.phaseEnd = now + Math.min(timeout, 1600);
        this.msg = 'Red — hold!';
      } else {
        this.phase = 'go';
        this.goAt = now;
        this.set(this.cur, 'active');
        this.phaseEnd = now + timeout;
        this.msg = 'Shoot!';
        this.fx.sound('go');
      }
    } else if (this.phase === 'go') {
      this.timeouts++;
      this.set(this.cur, 'miss');
      this.msg = 'Too slow';
      this.fx.sound('buzz');
      this.gap(now);
    } else if (this.phase === 'hold') {
      this.holds++;
      this.set(this.cur, 'idle');
      this.msg = 'Good hold';
      this.gap(now, 500);
    } else if (this.phase === 'gap') {
      this.nextRound(now);
    }
  }

  hit(id: number, now: number, amp: number) {
    if (!this.tv[id] || this.done) return;
    if (this.phase === 'go') {
      if (id === this.cur) {
        const rt = now - this.goAt;
        this.reactions.push(rt);
        this.rec(id, now, amp, true, `${Math.round(rt)} ms reaction`);
        this.set(id, 'hit', { split: rt });
        this.msg = `${Math.round(rt)} ms`;
        this.gap(now);
      } else {
        this.penalties++;
        this.rec(id, now, amp, false, 'wrong plate');
        this.msg = 'Wrong plate';
      }
    } else if (this.phase === 'hold') {
      this.penalties++;
      this.rec(id, now, amp, false, 'shot a no-shoot');
      this.set(this.cur, 'miss');
      this.msg = 'No-shoot hit!';
      this.gap(now);
    } else if (this.phase === 'wait') {
      this.penalties++;
      this.rec(id, now, amp, false, 'jumped the light');
      this.msg = 'Jumped the light';
    }
  }

  private score() {
    const timeout = (this.s.timeout ?? 2.5) * 1000;
    const pen = (this.s.penalty ?? 1) * 1000;
    const n = this.reactions.length + this.timeouts;
    const total = this.reactions.reduce((a, b) => a + b, 0) + this.timeouts * timeout + this.penalties * pen;
    return n ? total / n : this.penalties ? pen * this.penalties : Infinity;
  }

  view(now: number): ModeView {
    const best = this.reactions.length ? Math.min(...this.reactions) : 0;
    const sc = this.score();
    return {
      targets: this.targetsView(),
      players: [{ name: this.ctx.players[0] || 'Shooter', display: Number.isFinite(sc) ? `${Math.round(sc)} ms` : '—', active: true }],
      clock: this.phase === 'go' ? now - this.goAt : this.reactions.length ? this.reactions[this.reactions.length - 1] : 0,
      message: this.msg,
      sub: `Round ${Math.min(this.round, this.rounds)}/${this.rounds}${best ? ` · best ${Math.round(best)} ms` : ''} · ${this.penalties} penalt${this.penalties === 1 ? 'y' : 'ies'}`,
    };
  }

  result(): ModeResult {
    const sc = this.score();
    const best = this.reactions.length ? Math.min(...this.reactions) : 0;
    return {
      rows: [
        {
          name: this.ctx.players[0] || 'Shooter',
          primary: Number.isFinite(sc) ? sc : 1e9,
          better: 'lower',
          display: Number.isFinite(sc) ? `${Math.round(sc)} ms` : '—',
          detail: `${this.reactions.length} hits · best ${best ? Math.round(best) + ' ms' : '—'} · ${this.timeouts} too slow · ${this.penalties} penalties · ${this.holds} good holds`,
        },
      ],
      summary: `Average reaction ${Number.isFinite(sc) ? Math.round(sc) + ' ms' : '—'} over ${this.rounds} rounds (penalties included)`,
    };
  }
}

export const reaction: ModeDef = {
  id: 'reaction',
  name: 'Reaction · Green Light',
  blurb: 'A random plate lights green — shoot it. Red means hold.',
  rules:
    'After a random pause one plate lights green: hit it as fast as you can. Sometimes a plate lights red instead: do not shoot it. Shooting red, the wrong plate or before the light adds a penalty. Score is your average reaction time with penalties added.',
  players: '1',
  minTargets: 2,
  settings: [
    { key: 'rounds', label: 'Rounds', type: 'number', min: 3, max: 50, step: 1 },
    { key: 'minDelay', label: 'Shortest pause', type: 'number', min: 0.5, max: 5, step: 0.5, unit: 's' },
    { key: 'maxDelay', label: 'Longest pause', type: 'number', min: 1, max: 8, step: 0.5, unit: 's' },
    { key: 'timeout', label: 'Time to shoot', type: 'number', min: 1, max: 6, step: 0.5, unit: 's' },
    { key: 'noShoot', label: 'Red (no-shoot) chance', type: 'number', min: 0, max: 60, step: 5, unit: '%' },
    { key: 'penalty', label: 'Penalty', type: 'number', min: 0, max: 5, step: 0.5, unit: 's' },
  ],
  defaults: { rounds: 10, minDelay: 1, maxDelay: 3, timeout: 2.5, noShoot: 25, penalty: 1 },
  tournament: true,
  create: (ctx) => new Reaction(ctx),
};

/* ---------------- Sequence ---------------- */

export function buildSequence(ids: number[], order: string, length: number, rng: () => number): number[] {
  const n = ids.length;
  const len = length > 0 ? length : n;
  if (len <= n) {
    const base = order === 'ltr' ? ids.slice() : order === 'rtl' ? ids.slice().reverse() : shuffle(ids, rng);
    return base.slice(0, len);
  }
  // Longer than the number of plates: random with repeats, never the same plate twice in a row.
  const seq: number[] = [];
  for (let i = 0; i < len; i++) {
    const pool = ids.filter((x) => x !== seq[i - 1]);
    seq.push(pick(pool.length ? pool : ids, rng));
  }
  return seq;
}

class Sequence extends BaseMode {
  private seq: number[] = [];
  private pos = 0;
  private penalties = 0;

  protected onStart() {
    this.seq = buildSequence(this.ids, this.s.order || 'random', this.s.length || 0, this.ctx.rng);
    this.pos = 0;
    this.show();
  }

  private show() {
    for (const id of this.ids) {
      const nextIdx = this.seq.indexOf(id, this.pos);
      const label = nextIdx >= 0 ? String(nextIdx + 1) : undefined;
      if (id === this.seq[this.pos]) this.set(id, 'active', { label });
      else this.set(id, nextIdx >= 0 ? 'idle' : 'hit', { label });
    }
  }

  hit(id: number, now: number, amp: number) {
    if (!this.tv[id] || this.done) return;
    if (id === this.seq[this.pos]) {
      this.rec(id, now, amp, true, `#${this.pos + 1}`);
      this.pos++;
      if (this.pos >= this.seq.length) {
        this.show();
        this.finish(now);
      } else this.show();
    } else {
      this.penalties++;
      this.rec(id, now, amp, false, `wrong order (+${this.s.penalty ?? 2} s)`);
    }
  }

  private total() {
    if (this.pos < this.seq.length) return Infinity;
    return this.endT - this.t0 + this.penalties * (this.s.penalty ?? 2) * 1000;
  }

  view(now: number): ModeView {
    return {
      targets: this.targetsView(),
      players: [{ name: this.ctx.players[0] || 'Shooter', display: `${this.pos}/${this.seq.length}`, active: true }],
      clock: this.elapsed(now),
      sub: `${this.penalties} wrong-order penalt${this.penalties === 1 ? 'y' : 'ies'} (+${this.penalties * (this.s.penalty ?? 2)} s)`,
      strip: this.seq.map((id, i) => ({ id, done: i < this.pos, current: i === this.pos })),
    };
  }

  result(): ModeResult {
    const t = this.total();
    const ok = Number.isFinite(t);
    return {
      rows: [
        {
          name: this.ctx.players[0] || 'Shooter',
          primary: ok ? t : 1e9,
          better: 'lower',
          display: ok ? fmtSec(t) : 'DNF',
          detail: `${fmtSec(this.elapsed(this.endT))} raw + ${this.penalties} penalties`,
        },
      ],
      summary: ok ? `Sequence of ${this.seq.length} in ${fmtSec(t)}` : `Stopped at ${this.pos} of ${this.seq.length}`,
    };
  }
}

export const sequence: ModeDef = {
  id: 'sequence',
  name: 'Sequence',
  blurb: 'Hit the plates in the order shown. Wrong order costs time.',
  rules: 'The next plate in the sequence lights green and shows its number. Hit them in order. Each wrong plate adds a time penalty. Final score is raw time plus penalties.',
  players: '1',
  minTargets: 2,
  settings: [
    {
      key: 'order',
      label: 'Order',
      type: 'select',
      options: [
        { value: 'random', label: 'Random' },
        { value: 'ltr', label: 'Left to right' },
        { value: 'rtl', label: 'Right to left' },
      ],
    },
    { key: 'length', label: 'Length', type: 'number', min: 0, max: 24, step: 1, help: '0 = each plate once; longer repeats plates' },
    { key: 'penalty', label: 'Wrong-order penalty', type: 'number', min: 0, max: 10, step: 0.5, unit: 's' },
  ],
  defaults: { order: 'random', length: 0, penalty: 2 },
  tournament: true,
  create: (ctx) => new Sequence(ctx),
};
