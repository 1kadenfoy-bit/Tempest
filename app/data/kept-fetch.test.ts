import { describe, expect, it } from 'vitest';
import { failureReason, fetchKept } from './kept-fetch';

describe('kept fetch', () => {
  it('says why in plain words', () => {
    expect(failureReason(new DOMException('t', 'TimeoutError'))).toBe('no answer in 20 s');
    expect(failureReason(new Error('HTTP 503'))).toBe('HTTP 503');
    expect(failureReason(new TypeError('Load failed'))).toBe('could not connect');
  });
  it('tries once more after a dropped connection, not after a refusal', async () => {
    let calls = 0;
    const flaky = (async () => { calls++; if (calls === 1) throw new TypeError('Load failed'); return new Response('{"ok":1}'); }) as typeof fetch;
    const got = await fetchKept('https://x/a', 'test-a', flaky);
    expect(got.json).toEqual({ ok: 1 });
    expect(got.kept).toBe(false);
    expect(calls).toBe(2);
    calls = 0;
    const refused = (async () => { calls++; return new Response('no', { status: 403 }); }) as typeof fetch;
    await expect(fetchKept('https://x/b', 'test-b', refused)).rejects.toThrow('HTTP 403');
    expect(calls).toBe(1);
  }, 10_000);
});
