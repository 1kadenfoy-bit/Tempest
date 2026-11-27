// Recorded weather for the browser tests: the same sets the dev server replays
// (app/data/recorded.ts, recorded/<set>/, made by tools/record-weather.mjs).
// Every request to the weather and safety servers is answered from the set,
// with the same lookup as the dev server (app/data/recorded-replay.ts): a
// piece of a file is answered from any recorded pieces of that file that hold
// it, so a change in how files are read keeps working on the same bytes.
// One the set does not hold is answered "not recorded" at once, never from
// the live server: a recorded run is deleted from Open-Meteo after a few
// days, and a test that quietly read it live passed for days, then waited
// minutes and failed (wind, the saved area and the phone tests, Nov 27).
// The test's log lists what was missing (tests a new set must cover).
// Anything else (base map, terrain tiles) goes to the network. The clock is
// frozen at the recording.
//
// While a set is being recorded (RECORD=<set>, tools/record-weather.mjs), what
// the set lacks is asked live instead and kept (recorded/<set>/fill/, one pair
// of files per test process), so every test fills its own gaps: a new test is
// covered by the next recording without changing the recorder.
//
// Tests get it through e2e/fixtures.ts. WEATHER=live npm run screenshots runs
// them on live data instead; WEATHER=<set> picks another set.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { BrowserContext, Request } from '@playwright/test';
import { keyOf, makeReplay, type RecordedEntry, type Replay } from '../app/data/recorded-replay';

export interface RecordedMeta { name: string; now: string; spots: { name: string; lat: number; lng: number }[] }

// The servers tools/record-weather.mjs keeps every answer from.
export const RECORDED_HOSTS = new Set([
  'api.open-meteo.com', 'openmeteo.s3.amazonaws.com', 'air-quality-api.open-meteo.com',
  'geo.weather.gc.ca', 'api.weather.gc.ca', 'dd.weather.gc.ca',
  'api.avalanche.ca', 'avcan-services-api.prod.avalanche.ca', 'weather.prod.avalanche.ca',
  'openmaps.gov.bc.ca', 'apps.gov.bc.ca',
]);

/** The set being recorded (RECORD=<set>), or null when only replaying. */
export const RECORDING = process.env.RECORD || null;

/** The sets, read once per test process (a set is tens of MB). */
const sets = new Map<string, { meta: RecordedMeta; replay: Replay; bodies: Buffer }>();
function load(set: string) {
  let s = sets.get(set);
  if (!s) {
    const dir = join('recorded', set);
    s = {
      meta: JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as RecordedMeta,
      replay: makeReplay((JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { entries: Record<string, RecordedEntry> }).entries),
      bodies: readFileSync(join(dir, 'bodies.bin')),
    };
    sets.set(set, s);
  }
  return s;
}

// content-length only matters for HEAD answers (the map-file reader asks a
// file's size that way); a replayed body gets its own length.
const KEEP_HEADERS = ['content-type', 'content-range', 'content-length', 'accept-ranges', 'last-modified', 'etag'];

/**
 * What this test process asked live while recording, kept in
 * recorded/<set>/fill/<id>.jsonl (one answer per line, its body's place in
 * <id>.bin). tools/record-weather.mjs merges every process's pair into the set.
 */
class Fill {
  private readonly lines: string;
  private readonly bin: string;
  private end = 0;
  private readonly byHash = new Map<string, number>();
  /** Answers kept by this process, so a second ask is not asked live again. */
  readonly kept = new Map<string, { entry: RecordedEntry; body: Buffer | null }>();
  constructor(set: string) {
    const dir = join('recorded', set, 'fill');
    mkdirSync(dir, { recursive: true });
    // What earlier test processes of this recording kept (a new process starts after a failed test).
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
      const binFile = join(dir, f.replace(/\.jsonl$/, '.bin'));
      if (!existsSync(binFile)) continue;
      const bin = readFileSync(binFile);
      for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
        if (!line) continue;
        const { key, refused, ...entry } = JSON.parse(line) as RecordedEntry & { key: string; refused?: string };
        if (refused || this.kept.has(key)) continue;
        const body = entry.offset !== undefined && entry.length !== undefined ? bin.subarray(entry.offset, entry.offset + entry.length) : null;
        if (body && body.length !== entry.length) continue; // still being written
        this.kept.set(key, { entry, body });
      }
    }
    const id = `${Date.now().toString(36)}-${process.pid}-${randomBytes(3).toString('hex')}`; // unique across machines
    this.lines = join(dir, `${id}.jsonl`);
    this.bin = join(dir, `${id}.bin`);
    appendFileSync(this.bin, '');
  }
  keep(key: string, status: number, headers: Record<string, string>, body: Buffer | null) {
    if (this.kept.has(key)) return;
    const entry: RecordedEntry = { status, headers };
    if (body) {
      const hash = createHash('sha1').update(body).digest('hex');
      let at = this.byHash.get(hash);
      if (at === undefined) { at = this.end; appendFileSync(this.bin, body); this.end += body.length; this.byHash.set(hash, at); }
      entry.offset = at;
      entry.length = body.length;
    }
    this.kept.set(key, { entry, body });
    appendFileSync(this.lines, `${JSON.stringify({ key, ...entry })}\n`);
  }
  /** Asked live and refused (busy, limit spent) or failed: not weather, not kept, but listed. */
  refused(key: string, why: string) { appendFileSync(this.lines, `${JSON.stringify({ key, refused: why })}\n`); }
}
const fills = new Map<string, Fill>();
const fillOf = (set: string) => { let f = fills.get(set); if (!f) { f = new Fill(set); fills.set(set, f); } return f; };

