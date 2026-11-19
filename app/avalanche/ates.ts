// Avalanche terrain ratings (ATES) on the map, inside the avalanche layer:
// Avalanche Canada's ATES areas, zones in the scale's colours, rated lines,
// access routes and points of interest, as published. Off until the layer's
// "Terrain ratings (ATES)" switch (or the round button beside the map) is on.
//
// - Below FETCH_ZOOM only the areas' outlines show, from the index the app
//   ships (public/ates/index.json, made by tools/ates-index.mjs). A tap on one
//   names it and offers to zoom in.
// - From FETCH_ZOOM, the files for the areas on screen are asked for, nearest
//   the centre first, one at a time and at most MAX_AT_ONCE for one view. Each
//   is kept on the phone (Cache Storage) and reused for FRESH_MS without
//   asking again, so an area seen once works without signal. Nothing is
//   fetched ahead of time.
// - A tap on a zone, line or point opens what the file says about it, with a
//   link to the Trip Planner.
//
// No v8 design exists for this: the panels reuse the avalanche panels' parts.
import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import {
  ATES_BOUNDARY_COLOUR, ATES_CLASSES, ATES_COLOURS, ATES_PATH_COLOUR, ATES_ROUTE_COLOUR, ATES_ZONE_OPACITY, POINT_NAMES,
  areasInView, atesFeatures, atesLabel, indexAreaAt, pointImage, ratingsIn,
  type AtesArea, type AtesFeatureProps, type AtesIndex, type AtesIndexArea, type AtesPointKind, type AtesRating,
} from '../../core/avalanche/ates';
import { formatWhen } from '../../core/units/format';
import { areaUrl, parseAtesKmz, source, tripPlannerUrl } from '../../adapters/avalanche-canada/ates';
import { failureReason, fetchKeptBytes } from '../data/kept-fetch';
import { savedOnlyActive } from '../data/connection';
import { openPanel } from '../shell/panel';
import { colorToken, type Theme } from '../theme/tokens';
import type { maplibregl } from '../map/maplibre';
import { anchorAt, el } from './dom';

/** Zones appear from here; below it, only the areas' outlines. */
export const FETCH_ZOOM = 10;
/** At most this many area files asked for one view (the nearest the centre). */
const MAX_AT_ONCE = 3;
/** Areas kept parsed in memory. */
const MAX_IN_MEMORY = 12;
/** A kept file is reused this long without asking again (ratings change rarely). */
const FRESH_MS = 30 * 24 * 3_600_000;

const TERRAIN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 19.5 7-12 4 6.5 2.5-3.5 5.5 9z"/><path d="M6 13.5h7.5M4.5 16.5h15"/></svg>';
const POINT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';
/** The round button's icon: a mountain split into bands of terrain. */
export const ATES_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 19.5 7-12 4 6.5 2.5-3.5 5.5 9z"/><path d="M6 13.5h7.5M4.5 16.5h15"/></svg>';

const LAYERS = ['ates-outline-casing', 'ates-outline', 'ates-zone-fill', 'ates-zone-halo', 'ates-zone-edge', 'ates-boundary-casing', 'ates-boundary', 'ates-path', 'ates-route-casing', 'ates-route', 'ates-rated-line', 'ates-points', 'ates-decision'] as const;
/** Tap order: the smallest thing under the finger wins. */
const TAP_LAYERS = ['ates-decision', 'ates-points', 'ates-rated-line', 'ates-path', 'ates-route', 'ates-zone-fill'];

export interface AtesOptions {
  theme(): Theme;
  /** The switch is on and the avalanche layer is shown. */
  shown(): boolean;
  /** Something the legend shows changed (areas loaded, a failure). */
  onChange(): void;
}

const colourMatch = (fallback: string): unknown[] => ['match', ['get', 'rating'], ...Object.entries(ATES_COLOURS).flat(), fallback];

