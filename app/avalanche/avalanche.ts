// The avalanche layer's map wiring and panels: forecast regions coloured by
// the issued danger for the cursor's day, Mountain Information Network
// reports as pins, the full forecast when a region is tapped and a report
// when its pin is tapped. Everything is shown as issued or as written; the app
// only chooses which issued day applies. The last answers are kept on the
// phone (app/data/kept-fetch.ts), so without signal the latest bulletin and
// reports still show, with their age.
//
// No v8 design exists for this layer: the panels reuse the grow panel, groups,
// rows and notes of the other panels.
import './avalanche.css';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  BANDS, BAND_NAMES, DANGER_COLOURS, avalancheData, titleParts, bulletinAt, dayAt, inkOn, mapValue, ratingLabel, setAvalancheData,
  type BandChoice, type Bulletin, type DangerValue, type FieldReport,
} from '../../core/avalanche/danger';
import { formatDateTime, formatRelative, formatWhen } from '../../core/units/format';
import { areasUrl, parseAreas, parseProducts, productsUrl, source as forecastSource } from '../../adapters/avalanche-canada/forecasts';
import { parseSubmissions, photoAt, source as minSource, submissionsUrl } from '../../adapters/avalanche-canada/min';
import { failureReason, fetchKept, keptAnswer } from '../data/kept-fetch';
import { savedOnlyActive } from '../data/connection';
import { closePanel, openPanel } from '../shell/panel';
import { colorToken, type Theme } from '../theme/tokens';
import { maplibregl } from '../map/maplibre';
import { issuedHtml } from './html';
import { anchorAt, el } from './dom';
import { setupAtes } from './ates';

/** Bulletins change once or twice a day: asking every 30 minutes is plenty, and polite. */
const FORECAST_TTL = 30 * 60_000;
const REPORTS_TTL = 10 * 60_000;

const MOUNTAIN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 19 6.5-11 4 6.5 2-3L21 19z"/><path d="m8 10.5 1.5 1.5 1.5-1.5"/></svg>';
const NOTE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/></svg>';
// The report pin: a neutral note mark (not a danger colour).
const PIN_GLYPH = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h7l3.5 3.5V20H7z"/><path d="M10 11h5M10 14.5h5"/></svg>';

export interface AvalancheOptions {
  theme(): Theme;
  settings(): Record<string, string | boolean>;
  /** New data arrived: the readout, chart and details should redraw. */
  onData(): void;
  /** The terrain ratings' legend line changed (areas loaded, zoom). */
  onLegend(): void;
}

/** The danger fill's opacity; with terrain ratings on it fades from zoom 8 to 10, where the zones appear. */
const fillOpacity = (atesShown: boolean): unknown[] => {
  const at = (o: number) => ['match', ['coalesce', ['feature-state', 'value'], 'none'], 'none', 0, o];
  // Always the same kind of expression (by zoom): MapLibre 6.18 throws when a
  // paint property changes between a zoom expression and a plain one.
  return ['interpolate', ['linear'], ['zoom'], 8, at(0.42), 10, at(atesShown ? 0.12 : 0.42)];
};

const bandOf = (s: Record<string, string | boolean>): BandChoice => (s.band === 'alp' || s.band === 'tln' || s.band === 'btl' ? s.band : 'highest');

/** The colour lookup the map runs on the device: rating value → official colour. */
const colourMatch = (none: string): unknown[] => ['match', ['coalesce', ['feature-state', 'value'], 'none'], ...Object.entries(DANGER_COLOURS).flat(), none];

