# Overnight work plan (Nov 17–18, 2026)

Kaden asked (Nov 17): finish M8, then do M9 (the last scheduled milestone), then add 3D to the map (terrain, and buildings), as settings in the map panel. Work all night; use helper agents in parallel; if the session stops at its usage limit, pick up from this file when it restarts.

Branch: `claude/tempest-m0-setup-930073` (the only branch Claude may push to). PR #7 (M8) is open; M9 and 3D go on the same branch, and PR #7's description is updated to cover them, since no second branch is allowed.

## Status

| Step | State | Notes |
| --- | --- | --- |
| M8 saved areas | Done, PR #7 | |
| M9 alerts panel | Done, merged | |
| M9 place search | Done, merged | BC Geographical Names; environment allowlist gained apps.gov.bc.ca and geocoding-api.open-meteo.com |
| M9 app settings + light theme | Done, merged | |
| 3D terrain + buildings | Done, merged | docs/reports/3d/report.md, docs/spikes/3d-terrain.md |
| M9 report | Done | docs/reports/m9/report.md |
| Full check | Done | Nov 17 ~12:00 UTC: 177 unit and 31 browser tests passed, 3 failed while Open-Meteo refused the build machine. Rerun at 13:15 UTC once it answered again: all 3 pass (offline numbers equal online, snow line 980 m both) |
| PR #7 description covers M8, M9, 3D | Done | |

## How to resume

1. Read this file and `git log --oneline -15`.
2. Continue the first step not marked Done. Update this table and commit it after each step.
3. Keep Open-Meteo use low: the build machine shares one daily limit (10,000). Run the full browser suite once per milestone, not per change.

## Next round (Kaden, Nov 17)

After PR #7 merges: radar layer, then the avalanche layer (Avalanche Canada-like: regions coloured by danger as issued, MIN reports pinned, tap to read with photos), and a weather-stations overlay over every layer (tap a station). Three helper agents started in parallel at ~14:00 UTC (radar, avalanche, stations); merge each into the branch as it finishes, then full check, reports, PR.
