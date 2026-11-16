// Elevation bands (valley, mid-mountain, alpine), per region. A PROPOSAL for
// Kaden (M5), labelled approximate in the app until he agrees.
//
// Rule: alpine starts at the region's typical treeline; the valley band ends
// 800 m below it; mid-mountain is between. Treeline heights are rounded
// typical values for each part of BC (Avalanche Canada's forecasts use the
// same three bands without fixed heights). On the North Shore this gives the
// v8 screens' figures: valley below 600 m, alpine above 1,400 m.

export interface Bands {
  region: string;
  /** Top of the valley band (m). */
  valleyTop: number;
  /** Bottom of the alpine band, the treeline (m). */
  alpineBottom: number;
  approximate: true;
}

interface Region { name: string; treeline: number; test: (lat: number, lon: number) => boolean }

/** First match wins. Boundaries are rough lines, good enough for an approximate band. */
const REGIONS: Region[] = [
  { name: 'Northern BC', treeline: 1300, test: (lat) => lat >= 54.5 },
  { name: 'Rockies', treeline: 2200, test: (_lat, lon) => lon >= -116.5 },
  { name: 'Columbia Mountains', treeline: 1950, test: (_lat, lon) => lon >= -120.5 },
  { name: 'Coast inland', treeline: 1800, test: (_lat, lon) => lon >= -122.5 },
  { name: 'Sea to Sky', treeline: 1650, test: (lat) => lat >= 49.85 },
  { name: 'South Coast', treeline: 1400, test: () => true },
];

export const VALLEY_BELOW_TREELINE = 800;

export function bandsAt(lat: number, lon: number): Bands {
  const r = REGIONS.find((x) => x.test(lat, lon))!;
  return { region: r.name, valleyTop: r.treeline - VALLEY_BELOW_TREELINE, alpineBottom: r.treeline, approximate: true };
}

export type BandName = 'Valley' | 'Mid' | 'Alpine';

export function bandOf(b: Bands, elevation: number): BandName {
  return elevation < b.valleyTop ? 'Valley' : elevation >= b.alpineBottom ? 'Alpine' : 'Mid';
}

/** A height that stands for each band in tables: its middle (alpine: 300 m above treeline). */
export function bandHeight(b: Bands, band: BandName): number {
  if (band === 'Valley') return Math.round(b.valleyTop / 2);
  if (band === 'Alpine') return b.alpineBottom + 300;
  return Math.round((b.valleyTop + b.alpineBottom) / 2);
}
