import { BaseMode, fmtSec } from '../engine/base';
import type { ModeContext, ModeDef, ModeResult, ModeView } from '../engine/types';
import { LED, PLAYER_COLORS } from '../engine/types';

function twoPlayers(ctx: ModeContext): string[] {
  const p = ctx.players.filter(Boolean);
  while (p.length < 2) p.push(`Shooter ${p.length + 1}`);
  return p;
}

/* ---------------- Head-to-Head ---------------- */

type HPhase = 'run' | 'between' | 'standby';

/** Left half of the plates belongs to shooter 1, right half to shooter 2 (odd middle plate is unused). */
export function splitSides(ids: number[]): [number[], number[]] {
  const half = Math.floor(ids.length / 2);
  return [ids.slice(0, half), ids.slice(ids.length - half)];
}

class HeadToHead extends BaseMode {
  private players: string[];
  private sides: [number[], number[]];
  private remaining: [Set<number>, Set<number>] = [new Set(), new Set()];
  private wins = [0, 0];
  private round = 0;
  private phase: HPhase = 'run';
  private roundStart = 0;
  private lastRoundMs = 0;
  private phaseEnd = 0;
  private best: (number | null)[] = [null, null];
  private msg = '';

  constructor(ctx: ModeContext) {
    super(ctx);
    this.players = twoPlayers(ctx).slice(0, 2);
    this.sides = splitSides(ctx.ids);
  }

  private get needed() {
    return Math.floor((this.s.bestOf || 3) / 2) + 1;
  }

  protected onStart(now: number) {
    this.startRound(now);
  }

  private startRound(now: number) {
    this.round++;
    this.phase = 'run';
    this.roundStart = now;
    for (let p = 0; p < 2; p++) {
      this.remaining[p] = new Set(this.sides[p]);
      for (const id of this.sides[p]) this.set(id, 'owned', { color: PLAYER_COLORS[p], ledColor: LED.players[p] });
    }
    for (const id of this.ids) if (!this.sides[0].includes(id) && !this.sides[1].includes(id)) this.set(id, 'idle');
    this.msg = `Round ${this.round}`;
  }

  private sideOf(id: number): 0 | 1 | -1 {
    return this.sides[0].includes(id) ? 0 : this.sides[1].includes(id) ? 1 : -1;
  }

  hit(id: number, now: number, amp: number) {
    if (this.done || this.phase !== 'run' || !this.tv[id]) return;
    const sd = this.sideOf(id);
    if (sd === -1 || !this.remaining[sd].has(id)) {
      this.rec(id, now, amp, false, sd === -1 ? 'neutral plate' : 'already down');
      return;
    }
    const side: 0 | 1 = sd;
    this.rec(id, now, amp, true, this.players[side], side);
    this.remaining[side].delete(id);
    this.set(id, 'hit', { color: PLAYER_COLORS[side] });
    if (this.remaining[side].size) return;
    const t = now - this.roundStart;
    this.lastRoundMs = t;
    this.wins[side]++;
    this.best[side] = this.best[side] === null ? t : Math.min(this.best[side]!, t);
    this.msg = `${this.players[side]} takes round ${this.round} · ${fmtSec(t)}`;
    this.fx.say(`${this.players[side]} wins the round`);
    if (this.wins[side] >= this.needed) {
      this.msg = `${this.players[side]} wins the match`;
      this.fx.sound('record');
      this.finish(now, false);
      this.fx.ledAll(LED.players[side], 'blink', 3000);
      return;
    }
    this.fx.sound('end');
    this.phase = 'between';
    this.phaseEnd = now + (this.s.pause ?? 4) * 1000;
    this.fx.ledAll(LED.off, 'off');
  }

  tick(now: number) {
    if (this.done || now < this.phaseEnd) return;
    if (this.phase === 'between') {
      this.phase = 'standby';
      this.msg = `Round ${this.round + 1} — standby`;
      this.fx.sound('standby');
      this.fx.say('Standby');
      this.phaseEnd = now + 1500 + this.ctx.rng() * 2000;
    } else if (this.phase === 'standby') {
      this.fx.sound('beep');
      this.startRound(now);
    }
  }

