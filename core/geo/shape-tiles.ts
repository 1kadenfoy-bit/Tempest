// Pure geometry for a shape traced on the map (no map, no browser): cleaning up a
// finger trace into a closed outline that never crosses itself, and listing the
// base map tiles that touch an outline. Used by the drawing tool (app/map/draw-shape.ts)
// and by the saving engine, which cuts the saved map pieces to the shape
// (docs/plans/offline-save.md).
import type { LngLat, SaveShape } from '../offline/save-request';

export type Ring = LngLat[];

/** The most points an outline keeps. */
export const MAX_POINTS = 300;

/** Signed area of a ring, positive when it runs counter-clockwise (in x right, y up). */
export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** The box around a ring: west, south, east, north. */
export function bboxOf(r: Ring): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

/** Chaikin corner-cutting on a closed ring: each pass replaces every corner with two points a quarter in. Smooths a shaky trace. */
export function smoothRing(r: Ring, passes = 2): Ring {
  let pts = r;
  for (let k = 0; k < passes; k++) {
    const next: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    pts = next;
  }
  return pts;
}

/** Drops points closer than `tol` to the straight line between their neighbours (Douglas-Peucker on a closed ring, split at its two farthest-apart points). */
export function simplifyRing(r: Ring, tol: number): Ring {
  if (r.length <= 4) return r;
  const dist = (p: LngLat, a: LngLat, b: LngLat) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    const u = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
  };
  const run = (pts: Ring): Ring => {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      let worst = -1, wi = -1;
      for (let i = a + 1; i < b; i++) { const d = dist(pts[i]!, pts[a]!, pts[b]!); if (d > worst) { worst = d; wi = i; } }
      if (worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const mid = Math.floor(r.length / 2);
  const first = run(r.slice(0, mid + 1));
  const second = run([...r.slice(mid), r[0]!]);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** Reduces a ring to at most `max` points by simplifying with a growing tolerance. */
export function limitPoints(r: Ring, max = MAX_POINTS): Ring {
  const [w, s, e, n] = bboxOf(r);
  let tol = Math.max(e - w, n - s) / 2000;
  let out = r;
  for (let i = 0; i < 30 && out.length > max; i++) { out = simplifyRing(r, tol); tol *= 1.5; }
  return out.length > max ? out.filter((_, i) => i % Math.ceil(out.length / max) === 0) : out;
}

/** Whether segments p1p2 and p3p4 cross (touching ends do not count). */
function crosses(p1: LngLat, p2: LngLat, p3: LngLat, p4: LngLat): boolean {
  const o = (a: LngLat, b: LngLat, c: LngLat) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The first pair of edges of a ring that cross each other, or null when it is simple. */
export function findCrossing(r: Ring): [number, number] | null {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours across the closing edge
      if (crosses(r[i]!, r[(i + 1) % n]!, r[j]!, r[(j + 1) % n]!)) return [i, j];
    }
  }
  return null;
}

/**
 * Fixes a ring that crosses itself by cutting out each loop: when edge i crosses
 * edge j, the points between them are a loop, dropped and replaced by the crossing
 * point. When more than one loop is cut, the largest part is kept.
 */
export function removeLoops(r: Ring): Ring {
  let ring = r;
  for (let guard = 0; guard < 200; guard++) {
    const c = findCrossing(ring);
    if (!c) return ring;
    const [i, j] = c;
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!, p = ring[j]!, q = ring[(j + 1) % ring.length]!;
    // The crossing point of the two edges.
    const t = ((p[0] - a[0]) * (q[1] - p[1]) - (p[1] - a[1]) * (q[0] - p[0])) / ((b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]));
    const x: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    // Two parts: the loop (points i+1 .. j) and the rest. Keep the bigger one.
    const loop: Ring = [x, ...ring.slice(i + 1, j + 1)];
    const rest: Ring = [...ring.slice(0, i + 1), x, ...ring.slice(j + 1)];
    ring = Math.abs(signedArea(loop)) > Math.abs(signedArea(rest)) ? loop : rest;
    if (ring.length < 3) return ring;
  }
  return ring;
}

/**
 * A finger trace made into a saved shape: closed, smoothed, simplified to at most
 * 300 points, with its loops cut out. Null when there is nothing left worth saving
 * (fewer than three points, or no area).
 */
export function shapeFromTrace(trace: LngLat[]): SaveShape | null {
  // Drop repeated points, then a repeated closing point.
  let r = trace.filter((p, i) => i === 0 || p[0] !== trace[i - 1]![0] || p[1] !== trace[i - 1]![1]);
  if (r.length > 1 && r[0]![0] === r[r.length - 1]![0] && r[0]![1] === r[r.length - 1]![1]) r = r.slice(0, -1);
  if (r.length < 3) return null;
  r = removeLoops(r);
  if (r.length < 3) return null;
  r = limitPoints(smoothRing(r, 2));
  r = removeLoops(r); // smoothing can make a tight corner touch itself
  r = limitPoints(r);
  if (r.length < 3 || Math.abs(signedArea(r)) < 1e-10) return null;
  return { outline: r, bbox: bboxOf(r) };
}

/** Whether a point is inside a ring (even-odd rule). */
export function pointInRing(p: LngLat, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!, b = r[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// ---- Tiles ----

const mercX = (lng: number, n: number) => ((lng + 180) / 360) * n;
const mercY = (lat: number, n: number) => {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
};

export interface TileAddress { z: number; x: number; y: number }

/** Whether a segment touches a box (the tile's square in tile units). */
function segmentTouchesBox(a: [number, number], b: [number, number], x0: number, y0: number): boolean {
  const x1 = x0 + 1, y1 = y0 + 1;
  // Either end inside, or the segment crosses one of the four sides.
  const inside = (p: [number, number]) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  if (inside(a) || inside(b)) return true;
  const sides: [[number, number], [number, number]][] = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
  const o = (p: [number, number], q: [number, number], s: [number, number]) => (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
  return sides.some(([c, d]) => o(a, b, c) * o(a, b, d) <= 0 && o(c, d, a) * o(c, d, b) <= 0);
}

/**
 * The base map tiles that touch an outline, zoom `minZoom` to `maxZoom`: every tile
 * the outline passes through, and every tile wholly inside it. The saving engine
 * keeps just these, so a thin shape saves a thin strip of map, not its whole box.
 */
export function tilesForShape(shape: SaveShape, minZoom: number, maxZoom: number): TileAddress[] {
  const out: TileAddress[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const pts = shape.outline.map(([lng, lat]): [number, number] => [mercX(lng, n), mercY(lat, n)]);
    const [w, s, e, nn] = shape.bbox;
    const x0 = Math.max(0, Math.floor(mercX(w, n))), x1 = Math.min(n - 1, Math.floor(mercX(e, n)));
    const y0 = Math.max(0, Math.floor(mercY(nn, n))), y1 = Math.min(n - 1, Math.floor(mercY(s, n)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let touches = false;
        for (let i = 0; i < pts.length && !touches; i++) touches = segmentTouchesBox(pts[i]!, pts[(i + 1) % pts.length]!, x, y);
        // A tile the outline never touches is either wholly inside it or outside: look at its centre.
        if (!touches) touches = pointInRingXY([x + 0.5, y + 0.5], pts);
        if (touches) out.push({ z, x, y });
      }
    }
  }
  return out;
}

function pointInRingXY(p: [number, number], r: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!, b = r[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
