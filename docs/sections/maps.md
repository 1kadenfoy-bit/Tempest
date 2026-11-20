# Section brief: Maps

The map itself and the information printed on it: the base map, terrain,
place names, and how the map moves and feels.

Read `docs/sections/README.md` first. It covers the loop with Kaden, recorded
weather, the live view, the checks and the handoff.

## What you own

The exact list is `maps` in `docs/sections/sections.json`.

| Area | Files |
| --- | --- |
| Creating the map, its padding, the pin's start, locate, the map panel | `app/map/setup.ts` |
| Base map style and colours (Protomaps, OpenStreetMap) | `app/map/style.ts` |
| Reading the base map pieces, overzoom, byte-range reads | `app/map/basemap-router.ts`, `overzoom.ts`, `range-source.ts`, `maplibre.ts` |
| Terrain: hillshade, contours, 3D terrain and buildings, the compass | `app/map/terrain.ts`, `terrain-source.ts`, `three-d.ts`, `elevation.ts` |
| Place search and names | `app/search/`, `core/search/`, `adapters/bc-geonames/` |
| The map pieces: regions, detail areas, cutting tools | `tools/build-basemap.mjs`, `tools/regions.json`, `tools/pmtiles-extract.mjs`, `tools/lib/`, `core/basemap/`, `core/pmtiles/` |
| Browser tests | `e2e/3d.spec.ts`, `e2e/search.spec.ts` |

Not yours, though they sit in `app/map/`:
- the freezing line, wind field and radar pictures (Weather on the map);
- the map panel's look (`app/shell/map-panel.ts`, Interface). You decide what
  its switches do.

## Connection points

- **The stacking order** (what draws under what) is in the `load` handler of
  `app/main.ts`, the lead's file. Weather fills sit under the hillshade and
  contours, and lines and labels sit on top.
  - Need a new level, such as trails over the weather or effects over the
    terrain? Say so in the handoff.
  - While iterating you may change it on your branch, if you say so in the
    handoff.
- **Terrain heights** (`app/map/elevation.ts`) feed the temperature and wind
  fills. Keep their meaning and units the same, or note the change.
- **Colours** come from `design/tokens.json` (`app/theme/tokens.ts` reads
  them). New colours are Kaden's call.

## Ideas waiting

Most need a design or decision from Kaden first.
- Trails, huts, peaks and ski runs on the map (routes and trails are in
  `docs/04-milestones.md`).
- Finer terrain near busy areas: Mapterhorn zoom 15, or lidar.
- How the map feels: gestures, zoom limits, tilt, labels.
- Offline map pieces for saved areas, shared with Data.

## Rules for this section

- **Base map sources stay free and open,** with attribution: Protomaps and
  OpenStreetMap, and Mapterhorn for terrain. Check licences before adding any
  source.
- **Keep the map pieces small.** The published site has a 1 GB limit, and the
  base map already takes about 680 MB. Measure before adding pieces.
- **Test on recorded weather.** The base map pieces in `public/tiles` come from
  `npm run tiles`.
