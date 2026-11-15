# Tempest: design spec (Template v8)

This is the written form of the Template v8 design. Build the interface from this document and the screens in `design/v8/`. Where the two disagree, the screen wins for looks and this document wins for behaviour.

- Screens: `design/v8/png/NN-Name.png` (what it looks like) and `design/v8/html/NN-Name.html` (the same board as static HTML; read exact sizes, colours and structure from its inline styles).
- Tokens: `design/tokens.json`.
- Earlier versions (v1 to v7) are superseded. Do not build from them. `docs/06-decisions-and-open-items.md` records how the design got here.
- The numbers on the screens (North Shore, 1,180 m, "Fri 5 PM", totals) are sample data.

## 1. The app in one screen

The whole app is one full-screen map with a small fixed shell on top. There are no other pages. Reference: `01-Home`.

| Part | Where | What it does |
| --- | --- | --- |
| Map | Full screen | Topo base with hillshade. One condition layer fills it. Overlays sit on top. |
| Top bar | 16 px from the sides, 8 px below the status bar, 56 px tall | Alert badge, layer name with model age under it, model button, search |
| Pin and readout | On the map | Always present. One-line readout from the current layer |
| Thumb buttons | Right edge, above the sheet, 56 px round | Locate-me, then map layers |
| Bottom sheet | Bottom, 20 px top radius | Collapsed: time, window, layer chart, week strip, legend. Pulled up: details for the pin |

Design principles, from the Tokens board:

- **Colour is for data.** Controls stay neutral. Each layer brings its own continuous scale. Only avalanche danger stays stepped, in its official colours.
- **Panels grow from their control.** Layer name, model button and map layers each grow into a rounded panel, up to full screen. Nothing slides in from the side.
- **Shell and slots.** The shell is fixed. A layer fills only its slots: map fill, chart, legend, readout, details, settings.
- **Gloves and cold hands.** 44 px minimum touch target, 56 px thumb buttons.
- Dark theme is the default. A light theme exists in the tokens and is built later (milestone 9).

## 2. Shell components

Reference boards: `10-Components`, `09-Tokens`.

### Top bar

`left 16, right 16, top = safe-area top + 8, height 56`. On the 390 × 844 artboards the safe area is taken as 47 px, so the bar sits at 55. Use `env(safe-area-inset-top)`; never hard-code 47.

Left to right:

1. **Alert badge.** Round 44 px button with a warning triangle and a count. Opens the alerts panel (not designed yet, see section 9). Alerts never appear as a layer.
2. **Layer name.** Space Grotesk 600, 18 px, with a small chevron. Under it, the model age in caption type: "18Z run · 2 h old". Tapping it grows the layer menu.
3. **Model button.** A pill showing the current model for this layer, for example "HRDPS", with a chevron. Tapping it grows the model menu.
4. **Search.** Round 44 px button. Search is not designed yet (section 9).

### Pin and readout

- **There is always a pin.** It starts on the user's location, labelled "You". Tapping the map moves it. Clearing it snaps it back to the user's location.
- If location is off or there is no fix yet, the pin falls back to the last pin used, labelled as such.
- The readout is one line in a dark pill beside the pin: a bold value, then secondary details from the layer. Example: **2.4 mm/h snow** You · 1,180 m · snow line 1,000 m.
- Everything in the sheet describes the pin. There is no "map centre" mode and no "no pin" state.

### Thumb buttons

Two 56 px round buttons on the right, 16 px from the edge, stacked just above the collapsed sheet: locate-me on top, map layers below. Map layers grows into the map panel.

### Bottom sheet, collapsed

Reference: `01-Home`, `14-PrecipHome`, `19-TempHome`, `24-WindHome`. Top to bottom:

1. **Grab handle.**
2. **Time row** (shell). Cursor time in display type, "Fri 5 PM", with a relative note, "in 6 h". On the right, a **Now** button and a round **play** button.
3. **Pin place line** (shell). A small pin icon, the place name or "Your location", and the pin's elevation: "Your location · 1,180 m". Tapping it centres the map on the pin.
4. **Window row.** On the left the window control (shell), a pill reading "48 h" with a chevron. On the right the layer's summary of that window (layer slot), for example "12 mm rain · 21 cm snow" with the date range under it.
5. **Layer chart** (layer slot, the large part). Drawn by the layer for the pin, across the window. The shell draws on top of it: a fixed needle in the middle, the "now" line, and hatching over the observed part.
6. **Week strip** (shell). Seven day labels, past to future, with a track under them. A white rounded box on the track shows which part of the week the chart covers. Observed time is hatched. Past the chosen model's last hour the track is greyed and labelled "Beyond model". A layer may add small values under the day labels (temperature shows daily high and low).
7. **Legend** (layer slot). The layer's data scale with units.

### Time and window rules

- **One time cursor for the whole app.** Scrub by dragging the chart or the white box. The needle stays in the middle of the chart; the data moves under it.
- **One window control for every layer.** Options: 12 h, 24 h, 48 h (default), 3 d, 7 d. The window sets the chart's span and the width of the white box together. They are the same thing.
- The window summary covers exactly the window, labelled with its range. To read "last 24 h", set the window to 24 h and drag it so it ends at now.
- The window row is hidden when the sheet is pulled up. The details carry the totals there.
- **Now** jumps the cursor to the current time. **Play** steps through time.
- The cursor stops at the chosen model's last hour. Where a fallback model takes over, the seam is marked on the strip.
- Readouts and details always use real model steps. Any blending between steps is for the picture only.

### Bottom sheet, pulled up

Reference: `06-SheetUp` (top) and `07-SheetScroll` (scrolled).

- The sheet rises to 16 px under the top bar. The map stays visible above it.
- At the top it shows the time row, pin place line, chart, week strip and legend, then the details.
- The details scroll. When they do, the scrubber scrolls away and the **subject line** stays pinned at the top of the sheet.
- Details are built from standard cards in a fixed order (section 4).

### Grow panel

Reference: `02-MapLayers`, `03-LayerMenu`, `04-ModelMenu`, `05-ModelInfo`, settings screens.

- Any control that opens something grows from its own position into a rounded panel: 24 px radius, 16 px from the screen edges, as tall as its content up to full screen.
- The panel header keeps the icon of the control it grew from, a title in panel-title type, a one-line caption, and a close button.
- Close with ×, a tap on the scrim, or the originating control.
- While a panel is open the map and sheet sit under a 35% black scrim.
- One panel component serves the layer menu, model menu, model info, map panel, save-area panel and every layer's settings.

### Controls