export function setupAtes(map: MapLibreMap, opts: AtesOptions) {
  let index: AtesIndexArea[] | null = null;
  let indexLoading: Promise<void> | null = null;
  let layersAdded = false;
  /** Parsed areas, most recently used last. */
  const areas = new Map<number, { area: AtesArea; fetchedAt: Date; kept: boolean }>();
  const failed = new Map<number, string>();
  let loadingId: number | null = null;
  let queue: AtesIndexArea[] = [];
  const images = new Map<AtesPointKind, Uint8Array>();

  async function loadIndex(): Promise<void> {
    if (index || indexLoading) return indexLoading ?? undefined;
    indexLoading = (async () => {
      try {
        const res = await fetch(new URL('ates/index.json', document.baseURI));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        index = ((await res.json()) as AtesIndex).areas;
        drawOutlines();
        document.body.dataset.atesIndex = String(index.length);
      } catch (err) {
        console.warn('no ATES index', err);
      } finally {
        indexLoading = null;
        opts.onChange();
      }
    })();
    return indexLoading;
  }

  function drawOutlines() {
    const src = map.getSource('ates-outlines') as maplibregl.GeoJSONSource | undefined;
    if (!src || !index) return;
    src.setData({
      type: 'FeatureCollection',
      features: index.map((a) => ({ type: 'Feature' as const, properties: { id: a.id, name: a.name }, geometry: { type: 'MultiPolygon' as const, coordinates: a.outline } })),
    });
  }

  function drawAreas() {
    const src = map.getSource('ates') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: [...areas.values()].flatMap((a) => atesFeatures(a.area)) as never });
    document.body.dataset.atesAreas = [...areas.keys()].join(',');
  }

  // ---- Icons: the file's own pictures, on a neutral round plate ------------

  /** A PNG from the file as a picture; gives up after 5 s (seen hanging in headless Chromium). */
  async function decodePng(png: Uint8Array): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }));
    try {
      const img = new Image();
      img.src = url;
      await Promise.race([img.decode(), new Promise((_, no) => setTimeout(() => no(new Error('icon decode timed out')), 5000))]);
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** The file's icon tinted to the theme's ink when it is a black glyph (parking, cabin, destination); coloured icons (decision point) keep their colours. */
  async function drawIcon(kind: AtesPointKind, png: Uint8Array | null, t: Theme): Promise<ImageData> {
    const ratio = 2, size = kind === 'other' ? 16 : 26, px = size * ratio;
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const ctx = c.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, px / 2 - ratio, 0, Math.PI * 2);
    ctx.fillStyle = colorToken('surface', t);
    ctx.fill();
    ctx.lineWidth = 1.5 * ratio;
    ctx.strokeStyle = colorToken('ink', t);
    ctx.stroke();
    if (png) {
      try {
        const bmp = await decodePng(png);
        const g = document.createElement('canvas');
        const inner = Math.round(px * 0.62);
        g.width = inner; g.height = inner;
        const gx = g.getContext('2d')!;
        gx.drawImage(bmp, 0, 0, inner, inner);
        const data = gx.getImageData(0, 0, inner, inner).data;
        let lum = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 128) { lum += data[i]! + data[i + 1]! + data[i + 2]!; n++; }
        if (n && lum / n / 3 < 60) {
          gx.globalCompositeOperation = 'source-in';
          gx.fillStyle = colorToken('ink', t);
          gx.fillRect(0, 0, inner, inner);
        }
        ctx.drawImage(g, (px - inner) / 2, (px - inner) / 2);
      } catch { /* the plate alone */ }
    } else {
      ctx.beginPath();
      ctx.arc(px / 2, px / 2, px * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = colorToken('ink', t);
      ctx.fill();
    }
    return ctx.getImageData(0, 0, px, px);
  }

  async function addIcons(kinds: Iterable<AtesPointKind>, t: Theme, replace = false) {
    for (const k of kinds) {
      const name = pointImage(k);
      if (map.hasImage(name) && !replace) continue;
      const img = await drawIcon(k, images.get(k) ?? null, t);
      if (map.hasImage(name)) map.updateImage(name, img);
      else map.addImage(name, img, { pixelRatio: 2 });
    }
  }

  // ---- Loading area files ---------------------------------------------------

  async function loadArea(a: AtesIndexArea): Promise<void> {
    loadingId = a.id;
    document.body.dataset.atesLoading = String(a.id);
    opts.onChange();
    try {
      const got = await fetchKeptBytes(areaUrl(a.id), `ates-area-${a.id}`, FRESH_MS, !savedOnlyActive());
      if (!got) { failed.set(a.id, 'not kept on this phone'); return; }
      const file = await parseAtesKmz(a.id, got.bytes);
      const area = file.area;
      for (const p of area.points) {
        const png = p.icon ? file.images.get(p.icon) : undefined;
        if (png && !images.has(p.kind)) images.set(p.kind, png);
      }
      areas.delete(a.id);
      areas.set(a.id, { area, fetchedAt: got.fetchedAt, kept: got.kept });
      while (areas.size > MAX_IN_MEMORY) areas.delete(areas.keys().next().value!);
      failed.delete(a.id);
      drawAreas();
      // The icons follow; the zones do not wait for them.
      void addIcons(new Set(area.points.map((p) => p.kind)), opts.theme()).catch((err) => console.warn('ATES icons', err));
    } catch (err) {
      console.warn(`no ATES area ${a.id}`, err);
      failed.set(a.id, failureReason(err));
      document.body.dataset.atesFailed = [...failed.keys()].join(',');
    } finally {
      loadingId = null;
      delete document.body.dataset.atesLoading;
      opts.onChange();
    }
  }

  async function pump() {
    while (queue.length && loadingId === null) {
      const next = queue.shift()!;
      if (areas.has(next.id) || failed.has(next.id)) continue;
      await loadArea(next);
    }
  }

  /** The areas on screen, from FETCH_ZOOM: ask for the nearest few not yet held. */
  function want() {
    if (!opts.shown() || !index || map.getZoom() < FETCH_ZOOM) { queue = []; return; }
    const b = map.getBounds();
    const c = map.getCenter();
    const inView = areasInView(index, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], [c.lng, c.lat]).slice(0, MAX_AT_ONCE);
    for (const a of inView) if (areas.has(a.id)) { const v = areas.get(a.id)!; areas.delete(a.id); areas.set(a.id, v); }
    queue = inView.filter((a) => !areas.has(a.id) && !failed.has(a.id) && a.id !== loadingId);
    void pump();
  }

  // ---- Map layers -----------------------------------------------------------

  function addLayers(before?: string) {
    const t = opts.theme();
    map.addSource('ates-outlines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('ates', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const hidden = { visibility: 'none' as const };
    // Areas at low zoom: a neutral outline (the file's white edge would vanish on a light map).
    map.addLayer({ id: 'ates-outline-casing', type: 'line', source: 'ates-outlines', maxzoom: FETCH_ZOOM, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': colorToken('surface', t), 'line-width': 4, 'line-opacity': 0.8 } }, before);
    map.addLayer({ id: 'ates-outline', type: 'line', source: 'ates-outlines', maxzoom: FETCH_ZOOM, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': colorToken('ink', t), 'line-width': 1.6 } }, before);
    // Zones: the publisher's colours, half see-through as the files draw them; a thin edge in the same colour over a faint neutral halo, so black reads on the dark map.
    const zone = ['==', ['get', 'kind'], 'zone'];
    map.addLayer({ id: 'ates-zone-fill', type: 'fill', source: 'ates', filter: zone as never, layout: hidden, paint: { 'fill-color': colourMatch('#808080') as never, 'fill-opacity': ATES_ZONE_OPACITY } }, before);
    map.addLayer({ id: 'ates-zone-halo', type: 'line', source: 'ates', filter: zone as never, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': colorToken('ink', t), 'line-width': 2.4, 'line-opacity': 0.35 } }, before);
    map.addLayer({ id: 'ates-zone-edge', type: 'line', source: 'ates', filter: zone as never, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': colourMatch('#808080') as never, 'line-width': 1 } }, before);
    const boundary = ['==', ['get', 'kind'], 'boundary'];
    map.addLayer({ id: 'ates-boundary-casing', type: 'line', source: 'ates', filter: boundary as never, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': colorToken('ink-2', t), 'line-width': 4.5 } }, before);
    map.addLayer({ id: 'ates-boundary', type: 'line', source: 'ates', filter: boundary as never, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': ATES_BOUNDARY_COLOUR, 'line-width': 2.5 } }, before);
    map.addLayer({ id: 'ates-path', type: 'line', source: 'ates', filter: ['==', ['get', 'kind'], 'path'] as never, layout: { ...hidden, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ATES_PATH_COLOUR, 'line-width': 2.5 } }, before);
    const route = ['==', ['get', 'kind'], 'route'];
    map.addLayer({ id: 'ates-route-casing', type: 'line', source: 'ates', filter: route as never, layout: { ...hidden, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': colorToken('ink-2', t), 'line-width': 5 } }, before);
    map.addLayer({ id: 'ates-route', type: 'line', source: 'ates', filter: route as never, layout: { ...hidden, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ATES_ROUTE_COLOUR, 'line-width': 2.5 } }, before);
    map.addLayer({ id: 'ates-rated-line', type: 'line', source: 'ates', filter: ['==', ['get', 'kind'], 'rated-line'] as never, layout: { ...hidden, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': colourMatch('#808080') as never, 'line-width': 5, 'line-opacity': 0.85 } }, before);
    // Points on top of everything (labels included), so they are never hidden by a place name.
    // Decision points in a layer of their own above the others, so a cabin or car park beside one never covers it.
    const icon = { ...hidden, 'icon-image': ['get', 'icon'] as never, 'icon-allow-overlap': true, 'icon-ignore-placement': true };
    map.addLayer({ id: 'ates-points', type: 'symbol', source: 'ates', filter: ['all', ['==', ['get', 'kind'], 'point'], ['!=', ['get', 'pointKind'], 'decision-point']] as never, layout: icon });
    map.addLayer({ id: 'ates-decision', type: 'symbol', source: 'ates', filter: ['==', ['get', 'pointKind'], 'decision-point'] as never, layout: icon });
    layersAdded = true;
    drawOutlines();
    drawAreas();
    sync();
  }

  function recolour(t: Theme) {
    if (!layersAdded) return;
    map.setPaintProperty('ates-outline-casing', 'line-color', colorToken('surface', t));
    map.setPaintProperty('ates-outline', 'line-color', colorToken('ink', t));
    map.setPaintProperty('ates-zone-halo', 'line-color', colorToken('ink', t));
    map.setPaintProperty('ates-boundary-casing', 'line-color', colorToken('ink-2', t));
    map.setPaintProperty('ates-route-casing', 'line-color', colorToken('ink-2', t));
    void addIcons([...images.keys(), 'other', 'parking', 'cabin', 'destination', 'decision-point', 'first-aid'].filter((k, i, all) => all.indexOf(k) === i && map.hasImage(pointImage(k as AtesPointKind))) as AtesPointKind[], t, true);
  }

  /** Show or hide everything for the switch; ask for what the view needs. */
  function sync() {
    const on = opts.shown();
    document.body.dataset.ates = on ? 'on' : 'off';
    if (!layersAdded) return;
    for (const id of LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    if (!on) { queue = []; return; }
    void loadIndex().then(want);
  }

  map.on('moveend', () => { if (opts.shown()) { want(); opts.onChange(); } });
  // Once the map settles (3D terrain can still be loading when a move ends),
  // ask again for what the view needs; areas held or asked for are skipped.
  map.on('idle', () => { if (opts.shown() && index && !queue.length && loadingId === null) want(); });

  // ---- Taps -----------------------------------------------------------------

  const props = (f: MapGeoJSONFeature) => f.properties as unknown as AtesFeatureProps;

  /** A tap while the switch is on: true when it was on ATES terrain and a panel opened. */
  function tapped(point: { x: number; y: number }, lngLat: { lng: number; lat: number }): boolean {
    if (!opts.shown() || !layersAdded) return false;
    const r = map.getContainer().getBoundingClientRect();
    const origin = () => anchorAt(r.left + point.x, r.top + point.y);
    if (map.getZoom() >= FETCH_ZOOM) {
      const box: [[number, number], [number, number]] = [[point.x - 10, point.y - 10], [point.x + 10, point.y + 10]];
      for (const layer of TAP_LAYERS) {
        const hits = map.queryRenderedFeatures(layer === 'ates-zone-fill' ? [point.x, point.y] : box, { layers: [layer] });
        const f = hits[0];
        if (f) { openFeature(props(f), origin()); return true; }
      }
      return false;
    }
    const a = index && indexAreaAt(index, lngLat.lng, lngLat.lat);
    if (!a) return false;
    openArea(a, origin());
    return true;
  }

  function tripLink(): HTMLElement {
    const link = el('a', 'link-row avy-link');
    link.href = tripPlannerUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(el('span', '', 'Open the Trip Planner on avalanche.ca'));
    return link;
  }

  function sourceNote(areaId: number): HTMLElement {
    const held = areas.get(areaId);
    const when = held ? `${held.kept ? 'kept on the phone, fetched' : 'fetched'} ${formatWhen(held.fetchedAt, new Date())}` : '';
    return el('p', 'panel-note', `${source.attribution}. As published${when ? `; ${when}` : ''}. Terrain ratings describe the terrain, not today’s danger: read them with the forecast.`);
  }

  function swatch(r: AtesRating): HTMLElement {
    const s = el('span', 'ates-swatch');
    s.style.background = ATES_COLOURS[r];
    return s;
  }

  function openArea(a: AtesIndexArea, origin: HTMLElement) {
    const body = el('div', 'panel-groups ates-panel');
    const counts = el('div', 'ates-counts');
    for (const [r, n] of Object.entries(a.zones) as [AtesRating, number][]) {
      const row = el('span', 'ates-count');
      row.append(swatch(r), el('span', '', `${ATES_CLASSES[r].name}: ${n} zone${n === 1 ? '' : 's'}`));
      counts.append(row);
    }
    const g = el('div', 'group avy-section');
    g.append(el('span', 'group-title', 'TERRAIN RATINGS'), counts);
    body.append(g);
    const zoom = el('button', 'secondary-button ates-zoom', 'Zoom in to see the zones');
    zoom.type = 'button';
    zoom.addEventListener('click', () => {
      origin.remove();
      document.querySelector<HTMLButtonElement>('.panel-close')?.click();
      map.fitBounds(a.bbox, { padding: 40, maxZoom: 13, duration: 700 });
    });
    body.append(zoom, tripLink(), sourceNote(a.id));
    openPanel({ origin, icon: TERRAIN, title: a.name, caption: 'Avalanche terrain ratings (ATES) area', body, onClose: () => origin.remove() });
    document.body.dataset.atesPanel = 'area';
  }

  function openFeature(p: AtesFeatureProps, origin: HTMLElement) {
    const body = el('div', 'panel-groups ates-panel');
    let title = p.name || 'Unnamed', caption = '';
    if (p.kind === 'zone' || p.kind === 'rated-line') {
      const r = p.rating!;
      const head = el('div', 'ates-rating');
      head.append(swatch(r), el('span', 'ates-rating-name', atesLabel(r)));
      body.append(head);
      title = `${ATES_CLASSES[r].name} terrain`;
      caption = `${p.kind === 'zone' ? 'Zone' : 'Rated line'} in ${p.areaName}`;
    } else if (p.kind === 'point') {
      caption = `${POINT_NAMES[p.pointKind ?? 'other']} in ${p.areaName}`;
    } else if (p.kind === 'route') {
      caption = `Access route in ${p.areaName}`;
    } else if (p.kind === 'path') {
      caption = `Avalanche path in ${p.areaName}`;
    }
    const parts = p.parts ? (JSON.parse(p.parts) as { heading: string; items: string[] }[]) : [];
    for (const part of parts) {
      const g = el('div', 'group avy-section');
      const ul = el('ul', 'avy-text');
      for (const item of part.items) ul.append(el('li', '', item));
      g.append(el('span', 'group-title', part.heading.toUpperCase()), ul);
      body.append(g);
    }
    if (!parts.length && p.description.trim() && p.description.trim() !== p.name.trim()) {
      const g = el('div', 'group avy-section');
      g.append(el('span', 'group-title', p.kind === 'zone' || p.kind === 'rated-line' ? 'WHAT THE CLASS MEANS' : 'DESCRIPTION'), el('p', 'avy-text', p.description.trim()));
      body.append(g);
    }
    body.append(tripLink(), sourceNote(p.areaId));
    openPanel({ origin, icon: p.kind === 'point' ? POINT : TERRAIN, title, caption, body, onClose: () => origin.remove() });
    document.body.dataset.atesPanel = p.kind;
  }

  // ---- Legend ---------------------------------------------------------------

  /** The legend line under the danger legend: the classes in view, routes, and what is happening. */
  function legend(doc: Document): HTMLElement {
    const box = doc.createElement('div');
    box.className = 'legend legend-ates';
    const held = [...areas.values()].map((a) => a.area);
    const shown = ratingsIn(held);
    const classes: AtesRating[] = shown.length ? shown : ['simple', 'challenging', 'complex'];
    box.setAttribute('aria-label', `Terrain ratings: ${classes.map((r) => ATES_CLASSES[r].name).join(', ')}`);
    for (const r of classes) {
      const s = doc.createElement('span');
      s.className = 'legend-item';
      s.append(swatch(r), Object.assign(doc.createElement('span'), { textContent: ATES_CLASSES[r].name }));
      box.append(s);
    }
    const status = doc.createElement('span');
    status.className = 'legend-range ates-status';
    status.textContent = statusText();
    box.append(status);
    return box;
  }

  function statusText(): string {
    if (!index) return indexLoading ? 'Loading areas…' : 'Areas unavailable';
    if (map.getZoom() < FETCH_ZOOM) return 'Zoom in for zones';
    if (loadingId !== null) return `Loading ${index.find((a) => a.id === loadingId)?.name ?? 'area'}…`;
    const b = map.getBounds();
    const inView = areasInView(index, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    if (!inView.length) return 'No rated area here';
    const miss = inView.slice(0, MAX_AT_ONCE).find((a) => failed.has(a.id));
    if (miss) return savedOnlyActive() ? 'Not kept on this phone' : `Not reachable (${failed.get(miss.id)})`;
    return inView.length > MAX_AT_ONCE ? 'Zoom in for more areas' : '';
  }

  /** Forget failures so the next view asks again (the top bar's retry). */
  const retry = () => { failed.clear(); want(); };

  return { addLayers, sync, tapped, recolour, legend, retry, want };
}
