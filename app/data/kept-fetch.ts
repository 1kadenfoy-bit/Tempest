// A polite fetch for small public feeds (Avalanche Canada's bulletins and
// field reports) that keeps the last good answer on the phone.
//
// - One request at a time per address; a 20 s limit; one more try after 3 s.
// - The answer is kept in Cache Storage under a fixed name (not the address,
//   which carries dates), with the time it was fetched.
// - When the network fails, the kept answer comes back instead, marked kept,
//   so the layer still shows the latest bulletin with its age.
// - The last failure's reason is kept for the status line.

const CACHE = 'tempest-kept-v1';
const FETCHED_AT = 'x-tempest-fetched-at';

export interface KeptAnswer {
  json: unknown;
  fetchedAt: Date;
  /** True when this is the copy kept on the phone, not a fresh answer. */
  kept: boolean;
}

/** Plain words for a failure, for the top bar ("no answer", "HTTP 503"). */
export function failureReason(err: unknown): string {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'no answer in 20 s';
  const m = /HTTP (\d{3})/.exec(String((err as Error)?.message ?? err));
  if (m) return `HTTP ${m[1]}`;
  if (err instanceof TypeError) return 'could not connect';
  return 'error';
}

const inFlight = new Map<string, Promise<KeptAnswer>>();
const pause = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function openCache(): Promise<Cache | null> {
  try { return await caches.open(CACHE); } catch { return null; }
}

/** The answer kept under `name`, if any. */
export async function keptAnswer(name: string): Promise<KeptAnswer | null> {
  const cache = await openCache();
  const hit = await cache?.match(`https://kept.tempest/${name}`).catch(() => undefined);
  if (!hit) return null;
  try {
    return { json: await hit.json(), fetchedAt: new Date(Number(hit.headers.get(FETCHED_AT)) || 0), kept: true };
  } catch { return null; }
}

export interface KeptBytes { bytes: Uint8Array; fetchedAt: Date; kept: boolean }
const bytesInFlight = new Map<string, Promise<KeptBytes | null>>();

/**
 * A file that changes rarely (an ATES area): the copy kept on the phone is
 * used while younger than `freshMs`, without asking the network at all. An
 * older one is asked for again (one try, 20 s limit) and the kept copy comes
 * back if that fails. `online` false means kept copies only. Null when there
 * is nothing to show.
 */
export function fetchKeptBytes(url: string, name: string, freshMs: number, online: boolean, fetchFn: typeof fetch = fetch): Promise<KeptBytes | null> {
  const running = bytesInFlight.get(name);
  if (running) return running;
  const p = (async () => {
    const cache = await openCache();
    const address = `https://kept.tempest/${name}`;
    const hit = await cache?.match(address).catch(() => undefined);
    const kept = hit ? { bytes: new Uint8Array(await hit.arrayBuffer()), fetchedAt: new Date(Number(hit.headers.get(FETCHED_AT)) || 0), kept: true } : null;
    if (kept && (!online || Date.now() - kept.fetchedAt.getTime() < freshMs)) return kept;
    if (!online) return null;
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const fetchedAt = new Date();
      await cache?.put(address, new Response(bytes, { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', [FETCHED_AT]: String(fetchedAt.getTime()) } })).catch(() => undefined);
      return { bytes, fetchedAt, kept: false };
    } catch (err) {
      if (kept) return kept;
      throw err;
    }
  })().finally(() => bytesInFlight.delete(name));
  bytesInFlight.set(name, p);
  return p;
}

/**
 * Fetch `url` as JSON, keeping the answer under `name`. Throws only when
 * there is neither a fresh answer nor a kept one; the error says why.
 */
export function fetchKept(url: string, name: string, fetchFn: typeof fetch = fetch): Promise<KeptAnswer> {
  const running = inFlight.get(name);
  if (running) return running;
  const p = (async () => {
    let lastErr: unknown;
    for (const wait of [0, 3000]) {
      if (wait) await pause(wait);
      try {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const fetchedAt = new Date();
        const cache = await openCache();
        await cache?.put(`https://kept.tempest/${name}`, new Response(JSON.stringify(json), { headers: { 'content-type': 'application/json', [FETCHED_AT]: String(fetchedAt.getTime()) } })).catch(() => undefined);
        return { json, fetchedAt, kept: false };
      } catch (err) {
        lastErr = err;
        // A refusal (4xx) will not change on a second ask.
        if (/HTTP 4\d\d/.test(String((err as Error)?.message))) break;
      }
    }
    const kept = await keptAnswer(name);
    if (kept) return kept;
    throw lastErr;
  })().finally(() => inFlight.delete(name));
  inFlight.set(name, p);
  return p;
}
