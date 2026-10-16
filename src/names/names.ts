import { hash32, hashString, mulberry32, type Rng } from '../gen/rng';
import { awkward, cap, join, tidy } from '../lang/text';
import { PROPER, nameCase, translate } from '../lang/translate';
import { ADJECTIVES, CULTURES, type Culture, DEFAULT_TERMS, FAMILIES, type FeatureKind, MOTIFS, type WorldCulture } from './cultures';
import { BUNDLE } from './bundles';

const pick = <T>(rnd: Rng, a: T[]): T => a[Math.floor(rnd() * a.length)];
/**
 * Remembers the names given out in one world so features don't repeat each other, and makes
 * every name deterministic from the world seed and a per-feature key.
 */
export class NameBank {
  private used = new Set<string>();
  private seed: number;

  /**
   * With `unique` off, names never depend on what was named before (for things generated
   * lazily in view order, like villages and town plans), at the cost of rare repeats.
   */
  constructor(seed: string, private unique = true) {
    this.seed = hashString(seed + '#names');
  }

  rng(key: string): Rng {
    return mulberry32(hash32(this.seed ^ hashString(key)));
  }

  /**
   * A proper name in the culture's phonology. Two-word prefixes ("Nova ", "Castra ") belong to
   * settlement names only; elsewhere they would read oddly ("Pons Vitacano Bay").
   */
  proper(cul: Culture, rnd: Rng, settlement = false): string {
    const lang = (cul as Partial<WorldCulture>).language;
    for (let t = 0; t < 16; t++) {
      let s: string;
      // A world culture names things in its own language.
      if (lang) {
        s = lang.properName(rnd, settlement);
        if (this.unique && this.used.has(s) && t < 15) continue;
        if (this.unique) this.used.add(s);
        return s;
      }
      const r = rnd();
      const cc = cul.compoundChance ?? 0;
      if (cul.roots && cul.suffixes && r < cc) {
        s = join(pick(rnd, cul.roots), pick(rnd, cul.suffixes));
      } else if (cul.roots && r < cc * 1.3) {
        // Cross forms widen compound cultures: a root with a plain ending (Thornton), ...
        s = join(pick(rnd, cul.roots), pick(rnd, cul.ends).toLowerCase());
      } else if (cul.suffixes && r < cc * 1.6) {
        // ... or a syllable start with a compound suffix (Haldford).
        s = join(pick(rnd, cul.starts), pick(rnd, cul.suffixes));
      } else {
        s = pick(rnd, cul.starts);
        if (rnd() < cul.midChance) s = join(s, pick(rnd, cul.mids));
        s = join(s, pick(rnd, cul.ends));
      }
      s = tidy(s);
      if (cul.prefixes && rnd() < (cul.prefixChance ?? 0)) {
        const p = pick(rnd, cul.prefixes);
        if (p.endsWith(' ')) {
          if (settlement) s = p + s;
        } else s = tidy(join(p, s.toLowerCase()));
      }
      if (s.length < 3 || s.length > (s.includes(' ') ? 20 : 14) || awkward(s)) continue;
      if (this.unique && this.used.has(s) && t < 15) continue;
      if (this.unique) this.used.add(s);
      return s;
    }
    return 'Nameless';
  }

  /** A name for a feature of the given kind in a culture, from a stable key. */
  feature(kind: FeatureKind, cultureIdx: number, key: string, base?: string): string {
    const cul = CULTURES[cultureIdx] ?? CULTURES[0];
    const rnd = this.rng(`${kind}:${key}`);
    const templates = kind === 'realm' ? cul.realm : cul.terms[kind] ?? DEFAULT_TERMS[kind];
    for (let t = 0; t < 8; t++) {
      const tpl = pick(rnd, templates);
      const name = tpl
        .replace('{N}', () => base ?? this.proper(cul, rnd))
        .replace('{A}', () => pick(rnd, ADJECTIVES))
        .replace('{M}', () => pick(rnd, MOTIFS));
      if (this.unique && !tpl.includes('{N}') && this.used.has(name)) continue;
      if (this.unique) this.used.add(name);
      return name;
    }
    return this.proper(cul, rnd);
  }

  /** A settlement name. */
  place(cultureIdx: number, key: string): string {
    return this.proper(CULTURES[cultureIdx] ?? CULTURES[0], this.rng(`place:${key}`), true);
  }

  /**
   * A name built from an English pattern, where {0}, {1}… stand for proper names: the English
   * (with the proper names' English forms) and the same translated into the culture's language
   * (with their native forms). Without a language, both are the English.
   */
  named(cultureIdx: number, tpl: string, propers: Named[] = []): Named {
    return namePhrase(cultureIdx, tpl, propers);
  }

