// App settings (grows from the gear in the map panel's header). v8 has no
// screen for it, so it is built from the existing panel parts: segmented
// controls for units and theme, and the credits, generated from the sources'
// metadata (app/sources/credits.ts).
import { icons } from '../shell/icons';
import type { UnitSystem } from '../../core/units/format';
import type { ThemeChoice } from '../theme/theme';
import type { Credit } from '../sources/credits';
import { areaNote } from '../offline/offline-panel';
import type { SavedArea } from '../../core/offline/saved-area';
import { swipeRow } from './swipe-row';

export interface SettingsState { units: UnitSystem; theme: ThemeChoice }

export interface SettingsHandlers {
  setUnits(u: UnitSystem): void;
  setTheme(t: ThemeChoice): void;
  /** The saved data: the button, and the list below it. */
  saved: {
    areas: SavedArea[];
    /** False when there is no connection or no forecast to save from. */
    canSave: boolean;
    save(): void;
    remove(area: SavedArea): Promise<void>;
  };
}

function group(title: string): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';
  const t = document.createElement('span');
  t.className = 'group-title';
  t.textContent = title;
  g.append(t);
  return g;
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'panel-note';
  p.textContent = text;
  return p;
}

function segmented<T extends string>(name: string, options: { value: T; label: string }[], current: T, onPick: (v: T) => void): HTMLElement {
  const seg = document.createElement('div');
  seg.className = 'segmented';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', name);
  for (const o of options) {
    const b = document.createElement('button');
    b.textContent = o.label;
    b.dataset.value = o.value;
    b.setAttribute('aria-pressed', String(o.value === current));
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(o.value);
    });
    seg.append(b);
  }
  return seg;
}

const UNIT_NOTE: Record<UnitSystem, string> = {
  metric: '°C, mm and cm, km/h, metres and kilometres.',
  imperial: '°F, inches, mph, feet and miles. Map colours and thresholds stay the same.',
};

/** One credit: the source's name (a link), what the app uses it for, its licence and attribution. */
function creditRow(c: Credit): HTMLElement {
  const a = document.createElement('a');
  a.className = 'link-row';
  a.href = c.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.dataset.credit = c.id;
  const name = document.createElement('span');
  name.textContent = c.name;
  const what = document.createElement('span');
  what.className = 'link-row-note';
  what.textContent = c.provides;
  const lic = document.createElement('span');
  lic.className = 'link-row-note';
  lic.textContent = `${c.licence} · ${c.attribution}`;
  a.append(name, what, lic);
  if (c.terms) {
    const terms = document.createElement('span');
    terms.className = 'link-row-note';
    terms.textContent = c.terms;
    a.append(terms);
  }
  return a;
}

export function settingsBody(state: SettingsState, list: Credit[], h: SettingsHandlers): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';

  const units = group('UNITS');
  const unitNote = note(UNIT_NOTE[state.units]);
  units.append(segmented<UnitSystem>('Units', [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }], state.units, (u) => {
    unitNote.textContent = UNIT_NOTE[u];
    h.setUnits(u);
  }), unitNote);

  const theme = group('THEME');
  theme.append(segmented<ThemeChoice>('Theme', [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Match phone' }], state.theme, h.setTheme));

  // Saved data: one button to save, and what is saved below it; swipe a row left to delete.
  const saved = group('SAVED DATA');
  const save = document.createElement('button');
  save.className = 'wide-button';
  save.id = 'save-data';
  save.textContent = 'Save data';
  save.disabled = !h.saved.canSave;
  save.addEventListener('click', () => h.saved.save());
  saved.append(save);
  if (!h.saved.canSave) saved.append(note('Needs a connection.'));
  const listEl = document.createElement('div');
  listEl.className = 'saved-list';
  const empty = note('Nothing saved yet.');
  const sync = () => { empty.hidden = listEl.children.length > 0; };
  const now = new Date();
  for (const a of h.saved.areas) {
    const r = document.createElement('div');
    r.className = 'icon-row';
    r.dataset.area = a.id;
    r.innerHTML = '<span class="icon-row-text"><span class="icon-row-title"></span><span class="icon-row-note"></span></span>';
    r.querySelector('.icon-row-title')!.textContent = a.name ?? 'Saved area';
    r.querySelector('.icon-row-note')!.textContent = areaNote(a, now);
    listEl.append(swipeRow({ content: r, label: `Delete ${a.name ?? 'saved area'}`, onDelete: async () => { await h.saved.remove(a); queueMicrotask(sync); } }));
  }
  saved.append(listEl, empty);
  sync();
  if (listEl.children.length) saved.append(note('Swipe left on an item to delete it.'));

  // Credits sit at the bottom, folded away until asked for.
  const credits = group('CREDITS');
  const fold = document.createElement('button');
  fold.className = 'fold-row';
  fold.setAttribute('aria-expanded', 'false');
  fold.innerHTML = '<span>Credits and licences</span><span class="fold-chevron" aria-hidden="true"></span>';
  fold.querySelector('.fold-chevron')!.innerHTML = icons.chevron;
  const body = document.createElement('div');
  body.className = 'fold-body';
  body.hidden = true;
  const groups = [...new Set(list.map((c) => c.group))];
  for (const g of groups) {
    const sub = document.createElement('span');
    sub.className = 'panel-note';
    sub.textContent = g;
    body.append(sub, ...list.filter((c) => c.group === g).map(creditRow));
  }
  fold.addEventListener('click', () => {
    const open = fold.getAttribute('aria-expanded') !== 'true';
    fold.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    if (open) body.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  credits.append(fold, body);

  wrap.append(units, theme, saved, credits);
  return wrap;
}
