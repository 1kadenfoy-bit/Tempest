// The map panel's feature switches (Kaden, Nov 22): the ones that belong to the Weather and Effects
// sections. The panel shows the buttons and remembers the choice; the owning section listens and draws.
//
//   import { features } from '../shell/feature-switches';
//   features.get('freezingLine')            // true or false now
//   features.onChange((id, on) => ...)      // fires on every tap, and once per saved choice at start-up via `features.all()`
//
// Ids and owners:
//   snowLine, freezingLine   Weather on the map (lines on the map)
//   clouds, wind, water, savedDataWall   Effects (3D animations)
//   trees                    Effects, unless Kaden gives it to Maps
// Nothing here draws anything. An id nobody listens to simply does nothing yet.
import { S } from '../state';
import { savePrefs } from './prefs';

export const FEATURE_IDS = ['snowLine', 'freezingLine', 'clouds', 'wind', 'water', 'savedDataWall', 'trees'] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

type Listener = (id: FeatureId, on: boolean) => void;
const listeners = new Set<Listener>();

export const features = {
  get(id: FeatureId): boolean {
    return S.prefs.features?.[id] === true;
  },
  /** Every switch and whether it is on, for start-up. */
  all(): Record<FeatureId, boolean> {
    return Object.fromEntries(FEATURE_IDS.map((id) => [id, features.get(id)])) as Record<FeatureId, boolean>;
  },
  set(id: FeatureId, on: boolean): void {
    S.prefs.features = { ...S.prefs.features, [id]: on };
    savePrefs(S.prefs);
    for (const l of listeners) l(id, on);
  },
  onChange(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
