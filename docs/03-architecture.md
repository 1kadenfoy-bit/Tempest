# Tempest: architecture and technical spec

> **Amended Nov 15, 2026 for the Claude Code handoff.** The body below is the original research-based spec. Where it disagrees with these notes or with `docs/06-decisions-and-open-items.md`, the notes win.
>
> - The app is called Tempest. The interface is Template v8 (`docs/02-design-spec.md`), not the earlier concept canvas.
> - Build order is in `docs/04-milestones.md`. The two "Build order" sections below are background only.
> - Layer order: Precipitation, Temperature, Wind first. Cloud and Radar next, then Avalanche, Air quality, Sun, Marine and a Forecast layer, each when designed.
> - Colour scales are continuous ramps coloured on the device (`design/tokens.json`). Only avalanche danger is stepped.
> - Time control: one scrubber for all layers, with one window control that sets the chart span and the week-strip box.
> - Starter drawing library: last seen as npm package `@openmeteo/weather-map-layer` with an `om://` MapLibre protocol. Check its current README before use.
> - Library versions and unconfirmed facts must be rechecked; see the facts list in `docs/06-decisions-and-open-items.md`.

2026-11-14 · Kaden Foy

A TypeScript web app on MapLibre, wrapped with Capacitor, reading free open data (Open-Meteo and ECCC first) through adapters into a small set of standard shapes that every layer reads from one on-device store, live or offline.

## Stack at a glance

Kaden left the stack to Claude; these are the research picks, all free for personal use.

| Part | Pick | Runner-up | Why |
| --- | --- | --- | --- |
| App | TypeScript web app, wrapped with Capacitor for iOS and Android | Tauri 2, then React Native | The open weather-rendering tools are all JavaScript; one codebase serves phone, browser and desktop; Claude Code can run and check it in a browser |
| First install on iOS | Home-screen web app (PWA) | Native build with a paid Apple developer account | Avoids the yearly fee while prototyping |
| Map engine | MapLibre GL JS | MapLibre Native | Custom protocols read PMTiles and weather files; hillshade and 3D terrain built in |
| Base map | Protomaps (OpenStreetMap) as PMTiles | CanVec vectors | Free daily builds; any area can be cut out |
| Terrain | Mapterhorn terrain PMTiles; contours drawn on the device with maplibre-contour | NRCan HRDEM and LidarBC lidar for regular zones | One terrain file serves hillshade, contours and 3D |
| Forecast data | Open-Meteo | Raw GRIB from ECCC and ECMWF, processed on a home server | About 49 models, ensembles, history, gridded map files |
| Canada-only data | ECCC GeoMet, OGC API and Datamart | None needed | Radar, alerts, smoke, rivers, stations |
| Weather drawing | Open-Meteo weather-map-layer to start; the app's own GPU grid renderer early | WeatherLayers GL | The starter library is young and GPL-2.0; saved areas need a renderer that reads local files |
| Core logic | A plain TypeScript package with no interface code | None | Reused later by desktop and a Garmin companion |
| Garmin, later | A small Connect IQ widget or glance fed by the phone | None | Watch memory is tight; no maps on the watch |

The main risk in this stack is drawing speed inside a phone WebView; it is the first spike.

## System design

*(Diagram not carried over. In words: sources, adapters, the five standard shapes, the on-device store, the resolver, layers, screen. Saving an area writes into the same store.)*

Read it top to bottom. Every source passes through an adapter into one of five standard shapes, the shapes fill one store on the phone, and the resolver reads from that store before the network. Map tiles skip the middle and go straight to the map engine. Saving an area runs the same fetch path and pins the result.

| Feature | What it does |
| --- | --- |
| Standard shapes and vocabulary | Map tiles, grid field, point series, feature set, image; SI units, UTC, plain latitude and longitude, amounts stored per step |
| Resolver with fallback | Picks the best source for a layer, place and time, and falls back when one is missing or stale |
| One fetch-and-cache path | Keyed by model run, so a new run replaces the old one and nothing is fetched twice |
| Transforms | Derived values computed once: terrain-adjusted temperature, probability, rain/snow line |
| One layer template | Drawing, legend, tap-to-read, summary and time behaviour, the same for every layer |
| One shared state | One time cursor and one selection for the whole screen |
| Numbers sent to the GPU | The phone colours raw values, so legends and units change without new downloads |
| Saved areas fill the same store | Offline is not a second code path; the reader cannot tell live from saved data |

