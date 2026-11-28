/**
 * Talking with someone (from play, 27 November 2026; docs/design/npcs.md): a conversation of
 * questions, answered by how the person regards the wanderer, with the social skills to draw out
 * more.
 *
 * - **Asked:** who they are (their name, and their trade), about themselves (their household and
 *   kin, their character, and to a friend their past and what they think of their neighbours),
 *   where this is, what is near, the news and rumours (the places of note about, the lairs and
 *   ruins of the country, the law, the talk of their neighbours), and, of those who sell, their
 *   wares.
 * - **Regard** (their own opinion and half the town's): hostile (−40 and worse), they will not talk
 *   but to insult; cold (to −12), only the plainest answers; neutral, their name, the way and a
 *   rumour; well disposed (12 and up), about themselves; warm (35 and up), their past, their
 *   opinions, and more rumours. What they tell is remembered (world/opinions.ts, `told`).
 * - **The social skills** each try once a conversation: Persuasion coaxes (their regard counts a
 *   fifth more for the talk); Intimidation frightens it out of the timid (a third, but they think the
 *   worse of the wanderer, and the bold take offence); Deception (a lie about one's business) wins
 *   trust until it is found out; and coin buys an answer, gladly from the poor, while the watch may
 *   take a bribe amiss.
 *
 * Proposed numbers, to tune in play.
 */
import { check, DC } from '../actors/checks';
import { Identity, moneyText } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { TILE_M } from '@worldforge/core/local/chunk';
import { isWatch } from '../world/folk-fight';
import { opinionWords, type Told } from '../world/opinions';
import type { Resident } from '../world/population';
import { greeting } from '../world/talk';
import type { SitePlace } from '../worker/protocol';
import { bearing, cap, compassWord } from '../util';
import { shownName } from './person-card';
import type { Quest } from './quests';
import type { PlaySession } from './session';

export interface TalkOption {
  id: string;
  label: string;
  why?: string | null;
}

/** Trades that sell to passers, and the shop each keeps (screens/shop.ts tags). */
const SELLERS: [RegExp, string][] = [
  [/smith|armourer|weaponsmith|founder|cutler/, 'smithy'], [/tailor|seamstress|weaver|draper|clothier|hatter|cobbler|shoemaker/, 'tailor'],
  [/apothecary|herbalist|physician|wise woman|cunning/, 'apothecary'], [/butcher|fishmonger/, 'butcher'], [/baker/, 'bakery'],
  [/merchant|trader|shopkeeper|chandler|grocer|hawker|pedlar|stallholder|market|general/, 'market'], [/pawn/, 'pawnshop'],
  [/innkeeper|tapster|tavern|alewife|brewer/, 'market'],
];

/** Bribes offered, in copper. */
export const BRIBES = [2, 5, 10];

export class Conversation {
  /** The lines of the talk so far (the screen shows them). */
  readonly lines: { who: 'them' | 'you' | 'note'; text: string }[] = [];
  /** A lift to their regard for this talk (persuaded, frightened, deceived, paid). */
  private lift = 0;
  /** The social ways tried this talk. */
  readonly tried = new Set<string>();
  /** The talk is over (they turned away, or were found out). */
  over = false;
  /** Rumours told this talk (so as not to repeat). */
  private heard = new Set<string>();
  /** Work they have offered this talk (game/quests.ts). */
  private offer: Quest | null = null;

  constructor(private readonly s: PlaySession, readonly r: Resident) {}

  private get g() {
    return this.s.game;
  }

  /** What they think of the wanderer: their own regard and half their town's (world/law.ts), and the talk's lift. */
  regard(): number {
    const ops = this.s.people.opinions, t = this.g.time, place = this.s.justice.settlement();
    return ops.of(this.r.p.id, t) + (place && this.r.p.template !== 'bandit' ? this.s.law.standing(place.id, t) * 0.5 : 0) + this.lift;
  }

