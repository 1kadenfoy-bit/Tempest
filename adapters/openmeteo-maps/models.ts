// The models the app offers, with what each carries and the facts its info
// card shows (v8 05-ModelInfo; content from docs/05-data-sources.md).
//
// Checked Nov 16, 2026 against Open-Meteo's map files (latest.json of each)
// and the point API:
// - HRDPS (cmc_gem_hrdps): 2.5 km, 48 h hourly, profile on pressure levels.
// - RDPS (cmc_gem_rdps_10km): 10 km, 84 h hourly, profile on pressure levels.
// - GDPS (cmc_gem_gdps_15km): 15 km, 10 days; its profile is in a separate
//   file set (cmc_gem_gdps_15km_upper_level), every 3 hours.
// - ECMWF IFS (ecmwf_ifs): 9 km, 15 days; no pressure levels in either the
//   map files or the point API, so it serves precipitation only.

export type ModelId = 'hrdps' | 'rdps' | 'gdps' | 'ecmwf';

export interface ModelSpec {
  id: ModelId;
  label: string;
  fullName: string;
  group: 'high' | 'global';
  /** Map-file model for the surface values (precipitation, 2 m, 10 m). */
  mapModel: string;
  /** Map-file model holding the pressure-level profile, when it differs. */
  profileMapModel?: string;
  /** The point API's name. */
  apiModel: string;
  gridKm: number;
  reachHours: number;
  runsPerDay: number;
  covers: string;
  /** Carries the profile (temperature and height on pressure levels). */
  profile: boolean;
  strengths: string[];
  cautions: string[];
  source: string;
  link: string;
}

export const MODELS: Record<ModelId, ModelSpec> = {
  hrdps: {
    id: 'hrdps', label: 'HRDPS', fullName: 'High Resolution Deterministic Prediction System', group: 'high',
    mapModel: 'cmc_gem_hrdps', apiModel: 'gem_hrdps_continental', gridKm: 2.5, reachHours: 48, runsPerDay: 4, covers: 'Canada', profile: true,
    strengths: [
      'Avalanche Canada forecasters rate it the best short-term match to mountain terrain.',
      'Fine enough to separate valleys from ridges.',
    ],
    cautions: [
      'Under-forecast precipitation on 83% of winter precipitation days in a Fernie study: treat snow totals as a floor.',
      'Ends at 48 h. The next model in the chain takes over, and the seam is marked.',
    ],
    source: 'Environment and Climate Change Canada, through Open-Meteo. Attribution required.',
    link: 'https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps-datamart_en',
  },
  rdps: {
    id: 'rdps', label: 'RDPS', fullName: 'Regional Deterministic Prediction System', group: 'high',
    mapModel: 'cmc_gem_rdps_10km', apiModel: 'gem_regional', gridKm: 10, reachHours: 84, runsPerDay: 4, covers: 'North America', profile: true,
    strengths: ['Trends for days 2 to 3.5, from the same Canadian model family as HRDPS.'],
    cautions: [
      'At 10 km it handles terrain less well than HRDPS: ridges and valleys blur together.',
      'Ends at 84 h. GDPS takes over in the chain, and the seam is marked.',
    ],
    source: 'Environment and Climate Change Canada, through Open-Meteo. Attribution required.',
    link: 'https://avalanche.ca/blogs/gettingthemeteogram',
  },
  gdps: {
    id: 'gdps', label: 'GDPS', fullName: 'Global Deterministic Prediction System', group: 'global',
    mapModel: 'cmc_gem_gdps_15km', profileMapModel: 'cmc_gem_gdps_15km_upper_level', apiModel: 'gem_global', gridKm: 15, reachHours: 240, runsPerDay: 2, covers: 'The world',
    profile: true,
    strengths: ['Long-range planning to 10 days.', 'A cross-check on ECMWF.'],
    cautions: ['At 15 km mountain detail is coarse; use it for trends, not for one slope.', 'Its height profile comes every 3 hours.'],
    source: 'Environment and Climate Change Canada, through Open-Meteo. Attribution required.',
    link: 'https://avalanche.ca/blogs/gettingthemeteogram',
  },
  ecmwf: {
    id: 'ecmwf', label: 'ECMWF IFS', fullName: 'ECMWF Integrated Forecasting System (HRES)', group: 'global',
    mapModel: 'ecmwf_ifs', apiModel: 'ecmwf_ifs', gridKm: 9, reachHours: 360, runsPerDay: 4, covers: 'The world', profile: false,
    strengths: ['Strongest for days 3 to 10; the second-ranked model for BC after HRDPS.', 'Open since 1 Oct 2025 under CC BY 4.0.'],
    cautions: [
      'No height profile in the open data, so it serves precipitation only, with its own rain/snow split rather than the wet-bulb rule.',
      'Rankings beyond the Canadian models are general guidance, not a BC verification.',
    ],
    source: 'European Centre for Medium-Range Weather Forecasts (CC BY 4.0), through Open-Meteo. Attribution required.',
    link: 'https://open-meteo.com/en/docs/ecmwf-api',
  },
};

/** The fallback chain, in order: each takes over where the one before ends or is missing. */
export const CHAIN: ModelId[] = ['hrdps', 'rdps', 'gdps'];

export const modelForMapModel = (m: string): ModelSpec | undefined => Object.values(MODELS).find((x) => x.mapModel === m || x.profileMapModel === m);
