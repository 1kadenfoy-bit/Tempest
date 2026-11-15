# Personal weather app: component research and rankings

Nov 13, 2026 · @Kaden Foy

## Summary

The app is buildable on free, open data. Open-Meteo supplies the forecasts, ECCC supplies the Canada-only data, and MapLibre draws it, wrapped as a web app so one codebase covers phone and desktop.

| Decision | Pick | Runner-up | Confidence |
| --- | --- | --- | --- |
| Forecast data | Open-Meteo (free for non-commercial use) | Raw GRIB from ECCC and ECMWF, processed on a home server | High |
| Models | HRDPS to 48 h, RDPS to day 3.5, then ECMWF IFS and GDPS | RRFS as a second high-resolution opinion | High for the Canadian models, medium for the rest |
| Probability | ECMWF ENS and GEPS through Open-Meteo's Ensemble API | ECCC's ready-made REPS probability layers | Medium |
| Canada-only data | ECCC GeoMet and its OGC API (radar, alerts, smoke, rivers) | None needed | High |
| Map engine | MapLibre GL JS | MapLibre Native | High |
| Base map and terrain | Protomaps and Mapterhorn as PMTiles, contours drawn on the device | NRCan HRDEM lidar where it exists | Medium until sizes are tested |
| Weather rendering | Open-Meteo's weather-map-layer to start | WeatherLayers GL or a hand-written shader | Medium; the library is young |
| App framework | TypeScript web app wrapped with Capacitor | Tauri 2, then React Native | Medium until tested on your phone |
| First layers | Precipitation, terrain-corrected temperature with probability, rain/snow line | Wind, radar | High |
| Avalanche | Avalanche Canada's API, shown unaltered | None | High; read their terms first |
| Hiking trails | OpenStreetMap, BC open data, your own GPX | None open | Medium; BC coverage not yet checked |
| Touring routes | Draw your own, plus Avalanche Canada's ATES areas | OpenStreetMap ski-tour tags | High that no open catalogue exists |
| Meteoblue and Windy APIs | Skip both | Meteoblue's free year, for comparison only | High |
| Canadian extras | Mountain station feeds, resource roads, lidar terrain for your regular zones, then lightning, evacuation orders and highway events | Wave and current models, for the paddling phase | High that they are open; some access details unchecked |
| Modularity | Static modules along three seams: data sources, layers, region packs. Contracts extracted after two real layers exist | A run-time plugin system | High |

Three things to test before committing: weather layers running smoothly in a phone WebView, real download sizes for your regions, and whether Open-Meteo's map files carry HRDPS as its own layer. The Open questions section lists them as spikes.

## Weather models

For BC mountains the working stack is HRDPS for the next 48 hours, RDPS to day 3.5, then ECMWF IFS and GDPS, with ensembles (ECMWF ENS, GEPS, REPS) supplying probabilities. All of these are free to use; the question is only how you fetch them (next section).