export function setupAvalanche(map: MapLibreMap, opts: AvalancheOptions) {
  let active = false;
  let cursor: Date | null = null;
  let loading: Promise<void> | null = null;
  let fetchedAt = 0;
  let reports: { days: number; at: number; list: FieldReport[] } | null = null;
  let reportsLoading = '';
  const markers = new Map<string, maplibregl.Marker>();
  let layersAdded = false;
  let regionIds: string[] = [];
  /** Terrain ratings (ATES): the layer's switch, shown only with the layer. */
  const atesOn = () => active && opts.settings().ates === true;
  const ates = setupAtes(map, { theme: opts.theme, shown: atesOn, onChange: opts.onLegend });

  /** "Saved data only" asks for no network at all; the kept copy is shown instead. */
  const online = () => !savedOnlyActive();
  /** Why the last ask failed, for the top bar (null when it worked). */
  let lastFailure: string | null = null;
  /** True while showing the copy kept on the phone (no fresh answer this time). */
  let showingKept = false;

  /** Bulletins from the copy kept on the phone, when the network gives none. */
  async function fromKept(): Promise<boolean> {
    const [a, p] = await Promise.all([keptAnswer('avalanche-areas'), keptAnswer('avalanche-products')]);
    if (!a || !p) return false;
    setAvalancheData({ regions: parseAreas(a.json), bulletins: parseProducts(p.json), fetchedAt: new Date(Math.min(a.fetchedAt.getTime(), p.fetchedAt.getTime())), source: forecastSource.publisher });
    showingKept = true;
    drawRegions();
    return true;
  }

  async function loadForecasts(force = false): Promise<void> {
    if (!force && Date.now() - fetchedAt < FORECAST_TTL && avalancheData() && !showingKept) return;
    if (loading) return loading;
    loading = (async () => {
      try {
        if (!online()) {
          if (!avalancheData() && !(await fromKept())) setAvalancheData(null, true);
          return;
        }
        const [a, p] = await Promise.all([fetchKept(areasUrl(), 'avalanche-areas'), fetchKept(productsUrl(), 'avalanche-products')]);
        setAvalancheData({ regions: parseAreas(a.json), bulletins: parseProducts(p.json), fetchedAt: new Date(Math.min(a.fetchedAt.getTime(), p.fetchedAt.getTime())), source: forecastSource.publisher });
        showingKept = a.kept || p.kept;
        lastFailure = showingKept ? 'no answer' : null;
        fetchedAt = Date.now();
        drawRegions();
      } catch (err) {
        console.warn('no avalanche forecasts', err);
        lastFailure = failureReason(err);
        // Keep what was there, shown with its fetch time; ask again next time.
        if (!avalancheData()) setAvalancheData(null, true);
      } finally {
        loading = null;
        document.body.dataset.avalanche = avalancheData() ? 'ready' : 'error';
        opts.onData();
        paint();
      }
    })();
    return loading;
  }

  async function loadReports(): Promise<void> {
    const s = opts.settings();
    if (!active || s.reports === false) { showMarkers([]); return; }
    const days = Number(s.age) || 7;
    if (reports && reports.days === days && Date.now() - reports.at < REPORTS_TTL) { showMarkers(reports.list); return; }
    const key = `${days}`;
    if (reportsLoading === key) return;
    reportsLoading = key;
    try {
      // Kept per age choice, so without signal the last list for that span shows.
      const name = `avalanche-reports-${days}`;
      const got = online() ? await fetchKept(submissionsUrl(days, new Date()), name) : await keptAnswer(name);
      if (got) reports = { days, at: got.kept ? 0 : Date.now(), list: parseSubmissions(got.json) };
    } catch (err) {
      console.warn('no field reports', err);
    } finally {
      reportsLoading = '';
    }
    if (active && opts.settings().reports !== false) showMarkers(reports?.list ?? []);
  }

  function showMarkers(list: FieldReport[]) {
    const keep = new Set(list.map((r) => r.id));
    for (const [id, m] of markers) if (!keep.has(id)) { m.remove(); markers.delete(id); }
    for (const r of list) {
      if (markers.has(r.id)) continue;
      const b = el('button', 'avy-report-pin');
      b.type = 'button';
      b.innerHTML = `<span class="avy-report-dot">${PIN_GLYPH}</span>`;
      b.setAttribute('aria-label', `Field report: ${r.title || 'untitled'}, ${r.date}`);
      b.dataset.report = r.id;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const box = b.getBoundingClientRect();
        openReport(r, anchorAt(box.left + box.width / 2, box.top + box.height / 2));
      });
      const m = new maplibregl.Marker({ element: b, anchor: 'center' }).setLngLat([r.lon, r.lat]).addTo(map);
      markers.set(r.id, m);
    }
    document.body.dataset.avalancheReports = String(list.length);
  }

  function drawRegions() {
    const d = avalancheData();
    if (!d || !layersAdded) return;
    const src = map.getSource('avy-regions') as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: d.regions.map((r) => ({ type: 'Feature' as const, properties: { id: r.id, title: d.bulletins.get(r.id)?.title ?? '' }, geometry: r.geometry })),
    });
    regionIds = d.regions.map((r) => r.id);
  }

  /** The rating for the cursor's day goes on each region as a value; the map colours it on the device. */
  function paint() {
    const d = avalancheData();
    if (!layersAdded) return;
    const vis = active ? 'visible' : 'none';
    for (const id of ['avy-fill', 'avy-casing', 'avy-line']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    // With terrain ratings on, the danger colour fades as the zones come in, so
    // the zones read clearly; the region outlines keep their danger colour.
    if (map.getLayer('avy-fill')) map.setPaintProperty('avy-fill', 'fill-opacity', fillOpacity(atesOn()) as never);
    if (!d || !cursor || !active) return;
    const band = bandOf(opts.settings());
    for (const id of regionIds) {
      map.setFeatureState({ source: 'avy-regions', id }, { value: mapValue(d.bulletins.get(id), cursor, band) });
    }
    document.body.dataset.avalancheMap = 'ready';
  }

  function addLayers(fillBefore?: string, lineBefore?: string) {
    const t = opts.theme();
    map.addSource('avy-regions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' });
    map.addLayer({
      id: 'avy-fill', type: 'fill', source: 'avy-regions', layout: { visibility: 'none' },
      paint: {
        'fill-color': colourMatch('rgba(0,0,0,0)') as never,
        'fill-opacity': fillOpacity(false) as never,
      },
    }, fillBefore);
    // A neutral casing under each outline keeps every colour (white, black) readable on the map.
    map.addLayer({
      id: 'avy-casing', type: 'line', source: 'avy-regions', layout: { visibility: 'none', 'line-join': 'round' },
      paint: { 'line-color': colorToken('surface', t), 'line-width': 4, 'line-opacity': 0.75 },
    }, lineBefore);
    map.addLayer({
      id: 'avy-line', type: 'line', source: 'avy-regions', layout: { visibility: 'none', 'line-join': 'round' },
      paint: { 'line-color': colourMatch(colorToken('ink-2', t)) as never, 'line-width': 2 },
    }, lineBefore);
    layersAdded = true;
    ates.addLayers(lineBefore);
    drawRegions();
    paint();
  }

  function recolour(t: Theme) {
    if (!layersAdded) return;
    map.setPaintProperty('avy-casing', 'line-color', colorToken('surface', t));
    map.setPaintProperty('avy-line', 'line-color', colourMatch(colorToken('ink-2', t)) as never);
    ates.recolour(t);
  }

  /** The layer is on screen (or not), at this cursor time. */
  function update(isActive: boolean, t: Date | null) {
    const was = active;
    active = isActive;
    cursor = t;
    ates.sync();
    if (!active) {
      if (was) { showMarkers([]); paint(); }
      return;
    }
    void loadForecasts();
    void loadReports();
    paint();
  }

  /** A tap on the map while the layer is on: the region's full forecast, growing from the tap. */
  function tapped(point: { x: number; y: number }, lngLat: { lng: number; lat: number }) {
    if (!active) return;
    // Terrain ratings first: a tap on a zone, line, point or area opens that.
    if (ates.tapped(point, lngLat)) return;
    const here = bulletinAt(lngLat.lng, lngLat.lat);
    if (!here) return;
    const r = map.getContainer().getBoundingClientRect();
    openRegion(here.bulletin, anchorAt(r.left + point.x, r.top + point.y));
  }

  // ---- The region's forecast ------------------------------------------------

  function dangerCell(value: DangerValue, text: string, number: string): HTMLElement {
    const c = el('span', 'avy-cell');
    c.style.background = DANGER_COLOURS[value];
    c.style.color = inkOn(value);
    if (value === 'norating' || value === 'offseason' || value === 'noforecast') c.dataset.light = 'true';
    if (number) c.append(el('span', 'avy-cell-number', number));
    c.append(el('span', 'avy-cell-name', text));
    return c;
  }

  function dangerTable(b: Bulletin): HTMLElement {
    const t = el('table', 'avy-table');
    const head = el('tr');
    head.append(el('th'));
    const today = cursor ? dayAt(b, cursor) : { kind: 'none' as const };
    b.days.forEach((d, i) => {
      const th = el('th', today.kind === 'day' && today.index === i ? 'avy-now' : '', d.label);
      head.append(th);
    });
    t.append(head);
    for (const band of BANDS) {
      const tr = el('tr');
      tr.dataset.band = band;
      tr.append(el('th', 'avy-band', BAND_NAMES[band]));
      b.days.forEach((d, i) => {
        const r = d.ratings[band];
        const td = el('td', today.kind === 'day' && today.index === i ? 'avy-now' : '');
        const n = ratingLabel(r) === r.display ? '' : ratingLabel(r).replace(/^.*\((\d)\)$/, '$1');
        td.append(dangerCell(r.value, r.display, n));
        tr.append(td);
      });
      t.append(tr);
    }
    return t;
  }

  function section(title: string, ...body: Node[]): HTMLElement {
    const g = el('div', 'group avy-section');
    g.append(el('span', 'group-title', title), ...body);
    return g;
  }

  function openRegion(b: Bulletin | null, origin: HTMLElement) {
    const body = el('div', 'panel-groups avy-forecast');
    const now = new Date();
    if (!b) {
      body.append(el('p', 'panel-note', 'No forecast is issued for this region.'));
      openPanel({ origin, icon: MOUNTAIN, title: 'Avalanche forecast', caption: 'No forecast', body, onClose: () => origin.remove() });
      return;
    }
    const times = el('div', 'avy-times');
    times.append(
      el('span', '', `Issued ${formatDateTime(b.issued)} (${formatRelative(b.issued, now)})`),
      el('span', b.validUntil < now ? 'avy-expired' : '', `${b.validUntil < now ? 'Expired' : 'Valid until'} ${formatDateTime(b.validUntil)}`),
      el('span', '', b.forecaster && b.forecaster !== b.owner ? `${b.owner} · ${b.forecaster}` : b.owner),
    );
    body.append(times);
    const where = cursor ? dayAt(b, cursor) : { kind: 'none' as const };
    if (where.kind === 'none') body.append(el('p', 'avy-flag', 'No forecast for the day under the time cursor. The days below are the ones issued.'));
    if (where.kind === 'seasonal') body.append(el('p', 'avy-flag', `${where.rating.display}: the rating below applies while this bulletin is valid.`));
    body.append(section('DANGER RATINGS', dangerTable(b)));
    if (b.highlights.trim()) body.append(section('HIGHLIGHTS', issuedHtml(b.highlights)));
    if (b.confidence) {
      const c = el('div', 'avy-text');
      c.append(el('p', '', `Confidence: ${b.confidence.display}`));
      for (const s of b.confidence.statements) c.append(el('p', '', s));
      body.append(section('CONFIDENCE', c));
    }
    if (b.problems.length) {
      const list = el('div', 'avy-problems');
      for (const p of b.problems) {
        const row = el('article', 'avy-problem');
        row.append(el('span', 'avy-problem-name', p.name));
        const facts: [string, string][] = [];
        if (p.elevations.length) facts.push(['Elevation', p.elevations.join(', ')]);
        if (p.aspects.length) facts.push(['Aspects', p.aspects.join(', ')]);
        if (p.likelihood) facts.push(['Likelihood', p.likelihood]);
        if (p.size) facts.push(['Expected size', p.size.min === p.size.max ? p.size.min : `${p.size.min} – ${p.size.max}`]);
        const dl = el('dl', 'avy-facts');
        for (const [k, v] of facts) dl.append(el('dt', '', k), el('dd', '', v));
        row.append(dl);
        if (p.html.trim()) row.append(issuedHtml(p.html));
        list.append(row);
      }
      body.append(section('AVALANCHE PROBLEMS', list));
    }
    if (b.travelAdvice.length) {
      const ul = el('ul', 'avy-text');
      for (const a of b.travelAdvice) ul.append(el('li', '', a));
      body.append(section('TERRAIN AND TRAVEL ADVICE', ul));
    }
    for (const s of b.summaries) {
      const d = el('details', 'avy-summary');
      const sum = el('summary', '', s.title);
      d.append(sum, issuedHtml(s.html));
      body.append(d);
    }
    for (const n of b.notifications) body.append(section('NOTICE', issuedHtml(n)));
    const { short, names } = titleParts(b.title);
    if (names.length) {
      const d = el('details', 'avy-summary');
      d.append(el('summary', '', `Regions covered (${names.length})`), el('p', 'avy-text', names.join(', ')));
      body.append(d);
    }
    const link = el('a', 'link-row avy-link');
    link.href = b.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(el('span', '', 'Read the full forecast on avalanche.ca'));
    body.append(link);
    const d = avalancheData();
    const note = el('p', 'panel-note', `${forecastSource.attribution}. As issued; fetched ${d ? formatWhen(d.fetchedAt, now) : '–'}. Kept on the phone for use without signal.`);
    body.append(note);
    openPanel({ origin, icon: MOUNTAIN, title: short, caption: 'Avalanche forecast · as issued', body, onClose: () => origin.remove() });
    document.body.dataset.avalanchePanel = 'region';
  }

  // ---- A field report -------------------------------------------------------

  function openPhoto(r: FieldReport, i: number) {
    const img = r.images[i];
    if (!img) return;
    const box = el('div', 'avy-photo-view');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `Photo ${i + 1} of ${r.images.length}`);
    const close = el('button', 'avy-photo-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close photo');
    close.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const pic = el('img', 'avy-photo-large');
    pic.crossOrigin = 'anonymous';
    pic.decoding = 'async';
    // Sized for the phone's screen, not the 2000 px original.
    pic.src = photoAt(img.url, Math.min(1600, Math.round(window.innerWidth * (window.devicePixelRatio || 1))));
    pic.alt = `Photo ${i + 1} from “${r.title}”`;
    const cap = el('span', 'avy-photo-caption', `${i + 1} / ${r.images.length} · ${r.author ?? 'MIN user'}`);
    box.append(pic, cap, close);
    const done = () => { box.remove(); document.removeEventListener('keydown', key, true); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
    close.addEventListener('click', done);
    box.addEventListener('click', (e) => { if (e.target === box) done(); });
    document.addEventListener('keydown', key, true);
    document.body.append(box);
    close.focus();
  }

  function openReport(r: FieldReport, origin: HTMLElement) {
    const body = el('div', 'panel-groups avy-report');
    const meta = el('div', 'avy-times');
    meta.append(
      el('span', '', [r.date, r.author ? `by ${r.author}` : ''].filter(Boolean).join(' · ')),
      el('span', '', [r.region, r.activities.join(', ')].filter(Boolean).join(' · ')),
    );
    body.append(meta);
    if (r.text.trim()) {
      const t = el('p', 'avy-observations', r.text);
      body.append(section('OBSERVATIONS', t));
    }
    if (r.images.length) {
      const grid = el('div', 'avy-photos');
      r.images.forEach((img, i) => {
        const b = el('button', 'avy-thumb');
        b.type = 'button';
        b.setAttribute('aria-label', `Open photo ${i + 1} of ${r.images.length}`);
        const pic = el('img');
        pic.loading = 'lazy';
        pic.decoding = 'async';
        pic.crossOrigin = 'anonymous';
        pic.src = photoAt(img.url, 320);
        pic.alt = '';
        if (img.width && img.height) { pic.width = 320; pic.height = Math.round((320 * img.height) / img.width); }
        pic.addEventListener('error', () => { b.dataset.failed = 'true'; b.textContent = 'Photo could not load'; }, { once: true });
        b.append(pic);
        b.addEventListener('click', () => openPhoto(r, i));
        grid.append(b);
      });
      body.append(section(`PHOTOS · ${r.images.length}`, grid));
    }
    const link = el('a', 'link-row avy-link');
    link.href = r.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(el('span', '', 'Open this report on avalanche.ca'));
    body.append(link, el('p', 'panel-note', `${minSource.attribution}. Shown as written; not checked by Avalanche Canada or Tempest. Kept on the phone for use without signal.`));
    openPanel({ origin, icon: NOTE, title: r.title || 'Field report', caption: 'Mountain Information Network report', body, onClose: () => origin.remove() });
    document.body.dataset.avalanchePanel = 'report';
  }

  /** The top bar's line while the layer is on: the pin's bulletin and its age. */
  function ageLine(lon: number, lat: number): { text: string; stale: boolean } {
    const d = avalancheData();
    if (!d) {
      if (loading) return { text: 'Loading Avalanche Canada…', stale: false };
      if (!online()) return { text: 'Saved data only is on · no avalanche copy kept yet', stale: true };
      return { text: `Avalanche Canada did not answer (${lastFailure ?? 'not asked yet'}) · tap to retry`, stale: true };
    }
    // The copy kept on the phone: shown with when it was fetched, never hidden.
    if (showingKept) return { text: `Avalanche Canada · kept copy from ${formatWhen(d.fetchedAt, new Date())} · tap to retry`, stale: true };
    const here = bulletinAt(lon, lat);
    const b = here?.bulletin;
    const now = new Date();
    if (!b) return { text: `${d.source} · fetched ${formatWhen(d.fetchedAt, now)}`, stale: false };
    const expired = b.validUntil < now;
    return { text: `${b.owner} · issued ${formatRelative(b.issued, now)}${expired ? ' · expired' : ''}`, stale: expired };
  }

  /** Ask again now (a tap on the top bar's line after a failure). */
  const retry = () => { reports = null; void loadForecasts(true); void loadReports(); ates.retry(); };
  const needsRetry = () => !avalancheData() || showingKept;
  return { addLayers, update, tapped, recolour, ageLine, retry, needsRetry, atesLegend: (doc: Document) => (atesOn() ? ates.legend(doc) : null), refresh: () => { void loadForecasts(); void loadReports(); paint(); }, close: closePanel };
}
