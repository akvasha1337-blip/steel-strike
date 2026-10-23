import { describe, expect, it } from 'vitest';
import { seeded } from '../engine/base';
import { Session } from '../engine/session';
import type { Effects } from '../engine/types';
import { buildSequence } from './reaction';
import { splitSides } from './versus';
import { modeById, MODES } from './index';

function fx() {
  const log: string[] = [];
  const leds: Record<number, string> = {};
  const e: Effects = {
    sound: (n) => log.push(n),
    led: (id, c, m) => (leds[id] = m === 'off' ? 'off' : c),
    ledAll: (c, m) => {
      for (let i = 1; i <= 8; i++) leds[i] = m === 'off' ? 'off' : c;
    },
    say: () => {},
  };
  return { e, log, leds };
}

const IDS = [1, 2, 3, 4, 5, 6];

function run(id: string, settings: Record<string, any> = {}, players = ['Alex']) {
  const f = fx();
  const s = new Session({ def: modeById(id), settings, ids: IDS, players, fx: f.e, rng: seeded(7), standby: [1000, 1000] });
  s.start(0);
  s.tick(999);
  expect(s.phase).toBe('standby');
  s.tick(1000);
  expect(s.phase).toBe('running');
  return { s, ...f };
}

describe('registry', () => {
  it('has the nine modes', () => {
    expect(MODES.map((m) => m.id)).toEqual(['free', 'speed', 'timed', 'reaction', 'sequence', 'h2h', 'steal', 'tournament', 'custom']);
  });
});

describe('session', () => {
  it('counts early shots during standby and ignores them for scoring', () => {
    const f = fx();
    const s = new Session({ def: modeById('speed'), settings: {}, ids: IDS, players: ['A'], fx: f.e, rng: seeded(1), standby: [2000, 2000] });
    s.start(0);
    s.hit(1, 500, 900);
    expect(s.earlyShots).toBe(1);
    expect(s.inst.records.length).toBe(0);
    expect(f.log).toContain('buzz');
  });
});

describe('speed clear', () => {
  it('stops the clock on the last plate', () => {
    const { s, leds } = run('speed');
    expect(leds[3]).toBe('#00FF00');
    [1, 2, 3, 4, 5].forEach((id, i) => s.hit(id, 1000 + (i + 1) * 400, 900));
    s.hit(2, 3500, 900); // extra hit
    expect(s.phase).toBe('running');
    s.hit(6, 4100, 900);
    expect(s.phase).toBe('done');
    const r = s.result().rows[0];
    expect(r.primary).toBe(3100);
    expect(r.display).toBe('3.10 s');
    expect(s.inst.records.filter((x) => !x.valid).length).toBe(1);
  });
  it('reports DNF when stopped early', () => {
    const { s } = run('speed');
    s.hit(1, 1500, 900);
    s.stop(3000);
    expect(s.result().rows[0].display).toBe('DNF');
  });
});

describe('free practice', () => {
  it('records splits and ends at the time limit', () => {
    const { s } = run('free', { timeLimit: 5 });
    s.hit(1, 1600, 900);
    s.hit(1, 1900, 900);
    expect(s.inst.records.map((r) => r.split)).toEqual([600, 300]);
    s.tick(6000);
    expect(s.phase).toBe('done');
    expect(s.result().rows[0].primary).toBe(2);
  });
});

describe('timed challenge', () => {
  it('scores lit plates, penalises unlit ones, relights elsewhere', () => {
    const { s } = run('timed', { duration: 10, lit: 1, penalty: true });
    const lit = () => Object.values(s.view(1000).targets).filter((t) => t.state === 'active').map((t) => t.id);
    const first = lit()[0];
    s.hit(first, 1500, 900);
    const second = lit()[0];
    expect(second).not.toBe(first);
    const unlit = IDS.find((x) => x !== second)!;
    s.hit(unlit, 1800, 900);
    s.tick(11000);
    expect(s.phase).toBe('done');
    expect(s.result().rows[0].primary).toBe(0);
  });
});

describe('reaction', () => {
  it('measures reaction time on green and penalises timeouts', () => {
    const { s } = run('reaction', { rounds: 3, minDelay: 1, maxDelay: 1, timeout: 2, noShoot: 0, penalty: 1 });
    let t = 1000;
    // round 1: hit green after 300 ms
    t += 1000; s.tick(t);
    const g = Object.values(s.view(t).targets).find((x) => x.state === 'active')!.id;
    s.hit(g, t + 300, 900);
    t += 300 + 800; s.tick(t); // gap → next round
    t += 1000; s.tick(t); // green appears
    t += 2000; s.tick(t); // timeout
    t += 800; s.tick(t);
    t += 1000; s.tick(t);
    const g3 = Object.values(s.view(t).targets).find((x) => x.state === 'active')!.id;
    s.hit(g3, t + 500, 900);
    t += 500 + 800; s.tick(t);
    expect(s.phase).toBe('done');
    // (300 + 2000 + 500) / 3
    expect(Math.round(s.result().rows[0].primary)).toBe(933);
  });
});

