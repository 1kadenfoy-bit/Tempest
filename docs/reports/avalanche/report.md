# Avalanche layer: report

Nov 17, 2026. There is no v8 design for this layer. It is built from the app's existing parts: the layer menu, legend, chart, detail cards and grow panels.

Ratings, words and colours are Avalanche Canada's, shown exactly as issued. The app only picks which issued day applies to the time you scrub to.

## What to try

1. **Pick Avalanche** in the layer menu.
   - Forecast regions are outlined and filled in their danger colour for the day under the time cursor.
   - Round note pins mark recent Mountain Information Network reports.
2. **Tap a region.** The pin moves there and the region's forecast opens:
   - the issue and valid-until times;
   - the three elevation bands (Alpine, Treeline, Below treeline) for the three issued days, in the official colours, with today outlined;
   - highlights, confidence, avalanche problems, travel advice and notices, all as written;
   - "Read the full forecast on avalanche.ca".
3. **Scrub the time.** The map recolours for each issued day. Past the third day there is no colour, and the readout says "No forecast".
4. **Tap a report pin.** You see its title, date, author, the observations as written, and photo thumbnails; tap a photo to see it larger. A link opens the report on avalanche.ca. Your pin stays where it is.
5. **Layer settings:**
   - map colour from Highest (the default, as on Avalanche Canada's map), Alpine, Treeline or Below;
   - field reports on or off;
   - reports from the last 7, 14 or 30 days.
6. **Saving for offline:** the Avalanche row is greyed out, online only until Avalanche Canada confirms its terms.
7. **Light theme and 3D terrain:** both work. Regions lie on the ground and pins stand on it.

**It is early season now.** Every BC region shows "Early season" in Avalanche Canada's blue. Their bulletin says daily forecasts begin **November 25 at 4 PM**, and from then you will see the green-to-black colours.

## Screenshots (390 × 844)

| File | What it shows |
| --- | --- |
| `map.png`, `region.png` | Today's real answers, served from saved copies (early season) |
| `region-test-ratings.png`, `light-3d.png` | **Made-up test ratings**, to show the colours. Not a real forecast |
| `report.png`, `photo.png` | A real report from Nov 15, Selkirks. The photo is a test picture, because the photo host was blocked from the build machine |

## What Avalanche Canada's terms say

- **[Terms of Use](https://avalanche.ca/terms-of-use):** "The material on this site may not be reproduced or copied without prior written consent." Logos and trademarks need written permission. None of their branding, logos, icons or page design is used.
- **[Data Sharing Policy](https://avalanche.ca/data-sharing-policy):** covers bulk requests from researchers and professionals, and points the public to "our public APIs".
- **[API page](https://avalanche.ca/api-docs):** documents forecast data for building "a complete forecast interface". It states no licence, attribution wording, rate limit or offline rule.
- **Field reports:** the reports endpoint is "not documented and subject to change". The reports and photos belong to the people who posted them.

**Reading:** unclear for a personal app, not forbidden. The layer is built for your testing, kept online only, and marked "pending Avalanche Canada's confirmation" in the credits.

## Terrain complexity (ATES) and its icons: not built

- **The data is in a private map.** The Trip Planner draws its zones from a private Mapbox map owned by Avalanche Canada, opened with their own account key. Using that key or map would mean using their account.
- **The only published copies** are one KMZ file per zone, downloaded by hand from the Trip Planner after a disclaimer.
- **No exact colours or reusable icons.** The scale's colours are published only in words (simple green, challenging blue, complex black), and no icons are published for reuse; their site terms reserve their graphics.
- **Open-data copies not checked:** open.canada.ca and the BC Data Catalogue were blocked from the build machine.

## Not checked yet

- **The documented address.** `avcan-services-api.prod.avalanche.ca` was blocked from the build machine. The app reads `api.avalanche.ca`, which answers the same requests and allows browser use.
- **Report photos.** The photo host was blocked from the build machine. **Please check on your phone**; if a photo says "Photo could not load", tell me.
- **The pin's own band.** Avalanche Canada gives no treeline height per region, so the app never guesses your band. The readout names the band the colour comes from, for example "Considerable (3) · Alpine".

## Questions for you

1. **Email Avalanche Canada** (info@avalanche.ca), asking:
   - May a personal, non-commercial, no-ads app show your forecasts (ratings, region outlines, highlights, problems) as issued, with your name, issue time and a link?
   - May it keep the latest bulletin on the phone for use without signal, shown with its issue and expiry times?
   - May it show Mountain Information Network reports with their photos, each linking to its page on avalanche.ca? Is `api.avalanche.ca/min/submissions` the right address?
   - Which address should apps use, and is there a polite request rate?
   - Is the ATES terrain rating data available for an app to show (GeoJSON or vector tiles), under what terms, and may the ATES symbols be reused?
2. **Tapping a region** moves the pin and opens the forecast, as on Avalanche Canada's map. Keep that, or should a tap only move the pin?
3. **Long titles.** The early-season bulletin covers 94 regions, so the panel shows "Akamina, Badshot and 92 more regions", with the full list underneath. Is that clear?
