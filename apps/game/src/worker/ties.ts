/**
 * The people of the wanderer's life as residents of the world (docs/design/characters.md, People in
 * your life; stage Q3): each living tie of character creation is given a home in its settlement.
 * Family (parents and siblings) share one household; every other named person (a creditor, a
 * contact, a rival, a love, a master) has a household of their own; a feuding family and the
 * family's creditor are households of the town as it is. The home is chosen from the town's plan by
 * the tie's key, so the same life always finds the same doors; the person then keeps the day of
 * any resident there (worker/people.ts), under their own name, looks and id.
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import type { LocalWorld } from '@worldforge/core/local/chunk';
import type { PlanFeature } from '@worldforge/core/towns/plan';
import { LocalFrame } from '@worldforge/core/towns/plan';
import { householdsFor, residentBuilding } from '@worldforge/core/people/plan-residents';
import { kindOf, type Household, type Person } from '@worldforge/core/people/residents';
import { hashString } from '@worldforge/core/gen/rng';
import { findSite } from './sites';
import type { TieFolk, TiePlaced } from './protocol';

/** The people of the wanderer's life by the building they live in (its bid). */
const hosts = new Map<string, TieFolk[]>();
/** The resident each tie has become. */
const folkOf = new WeakMap<Person, TieFolk>();

/** The tie a resident is, if any. */
export const tieOf = (p: Person): TieFolk | undefined => folkOf.get(p);

/** Forgets the ties (a new game). */
export function forgetTies(): void {
  hosts.clear();
}

/** The building features of a plan, with their bid. */
function buildingsOf(plan: PlanFeature[]): PlanFeature[] {
  return plan.filter((f) => f.properties.kind === 'building' && f.geometry.type === 'Polygon' && f.properties.bid !== undefined && f.properties.tree !== 'top');
}

/**
 * Gives each tie a home in its settlement, and returns where they live. A home is a house of the
 * plan with a household in it, chosen by the tie's key (family by the family's), and not already
 * another tie's.
 */
export function placeTies(w: GeneratedWorld, local: LocalWorld, ties: TieFolk[]): TiePlaced[] {
  hosts.clear();
  const out: TiePlaced[] = [];
  const bySite = new Map<string, TieFolk[]>();
  for (const t of ties) (bySite.get(t.siteId) ?? bySite.set(t.siteId, []).get(t.siteId)!).push(t);
  for (const [siteId, list] of bySite) {
    const s = findSite(local.towns, siteId);
    if (!s) continue;
    const plan = local.towns.planOf(s);
    const blds = buildingsOf(plan).sort((a, b) => (String(a.properties.bid) < String(b.properties.bid) ? -1 : 1));
    if (!blds.length) continue;
    const v = s.tier === 'village' ? { lon: s.lon, lat: s.lat, kind: String(s.kind ?? 'farming'), population: s.population, name: s.name ?? '' } : undefined;
    const used = new Set<string>();
    /** A house with a household, from a key: the first such from a place the key picks. */
    const houseFor = (key: string): { f: PlanFeature; hh: Household[] } | null => {
      const start = hashString(`${w.raster.seed}#tiehome#${key}`) % blds.length;
      for (let n = 0; n < Math.min(blds.length, 400); n++) {
        const f = blds[(start + n * 7) % blds.length];
        const bid = String(f.properties.bid);
        if (used.has(bid)) continue;
        try {
          const ring = (f.geometry as { coordinates: number[][][] }).coordinates[0];
          if (kindOf(residentBuilding(f, new LocalFrame(ring[0][0], ring[0][1]), w.raster.seed)) !== 'home') continue;
          const hh = householdsFor(w, f, buildingsOf(plan), v);
          if (!hh.length || !hh[0].members.length) continue;
          used.add(bid);
          return { f, hh };
        } catch {
          continue;
        }
      }
      return null;
    };
    const centre = (f: PlanFeature) => {
      const ring = (f.geometry as { coordinates: number[][][] }).coordinates[0];
      return { lon: ring.reduce((a, c) => a + c[0], 0) / ring.length, lat: ring.reduce((a, c) => a + c[1], 0) / ring.length };
    };
    const place = (t: TieFolk, f: PlanFeature, household: string, name: string, given: string, trade: string) => {
      const bid = String(f.properties.bid);
      (hosts.get(bid) ?? hosts.set(bid, []).get(bid)!).push(t);
      out.push({ key: t.key, name, given, trade, siteId, siteName: s.name ?? '', household, ...centre(f) });
    };
    // Family under one roof.
    const family = list.filter((t) => t.family && t.name);
    if (family.length) {
      const h = houseFor(`family#${family.map((t) => t.key).join(',')}`);
      if (h) for (const t of family) place(t, h.f, familyName(family), t.name!, t.given ?? t.name!, t.trade ?? 'helps at home');
    }
    for (const t of list) {
      if (t.family && t.name) continue;
      const h = houseFor(t.key);
      if (!h) continue;
      if (t.name) place(t, h.f, `the household of ${t.name}`, t.name, t.given ?? t.name, t.trade ?? h.hh[0].members[0].trade);
      else {
        // A household of the town as it is (a feuding family, the family's creditor): its head.
        const head = h.hh[0].members[0];
        place({ ...t, unnamed: true } as TieFolk, h.f, h.hh[0].name, head.name, head.given, head.trade);
      }
    }
  }
  return out;
}

const familyName = (family: TieFolk[]): string => `the household of ${(family.find((t) => t.kind === 'parent' && !t.female) ?? family[0]).name}`;

/**
 * A building's households with the people of the wanderer's life in it (worker/people.ts, as each
 * house is worked out): family or a named person take the first household's place; an unnamed tie
 * marks its head.
 */
export function withTies(bid: string, households: Household[]): Household[] {
  const list = hosts.get(bid);
  if (!list?.length || !households.length) return households;
  const first = households[0];
  const people: Person[] = [];
  for (const t of list) {
    if ((t as TieFolk & { unnamed?: boolean }).unnamed) {
      // An unnamed tie: this household's head.
      if (first.members[0]) folkOf.set(first.members[0], t);
      continue;
    }
    const host = first.members[0];
    const p: Person = {
      name: t.name ?? host.name, given: t.given ?? t.name ?? host.given, female: t.female ?? host.female, age: t.age ?? host.age, culture: host.culture, people: host.people,
      trade: t.trade ?? 'helps at home', role: roleOf(t, list), traits: [], ties: [],
    };
    folkOf.set(p, t);
    people.push(p);
  }
  if (!people.length) return households;
  const name = list.some((t) => t.family) ? familyName(list.filter((t) => t.family)) : `the household of ${people[0].name}`;
  return [{ name, means: first.means, members: people }, ...households.slice(1)];
}

function roleOf(t: TieFolk, all: TieFolk[]): string {
  if (t.kind === 'parent') return t.female && all.some((x) => x.kind === 'parent' && !x.female) ? 'wife' : 'head';
  if (t.kind === 'sibling') return t.female ? 'daughter' : 'son';
  return 'head';
}
