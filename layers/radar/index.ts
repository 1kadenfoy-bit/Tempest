// The Radar layer: observed frames from the last 3 hours, drawn by their
// source in its own colours (an image layer). No v8 design yet, so every slot
// is the plainest version built from the shell's existing parts. The layer
// never sees the provider: the shell hands it the image's legend and, at the
// pin, what the cursor's frame shows there.
import { formatCursorTime, formatMinutesAgo, formatRate, formatRateRange, formatSnowRate, formatSnowRateRange } from '../../core/units/format';
import type { Card, DetailContext, ImageLegend, LayerSlots, PinData, RadarPoint, Readout, Setting, WindowSummary } from '../contract';

export type RadarShown = 'type' | 'rain' | 'snow';
export const DEFAULT_SHOWN: RadarShown = 'type';
const STEP_MIN = 6;

const shownOf = (set: Record<string, string | boolean>): RadarShown => (['type', 'rain', 'snow'].includes(String(set.shown)) ? set.shown as RadarShown : DEFAULT_SHOWN);

/** The bold value and its note for one frame at the pin. */
export function radarReadout(pin: PinData, now = new Date()): Readout {
  const r = pin.radar;
  const note = r?.time ? `radar · ${formatMinutesAgo(r.time, now)}` : undefined;
  if (!r || !r.frames.length) return { value: r?.point === 'offline' ? 'Radar needs a connection' : '…' };
  return { value: pointText(r.point), note };
}

export function pointText(p: RadarPoint | null | 'error' | 'offline'): string {
  if (p === null) return '…';
  if (p === 'offline') return 'Radar needs a connection';
  if (p === 'error') return 'Radar not reachable';
  if (p.covered === false) return 'Outside radar range';
  if (!p.detected) return 'Nothing seen';
  if (p.kind) return p.kind;
  if (p.rate !== null && p.unit) return p.unit === 'cm/h' ? `${formatSnowRate(p.rate)} snow` : `${formatRate(p.rate)} rain`;
  return 'Precipitation seen';
}

