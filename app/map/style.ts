// The Tempest topo style, dark (default) or light. Built on the Protomaps
// layer set, with every colour derived from design/tokens.json: the map ground
// and water tokens, and the ink token mixed in at low strength for land cover,
// roads and labels. Colour is for data, so the base map stays neutral and quiet.
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification, VectorSourceSpecification } from 'maplibre-gl';
import { colorToken, type Theme } from '../theme/tokens';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mix two hex tokens: t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

/**
 * How far the map's ground is lifted toward the ink so land reads on a phone
 * outdoors. Dark was hard to see; this lifts it without touching the token.
 */
const GROUND_LIFT: Record<Theme, number> = { dark: 0.2, light: 0 };

/** The map's ground: the token, lifted a little toward the ink. */
export function mapGround(theme: Theme): string {
  return mix(colorToken('map-ground', theme), colorToken('ink', theme), GROUND_LIFT[theme]);
}

/**
 * Terrain tints: what the ground is covered with, as a colour mixed into the
 * ground. Muted so the weather on top still leads. These hues are proposed,
 * pending Kaden's pick (they are not in design/tokens.json yet).
 * Names are the base map's (OpenStreetMap) land types.
 */
export const TERRAIN_TINTS: Record<'forest' | 'treeline' | 'meadow' | 'rock' | 'ice' | 'wetland', { dark: string; light: string }> = {
  forest:   { dark: '#2E7D4A', light: '#5FA876' },
  treeline: { dark: '#8FA84A', light: '#B7C971' },
  meadow:   { dark: '#8FA84A', light: '#B7C971' },
  rock:     { dark: '#9A8F86', light: '#C9BFB4' },
  ice:      { dark: '#9CD3E6', light: '#DDF0F7' },
  wetland:  { dark: '#3E8F86', light: '#7FBDB4' },
};
/** How strongly each tint shows over the ground: high, so the three zones read as flat blocks. */
const TINT_STRENGTH = 0.8;
const tint = (k: keyof typeof TERRAIN_TINTS, theme: Theme, ground: string) => mix(ground, TERRAIN_TINTS[k][theme], TINT_STRENGTH);

const CLEAR = 'rgba(0, 0, 0, 0)';

export function topoFlavor(theme: Theme = 'dark'): Flavor {
  const ground = mapGround(theme);
  const water = colorToken('water', theme);
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
    water,
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
      grassland: g(0.03), barren: tint('rock', theme, ground), urban_area: g(0.03), farmland: g(0.02),
      glacier: tint('ice', theme, ground), scrub: g(0.03), forest: g(0.03),
    },
  } as Flavor;
}

const spriteUrl = (theme: Theme) => `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`;

/**
 * The base layers: the Protomaps set, plus bare rock and wetland, which the set
 * leaves undrawn. Rock sits right after the parks and woods so roads and
 * labels stay on top.
 */
function baseLayers(theme: Theme): LayerSpecification[] {
  const all = layers('protomaps', topoFlavor(theme), { lang: 'en' }) as LayerSpecification[];
  const ground = mapGround(theme);
  const extra = (id: string, kinds: string[], colour: string): LayerSpecification => ({
    id, type: 'fill', source: 'protomaps', 'source-layer': 'landuse',
    filter: ['in', ['get', 'kind'], ['literal', kinds]],
    paint: { 'fill-color': colour, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 9, 1] },
  } as LayerSpecification);
  const zone = (id: string, cls: string, colour: string): LayerSpecification => ({
    id, type: 'fill', source: ZONES_SOURCE, filter: ['==', ['get', 'z'], cls], paint: { 'fill-color': colour, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 12, 1] },
  } as LayerSpecification);
  all.splice(all.findIndex((l) => l.id === 'earth') + 1, 0,
    zone('zone_forest', 'forest', tint('forest', theme, ground)),
    zone('zone_parkland', 'parkland', tint('treeline', theme, ground)),
    zone('zone_alpine', 'alpine', tint('rock', theme, ground)));
  const at = all.findIndex((l) => l.id === 'landuse_park') + 1;
  // Peaks are drawn from places.json (app/map/places.ts), from zoom 10 with their heights.
  const pois = all.find((l) => l.id === 'pois');
  if (pois && 'filter' in pois && Array.isArray(pois.filter)) pois.filter = [...(pois.filter as unknown[]), ['!=', ['get', 'kind'], 'peak']] as never;
  all.splice(at, 0,
    extra('landuse_wetland', ['wetland'], tint('wetland', theme, ground)),
    extra('landuse_rock', ['bare_rock', 'scree', 'rock'], tint('rock', theme, ground)));
  return all;
}

const ZONES_SOURCE = 'terrain-zones';
/** The BC zones file ships with the app (tools/build-zones.mjs writes it). */
const zonesUrl = () => new URL('zones/terrain-zones.json', typeof document === 'undefined' ? 'http://localhost/' : document.baseURI).href;

export function topoStyle(source: VectorSourceSpecification, theme: Theme = 'dark'): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: spriteUrl(theme),
    sources: { protomaps: source, [ZONES_SOURCE]: { type: 'geojson', data: zonesUrl(), attribution: 'BC zones © Province of BC (OGL-BC)' } },
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
