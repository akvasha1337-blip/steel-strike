import { BaseMode, fmtSec, pick, shuffle } from '../engine/base';
import type { HitRecord, ModeContext, ModeDef, ModeInstance, ModeResult, ModeView, ResultRow } from '../engine/types';
import { LED } from '../engine/types';

/* ---------------- Tournament / Ladder ---------------- */

type TPhase = 'run' | 'between' | 'standby' | 'done';

/** Rank rows best-first. */
export function rank(rows: ResultRow[]): ResultRow[] {
  return rows.slice().sort((a, b) => (a.better === 'lower' ? a.primary - b.primary : b.primary - a.primary));
}

class Tournament implements ModeInstance {
  private idx = 0;
  private phase: TPhase = 'run';
  private inst!: ModeInstance;
  private rows: ResultRow[] = [];
  private finished: HitRecord[] = [];
  private phaseEnd = 0;
  private lastClock = 0;
  private players: string[];
  private base: ModeDef;

  constructor(private ctx: ModeContext, registry: () => ModeDef[]) {
    this.players = ctx.players.filter(Boolean);
    if (!this.players.length) this.players = ['Shooter 1'];
    const all = registry();
    this.base = all.find((m) => m.id === ctx.settings.base) || all.find((m) => m.id === 'speed')!;
  }

  get records(): HitRecord[] {
    return this.phase === 'run' && this.inst ? [...this.finished, ...this.inst.records.map((r) => ({ ...r, player: this.idx }))] : this.finished;
  }

  start(now: number) {
    this.runCurrent(now);
  }

  private runCurrent(now: number) {
    this.phase = 'run';
    this.inst = this.base.create({
      ...this.ctx,
      players: [this.players[this.idx]],
      settings: { ...this.base.defaults, ...(this.ctx.settings.baseSettings || {}) },
    });
    this.inst.start(now);
  }

  private endRun(now: number) {
    const row = this.inst.result().rows[0];
    this.rows.push({ ...row, name: this.players[this.idx] });
    this.finished.push(...this.inst.records.map((r) => ({ ...r, player: this.idx })));
    this.lastClock = this.inst.view(now).clock ?? 0;
    this.idx++;
    if (this.idx >= this.players.length) {
      this.phase = 'done';
      this.ctx.fx.sound('record');
      this.ctx.fx.ledAll(LED.off, 'off');
      return;
    }
    this.phase = 'between';
    this.phaseEnd = now + (this.ctx.settings.intermission ?? 10) * 1000;
    this.ctx.fx.say(`Next shooter: ${this.players[this.idx]}`);
  }

  hit(id: number, now: number, amp: number) {
    if (this.phase !== 'run') return;
    this.inst.hit(id, now, amp);
    if (this.inst.isDone()) this.endRun(now);
  }

  tick(now: number) {
    if (this.phase === 'run') {
      this.inst.tick(now);
      if (this.inst.isDone()) this.endRun(now);
    } else if (this.phase === 'between' && now >= this.phaseEnd) {
      this.phase = 'standby';
      this.ctx.fx.sound('standby');
      this.ctx.fx.say(`${this.players[this.idx]}, standby`);
      this.phaseEnd = now + 1500 + this.ctx.rng() * 2500;
    } else if (this.phase === 'standby' && now >= this.phaseEnd) {
      this.ctx.fx.sound('beep');
      this.runCurrent(now);
    }
  }

  stop(now: number) {
    if (this.phase === 'run') {
      this.inst.stop(now);
      this.endRun(now);
    }
    this.phase = 'done';
    this.ctx.fx.ledAll(LED.off, 'off');
  }

  isDone() {
    return this.phase === 'done';
  }

  view(now: number): ModeView {
    const board = rank(this.rows);
    if (this.phase === 'run') {
      const v = this.inst.view(now);
      return {
        ...v,
        message: `${this.players[this.idx]} · shooter ${this.idx + 1} of ${this.players.length}`,
        players: [
          ...v.players.map((p) => ({ ...p, name: this.players[this.idx], active: true })),
          ...board.map((r) => ({ name: r.name, display: r.display })),
        ],
      };
    }
    const targets: ModeView['targets'] = {};
    for (const id of this.ctx.ids) targets[id] = { id, state: 'idle' };
    const left = Math.max(0, Math.ceil((this.phaseEnd - now) / 1000));
    return {
      targets,
      players: board.map((r, i) => ({ name: `${i + 1}. ${r.name}`, display: r.display, active: i === 0 })),
      clock: this.lastClock,
      message:
        this.phase === 'done'
          ? `${board[0]?.name ?? ''} wins`
          : this.phase === 'between'
            ? `Next: ${this.players[this.idx]} — step up (${left} s)`
            : `${this.players[this.idx]} — standby`,
      sub: `${this.base.name} ladder · ${this.rows.length} of ${this.players.length} done`,
    };
  }

  result(): ModeResult {
    const rows = rank(this.rows);
    return { rows, winner: rows[0]?.name, summary: `${this.base.name} ladder, ${rows.length} shooters` };
  }
}

