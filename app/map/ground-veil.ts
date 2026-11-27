// The ground veil (Maps section): while a weather layer colours the whole map, the
// terrain colours (forest, alpine, glacier...) are quietened, so the weather's colours
// read true and do not turn muddy over strong greens. The terrain types still show
// through, and the relief, water, roads and labels are untouched: the veil is a sheet
// of the plain ground colour laid just above the terrain colours and under the water.
//
// Colour is for data: with no layer covering the map, the veil is off and the terrain
// colours are at full strength.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/tokens';
import { mapGround } from './style';

const LAYER = 'ground-veil';

/**
 * How much of the map a weather layer colours, 0 to 1. Temperature, wind and air quality
 * colour everywhere; precipitation and radar only where it rains or snows. Avalanche keeps
 * the full terrain: its colours are the issued danger ratings, drawn strong on their own.
 */
const COVER: Record<string, number> = { temperature: 1, wind: 1, 'air-quality': 1, precipitation: 0.45, radar: 0.45 };
/** How much of the plain ground covers the terrain colours under a layer that colours everywhere. */
const VEIL = 0.45;
/** On the light theme the terrain colours are already paler, so a lighter veil does the same job. */
const LIGHT = 0.8;

let map: MapLibreMap | null = null;
let layerId = '';
let theme: Theme = 'dark';
const listeners = new Set<() => void>();

/** How much of the map the weather layer now shown colours, 0 to 1 (the bloom reads it too). */
export function weatherCover(id: string = layerId): number {
  return COVER[id] ?? 0;
}

/** Called whenever the weather layer shown changes. */
export function onWeatherCover(fn: () => void): void { listeners.add(fn); }

/** The veil's strength for a weather layer and theme, 0 to 1. */
export function veilAmount(id: string, t: Theme): number {
  return VEIL * weatherCover(id) * (t === 'light' ? LIGHT : 1);
}

function apply(): void {
  if (!map?.getLayer(LAYER)) return;
  const a = veilAmount(layerId, theme);
  map.setPaintProperty(LAYER, 'background-color', mapGround(theme));
  map.setPaintProperty(LAYER, 'background-opacity', a);
  map.setLayoutProperty(LAYER, 'visibility', a > 0 ? 'visible' : 'none');
}

/** Adds the veil just under the water (above the terrain colours). Called once the style has loaded. */
export function addGroundVeil(m: MapLibreMap, t: Theme): void {
  map = m;
  theme = t;
  if (!m.getLayer(LAYER)) {
    const before = m.getLayer('water') ? 'water' : undefined;
    m.addLayer({ id: LAYER, type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': mapGround(t), 'background-opacity': 0 } }, before);
  }
  apply();
}

/** The weather layer now shown (its id), and the theme. Cheap to call again. */
export function setGroundVeil(id: string, t: Theme): void {
  const changed = id !== layerId;
  layerId = id;
  theme = t;
  apply();
  if (changed) for (const fn of listeners) fn();
}
