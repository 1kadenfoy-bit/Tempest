// Trails, huts and peaks drawn over the terrain (Maps section).
//
// Trails come from the base map's own road layer (paths and tracks). Peaks and
// huts come from one small file the map tools cut out of the base map
// (tools/lib/peaks.mjs, public/tiles/places.json), because the base map holds
// peaks only from zoom 13 and we want the big ones named from zoom 10. The
// base map's own peak labels are switched off (app/map/style.ts) so a peak is
// never named twice. Peak heights follow the unit setting.
import type { Map as MapLibreMap, LayerSpecification } from 'maplibre-gl';
import { colorToken, type Theme } from '../theme/tokens';
import { formatElevation, unitSystem, type UnitSystem } from '../../core/units/format';
import { mix } from './style';

const PEAKS = 'places-peaks';
const HUTS = 'places-huts';
const TRAILS = 'trails';
const TRACKS = 'tracks';
const HUT_ICON = 'hut';

let placesUrl: string | null = null;
/** Where places.json lives (the base map router knows the tiles address). */
export function configurePlaces(url: string): void { placesUrl = url; }

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

/** Trails, huts and peaks, above the terrain and the weather, under the labels' top. */
export function addPlaces(map: MapLibreMap, beforeLayerId: string | undefined, theme: Theme): void {
  const col = trailColours(theme);
  const roads = { type: 'line', source: 'protomaps', 'source-layer': 'roads' } as const;
  const add = (l: LayerSpecification) => { if (!map.getLayer(l.id)) map.addLayer(l, beforeLayerId); };
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

  if (!placesUrl) return;
  fetch(placesUrl).then((r) => (r.ok ? (r.json() as Promise<Places>) : Promise.reject(new Error(String(r.status))))).then((places) => {
    const data = toGeoJson(places);
    if (!map.hasImage(HUT_ICON)) map.addImage(HUT_ICON, hutImage(colorToken('ink', theme)), { pixelRatio: 2 });
    map.addSource(PEAKS, { type: 'geojson', data: data.peaks });
    map.addSource(HUTS, { type: 'geojson', data: data.huts });
    add({
      id: HUTS, type: 'symbol', source: HUTS, minzoom: 10.5,
      layout: {
        'icon-image': HUT_ICON, 'icon-size': 0.6, 'icon-allow-overlap': true,
        'text-field': ['step', ['zoom'], '', 12, ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
        'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-optional': true,
      },
      paint: textPaint(theme),
    });
    add({
      id: PEAKS, type: 'symbol', source: PEAKS, minzoom: 9.5,
      filter: ['>=', ['get', 'e'], MIN_HEIGHT_BY_ZOOM as never],
      layout: {
        'icon-image': 'peak', 'icon-size': 0.8,
        'text-field': peakLabel(unitSystem()) as never, 'text-font': ['Noto Sans Medium'], 'text-size': 12,
        'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-optional': true,
        'symbol-sort-key': ['-', 0, ['get', 'e']],
      },
      paint: textPaint(theme),
    });
    // Follow the unit setting: the label is picked when the map settles.
    let shown = unitSystem();
    map.on('moveend', () => {
      const u = unitSystem();
      if (u === shown || !map.getLayer(PEAKS)) return;
      shown = u;
      map.setLayoutProperty(PEAKS, 'text-field', peakLabel(u) as never);
    });
  }).catch(() => { /* no places file (a partial local build): the map just has no peak or hut layers */ });
}

/** Recolour trails, huts and peaks for a theme. */
export function applyPlacesTheme(map: MapLibreMap, theme: Theme): void {
  const col = trailColours(theme);
  if (map.getLayer(TRAILS)) map.setPaintProperty(TRAILS, 'line-color', col.trail);
  if (map.getLayer(TRACKS)) map.setPaintProperty(TRACKS, 'line-color', col.track);
  for (const id of [PEAKS, HUTS]) {
    if (!map.getLayer(id)) continue;
    for (const [k, v] of Object.entries(textPaint(theme))) map.setPaintProperty(id, k as 'text-color', v as string);
  }
  if (map.hasImage(HUT_ICON)) map.updateImage(HUT_ICON, hutImage(colorToken('ink', theme)));
}
