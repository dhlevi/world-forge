# Combat

How fighting works on the local map: who fights whom and why, how a fight is played, how blows
land on a body of parts, and how fights end. Part of the design vision ([vision.md](vision.md)),
under the pillars **the world is real** and **survival with weight**: a fight is dangerous, rare
and remembered, not the game's daily round. Each part is marked **Decided** (the user's decision),
**Proposed** (a suggestion to agree or change) or **Dev note**. The draft's questions are answered
under Decisions taken.

Read it with [characters.md](characters.md) (the body of parts, wounds, blood, the two-bar
pools), [skills.md](skills.md#combat) (the combat skills), [npcs.md](npcs.md) (people and
animals, fear and flight, the watch, predators that are threats only until this is built) and
[survival.md](survival.md) (hunting, cold, injury).

## What is already decided elsewhere

- **No hit points.** Damage is to body parts, by wound type (cut, stab, bruise, fracture, crush,
  bite, burn), with bleeding, pain, shock and capacities, as in RimWorld and UnReal World
  ([characters.md](characters.md#health-body-parts-and-wounds)).
- **Tactical, turn-based, on the local map** (ToME, UnReal World), in the game's seconds
  (Decisions, below).
- **The two-bar pools:** fighting spends the physical burst pool, refilled from the day pool.
- **The combat skills:** Dodge, Shield, Short blades, Long blades, Clubs, Axes, Polearms,
  Throwing, Archery, Crossbow, Sling, Unarmed ([skills.md](skills.md#combat)).
- **Armour and clothing by region in six layers** (under, main, padding, armour, outer, cloak)
  ([characters.md](characters.md)).
- **Animals and people react to fear** (npcs.md): fleeing, hiding, the watch giving chase;
  predators threaten the wanderer but do no harm until this is built.

## Principles (proposed)

1. **Fights are short and deadly.** A few exchanges decide most fights; a single good thrust can
   end one. Armour, numbers and ground matter more than levels.
2. **Most fights need not happen.** Talking, paying, backing away, fleeing, hiding and
   surrendering are always open, and most people and beasts would rather not fight.
3. **Every blow is a body.** Where it lands, through what, and with what edge or weight decides
   the wound; the wound decides what the hurt one can still do.
4. **Readable.** Every exchange says what happened in plain words ("Your spear takes the wolf in
   the shoulder; it yelps and falls back, limping"), and the numbers behind it can be looked at.
5. **The same rules for everyone.** The wanderer, a guard, a wolf and a bear use the same body,
   wound and morale rules; beasts differ in their body plan and natural weapons.

## How a fight is played (proposed)

- **Time.** The game's clock goes on in seconds, as now. In a fight, actions take their own time
  (a dagger's thrust 1.2 s, a sword's cut 1.6 s, a greataxe 2.4 s, drawing a bow 3 s, a step 1.2 s)
  and everyone in it acts in time order (the agents' queue already does this). No separate "combat
  mode" screen: the map, with the fight's state shown beside it.
- **Reach and ground.** Weapons have a reach (a dagger 1 tile, a sword 1, a spear 2, a pike 3); a
  longer reach strikes first as a foe closes. Doorways, stairs and narrow ways let one hold against
  many; high ground (the levels) helps; darkness and fog hide.
- **Actions.** Strike (aimed at a body part, or anywhere), thrust or cut where the weapon allows,
  block or parry (a stance that spends burst stamina), dodge (a step aside), shove, grapple and
  throw, draw or ready a weapon, shoot (by distance, cover and light), reload, retreat, flee,
  shout (to frighten or call for help), yield, and use an item (a bandage, a potion). Stances
  (aggressive, guarded, defensive) trade attack for defence.
- **Striking.** A blow is a check of the attacker's weapon skill against the defender's best
  defence (Dodge, Shield or the weapon's parry), shifted by reach, footing, wounds, pain, fatigue
  (burst stamina), surprise, light and morale. The margin decides where and how well it lands.
- **Where it lands.** By the part's size and the aim (aiming at a small part costs accuracy).
  The part's armour layers (each with its protection against cut, stab and blunt) take some or all
  of it; what gets through makes a wound of the weapon's kind and a severity from the margin and
  the weapon's weight and edge.
- **Wounds and their effects** (characters.md): bleeding, pain, fractures, lost capacities (a
  wounded leg slows, a wounded arm drops what it holds or weakens blows, a blow to the head
  stuns). Shock and fainting from pain and blood loss end many fights before death does.
- **Morale.** Every fighter has a will to go on (Willpower, mood, their temper or trait, how the
  fight goes, friends falling or fleeing); when it breaks they flee, yield or freeze. Beasts break
  sooner than people unless cornered, hungry or guarding young.
- **Ending.** A fight ends when one side flees, yields, falls senseless or dies. Yielding is
  honoured or not by temper, law and grudge; the fallen can be bound, robbed, helped or killed, and
  the world remembers which (reputation, the watch, kin).

## People, beasts and the law (proposed)

- **Animals:** hunting with bow, sling and spear (Stage 2 left these to this design); predators
  attack the wanderer when hungry, cornered or guarding young; packs surround; a bear's mauling
  is a fight to flee from.
- **People:** brawls in taverns (fists and stools, rarely deadly), duels, robbers on the road,
  thieves caught in the act, guards and the watch, soldiers at war.
- **The law:** violence in a town is a crime unless in defence; witnesses tell the watch; the
  watch comes, arrests, fines or hangs (npcs.md, Stage 3: thieves and the watch). Bodies are found.
- **Companions** (vision.md, open) fight beside the wanderer under simple orders.

## Decisions taken

**Decided (18 November 2026), answering the draft's questions.**

1. **Pace: the game's seconds, everyone in time order.** No rounds: each action takes its own
   time and the agents' queue orders everyone in a fight, as it does outside one.
2. **Detail: as in UnReal World.** Aimed blows at named body parts and stances are chosen every
   exchange, and the outcome is told part by part.
3. **Lethality: permadeath.** Death ends the game (the vision's open question on permadeath is
   settled). Fights are deadly, but combatants want different things, and that shapes how a fight
   goes and ends:
   - *predators* want to kill and eat;
   - *prey* wants to maim what threatens it and get away;
   - *bandits* want to maim or knock out and rob, though many will fight to the death when
     cornered, outnumbered by the law, or desperate;
   - others (guards, soldiers, brawlers, the defending householder) by their purpose, temper and
     morale.
   Each fighter carries an intent (kill, drive off, subdue, rob, flee) that chooses their targets
   and blows (a robber aims at the legs and the head's side, a predator at the throat), when they
   break off, and what they do with a fallen foe.
   *Dev note:* permadeath touches saving: one save per game, kept up to date, with death ending
   it (no loading an older save to undo a death); exports for backup stay possible.
   **Decided (19 November 2026):** death ends the game and the save is marked dead (it is listed,
   with its cause, but cannot be carried on); a developer's setting on the Load screen revives a
   dead game, for testing.
4. **Magic: left out of combat** until the magic systems are built (magic.md).
5. **Melee first; then ranged and thrown weapons.** Throwing takes anything that can be held and
   thrown: rocks, branches, axes, knives, bottles; each with its weight, balance and edge setting
   its range and wound.
6. **The order of building:** (a) the body of parts, wounds, blood and treatment
   (characters.md) on their own first, since they serve falls, cold and illness too; (b) melee with
   beasts (hunting with the spear, predators that attack); (c) ranged and thrown weapons, and
   hunting with the bow; (d) fights with people, morale, yielding and the law; (e) mounted
   fighting and war.

## Stages (decided order)

1. **The body**: parts, wounds, bleeding, pain, capacities, treatment, healing and death
   (characters.md), with falls, cold and bites using them. **Built** (19 November 2026;
   `actors/health.ts`, `game/treatment.ts`). Decided for it: every finger and toe in the body;
   full first aid (bandage, clean, stitch, splint, poultice) with infection; harm from thorns and
   brush, cold and heat, hunger and thirst, falls and drowning; permadeath with a developer's
   escape. Beasts took on bodies of their own plans with stage 2; residents take it on with
   stage 4.
2. **Melee with beasts**: strike, block, dodge, flee; predators attacking; hunting with the spear.
   **Built** (20 November 2026; `game/combat.ts`, `world/beasts.ts`, `world/fauna.ts`).
   Decided for it:
   - *Controls: both.* Walking into a beast that is fighting the wanderer strikes it with the
     standing aim, blow and stance; Shift+F opens the blow menu for one exchange (the beast in
     reach, the part to aim at, the blow, the stance, each with its chance), from which the
     standing choices can be kept. With no weapon in hand, the best carried is drawn first.
   - *Aggression: realistic.* Most beasts avoid people (bold ones still bluff). A hungry pack hunts
     a lone wanderer by dusk and dark or in winter; a bear surprised close, or a mother with young,
     attacks to drive off; the great cats stalk the weak and the sleeping in the dark; a crocodile
     takes what comes to the water; a viper strikes when trodden near; a boar, an aurochs, a bison,
     an elk, an elephant or a goose charges when pressed. Struck, a beast fights back (to kill, or
     to drive off), stands at bay when cornered, or flees, by its kind; a pack joins in.
   - *Wounded beasts* have bodies of their plan (four-footed, bird, serpent; toughness by weight),
     bleed, limp, leave a trail of blood read with Tracking, break off when their courage fails,
     and may die of their wounds where they run; one that leaves the bubble is kept, and found
     again lying up (or dead) later. A beast killed leaves a carcass as heavy as it was, butchered
     where it lies.
   - *Numbers: words, numbers on hover.* Each exchange is told in plain words; the log line's tip
     holds the chance, the roll, the severity and the armour; the blow menu shows the chances.

   The rules: a blow is the weapon's skill against the beast's dodging (counted at 0.7 of a level),
   shifted by the stance (aggressive +10/-15, defensive -15/+15), the aim (a smaller part, harder),
   the beast's size, the dark and the water, and the wanderer's own wounds; the margin sets the
   severity, with Strength; the hide takes some; a heavy bash breaks bone. A beast's blow is its
   attack against the wanderer's best defence (Dodge, a parry, which a great beast's weight makes
   hard, or a shield), goes for the parts its kind goes for, and armour worn there takes some.
   Each beast strikes at most twice for each of the wanderer's actions; a sleeper's first blow is
   undefended and wakes them. Venom (a viper's) is a condition of the body that spreads, then fades.
3. **Ranged and thrown**: bows, slings, crossbows, and throwing anything held (rocks, branches,
   axes, knives, bottles), ammunition; hunting with the bow. **Built** (20 November 2026;
   `game/ranged.ts`, `screens/shoot.ts`). Decided for it:
   - *A real line of fire.* The missile flies along the line through the target and on to the
     farthest it carries: walls stop it, a tree or a boulder may take it, a bush may turn it, a
     beast in the way may be struck instead, and a person in the way stops the shot being taken
     (until people fight, stage 4). A miss lands beyond the target. Range, the target's size, its
     moving or flying, the dark, a cross wind, the aim and a long bow's pull shift the chance.
   - *Recover and craft.* Arrows, bolts and thrown things land where they fall (some arrows and
     bolts break; glass shatters) or stay in the beast, found on its carcass. Arrows are made from
     feathers and a stick (or firewood) with a knife, in an hour (Carpentry).
   - *Anything, and gather.* Anything carried can be thrown, its weight, balance and edge setting
     its range and harm (things made for throwing, such as knives, hatchets, spears and stones, do
     best). M gathers stones on stony ground and in stream beds, and sticks under trees (Survival).
   - *Stalk and shoot.* A beast that does not know the wanderer is there is far easier to hit (sneak
     up, keep downwind); a hit beast bolts, comes on, or turns at bay, and is followed by its blood;
     birds can be shot perched, or in flight (hard).
   - *Shown, and clear* (24 November 2026, from play: shots hard to read, targets unclear). The
     missile's flight is drawn from the wanderer to where it ends, and what came of it rises in a
     word over the beast or person (Hit: neck, Killed, No harm, Miss; "in the way" when another was
     struck); a melee blow lunges the figure toward the foe, a flash marks where a blow lands, and a
     blow taken shows over the wanderer (the part struck, Blocked, Missed you). The log colours a
     fight's lines (a hit amber, a kill bold, a wound taken red, a miss grey; `game/game.ts`,
     LogTone). The shoot menu keeps to the side of the map away from the target; the target has red
     brackets at its corners and the others in reach are numbered on the map (1 to 9 choose them,
     as Tab does). The chance shown counts what is in the way: the shot's own chance and the chance
     of getting past the trees, brush and beasts between (`rules/ranged.ts`, `inTheWay`).

   The rules: the chance is the skill (Archery, Crossbow, Sling, Throwing) against 15 and 1.5 a tile
   within the weapon's good range (3 a tile beyond it), shifted by the target's size (a hare -8, a
   deer +6), unaware +15, lying still +10, moving -8, running -18, in flight -25, the dark -15, a
   cross wind (up to -15), the aim, and a long bow's pull (-4 for each point of Strength short of
   13). The margin sets the severity with the missile's harm (a thrown thing's, with Strength). A
   blow to the head of any kind stuns: a concussion that dims the mind and passes in an hour or two.
   R opens the menu (the beast, nearest first; what to loose; the aim; the chance and what is in the
   way); a bow not in hand is taken up first, which takes the turn. New items: the crossbow and its
   bolts, the sling, stones and stout sticks.
4. **People**: intent and morale, yielding, brawls, robbers who maim and rob, the watch and the
   law, reputation. **Built** (21 November 2026; `world/folk-fight.ts`, `world/strife.ts`,
   `world/law.ts`, `world/bands.ts`, `worker/bandits.ts`, `screens/mercy.ts`). Decided for it:
   - *Robbers: bands in the wilds.* Small bands of two to five, a chief and the rest, camp away
     from the towns for a week at a time: none within 1.5 km of a town or 600 m of a village, more
     where the nearest town is lawless or poor, more by a road. They are met on foot (a band that
     sees the wanderer comes, all together, demands the purse, and strikes if it is not handed
     over), and as ambushes on the road: crossing a band's ground on a journey, the band may spring
     out (more likely on a road), the journey stops, and the wanderer is set down on the local map
     with the band about them.
   - *The law: full justice.* A crime counts only if it is seen: assault (striking one who was not
     fighting the wanderer), theft (robbing the fallen), murder, killing another's beast and
     resisting arrest. Witnesses think the worse of the wanderer and act: the watch among them
     come to arrest; the bold, and the victim's household, kin and friends (who need less courage),
     come to the victim's aid, two at most (fists against fists; it takes more nerve against a
     blade), and hold off once the wanderer stops striking, leaving them to the watch; the rest
     scatter crying for the watch, and children run. The watch within a long street's reach come at
     the cry; if none are near, more are sent for from their post and arrive in a minute or two (a
     village's reeve and bailiffs take longer), finding their way round walls and through the
     crowd, which stands aside for them.
     Each settlement keeps a record, and the wanderer is wanted where a crime is not answered for;
     the watch who see or speak to a wanted wanderer may know them. The watch call on the wanderer
     to yield, then beat them down with blunt blows to hold them. The sentence is by the place's
     laws (harsher for Legalists, a warrior people and the Insular, milder for the cosmopolitan):
     fines (three times what was taken, for theft), days in the cells for what cannot be paid, the
     stocks for the brawler taken a third time, the brand for the thief taken again, and the rope
     for murder (sixty days and the brand under the mildest laws).
   - *Yielding: full choices.* Anyone can yield, the wanderer too (Y in the blow menu): robbers
     take the purse, rings and weapon in hand (and may put the boot in, more so if fought), the
     watch make the arrest, and a brawl ends. People whose courage fails yield (the watch, the
     brave, those cornered) or run crying for the watch; those beaten senseless fall, and come round
     in time. Walking into one who has yielded, fallen or been bound gives the choices: let them
     go, take what they carry, bind them (rope), tend their wounds, kill them, or hand a robber to
     the watch for a reward. Each is seen by those about and remembered.
   - *Brawls: provoked and tavern.* A hot-tempered or hardy person jostled again and again swings
     at the wanderer; one who hates the wanderer (an opinion of -50 or worse), close by, may come at
     them with fists; and from dusk to the small hours a tavern with four or more drinking sees a
     brawl now and then (an even chance in about six hours). Bruises alone never ruin a part of the
     body, however many (a hard enough blow breaks the bone instead). Brawls are fought with fists until one
     yields or falls, are rarely deadly, and the watch near pulls them apart. Fists answered with
     fists are no crime against one who began it.
   - *Standing:* each settlement's regard for the wanderer rises and falls with the deeds it sees
     or hears of (a crime; robbers killed or handed over) and fades by half in 45 days; half of it
     colours how its people greet the wanderer. The character sheet lists the towns' regard and
     where the wanderer is wanted.

   The rules: people fight as beasts do in form (the same blow, game/combat.ts), with skills by
   trade (the watch 45, their officers 55, robbers 40, a hunter 25, the hardy trades 20, the rest
   10, less for the young and old), courage by trade and traits (Brave, Craven, Wrathful), the
   blows of what they hold (or fists and feet), and armour where they wear it. A person's body is
   the wanderer's plan, by their sex and weight. The dead leave a body with what they carried.
5. **Later**: mounted fighting, companions in fights, war and sieges. **Deferred** (decided 21
   November 2026) until the systems it rests on are under way: riding and mounts, companions who
   follow the wanderer, and a way to take part in the realms' wars (the world has realms at war and
   army camps, but the game has no part in them yet). Magic in combat waits on the magic systems
   (decision 4).
