// The data viewer: plain tables of what the data section holds, built on the
// same adapters and calculations the app uses. Data section's own page.
import { MODELS, type ModelId } from '../../adapters/openmeteo-maps/models';
import { CLOUD_SUPPORT, CLOUD_VARIABLES } from '../../adapters/openmeteo-maps/clouds';
import { fetchRunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import { API_MODEL, apiUrl } from '../../adapters/openmeteo-api/point-series';
import { estimateSave, type PlanContext } from '../../core/offline/save-plan';
import { tilesInBox } from '../../core/offline/saved-area';
import { coveringRanges } from '../../render/openmeteo-starter';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const MODEL_IDS = Object.keys(MODELS) as ModelId[];
/** The Open-Meteo map-file name of each model. */
const MAP_MODEL: Record<ModelId, string> = Object.fromEntries(MODEL_IDS.map((m) => [m, MODELS[m].mapModel])) as Record<ModelId, string>;

function place() { return { lat: Number($<HTMLInputElement>('lat').value), lon: Number($<HTMLInputElement>('lon').value) }; }

function table(head: string[], rows: (string | number)[][]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const t = document.createElement('table');
  const h = t.createTHead().insertRow();
  head.forEach((x) => { const th = document.createElement('th'); th.textContent = x; h.append(th); });
  const b = t.createTBody();
  rows.forEach((r) => { const tr = b.insertRow(); r.forEach((c) => { tr.insertCell().textContent = String(c); }); });
  wrap.append(t);
  return wrap;
}
const show = (id: string, ...nodes: (HTMLElement | string)[]) => { const el = $(id); el.replaceChildren(...nodes.map((n) => { if (typeof n !== 'string') return n; const p = document.createElement('p'); p.className = 'note'; p.textContent = n; return p; })); };
const mb = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} kB` : `${(b / 1e6).toFixed(1)} MB`);

$('clouds').addEventListener('click', async () => {
  show('clouds-out', 'Loading…');
  const { lat, lon } = place();
  try {
    const answers = await Promise.all(MODEL_IDS.map(async (m) => {
      const url = apiUrl(MAP_MODEL[m], [{ lat, lon }], CLOUD_VARIABLES, [new Date(Date.now() - 3_600_000), new Date(Date.now() + 23 * 3_600_000)]);
      const json = (await (await fetch(url)).json()) as { hourly?: Record<string, (number | null)[]>; reason?: string };
      if (!json.hourly) throw new Error(`${MODELS[m].label}: ${json.reason ?? 'no answer'}`);
      return json.hourly;
    }));
    const times = (answers[0]!.time as unknown as number[]) ?? [];
    const rows = times.map((t, i) => [
      new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ') + ' UTC',
      ...answers.flatMap((a) => CLOUD_VARIABLES.map((v) => a[v]?.[i] ?? '–')),
    ]);
    const head = ['Hour', ...MODEL_IDS.flatMap((m) => ['total', 'low', 'mid', 'high'].map((k) => `${MODELS[m].label} ${k}`))];
    show('clouds-out', table(head, rows), 'Percent of the sky. Models: ' + MODEL_IDS.map((m) => `${MODELS[m].label} (${API_MODEL[MAP_MODEL[m]]})`).join(', '));
  } catch (err) { show('clouds-out', `Could not load: ${String((err as Error).message ?? err)}`); }
});

$('fields').addEventListener('click', async () => {
  show('fields-out', 'Loading…');
  try {
    const rows = await Promise.all(MODEL_IDS.map(async (m) => {
      const run = await fetchRunMetadata(MAP_MODEL[m]);
      const have = CLOUD_VARIABLES.filter((v) => run.variables.includes(v));
      const expected = CLOUD_SUPPORT[m].grid;
      const agree = expected.length === have.length && expected.every((v) => have.includes(v));
      return [MODELS[m].label, have.join(', ') || 'none', agree ? 'yes' : 'NO: the table in the code needs updating', run.referenceTime.toISOString().slice(0, 13) + 'Z'];
    }));
    show('fields-out', table(['Model', 'Cloud fields in its map files', 'Matches the code', 'Run'], rows));
  } catch (err) { show('fields-out', `Could not load: ${String((err as Error).message ?? err)}`); }
});

$('estimate').addEventListener('click', async () => {
  show('estimate-out', 'Loading…');
  const { lat, lon } = place();
  try {
    const bbox: [number, number, number, number] = [lon - 0.15, lat - 0.15, lon + 0.15, lat + 0.15];
    const chain = ['hrdps', 'rdps', 'gdps'] as ModelId[];
    const loaded = await Promise.all(chain.map(async (m) => [m, await fetchRunMetadata(MAP_MODEL[m])] as const));
    const now = new Date();
    const ctx: PlanContext = {
      now, chain,
      runs: Object.fromEntries(loaded.map(([m, r]) => [m, { model: m, referenceTime: r.referenceTime, validTimes: r.validTimes }])),
      layers: {
        precipitation: { id: 'precipitation', needs: ['precipitation', 'snowfall_water_equivalent', 'temperature_1000hPa', 'temperature_850hPa'] },
        temperature: { id: 'temperature', needs: ['temperature_2m', 'temperature_1000hPa', 'temperature_850hPa'] },
        wind: { id: 'wind', needs: ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'] },
        clouds: { id: 'clouds', needs: ['cloud_cover'] },
      },
      cells: (m, bb) => coveringRanges(MAP_MODEL[m as ModelId], bb).reduce((n, r) => n * (r.end - r.start), 1),
      mapBytes: async () => tilesInBox(bbox, 0, 15).length * 1.5e4,
    };
    const shape = { bbox, outline: [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]] as [number, number][] };
    const est = await estimateSave({ shape, layers: Object.keys(ctx.layers).map((layer) => ({ layer, model: 'auto' })), from: now, to: new Date(now.getTime() + 24 * 3_600_000) }, ctx);
    show('estimate-out',
      table(['Layer', 'Space', 'Covers', 'Note'], est.layers.map((l) => [l.layer, mb(l.bytes), l.covers ? `${l.covers.from.toISOString().slice(5, 13)}Z to ${l.covers.to.toISOString().slice(5, 13)}Z` : 'nothing', l.note ?? ''])),
      `Map and terrain: about ${mb(est.mapBytes)} (a stand-in count until the outline tiles arrive). Total: ${mb(est.totalBytes)}.`);
  } catch (err) { show('estimate-out', `Could not load: ${String((err as Error).message ?? err)}`); }
});
