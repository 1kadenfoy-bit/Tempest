# Weather app: data sources and models reference

2026-11-14 · Kaden Foy

Everything the app needs is available free for personal use: Open-Meteo for forecasts, ECCC for Canada-only products, Avalanche Canada and BC open data for hazards, and OpenStreetMap for trails. This is the condensed reference; the full research report has the detail.

## Picks at a glance

The app can run on free, open data: Open-Meteo for forecasts, ECCC for the Canada-only data, and open map and terrain files drawn by MapLibre. Every pick below came out of the research report; nothing here is new.

| Decision | Pick | Runner-up | Confidence |
| --- | --- | --- | --- |
| Forecast data | Open-Meteo (free for non-commercial use) | Raw GRIB from ECCC and ECMWF, processed on a home server | High |
| Models | HRDPS to 48 h, RDPS to day 3.5, then ECMWF IFS and GDPS | RRFS as a second high-resolution opinion | High for the Canadian models, medium for the rest |
| Probability | ECMWF ENS and GEPS through Open-Meteo's Ensemble API | ECCC's ready-made REPS probability layers | Medium |
| Canada-only data | ECCC GeoMet and its OGC API (radar, alerts, smoke, rivers) | None needed | High |
| Base map and terrain | Protomaps and Mapterhorn as PMTiles, contours drawn on the device | NRCan HRDEM lidar where it exists | Medium until sizes are tested |
| Weather drawing | Open-Meteo's weather-map-layer to start | WeatherLayers GL or a hand-written shader | Medium; the library is young |
| Avalanche | Avalanche Canada's API, shown unaltered | None | High; read their terms first |
| Hiking trails | OpenStreetMap, BC open data, Kaden's own GPX | None open | Medium; BC coverage not yet checked |
| Touring routes | Draw your own, plus Avalanche Canada's ATES areas | OpenStreetMap ski-tour tags | High that no open catalogue exists |
| Meteoblue and Windy APIs | Skip both | Meteoblue's free year, for comparison only | High |
| Canadian extras | Mountain station feeds, resource roads, lidar terrain for regular zones, then lightning, evacuation orders and highway events | Wave and current models, for paddling | High that they are open; some access details unchecked |

## Weather models

For BC mountains the working stack is HRDPS for the next 48 hours, RDPS to day 3.5, then ECMWF IFS and GDPS, with ensembles supplying probability. All are free to use; only the way they are fetched differs.

### Deterministic models

