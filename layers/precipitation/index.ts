// The precipitation layer: fills its template slots (needs, map fill, chart,
// window summary, legend, readout). Asks for data by variable name only.
import { rampColor } from '../../core/color/ramp';
import { precipTotals } from '../../core/precip/totals';
import { PRECIP_CUTOFF, snowShare, typeFromShare, type PrecipType } from '../../core/precip/type';
import { formatCm, formatMm, formatRate } from '../../core/units/format';
import { PROFILE_RH_VARIABLES, PROFILE_VARIABLES, type PointSeries, type VariableName } from '../../core/vocabulary';
import { ratioFor, shareAtHeight, type SnowRatio } from '../../core/precip/by-elevation';
import { snowLines } from '../../core/temperature/profile';
import { formatElevation } from '../../core/units/format';
import { precipDetails, precipFooter, precipInView, settings, settingsNote } from './details';
import type { LayerSlots } from '../contract';
import { observedAt, withObserved, type Observed } from './observed';
import { precipRamp, PRECIP_TYPES } from './fill';

export { precipDrawField, precipRenderStyle } from './fill';

export const id = 'precipitation';
export const title = 'Precipitation';
export const needs: VariableName[] = ['precipitation', 'snowfall_water_equivalent'];

const series = (s: PointSeries) => ({ p: s.values.precipitation ?? [], w: s.values.snowfall_water_equivalent ?? [] });

/** Default snow ratio: Kuchera, the most accurate in the studies found (docs/06). */
export const DEFAULT_RATIO: SnowRatio = 'kuchera';

/**
 * Snow share at the pin for step i: the wet-bulb at the pin's height when
 * the profile is known (the map's rule, so pin and map agree), else the
 * model's own split.
 */
export function pinShare(s: PointSeries, i: number, ground: number): number {
  return shareAtHeight(s, i, ground) ?? snowShare(s.values.precipitation?.[i] ?? 0, s.values.snowfall_water_equivalent?.[i] ?? 0);
}

/** Readout's bold value for the step at index i: "2.4 mm/h snow", or "Dry". */
export function readoutValue(s: PointSeries | null, i: number, ground = 0): string {
  if (!s) return '…';
  const { p } = series(s);
  const mm = p[i];
  if (mm === undefined || Number.isNaN(mm)) return '–';
  if (mm < PRECIP_CUTOFF) return 'Dry';
  return `${formatRate(mm / s.stepHours)} ${typeFromShare(pinShare(s, i, ground))}`;
}

/** Totals as rain and snow, one part each: ["4 mm rain", "12 cm snow"], or ["Dry"]. Mixed hours are split between them. */
export function totalsParts(s: PointSeries | null, start: Date, end: Date, ratio: SnowRatio = DEFAULT_RATIO, ground = 0): string[] {
  if (!s) return ['…'];
  const { p, w } = series(s);
  // The chosen snow ratio; Kuchera per hour from that hour's profile (10:1 where it is missing).
  const t = precipTotals(s.times, p, w, start, end, (i) => ratioFor(ratio, s, i, ground) ?? 10, (i) => pinShare(s, i, ground));
  const parts: string[] = [];
  if (t.rainMm >= 0.5) parts.push(`${formatMm(t.rainMm)} rain`);
  if (t.snowCm >= 0.5) parts.push(`${formatCm(t.snowCm)} snow`);
  return parts.length ? parts : ['Dry'];
}

/**
 * Window summary, split at the needle: what fell in the half before it and
 * what is due in the half after (Kaden's choice A, Nov 16). Parts stack one
 * per line, so mixed weather stays readable.
 */
export function windowSummary(s: PointSeries | null, start: Date, cursor: Date, end: Date, ratio: SnowRatio = DEFAULT_RATIO, ground = 0) {
  return { before: totalsParts(s, start, cursor, ratio, ground), after: totalsParts(s, cursor, end, ratio, ground) };
}

/**
 * Hourly bars across the window, coloured by type and rate. Bar height is
 * the hour's amount, saturating at the scale's top (6 mm). The shell draws the
 * needle and now line on top. Observed hours (grey) arrive with observed
 * data in M6.
 */
