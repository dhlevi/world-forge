import type { Rng } from '../gen/rng';

/**
 * Procedural coats of arms: a shield shaped by culture, a field (plain, divided, patterned or of
 * a fur), an ordinary, charges, and cadency marks for junior arms. Tinctures follow the rule of
 * tincture (no colour on colour, no metal on metal; furs take either). Arms descend through the
 * political hierarchy: a duchy keeps its kingdom's field and changes the charge; a county keeps
 * its duchy's arms and adds a mark of difference.
 */
export type Tincture =
  | 'or' | 'argent'
  | 'gules' | 'azure' | 'vert' | 'sable' | 'purpure' | 'tenne' | 'sanguine' | 'celeste'
  | 'ermine' | 'vair';
export type Shield = 'heater' | 'french' | 'round' | 'kite' | 'spanish';
export type Division = 'plain' | 'pale' | 'fess' | 'bend' | 'bendSinister' | 'saltire' | 'quarterly' | 'chevron' | 'paly' | 'barry' | 'chequy' | 'gyronny';
export type Ordinary = 'fess' | 'pale' | 'bend' | 'chevron' | 'cross' | 'saltire' | 'chief' | 'pile' | 'pall' | 'bordure';
export type Charge =
  | 'mullet' | 'crescent' | 'roundel' | 'lozenge' | 'tower' | 'crown' | 'fleur' | 'key' | 'tree' | 'sun' | 'cross'
  | 'anchor' | 'ship' | 'sword' | 'hammer' | 'axe' | 'eagle' | 'wheel' | 'bell' | 'horn' | 'estoile' | 'heart' | 'acorn' | 'blossom';

export interface Arms {
  shield: Shield;
  field: Tincture;
  division: Division;
  /** Second tincture of a divided or patterned field. */
  field2: Tincture;
  ordinary: { kind: Ordinary; t: Tincture } | null;
  /** On a divided field charges are counterchanged (each half takes the other half's tincture). */
  charge: { kind: Charge; t: Tincture; n: 1 | 2 | 3; counter?: boolean } | null;
  /** Marks of difference for junior arms. */
  bordure: Tincture | null;
  label: Tincture | null;
  /** Empires: a crown above the shield. */
  crowned: boolean;
}

const METALS: Tincture[] = ['or', 'argent'];
/** Colours, the common ones listed more often (a weighted pick). */
const COLOURS: Tincture[] = ['gules', 'gules', 'azure', 'azure', 'vert', 'vert', 'sable', 'sable', 'purpure', 'tenne', 'sanguine', 'celeste'];
const FURS: Tincture[] = ['ermine', 'vair'];
export const TINCTURE_HEX: Record<Tincture, string> = {
  or: '#e2b93f', argent: '#f2efe6', gules: '#b1322a', azure: '#2f5596', vert: '#3c7a3e', sable: '#2a2522', purpure: '#6f3d7a',
  tenne: '#b8682c', sanguine: '#7c2333', celeste: '#7eaed6', ermine: '#f2efe6', vair: '#f2efe6',
};
export const isMetal = (t: Tincture) => t === 'or' || t === 'argent';
export const isFur = (t: Tincture) => t === 'ermine' || t === 'vair';
const pick = <T>(rnd: Rng, a: T[]): T => a[Math.floor(rnd() * a.length)];
/** A tincture that may lie on `t`: colour on metal, metal on colour, and for furs a colour (vair takes or or gules). */
const contrast = (rnd: Rng, t: Tincture, avoid?: Tincture) => {
  const base = t === 'vair' ? (['or', 'gules'] as Tincture[]) : t === 'ermine' ? COLOURS : isMetal(t) ? COLOURS : METALS;
  const set = base.filter((x) => x !== avoid && x !== t);
  return pick(rnd, set.length ? set : base);
};