  /** A proper name with no meaning in English (the same in both). */
  opaque(cul: Culture, rnd: Rng, settlement = false): Named {
    const n = this.proper(cul, rnd, settlement);
    return { name: n, en: n };
  }

  /**
   * A feature's name, meaningful where it can be: an English name from the feature's kind
   * ("the Weeping Hills", "Lake {N}", "the Forest of Whispers"), then translated.
   */
  featureNamed(kind: FeatureKind, cultureIdx: number, key: string, base?: Named): Named {
    const cul = CULTURES[cultureIdx] ?? CULTURES[0];
    const rnd = this.rng(`${kind}:${key}`);
    const pats = FEATURE_PATTERNS[kind] ?? ['{N}'];
    // Rivers and islands often keep the oldest names of all, from a tongue no longer spoken.
    if (!base && (kind === 'river' || kind === 'island') && rnd() < (kind === 'river' ? 0.4 : 0.25)) {
      const adj = pick(rnd, KIND_ADJ[kind] ?? ['old']);
      const head = kind === 'island' ? 'island' : rnd() < 0.6 ? 'river' : 'water';
      const old = this.oldNamed(cultureIdx, rnd, adj, head, `${cap(adj)} ${kind === 'island' ? 'Isle' : cap(head)}`);
      if (old) return kind === 'river' ? { ...this.named(cultureIdx, 'the {0}', [old]), old: old.old } : old;
    }
    for (let t = 0; t < 8; t++) {
      const pat = pick(rnd, pats);
      const adjs = KIND_ADJ[kind] ?? [];
      const adj = rnd() < 0.55 && adjs.length ? pick(rnd, adjs) : pick(rnd, ADJECTIVES).toLowerCase();
      const motif = pick(rnd, MOTIFS).toLowerCase();
      const propers: Named[] = [];
      let tpl = pat.replace('{A}', cap(adj)).replace('{M}', cap(motif));
      if (tpl.includes('{N}')) {
        propers.push(base ?? this.opaque(cul, rnd));
        tpl = tpl.replace('{N}', '{0}');
      }
      const out = this.named(cultureIdx, tpl, propers);
      if (this.unique && !pat.includes('{N}') && this.used.has(out.name)) continue;
      if (this.unique) this.used.add(out.name);
      return out;
    }
    return this.opaque(cul, rnd);
  }

  /**
   * An old name: a modifier and a head word ("black", "ford") said in an older tongue, run
   * together and worn down by the sound changes since ("Svartvadu" to "Sorrad"). Most come from
   * the people's own ancestral tongue; some from a neighbouring family's, left by the people who
   * lived there first. The English keeps the meaning; `old` says where the name came from.
   */
  oldNamed(cultureIdx: number, rnd: Rng, mod: string, head: string, en: string): Named | null {
    const cul = CULTURES[cultureIdx];
    const L = cul?.language;
    if (!L || cul.family < 0) return null;
    const borrowed = cul.substrate >= 0 && rnd() < 0.35;
    const fam = FAMILIES[borrowed ? cul.substrate : cul.family];
    if (!fam) return null;
    const o = L.oldName(fam.proto.compound === 'initial' ? [head, mod] : [mod, head], fam.proto);
    if (!o) return null;
    const name = cap(o.word.spell);
    if (awkward(name) || (this.unique && this.used.has(name))) return null;
    if (this.unique) this.used.add(name);
    return { name, en, old: `Old name, ${borrowed ? 'borrowed ' : ''}from ${fam.protoName} *${o.old}` };
  }

