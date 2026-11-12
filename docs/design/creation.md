# Character creation

How a new character is made: who they are born as, the family they come from, the life they have
led before play begins, and their traits and skills at the start. Part of the character design
([characters.md](characters.md)). Each part is marked **Decided** (the user's design) or
**Proposed** (a suggestion to agree or change).

*Built (a first pass, rough screens): every step below, the quick start, the starting map from
the life led, and the character sheet; see the README. The numbers are first guesses, listed under
"Numbers used for now" at the end.*

## The steps

**Decided.**

1. **Choose race, culture and gender.**
2. **Background:** the family, perhaps the parents' professions.
3. **Traits:** set or adjust them by hand with points.
4. **Or a "tarot" selection** that draws or picks the character's story.
5. **Occupations:** a step of its own. Each pick advances an occupation's level and ages the
   character, and gives more skill and trait points.

**Proposed: the order and what each step settles.**

| Step | Settles | From the generator |
|---|---|---|
| Origin | Race, culture, homeland (a realm and region), gender, faith | The world's peoples, cultures, realms and faiths |
| Family | Parents' professions, the family's standing, siblings, what was left behind | The homeland's towns and trades |
| Traits | Trait points within the people's ranges, by hand or by the cards | People's trait means |
| Occupations | Terms in occupations: skills, traits, age, money, gear, contacts, events | The realm's orders, faiths, universities, wars |
| Finish | Starting place, belongings, name (in the culture's language), appearance | Names and appearance by culture |

The starting place is a town in the homeland, or where the last occupation ended (a garrison, a
monastery, a port).

## Background and family

**Proposed.**

- **Standing:** serf or peasant, townsfolk, craftsman, merchant, clergy, minor nobility,
  nobility. It sets which occupations open, the starting money, literacy, and how people first
  treat the character.
- **Parents' professions** give a few points in their skills (a smith's child has worked the
  bellows) and can open an occupation early (a merchant's child may start as a trader).
- **Family ties** carry into play: parents alive or dead, siblings, an inheritance or a debt, a
  family feud. These are real people in the world and can be quest sources later.

## The cards

**Decided:** a tarot-like selection or randomisation of the player's story, as an alternative
to setting everything by hand.

**Proposed.**

- **A deck of fate cards** (in the manner of the major arcana: the Wanderer, the Tower, the Star,
  the Hanged Man, and so on), each drawn **upright or reversed**.
- **One spread, four positions:** **Birth** (origin and standing), **Hearth** (family and
  upbringing), **Path** (which occupations the life leans toward and an event in it), **Omen**
  (a mark on the future: a trait leaning, the resting level of the Luck gauge, a debt, a rival, a
  prophecy that may or may not be true).
- **Draw or choose:** draw at random for a surprise, redraw a position at a cost, or pick cards
  outright. Cards set or lean choices; the player can still adjust afterwards.
- **The spread is kept** in the character's history, and the Omen can return in play (the
  storyteller can draw on it for a quest premise).

## Occupations

**Decided:** occupations are tracks with ranks. Each pick (a term) advances the rank, ages the
character and gives more skill and trait points. **Decided:** the tracks are the user's six with
the seven proposed additions (Craft split from Trades), and Underworld in two branches. The
**skills it builds** column is **proposed**.

| Track | Ranks | Skills it builds |
|---|---|---|
| Military | Recruit, Soldier, Veteran, Captain, Knight | Weapons, Shield, Dodge, Athletics, Mount riding, Leadership |
| Civil | Peasant, Labourer, Clerk, Courtier, Manorial administrator | Athletics, literacy, Persuasion, Stewardship, Law |
| Religion | Novice, Monk, Friar, Priest, Bishop | Theology, literacy, Medicine, Herbalism, Persuasion, Storytelling |
| Academia | Initiate, Student, Oblate, Clerk, Professor | Literacy, languages, History and heraldry, Law, Medicine, Alchemy |
| Trades | Peddler, Trader, Merchant, Proprietor | Trading, Persuasion, Stewardship, Mount riding, languages |
| Craft | Apprentice, Journeyman, Master; one craft chosen (smith, carpenter, tailor, mason...) | That craft's skills, Trading |
| Underworld: outlaw | Vagabond, Bandit, Highwayman | Survival, Sneak, Short blades, Archery, Mount riding |
| Underworld: city | Thief, Swindler, then a thieves' guild (`lore/orders.ts`) | Sleight of hand, Lockpicking, Sneak, Persuasion, Disguise |
| Woodland | Forager, Trapper, Hunter, Forester, Master of the hunt | Tracking, Trapping, Survival, Archery, Hideworking, Nature lore |
| Seafaring | Deckhand, Fisherman, Sailor, Boatswain, Captain | Sailing, Swimming, Fishing, Climbing, Leadership |
| Performance | Busker, Minstrel, Player, Troubadour, Master bard (a bards' college: `lore/orders.ts`) | Musicianship, Storytelling, Dance, Persuasion, Sleight of hand |
| Healing | Herb gatherer, Midwife, Barber-surgeon, Physician | Herbalism, Medicine, Alchemy |
| Farming | Farmhand, Tenant, Freeholder, Reeve | Agriculture, Animal handling, Athletics |
| Magic | Apprentice, Journeyman, Adept, Magister | Spellcraft by school, Alchemy, Artificing, literacy |

Notes:

- **The two Underworld branches** can be crossed: a highwayman who goes to ground in a city
  can take up the city branch, and a swindler run out of town the outlaw one.
- **Magic** opens only to those who meet the Intelligence and Willpower thresholds and come
  from, or reach, a city with a college or a master's tower ([magic.md](magic.md#who-can-cast)).
- **Peasant and Labourer** in Civil overlap with Farming. **Proposed:** Civil keeps them as the
  start of a road to clerkship and court; Farming is the road to working and holding land.

**Proposed: how terms work.**

- **A term is a few years** (three or four). Each grants points for that track's skills (most at
  the current rank), a trait point now and then (soldiering builds Strength; study, Intelligence),
  pay and belongings, and a line in the character's history.
- **Entry and promotion** depend on standing, traits and earlier ranks: a knight needs noble birth
  or a deed of note; a bishop, a priest's years and patronage; a professor, an academic's
  degrees. A failed promotion means another term at the same rank.
- **Branches between tracks** follow life: a soldier deserts into the outlaw branch, a novice
  goes on to the university, a trader settles as a proprietor, a forester becomes a lord's
  huntsman.
- **Each term draws an event,** as in Darklands and Traveller: a wound (a scar or lasting harm), a
  windfall, a contact, a rival, a debt, a crime, a war (the generator's real wars in the
  homeland's history), a calling.
- **Age has a cost:** every term ages the character, and past their prime traits begin to fall
  and physical training slows ([characters.md](characters.md)). Many terms make a skilled but older
  character; few make a young one with room to grow.
- **Mustering out:** the last term ends with its money, gear, contacts and a starting place.

## Quick start

**Decided:** a fully random quick start.

**Proposed.**

- **One click** draws every step: origin, family, the cards, traits and a run of occupation terms,
  then the finish (name, appearance, belongings, starting place).
- **Sensible, not absurd:** the draws follow the world (a culture's homeland, the occupations its
  standing allows, the realm's real wars) and favour characters able to survive the start, so a
  quick start is never a frail child alone in the snow unless the cards insist.
- **Shown before play** as a short biography written from the draws (born, raised, served,
  wounded, left), with the option to accept, reroll the whole character, or open it in the full
  creator to change anything.
- **Seeded:** the character comes from a seed, like the world, so one can be shared or replayed.

## Numbers used for now

**Proposed** (in the code, to tune in play):

- **Traits:** 10 plus the folk's leaning; 8 points to spend (one more for a peasant, one fewer for
  the nobility), each trait within 4 of its start and between 3 and 18; lowering one gives a point
  back. The Hearth card gives +1 to its trait (reversed: +1 Willpower); an upright Omen +1 to its
  trait.
- **Luck:** resting level 50, or 60 with an upright Omen and 40 reversed; each card redrawn lowers
  it by 3.
- **Skill caps:** 25 + 3.5 x the mean of the governing traits (60 for average traits, 95 at 20).
  Learning slows toward the cap.
- **Starting skills:** the folk's (for example elves Archery 10, dwarves Mining and Smithing 10),
  the culture's traditions (seafarers Sailing 15, horse lords Mount riding 20, storytellers
  Storytelling 15), the standing's, and 8 in each parent's trade. The native language is spoken
  natively; reading it comes with the family's chance of literacy (3% for peasants, 90% for the
  clergy and nobility, more in lettered cultures).
