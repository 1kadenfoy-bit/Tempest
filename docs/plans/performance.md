# Plan: evaluate the app's performance

Nov 27, 2026 · agreed with Kaden. Measure first, fix after: this plan ends
with a report and a ranked fix list, not with fixes. The Performance chat does
it (`docs/sections/performance.md`).

## What Kaden sees

- The app is very slow to open.
- The map loads really slowly.
- The weather layers sometimes don't load in time for him to use them.
- In general it doesn't feel snappy. Tapping and panning should feel "live";
  switching layers should be at most a momentary hitch.

## Targets (Kaden, Nov 27)

Phones:
- **iPhone 12**: Safari and the installed app, now.
- **Pixel 11 Pro**: Chrome, when Kaden has it.

| What Kaden does | Target |
| --- | --- |
| Open the app until everything is loaded (map, weather layer, the pin's forecast) | under 7 s |
| Pan, pinch, tilt | at least 30 frames a second on average; the slowest 1% of frames at least 24 a second |
| Drag the time slider, or press play | the map keeps up: every step drawn, no lag behind the finger |
| Tap a button | a visible response within 0.1 to 0.2 s |
| Switch weather layer | under 1 s, at most a brief hitch |
| Not touching the app | no work at all: no redraws, no timers, no network |
| Memory | under the point where Safari reloads the page (the iPhone 3D crash, Nov 21) |

## What gets measured

### 1. Loading first

Record everything the app downloads when it opens, with its size, where it
comes from, and how long it takes:
- the base map pieces and the terrain;
- the weather map files and the point forecasts;
- the zones, places, satellite and fonts.

Do this three ways:
- a first-ever open;
- a repeat open (the installed app's cache);
- an open over a slowed mobile connection.

Find out:
- what blocks the first map;
- what blocks the first weather;
- why a weather layer sometimes never arrives (limits? retries? waiting on
  something else?).

Note the Open-Meteo free limits, which every chat on the build machine
shares; Kaden's phone has its own.

### 2. A `?perf` test mode for Kaden's phone

Opening the app with `?perf` runs a fixed tour by itself (about 2 minutes):
1. open;
2. pan;
3. pinch in and out;
4. tilt into 3D and back;
5. drag the time slider;
6. press play;
7. switch every weather layer;
8. open and close the panels.

It records, per step:
- load times (first map, first weather, everything loaded);
- average frames a second and the slowest 1%;
- the longest freeze;
- how far the slider falls behind the finger;
- tap-to-response times;
- layer switch times;
- memory where the browser tells it;
- any work while idle.

It ends with a results card Kaden can screenshot.

It must not change the app for anyone not using `?perf`. It runs on live
weather, as Kaden uses the app.

### 3. The cost of each feature

On the build machine, the same tour runs automatically, with the CPU slowed to
about an iPhone 12. Calibrate the slow-down against Kaden's first `?perf`
results.

Run it once with everything on, then once with each of these switched off:
- satellite;
- sun and shadows;
- bloom (glow);
- water;
- terrain zones;
- peaks and labels;
- clouds;
- wind streaks;
- 3D terrain and buildings;
- each weather layer.

The differences are each feature's cost. Profile the main thread and the
workers during the tour to see which code is busy (the Nov 21 method:
long tasks, CPU profile).

### 4. Then against now

Run the same tour on:
- `main` before the Nov 19 integration;
- before the game look (Nov 26);
- today.

This shows which change made what slower.

### 5. The report

In `docs/reports/performance/`, in plain words:
- each target: passed or failed, with the numbers, phone and build machine
  side by side;
- the causes ranked by cost, slowest first, each with its evidence;
- a fix list in that order, each fix with the section chat that owns it
  (`docs/sections/sections.json`) and the target it should move.

### 6. A lasting check

Keep the tour as a repeatable check:
- a command, and a browser test with budgets taken from the targets;
- each section runs it before a handoff, so the app cannot quietly get slower
  again;
- the budgets are set from the measured numbers, generous enough not to fail
  at random on GitHub's slower machines.

## Who does what

- **The Performance chat** (strongest model, high effort): builds the
  measurement tools, measures, and writes the report. It changes other
  sections' files only for measurement hooks that do nothing unless `?perf` is
  on, and says so in its handoff.
- **The section chats** (cheaper model): make the fixes from the ranked list,
  each in its own files.
- **The lead:** combines the work.
- **The Performance chat:** measures again after each fix, to confirm it.
