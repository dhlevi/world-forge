/**
 * The kinds of item (docs/design/characters.md, Carrying and inventory): what each weighs, how
 * much room it takes and how big it is, where it can be carried (hands, back, belt, inside
 * containers), what it holds if it is a container, where and in which layer it is worn, how many
 * uses it has, and what it is worth. Values are in copper at common quality.
 *
 * Proposed numbers, to tune in play.
 */

/** How big a thing is at its largest: what it can go into. */
export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge'] as const;
export type Size = (typeof SIZES)[number];
export const sizeRank = (s: Size) => SIZES.indexOf(s);

/** The parts of the body clothing and armour cover. */
export const REGIONS = ['head', 'face', 'torso', 'arms', 'hands', 'waist', 'legs', 'feet'] as const;
export type Region = (typeof REGIONS)[number];

/** Layers, innermost first: one item per region and layer. */
export const LAYERS = ['under', 'main', 'padding', 'armour', 'outer', 'cloak'] as const;
export type Layer = (typeof LAYERS)[number];

/** Places jewellery is worn, and how many pieces each takes. */
export const JEWEL_SLOTS = { ears: 1, brow: 1, neck: 2, brooch: 1, wrists: 2, fingers: 4, ankles: 2 } as const;
export type JewelSlot = keyof typeof JEWEL_SLOTS;

export const REGION_NAMES: Record<Region, string> = {
  head: 'Head', face: 'Face', torso: 'Body', arms: 'Arms', hands: 'Hands', waist: 'Belt', legs: 'Legs', feet: 'Feet',
};
export const JEWEL_NAMES: Record<JewelSlot, string> = {
  ears: 'Earrings', brow: 'Brow', neck: 'Neck', brooch: 'Brooch', wrists: 'Wrists', fingers: 'Rings', ankles: 'Ankles',
};

export type ItemKind = 'clothing' | 'armour' | 'jewellery' | 'container' | 'weapon' | 'tool' | 'food' | 'drink' | 'medicine' | 'light' | 'goods' | 'book' | 'music';

export interface WearDef {
  /** Clothing and armour: the regions covered and the layer. */
  regions?: Region[];
  layer?: Layer;
  /** Jewellery: where it is worn. */
  jewel?: JewelSlot;
  /** Seconds to put on (and to take off). */
  seconds: number;
  /** Warmth and protection (for the needs and combat to come). */
  warmth?: number;
  armour?: number;
}

export interface ContainerDef {
  /** Room inside (litres) and the most weight it will bear (kg). */
  litres: number;
  maxKg: number;
  /** The biggest thing that fits in. */
  maxSize: Size;
  /** Only these kinds of item go in (a quiver: arrows). */
  only?: string[];
  /** Packs: things that can be strapped to the outside, and the weight the straps bear (kg). */
  straps?: number;
  strapKg?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  plural?: string;
  kind: ItemKind;
  /** Each, kg and litres. */
  weight: number;
  bulk: number;
  size: Size;
  /** Copper, at common quality. */
  value: number;
  /** Hands needed to carry it (two for a chest or a statue). */
  hands?: 1 | 2;
  /** Can hang from a belt (a knife in its sheath, a satchel, a waterskin). */
  belt?: boolean;
  /** Can be carried on the back: a pack, or one thing slung across it besides (a shield, a bow, a sword, a spear, a lute). */
  back?: boolean;
  /** Can be strapped to the outside of a pack (shields, bows, staves and spears, axes, a blanket rolled). */
  strap?: boolean;
  /** Belts: how many things hang from them. */
  loops?: number;
  wear?: WearDef;
  container?: ContainerDef;
  /** Things that come in many (arrows, coins of bread): the most in one stack. */
  stack?: number;
  /** Uses or portions in a full one, and what they are called. */
  uses?: number;
  useWord?: string;
  /** Wears with use (most things): has a condition. */
  durable?: boolean;
  /** Where it is sold (the city view's places: market, and shop roles). */
  sold?: string[];
  about?: string;
}

const D = (o: ItemDef): ItemDef => ({ durable: true, hands: 1, ...o });

// Shorthands for wearables.
const W = (regions: Region[], layer: Layer, seconds: number, warmth = 0, armour = 0): WearDef => ({ regions, layer, seconds, warmth, armour });
const J = (jewel: JewelSlot): WearDef => ({ jewel, seconds: 5 });

