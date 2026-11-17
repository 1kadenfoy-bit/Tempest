// The weather stations overlay: small neutral markers for the stations in
// view, over every condition layer, each with its newest measured value when
// the layer has a matching one (air temperature, wind with an arrow, the past
// hour's precipitation). Tap one for its panel: what it measured over the
// past 48 hours, as measured. Not a layer: a switch in the map panel.
//
// Online only. Asked politely: only while the switch is on and the map has
// settled (600 ms after it stops), only the stations in view, ECCC by whole
// degree cells kept five minutes, Avalanche Canada's list once a day and each
// station's readings kept ten minutes. Without signal (or with "Saved data
// only") the markers go and nothing is asked.
//
// No v8 design exists; markers and panel are built from tokens and the
// existing grow panel, fact tiles and chart style.
import './stations.css';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { maplibregl } from '../map/maplibre';
import { cellsFor, distanceKm, inBox, isStale, markerLabel, newest, type Box, type Station, type StationLatest, type StationObservation } from '../../core/stations/stations';
import { formatElevation } from '../../core/units/format';
import * as eccc from '../../adapters/eccc-swob/swob';
import * as avcan from '../../adapters/avcan-weather/stations';
import { openPanel } from '../shell/panel';
import { CHART_HOURS, stationPanelBody } from './station-panel';

const H = 3_600_000;
const DEBOUNCE_MS = 600;
const ECCC_TTL = 5 * 60_000;
const AVCAN_LIST_TTL = 24 * H;
const AVCAN_TTL = 10 * 60_000;
const SERIES_TTL = 5 * 60_000;
/** Below this zoom the view holds too many stations to ask for politely. */
export const MIN_ZOOM = 7;
/** At most this many cells (1°) in one view. */
const MAX_CELLS = 12;
/** Avalanche Canada answers one station at a time: at most this many asked per view. */
const MAX_AVCAN = 20;
/** An Avalanche Canada station this close to an ECCC one is the same station: ECCC's is shown. */
const SAME_PLACE_KM = 0.3;
/** Avalanche Canada's own words, shown with its data (avalanche.ca, station pages). */
const AVCAN_NOTICE = 'Avalanche Canada makes no guarantee regarding the completeness or accuracy of this data.';

const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v12M8.5 21h7"/><circle cx="12" cy="7" r="2"/><path d="M7.8 2.8a6 6 0 0 0 0 8.4M16.2 2.8a6 6 0 0 1 0 8.4"/></svg>';
const ARROW = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M6 1 10 10 6 8 2 10z" fill="currentColor"/></svg>';

export interface StationsOptions {
  enabled: boolean;
  layerId: string;
  pin: () => { lat: number; lon: number } | null;
  savedOnly: () => boolean;
  fetchFn?: typeof fetch;
}

interface Shown { marker: Marker; el: HTMLButtonElement; data: StationLatest }

