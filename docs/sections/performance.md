# Section brief: Performance

How fast the app opens, how smooth it moves, and how quickly it answers, on
Kaden's phones. First job: measure, and rank the causes
(`docs/plans/performance.md`). Fixes go to the section that owns each part.

Read `docs/sections/README.md` first. It covers the loop with Kaden, recorded
weather, the preview address, the checks and the handoff.

## What you own

The exact list is `performance` in `docs/sections/sections.json`.

| Area | Files |
| --- | --- |
| The `?perf` test mode (the tour and the results card) | new `app/perf/` |
| Build-machine tour, feature-by-feature runs, profiles | new `tools/perf/` |
| The lasting check (a browser test with budgets) | new `e2e/perf.spec.ts` |
| Reports | `docs/reports/performance/` |

## Rules for this section

- **Keep everything Kaden asked for (Kaden, Nov 27).** Every other section's
  rules files (`docs/wishes/*.md`) and settled decisions
  (`docs/06-decisions-and-open-items.md`) stay in force. A fix may make
  something faster; it may not change how it looks or behaves. That rules out:
  - removing an effect;
  - lowering quality (sharpness, detail, frame of time, number of streaks);
  - dropping a layer, a label or a button;
  - changing a gesture.
  - **Trade-offs:** when the only way to meet a target is such a trade-off, put
    it in the report as an option for Kaden, with what it gains and what it
    costs. Never make it yourself, and never ask a section to.
  - **The fix list:** each fix names the rules it touches and says how they are
    kept.
- **After each fix,** measure again and check the owning section's rules still
  hold: its browser tests pass, and the screens look the same.

- **Measure, don't guess.** Every claim in the report comes with a number and
  how it was measured. Say plainly when something could not be reproduced.
- **Kaden's phone is the truth.** The build machine draws in software and is
  only a stand-in: calibrate it against his `?perf` results.
- **Hooks in other sections' files** are allowed only for measuring:
  - they do nothing unless `?perf` is on;
  - they are listed in the handoff.

  No fixes in other sections' files; put them in the fix list.
- **Don't spend the forecast servers' shared limit.** Use recorded weather on
  the build machine where it gives the same picture. Use live weather only
  where loading behaviour is the point, and say which in the report.
- **Plain language for Kaden.** Frames a second, seconds and megabytes, no
  jargon.
