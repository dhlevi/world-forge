import type { Settlement } from '../gen/settlements';
import type { ClientWorld } from '../world/client';
import { chainOf } from '../gen/politics';
import { type Arms, vassalArms } from '../heraldry/arms';
import { CULTURES } from '../names/cultures';
import { mulberry32 } from '../gen/rng';

const cache = new Map<string, Arms>();
let cacheWorld: unknown = null;

/**
 * A town's or city's arms: its barony's own if it is the barony's seat, otherwise arms derived
 * from the barony's (as the location title shows them). Null where no realm holds the land.
 */
export function townArms(w: ClientWorld, s: Settlement): Arms | null {
  if (cacheWorld !== w) {
    cache.clear();
    cacheWorld = w;
  }
  const hit = cache.get(s.id);
  if (hit) return hit;
  const P = w.politics;
  const i = ((Math.floor(((s.lon + 180) / 360) * P.W) % P.W) + P.W) % P.W, j = Math.min(P.H - 1, Math.max(0, Math.floor(((90 - s.lat) / 180) * P.H)));
  const chain = chainOf(P.units, P.baronyOf[j * P.W + i]);
  const barony = chain[0];
  if (!barony) return null;
  const a = s.id === barony.seat ? barony.arms : vassalArms(mulberry32(s.seed ^ 0x7a11), barony.arms, CULTURES[barony.culture]?.id ?? 'anglo');
  cache.set(s.id, a);
  return a;
}
