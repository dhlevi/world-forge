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

**Decided (25 November 2026): the task types, grouped by the mechanism under them.** Many tasks
told differently in the story are the same check with different settings, so the engine has one
check for each row and the story gives it its words. The first decided types fit in: collect and
hunt for pelts or meat are Collect, find and retrieve are Retrieve, escort is Escort, explore or map
is Explore, and hunting a named beast is Defeat.

| Group | Type | What the engine checks | Examples |
|---|---|---|---|
| Getting things | Collect or harvest | So many of a kind of item carried (`InventoryCount >= N`) | Gather ten lumps of bog iron; hunt four wolves for their pelts |
| | Retrieve or recover | One particular thing held (`HasUniqueEntity`) | Fetch an heirloom, steal a ledger, bring back a body |
| | Make | A thing made to a specification and quality (`CraftEntity`) | Brew a potion, forge a blade, cook for a feast |
| Places and going | Deliver or smuggle | A thing handed to a person, or left at a place (`TransferEntity`) | Carry a sealed letter; get contraband past the watch |
| | Escort or guide | A person brought somewhere alive (`EntityAtLocation && Alive`) | Guide a pilgrim, lead a prisoner out, drive livestock |
| | Explore or survey | So much of a region seen, or a place found (`MapCoverage`, `Discover`) | Map a dungeon's level, find a lost shrine, scout an army |
| People | Talk or negotiate | How a conversation ended (`DialogueOutcome`) | Persuade a mayor, apologise, carry terms, blackmail |
| | Perform or rite | A deed done at a place and time, with a check (`ExecuteActionAt`) | Play at a wedding, perform a burial rite, preach |
| | Work or tend | Time spent at a place on a labour (`SpendTurnsAt`) | Mind a shop, bring in a harvest, stand watch on a wall |
| Strife | Defeat or neutralise | A person or beast dead, fled or taken (`EntityState`) | Slay a beast, drive off bandits, take a fugitive alive |
| | Protect or hold | Someone or somewhere kept safe for a time (`SurviveTimer`) | Guard a caravan, hold a bridge until dawn |
| | Sabotage or plant | A thing changed, perhaps unseen (`ModifyWorldObject`) | Poison a well, plant evidence, burn siege engines |
| | Rescue or free | A constraint lifted and the person safe (`RemoveConstraint && Safe`) | Free someone from the stocks, cure a miner who cannot move |
| | Survive or endure | The wanderer alive and within the terms for a time (timer and condition) | Spend a night in a haunted crypt; a week in the wild without a town; a trial by ordeal |
| Mysteries | Investigate or deduce | Enough clues to a mystery found (`ClueScore >= threshold`) | Question witnesses, read tracks, name a killer |
| | Lift or break | A curse's or hazard's lifting condition met (`SatisfyCondition`) | Return stolen bones to a barrow, reconcile feuding ghosts |
| | Dispose or banish | A thing or creature got rid of, the reverse of retrieving | Be rid of a cursed item, bury a body in consecrated ground, lure a beast out of a territory without killing it |

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

**Decided (25 November 2026; see "Story templates"): built a step at a time.** Only the parts the player has reached are made in full; the
rest is a sketch (the premise, roles and remaining beats). When a part ends, the next is made in
the light of how it ended: a witness the player frightened off is gone from the next step; a
bribe taken changes who is waiting at the end. This keeps quests reactive and keeps their length
hidden even from the game until it is decided. (What keeps a quest made this way from breaking is in "Keeping quests whole",
below.)

**Decided (25 November 2026; see "Story templates"): escalation.** A small quest can grow: a Job to find a missing goat can turn up tracks
that lead to a lair, and the lair's hook can become a Chapter. Each premise has a chance of a
**deeper cause**, revealed by investigation, that lifts it to the next level. Most do not; the
few that do are the memorable ones.

## Keeping quests whole

**Decided (25 November 2026).** A quest is made a step at a time in a world that goes on without
it, so it must never break or leave the player on a dead end without knowing it.

- **Early ends and fallback beats.** Each beat of a story template lists, besides the next beat,
  what follows if a role's state changes first. If the villain dies during *investigate*, the
  remaining beats fold into *aftermath* instead of making a *confrontation* with no one to
  confront. A beat is made only when its preconditions hold; if they do not, its fallback is taken.
