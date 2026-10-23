import { play, say } from './audio';
import { Session, type Phase } from './engine/session';
import type { Effects, ModeDef, ModeView } from './engine/types';
import { hub } from './hub';
import { MODES, modeById } from './modes';
import { orderedIds, settings } from './settings';
import { saveRun, type Run } from './storage';
import { createStore } from './store';

export type GameView = ModeView & { clockMs: number; phase: Phase };

export interface GameState {
  session: Session | null;
  view: GameView | null;
  lastRun: Run | null;
  personalBests: string[];
}

export const game = createStore<GameState>({ session: null, view: null, lastRun: null, personalBests: [] });

const fx: Effects = {
  sound: (name, opt) => play(name, opt),
  led: (id, color, mode = 'solid', ms) => hub.send({ c: 'led', id, color, mode, ...(ms ? { ms } : {}) }),
  ledAll: (color, mode = 'solid', ms) => hub.send({ c: 'ledAll', color, mode, ...(ms ? { ms } : {}) }),
  say: (t) => say(t),
};

export function modeSettings(def: ModeDef): Record<string, any> {
  const s = settings.get();
  const own = { ...def.defaults, ...(s.modeSettings[def.id] || {}) };
  if (def.id === 'tournament') {
    const base = modeById(own.base);
    own.baseSettings = { ...base.defaults, ...(s.modeSettings[base.id] || {}) };
  }
  return own;
}

export function playersFor(def: ModeDef): string[] {
  const p = settings.get().players.map((x) => x.trim()).filter(Boolean);
  if (def.players === '1') return [p[0] || 'Shooter 1'];
  if (def.players === '2') return [p[0] || 'Shooter 1', p[1] || 'Shooter 2'];
  return p.length ? p : ['Shooter 1', 'Shooter 2'];
}

export function settingsText(def: ModeDef, vals: Record<string, any>): string {
  const parts = def.settings
    .filter((d) => d.type !== 'targets')
    .map((d) => {
      const v = vals[d.key];
      if (d.type === 'bool') return v ? d.label : null;
      if (d.type === 'select') return d.options.find((o) => o.value === String(v))?.label ?? String(v);
      return `${d.label.toLowerCase()} ${v}${d.type === 'number' && d.unit ? (d.unit === '%' ? '%' : ' ' + d.unit) : ''}`;
    })
    .filter(Boolean);
  if (def.id === 'tournament') {
    const base = modeById(vals.base);
    parts.push(settingsText(base, vals.baseSettings || base.defaults));
  }
  return [`${settings.get().targets.length} plates`, ...parts].join(' · ');
}

let raf = 0;
let finalized = false;
let lastRelay = 0;

function loop() {
  const s = game.get().session;
  if (!s) return;
  const now = performance.now();
  s.tick(now);
  const view = s.view(now);
  game.set({ view });
  relay(view, now);
  if (s.phase === 'done' && !finalized) finalize(s);
  raf = requestAnimationFrame(loop);
}

function relay(view: GameView, now: number) {
  if (!settings.get().broadcast || now - lastRelay < 300) return;
  lastRelay = now;
  const s = game.get().session;
  hub.send({
    c: 'relay',
    d: {
      mode: s?.def.name,
      phase: view.phase,
      clock: Math.round(view.clockMs),
      countdown: !!view.countdown,
      message: view.message || '',
      sub: view.sub || '',
      players: view.players,
      targets: Object.values(view.targets).map((t) => [t.id, t.state, t.label ?? '', t.color ?? '']),
      layout: settings.get().targets.map((t) => [t.id, Math.round(t.x * 1000), Math.round(t.y * 1000), t.shape, t.size]),
    },
  });
}

async function finalize(s: Session) {
  finalized = true;
  const def = s.def;
  const vals = modeSettings(def);
  const run: Run = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: Date.now(),
    modeId: def.id,
    modeName: def.name,
    settingsText: settingsText(def, vals),
    result: s.result(),
    records: s.inst.records,
    players: playersFor(def),
    earlyShots: s.earlyShots,
  };
  game.set({ lastRun: run, personalBests: [] });
  const { personalBests } = await saveRun(run);
  if (personalBests.length) {
    play('record');
    say(`New personal best for ${personalBests.join(' and ')}`);
  }
  game.set({ personalBests });
}

export function startGame() {
  stopLoop();
  const s = settings.get();
  const def = modeById(s.modeId);
  const session = new Session({ def, settings: modeSettings(def), ids: orderedIds(), players: playersFor(def), fx });
  finalized = false;
  game.set({ session, personalBests: [] });
  session.start(performance.now());
  hub.send({ c: 'arm', ids: orderedIds() });
  raf = requestAnimationFrame(loop);
}

export function stopGame() {
  const s = game.get().session;
  if (!s) return;
  s.stop(performance.now());
}

/** Leave the game screen. */
export function closeGame() {
  const s = game.get().session;
  if (s && s.phase !== 'done' && s.phase !== 'ready') s.stop(performance.now());
  stopLoop();
  fx.ledAll('#000000', 'off');
  game.set({ session: null, view: null });
}

function stopLoop() {
  cancelAnimationFrame(raf);
}

hub.onHit((id, t, amp) => {
  const s = game.get().session;
  if (s) s.hit(id, t, amp);
});

export { MODES };
