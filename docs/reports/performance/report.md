# Performance report (Nov 27, 2026)

The Performance chat, for Kaden. Plan: `docs/plans/performance.md`. Kaden's
targets: `docs/wishes/performance.md`. This report measures and ranks; it
fixes nothing. Fixes go to the section that owns each part, in the order of the
fix list at the end.

All raw numbers are in `data/`. How each was measured is under "How this was
measured" near the end.

## In short

1. **Moving the map is too slow on average and stops for 0.13 to 0.5 s
   several times a pan.** On your iPhone 12 at full speed, panning averaged 21
   to 30 frames a second, the slowest 1% of frames ran at 5 to 6 a second, and
   the longest stops were 0.17 to 0.51 s.
2. **Two different causes:**
   - **The averages: the glow.** It copies the finished map picture back after
     every frame, so the phone waits for the drawing each time. With the glow
     off for one run on your phone, panning went from 21 to 34 frames a
     second, pinching from 17 to 31 and dragging the time from 11 to 23.
   - **The stops: a few pieces of the app's own code** that run on the main
     processor, during which nothing can be drawn (they stay the same with the
     glow off):
     - rain or snow at each spot's real height, worked out again twice a
       second while the map moves and at each time step (up to 0.2 s on the
       build machine, about 0.12 s on your phone at full speed);
     - the mountain shadows, worked out again each time the map stops (up to
       0.3 s, about 0.18 s on your phone);
     - the terrain heights both of those read, decoded from pictures;
     - the wind layer's ground smoothing (0.16 s when switching to wind).
3. **Dragging the time slider draws fewer than half the steps** (21 of 48),
   because the map waits for the finger to pause for 0.06 s before drawing.
   It catches up 0.06 s after the finger stops.
4. **Opening passes when the app's files are already on the phone** (3.9 to
   5.8 s) **and misses on a first open** (7.0, 7.1, 7.2 and 13.5 s). Nothing about the weather starts
   until the map has its first full picture, and the weather then waits on five
   steps one after another.
5. **A weather layer can fail to arrive because the app uses up the forecast
   server's free allowance quickly.** By the server's own counting rule, opening
   the app costs about 110 to 240 of the 600 "calls" allowed a minute, and each
   new view another 120 to 190. The app keeps its own count and, when a
   request would go over, holds it back silently for up to 90 s. Past the
   limit the layer falls back to a much
   slower route (about 9 s, or more than 15 s, for wind on the build machine),
   and a layer that fails is not asked for again until you move the map or the
   time.
6. **Taps and menus already pass** (0.02 to 0.1 s). **Layer switches mostly
   pass** (under 0.5 s), except wind (1.0 to 1.4 s) and air quality (1.4 s).

## Your targets, passed or failed

Phone: iPhone 12, Safari, iOS 18.7, Kaden's setup (3D terrain and buildings
on, sun on, Terrain ground, precipitation layer), live weather. "LPM" is Low
Power Mode, which caps Safari at 30 frames a second and slows the processor;
the full-speed run is the one that counts.

Build machine: the same tour, in a phone-sized browser, on recorded weather.
It has no graphics chip and draws in software, so its frame rates are far
below a phone's; it is used to compare features and versions with each other,
not to judge the targets.

Calibration: the tour's Yardstick (a fixed loop of the kind the app runs over
terrain pictures) took 14.8 ms on the build machine, 15 ms on the iPhone 12
with Low Power Mode on and 8–9 ms at full speed. So the phone runs the app's
own code at about the build machine's speed in Low Power Mode and about 1.7
times faster at full speed: a 0.3 s stop of the app's code on the build
machine is about 0.3 s on the phone in Low Power Mode and about 0.18 s at full
speed. Drawing does not carry over: the phone's graphics chip is far faster
than drawing in software.