- **Roles are watched, not held.** A quest never keeps a person, a thing or a place from the
  world's own course (a giver can die, a prize be sold, a lair be cleared by others). Each quest
  is checked against the state of its roles when the world changes about it, and again when a
  game is loaded (a reconciling pass; the game makes people and places as they are needed, so a
  check against their records is surer than waiting for an event). Every role (giver, target,
  witness, prize) has a policy for when it is no longer valid:
  - **Reassign:** another takes the role (a brother inherits the debt, or the quest).
  - **Pivot:** the task changes to fit (*talk to the miller* becomes *find out what became of
    the miller*).
  - **Overtaken:** the quest closes, with a journal entry that tells what happened.
- **Unreliable, but always actionable.** A rumour may name the wrong culprit or make light of the
  danger, but a lead never ends on an empty place with nothing to find there. A false lead yields
  a clue that rules it out ("the tracks end at the river; the miller lied"), and the journal marks
  the lead as followed to its end, so the player knows to look elsewhere.
- **Facts kept apart from the telling.** What happens in a quest is kept as plain facts (who did
  what to whom, how much, and why: `{ actor: Sigurd, action: demanded, object: 60 copper,
  reason: a gambling debt }`), and the text is written from them when shown, by a grammar of
  parts (in the manner of Tracery) chosen by the character's traits and background. The facts can
  then be checked, reasoned over and retold in other voices (a rumour, a ballad, a court record)
  without being written again.

## Story templates

**Decided (25 November 2026).** Story templates are data: each turns a premise taken from the
world, and the roles bound to it, into a sequence of beats. Each beat becomes a Job or a Chapter,
and each Job becomes Tasks as the player reaches it; the whole tree is never made in advance.

- **Premise and roles.** A premise takes real people, places and things from the world's state
  (`people/residents.ts`, `dungeons/`, `nature/curses.ts`) and gives them roles: `giver`,
  `target`, `witness`, `prize` and `obstacle`, and others a template names (a `creditor`, a
  `loreKeeper`). Each role says where it comes from, what it must be, and what happens if it
  cannot be filled or stops being valid (`onMissing`; see "Keeping quests whole").
- **Beats.** A beat is a stage of the story (`hook`, `investigate`, `complication`,
  `confrontation`, `aftermath`). When a beat begins, it looks at the state of its roles in the
  world as it is then, and makes one to three Tasks.
- **The beat expander.** A beat does not fix every step: its `defaultTasks` are made into live
  Tasks by the state of the world when the player comes to it (an Escort if refugees are stranded
  on the road, an Explore if the way is blocked).
- **Branches and fallbacks.** A beat names the next beat (`nextBeat`), the next beat for each way
  a task can end (`branches`), the next beat when a flag is set as it ends (`onComplete`), and the
  beat to take when its own cannot be made (`fallbackNextBeat`). Bribery, stealth or a rival's
  doing then change the course without a second template.
- **Escalation.** A beat can carry a rule that, when it is met (a clue found, a hazard come
  upon), lifts the quest a level (a Job to a Chapter) and turns it onto a deeper sequence of
  beats. A template gives the level it starts at (`baseLevel`), the level it can grow to
  (`escalatesTo`) and how likely that is (`escalationChance`).
- **The world's clocks.** Before the next beat of a template such as the Big Bad's is made, the
  generator looks at the Big Bad's clock and the rivals' state: if a rival has already beaten a
  lieutenant, or the Big Bad has burnt a bridge, the next beat is made for the world as it now is.

### The first four templates

Kept here as given (25 November 2026). Each is followed by what needs settling before it is
built; the questions common to all are in "Settling the template format", below.

**1. The missing herd** (a mundane Job that can grow into a Chapter). A Collect or Retrieve job
for a resident whose beasts are gone; if the trail leads to a lair or a hidden threat, it grows
into a Chapter of several Jobs.

