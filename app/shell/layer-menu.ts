// The layer menu (v8 03-LayerMenu): tiles in two columns under CORE LAYERS, each with
// the layer's icon on the left and its name on the right (Kaden, Nov 21).
// Only built layers are listed; the board's dashed "planned" tiles appear in
// the app once each layer works.
import type { LayerSlots } from '../../layers/contract';
import { icons, type IconName } from './icons';

export function layerMenuBody(layers: LayerSlots[], activeId: string, onPick: (l: LayerSlots) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'group';
  group.innerHTML = '<span class="group-title">CORE LAYERS</span><div class="layer-grid"></div>';
  const grid = group.querySelector('.layer-grid')!;
  for (const l of layers) {
    const b = document.createElement('button');
    b.className = 'layer-tile';
    b.setAttribute('aria-pressed', String(l.id === activeId));
    const icon = document.createElement('span');
    icon.className = 'layer-tile-icon';
    icon.innerHTML = icons[`layer-${l.id}` as IconName] ?? '';
    const name = document.createElement('span');
    name.className = 'layer-tile-name';
    name.textContent = l.title;
    b.append(icon, name);
    b.addEventListener('click', () => onPick(l));
    grid.append(b);
  }
  return group;
}
