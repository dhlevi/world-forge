# Architecture

How the code is laid out, which parts may use which, and where new work goes. The design of the
game itself (what it should do and why) is in [design/](design/); this document is about the code
that carries it out. The README describes what each feature does, and [backlog.md](backlog.md)
what is to be built or fixed next.

## The packages

The repository is four npm workspaces.

| Workspace | Path | What it is |
|---|---|---|
| `@worldforge/core` | `packages/core` | The generator: the planet, its climate, peoples, realms, settlements and roads, town plans, the local map's chunks, the people of the plans, lore and names. Runs anywhere (browser, worker, Node) and has no DOM or Node types. Deterministic: the same seed always gives the same world, checked by its fingerprint. |
| `@worldforge/atlas` | `apps/atlas` | The world viewer (MapLibre): the globe, the fantasy map, towns and buildings. |
| `@worldforge/game` | `apps/game` | The game (Vue 3, PixiJS): character creation, the local and travel maps, the wanderer, the people and animals of the bubble. |
| `@worldforge/desktop` | `apps/desktop` | The game in an Electron window, with saves on disk. |

The core never imports from an app. The apps import the core by its package name.

## The game: two threads

- **The worker** (`src/worker/game.worker.ts`) holds the generated world. It makes the local map's
  chunks, routes on the travel map, the residents and robbers of the bubble, the animals, and what
  character creation needs. It is reached only through messages, whose shapes are in
  `src/worker/protocol.ts`, by `src/app/worker-client.ts`.
- **The main thread** runs the screens (Vue), draws the map (PixiJS) and plays the game: the
  session (`src/game/session.ts`) and everything it works with.

The worker returns plain data, and the same request always gives the same answer for the same
world, place and time. What the player changes (things moved, doors opened, the dead) is kept on
the main thread and saved; the world itself is never saved.

## The game's folders and their layers

Each folder may use the folders below it and never those above. `npm run typecheck` enforces this
for value imports (`tools/check-cycles.mjs`, which also forbids import cycles). Type-only imports
are free.

| Layer | Folder | What belongs there | May not import |
|---|---|---|---|
| 1 | `util.ts` | Tiny helpers with no dependencies (`clamp`, `cap`, `cheb`, `pickOf`, compass words). | anything |
| 1 | `engine/` | The screen stack and the message bus. | anything above |
| 2 | `actors/` | Actors and their components: identity, body, skills, traits, needs, health, mood, inventory and items, checks, character creation, the figure an actor is drawn as. | rules, world, worker, game, screens |
| 3 | `rules/` | Pure rules that work on actors and items: a blow (`combat.ts`), a shot (`ranged.ts`), treating wounds, everyday tasks, the bestiary's fighters, where robber bands camp. No state of their own. | world, worker, game, screens |
| 4 | `world/` | The simulated world about the wanderer: the people of the bubble and their days, paths, senses, opinions, talk, fights among people, the law's record, animals, hunting. | game, screens, components, app |
| 4 | `worker/` | The worker thread and what it computes. | world, engine, game, screens |
| 5 | `game/` | The game being played: the session and its parts, the map, travel, camps, weather, saving, drawing. | screens, components |
| 6 | `screens/`, `components/`, `app/` | Screens and their views, the play view, the app's start-up and wiring. | nothing (top) |

When two modules on one layer both need something, it goes into a module of its own, lower down.

## The session

`PlaySession` (`src/game/session.ts`) is a game being played. It owns the game's state: the
wanderer and the cast, the map, the people and animals of the bubble, the fights among people
(`world/strife.ts`), the law's record (`world/law.ts`), the weather, the HUD and the log. It runs
what happens as time passes (`tick`), and it saves.

Its larger concerns are modules of their own that work on its state:

- `game/fights.ts`: the wanderer's blows at beasts and people and those taken from them, yielding,
  and shooting and throwing.
- `game/justice.ts`: people struck, dead and at the wanderer's mercy; crimes, witnesses, the watch,
  arrest and sentence; robbery; ambushes on the road.
- `game/practice.ts`: skills put to use on the map and the road.
- `game/camp.ts` and `game/camping/`: camps and the night.

Screens reach these through the session (`session.fights.attack(...)`,
`session.justice.mercy(...)`). A new concern of more than a few methods gets a module of its own
in the same way, rather than a new section in `session.ts`.

The session has two seams, so that it can run in Node without a browser:

- `SessionWorld`: the worker (chunks, routes, people, animals, names). Tests pass stand-ins.
- `SessionHost`: the screens (opening a city, the title, death, the mercy screen).

`scripts/session-test.ts` and `scripts/justice-test.ts` play sessions this way.

## Time and order

Everything runs in game seconds. After each of the wanderer's actions (and each step of a journey),
`Game` calls `session.tick(t)`, which brings the rest up to that time in a fixed order:

1. the people of the bubble live their day (`world/population.ts`);
2. those in fights act, at most twice per action of the wanderer (`world/strife.ts`);
3. the watch who know a wanted face, and any watch sent for (`game/justice.ts`);
4. the animals and the snares (`world/fauna.ts`, `world/hunting.ts`);
5. fires, the air, the wanderer's needs and body, the weather in the log, torches, practice;
6. health: notes, fainting and death.

## Determinism

The same world, place and time always give the same people, animals and robber bands; their random
numbers come from `hashString` of their ids and the time (`mulberry32`). The game's own dice
(`game.dice`) are saved with the game, so a save carried on twice rolls the same.

## Saving

`game/save.ts` writes only what the player has changed or learnt. Its version is `SAVE_VERSION`;
`game/migrate.ts` brings older saves up to date, step by step, and each step has a fixture in
`scripts/fixtures/` that `scripts/save-test.ts` loads. A new field that older saves lack is
optional and given its default when read.

## Tests

Each system has a script in `apps/game/scripts/` (`*-test.ts`), run in order by `npm test`, which
ends with the core's fingerprint. A new system adds its script to the chain in
`apps/game/package.json`. Scripts print one line per check and exit non-zero on a failure.

## Adding a stage or feature

1. Agree the design in `docs/design/` (decisions are marked Decided).
2. Put pure rules in `rules/`, the world's behaviour in `world/`, what the worker computes in
   `worker/` (with its messages in `protocol.ts`), and the wanderer's side in a module of `game/`
   wired into the session.
3. Put a screen in `screens/` with its view in `screens/views/`, and its key in the Keys screen.
4. If the save changes, add a migration step and a fixture.
5. Add a test script, and run `npm run typecheck`, `npx eslint .` and `npm test`.
6. Record what was built, with its decisions and numbers, in the design document, and add it to
   the README.

## Writing

Documents, doc comments and every text the game shows are in formal English and the active voice,
with no em dashes, contractions, slang or emojis. Doc comments say what a thing is and why, with a
reference to the design document it carries out. Numbers still to be tuned in play are marked
"Proposed numbers".

## Known debts

- `game/session.ts` (about 1,350 lines) still holds the wanderer's body and rest (fainting,
  collapse, sleep), talk and the senses. These could become modules in the same way as fights and
  justice.
- `world/population.ts` (about 1,000 lines) holds both the people's days and the movement that
  fights need (chasing, summoning, stepping aside).
- The README describes features in long paragraphs; the code's layout is here.
