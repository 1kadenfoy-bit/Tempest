// Weather stations: what was measured, as measured. Pure functions, no UI, no
// provider. Adapters turn each network's answers into these shapes; the
// overlay asks only for these. Values stay in the app's metric units (°C,
// km/h, mm, cm, m) and are turned into text by core/units/format.ts.
import { compass } from '../wind/wind';
import { formatDegrees, formatMm, formatSpeed } from '../units/format';

/** One station, from whichever network runs it. */
export interface Station {
  /** Unique across networks: "<source id>:<the network's own id>". */
  id: string;
  name: string;
  /** Who runs the station, in its own words ("MSC", "BC-FOR", "Avalanche Canada"…). */
  provider: string;
  /** The adapter it came through (its `source.id`), for credits and links. */
  sourceId: string;
  lat: number;
  lon: number;
  /** Metres above sea level, when the network gives it. */
  elevation: number | null;
  /** The attribution the network asks for, word for word. */
  attribution: string;
  /** Where the network publishes it. */
  link: string;
}

/** One reading (one hour, for the networks used now). Missing values are null, never zero. */
export interface StationObservation {
  time: Date;
  /** °C. */
  airTemp: number | null;
  /** km/h, the network's average. */
  windSpeed: number | null;
  /** Degrees the wind blows from. */
  windDir: number | null;
  /** km/h, the highest the network reports for the period. */
  gust: number | null;
  /** mm in the past hour. */
  precip1h: number | null;
  /** cm on the ground. */
  snowDepth: number | null;
}

/** A station with its newest reading (null when none came back). */
export interface StationLatest {
  station: Station;
  latest: StationObservation | null;
}

/** A reading older than this is stale: shown, dimmed, with its age. Hourly stations report within minutes of the hour. */
export const STALE_MS = 2 * 3_600_000;

export function isStale(obs: StationObservation | null, now: Date): boolean {
  return !obs || now.getTime() - obs.time.getTime() > STALE_MS;
}

/** Newest first per station: the newest reading that has anything in it. */
export function newest(observations: readonly StationObservation[]): StationObservation | null {
  let best: StationObservation | null = null;
  for (const o of observations) {
    if (!hasValues(o)) continue;
    if (!best || o.time.getTime() > best.time.getTime()) best = o;
  }
  return best;
}

export function hasValues(o: StationObservation): boolean {
  return o.airTemp !== null || o.windSpeed !== null || o.windDir !== null || o.gust !== null || o.precip1h !== null || o.snowDepth !== null;
}

/** Oldest first, one reading per time (the later in the list wins), for charts. */
export function timeline(observations: readonly StationObservation[]): StationObservation[] {
  const byTime = new Map<number, StationObservation>();
  for (const o of observations) byTime.set(o.time.getTime(), o);
  return [...byTime.values()].sort((a, b) => a.time.getTime() - b.time.getTime());
}

export type MarkerKind = 'temp' | 'wind' | 'precip';

/** What the markers show for a condition layer; null for layers a station cannot speak to. */
export function markerKind(layerId: string): MarkerKind | null {
  return layerId === 'temperature' ? 'temp' : layerId === 'wind' ? 'wind' : layerId === 'precipitation' ? 'precip' : null;
}

export interface MarkerLabel {
  text: string;
  /** Degrees to turn an up-pointing arrow so it points where the wind blows to; null for no arrow. */
  arrow: number | null;
  /** Spoken form, for the marker's button. */
  spoken: string;
}

/**
 * The tiny label beside a station's marker, matching the condition layer:
 * air temperature, wind speed with an arrow, or the past hour's
 * precipitation. Null when the layer has no matching value or the station
 * did not measure it.
 */
export function markerLabel(obs: StationObservation | null, layerId: string): MarkerLabel | null {
  if (!obs) return null;
  switch (markerKind(layerId)) {
    case 'temp':
      return obs.airTemp === null ? null : { text: formatDegrees(obs.airTemp, false), arrow: null, spoken: `air ${formatDegrees(obs.airTemp, false)}` };
    case 'wind': {
      if (obs.windSpeed === null) return null;
      const calm = obs.windSpeed < 0.5;
      const arrow = calm || obs.windDir === null ? null : (obs.windDir + 180) % 360;
      const from = obs.windDir === null || calm ? '' : ` from ${compass(obs.windDir)}`;
      return { text: formatSpeed(obs.windSpeed, false), arrow, spoken: `wind ${formatSpeed(obs.windSpeed)}${from}` };
    }
    case 'precip':
      return obs.precip1h === null ? null : { text: formatMm(obs.precip1h), arrow: null, spoken: `${formatMm(obs.precip1h)} in the past hour` };
    default:
      return null;
  }
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Box = [west: number, south: number, east: number, north: number];

/** Whole-degree cells covering a box, west to east then south to north: what station lists are asked for and cached by. */
export function cellsFor(box: Box, size = 1): Box[] {
  const out: Box[] = [];
  const w = Math.floor(box[0] / size) * size, s = Math.floor(box[1] / size) * size;
  for (let y = s; y < box[3]; y += size) {
    for (let x = w; x < box[2]; x += size) out.push([x, y, x + size, y + size]);
  }
  return out;
}

export function inBox(p: { lat: number; lon: number }, box: Box): boolean {
  return p.lon >= box[0] && p.lon <= box[2] && p.lat >= box[1] && p.lat <= box[3];
}