const SHIELD_BY_CULTURE: Record<string, Shield> = {
  anglo: 'heater', latin: 'spanish', celtic: 'heater', norse: 'round', elvish: 'kite', desert: 'round', slavic: 'french',
  dwarven: 'kite', southern: 'spanish', steppe: 'round', jungle: 'french',
  sinic: 'round', japonic: 'round', koreanic: 'round', woodland: 'round', highland: 'french',
};
/** Favourite charges by culture (a light touch). */
const CULTURE_CHARGES: Record<string, Charge[]> = {
  anglo: ['tower', 'crown', 'fleur', 'mullet', 'horn', 'acorn'], latin: ['key', 'crown', 'sun', 'tower', 'eagle', 'wheel'],
  celtic: ['tree', 'crescent', 'roundel', 'horn', 'heart'], norse: ['axe', 'ship', 'crescent', 'tree', 'hammer'],
  elvish: ['tree', 'mullet', 'estoile', 'crescent', 'acorn'], desert: ['crescent', 'mullet', 'sun', 'estoile', 'sword'],
  slavic: ['cross', 'crown', 'eagle', 'tower', 'sword'], dwarven: ['hammer', 'axe', 'tower', 'key', 'crown', 'bell'],
  southern: ['sun', 'ship', 'anchor', 'lozenge', 'key'], steppe: ['sun', 'crescent', 'horn', 'sword', 'mullet'],
  jungle: ['sun', 'roundel', 'heart', 'estoile', 'lozenge'],
  sinic: ['sun', 'crescent', 'roundel', 'blossom', 'lozenge'], japonic: ['blossom', 'crescent', 'roundel', 'wheel', 'estoile'],
  koreanic: ['blossom', 'sun', 'wheel', 'mullet'], woodland: ['tree', 'sun', 'crescent', 'horn'], highland: ['sun', 'estoile', 'lozenge', 'crown'],
};
const ALL_CHARGES: Charge[] = [
  'mullet', 'crescent', 'roundel', 'lozenge', 'tower', 'crown', 'fleur', 'key', 'tree', 'sun', 'cross',
  'anchor', 'ship', 'sword', 'hammer', 'axe', 'eagle', 'wheel', 'bell', 'horn', 'estoile', 'heart', 'acorn', 'blossom',
];
const PATTERNS: Division[] = ['paly', 'barry', 'chequy', 'gyronny'];

export interface NewArmsOpts {
  /** Empires: a crown above the shield. */
  crowned?: boolean;
  /** Charges to favour (a theocracy's cross and keys, a sea realm's ship and anchor). */
  favour?: Charge[];
  /** Several charges (leagues: one for each of the founding members, as it were). */
  many?: boolean;
}

export function newArms(rnd: Rng, culture: string, opts: NewArmsOpts = {}): Arms {
  const fr = rnd();
  const field = fr < 0.06 ? pick(rnd, FURS) : fr < 0.64 ? pick(rnd, COLOURS) : pick(rnd, METALS);
  const r = rnd();
  const fur = isFur(field);
  // Plain fields half the time; otherwise a division, or (less often) a pattern of two tinctures.
  const division: Division = fur || r < 0.46 ? 'plain' : r < 0.84 ? pick(rnd, ['pale', 'fess', 'bend', 'bendSinister', 'saltire', 'quarterly', 'chevron'] as Division[]) : pick(rnd, PATTERNS);
  const field2 = contrast(rnd, field);
  const plainField = division === 'plain';
  const pattern = PATTERNS.includes(division);
  const favs = [...(opts.favour ?? []), ...(opts.favour ?? []), ...(CULTURE_CHARGES[culture] ?? [])];
  const kind: Charge = rnd() < 0.6 && favs.length ? pick(rnd, favs) : pick(rnd, ALL_CHARGES);
  const n = (opts.many ? 3 : rnd() < 0.3 ? 3 : rnd() < 0.12 ? 2 : 1) as 1 | 2 | 3;
  if (pattern) {
    // A patterned field is busy: a plain chief (charged, often) or nothing more.
    // The chief takes the metal the pattern does not use, so it stands clear of both.
    const chiefT = METALS.find((m) => m !== field && m !== field2) ?? 'or';
    const chief = rnd() < 0.6 ? { kind: 'chief' as Ordinary, t: chiefT } : null;
    const charge = chief && rnd() < 0.75 ? { kind, t: contrast(rnd, chief.t), n: 3 as const, counter: false } : null;
    return { shield: SHIELD_BY_CULTURE[culture] ?? 'heater', field, division, field2, ordinary: chief, charge, bordure: null, label: null, crowned: !!opts.crowned };
  }
  const ordKinds: Ordinary[] = ['fess', 'pale', 'bend', 'chevron', 'cross', 'saltire', 'chief', 'pile', 'pall', 'bordure'];
  const ordinary = plainField && rnd() < 0.55 ? { kind: pick(rnd, ordKinds), t: contrast(rnd, field) } : null;
  // Charges sit on the field (plain fields) or, on divided ones, counterchanged.
  // No charges over a cross, saltire, pall or pile (they would sit on the ordinary).
  const crowded = ordinary && ['cross', 'saltire', 'pall', 'pile'].includes(ordinary.kind);
  const charge = !crowded && (!ordinary || rnd() < 0.55 || ordinary.kind === 'bordure')
    ? { kind, t: plainField ? contrast(rnd, field, ordinary?.kind === 'chief' || ordinary?.kind === 'bordure' ? undefined : ordinary?.t) : field2, n, counter: !plainField }
    : null;
  // Three charges with a chief stand on the chief, so they contrast with it.
  if (charge && ordinary?.kind === 'chief' && charge.n === 3) charge.t = contrast(rnd, ordinary.t);
  return { shield: SHIELD_BY_CULTURE[culture] ?? 'heater', field, division, field2, ordinary, charge, bordure: null, label: null, crowned: !!opts.crowned };
}

