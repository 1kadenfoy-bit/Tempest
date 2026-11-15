// Totals over a window by type, using the same per-step type as the map.
// Snow depth uses Open-Meteo's snowfall convention (7 cm of snow per 10 mm of
// water) until the snow ratio setting arrives (M5).
import { PRECIP_CUTOFF, precipType } from './type';

export const SNOW_CM_PER_MM = 0.7;

export interface PrecipTotals { rainMm: number; mixedMm: number; snowCm: number; snowMm: number; wetHours: number }

export function precipTotals(times: readonly Date[], precip: readonly number[], swe: readonly number[], start: Date, end: Date): PrecipTotals {
  const t: PrecipTotals = { rainMm: 0, mixedMm: 0, snowCm: 0, snowMm: 0, wetHours: 0 };
  times.forEach((time, i) => {
    // An amount belongs to the hour ending at its valid time.
    if (time <= start || time > end) return;
    const p = precip[i] ?? NaN;
    if (!(p > 0)) return;
    const kind = precipType(p, swe[i] ?? 0);
    if (kind === 'rain') t.rainMm += p;
    else if (kind === 'mixed') t.mixedMm += p;
    else { t.snowMm += p; t.snowCm += p * SNOW_CM_PER_MM; }
    if (p >= PRECIP_CUTOFF) t.wetHours++;
  });
  return t;
}
