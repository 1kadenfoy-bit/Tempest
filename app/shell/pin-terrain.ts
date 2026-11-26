// What the ground at a point is, in one plain word, for the pin when there is no
// place name to give: "Alpine", "Glacier", "Forest". It asks the map which of its
// ground-colour layers (app/map/layer-ids.ts) is drawn at that spot, so it says
// what the map shows. Nothing is drawn where the map has no ground type (water,
// outside the BC zones with no OpenStreetMap cover): then it says nothing.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { L } from '../map/layer-ids';
import { TERRAIN, type TerrainClass } from '../map/terrain-colours';

/** The word the pin shows for each ground type. */
export const TERRAIN_WORD: Record<TerrainClass, string> = {
  forest: 'Forest', treeline: 'Treeline', grass: 'Grassland', alpine: 'Alpine', ice: 'Glacier', wetland: 'Wetland', sand: 'Beach', urban: 'Urban',
};

const BEC_CLASS: Record<string, TerrainClass> = { forest: 'forest', treeline: 'treeline', alpine: 'alpine' };

/** The class a drawn feature stands for, or null. */
function classOf(layerId: string, props: Record<string, unknown>): TerrainClass | null {
  if (layerId === 'glaciers-fill') return 'ice';
  if (layerId.startsWith('zone_')) return BEC_CLASS[String(props.z)] ?? null;
  const kind = String(props.kind ?? '');
  for (const c of Object.keys(TERRAIN) as TerrainClass[]) if (TERRAIN[c].kinds.includes(kind)) return c;
  return null;
}

/** From the top of the drawing order down: what is on top is what you see. */
const ORDER = ['glaciers-fill', 'terrain_urban', 'terrain_over', 'zone_alpine', 'zone_parkland', 'zone_forest', 'terrain_under'];

export function terrainAt(map: MapLibreMap, lng: number, lat: number): string | null {
  const layers = ORDER.filter((id) => map.getLayer(id));
  if (!layers.length) return null;
  const pt = map.project([lng, lat]);
  const found = map.queryRenderedFeatures([pt.x, pt.y], { layers });
  for (const id of ORDER) {
    const f = found.find((x) => x.layer.id === id);
    const c = f ? classOf(id, f.properties as Record<string, unknown>) : null;
    if (c) return TERRAIN_WORD[c];
  }
  return null;
}

// Keep the layer-id list honest: the ones used above are the map's own ground layers.
export const GROUND_LAYERS_USED: readonly string[] = ORDER.filter((id) => (L.groundColour as readonly string[]).includes(id));