| Target (Kaden, Nov 27) | iPhone 12, full speed (runs 3 and 6) | iPhone 12, Low Power Mode (runs 1, 2, 4) | Build machine | Result |
| --- | --- | --- | --- | --- |
| 1. Open, everything loaded, under 7 s | 13.5 s and 7.2 s (each the first open after a new preview); 3.9 s on the next open | 7.0 s and 7.1 s first; 5.8 s repeat | 6.9 s first, 6.6 s repeat (recorded weather, local); 10.5 s first, 6.5 s repeat, 15.9 s on slow mobile (the real site, live weather) | **Fails on a first open; passes when the files are already on the phone** |
| 2. Pan, pinch, tilt: 30 fps average, slowest 1% at 24 | Pan 30 / 5 and 21 / 6; pinch 24 / 5 and 17 / 7; tilt 44 / 8 and 24 / 8 | Pan 11–12 / 3; pinch 11–12 / 4–5; tilt 16–18 / 4–6 | (software drawing: 1–4 fps) | **Fails** (the slowest 1% everywhere, the average in most runs) |
| 3. Time slider and play keep up | Drag: 21 of 48 steps drawn, 11–17 fps, stops of 0.17–0.51 s. Play: 14 of 14 steps, 38–45 fps | Drag: 21–22 of 48. Play: 13 of 13 | Drag: 23 of 48 | **Drag fails, play passes** |
| 4. Taps answer in 0.1–0.2 s | 0.02–0.09 s | 0.03–0.10 s | 0.01–0.03 s | **Passes** |
| 5. Layer switch under 1 s | Temperature 0.1, wind 0.1–1.0, radar 0.3, avalanche 0.2–0.3, air quality 0.6–1.4, precipitation 0.0 | Wind 0.2–1.4, air quality 0.4–1.2, avalanche 0.2–1.1, radar 0.3–3.8 | Wind 9 s or none in 15 s (point API refused: see "Why a layer sometimes never arrives") | **Mostly passes; wind, air quality and radar sometimes miss** |
| 6. No work while untouched | 11–24 map redraws in 15 s, all while the map was still finishing after the tour moved it home (see "Not measured") | 0–18 redraws, the same | 0 redraws; the time chart is redrawn every 30 s; timers every 60 s and 10 min | **Fails** (small: the timers) |
| 7. Memory below Safari's reload point | Safari does not report memory | — | 57–109 MB of script memory | **Not measurable on the phone** |
| 8. Feels "live" | the stops in 2 and 3 | | | **Fails** until 2 and 3 pass |

## Why it stops while moving (the causes, slowest first)

### 1. The glow copies every frame back from the graphics chip

`app/map/tuner.ts` (Maps): after every frame the map draws, the glow copies the
whole map picture into a small canvas, and the page blurs it and lays it over
the map with a "screen" blend. Copying a picture back out of the graphics chip
makes the processor wait until the chip has finished drawing that frame, so
the two can no longer work at the same time.

Evidence:
- Build machine, code profile of the whole tour on Kaden's setup: 192 of the
  209 busy seconds were spent inside that copy (`drawImage`)
  (`data/profile-kaden-3d.json`). With the glow off for the same tour, that
  time moved to the drawing itself ("program"), as expected on a machine that
  draws in software (`data/profile-kaden-3d-no-bloom.json`): there the copy is
  where the waiting shows, not extra work.
- Still-frame drawing cost: the glow adds 12% to every frame with 3D on, 10%
  with 3D off (`data/features-cost*`).
