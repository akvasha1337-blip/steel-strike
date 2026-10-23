import { useEffect } from 'preact/hooks';
import type { TState } from '../engine/types';
import { hub } from '../hub';
import type { Shape, TargetConfig } from '../settings';
import { useStore } from '../store';
import { Clock } from './Play';
import { Range } from './Range';

interface Relay {
  mode: string;
  phase: string;
  clock: number;
  countdown: boolean;
  message: string;
  sub: string;
  players: { name: string; display: string; color?: string; active?: boolean }[];
  targets: [number, TState, string, string][];
  layout: [number, number, number, Shape, number][];
}

/** Read-only scoreboard for phones and TVs. It mirrors what the controlling laptop broadcasts through the hub. */
export function SpectatorScreen() {
  const st = useStore(hub.state, (s) => ({ status: s.status, relay: s.relay as Relay | null }));
  useEffect(() => {
    if (st.status === 'disconnected' && location.protocol === 'http:' && location.host) hub.connect('ws');
  }, []);
  const r = st.relay;
  if (!r)
    return (
      <main class="page spectator">
        <header class="pagehead">
          <h1>Scoreboard</h1>
          <p>
            {st.status === 'connected'
              ? 'Connected. Waiting for the laptop to start a game — turn on “Send the live scoreboard to phones” on its Connect page.'
              : 'Open this page from the hub (http://steelstrike.local/#spectator) on the range Wi-Fi to follow the game live.'}
          </p>
        </header>
      </main>
    );
  const targets: TargetConfig[] = r.layout.map(([id, x, y, shape, size]) => ({ id, name: `Plate ${id}`, x: x / 1000, y: y / 1000, shape, size, threshold: 0, debounce: 0 }));
  const views = Object.fromEntries(r.targets.map(([id, state, label, color]) => [id, { id, state, label: label || undefined, color: color || undefined }]));
  return (
    <div class="game spectator" style="position:static;min-height:100%">
      <div class="game-top">
        <span class="title">{r.mode}</span>
      </div>
      <div class="readout">
        <div class="msg">{r.message}</div>
        <Clock ms={r.clock} countdown={r.countdown} phase={r.phase} />
        <div class="sub">{r.sub}</div>
      </div>
      <div class="scores">
        {r.players.map((p, i) => (
          <div class={`score ${p.active ? 'active' : ''}`} key={i}>
            <span class="n">
              {p.color && <span class="swatch" style={{ background: p.color }} />}
              {p.name}
            </span>
            <span class="v">{p.display}</span>
          </div>
        ))}
      </div>
      <div class="game-range">
        <Range targets={targets} views={views} className="tall" label="Plates" />
      </div>
    </div>
  );
}
