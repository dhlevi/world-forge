/**
 * Story templates as typed data (docs/design/quests.md, Story templates; stage Q2b). Each turns a
 * premise taken from the world, and the roles bound to it, into beats; each beat becomes a part
 * (a Job of a Chapter, or the steps of a Job) with one to three tasks, made only when the wanderer
 * reaches it. The names a template may use (task types, role sources, policies, preconditions,
 * beat kinds) are fixed lists, and `checkTemplates` checks every template against them and against
 * itself when the game starts and in the tests: a mistyped name fails a test, not a quest in play.
 *
 * Words in a template's text are filled in when it is made: {giver}, {n}, {days}, a role's name
 * ({prey}, {town}), and a verb for the giver as {s:wants|want} (a notice's place, or a person's
 * own "I").
 */
import { BUILT_TYPES, TASK_TYPES, type Level, type TaskType } from './model';

/** Where a role is taken from in the world. */
export type RoleSource =
  | 'giver' | 'regionPredator' | 'regionHide' | 'nearTown' | 'nearLair' | 'giverBeasts' | 'deepLair'
  | 'obligationParty' | 'obligationRecord' | 'obligationKin';
export const ROLE_SOURCES: readonly RoleSource[] = ['giver', 'regionPredator', 'regionHide', 'nearTown', 'nearLair', 'giverBeasts', 'deepLair', 'obligationParty', 'obligationRecord', 'obligationKin'];

/** What to do if a role cannot be filled when the quest is made. */
export type OnMissing = 'abort' | 'skip';
/** What to do if a role stops being valid once begun (quests.md, Keeping quests whole). */
export type OnInvalidated = 'reassign' | 'pivot' | 'overtaken' | 'waive' | 'ignore';
export const ON_MISSING: readonly OnMissing[] = ['abort', 'skip'];
export const ON_INVALIDATED: readonly OnInvalidated[] = ['reassign', 'pivot', 'overtaken', 'waive', 'ignore'];

/** What must hold in the world for a template to be offered. */
export type Precondition = 'country.predator' | 'country.hide' | 'country.town' | 'country.lair' | 'giver.keepsBeasts' | 'obligation';
export const PRECONDITIONS: readonly Precondition[] = ['country.predator', 'country.hide', 'country.town', 'country.lair', 'giver.keepsBeasts', 'obligation'];

export type BeatKind = 'hook' | 'investigate' | 'complication' | 'confrontation' | 'aftermath';
export const BEAT_KINDS: readonly BeatKind[] = ['hook', 'investigate', 'complication', 'confrontation', 'aftermath'];

export interface RoleSpec {
  source: RoleSource;
  optional?: boolean;
  onMissing: OnMissing;
  onInvalidated: OnInvalidated;
}

export interface TaskSpec {
  type: TaskType;
  /** The role it is about. */
  role?: string;
  label: string;
  optional?: boolean;
  /** Made only if this role was filled. */
  when?: string;
  /** Collect: a pattern on item ids ({hide} is the prey's hide); and how many ('n' the quest's number, 'prey' by the prey's size). */
  match?: string;
  count?: number | 'n' | 'prey';
  /** To whom (a role) it is handed. */
  deliverTo?: string;
  /** A thing given into the wanderer's hands to carry (an item id, and its name). */
  item?: { def: string; name: string };
  /**
   * Talk: the ways it can go. An option may need coin (the debt) or a role filled, be tried with a
   * skill (failing, its outcome is "<id>:fail"), give coin (a number, or 'amount': the obligation's),
   * and change how the one talked to regards the wanderer.
   */
  options?: { id: string; label: string; needs?: 'debt' | string; check?: { skill: string; dc: number }; gain?: number | 'amount'; regard?: number }[];
  /** Explore or investigate: leads at the role's place ('role'), or a trail with a false lead besides ('trail'). */
  leads?: 'role' | 'trail';
  clue?: { skills: string[]; dc: number; flag?: string; need?: number };
  /** Survive: for how many hours. */
  hours?: number;
  /** A flag set when done, if the quest has a deeper cause. */
  flagOnDone?: string;
  /** What it becomes if its role stops being valid. */
  pivot?: { type: TaskType; label: string };
}

