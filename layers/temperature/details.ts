// Temperature details (v8 20-TempUp, 21-TempScroll) and settings (22).
// Every number comes from the pin's series: the model's profile at the pin's
// cell, read at the pin's ground height, at real model hours.
import { rampColor } from '../../core/color/ramp';
import { dewPoint } from '../../core/temperature/feels-like';
import { profileAt, isComplete } from '../../core/temperature/profile';
import { crossings as rawCrossings, type Crossing } from '../../core/time/crossings';

/** Crossings to the nearest hour: they are "about", from hourly model steps. */
const crossings = (...a: Parameters<typeof rawCrossings>): Crossing[] => rawCrossings(...a).map((c) => ({ ...c, time: new Date(Math.round(c.time.getTime() / 3_600_000) * 3_600_000) }));
import { isDaylight } from '../../core/time/sun';
import { dayStart } from '../../core/time/window';
import { formatDayLabel, formatDegrees, formatElevation, formatElevationNumber, formatSpeed, formatTemp, formatTempNumber, formatTempSigned, formatWhen, tempValue, unitLabel } from '../../core/units/format';
import type { Card, DetailContext, Setting, ViewSample } from '../contract';
import { temperatureRamp } from './fill';

export interface PinValues { times: Date[]; temp: number[]; feels: number[]; kind: string[]; freezing: (number | null)[] }

const H = 3_600_000;
const ramp = temperatureRamp();
const rgba = (c: number, a: number) => { const [r, g, b] = rampColor(ramp, c); return `rgba(${r},${g},${b},${a})`; };
const about = (t: Date, ref: Date) => `about ${formatWhen(t, ref)}`;

export const settings: Setting[] = [
  { key: 'map', title: 'MAP SHOWS', kind: 'segmented', options: [{ value: 'air', label: 'Air temperature' }, { value: 'feels', label: 'Feels-like' }], default: 'air' },
  { key: 'freezingLine', title: 'Freezing level line', kind: 'toggle', default: true },
];
export const settingsNote = 'Always 2 m above the terrain, corrected per pixel.';

function headline(v: PinValues, i: number, now: Date): Card {
  const t = v.temp[i]!;
  const parts: string[] = [];
  const f = v.feels[i]!;
  if (v.kind[i] === 'wind chill' || v.kind[i] === 'humidex') parts.push(`Feels like ${formatTempNumber(f)} (${v.kind[i]}).`);
  else parts.push('Feels like the air temperature.');
  const cross = crossings(v.times, v.temp, 0);
  const before = [...cross].reverse().find((c) => c.time <= v.times[i]!);
  const after = cross.find((c) => c.time > v.times[i]!);
  if (t < 0) parts.push(before ? `Below freezing since ${about(before.time, v.times[i]!)}.` : after ? `Below freezing until ${about(after.time, v.times[i]!)}.` : 'Below freezing through the model’s hours.');
  else parts.push(after ? `Below freezing from ${about(after.time, v.times[i]!)}.` : before ? `Above freezing since ${about(before.time, v.times[i]!)}.` : 'Above freezing through the model’s hours.');
  void now;
  return { kind: 'headline', value: formatTemp(t), sentence: parts.join(' ') };
}

