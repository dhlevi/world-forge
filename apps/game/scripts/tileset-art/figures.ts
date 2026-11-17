/**
 * Figure layers (core local/figures.ts; TILESET.md, Figures): bodies by kind and sex, hair, beards
 * and garments, in greys for the game to tint. Every layer is laid on one human frame (head, torso,
 * arms, legs in the same places) so any garment fits any body; shorter kinds are squashed toward
 * the feet when a figure is put together.
 */
import type { Facing } from '@worldforge/core/local/tiles';
import { Sprite, type RGB } from './paint';

type Px = [number, number];
type Box = [number, number, number, number];
type View = 'n' | 'e' | 's';

/** Grey levels, lightest first: the game multiplies them by the layer's colour. */
const LEVELS = [255, 234, 202, 166, 128];
const grey = (v: number): RGB => [v, v, v];
const LINE = grey(72), EYE = grey(24);

/** An arm or a leg: its pixels, the hand or foot at its end, and whether it is the far one. */
interface Limb {
  pix: Px[];
  end: Px[];
  far: boolean;
}
interface Pose {
  view: View;
  head: Box;
  torso: Box;
  arms: Limb[];
  legs: Limb[];
}

const box = ([x0, y0, x1, y1]: Box): Px[] => {
  const out: Px[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
};
const row = (y: number, x0: number, x1: number) => box([x0, y, x1, y]);
const col = (x: number, y0: number, y1: number) => box([x, y0, x, y1]);
const without = (pts: Px[], drop: Px[]) => pts.filter(([x, y]) => !drop.some(([a, b]) => a === x && b === y));

/** Where the parts are, facing a way (east for both sides), frame 0 standing, 1 and 2 a stride. */
function pose(view: View, fr: number): Pose {
  const head: Box = [5, 1, 10, 5];
  if (view !== 'e') {
    const arm = (x: number, up: boolean): Limb => ({ pix: col(x, 7, up ? 9 : 10), end: [[x, up ? 10 : 11]], far: false });
    const leg = (x: number, up: boolean): Limb => ({ pix: box([x, 12, x + 1, up ? 12 : 13]), end: row(up ? 13 : 14, x, x + 1), far: false });
    return { view, head, torso: [5, 7, 10, 11], arms: [arm(4, fr === 1), arm(11, fr === 2)], legs: [leg(6, fr === 1), leg(8, fr === 2)] };
  }
  const torso: Box = [6, 7, 9, 11];
  if (fr === 0) return { view, head, torso, arms: [{ pix: box([7, 7, 8, 10]), end: row(11, 7, 8), far: false }], legs: [{ pix: box([7, 12, 8, 13]), end: row(14, 7, 9), far: false }] };
  const fore: Limb = { pix: [[8, 12], [9, 12], [9, 13], [10, 13]], end: row(14, 9, 11), far: fr === 2 };
  const hind: Limb = { pix: [[6, 12], [7, 12], [5, 13], [6, 13]], end: row(14, 4, 5), far: fr === 1 };
  const arm: Limb = fr === 1
    ? { pix: [[7, 7], [8, 7], [8, 8], [9, 8], [9, 9], [10, 9]], end: row(10, 10, 11), far: false }
    : { pix: [[7, 7], [8, 7], [6, 8], [7, 8], [5, 9], [6, 9]], end: row(10, 4, 5), far: false };
  return { view, head, torso, arms: [arm], legs: [fore, hind].sort((a, b) => Number(b.far) - Number(a.far)) };
}

/** The pixels a plain human body covers in a pose (other layers outline only outside it). */
function silhouette(p: Pose): Set<number> {
  const pts = [...box(p.head), ...box(p.torso), ...p.arms.flatMap((a) => [...a.pix, ...a.end]), ...p.legs.flatMap((l) => [...l.pix, ...l.end])];
  return new Set(pts.map(([x, y]) => y * 16 + x));
}

/** A layer being painted in grey levels. */
class Layer {
  readonly s = new Sprite();
  private lv = new Map<number, number>();

  private put(x: number, y: number, l: number): void {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    l = Math.max(0, Math.min(LEVELS.length - 1, l));
    this.lv.set(y * 16 + x, l);
    this.s.set(x, y, grey(LEVELS[l]));
  }

  /** A part at a level, lit from the top-left: its top rim lighter, right and bottom darker. */
  part(pts: Px[], l: number): void {
    const has = new Set(pts.map(([x, y]) => y * 16 + x));
    const in_ = (x: number, y: number) => x >= 0 && x < 16 && has.has(y * 16 + x);
    for (const [x, y] of pts) this.put(x, y, l - (in_(x, y - 1) ? 0 : 1) + (in_(x + 1, y) ? 0 : 1) + (in_(x, y + 1) ? 0 : 1));
  }

  dot(pts: Px[], l: number): void {
    for (const [x, y] of pts) this.put(x, y, l);
  }

  /** Shifts painted pixels darker (or lighter, d < 0). */
  shift(pts: Px[], d: number): void {
    for (const [x, y] of pts) {
      const l = this.lv.get(y * 16 + x);
      if (l !== undefined) this.put(x, y, l + d);
    }
  }

  eye(x: number, y: number): void {
    this.s.set(x, y, EYE);
  }

  clear(pts: Px[]): void {
    for (const [x, y] of pts) {
      this.s.set(x, y, [0, 0, 0], 0);
      this.lv.delete(y * 16 + x);
    }
  }

  /** A dark line around the layer, except over `inside` (the body, where the layer's own shading shows its edge). */
  finish(inside?: Set<number>): Sprite {
    const s = this.s, ring: Px[] = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (s.alpha(x, y) || inside?.has(y * 16 + x)) continue;
      if (s.alpha(x - 1, y) === 255 || s.alpha(x + 1, y) === 255 || s.alpha(x, y - 1) === 255 || s.alpha(x, y + 1) === 255) ring.push([x, y]);
    }
    for (const [x, y] of ring) s.set(x, y, LINE);
    return s;
  }
}

