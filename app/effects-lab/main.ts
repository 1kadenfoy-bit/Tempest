// The effects lab (effects.html): the North Shore in 3D with effects to judge,
// and sliders to change them, for trying on a phone. Not part of the app.
// Today: wind particles flowing over the terrain, and clouds at three heights.
// Both are driven by made-up weather set here; the forecast replaces it when
// the effects join the app.
import './lab.css';
import { maplibregl } from '../map/maplibre';
import { loadBasemap } from '../map/basemap-router';
import { topoStyle } from '../map/style';
import { addTerrain, TERRAIN_3D_SOURCE } from '../map/terrain';
import { applyTokens } from '../theme/tokens';
import { CloudLayer } from '../../render/effects/cloud-layer';
import { WindParticlesLayer } from '../../render/effects/wind-particles-layer';
import { compassName, syntheticWind, type SyntheticWind } from './synthetic-wind';

applyTokens(document);

interface Settings extends SyntheticWind {
  windOn: boolean;
  count: number;
  trail: number;
  width: number;
  brightness: number;
  speed: number;
  clearance: number;
  cloudsOn: boolean;
  /** Cloud cover in percent, as a forecast gives it. */
  coverLow: number;
  coverMid: number;
  coverHigh: number;
  /** Height of each cloud base above sea level, metres. */
  baseLow: number;
  baseMid: number;
  baseHigh: number;
  density: number;
  storminess: number;
  detail: number;
  cloudDrift: number;
  evolve: number;
  fluff: number;
  lowDepth: number;
}

const DEFAULTS: Settings = {
  fromDeg: 280, speedKmh: 36, terrain: 0.2, gusty: 0.15, gust: 0.5, gustSize: 1,
  windOn: true, count: 700, trail: 0.4, width: 2, brightness: 0.9, speed: 1, clearance: 50,
  cloudsOn: true, coverLow: 40, coverMid: 30, coverHigh: 50, baseLow: 1200, baseMid: 3500, baseHigh: 8000,
  density: 0.75, storminess: 0, detail: 3, cloudDrift: 1, evolve: 1, fluff: 3, lowDepth: 700,
};
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

  const wind = new WindParticlesLayer();
  const clouds = new CloudLayer();
  const metresPerUnit = () => 40_075_016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180);
  // Gusts ride along at the speed the streaks really move on the ground.
  const clock = {
    seconds: () => performance.now() / 1000,
    groundMps: () => {
      const mPerPx = metresPerUnit() / (512 * 2 ** map.getZoom());
      return settings.speedKmh * 2.2 * settings.speed * mPerPx;
    },
  };
  wind.setWind(syntheticWind(() => settings, wind.grid, metresPerUnit, clock));
  // Effects fly under the labels, like every weather picture: clouds first, so the streaks draw over them.
  map.addLayer(clouds, firstLabel);
  map.addLayer(wind, firstLabel);

  const apply = () => {
    wind.setLook({ count: settings.count, trailSeconds: settings.trail, widthPx: settings.width, brightness: settings.brightness, speedScale: settings.speed, clearance: settings.clearance });
    wind.setVisible(settings.windOn);
    clouds.setSheet('low', { cover: settings.coverLow / 100, baseM: settings.baseLow });
    clouds.setSheet('mid', { cover: settings.coverMid / 100, baseM: settings.baseMid });
    clouds.setSheet('high', { cover: settings.coverHigh / 100, baseM: settings.baseHigh });
    clouds.setLook({ density: settings.density, storminess: settings.storminess, detail: settings.detail, drift: settings.cloudDrift, evolve: settings.evolve, fluff: settings.fluff, lowDepthM: settings.lowDepth });
    clouds.setWind({ fromDeg: settings.fromDeg, speedKmh: settings.speedKmh });
    clouds.setVisible(settings.cloudsOn);
    $('wind-text').textContent = `From ${compassName(settings.fromDeg)} ${Math.round(settings.fromDeg)}° · ${Math.round(settings.speedKmh)} km/h`;
    const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
    $('cloud-text').textContent = settings.cloudsOn
      ? `Low ${Math.round(settings.coverLow)}% ${km(settings.baseLow)} · Mid ${Math.round(settings.coverMid)}% ${km(settings.baseMid)} · High ${Math.round(settings.coverHigh)}% ${km(settings.baseHigh)}`
      : '';
    turnArrow();
    save(settings);
  };
  // The arrow points where the wind is going, as seen on screen.
  const turnArrow = () => { $('arrow').style.transform = `rotate(${settings.fromDeg + 180 - map.getBearing()}deg)`; };
  map.on('rotate', turnArrow);

  // The picture of the ground follows the view, once its terrain tiles have arrived.
  let timer = 0;
  const refreshSoon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => wind.refreshGround(), 300); };
  map.on('moveend', refreshSoon);
  map.on('sourcedata', (e) => { if (e.sourceId === TERRAIN_3D_SOURCE) refreshSoon(); });
  refreshSoon();

  // Frames per second, counted from the map's own redraws (whatever is drawing them).
  const frames: number[] = [];
  map.on('render', () => { frames.push(performance.now()); if (frames.length > 120) frames.shift(); });
  const running = () => wind.isRunning;

  buildControls(settings, apply, map, wind, clouds);
  apply();

  window.setInterval(() => {
    if (document.hidden) return;
    const now = performance.now();
    const recent = frames.filter((t) => now - t < 1200);
    const fps = recent.length > 2 ? ((recent.length - 1) * 1000) / (recent[recent.length - 1]! - recent[0]!) : 0;
    const s = wind.stats();
    if (!running()) { $('fps').textContent = 'paused'; return; }
    const parts = [`${fps ? Math.round(fps) : '–'} fps`];
    if (settings.windOn) parts.push(`${s.workMs.toFixed(1)} ms/frame`, `${settings.count} streaks`);
    $('fps').textContent = parts.join(' · ');
  }, 500);

  (window as unknown as { tempestEffectsLab: unknown }).tempestEffectsLab = { map, layer: wind, clouds, settings, apply };
  map.once('idle', () => { document.body.dataset.ready = 'true'; });
}

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
interface Slider { key: NumKey; label: string; min: number; max: number; step: number; unit: string; digits?: number }

