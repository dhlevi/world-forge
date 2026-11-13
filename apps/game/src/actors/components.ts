/**
 * The components a person is made of (docs/design/characters.md). Each keeps plain data, saves
 * itself with `toJSON` and is made again by its `fromJSON` (registered in actors/index.ts).
 */
import { Component } from './actor';
import type { Message } from '../engine/messages';
import { SENSES, TRAITS, type Attribute, type SenseId, type TraitId } from './data/traits';
import { KNOWLEDGE, SKILL, SKILLS, skillWord, type KnowledgeKind } from './data/skills';

declare module '../engine/messages' {
  interface MessageTypes {
    /** Game time has passed (broadcast to every actor by the cast), and what the player was doing. */
    'time.passed': { now: number; dt: number; ctx?: TimeCtx };
    /** A moodlet for one actor (sent to it). */
    'actor.moodlet': Moodlet;
    /** Something changed in an actor that views may show (broadcast). */
    'actor.changed': { id: number };
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** What a person was doing while time passed (for needs and fatigue, actors/needs.ts). */
export type Activity = 'rest' | 'walk' | 'swim' | 'travel' | 'sleep' | 'work';

export interface TimeCtx {
  activity?: Activity;
  /** The air about them (°C). */
  ambientC?: number;
  /** How much the load slows them (1 unladen). */
  loadSlow?: number;
  /** How well they sleep (1 a bed, less rough). */
  sleepQuality?: number;
}

// ---- Identity ------------------------------------------------------------------------------------

export type StandingId = 'peasant' | 'townsfolk' | 'craftsman' | 'merchant' | 'clergy' | 'minor' | 'noble';

export interface IdentityData {
  given: string;
  /** Family or clan name, where the culture uses one. */
  family?: string;
  full: string;
  female: boolean;
  /** Age in years when the game began. */
  age: number;
  /** The world's year when the game began. */
  year: number;
  folk: string;
  culture: number;
  cultureName: string;
  people: string;
  realm?: string;
  homeId: string;
  homeName: string;
  faith?: string;
  standing: StandingId;
}

/** Who the person is: name, sex, age, people, home and standing. */
export class Identity extends Component {
  static readonly key = 'identity';
  constructor(public d: IdentityData) {
    super();
  }
  get name(): string {
    return this.d.full;
  }
  /** Age now, from the game clock (seconds since the start). */
  ageAt(time: number): number {
    return this.d.age + Math.floor(time / (365 * 86400));
  }
  toJSON(): IdentityData {
    return { ...this.d };
  }
  static fromJSON(d: IdentityData): Identity {
    return new Identity(d);
  }
}

// ---- Body ----------------------------------------------------------------------------------------

export interface BodyPartDef {
  id: string;
  name: string;
  parent?: string;
  /** Relative chance of being struck. */
  size: number;
  vital?: boolean;
}

/** The body plan of a person: a tree of parts (wounds come later). */
export const HUMANOID: BodyPartDef[] = [
  { id: 'torso', name: 'torso', size: 30 },
  { id: 'neck', name: 'neck', parent: 'torso', size: 3, vital: true },
  { id: 'head', name: 'head', parent: 'neck', size: 8 },
  { id: 'skull', name: 'skull', parent: 'head', size: 3 },
  { id: 'brain', name: 'brain', parent: 'skull', size: 1, vital: true },
  { id: 'eye.l', name: 'left eye', parent: 'head', size: 0.5 },
  { id: 'eye.r', name: 'right eye', parent: 'head', size: 0.5 },
  { id: 'ear.l', name: 'left ear', parent: 'head', size: 0.5 },
  { id: 'ear.r', name: 'right ear', parent: 'head', size: 0.5 },
  { id: 'nose', name: 'nose', parent: 'head', size: 0.5 },
  { id: 'jaw', name: 'jaw', parent: 'head', size: 1 },
  { id: 'heart', name: 'heart', parent: 'torso', size: 1, vital: true },
  { id: 'lung.l', name: 'left lung', parent: 'torso', size: 2 },
  { id: 'lung.r', name: 'right lung', parent: 'torso', size: 2 },
  { id: 'liver', name: 'liver', parent: 'torso', size: 1.5, vital: true },
  { id: 'stomach', name: 'stomach', parent: 'torso', size: 1.5 },
  { id: 'kidneys', name: 'kidneys', parent: 'torso', size: 1 },
  { id: 'spine', name: 'spine', parent: 'torso', size: 1.5 },
  ...(['l', 'r'] as const).flatMap((s) => {
    const side = s === 'l' ? 'left' : 'right';
    return [
      { id: `arm.${s}`, name: `${side} arm`, parent: 'torso', size: 7 },
      { id: `hand.${s}`, name: `${side} hand`, parent: `arm.${s}`, size: 2 },
      { id: `leg.${s}`, name: `${side} leg`, parent: 'torso', size: 9 },
      { id: `foot.${s}`, name: `${side} foot`, parent: `leg.${s}`, size: 2 },
    ];
  }),
];

export interface Wound {
  part: string;
  kind: 'cut' | 'stab' | 'bruise' | 'fracture' | 'crush' | 'bite' | 'burn' | 'frostbite';
  severity: number;
  /** A healed wound that left a mark or lasting harm. */
  scar?: string;
}

export interface BodyData {
  heightCm: number;
  weightKg: number;
  build: string;
  skin: string;
  skinHex: string;
  hair: string;
  hairHex: string;
  hairStyle: string;
  beard: string;
  marks?: string;
  wounds: Wound[];
}

export class Body extends Component {
  static readonly key = 'body';
  readonly plan = HUMANOID;
  constructor(public d: BodyData) {
    super();
  }
  /** Scars and lasting harm, in words. */
  get scars(): string[] {
    return this.d.wounds.filter((w) => w.scar).map((w) => w.scar!);
  }
  toJSON(): BodyData {
    return { ...this.d, wounds: this.d.wounds.map((w) => ({ ...w })) };
  }
  static fromJSON(d: BodyData): Body {
    return new Body({ ...d, wounds: d.wounds ?? [] });
  }
}

/** How hair is worn, in words: "flaxen hair in braids", "a shaved head". */
const WORN: Record<string, string> = {
  short: 'cut short', long: 'worn long', braids: 'in braids', topknot: 'in a topknot', bun: 'pinned up', curly: 'in curls', tied: 'tied back',
  loose: 'worn long and loose', crest: 'shaved but for a crest',
};
export function hairText(colour: string, style: string): string {
  if (style === 'bald') return 'a bald head';
  if (style === 'shaved') return 'a shaved head';
  return `${colour} hair ${WORN[style] ?? style}`;
}

/** A beard in words. */
export function beardText(beard: string): string {
  return beard === 'none' ? 'clean-shaven' : beard === 'moustache' ? 'a moustache' : `a ${beard} beard`;
}

// ---- Traits, senses and luck ---------------------------------------------------------------------

export interface TraitsData {
  traits: Record<TraitId, number>;
  senses: Record<SenseId, number>;
  /** The luck gauge (0 to 100) and the level it drifts back to. */
  luck: number;
  luckRest: number;
}

export class Traits extends Component {
  static readonly key = 'traits';
  constructor(public d: TraitsData) {
    super();
  }
  /** A trait or sense. */
  get(a: Attribute): number {
    return (this.d.traits as Record<string, number>)[a] ?? (this.d.senses as Record<string, number>)[a] ?? 10;
  }
  /** The mean of several traits and senses. */
  mean(as: Attribute[]): number {
    return as.length ? as.reduce((s, a) => s + this.get(a), 0) / as.length : 10;
  }
  toJSON(): TraitsData {
    return { traits: { ...this.d.traits }, senses: { ...this.d.senses }, luck: this.d.luck, luckRest: this.d.luckRest };
  }
  static fromJSON(d: TraitsData): Traits {
    return new Traits(d);
  }
  static average(): TraitsData {
    return {
      traits: Object.fromEntries(TRAITS.map((t) => [t, 10])) as Record<TraitId, number>,
      senses: Object.fromEntries(SENSES.map((s) => [s, 10])) as Record<SenseId, number>,
      luck: 50,
      luckRest: 50,
    };
  }
}

// ---- Skills, languages and knowledge -------------------------------------------------------------

export interface LanguageSkill {
  name: string;
  /** Speaking (0 to 100; 90 and above native). */
  speak: number;
  /** Reading and writing its script. */
  read: number;
}

export interface KnowledgeSkill {
  kind: KnowledgeKind;
  /** The realm, faith or region it is of. */
  of: string;
  level: number;
}

export interface SkillsData {
  levels: Record<string, number>;
  /** Rust: a temporary loss on the learnt level, shaken off by use. */
  rust: Record<string, number>;
  /** By culture index. */
  languages: Record<string, LanguageSkill>;
  /** By "kind:of". */
  knowledge: Record<string, KnowledgeSkill>;
  /** When each skill was last used (game seconds; rust grows after a while without). */
  used?: Record<string, number>;
  /** Learning so far today, by skill (repeating a thing within a day teaches less and less). */
  today?: Record<string, { day: number; xp: number }>;
  /** The dice: the state of this person's own stream of rolls (saved, so a game replays the same). */
  dice?: number;
  /** Skills the person has noticed growing rusty (until practice shakes it off). */
  rusty?: Record<string, true>;
}

/** The highest level a skill can reach, from its governing traits (proposed: 25 + 3.5 x their mean). */
export function skillCap(mean: number): number {
  return clamp(Math.round(25 + 3.5 * mean), 10, 100);
}

/** Days without use before rust begins, the days it takes to reach its limit, and the limit (a share of the level). */
export const RUST_AFTER_DAYS = 28, RUST_FULL_DAYS = 150, RUST_LIMIT = 1 / 3;
/** Learning today counts this much before it halves what more practice teaches. */
export const DAILY_XP = 2;
/** Each point of learning from use also shakes off this much rust (and at least RUST_MIN). */
const RUST_PER_XP = 20, RUST_MIN = 1;

/** One step of a 32-bit stream (mulberry32): the next state and a number in [0, 1). */
function diceStep(s: number): [number, number] {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** A small string hash (FNV-1a), for seeding the dice of an older save. */
function hash32(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193);
  return h | 0;
}

export interface SkillNote {
  text: string;
  skill: string;
}

export class Skills extends Component {
  static readonly key = 'skills';
  /** What the person has noticed about their skills, for the log (not saved). */
  private notes: SkillNote[] = [];
  constructor(public d: SkillsData) {
    super();
  }
  static empty(): SkillsData {
    return { levels: {}, rust: {}, languages: {}, knowledge: {} };
  }
  private traits(): Traits | undefined {
    return this.actor?.get(Traits);
  }
  /** The learnt level. */
  level(id: string): number {
    return this.d.levels[id] ?? 0;
  }
  rust(id: string): number {
    return this.d.rust[id] ?? 0;
  }
  /** The level in use (less rust). */
  effective(id: string): number {
    return Math.max(0, this.level(id) - this.rust(id));
  }
  cap(id: string): number {
    const def = SKILL.get(id);
    const t = this.traits();
    let c = skillCap(t && def ? t.mean(def.traits) : 10);
    if (def?.under) c = Math.min(c, this.level(def.under));
    return c;
  }
  /**
   * Adds learning to a skill: the closer it is to its cap (or a lower limit, such as what a
   * teacher knows), the less each point teaches. Returns the gain.
   */
  gain(id: string, amount: number, limit = Infinity): number {
    const cap = Math.min(this.cap(id), limit), now = this.level(id);
    if (now >= cap || amount <= 0) return 0;
    const add = amount * Math.max(0.1, 1 - now / Math.max(1, this.cap(id)));
    const next = Math.min(cap, now + add);
    this.d.levels[id] = Math.round(next * 100) / 100;
    return this.d.levels[id] - now;
  }

