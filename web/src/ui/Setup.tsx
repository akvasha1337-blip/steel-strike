import { useEffect, useState } from 'preact/hooks';
import { play, say, unlockAudio } from '../audio';
import { hub } from '../hub';
import { applyTheme, defaultTarget, layoutTargets, settings, type Shape, type TargetConfig } from '../settings';
import { useStore } from '../store';
import { Range } from './Range';

const SHAPES: { value: Shape; label: string }[] = [
  { value: 'circle', label: 'Round plate' },
  { value: 'square', label: 'Square plate' },
  { value: 'popper', label: 'Popper' },
  { value: 'silhouette', label: 'Silhouette' },
];

const ADC_MAX = 4095;

export function suggestThreshold(noise: number, peak: number): { value: number; ok: boolean } {
  const floor = Math.max(noise * 4, 60);
  const ceil = peak * 0.5;
  if (floor > ceil) return { value: Math.round(Math.min(ADC_MAX, floor)), ok: false };
  return { value: Math.round(Math.max(floor, Math.min(ceil, peak * 0.3))), ok: true };
}

function updateTarget(id: number, patch: Partial<TargetConfig>) {
  settings.set((s) => ({ targets: s.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

function sendCfg(t: TargetConfig) {
  hub.send({ c: 'cfg', id: t.id, threshold: t.threshold, debounce: t.debounce });
}

function CalPanel({ t }: { t: TargetConfig }) {
  const cal = useStore(hub.state, (s) => (s.cal && s.cal.id === t.id ? s.cal : null));
  if (!cal) return null;
  if (cal.stage === 'noise') return <div class="note">Keep the plate still — measuring background noise (3 s)…</div>;
  if (cal.stage === 'strike') return <div class="note">Now hit the plate firmly with a mallet (or a shot when the range is hot and you are behind the line).</div>;
  if (cal.stage === 'timeout') return <div class="note bad">No strike detected within 10 s. Check the piezo wiring and try again.</div>;
  const s = suggestThreshold(cal.noise, cal.peak);
  return (
    <div class={`note ${s.ok ? 'ok' : 'bad'} stack`} style="gap:6px">
      <span>
        Noise {cal.noise} · strike peak {cal.peak} → suggested threshold <b>{s.value}</b>
      </span>
      {!s.ok && <span>The strike is too weak compared with the noise. Re-bond the piezo to the steel, shorten the lead, or move the sensor closer to where bullets hit.</span>}
      <div class="row">
        <button
          class="btn sm primary"
          onClick={() => {
            const next = { ...t, threshold: s.value };
            updateTarget(t.id, { threshold: s.value });
            sendCfg(next);
            hub.state.set({ cal: null });
          }}
        >
          Use {s.value}
        </button>
        <button class="btn sm ghost" onClick={() => hub.state.set({ cal: null })}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function TargetCard({ t, selected, onSelect, connected }: { t: TargetConfig; selected: boolean; onSelect: () => void; connected: boolean }) {
  const level = useStore(hub.state, (s) => s.levels[t.id] ?? 0);
  const [peak, setPeak] = useState(0);
  useEffect(() => {
    if (level > peak) setPeak(level);
    const tm = setTimeout(() => setPeak((p) => Math.max(level, p * 0.6)), 600);
    return () => clearTimeout(tm);
  }, [level]);
  const pct = (v: number) => `${Math.min(100, (v / ADC_MAX) * 100)}%`;
  return (
    <article class={`tcard ${selected ? 'sel' : ''}`} onFocusIn={onSelect} onClick={onSelect}>
      <header>
        <b>{t.id}</b>
        <input type="text" id={`name-${t.id}`} aria-label={`Name of plate ${t.id}`} value={t.name} style="flex:1;min-width:120px" onInput={(e) => updateTarget(t.id, { name: (e.target as HTMLInputElement).value })} />
      </header>
      <div class="fields">
        <label class="field">
          <span>Shape</span>
          <select id={`shape-${t.id}`} value={t.shape} onChange={(e) => updateTarget(t.id, { shape: (e.target as HTMLSelectElement).value as Shape })}>
            {SHAPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>Size on screen</span>
          <input type="range" id={`size-${t.id}`} min={0.6} max={1.6} step={0.05} value={t.size} onInput={(e) => updateTarget(t.id, { size: Number((e.target as HTMLInputElement).value) })} />
        </label>
      </div>
      <div class="field">
        <span>
          Hit threshold <b class="tabnum">{t.threshold}</b> <span class="muted">— live signal</span>
        </span>
        <div class="meter" aria-hidden="true">
          <i style={{ width: pct(peak) }} />
          <b style={{ left: pct(t.threshold) }} />
        </div>
        <input
          type="range"
          id={`thr-${t.id}`}
          aria-label={`Hit threshold for plate ${t.id}`}
          min={40}
          max={3000}
          step={10}
          value={t.threshold}
          onInput={(e) => updateTarget(t.id, { threshold: Number((e.target as HTMLInputElement).value) })}
          onChange={() => sendCfg(settings.get().targets.find((x) => x.id === t.id)!)}
        />
        <small>Raise it if wind or nearby plates cause false hits; lower it if real hits are missed.</small>
      </div>
      <label class="field">
        <span>
          Ignore time after a hit <b class="tabnum">{t.debounce} ms</b>
        </span>
        <input
          type="range"
          id={`deb-${t.id}`}
          min={50}
          max={500}
          step={10}
          value={t.debounce}
          onInput={(e) => updateTarget(t.id, { debounce: Number((e.target as HTMLInputElement).value) })}
          onChange={() => sendCfg(settings.get().targets.find((x) => x.id === t.id)!)}
        />
      </label>
      <div class="row">
        <button class="btn sm" disabled={!connected} onClick={() => hub.send({ c: 'calibrate', id: t.id })}>
          Calibrate
        </button>
        <button class="btn sm" disabled={!connected} onClick={() => hub.send({ c: 'led', id: t.id, color: '#00FF00', mode: 'blink', ms: 1500 })}>
          Test light
        </button>
        <button class="btn sm ghost" onClick={() => hub.manualHit(t.id)} disabled={!connected}>
          Simulate hit
        </button>
      </div>
      <CalPanel t={t} />
    </article>
  );
}

export function SetupScreen() {
  const cfg = useStore(settings, (s) => s);
  const st = useStore(hub.state, (s) => ({ status: s.status, thresholds: s.thresholds }));
  const connected = st.status === 'connected';
  const [sel, setSel] = useState<number | null>(1);
  const [flash, setFlash] = useState<Record<number, number>>({});

  // Live signal while this screen is open.
  useEffect(() => {
    if (!connected) return;
    hub.send({ c: 'monitor', on: true });
    return () => hub.send({ c: 'monitor', on: false });
  }, [connected]);

  // Hits flash the plate on the layout so each sensor can be checked by tapping it.
  useEffect(
    () =>
      hub.onHit((id) => {
        setFlash((f) => ({ ...f, [id]: performance.now() }));
      }),
    [],
  );

  // Adopt thresholds the hub reports (the hub's stored values win).
  useEffect(() => {
    const th = st.thresholds;
    if (!Object.keys(th).length) return;
    settings.set((s) => ({ targets: s.targets.map((t) => (th[t.id] ? { ...t, threshold: th[t.id].threshold, debounce: th[t.id].debounce } : t)) }));
  }, [st.thresholds]);

  const setCount = (n: number) => {
    settings.set((s) => ({ targetCount: n, targets: layoutTargets(n, s.targets.filter((t) => t.id <= n)) }));
  };
  const respace = () => settings.set((s) => ({ targets: s.targets.map((t) => ({ ...t, x: defaultTarget(t.id, s.targets.length).x, y: defaultTarget(t.id, s.targets.length).y })) }));

  const views = Object.fromEntries(cfg.targets.map((t) => [t.id, { id: t.id, state: (sel === t.id ? 'active' : 'idle') as 'active' | 'idle', flash: flash[t.id], flashOk: true }]));

  return (
    <main class="page">
      <header class="pagehead">
        <h1>Setup</h1>
        <p>Arrange the plates the way they stand on the range, tune each sensor, and set up shooters and sound.</p>
      </header>

      <section class="panel stack">
        <div class="row">
          <h2 style="margin:0">Range layout</h2>
          <label class="field" style="margin-left:auto;grid-template-columns:auto auto;align-items:center">
            <span>Plates</span>
            <select id="target-count" value={cfg.targetCount} onChange={(e) => setCount(Number((e.target as HTMLSelectElement).value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button class="btn sm" onClick={respace}>
            Space evenly
          </button>
        </div>
        <Range targets={cfg.targets} views={views} selected={sel} showNames onPlate={setSel} onMove={(id, x, y) => updateTarget(id, { x, y })} label="Drag plates to match the range" />
        <p class="muted small" style="margin:0">
          Drag plates to match where they stand. Left-to-right order decides sides in Head-to-Head and the order in Sequence. Strike a plate: it ripples here.
        </p>
      </section>

      <section class="stack">
        <h2 class="section-title">Sensors</h2>
        {!connected && <div class="note">Connect to the hub (or the simulator) to see live signal, calibrate and test lights.</div>}
        <div class="grid3">
          {cfg.targets.map((t) => (
            <TargetCard key={t.id} t={t} selected={sel === t.id} onSelect={() => setSel(t.id)} connected={connected} />
          ))}
        </div>
      </section>

      <div class="grid2">
        <section class="panel stack">
          <h2>Shooters</h2>
          <div class="players-edit">
            {cfg.players.map((p, i) => (
              <div class="row" key={i}>
                <input
                  type="text"
                  id={`player-${i}`}
                  aria-label={`Shooter ${i + 1} name`}
                  value={p}
                  onInput={(e) => settings.set((s) => ({ players: s.players.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)) }))}
                />
                <button class="btn sm ghost" aria-label={`Remove ${p || 'shooter'}`} disabled={cfg.players.length <= 1} onClick={() => settings.set((s) => ({ players: s.players.filter((_, j) => j !== i) }))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button class="btn sm" disabled={cfg.players.length >= 16} onClick={() => settings.set((s) => ({ players: [...s.players, `Shooter ${s.players.length + 1}`] }))}>
            Add shooter
          </button>
          <p class="muted small" style="margin:0">Solo modes use the first name. Head-to-Head uses the first two. Steal and Tournament use everyone, in this order.</p>
        </section>

        <section class="panel stack">
          <h2>Sound & display</h2>
          <label class="field">
            <span>Volume {Math.round(cfg.volume * 100)}%</span>
            <input type="range" id="volume" min={0} max={1} step={0.05} value={cfg.volume} onInput={(e) => settings.set({ volume: Number((e.target as HTMLInputElement).value) })} />
          </label>
          <div class="grid2" style="gap:4px">
            {(
              [
                ['timer', 'Timer beeps'],
                ['hits', 'Steel ding on hits'],
                ['alerts', 'Buzzer for misses'],
                ['music', 'Personal-best fanfare'],
              ] as const
            ).map(([k, label]) => (
              <label class="check" key={k}>
                <input type="checkbox" id={`snd-${k}`} checked={!cfg.mute[k]} onChange={(e) => settings.set((s) => ({ mute: { ...s.mute, [k]: !(e.target as HTMLInputElement).checked } }))} />
                {label}
              </label>
            ))}
            <label class="check">
              <input type="checkbox" id="voice" checked={cfg.voice} onChange={(e) => settings.set({ voice: (e.target as HTMLInputElement).checked })} />
              Voice calls (“Shooter ready… standby”)
            </label>
          </div>
          <div class="row">
            <button
              class="btn sm"
              onClick={() => {
                unlockAudio();
                play('beep');
              }}
            >
              Test beep
            </button>
            <button
              class="btn sm"
              onClick={() => {
                unlockAudio();
                play('ding', { id: 3 });
              }}
            >
              Test ding
            </button>
            <button class="btn sm" onClick={() => say('Shooter ready. Standby.')}>
              Test voice
            </button>
          </div>
          <label class="field">
            <span>Theme</span>
            <select
              id="theme"
              value={cfg.theme}
              onChange={(e) => {
                settings.set({ theme: (e.target as HTMLSelectElement).value as any });
                applyTheme();
              }}
            >
              <option value="system">Match device</option>
              <option value="dark">Dark (best outdoors on a laptop)</option>
              <option value="light">Light (bright sun / projector)</option>
            </select>
          </label>
          <label class="check">
            <input
              type="checkbox"
              id="keepalive"
              checked={cfg.keepalive}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                settings.set({ keepalive: on });
                hub.send({ c: 'global', keepalive: on });
              }}
            />
            Power-bank keep-alive (dim LED blip every 20 s so banks don’t switch off)
          </label>
        </section>
      </div>
    </main>
  );
}