  /** How they regard the wanderer, in words. */
  mood(): string {
    return opinionWords(this.regard());
  }

  name(): string {
    return shownName(this.r, this.s.people);
  }

  private say(text: string): void {
    this.lines.push({ who: 'them', text: this.s.people.voice(this.r, text, this.r.p.name) });
  }

  private note(text: string): void {
    this.lines.push({ who: 'note', text });
  }

  private learn(what: Told[]): Told[] {
    return this.s.people.opinions.learn(this.r.p.id, this.r.p.name, what, this.g.time);
  }

  /** The greeting: a well enough disposed person gives their name at once. */
  begin(said: number): void {
    const me = this.s.player?.get(Identity)?.d.given ?? 'traveller';
    const v = this.regard(), met = this.s.people.opinions.knows(this.r.p.id);
    this.say(greeting(this.r, v, met, (this.g.time % 86400) / 3600, me));
    if (v <= -40) {
      this.note(`${cap(this.name())} turns away from you.`);
      this.over = true;
      return;
    }
    if (v > -12 && !this.s.people.opinions.has(this.r.p.id, 'name') && said === 0) this.introduce();
  }

  private introduce(): void {
    const p = this.r.p;
    this.learn(['name']);
    this.say(this.r.p.template === 'guard' || isWatch(this.r) ? `${p.given}, of the watch.` : `I am ${p.given}.`);
  }

  /** The seller's place of trade, if they sell (their stall or shop, or one made for them). */
  shop(): SitePlace | null {
    const t = this.r.p.trade.toLowerCase();
    const role = SELLERS.find(([re]) => re.test(t))?.[1];
    if (!role || this.r.stop?.act !== 'work' || this.r.where === 'asleep') return null;
    const near = this.s.placeNear(this.r.x, this.r.y);
    if (near && (near.kind === 'market' || near.kind === 'shop' || near.kind === 'inn' || near.kind === 'tavern')) return near;
    const [lon, lat] = this.s.travel.frame.toLL([(this.r.x + 0.5) * TILE_M, -(this.r.y + 0.5) * TILE_M]);
    return { id: `stall:${this.r.p.id}`, kind: role === 'market' ? 'market' : 'shop', name: `${this.r.p.given}'s wares`, lon, lat, quarter: '', about: '', role };
  }

  options(): TalkOption[] {
    if (this.over) return [{ id: 'bye', label: 'Leave them be' }];
    const v = this.regard(), cold = v <= -12;
    const out: TalkOption[] = [];
    if (!this.s.people.opinions.has(this.r.p.id, 'name')) out.push({ id: 'who', label: 'Who are you?' });
    out.push({ id: 'self', label: 'Tell me about yourself.' });
    out.push({ id: 'where', label: 'Where is this?' });
    out.push({ id: 'near', label: 'What is there near here?' });
    out.push({ id: 'news', label: 'What news? Any rumours?' });
    // Work: asked after, taken up, handed in; and a letter carried to their town.
    const quests = this.s.quests;
    const town = this.s.justice.settlement();
    for (const o of quests.optionsFor({ personId: this.r.p.id, siteId: town?.id ?? null, handover: !cold })) out.push(o);
    if (this.offer?.state === 'offered') out.push({ id: 'accept', label: 'I will do it.' });
    else if (!this.tried.has('work') && !quests.active().some((q) => q.giver.kind === 'person' && q.giver.id === this.r.p.id)) out.push({ id: 'work', label: 'Is there any work going?', why: cold ? 'They will not deal with you.' : null });
    if (this.shop()) out.push({ id: 'trade', label: 'Let me see your wares.', why: cold ? 'They will not deal with you.' : null });
    const inv = this.s.player?.get(Inventory);
    out.push({ id: 'persuade', label: 'Win them over (Persuasion)', why: this.tried.has('persuade') ? 'You have tried that.' : null });
    out.push({ id: 'intimidate', label: 'Lean on them (Intimidation)', why: this.tried.has('intimidate') ? 'You have tried that.' : null });
    out.push({ id: 'deceive', label: 'Claim to be on the town\'s business (Deception)', why: this.tried.has('deceive') ? 'You have tried that.' : null });
    for (const c of BRIBES) out.push({ id: `bribe:${c}`, label: `Offer ${moneyText(c)} for their trouble`, why: this.tried.has('bribe') ? 'You have paid them already.' : (inv?.d.copper ?? 0) < c ? 'You have not the coin.' : null });
    out.push({ id: 'bye', label: 'Farewell.' });
    return out;
  }

