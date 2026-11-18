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
   it (no loading an older save to undo a death); exports for backup stay possible. To agree when
   the body stage is built.
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
   (characters.md), with falls, cold and bites using them.
2. **Melee with beasts**: strike, block, dodge, flee; predators attacking; hunting with the spear.
3. **Ranged and thrown**: bows, slings, crossbows, and throwing anything held (rocks, branches,
   axes, knives, bottles), ammunition; hunting with the bow.
4. **People**: intent and morale, yielding, brawls, robbers who maim and rob, the watch and the
   law, reputation.
5. **Later**: mounted fighting, companions in fights, war and sieges.
