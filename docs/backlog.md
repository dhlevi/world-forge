# Backlog

Improvements and fixes found in playtesting, sorted by kind and placed in the order they should be
built. Each item says what the game does now, how large the work is, and what it depends on. When
an item is built, it moves to its design document (in [design/](design/)) with the decisions taken,
and its row here is marked **Done**.

Read it with [architecture.md](architecture.md) (where the code for each kind of work goes) and the
design documents named in each row.

**Sizes:** S, an afternoon (a rule changed, a few lines in a few files); M, a day or two (a new
module or screen on existing systems); L, a stage of its own (several modules, a test script, a
design round); XL, several stages (a new system that others build on).

**Status:** *Bug*, the game does not do what it says or should; *Partial*, some of it exists;
*New*, nothing of it exists yet.

## Order of work (decided: bugs first, then quick wins, then larger systems by dependency)

1. **Phase 1, bugs:** what is broken or blocks play.
2. **Phase 2, quick wins:** high value for little work, built on systems that exist.
3. **Phase 3, systems on what exists:** medium work that extends existing systems.
4. **Phase 4, new systems:** large work, in dependency order.
5. **Parked:** waits on a system that does not exist yet (as combat stage 5 does).

### Phase 1: bugs

| ID | Item | Size |
|---|---|---|
| N1 | People who say they step aside do not let the wanderer pass. **Done** (21 November 2026). | S |
| B2 | People crowd buildings until the wanderer cannot move through them (temples, guildhalls). **Done** (21 November 2026). | M |
| W8 | On the travel map, roads appear too late, after the wanderer has walked off them. **Done** (21 November 2026). | S |
| D1 | Dwarven cities (delves) have no people in them. **Done** (21 November 2026). | M |
| W4 | The sea can be drunk from; it should be salt and undrinkable (lakes and rivers stay fresh). **Done** (21 November 2026). | S |

### Phase 2: quick wins

| ID | Item | Size |
|---|---|---|
| W9 | Tracking and Survival let the wanderer avoid a road ambush. **Done** (21 November 2026). | S |
| W10 | The risk of robbers falls farther from the large towns. **Done** (21 November 2026). | S |
| W11 | The weather panel shows an underground view below the land. **Done** (21 November 2026). | S |
| W2 | Snow leaves trails that are very easy to follow. **Done** (21 November 2026). | S |
| C5 | Being dirty, or wearing dirty clothes, makes social checks harder. **Done** (21 November 2026). | S |
| N4 | Beggars, the homeless and brigands in the streets, by the town's figures. **Done** (21 November 2026). | M |
| N3 | Streets feel more alive: more people about, some simply walking. **Done** (21 November 2026). | M |
| N2 | People speak their own language, or one they share with the wanderer. **Done** (21 November 2026). | M |
| T2 | Route choices on the travel map: fastest, direct, keep to roads, cross rivers or not. **Done** (21 November 2026). | M |
| I1 | Arriving in a town or city from the travel map always opens the in-town view. **Done** (22 November 2026). | S |
| I2 | On arrival, a short account of the town: its people, how it fares, what is going on. **Done** (22 November 2026). | M |
| I3 | A clearer marker for the party on the town's plan. **Done** (22 November 2026). | S |
| I4 | Going to a place walks the marker there as the clock runs, instead of jumping. **Done** (22 November 2026). | M |

### Now: fieldcraft (decided 23 November 2026, ahead of the rest of Phase 3)

The core of living off the land, before more flavour: see [design/fieldcraft.md](design/fieldcraft.md).

| ID | Item | Size |
|---|---|---|
| F1 | The skill menu (right-click on the local map), a fire anywhere, roasting meat. **Done** (23 November 2026). | M |
| F2 | Tracking and trails on both maps, Hunt on the travel map; skinning (Hideworking). **Done** (23 November 2026). | L |
| F3 | Traps: felling saplings, stakes, digging and pitfalls, snares anywhere, drive fences. | L |
| F4 | Fishing: with a rod or a spear for a time, and lines or nets set and left. | M |
| F5 | The camp: leave it lit, mark it on the travel map, go back to it. | M |

### Phase 3: systems on what exists