  /** Asks or does a thing; returns what to open (a shop), if anything. */
  ask(id: string): { open?: 'shop'; place?: SitePlace } | void {
    const o = this.options().find((x) => x.id === id);
    if (!o || o.why) return;
    this.lines.push({ who: 'you', text: o.label });
    this.g.time += 60;
    const v = this.regard();
    if (id !== 'bye' && v <= -40) {
      this.say(this.insult());
      this.over = true;
      return;
    }
    switch (id) {
      case 'who':
        if (v <= -12) this.say('That is my business, not yours.');
        else this.introduce();
        break;
      case 'self':
        this.aboutSelf(v);
        break;
      case 'where':
        this.where(v);
        break;
      case 'near':
        if (v <= -12) this.say('Look about you; you have eyes.');
        else this.near();
        break;
      case 'news':
        this.news(v);
        break;
      case 'trade': {
        const place = this.shop();
        if (!place) return;
        this.say('Have a look, then. Mind, I have a living to make.');
        return { open: 'shop', place };
      }
      case 'work':
        this.work();
        break;
      case 'accept':
        if (this.offer) {
          this.note(this.s.quests.take(this.offer));
          this.say('Good. I will be waiting.');
        }
        break;
      case 'persuade':
      case 'intimidate':
      case 'deceive':
        this.social(id);
        break;
      case 'bye':
        this.say(v >= 12 ? 'Go well.' : 'Good day.');
        this.over = true;
        break;
      default:
        if (id.startsWith('bribe:')) this.bribe(Number(id.slice(6)));
        else if (id.startsWith('q:')) {
          const said = this.s.quests.choose(id);
          if (said) this.note(said);
        }
    }
  }

  /** What they want done, if anything (by their trade and the country; the same through a week). */
  private work(): void {
    this.tried.add('work');
    const q = this.s.quests.askOf(this.r);
    if (!q) {
      this.say(this.s.quests.countryOf(this.s.quests.hereKey().key) ? 'Not from me. Try the notice boards in the towns.' : 'Let me think on it. Ask me again in a while.');
      return;
    }
    if (q.state !== 'offered') {
      this.say(q.state === 'active' ? 'You are already at what I asked of you.' : 'You have done enough for me already. My thanks.');
      return;
    }
    if (!this.s.people.opinions.has(this.r.p.id, 'name')) this.introduce();
    this.offer = q;
    this.say(q.text);
  }

  private insult(): string {
    const lines = ['I have nothing to say to you.', 'Get away from me.', 'Find someone else to pester.', 'You have some nerve, speaking to me.'];
    return lines[Math.floor(this.g.dice.random() * lines.length)];
  }

