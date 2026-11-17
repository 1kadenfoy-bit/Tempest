// Adapter: Avalanche Canada public forecasts (forecast areas and products).
//
// Checked Nov 17, 2026 (documented at https://avalanche.ca/api-docs):
// - The docs give the base https://avcan-services-api.prod.avalanche.ca. That
//   host is blocked from the cloud session this was built in, so its answers
//   were not seen. https://api.avalanche.ca answers the same documented paths
//   with the documented shapes and Access-Control-Allow-Origin: *, so the app
//   reads that host. No key, no stated rate limit.
// - GET /forecasts/en/areas: GeoJSON FeatureCollection of forecast areas
//   (MultiPolygon, bbox, properties.id). 140 kB for all of Canada.
// - GET /forecasts/en/products: every current product. Fields used: id, url,
//   area.id, owner.display, report.{title, forecaster, dateIssued,
//   validUntil, timezone, highlights (HTML), confidence.rating.display,
//   confidence.statements, summaries[].{type.display, content (HTML)},
//   problems[].{type.display, comment (HTML), data.elevations[].display,
//   data.aspects[].display, data.likelihood.display, data.expectedSize},
//   terrainAndTravelAdvice[], dangerRatings[].{date.value, date.display,
//   ratings.{alp,tln,btl}.rating.{value, display}}}, notifications[].content.
//   33 kB on Nov 17 (8 products, all early season: one Avalanche Canada
//   product covers every BC region until regular forecasts start).
// - Rating values seen in the site's code: low, moderate, considerable, high,
//   extreme, norating, earlyseason, spring, offseason, noforecast.
// - A day's date.value is a time on that day in the product's time zone
//   (e.g. 2026-11-17T23:30:34Z for Tuesday in America/Vancouver).

import { BANDS, localDate, rating, type AvalancheProblem, type Bulletin, type BulletinDay, type ForecastRegion } from '../../core/avalanche/danger';

export const source = {
  id: 'avalanche-canada',
  name: 'Avalanche Canada forecasts',
  publisher: 'Avalanche Canada',
  provides: 'Avalanche forecast regions and danger ratings, shown as issued',
  baseUrl: 'https://api.avalanche.ca',
  licence: 'Public API (no licence stated); used for a personal, non-commercial app, politely (bulletins asked for at most every 30 minutes)',
  attribution: 'Avalanche forecasts by Avalanche Canada and its partners (Parks Canada, Kananaskis Country, Avalanche Québec)',
  link: 'https://avalanche.ca/api-docs',
  terms: 'A public API with no stated limits; the website’s Terms of Use (avalanche.ca/terms-of-use) say its material may not be reproduced without written consent. Shown as issued, online only.',
  offline: false,
} as const;

export const areasUrl = (lang = 'en') => `${source.baseUrl}/forecasts/${lang}/areas`;
export const productsUrl = (lang = 'en') => `${source.baseUrl}/forecasts/${lang}/products`;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const date = (v: unknown) => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const display = (v: unknown) => str(obj(v).display).trim();

/** Forecast area outlines. Features without an id or a polygon are skipped. */
export function parseAreas(json: unknown): ForecastRegion[] {
  const out: ForecastRegion[] = [];
  for (const f of arr(obj(json).features)) {
    const g = obj(obj(f).geometry);
    const id = str(obj(f).id) || str(obj(obj(f).properties).id);
    if (!id || (g.type !== 'Polygon' && g.type !== 'MultiPolygon') || !Array.isArray(g.coordinates)) continue;
    const geometry = g as unknown as ForecastRegion['geometry'];
    const bb = arr(obj(f).bbox).map(Number);
    out.push({ id, geometry, bbox: bb.length === 4 && bb.every(Number.isFinite) ? (bb as ForecastRegion['bbox']) : bboxOf(geometry) });
  }
  return out;
}

function bboxOf(g: ForecastRegion['geometry']): ForecastRegion['bbox'] {
  const pts = (g.type === 'Polygon' ? g.coordinates.flat() : g.coordinates.flat(2)) as number[][];
  const xs = pts.map((p) => p[0]!), ys = pts.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function problem(p: unknown): AvalancheProblem {
  const d = obj(obj(p).data);
  const size = obj(d.expectedSize);
  return {
    name: display(obj(p).type),
    elevations: arr(d.elevations).map(display).filter(Boolean),
    aspects: arr(d.aspects).map(display).filter(Boolean),
    likelihood: display(d.likelihood) || null,
    size: str(size.min) || str(size.max) ? { min: str(size.min), max: str(size.max) } : null,
    html: str(obj(p).comment),
  };
}

/** One product as a bulletin; null without the fields it cannot be shown without. */
export function parseProduct(json: unknown): Bulletin | null {
  const p = obj(json);
  const r = obj(p.report);
  const issued = date(r.dateIssued);
  const validUntil = date(r.validUntil);
  const areaId = str(obj(p.area).id);
  const timeZone = str(r.timezone) || 'America/Vancouver';
  if (!issued || !validUntil || !areaId) return null;
  const days: BulletinDay[] = [];
  for (const d of arr(r.dangerRatings)) {
    const when = date(obj(obj(d).date).value);
    if (!when) continue;
    const rs = obj(obj(d).ratings);
    const ratings = Object.fromEntries(BANDS.map((b) => {
      const x = obj(obj(rs[b]).rating);
      return [b, rating(str(x.value) || 'norating', str(x.display))];
    })) as BulletinDay['ratings'];
    days.push({ date: localDate(when, timeZone), label: display(obj(d).date), ratings });
  }
  const conf = obj(r.confidence);
  return {
    id: str(p.id),
    areaId,
    title: str(r.title) || str(obj(p.area).name),
    owner: display(p.owner) || str(r.forecaster),
    forecaster: str(r.forecaster),
    issued,
    validUntil,
    timeZone,
    url: str(p.url) || 'https://avalanche.ca/map',
    highlights: str(r.highlights),
    confidence: display(conf.rating) ? { display: display(conf.rating), statements: arr(conf.statements).map(str).filter(Boolean) } : null,
    summaries: arr(r.summaries).map((s) => ({ title: display(obj(s).type), html: str(obj(s).content) })).filter((s) => s.html.trim()),
    problems: arr(r.problems).map(problem),
    travelAdvice: arr(r.terrainAndTravelAdvice).map(str).filter(Boolean),
    notifications: arr(p.notifications).map((n) => str(obj(n).content)).filter(Boolean),
    days,
  };
}

/** Every product in a products answer, by area id. */
export function parseProducts(json: unknown): Map<string, Bulletin> {
  const out = new Map<string, Bulletin>();
  for (const p of arr(json)) {
    const b = parseProduct(p);
    if (b) out.set(b.areaId, b);
  }
  return out;
}

/** Areas and products, read together. Throws when Avalanche Canada cannot be reached. */
export async function fetchForecasts(fetchFn: typeof fetch = fetch): Promise<{ regions: ForecastRegion[]; bulletins: Map<string, Bulletin> }> {
  const [a, p] = await Promise.all([fetchFn(areasUrl()), fetchFn(productsUrl())]);
  if (!a.ok) throw new Error(`Avalanche Canada areas: HTTP ${a.status}`);
  if (!p.ok) throw new Error(`Avalanche Canada products: HTTP ${p.status}`);
  return { regions: parseAreas(await a.json()), bulletins: parseProducts(await p.json()) };
}
