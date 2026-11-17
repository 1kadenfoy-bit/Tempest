// The avalanche layer: forecast regions coloured by the danger rating for the
// cursor's day, as issued. Fills its template slots from what the app holds
// (core/avalanche); never sees a provider. Ratings, words and colours are the
// issuer's: nothing here re-scores, recolours or summarises them. There is no
// v8 design for this layer; it is built from the template's existing parts.
import {
  BANDS, BAND_NAMES, DANGER_COLOURS, LEVELS, avalancheData, avalancheFailed, avalanchePin, bulletinAt, dayAt, localDate, ratingFor, ratingLabel, shownAt, titleParts,
  type BandChoice, type DangerValue, type Rating,
} from '../../core/avalanche/danger';
import { formatCursorTime, formatDateTime, formatWhen } from '../../core/units/format';
import type { Card, DetailContext, LayerSlots, Readout, Setting, WindowSummary } from '../contract';

export const id = 'avalanche';
export const title = 'Avalanche';

/** The layer's settings (plainest form): which band colours the map, field reports and their age. */
export const SETTINGS: Setting[] = [
  {
    key: 'band', title: 'MAP COLOUR FROM', kind: 'segmented', default: 'highest',
    options: [{ value: 'highest', label: 'Highest' }, { value: 'alp', label: 'Alpine' }, { value: 'tln', label: 'Treeline' }, { value: 'btl', label: 'Below' }],
  },
  { key: 'reports', title: 'Field reports (Mountain Information Network)', kind: 'toggle', default: true },
  {
    key: 'age', title: 'REPORTS FROM THE LAST', kind: 'segmented', default: '7',
    options: [{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }],
  },
];

export const bandChoice = (s: Record<string, string | boolean>): BandChoice => {
  const v = s.band;
  return v === 'alp' || v === 'tln' || v === 'btl' ? v : 'highest';
};

/** The legend: the scale's five levels in their colours, then the seasonal and empty states. */
export function legend(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'legend legend-danger';
  el.setAttribute('aria-label', 'Avalanche danger: 1 Low, 2 Moderate, 3 Considerable, 4 High, 5 Extreme; Early season or Spring; No rating; no forecast');
  const item = (value: DangerValue | 'none', text: string, name: string) => {
    const s = doc.createElement('span');
    s.className = 'legend-item';
    s.title = name;
    const sw = doc.createElement('span');
    sw.className = 'danger-swatch';
    if (value === 'none') sw.dataset.none = 'true';
    else sw.style.background = DANGER_COLOURS[value];
    const t = doc.createElement('span');
    t.textContent = text;
    s.append(sw, t);
    return s;
  };
  const levels = (Object.keys(LEVELS) as DangerValue[]).map((v) => item(v, String(LEVELS[v]), v));
  el.append(...levels, item('earlyseason', 'Early season', 'Early season or Spring'), item('norating', 'No rating', 'No rating'), item('none', 'None', 'No forecast'));
  return el;
}

const at = () => {
  const p = avalanchePin();
  return p ? bulletinAt(p.lon, p.lat) : null;
};

/** The readout at the pin: the region's rating for the cursor's day, with the band it comes from. */
export function readout(t: Date | null, s: Record<string, string | boolean>): Readout {
  const data = avalancheData();
  if (!data) return { value: avalancheFailed() ? 'Avalanche Canada unavailable' : '…' };
  const here = at();
  if (!here) return { value: 'No avalanche forecast here' };
  if (!here.bulletin || !t) return { value: 'No forecast', note: 'for this region' };
  const shown = shownAt(here.bulletin, t, bandChoice(s));
  if (!shown) return { value: 'No forecast', note: 'for this day' };
  // A band named only when the rating belongs to one (a seasonal bulletin covers all three).
  return { value: ratingLabel(shown.rating), note: shown.band ? BAND_NAMES[shown.band] : undefined };
}

