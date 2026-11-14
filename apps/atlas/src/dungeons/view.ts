import { DUNGEON_KINDS, type Dungeon, type DungeonKind, type DungeonSite, KIND_NAME, dungeonSiteOf } from '@worldforge/core/dungeons/core';
import { dungeon } from '@worldforge/core/dungeons/kinds';
import { dungeonThumbnail } from './render';

export const isDungeonKind = (k: unknown): k is DungeonKind => DUNGEON_KINDS.includes(k as DungeonKind);

/**
 * A dungeon from a map feature's properties: a standalone site (`regional` source, tier 'lair',
 * kind tower, crypt, ruin or mine) or an entrance drawn on a town plan (`plans` source, kind 'dentry').
 */
export function dungeonFromFeature(p: Record<string, unknown>, coords: number[]): DungeonSite | null {
  return dungeonSiteOf(p, coords[0], coords[1]);
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
