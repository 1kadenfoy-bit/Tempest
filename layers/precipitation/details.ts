// Precipitation details (v8 15-PrecipUp, 16-PrecipScroll) and settings (17).
// Amounts and type come from the pin's model cell; the snow line and the
// freezing level from the same hour's profile (wet-bulb 0.5 °C and 0 °C).
import tokens from '../../design/tokens.json';
import { rampColor } from '../../core/color/ramp';
import { ratioFor, totalAtHeight, type SnowRatio } from '../../core/precip/by-elevation';
import { PRECIP_CUTOFF, precipType } from '../../core/precip/type';
import { freezingLevels, snowLines } from '../../core/temperature/profile';
import { crossings as rawCrossings, type Crossing } from '../../core/time/crossings';

/** Crossings to the nearest hour: they are "about", from hourly model steps. */
const crossings = (...a: Parameters<typeof rawCrossings>): Crossing[] => rawCrossings(...a).map((c) => ({ ...c, time: new Date(Math.round(c.time.getTime() / 3_600_000) * 3_600_000) }));
import { formatElevation, formatOneDecimal, formatWhen, formatWhole } from '../../core/units/format';
import type { BandsInfo, Card, DetailContext, Setting, ViewSample } from '../contract';
import { precipRamp } from './fill';

const H = 3_600_000;
const accent = tokens.data.precipitation.textAccent;

export const settings: Setting[] = [
  { key: 'type', title: 'TYPE SHOWN', kind: 'segmented', options: [{ value: 'all', label: 'All' }, { value: 'rain', label: 'Rain only' }, { value: 'snow', label: 'Snow only' }], default: 'all' },
  // HRDPS has no snow ratio of its own; Open-Meteo converts at a fixed 7:1.
  { key: 'ratio', title: 'SNOW RATIO', kind: 'segmented', options: [{ value: '7:1', label: '7:1' }, { value: 'kuchera', label: 'Kuchera' }, { value: '10:1', label: '10:1' }], default: '7:1' },
  // HRDPS's files carry no snow line of its own, so there is no "Model" choice.
  { key: 'line', title: 'LINE ON THE MAP', kind: 'segmented', options: [{ value: 'off', label: 'Off' }, { value: 'wetbulb', label: 'Snow line' }, { value: '0c', label: '0 °C' }], default: 'wetbulb' },
];
export const settingsNote = 'Nothing is drawn under 0.1 mm/h. The snow line is where the wet-bulb temperature falls to 0.5 °C.';

const ratioSetting = (ctx: DetailContext) => (ctx.settings.ratio as SnowRatio | undefined) ?? '7:1';

function typeAt(ctx: DetailContext, k: number) {
  const s = ctx.pin.series!;
  const p = s.values.precipitation?.[k] ?? NaN;
  if (!(p >= PRECIP_CUTOFF * s.stepHours)) return 'dry';
  return precipType(p, s.values.snowfall_water_equivalent?.[k] ?? 0);
}

function headline(ctx: DetailContext): Card {
  const s = ctx.pin.series!;
  const i = ctx.index;
  const now = typeAt(ctx, i);
  const parts: string[] = [];
  // The last change of type within 12 hours before the cursor.
  for (let k = i; k > 0 && s.times[i]!.getTime() - s.times[k]!.getTime() <= 12 * H; k--) {
    const a = typeAt(ctx, k - 1), b = typeAt(ctx, k);
    if (a !== b && a !== 'dry' && b !== 'dry' && b === now) { parts.push(`${a[0]!.toUpperCase() + a.slice(1)} turned to ${b} at ${formatWhen(s.times[k - 1]!, s.times[i]!)}.`); break; }
    if (a === 'dry' && b !== 'dry' && b === now) { parts.push(`Started about ${formatWhen(s.times[k - 1]!, s.times[i]!)}.`); break; }
  }
  // What comes next: two dry hours in a row ends it; the first wet hour starts it.
  if (now === 'dry') {
    const k = s.times.findIndex((t, j) => j > i && typeAt(ctx, j) !== 'dry');
    parts.push(k > 0 ? `${typeAt(ctx, k)[0]!.toUpperCase() + typeAt(ctx, k).slice(1)} starts about ${formatWhen(s.times[k - 1]!, s.times[i]!)}.` : 'Dry to the model’s end.');
  } else {
    const k = s.times.findIndex((t, j) => j > i && typeAt(ctx, j) === 'dry' && (j + 1 >= s.times.length || typeAt(ctx, j + 1) === 'dry'));
    parts.push(k > 0 ? `Eases by ${formatWhen(s.times[k - 1]!, s.times[i]!)}.` : 'Continues to the model’s end.');
  }
  return { kind: 'headline', value: now === 'dry' ? 'Dry' : now[0]!.toUpperCase() + now.slice(1), sentence: parts.join(' ') };
}

