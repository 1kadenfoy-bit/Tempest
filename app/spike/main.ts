// M0 phone test page: spikes 1, 2, 7, 8 and 9 measured on the real device.
// Results are plain text for Kaden to copy back.
import './spike.css';
import { maplibregl } from '../map/maplibre';
import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import { fetchRunMetadata, stepFileUrl } from '../../adapters/openmeteo-maps/run-metadata';
import { REGION_FILE_VERSION, decodeRegionFile, encodeRegionFile } from '../../core/region-file/format';
import { formatRunAge, nearestStepIndex } from '../../core/time/run-age';
import { precipitationStrip } from '../../layers/precipitation/fill';
import { fastPathAvailable, showWeatherFill } from '../../render/openmeteo-starter';
import { readRegionSeries, type BBox } from '../../render/openmeteo-starter/region-series';
import { loadBasemap } from '../map/basemap-router';
import { RangeOrWholeSource } from '../map/range-source';
import { topoStyle } from '../map/style';
import { addTerrain } from '../map/terrain';
import { applyTokens } from '../theme/tokens';

applyTokens(document);

const out = document.getElementById('out')!;
const log = (line: string) => { out.textContent += line + '\n'; };
const ms = (t: number) => `${Math.round(t)} ms`;
const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;
const STS: BBox = [-123.40, 49.25, -122.70, 50.35];
const PIN = { name: 'Mt Seymour', lat: 49.3933, lon: -122.9406 };

function idle(map: maplibregl.Map): Promise<void> {
  return new Promise((resolve) => map.once('idle', () => resolve()));
}

function device(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const gl2 = !!document.createElement('canvas').getContext('webgl2');
  log(`date: ${new Date().toISOString()}`);
  log(`browser: ${navigator.userAgent}`);
  log(`home-screen app: ${standalone ? 'yes' : 'no'}`);
  log(`screen: ${innerWidth}x${innerHeight} @${devicePixelRatio}x, safe area top ${cs.paddingTop} bottom ${cs.paddingBottom}`);
  log(`webgl2: ${gl2 ? 'yes' : 'no'}`);
  log(`cross-origin isolated: ${String(globalThis.crossOriginIsolated)}; SharedArrayBuffer: ${typeof SharedArrayBuffer !== 'undefined' ? 'yes' : 'no'}`);
  log(`weather fast path: ${fastPathAvailable() ? 'yes' : 'NO (slow path)'}`);
  probe.remove();
}

async function storage(): Promise<void> {
  const s = navigator.storage;
  if (!s) { log('storage api: missing'); return; }
  const est = await s.estimate();
  log(`storage: quota ${mb(est.quota ?? 0)}, used ${mb(est.usage ?? 0)}`);
  log(`persisted before: ${String(await s.persisted?.())}; persist() granted: ${String(await s.persist?.())}`);
  log(`opfs: ${typeof s.getDirectory === 'function' ? 'yes' : 'no'}`);
  const probe = new RangeOrWholeSource(new URL('tiles/detail-sea-to-sky.pmtiles', location.href).href);
  await probe.getBytes(0, 127);
  log(`host answers partial requests: ${probe.partial ? 'yes' : 'NO (whole file sent)'}`);
}

