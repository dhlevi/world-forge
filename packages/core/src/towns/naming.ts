import { CULTURES } from '../names/cultures';
import { type NameBank, deityName, innName } from '../names/names';
import type { Rng } from '../gen/rng';
import { type Poly, type Pt, area, centroid, distToLine } from './geom';
import type { PlanFeature, PlanOut } from './plan';
import type { CityTheme } from '../lore/themes';

/**
 * Names and lettering for town plans: quarters (groups of wards), districts (market, castle,
 * docks, temple, garrison, cemetery, gardens), streets, and notable buildings (inns, taverns,
 * smithies, bakeries, the town hall, a library...). Building roles are written onto the
 * building features, where the interiors pick them up.
 */

export type WardKind = 'plaza' | 'temple' | 'citadel' | 'park' | 'harbour' | 'ward' | 'rich' | 'garrison' | 'graveyard'
  // Wards of the city themes: a merchants' counting-house quarter, a rookery, a ruined quarter, a
  // forge quarter, a mages' tower in its garden, and a pilgrims' square by a great temple.
  | 'counting' | 'slum' | 'ruins' | 'forge' | 'tower' | 'pilgrims' | 'prison' | '';

export interface WardInfo {
  poly: Poly;
  c: Pt;
  kind: WardKind;
  inside: boolean;
  /** Patch indices of neighbouring wards. */
  nbrs: number[];
  /** Near the sea, a lake or a river. */
  waterside: boolean;
  high: boolean;
}

export interface BuildingRef {
  f: PlanFeature;
  c: Pt;
  ward: number;
}

export interface CityNaming {
  names: NameBank;
  culture: number;
  key: string;
  town: boolean;
  population: number;
  wards: WardInfo[];
  inner: number[];
  /** Suburb wards outside the walls. */
  outer: number[];
  gates: Pt[];
  streets: { f: PlanFeature; pts: Pt[]; gate: number }[];
  roads: { f: PlanFeature; pts: Pt[]; gate: number }[];
  buildings: BuildingRef[];
  out: PlanOut;
  rnd: Rng;
  /** The town's name in English (for "the University of ..."). */
  place?: string;
  /** A university city (in the richest Old World realms). */
  university?: boolean;
  /** No guilds (tribal towns). */
  noGuilds?: boolean;
  /** The city's theme (see lore/themes.ts). */
  theme?: CityTheme;
  /** A holy town or city. */
  holy?: boolean;
}

/**
 * Guilds a city may house, with how common each is and where its hall stands: by the market, by a
 * gate, in a rich ward, by the harbour or by the garrison. The thieves keep no hall: their guild
 * hides in the sewers (dungeons/kinds.ts).
 */
const GUILDS: { id: string; label: string[]; w: number; at: 'plaza' | 'gate' | 'rich' | 'harbour' | 'garrison'; minPop: number }[] = [
  { id: 'adventurers', label: ['Adventurers\' Guild', 'Adventurers\' Hall', 'the Free Companies\' Hall'], w: 3, at: 'gate', minPop: 4000 },
  { id: 'warriors', label: ['Warriors\' Guild', 'Fighters\' Guild', 'Hall of Arms'], w: 2, at: 'garrison', minPop: 6000 },
  { id: 'cartographers', label: ['Cartographers\' Guild', 'Guild of Map-makers', 'Chart House'], w: 1.5, at: 'harbour', minPop: 8000 },
  { id: 'alchemists', label: ['Alchemists\' Guild', 'Guild of Alchemists', 'Hall of the Philosophers\' Stone'], w: 1.5, at: 'plaza', minPop: 8000 },
  { id: 'mages', label: ['Mages\' Guild', 'Arcane Collegium', 'Tower of the Magi'], w: 1.2, at: 'rich', minPop: 15000 },
  { id: 'masons', label: ['Masons\' Guild', 'Masons\' Lodge'], w: 1.5, at: 'plaza', minPop: 6000 },
  { id: 'smiths', label: ['Smiths\' Guild', 'Guild of Smiths'], w: 1.2, at: 'gate', minPop: 6000 },
  { id: 'weavers', label: ['Weavers\' Guild', 'Cloth Hall'], w: 1.2, at: 'plaza', minPop: 6000 },
  { id: 'physicians', label: ['Guild of Physicians', 'Barber-Surgeons\' Hall'], w: 1, at: 'plaza', minPop: 10000 },
];

