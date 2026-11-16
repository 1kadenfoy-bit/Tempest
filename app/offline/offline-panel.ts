// The map panel's OFFLINE group (minimal in M3): save the area in view, and
// the saved area with its size, run and age, and a way to remove it. Rows
// from the v8 components; the full flow (drag box, layer choice) is M8.
import { totalBytes, type SavedArea } from '../../core/offline/saved-area';
import { formatRunAge } from '../../core/time/run-age';
import type { SaveProgress } from './saved-areas';

const mb = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} kB` : `${(b / 1e6).toFixed(1)} MB`);
const icon = (d: string) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const DOWNLOAD = icon('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>');
const FOLDER = icon('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>');
const CLOSE = icon('<path d="M6 6l12 12M18 6 6 18"/>');

export interface OfflinePanelHandlers {
  /** Open the save box (the panel closes). */
  choose(): void;
  remove(area: SavedArea): Promise<void>;
}

/** Progress text for the Save button. */
export function progressText(p: SaveProgress): string {
  return `Saving ${p.label.toLowerCase()} · ${Math.round((p.done / p.total) * 100)}%`;
}

export function offlineGroup(areas: SavedArea[], h: OfflinePanelHandlers): HTMLElement {
  const group = document.createElement('div');
  group.className = 'group';
  group.innerHTML = '<span class="group-title">OFFLINE</span>';

  const saveRow = document.createElement('button');
  saveRow.className = 'icon-row';
  saveRow.innerHTML = `<span class="icon-row-icon">${DOWNLOAD}</span><span class="icon-row-text"><span class="icon-row-title">Save this area</span><span class="icon-row-note">Choose the area and a time window</span></span>`;
  group.append(saveRow);

  const list = document.createElement('div');
  list.className = 'group';
  group.append(list);

  const renderAreas = (items: SavedArea[]) => {
    list.innerHTML = '';
    for (const a of items) {
      const row = document.createElement('div');
      row.className = 'icon-row';
      row.dataset.area = a.id;
      row.innerHTML = `<span class="icon-row-icon">${FOLDER}</span><span class="icon-row-text"><span class="icon-row-title">Saved area · ${mb(totalBytes(a))}</span><span class="icon-row-note"></span></span><button class="icon-row-action" aria-label="Remove the saved area">${CLOSE}</button>`;
      row.querySelector('.icon-row-note')!.textContent =
        `${formatRunAge(new Date(a.weather.run), new Date())} · map ${mb(a.bytes.basemap)}, terrain ${mb(a.bytes.terrain)}, weather ${mb(a.bytes.weather)}`;
      row.querySelector('button')!.addEventListener('click', async () => {
        await h.remove(a);
        renderAreas(items.filter((x) => x.id !== a.id));
      });
      list.append(row);
    }
  };
  renderAreas(areas);

  saveRow.addEventListener('click', () => h.choose());
  return group;
}