export function setupStations(map: MapLibreMap, opts: StationsOptions) {
  const fetchFn: typeof fetch = opts.fetchFn ?? ((input, init) => fetch(input, init));
  let enabled = opts.enabled;
  let layerId = opts.layerId;
  let timer = 0;
  let generation = 0;
  const shown = new Map<string, Shown>();
  const ecccCells = new Map<string, { at: number; list: Promise<StationLatest[]> }>();
  let avcanList: { at: number; list: Promise<Station[]> } | null = null;
  const avcanLatest = new Map<string, { at: number; obs: Promise<StationObservation | null> }>();
  const series = new Map<string, { at: number; obs: Promise<StationObservation[]> }>();

  const online = () => navigator.onLine && !opts.savedOnly();
  const status = (s: string) => { document.body.dataset.stations = s; };
  status(enabled ? 'loading' : 'off');

  function viewBox(): Box {
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  function ecccCell(cell: Box, now: Date): Promise<StationLatest[]> {
    const key = cell.join(',');
    const had = ecccCells.get(key);
    if (had && now.getTime() - had.at < ECCC_TTL) return had.list;
    const list = eccc.fetchLatest(cell, now, fetchFn);
    ecccCells.set(key, { at: now.getTime(), list });
    list.catch(() => ecccCells.delete(key));
    return list;
  }

  function avcanStations(now: Date): Promise<Station[]> {
    if (avcanList && now.getTime() - avcanList.at < AVCAN_LIST_TTL) return avcanList.list;
    const list = avcan.fetchStations(fetchFn);
    avcanList = { at: now.getTime(), list };
    // Unreadable from here (no network, or the browser may not read it): ask again in half an hour, ECCC's stations show alone meanwhile.
    list.catch(() => { if (avcanList) avcanList.at = now.getTime() - AVCAN_LIST_TTL + 30 * 60_000; });
    return list;
  }

  function avcanNewest(id: string, now: Date): Promise<StationObservation | null> {
    const had = avcanLatest.get(id);
    if (had && now.getTime() - had.at < AVCAN_TTL) return had.obs;
    const obs = avcan.fetchMeasurements(id, new Date(now.getTime() - 24 * H), fetchFn).then(newest);
    avcanLatest.set(id, { at: now.getTime(), obs });
    obs.catch(() => avcanLatest.delete(id));
    return obs;
  }

  async function refresh(): Promise<void> {
    const mine = ++generation;
    if (!enabled) { clear(); status('off'); return; }
    if (!online()) { clear(); status('offline'); return; }
    if (map.getZoom() < MIN_ZOOM) { clear(); status('zoomed-out'); return; }
    const box = viewBox();
    const cells = cellsFor(box);
    if (cells.length > MAX_CELLS) { clear(); status('zoomed-out'); return; }
    status('loading');
    const now = new Date();
    const fromEccc = (await Promise.allSettled(cells.map((c) => ecccCell(c, now))))
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((s) => inBox(s.station, box));
    if (mine !== generation) return;
    render(fromEccc);
    status(String(shown.size));
    // Avalanche Canada's mountain stations, added when they answer.
    try {
      const list = (await avcanStations(now))
        .filter((s) => inBox(s, box) && !fromEccc.some((e) => distanceKm(e.station, s) < SAME_PLACE_KM))
        .slice(0, MAX_AVCAN);
      const withObs = await Promise.all(list.map(async (station) => ({ station, latest: await avcanNewest(station.id, now).catch(() => null) })));
      if (mine !== generation) return;
      render([...fromEccc, ...withObs]);
      status(String(shown.size));
    } catch { /* ECCC's stations alone */ }
  }

  function schedule(ms = DEBOUNCE_MS) {
    clearTimeout(timer);
    timer = window.setTimeout(() => void refresh(), ms);
  }

  function clear() {
    for (const s of shown.values()) s.marker.remove();
    shown.clear();
  }

  function fill(s: Shown) {
    const { station, latest } = s.data;
    const label = markerLabel(latest, layerId);
    const stale = isStale(latest, new Date());
    s.el.dataset.stale = String(stale);
    s.el.dataset.arrow = String(label?.arrow != null);
    const dot = s.el.querySelector<HTMLElement>('.station-dot')!;
    dot.innerHTML = label?.arrow != null ? ARROW : '';
    if (label?.arrow != null) dot.dataset.arrow = String(label.arrow);
    else delete dot.dataset.arrow;
    turnArrow(dot);
    const value = s.el.querySelector<HTMLElement>('.station-value')!;
    value.textContent = label?.text ?? '';
    value.hidden = !label;
    const elev = station.elevation !== null ? `, ${formatElevation(station.elevation)}` : '';
    s.el.setAttribute('aria-label', `Weather station ${station.name}${elev}${label ? `, ${label.spoken}` : ''}${stale && latest ? ', older reading' : ''}`);
  }

  /** Arrows point over the ground: a turned map turns them with it. */
  function turnArrow(dot: HTMLElement) {
    const svg = dot.querySelector<SVGElement>('svg');
    if (svg && dot.dataset.arrow) svg.style.transform = `rotate(${Math.round(Number(dot.dataset.arrow) - map.getBearing())}deg)`;
  }

  function render(list: StationLatest[]) {
    const keep = new Set(list.map((s) => s.station.id));
    for (const [id, s] of shown) if (!keep.has(id)) { s.marker.remove(); shown.delete(id); }
    for (const data of list) {
      let s = shown.get(data.station.id);
      if (!s) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'station-marker';
        el.dataset.station = data.station.id;
        el.innerHTML = '<span class="station-dot"></span><span class="station-value"></span>';
        el.addEventListener('click', (e) => { e.stopPropagation(); open(s!); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: 0 }).setLngLat([data.station.lon, data.station.lat]).addTo(map);
        s = { marker, el, data };
        shown.set(data.station.id, s);
      } else {
        s.data = data;
      }
      fill(s);
    }
  }

  function seriesFor(st: Station, now: Date): Promise<StationObservation[]> {
    const had = series.get(st.id);
    if (had && now.getTime() - had.at < SERIES_TTL) return had.obs;
    const from = new Date(Math.floor(now.getTime() / H) * H - CHART_HOURS * H);
    const obs = st.sourceId === avcan.source.id ? avcan.fetchMeasurements(st.id, from, fetchFn) : eccc.fetchSeries(st.id, from, fetchFn);
    series.set(st.id, { at: now.getTime(), obs });
    obs.catch(() => series.delete(st.id));
    return obs;
  }

  function open(s: Shown) {
    const { station, latest } = s.data;
    const now = new Date();
    const isAvcan = station.sourceId === avcan.source.id;
    const panel = stationPanelBody({ station, latest, pin: opts.pin(), now, notice: isAvcan ? AVCAN_NOTICE : undefined });
    openPanel({
      origin: s.el,
      icon: ICON,
      title: station.name,
      caption: `${station.provider}${station.elevation !== null ? ` · ${formatElevation(station.elevation)}` : ''}`,
      body: panel.body,
    });
    if (!online()) { panel.setFailed(isAvcan ? avcan.source.publisher : eccc.source.publisher); return; }
    seriesFor(station, now).then(panel.setSeries, () => panel.setFailed(isAvcan ? avcan.source.publisher : eccc.source.publisher));
  }

  map.on('moveend', () => { if (enabled) schedule(); });
  map.on('rotate', () => { for (const s of shown.values()) turnArrow(s.el.querySelector<HTMLElement>('.station-dot')!); });
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('offline', () => schedule(0));
  if (enabled) schedule(0);

  return {
    setEnabled(on: boolean) {
      enabled = on;
      schedule(0);
    },
    /** The condition layer changed: the labels follow it. */
    setLayer(id: string) {
      layerId = id;
      for (const s of shown.values()) fill(s);
    },
    /** Units changed: the labels are written again. */
    redraw() {
      for (const s of shown.values()) fill(s);
    },
    /** "Saved data only" or the connection changed. */
    refresh() { schedule(0); },
    /** A map tap that landed on a station marker (it opens the station, not a pin). */
    hit(target: EventTarget | null): boolean {
      return target instanceof Element && !!target.closest('.station-marker');
    },
  };
}

export type StationsOverlay = ReturnType<typeof setupStations>;
