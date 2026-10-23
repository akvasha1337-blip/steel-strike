import { useEffect, useState } from 'preact/hooks';
import { fmtSec } from '../engine/base';
import { game } from '../game';
import { MODES, modeById } from '../modes';
import { leaderboard, loadRuns, runToCsv, type BoardEntry, type Run } from '../storage';
import { useStore } from '../store';

function stats(run: Run) {
  const r = run.records;
  const valid = r.filter((x) => x.valid);
  const splits = r.slice(1).map((x) => x.split);
  return {
    hits: r.length,
    valid: valid.length,
    acc: r.length ? Math.round((valid.length / r.length) * 100) : 0,
    first: r[0]?.t,
    avg: splits.length ? splits.reduce((a, b) => a + b, 0) / splits.length : undefined,
    best: splits.length ? Math.min(...splits) : undefined,
  };
}

function RunView({ run }: { run: Run }) {
  const s = stats(run);
  const [copied, setCopied] = useState('');
  const csv = runToCsv(run);
  const maxSplit = Math.max(1, ...run.records.map((r) => r.split));
  const rows = run.result.rows.slice().sort((a, b) => (a.better === 'lower' ? a.primary - b.primary : b.primary - a.primary));
  const href = (() => {
    try {
      return URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    } catch {
      return '';
    }
  })();
  return (
    <div class="grid2">
      <section class="panel stack">
        <div class="stack" style="gap:2px">
          <span class="label">
            {run.modeName} · {new Date(run.date).toLocaleString()}
          </span>
          <h2 style="margin:0">{run.result.summary}</h2>
          <span class="muted small">{run.settingsText}</span>
        </div>
        <div class="podium">
          {rows.map((r, i) => (
            <div class="prow" key={r.name + i}>
              <span class="pos">{i + 1}</span>
              <span class="stack" style="gap:0">
                <span class="who">{r.name}</span>
                {r.detail && <span class="muted small">{r.detail}</span>}
              </span>
              <span class="big">{r.display}</span>
            </div>
          ))}
        </div>
        <div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
          {[
            ['Hits', String(s.hits)],
            ['Counted', `${s.valid} (${s.acc}%)`],
            ['First shot', s.first !== undefined ? fmtSec(s.first) : '—'],
            ['Avg split', s.avg !== undefined ? fmtSec(s.avg) : '—'],
            ['Best split', s.best !== undefined ? fmtSec(s.best) : '—'],
            ['Early shots', String(run.earlyShots)],
          ].map(([k, v]) => (
            <div key={k} class="stack" style="gap:0">
              <span class="label">{k}</span>
              <b class="tabnum" style="font-size:20px">{v}</b>
            </div>
          ))}
        </div>
        <div class="row">
          {href && (
            <a class="btn sm" href={href} download={`steel-strike-${run.modeId}-${new Date(run.date).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`}>
              Download CSV
            </a>
          )}
          <button
            class="btn sm"
            onClick={() => {
              navigator.clipboard
                .writeText(csv)
                .then(() => setCopied('Copied'))
                .catch(() => setCopied('Copy blocked — use Download'));
            }}
          >
            Copy CSV
          </button>
          {copied && <span class="muted small">{copied}</span>}
        </div>
      </section>

      <section class="panel stack">
        <h2>Shot timeline</h2>
        {run.records.length === 0 ? (
          <p class="muted">No hits recorded.</p>
        ) : (
          <div class="timeline" role="table" aria-label="Every hit with time and split">
            <div class="tl" role="row" style="background:none">
              <span class="label">#</span>
              <span class="label">Time</span>
              <span class="label">Split</span>
              <span class="label">Plate</span>
            </div>
            {run.records.map((r, i) => (
              <div class={`tl ${r.valid ? '' : 'bad'}`} role="row" key={i}>
                <span>{i + 1}</span>
                <span>{(r.t / 1000).toFixed(2)}</span>
                <span>{(r.split / 1000).toFixed(2)}</span>
                <span class="row" style="gap:6px;flex-wrap:nowrap;min-width:0">
                  <span class="splitbar" style={{ width: `${(r.split / maxSplit) * 60}%`, background: r.valid ? undefined : 'var(--stop)' }} />
                  <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    P{r.id}
                    {r.player !== undefined && run.players.length > 1 ? ` · ${run.players[r.player]}` : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ResultsScreen() {
  const last = useStore(game, (s) => s.lastRun);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [boardMode, setBoardMode] = useState<string>(last?.modeId ?? 'speed');
  const [board, setBoard] = useState<BoardEntry[]>([]);

  useEffect(() => {
    loadRuns().then(setRuns);
  }, [last]);
  useEffect(() => {
    leaderboard(boardMode).then(setBoard);
  }, [boardMode, last]);

  const run = (selected && runs.find((r) => r.id === selected)) || last || runs[0];

  return (
    <main class="page">
      <header class="pagehead">
        <h1>Results</h1>
        <p>Every run is saved on this device. Best scores per mode and settings make the leaderboard.</p>
      </header>

      {run ? <RunView run={run} /> : <div class="panel muted">No runs yet. Play a game and the results land here.</div>}

      <div class="grid2">
        <section class="panel stack">
          <h2>Leaderboard</h2>
          <div class="tabs" role="group" aria-label="Mode">
            {MODES.filter((m) => m.id !== 'tournament').map((m) => (
              <button key={m.id} aria-pressed={boardMode === m.id} onClick={() => setBoardMode(m.id)}>
                {m.name}
              </button>
            ))}
          </div>
          {board.length === 0 ? (
            <p class="muted" style="margin:0">No scores for {modeById(boardMode).name} yet.</p>
          ) : (
            <div class="scroll-x">
              <table class="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Shooter</th>
                    <th>Score</th>
                    <th>Settings</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((b, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <b>{b.name}</b>
                      </td>
                      <td>{b.display}</td>
                      <td class="muted small">{b.settingsText}</td>
                      <td class="muted small">{new Date(b.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section class="panel stack">
          <h2>History</h2>
          {runs.length === 0 ? (
            <p class="muted" style="margin:0">Nothing yet.</p>
          ) : (
            <div class="scroll-x">
              <table class="data">
                <tbody>
                  {runs.slice(0, 30).map((r) => (
                    <tr key={r.id}>
                      <td class="muted small">{new Date(r.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{r.modeName}</td>
                      <td>{r.result.rows.map((x) => `${x.name} ${x.display}`).join(' · ')}</td>
                      <td>
                        <button class="btn sm ghost" onClick={() => setSelected(r.id)} aria-pressed={run?.id === r.id}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