function nowStats(ctx: DetailContext, snow: (number | null)[], freezing: (number | null)[]): Card {
  const s = ctx.pin.series!;
  const i = ctx.index;
  const p = s.values.precipitation?.[i] ?? NaN;
  const rate = p / s.stepHours;
  const hasProfile = freezing.some((x) => x !== null) || snow.some((x) => x !== null);
  const level = (v: number | null | undefined, none: string) => (v === null || v === undefined ? { value: hasProfile ? none : '–', unit: hasProfile ? '' : 'loading' } : { value: formatWhole(Math.round(v / 10) * 10), unit: 'm' });
  const sl = level(snow[i], 'Sea level');
  const fl = level(freezing[i], 'None');
  return {
    kind: 'stats', title: 'NOW', stats: [
      { label: 'Rate', value: Number.isFinite(rate) ? (rate < PRECIP_CUTOFF ? '0' : formatOneDecimal(rate)) : '–', unit: 'mm/h' },
      { label: 'Snow line', value: sl.value, unit: sl.unit },
      { label: 'Freezing level', value: fl.value, unit: fl.unit },
    ],
  };
}

function totalsTable(ctx: DetailContext, bands: BandsInfo): Card {
  const s = ctx.pin.series!;
  const ratio = ratioSetting(ctx);
  const you = Math.max(0, ctx.pin.elevation ?? 0);
  const youBand = you < bands.valleyTop ? 'Valley' : you >= bands.alpineBottom ? 'Alpine' : 'Mid';
  const heights: Record<string, number> = {
    Alpine: youBand === 'Alpine' ? you : bands.alpineBottom + 300,
    Mid: youBand === 'Mid' ? you : Math.round((bands.valleyTop + bands.alpineBottom) / 2),
    Valley: youBand === 'Valley' ? you : Math.round(bands.valleyTop / 2),
  };
  // Columns are hours from now, mirrored around it.
  const now = new Date(Math.floor(ctx.now.getTime() / H) * H);
  const spans = [72, 48, 24, 6];
  const cell = (z: number, a: Date, b: Date) => {
    const t = totalAtHeight(s, z, a, b, ratio);
    if (!t.complete) return { parts: [{ text: '–', color: 'var(--ink-3)' }] };
    const parts = [];
    if (t.rainMm >= 0.5) parts.push({ text: formatWhole(t.rainMm), color: accent.rain });
    if (t.snowCm >= 0.5) parts.push({ text: formatWhole(t.snowCm), color: accent.snow });
    return { parts: parts.length ? parts : [{ text: '0', color: 'var(--ink-2)' }] };
  };
  const rows = (['Alpine', 'Mid', 'Valley'] as const).map((band) => ({
    label: band, you: band === youBand,
    cells: [
      ...spans.map((h) => cell(heights[band]!, new Date(now.getTime() - h * H), now)),
      ...[...spans].reverse().map((h) => cell(heights[band]!, now, new Date(now.getTime() + h * H))),
    ],
  }));
  const approx = bands.approximate ? '≈' : '';
  return {
    kind: 'table', title: 'TOTALS BY ELEVATION', meta: 'hours from now',
    groups: [{ label: 'Past, hours', columns: spans.map(String) }, { label: 'Next, hours', columns: [...spans].reverse().map(String) }],
    rows,
    note: [
      { text: 'Rain mm', color: accent.rain }, { text: ' · ' }, { text: 'snow cm', color: accent.snow },
      { text: ` · alpine above ${approx}${formatElevation(bands.alpineBottom)}, valley below ${approx}${formatElevation(bands.valleyTop)} · – outside the model run (past hours come with observed data)` },
    ],
  };
}

