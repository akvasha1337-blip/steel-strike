import { useEffect, useState } from 'preact/hooks';
import { hub } from '../hub';
import { settings } from '../settings';
import { useStore } from '../store';
import { availability, type TransportKind } from '../transports/types';

const ESP_WEB_TOOLS = 'https://unpkg.com/esp-web-tools@10.0.1/dist/web/install-button.js?module';

function Bars({ pct }: { pct?: number }) {
  const n = pct === undefined ? 0 : Math.ceil(pct / 25);
  return (
    <span class="bars" aria-label={pct === undefined ? 'unknown' : `${pct}% delivered`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} class={i <= n ? 'on' : ''} style={{ height: `${4 + i * 2.5}px` }} />
      ))}
    </span>
  );
}

const OPTIONS: { kind: TransportKind; title: string; tag?: string; text: string }[] = [
  { kind: 'serial', title: 'USB cable', tag: 'Most reliable', text: 'Plug the hub into this laptop. Chrome or Edge on a computer.' },
  { kind: 'ble', title: 'Bluetooth', text: 'No cable, about 10–30 m. Chrome or Edge on a computer or Android.' },
  { kind: 'ws', title: 'Wi-Fi', text: 'Open the app from the hub (steelstrike.local). Works on any phone, no internet needed.' },
  { kind: 'sim', title: 'Simulator', tag: 'No hardware', text: 'Try every mode now. Click plates or press 1–8 to hit them.' },
];

