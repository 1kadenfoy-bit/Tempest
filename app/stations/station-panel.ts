// The station panel: what one weather station measured, as measured. No v8
// design exists for it; it is built from the existing grow panel, fact tiles
// and the detail cards' canvas style (neutral ink, tokens only). Values are
// joined point to point, never smoothed; gaps stay gaps.
import type { Station, StationObservation } from '../../core/stations/stations';
import { distanceKm, isStale, timeline } from '../../core/stations/stations';
import { compass } from '../../core/wind/wind';
import {
  formatAgo, formatAxisTime, formatCm, formatCursorTime, formatDegrees, formatDistance, formatElevation, formatMm, formatSpeed,
  formatTemp, speedValue, tempValue, unitLabel,
} from '../../core/units/format';
import { dayStart } from '../../core/time/window';

const H = 3_600_000;
export const CHART_HOURS = 48;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fact(label: string, value: string, warn = false): HTMLElement {
  const f = el('div', 'fact');
  f.append(el('span', 'fact-label', label), el('span', 'fact-value', value));
  if (warn) f.dataset.stale = 'true';
  return f;
}

function group(title: string, ...children: HTMLElement[]): HTMLElement {
  const g = el('div', 'group');
  g.append(el('span', 'group-title', title), ...children);
  return g;
}

/** The current values the station measured, as tiles; only what it measures. */
export function valueTiles(o: StationObservation): HTMLElement {
  const grid = el('div', 'fact-grid station-values');
  if (o.airTemp !== null) grid.append(fact('Air', formatTemp(o.airTemp)));
  if (o.windSpeed !== null || o.windDir !== null) {
    const dir = o.windDir === null || (o.windSpeed !== null && o.windSpeed < 0.5) ? '' : `${compass(o.windDir)} `;
    grid.append(fact('Wind', o.windSpeed === null ? `${dir}–` : `${dir}${formatSpeed(o.windSpeed)}`));
  }
  if (o.gust !== null) grid.append(fact('Gust', formatSpeed(o.gust)));
  if (o.precip1h !== null) grid.append(fact('Past hour', formatMm(o.precip1h)));
  if (o.snowDepth !== null) grid.append(fact('Snow depth', formatCm(o.snowDepth)));
  return grid;
}

export interface PanelInput {
  station: Station;
  latest: StationObservation | null;
  pin: { lat: number; lon: number } | null;
  now: Date;
  /** Words the network asks to be shown with its data (a disclaimer), if any. */
  notice?: string | undefined;
}

export interface StationPanel {
  body: HTMLElement;
  /** Fill in the chart (and the newest values, when the series is newer). */
  setSeries(obs: StationObservation[]): void;
  setFailed(publisher: string): void;
}

export function stationPanelBody(p: PanelInput): StationPanel {
  const body = el('div', 'panel-groups station-panel');
  const top = el('div', 'fact-grid');
  if (p.station.elevation !== null) top.append(fact('Elevation', formatElevation(p.station.elevation)));
  if (p.pin) top.append(fact('From the pin', formatDistance(distanceKm(p.pin, p.station))));
  const measured = el('div', 'group station-latest');
  const values = el('div');
  const renderLatest = (o: StationObservation | null) => {
    measured.replaceChildren(el('span', 'group-title', 'LATEST MEASURED'));
    values.replaceChildren();
    if (!o) {
      measured.append(el('p', 'panel-note', 'No recent readings from this station.'));
      return;
    }
    const stale = isStale(o, p.now);
    const when = el('p', 'panel-note station-when', `${formatCursorTime(o.time)} · ${formatAgo(o.time, p.now)}`);
    if (stale) when.dataset.stale = 'true';
    measured.append(when);
    values.append(valueTiles(o));
    measured.append(values);
  };
  renderLatest(p.latest);

  const chartGroup = group(`PAST ${CHART_HOURS} H, AS MEASURED`);
  const status = el('p', 'panel-note station-chart-status', `Loading the past ${CHART_HOURS} hours…`);
  chartGroup.append(status);

  const source = el('p', 'panel-note station-source');
  source.append(document.createTextNode(`${p.station.attribution}. `));
  if (p.notice) source.append(document.createTextNode(`${p.notice} `));
  const link = el('a', 'station-link', 'Source');
  link.href = p.station.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  source.append(link);

  body.append(top, measured, chartGroup, source);
  if (!top.childElementCount) top.remove();
  body.dataset.series = 'loading';

  return {
    body,
    setSeries(obs) {
      const line = timeline(obs).filter((o) => o.time.getTime() >= p.now.getTime() - CHART_HOURS * H);
      const last = [...line].reverse().find((o) => o.airTemp !== null || o.windSpeed !== null || o.precip1h !== null || o.snowDepth !== null);
      if (last && (!p.latest || last.time.getTime() > p.latest.time.getTime())) renderLatest(last);
      if (!line.some((o) => o.airTemp !== null || o.windSpeed !== null || o.gust !== null)) {
        status.textContent = `No temperature or wind readings in the past ${CHART_HOURS} hours.`;
      } else {
        status.remove();
        chartGroup.append(stationChart(line, new Date(p.now.getTime() - CHART_HOURS * H), p.now));
      }
      body.dataset.series = 'ready';
    },
    setFailed(publisher) {
      status.textContent = `Could not reach ${publisher} just now.`;
      body.dataset.series = 'failed';
    },
  };
}

