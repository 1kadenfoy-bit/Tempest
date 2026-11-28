// Saved areas, wired into the app (Data section): reading them at start, the
// save box, the saved areas list, "saved data only", and the dashed outlines
// on the map. The saving itself is in saved-areas.ts. Moved out of
// app/main.ts; it reads the shared state in app/state.ts.
import type { GeoJSONSource } from 'maplibre-gl';
import { S, app, $ } from '../state';
import type { LayerSlots } from '../../layers/contract';
import { isAmount } from '../../core/vocabulary';
import { areaParts, tilesInBox, type SavedArea } from '../../core/offline/saved-area';
import type { RunMetadata } from '../../adapters/openmeteo-maps/run-metadata';
import type { ModelId } from '../../adapters/openmeteo-maps/models';
import { source as radarSource } from '../../adapters/eccc-radar/radar';
import { airQuality } from '../../layers/air-quality';
import { coveringRanges } from '../../render/openmeteo-starter';
import { setSavedAreaCount } from '../data/connection';
import { radar } from '../radar/frames';
import { nameNear } from '../shell/pin';
import { openPanel } from '../shell/panel';
import { savePrefs } from '../shell/prefs';
import { colorToken, type Theme } from '../theme/tokens';
import { progressText, savedAreasBody } from './offline-panel';
import { openSaveMode } from './save-mode';
import { deleteArea, listSavedAreas, saveArea, tidyUnfinishedSaves } from './saved-areas';
import { notify } from '../notify/store';
import { readFile, storageState } from './storage';

type Box = [number, number, number, number];

/** Why a layer cannot be saved for offline use, when its source does not allow it. */
export const onlineOnly = (l: LayerSlots): string | undefined =>
  l.id === radar.id && !radarSource.offline ? 'Its source does not allow saving'
  : l.id === 'avalanche' ? 'The latest bulletins are kept automatically'
  : l.id === airQuality.id ? 'Not to be copied in bulk; the latest fires are kept automatically'
  : undefined;
export async function registerSavedAreas() {
  try {
    S.savedAreas = await listSavedAreas();
    S.savedParts = S.savedAreas.flatMap(areaParts);
    setSavedAreaCount(S.savedAreas.length);
    for (const a of S.savedAreas) {
      const file = await readFile(a.basemap.file);
      if (file) S.basemap.addSaved(a.id, file, a.bbox, a.basemap.minzoom, a.basemap.maxzoom);
    }
  } catch { S.savedAreas = []; S.savedParts = []; }
}
/**
 * At start: what a save cut short left (the app closed mid-save) is removed,
 * and the Notification Centre says which save did not finish, so it can be
 * started again (Nov 28).
 */
export async function tidyAfterClose(): Promise<void> {
  const stopped = await tidyUnfinishedSaves();
  for (const name of stopped) {
    notify({ id: `stopped-${name}-${Date.now()}`, kind: 'info', text: `Download did not finish: ${name} · the app closed while saving. Save it again from settings`, time: new Date() });
  }
}
export const H_MS = 3_600_000;
/** The chain a save holds: HRDPS, then RDPS for the hours past its end. */
export function saveRuns(): RunMetadata[] {
  return (['hrdps', 'rdps'] as ModelId[]).flatMap((m) => { const r = S.runs[m]; return r ? [r] : []; });
}
export const hoursTo = (r: RunMetadata) => Math.round((r.validTimes[r.validTimes.length - 1]!.getTime() - Date.now()) / H_MS);

/** Save the chosen layers for a box: the same choices serve a first save and a refresh. */
export async function saveChoice(bbox: Box, layers: string[], hours: number | null, name: string, onProgress: (text: string) => void): Promise<SavedArea> {
  const chosen = S.layers.filter((l) => layers.includes(l.id));
  // Amounts need the per-step conversion; plain values (profiles, wind) do not.
  const amounts = [...new Set(chosen.flatMap((l) => l.saveNeeds.filter(isAmount)))];
  const plain = [...new Set(chosen.flatMap((l) => l.saveNeeds.filter((v) => !isAmount(v))))];
  return saveArea({ bbox, hours, runs: saveRuns(), variables: amounts, plainVariables: plain, name, layers, basemap: S.basemap, style: S.map.getStyle(), onProgress: (p) => onProgress(progressText(p)) });
}

