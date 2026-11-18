// Air quality map fill: PM2.5 in µg/m³ coloured on the device by the app's
// renderer through a lookup strip built from ECCC's own PM2.5 scale
// (core/air/pm25.ts). The renderer is the typed-rate one with a single kind:
// all three strips are the same and the second number is always 0.
import { lookupStrip, rampColor } from '../../core/color/ramp';
import { PM25_MAX, PM25_STOPS, pm25Position, pm25Ramp } from '../../core/air/pm25';
import type { GridField } from '../../core/vocabulary';

/** Light haze lets the map show through: 35% at 1 µg/m³, full from about 30. */
export const AIR_ALPHA = { from: 0.35, full: 0.25 };
/** Overall strength of the fill, so the terrain and fire marks read through. */
export const AIR_OPACITY = 0.72;

export function airRenderStyle() {
  const row = lookupStrip(pm25Ramp(), 0, PM25_MAX, 2048, AIR_ALPHA);
  return { strips: [row, row, row] as [typeof row, typeof row, typeof row], max: PM25_MAX, mixedFrom: 2, secondFrom: 3, opacity: AIR_OPACITY };
}

/** Two numbers per cell for the GPU: the value, and 0 (one kind only). Missing cells are 0 (not drawn). */
export function airDrawField(f: GridField, gridKey: string) {
  const v = f.values.pm2_5_smoke ?? f.values.pm2_5;
  const data = new Float32Array(f.nx * f.ny * 2);
  if (v) for (let i = 0; i < f.nx * f.ny; i++) { const x = v[i]!; data[i * 2] = Number.isFinite(x) ? Math.max(0, x) : 0; }
  return { gridKey, bbox: f.bbox, nx: f.nx, ny: f.ny, data };
}

/** CSS gradient of the scale, with each breakpoint where the legend places it. */
export function airGradient(): string {
  return `linear-gradient(90deg, ${PM25_STOPS.map((s) => `${s.color} ${(pm25Position(s.value) * 100).toFixed(1)}%`).join(', ')})`;
}

/** A value's colour for the chart (opaque). */
export function airColor(v: number): string {
  const { valueStops, colors } = pm25Ramp();
  const [r, g, b] = rampColor({ valueStops, colors }, Math.max(PM25_STOPS[0]!.value, v));
  return `rgb(${r},${g},${b})`;
}