async function fps(map: maplibregl.Map, label: string): Promise<void> {
  const frames: number[] = [];
  let last = performance.now();
  let running = true;
  const tick = (t: number) => { frames.push(t - last); last = t; if (running) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const start = map.getCenter();
  for (const [dx, dy] of [[200, 0], [0, 150], [-200, 0], [0, -150]] as const) {
    map.panBy([dx, dy], { duration: 1200, easing: (x) => x });
    await new Promise((r) => setTimeout(r, 1250));
  }
  map.zoomTo(map.getZoom() + 1.5, { duration: 1500 });
  await new Promise((r) => setTimeout(r, 1550));
  map.jumpTo({ center: start, zoom: 9 });
  running = false;
  const f = frames.slice(1);
  const avg = 1000 / (f.reduce((a, b) => a + b, 0) / f.length);
  const slow = f.filter((d) => d > 34).length;
  log(`${label}: ${avg.toFixed(0)} fps average, ${slow} of ${f.length} frames slower than 30 fps, worst ${ms(Math.max(...f))}`);
}

async function mapTests(): Promise<maplibregl.Map> {
  const t0 = performance.now();
  const basemap = await loadBasemap(document.baseURI);
  const map = new maplibregl.Map({ container: 'map', style: topoStyle(basemap.source), center: [-123.05, 49.5], zoom: 9, attributionControl: { compact: true } });
  await new Promise<void>((r) => map.once('load', () => r()));
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  addTerrain(map, firstLabel);
  await idle(map);
  log(`base map + hillshade + contours first draw: ${ms(performance.now() - t0)}`);
  await fps(map, 'pan/zoom without weather');

  const run = await fetchRunMetadata('cmc_gem_hrdps');
  const i = Math.max(1, nearestStepIndex(run.validTimes, new Date()));
  const t1 = performance.now();
  showWeatherFill(map, { fileUrl: stepFileUrl(run.model, run.referenceTime, run.validTimes[i]!), variable: 'precipitation', stepHours: 1, strip: precipitationStrip(), ...(firstLabel ? { beforeLayerId: firstLabel } : {}) });
  await idle(map);
  log(`HRDPS precipitation first draw: ${ms(performance.now() - t1)} (${formatRunAge(run.referenceTime, new Date())})`);
  await fps(map, 'pan/zoom with weather');
  return map;
}

async function regionFile(): Promise<void> {
  const run = await fetchRunMetadata('cmc_gem_hrdps');
  // Step 0 is the analysis and carries no accumulated precipitation.
  const times = run.validTimes.slice(1, 49);
  const urls = times.map((t) => stepFileUrl(run.model, run.referenceTime, t));
  const t0 = performance.now();
  const series = await readRegionSeries(run.model, urls, times, 'precipitation', STS);
  const cut = performance.now() - t0;
  const buf = encodeRegionFile({
    header: {
      version: REGION_FILE_VERSION, source: 'openmeteo-maps', model: run.model, run: run.referenceTime.toISOString(),
      variable: 'precipitation', unit: 'mm/h', bbox: STS, validTimes: times.map((t) => t.toISOString()),
      valuesPerStep: series.steps[0]?.length ?? 0, savedAt: new Date().toISOString(),
    },
    steps: series.steps,
  });
  log(`region file: ${times.length} steps x ${series.steps[0]?.length ?? 0} grid points = ${(buf.byteLength / 1e3).toFixed(0)} kB, cut in ${ms(cut)}`);

  let decoded = decodeRegionFile(buf);
  try {
    const dir = await navigator.storage.getDirectory();
    const fh = await dir.getFileHandle('spike-region.bin', { create: true });
    const w = await fh.createWritable();
    await w.write(buf);
    await w.close();
    const t1 = performance.now();
    decoded = decodeRegionFile(await (await fh.getFile()).arrayBuffer());
    log(`region file saved to device storage and read back in ${ms(performance.now() - t1)}`);
  } catch (err) {
    log(`region file device storage: FAILED (${String(err)})`);
  }

  const t2 = performance.now();
  const values = decoded.steps.map((_, i) => series.sample(i, PIN.lat, PIN.lon));
  log(`tap readout for all ${values.length} steps at ${PIN.name}: ${(performance.now() - t2).toFixed(2)} ms total`);
  const total = values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  log(`${PIN.name} 48 h total from region file: ${total.toFixed(1)} mm`);

  const scrub = document.getElementById('scrub')!;
  const step = document.getElementById('step') as HTMLInputElement;
  const readout = document.getElementById('readout')!;
  const show = () => {
    const i = Number(step.value);
    const when = new Date(decoded.header.validTimes[i]!).toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', timeZone: 'America/Vancouver' });
    readout.textContent = `${when} · ${PIN.name} ${values[i]?.toFixed(1)} mm/h`;
  };
  step.max = String(values.length - 1);
  step.addEventListener('input', show);
  show();
  scrub.hidden = false;
}

/** A pmtiles Source that reads byte ranges from a File without loading it whole. */
class FileSliceSource implements Source {
  constructor(private file: File) {}
  getKey() { return this.file.name; }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await this.file.slice(offset, offset + length).arrayBuffer() };
  }
}

async function pmtilesFromStorage(): Promise<void> {
  try {
    const dir = await navigator.storage.getDirectory();
    const fh = await dir.getFileHandle('detail-sea-to-sky.pmtiles', { create: true });
    const t0 = performance.now();
    const res = await fetch('tiles/detail-sea-to-sky.pmtiles', { cache: 'no-store' });
    const w = await fh.createWritable();
    await res.body!.pipeTo(w);
    const file = await fh.getFile();
    if (file.size < 1e6) throw new Error(`map file arrived truncated (${file.size} bytes)`);
    log(`map file saved to device storage: ${mb(file.size)} in ${ms(performance.now() - t0)}`);
    const archive = new PMTiles(new FileSliceSource(file));
    const h = await archive.getHeader();
    const t1 = performance.now();
    let n = 0;
    for (let k = 0; k < 200; k++) {
      const z = 14;
      const scale = 2 ** z;
      const x = Math.floor(((-123.4 + Math.random() * 0.7 + 180) / 360) * scale);
      const lat = (49.25 + Math.random() * 1.1) * Math.PI / 180;
      const y = Math.floor(((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * scale);
      if (await archive.getZxy(z, x, y)) n++;
    }
    log(`200 random tile reads by byte range from device storage: ${ms(performance.now() - t1)} (${n} found, zoom ${h.minZoom}-${h.maxZoom})`);
  } catch (err) {
    log(`map file in device storage: FAILED (${String(err)})`);
  }
}

async function runAll(): Promise<void> {
  out.textContent = '';
  const steps: [string, () => Promise<unknown>][] = [
    ['device', async () => device()], ['storage', storage], ['map', mapTests], ['region file', regionFile], ['map file storage', pmtilesFromStorage],
  ];
  for (const [name, fn] of steps) {
    try { await fn(); } catch (err) { log(`${name}: FAILED (${String(err)})`); }
  }
  log('done');
  document.body.dataset.done = 'true';
}

document.getElementById('run')!.addEventListener('click', () => { void runAll(); });
document.getElementById('copy')!.addEventListener('click', () => { void navigator.clipboard.writeText(out.textContent ?? ''); });