- **On Kaden's iPhone 12**, the same tour with the glow on and off
  (`?perf&off=bloom`), a few minutes apart (`data/phone-iphone12-safari-4` to
  `-7`):

  | | Full speed: glow on | Glow off | Change | Low Power Mode: glow on | Glow off | Change |
  | --- | --- | --- | --- | --- | --- | --- |
  | One still frame | 27 ms | 17 ms (one screen refresh) | −10 ms | 33 ms (the 30 fps cap) | 33 ms | — |
  | Pan | 21.2 fps | 34.2 fps | **+61%** | 11.4 | 16.6 | +46% |
  | Pinch | 16.8 | 31.1 | **+85%** | 10.8 | 10.5 | — |
  | Tilt 3D | 24.1 | 42.9 | **+78%** | 17.3 | 20.2 | +17% |
  | Drag the time | 10.7 | 22.6 | **+111%** | 7.8 | 13.4 | +72% |
  | Play | 38.1 | 44.0 | +15% | 18.9 | 21.6 | +14% |
  | Longest stop while panning | 0.17 s | 0.19 s | same | 0.38 s | 0.35 s | same |

  The glow is the largest single cost of the averages: without it, panning
  and pinching pass the 30 fps average at full speed. It does not cause the
  stops: the slowest 1% and the longest stops are the same with it off. Those
  come from causes 2 to 4.

### 2. Rain or snow at real height, worked out on the main thread

`app/weather/fills.ts` → `updatePrecipLine` → `levelLine` in
`app/map/freezing-line.ts` (Weather on the map). The rule (Nov 16): rain or
snow from the wet-bulb temperature at each spot's real height, the same for the
map's colours, the line and the readout. The app works it out over the whole
view each time the fill updates: twice a second during a pan, at each time
step while playing or dragging, and on every layer switch, even with the
rain/snow line switched off, because the colours need it.

Evidence (build machine, code profile, longest uninterrupted stretches of
script): 0.14 s during the pan, 0.15 s during the tilt, 0.09 s per step while
playing, 0.20 s and 0.12 s when switching layers
(`data/profile-kaden-3d-no-bloom.json`, `longestScript`). During those
stretches the screen cannot draw.

### 3. Mountain shadows, worked out on the main thread

`app/map/shadows.ts` and `app/map/shadow-mask.ts` (Maps). Each time the map
stops moving, the shadows are worked out again over the view plus a margin,
turned into a PNG picture (`toDataURL`) and handed to the map, which decodes it
again.

Evidence: the longest single stretch of script in the whole tour, 0.31 s
during the tilt; 0.08 to 0.10 s at other stops. In the tour, each move follows
the last at once, so the work lands inside the next move; with a finger, it
lands just after lifting.

### 4. Terrain re-read from pictures, on the main thread

`app/map/elevation.ts` (Maps). The heights under the view are read by
decoding the terrain tiles into pixels and looping over every pixel (up to 25
tiles of 512 × 512). Used by both the rain/snow work (2) and the shadows (3),
each with its own copy, and by the temperature and wind fills. The tiles are
downloaded a second time for this: the map's own terrain layer already has
them.

Evidence: 0.4 to 1.0 s of script per pan step in the profile, in pieces of
roughly a tile each (`(anonymous) · app/map/elevation.ts:84`).

### 5. The time slider waits for the finger to pause

`app/main.ts` (lead) subscribes the fill to every cursor step with
`scheduleFills(60)`, which waits until no step has come for 0.06 s. A finger
moving through steps faster than that gets no picture until it slows. When
it does draw, each step costs the rain/snow work again (2).

Evidence: iPhone 12, 21 of 48 steps drawn while dragging (all three runs); the
map catches up 0.06 to 0.08 s after the finger stops. Play (one step every
0.7 s) draws every step.

### 6. Wind's ground smoothing

`core/wind/wind.ts` `smoothGround` (Weather on the map): 0.16 s in one
stretch when switching to wind (build machine).

### What does not matter much

The map library's own script is small (1.4 s over the whole 3-minute tour).
Taps and menus answer within two frames.

## The cost of each feature (drawing one frame, camera still)

Build machine, software drawing, median of 12 frames, two runs each (three for
the base). With 3D on, the map library keeps the flat layers as ready-made
pictures on the terrain and does not redraw them every frame, so most layers
cost little there; the 3D-off table shows each layer's own drawing cost.
Differences under about 5% are within the noise between runs.

