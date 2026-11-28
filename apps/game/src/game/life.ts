/**
 * The life brought into play (docs/design/quests.md, The task log; characters.md, People in your
 * life; stage Q3). When a game begins or is loaded, the people of the character's ties are placed in
 * the world as residents of their towns (worker/ties.ts) and remembered as the character knows
 * them; when a new game begins, the start chosen at creation becomes its first quest, and the ties
 * give two to four obligations besides: debts (the creditor's terms, with interest, the creditor's
 * men and the law if left unpaid), a favour owed, a love who waits or was lost, a rival or a feud, and
 * family at home or a dead parent's affairs. A quiet start keeps the obligations without a quest; a
 * clean slate has neither.
 *
 * Proposed numbers, to tune in play.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { History, type Tie } from '../actors/components/history';
import { debtOf, isLost, isLove, tieKey, type StartHook } from '../actors/creation/hooks';
import type { Told } from '../world/opinions';
import type { TieFolk, TiePlaced } from '../worker/protocol';
import { TEMPLATE_BY_ID } from './quests/templates';
import type { Obligation, Quest, RoleRef } from './quests';
import type { PlaySession } from './session';

/** How the character regards each kind of tie at the start (their own opinion of the wanderer), and what each has told. */
const REGARD: Record<string, number> = { parent: 45, sibling: 45, love: 60, lost: 40, master: 30, contact: 25, friend: 35, debt: -5, rival: -30, feud: -30 };
const KNOWN: Record<string, Told[]> = {
  parent: ['name', 'trade', 'family', 'history', 'opinions', 'traits'], sibling: ['name', 'trade', 'family', 'history', 'opinions', 'traits'],
  love: ['name', 'trade', 'family', 'history', 'traits'], friend: ['name', 'trade', 'family', 'traits'], master: ['name', 'trade', 'history'],
  contact: ['name', 'trade'], debt: ['name', 'trade'], rival: ['name', 'trade'], feud: ['name'],
};
/** At most so many obligations at the start, the first quest among them. */
const MOST = 4;

export class Life {
  /** Where the people of the character's life live (by tie key), as placed in the world. */
  readonly people = new Map<string, TiePlaced>();

  constructor(private readonly s: PlaySession) {}

  private get history(): History | undefined {
    return this.s.player?.get(History);
  }

  /** The settlement a tie lives in (its own, or the home's by name, or where the game began). */
  private siteOf(t: Tie): string {
    if (t.who?.site) return t.who.site;
    const byName = t.who?.home ? this.s.o.sites?.find((x) => x.name === t.who!.home) : undefined;
    return byName?.id ?? this.s.o.site.id;
  }

  /** The living ties, as people to place in the world. */
  folk(): TieFolk[] {
    const out: TieFolk[] = [];
    for (const t of this.history?.d.ties ?? []) {
      if (t.alive === false) continue;
      const unnamed = !t.name && (t.kind === 'feud' || t.kind === 'debt');
      if (!t.name && !unnamed) continue;
      const w = t.who;
      out.push({
        key: tieKey(t), kind: t.kind, siteId: this.siteOf(t),
        ...(t.name ? { name: t.name, given: t.name.split(' ')[0] } : {}),
        ...(w ? { female: w.female, age: w.age, ...(w.trade ? { trade: w.trade } : {}), look: { skin: w.skin, hair: w.hair, hairStyle: w.hairStyle, beard: w.beard, cloth: w.cloth } } : {}),
        ...(t.kind === 'parent' || t.kind === 'sibling' ? { family: true } : {}),
      });
    }
    return out;
  }

  /**
   * Brings the life into play: the people placed and remembered, and for a new game its first
   * quest and its obligations.
   */
  async begin(isNew: boolean): Promise<void> {
    const ask = this.s.world.ties;
    const folk = this.folk();
    if (!ask || !folk.length) {
      if (isNew) await this.obligations([]);
      return;
    }
    const placed = await ask(folk);
    this.people.clear();
    for (const p of placed) this.people.set(p.key, p);
    // Remembered as the character knows them: their names, and what they think of the wanderer.
    const ops = this.s.people.opinions, now = this.s.game.time;
    for (const t of this.history?.d.ties ?? []) {
      const p = this.people.get(tieKey(t));
      if (!p || ops.knows(p.key)) continue;
      const kind = isLove(t) ? 'love' : isLost(t) ? 'lost' : t.kind;
      ops.add(p.key, p.name, kindWhy(kind), REGARD[kind] ?? 0, now, 365);
      ops.learn(p.key, p.name, KNOWN[kind === 'lost' ? 'love' : kind] ?? ['name'], now);
    }
    if (isNew) await this.obligations(placed);
  }

