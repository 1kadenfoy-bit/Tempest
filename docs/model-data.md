# What the forecast models carry

Checked Nov 18, 2026 against each model's `latest.json` in Open-Meteo's map files, and against the single-place service for Vancouver's North Shore. ✓ = carried. "Used" = Tempest uses it today.

## Models

| | HRDPS | RDPS | GDPS | ECMWF IFS |
| --- | --- | --- | --- | --- |
| Area | Canada, northern US | North America | World | World |
| Grid spacing | 2.5 km | 10 km | 15 km | about 9 km |
| Reach | 48 h | 84 h | 240 h | about 6 days |
| Step | 1 h | 1 h | 1 h, then 3 h; upper air 3 h | 1 h to 90 h, then 3 h |
| Runs per day | 4 | 4 | 2 | 4 |

## Map-file values

| Data | What it is | Height | HRDPS | RDPS | GDPS | ECMWF | Used |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Temperature (levels) | Air temperature | pressure levels* | ✓ | ✓ | ✓ | – | ✓ |
| Relative humidity (levels) | How near saturation | pressure levels* | ✓ | ✓ | ✓ | – | ✓ |
| Wind speed and direction (levels) | Wind | pressure levels* | ✓ | ✓ | ✓ | – | ✓ |
| Geopotential height | Real height of each level | pressure levels* | ✓ | ✓ | ✓ | – | ✓ |
| Temperature | Air temperature | 2 m | ✓ | ✓ | ✓ | ✓ | ✓ |
| Temperature | Air just above ground | 40, 80, 120 m | ✓ | ✓ | ✓ | – | |
| Max and min temperature | Since the last step | 2 m | – | – | – | ✓ | |
| Surface temperature | The ground or snow surface | surface | – | – | – | ✓ | |
| Wind speed and direction | Wind | 10 m | ✓ | ✓ | ✓ | ✓ | ✓ |
| Wind speed and direction | Wind above ground | GEM 40, 80, 120 m; ECMWF 100, 200 m | ✓ | ✓ | ✓ | ✓ | |
| Gusts | Short bursts | 10 m | ✓ | ✓ | ✓ | ✓ | ✓ |
| Relative humidity | Air dampness | 2 m | ✓ | ✓ | ✓ | – | ✓ |
| Dew point | Saturation temperature | 2 m | – | – | – | ✓ | |
| Precipitation | Rain and snow, mm of water | surface | ✓ | ✓ | ✓ | ✓ | ✓ |
| Showers | Convective part | surface | ✓ | ✓ | ✓ | ✓ | |
| Snowfall water equivalent | Part falling as snow | surface | ✓ | ✓ | ✓ | ✓ | ✓ |
| Snow depth | Snow on the ground (model) | surface | ✓ | ✓ | ✓ | – | |
| Cloud cover | Share of sky | column | ✓ | ✓ | ✓ | ✓ | |
| Low, mid, high cloud | Cloud by height band | 3 bands | – | – | – | ✓ | |
| Visibility | How far you can see | surface | – | – | – | ✓ | |
| Total column water vapour | Moisture overhead | column | – | – | – | ✓ | |
| Solar radiation | Sunlight at the ground | surface | ✓ | ✓ | ✓ | ✓ | |
| Direct radiation | Unscattered sunlight | surface | – | – | – | ✓ | |
| Sea-level pressure | Highs and lows | sea level | ✓ | ✓ | ✓ | ✓ | |
| CAPE | Thunderstorm energy | column | ✓ | ✓ | – | ✓ | |
| Convective inhibition | Lid on storms | column | – | – | – | ✓ | |
| Boundary layer height | Depth of mixed air | column | – | – | – | ✓ | |
| Soil moisture and temperature | In the soil | GEM 0–10 cm; ECMWF 0–7, 7–28, 28–100, 100–255 cm | ✓ | ✓ | ✓ | ✓ | |

\* HRDPS has 28 levels (1015–50 hPa); RDPS and GDPS have 31 (1015–10 hPa). Rough heights: 1015 sea level, 1000 110 m, 925 760 m, 850 1,460 m, 700 3,010 m, 600 4,200 m, 500 5,570 m, 300 9,160 m, 100 16,180 m, 10 31,060 m. Tempest uses the 14 levels from 1015 to 600 hPa.

## Single-place service only

- **All four models:** dew point, feels-like temperature, rain and snowfall split, weather code, surface pressure, evapotranspiration, vapour pressure deficit, sunshine duration, diffuse radiation, day or night.
- **ECMWF only:** visibility, convective inhibition, boundary layer height, precipitation probability.

None of the four gives freezing level, snowfall height, UV index or lifted index. Tempest computes the freezing level and snow line from the level profiles.