| Feature | 3D on (Kaden's setup): base 183 ms a frame | 3D off: base 298 ms a frame |
| --- | --- | --- |
| Everything below off together | −30% | −55% |
| Relief shading and contour lines | −2% (noise) | **−30%** |
| Satellite instead of Terrain | −1% | **−20% (cheaper)** |
| Sun lighting (sun switch off) | +4% (noise) | **−13%** |
| Terrain zone colours | +4% (noise) | **−11%** |
| Glow (bloom) | **−12%** | **−10%** |
| Water waves and sparkle | +1% | −8% |
| Mountain shadows layer | +3% | −7% |
| Labels and icons | +5% (noise) | −4% |
| Weather fills | −2% | −4% |
| Haze | +6% (noise) | −2% |
| 3D buildings | −1% | — |
| Temperature instead of precipitation | +0% | +13% |
| Wind instead of precipitation | +1% | +10% |
| Clouds switched on | **+152%** | **+94%** |
| Wind streaks switched on | +2% (still) | +1% (still) |

Notes:
- Clouds more than double the cost of every frame. They are off in your setup.
- Turning 3D on makes still frames cheaper here (183 against 298 ms), because
  of the ready-made pictures, but loading slower: everything loaded at about
  20 s with 3D on against 7 s with 3D off on this machine (drawing in software).
- Each feature's drawing cost here is the graphics chip's work; the stops in
  "Why it stops" are the processor's. Both matter on the phone.

## Loading

### What the app downloads

Real site (main, GitHub Pages), live weather, build machine
(`data/load-live-site.json`):

| What | First open | Repeat open |
| --- | --- | --- |
| App code (script, styles, decoder) | 0.82 MB (gzip) | 0 (kept copy) |
| Terrain tiles (Mapterhorn) | 1.15 MB, 34 files | 0 (browser cache), 28 files checked |
| Weather (Open-Meteo map files and point API) | 0.73 MB, 17 files | 0.05 MB |
| Base map pieces | 0.33 MB | 0.24 MB |
| App fonts | 0.27 MB | 0 |
| Peak and hut names | 0.18 MB | 0 |
| Map fonts and icons | 0.18 MB | 0 |
| **Total** | **3.7 MB, 144 requests** | **0.3 MB, 94 requests** |

On "Slow 4G" (1.6 Mbit/s, 0.15 s round trips): the same 3.7 MB; everything
loaded at 15.9 s.

### What blocks the first map

1. The page, then its two main scripts (125 kB and 346 kB gzip).
2. The base map's index (`tiles/basemap.json`) and the saved areas, before the
   map is made.
3. The map's icons and fonts from protomaps.github.io (a second site, so a new
   connection), the base map file's header and directory, then its tiles; the
   map fonts are only asked for once the first tiles are read.

iPhone 12: first map at 3.8 to 4.0 s (8.4 s in the slow run). Build machine:
2.2 s on recorded weather.

### What blocks the first weather

Nothing about the weather starts until the map has its first full picture:
`loadRun()` is called from the map's `load` event (`app/main.ts`, lead). Then,
one after another:
1. the four models' newest runs (`latest.json`, from Amazon S3);
2. HRDPS's description (`meta.json`, Open-Meteo);
3. the first weather file, the decoder program (2.1 MB, 216 kB gzip, loaded
   only now) and the file's index;
4. the variables, read one after another (`readNativeBox` in
   `render/openmeteo-starter/index.ts`), in 64 kB pieces;
5. then the rain/snow work (cause 2).

iPhone 12: first weather 1.3 to 2.2 s after the first map. The pin's forecast
waits for step 1 too, then asks the point API for three models.

The app's location (`locate`) is also asked for only after the map's `load`.

### The installed app's kept copy

The installed app keeps the app's files on the phone (`public/sw.js`). On its
first start it downloads every built page's files, including the test pages
(spike, effects lab, data viewer), while the map is loading. The section
previews keep no copy, so the installed app's repeat open could not be timed
on the phone yet (see "Not measured").

### Why a layer sometimes never arrives