const SLIDERS: [string, Slider[]][] = [
  ['Cloud cover', [
    { key: 'coverLow', label: 'Low cloud', min: 0, max: 100, step: 5, unit: ' %' },
    { key: 'coverMid', label: 'Mid cloud', min: 0, max: 100, step: 5, unit: ' %' },
    { key: 'coverHigh', label: 'High cloud', min: 0, max: 100, step: 5, unit: ' %' },
  ]],
  ['Cloud height (base, above sea level)', [
    { key: 'baseLow', label: 'Low cloud base', min: 0, max: 3000, step: 50, unit: ' m' },
    { key: 'baseMid', label: 'Mid cloud base', min: 2000, max: 7000, step: 100, unit: ' m' },
    { key: 'baseHigh', label: 'High cloud base', min: 5000, max: 12000, step: 100, unit: ' m' },
  ]],
  ['Cloud look', [
    { key: 'density', label: 'Thickness', min: 0.2, max: 1, step: 0.05, unit: '', digits: 2 },
    { key: 'storminess', label: 'Storm grey', min: 0, max: 1, step: 0.05, unit: '', digits: 2 },
    { key: 'cloudDrift', label: 'Drift speed', min: 0, max: 4, step: 0.1, unit: '×', digits: 1 },
    { key: 'evolve', label: 'Forming and fading speed', min: 0, max: 3, step: 0.1, unit: '×', digits: 1 },
    { key: 'fluff', label: 'Low cloud fluffiness (3D steps, 0 = flat)', min: 0, max: 8, step: 1, unit: '' },
    { key: 'lowDepth', label: 'Low cloud depth', min: 200, max: 2000, step: 50, unit: ' m' },
    { key: 'detail', label: 'Detail (more costs more)', min: 2, max: 5, step: 1, unit: '' },
  ]],
  ['Wind', [
    { key: 'fromDeg', label: 'Blowing from', min: 0, max: 355, step: 5, unit: '°' },
    { key: 'speedKmh', label: 'Speed', min: 0, max: 120, step: 1, unit: ' km/h' },
  ]],
  ['Terrain', [
    { key: 'terrain', label: 'Hills bend the wind', min: 0, max: 1, step: 0.05, unit: '', digits: 2 },
    { key: 'gusty', label: 'Patchiness', min: 0, max: 1, step: 0.05, unit: '', digits: 2 },
  ]],
  ['Gusts', [
    { key: 'gust', label: 'Gust strength', min: 0, max: 1, step: 0.05, unit: '', digits: 2 },
    { key: 'gustSize', label: 'Gust size', min: 0.4, max: 3, step: 0.1, unit: '×', digits: 1 },
  ]],
  ['Wind streaks', [
    { key: 'count', label: 'Streaks', min: 200, max: 4000, step: 100, unit: '' },
    { key: 'trail', label: 'Streak length (time)', min: 0.2, max: 1.6, step: 0.05, unit: ' s', digits: 2 },
    { key: 'width', label: 'Line width', min: 1, max: 6, step: 0.2, unit: ' px', digits: 1 },
    { key: 'brightness', label: 'Brightness', min: 0.2, max: 1, step: 0.05, unit: '', digits: 2 },
    { key: 'speed', label: 'Movement speed', min: 0.3, max: 3, step: 0.1, unit: '×', digits: 1 },
    { key: 'clearance', label: 'Height above ground', min: 10, max: 300, step: 10, unit: ' m' },
  ]],
];

