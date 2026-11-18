// What the Air quality layer holds, set by the app's wiring (app/air) and
// read by the layer (layers/air-quality), so the layer never sees a provider.
// Pure state, no UI.
import type { PointSeries } from '../vocabulary';
import type { Fire } from './fires';

/** One source of the map fill, as the source menu names it. */
export interface AirSource {
  id: string;
  /** "ECCC smoke forecast (RAQDPS FireWork)". */
  label: string;
  /** For the top bar's source button: "ECCC". */
  short: string;
  gridKm: number;
  /** What the numbers are: wildfire smoke only, or all fine particles. */
  variable: 'pm2_5_smoke' | 'pm2_5';
  /** "ECCC RAQDPS (FireWork)", for footers. */
  model: string;
}

/** An AQHI reading as ECCC issues it. */
export interface AqhiObserved {
  station: string;
  stationId: string;
  lat: number;
  lon: number;
  km: number;
  /** As issued, unrounded (1.41). */
  value: number;
  time: Date;
  /** ECCC's own words for the time ("11:00 PM PST Tuesday 17 November 2026"). */
  timeText: string;
}

export interface AqhiForecast {
  station: string;
  stationId: string;
  km: number;
  published: Date;
  hours: { time: Date; value: number }[];
}

export interface AqhiNear {
  observed: AqhiObserved | null;
  forecast: AqhiForecast | null;
  fetchedAt: Date;
  /** Where people read it on ECCC's site. */
  link: string;
}

export interface AirState {
  source: AirSource | null;
  /** The source's run, when it has one, and when its numbers were fetched. */
  run: Date | null;
  fetchedAt: Date | null;
  /** The pin's series (one variable, hourly), or null while loading. */
  series: PointSeries | null;
  /** Why there is no series, in plain words, or null. */
  problem: string | null;
  aqhi: AqhiNear | null | 'error';
  fires: { list: Fire[]; fetchedAt: Date; kept: boolean } | null;
  firesShown: boolean;
  /** Values on screen (for the In view line), with each cell's place. */
  view: { lon: number; lat: number; value: number }[];
  cursor: Date | null;
  pin: { lat: number; lon: number } | null;
}

let state: AirState = {
  source: null, run: null, fetchedAt: null, series: null, problem: null, aqhi: null, fires: null, firesShown: true, view: [], cursor: null, pin: null,
};

export function airState(): AirState { return state; }
export function setAirState(patch: Partial<AirState>): void { state = { ...state, ...patch }; }

/** The series' index for a time (exact hour), or −1. */
export function airIndex(s: PointSeries | null, t: Date | null): number {
  if (!s || !t) return -1;
  return s.times.findIndex((x) => x.getTime() === t.getTime());
}

/** The number at step i of the series, or null. */
export function airValue(s: PointSeries | null, i: number): number | null {
  if (!s || i < 0) return null;
  const v = (s.values.pm2_5_smoke ?? s.values.pm2_5)?.[i];
  return v === undefined || !Number.isFinite(v) ? null : v;
}

/** The AQHI forecast hour at t (exact hour), or null. */
export function aqhiForecastAt(f: AqhiForecast | null, t: Date | null): { time: Date; value: number } | null {
  if (!f || !t) return null;
  return f.hours.find((h) => h.time.getTime() === t.getTime()) ?? null;
}
