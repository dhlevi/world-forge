import { Biome } from './biomes';
import { hashString, mulberry32 } from './rng';
import type { Politics } from './politics';
import type { Settlement } from './settlements';
import { CULTURES } from '../names/cultures';
import type { NameBank } from '../names/names';

/**
 * Prisons, chosen after everything else on random streams of their own (so nothing else moves):
 *
 * - **Prison keeps:** every realm's capital city, and about half the other cities of 40,000 or
 *   more, keep a prison on their plan (towns/city.ts), named ("the Black Keep", "the Gaol of X").
 * - **Prison forts:** about one realm in four or five (more of the great ones) sends its worst to
 *   a fort far from any town: on a small island off its coast above all, else on a mountain crag,
 *   in a marsh, or on lonely moorland. The towns worker builds each as a village of its own: a
 *   walled fort with the garrison's hamlet outside the gate (towns/village.ts).
 */
export interface PrisonFort {
  lon: number;
  lat: number;
  name: string;
  en: string;
  setting: 'island' | 'crag' | 'marsh' | 'moor';
  /** The realm (independent unit id) that keeps it. */
  realm: number;
  culture: number;
}

export interface PrisonFields {
  W: number;
  H: number;
  height: Float32Array;
  lakeDepth: Float32Array;
  biome: Uint8Array;
  culture: Uint8Array;
  newWorld: Uint8Array;
}

const KEEP_NAMES = ['the Black Keep', 'the Iron Keep', 'the Grey Gaol', 'the Old Gaol', 'the Tolbooth', 'the Bastion', 'the Stone Tower', 'the Gaol of {0}', 'the Prison of {0}', 'the Keep of {0}'];
const FORT_NAMES: Record<PrisonFort['setting'], string[]> = {
  island: ['{0} Rock', 'the Rock of {0}', 'the Isle of {0}', '{0} Gaol'],
  crag: ['{0} Hold', 'the Eyrie of {0}', 'the Fortress of {0}', '{0} Castle'],
  marsh: ['{0} Fen Gaol', 'the Mire Fort of {0}', '{0} Gaol'],
  moor: ['{0} Gaol', 'the Fort of {0}', '{0} Hold'],
};