export interface BeatSpec {
  id: string;
  kind: BeatKind;
  title: string;
  level?: Level;
  tasks: TaskSpec[];
  /** The next beat (null: the quest ends here). */
  next?: string | null;
  /** The next beat by how a talk ended. */
  branches?: Record<string, string>;
  /** The next beat if a flag is set as it ends, and whether the quest grows a level. */
  onComplete?: { ifFlag: string; escalate?: boolean; next: string };
  /** The beat taken when this one cannot be made (a role it needs is missing or no longer valid). */
  fallback?: string;
  /** Roles it needs. */
  needs?: string[];
}

export interface Template {
  id: string;
  title: string;
  /** The notice's or the asker's words. */
  text: string;
  baseLevel: Level;
  escalatesTo?: Level;
  /** The chance (rolled when the quest is made) of a deeper cause, which the deeper beats need. */
  escalationChance?: number;
  preconditions: Precondition[];
  roles: Record<string, RoleSpec>;
  beats: BeatSpec[];
  start: string;
  /** Days allowed (none: no deadline), and a fair time for the Fast mark without one. */
  days?: number;
  fairDays?: number;
  /** The quest's number ({n}): from min to max. */
  n?: [number, number];
  /** Pay: a base, so much for each of n, each km to the town, each by the prey's size; regard won. */
  reward: { base: number; perN?: number; perKm?: number; perPrey?: boolean; regard: number; ifFlag?: { flag: string; factor: number } };
  /** Places that post it (their role or kind, a pattern), and trades that ask it. */
  posts?: string;
  asks?: string;
  /** Days until something is due (a debt), from when it was taken (an obligation may set its own). */
  dueDays?: number;
  /**
   * Changes to the world on a clock, counted from when it was taken (or from when it is due): a
   * role's state, or an effect (a debt's interest, the creditor's men, the law).
   */
  clocks?: { days: number; flag: string; role?: string; state?: 'dead'; ifRole?: string; whileState?: string; fromDue?: boolean; effect?: 'interest' | 'dun' | 'law' }[];
}

const GIVER: RoleSpec = { source: 'giver', onMissing: 'abort', onInvalidated: 'overtaken' };
const PAID: BeatSpec = { id: 'paid', kind: 'aftermath', title: 'Paid', tasks: [], next: null };

