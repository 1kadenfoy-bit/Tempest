// The wind layer (v8 23-Wind to 27-WindSettings): speed or gusts at the
// terrain, from the model's 10 m wind and its pressure levels, with animated
// flow on top. Fills the template's slots; asks for data by variable name only.
import { rampColor } from '../../core/color/ramp';
import { compass, terrainWind, windProfileAt } from '../../core/wind/wind';
import { formatBearing, formatCursorTime, formatSpeed, formatTimeRange } from '../../core/units/format';
import { PROFILE_LEVELS, PROFILE_VARIABLES, WIND_LEVEL_VARIABLES, WIND_SURFACE_VARIABLES, type PointSeries, type VariableName } from '../../core/vocabulary';
import type { LayerSlots, PinData, WindowSummary } from '../contract';
import { windDetails, windInView, settings, settingsNote, type PinWind } from './details';
import { WIND_RANGE, windGradient, windRamp } from './fill';

export { windRenderStyle, WIND_RANGE } from './fill';

/**
 * Everything the wind needs: the profile (level heights; temperature comes
 * with it, as every layer's nodes share one profile), level winds, and the
 * 10 m wind and gust.
 */
export const WIND_NEEDS: VariableName[] = [...PROFILE_VARIABLES, ...WIND_LEVEL_VARIABLES, ...WIND_SURFACE_VARIABLES];

/** The model's ground under the pin at step i: the segment's model, else the pin's own height (10 m wind). */
export function groundAt(pin: PinData, i: number): number {
  const s = pin.series!;
  const t = s.times[i]!;
  const seg = s.segments?.find((x) => t >= x.from && t <= x.to);
  const g = pin.ground?.[seg?.model ?? ''] ?? pin.ground?.[s.label.model];
  return g ?? Math.max(0, pin.elevation ?? 0);
}

const memo = new WeakMap<PointSeries, Map<string, PinWind>>();
export function pinWind(pin: PinData): PinWind | null {
  const s = pin.series;
  if (!s || pin.elevation === null) return null;
  const z = Math.max(0, pin.elevation);
  const key = `${z}|${JSON.stringify(pin.ground ?? {})}`;
  let byKey = memo.get(s);
  if (!byKey) { byKey = new Map(); memo.set(s, byKey); }
  const hit = byKey.get(key);
  if (hit) return hit;
  const speed: number[] = [], gust: number[] = [], dir: number[] = [];
  s.times.forEach((_, i) => {
    const p = windProfileAt(s.values, i, PROFILE_LEVELS);
    if (!p) { speed.push(NaN); gust.push(NaN); dir.push(NaN); return; }
    const w = terrainWind(p, z, groundAt(pin, i));
    speed.push(w.speed); gust.push(w.gust); dir.push(w.dir);
  });
  const v = { times: s.times, speed, gust, dir };
  byKey.set(key, v);
  return v;
}

function summary(pin: PinData, start: Date, _cursor: Date, end: Date): WindowSummary {
  const v = pinWind(pin);
  if (!v) return { kind: 'whole', lines: ['…'], label: '' };
  const idx = v.times.flatMap((t, i) => (t >= start && t <= end && Number.isFinite(v.gust[i]) ? [i] : []));
  if (!idx.length) return { kind: 'whole', lines: ['–'], label: 'Outside the model’s hours' };
  const peak = idx.reduce((a, b) => (v.gust[b]! > v.gust[a]! ? b : a));
  return {
    kind: 'whole',
    lines: [`Gusts to ${formatSpeed(v.gust[peak]!)}`],
    label: `${formatCursorTime(v.times[peak]!)} · ${formatTimeRange(v.times[idx[0]!]!, v.times[idx[idx.length - 1]!]!)}`,
  };
}

function cssVar(ctx: CanvasRenderingContext2D, name: string, fallback: string): string {
  return getComputedStyle(ctx.canvas).getPropertyValue(name).trim() || fallback;
}

/**
 * Hourly speed bars coloured by speed, a white tick above each at that hour's
 * strongest gust, and arrows along the top every 3 hours pointing where the
 * wind blows. One scale for bars and ticks, from 0 to the window's top gust.
 */