  private aboutSelf(v: number): void {
    const p = this.r.p;
    if (v <= -12) {
      this.say('Nothing you need to know.');
      return;
    }
    if (!this.s.people.opinions.has(p.id, 'name')) this.introduce();
    const trade = p.trade === 'child' ? '' : p.trade === 'retired' ? 'I am past working now.' : p.trade === 'helps at home' ? 'I keep the house.' : `I am ${/^[aeiou]/.test(p.trade) ? 'an' : 'a'} ${p.trade}${p.homeName ? `, at ${p.homeName}` : ''}.`;
    if (v < 12) {
      if (trade) this.say(`${trade} There is not much more to tell.`);
      else this.say('There is not much to tell.');
      this.learn(['trade']);
      return;
    }
    const kin = p.ties.filter((x) => /parent|child|sibling|spouse|wife|husband|son|daughter|brother|sister|kin/.test(`${x.kind} ${x.text}`)).slice(0, 2).map((x) => x.text);
    const traits = p.traits.length ? ` They say I am ${p.traits.slice(0, 2).join(' and ').toLowerCase()}.` : '';
    this.say(`${trade} I am the ${p.role} of ${p.household}.${kin.length ? ` ${kin.join(' ')}` : ''}${traits}`.trim());
    const fresh = this.learn(['trade', 'family', 'traits']);
    if (v >= 35) {
      const others = p.ties.filter((x) => /friend|feud|rival|enemy|debt|owe/.test(`${x.kind} ${x.text}`)).slice(0, 2).map((x) => x.text);
      if (p.note || others.length) this.say(`${p.note ? cap(p.note.replace(/\.$/, '')) + '.' : ''}${others.length ? ` ${others.join(' ')}` : ''}`.trim());
      fresh.push(...this.learn(['history', 'opinions']));
    }
    if (fresh.length) this.note(`You learn more of ${this.name()} (look them over: Shift+I).`);
  }

  private where(v: number): void {
    const g = this.g, place = this.s.justice.settlement(), here = g.hud.place;
    const near = this.s.placeNear(g.px, g.py);
    if (!place) {
      const n = this.nearestSites(1)[0];
      this.say(n ? `The open country. ${n.name} lies ${n.dist} to the ${n.dir}.` : 'Out in the wilds, a long way from anywhere.');
      return;
    }
    const bits = [`This is ${place.name}`];
    if (v > -12 && near?.quarter) bits.push(`, ${near.quarter}`);
    if (v > -12 && here && here !== place.name && here !== 'The wilds') bits.push(`; you stand in ${here.charAt(0).toLowerCase()}${here.slice(1)}`);
    this.say(`${bits.join('')}.`);
  }

  /** The settlements nearest (not the one the wanderer is in): name, distance in words, and direction. */
  private nearestSites(n: number): { name: string; dist: string; dir: string; tier: string }[] {
    const g = this.g, mx = (g.px + 0.5) * TILE_M, my = -(g.py + 0.5) * TILE_M, inside = this.s.justice.settlement();
    return [...g.sites].filter((x) => x.id !== inside?.id).map((x) => ({ x, d: Math.hypot(x.x - mx, x.y - my) })).sort((a, b) => a.d - b.d).slice(0, n).map(({ x, d }) => ({
      name: x.name, tier: x.tier, dist: d < 1500 ? 'a short walk' : `${Math.round(d / 1000)} km`, dir: compassWord(bearing(x.x - mx, x.y - my)),
    }));
  }

