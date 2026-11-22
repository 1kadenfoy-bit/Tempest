// The map panel (grows from the map layers button), laid out as Kaden asked
// (Nov 20): View (2D | 3D), Ground (Plain | Shaded terrain | Satellite, one at
// a time, and a Sun and shadows toggle) and Overlays (toggle tiles, some with a
// small options row). What each button does to the map is app/map/map-settings.ts
// (Maps section); this file only shows the buttons and calls mapSettings.set.
// Tiles whose map data is not built yet are shown dimmed and marked "Soon"
// (Kaden's choice; they do nothing yet). The choices are remembered in
// prefs.mapSettings. No v8 design: built from the segmented control and tiles.
import { mapSettings, type MapSettings } from '../map/map-settings';
import { satelliteReady } from '../map/satellite';
import { S } from '../state';
import { icons } from './icons';
import { savePrefs } from './prefs';

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
const SOON_OVERLAYS = ['Rain/snow line', 'Freezing line'];

/** Change map settings, redraw the map, and remember the choice. */
function setMap(change: Partial<MapSettings>): void {
  mapSettings.set(change);
  S.prefs.mapSettings = { ...mapSettings.get() };
  savePrefs(S.prefs);
}

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

/** A small option: a chip that is on or off, shown under its tile while the tile is on. */
function chip(label: string, on: boolean, onChange: (on: boolean) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'option-chip';
  b.setAttribute('aria-pressed', String(on));
  b.textContent = label;
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

export function mapPanelBody(state: MapPanelState, onChange: (s: MapPanelState) => void, _offlineGroup?: HTMLElement): HTMLElement {
  void _offlineGroup;
  const m = mapSettings.get();

  // View: one two-way switch (the 3D terrain switch). 3D buildings stay a small option under it.
  const view = document.createElement('div');
  view.className = 'segmented';
  view.setAttribute('role', 'group');
  view.setAttribute('aria-label', 'View');
  const buildings = state.buildings3d === undefined ? null : Object.assign(document.createElement('div'), { className: 'option-row' });
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
      viewBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      buildingsChip?.setAttribute('aria-disabled', String(!three));
      if (buildingsChip) buildingsChip.disabled = !three;
      onChange({ ...state });
    });
    return b;
  });
  view.append(...viewBtns);
  // Nothing appears or disappears: the option is always there, greyed out in 2D.
  const buildingsChip = buildings ? chip('3D buildings', Boolean(state.buildings3d), (on) => { state.buildings3d = on; onChange({ ...state }); }) : null;
  if (buildings && buildingsChip) { buildingsChip.disabled = !state.terrain3d; buildings.append(buildingsChip); }

  // Ground: big tiles, one selected at a time: Terrain, and Satellite once the map has the picture loaded
  // (Kaden, Nov 22: Plain is gone, and only what works is shown). 'shaded' is the map settings' name for Terrain.
  const ground = document.createElement('div');
  ground.className = 'ground-grid';
  const choices: { id: MapSettings['ground']; label: string }[] = [{ id: 'shaded', label: 'Terrain' }];
  if (satelliteReady()) choices.push({ id: 'satellite', label: 'Satellite' });
  ground.style.gridTemplateColumns = `repeat(${choices.length}, minmax(0, 1fr))`;
  const current = m.ground === 'satellite' && satelliteReady() ? 'satellite' : 'shaded';
  // Sun and shadows lights the terrain from the real sun (it follows the time scrubber), on Terrain and on Satellite.
  const sun = tile('Sun and shadows', m.sun, (on) => setMap({ sun: on }));
  sun.id = 'sun-switch';
  const groundBtns = choices.map((c) => {
    const b = document.createElement('button');
    b.className = 'ground-tile';
    b.dataset.ground = c.id;
    b.setAttribute('aria-pressed', String(c.id === current));
    b.innerHTML = '<span></span>';
    b.querySelector('span')!.textContent = c.label;
    b.addEventListener('click', () => {
      setMap({ ground: c.id });
      groundBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    return b;
  });
  ground.append(...groundBtns);

  // Overlays: toggle tiles. Contour lines and weather stations work as they did; the Maps section's overlays call mapSettings.
  const trailsOn = () => { const s = mapSettings.get(); return s.trails || s.huts || s.camps; };
  const stations = tile('Weather stations', state.stations, (on) => { state.stations = on; onChange({ ...state }); });
  stations.id = 'stations-switch';
  if (state.stationsOffline) stations.disabled = true;
  const one = (label: string, key: keyof MapSettings) => tile(label, Boolean(mapSettings.get()[key]), (on) => setMap({ [key]: on }));
  const grid = document.createElement('div');
  grid.className = 'toggle-grid';
  // Trail names and peak heights are always on, so they are not choices here. Each boundary kind is its own tile.
  grid.append(
    tile('Trails, huts and campsites', trailsOn(), (on) => setMap({ trails: on, huts: on, camps: on })),
    one('Peaks', 'peaks'),
    one('Contour lines', 'contours'),
    one('Small roads', 'smallRoads'),
    one('Ski resorts', 'skiLifts'),
    one('Park boundaries', 'parkBoundaries'),
    one('Regional boundaries', 'regionBoundaries'),
    one('Municipal boundaries', 'municipalBoundaries'),
    stations,
    ...SOON_OVERLAYS.map((l) => tile(l, false, () => undefined, true)),
  );
  const overlays = section('OVERLAYS', grid);
  if (state.stationsOffline) {
    const note = document.createElement('span');
    note.className = 'toggle-note';
    note.textContent = 'Needs a connection';
    overlays.append(note);
  }

  // Temporary, for building: the phone test page Claude asks for results
  // from. Plain row from the existing components; remove when no longer needed.
  const tests = document.createElement('div');
  tests.className = 'group';
  tests.innerHTML = '<span class="group-title">FOR TESTING</span><a class="link-row" href="spike.html">Phone tests<span class="link-row-note">Results to send to Claude</span></a>';

  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';
  wrap.append(section('VIEW', view, ...(buildings ? [buildings] : [])), section('GROUND', ground, sun), overlays);
  wrap.append(tests);
  return wrap;
}
