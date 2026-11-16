// Which grid to ask for, for a map view: the view's box snapped outward to a
// whole-degree lattice (so small pans reuse the same grid), clipped to the
// model's area, at a resolution that suits the zoom. Pure logic.

export type BBox = [west: number, south: number, east: number, north: number];

export interface GridRequest { bbox: BBox; nx: number; ny: number; key: string }

/** Grid spacing in degrees of latitude for a zoom: model-native close in, coarser far out. */
export function spacingForZoom(zoom: number): number {
  if (zoom >= 8) return 0.0225; // about 2.5 km, HRDPS's own spacing
  if (zoom >= 6.5) return 0.045;
  return 0.09;
}

export function gridRequest(view: BBox, zoom: number, limit: BBox, snap = 1): GridRequest | null {
  const w = Math.max(limit[0], Math.floor(view[0] / snap) * snap);
  const s = Math.max(limit[1], Math.floor(view[1] / snap) * snap);
  const e = Math.min(limit[2], Math.ceil(view[2] / snap) * snap);
  const n = Math.min(limit[3], Math.ceil(view[3] / snap) * snap);
  if (w >= e || s >= n) return null;
  const dLat = spacingForZoom(zoom);
  // Square-ish cells on the ground: longitude steps widen with latitude.
  const dLon = dLat / Math.cos((((s + n) / 2) * Math.PI) / 180);
  const nx = Math.max(2, Math.round((e - w) / dLon));
  const ny = Math.max(2, Math.round((n - s) / dLat));
  return { bbox: [w, s, e, n], nx, ny, key: `${w},${s},${e},${n}@${dLat}` };
}
