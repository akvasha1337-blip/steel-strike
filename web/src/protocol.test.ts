import { describe, expect, it } from 'vitest';
import { ClockSync, LineSplitter, encode, parseLine } from './protocol';

describe('parseLine', () => {
  it('parses a hit', () => {
    expect(parseLine('{"t":"hit","id":3,"amp":812,"ts":123456789}')).toEqual({ t: 'hit', id: 3, amp: 812, ts: 123456789 });
  });
  it('ignores debug, blank and junk lines', () => {
    expect(parseLine('# booting')).toBeNull();
    expect(parseLine('')).toBeNull();
    expect(parseLine('ets Jun  8 2016 00:22:57')).toBeNull();
    expect(parseLine('{"t":"hit","id":3')).toBeNull();
    expect(parseLine('{"t":"nope"}')).toBeNull();
  });
  it('rejects hits with bad ids', () => {
    expect(parseLine('{"t":"hit","id":0,"amp":1,"ts":1}')).toBeNull();
    expect(parseLine('{"t":"hit","id":"2","amp":1,"ts":1}')).toBeNull();
  });
  it('encodes commands with a newline', () => {
    expect(encode({ c: 'ping', seq: 4 })).toBe('{"c":"ping","seq":4}\n');
  });
});

describe('LineSplitter', () => {
  it('reassembles lines split across chunks and strips CR', () => {
    const out: string[] = [];
    const s = new LineSplitter((l) => out.push(l));
    s.push('{"t":"hb",');
    s.push('"ts":1}\r\n{"t":"hb","ts":2}\n{"t"');
    s.push(':"hb","ts":3}\n');
    expect(out).toEqual(['{"t":"hb","ts":1}', '{"t":"hb","ts":2}', '{"t":"hb","ts":3}']);
  });
});

describe('ClockSync', () => {
  it('converts hub time using the lowest-latency ping', () => {
    const c = new ClockSync();
    // hub clock is 5000 ms ahead of the browser
    c.add(1000, 1040, (1020 + 5000) * 1000); // rtt 40
    c.add(2000, 2006, (2003 + 5000) * 1000); // rtt 6, best
    expect(c.offset).toBeCloseTo(5000, 5);
    expect(c.toLocal((3000 + 5000) * 1000, 3010)).toBeCloseTo(3000, 5);
  });
  it('falls back to arrival time before sync or when far off', () => {
    const c = new ClockSync();
    expect(c.toLocal(123, 50)).toBe(50);
    c.add(0, 2, 1000 * 1000);
    expect(c.toLocal(999_999_000, 100)).toBe(100);
  });
});