/** A canvas sized to its box, redrawn when the box changes (as the detail cards do). */
function canvasBox(height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const c = el('canvas', 'card-canvas station-chart');
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

/**
 * Temperature as a line (top), wind as bars with the gust as a tick above
 * each (middle), and the hour's precipitation as bars (bottom, only when the
 * station measures it). Hourly readings, drawn where they are; a missing hour
 * breaks the line.
 */
export function stationChart(obs: StationObservation[], start: Date, end: Date): HTMLCanvasElement {
  const hasPrecip = obs.some((o) => o.precip1h !== null);
  const hasTemp = obs.some((o) => o.airTemp !== null);
  const hasWind = obs.some((o) => o.windSpeed !== null || o.gust !== null);
  const strips = [hasTemp ? 90 : 0, hasWind ? 60 : 0, hasPrecip ? 36 : 0];
  const gap = 10, axis = 18, left = 40;
  const height = strips.reduce((a, b) => a + b, 0) + gap * (strips.filter(Boolean).length - 1) + axis;
  return canvasBox(height, (ctx, w, h) => {
    const ink = css('--ink'), ink2 = css('--ink-2'), card = css('--card');
    const right = w - 4;
    const span = end.getTime() - start.getTime();
    const x = (t: Date) => left + ((t.getTime() - start.getTime()) / span) * (right - left);
    const barW = Math.max(1.5, ((right - left) / (span / H)) * 0.6);
    ctx.font = '400 11px Inter, system-ui, sans-serif';
    let y0 = 0;
    const strip = (hgt: number, drawIn: (top: number, bottom: number) => void) => {
      if (!hgt) return;
      ctx.fillStyle = card;
      ctx.beginPath(); ctx.roundRect(left, y0, right - left, hgt, 8); ctx.fill();
      drawIn(y0 + 6, y0 + hgt - 6);
      y0 += hgt + gap;
    };
    const yLabel = (text: string, y: number) => {
      ctx.fillStyle = ink2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(text, left - 6, y);
    };

    strip(strips[0]!, (top, bottom) => {
      // The range in °C (whole degrees), drawn in the shown unit.
      const vals = obs.flatMap((o) => (o.airTemp === null ? [] : [o.airTemp]));
      let loC = Math.floor(Math.min(...vals)), hiC = Math.ceil(Math.max(...vals));
      if (hiC - loC < 4) { const m = (hiC + loC) / 2; loC = Math.floor(m - 2); hiC = Math.ceil(m + 2); }
      const lo = tempValue(loC), hi = tempValue(hiC);
      const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
      // Freezing, dashed, when it is in range.
      const zero = tempValue(0);
      if (zero > lo && zero < hi) {
        ctx.strokeStyle = ink2; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, Math.round(y(zero)) + 0.5); ctx.lineTo(right, Math.round(y(zero)) + 0.5); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      let prev: StationObservation | null = null;
      for (const o of obs) {
        if (o.airTemp === null) { prev = null; continue; }
        const px = x(o.time), py = y(tempValue(o.airTemp));
        // A gap of more than an hour and a half breaks the line.
        if (prev && o.time.getTime() - prev.time.getTime() <= 1.5 * H) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        prev = o;
      }
      ctx.stroke();
      ctx.fillStyle = ink;
      for (const o of obs) if (o.airTemp !== null) { ctx.beginPath(); ctx.arc(x(o.time), y(tempValue(o.airTemp)), 1.6, 0, Math.PI * 2); ctx.fill(); }
      yLabel(formatDegrees(loC, false), bottom);
      yLabel(formatDegrees(hiC, false), top);
    });

    strip(strips[1]!, (top, bottom) => {
      const vals = obs.flatMap((o) => [o.windSpeed, o.gust].filter((v): v is number => v !== null).map((v) => speedValue(v)));
      const hi = Math.max(10, Math.ceil(Math.max(...vals) / 10) * 10);
      const y = (v: number) => bottom - (v / hi) * (bottom - top);
      for (const o of obs) {
        const px = x(o.time);
        if (o.windSpeed !== null) {
          ctx.fillStyle = ink2; ctx.globalAlpha = 0.7;
          const v = speedValue(o.windSpeed);
          ctx.fillRect(px - barW / 2, y(v), barW, bottom - y(v));
          ctx.globalAlpha = 1;
        }
        if (o.gust !== null) {
          ctx.fillStyle = ink;
          ctx.fillRect(px - barW / 2 - 0.5, y(speedValue(o.gust)) - 1, barW + 1, 2);
        }
      }
      yLabel(`${hi}`, top);
      yLabel(unitLabel('speed'), bottom);
    });

    strip(strips[2]!, (top, bottom) => {
      const vals = obs.flatMap((o) => (o.precip1h === null ? [] : [o.precip1h]));
      const hiMm = Math.max(2, Math.ceil(Math.max(...vals)));
      const y = (mm: number) => bottom - (mm / hiMm) * (bottom - top);
      ctx.fillStyle = ink2;
      for (const o of obs) if (o.precip1h !== null && o.precip1h > 0) ctx.fillRect(x(o.time) - barW / 2, y(o.precip1h), barW, bottom - y(o.precip1h));
      yLabel(formatMm(hiMm), top + 2);
    });

    // Time axis: midnights and noons, as the detail charts.
    ctx.fillStyle = ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    let t = dayStart(start).getTime();
    while (t < start.getTime()) t += 12 * H;
    for (; t <= end.getTime(); t += 12 * H) {
      const px = x(new Date(t));
      if (px < left + 14 || px > right - 14) continue;
      ctx.fillText(formatAxisTime(new Date(t)), px, h - 1);
    }
  });
}
