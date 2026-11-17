/**
 * Layered figures (docs/design/npcs.md, Figures; core local/figures.ts): a person's figure from
 * their looks and what they wear, and the placeholder picture of each layer, drawn in greys to be
 * tinted (the body by the skin, hair and beard by their colour, garments by their cloth).
 *
 * A placeholder is 16 x 16, a person seen from above and a little in front, laid out as a human;
 * shorter kinds are drawn squashed toward the feet when the figure is put together.
 */
import { FIGURE_KINDS, WEAR_SHAPE, WEAR_SLOTS, type BeardStyle, type FigureKind, type FigureSpec, type HairStyle } from '@worldforge/core/local/figures';
import type { Facing } from '@worldforge/core/local/tiles';
import type { Actor } from '../actors/actor';
import { Body, Identity } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { defOf } from '../actors/items/item';
import { LAYERS } from '../actors/items/defs';

const KINDS = new Set<string>(FIGURE_KINDS.map((k) => k.name));
const HAIRS = new Set(['short', 'long', 'braids', 'topknot', 'shaved', 'bald', 'crest', 'bun', 'curly', 'tied', 'loose']);
const BEARDS = new Set(['short', 'full', 'long', 'braided', 'moustache', 'forked']);

/**
 * A person's figure: their kind of people, sex, skin, hair and beard (Body, Identity) and what they
 * wear (Inventory), each garment drawn as its item's shape (`figure` in the item data) in its
 * colour; of two garments in one place, the outer is drawn.
 */
export function figureOf(a: Actor): FigureSpec {
  const b = a.get(Body)?.d, id = a.get(Identity)?.d, inv = a.get(Inventory);
  const kind = (b?.kind && KINDS.has(b.kind) ? b.kind : 'human') as FigureKind;
  const hair = b?.hairStyle && HAIRS.has(b.hairStyle) ? (b.hairStyle as HairStyle) : 'short';
  const beard = b?.beard && BEARDS.has(b.beard) ? (b.beard as BeardStyle) : 'none';
  const bySlot = new Map<string, { shape: string; colour: string; rank: number }>();
  for (const it of inv?.worn() ?? []) {
    const d = defOf(it);
    const shape = d.figure ? WEAR_SHAPE.get(d.figure) : undefined;
    if (!shape) continue;
    const rank = LAYERS.indexOf(d.wear?.layer ?? 'main');
    const had = bySlot.get(shape.slot);
    if (!had || rank > had.rank) bySlot.set(shape.slot, { shape: shape.name, colour: d.colour ?? shape.colour, rank });
  }
  const wear = WEAR_SLOTS.flatMap((s) => {
    const w = bySlot.get(s);
    return w ? [{ shape: w.shape, colour: w.colour }] : [];
  });
  return {
    kind, female: !!id?.female, skin: b?.skinHex || '#d8b090',
    hair: { style: hair === 'bald' ? 'none' : hair, colour: b?.hairHex || '#5a3a20' },
    beard: { style: beard, colour: b?.hairHex || '#5a3a20' },
    wear,
  };
}

// ---- Placeholders ------------------------------------------------------------------------------

/** Greys: light (to take the tint as it is), mid and dark (shading). */
const L = '#f0f0f0', M = '#c4c4c4', D = '#8e8e8e', EYE = '#202020';

/**
 * Draws a placeholder layer (its frame name without the facing: "body_human_f", "hair_long",
 * "wear_tunic") at (x, y), facing `d`, frame `fr` (0 standing; 1 and 2 a stride).
 */
