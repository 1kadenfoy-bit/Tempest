// MapLibre GL JS 6 loads its worker from a separate module file. Vite bundles
// that worker (with its shared chunk) and hands back its URL here, once.
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
