# Characters and actors

How a person in the game is described and how their body, needs and skills work. The player and
every other person (and, where it fits, animals) are **actors** built the same way, so the same
rules apply to everyone. Part of the design vision ([vision.md](vision.md)).

Each part is marked **Decided** (the user's design) or **Proposed** (a suggestion to agree or
change). Numbers are first guesses, to be tuned in play.

*Built so far: the actor as components (identity, body with its tree of parts, traits with senses
and the luck gauge, skills with caps, languages and regional knowledge, the two-bar pools, mood,
belongings, history and knowledge of the world), made by character creation and saved with the
game (`apps/game/src/actors/`). Wounds, needs, conditions and learning by use are still to come.*

## Traits

**Decided.** Traits are the person's inborn qualities, in three groups and one alone:

| Group | Traits |
|---|---|
| Mental | Intelligence, Wisdom, Willpower |
| Physical | Strength, Constitution, Agility |
| Personality | Charm, Gravitas, Aura |
| Unclassed | Luck |

**Proposed: what each trait does.**

| Trait | Governs |
|---|---|
| Intelligence | How fast skills and languages are learnt, how many languages can be held, reading and complex crafts, memory of what was seen and heard |
| Wisdom | Judgement and intuition: reading people and places, noticing what is wrong, herb lore and healing, knowing when to stop |
| Willpower | The mental pools, resisting pain, fear, temptation and addiction, keeping going when exhausted |
| Strength | Force and damage, lifting and carrying, the physical burst pool |
| Constitution | The physical day pool, blood volume and recovery, resisting disease, cold, poison and hunger |
| Agility | Speed, balance, dodging, fine and quick movement |
| Charm | Being liked: persuasion, bargaining, performance, making friends |
| Gravitas | Being taken seriously: authority, command, intimidation, leadership, standing before lords |
| Aura | **Decided:** social perception and grace: reading subtext, tact, knowing what not to say. A modifier in social situations that also changes which responses are offered (see below) |
| Luck | **Decided:** a gauge rather than a fixed trait (see below) |

