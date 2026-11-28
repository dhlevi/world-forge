/**
 * The law (docs/design/combat.md, stage 4; npcs.md, Reputation): crimes seen and told to the
 * watch, a record in each settlement, sentences by the place's laws, and the wanderer's standing
 * in each settlement.
 *
 * - **Crimes:** assault (striking someone who was not fighting you, or binding them), theft
 *   (robbing the fallen or yielded), murder, killing someone's beast, resisting arrest. A crime
 *   counts only if it was seen (or the victim lives to tell it): those who saw it think the worse
 *   of the wanderer and cry for the watch.
 * - **The record:** each settlement keeps the crimes told to it, and whether the wanderer is
 *   wanted there. The watch who see a wanted wanderer may know them, and come to arrest them.
 * - **Sentences** (decided: full justice, by the culture's laws): a fine for assault and for
 *   theft (three times what was taken), days in the cells for what cannot be paid, the stocks for
 *   a brawler who will not learn, a brand on the hand for the thief taken again, and the rope for
 *   murder. A harsh people (Legalists, a warrior culture, the Insular toward strangers) punishes
 *   more; a cosmopolitan one less.
 * - **Standing:** a settlement's regard for the wanderer, from the deeds it has seen and heard of
 *   (a crime, robbers killed or handed over), fading back to nothing in time.
 *
 * Proposed numbers, to tune in play.
 */
import { CULTURES } from '@worldforge/core/names/cultures';

export type CrimeKind = 'assault' | 'theft' | 'murder' | 'livestock' | 'resisting' | 'debt';
export const CRIME_WORDS: Record<CrimeKind, string> = { assault: 'assault', theft: 'theft', murder: 'murder', livestock: 'killing another\'s beast', resisting: 'resisting arrest', debt: 'a debt unpaid' };

export interface Crime {
  kind: CrimeKind;
  /** When (game seconds), against whom, how many saw it, and what was taken or lost (copper). */
  at: number;
  victim: string;
  witnesses: number;
  value?: number;
  /** Already punished. */
  served?: boolean;
}

export interface LawRecord {
  name: string;
  crimes: Crime[];
  /** Wanted: a crime not yet answered for. */
  wanted: boolean;
  /** Times punished here, by kind (a second theft brings the brand). */
  punished: Partial<Record<CrimeKind, number>>;
}

export interface Deed {
  why: string;
  value: number;
  t: number;
}

export interface Sentence {
  fine: number;
  days: number;
  stocks: boolean;
  brand: boolean;
  hang: boolean;
  /** For what, in words ("two assaults and a theft"). */
  for: string;
}

export interface LawData {
  records: Record<string, LawRecord>;
  standing: Record<string, { name: string; deeds: Deed[] }>;
}

/** Days for a deed's weight in a settlement's regard to fade by half. */
const DEED_HALF = 45;
/** Copper a day in the cells is worth against a fine. */
const DAY_COPPER = 20;

/** How harsh a people's law is (1 the usual), from its traditions. */
export function harshness(culture: number | undefined): number {
  const t = culture === undefined ? [] : CULTURES[culture]?.traditions ?? [];
  let h = 1;
  if (t.includes('legalists')) h += 0.3;
  if (t.includes('warriorCulture')) h += 0.15;
  if (t.includes('xenophobe')) h += 0.2;
  if (t.includes('clanTies')) h += 0.1;
  if (t.includes('xenophile')) h -= 0.15;
  if (t.includes('merchantPrinces')) h -= 0.05;
  return Math.max(0.6, Math.min(1.7, h));
}

export class Law {
  private records = new Map<string, LawRecord>();
  private standings = new Map<string, { name: string; deeds: Deed[] }>();
  /** Told of every crime, seen or not (the quests' Clean mark, game/quests.ts). */
  onCrime: (kind: CrimeKind, witnesses: number) => void = () => {};

  /** A crime, seen by so many (0: unseen, and so unknown to the law). Returns whether it is on the record. */
  crime(place: { id: string; name: string }, kind: CrimeKind, victim: string, witnesses: number, t: number, value?: number): boolean {
    this.onCrime(kind, witnesses);
    if (witnesses <= 0) return false;
    const rec = this.recordOf(place);
    rec.crimes.push({ kind, at: t, victim, witnesses, ...(value ? { value } : {}) });
    rec.wanted = true;
    this.deed(place, `${CRIME_WORDS[kind]} of ${victim}`, { assault: -10, theft: -15, murder: -40, livestock: -8, resisting: -10, debt: -12 }[kind], t);
    return true;
  }

  /** A deed seen or told of in a settlement: its regard for the wanderer rises or falls. */
  deed(place: { id: string; name: string } | null, why: string, value: number, t: number): void {
    if (!place) return;
    const s = this.standings.get(place.id) ?? { name: place.name, deeds: [] };
    s.deeds.push({ why, value, t });
    if (s.deeds.length > 60) s.deeds.shift();
    this.standings.set(place.id, s);
  }

  private recordOf(place: { id: string; name: string }): LawRecord {
    let r = this.records.get(place.id);
    if (!r) {
      r = { name: place.name, crimes: [], wanted: false, punished: {} };
      this.records.set(place.id, r);
    }
    return r;
  }

