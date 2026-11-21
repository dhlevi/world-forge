/**
 * Portraits (docs/design/survival.md, Portraits): a person's head and shoulders as a small pixel
 * picture, painted from who they are (their people, sex, body type, skin, hair and beard, what they
 * wear) and from how they are now: wounds where they show, bandages, a lost eye or ear, the pallor
 * of lost blood, dirt and blood. It is painted again whenever any of that changes
 * (components/Portrait.vue puts it on a canvas).
 *
 * `paintPortrait` is arithmetic on pixels, with no canvas, so that scripts can run it.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { WEAR_SHAPE, type BeardStyle, type FigureKind, type FigureSpec, type HairStyle } from '@worldforge/core/local/figures';
import type { Actor } from '../actors/actor';
import { Body, Identity, type BodyType, type Tie } from '../actors/components';
import { Health, type WoundKind } from '../actors/health';
import { Needs } from '../actors/needs';
import { clamp } from '../util';
import { figureOf } from '../actors/figure';

/** The picture is this many pixels square. */
export const PORTRAIT_PX = 32;

/** Where on the picture a wound shows. Left and right are the person's own (their left is the viewer's right). */
export type MarkAt = 'brow.l' | 'brow.r' | 'cheek.l' | 'cheek.r' | 'eye.l' | 'eye.r' | 'ear.l' | 'ear.r' | 'nose' | 'mouth' | 'jaw' | 'neck' | 'chest' | 'shoulder.l' | 'shoulder.r';

export interface PortraitMark {
  at: MarkAt;
  kind: WoundKind | 'scar';
  /** How bad, 0 to 1 (against what the part can take). */
  size: number;
  /** Tells marks in one place apart (which way a cut runs). */
  id: number;
  bandaged?: boolean;
  stitched?: boolean;
  festering?: boolean;
  bleeding?: boolean;
}

export interface PortraitSpec {
  kind: FigureKind;
  female: boolean;
  type: BodyType;
  /** Colours as "#rrggbb"; the hair's and beard's lengths (cm), where they are known. */
  skin: string;
  hair: { style: HairStyle | 'none'; colour: string; cm?: number };
  beard: { style: BeardStyle | 'none' | 'stubble'; colour: string; cm?: number };
  /** Hair and beard untended: 1 unkempt, 2 ragged. */
  unkempt?: number;
  /** Garments worn, as shapes and colours (core local/figures.ts): those at the shoulders, neck and head show. */
  wear: { shape: string; colour: string }[];
  /** Dirt and blood on them, and the pallor of lost blood, 0 to 1 each. */
  grime: number;
  blood: number;
  pallor: number;
  /** Eyes shut: senseless or dead. */
  shut?: boolean;
  dead?: boolean;
  marks: PortraitMark[];
  /** Parts gone that would show: eye.l, eye.r, ear.l, ear.r, nose. */
  lost: string[];
  /** Fixes where dirt and blood fall, so that they gather rather than jump about. */
  seed: number;
}

// ---- Pixels ------------------------------------------------------------------------------------

type RGB = [number, number, number];
const N = PORTRAIT_PX, CX = N / 2;
/** What a pixel of the figure is (for dirt, blood and wounds to know where they fall). */
const SKIN = 1, HAIR = 2, CLOTH = 3, METAL = 4;

const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Lighter toward a warm light, darker toward a cool shadow. */
const tone = (c: RGB, k: number): RGB => (k >= 0 ? mix(c, [255, 244, 222], k) : mix(c, [26, 18, 44], -k));
/** How far a column is from the middle (0 for the two middle columns). */
const off = (x: number) => (x < CX ? CX - 1 - x : x - CX);

class Pix {
  readonly px = new Uint8ClampedArray(N * N * 4);
  readonly what = new Uint8Array(N * N);

  set(x: number, y: number, c: RGB, what: number): void {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = y * N + x;
    this.px.set([c[0], c[1], c[2], 255], i * 4);
    this.what[i] = what;
  }

  at(x: number, y: number): number {
    return x < 0 || y < 0 || x >= N || y >= N ? 0 : this.what[y * N + x];
  }

  get(x: number, y: number): RGB {
    const i = (y * N + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }

  /** Paints over a pixel of the figure (never the air about it). */
  over(x: number, y: number, c: RGB, t = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    const w = this.at(x, y);
    if (w) this.set(x, y, mix(this.get(x, y), c, t), w);
  }

  shade(x: number, y: number, k: number): void {
    const w = this.at(x, y);
    if (w) this.set(x, y, tone(this.get(x, y), k), w);
  }

  /** A row about the middle: the columns from `inner` to `half` away from it, on both sides. */
  row(y: number, half: number, c: RGB, what: number, inner = 0): void {
    for (let x = 0; x < N; x++) if (off(x) >= inner && off(x) < half) this.set(x, y, c, what);
  }

  /** A blotch of colour worked into the figure about a point. */
  blotch(x: number, y: number, r: number, c: RGB, t: number): void {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= r) this.over(x + dx, y + dy, c, t * (d > r - 1 ? 0.6 : 1));
    }
  }
}