// ---- Bodies ------------------------------------------------------------------------------------

function body(kind: string, female: boolean, p: Pose): Sprite {
  const L = new Layer(), { view } = p, side = view === 'e', front = view === 's';
  const bigEnds = kind === 'dwarf' || kind === 'halfling';
  /** A hand or foot, bigger for dwarves (hands and feet) and halflings (feet). */
  const grow = (end: Px[], foot: boolean): Px[] => {
    if (!(kind === 'dwarf' || (foot && bigEnds))) return end;
    const xs = end.map(([x]) => x), y = end[0][1];
    if (side) return [...end, [Math.max(...xs) + 1, y]];
    return [...end, xs[0] < 8 ? [Math.min(...xs) - 1, y] : [Math.max(...xs) + 1, y]];
  };

  if (kind === 'lizard' && side) L.part([[5, 11], [4, 11], [4, 12], [3, 12], [2, 13]], 2);
  for (const l of p.legs) {
    L.part(l.pix, l.far ? 2 : 1);
    L.part(grow(l.end, true), (l.far ? 3 : 2) - (kind === 'halfling' ? 1 : 0));
  }
  L.part(box(p.torso), 1);
  for (const a of p.arms) {
    L.part(a.pix, a.far ? 2 : 1);
    L.part(grow(a.end, false), 1);
  }
  if (kind === 'lizard' && view === 'n') L.part([...box([7, 11, 8, 14]), [7, 15]], 2);

  // Underclothes: a loincloth, or a shift to the thigh.
  const T = p.torso, thigh = p.legs.flatMap((l) => l.pix.filter(([, y]) => y === 12));
  if (female) L.part([...box([T[0], 8, T[2], 11]), ...thigh], 2);
  else L.part([...row(11, T[0], T[2]), ...thigh], 3);

  // The head.
  if (kind === 'fungus') {
    L.part([...row(4, 5, 10), ...row(5, 5, 10)], 0);
    L.part([...row(0, 5, 10), ...box([3, 1, 12, 2]), ...row(3, 3, 12)], 1);
    L.shift(row(3, 4, 11), front ? 2 : 1);
    L.dot([[5, 1], [9, 0], [11, 2], [7, 2]], 0);
    if (front) {
      L.eye(6, 4);
      L.eye(9, 4);
    } else if (side) L.eye(9, 4);
  } else {
    let head = without(box(p.head), [[5, 1], [10, 1]]);
    if (kind === 'orc') head = [...head, ...(side ? row(6, 8, 10) : row(6, 6, 9))];
    if (side) {
      const nose: Record<string, Px[]> = { lizard: [[11, 3], [11, 4], [12, 4], [11, 5], [12, 5]], gnome: [[11, 3], [11, 4], [12, 4]], dwarf: [[11, 3], [11, 4], [12, 4]] };
      head = [...head, ...(nose[kind] ?? [[11, 4]])];
    }
    L.part(head, 1);
    // Ears: at the sides from in front and behind, in the head from the side.
    const ears: Record<string, Px[]> = { elf: [[4, 3], [4, 2], [3, 1]], gnome: [[4, 2], [4, 3], [4, 4], [3, 3]], lizard: [], human: [[4, 3]], dwarf: [[4, 3]], halfling: [[4, 3]], orc: [[4, 3]] };
    const ear = ears[kind] ?? [[4, 3]];
    if (side) {
      L.shift([[7, 3], ...(kind === 'gnome' ? [[7, 4] as Px] : [])], 1);
      if (kind === 'elf') L.part([[6, 2], [5, 1]], 1);
    } else if (ear.length) {
      L.part(ear, 1);
      L.part(ear.map(([x, y]) => [15 - x, y] as Px), 1);
    }
    if (kind === 'lizard') L.shift(box(p.torso).filter(([x, y]) => (x + 2 * y) % 3 === 0), 1);
    if (front) {
      const eyeX = kind === 'lizard' ? [5, 10] : [6, 9];
      for (const x of eyeX) L.eye(x, 3);
      if (kind === 'orc') {
        L.shift(row(2, 6, 9), 1);
        L.dot(row(5, 7, 8), 3);
        L.dot([[6, 5], [9, 5]], 0);
      } else if (kind === 'lizard') {
        L.dot(box([7, 4, 8, 5]), 0);
        L.dot([[7, 5], [8, 5]], 3);
      } else if (kind === 'gnome' || kind === 'dwarf') {
        L.dot([[7, 4]], 0);
        L.dot([[8, 4], [7, 5], [8, 5]], kind === 'gnome' ? 2 : 1);
        if (kind === 'dwarf') L.dot([[7, 5], [8, 5]], 3);
      } else {
        L.dot([[7, 5], [8, 5]], female ? 2 : 3);
        if (kind === 'halfling') L.dot([[6, 4], [9, 4]], 0);
      }
    } else if (side) {
      L.eye(9, kind === 'lizard' ? 2 : 3);
      L.dot([[10, 5]], 3);
      if (kind === 'orc') L.dot([[10, 4]], 0);
      if (kind === 'lizard') L.dot([[12, 4]], 3);
    }
  }
  const s = L.finish();
  // A shadow at the feet.
  for (let x = 3; x <= 12; x++) for (const y of [14, 15]) if (!s.alpha(x, y) && (y === 15 || x === 3 || x === 12)) s.set(x, y, [0, 0, 0], 70);
  return s;
}

