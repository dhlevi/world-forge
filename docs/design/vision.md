# Wanderer: design vision

The reference for what the game is meant to be. Every later design document (characters, the
quest generator, the economy, management) should be checked against it, and it should change
when a decision changes it. Sections marked **To define** are deliberately left open.

## In one paragraph

A life in a living, generated world. You are one person in a realm with a history, faiths,
feuds, trades and monsters already in it, and you may live that life however you like: wander and
explore, hunt and trap, farm a plot, keep a workshop, sing for coins in a tavern, take contracts
on the things that haunt the roads, trade, serve a lord or become one. The world is grounded and
often cruel, but there is warmth in it: a fire, a harvest, a festival, a friend. Stories are not
written in advance; they come out of the world's people and their troubles, and what you do to
them stays done.

## Pillars

1. **The world is real.** The world exists before you and goes on without you. Its places,
   peoples, histories, faiths, prices and dangers come from the generator and the simulation,
   not from a script. Things have reasons, and the reasons can be found out.
2. **Live any life.** No path is the main one. Adventuring, crafting, farming, performing,
   trading, scholarship, crime and rule are each a whole way to play, with their own skills,
   rhythms and rewards, and they can be mixed.
3. **Survival with weight.** Hunger, cold, wounds, illness, fatigue, money and the seasons
   matter. Preparation pays; carelessness costs. Death is possible and is not cheap.
4. **Stories that emerge.** Quests arise from what people in the world want, fear and owe
   (the quest generator). They are found by talking and listening, can be solved in more than one
   way or ignored, and leave consequences behind.
5. **Cozy and grim.** Daily life can be gentle and satisfying; the world around it is dark,
   morally grey and dangerous. The contrast is the point: the warmth means more because of the
   cold.
6. **Low magic, felt rather than seen.** Belief, folk remedies, saints and curses shape lives;
   true magic is rare, costly, uncertain and frightening.

## Inspirations

What each game brings, and what to leave behind.

| Game | What we take | What we leave |
|---|---|---|
| **Darklands** | A realistic medieval world where the uncanny is real but rare and grounded in belief (saints, alchemy, folklore). Skills, not classes; characters who age. Reputation and local trouble feeding adventures. A travel map between places, with events on the road. | Fixed party creation as the only way in; menu-driven town life. |
| **UnReal World** | Survival as the game: cold, hunger, hunting, trapping, fishing, shelter, crafting from real materials, the seasons. One-second turns and actions that take real time. Skills that grow by doing. Quiet, unforgiving wilderness. A tile is a stride. | Opaque interface; long stretches with little to read. |
| **Tales of Maj'Eyal (ToME)** | Clear, readable turn-based tactics; a fast keyboard flow; an interface that explains itself (tooltips, look mode, logs). | Power-fantasy escalation and dense ability lists. |
| **Caves of Qud** | A generated history that the player uncovers. Factions with opinions of you. Rich, strange text for everything. Bodies and equipment as systems, not hit points alone. Water ritual style relationships with places and peoples. | The science-fantasy weirdness; our strangeness is folkloric and rare. |
| **Dwarf Fortress** | World generation with legends, sites and people that persist; everything simulated and able to interact. Adventure mode: one person in a world that does not revolve around them. | Unreadable complexity; simulation for its own sake where it gives no stories. |
| **RimWorld** | A storyteller that paces events (quiet stretches, then trouble). Needs, moods and relationships of people. Running a household or settlement of people with minds of their own. | Raids on a timer; colony survival as the only frame. |
| **Stardew Valley** | The rhythm of days and seasons; farming, foraging and fishing as calm loops; festivals; friendships that grow by small gestures; a home that improves. Being able to just live a quiet day. | Content that never changes; a world that waits for you. |
| **Pathfinder: Kingmaker and Wrath (Owlcat)** | Becoming a ruler: a realm to manage, advisers, projects and crises. Companions with their own stories and opinions. Choices that echo across a long game. | Rules-heavy tabletop combat; class and level systems. |
| **The Witcher** | Contracts on monsters that are investigations first (clues, folklore, preparation, the right remedy). Moral greyness: no clean answers, monsters that are sometimes people. Mature themes treated seriously. Superstition and prejudice. | A fixed hero and a fixed main plot. |
| **Kingdom Come: Deliverance** | Realism without fantasy: clothing in layers, literacy, learning by practice, food that spoils, law, crime and witnesses, reputation by town. A world that judges you by how you look and act. Alchemy and crafting as hands-on processes. | Save restrictions that punish rather than add tension. |

## Tone

