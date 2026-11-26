# Effects: wind streaks and clouds (test page, ready to join the app)

Nov 26, 2026 · branch `claude/tempest-effects` · ready to integrate

## Read this first: what must be kept

Kaden has used this page on his phone and asked for each feature below. When
combining, keep every feature below. Do not simplify, merge or "tidy" them away; each one is
something he asked for.

**Wind streaks** (`render/effects/particles.ts`, `wind-particles-layer.ts`)
- White streaks fly just above the ground and follow the 3D terrain (rise over
  ridges, hidden behind hills).
- Direction is the streak's heading (bright head, fading tail). Strength is
  shown three ways at once: faster movement, a longer streak, a thicker and
  brighter line.
- **Kept evenly spread over the screen** while zooming and tilting (Kaden's
  rules 1 and 2). A streak that leaves the screen, or sits in a crowded
  patch, moves to a sparser part of the screen. Zooming out re-spreads them
  across the larger view. Do not go back to spawning them over the ground
  area, which piled them up near the bottom of a tilted view.
- Gusts: pockets of faster wind that drift along with the streaks.
- Hills bend the wind (speed-up on high ground, blocking and sliding along slopes).
- Kaden's chosen look (rule 3): from 280°, 36 km/h, hills 0.2, patchiness
  0.15, 700 streaks, length 0.4 s, width 2 px, brightness 0.9, speed 1×, 50 m
  above ground, gusts 0.5.

**Clouds** (`render/effects/cloud-layer.ts`)
- Three layers, each with its own **cover (0 to 100 %)** and **base height
  (metres above sea level)**: low, mid, high. This is Kaden's rule 4: clouds
  must be indicative of the weather (height and percentage cover). Real
  heights are drawn up to 3 km, so low cloud and peaks line up; above 3 km
  heights are squeezed to a quarter so high cloud still shows.
- Low cloud is a **fluffy 3D slab** (a few ray-marching steps; puffs taller
  where the cloud is thicker; lit from one side). Mid cloud is patchy and
  flatter. High cloud is thin and wispy, stretched along the wind.