function today(v: PinValues, ctx: DetailContext): Card {
  const d0 = dayStart(ctx.cursor);
  const d1 = dayStart(new Date(d0.getTime() + 36 * H));
  const idx = v.times.flatMap((t, k) => (t >= d0 && t < d1 && Number.isFinite(v.temp[k]) ? [k] : []));
  const s = ctx.pin.series!;
  const fl = v.freezing[ctx.index];
  const stats = [];
  if (idx.length) {
    const lo = idx.reduce((a, b) => (v.temp[b]! < v.temp[a]! ? b : a));
    const hi = idx.reduce((a, b) => (v.temp[b]! > v.temp[a]! ? b : a));
    stats.push({ label: 'Low', value: formatTemp(v.temp[lo]!), sub: formatWhen(v.times[lo]!, v.times[lo]!) });
    stats.push({ label: 'High', value: formatTempSigned(v.temp[hi]!), sub: formatWhen(v.times[hi]!, v.times[hi]!) });
  }
  stats.push({ label: 'Freezing level', value: fl === null || fl === undefined ? '–' : formatElevationNumber(Math.round(fl / 10) * 10), unit: fl === null || fl === undefined ? 'none in the column' : unitLabel('elevation') });
  // Humidity over the day (model, 2 m), with the dew point range under it.
  const rh = idx.map((k) => s.values.relative_humidity_2m?.[k] ?? NaN).filter(Number.isFinite);
  const dew = idx.flatMap((k) => { const t2 = s.values.temperature_2m?.[k] ?? NaN, r = s.values.relative_humidity_2m?.[k] ?? NaN; return Number.isFinite(t2) && Number.isFinite(r) ? [dewPoint(t2, r)] : []; });
  if (rh.length) {
    const lo = Math.round(Math.min(...rh)), hi = Math.round(Math.max(...rh));
    stats.push({
      label: 'Humidity', value: lo === hi ? `${hi}%` : `${lo}–${hi}%`,
      sub: dew.length ? `dew point ${formatDegrees(Math.min(...dew), false)} to ${formatDegrees(Math.max(...dew), false)}` : undefined,
    });
  }
  // Day and night averages, split at sunrise and sunset at the pin.
  const day = idx.filter((k) => isDaylight(v.times[k]!, s.lat, s.lon)).map((k) => v.temp[k]!);
  const night = idx.filter((k) => !isDaylight(v.times[k]!, s.lat, s.lon)).map((k) => v.temp[k]!);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const notes = [];
  if (day.length) notes.push(`Daytime average ${formatTempSigned(avg(day))}`);
  if (night.length) notes.push(`night-time average ${formatTempSigned(avg(night))}`);
  const label = formatDayLabel(new Date(d0.getTime() + 12 * H), ctx.now);
  return {
    kind: 'stats', title: label === 'Today' ? 'TODAY' : label.toUpperCase(),
    // Say so when the model covers only part of the day.
    meta: idx.length && idx.length < 24 ? `${idx.length} model hours` : undefined,
    stats, note: notes.join(' · ') || undefined,
  };
}

function byElevation(v: PinValues, ctx: DetailContext): Card | null {
  const p = profileAt(ctx.pin.series!.values, ctx.index);
  if (!isComplete(p)) return null;
  const points = Array.from(p.gh, (gh, k) => ({ elevation: gh, value: tempValue(p.temp[k]!), color: rgba(p.temp[k]!, 1) })).filter((x) => x.elevation >= -50);
  const t = v.temp[ctx.index]!;
  return {
    kind: 'value-elevation', title: 'BY ELEVATION', meta: `at ${formatWhen(ctx.cursor, ctx.now)}`, points, zero: true, zeroAt: tempValue(0), unit: unitLabel('temp'),
    you: { elevation: Math.max(0, ctx.pin.elevation ?? 0), value: tempValue(t), label: `You · ${formatTemp(t)}` },
  };
}

function aboveBelow(v: PinValues, ctx: DetailContext): Card {
  const z = Math.max(0, ctx.pin.elevation ?? 0);
  const inWin = v.times.map((t, k) => ({ t, k })).filter(({ t }) => t >= new Date(ctx.start.getTime() - H) && t <= new Date(ctx.end.getTime() + H));
  const cross = crossings(v.times, v.temp, 0).filter((c) => c.time >= ctx.start && c.time <= ctx.end);
  const next = cross.find((c) => c.time >= ctx.cursor) ?? cross[cross.length - 1];
  const hours = Math.round((ctx.end.getTime() - ctx.start.getTime()) / H);
  return {
    kind: 'elevation-time', title: `ABOVE OR BELOW ${formatTemp(0)} AT EACH ELEVATION`, meta: `same ${hours} h as the chart`,
    times: inWin.map((x) => x.t), level: inWin.map((x) => v.freezing[x.k] ?? null),
    above: { label: `Below ${formatTemp(0)}`, color: rgba(-10, 0.3) }, below: { label: `Above ${formatTemp(0)}`, color: rgba(14, 0.3) },
    you: { elevation: z, label: `You ${formatElevation(z)}` },
    marker: next ? { time: next.time, text: `${next.dir === 'down' ? 'Below' : 'Above'} ${formatTemp(0)} from ${formatWhen(next.time, ctx.cursor)}` } : undefined,
  };
}

