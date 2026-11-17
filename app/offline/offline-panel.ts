// The map panel's OFFLINE group: "Save this area" and "Saved areas" with a
// count. The saved areas list grows into its own panel (v8 has no screen for
// it; built from the existing rows, switch and notes): one row per area with
// its name, size, run and age, an expired flag, refresh and delete; the
// "Saved data only" switch; and what the phone promises about keeping them.
import { isExpired, lastHour, totalBytes, type SavedArea } from '../../core/offline/saved-area';
import { formatRunAge } from '../../core/time/run-age';
import { formatCursorTime } from '../../core/units/format';
import { MODELS, modelForMapModel } from '../../adapters/openmeteo-maps/models';
import type { SaveProgress } from './saved-areas';

const mb = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} kB` : `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`);
const icon = (d: string) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const DOWNLOAD = icon('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>');
const FOLDER = icon('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>');
const CLOSE = icon('<path d="M6 6l12 12M18 6 6 18"/>');
const REFRESH = icon('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>');
const CHEVRON = icon('<path d="m9.5 6 6 6-6 6"/>');

export interface OfflinePanelHandlers {
  /** Open the save box (the panel closes). */
  choose(): void;
  /** Open the saved areas list. */
  list(): void;
}

/** Progress text for the Save button. */
export function progressText(p: SaveProgress): string {
  return `Saving ${p.label.toLowerCase()} · ${Math.round((p.done / p.total) * 100)}%`;
}

function row(iconSvg: string, title: string, note: string, tag: 'button' | 'div' = 'button'): HTMLElement {
  const r = document.createElement(tag);
  r.className = 'icon-row';
  r.innerHTML = `<span class="icon-row-icon">${iconSvg}</span><span class="icon-row-text"><span class="icon-row-title"></span><span class="icon-row-note"></span></span>`;
  r.querySelector('.icon-row-title')!.textContent = title;
  r.querySelector('.icon-row-note')!.textContent = note;
  return r;
}

export function offlineGroup(areas: SavedArea[], h: OfflinePanelHandlers, canSave: boolean): HTMLElement {
  const group = document.createElement('div');
  group.className = 'group';
  group.innerHTML = '<span class="group-title">OFFLINE</span>';
  const save = row(DOWNLOAD, 'Save this area', canSave ? 'Choose the area, layers and a time window' : 'Needs a connection');
  (save as HTMLButtonElement).disabled = !canSave;
  save.addEventListener('click', () => h.choose());
  const total = areas.reduce((n, a) => n + totalBytes(a), 0);
  const list = row(FOLDER, `Saved areas · ${areas.length}`, areas.length ? `${mb(total)} on this phone` : 'None yet');
  list.insertAdjacentHTML('beforeend', `<span class="icon-row-action" aria-hidden="true">${CHEVRON}</span>`);
  list.addEventListener('click', () => h.list());
  group.append(save, list);
  return group;
}

export interface SavedListHandlers {
  refresh(area: SavedArea, onProgress: (text: string) => void): Promise<void>;
  remove(area: SavedArea): Promise<void>;
  setSavedOnly(on: boolean): void;
}

/** What one area holds, for its row: size, the run and its age, and how far it reaches (or Expired). */
export function areaNote(a: SavedArea, now: Date): string {
  const model = modelForMapModel(a.weather.model)?.label ?? MODELS.hrdps.label;
  const later = (a.more ?? []).map((w) => modelForMapModel(w.model)?.label ?? w.model);
  const last = lastHour(a);
  const reach = isExpired(a, now) ? 'Expired' : last ? `to ${formatCursorTime(last)}` : '';
  return [mb(totalBytes(a)), `${[model, ...later].join(' + ')} ${formatRunAge(new Date(a.weather.run), now).replace(' · ', ', ')}`, reach].filter(Boolean).join(' · ');
}

export function savedAreasBody(areas: SavedArea[], state: { savedOnly: boolean; online: boolean; kept: boolean | null; usedBytes: number | null }, h: SavedListHandlers): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';
  const list = document.createElement('div');
  list.className = 'group';
  list.innerHTML = '<span class="group-title">SAVED AREAS</span>';
  if (!areas.length) {
    const empty = document.createElement('p');
    empty.className = 'panel-note';
    empty.textContent = 'Nothing saved yet. Use Save this area in the map panel.';
    list.append(empty);
  }
  const now = new Date();
  for (const a of areas) {
    const r = row(FOLDER, a.name ?? 'Saved area', areaNote(a, now), 'div');
    r.dataset.area = a.id;
    r.dataset.expired = String(isExpired(a, now));
    const note = r.querySelector<HTMLElement>('.icon-row-note')!;
    const refresh = document.createElement('button');
    refresh.className = 'icon-row-action';
    refresh.setAttribute('aria-label', `Refresh ${a.name ?? 'the saved area'} with the newest forecast`);
    refresh.innerHTML = REFRESH;
    refresh.disabled = !state.online;
    const remove = document.createElement('button');
    remove.className = 'icon-row-action';
    remove.setAttribute('aria-label', `Remove ${a.name ?? 'the saved area'}`);
    remove.innerHTML = CLOSE;
    refresh.addEventListener('click', async () => {
      r.setAttribute('aria-busy', 'true');
      refresh.disabled = remove.disabled = true;
      try {
        await h.refresh(a, (text) => { note.textContent = text; });
      } catch (err) {
        note.textContent = `Could not refresh: ${String((err as Error).message ?? err)}`;
        r.removeAttribute('aria-busy');
        refresh.disabled = remove.disabled = false;
      }
    });
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      await h.remove(a);
      r.remove();
    });
    r.append(refresh, remove);
    list.append(r);
  }
  wrap.append(list);

  const only = document.createElement('button');
  only.className = 'switch-row';
  only.setAttribute('role', 'switch');
  only.setAttribute('aria-checked', String(state.savedOnly));
  only.innerHTML = '<span class="switch-label">Saved data only</span><span class="switch" aria-hidden="true"><span></span></span>';
  only.addEventListener('click', () => {
    const next = only.getAttribute('aria-checked') !== 'true';
    only.setAttribute('aria-checked', String(next));
    h.setSavedOnly(next);
  });
  const onlyNote = document.createElement('p');
  onlyNote.className = 'panel-note';
  onlyNote.textContent = 'Uses only what is saved, never the network. For weak signal, which makes requests hang and drains the battery.';
  const kept = document.createElement('p');
  kept.className = 'panel-note';
  kept.dataset.kept = String(state.kept);
  kept.textContent = (state.kept === true ? 'The phone has agreed to keep saved areas when space runs low.'
    : state.kept === false ? 'The phone has not promised to keep saved areas: it may clear them when space runs low, or after weeks unused.'
      : 'This browser does not say whether it keeps saved areas.')
    + (state.usedBytes !== null ? ` This app uses ${mb(state.usedBytes)}.` : '');
  const settings = document.createElement('div');
  settings.className = 'group';
  settings.append(only, onlyNote, kept);
  wrap.append(settings);
  return wrap;
}