| ID | Item | Size |
|---|---|---|
| W1 | Rain leaves puddles and mud in places, which dry in the sun or freeze to ice. **Done** (22 November 2026). | L |
| W3 | Rivers and lakes freeze over. **Done** (22 November 2026). | M |
| T3 | Deep rivers need a raft, a swim or a bridge; routes avoid them where they can. **Done** (22 November 2026). | M |
| C4 | Clothes get dirty and stained; they can be washed, but stains lower their value for good. **Done** (22 November 2026). | M |
| C3 | Clothes tailored to fit give bonuses (to armour, to charm, and to the skills it makes sense for). | M |
| C8 | Lost limbs replaced: peg legs and hook hands. | M |
| B3 | Signs on workshops and inns, in the local language, read if the wanderer can read it. | M |
| W12 | Hospitals in towns and cities (the atlas and the game). | M |
| B1 | Better layouts for the inside of houses: some are cramped and hard to move through. | L |
| C1 | Starting scenarios. | L |
| I5 | A place's scene in a central panel with a picture (as in Darklands), closed to return to the plan. | M |
| I6 | The town's plan drawn as the atlas draws it, with the name on a banner and its outline. | M |
| I7 | Walking about a town can meet with events: robbers at night, and the like. | M |
| I8 | On foot, a building with things to do offers them: by speaking to its keeper, or a dismissible prompt on entering. | M |

### Phase 4: new systems, in dependency order

| ID | Item | Size | Depends on |
|---|---|---|---|
| D2 | Dwarven cities in full, a fortress at work (as in Dwarf Fortress), with districts. | XL | D1 |
| B4 | Notice boards in the squares: quests, and gossip and nonsense, in the local language. | L | N2, quests |
| T1 | Travel events: random encounters, caravans, lost travellers, quests on the road. | L | quests (in part) |
| L1 | Caves, towers and groves have residents, and their treasure. | L | monsters |
| L3 | Abandoned crypts and ruins, cursed and haunted by the undead. | L | L1, undead |
| R1 | Mushroom forests, ash lands, canyons and the like on the local map. | L | |
| R2 | Cursed regions. | L | R1 |
| C6 | Attraction: who finds whom attractive, and what it changes. | M | |
| C7 | Further attractions: scars, particular features, kinds of clothes. | S | C6 |
| N5 | A seedier side, behind a world option: brothels and gambling. | M | N4 |

### Parked

| ID | Item | Waits on |
|---|---|---|
| L2 | New residents move into cleared lairs (bandits where it is poor, deserters near wars, beasts and monsters in the wilds). | the economy (economy.md), L1 |
| R3 | The underworld: caverns, their plants and their creatures. | the underworld made playable |
| C2 | Underworld peoples in character creation (filtered as the Old and New Worlds are). | R3 |

## The items in full

### Weather and the world

**W1. Puddles, mud and ice.** *Done (22 November 2026):* see survival.md, The ground. Worked out
from the place and the weather rather than stored, so nothing is saved. *Was partial:* The weather already keeps mud and snow cover for the
whole local map, and mud and snow slow walking (`game/weather.ts`, `game/session.ts`). What is
missing is ground that changes in places: puddles where rain gathers in hollows and on paths,
drying in the sun, freezing to ice in the cold (ice is slippery: Acrobatics checks, falls). Mud
and ice tiles exist (core `local/tiles.ts`); puddles need a tile or decoration of their own. *Work:* a small store of
changed ground per chunk, kept by the weather over time and drawn over the baseline. *Phase 3, L.*
See survival.md (weather) and navigation.md.

**W2. Snow trails.** *Partial.* Snow already slows walking by its depth. Tracks are kept and read
(`world/senses.ts`); in snow they should be plain to anyone (a large bonus to read, long-lasting
until fresh snow falls). *Phase 2, S.* **Done** (21 November 2026): see npcs.md, Tracks.

**W3. Frozen waterways.** *Done (22 November 2026):* see survival.md, Frozen water. Holes broken
in the ice are not saved, and people and beasts do not yet walk on the ice. *Was new:* In a hard frost, still and slow water freezes: shallow first, then
deep, over days. Ice can be walked on (thin ice may break: a fall into freezing water); it thaws.
Uses the weather's temperature history. Pairs with W1. *Phase 3, M.*

