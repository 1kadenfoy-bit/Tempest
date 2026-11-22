// Mountain shadows on the map (Maps section): with the sun switch on and the sun up, the
// ground that the mountains hide from the sun is darkened, in the direction the sun is.
//
// The shadows are worked out from the same terrain heights the hillshade uses
// (app/map/elevation.ts, app/map/shadow-mask.ts), for the area on screen plus a margin,
// and drawn as one picture under the weather fills, so weather colours are never darkened.
// They are worked out again when the sun moves a little or the map moves out of the area
// they cover, never while the map is at rest.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { elevationMosaic, type Mosaic } from './elevation';
import { shadowMask, shrinkMax } from './shadow-mask';
import { tuning } from './tuning';

const SOURCE = 'sun-cast';
const LAYER = 'sun-cast';
/** Below this map zoom the shadows are too small to see (and the area too big to work out). */
const MIN_ZOOM = 9;
/** The grid the shadows are worked out on: at most this many cells across. */
const MAX_CELLS = 560;
/** Shadow colour: the cool blue-violet of the game's shadows. */
const SHADOW_RGB: [number, number, number] = [52, 66, 128];
/** How dark the darkest shadow is before the tuning slider. */
const BASE_OPACITY = 0.55;

const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
const TRANSPARENT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

interface Sun { azimuth: number; altitude: number }

class CastShadows {
  private map: MapLibreMap | null = null;
  private sun: Sun | null = null;
  private done: { key: string; sun: Sun } | null = null;
  private mosaic: Mosaic | null = null;
  private timer = 0;
  private busy = false;
  private again = false;

  attach(map: MapLibreMap, before: string | undefined): void {
    this.map = map;
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, { type: 'image', url: TRANSPARENT, coordinates: [[-180, 85], [180, 85], [180, -85], [-180, -85]] });
      map.addLayer({ id: LAYER, type: 'raster', source: SOURCE, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, before);
    }
    map.on('moveend', () => this.schedule());
    tuning.onChange(() => this.opacity());
  }

  /** The sun to cast shadows for, or null for none (sun switch off, or the sun is down). Cheap to call again. */
  set(sun: Sun | null): void {
    this.sun = sun;
    this.opacity();
    if (!sun) return;
    const d = this.done;
    // Work again only if the sun moved by about half a degree, or this is the first time.
    if (!d || Math.abs(d.sun.azimuth - sun.azimuth) > 0.5 || Math.abs(d.sun.altitude - sun.altitude) > 0.3) this.schedule();
  }

  /** The layer's strength: the sun's height (shadows blend into the dusk below 8 degrees), the zoom, and the tuning slider. */
  private opacity(): void {
    const map = this.map;
    if (!map || !map.getLayer(LAYER)) return;
    const on = this.sun !== null;
    map.setLayoutProperty(LAYER, 'visibility', on ? 'visible' : 'none');
    const h = this.sun ? Math.min(1, Math.max(0, this.sun.altitude / 8)) : 0;
    map.setPaintProperty(LAYER, 'raster-opacity', ['interpolate', ['linear'], ['zoom'], MIN_ZOOM - 1, 0, MIN_ZOOM, BASE_OPACITY * h * tuning.get().cast] as never);
  }

  private schedule(): void {
    if (!this.sun || !this.map || this.map.getZoom() < MIN_ZOOM - 0.5) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), 250);
  }

  private async run(): Promise<void> {
    const map = this.map, sun = this.sun;
    if (!map || !sun) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      const b = map.getBounds();
      const w = b.getEast() - b.getWest(), h = b.getNorth() - b.getSouth();
      const bbox: [number, number, number, number] = [b.getWest() - w * 0.25, b.getSouth() - h * 0.25, b.getEast() + w * 0.25, b.getNorth() + h * 0.25];
      const m = await elevationMosaic(bbox, map.getZoom(), this.mosaic);
      this.mosaic = m;
      const k = Math.max(1, Math.ceil(Math.max(m.width, m.height) / MAX_CELLS));
      const grid = shrinkMax(m.data, m.width, m.height, k);
      // Metres per cell: the Web Mercator tile's ground size at the area's latitude, times the shrink.
      const [x0, y0, x1, y1] = m.merc;
      const latMid = latOf((y0 + y1) / 2);
      // The mosaic spans (x1 - x0) of the world across m.width pixels.
      const metresPerPixel = (40_075_016.686 * Math.cos((latMid * Math.PI) / 180) * (x1 - x0)) / m.width;
      const mask = shadowMask(grid.data, grid.width, grid.height, { cellM: metresPerPixel * k, azimuth: sun.azimuth, altitude: sun.altitude });
      const canvas = document.createElement('canvas');
      canvas.width = grid.width; canvas.height = grid.height;
      const g = canvas.getContext('2d')!;
      const img = g.createImageData(grid.width, grid.height);
      for (let i = 0; i < mask.length; i++) {
        img.data[i * 4] = SHADOW_RGB[0]; img.data[i * 4 + 1] = SHADOW_RGB[1]; img.data[i * 4 + 2] = SHADOW_RGB[2];
        img.data[i * 4 + 3] = mask[i]!;
      }
      g.putImageData(img, 0, 0);
      const src = map.getSource(SOURCE) as { updateImage?: (o: { url: string; coordinates: number[][] }) => void } | undefined;
      src?.updateImage?.({ url: canvas.toDataURL('image/png'), coordinates: [[lngOf(x0), latOf(y0)], [lngOf(x1), latOf(y0)], [lngOf(x1), latOf(y1)], [lngOf(x0), latOf(y1)]] });
      this.done = { key: m.key, sun };
    } catch {
      // No terrain tiles (offline, not saved): no shadows here.
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(); }
    }
  }
}

export const castShadows = new CastShadows();