const CLOTHES = ['market', 'tailor'];
const GENERAL = ['market', 'store'];

export const ITEMS: ItemDef[] = [
  // ---- Containers -------------------------------------------------------------------------------
  D({ id: 'pouch', name: 'belt pouch', kind: 'container', weight: 0.1, bulk: 0.6, size: 'tiny', value: 4, belt: true, container: { litres: 0.5, maxKg: 1, maxSize: 'tiny' }, sold: GENERAL, about: 'A small leather pouch for coins, rings and keys.' }),
  D({ id: 'satchel', name: 'satchel', kind: 'container', weight: 0.3, bulk: 2.3, size: 'small', value: 12, belt: true, container: { litres: 2, maxKg: 3, maxSize: 'small' }, sold: GENERAL, about: 'A small bag for potions, herbs and the like, looped on a belt or carried.' }),
  D({ id: 'herb_satchel', name: 'herb satchel', kind: 'container', weight: 0.4, bulk: 3.3, size: 'small', value: 15, belt: true, container: { litres: 3, maxKg: 3, maxSize: 'small' }, sold: ['apothecary'], about: 'A satchel of pockets for herbs and remedies.' }),
  D({ id: 'bag', name: 'cloth bag', kind: 'container', weight: 0.3, bulk: 1, size: 'small', value: 6, container: { litres: 8, maxKg: 6, maxSize: 'small' }, sold: GENERAL, about: 'A drawstring bag, carried in the hand or packed away to keep things sorted.' }),
  D({ id: 'sack', name: 'sack', kind: 'container', weight: 0.6, bulk: 2, size: 'medium', value: 8, container: { litres: 40, maxKg: 30, maxSize: 'medium' }, sold: GENERAL, about: 'A big hemp sack: room for much, carried in the hand or over a shoulder.' }),
  D({ id: 'basket', name: 'basket', kind: 'container', weight: 0.6, bulk: 13, size: 'medium', value: 5, container: { litres: 12, maxKg: 8, maxSize: 'small' }, sold: ['market'], about: 'A wicker basket with a handle.' }),
  D({ id: 'pack_small', name: 'small pack', kind: 'container', weight: 0.8, bulk: 16, size: 'medium', value: 25, back: true, container: { litres: 15, maxKg: 12, maxSize: 'medium', straps: 1, strapKg: 6 }, sold: GENERAL, about: 'A small pack worn on the back, with one strap outside for a blanket or a shield.' }),
  D({ id: 'pack', name: 'pack', kind: 'container', weight: 1.2, bulk: 32, size: 'large', value: 45, back: true, container: { litres: 30, maxKg: 22, maxSize: 'medium', straps: 2, strapKg: 10 }, sold: GENERAL, about: 'A leather pack worn on the back, with two straps outside for a shield, a bow, a staff or a bedroll.' }),
  D({ id: 'pack_large', name: 'large pack', kind: 'container', weight: 2, bulk: 52, size: 'large', value: 80, back: true, container: { litres: 50, maxKg: 35, maxSize: 'medium', straps: 3, strapKg: 15 }, sold: ['market'], about: 'A big framed pack for long journeys, with three straps outside.' }),
  D({ id: 'quiver', name: 'quiver', kind: 'container', weight: 0.4, bulk: 3, size: 'medium', value: 15, belt: true, back: true, strap: true, container: { litres: 2.5, maxKg: 3, maxSize: 'medium', only: ['arrows'] }, sold: ['market'], about: 'Holds forty arrows, on the belt or across the back.' }),
  D({ id: 'sea_chest', name: 'sea chest', kind: 'container', weight: 10, bulk: 70, size: 'huge', value: 60, hands: 2, container: { litres: 60, maxKg: 60, maxSize: 'medium' }, about: 'A sailor\'s chest, too heavy to carry far.' }),
  D({ id: 'medicine_chest', name: 'medicine chest', kind: 'container', weight: 4, bulk: 9, size: 'medium', value: 120, container: { litres: 8, maxKg: 6, maxSize: 'small' }, sold: ['apothecary'], about: 'A box of drawers for physic.' }),

  // ---- Clothing ---------------------------------------------------------------------------------
  D({ id: 'undershirt', name: 'linen undershirt', kind: 'clothing', weight: 0.2, bulk: 0.6, size: 'small', value: 8, wear: W(['torso'], 'under', 15, 1), sold: CLOTHES }),
  D({ id: 'shirt', name: 'shirt', kind: 'clothing', weight: 0.3, bulk: 1, size: 'small', value: 12, wear: W(['torso', 'arms'], 'main', 15, 1), sold: CLOTHES }),
  D({ id: 'tunic', name: 'tunic', kind: 'clothing', weight: 0.6, bulk: 1.5, size: 'small', value: 15, wear: W(['torso', 'arms'], 'main', 15, 2), sold: CLOTHES }),
  D({ id: 'doublet', name: 'doublet', kind: 'clothing', weight: 0.8, bulk: 2, size: 'small', value: 60, wear: W(['torso', 'arms'], 'main', 30, 2), sold: ['tailor'], about: 'Good clothes, fitted and fastened.' }),
  D({ id: 'dress', name: 'dress', kind: 'clothing', weight: 0.9, bulk: 2.5, size: 'medium', value: 30, wear: W(['torso', 'arms', 'legs'], 'main', 20, 2), sold: CLOTHES }),
  D({ id: 'robe', name: 'robe', kind: 'clothing', weight: 1.2, bulk: 3, size: 'medium', value: 20, wear: W(['torso', 'arms', 'legs'], 'main', 15, 3), sold: CLOTHES }),
  D({ id: 'vestments', name: 'vestments', kind: 'clothing', weight: 2, bulk: 4, size: 'medium', value: 120, wear: W(['torso', 'arms', 'legs'], 'outer', 40, 3) }),
  D({ id: 'scholar_gown', name: 'scholar\'s gown', kind: 'clothing', weight: 1.5, bulk: 3, size: 'medium', value: 70, wear: W(['torso', 'arms', 'legs'], 'outer', 20, 3) }),
  D({ id: 'college_robes', name: 'robes of the college', kind: 'clothing', weight: 1.8, bulk: 3.5, size: 'medium', value: 150, wear: W(['torso', 'arms', 'legs'], 'outer', 25, 3) }),
  D({ id: 'costume', name: 'player\'s costume', kind: 'clothing', weight: 1.2, bulk: 3, size: 'medium', value: 40, wear: W(['torso', 'arms'], 'outer', 30, 1) }),
  D({ id: 'apron', name: 'leather apron', kind: 'clothing', weight: 0.8, bulk: 1.5, size: 'small', value: 10, wear: W(['torso', 'legs'], 'outer', 10, 0, 1), sold: ['market', 'smithy'] }),
  D({ id: 'braies', name: 'braies', plural: 'braies', kind: 'clothing', weight: 0.2, bulk: 0.5, size: 'small', value: 6, wear: W(['legs'], 'under', 15, 1), sold: CLOTHES, about: 'Linen drawers.' }),
  D({ id: 'trousers', name: 'trousers', plural: 'trousers', kind: 'clothing', weight: 0.6, bulk: 1.5, size: 'small', value: 14, wear: W(['legs'], 'main', 20, 2), sold: CLOTHES }),
  D({ id: 'hose', name: 'hose', plural: 'hose', kind: 'clothing', weight: 0.4, bulk: 1, size: 'small', value: 18, wear: W(['legs'], 'main', 25, 2), sold: ['tailor'] }),
  D({ id: 'skirt', name: 'skirt', kind: 'clothing', weight: 0.6, bulk: 1.5, size: 'small', value: 14, wear: W(['legs'], 'main', 15, 2), sold: CLOTHES }),
  D({ id: 'socks', name: 'wool socks', plural: 'wool socks', kind: 'clothing', weight: 0.1, bulk: 0.3, size: 'tiny', value: 3, wear: W(['feet'], 'under', 10, 1), sold: CLOTHES }),
  D({ id: 'shoes', name: 'shoes', plural: 'shoes', kind: 'clothing', weight: 0.6, bulk: 2, size: 'small', value: 15, wear: W(['feet'], 'main', 15, 1), sold: CLOTHES }),
  D({ id: 'boots', name: 'boots', plural: 'boots', kind: 'clothing', weight: 1.4, bulk: 4, size: 'medium', value: 35, wear: W(['feet'], 'main', 30, 2, 1), sold: CLOTHES }),
  D({ id: 'sandals', name: 'sandals', plural: 'sandals', kind: 'clothing', weight: 0.4, bulk: 1, size: 'small', value: 8, wear: W(['feet'], 'main', 10), sold: CLOTHES }),
  D({ id: 'cap', name: 'cap', kind: 'clothing', weight: 0.1, bulk: 0.4, size: 'small', value: 5, wear: W(['head'], 'main', 5, 1), sold: CLOTHES }),
  D({ id: 'hood', name: 'hood', kind: 'clothing', weight: 0.3, bulk: 1, size: 'small', value: 8, wear: W(['head'], 'outer', 5, 2), sold: CLOTHES }),
  D({ id: 'hat', name: 'broad hat', kind: 'clothing', weight: 0.3, bulk: 3, size: 'medium', value: 12, wear: W(['head'], 'main', 5, 1), sold: CLOTHES }),
  D({ id: 'veil', name: 'veil', kind: 'clothing', weight: 0.1, bulk: 0.3, size: 'tiny', value: 10, wear: W(['face'], 'main', 10), sold: CLOTHES }),
  D({ id: 'scarf', name: 'scarf', kind: 'clothing', weight: 0.2, bulk: 0.5, size: 'small', value: 6, wear: W(['face'], 'outer', 5, 1), sold: CLOTHES }),
  D({ id: 'gloves', name: 'leather gloves', plural: 'leather gloves', kind: 'clothing', weight: 0.2, bulk: 0.5, size: 'small', value: 12, wear: W(['hands'], 'main', 10, 1), sold: CLOTHES }),
  D({ id: 'mittens', name: 'fur mittens', plural: 'fur mittens', kind: 'clothing', weight: 0.3, bulk: 1, size: 'small', value: 14, wear: W(['hands'], 'outer', 10, 3), sold: ['market'] }),
  D({ id: 'jacket', name: 'jacket', kind: 'clothing', weight: 1.2, bulk: 3, size: 'medium', value: 30, wear: W(['torso', 'arms'], 'outer', 20, 3), sold: CLOTHES }),
  D({ id: 'coat', name: 'wool coat', kind: 'clothing', weight: 2.2, bulk: 6, size: 'medium', value: 50, wear: W(['torso', 'arms', 'legs'], 'outer', 25, 5), sold: CLOTHES }),
  D({ id: 'cloak', name: 'cloak', kind: 'clothing', weight: 1.5, bulk: 4, size: 'medium', value: 25, wear: W(['torso', 'arms'], 'cloak', 10, 3), sold: CLOTHES }),
  D({ id: 'fur_cloak', name: 'fur cloak', kind: 'clothing', weight: 3, bulk: 8, size: 'medium', value: 90, wear: W(['torso', 'arms'], 'cloak', 10, 6), sold: ['market'] }),
  D({ id: 'belt', name: 'belt', kind: 'clothing', weight: 0.3, bulk: 0.5, size: 'small', value: 6, loops: 3, wear: W(['waist'], 'main', 10), sold: CLOTHES, about: 'Three things can hang from it.' }),
  D({ id: 'sword_belt', name: 'sword belt', kind: 'clothing', weight: 0.5, bulk: 0.8, size: 'small', value: 20, loops: 4, wear: W(['waist'], 'main', 15), sold: ['smithy', 'market'], about: 'A broad belt with a frog for a sword; four things can hang from it.' }),

  // ---- Armour -----------------------------------------------------------------------------------
  D({ id: 'padded_coat', name: 'padded coat', kind: 'armour', weight: 3, bulk: 8, size: 'medium', value: 60, wear: W(['torso', 'arms'], 'padding', 40, 4, 2), sold: ['smithy', 'market'], about: 'A quilted coat, armour on its own or padding under mail.' }),
  D({ id: 'leather_jerkin', name: 'leather jerkin', kind: 'armour', weight: 3, bulk: 5, size: 'medium', value: 70, wear: W(['torso'], 'armour', 40, 2, 3), sold: ['smithy', 'market'] }),
  D({ id: 'mail_shirt', name: 'mail shirt', kind: 'armour', weight: 11, bulk: 6, size: 'medium', value: 600, wear: W(['torso', 'arms'], 'armour', 90, 0, 6), sold: ['smithy'] }),
  D({ id: 'coif', name: 'padded coif', kind: 'armour', weight: 0.4, bulk: 1, size: 'small', value: 15, wear: W(['head'], 'padding', 10, 1, 1), sold: ['smithy'] }),
  D({ id: 'helm', name: 'helm', kind: 'armour', weight: 2, bulk: 5, size: 'medium', value: 120, wear: W(['head'], 'armour', 15, 0, 5), sold: ['smithy'] }),
  D({ id: 'bracers', name: 'leather bracers', plural: 'leather bracers', kind: 'armour', weight: 0.5, bulk: 1, size: 'small', value: 20, wear: W(['arms'], 'armour', 20, 0, 2), sold: ['smithy', 'market'] }),
  D({ id: 'gauntlets', name: 'gauntlets', plural: 'gauntlets', kind: 'armour', weight: 1.2, bulk: 2, size: 'small', value: 90, wear: W(['hands'], 'armour', 20, 1, 4), sold: ['smithy'] }),
  D({ id: 'greaves', name: 'greaves', plural: 'greaves', kind: 'armour', weight: 2.5, bulk: 3, size: 'medium', value: 110, wear: W(['legs'], 'armour', 40, 0, 4), sold: ['smithy'] }),

  // ---- Jewellery --------------------------------------------------------------------------------
  D({ id: 'earrings', name: 'earrings', plural: 'earrings', kind: 'jewellery', weight: 0.01, bulk: 0, size: 'tiny', value: 40, wear: J('ears'), durable: false, hands: undefined, sold: ['market'] }),
  D({ id: 'circlet', name: 'circlet', kind: 'jewellery', weight: 0.1, bulk: 0.2, size: 'small', value: 200, wear: J('brow'), durable: false }),
  D({ id: 'necklace', name: 'necklace', kind: 'jewellery', weight: 0.05, bulk: 0, size: 'tiny', value: 60, wear: J('neck'), durable: false, sold: ['market'] }),
  D({ id: 'amulet', name: 'amulet', kind: 'jewellery', weight: 0.05, bulk: 0, size: 'tiny', value: 30, wear: J('neck'), durable: false, sold: ['market', 'apothecary'] }),
  D({ id: 'prayer_beads', name: 'prayer beads', plural: 'prayer beads', kind: 'jewellery', weight: 0.05, bulk: 0.05, size: 'tiny', value: 5, wear: J('neck'), durable: false }),
  D({ id: 'brooch', name: 'cloak brooch', kind: 'jewellery', weight: 0.03, bulk: 0, size: 'tiny', value: 25, wear: J('brooch'), durable: false, sold: ['market'] }),
  D({ id: 'bracelet', name: 'bracelet', kind: 'jewellery', weight: 0.03, bulk: 0, size: 'tiny', value: 35, wear: J('wrists'), durable: false, sold: ['market'] }),
  D({ id: 'ring', name: 'ring', kind: 'jewellery', weight: 0.01, bulk: 0, size: 'tiny', value: 30, wear: J('fingers'), durable: false, sold: ['market'] }),
  D({ id: 'signet_ring', name: 'signet ring', kind: 'jewellery', weight: 0.02, bulk: 0, size: 'tiny', value: 120, wear: J('fingers'), durable: false }),
  D({ id: 'anklet', name: 'anklet', kind: 'jewellery', weight: 0.02, bulk: 0, size: 'tiny', value: 25, wear: J('ankles'), durable: false, sold: ['market'] }),

  // ---- Weapons ----------------------------------------------------------------------------------
  D({ id: 'knife', name: 'knife', kind: 'weapon', weight: 0.2, bulk: 0.2, size: 'small', value: 8, belt: true, sold: ['smithy', 'market'] }),
  D({ id: 'dagger', name: 'dagger', kind: 'weapon', weight: 0.4, bulk: 0.3, size: 'small', value: 30, belt: true, sold: ['smithy'] }),
  D({ id: 'sword', name: 'sword', kind: 'weapon', weight: 1.3, bulk: 2, size: 'large', value: 250, belt: true, back: true, sold: ['smithy'] }),
  D({ id: 'hatchet', name: 'hatchet', kind: 'weapon', weight: 1, bulk: 1, size: 'small', value: 15, belt: true, sold: ['smithy', 'market'] }),
  D({ id: 'axe', name: 'axe', kind: 'weapon', weight: 1.6, bulk: 2.5, size: 'large', value: 25, belt: true, strap: true, sold: ['smithy', 'market'] }),
  D({ id: 'spear', name: 'spear', kind: 'weapon', weight: 2.2, bulk: 4, size: 'huge', value: 25, back: true, strap: true, sold: ['smithy'], about: 'Too long for any pack: carried, slung or strapped to one.' }),
  D({ id: 'staff', name: 'staff', kind: 'weapon', weight: 1.5, bulk: 3, size: 'huge', value: 4, back: true, strap: true, sold: ['market'] }),
  D({ id: 'round_shield', name: 'round shield', kind: 'weapon', weight: 4, bulk: 12, size: 'large', value: 40, back: true, strap: true, sold: ['smithy'] }),
  D({ id: 'heater_shield', name: 'heater shield', kind: 'weapon', weight: 3.5, bulk: 10, size: 'large', value: 70, back: true, strap: true, sold: ['smithy'] }),
  D({ id: 'short_bow', name: 'short bow', kind: 'weapon', weight: 0.8, bulk: 3, size: 'large', value: 40, back: true, strap: true, belt: true, sold: ['market'], about: 'Short enough to hang from a belt in a bow case.' }),
  D({ id: 'hunting_bow', name: 'hunting bow', kind: 'weapon', weight: 1, bulk: 4, size: 'large', value: 60, back: true, strap: true, sold: ['market'] }),
  D({ id: 'arrows', name: 'arrow', plural: 'arrows', kind: 'weapon', weight: 0.04, bulk: 0.05, size: 'medium', value: 1, stack: 40, durable: false, sold: ['market'] }),

  // ---- Tools ------------------------------------------------------------------------------------
  D({ id: 'flint', name: 'flint and steel', plural: 'flint and steel', kind: 'tool', weight: 0.1, bulk: 0.1, size: 'tiny', value: 4, sold: GENERAL }),
  D({ id: 'sickle', name: 'sickle', kind: 'tool', weight: 0.5, bulk: 1, size: 'small', value: 8, belt: true, sold: ['smithy', 'market'] }),
  D({ id: 'hoe', name: 'hoe', kind: 'tool', weight: 1.5, bulk: 3, size: 'huge', value: 10, strap: true, sold: ['smithy', 'market'] }),
  D({ id: 'tool_roll', name: 'tool roll', kind: 'tool', weight: 2.5, bulk: 3, size: 'small', value: 60, sold: ['smithy'], about: 'A craftsman\'s tools rolled in leather.' }),
  D({ id: 'writing_kit', name: 'writing kit', kind: 'tool', weight: 0.5, bulk: 1, size: 'small', value: 30, about: 'Quills, ink, a knife and a little paper.' }),
  D({ id: 'lockpicks', name: 'lockpicks', plural: 'lockpicks', kind: 'tool', weight: 0.1, bulk: 0.1, size: 'tiny', value: 40 }),
  D({ id: 'scales', name: 'merchant\'s scales', plural: 'merchant\'s scales', kind: 'tool', weight: 1, bulk: 1.5, size: 'small', value: 50 }),
  D({ id: 'rope', name: 'rope (15 m)', kind: 'tool', weight: 3, bulk: 4, size: 'medium', value: 15, strap: true, sold: GENERAL }),
  D({ id: 'net', name: 'fishing net', kind: 'tool', weight: 2, bulk: 6, size: 'medium', value: 20, sold: ['market'] }),
  D({ id: 'snares', name: 'snare wire', plural: 'snare wires', kind: 'tool', weight: 0.1, bulk: 0.1, size: 'tiny', value: 3, stack: 10, sold: ['market'] }),
  D({ id: 'surgeon_kit', name: 'surgeon\'s kit', kind: 'tool', weight: 1.5, bulk: 2, size: 'small', value: 150, sold: ['apothecary'] }),
  D({ id: 'begging_bowl', name: 'begging bowl', kind: 'tool', weight: 0.3, bulk: 0.8, size: 'small', value: 1 }),
  D({ id: 'whistle', name: 'whistle', kind: 'tool', weight: 0.05, bulk: 0.05, size: 'tiny', value: 3 }),
  D({ id: 'blanket', name: 'wool blanket', kind: 'tool', weight: 2, bulk: 6, size: 'medium', value: 15, strap: true, sold: GENERAL, about: 'Rolled, it can be strapped to a pack.' }),
  D({ id: 'torch', name: 'torch', kind: 'light', weight: 0.5, bulk: 0.8, size: 'small', value: 1, uses: 6, useWord: 'hours', sold: GENERAL }),
  D({ id: 'candle', name: 'candle', kind: 'light', weight: 0.1, bulk: 0.1, size: 'tiny', value: 1, stack: 10, sold: GENERAL }),
  D({ id: 'waterskin', name: 'waterskin', kind: 'drink', weight: 1.2, bulk: 1.3, size: 'small', value: 6, belt: true, uses: 8, useWord: 'drinks', sold: GENERAL, about: 'Holds a litre of water: eight drinks.' }),

  // ---- Food and medicine ------------------------------------------------------------------------
  D({ id: 'bread', name: 'loaf of bread', plural: 'loaves of bread', kind: 'food', weight: 0.5, bulk: 1, size: 'small', value: 1, uses: 4, useWord: 'portions', stack: 6, durable: false, sold: ['market', 'bakery'] }),
  D({ id: 'cheese', name: 'cheese', kind: 'food', weight: 0.5, bulk: 0.5, size: 'small', value: 4, uses: 5, useWord: 'portions', stack: 4, durable: false, sold: ['market'] }),
  D({ id: 'dried_meat', name: 'dried meat', kind: 'food', weight: 0.3, bulk: 0.4, size: 'small', value: 4, uses: 3, useWord: 'portions', stack: 6, durable: false, sold: ['market', 'butcher'] }),
  D({ id: 'apple', name: 'apple', plural: 'apples', kind: 'food', weight: 0.15, bulk: 0.2, size: 'tiny', value: 1, stack: 12, durable: false, sold: ['market'] }),
  D({ id: 'bandages', name: 'bandage', plural: 'bandages', kind: 'medicine', weight: 0.05, bulk: 0.1, size: 'tiny', value: 1, stack: 20, durable: false, sold: ['apothecary', 'market'] }),
  D({ id: 'herbs', name: 'bundle of healing herbs', plural: 'bundles of healing herbs', kind: 'medicine', weight: 0.05, bulk: 0.2, size: 'tiny', value: 3, stack: 10, durable: false, sold: ['apothecary'] }),
  D({ id: 'potion', name: 'potion', plural: 'potions', kind: 'medicine', weight: 0.25, bulk: 0.2, size: 'tiny', value: 25, stack: 5, durable: false, sold: ['apothecary'], about: 'A stoppered flask of a remedy.' }),
  D({ id: 'reagents', name: 'reagents', plural: 'reagents', kind: 'goods', weight: 0.5, bulk: 0.6, size: 'small', value: 20, durable: false, sold: ['apothecary'] }),

  // ---- Goods, books and music -------------------------------------------------------------------
  D({ id: 'trade_goods', name: 'bundle of trade goods', plural: 'bundles of trade goods', kind: 'goods', weight: 8, bulk: 14, size: 'medium', value: 60, durable: false }),
  D({ id: 'ledger', name: 'ledger', kind: 'book', weight: 1, bulk: 1.5, size: 'small', value: 20 }),
  D({ id: 'book', name: 'book', kind: 'book', weight: 1, bulk: 1.5, size: 'small', value: 60 }),
  D({ id: 'holy_book', name: 'holy book', kind: 'book', weight: 1.5, bulk: 2, size: 'small', value: 80 }),
  D({ id: 'spell_book', name: 'spell book', kind: 'book', weight: 2, bulk: 2, size: 'medium', value: 300 }),
  D({ id: 'old_map', name: 'old map', kind: 'book', weight: 0.1, bulk: 0.2, size: 'small', value: 40 }),
  D({ id: 'sea_charts', name: 'sea charts', plural: 'sea charts', kind: 'book', weight: 0.3, bulk: 0.5, size: 'small', value: 120 }),
  D({ id: 'letter', name: 'letter', kind: 'book', weight: 0.01, bulk: 0, size: 'tiny', value: 0, durable: false }),
  D({ id: 'token', name: 'token', kind: 'goods', weight: 0.02, bulk: 0, size: 'tiny', value: 2, durable: false }),
  D({ id: 'pipe', name: 'pipe', kind: 'music', weight: 0.2, bulk: 0.3, size: 'small', value: 6, sold: ['market'] }),
  D({ id: 'lute', name: 'lute', kind: 'music', weight: 2, bulk: 12, size: 'large', value: 80, back: true, strap: true, sold: ['market'] }),
  D({ id: 'statue', name: 'stone statue', kind: 'goods', weight: 60, bulk: 30, size: 'huge', value: 400, hands: 2, about: 'You could lift it, just; you could not pack it.' }),
];

