# Maps: the game look, terrain from real BC data, satellite, shadows, offline drawing

Nov 26, 2026 · branch `claude/tempest-maps` · ready to integrate

## READ THIS FIRST: what must be kept when combining

Everything below was built with Kaden over Nov 20 to 26 and he likes it ("the map
has come along way and looks like how I want it"). When the lead merges, **keep all
of it**. The ten things most likely to be lost or overwritten in a conflict:

1. **Zones and glaciers are one tile file now.** `public/zones/terrain.pmtiles`
   (4.6 MB), read by `app/map/terrain-tiles.ts`. The old `public/zones/terrain-zones.json`,
   `public/zones/glaciers.json` and `app/map/glaciers.ts` are **deleted on purpose**:
   they cost 12 MB at every start and ran an iPhone out of memory. Do not bring them
   back. `ZONES_MAXZOOM = 11` stays in `app/map/style.ts` (your memory fix).
2. **Your memory fix in `app/map/setup.ts` is kept**: `pixelRatio` capped at 2 and
   `maxTileCacheZoomLevels: 2`. I added `maxPitch: 80` (the sky needs a steep tilt)
   and the `registerWaterImages(map)` call.
3. **Game-style lighting** (`app/map/look.ts`): warm lit slopes, cool blue-violet
   shadows, a second overhead light. The terrain hillshade, the sun switch and the
   satellite all take their colours from it.
4. **Sun and shadows** (`app/map/sun.ts`, `sky` in `atmosphere.ts`, `shadows.ts`,
   `shadow-mask.ts`): the sun switch sets the map to the time on the scrubber; night
   is dark but readable; by day, mountains cast real shadows. `sun.ts` uses
   `S.cursor?.subscribe` (the phone test page has no cursor; that was your fix).
5. **Sky and haze in 3D** (`app/map/atmosphere.ts`): sky, horizon and fog follow the
   sun's height.
6. **Water** (`app/map/water.ts`): sun-bright blue, ripples, sparkles, shore foam.
   Still at rest, nothing animates.
7. **Terrain colours from real data** (`app/map/terrain-colours.ts`, `style.ts`):
   eight types; the BC government's biogeoclimatic zones give forest, treeline
   (parkland) and alpine; urban is one colour; natural edges are feathered and
   rounded; glaciers are the BC outlines. List: `docs/reports/maps-terrain/terrain-colours.md`.
8. **Map settings** (`app/map/map-settings.ts`): Ground is `'shaded'` (Terrain) or
   `'satellite'`; **Plain is removed** (an old saved `'plain'` reads as Terrain).
   Overlay switches (trails, huts, camps, peaks, contours, small roads, ski lifts,
   boundaries) are applied here. The Interface chat's Map panel calls
   `mapSettings.set(...)` and `mapSun.setEnabled(...)`; do not rename them.
9. **Satellite** (`app/map/satellite.ts`): reads the Data chat's `public/satellite/`
   files, enlarges the nearest picture past the deepest one (no blank ground), reads
   its base from `VITE_SATELLITE_BASE` when set.
10. **Peaks with heights, trails, huts, campsites, trail names, tap-to-snap pin**
    (`app/map/places.ts`, uses `public/places/places.json` and the base map's own
    points). The click in `app/main.ts` already calls `namedPlaceAt` from there
    (merged in PR #19; keep it).

## What changed (things Kaden can try)

- **Look:** the game's look on both ground choices: soft sun, tinted shadows,
  contrast, a hazy sky when tilted in 3D, glinting water with foam.
- **Sun and shadows toggle:** drag the scrubber. At 3 am the map is dusk-blue and
  readable; by day it casts mountain shadows in the sun's direction.
- **Terrain:** forest, treeline and alpine from the BC government's official zones
  (North Shore, Sea to Sky and Kootenay Pass only so far; elsewhere the ground is
  plain, as Kaden's rule 7 says). Glaciers from the BC outlines for all of BC.
  Lakes are blue. Roads are 30% narrower.
- **Peaks** from zoom 10 with heights under the names; trails and huts with names;
  campsites; ski lifts; park outlines.
- **Tune panel (temporary):** a "Tune" button on the map page. Overlays off, weather
  layers off, satellite, sun and shadows, and sliders for haze (0.85), relief (1.2),
  shadow tint (0.55), mountain shadows (0.65) and bloom (0.65). Those are Kaden's
  chosen defaults. It is **temporary on purpose** (rule 21): one file, `app/map/tuner.ts`,
  one call in `setupMapControls()`. Kaden decides when it goes. Until then **keep it**.
- **Bloom:** a soft glow, taken from the map's own picture after each drawn frame.
- **Offline drawing tool** (for the "Save for offline" card, `docs/plans/offline-save.md`):
  `startDrawing(map)` and `showShape(map, shape)` in `app/map/draw-shape.ts`;
  `tilesForShape` and the trace clean-up in `core/geo/shape-tiles.ts`. One finger
  draws, two pan and zoom, the map flattens to 2D while drawing and the tilt comes
  back. Nothing calls it yet; `window.tempestDraw` is a temporary test hook
  (set in `setup.ts`) for the Interface chat to remove once the card calls it.

## What to try after it is integrated

1. Open the app at the North Shore, zoom 11 to 13: green forest, yellow-green
   treeline, grey-tan alpine, blue glaciers and lakes.
2. Open the Map panel, turn Sun and shadows on, drag the scrubber through a day.
3. Tilt back in 3D as far as it goes: sky and haze.
4. Choose Satellite (the panel tile may still say "Soon"; `?map=ground:satellite`
   works), zoom to Cypress for the sharp part and elsewhere for the soft part.
5. Tap beside a peak name or trail name: the pin snaps to it.
6. Tune button: move the sliders.

## Files

- **Own files changed:** `app/map/**` (new: `atmosphere.ts`, `draw-shape.ts`,
  `look.ts`, `shadow-mask.ts`, `shadows.ts`, `style-mix.ts`, `terrain-colours.ts`,
  `terrain-tiles.ts`, `tuner.ts`, `tuning.ts`, `water.ts`, `layer-ids.ts`,
  `map-settings.ts`, `satellite.ts`, `places.ts`; deleted: `glaciers.ts`), `core/geo/shape-tiles.ts`
  and its test, `tools/build-zones.mjs`, `tools/build-glaciers.mjs`,
  `tools/build-terrain-tiles.mjs`, `tools/lib/mvt.mjs`, `tools/lib/geometry.mjs`,
  `docs/wishes/maps.md`, `docs/reports/maps-*/**`.
- **Shared files changed** (the lead's): none beyond what is already in main.
- **New files no section owns yet.** Please add to `sections.json` under Maps:
  `public/zones/**`, `public/places/**`, `tools/build-zones.mjs`,
  `tools/build-glaciers.mjs`, `tools/build-terrain-tiles.mjs`.

## Connection points

- **Used:** the stacking order in the `load` handler of `app/main.ts` (unchanged;
  the new layers are added inside `addTerrain` and the style, under the weather
  fills); the one time cursor (`S.cursor`); `S.settings.theme()`; `S.prefs`.
- **Changed or added:** `mapSettings`, `mapSun`, `tuning` (new, shared with the
  panel); a new vector source `terrain-tiles` (replaces `terrain-zones` and
  `bc-glaciers`); `window.tempestDraw` (test hook); the map's sky (`map.setSky`).
- **Needs from other sections:**
  - **Interface:** 3D by default is still off (`terrain3d: true` in `app/shell/prefs.ts`);
    enable the Satellite tile; connect the Water switch to my water look if Kaden
    wants it (`water.ts`); the credits screen needs the BC zones, BC glaciers,
    satellite (EOX, CC BY-NC-SA 4.0) and peaks entries; remove the Tune button
    when Kaden says.
  - **Weather:** rain/snow and freezing lines should hold still when zooming.
  - **Lead:** add `VITE_SATELLITE_BASE=/Tempest/satellite/` next to
    `VITE_TILES_BASE` in the preview build step of `pages.yml`, so section previews
    read the satellite from the main site (the publish removes each preview's copy).
  - **Data:** `tilesForShape` is ready for the saving engine.

## Checks

`npm run check:section -- maps`, run in a clean copy of the committed branch (the working
copy holds 25 redrawn pictures under `docs/reports/` that a full test run rewrote; they
are other sections' and are not committed, and they would fail the area check):
**every check passed**: area OK, typecheck, lint, 325 unit tests, and the section's
browser tests on recorded weather (search 2, 3D terrain, 3D buildings: 4 passed, 1
skipped: the 3D frame-time report, skipped on CI).
- New tests: `core/geo/shape-tiles` 11, `shadow-mask` 4, `style` 3, `map-settings` (ground choice).
- Open question: an earlier full `npx playwright test` gave 4 failures in other sections'
  tests (air quality ECCC, radar frame count, two in the forecast summary). They look
  unrelated (a clock or loading difference), but I could not run them on a clean `main`
  to prove it. The lead's full run will show.

## Kaden's rules added or changed

All in `docs/wishes/maps.md` (read it; it wins over this list): 1 to 23. New or
changed since the last handoff: 3, 4 (pending), 5, 6, 9, 10, 11, 12, 14 to 23.
**Rule 4 ("almost cartoonish") is unresolved:** Kaden has not said whether the
Terrain colours should soften toward the game's natural palette. Do not change it
until he answers.

## Decisions made, and anything unsure

- Terrain colours (hues) are my proposals; Kaden likes the look but has not signed
  off each hue.
- Zones exist only for three regions; BC-wide is a bigger download I did not do.
- Glacier outlines are the province's and may be older than today's ice.
- Satellite is about 100 m per pixel in most of BC (6 m at Cypress and Seymour), so
  it is soft up close.
- **Kaden reported a faint white pulse while panning.** I changed the bloom to copy
  every frame (best guess), but he has not confirmed it is fixed. His quick test:
  set Bloom to 0 in the Tune panel and pan.
- Nothing measured on a real phone. Software tests: water added about 8 to 17 ms a
  frame, bloom and shadows cost more; check on the phone test page.

## Data, sources and terms

- **BC biogeoclimatic zones and Freshwater Atlas glaciers**: DataBC, public WFS at
  `openmaps.gov.bc.ca` (already reachable). Licence assumed Open Government Licence -
  British Columbia, attribution "Province of British Columbia". **Not confirmed**: the
  data catalogue is blocked from here. Build once, ship as `terrain.pmtiles`; the app
  never calls the government server. Rebuild: `node --experimental-strip-types tools/build-terrain-tiles.mjs`.
- **Peaks and huts file**: cut from the Protomaps base map at build time (`tools/lib/peaks.mjs`).
- **Satellite**: EOX Sentinel-2 cloudless, built by the Data chat. CC BY-NC-SA 4.0
  (non-commercial; fine for Kaden's personal app). Needs the network; not for offline
  yet.
- No new server for the app at run time.

## Not done yet

- BC-wide terrain zones; peaks and huts file for all of BC.
- Cliffs from slope steepness; contour interval choice; slope and aspect shading.
- Ski runs (only lifts); true cast shadows exist, but only from zoom 9 and while the
  sun switch is on.
- Moving water waves (kept still on purpose).
- 3D by default (waits on Interface).
