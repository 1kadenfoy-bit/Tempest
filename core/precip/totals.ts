// Totals over a window by type, using the same per-step type as the map.
// Snow depth uses Open-Meteo's snowfall convention (7 cm of snow per 10 mm of
// water) until the snow ratio setting arrives (M5).
import { PRECIP_CUTOFF, snowShare, typeFromShare } from './type';

export const SNOW_CM_PER_MM = 0.7;

export interface PrecipTotals { rainMm: number; mixedMm: number; snowCm: number; snowMm: number; wetHours: number }

/**
 * `snowRatio(i)`: snow depth per water depth for step i (default 7:1, Open-Meteo's
 * own conversion); the layer passes the chosen ratio, Kuchera per hour.
 * `shareAt(i)`: the part that fell as snow (wet-bulb at the ground when the
 * profile is known; else the model's own split). A mixed hour is split into
 * its rain and its snow, so totals read only rain and snow (Kaden, Nov 16);
 * `mixedMm` keeps how much of it was mixed.
 */
export function precipTotals(times: readonly Date[], precip: readonly number[], swe: readonly number[], start: Date, end: Date, snowRatio: (i: number) => number = () => SNOW_CM_PER_MM * 10, shareAt?: (i: number) => number | null): PrecipTotals {
  const t: PrecipTotals = { rainMm: 0, mixedMm: 0, snowCm: 0, snowMm: 0, wetHours: 0 };
  times.forEach((time, i) => {
    // An amount belongs to the hour ending at its valid time.
    if (time <= start || time > end) return;
    const p = precip[i] ?? NaN;
    if (!(p > 0)) return;
    const share = shareAt?.(i) ?? snowShare(p, swe[i] ?? 0);
    const kind = typeFromShare(share);
    const snow = kind === 'snow' ? p : kind === 'rain' ? 0 : p * share;
    if (kind === 'mixed') t.mixedMm += p;
    t.rainMm += p - snow;
    t.snowMm += snow;
    t.snowCm += (snow * snowRatio(i)) / 10;
    if (p >= PRECIP_CUTOFF) t.wetHours++;
  });
  return t;
}