All from `10-Components`: layer tile (64 px tall, 12 radius, a swatch of the layer's scale above its name; selected = white edge and a 10% fill), model row (name, grid and reach, run age, and an i button), toggle row, checkbox row, segmented control (12 radius, selected segment white with dark text), primary button (white, dark text) and secondary button (outlined).

## 3. Behaviour rules that apply everywhere

| Rule | Detail |
| --- | --- |
| One fill layer | One condition layer at a time fills the map. Any number of overlays sit on top. |
| Always a pin | See above. |
| Model choice | Remembered per layer. The model menu says "For this layer". |
| Fitting sources only | The model menu lists only sources that carry what the layer needs. |
| Model notes | Cautions and model facts live one tap away, behind the i. They never sit in the layer details. |
| Gestures | Tap moves the pin. Press-and-hold opens the full forecast (when built). Double-tap stays as map zoom. |
| Dim | Open panels dim the map 35%. |
| Colour saturation | Scales saturate at their top stop: precipitation at 6 mm/h, temperature at −20 and +25 °C, wind at 60 km/h. Readouts always show the real value. |
| Units | Formatted in one place. Metric by default: °C, mm, cm, km/h, m. A units setting lives in app settings. |
| Stale data | Shown, never hidden, with the warning colour and its age. |
| Safety data | Avalanche, alerts and fire products are shown exactly as issued, with source, issue time and a link. Never re-scored. |

## 4. The layer template

A layer is one folder that fills these slots. Reference: the "Slots filled" tables on `13-Precip`, `18-Temp`, `23-Wind`.

| Slot | What the layer supplies |
| --- | --- |
| Needs | The variables it asks for, by name, never by provider |
| Map fill | How values become colour, plus any line it draws |
| Chart | Its drawing for the pin across the window |
| Window summary | One or two short lines about the window |
| Legend | Its scale and units |
| Readout | The pin's one-line text |
| Point details | The cards it fills, in the standard order |
| In view | One line about the whole map view |
| Settings | The contents of its settings panel |
| Offline | What it needs saved for an area, or "online only" |

### Detail cards, in fixed order

Reference: `11-DetailElements`. A layer picks the cards it needs. Cards it does not need are left out, but the order never changes.

| # | Card | Owner | Content |
| --- | --- | --- | --- |
| 1 | Subject | Shell | Where the pin is and its elevation, with the cursor time on the right. Always present. Stays pinned when scrolled. |
| 2 | Headline | Layer | One value and one sentence: what it means at the pin now. |
| 3 | Key stats | Layer | 2 to 4 values with units, and an optional short note. |
| 4 | Table or visual | Layer | By elevation, by time, or a small chart. One idea per card. |
| 5 | Second visual | Layer | Only if the layer needs one. |
| 6 | Status lines | Layer | Events at the pin: freeze-thaw, a direction shift, a warning. |
| 7 | Expandables | Layer | Detail one tap away, closed by default. |
| 8 | Coming later | Layer | Dashed placeholder for planned data. |
| 9 | In view | Shell | One line about the whole map view. |
| 10 | Footer | Shell | Model, run age, elevation used and method on the left; **Layer settings** button on the right. Under it, the Full forecast entry (dashed until that window is built). |

Every card: 12 px radius, white at 4.5% opacity, 12 px padding, a small-caps title, optional meta text on the right. Cards keep to the phone width (358 px on the artboard).

Two visuals are shared between layers:

- **Elevation over time.** Time runs left to right across the same window as the chart; elevation runs bottom to top with valley, mid-mountain and alpine bands labelled with their heights. A line marks the pin's elevation. Precipitation shades snow above the snow line and rain below it. Temperature shades below and above 0 °C around the freezing level. A marker names the moment it switches at the pin's height: "Snow from 3 PM", "Below 0 °C from 4 PM".
- **Value against elevation.** Elevation on the vertical axis with the three bands, the value on the horizontal axis, one line for the profile at the cursor time, and a "You" dot on the line. Temperature marks 0 °C. Wind uses the same graph for ridge against valley.

Elevation bands on the screens: valley below 600 m, alpine above 1,400 m. These are sample figures. The band heights need a per-region rule; treat it as an open item and label the bands approximate.

## 5. Layers designed so far

### Precipitation

Screens: `13-Precip`, `14-PrecipHome`, `15-PrecipUp`, `16-PrecipScroll`, `17-PrecipSettings`.

| Slot | This layer | Rule |
| --- | --- | --- |
| Needs | Precipitation, snowfall, type, freezing level, snowfall height, terrain, observed analysis; ensembles later | Asks by variable |
| Map fill | Rate as liquid mm/h. Colour family by type: rain blue, mixed orange, snow purple. Nothing drawn under 0.1 mm/h. The line chosen in settings, with its elevation labelled, for example "Snow line · 1,000 m" | One unit on the map |
| Chart | Hourly amounts across the window, coloured by type and rate. Bars are grey where observed | Window sets chart and box |
| Window summary | Totals over the window by type: "12 mm rain · 21 cm snow", then "+3 mm mixed · Thu 5 PM – Sat 5 PM" | Snow in cm only in totals |
| Legend | One mm/h scale shown as three colour families: Rain, Mixed, Snow, "0.1 to 6+ mm/h" | Units from the one formatter |
| Readout | Rate and type, the pin's elevation, the snow line | |
| In view | Heaviest rate now and where; freezing level range | |
| Settings | Type shown: All, Rain only, Snow only. Snow ratio: Model's own, Kuchera, 10:1. Line on the map: Off, Wet-bulb, Model, 0 °C (default Model) | Fixed cutoff at 0.1 mm/h; no "minimum shown" setting |
| Offline | Its grids for the area and window | Saved run shown with its age |

Detail cards:

1. Subject.
2. Headline: the type now as the value ("Snow"), and a sentence with the next start, stop or change: "Rain turned to snow at 3 PM. Eases by Sat 6 AM."
3. Key stats, titled NOW: rate (mm/h), snow line (m), freezing level (m).
4. Table, titled TOTALS BY ELEVATION: columns mirrored around now, 72 · 48 · 24 · 6 h past, then 6 · 24 · 48 · 72 h next, split by a line at now. Rows stacked like the mountain: Alpine, Mid, Valley. The pin's band carries a "You" tag. Rain in blue as mm, snow in purple as cm. A cell with both shows both.
5. Second visual: elevation over time, titled RAIN OR SNOW AT EACH ELEVATION.
6. Coming later: "Chance of precipitation · comes with ensembles".
7. In view.
8. Footer, with a first line for the snow ratio in use and its likely range: "Snow ratio 10:1 (model's own) · likely 7–15:1".

### Temperature

Screens: `18-Temp`, `19-TempHome`, `20-TempUp`, `21-TempScroll`, `22-TempSettings`.

| Slot | This layer | Rule |
| --- | --- | --- |
| Needs | Temperature profile on pressure levels, 2 m temperature, terrain; wind and dew point for feels-like | Interpolate profiles, never finished temperatures |
| Map fill | Continuous diverging fill, neutral at 0 °C, plus a dashed 0 °C line labelled with its elevation | Terrain applied per pixel on the GPU |
| Chart | Air temperature as a thick line coloured by value. Feels-like as a thin line, with the gap between them shaded blue when it feels colder and warm when it feels warmer. A 0° guide. Lighter bands for daylight. The "Feels" label stays inside the chart | Same data as the map |
| Window summary | "High +2° · Low −5°" with the range under it | |
| Week strip extra | Daily high and low under each day label | |
| Legend | One bar, −20 to +25 °C, 0 marked | |
| Readout | Temperature, feels-like, the pin's elevation, the freezing level | Wind chill or humidex, ECCC formulas |
| In view | Warmest and coldest in view and where; freeze-thaw areas | |
| Settings | Map shows: Air temperature or Feels-like. Freezing level line (on). Freeze-thaw areas (off) | No height control: always 2 m above the terrain |
| Offline | Profiles and model ground height for the area; terrain from the map download | |

Detail cards:

1. Subject.
2. Headline: the temperature, and a sentence: "Feels like −6 (wind chill). Below freezing since about 4 PM."
3. Key stats, titled TODAY (the cursor's day): low with its time, high with its time, freezing level. Note line: daytime average and night-time average, split at sunrise and sunset.
4. Visual, titled BY ELEVATION: value against elevation at the cursor time, 0 °C marked.
5. Second visual: elevation over time, titled ABOVE OR BELOW 0 °C AT EACH ELEVATION.
6. Status line: freeze-thaw crossings, "crossed 0 °C down Thu 9 PM, up Fri 10 AM, down about 4 PM", with a note such as "Snow surface likely crusted overnight".
7. Expandable: Hourly detail (humidity, dew point, feels-like index and the wind it used).
8. Coming later: "Probability range, 10th to 90th percentile · comes with ensembles".
9. In view.
10. Footer: "Corrected to terrain from pressure levels".

### Wind

Screens: `23-Wind`, `24-WindHome`, `25-WindUp`, `26-WindScroll`, `27-WindSettings`.

| Slot | This layer | Rule |
| --- | --- | --- |
| Needs | Wind at 10 m (east and north parts), gusts at 10 m, wind on pressure levels, terrain; station wind for the past; ensembles later | Asks by variable |
| Map fill | Speed or gusts at the terrain, continuous, saturating at 60 km/h. Animated flow on top; arrows when the animation is off | Animation pauses when the app is hidden |
| Chart | Hourly speed bars, a white gust tick above each, direction arrows every 3 h along the top | Observed bars grey |
| Window summary | "Gusts to 62 km/h" with when and the range | |
| Legend | One bar, 0 to 60+ km/h | Saturated past 60 |
| Readout | Speed, gusts, direction as compass and degrees, elevation | One line |
| In view | Strongest gusts in view and where; prevailing direction | |
| Settings | Map shows: Speed or Gusts. Flow animation. Arrows when animation is off. Calm threshold: 10, 15, 20 or 25 km/h | No height control: follows the terrain |
| Offline | Wind grids and the needed pressure levels for the area and window | |

Detail cards:

1. Subject.
2. Headline: speed, and a sentence: "From the SW, gusting 52. Peaks around 9 PM, then turns NW overnight."
3. Key stats, titled NOW: speed, gusts, direction (compass with degrees).
4. Visual, titled BY ELEVATION: value against elevation, ridge against valley.
5. Key stats, titled STRONGEST GUSTS: in the window, and today, each with its time.
6. Status lines: direction shift ("SW to NW around Sat 2 AM · from 230° to 300°") and next calm ("below 15 km/h: Sat 7 AM, for about 9 h", using the calm threshold from settings).
7. Expandable: Hourly detail (speed, gusts and direction by hour).
8. In view.
9. Footer: "At the terrain, from 10 m wind and pressure levels".

## 6. Menus and panels

### Layer menu

Reference: `03-LayerMenu`. Grows from the layer name. Tiles in two columns, grouped. The board shows the whole plan; dashed tiles are planned and are **not shown in the app until built**.

| Group | Layers | State |
| --- | --- | --- |
| Core | Precipitation, Temperature, Wind | Designed. Build these. |
| Core | Cloud, Radar | Not designed yet |
| Later | Avalanche (stepped, as issued), Air quality (includes fires), Sun, Marine | Not designed yet |
| Later | Forecast (headline information pulled from the other layers) | Not designed yet |
| Overlays, later | Stations, Cameras (weather and road), Lines from layers (freezing line, snow line) | Not designed yet |

### Model menu and model info

Reference: `04-ModelMenu`, `05-ModelInfo`.

- Grows from the model button. Caption: "For this layer".
- Rows grouped HIGH RESOLUTION and GLOBAL. Each row: name, grid and reach ("2.5 km · to 48 h"), run age, and an i button. The current model is marked.
- Footer text: "Only sources that carry what this layer needs are listed. Tap i for a source's details." Then a "Compare two models" button (compare view not designed yet).
- The i opens the model's card, shared by every layer that uses the model: full name; grid, reach, runs a day, latest run and age, next run, coverage; STRENGTHS; CAUTIONS; SOURCE with attribution. Footer: "An accuracy score comes later, from the app's own comparisons over a season."
- Cautions are known findings from studies, not a score. For HRDPS: under-forecast precipitation on 83% of winter precipitation days in a Fernie study, so treat snow totals as a floor; ends at 48 h, the next model in the chain takes over and the seam is marked.

### Map panel

Reference: `02-MapLayers`. Grows from the map layers button. The settings gear sits in its header.

- BASE MAP: Topo, Satellite, Minimal.
- TERRAIN: Hillshade, Contours, Slope angle, 3D terrain (checkboxes).
- ROUTES AND PLACES: Trails, Resource roads, My routes, Sun and moon.
- OFFLINE: "Save this area" (choose layers and a time window) and "Saved areas" with a count.

Build Topo, Hillshade and Contours first. Show the others only when they work.

### Save area for offline

Reference: `08-SaveArea`. An instruction strip in the top bar's position ("Drag the corners to cover your area", Cancel). A dashed box with corner handles on the map. A panel at the bottom: area size; LAYERS, one checkbox row per layer with the size of its grids, with online-only layers disabled and explained ("Its source does not allow saving"); TIME WINDOW: 24 h, 48 h, 3 days, Model end; a line for map and terrain to a zoom level with its size; a primary button with the total, "Save area · N MB".

### Layer settings

Each layer's settings open in a grow panel from the **Layer settings** button in the details footer. Model and Compare stay in the model menu. Units stay in app settings.

## 7. Tokens

All in `design/tokens.json`: interface colours for dark and light, type scale, spacing, radii, sizes, and the three data ramps with their stops.

- Type: Space Grotesk for names and numbers that lead; Inter for the rest. Tabular numbers. 11 px is the floor.
- Spacing: 4, 8, 12, 16, 20, 34. Screen edge 16. Gaps 8 between controls, 12 between groups. Bottom inset 34 (use the bottom safe area).
- Radius: 3 chips, 8 chart and time track, 12 buttons, tiles and rows, 16 top bar, 20 sheet top, 24 grow panels, round icon buttons.
- Data ramps are continuous, with lightness carrying the order. Add a ramp only when its layer is built.

## 8. App name and icon

Reference: `12-AppIcon`, files in `design/icon/`.

- The app is called **Tempest**.
- The icon is "wind over peaks": two faceted white peaks on a navy ground with light-blue wind lines. Use `tempest-icon.svg`.
- `tempest-icon-light.svg` is the light version. `tempest-icon-single-peak.svg` reads better at very small sizes.
- Kaden chose this direction "for now", so keep the icon easy to swap.

## 9. Not designed yet

These have no v8 screen. Do not invent a finished design. When a milestone needs one, build the plainest version from existing components (grow panel, rows, cards), say so in the milestone report, and expect Kaden to redesign it.

| Piece | Guidance until it is designed |
| --- | --- |
| Alerts panel | Grow panel from the alert badge. One row per alert, exactly as issued: title, area, issue and expiry times, link. Official colours. |
| Search | Grow panel from the search button with a text field and result rows. Choosing a result moves the pin. |
| App settings | Grow panel from the gear in the map panel: units, theme, "saved data only" switch, credits generated from source metadata. |
| Saved areas list | Rows in a grow panel: name, size, model run and age, expired flag, refresh and delete. |
| Compare two models | Parked. The button exists in the model menu; leave it out until designed. |
| Full forecast window | Parked until more layers exist. Entry points are settled: a button at the foot of the details, and press-and-hold on the map. |
| Light theme screens | Tokens exist. No light screens in v8. |
| Cloud, Radar and all later layers | Wait for a design. Each follows the layer template. |
| Routes, trails, slope shading | Later. Not in the first build. |

## 10. Screen index

| File | Board |
| --- | --- |
| 01-Home | Home: sheet at its minimum, pin on you |
| 02-MapLayers | Map panel open |
| 03-LayerMenu | Layer menu: built and planned layers |
| 04-ModelMenu | Model menu, with i per source |
| 05-ModelInfo | Model info card, from the i |
| 06-SheetUp | Details pulled up: top (template) |
| 07-SheetScroll | Details pulled up: scrolled (template) |
| 08-SaveArea | Save area for offline |
| 09-Tokens | Tokens |
| 10-Components | Components |
| 11-DetailElements | Detail cards and their order |
| 12-AppIcon | App icon and name |
| 13-Precip | Precipitation: scale and slots |
| 14-PrecipHome | Precipitation: home |
| 15-PrecipUp | Precipitation details: top |
| 16-PrecipScroll | Precipitation details: scrolled |
| 17-PrecipSettings | Precipitation: layer settings |
| 18-Temp | Temperature: scale and slots |
| 19-TempHome | Temperature: home |
| 20-TempUp | Temperature details: top |
| 21-TempScroll | Temperature details: scrolled |
| 22-TempSettings | Temperature: layer settings |
| 23-Wind | Wind: scale and slots |
| 24-WindHome | Wind: home |
| 25-WindUp | Wind details: top |
| 26-WindScroll | Wind details: scrolled |
| 27-WindSettings | Wind: layer settings |

The live canvas for v8 is "Tempest: GUI template v8" on claude.ai. Versions 1 to 7 and every comment are on "Weather app: GUI template".
