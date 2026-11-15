# Windy terrain-temperature plugin (reference)

Code from Kaden's Windy plugin, copied for reference. Port `toposcale.ts` and its tests in milestone M4. The method: sample pressure-level profiles on a coarse grid, interpolate the profiles (never finished temperatures) in space and time, then read the value at each pixel's terrain height.

The other files show how the plugin fetched data, decoded terrain tiles and coloured values. Tempest has its own adapters, terrain and colour ramps, so do not copy those.
