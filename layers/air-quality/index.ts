// The Air quality layer: wildfire smoke (or all fine particles, PM2.5) near
// the ground for the hour under the cursor, the nearest station's Air Quality
// Health Index as ECCC issues it, and BC Wildfire Service's fires as issued.
// Fills the template's slots from what the app holds (core/air/state); never
// sees a provider. No v8 design exists: every slot is the plainest version
// built from the shell's existing parts.
import { PM25_STOPS, aqhiShown, pm25Position } from '../../core/air/pm25';
import { airIndex, airState, airValue, aqhiForecastAt, type AirState } from '../../core/air/state';
import { fireTitle, firesNear } from '../../core/air/fires';
import { formatConcentration, formatCursorTime, formatDateTime, formatDistance, formatTimeRange, formatWhen } from '../../core/units/format';
import { formatRunAge } from '../../core/time/run-age';
import type { Card, DetailContext, LayerSlots, Readout, Setting, WindowSummary } from '../contract';
import { airColor, airGradient } from './fill';

export { airRenderStyle, airDrawField } from './fill';

export const id = 'air-quality';
export const title = 'Air quality';
/** Fires this close to the pin are named in its details. */
const NEAR_KM = 50;

export const SETTINGS: Setting[] = [
  {
    key: 'shown', title: 'MAP SHOWS', kind: 'segmented', default: 'smoke',
    options: [{ value: 'smoke', label: 'Wildfire smoke' }, { value: 'all', label: 'All PM2.5' }],
  },
  { key: 'fires', title: 'Wildfires (BC Wildfire Service)', kind: 'toggle', default: true },
  { key: 'perimeters', title: 'Fire perimeters', kind: 'toggle', default: true },
];

/** What the numbers are, in words. */
const what = (s: AirState) => (s.source?.variable === 'pm2_5_smoke' ? 'smoke' : 'PM2.5');
const whatLong = (s: AirState) => (s.source?.variable === 'pm2_5_smoke' ? 'Wildfire smoke (PM2.5) near the ground' : 'Fine particles (PM2.5) near the ground, from every source');

export function legend(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'legend legend-scale';
  el.setAttribute('aria-label', 'PM2.5 in micrograms per cubic metre, ECCC’s scale from 1 to 500');
  const unit = doc.createElement('span');
  unit.className = 'legend-unit';
  unit.textContent = `${airState().source?.variable === 'pm2_5' ? 'PM2.5' : 'Smoke'} µg/m³`;
  const scale = doc.createElement('span');
  scale.className = 'legend-track';
  const bar = doc.createElement('span');
  bar.className = 'legend-bar legend-bar-wide';
  bar.style.background = airGradient();
  const ticks = doc.createElement('span');
  ticks.className = 'legend-ticks';
  // The bar runs to ECCC's top step (500, where it saturates); the last label sits at 250.
  for (const v of [1, 30, 60, 100, 250]) {
    const t = doc.createElement('span');
    t.style.left = `${pm25Position(v) * 100}%`;
    t.textContent = String(v);
    ticks.append(t);
  }
  scale.append(bar, ticks);
  el.append(unit, scale);
  return el;
}

export function readout(): Readout {
  const s = airState();
  if (!s.source) return { value: '…' };
  const i = airIndex(s.series, s.cursor);
  const v = airValue(s.series, i);
  if (v === null) return { value: s.problem ?? (s.series ? '–' : '…') };
  return { value: formatConcentration(v), note: `${what(s)} · ${s.source.short} ${s.source.gridKm} km` };
}

