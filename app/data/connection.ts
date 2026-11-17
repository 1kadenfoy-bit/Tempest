// One rule for "Saved data only", used by every part of the app: it takes
// effect only once a saved area exists (with nothing saved there is nothing to
// show instead, so the network is used as usual). Before Nov 17 the forecast
// followed this rule while avalanche, stations, alerts and search obeyed the
// switch alone, so with nothing saved those went blank.
import { loadPrefs } from '../shell/prefs';

let savedAreaCount = 0;

/** Called whenever the saved areas are listed again. */
export function setSavedAreaCount(n: number): void { savedAreaCount = n; }

/** True when the app should make no network requests for data. */
export function savedOnlyActive(): boolean {
  return loadPrefs().savedOnly && savedAreaCount > 0;
}