| Rank for BC | Model | Operator | Grid | Range | Runs | Strongest at |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [HRDPS Continental](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps-datamart_en) | ECCC | 2.5 km | 48 h | 4 a day | Short-range mountain weather; Avalanche Canada forecasters rate it the best short-term match to mountain terrain |
| 2 | [ECMWF IFS HRES](https://open-meteo.com/en/docs/ecmwf-api) | ECMWF | 9 km | 10 to 15 days | 4 a day | Days 3 to 10; open since 1 Oct 2025 under CC BY 4.0 |
| 3 | [RDPS](https://avalanche.ca/blogs/gettingthemeteogram) | ECCC | 10 km | 84 h | 4 a day | Trends for days 2 to 3.5; handles terrain less well than HRDPS |
| 4 | [RRFS](https://www.fox10tv.com/2026/11/06/noaa-retires-nam-weather-model-introduces-new-rrfs-forecasting-system/) | NOAA | 3 km | 18 h hourly, 84 h four times a day | Hourly | A second high-resolution opinion covering Canada; operational 3 Nov 2026, replacing NAM |
| 5 | [GDPS](https://avalanche.ca/blogs/gettingthemeteogram) | ECCC | 15 km | 10 days | 2 a day | Long-range planning; a cross-check on ECMWF |
| 6 | [GFS](https://open-meteo.com/en/docs/gfs-api) | NOAA | 13 km | 16 days | 4 a day | Longest range; a third independent global opinion |
| 7 | [ICON Global](https://open-meteo.com/en/docs) | DWD | about 11 km | 7.5 days | Every 3 to 6 h | Another global cross-check |
| 8 | [HRDPS West (experimental)](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps-datamart-alpha_en) | ECCC | 1 km | 48 h | 2 a day | Finest terrain detail over BC; experimental, on a test server |
| 9 | [HRRR](https://wherobots.com/discover/hrrr/) | NOAA | 3 km | 18 to 48 h | Hourly | Rapid updates, but a US domain; only useful near the border |

### Ensembles, for probability layers

| Rank | Ensemble | Members | Grid | Range | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | [ECMWF IFS ENS](https://open-meteo.com/en/docs/ensemble-api) | 51 | 25 km (open tier) | 15 days | Best general-purpose spread; every 6 h |
| 2 | [REPS](https://eccc-msc.github.io/open-data/msc-data/nwp_reps/readme_reps_en) | 20 + control | 10 km | 3 days | Canada-focused; ECCC publishes ready-made probability and percentile grids; not on Open-Meteo |
| 3 | [GEPS](https://open-meteo.com/en/docs/ensemble-api) | 21 | 25 km | 16 days | Canadian global ensemble; every 12 h |
| 4 | [GFS ensemble](https://open-meteo.com/en/docs/ensemble-api) | 31 | 25 km | 10 days (35 at 50 km) | Every 6 h |
| 5 | [RRFS/REFS](https://open-meteo.com/en/docs/ensemble-api) | 5 | 3 km | 2.5 days | The only convection-scale ensemble reaching Canada; few members |
| 6 | [Google WeatherNext 2](https://open-meteo.com/en/docs/ensemble-api), ECMWF AIFS | 64 / 51 | 25 km | 15 days | AI ensembles; extra opinions, less proven in mountains |

### Cautions that shape the design

- **HRDPS runs dry in the mountains.** A [Fernie study](https://arc.lib.montana.edu/snow-science/objects/ISSW2023_P1.06.pdf) found it under-forecast precipitation on 83% of winter precipitation days. Show the model name on every layer and treat snowfall totals as a floor.

- **Ensembles are coarse.** At 10 to 25 km they say how confident the forecast is, not what happens on one ridge. Pair their spread with a high-resolution model and terrain downscaling.

- **Rankings beyond the Canadian models are general guidance**, not a BC verification. The app's own model comparison will say more after a season.

## Weather data APIs

Open-Meteo comes first: free for a personal, non-commercial app, no key, and almost every model above can be picked individually. ECCC fills the Canada-only gaps. Meteoblue and Windy are priced for businesses.

| Rank | Source | Cost | What you get | Catches |
| --- | --- | --- | --- | --- |
| 1 | [Open-Meteo](https://open-meteo.com/en/pricing) | Free for non-commercial use: 600 calls a minute, 5,000 an hour, 10,000 a day; attribution under CC BY 4.0 | About 49 selectable models including HRDPS, RDPS, GDPS, ECMWF IFS 9 km, GFS, HRRR and ICON. The free tier also has the Ensemble, Historical, Previous Runs, Air Quality, Elevation, Marine and Flood APIs, and gridded map files for MapLibre | No uptime guarantee. No radar, alerts or REPS |
| 2 | [ECCC MSC GeoMet and Datamart](https://eccc-msc.github.io/open-data/usage-policy/readme_en) | Free, anonymous; attribution required | Radar composite, precipitation type, radar extrapolation, alerts, REPS probability layers, AQHI, smoke, river levels, climate observations, plus HRDPS, RDPS and GDPS as map layers or raw GRIB2 | Bulk downloading of WMS tiles is prohibited, so GeoMet suits live viewing, not saved areas. Raw GRIB2 needs your own processing |
| 3 | Direct from source ([ECMWF open data](https://www.ecmwf.int/node/29013), NOAA, Datamart GRIB2) | Free data; costs effort | Full control, any variable, your own tiles and saved files | Needs an always-on machine to fetch and convert GRIB; a home server would do. Phase 2 at the earliest |
| 4 | [Meteoblue](https://business.meteoblue.com/pricing) | Free Weather API for one year, 10 million credits; then prepaid credits, or Premium API listed at EUR 2,400 a year; map tiles EUR 2,400 a year | Their own blended forecast, multimodel packages, good meteogram images | A standard hourly 7-day call costs about 8,000 credits, so the free year is roughly 1,250 calls. No raw grids for drawing your own layers |
| 5 | [Windy API](https://api.windy.com/point-forecast/pricing) | Point Forecast EUR 990 a year; [Map Forecast](https://api.windy.com/map-forecast/pricing) EUR 990 a year plus EUR 1,000 for ECMWF | Windy's layers and models in an embeddable map | The free tier is for development only and returns deliberately shuffled data. No ECMWF in point forecasts |

**Use:** Open-Meteo for point forecasts, model comparison, ensembles and gridded layers. GeoMet for radar, alerts and smoke while online. Direct GRIB processing only if a wall is hit: REPS probabilities, HRDPS fields Open-Meteo lacks, or saved-area files. Meteoblue's free year is worth taking only to compare its forecast against HRDPS at Kaden's spots.

## Map, terrain and base layers

MapLibre GL JS draws everything. Base map, terrain and contours can all be free, open and cut out by region as PMTiles files.

### Base map and terrain

| Need | Pick | Notes |
| --- | --- | --- |
| Roads, trails, water, labels | [Protomaps basemap](https://docs.protomaps.com/basemaps/downloads) (OpenStreetMap as one PMTiles file) | Free daily builds; `pmtiles extract` cuts out any bounding box; the topo style is ours to write |
| Hillshade and 3D terrain | [Mapterhorn](https://protomaps.com/blog/mapterhorn-terrain/) terrain tiles | Open terrain as PMTiles, Copernicus 30 m globally with lidar where countries publish it; extractable by bounding box |
| Contour lines | [maplibre-contour](https://github.com/maplibre/maplibre-agent-skills/issues/19) | Generated on the device from the same terrain tiles, so no separate download |
| Better Canadian elevation | [NRCan MRDEM-30 and HRDEM](https://geo.ca/initiatives/national-elevation-data-strategy/) | MRDEM is 30 m nationwide; HRDEM is 1 to 2 m lidar where flown |

In BC, Mapterhorn's detailed zooms are mostly the 30 m model stretched, with lidar in few places, according to [one developer's testing on Vancouver Island](https://github.com/TecnaGamer/BeamNG.Earth/pull/206). Fine for hillshade and contours; it matters for slope shading.

### Canadian terrain

| Rank | Dataset | Detail | Access | Use |
| --- | --- | --- | --- | --- |
| 1 | [NRCan HRDEM](https://natural-resources.canada.ca/science-data/science-research/geomatics/more-high-resolution-lidar-elevation-data-now-available) | 1 to 2 m lidar where flown; BC coverage grew by about 20,500 km2 after May 2024 | Open, federal licence | Slope shading in zones it covers |
| 2 | [LidarBC](https://www2.gov.bc.ca/gov/content/data/geographic-data-services/topographic-data/lidarbc) | Point clouds and derived elevation models by project area | Open, BC licence | Where HRDEM has gaps |
| 3 | NRCan MRDEM-30 | 30 m nationwide | Open | Fallback everywhere |
| 4 | [BC 25 m DEM](https://open.canada.ca/data/en/dataset/7b4fef7e-7cae-4379-97b8-62b03e9ac83d) | Province-wide, from older TRIM mapping | Free download | Little gain over 30 m |
| 5 | [CHS NONNA bathymetry](https://open.canada.ca/data/dataset/d3881c4c-650d-4070-bf9b-1e00aabf0a1d) | Sea-floor depth at 10 m or 100 m, GeoTIFF | Free; non-navigational use only | Depth shading for paddling |

Plan: keep Mapterhorn for hillshade and contours everywhere; for slope shading, build terrain tiles from lidar for the few zones toured most, as a one-off job saved as PMTiles like any other region file.

### Extra map layers

| Rank | Dataset | What it adds | Access |
| --- | --- | --- | --- |
| 1 | [Forest Tenure Road Segment Lines](https://open.canada.ca/data/dataset/9e5bfa62-2339-445e-bf67-81657180c682) and the [Digital Road Atlas](https://www2.gov.bc.ca/gov/content/data/geographic-data-services/topographic-data/roads) | Forest service and resource roads; the authoritative source for trailhead access | Open, BC licence |
| 2 | [Parks Canada trails](https://open.canada.ca/data/en/dataset/64a90e8d-5bc0-4027-8645-b5881b4068d4) | Hiking trails Parks Canada is responsible for, refreshed weekly; companion layers for gates, campsites, place names | GeoJSON and ArcGIS REST |
| 3 | [BC Freshwater Atlas](https://www2.gov.bc.ca/gov/content/data/geographic-data-services/topographic-data/freshwater) | Streams, lakes and watersheds in more detail | Open, BC licence |
| 4 | [CanVec](https://open.canada.ca/data/en/dataset/8ba2aa2a-7bb9-4448-b4d7-f164409fe056) | National 1:50,000 topographic vectors | WMS and an extraction tool |
| 5 | [BC Vegetation Resources Inventory](https://catalogue.data.gov.bc.ca/dataset/2ebb35d8-c82f-4a17-9c96-612ac3532d55) | Forest cover, updated yearly; the forest-density input AutoATES needs | Open |
| 6 | [Alberta Crown Land Trails](https://open.canada.ca/data/dataset/97415cb9-1a6f-4886-9212-d91097c9a23e) | Trails on Alberta public land and in provincial parks | Open |

### How weather overlays get drawn

| Rank | Approach | Fit |
| --- | --- | --- |
| 1 | [Open-Meteo weather-map-layer](https://github.com/open-meteo/weather-map-layer): reads `.om` files from a public AWS bucket and draws rasters, contours, arrows and value labels in MapLibre, colour scales on the device | Fastest route to a prototype; not yet production-ready by its authors' own flag; GPL-2.0 |
| 2 | [GeoMet WMS](https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en) image layers | Right for radar, alerts and smoke; online only, ECCC's colours |
| 3 | [WeatherLayers GL](https://github.com/weatherlayers/weatherlayers-gl) with our own data | Mature (raster, contour, particles, high/low) on deck.gl, MPL-2.0 since 2025; we must supply the data. Phase 2 |
| 4 | Hand-written WebGL layer, the way [Yr.no does](https://client.yr-maps.met.no/usage) | Full control; most work |

Animated wind options: [maplibre-gl-wind](https://github.com/geoql/maplibre-gl-wind) (MIT, deck.gl), mapbox-exif-layer, and WeatherLayers GL's particle layer.

## Observations and Canadian models

Stations give the ground truth models miss: ridge wind, valley cold pools, new snow. The ECCC partner feed is the single most useful find, because one adapter reaches most mountain stations in BC.

### Past weather

| Source | What it gives | Access |
| --- | --- | --- |
| [HRDPA (CaPA)](https://eccc-msc.github.io/open-data/msc-data/nwp_hrdpa/readme_hrdpa_en) | Best-estimate 6 h and 24 h precipitation at 2.5 km, blending gauges, radar and HRDPS | GeoMet layers; GRIB2 on Datamart |
| [BC Automated Snow Weather Stations](https://catalogue.data.gov.bc.ca/dataset/current-season-automated-snow-weather-station-data) | Hourly snow depth, snow water equivalent, temperature and precipitation at high remote sites | CSV, near real time |
| [Avalanche Canada weather stations](https://avalanche.ca/api-docs) | Station list and measurements, last week by default | JSON API |
| ECCC observations | Real-time surface observations and hourly climate records | [OGC API collections](https://api.weather.gc.ca/collections) |
| Open-Meteo Historical and Previous Runs APIs | What each model said, and reanalysis back decades | Free tier |

Checked Nov 17, 2026 (after M7), for real measurements of the past at the pin:

- **ECCC's own stations** (`swob-realtime` on the OGC API) answer from a browser (CORS open), every minute, with temperature, wind, gusts and precipitation. Near the North Shore and Sea to Sky they are low: Callaghan Valley 887 m, Whistler Nesters 662 m, Squamish, Pemberton, Point Atkinson.
- **Partner stations** (BC highways' avalanche stations such as Blowdown Peak 2,320 m, BC snow pillows, BC Hydro, BC Wildfire) are listed with locations in `swob-partner-stations` (CORS open), but their readings are only on the Datamart (`dd.weather.gc.ca/…/swob-ml/partners/bc-tran/…`), which sends no CORS header: a web app cannot read them without a server of its own. Their notices say "All rights reserved" (BC government), so the terms need checking before any use.
- Gridded analyses of temperature and wind (as HRDPA is for precipitation) were not found as open files.

### Stations and observation networks

| Rank | Network | What it gives | Access |
| --- | --- | --- | --- |
| 1 | [ECCC partner station feed](https://eccc-msc.github.io/open-data/msc-data/obs_station/readme_obs_insitu_en) (SWOB) | One format across BC snow stations, BC Wildfire, BC highways, BC air quality, Parks Canada and Avalanche Canada | [Datamart partner folders](https://dd.weather.gc.ca/observations/swob-ml/partners/); also a real-time OGC API collection |
| 2 | [BC Wildfire weather stations](https://www2.gov.bc.ca/gov/content/safety/wildfire-status/prepare/weather-fire-danger/fire-weather) | About 260 stations reporting hourly | Partner feed, or a DataBC layer |
| 3 | BC snow and Avalanche Canada stations | Snow depth and water equivalent at elevation | CSV; JSON API |
| 4 | [PCIC BC Station Data](https://www.uvic.ca/pcic/data-analysis-tools/data-portal/station-data/index.php) | History from more than 6,000 stations | Download portal; for normals and later calibration |
| 5 | [Lightning density](https://eccc-msc.github.io/open-data/msc-data/lightning/readme_lightning_en) | Canadian Lightning Detection Network strikes at 2.5 km every 10 minutes | GeoMet layer, plus [GeoTIFF with 24 h history](https://eccc-msc.github.io/open-data/msc-data/lightning/readme_lightning-datamart_en) |
| 6 | [Radar](https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en) | 1 km North American composite, precipitation type, short-range extrapolation, coverage masks; last 3 hours kept | GeoMet |

### Canadian models beyond the main stack

| Product | Maker | What it gives | Access | Fit |
| --- | --- | --- | --- | --- |
| [RDWPS](https://eccc-msc.github.io/open-data/msc-data/nwp_rdwps/readme_rdwps_en) waves | ECCC | Wave height and period from HRDPS winds, North-East Pacific domain; national version at 2.5 km | Datamart and GeoMet | First choice for coastal paddling |
| [GDWPS](https://eccc-msc.github.io/open-data/msc-data/nwp_gdwps/readme_gdwps_en) waves | ECCC | Global waves and swell, 25 km, 10 days | Datamart and GeoMet | Open-coast swell outlook |
| [CIOPS-West](https://donnees.iriu.ca/dataset/4296c034-8271-4e79-9be3-21c1c4cb73c3) | ECCC | 48 h ocean forecast, four runs a day, 1/36 degree, West and Salish Sea domains | Listed as open; access route not checked | Currents outside the Salish Sea |
| [SalishSeaCast](https://salishsea.eos.ubc.ca/erddap) | UBC | Hourly currents across the Strait of Georgia, Juan de Fuca and Puget Sound; water levels every 10 minutes at named sites; waves | Public ERDDAP | Best local current data; UBC copyright; curved grid needs regridding |
| [BlueSky Canada](https://firesmoke.ca/contact) smoke | UBC | Ground-level smoke PM2.5, four runs a day; fire-weather forecasts since 2020 | [NetCDF and KMZ](https://bluesky4.eos.ubc.ca/data) | Second opinion beside RAQDPS; [attribution required, no embedding](https://firesmoke.ca/faq/); experimental |
| [CWFIS](https://cwfis.cfs.nrcan.gc.ca/datamart) fire weather | NRCan | Daily Fire Weather Index, fire danger, hotspots, active fires for Canada | [WMS, WFS, WCS](https://scifv.scf.rncan.gc.ca/downloads/CWFIS_DataServices_HowtoAccessDailyMaps&DataLayers.pdf) | National fire picture; [rebuilt April 2026](https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/release-notes/whats-new-in-cwfif-and-cwfis.pdf), so addresses may move |
| [CaLDAS](https://nhs-dev.github.io/NHS-Practitioners-Guide/products/CALDAS-SAT/CALDAS-SAT-2.1.3) snow analysis | ECCC | Snow depth and near-surface temperature on the HRDPS grid every 3 hours | Public access not confirmed | A snow-on-ground map if reachable |
| [PCIC PRISM normals](https://pacificclimate.org/data) | PCIC | 30-year temperature and precipitation normals for BC at about 800 m | Data portal | Precipitation downscaling; research-grade, later |
| Port Ocean Prediction Systems | DFO | Fine current and water-level models for six ports, [per a January 2026 review](https://waves-vagues.dfo-mpo.gc.ca/library-bibliotheque/41315911.pdf) | Not confirmed | Watch |

No BC-only weather model beats HRDPS for general forecasting; the BC-made models are specialised (smoke, fire weather, the Salish Sea).

## Safety and hazard data

Every source here is official and free. The app shows each one unaltered with its issue time and a link, and never computes a danger rating of its own.

### Avalanche

| Rank | Source | What it gives | Catches |
| --- | --- | --- | --- |
| 1 | [Avalanche Canada API](https://avalanche.ca/api-docs) | Forecast-area outlines as GeoJSON, area metadata, every forecast product, and a lookup by latitude and longitude. Each product has daily ratings for alpine, treeline and below treeline, problems, issue and expiry times, summaries and travel advice | Links a Terms of Use and a Data Sharing Policy, states no rate limits. Read both and email info@avalanche.ca first |
| 2 | [ATES-rated areas](https://avalanche.ca/news/maps-of-ates-rated-regions-available-for-download) | Simple, challenging and complex terrain zones with access trails, avalanche paths and decision points, including the [Spearhead Traverse](https://avalanche.ca/news/ates-ratings-for-the-spearhead-traverse-in-whistler) | One KMZ per area from the Trip Planner, after a disclaimer; a manual import |
| 3 | [AutoATES v2.0](https://nhess.copernicus.org/articles/24/1779/2024/) | Open-source model generating ATES-style maps from terrain and forest density | Tuning per region is the hard part; a model output, never an official rating. Phase 3 at the earliest |
| 4 | Mountain Information Network reports | Field observations from other users | Undocumented endpoint, needs a key, capped at 31 days a request. Ask first |

Layer design: colour each forecast region by today's highest rating; tapping shows the three bands, problems, expiry and a link. The bands are not fixed elevations, so matching a route to treeline needs a per-region height, labelled approximate.

### Wildfire and smoke

| Source | What it gives | Access |
| --- | --- | --- |
| [BC Wildfire perimeters](https://open.canada.ca/data/dataset/cdfc2d7b-c046-4bf0-90ac-4897232619e1) and [fire locations](https://open.canada.ca/data/en/dataset/2790e3f7-6395-4230-8545-04efb5a18800) | Current-season perimeters and points, refreshed every 15 minutes; reference only | WMS, KML, shapefile, ArcGIS REST |
| [ECCC RAQDPS](https://www.canada.ca/en/environment-climate-change/services/air-quality-health-index/weather) | Smoke PM2.5 forecast maps at 10 km for 72 h (FireWork folded in) | GeoMet; GRIB2 on Datamart |
| AQHI | Observed and forecast Air Quality Health Index by station | [OGC API](https://open.canada.ca/data/en/dataset/a563e47d-6eb9-4f7f-933c-222ae49fe57f) |
| [BC Parks API](https://open.canada.ca/data/en/dataset/fb1c834b-5a59-44f4-8ed9-6585e826f88d) | Open REST and GraphQL data on provincial parks | Advisories endpoint not checked |

### Weather alerts

ECCC alerts come as GeoJSON from the [weather-alerts collection](https://api.weather.gc.ca/collections/weather-alerts) and as a map layer. The [GeoMet 3.0 release](https://comm.collab.science.gc.ca/mailman3/hyperkitty/list/dd_info@comm.collab.science.gc.ca/2026/2/) replaced the old `ALERTS` layer with `Current-Alerts`. Fetch on open, cache, show the fetch time.

Checked Nov 17, 2026 (used by `adapters/eccc-alerts/`):

- **Request.** `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&skipGeometry=true&limit=100&bbox=w,s,e,n` (pygeoapi 0.20.0). A box 0.0002° wide around the pin works as a point query: it returns only the areas whose polygons contain the point (a point in the City of Lethbridge returned the city, not the county around it). Without `skipGeometry` the polygons make answers large; whole-country requests were cut off through this session's proxy. The answer is a few kB.
- **CORS.** `Access-Control-Allow-Origin: *`, so the app asks directly. No key.
- **Shape.** One GeoJSON feature per alert per area. `id` is `<alert>_<area>`. Fields used: `alert_type` (warning, watch, advisory, statement), `alert_name_en` ("snowfall warning"), `feature_name_en` (area name), `risk_colour_en` (yellow, orange, red; null for statements), `publication_datetime`, `expiration_datetime`, `status_en` (seen: issued, continued), `province`. Also present, not shown: `alert_text_en` (full text), `confidence_en`, `impact_en`, `validity_datetime`, `event_end_datetime`, French versions. Queryables include `province` and `alert_type`.
- **No link field.** Each row links to ECCC's provincial alerts page, `https://weather.gc.ca/warnings/index_e.html?prov=bc` (the address BC government pages give; weather.gc.ca itself is blocked from this session, so not opened).
- **Colours.** ECCC has colour-coded warnings, watches and advisories since Nov 26, 2025 (yellow, orange, red by impact and confidence); statements have no colour. The hex values come from the legend of ECCC's own `Current-Alerts` map layer (GeoMet GetLegendGraphic): warnings and advisories red `#DA3333`, orange `#FF9500`, yellow `#FFFF00`; watches the lighter `#EB9898`, `#FDC87F`, `#FDFD7F`; statements grey `#DBDBDB`. canada.ca's page on the colours could not be opened from this session.
- **On Nov 17, 2026** there were 119 alert-areas in Canada (Alberta snowfall warnings and statements, a Yukon blizzard warning), none in BC. The test answers saved in `adapters/eccc-alerts/fixtures/` are real ones from Lethbridge, Calgary and the North Shore (empty).
- **Licence.** Open Government Licence – Canada, attribution to ECCC.

### Water

| Need | Source | Notes |
| --- | --- | --- |
| River level and flow | [ECCC real-time hydrometric data](https://api.meteo.gc.ca/collections/?lang=en) | Over 2,100 stations, last 30 days, same OGC API |
| Tides | [CHS water-level API](https://tides.gc.ca/en/web-services-offered-canadian-hydrographic-service) | Predictions, observations and forecasts at more than 700 stations; licence agreement required |
| Tidal currents | Same API | Thin: [one analysis](https://runkelcorey.github.io/posts/2025-08-09-canadian-tidal-data/index.html) found fewer than 10 stations nationally |
| Marine wind and waves | Open-Meteo Marine API; ECCC marine forecasts (experimental) | Wave and current models are under observations and Canadian models |

### Hazards and access

| Need | Source | Notes |
| --- | --- | --- |
| Evacuation orders and alerts | [BC dataset](https://open.canada.ca/data/en/dataset/7efd46d0-b5d3-4dff-af80-d376c42aec33) | Active areas from local governments and First Nations, ArcGIS REST and KML; [reference only](https://wildfiresituation.nrs.gov.bc.ca) |
| Fire bans | BC Wildfire map layer | [Provincial prohibition boundaries, updated daily](https://www2.gov.bc.ca/gov/content/safety/wildfire-status/about-bcws/disclaimer); no municipal bans; no downloadable dataset confirmed |
| Highway closures and events | [DriveBC Open511 API](https://api.open511.gov.bc.ca/help) | Provincial highway events, no key, BC licence; 50 events by default |
| Highway webcams | [BC HighwayCams](https://catalogue.data.gov.bc.ca/dataset/bc-highway-cams) | Open since 2016; a quick look at passes |
| Hotspots and fires outside BC | CWFIS | Last-24-hour hotspots as a feature layer |
| Park and trail closures | [BC Parks advisories](https://bcparks.ca/active-advisories/); [Recreation Sites and Trails alerts](https://www2.gov.bc.ca/gov/content/sports-culture/recreation/camping-hiking/sites-trails/alerts) | Advisories endpoint likely but not confirmed; rec-sites alerts are a web page only |

## Trails and touring routes

### Hiking trails

OpenStreetMap is the only source both open and broad, and it is the same raw material AllTrails starts from. What cannot be had openly is the curated layer on top: reviews, photos, popularity and descriptions.

| Rank | Source | What you get | Catches |
| --- | --- | --- | --- |
| 1 | [OpenStreetMap](https://wiki.openstreetmap.org/wiki/Hiking) | Paths, tracks, `route=hiking` relations, difficulty tags ([sac_scale](https://wiki.openstreetmap.org/wiki/Key:sac_scale), trail_visibility); ODbL with attribution; Overpass or a one-off regional extract | Quality varies; BC coverage of named routes and difficulty needs checking |
| 2 | BC government open data | [Recreation Sites and Trails BC trail lines](https://app.geo.ca/en-ca/map-browser/record/7fcb21f7-e51c-4342-a5e1-445a6c42128e), the BC Parks API, regional park trail sets | Authoritative but uneven, few attributes |
| 3 | Kaden's own GPX files | Trusted routes from Garmin, Strava or friends | Manual |
| 4 | [Trailforks](https://www.trailforks.com/about/api) | Large community database | API by approval; not usually granted to individuals |
| 5 | AllTrails | The experience to match | No public API; terms restrict automated access; a scraping project was [shut down at its request](https://mcpservers.org/servers/srinath1510/alltrails_mcp_server) in January 2026. Do not build on it |

AllTrails [documents](https://support.alltrails.com/hc/en-us/articles/360019246411) building its trail segments from OpenStreetMap ways pulled through Overpass, so the geometry gap is small.

| AllTrails-style feature | How it gets built |
| --- | --- |
| Trails near the map view | OSM route relations and named paths in the saved region |
| Distance, gain, profile, time | Computed on the device |
| Difficulty | Distance, gain and steepest grade, plus `sac_scale` where tagged |
| Conditions | The app's own layers sampled at the trailhead and high point |
| Downloadable route | Waymarked Trails serves a GPX per OSM route relation (seen in a listing; not checked) |
| Reviews, photos, popularity | Not available openly |

Parks Canada and Alberta Crown land trails are under extra map layers.

### Ski touring routes

There is no open AllTrails for ski touring in BC. Start by drawing your own lines and let terrain analysis do the work.

| Rank | Source | What it gives | Catches |
| --- | --- | --- | --- |
| 1 | Draw your own, or import GPX | Lines from guidebooks, friends, past tracks | Manual |
| 2 | [Avalanche Canada ATES areas](https://avalanche.ca/news/maps-of-ates-rated-regions-available-for-download) | Rated zones with access trails and decision points | Zones, not routes; one KMZ per area |
| 3 | [OpenStreetMap ski-tour tags](https://wiki.openstreetmap.org/wiki/Tag:piste:type%3Dskitour) | Mapped ascent routes, shown on OpenSkiMap | [Limited coverage](https://community.openstreetmap.org/t/ski-routes-import/138798), mostly the Alps; stale data is risky |
| 4 | [Parks Canada ATES trip ratings](https://parks.canada.ca/pn-np/mtn/securiteenmontagne-mountainsafety/avalanche/echelle-ratings) | Ratings for guidebook trips in the mountain parks | A list, not map lines |
| 5 | Trailforks | Community backcountry lines | Same API barrier |
| 6 | Commercial apps, reference only | [onX Backcountry](https://onxmaps.com/backcountry/blog/fatmap-alternative), [OUTMAP](https://www.outmap.pro/blog/fatmap-replacement), CalTopo | No APIs; interface ideas only |

For any drawn line the app can report slope angle on and near the route, aspects crossed, elevation bands against the day's danger ratings, the ATES zone where one exists, freezing level against the route's elevations, and ridge-top wind.

### Limits of slope-angle shading

- **Terrain data sets the accuracy.** A Colorado accident report, [quoted here](https://www.skitalk.com/threads/avalanche-litigation-and-the-caic.22049/), cites errors of about plus or minus 4 degrees for one 10 m cell.

- **BC open terrain is mostly 30 m**, so short steep rolls under-read. Use lidar where it exists and print the resolution on the layer.

- **Shading shows start zones, not runouts**, as [CalTopo's author notes](https://blog.caltopo.com/2012/02/09/avalanche-slope-analysis/).

- **Snow changes the slope.** Loaded lee slopes are steeper than the bare ground measured.

## Licences and terms

Most sources only ask for attribution. The ones below carry extra terms; record each source's terms next to its adapter in code. None of this is legal advice.

| Source | Terms that matter |
| --- | --- |
| Open-Meteo | Free for non-commercial use within the rate limits; CC BY 4.0 attribution; no uptime guarantee |
| ECCC GeoMet and Datamart | Free and anonymous with attribution; no bulk retrieval of WMS tiles |
| ECMWF open data | CC BY 4.0 since 1 Oct 2025 |
| Open-Meteo weather-map-layer | GPL-2.0: sharing the app may oblige sharing its source |
| WeatherLayers GL; maplibre-gl-wind | MPL-2.0; MIT |
| OpenStreetMap | ODbL with attribution |
| Avalanche Canada API | Terms of Use and Data Sharing Policy not yet read; email before relying on it |
| ATES areas | Downloaded one area at a time after a disclaimer |
| Mountain Information Network | Undocumented, needs a key; ask first |
| CHS tides | Licence agreement required |
| CHS NONNA bathymetry | Non-navigational use only |
| BlueSky Canada | Attribution required; embedding their maps not allowed; experimental |
| CWFIS | Cite NRCan |
| SalishSeaCast | UBC copyright; read the licence text |
| BC Wildfire perimeters, evacuation orders | Stated as reference only |
| Federal and BC open data (HRDEM, LidarBC, roads, trails, DriveBC, HighwayCams) | Open government licences |
| Trailforks | API by approval only |
| AllTrails | No public API; terms restrict automated access |
| Meteoblue, Windy | Paid business pricing; Windy's free tier is development-only with shuffled data |

Provincial data stops at the border, so Rockies trips need the Parks Canada and Alberta layers. Several sources are labelled experimental (BlueSky, HRDPS West, the port models); say so on the layer.

## Not yet checked

These came up in research but were not confirmed. Treat them as questions, not facts.

- Whether Open-Meteo's map files carry HRDPS as its own model, and whether partial reads work in a phone WebView

- Mapterhorn's exact BC coverage, and whether it already folds in LidarBC or HRDEM in Kaden's zones

- Real download sizes for the Sea to Sky and one Kootenay region

- Avalanche Canada's Terms of Use and Data Sharing Policy, and whether ATES data and offline bulletins are allowed

- OpenStreetMap coverage of hiking routes, difficulty tags and `piste:type=skitour` in BC

- Waymarked Trails GPX per route relation

- The BC Parks advisories endpoint

- A downloadable fire-ban dataset

- Public access to ECCC's CaLDAS snow analysis and to the DFO port current models

- CIOPS-West access route

- Satellite imagery layers

- Regional and municipal park trail data

- Yukon and Alberta equivalents of the BC hazard layers

- Whether UBC's weather forecast team publishes open data

- A few BC government links rebuilt from shortened addresses

## Sources

This reference is condensed from Personal weather app: component research and rankings. Related: Weather app: project brief and Weather app: architecture and technical spec.

Pages read in full:

- [Open-Meteo pricing and free-tier terms](https://open-meteo.com/en/pricing)

- [Open-Meteo Ensemble API documentation](https://open-meteo.com/en/docs/ensemble-api)

- [Open-Meteo weather-map-layer](https://github.com/open-meteo/weather-map-layer)

- [Meteoblue API pricing](https://business.meteoblue.com/pricing)

- [Avalanche Canada: Getting the meteogram](https://avalanche.ca/blogs/gettingthemeteogram)

- [Avalanche Canada API documentation](https://avalanche.ca/api-docs)

- [AllTrails: how its OpenStreetMap-derived database is built](https://support.alltrails.com/hc/en-us/articles/360019246411)

Every other claim links inline to its page. Those were read as search excerpts, not in full, so check the page before relying on a number. Two pages could not be opened at all (Open-Meteo's open-data repository and Mapterhorn's source list), which is why HRDPS in the map files and Mapterhorn's BC coverage are still open.
