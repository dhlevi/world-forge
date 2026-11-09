/**
 * The pictures of the hieroglyphic scripts (lang/script.ts): simple line drawings of birds,
 * beasts, parts of the body, plants, tools, water and sky, in the manner of Egyptian signs. Each
 * is tall and narrow (46 wide, the full height), low and wide (100 wide, within 25 to 75 high, so
 * two can stand one above the other), or square (a block of its own). A script deals them out to
 * its sounds in an order of its own.
 */
export type PicPrim = { k: 'line' | 'quad' | 'circ' | 'dot' | 'poly'; p: number[] };
export type PicClass = 'tall' | 'low' | 'square';
export interface Pictograph {
  name: string;
  cls: PicClass;
  prims: PicPrim[];
}

const L = (...p: number[]): PicPrim => ({ k: 'line', p });
const Q = (...p: number[]): PicPrim => ({ k: 'quad', p });
const C = (...p: number[]): PicPrim => ({ k: 'circ', p });
const D = (...p: number[]): PicPrim => ({ k: 'dot', p });

export const PICTOGRAPHS: Pictograph[] = [
  // Tall and narrow.
  { name: 'reed', cls: 'tall', prims: [Q(23, 4, 42, 44, 24, 96), Q(23, 4, 6, 44, 24, 96), L(23, 20, 23, 90)] },
  { name: 'feather', cls: 'tall', prims: [Q(26, 96, 6, 50, 28, 4), Q(28, 4, 44, 52, 26, 96), L(26, 96, 26, 104)] },
  { name: 'ankh', cls: 'tall', prims: [C(23, 20, 11), L(23, 31, 23, 98), L(6, 42, 40, 42)] },
  { name: 'staff', cls: 'tall', prims: [L(23, 98, 23, 12, 36, 4), L(23, 98, 14, 88)] },
  { name: 'cobra', cls: 'tall', prims: [Q(14, 96, 40, 92, 26, 72), Q(26, 72, 12, 56, 24, 36), Q(24, 36, 38, 22, 26, 10), L(26, 10, 16, 16), Q(24, 36, 6, 30, 20, 20)] },
  { name: 'lotus', cls: 'tall', prims: [L(23, 98, 23, 40), Q(23, 40, 6, 30, 10, 8), Q(23, 40, 40, 30, 36, 8), Q(23, 40, 18, 18, 23, 4), Q(23, 40, 28, 18, 23, 4)] },
  { name: 'rope', cls: 'tall', prims: [Q(23, 98, 6, 60, 23, 40), Q(23, 40, 40, 20, 23, 8), Q(23, 8, 8, 20, 23, 40), Q(23, 40, 40, 60, 23, 98)] },
  { name: 'pillar', cls: 'tall', prims: [L(14, 96, 32, 96), L(23, 96, 23, 20), L(10, 20, 36, 20), L(14, 8, 32, 8), L(18, 8, 23, 20, 28, 8)] },
  { name: 'man', cls: 'tall', prims: [C(24, 14, 9), L(24, 23, 24, 62), L(24, 36, 8, 50), L(24, 36, 40, 30), L(24, 62, 12, 98), L(24, 62, 36, 98)] },
  { name: 'sceptre', cls: 'tall', prims: [L(30, 98, 30, 22), Q(30, 22, 30, 4, 14, 8), L(14, 8, 10, 20)] },
  // Square: a block of their own.
  { name: 'vulture', cls: 'square', prims: [Q(20, 92, 30, 60, 30, 34), Q(30, 34, 34, 14, 52, 16), L(52, 16, 62, 22, 50, 26), Q(30, 40, 70, 40, 90, 74), L(90, 74, 34, 64), L(40, 64, 36, 92), L(56, 66, 54, 92)] },
  { name: 'owl', cls: 'square', prims: [C(44, 26, 14), D(38, 24, 3), D(50, 24, 3), Q(30, 34, 22, 70, 40, 84), Q(58, 34, 76, 60, 60, 84), L(40, 84, 60, 84), L(42, 84, 40, 96), L(56, 84, 58, 96)] },
  { name: 'chick', cls: 'square', prims: [C(34, 30, 10), L(26, 30, 18, 34, 26, 36), Q(40, 38, 70, 34, 72, 62), Q(72, 62, 50, 80, 30, 60), Q(30, 60, 28, 46, 40, 38), L(46, 76, 42, 96), L(58, 74, 60, 96)] },
  { name: 'eye', cls: 'square', prims: [Q(8, 50, 50, 18, 92, 50), Q(8, 50, 50, 78, 92, 50), D(50, 49, 8), Q(16, 30, 50, 10, 86, 28), L(40, 66, 32, 92), Q(56, 66, 70, 90, 80, 80)] },
  { name: 'sun', cls: 'square', prims: [C(50, 50, 26), D(50, 50, 6)] },
  { name: 'house', cls: 'square', prims: [L(16, 22, 84, 22, 84, 82, 16, 82, 16, 58)] },
  { name: 'star', cls: 'square', prims: [L(50, 14, 50, 86), L(16, 40, 84, 60), L(84, 40, 16, 60), L(30, 82, 50, 50, 70, 82)] },
  { name: 'city', cls: 'square', prims: [C(50, 50, 32), L(28, 28, 72, 72), L(72, 28, 28, 72)] },
  { name: 'heart', cls: 'square', prims: [Q(36, 30, 18, 60, 38, 84), Q(38, 84, 60, 88, 66, 60), Q(66, 60, 70, 30, 36, 30), L(42, 30, 40, 14), L(58, 32, 64, 18)] },
  { name: 'beetle', cls: 'square', prims: [Q(50, 22, 76, 46, 50, 86), Q(50, 86, 24, 46, 50, 22), L(50, 30, 50, 82), C(50, 16, 7), L(30, 40, 14, 30), L(70, 40, 86, 30), L(30, 70, 14, 82), L(70, 70, 86, 82)] },
  // Low and wide: two of them stand one above the other.
  { name: 'water', cls: 'low', prims: [L(4, 52, 14, 42, 24, 52, 34, 42, 44, 52, 54, 42, 64, 52, 74, 42, 84, 52, 94, 42)] },
  { name: 'mouth', cls: 'low', prims: [Q(8, 50, 50, 26, 92, 50), Q(8, 50, 50, 74, 92, 50)] },
  { name: 'arm', cls: 'low', prims: [L(6, 46, 70, 46), L(6, 58, 64, 58), Q(70, 46, 90, 40, 94, 52), L(94, 52, 64, 58), L(6, 46, 6, 58)] },
  { name: 'snake', cls: 'low', prims: [Q(6, 66, 22, 40, 38, 62), Q(38, 62, 54, 82, 70, 58), Q(70, 58, 80, 42, 92, 46), L(92, 46, 96, 52), L(80, 44, 76, 36), L(86, 44, 86, 34)] },
  { name: 'basket', cls: 'low', prims: [L(8, 34, 92, 34), Q(8, 34, 50, 100, 92, 34), L(76, 40, 90, 54)] },
  { name: 'loaf', cls: 'low', prims: [L(22, 70, 78, 70), Q(22, 70, 50, 20, 78, 70)] },
  { name: 'hill', cls: 'low', prims: [L(4, 70, 96, 70), Q(8, 70, 30, 30, 50, 70), Q(50, 70, 70, 30, 92, 70)] },
  { name: 'hand', cls: 'low', prims: [L(6, 62, 70, 62), Q(6, 62, 6, 48, 30, 48), L(30, 48, 82, 48), L(70, 62, 92, 58), L(82, 48, 92, 58)] },
  { name: 'lion', cls: 'low', prims: [Q(14, 50, 20, 32, 34, 36), L(34, 36, 80, 40), Q(80, 40, 94, 40, 92, 30), L(14, 50, 22, 74), L(36, 50, 30, 74), L(72, 48, 70, 74), L(84, 46, 88, 74), L(22, 50, 84, 52)] },
  { name: 'boat', cls: 'low', prims: [Q(4, 44, 50, 80, 96, 44), L(30, 58, 70, 58), L(50, 58, 50, 26), L(50, 26, 66, 32)] },
  { name: 'foot', cls: 'low', prims: [L(14, 26, 18, 68, 90, 70), Q(90, 70, 94, 60, 80, 58), L(80, 58, 30, 58)] },
  { name: 'cloth', cls: 'low', prims: [L(14, 36, 86, 36), L(20, 36, 24, 70), L(50, 36, 50, 70), L(80, 36, 76, 70), L(18, 70, 82, 70)] },
];

/** Signs that close a word and say what kind of thing it is (determinatives). */
export const DETERMINATIVES: Pictograph[] = [
  { name: 'seated', cls: 'tall', prims: [C(22, 18, 9), L(22, 27, 20, 66, 40, 66, 40, 98), L(20, 40, 38, 50)] },
  { name: 'scroll', cls: 'low', prims: [L(10, 40, 90, 40, 90, 64, 10, 64, 10, 40), L(50, 40, 50, 64), L(42, 52, 58, 52)] },
  { name: 'legs', cls: 'low', prims: [L(10, 30, 30, 70, 56, 70), L(56, 30, 76, 70, 96, 70)] },
  { name: 'stroke', cls: 'tall', prims: [L(23, 30, 23, 96)] },
];
