// Settings kept between sessions on this device. Browser storage can be
// missing or cleared; every read falls back to the defaults.
export interface LastPin { lng: number; lat: number; label: string }

export interface Prefs {
  hillshade: boolean;
  contours: boolean;
  lastPin: LastPin | null;
}

const KEY = 'tempest.prefs.v1';
const defaults: Prefs = { hillshade: true, contours: true, lastPin: null };

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