// ---- The shape of the head and shoulders --------------------------------------------------------

/** Half the width of the head at each row from 5 (the crown) to 21 (the chin). */
const HEAD_M = [3, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4];
const HEAD_F = [3, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4, 3];
const TOP = 5, CHIN = 21, NECK_END = 24;

function headHalf(s: PortraitSpec, y: number): number {
  if (y < TOP || y > CHIN) return 0;
  if (s.kind === 'fungus') return y < 9 ? 0 : y >= 20 ? 4 : 5;
  let h = (s.female ? HEAD_F : HEAD_M)[y - TOP];
  if (s.type === 'ectomorph') h = Math.min(h, 5) - (y >= 19 ? 1 : 0);
  if (s.type === 'endomorph' && y >= 11) h++;
  if ((s.kind === 'dwarf' && y >= 13) || (s.kind === 'orc' && y >= 17)) h++;
  if (s.kind === 'elf' && y >= 18) h--;
  if ((s.kind === 'halfling' || s.kind === 'gnome') && y >= 20) h++;
  return Math.max(2, Math.min(8, h));
}

const neckHalf = (s: PortraitSpec) => clamp((s.type === 'ectomorph' ? 2 : s.type === 'endomorph' ? 4 : 3) + (s.kind === 'dwarf' || s.kind === 'orc' ? 1 : 0), 2, 5);

/** Half the width of the shoulders at a row from 25 down. */
function shoulderHalf(s: PortraitSpec, y: number): number {
  const full = 14 + (s.type === 'ectomorph' ? -2 : s.type === 'endomorph' ? 1 : 0) - (s.female ? 1 : 0) + (s.kind === 'dwarf' || s.kind === 'orc' ? 1 : 0) - (s.kind === 'halfling' || s.kind === 'gnome' ? 2 : 0);
  return Math.min(CX, full - ([5, 2, 1][y - 25] ?? 0));
}

// ---- Painting ----------------------------------------------------------------------------------

const EYES: RGB[] = [[58, 42, 26], [40, 40, 44], [70, 96, 120], [62, 96, 60], [100, 78, 40]];
const BANDAGE: RGB = [232, 224, 204], BLOOD: RGB = [150, 22, 22], GORE: RGB = [96, 12, 16];