export function summary(start: Date, end: Date): WindowSummary {
  const s = airState();
  const ser = s.series;
  if (!ser) return { kind: 'whole', lines: [s.problem ?? '…'], label: '' };
  const idx = ser.times.flatMap((t, i) => (t >= start && t <= end && airValue(ser, i) !== null ? [i] : []));
  if (!idx.length) return { kind: 'whole', lines: ['–'], label: 'Outside the source’s hours' };
  const peak = idx.reduce((a, b) => (airValue(ser, b)! > airValue(ser, a)! ? b : a));
  const low = idx.reduce((a, b) => (airValue(ser, b)! < airValue(ser, a)! ? b : a));
  const range = formatTimeRange(ser.times[idx[0]!]!, ser.times[idx[idx.length - 1]!]!);
  // Under ECCC's lowest step the map draws nothing: say so in words.
  if (airValue(ser, peak)! < PM25_STOPS[0]!.value) return { kind: 'whole', lines: [`No ${what(s)} above 1 µg/m³`], label: range };
  return {
    kind: 'whole',
    lines: [`${s.source?.variable === 'pm2_5_smoke' ? 'Smoke' : 'PM2.5'} up to ${formatConcentration(airValue(ser, peak)!)}`, `lowest ${formatConcentration(airValue(ser, low)!)}`],
    label: `Peak ${formatCursorTime(ser.times[peak]!)} · ${range}`,
  };
}

const css = (ctx: CanvasRenderingContext2D, name: string, fallback: string) => getComputedStyle(ctx.canvas).getPropertyValue(name).trim() || fallback;

/** Hourly bars at the pin, coloured by the map's scale; a dashed guide at 30 and 60 µg/m³ when the bars reach them. */
export function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, start: Date, end: Date): void {
  ctx.clearRect(0, 0, w, h);
  const s = airState();
  const ser = s.series;
  const span = end.getTime() - start.getTime();
  const x = (t: number) => ((t - start.getTime()) / span) * w;
  const barW = (3_600_000 / span) * w;
  const idx = ser ? ser.times.flatMap((t, i) => (x(t.getTime()) >= -barW && x(t.getTime()) <= w + barW && airValue(ser, i) !== null ? [i] : [])) : [];
  if (!ser || !idx.length) {
    ctx.fillStyle = css(ctx, '--ink-2', '#A9B1BA');
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(!s.source || !ser ? (s.problem ?? 'Loading air quality at the pin…') : 'No values for these hours', w / 4, h / 2);
    return;
  }
  const top = 14;
  const max = Math.max(35, ...idx.map((i) => airValue(ser, i)!)) * 1.08;
  const y = (v: number) => h - (Math.min(v, max) / max) * (h - top);
  const gap = barW > 4 ? 1 : 0;
  for (const i of idx) {
    const v = airValue(ser, i)!;
    const right = x(ser.times[i]!.getTime() + 1_800_000);
    const by = y(v);
    ctx.fillStyle = v < PM25_STOPS[0]!.value ? css(ctx, '--ink-3', '#8A939D') : airColor(v);
    ctx.fillRect(right - barW + gap / 2, Math.min(by, h - 1), Math.max(1, barW - gap), Math.max(1, h - by));
  }
  // Guides at ECCC's 30 and 60 µg/m³ steps, labelled, when the bars reach near them.
  ctx.strokeStyle = ctx.fillStyle = css(ctx, '--ink-2', '#A9B1BA');
  ctx.font = '400 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  let lastY = Infinity;
  for (const g of [30, 60, 100, 250]) {
    if (g > max) continue;
    const gy = Math.round(y(g)) + 0.5;
    // Labels need room: a guide too close to the one below is left out.
    if (lastY - gy < 16) continue;
    lastY = gy;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    ctx.fillText(String(g), w - 4, gy - 1);
  }
  ctx.setLineDash([]);
  if (Math.max(...idx.map((i) => airValue(ser, i)!)) < PM25_STOPS[0]!.value) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.fillText(`All under 1 µg/m³`, w / 4, h / 2);
  }
}