  private near(): void {
    const places = this.s.placesNear(this.g.px, this.g.py, 300).filter((p) => p.kind !== 'district').slice(0, 3).map((p) => p.name);
    const sites = this.nearestSites(2).map((x) => `${x.name}, ${x.dist} ${x.dist === 'a short walk' ? 'away' : 'off'} to the ${x.dir}`);
    const bits: string[] = [];
    if (places.length) bits.push(`Close by there is ${places.length > 1 ? `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}` : places[0]}.`);
    if (sites.length) bits.push(`Beyond, ${sites.join('; and ')}.`);
    this.say(bits.join(' ') || 'Nothing much, I am afraid.');
  }

  private news(v: number): void {
    const n = v <= -12 ? 0 : v < 12 ? 1 : v < 35 ? 2 : 3;
    if (!n) {
      this.say('I do not gossip with strangers.');
      return;
    }
    const pool = this.s.rumours(this.r).filter((x) => !this.heard.has(x));
    const told = pool.slice(0, n);
    for (const t of told) this.heard.add(t);
    if (!told.length) this.say('Nothing new that I have heard.');
    else for (const t of told) this.say(t);
  }

  private social(kind: 'persuade' | 'intimidate' | 'deceive'): void {
    const a = this.s.player;
    if (!a) return;
    this.tried.add(kind);
    const p = this.r.p, ops = this.s.people.opinions, t = this.g.time;
    const v = this.regard();
    const base = DC.easy + Math.round(Math.max(0, -v) / 3);
    if (kind === 'persuade') {
      const r = check(a, 'persuasion', { difficulty: base, now: t });
      if (r.ok) {
        this.lift += 20 + (r.grade === 'fine' ? 10 : 0);
        ops.add(p.id, p.name, 'talked me round', 2, t, 5);
        this.say(r.grade === 'fine' ? 'Well, put like that... ask what you like.' : 'All right. What is it you want to know?');
      } else {
        if (r.grade === 'fumble') ops.add(p.id, p.name, 'tried to sweet-talk me', -5, t, 5);
        this.say(r.grade === 'fumble' ? 'Do not waste your honeyed words on me.' : 'I do not think so.');
      }
      return;
    }
    if (kind === 'intimidate') {
      const bold = isWatch(this.r) || p.template === 'bandit' || p.traits.some((x) => /brave|wrathful|stubborn|proud/i.test(x));
      const timid = p.traits.some((x) => /craven|timid|meek|nervous/i.test(x)) || p.age >= 65 || p.age < 14;
      const r = check(a, 'intimidation', { difficulty: base + (bold ? 15 : timid ? -10 : 0), now: t });
      ops.add(p.id, p.name, 'threatened me', bold ? -15 : -8, t, 10);
      if (r.ok && !(bold && r.grade !== 'fine')) {
        this.lift += 30;
        this.say(timid ? 'All right, all right! What do you want?' : 'Fine. Ask, and then get out of my sight.');
      } else {
        this.say(bold ? 'You think you frighten me? Try it, and see where it gets you.' : 'I will not be pushed about.');
        if (bold) this.over = true;
      }
      return;
    }
    const r = check(a, 'deception', { difficulty: base + (isWatch(this.r) ? 10 : 0), now: t });
    if (r.ok) {
      this.lift += 25;
      this.say('Oh, I see. In that case, ask away.');
    } else {
      ops.add(p.id, p.name, 'lied to me', r.grade === 'fumble' ? -25 : -12, t, 14);
      this.say(r.grade === 'fumble' ? 'Liar! I know who works for the town, and you are not one of them.' : 'Is that so? I do not believe a word of it.');
      this.over = r.grade === 'fumble';
    }
  }

  private bribe(copper: number): void {
    const inv = this.s.player?.get(Inventory), p = this.r.p, ops = this.s.people.opinions, t = this.g.time;
    if (!inv || inv.d.copper < copper) return;
    this.tried.add('bribe');
    // The watch take a small bribe amiss, unless greedy (or it is large enough).
    const greedy = p.traits.some((x) => /greedy|corrupt/i.test(x));
    if (isWatch(this.r) && !greedy && copper < 10) {
      ops.add(p.id, p.name, 'tried to bribe me', -15, t, 14);
      this.say('Are you trying to buy me? Put that away before I take you in.');
      return;
    }
    inv.d.copper -= copper;
    const poor = p.means === 'destitute' || p.means === 'poor' ? 2 : p.means === 'rich' ? 0.4 : 1;
    this.lift += Math.round(copper * 3 * poor);
    ops.add(p.id, p.name, 'paid me', Math.min(6, copper * poor * 0.5), t, 7);
    this.s.player?.changed();
    this.say(poor >= 2 ? 'Bless you! What do you want to know?' : poor < 1 ? 'That is hardly worth my time, but go on.' : 'That is very kind. What can I tell you?');
  }
}