/** The single-step jobs of a town's notice boards and its people (stage Q2), as templates. */
const JOBS: Template[] = [
  {
    id: 'job_game', title: 'Game for the table', text: '{giver} will pay for fresh game: {n} cuts of raw meat, or a carcass, within {days} days.',
    baseLevel: 'job', preconditions: [], roles: { giver: GIVER }, start: 'bring', days: 4, n: [3, 6], reward: { base: 0, perN: 4, regard: 5 },
    posts: '^(butcher|inn|tavern)$', asks: 'innkeeper|tapster|cook|alewife|butcher',
    beats: [{ id: 'bring', kind: 'hook', title: 'Game for the table', tasks: [{ type: 'collect', label: '{n} cuts of raw meat (a carcass counts for three)', match: '^(raw_meat|carcass)$', count: 'n', deliverTo: 'giver' }], next: 'paid' }, PAID],
  },
  {
    id: 'job_fish', title: 'Fresh fish wanted', text: '{giver} {s:wants|want} {n} fresh fish for the kitchen, within {days} days.',
    baseLevel: 'job', preconditions: [], roles: { giver: GIVER }, start: 'bring', days: 3, n: [3, 6], reward: { base: 0, perN: 3, regard: 5 },
    posts: '^(inn|tavern|chandlery|countinghouse|guildhall|guild:.*)$', asks: 'innkeeper|tapster|cook|alewife',
    beats: [{ id: 'bring', kind: 'hook', title: 'Fresh fish', tasks: [{ type: 'collect', label: '{n} fresh fish', match: '^(fish|gutted)_(?!guts$|spear$)', count: 'n', deliverTo: 'giver' }], next: 'paid' }, PAID],
  },
  {
    id: 'job_pelts', title: '{Prey} {hides} wanted', text: '{giver} will buy {n} {prey} {hides}, of any quality, within {days} days.',
    baseLevel: 'job', preconditions: ['country.hide'], roles: { giver: GIVER, prey: { source: 'regionHide', onMissing: 'abort', onInvalidated: 'ignore' } }, start: 'bring', days: 14, n: [2, 4],
    reward: { base: 0, perN: 10, regard: 5 }, posts: '^(butcher|tailor|pawnshop)$', asks: 'hunter|trapper|furrier|tanner|tailor',
    beats: [{ id: 'bring', kind: 'hook', title: 'Hides', tasks: [{ type: 'collect', role: 'prey', label: '{n} {prey} {hides}', match: '^{hide}$', count: 'n', deliverTo: 'giver' }], next: 'paid' }, PAID],
  },
  {
    id: 'job_herbs', title: 'Herbs wanted', text: '{giver} {s:needs|need} {n} bundles of healing herbs, gathered in the country about, within {days} days.',
    baseLevel: 'job', preconditions: [], roles: { giver: GIVER }, start: 'bring', days: 10, n: [3, 6], reward: { base: 0, perN: 5, regard: 5 },
    posts: '^(apothecary|temple|shrine|bakery)$', asks: 'herbalist|apothecary|physician|wise woman|midwife',
    beats: [{ id: 'bring', kind: 'hook', title: 'Herbs', tasks: [{ type: 'collect', label: '{n} bundles of healing herbs', match: '^herbs$', count: 'n', deliverTo: 'giver' }], next: 'paid' }, PAID],
  },
  {
    id: 'job_bounty', title: 'A bounty on {preys}', text: '{troubled} been taking from the flocks. {Giver} {s:offers|offer} a bounty for {them}, killed within {days} days.',
    baseLevel: 'job', preconditions: ['country.predator'], roles: { giver: GIVER, prey: { source: 'regionPredator', onMissing: 'abort', onInvalidated: 'ignore' } }, start: 'hunt', days: 14,
    reward: { base: 0, perPrey: true, regard: 10 }, posts: '^(inn|tavern|barracks|command|order:knights|order:hunters|order:mercenaries)$', asks: 'farmer|shepherd|herder|swineherd|cottar|plough|drover|goatherd',
    beats: [
      { id: 'hunt', kind: 'confrontation', title: 'The hunt', tasks: [{ type: 'defeat', role: 'prey', label: '{preyN} killed', count: 'prey' }], next: 'claim' },
      { id: 'claim', kind: 'aftermath', title: 'The bounty', tasks: [{ type: 'talk', role: 'giver', label: 'Claim the bounty from {giver}' }], next: null },
    ],
  },
  {
    id: 'job_letter', title: 'A letter for {town}', text: '{giver} {s:wants|want} a sealed letter carried to {town}, {km} km to the {dir}, within {days} days. Whoever receives it there will pay on delivery.',
    baseLevel: 'job', preconditions: ['country.town'], roles: { giver: GIVER, town: { source: 'nearTown', onMissing: 'abort', onInvalidated: 'ignore' } }, start: 'carry', days: 10,
    reward: { base: 6, perKm: 1.5, regard: 5 }, posts: '^(inn|countinghouse|guildhall|chandlery|guild:.*)$', asks: 'merchant|trader|clerk|scribe|reeve|steward|bailiff',
    beats: [{ id: 'carry', kind: 'hook', title: 'The letter', tasks: [{ type: 'deliver', role: 'town', label: 'Carry the letter to {town}', item: { def: 'letter', name: 'sealed letter for {town}' } }], next: 'paid' }, PAID],
  },
  {
    id: 'job_scout', title: 'Look into {ruin}', text: 'Strange talk comes from {ruin}, {km} km to the {dir}. {Giver} will pay someone to go and look, and come back to tell of it, within {days} days.',
    baseLevel: 'job', preconditions: ['country.lair'], roles: { giver: GIVER, ruin: { source: 'nearLair', onMissing: 'abort', onInvalidated: 'ignore' } }, start: 'go', days: 14,
    reward: { base: 15, perKm: 2, regard: 10 }, posts: '^(temple|shrine|barracks|command|order:knights|order:hunters|order:mercenaries)$', asks: 'priest|monk|nun|acolyte|sexton',
    beats: [
      { id: 'go', kind: 'investigate', title: 'The ruin', tasks: [{ type: 'explore', role: 'ruin', label: '{ruin} seen' }], next: 'report' },
      { id: 'report', kind: 'aftermath', title: 'The report', tasks: [{ type: 'talk', role: 'giver', label: 'Tell {giver} what you saw' }], next: null },
    ],
  },
];

