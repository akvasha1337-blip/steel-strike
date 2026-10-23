import type { HitRecord, ModeResult } from './engine/types';
import { safeStorage } from './store';

export interface Run {
  id: string;
  date: number;
  modeId: string;
  modeName: string;
  settingsText: string;
  result: ModeResult;
  records: HitRecord[];
  players: string[];
  earlyShots: number;
}

export interface BoardEntry {
  modeId: string;
  settingsText: string;
  name: string;
  primary: number;
  better: 'lower' | 'higher';
  display: string;
  date: number;
}

/**
 * Leaderboard and run history. Uses IndexedDB when available and falls back to
 * localStorage (and finally memory), so a blocked store never breaks the game.
 */
const DB = 'steelstrike';
let dbp: Promise<IDBDatabase | null> | null = null;
const memory: { runs: Run[]; board: BoardEntry[] } = { runs: [], board: [] };

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('runs', { keyPath: 'id' });
        d.createObjectStore('board', { autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

async function all<T>(store: 'runs' | 'board'): Promise<T[]> {
  const d = await db();
  if (!d) return safeStorage.getRaw<T[]>(`steelstrike.${store}`, (memory as any)[store]);
  return new Promise((resolve) => {
    try {
      const req = d.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function add(store: 'runs' | 'board', value: any) {
  const d = await db();
  if (!d) {
    const list = safeStorage.getRaw<any[]>(`steelstrike.${store}`, (memory as any)[store]);
    list.push(value);
    (memory as any)[store] = list.slice(-500);
    safeStorage.put(`steelstrike.${store}`, (memory as any)[store]);
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function saveRun(run: Run): Promise<{ personalBests: string[] }> {
  await add('runs', run);
  const board = await all<BoardEntry>('board');
  const personalBests: string[] = [];
  for (const row of run.result.rows) {
    if (row.primary >= 1e9) continue;
    const mine = board.filter((b) => b.modeId === run.modeId && b.settingsText === run.settingsText && b.name === row.name);
    const better = (a: number, b: number) => (row.better === 'lower' ? a < b : a > b);
    if (mine.length && mine.every((b) => better(row.primary, b.primary))) personalBests.push(row.name);
    await add('board', {
      modeId: run.modeId,
      settingsText: run.settingsText,
      name: row.name,
      primary: row.primary,
      better: row.better,
      display: row.display,
      date: run.date,
    } satisfies BoardEntry);
  }
  return { personalBests };
}

export async function loadRuns(): Promise<Run[]> {
  return (await all<Run>('runs')).sort((a, b) => b.date - a.date);
}

export async function leaderboard(modeId: string): Promise<BoardEntry[]> {
  const entries = (await all<BoardEntry>('board')).filter((b) => b.modeId === modeId && b.primary < 1e9);
  return entries.sort((a, b) => (a.better === 'lower' ? a.primary - b.primary : b.primary - a.primary)).slice(0, 15);
}

export function runToCsv(run: Run): string {
  const head = 'shot,time_s,split_s,plate,valid,player,amplitude,note';
  const lines = run.records.map((r, i) =>
    [i + 1, (r.t / 1000).toFixed(3), (r.split / 1000).toFixed(3), r.id, r.valid ? 'yes' : 'no', r.player !== undefined ? run.players[r.player] ?? '' : run.players[0] ?? '', r.amp, (r.note ?? '').replace(/,/g, ';')].join(','),
  );
  return [`# ${run.modeName} · ${new Date(run.date).toLocaleString()} · ${run.settingsText}`, head, ...lines].join('\n');
}