  view(now: number): ModeView {
    return {
      targets: this.targetsView(),
      players: this.players.map((name, p) => ({
        name,
        color: PLAYER_COLORS[p],
        active: this.phase === 'run',
        display: `${this.wins[p]} won · ${this.phase === 'run' && !this.done ? `${this.remaining[p].size} left` : this.best[p] !== null ? `best ${fmtSec(this.best[p]!)}` : '—'}`,
      })),
      clock: this.phase === 'run' && !this.done ? now - this.roundStart : this.lastRoundMs,
      message: this.msg,
      sub: `First to ${this.needed} round${this.needed > 1 ? 's' : ''} · left plates: ${this.players[0]}, right plates: ${this.players[1]}`,
    };
  }

  result(): ModeResult {
    const rows = this.players.map((name, p) => ({
      name,
      primary: this.wins[p],
      better: 'higher' as const,
      display: `${this.wins[p]} round${this.wins[p] === 1 ? '' : 's'}`,
      detail: this.best[p] !== null ? `best round ${fmtSec(this.best[p]!)}` : 'no rounds won',
    }));
    const w = this.wins[0] === this.wins[1] ? undefined : this.players[this.wins[0] > this.wins[1] ? 0 : 1];
    return { rows, winner: w, summary: w ? `${w} wins ${Math.max(...this.wins)}–${Math.min(...this.wins)}` : 'Match stopped level' };
  }
}

export const headToHead: ModeDef = {
  id: 'h2h',
  name: 'Head-to-Head',
  blurb: 'Two shooters, one side each. First to clear their side wins the round.',
  rules:
    'Plates split down the middle: left side belongs to shooter 1 (orange), right side to shooter 2 (blue). Both shoot at the same beep. First to drop every plate on their side takes the round. Best of 3 or 5.',
  players: '2',
  minTargets: 2,
  settings: [
    {
      key: 'bestOf',
      label: 'Match length',
      type: 'select',
      options: [
        { value: '1', label: 'Single round' },
        { value: '3', label: 'Best of 3' },
        { value: '5', label: 'Best of 5' },
        { value: '7', label: 'Best of 7' },
      ],
    },
    { key: 'pause', label: 'Pause between rounds', type: 'number', min: 2, max: 20, step: 1, unit: 's' },
  ],
  defaults: { bestOf: '3', pause: 4 },
  create: (ctx) => new HeadToHead({ ...ctx, settings: { ...ctx.settings, bestOf: Number(ctx.settings.bestOf) || 3 } }),
};

/* ---------------- Duel / Steal ---------------- */

type DPhase = 'turn' | 'pause' | 'standby';

class Steal extends BaseMode {
  private players: string[];
  private owner: Record<number, number | null> = {};
  private hits: number[];
  private turn = 0;
  private phase: DPhase = 'turn';
  private phaseEnd = 0;
  private msg = '';

  constructor(ctx: ModeContext) {
    super(ctx);
    this.players = twoPlayers(ctx);
    this.hits = this.players.map(() => 0);
    for (const id of ctx.ids) this.owner[id] = null;
  }

  private get total() {
    return this.players.length * (this.s.turns || 3);
  }
  private get cur() {
    return this.turn % this.players.length;
  }

  protected onStart(now: number) {
    this.beginTurn(now);
  }

  private paint() {
    for (const id of this.ids) {
      const o = this.owner[id];
      if (o === null) this.set(id, this.phase === 'turn' ? 'active' : 'idle');
      else this.set(id, 'owned', { color: PLAYER_COLORS[o], ledColor: LED.players[o] });
    }
  }

  private beginTurn(now: number) {
    this.phase = 'turn';
    this.phaseEnd = now + (this.s.turnSeconds || 6) * 1000;
    this.msg = `${this.players[this.cur]} — steal!`;
    this.paint();
  }