/**
 * The missing herd (quests.md, template 1): a Job for one whose beasts are gone, which can grow into
 * a Chapter when the trail leads to a lair. Settled as proposed there: the clue check is Tracking
 * or Survival (the better); the giver's death passes the work to their household (Reassign); a herd
 * may simply have strayed (no culprit, found unharmed); beasts dead when found turn the fetching into
 * telling the giver their fate (Pivot) for half the pay; the chance of a deeper cause is rolled when
 * the quest is made, and the deeper beats are reached only if the wanderer finds its sign.
 */
const MISSING_HERD: Template = {
  id: 'tpl_missing_herd', title: 'The missing {kept}', text: 'Some of my {kept} are gone: {n} of them, strayed or taken, and I cannot leave the rest to look. Find them and bring them home, and I will pay you for it.',
  baseLevel: 'job', escalatesTo: 'chapter', escalationChance: 0.35, preconditions: ['giver.keepsBeasts'], start: 'trail', fairDays: 3,
  asks: 'farmer|shepherd|herder|swineherd|goatherd|cottar|drover|plough', n: [2, 5],
  reward: { base: 10, perN: 4, regard: 15, ifFlag: { flag: 'herdLost', factor: 0.5 } },
  roles: {
    giver: { source: 'giver', onMissing: 'abort', onInvalidated: 'reassign' },
    prize: { source: 'giverBeasts', onMissing: 'abort', onInvalidated: 'pivot' },
    obstacle: { source: 'regionPredator', optional: true, onMissing: 'skip', onInvalidated: 'ignore' },
    deeperCause: { source: 'deepLair', optional: true, onMissing: 'skip', onInvalidated: 'ignore' },
  },
  // Left four days, beasts that something took are dead.
  clocks: [{ days: 4, flag: 'herdLost', role: 'prize', state: 'dead', ifRole: 'obstacle', whileState: 'astray' }],
  beats: [
    {
      id: 'trail', kind: 'hook', title: 'The trail', next: 'recover', fallback: 'recover',
      tasks: [{ type: 'explore', role: 'prize', label: 'Find where the {kept} went', leads: 'trail', clue: { skills: ['tracking', 'survival'], dc: 35, flag: 'foundDeeperSign' } }],
      onComplete: { ifFlag: 'foundDeeperSign', escalate: true, next: 'delve' },
    },
    {
      id: 'recover', kind: 'confrontation', title: 'Bringing them home', next: 'aftermath',
      tasks: [
        { type: 'defeat', role: 'obstacle', when: 'obstacle', optional: true, label: 'the {obstacle} that took them killed', count: 1 },
        { type: 'retrieve', role: 'prize', deliverTo: 'giver', label: 'Drive the {kept} home to {giver}', pivot: { type: 'talk', label: 'Tell {giver} what became of the {kept}' } },
      ],
    },
    {
      id: 'delve', kind: 'investigate', title: 'What took them', level: 'job', needs: ['deeperCause'], fallback: 'recover', next: 'reckoning',
      tasks: [{ type: 'investigate', role: 'deeperCause', label: 'Find out what lairs at {deeperCause}', leads: 'role', clue: { skills: ['tracking', 'survival'], dc: 35, need: 1 } }],
    },
    {
      id: 'reckoning', kind: 'confrontation', title: 'The reckoning', level: 'job', needs: ['obstacle'], fallback: 'recover', next: 'aftermath',
      tasks: [
        { type: 'defeat', role: 'obstacle', label: 'the {obstacles} of {deeperCause} killed', count: 2 },
        { type: 'retrieve', role: 'prize', deliverTo: 'giver', label: 'Drive the {kept} home to {giver}', pivot: { type: 'talk', label: 'Tell {giver} what became of the {kept}' } },
      ],
    },
    { id: 'aftermath', kind: 'aftermath', title: 'Home again', tasks: [], next: null },
  ],
};

