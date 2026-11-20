// The pin: always present. It starts on the user's location ("You"), moves
// where the map is tapped, and snaps back with locate-me. The readout beside it
// is one line; the layer's value fills its first part from M2.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { formatElevation } from '../../core/units/format';
import type { Readout } from '../../layers/contract';
import { elevationAt } from '../map/elevation';
import { maplibregl } from '../map/maplibre';

export type PinKind = 'you' | 'dropped' | 'last';

export interface PinState {
  lng: number;
  lat: number;
  kind: PinKind;
  /** Place name for a dropped pin, when a named feature is close. */
  name: string | null;
  elevation: number | null;
}

export function pinLabel(p: PinState): { short: string; long: string } {
  if (p.kind === 'you') return { short: 'You', long: 'Your location' };
  if (p.kind === 'last') return { short: 'Last pin', long: p.name ?? 'Last pin used' };
  return { short: p.name ?? 'Pin', long: p.name ?? 'Dropped pin' };
}

export function createPin(map: MapLibreMap, onChange: (p: PinState) => void) {
  const el = document.createElement('div');
  el.className = 'pin';
  el.innerHTML = '<span class="pin-readout" role="status"><span class="readout-text"></span></span><span class="pin-dot"></span>';
  const text = el.querySelector<HTMLElement>('.readout-text')!;
  const marker = new maplibregl.Marker({ element: el, anchor: 'center' });
  let state: PinState | null = null;
  let readoutValue: Readout = { value: '' };
  let seq = 0;

  const render = (notify = true) => {
    if (!state) return;
    // "Location name · layer value · elevation" (Kaden, Nov 20).
    const name = state.kind === 'you' ? state.name : pinLabel(state).short;
    const elev = state.elevation === null ? '…' : formatElevation(state.elevation);
    text.innerHTML = '';
    const r = readoutValue;
    if (name) {
      const place = document.createElement('span');
      place.className = 'pin-name';
      place.textContent = name;
      text.append(place, ' · ');
    }
    if (r.value) {
      const strong = document.createElement('strong');
      strong.textContent = r.value;
      text.append(strong, ' · ');
    }
    const muted = document.createElement('span');
    muted.className = 'muted';
    // "feels −6 · 1,180 m · 0 °C at 1,150 m"
    muted.textContent = [r.note, elev, r.extra].filter(Boolean).join(' · ');
    text.append(muted);
    keepInside();
    if (notify) onChange(state);
  };

  // Centre the readout over the pin (Kaden, Nov 16), shifted only as far as
  // needed to stay on screen near an edge.
  const readout = el.querySelector<HTMLElement>('.pin-readout')!;
  const keepInside = () => {
    const w = readout.offsetWidth;
    if (!w) return;
    const pinX = el.getBoundingClientRect().left + el.offsetWidth / 2;
    const edge = 8;
    let left = -w / 2;
    if (pinX + left + w > innerWidth - edge) left = innerWidth - edge - w - pinX;
    if (pinX + left < edge) left = edge - pinX;
    readout.style.left = `${el.offsetWidth / 2 + left}px`;
  };
  let keepFrame = 0;
  const scheduleKeep = () => { cancelAnimationFrame(keepFrame); keepFrame = requestAnimationFrame(keepInside); };
  map.on('move', scheduleKeep);
  map.on('moveend', scheduleKeep);

  const set = (next: Omit<PinState, 'elevation'>) => {
    state = { ...next, elevation: null };
    marker.setLngLat([next.lng, next.lat]).addTo(map);
    // Your own location is named from the closest labelled place on the map, once the map has drawn it.
    const nameYou = () => {
      if (!state || state.kind !== 'you' || state.name) return;
      const found = nameNear(map, map.project([state.lng, state.lat]), 160);
      if (found) { state.name = found; render(false); }
    };
    render();
    if (next.kind === 'you' && !next.name) { nameYou(); map.once('idle', nameYou); }
    const mine = ++seq;
    elevationAt(next.lng, next.lat)
      .then((m) => { if (mine === seq && state) { state.elevation = m; render(); } })
      .catch(() => { /* offline or no terrain: elevation stays unknown */ });
  };

  /** The layer's readout for the pin at the cursor: the value in bold, its notes muted. */
  const setReadout = (r: Readout) => { readoutValue = r; render(false); };
  return { set, setReadout, get: () => state };
}

/** Name of the closest labelled feature to a screen point, peaks first. */
export function nameNear(map: MapLibreMap, point: { x: number; y: number }, radius = 28): string | null {
  const feats = map.queryRenderedFeatures([[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]])
    .filter((f) => typeof f.properties?.name === 'string' && f.layer.type === 'symbol');
  if (!feats.length) return null;
  const rank = (k: unknown) => (k === 'peak' ? 0 : k === 'locality' || k === 'neighbourhood' ? 2 : 1);
  feats.sort((a, b) => rank(a.properties.kind) - rank(b.properties.kind));
  return String(feats[0]!.properties.name);
}
