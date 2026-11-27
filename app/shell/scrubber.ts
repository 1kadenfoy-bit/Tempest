// The scrubber: the shell part of the collapsed sheet. One time cursor, one
// window control (chart span and week box together), the chart frame with its
// fixed needle and now line, the axis labels and the week strip. The layer
// supplies only its chart drawing and its window summary.
import { TimeCursor } from '../../core/time/cursor';
import { DEFAULT_WINDOW_HOURS, WINDOW_OPTIONS, dayStart, weekRange, windowRange } from '../../core/time/window';
import { formatAxisTime, formatCursorTime, formatDayLabel, formatMinutesAgo, formatRelative, formatSpan } from '../../core/units/format';
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
  /** An observed layer's own frames (radar): fixed chart span, minutes-ago times, and Play loops the last `loopHours`. */
  frames?: { windowHours: number; loopHours: number; stepMinutes: number } | undefined;
}

const H = 3_600_000;

/** "W18": the weekday's first letter and the date, in BC time (crowded strips). */
function shortDay(d: Date, dateOnly = false): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Vancouver', weekday: 'narrow', day: 'numeric' }).formatToParts(d);
  const day = p.find((x) => x.type === 'day')?.value ?? '';
  return dateOnly ? day : `${p.find((x) => x.type === 'weekday')?.value ?? ''}${day}`;
}
const $ = (id: string) => document.getElementById(id)!;

