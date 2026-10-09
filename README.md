# Map Forge

A browser-based procedural fantasy world generator. You start with a whole planet on a zoomable globe and can zoom in through roads and villages to the streets and buildings of individual towns; later phases will add dungeons and battlemaps. Everything runs client-side, with no server and no account.

Stack: TypeScript, Vue 3, Vite, MapLibre GL JS. Node.js runs the tooling and the headless preview script.

## Quick start

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npm run preview -- --seed=forge --layers=fantasy,terrain --at=-57,-33,7   # headless PNGs in out/ (tiles use the first layer)
```

## Controls

| Control | Range | Effect |
|---|---|---|
| Seed | any text | Deterministic world seed. **Random** picks a new one. |
| Land mass | 10–80% (default 35%) | Share of the surface above sea level. |
| Tectonic plates | 3–40 (default 14) | Number of plates; more plates = more fragmented continents and mountain belts. |
| Erosion | 0–100% (default 50%) | Strength of stream-power river erosion. |
| Detail | 512 / 1024 / 2048 wide | Simulation grid resolution. |
| Map layer | Fantasy map (default), Terrain, Biomes, Köppen climate, Elevation, Temperature, Precipitation, Tectonic plates | Re-renders tiles without regenerating. |
| Rivers | on/off | Vector river overlay. |
| Settlements & roads | on/off (default on) | Cities, towns, villages, roads and tracks; town and village plans at high zoom. |
| Prevailing winds | on/off (default off) | Streamline overlay of the simulated surface winds. |
| Ocean currents | on/off (default off) | Streamline overlay of surface currents, coloured red (warm) to blue (cold) by their temperature anomaly. |

The world regenerates when a slider is released or the seed changes. Hovering (or tapping on mobile) shows elevation, Köppen climate, temperature (mean, warmest and coldest month), precipitation (and how much falls in summer), prevailing wind, ocean current (at sea), biome and plate for that point. The globe button switches between globe and flat Mercator views. The URL hash (`#zoom/lat/lon`) saves the current view.

## Generation pipeline (`src/gen/`)

The world is simulated on an equirectangular lon/lat grid that wraps east–west. All tunables are in physical units (km, m, °C, mm/yr) in `src/gen/config.ts`, so results look the same at every **Detail** setting.

1. **Tectonics** (`tectonics.ts`): plates are weighted, noise-warped Voronoi regions on the sphere, each rotating about a random Euler pole. A continental-crust field (plate bias + blurred noise) separates continents from ocean floor. Relative plate motion at boundaries produces:
   - convergent continent–continent collisions: wide, high ranges
   - ocean–continent subduction: coastal ranges set back from a trench
   - ocean–ocean subduction: the denser plate dives under the other, leaving a trench on one side and a single island arc, broken into separate island groups, behind it on the overriding plate
   - divergent boundaries: mid-ocean ridges and continental rifts

   Boundary ranges have a main ridge with foothills, and low-frequency noise breaks them into segments of varying height, so a range doesn't run the full length of a plate boundary. Interior ranges (Appalachian/Ural style) follow the boundaries of an older, finer plate pattern; only some of those ancient sutures survive as ranges. Sea level is then set by area-weighted quantile so the land fraction is exact, and enclosed seas larger than 25,000 km² become lowland basins.
2. **Initial climate** (`climate.ts`):
   - **Temperature** comes from latitude and the lapse rate.
   - **Wind:** a per-cell field built from the three circulation cells (easterly trades converging on the equator, poleward westerlies, polar easterlies). Low-frequency noise makes the flow meander, it turns away from steep terrain, and land friction slows it.
   - **Moisture** is carried along the wind with semi-Lagrangian advection, using fixed steps in km. Air picks up moisture over the sea and rains out over land. Lifted air condenses as it cools, which gives windward mountains heavy rain and leaves rain shadows downwind. Land returns part of its rain to the air (evapotranspiration).
   - **Rain bands** come from wind convergence: where the winds meet (ITCZ, polar front, onshore flow slowing over land), air rises and rain increases. Where they spread apart (subtropical and polar highs), air sinks and dries. The bands follow the simulated winds, so they bend around continents rather than lying flat at fixed latitudes.
