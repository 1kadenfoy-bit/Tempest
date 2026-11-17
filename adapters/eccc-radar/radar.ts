// Adapter: ECCC's North American radar composite on MSC GeoMet (WMS). An
// "image" source: GeoMet draws the pictures in ECCC's own colours; the app
// shows them as they come and never recolours them.
//
// Checked Nov 17, 2026 (docs/05-data-sources.md, "Radar"):
// - Layers: RADAR_1KM_RRAI (rain rate, mm/h), RADAR_1KM_RSNO (snow rate,
//   cm/h), Radar_1km_SfcPrecipType (surface precipitation type, 12 classes),
//   RADAR_COVERAGE_RRAI.INV (everything outside radar range).
// - Time: each layer's GetCapabilities gives `start/end/PT6M`, the last 3 hours
//   every 6 minutes (31 frames). The type product runs one frame behind.
// - CORS `*` on GetCapabilities, GetMap, GetFeatureInfo and GetLegendGraphic.
//   Cache-Control max-age=360 (one frame).
// - GetFeatureInfo (JSON) at a point: rates give the exact 1 km pixel (value 0,
//   class "Undetected" when nothing is seen; `{}` outside radar range). The
//   type product answers with the nearest precipitating pixel, which can be
//   20 km away, so its answer is used only when it is next to the pin.
// - ECCC's usage policy prohibits bulk downloading of WMS tiles: online only.

export const source = {
  id: 'eccc-radar',
  name: 'ECCC radar composite',
  provides: 'Radar: precipitation seen in the last 3 hours, every 6 minutes',
  baseUrl: 'https://geo.weather.gc.ca/geomet',
  licence: 'Open Government Licence – Canada',
  attribution: 'Contains information from Environment and Climate Change Canada (radar composite)',
  link: 'https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en',
  terms: 'Bulk downloading of GeoMet map tiles is prohibited, so radar is shown online only and is never saved.',
  offline: false,
} as const;

/** What the Radar layer can show; one at a time, chosen in its settings. */
export type RadarShown = 'type' | 'rain' | 'snow';

/**
 * A legend as ECCC draws it, copied from its GetLegendGraphic images on
 * Nov 17, 2026 (fixtures/legend-*.png; a unit test checks each colour against
 * them). A ramp lists its colours low to high, evenly spaced as in ECCC's bar.
 */
export type ImageLegend =
  | { kind: 'ramp'; colors: string[]; low: number; high: number; unit: 'mm/h' | 'cm/h' }
  | { kind: 'classes'; groups: { label: string; colors: string[] }[] };

/** ECCC's rate ramp (styles Radar-Rain_14colors and Radar-Snow_14colors share it), lowest first. */
const RATE_COLORS = [
  '#98cbfe', '#0098fe', '#00fe66', '#00cb00', '#009800', '#006600', '#fefe00', '#fecb00',
  '#fe9800', '#fe6600', '#fe0000', '#fe0298', '#9833cb', '#660098', '#33004d',
];

export interface RadarProduct {
  layer: string;
  style: string;
  legend: ImageLegend;
  /** The rate's unit at a point, or null for the type product. */
  unit: 'mm/h' | 'cm/h' | null;
}

export const PRODUCTS: Record<RadarShown, RadarProduct> = {
  type: {
    layer: 'Radar_1km_SfcPrecipType',
    style: 'SfcPrecipType_Dis',
    unit: null,
    // Light, moderate, heavy (left to right), as in ECCC's legend.
    legend: {
      kind: 'classes',
      groups: [
        { label: 'Snow', colors: ['#7fdfeb', '#47a4f0', '#0000e0'] },
        { label: 'Mixed', colors: ['#e0bde6', '#c36dd2', '#9b27af'] },
        { label: 'Rain', colors: ['#9afd9a', '#00cb00', '#008000'] },
        { label: 'Freezing', colors: ['#fecbc8', '#fe1e0d'] },
        { label: 'Hail', colors: ['#fec007'] },
      ],
    },
  },
  rain: { layer: 'RADAR_1KM_RRAI', style: 'Radar-Rain_14colors', unit: 'mm/h', legend: { kind: 'ramp', colors: RATE_COLORS, low: 0.1, high: 200, unit: 'mm/h' } },
  snow: { layer: 'RADAR_1KM_RSNO', style: 'Radar-Snow_14colors', unit: 'cm/h', legend: { kind: 'ramp', colors: RATE_COLORS, low: 0.1, high: 20, unit: 'cm/h' } },
};

