// Adapter: Open-Meteo gridded map files ("data_spatial"). Reads a model's
// latest.json, which names the newest complete run and its valid times.
//
// Endpoint checked Nov 15, 2026 against the @openmeteo/weather-map-layer 0.3.2
// README: the raw S3 bucket is open to any site (CORS *). The official
// data-spatial.open-meteo.com host only answers *.open-meteo.com pages.

export const source = {
  id: 'openmeteo-maps',
  name: 'Open-Meteo gridded map files',
  provides: 'The weather on the map and in saved areas',
  baseUrl: 'https://openmeteo.s3.amazonaws.com/data_spatial',
  licence: 'CC BY 4.0',
  attribution: 'Weather data by Open-Meteo.com (CC BY 4.0), from Environment and Climate Change Canada models',
  link: 'https://open-meteo.com/',
  offline: true,
  terms: 'Free for non-commercial use; no uptime guarantee.',
} as const;

export interface RunMetadata {
  model: string;
  completed: boolean;
  referenceTime: Date;
  lastModified: Date;
  validTimes: Date[];
  variables: string[];
}

interface LatestJson {
  completed: boolean;
  reference_time: string;
  last_modified_time: string;
  valid_times: string[];
  variables: string[];
}

function isLatestJson(v: unknown): v is LatestJson {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.reference_time === 'string' && Array.isArray(o.valid_times) && Array.isArray(o.variables);
}

export function parseRunMetadata(model: string, json: unknown): RunMetadata {
  if (!isLatestJson(json)) throw new Error(`${model}: unexpected latest.json shape`);
  return {
    model,
    completed: json.completed,
    referenceTime: new Date(json.reference_time),
    lastModified: new Date(json.last_modified_time),
    validTimes: json.valid_times.map((t) => new Date(t)),
    variables: [...json.variables],
  };
}

export function latestUrl(model: string): string {
  return `${source.baseUrl}/${model}/latest.json`;
}

/** URL of the file holding one valid time of one run. */
export function stepFileUrl(model: string, run: Date, valid: Date): string {
  const iso = (d: Date) => d.toISOString();
  const r = iso(run);
  const v = iso(valid);
  return `${source.baseUrl}/${model}/${r.slice(0, 4)}/${r.slice(5, 7)}/${r.slice(8, 10)}/${r.slice(11, 13)}00Z/${v.slice(0, 13)}00.om`;
}

export async function fetchRunMetadata(model: string, fetchFn: typeof fetch = fetch): Promise<RunMetadata> {
  const res = await fetchFn(latestUrl(model));
  if (!res.ok) throw new Error(`${model}: latest.json ${res.status}`);
  return parseRunMetadata(model, await res.json());
}
