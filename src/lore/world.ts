import { type Politics, type PolUnit } from '../gen/politics';
import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Settlement } from '../gen/settlements';
import { CULTURES } from '../names/cultures';
import { NameBank } from '../names/names';
import { type Economy, type Land, addLand, coinOf, emptyLand, finishLand, GOOD_IDS, production, tradeOf } from './economy';
import { buildFaiths, type FaithWorld } from './faiths';
import { cultureId, type House, houseMotto, houseName, personName } from './names';

const SURNAME_FIRST_LORE = new Set(['sinic', 'japonic', 'koreanic']);

/**
 * The world's history and diplomacy, made once per world (on first use) from its political map:
 * the calendar and the great events every realm lived through (plagues, the age of sail), when
 * each realm arose, the houses that rule them, the wars fought between neighbours (each with its
 * cause, peace and price, consistent with today's borders: a county won in a war is held by its
 * winner now, and its loser may claim it still), today's alliances, rivalries and wars, and
 * pretenders to thrones. Everything is seeded, so a world always tells the same story.
 */

export type RelKind = 'league' | 'alliance' | 'friendly' | 'neutral' | 'truce' | 'rival' | 'war';
export interface Relation {
  kind: RelKind;
  since: number;
  /** "marriage alliance", "against the Kingdom of X", "border dispute". */
  note: string;
  /** Married houses (their rulers are spouses or close kin). */
  married?: boolean;
}
export interface War {
  id: number;
  name: string;
  attackers: number[];
  defenders: number[];
  start: number;
  end?: number;
  cause: string;
  /** Past wars: who won (0 attackers, 1 defenders, -1 neither) and what changed hands. */
  winner?: -1 | 0 | 1;
  prize?: number;
  peace?: string;
  /** Present wars: how it stands. */
  status?: string;
}
export interface Claim {
  /** The realm pressing or holding the claim. */
  by: number;
  /** The unit claimed (a county, duchy or a throne). */
  on: number;
  kind: 'territory' | 'throne';
  since: number;
  text: string;
  /** For a claim to a throne: the pretender. */
  pretender?: { name: string; house: number; age: number; female: boolean };
}
export interface WorldEvent {
  year: number;
  name: string;
  text: string;
  oldWorld: boolean;
}

