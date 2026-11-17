// App settings (grows from the gear in the map panel's header). v8 has no
// screen for it, so it is built from the existing panel parts: segmented
// controls for units and theme, the "Saved data only" switch (the same pref
// as in the saved areas list), and the credits, generated from the sources'
// metadata (app/sources/credits.ts).
import type { UnitSystem } from '../../core/units/format';
import { savedOnlySwitch } from '../offline/offline-panel';
import type { ThemeChoice } from '../theme/theme';
import type { Credit } from '../sources/credits';

export interface SettingsState { units: UnitSystem; theme: ThemeChoice; savedOnly: boolean }

export interface SettingsHandlers {
  setUnits(u: UnitSystem): void;
  setTheme(t: ThemeChoice): void;
  setSavedOnly(on: boolean): void;
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

  const offline = group('OFFLINE');
  offline.append(...savedOnlySwitch(state.savedOnly, h.setSavedOnly));

  const credits = group('CREDITS');
  const groups = [...new Set(list.map((c) => c.group))];
  for (const g of groups) {
    const sub = document.createElement('span');
    sub.className = 'panel-note';
    sub.textContent = g;
    credits.append(sub, ...list.filter((c) => c.group === g).map(creditRow));
  }

  wrap.append(units, theme, offline, credits);
  return wrap;
}
