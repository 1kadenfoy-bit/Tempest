// Wind details (v8 25-WindUp, 26-WindScroll) and settings (27). Every number
// comes from the pin's series: the model's wind profile at the pin's cell,
// read at the pin's ground height, at real model hours.
import { rampColor } from '../../core/color/ramp';
import { compass, directionShift, nextCalm, terrainWind, windProfileAt } from '../../core/wind/wind';
import { dayStart } from '../../core/time/window';
import { formatBearing, formatDayLabel, formatSpeed, formatSpan, formatWhen } from '../../core/units/format';
import { PROFILE_LEVELS } from '../../core/vocabulary';
import type { Card, DetailContext, Setting, ViewSample } from '../contract';
import { windRamp } from './fill';

export interface PinWind { times: Date[]; speed: number[]; gust: number[]; dir: number[] }

const H = 3_600_000;
const ramp = windRamp();
const color = (s: number) => { const [r, g, b] = rampColor(ramp, s); return `rgb(${r},${g},${b})`; };

export const settings: Setting[] = [
  { key: 'map', title: 'MAP SHOWS', kind: 'segmented', options: [{ value: 'speed', label: 'Speed' }, { value: 'gusts', label: 'Gusts' }], default: 'speed' },
  { key: 'flow', title: 'Flow animation', kind: 'toggle', default: true },
  { key: 'arrows', title: 'Arrows when animation is off', kind: 'toggle', default: true },
  { key: 'calm', title: 'CALM THRESHOLD', kind: 'segmented', options: [{ value: '10', label: '10' }, { value: '15', label: '15' }, { value: '20', label: '20' }, { value: '25', label: '25 km/h' }], default: '15' },
];
export const settingsNote = 'Wind at the terrain, from 10 m wind and pressure levels. Colours stop at 60 km/h; readouts always show the real value.';

/** The hour of day in BC, 0–23. */
function localHour(t: Date): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', hour: 'numeric', hourCycle: 'h23' }).format(t));
}

function headline(v: PinWind, i: number, now: Date): Card {
  const parts = [`From the ${compass(v.dir[i]!)}, gusting ${formatSpeed(v.gust[i]!, false)}.`];
  // Over the next day: when it peaks, and a lasting turn after that.
  const until = v.times[i]!.getTime() + 24 * H;
  let peak = i;
  for (let k = i; k < v.times.length && v.times[k]!.getTime() <= until; k++) if (v.gust[k]! > v.gust[peak]!) peak = k;
  const shift = directionShift(v.times, v.dir, v.speed, peak);
  const turn = shift && shift.at.getTime() <= until
    ? `turns ${compass(shift.toDir)} ${localHour(shift.at) < 6 || localHour(shift.at) >= 22 ? 'overnight' : `around ${formatWhen(shift.at, now)}`}`
    : null;
  if (peak > i && v.gust[peak]! - v.gust[i]! >= 5) parts.push(`Peaks around ${formatWhen(v.times[peak]!, now)}${turn ? `, then ${turn}` : ''}.`);
  else if (turn) parts.push(`${turn[0]!.toUpperCase()}${turn.slice(1)}.`);
  return { kind: 'headline', value: formatSpeed(v.speed[i]!), sentence: parts.join(' ') };
}

function nowCard(v: PinWind, ctx: DetailContext): Card {
  const i = ctx.index;
  return {
    kind: 'stats', title: 'NOW', meta: ctx.cursor.getTime() === v.times[i]?.getTime() && Math.abs(ctx.cursor.getTime() - ctx.now.getTime()) > H ? `at ${formatWhen(ctx.cursor, ctx.now)}` : undefined,
    stats: [
      { label: 'Speed', value: formatSpeed(v.speed[i]!, false), unit: 'km/h' },
      { label: 'Gusts', value: formatSpeed(v.gust[i]!, false), unit: 'km/h' },
      { label: 'From', value: compass(v.dir[i]!), unit: `${Math.round(v.dir[i]!) % 360}°` },
    ],
  };
}

/** Speed against height at the cursor: the pin's profile read at each height over its ground. */
function byElevation(v: PinWind, ctx: DetailContext, ground: number): Card | null {
  const s = ctx.pin.series!;
  const p = windProfileAt(s.values, ctx.index, PROFILE_LEVELS);
  if (!p) return null;
  const points = [];
  for (let z = 0; z <= 4000; z += 100) {
    const w = terrainWind(p, z, ground);
    points.push({ elevation: z, value: w.speed, color: color(w.speed) });
  }
  const sp = v.speed[ctx.index]!;
  return {
    kind: 'value-elevation', title: 'BY ELEVATION', meta: `at ${formatWhen(ctx.cursor, ctx.now)} · ridge vs valley`, points, zero: false, unit: 'km/h',
    you: { elevation: Math.max(0, ctx.pin.elevation ?? 0), value: sp, label: `You · ${formatSpeed(sp)}` },
  };
}