## Data contract

A new source reaches every layer that can use it when three things exist: a fixed set of data shapes, a shared vocabulary of variables, and a resolver that picks a source for each request. Grafana works the same way: [data-source plugins turn every backend into one data frame](https://grafana.com/docs/grafana/latest/fundamentals/dashboards-overview/) and panels only read that.

### Five shapes

| Shape | Holds | Fed by | Drawn by |
| --- | --- | --- | --- |
| Map tiles | Vector tiles and terrain tiles | Base map, terrain, trails, roads | The map engine directly |
| Grid field | Values on a latitude and longitude grid, per time and height | Weather and wave models, analyses | One shared grid renderer |
| Point series | Values over time at one place | Tap readouts, stations, tides | Panels and small charts |
| Feature set | Shapes with properties (GeoJSON) | Avalanche regions, fires, alerts, closures | The map engine, styled by the layer |
| Image | Pictures drawn by the provider | Radar, smoke, lightning from GeoMet | An image overlay with fixed colours |

Every value carries the same label: source, model, run time, valid time, units, grid spacing, licence and attribution, time fetched, and whether it may be stored offline.

### The vocabulary

Each variable has one name, one unit and one meaning inside the app. Adapters convert into it; nothing downstream converts again except for display.

| Name | Unit | Meaning the app fixes |
| --- | --- | --- |
| precipitation | mm per step | The amount within the step, never a running total |
| temperature | °C at 2 m | Travels with the model's own ground height |
| temperature profile | °C at set heights | The input to terrain correction |
| wind | m/s, east and north parts | At 10 m; ridge-height wind is a separate entry |
| snowfall | cm per step | The model's own figure where it supplies one |

Inside the app everything is SI units, UTC and plain latitude and longitude. Display units and themes are applied only at the screen.

### The resolver

A layer never names a provider. It asks for "precipitation, this box, these times", and the resolver answers from a catalogue in which each source declares:

- the variables and heights it carries

- the area it covers and its grid spacing

- its time range, time step and latest run

- whether it may be stored offline

It uses the chosen model where it covers the request, falls back along a set chain (HRDPS, then RDPS, then a global model) and marks the seam on screen. It answers from the on-device store first and the network second.

### What adding a source costs

| Case | Work | Layer code changed |
| --- | --- | --- |
| Another model from a provider already used | One catalogue entry | None |
| A new provider | One adapter plus its catalogue entries | None |
| A new kind of data, such as waves | New vocabulary entries, usually a new layer | None in existing layers |
| A one-off source, such as avalanche forecasts | One adapter; the resolver has a single candidate | Its own layer only |

A new model appears in the source menu of every layer whose needs it meets. A derived layer lists it only if it supplies the inputs: terrain-corrected temperature needs a temperature profile.

### Transforms

Transforms take shapes in and give shapes out: temperature at terrain height from a profile and the terrain, probability from ensemble members, the rain/snow line from freezing level and terrain. They are written against the vocabulary, so each works with any source that supplies its inputs. Lesson carried over from the Windy plugin: interpolate the profiles, apply terrain per pixel, never interpolate finished temperatures.

### Protocol adapters

Nearly every source speaks one of six protocols: Open-Meteo's API, OGC WMS, OGC API Features or WFS, ArcGIS REST, a plain GeoJSON or CSV file, or ERDDAP. Written once, these make most new Canadian sources a few lines of configuration: an address, a layer name, a field mapping.

## Layers

Every layer is one folder that fills the same template; the shell does the rest. A layer that needs more may add its own panel or drawing mode, such as wind particles or a radar loop.

### The layer template

| Piece | What it is | Precipitation example |
| --- | --- | --- |
| Needs | The variables it asks the resolver for | Precipitation, snowfall, freezing level |
| Drawing | Fill or overlay, with its colour scale | A fill coloured by rate, with a second scale for snow |
| Legend | Scale and units, from the central formatter | mm/h and cm/h |
| Readout | The value at a tapped point and time | 2.4 cm/h, falling as snow |
| Summary | A calculation over the series at that point | Fell in the last 24 hours, due in the next 24, rain or snow by hour |
| Time behaviour | Forecast, observed, static, or both with a seam | Analysis behind "now", forecast ahead |
| Offline | What it adds to a saved area, or online only | Its grids for that area |

**Stacking rule:** one fill layer at a time, any number of overlays. **Colours:** continuous ramps where lightness carries the order, coloured on the device; only avalanche danger stays stepped; official avalanche and alert colours stay as issued.

### Time and animation

- **One time cursor for the whole app.** Each layer shows its nearest real step and says which step that is.

- **Each layer reports its range.** The scrubber spans a week; beyond the chosen model's last hour it greys out and the cursor stops. Long-range models scroll past the week.

- **Past and future are stitched.** Analysis and radar sit behind "now", forecast ahead; the seam is drawn and both sources are named.

- **Blend for the eye, not the numbers.** While dragging, the picture blends two model steps on the GPU. Readouts only use real steps.

- **Never mix model runs silently.** A newer run replaces the whole set.

- **Animation comes in two kinds.** Playing through time reuses the blend on a timer. Motion within one moment, like wind particles, draws continuously; it is off by default and pauses when the app is hidden.

Both techniques are proven: [WeatherLayers GL](https://docs.weatherlayers.com/weatherlayers-gl/layers/data-properties) blends two data images with one weight, and the [original WebGL wind map](https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f) keeps particle positions in a texture.

### Build order

*Superseded by `docs/04-milestones.md`; kept as background.*

| Order | Layer | Data | What the app computes |
| --- | --- | --- | --- |
| 1 | Precipitation (rate, totals, rain vs snow) | HRDPS, then RDPS and ECMWF beyond 48 h | Colour ramp, time scrubbing, running totals |
| 2 | Temperature at terrain height | HRDPS surface and pressure-level temperatures; terrain | Downscaling to the terrain |
| 3 | Temperature probability | Ensembles: ECMWF ENS, GEPS | Percentiles and chance of crossing a threshold |
| 4 | Rain/snow line | Freezing level and snowfall height; terrain | Each pixel's elevation against the snow line |
| 5 | New snow over 24, 48, 72 h | Model snowfall or precipitation | Snow-to-liquid ratio |
| 6 | Wind and gusts | 10 m wind, plus pressure-level wind for ridge height | Arrows first, particles later |
| 7 | Radar | ECCC radar composite, rain and snow | Nothing; online only; show radar coverage so gaps don't read as dry |
| 8 | Cloud, UV, feels-like | Open-Meteo variables | Wind chill and humidex |
| 9 | Smoke and air quality | ECCC RAQDPS PM2.5 (10 km, 72 h); AQHI | Nothing; online only |
| 10 | Past weather | HRDPA precipitation analysis; snow stations | Totals over the last 1 to 7 days |
| Then | Avalanche | Avalanche Canada forecast areas and products | Colour each region by today's highest rating; tap for bands, problems, expiry, link |

### Algorithms

- **Temperature on real terrain.** 1: interpolate the model's pressure-level temperatures to each pixel's true elevation (the TopoSCALE step from the Windy plugin; handles inversions). 2: fixed lapse rate of 6.5 °C per km as fallback. 3: Open-Meteo's elevation adjustment, points only.

- **Rain or snow.** Use the model's snowfall and freezing level first. If classifying, a wet-bulb threshold of 0.5 °C measured 93.1% accurate against 93.7% for machine learning; draw a mixed band from 0 to 4 °C, not a hard line.

- **Snow amount.** Ship model snowfall first; then Kuchera, which sets the ratio from the warmest temperature in the column. Real ratios run about 3:1 to 100:1, so show a range.

- **Probability.** Add each ensemble member's departure from the ensemble mean to the terrain-corrected high-resolution value, giving 10th, 50th and 90th percentiles. Also show model spread. Label it raw ensemble spread until calibrated against stations.

- **Model limits to show.** HRDPS under-forecast precipitation on 83% of winter precipitation days in a Fernie study, so treat its snowfall as a floor and keep the model name on every layer.

- **UV.** From Open-Meteo, with a note that UV rises with altitude and snow reflects it.

**Feels-like** uses the Canadian indices so numbers match ECCC: wind chill when cold, humidex when hot. T is air temperature in °C, v is wind at 10 m in km/h, Td is dew point in °C. Checked: -20 °C at 5 km/h gives -24; 30 °C with a 15 °C dew point gives 34.

```latex
\text{wind chill} = 13.12 + 0.6215\,T - 11.37\,v^{0.16} + 0.3965\,T\,v^{0.16}
```

```latex
\text{humidex} = T + 0.5555\left(6.11\,e^{\,5417.753\left(\frac{1}{273.16} - \frac{1}{273.15 + T_d}\right)} - 10\right)
```

### Route maths

All route stats are computed on the phone from the line and the terrain: distance from great-circle segments after resampling every 10 to 30 m; gain and loss counting only climbs above a 3 to 5 m threshold; grade per segment; slope angle and aspect from each 3 by 3 terrain neighbourhood, shaded at 30, 35, 40 and 45 degrees. Hiking time uses Tobler, with Naismith as fallback; touring time uses Munter. Speed v in km/h, slope s as rise over run; time t in hours, distance d in km, climb c in metres, rate r about 4 uphill and about 10 skiing down.

```latex
v = 6\,e^{-3.5\,\left|\,s + 0.05\,\right|}
```

```latex
t = \frac{d + c/100}{r}
```

Slope shading limits: a single 10 m cell can be off by about 4 degrees; BC's open terrain is mostly 30 m, so short steep rolls under-read; shading shows start zones, not runouts; loaded slopes are steeper than the bare ground. Print the terrain resolution on the layer and never present shading as safe.

## Offline saved areas

A saved area is a planned download into the same store the live app reads, so layers never know whether their data is live or saved. It changes the build order, not the architecture.

### How a save works

1.  **Pick.** Draw an area on the map, tick the layers, choose a time window.

2.  **Plan.** The planner asks each chosen layer what it needs and the resolver which source covers it, as the live app would, and shows the total size first.

3.  **Download.** Requests run through the normal adapters into the store, with progress per layer. An interrupted save resumes.

4.  **Pin.** Entries are marked as belonging to the saved area so cache clean-up leaves them alone.

5.  **Use.** With no signal, the resolver finds everything in the store; drawing, readouts, summaries and scrubbing work unchanged.

6.  **Expire.** After the window, the weather is flagged expired and offered for deletion; map and terrain stay until the area is removed.

### What a saved area holds

| Part | Size | Ages |
| --- | --- | --- |
| Base map and terrain, to a chosen zoom | Most of the download; each extra zoom level roughly doubles it | No |
| Weather grids per chosen layer and time step | Small: about 0.6 MB per variable for 48 hours over 200 by 200 km | Yes; frozen at the saved model run |
| Inputs for derived layers, such as temperature profiles and model ground height | Small | Yes |
| One-off feeds: avalanche bulletin, alerts, fire perimeters | Kilobytes | Yes, quickly; each keeps its issue and expiry time |
| Manifest: area, zoom, layers, model runs, save time, window, sizes, format version | Tiny | No |

### Rules

- **One read path.** No layer has its own offline mode.

- **Each layer declares what it needs saved; each source declares whether saving is allowed.** ECCC's map service prohibits bulk tile retrieval, so radar drawn from it is online only; the save screen greys it out and says why.

- **Tap readouts come from the saved grids,** so they work offline.

- **A saved forecast is a snapshot.** The scrubber shows its model run and age, and places "now" from the phone's clock.

- **Refresh, not re-download.** Back in signal, one tap updates the weather to the newest run; map and terrain are left alone.

- **Stale is shown, never hidden.** Expired bulletins and old forecasts stay readable under a clear "expired" label.

- **A manual "saved data only" switch,** because weak signal hangs requests and drains the battery.

- **Downloads run with the app open,** matching the no-background rule, and resume if interrupted.

- **Model range is honoured at save time.** A window past HRDPS's 48 hours is filled by the fallback chain, and the area records which model covers which hours.

- **Overlapping areas duplicate map tiles at first;** sharing them can come later if storage becomes a problem.

Still to check: Avalanche Canada's terms on keeping bulletins offline, whether the starter library can draw from saved partial files, and real sizes for a typical area.

## Speed, storage and battery

The app runs fast when three rules hold: fetch only the bytes the screen needs, keep them as numbers, and let the GPU do every per-pixel job.

### Speed

| Stage | Technique | Effect |
| --- | --- | --- |
| Fetch | Partial reads of chunked files, by area, variable and time step | Viewing one valley never downloads a grid for all of Canada |
| Fetch | Coarser data when zoomed out | A country-wide view reads a coarse level |
| Decode | Compact binary values, not JSON | Smaller downloads, near-instant parsing |
| Decode | Background workers | Decoding and regridding never freeze the map |
| Draw | Values go to the GPU as a texture; the colour scale is a small lookup strip | Changing units, theme or colours fetches nothing |
| Draw | Scrubbing blends two textures | No network and no per-pixel code while dragging |
| Draw | Per-pixel maths in the shader | Terrain-corrected temperature per screen pixel from coarse profiles |
| Cache | GPU memory, then device files, then network, keyed by model run | Models update a few times a day, so most opens need no download |
| Idle | Redraw only when something changes | The map costs almost nothing while you look at it |

A region's whole time stack fits in memory: 48 hourly steps of one variable over 200 by 200 km of HRDPS is about 0.6 MB. Holding it makes scrubbing instant and a tap a simple lookup.

The starter library, Open-Meteo's [weather-map-layer](https://github.com/open-meteo/weather-map-layer), builds tiles in a background worker and shares decoded data with it through a browser feature that needs cross-origin isolation headers; without them each tile request copies the whole variable and blocks the main thread. Whether a phone WebView can supply those headers is the first thing to test. The library draws single time steps only, with no blending or particles, so keep drawing behind one seam and build the app's own GPU grid renderer early.

Suggested targets on the phone: 60 frames a second panning with one weather fill; scrubbing that follows the finger; a tap readout under 0.1 s; switching layer or model under 0.5 s when cached, 1 to 2 s when not.

### Storage

| Data | Format | Read by |
| --- | --- | --- |
| Base map, terrain, trails, roads | PMTiles, one file per region | Byte ranges, through a custom map protocol |
| Weather grids for saved and regular regions | One small binary file per variable and model run, all time steps | Loaded whole into memory |
| Weather grids while browsing elsewhere | The provider's own chunked files | Partial reads, short-lived cache |
| Avalanche regions, alerts, fires, closures | GeoJSON | Loaded whole |
| Very large feature sets, such as every trail in BC | Vector tiles in PMTiles, built once on a computer | By tile |
| Station records and tapped-point series | Compact arrays | By key |
| The index: what is cached, run times, expiry, saved areas | A JSON manifest to start; SQLite if it outgrows that | Looked up on open |

Where it lives on the phone, ranked: native app files for map files and grids (needs a file plugin that reads byte ranges); native SQLite for the index later; the browser's private file system (OPFS) for the browser prototype and desktop; IndexedDB only for a cache you can lose, because [the OS can reclaim WebView storage when space runs low](https://capacitorjs.com/docs/v6/guides/storage); preferences for settings only.

Retrieval rules: one key for everything (source, model, run, variable, height, valid time, region or tile), shared by file names, memory entries and requests; expiry follows the next model run; keep the latest run per model plus saved areas, evicting the rest oldest-first under a size cap; one store interface (get, put, has, delete, list) backed by OPFS in the browser and native files on the phone; a format version in every manifest.

### Battery

- No background location, refresh or push. GPS runs only while the map is on screen and locate-me is on.

- Fetch on open or on demand and cache per model run; Open-Meteo's model-status endpoint does not count against call limits.

- Only visible layers fetch, and a layer's code loads the first time it is switched on.

- Continuous animation is the main drain: optional, and paused when the app is hidden.

- Test on the real phone: map idle 10 minutes, then GPS on 10 minutes, then read the battery stats.

## Modularity

The app is modular along three seams, data sources, layers and saved areas, and plain everywhere else. Modules are folders compiled into the app and listed in one registry file; there is no plugin system, because there are no third-party developers.

### What it buys and what it costs

- **A new layer is a new folder,** so layer twelve costs about what layer three did.

- **Providers are swappable.** If Open-Meteo changes or disappears, only its adapter is rewritten; a future home server is one more adapter.

- **The GPL drawing library sits behind one seam** and can be replaced without touching layers.

- **Failures stay local.** One provider down shows its layers as unavailable; the rest keep working.

- **Policy lives with the source:** refresh interval, offline permission, licence, attribution and special terms, from which the credits screen is generated.

- **Cost: contracts written before real layers exist are usually wrong.** Martin Fowler's [case against building ahead](https://www.martinfowler.com/bliki/Yagni.html) puts the odds that a guessed feature is wrong at two in three or worse. So extract, don't predict.

### When to modularise what

| When | Do | Leave for later |
| --- | --- | --- |
| Prototype, days 1 to 2 | A folder per layer. Units and theme in one place. All network calls through one cached fetch function. | Interfaces and registries |
| After the second layer works | Extract the layer contract and data shapes from the two real layers; add the registry file | Anything plugin-like |
| After the third source | Extract the source adapter and the protocol adapters | A general query language |
| Weeks 3 and 4 | Transforms, saved-area contributions, contract tests | Nothing further |
| Never, for a personal app | None | Run-time plugins, sandboxing, a public plugin interface, configuration for everything |

### A sketch to argue with

```ts
interface SourceAdapter<Query, Shape> {
  id: string; licence: string; attribution: string; offline: boolean;
  fetch(q: Query): Promise<Shape>;
  cacheKey(q: Query): string;            // includes the model run time
}
interface Layer {
  id: string; title: string;
  kind: 'fill' | 'overlay';
  time: 'forecast' | 'observed' | 'static';
  needs: DataRequest[];
  draw(map: MapContext, data: Shape[]): Disposable;
  legend(units: Units, theme: Theme): Legend;
  readout?(point: LngLat, time: Date): Readout;
  pack?(bbox: BBox): PackContribution;
}
```

### Working with Claude Code

- **Layers never import each other.** Shared needs go through core services: elevation at a point, the time index, region lookups.

- **One renderer for all grid layers,** passing typed arrays without copying, with heavy maths in a worker.

- **A template beats a description.** One finished reference layer plus a short "how to add a layer" note.

- **Contract tests.** For each adapter, a saved real response and the normalised output expected from it.

- **Guard against over-building.** Put a rule in CLAUDE.md: no interface without two real implementations.

- **Small modules with fixtures** can be built and checked one at a time in a browser.

## Decide early, safe to defer

Eight decisions harden as the project grows, because every later file is written against them. Everything else can change cheaply.

| Rank | Decision | Why it hardens | Recommendation |
| --- | --- | --- | --- |
| 1 | The vocabulary: names, units, time and grid conventions | Every adapter, transform, layer, cache entry and saved file encodes it | A one-page spec before the second layer: SI units, UTC, valid time plus run time, amounts per step, plain latitude and longitude |
| 2 | Identity: the cache key and the label on every value | It ends up in file names, saved areas and links | Source, model, run, variable, height, valid time, region |
| 3 | One read path for live and saved data | An offline path inside each layer would double every layer | Layers read only the store; saving only fills and pins it |
| 4 | One shared renderer on MapLibre, drawing from numbers | Every layer is written against it | Must draw from stored data alone; first library behind a seam |
| 5 | No server required | A required backend later changes fetching, offline and cost at once | Public sources alone; a home server is an optional extra source |
| 6 | One state and one time cursor | Interface, scrubbing and links hang on it | View, time, layers, model, units and theme in one object, flowing one way to the screen |
| 7 | The store interface and a versioned save format | Files on a phone outlive the code that wrote them | A format version in every manifest from the first saved area |
| 8 | A core with no interface code | Pulling logic out of screens later is slow | A separate folder from day one that never imports interface code |

Two standing rules: safety data is shown exactly as issued, and the GPL licence position is settled before the app is shared.

**Safe to defer:** colour scales, screen layout, which models to offer, the storage engine behind the store interface, Capacitor or Tauri as the wrapper, a home server, SQLite, and the exact layer contract.

### Issues to design for

1.  **The same variable means different things in different models:** running totals versus per step, 1, 3 or 6 hour steps, 1 to 25 km grids, each with its own ground height. The vocabulary fixes these.

2.  **Not every source can feed every layer.** Sources declare what they carry, and the source menu lists only those that fit.

3.  **Past and future come from different products,** so the scrubber has a visible seam at now.

4.  **Map and tap must agree.** Draw and read from the same data, or the number under a finger can contradict the colour.

5.  **Grids differ.** Convert each to plain latitude and longitude at the adapter.

6.  **Independent layers slow the map** unless they share one renderer and the stacking rule.

7.  **A template can flatten everything,** so a layer may add its own panel or drawing mode.

## Spikes, risks and build order

Nine short tests settle most of the uncertainty before real building starts.

### Spikes

1.  **Open-Meteo map files.** Confirm HRDPS is offered as its own model and that partial reads work in a phone WebView.

2.  **Phone performance.** Capacitor, MapLibre, a local PMTiles file, hillshade and one weather raster, on Kaden's phone.

3.  **Download sizes.** `pmtiles extract --dry-run` for the Sea to Sky and one Kootenay region, base map and terrain.

4.  **Avalanche Canada.** Read the Terms of Use and Data Sharing Policy, then email about personal use, ATES data and keeping bulletins offline.

5.  **Coverage.** Overpass queries for hiking routes and `piste:type=skitour` in the usual areas.

6.  **Probability prototype.** For three known spots: downscaled HRDPS plus ensemble departures, compared with nearby station records.

7.  **Security headers in the phone WebView.** Does the weather library's fast path work inside Capacitor, and how slow is the fallback?

8.  **A region file end to end.** Cut one variable for one region into one file, load it, scrub it, tap for a series.

9.  **Byte-range reads from native storage.** Open a PMTiles file of realistic size from app files without loading it whole.

### Risks

| Risk | Detail | Mitigation |
| --- | --- | --- |
| Open-Meteo is free with no guarantee | Its map-data address changed more than once in 2026, and [third-party apps broke](https://github.com/thesurfrapp/maps/pull/5) when the old one went dark in September | Cache every response, keep fetching behind adapters, keep ECCC as a fallback; self-hosting possible later |
| GPL-2.0 on the weather-map-layer library | Sharing the app with friends may oblige sharing the source; not legal advice | Keep the repository open, or replace the renderer before sharing |
| HRDPS under-forecasts mountain precipitation | Treat snowfall as a floor | Show model names; offer a second model alongside |
| Safety data read as the app's opinion | Avalanche and fire data are official products | Show them as issued, with source, issue time and a link |
| Slope shading over-trusted | Coarse terrain under-reads steep rolls | Label terrain resolution; never present shading as safe |
| iOS distribution cost | A lasting native build normally needs a paid developer account | Start as a home-screen web app |
| WebView drawing speed | Heavy layers may stutter | Spike 2 decides; one shared GPU renderer |

### Build order

*Superseded by `docs/04-milestones.md`; kept as background.*

1.  The vocabulary spec and the store interface.

2.  One model through one adapter into the grid shape, drawn as precipitation, in the browser, on a topo map with hillshade, contours and locate-me for one BC region.

3.  The same layer drawn from a saved per-region file with the network off.

4.  A second layer, temperature, then extract the shared layer contract, including what each layer needs saved.

5.  A second source, then the resolver and the source menu.

6.  Time: the single cursor, the past and future seam, then blending.

7.  Capacitor build on the phone, data-age stamps.

8.  The save-area flow: planner, size estimate, progress, list of saved areas.

9.  Temperature probability, then the rain/snow line.

10. The first one-off feed, avalanche; then radar and alerts; draw-a-route with stats; OpenStreetMap trails.

## Sources

Related documents: Weather app: project brief, Weather app: data sources and models reference, the Template v8 design (`docs/02-design-spec.md`), the full research report Personal weather app: component research and rankings, and the first architecture write-up Weather app architecture: system design and early decisions.

Pages read in full: [Open-Meteo weather-map-layer README](https://github.com/open-meteo/weather-map-layer), [Open-Meteo pricing](https://open-meteo.com/en/pricing), [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api).

Read as search excerpts only, so check before relying on a detail:

- [Grafana: dashboards overview](https://grafana.com/docs/grafana/latest/fundamentals/dashboards-overview/)

- [Martin Fowler: Yagni](https://www.martinfowler.com/bliki/Yagni.html)

- [WeatherLayers GL: data properties](https://docs.weatherlayers.com/weatherlayers-gl/layers/data-properties)

- [Mapbox: How I built a wind map with WebGL](https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f)

- [Cloud-Optimized Geospatial Formats Guide](https://guide.cloudnativegeo.org/overview.html)

- [Capacitor: data storage](https://capacitorjs.com/docs/v6/guides/storage)

- [MDN: origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)

- [ECCC MSC open data usage policy](https://eccc-msc.github.io/open-data/usage-policy/readme_en)

- [Open-Meteo map-data change breaking a third-party app](https://github.com/thesurfrapp/maps/pull/5)

The architecture itself (the resolver, per-region weather files, the early-decision ranking and the speed targets) is engineering judgement, not a sourced finding. Algorithm sources are in the research report.