  /** A tie's person as a quest role (with their household to take their part, if they die). */
  private role(t: Tie): RoleRef | null {
    const p = this.people.get(tieKey(t));
    if (!p) return null;
    const kin = t.kind === 'parent' || t.kind === 'sibling';
    const heirs = kin ? (this.history?.d.ties ?? []).filter((x) => x !== t && (x.kind === 'parent' || x.kind === 'sibling')).map((x) => this.people.get(tieKey(x))).filter((x): x is TiePlaced => !!x).map((x) => ({ id: x.key, name: x.trade, given: x.given })) : undefined;
    return { kind: 'person', id: p.key, name: p.trade, given: p.given, siteId: p.siteId, siteName: p.siteName, lon: p.lon, lat: p.lat, ...(heirs?.length ? { heirs } : {}) };
  }

  /** The first quest and the obligations of a new life (none for a clean slate). */
  private async obligations(placed: TiePlaced[]): Promise<void> {
    void placed;
    const h = this.history;
    if (!h) return;
    const start: StartHook = h.d.start ?? { id: 'quiet', kind: 'quiet', label: '', about: '' };
    if (start.kind === 'clean') return;
    const ties = h.d.ties, q = this.s.quests, seed = hashString(`${this.s.o.settings.seed}#life#${tieKey(ties[0] ?? { kind: 'friend', text: '' })}`);
    const rnd = mulberry32(seed);
    const made: Quest[] = [];
    const used = new Set<string>();
    const town = this.s.o.site.name;
    const living = ties.filter((t) => (t.kind === 'parent' || t.kind === 'sibling') && t.alive !== false && this.people.has(tieKey(t)));
    const add = (ob: Obligation | null, t?: Tie) => {
      if (!ob || made.length >= MOST) return;
      if (t) used.add(tieKey(t));
      const quest = q.fromObligation(ob);
      if (quest) made.push(quest);
    };
    /** The obligation a tie gives (featured: the first quest, with its urgency). */
    const obligationOf = (t: Tie, featured: boolean): Obligation | null => {
      const party = this.role(t);
      const key = tieKey(t);
      const words: Record<string, string> = { town: party?.siteName ?? town };
      if (debtOf(t) !== null && party) {
        return { id: `ob:${key}`, template: 'tpl_creditor_terms', party, amount: debtOf(t)!, what: t.name ? `the debt to ${t.name}` : 'the family\'s debts', words, ...(featured ? { dueDays: 7, featured } : {}) };
      }
      if (t.kind === 'contact' && party) return { id: `ob:${key}`, template: 'tpl_favour', party, amount: 20 + Math.round(rnd() * 40), what: 'a favour owed', words, featured };
      if (isLove(t) && party) return { id: `ob:${key}`, template: 'tpl_love_waits', party, amount: 0, what: 'word for a love', words: { ...words, why: featured ? ', and has written asking me to come back' : '' }, featured };
      if (isLost(t) && t.name && living[0]) {
        // The dead are not in the world: their part is their memory, and their grave.
        const kin = this.role(living[0]);
        const love: RoleRef = party ?? { kind: 'site', id: key, name: t.name, siteId: kin?.siteId ?? null, siteName: kin?.siteName };
        return kin ? { id: `ob:${key}`, template: 'tpl_lost_love', party: love, kin, amount: 0, what: 'a love lost', words, flags: t.alive !== false ? ['alive'] : [], featured } : null;
      }
      if (t.kind === 'rival' && party) {
        const since = /since (your|my) (.*)\.$/.exec(t.text)?.[2];
        return { id: `ob:${key}`, template: 'tpl_rival', party, amount: 0, what: 'a rival', words: { ...words, since: since ? `my ${since}` : 'long ago', why: featured ? ', and it must be answered' : '' }, featured };
      }
      if (t.kind === 'feud' && party) {
        const house = this.people.get(key)?.household ?? 'another family';
        return { id: `ob:${key}`, template: 'tpl_feud', party, amount: 100 + Math.round(rnd() * 100), what: 'a feud', words: { ...words, house, why: featured ? ', and blood has been spilt again' : '' }, featured };
      }
      return null;
    };
    const familyOb = (featured: boolean, dead?: Tie): Obligation | null => {
      const kin = living[0] && this.role(living[0]);
      if (!kin) return null;
      if (dead?.name) return { id: `ob:affairs:${tieKey(dead)}`, template: 'tpl_parent_affairs', party: kin, kin, amount: 20 + Math.round(rnd() * 60), what: 'a parent\'s affairs', words: { town: kin.siteName ?? town, parent: dead.name }, featured };
      const ill = living.find((t) => t.kind === 'parent');
      return { id: `ob:family:${kin.id}`, template: 'tpl_family_visit', party: kin, kin, amount: 0, what: 'family at home', words: { town: kin.siteName ?? town, why: featured && ill?.name ? `${ill.name} has fallen ill, and the family asks me to come home.` : 'My family waits to hear how I fare.' }, featured };
    };

    // The first quest: the start chosen.
    const tieFor = (k?: string) => ties.find((t) => tieKey(t) === k);
    switch (start.kind) {
      case 'debt': case 'love': case 'lost': case 'rival': case 'feud': {
        const t = tieFor(start.tie);
        if (t) add(obligationOf(t, true), t);
        break;
      }
      case 'family':
        add(familyOb(true));
        used.add('family');
        break;
      case 'affairs':
        add(familyOb(true, tieFor(start.tie)));
        used.add('family');
        break;
      case 'omen':
        await this.omen(made);
        break;
      case 'work':
        await this.work(made);
        break;
    }
    // The obligations besides: debts, a favour, a love, a rival or feud, and family.
    const order = [
      ...ties.filter((t) => debtOf(t) !== null),
      ...ties.filter((t) => t.kind === 'contact').slice(0, 1),
      ...ties.filter((t) => isLove(t) || isLost(t)).slice(0, 1),
      ...ties.filter((t) => t.kind === 'rival' || t.kind === 'feud').slice(0, 1),
    ];
    for (const t of order) if (!used.has(tieKey(t)) && this.people.has(tieKey(t))) add(obligationOf(t, false), t);
    if (!used.has('family')) {
      const dead = ties.find((t) => t.kind === 'parent' && t.alive === false && t.name);
      add(familyOb(false, dead));
    }
    if (made.length) this.s.game.say(`What you carry with you from your old life is in your journal (Shift+Q)${made.some((x) => x.featured) ? `, and first of all: ${made.find((x) => x.featured)!.title}` : ''}.`);
  }

