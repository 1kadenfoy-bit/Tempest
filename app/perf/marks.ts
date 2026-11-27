// Load times for the ?perf test mode (Performance section): when the map, the
// weather and the pin's forecast first finish, counted from the moment the
// page was asked for. Only runs when the address has ?perf; it reads the app,
// it never changes it.
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface LoadMarks {
  /** The page's HTML arrived. */
  html?: number;
  /** The app's code had run up to the map being made. */
  appStarted?: number;
  /** The map's first complete picture (MapLibre 'load'). */
  firstMap?: number;
  /** Every base map piece in view loaded and drawn. */
  mapComplete?: number;
  /** The weather layer's first picture on the map. */
  firstWeather?: number;
  /** The pin's forecast arrived (readout and chart). */
  pinForecast?: number;
  /** The pin's forecast failed. */
  pinForecastFailed?: number;
  /** Map, weather and the pin's forecast all done. */
  everything?: number;
}

export interface FetchRecord {
  url: string;
  start: number;
  ms: number;
  status: number;
  /** Bytes read, when the browser says (0 when not known). */
  bytes: number;
  error?: string;
}

const now = () => Math.round(performance.now());

/**
 * Watches the body's state markers (data-fill, data-series), which the app
 * already sets for its own tests, and the map's events.
 */
export function watchLoad(getMap: () => MapLibreMap | undefined, onEverything?: () => void): LoadMarks {
  const marks: LoadMarks = {};
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (nav) marks.html = Math.round(nav.responseEnd);

  const body = document.body;
  const check = () => {
    if (marks.firstWeather === undefined && body.dataset.fill === 'ready') marks.firstWeather = now();
    if (marks.pinForecast === undefined && body.dataset.series === 'ready') marks.pinForecast = now();
    if (marks.pinForecastFailed === undefined && body.dataset.series === 'failed') marks.pinForecastFailed = now();
  };
  new MutationObserver(check).observe(body, { attributes: true, attributeFilter: ['data-fill', 'data-series'] });
  check();

  // The map is made a little after this starts: look for it until it exists.
  const attach = () => {
    const map = getMap();
    if (!map) { setTimeout(attach, 20); return; }
    marks.appStarted ??= now();
    if (map.loaded()) marks.firstMap ??= now();
    else map.once('load', () => { marks.firstMap ??= now(); });
    // Done when the weather and the forecast are in and every map piece in view is drawn.
    const done = () => {
      if (marks.everything !== undefined) return;
      if (marks.firstMap !== undefined && marks.mapComplete === undefined && map.areTilesLoaded()) marks.mapComplete = now();
      if (marks.mapComplete !== undefined && marks.firstWeather !== undefined && (marks.pinForecast !== undefined || marks.pinForecastFailed !== undefined) && map.areTilesLoaded()) {
        marks.everything = now();
        onEverything?.();
        return;
      }
      setTimeout(done, 50);
    };
    done();
  };
  attach();
  return marks;
}

/** Every request the page's own code makes with fetch (not the map's or the weather's workers). */
export function watchFetches(): FetchRecord[] {
  const list: FetchRecord[] = [];
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rec: FetchRecord = { url, start: now(), ms: 0, status: 0, bytes: 0 };
    list.push(rec);
    try {
      const res = await real(input, init);
      rec.status = res.status;
      rec.ms = now() - rec.start;
      const len = Number(res.headers.get('content-length'));
      if (Number.isFinite(len)) rec.bytes = len;
      return res;
    } catch (err) {
      rec.ms = now() - rec.start;
      rec.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      throw err;
    }
  };
  return list;
}
