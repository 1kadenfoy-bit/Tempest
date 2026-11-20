// Hillshade and contours from Mapterhorn terrain tiles (Terrarium-encoded,
// 512 px WebP). Contours are drawn on the device with maplibre-contour, so they
// need no separate download.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { maplibregl } from './maplibre';
import mlcontour from 'maplibre-contour';
import { colorToken, type Theme } from '../theme/tokens';
import { mix } from './style';
import { addPlaces, applyPlacesTheme } from './places';
import { mapSun } from './sun';

export { terrainSource } from './terrain-source';
import { terrainSource } from './terrain-source';

// Above zoom 12 terrain files grow tenfold for little gain over BC's 30 m data
// (docs/spikes/03-download-sizes.md), so the map overzooms from 12.
const TERRAIN_MAXZOOM = 12;

/** The raster-dem source 3D terrain uses. */
export const TERRAIN_3D_SOURCE = 'terrain-3d';

/**
 * Hillshade and contour colours for a theme. Dark: shadows in the water
 * colour, highlights a white tint. Light: shadows the ground darkened toward
 * the ink, highlights the white surface, so relief reads the same way round.
 */
export function terrainPaint(theme: Theme): { hillshade: Record<string, string>; contours: Record<string, string> } {
  const dark = theme === 'dark';
  return {
    hillshade: {
      'hillshade-shadow-color': dark ? mix(colorToken('water'), colorToken('map-ground'), 0.75) : mix(colorToken('map-ground', 'light'), colorToken('ink', 'light'), 0.55),
      'hillshade-highlight-color': dark ? colorToken('stroke-strong') : colorToken('surface', 'light'),
    },
    contours: { 'line-color': colorToken('stroke-strong', theme) },
  };
}

/** Recolour hillshade and contours for a theme. */
export function applyTerrainTheme(map: MapLibreMap, theme: Theme): void {
  const p = terrainPaint(theme);
  if (map.getLayer('hillshade')) for (const [k, v] of Object.entries(p.hillshade)) map.setPaintProperty('hillshade', k as Parameters<MapLibreMap['setPaintProperty']>[1], v);
  if (map.getLayer('contour-lines')) for (const [k, v] of Object.entries(p.contours)) map.setPaintProperty('contour-lines', k as Parameters<MapLibreMap['setPaintProperty']>[1], v);
  applyPlacesTheme(map, theme);
}

export function addTerrain(map: MapLibreMap, beforeLayerId?: string, theme: Theme = 'dark'): void {
  const paint = terrainPaint(theme);
  const dem = new mlcontour.DemSource({
    url: terrainSource.url,
    encoding: 'terrarium',
    maxzoom: TERRAIN_MAXZOOM,
    worker: true,
  });
  dem.setupMaplibre(maplibregl);

  map.addSource('terrain-dem', {
    type: 'raster-dem',
    tiles: [dem.sharedDemProtocolUrl],
    encoding: 'terrarium',
    tileSize: 512,
    maxzoom: TERRAIN_MAXZOOM,
    attribution: terrainSource.attribution,
  });
  // 3D terrain reads the same tiles through its own source: MapLibre keeps
  // terrain tiles apart from hillshade tiles and draws both better that way.
  // Nothing loads until 3D terrain is turned on (app/map/three-d.ts).
  map.addSource(TERRAIN_3D_SOURCE, {
    type: 'raster-dem',
    tiles: [dem.sharedDemProtocolUrl],
    encoding: 'terrarium',
    tileSize: 512,
    maxzoom: TERRAIN_MAXZOOM,
    attribution: terrainSource.attribution,
  });
  map.addLayer({
    id: 'hillshade',
    type: 'hillshade',
    source: 'terrain-dem',
    paint: {
      'hillshade-exaggeration': 0.4,
      ...paint.hillshade,
    },
  }, beforeLayerId);

  map.addSource('contours', {
    type: 'vector',
    tiles: [dem.contourProtocolUrl({ thresholds: { 10: [200, 1000], 12: [100, 500], 14: [50, 200], 15: [20, 100] } })],
    maxzoom: 15,
  });
  map.addLayer({
    id: 'contour-lines',
    type: 'line',
    source: 'contours',
    'source-layer': 'contours',
    paint: {
      ...paint.contours,
      'line-width': ['match', ['get', 'level'], 1, 1, 0.5],
    },
  }, beforeLayerId);

  // Trails, huts and peaks, above the contours.
  addPlaces(map, beforeLayerId, theme);
  // The sun's night wash goes under the hillshade, so under the weather fills too.
  mapSun.attach(map);
}