  /** A settlement's regard for the wanderer now (-100 to 100). */
  standing(id: string, t: number): number {
    const s = this.standings.get(id);
    if (!s) return 0;
    let v = 0;
    for (const d of s.deeds) v += d.value * Math.pow(0.5, Math.max(0, t - d.t) / (DEED_HALF * 86400));
    return Math.max(-100, Math.min(100, v));
  }

  wanted(id: string): boolean {
    return !!this.records.get(id)?.wanted;
  }

  /** The crimes not yet answered for in a settlement. */
  unserved(id: string): Crime[] {
    return this.records.get(id)?.crimes.filter((c) => !c.served) ?? [];
  }

  /** The sentence for the crimes not yet answered for, by the place's harshness (1 the usual). */
  sentence(id: string, harsh: number): Sentence {
    const rec = this.records.get(id);
    const crimes = this.unserved(id);
    const s: Sentence = { fine: 0, days: 0, stocks: false, brand: false, hang: false, for: '' };
    if (!rec || !crimes.length) return s;
    const count: Partial<Record<CrimeKind, number>> = {};
    for (const c of crimes) {
      count[c.kind] = (count[c.kind] ?? 0) + 1;
      switch (c.kind) {
        case 'murder':
          if (harsh >= 0.9) s.hang = true;
          else {
            s.days += 60;
            s.brand = true;
          }
          break;
        case 'assault':
          s.fine += Math.round(40 * harsh);
          break;
        case 'theft':
          s.fine += Math.round(Math.max(30, (c.value ?? 10) * 3) * harsh);
          if ((rec.punished.theft ?? 0) + (count.theft ?? 0) >= 2) s.brand = true;
          break;
        case 'livestock':
          s.fine += Math.round(Math.max(40, (c.value ?? 30) * 2) * harsh);
          break;
        case 'resisting':
          s.days += Math.round(3 * harsh);
          break;
        case 'debt':
          // The debt itself, and a fifth more for the court's trouble.
          s.fine += Math.round((c.value ?? 50) * 1.2);
          break;
      }
    }
    // A brawler who will not learn: a day in the stocks.
    if ((rec.punished.assault ?? 0) + (count.assault ?? 0) >= 3) s.stocks = true;
    s.for = (Object.entries(count) as [CrimeKind, number][]).map(([k, n]) => (n > 1 ? `${n} counts of ${CRIME_WORDS[k]}` : CRIME_WORDS[k])).join(', ');
    return s;
  }

  /** The fine paid as far as the purse goes; the rest in days in the cells. Returns the copper paid and the days added. */
  static pay(fine: number, purse: number): { paid: number; days: number } {
    const paid = Math.min(fine, purse);
    return { paid, days: Math.ceil((fine - paid) / DAY_COPPER) };
  }

  /** The crimes answered for: the wanderer is no longer wanted there. */
  served(id: string): void {
    const rec = this.records.get(id);
    if (!rec) return;
    for (const c of rec.crimes) if (!c.served) {
      c.served = true;
      rec.punished[c.kind] = (rec.punished[c.kind] ?? 0) + 1;
    }
    rec.wanted = false;
  }

  /** Every settlement with a regard for the wanderer or a record of them: its name, regard in words, and what they are wanted for there. */
  places(t: number): { id: string; name: string; standing: number; words: string; wanted: string | null }[] {
    const ids = new Set([...this.standings.keys(), ...this.records.keys()]);
    const wanted = new Map(this.wantedIn().map((w) => [w.id, w.for]));
    return [...ids].map((id) => {
      const v = this.standing(id, t);
      return { id, name: this.standings.get(id)?.name ?? this.records.get(id)?.name ?? id, standing: Math.round(v), words: standingWords(v), wanted: wanted.get(id) ?? null };
    }).filter((p) => p.wanted || Math.abs(p.standing) >= 3).sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  /** The records, for the journal and the character sheet: where the wanderer is wanted, and for what. */
  wantedIn(): { id: string; name: string; for: string }[] {
    return [...this.records].filter(([, r]) => r.wanted).map(([id, r]) => ({ id, name: r.name, for: r.crimes.filter((c) => !c.served).map((c) => CRIME_WORDS[c.kind]).join(', ') }));
  }

  export(): LawData {
    return {
      records: Object.fromEntries([...this.records].map(([k, r]) => [k, JSON.parse(JSON.stringify(r)) as LawRecord])),
      standing: Object.fromEntries([...this.standings].map(([k, s]) => [k, { name: s.name, deeds: s.deeds.map((d) => ({ ...d })) }])),
    };
  }

  import(d: LawData | undefined): void {
    this.records.clear();
    this.standings.clear();
    for (const [k, r] of Object.entries(d?.records ?? {})) if (r && Array.isArray(r.crimes)) this.records.set(k, { name: String(r.name ?? k), crimes: r.crimes.filter((c) => c && typeof c.at === 'number'), wanted: !!r.wanted, punished: r.punished ?? {} });
    for (const [k, s] of Object.entries(d?.standing ?? {})) if (s && Array.isArray(s.deeds)) this.standings.set(k, { name: String(s.name ?? k), deeds: s.deeds.filter((x) => x && typeof x.value === 'number' && typeof x.t === 'number') });
  }
}

/** A settlement's regard in words. */
export function standingWords(v: number): string {
  if (v >= 30) return 'well thought of';
  if (v >= 8) return 'known kindly';
  if (v > -8) return 'a stranger, or nearly';
  if (v > -30) return 'mistrusted';
  return 'hated';
}
