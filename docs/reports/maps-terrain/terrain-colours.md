# Terrain types and their colours (Maps)

A short list on purpose (rule 3, Nov 20, 2026): only ground types that matter for
outdoor conditions get their own colour; everything built by people is "urban",
and farmland, golf courses and sports fields count as grass and fields. The
forest, treeline and alpine zones are the BC government's official biogeoclimatic
(BEC) zones where we have them (North Shore, Sea to Sky, Kootenay Pass for now);
every other type comes from OpenStreetMap through Protomaps. Colours are
proposals in flat cartoon style, for Kaden to change. The dark theme uses the
colour as written; the light theme a lighter version.

Natural types are softened into each other along their edges (rule 10); urban
stays crisp. Parks, national parks, nature reserves and protected areas are
boundaries, not ground cover, so they are not coloured. Where the data says
nothing the ground stays plain (rule 7).

Drawn order, bottom to top: plain ground, woods and scrub from OpenStreetMap,
the BC zones (they win where they exist), their soft edges, grass, rock, ice,
wetland and sand, their soft edges, urban, cliff lines.

| Terrain | Colour | Natural | Base map kinds that use it |
| --- | --- | --- | --- |
| Forest | `#2E7D4A` | yes, edges softened | wood, forest |
| Treeline, parkland, scrub | `#8FA84A` | yes, edges softened | scrub |
| Grass and fields | `#B2CC6E` | yes, edges softened | grass, grassland, meadow, farmland, allotments, village_green, greenhouse_horticulture, plant_nursery, farmyard, golf_course, pitch, playground, dog_park, recreation_ground, garden, cemetery |
| Alpine and bare rock | `#9A8F86` | yes, edges softened | bare_rock, scree, shingle, rock |
| Glacier and ice | `#9CD3E6` | yes, edges softened | glacier |
| Wetland | `#3E8F86` | yes, edges softened | wetland |
| Sand and beach | `#E0CA85` | yes, edges softened | sand, beach |
| Urban | `#B38E95` | no, crisp | residential, kindergarten, commercial, retail, marketplace, industrial, quarry, landfill, construction, brownfield, school, university, college, hospital, pedestrian, platform, railway, pier, dam, aerodrome, military, naval_base, zoo |
| BC zone: forest | same as Forest | yes | every BEC zone that is not parkland or alpine |
| BC zone: treeline | same as Treeline | yes | BEC subzones named "Parkland" |
| BC zone: alpine | same as Alpine | yes | BEC zones CMA, IMA, BAFA |
| Cliffs | alpine colour, darkened, as lines | | base map `earth` kind `cliff` (sparsely tagged) |

Water: lakes, rivers and the sea are a clear blue (`#2B6CA3` dark, `#9CC6E3` light), a proposal for Kaden to change. The near-black water token stays only as the halo under labels.