```json
{
  "id": "tpl_missing_herd_escalating",
  "baseLevel": "job",
  "escalatesTo": "chapter",
  "escalationChance": 0.35,
  "worldPreconditions": ["hasResidentWithLivestock", "hasNearbyWildernessOrLair"],
  "roles": {
    "giver": { "source": "resident", "filter": "ownsLivestock", "onMissing": "abort" },
    "prize": { "source": "livestock", "ownerRole": "giver", "onMissing": "pivotToInvestigate" },
    "obstacle": { "source": "creatureOrBand", "near": "prize.lastLocation", "onMissing": "reassign" },
    "deeperCause": { "source": "lairOrDungeon", "near": "prize.lastLocation", "optional": true }
  },
  "beats": [
    {
      "id": "beat_trail", "role": "hook",
      "defaultTasks": [
        { "type": "Explore", "targetRole": "prize", "locationHint": "prize.lastLocation",
          "clueCheck": { "skill": "Wisdom", "onSuccess": "revealLairSign" } }
      ],
      "onComplete": { "ifFlag": "foundDeeperSign", "escalate": true, "nextBeat": "beat_delve_hook" },
      "fallbackNextBeat": "beat_recover"
    },
    {
      "id": "beat_recover", "role": "confrontation",
      "defaultTasks": [
        { "type": "Defeat", "targetRole": "obstacle", "optional": true },
        { "type": "Retrieve", "targetRole": "prize", "deliverTo": "giver" }
      ],
      "nextBeat": "beat_aftermath"
    },
    {
      "id": "beat_delve_hook", "role": "investigate", "levelOverride": "job",
      "defaultTasks": [ { "type": "Investigate", "targetRole": "deeperCause", "goal": "findWhyLivestockWasTaken" } ],
      "nextBeat": "beat_lair_reckoning"
    },
    {
      "id": "beat_lair_reckoning", "role": "confrontation", "levelOverride": "job",
      "defaultTasks": [
        { "type": "Defeat", "targetRole": "obstacle" },
        { "type": "Rescue", "targetRole": "prize", "fallbackType": "Retrieve" }
      ],
      "nextBeat": "beat_aftermath"
    },
    {
      "id": "beat_aftermath", "role": "aftermath",
      "defaultTasks": [ { "type": "Talk", "targetRole": "giver", "outcome": "claimRewardOrNegotiate" } ],
      "nextBeat": null
    }
  ]
}
```

*To settle:*
- The clue check names `Wisdom`, which the game does not have; Tracking (reading the trail) or
  Survival (the lie of the land) would fit, the better of the two perhaps.
- `giver` is marked `abort` if missing. That suits the making of the quest; once it has begun, the
  giver's death should pass the herd to an heir (Reassign) or close the quest as overtaken, with
  the beasts the player's to keep or sell.
- A herd can stray of its own accord, with no one to blame. `obstacle` would then be optional, as
  its Defeat task already is, and the Explore beat could end in finding the beasts unharmed.
- If the beasts are dead when found, the Retrieve becomes bringing back proof (a carcass, a
  hide), and the aftermath tells the giver; a Rescue's `fallbackType` covers the lair beat only.
- How `escalationChance` and the flag `foundDeeperSign` meet: proposed, the chance is rolled when
  the premise is made (seeded), deciding whether a `deeperCause` exists; the flag is set only when
  the player finds its sign. The deeper beats are then always reachable when the cause exists, and
  never offered when it does not.

**2. The creditor's terms** (an obligation from the task log). For the debts, favours and feuds
left by character creation: not only "pay so much", but leverage, a side errand and a turning
point.

```json
{
  "id": "tpl_creditor_terms",
  "baseLevel": "job",
  "escalatesTo": "story",
  "escalationChance": 0.15,
  "worldPreconditions": ["playerHasActiveObligation", "creditorAliveInWorld"],
  "roles": {
    "creditor": { "source": "obligation.counterparty", "onMissing": "resolveObligationWaived" },
    "debt": { "source": "obligation.record" },
    "thirdParty": { "source": "residentOrFaction", "tiedTo": "creditor", "onMissing": "reassign" }
  },
  "beats": [
    {
      "id": "beat_demand", "role": "hook",
      "defaultTasks": [
        { "type": "Talk", "targetRole": "creditor", "options": ["payInFull", "negotiateTerms", "refuseAndDefy"] }
      ],
      "branches": { "payInFull": "beat_settled", "negotiateTerms": "beat_favor_errand", "refuseAndDefy": "beat_escalation_check" }
    },
    {
      "id": "beat_favor_errand", "role": "complication",
      "defaultTasks": [
        { "type": "Deliver", "targetRole": "thirdParty", "item": "debt.clearanceToken" },
        { "type": "Talk", "targetRole": "creditor", "outcome": "confirmDebtCleared" }
      ],
      "nextBeat": "beat_settled"
    },
    {
      "id": "beat_escalation_check", "role": "confrontation",
      "defaultTasks": [ { "type": "Protect", "targetRole": "player", "threatFrom": "creditor" } ],
      "onComplete": { "ifFlag": "creditorEscalatedToFeud", "escalate": true, "nextBeat": "beat_settled" },
      "fallbackNextBeat": "beat_settled"
    },
    { "id": "beat_settled", "role": "aftermath", "defaultTasks": [], "nextBeat": null }
  ]
}
```

