/**
 * Sea and fresh water on the local map (docs/backlog.md, W4). The sea is the world's great body of
 * water below the sea's level, and any other large enough to be a sea of its own (150,000 km² or
 * more); the smaller enclosed basins below the sea's level inland are lakes, fresh like the lakes the
 * world's erosion fills (core gen/detail.ts, isLake) and like every river.
 */
import { CHUNK, type LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES } from '@worldforge/core/local/tiles';

/** A body of water below the sea's level this large (km²) is a sea (the Caspian is some 370,000). */
const SEA_KM2 = 150_000;

/** Which cells of the world's raster are the sea (1), an enclosed lake below the sea's level (2), or land (0), by world. */
const SEAS = new WeakMap<object, Uint8Array>();

export function seaCells(raster: { W: number; H: number; height: ArrayLike<number> }): Uint8Array {
  const hit = SEAS.get(raster);
  if (hit) return hit;
  const { W, H, height } = raster;
  const comp = new Int32Array(W * H).fill(-1);
  const sizes: number[] = [];
  for (let c = 0; c < W * H; c++) {
    if (height[c] > 0 || comp[c] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    const st = [c];
    comp[c] = id;
    while (st.length) {
      const k = st.pop()!;
      n++;
      const x = k % W, y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        const j = ny * W + ((x + dx + W) % W);
        if (height[j] <= 0 && comp[j] < 0) {
          comp[j] = id;
          st.push(j);
        }
      }
    }
    sizes.push(n);
  }
  // Each body's extent (km²): a cell is narrower toward the poles.
  const area = new Float64Array(sizes.length);
  const cellKm2 = (40075 / W) * (20004 / H);
  for (let c = 0; c < W * H; c++) if (comp[c] >= 0) area[comp[c]] += cellKm2 * Math.max(0.05, Math.cos(((90 - ((Math.floor(c / W) + 0.5) / H) * 180) * Math.PI) / 180));
  // 0: land; 1: the sea; 2: an enclosed lake below the sea's level.
  const out = new Uint8Array(W * H);
  for (let c = 0; c < W * H; c++) if (comp[c] >= 0) out[c] = area[comp[c]] >= SEA_KM2 ? 1 : 2;
  SEAS.set(raster, out);
  return out;
}

/**
 * Which water tiles of a chunk are the sea: open water (not a river) at or below the sea's level,
 * with the sea near, that the world does not call a lake.
 */
export function seaOf(local: LocalWorld, cx: number, cy: number, ground: Uint8Array, elev: Int16Array): Uint8Array {
  const out = new Uint8Array(ground.length);
  const raster = local.world.raster;
  const sea = seaCells(raster);
  const { W, H } = raster;
  const sampler = local.towns.sampler;
  for (let k = 0; k < ground.length; k++) {
    const g = GROUND_TILES[ground[k]];
    if (!g?.water || g.name.startsWith('river')) continue;
    const [lon, lat] = local.tileLL(cx * CHUNK + (k % CHUNK) + 0.5, cy * CHUNK + Math.floor(k / CHUNK) + 0.5);
    // Below the sea's level, and the sea near (within two of the raster's cells: the coast the
    // local map draws wanders a cell or so from the raster's), and not one of the world's lakes.
    if (elev[k] > 0) continue;
    const i0 = Math.floor(((lon + 180) / 360) * W), j0 = Math.floor(((90 - lat) / 180) * H);
    // The nearest water cell of the raster (ring by ring): the sea's, or an enclosed lake's.
    let body = 0;
    for (let r = 0; r <= 2 && !body; r++) for (let dj = -r; dj <= r && !body; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const j = Math.min(H - 1, Math.max(0, j0 + dj)), i = (((i0 + di) % W) + W) % W;
      if (sea[j * W + i]) {
        body = sea[j * W + i];
        break;
      }
    }
    if (body === 1 && !sampler.isLake(lon, lat, elev[k])) out[k] = 1;
  }
  return out;
}
