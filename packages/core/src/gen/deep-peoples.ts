import { distKm } from './grid';
import { hashString, mulberry32, type Rng } from './rng';
import type { Settlement } from './settlements';
import type { DeepKind, DeepNode, Underworld } from './underworld';
import type { NameBank, Named } from '../names/names';
import { CULTURES, TEMPLATES } from '../names/cultures';
import { type CultureSet, setWorldCultures } from '../names/world-cultures';
import { BUNDLE } from '../names/bundles';
import { type Arms, newArms } from '../heraldry/arms';

/**
 * The peoples and realms of the Underworld (fantasy worlds; option three of the deep): shadow elves,
 * deep gnomes, fungus folk and grey dwarves, each grown from a hearth cavern through the tunnels
 * to the caverns that suit them, with a city in every cavern they hold, gathered into realms
 * (the shadow elves' city-states, the gnomes' under-kingdoms, the fungus folk's circles, the grey
 * dwarves' iron kingdoms) with rulers, arms, relations and a short chronicle. The lowest caverns
 * (abysses and the burning deep) hold nameless horrors instead. Their cultures are added after the
 * surface's, so nothing above changes.
 */

export type DeepTemplate = 'shadowelf' | 'deepgnome' | 'fungusfolk' | 'greydwarf';
export type Stance = 'war' | 'feud' | 'truce' | 'trade' | 'alliance' | 'raids' | 'peace';

export interface DeepCity {
  name: string;
  en: string;
  pop: number;
  /** What the people call such a place. */
  kind: string;
  capital: boolean;
}

export interface DeepRealm {
  id: number;
  name: string;
  en: string;
  culture: number;
  template: DeepTemplate;
  /** How it is ruled ("a city-state ruled by the Matron Mother of House X"). */
  gov: string;
  title: string;
  ruler: string;
  house?: string;
  capital: number;
  nodes: number[];
  arms: Arms;
  relations: { realm: number; stance: Stance }[];
  delves: { sid: string; name: string; stance: Stance }[];
  chronicle: { ago: number; text: string }[];
  /** Index into the layer's realm palette. */
  colour: number;
}

export interface DeepPeoples {
  /** Culture indices of the peoples of the deep. */
  peoples: number[];
  realms: DeepRealm[];
}

const TEMPLATES_DEEP: DeepTemplate[] = ['shadowelf', 'deepgnome', 'fungusfolk', 'greydwarf'];

/** How readily each people settles each kind of cavern (a cost multiplier; Infinity never). */
const SUIT: Record<DeepTemplate, Partial<Record<DeepKind, number>>> = {
  shadowelf: { cavern: 1, lake: 0.8, ruins: 0.7, sea: 1.2, chasm: 1.6, fungal: 2, hall: 2.5 },
  deepgnome: { cavern: 0.9, chasm: 0.8, lake: 1, hall: 1.4, fungal: 1.6 },
  fungusfolk: { fungal: 0.4, lake: 2.2, cavern: 2.6 },
  greydwarf: { hall: 0.5, cavern: 1, chasm: 1.4, rift: 1.6, lake: 2 },
};
const CITY_KIND: Record<DeepTemplate, [string, string]> = {
  shadowelf: ['city', 'city'], deepgnome: ['warren-city', 'warren'], fungusfolk: ['great ring', 'ring'], greydwarf: ['iron hold', 'hold'],
};
const STANCE: Record<string, [Stance, number][]> = {
  'shadowelf|shadowelf': [['feud', 3], ['war', 2], ['truce', 1], ['alliance', 0.5]],
  'shadowelf|deepgnome': [['raids', 3], ['war', 2]],
  'shadowelf|fungusfolk': [['raids', 2], ['truce', 2]],
  'shadowelf|greydwarf': [['trade', 2], ['war', 2], ['truce', 1]],
  'deepgnome|deepgnome': [['alliance', 3], ['trade', 2]],
  'deepgnome|fungusfolk': [['trade', 2], ['alliance', 2], ['peace', 1]],
  'deepgnome|greydwarf': [['war', 3], ['raids', 1]],
  'fungusfolk|fungusfolk': [['peace', 3], ['alliance', 1]],
  'fungusfolk|greydwarf': [['war', 2], ['truce', 1]],
  'greydwarf|greydwarf': [['feud', 2], ['alliance', 1], ['war', 1]],
};
const DELVE_STANCE: Record<DeepTemplate, [Stance, number][]> = {
  shadowelf: [['raids', 3], ['war', 1], ['truce', 1]],
  deepgnome: [['trade', 4], ['alliance', 1]],
  fungusfolk: [['peace', 3], ['trade', 1]],
  greydwarf: [['war', 4], ['feud', 1]],
};

