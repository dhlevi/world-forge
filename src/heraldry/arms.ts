import type { Rng } from '../gen/rng';

/**
 * Procedural coats of arms: a shield shaped by culture, a field (plain or divided), an
 * ordinary, charges, and cadency marks for junior arms. Tinctures follow the rule of tincture
 * (no colour on colour, no metal on metal). Arms descend through the political hierarchy: a
 * duchy keeps its kingdom's field and changes the charge; a county keeps its duchy's arms and
 * adds a mark of difference.
 */
export type Tincture = 'or' | 'argent' | 'gules' | 'azure' | 'vert' | 'sable' | 'purpure';
export type Shield = 'heater' | 'french' | 'round' | 'kite' | 'spanish';
export type Division = 'plain' | 'pale' | 'fess' | 'bend' | 'saltire' | 'quarterly' | 'chevron';
export type Ordinary = 'fess' | 'pale' | 'bend' | 'chevron' | 'cross' | 'saltire' | 'chief';
export type Charge = 'mullet' | 'crescent' | 'roundel' | 'lozenge' | 'tower' | 'crown' | 'fleur' | 'key' | 'tree' | 'sun' | 'cross';

export interface Arms {
  shield: Shield;
  field: Tincture;
  division: Division;
  /** Second tincture of a divided field. */
  field2: Tincture;
  ordinary: { kind: Ordinary; t: Tincture } | null;
  /** On a divided field charges are counterchanged (each half takes the other half's tincture). */
  charge: { kind: Charge; t: Tincture; n: 1 | 3; counter?: boolean } | null;
  /** Marks of difference for junior arms. */
  bordure: Tincture | null;
  label: Tincture | null;
  /** Empires: a crown above the shield. */
  crowned: boolean;
}

const METALS: Tincture[] = ['or', 'argent'];
const COLOURS: Tincture[] = ['gules', 'azure', 'vert', 'sable', 'purpure'];
export const TINCTURE_HEX: Record<Tincture, string> = {
  or: '#e2b93f', argent: '#f2efe6', gules: '#b1322a', azure: '#2f5596', vert: '#3c7a3e', sable: '#2a2522', purpure: '#6f3d7a',
};
const isMetal = (t: Tincture) => t === 'or' || t === 'argent';
const pick = <T>(rnd: Rng, a: T[]): T => a[Math.floor(rnd() * a.length)];
/** A tincture of the opposite class (metal on colour, colour on metal). */
const contrast = (rnd: Rng, t: Tincture, avoid?: Tincture) => {
  const set = (isMetal(t) ? COLOURS : METALS).filter((x) => x !== avoid);
  return pick(rnd, set.length ? set : isMetal(t) ? COLOURS : METALS);
};

const SHIELD_BY_CULTURE: Record<string, Shield> = {
  anglo: 'heater', latin: 'spanish', celtic: 'heater', norse: 'round', elvish: 'kite', desert: 'round', slavic: 'french',
  dwarven: 'kite', southern: 'spanish', steppe: 'round', jungle: 'french',
};
/** Favourite field colours and charges by culture (a light touch). */
const CULTURE_CHARGES: Record<string, Charge[]> = {
  anglo: ['tower', 'crown', 'fleur', 'mullet'], latin: ['key', 'crown', 'sun', 'tower'], celtic: ['tree', 'crescent', 'roundel'],
  norse: ['mullet', 'crescent', 'tree'], elvish: ['tree', 'mullet', 'crescent'], desert: ['crescent', 'mullet', 'sun'],
  slavic: ['cross', 'crown', 'tower'], dwarven: ['tower', 'key', 'crown'], southern: ['sun', 'lozenge', 'key'],
  steppe: ['sun', 'crescent', 'mullet'], jungle: ['sun', 'roundel', 'lozenge'],
};

export function newArms(rnd: Rng, culture: string, crowned = false): Arms {
  const field = rnd() < 0.62 ? pick(rnd, COLOURS) : pick(rnd, METALS);
  const r = rnd();
  const division: Division = r < 0.5 ? 'plain' : pick(rnd, ['pale', 'fess', 'bend', 'saltire', 'quarterly', 'chevron'] as Division[]);
  const field2 = contrast(rnd, field);
  const plainField = division === 'plain';
  const ordinary = plainField && rnd() < 0.55 ? { kind: pick(rnd, ['fess', 'pale', 'bend', 'chevron', 'cross', 'saltire', 'chief'] as Ordinary[]), t: contrast(rnd, field) } : null;
  // Charges sit on the field (plain fields) or, on divided ones, in a contrasting metal or colour.
  const favs = CULTURE_CHARGES[culture] ?? [];
  const kind: Charge = rnd() < 0.5 && favs.length ? pick(rnd, favs) : pick(rnd, ['mullet', 'crescent', 'roundel', 'lozenge', 'tower', 'crown', 'fleur', 'key', 'tree', 'sun', 'cross'] as Charge[]);
  const charge = !ordinary || rnd() < 0.5
    ? { kind, t: plainField ? contrast(rnd, field, ordinary?.t) : field2, n: (rnd() < 0.35 ? 3 : 1) as 1 | 3, counter: false }
    : null;
  // On a divided field no single tincture contrasts with both halves: counterchange.
  if (charge && !plainField) {
    charge.t = field2;
    charge.counter = true;
  }
  return { shield: SHIELD_BY_CULTURE[culture] ?? 'heater', field, division, field2, ordinary, charge, bordure: null, label: null, crowned };
}

