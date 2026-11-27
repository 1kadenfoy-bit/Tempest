// The forecast summary window (docs/02-design-spec.md calls it the full
// forecast window): every chosen layer's chart for the pin, stacked, on one
// time line. There is no v8 design for it, so it is the plainest version built
// from the shell's existing parts: the grow panel, the time row, the window
// control's segmented buttons, the sheet's chart frame (needle, now line,
// hatched past), its window summary, check rows for the settings, and the
// details footer's lines. Each strip is the layer's own chart and summary
// through the layer contract, so a new layer joins without changes here.
//
// The time is the app's one cursor: dragging any strip moves it, so the map
// is at that hour when the window closes.
import './summary.css';
import type { TimeCursor } from '../../core/time/cursor';
import { WINDOW_OPTIONS, dayStart, windowRange } from '../../core/time/window';
import { formatAxisTime, formatCursorTime, formatRelative, formatSpan } from '../../core/units/format';
import type { LayerSlots, PinData, WindowSummary } from '../../layers/contract';
import { icons } from '../shell/icons';
import { closePanel, openPanel } from '../shell/panel';
import { isIncluded, setIncluded, summaryCandidates, type SummaryChoice } from './choice';

const H = 3_600_000;

export interface SummaryWindowDeps {
  cursor: TimeCursor;
  /** Every layer in the app, in menu order. */
  layers(): readonly LayerSlots[];
  choice(): SummaryChoice | null | undefined;
  setChoice(c: SummaryChoice): void;
  /** The window span shared with the sheet (12 h to 7 d), and its setter. */
  windowHours(): number;
  setWindowHours(h: number): void;
  /** What the strips know about the pin, and the cursor's step in its series (−1 when not there). */
  pinData(): PinData;
  index(): number;
  settingsFor(l: LayerSlots): Record<string, string | boolean>;
  /** A strip's state in plain words ('' when its chart can be drawn). */
  status(l: LayerSlots): string;
  /** The pin's place and height, for the caption. */
  place(): string;
  /** Which model, run and age the strips come from; `stale` turns a line the warning colour. */
  footer(): { text: string; stale: boolean }[];
  /** A line above the strips when the time line is not the forecast's (radar on the map). */
  note(): string | null;
  /** The window opened, or its strips changed: load what they need. */
  load(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const CHECK = icons.check;

interface Strip {
  layer: LayerSlots;
  root: HTMLElement;
  value: HTMLElement;
  note: HTMLElement;
  summary: HTMLElement;
  chart: HTMLElement;
  canvas: HTMLCanvasElement;
  past: HTMLElement;
  now: HTMLElement;
  status: HTMLElement;
}

export function setupSummaryWindow(deps: SummaryWindowDeps) {
  const { cursor } = deps;
  let open = false;
  /** True while the window gives way to its own settings panel (and comes back after). */
  let switching = false;
  let anchor: HTMLElement | null = null;
  let unsubscribe: (() => void) | null = null;
  let frame = 0;
  let body: HTMLElement | null = null;
  let strips: Strip[] = [];

  /** A point for the panel to grow from: where the press was, standing on the bottom edge so the window gets the screen's height. */
  const anchorAt = (x: number, y: number) => {
    const a = el('span', 'summary-anchor');
    a.tabIndex = -1;
    a.style.left = `${x}px`;
    a.style.top = `${Math.max(y, window.innerHeight * 0.55)}px`;
    document.body.append(a);
    return a;
  };

  const shown = () => summaryCandidates(deps.layers()).filter((l) => isIncluded(l.id, deps.choice()));

  // ---- Building ---------------------------------------------------------

  function buildStrip(layer: LayerSlots): Strip {
    const root = el('section', 'summary-strip');
    root.dataset.layer = layer.id;
    root.setAttribute('aria-label', layer.title);
    const head = el('div', 'strip-head');
    const title = el('span', 'card-title', layer.title.toUpperCase());
    const readout = el('span', 'strip-readout');
    const value = el('strong', 'strip-value');
    const note = el('span', 'strip-note');
    readout.append(value, note);
    head.append(title, readout);
    const summary = el('div', 'window-summary strip-summary');
    const chart = el('div', 'chart summary-chart');
    chart.setAttribute('aria-label', `${layer.chartLabel} Drag to move through time.`);
    const past = el('div', 'chart-past');
    const canvas = el('canvas');
    const now = el('div', 'chart-now');
    const needle = el('div', 'chart-needle');
    const status = el('div', 'chart-status');
    chart.append(past, canvas, now, needle, status);
    dragToMove(chart);
    root.append(head, summary, chart);
    return { layer, root, value, note, summary, chart, canvas, past, now, status };
  }

  /** Drag a strip: the data moves under the fixed needle, as on the sheet's chart. */
  function dragToMove(chart: HTMLElement) {
    let from: { x: number; t: number } | null = null;
    chart.addEventListener('pointerdown', (e) => {
      const t = cursor.time;
      if (!t) return;
      from = { x: e.clientX, t: t.getTime() };
      chart.setPointerCapture(e.pointerId);
    });
    chart.addEventListener('pointermove', (e) => {
      if (!from) return;
      const msPerPx = (deps.windowHours() * H) / Math.max(1, chart.clientWidth);
      cursor.setTime(new Date(from.t - (e.clientX - from.x) * msPerPx));
    });
    const end = () => { from = null; };
    chart.addEventListener('pointerup', end);
    chart.addEventListener('pointercancel', end);
  }

  function buildBody(): HTMLElement {
    const root = el('div', 'summary');
    const note = el('p', 'panel-note summary-note');
    note.hidden = true;
    const timeRow = el('div', 'time-row summary-time-row');
    const timeCol = el('span', 'time-line');
    timeCol.append(el('span', 'time summary-time'), el('span', 'time-note summary-time-note'));
    const nowBtn = el('button', 'pill-button summary-now', 'Now');
    nowBtn.addEventListener('click', () => cursor.now());
    timeRow.append(timeCol, nowBtn);
    const seg = el('div', 'segmented summary-window');
    seg.setAttribute('aria-label', 'Window');
    for (const o of WINDOW_OPTIONS) {
      const b = el('button', '', o.label);
      b.dataset.hours = String(o.hours);
      b.addEventListener('click', () => { deps.setWindowHours(o.hours); schedule(); });
      seg.append(b);
    }
    const list = el('div', 'summary-strips');
    const axis = el('div', 'chart-axis summary-axis');
    const empty = el('p', 'panel-note summary-empty', 'No layers chosen. Choose them with the settings button above.');
    const foot = el('div', 'footer-lines summary-footer');
    root.append(note, timeRow, seg, list, axis, empty, foot);
    return root;
  }

  /** Rebuild the strips for the chosen layers (on open, and after the settings change). */
  function buildStrips() {
    if (!body) return;
    strips = shown().map(buildStrip);
    body.querySelector('.summary-strips')!.replaceChildren(...strips.map((s) => s.root));
    body.querySelector<HTMLElement>('.summary-empty')!.hidden = strips.length > 0;
    body.querySelector<HTMLElement>('.summary-axis')!.hidden = strips.length === 0;
  }

  // ---- Drawing ----------------------------------------------------------

  function summaryLines(target: HTMLElement, sum: WindowSummary, start: Date, end: Date, t: Date) {
    const now = new Date();
    const half = formatSpan(deps.windowHours() / 2);
    const atNow = Math.abs(t.getTime() - now.getTime()) < 60 * 60_000;
    const halfEl = (lines: string[], label: string) => {
      const h = el('div', 'summary-half');
      const main = el('span', 'summary-main');
      main.append(...lines.map((x) => el('span', '', x)));
      h.append(main, el('span', 'summary-sub', label));
      return h;
    };
    target.dataset.kind = sum.kind;
    if (sum.kind === 'whole') { target.replaceChildren(halfEl(sum.lines, sum.label)); return; }
    // The same labels as the sheet's window row.
    const dataStart = cursor.first ? new Date(cursor.first.getTime() - H) : start;
    const dataEnd = cursor.last ?? end;
    const before = start < dataStart ? `Since ${formatCursorTime(dataStart)}` : atNow ? `Last ${half}` : `${half} before`;
    const after = end > dataEnd ? `Until ${formatCursorTime(dataEnd)}` : atNow ? `Next ${half}` : `${half} after`;
    target.replaceChildren(halfEl(sum.before, sum.beforeNote ? `${before} · ${sum.beforeNote}` : before), halfEl(sum.after, after));
  }

  function drawStrip(s: Strip, pin: PinData, i: number, start: Date, end: Date, t: Date) {
    const settings = deps.settingsFor(s.layer);
    const status = deps.status(s.layer);
    const r = s.layer.readout(pin, i, settings);
    s.value.textContent = status ? '' : r.value;
    s.note.textContent = status ? '' : r.note ?? '';
    summaryLines(s.summary, status ? { kind: 'whole', lines: [], label: '' } : s.layer.summary(pin, start, t, end, settings), start, end, t);
    s.status.textContent = status;
    s.root.dataset.state = status ? 'waiting' : 'ready';
    const dpr = window.devicePixelRatio || 1;
    const w = s.chart.clientWidth, h = s.chart.clientHeight;
    if (s.canvas.width !== Math.round(w * dpr) || s.canvas.height !== Math.round(h * dpr)) {
      s.canvas.width = Math.round(w * dpr);
      s.canvas.height = Math.round(h * dpr);
    }
    const ctx = s.canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Each draw starts from the canvas's own settings (as the sheet's chart, app/shell/scrubber.ts).
      ctx.save();
      if (!status) s.layer.drawChart(ctx, w, h, pin, start, end);
      ctx.restore();
    }
    const span = end.getTime() - start.getTime();
    const nx = (Date.now() - start.getTime()) / span;
    s.now.style.display = nx > 0 && nx < 1 ? 'block' : 'none';
    s.now.style.left = `${nx * 100}%`;
    s.past.style.width = `${Math.min(1, Math.max(0, nx)) * 100}%`;
  }

