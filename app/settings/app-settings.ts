// App settings, wired: reads and remembers the choices (units, theme, saved
// data only), applies units and theme at start, follows the phone when the
// theme is "Match phone", and opens the panel from the map panel's gear.
// The shell passes what to redraw; this file never reaches into the map.
import { setUnitSystem, type UnitSystem } from '../../core/units/format';
import { icons } from '../shell/icons';
import { closePanel, openPanel } from '../shell/panel';
import { S } from '../state';
import { afterSavedChange, openSaveBox } from '../offline/wiring';
import { deleteArea } from '../offline/saved-areas';
import type { Prefs } from '../shell/prefs';
import { credits } from '../sources/credits';
import { applyTheme, prefersLight, resolveTheme, watchPhoneTheme, type ThemeChoice } from '../theme/theme';
import type { Theme } from '../theme/tokens';
import { settingsBody } from './settings-panel';

export interface AppSettingsHooks {
  savePrefs(): void;
  /** Redraw every number on screen in the new units. */
  onUnits(): void;
  /** Recolour what is not CSS (the map, canvases) for the new theme. */
  onTheme(theme: Theme): void;
  /** The same effect as the switch in the saved areas list. */
  onSavedOnly(on: boolean): void;
  /** The base map's attribution, from its manifest. */
  basemapAttribution(): string;
}

export interface AppSettings {
  /** The theme on screen now. */
  theme(): Theme;
  /** The gear for the map panel's header; the settings grow from `origin` (the map layers button). */
  gear(origin: HTMLElement): HTMLButtonElement;
  open(origin: HTMLElement): void;
}

/** Apply the remembered units and theme before anything draws. */
export function startAppSettings(prefs: Prefs, hooks: AppSettingsHooks): AppSettings {
  setUnitSystem(prefs.units);
  let shown: Theme = resolveTheme(prefs.theme, prefersLight());
  applyTheme(document, shown);

  const showTheme = () => {
    const next = resolveTheme(prefs.theme, prefersLight());
    if (next === shown) return;
    shown = next;
    applyTheme(document, shown);
    hooks.onTheme(shown);
  };
  watchPhoneTheme(() => { if (prefs.theme === 'system') showTheme(); });

  const open = (origin: HTMLElement) => {
    openPanel({
      origin,
      icon: icons.gear,
      title: 'App settings',
      caption: 'Remembered on this phone',
      body: settingsBody({ units: prefs.units, theme: prefs.theme, savedOnly: prefs.savedOnly }, credits(hooks.basemapAttribution()), {
        setUnits: (u: UnitSystem) => {
          prefs.units = u;
          hooks.savePrefs();
          setUnitSystem(u);
          document.documentElement.dataset.units = u;
          hooks.onUnits();
        },
        setTheme: (t: ThemeChoice) => {
          prefs.theme = t;
          hooks.savePrefs();
          showTheme();
        },
        setSavedOnly: (on) => hooks.onSavedOnly(on),
        saved: {
          areas: S.savedAreas,
          canSave: navigator.onLine && !!S.run && !S.usingSaved,
          // The settings give way to the save box, which draws on the map.
          save: () => { closePanel(); openSaveBox(); },
          remove: async (a) => { await deleteArea(a); await afterSavedChange(); },
        },
      }),
    });
  };
  document.documentElement.dataset.units = prefs.units;

  return {
    theme: () => shown,
    gear: (origin) => {
      const b = document.createElement('button');
      b.id = 'app-settings';
      b.setAttribute('aria-label', 'App settings');
      b.setAttribute('aria-haspopup', 'dialog');
      b.innerHTML = icons.gear;
      // The map panel gives way; settings grow from the same thumb button, as the saved areas list does.
      b.addEventListener('click', () => open(origin));
      return b;
    },
    open,
  };
}
