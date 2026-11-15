// Continuous colour ramps from design/tokens.json turned into lookup strips:
// evenly spaced RGBA entries between min and max, which the renderer indexes
// by value on the device. Lightness carries the order; values above the top
// stop saturate; values under the cutoff are transparent.

export type RGBA = [number, number, number, number];

export interface Ramp {
  /** [value, position 0..1 along the colours] pairs, ascending. */
  valueStops: [number, number][];
  /** Hex colours spaced evenly from position 0 to 1. */
  colors: string[];
  /** Values below this are not drawn. */
  cutoff?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Position 0..1 along the colours for a value, by the ramp's value stops. */
export function rampPosition(ramp: Ramp, value: number): number {
  const stops = ramp.valueStops;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return 0;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const [v1, p1] = stops[i]!;
    const [v0, p0] = stops[i - 1]!;
    if (value <= v1) return p0 + ((value - v0) / (v1 - v0)) * (p1 - p0);
  }
  return last[1];
}

export function rampColor(ramp: Ramp, value: number): RGBA {
  if (ramp.cutoff !== undefined && value < ramp.cutoff) return [0, 0, 0, 0];
  const pos = rampPosition(ramp, value) * (ramp.colors.length - 1);
  const i = Math.min(Math.floor(pos), ramp.colors.length - 2);
  const t = pos - i;
  const a = hexToRgb(ramp.colors[i]!);
  const b = hexToRgb(ramp.colors[i + 1]!);
  return [0, 1, 2].map((k) => Math.round(a[k]! + (b[k]! - a[k]!) * t)).concat(1) as RGBA;
}

/** `size` entries for values evenly spaced from min to max. */
export function lookupStrip(ramp: Ramp, min: number, max: number, size = 256): RGBA[] {
  return Array.from({ length: size }, (_, i) => rampColor(ramp, min + ((max - min) * i) / (size - 1)));
}