const stops = (colors: string[], hard: boolean) =>
  hard
    ? colors.map((c, i) => `${c} ${Math.round((i / colors.length) * 100)}% ${Math.round(((i + 1) / colors.length) * 100)}%`).join(', ')
    : colors.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`).join(', ');

/** The legend as the source draws it: its colours, its classes or its rate range. */
export function legendElement(doc: Document, legend: ImageLegend): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'legend legend-image';
  if (legend.kind === 'classes') {
    for (const g of legend.groups) {
      const item = doc.createElement('span');
      item.className = 'legend-item';
      const name = doc.createElement('span');
      name.className = 'legend-name';
      name.textContent = g.label;
      const bar = doc.createElement('span');
      bar.className = 'legend-bar legend-bar-steps';
      bar.style.background = g.colors.length > 1 ? `linear-gradient(90deg, ${stops(g.colors, true)})` : g.colors[0]!;
      bar.style.width = `${8 * g.colors.length}px`;
      item.append(name, bar);
      el.append(item);
    }
    return el;
  }
  const bar = doc.createElement('span');
  bar.className = 'legend-bar legend-bar-grow';
  bar.style.background = `linear-gradient(90deg, ${stops(legend.colors, false)})`;
  const range = doc.createElement('span');
  range.className = 'legend-range';
  range.textContent = legend.unit === 'cm/h' ? formatSnowRateRange(legend.low, legend.high) : formatRateRange(legend.low, legend.high);
  el.append(bar, range);
  return el;
}

/** Ticks for the frames across the window; the cursor's frame is under the needle. */
export function drawFrames(ctx: CanvasRenderingContext2D, w: number, h: number, pin: PinData, start: Date, end: Date): void {
  ctx.clearRect(0, 0, w, h);
  const frames = pin.radar?.frames ?? [];
  const css = getComputedStyle(ctx.canvas);
  const span = end.getTime() - start.getTime();
  ctx.fillStyle = css.getPropertyValue('--ink-3').trim();
  for (const f of frames) {
    const x = ((f.getTime() - start.getTime()) / span) * w;
    if (x < 0 || x > w) continue;
    ctx.fillRect(Math.round(x) - 1, h - 10, 2, 10);
  }
  if (!frames.length) {
    ctx.fillStyle = css.getPropertyValue('--ink-2').trim();
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pin.radar?.point === 'offline' ? 'Radar needs a connection' : 'Finding the radar frames…', w / 4, h / 2);
  }
}

export function radarSummary(pin: PinData): WindowSummary {
  const f = pin.radar?.frames ?? [];
  if (!f.length) return { kind: 'whole', lines: ['Observed radar'], label: 'Online only' };
  return {
    kind: 'whole',
    lines: [`${f.length} frames · every ${STEP_MIN} min`],
    label: `Observed · ${formatCursorTime(f[0]!)} to ${formatCursorTime(f[f.length - 1]!)}`,
  };
}

export function radarDetails(ctx: DetailContext): Card[] {
  const r = ctx.pin.radar;
  const time = r?.time ?? null;
  const value = pointText(r?.point ?? null);
  const point = r && typeof r.point === 'object' ? r.point : null;
  const cards: Card[] = [{
    kind: 'headline',
    value,
    sentence: time
      ? `What the radar saw at the pin at ${formatCursorTime(time)}, ${formatMinutesAgo(time, ctx.now)}. Observed, not a forecast.`
      : 'What the radar saw at the pin. Observed, not a forecast.',
  }];
  if (r?.frames.length) {
    const first = r.frames[0]!, last = r.frames[r.frames.length - 1]!;
    cards.push({
      kind: 'stats', title: 'Frames', meta: 'ECCC radar composite',
      stats: [
        { label: 'This frame', value: time ? formatCursorTime(time) : '–' },
        { label: 'Newest', value: formatMinutesAgo(last, ctx.now) },
        { label: 'Kept', value: String(r.frames.length), sub: `since ${formatCursorTime(first)}` },
      ],
    });
  }
  if (point?.covered === false) cards.push({ kind: 'status', icon: 'info', text: 'The pin is outside radar range', note: 'Grey areas on the map are beyond the radars’ reach: no radar there is not the same as dry.' });
  cards.push({
    kind: 'status', icon: 'info', text: 'Radar can miss mountain weather',
    note: 'Beams pass over deep valleys and are blocked by ridges, so “nothing seen” is not proof of dry weather, and low snow can be missed. The grey veil shows only where the radars’ range ends.',
  });
  return cards;
}

const settings: Setting[] = [
  { key: 'shown', title: 'SHOWN', kind: 'segmented', options: [{ value: 'type', label: 'Type' }, { value: 'rain', label: 'Rain rate' }, { value: 'snow', label: 'Snow rate' }], default: DEFAULT_SHOWN },
  { key: 'coverage', title: 'Grey out beyond radar range', kind: 'toggle', default: true },
];

/** The layer's slots. `legendFor` is the image's own legend for what is shown (from its source, through the shell). */
export function radarLayer(legendFor: (shown: RadarShown) => ImageLegend, shownNow: () => RadarShown): LayerSlots {
  const typeLegend = legendFor('type');
  const swatches = typeLegend.kind === 'classes'
    ? typeLegend.groups.slice(0, 3).map((g) => `linear-gradient(90deg, ${stops(g.colors, true)})`)
    : [];
  return {
    id: 'radar',
    title: 'Radar',
    swatches,
    pinNeeds: [],
    saveNeeds: [],
    chartLabel: 'Radar frames from the last 3 hours. Drag to move through them.',
    legend: (doc) => legendElement(doc, legendFor(shownNow())),
    readout: (pin) => radarReadout(pin),
    summary: (pin) => radarSummary(pin),
    drawChart: (ctx, w, h, pin, start, end) => drawFrames(ctx, w, h, pin, start, end),
    details: (ctx) => radarDetails(ctx),
    inView: () => null,
    footer: () => ['ECCC radar composite · 1 km · every 6 min · shown in ECCC’s colours', 'Online only: its source does not allow saving'],
    settings,
    settingsNote: 'Colours and classes are ECCC’s own, shown as issued. Type names rain, snow, mixed, freezing rain and hail; the rates are ECCC’s estimates from the radar echo.',
    frames: { windowHours: 3, loopHours: 1, stepMinutes: STEP_MIN },
  };
}

export { shownOf };
