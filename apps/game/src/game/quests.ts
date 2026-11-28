/**
 * The quest engine (docs/design/quests.md; stages Q2 and Q2b): premises taken from the world and
 * turned by story templates (game/quests/templates.ts) into quests made a part at a time.
 *
 * - **Offers.** A town's notice boards (three to five notices, the same through a week) and the
 *   people asked for work offer what the templates allow there: each template names the places
 *   that post it and the trades that ask it, and what the country must hold (its beasts, its ruins,
 *   the next town). Obligations (stage Q3) start their own.
 * - **Roles** are bound from the world when a quest is made (a resident, the region's wolves, the
 *   barrow to the north, a herd's last whereabouts) and watched, not held: each turn and on loading,
 *   a role no longer valid is handled by its policy: another takes it (Reassign, a giver's household),
 *   the task changes to fit (Pivot, beasts found dead), the quest closes (Overtaken), or a debt is
 *   waived.
 * - **Beats** become parts only as the wanderer reaches them, each with one to three tasks from
 *   the world as it is then. How a part ends picks the next: a branch for the way a talk went, a
 *   flag (and growth a level, Escalation) when a deeper cause is found, the next beat, or a fallback
 *   when a beat cannot be made. Clocks change the world while the wanderer is about it.
 * - **Tasks** are checked as the world goes: things carried and handed over (Collect), a thing or
 *   beasts found and brought back (Retrieve), things carried to a person or town (Deliver), places
 *   reached and leads followed (Explore), clues found (Investigate), beasts killed (Defeat), a talk
 *   and how it went (Talk), and time lived through (Survive).
 * - **Leads** may be wrong, but never end on nothing: a false one gives a clue that rules it out.
 * - **Marks:** done in under half the time (Fast), with no crime on the way (Clean), and with the
 *   optional parts done (Thorough), each raises the pay a quarter, as far as the giver can pay.
 * - **The journal** keeps plain facts and tells them in words when shown.
 *
 * Proposed numbers, to tune in play.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { SPECIES_BY_ID, type Species } from '@worldforge/core/local/fauna';
import { TILE_M } from '@worldforge/core/local/chunk';
import { check, DC } from '../actors/checks';
import { Skills } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { makeItem, type Item } from '../actors/items/item';
import { hideId } from '../actors/items/defs';
import type { Resident } from '../world/population';
import type { SiteInfo, SitePlace } from '../worker/protocol';
import { bearing, cap, compassWord } from '../util';
import type { PlaySession } from './session';
import { levelAbove, partLevel, TYPE_MARKS, whoOf, type Fact, type Lead, type Mark, type Part, type QTask, type Quest, type QuestsData, type RoleRef } from './quests/model';
import { TEMPLATE_BY_ID, TEMPLATES, type BeatSpec, type TaskSpec, type Template } from './quests/templates';

export type { Quest, QuestsData, RoleRef } from './quests/model';
export { whoOf } from './quests/model';

const WEEK = 7 * 86400;
/** How far off a ruin or lair may be (km), and a town for a letter. */
const LAIR_KM = 15, TOWN_KM = 40;
/** The kinds of place with a notice board. */
export const BOARD_KINDS = new Set(['market', 'inn', 'tavern', 'temple', 'civic', 'guild', 'keep']);
/** Where a thing for a town is handed over (anyone there will see it delivered). */
export const HANDOVER_KINDS = new Set(['inn', 'tavern', 'market', 'civic', 'guild']);
/** Bounty by a beast's size (copper), and how many a bounty asks for. */
const SIZE_BOUNTY: Record<string, number> = { small: 6, medium: 15, large: 30 };
/** Beasts kept, by the keeper's trade. */
const KEPT: [RegExp, string[]][] = [[/shepherd/, ['sheep']], [/goatherd/, ['goat']], [/swineherd/, ['pig']], [/drover|herder/, ['cattle']], [/farmer|cottar|plough/, ['sheep', 'cattle', 'goat', 'pig']]];
/** Each mark met raises the pay so much, as far as the giver's means allow. */
const MARK_STEP = 0.25;
const MEANS_CAP: Record<string, number> = { destitute: 0, poor: 0.25, middling: 0.5, comfortable: 0.75, rich: 1 };

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n: number) => NUM[n] ?? String(n);

/** What the country about a settlement holds, for its quests: its wild beasts, its ruins and lairs, its neighbours. */
export interface Country {
  beasts: { id: string; density: number }[];
  lairs: { name: string; lon: number; lat: number }[];
  towns: { id: string; name: string; tier: string; lon: number; lat: number; km: number }[];
}

/** An obligation that starts a quest of its own (stage Q3: what character creation leaves owing). */
export interface Obligation {
  id: string;
  template: string;
  /** The person it is with (a creditor, a love, a rival), and kin who stand in for them or know of them. */
  party: RoleRef;
  kin?: RoleRef;
  /** What is owed or at stake (copper), and in words. */
  amount: number;
  what: string;
  /** Words for its text ({town}, {why}, {since}), flags it begins with, and days until it is due. */
  words?: Record<string, string>;
  flags?: string[];
  dueDays?: number;
  /** The quest the life began with (shown first in the journal). */
  featured?: boolean;
}

/** Something the wanderer can say or do for a quest (in a talk, or at a place). */
export interface QuestOption {
  id: string;
  label: string;
  why?: string | null;
}

/** Metres between two points (lon/lat). */
function metres(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * 111320 * cos, (a.lat - b.lat) * 110540);
}
/** A point so many metres off from another, on a bearing (degrees from north). */
function offset(p: { lon: number; lat: number }, deg: number, m: number): { lon: number; lat: number } {
  const r = (deg * Math.PI) / 180, cos = Math.cos((p.lat * Math.PI) / 180);
  return { lon: p.lon + (Math.sin(r) * m) / (111320 * cos), lat: p.lat + (Math.cos(r) * m) / 110540 };
}
/** The direction from one point to another, in words. */
function dirTo(a: { lon: number; lat: number }, b: { lon: number; lat: number }): string {
  const cos = Math.cos((a.lat * Math.PI) / 180);
  return compassWord(bearing((b.lon - a.lon) * 111320 * cos, (b.lat - a.lat) * 110540));
}

/** A title within a sentence: its first letter small, unless it starts a name. */
const lowerFirst = (t: string) => (/^(A|An|The) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** Copper in words ("1 silver and 4 copper"). */
export function moneyWords(c: number): string {
  return c >= 10 && c % 10 === 0 ? `${c / 10} silver` : c >= 10 ? `${Math.floor(c / 10)} silver and ${c % 10} copper` : `${c} copper`;
}

/** A place's name as a poster: a plain word for its kind ("Temple") is "the temple". */
export function placeName(name: string): string {
  return /^[A-Z][a-z]+$/.test(name) ? `the ${name.toLowerCase()}` : name.replace(/^The /, 'the ');
}

/** Fills a template's words: {key}, {Key} (capitalised), and {s:third|first} by who speaks. */
export function fill(text: string, words: Record<string, string>, firstPerson = false): string {
  return text.replace(/\{s:([^|}]*)\|([^}]*)\}/g, (_m, third: string, first: string) => (firstPerson ? first : third)).replace(/\{([A-Za-z]+)\}/g, (_m, k: string) => {
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    const w = words[k] ?? words[lower];
    if (w === undefined) return k;
    return k !== lower ? cap(w) : w;
  });
}

export class Quests {
  list: Quest[] = [];
  /** The country about each settlement or stretch of the wilds (asked of the worker once a game). */
  private country = new Map<string, Country | null>();
  /** What was said while acting (returned to the talk or the place). */
  private said: string[] = [];

  constructor(private readonly s: PlaySession) {}

  private get g() {
    return this.s.game;
  }

  private get inv(): Inventory | undefined {
    return this.s.player?.get(Inventory);
  }

