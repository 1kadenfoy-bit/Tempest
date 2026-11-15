# Spike 8: a region file end to end

Nov 15, 2026. **Answered in Chromium; iPhone pending.**

## Question

Can one variable for one region be cut into one file, saved, loaded, scrubbed and tapped for a series?

## What I tried

On the phone test page, in the browser itself (the library's decoder runs only in a browser):

1. Read HRDPS precipitation for the Sea to Sky box for steps 1 to 48 of the latest run, by partial reads, six files at a time (`render/openmeteo-starter/region-series.ts`).
2. Packed the 48 steps into one file with a versioned header (`core/region-file/format.ts`, unit tested).
3. Saved it to the browser's private file system (OPFS) and read it back.
4. Read the value at Mt Seymour for every step, then scrubbed with a slider.

## Result (headless Chromium, Nov 15, 12Z run)

| Measure | Value |
| --- | --- |
| Grid points in the box | 1,512 (HRDPS 2.5 km) |
| File size, 48 steps as 32-bit numbers | 292 kB |
| Time to cut, six reads at a time | 7.4 s (38 s one at a time) |
| Save and read back from device storage | 2–3 ms |
| Tap readout for all 48 steps | under 0.5 ms |
| Mt Seymour 48 h total | 37.9 mm |

The size matches the architecture's estimate (about 0.6 MB per variable for 200 × 200 km).

## Consequence

- The per-region file approach works and is small. M3 can build on it: the store keeps one file per model run, variable and region.
- 16-bit numbers would halve the size if needed.
- The cut depends on the starter library's reader. **Its decoder package, `@openmeteo/file-reader` 0.0.21, is also GPL-2.0-only** (checked in its package.json). So replacing the starter renderer in M3 does not by itself remove GPL code: reading Open-Meteo's `.om` files still needs that decoder, or our own. Options for Kaden: keep the repository public (the simple answer), or later write a reader for the `.om` format or switch the saved-area files to another source. The region file format itself is ours.
- The 37.9 mm total has not yet been checked against Open-Meteo's point forecast, because the point API refused this cloud machine (daily limit). M2 does that check from the phone.
