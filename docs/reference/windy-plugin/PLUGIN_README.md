# Windy-Plugin-SurfaceTemp

A private [Windy.com](https://www.windy.com) plugin that adds a **terrain-corrected temperature layer** for backcountry ski touring in British Columbia.

Windy's own temperature layers use the forecast model's smoothed terrain, so they're wrong in steep mountains. This plugin works out the temperature at the **true ground elevation of every pixel**, using TopoSCALE downscaling (Fiddes & Gruber 2014).

## Products

- **Temperature**: air temperature at ground level.
- **Feels like**: Environment Canada wind chill, using the free-air (pressure-level) wind at the ground elevation.
- **Freezing line**: the 0 °C contour at ground level, with no colour fill.

Every product shows the freezing line as a black contour, labelled with its elevation in your Windy units. The ground elevation where the line runs is the freezing level there.

Tap the map for values at a point: ground elevation, temperature, feels-like, wind and freezing level.

## How it follows Windy

The plugin has no settings of its own for things Windy already controls.

- **Model:** whichever model is selected in Windy. If that model has no pressure-level data for the area, the panel says so; it never switches to another model.
- **Time:** follows Windy's timeline. Data is shown only where the selected model really has it. HRDPS stops after 48 h, and Windy's ECMWF tail added to it is cut off. ECMWF and GFS stop after about 7 days.
- **Units:** temperature, wind and elevation use your Windy unit settings, and update live.

## Method

1. Fetch pressure-level profiles (height, temperature, wind at 14 levels) from Windy's point-forecast API on a coarse grid of at most 5×5 nodes. The nodes snap to a fixed lattice, so small pans reuse cached data.
2. Bilinearly interpolate the **profiles** between nodes, and linearly between 3-hourly forecast steps.
3. Read temperature and wind from the interpolated profile at the pixel's DEM elevation.

Final temperatures are never interpolated between nodes.

**Terrain:** AWS Terrain Tiles (Terrarium). In BC these come from NRCan's Canadian Digital Elevation Model.

**Caching:** forecasts are cached per model + model run + node, and DEM tiles per tile. Changing the time, product or units makes no new requests.

**Smooth panning:** the layer renders a 30% margin around the screen, so pans within it need no redraw. While the map is moving, data for a new area starts loading as soon as the screen leaves the rendered margin.

### Known limitations

- **Valley cold pools:** under winter high pressure, valley bottoms can read 5–15 °C too warm. This is deliberately not corrected.
- **Valleys far below the model's terrain:** for example, Golden sits at 800 m inside an ECMWF grid cell whose ground is at 1565 m. The pressure levels there are underground in the model and are the model's own extrapolation, which can read far too warm.

## Code layout

| File | Purpose |
|---|---|
| `src/toposcale.ts` | The method: pure maths, unit-tested |
| `src/providers.ts` | `ForecastProvider` and `TerrainProvider` interfaces |
| `src/windyForecast.ts` | Forecast source: Windy point-forecast API, cached by model run |
| `src/terrarium.ts` | Terrain source: AWS Terrarium DEM tiles |
| `src/layer.ts` | Builds the raster and draws it on the map |
| `src/plugin.svelte` | Panel UI and wiring to Windy's store and events |

## Publishing and installing

1. In GitHub: **Actions → publish-plugin → Run workflow**, then pick the branch. This needs the `WINDY_API_KEY` repository secret.
2. When it finishes, open the run's log, expand **Publish Plugin**, and copy the plugin URL (`https://windy-plugins.com/.../plugin.min.js`).
3. In Windy, go to **Menu → Install Windy plugins → Load plugin directly from URL**, and paste the URL.

Bump `version` in `src/pluginConfig.ts` before each publish. Windy needs a higher version number for every release.

## Development

```bash
npm install
npm test        # unit tests for the method
npm run build   # dist/plugin.min.js
npm start       # dev server at https://localhost:9999/plugin.js (Windy developer mode, needs login)
```
