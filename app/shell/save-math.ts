// The numbers behind the Save for offline card, with no screen in them so they
// can be tested: a traced shape's size, and the scrubber's frame.
import type { LngLat } from '../../core/offline/save-request';

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LNG_AT_EQUATOR = 111.32;

/** The area inside a ring of points, in square kilometres (flat-earth shoelace, fine at the size of a day's hike). */
export function ringAreaKm2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = KM_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * kx * (y2 * KM_PER_DEG_LAT) - x2 * kx * (y1 * KM_PER_DEG_LAT);
  }
  return Math.abs(sum) / 2;
}

/** The area of [west, south, east, north], in square kilometres. */
export function bboxAreaKm2(b: [number, number, number, number]): number {
  const lat0 = (b[1] + b[3]) / 2;
  return (b[2] - b[0]) * KM_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat0 * Math.PI) / 180) * (b[3] - b[1]) * KM_PER_DEG_LAT;
}

/** The frame on the scrubber: two times, never closer than `minMs`, kept inside the axis. */
export interface Frame { from: number; to: number }

export function clampFrame(f: Frame, axis: Frame, minMs: number): Frame {
  const from = Math.max(axis.from, Math.min(f.from, axis.to - minMs));
  const to = Math.min(axis.to, Math.max(f.to, from + minMs));
  return { from: Math.min(from, to - minMs), to };
}

/** What a drag does: the left handle, the right handle, or the whole frame (moved, keeping its length). */
export function dragFrame(start: Frame, part: 'from' | 'to' | 'move', deltaMs: number, axis: Frame, minMs: number): Frame {
  // A handle stops short of the other one; it never pushes it.
  if (part === 'from') return { from: Math.max(axis.from, Math.min(start.from + deltaMs, start.to - minMs)), to: start.to };
  if (part === 'to') return { from: start.from, to: Math.min(axis.to, Math.max(start.to + deltaMs, start.from + minMs)) };
  const len = start.to - start.from;
  const from = Math.max(axis.from, Math.min(start.from + deltaMs, axis.to - len));
  return { from, to: from + len };
}

/** Bytes in plain words: "48 MB", "1.2 GB", "340 kB". */
export function formatBytes(b: number): string {
  if (b < 1e6) return `${Math.max(1, Math.round(b / 1e3))} kB`;
  if (b < 1e9) return `${b < 1e7 ? (b / 1e6).toFixed(1) : Math.round(b / 1e6)} MB`;
  return `${(b / 1e9).toFixed(1)} GB`;
}

/** An area in plain words: "0.8 km²", "38 km²", "1,240 km²". */
export function formatArea(km2: number): string {
  if (km2 < 10) return `${km2.toFixed(1)} km²`;
  return `${Math.round(km2).toLocaleString('en-CA')} km²`;
}
