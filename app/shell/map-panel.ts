// The map panel (grows from the map layers button), laid out as Kaden asked
// (Nov 20): View (2D | 3D), Ground (Plain | Shaded terrain | Satellite, one at
// a time, and a Sun and shadows toggle) and Overlays (toggle tiles, some with a
// small options row). What each button does to the map is app/map/map-settings.ts
// (Maps section); this file only shows the buttons and calls mapSettings.set.
// Tiles whose map data is not built yet are shown dimmed and marked "Soon"
// (Kaden's choice; they do nothing yet). The choices are remembered in
// prefs.mapSettings. No v8 design: built from the segmented control and tiles.
import { mapSettings, type MapSettings } from '../map/map-settings';
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

/** An overlay tile and its options row; the row shows only while the tile is on. */
function overlay(label: string, isOn: () => boolean, setOn: (on: boolean) => void, options: HTMLElement[] = []): HTMLElement[] {
  const t = tile(label, isOn(), (on) => { setOn(on); if (row) row.hidden = !on; });
  const row = options.length ? Object.assign(document.createElement('div'), { className: 'option-row' }) : null;
  if (row) { row.append(...options); row.hidden = !isOn(); row.setAttribute('aria-label', `${label} options`); }
  return row ? [t, row] : [t];
}

export function mapPanelBody(state: MapPanelState, onChange: (s: MapPanelState) => void, extra?: HTMLElement): HTMLElement {
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
      if (buildings) buildings.hidden = !three;
      onChange({ ...state });
    });
    return b;
  });
  view.append(...viewBtns);
  if (buildings) {
    buildings.hidden = !state.terrain3d;
    buildings.append(chip('3D buildings', Boolean(state.buildings3d), (on) => { state.buildings3d = on; onChange({ ...state }); }));
  }

  // Ground: three big tiles, one selected at a time. Satellite waits for an imagery source.
  const ground = document.createElement('div');
  ground.className = 'ground-grid';
  const choices = [
    { id: 'plain', label: 'Plain', soon: false },
    { id: 'shaded', label: 'Shaded terrain', soon: false },
    { id: 'satellite', label: 'Satellite', soon: true },
  ];
  // Sun and shadows lights the shaded terrain from the real sun (it follows the time scrubber), so it has nothing to light on Plain.
  const sun = tile('Sun and shadows', m.sun, (on) => setMap({ sun: on }));
  sun.id = 'sun-switch';
  sun.disabled = m.ground === 'plain';
  const groundBtns = choices.map((c) => {
    const b = document.createElement('button');
    b.className = 'ground-tile';
    b.dataset.ground = c.id;
    b.setAttribute('aria-pressed', String(!c.soon && c.id === m.ground));
    b.innerHTML = '<span></span>';
    b.querySelector('span')!.textContent = c.label;
    if (c.soon) { b.disabled = true; b.insertAdjacentHTML('beforeend', '<em class="tile-soon">Soon</em>'); return b; }
    b.addEventListener('click', () => {
      setMap({ ground: c.id as MapSettings['ground'] });
      groundBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sun.disabled = c.id === 'plain';
    });
    return b;
  });
  ground.append(...groundBtns);

  // Overlays: toggle tiles. Contour lines and weather stations work as they did; the Maps section's overlays call mapSettings.
  const trailsOn = () => { const s = mapSettings.get(); return s.trails || s.huts || s.camps; };
  const boundariesOn = () => { const s = mapSettings.get(); return s.parkBoundaries || s.regionBoundaries || s.municipalBoundaries; };
  const stations = tile('Weather stations', state.stations, (on) => { state.stations = on; onChange({ ...state }); });
  stations.id = 'stations-switch';
  if (state.stationsOffline) stations.disabled = true;
  const boundaryChips = [
    chip('Parks', m.parkBoundaries, (on) => setMap({ parkBoundaries: on })),
    chip('Provincial and regional', m.regionBoundaries, (on) => setMap({ regionBoundaries: on })),
    chip('Municipal', m.municipalBoundaries, (on) => setMap({ municipalBoundaries: on })),
  ];
  const grid = document.createElement('div');
  grid.className = 'toggle-grid';
  grid.append(
    ...overlay('Trails, huts and campsites', trailsOn, (on) => setMap({ trails: on, huts: on, camps: on }), [
      chip('Trail names', m.trailNames, (on) => setMap({ trailNames: on })),
    ]),
    ...overlay('Peaks', () => mapSettings.get().peaks, (on) => setMap({ peaks: on }), [
      chip('Heights', m.peakHeights, (on) => setMap({ peakHeights: on })),
    ]),
    ...overlay('Contour lines', () => mapSettings.get().contours, (on) => setMap({ contours: on })),
    ...overlay('Small roads', () => mapSettings.get().smallRoads, (on) => setMap({ smallRoads: on })),
    ...overlay('Ski resorts', () => mapSettings.get().skiLifts, (on) => setMap({ skiLifts: on })),
    ...overlay('Boundaries', boundariesOn, (on) => {
      // Turning Boundaries on shows all three kinds; the options row narrows it.
      setMap({ parkBoundaries: on, regionBoundaries: on, municipalBoundaries: on });
      boundaryChips.forEach((c) => c.setAttribute('aria-pressed', String(on)));
    }, boundaryChips),
    stations,
    ...SOON_OVERLAYS.map((l) => tile(l, false, () => undefined, true)),
  );
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
  wrap.append(section('VIEW', view, ...(buildings ? [buildings] : [])), section('GROUND', ground, sun), overlays);
  if (extra) wrap.append(extra);
  wrap.append(tests);
  return wrap;
}
