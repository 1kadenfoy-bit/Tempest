// Grid fields for the map: one step's variables over a box, resampled to a
// regular latitude/longitude grid at the seam.
import type { GridRequest } from '../../core/geo/grid-request';
import type { GridField, VariableName } from '../../core/vocabulary';
import { readRegularGrid } from '../../render/openmeteo-starter';
import { MODELS } from './point-series';
import { source, stepFileUrl, type RunMetadata } from './run-metadata';

export async function fetchGridField(run: RunMetadata, validTime: Date, variables: VariableName[], req: GridRequest): Promise<GridField> {
  const values = await readRegularGrid(run.model, stepFileUrl(run.model, run.referenceTime, validTime), variables, req.bbox, req.nx, req.ny, 1);
  return {
    label: {
      source: source.id, model: run.model, run: run.referenceTime, gridKm: MODELS[run.model]?.gridKm ?? NaN,
      licence: source.licence, attribution: source.attribution, fetchedAt: new Date(), offline: source.offline,
    },
    validTime,
    stepHours: 1,
    bbox: req.bbox,
    nx: req.nx,
    ny: req.ny,
    values: values as GridField['values'],
  };
}
