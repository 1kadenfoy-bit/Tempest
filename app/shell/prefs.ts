// Settings kept between sessions on this device. Browser storage can be
// missing or cleared; every read falls back to the defaults.
export interface LastPin { lng: number; lat: number; label: string }

export interface Prefs {
  hillshade: boolean;
  contours: boolean;
  /** 3D terrain and 3D buildings (map panel), off by default. */
  terrain3d: boolean;
  buildings3d: boolean;
  /** The weather stations overlay (map panel), off by default. */
  stations: boolean;
  lastPin: LastPin | null;
  windowHours: number;
  /** The condition layer shown. */
  layer: string;
  /** Each layer's model: 'chain' or one model's id, by layer id. */
  layerModels: Record<string, string>;
  /** Each layer's settings, by layer id. */
  layerSettings: Record<string, Record<string, string | boolean>>;
  /** Read only saved areas, never the network (weak signal hangs requests and drains the battery). */
  savedOnly: boolean;
  /** App settings: the unit system for every number shown. */
  units: 'metric' | 'imperial';
  /** App settings: dark, light, or match the phone. */
  theme: 'dark' | 'light' | 'system';
}

const KEY = 'tempest.prefs.v1';
const defaults: Prefs = { hillshade: true, contours: true, terrain3d: false, buildings3d: false, stations: false, lastPin: null, windowHours: 48, layer: 'precipitation', layerSettings: {}, layerModels: {}, savedOnly: false, units: 'metric', theme: 'dark' };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
