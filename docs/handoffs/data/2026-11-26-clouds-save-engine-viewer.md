# Data: cloud data, the saving engine, the data viewer

2026-11-26 · branch `claude/tempest-data` · ready to integrate

**For the lead: keep everything below.** The BC satellite files from the earlier note (2026-11-21-bc-satellite.md) are already in `main` (PR #25); this note covers what came after.

## What changed (things Kaden can try, and what each one is for)

1. **Cloud forecast data (for the Effects chat).** The names and a table of what each model offers. No layer draws it yet.
   - All four models (HRDPS, RDPS, GDPS, ECMWF) give total, low, mid and high cloud cover at a place, in percent, through the point forecast.
   - Over a whole map view: HRDPS, RDPS and GDPS have only total cloud cover in their map files. Only ECMWF has low, mid and high over the map. (Checked Nov 22 against the point API and each model's own file list.)
   - **No model gives cloud base or cloud top**, and no pressure-level cloud cover exists in the map files. Cloud height has to come from the three layers (their edges, about 2 km and 6 km, are Open-Meteo's definition from memory: still to confirm; that site was not reachable).
2. **The saving engine** for the new "Save for offline" card (plan: `docs/plans/offline-save.md`). The card and the Notification Centre are other chats' work; this is what they call.
   - `layerTimeRange(layer, model)`: how far a layer reaches on the scrubber, with a plain age ("2 h old").
   - `estimateSave(req)`: bytes per layer and for the map pieces and terrain; values two layers share (the temperature profile) are counted once in the total; says in plain words when a model covers only part of the span.
   - `startSave(req)`: a save that runs in the background, with progress events, cancel, and `done` resolving to the saved area's id. "Auto" saves each hour from the chain (HRDPS, then RDPS, then GDPS). A cancelled or failed save removes the files it wrote.
   - `listSaved()` and `deleteSaved(id)`.
   - The saved record is now **format version 3**: it keeps the traced outline, the model chosen for each layer and the time span. Versions 1 and 2 still read (tested).
3. **The data viewer page** (`/data-viewer.html`): the cloud values at a place, which cloud fields each model's files hold (it also checks the code's table is still true), and a save size estimate. Nothing loads until a button is tapped.

## What to try after it is integrated
1. Open `/data-viewer.html`. "Check map files" should show HRDPS, RDPS and GDPS with `cloud_cover` only, ECMWF with all four, each marked "yes" under "Matches the code". "Estimate" shows sizes per layer.
2. "Load clouds" shows the hourly cloud table for the four models. (It failed on Nov 22 only because the shared daily limit was spent; try on a fresh day.)
3. The old save box and saved list still work exactly as before; they are not yet replaced (see "Not done").

## Files
- **Own files changed:** `core/offline/save-plan.ts` (+ test), `core/offline/saved-area.ts` (+ test, version 3), `app/offline/engine.ts` (+ test), `app/offline/saved-areas.ts` (the save takes a span, an outline, a tile list, cancel; the old call is unchanged), `adapters/openmeteo-maps/clouds.ts` (+ test), `data-viewer.html`, `app/data-viewer/**`, `docs/handoffs/data/`.
- **Shared files changed** (the lead's), and why:
  - `core/vocabulary.ts`: four new names, all in %: `cloud_cover`, `cloud_cover_low`, `cloud_cover_mid`, `cloud_cover_high`. Needs the lead's approval as the connection point.
  - `vite.config.ts`: one line adding `data-viewer.html` to the build, so the page exists in the built app and the previews.
- **New files no section owns yet:** none. Everything is under paths `docs/sections/sections.json` already gives to Data (`data-viewer.html`, `app/data-viewer/**`, `app/offline/**`, `core/offline/**`, `adapters/openmeteo-maps/**`).

## Connection points
- **Used:** `layers`' `saveNeeds` (to know which values each layer saves); the model chain HRDPS, RDPS, GDPS.
- **Changed or added:** `core/offline/save-request.ts` is unchanged (the types the other chats build against). The new engine is `app/offline/engine.ts`; the app hands it what it needs once, with `configureSaveEngine({ runs, chain, layers, cells, tilesForShape, storedBytes, basemap, style, afterChange })`. The lead wires `startSave` to the Notification Centre.
- **Needs from other sections:**
  - **Maps:** `tilesForShape(shape, minZoom, maxZoom)` from `core/geo/shape-tiles.ts` (not in `main` yet). The engine takes it as `env.tilesForShape`, so wire it in `configureSaveEngine`. Until then the engine has no cut-to-outline map.
  - **Interface:** the card calls `layerTimeRange`, `estimateSave`, `startSave`, `listSaved`, `deleteSaved` from `app/offline/engine.ts`.
  - **Effects:** use the cloud names above; say which of low/mid/high they need over the map (only ECMWF gives all three over a map view; for the Canadian models they can use total cloud on the map and the three layers at the pin).

## Checks
`npm run check:section -- data`: every check passed (area, typecheck, lint, 332 unit tests, build, 4 browser tests on recorded weather, including the saved-area offline test).
New tests: `core/offline/save-plan.test.ts` (16), `app/offline/engine.test.ts` (7), `adapters/openmeteo-maps/clouds.test.ts` (3), and a version-1-and-2-records-still-read test in `core/offline/saved-area.test.ts`.

## Kaden's rules added or changed
None (docs/wishes/data.md is still empty).

## Decisions made, and anything unsure
- A save with layers on different models saves every model any of them needs (so one layer on HRDPS and one on "auto" saves the whole chain). Slightly more than strictly needed; the record keeps each layer's model.
- Radar, avalanche and air quality can be ticked in the engine (they carry their own data span, size and note through `EngineLayer.own`), but **no code saves them yet**: they stay "kept automatically / source does not allow saving", as before.
- Map and terrain size in `estimateSave` counts the stored base map tiles for the outline plus terrain at 140 kB a tile (zoom 0 to 12); the old estimate used a per-zoom table. Check against a real save once the outline tiles exist.
- The weather is saved for the outline's bounding box (Kaden, Nov 22).

## Data, sources and terms
- No new source or server. The point forecast and map files are the existing ones. Cloud values come under the same Open-Meteo terms (CC BY 4.0, free for non-commercial use, shared daily limit; the daily limit was spent on Nov 22 from this address).
- Please copy into `docs/05-data-sources.md`: the cloud availability table above, and that cloud base and top are not offered by any model.

## Not done yet
- **Cloud numbers in a recorded weather day.** The recorder drives the app through layers and there is no cloud layer yet; and the free limit was spent. Plan: once the Effects chat names what it needs, add a recording step (or a plain fixture file) with cloud values at a grid of points over the North Shore.
- **Removing the old save box** (`app/offline/save-mode.ts`), the old saved list and leftover "saved data only" code: after the new flow works (the lead removes the wiring in `app/main.ts`).
- Saving radar, avalanche and air quality data (above).
- **Ski hill data** (lifts, runs, lodges): not fetched. `overpass-api.de` is allowed but resets the connection from this machine; waiting for Kaden's OK on the mirror `overpass.kumi.systems`.
- Winter satellite picture; the rest of the world; the summary-window recorded set (covering the longer models) the lead asked about.
