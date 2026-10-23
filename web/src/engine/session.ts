import type { Effects, ModeDef, ModeInstance, ModeResult, ModeView } from './types';

export type Phase = 'ready' | 'standby' | 'running' | 'done';

export interface SessionOptions {
  def: ModeDef;
  settings: Record<string, any>;
  ids: number[];
  players: string[];
  fx: Effects;
  rng?: () => number;
  /** Random standby delay range before the start beep, ms. */
  standby?: [number, number];
}

/**
 * One run of a game mode, shot-timer style: Start → "standby" → random delay → BEEP → run → done.
 * Hits during standby are early shots (buzzer, counted, ignored for scoring).
 */
export class Session {
  phase: Phase = 'ready';
  inst: ModeInstance;
  earlyShots = 0;
  beepAt = 0;
  startedAt = 0;
  private message = '';
  private messageUntil = 0;
  private rng: () => number;

  constructor(private o: SessionOptions) {
    this.rng = o.rng ?? Math.random;
    this.inst = o.def.create({ ids: o.ids, players: o.players, settings: { ...o.def.defaults, ...o.settings }, rng: this.rng, fx: o.fx });
  }

  get def() {
    return this.o.def;
  }

  start(now: number) {
    if (this.phase !== 'ready') return;
    const [a, b] = this.o.standby ?? [1500, 4000];
    this.phase = 'standby';
    this.beepAt = now + a + this.rng() * (b - a);
    this.o.fx.ledAll('#000000', 'off');
    this.o.fx.sound('standby');
    this.o.fx.say('Shooter ready. Standby.');
  }

  tick(now: number) {
    if (this.phase === 'standby' && now >= this.beepAt) {
      this.phase = 'running';
      this.startedAt = now;
      this.o.fx.sound('beep');
      this.inst.start(now);
    }
    if (this.phase === 'running') {
      this.inst.tick(now);
      if (this.inst.isDone()) this.phase = 'done';
    }
  }

  hit(id: number, now: number, amp: number) {
    if (this.phase === 'standby') {
      this.earlyShots++;
      this.flash('Early shot — wait for the beep', now);
      this.o.fx.sound('buzz');
      return;
    }
    if (this.phase !== 'running') return;
    if (now < this.startedAt - 5) {
      // Struck before the beep but the message arrived after it.
      this.earlyShots++;
      this.flash('Early shot — wait for the beep', now);
      return;
    }
    this.inst.hit(id, now, amp);
    if (this.inst.isDone()) this.phase = 'done';
  }

  stop(now: number) {
    if (this.phase === 'standby') {
      this.phase = 'done';
      this.o.fx.ledAll('#000000', 'off');
      return;
    }
    if (this.phase === 'running') {
      this.inst.stop(now);
      this.phase = 'done';
    }
  }

  private flash(msg: string, now: number) {
    this.message = msg;
    this.messageUntil = now + 1800;
  }

  view(now: number): ModeView & { clockMs: number; phase: Phase } {
    const v = this.inst.view(now);
    const clockMs = this.phase === 'running' || this.phase === 'done' ? v.clock ?? 0 : 0;
    const msg = now < this.messageUntil ? this.message : this.phase === 'standby' ? 'Standby…' : v.message;
    return { ...v, message: msg, clockMs, phase: this.phase };
  }

  result(): ModeResult {
    return this.inst.result();
  }
}
