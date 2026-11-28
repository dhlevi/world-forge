/**
 * The shape of a quest (docs/design/quests.md, Structure; stage Q2b): the levels, the task types
 * and what the engine checks for each, the roles a quest binds from the world, the parts made as
 * the wanderer reaches them, and the plain facts its journal is told from. Saved with the game.
 */

/** The five levels, smallest first. */
export type Level = 'task' | 'job' | 'chapter' | 'story' | 'epic';
export const LEVELS: readonly Level[] = ['task', 'job', 'chapter', 'story', 'epic'];
/** The level of the parts a quest of a level is made of (a Chapter's parts are Jobs; a Job's are its steps). */
export const partLevel = (l: Level): Level => (l === 'job' || l === 'task' ? 'task' : LEVELS[LEVELS.indexOf(l) - 1]);
/** The level above (for escalation), or the same at the top. */
export const levelAbove = (l: Level): Level => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(l) + 1)];

/** Every task type of the design's table (quests.md, A task), one check each. */
export type TaskType =
  | 'collect' | 'retrieve' | 'make' | 'deliver' | 'escort' | 'explore' | 'talk' | 'perform' | 'work'
  | 'defeat' | 'protect' | 'sabotage' | 'rescue' | 'survive' | 'investigate' | 'lift' | 'dispose';
export const TASK_TYPES: readonly TaskType[] = ['collect', 'retrieve', 'make', 'deliver', 'escort', 'explore', 'talk', 'perform', 'work', 'defeat', 'protect', 'sabotage', 'rescue', 'survive', 'investigate', 'lift', 'dispose'];
/** The types the engine can check so far; a template using another fails the load-time check. */
export const BUILT_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(['collect', 'retrieve', 'deliver', 'explore', 'talk', 'defeat', 'survive', 'investigate']);

/** The four marks of how a task was done (quests.md, Rewards). */
export type Mark = 'fast' | 'clean' | 'thorough' | 'secret';
/** The marks that count for each type. */
export const TYPE_MARKS: Record<TaskType, Mark[]> = {
  collect: ['fast', 'thorough'], retrieve: ['fast', 'clean', 'secret'], make: ['thorough'], deliver: ['fast', 'secret'], escort: ['fast', 'clean'],
  explore: ['fast', 'thorough'], talk: ['clean'], perform: ['thorough'], work: ['thorough'], defeat: ['fast', 'clean'], protect: ['clean'],
  sabotage: ['clean', 'secret'], rescue: ['fast', 'clean'], survive: ['clean'], investigate: ['thorough', 'secret'], lift: ['clean'], dispose: ['clean', 'secret'],
};

/** What fills a role: a person, a place of a town, a settlement, a lair or ruin, beasts, an obligation. */
export interface RoleRef {
  kind: 'person' | 'place' | 'site' | 'lair' | 'beasts' | 'species' | 'debt';
  id: string;
  /** A person's trade ("farmer"), a place's or site's name, a species' name. */
  name: string;
  /** A person's given name. */
  given?: string;
  placeId?: string;
  siteId?: string | null;
  siteName?: string;
  lon?: number;
  lat?: number;
  /** Beasts: their kind and how many; a debt: its amount (copper). */
  species?: string;
  count?: number;
  /** A person's means (for what they can pay). */
  means?: string;
  /** Beasts: alive and astray, found, driven by the wanderer, or dead. */
  state?: 'astray' | 'found' | 'driven' | 'dead' | 'delivered';
  /** Those who would take a person's role if they died (their household), by id, name and given name. */
  heirs?: { id: string; name: string; given: string }[];
  /** The one who held the role before it passed on. */
  was?: string;
}

/** The given name of a person, or the name of anything else (for the telling). */
export const whoOf = (r: RoleRef | null | undefined): string => (!r ? 'someone' : r.kind === 'person' ? r.given ?? r.name : r.name);

/** A lead: a place to look, which may be wrong, but never ends on nothing (quests.md, Keeping quests whole). */
export interface Lead {
  text: string;
  lon: number;
  lat: number;
  radiusM: number;
  /** Where it really leads (true), or a lead that a clue there rules out. */
  sure: boolean;
  followed?: boolean;
  /** What was found there, once followed. */
  found?: string;
}

export interface QTask {
  id: string;
  type: TaskType;
  /** The role it is about (its target), if any. */
  role?: string;
  /** What is wanted, in words. */
  label: string;
  optional?: boolean;
  /** Collect: so many of an item (a pattern on item ids), and how many so far; Defeat: so many of a kind killed. */
  match?: string;
  count?: number;
  got?: number;
  species?: string[];
  /** Explore or deliver: a place to reach, or a settlement (and its id) to hand something over in. */
  lon?: number;
  lat?: number;
  radiusM?: number;
  siteId?: string;
  /** To whom (a role) things are brought or handed. */
  deliverTo?: string;
  /** A thing the quest gave into the wanderer's hands (its item's id), to carry and hand over. */
  item?: string;
  /** Talk: the ways it can go, and the way it went. */
  options?: { id: string; label: string; needsCopper?: number }[];
  outcome?: string;
  /** Explore or investigate: leads to follow, and the clue check made at a sure one (the better skill). */
  leads?: Lead[];
  clue?: { skills: string[]; dc: number; flag?: string; need?: number };
  score?: number;
  /** Survive: how long, from when. */
  seconds?: number;
  since?: number;
  /** A type it becomes if its role stops being valid (Pivot), and the words then. */
  pivot?: { type: TaskType; label: string };
  done?: boolean;
  failed?: boolean;
}

/** A part made as the wanderer reaches it: one beat of the story, a Job of a Chapter or the steps of a Job. */
export interface Part {
  beat: string;
  level: Level;
  title: string;
  tasks: QTask[];
  state: 'active' | 'done' | 'skipped';
  outcome?: string;
  began: number;
  ended?: number;
}

export type QuestState = 'offered' | 'active' | 'done' | 'failed' | 'expired' | 'overtaken' | 'waived';

/** A fact of a quest (who did what, how much, and why), told in words when shown. */
export interface Fact {
  t: number;
  act: string;
  who?: string;
  what?: string;
  where?: string;
  n?: number;
  of?: number;
  pay?: number;
  why?: string;
}

export interface Quest {
  id: string;
  template: string;
  level: Level;
  title: string;
  /** The notice's or the giver's words. */
  text: string;
  giver: RoleRef;
  roles: Record<string, RoleRef | null>;
  parts: Part[];
  /** The beat now under way (null once ended). */
  beat: string | null;
  flags: string[];
  state: QuestState;
  posted: number;
  took?: number;
  deadline?: number;
  /** Fair time for the Fast mark when there is no deadline (s). */
  fair?: number;
  reward: { copper: number; regard: number };
  /** Marks spoilt along the way (Clean, Secret), and marks met at the end. */
  spoilt: Mark[];
  marks?: Mark[];
  facts: Fact[];
  /** The seed it was made from (for the parts made later). */
  seed: number;
  /** The quest's number ({n}), and whether it has a deeper cause (rolled when made). */
  n: number;
  deep: boolean;
  /** The words its text and parts are filled with (names, distances, directions). */
  words: Record<string, string>;
}

export interface QuestsData {
  list: Quest[];
}