/**
 * The creditor's terms (quests.md, template 2): an obligation from the task log, with leverage, an
 * errand and a turning point. Settled as proposed: the creditor's death passes the debt to their
 * household (Reassign), or waives it if there is no one; the third party is the creditor's agent in a
 * nearby town, and the clearance token a sealed note carried there; paying in full is offered only to
 * one who can pay; defiance is Survive (three days with the creditor's men about), and a feud may
 * follow (the quest grows to a Story; its own beats are a later template).
 */
const CREDITOR: Template = {
  id: 'tpl_creditor_terms', title: 'What I owe {creditor}', text: 'I owe {creditor} {amount}, and {creditor} will want it.',
  baseLevel: 'job', escalatesTo: 'story', escalationChance: 0.15, preconditions: ['obligation'], start: 'demand', fairDays: 14,
  reward: { base: 0, regard: 10 },
  // Left unpaid (stage Q3): due in three weeks; then a tenth more each week, the creditor's men a
  // week after it falls due, and the law a fortnight after that.
  dueDays: 21,
  clocks: [
    { days: 0, fromDue: true, flag: 'overdue', effect: 'interest' },
    { days: 7, fromDue: true, flag: 'dunned', effect: 'dun' },
    { days: 7, fromDue: true, flag: 'interest2', effect: 'interest' },
    { days: 14, fromDue: true, flag: 'interest3', effect: 'interest' },
    { days: 21, fromDue: true, flag: 'law', effect: 'law' },
  ],
  roles: {
    creditor: { source: 'obligationParty', onMissing: 'abort', onInvalidated: 'reassign' },
    debt: { source: 'obligationRecord', onMissing: 'abort', onInvalidated: 'waive' },
    agent: { source: 'nearTown', optional: true, onMissing: 'skip', onInvalidated: 'ignore' },
  },
  beats: [
    {
      id: 'demand', kind: 'hook', title: 'The demand',
      tasks: [{ type: 'talk', role: 'creditor', label: 'Settle with {creditor}', options: [
        { id: 'payInFull', label: 'Pay what I owe ({amount})', needs: 'debt' },
        { id: 'negotiateTerms', label: 'Ask what else would clear the debt', needs: 'agent' },
        { id: 'refuseAndDefy', label: 'Refuse to pay' },
      ] }],
      branches: { payInFull: 'settled', negotiateTerms: 'errand', refuseAndDefy: 'defiance' },
    },
    {
      id: 'errand', kind: 'complication', title: 'The errand', needs: ['agent'], fallback: 'defiance', next: 'settled',
      tasks: [
        { type: 'deliver', role: 'agent', label: 'Carry {creditor}’s sealed note to {agent}', item: { def: 'letter', name: 'sealed note for {agent}' } },
        { type: 'talk', role: 'creditor', label: 'Tell {creditor} the note is delivered' },
      ],
    },
    {
      id: 'defiance', kind: 'confrontation', title: 'Defiance', next: 'settled', fallback: 'settled',
      tasks: [{ type: 'survive', label: 'Live through what {creditor} sends after you', hours: 72, flagOnDone: 'feud' }],
      onComplete: { ifFlag: 'feud', escalate: true, next: 'settled' },
    },
    { id: 'settled', kind: 'aftermath', title: 'Settled', tasks: [], next: null },
  ],
};

/** A tie's own person, for the templates of a life (stage Q3): lost if they die. */
const TIE: RoleSpec = { source: 'obligationParty', onMissing: 'abort', onInvalidated: 'overtaken' };
const KIN: RoleSpec = { source: 'obligationKin', onMissing: 'abort', onInvalidated: 'reassign' };
const DONE: BeatSpec = { id: 'done', kind: 'aftermath', title: 'Done', tasks: [], next: null };

