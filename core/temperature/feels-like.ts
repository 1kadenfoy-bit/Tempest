// Feels-like with the Canadian indices, so numbers match Environment and
// Climate Change Canada: wind chill when cold, humidex when hot
// (docs/03-architecture.md). T in °C, wind at 10 m in km/h, dew point in °C.
//
// Formulas: the 2001 ECCC wind chill and the Masterton–Richardson humidex
// (checked Nov 16, 2026, against secondary sources; canada.ca is not
// reachable from the build machine). When each is shown is NOT yet confirmed
// against ECCC's own pages: wind chill at 0 °C and below with wind of at
// least 5 km/h, humidex from 20 °C when it reaches 25 and is at least 1
// above the air temperature. Listed in docs/06 as a fact to check.

export type FeelsKind = 'wind chill' | 'humidex' | 'air';

export function windChill(t: number, windKmh: number): number {
  const v16 = windKmh ** 0.16;
  return 13.12 + 0.6215 * t - 11.37 * v16 + 0.3965 * t * v16;
}

export function humidex(t: number, dewPoint: number): number {
  const e = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewPoint)));
  return t + 0.5555 * (e - 10);
}

/** Dew point (°C) from temperature and relative humidity (Magnus, Alduchov & Eskridge constants). */
export function dewPoint(t: number, rh: number): number {
  const a = 17.625;
  const b = 243.04;
  const g = Math.log(Math.max(1, rh) / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

export function feelsLike(t: number, windKmh: number, dew: number): { value: number; kind: FeelsKind } {
  if (t <= 0 && windKmh >= 5) return { value: windChill(t, windKmh), kind: 'wind chill' };
  if (t >= 20) {
    const h = humidex(t, dew);
    if (h >= 25 && h - t >= 1) return { value: h, kind: 'humidex' };
  }
  return { value: t, kind: 'air' };
}