function buildControls(s: Settings, apply: () => void, map: maplibregl.Map, wind: WindParticlesLayer, clouds: CloudLayer): void {
  const box = $('controls');
  const inputs = new Map<NumKey, { input: HTMLInputElement; out: HTMLOutputElement; def: Slider }>();
  const show = (def: Slider, out: HTMLOutputElement) => { out.textContent = `${Number(s[def.key]).toFixed(def.digits ?? 0)}${def.unit}`; };

  const mkButton = (parent: HTMLElement, text: string, cls: string, fn: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button');
    b.className = cls; b.textContent = text;
    b.addEventListener('click', () => fn(b));
    parent.append(b);
    return b;
  };

  // Which effects are on.
  const toggles = document.createElement('div');
  toggles.className = 'buttons';
  const mkToggle = (name: string, key: 'windOn' | 'cloudsOn') => {
    const b = mkButton(toggles, '', 'secondary', () => { s[key] = !s[key]; paint(); apply(); });
    const paint = () => { b.textContent = `${name}: ${s[key] ? 'on' : 'off'}`; b.setAttribute('aria-pressed', String(s[key])); };
    paint();
    return paint;
  };
  const repaintToggles = [mkToggle('Clouds', 'cloudsOn'), mkToggle('Wind streaks', 'windOn')];
  box.append(toggles);

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
      input.addEventListener('input', () => { s[def.key] = Number(input.value); show(def, out); apply(); });
      show(def, out);
      row.append(label, out, input);
      box.append(row);
      inputs.set(def.key, { input, out, def });
    }
  }
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  mkButton(buttons, 'Pause', 'primary', (b) => {
    const on = !wind.isRunning;
    wind.setRunning(on);
    clouds.setRunning(on);
    b.textContent = on ? 'Pause' : 'Play';
  });
  mkButton(buttons, 'Flat / tilted', 'secondary', () => map.easeTo({ pitch: map.getPitch() > 20 ? 0 : 62, bearing: map.getPitch() > 20 ? 0 : map.getBearing(), duration: 600 }));
  mkButton(buttons, 'Reset sliders', 'secondary', () => {
    Object.assign(s, DEFAULTS);
    for (const { input, out, def } of inputs.values()) { input.value = String(s[def.key]); show(def, out); }
    repaintToggles.forEach((p) => p());
    apply();
  });
  mkButton(buttons, 'Copy settings', 'secondary', (b) => {
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
