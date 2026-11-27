# Section brief: Effects (3D and animation)

Animated weather over the map: falling rain and snow, drifting cloud and fog,
and wind particles that follow the 3D terrain. It is a "scenic" view of the
forecast, off by default.

Read `docs/sections/README.md` first. It covers the loop with Kaden, recorded
weather, the live view, the checks and the handoff.

## What you own

The exact list is `effects` in `docs/sections/sections.json`.

| Area | Files |
| --- | --- |
| The effects (MapLibre custom layers, WebGL) | new `render/effects/` |
| The wind streaks' look (the Tune panel's wind sliders) and the forecast wind they follow | `app/effects/wind-look.ts`, `app/effects/index.ts` |
| Wiring the effects into the app, when they are ready | new `app/effects/` |
| A test page to build and judge effects on their own | new `effects.html`, `app/effects-lab/` |
| Browser test | new `e2e/effects.spec.ts` |

## Start here: a phone test page

The biggest risk is speed and battery on a phone. The test machine draws with
software, not a graphics chip, so only Kaden's phone can judge it.
1. Build `effects.html`, a page of its own like the existing `spike.html`
   phone test page.
   - It shows the North Shore in 3D terrain, with falling snow, rain and
     drifting cloud driven by recorded weather.
   - It shows a frame-rate readout.
2. Kaden opens it in the live view on his phone and says whether it stutters
   or gets warm.
3. Only then wire effects into the app.

## Connection points

- **Weather by variable name** (`core/vocabulary.ts`):
  - precipitation and snowfall per step, and wind on pressure levels, are
    there today;
  - cloud cover is not. Ask Data, through Kaden, for cloud cover (low, mid and
    high).
- **The time cursor** (`S.cursor` in `app/state.ts`): effects show the hour
  under the cursor and never keep their own clock.
- **3D terrain and the stacking order** (Maps and the lead):
  - effects draw over the terrain and under the labels;
  - joining the app's map needs a place in the `load` handler of
    `app/main.ts`. Ask in the handoff.
- **A switch to turn effects on** belongs in the map panel (Interface's look,
  Maps' switches). Ask for it in the handoff.

## Rules for this section

- **Off by default.**
  - Animation pauses when the page is hidden.
  - It costs nothing while still, and never runs as background work.
- **Effects are for the eye.** Readouts and numbers never come from an effect.
- **Keep it cheap on a phone:**
  - a fixed particle budget, nothing allocated per frame;
  - measure the frame rate (`?fps` shows the wind flow's).
- **The wind animation is the 3D streaks only** (Kaden, Nov 27). The flat
  flow canvas (`render/flow/`) is gone. The streaks follow the Wind layer's
  forecast wind (`onForecastWind` in `app/weather/fills.ts`).
