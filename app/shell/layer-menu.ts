// The layer menu (v8 03-LayerMenu): tiles in two columns under CORE LAYERS.
// Only built layers are listed; the board's dashed "planned" tiles appear in
// the app once each layer works.
import type { LayerSlots } from '../../layers/contract';

export function layerMenuBody(layers: LayerSlots[], activeId: string, onPick: (l: LayerSlots) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'group';
  group.innerHTML = '<span class="group-title">CORE LAYERS</span><div class="layer-grid"></div>';
  const grid = group.querySelector('.layer-grid')!;
  for (const l of layers) {
    const b = document.createElement('button');
    b.className = 'layer-tile';
    b.setAttribute('aria-pressed', String(l.id === activeId));
    const bars = document.createElement('span');
    bars.className = 'layer-swatches';
    for (const bg of l.swatches) {
      const bar = document.createElement('span');
      bar.style.background = bg;
      bars.append(bar);
    }
    const name = document.createElement('span');
    name.className = 'layer-tile-name';
    name.textContent = l.title;
    b.append(bars, name);
    b.addEventListener('click', () => onPick(l));
    grid.append(b);
  }
  return group;
}
