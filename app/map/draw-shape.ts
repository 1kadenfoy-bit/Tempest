// Drawing a shape on the map to save for offline use (docs/plans/offline-save.md).
//
//   startDrawing(map)       one finger traces a free shape; lifting it closes the shape.
//                           Two fingers still pan and zoom while drawing. The map is
//                           flattened to 2D while drawing and its tilt put back after.
//   showShape(map, shape)   draws the outline and greys the map outside it (null clears).
//
// The trace is cleaned up by core/geo/shape-tiles.ts: closed, smoothed, at most 300
// points, never crossing itself. A trace that leaves nothing (a line, a dot) is
// ignored and the user simply draws again.
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { shapeFromTrace } from '../../core/geo/shape-tiles';
import type { LngLat, SaveShape } from '../../core/offline/save-request';
import { S } from '../state';
import { colorToken, type Theme } from '../theme/tokens';

const TRACE = 'draw-trace';
const SHAPE = 'save-shape';
const LAYERS = { trace: 'draw-trace-line', traceCasing: 'draw-trace-casing', dim: 'save-shape-dim', line: 'save-shape-line', lineCasing: 'save-shape-casing' };
/** A point is added to the trace once the finger has moved this many pixels, so a slow drag stays cheap. */
const MIN_STEP_PX = 3;
/** The tilt animation's length, in ms. */
const FLATTEN_MS = 250;

const theme = (): Theme => { try { return S?.settings?.theme() ?? 'dark'; } catch { return 'dark'; } };
const empty = { type: 'FeatureCollection' as const, features: [] };