const DIRS = ['East', 'North-east', 'North', 'North-west', 'West', 'South-west', 'South', 'South-east'];
export function compass(p: Pt): string {
  const a = Math.atan2(p[1], p[0]);
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
const short = (dir: string) => dir.replace('North-', 'North').replace('South-', 'South').replace('east', 'east').replace('west', 'west');

const CRAFTS = ['Thieves', 'Hang-Mans', 'Tanners', 'Weavers', 'Smiths', 'Coopers', 'Potters', 'Chandlers', 'Masons', 'Dyers', 'Carpenters', 'Fullers', 'Cordwainers', 'Bakers', 'Brewers', 'Glovers', 'Foreigners', 'Forgers', 'Alchemists', 'Mages', 'Traders', 'Merchants', 'Bonemans'];
const QUARTER_WORDS = ['District', 'Quarter', 'Ward', 'Row', 'End', 'Alleys'];

export function labelCity(n: CityNaming): void {
  const { names, culture, key, wards, inner, out, rnd } = n;
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const cul = CULTURES[culture] ?? CULTURES[0];
  const proper = (k: string) => names.proper(cul, names.rng(`${key}:${k}`));
  const used = new Set<string>();
  const unique = (make: () => string) => {
    for (let t = 0; t < 6; t++) {
      const s = make();
      if (!used.has(s)) {
        used.add(s);
        return s;
      }
    }
    return make();
  };
  const gateName = (g: number) => {
    const d = compass(n.gates[g]);
    return `${short(d)}gate`;
  };

  // ---- Districts ---------------------------------------------------------------------------
  const harbourNear = (i: number) => wards[i].nbrs.some((j) => wards[j].kind === 'harbour');
  wards.forEach((w, i) => {
    if (!w.inside && w.kind !== 'graveyard') return;
    let label = '';
    switch (w.kind) {
      case 'plaza':
        label = unique(() => (harbourNear(i) && rnd() < 0.5 ? 'Fish Market' : pick(['Market Square', 'the Market', `${proper('mkt')} Market`, 'Corn Market', 'High Market'])));
        break;
      case 'temple':
        label = unique(() => deityName(names, culture, `${key}:temple${i}`));
        break;
      case 'citadel':
        label = unique(() => pick(['the Citadel', `${proper('castle')} Castle`, `Castle ${proper('castle2')}`, 'the Keep']));
        break;
      case 'park':
        label = unique(() => pick([`${proper(`park${i}`)} Gardens`, 'the Green', `${proper(`park${i}`)} Park`, 'the Commons']));
        break;
      case 'harbour':
        label = unique(() => pick(['the Docks', `${proper(`wharf${i}`)} Wharf`, 'the Harbour', 'the Quays']));
        break;
      case 'garrison':
        label = unique(() => pick(['the Garrison', 'the Barracks', `${proper('fort')} Barracks`]));
        break;
      case 'graveyard':
        label = unique(() => pick([`${proper(`grave${i}`)} Cemetery`, 'the Graveyard', `${proper(`grave${i}`)} Burial Ground`, 'the Old Cemetery']));
        break;
      case 'pilgrims':
        label = unique(() => pick(['Pilgrims\' Square', 'the Pardon Market', 'Relic Market', 'the Pilgrims\' Court']));
        break;
      case 'tower':
        label = unique(() => pick(['the Arcanum', 'Tower Gardens', 'the Magisterium']));
        break;
      case 'ruins':
        label = unique(() => pick(['the Burnt Quarter', 'the Ruins', 'the Old Quarter', 'the Fallen Ward']));
        break;
    }
    if (label) out.point('dlabel', labelSpot(w), { name: label });
  });

  // ---- Quarters ----------------------------------------------------------------------------
  // Grow quarters from well-spread seeds over the ward adjacency graph.
  const q = Math.max(1, Math.min(7, Math.round(inner.length / (n.town ? 5 : 7))));
  if (inner.length >= 5) {
    const seeds: number[] = [];
    const dist = (a: number, b: number) => Math.hypot(wards[a].c[0] - wards[b].c[0], wards[a].c[1] - wards[b].c[1]);
    seeds.push(inner.reduce((a, b) => (Math.hypot(...wards[b].c) < Math.hypot(...wards[a].c) ? b : a)));
    while (seeds.length < q) {
      let best = -1, bd = -1;
      for (const i of inner) {
        const d = Math.min(...seeds.map((s) => dist(s, i)));
        if (d > bd) {
          bd = d;
          best = i;
        }
      }
      if (best < 0) break;
      seeds.push(best);
    }
    const owner = new Map<number, number>();
    const queue: number[] = [];
    seeds.forEach((s, k) => {
      owner.set(s, k);
      queue.push(s);
    });
    const innerSet = new Set(inner);
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h];
      for (const j of wards[i].nbrs) {
        if (!innerSet.has(j) || owner.has(j)) continue;
        owner.set(j, owner.get(i)!);
        queue.push(j);
      }
    }
    const groups: number[][] = seeds.map(() => []);
    for (const [i, k] of owner) groups[k].push(i);
    groups.forEach((g, k) => {
      if (!g.length) return;
      const has = (kind: WardKind) => g.some((i) => wards[i].kind === kind);
      const share = (kind: WardKind) => g.filter((i) => wards[i].kind === kind).length / g.length;
      const gateIdx = n.gates.findIndex((gp) => g.some((i) => Math.hypot(wards[i].c[0] - gp[0], wards[i].c[1] - gp[1]) < 0.9 * Math.sqrt(area(wards[i].poly))));
      const name = unique(() => {
        if (k === 0 && rnd() < 0.6) return 'Old Town';
        if (has('citadel')) return pick(['Castle Quarter', 'Castle Ward', 'the Castlegate']);
        if (has('harbour')) return pick(['Harbour Quarter', 'Waterside', 'the Docklands']);
        if (has('temple')) return pick(['Temple Quarter', 'Cathedral Close', 'the Holy Quarter']);
        if (has('plaza')) return pick(['Market Quarter', 'Old Town', 'the Chepe']);
        if (has('garrison')) return pick(['the Garrison Ward', 'Soldiers\' Quarter']);
        if (has('counting')) return pick(['Counting-house Quarter', 'the Exchange Quarter', 'Lombard Quarter', 'Bankers\' Row']);
        if (has('slum')) return pick(['the Rookery', 'Lower Town', 'the Warrens', 'the Shambles', 'the Sinks']);
        if (has('forge')) return pick(['the Forges', 'Smiths\' Quarter', 'Foundry Row', 'the Anvils']);
        if (share('rich') >= 0.3) return g.some((i) => wards[i].high) ? 'the Heights' : pick(['Noble Quarter', 'Gold Ward', 'the Lords\' Quarter']);
        if (gateIdx >= 0 && rnd() < 0.6) return gateName(gateIdx);
        if (g.some((i) => wards[i].waterside) && rnd() < 0.5) return pick(['Tanners\' Quarter', 'Dyers\' Row', 'Riverside', 'Fullers\' Ward']);
        return rnd() < 0.55 ? `${pick(CRAFTS)}' ${pick(QUARTER_WORDS)}` : `${proper(`q${k}`)} ${pick(QUARTER_WORDS)}`;
      });
      // Letter it on the most central ward of the quarter.
      let cx = 0, cy = 0;
      for (const i of g) {
        cx += wards[i].c[0] / g.length;
        cy += wards[i].c[1] / g.length;
      }
      const at = g.reduce((a, b) => (Math.hypot(wards[b].c[0] - cx, wards[b].c[1] - cy) < Math.hypot(wards[a].c[0] - cx, wards[a].c[1] - cy) ? b : a));
      // Keep clear of the district label on the same ward.
      const w = wards[at];
      const spot: Pt = w.kind === 'ward' || w.kind === 'rich' ? labelSpot(w) : [w.c[0] * 0.85 + cx * 0.15, w.c[1] * 0.85 + cy * 0.15 + 25];
      out.point('qlabel', spot, { name });
    });
  }
  // Suburbs: one name per gate road.
  const subByGate = new Map<number, number[]>();
  for (const i of n.outer) {
    let g = -1, bd = Infinity;
    n.gates.forEach((gp, k) => {
      const d = Math.hypot(wards[i].c[0] - gp[0], wards[i].c[1] - gp[1]);
      if (d < bd) {
        bd = d;
        g = k;
      }
    });
    if (g >= 0) subByGate.set(g, [...(subByGate.get(g) ?? []), i]);
  }
  for (const [g, list] of subByGate) {
    if (list.length < 2) continue;
    const waterside = list.filter((i) => wards[i].waterside).length > list.length / 2;
    const name = unique(() => waterside ? pick(['Fishertown', 'Riverside', 'the Strand', 'Waterside']) : pick([`${short(compass(n.gates[g]))} End`, `${proper(`sub${g}`)} End`, `${proper(`sub${g}`)}`, `Without ${gateName(g)}`]));
    const mid = list.reduce((a, b) => (Math.hypot(...wards[b].c) < Math.hypot(...wards[a].c) ? b : a));
    out.point('qlabel', labelSpot(wards[mid]), { name });
  }

  // ---- Streets -----------------------------------------------------------------------------
  const plazaName = 'Market';
  n.streets.forEach((st, k) => {
    // gate -1: the street between a twin town's two markets.
    if (st.gate < 0) {
      st.f.properties.name = unique(() => (rnd() < 0.5 ? 'Bridge Street' : `${proper(`street${k}`)} Way`));
      return;
    }
    const g = gateName(st.gate);
    st.f.properties.name = unique(() => (k === 0 && rnd() < 0.5 ? 'High Street' : rnd() < 0.6 ? `${g} Street` : `${proper(`street${k}`)} Street`));
    void plazaName;
  });
  n.roads.forEach((rd, k) => {
    rd.f.properties.name = unique(() => `${short(compass(n.gates[rd.gate]))} Road`);
    void k;
  });

  // ---- Notable buildings -------------------------------------------------------------------
  const P = n.population;
  const taken = new Set<BuildingRef>();
  // Halls want a building of some size: the larger half of the town's.
  const sizeOf = (b: BuildingRef) => {
    const g = b.f.geometry;
    return g.type === 'Polygon' ? Math.abs(area(g.coordinates[0] as Pt[])) : 0;
  };
  const sizes = n.buildings.map(sizeOf).sort((a, b) => a - b);
  const bigMin = sizes[Math.floor(sizes.length * 0.55)] ?? 0;
  const big = (b: BuildingRef) => sizeOf(b) >= bigMin;
  const nearestTo = (pts: Pt[], filter: (b: BuildingRef) => boolean, count: number, maxD = Infinity) => {
    const cands = n.buildings.filter((b) => !taken.has(b) && filter(b))
      .map((b) => ({ b, d: Math.min(...pts.map((p) => Math.hypot(b.c[0] - p[0], b.c[1] - p[1]))) + rnd() * 25 }))
      .filter((x) => x.d < maxD)
      .sort((a, b) => a.d - b.d);
    const outB: BuildingRef[] = [];
    for (const x of cands) {
      if (outB.length >= count) break;
      // Spread them out a little.
      if (outB.some((o) => Math.hypot(o.c[0] - x.b.c[0], o.c[1] - x.b.c[1]) < 40)) continue;
      outB.push(x.b);
    }
    return outB;
  };
  const assign = (b: BuildingRef, role: string, label: string) => {
    taken.add(b);
    b.f.properties.role = role;
    b.f.properties.label = label;
    out.point('blabel', b.c, { name: label, role });
  };
  const ordinary = (b: BuildingRef) => {
    const k = wards[b.ward].kind;
    return k === 'ward' || k === 'rich' || k === 'counting' || k === 'slum' || k === 'forge' || !wards[b.ward].inside;
  };
  const inKind = (k: WardKind) => (b: BuildingRef) => wards[b.ward].kind === k;
  const centresOf = (k: WardKind) => wards.map((w, i) => (w.kind === k ? w.c : null)).filter((c): c is Pt => !!c);
  const onStreet = (d: number) => (b: BuildingRef) => ordinary(b) && n.streets.some((s) => distToLine(s.pts, b.c[0], b.c[1]) < d);
  const plaza = wards.findIndex((w) => w.kind === 'plaza');
  const plazaC = plaza >= 0 ? wards[plaza].c : [0, 0] as Pt;
  const temple = wards.findIndex((w) => w.kind === 'temple');
  const harbour = wards.map((w, i) => (w.kind === 'harbour' ? i : -1)).filter((i) => i >= 0);

  // Inns at the gates, taverns along the main streets.
  for (const b of nearestTo(n.gates, onStreet(30), Math.max(1, Math.round(P / 3000) + 1))) assign(b, 'inn', innName(names.rng(`${key}:inn${b.f.properties.bid}`)));
  for (const b of nearestTo([plazaC], onStreet(40), Math.round(P / 2500) + (n.town ? 0 : 1))) assign(b, 'tavern', innName(names.rng(`${key}:tav${b.f.properties.bid}`)));
  // ---- Themes ----
  const theme = n.theme;
  if (theme === 'merchant') {
    // Counting houses in their quarter, and the halls of the great merchant companies.
    const cq = centresOf('counting');
    for (const b of nearestTo(cq.length ? cq : [plazaC], (x) => ordinary(x) && big(x), n.town ? 1 : 2 + Math.floor(rnd() * 3), 300)) {
      assign(b, 'countinghouse', unique(() => pick([`${proper(`bank${b.f.properties.bid}`)} Bank`, `the ${proper(`bank${b.f.properties.bid}`)} Counting House`, `House of ${proper(`bank${b.f.properties.bid}`)}`])));
    }
    for (const b of nearestTo([plazaC], (x) => ordinary(x) && big(x), n.town ? 1 : 2, 260)) {
      assign(b, 'guildhall', unique(() => pick(['Drapers\' Hall', 'Vintners\' Hall', 'Grocers\' Hall', 'Mercers\' Hall', 'Spicers\' Hall', 'the Staple Hall', 'Furriers\' Hall'])));
    }
  }
  if (theme === 'pilgrim' || n.holy) {
    // Inns for the pilgrims round the temple.
    const t = wards.findIndex((w) => w.kind === 'temple');
    const at = t >= 0 ? [wards[t].c] : [plazaC];
    for (const b of nearestTo(at, onStreet(60), theme === 'pilgrim' ? 3 + Math.floor(rnd() * 3) : 1, 400)) {
      assign(b, 'inn', unique(() => pick(['the Pilgrims\' Rest', 'the Palmer\'s Staff', 'the Scallop Shell', 'the Pilgrim\'s Lantern', 'the Holy Lamb', 'the Seven Stars', 'the Mitre', 'the Pardoner\'s Inn'])));
    }
  }
  if (theme === 'thieves') {
    // A rookery's dives and fences.
    const sl = centresOf('slum');
    const at = sl.length ? sl : [plazaC];
    for (const b of nearestTo(at, ordinary, 2 + Math.floor(rnd() * 2), 400)) assign(b, 'tavern', innName(names.rng(`${key}:dive${b.f.properties.bid}`)));
    for (const b of nearestTo(at, ordinary, 2, 400)) assign(b, 'pawnshop', 'Pawnshop');
  }
  if (theme === 'forge') {
    // The forge quarter: smithies and foundries along every street.
    const fq = n.buildings.filter((b) => !taken.has(b) && inKind('forge')(b));
    // Only a few are lettered on the plan; the rest show their trade inside.
    fq.forEach((b, k) => {
      if (k % 3 === 2) return;
      const [role, label] = k % 3 === 0 ? ['foundry', 'Foundry'] : ['smithy', pick(['Smithy', 'Armourer', 'Bladesmith', 'Locksmith'])];
      if (k % 3 === 0 && k < 9) assign(b, role, label);
      else {
        taken.add(b);
        b.f.properties.role = role;
        b.f.properties.label = label;
      }
    });
  }

  // Civic buildings by the market.
  if (plaza >= 0) {
    const hall = nearestTo([plazaC], ordinary, 1, 140);
    if (hall[0]) assign(hall[0], 'townhall', n.town ? 'Moot Hall' : 'Town Hall');
    if (!n.town && !n.noGuilds) {
      const guild = nearestTo([plazaC], (b) => ordinary(b) && big(b), 1, 220);
      if (guild[0]) assign(guild[0], 'guildhall', pick(['Merchants\' Guildhall', 'Merchants\' Hall', 'the Exchange']));
    }
  }
  // A university: its great hall near the temple or market, and colleges around it.
  if ((n.university || theme === 'mages') && !n.town) {
    const at = temple >= 0 ? wards[temple].c : plazaC;
    const main = nearestTo([at], (b) => ordinary(b) && big(b), 1, 400);
    if (main[0]) {
      assign(main[0], 'university', `the University${n.place ? ` of ${n.place}` : ''}`);
      const nCol = 2 + Math.floor(rnd() * 3);
      for (const b of nearestTo([main[0].c], (x) => ordinary(x) && big(x), nCol, 260)) assign(b, 'college', unique(() => `${pick(['St', 'King\'s', 'Queen\'s', 'Old', 'New', 'High', proper(`col${b.f.properties.bid}`)])} ${pick(['College', 'Hall', 'House'])}`.replace(/^St /, `St ${proper(`saint${b.f.properties.bid}`)}'s `)));
    }
  }
  // Guilds: more of them the larger the city (a town has at most one).
  if (!n.noGuilds && P >= 4000) {
    const count = (n.town ? (rnd() < 0.5 ? 1 : 0) : P < 10000 ? 2 : P < 20000 ? 3 + Math.floor(rnd() * 2) : 4 + Math.floor(rnd() * 3)) + (theme === 'mages' ? 1 : 0);
    const pool = GUILDS.filter((g) => P >= g.minPop || (g.id === 'mages' && (n.university || theme === 'mages')));
    const chosen: (typeof GUILDS)[number][] = [];
    const must = theme === 'mages' ? ['mages', 'alchemists'] : theme === 'forge' ? ['smiths'] : theme === 'fortress' ? ['warriors'] : [];
    for (const id of must) {
      const g = GUILDS.find((x) => x.id === id)!;
      if (pool.includes(g)) pool.splice(pool.indexOf(g), 1);
      chosen.push(g);
    }
    for (let t = 0; t < 30 && chosen.length < count && pool.length; t++) {
      const tot = pool.reduce((a, g) => a + g.w, 0);
      let x = rnd() * tot;
      const g = pool.find((q) => (x -= q.w) < 0) ?? pool[0];
      pool.splice(pool.indexOf(g), 1);
      chosen.push(g);
    }
    const rich = wards.map((w, i) => (w.kind === 'rich' ? i : -1)).filter((i) => i >= 0);
    const garrisonW = wards.findIndex((w) => w.kind === 'garrison' || w.kind === 'citadel');
    for (const g of chosen) {
      const anchor: Pt[] = g.at === 'gate' && n.gates.length ? n.gates
        : g.at === 'rich' && rich.length ? rich.map((i) => wards[i].c)
          : g.at === 'harbour' && harbour.length ? harbour.map((i) => wards[i].c)
            : g.at === 'garrison' && garrisonW >= 0 ? [wards[garrisonW].c]
              : [plazaC];
      const b = nearestTo(anchor, (x) => ordinary(x) && big(x), 1, 500)[0];
      if (b) assign(b, `guild:${g.id}`, pick(g.label));
    }
  }
  if (!n.town && (temple >= 0 || plaza >= 0)) {
    const lib = nearestTo([temple >= 0 ? wards[temple].c : plazaC], ordinary, 1, 250);
    if (lib[0]) assign(lib[0], 'library', pick(['Library', 'Archive', 'Scriptorium']));
  }
  // Trades.
  const trades: [string, string, number, (b: BuildingRef) => boolean][] = [
    ['smithy', 'Smithy', Math.round(P / 4000) + 1, onStreet(60)],
    ['bakery', 'Bakery', Math.round(P / 3000) + 1, ordinary],
    ['apothecary', 'Apothecary', Math.round(P / 7000) + 1, ordinary],
    ['pawnshop', 'Pawnshop', n.town ? 0 : Math.round(P / 9000) + 1, ordinary],
    ['tailor', 'Tailor', Math.round(P / 8000), ordinary],
    ['butcher', 'Butcher', Math.round(P / 6000), ordinary],
    ['stables', 'Stables', Math.min(2, n.gates.length), onStreet(80)],
    ['bathhouse', 'Bathhouse', n.town ? 0 : 1, ordinary],
  ];
  for (const [role, label, count, filter] of trades) {
    if (count <= 0) continue;
    const anchor = role === 'stables' || role === 'smithy' ? n.gates : [plazaC, ...n.gates];
    const list = nearestTo(anchor, filter, count, role === 'stables' ? 220 : Infinity);
    for (const b of list) assign(b, role, label);
  }
  if (harbour.length) {
    for (const b of nearestTo(harbour.map((i) => wards[i].c), (b) => harbour.includes(b.ward), 2)) assign(b, 'chandlery', rnd() < 0.5 ? 'Chandlery' : 'Fishmonger');
  }
  // Barracks fill the garrison ward.
  const garrison = wards.findIndex((w) => w.kind === 'garrison');
  if (garrison >= 0) {
    for (const b of n.buildings) if (b.ward === garrison && !taken.has(b)) b.f.properties.role = 'barracks';
  }
}

/** A spot inside a ward for its label: the centroid pulled toward the ward's widest part. */
export function labelSpot(w: { poly: Poly; c: Pt }): Pt {
  return w.poly.length >= 3 ? centroid(w.poly) : w.c;
}