export function makeTournament(registry: () => ModeDef[]): ModeDef {
  return {
    id: 'tournament',
    name: 'Tournament · Ladder',
    blurb: 'Shooters take turns at one mode. Ranked leaderboard at the end.',
    rules:
      'Pick a mode. Each shooter in the player list runs it once, in order, with a short break to swap at the line. The next run starts automatically with a standby and beep. Final ranking uses that mode’s score.',
    players: 'n',
    minTargets: 2,
    settings: [
      {
        key: 'base',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'speed', label: 'Speed Clear' },
          { value: 'timed', label: 'Timed Challenge' },
          { value: 'reaction', label: 'Reaction · Green Light' },
          { value: 'sequence', label: 'Sequence' },
          { value: 'free', label: 'Free Practice' },
          { value: 'custom', label: 'Custom drill' },
        ],
        help: 'Uses that mode’s current settings',
      },
      { key: 'intermission', label: 'Swap time between shooters', type: 'number', min: 3, max: 60, step: 1, unit: 's' },
    ],
    defaults: { base: 'speed', intermission: 10 },
    create: (ctx) => new Tournament(ctx, registry),
  };
}

/* ---------------- Custom builder ---------------- */

type CPhase = 'run' | 'between' | 'standby';

class Custom extends BaseMode {
  private live: number[];
  private noShoot: number[];
  private round = 0;
  private phase: CPhase = 'run';
  private phaseEnd = 0;
  private roundStart = 0;
  private remaining = new Set<number>();
  private seq: number[] = [];
  private pos = 0;
  private lit = new Set<number>();
  private totalMs = 0;
  private penalties = 0;
  private points = 0;
  private msg = '';
  private roundTimes: number[] = [];

  constructor(ctx: ModeContext) {
    super(ctx);
    const ns: number[] = (ctx.settings.noShoot || []).map(Number).filter((x: number) => ctx.ids.includes(x));
    this.noShoot = ns.length >= ctx.ids.length ? [] : ns;
    this.live = ctx.ids.filter((x) => !this.noShoot.includes(x));
  }

  private get objective(): 'clear' | 'sequence' | 'max' {
    return this.s.objective || 'clear';
  }
  private get limitMs() {
    const l = (this.s.timeLimit || 0) * 1000;
    return this.objective === 'max' && !l ? 20000 : l;
  }
  private get penMs() {
    return (this.s.penalty ?? 2) * 1000;
  }

  protected onStart(now: number) {
    this.startRound(now);
  }

  private startRound(now: number) {
    this.round++;
    this.phase = 'run';
    this.roundStart = now;
    this.msg = (this.s.rounds || 1) > 1 ? `Round ${this.round} of ${this.s.rounds}` : '';
    for (const id of this.noShoot) this.set(id, 'noshoot');
    if (this.objective === 'clear') {
      this.remaining = new Set(this.live);
      for (const id of this.live) this.set(id, 'active');
    } else if (this.objective === 'sequence') {
      this.seq = this.s.random === false ? this.live.slice() : shuffle(this.live, this.ctx.rng);
      this.pos = 0;
      this.showSeq();
    } else {
      this.lit.clear();
      for (const id of this.live) this.set(id, 'idle');
      this.lightOne(undefined);
    }
  }

  private showSeq() {
    this.seq.forEach((id, i) => {
      if (i < this.pos) this.set(id, 'hit', { label: String(i + 1) });
      else if (i === this.pos) this.set(id, 'active', { label: String(i + 1) });
      else this.set(id, 'idle', { label: String(i + 1) });
    });
  }

  private lightOne(avoid: number | undefined) {
    let pool = this.live.filter((x) => x !== avoid);
    if (!pool.length) pool = this.live;
    const id = pick(pool, this.ctx.rng);
    this.lit.add(id);
    this.set(id, 'active');
  }

  private endRound(now: number, missed: number) {
    const t = now - this.roundStart;
    this.roundTimes.push(t);
    this.totalMs += t;
    if (missed) this.penalties += missed;
    if (this.round >= (this.s.rounds || 1)) {
      this.finish(now);
      return;
    }
    this.fx.sound('end');
    this.fx.ledAll(LED.off, 'off');
    this.phase = 'between';
    this.phaseEnd = now + 3000;
    this.msg = `Round ${this.round} done · ${fmtSec(t)}`;
  }

  hit(id: number, now: number, amp: number) {
    if (this.done || this.phase !== 'run' || !this.tv[id]) return;
    if (this.noShoot.includes(id)) {
      this.penalties++;
      if (this.objective === 'max') this.points--;
      this.rec(id, now, amp, false, 'no-shoot');
      return;
    }
    if (this.objective === 'clear') {
      if (!this.remaining.has(id)) return void this.rec(id, now, amp, false, 'extra hit');
      this.rec(id, now, amp, true);
      this.remaining.delete(id);
      this.set(id, 'hit');
      if (!this.remaining.size) this.endRound(now, 0);
    } else if (this.objective === 'sequence') {
      if (id !== this.seq[this.pos]) {
        this.penalties++;
        return void this.rec(id, now, amp, false, 'wrong order');
      }
      this.rec(id, now, amp, true, `#${this.pos + 1}`);
      this.pos++;
      this.showSeq();
      if (this.pos >= this.seq.length) this.endRound(now, 0);
    } else {
      if (!this.lit.has(id)) {
        this.points--;
        return void this.rec(id, now, amp, false, 'unlit plate −1');
      }
      this.points++;
      this.rec(id, now, amp, true);
      this.lit.delete(id);
      this.set(id, 'idle');
      this.lightOne(id);
    }
  }

