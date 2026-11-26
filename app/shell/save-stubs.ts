// STAND-INS for the calls the Save for offline card makes to the other chats
// (docs/plans/offline-save.md): the drawing tool (Maps) and the saving engine
// (Data). They give believable answers so the card can be built and tried now.
// When the real ones land, the lead swaps the functions in this one file; the
// card does not change. Nothing here saves anything.
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { LayerChoice, LayerEstimate, LayerTimeRange, LngLat, SaveEstimate, SaveJob, SaveProgress, SaveRequest, SaveShape } from '../../core/offline/save-request';
import { bboxAreaKm2, ringAreaKm2 } from './save-math';

const H = 3_600_000;

// ── Maps: the drawing tool ─────────────────────────────────────────────────

export interface Drawing { shape: Promise<SaveShape | null>; cancel(): void }

const SHAPE_SOURCE = 'save-shape';

/**
 * One finger traces a closed shape on the map and it closes when the finger lifts. Two fingers move
 * and zoom the map instead (the stroke in progress is dropped). The trace is kept in map coordinates,
 * so it stays on the ground while the map moves.
 */
export function startDrawing(map: MapLibreMap): Drawing {
  const pad = document.createElement('canvas');
  pad.className = 'draw-pad';
  const ratio = devicePixelRatio || 1;
  pad.width = innerWidth * ratio;
  pad.height = innerHeight * ratio;
  const ctx = pad.getContext('2d')!;
  ctx.scale(ratio, ratio);
  document.body.append(pad);
  let trace: LngLat[] = [];
  let finish: (s: SaveShape | null) => void = () => undefined;
  const shape = new Promise<SaveShape | null>((res) => { finish = res; });
  const end = (s: SaveShape | null) => { pad.remove(); map.off('move', paint); finish(s); };

  function paint() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (trace.length < 2) return;
    ctx.beginPath();
    trace.forEach((ll, i) => { const p = map.project(ll); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
  }
  map.on('move', paint);

  const fingers = new Map<number, { x: number; y: number }>();
  let gesture: { cx: number; cy: number; dist: number } | null = null;
  const two = () => {
    const [a, b] = [...fingers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 1) { const p = map.unproject([e.clientX, e.clientY]); trace = [[p.lng, p.lat]]; }
    else if (fingers.size === 2) { trace = []; paint(); gesture = two(); }
  });
  pad.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2 && gesture) {
      // Two fingers: move the map with the middle point, and zoom with the spread.
      const now = two();
      map.panBy([gesture.cx - now.cx, gesture.cy - now.cy], { animate: false });
      if (gesture.dist > 0 && now.dist > 0) map.setZoom(map.getZoom() + Math.log2(now.dist / gesture.dist), {});
      gesture = now;
      return;
    }
    if (fingers.size === 1 && trace.length) {
      const last = map.project(trace[trace.length - 1]!);
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) >= 6) { const p = map.unproject([e.clientX, e.clientY]); trace.push([p.lng, p.lat]); paint(); }
    }
  });
  const lift = (e: PointerEvent) => {
    const was = fingers.size;
    fingers.delete(e.pointerId);
    gesture = null;
    if (was !== 1) return; // the end of a two-finger move closes nothing
    if (trace.length < 12) { trace = []; paint(); return; }
    const step = Math.max(1, Math.ceil(trace.length / 200));
    const ring: LngLat[] = trace.filter((_, i) => i % step === 0);
    const lngs = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
    end({ outline: ring, bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] });
  };
  pad.addEventListener('pointerup', lift);
  pad.addEventListener('pointercancel', (e) => { fingers.delete(e.pointerId); gesture = null; trace = []; paint(); });
  return { shape, cancel: () => end(null) };
}