export function ConnectScreen() {
  const st = useStore(hub.state, (s) => s);
  const cfg = useStore(settings, (s) => s);
  const [wsUrl, setWsUrl] = useState(cfg.wsUrl || `ws://${location.protocol === 'http:' && location.host ? location.host : 'steelstrike.local'}/ws`);
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [espTools, setEspTools] = useState<'idle' | 'ready' | 'failed'>('idle');
  const [ota, setOta] = useState('');

  const serialOk = availability('serial').ok;
  const hosted = location.protocol === 'https:' || location.hostname === 'localhost';
  const hubServed = location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';

  useEffect(() => {
    if (!serialOk || espTools !== 'idle') return;
    if (customElements.get('esp-web-install-button')) return setEspTools('ready');
    const s = document.createElement('script');
    s.type = 'module';
    s.src = ESP_WEB_TOOLS;
    s.onload = () => setEspTools('ready');
    s.onerror = () => setEspTools('failed');
    document.head.appendChild(s);
  }, [serialOk]);

  const connect = (kind: TransportKind) => {
    if (kind === 'ws') settings.set({ wsUrl });
    hub.connect(kind, kind === 'ws' ? wsUrl : undefined);
  };

  const nodes = Object.values(st.nodes).sort((a, b) => a.id - b.id);
  const statusText =
    st.status === 'connected' ? `Connected · ${OPTIONS.find((o) => o.kind === st.kind)?.title}` : st.status === 'connecting' ? 'Connecting…' : st.status === 'reconnecting' ? 'Reconnecting…' : 'Not connected';

  async function uploadOta(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const file = (form.elements.namedItem('bin') as HTMLInputElement).files?.[0];
    const fs = (form.elements.namedItem('kind') as HTMLSelectElement).value === 'fs';
    if (!file) return setOta('Choose a .bin file first.');
    setOta(`Uploading ${file.name}…`);
    try {
      const fd = new FormData();
      fd.append('update', file, file.name);
      const host = new URL(wsUrl.replace(/^ws/, 'http')).host;
      const r = await fetch(`http://${host}/update${fs ? '?fs=1' : ''}`, { method: 'POST', body: fd });
      setOta(r.ok ? 'Update installed. The hub is restarting — reconnect in about 10 seconds.' : `Hub refused the update (${r.status}).`);
    } catch (err: any) {
      setOta(`Upload failed: ${err?.message || err}`);
    }
  }

  return (
    <main class="page">
      <header class="pagehead">
        <h1>Connect</h1>
        <p>Link this screen to the hub ESP32 at the shooting line. USB is the default; Bluetooth and Wi-Fi work without a cable.</p>
      </header>

      <section class="panel stack" aria-live="polite">
        <div class="row">
          <span class={`dot ${st.status === 'connected' ? 'ok' : st.status === 'disconnected' ? '' : 'wait'}`} />
          <b>{statusText}</b>
          {st.status === 'connected' && (
            <span class="muted small">
              {st.name} · firmware {st.fw || '…'} · {st.layout === 'nodes' ? 'wireless targets' : st.layout === 'hub' ? 'wired targets' : ''}
              {st.latency !== null ? ` · ${st.latency} ms round trip` : ''}
            </span>
          )}
          {st.status !== 'disconnected' && (
            <button class="btn sm ghost" style="margin-left:auto" onClick={() => hub.disconnect()}>
              Disconnect
            </button>
          )}
        </div>
        {st.error && <div class="note bad">{st.error}</div>}
        {st.status === 'connected' && st.targets > 0 && st.targets !== cfg.targetCount && (
          <div class="note">
            The hub reports {st.targets} targets but Setup has {cfg.targetCount}.{' '}
            <a href="#setup">Change it in Setup</a>.
          </div>
        )}
      </section>

      <section class="conn-grid" aria-label="Connection methods">
        {OPTIONS.map((o) => {
          const a = availability(o.kind);
          const on = st.kind === o.kind && st.status !== 'disconnected';
          return (
            <button key={o.kind} class={`conn ${on ? 'on' : ''}`} disabled={!a.ok || st.status === 'connecting'} onClick={() => connect(o.kind)} id={`connect-${o.kind}`}>
              {o.tag && <span class="tag">{o.tag}</span>}
              <b>{o.title}</b>
              <p>{a.ok ? o.text : a.why}</p>
            </button>
          );
        })}
      </section>

      {availability('ws').ok && (
        <section class="panel stack">
          <h2>Wi-Fi address</h2>
          <label class="field">
            <span>Hub WebSocket address</span>
            <input type="text" id="ws-url" value={wsUrl} onInput={(e) => setWsUrl((e.target as HTMLInputElement).value)} />
            <small>Use ws://steelstrike.local/ws on the range Wi-Fi, or ws://192.168.4.1/ws on the hub’s own network (SteelStrike-XXXX).</small>
          </label>
        </section>
      )}

      {st.kind === 'sim' && st.status === 'connected' && (
        <section class="panel stack">
          <h2>Simulator</h2>
          <label class="check">
            <input type="checkbox" id="sim-bot" checked={st.botOn} onChange={(e) => hub.setBot((e.target as HTMLInputElement).checked)} />
            Demo shooter — fires at lit plates on its own (misses sometimes)
          </label>
          <p class="muted small" style="margin:0">
            Without it, click a plate on the game screen or press <span class="kbd">1</span>–<span class="kbd">8</span> to hit it.
          </p>
        </section>
      )}

      <div class="grid2">
        <section class="panel stack">
          <div class="row">
            <h2 style="margin:0">Targets</h2>
            <button class="btn sm" style="margin-left:auto" disabled={st.status !== 'connected' || st.pairOpen} onClick={() => hub.send({ c: 'pair', secs: 60 })}>
              {st.pairOpen ? 'Pairing… power on the new target' : 'Pair new target'}
            </button>
          </div>
          {nodes.length === 0 ? (
            <p class="muted" style="margin:0">
              {st.status === 'connected' ? 'No targets have checked in yet. Power on each target box; it appears here within a few seconds.' : 'Connect to see each target’s signal and power.'}
            </p>
          ) : (
            <div class="scroll-x">
              <table class="data">
                <thead>
                  <tr>
                    <th>Plate</th>
                    <th>Status</th>
                    <th>Link</th>
                    <th>Supply</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((n) => {
                    const name = cfg.targets.find((t) => t.id === n.id)?.name ?? `Plate ${n.id}`;
                    return (
                      <tr key={n.id}>
                        <td>
                          <b>{n.id}</b> <span class="muted">{name}</span>
                        </td>
                        <td>
                          <span class="row" style="gap:6px">
                            <span class={`dot ${n.online ? 'ok' : 'bad'}`} />
                            {n.online ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td>
                          <Bars pct={n.link} /> {n.rssi !== undefined ? <span class="muted small">{n.rssi} dBm</span> : null}
                        </td>
                        <td>{n.batt !== undefined && n.batt > 0 ? `${n.batt.toFixed(2)} V` : '—'}</td>
                        <td>
                          <div class="row" style="gap:6px;flex-wrap:nowrap">
                            <button class="btn sm" onClick={() => hub.send({ c: 'led', id: n.id, color: '#FFFFFF', mode: 'blink', ms: 2000 })}>
                              Flash
                            </button>
                            {st.layout === 'nodes' && (
                              <button class="btn sm ghost" onClick={() => hub.send({ c: 'unpair', id: n.id })}>
                                Unpair
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p class="muted small" style="margin:0">
            Supply shows the power bank’s voltage when the optional divider is wired (about 5 V when healthy). Link is the share of messages delivered on the first try.
          </p>
        </section>

        <section class="panel stack">
          <h2>Hub Wi-Fi</h2>
          {st.wifi ? (
            <div class="note ok">
              {st.wifi.mode === 'sta'
                ? `On ${st.wifi.ssid ?? 'range Wi-Fi'} at ${st.wifi.ip ?? '…'} — phones on that network can open http://steelstrike.local`
                : st.wifi.mode === 'ap'
                  ? `Running its own network. Join “SteelStrike-…” and open http://192.168.4.1`
                  : 'Wi-Fi is off.'}
            </div>
          ) : (
            <p class="muted" style="margin:0">Give the hub the range Wi-Fi so phones and tablets can open the scoreboard. If it can’t join within 15 s it makes its own network instead.</p>
          )}
          <form
            class="stack"
            onSubmit={(e) => {
              e.preventDefault();
              hub.send({ c: 'wifi', ssid, pass });
            }}
          >
            <label class="field">
              <span>Network name</span>
              <input type="text" id="wifi-ssid" value={ssid} autocomplete="off" onInput={(e) => setSsid((e.target as HTMLInputElement).value)} />
            </label>
            <label class="field">
              <span>Password</span>
              <input type="password" id="wifi-pass" value={pass} autocomplete="off" onInput={(e) => setPass((e.target as HTMLInputElement).value)} />
            </label>
            <button class="btn" type="submit" disabled={st.status !== 'connected' || !ssid}>
              Save to hub
            </button>
          </form>
          <label class="check">
            <input type="checkbox" id="broadcast" checked={cfg.broadcast} onChange={(e) => settings.set({ broadcast: (e.target as HTMLInputElement).checked })} />
            Send the live scoreboard to phones (open <code>http://steelstrike.local/#spectator</code>)
          </label>
        </section>
      </div>

      <div class="grid2">
        <section class="panel stack">
          <h2>Install firmware</h2>
          {serialOk && hosted && !hubServed ? (
            espTools === 'ready' ? (
              <>
                <p class="muted" style="margin:0">Plug the board in by USB, then press the button for that board. Takes about a minute.</p>
                <div class="row">
                  {/* @ts-ignore web component */}
                  <esp-web-install-button manifest="./firmware/manifest-hub.json">
                    <button slot="activate" class="btn primary">
                      Install hub firmware
                    </button>
                    {/* @ts-ignore */}
                  </esp-web-install-button>
                  {/* @ts-ignore web component */}
                  <esp-web-install-button manifest="./firmware/manifest-hub-wired.json">
                    <button slot="activate" class="btn">
                      Install wired hub firmware
                    </button>
                    {/* @ts-ignore */}
                  </esp-web-install-button>
                  {/* @ts-ignore web component */}
                  <esp-web-install-button manifest="./firmware/manifest-node.json">
                    <button slot="activate" class="btn">
                      Install target firmware
                    </button>
                    {/* @ts-ignore */}
                  </esp-web-install-button>
                </div>
                <p class="muted small" style="margin:0">Hub = ESP32 DevKit V1 talking to wireless targets. Wired hub = ESP32 DevKit with the piezos wired straight to it (no target boards). Target = ESP32-C3 SuperMini (one per plate). Disconnect from the hub above before installing.</p>
              </>
            ) : espTools === 'failed' ? (
              <div class="note bad">The installer couldn’t load (needs internet). Use the PlatformIO steps in the setup guide instead.</div>
            ) : (
              <p class="muted">Loading installer…</p>
            )
          ) : (
            <p class="muted" style="margin:0">
              One-click install runs from the hosted app in Chrome or Edge on a computer. From here, use the PlatformIO steps in the setup guide.
            </p>
          )}
        </section>

        <section class="panel stack">
          <h2>Update over Wi-Fi</h2>
          {st.kind === 'ws' && st.status === 'connected' ? (
            <form class="stack" onSubmit={uploadOta}>
              <label class="field">
                <span>What to update</span>
                <select name="kind" id="ota-kind">
                  <option value="fw">Hub firmware (firmware.bin)</option>
                  <option value="fs">Hub web app (littlefs.bin)</option>
                </select>
              </label>
              <label class="field">
                <span>File</span>
                <input type="file" name="bin" id="ota-bin" accept=".bin" />
              </label>
              <button class="btn" type="submit">
                Upload and restart hub
              </button>
              {ota && <div class="note">{ota}</div>}
            </form>
          ) : (
            <p class="muted" style="margin:0">Connect over Wi-Fi to update the hub without a cable. Targets update by USB with the installer.</p>
          )}
        </section>
      </div>
    </main>
  );
}