/** Day blocks across the window: three rows (alpine on top), each day in its issued colour; days with no forecast left empty. */
export function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, start: Date, end: Date): void {
  ctx.clearRect(0, 0, w, h);
  const css = (n: string) => getComputedStyle(ctx.canvas).getPropertyValue(n).trim();
  const here = at();
  const b = here?.bulletin ?? null;
  const span = end.getTime() - start.getTime();
  const x = (t: number) => ((t - start.getTime()) / span) * w;
  const top = 4, gap = 2;
  const rowH = (h - top - gap * 2) / 3;
  let drawn = 0;
  if (b) {
    // Walk the window hour by hour; each run of hours on one issued day is one block.
    const H = 3_600_000;
    let from = start.getTime();
    let key = '';
    const flush = (until: number) => {
      if (!key) return;
      const d = dayAt(b, new Date(from));
      if (d.kind === 'none') return;
      for (const [k, band] of BANDS.entries()) {
        const r: Rating = d.kind === 'day' ? d.day.ratings[band] : d.rating;
        ctx.fillStyle = DANGER_COLOURS[r.value];
        ctx.fillRect(x(from) + 1, top + k * (rowH + gap), Math.max(1, x(until) - x(from) - 2), rowH);
      }
      drawn++;
    };
    for (let t = start.getTime(); t <= end.getTime(); t += H) {
      const k = localDate(new Date(t), b.timeZone);
      if (k !== key) { flush(t); key = k; from = t; }
    }
    flush(end.getTime());
  }
  ctx.font = '400 11px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  if (!drawn) {
    ctx.fillStyle = css('--ink-2');
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(!avalancheData() ? 'Loading the avalanche forecast…' : here ? 'No forecast for these days' : 'No avalanche forecast at the pin', w / 4, h / 2);
    return;
  }
  // Band names at the left edge, on a small plate so they read on any colour.
  ctx.textAlign = 'left';
  for (const [k, band] of BANDS.entries()) {
    const text = band === 'alp' ? 'ALP' : band === 'tln' ? 'TL' : 'BTL';
    const y = top + k * (rowH + gap) + rowH / 2;
    const tw = ctx.measureText(text).width + 8;
    ctx.fillStyle = css('--sheet');
    ctx.beginPath(); ctx.roundRect(4, y - 7, tw, 14, 3); ctx.fill();
    ctx.fillStyle = css('--ink-2');
    ctx.fillText(text, 8, y);
  }
}

/** Summary: the region and what applies at the cursor. */
export function summary(cursor: Date, s: Record<string, string | boolean>): WindowSummary {
  const data = avalancheData();
  if (!data) return { kind: 'whole', lines: [avalancheFailed() ? 'Avalanche Canada could not be reached' : '…'], label: '' };
  const here = at();
  if (!here) return { kind: 'whole', lines: ['No avalanche forecast at the pin'], label: 'Avalanche Canada' };
  const b = here.bulletin;
  if (!b) return { kind: 'whole', lines: ['No forecast for this region'], label: 'Avalanche Canada' };
  const shown = shownAt(b, cursor, bandChoice(s));
  return {
    kind: 'whole',
    lines: [shown ? ratingLabel(shown.rating) : 'No forecast for this day', `Issued ${formatDateTime(b.issued)}`],
    label: b.owner,
  };
}

const stat = (r: Rating, band: string) => ({ label: band, value: LEVELS[r.value] !== undefined ? String(LEVELS[r.value]) : '–', sub: r.display });