/** The picture of a person as RGBA pixels, PORTRAIT_PX square. */
export function paintPortrait(s: PortraitSpec): Uint8ClampedArray {
  const P = new Pix();
  const pale = clamp(s.dead ? 1 : s.pallor, 0, 1);
  const skin = mix(hex(s.skin), s.dead ? [148, 150, 150] : [226, 222, 212], pale * (s.dead ? 0.7 : 0.55));
  const hairC = hex(s.hair.colour), beardC = hex(s.beard.colour);
  const beardOrHair = (y: number) => (y > 16 && s.beard.style !== 'none' && s.beard.style !== 'stubble' ? beardC : hairC);
  const fungus = s.kind === 'fungus', lizard = s.kind === 'lizard', bare = fungus || lizard;
  const half = (y: number) => headHalf(s, y);
  /** Hair stands a pixel proud of the temples. */
  const H = half(10) + 1;
  const nk = neckHalf(s);
  const slotOf = (shape: string) => WEAR_SHAPE.get(shape)?.slot;
  const worn = (slot: string) => s.wear.find((w) => slotOf(w.shape) === slot);
  const body = worn('body'), armour = worn('armour'), outer = worn('outer'), cloak = worn('cloak'), face = worn('face'), head = worn('head');
  const lost = new Set(s.lost);

  // ---- Shoulders, and what is worn on them.
  const cloth = (w: { shape: string; colour: string }, x: number, y: number): [RGB, number] => {
    const c = hex(w.colour);
    // Mail: rings as a fine pattern.
    if (w.shape === 'mail') return [tone(c, (x + y) % 2 ? 0.12 : -0.22), METAL];
    return [c, CLOTH];
  };
  for (let y = 25; y < N; y++) {
    const sh = shoulderHalf(s, y);
    for (let x = 0; x < N; x++) {
      const d = off(x);
      if (d >= sh) continue;
      let px: [RGB, number] = body ? cloth(body, x, y) : [skin, SKIN];
      // The neck of a tunic or a dress shows the skin.
      const open = body?.shape === 'dress' ? 28 - y : body?.shape === 'tunic' ? 27 - y : 0;
      if (body && d < open) px = [skin, SKIN];
      if (armour && (armour.shape === 'mail' || d < sh - 3)) px = cloth(armour, x, y);
      if (outer?.shape === 'apron') {
        if ((d === 3 && y < 28) || (d < 5 && y >= 28)) px = cloth(outer, x, y);
      } else if (outer && d >= 2) px = cloth(outer, x, y);
      if (cloak && d >= 3) px = cloth(cloak, x, y);
      P.set(x, y, px[0], px[1]);
    }
    // Light from the upper left: the far shoulder in shade, a fold or two.
    for (let x = 0; x < N; x++) {
      if (!P.at(x, y)) continue;
      if (x >= CX + 5) P.shade(x, y, P.at(x, y) === SKIN ? -0.07 : -0.14);
      if (y === 25 && off(x) >= 3) P.shade(x, y, 0.1);
      if (P.at(x, y) !== SKIN && (x === CX - 8 || x === CX + 7) && y >= 28) P.shade(x, y, -0.16);
    }
  }
  if (cloak) for (const x of [CX - 1, CX]) P.set(x, 25, [212, 172, 70], METAL);
  if (!body && !armour && !outer && !cloak) for (const x of [CX - 5, CX - 4, CX + 3, CX + 4]) P.shade(x, 26, -0.14);

  // ---- Neck.
  for (let y = CHIN + 1; y <= NECK_END; y++) {
    P.row(y, nk, skin, SKIN);
    P.row(y, nk, tone(skin, y === CHIN + 1 ? -0.3 : -0.12), SKIN, y === CHIN + 1 ? 0 : nk - 1);
    P.shade(CX - nk, y, y === CHIN + 1 ? 0 : 0.12);
  }

  // ---- Head.
  for (let y = TOP; y <= CHIN; y++) {
    const h = half(y);
    P.row(y, h, skin, SKIN);
    if (!h) continue;
    P.shade(CX + h - 1, y, -0.2);
    if (y >= 12) P.shade(CX + h - 2, y, -0.08);
    if (y === CHIN) P.row(y, h - 1, tone(skin, -0.1), SKIN);
  }
  for (const [x, y] of [[CX - 4, 9], [CX - 3, 9], [CX - 4, 10]]) P.shade(x, y, 0.12);
  // A lean face has hollow cheeks, a heavy one a fold under the chin.
  if (s.type === 'ectomorph' && !bare) for (const x of [CX - half(16) + 1, CX + half(16) - 2]) P.shade(x, 17, -0.14);
  if (s.type === 'endomorph' && !bare) P.row(CHIN + 1, nk + 1, tone(skin, -0.22), SKIN, 1);
  if (lizard) for (let y = TOP; y <= NECK_END; y++) for (let x = 0; x < N; x++) if (P.at(x, y) === SKIN && (x + y * 2) % 4 === 0) P.shade(x, y, -0.12);

  // ---- Ears.
  if (!bare) for (const side of ['r', 'l'] as const) {
    const sx = side === 'l' ? 1 : -1, x0 = side === 'l' ? CX + half(13) : CX - half(13) - 1;
    if (lost.has(`ear.${side}`)) {
      P.set(x0, 13, GORE, SKIN);
      continue;
    }
    const big = s.kind === 'gnome';
    for (let y = big ? 11 : 12; y <= (big ? 15 : 14); y++) {
      P.set(x0, y, tone(skin, y === 13 ? -0.2 : -0.04), SKIN);
      if (big) P.set(x0 + sx, y, tone(skin, -0.08), SKIN);
    }
    if (s.kind === 'elf') {
      // Pointed: up and out from the top of the ear.
      for (const [dx, y] of [[0, 11], [1, 12], [1, 11], [1, 10], [2, 10], [2, 9]]) P.set(x0 + sx * dx, y, tone(skin, dx === 2 ? -0.1 : -0.04), SKIN);
    }
  }

  // ---- The face.
  const dark = tone(skin, -0.5), lip = mix(mix(skin, [176, 70, 70], s.female ? 0.5 : 0.32), [150, 140, 150], pale * 0.6);
  const eye = (side: 'l' | 'r') => {
    const x = side === 'l' ? CX + 2 : CX - 5, y = 13;
    if (lost.has(`eye.${side}`)) {
      for (let i = 0; i < 3; i++) P.set(x + i, y, mix(tone(skin, -0.62), GORE, 0.35), SKIN);
      P.shade(x + 1, y - 1, -0.3);
      P.shade(x + 1, y + 1, -0.25);
      return;
    }
    if (s.shut) {
      for (let i = 0; i < 3; i++) P.set(x + i, y, dark, SKIN);
      return;
    }
    // A mushroom's eyes are beads.
    if (fungus) {
      P.set(x + 1, y, [30, 24, 30], SKIN);
      return;
    }
    const iris: RGB = lizard ? [26, 20, 14] : EYES[s.seed % EYES.length];
    const white: RGB = lizard ? [222, 190, 60] : [236, 232, 222];
    P.set(x, y, white, SKIN);
    P.set(x + 1, y, iris, SKIN);
    P.set(x + 2, y, white, SKIN);
    // The lid's shadow, and lashes for a woman.
    for (let i = 0; i < 3; i++) P.shade(x + i, y - 1, s.female && !bare ? -0.34 : -0.2);
  };
  eye('l');
  eye('r');
  if (!bare) {
    // Brows (heavy on an orc and a dwarf), in the hair's colour.
    const brow = tone(s.hair.style === 'none' || s.hair.style === 'shaved' ? mix(hairC, skin, 0.4) : hairC, -0.15);
    for (let i = 0; i < 3; i++) for (const x of [CX - 5 + i, CX + 2 + i]) {
      P.set(x, 11, s.female ? mix(brow, skin, 0.35) : brow, SKIN);
      if (s.kind === 'orc' || s.kind === 'dwarf') P.shade(x, 12, -0.3);
    }
  }
  if (lost.has('nose')) for (const [x, y] of [[CX - 1, 15], [CX, 15], [CX - 1, 16], [CX, 16]]) P.set(x, y, tone(skin, -0.6), SKIN);
  else if (lizard) {
    for (let y = 14; y <= 19; y++) P.row(y, 3, tone(skin, 0.16), SKIN);
    for (const x of [CX - 2, CX + 1]) P.set(x, 15, dark, SKIN);
  } else if (!fungus) {
    const wide = s.kind === 'dwarf' || s.kind === 'gnome' || s.kind === 'orc' ? 2 : 1;
    P.shade(CX - 1, 14, 0.14);
    P.shade(CX - 1, 15, 0.14);
    P.shade(CX, 14, -0.14);
    P.shade(CX, 15, -0.18);
    P.row(16, wide, tone(skin, -0.26), SKIN);
    if (s.kind === 'gnome') P.row(15, 2, tone(skin, 0.08), SKIN);
  }
  // The mouth (an orc's tusks beside it).
  P.row(18, lizard ? 5 : fungus ? 1 : 2, lizard || fungus ? dark : lip, SKIN);
  if (!bare) {
    P.shade(CX - 3, 18, -0.12);
    P.shade(CX + 2, 18, -0.12);
    if (s.female) P.row(19, 1, mix(lip, skin, 0.45), SKIN);
    if (s.kind === 'orc') for (const x of [CX - 3, CX + 2]) {
      P.set(x, 17, [236, 228, 204], SKIN);
      P.set(x, 16, [214, 204, 178], SKIN);
    }
  }

  // ---- Beard.
  if (!bare && s.beard.style !== 'none') {
    const b = (x: number, y: number, k = 0) => P.set(x, y, tone(beardC, k - (y - 17) * 0.025), HAIR);
    const st = s.beard.style;
    const moustache = () => {
      P.row(17, 3, beardC, HAIR);
      for (const x of [CX - 4, CX + 3]) b(x, 18);
    };
    if (st === 'moustache') moustache();
    else if (st === 'stubble' || st === 'short') {
      if (st === 'short') moustache();
      else P.row(17, 3, mix(skin, beardC, 0.3), SKIN);
      for (let y = 17; y <= CHIN; y++) for (let x = 0; x < N; x++) {
        const d = off(x), h = half(y);
        if (d < h && (d >= h - 2 || y >= 20)) P.over(x, y, beardC, st === 'short' ? 0.7 : 0.3);
      }
    } else {
      // A full beard, and what the longer ones add below the chin.
      for (const x of [CX - half(16), CX + half(16) - 1]) b(x, 16);
      for (let y = 17; y <= CHIN; y++) for (let x = 0; x < N; x++) if (off(x) < half(y) && !(y === 18 && off(x) < 2)) b(x, y);
      const below: Record<string, number[]> = { full: [4, 3], long: [5, 5, 4, 4, 3, 2], braided: [4, 2, 2, 2, 2, 2, 1], forked: [5, 5, 5, 4] };
      // A long beard reaches as far as it has grown.
      const rows = st === 'long' && s.beard.cm !== undefined ? below.long.slice(0, clamp(Math.round(s.beard.cm / 3), 3, 6)) : below[st] ?? [];
      rows.forEach((h, i) => {
        const y = CHIN + 1 + i;
        for (let x = 0; x < N; x++) {
          const d = off(x);
          if (d >= h || (st === 'forked' && i >= 1 && d < 1 + (i > 2 ? 1 : 0))) continue;
          b(x, y, st === 'braided' && i >= 1 && (x + y) % 2 ? -0.25 : 0);
        }
      });
      if (st === 'braided') P.row(CHIN + 8, 1, [200, 170, 80], METAL);
    }
  }

  // ---- Hair.
  const hair = (x: number, y: number, k = 0) => P.set(x, y, tone(hairC, k + (y <= 5 ? 0.1 : y >= 20 ? -0.12 : 0)), HAIR);
  const hairRow = (y: number, h: number, k = 0, inner = 0) => {
    for (let x = 0; x < N; x++) if (off(x) >= inner && off(x) < h) hair(x, y, k);
  };
  const stubble = () => {
    for (let y = TOP; y <= 8; y++) for (let x = 0; x < N; x++) if (P.at(x, y) === SKIN) P.over(x, y, hairC, (x + y) % 2 ? 0.42 : 0.26);
  };
  /** Hair over the crown down to the brow; `lift`: how far it stands above the skull. */
  const crown = (lift: number, wide = 0) => {
    for (let y = TOP - lift; y <= 8; y++) hairRow(y, Math.min(H + wide, y === TOP - lift ? H - 3 : y === TOP - lift + 1 ? H - 1 : H + wide));
    for (const x of [CX - 4, CX - 3, CX - 2]) P.shade(x, 6, 0.16);
    for (let y = 9; y <= 11; y++) hairRow(y, H + wide, -0.08, H - 1);
  };
  /** Hair falling beside the face and onto the shoulders. */
  const fall = (to: number, wide: number) => {
    for (let y = 9; y <= to; y++) hairRow(y, H + wide, (y % 3 === 0 ? -0.1 : 0) - (y > 20 ? 0.06 : 0), H - 1);
  };
  const st = bare ? 'none' : s.hair.style;
  /** How far down long hair falls, by its length (a row for every 4 cm past the shoulder). */
  const reach = (to: number) => (s.hair.cm === undefined ? to : clamp(Math.round(to - 4 + (s.hair.cm - 16) / 5), to - 4, to + 2));
  if (fungus) {
    // A mushroom's cap for a head of hair.
    const cap = s.hair.style === 'none' ? [142, 82, 62] as RGB : hairC;
    [5, 8, 10, 11, 12, 12, 12, 11].forEach((h, i) => P.row(1 + i, h, tone(cap, i < 2 ? 0.14 : i > 5 ? -0.14 : 0), HAIR));
    P.row(9, 9, tone(cap, -0.4), HAIR);
    P.row(9, 5, tone(skin, -0.2), SKIN);
    for (const [x, y] of [[CX - 6, 4], [CX + 3, 3], [CX - 1, 2], [CX + 7, 6], [CX - 9, 7], [CX + 1, 6]]) P.set(x, y, tone(cap, 0.5), HAIR);
  } else if (lizard) {
    for (const x of [CX - 3, CX - 1, CX + 1]) P.set(x, TOP - 1, tone(skin, -0.25), SKIN);
  } else if (st === 'shaved') stubble();
  else if (st === 'topknot' || st === 'crest') {
    stubble();
    if (st === 'topknot') {
      for (let y = 1; y <= 4; y++) hairRow(y, y === 1 ? 1 : 2, y === 4 ? -0.3 : 0.06);
    } else for (let y = 1; y <= 8; y++) hairRow(y, y === 1 ? 1 : 2, y % 2 ? 0.08 : -0.04);
  } else if (st === 'short') {
    // Grown out past a crop, it stands thicker and comes down over the ears.
    const shaggy = (s.hair.cm ?? 0) > 9;
    crown(shaggy ? 2 : 1);
    if (shaggy) fall(13, 0);
  } else if (st === 'long') {
    crown(1);
    fall(reach(26), 1);
  } else if (st === 'loose') {
    crown(2, 1);
    fall(reach(28), 2);
  } else if (st === 'braids') {
    crown(1);
    for (let y = 9; y <= 28; y++) hairRow(y, H + 1, y % 2 ? -0.26 : 0.04, H - 1);
    hairRow(29, H + 1, 0, H - 1);
    for (const x of [CX - H - 1, CX - H, CX + H - 1, CX + H]) P.set(x, 29, [190, 160, 90], CLOTH);
  } else if (st === 'bun') {
    crown(0);
    for (let y = 0; y <= 3; y++) hairRow(y, y === 0 ? 2 : 3, y === 3 ? -0.2 : 0.06);
  } else if (st === 'curly') {
    crown(3, 1);
    fall(13, 1);
    for (let y = 2; y <= 13; y++) for (let x = 0; x < N; x++) if (P.at(x, y) === HAIR && (x * 3 + y * 5) % 4 === 0) P.shade(x, y, (x + y) % 2 ? 0.22 : -0.22);
  } else if (st === 'tied') {
    crown(0);
    // The tail, down the side of the neck and over the left shoulder.
    for (let y = 15; y <= 27; y++) {
      const x = CX + Math.max(half(y), y > CHIN ? nk : 0) + (y >= 25 ? 1 : 0);
      hair(x, y, y === 15 ? -0.3 : 0);
      hair(x + 1, y, -0.12);
    }
  } else for (const x of [CX - 3, CX - 2]) P.shade(x, 6, 0.2);

  // ---- On the head and about the face.
  if (head && !fungus) {
    const c = hex(head.colour);
    const hat = (y: number, h: number, k = 0, what = CLOTH) => P.row(y, h, tone(c, k), what);
    if (head.shape === 'hood') {
      // Up over the head and down to the shoulders, the face in its shadow.
      for (let y = 2; y <= 25; y++) {
        const outerHalf = y === 2 ? H - 2 : y === 3 ? H : H + 2;
        for (let x = 0; x < N; x++) {
          const d = off(x), inner = y <= 8 ? 0 : y <= CHIN ? half(y) : nk + 1;
          if (d < outerHalf && d >= inner) P.set(x, y, tone(c, d === inner && y > 8 ? -0.28 : y <= 3 ? 0.1 : x >= CX + 4 ? -0.12 : 0), CLOTH);
        }
      }
      P.row(8, H, tone(c, -0.3), CLOTH);
      for (let x = 0; x < N; x++) if (P.at(x, 9) === SKIN) P.shade(x, 9, -0.16);
    } else if (head.shape === 'hat') {
      for (let y = 1; y <= 5; y++) hat(y, y === 1 ? H - 2 : H - 1, y === 1 ? 0.12 : 0);
      hat(6, H - 1, -0.3);
      hat(7, H + 4, 0.06);
      hat(8, H + 3, -0.22);
    } else if (head.shape === 'helm') {
      for (let y = 3; y <= 9; y++) hat(y, y === 3 ? H - 3 : y === 4 ? H - 1 : H, y === 9 ? -0.25 : 0, METAL);
      for (let y = 10; y <= 15; y++) hat(y, 1, -0.1, METAL);
      for (let y = 10; y <= 16; y++) P.row(y, H, tone(c, -0.12), METAL, H - 2);
      for (let y = 4; y <= 7; y++) P.set(CX - 4, y, tone(c, 0.4), METAL);
    } else {
      for (let y = 4; y <= 8; y++) hat(y, y === 4 ? H - 3 : y === 5 ? H - 1 : H, y === 8 ? -0.22 : y === 4 ? 0.1 : 0);
    }
  }
  if (face) {
    const c = hex(face.colour);
    if (face.shape === 'scarf') {
      for (let y = 20; y <= 26; y++) P.row(y, y <= 21 ? half(y) : nk + 3, tone(c, y === 23 ? -0.2 : y === 20 ? 0.1 : 0), CLOTH);
    } else {
      // A veil: over the hair, and across the face below the eyes.
      for (let y = 3; y <= 26; y++) for (let x = 0; x < N; x++) {
        const d = off(x), h = y <= CHIN ? Math.max(half(y), y <= 8 ? H : 0) : nk + 2, edge = y === 3 ? H - 2 : y === 4 ? H : H + 1;
        if ((y <= 8 && d < edge) || (y > 8 && d >= h && d < edge) || (y >= 16 && d < h)) P.set(x, y, tone(c, y >= 16 && d < h ? (y % 3 ? 0 : -0.1) : x >= CX + 4 ? -0.14 : 0), CLOTH);
      }
    }
  }

  // ---- Untended, hair and beard stray past their shape.
  if (s.unkempt && !bare) {
    const edge: [number, number][] = [];
    for (let y = 1; y < 29; y++) for (let x = 1; x < N - 1; x++) {
      if (!P.at(x, y) && (P.at(x - 1, y) === HAIR || P.at(x + 1, y) === HAIR || P.at(x, y + 1) === HAIR || P.at(x, y - 1) === HAIR)) edge.push([x, y]);
    }
    const ur = mulberry32(s.seed ^ 0x2f6b1d);
    for (let i = Math.min(edge.length, s.unkempt >= 2 ? 16 : 7); i > 0; i--) {
      const [x, y] = edge.splice(Math.floor(ur() * edge.length), 1)[0];
      P.set(x, y, tone(beardOrHair(y), -0.08), HAIR);
    }
  }

  // ---- A dark line about the figure.
  const rim: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (P.at(x, y) && ((x > 0 && !P.at(x - 1, y)) || (x < N - 1 && !P.at(x + 1, y)) || (y > 0 && !P.at(x, y - 1)))) rim.push([x, y]);
  }
  for (const [x, y] of rim) P.shade(x, y, -0.48);

  // ---- Wounds, bandages, dirt and blood.
  for (const m of s.marks) paintMark(P, s, m);
  const r = mulberry32(s.seed ^ 0x51ed270b);
  const spots: [number, number, number][] = [];
  for (let i = 0; i < 400 && spots.length < 90; i++) {
    const x = 3 + Math.floor(r() * (N - 6)), y = 4 + Math.floor(r() * (N - 4)), k = r();
    if (P.at(x, y)) spots.push([x, y, k]);
  }
  const grime = clamp(s.grime, 0, 1), blood = clamp(s.blood, 0, 1);
  const dirt: RGB = [58, 46, 28];
  spots.slice(0, Math.round(grime * 60)).forEach(([x, y, k]) => {
    P.over(x, y, dirt, 0.34 + k * 0.3);
    P.over(x + (k < 0.5 ? 1 : -1), y, dirt, 0.2);
    if (k > 0.6) P.over(x, y + 1, dirt, 0.2);
  });
  // The whole of a filthy person is dulled.
  if (grime > 0.5) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) P.over(x, y, dirt, (grime - 0.5) * 0.3);
  spots.slice(60, 60 + Math.round(blood * 30)).forEach(([x, y, k]) => {
    P.over(x, y, k < 0.5 ? BLOOD : GORE, 0.9);
    if (k > 0.35) P.over(x, y + 1, BLOOD, 0.7);
    if (k > 0.75) P.over(x + 1, y, GORE, 0.6);
  });

  // ---- The ground behind.
  const out = P.px;
  for (let y = 0; y < N; y++) {
    const bg = mix([44, 52, 70], [26, 31, 43], y / (N - 1));
    for (let x = 0; x < N; x++) if (!P.at(x, y)) out.set([bg[0], bg[1], bg[2], 255], (y * N + x) * 4);
  }
  return out;
}