// ---- Hair and beards ---------------------------------------------------------------------------

function hair(style: string, p: Pose, L: Layer): void {
  const { view } = p, n = view === 'n', e = view === 'e';
  const stubble = (pts: Px[]) => L.dot(pts.filter(([x, y]) => (x + y) % 2 === 0), 3);
  const crown: Px[] = n
    ? [...row(0, 6, 9), ...box([5, 1, 10, 4]), ...row(5, 6, 9)]
    : e
      ? [...row(0, 6, 9), ...row(1, 5, 10), ...row(2, 5, 9), ...box([5, 3, 7, 4]), [5, 5]]
      : [...row(0, 6, 9), ...row(1, 5, 10), ...row(2, 5, 10), [5, 3], [10, 3]];
  const slick = crown.filter(([, y]) => y > 0);
  const scalp: Px[] = n ? box([5, 1, 10, 5]) : e ? [...row(1, 6, 10), ...row(2, 5, 9), ...box([5, 3, 7, 4])] : [...row(1, 6, 9), ...row(2, 5, 10)];
  /** Strands: a few darker pixels down the hair. */
  const strands = (pts: Px[]) => L.shift(pts.filter(([x, y]) => (x * 5 + y * 3) % 7 === 0), 1);
  switch (style) {
    case 'short':
      L.part(crown, 1);
      strands(crown);
      break;
    case 'long':
    case 'loose': {
      const wide = style === 'loose';
      const fall: Px[] = n
        ? [...box([wide ? 3 : 4, 1, wide ? 12 : 11, wide ? 9 : 8]), ...(wide ? row(0, 5, 10) : [])]
        : e
          ? box([wide ? 3 : 4, 2, 7, wide ? 9 : 8])
          : [...box([wide ? 3 : 4, wide ? 1 : 2, 4, 8]), ...box([11, wide ? 1 : 2, wide ? 12 : 11, 8]), ...col(5, 4, 8), ...col(10, 4, 8)];
      const all = [...crown, ...fall];
      L.part(all, 1);
      L.shift(all.filter(([x, y]) => y > 3 && x % 3 === 1), 1);
      break;
    }
    case 'braids': {
      L.part(crown, 1);
      const braids: Px[][] = n ? [col(7, 5, 11), col(8, 5, 11)] : e ? [col(5, 5, 10)] : [col(5, 4, 10), col(10, 4, 10)];
      for (const b of braids) {
        L.part(b, 1);
        L.shift(b.filter(([x, y]) => (x + y) % 2 === 0), 2);
      }
      break;
    }
    case 'topknot':
      stubble(scalp);
      L.part(n ? box([6, 0, 9, 1]) : e ? [...row(0, 6, 8), [7, 1]] : [...row(0, 6, 9), [7, 1], [8, 1]], 0);
      break;
    case 'shaved':
      stubble(scalp);
      break;
    case 'crest':
      stubble(scalp);
      L.part(n ? box([7, 0, 8, 5]) : e ? [[5, 0], [7, 0], [9, 0], ...row(1, 5, 10)] : [...col(7, 0, 2), ...col(8, 0, 2)], 1);
      break;
    case 'bun':
      L.part(slick, 1);
      strands(slick);
      L.part(n ? box([6, 1, 9, 3]) : e ? [...box([3, 2, 4, 4]), [5, 3]] : row(0, 7, 8), 0);
      break;
    case 'curly': {
      const mass: Px[] = n
        ? without(box([4, 0, 11, 6]), [[4, 0], [11, 0]])
        : e
          ? [...without(box([4, 0, 10, 2]), [[4, 0]]), ...box([4, 3, 7, 6])]
          : [...without(box([4, 0, 11, 2]), [[4, 0], [11, 0]]), ...col(4, 3, 5), ...col(11, 3, 5), [5, 3], [10, 3]];
      L.part(mass, 1);
      L.shift(mass.filter(([x, y]) => (x + y) % 2 === 0), 1);
      L.shift(mass.filter(([x, y]) => (x * 3 + y) % 4 === 0), -1);
      break;
    }
    case 'tied':
      L.part(slick, 1);
      strands(slick);
      if (n) {
        L.part([...col(7, 6, 10), ...col(8, 6, 10)], 1);
        L.dot(row(6, 7, 8), 3);
      } else if (e) {
        L.part([...col(4, 3, 8), [3, 8]], 1);
        L.dot([[4, 3]], 3);
      }
      break;
  }
}