3. **Erosion** (`hydrology.ts`): priority-flood depression filling and steepest-descent routing, then an implicit stream-power solver (Braun & Willett 2013) weighted by precipitation. Closed basins partly fill with sediment.
4. **Final climate**: recomputed on the eroded terrain, now including **ocean currents** (`ocean.ts`):
   - **Wind-driven gyres:** surface water drifts with the wind and turns into boundary currents where it meets a coast. Subtropical gyres run poleward along western ocean boundaries (warm) and equatorward along eastern boundaries (cold, with upwelling). Subpolar gyres reverse both, which warms high-latitude west coasts. Narrow seas form only weak currents.
   - **Sea temperature:** carried along the currents and relaxed back toward the latitude baseline.
   - **On land:** the wind carries the sea-temperature anomaly inland. Air over cold water is stable and rains less, which produces foggy coastal deserts.

   **Seasons:** the climate is simulated for northern summer and northern winter.
   - **Temperature swing:** the warmest and coldest month differ from the mean by an amount that grows with latitude and with continentality (how far the wind has travelled from the sea), so coasts are mild and interiors are extreme.
   - **Seasonal rain:** the wind bands and rain belt shift toward the summer hemisphere, and a monsoon term turns winds onshore in summer and offshore in winter. Moisture transport runs once per season to give summer and winter precipitation; annual precipitation is their mean.
   - **Köppen–Geiger** (`koppen.ts`): the full set of 30 classes (Af…EF), from mean, warmest- and coldest-month temperature and seasonal precipitation, using the standard map colours. On test seeds the land shares come out close to Earth's: about 19% tropical, 27% arid, 18% temperate, 24% continental and 12% polar.
5. **Rivers & lakes** (`rivers.ts`): flow is accumulated, weighted by precipitation. River polylines are split by discharge class, jittered, and Chaikin-smoothed. Lakes form in deep basins only where precipitation is high enough to keep them filled.
6. **Biomes** (`biomes.ts`): a Whittaker-style classification from annual temperature and precipitation, refined by terrain and water:
   - **Ice:** ice caps where summers stay below freezing, or glaciers where cold summers meet heavy snowfall.
   - **Treeline:** trees need a warmest month of at least 10 °C, so cold, dry land stays tundra.
   - **Altitude zones:** alpine meadow above the treeline, montane forest on high wet slopes.
   - **Wetlands and marshes** on flat floodplains and lakeshores.
   - **Mangroves** on hot, wet, low coasts.
   - **River valleys / oases:** green corridors where large rivers cross dry country.
   - **Salt flats** in closed basins too dry to hold a lake.
7. **Streamlines** (`streamlines.ts`): evenly spaced streamlines with arrowheads, traced through the wind and current fields for the overlays.
8. **Settlements & roads** (`settlements.ts`):
   - **Habitability:** each land cell is scored on mild temperatures (warmest month ≥ ~10 °C, not too hot), enough rain, low elevation, gentle slope and biome. Rivers, sea coasts and lakeshores add a bonus.
   - **Cities and towns** are founded greedily on the best sites, at least 380 km apart for cities and 130 km apart for any two towns or cities. Population grows with site quality; cities and larger towns are walled.
   - **Placement:** river towns sit on the river line, offset to one bank so the river runs through the town. Coastal sites are nudged onto land at full shoreline detail (`detail.ts`, which samples the same sub-grid terrain as the tiles).
   - **Roads** link neighbouring settlements (a relative-neighbourhood graph: major roads between cities, minor roads between towns). Each road is routed by A* over the grid, with costs for slope, biome (wetlands, rainforest and ice are slow) and bridges. Reusing an existing road is cheap, so routes merge into trunk roads. Roads are smoothed and stop at the edge of each town plan.

## Rendering (`src/render/`, `src/worker/`, `src/world/`)

- The map is MapLibre GL with the globe projection. A custom `world://` protocol serves raster tiles that a pool of Web Workers renders on demand. One worker generates the world, then shares it with the rest.
- Tiles sample the grid with bicubic interpolation and add **fractal sub-grid detail**: more noise octaves as you zoom in, rough at coastlines and ridged in mountains. Coastlines and ranges keep showing structure down to ~10 m/pixel, and tiles stay consistent across zoom levels.
- Hillshading uses zoom-dependent vertical exaggeration. Terrain colour blends domain-warped biome colours with rock, snow (which needs both cold and enough precipitation) and sea ice.
- **Fantasy map** (`fantasy.ts`) gives a hand-drawn atlas look, inspired by Watabou's Perilous Shores:
  - Land is drawn as parchment tinted by biome, with soft sepia hillshading, snow and paper grain.
  - The sea is pale blue-grey, darkening with depth, and coastlines are inked.
  - Concentric ripple lines follow each coast. They come from a chamfer distance-to-shore computed over a 16 px tile margin, so they line up across tile edges.
  - Map symbols are placed on a jittered grid anchored in global pixel space and drawn back-to-front:
    - mountains (hatched, with snow caps where cold), hills
    - round deciduous trees or conifers, by forest biome
    - marsh tufts
  - Symbols are deterministic per seed and zoom, and are drawn up to zoom 11. Rivers switch to an ink-blue colour.
