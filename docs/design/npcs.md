# People and animals in the world

How the world's people and animals appear on the local map, live their days, see and hear, and
react to the player and to one another. Part of the design vision ([vision.md](vision.md)), first
of all the pillar **the world is real**: the world exists before the player and goes on without
them. Each part is marked **Decided** (the user's decision), **Proposed** (a suggestion to agree
or change) or **Dev note** (to build later; recorded so that the first stages leave room for it).

This document is the reference for the NPC phase. Read it with [characters.md](characters.md)
(actors, traits, skills, needs, mood, animals as simpler actors), [navigation.md](navigation.md)
(the local map, levels and floors, cities and towns) and [survival.md](survival.md) (light, weather,
tracking, hunting).

## Decisions taken

**Decided (16 November 2026).**

1. **Design first.** This document is agreed before the first stage is built.
2. **A bubble, plus schedules.** People and animals within about two chunks of the player act
   tile by tile. Everyone else is not simulated: when the player comes near, each person is placed
   where their routine puts them at that hour. Lasting changes (robbed, hurt, dead, moved away,
   a grudge against the player) are remembered and saved.
3. **People first.** Stage 1 is the residents on the map: their figures, their routines, doors,
   cover from the rain, noise and tracks. Stage 2 is animals. Stage 3 is the second pass of
   behaviour (thieves, fear, temple days and holidays, events).
4. **Layered figures.** People, and the player, are drawn in layers (a body base by sex and
   people, then hair, beard and worn clothing, each tinted), so that what is worn shows. The same
   rules draw the player.

**Decided (17 November 2026), from the first draft's open questions.**

5. **Crowds thin unseen.** The player should not notice the thinning. How many are out of doors
   follows the residents known to live and work about the place (see How much is simulated).
6. **Real belongings from the start.** Every person carries basic equipment and money by their
   trade and means, so that pickpocketing and theft (Stage 3) have something real to take.
7. **Reputation.** Each person met holds an opinion of the player that drifts back to neutral
   over time; above that, a reputation with nations, regions and cities, and a faction system
   (see Reputation).
8. **Street animals with the animals.** Dogs, cats, rats and pigeons come in Stage 2.
9. **A smaller bubble in dense places.** The bubble is smaller in dense cities and larger in
   open country, and may grow where performance allows.

## Principles

**Proposed.**

- **One kind of actor.** An NPC is an actor like the player's character (`apps/game/src/actors`):
  the same body, traits, skills, needs, mood and inventory, with a mind in place of the player.
  Rules written for the player (sight, light, doors, levels, stairs, weather, needs, checks) apply
  to everyone, so that the world is consistent and the rules are tested twice.
- **Worked out, not stored.** Who lives where, their trade, their looks, their routine and their
  day's variations come from the world seed, the building and the person (as the local map and
  the atlas's residents already do). Only what has changed is saved.
- **The atlas is the source.** The people on the map are the atlas's residents
  (`packages/core/src/people/residents.ts`, `plan-residents.ts`): the same names, households,
  trades, means, traits and ties that the atlas's building window shows. The game adds no other
  residents.
- **Cheap by default, rich where the player is.** Detail costs only inside the bubble. A city of
  fifty thousand is never simulated as a whole.
- **Readable behaviour.** A routine the player can learn (the baker is up before dawn, the smith
  drinks at the Goose on market days) is worth more than clever but opaque behaviour.

## Who is in the world

**Proposed.**

- **Residents.** Every building's households, from the plan (`plan-residents.ts`): name, sex, age,
  people, trade, role in the household, traits, means, a note, and ties to neighbours. A barracks or
  a monastery adds `more` unnamed members; they are made in full (named, from the same seed) only
  when the player meets them.
- **Workplaces.** Each working person is given a place of work, worked out once from the plan:
  - their own building's ground-floor shop or workshop, where it has one (the smith's smithy);
  - else the nearest building of their kind of work (a labourer to the docks, warehouses or a
    building site; a guard to a gate, the walls, the barracks or the keep; a priest to the
    temple; a clerk to the town hall or a counting house);
  - else the fields, orchards or pastures nearest the home (farmers, shepherds, ploughmen);
  - else "about the town" (porters, hawkers, beggars): a round of the market, the streets and the
    squares.