Open-Meteo's free limits are 600 calls a minute, 5,000 an hour and 10,000 a
day, per IP address ("Rate limits are applied by IP addresses and
application"). A request counts as several calls: "Requests for data covering
more than 10 weather variables or extending over a period of more than 2
weeks for a single location are considered multiple API calls"; the site's
calculator multiplies by the number of places. (Checked Nov 27 in the
website's own source, github.com/open-meteo/open-meteo-website, pricing and
terms pages; open-meteo.com itself is not reachable from the build machine.)

What the app spends, counted with that rule (`tools/perf/api-weight.mjs`):

| Action | Calls |
| --- | --- |
| The pin's forecast, one model (77 variables) | 7.7 |
| The pin's forecast on opening (three models) | 23 |
| Opening the app: precipitation / temperature / wind | 108 / 158 / 240 |
| One new view (the profile nodes: 20 places × 42 variables = 84 each request) | 118 to 189 |

So two or three new views and an open can use the minute's 600, and about 30
to 40 new views the hour's 5,000.

The app already keeps its own count, with a margin (`app/data/api-cache.ts`,
Data): 500 calls a minute and 4,500 an hour, remembered across reloads. A
request that would go over **waits, silently, for up to 90 s** until there is
room, and only then counts as refused. Answers are kept on the phone until
their run is replaced, so going back to a place costs nothing. While a request
waits, its layer shows nothing new: this is the most likely reason a layer
"doesn't load in time" after looking around for a minute.

What happens past the limit (`app/data/profile-source.ts`, Data):
- the per-minute limit: the pin waits for the next minute; the map's nodes are
  read from the map files instead, one hour at a time;
- the hourly or daily limit: the map files for up to an hour, or until the
  next UTC day;
- the map files are much slower: on the build machine, with the point API
  refused (recorded weather answers "not recorded" for anything it does not
  hold), switching to wind took 9 s once and had no picture in 15 s another
  time; on the phone, with the API answering, 1.0 to 1.4 s.

And when a fill fails for any reason, `updateFills` logs the error and stops
(`app/weather/fills.ts`, Weather on the map): no new try and no message until
the map or the time moves.

Not reproduced: Kaden's phone did not hit the limit during the speed tests, and
the build machine did not spend live calls on it (the limit is shared by every
chat on the build machine).

## Then against now

_Filled in when the runs finish._

## Fix list

In order of what they gain. Each names the owner (`docs/sections/sections.json`),
the target it should move, and the rules it touches and how they are kept. No
fix may change how anything looks or behaves; each is checked again after it
lands: the section's own browser tests, its screenshots against the ones
before, and this tour on the build machine and on Kaden's phone
(`?perf`, and `?perf&off=...` where a feature is involved).

| # | Fix | Owner | Moves target | Rules it touches, and how they are kept |
| --- | --- | --- | --- | --- |
| 1 | **The glow without copying the frame back.** Make the same glow inside the map's own drawing, on the graphics chip: copy the finished frame to a texture there, shrink and blur it with shaders, and blend it over with the same "screen" mix, brightness, contrast and saturation as now. The processor never waits for the chip. | Maps (`app/map/tuner.ts`) | 2, 8 | Maps 19 (the game look) and 23 (bloom 0.65): same recipe, same strength; screenshots at rest compared pixel by pixel with today's. The Tune panel's bloom slider still works (Maps 21). The glow still matches every frame exactly, so the white pulse while panning (fixed Nov 22, `f913b48`) cannot come back. |
| 2 | **Rain or snow at real height off the main thread.** Run the same calculation (`levelLine`, the wet-bulb grid and the heights it reads) in a worker, and skip it when nothing it reads has changed (same view, same step, same profiles). The picture already shown stays until the new one is ready, as it does now while data downloads. | Weather on the map (`app/weather/fills.ts`, `app/map/freezing-line.ts`) | 2, 3, 5 | Decision "Rain or snow" (Nov 16): the same function and inputs, so the same numbers for the map's colours, the line and the readout; a unit test compares the worker's output with today's. Maps 13 (the lines hold still when zooming): unchanged. |
| 3 | **Mountain shadows off the main thread, without the PNG round trip.** Work out the mask in a worker and give the map the pixels directly instead of encoding a PNG and decoding it again. | Maps (`app/map/shadows.ts`, `shadow-mask.ts`) | 2, 8 | Maps 18, 20, 23 (shadows follow the scrubber's time, never wash out, strength 0.65): same mask, same colour and opacity; screenshots compared. |
| 4 | **One terrain-height reader, in a worker.** Shadows, rain or snow, temperature and wind each read the heights under the view; read them once, off the main thread, and share them (and, where possible, use the terrain tiles the map already downloaded instead of downloading them again). | Maps (`app/map/elevation.ts`), with Weather on the map for its uses | 2, 1 | None visible: the same heights. |
| 5 | **The time slider draws each step it already has.** When a step's weather is already in memory, draw it at once; keep the short wait only for steps that must be downloaded. | The lead (`app/main.ts`, the cursor's subscriber) with Weather on the map (`scheduleFills`) | 3 | "Readouts use real model steps" and "one time cursor": unchanged; the same steps are drawn, sooner. |
| 6 | **Don't hold a map layer back silently for the allowance.** The map's requests wait up to 90 s for room under the app's own count; let the map take the map-file route at once instead (the decision already says the map files answer when the API cannot), and keep the long wait for saving. | Data (`app/data/api-cache.ts`, `profile-source.ts`) | 5, 1 | Decision "Temperature data" (M4): the point API first, the map files when it cannot; the same numbers either way (checked Nov 17). The app still stays under the free limits. |
| 7 | **Try a failed weather picture again by itself.** Today a failed fill is logged and nothing happens until the map or the time moves; ask again with the same back-off the pin's forecast already uses. | Weather on the map (`updateFills`) | 5 | None: the layer shows what it would have shown. |
| 8 | **Start the weather while the map loads.** Ask for the newest runs, HRDPS's description and the decoder program when the app starts, not when the map's first picture is done; the same for the location. | The lead (`app/main.ts`) with Data (`loadRun`) | 1 | "One read path": unchanged. Nothing is drawn before the map exists. |
| 9 | **Read a weather file's variables at the same time.** `readNativeBox` reads them one after another; the parallel reader already used for saving (`readBoxFast`) does the same reads together. | Data (`render/openmeteo-starter/`) | 1, 5 | The rendering seam (GPL starter library behind `render/`): unchanged. Same numbers. |
| 10 | **Wind's ground smoothing** worked out once per view in a worker (or kept between steps). | Weather on the map (`core/wind/wind.ts`) | 5, 2 | None visible: same smoothing. |
| 11 | **Nothing redrawn while untouched.** The time chart is redrawn every 30 s and the run age every 60 s even when nothing on them would change; redraw only when the text or the now line would actually move. Find the source of the redraws seen once on the phone. | Interface (`app/shell/scrubber.ts`) and the lead (`app/main.ts` timers) | 6 | Data rule "stale data is shown with its age": the age still changes on screen when it changes. |
| 12 | **The installed app's first start downloads only what the map needs first.** Keep every file, as now, but fetch the test pages' files (spike, effects lab, data viewer) after the map and weather have loaded. | Data (`public/sw.js`) | 1 | Offline from the next launch: unchanged, every file is still kept. |
| 13 | **Clouds' cost** (+94% to +152% per frame when switched on): profile and cut work that does not show (for example drawing parts of the sky that are covered). | Effects (`render/effects/cloud-layer.ts`) | 2, when clouds are on | Effects 4 (clouds show the weather's heights and cover): same look; only hidden work cut. |