  function drawAxis(axis: HTMLElement, start: Date, end: Date) {
    const hours = deps.windowHours();
    const every = hours <= 12 ? 3 : hours <= 24 ? 6 : hours <= 72 ? 12 : 24;
    const span = end.getTime() - start.getTime();
    let tick = dayStart(start).getTime();
    while (tick < start.getTime()) tick += every * H;
    const ticks: HTMLElement[] = [];
    for (; tick < end.getTime(); tick += every * H) {
      const at = (tick - start.getTime()) / span;
      if (at < 0.06 || at > 0.94) continue;
      const s = el('span', '', formatAxisTime(new Date(tick)));
      s.style.left = `${at * 100}%`;
      ticks.push(s);
    }
    axis.replaceChildren(...ticks);
  }

  function render() {
    if (!open || !body) return;
    const t = cursor.time;
    const now = new Date();
    const panel = body.closest('.panel');
    panel?.querySelector('.panel-caption')?.replaceChildren(deps.place());
    const note = deps.note();
    const noteEl = body.querySelector<HTMLElement>('.summary-note')!;
    noteEl.hidden = !note;
    noteEl.textContent = note ?? '';
    body.querySelector('.summary-time')!.textContent = formatCursorTime(t ?? now);
    body.querySelector('.summary-time-note')!.textContent = t ? formatRelative(t, now) : '';
    body.querySelectorAll<HTMLElement>('.summary-window button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.hours) === deps.windowHours())));
    const foot = body.querySelector<HTMLElement>('.summary-footer')!;
    foot.replaceChildren(...deps.footer().map((l) => { const s = el('span', '', l.text); if (l.stale) s.dataset.stale = 'true'; return s; }));
    if (!t) {
      for (const s of strips) { s.status.textContent = 'Finding the latest run…'; s.root.dataset.state = 'waiting'; }
      return;
    }
    const { start, end } = windowRange(t, deps.windowHours());
    const pin = deps.pinData();
    const i = deps.index();
    for (const s of strips) drawStrip(s, pin, i, start, end, t);
    drawAxis(body.querySelector<HTMLElement>('.summary-axis')!, start, end);
    document.body.dataset.summary = strips.every((s) => s.root.dataset.state === 'ready') ? 'ready' : 'waiting';
  }

  function schedule() {
    if (frame || !open) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  }

  // ---- Opening and closing ----------------------------------------------

  function show(origin: HTMLElement) {
    body = buildBody();
    buildStrips();
    const gear = el('button');
    gear.id = 'summary-settings';
    gear.setAttribute('aria-label', 'Choose the layers');
    gear.setAttribute('aria-haspopup', 'dialog');
    gear.innerHTML = icons.gear;
    gear.addEventListener('click', () => openSettings(origin));
    open = true;
    openPanel({
      origin,
      // It grows from the pin, so it keeps the pin's mark.
      icon: icons['pin-small'],
      title: 'Forecast summary',
      caption: deps.place(),
      headerAction: gear,
      body,
      onClose: () => {
        open = false;
        unsubscribe?.();
        unsubscribe = null;
        delete document.body.dataset.summary;
        document.body.dataset.summaryOpen = 'false';
        if (!switching) { anchor?.remove(); anchor = null; }
      },
    });
    document.body.dataset.summaryOpen = 'true';
    unsubscribe = cursor.subscribe(schedule);
    deps.load();
    render();
    schedule();
  }

  /** The window's settings: which layers have a strip (check rows), remembered on this phone. */
  function openSettings(origin: HTMLElement) {
    const groups = el('div', 'panel-groups');
    const group = el('div', 'group');
    group.append(el('span', 'group-title', 'LAYERS IN THE SUMMARY'));
    for (const l of summaryCandidates(deps.layers())) {
      const row = el('label', 'check-row');
      row.innerHTML = `<input type="checkbox"><span class="check-box">${CHECK}</span><span class="check-text"><span class="check-title"></span></span>`;
      row.querySelector('.check-title')!.textContent = l.title;
      const input = row.querySelector('input')!;
      input.checked = isIncluded(l.id, deps.choice());
      input.addEventListener('change', () => deps.setChoice(setIncluded(deps.choice(), l.id, input.checked)));
      group.append(row);
    }
    const note = el('p', 'panel-note', 'Radar is not offered: it shows only the last few hours, frame by frame, while it is the layer on the map.');
    groups.append(group, note);
    switching = true;
    openPanel({
      origin,
      icon: icons.gear,
      title: 'Summary settings',
      caption: 'Remembered on this phone',
      body: groups,
      // Closing the settings goes back to the window, with the strips chosen.
      onClose: () => { requestAnimationFrame(() => { switching = false; show(origin); }); },
    });
  }

  return {
    /** Open at a point on the screen (press-and-hold on the map): it grows from there. */
    openAt(x: number, y: number) {
      if (open) closePanel();
      anchor?.remove();
      anchor = anchorAt(x, y);
      show(anchor);
    },
    /** Open from a control (the details' footer). */
    openFrom(origin: HTMLElement) {
      const r = origin.getBoundingClientRect();
      this.openAt(r.left + r.width / 2, r.top + r.height / 2);
    },
    /** Something the strips show changed (the pin's series, its height, a run). */
    refresh: schedule,
    isOpen: () => open,
    /** The layers with a strip now. */
    shown,
  };
}