function beard(style: string, p: Pose, L: Layer): void {
  if (p.view === 'n') return;
  const e = p.view === 'e';
  const plait = (pts: Px[]) => {
    L.part(pts, 1);
    L.shift(pts.filter(([x, y]) => (x + y) % 2 === 0), 2);
  };
  const full: Px[] = e ? [...col(7, 3, 5), ...box([8, 4, 10, 5]), ...row(6, 8, 10)] : [...col(5, 3, 5), ...col(10, 3, 5), ...row(4, 6, 9), ...row(5, 6, 9), ...row(6, 6, 9)];
  switch (style) {
    case 'short':
      L.part(e ? [...col(7, 3, 4), ...row(5, 7, 10)] : [...col(5, 3, 4), ...col(10, 3, 4), ...row(5, 5, 10)], 1);
      break;
    case 'full':
      L.part(full, 1);
      break;
    case 'long':
      L.part([...full, ...(e ? [...box([8, 7, 10, 8]), [9, 9] as Px] : [...box([6, 7, 9, 8]), ...row(9, 7, 8)])], 1);
      break;
    case 'braided':
      L.part(full, 1);
      plait(e ? box([9, 7, 10, 10]) : box([7, 7, 8, 10]));
      break;
    case 'moustache':
      L.part(e ? [[10, 4], [11, 5]] : [...row(4, 6, 9), [6, 5], [9, 5]], 1);
      return;
    case 'forked':
      L.part([...full, ...(e ? [...col(9, 7, 9), ...col(10, 7, 8)] : [...col(6, 7, 9), ...col(9, 7, 9), ...row(7, 7, 8)])], 1);
      break;
  }
  if (!e && style !== 'short') L.dot([[7, 5], [8, 5]], 3);
}

