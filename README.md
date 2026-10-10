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
| Detail | 512 / 1024 / 2048 / 4096 wide | Simulation grid resolution. |
| Map layer | Fantasy map (default), Terrain, Biomes, Köppen climate, Elevation, Temperature, Precipitation, Tectonic plates | Re-renders tiles without regenerating. |
| Rivers | on/off | Rivers. On the Fantasy map and Terrain layers they are drawn into the tiles (inked, clipped at lakes and the sea); on the other layers they are a vector overlay. River valleys stay carved into the terrain either way. |
| Settlements & roads | on/off (default on) | Cities, towns, villages, roads and tracks; town and village plans at high zoom. |
| Place names | on/off (default on) | Lettering for realms, seas, rivers, ranges, forests, settlements, town quarters, districts, streets and notable buildings. |
| Prevailing winds | on/off (default off) | Streamline overlay of the simulated surface winds. |
| Ocean currents | on/off (default off) | Streamline overlay of surface currents, coloured red (warm) to blue (cold) by their temperature anomaly. |

The world regenerates when a slider is released or the seed changes. Hovering (or tapping on mobile) shows elevation, Köppen climate, temperature (mean, warmest and coldest month), precipitation (and how much falls in summer), prevailing wind, ocean current (at sea), biome and plate for that point. Hovering a cave or glade icon shows a preview card (or, close in, its map laid over the ground); double-click it to open its map (see **Caves and glades**). From zoom 17, hovering a building in a town or village draws its ground-floor plan over it; double-click it (on touch screens, tap it a second time) to go inside (see **Building interiors**). The globe button switches between globe and flat Mercator views. The URL hash (`#zoom/lat/lon`) saves the current view.

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
5. **Rivers & lakes** (`rivers.ts`, `river-index.ts`): flow is accumulated, weighted by precipitation. River polylines are split by discharge class, jittered, and Chaikin-smoothed. Lakes form in deep basins only where precipitation is high enough to keep them filled.
   - A shared **river index** bins the segments for fast distance queries. Widths taper smoothly downstream (each feature spans one discharge doubling, so its width grows from one class to the next along its length).
   - **Meanders:** distances to a river are measured from a point displaced by a smooth noise field (domain warping, 9 km down to ~0.5 km wavelengths), so the straight coarse courses bend the same way in the tiles, the terrain sampler and the town plans.
   - **Valleys:** within a floodplain that widens with the river, the sub-grid detail relief fades out, the floor sinks a few metres toward the banks and the channel is cut below them, so rivers never climb over noise ridges.
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
   - **Fine layout:** the grid route only fixes a vertex every ~39 km, so each stretch between two vertices is laid out again on a strip of lanes either side of the straight line (3 km steps and up to 8 km off the line for major roads, 5 km steps and 7.5 km for minor ones). A dynamic programme picks the cheapest path over the sub-grid terrain the tiles draw: it bends round hills and spurs, keeps to valley floors, runs beside rivers (cheaper near a bank, a toll to cross that grows with the river) and wanders a little across open ground (a smooth noise field). The road moves at most one lane per step, so it stays smooth. Stretches are cached by their end points, so roads sharing part of a route share the same line. After smoothing, a slight hand-drawn waver is added and the line is simplified (Douglas–Peucker, 60 m).
   - **Keeping roads on land:** the grid route only knows 39 km cells, so at full detail it can cut across bays, lagoons and lakes. Near water (low land, coasts and lakeshores) each road is resampled every 600 m, and every 150 m around wet samples; short wet stretches are pulled onto the nearest shore and eased, and any remaining open-water crossing longer than 750 m (counting islet-hopping across an archipelago as one crossing) breaks the road at the shore. Short crossings stay as bridges or causeways, and rivers are always bridged. Roads that meet a town in the water start at the shore instead.
