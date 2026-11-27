# The tests: what they check, in what order, and what could still go wrong

Nov 27, 2026 (Kaden's round on the tests). How the checks before a merge work,
and a list of what could go wrong in the app with the test that guards each
one, or "not covered" where none does yet.

## What runs before a merge

| Step | What | Time |
| --- | --- | --- |
| Typecheck, lint | The code is consistent; the architecture rules hold | under a minute |
| Unit tests | The calculations, without a browser (384 checks) | under 10 s |
| Browser tests | The app itself at 390 × 844, on recorded weather | about 10 min on each of 4 GitHub machines |

**The order (Kaden, Nov 27): the tests most likely to fail go first,** on
each machine:
1. the tests that failed on the branch's last run;
2. the test files of the areas the branch changed (`docs/sections/sections.json`);
3. the rest.

A machine stops at the first step that fails, so a run that is going to fail
says so in minutes. `npm run test:plan` shows the plan for a working copy;
`tools/test-plan.mjs` makes it. The machines' shares are balanced by how long
each file takes (`e2e/durations.json`), so they finish together (before: 6,
13 and 17 minutes on the three machines; now about 10 each).

Locally, `npm run check:section -- <area>` runs last time's failures first,
then the area's tests and those of every other area whose files changed.

## Recorded weather is strict

The tests run on a recorded day (`recorded/default`, Nov 20). Until Nov 27,
anything the recording did not hold was fetched live. Open-Meteo deletes a
run a few days after it is made, so those tests passed for a week, then
waited minutes and failed. That is why the wind, saved-area and phone-tests
checks were red on main. Now an answer not in the recording is refused at
once, and the test's log lists what was missing:

```
[wind: …] 24 answer(s) not in the recorded weather "default" (a new set must cover them …)
```

The fix for those three is a new recording that covers what they read
(`docs/tasks/test-upkeep.md`, tasks 2 and 3).

## Report pictures

Tests that take report pictures (avalanche, ATES, air quality, stations,
summary) now save them in `test-results/reports/`. Before, every run rewrote
about 25 pictures under `docs/reports/`, ready to be committed by mistake. To
refresh the pictures in `docs/reports/` on purpose: `REPORTS=1 npx playwright test <file>`.

## New tests (Nov 27)

**`e2e/consistency.spec.ts`: is the number on screen the right one?** It
compares the app with itself, so it holds whatever the weather is:
- zooming in close, out over BC, panning and tilting never change the pin's
  value, its height, the summaries, the week, the legend or the chart;
- quick taps end on the last choice: layers switched one after another
  without waiting, the pin dropped in three places in a row, the time dragged
  then Now, each ends with exactly the answer reached slowly;
- a phone set to another time zone shows the same times and days (everything
  is shown in BC time);
- the data's age ("6 h old") matches the run and the clock;
- imperial units show the same weather, correctly converted.

**`e2e/perf.spec.ts`: speed checks that hold on any machine** (frame rates are
measured on the phone with `?perf`):
- untouched, the app does no work: no map redraws, no downloads, no busy
  stretches (Performance rule 6);
- hidden, it does nothing at all;
- going round the layers four times does not keep taking memory (rule 7);
- the work each tap starts stays under 0.2 s, a layer switch under 1 s
  (rules 4 and 5). Measured Nov 27 on the build machine: menus 5 to 7 ms, the
  sheet 36 ms, a layer switch 81 ms.

**Every browser test now runs in BC's time zone,** like Kaden's phone. GitHub's
machines are on UTC, so before, a mistake that only shows in BC time could not
show up in a test.

## What could go wrong, and what guards it

### Is the data correct, and is it shown correctly?

| What could go wrong | Guarded by |
| --- | --- |
| The pin's value changes when the map is zoomed, panned or tilted (heights read at the view's zoom, a fill's value read as the pin's) | `consistency`: zooming… never change the numbers |
| A late answer for an earlier choice lands on top of the latest one (layer, pin, time) | `consistency`: quick taps |
| A time or day shown in the phone's own time zone instead of BC's | `consistency`: time zone; all tests in BC time |
| The data's age wrong (day boundaries, UTC versus local) | `consistency`: the data's age |
| A unit converted in one place and not another | `consistency`: imperial units; `settings`: units everywhere |
| Saved (offline) numbers differ from the live ones | `offline` (red until tasks 2 and 3 of `docs/tasks/test-upkeep.md` are done) |
| Safety data re-scored or recoloured | `avalanche`, `alerts`, `air-quality` (ECCC's own colours and words) |
| Readouts blended between model steps | `shell`: one cursor (steps are whole hours) |
| Auto picks the wrong model past HRDPS's end | `offline` (RDPS past HRDPS), `models` |
| Recorded weather quietly replaced by live (tests pass, then break days later) | strict recorded weather (above) |
| The app asks the free servers more than it needs to (the same answer again before new data could exist, retries that never stop), using up the shared limits (Data rule 1) | **not covered yet**: `docs/tasks/test-upkeep.md`, task 1 |
| The forecast summary's totals differ from the hours charted | **not covered** in the browser; unit tests cover the sums |
| Snow/rain split or freezing line wrong at height | unit tests (`core/precip`, `core/temperature`) only |

### Is the app fast enough?

| What could go wrong | Guarded by |
| --- | --- |
| The map redraws, or something downloads, while untouched | `perf`: untouched |
| Work goes on while the app is hidden (battery) | `perf`: hidden; `wind`: streaks pause |
| Memory grows with each layer switch until Safari reloads the page | `perf`: memory |
| A tap starts too much work at once | `perf`: the work a tap starts |
| Frame rates while panning or playing | **not on GitHub** (software drawing); `?perf` on the phone |
| Load time | **not on GitHub**; `?perf` on the phone (rule 1: under 7 s) |

### Sequences that could cause trouble

| What could go wrong | Guarded by |
| --- | --- |
| Layer switched while the last one is loading | `consistency`: quick taps |
| Pin moved again before its forecast came | `consistency`: quick taps |
| Time dragged, then Now | `consistency`: quick taps; `shell`: one cursor |
| Signal lost while a layer or the forecast loads | partly: `stations`, `search` (no connection); **not covered** mid-load |
| A new run lands while the app is open (every 10 minutes) and the readout mixes two runs | **not covered** (needs two recorded runs) |
| The app closed or reloaded while saving an area | **not covered** |
| A new version of the app installed over an old offline copy | **not covered** |
| The forecast service refuses (limits) and the pin waits forever | partly: `models` (model unavailable). Seen in the tests: away from the recorded spot, temperature at a dropped pin waits on "the forecast service is busy" for good when the point service keeps refusing (by design today: the map-file route is used only once the service is out for hours; performance task 6 changes this) |

### Found while writing these tests

- **Fixed: the charts' look depended on the last draw.** A line setting left
  by one draw (round line ends) carried into the next, so the temperature
  chart's dotted 0° line was drawn differently on the first draw and on every
  redraw after it, for example after zooming. Found by the zoom check; each
  draw now starts fresh (`app/shell/scrubber.ts`, `app/summary/summary-window.ts`).
- **Three of the four tests failing on main fail for one reason:** the
  recording is missing what they read now (above). Not an app bug.
- **The effects lab's "paused" check** counted redraws from a terrain piece
  arriving late on GitHub's slower machines. The check now starts once the
  map has every piece in view; it still allows at most 2 frames.
- **The save card's "midnight"** (`app/shell/save-card.ts`) uses the phone's
  own time zone, while every other time uses BC's. The same in BC; a day off
  for a phone set elsewhere. Not covered; for the Interface area to decide.
- **The forecast-summary tests use live weather**, so they fail when the
  point service refuses (it refused this build machine all day on Nov 27).
  Two of the five pass on the recording; three drop the pin where the
  recording has no forecast (`docs/tasks/test-upkeep.md`, task 3).