  tick(now: number) {
    if (this.done) return;
    if (this.phase === 'run') {
      if (this.limitMs && now - this.roundStart >= this.limitMs) {
        const end = this.roundStart + this.limitMs;
        if (this.objective === 'clear') this.endRound(end, this.remaining.size);
        else if (this.objective === 'sequence') this.endRound(end, this.seq.length - this.pos);
        else this.endRound(end, 0);
      }
    } else if (now >= this.phaseEnd) {
      if (this.phase === 'between') {
        this.phase = 'standby';
        this.fx.sound('standby');
        this.msg = `Round ${this.round + 1} — standby`;
        this.phaseEnd = now + 1500 + this.ctx.rng() * 2000;
      } else {
        this.fx.sound('beep');
        this.startRound(now);
      }
    }
  }

  stop(now: number) {
    if (this.phase === 'run' && !this.done) {
      const missed = this.objective === 'clear' ? this.remaining.size : this.objective === 'sequence' ? this.seq.length - this.pos : 0;
      this.roundTimes.push(now - this.roundStart);
      this.totalMs += now - this.roundStart;
      this.penalties += missed;
    }
    this.finish(now);
  }

  private score() {
    return this.objective === 'max' ? this.points : this.totalMs + this.penalties * this.penMs;
  }

  view(now: number): ModeView {
    const running = this.phase === 'run' && !this.done;
    const roundMs = running ? now - this.roundStart : this.roundTimes[this.roundTimes.length - 1] ?? 0;
    const lim = this.limitMs;
    const scoreTxt = this.objective === 'max' ? `${this.points} pts` : fmtSec(this.totalMs + (running ? roundMs : 0) + this.penalties * this.penMs);
    return {
      targets: this.targetsView(),
      players: [{ name: this.ctx.players[0] || 'Shooter', display: scoreTxt, active: true }],
      clock: lim ? Math.max(0, lim - roundMs) : roundMs,
      countdown: !!lim,
      message: this.msg,
      sub: `${this.penalties} penalt${this.penalties === 1 ? 'y' : 'ies'}${this.objective !== 'max' ? ` (+${fmtSec(this.penalties * this.penMs)})` : ''}`,
      strip: this.objective === 'sequence' ? this.seq.map((id, i) => ({ id, done: i < this.pos, current: i === this.pos })) : undefined,
    };
  }

  result(): ModeResult {
    const sc = this.score();
    const isMax = this.objective === 'max';
    return {
      rows: [
        {
          name: this.ctx.players[0] || 'Shooter',
          primary: sc,
          better: isMax ? 'higher' : 'lower',
          display: isMax ? `${sc} pts` : fmtSec(sc),
          detail: `${this.roundTimes.length} round(s) · ${this.penalties} penalties${isMax ? '' : ` · raw ${fmtSec(this.totalMs)}`}`,
        },
      ],
      summary: isMax ? `${sc} points` : `Total ${fmtSec(sc)} including penalties`,
    };
  }
}

export const custom: ModeDef = {
  id: 'custom',
  name: 'Custom Drill',
  blurb: 'Build your own: objective, time limit, no-shoots, rounds. Save as a preset.',
  rules:
    'Choose what counts: clear every plate, follow a sequence, or score the most lit plates. Mark plates as no-shoots (red) — hitting one costs a penalty. Add a time limit and several rounds. Plates still standing at the time limit count as penalties.',
  players: '1',
  minTargets: 1,
  settings: [
    {
      key: 'objective',
      label: 'Objective',
      type: 'select',
      options: [
        { value: 'clear', label: 'Clear all plates' },
        { value: 'sequence', label: 'Follow a sequence' },
        { value: 'max', label: 'Most lit plates in the time' },
      ],
    },
    { key: 'timeLimit', label: 'Time limit per round', type: 'number', min: 0, max: 300, step: 1, unit: 's', help: '0 = none (20 s for “most lit plates”)' },
    { key: 'rounds', label: 'Rounds', type: 'number', min: 1, max: 10, step: 1 },
    { key: 'penalty', label: 'Penalty', type: 'number', min: 0, max: 10, step: 0.5, unit: 's' },
    { key: 'random', label: 'Random sequence order', type: 'bool' },
    { key: 'noShoot', label: 'No-shoot plates', type: 'targets', help: 'Tap plates to mark them red' },
  ],
  defaults: { objective: 'clear', timeLimit: 0, rounds: 1, penalty: 2, random: true, noShoot: [] },
  tournament: true,
  create: (ctx) => new Custom(ctx),
};
