/**
 * What can be told of a person, as a card: a portrait and a few lines (docs/design/characters.md,
 * People in your life; npcs.md). For the people of the character's life (their ties, from
 * character creation) and for the residents met on the map, looked over (Shift+I, or a click).
 * A resident's card tells more once they have been spoken to.
 */
import { Body, beardText, hairText, type Tie } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { defOf, itemName } from '../actors/items/item';
import { opinionWords } from '../world/opinions';
import { doingWords, type Population, type Resident } from '../world/population';
import { portraitOf, portraitOfTie, type PortraitSpec } from './portrait';
import { cap } from '../util';

export interface PersonCard {
  name: string;
  portrait: PortraitSpec | null;
  /** Shown faded: the dead. */
  faded?: boolean;
  /** Who they are, under the name. */
  lines: string[];
  sections: { label: string; lines: string[] }[];
}

const an = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
const BUILD = { ectomorph: 'lean', mesomorph: 'broad-shouldered', endomorph: 'heavy-set' };

/** Hair and beard in a line: "Hair in braids; clean-shaven." */
function looksLine(style: string, beard: string, female: boolean, build?: string): string {
  return `${cap([build, hairText('', style).trim(), female ? '' : beardText(beard)].filter(Boolean).join('; '))}.`;
}

// ---- The people of the character's life --------------------------------------------------------

const RELATION: Record<Tie['kind'], [string, string]> = {
  parent: ['Your father', 'Your mother'], sibling: ['Your brother', 'Your sister'], friend: ['A friend', 'A friend'], master: ['Your teacher', 'Your teacher'],
  contact: ['One who owes you a favour', 'One who owes you a favour'], rival: ['An enemy', 'An enemy'], debt: ['One you owe money', 'One you owe money'], feud: ['A feud', 'A feud'],
};

/** A card for each person among the ties (one a person, however many ties are to them), and the ties to no one by name. */
export function tieCards(ties: Tie[], people: string): { cards: PersonCard[]; others: Tie[] } {
  const byName = new Map<string, Tie[]>();
  for (const t of ties) if (t.name) byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
  const cards = [...byName].map(([name, list]): PersonCard => {
    const t = list[0], w = t.who, dead = list.some((x) => x.alive === false);
    const lines = [RELATION[t.kind][w?.female ? 1 : 0]];
    if (w) lines.push(`${w.age < 13 ? (w.female ? 'A girl' : 'A boy') : w.female ? 'A woman' : 'A man'} of ${people}${dead ? '' : `, about ${w.age}`}${w.trade ? `; ${an(w.trade)}` : ''}.`);
    if (dead) lines.push('Dead.');
    const sections = [{ label: 'To you', lines: list.map((x) => x.text) }];
    if (w) sections.push({ label: 'Looks', lines: [looksLine(w.hairStyle, w.beard, w.female || w.age < 16, BUILD[w.type])] });
    if (w?.home && !dead) sections.push({ label: 'Where', lines: [`Last known to live in ${w.home}.`] });
    return { name, portrait: portraitOfTie(t), ...(dead ? { faded: true } : {}), lines, sections };
  });
  return { cards, others: ties.filter((t) => !t.name) };
}

// ---- The residents of the map ------------------------------------------------------------------

/** A resident's trade as a word or two ("a smith", "a girl"; nothing for those with none). */
function tradeWords(r: Resident): string {
  const p = r.p;
  return p.trade === 'child' ? (p.female ? 'a girl' : 'a boy') : p.trade === 'retired' || p.trade === 'helps at home' ? '' : an(p.trade);
}

/** What the wanderer sees of a resident at a glance: who they are, what they are about, and (if met) how they stand toward the wanderer. */
export function residentLines(r: Resident, pop: Population, t: number): string[] {
  const p = r.p, trade = tradeWords(r);
  const out = [`${p.name}${trade ? `, ${trade}` : ''}.`];
  out.push(`One of ${p.people}${p.age >= 12 ? `, about ${Math.max(12, Math.round(p.age / 5) * 5)} years old` : ''}.`);
  const doing = doingWords(r);
  if (doing) out.push(doing);
  if (pop.opinions.knows(r.p.id)) out.push(`You have met; ${r.p.female ? 'she' : 'he'} is ${opinionWords(pop.opinions.of(r.p.id, t))}.`);
  return out;
}

/** A resident looked over: their portrait as they are dressed, their looks, and what has been learnt of them in talk. */
export function residentCard(r: Resident, pop: Population, t: number): PersonCard {
  const p = r.p, met = pop.opinions.knows(p.id), body = r.actor.get(Body), trade = tradeWords(r);
  const lines = [...(trade ? [`${cap(trade)}.`] : []), `One of ${p.people}${p.age >= 12 ? `, about ${Math.max(12, Math.round(p.age / 5) * 5)} years old` : ''}.`];
  const doing = doingWords(r);
  if (doing) lines.push(doing);
  const sections: PersonCard['sections'] = [];
  const looks = [looksLine(p.look.hairStyle, p.look.beard, p.female || p.age < 16, p.age >= 16 && body ? BUILD[body.type.id] : undefined)];
  // What shows of their dress, where they are.
  const shown = new Set(r.figure.wear.map((w) => w.shape));
  const worn = (r.actor.get(Inventory)?.worn() ?? []).filter((i) => shown.has(defOf(i).figure ?? '')).map((i) => itemName(i));
  if (worn.length) looks.push(`Wearing ${worn.length > 1 ? `${worn.slice(0, -1).join(', ')} and ${worn[worn.length - 1]}` : worn[0]}.`);
  sections.push({ label: 'Looks', lines: looks });
  if (met) {
    const known = [`${cap(p.role)} of ${p.household}${p.homeName ? `, at ${p.homeName}` : ''}.`];
    if (p.traits.length) known.push(`${cap(p.traits.join(' and '))}.`);
    if (p.note) known.push(cap(p.note));
    sections.push({ label: 'What you know of them', lines: known });
    if (p.ties.length) sections.push({ label: 'The people in their life', lines: p.ties.map((x) => x.text) });
    sections.push({ label: 'Toward you', lines: [`${p.female ? 'She' : 'He'} is ${opinionWords(pop.opinions.of(p.id, t))}.`] });
  } else sections.push({ label: 'What you know of them', lines: ['Nothing yet: you have not spoken (E, beside them).'] });
  return { name: p.name, portrait: portraitOf(r.actor, r.figure), lines, sections };
}
