# Facts checked in M0

Nov 15, 2026. From `docs/06-decisions-and-open-items.md`, section 5, and the "not confirmed" items that affect M1 to M3.

| Fact | Found | Source |
| --- | --- | --- |
| HRDPS in Open-Meteo map files | Yes, `cmc_gem_hrdps`, 0–48 h hourly. Also 1 km `cmc_gem_hrdps_west` covering BC, RDPS, GDPS, GEPS and a seamless blend | `latest.json` per model; spike 1 |
| Partial reads | Work (206) from the S3 bucket, with CORS `*` | spike 1 |
| Starter library name | Still `@openmeteo/weather-map-layer`, now 0.3.2 (Nov 4, 2026), still "not production-ready", GPL-2.0 | npm, package README |
| Starter library data address | **Changed:** `https://openmeteo.s3.amazonaws.com/data_spatial/…`. `openmeteo-data-spatial.b-cdn.net` is no longer used; `data-spatial.open-meteo.com` answers only Open-Meteo's own pages | package README |
| Starter library protocol | Still `om://` through MapLibre `addProtocol`; settings now passed per call; precipitation shown per hour via `delta_time_hours` | package README |
| Starter library decoder | `@openmeteo/file-reader` 0.0.21, **also GPL-2.0-only** | its package.json |
| Real download sizes | Sea to Sky: base map to z14 19.9 MB, terrain to z12 30.7 MB. Kootenay: 4.6 MB and 21.2 MB | spike 3 |
| Mapterhorn in BC | 30 m everywhere, plus NRCan 2 m lidar ("Canada DTM 2018–2024") in parts; Sea to Sky has zoom 13–15, parts of the Kootenays to 16. Serves `tiles.mapterhorn.com/{z}/{x}/{y}.webp` (Terrarium, 512 px, CORS `*`) | mapterhorn.com, `download_urls.json`, `attribution.json` |
| Protomaps base map | Daily builds at `build.protomaps.com/YYYYMMDD.pmtiles` (139 GB), max zoom 15, **no CORS**: must be cut and hosted by us | spike 3, headers |
| Avalanche Canada terms | No API terms; website terms forbid copying without written consent. **API moved** to `avcan-services-api.prod.avalanche.ca` and `weather.prod.avalanche.ca` | spike 4 |
| iOS storage grant and eviction | Pending Kaden's phone run | spike 9 |
| Open-Meteo point API | Answers, but refused this cloud machine all day ("daily limit exceeded", shared address) | spike 1 |
| Overpass | Connection cut from this cloud machine | spike 5 |

## Library versions in use

Checked on npm Nov 15, 2026. Exact versions are pinned in `package.json`.

| Library | Version | Note |
| --- | --- | --- |
| vite | 8.3.8 | |
| typescript | 6.0.3 | 7.0.2 is out, but typescript-eslint 8.72 supports only < 6.1 |
| vitest | 5.1.0 | |
| @playwright/test | 1.63.0 | Matches the browser preinstalled here; 1.65.1 is current. CI installs its own browser |
| eslint / typescript-eslint | 10.15.0 / 8.72.2 | |
| maplibre-gl | 6.18.0 | **No default export any more; the worker is a separate file** (`app/map/maplibre.ts` handles it) |
| pmtiles | 4.5.0 | |
| maplibre-contour | 0.1.1 | |
| @protomaps/basemaps | 5.7.2 | |
| @openmeteo/weather-map-layer | 0.3.2 | GPL-2.0, isolated in `render/` |
| GitHub actions | checkout v7, setup-node v7, cache v6, upload-artifact v7 | |

## Corrections to the documents

- `README.md` domain list: replaced with the hosts actually needed (done).
- `docs/05-data-sources.md` and `docs/03-architecture.md`: the map-data address and Avalanche Canada API hosts above are out of date. Not edited; this file and the spike notes record the current facts.