- **Visitors** (Stage 3). Guests at the inns, pilgrims, merchants and carters on the roads,
  patrols, from the town's stats (trade, crime, pilgrims). Not residents of the plan; made from
  the place and the day's seed.
- **The people of the player's life.** The ties made at character creation (characters.md,
  People in your life) become persons placed in their households, so that they can be found.
- **Animals** (Stage 2, street animals included). Wild animals from the region's bestiary (`packages/core/src/nature/bestiary.ts`),
  livestock from farms, stables and pens, and the town's dogs, cats, rats and birds (Stage 2).

## How much is simulated

**Decided:** a bubble plus schedules. **Proposed, in detail:**

| Level | Where | What happens |
|---|---|---|
| **Present** | The chunks within about two chunks (190 m) of the player | Each person and animal is an agent: it moves tile by tile, opens doors, sees, hears, reacts. |
| **Placed** | Entering the bubble | The person is put where their routine says they are at this hour (asleep in bed, at the forge, on the way to the inn: part-way along the route). No past steps are simulated. |
| **Remembered** | Everywhere, saved | A small ledger per person who has changed: alive or dead, hurt, robbed, moved, carrying, where last seen if away from their routine, and how they regard the player. |

- **Crowds.** In a city the bubble may hold hundreds of residents. Most are indoors at any hour.
  The crowd out of doors is made of the residents whose routines put them there (those who live
  and work about the place), so it is as large as the place's own people make it. Where it passes
  a cap (to tune, about 150 agents), a seeded share is placed indoors at their routine's place
  instead. **Decided:** the player should not notice: people are thinned only out of sight (never
  one who is seen, or who has been seen in the last minutes), the thinned are chosen from those
  out of the way of the player's path, and a street never empties at once.
- **The bubble's size** **(decided: smaller in dense places).** About two chunks (190 m) in open
  country; one chunk and a half in towns; one chunk in the dense wards of a city. It grows where
  the agents' queue keeps within its budget, measured as the game runs.
- **Leaving the bubble.** An agent that leaves the bubble keeps its plan and is placed by its
  schedule when next met. Anything that changed it goes into the ledger first.
- **Long jumps** (sleeping, travelling, the city view's menu actions) do not step the agents: on
  returning to the local map, everyone in the bubble is placed again by their schedule.
- **The city view** shows the same people: an inn's scene can name who drinks there tonight
  (Stage 3).

## Time

**Proposed.**

- The player's actions move the clock (game/game.ts). After each action, the agents in the bubble
  act in time order up to the new time: each has a `nextAt` (when it next acts), set by the length
  of what it did (a step 1.2 s, a diagonal step 1.7 s, a door 2 s, as for the player).
- **Waiting and resting** run the same queue, so that the player can stand in a square and watch
  the town go by.
- **Budget.** Agents far from the player (in the bubble but out of sight) may act in coarser
  steps (whole path legs at once) to keep the work per player action small. Target: under 4 ms per
  player step with 150 agents on a mid-range machine.

## The mind

**Proposed: a schedule as the plan of the day, utility choices for what interrupts it.**

1. **Schedule.** Each person has a day plan: a list of blocks (sleep, wake and dress, eat, go to
   work, work, midday meal, chores or errands, leisure, go home, eat, sleep), each with a place
   and a time window. It is worked out from the person and the day, so it is the same every time
   that day is looked at.
2. **Interrupts.** Each action, the mind checks a short list of urgent needs, highest first:
   fleeing danger, shelter from rain or cold, a need that cannot wait (hunger, thirst, the
   privy), an opportunity (a thief's chance), a social moment (greeting a friend, answering the
   player). The highest that applies, scored by the person's traits and state, takes over until it
   is done; then the schedule resumes where the person now is.
3. **Plans and actions.** A block or an interrupt becomes a short plan of actions: walk a path,
   open a door, go up stairs, sit, work, eat, sleep, talk, pick a pocket. Paths are found on the
   tiles (A* over floors and stairs, doors as passable at a cost), cached per destination.

Why not a full goal planner or behaviour trees: a goal planner (as in F.E.A.R.) is more than daily
life needs and is hard to make readable; behaviour trees become rigid as variations grow. A schedule
gives readable days; utility interrupts give believable reactions; both are cheap.

### Routines

**Proposed.** Routines are built from templates by trade, role, means and the place's culture,
then varied per person and per day:

- **Templates.** Craftsman (shop hours, a midday meal at home), labourer (early start, long day),
  farmer (dawn to dusk, by the season), merchant (the market and the counting house), guard (watches
  in turn, by day or night), priest (offices at set hours), innkeeper (late hours), servant (the
  household's chores), child (play, errands, apprenticeship by age), elder (short days, the
  temple, the bench outside), beggar and vagrant (where the alms are), night trades (watchmen,
  thieves, night-soil men).
- **Variation.** The day's seed shifts times by a little; traits shift them more (an early riser,
  a drinker who stays late at the tavern, a pious soul at every office); ties add visits (a friend,
  kin, a sweetheart); the household's means decides where leisure goes (an inn, a tavern, the
  square, home).