/** Arms of a vassal: the liege's field and colours with a new charge (a cadet branch). */
export function vassalArms(rnd: Rng, liege: Arms, culture: string): Arms {
  const a: Arms = { ...liege, crowned: false, bordure: null, label: null, ordinary: liege.ordinary ? { ...liege.ordinary } : null, charge: liege.charge ? { ...liege.charge } : null };
  const favs = CULTURE_CHARGES[culture] ?? [];
  const r = rnd();
  const pattern = PATTERNS.includes(a.division);
  if (r < 0.45 || pattern) {
    // Same field, new charge.
    const k = pick(rnd, favs.length && rnd() < 0.5 ? favs : ALL_CHARGES);
    if (a.ordinary && ['cross', 'saltire', 'pall', 'pile'].includes(a.ordinary.kind)) a.ordinary = null;
    const n = (pattern ? 3 : rnd() < 0.4 ? 3 : 1) as 1 | 3;
    // Patterned fields carry their charges on a chief.
    if (pattern && a.ordinary?.kind !== 'chief') a.ordinary = { kind: 'chief', t: pick(rnd, METALS) };
    const onChief = a.ordinary?.kind === 'chief' && n === 3;
    const t = onChief ? contrast(rnd, a.ordinary!.t) : a.division === 'plain' ? contrast(rnd, a.field, a.ordinary?.t) : a.field2;
    a.charge = { kind: k === liege.charge?.kind ? pick(rnd, ALL_CHARGES) : k, t, n, counter: !onChief && a.division !== 'plain' };
  } else if (r < 0.75) {
    // Colours reversed (counterchanged house colours).
    if (a.division !== 'plain') [a.field, a.field2] = [a.field2, a.field];
    else {
      const f = a.field;
      a.field = a.charge?.t ?? contrast(rnd, f);
      if (a.charge) a.charge.t = isFur(f) ? contrast(rnd, a.field) : f;
      if (a.ordinary) a.ordinary.t = contrast(rnd, a.field);
    }
  } else {
    a.ordinary = { kind: pick(rnd, ['fess', 'pale', 'bend', 'chevron', 'chief', 'pile'] as Ordinary[]), t: contrast(rnd, a.field) };
    if (a.division !== 'plain') a.division = 'plain';
    if (a.charge) a.charge = { ...a.charge, t: contrast(rnd, a.field, a.ordinary.t), counter: false };
  }
  return a;
}