/** Show (or with null, remove) the outline on the map. */
export function showShape(map: MapLibreMap, shape: SaveShape | null): void {
  const data = { type: 'FeatureCollection' as const, features: shape ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[...shape.outline, shape.outline[0]!]] } }] : [] };
  const src = map.getSource(SHAPE_SOURCE) as GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  map.addSource(SHAPE_SOURCE, { type: 'geojson', data });
  map.addLayer({ id: 'save-shape-fill', type: 'fill', source: SHAPE_SOURCE, paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'save-shape-line', type: 'line', source: SHAPE_SOURCE, paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [3, 2] } });
}

// ── Data: the saving engine ───────────────────────────────────────────────

/** How far ahead each model reaches, in hours, and its grid in km (stand-in numbers, close to the real ones). */
const MODEL: Record<string, { ahead: number; km: number }> = { hrdps: { ahead: 48, km: 2.5 }, rdps: { ahead: 84, km: 10 }, ecmwf: { ahead: 360, km: 9 }, gdps: { ahead: 240, km: 15 }, auto: { ahead: 360, km: 6 } };

export async function layerTimeRange(layer: string, model: string | 'auto'): Promise<LayerTimeRange> {
  const now = Date.now();
  if (layer === 'radar') return { layer, model, earliest: new Date(now - 3 * H), latest: new Date(now), age: '5 min old' };
  if (layer === 'avalanche') return { layer, model, earliest: new Date(now), latest: new Date(now + 72 * H), age: '6 h old' };
  if (layer === 'air-quality') return { layer, model, earliest: new Date(now - 48 * H), latest: new Date(now + 72 * H), age: '3 h old' };
  const m = MODEL[model] ?? MODEL.auto!;
  return { layer, model, earliest: new Date(now - 48 * H), latest: new Date(now + m.ahead * H), age: '2 h old' };
}

export async function estimateSave(req: SaveRequest): Promise<SaveEstimate> {
  const km2 = bboxAreaKm2(req.shape.bbox);
  const mapBytes = ringAreaKm2(req.shape.outline) * 0.9e6;
  const layers: LayerEstimate[] = [];
  for (const c of req.layers) {
    const r = await layerTimeRange(c.layer, c.model);
    const from = new Date(Math.max(req.from.getTime(), r.earliest.getTime()));
    const to = new Date(Math.min(req.to.getTime(), r.latest.getTime()));
    const covers = to > from ? { from, to } : null;
    const hours = covers ? (to.getTime() - from.getTime()) / H : 0;
    const km = (MODEL[c.model] ?? MODEL.auto!).km;
    const bytes = covers ? Math.round((km2 / (km * km)) * hours * 4 * 2) : 0;
    const entry: LayerEstimate = { layer: c.layer, bytes, covers };
    if (!covers) entry.note = 'No data in this time span';
    else if (to < req.to) entry.note = 'Its data ends before the end of the span';
    layers.push(entry);
  }
  return { mapBytes, layers, totalBytes: mapBytes + layers.reduce((n, l) => n + l.bytes, 0) };
}

/** A pretend save that takes a few seconds, so the card and the Notification Centre can be tried. */
export function startSave(req: SaveRequest): SaveJob {
  const listeners = new Set<(p: SaveProgress) => void>();
  let timer = 0;
  let cancelled = false;
  const steps = [...req.layers.map((l: LayerChoice) => `${l.layer}, ${l.model}`), 'Map'];
  const done = new Promise<string>((resolve, reject) => {
    let i = 0;
    timer = window.setInterval(() => {
      if (cancelled) { clearInterval(timer); reject(new Error('Cancelled')); return; }
      i += 1;
      const p: SaveProgress = { done: i, total: steps.length * 4, label: steps[Math.min(steps.length - 1, Math.floor((i - 1) / 4))]! };
      for (const fn of listeners) fn(p);
      if (i >= steps.length * 4) { clearInterval(timer); resolve(`stand-in-${Date.now()}`); }
    }, 600);
  });
  return { id: `save-${Date.now()}`, request: req, onProgress: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, done, cancel: () => { cancelled = true; } };
}
