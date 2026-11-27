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

*Work takes its time (27 November 2026, from play):* everything done from the skill menu that
takes time (fishing, felling, digging, covering, fencing, gutting, roasting, gathering kindling
and the rest) passes it a minute at a time, the world going on about the wanderer and shown
(about a thirtieth of a second a minute), with a banner saying what is being done and a Stop
button; any key or click stops it as well. Stopped part way, nothing is done (time spent is
spent); felling a tree, digging a pit and filling one in are kept where they were left, and taken
up again from there. Danger stops work at once: a beast fighting, or one that could hurt the
wanderer (a predator of middling size or more, or an aggressive beast) seen within ten tiles; a
person fighting them; bad bleeding or falling senseless; or weariness, cold, thirst or hunger past
bearing. The camp screen's tasks and the night are worked out from their menus, as before.

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

*Decided (25 November 2026):* any tree can be felled, slower by its size; a covered pit takes game
and people alike (a man-trap where people walk is a crime); frightened game is herded along drive
fences into the trap in their gap; and a catch left waiting may be taken by a predator, by the
hour.

*Built (25 November 2026; woodcraft in `world/woodcraft.ts` and `game/woodcraft.ts`, being of use
beyond traps; pits and fences in `world/traps.ts` and `game/trapping.ts`; `trap-test.ts`).* All
from the skill menu; the numbers are proposed, to tune in play.

- **Felling** (Survival, with an axe, or a hatchet half as slow again): any tree standing on one
  tile, in 8 minutes and 2.5 more for each metre of its height (half for a young tree, more for an
  old one); the great old trees whose trunks are two tiles across cannot be felled. It leaves a
  stump (walked over), and gives a pole for a young tree, two for a grown one (three for the
  straight conifers and birches), stout sticks, and firewood by its size; what cannot be carried is
  left at the wanderer's feet. A fumble catches the wanderer a blow.
- **Stakes** are cut with any blade: four from a pole (a quarter of an hour each), one from a stout
  stick (five minutes).
- **Digging a pit** (Athletics) on soft ground, not on rock, stone, roads, sand or wet ground: two
  hours with a shovel, two and a half with a spade, seven with a stout stick and bare hands, more or
  less by the check. Four stakes **spike** it; a pole or two stout sticks **cover** it (Trapping):
  the check sets how hard the pitfall is to see. It can be uncovered, cleared after it is sprung,
  or filled in.
- **The pitfall.** A beast of middling size or larger (a roe deer, a boar, a wolf, a red deer, a
  bear) that steps on a covered pit falls in: hurt by the fall, and by a stake or two if spiked,
  and held there until it is killed; its herd takes fright. Out of sight, each hour, a covered pit
  in the range of such a herd catches one (3 in a hundred, more with Trapping and a better cover);
  a beast left two days in a pit is found dead. What lies in a sprung pit is lifted out from the
  menu. The wanderer knows their own pitfalls and steps round them.
- **People and pitfalls.** A person walking onto a covered pit may see it in time (hunters,
  trappers and foresters far more often), and drags the cover off; the rest fall in, are hurt, and
  sit a while before they climb out. Where people walk (a settlement, or within a few tiles of a
  road), a pitfall known to be the wanderer's (someone saw it dug or covered, or the wanderer is in
  sight) is an assault in law, and the victim thinks much the worse of the wanderer.
- **Drive fences** (Trapping): a length of stakes (three stakes, twenty minutes) or of brush
  between stakes (one stake and two stout sticks or an armful of firewood, or brush cut about with a
  blade), each blocking the way as a wall does; pulled up, the stakes are kept. A frightened beast
  with a fence within three tiles runs along it toward a trap that lies away from what frightened
  it (a covered pit for the middling and larger, a snare for the small), rather than straight
  away. Out of sight, each length of fence within eight tiles of a trap raises its chance by a
  sixth, to three times at most.
- **Predators.** A catch waiting out of sight in a snare or a pit may be taken each hour (6 in a
  hundred for a snare with a predator about, 2 without; 5 and 1.5 for a pit), and coming to the
  trap tells of it, with the predator's tracks.
- **Snares** now go by Trapping (or three fifths of Survival, if that is better).
- **Bait** (decided and built 26 November 2026; `world/traps.ts`): a portion of food laid in a
  snare or a pit (from the skill menu). Meat, fish and cheese draw the hunters, scavengers and
  omnivores; apples, berries, nuts, greens, roots and bread draw the grazers, browsers,
  seed-eaters and omnivores. In sight, a wild beast the bait draws, within half again its sense
  of smell (and at most 30 tiles), goes to it: into the snare or onto the pit's cover, where it is
  caught if the trap suits it. One the trap does not hold (a fox at a snare, a hare on a pit's
  cover) eats the bait and goes; one it holds may still take the bait and get away, the warier
  more often and the better the trapper less (a fifth, a third for the wary or skittish, less a
  quarter of Trapping, at least one in twenty). Out of sight, bait doubles the trap's chance an
  hour for the beasts it draws and reaches ten tiles further for them, and is taken without a
  catch three times in a hundred an hour. Meat goes off and stops drawing after three days, plant
  food after five. A baited snare shows a brown mark in its noose; coming to a trap whose bait was
  taken says so, with the thief's tracks if it left any. Fish join the baits with stage 4.
- **New things:** the hatchet, the spade and the shovel (sold by smiths and in markets), sharpened
  stakes and poles; and on the map the stump, the dug, covered and sprung pit, and the two fences
  (placeholders until the tileset draws them).
