// Precipitation type from the model's own split: the share of the step's
// precipitation that fell as snow (snowfall water equivalent / precipitation).
// Below 20% is rain, above 80% is snow, between is mixed. Pure maths.

export type PrecipType = 'rain' | 'mixed' | 'snow';

export const SNOW_SHARE_MIXED = 0.2;
export const SNOW_SHARE_SNOW = 0.8;
/** Below this liquid rate (mm/h) nothing is drawn or called precipitation. */
export const PRECIP_CUTOFF = 0.1;

export function snowShare(precipMm: number, sweMm: number): number {
  if (!(precipMm > 0)) return 0;
  return Math.min(1, Math.max(0, sweMm / precipMm));
}

export function precipType(precipMm: number, sweMm: number): PrecipType {
  const s = snowShare(precipMm, sweMm);
  return s >= SNOW_SHARE_SNOW ? 'snow' : s > SNOW_SHARE_MIXED ? 'mixed' : 'rain';
}