- Low cloud set to a low base is **valley fog**: peaks above it stick out.
- **Fixed to the ground**, not to the camera: panning and tilting move the
  map over the clouds (Kaden's explicit fix). The cloud pattern lives in
  world coordinates, with a fixed origin near the North Shore. Cloud covers
  the land out to the horizon.
- **Forming and fading**: every layer of detail slides at its own speed, so
  shapes grow, merge and dissolve as they drift with the wind.
- Thickness, "storm grey", drift speed, forming/fading speed, detail (noise
  layers), low-cloud fluffiness (0 = flat, up to 8 steps; the main cost on a
  phone) and low-cloud depth are all adjustable.

**The test page** (`effects.html`, `app/effects-lab/`): Kaden uses it on his
phone through the preview address, and as the home-screen app. **Do not remove
the `effects` entry in `vite.config.ts` or the page disappears from the
build.** It stays until Kaden says otherwise.

## What changed

Two animated effects, built on a test page of their own and judged on
made-up weather set with sliders: **wind streaks** that flow over the 3D
terrain, and **clouds** at three heights. Both are MapLibre custom layers
(WebGL) drawn in the map's own 3D space, so hills hide them and tilting shows
them in depth. A hook-in module, `app/effects/index.ts`, adds both to the
app's map with a switch each.

Pictures (390 × 844), in this folder:
- `2026-11-26-1-wind-streaks.png`: streaks over the tilted North Shore
- `2026-11-26-2-clouds-three-heights.png`: low, mid and high cloud
- `2026-11-26-3-valley-fog.png`: low cloud set to 400 m
- `2026-11-26-4-fluffy-low-cloud-3d.png`: the 3D low cloud
- `2026-11-26-5-storm-overcast.png`: heavy overcast with storm grey
- `2026-11-26-6-wind-and-clouds-together.png`: both on

There is no v8 reference for either effect (nothing like it was designed);
they are built as plainly as possible, in white and grey only (colour is for
data).

## What to try after it is integrated
1. Open the map panel's 3D ANIMATIONS section and turn **Clouds** on: three
   layers of cloud drift over the terrain. Tilt the map and pan: the clouds
   stay over the same ground.
2. Turn **Wind** on: streaks follow the hills; zoom out and they spread across
   the wider view.
3. Turn both off: the map must go back to being idle (no redraws) at once.

## Files
- **Own files changed:**
  - new `render/effects/` (`particles.ts`, `height-grid.ts`,
    `wind-particles-layer.ts`, `cloud-layer.ts`, with unit tests)
  - new `app/effects/index.ts` (the hook-in module)
  - new `app/effects-lab/` (`main.ts`, `synthetic-wind.ts`, `lab.css`)
  - new `effects.html`, `e2e/effects.spec.ts`
  - `docs/wishes/effects.md`, `docs/handoffs/effects/`
  - `render/flow/` (today's flat wind arrows) is **untouched**.
- **Shared files changed** (the lead's), and why:
  - `vite.config.ts`: one line adds `effects.html` as a page of the build
    (like `spike.html`), so the test page and its preview exist.
- **New files no section owns yet:** none.

## Connection points
- **Hooking it into the app** (lead; `app/main.ts`, in the map's `load`
  handler, after `firstLabel` is known):
  ```ts
  import { setupEffects } from './effects';
  const effects = setupEffects(map, firstLabel);   // both effects added, hidden
  // with the Interface chat's switches (app/shell/feature-switches.ts, once in main):
  effects.setOn('clouds', features.get('clouds'));
  effects.setOn('wind', features.get('wind'));
  features.onChange((id, on) => { if (id === 'clouds' || id === 'wind') effects.setOn(id, on); });
  ```
  Hidden effects draw nothing, move nothing and ask the map for no frames.
  I tested the module on the lab's map: both effects draw, and switching them
  off stops the redraws. I have not run it inside the real app.
- **Stand-in weather.** Until the forecast is connected, the app shows the
  look Kaden chose, not real weather. `effects.setCloudWeather({ low, mid,
  high })` (each `{ cover: 0 to 1, baseM }`) and `effects.setWindWeather({
  fromDeg, speedKmh })` are what the forecast should call. Say so wherever it
  is visible, so nobody reads it as the forecast.
- **Idle.** While an effect is on, the map redraws continuously (the clouds
  drift and change, the streaks move), so it is never idle. That is why the
  switches default to off and why tests that wait for `body[data-idle]` must
  run with them off. While off, nothing redraws.
- **Stacking order.** Both layers are added under the first label, so they
  draw **over** the weather fills, hillshade and lines. The lead asked that
  clouds must not hide the data. At the moment low cloud is quite opaque
  (about 75 % at its thickest, a slider on the test page). **Open question for
  Kaden: how see-through should clouds be over the weather colours?** I have
  not changed the stacking order or the thickness for the app.
- **The Wind switch is not the Wind layer's flow.** `render/flow` (flat wind
  arrows and flow, paused while the map is tilted) is the Weather chat's
  and unchanged. The new streaks are a separate, 3D effect. The lead decides
  whether the 3D streaks replace the flat flow when tilted.
- **Needs from other sections:**
  - **Data** (through Kaden): cloud cover low, mid and high (percent) as
    weather variables by name. Cloud base height is not a plain forecast
    number; it can be estimated from temperature and dew point
    (roughly 125 m per °C of spread). I have not confirmed this against the
    forecast's documentation, so check before relying on it.
  - **Maps** (`app/map/sun.ts`): to light clouds from the map's sun (golden
    at sunset, following the time scrubber) the effect needs the sun's
    direction, from `sunPosition(date, lat, lng)`. Not done: the clouds are
    lit from a fixed south-west direction today. The cloud shader has one
    `SUN` constant to replace.
  - **Interface**: the switch ids `clouds` and `wind` (their branch, not in
    main when I wrote this).
- **Used:** MapLibre custom layers and `queryTerrainElevation`; the 3D terrain
  source `terrain-3d` (`app/map/terrain.ts`) for the streaks' ground height;
  `app/effects-lab` page reuses `app/map` (base map, terrain) and
  `app/theme/tokens` (CSS variables).
- **Changed or added:** nothing other sections depend on yet.

## Checks
`npm run check:section -- effects`: **every check passed** (area, typecheck,
lint, unit tests, build, `e2e/effects.spec.ts` on recorded weather).
New tests:
- `render/effects/particles.test.ts`: streaks drift downwind, strength carries
  further, leaving streaks return to the screen, zooming out re-spreads them,
  zooming in keeps them all on the view, the height grid.
- `render/effects/cloud-layer.test.ts`: cover to threshold, drawn heights, the
  camera position found from the map's matrix.
- `e2e/effects.spec.ts`: the lab page loads, readouts follow the sliders, and
  pausing stops the map redrawing.

I did not run the whole browser suite: no map or shell file was touched.

## Kaden's rules added or changed
From `docs/wishes/effects.md`:
1. Same density on screen while zooming (streaks re-spread when the view changes size).
2. Always in the visible part of the screen when tilting.
3. His starting look for the wind (the numbers above).
4. Clouds must be indicative of the weather: height and percentage cover, and
   any other relevant things; linked to the forecast later.

Fold these into `docs/06-decisions-and-open-items.md` when integrating.

## Decisions made, and anything unsure
- **Phone speed is unmeasured.** My test machine draws in software, so I have
  no phone frame times. The costs, in order: low-cloud fluffiness (steps) and
  the Detail slider for clouds; the number of streaks for wind. The defaults
  (fluffiness 3, detail 3, 700 streaks) are a guess; check on the phone before
  the switches are offered to everyone. Cloud drawing is full resolution; a
  half-resolution pass is the next saving if needed.
- **Heights above 3 km are squeezed** (to a quarter) so high cloud shows in a
  map-sized view; below 3 km they are true.
- **Grain on low cloud edges** at low fluffiness (3) is the price of few
  steps; it softens as fluffiness goes up.
- **Clouds are white and grey** only (no new colours or tokens).
- The lab remembers its slider values in the browser (`localStorage`, in a
  try/catch); that is a per-phone convenience only.
- The sun direction for clouds is fixed (south-west) for now (see above).

## Data, sources and terms
None added. No server is called by the effects; the test page uses the same
base map and terrain files as the app.

## Not done yet
- Connect the forecast: cloud cover and base height, and the wind at the
  streaks (variable names from Data).
- Light the clouds from the map's sun and follow the time scrubber.
- Decide how see-through clouds are over the weather colours.
- Rain and snow falling from the clouds, and cloud shadows on the ground
  (ideas Kaden has not yet asked for).
- A half-resolution cloud pass, if the phone needs it.
- Make the streaks follow the slopes in the flat `render/flow` canvas
  (still in my brief, untouched).