- *Built ahead (24 November 2026, from play):* each snare set is marked on the local map (a noose
  on its peg, with a red mark when it holds a catch), seen or remembered; and on the travel map
  the snares within 60 m of one another are one site, a noose in a ring at their middle. A site
  clicked says how many and how many have caught; within 400 m **Go to your traps** puts the
  wanderer on the local map among them (pits and set lines and nets are counted with the snares), and further off the way there is planned
  (`game/hunt.ts`, `trapSites`).

### Stage 4: fishing

*Decided (27 November 2026):* each fish its own species and items, by water and climate; fish are
gutted (a blade, Survival) before roasting, the guts kept for bait; worms dug, guts, meat scraps
and bread bait a hook; and a spell of fishing runs for a length chosen from the menu, stopping on
trouble.

*Built (27 November 2026; `actors/data/fish.ts`, `world/fishing.ts`, `game/fishing.ts`,
`fish-test.ts`).* The numbers are proposed, to tune in play.

- **The fish.** Twenty-three species, each with its waters (river, lake, or the sea's shore), its
  climates (cold, temperate, warm, by the place's warmest and coldest months), its size and how
  common it is; some bite at night (eel, catfish), some keep to the shallows (where a spear can
  take them), and some hunt other fish (they take guts or meat rather than worms). Each is three
  items: as caught, gutted, and roast, its weight and portions those of the fish caught.
- **Fishing with a rod** (the skill menu at water: for an hour, two hours, until dusk or dawn, or
  until a catch, at most eight hours): each quarter hour a bite by chance, by Fishing, the hour
  (dawn and dusk best, night poorest but for the night fish), winter (half), rain (a little
  better), the water (a small pond holds few) and the bait (worms best; guts, meat or bread good;
  none, slowly). Landing it is a Fishing check, harder for a bigger fish: a near miss or a failure
  loses it and the bait, a fumble snaps the line. It stops early when a beast that could hurt the
  wanderer comes within ten tiles, someone comes near, or they grow worn out, chilled, parched or
  faint with hunger, and says what was caught.
- **A spear** (bought, or a pole or a staff sharpened into prongs with a blade): in the shallows
  only, by day or night, for an hour or until a catch; it takes only the fish of the shallows.
- **Set lines and nets** from the bank: a line (baited from what is carried) takes a fish an hour
  by chance (unbaited, seldom), holding three; a net more often, holding six, but not in a small
  pond. They are marked in the water (a float, or a net's corks, red with a catch), and with the
  traps on the travel map; lifting one gives back the line or net and its fish. A heron or
  whatever hunts about may take a fish waiting in it.
- **Gutting** (the skill menu on the wanderer's own tile, with a blade; Survival): each fish
  carried is gutted, five minutes a fish, the guts kept but on a poor job; a fumble nicks the hand.
  A fish roasted whole comes out a grade poorer.
- **Worms** dug near water (within twelve tiles) in soft ground: half an hour for a handful or
  more, more in rich or damp ground and with a spade; none from frozen, sandy or stony ground.
- **Bait for traps:** fish, gutted fish and guts are meat bait for snares and pits.
- **Ice:** a frozen lake (or a river frozen hard) is fished through a hole cut with an axe, a
  hatchet or a spear (twenty minutes); lines and nets cannot be set under the ice.

### Stage 5: the camp

*Decided (27 November 2026):* a camp can be left standing with its fire burning, banked or put
out; things left at it are at risk while the wanderer is away; and every camp is marked on the
travel map with the state of its fire, those unvisited a month falling into ruin.

*Built (27 November 2026; `game/camp.ts`, `game/camping/fire.ts`, `game/camping/away.ts`,
`screens/camp.ts`, `camp-test.ts`).* The numbers are proposed, to tune in play.

- **Banking the fire** (the camp screen, or the skill menu at the fire): the embers covered with
  ash, an armful laid on if one is stacked, to smoulder four times slower than a fire burns, for
  half a day at most, and to be raked back to flame without flint and steel. A banked fire gives
  three tenths of a fire's warmth, and the rain does not put it out.
- **Leaving the camp standing** (the camp screen): leave the fire burning on its fuel, bank it and
  go, or put it out and go. The camp stays on the map, its fire burning down as time passes;
  nothing needs doing to leave it but walking away.
- **Things left at a camp** (on the ground within four tiles of its fire): while the wanderer is
  away, each hour food may be taken by animals (four in a hundred) and goods by passers (four in a
  thousand, none at a well hidden site); a hidden site and a shelter make both less likely. Coming
  back to the camp tells what happened, the fire burning out among it.
- **On the travel map:** each camp is a flame in a ring, bright while its fire burns, dull red
  banked, grey cold. Clicked, it says the camp's shelter, its fire and when it was left; within
  400 m **Go to your camp** puts the wanderer at its bed, and further off the way there is planned.
- **A month unvisited,** a camp falls into ruin: its shelter falls in (a tent left in it is lost),
  its objects go from the map but a cold ring of stones, and it is no longer marked.
- Where two camps are close, the wanderer is at the nearer.
- *One snare system (27 November 2026, from play):* the camp screen no longer sets, checks or takes
  up snares of a camp's own; snares are all the wanderer's ordinary snares, set from the skill menu
  (or P), and the camp screen lists those within thirty tiles of the camp, and how many have a
  catch. A camp's snares in an old save become ordinary snares on loading, with any catch. Striking
  a camp leaves snares about it where they are.
- *Gathering sticks and stones* (the skill menu, or M) takes its quarter hour as work that can be
  stopped.
- *From play (27 November 2026):* no camp is made, and no fire lit from the skill menu, within the
  bounds of a town or a city (beyond its walls, it can be); sleeping rough on the ground there is
  still allowed. A village is no bar.

*Proposed numbers in each stage, to tune in play.*
