# Overnight work plan (Nov 17–18, 2026)

Kaden asked (Nov 17): finish M8, then do M9 (the last scheduled milestone), then add 3D to the map (terrain, and buildings), as settings in the map panel. Work all night; use helper agents in parallel; if the session stops at its usage limit, pick up from this file when it restarts.

Branch: `claude/tempest-m0-setup-930073` (the only branch Claude may push to). PR #7 (M8) is open; M9 and 3D go on the same branch, and PR #7's description is updated to cover them, since no second branch is allowed.

## Status

| Step | State | Notes |
| --- | --- | --- |
| M8 saved areas | Done, PR #7 | Rerun `e2e/shell.spec.ts` ("window control", "pulled up") after 00:00 UTC, when Open-Meteo's daily limit for the build machine resets |
| M9 alerts panel | In progress (helper agent) | ECCC weather-alerts, exactly as issued |
| M9 place search | In progress (helper agent) | Moves the pin |
| M9 app settings + light theme | In progress (helper agent) | Units, theme, saved-data-only, credits from source metadata |
| 3D spike | In progress (helper agent) | Terrain 3D and buildings; how weather fills behave in 3D |
| M9 merge, tests, report | Waiting | `docs/reports/m9/report.md` |
| 3D terrain + buildings | Waiting | Map panel switches; report `docs/reports/3d/report.md` |

## How to resume

1. Read this file and `git log --oneline -15`.
2. Continue the first step not marked Done. Update this table and commit it after each step.
3. Keep Open-Meteo use low: the build machine shares one daily limit (10,000). Run the full browser suite once per milestone, not per change.