After fixes 1 to 4, the next run of the tour should show it: the longest stops
during pan, pinch and the time drag are what fixes 1 to 3 target.

## Trade-offs for Kaden to decide

None of these is made; each is yours to choose. Gains are from the build
machine (share of one frame's drawing, or the length of a stop) and will be
checked on your phone before you decide.

| Option | Gains | Costs |
| --- | --- | --- |
| Glow off, or weaker | 10–12% of every frame, and the processor stops waiting each frame (until fix 1 lands) | The game look's glow (Maps 19, 23) |
| Relief shading lighter with the sun on (one light instead of several) | Part of the 30% that relief and contours cost with 3D off | Less shaped relief |
| Rain or snow by height worked out only once the map stops moving, not during a pan | The 0.14–0.20 s stops during pans | During a pan, the rain/snow colours at the edges lag until you lift your finger |
| Shadows on a coarser grid | Shorter stop after each move (up to 0.3 s now) | Softer shadow edges |
| Fewer height levels asked for the map's profiles (only those near the ground in view) | Fewer allowance calls per view (up to half in low country) | The "freezing level" figure in the details could not be given above the levels asked |
| A short message when the allowance is reached ("forecast server busy, reading slower files") | You'd know why a layer is slow instead of waiting | A new line on screen (Interface) |
| Clouds simpler (fewer sheets) | Part of the +94–152% clouds cost | A plainer sky (Effects 4) |

## Not measured, or not reproduced

- **Memory on the iPhone:** Safari does not report it to a page. The build
  machine's script memory peaked at 72–109 MB.
- **The installed app:** it always opens at its plain address, so `?perf`
  cannot be added. Its rendering is Safari's; what differs is the kept copy
  (repeat opens) and full screen.
- **The 13.5 s open:** once, against 7.0 and 5.8 s; most likely the first open
  after a new preview was published (every file new). Not confirmed.
- **Map redraws while untouched** (11 to 24 in 15 s in four phone runs, none
  in three): in every run that had them, the map announced "idle" during the
  quiet step, so it was still finishing after the tour moved it back home
  (late pieces, fades), not redrawing on its own. The tour now waits for the
  map's "idle" before the quiet step (from the 05:10 preview on), so the next
  run measures only what happens untouched.
- **Pixel 11 Pro:** not yet.

## How this was measured

- **The phone:** `?perf` on the Performance preview
  (`https://1kadenfoy-bit.github.io/Tempest/preview/performance/?perf`), live
  weather, Kaden's own setup. `app/perf/` runs the same tour by itself:
  open; a still-frame drawing cost; pan (four 1 s moves); pinch (±1.5 zoom
  levels); tilt to 55° and turn; drag the time (48 steps, one every 80 ms);
  play (10 s); every layer through the layer menu; every panel; 15 s
  untouched. Frame rates are from the browser's frame callbacks; "slowest 1%"
  is the 99th percentile of the gaps between frames; tap times run from the
  click to the first frame after it. The map is moved with the map's own
  camera calls, not fake touches (iOS does not allow them); the drawing per
  frame is the same.
- **The build machine:** the same tour in Playwright's Chromium, 390 × 844 at
  2×, software drawing (SwiftShader), recorded weather (`recorded/default`)
  with only the date frozen (`tools/perf/recorded.mjs`), the point API
  answering "not recorded" where the set has no answer. `tools/perf/tour.mjs`
  (one run), `features.mjs` (each feature), `profile.mjs` (code profile, the
  dev server for readable names), `load.mjs` (downloads, with "Slow 4G": 1.6
  Mbit/s down, 0.75 up, 0.15 s round trip), `versions.mjs` (older versions),
  `summary.mjs` (tables). The processor was not slowed: drawing in software
  already makes it slower than the phone.
- **Feature switches:** `?perf&off=bloom,haze,shadows,water,zones,labels,hillshade,contours,fills`
  hides one feature for a run, nothing saved (`app/perf/switches.ts`); 3D,
  sun, satellite, clouds, wind streaks and the layer were set through the saved
  choices before the app started.
- **Live calls spent from the build machine:** two opens of the real site
  (about 230 calls by the rule above) for the loading runs; nothing else.
