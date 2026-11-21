// Every ground type the base map can tell apart, and its colour (Maps section).
//
// The list is what the base map (OpenStreetMap through Protomaps) actually
// carries in its landuse layer, plus the three zones from the BC biogeoclimatic
// map (app/map/style.ts). Nothing here is assumed: a type with no data is not
// drawn. The hues are proposed and flat, for the cartoon look, until Kaden
// picks; the legend of them is in docs/wishes/maps.md.
import type { Theme } from '../theme/tokens';
import { mix } from './style-mix';

export type TerrainClass = 'forest' | 'treeline' | 'grass' | 'alpine' | 'ice' | 'wetland' | 'sand' | 'urban';

/**
 * Plain name, dark-theme colour, the base map's landuse kinds that use it, and
 * whether nature made it. Kept short on purpose: only types that matter for
 * outdoor conditions get a colour of their own, and everything built by people
 * is "urban". Farmland, golf courses and sports fields count as grassy fields.
 */
export const TERRAIN: Record<TerrainClass, { label: string; colour: string; kinds: string[]; natural: boolean }> = {
  forest:   { label: 'Forest',                    colour: '#2E7D4A', kinds: ['wood', 'forest'], natural: true },
  treeline: { label: 'Treeline, parkland, scrub', colour: '#8FA84A', kinds: ['scrub'], natural: true },
  grass:    { label: 'Grass and fields',          colour: '#B2CC6E', kinds: ['grass', 'grassland', 'meadow', 'farmland', 'allotments', 'village_green', 'greenhouse_horticulture', 'plant_nursery', 'farmyard', 'golf_course', 'pitch', 'playground', 'dog_park', 'recreation_ground', 'garden', 'cemetery'], natural: true },
  alpine:   { label: 'Alpine and bare rock',      colour: '#9A8F86', kinds: ['bare_rock', 'scree', 'shingle', 'rock'], natural: true },
  // Glaciers come from the BC government's outlines (app/map/glaciers.ts), not from OpenStreetMap.
  ice:      { label: 'Glacier and ice',           colour: '#9CD3E6', kinds: [], natural: true },
  wetland:  { label: 'Wetland',                   colour: '#3E8F86', kinds: ['wetland'], natural: true },
  sand:     { label: 'Sand and beach',            colour: '#E0CA85', kinds: ['sand', 'beach'], natural: true },
  urban:    { label: 'Urban',                     colour: '#B38E95', kinds: ['residential', 'kindergarten', 'commercial', 'retail', 'marketplace', 'industrial', 'quarry', 'landfill', 'construction', 'brownfield', 'school', 'university', 'college', 'hospital', 'pedestrian', 'platform', 'railway', 'pier', 'dam', 'aerodrome', 'military', 'naval_base', 'zoo'], natural: false },
};

/** Kinds the base map has but which only say "this is a protected or named area", not what covers the ground: left clear. */
export const DESIGNATION_KINDS = ['park', 'national_park', 'nature_reserve', 'protected_area', 'other'];

/** Woods and scrub from OpenStreetMap, drawn under the BC zones: the zones win where they exist. */
export const UNDER_ZONES: TerrainClass[] = ['forest', 'treeline'];

/** Types made by nature: their edges are softened into each other. Urban stays crisp. */
export const NATURAL: TerrainClass[] = (Object.keys(TERRAIN) as TerrainClass[]).filter((c) => TERRAIN[c].natural);

/** A class's colour for a theme: the dark hue as is, a lighter version of it on light. */
export function terrainColour(c: TerrainClass, theme: Theme): string {
  return theme === 'dark' ? TERRAIN[c].colour : mix(TERRAIN[c].colour, '#FFFFFF', 0.35);
}

/** A MapLibre `match` on a feature's kind that gives each listed class its colour; other kinds are not matched. */
export function kindColourExpression(classes: TerrainClass[], theme: Theme): unknown[] {
  const expr: unknown[] = ['match', ['get', 'kind']];
  for (const c of classes) if (TERRAIN[c].kinds.length) expr.push(TERRAIN[c].kinds, terrainColour(c, theme));
  expr.push('rgba(0, 0, 0, 0)');
  return expr;
}
