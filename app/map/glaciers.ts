// Glaciers from the BC government's Freshwater Atlas outlines (tools/build-glaciers.mjs
// writes public/zones/glaciers.json), simplified and rounded, drawn with a clean edge
// (a soft edge made spikes at the sharp turns of narrow ice tongues). They replace the
// OpenStreetMap glaciers, which are patchy and angular. The file is large, so it is
// fetched once the map has settled, not while the first picture is drawn.
//
// The outlines come from the province's base mapping and may be older than the ice
// today; the credits say so.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/tokens';
import { mapGround, mix, ZONES_MAXZOOM } from './style';
import { terrainColour } from './terrain-colours';
import { applyMapSettings } from './map-settings';

const SOURCE = 'bc-glaciers';

const colour = (theme: Theme) => mix(mapGround(theme), terrainColour('ice', theme), 0.85);
const url = () => new URL('zones/glaciers.json', document.baseURI).href;

/** Adds the glaciers under the built-up land, once the map is idle. */
export function addGlaciers(map: MapLibreMap, theme: Theme): void {
  const add = () => {
    if (map.getSource(SOURCE)) return;
    // Under the urban layer (so a town beside ice stays crisp) and above the other natural types.
    const before = map.getLayer('terrain_urban') ? 'terrain_urban' : undefined;
    map.addSource(SOURCE, { type: 'geojson', data: url(), maxzoom: ZONES_MAXZOOM });
    map.addLayer({ id: 'glaciers-fill', type: 'fill', source: SOURCE, paint: { 'fill-color': colour(theme), 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.9, 8, 1] } }, before);
    applyMapSettings(map);
  };
  if (map.loaded()) add(); else map.once('idle', add);
}

/** Recolour the glaciers for a theme. */
export function applyGlaciersTheme(map: MapLibreMap, theme: Theme): void {
  if (map.getLayer('glaciers-fill')) map.setPaintProperty('glaciers-fill', 'fill-color', colour(theme));
}