  /**
   * A settlement's name from where it stands: a modifier (a colour or quality, a tree or beast,
   * or a founder's name) and a place word fitting the site ("Black Ford", "Oak Hill", "Salt
   * Harbour"), made one word in languages that compound ("Svartvad") or a phrase in those that
   * do not ("Villa Nigra"). About a quarter of places keep an old name whose meaning is lost.
   */
  placeNamed(cultureIdx: number, key: string, site?: SiteInfo): Named {
    const cul = CULTURES[cultureIdx] ?? CULTURES[0];
    const rnd = this.rng(`place:${key}`);
    const L = cul.language;
    const roll = rnd();
    if (!L || !site || roll < 0.27) {
      // An old name, its meaning remembered by the learned: "Black Ford" in a tongue gone by.
      if (L && site && roll < 0.14) {
        const head = weightedPick(rnd, siteHeads(site));
        const mod = rnd() < 0.55 ? weightedPick(rnd, siteAdjs(site)) : weightedPick(rnd, siteNouns(site));
        const old = this.oldNamed(cultureIdx, rnd, mod, head, `${cap(mod)} ${HEAD_EN[head] ?? cap(head)}`);
        if (old) return old;
      }
      return this.opaque(cul, rnd, true);
    }
    for (let t = 0; t < 10; t++) {
      const head = weightedPick(rnd, siteHeads(site));
      const m = rnd();
      let modEn: string, modNative: string, phrase: string;
      if (m < 0.48) {
        const a = weightedPick(rnd, siteAdjs(site));
        modEn = cap(a);
        modNative = L.word(a).spell;
        phrase = `${a} ${head}`;
      } else if (m < 0.82) {
        const n = weightedPick(rnd, siteNouns(site));
        modEn = cap(n);
        modNative = L.word(n).spell;
        phrase = `${head} of ${n}`;
      } else {
        let root = L.gen(rnd, 1 + (rnd() < 0.4 ? 1 : 0)).spell;
        if (root.length < 3) root = L.gen(rnd, 2).spell;
        // Compounds wear the founder's name down too, in English as in the language.
        if (L.compound) root = clip(root);
        modEn = cap(root);
        modNative = root;
        phrase = `${head} ${PROPER(cap(root))}`;
      }
      const en = `${modEn} ${HEAD_EN[head] ?? cap(head)}`;
      let name: string;
      if (L.compound) {
        // Compounds wear their parts down to a syllable or two ("Svart" + "vad").
        const hw = clip(L.word(head).spell), mw = clip(modNative);
        name = tidy(L.compound === 'initial' ? join(hw, mw) : join(mw, hw));
      } else name = nameCase(translate(L, phrase));
      if (name.length < 3 || name.length > (name.includes(' ') ? 22 : 14) || (!name.includes(' ') && awkward(name))) continue;
      if (this.unique && this.used.has(name) && t < 9) continue;
      if (this.unique) this.used.add(name);
      return { name, en };
    }
    return this.opaque(cul, rnd, true);
  }
}

/**
 * A name from an English pattern, where {0}, {1}… stand for proper names: the English (with the
 * proper names' English forms) and the same translated into the culture's language (with their
 * native forms). Without a language, both are the English.
 */
export function namePhrase(cultureIdx: number, tpl: string, propers: Named[] = []): Named {
  const en = tpl.replace(/\{(\d)\}/g, (_, k: string) => propers[+k]?.en ?? '');
  const L = CULTURES[cultureIdx]?.language;
  if (!L) return { name: tpl.replace(/\{(\d)\}/g, (_, k: string) => propers[+k]?.name ?? ''), en };
  const marked = tpl.replace(/\{(\d)\}/g, (_, k: string) => PROPER(propers[+k]?.name ?? ''));
  return { name: nameCase(translate(L, marked)), en };
}

/** A name in the culture's language and in English. */
export interface Named {
  name: string;
  en: string;
  /** For old names: where the name came from ("Old name, from Proto-Varskic *svart-vad"). */
  old?: string;
}

/** What a settlement's site is like, for its name. */
export interface SiteInfo {
  coastal: boolean;
  river: boolean;
  high: boolean;
  forest: boolean;
  grass: boolean;
  marsh: boolean;
  walls: boolean;
  city: boolean;
  kind?: string;
}

const V = '[aeiouyäöüåæøéáíóúâêîôûë]';
const FIRST_SYL = new RegExp(`^[^aeiouyäöüåæøéáíóúâêîôûë]*${V}+[^aeiouyäöüåæøéáíóúâêîôûë]?`, 'i');
const TWO_SYL = new RegExp(`^[^aeiouyäöüåæøéáíóúâêîôûë]*${V}+[^aeiouyäöüåæøéáíóúâêîôûë]+${V}+[^aeiouyäöüåæøéáíóúâêîôûë]?`, 'i');
/** A long word worn down to its first syllable (or two, if one is too short) for compounding. */
function clip(w: string): string {
  if (w.length <= 6) return w;
  const one = w.match(FIRST_SYL)?.[0] ?? w;
  if (one.length >= 3) return one;
  return w.match(TWO_SYL)?.[0] ?? w.slice(0, 5);
}

