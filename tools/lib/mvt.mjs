// Cuts polygons into Mapbox vector tiles (build tool only).
//
//   tileLayers(layers, z)  -> Map of "x/y" -> Uint8Array (an uncompressed tile)
//
// A layer is { name, features: [{ props, polygons }] }, a polygon being a list of
// rings in longitude and latitude (the first the outside, the rest holes). Each ring
// is simplified to about half a screen pixel at the zoom, clipped to the tile with a
// small margin, and written at 4096 steps across the tile.
import { PbfWriter } from 'pbf';
import { simplify } from './geometry.mjs';

const EXTENT = 4096;
const BUFFER = 64;

const mercY = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const mercX = (lng) => (lng + 180) / 360;

/** Clip a ring to one edge of the box (Sutherland-Hodgman). `inside` and `cross` describe the edge. */
function clipEdge(ring, inside, cross) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cross(a, b));
  }
  return out;
}

function clipRing(ring, lo, hi) {
  let r = ring;
  const edges = [
    [(p) => p[0] >= lo, (a, b) => { const t = (lo - a[0]) / (b[0] - a[0]); return [lo, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= hi, (a, b) => { const t = (hi - a[0]) / (b[0] - a[0]); return [hi, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= lo, (a, b) => { const t = (lo - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), lo]; }],
    [(p) => p[1] <= hi, (a, b) => { const t = (hi - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), hi]; }],
  ];
  for (const [inside, cross] of edges) {
    if (!r.length) break;
    r = clipEdge(r, inside, cross);
  }
  return r;
}

const signedArea = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;
const zigzag = (n) => (n << 1) ^ (n >> 31);

/** Geometry commands for a list of integer rings. */
function geometry(rings) {
  const cmds = [];
  let cx = 0, cy = 0;
  for (const ring of rings) {
    cmds.push((1 & 7) | (1 << 3), zigzag(ring[0][0] - cx), zigzag(ring[0][1] - cy));
    cx = ring[0][0]; cy = ring[0][1];
    cmds.push((2 & 7) | ((ring.length - 1) << 3));
    for (let i = 1; i < ring.length; i++) { cmds.push(zigzag(ring[i][0] - cx), zigzag(ring[i][1] - cy)); cx = ring[i][0]; cy = ring[i][1]; }
    cmds.push((7 & 7) | (1 << 3));
  }
  return cmds;
}

/** One polygon (rings in tile steps, already clipped) as integer rings with outside positive and holes negative; null when nothing is left. */
function finishPolygon(rings) {
  const out = [];
  rings.forEach((ring, k) => {
    const pts = [];
    for (const p of ring) {
      const q = [Math.round(p[0]), Math.round(p[1])];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
    }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) return;
    const a = signedArea(pts);
    if (Math.abs(a) < 2) return;
    // Outside rings positive, holes negative (what the tile format's readers expect).
    if ((k === 0) !== (a > 0)) pts.reverse();
    out.push(pts);
  });
  return out.length && signedArea(out[0]) > 0 ? out : null;
}

function encodeTile(layerList) {
  const w = new PbfWriter();
  for (const { name, features } of layerList) {
    const keys = [], values = [];
    const tag = (k, v) => {
      let ki = keys.indexOf(k); if (ki < 0) { ki = keys.length; keys.push(k); }
      let vi = values.indexOf(v); if (vi < 0) { vi = values.length; values.push(v); }
      return [ki, vi];
    };
    const encoded = features.map((f) => ({ tags: Object.entries(f.props).flatMap(([k, v]) => tag(k, String(v))), geom: geometry(f.rings) }));
    w.writeMessage(3, (_, pbf) => {
      pbf.writeVarintField(15, 2);
      pbf.writeStringField(1, name);
      for (const f of encoded) {
        pbf.writeMessage(2, (__, p2) => {
          p2.writePackedVarint(2, f.tags);
          p2.writeVarintField(3, 3);
          p2.writePackedVarint(4, f.geom);
        }, null);
      }
      for (const k of keys) pbf.writeStringField(3, k);
      for (const v of values) pbf.writeMessage(4, (__, p2) => p2.writeStringField(1, v), null);
      pbf.writeVarintField(5, EXTENT);
    }, null);
  }
  return w.finish();
}

/** Every tile at zoom z that holds some of the layers' polygons, as bytes. */
export function tileLayers(layers, z) {
  const n = 2 ** z;
  const tol = (0.5 * 360) / (512 * n);
  const tiles = new Map(); // "x/y" -> Map(layerName -> features)
  for (const layer of layers) {
    for (const f of layer.features) {
      for (const polygon of f.polygons) {
        const outer = simplify(polygon[0], tol);
        if (outer.length < 4) continue; // too small to see at this zoom
        const rings = [outer, ...polygon.slice(1).map((r) => simplify(r, tol)).filter((r) => r.length >= 4)].map((r) => r.slice(0, -1));
        const px = rings.map((r) => r.map(([lng, lat]) => [mercX(lng) * n, mercY(lat) * n]));
        const xs = px.flatMap((r) => r.map((p) => p[0])), ys = px.flatMap((r) => r.map((p) => p[1]));
        const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(n - 1, Math.floor(Math.max(...xs)));
        const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(n - 1, Math.floor(Math.max(...ys)));
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const lo = -BUFFER, hi = EXTENT + BUFFER;
            const clipped = px.map((r) => clipRing(r.map(([a, b]) => [(a - x) * EXTENT, (b - y) * EXTENT]), lo, hi));
            const done = finishPolygon(clipped);
            if (!done) continue;
            const key = `${x}/${y}`;
            let byLayer = tiles.get(key);
            if (!byLayer) { byLayer = new Map(); tiles.set(key, byLayer); }
            let list = byLayer.get(layer.name);
            if (!list) { list = []; byLayer.set(layer.name, list); }
            list.push({ props: f.props, rings: done });
          }
        }
      }
    }
  }
  const out = new Map();
  for (const [key, byLayer] of tiles) {
    out.set(key, encodeTile([...byLayer].map(([name, features]) => ({ name, features }))));
  }
  return out;
}
