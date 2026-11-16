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

/**
 * Snow share from the wet-bulb temperature at the ground (°C): all snow at
 * 0 °C or below, all rain from 1 °C, mixed between. The snow line (wet-bulb
 * 0.5 °C) sits in the middle of the mixed band, so the map's line and its
 * colours agree (Kaden, Nov 16).
 */
export function shareFromWetBulb(tw: number): number {
  return Math.min(1, Math.max(0, 1 - tw));
}

export function typeFromShare(share: number): PrecipType {
  return share >= SNOW_SHARE_SNOW ? 'snow' : share > SNOW_SHARE_MIXED ? 'mixed' : 'rain';
}