export interface WorldLore {
  year: number;
  era: string;
  eraShort: string;
  bank: NameBank;
  faiths: FaithWorld;
  houses: House[];
  topOf: Int32Array;
  tops: number[];
  kids: number[][];
  baronies: (u: number) => number[];
  /** Cities and towns per barony. */
  townsOf: Settlement[][];
  neighbours: Map<number, Map<number, number>>;
  relation: (a: number, b: number) => Relation | undefined;
  relations: Map<number, Map<number, Relation>>;
  wars: War[];
  claims: Claim[];
  events: WorldEvent[];
  sail: number;
  founded: (u: number) => number;
  joined: (u: number) => { year: number; how: string };
  houseOf: (u: number) => House;
  pastHouses: (u: number) => { house: House; from: number; to: number; how: string }[];
  land: (u: number) => Land;
  econ: Map<number, Economy>;
  worldOut: Record<string, number>;
  worldPeople: number;
  wealthRank: (u: number) => number;
  partners: Map<number, { id: number; goods: string[] }[]>;
  pairRng: (key: string) => Rng;
}

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const distKm = (a: number, b: number, c: number, d: number) => {
  const dl = ((((c - a) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((((b + d) / 2) * Math.PI) / 180), (d - b) * 110.57);
};

const ERAS = [['of the Reckoning', 'R'], ['after the Founding', 'AF'], ['of the Crowning', 'C'], ['after the Sundering', 'AS'], ['of the Long Count', 'LC'], ['of the Lamp', 'L'], ['after the Flood', 'AFl']];
const PLAGUE = ['the Grey Death', 'the Sweating Sickness', 'the Red Pox', 'the Weeping Plague', 'the Black Fever', 'the Wasting', 'the Rat Plague', 'the Blue Cough'];
const WAR_ADJ = ['Long', 'Bitter', 'Red', 'Thirty Years\'', 'Hundred Years\'', 'Black', 'Lost', 'Cold', 'Holy', 'Barons\'', 'Brothers\'', 'Salt', 'Iron', 'Crown', 'Winter', 'Burning', 'Silent'];

export function buildWorldLore(seed: string, p: Politics, settlements: Settlement[]): WorldLore {
  const rnd = mulberry32(hashString(`${seed}#lore`));
  const R = (key: string) => mulberry32(hashString(`${seed}#lore#${key}`));
  const units = p.units;
  const bank = new NameBank(`${seed}#lore`, false);
  const [era, eraShort] = pick(rnd, ERAS);
  const year = 880 + Math.floor(rnd() * 560);

  // ---- Structure ------------------------------------------------------------------------------
  const kids: number[][] = units.map(() => []);
  for (const u of units) if (u.parent >= 0) kids[u.parent].push(u.id);
  const topOf = new Int32Array(units.length);
  for (const u of units) {
    let t = u;
    while (t.parent >= 0) t = units[t.parent];
    topOf[u.id] = t.id;
  }
  const tops = units.filter((u) => u.parent < 0 && u.gov !== 'league').map((u) => u.id);
  const bCache = new Map<number, number[]>();
  const baronies = (id: number): number[] => {
    let b = bCache.get(id);
    if (b) return b;
    const u = units[id];
    if (u.gov === 'league') b = units.filter((v) => v.league === id).flatMap((v) => baronies(v.id));
    else if (u.level === 0 && id < p.stats.nb) b = [id];
    else b = kids[id].flatMap((k) => baronies(k));
    bCache.set(id, b);
    return b;
  };
  const townsOf: Settlement[][] = Array.from({ length: p.stats.nb }, () => []);
  {
    const { W, H } = p;
    for (const s of settlements) {
      if (s.tier === 'village') continue;
      const i = ((Math.floor(((s.lon + 180) / 360) * W) % W) + W) % W, j = Math.min(H - 1, Math.max(0, Math.floor(((90 - s.lat) / 180) * H)));
      const b = p.baronyOf[j * W + i];
      if (b >= 0 && b < p.stats.nb) townsOf[b].push(s);
    }
    for (const t of townsOf) t.sort((a, b) => b.population - a.population);
  }
  const landCache = new Map<number, Land>();
  const land = (id: number) => {
    let l = landCache.get(id);
    if (!l) {
      l = emptyLand();
      for (const b of baronies(id)) addLand(l, p.stats, b);
      landCache.set(id, finishLand(l));
    }
    return l;
  };

  // ---- Great events ---------------------------------------------------------------------------
  const events: WorldEvent[] = [];
  const nPlague = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < nPlague; k++) {
    const y = year - 30 - Math.floor(rnd() * 600);
    const name = PLAGUE[(Math.floor(rnd() * PLAGUE.length) + k) % PLAGUE.length];
    events.push({ year: y, name, text: `${name} swept the Old World, killing ${pick(rnd, ['a third', 'a quarter', 'half', 'one in five'])} of its people`, oldWorld: true });
  }
  const sail = year - 40 - Math.floor(rnd() * 140);
  const hasColonies = units.some((u) => u.gov === 'colony');
  if (hasColonies) events.push({ year: sail, name: 'the Age of Sail', text: 'the first ships crossed the ocean to the New World', oldWorld: true });
  const comet = year - 5 - Math.floor(rnd() * 300);
  events.push({ year: comet, name: 'the Great Comet', text: 'a great comet burned in the sky for forty nights', oldWorld: false });
  events.sort((a, b) => a.year - b.year);

  // ---- Founding and joining -------------------------------------------------------------------
  const fCache = new Map<number, number>();
  const founded = (id: number): number => {
    let f = fCache.get(id);
    if (f !== undefined) return f;
    const u = units[id];
    const r = R(`found#${id}`);
    const span = (lo: number, hi: number) => year - lo - Math.floor(r() * (hi - lo));
    if (u.gov === 'colony') f = sail + Math.floor(r() * Math.max(1, year - sail - 5));
    else if (u.gov === 'league') f = span(30, 260);
    else if (u.gov === 'republic' || u.gov === 'city-state') f = span(80, 480);
    else if (u.gov === 'tribal') f = span(100, 600);
    else if (u.level === 4) f = span(40, 320);
    else if (u.level === 3) f = span(120, 700);
    else if (u.level === 2) f = span(150, 650);
    else f = span(200, 750);
    // An empire is younger than the kingdom at its heart.
    if (u.level === 4) {
      const core = kids[id].map((k) => units[k]).find((v) => v.seat === u.seat);
      if (core) f = Math.max(f, founded(core.id) + 20);
    }
    fCache.set(id, f);
    return f;
  };
  const joined = (id: number) => {
    const u = units[id];
    if (u.parent < 0) return { year: founded(id), how: 'independence' };
    const liege = units[u.parent];
    const r = R(`join#${id}`);
    if (liege.seat === u.seat) return { year: founded(u.parent), how: 'held by the ruler in person' };
    if (u.gov === 'colony') return { year: founded(id), how: 'founded as a colony' };
    const lo = Math.max(founded(u.parent), founded(id));
    const y = lo + Math.floor(r() * Math.max(1, year - lo - 3) * (liege.level === 4 ? 1 : 0.6));
    const how = liege.level === 4 ? pick(r, ['conquest', 'conquest', 'submission', 'marriage', 'inheritance']) : pick(r, ['oath of fealty', 'grant by the crown', 'conquest', 'marriage', 'inheritance', 'oath of fealty']);
    return { year: Math.min(year - 2, y), how };
  };

  // ---- Houses ----------------------------------------------------------------------------------
  const houses: House[] = [];
  const hCache = new Map<string, House>();
  const makeHouse = (key: string, u: PolUnit, foundedY: number, cadetOf = -1): House => {
    let h = hCache.get(key);
    if (h) return h;
    const r = R(`house#${key}`);
    const cul = cultureId(u.culture);
    const cad = cadetOf >= 0 ? houses[cadetOf] : null;
    const nm = cad
      ? { name: `${cad.name.replace(/^the /, 'the ')} of ${u.seatName}`, short: cad.short }
      : houseName(cul, u.culture, r, bank, u.seatName);
    h = { id: houses.length, name: nm.name, short: nm.short, culture: u.culture, cadetOf, founded: foundedY, motto: cad && r() < 0.6 ? cad.motto : houseMotto(r), seatName: u.seatName };
    houses.push(h);
    hCache.set(key, h);
    return h;
  };
  type Dyn = { house: House; from: number; to: number; how: string }[];
  const dynasty = new Map<number, Dyn>();
  /** The houses that have ruled a unit, oldest first (the last rules now). */
  const pastHouses = (id: number): Dyn => {
    let d: Dyn | undefined = dynasty.get(id);
    if (d) return d;
    const u = units[id];
    const f = founded(id);
    const r = R(`dyn#${id}`);
    d = [];
    const liege = u.parent >= 0 ? units[u.parent] : null;
    const elected = u.gov === 'republic' || u.gov === 'city-state' || u.gov === 'theocracy' || u.gov === 'league';
    if (liege && liege.seat === u.seat) {
      d = pastHouses(u.parent);
    } else if (elected) {
      d = [{ house: makeHouse(`u${id}`, u, f), from: f, to: year, how: 'elected' }];
    } else {
      const span = year - f;
      const n = Math.max(1, Math.min(5, 1 + Math.floor((span / (140 + r() * 220)) * (u.level >= 3 ? 1 : 0.7))));
      const cuts = Array.from({ length: n - 1 }, () => f + 15 + Math.floor(r() * Math.max(1, span - 30))).sort((a, b) => a - b);
      const starts = [f, ...cuts];
      // A vassal's current house may be a cadet branch of its liege's.
      const cadet = liege && u.level <= 1 && liege.level === u.level + 1 && liege.gov !== 'league';
      for (let k = 0; k < n; k++) {
        const last = k === n - 1;
        const how = k === 0 ? 'founded the realm' : pick(r, ['usurpation', 'inheritance through marriage', 'election by the nobles', 'conquest', 'the old line died out', 'rebellion', 'inheritance through marriage']);
        let house: House;
        if (last && cadet) house = makeHouse(`c${id}`, u, starts[k], pastHouses(liege!.id).at(-1)!.house.id);
        else house = makeHouse(`u${id}#${k}`, u, starts[k]);
        d.push({ house, from: starts[k], to: last ? year : starts[k + 1], how });
      }
    }
    dynasty.set(id, d);
    return d;
  };
  const houseOf = (id: number) => pastHouses(id).at(-1)!.house;

  // ---- Faiths ------------------------------------------------------------------------------------
  const present = new Set<number>(units.filter((u) => u.level === 0).map((u) => u.culture));
  const faiths = buildFaiths(seed, year, bank, units, present);

  // ---- Neighbours ------------------------------------------------------------------------------
  const neighbours = new Map<number, Map<number, number>>();
  const bAdj = new Map<number, Set<number>>();
  const adjArr = p.stats.adj;
  for (let k = 0; k < adjArr.length; k += 2) {
    const a = adjArr[k], b = adjArr[k + 1];
    (bAdj.get(a) ?? bAdj.set(a, new Set()).get(a)!).add(b);
    (bAdj.get(b) ?? bAdj.set(b, new Set()).get(b)!).add(a);
    const ta = topOf[a], tb = topOf[b];
    if (ta === tb) continue;
    for (const [x, y] of [[ta, tb], [tb, ta]]) {
      const m = neighbours.get(x) ?? neighbours.set(x, new Map()).get(x)!;
      m.set(y, (m.get(y) ?? 0) + 1);
    }
  }
  // Coastal realms within reach across the sea are neighbours of a kind too (weaker ties).
  const coastal = tops.filter((t) => land(t).coastKm > 30 && !units[t].nw);
  for (let i = 0; i < coastal.length; i++) {
    for (let j = i + 1; j < coastal.length; j++) {
      const a = units[coastal[i]], b = units[coastal[j]];
      if (neighbours.get(a.id)?.has(b.id)) continue;
      if (distKm(a.lon, a.lat, b.lon, b.lat) > 900) continue;
      for (const [x, y] of [[a.id, b.id], [b.id, a.id]]) (neighbours.get(x) ?? neighbours.set(x, new Map()).get(x)!).set(y, 0);
    }
  }
  /** Baronies of `a` on its border with `b`. */
  const borderBaronies = (a: number, b: number) => baronies(a).filter((x) => [...(bAdj.get(x) ?? [])].some((y) => topOf[y] === b));

  // ---- Past wars -------------------------------------------------------------------------------
  const wars: War[] = [];
  const faithOf = (id: number) => faiths.ofCulture[units[id].culture];
  const familyOf = (id: number) => faiths.faiths[faithOf(id)]?.family;
  const lostTo = new Map<string, War[]>();
  const recentWars = (a: number, b: number) => (lostTo.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? []);
  for (const a of tops) {
    for (const [b, len] of neighbours.get(a) ?? []) {
      if (b <= a || len === 0) continue;
      const ua = units[a], ub = units[b];
      if (ua.nw !== ub.nw && ua.gov !== 'colony' && ub.gov !== 'colony') continue;
      const r = R(`pw#${a}#${b}`);
      const lo = Math.max(founded(a), founded(b));
      const span = year - lo - 3;
      if (span < 10) continue;
      const hot = (familyOf(a) !== familyOf(b) ? 1.5 : 1) * (ua.league >= 0 && ua.league === ub.league ? 0.3 : 1);
      const n = Math.min(5, Math.floor((span / 150) * (0.4 + r() * 0.9) * hot + r()));
      const starts = Array.from({ length: n }, () => lo + Math.floor(r() * span)).sort((x, y) => x - y);
      let busyTo = -Infinity;
      for (const s0 of starts) {
        const start = Math.max(s0, busyTo + 3);
        const q = r();
        const dur = q < 0.6 ? 1 + Math.floor(r() * 4) : q < 0.92 ? 5 + Math.floor(r() * 11) : 20 + Math.floor(r() * 60);
        const end = Math.min(year - 2, start + dur);
        if (end <= start) continue;
        busyTo = end;
        // The stronger side wins more often; a winner may have taken land now on its side of the border.
        const pa = ua.people / (ua.people + ub.people);
        const winner: 0 | 1 = r() < 0.3 + 0.4 * pa ? 0 : 1;
        const [w, l] = winner === 0 ? [a, b] : [b, a];
        const atk = r() < 0.5 ? [a] : [b];
        const def = atk[0] === a ? [b] : [a];
        const out = r();
        let prize: number | undefined;
        if (out < 0.5) {
          const bb = borderBaronies(w, l);
          if (bb.length) {
            const x = units[pick(r, bb)];
            const county = x.parent >= 0 && units[x.parent].level === 1 && topOf[x.parent] === w && x.parent !== w ? x.parent : x.id;
            // Never the winner's whole realm.
            if (county !== w) prize = county;
          }
        }
        const lname = units[l].seatName, wname = units[w].seatName;
        const nameT = r();
        const name = prize !== undefined && nameT < 0.4 ? `the War of ${units[prize].seatName}`
          : nameT < 0.55 && dur >= 20 ? `the ${dur >= 80 ? 'Hundred Years\'' : dur >= 25 ? 'Long' : 'Thirty Years\''} War`
          : nameT < 0.7 ? `the ${wname}-${lname} War`
          : nameT < 0.82 && familyOf(a) !== familyOf(b) ? `the ${pick(r, ['Holy', 'Great Holy', 'First Holy', 'Crusading'])} War`
          : `the ${pick(r, WAR_ADJ)} War`;
        const cause = familyOf(a) !== familyOf(b) && r() < 0.4 ? 'a holy war between faiths'
          : pick(r, ['a disputed border', 'a disputed succession', 'raids across the border', 'the murder of an envoy', 'trade rights', 'a broken marriage pact', 'an insult at court', 'rich border lands']);
        const peace = `the ${pick(r, ['Peace', 'Treaty', 'Peace', 'Truce'])} of ${pick(r, [wname, lname, wname])}`;
        const war: War = { id: wars.length, name, attackers: atk, defenders: def, start, end, cause, winner: out > 0.8 ? -1 : (atk[0] === w ? 0 : 1), prize: out > 0.8 ? undefined : prize, peace };
        wars.push(war);
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        (lostTo.get(k) ?? lostTo.set(k, []).get(k)!).push(war);
      }
    }
  }
  const winnerOf = (w: War) => (w.winner === 0 ? w.attackers[0] : w.winner === 1 ? w.defenders[0] : -1);
  const loserOf = (w: War) => (w.winner === 0 ? w.defenders[0] : w.winner === 1 ? w.attackers[0] : -1);

  // ---- Claims ------------------------------------------------------------------------------------
  const claims: Claim[] = [];
  for (const w of wars) {
    if (w.prize === undefined || w.end === undefined || year - w.end > 220) continue;
    const l = loserOf(w);
    if (l < 0 || topOf[w.prize] !== winnerOf(w)) continue;
    claims.push({ by: l, on: w.prize, kind: 'territory', since: w.end, text: `lost in ${w.name} (${w.end})` });
  }

  // ---- Relations -------------------------------------------------------------------------------
  const relations = new Map<number, Map<number, Relation>>();
  const setRel = (a: number, b: number, rel: Relation) => {
    (relations.get(a) ?? relations.set(a, new Map()).get(a)!).set(b, rel);
    (relations.get(b) ?? relations.set(b, new Map()).get(b)!).set(a, rel);
  };
  const relation = (a: number, b: number) => relations.get(a)?.get(b);
  const score = new Map<string, number>();
  const pairs: [number, number, number][] = [];
  for (const a of tops) {
    for (const [b, len] of neighbours.get(a) ?? []) {
      if (b <= a) continue;
      const ua = units[a], ub = units[b];
      const r = R(`rel#${a}#${b}`);
      if (ua.league >= 0 && ua.league === ub.league) {
        setRel(a, b, { kind: 'league', since: founded(ua.league), note: `fellow members of ${units[ua.league].name}` });
        continue;
      }
      let s = (r() + r() + r() - 1.5) * 0.9;
      const fa = faiths.sectOf(ua.culture, ua.lon, ua.lat), fb = faiths.sectOf(ub.culture, ub.lon, ub.lat);
      s += fa.faith.id === fb.faith.id ? (fa.sect.id === fb.sect.id ? 0.55 : -0.1) : -0.45;
      if (ua.culture === ub.culture) s += 0.25;
      const past = recentWars(a, b).filter((w) => year - (w.end ?? year) < 120);
      s -= 0.3 * past.length;
      if (claims.some((c) => (c.by === a && topOf[c.on] === b) || (c.by === b && topOf[c.on] === a))) s -= 0.7;
      if (ua.level === 4 || ub.level === 4) s -= 0.2;
      if (len === 0) s *= 0.6;
      score.set(`${a}|${b}`, s);
      pairs.push([a, b, s]);
    }
  }
  pairs.sort((x, y) => x[2] - y[2]);
  const maxWars = Math.max(2, Math.round(tops.length * 0.035));
  let nWars = 0;
  for (const [a, b, s] of pairs) {
    const r = R(`rk#${a}#${b}`);
    const last = recentWars(a, b).at(-1);
    let kind: RelKind;
    if (s < -1.05 && nWars < maxWars && (neighbours.get(a)?.get(b) ?? 0) > 0 && units[a].nw === units[b].nw) {
      kind = 'war';
      nWars++;
    } else if (s < -0.45) kind = 'rival';
    else if (last && year - (last.end ?? 0) < 8) kind = 'truce';
    else if (s > 0.85) kind = 'alliance';
    else if (s > 0.3) kind = 'friendly';
    else kind = 'neutral';
    const married = (kind === 'alliance' && r() < 0.65) || (kind === 'friendly' && r() < 0.25);
    const note = kind === 'alliance' ? (married ? 'marriage alliance' : pick(r, ['defensive pact', 'treaty of friendship', 'trade compact', 'old alliance']))
      : kind === 'friendly' ? pick(r, ['good relations', 'trading partners', 'old friends', 'friendly terms'])
      : kind === 'rival' ? pick(r, ['old enemies', 'border disputes', 'rival claims', 'trade rivals', 'bad blood since the last war'])
      : kind === 'truce' ? `truce after ${last!.name}` : kind === 'war' ? 'at war' : 'no strong ties';
    const since = kind === 'truce' ? last!.end! : Math.max(founded(a), founded(b), year - 5 - Math.floor(r() * 80));
    setRel(a, b, { kind, since, note, married });
  }
  // The enemy of my enemy: rivals of one realm draw together.
  for (const a of tops) {
    const foes = [...(relations.get(a) ?? [])].filter(([, v]) => v.kind === 'rival' || v.kind === 'war').map(([b]) => b);
    for (let i = 0; i < foes.length; i++) {
      for (let j = i + 1; j < foes.length; j++) {
        const x = foes[i], y = foes[j];
        if (relation(x, y) || R(`enc#${a}#${x}#${y}`)() > 0.4) continue;
        setRel(x, y, { kind: 'alliance', since: year - 2 - Math.floor(R(`encs#${x}#${y}`)() * 30), note: `alliance against ${units[a].name}` });
      }
    }
  }

  // ---- Wars of today ------------------------------------------------------------------------------
  for (const a of tops) {
    for (const [b, rel] of relations.get(a) ?? []) {
      if (b <= a || rel.kind !== 'war') continue;
      const r = R(`war#${a}#${b}`);
      const ua = units[a], ub = units[b];
      // The claimant attacks; otherwise the stronger.
      const claimA = claims.find((c) => c.by === a && topOf[c.on] === b), claimB = claims.find((c) => c.by === b && topOf[c.on] === a);
      const [atk, def] = claimA ? [a, b] : claimB ? [b, a] : ua.people >= ub.people ? [a, b] : [b, a];
      const claim = claimA ?? claimB;
      const ud = units[def];
      const cause = claim ? `to recover ${units[claim.on].name}, ${claim.text}`
        : familyOf(a) !== familyOf(b) ? `a holy war against the ${faiths.faiths[faithOf(def)]?.adherents.replace(/^the /, '') ?? 'unbelievers'}`
        : pick(r, [`to seize the border lands of ${ud.name}`, 'a disputed succession', 'revenge for border raids', `to break the trade of ${ud.seatName}`, 'an insult to the crown']);
      const start = year - Math.floor(r() * 6);
      const bb = borderBaronies(def, atk);
      const fallen = bb.length ? units[pick(r, bb)].seatName : ud.seatName;
      const tilt = r();
      const status = tilt < 0.35 ? `${units[atk].name} holds ${fallen}` : tilt < 0.6 ? `${fallen} is under siege` : tilt < 0.85 ? 'a stalemate along the border' : `${ud.name} has driven the invaders back`;
      const name = claim ? `the War of ${units[claim.on].seatName}` : `the ${units[atk].seatName}-${ud.seatName} War`;
      const war: War = { id: wars.length, name, attackers: [atk], defenders: [def], start, cause, status };
      // Allies answer the call.
      for (const [side, list] of [[atk, war.attackers], [def, war.defenders]] as const) {
        for (const [c, rr] of relations.get(side) ?? []) {
          if (rr.kind !== 'alliance' && rr.kind !== 'league') continue;
          if (c === atk || c === def || war.attackers.includes(c) || war.defenders.includes(c)) continue;
          if (relation(c, side === atk ? def : atk)?.kind === 'alliance') continue;
          if (R(`call#${war.id}#${c}`)() < 0.45) list.push(c);
        }
      }
      wars.push(war);
    }
  }

  // ---- Pretenders: houses that lost a throne, sheltered by a rival ------------------------------
  for (const t of tops) {
    const u = units[t];
    const hs = pastHouses(t);
    if (hs.length < 2) continue;
    const prev = hs[hs.length - 2];
    const cur = hs[hs.length - 1];
    if (year - cur.from > 160 || !/usurpation|conquest|rebellion/.test(cur.how)) continue;
    const r = R(`pret#${t}`);
    if (r() < 0.35) continue;
    // A rival court shelters them (or they live in exile on their own lands).
    const foes = [...(relations.get(t) ?? [])].filter(([, v]) => v.kind === 'rival' || v.kind === 'war').map(([b]) => b);
    const host = foes.length ? pick(r, foes) : -1;
    const female = r() < 0.2;
    const nm = personName(cultureId(u.culture), female, r, prev.house);
    const tail = SURNAME_FIRST_LORE.has(cultureId(u.culture)) ? '' : ` of ${prev.house.name}`;
    claims.push({
      by: host >= 0 ? host : t, on: t, kind: 'throne', since: cur.from,
      text: host >= 0 ? `sheltered at the court of ${units[host].name}` : 'in hiding within the realm',
      pretender: { name: `${nm.full}${tail}`, house: prev.house.id, age: 16 + Math.floor(r() * 50), female },
    });
  }

  // ---- Economy ------------------------------------------------------------------------------------
  const econ = new Map<number, Economy>();
  const raw = new Map<number, ReturnType<typeof production>>();
  const worldOut: Record<string, number> = {};
  for (const g of GOOD_IDS) worldOut[g] = 0;
  let worldPeople = 0;
  for (const t of tops) {
    const u = units[t];
    const pr = production(seed, { key: `${t}`, land: land(t), cul: cultureId(u.culture), people: u.people, townPop: u.pop, seatName: u.seatName });
    raw.set(t, pr);
    for (const g of GOOD_IDS) worldOut[g] += pr.out[g] ?? 0;
    worldPeople += u.people;
  }
  const perHead = (u: PolUnit) => u.people * (u.nw && u.gov !== 'colony' ? 0.15 : 1) * (1 + 4 * (u.pop / Math.max(1, u.people)));
  const wealthList = tops.map((t) => ({ t, w: perHead(units[t]) })).sort((a, b) => b.w - a.w);
  const medianW = wealthList[Math.floor(wealthList.length / 2)]?.w ?? 1;
  for (const t of tops) {
    const u = units[t];
    const pr = raw.get(t)!;
    const rich = perHead(u) / Math.max(1, u.people) > 1.15 || perHead(u) > medianW * 3;
    const tr = tradeOf(pr.out, u.people, worldOut, worldPeople, rich);
    const cul = cultureId(u.culture);
    const tax = u.gov === 'tribal' ? 0.05 : u.gov === 'republic' || u.gov === 'city-state' || u.gov === 'thalassocracy' ? 0.5 : 0.3;
    const revenue = Math.round(((u.people - u.pop) * 0.12 + u.pop * 1.4) * tax / 10) * 10;
    econ.set(t, { out: pr.out, exports: [...new Set([...tr.exports, ...pr.metals.filter((m) => !tr.exports.includes(m)).slice(0, 1)])].slice(0, 6), imports: tr.imports, special: pr.special, metals: pr.metals, revenue, coin: coinOf(cul), wealth: perHead(u) });
  }
  const rankOf = new Map<number, number>();
  wealthList.forEach((x, k) => rankOf.set(x.t, k + 1));
  /** Where a unit's wealth would rank among the independent realms (1 = richest). */
  const wealthRank = (id: number) => {
    if (rankOf.has(id)) return rankOf.get(id)!;
    const w = perHead(units[id]);
    let k = 0;
    while (k < wealthList.length && wealthList[k].w > w) k++;
    return k + 1;
  };
  // Trade partners: exports meeting imports, nearer and by sea counting more.
  const partners = new Map<number, { id: number; goods: string[] }[]>();
  for (const a of tops) {
    const ea = econ.get(a)!, ua = units[a];
    const cand: { id: number; goods: string[]; s: number }[] = [];
    for (const b of tops) {
      if (b === a) continue;
      const eb = econ.get(b)!, ub = units[b];
      if (ua.nw !== ub.nw && ua.gov !== 'colony' && ub.gov !== 'colony') continue;
      const goods = [...ea.imports.filter((g) => eb.exports.includes(g)), ...eb.imports.filter((g) => ea.exports.includes(g)).map((g) => `>${g}`)];
      if (!goods.length) continue;
      let d = distKm(ua.lon, ua.lat, ub.lon, ub.lat);
      if (land(a).coastKm > 30 && land(b).coastKm > 30) d *= 0.45;
      const rel = relation(a, b);
      if (rel?.kind === 'war') continue;
      const s = goods.length * Math.sqrt(ub.people) / (1 + d / 600) * (rel?.kind === 'alliance' || rel?.kind === 'league' ? 1.5 : rel?.kind === 'rival' ? 0.5 : 1);
      cand.push({ id: b, goods, s });
    }
    cand.sort((x, y) => y.s - x.s);
    partners.set(a, cand.slice(0, 4).map(({ id, goods }) => ({ id, goods })));
  }

  return {
    year, era, eraShort, bank, faiths, houses, topOf, tops, kids, baronies, townsOf, neighbours, relation, relations, wars, claims, events, sail,
    founded, joined, houseOf, pastHouses, land, econ, worldOut, worldPeople, wealthRank, partners, pairRng: R,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