/** Requests the set did not hold, for the test's log. While recording: those asked live. */
export type Missing = string[];

export async function useRecordedWeather(context: BrowserContext, set = 'default', missing: Missing = []): Promise<RecordedMeta> {
  const { meta, replay, bodies } = load(set);
  await context.clock.setFixedTime(new Date(meta.now));
  // With no signal (context.setOffline) nothing answers, recorded or not.
  let offline = false;
  const setOffline = context.setOffline.bind(context);
  context.setOffline = async (o: boolean) => { offline = o; await setOffline(o); };
  const fill = RECORDING === set ? fillOf(set) : null;
  const live = new Map<Request, string>();
  if (fill) {
    const settle = async (req: Request, failed: boolean) => {
      const key = live.get(req);
      if (key === undefined) return;
      live.delete(req);
      const res = failed ? null : await req.response().catch(() => null);
      const status = res?.status() ?? 0;
      // A refusal is not weather.
      if (!res || status >= 500 || status === 429) return fill.refused(key, res ? String(status) : (req.failure()?.errorText ?? 'failed'));
      const all = await res.allHeaders().catch(() => ({} as Record<string, string>));
      const headers: Record<string, string> = {};
      for (const h of KEEP_HEADERS) if (all[h] && (h !== 'content-length' || req.method() === 'HEAD')) headers[h] = all[h];
      const body = req.method() === 'GET' && status !== 204 && status !== 304 ? await res.body().catch(() => null) : null;
      if (req.method() === 'GET' && status !== 204 && status !== 304 && !body) return fill.refused(key, 'no body');
      fill.keep(key, status, headers, body);
    };
    context.on('requestfinished', (r) => void settle(r, false));
    context.on('requestfailed', (r) => void settle(r, true));
  }
  await context.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', async (route) => {
    if (offline) return route.abort('internetdisconnected');
    const req = route.request();
    const range = await req.headerValue('range');
    const hit = replay.find(req.method(), req.url(), range);
    const host = new URL(req.url()).hostname;
    if (hit) {
      const headers = { ...hit.headers, 'access-control-allow-origin': '*' };
      if (!hit.parts.length) return route.fulfill({ status: hit.status, headers });
      const body = hit.parts.length === 1 ? bodies.subarray(hit.parts[0]!.offset, hit.parts[0]!.offset + hit.parts[0]!.length)
        : Buffer.concat(hit.parts.map((p) => bodies.subarray(p.offset, p.offset + p.length)));
      return route.fulfill({ status: hit.status, headers, body });
    }
    if (RECORDED_HOSTS.has(host)) {
      const key = keyOf(req.method(), req.url(), range);
      if (fill && (req.method() === 'GET' || req.method() === 'HEAD')) {
        // Recording: asked live and kept (once per test process).
        const kept = fill.kept.get(key);
        if (kept) return route.fulfill({ status: kept.entry.status, headers: { ...kept.entry.headers, 'access-control-allow-origin': '*' }, ...(kept.body ? { body: kept.body } : {}) });
        missing.push(key);
        live.set(req, key);
        return route.fallback();
      }
      missing.push(key);
      // The point and air APIs answer as when busy (the app then reads the
      // map files); a file server as for a file it does not have.
      const status = host.endsWith('api.open-meteo.com') ? 503 : 404;
      return route.fulfill({ status, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'Not in the recorded weather' });
    }
    return route.fallback();
  });
  return meta;
}
