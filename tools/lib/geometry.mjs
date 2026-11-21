// Ring geometry for the terrain files: simplify, round the corners, measure.

/** Douglas-Peucker on one ring (closed rings keep their ends). */
export function simplify(pts, tol) {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, wi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = (px - (ax + u * dx)) ** 2 + (py - (ay + u * dy)) ** 2;
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst > t2) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Rounds the corners of a closed ring: each pass cuts every corner at a quarter and three quarters (Chaikin), so straight, angular edges become smooth curves. */
export function rounded(ring, passes = 2) {
  let pts = ring.slice(0, -1);
  for (let k = 0; k < passes; k++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    pts = next;
  }
  return [...pts, pts[0]];
}

export const roundPoint = (p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
export const ringArea = (ring) => Math.abs(ring.reduce((s, p, i) => s + (p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1]), 0) / 2);