function aqhiCards(s: AirState, t: Date): Card[] {
  const a = s.aqhi;
  if (a === 'error') return [{ kind: 'status', icon: 'info', text: 'ECCC’s Air Quality Health Index could not be reached' }];
  if (!a) return [{ kind: 'status', icon: 'info', text: 'Loading the Air Quality Health Index…' }];
  const cards: Card[] = [];
  const o = a.observed;
  if (o) {
    const sh = aqhiShown(o.value);
    cards.push({
      kind: 'status', icon: 'info',
      text: `AQHI ${sh.text} · ${sh.risk}, observed at ${o.station}`,
      note: `${o.timeText || formatDateTime(o.time)} · ${formatDistance(o.km, undefined, true)} from the pin · ECCC’s value ${o.value} · as issued`,
    });
  } else {
    cards.push({ kind: 'status', icon: 'info', text: 'No AQHI station within 100 km of the pin', note: 'ECCC measures the AQHI at stations in towns and cities.' });
  }
  const f = a.forecast;
  const at = aqhiForecastAt(f, t);
  if (f && at) {
    const sh = aqhiShown(at.value);
    cards.push({ kind: 'status', icon: 'info', text: `Forecast AQHI ${sh.text} · ${sh.risk} for ${formatCursorTime(at.time)}`, note: `${f.station} · issued ${formatDateTime(f.published)} by ECCC · as issued` });
  } else if (f) {
    const first = f.hours[0], last = f.hours[f.hours.length - 1];
    cards.push({ kind: 'status', icon: 'info', text: `No AQHI forecast for ${formatCursorTime(t)}`, note: first && last ? `${f.station}’s forecast covers ${formatTimeRange(first.time, last.time)} · issued ${formatDateTime(f.published)}` : undefined });
  }
  return cards;
}

function fireCards(s: AirState, t: Date, now: Date): Card[] {
  if (!s.firesShown) return [];
  if (!s.fires) return [{ kind: 'status', icon: 'info', text: 'Loading BC Wildfire Service’s fires…' }];
  const at = s.pin;
  if (!at) return [];
  const near = firesNear(s.fires.list, at, t, now, NEAR_KM);
  const when = t.getTime() >= now.getTime() - 3_600_000 ? 'now' : `on ${formatCursorTime(t).split(' ')[0]}`;
  const fetched = `BC Wildfire Service · fetched ${formatWhen(s.fires.fetchedAt, now)}${s.fires.kept ? ' (copy kept on the phone)' : ''}`;
  if (!near.length) return [{ kind: 'status', icon: 'calm', text: `No wildfires burning within ${formatDistance(NEAR_KM, undefined, true)} ${when}`, note: fetched }];
  const n = near[0]!;
  return [{
    kind: 'status', icon: 'info',
    text: `${near.length} wildfire${near.length === 1 ? '' : 's'} burning within ${formatDistance(NEAR_KM, undefined, true)} ${when}`,
    note: `Nearest: ${fireTitle(n.fire)}, ${formatDistance(n.km, undefined, true)} ${n.dir} · ${n.fire.status} (latest) · tap a fire on the map · ${fetched}`,
  }];
}

export function details(ctx: DetailContext): Card[] {
  const s = airState();
  const t = ctx.cursor;
  const cards: Card[] = [];
  if (!s.source) return [{ kind: 'status', icon: 'info', text: 'Loading air quality…' }];
  const ser = s.series;
  const i = airIndex(ser, t);
  const v = airValue(ser, i);
  const seg = ser?.segments?.find((x) => t >= x.from && t <= x.to);
  const run = seg?.run ?? s.run;
  const from = s.source.model + (run && s.source.id === 'eccc' ? ` ${String(run.getUTCHours()).padStart(2, '0')}Z run${seg?.kind === 'earlier' ? ' (an earlier run)' : ''}` : '');
  if (v !== null) {
    cards.push({ kind: 'headline', value: formatConcentration(v), sentence: `${whatLong(s)} at the pin, ${formatCursorTime(t)}, from ${from} (${s.source.gridKm} km cells). A model forecast, not a measurement.` });
  } else {
    cards.push({ kind: 'status', icon: 'info', text: s.problem ?? (ser ? `No ${what(s)} value for ${formatCursorTime(t)}` : 'Loading the values at the pin…') });
  }
  if (ser) {
    const inWin = ser.times.flatMap((x, k) => (x >= ctx.start && x <= ctx.end && airValue(ser, k) !== null ? [k] : []));
    if (inWin.length) {
      const peak = inWin.reduce((a, b) => (airValue(ser, b)! > airValue(ser, a)! ? b : a));
      const mean = inWin.reduce((a, k) => a + airValue(ser, k)!, 0) / inWin.length;
      cards.push({
        kind: 'stats', title: 'At the pin', meta: formatTimeRange(ser.times[inWin[0]!]!, ser.times[inWin[inWin.length - 1]!]!),
        stats: [
          { label: 'Now', value: v === null ? '–' : formatConcentration(v, false), unit: 'µg/m³', sub: formatCursorTime(t) },
          { label: 'Peak', value: formatConcentration(airValue(ser, peak)!, false), unit: 'µg/m³', sub: formatCursorTime(ser.times[peak]!) },
          { label: 'Average', value: formatConcentration(mean, false), unit: 'µg/m³', sub: `${inWin.length} h` },
        ],
      });
    }
  }
  cards.push(...aqhiCards(s, t), ...fireCards(s, t, ctx.now));
  if (ser) {
    const rows = ser.times.flatMap((x, k) => (x >= ctx.start && x <= ctx.end ? [[formatCursorTime(x), airValue(ser, k) === null ? '–' : formatConcentration(airValue(ser, k)!, false), segLabel(ser, k)]] : []));
    if (rows.length) cards.push({ kind: 'expandable', title: 'Hour by hour', caption: `${whatLong(s)}, µg/m³, at the pin`, header: ['Hour', 'µg/m³', 'From'], rows });
  }
  const a = s.aqhi;
  if (a && a !== 'error' && a.forecast?.hours.length) {
    cards.push({
      kind: 'expandable', title: 'AQHI forecast, as issued', caption: `${a.forecast.station} · issued ${formatDateTime(a.forecast.published)} by ECCC`,
      header: ['Hour', 'AQHI', 'Risk'], rows: a.forecast.hours.map((x) => { const sh = aqhiShown(x.value); return [formatCursorTime(x.time), sh.text, sh.risk]; }),
    });
  }
  return cards;
}

