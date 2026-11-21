// A made-up wind for judging the look of the particles on their own: one
// steady wind from a chosen direction, bent by the terrain. The forecast's
// own wind replaces this when the effect joins the app.
import type { HeightGrid } from '../../render/effects/height-grid';
import type { WindFn } from '../../render/effects/particles';

export interface SyntheticWind {
  /** Direction the wind blows FROM, degrees clockwise from north (meteorological). */
  fromDeg: number;
  speedKmh: number;
  /** 0 to 1: how much hills speed up, block and turn the wind. */
  terrain: number;
  /** 0 to 1: how much the speed and direction vary from place to place. */
  gusty: number;
  /** 0 to 1: how strong the gusts are (little pockets of faster wind carried along by the wind). */
  gust: number;
  /** Size of a gust, 1 being about two kilometres long. */
  gustSize: number;
}

/** What the lab tells the wind about the moving picture. */
export interface WindClock {
  /** Seconds, always counting up. */
  seconds: () => number;
  /** How fast the particles really travel on the ground (metres a second), so gusts ride along with them. */
  groundMps: () => number;
}

const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compassName = (deg: number) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]!;

/** Metres of height per metre of ground a slope counts as "steep" at. */
const STEEP = 0.5;

export function syntheticWind(p: () => SyntheticWind, grid: HeightGrid, metresPerUnit: () => number, clock: WindClock): WindFn {
  return (x, y, out) => {
    const { fromDeg, speedKmh, terrain, gusty, gust, gustSize } = p();
    const rad = (fromDeg * Math.PI) / 180;
    let u = -speedKmh * Math.sin(rad), v = -speedKmh * Math.cos(rad);
    const h = grid.slope(x, y);
    const m = metresPerUnit();
    if (terrain > 0) {
      // Higher ground is windier.
      const up = 1 + terrain * 0.7 * Math.min(1.2, h / 2000);
      u *= up; v *= up;
      // Ground slope as metres per metre, east and north (mercator y grows south).
      const gE = grid.gx / m, gN = -grid.gy / m;
      const steep = Math.hypot(gE, gN);
      if (steep > 0.02) {
        const nE = gE / steep, nN = gN / steep;
        const into = u * nE + v * nN; // positive: flowing uphill
        if (into > 0) {
          const k = terrain * Math.min(1, steep / STEEP);
          // Blocked flow slides sideways along the slope, on the side it already leans.
          const tE = -nN, tN = nE;
          const side = Math.sign(u * tE + v * tN) || 1;
          u += -k * 0.75 * into * nE + k * 0.55 * into * side * tE;
          v += -k * 0.75 * into * nN + k * 0.55 * into * side * tN;
        }
      }
    }
    if (gusty > 0) {
      // Slow patchiness in place, fixed in time so the pattern holds still while the particles move through it.
      const a = Math.sin(x * 9000 + y * 5300) * Math.cos(y * 7700 - x * 3100);
      const turn = a * gusty * 0.25;
      const c = Math.cos(turn), s = Math.sin(turn);
      const k = 1 + gusty * 0.35 * Math.sin(x * 4100 - y * 6200);
      const nu = (u * c - v * s) * k, nv = (u * s + v * c) * k;
      u = nu; v = nv;
    }
    if (gust > 0) {
      // Gusts: pockets of faster wind, longer than they are wide, drifting downwind with the particles.
      // Along-wind and across-wind distance in metres, in a frame that moves with the wind.
      const east = -Math.sin(rad), north = -Math.cos(rad);
      const dx = east, dy = -north; // mercator y grows south
      const s0 = (x * dx + y * dy) * m - clock.groundMps() * clock.seconds();
      const q0 = (-x * dy + y * dx) * m;
      const t = clock.seconds();
      const ls = 2000 * gustSize, lq = 900 * gustSize;
      const a = Math.sin(TAU * (s0 / ls) + 1.7 * Math.sin(TAU * (q0 / lq) * 0.6));
      const b = Math.sin(TAU * (q0 / lq) + 0.9 * Math.sin(TAU * (s0 / ls) * 0.45 + 1.3 + t * 0.12));
      const g = smoothstep(0.3, 0.85, a * b) * gust;
      // Faster, and swerving a little as it comes through.
      const swerve = g * 0.2 * Math.sin(TAU * (q0 / lq) + 0.5);
      const c = Math.cos(swerve), sn = Math.sin(swerve);
      const k = 1 + 0.9 * g;
      const nu = (u * c - v * sn) * k, nv = (u * sn + v * c) * k;
      u = nu; v = nv;
    }
    out[0] = u; out[1] = v;
  };
}
