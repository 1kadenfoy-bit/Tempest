# Tempest: decisions and open items

Nov 15, 2026. Newer decisions replace older ones. When a document in this repo disagrees with this file, this file wins.

## 1. Settled by Kaden

| Topic | Decision |
| --- | --- |
| Name | Tempest |
| Icon | "Wind over peaks", chosen for now |
| Design | Template v8 is the only design to build from |
| Builder | Claude Code on the web, stopping at each milestone |
| Product | Personal, shareable with friends, never sold. No tracking, background work or push alerts |
| Offline | Only for hand-saved areas, with chosen layers and a time window |
| Top bar | Sits just below the phone's status bar |
| Full forecast | Opens from a button in the details and from press-and-hold. Not double-tap. Parked until more layers exist |
| Model choice | Remembered per layer |
| Open menus | Dim the map 35% |
| Colour scales | Continuous, saturating at the top stop as drawn. Avalanche stays stepped, as issued |
| Pin | Always present; starts on your location |
| Scrubber | One control for every layer; the layer draws its own chart in it. One window control sets the chart span and the week-strip box |
| Details | Standard cards in a fixed order for every layer |
| Model cautions | One tap away behind the model's i, never in the layer details |
| Precipitation | Fixed 0.1 mm/h cutoff. Snow line shown by default. Snow in cm only in totals |
| Temperature | Always 2 m above the terrain, terrain-corrected. No height control |
| Sheet, pulled up (Nov 15, after M1) | Nothing in the scrubber part changes as the sheet rises; the window row stays. Pulling up only exposes more below. Replaces "the window row is hidden when the sheet is pulled up" in the design spec |
| Sheet, tucked away (Nov 15, after M1) | The sheet can be slid down until only its handle shows, to clear the map; tap or drag the handle to bring it back |
| Page zoom (Nov 15, after M1) | Pinching zooms the map only; the interface itself never zooms, including over open panels |
| Window summary (Nov 16, after M2) | Split at the needle: the total for the half before it and for the half after ("Last 24 h" · "Next 24 h" at now; "24 h before" · "24 h after" when moved). Where the window reaches past the model's hours the label says what is covered ("Since Sun 5 PM") |
| Info sheet, tucked (Nov 16, after M3) | When slid down, the sheet stops with its handle on screen, measured from the visible screen height (the installed iPhone app reports a taller box than it shows) |
| Saving an area (Nov 16, after M3) | Save for offline opens the adjustable box with corner handles (v8 08-SaveArea), brought forward from M8; the box is what is saved |
| Totals lines (Nov 16, after M3) | When more than one kind fell, each total sits on its own line |
| Pin readout (Nov 16, after M4) | Centred over the pin, moved only as far as needed to stay on screen. Replaces v8's left-aligned readout |
| Panning (Nov 16, after M4) | Colour should be there while panning, not only after letting go: the fill reaches a margin past the screen and refreshes during long pans |
| Map detail (Nov 15, after M1) | North Vancouver area at the base map's finest level (zoom 15), Horseshoe Bay to Deep Cove up to Cypress, Grouse and Seymour |
| Layer plan | As in `docs/01-product-brief.md` |

## 2. Defaults taken on Kaden's behalf

Kaden asked not to be interrupted, so these were chosen for him. Each is easy to change. Raise them in the M0 report so he can confirm.