export const ITEM = new Map(ITEMS.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = ITEM.get(id);
  if (!d) throw new Error(`No item "${id}".`);
  return d;
}

/** Character creation's gear (actors/data/occupations.ts) as items: ids, a count, and a name if it is a special one. */
export const GEAR_ITEMS: Record<string, { id: string; qty?: number; name?: string; quality?: Quality }[]> = {
  spear: [{ id: 'spear' }], 'padded coat': [{ id: 'padded_coat' }], knife: [{ id: 'knife' }], 'round shield': [{ id: 'round_shield' }], 'mail shirt': [{ id: 'mail_shirt' }],
  sword: [{ id: 'sword' }, { id: 'sword_belt' }], 'heater shield': [{ id: 'heater_shield' }], helm: [{ id: 'helm' }], sickle: [{ id: 'sickle' }], 'tool roll': [{ id: 'tool_roll' }],
  'writing kit': [{ id: 'writing_kit' }], 'good clothes': [{ id: 'doublet', quality: 'fine' }, { id: 'hose', quality: 'fine' }], ledger: [{ id: 'ledger' }], robe: [{ id: 'robe' }],
  'prayer beads': [{ id: 'prayer_beads' }], staff: [{ id: 'staff' }], 'begging bowl': [{ id: 'begging_bowl' }], vestments: [{ id: 'vestments' }], 'holy book': [{ id: 'holy_book' }],
  'signet ring': [{ id: 'signet_ring' }], book: [{ id: 'book' }], books: [{ id: 'book', qty: 3 }], 'old map': [{ id: 'old_map' }], "scholar's gown": [{ id: 'scholar_gown' }],
  pack: [{ id: 'pack' }], 'trade goods': [{ id: 'trade_goods' }], scales: [{ id: 'scales' }], apron: [{ id: 'apron' }], "master's mark": [{ id: 'token', name: 'master\'s mark' }],
  blanket: [{ id: 'blanket' }], 'short bow': [{ id: 'short_bow' }], arrows: [{ id: 'quiver' }, { id: 'arrows', qty: 20 }], lockpicks: [{ id: 'lockpicks' }], 'guild token': [{ id: 'token', name: 'guild token' }],
  basket: [{ id: 'basket' }], snares: [{ id: 'snares', qty: 5 }], 'hunting bow': [{ id: 'hunting_bow' }], axe: [{ id: 'axe' }], rope: [{ id: 'rope' }], net: [{ id: 'net' }],
  'sea chest': [{ id: 'sea_chest' }], whistle: [{ id: 'whistle' }], 'sea charts': [{ id: 'sea_charts' }], pipe: [{ id: 'pipe' }], lute: [{ id: 'lute' }], costume: [{ id: 'costume' }],
  'fine lute': [{ id: 'lute', quality: 'fine' }], "patron's letter": [{ id: 'letter', name: 'patron\'s letter' }], 'herb satchel': [{ id: 'herb_satchel' }, { id: 'herbs', qty: 5 }],
  bandages: [{ id: 'bandages', qty: 6 }], "surgeon's kit": [{ id: 'surgeon_kit' }], 'medicine chest': [{ id: 'medicine_chest' }], hoe: [{ id: 'hoe' }],
  'spell book': [{ id: 'spell_book' }], reagents: [{ id: 'reagents' }], 'robes of the college': [{ id: 'college_robes' }],
  clothes: [], boots: [], cloak: [], 'flint and steel': [{ id: 'flint' }], waterskin: [{ id: 'waterskin' }], bread: [{ id: 'bread', qty: 2 }],
};

/** Animals in the gear lists: owned, led, not carried. */
export const GEAR_ANIMALS = new Set(['horse', 'mule', 'ox', 'hound']);

export const QUALITIES = ['poor', 'common', 'fine', 'masterwork'] as const;
export type Quality = (typeof QUALITIES)[number];
export const QUALITY_VALUE: Record<Quality, number> = { poor: 0.5, common: 1, fine: 2.5, masterwork: 6 };