const distKm = (a: number, b: number, c: number, d: number) => {
  const dl = ((((c - a) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((((b + d) / 2) * Math.PI) / 180), (d - b) * 110.57);
};

export function prisons(f: PrisonFields, p: Politics, settlements: Settlement[], bank: NameBank, seed: string): PrisonFort[] {
  const units = p.units;
  const topOf = (id: number) => {
    let u = units[id];
    while (u && u.parent >= 0) u = units[u.parent];
    return u ? u.id : -1;
  };

  // ---- Prison keeps in the cities --------------------------------------------------------------------
  const rc = mulberry32(hashString(`${seed}#prisons#city`));
  const seats = new Set(units.filter((u) => u.parent < 0 && u.level >= 2 && u.gov !== 'tribal').map((u) => u.seat));
  for (const s of settlements) {
    if (s.tier !== 'city') continue;
    const x = rc(), k = rc();
    if (s.delve || s.kind === 'tribal' || !(seats.has(s.id) || (s.population >= 40000 && x < 0.5))) continue;
    const tpl = KEEP_NAMES[Math.floor(k * KEEP_NAMES.length)];
    const ci = s.culture ?? 0;
    const n = bank.named(ci, tpl, [{ name: s.name ?? '', en: s.nameEn ?? s.name ?? '' }]);
    s.prison = { name: n.name, en: n.en };
  }

  // ---- Prison forts -----------------------------------------------------------------------------------
  const PW = p.W, PH = p.H, PN = PW * PH;
  const full = (c: number) => {
    const i = c % PW, j = (c / PW) | 0;
    return Math.min(f.H - 1, Math.floor(((j + 0.5) * f.H) / PH)) * f.W + Math.min(f.W - 1, Math.floor(((i + 0.5) * f.W) / PW));
  };
  const lonOf = (c: number) => ((c % PW) + 0.5) / PW * 360 - 180;
  const latOf = (c: number) => 90 - ((((c / PW) | 0) + 0.5) / PH) * 180;
  const dyKm = (180 / PH) * 111.2;
  const cellKm2 = (c: number) => dyKm * dyKm * Math.max(0.05, Math.cos((latOf(c) * Math.PI) / 180));
  const land = (c: number) => f.height[full(c)] > 0 && f.lakeDepth[full(c)] <= 0;
  const cellAt = (lon: number, lat: number) => Math.min(PH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * PH))) * PW + ((Math.floor(((lon + 180) / 360) * PW) % PW) + PW) % PW;
  /** Cells within `km` of a cell. */
  const disc = (c0: number, km: number, fn: (c: number) => void) => {
    const j0 = (c0 / PW) | 0, i0 = c0 % PW;
    const rj = Math.ceil(km / dyKm);
    for (let dj = -rj; dj <= rj; dj++) {
      const j = j0 + dj;
      if (j < 0 || j >= PH) continue;
      const dx = dyKm * Math.max(0.05, Math.cos((latOf(j * PW) * Math.PI) / 180));
      const ri = Math.min(PW / 2, Math.ceil(km / dx));
      for (let di = -ri; di <= ri; di++) {
        const c = j * PW + (((i0 + di) % PW) + PW) % PW;
        if (Math.hypot(dj * dyKm, di * dx) <= km) fn(c);
      }
    }
  };
  // Far from every town and city.
  const nearTown = new Uint8Array(PN);
  for (const s of settlements) if (s.tier === 'city' || s.tier === 'town') disc(cellAt(s.lon, s.lat), 40, (c) => (nearTown[c] = 1));
  // Islands: small pieces of land with no town on them, kept by the realm whose land is nearest.
  const comp = new Int32Array(PN).fill(-1);
  const comps: { cells: number[]; area: number; town: boolean }[] = [];
  for (let s0 = 0; s0 < PN; s0++) {
    if (comp[s0] >= 0 || !land(s0)) continue;
    const id = comps.length, cells = [s0];
    comp[s0] = id;
    let area = 0;
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q], i = c % PW, j = (c / PW) | 0;
      area += cellKm2(c);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jj = j + dj;
        if (jj < 0 || jj >= PH) continue;
        const n = jj * PW + (((i + di) % PW) + PW) % PW;
        if (comp[n] < 0 && land(n)) {
          comp[n] = id;
          cells.push(n);
        }
      }
    }
    comps.push({ cells, area, town: false });
  }
  for (const s of settlements) {
    const k = comp[cellAt(s.lon, s.lat)];
    if (k >= 0) comps[k].town = true;
  }
  const islandOwner = comps.map((k) => {
    if (k.area > 4000 || k.town) return -1;
    const c0 = k.cells[0];
    let best = -1, bd = Infinity;
    disc(c0, 220, (c) => {
      const b = p.baronyOf[c];
      if (b < 0 || comp[c] === comp[c0]) return;
      const d = distKm(lonOf(c0), latOf(c0), lonOf(c), latOf(c));
      if (d < bd) {
        bd = d;
        best = topOf(b);
      }
    });
    return best;
  });
  const SCORE = { island: 3, crag: 2.2, marsh: 1.8, moor: 1 };
  const best = new Map<number, { c: number; s: number; setting: PrisonFort['setting'] }>();
  for (let c = 0; c < PN; c++) {
    if (!land(c) || nearTown[c]) continue;
    const fc = full(c);
    if (f.newWorld[fc] === 1 || f.biome[fc] === Biome.IceSheet) continue;
    const k = comp[c];
    const isle = k >= 0 && islandOwner[k] >= 0;
    const b = p.baronyOf[c];
    const owner = isle ? islandOwner[k] : b >= 0 ? topOf(b) : -1;
    if (owner < 0) continue;
    const h = f.height[fc], bi = f.biome[fc];
    const setting: PrisonFort['setting'] = isle ? 'island' : h > 1400 ? 'crag' : bi === Biome.Wetland || bi === Biome.Mangrove ? 'marsh' : 'moor';
    const jitter = (Math.imul(c ^ 0x9e3779b1, 0x85ebca6b) >>> 0) / 4294967296;
    const sc = SCORE[setting] + 0.9 * jitter;
    const cur = best.get(owner);
    if (!cur || sc > cur.s) best.set(owner, { c, s: sc, setting });
  }
  const out: PrisonFort[] = [];
  const realms = units.filter((u) => u.parent < 0 && u.level >= 2 && u.gov !== 'tribal' && u.gov !== 'colony' && u.gov !== 'league').sort((a, b) => a.id - b.id);
  for (const u of realms) {
    const r = mulberry32(hashString(`${seed}#prisons#fort#${u.id}`));
    if (r() > 0.06 + 0.05 * u.level) continue;
    const at = best.get(u.id);
    if (!at) continue;
    const lon = lonOf(at.c), lat = latOf(at.c);
    if (out.some((o) => distKm(o.lon, o.lat, lon, lat) < 80)) continue;
    const ci = f.culture[full(at.c)] ?? u.culture;
    const proper = bank.opaque(CULTURES[ci] ?? CULTURES[0], r, true);
    const list = FORT_NAMES[at.setting];
    const n = bank.named(ci, list[Math.floor(r() * list.length)], [proper]);
    out.push({ lon, lat, name: n.name, en: n.en, setting: at.setting, realm: u.id, culture: ci });
  }
  return out;
}