describe('sequence', () => {
  it('builds sequences and charges wrong-order penalties', () => {
    expect(buildSequence(IDS, 'ltr', 0, seeded(1))).toEqual(IDS);
    expect(buildSequence(IDS, 'rtl', 3, seeded(1))).toEqual([6, 5, 4]);
    const long = buildSequence(IDS, 'random', 15, seeded(3));
    expect(long.length).toBe(15);
    for (let i = 1; i < long.length; i++) expect(long[i]).not.toBe(long[i - 1]);

    const { s } = run('sequence', { order: 'ltr', penalty: 2 });
    s.hit(2, 1200, 900); // wrong
    IDS.forEach((id, i) => s.hit(id, 1500 + i * 300, 900));
    expect(s.phase).toBe('done');
    expect(s.result().rows[0].primary).toBe(2000 + 2000);
  });
});

describe('head to head', () => {
  it('splits sides and plays best of 3', () => {
    expect(splitSides([1, 2, 3, 4, 5])).toEqual([[1, 2], [4, 5]]);
    const { s } = run('h2h', { bestOf: '3', pause: 2 }, ['Ana', 'Ben']);
    // round 1: Ana clears 1,2,3
    s.hit(1, 1200, 900); s.hit(4, 1300, 900); s.hit(2, 1400, 900); s.hit(3, 1500, 900);
    let t = 1500;
    t += 2000; s.tick(t); // standby
    t += 4000; s.tick(t); // beep → round 2
    s.hit(4, t + 200, 900); s.hit(5, t + 300, 900); s.hit(6, t + 400, 900);
    t += 400 + 2000; s.tick(t); t += 4000; s.tick(t);
    [1, 2, 3].forEach((id, i) => s.hit(id, t + 100 * (i + 1), 900));
    expect(s.phase).toBe('done');
    const res = s.result();
    expect(res.winner).toBe('Ana');
    expect(res.rows.map((r) => r.primary)).toEqual([2, 1]);
  });
});

describe('steal', () => {
  it('claims and steals plates across turns', () => {
    const { s } = run('steal', { turnSeconds: 5, turns: 1, pause: 1 }, ['Ana', 'Ben']);
    s.hit(1, 1500, 900); s.hit(2, 1700, 900);
    let t = 6000; s.tick(t); // Ana's turn ends
    t += 1000; s.tick(t); t += 3000; s.tick(t); // Ben's turn starts
    s.hit(2, t + 200, 900); s.hit(3, t + 400, 900); s.hit(3, t + 500, 900);
    t += 5000; s.tick(t);
    expect(s.phase).toBe('done');
    const res = s.result();
    expect(res.winner).toBe('Ben');
    expect(res.rows.map((r) => Math.floor(r.primary))).toEqual([1, 2]);
  });
});

describe('tournament', () => {
  it('runs each shooter through the base mode and ranks them', () => {
    const { s } = run('tournament', { base: 'speed', intermission: 2 }, ['Ana', 'Ben']);
    IDS.forEach((id, i) => s.hit(id, 1000 + (i + 1) * 500, 900)); // Ana 3.00
    let t = 4000;
    t += 2000; s.tick(t); t += 5000; s.tick(t); // Ben starts
    IDS.forEach((id, i) => s.hit(id, t + (i + 1) * 300, 900)); // Ben 1.80
    expect(s.phase).toBe('done');
    const res = s.result();
    expect(res.winner).toBe('Ben');
    expect(res.rows.map((r) => r.name)).toEqual(['Ben', 'Ana']);
    expect(s.inst.records.length).toBe(12);
  });
});

describe('custom', () => {
  it('penalises no-shoots and plates left at the time limit', () => {
    const { s, leds } = run('custom', { objective: 'clear', timeLimit: 4, penalty: 2, noShoot: [6], rounds: 1 });
    expect(leds[6]).toBe('#FF0000');
    s.hit(6, 1200, 900); // no-shoot
    [1, 2, 3].forEach((id, i) => s.hit(id, 1500 + i * 200, 900));
    s.tick(5000);
    expect(s.phase).toBe('done');
    // 4 s + (1 no-shoot + 2 standing) * 2 s
    expect(s.result().rows[0].primary).toBe(4000 + 3 * 2000);
  });
  it('runs multiple rounds for most-lit-plates', () => {
    const { s } = run('custom', { objective: 'max', timeLimit: 3, rounds: 2 });
    const lit = (t: number) => Object.values(s.view(t).targets).find((x) => x.state === 'active')!.id;
    s.hit(lit(1100), 1200, 900);
    s.tick(4000); // round 1 over
    s.tick(7000); s.tick(11000); // standby → round 2
    s.hit(lit(11100), 11200, 900);
    s.tick(15000);
    expect(s.phase).toBe('done');
    expect(s.result().rows[0].primary).toBe(2);
  });
});
