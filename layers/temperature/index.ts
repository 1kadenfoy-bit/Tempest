// The temperature layer (v8 18-Temp, 19-TempHome): air temperature 2 m above
// the terrain, corrected from the model's pressure levels (TopoSCALE). Fills
// the template's slots; asks for data by variable name only.
import { rampColor } from '../../core/color/ramp';
import { dewPoint, feelsLike } from '../../core/temperature/feels-like';
import { freezingLevels, terrainTemperatures } from '../../core/temperature/profile';
import { isDaylight } from '../../core/time/sun';
import { formatDegrees, formatElevation, formatTemp, formatTempNumber, formatTimeRange, unitLabel } from '../../core/units/format';
import { PROFILE_RH_VARIABLES, PROFILE_VARIABLES, type PointSeries, type VariableName } from '../../core/vocabulary';
import type { LayerSlots, PinData, WindowSummary } from '../contract';
import { TEMP_RANGE, temperatureGradient, temperatureRamp } from './fill';
import { settings, settingsNote, temperatureDetails, temperatureInView } from './details';

export { temperatureRenderStyle } from './fill';

const SURFACE: VariableName[] = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m'];

/** Per-step values at the pin: temperature at its ground height, and feels-like. */
interface PinValues { times: Date[]; temp: number[]; feels: number[]; kind: string[]; freezing: (number | null)[] }

const memo = new WeakMap<PointSeries, Map<number, PinValues>>();
function pinValues(pin: PinData): PinValues | null {
  const s = pin.series;
  if (!s || pin.elevation === null) return null;
  const z = Math.max(0, pin.elevation);
  let byZ = memo.get(s);
  if (!byZ) { byZ = new Map(); memo.set(s, byZ); }
  const hit = byZ.get(z);
  if (hit) return hit;
  const temp = terrainTemperatures(s, z);
  const feels: number[] = [];
  const kind: string[] = [];
  temp.forEach((t, i) => {
    const t2 = s.values.temperature_2m?.[i] ?? NaN;
    const rh = s.values.relative_humidity_2m?.[i] ?? NaN;
    const wind = s.values.wind_speed_10m?.[i] ?? NaN;
    // Dew point from the model's 2 m air; wind at 10 m (ECCC's convention).
    const f = Number.isFinite(t) && Number.isFinite(wind) ? feelsLike(t, wind, Number.isFinite(t2) && Number.isFinite(rh) ? dewPoint(t2, rh) : -99) : { value: NaN, kind: 'air' as const };
    feels.push(f.value);
    kind.push(f.kind);
  });
  const v = { times: s.times, temp, feels, kind, freezing: freezingLevels(s) };
  byZ.set(z, v);
  return v;
}

function inWindow(v: PinValues, start: Date, end: Date) {
  const idx: number[] = [];
  v.times.forEach((t, i) => { if (t >= start && t <= end && Number.isFinite(v.temp[i])) idx.push(i); });
  return idx;
}

function summary(pin: PinData, start: Date, _cursor: Date, end: Date): WindowSummary {
  const v = pinValues(pin);
  if (!v) return { kind: 'whole', lines: ['…'], label: '' };
  const idx = inWindow(v, start, end);
  if (!idx.length) return { kind: 'whole', lines: ['–'], label: 'Outside the model’s hours' };
  const temps = idx.map((i) => v.temp[i]!);
  const hi = Math.max(...temps);
  const lo = Math.min(...temps);
  return {
    kind: 'whole',
    lines: [`High ${formatDegrees(hi)} · Low ${formatDegrees(lo)}`],
    // The span the numbers really cover, inside the model's hours.
    label: formatTimeRange(v.times[idx[0]!]!, v.times[idx[idx.length - 1]!]!),
  };
}

function cssVar(ctx: CanvasRenderingContext2D, name: string, fallback: string): string {
  return getComputedStyle(ctx.canvas).getPropertyValue(name).trim() || fallback;
}

/**
 * Air temperature as a thick line coloured by value; feels-like as a thin
 * line, the gap shaded blue when it feels colder and warm when it feels
 * warmer; a 0° guide; lighter bands for daylight. The "Feels" label stays
 * inside the chart.
 */
