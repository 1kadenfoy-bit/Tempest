# Spike 3: download sizes

Nov 15, 2026.

## Question

How big are the base map and terrain for a saved area?

## What I tried

`tools/pmtiles-extract.mjs --dry-run`, which reads each archive's directory and adds up the tiles inside a box. The Go `pmtiles` command was not used: running a downloaded program was blocked in this session, and the JavaScript version does the same job. Real extract checked: 15 sample tiles were identical to the source byte for byte.

- Sea to Sky and North Shore: 123.40–122.70° W, 49.25–50.35° N (about 50 × 120 km)
- Kootenay (Kootenay Pass to Whitewater): 117.55–116.75° W, 49.00–49.70° N (about 58 × 78 km)
- Base map: Protomaps daily build of Nov 14, 2026 (its highest zoom is 15)
- Terrain: Mapterhorn `planet.pmtiles` (zoom 0–12) and its regional files for zoom 13 and up

## Result

| Part | Sea to Sky | Kootenay |
| --- | --- | --- |
| Base map to zoom 14 | 19.9 MB | 4.6 MB |
| Base map to zoom 15 | 39.7 MB | 8.4 MB |
| Terrain to zoom 12 | 30.7 MB | 21.2 MB |
| Terrain zoom 13 only | 72.5 MB | 53.9 MB |
| Terrain zoom 13 to 16 | 1,230 MB | 981 MB |

Each extra zoom level roughly doubles the base map. Terrain grows faster, because zooms 13 to 15 hold lidar-based detail in places (Mapterhorn now includes NRCan's 2 m "Canada DTM 2018–2024").

Weather grids are small by comparison (spike 8): 292 kB for 48 h of one variable over the Sea to Sky box.

## Consequence

- Saved-area recipe: **base map to zoom 14 plus terrain to zoom 12, about 50 MB for the Sea to Sky** and 26 MB for the Kootenay box, plus well under 1 MB per weather variable.
- Terrain at zoom 12 is about 12 m per pixel at this latitude. That is finer than the 30 m data covering most of BC, so hillshade and contours lose little. Slope shading later may want zoom 13 or lidar zones, at about 70 MB more per area.
- The app currently draws terrain from zoom 12 and stretches it beyond (`app/map/terrain.ts`).
- The Sea to Sky base map file (19.9 MB) fits under the 25 MiB per-file limit of the recommended host.