const pick = <T,>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length) % a.length];
const weighted = <T,>(r: Rng, opts: [T, number][]): T => {
  let t = r() * opts.reduce((a, [, w]) => a + w, 0);
  for (const [o, w] of opts) if ((t -= w) < 0) return o;
  return opts[0][0];
};

/** Names a horror of the lowest deep (they have no names of their own; these are what others call them). */
const HORRORS = [
  'the Hungering Dark', 'the Many-Mouthed', 'the Eye Below', 'the Pale Swarm', 'That Which Waits', 'the Drowned King', 'the Crawling Silence',
  'the Thousand Hands', 'the Sleeper in the Deep', 'the Hollow Choir', 'the Mother of Maggots', 'the Unblinking', 'the Shapeless', 'the Last Hunger',
];

export function deepPeoples(u: Underworld, cultures: CultureSet, settlements: Settlement[], bank: NameBank, seed: string): DeepPeoples {
  const r = mulberry32(hashString(`${seed}#deep-peoples`));
  const nodes = u.nodes;
  // Halls under living delves belong to the dwarves above.
  const delveHall = new Map<number, Settlement>();
  for (const e of u.entrances) {
    if (e.kind !== 'delve' || !e.sid) continue;
    const s = settlements.find((q) => q.id === e.sid);
    if (s && !delveHall.has(e.node)) delveHall.set(e.node, s);
  }
  // The graph of the deep: tunnels and shafts between caverns.
  const adj: { to: number; km: number }[][] = nodes.map(() => []);
  for (const t of u.tunnels) {
    if (t.b < 0) continue;
    adj[t.a].push({ to: t.b, km: t.km });
    adj[t.b].push({ to: t.a, km: t.km });
  }
  const area = (n: DeepNode) => Math.PI * n.r * n.r;
  const wild = (n: DeepNode) => n.kind === 'abyss' || (n.tier === 1 && n.kind === 'rift');

  // ---- Hearths: one to three peoples of each kind, by where they belong ----------------------------
  const scale = Math.max(1, Math.min(3, Math.round(nodes.length / 60)));
  const hearths: { t: DeepTemplate; node: number }[] = [];
  const taken = (n: number) => hearths.some((h) => h.node === n || distKm(nodes[h.node].lon, nodes[h.node].lat, nodes[n].lon, nodes[n].lat) < 1200);
  const choose = (t: DeepTemplate, want: number, score: (n: DeepNode) => number) => {
    const c = nodes.filter((n) => !wild(n) && !delveHall.has(n.id) && score(n) > 0).map((n) => ({ n, s: score(n) + 0.4 * r() })).sort((a, b) => b.s - a.s);
    for (const { n } of c) {
      if (hearths.filter((h) => h.t === t).length >= want) break;
      if (!taken(n.id)) hearths.push({ t, node: n.id });
    }
  };
  const nearDelve = (n: DeepNode) => [...delveHall.keys()].some((k) => distKm(nodes[k].lon, nodes[k].lat, n.lon, n.lat) < 900);
  choose('greydwarf', scale, (n) => (n.kind === 'hall' ? 2 : n.kind === 'cavern' ? 0.6 : 0) + (nearDelve(n) ? 0.6 : 0));
  choose('fungusfolk', scale, (n) => (n.kind === 'fungal' ? 2 : 0));
  choose('deepgnome', scale, (n) => ((n.kind === 'cavern' || n.kind === 'chasm' || n.kind === 'lake') && n.tier === 0 ? 1 : 0) + (nearDelve(n) ? 1 : 0));
  choose('shadowelf', scale + 1, (n) => (n.kind === 'cavern' || n.kind === 'lake' ? 1.4 : n.kind === 'ruins' ? 1.8 : n.kind === 'sea' ? 0.8 : 0) + n.r / 100);

  // ---- The peoples' cultures, added after the surface's ------------------------------------------------
  const base = cultures.list.length;
  hearths.forEach((h) => {
    const n = nodes[h.node];
    cultures.list.push({
      template: TEMPLATES.findIndex((t) => t.id === h.t), lon: n.lon, lat: n.lat, nw: false, deep: true,
      env: { areaKm2: area(n) * 6, coast: 0, high: 1, forest: n.kind === 'fungal' ? 1 : 0, grass: 0, desert: 0, cold: 0.2, hot: n.kind === 'rift' ? 1 : 0, wet: n.kind === 'lake' || n.kind === 'sea' ? 1 : 0.3, jungle: 0, river: 0 },
    });
  });
  setWorldCultures(cultures);

  // ---- Spread: each people through the tunnels to the caverns that suit it --------------------------
  const owner = new Int32Array(nodes.length).fill(-1);
  const cost = new Float64Array(nodes.length).fill(Infinity);
  const queue: { n: number; d: number; h: number }[] = hearths.map((h, k) => ({ n: h.node, d: 0, h: k }));
  for (const q of queue) cost[q.n] = 0;
  while (queue.length) {
    queue.sort((a, b) => b.d - a.d);
    const { n, d, h } = queue.pop()!;
    if (d > cost[n] || owner[n] >= 0) continue;
    owner[n] = h;
    for (const e of adj[n]) {
      const m = nodes[e.to];
      const suit = SUIT[hearths[h].t][m.kind];
      if (!suit || wild(m) || delveHall.has(m.id) || owner[e.to] >= 0) continue;
      const nd = d + e.km * suit;
      if (nd > 3600 || nd >= cost[e.to]) continue;
      cost[e.to] = nd;
      queue.push({ n: e.to, d: nd, h });
    }
  }

  // ---- Cities ------------------------------------------------------------------------------------------
  const cityOf = new Map<number, DeepCity>();
  const used = new Set<string>();
  nodes.forEach((n, id) => {
    const h = owner[id];
    if (h < 0) return;
    const ci = base + h, t = hearths[h].t, capital = hearths[h].node === id;
    const cr = mulberry32(hashString(`${seed}#deepcity#${id}`));
    const cul = CULTURES[ci];
    let nm: Named = { name: '', en: '' };
    for (let k = 0; k < 6 && (!nm.name || used.has(nm.name)); k++) {
      if (cr() < 0.55) nm = bank.opaque(cul, cr, true);
      else nm = bank.named(ci, `${pick(cr, cul.roots ?? ['Deep'])}${pick(cr, cul.suffixes ?? ['hold'])}`);
    }
    used.add(nm.name);
    const pop = Math.round((capital ? 2.5 : 1) * (t === 'fungusfolk' ? 900 : t === 'deepgnome' ? 2500 : 6000) * (0.5 + n.r / 60) * (0.6 + 0.8 * cr()) / 10) * 10;
    cityOf.set(id, { name: nm.name, en: nm.en, pop, kind: CITY_KIND[t][capital ? 0 : 1], capital });
  });

  // ---- Realms ------------------------------------------------------------------------------------------
  const realms: DeepRealm[] = [];
  const realmOf = new Int32Array(nodes.length).fill(-1);
  hearths.forEach((h, k) => {
    const mine = nodes.filter((n) => owner[n.id] === k).map((n) => n.id);
    // Shadow elves: every city a realm of its own. Others: the connected groups, split when large.
    const groups: number[][] = [];
    if (h.t === 'shadowelf') for (const id of mine) groups.push([id]);
    else {
      const seen = new Set<number>();
      for (const s of [h.node, ...mine]) {
        if (seen.has(s)) continue;
        const g: number[] = [];
        const st = [s];
        seen.add(s);
        while (st.length) {
          const x = st.pop()!;
          g.push(x);
          for (const e of adj[x]) if (owner[e.to] === k && !seen.has(e.to) && g.length < (h.t === 'greydwarf' ? 8 : 5)) {
            seen.add(e.to);
            st.push(e.to);
          }
        }
        groups.push(g);
      }
    }
    for (const g of groups) {
      const ci = base + k, t = h.t, b = BUNDLE.get(t)!;
      const capital = g.includes(h.node) ? h.node : g.reduce((a, x) => (nodes[x].r > nodes[a].r ? x : a), g[0]);
      const rr = mulberry32(hashString(`${seed}#deeprealm#${capital}`));
      const level = g.length >= 6 ? 3 : g.length >= 3 ? 2 : 1;
      const title = (b.rulers ?? ['Lord', 'Lord', 'Lord', 'King', 'Emperor'])[t === 'shadowelf' ? 2 : level + 1];
      // The shadow elves are always ruled by a Matron.
      const female = t === 'shadowelf' || rr() < (b.femaleP ?? 0.2);
      const cul = CULTURES[ci];
      const given = cul.language ? cul.language.givenName(rr, female) : bank.proper(cul, rr);
      const root = bank.opaque(cul, rr);
      const house = typeof b.house === 'function' ? b.house(root.name, rr, { seatName: cityOf.get(capital)!.name, family: () => root.name }).name : undefined;
      const cap = cityOf.get(capital)!;
      const pattern = pick(rr, cul.realm ?? ['{N}']);
      // House realms take the house's name; the rest the capital's.
      const byHouse = t === 'shadowelf' && /House/.test(pattern);
      const named = bank.named(ci, pattern.replace('{N}', '{0}'), [byHouse ? root : { name: cap.name, en: cap.en }]);
      const gov = t === 'shadowelf' ? `a city ruled by the ${b.cityRuler ?? 'Matron Mother'} of ${house ?? 'the first house'}, under the priestesses of the Veiled Mother`
        : t === 'deepgnome' ? (rr() < 0.5 ? `warrens ruled by a ${title} chosen by the elders` : `free warrens under a Speaker and a council of elders`)
          : t === 'fungusfolk' ? `a circle of colonies led by its ${title}, who dreams for all`
            : `an iron ${level >= 2 ? 'kingdom' : 'hold'} ruled by its ${title} and the clan chiefs, worked by slaves`;
      const id = realms.length;
      for (const x of g) realmOf[x] = id;
      realms.push({
        id, name: named.name, en: named.en, culture: ci, template: t, gov, title, ruler: `${given}${house && t !== 'fungusfolk' ? ` of ${house}` : ''}`, ...(house ? { house } : {}),
        capital, nodes: g, arms: newArms(rr, t, level >= 3 ? { crowned: true } : {}), relations: [], delves: [], chronicle: [], colour: 0,
      });
    }
  });
  // Neighbours' relations, and the delves' (their halls lie next to the realm's caverns).
  const rr = mulberry32(hashString(`${seed}#deep-relations`));
  for (const rm of realms) {
    const near = new Set<number>(), delves = new Map<string, Settlement>();
    for (const x of rm.nodes) {
      for (const e of adj[x]) {
        const o = realmOf[e.to];
        if (o >= 0 && o !== rm.id) near.add(o);
        const s = delveHall.get(e.to);
        if (s) delves.set(s.id, s);
      }
      const s = delveHall.get(x);
      if (s) delves.set(s.id, s);
    }
    for (const o of near) {
      if (o < rm.id) {
        const back = realms[o].relations.find((q) => q.realm === rm.id);
        if (back) rm.relations.push({ realm: o, stance: back.stance });
        continue;
      }
      const key = [rm.template, realms[o].template].sort((a, b) => TEMPLATES_DEEP.indexOf(a) - TEMPLATES_DEEP.indexOf(b)).join('|');
      rm.relations.push({ realm: o, stance: weighted(rr, STANCE[key] ?? [['truce', 1]]) });
    }
    for (const s of delves.values()) {
      const stance = weighted(rr, DELVE_STANCE[rm.template]);
      rm.delves.push({ sid: s.id, name: s.name ?? '', stance });
      // The delve keeps the first realm it borders (its deep road's neighbours).
      s.deepTies ??= { realm: rm.name, en: rm.en, stance };
    }
  }
  // Colours: neighbours differ (a greedy colouring over the relations).
  for (const rm of realms) {
    const usedC = new Set(rm.relations.map((o) => realms[o.realm].colour));
    let c = 1;
    while (usedC.has(c)) c++;
    rm.colour = c;
  }

  // ---- Horrors of the lowest deep ----------------------------------------------------------------------
  const hr = mulberry32(hashString(`${seed}#deep-horrors`));
  const horrorUsed = new Set<string>();
  for (const n of nodes) {
    if (!wild(n) || hr() > 0.75) continue;
    const opts = HORRORS.filter((h) => !horrorUsed.has(h));
    const name = n.kind === 'sea' ? 'the Drowned King' : pick(hr, opts.length ? opts : HORRORS);
    horrorUsed.add(name);
    n.horror = name;
  }

  // ---- Chronicles --------------------------------------------------------------------------------------
  for (const rm of realms) {
    const cr = mulberry32(hashString(`${seed}#deepchron#${rm.id}`));
    const cap = cityOf.get(rm.capital)!;
    const cul = CULTURES[rm.culture];
    const out: { ago: number; text: string }[] = [];
    const founder = cul.language ? cul.language.givenName(cr, rm.template === 'shadowelf') : 'the first';
    const founded = rm.template === 'fungusfolk' ? 2000 + Math.floor(cr() * 6000) : 600 + Math.floor(cr() * 2400);
    out.push({
      ago: founded, text: rm.template === 'shadowelf' ? `${founder} led the ${cul.people} down out of the light and founded ${cap.name}.`
        : rm.template === 'deepgnome' ? `${founder} cut the first warren of ${cap.name}, hidden behind false stone.`
          : rm.template === 'fungusfolk' ? `The first spore of ${cap.name} took root and began to dream.`
            : `${founder} and the clans that would not return to the light took ${cap.name} for their own.`,
    });
    for (const rel of rm.relations.slice(0, 3)) {
      const o = realms[rel.realm];
      const ago = Math.floor(10 + cr() * Math.min(founded - 20, 500));
      const text = rel.stance === 'war' ? `War with ${o.name} began over the tunnels between them, and goes on still.`
        : rel.stance === 'feud' ? `A feud with ${o.name} began when a daughter of one house was found dead in the other’s halls.`
          : rel.stance === 'raids' ? `Raiders went out against ${o.name} for slaves and spoil, as they have ever since.`
            : rel.stance === 'alliance' ? `An alliance was sworn with ${o.name} against the dangers of the deep.`
              : rel.stance === 'trade' ? `A trade road was opened to ${o.name}.`
                : `A truce was made with ${o.name}, uneasy but unbroken.`;
      out.push({ ago, text });
    }
    for (const d of rm.delves.slice(0, 2)) {
      const ago = Math.floor(5 + cr() * 300);
      const text = d.stance === 'war' ? `War broke out with the dwarves of ${d.name} above, who hold the deep road against them.`
        : d.stance === 'raids' ? `Raiders came up the deep road to ${d.name} and carried off dwarves for slaves.`
          : d.stance === 'trade' ? `Trade began with the dwarves of ${d.name} at their deep gate.`
            : d.stance === 'peace' ? `The dwarves of ${d.name} found the realm in the deep and left it in peace.`
              : `A truce was made with the dwarves of ${d.name}, at their deep gate.`;
      out.push({ ago, text });
    }
    // Something from below.
    const horror = rm.nodes.flatMap((x) => adj[x]).map((e) => nodes[e.to]).find((m) => m.horror);
    if (horror) out.push({ ago: Math.floor(3 + cr() * 150), text: `Something called ${horror.horror} stirred in ${horror.name}; a city’s worth of the ${cul.people} went down to face it and none came back.` });
    if ((rm.template === 'shadowelf' || rm.template === 'greydwarf') && cr() < 0.5) out.push({ ago: Math.floor(5 + cr() * 200), text: 'The slaves rose in revolt, and were put down with great cruelty.' });
    if (cr() < 0.5) out.push({ ago: Math.floor(1 + cr() * 60), text: `${rm.ruler} took the throne${rm.template === 'shadowelf' ? ', over the body of the last Matron' : ''}.` });
    rm.chronicle = out.sort((a, b) => b.ago - a.ago);
  }

  // Record them on the caverns.
  nodes.forEach((n, id) => {
    const c = cityOf.get(id);
    if (c && owner[id] >= 0) {
      n.people = base + owner[id];
      n.city = c;
      n.realm = realmOf[id];
    }
    const d = delveHall.get(id);
    if (d) n.delve = { sid: d.id, name: d.name ?? '' };
  });
  return { peoples: hearths.map((_, k) => base + k), realms };
}