9. **Names & labels** (`src/names/`, `features.ts`):
   - **Cultures** (`cultures.ts`, `culture-map.ts`): eleven naming cultures (Anglo, Norse, Latin, Celtic, Elvish, Desert, Slavic, Dwarven, Southern, Steppe, Jungle), each with syllable sets, compound roots and suffixes, prefixes and its own terms for features (Fjord, Wald, Bahr…). Culture hearths at least 1,200 km apart are chosen by climate suitability and spread by distance, with mountains and seas acting as borders, so names change from region to region.
   - **Name bank** (`names.ts`): deterministic per world seed and key, with duplicate avoidance for world features.
   - **Water bodies:** oceans (far from land), seas, inland seas and lakes (enclosed water by area), and gulfs, bays and bights found by casting rays from the coast to measure how enclosed the water is. Straits and channels are narrow passages with open water on both ends; they get a line label along the passage.
   - **Land:** continents, islands and isle groups; mountain ranges (with their highest peak and height), hills, forests, deserts, marshes and plains from smoothed biome regions; realms around capital cities.
   - **Close-zoom water lettering:** a water body keeps its main label until it spans about one screen; from then on it is lettered from a lattice of anchors fixed in Web Mercator space (a few per screen, one lattice per whole zoom band), so a lake, bay or sea stays named while it is in view. On the open sea each name holds a territory (a Dijkstra weighted by the feature's reach, so a bay keeps its own water against the surrounding sea). Anchors deep in the water are kept; near the shore the label's footprint is tested against the coastline as the tiles draw it at that zoom. Narrow water falls back to the anchors along its middle. Lettering continues to zoom 8 for oceans, 10 for seas, 11 for gulfs and inland seas, 12 for bays, bights and straits, and 13 for lakes.
   - **Lines:** rivers are named per system (the main stem keeps one name to the sea), major roads ("the X Road", "the King's Road"). Elongated regions get curved line labels along their main axis.

## Rendering (`src/render/`, `src/worker/`, `src/world/`)

- The map is MapLibre GL with the globe projection. A custom `world://` protocol serves raster tiles that a pool of Web Workers renders on demand. One worker generates the world, then shares it with the rest.
- Tiles sample the grid with bicubic interpolation and add **fractal sub-grid detail**: more noise octaves as you zoom in, rough at coastlines and ridged in mountains. Coastlines and ranges keep showing structure down to ~10 m/pixel, and tiles stay consistent across zoom levels.
- Raster tiles go to zoom 17 (overzoomed beyond).
- Hillshading uses zoom-dependent vertical exaggeration. Terrain colour blends domain-warped biome colours with rock, snow (which needs both cold and enough precipitation) and sea ice.
- **Fantasy map** (`fantasy.ts`) gives a hand-drawn atlas look, inspired by Watabou's Perilous Shores:
  - Land is drawn as parchment tinted by biome, with soft sepia hillshading, snow and paper grain.
  - The sea is pale blue-grey, darkening with depth, and coastlines are inked.
  - Concentric ripple lines follow each coast. They come from a chamfer distance-to-shore computed over a 16 px tile margin, so they line up across tile edges.
  - Map symbols are placed on a jittered grid anchored in global pixel space and drawn back-to-front:
    - mountains (hatched, with snow caps where cold), hills
    - round deciduous trees or conifers, by forest biome
    - marsh tufts
  - Symbols are deterministic per seed and zoom. Mountains and hills are drawn up to zoom 11; trees and marsh tufts continue to the deepest tiles, growing a little and thinning out so forests still read as forests. Symbols keep off rivers and the fine shoreline.
  - **Rivers** are drawn into the tiles: a single ink-blue line while thin, then a pale channel between inked banks (with a ripple line inside broad rivers). They never get thinner than a zoom-dependent minimum, grow into their true width at close zoom, show only the largest rivers on the globe, stop at lakes, and open into the sea without an inked coast across the mouth.
  - **Contours** from zoom ~9: an interval that halves with each zoom (200 m at zoom 9 down to 2.5 m), every fifth line darker, fading out where lines crowd together. From zoom ~11.5 steep ground gets a rock stipple.
- **Lettering** (`components/label-style.ts`) uses IM Fell English (roman, italic and small caps, SIL OFL, bundled in `public/fonts/` and rendered locally through MapLibre `font-faces`, so no glyph server is needed). Labels appear by rank and zoom: realms and oceans on the globe, seas, ranges and forests regionally, lakes and smaller rivers closer in; water names are italic blue, regions are spaced capitals, settlements are small caps. Land, settlement and town lettering is drawn 20% larger than water names, on a firmer, more opaque halo, so it stays readable over forests and hatching.
- On the analytic layers rivers are a GeoJSON line layer whose width scales with discharge and zoom, growing into their true width (from ~12 m upstream to a few hundred metres on big rivers) at high zoom. The tile URL carries a river flag (`world://gen/layer/r|-/z/x/y`). Wind streamlines are a GeoJSON line layer drawn with a transparent-to-white gradient.

## Villages and town plans (`src/towns/`)

Everything below world scale is generated on demand in a dedicated web worker (`manager.ts`, `worker/towns.worker.ts`), so the map never stalls. It is deterministic, so nothing changes as you pan away and back. Each plan samples a local height and water grid (`terrain.ts`) at full terrain detail. The grid drives slope-aware layout and shorelines, and draws contour lines whose interval adapts to the relief.

- **Villages** (from zoom 7.5) are placed per 1° block on a jittered ~13 km grid. Placement uses the same habitability score, at full terrain detail, plus bonuses near roads, rivers and coasts. Each village gets a winding track to the nearest road, town or village. Villages come in several kinds, chosen from the site:
  - **Mining camps** in mountains (with enough summer warmth to work).
  - **Logging camps** in forest biomes.
  - **Fishing villages** where there is sea or a lake within ~8 km; the village moves onto the shore.
  - **Keeps** on high ground, climbing to the local summit, and occasionally guarding a road in the lowlands.
  - **Monasteries**, more often in the hills, on a level terrace or knoll above the surrounding ground.
  - Otherwise, **farming villages**.
  - **Slope-aware sites** (sampled at full terrain detail, ~60 m): mining camps need real relief and sit on workable ground at the foot of the steepest rise within ~1.5 km (none on flat plateaus); farming villages and lowland keeps move to the flattest ground within ~900 m and are dropped if it is all steeper than 16%; logging camps avoid slopes over ~35%.
- **Markers:** cities show from the globe view, towns from zoom 5, villages from zoom 8, coloured by kind. They fade out as the plans fade in.
- **City and town plans** (from zoom 11.5, `city.ts`) follow [Watabou's Medieval Fantasy City Generator](https://watabou.github.io/city-generator/):
  - **Layouts** (`layout.ts`): each city and town gets one of five layouts, chosen when the world is named from its culture, local relief, river and coast (deterministic per seed); the hover panel shows it.
    - **Round town:** Watabou's sunflower spiral around one market.
    - **Planned grid:** a Roman castrum or bastide on a rotated, slightly sheared lattice with a squared-off core and straight streets; lots are cut at right angles, and the lattice loosens into old field boundaries further out. Most common in Latin and southern cultures, and on flat ground.
    - **Ribbon town:** stretched along the river, shore, valley or through road, with two rows of wards either side of a gently bowed high street.
    - **Hill town:** an uneven spiral (wards of mixed sizes) with a lobed outline; steep ground is kept out of the core much more strongly and streets wind with the contours. Most common on rough ground and in dwarven, Celtic, Elvish and Slavic cultures.
    - **Twin town:** two cores grown together, on opposite banks when a river runs through (big cities only), each with its own market, joined by a Bridge Street.
    The direction a town follows comes from its local ground: the river through it, else the shore, else the through road, else the contours.
  - Wards are Voronoi patches on a sunflower spiral (relaxed once), sized from population.
  - The wall follows the outline of the inner patches, with towers. Gates face the incoming roads.
  - Main streets run from each gate to the central plaza. Roads out to the country bridge rivers but never cross more than 150 m of sea or lake; they go round a bay instead, or are left unbuilt.
  - Special wards: a temple beside the plaza, a citadel with its own wall and keep on the wall's edge, and parks.
  - Wards are paved (cobbles inside the walls, beaten earth in the suburbs), so the gaps between blocks read as streets and alleys.
  - Wards are cut into small blocks (about two lots deep) with an alley (2.8 to 4.2 m) at every cut, so no block is walled in by its neighbours; contour terraces on slopes are crossed by alleys too. Blocks are then cut into terraced buildings by recursive lot cutting. Every house reaches the block edge (a street or alley); the backs of the blocks are yards (kept 3 m back from the water, and left out on harbour quays and beside piers, where only warehouses stand, clear of the pier ends). Slivers, scraps and triangles too thin to build on are left as yard.
  - Suburbs are small blocks with lanes between them: houses front the lanes, gardens fill the backs, and blocks away from the road stay as meadow.
  - Outside the walls are suburbs along the roads, then fields with furrows, orchards and meadows.
  - Sea, lakes and rivers (at their true width) carve the plan; streets crossing a river become bridges.
  - **Terrain:** the walled core grows onto the gentlest nearby ground. Street routing penalises steep grades. On slopes, blocks are cut into terraces along the contours, and ground too steep to build on is left wooded. The citadel and temple take the high ground.
  - **Harbours** (`harbour.ts`): along the waterfront, piers (some with T-heads) reach out to open water, with boats moored alongside. Shore wards become warehouses, cities get a lighthouse and ships at anchor, and river towns get short jetties.
- **Fitting plans to the ground** (`ground.ts`): every plan gets a usable-ground test built from its local terrain grid (distance to water by chamfer transform, slope, and the exact shoreline near the water).
  - **Barrier seeds:** field Voronoi diagrams get extra seeds just past the edge of usable ground (shores, river banks, steep crags) whose cells are discarded, so the neighbouring fields end along the shore in short irregular steps, as on a hand-drawn map.
  - **Fitting:** fields, meadows, yards, paving, parks, plazas and the citadel are densified, and each vertex is pulled in to the last usable point on its ray from the centre (marched outward in steps that stride by the distance to water), so inlets and ponds reaching into a polygon are cut out too; vertices end on usable ground (at least 4 m from water for fields), with inward-only smoothing and a slight hand-drawn wobble; furrows are clipped to the fitted outline. Buildings and lots are kept only if every corner is on dry, workable ground.
  - **Terraces:** on gentle slopes (6–14% in villages, up to 20% around towns) fields are cut into strips along the contour, with furrows following it.
  - **Hedgerows:** some fields and meadows get a dotted hedge outline.
  - **Walls** are walked in short pieces, so they stop at the shore with a tower instead of crossing a bay between two corners.
- **Village plans** (from zoom 12.5, `village.ts`, shared pieces in `kit.ts`) follow [Watabou's Village Generator](https://watabou.github.io/village-generator/). Buildings stay off ground steeper than 35% and turn to run along the contour on hillsides; fields on slopes over 14% become pasture, and over 25% are left wooded. Each kind has its own layout:
  - **Farming:** winding lanes from each track to a common centre with side lanes, houses facing the lanes (densest at the centre), a chapel in larger villages, Voronoi fields with furrows cut by the lanes, and trees in clumps and gardens.
  - **Fishing:** houses crowd down to the shore, with jetties, moored and beached boats, paths to the water, and a few fields inland.
  - **Logging:** a clearing in dense forest with a sawmill (on the river bank if there is one), stacked logs, stumps and a few cabins.
  - **Mining:** adits up the slope with cart tracks, spoil heaps, a smelter and huts.
  - **Monastery:** a walled compound with a church, a cloister around a garth, ranges, vegetable beds and an orchard, surrounded by fields.
  - **Keep:** a ringwork on the hilltop with a ditch, a wall with towers and a gate, a keep tower and hall, and a hamlet along the approach.
- **Names** (`naming.ts`): every settlement and village has a name in its culture (keeps, abbeys, mines and camps get fitting forms such as "Castle X" or "X Priory").
  - **Quarters** grow over the ward adjacency graph from spread-out seeds and are named after what they hold (Old Town, Castle Quarter, Harbour Quarter, Temple Quarter, Market Quarter, the Heights, gate quarters, craft quarters); suburbs are named after their gate.
  - **Districts:** the market, temple (dedicated to a named deity), citadel, garrison, harbour, parks and graveyards are labelled.
  - **Garrison and graveyard:** walled cities and towns over 2,500 people get a garrison ward with barracks and a drill yard by the citadel or a gate; some cities turn a park or wall ward into a graveyard with a hedge and rows of graves.
  - **Streets:** main streets are named (High Street, gate streets) and roads leaving town are named by direction.
  - **Notable buildings** get a role and a label: inns and taverns (with generated signboard names), moot hall, guildhall, library, smithy, bakery, apothecary, pawnshop, tailor, butcher, stables, bathhouse, chandlery and fishmonger; villages get an inn, smithy, chapel and churchyard, mill, sawmill or smelter. Labelled buildings are tinted on the plan.
- **Styling** (`components/map-style.ts`): plans are vector layers drawn in true metres (each feature carries its pixels-per-metre at zoom 20). Roads and streets share one width expression, so world roads join the plan roads seamlessly. The map zooms to 20 (~0.15 m/pixel).

## Building interiors (`src/interiors/`)

Every building on a town or village plan has a deterministic interior in the manner of [Watabou's Dwellings](https://watabou.github.io/dwelling.html), generated on demand from its footprint, its context and the world seed (`dwelling.ts`).

- **Tagging:** plan buildings carry an id, their settlement, tier and context (ward kind in towns: ward, rich, harbour, suburb, farm; or the village kind) and, where known, the direction of their street front (the lot edge on the block's street, the nearest road, or the village lane).
- **Grid:** the footprint is laid on a 1.5 m (5 ft) grid turned so the street front is at the bottom. Convex footprints (nearly all lots) keep their true outline: the plan is clipped to it and its edges are the outer walls, so slanted and triangular lots keep their shape. Furniture and stairs stay on whole cells.
- **Type:** cottage, farmhouse, town house, mansion, warehouse, temple, keep, hall, storehouse, mill, monastic range, cabin or miner's hut, from the building's use and context. Labelled buildings use their role instead: inns and taverns (taproom, kitchen, guest rooms), civic halls, libraries, barracks, stables and bathhouses get their own programmes, and shops put the matching trade room on the street. The view's title shows the building's name. The type sets storeys (with storey heights), the chance of a basement, and the roof (gabled on rectangles, hipped otherwise, flat with battlements on keeps).
- **Rooms:** a binary partition of the footprint shared by every storey, so walls line up floor to floor. Each floor's programme (for a town house: hall, a shop, workshop, smithy, bakery or taproom on the street, kitchen at the back, pantry, parlour; bedrooms and a landing above) is assigned to the partition by preference (the stair, front, back, large, small). Temples get a nave, sanctuary and vestry, and keeps a guardroom, great hall, lord's chamber and dungeon cells. Cellars are one vault.
- **Stairs:** one stairwell through every floor (a ladder to cottage lofts, a spiral stair in keeps), placed under the ridge when there is an attic. The attic covers the cells with at least 1.7 m of headroom under the roof.
- **Doors and windows:** a spanning tree of doors from the entrance (or stairwell) plus the odd extra door, a front entrance on the street side and sometimes a back door; windows along outside walls with piers between them (front and back only in terraced town houses, gable ends in attics, arrow slits in keeps, none underground).
- **Furniture** by room: beds, chests, wardrobes, hearths and ovens on outside walls (with chimneys above), tables with chairs, counters, workbenches, shelves, bookcases, barrels, crates and sacks, pews and an altar, tombs in a crypt, straw in the cells.

Views (`render.ts`, `building.ts`, `components/DwellingView.vue`):

- **Hover preview:** from zoom 17, the ground floor is drawn into an image placed over the building's footprint on the map.
- **Dwelling view:** double-click a building (or tap it twice) to open a full-screen view with a tab per floor (basement, ground floor, upper floors, attic or loft) and an **Exterior** tab. Plans are inked in a hand-drawn style with a 5 ft grid, room labels, a north arrow and a scale bar; Labels and Grid can be turned off, and **Download PNG** saves the current view for use as a battlemap. The exterior is an isometric drawing: timber-framed or stone walls with the plans' windows and doors, gable ends, the roof (thatch, tile, slate or shingle by type) shaded by slope, and chimneys over the hearths. **Leave building** or Esc returns to the map; the arrow keys change floors.

## Caves and glades (`src/lairs/`)

Caves and glades are placed with the villages, per 1° block on a jittered ~30 km grid (`towns/manager.ts`), and drawn as map icons from zoom 8.6 with their names from zoom 10.4. They follow the **Settlements & roads** toggle.

- **Placement:** caves in hill and mountain country (more likely the higher the ground), in the face of the steepest slope within 1.5 km; glades in the forests (and now and then in riverside woods, scrub and savanna), on the most level ground within 900 m. Both keep clear of towns and villages.
- **Tags** come from the site: a size (small, medium or large); for caves, sealed (no way out), wet or flooded where it rains, dry in deserts; for glades, one or two features (a great tree, a pond, standing stones, a stream (likelier by a river), a camp, ruins, rocks, flowers), and dry in arid or hot country (no water, yellowed grass and crowns).
- **Names** (`names/names.ts`, `lairName`) use the local culture's proper names (now and then an English compound, as in Watabou's "Starbog") with a noun that fits the size, water or feature (Hole, Grotto, Caverns, Catacombs, Halls; Glade, Dell, Glen, Stones, Pool, Oak), plus a few culture-specific nouns (dwarven Delve and Deeps, Elvish Bower, Celtic Nemeton). Descriptive forms appear too: "the Dripping Grotto", "the Troll's Den", "Glade of Whispers".
- **Caves** (`lair.ts`), after [Watabou's Cave Generator](https://watabou.github.io/cave-generator/): chambers of two or three overlapping round halls joined by a spanning tree of winding passages (plus the odd loop), stamped into a field, roughened with noise and traced as smooth walls by marching squares; specks and small pockets are cleaned up. Unless sealed, one or two passages run off the map edge as entrances. Pools fill low noise hollows in wet and flooded caves; boulders sit near the walls, stalagmites stand in clusters.
- **Glades:** a noise-warped clearing (sometimes with a second lobe) in a forest of tree crowns packed on a jittered grid, with stragglers at the edge and the chosen features inside; grass tufts and flowers fill the open ground.
- **Drawing** (`render.ts`): caves in ink on parchment, with a rock band and Watabou-style hatching (groups of short parallel strokes) round the walls, a 5 ft grid on the floor, pools, boulders and entrance arrows; glades with scalloped crowns sharing one inked outline, shadows and highlights, a 5 ft grid over the clearing, standing stones, tents and campfire, broken walls and water.
- **Views** (`view.ts`, `components/LairView.vue`): hovering an icon or name shows a card with the name, tags and a miniature; from about zoom 17, once the map is more than ~170 px wide on screen, hovering lays the map over the ground at its true size instead (with a faded rim). Double-click (or tap twice) to open the full view, with Grid and Entrances toggles, a north arrow, a scale bar and **Download PNG**; **Leave** or Esc returns to the map.

## Project structure

```
index.html
src/
  main.ts, App.vue, store.ts, style.css
  components/   MapView.vue, LairView.vue (cave / glade view), map-style.ts (settlement layer styles), label-style.ts (lettering layers), ControlPanel.vue, RangeField.vue, DwellingView.vue (interior view)
  gen/          world.ts (pipeline), tectonics.ts, climate.ts, ocean.ts, koppen.ts, advect.ts, streamlines.ts,
                hydrology.ts, rivers.ts, river-index.ts (river distances, meanders, valley carving), settlements.ts (cities, towns, roads), features.ts (feature detection and naming), detail.ts (sub-grid terrain sampler),
                biomes.ts, grid.ts, noise.ts, heap.ts, rng.ts, config.ts
  names/        cultures.ts (naming cultures), names.ts (name bank), culture-map.ts
  render/       tiles.ts (tile + equirect renderer), fantasy.ts (fantasy style + map symbols), palette.ts
  lairs/        lair.ts (cave and glade generator), render.ts (drawing), view.ts (map card, overlay, caches)
  interiors/    dwelling.ts (interior generator), render.ts (plan and exterior drawing), building.ts (map hover preview, cache)
  towns/        manager.ts (villages, tracks, plan cache), city.ts, layout.ts (city layouts), village.ts, kit.ts (village building blocks),
                harbour.ts (piers, boats), naming.ts (quarters, districts, streets, notable buildings), ground.ts (usable-ground fitting), terrain.ts (local height/water grid, contours), plan.ts (local frame + GeoJSON), geom.ts
  worker/       world.worker.ts, towns.worker.ts, protocol.ts
  world/        client.ts (worker pool + map protocol), probe.ts
public/fonts/   IM Fell English (SIL Open Font License, see OFL.txt)
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
| Building interiors | [Dwelling](https://watabou.github.io/dwelling.html) | **Done:** floor plans for every building (hover preview, double-click to go inside), with an isometric exterior. |
| Caves | [Cave](https://watabou.github.io/cave.html) | Cave systems seeded from mountain and karst sites. |
| Dungeons | [Dungeon](https://watabou.github.io/dungeon.html) | Grid battlemaps for ruins, tombs and lairs. |

Each site gets a seed derived from the world seed and its location, so every zoom level is deterministic and shareable.
