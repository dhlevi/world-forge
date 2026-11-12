# The quest generator

How the world gives the player things to do, from a single errand to an epic. Part of the design
vision ([vision.md](vision.md#stories-the-quest-generator)). Each part is marked **Decided** (the
user's design) or **Proposed** (a suggestion to agree or change).

## Structure

**Decided.**

- **Quests are made of parts** that add up to a coherent whole, from simple one-off tasks to full
  epic adventures.
- **Five levels:** **Task, Job, Chapter, Story, Epic.** A Task is a single goal; a Job is 1 to 3
  Tasks; a Chapter is 1 to 3 Jobs; a Story is 1 to 3 Chapters; an Epic is 1 to 3 Stories.
- **Jobs and above** tie their parts together with a coherent story.
- **The player may not know how long a quest is;** not every part is revealed.
- **Stories and Epics** can be large, need a lot of travel, and may have a **Big Bad**.

### A task

**Decided:** each task has:

| Field | Holds |
|---|---|
| Quest giver | Who asks |
| Requirements | Skills, reputation with a faction, a previous Task, Job, Chapter or Story completed |
| Type | Collect X things, find, retrieve, escort, explore or map, hunt |
| Type attributes | What the type needs: which items and how many to collect, whom to escort and where |
| End date and time | A deadline, or none |
| Reward | Its type and tiers, perhaps by how well it was done |
| Story | Its description |

**Proposed additions to the task:**

- **Location:** where it happens (a place, a region, or "wherever the trail leads").
- **Outcome options:** the ways it can end (done, done well, done another way, failed, refused,
  overtaken by events), each with its consequences.
- **Revealed:** what the player knows of it so far (see "What the player sees").
- **Source:** the thing in the world it comes from (a curse, a lair, a war, a household's
  trouble), so it can be checked against the world and brought to an end when the world changes.

**Proposed: more task types.** The decided types cover gathering and travel; a life of more than
adventuring needs a few more:

| Type | Example |
|---|---|
| Deliver | Carry a letter, goods or a message somewhere by a date |
| Investigate | Find out who, why or what: ask, examine, follow, deduce (a Witcher contract's first half) |
| Talk | Persuade, negotiate, apologise, deceive, carry terms between two sides |
| Protect | Guard a place, a person or a caravan for a time; hold off an attack |
| Defeat | Deal with a person or band: kill, drive off, capture, or bring to justice |
| Make | Craft, cook, brew, build or imbue something to a standard |
| Perform | Play, sing, dance or tell stories at an event |
| Steal and sabotage | Take, plant, spoil or burn something unseen |
| Rescue | Free someone held: a prisoner, a captive, someone lost in a cave |
| Work | Labour for a time: bring in a harvest, mind a shop, crew a ship |
| Lift | End a curse or haunting by its lifting condition (the generator's curses each have some) |

## Making it coherent

**Proposed: story first, then tasks.** A coherent whole is easiest to make from the top down: each
Job and above starts from a **premise** taken from the world, and its parts are the steps that
premise needs.

1. **A premise comes from the world's state,** not from a list: a curse on a village
   (`nature/curses.ts`), a lair or dungeon with its hook (`dungeons/`, `lairs/`), a war's
   aftermath (`lore/world.ts`), an abandoned village's fate, a prisoner's story
   (`dungeons/inmates.ts`), an organisation's aims (`lore/orders.ts`), a household's trouble (the
   generator's residents and their ties, `people/residents.ts`), a shortage at market, a festival.
2. **A premise names roles:** the one who wants something, the one in the way, the one who knows,
   the victim, the prize. Roles are filled with real people and places from the world (a named
   miller, the real crypt three valleys over), so the quest belongs there.
3. **A story template gives its shape:** a short sequence of beats such as *hook, investigate,
   complication, confrontation, aftermath*, or *debt, errand, betrayal, reckoning*. Templates are
   data; each beat becomes a Job or a Chapter, and each Job's steps become Tasks of the types
   above.
4. **Text is written from the parts,** in the voice the generator already uses (its lore, curse
   rumours and dungeon keys), with names in the world's languages.

**Proposed: built a step at a time.** Only the parts the player has reached are made in full; the
rest is a sketch (the premise, roles and remaining beats). When a part ends, the next is made in
the light of how it ended: a witness the player frightened off is gone from the next step; a
bribe taken changes who is waiting at the end. This keeps quests reactive and keeps their length
hidden even from the game until it is decided.

**Proposed: escalation.** A small quest can grow: a Job to find a missing goat can turn up tracks
that lead to a lair, and the lair's hook can become a Chapter. Each premise has a chance of a
**deeper cause**, revealed by investigation, that lifts it to the next level. Most do not; the
few that do are the memorable ones.

## What the player sees

**Decided:** not all parts are revealed, and the player may not know a quest's length.

**Proposed.**

- **The journal shows what the character knows,** in their words: who asked, what for, what was
  promised, what has been learnt, and leads not yet followed. No quest markers, no "1 of 3".
- **Leads are things to follow,** not waypoints: a name, a place described, a rumour that may be
  wrong. Knowledge skills and senses decide how much a clue tells.
- **Deadlines are known only if someone said so;** the world's clocks (below) run regardless.

### The task log

**Decided (design notes for now):** what character creation leaves owing (a debt, a favour owed
or owing, a feud, a rival, a promise) should appear as tasks in a task log, alongside the quests.

**Proposed.**

- **Every obligation is a task:** "You owe Sigurd 60 copper" is a task with the creditor (a
  person record, see characters.md, People in your life), the amount and, if one was set, a date
  after which the creditor comes looking (with interest, threats or the law).
- **Ties make tasks and premises:** a contact who owes a favour is a resource to call on; a rival
  or a feud is a threat the storyteller can bring into play; a lost love or a dead parent can
  become a quest premise, as can the Omen card.
- **One log for all:** tasks (small, personal obligations), jobs and the larger quest structures
  share the journal, written in the character's own words as above, with what is known, who is
  involved and where they were last heard of.

## Rewards

**Decided:** a reward has a type and tiers, perhaps by performance.

**Proposed.**

- **Types:** money, goods, land or a house, a favour owed, reputation with a person or faction,
  standing in an organisation, knowledge (a spell, a recipe, a map, a teacher), a title.
- **Tiers** by how it was done: quickly, quietly, without bloodshed, beyond what was asked.
- **Rewards come from the giver's means:** a poor village pays in food and gratitude, a guild in
  coin, a lord in land; givers can also refuse to pay, haggle or pay late.

## The Big Bad

**Decided:** a quest that makes a Big Bad affects the world in a major way. Others may deal with
it first (other adventurers), which makes the quest fail if they do. Slaying a nefarious dragon
draws attention and competition; the player can eliminate the competition, or join them.

**Proposed.**

- **A Big Bad has a clock:** its plan or its harm advances whether or not the player acts (a
  dragon's raids spread, a necromancer's dead multiply, a usurper gathers men). Each step changes
  the world: villages burnt or abandoned, prices up, roads closed, refugees in the towns,
  rumours everywhere.
- **Rivals are actors with clocks of their own:** named adventurers, a lord's knights, a
  witch-hunter, a rival organisation, each making progress toward the same end. The player hears
  of them, meets them, and can race them, join them, hire on with them, help them, mislead them
  or remove them; each choice has its own reputation.
- **The end can come without the player:** a rival slays the dragon and takes the glory; the
  Big Bad wins and the world lives with it. The quest then ends as overtaken by events, and the
  world remembers who did what.
- **Big Bads are rare,** a few per world at a time, set by the storyteller.

## The storyteller

**Proposed.** As in RimWorld, a storyteller paces what reaches the player:

- **It watches** how the player is living (homesteading, travelling, trading, fighting), how
  long since the last trouble, and how they are faring.
- **It chooses which premises surface** near the player and when: quiet stretches and troubles in
  turn, more personal quests for a settled life, more dangerous ones for an adventurer.
- **It never invents** what the world cannot support: every quest still has a source in the
  world's state.

## How it could be built (proposed)

- **Data, not code:** premises (with the world conditions that allow them), roles, story
  templates and task types are data tables, so the content can grow without new code.
- **A quest is a tree** of parts (Epic to Task), each with its fields, its state (unknown, known,
  active, done, failed, overtaken) and its source, saved with the game.
- **Seeded:** each quest is generated from the world's seed and the event that started it, so it
  can be tested and repeated, like the rest of the generator.
- **Checked against the world:** when a quest's source changes (the giver dies, the curse is lifted,
  a rival wins), the quest is updated or closed.

## Open questions

- Which task types to add (above).
- How far rewards vary by performance, and how performance is judged.
- How many quests are open near the player at once, and how many Big Bads a world has.
- Whether the player can start quests of their own (put up a notice, hire others), which leads
  into management.
