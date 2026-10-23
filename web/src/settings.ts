import { createStore, safeStorage } from './store';

export type Shape = 'circle' | 'square' | 'popper' | 'silhouette';

export interface TargetConfig {
  id: number;
  name: string;
  shape: Shape;
  /** Position on the range, 0..1 left→right */
  x: number;
  /** 0..1 top→bottom */
  y: number;
  /** Relative size, 0.6–1.6 */
  size: number;
  threshold: number;
  debounce: number;
}

export interface Preset {
  name: string;
  settings: Record<string, any>;
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  volume: number;
  mute: { timer: boolean; hits: boolean; alerts: boolean; music: boolean };
  voice: boolean;
  targetCount: number;
  targets: TargetConfig[];
  players: string[];
  modeId: string;
  modeSettings: Record<string, Record<string, any>>;
  presets: Preset[];
  broadcast: boolean;
  wsUrl: string;
  keepalive: boolean;
}

const SHAPES: Shape[] = ['circle', 'popper', 'square', 'circle', 'silhouette', 'popper', 'square', 'circle'];

export function defaultTarget(id: number, count: number): TargetConfig {
  const i = id - 1;
  return {
    id,
    name: `Plate ${id}`,
    shape: SHAPES[i % SHAPES.length],
    x: (i + 0.5) / count,
    y: 0.42 + (i % 2) * 0.14,
    size: SHAPES[i % SHAPES.length] === 'silhouette' ? 1.25 : 1,
    threshold: 300,
    debounce: 150,
  };
}

export function layoutTargets(count: number, existing: TargetConfig[] = []): TargetConfig[] {
  const out: TargetConfig[] = [];
  for (let id = 1; id <= count; id++) out.push(existing.find((t) => t.id === id) ?? defaultTarget(id, count));
  return out;
}

const DEFAULTS: Settings = {
  theme: 'system',
  volume: 0.8,
  mute: { timer: false, hits: false, alerts: false, music: false },
  voice: true,
  targetCount: 6,
  targets: layoutTargets(6),
  players: ['Shooter 1', 'Shooter 2'],
  modeId: 'speed',
  modeSettings: {},
  presets: [],
  broadcast: false,
  wsUrl: '',
  keepalive: true,
};

const KEY = 'steelstrike.settings.v1';
export const settings = createStore<Settings>(safeStorage.get(KEY, DEFAULTS));
settings.sub(() => safeStorage.put(KEY, settings.get()));

export function applyTheme() {
  const t = settings.get().theme;
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

/** Target ids ordered left-to-right on the range (what "left side" means in versus modes). */
export function orderedIds(): number[] {
  return settings
    .get()
    .targets.slice()
    .sort((a, b) => a.x - b.x)
    .map((t) => t.id);
}
