# Magic

True magic in a low-magic world: rare, hard to learn, costly to use, and built by the caster rather
than chosen from a list. Part of the design vision ([vision.md](vision.md)). Each part is marked
**Decided** (the user's design) or **Proposed** (a suggestion to agree or change).

## Principles

**Decided.**

- **No fixed spell list.** Spells are crafted: a mage learns the parts of magic and combines them
  into spells of their own. Skill in spellcraft and in the kind of magic sets how strong they can
  be.
- **Magic is difficult and not trivial.** It takes long training and costs the caster heavily in
  body or mind. The world stays low magic: most people never see a working spell.
- **Spells can be written down, learnt and traded**, kept in a spell book.
- **Enchanting** attaches a spell to an object, locked in by something whose quality limits the
  power, as in the Elder Scrolls games.

**Proposed.**

- **Magic leaves marks.** Casting is seen and heard, costs the caster something real, and can go
  wrong. People react: faiths, lords and neighbours have views on mages, and some places hang
  them.
- **The world, not the spell, decides the outcome.** A spell produces effects in the simulation
  (heat, cold, force, wounds, a state of mind), and the world answers by its own rules: fire
  spreads through dry thatch, water freezes, a frightened horse bolts. This is where much of the
  variety comes from (see below).

## The parts of a spell

**Decided:** a spell is made of parts: its element or elements, its components, how it is emitted,
and its duration; spellcraft and the kind of magic set its power.

**Proposed:** one more part, the **effect** (what the spell does with its element), and two
optional ones, **conditions** and **anchors**. A spell is then a short formula:

> *effect* + *element(s)* + *emit* + *duration* + *components* + *power*, optionally with
> *conditions*

### Effects (proposed)

The verbs of magic. Each is a part to learn, like an element.

| Effect | Does | Example with an element |
|---|---|---|
| Harm | Damages what it reaches | Fire: burns; Ice: frostbite; Acid: corrodes; Mind: anguish |
| Create | Brings the element into being for a time | Earth: a wall of stone; Ice: a bridge over water; Light: a glowing mote |
| Shape | Reshapes or moves what already exists of the element | Earth: open a pit; Wind: turn a gale; Fire: bend a blaze away |
| Protect | Wards against the element | Fire: resist burning; Ice: keep warm; Mind: shield thoughts |
| Sense | Reveals the element or through it | Fire: see heat and life in the dark; Earth: find metal and hollows; Time: glimpse the recent past |
| Alter | Changes a state or a property | Time: slow or quicken; Light: make unseen; Earth: stone to mud |
| Bind | Holds, compels or curses | Mind: command; Telekinetic: hold fast; Curse: lay a curse |
| Unbind | Undoes magic or a binding | Any: dispel what was made of that element; Curse: lift a curse |

### Elements

**Decided (the user's list):** Fire, Ice, Wind, Earth, Telekinetic, Light, Dark, Acid, Mind,
Time, Curse, and others. **Decided:** the list will grow as the design goes on and is completed
when magic is built.

**Proposed additions,** to cover what the list leaves out (see "What is missing" below):

| Element | Covers |
|---|---|
| Water | Rain, mist, drowning, purifying water, walking on water |
| Life | Healing, growth, flesh, plants and beasts, sickness |
| Death | Decay, the dead, life drained, speaking with the dead |
| Sound | Silence, voices thrown, deafening noise |
| Space | Distance and place: the rarest and most dangerous, for leaps and doors |
| Spirit | Spirits, ghosts, and the magic itself (dispelling, sensing magic) |

**Proposed: elements have properties** (hot, cold, solid, liquid, airy, bright, dark, living,
dead, mental, corrosive, temporal, forceful, spiritual). Effects act on properties rather than
on each element by name, so every effect works with every element without a table of each pair
being written by hand, and the world's materials answer by their properties too (wood burns,
iron conducts cold, stone resists acid, the undead fear light).

### Combining elements (proposed)

**The open question:** how different combinations give different effects.

- **Two elements in one spell make a compound**, with properties from both and a character of its
  own. A short hand-written table names the notable ones; any pair not in it simply carries both
  sets of properties.

  | Compound | From | Character |
  |---|---|---|
  | Magma | Fire + Earth | Burns and stays; sets ground alight |
  | Storm | Wind + Water | Lightning and rain; strikes the tallest and the armoured |
  | Blizzard | Ice + Wind | Cold, blinding, slowing |
  | Sandstorm | Earth + Wind | Blinds and scours |
  | Illusion | Light + Mind | Images that are believed |
  | Dread | Dark + Mind | Fear and despair |
  | Rot | Death + Acid | Decay that spreads |
  | Withering | Curse + Time | A slow, lingering harm |
  | Steam | Fire + Water | Scalding fog that hides and burns |

- **Three elements** are possible for masters, at a steep rise in difficulty and cost.
- **The world adds the rest:** the same Storm does little in a desert and terrible things to a
  knight in a wet field; a Fire spell on a frozen lake makes fog and thin ice.

### Components

**Decided:** verbal (needs the ability to speak), hand signs (needs hands), ingredients (tied to
alchemy), and combinations of them for different effects.

**Proposed: what each component does.**

| Component | Needs | Gives | Drawbacks |
|---|---|---|---|
| Verbal | Being able to speak (the talking capacity); a language of power | Range and reach | Heard by anyone near; a gag or a crushed jaw stops it |
| Hand signs | Free, working hands (manipulation) | Precision and shape (narrow cones, exact targets) | Seen; a bound or broken hand stops it |
| Ingredients | Alchemical materials, used up | Power and permanence; lower cost to the caster; needed for some elements | Must be found, bought or made; spoil |

- **More components, more control:** a spell cast with all three is cheaper and safer; dropping a
  component (casting silently, or with hands bound) is possible at a higher skill, cost and risk.
- **Ingredients link magic to alchemy, herb lore and the world's flora and bestiary:** salamander
  ash for fire, a drowned man's ring for water, grave dust for death.

### Emit

**Decided:** touch, ray, cone, burst, ball, wall, aerial area, ground area, target.

**Proposed additions:** **self** (the caster alone), **chain** (leaps between targets),
**aura** (a field that moves with the caster), **placed** (set on a spot or a door, waiting for a
condition: wards, glyphs, traps), and **object** (for enchanting, below).

### Duration

**Decided:** longer costs more.

**Proposed:** instant; **held** (lasts while the caster concentrates, draining the mental burst
pool, and ends if they are hurt or distracted); timed (rounds, minutes, hours, days); and
**lasting**, which needs an anchor (an ingredient, an object or a place) and is how curses,
wards and enchantments endure.

### Conditions (proposed)

Optional clauses that make a spell wait or end: *when someone crosses this threshold*, *until the
next full moon*, *until she forgives him*. A condition that makes a spell easier to end makes it
cheaper; one that makes it harder makes it dearer. Curses are the clearest case, and the
generator's folk curses already have ways of being lifted (`nature/curses.ts`): a curse a mage
lays can carry a lifting condition the same way.

## Power, cost and failure (proposed)

- **Complexity** is the sum of the parts (each element, effect, emit and duration has a weight;
  compounds and conditions add more). A mage can only craft and cast spells whose complexity is
  within their spellcraft.
- **Power** is set by the caster's skill in the element and effect, the components used and how
  much they choose to put in.
- **Cost** grows with power, area, range and duration. It is paid from the pools: mental burst
  and day for most spells, physical for the forceful ones (Earth, Telekinetic, Wind), and both for
  the dark arts. A caster can **overcast**, paying past their pools in body: nosebleeds, fainting,
  wounds, and, for the worst, lasting harm or years of age.
- **Failure** is a contest of skill against complexity, made worse by pain, fear, exhaustion,
  armour on the hands and haste. A failed spell may fizzle, cost without effect, or **miscast**:
  backfire on the caster, hit the wrong target, or turn into something else. Miscasts of Curse,
  Death, Mind and Space are the ones people tell stories about.
- **Training** is long: each element and effect must be learnt from a teacher or a text, then
  practised (skills grow by use, as elsewhere).

## Spell books and spreading spells

**Decided:** crafted spells can be written in a spell book, learnt and traded.

**Proposed.**

- **A spell is written as a formula** in a tradition's notation (see schools below), in a script
  (the generator's scripts give each culture's writing). Reading another mage's spell needs that
  literacy and enough spellcraft to follow it.
- **Learning a written spell** takes study time by its complexity, and the caster must already
  know its elements and effect.
- **Spells are goods:** sold by mages, kept by orders, found in ruins, stolen, burnt by
  inquisitors. Each gets a name, made in the language of the one who wrote it.

## Imbuing objects

**Decided:** the craft is **artificing** or **imbuing** (the skill Artificing,
[skills.md](skills.md)); "enchantment" is kept for the school of the mind.

**Decided:** attaching a spell to an object, locked in by something whose quality sets the power
it can hold. Not every spell suits it, so a spell might be defined as an enchantment only.

**Proposed.**

- **Enchantment is the "object" emit:** a spell crafted for an object, with one of four ways to
  act: **constant** (while worn or carried: a cloak that keeps out cold), **on strike** (a blade
  that burns), **on use** (a wand of a few charges), or **triggered** (a ring that wards when its
  wearer is struck).
- **The anchor** holds it: a gem, a rune cut in good metal, a relic, a bone of something
  remarkable. Its quality caps the power and duration. Anchors can crack when overloaded.
- **Charges and fading:** used enchantments have charges that a mage can refill; constant ones
  slowly fade unless renewed. Nothing is permanent without a rare anchor.
- **Enchanting is a skill** of its own, and the enchanter must know the spell.

## Schools

**Decided:** the traditions of magic are eight schools: **Abjuration, Conjuration, Divination,
Evocation, Illusion, Necromancy, Transmutation and Enchantment.**

**Proposed: a spell belongs to a school by what it does.** The school follows from the spell's
effect, with a few elements and compounds that claim a spell for their own school whatever the
effect:

| School | Spells of | By effect | Claims by element |
|---|---|---|---|
| Abjuration | Warding, dispelling, breaking curses, banishing | Protect, Unbind | |
| Conjuration | Calling and binding creatures and spirits, making things for a time, doors through space | Create (of matter and beings), Bind (of creatures and spirits) | Space |
| Divination | Seeing the hidden, far, past or coming | Sense | |
| Evocation | Raw force and the energies: fire, cold, lightning, light, sound, acid | Harm, Create (of energy) | |
| Illusion | False sights, sounds and feelings; the unseen | | The Illusion compound; Light, Sound or Dark with Alter or Create to deceive |
| Necromancy | Death, the dead, decay, life drained, curses | | Death, Curse |
| Transmutation | Changing matter, bodies, time and motion | Alter, Shape | Time, Telekinetic |
| Enchantment | The mind: charm, command, fear, sleep, forgetting | | Mind with Bind or Alter |

- **Each school is a skill** (decided: spellcraft by school, [skills.md](skills.md)). The school's skill sets a spell's power and safety; a spell that
  draws on two schools (a ward against the dead is Abjuration and Necromancy) uses the lower.
- **Healing** (Life with Create or Alter) falls in Transmutation by this rule; it could instead be
  given to Conjuration or a school of its own. **Open.**
- **Naming (decided):** laying a spell into an object is **imbuing** (the Artificing skill);
  "enchantment" is the school of the mind.

**Decided: very few teaching bodies,** taken from what the generator already places, so that
classical mages are very rare outside the great cities and village witches are only somewhat more
common.

What the generator already has:

| Generator | Where | Becomes |
|---|---|---|
| Colleges of magic (`gen/special.ts`) | About half of the university cities | The only institutions teaching classical magic; few per world |
| Mages' towers (`gen/special.ts`) | Some other great cities, in fantasy worlds | A lone master with a household and perhaps an apprentice or two |
| Universities and their colleges (`towns/naming.ts`) | The largest cities of the richest Old World realms | Learning without magic: letters, law, medicine, astronomy; the place to find texts and the scholars who know a mage |
| Witch's huts (`towns/village.ts`), with residents (`people/residents.ts`) | About one Old World village in five, outside the fields | The village witch (below) |

**Proposed: the village witch.** Most of those in witch's huts are cunning folk: herbalists,
midwives, charm-sellers and fortune-tellers whose craft is folk practice and herb lore, which may
or may not work. Only a few (perhaps one in five) practise real magic: hedge magic in the
witchcraft tradition (Necromancy, Enchantment and Transmutation, with ingredients), learnt from an
older witch and taught to few. A witch is not a college: no notation, a handful of spells, and a
price for teaching.

**Proposed: how they teach.**

- **A college** teaches several schools in its own notation, takes apprentices who meet the
  thresholds and can pay or serve, and has ranks giving access to its spells, texts and anchors.
  It has standing with the realm and a position toward the local faith.
- **A tower's master** teaches what they know, to whom they choose, for reasons of their own.
- **A true witch** teaches one apprentice at a time, by ingredients and practice rather than
  books, and hides it where witchcraft is feared.
- **Texts** (spell books found in ruins, sold, stolen) allow slow, risky learning alone.
- **Meeting a mage** outside a great city is a rare event, usually a wanderer, an exile or a
  court mage on their lord's business.

## How the world regards mages

**Decided:** it varies. Some faiths and cultures fear all magic, some fear one kind (witchcraft,
for example), and some embrace it.

**Proposed.**

- **Each faith and each culture has a stance toward each school:** embraced, tolerated,
  licensed (allowed to the sanctioned: a church's own, a college's members), feared, or forbidden.
  The generator already makes each world's faiths and cultures (`lore/faiths.ts`,
  `names/traits.ts`); a stance per school would be made with them, so it differs between worlds
  and between realms within one.
