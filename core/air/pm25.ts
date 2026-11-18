// Fine particles (PM2.5): the colour scale and the AQHI's risk words. Pure.
//
// The colour scale is ECCC's own for this product: the legend GeoMet draws
// for RAQDPS PM2.5 (style PM2.5_0to500ugm3_Dis, read from its legend picture
// Nov 18, 2026), from 1 to 500 µg/m³ with steps at 10, 20 … 100, 250 and 500.
// ECCC draws it stepped; Tempest's scales are continuous (docs/06), so the
// colours are placed at ECCC's own breakpoints and blended between them.
// Values below 1 µg/m³ are not drawn, as in ECCC's legend.
import type { Ramp } from '../color/ramp';

/** ECCC's breakpoints (µg/m³) and the colour that starts at each. */
export const PM25_STOPS: readonly { value: number; color: string }[] = [
  { value: 1, color: '#ABD1FA' },
  { value: 10, color: '#38B3F3' },
  { value: 20, color: '#0376B0' },
  { value: 30, color: '#A3CD68' },
  { value: 40, color: '#44A405' },
  { value: 50, color: '#298187' },
  { value: 60, color: '#F9FC11' },
  { value: 70, color: '#F28A0B' },
  { value: 80, color: '#F60000' },
  { value: 90, color: '#F2A6E0' },
  { value: 100, color: '#F406E2' },
  { value: 250, color: '#995CB4' },
  { value: 500, color: '#540874' },
];

export const PM25_CUTOFF = 1;
export const PM25_MAX = 500;

/** The scale as a ramp: each breakpoint holds its own colour; positions are evenly spaced along the colours. */
export function pm25Ramp(): Ramp {
  const n = PM25_STOPS.length;
  return {
    valueStops: PM25_STOPS.map((s, i) => [s.value, i / (n - 1)] as [number, number]),
    colors: PM25_STOPS.map((s) => s.color),
    cutoff: PM25_CUTOFF,
  };
}

/** Where a value sits along the legend (0..1), by the same breakpoints the colours use. */
export function pm25Position(v: number): number {
  const s = PM25_STOPS;
  if (v <= s[0]!.value) return 0;
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i]!.value) return (i - 1 + (v - s[i - 1]!.value) / (s[i]!.value - s[i - 1]!.value)) / (s.length - 1);
  }
  return 1;
}

/**
 * The Air Quality Health Index as ECCC shows it: the value rounded to a whole
 * number, "10+" above 10, and its health risk words (Low 1–3, Moderate 4–6,
 * High 7–10, Very high above 10). ECCC's API gives the unrounded value too
 * (1.41); both are shown, never re-scored.
 */
export function aqhiShown(v: number): { text: string; risk: string } {
  const r = Math.max(1, Math.round(v));
  if (r > 10) return { text: '10+', risk: 'Very high risk' };
  return { text: String(r), risk: r <= 3 ? 'Low risk' : r <= 6 ? 'Moderate risk' : 'High risk' };
}
