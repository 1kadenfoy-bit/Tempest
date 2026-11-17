// Hillshade and contours from Mapterhorn terrain tiles (Terrarium-encoded,
// 512 px WebP). Contours are drawn on the device with maplibre-contour, so they
// need no separate download.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { maplibregl } from './maplibre';
import mlcontour from 'maplibre-contour';
import { colorToken } from '../theme/tokens';

export { terrainSource } from './terrain-source';
import { terrainSource } from './terrain-source';

// Above zoom 12 terrain files grow tenfold for little gain over BC's 30 m data
// (docs/spikes/03-download-sizes.md), so the map overzooms from 12.
const TERRAIN_MAXZOOM = 12;

export function addTerrain(map: MapLibreMap, beforeLayerId?: string): void {
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
  map.addLayer({
    id: 'hillshade',
    type: 'hillshade',
    source: 'terrain-dem',
    paint: {
      'hillshade-exaggeration': 0.4,
      'hillshade-shadow-color': colorToken('water'),
      'hillshade-highlight-color': colorToken('fill-control'),
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
      'line-color': colorToken('stroke'),
      'line-width': ['match', ['get', 'level'], 1, 1, 0.5],
    },
  }, beforeLayerId);
}