function weightedPick(rnd: Rng, a: [string, number][]): string {
  const tot = a.reduce((s, x) => s + x[1], 0);
  let r = rnd() * tot;
  for (const [v, w] of a) if ((r -= w) < 0) return v;
  return a[a.length - 1][0];
}
const HEAD_EN: Record<string, string> = { harbour: 'Harbour', bay: 'Bay', ford: 'Ford', bridge: 'Bridge', hill: 'Hill', field: 'Field', meadow: 'Meadow', wood: 'Wood', town: 'Town', farm: 'Farm', home: 'Stead', fort: 'Fort', city: 'City', valley: 'Vale', spring: 'Spring', well: 'Well', stone: 'Stone', mill: 'Mill', camp: 'Camp', mine: 'Mine', marsh: 'Marsh', island: 'Isle', cliff: 'Cliff', lake: 'Mere' };
function siteHeads(s: SiteInfo): [string, number][] {
  const h: [string, number][] = [['town', 3], ['farm', s.city ? 0.3 : 1.5], ['home', 1.2], ['valley', 0.8], ['spring', 0.5], ['well', 0.5], ['stone', 0.4], ['hill', 1], ['forest', 1], ['marsh', 0.8]];
  if (s.coastal || s.kind === 'fishing') h.push(['harbour', 3], ['bay', 2], ['cliff', 0.6], ['beach', 1], ['lagoon', 0.5], ['cove', 0.4]);
  if (s.river) h.push(['ford', 3], ['bridge', 2], ['mill', 1], ['weir', 0.5], ['dam', 0.4], ['canal', 0.3], ['lock', 0.3], ['sluice', 0.3]);
  if (s.high) h.push(['hill', 3], ['cliff', 0.6], ['ridge', 0.8], ['mountain', 1.5], ['peak', 1], ['summit', 0.8], ['escarpment', 0.5], ['mesa', 0.4], ['plateau', 0.6], ['bluff', 0.4], ['crag', 0.4]);
  if (s.forest || s.kind === 'logging') h.push(['wood', 2.5], ['meadow', 0.6], ['grove', 0.4], ['copse', 0.3], ['thicket', 0.3], ['glade', 0.3]);
  if (s.grass) h.push(['field', 2], ['meadow', 1.5], ['pasture', 1], ['grazing', 0.8], ['lawn', 0.6], ['commons', 0.5], ['park', 0.4], ['garden', 0.3], ['orchard', 0.3], ['vineyard', 0.3], ['green', 0.3]);
  if (s.marsh) h.push(['marsh', 1.5], ['bog', 1], ['fen', 0.8], ['swamp', 0.6], ['wetland', 0.5], ['quagmire', 0.4], ['mire', 0.3], ['lagoon', 0.3], ['marshland', 0.3], ['slough', 0.3], ['fenland', 0.3]);
  if (s.walls) h.push(['fort', 1.5], ['castle', 1.2], ['keep', 1], ['tower', 0.8], ['bastion', 0.6], ['citadel', 0.5], ['redoubt', 0.4], ['palace', 0.7], ['wall', 0.5], ['gatehouse', 0.4], ['barracks', 0.3]);
  if (s.city) h.push(['city', 1], ['borough', 0.8], ['metropolis', 0.5]);
  if (s.kind === 'mining') h.push(['mine', 2], ['hill', 1], ['quarry', 1], ['pit', 0.8], ['shaft', 0.5], ['excavation', 0.2], ['dig', 0.3], ['tunnel', 0.4], ['cave', 0.4]);
  return h;
}
function siteAdjs(s: SiteInfo): [string, number][] {
  const a: [string, number][] = [['black', 2], ['white', 2], ['red', 1.5], ['green', 1.5], ['grey', 1.2], ['old', 2], ['new', 2], ['high', 1], ['great', 1], ['little', 1], ['long', 1], ['cold', 0.8], ['fair', 1.2], ['holy', 0.6], ['golden', 0.5], ['bright', 0.6], ['wild', 0.5], ['deep', 0.5], ['quiet', 0.5]];
  if (s.coastal) a.push(['salt', 1.5], ['windy', 0.8], ['stormy', 0.6], ['foggy', 0.5], ['briny', 0.4], ['rough', 0.4], ['breezy', 0.4], ['misty', 0.4], ['salty', 0.4], ['pleasant', 0.4]);
  if (s.high) a.push(['high', 1.5], ['windy', 0.8], ['stone', 0.8], ['rocky', 0.6], ['craggy', 0.5], ['spectacle', 0.4], ['majestic', 0.4], ['towering', 0.4], ['lofty', 0.4], ['misty', 0.4]);
  if (s.marsh) a.push(['misty', 1], ['still', 0.6], ['foggy', 0.5], ['wet', 0.4], ['boggy', 0.3], ['haunted', 0.3], ['dark', 0.3], ['eerie', 0.3]);
  return a;
}
function siteNouns(s: SiteInfo): [string, number][] {
  const n: [string, number][] = [['oak', 2], ['ash', 1.5], ['thorn', 1.2], ['stone', 1.2], ['wolf', 1], ['raven', 1], ['eagle', 0.6], ['bear', 0.6], ['king', 0.8], ['horse', 0.6], ['apple', 0.8], ['rose', 0.6], ['swan', 0.6], ['fox', 0.6], ['crow', 0.5], ['bee', 0.4], ['sun', 0.5], ['moon', 0.4], ['star', 0.4], ['god', 0.3], ['lady', 0.4], ['priest', 0.3], ['iron', 0.5], ['gold', 0.3]];
  if (s.coastal) n.push(['fish', 1.2], ['wave', 0.8], ['whale', 0.4], ['ship', 0.8], ['seagull', 0.3], ['crab', 0.3], ['lobster', 0.3], ['dolphin', 0.3], ['pelican', 0.3], ['seal', 0.3], ['pirate', 0.3], ['coral', 0.3], ['barnacle', 0.3], ['bucaneer', 0.3], ['shark', 0.3]);
  if (s.river) n.push(['willow', 1.2], ['reed', 0.8], ['fish', 0.6], ['otter', 0.4], ['beaver', 0.3], ['duck', 0.3], ['heron', 0.3], ['kingfisher', 0.3], ['salmon', 0.4], ['trout', 0.4], ['crane', 0.3], ['frog', 0.3], ['alder', 0.3], ['poplar', 0.3], ['cattail', 0.3]);
  if (s.forest) n.push(['deer', 1], ['birch', 1], ['pine', 1], ['boar', 0.6], ['owl', 0.6], ['fox', 0.5], ['mushroom', 0.4], ['bear', 0.4], ['lichen', 0.3], ['fir', 0.5], ['spruce', 0.5], ['acorn', 0.3], ['hazel', 0.3], ['elm', 0.3], ['maple', 0.3], ['sparrow', 0.3]);
  if (s.grass) n.push(['cow', 0.6], ['sheep', 0.8], ['horse', 0.8], ['hare', 0.6], ['goat', 0.5], ['pig', 0.5], ['deer', 0.4], ['fox', 0.4], ['wolf', 0.3], ['mouse', 0.5]);
  if (s.kind === 'mining' || s.high) n.push(['iron', 1], ['silver', 0.6], ['copper', 0.6], ['gold', 0.3], ['tin', 0.4], ['lead', 0.4], ['coal', 0.5], ['crystal', 0.2]);
  return n;
}

