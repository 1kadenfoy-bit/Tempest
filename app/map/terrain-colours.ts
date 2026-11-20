// Every ground type the base map can tell apart, and its colour (Maps section).
//
// The list is what the base map (OpenStreetMap through Protomaps) actually
// carries in its landuse layer, plus the three zones from the BC biogeoclimatic
// map (app/map/style.ts). Nothing here is assumed: a type with no data is not
// drawn. The hues are proposed and flat, for the cartoon look, until Kaden
// picks; the legend of them is in docs/wishes/maps.md.
import type { Theme } from '../theme/tokens';
import { mix } from './style-mix';

export type TerrainClass =
  | 'forest' | 'treeline' | 'meadow' | 'alpine' | 'ice' | 'wetland' | 'sand' | 'farmland'
  | 'residential' | 'commercial' | 'industrial' | 'institution' | 'hospital' | 'recreation' | 'cemetery' | 'transport' | 'military';

/** Plain name, dark-theme colour, and the base map's landuse kinds that use it. */
export const TERRAIN: Record<TerrainClass, { label: string; colour: string; kinds: string[] }> = {
  forest:      { label: 'Forest',                     colour: '#2E7D4A', kinds: ['wood', 'forest'] },
  treeline:    { label: 'Treeline, parkland, scrub',  colour: '#8FA84A', kinds: ['scrub'] },
  meadow:      { label: 'Grass and meadow',           colour: '#B2CC6E', kinds: ['grass', 'grassland', 'meadow'] },
  alpine:      { label: 'Alpine and bare rock',       colour: '#9A8F86', kinds: ['bare_rock', 'scree', 'shingle', 'rock'] },
  ice:         { label: 'Glacier and ice',            colour: '#9CD3E6', kinds: ['glacier'] },
  wetland:     { label: 'Wetland',                    colour: '#3E8F86', kinds: ['wetland'] },
  sand:        { label: 'Sand and beach',             colour: '#E0CA85', kinds: ['sand', 'beach'] },
  farmland:    { label: 'Farmland and allotments',    colour: '#C9B458', kinds: ['farmland', 'allotments', 'village_green', 'greenhouse_horticulture', 'plant_nursery', 'farmyard'] },
  residential: { label: 'Residential',                colour: '#B38E95', kinds: ['residential', 'kindergarten'] },
  commercial:  { label: 'Shops and commercial',       colour: '#D9915F', kinds: ['commercial', 'retail', 'marketplace'] },
  industrial:  { label: 'Industrial, quarry, landfill', colour: '#7F7E9E', kinds: ['industrial', 'quarry', 'landfill', 'construction', 'brownfield'] },
  institution: { label: 'Schools and campuses',       colour: '#C9A66B', kinds: ['school', 'university', 'college'] },
  hospital:    { label: 'Hospital',                   colour: '#D98C8C', kinds: ['hospital'] },
  recreation:  { label: 'Golf, sports, parks with play', colour: '#6FAE5A', kinds: ['golf_course', 'pitch', 'playground', 'dog_park', 'recreation_ground', 'garden', 'zoo'] },
  cemetery:    { label: 'Cemetery',                   colour: '#8FA58F', kinds: ['cemetery'] },
  transport:   { label: 'Rail, platforms, dams, piers', colour: '#8A8F96', kinds: ['pedestrian', 'platform', 'railway', 'pier', 'dam', 'aerodrome'] },
  military:    { label: 'Military',                   colour: '#8A7A5A', kinds: ['military', 'naval_base'] },
};

/** Kinds the base map has but which only say "this is a protected or named area", not what covers the ground: left clear. */
export const DESIGNATION_KINDS = ['park', 'national_park', 'nature_reserve', 'protected_area', 'other'];

/** Land the OpenStreetMap data describes, drawn under the BC zones (the zones win where they exist): wood, scrub, grass. */
export const UNDER_ZONES: TerrainClass[] = ['forest', 'treeline', 'meadow'];

/** A class's colour for a theme: the dark hue as is, a lighter version of it on light. */
export function terrainColour(c: TerrainClass, theme: Theme): string {
  return theme === 'dark' ? TERRAIN[c].colour : mix(TERRAIN[c].colour, '#FFFFFF', 0.35);
}

/** A MapLibre `match` on a feature's kind that gives each listed class its colour; other kinds are not matched. */
export function kindColourExpression(classes: TerrainClass[], theme: Theme): unknown[] {
  const expr: unknown[] = ['match', ['get', 'kind']];
  for (const c of classes) expr.push(TERRAIN[c].kinds, terrainColour(c, theme));
  expr.push('rgba(0, 0, 0, 0)');
  return expr;
}