/** Where a mark is painted. */
function anchor(s: PortraitSpec, at: MarkAt, id: number): [number, number] {
  const j = id % 2, ear = headHalf(s, 13);
  switch (at) {
    case 'brow.l': return [CX + 2 + j, 9 + j];
    case 'brow.r': return [CX - 4 + j, 9 + j];
    case 'cheek.l': return [CX + 3, 15 + j];
    case 'cheek.r': return [CX - 4, 15 + j];
    case 'eye.l': return [CX + 3, 13];
    case 'eye.r': return [CX - 4, 13];
    case 'ear.l': return [CX + ear, 13];
    case 'ear.r': return [CX - ear - 1, 13];
    case 'nose': return [CX - 1 + j, 15];
    case 'mouth': return [CX - 1 + j, 18];
    case 'jaw': return [j ? CX + 2 : CX - 3, 20];
    case 'neck': return [j ? CX + 1 : CX - 2, 23];
    case 'chest': return [j ? CX + 3 : CX - 4, 28 + (id % 3)];
    case 'shoulder.l': return [CX + 9, 27 + j];
    case 'shoulder.r': return [CX - 10, 27 + j];
  }
}

function paintMark(P: Pix, s: PortraitSpec, m: PortraitMark): void {
  const [x, y] = anchor(s, m.at, m.id);
  const size = clamp(m.size, 0.1, 1), n = 1 + Math.round(size * 3), slant = m.id % 2 ? 1 : -1;
  // Broken teeth: gaps in the mouth.
  if (m.at === 'mouth' && !m.bandaged) {
    for (let i = 0; i < Math.min(3, n); i++) P.over(x - 1 + i * 2, y, [30, 16, 20], 0.9);
    if (m.bleeding) P.over(x, y + 1, BLOOD, 0.8);
    return;
  }
  if (m.bandaged) {
    // A strip of linen over it, wrapped about what it is on; blood seeping through a fresh one.
    const band = (yy: number, h: number, inner = 0) => {
      for (let xx = 0; xx < N; xx++) if (off(xx) >= inner && off(xx) < h && P.at(xx, yy)) P.set(xx, yy, tone(BANDAGE, (xx + yy) % 3 === 0 ? -0.14 : 0), CLOTH);
    };
    const pad = (w: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -w; dx <= w; dx++) P.over(x + dx, y + dy, tone(BANDAGE, dy > 0 ? -0.14 : 0));
    };
    if (m.at.startsWith('brow')) {
      band(9, 10);
      band(10, 10);
    } else if (m.at.startsWith('eye') || m.at.startsWith('ear')) {
      // A pad over the eye or the ear, tied about the brow.
      band(m.at.startsWith('eye') ? 11 : 10, 10);
      pad(m.at.startsWith('eye') ? 1 : 0);
    } else if (m.at === 'neck') {
      band(22, 6);
      band(23, 6);
    } else if (m.at === 'chest' || m.at.startsWith('shoulder')) pad(3);
    else {
      band(y, 9);
      band(y + 1, 9);
    }
    if (m.bleeding) P.blotch(x, y, 1, BLOOD, 0.8);
    return;
  }
  switch (m.kind) {
    case 'cut':
    case 'scar': {
      const c: RGB = m.kind === 'scar' ? [236, 206, 200] : GORE;
      for (let i = 0; i <= n; i++) {
        const px = x + (i - Math.floor(n / 2)) * slant, py = y + i - Math.floor(n / 2);
        P.over(px, py, c, m.kind === 'scar' ? 0.75 : 0.95);
        if (m.kind === 'cut' && !m.stitched) P.over(px + 1, py, BLOOD, 0.45);
        if (m.stitched && i % 2 === 0) P.over(px - slant, py, [36, 26, 26], 0.9);
      }
      break;
    }
    case 'stab':
      P.blotch(x, y, 0.8 + size, GORE, 0.9);
      P.over(x, y, [40, 6, 10]);
      break;
    case 'bite':
      for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 2], [1, 2], [0, 1]]) P.over(x + dx, y + dy, dy === 1 ? BLOOD : GORE, dy === 1 ? 0.4 : 0.95);
      break;
    case 'crush':
      P.blotch(x, y, 1 + size * 1.5, [92, 28, 48], 0.7);
      P.over(x, y, GORE);
      break;
    case 'bruise':
    case 'fracture':
      P.blotch(x, y, 1 + size * 2, [84, 62, 124], m.kind === 'fracture' ? 0.6 : 0.46);
      if (m.kind === 'fracture') P.over(x, y, [48, 34, 84], 0.7);
      break;
    case 'burn':
      P.blotch(x, y, 1 + size * 2, [196, 82, 60], 0.66);
      P.over(x, y, [118, 36, 30], 0.8);
      break;
    case 'frostbite':
      P.blotch(x, y, 1 + size * 1.5, [150, 176, 208], 0.6);
      if (size > 0.5) P.over(x, y, [44, 44, 58], 0.9);
      break;
  }
  if (m.festering) for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [1, -1], [-1, 1]]) P.over(x + dx, y + dy, [170, 180, 62], 0.42);
  if (m.bleeding) for (let i = 1; i <= 1 + n; i++) P.over(x, y + i, BLOOD, i === 1 + n ? 0.6 : 0.92);
}

