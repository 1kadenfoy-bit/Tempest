// The model menu (v8 04-ModelMenu) and the model info card (05-ModelInfo).
// Grows from the model button. Lists only the models that carry what the
// layer needs; the choice is remembered per layer. The "Compare two models"
// button is left out until the compare view is designed.
import type { ModelSpec } from '../../adapters/openmeteo-maps/models';
import { icons } from './icons';
import { formatDistance } from '../../core/units/format';

export interface ModelRow {
  spec: ModelSpec;
  /** "2 h old", or null when the model's run could not be read. */
  age: string | null;
  current: boolean;
}

const reach = (h: number) => (h < 120 ? `${h} h` : `${Math.round(h / 24)} days`);

export function modelMenuBody(rows: ModelRow[], onPick: (s: ModelSpec) => void, onInfo: (s: ModelSpec) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';
  for (const [group, title] of [['high', 'HIGH RESOLUTION'], ['global', 'GLOBAL']] as const) {
    const inGroup = rows.filter((r) => r.spec.group === group);
    if (!inGroup.length) continue;
    const g = document.createElement('div');
    g.className = 'group';
    const t = document.createElement('span');
    t.className = 'group-title';
    t.textContent = title;
    g.append(t);
    for (const r of inGroup) {
      const line = document.createElement('div');
      line.className = 'model-line';
      const row = document.createElement('button');
      row.className = 'model-row';
      row.setAttribute('aria-pressed', String(r.current));
      row.disabled = r.age === null;
      row.innerHTML = `<span class="model-names"><span class="model-name"></span><span class="model-grid"></span></span><span class="model-age"></span><span class="model-check">${icons.check}</span>`;
      row.querySelector('.model-name')!.textContent = r.spec.label;
      row.querySelector('.model-grid')!.textContent = `${formatDistance(r.spec.gridKm)} · to ${reach(r.spec.reachHours)}`;
      row.querySelector('.model-age')!.textContent = r.age ?? 'unavailable';
      row.addEventListener('click', () => onPick(r.spec));
      const info = document.createElement('button');
      info.className = 'model-info-button';
      info.setAttribute('aria-label', `About ${r.spec.label}`);
      info.innerHTML = icons.info;
      info.addEventListener('click', () => onInfo(r.spec));
      line.append(row, info);
      g.append(line);
    }
    wrap.append(g);
  }
  const note = document.createElement('p');
  note.className = 'panel-note';
  note.textContent = 'Only sources that carry what this layer needs are listed. Tap i for a source’s details. HRDPS and RDPS hand over down the chain where they end; the seam is marked.';
  wrap.append(note);
  return wrap;
}

export interface ModelFacts {
  latest: string;
  next: string;
}

export function modelInfoBody(spec: ModelSpec, facts: ModelFacts): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';
  const tiles = document.createElement('div');
  tiles.className = 'fact-grid';
  for (const [label, value] of [
    ['Grid', formatDistance(spec.gridKm)], ['Reaches', reach(spec.reachHours)], ['Runs', `${spec.runsPerDay} a day`],
    ['Latest', facts.latest], ['Next run', facts.next], ['Covers', spec.covers],
  ]) {
    const tile = document.createElement('div');
    tile.className = 'fact';
    tile.innerHTML = '<span class="fact-label"></span><span class="fact-value"></span>';
    tile.querySelector('.fact-label')!.textContent = label!;
    tile.querySelector('.fact-value')!.textContent = value!;
    tiles.append(tile);
  }
  wrap.append(tiles);
  const list = (title: string, items: string[], link?: string) => {
    const g = document.createElement('div');
    g.className = 'group';
    const t = document.createElement('span');
    t.className = 'group-title';
    t.textContent = title;
    const ul = document.createElement('ul');
    ul.className = 'fact-list';
    for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.append(li); }
    if (link) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'More about this model';
      li.append(a);
      ul.append(li);
    }
    g.append(t, ul);
    return g;
  };
  wrap.append(list('STRENGTHS', spec.strengths), list('CAUTIONS', spec.cautions), list('SOURCE', [spec.source], spec.link));
  const note = document.createElement('p');
  note.className = 'panel-note';
  note.textContent = 'An accuracy score comes later, from the app’s own comparisons over a season.';
  wrap.append(note);
  return wrap;
}
