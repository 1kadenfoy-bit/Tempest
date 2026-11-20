// Trails, huts and peaks drawn over the terrain (Maps section).
//
// Trails and their names come from the base map's own road layer. Peaks are
// named from the base map from zoom 13, the way it always did, each with its
// height under the name. Where the map tools cut a peaks file out of the base
// map (tools/lib/peaks.mjs, public/places/places.json), the tall peaks and the
// huts are named from zoom 10 as well, and that layer hands over to the base
// map's at zoom 13 so a peak is never named twice. Heights follow the unit
// setting.
import type { Map as MapLibreMap, LayerSpecification } from 'maplibre-gl';
import { colorToken, type Theme } from '../theme/tokens';
import { formatElevation, unitSystem, type UnitSystem } from '../../core/units/format';
import { mix } from './style';

const PEAKS = 'places-peaks';
const HUTS = 'places-huts';
const TRAILS = 'trails';
const TRACKS = 'tracks';
const HUT_ICON = 'hut';

/** The peaks and huts file ships with the app (tools/lib/peaks.mjs writes it). */
const placesUrl = () => new URL('places/places.json', document.baseURI).href;

type PeakRow = [name: string, elevation: number | null, lng: number, lat: number];
type HutRow = [name: string, kind: string, lng: number, lat: number];
interface Places { peaks: PeakRow[]; huts: HutRow[] }

/** Trails and track colours: the ink pulled toward the ground, so they read without a new colour. */
export function trailColours(theme: Theme): { trail: string; track: string } {
  const ground = colorToken('map-ground', theme);
  const ink = colorToken('ink', theme);
  return { trail: mix(ground, ink, theme === 'dark' ? 0.8 : 0.7), track: mix(ground, ink, theme === 'dark' ? 0.5 : 0.45) };
}

/** A little hut, drawn once on a canvas so it follows the theme's ink. */
function hutImage(colour: string): ImageData {
  const size = 48;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(24, 6); g.lineTo(43, 24); g.lineTo(37, 24); g.lineTo(37, 40); g.lineTo(11, 40); g.lineTo(11, 24); g.lineTo(5, 24);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(20, 28, 8, 12);
  return g.getImageData(0, 0, size, size);
}

const peakLabel = (system: UnitSystem): unknown[] => [
  'format',
  ['get', 'name'], {},
  ['case', ['has', system === 'metric' ? 'm' : 'ft'], ['concat', '\n', ['get', system === 'metric' ? 'm' : 'ft']], ''],
  { 'font-scale': 0.85 },
];

/** From this height, by zoom, the peaks that show: the highest first, every peak close in. */
const MIN_HEIGHT_BY_ZOOM = ['step', ['zoom'], 2600, 10, 2300, 11, 1900, 12, 1400, 13, 800, 14, 0];

function toGeoJson(p: Places) {
  return {
    peaks: {
      type: 'FeatureCollection' as const,
      features: p.peaks.map(([name, e, lng, lat]) => ({
        type: 'Feature' as const,
        properties: { name, e: e ?? 0, ...(e != null ? { m: formatElevation(e, 'metric'), ft: formatElevation(e, 'imperial') } : {}) },
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      })),
    },
    huts: {
      type: 'FeatureCollection' as const,
      features: p.huts.map(([name, kind, lng, lat]) => ({
        type: 'Feature' as const,
        properties: { name, kind },
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      })),
    },
  };
}

function textPaint(theme: Theme) {
  return {
    'text-color': colorToken('ink', theme),
    'text-halo-color': theme === 'dark' ? colorToken('water') : colorToken('map-ground', 'light'),
    'text-halo-width': 1.5,
  };
}

const BASE_PEAKS = 'peaks-base';
const BASE_HUTS = 'huts-base';
/** The base map's own label for minor roads and paths: where trails are named (shown from zoom 14, where the base map has the names). */
const TRAIL_NAMES = 'roads_labels_minor';
/** The base map's own kinds that are huts or shelters. */
const HUT_KINDS = ['alpine_hut', 'wilderness_hut', 'shelter', 'hut'];
/** From this zoom the base map's own peaks and huts (every one, everywhere) take over from the peaks file. */
const BASE_FROM = 13;