// ---- A person's portrait ------------------------------------------------------------------------

/** Where a wound of a part shows (none: under the clothes, or below the picture). */
function markAt(part: string, id: number): MarkAt | null {
  const side = part.endsWith('.l') ? 'l' : 'r';
  if (part === 'head' || part === 'skull') return (['brow.l', 'cheek.r', 'brow.r', 'cheek.l'] as const)[id % 4];
  if (part.startsWith('eye.')) return `eye.${side}`;
  if (part.startsWith('ear.')) return `ear.${side}`;
  if (part.startsWith('arm.')) return `shoulder.${side}`;
  if (part === 'nose' || part === 'jaw' || part === 'neck') return part;
  if (part === 'teeth') return 'mouth';
  if (part === 'torso' || part.startsWith('breast.')) return 'chest';
  return null;
}

/** Where an old scar shows, from its part (an id, or the words character creation gives). */
function scarAt(part: string, i: number): MarkAt | null {
  if (part === 'face') return i % 2 ? 'cheek.l' : 'cheek.r';
  if (part === 'scalp') return i % 2 ? 'brow.l' : 'brow.r';
  return part === 'torso' || part.startsWith('arm.') || part.startsWith('breast.') ? null : markAt(part, i);
}

/**
 * A person's portrait as they are now: their looks and dress, their wounds, and the dirt and blood
 * on them. `figure`: how they are dressed for where they are, if not in all they wear.
 */
