// The map panel (grows from the map layers button). Only switches that work
// are shown: Hillshade, Contours, 3D terrain and, where the base map holds
// building heights, 3D buildings; and under OVERLAYS, Weather stations (over
// every layer; no v8 design, the same tiles). Base map choice, slope angle and
// routes arrive when they work.
import { icons } from './icons';

export interface MapPanelState {
  hillshade: boolean;
  contours: boolean;
  /** Left out when 3D terrain cannot work here. */
  terrain3d?: boolean | undefined;
  /** Left out when the base map has no building heights. */
  buildings3d?: boolean | undefined;
  /** The weather stations overlay. */
  stations: boolean;
  /** No connection (or saved data only): the stations switch cannot work. */
  stationsOffline?: boolean | undefined;
}

function toggle(label: string, on: boolean, onChange: (on: boolean) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'toggle-tile';
  b.setAttribute('aria-pressed', String(on));
  b.innerHTML = `<span></span>${icons.check}`;
  b.querySelector('span')!.textContent = label;
  b.addEventListener('click', () => {
    const next = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(next));
    onChange(next);
  });
  return b;
}

export function mapPanelBody(state: MapPanelState, onChange: (s: MapPanelState) => void, extra?: HTMLElement): HTMLElement {
  const body = document.createElement('div');
  body.className = 'group';
  body.innerHTML = '<span class="group-title">TERRAIN</span><div class="toggle-grid"></div>';
  const grid = body.querySelector('.toggle-grid')!;
  grid.append(
    toggle('Hillshade', state.hillshade, (on) => { state.hillshade = on; onChange({ ...state }); }),
    toggle('Contours', state.contours, (on) => { state.contours = on; onChange({ ...state }); }),
  );
  if (state.terrain3d !== undefined) grid.append(toggle('3D terrain', state.terrain3d, (on) => { state.terrain3d = on; onChange({ ...state }); }));
  if (state.buildings3d !== undefined) grid.append(toggle('3D buildings', state.buildings3d, (on) => { state.buildings3d = on; onChange({ ...state }); }));
  // Temporary, for building: the phone test page Claude asks for results
  // from. Plain row from the existing components; remove when no longer needed.
  const tests = document.createElement('div');
  tests.className = 'group';
  tests.innerHTML = '<span class="group-title">FOR TESTING</span><a class="link-row" href="spike.html">Phone tests<span class="link-row-note">Results to send to Claude</span></a>';
  const overlays = document.createElement('div');
  overlays.className = 'group';
  overlays.innerHTML = '<span class="group-title">OVERLAYS</span><div class="toggle-grid"></div>';
  const stations = toggle('Weather stations', state.stations, (on) => { state.stations = on; onChange({ ...state }); });
  stations.id = 'stations-switch';
  overlays.querySelector('.toggle-grid')!.append(stations);
  if (state.stationsOffline) {
    stations.disabled = true;
    const note = document.createElement('span');
    note.className = 'toggle-note';
    note.textContent = 'Needs a connection';
    overlays.querySelector('.toggle-grid')!.append(note);
  }
  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';
  wrap.append(body, overlays);
  if (extra) wrap.append(extra);
  wrap.append(tests);
  return wrap;
}
