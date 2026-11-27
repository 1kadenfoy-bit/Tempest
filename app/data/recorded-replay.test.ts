import { describe, expect, it } from 'vitest';
import { keyOf, makeReplay, parseRange, type RecordedEntry, type ReplayAnswer } from './recorded-replay';

// A 100-byte file whose byte i is i, recorded in three pieces: 10-29, 30-49
// (touching) and 60-79 (after a gap). bodies.bin holds them at 0, 20 and 40.
const FILE = 'https://openmeteo.s3.amazonaws.com/data_spatial/x/2026-11-20T0000.om';
const bodies = Uint8Array.from([...range(10, 29), ...range(30, 49), ...range(60, 79)]);
function range(a: number, b: number) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
const piece = (a: number, b: number, offset: number): RecordedEntry => ({
  status: 206, headers: { 'content-type': 'binary/octet-stream', 'content-range': `bytes ${a}-${b}/100`, etag: '"v1"' }, offset, length: b - a + 1,
});
const entries: Record<string, RecordedEntry> = {
  [keyOf('GET', FILE, 'bytes=10-29')]: piece(10, 29, 0),
  [keyOf('GET', FILE, 'bytes=30-49')]: piece(30, 49, 20),
  [keyOf('GET', FILE, 'bytes=60-79')]: piece(60, 79, 40),
  [keyOf('GET', 'https://api.open-meteo.com/v1/forecast?latitude=1')]: { status: 200, headers: { 'content-type': 'application/json' }, offset: 0, length: 5 },
};
const replay = makeReplay(entries);
const bytesOf = (a: ReplayAnswer) => [...a.parts.flatMap((p) => [...bodies.subarray(p.offset, p.offset + p.length)])];

describe('recorded weather replay', () => {
  it('answers a recorded request exactly as recorded', () => {
    const a = replay.find('GET', FILE, 'bytes=30-49')!;
    expect(a.status).toBe(206);
    expect(a.headers['content-range']).toBe('bytes 30-49/100');
    expect(bytesOf(a)).toEqual(range(30, 49));
    expect(replay.find('GET', 'https://api.open-meteo.com/v1/forecast?latitude=1')!.parts).toEqual([{ offset: 0, length: 5 }]);
  });

  it('answers a smaller piece from a recorded piece that holds it: the same bytes', () => {
    const a = replay.find('GET', FILE, 'bytes=12-20')!;
    expect(a.status).toBe(206);
    expect(a.headers['content-range']).toBe('bytes 12-20/100');
    expect(a.headers['etag']).toBe('"v1"');
    expect(bytesOf(a)).toEqual(range(12, 20));
  });

  it('answers a piece spread over touching recorded pieces', () => {
    const a = replay.find('GET', FILE, 'bytes=25-40')!;
    expect(bytesOf(a)).toEqual(range(25, 40));
    expect(bytesOf(replay.find('GET', FILE, 'bytes=10-49')!)).toEqual(range(10, 49));
  });

  it('refuses a piece with any byte that was not recorded', () => {
    expect(replay.find('GET', FILE, 'bytes=45-65')).toBeNull(); // 50-59 missing
    expect(replay.find('GET', FILE, 'bytes=0-15')).toBeNull();
    expect(replay.find('GET', FILE, 'bytes=70-90')).toBeNull();
    expect(replay.find('GET', FILE)).toBeNull(); // the whole file
    expect(replay.find('GET', `${FILE}?other`, 'bytes=12-20')).toBeNull(); // another address
    expect(replay.find('POST', FILE, 'bytes=12-20')).toBeNull();
    expect(replay.find('GET', 'https://api.open-meteo.com/v1/forecast?latitude=2')).toBeNull();
  });

  it('answers open-ended and from-the-end ranges inside the recorded bytes', () => {
    expect(parseRange('bytes=90-', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=-10', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=95-200', 100)).toEqual([95, 99]);
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(replay.find('GET', FILE, 'bytes=-10')).toBeNull(); // 90-99 not recorded
  });

  it('answers the file’s size from any recorded piece', () => {
    const a = replay.find('HEAD', FILE)!;
    expect(a.status).toBe(200);
    expect(a.headers['content-length']).toBe('100');
    expect(a.parts).toEqual([]);
  });

  it('answers the whole file from a whole recorded file', () => {
    const whole = { status: 200, headers: { 'content-type': 'application/json' }, offset: 0, length: 60 };
    const r = makeReplay({ [keyOf('GET', 'https://x/run.json')]: whole });
    expect(r.find('GET', 'https://x/run.json', 'bytes=10-19')!.parts).toEqual([{ offset: 10, length: 10 }]);
    expect(r.find('HEAD', 'https://x/run.json')!.headers['content-length']).toBe('60');
  });
});