- **The week and the year.** A rest day by the local faith (no work, the temple in the morning),
  market days, the seasons (farm work, shorter days in winter). Festivals, holy days and events
  are Stage 3 (below), as modifiers to the day's templates.

### Behaviour by stage

| Behaviour | Stage |
|---|---|
| Follow the day plan: sleep, eat, work, leisure, home | 1 |
| Open and close doors; lock home doors at night | 1 |
| Go up and down stairs between floors | 1 |
| Take cover from rain and snow; head indoors at dark | 1 |
| Step aside, wait, or go round when the way is blocked | 1 |
| Greet friends and kin when passing; answer the player with a line | 1 |
| Flee and hide when frightened (a fight, a monster, fire) | 3 |
| Thieves: sneak (Stealth), pick pockets (Sleight of hand), lift goods from stalls, avoid guards | 3 |
| Guards: patrol, notice crimes, give chase | 3 |
| Use their skills at work in sight of the player (the smith at the anvil) | 1 (as animation and noise), 3 (as real work) |
| Temple days, holidays, festivals, market days | 3 |
| Plague, curfew, war, famine (see Dev notes) | 3 or later |

## Senses, noise and tracks

**Proposed: one stimulus system for every actor (the player included).**

- **Sight.** The same field of view and light as the player's (game/game.ts), from the actor's
  eyes; in the dark, only what light shows. Agents look in the direction they face (a wide cone)
  and notice what is near at once, what is far after a while.
- **Noise.** Actions make noise events with a loudness: a step on stone, gravel, mud or in water;
  running; a door; work (the hammer on the anvil); speech, a shout, a scream; a fight. Loudness falls
  with distance, and walls and closed doors muffle it. Each actor hears by its Hearing sense
  (characters.md, Senses). Noise drives reactions (a scream draws the guard, a shout scatters the
  deer) and the player's log ("You hear hammering to the east").
- **Tracks.** Moving over soft ground (mud, snow, sand, earth, wet grass) leaves tracks per tile:
  who or what (by size and kind), which way, when. They fade with time and weather (rain and fresh
  snow cover them). Reading them is the Tracking skill: what made them, how old, how many.
  Tracks are kept only in the bubble and for a few days. *Built for snow* (backlog W2, 21 November
  2026): prints pressed into lying snow are plain to anyone (read as a fair tracker would), last
  six days, and go with the thaw or under fresh snow.
- **Smell** (Stage 2, for animals): the wind carries scent; animals with keen noses notice the
  player downwind.

## Figures

**Decided:** layered figures, for people and the player alike. **Proposed:**

- **Layers, in order:** shadow; body base (by kind of people: human, elf, dwarf, halfling, orc,
  lizard, gnome; by sex; tinted by skin); legs (trousers, hose, leggings); feet; body garment (tunic,
  dress, robe, coat, armour); belt; cloak; hair (by style, tinted); beard (by style, tinted); head
  (hood, cap, hat, helm); what is held (a tool, a weapon, a light).