  /** The quests the wanderer has taken and not yet finished. */
  active(): Quest[] {
    return this.list.filter((q) => q.state === 'active');
  }

  /** The part under way of a quest. */
  current(q: Quest): Part | undefined {
    const p = q.parts[q.parts.length - 1];
    return p?.state === 'active' ? p : undefined;
  }

  // ---- The country about ----------------------------------------------------------------------------

  /** Asks the worker about the country of a settlement (its beasts, ruins and neighbours), once. */
  async prepare(key: string, lon: number, lat: number): Promise<Country | null> {
    if (this.country.has(key)) return this.country.get(key) ?? null;
    this.country.set(key, null);
    const w = this.s.world;
    const beasts = (await w.game?.(lon, lat, this.s.sky.season === 'winter')) ?? [];
    const area = w.requestArea ? await w.requestArea({ west: lon - 0.25, east: lon + 0.25, south: lat - 0.18, north: lat + 0.18 }, true) : { roads: [], places: [] };
    const km = (p: { lon: number; lat: number }) => metres(p, { lon, lat }) / 1000;
    const c: Country = {
      beasts,
      lairs: area.places.filter((p) => p.tier === 'lair' && km(p) <= LAIR_KM).sort((a, b) => km(a) - km(b)).slice(0, 4).map((p) => ({ name: p.name, lon: p.lon, lat: p.lat })),
      towns: area.places.filter((p) => p.tier !== 'lair' && p.id !== key && km(p) >= 2).map((p) => ({ id: p.id, name: p.name, tier: p.tier, lon: p.lon, lat: p.lat, km: km(p) })).sort((a, b) => a.km - b.km).slice(0, 6),
    };
    this.country.set(key, c);
    return c;
  }

  /** Where the wanderer is, for the country about: the settlement they are in, or a stretch of the wilds (about 20 km across). */
  hereKey(): { key: string; lon: number; lat: number } {
    const [lon, lat] = this.s.travel.party();
    const town = this.s.justice.settlement();
    return town ? { key: town.id, lon, lat } : { key: `wild:${Math.round(lon * 5)}:${Math.round(lat * 5)}`, lon, lat };
  }

  /** Asks about the country where the wanderer is, if it has not been asked yet (each turn; cheap once asked). */
  prepareHere(): Promise<Country | null> | null {
    const h = this.hereKey();
    return this.country.has(h.key) ? null : this.prepare(h.key, h.lon, h.lat);
  }

  countryOf(key: string): Country | null {
    return this.country.get(key) ?? null;
  }

  // ---- Making quests from templates ---------------------------------------------------------------------

  private species(c: Country | null, pred: (s: Species) => boolean): Species[] {
    return (c?.beasts ?? []).map((b) => SPECIES_BY_ID.get(b.id)).filter((s): s is Species => !!s && pred(s));
  }

  private holds(t: Template, giver: RoleRef, c: Country | null, ob?: Obligation): boolean {
    return t.preconditions.every((p) => {
      switch (p) {
        case 'country.predator': return this.species(c, isPredator).length > 0;
        case 'country.hide': return this.species(c, hasHide).length > 0;
        case 'country.town': return (c?.towns ?? []).some((x) => x.km <= TOWN_KM);
        case 'country.lair': return (c?.lairs.length ?? 0) > 0;
        case 'giver.keepsBeasts': return giver.kind === 'person' && KEPT.some(([re]) => re.test(giver.name));
        case 'obligation': return !!ob;
      }
      return false;
    });
  }

