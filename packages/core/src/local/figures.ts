/**
 * Layered figures (docs/design/npcs.md, Figures): people (the player among them) drawn as a body
 * base by kind of people and sex, with legs, feet, body garment, belt, outer garment, cloak, hair,
 * beard and headwear drawn over it in that order, each layer tinted (the body by the skin, hair
 * and beard by their colour, each garment by its cloth). The tileset draws each layer in greys,
 * facing each way, standing and walking (TILESET.md, Figures); the game draws a placeholder for
 * any layer without art.
 *
 * This is the list of layers and what each should show; how a person's layers are chosen (from
 * their looks and what they wear) is the game's (apps/game/src/game/figure.ts).
 */
import { FACINGS } from './tiles';

/** Kinds of people, as the appearance templates (people/appearance.ts) name them. */
export const FIGURE_KINDS = [
  { name: 'human', art: 'A person of middling height.' },
  { name: 'elf', art: 'Taller and slighter than a human, long-limbed; pointed ears where the hair allows.' },
  { name: 'dwarf', art: 'A head shorter than a human and twice as broad; big hands and feet.' },
  { name: 'halfling', art: 'Half a human\'s height, round-faced, large bare feet.' },
  { name: 'orc', art: 'Human height or a little more, heavy-shouldered, a jutting jaw.' },
  { name: 'lizard', art: 'A lizard-folk: a scaled head with a snout, a tail behind, clawed feet.' },
  { name: 'gnome', art: 'Smaller than a dwarf and lighter, a large nose and ears.' },
  { name: 'fungus', art: 'A mushroom-folk: a broad cap for a head, a pale stalk of a body.' },
] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number]['name'];

/** How tall each kind stands against a human (the placeholders are drawn shorter). */
export const KIND_HEIGHT: Record<FigureKind, number> = { human: 1, elf: 1.07, dwarf: 0.68, halfling: 0.56, orc: 1.04, lizard: 1, gnome: 0.55, fungus: 0.8 };

/** Hair styles (people/appearance.ts). */
export const HAIR_STYLES = [
  { name: 'short', art: 'Short hair, cropped at the neck.' },
  { name: 'long', art: 'Long hair, loose to the shoulders or below.' },
  { name: 'braids', art: 'Hair in one or two braids down the back or over the shoulders.' },
  { name: 'topknot', art: 'Shaved at the sides, a knot on the crown.' },
  { name: 'shaved', art: 'Shaved to stubble (a shadow on the scalp).' },
  { name: 'bald', art: 'No hair (draw nothing, or a sheen on the scalp).' },
  { name: 'crest', art: 'A crest of hair from brow to nape, the sides shaved.' },
  { name: 'bun', art: 'Hair drawn back into a bun.' },
  { name: 'curly', art: 'A mass of tight curls.' },
  { name: 'tied', art: 'Hair tied back in a tail.' },
  { name: 'loose', art: 'Hair worn loose and full.' },
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number]['name'];

/** Beards (people/appearance.ts); 'none' draws nothing. */
export const BEARD_STYLES = [
  { name: 'short', art: 'A short beard along the jaw.' },
  { name: 'full', art: 'A full beard.' },
  { name: 'long', art: 'A long beard to the chest.' },
  { name: 'braided', art: 'A long beard in braids.' },
  { name: 'moustache', art: 'A moustache only.' },
  { name: 'forked', art: 'A beard parted into two forks.' },
] as const;
export type BeardStyle = (typeof BEARD_STYLES)[number]['name'];

/** Where on the figure a garment is drawn, in drawing order (the first drawn first, under the rest). */
export const WEAR_SLOTS = ['legs', 'feet', 'hands', 'body', 'armour', 'belt', 'outer', 'cloak', 'face', 'head'] as const;
export type WearSlot = (typeof WEAR_SLOTS)[number];

export interface WearShape {
  /** The frame's name, after "wear_" ("wear_tunic_s"). */
  name: string;
  slot: WearSlot;
  /** The cloth's colour when the item gives none (placeholder, and a tint for grey art). */
  colour: string;
  /** What it covers, for drawing the bare skin under it: the arms, the legs to the knee or the ankle. */
  arms?: boolean;
  legs?: 'knee' | 'ankle';
  art: string;
}

/**
 * The shapes garments are drawn as. Items name their shape (their `figure`, apps/game/src/data/items);
 * many items share one (a shirt, a tunic and a doublet are all drawn as a tunic, in their colours).
 */
