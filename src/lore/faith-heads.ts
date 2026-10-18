import { hashString, mulberry32, type Rng } from '../gen/rng';
import { CULTURES } from '../names/cultures';
import type { Faith } from './faiths';
import { type Ctx, realmDetails } from './realm';

/**
 * The heads of a faith, by its doctrine: a faith with a high priest lists them from its founding
 * (each taking a holy name, numbered when it repeats); a faith led by sacred rulers lists the
 * rulers of its holy realm; a faith with no head lists the keepers of its chief shrine.
 * Memory fails: a list reaches back at most about a thousand years.
 */

export interface FaithHead {
  /** Styled name ("Pontiff Ardo III"). */
  name: string;
  /** Birth name, where a holy name was taken. */
  born?: string;
  female: boolean;
  from: number;
  to?: number;
  how: string;
  end?: string;
}
export interface FaithHeads {
  kind: 'pontiff' | 'ruler' | 'keeper';
  /** What the list is ("the Patriarchs of the faith, at Varsk"). */
  label: string;
  heads: FaithHead[];
  /** The realm whose rulers lead the faith (for 'ruler'). */
  realm?: number;
  /** The list does not reach back to the founding. */
  forgotten: boolean;
}

const roman = (n: number): string => {
  const R: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, x] of R) while (n >= v) {
    s += x;
    n -= v;
  }
  return s;
};
const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const FEM: Record<string, string> = {
  Patriarch: 'Matriarch', 'High Priest': 'High Priestess', Abbot: 'Abbess', Hierophant: 'Hierophantess', King: 'Queen', Lord: 'Lady', Prince: 'Princess', Father: 'Mother',
  Archbishop: 'Archbishop', Keeper: 'Keeper', Elder: 'Elder', 'High Druid': 'High Druid', Grandfather: 'Grandmother', 'High Shaman': 'High Shaman',
};
const feminine = (t: string) => {
  const [a, ...rest] = t.split(' of ');
  return [FEM[a] ?? a.replace(/\bPriest\b/, 'Priestess').replace(/\bKing\b/, 'Queen').replace(/\bLord\b/, 'Lady'), ...rest].join(' of ');
};

/** A line of priests holding office for terms, from `from` to `year`. */
function priestLine(f: Faith, r: Rng, title: string, from: number, year: number, how: string[], holyNames: boolean): FaithHead[] {
  const L = f.lang;
  const clergy = f.doctrines.clergy;
  const pFemale = clergy === 'priestesses' ? 1 : clergy === 'open' ? 0.4 : clergy === 'celibate' ? 0 : 0.08;
  // A small stock of holy names, so they repeat and are numbered as the popes' are.
  const stock = (female: boolean) => Array.from({ length: 24 }, () => (L ? L.givenName(r, female, false) : `${pick(r, ['Ar', 'Bel', 'Cor', 'Dun', 'El', 'Hal', 'Mor', 'Tal'])}${pick(r, ['an', 'ed', 'is', 'o', 'us'])}`)).map((n) => n.charAt(0).toUpperCase() + n.slice(1));
  const names = [stock(false), stock(true)];
  const used = new Map<string, number>();
  const out: FaithHead[] = [];
  let t = from;
  let guard = 0;
  while (t < year && guard++ < 400) {
    const female = r() < pFemale;
    const len = 2 + Math.floor(r() ** 1.3 * 26);
    const end = t + len;
    const given = pick(r, names[female ? 1 : 0].slice(0, 4 + Math.floor(r() * 20)));
    const n = (used.get(given) ?? 0) + 1;
    used.set(given, n);
    const born = holyNames && L ? L.givenName(r, female, false) : undefined;
    const ttl = female ? feminine(title) : title;
    const last = end >= year;
    out.push({
      name: holyNames ? `${ttl} ${given}${n > 1 ? ` ${roman(n)}` : ''}` : `${given}${n > 1 ? ` ${roman(n)}` : ''}, ${ttl}`, born: born ? born.charAt(0).toUpperCase() + born.slice(1) : undefined, female, from: t, to: last ? undefined : end,
      how: pick(r, how), end: last ? undefined : pick(r, ['died in office', 'died in office', 'died in office', 'abdicated', 'deposed', 'died in office', r() < 0.3 ? 'martyred' : 'died in office']),
    });
    t = end;
  }
  // The first in a line of the same name is "I" once a second has come.
  for (const [given, n] of used) if (n > 1) {
    const first = out.find((h) => h.name.endsWith(` ${given}`) || h.name.startsWith(`${given},`));
    if (first) first.name = first.name.endsWith(` ${given}`) ? `${first.name} I` : first.name.replace(`${given},`, `${given} I,`);
  }
  return out;
}

export function faithHeads(c: Ctx, f: Faith): FaithHeads {
  const year = c.L.year;
  const r = mulberry32(hashString(`heads#${f.id}#${f.name}`));
  const start = Math.max(f.founded, year - 950 - Math.floor(r() * 100));
  const forgotten = start > f.founded;
  const head = f.doctrines.head;
  if (head === 'ruler') {
    const holders = f.cultures.length ? f.cultures : f.former;
    const realm = c.units.filter((u) => u.parent < 0 && u.gov !== 'league' && holders.includes(u.culture)).sort((a, b) => (b.gov === 'theocracy' ? 1 : 0) - (a.gov === 'theocracy' ? 1 : 0) || b.people - a.people)[0];
    if (realm) {
      const d = realmDetails(c, realm.id);
      return {
        kind: 'ruler', label: `The rulers of ${/ of /.test(realm.name) && !/^the /i.test(realm.name) ? 'the ' : ''}${realm.name}, who lead the faith as its high priests`, realm: realm.id, forgotten: false,
        heads: d.reigns.map((x) => ({ name: x.styled || `${x.title} ${x.person.given}`, female: x.person.female, from: x.from, to: x.to, how: x.how, end: x.end })),
      };
    }
  }
  if (head === 'pontiff' || head === 'ruler') {
    const how = f.doctrines.clergy === 'hereditary' ? ['heir of the last', 'heir of the last', 'chosen from the holy houses'] : ['elected by the high clergy', 'elected by the high clergy', 'named by the last before death', 'chosen by lot among the elders'];
    return { kind: 'pontiff', label: `The line of the ${f.head.title}, seated at ${f.head.seatName}`, forgotten, heads: priestLine(f, r, f.head.title, start, year, how, true) };
  }
  const site = f.holySites.find((h) => !/^where|^birthplace/.test(h.what)) ?? f.holySites[0];
  const where = site?.name ?? f.sects[0]?.originName ?? CULTURES[f.cultures[0] ?? 0]?.name ?? '';
  const title = pick(r, ['Keeper', 'Elder', 'High Priest', 'Guardian']);
  return {
    kind: 'keeper', label: `The faith has no head; these are the ${title.toLowerCase()}s of its chief shrine at ${where}, the most honoured of its priests`, forgotten,
    heads: priestLine(f, r, `${title} of ${where}`, start, year, ['chosen by the shrine’s priests', 'chosen by the shrine’s priests', 'named by the last before death'], false),
  };
}