  /**
   * A quest from a template for a giver, its roles bound from the country about (by a seeded roll);
   * null if a role it must have cannot be filled. Offered, not yet taken.
   */
  make(t: Template, giver: RoleRef, c: Country | null, seed: number, at: { lon: number; lat: number }, o: { ob?: Obligation; heirs?: RoleRef['heirs']; words?: Record<string, string> } = {}): Quest | null {
    if (!this.holds(t, giver, c, o.ob)) return null;
    const rnd = mulberry32(seed);
    const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(rnd() * xs.length)];
    const n = t.n ? t.n[0] + Math.floor(rnd() * (t.n[1] - t.n[0] + 1)) : 1;
    const deep = rnd() < (t.escalationChance ?? 0);
    const words: Record<string, string> = { n: num(n), days: String(t.days ?? ''), giver: whoOf(giver), ...(o.ob?.words ?? {}), ...(o.words ?? {}), ...(o.ob?.dueDays !== undefined ? { dueDays: String(o.ob.dueDays) } : {}) };
    const roles: Record<string, RoleRef | null> = {};
    const g = { ...giver, ...(o.heirs ? { heirs: o.heirs } : {}) };
    let n2 = n;
    for (const [key, spec] of Object.entries(t.roles)) {
      let r: RoleRef | null = null;
      switch (spec.source) {
        case 'giver':
          r = g;
          break;
        case 'regionPredator': {
          // A herd may simply have strayed: then no culprit (unless there is a deeper cause to find).
          if (spec.optional && !deep && rnd() < 0.3) break;
          const sp = pick(this.species(c, (s) => isPredator(s) && s.size !== 'huge'));
          if (sp) r = { kind: 'species', id: sp.id, name: sp.name, species: sp.id };
          break;
        }
        case 'regionHide': {
          const sp = pick(this.species(c, (s) => hasHide(s) && s.size !== 'huge'));
          if (sp) {
            r = { kind: 'species', id: sp.id, name: sp.name, species: sp.id };
            words.hide = hideId(sp);
            words.hides = hideId(sp).startsWith('pelt') ? 'pelts' : 'hides';
          }
          break;
        }
        case 'nearTown': {
          const near = (c?.towns ?? []).filter((x) => x.km <= TOWN_KM).slice(0, 3);
          const tw = pick(near);
          if (tw) {
            r = { kind: 'site', id: tw.id, name: tw.name, siteId: tw.id, siteName: tw.name, lon: tw.lon, lat: tw.lat };
            words.km = String(Math.round(tw.km));
            words.dir = dirTo(at, tw);
          }
          break;
        }
        case 'nearLair': {
          const l = pick(c?.lairs ?? []);
          if (l) {
            r = { kind: 'lair', id: l.name, name: l.name, lon: l.lon, lat: l.lat };
            words.km = String(Math.max(1, Math.round(metres(at, l) / 1000)));
            words.dir = dirTo(at, l);
          }
          break;
        }
        case 'giverBeasts': {
          const kinds = giver.kind === 'person' ? KEPT.find(([re]) => re.test(giver.name))?.[1] : undefined;
          const sp = kinds && SPECIES_BY_ID.get(pick(kinds)!);
          if (sp && giver.lon !== undefined && giver.lat !== undefined) {
            const spot = offset({ lon: giver.lon, lat: giver.lat }, rnd() * 360, 1200 + rnd() * 2300);
            r = { kind: 'beasts', id: `${giver.id}#${sp.id}`, name: `${whoOf(giver)}'s ${sp.plural}`, species: sp.id, count: n, state: 'astray', ...spot };
            words.kept = sp.plural;
          }
          break;
        }
        case 'deepLair': {
          const prize = Object.values(roles).find((x) => x?.kind === 'beasts');
          if (!deep || !prize?.lon) break;
          const l = (c?.lairs ?? []).filter((x) => metres(x, { lon: prize.lon!, lat: prize.lat! }) < 9000)[0];
          if (l) r = { kind: 'lair', id: l.name, name: l.name, lon: l.lon, lat: l.lat };
          break;
        }
        case 'obligationParty':
          r = o.ob ? { ...o.ob.party } : null;
          break;
        case 'obligationKin':
          r = o.ob?.kin ? { ...o.ob.kin } : null;
          break;
        case 'obligationRecord':
          r = o.ob ? { kind: 'debt', id: o.ob.id, name: o.ob.what, count: o.ob.amount } : null;
          if (o.ob) words.amount = moneyWords(o.ob.amount);
          break;
      }
      if (!r && spec.onMissing === 'abort') return null;
      if (o.ob) {
        words.amount ??= moneyWords(o.ob.amount);
        words.amountN = String(o.ob.amount);
      }
      roles[key] = r;
      if (r) {
        words[key] = whoOf(r);
        if (r.kind === 'species') {
          const sp = SPECIES_BY_ID.get(r.species!)!;
          words[`${key}s`] = sp.plural;
        }
      }
    }
    // A bounty's count goes by the beast's size.
    const prey = roles.prey?.species ? SPECIES_BY_ID.get(roles.prey.species) : undefined;
    if (prey) {
      n2 = prey.size === 'small' ? 2 + Math.floor(rnd() * 2) : prey.size === 'large' ? 1 : 1 + Math.floor(rnd() * 2);
      words.preyN = n2 === 1 ? `a ${prey.name}` : `${num(n2)} ${prey.plural}`;
      words.troubled = n2 === 1 ? `A ${prey.name} has` : `${cap(prey.plural)} have`;
      words.them = n2 === 1 ? 'it' : `${num(n2)} of them`;
      if (t.reward.perPrey) words.n = num(n2);
    }
    // A notice is the giver's words: a person's own, a place's in the third person.
    const me = giver.kind === 'person';
    const copper = Math.round(t.reward.base + (t.reward.perN ?? 0) * n + (t.reward.perKm ?? 0) * Number(words.km ?? 0) + (t.reward.perPrey && prey ? n2 * (SIZE_BOUNTY[prey.size] ?? 15) : 0));
    const giverKey = giver.kind === 'place' ? giver.placeId : giver.id;
    const q: Quest = {
      id: `q${hashString(`${giver.kind}:${giverKey}:${t.id}:${o.ob?.id ?? `${Math.floor(this.g.time / WEEK)}:${seed}`}`).toString(36)}`,
      template: t.id, level: t.baseLevel, title: cap(fill(t.title, words)),
      text: cap(fill(t.text, { ...words, giver: me ? 'I' : whoOf(giver) }, me)),
      giver: roles.giver ?? roles.creditor ?? Object.entries(t.roles).map(([k, r2]) => (r2.source === 'obligationParty' || r2.source === 'obligationKin' ? roles[k] : null)).find((x) => !!x) ?? g,
      roles, parts: [], beat: null, flags: [...(o.ob?.flags ?? [])], state: 'offered', posted: this.g.time,
      reward: { copper, regard: t.reward.regard }, spoilt: [], facts: [], seed, n: prey && t.reward.perPrey ? n2 : n, deep, words,
    };
    if (prey) q.words.preyCount = String(n2);
    return q;
  }

  /** The notices posted on a town's boards this week (three to five; every board shows the town's). */
  notices(site: SiteInfo, place?: SitePlace): Quest[] {
    void place;
    const c = this.countryOf(site.id);
    if (!c) return [];
    const week = Math.floor(this.g.time / WEEK);
    const rnd = mulberry32(hashString(`${this.s.o.settings.seed}#notices#${site.id}#${week}`));
    const posting = (p: SitePlace) => TEMPLATES.filter((t) => t.posts && new RegExp(t.posts).test(p.role ?? p.kind));
    const posters = site.places.filter((p) => posting(p).length).map((p) => ({ p, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.p);
    const n = 3 + Math.floor(rnd() * 3), out: Quest[] = [];
    for (const p of posters) {
      if (out.length >= n) break;
      const giver: RoleRef = { kind: 'place', id: p.id, placeId: p.id, name: placeName(p.name), siteId: site.id, siteName: site.name, lon: p.lon, lat: p.lat };
      const seed = hashString(`${site.id}#${p.id}#${week}`);
      const choices = posting(p).filter((t) => this.holds(t, giver, c));
      const t = choices[Math.floor(mulberry32(seed)() * choices.length)];
      if (!t || out.some((x) => x.giver.name === giver.name)) continue;
      const q = this.make(t, giver, c, seed, { lon: site.lon, lat: site.lat });
      if (q && !out.some((x) => x.title === q.title)) out.push(this.known(q));
    }
    return out;
  }

  /** A quest already known (taken, or done) in place of a fresh copy of it. */
  private known(q: Quest): Quest {
    return this.list.find((x) => x.id === q.id) ?? q;
  }

  /** What a person asks of the wanderer, if anything (by their trade, the country, and a weekly roll). */
  askOf(r: Resident): Quest | null {
    const trade = r.p.trade.toLowerCase();
    if (r.p.age < 16) return null;
    const town = this.s.justice.settlement();
    const c = this.countryOf(this.hereKey().key);
    if (!c) return null;
    const week = Math.floor(this.g.time / WEEK), seed = hashString(`${r.p.id}#asks#${week}`), rnd = mulberry32(seed);
    if (rnd() > 0.6) return null;
    const [lon, lat] = this.s.travel.frame.toLL([(r.x + 0.5) * TILE_M, -(r.y + 0.5) * TILE_M]);
    const giver: RoleRef = { kind: 'person', id: r.p.id, name: trade, given: r.p.given, means: r.p.means, siteId: town?.id ?? null, siteName: town?.name ?? 'the country', lon, lat };
    const choices = TEMPLATES.filter((t) => t.asks && new RegExp(t.asks).test(trade) && this.holds(t, giver, c));
    const t = choices[Math.floor(rnd() * choices.length)];
    if (!t) return null;
    // The household, who would take the giver's part if they died.
    const heirs = [...this.s.people.everyone()].filter((x) => x.p.homeId === r.p.homeId && x.p.id !== r.p.id && x.p.age >= 16).map((x) => ({ id: x.p.id, name: x.p.trade.toLowerCase(), given: x.p.given }));
    const q = this.make(t, giver, c, seed, { lon, lat }, { heirs });
    return q ? this.known(q) : null;
  }

  /** An obligation's own quest (stage Q3), taken up at once. */
  fromObligation(ob: Obligation): Quest | null {
    const t = TEMPLATE_BY_ID.get(ob.template);
    if (!t) return null;
    const h = this.hereKey();
    const q = this.make(t, ob.party, this.countryOf(h.key), hashString(`${ob.id}#${ob.template}`), h, { ob });
    if (!q || this.list.some((x) => x.id === q.id)) return q;
    if (ob.featured) q.featured = true;
    this.take(q);
    return q;
  }

  // ---- Taking up, and the parts -------------------------------------------------------------------------

  take(q: Quest): string {
    if (this.list.some((x) => x.id === q.id && x.state !== 'offered')) return 'You have that work in hand already.';
    const t = TEMPLATE_BY_ID.get(q.template);
    if (!t) return 'That work is no longer to be had.';
    const now = this.g.time;
    q.state = 'active';
    q.took = now;
    q.deadline = t.days ? now + t.days * 86400 : undefined;
    q.fair = t.fairDays ? t.fairDays * 86400 : undefined;
    const dueDays = q.words.dueDays !== undefined ? Number(q.words.dueDays) : t.dueDays;
    if (dueDays !== undefined) q.due = now + dueDays * 86400;
    this.fact(q, { act: t.preconditions.includes('obligation') ? 'carried' : 'took', who: whoOf(q.giver), what: q.title, pay: q.reward.copper });
    if (!this.list.includes(q)) this.list.push(q);
    this.enter(q, t.start);
    return `You take on the work: "${q.title}". (Shift+Q: your journal.)`;
  }

  giveUp(q: Quest): void {
    q.state = 'failed';
    this.fact(q, { act: 'gave-up' });
    this.dropItems(q);
  }

  private fact(q: Quest, f: Omit<Fact, 't'>): void {
    q.facts.push({ t: this.g.time, ...f });
  }

  private say(text: string): void {
    this.said.push(text);
  }

  /** Whether a role is filled and still valid. */
  private valid(q: Quest, key: string): boolean {
    const r = q.roles[key];
    if (!r) return false;
    if (r.kind === 'person') return !this.s.people.dead.has(r.id);
    return true;
  }

  /** Begins a beat: a part with its tasks, made from the world as it is now; or its fallback if it cannot be made. */
  private enter(q: Quest, id: string, depth = 0): void {
    const t = TEMPLATE_BY_ID.get(q.template)!;
    const b = t.beats.find((x) => x.id === id);
    if (!b || depth > 8) return this.end(q);
    if ((b.needs ?? []).some((k) => !this.valid(q, k))) {
      this.fact(q, { act: 'skipped', what: b.title });
      return b.fallback ? this.enter(q, b.fallback, depth + 1) : this.end(q);
    }
    q.beat = b.id;
    const part: Part = { beat: b.id, level: b.level ?? partLevel(q.level), title: b.title, tasks: [], state: 'active', began: this.g.time };
    b.tasks.forEach((k, i) => {
      if (k.when && !this.valid(q, k.when)) return;
      part.tasks.push(this.task(q, k, `${b.id}.${i}`));
    });
    q.parts.push(part);
    if (q.parts.length > 1) this.fact(q, { act: 'part', what: b.title });
    if (!part.tasks.length) return this.finish(q, part);
    // Beasts already found dead: the fetching is already the telling.
    for (const k of part.tasks) this.maybePivot(q, k);
  }

  /** A live task from its spec, filled with the quest's words and roles. */
  private task(q: Quest, k: TaskSpec, id: string): QTask {
    const r = k.role ? q.roles[k.role] : null;
    const w = q.words;
    const out: QTask = { id, type: k.type, label: cap(fill(k.label, w)), ...(k.role ? { role: k.role } : {}), ...(k.optional ? { optional: true } : {}) };
    if (k.match) out.match = fill(k.match, w);
    if (k.count !== undefined) out.count = k.count === 'n' ? q.n : k.count === 'prey' ? Number(w.preyCount ?? q.n) : k.count;
    if (k.deliverTo) out.deliverTo = k.deliverTo;
    if (k.type === 'defeat') {
      out.got = 0;
      if (r?.species) out.species = [r.species];
    }
    if (k.options) {
      out.options = k.options.filter((o) => !o.needs || o.needs === 'debt' || this.valid(q, o.needs)).map((o) => ({
        id: o.id, label: fill(o.label, w),
        ...(o.needs === 'debt' ? { needsCopper: q.roles.debt?.count ?? Number(w.amountN ?? 0) } : {}),
        ...(o.check ? { check: { ...o.check } } : {}),
        ...(o.gain !== undefined ? { gain: o.gain === 'amount' ? Number(w.amountN ?? 0) : o.gain } : {}),
        ...(o.regard ? { regard: o.regard } : {}),
      }));
    }
    if (k.clue) out.clue = { ...k.clue };
    if (k.pivot) out.pivot = { type: k.pivot.type, label: cap(fill(k.pivot.label, w)) };
    if (k.hours) {
      out.seconds = k.hours * 3600;
      out.since = this.g.time;
    }
    if (k.flagOnDone) out.clue = { ...(out.clue ?? { skills: [], dc: 0 }), flag: k.flagOnDone };
    if (r && (k.type === 'explore' || k.type === 'investigate') && r.lon !== undefined && r.lat !== undefined) {
      if (k.leads === 'trail') out.leads = this.trail(q, r);
      else if (k.leads === 'role') out.leads = [{ text: `${cap(whoOf(r))}, ${this.distWords(r)}`, lon: r.lon, lat: r.lat!, radiusM: 150, sure: true }];
      else {
        out.lon = r.lon;
        out.lat = r.lat;
        out.radiusM = 150;
      }
    }
    if (k.type === 'deliver' && r) {
      out.siteId = r.kind === 'site' ? r.id : undefined;
      if (k.item) {
        const it = makeItem(k.item.def, { name: fill(k.item.name, q.words) });
        it.quest = q.id;
        out.item = it.uid;
        this.inv?.stow(it);
        this.s.player?.changed();
      }
    }
    if (k.type === 'collect' && k.role && r?.species && !out.match) out.match = `^${hideId(SPECIES_BY_ID.get(r.species)!)}$`;
    return out;
  }

  private distWords(p: { lon?: number; lat?: number }): string {
    const [lon, lat] = this.s.travel.party();
    if (p.lon === undefined || p.lat === undefined) return 'somewhere about';
    const m = metres({ lon, lat }, { lon: p.lon, lat: p.lat });
    return m < 1500 ? 'close by' : `${Math.round(m / 1000)} km to the ${dirTo({ lon, lat }, { lon: p.lon, lat: p.lat })}`;
  }

  /** The trail of missing beasts: where they truly went, and a neighbour's word that is wrong. */
  private trail(q: Quest, r: RoleRef): Lead[] {
    const rnd = mulberry32(q.seed ^ 0x51ed);
    const from = { lon: q.giver.lon ?? r.lon!, lat: q.giver.lat ?? r.lat! };
    const to = { lon: r.lon!, lat: r.lat! };
    const sure: Lead = { text: `Tracks of ${q.words.kept ?? 'beasts'} heading ${dirTo(from, to)}, ${Math.round(metres(from, to) / 100) / 10} km from home`, ...to, radiusM: 120, sure: true };
    const wrongDir = (bearingOf(from, to) + 90 + rnd() * 180) % 360;
    const wrong = offset(from, wrongDir, 900 + rnd() * 1200);
    const false_: Lead = { text: `A neighbour thinks the ${q.words.kept ?? 'beasts'} went ${dirTo(from, wrong)}, ${Math.round(metres(from, wrong) / 100) / 10} km off`, ...wrong, radiusM: 120, sure: false };
    return rnd() < 0.5 ? [sure, false_] : [false_, sure];
  }

  /** Beasts of the quest found dead (or a role gone): a task with a Pivot turns to what can be done. */
  private maybePivot(q: Quest, k: QTask): void {
    if (!k.pivot || k.done || !k.role) return;
    const r = q.roles[k.role];
    if (r?.kind === 'beasts' && r.state === 'dead') {
      this.fact(q, { act: 'pivot', what: k.label, why: `the ${q.words.kept ?? 'beasts'} are dead` });
      k.type = k.pivot.type;
      k.label = k.pivot.label;
      k.role = k.deliverTo ?? 'giver';
      delete k.deliverTo;
      delete k.pivot;
    }
  }

  /** Ends the part under way: the next beat by how it went (a branch, a flag and growth, or the next), or the end. */
  private finish(q: Quest, part: Part): void {
    const t = TEMPLATE_BY_ID.get(q.template)!;
    const b = t.beats.find((x) => x.id === part.beat)!;
    part.state = 'done';
    part.ended = this.g.time;
    part.outcome = part.tasks.find((k) => k.outcome)?.outcome;
    let next: string | null | undefined = b.next;
    if (part.outcome && b.branches?.[part.outcome]) next = b.branches[part.outcome];
    else if (b.onComplete && q.flags.includes(b.onComplete.ifFlag)) {
      next = b.onComplete.next;
      if (b.onComplete.escalate) this.escalate(q, t);
    }
    if (next) this.enter(q, next);
    else this.end(q);
  }

  private escalate(q: Quest, t: Template): void {
    const top = t.escalatesTo ?? q.level;
    const up = levelAbove(q.level);
    if (q.level === top) return;
    q.level = up;
    this.fact(q, { act: 'grew', what: up });
    this.g.say(`What began as ${lowerFirst(q.title)} is more than it seemed.`);
  }

  /** The quest is over: paid by its marks, the giver's regard won, or settled. */
  private end(q: Quest): void {
    if (q.state !== 'active') return;
    const t = TEMPLATE_BY_ID.get(q.template);
    q.beat = null;
    q.state = 'done';
    const now = this.g.time;
    // The marks: those that count for its tasks, and that were met.
    const types = new Set(q.parts.flatMap((p) => p.tasks.map((k) => k.type)));
    const counts = new Set<Mark>([...types].flatMap((k) => TYPE_MARKS[k]));
    const met: Mark[] = [];
    const spent = now - (q.took ?? now), allowed = q.deadline ? q.deadline - (q.took ?? now) : q.fair;
    if (counts.has('fast') && allowed && spent <= allowed / 2) met.push('fast');
    if (counts.has('clean') && !q.spoilt.includes('clean')) met.push('clean');
    const optional = q.parts.flatMap((p) => p.tasks.filter((k) => k.optional || k.clue?.need));
    if (counts.has('thorough') && optional.length && optional.every((k) => k.done)) met.push('thorough');
    q.marks = met;
    const factor = t?.reward.ifFlag && q.flags.includes(t.reward.ifFlag.flag) ? t.reward.ifFlag.factor : 1;
    const cap_ = q.giver.kind === 'person' ? MEANS_CAP[q.giver.means ?? 'middling'] ?? 0.5 : 0.75;
    const pay = Math.round(q.reward.copper * factor * (1 + Math.min(cap_, met.length * MARK_STEP)));
    if (pay > 0) this.inv?.earn(pay);
    if (q.giver.kind === 'person' && q.reward.regard) this.s.people.opinions.add(q.giver.id, q.giver.name, 'did what I asked', q.reward.regard * factor, now, 30);
    if (q.giver.kind === 'place' && q.giver.siteId) this.s.law.deed({ id: q.giver.siteId, name: q.giver.siteName ?? '' }, `work done for ${q.giver.name}`, Math.round(q.reward.regard / 2), now);
    this.dropItems(q);
    const outcome = q.parts.map((p) => p.outcome).filter(Boolean).pop();
    this.fact(q, { act: 'done', pay, what: met.join(','), why: outcome });
    this.s.player?.changed();
    if (pay > 0) this.say(`The work is done: ${moneyWords(pay)} paid${met.length ? ` (${met.map((m) => MARK_WORDS[m]).join(', ')})` : ''}.`);
    else this.say(`That is settled: ${lowerFirst(q.title)}.`);
  }

  private close(q: Quest, state: 'expired' | 'overtaken' | 'waived', why: string): void {
    q.state = state;
    q.beat = null;
    this.fact(q, { act: state, why });
    this.dropItems(q);
    this.g.say(state === 'expired' ? `The time for "${q.title}" has run out.` : state === 'waived' ? `${cap(why)}: "${q.title}" is settled.` : `${cap(why)}: "${q.title}" is no more.`);
  }

  private dropItems(q: Quest): void {
    const inv = this.inv;
    if (!inv) return;
    for (const it of inv.d.items.filter((i) => i.quest === q.id)) inv.drop(it.uid);
  }

  // ---- As the world goes ---------------------------------------------------------------------------------

  /** A beast killed by the wanderer (or dead of wounds dealt): counted toward any task to kill its kind. */
  onKill(species: string): void {
    const sp = SPECIES_BY_ID.get(species);
    for (const q of this.active()) {
      const part = this.current(q);
      for (const k of part?.tasks ?? []) {
        if (k.type !== 'defeat' || k.done || !k.species?.includes(species)) continue;
        k.got = (k.got ?? 0) + 1;
        this.fact(q, { act: 'killed', what: sp?.name ?? species, n: k.got, of: k.count });
        if (k.got >= (k.count ?? 1)) {
          k.done = true;
          this.g.say(`${cap(k.label)}: that is done for "${q.title}".`);
        }
      }
      if (part) this.settle(q, part);
    }
  }

  /** A crime done while at work spoils its Clean mark. */
  onCrime(): void {
    for (const q of this.active()) if (!q.spoilt.includes('clean')) q.spoilt.push('clean');
  }

  /** Each turn: roles checked, clocks, deadlines, places reached, clues, time lived through. */
  run(): void {
    const g = this.g, now = g.time;
    const [lon, lat] = this.s.travel.party();
    const here = { lon, lat };
    for (const q of this.active()) {
      if (q.deadline && now > q.deadline) {
        this.close(q, 'expired', 'the time ran out');
        continue;
      }
      if (!this.reconcile(q)) continue;
      this.clocks(q);
      const part = this.current(q);
      if (!part) continue;
      for (const k of part.tasks) {
        if (k.done) continue;
        this.maybePivot(q, k);
        if ((k.type === 'explore' || k.type === 'investigate') && k.leads) this.followLeads(q, k, here);
        else if (k.type === 'explore' && k.lon !== undefined && k.lat !== undefined && metres(here, { lon: k.lon, lat: k.lat }) <= (k.radiusM ?? 150)) {
          k.done = true;
          this.fact(q, { act: 'reached', where: k.label.replace(/ seen$/, '') });
          g.say(`You have seen ${k.label.replace(/ seen$/, '').replace(/^The /, 'the ')} for yourself.`);
        } else if (k.type === 'survive' && k.since !== undefined && now - k.since >= (k.seconds ?? 0)) {
          k.done = true;
          this.fact(q, { act: 'survived', what: k.label });
          if (k.clue?.flag && q.deep && !q.flags.includes(k.clue.flag)) q.flags.push(k.clue.flag);
          g.say(`${cap(k.label)}: you have.`);
        }
      }
      this.settle(q, part);
    }
    for (const m of this.said.splice(0)) g.say(m);
  }

  /** Ends the part under way if every task it must have is done. */
  private settle(q: Quest, part: Part): void {
    if (q.state === 'active' && part.state === 'active' && part.tasks.every((k) => k.done || k.optional)) this.finish(q, part);
  }

  /**
   * Checks the roles of a quest against the world (each turn, and again after loading): a person
   * dead is followed by their household (Reassign), or the quest closes (Overtaken), or a debt with
   * no one left to claim it is waived. Returns whether the quest goes on.
   */
  private reconcile(q: Quest): boolean {
    const t = TEMPLATE_BY_ID.get(q.template);
    if (!t) return true;
    for (const [key, r] of Object.entries(q.roles)) {
      if (!r || this.valid(q, key)) continue;
      const policy = t.roles[key]?.onInvalidated ?? 'overtaken';
      if (policy === 'ignore' || policy === 'pivot') continue;
      if (policy === 'reassign') {
        const heir = (r.heirs ?? []).find((h) => !this.s.people.dead.has(h.id));
        if (heir) {
          const next: RoleRef = { ...r, id: heir.id, name: heir.name, given: heir.given, heirs: r.heirs!.filter((h) => h.id !== heir.id), was: whoOf(r) };
          q.roles[key] = next;
          if (q.giver.id === r.id) q.giver = next;
          q.words[key] = whoOf(next);
          if (key === 'giver' || key === 'creditor') q.words.giver = whoOf(next);
          // The tasks name the one now in the role.
          for (const p of q.parts) for (const k of p.tasks) k.label = k.label.split(whoOf(r)).join(whoOf(next));
          this.fact(q, { act: 'reassigned', who: whoOf(next), what: whoOf(r) });
          this.g.say(`${whoOf(r)} is dead; ${whoOf(next)} takes up the matter of "${q.title}".`);
          continue;
        }
      }
      if (policy === 'waive' || (policy === 'reassign' && t.roles.debt)) {
        this.close(q, 'waived', `${whoOf(r)} is dead, and no one is left to claim it`);
        return false;
      }
      this.close(q, 'overtaken', `${whoOf(r)} is dead`);
      return false;
    }
    return true;
  }

  /** The template's clocks: beasts left too long are dead. */
  private clocks(q: Quest): void {
    const t = TEMPLATE_BY_ID.get(q.template);
    for (const c of t?.clocks ?? []) {
      const from = c.fromDue ? q.due : q.took;
      if (from === undefined || q.flags.includes(c.flag) || this.g.time - from < c.days * 86400) continue;
      if (c.ifRole && !q.roles[c.ifRole]) continue;
      const r = c.role ? q.roles[c.role] : null;
      if (c.whileState && r?.state !== c.whileState) continue;
      q.flags.push(c.flag);
      if (r && c.state) r.state = c.state;
      if (c.effect) this.effect(q, c.effect);
      else this.fact(q, { act: 'clock', what: c.flag });
    }
  }

  /** What a clock does to the world: a debt grows, the creditor's men come, the creditor goes to the law. */
  private effect(q: Quest, e: 'interest' | 'dun' | 'law'): void {
    const debt = q.roles.debt, who = q.roles.creditor ?? q.giver, now = this.g.time;
    if (e === 'interest' && debt?.count) {
      debt.count = Math.round(debt.count * 1.1);
      q.words.amount = moneyWords(debt.count);
      q.words.amountN = String(debt.count);
      for (const p of q.parts) for (const k of p.tasks) for (const o of k.options ?? []) if (o.needsCopper) {
        o.needsCopper = debt.count;
        o.label = o.label.replace(/\(([^()]*)\)$/, `(${q.words.amount})`);
      }
      this.fact(q, { act: 'interest', who: whoOf(who), what: q.words.amount });
      this.g.say(`What you owe ${whoOf(who)} has grown to ${q.words.amount}.`);
    } else if (e === 'dun') {
      if (who.kind === 'person') this.s.people.opinions.add(who.id, who.name, 'will not pay what is owed', -15, now, 60);
      this.fact(q, { act: 'dunned', who: whoOf(who) });
      this.g.say(`Word reaches you that ${whoOf(who)} has sent men asking after you, and after what you owe.`);
    } else if (e === 'law' && who.siteId) {
      this.s.law.crime({ id: who.siteId, name: who.siteName ?? '' }, 'debt', whoOf(who), 1, now, debt?.count ?? 50);
      this.fact(q, { act: 'law', who: whoOf(who), where: who.siteName });
      this.g.say(`${whoOf(who)} has gone to the law in ${who.siteName}: you are wanted there for a debt unpaid.`);
    }
  }

  /** Leads followed: a false one ruled out by what is found there; the sure one found, with a clue check. */
  private followLeads(q: Quest, k: QTask, here: { lon: number; lat: number }): void {
    const a = this.s.player;
    for (const l of k.leads ?? []) {
      if (metres(here, l) > l.radiusM) continue;
      if (!l.followed) {
        l.followed = true;
        if (!l.sure) {
          l.found = `nothing of the ${q.words.kept ?? 'beasts'} came this way; the tracks here are only of deer`;
          this.fact(q, { act: 'false-lead', what: l.text, why: l.found });
          this.g.say(`${cap(l.found)}. That lead was wrong.`);
          continue;
        }
      }
      if (!l.sure) continue;
      // The sure lead: the place is found (Explore), and a clue may tell more (each half hour there).
      const prize = k.role ? q.roles[k.role] : null;
      if (k.type === 'explore' && !k.done) {
        k.done = true;
        if (prize?.kind === 'beasts') {
          l.found = prize.state === 'dead' ? `what is left of the ${q.words.kept}: torn, and long dead` : `the ${q.words.kept}, ${num(prize.count ?? 1)} of them, grazing where they have strayed`;
          if (prize.state !== 'dead') prize.state = 'found';
        } else l.found = `${whoOf(prize)}, seen for yourself`;
        this.fact(q, { act: 'found', what: l.found });
        this.g.say(`You find ${l.found}.`);
      }
      const due = (k as QTask & { lastTry?: number }).lastTry;
      if (k.clue && a && (due === undefined || this.g.time - due >= 1800) && !(k.type === 'investigate' && k.done) && !(k.type === 'explore' && (k.score ?? 0) > 0)) {
        (k as QTask & { lastTry?: number }).lastTry = this.g.time;
        const skill = k.clue.skills.reduce((best, s2) => (this.skillOf(s2) > this.skillOf(best) ? s2 : best), k.clue.skills[0]);
        const r = check(a, skill, { difficulty: k.clue.dc, now: this.g.time });
        if (r.ok) {
          k.score = (k.score ?? 0) + 1;
          const obstacle = q.words.obstacles ?? 'beasts';
          const said = k.type === 'investigate'
            ? `signs of ${obstacle} denning at ${q.words.deeperCause ?? 'the place'}: bones, and wool caught on the thorns`
            : q.deep && q.roles.deeperCause
              ? `the tracks of ${obstacle} among the hoofprints, and more of them going toward ${q.words.deeperCause}`
              : 'no more than strays leave behind';
          if (k.clue.flag && q.deep && q.roles.deeperCause && k.type === 'explore') q.flags.push(k.clue.flag);
          this.fact(q, { act: 'clue', what: said });
          this.g.say(`Reading the ground, you find ${said}.`);
          if (k.type === 'investigate' && k.score >= (k.clue.need ?? 1)) k.done = true;
        } else if (k.type === 'investigate') this.g.say('You search, but find nothing yet. You could look a while longer.');
      }
    }
  }

  private skillOf(id: string): number {
    return this.s.player?.get(Skills)?.effective(id) ?? 0;
  }

  // ---- What can be said or done for a quest ------------------------------------------------------------------

  /** The things carried that count toward a collect task, and how many. */
  carried(k: QTask): { items: Item[]; n: number } {
    const inv = this.inv;
    if (!inv || !k.match) return { items: [], n: 0 };
    const re = new RegExp(k.match);
    const items = inv.d.items.filter((i) => re.test(i.def) && !i.quest);
    return { items, n: items.reduce((x, i) => x + (i.def === 'carcass' ? 3 : i.qty), 0) };
  }

  /** Whether a role is this person or this place. */
  private is(r: RoleRef | null | undefined, who: { personId?: string; placeId?: string }): boolean {
    return !!r && ((r.kind === 'person' && r.id === who.personId) || (r.kind === 'place' && !!who.placeId && r.placeId === who.placeId));
  }

  /**
   * What can be said or done for the quests in hand with someone (a person talked to) or at a place
   * of a town: talks, things handed over, things carried to their town. `siteId` is the town they
   * are in, and `handover` whether things for that town can be left with them.
   */
  optionsFor(who: { personId?: string; placeId?: string; siteId?: string | null; handover?: boolean }): QuestOption[] {
    const out: QuestOption[] = [];
    for (const q of this.active()) {
      const part = this.current(q);
      for (const k of part?.tasks ?? []) {
        if (k.done) continue;
        const id = `q:${q.id}:${k.id}`;
        const target = k.role ? q.roles[k.role] : null;
        if (k.type === 'talk' && this.is(target, who)) {
          if (k.options?.length) for (const o of k.options) out.push({ id: `${id}:${o.id}`, label: o.label, why: o.needsCopper && (this.inv?.d.copper ?? 0) < o.needsCopper ? `You have ${moneyWords(this.inv?.d.copper ?? 0)}.` : null });
          else out.push({ id, label: k.label });
        } else if (k.type === 'collect' && k.deliverTo && this.is(q.roles[k.deliverTo], who)) {
          const n = this.carried(k).n;
          out.push({ id, label: `Hand over ${k.label.charAt(0).toLowerCase()}${k.label.slice(1)}`, why: n < (k.count ?? 1) ? `You have ${n} of the ${k.count} wanted.` : null });
        } else if (k.type === 'retrieve' && k.deliverTo && this.is(q.roles[k.deliverTo], who)) {
          const r = k.role ? q.roles[k.role] : null;
          out.push({ id, label: k.label, why: r?.state === 'driven' ? null : r?.state === 'found' ? 'They are not with you: you must round them up first.' : 'You have not found them yet.' });
        } else if (k.type === 'deliver' && target) {
          const toPerson = this.is(target, who);
          const toTown = target.kind === 'site' && who.siteId === target.id && who.handover;
          if (toPerson || toTown) out.push({ id, label: toTown ? `Leave ${this.itemName(k) ?? 'what you carry'} here, to be delivered` : `Hand over ${this.itemName(k) ?? 'what you carry'}` });
        }
      }
    }
    return out;
  }

  private itemName(k: QTask): string | undefined {
    const it = this.inv?.d.items.find((i) => i.uid === k.item);
    return it?.name ? `the ${it.name}` : undefined;
  }

  /** Says or does one of `optionsFor`; returns what came of it. */
  choose(id: string): string {
    const [, qid, tid, opt] = id.split(':');
    const q = this.active().find((x) => x.id === qid);
    const part = q && this.current(q);
    const k = part?.tasks.find((x) => x.id === tid);
    if (!q || !part || !k || k.done) return '';
    const inv = this.inv, now = this.g.time;
    switch (k.type) {
      case 'talk': {
        const o = k.options?.find((x) => x.id === opt);
        if (k.options?.length && !o) return '';
        if (o?.needsCopper) {
          if (!inv || inv.d.copper < o.needsCopper) return 'You have not the coin.';
          inv.d.copper -= o.needsCopper;
          this.s.player?.changed();
        }
        const them = k.role ? q.roles[k.role] : q.giver;
        let outcome = o?.id;
        // An option tried with a skill: failing, it goes another way.
        if (o?.check && this.s.player) {
          const r = check(this.s.player, o.check.skill, { difficulty: o.check.dc, now: this.g.time });
          if (!r.ok) outcome = `${o.id}:fail`;
        }
        k.outcome = outcome;
        k.done = true;
        this.fact(q, { act: 'talked', who: whoOf(them), what: o?.label ?? k.label, why: outcome?.endsWith(':fail') ? 'failed' : undefined });
        if (o?.gain && inv && !outcome?.endsWith(':fail')) {
          inv.earn(o.gain);
          this.s.player?.changed();
          this.say(`${cap(whoOf(them))} gives you ${moneyWords(o.gain)}.`);
        }
        if (o?.regard && them?.kind === 'person' && !outcome?.endsWith(':fail')) this.s.people.opinions.add(them.id, them.name, o.regard > 0 ? 'we have made our peace' : 'threatened me', o.regard, this.g.time, 120);
        if (o?.id === 'word' && them?.siteId) this.s.law.deed({ id: them.siteId, name: them.siteName ?? '' }, `${whoOf(them)} speaks well of you`, 10, this.g.time);
        if (outcome?.endsWith(':fail')) this.say(`${cap(whoOf(them))} will have none of it.`);
        if (o?.id === 'refuseAndDefy') this.say(`${cap(whoOf(them))} will not forget this.`);
        break;
      }
      case 'collect': {
        const c = this.carried(k);
        if (!inv || c.n < (k.count ?? 1)) return `You have ${c.n} of the ${k.count} wanted.`;
        let left = k.count ?? 1;
        for (const it of c.items) {
          if (left <= 0) break;
          const take = it.def === 'carcass' ? 3 : Math.min(left, it.qty);
          if (it.def === 'carcass' || take >= it.qty) inv.drop(it.uid);
          else it.qty -= take;
          left -= take;
        }
        k.done = true;
        this.fact(q, { act: 'handed', what: k.label, who: whoOf(q.roles[k.deliverTo!]) });
        this.s.player?.changed();
        break;
      }
      case 'retrieve': {
        const r = k.role ? q.roles[k.role] : null;
        if (r?.state !== 'driven') return 'You have not brought them.';
        r.state = 'delivered';
        k.done = true;
        this.fact(q, { act: 'brought', what: whoOf(r), who: whoOf(q.roles[k.deliverTo!]) });
        break;
      }
      case 'deliver': {
        const r = k.role ? q.roles[k.role] : null;
        k.done = true;
        const it = inv?.d.items.find((i) => i.uid === k.item);
        if (it && inv) inv.drop(it.uid);
        this.fact(q, { act: 'delivered', where: whoOf(r) });
        this.say(`You hand over ${it?.name ? `the ${it.name}` : 'what you carried'}.`);
        break;
      }
      default:
        return '';
    }
    void now;
    this.settle(q, part);
    return this.said.splice(0).join(' ');
  }

  // ---- Work in the field (rounding up beasts found) -----------------------------------------------------------

  /** The retrieve tasks whose beasts are found near the wanderer. */
  private nearPrize(): { q: Quest; k: QTask; r: RoleRef }[] {
    const [lon, lat] = this.s.travel.party();
    const out: { q: Quest; k: QTask; r: RoleRef }[] = [];
    for (const q of this.active()) for (const k of this.current(q)?.tasks ?? []) {
      const r = k.role ? q.roles[k.role] : null;
      if (k.type === 'retrieve' && !k.done && r?.kind === 'beasts' && r.state === 'found' && r.lon !== undefined && metres({ lon, lat }, { lon: r.lon, lat: r.lat! }) < 250) out.push({ q, k, r });
    }
    return out;
  }

  fieldActions(): { id: string; label: string; why?: string | null }[] {
    return this.nearPrize().map(({ q, r }) => ({ id: `quest:${q.id}`, label: `Round up ${whoOf(r)} and drive them along (Animal handling, half an hour)` }));
  }

  async fieldAct(id: string): Promise<void> {
    const hit = this.nearPrize().find((x) => `quest:${x.q.id}` === id);
    const a = this.s.player;
    if (!hit || !a) return;
    if (!(await this.s.field.work(1800, 'Rounding up beasts')).done) return;
    const r = check(a, 'animals', { difficulty: DC.easy, now: this.g.time });
    if (r.ok || r.grade === 'near') {
      hit.r.state = 'driven';
      this.fact(hit.q, { act: 'rounded', what: whoOf(hit.r) });
      this.g.say(`You gather ${whoOf(hit.r)} and get them moving. Take them home to ${whoOf(hit.q.giver)}.`);
    } else this.g.say(`${cap(whoOf(hit.r))} scatter as you come near. Try again more gently.`);
    this.s.player?.changed();
  }

  // ---- The journal ----------------------------------------------------------------------------------------

  /** A quest's facts in words (kept apart from the telling: quests.md). */
  tell(q: Quest): string[] {
    const day = (t: number) => `Day ${Math.floor(t / 86400) + 1}`;
    return q.facts.map((f) => `${day(f.t)}: ${tellFact(f)}`);
  }

  /** What is left to do now, in words. */
  todo(q: Quest): string[] {
    const part = this.current(q);
    if (!part) return [];
    return part.tasks.map((k) => {
      const opt = k.optional ? ' (if you can)' : '';
      if (k.done) return `${k.label}: done.`;
      switch (k.type) {
        case 'collect': return `${k.label}, to ${this.toWhom(q, k.deliverTo)}${opt}: you carry ${Math.min(this.carried(k).n, k.count ?? 1)}.`;
        case 'defeat': return `${k.label}${opt}: ${num(k.got ?? 0)} so far.`;
        case 'retrieve': {
          const r = k.role ? q.roles[k.role] : null;
          return `${k.label}${r?.state === 'found' ? ' (they are found; round them up)' : r?.state === 'driven' ? ' (you have them with you)' : ''}.`;
        }
        case 'deliver': return k.siteId ? `${k.label}, and leave it at an inn, tavern, market or hall there.` : `${k.label}.`;
        case 'survive': return `${k.label}: ${Math.max(0, Math.ceil(((k.since ?? 0) + (k.seconds ?? 0) - this.g.time) / 86400))} days more.`;
        case 'explore': return k.leads ? `${k.label}: follow the leads.` : `${k.label.replace(/ seen$/, '')}: go and see it, ${this.distWords(k)}.`;
        case 'investigate': return `${k.label}: search there.`;
        default: return `${k.label}${opt}.`;
      }
    });
  }

  /** The leads of the part under way: where they point, and what was found. */
  leads(q: Quest): { text: string; where: string; found?: string }[] {
    return (this.current(q)?.tasks ?? []).flatMap((k) => (k.leads ?? []).map((l) => ({ text: l.text, where: this.distWords(l), ...(l.found ? { found: l.found } : {}) })));
  }

  private toWhom(q: Quest, role?: string): string {
    const r = role ? q.roles[role] : q.giver;
    return r?.kind === 'place' ? `${r.name}, in ${r.siteName}` : r?.kind === 'person' ? `${whoOf(r)} (${r.siteName ?? 'the country'})` : whoOf(r);
  }

  // ---- Saving -----------------------------------------------------------------------------------------------

  export(): QuestsData {
    return { list: this.list.filter((q) => q.state === 'active' || this.g.time - (q.facts[q.facts.length - 1]?.t ?? q.posted) < 60 * 86400).map((q) => JSON.parse(JSON.stringify(q))) };
  }

  import(d: QuestsData | undefined): void {
    const list = Array.isArray(d?.list) ? d!.list : [];
    this.list = list.filter((q) => q && typeof q.id === 'string' && q.giver).map((q) => migrate(JSON.parse(JSON.stringify(q)))).filter((q): q is Quest => !!q);
  }
}

/** How a quest ended, by the way its last talk went. */
const OUTCOME_WORDS: Record<string, string> = {
  payInFull: '; the debt is paid', refuseAndDefy: '; I paid nothing', negotiateTerms: '; the debt is cleared by the errand',
  peace: '; we have made our peace', 'peace:fail': '; there is no peace between us', warn: '; they will keep their distance', 'warn:fail': '; they were not frightened off',
  leave: '; I walked away, and nothing is settled', inherit: '; I took what was left to me', waive: '; I left it all to the family', coin: '; the favour is spent', word: '; the favour is spent',
  wergild: '; the blood money is paid, and the feud is ended', defy: '; the feud goes on',
};

const MARK_WORDS: Record<Mark, string> = { fast: 'quickly done', clean: 'cleanly done', thorough: 'thoroughly done', secret: 'done unseen' };

const isPredator = (s: Species) => s.diet === 'predator' && s.home === 'wild';
const hasHide = (s: Species) => s.home === 'wild' && s.yields.some(([y]) => y === 'hide');
function bearingOf(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const cos = Math.cos((a.lat * Math.PI) / 180);
  return bearing((b.lon - a.lon) * 111320 * cos, (b.lat - a.lat) * 110540);
}

/** One fact in words. */
function tellFact(f: Fact): string {
  switch (f.act) {
    case 'carried': return `I carry this from my old life: "${f.what}".`;
    case 'took': return `I took on the work "${f.what}" for ${f.who}${f.pay ? `, for ${moneyWords(f.pay)}` : ''}.`;
    case 'part': return `${f.what}.`;
    case 'skipped': return `${f.what} came to nothing.`;
    case 'killed': return `a ${f.what} killed${f.of && f.of > 1 ? ` (${f.n} so far)` : ''}.`;
    case 'reached': return `I reached ${f.where} and saw it for myself.`;
    case 'found': return `I found ${f.what}.`;
    case 'false-lead': return `I followed a lead (${f.what?.charAt(0).toLowerCase()}${f.what?.slice(1)}), but ${f.why}.`;
    case 'clue': return `I found ${f.what}.`;
    case 'rounded': return `I rounded up ${f.what}.`;
    case 'brought': return `I brought ${f.what} home.`;
    case 'handed': return `I handed over ${f.what?.charAt(0).toLowerCase()}${f.what?.slice(1)} to ${f.who}.`;
    case 'delivered': return `I handed over what I carried in ${f.where}.`;
    case 'talked': return `I spoke with ${f.who}: "${f.what}"${f.why === 'failed' ? ', but it did not go as I hoped.' : ''}`;
    case 'interest': return `What I owe ${f.who} has grown to ${f.what}.`;
    case 'dunned': return `${f.who} sent men asking after me.`;
    case 'law': return `${f.who} went to the law in ${f.where}: I am wanted there for the debt.`;
    case 'survived': return `${f.what}: I lived through it.`;
    case 'pivot': return `${f.why}, so there is no more to "${f.what}".`;
    case 'grew': return `It is more than it seemed (now a ${f.what}).`;
    case 'clock': return f.what === 'herdLost' ? 'Too long has passed: whatever took them will not have left them alive.' : 'Time has passed.';
    case 'reassigned': return `${f.what} is dead, and ${f.who} has taken the matter up.`;
    case 'done': return `Done${f.pay ? `, and paid ${moneyWords(f.pay)}` : ''}${OUTCOME_WORDS[f.why ?? ''] ?? ''}.`;
    case 'gave-up': return 'I gave it up.';
    case 'overtaken': return `${f.why}, and the work with them.`;
    case 'waived': return `${f.why}; the debt is no more.`;
    case 'expired': return 'The time ran out.';
    default: return `${f.act}.`;
  }
}

/** A quest saved before the templates (stage Q2) in the shape of the engine now. */
function migrate(q: Quest & { kind?: string; tasks?: { type: string; what: string; match?: string; count?: number; species?: string[]; got?: number; lon?: number; lat?: number; radiusM?: number; siteId?: string; done?: boolean }[] }): Quest | null {
  if (Array.isArray(q.parts)) return q;
  if (!q.kind || !Array.isArray(q.tasks)) return null;
  const t = TEMPLATE_BY_ID.get(`job_${q.kind}`);
  if (!t) return null;
  const old = q.giver as RoleRef & { placeId?: string };
  const giver: RoleRef = old.kind === 'place' ? { ...old, id: old.placeId ?? old.id ?? old.name } : old;
  const types: Record<string, QTask['type']> = { bring: 'collect', reach: 'explore', deliver: 'deliver', defeat: 'defeat' };
  const beat: BeatSpec = t.beats.find((b) => b.id === t.start)!;
  const tasks: QTask[] = q.tasks.map((k, i) => ({
    id: `${beat.id}.${i}`, type: types[k.type] ?? 'collect', label: cap(k.what), ...(k.match ? { match: k.match } : {}), ...(k.count ? { count: k.count } : {}),
    ...(k.species ? { species: k.species, got: k.got ?? 0 } : {}), ...(k.lon !== undefined ? { lon: k.lon, lat: k.lat, radiusM: k.radiusM ?? 150 } : {}),
    ...(k.type === 'bring' ? { deliverTo: 'giver' } : {}), ...(k.type === 'deliver' ? { role: 'town', siteId: k.siteId } : {}), ...(k.done ? { done: true } : {}),
  }));
  const deliverSite = q.tasks.find((k) => k.type === 'deliver');
  return {
    id: q.id, template: t.id, level: 'job', title: q.title, text: q.text, giver, roles: { giver, ...(deliverSite ? { town: { kind: 'site', id: deliverSite.siteId ?? '', name: deliverSite.what.replace(/^the letter carried to /, ''), siteId: deliverSite.siteId } } : {}) },
    parts: [{ beat: beat.id, level: 'task', title: beat.title, tasks, state: q.state === 'active' ? 'active' : 'done', began: q.took ?? q.posted }],
    beat: q.state === 'active' ? beat.id : null, flags: [], state: q.state, posted: q.posted, took: q.took, deadline: q.deadline, reward: q.reward, spoilt: [],
    facts: (q.facts ?? []).map((f) => (f.act === 'took' ? { ...f, who: f.who ?? f.where, what: q.title } : f)), seed: hashString(q.id), n: 1, deep: false, words: { giver: whoOf(giver) },
  };
}

/** Whether an item is a quest's (a letter carried), so it is not sold or dropped by mistake. */
export const questItem = (it: Item): boolean => !!it.quest;