- **Where the layers come from.** The person's looks from the culture's appearance template
  (`packages/core/src/people/appearance.ts`: skin, hair and beard colours and styles, the
  commoner's, noble's and warrior's dress) and from what they wear (their inventory, as the
  player's). A worn item names its layer and picture; its colour comes from its make or from
  the culture's palette.
- **The tileset.** Frames named by layer and facing (`figure:body_<kind>_<sex>_<facing>`,
  `figure:hair_<style>_<facing>`, `figure:wear_<item>_<facing>`), each with a walking frame, in
  the TILESET.md format; layers drawn in grey and tinted by the game. Placeholders are generated
  until the art exists, and `npm run tileset:template` gains the layers.
- **Size.** A dwarf or a halfling is drawn shorter in its tile; an ogre may stand over two tiles
  (later).
- **Telling people apart.** Looking at a person names them if known ("Aldo Venn, the smith"),
  else describes them ("a stout dwarf in a leather apron").

## Belongings

**Decided:** every person carries real belongings from the start. **Proposed:**

- **Worn and carried** by trade, means and the day's routine, from the same item definitions as
  the player's (`apps/game/src/data/items`): everyday clothes for the culture and the season, a
  purse with coin by means (a beggar's coppers, a merchant's silver), the tools of the trade (the
  smith's hammer at the forge, the carpenter's tools, a guard's spear and helmet), a knife, and a
  few personal things (a keepsake, a letter, a key to the home).
- **Made when first needed** (when the person enters the bubble), from the person's seed, so that
  it is the same every time; saved in the ledger only once something has been taken, given or used.
- **The home and the workplace** hold the rest (stock in the shop, savings in a chest), for theft
  and trade later.

## Reputation

**Decided:** a baseline opinion per person met, drifting back to neutral over time; reputation with
nations, regions and cities; factions. **Proposed:**

- **Personal opinion.** Each person the player has dealt with keeps an opinion (−100 to +100)
  with its causes ("you paid your debt", "you were seen in my house at night"), each cause
  fading at its own rate back toward neutral; kin and close friends share some of it. Saved in
  the ledger.
- **Standing with places.** A reputation in each city, region and nation, raised and lowered by
  deeds that are seen or told of (a crime witnessed, a monster slain, a festival sponsored); it
  sets how strangers greet the player, prices, and the watch's suspicion. It too drifts back,
  more slowly.
  *Built for settlements* (21 November 2026, with combat stage 4; `world/law.ts`): each
  settlement's regard from the deeds seen there (crimes, robbers killed or handed over), fading by
  half in 45 days; half of it colours its people's greetings, and the watch know a wanted face.
  Regions, nations and prices are still to come.
- **Factions.** Guilds, orders, temples, the thieves' guild, the watch, a lord's household
  (`packages/core/src/lore/orders.ts` and the town's institutions): membership and rank, standing
  with each, and how factions regard one another (helping the thieves angers the watch).
- **What others know.** A deed reaches a person's opinion only if they saw it, or heard of it
  (rumour spreading through ties and taverns, with quests.md); reputation is not omniscient.
- **Disguises** *(added at the user's request)*. Reputation attaches to whom people believe they
  are dealing with. A disguise (the Disguise skill: clothes, bearing, voice, and the kit to change
  a face) gives the wanderer another appearance; while it holds, people judge the disguise, not
  the wanderer, so a bad name in a town can be walked past. **Proposed:**
  - *Making one.* A disguise is a named persona built from what is worn (a priest's robe, a
    guard's livery, a beggar's rags), changes to hair, beard and face, and a manner; its quality is
    a Disguise check, better with fitting clothes and kit, worse for a body hard to hide (height,
    kind of people, a famous scar).
  - *Holding it.* Each close look, talk, or act out of character (a beggar paying in gold, a
    priest who cannot say the rites) tests it against the onlooker's notice (Wisdom, Eyesight,
    and how well they know the wanderer: kin and friends see through it soonest). Light, distance
    and crowds help; the watch with a description is keener.
  - *Its own name.* A disguise used again carries a reputation of its own: deeds done in it are
    told of it ("the grey friar who robbed the toll house"), with its own opinions, standings and
    wanted notices, so a much-used disguise in time draws attention of its own.
  - *Exposure.* When a disguise is seen through (and the word spreads, as any deed does), its
    reputation merges into the wanderer's for those who know: the friar's crimes become the
    wanderer's, and the disguise is burnt there.
  - *Saving.* Each persona is kept: its look, its reputation by person and place, and where it has
    been exposed.
- Stage 1 keeps only the personal opinion's store and its drift; places and factions come with
  the second pass and the quests. Disguises come with skills in use (Stage 4), on the reputation of
  places and factions (Stage 3).

## Talking and dealing (first stage only)

**Proposed.** Stage 1 keeps interaction small, ahead of the quest generator and the economy:

- **Look** at a person: who they are if the player knows them, their trade if it shows, what they
  are doing ("hammering at the anvil", "asleep").
- **Bump** into a person: they step aside if they can, else a line is said ("Mind your step.").
  *Built* (backlog N1 and B2, 21 November 2026): one who steps aside leaves the way clear and the
  wanderer walks on into it; they keep out of the way until the wanderer has gone on, then go back
  to their place. With no room to step aside (a crowded hall, a narrow way), the wanderer squeezes
  past and they take the wanderer's place. Inside buildings, people are given places that keep the
  doors and passages one tile wide clear, and a building holds at most about two in three of those
  places at once (`worker/people.ts`, `roomy`).
- **Talk** (a key): a greeting and one line from their state, routine or ties ("Off to the Goose;
  Brena's buying tonight."). Rumours and quests come with quests.md.
- **Trespass:** walking into a home at night, or into rooms not open to the public, is noticed and
  remarked on (a door locked against the player is the first, simplest form of it).

## Animals

**Proposed, for Stage 2.**

- **Species.** The region's bestiary: the common beasts and birds of the habitats about the
  place, the uncommon and rare by luck. Domestic animals from the plans (cattle and sheep on the
  pastures, horses at stables and inns, pigs and hens at farms), and the town's dogs, cats and
  rats.
- **Bodies and needs.** Simpler actors (characters.md, Animals): a body plan (four-legged, bird,
  serpent), the physical pools, hunger and thirst, and a temperament in place of traits (timid,
  skittish, wary, aggressive, tame).
- **Behaviours.** Grazing and wandering in a home range; going to water at dawn and dusk; sleeping
  in cover; herds (sheep, deer, horses) moving together by simple flocking rules on the tiles
  (keep near the others, not too near, the same way); fleeing what they fear by sight, noise and
  smell, the herd fleeing together; predators (wolves, bears) hunting prey, stalking, chasing and
  giving up, and wary of people unless hungry or cornered.
- **Birds across levels.** A bird is on the ground, perched (on a tree's branches or leaves at a
  level, a roof, a wall), or flying at a level above the ground. It climbs and falls a level a few
  steps at a time; it perches where the tree parts allow (core local/trees.ts); it calls (a noise
  event); flocks wheel and land together; a startled flock rises at once. The slices show birds at
  their level; the surface shows a flying bird's small shadow.
- **Where animals come from.** A chunk has a seeded population by biome, season and hour, thinned
  near settlements; herds and packs are remembered per region (how many are left after hunting),
  not as individuals.
- **Hunting** (with survival.md): tracks, scent and wind, stalking (Stealth), shooting (Archery),
  trapping, butchery (yields from the bestiary).

## Dev notes: days and events

**Dev note** (Stage 3 or later; the schedule leaves room for each as a day modifier):

- **Temple days and holy days.** Each faith (`packages/core/src/lore/faiths.ts`) gives a rest day in
  the week and holy days in the year (the scripture already speaks of feast days and holy days).
  On those days work stops, the temple fills at the offices, and feasts or fasts change the meals.
- **Holidays and festivals.** Seasonal festivals by culture and climate (harvest, midsummer,
  midwinter, the first sowing), a town's own fair or saint's day: stalls in the square, music,
  drinking, contests, more visitors, more thieves.
- **Market days.** Stalls set up in the market place on the town's days; more farmers in town.
- **Plague and sickness** (with characters.md, Conditions): a sickness spreads by households and
  contact; the sick stay home, some die (into the ledger), shops close, the temples fill, a curfew
  or a quarantine of a ward; masked physicians; the player can catch it.
- **Curfew, war and levies.** Gates shut at dusk; men called to arms leave their trades; a siege
  empties the markets.
- **Famine and dearth.** Prices rise (economy.md), beggars multiply, theft rises.
- **Crime waves and the watch.** The town's crime level (`people/town.ts`) sets how many thieves
  work at night and how many guards walk.

## Saving

**Proposed.**

- Saved: the ledger (persons and animals that have changed), tracks younger than a few days in
  the bubble, and the doors people left open or shut where they differ from their routine.
- Not saved: where each person stood (they are placed again by their schedule on loading).
- A save made mid-errand comes back with everyone where their routine puts them at that hour.

## Code layout

**Proposed.**

- `packages/core/src/people/`: deterministic and shared with the atlas: residents (as now),
  workplaces, routine templates and the day plan (`routine.ts`), and figure specs from looks
  (`figure.ts`). Tested in Node, with the determinism check.
- `apps/game/src/actors/`: new components: `Agent` (the mind's state: the day plan, the current
  plan, `nextAt`), `Perception` (what it has noticed), `Ledger` (what has changed), and for
  animals `Temperament`.
- `apps/game/src/world/` (new): the population of the bubble (placing, thinning, leaving), the
  agents' queue run after each player action, paths, noise and tracks.
- The renderer draws agents among the objects by row, as the player; the tileset gains the
  figure layers.

## Testing

**Proposed.**

- A person's day plan is the same every time for the same world, person and day; routines cover
  every trade the generator makes (no person without a plan).
- Headless runs of a town quarter for a day (Node): everyone reaches each block's place in its
  window; nobody is stuck; doors end the night shut; paths cross floors and stairs.
- Placing by schedule agrees with walking by schedule (a person placed at 10:00 is where a person
  who walked from 06:00 would be).
- A performance test: the agents' queue for 150 agents within its budget per player step.
- Figure layers: every look and every wearable item gives a figure (placeholders included).

## Stages

**Proposed.** Each stage ends playable, with its tests.

*People of the streets* (backlog N3 and N4, 21 November 2026; decided for brigands: both;
`worker/streets.ts`): besides the households, a town's streets have passers-by going from place
to place by day (more in a city); beggars at their spots by day who sleep rough at night (more
where the town is poor); cutpurses in the busy streets by day, who try for the purse of a wanderer
beside them in a crowd (felt by eyesight, wisdom and Sleight of hand: caught, they run, and may be
struck without crime; unfelt, a share of the coin is gone, found out a while later); and, where
the town's crime is 50 or more, brigands in the streets after dark, who rob a wanderer alone and
out of sight of the watch.

*Dwarven delves* (backlog D1, 21 November 2026): the halls under a delve have their people
(`worker/delve.ts`). Each clan home is given a household, and its grown members trades by the
halls' workplaces: smiths, smelters, armourers, merchants, brewers, alehouse keepers, wardens (who
keep the peace there), priests of the ancestors, stablehands and porters. Their day is home, work,
a meal in the great hall or the alehouse, an evening there or at home, and bed; some smiths and
wardens keep the night. The districts and the full working fortress are backlog D2.

**Stage 1: people on the map.**

1. *Figures:* layered figures from looks and worn clothes, for the player first (so that the
   player's clothing shows), then for residents; placeholders; TILESET.md and the template. *(Built for
   the player: `core local/figures.ts` lists the layers (bodies by kind and sex, hair, beards, 23
   garment shapes) and `game/figure.ts` makes a person's figure from their looks and what they
   wear (worn items name their `figure` shape and `colour`); the layers are put together and
   tinted for drawing (`game/figure-art.ts`), with placeholders for every layer and shorter kinds
   squashed toward the feet; TILESET.md and the template list the layers.)*
2. *Placed residents:* the bubble's population from the plans' residents, each placed by a first,
   simple day plan (asleep at night, at work by day, at home in the evening), standing still, each
   with the belongings of their trade and means. Looking at them names them. *(Built: `LocalWorld.buildingsIn`
   (core `local/chunk.ts`) lists the plans' buildings in a box with the tiles of each floor one may
   stand on; `core people/routine.ts` gives each person a place of work (their own building's shop
   or workshop or staff rooms, the house itself, out of doors near home, or away) and a day plan
   varied by person and day; the worker (`worker/people.ts`) places the residents of the bubble at
   a time, beds first for the sleepers, with their looks from their people's appearance; the game
   (`world/population.ts`) makes each an Actor with Identity, Body and belongings
   (`world/belongings.ts`), places them again every quarter of an hour and when the wanderer has gone
   a quarter of the bubble, and lets no change be seen (a move, a coming or a going waits until its
   tiles are out of sight). The bubble is 128 tiles in open country, 96 in a town, 64 in a city.
   Those whose work lies away from home are not placed by day until step 3 works out their
   workplaces; the bubble's full crowd (about 1,100 in a large town by night) is kept as data and
   only those in sight are drawn, so the cap of about 150 agents applies from step 3, when they
   act.)*
3. *Routines and movement:* the day plan in full (templates and variation), the agents' queue,
   paths across floors and stairs, doors, stepping aside, cover from rain, indoors at dark. *(Built:
   `core people/routine.ts` makes each day from midnight to midnight as blocks (an act at a
   place) by template (craftsman, labourer, farmer, merchant, guard on watches in turn, priest's
   offices, innkeeper's late hours, servant, child, elder, beggar, night trade, an inn's guest),
   varied by the day's seed and traits (the diligent work longer, the slothful rise late, the
   gregarious and charming go to the tavern, the pious to the temple); one day in seven is a rest
   day; out of doors only by daylight, from the day's sunrise and sunset. The worker finds every
   block's place: bed (pillow ends first), a place at home and at the table, the workplace (their
   own building, the nearest of its kind for trades that work away, or out of doors near home), one
   of the three nearest taverns or inns, the nearest temple, a square near home; places beyond the
   bubble's reach are left unnamed and the person goes away there. The game
   (`world/population.ts`, `world/paths.ts`) runs the agents' queue after each action: within 40
   tiles or in sight (at most the 150 nearest), people walk tile by tile on A* paths across floors,
   stairs and doors (opened and shut behind them), wait for, squeeze past or step round one another,
   and those standing about step aside; farther off and out of sight they arrive in one go when the
   walk would have ended; rain sends those bound out of doors home; leaving the bubble and coming in
   happen out of sight. *Errands and street life* (added after play-testing, decided with the
   user): the marketing of a house falls to whoever keeps it (most mornings, and now and then in
   the afternoon) or to a great house's cook and maids; craftsmen and merchants now and then fetch
   supplies; carters and porters go round between the warehouses, the market and the gates;
   beggars and hawkers work the market; an inn's traders and pedlars spend the morning there.
   Markets are the open ground among the plans' stalls. At the market an errand makes a token
   purchase from the purse (food for the house, a parcel of supplies for a trade), carried home
   in the basket that those who do the marketing carry. A large town's streets and market hold
   some 400 to 500 people of a mid-morning, against some 100 before. A long way is walked in legs of
   30 tiles. Paths are found at most eight per action, so a crowd setting out at once
   waits its turn and catches up. A long sleep or wait moves those out of sight straight to their
   places. Not yet: home doors locked at night, the city's visitors, and thinning a crowd past the
   cap in sight.)*
4. *Senses, base:* noise events (steps, doors, work, speech) heard by the player and agents;
   tracks on soft ground; Talk with one line; a greeting between friends; the store of each
   person's opinion of the player, drifting back to neutral. *(Built: `world/senses.ts` gives
   noises a loudness a tile away (a step 18 to 40 by the ground, a door 45, speech 50, a smith's
   hammering 75), falling about 6 a doubling of the distance, 15 a level between floors and 6 a wall
   or shut door, heard above a threshold by Hearing; the people's steps (near the wanderer), doors
   and noisy work (smiths, coopers, carpenters, masons, hawkers, taverns) are heard by the
   wanderer when out of sight ("You hear hammering on an anvil in the distance to the east"), each
   kind told once in a while; the wanderer's steps and doors make those awake look toward them,
   and a loud one near a sleeper makes them stir. Tracks are left in soft ground (and in grass
   and on paths when wet) by the wanderer and the people walking near, fade in two days, are washed
   out by rain and covered by falling snow, are drawn as small prints, and are read by Tracking
   (from 15: how many and how old; 30: which way; 45: whose). `world/opinions.ts` keeps each
   person's opinion as causes fading by their half-lives (a civil word +3, five days; being jostled
   or pestered, small and quick), saved with the game, with the tracks. Talk (E) gives a greeting
   by the opinion and acquaintance and a line from what they are about, their trade, the weather
   or a tie to a neighbour in their own words (`world/talk.ts`). Friends, kin, sweethearts and
   partners who pass close in sight greet one another once a day; rivals, feuds and debtors pass
   coldly; those who think well of the wanderer nod to them. Walking into one standing about makes
   them step aside; otherwise they say so, and sharper if it keeps happening.)*

