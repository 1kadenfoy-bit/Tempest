# Working notes (Performance chat, Nov 27): raw findings before the report

Draft only. Numbers are from the build machine (no graphics chip; drawing in
software), through the session's network proxy, unless marked.

## Loading (tools/perf/load.mjs, data in data/)

- Local build, recorded weather, no slow-down: first map 2.2 s, pin forecast 4.1 s,
  first weather 5.3 s, everything 6.9 s. Repeat open: 1.5 / 3.6 / 4.6 / 6.6 s.
- Live site (main, GitHub Pages), live weather: everything ~10.5 s first open,
  ~6.5 s repeat open, ~15.9 s on "Slow 4G" (1.6 Mbit/s, 150 ms).
- First open downloads ~3.7 MB (live site, gzip). App code 0.82 MB; terrain
  1.1 MB; weather 0.7 MB; base map 0.33 MB; app fonts 0.27 MB; places 0.18 MB.
- Weather waits for the map: loadRun() is called in map.on('load') (app/main.ts),
  so no weather request starts before the map's first full picture.
- Weather is a chain of dependent steps: latest.json (4 models) -> HRDPS
  meta.json -> first .om file -> decoder (wasm 2.1 MB, 216 kB gzip, loaded only
  then) -> 64 kB range reads one after another -> picture.
- The service worker's first install downloads every built page's code
  (spike, effects, data viewer) during the map's first seconds.
- Terrain tiles at z11 are asked for twice (two sources).
- Fill failures: updateFills() catches and logs; no retry, no message, until the
  map or the cursor moves (app/weather/fills.ts).

## Open-Meteo limits (checked Nov 27 in the website's own source,
github.com/open-meteo/open-meteo-website, routes/en/pricing and terms)

- Free: "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute."
  "Rate limits are applied by IP addresses and application."
- Weight: "Requests for data covering more than 10 weather variables or
  extending over a period of more than 2 weeks for a single location are
  considered multiple API calls." The calculator: max(1, vars/10 x max(1, days/14)) x locations.
- The pin series: 77 variables x 1 location = 7.7 calls per model; three models
  on open = ~23 calls.
- The map's profile nodes: 20 locations x 42 variables = 84 calls per request.