  /** The Omen's start: the ruin nearest the home that seems to answer the cards. */
  private async omen(made: Quest[]): Promise<void> {
    const h = this.history, site = this.s.o.site;
    const c = await this.s.quests.prepare(site.id, site.lon, site.lat);
    const t = TEMPLATE_BY_ID.get('tpl_omen');
    if (!t || !c || !h?.d.omen) return;
    const giver: RoleRef = { kind: 'site', id: 'omen', name: 'the cards', siteId: null };
    const q = this.s.quests.make(t, giver, c, hashString(`${this.s.o.settings.seed}#omen`), { lon: site.lon, lat: site.lat }, { words: { omen: h.d.omen } });
    if (!q) return;
    q.featured = true;
    this.s.quests.take(q);
    made.push(q);
  }

  /** Looking for work: the first notice on the board of the town where the life begins. */
  private async work(made: Quest[]): Promise<void> {
    const site = this.s.o.site;
    await this.s.quests.prepare(site.id, site.lon, site.lat);
    const r = await this.s.world.site(site.id, { lon: site.lon, lat: site.lat });
    const notice = r.site ? this.s.quests.notices(r.site)[0] : undefined;
    if (!notice) return;
    notice.featured = true;
    this.s.quests.take(notice);
    made.push(notice);
  }
}

function kindWhy(kind: string): string {
  return ({ parent: 'my own child', sibling: 'my own blood', love: 'the one I love', lost: 'the one I loved', master: 'once my pupil', contact: 'did me a good turn', debt: 'owes me money', rival: 'an old enmity', feud: 'of the family we are at feud with', friend: 'an old friend' } as Record<string, string>)[kind] ?? 'from the old days';
}