/** Height under the name from the base map's own `elevation` field, in the unit setting. */
const baseHeight = (system: UnitSystem): unknown => ['number-format', system === 'metric' ? ['get', 'elevation'] : ['*', ['get', 'elevation'], 3.28084], { locale: 'en-CA', 'max-fraction-digits': 0 }];
const basePeakLabel = (system: UnitSystem): unknown[] => [
  'format', ['get', 'name'], {},
  ['case', ['has', 'elevation'], ['concat', '\n', baseHeight(system), system === 'metric' ? ' m' : ' ft'], ''], { 'font-scale': 0.85 },
];

/** Trails, huts and peaks, above the terrain and the weather, under the labels' top. */
export function addPlaces(map: MapLibreMap, beforeLayerId: string | undefined, theme: Theme): void {
  const col = trailColours(theme);
  const roads = { type: 'line', source: 'protomaps', 'source-layer': 'roads' } as const;
  const add = (l: LayerSpecification) => { if (!map.getLayer(l.id)) map.addLayer(l, beforeLayerId); };
  if (!map.hasImage(HUT_ICON)) map.addImage(HUT_ICON, hutImage(colorToken('ink', theme)), { pixelRatio: 2 });
  add({
    ...roads, id: TRACKS, minzoom: 12,
    filter: ['all', ['==', ['get', 'kind'], 'path'], ['==', ['get', 'kind_detail'], 'track']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': col.track, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1.6], 'line-dasharray': [3, 2] },
  });
  add({
    ...roads, id: TRAILS, minzoom: 12,
    filter: ['all', ['==', ['get', 'kind'], 'path'], ['in', ['get', 'kind_detail'], ['literal', ['path', 'footway', 'steps', 'bridleway']]]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': col.trail, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.9, 16, 2.4], 'line-dasharray': [2, 1.4] },
  });
  // The base map's own peaks and huts, from zoom 13, everywhere it has them.
  add({
    id: BASE_PEAKS, type: 'symbol', source: 'protomaps', 'source-layer': 'pois', minzoom: BASE_FROM,
    filter: ['all', ['==', ['get', 'kind'], 'peak'], ['has', 'name']],
    layout: {
      'icon-image': 'peak', 'icon-size': 0.8, 'text-field': basePeakLabel(unitSystem()) as never, 'text-font': ['Noto Sans Medium'], 'text-size': 12,
      'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-optional': true, 'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'elevation'], 0]],
    },
    paint: textPaint(theme),
  });
  add({
    id: BASE_HUTS, type: 'symbol', source: 'protomaps', 'source-layer': 'pois', minzoom: BASE_FROM,
    filter: ['all', ['in', ['get', 'kind'], ['literal', HUT_KINDS]], ['has', 'name']],
    layout: {
      'icon-image': HUT_ICON, 'icon-size': 0.6, 'icon-allow-overlap': true, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
      'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-optional': true,
    },
    paint: textPaint(theme),
  });

  // Follow the unit setting: the labels are switched when the map settles.
  let shown = unitSystem();
  map.on('moveend', () => {
    const u = unitSystem();
    if (u === shown) return;
    shown = u;
    if (map.getLayer(BASE_PEAKS)) map.setLayoutProperty(BASE_PEAKS, 'text-field', basePeakLabel(u) as never);
    if (map.getLayer(PEAKS)) map.setLayoutProperty(PEAKS, 'text-field', peakLabel(u) as never);
  });

  // Where the map tools cut a peaks file, tall peaks and huts show from further out.
  fetch(placesUrl()).then((r) => (r.ok ? (r.json() as Promise<Places>) : Promise.reject(new Error(String(r.status))))).then((places) => {
    const data = toGeoJson(places);
    map.addSource(PEAKS, { type: 'geojson', data: data.peaks });
    map.addSource(HUTS, { type: 'geojson', data: data.huts });
    add({
      id: HUTS, type: 'symbol', source: HUTS, minzoom: 10.5, maxzoom: BASE_FROM,
      layout: {
        'icon-image': HUT_ICON, 'icon-size': 0.6, 'icon-allow-overlap': true,
        'text-field': ['step', ['zoom'], '', 12, ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
        'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-optional': true,
      },
      paint: textPaint(theme),
    });
    add({
      id: PEAKS, type: 'symbol', source: PEAKS, minzoom: 9.5, maxzoom: BASE_FROM,
      filter: ['>=', ['get', 'e'], MIN_HEIGHT_BY_ZOOM as never],
      layout: {
        'icon-image': 'peak', 'icon-size': 0.8,
        'text-field': peakLabel(unitSystem()) as never, 'text-font': ['Noto Sans Medium'], 'text-size': 12,
        'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-optional': true,
        'symbol-sort-key': ['-', 0, ['get', 'e']],
      },
      paint: textPaint(theme),
    });
  }).catch(() => { /* no peaks file: the base map's peaks and huts still show from zoom 13 */ });
}

/** Recolour trails, huts and peaks for a theme. */
export function applyPlacesTheme(map: MapLibreMap, theme: Theme): void {
  const col = trailColours(theme);
  if (map.getLayer(TRAILS)) map.setPaintProperty(TRAILS, 'line-color', col.trail);
  if (map.getLayer(TRACKS)) map.setPaintProperty(TRACKS, 'line-color', col.track);
  for (const id of [PEAKS, HUTS, BASE_PEAKS, BASE_HUTS]) {
    if (!map.getLayer(id)) continue;
    for (const [k, v] of Object.entries(textPaint(theme))) map.setPaintProperty(id, k as 'text-color', v as string);
  }
  if (map.hasImage(HUT_ICON)) map.updateImage(HUT_ICON, hutImage(colorToken('ink', theme)));
}

/** Layers whose names can take the pin, and how to treat each: points snap to themselves, lines to the nearest point on them. */
const NAMED_LAYERS = [PEAKS, BASE_PEAKS, HUTS, BASE_HUTS, TRAIL_NAMES];

/**
 * The named peak, hut or trail nearest a tap, within `radius` pixels, with the
 * place the pin should take: the peak's or hut's own spot, or the nearest point
 * on the trail. Peaks win over huts, huts over trails.
 */
export function namedPlaceAt(map: MapLibreMap, point: { x: number; y: number }, radius = 28): { name: string; lng: number; lat: number } | null {
  const layers = NAMED_LAYERS.filter((id) => map.getLayer(id));
  if (!layers.length) return null;
  const feats = map.queryRenderedFeatures([[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]], { layers });
  let best: { name: string; lng: number; lat: number; rank: number; d: number } | null = null;
  for (const f of feats) {
    const name = f.properties?.name;
    if (typeof name !== 'string' || !name) continue;
    // The base map's label layer also names minor roads; only its trails count.
    if (f.layer.id === TRAIL_NAMES && f.properties?.kind !== 'path') continue;
    const rank = f.layer.id === PEAKS || f.layer.id === BASE_PEAKS ? 0 : f.layer.id === HUTS || f.layer.id === BASE_HUTS ? 1 : 2;
    const hit = nearestOn(map, f.geometry, point);
    if (!hit || hit.d > radius) continue;
    if (!best || rank < best.rank || (rank === best.rank && hit.d < best.d)) best = { name, lng: hit.lng, lat: hit.lat, rank, d: hit.d };
  }
  return best ? { name: best.name, lng: best.lng, lat: best.lat } : null;
}

/** The point of a feature's geometry nearest the tap, and its distance in pixels. */
function nearestOn(map: MapLibreMap, g: GeoJSON.Geometry, tap: { x: number; y: number }): { lng: number; lat: number; d: number } | null {
  const lines: number[][][] = g.type === 'Point' ? [[g.coordinates]] : g.type === 'MultiPoint' ? g.coordinates.map((c) => [c]) : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  let best: { lng: number; lat: number; d: number } | null = null;
  for (const line of lines) {
    const pts = line.map((c) => map.project([c[0]!, c[1]!]));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[Math.min(i + 1, pts.length - 1)]!;
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const u = len2 ? Math.max(0, Math.min(1, ((tap.x - a.x) * dx + (tap.y - a.y) * dy) / len2)) : 0;
      const px = a.x + u * dx, py = a.y + u * dy;
      const d = Math.hypot(tap.x - px, tap.y - py);
      if (!best || d < best.d) { const ll = map.unproject([px, py]); best = { lng: ll.lng, lat: ll.lat, d }; }
    }
  }
  return best;
}
