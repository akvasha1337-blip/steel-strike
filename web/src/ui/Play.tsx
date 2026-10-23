import { useEffect, useState } from 'preact/hooks';
import { unlockAudio } from '../audio';
import type { ModeDef, SettingDef } from '../engine/types';
import { closeGame, game, modeSettings, playersFor, startGame, stopGame } from '../game';
import { hub } from '../hub';
import { MODES, modeById } from '../modes';
import { settings } from '../settings';
import { useStore } from '../store';
import { Range } from './Range';

function setModeSetting(id: string, key: string, value: any) {
  settings.set((s) => ({ modeSettings: { ...s.modeSettings, [id]: { ...(s.modeSettings[id] || {}), [key]: value } } }));
}

function SettingField({ def, d, value }: { def: ModeDef; d: SettingDef; value: any }) {
  const id = `ms-${def.id}-${d.key}`;
  if (d.type === 'bool')
    return (
      <label class="check">
        <input type="checkbox" id={id} checked={!!value} onChange={(e) => setModeSetting(def.id, d.key, (e.target as HTMLInputElement).checked)} />
        {d.label}
      </label>
    );
  if (d.type === 'select')
    return (
      <label class="field">
        <span>{d.label}</span>
        <select id={id} value={String(value)} onChange={(e) => setModeSetting(def.id, d.key, (e.target as HTMLSelectElement).value)}>
          {d.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {d.help && <small>{d.help}</small>}
      </label>
    );
  if (d.type === 'targets') {
    const targets = settings.get().targets;
    const sel: number[] = (value || []).map(Number);
    return (
      <div class="field">
        <span>{d.label}</span>
        <div class="mini-targets" role="group" aria-label={d.label}>
          {targets.map((t) => (
            <button
              key={t.id}
              aria-pressed={sel.includes(t.id)}
              aria-label={`${t.name}${sel.includes(t.id) ? ' (no-shoot)' : ''}`}
              onClick={() => setModeSetting(def.id, d.key, sel.includes(t.id) ? sel.filter((x) => x !== t.id) : [...sel, t.id])}
            >
              {t.id}
            </button>
          ))}
        </div>
        {d.help && <small>{d.help}</small>}
      </div>
    );
  }
  return (
    <label class="field">
      <span>
        {d.label}
        {d.unit ? ` (${d.unit})` : ''}
      </span>
      <input
        type="number"
        id={id}
        inputMode="decimal"
        min={d.min}
        max={d.max}
        step={d.step ?? 1}
        value={value}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) setModeSetting(def.id, d.key, Math.min(d.max, Math.max(d.min, v)));
        }}
      />
      {d.help && <small>{d.help}</small>}
    </label>
  );
}

