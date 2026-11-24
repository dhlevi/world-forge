# Fieldcraft: using skills in the wild

Hunting, trapping, fishing, fire and cooking, and the camp they are done from: the core of living
off the land, built on what exists (combat, the fauna, tracks, snares, butchery, camps and the
needs). Read it with [survival.md](survival.md) (needs, fire and shelter), [npcs.md](npcs.md)
(animals), [combat.md](combat.md) (shooting and fighting beasts), [skills.md](skills.md) and
[navigation.md](navigation.md) (the two maps and camping).

## What exists

- **Footprints** on soft ground, read by Tracking when looked at (`world/senses.ts`).
- **Snares** set with P on the wanderer's own tile, or about a camp (`world/hunting.ts`,
  `game/camping/`), and **butchery** of a carcass with a blade (Survival).
- **Shooting and throwing** at beasts (`rules/ranged.ts`), and fighting them (`rules/combat.ts`).
- **Camps** with a fire, firewood, a shelter and snares (`game/camp.ts`, `screens/camp.ts`), and
  **cooking** a portion over a fire to eat it (C in the inventory).
- **Gathering** sticks and stones about the wanderer (M).

## Decided (23 November 2026)

- **Order:** hunting first, in five stages, each tested and synced before the next.
- **Fishing:** both ways: fishing with a rod or a spear for as long as the player chooses, with a
  catch rolled every quarter hour; and lines or a net set and left, checked later as snares are.
- **Hunting on the travel map:** signs and search. Signs of game found by Tracking appear as icons
  on the travel map as the party goes; a Hunt action spends time searching the country about.
  Clicking a sign goes onto the local map near the trail or the beasts.
- **Skinning** is its own step (Hideworking, with a blade): the hide or fur, its quality by the
  check; a careless skinning spoils it. Butchering (Survival) then gives the meat and the rest.

## The stages

### Stage 1: the skill menu, fire anywhere, roasting

*Walking (24 November 2026, from play):* the walk to a tile goes a step at a time, each shown
(about a ninth of a second apart), and any key or click stops it.

*Built (23 November 2026; `game/fieldcraft.ts`, `field-test.ts`).* The menu offers, as they apply:
Walk here; Light a fire here (Survival), or at a fire-place Light the fire, Build up the fire and
Tend the camp; Roast the raw meat and game you carry (Cooking), at any fire, hearth, oven or
brazier; Gather sticks and stones (Survival); Read the tracks (Tracking); Set a snare here or Take
up the snare (Trapping); and Drink and Wash at water, a well or a fountain. Things that cannot be
done are listed greyed with the reason. A fire takes the firewood and stout sticks carried (0.6 kg
of fuel a stick), and else a quarter of an hour gathering kindling and deadwood about (1 to 4 kg,
more where more grows); it is not laid within four tiles of another fire-place. Roasting takes 20
minutes and 10 more for each piece (at most ten counted): raw meat becomes roast meat and a rabbit
roast rabbit, of fine quality on a fine Cooking check, poor (charred) on a near miss, half lost on
a failure, and all lost on a fumble.

- **The skill menu.** A right-click on the local map opens a menu of what can be done at that
  tile, each with the skill it uses and why not where it cannot be done. Choosing a thing out of
  reach walks there first (on a way found round what is in the way). Later stages add to it.
- **A fire anywhere** (Survival): on open ground out of doors, with flint and steel, and wood from
  the sticks carried or gathered about (none on bare rock, sand or snowfields without sticks). A
  fire is a small camp (`game/camp.ts`): it burns its fuel, warms, cooks and can be built into a
  camp; the camp screen tends it.
- **Roasting** (Cooking): at a fire, raw meat and game are roasted whole, to carry and eat later
  (roast meat and roast rabbit): better than raw, and no fire needed to eat them. A fine check
  roasts it well; a poor one chars it (less food); a fumble burns it.

### Stage 2: tracking and trails, skinning

*Built (23 November 2026; `game/hunt.ts`, `world/senses.ts` `layTrail`, `world/fauna.ts` `pin`,
`worker/fauna.ts` `gameAt`, `world/hunting.ts` `skin`; `hunt-test.ts`).*

- **Trails.** Every wild herd placed on the local map has the trail it left on its way there: 14
  to 40 tiles back from it, grazed or walked over the last hour or few (one to three minutes a
  tile, the newest 10 to 60 minutes old where the beasts are). Prints where the ground takes them;
  on firm ground a faint sign (bent grass, a scuff), not drawn, and read only by a tracker (20 and
  over). Rain washes trails out as it does prints.
