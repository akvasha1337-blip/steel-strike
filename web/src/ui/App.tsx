import { useEffect, useState } from 'preact/hooks';
import { unlockAudio } from '../audio';
import { game } from '../game';
import { hub } from '../hub';
import { applyTheme, settings } from '../settings';
import { useStore } from '../store';
import { ConnectScreen } from './Connect';
import { HelpScreen } from './Help';
import { PlayScreen } from './Play';
import { ResultsScreen } from './Results';
import { SetupScreen } from './Setup';
import { SpectatorScreen } from './Spectator';

const ROUTES = [
  ['play', 'Play'],
  ['connect', 'Connect'],
  ['setup', 'Setup'],
  ['results', 'Results'],
  ['help', 'Wiring guide'],
] as const;
type Route = (typeof ROUTES)[number][0] | 'spectator';

function current(): Route {
  const h = location.hash.replace('#', '');
  if (h === 'spectator') return 'spectator';
  if (h.startsWith('g-')) return 'help';
  return (ROUTES.find((r) => r[0] === h)?.[0] as Route) ?? 'play';
}

function LinkPill() {
  const s = useStore(hub.state, (x) => ({ status: x.status, kind: x.kind, latency: x.latency }));
  const label =
    s.status === 'connected'
      ? `${s.kind === 'sim' ? 'Simulator' : s.kind === 'serial' ? 'USB' : s.kind === 'ble' ? 'Bluetooth' : 'Wi-Fi'}${s.latency !== null && s.kind !== 'sim' ? ` · ${s.latency} ms` : ''}`
      : s.status === 'disconnected'
        ? 'No hub'
        : 'Connecting…';
  return (
    <a class="pill" href="#connect" style="text-decoration:none;color:inherit" aria-label={`Connection: ${label}`}>
      <span class={`dot ${s.status === 'connected' ? 'ok' : s.status === 'disconnected' ? 'bad' : 'wait'}`} />
      {label}
    </a>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(current());
  const theme = useStore(settings, (s) => s.theme);
  const inGame = useStore(game, (s) => !!s.session);

  useEffect(() => {
    applyTheme();
    const onHash = () => setRoute(current());
    window.addEventListener('hashchange', onHash);
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (route !== 'help') window.scrollTo(0, 0);
  }, [route]);

  if (route === 'spectator') return <SpectatorScreen />;

  const go = (r: Route) => {
    location.hash = r;
    setRoute(r);
  };
  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    settings.set({ theme: next });
    applyTheme();
  };

  return (
    <div class="shell">
      {!inGame && (
        <header class="topbar">
          <div class="brand">
            <b>
              Steel<span>Strike</span>
            </b>
            <small>Range timer</small>
          </div>
          <nav class="nav" aria-label="Main">
            {ROUTES.map(([r, label]) => (
              <button key={r} aria-current={route === r ? 'page' : undefined} onClick={() => go(r)}>
                {label}
              </button>
            ))}
          </nav>
          <LinkPill />
          <button class="iconbtn" onClick={cycleTheme} aria-label="Change theme" title="Theme">
            {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Auto'}
          </button>
        </header>
      )}
      {route === 'play' && <PlayScreen />}
      {route === 'connect' && <ConnectScreen />}
      {route === 'setup' && <SetupScreen />}
      {route === 'results' && <ResultsScreen />}
      {route === 'help' && <HelpScreen />}
    </div>
  );
}
