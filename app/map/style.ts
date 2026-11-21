// The Tempest topo style, dark (default) or light. Built on the Protomaps
// layer set, with every colour derived from design/tokens.json: the map ground
// and water tokens, and the ink token mixed in at low strength for land cover,
// roads and labels. Colour is for data, so the base map stays neutral and quiet.
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification, VectorSourceSpecification } from 'maplibre-gl';
import { colorToken, type Theme } from '../theme/tokens';

import { mix } from './style-mix';
import { NATURAL, TERRAIN, UNDER_ZONES, kindColourExpression, terrainColour, type TerrainClass } from './terrain-colours';
export { mix };

/**
 * How far the map's ground is lifted toward the ink so land reads on a phone
 * outdoors. Dark was hard to see; this lifts it without touching the token.
 */
const GROUND_LIFT: Record<Theme, number> = { dark: 0.2, light: 0 };

/** The map's ground: the token, lifted a little toward the ink. */
export function mapGround(theme: Theme): string {
  return mix(colorToken('map-ground', theme), colorToken('ink', theme), GROUND_LIFT[theme]);
}

/** Lakes, rivers and the sea: a clear blue, not the near-black water token (that one stays under labels as their halo). A proposal for Kaden to change. */
const WATER: Record<Theme, string> = { dark: '#2B6CA3', light: '#9CC6E3' };
export const mapWater = (theme: Theme) => WATER[theme];

/** How strongly a terrain colour shows over the ground: high, so the types read as flat cartoon blocks. */
const TINT_STRENGTH = 0.85;
const tint = (c: TerrainClass, theme: Theme, ground: string) => mix(ground, terrainColour(c, theme), TINT_STRENGTH);

const CLEAR = 'rgba(0, 0, 0, 0)';

export function topoFlavor(theme: Theme = 'dark'): Flavor {
  const ground = mapGround(theme);
  const water = colorToken('water', theme); // label halos
  const lake = mapWater(theme);
  const ink = colorToken('ink', theme);
  const ink2 = colorToken('ink-2', theme);
  const g = (t: number) => mix(ground, ink, t);
  const base = namedFlavor(theme);
  // Label halos: the dark water colour under light text; the light ground under dark text.
  const halo = theme === 'dark' ? water : ground;
  const neutral = (keys: string[], t: number) => Object.fromEntries(keys.map((k) => [k, g(t)]));
  const roadKeys = Object.keys(base).filter((k) => /^(minor|link|major|highway|other|bridges|tunnel)/.test(k) && !/casing/.test(k));
  const casingKeys = Object.keys(base).filter((k) => /casing/.test(k));
  return {
    ...base,
    background: ground,
    // No ground cover is assumed: land the data does not describe stays plain ground.
    earth: ground,
    water: lake,
    ...neutral(['zoo', 'military', 'hospital', 'school', 'industrial', 'pedestrian', 'aerodrome', 'sand', 'beach'], 0.025),
    // Parks, woods and scrub tags say nothing the BC zones layer does not: see-through, so the zones show.
    park_a: CLEAR, park_b: CLEAR,
    // Forest and treeline come from the BC zones layer below, not from these OpenStreetMap tags.
    wood_a: CLEAR, wood_b: CLEAR, scrub_a: CLEAR, scrub_b: CLEAR,
    glacier: tint('ice', theme, ground),
    runway: g(0.12),
    pier: g(0.12),
    buildings: theme === 'dark' ? mix(ground, '#000000', 0.25) : g(0.1),
    ...neutral(roadKeys, 0.16),
    highway: g(0.24),
    bridges_highway: g(0.24),
    major: g(0.2),
    bridges_major: g(0.2),
    ...Object.fromEntries(casingKeys.map((k) => [k, ground])),
    railway: g(0.18),
    boundaries: g(0.3),
    roads_label_minor: ink2,
    roads_label_minor_halo: halo,
    roads_label_major: ink2,
    roads_label_major_halo: halo,
    ocean_label: ink2,
    subplace_label: ink2,
    subplace_label_halo: halo,
    city_label: ink,
    city_label_halo: halo,
    state_label: ink2,
    state_label_halo: halo,
    country_label: ink2,
    address_label: ink2,
    address_label_halo: halo,
    pois: Object.fromEntries(Object.keys(base.pois ?? {}).map((k) => [k, ink2])) as unknown as Flavor['pois'],
    landcover: {
      grassland: tint('grass', theme, ground), barren: tint('alpine', theme, ground), urban_area: tint('urban', theme, ground), farmland: tint('grass', theme, ground),
      glacier: tint('ice', theme, ground), scrub: tint('treeline', theme, ground), forest: tint('forest', theme, ground),
    },
  } as Flavor;
}

const spriteUrl = (theme: Theme) => `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`;

/** Protomaps landuse layers replaced by the one terrain colour table (app/map/terrain-colours.ts). */
const REPLACED = ['landuse_park', 'landuse_urban_green', 'landuse_hospital', 'landuse_industrial', 'landuse_school', 'landuse_beach', 'landuse_zoo', 'landuse_aerodrome', 'landuse_pedestrian'];

/**
 * The base layers: the Protomaps set with its ground-cover polygons swapped for
 * one table of every land type and its colour. Order, bottom to top: ground,
 * OpenStreetMap woods and grass, the BC zones (they win where they exist),
 * everything else the data tags (rock, ice, wetland, sand, farmland and the
 * built-up types), then cliffs. Roads and labels stay above.
 */