- Rivers are a GeoJSON line layer whose width scales with discharge and zoom, growing into their true width (from ~12 m upstream to a few hundred metres on big rivers) at high zoom. Wind streamlines are a GeoJSON line layer drawn with a transparent-to-white gradient.

## Villages and town plans (`src/towns/`)

Everything below world scale is generated on demand in a dedicated web worker (`manager.ts`, `worker/towns.worker.ts`), so the map never stalls. It is deterministic, so nothing changes as you pan away and back. Each plan samples a local height and water grid (`terrain.ts`) at full terrain detail. The grid drives slope-aware layout and shorelines, and draws contour lines whose interval adapts to the relief.

- **Villages** (from zoom 7.5) are placed per 1° block on a jittered ~13 km grid. Placement uses the same habitability score, at full terrain detail, plus bonuses near roads, rivers and coasts. Each village gets a winding track to the nearest road, town or village. Villages come in several kinds, chosen from the site:
  - **Mining camps** in mountains (with enough summer warmth to work).
  - **Logging camps** in forest biomes.
  - **Fishing villages** where there is sea or a lake within ~8 km; the village moves onto the shore.
  - **Keeps** on high ground, climbing to the local summit, and occasionally guarding a road in the lowlands.
  - **Monasteries**, more often in the hills.
  - Otherwise, **farming villages**.
