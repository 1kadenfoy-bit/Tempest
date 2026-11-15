import { afterEach, describe, expect, it, vi } from 'vitest';
import { RangeOrWholeSource } from './range-source';

const file = Uint8Array.from({ length: 64 }, (_, i) => i);

function host(partial: boolean) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('Range');
    const m = range?.match(/bytes=(\d+)-(\d+)/);
    if (partial && m) return new Response(file.slice(Number(m[1]), Number(m[2]) + 1), { status: 206 });
    return new Response(file, { status: 200 });
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('map file reader', () => {
  it('uses partial requests when the host supports them', async () => {
    const fetchMock = host(true);
    vi.stubGlobal('fetch', fetchMock);
    const src = new RangeOrWholeSource('https://x/f.pmtiles');
    expect(Array.from(new Uint8Array((await src.getBytes(10, 4)).data))).toEqual([10, 11, 12, 13]);
    await src.getBytes(20, 2);
    expect(src.partial).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to one whole-file download when the host ignores ranges', async () => {
    const fetchMock = host(false);
    vi.stubGlobal('fetch', fetchMock);
    const src = new RangeOrWholeSource('https://x/f.pmtiles');
    expect(Array.from(new Uint8Array((await src.getBytes(10, 4)).data))).toEqual([10, 11, 12, 13]);
    expect(Array.from(new Uint8Array((await src.getBytes(60, 4)).data))).toEqual([60, 61, 62, 63]);
    expect(src.partial).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
