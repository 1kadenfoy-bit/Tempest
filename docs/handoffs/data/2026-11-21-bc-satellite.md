# Data: BC satellite picture

2026-11-21 · branch `claude/tempest-data` · ready to integrate

## What changed
The satellite picture for the map now exists as data. Nothing draws it yet.
- **All of BC** (the same box as the base map) at about 100 m per pixel when zoomed in as far as it goes (zoom 0 to 10).
- **Cypress Mountain and Mt Seymour** are sharper, about 6 m per pixel (zoom 11 to 14).
- It is one cloud-free picture for the whole year (2025). It mostly looks like summer. There is no winter version in this source.
- Total size 62 MB in 28 files, listed in `public/satellite/satellite.json` (same layout as `public/tiles/basemap.json`). No file is near the host's per-file limit.
- Checked by eye at the BC coast, Vancouver and Howe Sound, Whistler, and Cypress.

## What to try after it is integrated
1. Nothing is visible yet. The Maps chat has to add a Satellite base map that reads `public/satellite/satellite.json` and shows the credit.

## Files
- **Own files changed:** `docs/handoffs/data/`.
- **Shared files changed:** none.
- **New files no section owns yet:** `tools/build-satellite.py` (the build tool) and `public/satellite/**` (the data). Suggest the Data section owns both; `docs/sections/sections.json` needs these two paths added (the lead's file).
- The build tool is Python (Pillow and numpy), not Node, because the app has no image tools. It is a one-off build tool, not part of the app. Rebuild: `python3 -I tools/build-satellite.py` (raw EOX tiles are cached so a rebuild is gentle on their server).

## Connection points
- **Needs from other sections:** Maps: a Satellite base map from `public/satellite/satellite.json`, picking the file per tile like the base map router (overview zoom 0 to 7, pieces zoom 8 to 10, close-up zoom 11 to 14 only inside the Cypress and Seymour boxes, enlarging the zoom 10 picture elsewhere). Credits screen: the attribution is in the manifest.

## Checks
`npm run check:section -- data`: every check passed (area, typecheck, lint, unit tests, browser tests: 4 passed on recorded weather). No new tests added: the output is data files, checked by reading tiles back with the app's PMTiles reader.

## Kaden's rules added or changed
None yet.

## Decisions made, and anything unsure
- Chose the middle sharpness Kaden asked for, with close-up for Cypress and Seymour only.
- Made zoom 10 the top BC-wide level to keep the set small. Going one level sharper would be about 4 times bigger.
- Unsure: whether the satellite looks right when drawn on the map (colour and seams); to check once Maps draws it.

## Data, sources and terms
- **Source:** EOX Sentinel-2 cloudless 2025 (`tiles.maps.eox.at`, host allowed by Kaden). Contains modified Copernicus Sentinel data 2025.
- **Licence:** CC BY-NC-SA 4.0: non-commercial and share-alike, with credit "Contains modified Copernicus Sentinel data 2025, Sentinel-2 cloudless by EOX IT Services GmbH". Fine for a personal app. It would matter if the app were ever shared or sold.
- **Offline:** the files are in the app itself, so no live fetching. The build asked EOX for about 12,000 tiles once, gently.
- The 2016 to 2025 yearly pictures all exist; only 2025 is used.

## Not done yet
- **Ski hill data (lifts, runs, lodges):** not fetched. `overpass-api.de` is on the allowed list but cuts the connection from this machine. Waiting for Kaden's OK on the mirror `overpass.kumi.systems`.
- Winter satellite picture: not available from this source; would need building from raw Sentinel-2 pictures.
- Rest of the world: later.
