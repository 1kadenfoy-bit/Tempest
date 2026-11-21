// The effects lab (effects.html): the North Shore in 3D with one effect at a
// time and sliders to judge it, for trying on a phone. Not part of the app.
// Today: wind particles flowing over the terrain, driven by a made-up wind
// whose direction and speed are set here.
import './lab.css';
import { maplibregl } from '../map/maplibre';
import { loadBasemap } from '../map/basemap-router';
import { topoStyle } from '../map/style';
import { addTerrain, TERRAIN_3D_SOURCE } from '../map/terrain';
import { applyTokens } from '../theme/tokens';
import { WindParticlesLayer } from '../../render/effects/wind-particles-layer';
import { compassName, syntheticWind, type SyntheticWind } from './synthetic-wind';

applyTokens(document);

interface Settings extends SyntheticWind {
  count: number;
  trail: number;
  width: number;
  brightness: number;
  speed: number;
  clearance: number;
}

const DEFAULTS: Settings = { fromDeg: 280, speedKmh: 36, terrain: 0.2, gusty: 0.15, count: 700, trail: 0.4, width: 2, brightness: 0.9, speed: 1, clearance: 50 };
const KEY = 'tempest-effects-lab';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* private window or blocked storage: start from the defaults */ }
  return { ...DEFAULTS };
}
function save(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not remembered: fine */ }
}

const settings = load();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function start(): Promise<void> {
  const basemap = await loadBasemap(document.baseURI);
  const map = new maplibregl.Map({
    container: 'map',
    style: topoStyle(basemap.source),
    center: [-123.0, 49.4],
    zoom: 11.2,
    pitch: 62,
    bearing: 15,
    maxPitch: 80,
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  await new Promise<void>((r) => map.once('load', () => r()));
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  addTerrain(map, firstLabel);
  map.setTerrain({ source: TERRAIN_3D_SOURCE, exaggeration: 1 });

  const layer = new WindParticlesLayer();
  const metresPerUnit = () => 40_075_016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180);
  layer.setWind(syntheticWind(() => settings, layer.grid, metresPerUnit));
  // Particles fly under the labels, like every weather picture.
  map.addLayer(layer, firstLabel);

  const apply = () => {
    layer.setLook({ count: settings.count, trailSeconds: settings.trail, widthPx: settings.width, brightness: settings.brightness, speedScale: settings.speed, clearance: settings.clearance });
    $('wind-text').textContent = `From ${compassName(settings.fromDeg)} ${Math.round(settings.fromDeg)}° · ${Math.round(settings.speedKmh)} km/h`;
    turnArrow();
    save(settings);
  };
  // The arrow points where the wind is going, as seen on screen.
  const turnArrow = () => { $('arrow').style.transform = `rotate(${settings.fromDeg + 180 - map.getBearing()}deg)`; };
  map.on('rotate', turnArrow);

  // The picture of the ground follows the view, once its terrain tiles have arrived.
  let timer = 0;
  const refreshSoon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => layer.refreshGround(), 300); };
  map.on('moveend', refreshSoon);
  map.on('sourcedata', (e) => { if (e.sourceId === TERRAIN_3D_SOURCE) refreshSoon(); });
  refreshSoon();

  buildControls(settings, apply, map, layer);
  apply();

  window.setInterval(() => {
    if (document.hidden) return;
    const s = layer.stats();
    $('fps').textContent = layer.isRunning ? `${s.fps ? Math.round(s.fps) : '–'} fps · ${s.workMs.toFixed(1)} ms/frame · ${settings.count} streaks` : 'paused';
  }, 500);

  (window as unknown as { tempestEffectsLab: unknown }).tempestEffectsLab = { map, layer, settings, apply };
  map.once('idle', () => { document.body.dataset.ready = 'true'; });
}

interface Slider { key: keyof Settings; label: string; min: number; max: number; step: number; unit: string; digits?: number }