  hit(id: number, now: number, amp: number) {
    if (this.done || this.phase !== 'turn' || !(id in this.owner)) return;
    const p = this.cur;
    if (this.owner[id] === p) {
      this.rec(id, now, amp, false, 'already yours', p);
      return;
    }
    const prev = this.owner[id];
    this.owner[id] = p;
    this.hits[p]++;
    this.rec(id, now, amp, true, prev !== null ? `stolen from ${this.players[prev]}` : 'claimed', p);
    this.set(id, 'owned', { color: PLAYER_COLORS[p], ledColor: LED.players[p] });
  }

  tick(now: number) {
    if (this.done || now < this.phaseEnd) return;
    if (this.phase === 'turn') {
      this.turn++;
      if (this.turn >= this.total) {
        const scores = this.plates();
        const best = Math.max(...scores);
        const leaders = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
        this.msg = leaders.length === 1 ? `${this.players[leaders[0]]} wins` : 'Tie on plates';
        this.fx.sound('record');
        this.finish(now, false);
        return;
      }
      this.fx.sound('end');
      this.phase = 'pause';
      this.phaseEnd = now + (this.s.pause ?? 3) * 1000;
      this.msg = `Next: ${this.players[this.cur]}`;
      this.paint();
    } else if (this.phase === 'pause') {
      this.phase = 'standby';
      this.fx.sound('standby');
      this.fx.say(`${this.players[this.cur]}, standby`);
      this.phaseEnd = now + 1200 + this.ctx.rng() * 1500;
    } else {
      this.fx.sound('beep');
      this.beginTurn(now);
    }
  }

  private plates() {
    return this.players.map((_, p) => this.ids.filter((id) => this.owner[id] === p).length);
  }

  view(now: number): ModeView {
    const plates = this.plates();
    const turnMs = (this.s.turnSeconds || 6) * 1000;
    return {
      targets: this.targetsView(),
      players: this.players.map((name, p) => ({
        name,
        color: PLAYER_COLORS[p],
        active: !this.done && p === this.cur && this.phase === 'turn',
        display: `${plates[p]} plate${plates[p] === 1 ? '' : 's'}`,
      })),
      clock: this.phase === 'turn' && !this.done ? Math.max(0, this.phaseEnd - now) : this.phase === 'turn' ? 0 : turnMs,
      countdown: true,
      message: this.msg,
      sub: `Turn ${Math.min(this.turn + 1, this.total)} of ${this.total}`,
    };
  }

  result(): ModeResult {
    const plates = this.plates();
    const rows = this.players.map((name, p) => ({
      name,
      primary: plates[p] + this.hits[p] / 1000, // hits break ties
      better: 'higher' as const,
      display: `${plates[p]} plates`,
      detail: `${this.hits[p]} claims/steals`,
    }));
    const sorted = rows.slice().sort((a, b) => b.primary - a.primary);
    const winner = sorted.length > 1 && sorted[0].primary === sorted[1].primary ? undefined : sorted[0].name;
    return { rows, winner, summary: winner ? `${winner} holds the most plates` : 'Dead even' };
  }
}

export const steal: ModeDef = {
  id: 'steal',
  name: 'Duel · Steal',
  blurb: 'Take turns. Every hit paints the plate your colour — steal them back.',
  rules:
    'Shooters take timed turns on the same plates. A hit on a neutral plate claims it; a hit on a rival’s plate steals it. After the last turn, whoever owns the most plates wins (claims break a tie).',
  players: 'n',
  minTargets: 2,
  settings: [
    { key: 'turnSeconds', label: 'Turn length', type: 'number', min: 3, max: 30, step: 1, unit: 's' },
    { key: 'turns', label: 'Turns each', type: 'number', min: 1, max: 10, step: 1 },
    { key: 'pause', label: 'Pause between turns', type: 'number', min: 1, max: 15, step: 1, unit: 's' },
  ],
  defaults: { turnSeconds: 6, turns: 3, pause: 3 },
  create: (ctx) => new Steal(ctx),
};