**Decided: scale.** Each trait from 1 to 20 (Luck excepted). In the hardcore realism mode the numbers are hidden and traits are
described in words ([survival.md](survival.md#showing-it-numbers-or-hardcore-realism)). **Proposed:** 10 is the human
average and most people fall between 7 and 13. A people's mean differs by trait (the generator's peoples already differ in build:
`people/appearance.ts`); culture, upbringing and age shift them a little. Mental and
personality traits change slowly or not at all: ageing, crippling wounds, long illness.

**Proposed: Aura in conversation.** Charm makes people like you, Gravitas makes them take you
seriously, and Aura lets you read the room:

- **What you notice:** a higher Aura shows more of what lies under a conversation (that a
  merchant is nervous, that a question touched a sore point, that the widow is not grieving).
- **What you may say:** some responses appear only with enough Aura (the tactful way out, the
  question that should not be asked aloud, letting a silence work), and some blunders are flagged
  before they are made.
- **How it lands:** Aura tempers how a risky remark is received, alongside Charm and Gravitas.

With Aura now social, magic draws on Intelligence, Willpower and Wisdom; there is no inborn gift,
but a high Intelligence and Willpower are needed to learn it at all
([magic.md](magic.md#who-can-cast)).

**Decided: Luck is a gauge from 0 to 100**, not a fixed trait: 0 is no luck, 100 is great luck.
It is a flat modifier on chance (attacks, events, finds, loot). Good luck spends it; bad luck
raises it, so fortune evens out over time.

**Proposed: how the gauge works.**

- **Where luck applies,** the gauge tilts the odds a little: at 50 it is neutral, toward 100 it
  favours you and toward 0 it works against you, never by more than a modest amount on any one
  roll.
- **When luck shows,** the gauge moves: an outcome better than expected (a critical hit, a rare
  find, a storm that misses you) lowers it, in proportion to how lucky it was; an outcome worse
  than expected (a fumble, a lame horse, a robbed camp) raises it.
- **Between events** it drifts slowly back toward a personal resting level, which might come
  from the background (some people are born lucky).
- **It is not shown as a number** to the player, only hinted at ("you feel your luck has
  turned"), so it reads as fortune rather than a meter to manage.

**Decided: physical traits can be trained**, with limits by age: the young train more easily.

**Proposed: training.** Hard physical work and exercise build Strength, Constitution and Agility
slowly toward a ceiling set by the person's people, build and age. Training needs food and rest
to count (it draws on the day pool and needs good nourishment). The ceiling and the rate fall with
age, and without use a trained trait slowly settles back toward its natural level.

## Creating a character

Detailed in [creation.md](creation.md) (origin, family, the cards, occupations and terms).

**Decided:** traits are first set by a **background plus a budget**, as in Darklands.

**Proposed, after Darklands:**

1. **Origin:** people (race), culture and homeland from the generated world, sex, and the
   family's standing (peasant, townsfolk, craftsman, merchant, clergy, minor nobility). These set
   the starting trait means, languages and scripts, faith, and how others first see you.
2. **Budget:** a pool of points to raise or lower traits within the people's range.
3. **Life so far:** terms of a few years each in an occupation open to that background (farmhand,
   apprentice, soldier, hunter, novice, scholar, travelling player, outlaw...). Each term adds
   years of age, skills, money, possessions, contacts and a short history line, and may shift
   traits (soldiering builds Strength; study, Intelligence). More terms mean more skill but an
   older start, with the ageing that brings.
4. **The result** is a person with a past that the world can refer to (a master you were
   apprenticed to, a company you served in, a village you left).

## Senses

**Decided.** Eyesight, Hearing, Smell, Taste, Touch.

**Proposed: what they do.** Senses are on the same 1 to 20 scale and, unlike traits, are tied to
body parts, so wounds, illness and age can dull or take them.

| Sense | Used for |
|---|---|
| Eyesight | Sight range by light (day, dusk, night, firelight), noticing details at a distance, aiming |
| Hearing | Hearing actors and events out of sight, sneaking past or being heard, overheard talk |
| Smell | Tracking, smoke and fire, rot and spoiled food, the presence of animals and certain monsters |
| Taste | Cooking and brewing quality, noticing poison or spoilage in food |
| Touch | Fine work (locks, stitching wounds, crafts), working in the dark, feeling the weather |

## Body and identity

**Decided.** Height and Weight; Race, Culture and Gender.

**Proposed.**

- **Height and weight** come from the person's people (the generator's build for each people),
  sex and a random spread, and then shape reach, carrying capacity, how much food and water the
  body needs, blood volume, which clothes and armour fit, and how easily the person hides.
  Weight changes with feeding and starvation.
- **Race** is the people (the generator's human and other peoples, each with its build,
  colouring and marks, `people/appearance.ts`): trait means, senses (for example keener eyes or
  smell), lifespan, and how others receive them.
- **Culture** is one of the world's generated cultures: the languages and scripts known from
  birth, customs, faith, the names given, and how each other culture regards it (the generator's
  relations and prejudices).
- **Gender** affects how people of each culture receive the person according to that culture's
  norms, which vary; it does not change traits.
- **Age** (proposed addition): youth, prime and old age move traits and recovery; the world's
  calendar runs, so the player ages too.

## Health: body parts and wounds

**Decided.** No hit points. Damage is to body parts, by wound type, as in RimWorld and UnReal
World, with blood loss, bandaging and so on.

**Proposed.**

- **The body is a tree of parts** (head with skull, brain, eyes, ears, nose and jaw; neck; torso
  with ribs, lungs, heart, liver, stomach, kidneys and spine; arms to hands and fingers; legs to
  feet and toes). Each part has a size (how often it is struck), whether it is vital, what it
  does, and the armour and clothing layers covering it.
- **Wounds** have a type (cut, stab, bruise, fracture, crush, bite, burn, frostbite), a severity,
  a bleeding rate, pain, an infection risk and a healing time; bad ones leave scars or lasting
  harm (a stiff knee, a lost eye).
- **Capacities** are worked out from the parts, as in RimWorld: consciousness, moving,
  manipulation, sight, hearing, breathing, blood pumping, blood filtering, talking and eating.
  A broken arm lowers manipulation; a lost eye, sight; a punctured lung, breathing.
- **Blood:** a volume from body size and Constitution; wounds bleed it away until bandaged,
  stitched or clotted; losing it brings weakness, then fainting, then death. It returns slowly with
  food, water and rest.
- **Pain** lowers consciousness and can cause shock or fainting; Willpower and remedies resist it.
- **Death** comes from blood loss, a destroyed vital organ, consciousness gone for too long,
  suffocation, or illness; not from a number reaching zero.
- **Treatment** needs skill, materials and time: bandages, cleaning, stitching, splints,
  poultices, setting bones, and later surgery; poor treatment brings infection.

## The two-bar pools

**Decided.** Physical and mental stamina each have a **day** pool and a **burst** pool. Effort
draws on the burst pool; when it is empty that effort stops (no more sprinting). Over time the
burst pool refills from the day pool. Traits set the pools' sizes.

**Proposed.**

| Pool | Spent by | Burst refills from day | Day refills by | Sized by |
|---|---|---|---|---|
| Physical burst | Sprinting, fighting, heavy lifting, climbing, swimming | While resting or walking gently | | Strength, Agility, Constitution |
| Physical day | Refilling burst; long marches; hard labour | | Sleep, with food and water | Constitution, Willpower, body size |
| Mental burst | Concentrating: fine crafts, reading hard texts, performing, persuading, rites | While idle or doing easy things | | Intelligence, Willpower |
| Mental day | Refilling mental burst; long study or work; stress | | Sleep, rest, comfort, company | Willpower, Wisdom |

- An empty day pool is **exhaustion**: burst refills only slowly and everything suffers, until
  sleep.
- Encumbrance, wounds, illness, cold and heat make physical effort cost more; stress, pain and
  addiction do the same for mental effort.

## Hunger, thirst and sleep

**Decided.** These work in reverse: one meal does not cure starvation. A person can be full
and still starving; still dehydrated and unable to drink more. Regular nutrition is needed to
recover.

**Proposed: each need has three layers.**

1. **What is in you now:** the stomach (fullness, with a capacity from body size) and what has
   been drunk. Eating and drinking stop when it is full; it empties as food digests over hours.
2. **The short reserve:** energy and water the body is using today, filled as the stomach
   digests.
3. **The long condition:** nourishment and hydration over days. A run of short reserves pushes it
   down through hungry, malnourished and starving (with growing penalties and weight loss); only
   days of regular meals bring it back up.

Sleep works the same way: a **sleep debt** builds when sleep is short and is only paid back over
several good nights. Food can later have qualities beyond energy (variety, spoilage, cooked or
raw) for morale and health.

## Conditions: addiction and disease

**Decided.** Addiction and disease as in RimWorld.

**Proposed.**

- **Substances** (drink, herbs, poppy, and stronger things) give effects, then tolerance with
  use; enough use makes a **dependency**, with withdrawal when it is missed, which fades over
  weeks. Willpower resists dependency.
- **Diseases** race the body's immunity against the disease's severity: rest, warmth, food and
  treatment speed immunity. They spread by contact, bad water, wounds and vermin, more readily
  where a town's sanitation is poor (the generator already rates each town's sanitation:
  `people/town.ts`). Some leave lasting marks.

## Skills

**Decided.** Skills improve by use, as in UnReal World; a skill that is not used does not
improve. The highest level each skill can reach is capped by the person's physical and mental
traits. The skill list is in [skills.md](skills.md).

**Proposed.**

- **Learning by doing:** each use teaches a little; harder tasks teach more, whether they
  succeed or narrowly fail; easy tasks teach almost nothing. Intelligence sets the pace.
- **Caps:** each skill names its governing traits (for example, archery: Agility and Eyesight;
  herbalism: Wisdom and Intelligence), and these set its highest level. Gains slow toward the cap.
- **Teachers and books** can speed learning up to a point, but cannot replace practice.

**Decided: rust.** Skills unused for a long time get rusty, but rust is a temporary modifier on
the learnt level, not a loss of it, and practice shakes it off quickly.

**Proposed:** rust grows slowly after a few weeks without use, to a limit (for example a third
of the level), and each use removes it many times faster than new learning would come.

## Languages

**Decided.** Languages can be learnt; how many and how fast depends on Intelligence.

**Proposed.** The generator already makes each culture's language, its family and its script
(`lang/`), and can translate words into it (`lang/translate.ts`).

- **Fluency** grows by exposure (time among speakers), teachers and books: none, a few words,
  broken, fluent, native. Related languages in the same family come more easily (the generator
  knows the families and cognates).
- **In play,** speech in a language the person barely knows shows partly in that language
  itself, filling in as they learn it.
- **Literacy** is separate, one script at a time; many people cannot read at all.

## Carrying and inventory

**Decided.** A realistic inventory, limited by what a person can carry and by what each
container holds, in weight and size. Mounts and caravans become essential for trading and
travelling at scale.

**Proposed.**

- **Every item** has a weight and a bulk (volume, with a flag for long or awkward things such as
  poles and spears).
- **Containers** have capacities by weight and bulk: pouch, belt, satchel, backpack, sack,
  basket, saddlebags, packs on a pack animal, cart, wagon.
- **Worn items** go in layers (underclothes, clothes, padding, mail, outer garments, cloak), as
  in Kingdom Come, each covering body parts for warmth and protection.
- **Hands:** what is held in each hand; carrying a sack in one hand leaves only one for anything
  else.
- **Encumbrance** from total load against Strength and body weight: slower, louder, more costly
  in burst and day stamina, and harder to fight in.
- **Mounts, pack animals and carts** carry far more; carts and wagons need roads (the
  generator's roads and tracks), and animals need food, water and care.

**Decided (after the first build): inventory management is to be built** next among the
character's systems: packs and bags, equipping and unequipping, and wear and uses.

**Proposed: how it works.**

- **Containers hold items, and can be nested:** a pouch on a belt, a satchel over a shoulder, a
  pack on the back, saddlebags on a horse. Each container has its own weight and bulk limits, and
  where it is worn (belt, shoulder, back, hand). What can be reached quickly (belt, hands) differs
  from what must be dug out of a pack (taking time, out of reach in a fight).
- **Equipping** puts an item in a slot: a hand (or both, for a two-handed weapon), or a worn
  layer on the body parts it covers (underclothes, clothes, padding, mail, outer garment, cloak,
  headgear, footwear, gloves). Layers stack in order and cannot be doubled (two mail shirts), and
  armour must fit the body (height and build).
- **Wear and uses:** every item has a condition (from new to ruined) and, where it fits, uses
  (arrows, bandages, torches, food portions, a waterskin's water). Use wears it: a blade dulls and
  nicks, boots wear through with walking, clothes tear and soak, mail rusts in the wet. Condition
  sets how well it works and what it is worth; repair takes the matching craft (Smithing,
  Tailoring, Hideworking, Carpentry) and materials.
- **Quality and make:** items carry a quality (poor, common, fine, masterwork) and their maker's
  culture, which sets look, price and how long they last.
- **On the ground:** items can be dropped, picked up, stored in chests and left in a camp, and
  stay where they were left (saved with the game's changes).
- **The view:** an inventory screen as a popup over the map, with the body and its slots, the
  containers and what each holds, total weight and bulk against the limits, and the encumbrance
  that results.

## People in your life

**Decided (design notes for now; built with the NPCs):** the people character creation names
(parents, siblings, friends, lovers, masters, contacts, rivals, creditors) should be real people
of the world, linked from the character: their information can be seen, and they can be found
and met in play.

**Proposed.**

- **Each tie becomes a person record** when the character is made: name, sex, age, trade, where
  they live (the home town, a household in it, or wherever their life took them), alive or dead,
  and how they feel about the character. They are made in full (as actors) only when met, like
  every other person in a city (see navigation.md, Cities and towns).
- **The character sheet links to them:** a list of people known, each with what the character
  knows of them, when last seen and where they were.
- **Finding them:** family live in the home town's household, which is marked on its city view;
  others are known by town or by rumour, and finding them uses the rumours and marks of
  navigation.md (asking around, a mark with a ring of doubt).
- **They live on:** in the world's summary ticks they can move, prosper, fall ill or die, and send
  word (letters, messengers) that becomes news or a quest.

## Mood

**Decided:** there is a mood meter, made of **moodlets**: timed positive and negative effects,
as in RimWorld and Project Zomboid. How mood shows and what it does for the player is still to
decide.

**Proposed.**

- **Moodlets** each have a strength and a duration, and the same kind stacks only to a limit:
  a hot meal (+, hours), sleeping in the rain (-, a day), a good night in the tavern (+), a
  friend's death (-, weeks), a successful performance (+), being cold, hungry, in pain or
  dependent and in withdrawal (-, while it lasts), a comfortable home (+, while there).
- **Mood is their sum** against a baseline set by the person (Willpower and Wisdom steady it)
  and their expectations (a lord expects more comfort than a hunter).
- **Effects to choose from:** low mood drains the mental day pool faster, slows learning and
  dulls social skills; high mood does the opposite. For other actors, very low mood can lead to
  breaks (drinking, quarrels, leaving service), as in RimWorld; for the player, perhaps only
  penalties and inner voice in the message log, so control is never taken away. **To decide.**

## Animals

**Decided:** animals are simpler actors: no skills and no personality traits.

**Proposed:** they share the body (a simpler tree of parts per body plan: four-legged, bird,
serpent...), wounds, blood, the physical pools and hunger and thirst, so hunting, butchery,
mounts and pack animals use the same rules. In place of personality they have a temperament
(timid, skittish, aggressive, tame) and, for domestic animals, training and loyalty.

## Open questions

- Whether the player sees the luck gauge, or only hints of it.
- How mood shows for the player and what it does (above).
- The occupations open in character creation: not yet decided; they will follow the skill list.
