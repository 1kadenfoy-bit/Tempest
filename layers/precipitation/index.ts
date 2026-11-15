// The precipitation layer: fills its template slots (needs, map fill, chart,
// window summary, legend, readout). Asks for data by variable name only.
import { rampColor } from '../../core/color/ramp';
import { precipTotals } from '../../core/precip/totals';
import { PRECIP_CUTOFF, precipType, type PrecipType } from '../../core/precip/type';
import { formatCm, formatCursorTime, formatMm, formatRate } from '../../core/units/format';
import type { PointSeries, VariableName } from '../../core/vocabulary';
import { precipRamp, PRECIP_TYPES } from './fill';

export { precipFills } from './fill';

export const id = 'precipitation';
export const title = 'Precipitation';
export const needs: VariableName[] = ['precipitation', 'snowfall_water_equivalent'];

const series = (s: PointSeries) => ({ p: s.values.precipitation ?? [], w: s.values.snowfall_water_equivalent ?? [] });

/** Readout's bold value for the step at index i: "2.4 mm/h snow", or "Dry". */
export function readoutValue(s: PointSeries | null, i: number): string {
  if (!s) return '…';
  const { p, w } = series(s);
  const mm = p[i];
  if (mm === undefined || Number.isNaN(mm)) return '–';
  if (mm < PRECIP_CUTOFF) return 'Dry';
  return `${formatRate(mm / s.stepHours)} ${precipType(mm, w[i] ?? 0)}`;
}

/** Window summary: "12 mm rain · 21 cm snow" and "+3 mm mixed · Thu 5 PM – Sat 5 PM". */
export function windowSummary(s: PointSeries | null, start: Date, end: Date): { main: string; sub: string } {
  const range = `${formatCursorTime(start)} – ${formatCursorTime(end)}`;
  if (!s) return { main: '…', sub: range };
  const { p, w } = series(s);
  const t = precipTotals(s.times, p, w, start, end);
  const parts: string[] = [];
  if (t.rainMm >= 0.5) parts.push(`${formatMm(t.rainMm)} rain`);
  if (t.snowCm >= 0.5) parts.push(`${formatCm(t.snowCm)} snow`);
  const extra = t.mixedMm >= 0.5 ? `+${formatMm(t.mixedMm)} mixed · ` : '';
  if (!parts.length) parts.push(t.mixedMm >= 0.5 ? `${formatMm(t.mixedMm)} mixed` : 'Dry');
  return { main: parts.join(' · '), sub: (parts[0]?.includes('mixed') ? '' : extra) + range };
}

/**
 * Hourly bars across the window, coloured by type and rate. Bar height is
 * the hour's amount, saturating at the scale's top (6 mm). The shell draws the
 * needle and now line on top. Observed hours (grey) arrive with observed
 * data in M6.
 */
export function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, s: PointSeries | null, start: Date, end: Date): void {
  ctx.clearRect(0, 0, w, h);
  if (!s) return;
  const { p, w: swe } = series(s);
  const span = end.getTime() - start.getTime();
  const x = (t: number) => ((t - start.getTime()) / span) * w;
  const barW = (s.stepHours * 3_600_000 / span) * w;
  const gap = barW > 4 ? 1 : 0;
  const top = 4;
  s.times.forEach((time, i) => {
    const mm = p[i];
    if (mm === undefined || !(mm >= PRECIP_CUTOFF)) return;
    const right = x(time.getTime());
    const left = right - barW;
    if (right < 0 || left > w) return;
    const rate = mm / s.stepHours;
    const bh = Math.max(2, Math.min(1, rate / 6) * (h - top));
    const kind: PrecipType = precipType(mm, swe[i] ?? 0);
    const [r, g, b] = rampColor(precipRamp(kind), Math.max(rate, 0.5));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(left + gap / 2, h - bh, Math.max(1, barW - gap), bh);
  });
}

/** Legend: the three colour families on one mm/h scale. */
export function legend(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'legend';
  for (const t of PRECIP_TYPES) {
    const ramp = precipRamp(t);
    const stops = ramp.colors.map((c, i) => `${c} ${Math.round((i / (ramp.colors.length - 1)) * 100)}%`).join(', ');
    const item = doc.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-name"></span><span class="legend-bar" style="background: linear-gradient(90deg, ${stops})"></span>`;
    item.querySelector('.legend-name')!.textContent = t[0]!.toUpperCase() + t.slice(1);
    el.append(item);
  }
  const range = doc.createElement('span');
  range.className = 'legend-range';
  range.textContent = '0.1 to 6+ mm/h';
  el.append(range);
  return el;
}