| Topic | Default | Why |
| --- | --- | --- |
| Start region | North Shore and Sea to Sky | It is the area on every design screen |
| First platform | iPhone, as a home-screen web app | Fastest route to a phone; no Mac needed |
| Units | Metric; Imperial (°F, in, mph, ft, mi) in app settings since M9. Only text changes: map colours, thresholds and stored data stay metric. Imperial rain rates show two decimals (three under 0.01 in/h); snow in whole inches | The screens are metric |
| Theme (M9) | Dark; Light and Match phone in app settings. Light uses the light tokens for the shell, map ground, roads, labels and contours; hillshade shadows are the light ground darkened toward the ink. Weather ramps stay as they are. Rain and snow amounts written as text use the darkest stop of each light ramp in light, since the tokens give text accents for dark only | v8 has no light screens |
| Sources | Free ones only | Budget is "free for now" |
| Routes and trails | Not in the first build | The brief left it open; the design has no route screens |
| Icon variant | The dark two-peak version | It was the lead option on the icon board |
| Temperature averages | Daytime and night-time averages restored as a note in the TODAY card | Asked for in an early comment, dropped by accident in a later redraw |
| Layer menu | Shows the whole layer plan; unbuilt layers are hidden in the app | The template menu had placeholder tiles |
| Top bar offset | 8 px below the safe area | "Just below the status bar" needed a number |
| Stack | As recommended in the architecture spec | Not overruled |
| Temperature data (M4) | The pin's series and the map's profile nodes come from Open-Meteo's point API (every hour in one request); the map files answer when the API cannot (over its limit, or no signal), slower but the same numbers. One run for the whole app: the newest both have | One map-file hour of a temperature profile costs about 30 variable reads; a 48 h pin series that way is about 1,500 reads |
| Temperature profile (M4) | 14 pressure levels, 1015 to 600 hPa (sea level to about 4,100 m) | Covers BC's terrain; higher levels change nothing on the ground |
| Feels-like on the map (M4) | The map shows air temperature; the Feels-like map setting comes with layer settings | Settings are M5 |
| Week strip values (M4) | Daily high and low only for days with 12 or more model hours | A high from part of a day would mislead |
| Elevation bands (M5, proposal) | Alpine starts at the region's typical treeline; valley ends 800 m below it. Treelines: South Coast 1,400 m, Sea to Sky 1,650, Coast inland 1,800, Columbia Mountains 1,950, Rockies 2,200, Northern BC 1,300. Labelled approximate until Kaden agrees | Matches the v8 screens on the North Shore (600 and 1,400 m) |
| Snow line (M5) | Where the wet-bulb temperature falls to 0.5 °C, from the model's temperature and humidity on each pressure level | HRDPS's files carry no snow line of its own, so the "Model" choice is left out |
| Snow ratio (M5; default changed Nov 16) | 7:1 (fixed; Open-Meteo's conversion), Kuchera (per hour from the column's warmest temperature), or 10:1. Default Kuchera: Kaden asked for the most reliable, and a 2026 comparison of 10 methods over 14 storms found Kuchera among the most accurate (US Northeast; not yet checked in BC) | HRDPS has no ratio of its own; "Model's own" would have meant 7:1 |
| Wind at the terrain (M7) | The model's 10 m wind at 10 m above the model's own ground, then its pressure-level winds above that, read at the real ground height (east and north parts blended, never speeds). The model's ground is estimated by smoothing the terrain over one model cell (2.5 km for HRDPS), since the files carry no model terrain or surface pressure. Ground below the model's ground keeps the 10 m wind | Ridges stand in the stronger wind aloft; sheltered valleys do not. Matches the design's "ridge vs valley" card and its footer |
| Gusts at the terrain (M7) | The wind at the terrain times the model's 10 m gust factor, capped at 1.5, and never less than the 10 m gust's excess over the wind | Uncapped, a 40 km/h ridge wind under a gusty valley read as 90 km/h gusts (Mt Seymour, Nov 15). Exposed ridges see factors of about 1.3 to 1.6 |
| Wind flow (M7; particles after Kaden, Nov 17) | Particles carried by the wind, each trailing a fading tail of about half a second: about one per 800 square pixels (about 400 on a phone), moving at 2.2 px a second per km/h, living 3 to 6 seconds, at most 60 frames a second. Hidden while the map moves; stopped when the app is hidden or wind is not shown. Arrows every 52 px when the animation is off | Kaden asked for a particle simulation that stays light: tails are kept as each particle's last 10 positions and drawn in five strokes, with no full-screen fading buffer |
| Wind direction (M7) | Eight compass points with degrees ("SW 230°"). A direction shift is a change of 60° or more to another compass point that holds for 3 hours, ignoring winds under 5 km/h | Light winds turn about without meaning anything |
| Rain or snow (Nov 16, after M5) | One rule everywhere: the wet-bulb temperature at the ground, from the profile, at each spot's real height. All snow at 0 °C or below, all rain from 1 °C, mixed between; the snow line (0.5 °C) runs down the middle of the mixed band. The map, the pin's readout, chart, totals and the table all use it. Without a profile (rare) the model's own split is used | Kaden saw the snow line and the orange band disagree when zoomed in: they came from two methods |
| Mixed totals (Nov 16, after M5) | Totals read only rain and snow: a mixed hour is split by its snow share | Kaden: "4 cm snow / 2 mm mixed" should read as rain |
| Headline and NOW (Nov 16, after M5) | Always describe the present hour, not the time slider | Kaden |
| Totals table (Nov 16, after M5) | Spans the model covers only in part show what it holds, faded, instead of "–" | Kaden: the 48 h columns were empty |
| Saved precipitation (Nov 16, after M5) | Keeps the profile too (temperature, height and humidity per level), since it decides rain or snow at the pin; offline numbers equal online ones | About 40 more values an hour to download |
| Type shown (M5) | Rain only and Snow only each hide mixed as well | Mixed is both |
| Totals by elevation (M5) | The pin's model cell's amount, typed as rain or snow at each band's height by that hour's wet-bulb temperature. The pin's own band uses the pin's height; others the band's middle. Past columns before the run show "–" until observed data (M6) | |
| Freeze-thaw areas (M5) | Not built: the setting has no map design yet, so the switch is not shown | "A switch appears only when it works" |
| Models (M6) | HRDPS, RDPS, GDPS for both layers; ECMWF IFS for precipitation only (no height profile in its open data). GFS and HRDPS West not yet offered. Choosing a chain model starts the chain there (HRDPS, then RDPS, then GDPS, as the HRDPS card describes); GDPS and ECMWF stop at their own ends | |
| Model menu order (M6) | HRDPS, RDPS; ECMWF IFS, GDPS (v8 04). "Compare two models" left out until designed | |
| Radar (Nov 17; no v8 design) | ECCC's 1 km composite as ECCC draws it, online only. Settings: Shown (Type by default, Rain rate, Snow rate) and grey beyond radar range (on). While Radar is shown the one cursor steps through its frames (last 3 h, every 6 min); the chart spans 3 h with no window choice; Now goes to the newest frame; Play loops the last hour. The readout is ECCC's value at the pin's pixel for the frame the cursor rests on | Plainest version from existing parts until Kaden designs it |
| Observed precipitation (M6) | ECCC HRDPA 6-hour totals at the pin for the week's past, online only; final where it exists, else preliminary; spread evenly over the 6 hours in totals | GeoMet is not for bulk copying, so saved areas leave it out |
| Temperature's past (M6) | Earlier model runs (point API past days), hatched; no gridded temperature analysis is used yet | |
| Scrubbing the past (Nov 17, after M7) | The cursor reaches the 48 hours before the forecast, hour by hour, at the pin (readout, chart, summary, details). The map holds the forecast's first hour and says "map from …". Not with a saved area (no past is saved) | Past maps from earlier runs' grids not yet checked |
| Saved areas (M8) | Many side by side, newest first. Each is named after the map label nearest the box's centre (else "Area N") and remembers its box, layers and window, so Refresh saves the same again from the newest forecast and then removes the old copy | v8 has no list screen: built from the existing rows, switch and notes |
| Save window (M8) | 24 h, 48 h, 3 days, Model end, counted from now. HRDPS up to its end, then RDPS for the hours after (the chain, as online). "Model end" is RDPS's end, about 3½ days. Default 48 h, as in v8 08 | GDPS is not saved: 10 days of a coarse model would mostly add size |
| How a save reads profiles and wind (M8) | From the point API for every model cell in the box (a few requests, all hours each), when that fits in about five minutes of the free limit (about a 35 km box); else from the map files hour by hour. Amounts always from the map files | Map files: about 9 minutes for any box (about 80 small reads an hour of forecast, six at a time). Checked Nov 17: pressure-level values and 10 m wind are identical from both; 2 m temperature differs (the API adjusts it to the real ground height, as it does online) |
| Offline fill (M8) | With saved data only, temperature and wind fill the saved area in view, not the screen | The fill's points are spaced to the view; over a small area none landed inside |
| Saved data only (M8) | A switch in the saved areas list. While on and an area is saved, the app makes no network requests for weather; with nothing saved it is kept but has no effect | Weak signal hangs requests and drains the battery (architecture) |
| Expired (M8) | An area is marked Expired when every hour it holds has passed | |
| Run refresh (M6) | Look for new runs every 10 minutes while the app is on screen | Open-Meteo's 12Z HRDPS stalled on Nov 16 |
| Air quality (Nov 18; no v8 design) | Map: PM2.5 near the ground for the cursor's hour, from ECCC's RAQDPS (wildfire smoke by default; All PM2.5 in settings), or CAMS global (all PM2.5, 40 km) from the source button. Colours: ECCC's own PM2.5 scale (1–500 µg/m³), blended continuously; nothing drawn under 1. The layer's hours are its source's own (ECCC: 2 days back through earlier runs, 72 h ahead). AQHI: nearest station within 100 km, observed and forecast, as issued (whole number as ECCC shows it, the API's unrounded value beside it). Fires: BC Wildfire Service points and perimeters, neutral marks, status in words; shown when their issued dates say they were burning on the cursor's BC day (the out day counts as out); without an out date, from now on unless Out. Online only; fires kept on the phone | Plainest version from existing parts until Kaden designs it |
| Renderer licence | Start with the GPL-2.0 library behind one seam; replace it with the app's own renderer by M3 | Keeps the choice open if the app is shared |

