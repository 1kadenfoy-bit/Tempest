# Tasks: keeping the tests working

From the round on the tests (Nov 27, 2026; `docs/testing.md`). One new chat per
task (`docs/working.md`): paste the starter prompt from
`docs/tasks/performance-fixes.md`, then the task's lines.

- [ ] **1. A new recorded day that covers every test** (Data, Opus).
  The recorded set (`recorded/default`, Nov 20) lacks what the wind layer,
  the saved-area test (`e2e/offline.spec.ts`), the phone tests
  (`spike.html`) and the dropped pins of the forecast summary now read, and
  Open-Meteo has deleted that run, so those tests fail (each test's log lists
  what was missing). Extend `tools/record-weather.mjs` so a recording also:
  runs the phone tests page; traces and saves the offline test's area (3
  layers, the whole time frame); opens the forecast summary at the points the
  summary tests press (200, 300 on the screen at Mt Seymour); and visits the
  views `e2e/consistency.spec.ts` moves to. Then record a new set
  (`npm run weather:record`), move `e2e/summary.spec.ts` to recorded weather,
  and run every browser test. Needs the point service: it refused the cloud
  build machine on Nov 27 (too many requests), so record where it answers.
  Watch the size (a set is tens of MB, committed to git).
- [ ] **2. Recorded weather that survives a change in how files are read**
  (Data, Opus). A recorded answer is found by its exact byte range, so any
  change in which pieces of a weather file the app reads (performance fix 9,
  a wider view) misses the recording. Let `e2e/recorded.ts` (and
  `app/data/recorded.ts` for the dev server) answer a range from any
  recorded range of the same file that contains it. Same bytes, so the same
  numbers.
- [ ] **3. Keep `e2e/durations.json` up to date** (any chat that adds or
  slows a test file a lot). The CI log prints each file's time.