**W4. Fresh and salt water.** *Bug.* Drinking takes any water tile, and the sea is drinkable. The
sea should be salt (drinking it makes thirst worse); lakes and rivers are fresh. The worker knows
which water is sea (the world's land and lake grids); a chunk needs to say which of its water tiles
are sea. *Phase 1, S.* **Done** (21 November 2026): see survival.md, Food and drink.

**W8. Roads appear too late on the travel map.** *Bug.* The travel map reveals what lies within
sight of each step (`game/travel.ts`, `game/discovery.ts`), so a road only shows once the party is
on it, and a route can leave it before it is seen. Roads and tracks within sight should show at
once, and the way ahead along the road the party is on should show further. *Phase 1, S.*
**Done** (21 November 2026): see navigation.md, What the travel map looks like.

**W9. Skills against ambushes.** *New.* Road ambushes are rolled by the danger of the ground alone
(`game/justice.ts`). Tracking (signs of the band) and Survival (choosing the way) should give a
chance to see them first: the journey stops with a warning, and the wanderer can go round, wait,
or go on. *Phase 2, S.* See combat.md, stage 4. **Done** (21 November 2026): seen first, the
journey stops short and the band is gone round.

**W10. Fewer robbers far from the towns.** *Partial.* A band cell's danger rises with the nearest
town's lawlessness and near roads, but deep in the wilds it is still four fifths of the usual
(`worker/bandits.ts`). Robbers live off travellers, so their numbers should fall with distance from
the large towns and their roads. *Phase 2, S.* **Done** (21 November 2026): see navigation.md, Events on the road.

**W11. An underground view in the weather panel.** *New.* The panel shows the sky outdoors and an
indoor view indoors; below the land (cellars, caves, delves) it should show the rock: no sky, the
light of what the wanderer carries, the cold or warmth of the deep. *Phase 2, S.* **Done** (21
November 2026).

**W12. Hospitals.** *New.* No town or city has a hospital; physicians exist among the residents.
Large towns and cities should have one (a hospital, an infirmary, or a temple's house of healing,
by the culture), in the atlas's plans and inside in the game, where wounds can be treated for a
fee and the sick can rest. *Phase 3, M.* Core towns and interiors.

### Dwarven cities

**D1. Delves have no people.** *Bug.* A dwarven city is a gate on the surface and halls dug below
(core `towns/manager.ts`, `local/chunk.ts`). Residents are placed only in the plans' buildings
(`worker/people.ts`), and the halls below are not buildings, so nobody lives or works there. The
halls need households and workplaces as the buildings have: smiths at the forges, miners in the
workings, people walking the halls. *Phase 1, M.* **Done** (21 November 2026): see npcs.md,
Dwarven delves.

**D2. A fortress at work.** *New.* Entering a delve should feel like a fortress in Dwarf Fortress:
everyone at their work. The halls need districts: a hospital, a tavern, underground farms (mushroom
fields), more housing and workshops, a market, cisterns and pump stations, and in the largest a
magma forge. This is a round of design (layouts, districts, how the halls are generated) and of
work in the core's generator and the game. *Phase 4, XL.* Depends on D1.

### Character and creation

**C1. Starting scenarios.** *New.* A choice at creation of how the game begins: none, fisherman,
huntsman, monster hunter, explorer, a kidnapped family member, robbed and wounded, lost in the
woods, shipwrecked. Each sets the place, the gear, the wanderer's state and a first aim. The ones
with a quest need the quest system; the rest can come first. *Phase 3, L.* See creation.md and
quests.md.

**C2. Underworld peoples.** *Parked* until the underworld is playable (R3). They are filtered at
creation as the Old and New Worlds' peoples are.

**C3. Tailored clothes.** *New.* Clothes fitted by a tailor to the wearer: better armour where
worn, a better impression (charm, and the social skills), and less hindrance to the skills it
matters for (Acrobatics, Sneak). Badly fitting clothes the opposite. *Phase 3, M.*

**C4. Dirty and stained clothes.** *Done (22 November 2026):* see characters.md, Keeping clean.
The residents' clothes are always clean for now. *Was new:* The wanderer gets dirty (`actors/needs.ts`); clothes do
not. Clothes should take dirt and blood from what the wanderer does, be washed (with soap, at
water), and keep stains that lower their worth for good. Dirty clothes sell for less. *Phase 3, M.*

**C5. Dirt and social checks.** *New.* Being dirty or wearing dirty clothes should make the social
skills harder (more so among the rich, less among labourers and in the wilds). The dirt is already
measured. *Phase 2, S.* **Done** (21 November 2026): dirt, blood and an unkempt head already
made social checks harder (actors/checks.ts); now filth and blood also sour a first impression in
talk, the well-to-do most. Dirty clothes wait on C4.

**C6. Attraction.** *New.* Each person is drawn more or less to each sex and body type. Those who
find the wanderer attractive are easier to persuade and like them sooner; the wanderer attracted to
someone is easier to persuade by them. A design round first (what is shown to the player, how it
stays tasteful and optional). *Phase 4, M.*

**C7. Further attractions.** *New.* Scars, particular features, kinds of clothes. *Phase 4, S.*
Depends on C6.

**C8. Peg legs and hook hands.** *Partial.* Parts are lost for good (`actors/health.ts`), and
the loss hobbles walking or handling. A peg leg or a hook, made or bought, should give back part of
what was lost. Losing a limb outright (a severed leg, not only a foot or hand) may need a check of
the body plan. *Phase 3, M.*

### People

**N1. Stepping aside.** *Bug.* Walking into someone who is standing still makes them step aside
("Ana steps aside."), and the wanderer does not move with the bump. By the wanderer's next step
the person has most likely walked back to the spot their day has them at, so the way is blocked
again. Someone who has stepped aside should keep out of the way until the
wanderer has passed (or for a few seconds). *Phase 1, S.* `world/population.ts`. **Done** (21
November 2026): see npcs.md, Talking and dealing.

**N2. Languages.** *Partial.* The wanderer's languages, spoken and read, are kept
(`actors/components/skills.ts`), and each people has its language (core `lang/`). People should
speak their own language, or one they share with the wanderer; what is not understood shows as
the language's words, and what is half understood, in part. *Phase 2, M.* See characters.md.
**Done** (21 November 2026): see characters.md, Languages.

**N3. Livelier streets.** *Partial.* People keep their day's plan, and many days keep them indoors.
More should be out (errands, visits, idling in the square), and some should simply walk about the
town. *Phase 2, M.* See npcs.md. **Done** (21 November 2026): passers-by; see npcs.md, People
of the streets.

**N4. Beggars, the homeless and brigands.** *Partial.* Beggars exist as a kind of resident. Their
numbers, the homeless sleeping rough, and brigands in the streets by night should follow the town's
poverty and crime (core `people/town.ts`). *Phase 2, M.* **Done** (21 November 2026), with
cutpurses by day: see npcs.md, People of the streets.

**N5. A seedier side.** *New.* Behind a world-creation option: brothels and gambling dens by the
town's crime and trade, with what goes on there kept off-screen and in good taste. *Phase 4, M.*
Depends on N4.

### Buildings

**B1. House layouts.** *Partial.* Some interiors are cramped and hard to move through. They need
better layout templates (wider ways between rooms, furniture kept off the ways through), and a
check that every room can be reached with the furniture in it. *Phase 3, L.* Core `interiors/`.

**B2. Crowded buildings.** *Bug.* People fill temples, guildhalls and the like until the wanderer
cannot move. Places in a building should be limited by its size; people should keep clear of doors
and the ways through; the wanderer should be able to squeeze past (as the watch now can).
*Phase 1, M.* **Done** (21 November 2026): see npcs.md, Talking and dealing.

**B3. Signs.** *New.* Workshops, inns and shops show a sign in the local language; it is read and
translated if the wanderer can read that language. *Phase 3, M.* Depends on the languages being
shown in the world (N2 helps).

**B4. Notice boards.** *New.* In the squares: work offered, quests, gossip and nonsense, in the
local language. *Phase 4, L.* Depends on N2 and the quest system (quests.md).

### Caves, towers and groves

**L1. Residents and treasure.** *Partial.* The atlas describes each lair's creatures, hazards and
treasure (core `lairs/`), but none of it is placed in the game. The creatures should be there, and
the treasure. *Phase 4, L.* Needs monsters to fight (beasts exist; monsters and their bodies do
not).

**L2. New residents.** *Parked.* Once a lair is abandoned or cleared, others may move in: bandits
where it is poor, deserters near a war, beasts and monsters in the wilds. Tied to the economy.

**L3. Crypts and ruins.** *New.* Abandoned crypts and ruins, cursed and haunted by the undead.
*Phase 4, L.* Depends on L1 and on undead (bodies, how they fight).

### Regions

**R1. Special ground on the local map.** *Partial.* The world already has ash lands, lava,
glaciers, mushroom forests and canyons (core `gen/special.ts`), shown in the atlas, but the local
map draws ordinary biomes there. Each needs its ground, plants and objects, and what lives there.
*Phase 4, L.*

**R2. Cursed regions.** *Partial.* The atlas has cursed woods among its groves. Cursed regions need
a design: what the curse does to the land, its creatures and those who enter. *Phase 4, L.*
Depends on R1.

**R3. The underworld.** *Parked.* The world generator makes an underworld with its peoples (core
`gen/underworld.ts`, `gen/deep-peoples.ts`); making it playable (complex caverns, their plants and
creatures, the ways down) is a system of its own.

### Travel

**T1. Travel events.** *Partial.* Journeys have weather, fords, steep ground and now robbers. They
need random encounters and events: caravans, lost travellers, pilgrims, patrols, and quests found
on the road. *Phase 4, L.* The ones that give quests depend on quests.md.

**T2. Route choices.** *New.* The route is the fastest by the travel grid. The player should choose:
fastest, most direct, keep to roads, and whether to cross rivers. *Phase 2, M.*
`game/travel.ts` and the worker's route. **Done** (21 November 2026): see navigation.md, Events on
the road.

**T3. Deep rivers.** *Done (22 November 2026), on the travel map:* see navigation.md, Deep rivers.
On the local map, deep water is swum as before (harder with a load). *Was partial:* Fords take an Athletics check and can soak or sweep the wanderer.
Large and deep rivers should need a raft or a swim (with what that means for what is carried), so
routes avoid them where they can and seek bridges (which the plans have on roads). *Phase 3, M.*
Pairs with T2.

### The in-town view

The in-town view (`screens/city.ts`, `screens/views/CityView.vue`; navigation.md, Cities and
towns) shows a town or city as its illustrated plan, with its places of note in a list on the
right. Choosing a place and going there passes the time the walk takes and opens that place's
short menu of things to do in the same right-hand panel; the wanderer can walk in on the local map
anywhere, or leave by a gate. The on-foot view stays as it is: the player can always walk in.

**I1. Opening on arrival.** *Done (22 November 2026):* a journey that ends anywhere inside a
town or city opens its view, and so does a new game begun in one. *Was partial:* The view opens when a journey on the travel map ends at a
town or city (at its gate). It does not open when a journey ends elsewhere inside a town, nor when
a game begins in one. Any arrival from the travel map inside a town or city should open it. Walking
in on foot from the local map stays on foot. *Phase 2, S.* `game/session.ts` (`onArrive`).

**I2. A word on arrival.** *Done (22 November 2026):* `townAccount` in `worker/sites.ts`, with the
wanderer's standing from the law's record, shown over the plan until put aside. *Was new:* A short, dismissible account when the view opens: what the town
is and who lives there (its peoples, its trades, its rule), how it fares (prosperous or poor, safe
or lawless, clean or foul), and anything plainly going on (a war, the wanderer wanted there, its
regard for them). The figures exist (core `people/town.ts`, `people/town-context.ts`; the law's
record); festivals, plague and other events come later with their systems. *Phase 2, M.*

**I3. The party's marker.** *Done (22 November 2026):* a pennant over a gold token, drawn last.
*Was partial:* The party's place on the plan should be plain at any zoom: a
token (the wanderer's portrait or a banner) with a ring, drawn above the plan's labels.
*Phase 2, S.*

**I4. Walking the plan.** *Done (22 November 2026), in a straight line:* `screens/stroll.ts`, at
Slow, Steady or Brisk, to be stopped, hurried or turned aside. Following the plan's streets is
left for later. *Was partial:* Going to a place now passes the walk's minutes at once and the
marker jumps there. The marker should walk the streets to it, step by step, as the game's clock
runs (at a pace that can be hurried, as the travel map's), and the walk can be stopped on the way.
*Phase 2, M.* The way through the streets can follow the plan's streets (the plan knows them).

**I5. Scenes in the middle.** *New.* A place's scene (its description, what it offers, its people)
in a panel in the middle of the screen with a picture above it, as in Darklands, closed to return
to the plan; the right-hand panel keeps the list of places. Pictures by the kind of place (an inn,
a smithy, a temple, a market), drawn as placeholders until painted, in the tileset's manner.
*Phase 3, M.*

**I6. The plan as the atlas draws it.** *Partial.* The plan is the core's illustrated plan. It
should match the atlas's town map: the town's name on a banner, its outline and walls, the quarters
named, and the same palette. *Phase 3, M.* Core `towns/illustrate.ts`; the atlas's town view.

**I7. Events in the streets.** *New.* Walking the plan (I4) can meet with what the on-foot streets
hold: cutpurses in the crowds by day, brigands after dark in a lawless town, the watch who know a
wanted face, a brawl spilling out of a tavern. Met, the view goes to the local map with the
wanderer set down where the marker stands, as a road ambush does. *Phase 3, M.* Depends on I4; uses
`worker/streets.ts`, `world/strife.ts` and `game/justice.ts`.

**I8. A building's offers on foot.** *New.* On the local map, the things a place offers (an inn's
room and meals, a shop's goods, a temple's healing, lessons) are reached only from the in-town view.
Entering such a building on foot should offer them: by speaking to its keeper (who says what is on
offer), or a dismissible prompt on stepping in (which can be turned off). The same scenes as the
in-town view (I5). *Phase 3, M.* Depends on I5.

