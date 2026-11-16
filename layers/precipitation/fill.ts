// Precipitation map fill: liquid rate in mm/h coloured on the device by the
// app's renderer, blending the rain, mixed and snow ramps by snow share.
// Nothing under the 0.1 mm/h cutoff; saturates at 6 mm/h.
import tokens from '../../design/tokens.json';
import { lookupStrip, type Ramp } from '../../core/color/ramp';
import { SNOW_SHARE_MIXED, SNOW_SHARE_SNOW, type PrecipType } from '../../core/precip/type';
import type { GridField } from '../../core/vocabulary';

const p = tokens.data.precipitation;
export const PRECIP_TYPES: PrecipType[] = ['rain', 'mixed', 'snow'];

export function precipRamp(type: PrecipType): Ramp {
  return { valueStops: p.valueStops as [number, number][], colors: p[type].dark, cutoff: p.cutoff };
}

/** Light amounts let the map show through: 40% at the cutoff, rising to full at 2 mm/h. */
export const PRECIP_ALPHA = { from: 0.4, full: 0.55 };
/** Overall strength of the fill, so terrain shading reads through at any rate. */
export const PRECIP_OPACITY = 0.7;


/**
 * Strips and rules for the typed-rate renderer: rain, mixed, snow by snow
 * share. `shown` (the Type shown setting) clears the other kinds' strips;
 * mixed shows only with All.
 */
export function precipRenderStyle(shown: 'all' | 'rain' | 'snow' = 'all') {
  const strip = (t: PrecipType) => {
    const row = lookupStrip(precipRamp(t), 0, p.saturatesAt, 512, PRECIP_ALPHA);
    return shown === 'all' || shown === t ? row : row.map(([r, g, b]) => [r, g, b, 0] as typeof row[number]);
  };
  return {
    strips: [strip('rain'), strip('mixed'), strip('snow')] as [ReturnType<typeof strip>, ReturnType<typeof strip>, ReturnType<typeof strip>],
    max: p.saturatesAt,
    mixedFrom: SNOW_SHARE_MIXED,
    secondFrom: SNOW_SHARE_SNOW,
    opacity: PRECIP_OPACITY,
  };
}

/** Two numbers per cell for the GPU: precipitation rate and its snow part (mm/h). */
export function precipDrawField(f: GridField, gridKey: string) {
  const precip = f.values.precipitation;
  const swe = f.values.snowfall_water_equivalent;
  const data = new Float32Array(f.nx * f.ny * 2);
  if (precip) {
    for (let i = 0; i < f.nx * f.ny; i++) {
      data[i * 2] = Math.max(0, precip[i]!) / f.stepHours;
      data[i * 2 + 1] = Math.max(0, swe?.[i] ?? 0) / f.stepHours;
    }
  }
  return { gridKey, bbox: f.bbox, nx: f.nx, ny: f.ny, data };
}
