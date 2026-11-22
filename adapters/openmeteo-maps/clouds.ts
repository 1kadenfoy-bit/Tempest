// Which cloud fields each model offers, and from where. Checked Nov 22, 2026
// against the point API (hourly, 3 hours at Cypress) and the map files (one
// step of each model's latest run, read through the app's own file reader):
//
// - Point API: cloud_cover, cloud_cover_low, cloud_cover_mid and
//   cloud_cover_high for HRDPS, RDPS, GDPS and ECMWF IFS, all in %.
// - Map files: cloud_cover (the total) for all four models. Low, mid and high
//   cover are in the ECMWF IFS map files only; the Canadian models' map files
//   have no such variable ("Variable: cloud_cover_low not found").
// - Cloud base and cloud top: none of the four models returns them (the point
//   API answers null for cloud_base and cloud_top), and no pressure-level cloud
//   cover is in the map files. Cloud height therefore comes from the three
//   layers; the heights of their edges are Open-Meteo's definition (about 2 km
//   and 6 km) and still to be confirmed against its documentation, which this
//   machine could not reach.
import type { VariableName } from '../../core/vocabulary';
import type { ModelId } from './models';

export const CLOUD_TOTAL: VariableName = 'cloud_cover';
export const CLOUD_LAYERS: readonly VariableName[] = ['cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high'];
export const CLOUD_VARIABLES: readonly VariableName[] = [CLOUD_TOTAL, ...CLOUD_LAYERS];

export interface CloudSupport {
  /** Variables the point API returns for the pin. */
  pin: readonly VariableName[];
  /** Variables the map files hold, so a whole map view can be read from them. */
  grid: readonly VariableName[];
}

export const CLOUD_SUPPORT: Record<ModelId, CloudSupport> = {
  hrdps: { pin: CLOUD_VARIABLES, grid: [CLOUD_TOTAL] },
  rdps: { pin: CLOUD_VARIABLES, grid: [CLOUD_TOTAL] },
  gdps: { pin: CLOUD_VARIABLES, grid: [CLOUD_TOTAL] },
  ecmwf: { pin: CLOUD_VARIABLES, grid: CLOUD_VARIABLES },
};

/** What the map can be asked for from this model's files, in the order it prefers. */
export function cloudGridVariables(model: ModelId): readonly VariableName[] {
  return CLOUD_SUPPORT[model].grid;
}

/** Whether low, mid and high cloud can be read over a whole map view from this model's files. */
export function hasCloudLayersOnGrid(model: ModelId): boolean {
  return CLOUD_LAYERS.every((v) => CLOUD_SUPPORT[model].grid.includes(v));
}