- **Terms:** 4 years for humans (3 for orcs, lizardfolk and fungus folk, 6 for dwarves and gnomes,
  10 for elves), starting at 16 (elves 40, dwarves 25). Each term gives about 24 skill points
  (more with Intelligence, and more for longer terms), shared among the track's skills at the
  current rank; half the time a point in one of the track's traits; past the folk's prime, half the
  time a point lost from a physical trait. Promotion is a d20 roll plus the track's traits and luck
  against 9 + twice the rank, with gates (a knight needs noble birth, a physician must read).
- **Events:** each term draws one, weighted by the track (soldiers are wounded and go to war,
  traders win windfalls and fall into debt, scholars find mentors). A war is one of the home
  realm's real wars in those years. A reversed Path card makes the first term in its track a hard
  one.
- **Money:** in copper (10 to a silver): the standing's purse (peasants 10 to 40, nobility 2000 to
  6000; less if fallen), plus each term's savings by rank.
- **The starting map:** 8 km about home (6 for a peasant who never left, 10 for the well-born,
  more for woodsmen and outlaws), the roads to the nearest market, and by occupation the roads to
  more towns (traders, soldiers, players, friars), the ports of the coast (sailors) and the great
  cities seen on maps (scholars, mages; old maps, to be given their errors later).

## Open questions

- Whether Civil keeps Peasant and Labourer alongside Farming.
- How many points each term gives, and the length of a term.
- The cards: a deck of the game's own, how many cards, and how strongly each position decides.