- **The everyday is warm.** A good meal, a mended roof, a crowded tavern, a song that goes
  well, the first snow. These moments are written and rewarded with care.
- **The world is not.** War, plague, famine, cruelty, superstition, poverty and the abuse of
  power are present and have causes in the generated world (its wars, faiths, lords and prisons).
- **Mature, not gratuitous.** Mature themes are handled with consequence and restraint: the
  aftermath matters more than the spectacle. Violence hurts and lingers; choices about it carry
  weight.
- **Morally grey.** Most troubles have more than one side. The monster may be a cursed
  neighbour; the bandits may be starving tenants; the lord may be right for the wrong reasons.
- **Written flavour everywhere.** Like Qud and Darklands, things are described in words: places,
  people, items, rumours, weather. The generator already writes much of this (lore, faiths,
  curses, bestiary, flora, appearance, households); the game should keep that voice.

## Freedom: ways to live

Each way of life should be playable from start to finish on its own, and should touch the others.

| Way of life | Loop | Needs from the game |
|---|---|---|
| Wanderer and explorer | Travel, discover places and their stories, survive the road | Travel map and local map, weather, camping, maps and directions, lore discovery |
| Hunter, trapper, forager | Track, hunt, trap, fish, gather; process and sell or keep | Animals with behaviour, tracks, butchering and hides, seasons, spoilage |
| Farmer and homesteader | Clear, build, plant, tend, harvest, store, raise animals | Land ownership or tenancy, building, crops by climate and season, livestock |
| Craftsman | Gather or buy materials, make things, improve, sell | Materials and recipes, tools and workshops, quality, guilds |
| Merchant | Buy cheap, carry, sell dear; run a stall or shop | Prices by place and season, trade goods, carrying, tolls, risk on the road |
| Performer | Busk in squares, sing in taverns, earn a name | Performance as a skill and a scene, audiences that react, reputation |
| Monster hunter and mercenary | Take contracts and bounties, investigate, prepare, fight | Quest generator, bestiary and curses, investigation, tactical combat, wounds |
| Scholar, healer, cleric | Read, write, heal, preach, study folklore and the old world | Literacy, books, remedies and medicine, faiths and their rites |
| Outlaw | Steal, poach, smuggle, rob | Law, witnesses, guards, fences, reputation by town and realm |
| Lord, guildmaster, founder | Own, employ, rule, build a settlement | Management layer (below) |

## Management (later)

Growing from one person's life into running something, as in RimWorld and the Owlcat games:

