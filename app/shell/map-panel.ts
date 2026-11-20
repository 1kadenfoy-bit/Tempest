// The map panel (grows from the map layers button), laid out as Kaden asked
// (Nov 20): View (2D | 3D), Ground (Plain | Shaded terrain | Satellite, one at
// a time) and Overlays (toggle tiles). Tiles whose map data is not built yet
// are shown dimmed and marked "Soon" (Kaden's choice; they do nothing yet).
// No v8 design: built from the segmented control and toggle tiles.
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

/** Overlay tiles whose data is not on the map yet: shown, dimmed, marked "Soon". */
const SOON_OVERLAYS = ['Trails, huts and campsites', 'Peaks', 'Small roads', 'Ski resorts', 'Boundaries', 'Rain/snow line', 'Freezing line'];

function tile(label: string, on: boolean, onChange: (on: boolean) => void, soon = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'toggle-tile';
  b.setAttribute('aria-pressed', String(on && !soon));
  b.innerHTML = soon ? '<span></span>' : `<span></span>${icons.check}`;
  b.querySelector('span')!.textContent = label;
  if (soon) {
    b.disabled = true;
    b.dataset.soon = 'true';
    b.querySelector('span')!.insertAdjacentHTML('afterend', '<em class="tile-soon">Soon</em>');
    return b;
  }
  b.addEventListener('click', () => {
    const next = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(next));
    onChange(next);
  });
  return b;
}

function section(title: string, ...kids: HTMLElement[]): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';
  const t = document.createElement('span');
  t.className = 'group-title';
  t.textContent = title;
  g.append(t, ...kids);
  return g;
}

export function mapPanelBody(state: MapPanelState, onChange: (s: MapPanelState) => void, extra?: HTMLElement): HTMLElement {
  // View: one two-way switch. 3D is the tilted terrain, with buildings where the base map has them.
  const view = document.createElement('div');
  view.className = 'segmented';
  view.setAttribute('role', 'group');
  view.setAttribute('aria-label', 'View');
  const viewBtns = (['2D', '3D'] as const).map((v) => {
    const b = document.createElement('button');
    b.textContent = v;
    b.dataset.value = v;
    b.setAttribute('aria-pressed', String((v === '3D') === Boolean(state.terrain3d)));
    if (v === '3D') b.setAttribute('aria-label', '3D terrain');
    if (v === '3D' && state.terrain3d === undefined) b.disabled = true;
    b.addEventListener('click', () => {
      const three = v === '3D';
      if (three === Boolean(state.terrain3d)) return;
      state.terrain3d = three;
      if (state.buildings3d !== undefined) state.buildings3d = three;
      viewBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange({ ...state });
    });
    return b;
  });
  view.append(...viewBtns);

  // Ground: three big tiles, one selected at a time. Plain has no shading; Shaded terrain is the hillshade.
  const ground = document.createElement('div');
  ground.className = 'ground-grid';
  const choices = [
    { id: 'plain', label: 'Plain', soon: false },
    { id: 'shaded', label: 'Shaded terrain', soon: false },
    { id: 'satellite', label: 'Satellite', soon: true },
  ];
  const groundBtns = choices.map((c) => {
    const b = document.createElement('button');
    b.className = 'ground-tile';
    b.dataset.ground = c.id;
    b.setAttribute('aria-pressed', String(!c.soon && (c.id === 'shaded') === state.hillshade));
    b.innerHTML = '<span></span>';
    b.querySelector('span')!.textContent = c.label;
    if (c.soon) { b.disabled = true; b.insertAdjacentHTML('beforeend', '<em class="tile-soon">Soon</em>'); return b; }
    b.addEventListener('click', () => {
      state.hillshade = c.id === 'shaded';
      groundBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange({ ...state });
    });
    return b;
  });
  ground.append(...groundBtns);

  // Overlays: toggle tiles. Contour lines and weather stations work today; the rest wait for their data.
  const grid = document.createElement('div');
  grid.className = 'toggle-grid';
  grid.append(
    tile('Contour lines', state.contours, (on) => { state.contours = on; onChange({ ...state }); }),
  );
  const stations = tile('Weather stations', state.stations, (on) => { state.stations = on; onChange({ ...state }); });
  stations.id = 'stations-switch';
  if (state.stationsOffline) stations.disabled = true;
  grid.append(stations, ...SOON_OVERLAYS.map((l) => tile(l, false, () => undefined, true)));
  const overlays = section('OVERLAYS', grid);
  if (state.stationsOffline) {
    const note = document.createElement('span');
    note.className = 'toggle-note';
    note.textContent = 'Weather stations need a connection';
    overlays.append(note);
  }

  // Temporary, for building: the phone test page Claude asks for results
  // from. Plain row from the existing components; remove when no longer needed.
  const tests = document.createElement('div');
  tests.className = 'group';
  tests.innerHTML = '<span class="group-title">FOR TESTING</span><a class="link-row" href="spike.html">Phone tests<span class="link-row-note">Results to send to Claude</span></a>';

  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';
  wrap.append(section('VIEW', view), section('GROUND', ground), overlays);
  if (extra) wrap.append(extra);
  wrap.append(tests);
  return wrap;
}