/** The details cards: headline, the three bands, issue and validity, problems, the three days, a pointer to the full forecast. */
export function details(ctx: DetailContext): Card[] {
  const data = avalancheData();
  if (!data) return [{ kind: 'status', icon: 'info', text: avalancheFailed() ? 'Avalanche Canada could not be reached' : 'Loading the avalanche forecast…' }];
  const here = at();
  if (!here) return [{ kind: 'status', icon: 'info', text: 'No avalanche forecast at the pin', note: 'Avalanche Canada and its partners forecast the mountain regions outlined on the map.' }];
  const b = here.bulletin;
  if (!b) return [{ kind: 'status', icon: 'info', text: 'No forecast for this region' }];
  const choice = bandChoice(ctx.settings);
  const d = dayAt(b, ctx.cursor);
  const cards: Card[] = [];
  if (d.kind === 'none') {
    cards.push({ kind: 'headline', value: 'No forecast', sentence: `${b.owner} has issued no rating for ${formatCursorTime(ctx.cursor).split(' ')[0]} in ${titleParts(b.title).short}. Its bulletin covers ${b.days.map((x) => x.label).join(', ')}.` });
  } else {
    const ratings = d.kind === 'day' ? d.day.ratings : { alp: d.rating, tln: d.rating, btl: d.rating };
    const shown = ratingFor(ratings, choice);
    const when = d.kind === 'day' ? d.day.label : 'while this bulletin is valid';
    cards.push({ kind: 'headline', value: ratingLabel(shown.rating), sentence: `${d.kind === 'day' ? BAND_NAMES[shown.band] : 'All bands'}, ${when}, as issued by ${b.owner} for ${titleParts(b.title).short}.` });
    cards.push({ kind: 'stats', title: 'Danger by elevation', meta: d.kind === 'day' ? d.day.label : 'Seasonal', stats: BANDS.map((k) => stat(ratings[k], BAND_NAMES[k])) });
  }
  cards.push({ kind: 'status', icon: 'info', text: `Issued ${formatDateTime(b.issued)} · valid until ${formatDateTime(b.validUntil)}`, note: `${b.owner}${b.forecaster && b.forecaster !== b.owner ? ` · ${b.forecaster}` : ''}` });
  if (b.problems.length) cards.push({ kind: 'status', icon: 'snowflake', text: `Avalanche problems: ${b.problems.map((p) => p.name).join(', ')}` });
  if (b.days.length) {
    cards.push({
      kind: 'expandable', title: 'Three days', caption: 'Each band’s rating, as issued',
      header: ['Day', 'Alpine', 'Treeline', 'Below'],
      rows: b.days.map((x) => [x.label, ...BANDS.map((k) => ratingLabel(x.ratings[k]))]),
    });
  }
  cards.push({ kind: 'status', icon: 'info', text: 'Tap the region on the map for the full forecast', note: 'Highlights, problems and summaries as issued, with a link to avalanche.ca' });
  return cards;
}

export function footer(): string[] {
  const data = avalancheData();
  if (!data) return [];
  return [`${data.source} · fetched ${formatWhen(data.fetchedAt, new Date())}`];
}

export function settingsNote(): string {
  return 'Ratings, words and colours are Avalanche Canada’s, as issued. "Highest" colours each region by the highest of its three bands, as Avalanche Canada’s own map does. Bands are not set heights: each region’s treeline differs, so the pin’s band is not guessed. Online only.';
}

export const avalanche: LayerSlots = {
  id,
  title,
  swatches: (['low', 'moderate', 'considerable', 'high', 'extreme'] as DangerValue[]).map((v) => DANGER_COLOURS[v]),
  pinNeeds: [],
  // Online only until Avalanche Canada's terms on keeping bulletins are confirmed.
  saveNeeds: [],
  chartLabel: 'Avalanche danger for each issued day across the window: alpine, treeline and below treeline.',
  legend,
  readout: (_pin, _i, s) => readout(currentCursor(), s),
  summary: (_pin, _start, cursor, _end, s) => summary(cursor, s),
  drawChart: (ctx, w, h, _pin, start, end) => drawChart(ctx, w, h, start, end),
  details,
  inView: () => null,
  footer: () => footer(),
  settings: SETTINGS,
  get settingsNote() { return settingsNote(); },
};

/** The cursor's time, set by the app (the layer needs no weather series, so it does not wait for one). */
let cursorTime: Date | null = null;
export function setAvalancheCursor(t: Date | null): void { cursorTime = t; }
const currentCursor = () => cursorTime;