/** English name patterns by feature kind: {N} a proper name, {A} an adjective, {M} a motif. */
const FEATURE_PATTERNS: Partial<Record<FeatureKind, string[]>> = {
  river: ['the {N}', 'the {N}', 'the {N} River', 'the {A} River'],
  lake: ['Lake {N}', '{N} Lake', '{A} Lake', 'the {A} Lake', 'the Lake of {M}'],
  inlandSea: ['the {N} Sea', 'the Sea of {N}', 'the {A} Sea'],
  sea: ['the {N} Sea', 'the Sea of {N}', 'the {A} Sea', 'the Sea of {M}'],
  ocean: ['the {N} Ocean', 'the {A} Ocean', 'the {A} Ocean', 'the Ocean of {M}'],
  gulf: ['the Gulf of {N}', 'the {N} Gulf', 'the {A} Gulf'],
  bay: ['the Bay of {N}', '{N} Bay', '{A} Bay', 'the Bay of {M}'],
  bight: ['the {N} Bight', 'the {A} Bight'],
  strait: ['the {N} Strait', 'the Strait of {N}', 'the {A} Strait'],
  channel: ['the {N} Channel', 'the {A} Channel'],
  island: ['{N}', '{N}', 'the Isle of {N}', '{N} Island', 'the {A} Isle'],
  isles: ['the {N} Isles', 'the {A} Isles', 'the Isles of {M}'],
  continent: ['{N}'],
  mountains: ['the {N} Mountains', 'the {A} Mountains', 'the {A} Peaks', 'the Mountains of {M}'],
  hills: ['the {N} Hills', 'the {A} Hills', 'the {A} Hills', 'the {N} Downs'],
  peak: ['Mount {N}', '{N} Peak', 'the {A} Peak'],
  forest: ['the {N} Forest', '{N} Wood', 'the {A} Wood', 'the {A} Forest', 'the Forest of {M}'],
  desert: ['the {N} Desert', 'the {A} Waste', 'the {N} Sands', 'the {A} Sands'],
  marsh: ['the {N} Marshes', 'the {A} Fens', '{N} Mire', 'the Marshes of {M}'],
  plains: ['the {N} Plains', 'the {A} Plains', 'the {A} Fields'],
};
/** Adjectives that suit each kind of feature (mixed with the general poetic ones). */
const KIND_ADJ: Partial<Record<FeatureKind, string[]>> = {
  river: ['swift', 'white', 'black', 'old', 'golden', 'clear', 'red', 'wide', 'long', 'cold', 'silver'],
  lake: ['silver', 'still', 'deep', 'clear', 'black', 'blue', 'cold', 'bright', 'glassy', 'crystal', 'moonlit'],
  sea: ['grey', 'stormy', 'salt', 'bright', 'green', 'dark', 'wide', 'blue', 'cold', 'sunlit'],
  inlandSea: ['grey', 'still', 'salt', 'bitter', 'green', 'blue'],
  ocean: ['great', 'endless', 'western', 'eastern', 'stormy', 'grey', 'blue', 'wide', 'deep', 'silent'],
  gulf: ['warm', 'stormy', 'green', 'grey', 'quiet', 'golden'],
  bay: ['quiet', 'fair', 'sunlit', 'grey', 'calm', 'golden', 'still'],
  bight: ['long', 'grey', 'wide', 'windy'],
  strait: ['narrow', 'stormy', 'cold', 'dark', 'swift'],
  channel: ['narrow', 'deep', 'grey', 'long'],
  island: ['green', 'lonely', 'misty', 'fair', 'hidden', 'black'],
  isles: ['green', 'scattered', 'misty', 'fair', 'lost', 'western', 'eastern', 'golden'],
  mountains: ['white', 'grey', 'iron', 'high', 'jagged', 'cloudy', 'frozen', 'broken', 'black', 'red'],
  hills: ['green', 'grey', 'rolling', 'windy', 'red', 'low', 'grassy', 'golden', 'quiet'],
  peak: ['white', 'lonely', 'high', 'frozen', 'black', 'cloudy'],
  forest: ['dark', 'deep', 'green', 'old', 'whispering', 'black', 'tangled', 'enchanted', 'silent', 'wild'],
  desert: ['red', 'burning', 'endless', 'salt', 'white', 'golden', 'empty', 'bitter', 'shimmering'],
  marsh: ['black', 'misty', 'sunken', 'grey', 'drowned', 'still', 'green', 'reedy'],
  plains: ['golden', 'green', 'wide', 'windy', 'endless', 'yellow', 'grassy'],
};