**Stage 2: animals.** Species and populations, bodies and temperaments, grazing and herds,
fleeing, predators, birds across levels, smell and wind, hunting with tracks; the street animals
of towns (dogs, cats, rats, pigeons). *(Built. Decided with the user: predators are threats
only until combat (they stalk, growl and bluff-charge, then back off; since combat stage 2 they
fight, [combat.md](combat.md#stages-decided-order)); hunting is tracking,
sneaking, snares and butchery (shooting waits for combat); each species has its own template
frames. `core local/fauna.ts` lists 47 species, wild (the everyday hare, rabbit, squirrel, fox,
badger, roe deer and the birds; the bestiary's beasts only where the region's bestiary has them),
kept (cattle, sheep, goats, pigs, hens, geese, horses, donkeys) and in the streets (dogs, cats,
rats, pigeons), each with a body plan, size, temper (tame, timid, skittish, wary, aggressive),
diet, group size, hours, pace, sight, hearing, smell, flight distance and yields. The worker
(`worker/fauna.ts`) seeds each chunk by its region's species, thinned in and near settlements and
renewed week by week, each group with a home range and water near it; horses at stables and inns,
hens, pigs and geese about farmhouses, flocks and herds on the grass about villages; dogs and cats
about a town's houses, rats, pigeons at the markets. The game (`world/fauna.ts`) acts them after
each action within 40 tiles: asleep out of their hours (bears through the winter), grazing and
wandering their range, the herd keeping with its leader, down to water at dawn and dusk; they
notice the wanderer by sight (less when sneaking and in the dark), noise and scent downwind, and
flee as a herd (a flock rises at once and comes down farther off, perching in trees); hungry
predators stalk, chase and catch their prey; bold beasts and hungry winter packs bluff-charge the
wanderer. Birds fly a level or two up, drawn raised with a shadow below; the slices do not show
them yet. `world/hunting.ts`: Shift+S sneaks (slower, quieter, harder to see, practising Sneak near
unwary beasts), P sets or lifts a snare (snare wire), which catches small game that steps on
it or, out of sight, by the hour by Survival; a carcass is butchered with a blade (Survival) for
meat, hide, antler, horn, tusk, teeth, claws, feathers or venom. Animal tracks are read by
Tracking with the species named. Snares and the animals taken are saved.)*

**Stage 3: the second pass.** Fear and flight among people; thieves and the watch; visitors;
temple days, market days, holidays and festivals; using skills at work for real; reputation with
cities, regions, nations and factions; the hooks for plague, curfew and war (Dev notes).

**Stage 4: skills in use** *(added at the user's request after Stage 1)*. The wanderer's skills
put to work on the people and beasts of the bubble: trading (buying and selling at the stalls and
shops, haggling by Persuasion and Appraisal, with the economy's prices), tracking (following a
trail of tracks tile by tile, telling a quarry's age and pace), picking pockets and lifting goods
(Sleight of hand against the mark's notice, with the belongings residents already carry),
disguises with reputations of their own (Reputation, Disguises), sneaking past and into places, persuading, intimidating and deceiving in talk, healing, and the
crafts at a workbench. Each use is a check (actors/checks.ts) that practises the skill. Combat is
its own design (combat.md).

**Stage 5: meeting people for real** *(added at the user's request)*:
- *Strangers stay strangers.* Looking at someone shows only what shows: their look, their
  dress and tools, what they are doing ("a woman in a leather apron at a forge"). Their name, trade
  and household are learnt by asking, or from someone who knows them, and kept in the journal of
  people met.
- *Their own tongue.* Residents speak the language of their people (lang/), written out in it.
  What they say is translated only as far as the wanderer knows that language (characters.md,
  Languages): a few words, the gist, or all of it; a shared second language is used if both have
  one. Listening to a language spoken about, and talking in it, practises it (immersion).
- *Signs.* Shops, inns, temples and workshops hang signs: a picture of the trade (a boot, a
  bunch of grapes, a hammer) and its name written in the local script (lang/script.ts), read as
  far as the wanderer reads that script and knows the language.

## Open questions

- The cap for the out-of-doors crowd, once measured in play.
- How fast opinions and reputations drift back to neutral, and how far news of a deed travels.
