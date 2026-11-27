// The ?perf tour (docs/plans/performance.md, part 2): after the app has
// loaded, it moves the map, the time and the menus by itself, the same way
// every time, and times each step. About two minutes. It puts back what it
// changes (camera, time, layer, 3D) and then shows the results card.
//
// The map is moved with the map's own camera calls rather than fake touches
// (a page cannot make trusted touches on iOS); the drawing work per frame is
// the same as under a finger. Buttons are pressed with real clicks.
import type { AppState } from '../state';
import type { PerfState } from './index';
import { FrameRecorder, nextPaint, round, sleep, type FrameStats } from './frames';
import { showCard } from './card';

export interface StepResult {
  name: string;
  frames?: FrameStats;
  /** Plain notes (what the step found), shown on the card. */
  notes: string[];
  /** Numbers for the build machine's runs. */
  data: Record<string, unknown>;
  error?: string;
  /** When the step started and ended (ms on the page's clock), to line it up with a profile. */
  t0?: number;
  t1?: number;
}

export interface TourResult {
  started: string;
  /** The address's options (?perf, &off=...), so a pasted result says how it was run. */
  address: string;
  userAgent: string;
  screen: string;
  standalone: boolean;
  setup: Record<string, unknown>;
  steps: StepResult[];
  memoryMB: number | null;
  done: boolean;
}

const READY_MARKS = ['data-fill', 'data-air-fill', 'data-avalanche-map'];

/** Times at which a layer said its picture was ready. */
function watchReady(): { times: number[]; stop: () => void } {
  const times: number[] = [];
  const obs = new MutationObserver((recs) => {
    for (const r of recs) {
      const v = document.body.getAttribute(r.attributeName!);
      if (v === 'ready') times.push(performance.now());
    }
  });
  obs.observe(document.body, { attributes: true, attributeFilter: READY_MARKS });
  return { times, stop: () => obs.disconnect() };
}

function memoryMB(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1e6) : null;
}

/** Waits until the map has every piece in view and the app has no request on its way, or the time runs out. */
async function settled(S: AppState, state: PerfState | null, maxMs: number): Promise<number | null> {
  const t0 = performance.now();
  await sleep(100);
  while (performance.now() - t0 < maxMs) {
    const busy = !!state && state.fetches.some((f) => f.status === 0 && !f.error && f.ms === 0);
    if (!busy && S.map.areTilesLoaded() && !S.map.isMoving()) return performance.now() - t0;
    await sleep(50);
  }
  return null;
}

/** Waits for a ready mark after `since`, or the time runs out; returns ms after `since`. */
async function readyAfter(ready: { times: number[] }, since: number, maxMs: number): Promise<number | null> {
  while (performance.now() - since < maxMs) {
    const t = ready.times.find((x) => x >= since);
    if (t !== undefined) return t - since;
    await sleep(20);
  }
  return null;
}

/** A camera move, run to its end. */
function move(S: AppState, opts: Parameters<AppState['map']['easeTo']>[0]): Promise<void> {
  return new Promise((resolve) => {
    S.map.once('moveend', () => resolve());
    S.map.easeTo({ ...opts, essential: true });
  });
}

/** Steps the cursor passed through and which of them the map drew before the next one came. */
function pairSteps(stepTimes: number[], readyTimes: number[], end: number) {
  let drawn = 0;
  const delays: number[] = [];
  stepTimes.forEach((t, i) => {
    const next = stepTimes[i + 1] ?? end;
    const r = readyTimes.find((x) => x >= t && x < next);
    if (r !== undefined) { drawn++; delays.push(r - t); }
  });
  delays.sort((a, b) => a - b);
  return { steps: stepTimes.length, drawn, medianDelayMs: delays.length ? Math.round(delays[Math.floor(delays.length / 2)]!) : null };
}

/** Clicks a button and times the first frame drawn after it. */
async function tap(el: HTMLElement | null): Promise<{ handlerMs: number; responseMs: number } | null> {
  if (!el) return null;
  const t0 = performance.now();
  el.click();
  const t1 = performance.now();
  await nextPaint();
  return { handlerMs: Math.round(t1 - t0), responseMs: Math.round(performance.now() - t0) };
}

/**
 * What one frame of the map costs to draw with the camera still: the map is
 * asked to redraw itself frame after frame, and the time between draws is
 * averaged. Nothing loads or moves meanwhile, so the number is the drawing
 * alone (on a phone it cannot read below one screen refresh, about 17 ms).
 */