export function setupScrubber(cursor: TimeCursor, initialWindowHours = DEFAULT_WINDOW_HOURS, onWindowChange?: (h: number) => void) {
  let windowHours = initialWindowHours;
  let layer: ScrubberLayer | null = null;
  let status = '';
  /** Where one model hands over to the next, marked on the chart and the week strip. */
  let seams: { time: Date; label: string }[] = [];
  /** The chart's span: the chosen window, or an observed layer's own span. */
  const chartHours = () => layer?.frames?.windowHours ?? windowHours;
  /** Hours between the cursor's steps while dragging (forecast steps are treated as hourly). */
  const stepHours = () => (layer?.frames ? layer.frames.stepMinutes / 60 : 1);

  const canvas = $('chart-canvas') as HTMLCanvasElement;
  const chart = $('chart');
  const week = $('week');

  const render = () => {
    const t = cursor.time;
    const now = new Date();
    // Time row
    $('cursor-time').textContent = t ? formatCursorTime(t) : formatCursorTime(now);
    $('cursor-note').textContent = t ? (layer?.frames ? formatMinutesAgo(t, now) : formatRelative(t, now)) : '';
    $('window-button').hidden = Boolean(layer?.frames);
    $('subject-time').textContent = t ? formatCursorTime(t) : '';
    if (!t) return;
    const { start, end } = windowRange(t, chartHours());
    $('window-label').textContent = WINDOW_OPTIONS.find((o) => o.hours === windowHours)?.label ?? `${windowHours} h`;

    // Summary
    const sum: WindowSummary = layer?.summary(start, t, end) ?? { kind: 'split', before: [], after: [] };
    const half = formatSpan(chartHours() / 2);
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
      const beforeLabel = start < dataStart ? `Since ${formatCursorTime(dataStart)}` : atNow ? `Last ${half}` : `${half} before`;
      // The note gets its own line, so neither is cut off.
      $('summary-before-label').textContent = sum.beforeNote ? `${beforeLabel}\n${sum.beforeNote}` : beforeLabel;
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
    // Each draw starts from the canvas's own settings: a line style left by
    // the last draw (round line ends) changed the 0° guide's dashes on every
    // redraw after the first (found by e2e/consistency.spec.ts, Nov 27).
    ctx.save();
    layer?.drawChart(ctx, w, h, start, end);
    ctx.restore();
    const span = end.getTime() - start.getTime();
    const nowLine = $('chart-now');
    const nx = (now.getTime() - start.getTime()) / span;
    nowLine.style.display = nx > 0 && nx < 1 ? 'block' : 'none';
    nowLine.style.left = `${nx * 100}%`;
    $('chart-status').textContent = status;
    // The past is hatched (observed or earlier runs); seams are dashed lines with the next model's name.
    const past = $('chart-past');
    const px = Math.min(1, Math.max(0, nx));
    past.style.width = `${px * 100}%`;
    const marks = $('chart-seams');
    marks.replaceChildren(...seams.filter((x) => x.time > start && x.time < end).map((x) => {
      const m = document.createElement('span');
      m.style.left = `${((x.time.getTime() - start.getTime()) / span) * 100}%`;
      m.textContent = x.label;
      return m;
    }));

    // Axis: midnights and noons inside the window (every 6 h for short windows).
    const axis = $('chart-axis');
    axis.innerHTML = '';
    const every = chartHours() <= 4 ? 1 : chartHours() <= 12 ? 3 : windowHours <= 24 ? 6 : windowHours <= 72 ? 12 : 24;
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
    const wk = weekRange(now, undefined, cursor.last);
    // Many days (longer models): short labels, and the daily values step aside.
    const compact = wk.days.length > 8;
    // Up to two weeks a day still fits its high and low, stacked; past that they step aside.
    const extrasFit = wk.days.length <= 15;
    week.dataset.compact = String(compact);
    const wspan = wk.end.getTime() - wk.start.getTime();
    const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - wk.start.getTime()) / wspan) * 100));
    const days = $('week-days');
    if (days.childElementCount !== wk.days.length || days.dataset.today !== wk.days[2]!.toISOString() || days.dataset.compact !== String(compact)) {
      const cols = `repeat(${wk.days.length}, minmax(0, 1fr))`;
      days.style.gridTemplateColumns = cols;
      $('week-dividers').style.gridTemplateColumns = cols;
      days.dataset.compact = String(compact);
      days.innerHTML = '';
      $('week-dividers').innerHTML = '';
      for (const d of wk.days) {
        const s = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'week-day-name';
        const full = formatDayLabel(new Date(d.getTime() + 12 * H), now);
        if (full === 'Today') s.className = 'today';
        // "W18": the weekday's first letter and the date; today keeps its name in full.
        // Past two weeks of days only the date fits.
        name.textContent = compact ? shortDay(new Date(d.getTime() + 12 * H), wk.days.length > 15) : full;
        if (compact) name.title = full;
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
      const raw = extrasFit ? layer?.weekDay?.(d0, d1) ?? '' : '';
      const text = compact ? raw.replace(' ', '\n') : raw;
      el.querySelector('.week-day-extra')!.textContent = text;
    });
    week.dataset.extras = String(Boolean(layer?.weekDay) && extrasFit);
    const first_ = cursor.first;
    const last = cursor.last;
    const model = $('week-model');
    const beyond = $('week-beyond');
    if (first_ && last) {
      model.style.left = `${pct(new Date(first_.getTime() - H))}%`;
      model.style.width = `${pct(last) - pct(new Date(first_.getTime() - H))}%`;
      beyond.style.left = `calc(${pct(last)}% + 6px)`;
      beyond.style.display = pct(last) < 88 && !layer?.frames ? 'block' : 'none';
    }
    $('week-now').style.left = `${pct(now)}%`;
    $('week-past').style.width = `${pct(now)}%`;
    $('week-seams').replaceChildren(...seams.map((x) => {
      const m = document.createElement('span');
      m.style.left = `${pct(x.time)}%`;
      m.title = `${x.label} from ${formatCursorTime(x.time)}`;
      return m;
    }));
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
    const hoursPerPx = chartHours() / chart.clientWidth / stepHours();
    cursor.setIndex(dragIndex - (e.clientX - dragX) * hoursPerPx);
  });
  const endDrag = () => { dragging = false; };
  chart.addEventListener('pointerup', endDrag);
  chart.addEventListener('pointercancel', endDrag);

  // Drag or tap the week strip: the box follows the finger.
  let weekDrag = false;
  const weekTo = (clientX: number) => {
    const r = week.getBoundingClientRect();
    const wk = weekRange(new Date(), undefined, cursor.last);
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
    // From the end, start again at now (not two days back).
    // An observed layer's frames (radar) loop over the last hour or so, pausing a beat on the newest.
    const loop = layer?.frames;
    const loopStart = () => (cursor.last ? new Date(cursor.last.getTime() - (loop?.loopHours ?? 1) * H) : new Date());
    if (cursor.index >= cursor.count - 1) { if (loop) cursor.setTime(loopStart()); else cursor.now(); }
    playBtn.innerHTML = icons.pause;
    playBtn.setAttribute('aria-label', 'Pause');
    let dwell = 0;
    timer = window.setInterval(() => {
      if (cursor.stepBy(1)) return;
      if (!loop) { stopPlay(); return; }
      if (dwell++ < 2) return;
      dwell = 0;
      cursor.setTime(loopStart());
    }, loop ? 500 : 700);
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
    setTimeline(t: { seams: { time: Date; label: string }[] }) { seams = t.seams; schedule(); },
    refresh: schedule,
    get windowHours() { return chartHours(); },
    /** The chosen window (12 h to 7 d), whatever an observed layer shows; set from elsewhere (the forecast summary window). */
    get chosenHours() { return windowHours; },
    setWindowHours(h: number) { if (h === windowHours) return; windowHours = h; onWindowChange?.(h); schedule(); },
  };
}