function baseLayers(theme: Theme): LayerSpecification[] {
  const all = (layers('protomaps', topoFlavor(theme), { lang: 'en' }) as LayerSpecification[]).filter((l) => !REPLACED.includes(l.id));
  const ground = mapGround(theme);
  const opacity = ['interpolate', ['linear'], ['zoom'], 6, 0, 9, 1] as never;
  const fill = (id: string, classes: TerrainClass[]): LayerSpecification => ({
    id, type: 'fill', source: 'protomaps', 'source-layer': 'landuse',
    filter: ['in', ['get', 'kind'], ['literal', classes.flatMap((c) => TERRAIN[c].kinds)]],
    paint: { 'fill-color': kindColourExpression(classes, theme) as never, 'fill-opacity': opacity },
  } as LayerSpecification);
  const zone = (id: string, cls: string, c: TerrainClass): LayerSpecification => ({
    id, type: 'fill', source: ZONES_SOURCE, 'source-layer': 'zones', filter: ['==', ['get', 'z'], cls], paint: { 'fill-color': tint(c, theme, ground), 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 12, 1] },
  } as LayerSpecification);
  const overNatural = NATURAL.filter((c) => !UNDER_ZONES.includes(c));
  const cliffs = {
    id: 'terrain_cliffs', type: 'line', source: 'protomaps', 'source-layer': 'earth', minzoom: 11,
    filter: ['==', ['get', 'kind'], 'cliff'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': mix(terrainColour('alpine', theme), '#000000', 0.45), 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 2.5] },
  } as LayerSpecification;
  // Natural edges are feathered: a wide, blurred line in the type's own colour along its border bleeds into the neighbour.
  const feather = (id: string, source: string, sourceLayer: string | null, filter: unknown, colour: unknown): LayerSpecification => ({
    // Only from zoom 10: further out the edges are tiny, and the blurred lines were the costliest thing the map drew (about 50 ms a frame at zoom 9.5 in a software test).
    id, type: 'line', source, minzoom: FEATHER_MINZOOM, ...(sourceLayer ? { 'source-layer': sourceLayer } : {}), filter,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': colour, 'line-width': FEATHER, 'line-blur': FEATHER, 'line-opacity': 0.55 },
  } as LayerSpecification);
  const zoneFeather = (id: string, cls: string, c: TerrainClass) => feather(id, ZONES_SOURCE, 'zones', ['==', ['get', 'z'], cls], tint(c, theme, ground));
  const after = all.findIndex((l) => l.id === 'landcover') + 1;
  all.splice(after, 0,
    fill('terrain_under', UNDER_ZONES),
    zone('zone_forest', 'forest', 'forest'),
    zone('zone_parkland', 'parkland', 'treeline'),
    zone('zone_alpine', 'alpine', 'alpine'),
    zoneFeather('feather_zone_forest', 'forest', 'forest'),
    zoneFeather('feather_zone_parkland', 'parkland', 'treeline'),
    zoneFeather('feather_zone_alpine', 'alpine', 'alpine'),
    fill('terrain_over', overNatural),
    feather('feather_osm', 'protomaps', 'landuse', ['in', ['get', 'kind'], ['literal', overNatural.flatMap((c) => TERRAIN[c].kinds)]], kindColourExpression(overNatural, theme)),
    // Glaciers: the BC government's outlines (tile layer 'glaciers'), a clean rounded edge, under the built-up land.
    { id: 'glaciers-fill', type: 'fill', source: ZONES_SOURCE, 'source-layer': 'glaciers', paint: { 'fill-color': tint('ice', theme, ground), 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.9, 8, 1] } } as LayerSpecification,
    fill('terrain_urban', ['urban']),
    cliffs);
  // Trails are named from zoom 14, where the base map has their names (it showed them from 15).
  const trailLabels = all.find((l) => l.id === 'roads_labels_minor');
  if (trailLabels) trailLabels.minzoom = 14;
  // Peaks are drawn by app/map/places.ts, with their heights.
  const pois = all.find((l) => l.id === 'pois');
  if (pois && 'filter' in pois && Array.isArray(pois.filter)) pois.filter = [...(pois.filter as unknown[]), ['!=', ['get', 'kind'], 'peak']] as never;
  return all;
}

const ZONES_SOURCE = 'terrain-tiles';
/**
 * The zones and glaciers are cut into map tiles up to this zoom and enlarged
 * beyond it. Their shapes are simplified to 120-300 m, so deeper pieces add
 * no detail, only memory (each piece is kept).
 */
export const ZONES_MAXZOOM = 11;
/** How wide, in pixels, the soft edge between natural types is (a blurred line centred on the border). */
const FEATHER = 30;
const FEATHER_MINZOOM = 10;
/** The terrain tiles (zones and glaciers), read by app/map/terrain-tiles.ts. */
const TERRAIN_TILES = 'terrain://{z}/{x}/{y}';

export function topoStyle(source: VectorSourceSpecification, theme: Theme = 'dark'): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: spriteUrl(theme),
    sources: { protomaps: source, [ZONES_SOURCE]: { type: 'vector', tiles: [TERRAIN_TILES], minzoom: 0, maxzoom: ZONES_MAXZOOM, attribution: 'BC zones and glaciers © Province of BC (OGL-BC)' } },
    layers: baseLayers(theme),
  };
}

/**
 * Recolour the base map in place for a theme. The weather layers and lines
 * added on top stay (a new style would drop them): only the base layers'
 * colours and the icon sprite change; the layer set is the same for both.
 */
export function applyBaseTheme(map: MapLibreMap, theme: Theme): void {
  for (const layer of baseLayers(theme)) {
    if (!map.getLayer(layer.id) || !('paint' in layer) || !layer.paint) continue;
    for (const [prop, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, prop as Parameters<MapLibreMap['setPaintProperty']>[1], value);
  }
  map.setSprite(spriteUrl(theme));
}
