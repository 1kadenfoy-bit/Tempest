// The standard detail cards (v8 11-DetailElements), drawn from the layer's
// card data. One renderer for every layer, so cards look alike and keep the
// fixed order. The two shared visuals (elevation over time; value against
// elevation) are drawn on canvas here.
import type { BandsInfo, Card } from '../../layers/contract';
import { formatAxisTime, formatElevation } from '../../core/units/format';
import { dayStart } from '../../core/time/window';
import { icons } from './icons';

const H = 3_600_000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function head(title: string, meta?: string) {
  const h = el('div', 'card-head');
  h.append(el('span', 'card-title', title));
  if (meta) h.append(el('span', 'card-meta', meta));
  return h;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A canvas sized to its box, redrawn when the box changes. */
function canvasCard(height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = el('canvas', 'card-canvas');
  c.style.height = `${height}px`;
  const paint = () => {
    const w = c.clientWidth;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    draw(ctx, w, height);
  };
  new ResizeObserver(paint).observe(c);
  return c;
}

/** Elevation range for the visuals: the bands, the pin and the level line in view. */
function heightRange(bands: BandsInfo, you: number, extra: number[]): [number, number] {
  const lo = Math.max(0, Math.min(bands.valleyTop - 400, you - 300, ...extra.map((v) => v - 150)));
  const hi = Math.max(bands.alpineBottom + 400, you + 300, ...extra.map((v) => v + 150));
  return [lo, hi];
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign, color: string, bold = false) {
  ctx.font = `${bold ? 600 : 400} 12px Inter, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = css('--sheet');
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawElevationTime(c: Extract<Card, { kind: 'elevation-time' }>, bands: BandsInfo, start: Date, end: Date) {
  return canvasCard(150, (ctx, w, h) => {
    const plotH = h - 22;
    const levels = c.level.filter((v): v is number => v !== null);
    const [lo, hi] = heightRange(bands, c.you.elevation, levels);
    const y = (z: number) => plotH - ((z - lo) / (hi - lo)) * plotH;
    const span = end.getTime() - start.getTime();
    const x = (t: Date) => ((t.getTime() - start.getTime()) / span) * w;
    const ink = css('--ink');
    const ink2 = css('--ink-2');
    // Shading: below the level line, then above it.
    ctx.save();
    ctx.beginPath(); ctx.roundRect(0, 0, w, plotH, 8); ctx.clip();
    ctx.fillStyle = c.below.color; ctx.fillRect(0, 0, w, plotH);
    ctx.fillStyle = c.above.color;
    ctx.beginPath();
    let started = false;
    const pts: [number, number][] = [];
    c.times.forEach((t, i) => {
      const v = c.level[i];
      if (v === null || v === undefined) return;
      pts.push([x(t), y(v)]);
    });
    // Where there is no line (snow or frost to sea level, or none at all), shade by the nearest known.
    if (pts.length) {
      ctx.moveTo(Math.min(0, pts[0]![0]), 0);
      for (const [px, py] of [[Math.min(0, pts[0]![0]), pts[0]![1]] as [number, number], ...pts, [Math.max(w, pts[pts.length - 1]![0]), pts[pts.length - 1]![1]] as [number, number]]) {
        if (!started) { ctx.lineTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.lineTo(Math.max(w, pts[pts.length - 1]![0]), 0);
      ctx.closePath();
      ctx.fill();
    }
    // Band edges
    ctx.strokeStyle = ink2; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    for (const z of [bands.valleyTop, bands.alpineBottom]) { ctx.beginPath(); ctx.moveTo(0, y(z) + 0.5); ctx.lineTo(w, y(z) + 0.5); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // The level line, dashed
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke(); ctx.setLineDash([]);
    // You
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, y(c.you.elevation)); ctx.lineTo(w, y(c.you.elevation)); ctx.stroke();
    // Cursor
    ctx.strokeStyle = ink2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, plotH); ctx.stroke();
    ctx.restore();
    label(ctx, c.above.label, 8, 12, 'left', ink, true);
    label(ctx, c.below.label, 8, plotH - 12, 'left', ink, true);
    label(ctx, c.you.label, 8, y(c.you.elevation) + (y(c.you.elevation) > plotH - 34 ? -10 : 11), 'left', ink);
    const approx = bands.approximate ? '≈' : '';
    label(ctx, `Alpine ${approx}${formatElevation(bands.alpineBottom)}`, w - 6, y(bands.alpineBottom) - 8, 'right', ink2);
    label(ctx, `Valley ${approx}${formatElevation(bands.valleyTop)}`, w - 6, y(bands.valleyTop) + 9, 'right', ink2);
    if (c.marker) {
      const mx = x(c.marker.time);
      const my = y(c.you.elevation);
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(c.marker.text).width + 12;
      const bx = Math.min(w - tw - 2, Math.max(2, mx - tw / 2));
      ctx.fillStyle = css('--sheet');
      ctx.beginPath(); ctx.roundRect(bx, my - 24, tw, 18, 4); ctx.fill();
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(c.marker.text, bx + 6, my - 15);
    }
    // Time axis: midnights and noons, as the chart.
    ctx.fillStyle = ink2; ctx.font = '400 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const every = span <= 24 * H ? 6 * H : span <= 72 * H ? 12 * H : 24 * H;
    let t = dayStart(start).getTime();
    while (t < start.getTime()) t += every;
    for (; t < end.getTime(); t += every) {
      const px = x(new Date(t));
      if (px < 18 || px > w - 18) continue;
      ctx.fillText(formatAxisTime(new Date(t)), px, h - 2);
    }
  });
}

function drawValueElevation(c: Extract<Card, { kind: 'value-elevation' }>, bands: BandsInfo) {
  return canvasCard(150, (ctx, w, h) => {
    const left = 70, bottom = h - 20, top = 6, right = w - 10;
    const [lo, hi] = heightRange(bands, c.you.elevation, []);
    const pts = c.points.filter((p) => p.elevation >= lo - 200 && p.elevation <= hi + 200);
    const vals = [...pts.map((p) => p.value), c.you.value, ...(c.zero ? [0] : [])];
    let vmin = Math.floor(Math.min(...vals) / 5) * 5;
    let vmax = Math.ceil(Math.max(...vals) / 5) * 5;
    if (vmax - vmin < 10) { vmax += 5; vmin -= 5; }
    const x = (v: number) => left + ((v - vmin) / (vmax - vmin)) * (right - left);
    const y = (z: number) => bottom - ((z - lo) / (hi - lo)) * (bottom - top);
    const ink = css('--ink');
    const ink2 = css('--ink-2');
    ctx.fillStyle = css('--card');
    ctx.fillRect(left, top, right - left, bottom - top);
    // Bands: names at the left, between their edges.
    const approx = bands.approximate ? ' ≈' : '';
    ctx.fillStyle = ink2; ctx.font = '400 12px Inter, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const mid = (a: number, b: number) => y((Math.max(a, lo) + Math.min(b, hi)) / 2);
    ctx.fillText('Alpine', left - 8, mid(bands.alpineBottom, hi));
    const midY = mid(bands.valleyTop, bands.alpineBottom);
    ctx.fillText('Mid-', left - 8, midY - 7);
    ctx.fillText('mountain', left - 8, midY + 7);
    ctx.fillText('Valley', left - 8, mid(lo, bands.valleyTop));
    ctx.strokeStyle = ink2; ctx.globalAlpha = 0.3;
    for (const z of [bands.valleyTop, bands.alpineBottom]) { ctx.beginPath(); ctx.moveTo(left, y(z) + 0.5); ctx.lineTo(right, y(z) + 0.5); ctx.stroke(); }
    ctx.globalAlpha = 1;
    void approx;
    if (c.zero && vmin <= 0 && vmax >= 0) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = ink2;
      ctx.beginPath(); ctx.moveTo(x(0) + 0.5, top); ctx.lineTo(x(0) + 0.5, bottom); ctx.stroke(); ctx.setLineDash([]);
    }
    // The profile
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(x(p.value), y(p.elevation)) : ctx.moveTo(x(p.value), y(p.elevation))));
    ctx.stroke();
    for (const p of pts) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x(p.value), y(p.elevation), 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // You
    const yx = x(c.you.value), yy = y(c.you.elevation);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(yx, yy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = css('--sheet'); ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(c.you.label).width + 12;
    const bx = yx + tw + 10 > right ? yx - tw - 10 : yx + 10;
    ctx.fillStyle = css('--sheet');
    ctx.beginPath(); ctx.roundRect(bx, yy - 9, tw, 18, 4); ctx.fill();
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.fillText(c.you.label, bx + 6, yy);
    // Value axis
    ctx.fillStyle = ink2; ctx.font = '400 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const step = vmax - vmin > 30 ? 10 : 5;
    for (let v = vmin; v <= vmax; v += step) {
      const text = v === vmax ? `${v < 0 ? '−' : ''}${Math.abs(v)} ${c.unit}` : `${v < 0 ? '−' : ''}${Math.abs(v)}`;
      ctx.fillText(text, Math.min(right - 14, x(v)), h - 2);
    }
  });
}

export function renderCard(c: Card, bands: BandsInfo, start: Date, end: Date): HTMLElement {
  switch (c.kind) {
    case 'headline': {
      const card = el('div', 'card card-headline');
      card.append(el('span', 'headline-value', c.value), el('span', 'headline-sentence', c.sentence));
      return card;
    }
    case 'stats': {
      const card = el('div', 'card');
      card.append(head(c.title, c.meta));
      const grid = el('div', 'stats');
      grid.style.gridTemplateColumns = `repeat(${c.stats.length}, minmax(0, 1fr))`;
      for (const s of c.stats) {
        const cell = el('div', 'stat');
        cell.append(el('span', 'stat-label', s.label), el('span', 'stat-value', s.value));
        if (s.unit || s.sub) cell.append(el('span', 'stat-sub', s.sub ?? s.unit));
        grid.append(cell);
      }
      card.append(grid);
      if (c.note) card.append(el('div', 'card-note', c.note));
      return card;
    }
    case 'table': {
      const card = el('div', 'card');
      card.append(head(c.title, c.meta));
      const t = el('table', 'band-table');
      const g = el('tr', 'band-groups');
      g.append(el('th'));
      c.groups.forEach((grp, i) => { const th = el('th', i ? 'split' : '', grp.label); th.colSpan = grp.columns.length; g.append(th); });
      const cols = el('tr', 'band-cols');
      cols.append(el('th'));
      c.groups.forEach((grp, i) => grp.columns.forEach((col, j) => cols.append(el('th', i && !j ? 'split' : '', col))));
      t.append(g, cols);
      const firstOfSecond = c.groups[0]?.columns.length ?? 0;
      for (const r of c.rows) {
        const tr = el('tr', r.you ? 'you' : '');
        const name = el('th', 'band-name', r.label);
        if (r.you) name.append(el('span', 'you-chip', 'You'));
        tr.append(name);
        r.cells.forEach((cell, j) => {
          const td = el('td', [j === firstOfSecond ? 'split' : '', cell.partial ? 'partial' : ''].join(' ').trim());
          cell.parts.forEach((p, k) => {
            if (k) td.append('·');
            const s = el('span', '', p.text);
            s.style.color = p.color;
            td.append(s);
          });
          tr.append(td);
        });
        t.append(tr);
      }
      card.append(t);
      const note = el('div', 'card-note');
      for (const n of c.note) { const s = el('span', '', n.text); if (n.color) { s.style.color = n.color; s.style.fontWeight = '600'; } note.append(s); }
      card.append(note);
      return card;
    }
    case 'elevation-time': {
      const card = el('div', 'card');
      card.append(head(c.title, c.meta), drawElevationTime(c, bands, start, end));
      return card;
    }
    case 'value-elevation': {
      const card = el('div', 'card');
      card.append(head(c.title, c.meta), drawValueElevation(c, bands));
      return card;
    }
    case 'status': {
      const card = el('div', 'card card-status');
      const icon = el('span', 'status-icon');
      icon.innerHTML = icons[c.icon];
      const text = el('div', 'status-text');
      text.append(el('span', 'status-main', c.text));
      if (c.note) text.append(el('span', 'status-note', c.note));
      card.append(icon, text);
      return card;
    }
    case 'expandable': {
      const card = el('details', 'card card-expand');
      const sum = el('summary');
      const titles = el('span', 'expand-titles');
      titles.append(el('span', 'expand-title', c.title), el('span', 'expand-caption', c.caption));
      const chev = el('span', 'expand-chevron');
      chev.innerHTML = icons.chevron;
      sum.append(titles, chev);
      const wrap = el('div', 'expand-body');
      const t = el('table', 'hourly');
      const hr = el('tr');
      c.header.forEach((hh) => hr.append(el('th', '', hh)));
      t.append(hr);
      for (const r of c.rows) { const tr = el('tr'); r.forEach((v) => tr.append(el('td', '', v))); t.append(tr); }
      wrap.append(t);
      card.append(sum, wrap);
      return card;
    }
    case 'later':
      return el('div', 'card card-later', c.text);
  }
}
