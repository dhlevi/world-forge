# Navigating the world

How the player moves through the world at its different scales: walking the local map, travelling
the world map, camping, and visiting cities. Part of the design vision ([vision.md](vision.md)).
Each part is marked **Decided** (the user's design) or **Proposed** (a suggestion to agree or
change).

## Two scales

*Built so far (the travel map's base): the three scales, routes by chunk with costs by ground and
slope, travel with the clock running and stopping for arrival, the player, dusk and placeholder
events, and zooming in; see the README.*

**Decided.**

- **The local map:** the world in chunks of 1.5 m tiles, walked turn by turn (built in Phase 2,
  `packages/core/src/local/`).
- **The travel map:** a world map for fast travel between places, as in RimWorld and UnReal
  World. Travel can stop at any time and **zoom in** to the local map where the party stands.

**Proposed: one travel step is one chunk.** The travel map's grid is the local map's chunk grid
(96 m on a side), so zooming in loads exactly the chunk the party is in, and the chunks around it,
with nothing to reconcile between the two.

**Decided: travel runs on its own.** Click a place, choose Travel, and time ticks forward by
itself, in real time on the screen, until the player stops it, the party arrives, or an event
forces a stop. **Proposed:** the route follows roads and tracks where it can; the token moves
step by step with the clock running visibly (a few game minutes per real tenth of a second, with
a speed control); hunger, weariness, nightfall and weather are reported as they come and can be
set to pause travel.

**Proposed: travel time and cost.** Each step takes time by terrain (road, track, field, forest,
marsh, hills, snow), weather, season, the slowest member of the party and how loaded they are,
and draws on the physical day pool, food and water as walking would. Rivers are forded where
shallow, swum or crossed by bridge or ferry; mounts, carts and boats change speed and where one
can go (carts keep to roads).

## What the travel map looks like

**Decided (to refine in play): the atlas's style, drawn by the game.** The core already renders the world as
images in several styles (`render/tiles.ts`, `render/fantasy.ts`), and the illustrated town plans
draw every settlement (`towns/illustrate.ts`). The travel map would be those images, drawn by the
game's own renderer (PixiJS) at a few zoom levels, with the party as a token on top and the chunk
grid invisible beneath for movement and events. This keeps the look of a hand-drawn map, which
suits travel, and needs no second set of tile art. Tiles remain possible if the art direction
later prefers them; the travel rules do not depend on the look.

**Decided: zoom levels.** Three fixed levels, not free zoom:

| Level | Shows | Used for |
|---|---|---|
| Country | About 10 km across: roads, tracks, fields, woods, streams, villages, every travel step | Short trips, hunting and tracking, finding a camp site |
| Realm | About 200 km: towns and cities, roads, rivers, mountains, borders | Most journeys |
| World | The whole world (the atlas's globe or flat map) | Voyages and seeing where you are |

Fixed levels keep each one drawn well and readable (the right labels and symbols at each),
and stop the map from becoming a zoom without end; the atlas itself remains for exploring the
world freely.

## Land and sea: caravans and voyages

**Decided:** voyages by sea and caravans by land share the one travel map, each with a process of
its own.

**Proposed.**

- **On foot or mounted:** the party moves step by step as above.
- **Caravans:** pack animals, carts and wagons, drivers and guards; slower, tied to roads for
  wheels, with animals to feed and water, goods to guard, tolls at borders and bridges, and a
  bigger target for bandits. Trading at each stop is the point.
- **Voyages:** passage on a ship between ports, or later a ship of one's own; the route follows
  the sea, with winds and currents (the generator already models both), storms, pirates, and
  landfall to resupply. Time aboard passes in days rather than steps; events at sea can zoom
  into the local map of the deck.
- **Rivers:** boats and barges on navigable rivers, between the two.

## Discovering the world

**Decided:** the world is explored and discovered. Regions travelled through show on the travel
map, shaded a little where they are out of sight now; undiscovered land is covered in cloud, as on
the map of Kingdom Come: Deliverance.

*Built:* cells of 768 m; a new game knows the country within 8 km of home; walking uncovers
about 400 m around the party; out of sight is dimmed; places and roads show only where
discovered; saved with the game.

**Decided: sight by terrain.** How far the party sees depends on the land it stands on.

*Built:* each travel step uncovers the land within a distance set by its biome (about 6 km on a
salt flat, 5 km on desert, snow and alpine ground, 4 km on grassland, 1.5 km in forest, under
1 km in jungle and mangrove), lengthened by how far the step stands above the country about it
(up to three times as far from a hill or ridge, at most 12 km).

**Proposed, to come:** weather (fog, rain, snow) and night shorten it; towers, lookouts and
peaks give the furthest views, and climbing a tree or a hill is an action on the local map.

**Decided: maps as goods.** Maps can be bought, found, copied, made and sold.

**Proposed.**

- **Buying and finding maps:** a map reveals the land it shows when read, without the party
  having been there. Maps are sold by traders, booksellers and chandlers, kept in libraries,
  colleges and monasteries (to be copied, at a fee or by favour), and found in ruins and on the
  dead.
- **Each map has a maker, an age and a reach:** a local map of a barony, a road map of a realm, a
  sea chart of a coast. Its quality follows its maker's Cartography and literacy.
- **Old maps are wrong:** a map shows the world as it was when drawn. The generator already
  knows abandoned villages, ruins and old names, so an old map shows a village that is now a
  ruin, a road that has fallen out of use, a ford that has shifted, a place under the name of a
  former realm. A poor map also misplaces things and leaves gaps. What the map says is drawn in
  the map's own manner until the party sees the truth, which then replaces it.
- **Making maps:** the party's own travels can be drawn up into a map (time, paper and ink, and
  the Cartography skill), which can be sold to traders, guides and lords, or given in a quest.
  Fresh, accurate maps of little-known country sell for most; a trader buys what he does not
  already know.
- **Guides and pilots** know their country as a map in their heads: hiring one shows the way and
  reveals the land as the party goes.

**Decided: rumours and directions.** People tell the party of places they have not seen.

**Proposed.**

- **A rumour or a direction marks a place on the map** (a name and a rough spot, shown as a
  faint mark with a ring of doubt) without lifting the cloud. "Two days north along the river,
  past the mill" narrows the ring; a drunk's tale leaves it wide.
- **Asking the way** is an action in a village or an inn, or of travellers on the road: the
  answer depends on how far the place is, how well known, and the speaker's own travels, and
  some answers are wrong or out of date.
- **Rumours carry news** as well as places (see the rest of the world below): a lair, a ruin
  with treasure, a war, a sickness, a market short of salt. Quests begin from them.
- **The mark firms up** as the party comes near it, or turns out to be false.

**Decided: the starting map comes from the character.** Background, character creation and
occupation set what the character knows of the world at the start.

**Proposed.**

- **Everyone knows home:** the country around the place of birth and of the last years (the
  8 km of today, more for a rural life spent roaming).
- **Occupations add their own knowledge:** a peddler or carter knows the roads and market towns
  of a region; a sailor or fisher the coasts and ports; a soldier the places of past campaigns;
  a pilgrim the road to a shrine; a hunter or forester a wide stretch of wild country; a scholar
  or clerk owns a map or two (with their errors); a noble knows the realm's seats by name.
- **Some knowledge comes as rumour only:** places heard of but never seen are marked, not
  uncovered.
- **The quick start** draws the same from its random background.

## Events on the road

**Decided.** Travel can trigger events that force a zoom in (other travellers, and so on).

**Proposed.**

- **Each step rolls for events** by where and when: the region's danger (war, banditry, the
  bestiary of that land, curses), roads or wilds, time of day, weather, and how visible the party
  is (size, fire, mounts). The storyteller (see the vision's quest generator) paces them so quiet
  journeys stay quiet and trouble comes in turn.
- **Some events force a zoom in:** an ambush, an animal attack, a storm that drives you to
  shelter. The local map opens with the event already set up (attackers placed, travellers on the
  road).
- **Others offer a choice** from the travel map: travellers on the road (talk, trade, pass by,
  avoid), a column of soldiers, smoke on the horizon, a wayside shrine, a body in the ditch. A
  choice can lead to a zoom in or be dealt with from the map.
- **Discoveries** appear as the party passes near them: villages, ruins, caves, lairs and
  landmarks the generator has placed, marked on the map once seen.

## Hunting and tracking from the travel map

**Decided.** Travel should allow hunting and tracking, as in UnReal World.

**Proposed.**

- **Wildlife lives in the land** as a density per kind (from the region's bestiary and the
  biome), not as individual animals far from the player.
- **Signs appear as you travel:** each step, Tracking, the senses (sight, hearing, smell) and
  how quietly the party moves decide whether signs show (tracks, droppings, a carcass, a sighting
  at the edge of a wood), with how fresh they are.
- **Following tracks** is done step by step on the travel map, each step another tracking check,
  until the animal is close; then the local map opens with the animal there and the hunt plays out
  in turns.
- **Traps and snares** can be set from the travel map and checked on a later visit, as in
  UnReal World.
- **Foraging and fishing** work the same way: a travel-map action with time spent and the
  region's flora and waters deciding what is found.

## Camping

**Decided.** The travel map has a camping option for you and your party, as in Owlcat's
Pathfinder games, so resting does not require zooming in.

**Proposed.**

- **Making camp** chooses a site (shelter, water and firewood nearby, a hidden spot or a
  visible one), then the night's tasks for each member of the party: keep watch, gather wood, cook,
  tend wounds, mend gear, hunt or forage nearby, rest. Each task uses the same skills and pools as
  on the local map, worked out in summary.
- **Sleep and recovery** follow the character rules (sleep debt, day pools, wounds, illness),
  helped or hindered by shelter, fire, warmth, food and weather.
- **The night can be interrupted:** a night event (animals at the stores, thieves, a storm, a
  stranger at the fire) zooms into the local map with the camp laid out (fire, bedrolls, tents,
  tethered animals) and the watch awake.
- **A camp can be kept** for several days as a base for hunting or work, and can grow into a
  homestead.

*Built (a first pass; `game/camp.ts`, `game/camping.ts`, `screens/camp.ts`; numbers proposed, to
tune in play):*

- **One camp, from either map.** Shift+C (or Camp on the travel map) looks about for a site: on
  foot within about 60 m, from the travel map within about 120 m (the local map there is made
  first). Up to five are offered: where you stand, the best all round, the most sheltered, by
  water, and the most hidden, each described in words (shelter from the wind by the trees, rocks
  and walls close by; wood by the trees and brush about; the nearest water; how hidden, by how
  little can be seen from it and how far from a road or path). The camp is laid out on the local
  map (a fire ring, a woodpile, a bedroll if a blanket is carried, the shelter, the snares) and
  kept in the save; within 3 km, the camp screen offers to go back to it.
- **Wood and fire.** Gathering wood (an hour, Survival) brings in more where the land is wooded
  and with an axe or hatchet; it is stacked on the woodpile, as is firewood carried. Lighting the
  fire needs flint and steel (Survival, harder in an exposed spot). A fire burns about 1 kg of wood
  an hour, warms those within a few steps (up to 10°C, more in a sheltered spot, less in deep
  cold), and burns out unless tended (waiting at the camp until evening keeps it fed; asleep, only if the night
  plan says so, from the woodpile, at a small cost to sleep).
- **Shelter.** A carried tent (20 minutes), a windbreak (40 minutes, Survival, where there is wood
  to build with) or a lean-to (2 hours, Survival with Carpentry helping, and a blade). Each adds
  warmth (tent 5°C, lean-to 3°C, windbreak 2°C) and better sleep; the tent and lean-to keep off
  the rain.
- **Food from the land.** Foraging (an hour, the better of Survival and Herbalism) finds what the
  season and the land give: greens, roots and mushrooms in spring, berries in summer, nuts,
  mushrooms and berries in autumn, little in winter, and now and then healing herbs. Snares
  (Trapping, a quarter hour each, up to six) are set on runs with cover about the camp, and may
  hold a rabbit when walked, by how well each was set, the land and the time. Roots, mushrooms
  and rabbit are better cooked: eaten raw they give half as much and an unpleasant moodlet.
- **The night.** From 18:00 (before then, wait until evening, keeping the fire in), the night is
  settled in one step: cook up to two meals at the fire (raw food first), mend one worn thing,
  keep watch for up to four hours, and keep the fire in; then sleep until seven. The site's
  shelter and the fire add to the bedding (blanket or ground) and to warmth.
- **What the night brings** (placeholders until creatures and people roam the map; about one
  night in three): animals at the food (kept off by a fire or the watch), rain (kept off by a
  tent or lean-to; otherwise soaked, and an unwatched fire put out), a stranger (welcome at the
  fire on watch; otherwise perhaps a theft, more likely at a site in plain view), and wolves
  (kept off by the fire or the watch; otherwise a sleepless night).
- **Striking camp** packs the tent, takes up the snares (with anything in them), puts out the
  fire, and leaves the ashes.

## Cities and towns

The user's idea: cities reached through a **travel map of the city with menu choices**, as in
Darklands, zooming in on a place for combat, scouting and so on, to keep the volume of people in
a city of 50,000 contained, with an artistic city map.

**Decided (to refine in play): a city view first, the streets always there to walk.**

*Built (a first pass):*

- **Settlements on the travel map:** at the Country scale, every discovered town, city and
  village is drawn as its own plan (walls, streets, buildings, fields).
- **Arriving:** travelling to a settlement makes for its way in nearest the party (a gate in its
  walls, or where a road reaches its edge) and stops there, never in a building. Zooming in
  anywhere puts the party on open ground out of doors.
- **Towns and cities open the city view; villages open straight onto the local map.** On the
  local map, V opens the city view of the town the party is in.
- **The city view:** the illustrated plan, panned and zoomed, with the places of note marked:
  gates and ways in, markets, inns, taverns, temples, the keep, guilds and orders, halls,
  workshops and shops, the docks, and districts (from the generator's labels). Going to a place
  takes the time it takes to walk. Each place has a short menu scene: a meal, a room for the night
  or news at an inn, a drink at a tavern, prayer at a temple, a look at the goods in a market or
  shop (trade to come), looking around, walking in on the local map at that place, or leaving by
  a gate onto the travel map.

- **The city view:** entering a city or large town opens its illustrated plan (the atlas's
  illustrated style), with its quarters and its places of note: gates, market, taverns and inns,
  temples, guildhalls, the keep, the docks, workshops, the homes of people you know. Places are
  chosen from the map or from Darklands-style menus, and moving between them takes time by
  distance.
- **Visiting a place from the menu:** shopping, eating and drinking, finding work, taking
  lodgings, asking around, busking in a square, praying, are done as menu scenes with text and
  choices, without the local map.
- **Zooming in:** any place, or any street, can be opened on the local map (for a fight, a
  chase, a burglary, scouting, or just to walk), with that part of the city and its people there.
  Villages and small towns open straight onto the local map.
- **People in the city:** only the people present where the player is are made in full: the
  household of the building, the staff and customers of a shop, the crowd in a square, drawn from
  the generator's residents and the time of day. The rest of the city lives in summary (its
  households, trades, prices, rumours and troubles), which keeps a city of 50,000 manageable.
- **Where the line falls** between "city view first" and "walk straight in" (by population, or
  for walled towns only) is a choice to make in play.

## The rest of the world

**Decided.** While the player travels, the world moves on in summary rather than in detail:

- **Near the player** (the chunks loaded on the local map), everything is simulated in full.
- **In the region**, people, prices, weather and events advance in coarse ticks (hourly or
  daily): a market's stock and prices, a sickness spreading, a war's front, travellers and
  caravans on the roads as numbers rather than people.
- **Further away**, news is all that matters: events happen at the realm level (a battle, a
  succession, a plague, a famine) and reach the player as rumours, late and changed.
- **On arrival**, a place is brought up to date from its summary before it is shown.

## Open questions

- Where cities switch to the city view, and how much of daily city life happens in menus rather
  than on the local map.
- How often the regional ticks run and what each tracks, which will follow from the economy and
  the quest generator.