const INN_ADJ = ['Whistling', 'Merry', 'Wandering', 'Drunken', 'Golden', 'Black', 'Red', 'Silver', 'Copper', 'Green', 'Prancing', 'Drunken', 'Rusty', 'Laughing', 'Sleeping', 'Crooked', 'Jolly', 'Wandering', 'Blind', 'Merry', 'Leaping', 'Gilded', 'Busty', 'Weary', 'Salty', 'Three-Legged', 'Horned', 'Dead', 'Broken', 'Dancing', 'Winking', 'Blind', 'Greedy', 'Wandering', 'Thirsty', 'Two-Headed'];
const INN_NOUN = ['Goose', 'Stag', 'Boar', 'Lantern', 'Anchor', 'Crown', 'Dragon', 'Barrel', 'Bottle', 'Rose', 'Ox', 'Hound', 'Raven', 'Cup', 'Kettle', 'Plough', 'Wheel', 'Fiddle', 'Mermaid', 'Unicorn', 'Swan', 'Bell', 'Griffin', 'Pony', 'Owl', 'Tankard', 'Pig', 'Hart', 'Ferret', 'Mare', 'Wyvern', 'Maid', 'Fox', 'Kraken', 'Badger', 'Viper', 'Chimera', 'Basilisk', 'Rooster', 'Mammoth', 'Wolf', 'Cat', 'Anvil', 'Compass', 'Goblet', 'Hammer', 'Lantern', 'Flagon', 'Coin', 'Shield', 'Mariner', 'Huntsman', 'Vagabond', 'Fool', 'Sovereign', 'Tinker', 'Minstrel', 'Ash', 'Willow', 'Sunflower', 'Bramble', 'Cavern', 'Hollow', 'Oak', 'Moon'];

/** A tavern or inn sign, e.g. "The Drunken Goose" or "The Crown and Anchor". */
export function innName(rnd: Rng): string {
  const r = rnd();
  if (r < 0.55) return `The ${pick(rnd, INN_ADJ)} ${pick(rnd, INN_NOUN)}`;
  if (r < 0.85) {
    const a = pick(rnd, INN_NOUN);
    let b = pick(rnd, INN_NOUN);
    if (b === a) b = 'Crown';
    return `The ${a} and ${b}`;
  }
  return `The ${pick(rnd, INN_NOUN)}'s Rest`;
}

/** A god or saint for a temple, in the local culture's phonology. */
export function deityName(bank: NameBank, cultureIdx: number, key: string): string {
  const cul = CULTURES[cultureIdx] ?? CULTURES[0];
  const rnd = bank.rng(`deity:${key}`);
  const n = bank.proper(cul, rnd);
  const r = rnd();
  return r < 0.4 ? `Temple of ${n}` : r < 0.7 ? `Shrine of ${n}` : BUNDLE.get(cul.id)?.saints ? `St ${n}'s` : `House of ${n}`;
}

// ---- Caves and glades ----------------------------------------------------------------------