/** Arms of a junior house: its liege's arms with a mark of difference (a bordure or a label). */
export function cadetArms(rnd: Rng, liege: Arms): Arms {
  const a: Arms = { ...liege, crowned: false, ordinary: liege.ordinary ? { ...liege.ordinary } : null, charge: liege.charge ? { ...liege.charge } : null };
  const t = isMetal(liege.field) ? pick(rnd, COLOURS.filter((c) => c !== liege.field2)) : pick(rnd, METALS);
  if (rnd() < 0.6 && a.ordinary?.kind !== 'bordure') {
    a.bordure = t;
    a.label = null;
  } else {
    a.label = t;
    a.bordure = null;
  }
  // Some also take a different number of charges.
  if (a.charge && rnd() < 0.35) a.charge.n = a.charge.n === 1 ? 3 : 1;
  return a;
}

// ---- Blazon ----------------------------------------------------------------------------------

const T_NAME: Record<Tincture, string> = {
  or: 'Or', argent: 'Argent', gules: 'Gules', azure: 'Azure', vert: 'Vert', sable: 'Sable', purpure: 'Purpure',
  tenne: 'Tenné', sanguine: 'Sanguine', celeste: 'Celeste', ermine: 'Ermine', vair: 'Vair',
};
const DIV_NAME: Record<Division, string> = {
  plain: '', pale: 'Per pale', fess: 'Per fess', bend: 'Per bend', bendSinister: 'Per bend sinister', saltire: 'Per saltire', quarterly: 'Quarterly',
  chevron: 'Per chevron', paly: 'Paly of six', barry: 'Barry of eight', chequy: 'Chequy', gyronny: 'Gyronny of eight',
};
const CHARGE_NAME: Record<Charge, [string, string]> = {
  mullet: ['a mullet', 'mullets'], crescent: ['a crescent', 'crescents'], roundel: ['a roundel', 'roundels'],
  lozenge: ['a lozenge', 'lozenges'], tower: ['a tower', 'towers'], crown: ['a crown', 'crowns'],
  fleur: ['a fleur-de-lis', 'fleurs-de-lis'], key: ['a key', 'keys'], tree: ['a tree', 'trees'],
  sun: ['a sun in splendour', 'suns'], cross: ['a cross pattée', 'crosses pattée'], anchor: ['an anchor', 'anchors'],
  ship: ['a lymphad', 'lymphads'], sword: ['a sword erect', 'swords erect'], hammer: ['a hammer', 'hammers'], axe: ['an axe', 'axes'],
  eagle: ['an eagle displayed', 'eagles displayed'], wheel: ['a wheel', 'wheels'], bell: ['a bell', 'bells'], horn: ['a hunting horn', 'hunting horns'],
  estoile: ['an estoile', 'estoiles'], heart: ['a heart', 'hearts'], acorn: ['an acorn', 'acorns'], blossom: ['a blossom', 'blossoms'],
};
const NUM = ['', '', 'two', 'three'];

/** The arms in heraldic language, e.g. "Per pale Gules and Argent, three mullets Or". */
export function blazon(a: Arms): string {
  const parts: string[] = [a.division === 'plain' ? T_NAME[a.field] : `${DIV_NAME[a.division]} ${T_NAME[a.field]} and ${T_NAME[a.field2]}`];
  const charge = a.charge ? `${a.charge.n === 1 ? CHARGE_NAME[a.charge.kind][0] : `${NUM[a.charge.n]} ${CHARGE_NAME[a.charge.kind][1]}`} ${a.charge.counter ? 'counterchanged' : T_NAME[a.charge.t]}` : '';
  if (a.ordinary?.kind === 'chief' && a.charge && !a.charge.counter && a.charge.n === 3) parts.push(`on a chief ${T_NAME[a.ordinary.t]} ${charge}`);
  else {
    if (a.ordinary) parts.push(`a ${a.ordinary.kind} ${T_NAME[a.ordinary.t]}`);
    if (charge) parts.push(charge);
  }
  if (a.label) parts.push(`a label ${T_NAME[a.label]}`);
  if (a.bordure) parts.push(`a bordure ${T_NAME[a.bordure]}`);
  return parts.join(', ');
}
