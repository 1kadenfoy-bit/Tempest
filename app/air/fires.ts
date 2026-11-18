// The Air quality layer's fires: BC Wildfire Service's fire locations as
// neutral marks (a flame on a plate, the same for every fire: BC Wildfire's
// own status colours were not found published, so the status is given in
// words), their mapped perimeters as thin outlines, and a panel with the fire
// as issued when a mark is tapped. Which fires show follows the time cursor:
// from the present hour on, every fire not "Out"; before it, the fires whose
// issued dates say they were burning that day (core/air/fires.ts).
//
// Kept on the phone (app/data/kept-fetch.ts): the latest list, so without
// signal the fires still show, with the time they were fetched.
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { bcDate, burningAt, fireTitle, type Fire } from '../../core/air/fires';
import { formatCursorTime, formatHectares, formatWhen } from '../../core/units/format';
import { centreName, parsePerimeters, parsePoints, perimetersUrl, pointsUrl, source, type Perimeter } from '../../adapters/bc-wildfire/fires';
import { fetchKept, keptAnswer, failureReason } from '../data/kept-fetch';
import { openPanel } from '../shell/panel';
import { colorToken, type Theme } from '../theme/tokens';
import { anchorAt, el } from '../avalanche/dom';

/** BC Wildfire refreshes about every 15 minutes; asking every 30 is polite. */
const TTL = 30 * 60_000;
/** Fires declared out this many days back are still asked for (the cursor reaches 2 days back). */
const SINCE_DAYS = 3;
/** Perimeters are asked for the largest fires only, so the address stays short. */
const MAX_PERIMETERS = 120;