- **Following** (the skill menu on a beast's track: Follow the trail): a Tracking check, harder by
  4 a hour of the track's age (at most 30), 10 on firm ground and 15 in the dark, easier by 20 in
  snow, reads the trail ahead 60, 40 or 20 tiles (fine, success, near); the trail read is marked
  with amber diamonds for an hour, and the hunter walks it to the furthest point read, stopping as
  soon as the beasts come in sight (sneaking, as ever, frightens them less).
- **Signs on the travel map.** One step of travel in twenty brings a look about (Tracking, against
  easy plus 5; better in snow, worse in rain or the dark, better where game is plentiful): the
  tracks of one of the region's walking wild beasts (by how many there are), two to six steps
  off, marked with a paw on the map for twelve hours. **Hunt (an hour)** in the travel bar
  searches the country about: two signs on a fine check, one on a success. A sign clicked shows
  what it is and how far; **Go there** plans the way, and within 400 m **Take up the trail** goes
  onto the local map, the beasts placed 26 to 40 tiles off and their trail laid back past the
  hunter, its start marked. Signs are not saved.
- **Skinning** (the inventory on a carcass: Skin, Hideworking, with a blade): the hide or pelt,
  fine, sound or poor by the check, spoilt on a fumble; ten minutes for a small beast, longer for
  a large. Butchering after gives the meat and the rest; butchering unskinned hacks the hide off,
  poor at best.
- **Each beast's own hide** (`actors/items/defs.ts`, `hideId`): every beast that gives one has its
  own item, made from the beasts' list: a pelt for the furred (fox, wolf, bear, lynx, hare, rabbit,
  beaver and the like), a hide for the rest (red deer hide, fox pelt, brown bear pelt). Its weight
  goes by the beast's size (0.1 kg for the tiniest, 0.4 small, 2.5 middling, 7 large, 20 huge);
  its worth is much the same for all (3 to 8 copper by size, and by quality) until the economy
  prices them by supply and demand. The plain "hide" stays for the markets to sell.
- *Fixes from play (24 November 2026):* a herd's trail from where the hunter took it up is laid
  along a way the beasts could walk (round trees and water), not broken off in the woods; taking
  up a trail reads it at once about the hunter (8 tiles, and 4 more for each 10 of Tracking),
  whatever its age (it was lost before when the sign was fresher than its far end); following it
  reads 100, 70 or 35 tiles (fine, success, near), and up to half as far again for a master; and a
  tracker of 25 and over sees the faint signs on firm ground about them (5 tiles, and one more for
  each 10 of Tracking), drawn as pale scuffs.
- *Still to come:* droppings, browse and scrapes as signs of their own.

- **On the local map:** the trail of a beast read by Tracking is marked (its prints, which way,
  how old), and can be followed toward it; fresh signs (droppings, browse, a scrape) as well as
  prints.
- **On the travel map:** signs of game found while travelling or resting (Tracking) appear as
  icons; **Hunt** searches the country about for hours. A sign clicked goes to the local map near
  it, the beasts placed about the trail by their kind.
- **Skinning** (Hideworking) and butchering (Survival) as separate steps; hides and furs of a
  quality, worth more for a good skinning.

### Stage 3: traps

- **Felling** small trees (an axe or a hatchet) and **cutting stakes and poles**.
- **Digging** (a spade or shovel much faster; hands and a stick slowly): a pit, covered for a
  **pitfall** trap on a game trail.
- **Snares** set at a chosen tile from the skill menu (Trapping), and **drive fences** of stakes and
  brush that steer game into them.
- Traps are checked later: what they caught waits in them (and may be taken by a predator).
- *Built ahead (24 November 2026, from play):* each snare set is marked on the local map (a noose
  on its peg, with a red mark when it holds a catch), seen or remembered; and on the travel map
  the snares within 60 m of one another are one site, a noose in a ring at their middle. A site
  clicked says how many and how many have caught; within 400 m **Go to the snares** puts the
  wanderer on the local map among them, and further off the way there is planned
  (`game/hunt.ts`, `trapSites`).

### Stage 4: fishing

- **Fishing** where the water is large enough to hold fish (rivers, lakes, the sea's shore): with a
  rod and line, a spear (or a staff sharpened) in shallow water, for a chosen time, a catch rolled
  each quarter hour (Fishing, by the water, the hour and the season).
- **Lines and nets** set and left, checked later.
- Fish are gutted and roasted as meat is.

### Stage 5: the camp

- **Leaving the camp** without striking it or putting out the fire (the fire burns down untended,
  or is banked to last), to fish, hunt or explore, and coming back.
- **The camp on the travel map:** marked, and gone back to with a click.
- The camp screen reworked about these.

*Proposed numbers in each stage, to tune in play.*
