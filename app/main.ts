// M0 "hello map": base map region file, hillshade, contours and one HRDPS
// precipitation step through the rendering seam. Not the Tempest shell (M1).
import './main.css';
import { maplibregl } from './map/maplibre';
import { fetchRunMetadata, stepFileUrl } from '../adapters/openmeteo-maps/run-metadata';
import { formatRunAge, nearestStepIndex } from '../core/time/run-age';
import { precipitationStrip } from '../layers/precipitation/fill';
import { fastPathAvailable, showWeatherFill } from '../render/openmeteo-starter';
import { baseStyle, registerPmtiles } from './map/basemap';
import { addTerrain } from './map/terrain';
import { applyTokens } from './theme/tokens';

applyTokens(document);
registerPmtiles();

const status = document.getElementById('status')!;
const setStatus = (html: string) => { status.innerHTML = html; };

// North Shore and Sea to Sky, the start region on every design screen.
const map = new maplibregl.Map({
  container: 'map',
  style: baseStyle('tiles/sea-to-sky.pmtiles'),
  center: [-123.05, 49.5],
  zoom: 9,
  minZoom: 5,
  maxBounds: [[-125, 48.5], [-121, 51.2]],
  attributionControl: { compact: true },
});
(window as unknown as { tempestMap: maplibregl.Map }).tempestMap = map;

map.on('load', async () => {
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  addTerrain(map, firstLabel);
  try {
    const run = await fetchRunMetadata('cmc_gem_hrdps');
    const now = new Date();
    const i = Math.max(0, nearestStepIndex(run.validTimes, now));
    const valid = run.validTimes[i]!;
    showWeatherFill(map, {
      fileUrl: stepFileUrl(run.model, run.referenceTime, valid),
      variable: 'precipitation',
      stepHours: 1,
      strip: precipitationStrip(),
      ...(firstLabel ? { beforeLayerId: firstLabel } : {}),
    });
    const when = valid.toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', timeZone: 'America/Vancouver' });
    setStatus(`<b>HRDPS precipitation</b>${when} · ${formatRunAge(run.referenceTime, now)}${fastPathAvailable() ? '' : ' · slow path'}`);
    document.body.dataset.weather = 'ready';
  } catch (err) {
    setStatus(`<b>Weather unavailable</b>${String(err)}`);
    document.body.dataset.weather = 'error';
  }
});

map.on('idle', () => { document.body.dataset.idle = 'true'; });