const FLAME = 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.4-4.6.2 1.6.9 2.6 2 3.1-.5-3.3.2-5.9.6-8.5z';
const ICON = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="${FLAME}"/></svg>`;

export interface FiresOptions {
  theme(): Theme;
  online(): boolean;
  onData(list: Fire[] | null, fetchedAt: Date | null, kept: boolean): void;
}

const dateText = (d: string | null) => {
  if (!d) return '';
  const t = new Date(`${d}T12:00:00Z`);
  return Number.isNaN(t.getTime()) ? d : new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(t);
};

export function setupFires(map: MapLibreMap, opts: FiresOptions) {
  let list: Fire[] = [];
  let perimeters: Perimeter[] = [];
  let fetchedAt: Date | null = null;
  let kept = false;
  let at = 0;
  let loading: Promise<void> | null = null;
  let failure: string | null = null;
  let added = false;
  let shown = false;
  let showPerimeters = true;
  let cursor: Date | null = null;

  /** The flame plate, drawn on the device in the theme's ink and surface. */
  function image(t: Theme): ImageData {
    const s = 2, size = 26 * s;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - s, 0, Math.PI * 2);
    g.fillStyle = colorToken('surface', t); g.fill();
    g.lineWidth = 1.5 * s; g.strokeStyle = colorToken('ink', t); g.stroke();
    g.translate(size / 2 - 12 * 0.75 * s, size / 2 - 12.5 * 0.75 * s);
    g.scale(0.75 * s, 0.75 * s);
    g.fillStyle = colorToken('ink', t);
    g.fill(new Path2D(FLAME));
    return g.getImageData(0, 0, size, size);
  }

  function addLayers(before?: string) {
    const t = opts.theme();
    map.addImage('air-fire', image(t), { pixelRatio: 2 });
    map.addSource('air-perimeters', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'air-perimeters-fill', type: 'fill', source: 'air-perimeters', layout: { visibility: 'none' }, paint: { 'fill-color': colorToken('ink', t), 'fill-opacity': 0.08 } }, before);
    map.addLayer({ id: 'air-perimeters-line', type: 'line', source: 'air-perimeters', layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': colorToken('ink', t), 'line-width': 1.4, 'line-opacity': 0.85 } }, before);
    map.addSource('air-fires', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'air-fires', type: 'symbol', source: 'air-fires',
      layout: {
        visibility: 'none', 'icon-image': 'air-fire', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        // A fire of note (BC Wildfire's own flag) a little larger.
        'icon-size': ['case', ['get', 'note'], 1.25, 0.9],
        'symbol-sort-key': ['case', ['get', 'note'], 1, 0],
      },
    });
    added = true;
    draw();
  }

  function recolour(t: Theme) {
    if (!added) return;
    map.updateImage('air-fire', image(t));
    map.setPaintProperty('air-perimeters-fill', 'fill-color', colorToken('ink', t));
    map.setPaintProperty('air-perimeters-line', 'line-color', colorToken('ink', t));
  }

  /** The fires to show at the cursor's time (ids), or all fetched when there is no cursor. */
  const visible = (): Fire[] => (cursor ? list.filter((f) => burningAt(f, cursor!, new Date())) : list);

  function draw() {
    if (!added) return;
    const vis = shown ? 'visible' : 'none';
    map.setLayoutProperty('air-fires', 'visibility', vis);
    map.setLayoutProperty('air-perimeters-fill', 'visibility', shown && showPerimeters ? 'visible' : 'none');
    map.setLayoutProperty('air-perimeters-line', 'visibility', shown && showPerimeters ? 'visible' : 'none');
    if (!shown) return;
    const fires = visible();
    (map.getSource('air-fires') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: fires.map((f) => ({ type: 'Feature' as const, properties: { id: f.id, note: f.ofNote }, geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] } })),
    });
    const ids = new Set(fires.map((f) => f.id));
    (map.getSource('air-perimeters') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection', features: perimeters.filter((p) => ids.has(p.properties.fire)) as never[],
    });
    document.body.dataset.airFires = String(fires.length);
  }

  async function loadPerimeters() {
    const big = [...list].filter((f) => (f.sizeHa ?? 0) >= 1).sort((a, b) => (b.sizeHa ?? 0) - (a.sizeHa ?? 0)).slice(0, MAX_PERIMETERS).map((f) => f.id);
    if (!big.length) { perimeters = []; return; }
    try {
      const got = opts.online() ? await fetchKept(perimetersUrl(big), 'bc-fire-perimeters') : await keptAnswer('bc-fire-perimeters');
      if (got) perimeters = parsePerimeters(got.json);
    } catch (err) {
      console.warn('no fire perimeters', err);
    }
  }

  function load(force = false): Promise<void> {
    if (!force && Date.now() - at < TTL && fetchedAt) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const since = bcDate(new Date(Date.now() - SINCE_DAYS * 86_400_000));
        const got = opts.online() ? await fetchKept(pointsUrl(since), 'bc-fires') : await keptAnswer('bc-fires');
        if (got) {
          list = parsePoints(got.json);
          fetchedAt = got.fetchedAt;
          kept = got.kept;
          failure = got.kept ? 'no answer' : null;
          at = got.kept ? 0 : Date.now();
          await loadPerimeters();
        } else if (!fetchedAt) {
          failure = 'saved data only';
        }
      } catch (err) {
        console.warn('no wildfires', err);
        failure = failureReason(err);
      } finally {
        loading = null;
        document.body.dataset.airFiresLoaded = fetchedAt ? 'ready' : 'error';
        opts.onData(fetchedAt ? list : null, fetchedAt, kept);
        draw();
      }
    })();
    return loading;
  }

  /** Shown (layer on and the switch on), at this cursor time. */
  function update(isShown: boolean, perim: boolean, t: Date | null) {
    const changed = isShown !== shown || perim !== showPerimeters || t?.getTime() !== cursor?.getTime();
    shown = isShown;
    showPerimeters = perim;
    cursor = t;
    if (shown) void load();
    if (changed) draw();
  }

  /** A tap on the map: a fire mark opens its panel. True when one was hit. */
  function tapped(point: { x: number; y: number }): boolean {
    if (!shown || !added) return false;
    const hit = map.queryRenderedFeatures([[point.x - 10, point.y - 10], [point.x + 10, point.y + 10]], { layers: ['air-fires'] })[0];
    const f = hit ? list.find((x) => x.id === hit.properties?.id) : undefined;
    if (!f) return false;
    const r = map.getContainer().getBoundingClientRect();
    open(f, anchorAt(r.left + point.x, r.top + point.y));
    return true;
  }

  function open(f: Fire, origin: HTMLElement) {
    const now = new Date();
    const body = el('div', 'panel-groups air-fire');
    if (cursor && cursor.getTime() < now.getTime() - 3_600_000) {
      body.append(el('p', 'avy-flag', `By its issued dates this fire was burning on ${formatCursorTime(cursor).split(' ')[0]} ${dateText(bcDate(cursor)).replace(/, \d{4}$/, '')}, the day under the time cursor. The status below is today’s.`));
    }
    const facts: [string, string][] = [
      ['Status now', f.status || '–'],
      ['Fire number', f.id],
      ['Size', f.sizeHa === null ? '–' : formatHectares(f.sizeHa)],
      ['Discovered', dateText(f.ignition) || '–'],
    ];
    if (f.out) facts.push(['Declared out', dateText(f.out)]);
    if (f.cause) facts.push(['Cause', f.cause]);
    if (f.centre !== null) facts.push(['Fire centre', centreName(f.centre)]);
    if (f.response) facts.push(['Response', f.response]);
    if (f.type && f.type !== 'Fire') facts.push(['Type', f.type]);
    if (f.ofNote) facts.push(['Wildfire of note', 'Yes']);
    const per = perimeters.find((p) => p.properties.fire === f.id);
    if (per) facts.push(['Perimeter', `${per.properties.ha === null ? '' : `${formatHectares(per.properties.ha)}, `}mapped ${dateText(per.properties.mapped)}${per.properties.how ? ` (${per.properties.how})` : ''}`]);
    const dl = el('dl', 'avy-facts');
    for (const [k, v] of facts) dl.append(el('dt', '', k), el('dd', '', v));
    const g = el('div', 'group');
    g.append(el('span', 'group-title', 'AS ISSUED BY BC WILDFIRE SERVICE'), dl);
    body.append(g);
    if (f.url) {
      const link = el('a', 'link-row avy-link');
      link.href = f.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(el('span', '', 'Open this fire on BC Wildfire Service’s map'));
      body.append(link);
    }
    body.append(el('p', 'panel-note', `${source.attribution}. ${source.terms} Fetched ${fetchedAt ? formatWhen(fetchedAt, now) : '–'}${kept ? ' (the copy kept on the phone)' : ''}.`));
    openPanel({ origin, icon: ICON, title: fireTitle(f), caption: `Wildfire ${f.id} · as issued`, body, onClose: () => origin.remove() });
    document.body.dataset.airPanel = f.id;
  }

  return {
    addLayers, recolour, update, tapped, load,
    retry: () => { at = 0; void load(true); },
    get failure() { return failure; },
    get kept() { return kept; },
  };
}