- **Named practices** group schools as people see them, not as mages do: **witchcraft**
  (Necromancy and Enchantment, with ingredients), **sorcery** (Evocation and Conjuration),
  **augury** (Divination), **the healing arts** (healing). A faith may bless augury and burn
  witches.
- **Consequences** follow the stance where the player is: what may be cast openly, what must be
  hidden (casting is seen and heard), who will teach, sell to or shelter a mage, and what happens
  when one is caught (fines, the pyre, conscription into a lord's service). Rumour carries a mage's
  name ahead of them.
- **Realms and lords** may differ from the faith: a king who keeps a court mage in a land whose
  priests preach against them is a source of stories.

## What is missing: the strange spells of D&D

**The open question:** what the system above cannot do yet. Checking the well-known kinds of
spell against it:

| Kind of spell | How it is made here | Notes |
|---|---|---|
| Healing, regrowing | Life + Create or Alter | Slow and costly; regrowing a limb is a master's work |
| Raising the dead | Death + Bind | Animates a corpse, not a person; true resurrection does not exist |
| Speaking with the dead | Death + Sense | Brief, partial, unsettling |
| Summoning creatures | Spirit or Life + Bind | Calls and binds what already exists nearby; nothing from nowhere |
| Polymorph, shapechange | Life + Alter, on self | Rare, dangerous, and hard to undo |
| Teleport, doors | Space + Shape | The rarest element; short range; miscasts are terrible |
| Flight, levitation, falling slowly | Telekinetic or Wind + Shape, self | Brief and tiring |
| Invisibility | Light + Alter, self | Unseen, not unheard or unsmelt |
| Illusion | Light + Mind compound | Believed until doubted |
| Charm, sleep, fear, dominate | Mind + Bind or Alter | Willpower resists; people remember afterwards |
| Scrying, divination, clairvoyance | Mind, Time or Light + Sense | Glimpses, not answers |
| Detect and dispel magic, counterspell | Spirit + Sense or Unbind | A counterspell is an Unbind cast in answer |
| Wards, glyphs, alarms, traps | Any + "placed" emit + condition | |
| Contingency, delayed spells | Condition | |
| Animating objects, golems | Telekinetic or Earth + Bind, lasting, anchored | Costly and few |
| Transmuting matter | Earth or Water + Alter | Stone to mud yes; lead to gold no |
| Creating food and water | Water or Life + Create | Thin fare; lasting nourishment does not come from magic |
| Silence, ventriloquism | Sound + Alter or Create | |
| Haste, slow, time stop | Time + Alter | Stopping time is beyond anyone |
| Wish, miracles | None | Miracles belong to the faiths and are not the caster's to command |
| Tongues, sending messages | Mind + Sense, or Mind + Create at a distance | |

What stays out on purpose: wishes, true resurrection, conjuring lasting matter or food, and large
destruction at a word. These keep the world low magic.

## How it could be built (proposed)

- **Parts as data:** elements (with properties), effects, emits, durations, components and
  compounds are data tables, so new ones can be added without new code.
- **A spell is a small record** of its parts and numbers, checked when crafted (complexity within
  skill, the parts known, the combination allowed) and saved in the spell book.
- **Casting produces world effects:** wounds of a type (burns, frostbite, corrosion) on body
  parts, states on actors (frightened, slowed, unseen, bound), changes to tiles (a wall of ice, a
  pit, fire, mist), and lasting marks (curses, wards) with their conditions. The rest of the
  simulation (fire, water, morale, the body) takes it from there.
- **Descriptions and names** are written from the parts, in the caster's language, so every
  crafted spell reads as if someone made it.

## Who can cast

**Decided:** there is no inborn gift. Magic is rare because it is hard to learn: it needs a high
Intelligence and great mental fortitude.

**Proposed.**

- **Thresholds to begin:** Intelligence and Willpower of at least 13 each (on the 1 to 20
  scale) to take up any school at all; higher for the hardest elements (Space, Time, Death).
  Fewer than one person in twenty clears both, and few of those find a teacher.
- **What the mental traits do afterwards:** Intelligence sets how fast parts and schools are
  learnt and how complex a spell can be; Willpower sets the cost and the control (and resists
  miscasts); Wisdom senses magic and the uncanny, and helps notice a spell cast nearby.
- **Teachers are the real gate:** with the traits but no teacher or text, a would-be mage gets
  nowhere; finding one, and being accepted, is a story in itself.

## Open questions

- The final list of elements and effects, to be completed when magic is built.
- Where healing belongs among the schools.
- How many of the village witches practise real magic (one in five is proposed).