const SLIDERS: [string, Slider[]][] = [
  ['Wind', [
    { key: 'fromDeg', label: 'Blowing from', min: 0, max: 355, step: 5, unit: '°' },
    { key: 'speedKmh', label: 'Speed', min: 0, max: 120, step: 1, unit: ' km/h' },
  ]],
  ['Terrain', [
    { key: 'terrain', label: 'Hills bend the wind', min: 0, max: 1, step: 0.05, unit: '', digits: 2 },
    { key: 'gusty', label: 'Patchiness', min: 0, max: 1, step: 0.05, unit: '', digits: 2 },
  ]],
  ['Look', [
    { key: 'count', label: 'Streaks', min: 200, max: 4000, step: 100, unit: '' },
    { key: 'trail', label: 'Streak length (time)', min: 0.2, max: 1.6, step: 0.05, unit: ' s', digits: 2 },
    { key: 'width', label: 'Line width', min: 1, max: 6, step: 0.2, unit: ' px', digits: 1 },
    { key: 'brightness', label: 'Brightness', min: 0.2, max: 1, step: 0.05, unit: '', digits: 2 },
    { key: 'speed', label: 'Movement speed', min: 0.3, max: 3, step: 0.1, unit: '×', digits: 1 },
    { key: 'clearance', label: 'Height above ground', min: 10, max: 300, step: 10, unit: ' m' },
  ]],
];

function buildControls(s: Settings, apply: () => void, map: maplibregl.Map, layer: WindParticlesLayer): void {
  const box = $('controls');
  const inputs = new Map<keyof Settings, { input: HTMLInputElement; out: HTMLOutputElement; def: Slider }>();
  const show = (def: Slider, out: HTMLOutputElement) => { out.textContent = `${Number(s[def.key]).toFixed(def.digits ?? 0)}${def.unit}`; };
  for (const [title, defs] of SLIDERS) {
    const h = document.createElement('h2');
    h.textContent = title;
    box.append(h);
    for (const def of defs) {
      const row = document.createElement('div');
      row.className = 'row';
      const id = `s-${def.key}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = def.label;
      const out = document.createElement('output');
      out.htmlFor = id;
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', id, min: String(def.min), max: String(def.max), step: String(def.step), value: String(s[def.key]) });
      input.addEventListener('input', () => { (s[def.key] as number) = Number(input.value); show(def, out); apply(); });
      show(def, out);
      row.append(label, out, input);
      box.append(row);
      inputs.set(def.key, { input, out, def });
    }
  }
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  const mk = (text: string, cls: string, fn: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button');
    b.className = cls; b.textContent = text;
    b.addEventListener('click', () => fn(b));
    buttons.append(b);
    return b;
  };
  mk('Pause', 'primary', (b) => { layer.setRunning(!layer.isRunning); b.textContent = layer.isRunning ? 'Pause' : 'Play'; });
  mk('Flat / tilted', 'secondary', () => map.easeTo({ pitch: map.getPitch() > 20 ? 0 : 62, bearing: map.getPitch() > 20 ? 0 : map.getBearing(), duration: 600 }));
  mk('Reset sliders', 'secondary', () => {
    Object.assign(s, DEFAULTS);
    for (const { input, out, def } of inputs.values()) { input.value = String(s[def.key]); show(def, out); }
    apply();
  });
  mk('Copy settings', 'secondary', (b) => {
    void navigator.clipboard?.writeText(JSON.stringify(s)).then(() => { b.textContent = 'Copied'; window.setTimeout(() => { b.textContent = 'Copy settings'; }, 1200); }, () => { b.textContent = JSON.stringify(s); });
  });
  box.append(buttons);

  const toggle = $('toggle');
  toggle.addEventListener('click', () => {
    box.hidden = !box.hidden;
    toggle.setAttribute('aria-expanded', String(!box.hidden));
    toggle.textContent = box.hidden ? 'Controls' : 'Hide controls';
  });
  toggle.textContent = 'Hide controls';
}

void start();