function rainOrSnow(ctx: DetailContext, snow: (number | null)[]): Card {
  const s = ctx.pin.series!;
  const z = Math.max(0, ctx.pin.elevation ?? 0);
  const keep = s.times.map((t, k) => ({ t, k })).filter(({ t }) => t >= new Date(ctx.start.getTime() - H) && t <= new Date(ctx.end.getTime() + H));
  // Where the snow line passes the pin's height (snow when the line is below it).
  const rel = s.times.map((_, k) => (snow[k] === null ? null : z - snow[k]!));
  const cross = crossings(s.times, rel, 0).filter((c) => c.time >= ctx.start && c.time <= ctx.end);
  const next = cross.find((c) => c.time >= ctx.cursor) ?? cross[cross.length - 1];
  const rgba = (t: 'rain' | 'snow') => { const [r, g, b] = rampColor(precipRamp(t), 2); return `rgba(${r},${g},${b},0.35)`; };
  const hours = Math.round((ctx.end.getTime() - ctx.start.getTime()) / H);
  return {
    kind: 'elevation-time', title: 'RAIN OR SNOW AT EACH ELEVATION', meta: `same ${hours} h as the chart`,
    times: keep.map((x) => x.t), level: keep.map((x) => snow[x.k] ?? null),
    above: { label: 'Snow', color: rgba('snow') }, below: { label: 'Rain', color: rgba('rain') },
    you: { elevation: z, label: `You ${formatElevation(z)}` },
    marker: next ? { time: next.time, text: `${next.dir === 'up' ? 'Snow' : 'Rain'} from ${formatWhen(next.time, ctx.cursor)}` } : undefined,
  };
}

export function precipDetails(ctx: DetailContext): Card[] {
  const s = ctx.pin.series;
  if (!s || ctx.index < 0) return [];
  const snow = snowLines(s);
  const freezing = freezingLevels(s);
  const cards: Card[] = [headline(ctx), nowStats(ctx, snow, freezing), totalsTable(ctx, ctx.bands)];
  if (snow.some((x) => x !== null) || freezing.some((x) => x !== null)) cards.push(rainOrSnow(ctx, snow));
  cards.push({ kind: 'later', text: 'Chance of precipitation · comes with ensembles' });
  return cards;
}

export function precipInView(view: ViewSample): string | null {
  if (!view.cells.length) return null;
  const top = view.cells.reduce((a, b) => (b.value > a.value ? b : a));
  const parts: string[] = [];
  if (top.value < PRECIP_CUTOFF) parts.push('dry everywhere');
  else {
    const kind = precipType(top.value, top.second ?? 0);
    const name = view.nameAt(top.lon, top.lat);
    parts.push(`heaviest ${formatOneDecimal(top.value)} mm/h ${kind}${name ? ` near ${name}` : ''}`);
  }
  if (view.freezing) parts.push(`freezing level ${formatWhole(Math.round(view.freezing[0] / 50) * 50)}–${formatElevation(Math.round(view.freezing[1] / 50) * 50)}`);
  return `In view: ${parts.join(' · ')}`;
}

/** First footer line: the snow ratio in use, and what Kuchera gives here for the window's snowy hours. */
export function precipFooter(ctx: DetailContext): string[] {
  const s = ctx.pin.series;
  const setting = ratioSetting(ctx);
  const label = setting === 'kuchera' ? 'Kuchera' : `${setting} (fixed)`;
  if (!s) return [`Snow ratio ${label}`];
  const z = Math.max(0, ctx.pin.elevation ?? 0);
  const k: number[] = [];
  s.times.forEach((t, i) => {
    if (t < ctx.start || t > ctx.end || typeAt(ctx, i) === 'dry' || typeAt(ctx, i) === 'rain') return;
    const r = ratioFor('kuchera', s, i, z);
    if (r !== null) k.push(r);
  });
  const range = k.length ? ` · Kuchera here ${Math.round(Math.min(...k))}–${Math.round(Math.max(...k))}:1` : '';
  return [`Snow ratio ${label}${setting === 'kuchera' ? range.replace(' · Kuchera here', ',') : range}`];
}