function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, pin: PinData, start: Date, end: Date): void {
  ctx.clearRect(0, 0, w, h);
  const v = pinValues(pin);
  if (!v || !pin.series) return;
  const span = end.getTime() - start.getTime();
  const x = (t: Date) => ((t.getTime() - start.getTime()) / span) * w;
  const ink2 = cssVar(ctx, '--ink-2', '#9AA6B2');
  const ramp = temperatureRamp();
  const rgba = (c: number, a: number) => { const [r, g, b] = rampColor(ramp, c); return `rgba(${r},${g},${b},${a})`; };

  // Daylight bands, every 10 minutes across the window.
  ctx.fillStyle = cssVar(ctx, '--card', 'transparent');
  const stepMs = 10 * 60_000;
  let bandStart: number | null = null;
  for (let t = start.getTime(); t <= end.getTime() + stepMs; t += stepMs) {
    const day = t <= end.getTime() && isDaylight(new Date(t), pin.series.lat, pin.series.lon);
    if (day && bandStart === null) bandStart = t;
    if (!day && bandStart !== null) {
      ctx.fillRect(x(new Date(bandStart)), 0, x(new Date(t)) - x(new Date(bandStart)), h);
      bandStart = null;
    }
  }

  // Include the steps just outside the window, so the lines reach the edges.
  const idx: number[] = [];
  v.times.forEach((t, i) => {
    if (!Number.isFinite(v.temp[i])) return;
    const prevIn = v.times[i + 1] && v.times[i + 1]! >= start;
    const nextIn = v.times[i - 1] && v.times[i - 1]! <= end;
    if ((t >= start && t <= end) || (t < start && prevIn) || (t > end && nextIn)) idx.push(i);
  });
  if (!idx.length) return;
  const all = idx.flatMap((i) => [v.temp[i]!, Number.isFinite(v.feels[i]) ? v.feels[i]! : v.temp[i]!]);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  // Show the 0° guide when it is near the values.
  if (lo > 0 && lo < 6) lo = 0;
  if (hi < 0 && hi > -6) hi = 0;
  if (hi - lo < 6) { const mid = (hi + lo) / 2; hi = mid + 3; lo = mid - 3; }
  const top = 6, bottom = h - 4;
  const y = (c: number) => bottom - ((c - lo) / (hi - lo)) * (bottom - top);

  // The gap between air and feels-like.
  for (let n = 1; n < idx.length; n++) {
    const a = idx[n - 1]!, b = idx[n]!;
    const fa = v.feels[a]!, fb = v.feels[b]!;
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
    const colder = (fa + fb) / 2 < (v.temp[a]! + v.temp[b]!) / 2;
    ctx.fillStyle = colder ? rgba(-12, 0.28) : rgba(16, 0.28);
    ctx.beginPath();
    ctx.moveTo(x(v.times[a]!), y(v.temp[a]!));
    ctx.lineTo(x(v.times[b]!), y(v.temp[b]!));
    ctx.lineTo(x(v.times[b]!), y(fb));
    ctx.lineTo(x(v.times[a]!), y(fa));
    ctx.closePath();
    ctx.fill();
  }

  // 0° guide
  if (lo <= 0 && hi >= 0) {
    ctx.strokeStyle = ink2;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y(0)) + 0.5);
    ctx.lineTo(w, Math.round(y(0)) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink2;
    ctx.font = '400 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = y(0) < 14 ? 'top' : 'bottom';
    ctx.fillText(formatDegrees(0, false), w - 4, y(0) + (y(0) < 14 ? 2 : -2));
  }

  // Feels-like: thin line
  ctx.strokeStyle = ink2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let started = false;
  for (const i of idx) {
    const f = v.feels[i]!;
    if (!Number.isFinite(f)) { started = false; continue; }
    if (started) ctx.lineTo(x(v.times[i]!), y(f)); else ctx.moveTo(x(v.times[i]!), y(f));
    started = true;
  }
  ctx.stroke();

  // Air temperature: thick line coloured by value
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let n = 1; n < idx.length; n++) {
    const a = idx[n - 1]!, b = idx[n]!;
    ctx.strokeStyle = rgba((v.temp[a]! + v.temp[b]!) / 2, 1);
    ctx.beginPath();
    ctx.moveTo(x(v.times[a]!), y(v.temp[a]!));
    ctx.lineTo(x(v.times[b]!), y(v.temp[b]!));
    ctx.stroke();
  }

  // "Feels" label, inside the chart, by the thin line near the right edge.
  const last = [...idx].reverse().find((i) => x(v.times[i]!) <= w - 8 && Number.isFinite(v.feels[i]));
  if (last !== undefined && Math.abs(v.feels[last]! - v.temp[last]!) >= 0.5) {
    const fy = y(v.feels[last]!);
    const below = v.feels[last]! < v.temp[last]!;
    ctx.fillStyle = ink2;
    ctx.font = '400 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = below ? 'top' : 'bottom';
    ctx.fillText('Feels', w - 4, Math.min(h - 2, Math.max(12, fy + (below ? 3 : -3))));
  }
}

