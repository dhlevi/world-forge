import { type WorldData, worldLore } from '../lore/current';
import { TownManager } from '../towns/manager';
import { townContext } from '../people/town-context';
import { householdsFor } from '../people/plan-residents';
import { regionAt } from '../nature/habitat';
import { bestiary } from '../nature/bestiary';
import { floraOf } from '../nature/flora';
import { curseRumours } from '../nature/curses';
import { CULTURES } from '../names/cultures';

/**
 * A fingerprint of a generated world: short hashes of its grids, settlements, lore, the plan of
 * its largest city, the households of that city's first buildings and the nature about it. Two
 * runs of the generator (in Node, a browser, a worker or a game) made the same world exactly when
 * their fingerprints match, so it tells whether a save made from a seed can be trusted to come out
 * the same, and which part of the generator changed when it does not.
 */
export interface Fingerprint {
  /** One hash per part, and one for them all. */
  parts: Record<string, string>;
  all: string;
  /** What was looked at (for a report). */
  city: string;
  buildings: number;
  households: number;
  ms: Record<string, number>;
}

/** FNV-1a over bytes, folded in as more come. */
class Hash {
  private h = 0x811c9dc5;
  bytes(b: Uint8Array): this {
    let h = this.h;
    for (let i = 0; i < b.length; i++) {
      h ^= b[i];
      h = Math.imul(h, 0x01000193);
    }
    this.h = h;
    return this;
  }
  view(a: ArrayBufferView): this {
    return this.bytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  text(s: string): this {
    const b = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      b[i * 2] = c & 255;
      b[i * 2 + 1] = c >> 8;
    }
    return this.bytes(b);
  }
  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}

/** The fingerprint of a world (`households` of the city's first buildings are worked out, 30 by default). */
export function fingerprint(w: WorldData, households = 30): Fingerprint {
  const ms: Record<string, number> = {};
  let t = performance.now();
  const lap = (k: string) => {
    const n = performance.now();
    ms[k] = Math.round(n - t);
    t = n;
  };
  const r = w.raster;
  const parts: Record<string, string> = {};
  parts.height = new Hash().view(r.height).hex();
  parts.climate = new Hash().view(r.tempWarm).view(r.tempCold).view(r.precip).hex();
  parts.biomes = new Hash().view(r.biome).view(r.koppen).view(r.special).hex();
  parts.peoples = new Hash().view(r.culture).text(CULTURES.slice(0, 40).map((c) => `${c.name}:${c.endonym}`).join('|')).hex();
  parts.rivers = new Hash().text(JSON.stringify(w.rivers.features.map((f) => f.geometry.coordinates))).hex();
  parts.settlements = new Hash().text(JSON.stringify(w.settlements.map((s) => [s.id, s.name, s.population, s.lon, s.lat]))).hex();
  parts.realms = new Hash().text(JSON.stringify(w.politics.units.map((u) => [u.id, u.name, u.parent, u.seat]))).hex();
  lap('world');
  const lore = worldLore(w);
  parts.lore = new Hash().text(JSON.stringify([lore.L.year, lore.L.wars.map((x) => x.name), lore.L.faiths.faiths.map((f) => [f.name, f.deities.map((d) => d.name)])])).hex();
  lap('lore');
  const city = [...w.settlements].filter((s) => s.tier === 'city').sort((a, b) => b.population - a.population)[0];
  const towns = new TownManager(w);
  const plan = towns.planOf(city);
  parts.plan = new Hash().text(JSON.stringify(plan)).hex();
  lap('plan');
  const bs = plan.filter((f) => f.properties.kind === 'building');
  const hs = bs.slice(0, households).map((f) => householdsFor(w, f, bs));
  parts.households = new Hash().text(JSON.stringify(hs)).hex();
  parts.town = new Hash().text(JSON.stringify(townContext(w, city.id).stats)).hex();
  lap('people');
  const region = regionAt(r, city.lon, city.lat);
  parts.nature = new Hash().text(JSON.stringify([bestiary(r.seed, region), floraOf(r.seed, region), curseRumours(r.seed, region.key, () => 'X', city.name ?? '')])).hex();
  lap('nature');
  const all = new Hash().text(Object.entries(parts).map(([k, v]) => `${k}=${v}`).join(';')).hex();
  return { parts, all, city: city.name ?? city.id, buildings: bs.length, households: hs.reduce((n, h) => n + h.length, 0), ms };
}
