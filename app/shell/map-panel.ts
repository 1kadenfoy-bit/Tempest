// The map panel (grows from the map layers button). Only switches that work
// are shown: Hillshade and Contours. Base map choice, slope angle, 3D,
// routes and offline arrive when they work.
import { icons } from './icons';

export interface MapPanelState { hillshade: boolean; contours: boolean }

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

export function mapPanelBody(state: MapPanelState, onChange: (s: MapPanelState) => void): HTMLElement {
  const body = document.createElement('div');
  body.className = 'group';
  body.innerHTML = '<span class="group-title">TERRAIN</span><div class="toggle-grid"></div>';
  const grid = body.querySelector('.toggle-grid')!;
  grid.append(
    toggle('Hillshade', state.hillshade, (on) => { state.hillshade = on; onChange({ ...state }); }),
    toggle('Contours', state.contours, (on) => { state.contours = on; onChange({ ...state }); }),
  );
  // Temporary, for building: the phone test page Claude asks for results
  // from. Plain row from the existing components; remove when no longer needed.
  const tests = document.createElement('div');
  tests.className = 'group';
  tests.innerHTML = '<span class="group-title">FOR TESTING</span><a class="link-row" href="spike.html">Phone tests<span class="link-row-note">Results to send to Claude</span></a>';
  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';
  wrap.append(body, tests);
  return wrap;
}
