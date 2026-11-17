# Weather stations overlay

Nov 17, 2026. No v8 design: built from the app's existing map panel switches, grow panel, fact tiles and chart style.

## What to try

1. **Turn it on.** Open the map panel (the layers button). Under **OVERLAYS**, turn on **Weather stations**. It starts off and is remembered.
2. **Read the markers.** Small round markers show the stations in view, plain white and black, because colour is kept for weather data. Beside each is what it measured, matching your layer:
   - Precipitation: the past hour's amount.
   - Temperature: the air temperature.
   - Wind: the speed, with an arrow showing which way it blows.
   - Other layers: just the marker.

   A reading more than two hours old makes the marker dashed and faded.
3. **Tap a marker.** A panel shows:
   - the station's name, who runs it, its elevation and its distance from your pin;
   - when it last reported, with the age (amber when over two hours);
   - its latest values;
   - 48 hours as measured, not smoothed: temperature as a line, wind as bars with a gust tick, precipitation as bars;
   - the source and a link.

   Your pin stays where it is.
4. **Other settings.** Units, the light theme and 3D all work; in 3D the markers sit on the ground.
5. **No signal, or "Saved data only":** the markers go away and the switch says "Needs a connection".

Markers show from zoom 7 inward.

## Stations near the North Shore and Sea to Sky

**Environment Canada (live).** Mostly low:

| Station | Elevation |
| --- | --- |
| Point Atkinson | 15 m |
| West Vancouver | 171 m |
| Pam Rocks | 9 m |
| Port Mellon | 131 m |
| Squamish Airport | 57 m |
| Callaghan Valley | 887 m |
| Whistler Nesters | 662 m |
| Pemberton | 205 m |

The same feed includes BC Wildfire's Mount Cayley (1,592 m, reports now and then).

**Avalanche Canada's list.** These are the BC highways mountain stations:

| Station | Elevation |
| --- | --- |
| Mt. Strachan, Cypress | 1,420 m |
| Cayoosh Summit | 1,250 m |
| Blowdown Mid | 1,890 m |
| Blowdown Peak | 2,320 m |
| Brandywine | 496 m |
| Tantalus | 320 m |

## Not verified

- **Avalanche Canada's readings.** Their station server was blocked from the build machine, so I could not see real answers, or check whether it lets other websites read it. The station list is real, taken from their public page. If your phone can read the server, the mountain stations show values; if not, only Environment Canada's show, with no error. **Please turn the switch on near Cypress and tell me whether Mt. Strachan appears with a value.**
- **Terms.** Avalanche Canada has no written API terms; their website terms and data policy apply. BC Wildfire, Parks Canada and Metro Vancouver readings say "All rights reserved", and the app shows each notice word for word with the station.
- **"Gust" means different things by source:**
  - Environment Canada stations: the highest wind in the past hour.
  - Airports: the 10-minute gust.
  - Avalanche Canada: the gust the station reports.