/**
 * The quests of a life (stage Q3; docs/design/quests.md, The task log): from the ties made at
 * character creation, each person a resident of their town (worker/ties.ts).
 */
const LIFE: Template[] = [
  {
    id: 'tpl_love_waits', title: 'Word for {love}', text: '{love} waits for word of me in {town}{why}.',
    baseLevel: 'task', preconditions: ['obligation'], start: 'go', fairDays: 10, reward: { base: 0, regard: 20 },
    roles: { love: TIE },
    beats: [{ id: 'go', kind: 'hook', title: 'Going back', tasks: [{ type: 'talk', role: 'love', label: 'Go back to {love} in {town}' }], next: 'done' }, DONE],
  },
  {
    id: 'tpl_lost_love', title: 'What became of {love}', text: 'I loved {love}, and lost them. {kin} may know what became of them.',
    baseLevel: 'job', preconditions: ['obligation'], start: 'ask', fairDays: 10, reward: { base: 0, regard: 10 },
    roles: { love: { source: 'obligationParty', onMissing: 'abort', onInvalidated: 'ignore' }, kin: KIN },
    beats: [
      { id: 'ask', kind: 'investigate', title: 'Asking after them', tasks: [{ type: 'talk', role: 'kin', label: 'Ask {kin} what became of {love}' }], onComplete: { ifFlag: 'alive', next: 'find' }, next: 'grief' },
      { id: 'find', kind: 'confrontation', title: 'Finding them', needs: ['love'], fallback: 'grief', tasks: [{ type: 'talk', role: 'love', label: 'Find {love} in {town}' }], next: 'done' },
      { id: 'grief', kind: 'aftermath', title: 'Their grave', tasks: [], next: null },
      DONE,
    ],
  },
  {
    id: 'tpl_family_visit', title: 'Home to {kin}', text: '{why} The family is in {town}.',
    baseLevel: 'task', preconditions: ['obligation'], start: 'visit', fairDays: 7, reward: { base: 0, regard: 15 },
    roles: { kin: KIN },
    beats: [{ id: 'visit', kind: 'hook', title: 'Home', tasks: [{ type: 'talk', role: 'kin', label: 'Go home to {kin} in {town}' }], next: 'done' }, DONE],
  },
  {
    id: 'tpl_parent_affairs', title: 'The affairs of {parent}', text: '{parent} is dead, and what was left is still to be settled with {kin} in {town}.',
    baseLevel: 'task', preconditions: ['obligation'], start: 'settle', fairDays: 14, reward: { base: 0, regard: 10 },
    roles: { kin: KIN },
    beats: [{
      id: 'settle', kind: 'hook', title: 'Settling it', next: 'done',
      tasks: [{ type: 'talk', role: 'kin', label: 'Settle the affairs of {parent} with {kin}', options: [
        { id: 'inherit', label: 'Take what was left to you ({amount})', gain: 'amount' },
        { id: 'waive', label: 'Leave it all to the family', regard: 15 },
      ] }],
    }, DONE],
  },
  {
    id: 'tpl_favour', title: 'What {contact} owes me', text: '{contact} owes me a favour, from the old days. It can be called in once.',
    baseLevel: 'task', preconditions: ['obligation'], start: 'call', reward: { base: 0, regard: 0 },
    roles: { contact: TIE },
    beats: [{
      id: 'call', kind: 'hook', title: 'Calling it in', next: 'done',
      tasks: [{ type: 'talk', role: 'contact', label: 'Call in the favour from {contact}', options: [
        { id: 'coin', label: 'Ask for coin to set you on your way ({amount})', gain: 'amount' },
        { id: 'word', label: 'Ask them to speak well of you about the town' },
      ] }],
    }, DONE],
  },
  {
    id: 'tpl_rival', title: 'The matter of {rival}', text: '{rival} has hated me since {since}, and {s:speaks|speaks} against me in {town}{why}.',
    baseLevel: 'task', preconditions: ['obligation'], start: 'face', fairDays: 14, reward: { base: 0, regard: 0 },
    roles: { rival: TIE },
    beats: [
      {
        id: 'face', kind: 'confrontation', title: 'Facing {rival}',
        tasks: [{ type: 'talk', role: 'rival', label: 'Have it out with {rival}', options: [
          { id: 'peace', label: 'Offer to put the past behind you (Persuasion)', check: { skill: 'persuasion', dc: 50 }, regard: 50 },
          { id: 'warn', label: 'Warn them off (Intimidation)', check: { skill: 'intimidation', dc: 50 }, regard: -10 },
          { id: 'leave', label: 'Walk away' },
        ] }],
        branches: { peace: 'done', 'peace:fail': 'standing', warn: 'done', 'warn:fail': 'standing', leave: 'standing' },
      },
      { id: 'standing', kind: 'aftermath', title: 'The rivalry stands', tasks: [], next: null },
      DONE,
    ],
  },
  {
    id: 'tpl_feud', title: 'The feud with {house}', text: 'My family and {house} of {town} have been at feud over a death neither side forgives{why}.',
    baseLevel: 'job', preconditions: ['obligation'], start: 'face', fairDays: 21, reward: { base: 0, regard: 0 },
    roles: { head: TIE },
    beats: [
      {
        id: 'face', kind: 'confrontation', title: 'The feud',
        tasks: [{ type: 'talk', role: 'head', label: 'Speak with {head}, head of {house}', options: [
          { id: 'peace', label: 'Seek an end to it (Persuasion)', check: { skill: 'persuasion', dc: 65 }, regard: 60 },
          { id: 'wergild', label: 'Offer blood money ({amount})', needs: 'debt', regard: 60 },
          { id: 'defy', label: 'Tell them it will never be forgiven', regard: -20 },
        ] }],
        branches: { peace: 'done', 'peace:fail': 'standing', wergild: 'done', defy: 'standing' },
      },
      { id: 'standing', kind: 'aftermath', title: 'The feud goes on', tasks: [], next: null },
      DONE,
    ],
  },
  {
    id: 'tpl_omen', title: 'The sign in the cards', text: 'The cards said: {omen} {ruin}, {km} km to the {dir}, seems to answer them.',
    baseLevel: 'task', preconditions: ['country.lair'], start: 'go', fairDays: 7, reward: { base: 0, regard: 0 },
    roles: { giver: GIVER, ruin: { source: 'nearLair', onMissing: 'abort', onInvalidated: 'ignore' } },
    beats: [{ id: 'go', kind: 'investigate', title: 'The sign', tasks: [{ type: 'explore', role: 'ruin', label: '{ruin} seen' }], next: 'done' }, DONE],
  },
];

