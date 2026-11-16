// The scrubber: the shell part of the collapsed sheet. One time cursor, one
// window control (chart span and week box together), the chart frame with its
// fixed needle and now line, the axis labels and the week strip. The layer
// supplies only its chart drawing and its window summary.
import { TimeCursor } from '../../core/time/cursor';
import { DEFAULT_WINDOW_HOURS, WINDOW_OPTIONS, dayStart, weekRange, windowRange } from '../../core/time/window';
import { formatAxisTime, formatCursorTime, formatDayLabel, formatRelative, formatSpan } from '../../core/units/format';
import type { WindowSummary } from '../../layers/contract';
import { icons } from './icons';
import { closePanel, isOpenFrom, openPanel } from './panel';

export interface ScrubberLayer {
  drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, start: Date, end: Date): void;
  /** Split at the needle (totals before and after), or one block for the whole window. */
  summary(start: Date, cursor: Date, end: Date): WindowSummary;
  /** Small values under a week-strip day, or null. */
  weekDay?(dayStart: Date, dayEnd: Date): string | null;
  chartLabel: string;
}

const H = 3_600_000;
const $ = (id: string) => document.getElementById(id)!;

export function setupScrubber(cursor: TimeCursor, initialWindowHours = DEFAULT_WINDOW_HOURS, onWindowChange?: (h: number) => void) {
  let windowHours = initialWindowHours;
  let layer: ScrubberLayer | null = null;
  let status = '';

  const canvas = $('chart-canvas') as HTMLCanvasElement;
  const chart = $('chart');
  const week = $('week');

  const render = () => {
    const t = cursor.time;
    const now = new Date();
    // Time row
    $('cursor-time').textContent = t ? formatCursorTime(t) : formatCursorTime(now);
    $('cursor-note').textContent = t ? formatRelative(t, now) : '';
    $('subject-time').textContent = t ? formatCursorTime(t) : '';
    if (!t) return;
    const { start, end } = windowRange(t, windowHours);
    $('window-label').textContent = WINDOW_OPTIONS.find((o) => o.hours === windowHours)?.label ?? `${windowHours} h`;

    // Summary
    const sum: WindowSummary = layer?.summary(start, t, end) ?? { kind: 'split', before: [], after: [] };
    const half = formatSpan(windowHours / 2);
    // "Last/Next" when the needle is on now; "before/after" when moved away.
    const atNow = Math.abs(t.getTime() - now.getTime()) < 60 * 60_000;
    const lines = (el: HTMLElement, parts: string[]) => {
      el.replaceChildren(...parts.map((p) => { const s = document.createElement('span'); s.textContent = p; return s; }));
    };
    $('window-summary').dataset.kind = sum.kind;
    if (sum.kind === 'whole') {
      lines($('summary-before'), sum.lines);
      $('summary-before-label').textContent = sum.label;
      lines($('summary-after'), []);
      $('summary-after-label').textContent = '';
    } else {
      lines($('summary-before'), sum.before);
      lines($('summary-after'), sum.after);
      // Say what the totals really cover when the window reaches past the
      // model's hours (the first step's amount starts an hour before it).
      const dataStart = cursor.first ? new Date(cursor.first.getTime() - H) : start;
      const dataEnd = cursor.last ?? end;
      $('summary-before-label').textContent = start < dataStart ? `Since ${formatCursorTime(dataStart)}` : atNow ? `Last ${half}` : `${half} before`;
      $('summary-after-label').textContent = end > dataEnd ? `Until ${formatCursorTime(dataEnd)}` : atNow ? `Next ${half}` : `${half} after`;
    }

    // Chart
    const dpr = window.devicePixelRatio || 1;
    const w = chart.clientWidth;
    const h = chart.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    layer?.drawChart(ctx, w, h, start, end);
    const span = end.getTime() - start.getTime();
    const nowLine = $('chart-now');
    const nx = (now.getTime() - start.getTime()) / span;
    nowLine.style.display = nx > 0 && nx < 1 ? 'block' : 'none';
    nowLine.style.left = `${nx * 100}%`;
    $('chart-status').textContent = status;

    // Axis: midnights and noons inside the window (every 6 h for short windows).
    const axis = $('chart-axis');
    axis.innerHTML = '';
    const every = windowHours <= 12 ? 3 : windowHours <= 24 ? 6 : windowHours <= 72 ? 12 : 24;
    // Ticks line up with BC midnight and noon, not UTC.
    let first = dayStart(start).getTime();
    while (first < start.getTime()) first += every * H;
    for (let tick = first; tick < end.getTime(); tick += every * H) {
      const at = (tick - start.getTime()) / span;
      if (at < 0.06 || at > 0.94) continue; // keep labels off the edges
      const label = formatAxisTime(new Date(tick));
      const span_ = document.createElement('span');
      span_.style.left = `${((tick - start.getTime()) / span) * 100}%`;
      span_.textContent = label;
      axis.append(span_);
    }

    // Week strip
    const wk = weekRange(now);
    const wspan = wk.end.getTime() - wk.start.getTime();
    const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - wk.start.getTime()) / wspan) * 100));
    const days = $('week-days');
    if (days.childElementCount !== 7 || days.dataset.today !== wk.days[2]!.toISOString()) {
      days.innerHTML = '';
      $('week-dividers').innerHTML = '';
      for (const d of wk.days) {
        const s = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'week-day-name';
        name.textContent = formatDayLabel(new Date(d.getTime() + 12 * H), now);
        if (name.textContent === 'Today') s.className = 'today';
        const extra = document.createElement('span');
        extra.className = 'week-day-extra';
        s.append(name, extra);
        days.append(s);
        $('week-dividers').append(document.createElement('span'));
      }
      days.dataset.today = wk.days[2]!.toISOString();
    }
    // A layer's small values under each day (temperature: high and low).
    [...days.children].forEach((el, k) => {
      const d0 = wk.days[k]!;
      const d1 = wk.days[k + 1] ?? wk.end;
      const text = layer?.weekDay?.(d0, d1) ?? '';
      el.querySelector('.week-day-extra')!.textContent = text;
    });
    week.dataset.extras = String(Boolean(layer?.weekDay));
    const first_ = cursor.first;
    const last = cursor.last;
    const model = $('week-model');
    const beyond = $('week-beyond');
    if (first_ && last) {
      model.style.left = `${pct(new Date(first_.getTime() - H))}%`;
      model.style.width = `${pct(last) - pct(new Date(first_.getTime() - H))}%`;
      beyond.style.left = `calc(${pct(last)}% + 6px)`;
      beyond.style.display = pct(last) < 88 ? 'block' : 'none';
    }
    $('week-now').style.left = `${pct(now)}%`;
    const box = $('week-box');
    box.style.left = `${pct(start)}%`;
    box.style.width = `${pct(end) - pct(start)}%`;
    box.setAttribute('aria-label', `Window: ${formatCursorTime(start)} to ${formatCursorTime(end)}`);
  };

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  };
  cursor.subscribe(schedule);
  addEventListener('resize', schedule);

  // Drag the chart: the data moves under the fixed needle.
  let dragX = 0;
  let dragIndex = 0;
  let dragging = false;
  chart.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragX = e.clientX;
    dragIndex = cursor.index;
    chart.setPointerCapture(e.pointerId);
    stopPlay();
  });
  chart.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const hoursPerPx = windowHours / chart.clientWidth;
    cursor.setIndex(dragIndex - (e.clientX - dragX) * hoursPerPx);
  });
  const endDrag = () => { dragging = false; };
  chart.addEventListener('pointerup', endDrag);
  chart.addEventListener('pointercancel', endDrag);

  // Drag or tap the week strip: the box follows the finger.
  let weekDrag = false;
  const weekTo = (clientX: number) => {
    const r = week.getBoundingClientRect();
    const wk = weekRange(new Date());
    const t = wk.start.getTime() + ((clientX - r.left) / r.width) * (wk.end.getTime() - wk.start.getTime());
    cursor.setTime(new Date(t));
  };
  week.addEventListener('pointerdown', (e) => { weekDrag = true; week.setPointerCapture(e.pointerId); stopPlay(); weekTo(e.clientX); });
  week.addEventListener('pointermove', (e) => { if (weekDrag) weekTo(e.clientX); });
  week.addEventListener('pointerup', () => { weekDrag = false; });
  week.addEventListener('pointercancel', () => { weekDrag = false; });

  // Now and play
  $('now-button').addEventListener('click', () => { stopPlay(); cursor.now(); });
  const playBtn = $('play-button');
  let timer = 0;
  function stopPlay() {
    if (!timer) return;
    clearInterval(timer);
    timer = 0;
    playBtn.innerHTML = icons.play;
    playBtn.setAttribute('aria-label', 'Play through time');
  }
  playBtn.addEventListener('click', () => {
    if (timer) { stopPlay(); return; }
    if (cursor.index >= cursor.count - 1) cursor.setIndex(0);
    playBtn.innerHTML = icons.pause;
    playBtn.setAttribute('aria-label', 'Pause');
    timer = window.setInterval(() => { if (!cursor.stepBy(1)) stopPlay(); }, 700);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlay(); });

  // Window control: grows into a panel with the five spans.
  const windowBtn = $('window-button');
  windowBtn.addEventListener('click', () => {
    if (isOpenFrom(windowBtn)) { closePanel(); return; }
    const body = document.createElement('div');
    body.className = 'group';
    const seg = document.createElement('div');
    seg.className = 'segmented';
    for (const o of WINDOW_OPTIONS) {
      const b = document.createElement('button');
      b.textContent = o.label;
      b.setAttribute('aria-pressed', String(o.hours === windowHours));
      b.addEventListener('click', () => {
        windowHours = o.hours;
        onWindowChange?.(o.hours);
        schedule();
        closePanel();
      });
      seg.append(b);
    }
    body.append(seg);
    openPanel({ origin: windowBtn, icon: icons.chevron, title: 'Window', caption: 'Chart span and the box on the week', body });
  });

  return {
    setLayer(l: ScrubberLayer) { layer = l; chart.setAttribute('aria-label', l.chartLabel); schedule(); },
    setStatus(s: string) { status = s; schedule(); },
    refresh: schedule,
    get windowHours() { return windowHours; },
  };
}
