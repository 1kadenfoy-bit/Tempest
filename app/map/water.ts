// The look of water (Maps section), after the game Geographical Adventures: a deep
// blue that brightens with the sun, soft ripples, sparkles where the sun catches the
// surface, and white foam along the shores. Drawn from the base map's own water
// polygons, so it works over the Terrain colours and over the satellite picture.
//
// Nothing here moves at rest: the ripples and sparkles are still patterns, brighter or
// fainter with the sun's height. (Moving waves can come later, only while the map moves
// or water is on screen, if Kaden wants them.) The glint stays on water and is kept
// soft, so it never washes out the map or its labels (rule 17). All hues are proposals.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/tokens';
import { mix } from './style-mix';
import { mapWater } from './style';

export const WATER_LAYERS = { base: 'water', waves: 'water_waves', glint: 'water_glint', foam: 'water_shine' } as const;
const RIPPLE = 'water-ripple';
const SPARKLE = 'water-sparkle';
const SIZE = 128;

/** A small seeded random generator, so the patterns are the same on every device. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Draws `draw` at the tile and at its eight neighbours' offsets, so the pattern joins up across tiles. */
function tiled(draw: (g: CanvasRenderingContext2D) => void): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) { g.save(); g.translate(dx, dy); draw(g); g.restore(); }
  return g.getImageData(0, 0, SIZE, SIZE);
}

function rippleImage(): ImageData {
  return tiled((g) => {
    const r = rng(7);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(225, 242, 255, 0.55)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 34; i++) {
      const x = r() * SIZE, y = r() * SIZE, len = 8 + r() * 16, tilt = (r() - 0.5) * 0.5;
      g.beginPath();
      g.moveTo(x - len / 2, y);
      g.quadraticCurveTo(x, y - 2 - r() * 3 + tilt * len, x + len / 2, y + tilt * len * 0.4);
      g.stroke();
    }
  });
}

function sparkleImage(): ImageData {
  return tiled((g) => {
    const r = rng(23);
    g.fillStyle = 'rgba(255, 255, 255, 1)';
    for (let i = 0; i < 16; i++) {
      const x = r() * SIZE, y = r() * SIZE, s = 0.9 + r() * 1.2;
      g.fillRect(x - s / 2, y - s / 2, s, s);
      g.fillRect(x - s * 2, y - 0.4, s * 4, 0.8);
    }
  });
}

/** Registers the water pictures when a layer asks for one the map does not have yet. */
export function registerWaterImages(map: MapLibreMap): void {
  map.on('styleimagemissing', (e) => {
    if (map.hasImage(e.id)) return;
    if (e.id === RIPPLE) map.addImage(RIPPLE, rippleImage(), { pixelRatio: 2 });
    else if (e.id === SPARKLE) map.addImage(SPARKLE, sparkleImage(), { pixelRatio: 2 });
  });
}

/** The three layers drawn over the base water fill, from zoom 8 (ripples and sparkles over the polygons, foam along their edges). */
export function waterLayers(theme: Theme): import('maplibre-gl').LayerSpecification[] {
  const base = mapWater(theme);
  const poly = ['==', ['geometry-type'], 'Polygon'] as never;
  return [
    { id: WATER_LAYERS.waves, type: 'fill', source: 'protomaps', 'source-layer': 'water', filter: poly, minzoom: 8, paint: { 'fill-pattern': RIPPLE, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 11, 0.32] } },
    { id: WATER_LAYERS.glint, type: 'fill', source: 'protomaps', 'source-layer': 'water', filter: poly, minzoom: 9, paint: { 'fill-pattern': SPARKLE, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 12, 0.5] } },
    // Foam: a white, blurred line along every shore.
    { id: WATER_LAYERS.foam, type: 'line', source: 'protomaps', 'source-layer': 'water', filter: poly, minzoom: 8, layout: { 'line-join': 'round' }, paint: { 'line-color': mix(base, '#FFFFFF', 0.8), 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 7], 'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5], 'line-opacity': 0.7 } },
  ] as unknown as import('maplibre-gl').LayerSpecification[];
}

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/**
 * The water's colour and shine for the sun's height (null: no sun, the plain day look).
 * Lower sun: a deeper blue and fewer sparkles; high sun: bright, with the most glint.
 */
export function applyWater(map: MapLibreMap, theme: Theme, altitude: number | null, satellite: boolean): void {
  const base = mapWater(theme);
  const day = altitude === null ? 1 : smooth(altitude / 35);
  const night = altitude === null ? 0 : smooth((4 - altitude) / 14);
  const colour = mix(mix(base, '#0A1B38', 0.55 * (1 - day)), '#FFFFFF', 0.06 * day);
  if (map.getLayer(WATER_LAYERS.base)) {
    map.setPaintProperty(WATER_LAYERS.base, 'fill-color', colour);
    // Over the satellite picture the water is only tinted, so the picture's own water shows through.
    map.setPaintProperty(WATER_LAYERS.base, 'fill-opacity', satellite ? 0.3 : 1);
  }
  const z = ['interpolate', ['linear'], ['zoom']] as const;
  if (map.getLayer(WATER_LAYERS.waves)) map.setPaintProperty(WATER_LAYERS.waves, 'fill-opacity', [...z, 8, 0, 11, 0.32 * (0.5 + 0.5 * day) * (1 - 0.6 * night)] as never);
  // The glint needs the sun well up; at dusk it fades out.
  if (map.getLayer(WATER_LAYERS.glint)) map.setPaintProperty(WATER_LAYERS.glint, 'fill-opacity', [...z, 9, 0, 12, 0.55 * smooth((altitude === null ? 40 : altitude) / 25)] as never);
  if (map.getLayer(WATER_LAYERS.foam)) map.setPaintProperty(WATER_LAYERS.foam, 'line-opacity', 0.7 * (1 - 0.7 * night));
}
