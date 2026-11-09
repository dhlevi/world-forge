import { type Grid, distKm } from './grid';
import { hash32 } from './rng';
import type { ColonyKind, Settlement } from './settlements';
import { CULTURES } from '../names/cultures';
import { BUNDLE } from '../names/bundles';
import { SETTLEMENTS as S } from './config';

/**
 * Old World colonies on New World coasts: a few coastal New World towns (about one in eleven,
 * three to fourteen in all, at least 400 km apart) become colonies, forts or trading posts of
 * the seafaring culture whose Old World coast lies nearest, so each power's colonies cluster on
 * the shores facing it. Each colony takes its founders' culture (for its name and its realm).
 */
export function chooseColonies(g: Grid, settlements: Settlement[], culture: Uint8Array, seed: number): void {
  const { W, H } = g;
  const cellOf = (lon: number, lat: number) => {
    const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
    return Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))) * W + i;
  };
  // Old World coastal towns of seafaring cultures: the ports colonists sail from.
  // How readily a culture sails: its template's habit, times its traits (Seafarers, Raiders).
  const sea = (ci: number) => (BUNDLE.get(CULTURES[ci]?.id ?? '')?.seafaring ?? (CULTURES[ci]?.mods.seafaring > 1.2 ? 0.3 : 0)) * (CULTURES[ci]?.mods.seafaring ?? 1);
  const ports = settlements.filter((s) => !s.newWorld && s.coastal && sea(culture[cellOf(s.lon, s.lat)]) > 0);
  const shore = settlements.filter((s) => s.newWorld && s.coastal);
  if (!ports.length || !shore.length) return;
  const nNew = settlements.filter((s) => s.newWorld).length;
  const want = Math.max(3, Math.min(14, Math.round(nNew / 11)));
  // The New World shores nearest the Old World first, with a little chance in the order.
  // No one people founds more than half the colonies (the others get the shores nearest them next).
  const perCulture = new Map<number, number>();
  const capped = (p: Settlement) => (perCulture.get(culture[cellOf(p.lon, p.lat)]) ?? 0) >= Math.ceil(want / 2);
  const nearestPort = (s: Settlement) => {
    let best = ports[0], bd = Infinity;
    for (const p of ports) {
      if (capped(p)) continue;
      const d = distKm(s.lon, s.lat, p.lon, p.lat) / (0.6 + 0.4 * Math.min(2, sea(culture[cellOf(p.lon, p.lat)])));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return { port: best, d: bd };
  };
  const ranked = shore.map((s) => ({ s, ...nearestPort(s), r: hash32(seed ^ hash32(s.seed)) / 4294967296 }))
    .sort((a, b) => a.d * (0.7 + 0.6 * a.r) - b.d * (0.7 + 0.6 * b.r));
  const chosen: Settlement[] = [];
  for (const entry of ranked) {
    const { s } = entry;
    if (chosen.length >= want) break;
    if (chosen.some((c) => distKm(c.lon, c.lat, s.lon, s.lat) < 400)) continue;
    // The nearest port whose people have not yet founded their share.
    const port = capped(entry.port) ? nearestPort(s).port : entry.port;
    if (capped(port)) continue;
    const pc = culture[cellOf(port.lon, port.lat)];
    perCulture.set(pc, (perCulture.get(pc) ?? 0) + 1);
    const r = hash32(s.seed ^ 0xc010) / 4294967296;
    const kind: ColonyKind = r < 0.5 ? 'colony' : r < 0.78 ? 'fort' : 'post';
    s.colony = kind;
    s.culture = culture[cellOf(port.lon, port.lat)];
    // Colonists build their own kind of town.
    s.kind = undefined;
    s.walls = kind === 'fort';
    s.population = Math.round(s.population * (kind === 'colony' ? 1.6 : kind === 'fort' ? 0.8 : 0.6));
    s.coreM = Math.sqrt(((s.population / S.cityDensityPerHa) * 10000) / Math.PI);
    s.radiusM = s.coreM * 2.1 + 250;
    chosen.push(s);
  }
}