function strongest(v: PinWind, ctx: DetailContext): Card | null {
  const best = (from: Date, to: Date) => {
    let k = -1;
    v.times.forEach((t, j) => { if (t >= from && t <= to && Number.isFinite(v.gust[j]) && (k < 0 || v.gust[j]! > v.gust[k]!)) k = j; });
    return k;
  };
  const w = best(ctx.start, ctx.end);
  const d0 = dayStart(ctx.cursor);
  const d1 = dayStart(new Date(d0.getTime() + 36 * H));
  const d = best(d0, new Date(d1.getTime() - 1));
  if (w < 0 && d < 0) return null;
  const day = formatDayLabel(new Date(d0.getTime() + 12 * H), ctx.now);
  const stats = [];
  if (w >= 0) stats.push({ label: 'In the window', value: formatSpeed(v.gust[w]!), sub: formatWhen(v.times[w]!, ctx.now) });
  if (d >= 0) stats.push({ label: day, value: formatSpeed(v.gust[d]!), sub: formatWhen(v.times[d]!, v.times[d]!) });
  return { kind: 'stats', title: 'STRONGEST GUSTS', stats };
}

function shiftCard(v: PinWind, ctx: DetailContext): Card {
  const s = directionShift(v.times, v.dir, v.speed, ctx.index);
  if (!s || s.at > ctx.end) {
    const d = v.dir[ctx.index]!;
    return { kind: 'status', icon: 'shift', text: `Direction steady: from the ${compass(d)} through this window` };
  }
  return {
    kind: 'status', icon: 'shift',
    text: `Direction shift: ${compass(s.fromDir)} to ${compass(s.toDir)} around ${formatWhen(s.at, ctx.cursor)}`,
    note: `From ${Math.round(s.fromDir) % 360}° to ${Math.round(s.toDir) % 360}°`,
  };
}

function calmCard(v: PinWind, ctx: DetailContext): Card {
  const threshold = Number(ctx.settings.calm ?? 15);
  const c = nextCalm(v.times, v.speed, threshold, ctx.index);
  const note = 'Your calm threshold, set in Layer settings';
  if (!c) return { kind: 'status', icon: 'calm', text: `No calm below ${threshold} km/h in the model’s hours`, note };
  const now = c.start.getTime() === v.times[ctx.index]!.getTime();
  return {
    kind: 'status', icon: 'calm',
    text: now ? `Calm now, below ${threshold} km/h, for about ${formatSpan(c.hours)}` : `Next calm below ${threshold} km/h: ${formatWhen(c.start, ctx.cursor)}, for about ${formatSpan(c.hours)}`,
    note,
  };
}

function hourly(v: PinWind, ctx: DetailContext): Card {
  const s = ctx.pin.series!;
  const rows: string[][] = [];
  v.times.forEach((t, k) => {
    if (t < ctx.start || t > ctx.end || !Number.isFinite(v.speed[k])) return;
    const s10 = s.values.wind_speed_10m?.[k] ?? NaN;
    rows.push([
      formatWhen(t, ctx.cursor),
      formatSpeed(v.speed[k]!),
      formatSpeed(v.gust[k]!),
      formatBearing(compass(v.dir[k]!), v.dir[k]!),
      Number.isFinite(s10) ? formatSpeed(s10) : '–',
    ]);
  });
  return { kind: 'expandable', title: 'Hourly detail', caption: 'Speed, gusts and direction by hour', header: ['Time', 'Speed', 'Gusts', 'From', 'Model 10 m'], rows };
}

export function windDetails(v: PinWind | null, ctx: DetailContext, ground = 0): Card[] {
  if (!v || ctx.index < 0 || !Number.isFinite(v.speed[ctx.index])) return [];
  // The headline always describes the present (Kaden, Nov 16), not the cursor.
  let present = -1;
  v.times.forEach((t, k) => { if (Number.isFinite(v.speed[k]) && (present < 0 || Math.abs(t.getTime() - ctx.now.getTime()) < Math.abs(v.times[present]!.getTime() - ctx.now.getTime()))) present = k; });
  const cards: Card[] = [headline(v, present, ctx.now), nowCard(v, ctx)];
  const be = byElevation(v, ctx, ground);
  if (be) cards.push(be);
  const sg = strongest(v, ctx);
  if (sg) cards.push(sg);
  cards.push(shiftCard(v, ctx), calmCard(v, ctx), hourly(v, ctx));
  cards.push({ kind: 'later', text: 'Station wind for the past, and a probability range · come with stations and ensembles' });
  return cards;
}

/** In view: the strongest gust on screen and where, and the prevailing direction (by compass point, weighted by speed). */
export function windInView(view: ViewSample): string | null {
  const cells = view.cells.filter((c) => Number.isFinite(c.value));
  if (!cells.length) return null;
  const top = cells.reduce((a, b) => (b.value > a.value ? b : a));
  const weight = new Map<string, number>();
  for (const c of cells) if (c.second !== undefined && Number.isFinite(c.second)) { const k = compass(c.second); weight.set(k, (weight.get(k) ?? 0) + c.value); }
  const prevailing = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const n = view.nameAt(top.lon, top.lat);
  return `In view: strongest ${formatSpeed(top.value)} gusts${n ? ` near ${n}` : ''}${prevailing ? ` · prevailing ${prevailing}` : ''}`;
}