export async function afterSavedChange() {
  for (const a of S.savedAreas) S.basemap.removeSaved(a.id);
  await registerSavedAreas();
  drawSavedOutlines();
  // Offline, the runs come from the saved areas: they may have changed.
  if (S.usingSaved) void app.loadRun();
}

export function openSaveBox() {
  if (!S.run || S.usingSaved) return;
  const [first, ...rest] = saveRuns();
  if (!first) return;
  // The save box is drawn on a flat, north-up map.
  S.map.jumpTo({ pitch: 0, bearing: 0 });
  openSaveMode(S.map, {
    firstHours: hoursTo(first),
    endHours: Math.max(hoursTo(first), ...rest.map(hoursTo)),
    layers: S.layers.map((l) => ({ id: l.id, title: l.title, variables: [...new Set(l.saveNeeds)], onlineOnly: onlineOnly(l) })),
    initial: S.active.id,
    // Each model's cells over the box (as saved: 4 bytes a value), for its share of the hours.
    weatherBytes: (bb, hours, variables) => {
      const cells = (m: string) => coveringRanges(m, bb).reduce((n, r) => n * (r.end - r.start), 1);
      const firstH = Math.min(hours, hoursTo(first));
      const later = rest[0] ? Math.max(0, hours - firstH) * cells(rest[0].model) : 0;
      return 4 * variables * (firstH * cells(first.model) + later);
    },
    basemapBytes: (bb) => S.basemap.storedBytes(tilesInBox(bb, 0, 15)),
    save: async (choice, onProgress) => {
      // Named after the place nearest the box's centre, as the map labels it.
      const sw = S.map.project([choice.bbox[0], choice.bbox[1]]), ne = S.map.project([choice.bbox[2], choice.bbox[3]]);
      const c = { x: (sw.x + ne.x) / 2, y: (sw.y + ne.y) / 2 };
      const name = nameNear(S.map, c, Math.max(40, Math.min(Math.abs(ne.x - sw.x), Math.abs(sw.y - ne.y)) / 2)) ?? `Area ${S.savedAreas.length + 1}`;
      await saveChoice(choice.bbox, choice.layers, choice.hours, name, onProgress);
      await afterSavedChange();
      document.body.dataset.saved = 'true';
    },
    onClose: () => undefined,
  });
}

export async function openSavedList() {
  const st = await storageState();
  openPanel({
    origin: $('map-layers'),
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
    title: 'Saved areas',
    caption: 'For use with no signal',
    body: savedAreasBody(S.savedAreas, { savedOnly: S.prefs.savedOnly, online: !S.usingSaved && !!S.run, ...st }, {
      refresh: async (a, onProgress) => {
        // The same box, layers and window, from the newest forecast; the old copy goes once the new one is in.
        await saveChoice(a.bbox, a.layers ?? ['precipitation'], a.window ?? null, a.name ?? 'Saved area', onProgress);
        await deleteArea(a);
        await afterSavedChange();
        void openSavedList();
      },
      remove: async (a) => {
        await deleteArea(a);
        await afterSavedChange();
      },
      setSavedOnly,
    }),
  });
}

/** "Saved data only", from the saved areas list or app settings: one pref, one effect. */
export function setSavedOnly(on: boolean) {
  S.prefs.savedOnly = on;
  savePrefs(S.prefs);
  document.body.dataset.savedOnly = String(on);
  S.stations.refresh();
  void app.loadRun();
}
/** Saved areas' boxes as dashed outlines, so it is clear where data exists offline. */
export function drawSavedOutlines() {
  const data = {
    type: 'FeatureCollection' as const,
    features: S.savedAreas.map((a) => {
      const [w, s_, e, n] = a.bbox;
      return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[w, s_], [e, s_], [e, n], [w, n], [w, s_]] } };
    }),
  };
  const src = S.map.getSource('saved-areas') as GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  S.map.addSource('saved-areas', { type: 'geojson', data });
  S.map.addLayer({ id: 'saved-areas', type: 'line', source: 'saved-areas', paint: { 'line-color': colorToken('ink-2', S.settings.theme()), 'line-width': 1.5, 'line-dasharray': [3, 2] } });
}

/** Theme changed: the outlines follow. */
export function recolourSavedOutlines(t: Theme): void {
  if (S.map.getLayer('saved-areas')) S.map.setPaintProperty('saved-areas', 'line-color', colorToken('ink-2', t));
}