// ---- Garments ----------------------------------------------------------------------------------

function wear(name: string, p: Pose, L: Layer): void {
  const { view } = p, n = view === 'n', e = view === 'e', s = view === 's';
  const T = p.torso, [tx0, , tx1] = T;
  const legs = (withFeet: boolean, l = 1) => {
    for (const g of p.legs) L.part([...g.pix, ...(withFeet ? g.end : [])], g.far ? l + 1 : l);
  };
  const sleeves = (to = 99) => {
    for (const a of p.arms) L.part(a.pix.filter(([, y]) => y <= to), a.far ? 2 : 1);
  };
  const hem = (pts: Px[]) => L.shift(pts, 1);
  switch (name) {
    case 'trousers':
      L.part([...row(11, tx0, tx1), ...(e ? [] : [[5, 13], [10, 13]] as Px[])], 1);
      legs(false);
      break;
    case 'hose':
      legs(false, 2);
      break;
    case 'skirt': {
      const sk = e ? [...row(11, 6, 9), ...box([5, 12, 10, 13])] : [...row(11, 5, 10), ...row(12, 5, 10), ...row(13, 4, 11)];
      L.part(sk, 1);
      L.shift(sk.filter(([x, y]) => y > 11 && x % 2 === 0), 1);
      break;
    }
    case 'shoes':
      for (const g of p.legs) L.part(g.end, g.far ? 3 : 2);
      break;
    case 'boots':
      for (const g of p.legs) {
        const top = Math.max(...g.pix.map(([, y]) => y));
        L.part(g.pix.filter(([, y]) => y === top), g.far ? 1 : 0);
        L.part(g.end, g.far ? 3 : 2);
      }
      break;
    case 'sandals':
      for (const g of p.legs) L.dot(g.end.filter(([x, y]) => (x + y) % 2 === 0), g.far ? 3 : 2);
      break;
    case 'gloves':
      for (const a of p.arms) L.part(a.end, 2);
      break;
    case 'tunic':
      L.part([...box(T), ...row(12, tx0, tx1)], 1);
      sleeves();
      if (s) L.dot([[7, 7], [8, 7], [7, 8]], 3);
      else if (e) L.dot([[9, 7]], 3);
      break;
    case 'dress': {
      L.part([...box(T), ...(e ? box([5, 12, 10, 13]) : [...row(12, 5, 10), ...row(13, 4, 11)])], 1);
      sleeves();
      hem(row(10, tx0, tx1));
      if (s) L.dot([[7, 7], [8, 7]], 3);
      break;
    }
    case 'robe': {
      const skirt = e ? box([5, 12, 10, 14]) : [...box([5, 12, 10, 13]), ...row(14, 4, 11)];
      L.part([...box(T), ...skirt], 1);
      sleeves();
      for (const a of p.arms) {
        const [x, y] = a.pix[a.pix.length - 1];
        L.part(e ? [[x, y], [x + 1, y]] : [[x, y], [x < 8 ? x - 1 : x + 1, y]], 2);
      }
      if (s) L.dot([...col(7, 8, 14), ...col(8, 8, 14)].filter(([, y]) => y % 2 === 0), 0);
      if (s) L.dot([[7, 7], [8, 7]], 3);
      break;
    }
    case 'jerkin':
      L.part(box(T), 2);
      if (s) L.dot([[7, 8], [8, 9], [7, 10]], 4);
      break;
    case 'mail': {
      const shirt = [...box(T), ...row(12, tx0, tx1)];
      L.part(shirt, 1);
      sleeves(9);
      L.shift([...shirt, ...p.arms.flatMap((a) => a.pix)].filter(([x, y]) => (x + y) % 2 === 0), 1);
      break;
    }
    case 'belt':
      L.part(row(10, tx0, tx1), 3);
      if (s) L.dot([[7, 10], [8, 10]], 0);
      else if (e) L.dot([[9, 10]], 0);
      break;
    case 'apron':
      if (s) {
        L.part([...box([6, 8, 9, 10]), ...box([5, 11, 10, 12])], 0);
        L.dot([[6, 7], [9, 7]], 2);
      } else if (e) L.part([...col(9, 8, 10), ...col(10, 10, 12)], 0);
      else {
        L.dot(row(10, tx0, tx1), 2);
        L.dot([[7, 11], [8, 11]], 1);
      }
      break;
    case 'jacket':
      L.part(box([tx0, 7, tx1, 10]), 1);
      sleeves();
      if (s) {
        L.clear(box([7, 8, 8, 10]));
        L.dot([[6, 7], [9, 7]], 0);
      }
      break;
    case 'coat': {
      L.part([...box(T), ...box([tx0, 12, tx1, 13])], 1);
      sleeves();
      if (s) {
        L.dot(col(8, 8, 13), 3);
        L.dot([[8, 8], [8, 10], [8, 12]], 0);
        L.dot([[6, 7], [9, 7]], 0);
      }
      break;
    }
    case 'cloak':
      if (n) {
        const c = without(box([3, 6, 12, 14]), [[3, 6], [12, 6]]);
        L.part(c, 1);
        L.shift(c.filter(([x, y]) => y > 8 && (x === 5 || x === 8 || x === 11)), 1);
      } else if (e) {
        L.part([...row(6, 5, 8), ...box([3, 7, 5, 13]), [6, 7]], 1);
        L.shift(col(4, 9, 13), 1);
      } else {
        L.part([...row(7, 3, 12), ...box([3, 8, 4, 13]), ...box([11, 8, 12, 13])], 1);
        L.shift([...col(4, 8, 13), ...col(11, 8, 13)], 1);
        L.dot([[7, 7], [8, 7]], 0);
      }
      break;
    case 'veil':
      if (n) L.part([...without(box([4, 0, 11, 8]), [[4, 0], [11, 0]])], 1);
      else if (e) L.part([...row(0, 5, 10), ...row(1, 4, 10), ...box([4, 2, 7, 8]), ...box([9, 4, 11, 5])], 1);
      else L.part([...row(0, 5, 10), ...row(1, 4, 11), ...col(4, 2, 7), ...col(11, 2, 7), ...row(4, 5, 10), ...row(5, 5, 10)], 1);
      if (n) L.shift(col(7, 3, 8), 1);
      break;
    case 'scarf':
      if (e) L.part([...row(5, 8, 11), ...row(6, 6, 10), ...col(5, 7, 9)], 1);
      else L.part([...(s ? row(5, 6, 9) : []), ...row(6, 5, 10), ...(s ? col(9, 7, 9) : col(6, 7, 8))], 1);
      break;
    case 'cap':
      L.part(n ? box([5, 0, 10, 3]) : e ? [...row(0, 6, 9), ...row(1, 5, 10), ...box([5, 2, 7, 3])] : [...row(0, 6, 9), ...row(1, 5, 10)], 1);
      if (!n) L.dot(e ? row(2, 8, 10) : row(2, 5, 10), 2);
      break;
    case 'hood':
      if (n) L.part([...without(box([4, 0, 11, 7]), [[4, 0], [11, 0]]), [7, 8], [8, 8]], 1);
      else if (e) L.part([...row(0, 5, 9), ...row(1, 4, 10), ...box([4, 2, 7, 7]), ...row(6, 8, 9)], 1);
      else {
        L.part(without(box([4, 0, 11, 6]), [[4, 0], [11, 0], ...box([6, 2, 9, 5])]), 1);
        L.shift([...col(5, 2, 5), ...col(10, 2, 5), ...row(1, 6, 9)], 1);
      }
      break;
    case 'hat':
      L.part(row(2, e ? 3 : 2, e ? 12 : 13), 2);
      L.part(e ? box([5, 0, 9, 1]) : box([5, 0, 10, 1]), 1);
      L.dot(e ? row(1, 5, 9) : row(1, 5, 10), 3);
      break;
    case 'helm':
      if (n) L.part(without(box([5, 0, 10, 5]), [[5, 0], [10, 0]]), 1);
      else if (e) L.part([...row(0, 6, 9), ...row(1, 5, 10), ...row(2, 5, 10), ...box([5, 3, 7, 5])], 1);
      else {
        L.part([...row(0, 6, 9), ...row(1, 5, 10), ...row(2, 5, 10), ...col(5, 3, 4), ...col(10, 3, 4)], 1);
        L.part(col(7, 3, 4).concat(col(8, 3, 3)), 2);
      }
      L.dot(n ? col(6, 1, 3) : [[6, 1], [7, 0]], 0);
      break;
  }
}

/** Mirrors a sprite left for right (west from east). */
function mirror(s: Sprite): Sprite {
  const out = new Sprite();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) out.set(15 - x, y, s.get(x, y), s.alpha(x, y));
  return out;
}

/**
 * A figure layer ("body_dwarf_f", "hair_braids", "beard_long", "wear_tunic") facing a way, frame
 * 0 standing, 1 and 2 the two strides of the walk.
 */
export function paintFigure(layer: string, d: Facing, fr: number): Sprite {
  if (d === 'w') return mirror(paintFigure(layer, 'e', fr));
  const p = pose(d, fr), [kind, name, sex] = layer.split('_');
  if (kind === 'body') return body(name, sex === 'f', p);
  const L = new Layer();
  if (kind === 'hair') hair(name, p, L);
  else if (kind === 'beard') beard(name, p, L);
  else wear(name, p, L);
  return L.finish(silhouette(p));
}
