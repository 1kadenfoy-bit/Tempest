// Sun elevation (NOAA's simplified solar position), for the daylight bands in
// charts. Accurate to well under a degree, which is minutes at sunrise.

const rad = Math.PI / 180;

/** Sun elevation in degrees above the horizon. */
export function sunElevation(t: Date, lat: number, lon: number): number {
  const d = t.getTime() / 86_400_000 - 10_957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lon) * rad) - ra;
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  return el / rad;
}

/** Daylight: the sun's upper edge above the horizon, with refraction. */
export const isDaylight = (t: Date, lat: number, lon: number) => sunElevation(t, lat, lon) > -0.833;