export function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, s: PointSeries | null, start: Date, end: Date, ground = 0, observed?: Observed): void {
  ctx.clearRect(0, 0, w, h);
  if (!s) return;
  const { p } = series(s);
  const span = end.getTime() - start.getTime();
  const x = (t: number) => ((t - start.getTime()) / span) * w;
  const barW = (s.stepHours * 3_600_000 / span) * w;
  const gap = barW > 4 ? 1 : 0;
  const top = 4;
  let bars = 0;
  let covered = 0;
  let hours = 0;
  // Observed 6-hour totals: grey bars at their hourly rate, in place of the model's bars.
  const ink3 = getComputedStyle(ctx.canvas).getPropertyValue('--ink-3').trim();
  for (const o of observed ?? []) {
    const right = x(o.end.getTime());
    const left = x(o.end.getTime() - o.hours * 3_600_000);
    if (right < 0 || left > w) continue;
    const rate = o.mm / o.hours;
    if (rate < PRECIP_CUTOFF) continue;
    const bh = Math.max(2, Math.min(1, rate / 6) * (h - top));
    ctx.fillStyle = ink3;
    ctx.fillRect(left + 1, h - bh, Math.max(1, right - left - 2), bh);
    bars++;
  }
  s.times.forEach((time, i) => {
    const mm = p[i];
    const right = x(time.getTime());
    const left = right - barW;
    if (right < 0 || left > w) return;
    hours++;
    if (observedAt(time, observed)) { covered++; return; }
    if (mm !== undefined && Number.isFinite(mm)) covered++;
    if (mm === undefined || !(mm >= PRECIP_CUTOFF)) return;
    bars++;
    const rate = mm / s.stepHours;
    const bh = Math.max(2, Math.min(1, rate / 6) * (h - top));
    const kind: PrecipType = typeFromShare(pinShare(s, i, ground));
    const [r, g, b] = rampColor(precipRamp(kind), Math.max(rate, 0.5));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(left + gap / 2, h - bh, Math.max(1, barW - gap), bh);
  });
  // Say it plainly, so an empty chart never looks like one still loading.
  if (!bars) {
    ctx.fillStyle = getComputedStyle(ctx.canvas).getPropertyValue('--ink-2').trim();
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Left of the needle, which sits mid-chart.
    // Only "dry" when every hour in view has data; missing hours are not dry hours.
    const text = !covered ? 'No forecast for these hours yet' : covered < hours ? 'Dry where the forecast has loaded' : 'Dry through this window';
    ctx.fillText(text, w / 4, h / 2);
  }
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

const gradient = (t: PrecipType) => {
  const r = precipRamp(t);
  return `linear-gradient(90deg, ${r.colors.map((c, i) => `${c} ${Math.round((i / (r.colors.length - 1)) * 100)}%`).join(', ')})`;
};

/** The layer's slots, as the shell asks for them (layers/contract.ts). */
export const precipitation: LayerSlots = {
  id,
  title,
  swatches: PRECIP_TYPES.map(gradient),
  // The profile (with humidity) gives the snow line and freezing level in the details.
  pinNeeds: [...needs, ...PROFILE_VARIABLES, ...PROFILE_RH_VARIABLES],
  // The profile decides rain or snow at the pin's height, so a saved area
  // keeps it too: offline numbers must equal online ones.
  saveNeeds: [...needs, ...PROFILE_VARIABLES, ...PROFILE_RH_VARIABLES],
  chartLabel: 'Hourly precipitation across the window. Drag to move through time.',
  legend,
  readout: (pin, i) => {
    const sl = pin.series && i >= 0 ? snowLines(pin.series)[i] : undefined;
    return { value: readoutValue(pin.series, i, Math.max(0, pin.elevation ?? 0)), extra: sl !== undefined && sl !== null ? `snow line ${formatElevation(Math.round(sl / 10) * 10)}` : undefined };
  },
  // Totals use what was observed where it covers the hours.
  summary: (pin, start, cursor, end, set) => ({
    kind: 'split',
    ...windowSummary(withObserved(pin.series, pin.observed), start, cursor, end, (set?.ratio as SnowRatio | undefined) ?? DEFAULT_RATIO, Math.max(0, pin.elevation ?? 0)),
    // Say when what fell is measured (analysis), not forecast.
    beforeNote: pin.observed?.some((o) => o.end > start && o.end.getTime() - o.hours * 3_600_000 < cursor.getTime()) ? 'observed' : undefined,
  }),
  drawChart: (ctx, w, h, pin, start, end) => drawChart(ctx, w, h, pin.series, start, end, Math.max(0, pin.elevation ?? 0), pin.observed),
  details: (ctx) => precipDetails(ctx),
  inView: (view) => precipInView(view),
  footer: (ctx) => precipFooter(ctx),
  settings,
  settingsNote,
};