function legend(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'legend legend-scale';
  const unit = doc.createElement('span');
  unit.className = 'legend-unit';
  unit.textContent = unitLabel('temp');
  const scale = doc.createElement('span');
  scale.className = 'legend-track';
  const bar = doc.createElement('span');
  bar.className = 'legend-bar legend-bar-wide';
  bar.style.background = temperatureGradient();
  const ticks = doc.createElement('span');
  ticks.className = 'legend-ticks';
  const [min, max] = TEMP_RANGE;
  for (const v of [-20, -10, 0, 10, 20]) {
    const t = doc.createElement('span');
    t.style.left = `${((v - min) / (max - min)) * 100}%`;
    t.textContent = v === 20 ? formatTemp(v) : formatTempNumber(v);
    ticks.append(t);
  }
  scale.append(bar, ticks);
  el.append(unit, scale);
  return el;
}

function weekDay(pin: PinData, dayStart: Date, dayEnd: Date): string | null {
  const v = pinValues(pin);
  if (!v) return null;
  const temps = v.times.flatMap((t, i) => (t >= dayStart && t < dayEnd && Number.isFinite(v.temp[i]) ? [v.temp[i]!] : []));
  // A high and low from part of a day would mislead: half a day at least.
  if (temps.length < 12) return null;
  return `${formatDegrees(Math.max(...temps), false)} ${formatDegrees(Math.min(...temps), false)}`;
}

export const temperature: LayerSlots = {
  id: 'temperature',
  title: 'Temperature',
  swatches: [temperatureGradient()],
  pinNeeds: [...PROFILE_VARIABLES, ...PROFILE_RH_VARIABLES, ...SURFACE],
  saveNeeds: [...PROFILE_VARIABLES, ...PROFILE_RH_VARIABLES, ...SURFACE],
  chartLabel: 'Temperature at the pin across the window, with feels-like. Drag to move through time.',
  legend,
  readout(pin, i) {
    const v = pinValues(pin);
    if (!v) return { value: '…' };
    const t = v.temp[i];
    if (t === undefined || !Number.isFinite(t)) return { value: '–' };
    const f = v.feels[i]!;
    const fl = v.freezing[i];
    return {
      value: formatTemp(t),
      note: Number.isFinite(f) ? `feels ${formatTempNumber(f)}` : undefined,
      extra: fl !== null && fl !== undefined ? `${formatTemp(0)} at ${formatElevation(Math.max(0, Math.round(fl / 10) * 10))}` : undefined,
    };
  },
  summary,
  drawChart,
  weekDay,
  details: (ctx) => temperatureDetails(pinValues(ctx.pin), ctx),
  inView: (view) => temperatureInView(view),
  footer: () => ['Corrected to terrain from pressure levels'],
  settings,
  settingsNote,
};

/** The pin's temperature and feels-like at a step, for tests and checks. */
export function pinTemperature(pin: PinData, i: number): { temp: number; feels: number; kind: string } | null {
  const v = pinValues(pin);
  return v ? { temp: v.temp[i]!, feels: v.feels[i]!, kind: v.kind[i]! } : null;
}