export function portraitOf(a: Actor, figure: FigureSpec = figureOf(a)): PortraitSpec {
  const f = figure, body = a.get(Body), h = a.get(Health), n = a.get(Needs)?.d;
  const marks: PortraitMark[] = [];
  (body?.d.wounds ?? []).forEach((w, i) => {
    const at = w.scar ? scarAt(w.part, i) : null;
    if (at) marks.push({ at, kind: 'scar', size: clamp(w.severity / 12, 0.3, 0.8), id: i });
  });
  for (const w of h?.d.wounds ?? []) {
    const at = markAt(w.part, w.id);
    if (!at) continue;
    marks.push({
      at, kind: w.kind, size: w.sev / (h?.partOf(w.part)?.hp ?? 20), id: w.id,
      ...(w.bandaged !== undefined ? { bandaged: true } : {}), ...(w.stitched !== undefined ? { stitched: true } : {}),
      ...(w.infection !== undefined ? { festering: true } : {}), ...(h && h.bleedOf(w) >= 20 ? { bleeding: true } : {}),
    });
  }
  const kempt = body?.kempt();
  return {
    kind: f.kind, female: f.female, type: body?.type.id ?? 'mesomorph', skin: f.skin, wear: f.wear,
    hair: { ...f.hair, ...(body ? { cm: Math.round(body.hairCm) } : {}) },
    beard: { style: body?.beardShown() === 'stubble' ? 'stubble' : f.beard.style, colour: f.beard.colour, ...(body ? { cm: Math.round(body.beardCm) } : {}) },
    ...(kempt ? { unkempt: kempt === 'Ragged' ? 2 : 1 } : {}),
    grime: (n?.grime ?? 0) / 100, blood: (n?.bloodied ?? 0) / 100, pallor: h ? clamp((0.92 - h.bloodShare()) / 0.4, 0, 1) : 0,
    ...(h?.dead ? { dead: true, shut: true } : h?.senseless() ? { shut: true } : {}),
    marks, lost: (h?.d.lost ?? []).filter((p) => /^(eye|ear)\.|^nose$/.test(p)),
    seed: hashString(a.get(Identity)?.name ?? 'someone'),
  };
}

const KINDS = new Set(['human', 'elf', 'dwarf', 'halfling', 'orc', 'lizard', 'gnome', 'fungus']);
const HAIRS = new Set(['short', 'long', 'braids', 'topknot', 'shaved', 'crest', 'bun', 'curly', 'tied', 'loose']);
const BEARDS = new Set(['short', 'full', 'long', 'braided', 'moustache', 'forked']);

/** The portrait of a person in the character's life (their ties), from what is known of them; none if nothing is. */
export function portraitOfTie(t: Tie): PortraitSpec | null {
  const w = t.who;
  if (!w) return null;
  return {
    kind: (w.kind && KINDS.has(w.kind) ? w.kind : 'human') as FigureKind, female: w.female, type: w.type, skin: w.skin,
    hair: { style: HAIRS.has(w.hairStyle) ? (w.hairStyle as HairStyle) : 'none', colour: w.hair },
    beard: { style: BEARDS.has(w.beard) ? (w.beard as BeardStyle) : 'none', colour: w.hair },
    wear: [{ shape: w.female ? 'dress' : 'tunic', colour: w.cloth }],
    grime: 0, blood: 0, pallor: 0, marks: [], lost: [], seed: hashString(t.name ?? t.text),
  };
}