export const TEMPLATES: readonly Template[] = [...JOBS, MISSING_HERD, CREDITOR, ...LIFE];
export const TEMPLATE_BY_ID: ReadonlyMap<string, Template> = new Map(TEMPLATES.map((t) => [t.id, t]));

/**
 * Checks templates against the fixed lists and against themselves: every name known, every role a
 * beat or task uses declared, every beat named exists, every way through reaches an aftermath, a
 * beat that needs an optional role has a fallback, and only the types the engine checks are used.
 * Returns the faults found (none: all is well).
 */
export function checkTemplates(list: readonly Template[] = TEMPLATES): string[] {
  const bad: string[] = [];
  const ids = new Set<string>();
  for (const t of list) {
    const at = (s: string) => bad.push(`${t.id}: ${s}`);
    if (ids.has(t.id)) at('the id is used twice');
    ids.add(t.id);
    for (const p of t.preconditions) if (!PRECONDITIONS.includes(p)) at(`unknown precondition "${p}"`);
    for (const [k, r] of Object.entries(t.roles)) {
      if (!ROLE_SOURCES.includes(r.source)) at(`role ${k}: unknown source "${r.source}"`);
      if (!ON_MISSING.includes(r.onMissing)) at(`role ${k}: unknown onMissing "${r.onMissing}"`);
      if (!ON_INVALIDATED.includes(r.onInvalidated)) at(`role ${k}: unknown onInvalidated "${r.onInvalidated}"`);
      if (r.optional && r.onMissing !== 'skip') at(`role ${k}: optional, so it must be skipped when missing`);
    }
    if (!Object.values(t.roles).some((r) => r.source === 'giver' || r.source === 'obligationParty' || r.source === 'obligationKin')) at('no one to give it (a giver, or the person of an obligation)');
    const beats = new Map(t.beats.map((b) => [b.id, b]));
    if (beats.size !== t.beats.length) at('a beat id is used twice');
    if (!beats.has(t.start)) at(`the start beat "${t.start}" does not exist`);
    const role = (where: string, r: string | undefined) => r && !t.roles[r] && at(`${where}: undeclared role "${r}"`);
    for (const b of t.beats) {
      if (!BEAT_KINDS.includes(b.kind)) at(`beat ${b.id}: unknown kind "${b.kind}"`);
      const nexts = [b.next, b.fallback, b.onComplete?.next, ...Object.values(b.branches ?? {})].filter((x): x is string => typeof x === 'string');
      for (const n of nexts) if (!beats.has(n)) at(`beat ${b.id}: names a beat "${n}" that does not exist`);
      if (b.next === undefined && !b.branches) at(`beat ${b.id}: no next beat and no branches`);
      if (b.next === null && b.kind !== 'aftermath') at(`beat ${b.id}: the quest ends here, but it is not an aftermath`);
      if (b.onComplete?.escalate && !t.escalatesTo) at(`beat ${b.id}: escalates, but the template names no level to grow to`);
      for (const r of b.needs ?? []) {
        role(`beat ${b.id}`, r);
        if (t.roles[r]?.optional && !b.fallback) at(`beat ${b.id}: needs the optional role ${r}, so it needs a fallback`);
      }
      for (const k of b.tasks) {
        if (!TASK_TYPES.includes(k.type)) at(`beat ${b.id}: unknown task type "${k.type}"`);
        else if (!BUILT_TYPES.has(k.type)) at(`beat ${b.id}: task type "${k.type}" is not checked by the engine yet`);
        role(`beat ${b.id}`, k.role);
        role(`beat ${b.id}`, k.deliverTo);
        role(`beat ${b.id}`, k.when);
        if (k.role && t.roles[k.role]?.optional && !k.when && !k.optional && !(b.needs ?? []).includes(k.role)) at(`beat ${b.id}: a task on the optional role ${k.role} must be optional, or made only when it is filled`);
        if (k.pivot && !BUILT_TYPES.has(k.pivot.type)) at(`beat ${b.id}: pivots to "${k.pivot.type}", which is not checked yet`);
        if (k.options && k.type !== 'talk') at(`beat ${b.id}: only a talk has options`);
        for (const o of k.options ?? []) {
          if (o.needs && o.needs !== 'debt') role(`beat ${b.id} option ${o.id}`, o.needs);
          if (o.needs === 'debt' && !t.roles.debt && !t.preconditions.includes('obligation')) at(`beat ${b.id} option ${o.id}: needs the debt, but there is none`);
        }
        if (b.branches) for (const o of k.options ?? []) {
          if (!b.branches[o.id]) at(`beat ${b.id}: option ${o.id} has no branch`);
          if (o.check && !b.branches[`${o.id}:fail`]) at(`beat ${b.id}: option ${o.id} can fail, but has no branch for it`);
        }
      }
    }
    // Every way through ends in an aftermath, and every beat can be reached.
    const seen = new Set<string>(), stack = [t.start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const b = beats.get(id);
      if (!b) continue;
      for (const n of [b.next, b.fallback, b.onComplete?.next, ...Object.values(b.branches ?? {})]) if (typeof n === 'string') stack.push(n);
    }
    for (const b of t.beats) if (!seen.has(b.id)) at(`beat ${b.id} cannot be reached`);
    if (!t.beats.some((b) => b.kind === 'aftermath' && b.next === null)) at('no aftermath ends it');
    if (t.escalatesTo && !t.beats.some((b) => b.onComplete?.escalate)) at('it names a level to grow to, but no beat grows it');
  }
  return bad;
}