*To settle:*
- The creditor's death: `resolveObligationWaived` when there is no one to inherit, but by the
  rule decided earlier a brother or a widow inherits the debt (Reassign) when there is.
- The Protect task with the player as its target is the new Survive or endure type: the wanderer
  living through the creditor's men (or the law) for a time.
- When the feud flag escalates the quest to a Story, `nextBeat` is still `beat_settled`; the
  template needs the feud's beats (or names another template, a feud, to hand over to).
- `debt.clearanceToken` needs a meaning: a sealed note, a returned pledge, or the third party's
  word, carried back.
- `payInFull` must be offered only when the wanderer can pay; a part payment could lead to
  `negotiateTerms`.

**3. What lingers in the hollow** (a curse or haunting). From the world's curses
(`nature/curses.ts`) and the people of the place: clues, someone who knows the curse's history,
and its lifting.

```json
{
  "id": "tpl_curse_lifting",
  "baseLevel": "chapter",
  "escalatesTo": "story",
  "escalationChance": 0.2,
  "worldPreconditions": ["hasActiveWorldCurse", "curseAffectsSettlement"],
  "roles": {
    "curse": { "source": "worldCurse", "onMissing": "closeOvertaken" },
    "petitioner": { "source": "resident", "inSettlement": "curse.location", "onMissing": "reassign" },
    "loreKeeper": { "source": "residentOrScholar", "knows": "curse.origin", "onMissing": "pivotToSearch" },
    "relic": { "source": "itemOrSite", "linkedTo": "curse.liftingCondition" }
  },
  "beats": [
    {
      "id": "beat_symptom", "role": "hook",
      "defaultTasks": [
        { "type": "Talk", "targetRole": "petitioner", "goal": "learnCurseEffects" },
        { "type": "Investigate", "targetRole": "curse.location", "goal": "observeManifestation" }
      ],
      "nextBeat": "beat_lore"
    },
    {
      "id": "beat_lore", "role": "investigate",
      "defaultTasks": [ { "type": "Talk", "targetRole": "loreKeeper", "goal": "uncoverLiftingCondition" } ],
      "nextBeat": "beat_ritual_prep"
    },
    {
      "id": "beat_ritual_prep", "role": "complication",
      "defaultTasks": [ { "type": "Retrieve", "targetRole": "relic", "optional": true } ],
      "nextBeat": "beat_lift"
    },
    {
      "id": "beat_lift", "role": "confrontation",
      "defaultTasks": [ { "type": "Lift", "targetRole": "curse", "condition": "curse.liftingCondition" } ],
      "nextBeat": "beat_aftermath"
    },
    {
      "id": "beat_aftermath", "role": "aftermath",
      "defaultTasks": [ { "type": "Talk", "targetRole": "petitioner", "outcome": "reportCurseLifted" } ],
      "nextBeat": null
    }
  ]
}
```

*To settle:*
- The curses' ways of lifting are phrases at present ("lifted by returning ..."), not conditions
  the engine can check. Each needs a checkable form (a thing taken to a place, a rite performed, a
  wrong put right) for the Lift task, and the `relic` role to be filled from it.
- `relic` has no policy if missing, and is needed only by some lifting conditions; it could be
  optional, made only when the condition names one.
- `pivotToSearch` for the `loreKeeper` fits the rule on leads: with no one alive who knows, the
  player searches records, a grave or a ruin, and a lead that comes to nothing says so.
- What the Story it can grow into holds (the one who laid the curse, still living?) is not given.

