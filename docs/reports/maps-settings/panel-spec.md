# Map panel: buttons and what they call (for the Interface chat)

Kaden's layout (Nov 20, 2026). The Maps chat built what each button does; the
panel only shows the buttons and calls these. Everything is in `app/map/`.

## 1. View
- **2D | 3D** (one two-way switch). Already built: it is the existing 3D terrain
  switch (`S.prefs.terrain3d` and `S.threeD.apply`). In 3D the map opens tilted.
  3D buildings stay a small option under it.

## 2. Ground (one of two, tiles)
- **Terrain** and **Satellite**: `mapSettings.set({ ground: 'shaded' | 'satellite' })` ('shaded' is the Terrain tile).
  Terrain is the default: terrain colours plus hillshade. Plain is gone (an old saved 'plain' is read as Terrain; the type still allows it until the panel stops mentioning it).
- **Satellite**: not offered yet. It needs an imagery source Kaden has not approved.
  Show the tile only when it works (`docs` rule: a switch appears only when it works).
- **Sun and shadows** (a toggle beside the tiles): `mapSun.setEnabled(on)` or
  `mapSettings.set({ sun: on })`. The sun follows the time scrubber. It lights the
  hillshade from the real sun and darkens the map at night. It works on both Terrain and Satellite.

## 3. Overlays (toggles; each may open a small options row)
All through `mapSettings.set({...})` (`app/map/map-settings.ts`):

| Button | Setting | Options row |
| --- | --- | --- |
| Trails, huts and campsites | `trails`, `huts`, `camps` | trail names (`trailNames`) |
| Peaks | `peaks` | heights (`peakHeights`) |
| Contour lines | `contours` | |
| Small roads | `smallRoads` | forest roads and other minor roads |
| Ski resorts | `skiLifts` | lifts only for now; runs need new data |
| Boundaries | `parkBoundaries`, `regionBoundaries`, `municipalBoundaries` | parks, provincial and regional, municipal |
| Weather stations | already the panel's stations switch | (Weather chat's layer) |
| Rain/snow line | Weather chat's line | (Weather chat's layer) |
| Freezing line | Weather chat's line | (Weather chat's layer) |

Defaults (`DEFAULT_MAP_SETTINGS`): trails, huts, campsites, peaks, contours, small
roads, regional and municipal boundaries on; ski lifts, park outlines and sun off.
`mapSettings.get()` returns the current values and `mapSettings.onChange` lets the
panel follow them. Saving them between sessions is the panel's (preferences are
the Interface chat's).

Until the panel is wired, a link can set them for testing:
`?map=ground:satellite,trails:off,sun:on`.

## Not the Maps chat's
- The rain/snow line and freezing line should hold still when zooming, like contour
  lines: ask the Weather chat to calculate them on a fixed ground grid, not for the
  current view.