function freezeThaw(v: PinValues, ctx: DetailContext): Card {
  const s = ctx.pin.series!;
  const cross = crossings(v.times, v.temp, 0).filter((c) => c.time >= ctx.start && c.time <= ctx.end);
  if (!cross.length) {
    const t = v.temp[ctx.index]!;
    return { kind: 'status', icon: 'snowflake', text: `Freeze-thaw: none in this window · ${t < 0 ? 'below' : 'above'} ${formatTemp(0)} throughout the model’s hours here` };
  }
  const text = cross.map((c, n) => `${c.dir}${n === cross.length - 1 && c.time > ctx.now ? ' about' : ''} ${formatWhen(c.time, n ? cross[n - 1]!.time : ctx.start)}`).join(', ');
  // A refreeze at night after a thaw of 3 hours or more: a crust is likely.
  let note: string | undefined;
  cross.forEach((c, n) => {
    const prev = cross[n - 1];
    const thawHours = prev && prev.dir === 'up' ? (c.time.getTime() - prev.time.getTime()) / H : 0;
    if (c.dir === 'down' && !isDaylight(c.time, s.lat, s.lon) && thawHours >= 3) note = 'Snow surface likely crusted overnight';
  });
  return { kind: 'status', icon: 'snowflake', text: `Freeze-thaw: crossed ${formatTemp(0)} ${text}`, note };
}

function hourly(v: PinValues, ctx: DetailContext): Card {
  const s = ctx.pin.series!;
  const rows: string[][] = [];
  v.times.forEach((t, k) => {
    if (t < ctx.start || t > ctx.end || !Number.isFinite(v.temp[k])) return;
    const t2 = s.values.temperature_2m?.[k] ?? NaN;
    const rh = s.values.relative_humidity_2m?.[k] ?? NaN;
    const wind = s.values.wind_speed_10m?.[k] ?? NaN;
    const kind = v.kind[k] === 'air' ? '' : ` ${v.kind[k]}`;
    rows.push([
      formatWhen(t, ctx.cursor),
      formatTemp(v.temp[k]!),
      `${formatTempNumber(v.feels[k]!)}${kind}`,
      Number.isFinite(rh) ? `${Math.round(rh)}%` : '–',
      Number.isFinite(t2) && Number.isFinite(rh) ? formatDegrees(dewPoint(t2, rh), false) : '–',
      Number.isFinite(wind) ? formatSpeed(wind) : '–',
    ]);
  });
  return { kind: 'expandable', title: 'Hourly detail', caption: 'Humidity, dew point, feels-like index and the wind it used', header: ['Time', 'Air', 'Feels', 'Humidity', 'Dew point', 'Wind 10 m'], rows };
}

export function temperatureDetails(v: PinValues | null, ctx: DetailContext): Card[] {
  if (!v || ctx.index < 0 || !Number.isFinite(v.temp[ctx.index])) return [];
  // The headline always describes the present (Kaden, Nov 16), not the cursor.
  let present = -1;
  v.times.forEach((t, k) => { if (Number.isFinite(v.temp[k]) && (present < 0 || Math.abs(t.getTime() - ctx.now.getTime()) < Math.abs(v.times[present]!.getTime() - ctx.now.getTime()))) present = k; });
  const cards: Card[] = [headline(v, present, ctx.now), today(v, ctx)];
  const be = byElevation(v, ctx);
  if (be) cards.push(be);
  cards.push(aboveBelow(v, ctx), freezeThaw(v, ctx), hourly(v, ctx));
  cards.push({ kind: 'later', text: 'Probability range, 10th to 90th percentile · comes with ensembles' });
  return cards;
}

export function temperatureInView(view: ViewSample): string | null {
  const cells = view.cells.filter((c) => Number.isFinite(c.value));
  if (!cells.length) return null;
  const warm = cells.reduce((a, b) => (b.value > a.value ? b : a));
  const cold = cells.reduce((a, b) => (b.value < a.value ? b : a));
  const where = (c: { lon: number; lat: number }, prep: string) => { const n = view.nameAt(c.lon, c.lat); return n ? ` ${prep} ${n}` : ''; };
  return `In view: warmest ${formatTempSigned(warm.value)}${where(warm, 'at')} · coldest ${formatTempSigned(cold.value)}${where(cold, 'on')}`;
}