/** Outside radar range, as a grey veil (ECCC's own style), so gaps never read as dry. */
export const COVERAGE = { layer: 'RADAR_COVERAGE_RRAI.INV', style: 'Radar-Coverage_Inv-DarkGray' } as const;
/** The rain-rate layer: the exact pixel at a point, and whether the point is in range. */
const PROBE = PRODUCTS.rain.layer;

const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z');

export function capabilitiesUrl(layer: string): string {
  return `${source.baseUrl}?${new URLSearchParams({ service: 'WMS', version: '1.3.0', request: 'GetCapabilities', layer })}`;
}

/** ISO 8601 duration ("PT6M", "PT1H", "PT10M") in milliseconds. */
export function durationMs(d: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d.trim());
  if (!m) return NaN;
  const [, day, h, min, s] = m.map((x) => Number(x ?? 0));
  return (((day! * 24 + h!) * 60 + min!) * 60 + s!) * 1000;
}

/** A WMS time dimension's text: "start/end/PT6M", a comma list of those, or of single times. */
export function expandTimes(text: string): Date[] {
  const out: Date[] = [];
  for (const part of text.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [a, b, step] = part.split('/');
    if (b && step) {
      const from = Date.parse(a!), to = Date.parse(b), ms = durationMs(step);
      if (!Number.isFinite(from) || !Number.isFinite(to) || !(ms > 0)) continue;
      for (let t = from; t <= to && out.length < 10_000; t += ms) out.push(new Date(t));
    } else {
      const t = Date.parse(a!);
      if (Number.isFinite(t)) out.push(new Date(t));
    }
  }
  return out.sort((x, y) => x.getTime() - y.getTime());
}

/** The times a layer holds, from GetCapabilities XML (its own <Layer>'s time dimension). */
export function parseTimes(xml: string, layer: string): Date[] {
  const at = xml.indexOf(`<Name>${layer}</Name>`);
  if (at < 0) return [];
  const rest = xml.slice(at);
  const m = /<Dimension\s+name="time"[^>]*>([^<]*)<\/Dimension>/.exec(rest);
  return m ? expandTimes(m[1]!) : [];
}

/** The frames ECCC holds now for a layer, oldest first. */
export async function fetchFrames(layer: string, fetchFn: typeof fetch = fetch): Promise<Date[]> {
  const res = await fetchFn(capabilitiesUrl(layer));
  if (!res.ok) throw new Error(`radar times: HTTP ${res.status}`);
  const times = parseTimes(await res.text(), layer);
  if (!times.length) throw new Error('radar times: none listed');
  return times;
}

/** A map tile address for MapLibre (`{bbox-epsg-3857}` is filled per tile), at one frame. */
export function tileUrl(layer: string, style: string, time: Date, size = 512): string {
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetMap', layers: layer, styles: style, crs: 'EPSG:3857',
    width: String(size), height: String(size), format: 'image/png', transparent: 'true', time: iso(time),
  });
  return `${source.baseUrl}?${params}&bbox={bbox-epsg-3857}`;
}

/** ECCC's legend image for a product (linked from the layer's details). */
export function legendUrl(p: RadarProduct): string {
  return `${source.baseUrl}?${new URLSearchParams({ version: '1.3.0', service: 'WMS', request: 'GetLegendGraphic', sld_version: '1.1.0', layer: p.layer, format: 'image/png', STYLE: p.style })}`;
}