**4. Ash on the trade road** (a Big Bad's campaign). A Story or Epic of several Chapters, driven
by a Big Bad's clock and by rivals on their own schedules.

```json
{
  "id": "tpl_big_bad_campaign",
  "baseLevel": "story",
  "escalatesTo": "epic",
  "escalationChance": 0.5,
  "worldPreconditions": ["hasActiveBigBad", "bigBadClockStageGreaterThanZero"],
  "roles": {
    "bigBad": { "source": "bigBadEntity", "onMissing": "closeOvertakenByRivalOrEvent" },
    "informant": { "source": "residentOrScout", "near": "bigBad.frontier", "onMissing": "reassign" },
    "rival": { "source": "rivalActor", "targeting": "bigBad", "optional": true },
    "stronghold": { "source": "dungeonOrRegion", "controlledBy": "bigBad" }
  },
  "beats": [
    {
      "id": "beat_rumor_and_road", "role": "hook",
      "defaultTasks": [
        { "type": "Investigate", "targetRole": "informant", "goal": "mapBigBadAdvances" },
        { "type": "Escort", "targetRole": "refugeesOrSupplies", "optional": true }
      ],
      "nextBeat": "beat_rival_intersection"
    },
    {
      "id": "beat_rival_intersection", "role": "complication",
      "defaultTasks": [ { "type": "Talk", "targetRole": "rival", "options": ["ally", "compete", "sabotage"] } ],
      "nextBeat": "beat_breach"
    },
    {
      "id": "beat_breach", "role": "confrontation",
      "defaultTasks": [
        { "type": "Explore", "targetRole": "stronghold", "goal": "reachInnerSanctum" },
        { "type": "Defeat", "targetRole": "bigBad" }
      ],
      "nextBeat": "beat_aftermath"
    },
    {
      "id": "beat_aftermath", "role": "aftermath",
      "defaultTasks": [ { "type": "Deliver", "targetRole": "authorityOrFaction", "goal": "confirmThreatEnded" } ],
      "nextBeat": null
    }
  ]
}
```

*To settle:*
- `refugeesOrSupplies` and `authorityOrFaction` are used as roles but not declared among them.
- `rival` is optional, yet `beat_rival_intersection` needs one; the beat should be skipped (or a
  rival heard of, not met) when there is none.
- What growth into an Epic holds is not given (no beat carries an escalation rule).
- Big Bads, their clocks and rivals do not exist in the game yet; this template waits on them.

### Settling the template format

Proposed, to agree before the first template is built:

- **Two policies for a role,** not one: what to do if it cannot be filled when the quest is made
  (`onMissing`: abort, or leave it out if optional), and what to do if it stops being valid later
  (`onInvalidated`: reassign, pivot or overtaken), since a quest that has begun should not simply
  vanish.
- **One list of names:** the policies (`abort`, `reassign`, `pivotToInvestigate`,
  `pivotToSearch`, `closeOvertaken`, `resolveObligationWaived`), the world preconditions, the
  sources of roles and the goals and outcomes of tasks are each a fixed list, checked when the
  templates are loaded, so a mistyped name fails a test rather than a quest in play.
- **Every role a beat uses is declared,** and every beat a branch or flag names exists; every
  sequence reaches an aftermath, and every optional role's beats can be skipped.
- **An aftermath with no one left** (the giver dead, the curse's petitioner gone) closes with a
  journal entry rather than a Talk to no one.
- **In the code,** the templates are typed data (TypeScript, as the generator's other tables are),
  written as above, so the compiler checks their shape as well as the load-time checks.

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
- **Tiers** by how it was done. **Decided (25 November 2026):** four marks, kept as the task is
  done, judge every task, rather than a scoring of its own for each:
  - **Fast:** done in under half the time allowed (or, with no deadline, under a fair time set for
    the task).
  - **Clean:** no one killed or hurt who was not meant to be, no alarm raised, nothing damaged.
  - **Thorough:** the optional parts done (clues found, more brought than was asked, a second aim
    met).
  - **Secret:** done unseen, with no witness and no suspicion on the wanderer.

  Each task type names the marks that count for it (stealing counts Clean and Secret; a rescue
  counts Fast and Clean). Each mark met raises the reward a tier, as far as the giver can pay.
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
- **Big Bads are rare.** **Decided (25 November 2026):** one or two at work in a world at a time,
  and only one of them growing near the player. Two make for a world under strain (a necromancer
  rising in the east while a trade war chokes the west); one close at hand keeps the player from
  facing several clocks of doom at once.

## The storyteller

**Proposed.** As in RimWorld, a storyteller paces what reaches the player:

- **It watches** how the player is living (homesteading, travelling, trading, fighting), how
  long since the last trouble, and how they are faring.
- **It chooses which premises surface** near the player and when: quiet stretches and troubles in
  turn, more personal quests for a settled life, more dangerous ones for an adventurer.
- **It never invents** what the world cannot support: every quest still has a source in the
  world's state.
- **How many at once. Decided (25 November 2026):**
  - **Three to five premises open** about a settlement or region: enough for a real choice (one
    safe and ordinary, one risky bounty, one strange lead) without making the town a board of
    notices.
  - **Two to four personal obligations at the start,** from the ties made in character creation,
    so the player has friction and a direction before speaking to anyone.

## Quests the player gives

**Decided (25 November 2026).** The player can give quests as well as take them: the quest giver
role turned about.

- **Posting a contract:** the player makes a task (retrieve iron ore, protect my homestead, clear
  the goblin lair), sets a reward from their own purse or goods, held back until it is done, and
  posts it at a tavern or a guild.
- **Who takes it:** the rival adventurers, with the same clocks as against a Big Bad. They roll
  their skills over time and come back with the goods (and claim the reward), fail or die (a new
  premise for the player: rescue them, or recover what they carried), or run off with what was paid
  in advance (a premise to bring them to account, or recover it).
- This is the first step into management (hirelings, a household, a company), which follows from
  it later.

## The quest engine, as built (stages Q2 and Q2b, 27 November 2026)

Built in `apps/game/src/game/quests.ts` (the engine), `game/quests/model.ts` (the shape of a
quest) and `game/quests/templates.ts` (the templates as typed data); tested by `quest-test.ts`.

**The shape.** A quest has a level (Task to Epic), a giver, roles bound from the world, flags, a
deadline or a fair time, a reward, plain facts, and its parts. A part is one beat of its template,
made only when the wanderer reaches it, with one to three tasks; the parts of a Job are its steps,
the parts of a Chapter are Jobs, and so on up. The parts not yet reached do not exist, so the
length of a quest is hidden even from the game until it is decided.

**Templates as data.** Each template names its premise (where it is posted or who asks it, and what
the world must hold), its roles (each with where it comes from, `onMissing`, and `onInvalidated`),
its beats (each with its tasks, the next beat, branches by how a talk went, a flag that turns it
and grows the quest a level, a fallback, and the roles it needs), its clocks, and its reward. The
names are fixed lists, and `checkTemplates` checks every template when the tests run: an unknown
name, an undeclared role, a beat named that does not exist, a beat that cannot be reached, a way
through that does not end in an aftermath, a beat needing an optional role without a fallback, or a
task type the engine cannot yet check, each fails the test.

**Task types checked:** Collect (things carried, handed over to the role named), Retrieve (beasts
or a thing found, brought, and handed over), Deliver (a thing given into the wanderer's hands,
handed to a person, or to anyone at an inn, tavern, market, hall or guild of a town), Explore (a
place reached, or leads followed), Investigate (clues found by a check, every half hour at the
place, until enough), Defeat (so many of a kind killed once the part has begun, dying of wounds
dealt counting too), Talk (with a person, or at a place, with options that branch), and Survive (so
long lived through). The others in the table (Make, Escort, Perform, Work, Protect, Sabotage,
Rescue, Lift, Dispose) are named but not yet checked, so no template can use them yet.

**Keeping quests whole.** Roles are checked each turn and so also on loading. A person dead is
replaced by their household (Reassign; the giver's household is noted when the quest is made), or
the quest closes (Overtaken), or a debt with no one left to claim it is waived. A role marked Pivot
turns its task into what can still be done (beasts found dead: telling the giver their fate, for
half the pay). A beat whose needed roles are missing takes its fallback. Leads may be wrong, but a
false one gives a clue there that rules it out, and the journal shows it followed to its end.

**Escalation and clocks.** A template's escalation chance is rolled when the quest is made (seeded),
deciding whether a deeper cause exists; the flag that turns the quest onto the deeper beats is set
only when the wanderer finds its sign. A clock changes the world while the wanderer is at work (the
herd's beasts, left four days with a predator about, are dead).

**Marks and pay.** Fast (done in under half the time allowed, or the fair time), Clean (no crime,
seen or unseen, while it was in hand), and Thorough (every optional task and clue done) count where
the task types allow, and each raises the pay a quarter, as far as the giver's means allow (a poor
giver a quarter at most, a rich one double, a place three quarters). Secret is named but not yet
judged (it needs the witnesses of a deed done for a quest).

**The templates so far.**

- **Seven single-step jobs** (stage Q2), posted by a town's places and asked by its people: game, fish, hides or
  pelts of a regional beast, herbs, a bounty on a regional predator (the hunt, then the claim), a
  letter to a town within 40 km, and a ruin within 15 km looked into (going, then the report).
- **The missing herd** (template 1, settled as proposed in its notes): asked by those who keep
  beasts. A trail with a sure lead and a neighbour's wrong one (Tracking or Survival, the better,
  for the clue); the beasts found, rounded up (Animal handling, half an hour) and driven home, with
  the culprit killed if the wanderer can (optional, for Thorough). A deeper cause (35 in 100) turns
  it into a Chapter when its sign is found: what lairs at the nearby ruin found out, two of the
  culprits killed, the beasts brought home. Left four days with a culprit about, they are dead.
- **The creditor's terms** (template 2, settled as proposed): started by an obligation (stage Q3
  makes these from character creation). Pay in full (only with the coin), ask what else would clear
  it (a sealed note carried to the creditor's agent in a nearby town, then told), or refuse (three
  days lived through; a feud may grow it to a Story, whose own beats are a later template).
- **What lingers in the hollow** and **Ash on the trade road** (templates 3 and 4) wait on the
  curses' lifting conditions in a checkable form, and on Big Bads and rivals.

**Notice boards** (from play, 27 November 2026) stand in every lived-in village, town and city:
beside the well or fountain nearest the middle, and in a town or city beside its other wells and
fountains too (up to three), on open ground clear of the buildings and the streets (core
`towns/manager.ts`, a `notice_board` point on the plan; a `notice_board` object on the local map,
which raised the local map's version to 11). On foot, the skill menu at a board reads it; in the city
view, "Read the notice board" is offered at the places within 80 m of one. Every board in a
settlement shows its notices.

**Written in the town's language.** Each notice is written in the language of the settlement's
people and drawn in its script (core `lang/script.ts`; `game/writing.ts`). The wanderer reads it by
how well they read that language: 25 and over (a plain notice needs no scholar; a literate native
reads it), all of it; 10 to 24, the words they know; less, only the letters, and it cannot be taken up. Speaking the language is not enough. One
who cannot read at all cannot use the boards. Reading a notice takes a minute and teaches a little
of the language's writing.

**What the player sees.** Notice boards (three to five notices a week, from the town's own places)
and "Is there any work going?" in a talk; what can be said or handed over for a quest appears in
talks and at places in the city view; rounding up beasts appears in the skill menu where they are
found. The journal (Shift+Q) shows the work in hand and behind, its level, the part under way and
what is left to do in it, the leads and what was found at them, the marks it was done with, and
what has happened, told in the first person from the facts.

**Not yet built:** the storyteller's pacing, Big Bads and their clocks, rivals, contracts the
player posts, the four other task types' checks, and a grammar of telling chosen by the character's
traits (the facts are kept apart from the telling, so it can come later).

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

The four questions first asked here were answered on 25 November 2026 (the task types, judging
performance, how many quests and Big Bads, and quests the player gives; above). Still open:

- **The fair time for a task with no deadline** (for the Fast mark): by the type and the distance,
  or by the giver's expectation.
- **Rivals off the map:** how far a rival adventurer is simulated (a clock and rolls, as proposed,
  or a person who can be met on the road and followed), which the contracts rely on as much as
  the Big Bads do.
- **The order of building:** the journal and the task log of personal obligations first (they
  need only the ties made at creation and a few task types), then premises and templates, then Big
  Bads, rivals and contracts.
