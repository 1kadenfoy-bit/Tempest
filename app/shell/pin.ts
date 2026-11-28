// The pin: always present. It starts on the user's location ("You"), moves
// where the map is tapped, and snaps back with locate-me. The readout beside it
// is one line; the layer's value fills its first part from M2.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { formatElevation } from '../../core/units/format';
import type { Readout } from '../../layers/contract';
import { elevationAt } from '../map/elevation';
import { retryDelay } from '../../core/time/retry';
import { maplibregl } from '../map/maplibre';
import { terrainAt } from './pin-terrain';

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
  let readoutSet = false;
  /** What the ground is here ("Alpine", "Glacier"), for when there is no place name. */
  let terrain: string | null = null;
  let seq = 0;

  const render = (notify = true) => {
    if (!state) return;
    // "Location name · layer value · elevation", nothing more (Kaden, Nov 21). While
    // the data is still coming in, just a small spinning wheel: no "…" placeholders.
    // The place's name if there is one; otherwise what the ground is; otherwise the plain label (a dropped pin's "Pin").
    const name = state.name ?? terrain ?? (state.kind === 'you' ? null : pinLabel(state).short);
    const r = readoutValue;
    const loading = !readoutSet || r.value === '…' || state.elevation === null;
    readout.dataset.loading = String(loading);
    text.innerHTML = '';
    if (loading) {
      const wheel = document.createElement('span');
      wheel.className = 'pin-spinner';
      wheel.setAttribute('role', 'progressbar');
      wheel.setAttribute('aria-label', 'Loading');
      text.append(wheel);
    } else {
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
      const elev = document.createElement('span');
      elev.className = 'muted';
      elev.textContent = formatElevation(state.elevation!);
      text.append(elev);
    }
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
    terrain = null;
    const mine = ++seq;
    // The pin is named from a labelled place right next to it, once the map has drawn it; if there is none, by what the ground is.
    const nameIt = () => {
      if (!state || seq !== mine) return;
      if (!state.name && state.kind === 'you') {
        const found = nameNear(map, map.project([state.lng, state.lat]), 50);
        if (found) { state.name = found; render(false); return; }
      }
      if (!state.name && !terrain) {
        const t = terrainAt(map, state.lng, state.lat);
        if (t) { terrain = t; render(false); }
      }
    };
    render();
    nameIt();
    if (!next.name) map.once('idle', nameIt);
    // The height under the pin. Without signal, or when its terrain piece did
    // not come, it is asked again when the signal is back, or soon (then less
    // often): before Nov 28 a drop mid-load left the pin's wheel spinning for good.
    const height = (tries: number) => elevationAt(next.lng, next.lat)
      .then((m) => { if (mine === seq && state) { state.elevation = m; render(); } })
      .catch(() => {
        if (mine !== seq) return;
        const wait = retryDelay(tries);
        if (!navigator.onLine) addEventListener('online', () => { if (mine === seq) void height(0); }, { once: true });
        else if (wait !== null) setTimeout(() => { if (mine === seq) void height(tries + 1); }, wait);
      });
    void height(0);
  };

  /** The layer's readout for the pin at the cursor: the value in bold, its notes muted. */
  const setReadout = (r: Readout) => { readoutValue = r; readoutSet = true; render(false); };
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