export function featureInfoUrl(layer: string, lat: number, lon: number, time: Date): string {
  const d = 0.01;
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo', layers: layer, query_layers: layer,
    crs: 'EPSG:4326', bbox: [lat - d, lon - d, lat + d, lon + d].map((v) => v.toFixed(5)).join(','), width: '3', height: '3', i: '1', j: '1',
    info_format: 'application/json', time: iso(time),
  });
  return `${source.baseUrl}?${params}`;
}

/** One GetFeatureInfo answer: null when the point is outside radar range (`{}` or no feature). */
export interface FeatureInfo { value: number; cls: string; lon: number; lat: number }
export function parseFeatureInfo(json: unknown): FeatureInfo | null {
  const f = (json as { features?: { geometry?: { coordinates?: unknown }; properties?: { value?: unknown; class?: unknown } }[] })?.features?.[0];
  const v = f?.properties?.value;
  const c = f?.geometry?.coordinates;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Array.isArray(c)) return null;
  return { value: v, cls: typeof f?.properties?.class === 'string' ? f.properties.class : '', lon: Number(c[0]), lat: Number(c[1]) };
}

/** ECCC's class name in plain words, nothing else changed: "LightRain" → "Light rain". */
export function classWords(cls: string): string {
  const words = cls.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1).toLowerCase() : '';
}

/** Kilometres between two points (small distances). */
function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const x = (lon2 - lon1) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const y = (lat2 - lat1) * 110.57;
  return Math.hypot(x, y);
}
/** The type product's nearest-pixel answer counts only this close to the pin (its pixels are 1 km). */
export const TYPE_NEAR_KM = 1.5;

/** What one radar frame shows at a point. */
export interface RadarPoint {
  /** False outside radar range; null when the service could not say. */
  covered: boolean | null;
  detected: boolean;
  /** The rate as ECCC gives it, in `unit`; null for the type product. */
  rate: number | null;
  unit: 'mm/h' | 'cm/h' | null;
  /** ECCC's class in plain words ("Light rain"), when the product has one. */
  kind: string | null;
}

async function info(layer: string, lat: number, lon: number, time: Date, fetchFn: typeof fetch): Promise<FeatureInfo | null> {
  const res = await fetchFn(featureInfoUrl(layer, lat, lon, time));
  if (!res.ok) throw new Error(`radar point: HTTP ${res.status}`);
  return parseFeatureInfo(await res.json());
}

/**
 * The frame's value at a point. Rates: one question. Type: the rain-rate
 * pixel says whether the point is in range and whether anything is seen
 * there; the type product then names it when its answer is at the pin.
 */
export async function radarAt(shown: RadarShown, lat: number, lon: number, time: Date, fetchFn: typeof fetch = fetch): Promise<RadarPoint> {
  const p = PRODUCTS[shown];
  if (p.unit) {
    const f = await info(p.layer, lat, lon, time, fetchFn);
    if (!f) return { covered: false, detected: false, rate: null, unit: p.unit, kind: null };
    return { covered: true, detected: f.value > 0, rate: f.value > 0 ? f.value : 0, unit: p.unit, kind: null };
  }
  // The type product runs a frame behind the rates; its first frame may have no rate frame.
  const probe = await info(PROBE, lat, lon, time, fetchFn).catch(() => undefined);
  if (probe === null) return { covered: false, detected: false, rate: null, unit: null, kind: null };
  if (probe && probe.value <= 0) return { covered: true, detected: false, rate: null, unit: null, kind: null };
  const t = await info(p.layer, lat, lon, time, fetchFn);
  const near = t && km(lat, lon, t.lat, t.lon) <= TYPE_NEAR_KM ? t : null;
  if (!near) return { covered: probe ? true : null, detected: !!probe, rate: null, unit: null, kind: null };
  return { covered: true, detected: true, rate: null, unit: null, kind: classWords(near.cls) || null };
}