function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, pin: PinData, start: Date, end: Date): void {
  ctx.clearRect(0, 0, w, h);
  const v = pinWind(pin);
  if (!v) return;
  const span = end.getTime() - start.getTime();
  const x = (t: number) => ((t - start.getTime()) / span) * w;
  const barW = (3_600_000 / span) * w;
  const gap = barW > 4 ? 1 : 0;
  const arrowRow = 14;
  const top = arrowRow + 4;
  const idx = v.times.flatMap((t, i) => (x(t.getTime()) >= -barW && x(t.getTime()) <= w + barW && Number.isFinite(v.speed[i]) ? [i] : []));
  if (!idx.length) {
    ctx.fillStyle = cssVar(ctx, '--ink-2', '#9AA6B2');
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No forecast for these hours yet', w / 4, h / 2);
    return;
  }
  const max = Math.max(40, ...idx.map((i) => (Number.isFinite(v.gust[i]) ? v.gust[i]! : v.speed[i]!))) * 1.05;
  const y = (s: number) => h - (Math.min(s, max) / max) * (h - top);
  const ramp = windRamp();
  const ink = cssVar(ctx, '--ink', '#F2F5F7');
  for (const i of idx) {
    const right = x(v.times[i]!.getTime() + 1_800_000);
    const left = right - barW;
    const [r, g, b] = rampColor(ramp, v.speed[i]!);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    const by = y(v.speed[i]!);
    ctx.fillRect(left + gap / 2, by, Math.max(1, barW - gap), h - by);
    if (Number.isFinite(v.gust[i])) {
      ctx.fillStyle = ink;
      ctx.fillRect(left + gap / 2, Math.round(y(v.gust[i]!)) - 1, Math.max(1, barW - gap), 2);
    }
  }
  // Direction arrows every 3 hours (on the clock), pointing downwind.
  ctx.strokeStyle = cssVar(ctx, '--ink-2', '#9AA6B2');
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  for (const i of idx) {
    if (v.times[i]!.getUTCHours() % 3 !== 0 || !Number.isFinite(v.dir[i])) continue;
    const cx = x(v.times[i]!.getTime());
    if (cx < 6 || cx > w - 6) continue;
    const a = ((v.dir[i]! + 180) * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const cy = arrowRow / 2 + 1, L = 5;
    ctx.beginPath();
    ctx.moveTo(cx - dx * L, cy - dy * L);
    ctx.lineTo(cx + dx * L, cy + dy * L);
    // Head
    const hx = cx + dx * L, hy = cy + dy * L;
    ctx.moveTo(hx, hy); ctx.lineTo(hx - dx * 3.2 + dy * 2.6, hy - dy * 3.2 - dx * 2.6);
    ctx.moveTo(hx, hy); ctx.lineTo(hx - dx * 3.2 - dy * 2.6, hy - dy * 3.2 + dx * 2.6);
    ctx.stroke();
  }
}

function legend(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'legend legend-scale';
  const unit = doc.createElement('span');
  unit.className = 'legend-unit';
  unit.textContent = 'Wind';
  const scale = doc.createElement('span');
  scale.className = 'legend-track';
  const bar = doc.createElement('span');
  bar.className = 'legend-bar legend-bar-wide';
  bar.style.background = windGradient();
  const ticks = doc.createElement('span');
  ticks.className = 'legend-ticks';
  const [min, max] = WIND_RANGE;
  for (const v of [0, 10, 25, 40, 60]) {
    const t = doc.createElement('span');
    t.style.left = `${((v - min) / (max - min)) * 100}%`;
    t.textContent = v === 60 ? '60+ km/h' : String(v);
    ticks.append(t);
  }
  scale.append(bar, ticks);
  el.append(unit, scale);
  return el;
}

export const wind: LayerSlots = {
  id: 'wind',
  title: 'Wind',
  swatches: [windGradient()],
  pinNeeds: WIND_NEEDS,
  saveNeeds: WIND_NEEDS,
  chartLabel: 'Wind at the pin across the window: hourly speed bars, gust ticks and direction arrows. Drag to move through time.',
  legend,
  readout(pin, i) {
    const v = pinWind(pin);
    if (!v) return { value: '…' };
    const s = v.speed[i];
    if (s === undefined || !Number.isFinite(s)) return { value: '–' };
    return { value: formatSpeed(s), note: `gusts ${formatSpeed(v.gust[i]!, false)} · ${formatBearing(compass(v.dir[i]!), v.dir[i]!)}` };
  },
  summary,
  drawChart,
  details: (ctx) => windDetails(pinWind(ctx.pin), ctx, ctx.pin.series && ctx.index >= 0 ? groundAt(ctx.pin, ctx.index) : 0),
  inView: (view) => windInView(view),
  footer: () => ['At the terrain, from 10 m wind and pressure levels'],
  settings,
  settingsNote,
};
