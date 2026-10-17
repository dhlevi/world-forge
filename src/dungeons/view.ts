import { DUNGEON_KINDS, type Dungeon, type DungeonKind, type DungeonSite, KIND_NAME } from './core';
import { dungeon } from './kinds';
import { dungeonThumbnail } from './render';

export const isDungeonKind = (k: unknown): k is DungeonKind => DUNGEON_KINDS.includes(k as DungeonKind);

function unpackLines(s: string): number[][][] {
  return s.split('|').filter(Boolean).map((l) => l.split(' ').map((p) => p.split(',').map(Number)));
}

/**
 * A dungeon from a map feature's properties: a standalone site (`regional` source, tier 'lair',
 * kind tower, crypt, ruin or mine) or an entrance drawn on a town plan (`plans` source, kind 'dentry').
 */
export function dungeonFromFeature(p: Record<string, unknown>, coords: number[]): DungeonSite | null {
  const kind = p.kind === 'dentry' ? p.dkind : p.kind;
  if (!isDungeonKind(kind)) return null;
  const id = p.kind === 'dentry' ? p.did : p.id;
  if (typeof id !== 'string') return null;
  const site: DungeonSite = {
    id, kind, name: String(p.name ?? ''), ...(p.en ? { en: String(p.en) } : {}), seed: Number(p.seed), lon: coords[0], lat: coords[1],
    tags: String(p.tags ?? '').split(',').filter(Boolean), culture: Number(p.culture ?? 0),
  };
  if (typeof p.sid === 'string') site.town = p.sid;
  if (typeof p.streets === 'string') site.streets = unpackLines(p.streets);
  if (typeof p.outfall === 'string' && p.outfall) site.outfall = p.outfall.split(',').map(Number);
  if (p.scale !== undefined && Number(p.scale) > 0) site.scale = Number(p.scale);
  if (typeof p.grates === 'string' && p.grates) site.grates = p.grates.split(';').map((g) => g.split(',').map(Number));
  if (p.thieves) site.thieves = true;
  if (Number(p.thieves) >= 2) site.grandDen = true;
  return site;
}

export function dungeonTags(s: DungeonSite): string {
  // Tags for the generator (a delve's people, 'pop:...') are not shown.
  return s.tags.filter((t) => !t.includes(':')).join(' · ');
}

const thumbs = new Map<string, string>();

export function dungeonThumb(d: Dungeon): string {
  const key = `${d.site.id}:${d.site.seed}`;
  let u = thumbs.get(key);
  if (!u) {
    u = dungeonThumbnail(d, 220, 160);
    thumbs.set(key, u);
    if (thumbs.size > 40) thumbs.delete(thumbs.keys().next().value!);
  }
  return u;
}

export { dungeon, KIND_NAME };
