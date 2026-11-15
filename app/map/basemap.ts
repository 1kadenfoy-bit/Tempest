// Base map: a Protomaps (OpenStreetMap) region file served with the app, read by
// byte ranges through the pmtiles protocol. Temporary dark style from the
// Protomaps "dark" flavour with the map ground and water taken from the tokens;
// the Tempest topo style is M1 work.
import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { maplibregl } from './maplibre';
import { PMTiles, Protocol } from 'pmtiles';
import { RangeOrWholeSource } from './range-source';

export { RangeOrWholeSource };
import { colorToken } from '../theme/tokens';

export const basemapSource = {
  id: 'protomaps',
  name: 'Protomaps base map (OpenStreetMap)',
  licence: 'ODbL (data); BSD-3 (Protomaps)',
  attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
  offline: true,
} as const;

const protocol = new Protocol();
let registered = false;
export function registerPmtiles(): void {
  if (registered) return;
  maplibregl.addProtocol('pmtiles', protocol.tile);
  registered = true;
}

/** Register a region file served with the app; returns its source for inspection. */
export function addRegionFile(regionFile: string): RangeOrWholeSource {
  const source = new RangeOrWholeSource(new URL(regionFile, location.href).href);
  protocol.add(new PMTiles(source));
  return source;
}

export function baseStyle(regionFile: string): StyleSpecification {
  const source = addRegionFile(regionFile);
  const flavor = {
    ...namedFlavor('dark'),
    background: colorToken('map-ground'),
    earth: colorToken('map-ground'),
    water: colorToken('water'),
  };
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${source.getKey()}`,
        attribution: basemapSource.attribution,
      },
    },
    layers: layers('protomaps', flavor, { lang: 'en' }),
  };
}