- **Property:** a house, a farm, a workshop, a shop; rent, upkeep, theft.
- **Business:** owning or running a shop, tavern or workshop; hiring people; stock and prices.
- **A household or band:** companions and employees with needs, opinions and their own stories.
- **A settlement:** founding one on the generated map, attracting settlers, building, defending.
- **Lordship:** holding land in a realm (the generator's baronies to empires): taxes, justice,
  obligations to a liege, rivals, war.

## Magic

**Low magic, with true magic rare and hard.** The generator already gives the world faiths with
saints, rites and holy places, folk curses with signs and remedies, a bestiary and herbal flora.

- **Belief is everywhere; proof is rare.** Most "magic" people meet is faith, folk practice,
  herb lore and superstition, which may or may not work and which people act on regardless.
- **The uncanny is real but uncommon:** curses, haunted places, a few true monsters, relics.
- **True magic is crafted, not listed:** a mage learns elements, effects, components and ways of
  casting and builds their own spells in eight schools, writes them in spell books, and enchants
  objects. It takes a sharp mind, long training and a teacher, costs the caster heavily in body or
  mind, and can go badly wrong; faiths and cultures embrace it, fear one kind of it, or fear it
  all. Detailed in [magic.md](magic.md).

## Characters

Detailed in [characters.md](characters.md). In short:

- Not a D&D style system: no classes, no character levels and **no hit points**.
- **Traits** in three groups (mental: Intelligence, Wisdom, Willpower; physical: Strength,
  Constitution, Agility; personality: Charm, Gravitas, Aura) on a scale of 1 to 20, and Luck,
  a self-balancing gauge; **senses** (eyesight,
  hearing, smell, taste, touch); height and weight; race, culture and gender.
- **A body of parts** with typed wounds, bleeding and treatment, as in RimWorld and UnReal World.
- **Two-bar pools** (a day pool feeding a burst pool) for physical and mental stamina; hunger,
  thirst and sleep that recover only with regular care; addiction and disease as in RimWorld.
- **Skills that grow by use**, capped by traits (the list: [skills.md](skills.md)); **languages** learnt by exposure, limited by
  Intelligence; a realistic inventory of weight and bulk, where mounts and caravans matter.

## Stories: the quest generator

Detailed in [quests.md](quests.md): quests built in five levels (Task, Job, Chapter, Story,
Epic), from premises in the world's state, made a step at a time and partly hidden, with Big Bads
that change the world and rivals who may beat the player to them. The principles:

- **Quests come from the world.** Every quest has a source in the simulation or the generated
  lore: a curse on a village, a feud between houses, a debt, a missing person, a war's
  aftermath, a monster's lair, a festival that needs a singer, a harvest that needs hands.
- **People, not quest boards.** Quests are found by talking, overhearing and reading notices;
  rumours travel and change on the way (the generator's curse rumours are an early example).
- **Investigation before action**, as in Witcher contracts: clues, folklore, preparation.
- **More than one way through**, including walking away; and **consequences that persist**
  in the world (reputation, relationships, places changed).
- **Pacing by a storyteller**, as in RimWorld: quiet stretches and troubles in turn, scaled
  to what the player is doing with their life.
- **Small and large:** most quests are local and personal; a few grow into long arcs.

## The world and its scales

- **The generator is the foundation.** Everything it makes is the baseline: terrain, climate,
  biomes, rivers, realms, cultures and languages, faiths, history and wars, towns and their
  buildings, residents and households, nature, curses, dungeons and lairs. The game simulates
  forward from it; the player's changes are kept apart and laid over it.
- **Local map:** 1.5 m tiles, one-second scale turns, chunks made on demand (built in Phase 2).
- **Travel map:** fast travel on a world map, one step per chunk, with events, hunting and
  tracking, camping, and a zoom into the local map at any time; travel runs on its own until it
  is stopped; caravans and sea voyages on the same map; large cities through a city view with
  Darklands-style menus. Detailed in [navigation.md](navigation.md).
- **Time:** days, seasons and years matter (crops, weather, festivals, prices, ageing).
- **Survival:** weather built on the generator's climate and moving along its winds, day length
  by latitude and season, body heat, clothing against wet, cold and heat, room temperatures as in
  RimWorld, shelters, cleanliness, food and water. Detailed in [survival.md](survival.md).
- **Economy:** markets in every settlement with stock, supply, demand and prices, built on the
  generator's goods, production, trade partners and coins; a condition per market that war,
  plague and famine push down; trade routes set by politics; coins named by culture, changed
  between realms. Detailed in [economy.md](economy.md).
- **Hardcore realism:** a game option that hides everything a person could not know (trait,
  skill and stat numbers, damage, chances to hit, dice rolls, survival gauges) and describes it
  instead ([survival.md](survival.md#showing-it-numbers-or-hardcore-realism)).

## What already exists to build on

| Generator system (`packages/core`) | Feeds |
|---|---|
| Terrain, climate, biomes, rivers (`gen/`) | Travel, survival, farming, weather, foraging |
| Towns, villages and building interiors (`towns/`, `interiors/`) | Local map, homes, shops, taverns, property |
| Residents and households (`people/`) | NPCs, schedules, relationships, employers, quest givers |
| Realms, history, wars, houses (`lore/`, `gen/politics.ts`) | Law, lords, factions, management, quest sources |
| Faiths, saints, scripture (`lore/faiths.ts`) | Belief, rites, healing, clergy life, low magic |
| Cultures and languages (`names/`, `lang/`) | Names, dialogue flavour, literacy, prejudice |
| Bestiary, flora, curses (`nature/`) | Hunting, foraging, remedies, monster contracts |
| Dungeons, lairs, the Underworld (`dungeons/`, `lairs/`) | Exploration, contracts, treasure |
| Organisations (`lore/orders.ts`) | Guilds, orders, factions to join |
| Local map and tiles (`local/`) | Play space for everything above |

## Not the goal

- A fixed main plot or chosen-one hero.
- High fantasy spectacle, magic schools or power fantasy escalation.
- Grind as padding; numbers growing for their own sake.
- Simulation detail that never produces a decision or a story.

## Open questions

- The character details still open (see [characters.md](characters.md#open-questions)).
- Who can practise magic, and how the world regards mages (see [magic.md](magic.md#open-questions)).
- Permadeath, or saves with consequences (Kingdom Come's approach, or free saving).
- The travel map's look and the city view (see [navigation.md](navigation.md#open-questions)).
- Companions: how many, how controlled.
- How the world simulates beyond the player's surroundings (detail near, summary far).
- Combat: tactical turn-based on the local map (ToME, UnReal World), with how much detail
  (wounds by body part, armour layers, stances).
