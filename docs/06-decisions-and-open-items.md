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
| Map detail (Nov 15, after M1) | North Vancouver area at the base map's finest level (zoom 15), Horseshoe Bay to Deep Cove up to Cypress, Grouse and Seymour |
| Layer plan | As in `docs/01-product-brief.md` |

## 2. Defaults taken on Kaden's behalf

Kaden asked not to be interrupted, so these were chosen for him. Each is easy to change. Raise them in the M0 report so he can confirm.

| Topic | Default | Why |
| --- | --- | --- |
| Start region | North Shore and Sea to Sky | It is the area on every design screen |
| First platform | iPhone, as a home-screen web app | Fastest route to a phone; no Mac needed |
| Units | Metric, with a setting later | The screens are metric |
| Sources | Free ones only | Budget is "free for now" |
| Routes and trails | Not in the first build | The brief left it open; the design has no route screens |
| Icon variant | The dark two-peak version | It was the lead option on the icon board |
| Temperature averages | Daytime and night-time averages restored as a note in the TODAY card | Asked for in an early comment, dropped by accident in a later redraw |
| Layer menu | Shows the whole layer plan; unbuilt layers are hidden in the app | The template menu had placeholder tiles |
| Top bar offset | 8 px below the safe area | "Just below the status bar" needed a number |
| Stack | As recommended in the architecture spec | Not overruled |
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

- Elevation band rule (valley, mid, alpine) per region.
- Designs for alerts, search, app settings, saved areas list, compare, full forecast, light theme, and every layer after wind.
- Whether to keep the repo public (the simple answer to the GPL question) or private.
- Whether any paid source is worth it after a season on the free ones.
- Capacitor and the app stores.

## 5. Facts to check before relying on them

These came from research and were not all confirmed. Check each at the milestone that first needs it and record the result in `docs/spikes/`.

- Whether Open-Meteo's map files offer HRDPS as its own model, and whether partial reads work in an iPhone web view.
- The starter library's current name and API. Last seen: npm package `@openmeteo/weather-map-layer`, an `om://` protocol registered with MapLibre's `addProtocol`, data under `openmeteo-data-spatial.b-cdn.net`. It is young and changes often; read its README first.
- Real download sizes for a saved area.
- Avalanche Canada's terms, including keeping bulletins offline. Kaden should email them before the avalanche layer.
- Mapterhorn's coverage and resolution in BC.
- How much storage iOS grants a home-screen web app, and when it evicts it.
- Every access detail marked "not confirmed" in `docs/05-data-sources.md`.
- Current stable versions of every library. Do not trust version numbers written in these documents.

## 6. Things only Kaden can do

1. Create the GitHub repository and connect it to Claude Code on the web.
2. Set the cloud environment's network access so the weather and map servers are reachable (see `README.md`).
3. Create a hosting account if the preview host needs one.
4. Test each milestone on his phone and say go or change.
5. Email Avalanche Canada about data terms before the avalanche layer.