function Presets({ def }: { def: ModeDef }) {
  const presets = useStore(settings, (s) => s.presets);
  const [name, setName] = useState('');
  return (
    <div class="stack">
      <span class="label">Presets</span>
      {presets.length > 0 && (
        <div class="row">
          {presets.map((p, i) => (
            <span class="row" style="gap:4px" key={i}>
              <button class="btn sm" onClick={() => settings.set((s) => ({ modeSettings: { ...s.modeSettings, [def.id]: { ...p.settings } } }))}>
                {p.name}
              </button>
              <button class="btn sm ghost" aria-label={`Delete preset ${p.name}`} onClick={() => settings.set((s) => ({ presets: s.presets.filter((_, j) => j !== i) }))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          settings.set((s) => ({ presets: [...s.presets, { name: name.trim(), settings: { ...def.defaults, ...(s.modeSettings[def.id] || {}) } }] }));
          setName('');
        }}
      >
        <input type="text" id="preset-name" placeholder="Name this drill, e.g. Bill Drill" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style="flex:1;min-width:0" />
        <button class="btn sm" type="submit" disabled={!name.trim()}>
          Save preset
        </button>
      </form>
    </div>
  );
}

export function PlayScreen() {
  const cfg = useStore(settings, (s) => s);
  const st = useStore(hub.state, (s) => s.status);
  const session = useStore(game, (s) => s.session);
  const def = modeById(cfg.modeId);
  const vals = modeSettings(def);
  const players = playersFor(def);
  const tooFew = cfg.targets.length < def.minTargets;

  if (session) return <GameScreen />;

  return (
    <main class="page">
      <header class="pagehead">
        <h1>Play</h1>
        <p>Pick a mode, adjust the rules, and press Start. The timer gives a standby, a random pause and a beep — like a real shot timer.</p>
      </header>

      <section class="modes" aria-label="Game modes">
        {MODES.map((m) => (
          <button key={m.id} class="mode" aria-pressed={m.id === def.id} onClick={() => settings.set({ modeId: m.id })} id={`mode-${m.id}`}>
            <span class="who">{m.players === '1' ? 'Solo' : m.players === '2' ? '2 shooters' : 'Group'}</span>
            <b>{m.name}</b>
            <p>{m.blurb}</p>
          </button>
        ))}
      </section>

      <div class="grid2">
        <section class="panel stack">
          <h2>{def.name}</h2>
          <p class="muted" style="margin:0">{def.rules}</p>
          <div class="grid2" style="gap:12px">
            {def.settings.map((d) => (
              <SettingField key={d.key} def={def} d={d} value={vals[d.key]} />
            ))}
          </div>
          {def.id === 'tournament' && (
            <p class="muted small" style="margin:0">
              {modeById(vals.base).name} settings come from that mode’s card. Select it above to change them, then come back.
            </p>
          )}
          {def.id === 'custom' && <Presets def={def} />}
          <button class="btn sm ghost" style="justify-self:start" onClick={() => settings.set((s) => ({ modeSettings: { ...s.modeSettings, [def.id]: {} } }))}>
            Reset to defaults
          </button>
        </section>

        <section class="panel stack">
          <h2>Ready</h2>
          <div class="row">
            <span class="label">Shooters</span>
            <span>{players.join(' · ')}</span>
            <a href="#setup" class="small">
              Edit
            </a>
          </div>
          <Range targets={cfg.targets} label="Plates for this game" />
          {st !== 'connected' && <div class="note">Not connected — you can still play by clicking plates or pressing 1–8. Connect the hub or the simulator for real hits and lights.</div>}
          {tooFew && <div class="note bad">This mode needs at least {def.minTargets} plates.</div>}
          <button
            class="btn primary big"
            id="start-game"
            disabled={tooFew}
            onClick={() => {
              unlockAudio();
              startGame();
            }}
          >
            Start {def.name}
          </button>
          <p class="muted small" style="margin:0">
            Keys on the game screen: <span class="kbd">Space</span> start/stop · <span class="kbd">R</span> restart · <span class="kbd">1</span>–<span class="kbd">8</span> test hit ·{' '}
            <span class="kbd">F</span> fullscreen · <span class="kbd">Esc</span> exit
          </p>
        </section>
      </div>
    </main>
  );
}

export function Clock({ ms, countdown, phase }: { ms: number; countdown?: boolean; phase: string }) {
  const v = Math.max(0, countdown ? Math.ceil(ms / 10) * 10 : ms);
  const total = v / 1000;
  let txt: string;
  if (total >= 60) {
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    txt = `${m}:${s.toFixed(1).padStart(4, '0')}`;
  } else txt = total.toFixed(2);
  const cls = phase === 'running' ? 'run' : phase === 'standby' ? 'standby' : '';
  return (
    <div class={`clock ${cls}`} role="timer" aria-label={`${txt} seconds`}>
      {[...txt].map((ch, i) => (
        <span key={i} class={/\d/.test(ch) ? 'd' : 'p'}>
          {ch}
        </span>
      ))}
      <span class="u">s</span>
    </div>
  );
}

function GameScreen() {
  const g = useStore(game, (s) => s);
  const cfg = useStore(settings, (s) => s.targets);
  const link = useStore(hub.state, (s) => ({ status: s.status, kind: s.kind, nodes: s.nodes, latency: s.latency, botOn: s.botOn }));
  const view = g.view;
  const session = g.session!;
  const phase = view?.phase ?? 'ready';

  useEffect(() => {
    let lock: any = null;
    (navigator as any).wakeLock
      ?.request('screen')
      .then((l: any) => (lock = l))
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const ph = game.get().session?.phase;
      if (e.code === 'Space') {
        e.preventDefault();
        if (ph === 'running' || ph === 'standby') stopGame();
        else startGame();
      } else if (e.key === 'r' || e.key === 'R') startGame();
      else if (e.key === 'f' || e.key === 'F') toggleFs();
      else if (e.key === 'Escape') {
        if (!document.fullscreenElement) closeGame();
      } else if (/^[1-8]$/.test(e.key)) hub.manualHit(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      lock?.release?.().catch?.(() => {});
    };
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const offline = new Set(
    Object.values(link.nodes)
      .filter((n) => !n.online)
      .map((n) => n.id),
  );
  const captions: Record<number, string> = {};
  if (view)
    for (const t of Object.values(view.targets)) {
      if (t.split !== undefined && (t.state === 'hit' || (t.flash && performance.now() - t.flash < 2500))) captions[t.id] = (t.split / 1000).toFixed(2);
    }
  const records = session.inst.records;
  const recent = records.slice(-14);
  const res = phase === 'done' ? session.result() : null;

  return (
    <div class="game" role="dialog" aria-label={`${session.def.name} game`}>
      <div class="game-top">
        <span class="title">{session.def.name}</span>
        <span class="pill">
          <span class={`dot ${link.status === 'connected' ? 'ok' : link.status === 'disconnected' ? 'bad' : 'wait'}`} />
          {link.status === 'connected' ? `${link.kind === 'sim' ? 'Simulator' : link.kind === 'serial' ? 'USB' : link.kind === 'ble' ? 'Bluetooth' : 'Wi-Fi'}${link.latency !== null ? ` · ${link.latency} ms` : ''}` : link.status === 'disconnected' ? 'No hub — keyboard only' : 'Reconnecting…'}
        </span>
        {link.kind === 'sim' && link.status === 'connected' && (
          <label class="check small">
            <input type="checkbox" id="game-bot" checked={link.botOn} onChange={(e) => hub.setBot((e.target as HTMLInputElement).checked)} />
            Demo shooter
          </label>
        )}
        <button class="iconbtn" onClick={toggleFs}>
          Fullscreen
        </button>
        <button class="iconbtn" onClick={closeGame}>
          Exit
        </button>
      </div>

      <div class="readout" aria-live="polite">
        <div class="msg">{phase === 'ready' ? 'Press Start' : view?.message || (phase === 'done' ? 'Finished' : '')}</div>
        <Clock ms={view?.clockMs ?? 0} countdown={view?.countdown} phase={phase} />
        <div class="sub">{phase === 'standby' ? 'Wait for the beep' : view?.sub}</div>
      </div>

      {view && view.players.length > 0 && (
        <div class="scores">
          {view.players.map((p, i) => (
            <div class={`score ${p.active ? 'active' : ''}`} key={i}>
              <span class="n">
                {p.color && <span class="swatch" style={{ background: p.color }} />}
                {p.name}
              </span>
              <span class="v">{p.display}</span>
            </div>
          ))}
        </div>
      )}

      {view?.strip && (
        <div class="strip" aria-label="Sequence">
          {view.strip.map((s, i) => (
            <span key={i} class={s.done ? 'done' : s.current ? 'cur' : ''}>
              {s.id}
            </span>
          ))}
        </div>
      )}

      <div class="game-range">
        <Range targets={cfg} views={view?.targets} offline={offline} captions={captions} onPlate={(id) => hub.manualHit(id)} className="tall" label="Plates — click to simulate a hit" />
      </div>

      {recent.length > 0 && (
        <div class="shots" aria-label="Recent splits">
          {recent.map((r, i) => (
            <span key={records.length - recent.length + i} class={r.valid ? '' : 'bad'} title={r.note}>
              P{r.id} {(r.split / 1000).toFixed(2)}
            </span>
          ))}
        </div>
      )}

      {res && (
        <div class="banner">
          {res.summary}
          {res.winner ? ` — ${res.winner} wins` : ''}
          {g.personalBests.length ? ` · New personal best: ${g.personalBests.join(', ')}` : ''}
          {session.earlyShots ? ` · ${session.earlyShots} early shot${session.earlyShots > 1 ? 's' : ''}` : ''}
        </div>
      )}

      <div class="game-bottom">
        {phase === 'running' || phase === 'standby' ? (
          <button class="btn danger big" id="stop-game" onClick={stopGame}>
            Stop
          </button>
        ) : (
          <button
            class="btn primary big"
            id="go-game"
            onClick={() => {
              unlockAudio();
              startGame();
            }}
          >
            {phase === 'done' ? 'Again' : 'Start'}
          </button>
        )}
        {phase === 'done' && (
          <a
            class="btn big"
            href="#results"
            onClick={() => {
              closeGame();
            }}
          >
            Results
          </a>
        )}
      </div>
    </div>
  );
}
