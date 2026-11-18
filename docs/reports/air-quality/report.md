# Air quality layer

Nov 18, 2026. There is no v8 design for this layer. Everything is built from parts the app already has: the legend bar, the chart, the detail cards, the grow panel and the source menu.

## What it does
- **Map colour:** fine particles (PM2.5) near the ground for the hour under the time cursor, in µg/m³.
  - **ECCC** (the default source) is ECCC's air-quality forecast, RAQDPS with FireWork.
    - 10 km cells, 72 hours ahead.
    - By default it shows wildfire smoke only. Layer settings → "All PM2.5" shows particles from every source.
    - For the past two days it uses ECCC's earlier runs.
  - **CAMS** (from the source button) is CAMS global through Open-Meteo.
    - About 40 km cells, all particles only.
    - Two days back and about 4½ days ahead.
- **Colours:** ECCC's own scale for this product (1–500 µg/m³), blended smoothly. Nothing is drawn under 1 µg/m³.
- **Pin readout:** the value for the cursor's hour and where it came from, for example "84 µg/m³ PM2.5 · CAMS 40 km".
- **Chart:** hourly bars in the map's colours.
- **Details:**
  - the value, with which model and run it came from, and "a model forecast, not a measurement";
  - now, peak and average across the window;
  - the Air Quality Health Index (AQHI) from the nearest ECCC station within 100 km, observed and forecast, exactly as issued;
  - fires burning within 50 km;
  - hour-by-hour tables.
- **Fires:** BC Wildfire Service's fires as flame marks, with mapped perimeters as outlines.
  - They follow the time cursor by their issued dates.
  - Tap one for its panel, as issued: status, number, size, dates, cause, fire centre, perimeter and a link to BC Wildfire. The pin does not move.
  - When the cursor is on a past day and the fire has since been declared out, the panel says so.
- **Forecast summary window:** Air quality can be ticked in the window's settings. Its strip loads even when another layer is on the map.
- **Offline:** online only, greyed out in the save panel with the reason. The latest fire list is kept on the phone, with its fetch time.

## What to try
1. Open the layer menu and choose Air quality.
2. Tap ECCC in the top bar and switch to CAMS. Drag the chart back two days.
3. Tap a flame mark.
4. Pull the sheet up for the AQHI and the nearby fires.
5. Open Layer settings to switch between smoke and all PM2.5, and to turn the fires or perimeters off.

## Pictures (390 × 844)
- **The August pictures use recorded August 2026 data from CAMS (40 km).** ECCC keeps only two days, so no smoky ECCC answer exists.
- **The November pictures use a recorded real ECCC answer from Nov 18,** which is clean air.
- **No picture shows live ECCC smoke.**

| Picture | What it shows | Data |
| --- | --- | --- |
| `smoky-aug10-cams.png` | Manning, Sun Aug 9, 5 PM (Aug 10 00Z): 84 µg/m³ at the pin; fires and perimeters that day | Recorded CAMS 40 km; real fire list |
| `smoky-aug10-cams-wide.png` | The same hour, zoomed out | Same |
| `fire-panel.png` | Pasayten River (K61186) as issued, with the "since declared out" note | Real BC Wildfire answer |
| `details-aug10.png` | Peak 265 µg/m³; no AQHI station within 100 km | Recorded CAMS |
| `quiet-aug30-cams.png` | Quiet day, under 15 µg/m³ | Recorded CAMS |
| `eccc-nov18.png` | Today on ECCC: no smoke, "00Z run · 12 h old" | Recorded ECCC 10 km |
| `details-eccc-aqhi.png` | AQHI 1 · Low risk at Eastern Fraser Valley (ECCC's value 1.41) | Recorded ECCC AQHI |
| `settings.png`, `source-menu.png`, `layer-menu.png` | Settings, the two sources, the new layer tile | — |

## Sources and terms

| Source | Licence | Notes |
| --- | --- | --- |
| ECCC RAQDPS (GeoMet) | Open Government Licence – Canada | Not to be bulk-copied, so online only |
| ECCC AQHI | Open Government Licence – Canada | Shown as issued |
| BC Wildfire Service | Open Government Licence – British Columbia, **not confirmed** | The dataset pages were blocked from the build machine; marked "reference only" |
| CAMS via Open-Meteo | CC BY 4.0 (Open-Meteo); Copernicus licence (CAMS) | Each point asked for counts against the free daily limit; at most 64 per view, once per view and day |

All four appear on the credits screen, generated from their data connections.

## Choices made (easy to change)
- **CAMS as a second source:** the only way to look at last summer's smoke, and it let the tests run the real code on smoky August days.
- **ECCC's colour scale, not the US AQI's:** the US AQI colours could not be checked from the build machine.
- **No health categories for the smoke numbers:** that would be the app rating safety data. The only health index shown is ECCC's own AQHI, with ECCC's risk words.
- **Neutral fire marks, status in words:** no published BC Wildfire status colours were found.
- **Which fires show:**
  - A fire shows when its issued dates say it was burning that BC day.
  - The day it was declared out counts as out.
  - A fire with no out date shows from now on, unless its status is "Out".
  - The app asks only for fires still burning, or declared out in the last three days.
- **ECCC's smoke analysis (RDAQA) is not used for the past:** it counts all particles, not smoke only.
- **The ECCC pin needs about 120 small requests** (ECCC answers one hour per question), six at a time.

## Not built yet
- BC Wildfire's fire danger rating, fire bans and restricted-area overlays.

## Not checked
- BC Wildfire's licence page, ECCC's AQHI web page and Open-Meteo's attribution wording (all blocked from the build machine).
- Live ECCC smoke on a smoky day.
- Whether the fire dates are BC days or UTC days (treated as BC days).

## Questions for Kaden
1. Keep CAMS in the source menu, or use it only for testing?
2. Default map: wildfire smoke only, or all PM2.5?
3. Add the BC fire danger, bans and restricted-area overlays next?
