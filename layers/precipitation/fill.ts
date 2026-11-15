// Precipitation map fill: liquid rate in mm/h, one fill per type (rain, mixed,
// snow), each coloured on the device from its token ramp. Nothing under the
// 0.1 mm/h cutoff; saturates at 6 mm/h.
import tokens from '../../design/tokens.json';
import { lookupStrip, type Ramp } from '../../core/color/ramp';
import type { PrecipType } from '../../core/precip/type';

const p = tokens.data.precipitation;
export const PRECIP_TYPES: PrecipType[] = ['rain', 'mixed', 'snow'];

export function precipRamp(type: PrecipType): Ramp {
  return { valueStops: p.valueStops as [number, number][], colors: p[type].dark, cutoff: p.cutoff };
}

export function precipitationStrip(type: PrecipType = 'rain') {
  return { min: 0, max: p.saturatesAt, unit: 'mm/h', colors: lookupStrip(precipRamp(type), 0, p.saturatesAt, 512) };
}

/** Variable names the renderer computes for each type (render/openmeteo-starter/precip-type-rules.ts). */
export const TYPED_VARIABLE: Record<PrecipType, string> = {
  rain: 'tempest_precip_rain',
  mixed: 'tempest_precip_mixed',
  snow: 'tempest_precip_snow',
};

export function precipFills(fileUrl: string, stepHours: number) {
  return PRECIP_TYPES.map((t) => ({
    id: `precip-${t}`,
    fileUrl,
    variable: TYPED_VARIABLE[t],
    stepHours,
    strip: precipitationStrip(t),
  }));
}