/** Arms of a vassal: the liege's field and colours with a new charge (a cadet branch). */
export function vassalArms(rnd: Rng, liege: Arms, culture: string): Arms {
  const a: Arms = { ...liege, crowned: false, bordure: null, label: null, ordinary: liege.ordinary ? { ...liege.ordinary } : null, charge: liege.charge ? { ...liege.charge } : null };
  const favs = CULTURE_CHARGES[culture] ?? [];
  const kinds: Charge[] = ['mullet', 'crescent', 'roundel', 'lozenge', 'tower', 'crown', 'fleur', 'key', 'tree', 'sun', 'cross'];
  const r = rnd();
  if (r < 0.45) {
    // Same field, new charge.
    const k = pick(rnd, favs.length && rnd() < 0.5 ? favs : kinds);
    const t = a.division === 'plain' ? contrast(rnd, a.field, a.ordinary?.t) : a.field2;
    a.charge = { kind: k === liege.charge?.kind ? pick(rnd, kinds) : k, t, n: (rnd() < 0.4 ? 3 : 1) as 1 | 3, counter: a.division !== 'plain' };
  } else if (r < 0.75) {
    // Colours reversed (counterchanged house colours).
    if (a.division !== 'plain') [a.field, a.field2] = [a.field2, a.field];
    else {
      const f = a.field;
      a.field = a.charge?.t ?? contrast(rnd, f);
      if (a.charge) a.charge.t = f;
      if (a.ordinary) a.ordinary.t = contrast(rnd, a.field);
    }
  } else {
    a.ordinary = { kind: pick(rnd, ['fess', 'pale', 'bend', 'chevron', 'chief'] as Ordinary[]), t: contrast(rnd, a.field) };
    if (a.division !== 'plain') a.division = 'plain';
    if (a.charge) a.charge = { ...a.charge, t: contrast(rnd, a.field, a.ordinary.t), counter: false };
  }
  return a;
}

/** Arms of a county: its duchy's arms with a mark of difference (a bordure or a label). */
export function cadetArms(rnd: Rng, liege: Arms): Arms {
  const a: Arms = { ...liege, crowned: false, ordinary: liege.ordinary ? { ...liege.ordinary } : null, charge: liege.charge ? { ...liege.charge } : null };
  const t = isMetal(liege.field) ? pick(rnd, COLOURS.filter((c) => c !== liege.field2)) : pick(rnd, METALS);
  if (rnd() < 0.6) {
    a.bordure = t;
    a.label = null;
  } else {
    a.label = t;
    a.bordure = null;
  }
  // Some counties also take a different number of charges.
  if (a.charge && rnd() < 0.35) a.charge.n = a.charge.n === 1 ? 3 : 1;
  return a;
}

// ---- Blazon ----------------------------------------------------------------------------------

const T_NAME: Record<Tincture, string> = { or: 'Or', argent: 'Argent', gules: 'Gules', azure: 'Azure', vert: 'Vert', sable: 'Sable', purpure: 'Purpure' };
const DIV_NAME: Record<Division, string> = { plain: '', pale: 'Per pale', fess: 'Per fess', bend: 'Per bend', saltire: 'Per saltire', quarterly: 'Quarterly', chevron: 'Per chevron' };
const CHARGE_NAME: Record<Charge, [string, string]> = {
  mullet: ['a mullet', 'three mullets'], crescent: ['a crescent', 'three crescents'], roundel: ['a roundel', 'three roundels'],
  lozenge: ['a lozenge', 'three lozenges'], tower: ['a tower', 'three towers'], crown: ['a crown', 'three crowns'],
  fleur: ['a fleur-de-lis', 'three fleurs-de-lis'], key: ['a key', 'three keys'], tree: ['a tree', 'three trees'],
  sun: ['a sun in splendour', 'three suns'], cross: ['a cross pattée', 'three crosses pattée'],
};

/** The arms in heraldic language, e.g. "Per pale Gules and Argent, three mullets Or". */
export function blazon(a: Arms): string {
  const parts: string[] = [a.division === 'plain' ? T_NAME[a.field] : `${DIV_NAME[a.division]} ${T_NAME[a.field]} and ${T_NAME[a.field2]}`];
  if (a.ordinary) parts.push(`a ${a.ordinary.kind} ${T_NAME[a.ordinary.t]}`);
  if (a.charge) parts.push(`${CHARGE_NAME[a.charge.kind][a.charge.n === 3 ? 1 : 0]} ${a.charge.counter ? 'counterchanged' : T_NAME[a.charge.t]}`);
  if (a.label) parts.push(`a label ${T_NAME[a.label]}`);
  if (a.bordure) parts.push(`a bordure ${T_NAME[a.bordure]}`);
  return parts.join(', ');
}
