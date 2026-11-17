// The credits registry: every source the app reads, with its licence,
// attribution and link, taken from the metadata each adapter carries. The
// credits list in app settings is generated from this; nothing is typed in
// the UI. A new adapter adds its `source` here (a unit test checks that
// every adapter folder is listed).
import { source as openMeteoMaps } from '../../adapters/openmeteo-maps/run-metadata';
import { source as openMeteoApi } from '../../adapters/openmeteo-api/point-series';
import { source as ecccHrdpa } from '../../adapters/eccc-geomet/hrdpa';
import { source as ecccAlerts } from '../../adapters/eccc-alerts/alerts';
import { source as ecccRadar } from '../../adapters/eccc-radar/radar';
import { source as avalancheCanada } from '../../adapters/avalanche-canada/forecasts';
import { source as avalancheMin } from '../../adapters/avalanche-canada/min';
import { source as bcGeonames } from '../../adapters/bc-geonames/geonames';
import { source as ecccSwob } from '../../adapters/eccc-swob/swob';
import { source as avcanWeather } from '../../adapters/avcan-weather/stations';
import { originators } from '../../adapters/openmeteo-maps/models';
import { terrainSource } from '../map/terrain-source';
import { renderer } from '../../render/openmeteo-starter/about';

export type CreditGroup = 'Weather data' | 'Base map and terrain' | 'Software';

export interface Credit {
  id: string;
  group: CreditGroup;
  name: string;
  /** What the app uses it for. */
  provides: string;
  licence: string;
  /** Plain text, as the source asks to be credited. */
  attribution: string;
  link: string;
  /** Extra terms the source sets, when it has them. */
  terms?: string | undefined;
}

/** Attribution strings that carry links (map sources) as plain text. */
export function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&copy;/g, '©').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** The link in an attribution string whose address contains `host` (or the first link), if any. */
export function linkIn(html: string, host = ''): string | null {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
  return links.find((l) => l.includes(host)) ?? links[0] ?? null;
}

/** The base map files' attribution, as tools/build-basemap.mjs writes it into the manifest. */
export const BASEMAP_ATTRIBUTION = '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

/** Every credit, in the order the list shows them. `basemapAttribution` comes from the base map's manifest. */
export function credits(basemapAttribution: string = BASEMAP_ATTRIBUTION): Credit[] {
  const adapter = (s: { id: string; name: string; provides: string; licence: string; attribution: string; link: string; terms?: string }): Credit => ({
    id: s.id, group: 'Weather data', name: s.name, provides: s.provides, licence: s.licence, attribution: s.attribution, link: s.link, terms: s.terms,
  });
  return [
    adapter(openMeteoMaps),
    adapter(openMeteoApi),
    adapter(ecccHrdpa),
    adapter(ecccAlerts),
    adapter(ecccRadar),
    adapter(ecccSwob),
    adapter(avcanWeather),
    adapter(avalancheCanada),
    adapter(avalancheMin),
    ...Object.values(originators).map((o) => ({ ...o, group: 'Weather data' as const })),
    {
      id: 'basemap', group: 'Base map and terrain', name: 'Protomaps base map',
      provides: 'Roads, places, water and land cover',
      licence: 'OpenStreetMap data: Open Database Licence (ODbL)',
      attribution: plainText(basemapAttribution),
      link: linkIn(basemapAttribution, 'openstreetmap') ?? 'https://openstreetmap.org/copyright',
    },
    {
      id: terrainSource.id, group: 'Base map and terrain', name: terrainSource.name,
      provides: 'Hillshade, contours and ground heights',
      licence: terrainSource.licence, attribution: plainText(terrainSource.attribution), link: terrainSource.link,
    },
    { ...adapter(bcGeonames), group: 'Base map and terrain' },
    {
      id: 'openmeteo-starter', group: 'Software', name: renderer.name,
      provides: 'Reads the weather model files',
      licence: renderer.licence, attribution: `${renderer.name} ${renderer.version}`, link: renderer.link,
    },
  ];
}