- **Markers:** cities show from the globe view, towns from zoom 5, villages from zoom 8, coloured by kind. They fade out as the plans fade in.
- **City and town plans** (from zoom 11.5, `city.ts`) follow [Watabou's Medieval Fantasy City Generator](https://watabou.github.io/city-generator/):
  - Wards are Voronoi patches on a sunflower spiral (relaxed once), sized from population.
  - The wall follows the outline of the inner patches, with towers. Gates face the incoming roads.
  - Main streets run from each gate to the central plaza.
  - Special wards: a temple beside the plaza, a citadel with its own wall and keep on the wall's edge, and parks.
  - Blocks are split by alleys, then into terraced buildings by recursive lot cutting; inner lots become courtyards.
  - Outside the walls are suburbs along the roads, then fields with furrows, orchards and meadows.
  - Sea, lakes and rivers (at their true width) carve the plan; streets crossing a river become bridges.
  - **Terrain:** the walled core grows onto the gentlest nearby ground. Street routing penalises steep grades. On slopes, blocks are cut into terraces along the contours, and ground too steep to build on is left wooded. The citadel and temple take the high ground.
  - **Harbours** (`harbour.ts`): along the waterfront, piers (some with T-heads) reach out to open water, with boats moored alongside. Shore wards become warehouses, cities get a lighthouse and ships at anchor, and river towns get short jetties.
- **Village plans** (from zoom 12.5, `village.ts`, shared pieces in `kit.ts`) follow [Watabou's Village Generator](https://watabou.github.io/village-generator/). Each kind has its own layout:
  - **Farming:** winding lanes from each track to a common centre with side lanes, houses facing the lanes (densest at the centre), a chapel in larger villages, Voronoi fields with furrows cut by the lanes, and trees in clumps and gardens.
  - **Fishing:** houses crowd down to the shore, with jetties, moored and beached boats, paths to the water, and a few fields inland.
  - **Logging:** a clearing in dense forest with a sawmill (on the river bank if there is one), stacked logs, stumps and a few cabins.
  - **Mining:** adits up the slope with cart tracks, spoil heaps, a smelter and huts.
  - **Monastery:** a walled compound with a church, a cloister around a garth, ranges, vegetable beds and an orchard, surrounded by fields.
  - **Keep:** a ringwork on the hilltop with a ditch, a wall with towers and a gate, a keep tower and hall, and a hamlet along the approach.
- **Styling** (`components/map-style.ts`): plans are vector layers drawn in true metres (each feature carries its pixels-per-metre at zoom 20). Roads and streets share one width expression, so world roads join the plan roads seamlessly. The map zooms to 19 (~0.3 m/pixel).

## Project structure

```
index.html
src/
  main.ts, App.vue, store.ts, style.css
  components/   MapView.vue, map-style.ts (settlement layer styles), ControlPanel.vue, RangeField.vue
  gen/          world.ts (pipeline), tectonics.ts, climate.ts, ocean.ts, koppen.ts, advect.ts, streamlines.ts,
                hydrology.ts, rivers.ts, settlements.ts (cities, towns, roads), detail.ts (sub-grid terrain sampler),
                biomes.ts, grid.ts, noise.ts, heap.ts, rng.ts, config.ts
  render/       tiles.ts (tile + equirect renderer), fantasy.ts (fantasy style + map symbols), palette.ts
  towns/        manager.ts (villages, tracks, plan cache), city.ts, village.ts, kit.ts (village building blocks),
                harbour.ts (piers, boats), terrain.ts (local height/water grid, contours), plan.ts (local frame + GeoJSON), geom.ts
  worker/       world.worker.ts, towns.worker.ts, protocol.ts
  world/        client.ts (worker pool + map protocol), probe.ts
scripts/        preview.ts (headless generation → PNG), png.ts
```

`src/gen`, `src/render` and `src/towns` are DOM-free, so they run in workers and in Node (`npm run preview`). Town plans use [d3-delaunay](https://github.com/d3/d3-delaunay) for Voronoi diagrams.

## Climate tuning against Earth

`tuning/climate/` scores the climate model on real Earth. It runs the generator's climate pipeline on WorldClim 2.1 elevation (the `heightmap` option of `generateWorld` skips tectonics and erosion) and compares the result with observed WorldClim monthly climatology (1970–2000).

```sh
npm run earth:fetch                      # once: downloads ~46 MB to tuning/data/ (git-ignored)
npm run earth:eval                       # score current parameters against tuning/climate/baseline.json
npm run earth:eval -- --update-baseline  # accept a new score
npm run earth:eval -- --res=512          # faster, coarser
```

- **Reference map:** the observed monthly data is reduced to the same inputs the simulation produces (mean, warmest and coldest month temperature, summer/winter precipitation) and classified with the same Köppen code. Differences therefore measure the simulation, not the classifier.
- **Reported metrics** (area-weighted over land):
  - exact Köppen class accuracy
  - main-group (A–E) accuracy and Cohen's kappa
  - annual, warmest-month and coldest-month temperature RMSE
  - precipitation log error and bias
  - summer-rain-share error
  - group shares and a confusion matrix
- **Objective:** these combine into one `OBJECTIVE` (0–1, higher is better). The command exits non-zero if it regresses against the baseline.
- **Maps:** written to `out/earth/koppen-{observed,simulated,agreement}.png`. In the agreement map, green is the same class, yellow the same group, and red a different group.

After any change to climate code or `CLIMATE`/`KOPPEN` constants, run `npm run earth:eval` and make sure the objective did not regress. Data: Fick & Hijmans (2017), WorldClim 2.1, CC BY 4.0.

## Roadmap

Phase 1 (done): world generation and a zoomable globe.

Phase 2: zoom into sites. [Watabou's generators](https://watabou.github.io/) set the visual bar for each scale:

| Scale | Reference | Plan |
|---|---|---|
| Region / realm | [Realm](https://watabou.github.io/realm.html) | **Done:** settlements, roads and villages. **Next:** borders and labels. |
| City | [City](https://watabou.github.io/city.html) | **Done:** walls, wards, streets, buildings, rivers and coasts, slope-aware layout, harbours and docks. |
| Village | [Village](https://watabou.github.io/village.html) | **Done:** farming and fishing villages, logging and mining camps, monasteries, keeps. |
| Building interiors | [Dwelling](https://watabou.github.io/dwelling.html) | Floor plans for buildings picked on the city/village map. |
| Caves | [Cave](https://watabou.github.io/cave.html) | Cave systems seeded from mountain and karst sites. |
| Dungeons | [Dungeon](https://watabou.github.io/dungeon.html) | Grid battlemaps for ruins, tombs and lairs. |

Each site gets a seed derived from the world seed and its location, so every zoom level is deterministic and shareable.
