// The ids of the map's own layers, in one place so the settings (map-settings.ts)
// and the code that adds the layers (places.ts, terrain.ts, style.ts) agree.
export const L = {
  hillshade: 'hillshade',
  contours: 'contour-lines',
  // ground colours
  groundColour: ['terrain_under', 'zone_forest', 'zone_parkland', 'zone_alpine', 'feather_zone_forest', 'feather_zone_parkland', 'feather_zone_alpine', 'terrain_over', 'feather_osm', 'terrain_urban'],
  // trails, huts, camps
  trails: 'trails',
  tracks: 'tracks',
  trailsBase: 'roads_other',
  trailNames: 'roads_labels_minor',
  hutsBase: 'huts-base',
  huts: 'places-huts',
  camps: 'camps-base',
  // peaks
  peaks: 'places-peaks',
  peaksBase: 'peaks-base',
  // small roads: the base map's minor-road layers, with their casings and bridges and tunnels
  smallRoads: ['roads_minor', 'roads_minor_casing', 'roads_minor_service', 'roads_minor_service_casing', 'roads_bridges_minor', 'roads_bridges_minor_casing', 'roads_tunnels_minor', 'roads_tunnels_minor_casing'],
  // ski
  skiLifts: 'ski-lifts',
  skiLiftNames: 'ski-lift-names',
  // boundaries
  parkBoundaries: 'boundary-parks',
  boundariesCountry: 'boundaries_country',
  boundaries: 'boundaries',
} as const;