## 3. Replaced by v8

Do not build these, even where older text mentions them.

- Scrubber options A to D, day tabs, and per-layer scrubbers.
- Panels that slide in from the side. Panels grow from their control.
- A "no pin" state, a "map centre" mode, and a point sheet separate from the layer details.
- Evenly stepped colour scales.
- A "minimum shown" precipitation setting, and "last 6/24/48/72 h" chips in the collapsed sheet.
- A height selector for temperature.
- Double-tap for the full forecast.
- Weather, Snow and Hazards groups in the layer menu.
- The name "Weather app", and the names Zephyrus and Ptarmigan.
- "Codex" as the builder.

## 4. Open: Kaden decides later

- Elevation band rule (valley, mid, alpine) per region. Proposed in M5 (section 2); Kaden to agree or adjust.
- Designs for alerts, search, app settings, saved areas list (plain version in M8), compare, full forecast, light theme, and every layer after wind.
- Whether to keep the repo public (the simple answer to the GPL question) or private.
- Whether any paid source is worth it after a season on the free ones.
- Capacitor and the app stores.

## 5. Facts to check before relying on them

These came from research and were not all confirmed. Check each at the milestone that first needs it and record the result in `docs/spikes/`.

- Whether Open-Meteo's map files offer HRDPS as its own model, and whether partial reads work in an iPhone web view.
- The starter library's current name and API. Last seen: npm package `@openmeteo/weather-map-layer`, an `om://` protocol registered with MapLibre's `addProtocol`, data under `openmeteo-data-spatial.b-cdn.net`. It is young and changes often; read its README first.
- Real download sizes for a saved area. M8, Nov 17: an 8 × 6 km box with all three layers for 3 days was 7.3 MB (weather 1.9, map 1.6, terrain 3.0, labels 0.9); the estimate said about 7.
- Avalanche Canada's terms, including keeping bulletins offline. Kaden should email them before the avalanche layer. Read Nov 17 (`docs/05-data-sources.md`, Avalanche): no licence for the API, website material not to be reproduced without written consent, nothing on offline. Nov 17: Kaden decided no email is needed for a personal hobby app using the public API, as long as requests are polite; the latest bulletins and reports are now kept on the phone automatically.
- Avalanche Canada's ATES (terrain complexity) data. Nov 17: Kaden decided no permission email is needed (personal hobby app, public government-funded service; polite requests, attribution, shown as published). Built from the per-area KMZ files on Avalanche Canada's services API (`docs/05-data-sources.md`, Avalanche). Still unconfirmed: the colours for Non-avalanche (class 0) and Extreme (class 4) zones. No file on Nov 17 has either; Tempest would show them white and red (placeholders in `core/avalanche/ates.ts`), named in words in the legend. Check if one appears.
- The ATES area index (`public/ates/index.json`) is a copy made by hand: refresh it about monthly in winter with `tools/ates-index.mjs` (see `docs/05-data-sources.md`). A new area is missing from the map until then.
- Mapterhorn's coverage and resolution in BC.
- How much storage iOS grants a home-screen web app, and when it evicts it. M8 asks for persistent storage on every save and the saved areas list says whether the phone agreed: Kaden to report what it says on the iPhone.
- Every access detail marked "not confirmed" in `docs/05-data-sources.md`.
- Current stable versions of every library. Do not trust version numbers written in these documents.
- When ECCC shows wind chill and humidex (M4). The formulas are confirmed; the thresholds used (wind chill at 0 °C or below with wind of 5 km/h or more; humidex from 20 °C when it reaches 25) could not be read on canada.ca from the build machine.
- Whether Open-Meteo keeps older runs' map files long enough. Checked Nov 16: the 00Z and 18Z runs of the previous day were still there.
- The units of wind in Open-Meteo's map files (M7). Checked Nov 17: the files store m/s (1.0 in the file was 3.6 km/h from the point service, same place and hour); the app converts on reading. Before this, the feels-like map's file fallback used m/s as km/h.
- Whether the wind at the terrain matches stations on ridges (M7). Not yet compared: needs a windy day and ridge stations (for example Mt Seymour, Grouse, Whistler Roundhouse).

## 6. Things only Kaden can do

1. Create the GitHub repository and connect it to Claude Code on the web.
2. Set the cloud environment's network access so the weather and map servers are reachable (see `README.md`).
3. Create a hosting account if the preview host needs one.
4. Test each milestone on his phone and say go or change.
5. Email Avalanche Canada about data terms before the avalanche layer (draft questions in `docs/reports/avalanche/report.md`).