/** Adds the sources and layers once (the style may not have them yet). */
function ensureLayers(map: MapLibreMap): void {
  if (map.getSource(SHAPE)) return;
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  const ink = colorToken('ink', theme());
  const casing = theme() === 'dark' ? '#000000' : '#FFFFFF';
  map.addSource(SHAPE, { type: 'geojson', data: empty });
  map.addSource(TRACE, { type: 'geojson', data: empty });
  // Greyed outside, then the outline, then the live trace on top.
  map.addLayer({ id: LAYERS.dim, type: 'fill', source: SHAPE, filter: ['==', ['get', 'kind'], 'outside'], paint: { 'fill-color': colorToken('scrim', theme()), 'fill-opacity': 1 } }, firstLabel);
  map.addLayer({ id: LAYERS.lineCasing, type: 'line', source: SHAPE, filter: ['==', ['get', 'kind'], 'edge'], layout: { 'line-join': 'round' }, paint: { 'line-color': casing, 'line-width': 5, 'line-opacity': 0.5 } }, firstLabel);
  map.addLayer({ id: LAYERS.line, type: 'line', source: SHAPE, filter: ['==', ['get', 'kind'], 'edge'], layout: { 'line-join': 'round' }, paint: { 'line-color': ink, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } }, firstLabel);
  map.addLayer({ id: LAYERS.traceCasing, type: 'line', source: TRACE, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': casing, 'line-width': 7, 'line-opacity': 0.5 } }, firstLabel);
  map.addLayer({ id: LAYERS.trace, type: 'line', source: TRACE, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ink, 'line-width': 3.5 } }, firstLabel);
}

const setData = (map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

/** The world as a polygon with the outline cut out of it: what greys the map outside the shape. */
function outsideOf(outline: LngLat[]): GeoJSON.Feature {
  const world: LngLat[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return { type: 'Feature', properties: { kind: 'outside' }, geometry: { type: 'Polygon', coordinates: [world, [...outline, outline[0]!]] } };
}

/** Draws the shape's outline and greys the map outside it, or clears both (null). */
export function showShape(map: MapLibreMap, shape: SaveShape | null): void {
  ensureLayers(map);
  if (!shape) { setData(map, SHAPE, empty); return; }
  const ring = [...shape.outline, shape.outline[0]!];
  setData(map, SHAPE, {
    type: 'FeatureCollection',
    features: [outsideOf(shape.outline), { type: 'Feature', properties: { kind: 'edge' }, geometry: { type: 'LineString', coordinates: ring } }],
  });
}

export interface Drawing {
  /** Resolves with the closed shape when the finger lifts after a real trace; null if cancelled. */
  shape: Promise<SaveShape | null>;
  cancel(): void;
}

export function startDrawing(map: MapLibreMap): Drawing {
  ensureLayers(map);
  const container = map.getCanvasContainer();
  const before = { pitch: map.getPitch(), bearing: map.getBearing() };
  // 2D while drawing: tracing on a tilted map is hard to do right (Kaden, Nov 22).
  const tilted = before.pitch > 0.5 || Math.abs(before.bearing) > 0.5;
  if (tilted) map.easeTo({ pitch: 0, bearing: 0, duration: FLATTEN_MS });

  let resolve!: (s: SaveShape | null) => void;
  const shape = new Promise<SaveShape | null>((r) => { resolve = r; });

  const pointers = new Map<number, true>();
  let trace: LngLat[] = [];
  let last: { x: number; y: number } | null = null;
  let tracing: number | null = null;
  let frame = 0;
  let finished = false;

  const panWasOn = map.dragPan.isEnabled();
  // One finger draws, so the map must not drag under it; two fingers give the map its gestures back.
  const claim = (on: boolean) => { if (on) map.dragPan.disable(); else if (panWasOn) map.dragPan.enable(); };
  claim(true);
  container.style.cursor = 'crosshair';
  // The browser must not take a one-finger drag for a scroll (it would cancel the stroke): the map's own touch handling does the pan and zoom.
  const canvas = map.getCanvas();
  const touchActions = [container.style.touchAction, canvas.style.touchAction];
  container.style.touchAction = 'none';
  canvas.style.touchAction = 'none';

  const paint = () => {
    frame = 0;
    setData(map, TRACE, trace.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trace } }] } : empty);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const reset = () => { trace = []; last = null; tracing = null; setData(map, TRACE, empty); };

  const at = (e: PointerEvent) => { const r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const down = (e: PointerEvent) => {
    if (finished || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointers.set(e.pointerId, true);
    if (pointers.size >= 2) {
      // A second finger: this is a pan or zoom, not a drawing. Drop the stroke and hand the map its gestures.
      reset();
      claim(false);
      return;
    }
    claim(true);
    tracing = e.pointerId;
    const p = at(e);
    last = p;
    const ll = map.unproject([p.x, p.y]);
    trace = [[ll.lng, ll.lat]];
  };

  const move = (e: PointerEvent) => {
    if (finished || e.pointerId !== tracing || pointers.size !== 1 || !last) return;
    const p = at(e);
    if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP_PX) return;
    last = p;
    const ll = map.unproject([p.x, p.y]);
    trace.push([ll.lng, ll.lat]);
    schedule();
  };

  const up = (e: PointerEvent) => {
    const wasTracing = e.pointerId === tracing;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) claim(true);
    if (finished || !wasTracing) return;
    const closed = shapeFromTrace(trace);
    if (!closed) { reset(); return; } // a tap or a line: draw again
    finish(closed);
  };

  const cancelPointer = (e: PointerEvent) => { pointers.delete(e.pointerId); if (e.pointerId === tracing) reset(); if (pointers.size === 0) claim(true); };

  function finish(result: SaveShape | null) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    container.removeEventListener('pointerdown', down, true);
    container.removeEventListener('pointermove', move, true);
    container.removeEventListener('pointerup', up, true);
    container.removeEventListener('pointercancel', cancelPointer, true);
    setData(map, TRACE, empty);
    container.style.cursor = '';
    container.style.touchAction = touchActions[0]!;
    canvas.style.touchAction = touchActions[1]!;
    if (panWasOn) map.dragPan.enable();
    // The tilt comes back once drawing is over.
    if (tilted) map.easeTo({ pitch: before.pitch, bearing: before.bearing, duration: FLATTEN_MS });
    if (result) showShape(map, result);
    resolve(result);
  }

  container.addEventListener('pointerdown', down, true);
  container.addEventListener('pointermove', move, true);
  container.addEventListener('pointerup', up, true);
  container.addEventListener('pointercancel', cancelPointer, true);

  return { shape, cancel: () => finish(null) };
}