export function drawLayer(g: CanvasRenderingContext2D, x: number, y: number, layer: string, d: Facing, fr: number): void {
  const side = d === 'e' || d === 'w', flip = d === 'w', back = d === 'n';
  const X = (rx: number, w = 1) => (flip ? 16 - rx - w : rx);
  const rect = (rx: number, ry: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(x + (side ? X(rx, w) : rx), y + ry, w, h);
  };
  /** The legs, apart in a stride. */
  const legs = (from: number, to: number, fill: string, shade = fill) => {
    const h = to - from;
    if (side) {
      const a = fr === 1 ? -1 : fr === 2 ? 1 : 0;
      rect(7 + a, from, 2, h, fill);
      rect(7 - a, from, 2, h, shade);
    } else {
      rect(6, from, 2, fr === 1 ? h - 1 : h, fill);
      rect(9, from, 2, fr === 2 ? h - 1 : h, fill);
    }
  };
  const torso = (top: number, bottom: number, fill: string) => rect(side ? 6 : 5, top, side ? 5 : 7, bottom - top, fill);
  const arms = (fill: string) => {
    if (side) rect(fr === 1 ? 10 : fr === 2 ? 7 : 8, 8, 2, 4, fill);
    else {
      rect(4, 8, 1, 4, fill);
      rect(12, 8, 1, 4, fill);
    }
  };
  const [kind, name] = layer.split('_');
  switch (kind) {
    case 'body': {
      // A shadow at the feet, bare legs and arms, a plain shift, the head.
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 4, y + 14, 8, 2);
      legs(12, 15, L, M);
      torso(7, 12, M);
      arms(L);
      rect(6, 2, 5, 5, L);
      if (d === 's') {
        rect(7, 4, 1, 1, EYE);
        rect(9, 4, 1, 1, EYE);
      } else if (side) rect(9, 4, 1, 1, EYE);
      break;
    }
    case 'hair': {
      const n = name as HairStyle;
      if (n === 'shaved') {
        rect(6, 2, 5, back ? 3 : 1, D);
        break;
      }
      // The crown, then what the style adds.
      if (back) rect(6, 2, 5, n === 'short' || n === 'crest' || n === 'topknot' ? 4 : 5, L);
      else if (side) {
        rect(6, 2, 5, 1, L);
        rect(6, 2, 3, 3, L);
      } else rect(6, 2, 5, 2, L);
      if (n === 'long' || n === 'loose' || n === 'curly') {
        if (back) rect(6, 6, 5, 3, M);
        else if (side) rect(6, 3, 2, 5, M);
        else {
          rect(5, 3, 1, 4, M);
          rect(11, 3, 1, 4, M);
        }
        if (n === 'curly') rect(5, 1, 7, 2, L);
      } else if (n === 'braids') {
        if (back) rect(8, 6, 1, 5, M);
        else if (!side) {
          rect(5, 4, 1, 5, M);
          rect(11, 4, 1, 5, M);
        } else rect(6, 4, 1, 5, M);
      } else if (n === 'bun') rect(side ? 5 : 7, back ? 5 : 1, 3, 2, M);
      else if (n === 'tied') rect(side ? 5 : 8, back ? 6 : 4, 1, 4, M);
      else if (n === 'topknot') rect(7, 0, 3, 2, M);
      else if (n === 'crest') rect(8, 1, 1, 5, M);
      break;
    }
    case 'beard': {
      if (back) break;
      const n = name as BeardStyle;
      if (n === 'moustache') {
        rect(side ? 9 : 7, 5, side ? 2 : 3, 1, L);
        break;
      }
      const len = n === 'short' ? 1 : n === 'full' ? 2 : 4;
      if (side) rect(8, 5, 3, len + 1, L);
      else {
        rect(6, 5, 5, 2, L);
        if (len > 1) rect(n === 'forked' ? 6 : 7, 7, n === 'forked' ? 5 : 3, len - 1, M);
        if (n === 'forked') rect(8, 7, 1, len - 1, D);
        if (n === 'braided') rect(8, 7, 1, len, D);
      }
      break;
    }
    case 'wear': {
      const w = WEAR_SHAPE.get(name);
      if (!w) break;
      switch (w.name) {
        case 'trousers': case 'hose': legs(12, 15, L, M); break;
        case 'skirt': rect(5, 11, 7, 4, L); break;
        case 'shoes': legs(14, 15, L, M); break;
        case 'boots': legs(13, 15, L, M); break;
        case 'sandals': legs(14, 15, M, D); break;
        case 'gloves':
          if (side) rect(fr === 1 ? 10 : fr === 2 ? 7 : 8, 11, 2, 1, L);
          else {
            rect(4, 11, 1, 1, L);
            rect(12, 11, 1, 1, L);
          }
          break;
        case 'tunic': torso(7, 13, L); arms(M); rect(side ? 6 : 5, 7, side ? 5 : 7, 1, '#ffffff'); break;
        case 'dress': torso(7, 12, L); arms(M); rect(5, 12, 7, 3, L); break;
        case 'robe': torso(7, 12, L); arms(L); rect(5, 12, 7, 3, M); break;
        case 'jerkin': torso(7, 12, L); break;
        case 'mail': torso(7, 13, L); arms(M); for (let i = 0; i < 5; i += 2) rect(side ? 7 : 6, 8 + i, side ? 3 : 5, 1, D); break;
        case 'belt': rect(side ? 6 : 5, 11, side ? 5 : 7, 1, L); if (d === 's') rect(8, 11, 1, 1, '#ffffff'); break;
        case 'apron': if (!back) rect(side ? (flip ? 6 : 10) : 6, 8, side ? 1 : 5, 6, L); break;
        case 'jacket': torso(7, 11, L); arms(L); break;
        case 'coat': torso(7, 13, L); arms(L); rect(5, 13, 7, 1, M); break;
        case 'cloak':
          if (back) rect(4, 6, 9, 9, L);
          else if (side) rect(flip ? 10 : 5, 6, 2, 8, M);
          else {
            rect(4, 6, 9, 1, L);
            rect(4, 7, 1, 7, M);
            rect(12, 7, 1, 7, M);
          }
          break;
        case 'veil': rect(5, 1, 7, 4, L); if (d === 's') rect(6, 5, 5, 2, M); break;
        case 'scarf': rect(6, 5, 5, 2, L); break;
        case 'cap': rect(6, 1, 5, 2, L); break;
        case 'hood': rect(5, 1, 7, back ? 7 : 3, L); if (!back) { rect(5, 3, 1, 4, M); rect(11, 3, 1, 4, M); } break;
        case 'hat': rect(4, 2, 9, 1, M); rect(6, 0, 5, 2, L); break;
        case 'helm': rect(6, 1, 5, 3, L); if (d === 's') rect(8, 4, 1, 1, M); break;
      }
      break;
    }
  }
}

/** How much a kind's placeholder is squashed toward the feet. */
export function kindScale(kind: FigureKind): number {
  return { human: 1, elf: 1, dwarf: 0.78, halfling: 0.68, orc: 1, lizard: 1, gnome: 0.66, fungus: 0.85 }[kind] ?? 1;
}
