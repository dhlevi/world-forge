import { DMath } from '../dmath';
export type Rng = () => number;

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash32(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomUnitVector(rng: Rng): [number, number, number] {
  const z = 2 * rng() - 1;
  const t = 2 * Math.PI * rng();
  const r = Math.sqrt(1 - z * z);
  return [r * DMath.cos(t), r * DMath.sin(t), z];
}

/**
 * Shuffles an array in place (Fisher-Yates, one draw from `r` per item, in order) and returns it.
 * `arr.sort(() => r() - 0.5)` is not a substitute: how often, and in what order, an engine calls a
 * comparator is its own affair, so the draws and the result differ between engines.
 */
export function shuffle<T>(a: T[], r: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * Sorts an array in place by a key worked out once for each item, in order (so a key may draw
 * random numbers, as a jittered order does), ties kept in their order; returns it. Deterministic in
 * every engine, unlike a comparator that draws random numbers itself.
 */
export function sortByKey<T>(a: T[], key: (x: T, i: number) => number): T[] {
  const keys = a.map(key);
  const idx = a.map((_, i) => i).sort((p, q) => keys[p] - keys[q] || p - q);
  const copy = a.slice();
  for (let i = 0; i < idx.length; i++) a[i] = copy[idx[i]];
  return a;
}
