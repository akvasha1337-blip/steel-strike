import type { LedMode } from '../protocol';

export type TState = 'idle' | 'active' | 'hit' | 'miss' | 'noshoot' | 'offline' | 'owned';

export interface TargetView {
  id: number;
  state: TState;
  /** Small text on the plate, e.g. sequence position. */
  label?: string;
  /** Override colour (player ownership). */
  color?: string;
  /** LED colour to send for 'owned' plates. */
  ledColor?: string;
  /** Last split shown under the plate, in ms. */
  split?: number;
  /** Timestamp of the latest hit on this plate; changes trigger the ripple. */
  flash?: number;
  /** Whether that latest hit counted. */
  flashOk?: boolean;
}

export interface PlayerScore {
  name: string;
  display: string;
  color?: string;
  active?: boolean;
}

export interface ModeView {
  targets: Record<number, TargetView>;
  players: PlayerScore[];
  /** Big status line ("Round 2", "Hold!", "Shooter: Alex"). */
  message?: string;
  /** Clock override in ms (otherwise the session shows time since the beep). */
  clock?: number;
  /** Count down instead of up. */
  countdown?: boolean;
  /** Secondary line under the clock. */
  sub?: string;
  /** Optional strip of upcoming targets (sequence modes). */
  strip?: { id: number; done: boolean; current: boolean }[];
}

export interface HitRecord {
  /** ms since the start beep */
  t: number;
  id: number;
  amp: number;
  valid: boolean;
  /** time since the previous hit, ms */
  split: number;
  player?: number;
  note?: string;
}

export interface ResultRow {
  name: string;
  /** Number used for ranking. */
  primary: number;
  better: 'lower' | 'higher';
  display: string;
  detail?: string;
}

export interface ModeResult {
  rows: ResultRow[];
  winner?: string;
  summary: string;
}

export type SoundName = 'standby' | 'beep' | 'ding' | 'buzz' | 'tick' | 'end' | 'record' | 'go';

export interface Effects {
  sound(name: SoundName, opt?: { id?: number }): void;
  led(id: number, color: string, mode?: LedMode, ms?: number): void;
  ledAll(color: string, mode?: LedMode, ms?: number): void;
  say(text: string): void;
}

export interface ModeContext {
  /** Target ids in left-to-right order on the range. */
  ids: number[];
  players: string[];
  settings: Record<string, any>;
  rng: () => number;
  fx: Effects;
}

export interface ModeInstance {
  records: HitRecord[];
  /** Called at the start beep. */
  start(now: number): void;
  hit(id: number, now: number, amp: number): void;
  tick(now: number): void;
  /** Manual stop. */
  stop(now: number): void;
  isDone(): boolean;
  view(now: number): ModeView;
  result(): ModeResult;
}

export type SettingDef =
  | { key: string; label: string; type: 'number'; min: number; max: number; step?: number; unit?: string; help?: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: 'bool'; help?: string }
  | { key: string; label: string; type: 'targets'; help?: string };

export interface ModeDef {
  id: string;
  name: string;
  blurb: string;
  rules: string;
  players: '1' | '2' | 'n';
  minTargets: number;
  settings: SettingDef[];
  defaults: Record<string, any>;
  /** Can be run as a tournament's base mode. */
  tournament?: boolean;
  create(ctx: ModeContext): ModeInstance;
}

/** LED colours sent to the plates. Kept to pure primaries so they read well outdoors. */
export const LED = {
  go: '#00FF00',
  noShoot: '#FF0000',
  off: '#000000',
  done: '#0000FF',
  players: ['#FF6000', '#00A0FF', '#C000FF', '#FFFF00', '#00FFC0', '#FF0080', '#FFFFFF', '#80FF00'],
};

/** Screen colours for players (paired with LED colours above). */
export const PLAYER_COLORS = ['#F2711C', '#2F9BEF', '#A855F7', '#E8C53A', '#2CC9A5', '#E8508A', '#D9DEE6', '#8BD94B'];
