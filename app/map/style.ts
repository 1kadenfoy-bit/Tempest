// The Tempest topo style, dark (default) or light. Built on the Protomaps
// layer set, with every colour derived from design/tokens.json: the map ground
// and water tokens, and the ink token mixed in at low strength for land cover,
// roads and labels. Colour is for data, so the base map stays neutral and quiet.
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { Map as MapLibreMap, StyleSpecification, VectorSourceSpecification } from 'maplibre-gl';
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

export function topoFlavor(theme: Theme = 'dark'): Flavor {
  const ground = colorToken('map-ground', theme);
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
    earth: ground,
    water,
    ...neutral(['park_a', 'park_b', 'wood_a', 'wood_b', 'scrub_a', 'scrub_b', 'zoo', 'military', 'hospital', 'school', 'industrial', 'pedestrian', 'aerodrome', 'sand', 'beach'], 0.025),
    glacier: g(0.1),
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
      grassland: g(0.02), barren: g(0.04), urban_area: g(0.03), farmland: g(0.02),
      glacier: g(0.1), scrub: g(0.025), forest: g(0.03),
    },
  } as Flavor;
}

const spriteUrl = (theme: Theme) => `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`;

export function topoStyle(source: VectorSourceSpecification, theme: Theme = 'dark'): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: spriteUrl(theme),
    sources: { protomaps: source },
    layers: layers('protomaps', topoFlavor(theme), { lang: 'en' }),
  };
}

/**
 * Recolour the base map in place for a theme. The weather layers and lines
 * added on top stay (a new style would drop them): only the base layers'
 * colours and the icon sprite change; the layer set is the same for both.
 */
export function applyBaseTheme(map: MapLibreMap, theme: Theme): void {
  for (const layer of layers('protomaps', topoFlavor(theme), { lang: 'en' })) {
    if (!map.getLayer(layer.id) || !('paint' in layer) || !layer.paint) continue;
    for (const [prop, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, prop as Parameters<MapLibreMap['setPaintProperty']>[1], value);
  }
  map.setSprite(spriteUrl(theme));
}