export async function drawCost(S: AppState, frames = 12): Promise<{ msPerFrame: number; frames: number }> {
  await settled(S, null, 15_000);
  return new Promise((resolve) => {
    const times: number[] = [];
    const onRender = () => {
      times.push(performance.now());
      if (times.length > frames) {
        S.map.off('render', onRender);
        const gaps = times.slice(2).map((t, i) => t - times[i + 1]!).sort((a, b) => a - b);
        resolve({ msPerFrame: round(gaps[Math.floor(gaps.length / 2)]!, 1), frames: gaps.length });
        return;
      }
      S.map.triggerRepaint();
    };
    S.map.on('render', onRender);
    S.map.triggerRepaint();
  });
}

export async function runTour(S: AppState, state: PerfState): Promise<void> {
  const banner = document.createElement('div');
  banner.className = 'perf-banner';
  document.body.append(banner);
  const say = (s: string) => { banner.textContent = `Speed test: ${s} · please don't touch`; };

  const rec = new FrameRecorder(S.map);
  const ready = watchReady();
  const result: TourResult = {
    started: new Date().toISOString(),
    address: location.search,
    userAgent: navigator.userAgent,
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    standalone: matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true,
    setup: {
      layer: S.active.id,
      terrain3d: S.prefs.terrain3d,
      buildings3d: S.prefs.buildings3d,
      hillshade: S.prefs.hillshade,
      contours: S.prefs.contours,
      stations: S.prefs.stations,
      mapSettings: S.prefs.mapSettings,
      features: S.prefs.features ?? {},
    },
    steps: [],
    memoryMB: null,
    done: false,
  };
  state.tour = result;
  let peakMemory = memoryMB();
  const step = async (name: string, fn: (r: StepResult) => Promise<void>) => {
    say(name);
    const r: StepResult = { name, notes: [], data: {}, t0: Math.round(performance.now()) };
    try { await fn(r); } catch (err) { r.error = err instanceof Error ? err.message : String(err); }
    const m = memoryMB();
    if (m !== null) { r.data.memoryMB = m; peakMemory = Math.max(peakMemory ?? 0, m); }
    r.t1 = Math.round(performance.now());
    result.steps.push(r);
    await sleep(500);
  };

  const finish = () => {
    ready.stop();
    banner.remove();
    result.memoryMB = peakMemory;
    result.done = true;
    showCard(result);
  };

  // Where the tour starts, put back at the end.
  const home = { center: S.map.getCenter(), zoom: S.map.getZoom(), pitch: S.map.getPitch(), bearing: S.map.getBearing() };
  const homeIndex = S.cursor.index;
  const homeLayer = S.active;

  // 1. Open: the load times, and a few quiet seconds after.
  await step('Open', async (r) => {
    r.data = { ...state.marks };
    rec.start();
    await sleep(3000);
    r.frames = rec.stop();
  });

  // A fixed piece of arithmetic, the same on every device, to compare this
  // processor with the build machine's (the kind of loop the app runs over
  // terrain pictures: 4 million pixels turned into heights).
  await step('Yardstick', async (r) => {
    const n = 2048 * 2048;
    const px = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) >>> 24;
    const out = new Float32Array(n);
    const times: number[] = [];
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) out[i] = px[i * 4]! * 256 + px[i * 4 + 1]! + px[i * 4 + 2]! / 256 - 32768;
      times.push(performance.now() - t0);
    }
    r.data.ms = round(Math.min(...times), 1);
    r.notes.push(`${r.data.ms} ms`);
  });

  // The drawing alone, flat and tilted (camera still, every frame redrawn).
  await step('Draw', async (r) => {
    r.data.flat = await drawCost(S);
    S.map.jumpTo({ pitch: 55, bearing: 30 });
    r.data.tilted = await drawCost(S);
    S.map.jumpTo({ pitch: home.pitch, bearing: home.bearing });
    await settled(S, state, 10_000);
    const f = r.data.flat as { msPerFrame: number }, t = r.data.tilted as { msPerFrame: number };
    r.notes.push(`one frame takes ${f.msPerFrame} ms flat, ${t.msPerFrame} ms tilted`);
  });
  if (state.mode === 'cost') { finish(); return; }

  // 2. Pan: four one-second moves, about a third of the screen each.
  await step('Pan', async (r) => {
    rec.start();
    for (const [x, y] of [[140, 0], [0, 220], [-140, 0], [0, -220]] as const) await move(S, { offset: [0, 0], center: S.map.unproject([innerWidth / 2 + x, innerHeight / 2 + y]), duration: 1000 });
    r.frames = rec.stop();
    r.data.settleMs = await settled(S, state, 10_000);
  });

  // 3. Pinch: in by one and a half zoom levels and back out.
  await step('Pinch', async (r) => {
    const z = S.map.getZoom();
    rec.start();
    await move(S, { zoom: z + 1.5, duration: 1200 });
    await move(S, { zoom: z, duration: 1200 });
    r.frames = rec.stop();
    r.data.settleMs = await settled(S, state, 10_000);
  });

  // 4. Tilt into 3D and turn, then back to flat. With 3D off in the map panel,
  // it is switched on for this step only and switched back off after.
  await step('Tilt 3D', async (r) => {
    const was = { terrain: S.prefs.terrain3d, buildings: S.prefs.buildings3d };
    const turnedOn = !was.terrain && !was.buildings;
    if (turnedOn) S.threeD.apply({ terrain: true, buildings: false }, false);
    r.data.switchedOnForTest = turnedOn;
    rec.start();
    await move(S, { pitch: 55, bearing: 30, duration: 1500 });
    await move(S, { bearing: -30, duration: 2000 });
    const tilted = rec.stop();
    r.data.settleTiltedMs = await settled(S, state, 15_000);
    rec.start();
    await move(S, { pitch: 0, bearing: 0, duration: 1000 });
    r.data.flatten = rec.stop();
    r.frames = tilted;
    if (turnedOn) S.threeD.apply({ terrain: false, buildings: false }, false);
    await settled(S, state, 10_000);
  });

  // 5. Drag the time slider: a finger moving one step every 80 ms, 24 steps forward, then back.
  await step('Drag time', async (r) => {
    const stepTimes: number[] = [];
    const off = S.cursor.subscribe(() => stepTimes.push(performance.now()));
    const start = S.cursor.index;
    rec.start();
    for (let i = 1; i <= 24; i++) { S.cursor.setIndex(start + i); await sleep(80); }
    for (let i = 23; i >= 0; i--) { S.cursor.setIndex(start + i); await sleep(80); }
    const fingerStop = performance.now();
    // From the finger's last step to the map showing it.
    const lastStep = stepTimes[stepTimes.length - 1] ?? fingerStop;
    const caught = await readyAfter(ready, lastStep, 15_000);
    r.frames = rec.stop();
    off();
    const p = pairSteps(stepTimes, ready.times, fingerStop);
    r.data = { ...p, catchUpMs: caught === null ? null : Math.round(caught) };
    r.notes.push(`${p.drawn} of ${p.steps} steps drawn while dragging`);
    r.notes.push(caught === null ? 'map never caught up (15 s)' : `caught up ${round(caught / 1000, 2)} s after the finger stopped`);
  });

  // 6. Play: ten seconds of the play button.
  await step('Play', async (r) => {
    const stepTimes: number[] = [];
    const off = S.cursor.subscribe(() => stepTimes.push(performance.now()));
    const btn = document.getElementById('play-button');
    rec.start();
    const t = await tap(btn);
    await sleep(10_000);
    const end = performance.now();
    if (S.cursor.index < S.cursor.count - 1) await tap(btn);
    r.frames = rec.stop();
    off();
    const p = pairSteps(stepTimes, ready.times, end);
    r.data = { ...p, tap: t };
    r.notes.push(`${p.drawn} of ${p.steps} steps drawn`);
    if (p.medianDelayMs !== null) r.notes.push(`each step drawn ${round(p.medianDelayMs / 1000, 2)} s after it came`);
    S.cursor.setIndex(homeIndex);
    await settled(S, state, 10_000);
  });

  // 7. Switch every weather layer, through the layer menu, then back.
  await step('Switch layers', async (r) => {
    const order = [...S.layers.filter((l) => l !== homeLayer), homeLayer];
    const switches: Record<string, unknown>[] = [];
    rec.start();
    for (const l of order) {
      const open = await tap(document.getElementById('layer-button'));
      await sleep(500);
      const tile = [...document.querySelectorAll<HTMLElement>('.panel .layer-tile')].find((b) => b.querySelector('.layer-tile-name')?.textContent === l.title) ?? null;
      const t0 = performance.now();
      const pick = await tap(tile);
      const sub = new FrameRecorder(S.map);
      sub.start();
      // Its picture: the layer's ready mark, else the map settling (layers without a mark).
      const mark = await readyAfter(ready, t0, 15_000);
      const settle = await settled(S, state, 15_000);
      const f = sub.stop();
      switches.push({ layer: l.id, openMenuMs: open?.responseMs ?? null, pickMs: pick?.responseMs ?? null, readyMs: mark === null ? null : Math.round(mark), settleMs: settle === null ? null : Math.round(settle), worstFrameMs: f.worstMs });
      r.notes.push(`${l.title}: ${mark === null ? 'no picture in 15 s' : `${round(mark / 1000, 1)} s`}, worst hitch ${f.worstMs} ms`);
      await sleep(300);
    }
    r.frames = rec.stop();
    r.data.switches = switches;
  });

  // 8. Open and close each panel; time from the tap to the first frame after it.
  await step('Panels', async (r) => {
    const taps: Record<string, unknown>[] = [];
    rec.start();
    for (const id of ['layer-button', 'model-pill', 'settings-button', 'map-layers', 'search-button', 'window-button']) {
      const open = await tap(document.getElementById(id));
      await sleep(700);
      const close = await tap(document.querySelector<HTMLElement>('.panel .panel-close'));
      await sleep(600);
      taps.push({ id, openMs: open?.responseMs ?? null, openCodeMs: open?.handlerMs ?? null, closeMs: close?.responseMs ?? null });
    }
    const up = await tap(document.getElementById('sheet-handle'));
    await sleep(800);
    const down = await tap(document.getElementById('sheet-handle'));
    await sleep(800);
    taps.push({ id: 'sheet', openMs: up?.responseMs ?? null, openCodeMs: up?.handlerMs ?? null, closeMs: down?.responseMs ?? null });
    r.frames = rec.stop();
    r.data.taps = taps;
    const all = taps.flatMap((t) => [t.openMs, t.closeMs]).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
    if (all.length) r.notes.push(`taps answered in ${all[0]}–${all[all.length - 1]} ms (median ${all[Math.floor(all.length / 2)]})`);
  });

  // Back where the tour started.
  S.map.jumpTo(home);
  S.cursor.setIndex(homeIndex);
  await settled(S, state, 15_000);

  // 9. Not touching it: fifteen quiet seconds. Counts the map's draws, frame
  // requests, downloads and changes to the page.
  // ?perf&idle=<seconds> waits longer (the build machine, to catch the app's slower timers).
  const idleSeconds = Number(new URLSearchParams(location.search).get('idle')) || 15;
  await step('Idle', async (r) => {
    let rafCalls = 0;
    const realRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { rafCalls++; return realRaf.call(window, cb); };
    let draws = 0;
    const onRender = () => { draws++; };
    S.map.on('render', onRender);
    let changes = 0;
    const where = new Map<string, number>();
    const obs = new MutationObserver((recs) => {
      changes += recs.length;
      for (const m of recs) {
        const el = m.target instanceof Element ? m.target : m.target.parentElement;
        const k = el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${m.type === 'attributes' ? ` [${m.attributeName}]` : ''}` : '?';
        where.set(k, (where.get(k) ?? 0) + 1);
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const fetches0 = state.fetches.length;
    const res0 = performance.getEntriesByType('resource').length;
    await sleep(idleSeconds * 1000);
    window.requestAnimationFrame = realRaf;
    S.map.off('render', onRender);
    obs.disconnect();
    const downloads = Math.max(state.fetches.length - fetches0, performance.getEntriesByType('resource').length - res0);
    r.data = { seconds: idleSeconds, mapDraws: draws, frameRequests: rafCalls, downloads, pageChanges: changes, changedWhere: Object.fromEntries([...where].sort((a, b) => b[1] - a[1]).slice(0, 8)), downloaded: state.fetches.slice(fetches0).map((f) => f.url.slice(0, 120)) };
    r.notes.push(`${draws} map draws, ${rafCalls} frame requests, ${downloads} downloads, ${changes} page changes in ${idleSeconds} s`);
  });

  finish();
}
