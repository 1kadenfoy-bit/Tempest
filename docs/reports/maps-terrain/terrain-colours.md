# Terrain types and their colours (Maps)

Every ground type the base map (OpenStreetMap through Protomaps) can tell apart,
plus the three zones from the BC government's biogeoclimatic (BEC) map. The
colours are proposals in flat cartoon style, for Kaden to change. The dark
theme uses the colour as written; the light theme uses a lighter version.

Drawn order, bottom to top: plain ground, woods and grass from OpenStreetMap,
the BC zones (they win where they exist), everything else the data tags, cliffs.
Parks, national parks, nature reserves and protected areas are boundaries, not
ground cover, so they are not coloured. Where the data says nothing the ground
stays plain (rule 7).

| Terrain | Colour | Base map kinds that use it |
| --- | --- | --- |
| Forest | `#2E7D4A` | wood, forest |
| Treeline, parkland, scrub | `#8FA84A` | scrub |
| Grass and meadow | `#B2CC6E` | grass, grassland, meadow |
| Alpine and bare rock | `#9A8F86` | bare_rock, scree, shingle, rock |
| Glacier and ice | `#9CD3E6` | glacier |
| Wetland | `#3E8F86` | wetland |
| Sand and beach | `#E0CA85` | sand, beach |
| Farmland and allotments | `#C9B458` | farmland, allotments, village_green, greenhouse_horticulture, plant_nursery, farmyard |
| Residential | `#B38E95` | residential, kindergarten |
| Shops and commercial | `#D9915F` | commercial, retail, marketplace |
| Industrial, quarry, landfill | `#7F7E9E` | industrial, quarry, landfill, construction, brownfield |
| Schools and campuses | `#C9A66B` | school, university, college |
| Hospital | `#D98C8C` | hospital |
| Golf, sports, parks with play | `#6FAE5A` | golf_course, pitch, playground, dog_park, recreation_ground, garden, zoo |
| Cemetery | `#8FA58F` | cemetery |
| Rail, platforms, dams, piers | `#8A8F96` | pedestrian, platform, railway, pier, dam, aerodrome |
| Military | `#8A7A5A` | military, naval_base |
| BC zone: forest | same as Forest | every BEC zone that is not parkland or alpine (BC zones only: North Shore, Sea to Sky, Kootenay Pass for now) |
| BC zone: parkland | same as Treeline | BEC subzones named "Parkland" |
| BC zone: alpine | same as Alpine | BEC zones CMA, IMA, BAFA |
| Cliffs | alpine colour, darkened, as lines | base map `earth` kind `cliff` (sparsely tagged) |
