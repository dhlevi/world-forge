# Skills

The skills a person can learn. How skills work (learning by use, caps set by traits, rust) is in
[characters.md](characters.md#skills). Each part is marked **Decided** (the user's design) or
**Proposed** (a suggestion to agree or change).

**Decided:** the skills and their groups below. **Proposed:** the **governs** and **traits**
columns: what each skill is used for, and the traits (and senses) whose values set its cap and
help its checks.

## Crafting

| Skill | Governs | Traits |
|---|---|---|
| Agriculture | Ploughing, sowing, tending and harvesting crops; orchards; knowing soil and season | Constitution, Wisdom |
| Carpentry | Building in wood, furniture, carts, boats, bows and arrows, tools' wooden parts | Strength, Agility |
| Masonry | Building in stone and brick, walls, hearths, wells | Strength, Intelligence |
| Cooking | Meals, preserving (salting, smoking, drying), baking, brewing | Wisdom, Taste |
| Alchemy | Distilling, tinctures, reagents, spell ingredients, dangerous mixtures | Intelligence, Wisdom |
| Hideworking | Butchering, skinning, tanning, leather, furs, sinew and bone | Agility, Touch |
| Tailoring | Spinning, weaving, sewing, clothes and padding | Agility, Touch |
| Mining | Finding ore and stone, digging, shoring, quarrying | Strength, Constitution |
| Smithing | Working iron and metal at all: tools, nails, fittings, repairs | Strength, Constitution |
| Armorsmith | Mail, plate and their repair; **cannot exceed Smithing** | Strength, Intelligence |
| Weaponsmith | Blades, heads and their repair; **cannot exceed Smithing** | Strength, Agility |
| Jewelsmith | Fine metals and gems, rings, settings, anchors for imbuing | Agility, Eyesight |
| Artistry | Painting, carving, illumination, decoration; the worth of made things | Agility, Wisdom |
| Spellcraft, one per school | Designing and casting spells of Abjuration, Conjuration, Divination, Evocation, Illusion, Necromancy, Transmutation and Enchantment ([magic.md](magic.md)) | Intelligence, Willpower |
| Artificing (imbuing) | Laying spells into objects and their anchors | Intelligence, Agility |
| Animal handling | Taming, training, calming, breeding and caring for animals | Wisdom, Charm |

## Physical

| Skill | Governs | Traits |
|---|---|---|
| Fishing | Line, net and trap fishing; knowing waters | Wisdom, Agility |
| Trapping | Snares, deadfalls and traps for animals (and people) | Intelligence, Agility |
| Tracking | Finding and following signs | Wisdom, Eyesight, Smell |
| Survival | Fire, shelter, finding water and food in the wild, felling and splitting wood, weather sense, staying warm | Wisdom, Constitution |
| Climbing | Walls, cliffs, trees | Strength, Agility |
| Swimming | Swimming, diving, staying afloat in armour or current | Constitution, Strength |
| Sailing | Handling boats and ships, rigging, navigation on water | Agility, Wisdom |
| Sneak | Moving unseen and unheard, hiding | Agility, Hearing |
| Athletics | Running, jumping, lifting, endurance at hard work | Strength, Constitution |
| Acrobatics | Balance, tumbling, falling well, escaping holds | Agility |
| Disguise | Passing as someone else: clothes, bearing, voice | Charm, Aura |
| Sleight of hand | Picking pockets, palming, conjuring tricks | Agility, Touch |
| Lockpicking | Locks, latches and strongboxes | Agility, Touch, Intelligence |
| Mount riding | Riding and fighting from horseback; driving carts and wagons | Agility, Wisdom |

## Social and performance

| Skill | Governs | Traits |
|---|---|---|
| Persuasion | Convincing, lying, charming, intimidating | Charm, Gravitas, Aura |
| Trading | Bargaining, judging worth, knowing markets | Intelligence, Charm |
| Musicianship | Singing and playing instruments | Charm, Hearing |
| Dance | Dancing at feasts, courts and for coin | Agility, Charm |
| Storytelling | Tales, recitation, news and gossip told well; holding a room | Charm, Intelligence, Aura |
| Leadership | Commanding a party, soldiers, workers or a household; keeping them together | Gravitas, Charm, Willpower |

## Knowledge

| Skill | Governs | Traits |
|---|---|---|
| Herbalism | Finding, knowing and preparing plants; simple remedies and poisons | Wisdom, Smell |
| Medicine | Treating wounds and illness: bandaging, stitching, setting bones, surgery, nursing | Intelligence, Touch |
| Stewardship | Accounts, stores, estates, shops, a lord's lands and revenues | Intelligence, Wisdom |
| Cartography | Reading, judging, copying and drawing maps and charts; finding the way by them (Proposed, see [navigation.md](navigation.md)) | Intelligence, Agility |
| History and heraldry, per realm | Houses, arms, wars, claims and old places of a realm | Intelligence |
| Theology, per faith | A faith's doctrines, rites, saints, holy days and holy places | Intelligence, Wisdom |
| Nature lore, per region | The beasts, plants, curses and uncanny things of a land; what a Witcher knows | Wisdom, Intelligence |
| Law, per realm | A realm's laws, courts, rights, tolls and punishments | Intelligence, Gravitas |

**Decided:** the knowledge skills may need to be regional. **Proposed:** like languages, each
knowledge skill is held separately for each realm, faith or region, because that is how the
generator makes the world: realms have their own houses, wars and laws (`lore/`), faiths their own
doctrines and saints (`lore/faiths.ts`), and each region its own bestiary, flora and curses
(`nature/`).

- **Related knowledge carries over in part:** a neighbouring realm's history, a faith of the same
  family, a land of the same biome; so a scholar or a well-travelled hunter is not a beginner
  everywhere.
- **Learning** comes from living there, from books (a university city's library), from teachers
  and from investigation (talking to locals, examining a body, reading a ruin).
- **In play,** these skills decide what is told about a coat of arms, a shrine, a curse or a
  track, and they open choices in conversation and investigation.

## Combat

| Skill | Governs | Traits |
|---|---|---|
| Dodge | Getting out of the way | Agility |
| Shield | Blocking and striking with a shield | Strength, Agility |
| Short blades | Knives, daggers, short swords | Agility |
| Long blades | Swords, sabres, greatswords | Strength, Agility |
| Clubs | Clubs, maces, hammers, flails | Strength |
| Axes | Hand axes, war axes, woodsmen's axes | Strength |
| Polearms | Spears, staves, halberds, pikes | Strength, Agility |
| Throwing | Stones, knives, axes, javelins | Agility, Eyesight |
| Archery | Bows | Strength, Agility, Eyesight |
| Crossbow | Crossbows: spanning, loading, aiming | Strength, Eyesight |
| Sling | Slings | Agility, Eyesight |
| Unarmed | Wrestling, boxing, grappling | Strength, Agility |

## Languages and literacy

**Decided:** each language is a skill of its own, as in
[characters.md](characters.md#languages) (learnt by exposure, limited by Intelligence), and
literacy goes with the languages.

**Proposed:** literacy is a skill per script (the generator gives each culture a script, and
related languages often share one), learnt from a teacher or a book, and needed to read signs,
letters, books and spell books. Reading a text needs both the language and its script.

## Not separate skills

**Decided:** perception is covered by the senses and Wisdom, not a skill.

**Proposed,** for the other gaps that were raised:

| Activity | Covered by |
|---|---|
| Noticing, searching, spotting an ambush | The senses and Wisdom |
| Woodcutting and charcoal | Survival (felling) and Carpentry |
| Fletching | Carpentry |
| Butchering | Hideworking |
| Brewing | Cooking |
| Driving carts | Mount riding |
| Gambling | Intelligence and Luck, no skill |
| Teaching | The skill being taught, with Charm or Gravitas |
| Pottery and glass | Bought, not made, until there is a reason to add them |
| Siege and engineering | Later, with lordship and war |

## Every skill, from zero

**Decided:** every character has every skill; most simply start at level 0. Starting levels come
from race, culture and character creation.

**Proposed.**

- **Scale:** 0 to 100, where 0 is never learnt, 20 a beginner, 50 a journeyman, 75 a master and
  above 90 the best in a realm. The cap from the governing traits (see
  [characters.md](characters.md#skills)) is a level on this scale.
- **At level 0,** a common task can still be tried on traits alone, at poor odds and with
  little to show (anyone can swing an axe or cook a stew). Some skills cannot be used at all
  untrained: spellcraft (which also needs the Intelligence and Willpower thresholds, a teacher or
  text, [magic.md](magic.md#who-can-cast)), artificing, lockpicking, surgery under Medicine,
  sailing a ship, and reading.
- **Where starting levels come from,** in order:
  1. **Race:** what the people is known for (keen-eyed archers, born miners).
  2. **Culture and homeland:** the native language at a native level, its script if the family
     is literate, the culture's ways (seafarers sail, steppe peoples ride, forest peoples track),
     and the knowledge skills of home: its realm's history and law, its faith, and the nature lore
     of its region (the generator gives each culture its traits and homeland, `names/traits.ts`).
  3. **Family standing:** a farmer's child knows the fields, a merchant's child the market, a
     noble's child riding, heraldry and a blade.
  4. **Occupations** in character creation: each term raises the skills of that work
     ([creation.md](creation.md#occupations)).
  5. **The budget** in character creation, if some points are left for skills.

## Open questions

- How much each source in character creation adds (with the occupations).
