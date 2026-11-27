// Switching one feature off for a measuring run (build machine only):
// ?perf&off=bloom,water,... Each is put out the plainest way (hiding its map
// layers, or the tuning value that draws it), so the run without it can be
// set against the run with it. Nothing is saved: a reload brings it back.
// Features that the map panel keeps (3D, sun, satellite, clouds, wind
// streaks, the layer) are set through the saved choices instead
// (tools/perf/tour.mjs --prefs).
import type { Map as MapLibreMap } from 'maplibre-gl';
import { tuning } from '../map/tuning';

const hide = (map: MapLibreMap, test: (l: { id: string; type: string; source?: string }) => boolean) => {
  let n = 0;
  for (const l of map.getStyle().layers) {
    if (test(l as { id: string; type: string; source?: string })) { map.setLayoutProperty(l.id, 'visibility', 'none'); n++; }
  }
  return n;
};

export const SWITCHES: Record<string, (map: MapLibreMap) => number> = {
  /** The glow (a blurred copy of the map laid over it after every frame; app/map/bloom.ts). */
  bloom: () => { tuning.set({ bloom: 0 }); return 1; },
  /** Haze and fog in 3D. */
  haze: () => { tuning.set({ haze: 0 }); return 1; },
  /** The mountains' cast shadows (the sun's shadow picture). */
  shadows: (map) => hide(map, (l) => l.id === 'sun-cast'),
  /** The water's waves, glints and shore shine. */
  water: (map) => hide(map, (l) => ['water_waves', 'water_glint', 'water_shine'].includes(l.id)),
  /** The BC terrain zones and glaciers (ground colours from zones/terrain.pmtiles). */
  zones: (map) => hide(map, (l) => l.source === 'terrain-tiles'),
  /** Every label and icon (place names, peaks, huts, road names). */
  labels: (map) => hide(map, (l) => l.type === 'symbol'),
  hillshade: (map) => hide(map, (l) => l.type === 'hillshade'),
  contours: (map) => hide(map, (l) => l.id.startsWith('contour')),
  /** The weather fills (precipitation, temperature, wind) on the map. */
  fills: (map) => hide(map, (l) => ['precip-grid', 'temperature-grid', 'wind-grid'].includes(l.id)),
};

/** Applies ?perf&off=...; returns what was switched off and how many map layers each touched. */
export function applyOff(map: MapLibreMap, list: string): Record<string, number> {
  const done: Record<string, number> = {};
  for (const k of list.split(',').map((x) => x.trim()).filter(Boolean)) {
    const fn = SWITCHES[k];
    done[k] = fn ? fn(map) : -1;
  }
  map.triggerRepaint();
  return done;
}