function segLabel(ser: NonNullable<AirState['series']>, k: number): string {
  const t = ser.times[k]!;
  const seg = ser.segments?.find((x) => t >= x.from && t <= x.to);
  if (!seg) return ser.label.model;
  return `${String(seg.run.getUTCHours()).padStart(2, '0')}Z ${seg.run.toISOString().slice(5, 10)}`;
}

/** In view: the highest value on screen, and where. */
export function inView(nameAt: (lon: number, lat: number) => string | null): string | null {
  const s = airState();
  if (!s.view.length) return null;
  const top = s.view.reduce((a, b) => (b.value > a.value ? b : a));
  if (top.value < PM25_STOPS[0]!.value) return `In view: no ${what(s)} above 1 µg/m³ at this hour`;
  const name = nameAt(top.lon, top.lat);
  return `In view: ${what(s)} up to ${formatConcentration(top.value)}${name ? ` near ${name}` : ''}`;
}

export function footer(now = new Date()): string[] {
  const s = airState();
  if (!s.source) return [];
  const lines = [`${s.source.label} · ${s.source.gridKm} km cells${s.run && s.source.id === 'eccc' ? ` · ${formatRunAge(s.run, now)}` : s.fetchedAt ? ` · fetched ${formatWhen(s.fetchedAt, now)}` : ''}`];
  lines.push('AQHI: ECCC, as issued · Fires: BC Wildfire Service, as issued');
  return lines;
}

export function settingsNote(): string {
  return 'Smoke and fine particles are model forecasts on a grid: ECCC’s RAQDPS (10 km, 72 h ahead, with FireWork’s wildfire smoke), or CAMS global (about 40 km, all particles only) from the source button. Colours follow ECCC’s own PM2.5 scale, blended. The Air Quality Health Index and the fires are shown exactly as ECCC and BC Wildfire Service issue them: values, status words and dates are theirs; Tempest only chooses which fires were burning at the cursor’s time from their issued dates. Online only; the latest fires are kept on the phone.';
}

export const airQuality: LayerSlots = {
  id,
  title,
  swatches: [airGradient()],
  pinNeeds: [],
  // Online only: GeoMet asks not to be bulk-copied, and the fires are kept on the phone by themselves.
  saveNeeds: [],
  chartLabel: 'Smoke or fine particles at the pin across the window: hourly bars in the map’s colours. Drag to move through time.',
  legend,
  readout: () => readout(),
  summary: (_pin, start, _cursor, end) => summary(start, end),
  drawChart: (ctx, w, h, _pin, start, end) => drawChart(ctx, w, h, start, end),
  details,
  inView: (view) => inView(view.nameAt),
  footer: (ctx) => footer(ctx.now),
  settings: SETTINGS,
  get settingsNote() { return settingsNote(); },
};