| Rank for BC | Model | Operator | Grid | Range | Runs | Strongest at |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [HRDPS Continental](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps-datamart_en) | ECCC | 2.5 km | 48 h | 4 per day | Short-range mountain weather. Avalanche Canada forecasters rate it the most accurate short-term option and the best match to mountain terrain. |
| 2 | [ECMWF IFS HRES](https://openmeteo.substack.com/p/ecmwf-transitions-to-open-data) | ECMWF | 9 km | 10 to 15 days | 4 per day | Medium range (days 3 to 10). Open since 1 Oct 2025 under CC BY 4.0. |
| 3 | [RDPS](https://avalanche.ca/blogs/gettingthemeteogram) | ECCC | 10 km | 84 h | 4 per day | Trend-spotting for days 2 to 3.5. Handles mountain terrain less well than HRDPS. |
| 4 | [RRFS](https://www.fox10tv.com/2026/11/06/noaa-retires-nam-weather-model-introduces-new-rrfs-forecasting-system/) | NOAA | 3 km | 18 h hourly, 84 h four times a day | Hourly | A second high-resolution opinion that covers Canada. New: operational 3 Nov 2026, replacing NAM. |
| 5 | [GDPS](https://avalanche.ca/blogs/gettingthemeteogram) | ECCC | 15 km | 10 days | 2 per day | Long-range planning; a cross-check on ECMWF. |
| 6 | [GFS](https://open-meteo.com/en/docs/gfs-api) | NOAA | 13 km | 16 days | 4 per day | Longest range; independent third global opinion. |
| 7 | [ICON Global](https://open-meteo.com/en/docs) | DWD | about 11 km | 7.5 days | Every 3 to 6 h | Another independent global cross-check. |
| 8 | [HRDPS West (experimental)](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps-datamart-alpha_en) | ECCC | 1 km | 48 h | 2 per day | Finest terrain detail over BC, but experimental and on a test server. |
| 9 | [HRRR](https://wherobots.com/discover/hrrr/) | NOAA | 3 km | 18 to 48 h | Hourly | Rapid updates, but a US domain; only useful near the border. |

### Ensembles (for probability layers)

| Rank | Ensemble | Members | Grid | Range | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | [ECMWF IFS ENS](https://open-meteo.com/en/docs/ensemble-api) | 51 | 25 km (open tier) | 15 days | Best general-purpose spread; every 6 h. |
| 2 | [REPS](https://eccc-msc.github.io/open-data/msc-data/nwp_reps/readme_reps_en) | 20 + control | 10 km | 3 days | Canada-focused. ECCC publishes ready-made probability and percentile grids. Not on Open-Meteo. |
| 3 | [GEPS (GEM ensemble)](https://open-meteo.com/en/docs/ensemble-api) | 21 | 25 km | 16 days | Canadian global ensemble; every 12 h. |
| 4 | [GFS ensemble](https://open-meteo.com/en/docs/ensemble-api) | 31 | 25 km | 10 days (35 at 50 km) | Every 6 h. |
| 5 | [RRFS/REFS](https://open-meteo.com/en/docs/ensemble-api) | 5 | 3 km | 2.5 days | The only convection-scale ensemble reaching Canada; few members. |
| 6 | [Google WeatherNext 2](https://open-meteo.com/en/docs/ensemble-api), ECMWF AIFS | 64 / 51 | 25 km | 15 days | AI ensembles; useful extra opinions, less proven in mountains. |

Three cautions that affect design:

- **HRDPS runs dry in the mountains.** A [Fernie study](https://arc.lib.montana.edu/snow-science/objects/ISSW2023_P1.06.pdf) found it under-forecast precipitation on 83% of winter precipitation days. Show the model name on every layer and treat snowfall totals as a floor.
- **Ensembles are coarse.** At 10 to 25 km they tell you how confident the forecast is, not what happens on a specific ridge. Pair their spread with a high-resolution model plus terrain downscaling (see Layers).
- **Rankings beyond the Canadian models are general guidance**, not a BC-specific verification. Your own model-comparison view will tell you more after a season.

## Weather data APIs

Open-Meteo is the first choice: it is free for a personal, non-commercial app, needs no key, and lets you pick almost every model above individually. ECCC's own services fill the Canada-only gaps (radar, alerts, smoke). Meteoblue and Windy are priced for businesses and do not fit a free budget.

| Rank | Source | Cost | What you get | Catches |
| --- | --- | --- | --- | --- |
| 1 | [Open-Meteo](https://open-meteo.com/en/pricing) | Free for non-commercial use: 600 calls/min, 5,000/hour, 10,000/day. Attribution (CC BY 4.0). | About 49 selectable models including HRDPS, RDPS, GDPS, ECMWF IFS 9 km, GFS, HRRR and ICON. Free tier also includes the Ensemble, Historical, Previous Runs, Air Quality, Elevation, Marine and Flood APIs. Gridded map files for MapLibre. | No uptime guarantee. No radar, alerts or REPS. |
| 2 | [ECCC MSC GeoMet and Datamart](https://eccc-msc.github.io/open-data/usage-policy/readme_en) | Free, anonymous. Attribution required. | Radar composite, precipitation type, radar extrapolation, weather alerts, REPS probability layers, AQHI, wildfire smoke, river levels, climate observations, plus HRDPS/RDPS/GDPS as map layers or raw GRIB2. | Bulk downloading of WMS tiles is prohibited, so GeoMet suits live viewing, not offline packs. Raw GRIB2 needs your own processing. |
| 3 | Direct from source ([ECMWF open data](https://www.ecmwf.int/node/29013), NOAA, Datamart GRIB2) | Free data; you pay in effort. | Full control, any variable, your own tiles and offline packs. | Needs an always-on machine to fetch and convert GRIB. A home server would do. Phase 2 at the earliest. |
| 4 | [Meteoblue](https://business.meteoblue.com/pricing) | Free Weather API: one year, 10 million credits. Then prepaid credits, or Premium API listed at EUR 2,400/year. Map tiles EUR 2,400/year. | Their own blended forecast, multimodel packages, and very good meteogram images. | A standard hourly 7-day call costs about 8,000 credits, so the free year is roughly 1,250 calls (3 to 4 per day). Prepaid credit prices are only shown in their shop. |
| 5 | [Windy API](https://api.windy.com/point-forecast/pricing) | Point Forecast EUR 990/year. [Map Forecast](https://api.windy.com/map-forecast/pricing) EUR 990/year, plus EUR 1,000 for ECMWF. | Windy's layers and models in an embeddable map. | The free tier is for development only and the free point forecast returns deliberately shuffled data. No ECMWF in point forecasts. |

On Meteoblue specifically, since it was your first preference: the free year is worth signing up for to see whether its forecast beats HRDPS for your spots, and its meteogram images are included in the free tier. But it cannot be the app's main data source at this budget, and it does not hand you raw model grids to draw your own layers.

**Recommendation:** Open-Meteo for point forecasts, model comparison, ensembles and gridded layers. GeoMet for radar, alerts and smoke while online. Revisit direct GRIB processing only if you hit a wall (REPS probabilities, HRDPS fields Open-Meteo does not carry, or offline packs).

## Map engine and base maps

MapLibre GL JS is the best fit, because almost every open weather-rendering tool plugs into it and the same map code runs on phone and desktop. The base map, terrain and contours can all be free, open and downloadable by region.

### Map engine

| Rank | Engine | Why | Catches |
| --- | --- | --- | --- |
| 1 | MapLibre GL JS (web, runs in a WebView on phones) | Free and open. Custom protocols let it read [PMTiles](https://github.com/maplibre/maplibre-agent-skills/blob/main/skills/maplibre-pmtiles-patterns/SKILL.md) and [Open-Meteo weather files](https://github.com/open-meteo/weather-map-layer) directly. Built-in hillshade and 3D terrain. | No built-in offline cache; its maintainer says to build that yourself through a [custom protocol](https://github.com/maplibre/maplibre-gl-js/discussions/6910). |
| 2 | MapLibre Native (via React Native, Flutter or Compose) | Native speed and [built-in offline region downloads](https://capawesome.io/blog/maplibre-vs-google-maps/). | The weather libraries below are JavaScript only, so Windy-style layers mean custom native rendering on each platform. |
| 3 | Mapbox SDKs | Polished, good docs. | Proprietary and usage-priced; no advantage here. |
| 4 | Leaflet or OpenLayers | Simple, and ECCC's own [tutorials](https://eccc-msc.github.io/open-data/usage/readme_en) use them for WMS layers. | Weaker vector styling, terrain and performance for a layered topo map. |

### Base map data

| Need | Pick | Notes |
| --- | --- | --- |
| Roads, trails, water, labels | [Protomaps basemap](https://docs.protomaps.com/basemaps/downloads) (OpenStreetMap as one PMTiles file) | Free daily builds. `pmtiles extract` cuts out any bounding box. You write the topo style (trail emphasis, peaks, contours). |
| Hillshade and 3D terrain | [Mapterhorn](https://protomaps.com/blog/mapterhorn-terrain/) terrain tiles | Open terrain as PMTiles, built on Copernicus 30 m globally with lidar where countries publish it. Also extractable by bounding box. |
| Contour lines | [maplibre-contour](https://github.com/maplibre/maplibre-agent-skills/issues/19) | Generates contours on the device from the same terrain tiles, so no separate contour download. |
| Better Canadian elevation | [NRCan MRDEM-30 and HRDEM](https://geo.ca/initiatives/national-elevation-data-strategy/) | MRDEM is 30 m nationwide. HRDEM is 1 to 2 m lidar where flown, and BC coverage is growing but patchy. |

One caution on terrain: in BC, Mapterhorn's detailed zoom levels are mostly the 30 m model stretched, with lidar in only a few places, according to [one developer's testing on Vancouver Island](https://github.com/TecnaGamer/BeamNG.Earth/pull/206). That is fine for hillshade and contours. It matters for slope-angle shading (see Route stats).

### How weather overlays get drawn

| Rank | Approach | What it is | Fit |
| --- | --- | --- | --- |
| 1 | [Open-Meteo weather-map-layer](https://github.com/open-meteo/weather-map-layer) | Reads Open-Meteo's gridded `.om` files straight from a public AWS bucket and renders coloured rasters, contours, arrows and value labels in MapLibre. Colour scales run on the device. | Fastest route to a prototype. Flagged by its authors as not yet production-ready, and licensed GPL-2.0. |
| 2 | [GeoMet WMS](https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en) image layers | ECCC renders the picture; you overlay it. | Right for radar, alerts and smoke. Online only, and ECCC's colours, not yours. |
| 3 | [WeatherLayers GL](https://github.com/weatherlayers/weatherlayers-gl) with your own data | A mature rendering library (raster, contour, particles, high/low) on deck.gl, open-sourced under MPL-2.0 in 2025. | Best long-term quality, but you must supply the data as images or grids. Phase 2. |
| 4 | Hand-written WebGL layer | Pack values into tiles and colour them in a shader, the way [Yr.no does](https://client.yr-maps.met.no/usage). | Full control; most work. |

For animated wind, the open options are [maplibre-gl-wind](https://github.com/geoql/maplibre-gl-wind) (MIT, on deck.gl), mapbox-exif-layer, and WeatherLayers GL's particle layer.

**Design rule that follows:** ship numbers to the device, not pictures. If each layer receives raw values and colours them locally, then themes, units, legends and tap-to-read-value all come for free.

## Offline and battery

An offline region is a small bundle of files saved to the phone's own storage, and battery stays low if the app never does anything while closed.

### What goes in a downloaded region

| Piece | Format | Size driver |
| --- | --- | --- |
| Base map | PMTiles extract of the Protomaps build | Area and max zoom. Each extra zoom level [roughly doubles the file](https://docs.protomaps.com/basemaps/downloads). |
| Terrain | PMTiles extract of Mapterhorn | Same; usually the largest piece. |
| Forecast snapshot | Gridded values for the region, per model run | Tiny. Estimate: a 200 x 200 km HRDPS window is 6,400 cells; 48 hours of 6 variables at 2 bytes each is under 4 MB. |
| Saved-spot forecasts | Open-Meteo JSON per spot and model | Kilobytes. |
| Safety and routes | Avalanche bulletin JSON and region outlines, alerts, your routes as GeoJSON | Kilobytes. |

Real map sizes for your regions are an open question. `pmtiles extract` has a `--dry-run` flag that [reports the size without downloading](https://til.simonwillison.net/gis/pmtiles), so this is a ten-minute test.

Practical points from people who have built this:

- **Store big files in native app storage**, not browser storage. The operating system can clear WebView storage, and one project needed [a custom reader to stop memory spikes](https://github.com/Open-Historia/open-historia/pull/969) when reading PMTiles inside Capacitor.
- **Download regions, not provinces.** A [MapLibre offline plugin's authors](https://github.com/makinacorpus/maplibre-offline-pmtiles) advise regional or district extracts for phones.
- **GeoMet cannot be your offline source.** Its policy [prohibits bulk tile retrieval](https://eccc-msc.github.io/open-data/usage-policy/readme_en), so radar and alerts are online-only unless you fetch raw data instead.
- **Stamp everything.** Every layer shows its source, model run and age, and an offline forecast greys out once it is stale.

### Battery rules

- No background location, background refresh or push. GPS runs only while the map is on screen and the locate button is on.
- Fetch on open or on demand, and cache per model run. HRDPS updates four times a day and the global models two to four times, so checking more often is wasted. Open-Meteo's model-status endpoint [does not count against call limits](https://open-meteo.com/en/docs/model-updates).
- Redraw the map only when something changes. Continuous animation (wind particles, radar loops) is the main drain, so make it optional and pause it when the app is hidden.
- Test on a real phone: map idle for 10 minutes, then GPS on for 10 minutes, and read the battery stats.

## App framework

Build it as a web app in TypeScript and wrap it with Capacitor for iOS and Android. The map and weather libraries that make a Windy-style app feasible are all JavaScript, and the same code is already the desktop version.

| Rank | Stack | Strengths | Weaknesses |
| --- | --- | --- | --- |
| 1 | Web app (TypeScript, MapLibre GL JS) + Capacitor | Uses every library in the previous section as-is. One codebase for phone, browser and desktop. Fast to iterate, because Claude Code can run and check it in a browser. The MapLibre GL JS maintainer [ships his own hiking app this way](https://github.com/maplibre/maplibre-gl-js/discussions/6910). | Rendering runs in the phone's WebView, so heavy layers need testing on a real device. Large-file storage needs care. |
| 2 | Tauri 2 | Also a web app in a native shell, with a lighter desktop build; listed among the few options that [target desktop and mobile together](https://www.youngju.dev/blog/culture/2026-05-14-desktop-app-frameworks-2026-tauri-electron-wails-compose-multiplatform-maui-flutter-comparison-deep-dive-2026.en). | Mobile side is younger than Capacitor. A sensible later choice for the desktop app. |
| 3 | React Native + MapLibre React Native | Native map performance and offline packs. | Custom weather rendering is hard; a desktop or web version needs a second map implementation. |
| 4 | Flutter + MapLibre | Good desktop story, smooth UI. | Same weather-layer problem, in a language (Dart) none of the weather tooling uses. |
| 5 | Fully native (Swift and Kotlin) | Best possible performance. | Two codebases; far more than a personal app needs. |

The usual knock on option 1 is that a WebView is slower than native for graphics-heavy apps. That is the main thing to prove or disprove in the first spike.

### Keeping desktop and Garmin open

- **Core as a plain TypeScript package.** Data clients, unit conversion, downscaling and route maths live in a module with no UI code. The phone app, a desktop app and anything else import it.
- **Desktop** is then the same web app in a browser tab or a Tauri window.
- **Garmin is a separate, small program.** Connect IQ apps are written in [Monkey C](https://developer.garmin.com/connect-iq/articles/connect-iq-basics/App_Types.html) with very tight memory (one developer cites [about 124 KB for a watch face](https://dev.to/samhartley_dev/i-built-a-custom-garmin-watch-face-with-live-stock-sparklines-heres-what-i-learned-129n)). A realistic target is a glance or widget that shows the forecast for your saved spots, fed by the phone through Garmin's [companion SDK](https://developer.garmin.com/connect-iq/core-topics/mobile-sdk-for-ios). No maps on the watch.

### Getting it onto phones

Android can install a build directly. On iOS, a native build that lasts and can be shared with friends normally needs a paid Apple developer account (from general knowledge, roughly USD 99 a year; check current terms). Installing the web app to the home screen as a PWA avoids that fee and is a good way to start.

## Layers

Start with precipitation and terrain-corrected temperature (your two picks), then add the rain/snow line. It reuses both and is the layer touring decisions hinge on.

### Build order

| Order | Layer | Data | What the app computes | Effort |
| --- | --- | --- | --- | --- |
| 1 | Precipitation (rate, totals, rain vs snow) | Open-Meteo gridded HRDPS, then RDPS and ECMWF beyond 48 h | Colour ramp, time slider, running totals | Low |
| 2 | Temperature at terrain height | HRDPS surface and pressure-level temperatures; terrain tiles | Downscaling to the terrain model | Medium |
| 3 | Temperature probability | [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api) (ECMWF ENS, GEPS) | Percentiles and chance of crossing a threshold | Medium to high |
| 4 | Rain/snow line | Freezing level and snowfall height (both in Open-Meteo); terrain tiles | Each pixel's elevation compared with the snow line | Medium |
| 5 | New snow over 24, 48, 72 h | Model snowfall or precipitation | Snow-to-liquid ratio | Low to medium |
| 6 | Wind and gusts | 10 m wind, plus pressure-level wind for ridge height | Arrows first, particles later | Medium |
| 7 | Radar | [GeoMet radar composite](https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en), rain and snow versions | Nothing; overlay ECCC's images | Low, online only |
| 8 | Cloud, UV, feels-like | Open-Meteo variables | Wind chill and humidex | Low |
| 9 | Smoke and air quality | ECCC [RAQDPS](https://eccc-msc.github.io/open-data/msc-data/nwp_raqdps/readme_raqdps_en) PM2.5 forecast (10 km, 72 h); AQHI | Nothing | Low, online only |
| 10 | Past weather | [HRDPA](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdpa/readme_hrdpa_en) precipitation analysis; snow stations | Totals over the last 1 to 7 days | Medium |

Radar has gaps in BC's mountains (general knowledge), so draw ECCC's radar coverage layer with it rather than letting blank areas read as dry.

### Algorithms, ranked per problem

**Temperature on real terrain.** An HRDPS cell is 2.5 km wide with a single elevation, so ridges read too warm and valleys too cold.

1. *Vertical-profile interpolation.* Read the model's temperatures on pressure levels with their heights and interpolate to each pixel's true elevation. It handles inversions. This is the temperature step of the TopoSCALE method from your Windy plugin, so the logic carries over.
2. *Fixed lapse rate* (6.5 C per km) from the model cell's elevation to the true elevation. Simple; wrong during inversions. Keep as the fallback.
3. *Open-Meteo's built-in elevation adjustment* for point forecasts. Free, but only for single points, not a map.

**Rain or snow.** Use the model's own snowfall and freezing level first. If you classify yourself, a wet-bulb temperature threshold of 0.5 C is the best simple rule: a [large 2025 study](https://communities.springernature.com/posts/when-big-data-isn-t-enough-the-challenge-of-rain-snow-partitioning) measured it at 93.1% accuracy, with machine learning reaching only 93.7%. Every method struggled between 0 and 4 C, so draw a mixed band, not a hard line.

**Snow depth from precipitation.** The 10:1 rule is crude; real ratios run from about [3:1 to 100:1](https://waterdesk.org/2026/05/machine-learning-snow-to-liquid-ratio/).

1. *Model snowfall as delivered.* Ship this first.
2. *Kuchera.* Sets the ratio from the warmest temperature in the air column, so it needs only a temperature profile. [Pivotal Weather](https://home.pivotalweather.com/guides/snowfall) calls it a first-order improvement over 10:1, and a [2026 comparison of ten methods](https://brian-filipiak-scholar.media.uconn.edu/wp-content/uploads/sites/3631/2026/08/Filipiak_WWE_2026.pdf) (US Northeast storms) ranked it among the two best.
3. *Cobb, Roebber and machine-learning methods.* More inputs, more work, and no clear winner: a [NOAA study](https://repository.library.noaa.gov/view/noaa/55878) found the choice of ratio matters as much as the choice of model. Show a range, not one number.

**Probability.** The chance of an event is the share of ensemble members in which it happens.

1. *Ensemble anomalies on a downscaled base.* Take each member's departure from the ensemble mean and add it to the terrain-corrected high-resolution value. That gives 10th, 50th and 90th percentiles and a chance of being above freezing at a real elevation.
2. *Model spread.* Show the disagreement between HRDPS, RDPS, ECMWF and GFS. Cheap, and honest about uncertainty.
3. *ECCC's ready-made REPS probability products* (10 km) as image layers.
4. *Statistical calibration* against station history. Raw ensembles tend to be overconfident (general knowledge), and this is the proper fix, but it is research-grade. Until then, label the layer "raw ensemble spread".

**Feels-like.** Use the Canadian indices so numbers match ECCC: wind chill when cold, humidex when hot ([background](https://ptaff.ca/humidex/?lang=en_CA)). T is air temperature in C, v is wind in km/h at 10 m, Td is dew point in C. Both formulas were checked against published examples (-20 C at 5 km/h gives -24; 30 C with a 15 C dew point gives 34).

```latex
\text{wind chill} = 13.12 + 0.6215\,T - 11.37\,v^{0.16} + 0.3965\,T\,v^{0.16}
```

```latex
\text{humidex} = T + 0.5555\left(6.11\,e^{\,5417.753\left(\frac{1}{273.16} - \frac{1}{273.15 + T_d}\right)} - 10\right)
```

**UV.** Take the UV index from Open-Meteo. As a rule of thumb (general knowledge), UV climbs roughly 10% per 1,000 m and snow reflects much of it back, so a simple altitude-and-snow note is worth more than extra precision.

### Past weather sources

| Source | What it gives | Access |
| --- | --- | --- |
| [HRDPA (CaPA)](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdpa/readme_hrdpa_en) | Best-estimate 6 h and 24 h precipitation at 2.5 km, blending gauges, radar and HRDPS | GeoMet layers; GRIB2 on Datamart |
| [BC Automated Snow Weather Stations](https://catalogue.data.gov.bc.ca/dataset/current-season-automated-snow-weather-station-data) | Hourly snow depth, snow water equivalent, temperature and precipitation at remote high-elevation sites | CSV files, near real time |
| [Avalanche Canada weather stations](https://avalanche.ca/api-docs) | Station list and measurements, last week by default | JSON API |
| ECCC observations | Real-time surface observations and hourly climate records | [OGC API collections](https://api.weather.gc.ca/collections) |
| Open-Meteo Historical and Previous Runs APIs | What each model said, and reanalysis back decades | Same API, free tier |

## Canadian safety data

Every source here is official and free. The app should show each one unaltered with its issue time, and never compute a danger rating of its own.

### Avalanche

| Rank | Source | What it gives | Catches |
| --- | --- | --- | --- |
| 1 | [Avalanche Canada API](https://avalanche.ca/api-docs) | Forecast-area outlines as GeoJSON, area metadata, every forecast product, and a lookup by latitude and longitude. Each product carries daily danger ratings for alpine, treeline and below treeline, avalanche problems, issue and expiry times, summaries, and terrain and travel advice. | The page links a Terms of Use and a Data Sharing Policy and states no rate limits. Read both and email info@avalanche.ca before relying on it. |
| 2 | [ATES-rated areas](https://avalanche.ca/news/maps-of-ates-rated-regions-available-for-download) (terrain ratings) | Simple, challenging and complex terrain zones, with access trails, avalanche paths and decision points for mapped areas, including the [Spearhead Traverse](https://avalanche.ca/news/ates-ratings-for-the-spearhead-traverse-in-whistler). | Downloaded one area at a time as KMZ from the Trip Planner, after a disclaimer. No bulk dataset, so this is a manual import for your regular areas. |
| 3 | [AutoATES v2.0](https://nhess.copernicus.org/articles/24/1779/2024/) | Open-source model that generates ATES-style maps from a terrain model and forest density. Validated against expert maps at Bow Summit and Connaught Creek. | Tuning its inputs per region is the stated hard part. A model output, never an official rating. Phase 3 at the earliest. |
| 4 | Mountain Information Network reports | Field observations from other users. | The endpoint is described as undocumented and subject to change, needs an API key, and is capped at 31 days per request. Ask before using. |

Layer design: colour each forecast region by its highest rating today. Tapping shows the three elevation bands, the problems, the expiry time and a link to the full bulletin. One subtlety: the bands are not fixed elevations, so matching a route to "treeline" needs a per-region treeline height that you set and label as approximate.

### Wildfire and smoke

| Source | What it gives | Access |
| --- | --- | --- |
| [BC Wildfire fire perimeters](https://open.canada.ca/data/dataset/cdfc2d7b-c046-4bf0-90ac-4897232619e1) and [fire locations](https://open.canada.ca/data/en/dataset/2790e3f7-6395-4230-8545-04efb5a18800) | Current-season perimeters and points, refreshed from operational systems every 15 minutes. Stated as reference only. | WMS, KML, shapefile, ArcGIS REST |
| [ECCC RAQDPS](https://www.canada.ca/en/environment-climate-change/services/air-quality-health-index/weather) | Wildfire-smoke PM2.5 forecast maps at 10 km for 72 hours. The older FireWork product has been folded into this system. | GeoMet layers; GRIB2 on Datamart |
| AQHI | Observed and forecast Air Quality Health Index by station | [OGC API](https://open.canada.ca/data/en/dataset/a563e47d-6eb9-4f7f-933c-222ae49fe57f) |
| [BC Parks API](https://open.canada.ca/data/en/dataset/fb1c834b-5a59-44f4-8ed9-6585e826f88d) | Open REST and GraphQL data on provincial parks | Check its endpoint list for advisories and closures (not checked) |

Evacuation orders, fire bans, national hotspots and lightning are in the Canadian and BC-specific data section.

### Weather alerts

ECCC's alerts are available as GeoJSON from the [weather-alerts collection](https://api.weather.gc.ca/collections/weather-alerts) of its OGC API, and as a map layer. The [GeoMet 3.0 release](https://comm.collab.science.gc.ca/mailman3/hyperkitty/list/dd_info@comm.collab.science.gc.ca/2026/2/) replaced the old experimental `ALERTS` layer with `Current-Alerts`, so use the new name. Fetch on open, cache, and show the fetch time.

### Water

| Need | Source | Notes |
| --- | --- | --- |
| River level and flow | [ECCC real-time hydrometric data](https://api.meteo.gc.ca/collections/?lang=en) | Over 2,100 stations, last 30 days, through the same OGC API. |
| Tides | [CHS water-level API](https://tides.gc.ca/en/web-services-offered-canadian-hydrographic-service) | Predictions, observations and forecasts for more than 700 stations. Requires accepting a licence agreement. |
| Tidal currents | Same API | Thin: [one analysis](https://runkelcorey.github.io/posts/2025-08-09-canadian-tidal-data/index.html) found current predictions at fewer than 10 stations nationally. |
| Marine wind and waves | Open-Meteo Marine API; ECCC marine forecasts (experimental collection) | Canadian wave and current models (RDWPS, CIOPS-West, SalishSeaCast) are in the Canadian and BC-specific data section. |

## Hiking trail sources

OpenStreetMap is the only source that is both open and broad, and it is the same raw material AllTrails starts from. What you cannot get openly is the curated layer on top: reviews, photos, popularity and written descriptions.

| Rank | Source | What you get | Catches |
| --- | --- | --- | --- |
| 1 | [OpenStreetMap](https://wiki.openstreetmap.org/wiki/Hiking) | Paths and tracks, named routes as `route=hiking` relations, and difficulty tags ([sac\_scale](https://wiki.openstreetmap.org/wiki/Key:sac_scale), trail\_visibility). Free under ODbL with attribution. Query live with Overpass or extract a region once. | Quality varies by area. Named-route and difficulty coverage in BC needs checking. |
| 2 | BC government open data | [Recreation Sites and Trails BC trail lines](https://app.geo.ca/en-ca/map-browser/record/7fcb21f7-e51c-4342-a5e1-445a6c42128e), the [BC Parks API](https://open.canada.ca/data/en/dataset/fb1c834b-5a59-44f4-8ed9-6585e826f88d), and regional park trail sets. | Authoritative, but uneven coverage and few attributes. |
| 3 | Your own GPX files | Routes you trust, from Garmin, Strava or friends. | Manual. |
| 4 | [Trailforks](https://www.trailforks.com/about/api) | A large community trail database. | API by approval only, and its page says access is not usually granted to individuals for personal projects. |
| 5 | AllTrails | The experience you want to match. | No public API, and its terms restrict automated access. A scraping project was [shut down at AllTrails' request](https://mcpservers.org/servers/srinath1510/alltrails_mcp_server) in January 2026. Do not build on it. |

AllTrails itself [documents](https://support.alltrails.com/hc/en-us/articles/360019246411) building its trail segments from OpenStreetMap ways (path, track, footway, steps, bridleway, cycleway) pulled through Overpass. So the geometry gap between you and AllTrails is small.

How each AllTrails-style feature gets built:

| Feature | Source |
| --- | --- |
| Trails near the map view | OSM route relations and named paths in the region pack |
| Distance, gain, profile, time | Computed on the device (see Route stats and algorithms) |
| Difficulty | Computed from distance, gain and steepest grade, plus `sac_scale` where tagged |
| Conditions | Your own layers sampled at the trailhead and the high point |
| Downloadable route | Waymarked Trails serves a GPX per OSM route relation (seen in a third-party listing; not checked directly) |
| Reviews, photos, popularity | Not available openly |

Parks Canada publishes its trails as open data, and Alberta does the same for Crown land; both are in the Canadian and BC-specific data section.

## Ski touring route sources

There is no open equivalent of AllTrails for ski touring in BC. The practical answer is the one you floated: start by drawing your own lines, and let the app's terrain analysis do the work.

| Rank | Source | What it gives | Catches |
| --- | --- | --- | --- |
| 1 | Draw your own, or import GPX | Lines from guidebooks, friends and your past tracks. Always available and trusted. | Manual. |
| 2 | [Avalanche Canada ATES areas](https://avalanche.ca/news/maps-of-ates-rated-regions-available-for-download) | Rated terrain zones with access trails and decision points for popular areas. | Zones, not routes. One KMZ per area. |
| 3 | [OpenStreetMap ski-tour tags](https://wiki.openstreetmap.org/wiki/Tag:piste:type%3Dskitour) (`piste:type=skitour`) | Mapped ascent routes, shown on OpenSkiMap. | Coverage is [limited](https://community.openstreetmap.org/t/ski-routes-import/138798) and historically concentrated in the Alps. Mappers themselves warn that stale ski-route data is risky. |
| 4 | [Parks Canada ATES trip ratings](https://parks.canada.ca/pn-np/mtn/securiteenmontagne-mountainsafety/avalanche/echelle-ratings) | Ratings for guidebook trips in the mountain national parks. | A list keyed to guidebooks, not map lines. |
| 5 | Trailforks | Community backcountry lines. | Same API barrier as for hiking. |
| 6 | Commercial apps, for reference only | [onX Backcountry](https://onxmaps.com/backcountry/blog/fatmap-alternative) (more than 3,300 guidebook ski routes across 35 regions), [OUTMAP](https://www.outmap.pro/blog/fatmap-replacement) (grew out of a ski-touring map after FATMAP shut down on 1 Oct 2024), CalTopo. | No APIs. Useful to borrow interface ideas from. |

What makes a touring tool valuable is terrain, not a route catalogue. For any line you draw, the app can report slope angle on and near the route, aspects crossed, elevation bands against the day's danger ratings, the ATES zone where one exists, freezing level against the route's elevations, and ridge-top wind.

## Route stats and algorithms

Everything AllTrails or Garmin shows for a route can be computed on the phone from the route line and the terrain tiles.

| Stat | Method | Notes |
| --- | --- | --- |
| Distance | Sum of great-circle segment lengths, after resampling the line every 10 to 30 m | Standard. |
| Elevation gain and loss | Sample the terrain model along the resampled line; count only climbs above a small threshold (3 to 5 m) | Without the threshold, noise inflates the total. |
| Grade profile | Rise over run per segment | Feeds the difficulty score. |
| Hiking time | [Tobler's hiking function](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function), applied segment by segment | Off-trail speed is three-fifths of on-trail. Naismith's rule (30 minutes per 300 m of climb) is the simpler fallback. |
| Touring time | [Munter method](https://backcountryaccess.com/de-at/blog/p/how-to-calculate-backcountry-touring-time-based-distance-elevation-gain) | The same article's quick rule: one hour per 1,000 ft of climb plus one hour per 2 miles. |
| Slope angle and aspect | Gradient of the terrain model over each 3 x 3 neighbourhood | Shade 30 to 35, 35 to 40, 40 to 45 and above 45 degrees; aspect in eight bins. |
| Route exposure summary | Share of the route above 30 degrees, steepest slope touched, aspects and elevation bands crossed | A summary to prompt judgment, not a verdict. |

Tobler's speed v is in km/h and s is rise over run:

```latex
v = 6\,e^{-3.5\,\left|\,s + 0.05\,\right|}
```

Munter's time t is in hours, with distance d in km, climb c in metres, and a rate r of about 4 uphill and about 10 skiing down:

```latex
t = \frac{d + c/100}{r}
```

Tobler gives 5.0 km/h on the flat and 2.5 km/h on a 20% climb. Munter gives 5 hours for 10 km with 1,000 m of climb at rate 4. The Munter rates are typical values from general knowledge. Both methods improve once you scale them to your own recorded pace.

### Limits of slope-angle shading

- **The terrain model decides the accuracy.** A Colorado accident report, [quoted here](https://www.skitalk.com/threads/avalanche-litigation-and-the-caic.22049/), cites typical errors of plus or minus 4 degrees for a single 10 m cell. In that accident the party planned to stay under 30 degrees using shading, and the slope measured 32 to 34.
- **BC's open terrain data is mostly 30 m**, coarser than that. Short steep rolls will under-read. Use HRDEM or LidarBC lidar where it exists and print the terrain resolution on the layer.
- **Shading shows start zones, not runouts.** CalTopo's author [makes this point](https://blog.caltopo.com/2012/02/09/avalanche-slope-analysis/), and reports that a prototype runout layer flagged such a large share of terrain that it stopped being useful. Leave overhead hazard to the person.
- **Snow changes the slope.** Loaded lee slopes are steeper than the bare ground the model measured.

## Canadian and BC-specific data

Canada and BC publish far more open data than the first pass used, nearly all of it free under the federal or BC open government licences. No BC-only weather model beats HRDPS for general forecasting; the BC-made models are specialised ones from UBC (smoke, fire weather, the Salish Sea). The biggest gains for this app are mountain station networks, resource roads, lidar terrain and marine models.

### Ranked by value to this app

| Rank | Addition | Why it matters | When |
| --- | --- | --- | --- |
| 1 | Mountain station feeds | Ground truth for what models get wrong: ridge wind, valley cold pools, new snow | With the past-weather layer |
| 2 | Resource roads | Trailhead access, on roads ordinary base maps draw poorly | With the base map style |
| 3 | Lidar terrain for your regular zones | Slope-angle shading that 30 m data cannot support | With slope shading |
| 4 | Lightning, evacuation orders, fire danger, highway events | Summer trip checks; each is a small layer | After the avalanche layer |
| 5 | Wave and current models | Paddling | Paddling phase |
| 6 | High-resolution climate normals | A way to sharpen precipitation maps | Later; research-grade |

### Terrain and elevation

| Rank | Dataset | Detail | Access | Use here |
| --- | --- | --- | --- | --- |
| 1 | [NRCan HRDEM](https://natural-resources.canada.ca/science-data/science-research/geomatics/more-high-resolution-lidar-elevation-data-now-available) | 1 to 2 m lidar where flown. More than 2 million km2 nationally; BC coverage grew by about 20,500 km2 after May 2024. | Open, federal licence | Slope shading in zones it covers |
| 2 | [LidarBC](https://www2.gov.bc.ca/gov/content/data/geographic-data-services/topographic-data/lidarbc) | The province's open lidar portal: point clouds and derived elevation models, by project area | Open, BC licence | Same, where HRDEM has gaps |
| 3 | NRCan MRDEM-30 | 30 m nationwide (see Map engine and base maps) | Open | Fallback everywhere |
| 4 | [BC 25 m DEM](https://open.canada.ca/data/en/dataset/7b4fef7e-7cae-4379-97b8-62b03e9ac83d) | Province-wide, built from older TRIM mapping | Free download | Little gain over 30 m |
| 5 | [CHS NONNA bathymetry](https://open.canada.ca/data/dataset/d3881c4c-650d-4070-bf9b-1e00aabf0a1d) | Sea-floor depth at 10 m or 100 m, as GeoTIFF | Free; non-navigational use only; through a data portal | Depth shading for paddling maps |

Keep Mapterhorn for hillshade and contours everywhere. For slope shading, build your own terrain tiles from lidar for the handful of zones you tour in most: a one-off job on a computer, saved as PMTiles like any other region file. Whether Mapterhorn already folds in LidarBC or HRDEM in your zones is still unchecked.

### Map layers

| Rank | Dataset | What it adds | Access |
| --- | --- | --- | --- |
| 1 | [Forest Tenure Road Segment Lines](https://open.canada.ca/data/dataset/9e5bfa62-2339-445e-bf67-81657180c682) and the [Digital Road Atlas](https://www2.gov.bc.ca/gov/content/data/geographic-data-services/topographic-data/roads) | Forest service and resource roads, the authoritative source for trailhead access | Open, BC licence |
| 2 | [Parks Canada trails](https://open.canada.ca/data/en/dataset/64a90e8d-5bc0-4027-8645-b5881b4068d4) | A line layer of the hiking trails Parks Canada is responsible for, refreshed weekly. Companion layers cover gates, campsites and place names. | GeoJSON and ArcGIS REST, federal licence |
| 3 | [BC Freshwater Atlas](https://www2.gov.bc.ca/gov/content/data/geographic-data-services/topographic-data/freshwater) | Streams, lakes and watersheds in more detail than the base map | Open, BC licence |
| 4 | [CanVec](https://open.canada.ca/data/en/dataset/8ba2aa2a-7bb9-4448-b4d7-f164409fe056) | National 1:50,000 topographic vectors | WMS and an extraction tool. NRCan's raster topo maps are archived, so vectors are the living product. |
| 5 | [BC Vegetation Resources Inventory](https://catalogue.data.gov.bc.ca/dataset/2ebb35d8-c82f-4a17-9c96-612ac3532d55) | Forest cover, updated yearly | Open. The forest-density input AutoATES needs (see Canadian safety data), and a guide to tree skiing. |
| 6 | [Alberta Crown Land Trails](https://open.canada.ca/data/dataset/97415cb9-1a6f-4886-9212-d91097c9a23e) | Trails on Alberta public land and in provincial parks | Open. For trips on the east side of the Rockies. |

### Canadian models and analyses beyond the main forecast stack

| Product | Maker | What it gives | Access | Fit |
| --- | --- | --- | --- | --- |
| [RDWPS](https://eccc-msc.github.io/open-data/msc-data/nwp_rdwps/readme_rdwps_en) waves | ECCC | Wave height and period, driven by HRDPS winds, with a North-East Pacific domain. The national version is on a 2.5 km grid. | Datamart and GeoMet | First choice for coastal paddling |
| [GDWPS](https://eccc-msc.github.io/open-data/msc-data/nwp_gdwps/readme_gdwps_en) waves | ECCC | Global waves and swell on a 25 km grid, out to 10 days | Datamart and GeoMet | Open-coast swell outlook |
| [CIOPS-West](https://donnees.iriu.ca/dataset/4296c034-8271-4e79-9be3-21c1c4cb73c3) | ECCC | 48-hour ocean forecast, four runs a day, at 1/36 degree, with West and Salish Sea domains | Listed as open data; access route not checked | Currents outside the Salish Sea |
| [SalishSeaCast](https://salishsea.eos.ubc.ca/erddap) | UBC | Hourly near-surface currents across the Strait of Georgia, Juan de Fuca and Puget Sound; water-level forecasts every 10 minutes at named sites including Squamish, Nanaimo and Victoria; wave fields | Public ERDDAP data server | Best current data for local paddling. Results are UBC copyright; read the licence text. The grid is curved, so it needs regridding. |
| [BlueSky Canada](https://firesmoke.ca/contact) smoke | UBC | Ground-level wildfire-smoke PM2.5 for Canada and most of North America, four runs a day, on UBC's own weather model. Fire-weather forecasts since 2020. | [NetCDF and KMZ downloads](https://bluesky4.eos.ubc.ca/data) | A second opinion beside ECCC's RAQDPS. [Attribution is required and embedding their maps is not allowed](https://firesmoke.ca/faq/); they label it experimental. |
| [CWFIS](https://cwfis.cfs.nrcan.gc.ca/datamart) fire weather | NRCan | Daily Fire Weather Index maps, fire danger, satellite hotspots and agency-reported active fires for all of Canada | [WMS, WFS and WCS](https://scifv.scf.rncan.gc.ca/downloads/CWFIS_DataServices_HowtoAccessDailyMaps&DataLayers.pdf) | National fire picture outside BC. The site was [rebuilt in April 2026](https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/release-notes/whats-new-in-cwfif-and-cwfis.pdf) with 14-day forecasts and a new catalogue, so older service addresses may move. |
| [CaLDAS](https://nhs-dev.github.io/NHS-Practitioners-Guide/products/CALDAS-SAT/CALDAS-SAT-2.1.3) snow analysis | ECCC | Snow depth and near-surface temperature analysed on the HRDPS 2.5 km grid every three hours | Public access not confirmed | A snow-on-ground map, if reachable. A model estimate; check it against stations. |
| [PCIC PRISM normals](https://pacificclimate.org/data) | PCIC (UVic) | 30-year temperature and precipitation normals for BC at about 800 m | Data portal | Precipitation downscaling: scale each model cell by the fine-scale normal pattern inside it (a standard technique; general knowledge) |
| Port Ocean Prediction Systems | DFO | Very fine current and water-level models for six ports and approaches, Kitimat among them, [described in a January 2026 review](https://waves-vagues.dfo-mpo.gc.ca/library-bibliotheque/41315911.pdf) | Public access not confirmed | Watch |

HRDPS West at 1 km, REPS probabilities, RAQDPS smoke and the HRDPA precipitation analysis are in the Weather models, Layers and Canadian safety data sections.

### Stations and observations

| Rank | Network | What it gives | Access |
| --- | --- | --- | --- |
| 1 | [ECCC partner station feed](https://eccc-msc.github.io/open-data/msc-data/obs_station/readme_obs_insitu_en) | One format across many networks: BC snow stations, BC Wildfire, BC highways, BC air quality, Parks Canada and Avalanche Canada | [Datamart partner folders](https://dd.weather.gc.ca/observations/swob-ml/partners/); also a real-time collection in ECCC's OGC API |
| 2 | [BC Wildfire weather stations](https://www2.gov.bc.ca/gov/content/safety/wildfire-status/prepare/weather-fire-danger/fire-weather) | About 260 stations reporting hourly | The partner feed above, or a DataBC layer |
| 3 | BC snow stations and Avalanche Canada stations | Snow depth and water equivalent at elevation (see Layers) | CSV; JSON API |
| 4 | [PCIC BC Station Data](https://www.uvic.ca/pcic/data-analysis-tools/data-portal/station-data/index.php) | History from more than 6,000 stations across provincial networks | Download portal. For "what is normal here" and for calibrating probabilities later. |
| 5 | [Lightning density](https://eccc-msc.github.io/open-data/msc-data/lightning/readme_lightning_en) | Canadian Lightning Detection Network strikes, gridded at 2.5 km every 10 minutes | GeoMet image layer, plus [GeoTIFF files with a 24-hour history](https://eccc-msc.github.io/open-data/msc-data/lightning/readme_lightning-datamart_en) |
| 6 | [Radar](https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en) | 1 km North American composite for rain and snow, a precipitation-type composite, short-range extrapolation and coverage masks; the last 3 hours are kept | GeoMet (see Layers) |

The partner feed is the single most useful find. One adapter reaches most mountain stations in BC, which gives the app a way to show how far a forecast is from reality at the nearest ridge or valley station.

### Hazards and access

| Need | Source | Notes |
| --- | --- | --- |
| Evacuation orders and alerts | [BC dataset](https://open.canada.ca/data/en/dataset/7efd46d0-b5d3-4dff-af80-d376c42aec33) | Active areas from local governments and First Nations, updated continually, as an ArcGIS REST layer and KML. [Reference only](https://wildfiresituation.nrs.gov.bc.ca); local government notices are the authority. |
| Fire bans | BC Wildfire's map layer | [Outer boundaries of provincial prohibition orders, updated daily](https://www2.gov.bc.ca/gov/content/safety/wildfire-status/about-bcws/disclaimer). Municipal bans are not included. A downloadable dataset was not confirmed. |
| Highway closures and events | [DriveBC Open511 API](https://api.open511.gov.bc.ca/help) | Road events for provincial highways with no key, under the BC licence. Filter by area, road or status; 50 events by default. |
| Highway webcams | [BC HighwayCams](https://catalogue.data.gov.bc.ca/dataset/bc-highway-cams) | Images and camera data [released as open data in 2016](https://news.gov.bc.ca/releases/2016TRAN0045-000360). A quick look at pass conditions. |
| Hotspots and fires outside BC | CWFIS (above) | Hotspots from the last 24 hours are a ready-made feature layer. |
| Park and trail closures | [BC Parks advisories](https://bcparks.ca/active-advisories/); [Recreation Sites and Trails alerts](https://www2.gov.bc.ca/gov/content/sports-culture/recreation/camping-hiking/sites-trails/alerts) | BC Parks has an open API; an advisories endpoint is likely but not confirmed. The recreation-sites alerts are a web page only, as far as this pass found. |

### What this means for the build

- **Six protocols cover almost everything.** Nearly every source in this report speaks one of: Open-Meteo's API, OGC WMS, OGC API Features or WFS, ArcGIS REST, a plain GeoJSON or CSV file, or ERDDAP. That is the strongest argument for the adapter design in the next section.
- **Most licences only ask for attribution**, but a few carry extra terms: GeoMet (no bulk tile retrieval), BlueSky (no embedding), NONNA (not for navigation), CWFIS (cite NRCan), SalishSeaCast (UBC copyright). Record the terms next to each source in code.
- **Provincial data stops at the border.** Rockies trips need the Parks Canada and Alberta layers.
- **Several are labelled experimental** (BlueSky, HRDPS West, the port models). Say so on the layer.

Not found or not confirmed in this pass: an open data feed from UBC's weather forecast team, satellite imagery layers, and the items marked "not confirmed" above.

## Implications of a modular design

Make the app modular along three seams (data sources, layers, region packs) and plain everywhere else. Those three are the things you already plan to add one at a time. Modules should be folders compiled into the app, not plugins loaded while it runs.

### The shape

Data flows through four stages, all leaning on one set of core services.

| Stage | Job | One per |
| --- | --- | --- |
| 1. Source adapter | Talks to one provider and returns data in a standard shape | Provider or protocol |
| 2. Transform | Derives new fields: terrain downscaling, probability, rain/snow line | Algorithm |
| 3. Layer | Draws the data, with its legend, readout and time behaviour | Map layer |
| 4. Shell | Map, time slider, legend area, panels | App |
| Core services | Fetch and cache, units, theme, terrain, offline packs | Shared by all |

Grafana is the closest well-known precedent. Its data-source plugins translate whatever a backend returns into [one common structure, the data frame](https://grafana.com/docs/grafana/latest/fundamentals/dashboards-overview/), and its panels only ever see that structure, which is why any source works with any panel. The equivalent here is that any model can feed any weather layer. That is your model picker.

### The contract: four data shapes

| Shape | What it holds | Examples |
| --- | --- | --- |
| Grid field | Values on a grid per time step, optionally per pressure level | Precipitation, temperature, wind, wave height |
| Point series | A time series at one place | Spot forecast, station record, tide prediction |
| Feature set | Shapes with properties (GeoJSON) | Avalanche regions, fire perimeters, alerts, trails, road events |
| Image layer | Pictures drawn by someone else | Radar, smoke and lightning from GeoMet |

Every piece of data carries the same label: source, model, run time, valid time, units, licence and attribution, time fetched, and whether it may be stored offline.

A layer then declares what data it needs, how to draw it, its legend, its tap-to-read value, its time behaviour (forecast, observed or static), whether it fills the map or sits on top, and what it adds to an offline pack. A sketch to argue with, not a final design:

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

### Architecture

- **Gain: a new layer is a new folder.** Nothing else changes, so layer twelve costs about what layer three did.
- **Gain: providers become swappable.** If Open-Meteo changes or disappears (it has no guarantee; see Open questions, risks and next steps), only its adapter is rewritten. A future home server that processes raw GRIB slots in as one more adapter.
- **Gain: the GPL renderer sits behind one seam** and can be replaced without touching layers.
- **Cost: contracts written before real layers exist are usually wrong.** Martin Fowler's [case against building ahead](https://www.martinfowler.com/bliki/Yagni.html) is that a guessed feature costs its build, delays everything else, and adds complexity that every later change carries; he puts the odds that a guessed feature is the wrong one at two in three or worse. The common remedy is to wait for the second or third real case before abstracting.
- **So: extract, do not predict.** Build two layers plainly, then pull the shared contract out of what they have in common. With Claude Code that refactor is an afternoon.
- **Static registry, not plugins.** One file lists the modules. No run-time loading, sandboxing or versioned plugin interface; those solve problems of third-party developers, and there are none.
- **Layers never import each other.** Shared needs go through core services. Derived products (terrain-corrected temperature, the rain/snow line) are transforms that sit between adapters and layers. The lesson from your Windy plugin lives there: interpolate the profiles, apply terrain per pixel, never interpolate finished temperatures.
- **One renderer for all grid layers.** If each layer brought its own WebGL code, the map would slow down and the layers would look unrelated. Boundaries pass typed arrays without copying, and heavy maths runs in a worker.

### User interface

- **Gain: consistency for free.** Every layer supplies the same pieces (name, legend, units, time behaviour, readout, source and age stamp), and the shell shows them in fixed places. A new layer needs no new interface design.
- **Risk: sameness.** Windy feels good partly because some layers get special treatment, such as wind particles or a radar loop. Allow an escape hatch: a layer may supply its own panel.
- **Stacking needs a rule.** One fill layer at a time, plus any number of overlays. Without that, independent layers pile into mud.
- **Three kinds of time on one slider.** Forecast layers look ahead, observed layers (radar, stations) look back, static layers ignore time. The slider shows what each active layer has at the chosen moment and greys out the ones that have nothing.
- **Model choice.** A global default with a per-layer override; each layer lists the models able to feed it.
- **Units and themes stay central.** Layers hand over values in SI units and ask the core to format them. Colour ramps are defined against theme tokens.
- **Exception: official colours.** The avalanche danger scale and alert colours stay as issued, whatever the theme.

### Data collection

- **One fetch service.** Adapters describe requests; the core does the caching (keyed by model run), retries, per-provider budgets (Open-Meteo's 10,000 calls a day), offline detection and age stamps. No adapter makes its own network calls.
- **Protocol adapters do most of the work.** Write WMS, OGC Features, ArcGIS REST and file adapters once. Evacuation orders, Parks Canada trails, fire hotspots, lightning and road events then become a few lines of configuration each: an address, a layer name, a field mapping.
- **Policy lives with the source.** Refresh interval, offline permission, licence, attribution and special terms are declared in the adapter, and the app's credits screen is generated from them.
- **Failures stay local.** One provider down means its layers show "unavailable" and the rest keep working.
- **Battery.** Only visible layers fetch, and a layer's code loads the first time it is switched on.

### Data integration

- **Fetching is the easy half.** The work is making sources agree on grid and projection, time zone and time step, units, accumulation periods, and model height versus real terrain. Normalise at the adapter boundary so that everything inside the app is SI, UTC and latitude/longitude, with accumulations stored per step. SalishSeaCast's curved grid is a good test case.
- **Readout pays for itself.** If every layer can answer "what is the value at this point and time", then conditions along a route work for all layers at once, with no code per pairing.
- **Shared services, not shared code.** Elevation at a point, the time index and region lookups are core services that any layer or transform can call.
- **Keep provenance visible.** A display that uses HRDPS to 48 hours and RDPS after that should show the seam. Every tapped value names its source and run.
- **Keep identifiers qualified.** Stations from different networks overlap; store them as network plus ID.
- **Never blend safety products.** Official ratings and alerts pass through untouched and are not folded into scores of your own.
- **Contract tests.** For each adapter, keep a saved real response and the normalised output expected from it. When a provider changes its format, a test fails before the map goes blank.

### Offline, testing, licensing and working with Claude Code

- **Offline.** Each layer declares what it adds to a region pack, or that it is online only. The download screen and the size estimate are then generated, and a single pack store owns the files.
- **Testing.** Small modules with fixtures can be built and checked one at a time in a browser, which is how Claude Code works best.
- **A template beats a description.** One finished reference layer plus a short "how to add a layer" note gives Claude Code something to copy.
- **Guard against over-building.** Asked for something "modular" or "extensible", a coding agent tends to add interfaces nobody uses. Put the rule in CLAUDE.md: no interface without two real implementations.
- **Licensing.** Data terms sit in the adapters; code licences are isolated by the seams.
- **Other devices.** A core with no interface code is what a desktop build and a Garmin companion would reuse (see App framework).

### When to modularise what

| When | Do | Leave for later |
| --- | --- | --- |
| Prototype (days 1 to 2) | A folder per layer. Units and theme in one place. All network calls through one cached fetch function. | Interfaces and registries |
| After the second layer works | Extract the layer contract and the data shapes from the two real layers. Add the registry file. | Anything plugin-like |
| After the third source | Extract the source adapter and the protocol adapters | A general query language |
| Weeks 3 and 4 | Transforms (downscaling, probability), pack contributions, contract tests | Nothing further |
| Not for a personal app | None of these | Run-time plugins, sandboxing, a public plugin interface, configuration for everything |

### Verdict

Modularity suits this app because its growth is already known: more layers, more sources, more regions. It pays most in data collection, where a few protocol adapters cover dozens of Canadian sources, and in the interface, where a fixed set of slots keeps a growing app coherent. It costs most when the contracts are written before the first two layers exist. Keep the modules static, extract the contracts from working code, and the design stays as simple as the problem allows.

## Open questions, risks and next steps

Six short tests settle most of the remaining uncertainty before real building starts.

### Spikes to run first

1. **Open-Meteo map files.** Confirm HRDPS is offered as its own layer and that partial reads work in a phone WebView. Not confirmed in this pass.
2. **Phone performance.** Capacitor, MapLibre, a local PMTiles file, hillshade and one weather raster, on your actual phone.
3. **Download sizes.** Run `pmtiles extract --dry-run` for the Sea to Sky and one Kootenay region, for both base map and terrain.
4. **Avalanche Canada.** Read the Terms of Use and Data Sharing Policy, then email about personal use and ATES data.
5. **Coverage.** Overpass queries for hiking routes and `piste:type=skitour` in your usual areas.
6. **Probability prototype.** In a notebook, for three spots you know: downscaled HRDPS plus ensemble anomalies, compared with nearby station records.

### Risks

| Risk | Detail | Mitigation |
| --- | --- | --- |
| Open-Meteo is free with no guarantee | Its map-data address changed more than once in 2026, and [third-party apps broke](https://github.com/thesurfrapp/maps/pull/5) when the old one went dark in September. | Cache every response, keep data fetching behind one module, and keep ECCC as a fallback. Self-hosting is possible later. |
| GPL-2.0 on the weather-map-layer library | Sharing the app with friends may oblige you to share source. This is not legal advice. | Keep the repository open, or swap the renderer before sharing. |
| HRDPS under-forecasts mountain precipitation | See Weather models. | Show model names; offer a second model beside it. |
| Safety data misread as the app's opinion | Avalanche and fire data are official products. | Show them verbatim with source, issue time and a link. |
| Slope shading over-trusted | See Route stats and algorithms. | Label terrain resolution; never present shading as "safe". |
| iOS distribution cost | See App framework. | Start as a PWA. |

### Not researched yet

The Canadian and BC-specific data section now covers Parks Canada trails, national fire danger and hotspots, lightning, highway conditions, webcams and current models. Still open: satellite imagery, a downloadable fire-ban dataset, the BC Parks advisories endpoint, public access to ECCC's snow analysis and the port current models, regional and municipal park trail data, Yukon and Alberta equivalents of the BC hazard layers, and whether UBC's weather forecast team publishes open data.

### Suggested path

1. **Prototype, a couple of days, in the browser.** Topo map with hillshade, contours and a locate button for one BC region. Precipitation layer with a time slider. Tap anywhere for a point forecast with a model picker. A folder per layer, with units, themes and network calls kept central from the start; the shared layer contract is extracted once two layers work (see Implications of a modular design).
2. **Week 2.** Capacitor build on your phone. Offline region pack. Data-age stamps.
3. **Weeks 3 and 4.** Terrain-corrected temperature, then probability, then the rain/snow line.
4. **After that.** Radar, alerts and avalanche regions. Draw-a-route with stats. Trails from OpenStreetMap.

## Sources

Pages read in full for this report:

- [Open-Meteo pricing and free-tier terms](https://open-meteo.com/en/pricing)
- [Open-Meteo Ensemble API documentation](https://open-meteo.com/en/docs/ensemble-api)
- [Open-Meteo weather-map-layer (GitHub)](https://github.com/open-meteo/weather-map-layer)
- [Meteoblue API pricing](https://business.meteoblue.com/pricing)
- [Avalanche Canada: Getting the meteogram](https://avalanche.ca/blogs/gettingthemeteogram)
- [Avalanche Canada API documentation](https://avalanche.ca/api-docs)
- [AllTrails: how its OpenStreetMap-derived database is built](https://support.alltrails.com/hc/en-us/articles/360019246411)

Every other claim is linked inline to the page it came from. Those were read as search-result excerpts, not in full, so check the linked page before relying on a specific number. That includes everything in the Canadian data and modular design sections, where a few BC government links were also rebuilt from shortened addresses and should be checked.

Two pages could not be opened at all (Open-Meteo's open-data repository and Mapterhorn's source list), which is why HRDPS availability in the map files and Mapterhorn's exact BC coverage are listed as open questions.