const CAVE_NOUNS: Record<string, string[]> = {
  small: ['Hole', 'Den', 'Grotto', 'Hollow', 'Burrow', 'Cave'],
  medium: ['Cave', 'Caves', 'Grotto', 'Lair', 'Cavern', 'Warren'],
  large: ['Caverns', 'Catacombs', 'Deeps', 'Halls', 'Labyrinth', 'Warrens'],
  wet: ['Grotto', 'Pools', 'Sinks', 'Wellsprings'],
};
const CAVE_ADJ = ['Echoing', 'Dripping', 'Sunless', 'Deep', 'Gloomy', 'Weeping', 'Crystal', 'Whispering', 'Black', 'Hollow', 'Drowned', 'Forgotten', 'Howling', 'Cold', 'Silent', 'Twisting', 'Glittering', 'Shrouded'];
const CAVE_BEAST = ['Wolf', 'Bear', 'Troll', 'Goblin', 'Wyrm', 'Bat', 'Spider', 'Ogre', 'Hermit', 'Witch', 'Dragon', 'Serpent', 'Kobold', 'Giant', 'Ghoul'];
const GLADE_NOUNS: Record<string, string[]> = {
  any: ['Glade', 'Glade', 'Clearing', 'Dell', 'Glen', 'Lea', 'Hollow'],
  stones: ['Stones', 'Ring', 'Circle'],
  pond: ['Pool', 'Mere', 'Glade'],
  tree: ['Oak', 'Glade', 'Tree'],
  camp: ['Camp', 'Clearing'],
  ruins: ['Ruins', 'Glade'],
};
const GLADE_ADJ = ['Mossy', 'Sunlit', 'Whispering', 'Fey', 'Dappled', 'Quiet', 'Green', 'Hidden', 'Moonlit', 'Fallow', 'Golden', 'Thorny', 'Silver', 'Misty', 'Singing', 'Lost', 'Hallowed', 'Cursed'];
const GLADE_BEAST = ['Stag', 'Hart', 'Fox', 'Owl', 'Unicorn', 'Dryad', 'Fawn', 'Hare', 'Boar', 'Raven', 'Wolf', 'Satyr', 'Badger', 'Sprite'];
/** English compounds in the manner of Watabou's names ("Starbog", "Northhoof"). */
const EN_A = [
  // Original
  'Star', 'North', 'Black', 'Grim', 'Raven', 'Wolf', 'Moon', 'Thorn', 'Ash', 
  'Elder', 'Mist', 'Bone', 'Night', 'Old', 'Deep', 'Stone', 'Silver', 'Fox', 
  'Owl', 'Hart', 'Frost', 'Hag', 'Oak', 'Bramble', 'Crow',
  // First Batch
  'Storm', 'Wind', 'Rain', 'Dusk', 'Dawn', 'Sun', 'Salt', 'Tide', 
  'Blood', 'Iron', 'Dread', 'Grave', 'Wraith', 'Witch', 'Wyrm', 'Rot', 
  'Pine', 'Shroud', 'Whisper',
  // Doubled Batch
  'Flame', 'Ember', 'Spark', 'Ice', 'Sleet', 'Winter', 'Summer', 'Shadow', 
  'Gloom', 'Phantom', 'Ghost', 'Skull', 'Serpent', 'Dragon', 'Bear', 'Boar', 
  'Stag', 'Lion', 'Hawk', 'Falcon', 'Eagle', 'Viper', 'Toad', 'Spider', 
  'Web', 'Copper', 'Brass', 'Gold', 'Amber', 'Runes', 'Spell'
];
const EN_B = [
  // Original
  'bog', 'hoof', 'wood', 'fen', 'fall', 'mere', 'holt', 'barrow', 'crag', 
  'shade', 'root', 'moss', 'tooth', 'claw', 'wing', 'hide', 'thorn', 
  'brook', 'gloom', 'hollow',
  // First Batch
  'reach', 'watch', 'vale', 'glen', 'cliff', 'ridge', 'ford', 'haven', 
  'gate', 'spire', 'crest', 'marsh', 'weald', 'mire', 'dell', 'shroud', 
  'helm', 'basin',
  // Doubled Batch
  'keep', 'hold', 'fort', 'wall', 'tower', 'peak', 'summit', 'mound', 
  'cairn', 'bight', 'bay', 'cove', 'strand', 'shore', 'bank', 'stream', 
  'river', 'source', 'well', 'spring', 'pool', 'lake', 'hearth', 'home', 
  'pass', 'trail', 'path', 'road', 'walk'
];

/**
 * A name for a cave or glade: a proper name in the local culture (or now and then an English
 * compound) with a noun fitting its size and features, or a descriptive form
 * ("the Dripping Grotto", "the Troll's Den", "Glade of Whispers").
 */
