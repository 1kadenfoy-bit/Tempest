// Totals by elevation band (v8 15-PrecipUp, TOTALS BY ELEVATION). The amount
// is the pin's model cell; whether it fell as rain or snow at a band's height
// comes from the wet-bulb temperature there (snow at 0.5 °C or below), from
// the same hour's profile (the same rule as the map's colours). Snow depth uses
// the chosen snow ratio.
import type { PointSeries } from '../vocabulary';
import { moistProfileAt } from '../temperature/profile';
import { kucheraRatio, wetBulbAt } from '../temperature/wet-bulb';
import { PRECIP_CUTOFF, shareFromWetBulb, typeFromShare } from './type';

export type SnowRatio = '7:1' | 'kuchera' | '10:1';

/** Snow depth per water depth for one hour (Kuchera needs that hour's profile). */
export function ratioFor(setting: SnowRatio, s: PointSeries, i: number, ground: number): number | null {
  if (setting === '7:1') return 7;
  if (setting === '10:1') return 10;
  const p = moistProfileAt(s.values, i);
  return p ? kucheraRatio(p, ground) : null;
}

/** Part that falls as snow at height z for step i, from the wet-bulb there; null without a profile. */
export function shareAtHeight(s: PointSeries, i: number, z: number): number | null {
  const p = moistProfileAt(s.values, i);
  return p ? shareFromWetBulb(wetBulbAt(p, z)) : null;
}

export interface BandTotal { rainMm: number; snowCm: number; complete: boolean }

/**
 * Rain (mm) and snow (cm) at height `z` for amounts in (start, end]. `complete`
 * is false when the span reaches outside the hours the series holds.
 */
export function totalAtHeight(s: PointSeries, z: number, start: Date, end: Date, ratio: SnowRatio): BandTotal {
  const first = s.times[0];
  const last = s.times[s.times.length - 1];
  const H = s.stepHours * 3_600_000;
  const complete = !!first && !!last && start.getTime() >= first.getTime() - H && end.getTime() <= last.getTime();
  const out: BandTotal = { rainMm: 0, snowCm: 0, complete };
  s.times.forEach((t, i) => {
    if (t <= start || t > end) return;
    const mm = s.values.precipitation?.[i] ?? NaN;
    if (!(mm >= PRECIP_CUTOFF * s.stepHours)) return;
    const share = shareAtHeight(s, i, z);
    if (share === null) { out.complete = false; return; }
    const kind = typeFromShare(share);
    const snow = kind === 'snow' ? mm : kind === 'rain' ? 0 : mm * share;
    out.rainMm += mm - snow;
    out.snowCm += (snow * (ratioFor(ratio, s, i, z) ?? 10)) / 10;
  });
  return out;
}