export const WEAR_SHAPES: readonly WearShape[] = [
  { name: 'trousers', slot: 'legs', colour: '#6a5a46', legs: 'ankle', art: 'Trousers to the ankle.' },
  { name: 'hose', slot: 'legs', colour: '#5a4a6a', legs: 'ankle', art: 'Close-fitting hose.' },
  { name: 'skirt', slot: 'legs', colour: '#7a5a4a', legs: 'ankle', art: 'A skirt to the ankle.' },
  { name: 'shoes', slot: 'feet', colour: '#4a3626', art: 'Low leather shoes.' },
  { name: 'boots', slot: 'feet', colour: '#3e2c1e', art: 'Boots to the calf.' },
  { name: 'sandals', slot: 'feet', colour: '#8a6a44', art: 'Sandals: straps, the toes showing.' },
  { name: 'gloves', slot: 'hands', colour: '#5a4630', art: 'Gloves or mittens.' },
  { name: 'tunic', slot: 'body', colour: '#7a6a50', arms: true, legs: 'knee', art: 'A tunic, shirt or doublet with sleeves, to the hip or knee.' },
  { name: 'dress', slot: 'body', colour: '#7a5060', arms: true, legs: 'ankle', art: 'A dress to the ankle with sleeves.' },
  { name: 'robe', slot: 'body', colour: '#5a5a70', arms: true, legs: 'ankle', art: 'A long robe or gown with wide sleeves (a priest\'s, a scholar\'s).' },
  { name: 'jerkin', slot: 'armour', colour: '#6a4a2e', art: 'A leather jerkin or padded coat over the tunic, no sleeves.' },
  { name: 'mail', slot: 'armour', colour: '#9a9a9a', arms: true, art: 'A mail shirt (rings shown as a fine grey pattern).' },
  { name: 'belt', slot: 'belt', colour: '#3e2a1a', art: 'A belt at the waist, a buckle in front.' },
  { name: 'apron', slot: 'outer', colour: '#a09078', art: 'A work apron from chest to knee.' },
  { name: 'jacket', slot: 'outer', colour: '#4a5a46', arms: true, art: 'A short jacket over the tunic.' },
  { name: 'coat', slot: 'outer', colour: '#4a4a5a', arms: true, legs: 'knee', art: 'A long coat to the knee.' },
  { name: 'cloak', slot: 'cloak', colour: '#4e5a3e', art: 'A cloak over the shoulders, hanging behind (seen whole from the north).' },
  { name: 'veil', slot: 'face', colour: '#d8d0c0', art: 'A veil over the hair and the lower face.' },
  { name: 'scarf', slot: 'face', colour: '#8a3a3a', art: 'A scarf about the neck and the lower face.' },
  { name: 'cap', slot: 'head', colour: '#6a5040', art: 'A close cap.' },
  { name: 'hood', slot: 'head', colour: '#4e5a3e', art: 'A hood up over the head.' },
  { name: 'hat', slot: 'head', colour: '#5a4a30', art: 'A broad-brimmed hat.' },
  { name: 'helm', slot: 'head', colour: '#8a8a8a', art: 'A metal helm (a padded coif is drawn as this too, in cloth).' },
];
export const WEAR_SHAPE = new Map(WEAR_SHAPES.map((w) => [w.name, w]));

/** A figure: a person's look on the map, the layers drawn in order. */
export interface FigureSpec {
  kind: FigureKind;
  female: boolean;
  /** Colours as "#rrggbb". */
  skin: string;
  hair: { style: HairStyle | 'none'; colour: string };
  beard: { style: BeardStyle | 'none'; colour: string };
  /** Garments, in drawing order (WEAR_SLOTS), each a shape and its colour. */
  wear: { shape: string; colour: string }[];
  /** A child (drawn smaller). */
  young?: boolean;
}

/** How much smaller a child is drawn. */
export const YOUNG_SCALE = 0.72;

/**
 * Rows of a 16-pixel figure dropped to draw it shorter, the least telling first (thigh, chest,
 * hip, brow...), so a short kind keeps its face; the rows left close up toward the feet.
 */
export const SHORTEN_ROWS = [12, 9, 11, 2, 8, 6, 13, 10, 1, 7, 4, 0, 14, 5, 3, 15];

/** A key naming a figure (for caching its pictures). */
export function figureKey(f: FigureSpec): string {
  return [f.kind, f.female ? 'f' : 'm', f.skin, f.hair.style, f.hair.colour, f.beard.style, f.beard.colour, ...f.wear.map((w) => `${w.shape}:${w.colour}`), f.young ? 'young' : ''].join('|');
}

/** One frame of a figure layer, by name: what it is and its art note (for TILESET.md and the template). */
export interface FigureLayer {
  /** The frame name without the facing ("body_dwarf_f", "hair_braids", "wear_tunic"). */
  name: string;
  art: string;
}

/** Every figure layer a tileset may draw (each in four facings, standing and walking). */
export function figureLayers(): FigureLayer[] {
  const out: FigureLayer[] = [];
  for (const k of FIGURE_KINDS) for (const sex of ['m', 'f'] as const) out.push({ name: `body_${k.name}_${sex}`, art: `${k.art} ${sex === 'm' ? 'Male' : 'Female'}; bare skin in light grey (tinted by the skin), in plain underclothes.` });
  for (const h of HAIR_STYLES) if (h.name !== 'bald') out.push({ name: `hair_${h.name}`, art: `${h.art} In light grey (tinted by the hair's colour).` });
  for (const b of BEARD_STYLES) out.push({ name: `beard_${b.name}`, art: `${b.art} In light grey (tinted).` });
  for (const w of WEAR_SHAPES) out.push({ name: `wear_${w.name}`, art: `${w.art} In light grey (tinted by the cloth); drawn over the ${w.slot === 'body' ? 'body' : `layers before ${w.slot}`}.` });
  return out;
}

/** Every frame name of the figure layers: `<layer>_<facing>` and `<layer>_walk_<facing>`. */
export function figureFrameNames(): string[] {
  return figureLayers().flatMap((l) => FACINGS.flatMap((d) => [`${l.name}_${d}`, `${l.name}_walk_${d}`]));
}