export function lairName(bank: NameBank, kind: 'cave' | 'glade', cultureIdx: number, key: string, tags: string[]): Named {
  const cul = CULTURES[cultureIdx] ?? CULTURES[0];
  const rnd = bank.rng(`lair:${key}`);
  const size = tags.find((t) => t === 'small' || t === 'medium' || t === 'large') ?? 'medium';
  let nouns: string[];
  if (kind === 'cave') {
    nouns = [...CAVE_NOUNS[size], ...(tags.includes('wet') || tags.includes('flooded') ? CAVE_NOUNS.wet : []), ...(BUNDLE.get(cul.id)?.caveNouns ?? [])];
  } else {
    const feat = tags.find((t) => t in GLADE_NOUNS && t !== 'any');
    nouns = [...GLADE_NOUNS.any, ...(feat ? GLADE_NOUNS[feat] : []), ...(BUNDLE.get(cul.id)?.gladeNouns ?? [])];
  }
  const noun = pick(rnd, nouns);
  // An English compound ("Starbog") is said in the language too; a native name stays as it is.
  const englishCompound = rnd() < 0.3;
  const compound = tidy(pick(rnd, EN_A) + pick(rnd, EN_B));
  const adj = pick(rnd, kind === 'cave' ? CAVE_ADJ : GLADE_ADJ);
  const beast = pick(rnd, kind === 'cave' ? CAVE_BEAST : GLADE_BEAST);
  const r = rnd();
  const c = cultureIdx;
  if (r < 0.55) return englishCompound ? bank.named(c, `${compound} ${noun}`) : bank.named(c, `{0} ${noun}`, [bank.opaque(cul, rnd)]);
  if (r < 0.72) return bank.named(c, `the ${adj} ${noun}`);
  if (r < 0.86) return bank.named(c, `the ${beast}'s ${noun.replace(/s$/, '')}`);
  return bank.named(c, `${noun.replace(/s$/, '')} of ${pick(rnd, MOTIFS)}`);
}

const DUNGEON_NOUNS: Record<string, string[]> = {
  tower: ['Tower', 'Spire', 'Watchtower', 'Keep', 'Turret', 'Beacon'],
  crypt: ['Crypt', 'Tomb', 'Mausoleum', 'Barrow', 'Sepulchre', 'Vault'],
  ruin: ['Ruins', 'Manor', 'Hall', 'Priory', 'Steading', 'Grange'],
  mine: ['Mine', 'Workings', 'Diggings', 'Delvings', 'Pits', 'Shafts'],
};
const DUNGEON_ADJ: Record<string, string[]> = {
  tower: ['Crooked', 'Lonely', 'Black', 'Broken', 'Grey', 'Leaning', 'Silent', 'Burnt', 'Wizard\'s', 'Old'],
  crypt: ['Forgotten', 'Sunken', 'Silent', 'Weeping', 'Nameless', 'Hollow', 'Bleak', 'Ancient', 'Shrouded'],
  ruin: ['Burnt', 'Fallen', 'Old', 'Abandoned', 'Overgrown', 'Ruined', 'Haunted', 'Shattered'],
  mine: ['Old', 'Deep', 'Drowned', 'Lost', 'Silver', 'Copper', 'Iron', 'Abandoned', 'Collapsed'],
};
const DUNGEON_WHO = ['Witch', 'Baron', 'Hermit', 'Sorcerer', 'Abbot', 'Saint', 'King', 'Giant', 'Necromancer', 'Knight', 'Widow', 'Alchemist'];

/** A name for a tower, crypt, ruin or mine: "Ashcombe Tower", "the Sunken Crypt", "the Witch's Spire". */
export function dungeonName(bank: NameBank, kind: string, cultureIdx: number, key: string, near?: Named): Named {
  const cul = CULTURES[cultureIdx] ?? CULTURES[0];
  const rnd = bank.rng(`dun:${key}`);
  const noun = pick(rnd, DUNGEON_NOUNS[kind] ?? DUNGEON_NOUNS.ruin);
  const r = rnd();
  const c = cultureIdx;
  const of = kind === 'ruin' && noun === 'Ruins';
  if (near && r < 0.4) return bank.named(c, of ? 'the Ruins of {0}' : `{0} ${noun}`, [near]);
  if (r < 0.62) return bank.named(c, of ? 'the Ruins of {0}' : `{0} ${noun}`, [bank.opaque(cul, rnd)]);
  if (r < 0.84) return bank.named(c, `the ${pick(rnd, DUNGEON_ADJ[kind] ?? DUNGEON_ADJ.ruin)} ${noun}`);
  return bank.named(c, `the ${pick(rnd, DUNGEON_WHO)}'s ${noun.replace(/s$/, '')}`);
}