  // ---- The dice ------------------------------------------------------------------------------

  /** A number in [0, 1) from this person's own stream. */
  random(): number {
    if (this.d.dice === undefined) {
      const id = this.actor?.get(Identity)?.d;
      this.d.dice = hash32(`${id?.full ?? 'someone'}|${id?.homeId ?? ''}|${id?.age ?? 0}`);
    }
    const [s, r] = diceStep(this.d.dice);
    this.d.dice = s;
    return r;
  }
  /** A d100 roll, 1 to 100. */
  d100(): number {
    return 1 + Math.floor(this.random() * 100);
  }

  // ---- Learning by doing, and rust -------------------------------------------------------------

  /** Intelligence sets the pace of learning (10: 1; 18: 1.32; 4: 0.76). */
  pace(): number {
    return 0.6 + 0.04 * (this.traits()?.get('intelligence') ?? 10);
  }
  /** How much more learning counts today for a skill (1, falling as the day's learning mounts). */
  freshness(id: string, now: number): number {
    const t = this.d.today?.[id];
    return t && t.day === Math.floor(now / 86400) ? 1 / (1 + t.xp / DAILY_XP) : 1;
  }
  private spendToday(id: string, xp: number, now: number): void {
    const day = Math.floor(now / 86400);
    const today = (this.d.today ??= {});
    // Yesterday's learning is forgotten, and so are other days' entries.
    for (const k of Object.keys(today)) if (today[k].day !== day) delete today[k];
    const t = (today[id] ??= { day, xp: 0 });
    t.xp += xp;
  }
  /**
   * A use of a skill teaches `raw` (from a check: how hard, how it went), at the person's pace,
   * less if it has been practised much today, and shakes off rust. Returns the levels gained.
   * `limit` caps what this kind of learning can reach (teachers and books).
   */
  practise(id: string, raw: number, now: number, limit = Infinity): number {
    if (!SKILL.has(id)) return 0;
    const before = this.level(id), word = skillWord(before);
    (this.d.used ??= {})[id] = now;
    const xp = Math.max(0, raw) * this.pace() * this.freshness(id, now);
    this.spendToday(id, Math.max(0, raw), now);
    const r = this.rust(id);
    if (r > 0) {
      // Rust comes off at the full rate however much was practised today.
      const left = Math.max(0, r - Math.max(RUST_MIN * Math.min(1, raw * 4), raw * this.pace() * RUST_PER_XP));
      if (left <= 0.05) {
        delete this.d.rust[id];
        if (this.d.rusty?.[id]) {
          delete this.d.rusty[id];
          this.note(id, `The knack for ${skillName(id)} comes back to you.`);
        }
      } else this.d.rust[id] = Math.round(left * 100) / 100;
    }
    const got = this.gain(id, xp, limit);
    const after = this.level(id);
    if (got > 0) {
      const w = skillWord(after);
      if (w !== word && before > 0) this.note(id, becomeText(w, skillName(id)));
      else if (before <= 0) this.note(id, `You begin to learn ${skillName(id)}.`);
      else if (Math.floor(after / 5) > Math.floor(before / 5)) this.note(id, `You are getting better at ${skillName(id)}.`);
    }
    return got;
  }
  private note(skill: string, text: string): void {
    this.notes.push({ skill, text });
  }
  /** What the person has noticed since last asked (the log shows it). */
  takeNotes(): SkillNote[] {
    const n = this.notes;
    this.notes = [];
    return n;
  }
  /** Rust grows on skills long unused. */
  private age(now: number, dt: number): void {
    const used = (this.d.used ??= {});
    const start = RUST_AFTER_DAYS * 86400, rate = RUST_LIMIT / (RUST_FULL_DAYS * 86400);
    for (const [id, level] of Object.entries(this.d.levels)) {
      if (level < 5) continue;
      // Skills from before play count as used when play began.
      if (used[id] === undefined) {
        used[id] = now - dt;
        continue;
      }
      const idle = now - used[id];
      if (idle <= start) continue;
      const span = Math.min(dt, idle - start);
      const r0 = this.rust(id);
      const r1 = Math.min(level * RUST_LIMIT, r0 + level * rate * span);
      if (r1 <= r0) continue;
      this.d.rust[id] = Math.round(r1 * 100) / 100;
      if (r1 >= 2 && !this.d.rusty?.[id]) {
        (this.d.rusty ??= {})[id] = true;
        this.note(id, `Your ${skillName(id)} has grown rusty.`);
      }
    }
  }
  onMessage(m: Message): boolean {
    if (m.type !== 'time.passed') return false;
    const p = (m as Message<'time.passed'>).payload;
    this.age(p.now, p.dt);
    return false;
  }

