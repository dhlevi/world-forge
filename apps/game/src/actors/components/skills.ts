/** Skills (learnt by use, with rust and a daily limit), languages and regional knowledge. */
import { Component } from '../actor';
import type { Message } from '../../engine/messages';
import { KNOWLEDGE, SKILL, SKILLS, skillWord, type KnowledgeKind } from '../data/skills';
import { clamp, diceStep, hash32 } from '../../util';
import { Identity } from './identity';
import { Traits } from './traits';
import './time';

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
