// The 3D wind streaks' look (Effects section): fixed values, settled with Kaden
// on the phone (docs/wishes/effects.md, rules 3 and 7). The wind itself
// (direction and speed) comes from the forecast; these only say how it is
// drawn and how much the hills and gusts shape it.
import type { WindShape } from '../effects-lab/synthetic-wind';

export interface WindLook extends WindShape {
  /** Streaks on screen. */
  count: number;
  /** Seconds of travel a streak spans (its length). */
  trailSeconds: number;
  /** Line width, CSS pixels at a moderate wind, at the reference zoom. */
  widthPx: number;
  /** 0 to 1. */
  brightness: number;
  /** Movement speed: 1 is the forecast's speed at the reference zoom. */
  speedScale: number;
  /** Metres above the ground the streaks fly. */
  clearance: number;
}

/** Kaden's look (docs/wishes/effects.md, rule 3). */
export const WIND_LOOK: WindLook = { count: 700, trailSeconds: 0.4, widthPx: 2, brightness: 0.9, speedScale: 1, clearance: 50, terrain: 0.2, gusty: 0.15, gust: 0.5, gustSize: 1 };

/** Screen pixels a second for each km/h of wind, at the reference zoom. */
export const PX_PER_KMH = 2.2;
/** The zoom the look above is made for (the map opens here). */
export const REFERENCE_ZOOM = 11;

/**
 * How much bigger the streaks are on screen at this zoom (Kaden, Nov 27): they
 * move faster, so they trail longer, and are a little wider, the further in
 * you zoom, so a slow wind can still be seen by zooming in on a spot. Each
 * zoom level makes them 1.5 times faster; zooming out slows them down only
 * so far, and nothing grows without a limit.
 */
export function zoomScale(zoom: number): { speed: number; width: number } {
  const speed = Math.min(8, Math.max(0.6, 1.5 ** (zoom - REFERENCE_ZOOM)));
  return { speed, width: Math.min(2.2, Math.max(1, Math.sqrt(speed))) };
}
