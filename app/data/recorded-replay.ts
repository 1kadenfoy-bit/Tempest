// Finding a recorded answer (recorded weather: app/data/recorded.ts for the
// dev server through public/recorded-sw.js, e2e/recorded.ts for the browser
// tests). No browser or Node code: the dev server's worker imports this file
// as it is (Vite serves it), the tests import it in Node, the unit tests run it.
//
// A request is found by its method, address and byte range. A piece of a file
// asked with a range that was not recorded as such is still answered when the
// recorded pieces of the same file hold every byte of it: one piece that
// contains it, or several that touch or overlap. The bytes are the recorded
// ones, so the numbers are the same; only how the file is read may change
// (a reader that asks bigger or smaller pieces, Nov 27). A file's size (HEAD)
// is answered from any recorded piece of it.

/** One recorded answer: its status, kept headers, and where its body sits in bodies.bin. */
export interface RecordedEntry { status: number; headers: Record<string, string>; offset?: number; length?: number }

/** An answer to give: status, headers, and the body as slices of bodies.bin, in order. */
export interface ReplayAnswer { status: number; headers: Record<string, string>; parts: { offset: number; length: number }[] }

/** The key a request is recorded under (tools/record-weather.mjs, e2e/recorded.ts, public/recorded-sw.js). */
export const keyOf = (method: string, url: string, range?: string | null): string => `${method} ${url}${range ? ` ${range}` : ''}`;

/** A recorded piece of a file: bytes [start, end] of a file of `total` bytes. */
interface Piece { start: number; end: number; total: number; entry: RecordedEntry }

/** "bytes 100-199/1000" → [100, 199, 1000]. */
function contentRange(v: string | undefined): [number, number, number] | null {
  const m = v?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** "bytes=100-199", "bytes=100-", "bytes=-100" for a file of `total` bytes → [start, end], or null. One range only. */
export function parseRange(range: string, total: number): [number, number] | null {
  const m = range.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') return [Math.max(0, total - Number(m[2])), total - 1];
  const start = Number(m[1]);
  const end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
  return start <= end ? [start, end] : null;
}

/** Headers that describe the file, not one piece of it. */
const FILE_HEADERS = ['content-type', 'accept-ranges', 'last-modified', 'etag'];
function fileHeaders(entry: RecordedEntry): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of FILE_HEADERS) if (entry.headers[h]) out[h] = entry.headers[h];
  return out;
}

export interface Replay {
  /** The recorded answer for this request, or null when the set does not hold it. */
  find(method: string, url: string, range?: string | null): ReplayAnswer | null;
}

export function makeReplay(entries: Record<string, RecordedEntry>): Replay {
  // Each file's recorded pieces (GET with a body), by address, sorted by start.
  let pieces: Map<string, Piece[]> | null = null;
  const piecesOf = (url: string): Piece[] => {
    if (!pieces) {
      pieces = new Map();
      for (const [key, entry] of Object.entries(entries)) {
        if (!key.startsWith('GET ') || entry.offset === undefined || entry.length === undefined) continue;
        const rest = key.slice(4);
        const space = rest.indexOf(' ');
        const u = space < 0 ? rest : rest.slice(0, space);
        let piece: Piece | null = null;
        if (entry.status === 206) {
          const cr = contentRange(entry.headers['content-range']);
          if (cr && cr[1] - cr[0] + 1 === entry.length) piece = { start: cr[0], end: cr[1], total: cr[2], entry };
        } else if (entry.status === 200 && space < 0 && entry.length > 0) {
          piece = { start: 0, end: entry.length - 1, total: entry.length, entry }; // the whole file
        }
        if (!piece) continue;
        const list = pieces.get(u) ?? [];
        list.push(piece);
        pieces.set(u, list);
      }
      for (const list of pieces.values()) list.sort((a, b) => a.start - b.start || b.end - a.end);
    }
    return pieces.get(url) ?? [];
  };

  /** Slices of bodies.bin holding bytes [start, end] of the file, or null if a byte is missing. */
  const cover = (list: Piece[], start: number, end: number) => {
    const parts: { offset: number; length: number }[] = [];
    let at = start; // the next byte needed
    for (const p of list) {
      if (p.start > at) break; // a gap (sorted by start)
      if (p.end < at) continue;
      const to = Math.min(p.end, end);
      parts.push({ offset: p.entry.offset! + (at - p.start), length: to - at + 1 });
      at = to + 1;
      if (at > end) return parts;
    }
    return null;
  };

  return {
    find(method, url, range) {
      const hit = entries[keyOf(method, url, range)];
      if (hit) {
        const parts = hit.offset !== undefined && hit.length !== undefined ? [{ offset: hit.offset, length: hit.length }] : [];
        return { status: hit.status, headers: hit.headers, parts };
      }
      if (method !== 'GET' && method !== 'HEAD') return null;
      const all = piecesOf(url);
      if (!all.length) return null;
      // Pieces of one version of the file only (they all are: a run's files never change).
      const first = all[0]!;
      const total = first.total;
      const tag = first.entry.headers['etag'];
      const list = all.filter((p) => p.total === total && p.entry.headers['etag'] === tag);
      const headers = fileHeaders(first.entry);
      if (method === 'HEAD') return { status: 200, headers: { ...headers, 'content-length': String(total) }, parts: [] };
      if (!range) {
        const parts = cover(list, 0, total - 1);
        return parts ? { status: 200, headers, parts } : null;
      }
      const want = parseRange(range, total);
      if (!want) return null;
      const parts = cover(list, want[0], want[1]);
      return parts ? { status: 206, headers: { ...headers, 'content-range': `bytes ${want[0]}-${want[1]}/${total}` }, parts } : null;
    },
  };
}
