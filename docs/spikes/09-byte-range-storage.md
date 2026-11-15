# Spike 9: byte-range reads from device storage

Nov 15, 2026. **Answered in Chromium; iPhone pending.**

## Question

Can a PMTiles file of realistic size be read from storage on the device without loading it whole? The architecture asked this for native app files under Capacitor; for the web app it is the browser's private file system (OPFS).

## What I tried

On the phone test page: streamed the 19.9 MB Sea to Sky base map into OPFS, then read 200 random tiles from it through a `File.slice` source (`FileSliceSource`), which reads only the bytes asked for.

## Result (headless Chromium)

- Save: 19.9 MB in 1.2–1.3 s from the local server.
- 200 random tile reads: 210–280 ms in total, about 1 ms each, all found.
- Storage quota offered: 3.2 GB; `persist()` not granted in a normal tab (expected on desktop).

Also tested: a host that ignores partial requests. `RangeOrWholeSource` (`app/map/range-source.ts`) asks for a byte range and, if the host sends the whole file instead, keeps it and slices it. It works with a plain Python server, which does not support ranges. Unit tested both ways.

## Needed from the phone

The phone run reports the iOS storage quota, whether `persist()` is granted (most likely only as a home-screen app), whether OPFS writing works, and tile read speed. iOS limits and eviction are the open part of decision 5.

## Finding on GitHub Pages (Nov 15, 2026)

GitHub Pages answers partial requests (206), but sends full downloads gzip-compressed. In Chromium, a full download made after a partial request came back from the browser cache **truncated to 16 kB, with status 200**. Asking with `cache: 'no-store'` returns the full 19.9 MB. Both the map reader and the save path now skip the HTTP cache; the app keeps its own copy in device storage anyway. M3's save flow must do the same and check the saved size.
