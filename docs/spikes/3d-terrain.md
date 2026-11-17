# Spike: 3D terrain and 3D buildings

Nov 17, 2026. **Answered in the test browser. Phone check still to do.**

Kaden asked: "I want to be able to look at elevation of mountains etc in 3D. It could also be cool to have that for buildings." The design spec puts **3D terrain** in the map panel's TERRAIN group (`design/v8/png/02-MapLayers.png`); 3D buildings has no v8 board, so it is a second tile of the same kind next to it.

## What I checked

| Thing | Version / date | Where I looked |
| --- | --- | --- |
| MapLibre GL JS | 6.18.0, released 2026-11-11, the current `latest` on npm (checked Nov 17) | `node_modules/maplibre-gl/dist/maplibre-gl.d.ts`, `src/webgl/draw/draw_custom.ts`, `src/webgl/render_to_texture.ts`, `src/render/terrain.ts` |
| maplibre-contour | 0.1.1 | already used for hillshade and contours |
| @protomaps/basemaps | 5.7.2 | base map style layers |
| Base map tiles | Protomaps daily build 20261116, cut by `tools/build-basemap.mjs` | `public/tiles/basemap.json` and the stored tiles, decoded tile by tile |

Facts from the installed MapLibre (not from memory):

- `map.setTerrain({ source, exaggeration })` with a `raster-dem` source; `getTerrain()` returns it or null. Default `maxPitch` is 60°.
- Fill, line, raster, hillshade and background layers are drawn into textures that are laid over the terrain ("draped"). Custom layers are not, unless they implement **`renderToTerrainTile(gl, { tileID, width, height })`** and **`terrainTileRevision`**, both marked `@experimental` in 6.18.0. MapLibre then calls the layer once per terrain tile, with clip space (-1, -1) at the tile's south-west corner and (1, 1) at its north-east, and drapes the result in style order with the layers around it. It keeps the draped tile until `terrainTileRevision` changes.
- Draped tiles are 1024 × 1024 pixels (terrain tile size 512 × quality factor 2).
- When a draped layer changes, MapLibre redraws the changed tiles a few per frame (two per frame measured below), not all at once.
- MapLibre warns when hillshade and 3D terrain share one source, so 3D terrain has its own source over the same tiles (nothing extra is downloaded: maplibre-contour's shared protocol serves both).

## Weather fills in 3D: options

The three fills are custom WebGL layers that draw on the flat map plane. With terrain on they would sit under the mountains or show through them.

| Option | What it takes | Picture |
| --- | --- | --- |
| 1. Drape the fill: draw it into each terrain tile (`renderToTerrainTile`) | Each layer's draw takes a matrix: the camera's for the flat map, a tile's for terrain. About 30 lines per layer plus a 30-line helper | Correct: the fill lies on the slopes, in the same order as the hillshade and contours, and the freezing and snow lines lie on it |
| 2. Own 3D mesh: displace a grid of vertices by elevation in the shader | A tessellated mesh per layer, matching MapLibre's terrain exactly (same tiles, same exaggeration, same level of detail), depth sharing with the terrain | Hard to get exactly on the surface: gaps or z-fighting at tile and detail edges. Much more code |
| 3. Hide the fill in 3D (or show it only flat) | A visibility rule | Honest, but 3D loses the point of the app |

**Chosen: option 1.** It gives the correct picture with the least code, uses MapLibre's own terrain so nothing can drift, and stays inside `render/grid-gl/` (the rendering seam). Values still reach the GPU as numbers and are coloured from the lookup strips, exactly as on the flat map: the same shader runs, only the matrix differs.

The risk is the word *experimental*. If a later MapLibre changes or removes it, the change is contained in `render/grid-gl/terrain-drape.ts` and the three `renderToTerrainTile` methods; the fallback is option 3.

One change in 3D: **no cross-fade between hours on terrain.** A fade redraws every draped tile on every frame for a fifth of a second, and MapLibre redraws them a few per frame anyway, so the fade would arrive patchy and cost the most. Hours change at once in 3D. Readouts never used the blend.

## Measured (headless Chromium, software graphics)

This machine has no graphics chip (SwiftShader), so these times say how much work there is, not how fast a phone is. The temperature fill (the heaviest shader: a profile per pixel) over Mt Seymour, zoom 11.6, 390 × 844 at device pixel ratio 2. Each fill draw was timed to completion (a one-pixel read before and after, because `gl.finish` alone does not wait in Chromium).

| Case | Frame, median | Fill drawing per frame | One fill draw | Fill draws per frame |
| --- | --- | --- | --- | --- |
| Flat, camera turning | 250 ms | 87 ms | 85 ms (whole screen) | 1 |
| Flat, fill changing each frame | 222 ms | 90 ms | 89 ms | 1 |
| 3D 55°, camera turning | 1,681 ms | 668 ms | 215 ms (one 1024² tile) | 3.4 |
| 3D 55°, fill changing each frame | 1,143 ms | 477 ms | 233 ms | 2 |

What it means:

- **One draped tile costs about the same as one flat-screen draw** (1.05 million pixels against 1.3 million on this screen; the shader per pixel is identical).
- **When nothing changes, the draped fill costs nothing per frame.** Turning or tilting the camera over tiles already drawn reuses them. The 3.4 draws per frame while turning here come from the app refreshing the fill during the move (twice a second, which on this slow machine is every frame) and from new tiles coming into view.
- **When the hour or the view's data changes**, MapLibre redraws about two tiles a frame until all are done: roughly twice a flat frame's fill work, for the few frames it takes. On a phone that drew the flat fill at 60 fps (spike 2), this should stay smooth, but it has to be checked on the phone.
- Terrain itself, without a fill, is light (frames of about 40–60 ms here when no fill tiles were being redrawn).

Re-run: `TEMPEST_3D_MEASURE=1 PW_PORT=… npx playwright test e2e/3d.spec.ts -g report` (needs the forecast map files; prints `3D-MEASURE {…}`).

## Other things on the map in 3D

- **Pin**: a MapLibre marker, which sits on the terrain by itself. Looks right.
- **Freezing line and snow line**: GeoJSON lines, draped. They follow the slopes (see `docs/reports/3d/terrain-3d.png`).
- **Hillshade, contours, saved-area outlines**: draped by MapLibre.
- **Wind flow (particles and arrows)**: a 2D canvas in screen pixels for a flat, north-up map. It would point the wrong way on a tilted or turned map, so **it waits while the map is tilted or turned** and comes back when the map is flat and north up again. The wind colour fill stays, draped. Not yet seen in a browser in 3D (needs the wind forecast).
- **Save this area**: the save box is drawn on a flat map, so opening it puts the map flat and north up first.

## Gestures and the way back

- Tilt and turn work only while 3D terrain or 3D buildings is on: two fingers up or down tilt (MapLibre's touch pitch), twisting turns. Maximum tilt 60° (MapLibre's default; more shows the horizon and needs many more tiles).
- Turning a switch on tilts the map to 55° so the change shows at once. Turning both off puts it flat and north up.
- A round button above the thumb buttons, shown only while the map is tilted or turned, carries a compass needle that points north; a tap brings the map back flat and north up. It is the existing 56 px thumb button with a new icon. No v8 board shows it, so it is the plainest version from existing parts.
- Exaggeration 1 (true height). BC's mountains need no help, and the temperature and snow colours stay where they really are to the eye.

## Buildings

The stored base map **does have buildings with heights**: the Protomaps `buildings` layer, with `height` and `min_height` in metres, from zoom 11. Decoded tiles:

| Tile | Buildings | With height |
| --- | --- | --- |
| Downtown Vancouver, zoom 13 (all of BC is stored to 13) | 27 | 22 |
| Downtown Vancouver, zoom 14 (Sea to Sky detail file) | 139 | 133 (51 with a base height) |
| North Vancouver, Lonsdale, zoom 15 (North Shore detail file) | 1,033 | 7 |
| Coal Harbour edge, zoom 15 | 60 | 23 |

So:

- Downtown Vancouver's towers have heights and look right at zoom 15–16 (`docs/reports/3d/buildings.png`), drawn from the zoom-14 detail tiles. Zoom 14 keeps only the larger buildings; small ones are missing there.
- Most houses have no height in OpenStreetMap; those are raised **6 m** (about two storeys), a stated default rather than data.
- Heights come in round numbers (10, 20 … m); Protomaps rounds them.
- Outside the detail areas only zoom 13 is stored, which holds only a few large buildings per tile, so 3D buildings show little there.
- The layer is a `fill-extrusion` from zoom 14, coloured from the ground and ink tokens (neutral, like the rest of the base map), under the labels.

**To have every building everywhere it matters**: zoom-15 tiles. Measured with `tools/pmtiles-extract.mjs --dry-run` on the 20261116 build: downtown Vancouver (-123.16, 49.26, -123.08, 49.30) is 1.8 MB at zoom 15; Metro Vancouver from the North Shore to the border (-123.27, 49.0, -122.5, 49.4) is 34.9 MB. These are whole tiles (roads, labels and all), the same kind of file as the North Shore detail. Adding one is a line in `tools/regions.json`.

The switch appears only when the base map's metadata lists building heights (it does for the current build).

## Consequence

- 3D terrain and 3D buildings are built as two switches in the TERRAIN group, off by default and remembered (`app/map/three-d.ts`, `render/grid-gl/terrain-drape.ts`).
- To check on the phone: smoothness while tilting and while scrubbing time in 3D with the temperature fill on; whether the phone gets warm.