  /** Knowledge of a realm, faith or region. */
  know(kind: KnowledgeKind, of: string, amount: number): void {
    const k = `${kind}:${of}`;
    const cur = this.d.knowledge[k] ?? { kind, of, level: 0 };
    const t = this.traits();
    const cap = skillCap(t ? t.mean(KNOWLEDGE[kind].traits) : 10);
    cur.level = Math.round(Math.min(cap, cur.level + amount * Math.max(0.1, 1 - cur.level / cap)) * 10) / 10;
    this.d.knowledge[k] = cur;
  }
  language(key: string, name: string, speak: number, read = 0): void {
    const cur = this.d.languages[key] ?? { name, speak: 0, read: 0 };
    cur.speak = clamp(Math.max(cur.speak, speak), 0, 100);
    cur.read = clamp(Math.max(cur.read, read), 0, 100);
    this.d.languages[key] = cur;
  }
  /** Whether they can read at all (in some script). */
  literate(): boolean {
    return Object.values(this.d.languages).some((l) => l.read >= 20);
  }
  /** Skills above 0, best first. */
  known(): { id: string; name: string; level: number }[] {
    return SKILLS.filter((s) => this.level(s.id) > 0)
      .map((s) => ({ id: s.id, name: s.name, level: this.level(s.id) }))
      .sort((a, b) => b.level - a.level);
  }
  toJSON(): SkillsData {
    return JSON.parse(JSON.stringify(this.d));
  }
  static fromJSON(d: SkillsData): Skills {
    return new Skills({ ...Skills.empty(), ...d });
  }
}

const skillName = (id: string) => SKILL.get(id)?.name ?? id;
const BECOME: Record<string, string> = {
  novice: 'You know the rudiments of $ now.', beginner: 'You are finding your feet at $.', competent: 'You have become competent at $.',
  journeyman: 'You have the skill of a journeyman at $.', expert: 'You have become expert at $.', master: 'You have mastered $.', 'among the best': 'Few anywhere can match your $.',
};
const becomeText = (w: string, name: string) => (BECOME[w] ?? 'You are getting better at $.').replace('$', name);

// ---- The two-bar pools ---------------------------------------------------------------------------

export interface Pool {
  value: number;
  max: number;
}

export interface PoolsData {
  physBurst: Pool;
  physDay: Pool;
  mentBurst: Pool;
  mentDay: Pool;
}

/**
 * Physical and mental stamina, each a day pool and a burst pool (sizes from traits and body).
 * Spent and refilled by the needs (actors/needs.ts) as time passes.
 */
export class Pools extends Component {
  static readonly key = 'pools';
  constructor(public d: PoolsData) {
    super();
  }
  /** Sizes from the actor's traits and body; full. */
  static fromTraits(t: Traits, b?: Body): PoolsData {
    const g = (a: Attribute) => t.get(a);
    const bulk = b ? clamp(b.d.weightKg / 70, 0.6, 1.4) : 1;
    const full = (max: number): Pool => ({ value: Math.round(max), max: Math.round(max) });
    return {
      physBurst: full(30 + ((g('strength') + g('agility') + g('constitution')) * 4) / 3),
      physDay: full((60 + 2 * g('constitution') + g('willpower')) * (0.85 + 0.15 * bulk)),
      mentBurst: full(30 + 2 * (g('intelligence') + g('willpower'))),
      mentDay: full(60 + 2 * g('willpower') + g('wisdom')),
    };
  }
  toJSON(): PoolsData {
    return JSON.parse(JSON.stringify(this.d));
  }
  static fromJSON(d: PoolsData): Pools {
    return new Pools(d);
  }
}

// ---- Mood ----------------------------------------------------------------------------------------

export interface Moodlet {
  id: string;
  text: string;
  /** Plus or minus. */
  value: number;
  /** Game time it ends (seconds), or none for as long as its cause lasts. */
  until?: number;
}

/** The mood meter: the sum of timed moodlets. */
export class Mood extends Component {
  static readonly key = 'mood';
  constructor(public moodlets: Moodlet[] = []) {
    super();
  }
  get value(): number {
    return this.moodlets.reduce((s, m) => s + m.value, 0);
  }
  add(m: Moodlet): void {
    // The same kind replaces itself rather than stacking.
    this.moodlets = [...this.moodlets.filter((x) => x.id !== m.id), m];
  }
  onMessage(m: Message): boolean {
    if (m.type === 'actor.moodlet') {
      this.add({ ...(m as Message<'actor.moodlet'>).payload });
      return true;
    }
    if (m.type === 'time.passed') {
      const now = (m as Message<'time.passed'>).payload.now;
      const before = this.moodlets.length;
      this.moodlets = this.moodlets.filter((x) => x.until === undefined || x.until > now);
      return this.moodlets.length !== before;
    }
    return false;
  }
  toJSON(): Moodlet[] {
    return this.moodlets.map((m) => ({ ...m }));
  }
  static fromJSON(d: Moodlet[]): Mood {
    return new Mood(d ?? []);
  }
}

// ---- Belongings ----------------------------------------------------------------------------------

/** Money in words: "3 gold, 4 silver and 7 copper". */
export function moneyText(copper: number): string {
  const p = Math.floor(copper / 1000), g = Math.floor((copper % 1000) / 100), s = Math.floor((copper % 100) / 10), c = Math.floor(copper % 10);
  const parts = [p && `${p} platinum`, g && `${g} gold`, s && `${s} silver`, c && `${c} copper`].filter(Boolean) as string[];
  if (!parts.length) return 'no money';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// ---- History -------------------------------------------------------------------------------------

export interface Tie {
  kind: 'parent' | 'sibling' | 'contact' | 'rival' | 'debt' | 'feud' | 'friend' | 'master';
  name?: string;
  text: string;
  /** Still living (people). */
  alive?: boolean;
}

export interface HistoryData {
  /** The life before play, a line per event, oldest first. */
  lines: { age: number; text: string }[];
  /** The fate spread drawn at creation, kept for the storyteller. */
  spread: { position: string; card: string; reversed: boolean }[];
  /** Highest rank reached in each occupation track. */
  ranks: Record<string, number>;
  ties: Tie[];
  omen?: string;
}

export class History extends Component {
  static readonly key = 'history';
  constructor(public d: HistoryData) {
    super();
  }
  toJSON(): HistoryData {
    return JSON.parse(JSON.stringify(this.d));
  }
  static fromJSON(d: HistoryData): History {
    return new History(d);
  }
}

// ---- What the person knows of the world ----------------------------------------------------------

export interface KnowledgeData {
  /** The country about home that is known at the start (m). */
  homeRadiusM: number;
  /** Places whose roads from home are known (start site ids). */
  roads: string[];
  /** Places known around themselves without the way there (start site ids, with a radius in m). */
  places: { id: string; radiusM: number }[];
  /** Whether this has been laid on the travel map yet (done once, at the start of a new game). */
  applied: boolean;
  /** Why they know it, for the sheet. */
  notes: string[];
}

export class Knowledge extends Component {
  static readonly key = 'knowledge';
  constructor(public d: KnowledgeData) {
    super();
  }
  toJSON(): KnowledgeData {
    return JSON.parse(JSON.stringify(this.d));
  }
  static fromJSON(d: KnowledgeData): Knowledge {
    return new Knowledge(d);
  }
}
