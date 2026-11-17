// Observed precipitation (HRDPA) joined into the pin's series: the analysis's
// 6-hour totals replace the model's amounts for the hours they cover. Shared
// by the chart, the totals and the table.
import type { PointSeries } from '../../core/vocabulary';
import type { PinData } from '../contract';

export type Observed = NonNullable<PinData['observed']>;

/**
 * The series with observed amounts in place of the model's where an
 * observation covers the hour (each 6-hour total spread evenly over its
 * hours). Rain or snow still comes from that hour's profile. Used for totals,
 * never for the readout.
 */
export function withObserved(s: PointSeries | null, observed: Observed | undefined): PointSeries | null {
  if (!s || !observed?.length) return s;
  const p = [...(s.values.precipitation ?? [])];
  const sweModel = s.values.snowfall_water_equivalent ?? [];
  const swe = [...sweModel];
  s.times.forEach((t, i) => {
    const o = observed.find((x) => t.getTime() > x.end.getTime() - x.hours * 3_600_000 && t.getTime() <= x.end.getTime());
    if (!o) return;
    const mm = o.mm / o.hours;
    const share = (p[i] ?? 0) > 0 ? (sweModel[i] ?? 0) / p[i]! : 0;
    p[i] = mm;
    swe[i] = mm * share;
  });
  return { ...s, values: { ...s.values, precipitation: p, snowfall_water_equivalent: swe } };
}

/** Hours an observation covers. */
export function observedAt(t: Date, observed: Observed | undefined) {
  return observed?.find((x) => t.getTime() > x.end.getTime() - x.hours * 3_600_000 && t.getTime() <= x.end.getTime()) ?? null;
}

