# Spike 1: Open-Meteo map files

Nov 15, 2026.

## Question

Do Open-Meteo's gridded map files offer HRDPS as its own model, and do partial reads work in a phone browser?

## What I tried

- Read the README of `@openmeteo/weather-map-layer` 0.3.2 (published Nov 4, 2026) from the npm package.
- Fetched `latest.json` for every Canadian model from the data bucket and checked the response headers.
- Asked for the first 100 bytes of one HRDPS step file.
- Drew one HRDPS precipitation step on the hello map, and read 48 steps for the Sea to Sky box on the phone test page (headless Chromium here; iPhone results pending).

## Result

- **HRDPS is its own model:** `cmc_gem_hrdps` (2.5 km, 49 hourly steps, 0 to 48 h, four runs a day). Also present:
  - `cmc_gem_hrdps_west`: **1 km HRDPS West covering all of BC** (45.9 to 60.3° N, 126.3 to 114.5° W). Two runs a day.
  - `cmc_gem_rdps_10km`, `cmc_gem_gdps_15km`, `cmc_gem_geps`.
  - `cmc_gem_seamless`: a ready-made blend, HRDPS West → HRDPS → RDPS → GDPS by zoom.
- **The data address has moved.** The docs name `openmeteo-data-spatial.b-cdn.net`. The library now uses the raw S3 bucket `https://openmeteo.s3.amazonaws.com/data_spatial/`. Open-Meteo's own host `data-spatial.open-meteo.com` only answers pages on `*.open-meteo.com`, so apps must use the bucket.
- The bucket sends `Access-Control-Allow-Origin: *` and exposes `Content-Range`, so browsers on any site can read it.
- **Partial reads work:** a 100-byte request returned `206 Partial Content`. Reading 48 hours of precipitation for the Sea to Sky box took 7.4 s, six files at a time.
- File address: `…/data_spatial/<model>/<YYYY>/<MM>/<DD>/<HH>00Z/<valid YYYY-MM-DDTHH>00.om`, one file per valid time holding every variable.
- **HRDPS variables in the map files** (from `latest.json`): precipitation, showers, snowfall water equivalent, snow depth, temperature at 2, 40, 80 and 120 m and on 30 pressure levels, geopotential height on the same levels, relative humidity, wind speed and direction (10 m, heights, levels), gusts, cloud cover, CAPE, pressure, radiation, soil.
- **Not in the HRDPS map files:** freezing level height, snowfall height (snow line), dew point (derivable from humidity), weather code.
- The library is still marked "not yet fully production-ready" by its authors. Its API changed since the docs: settings passed per call, derivation rules, `delta_time_hours` for rates.
- The point-forecast API (`api.open-meteo.com`) answered "daily request limit exceeded" from this cloud machine all day. The address is shared with other cloud users. It is not a problem from Kaden's phone, but CI and cloud checks cannot rely on it.

## Consequence

- Use `https://openmeteo.s3.amazonaws.com/data_spatial` in the adapter (done: `adapters/openmeteo-maps`).
- Consider HRDPS West (1 km) as the high-resolution model for BC from M2 or M6. It is the finest terrain detail available, but it runs only twice a day. Worth Kaden's view.
- Pressure levels and geopotential heights in the files mean the terrain-temperature method (M4) can read straight from the map files, with no separate API.
- Freezing level and snow line must come from elsewhere (the point API, or derived from the temperature profile). M2 needs a decision; see the report.
- The "pin numbers match Open-Meteo's point forecast" check in M2 must run from the phone or a non-shared address.
