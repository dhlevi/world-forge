/**
 * The kinds of item (docs/design/characters.md, Carrying and inventory): what each weighs, how
 * much room it takes and how big it is, where it can be carried (hands, back, belt, inside
 * containers), what it holds if it is a container, where and in which layer it is worn, how many
 * uses it has, and what it is worth. Values are in copper at common quality.
 *
 * The items themselves are data, one JSON file per type in src/data/items/ (described by
 * item.schema.json there). This module holds the types, checks each file as it is registered, fills
 * in the defaults, and keeps the registry. Mods register more files the same way (app/mods.ts): an
 * item with a new id is added, and one with an existing id replaces it.
 *
 * Proposed numbers, to tune in play.
 */
import containers from '../../data/items/containers.json';
import clothing from '../../data/items/clothing.json';
import armour from '../../data/items/armour.json';
import jewellery from '../../data/items/jewellery.json';
import weapons from '../../data/items/weapons.json';
import tools from '../../data/items/tools.json';
import provisions from '../../data/items/provisions.json';
import goods from '../../data/items/goods.json';
import gear from '../../data/items/gear.json';
import { SKILL } from '../data/skills';

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
  /** Food and drink: what one use or portion gives (kcal 0 for a drink), and the words for it. */
  food?: { kcal: number; water?: number; verb: string };
  /** Books: reading teaches a skill, up to a level (actors/learning.ts). */
  teaches?: { skill: string; upTo: number };
  /** Mending when worn: the skill, and a kit that must be carried or things on the map to work beside (screens/inventory.ts). */
  mend?: { skill: string; kit?: string; at?: string[] };
  /** Wears with use (most things): has a condition. */
  durable?: boolean;
  /** Where it is sold (the city view's places: market, and shop roles). */
  sold?: string[];
  about?: string;
}

// ---- The registry --------------------------------------------------------------------------------

/** Every kind of item, in the order registered (the shop lists follow it). */
export const ITEMS: ItemDef[] = [];
export const ITEM = new Map<string, ItemDef>();

export function itemDef(id: string): ItemDef {
  const d = ITEM.get(id);
  if (!d) throw new Error(`No item "${id}".`);
  return d;
}

const KINDS: readonly ItemKind[] = ['clothing', 'armour', 'jewellery', 'container', 'weapon', 'tool', 'food', 'drink', 'medicine', 'light', 'goods', 'book', 'music'];
const FIELDS = new Set(['id', 'name', 'plural', 'kind', 'weight', 'bulk', 'size', 'value', 'hands', 'belt', 'back', 'strap', 'loops', 'wear', 'container', 'stack', 'uses', 'useWord', 'food', 'teaches', 'mend', 'durable', 'sold', 'about']);

/** What is wrong with one item as read from a file (empty when it is sound). */
export function checkItem(o: unknown): string[] {
  const bad: string[] = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) return ['not an object'];
  const r = o as Record<string, unknown>;
  const num = (k: string, v = r[k], min = 0) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min) bad.push(`${k} must be a number of at least ${min}`);
  };
  const opt = (k: string, test: (v: unknown) => boolean, want: string) => {
    if (r[k] !== undefined && !test(r[k])) bad.push(`${k} must be ${want}`);
  };
  const isBool = (v: unknown) => typeof v === 'boolean';
  const isInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 1;
  const isStrs = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  for (const k of Object.keys(r)) if (!FIELDS.has(k)) bad.push(`unknown field "${k}"`);
  if (typeof r.id !== 'string' || !/^[a-z0-9_]+$/.test(r.id)) bad.push('id must be lower case letters, digits and _');
  if (typeof r.name !== 'string' || !r.name) bad.push('name is needed');
  if (!KINDS.includes(r.kind as ItemKind)) bad.push(`kind must be one of ${KINDS.join(', ')}`);
  num('weight');
  num('bulk');
  num('value');
  if (!SIZES.includes(r.size as Size)) bad.push(`size must be one of ${SIZES.join(', ')}`);
  opt('plural', (v) => typeof v === 'string', 'text');
  opt('hands', (v) => v === 1 || v === 2, '1 or 2');
  for (const k of ['belt', 'back', 'strap', 'durable']) opt(k, isBool, 'true or false');
  for (const k of ['loops', 'stack', 'uses']) opt(k, isInt, 'a whole number of at least 1');
  opt('useWord', (v) => typeof v === 'string', 'text');
  opt('about', (v) => typeof v === 'string', 'text');
  opt('sold', isStrs, 'a list of places');
  const w = r.wear as Record<string, unknown> | undefined;
  if (w !== undefined) {
    if (!w || typeof w !== 'object') bad.push('wear must be an object');
    else {
      num('wear.seconds', w.seconds);
      const regions = w.regions as unknown[] | undefined;
      if (regions !== undefined && (!Array.isArray(regions) || !regions.length || !regions.every((x) => REGIONS.includes(x as Region)))) bad.push(`wear.regions must list some of ${REGIONS.join(', ')}`);
      if (w.layer !== undefined && !LAYERS.includes(w.layer as Layer)) bad.push(`wear.layer must be one of ${LAYERS.join(', ')}`);
      if (w.jewel !== undefined && !(String(w.jewel) in JEWEL_SLOTS)) bad.push(`wear.jewel must be one of ${Object.keys(JEWEL_SLOTS).join(', ')}`);
      if (!w.jewel && (!regions || !w.layer)) bad.push('wear needs regions and a layer, or a jewel slot');
      for (const k of ['warmth', 'armour']) if (w[k] !== undefined && typeof w[k] !== 'number') bad.push(`wear.${k} must be a number`);
    }
  }
  const c = r.container as Record<string, unknown> | undefined;
  if (c !== undefined) {
    if (!c || typeof c !== 'object') bad.push('container must be an object');
    else {
      num('container.litres', c.litres);
      num('container.maxKg', c.maxKg);
      if (!SIZES.includes(c.maxSize as Size)) bad.push(`container.maxSize must be one of ${SIZES.join(', ')}`);
      if (c.only !== undefined && !isStrs(c.only)) bad.push('container.only must be a list of item ids');
      if (c.straps !== undefined) num('container.straps', c.straps);
      if (c.strapKg !== undefined) num('container.strapKg', c.strapKg);
    }
  }
  const f = r.food as Record<string, unknown> | undefined;
  if (f !== undefined) {
    if (!f || typeof f !== 'object') bad.push('food must be an object');
    else {
      num('food.kcal', f.kcal);
      if (f.water !== undefined) num('food.water', f.water);
      if (typeof f.verb !== 'string') bad.push('food.verb is needed ("eat a piece of the bread")');
      if (r.uses === undefined && r.stack === undefined) bad.push('food needs uses or a stack to eat from');
    }
  }
  const t = r.teaches as Record<string, unknown> | undefined;
  if (t !== undefined) {
    if (!t || typeof t !== 'object' || typeof t.skill !== 'string') bad.push('teaches needs a skill');
    else if (typeof t.upTo !== 'number' || t.upTo < 1 || t.upTo > 50) bad.push('teaches.upTo must be a level from 1 to 50');
  }
  const m = r.mend as Record<string, unknown> | undefined;
  if (m !== undefined) {
    if (!m || typeof m !== 'object' || typeof m.skill !== 'string') bad.push('mend needs a skill');
    else {
      if (m.kit !== undefined && typeof m.kit !== 'string') bad.push('mend.kit must be an item id');
      if (m.at !== undefined && !isStrs(m.at)) bad.push('mend.at must be a list of things on the map');
    }
  }
  return bad;
}

/** The defaults a file may leave out. */
function withDefaults(o: ItemDef): ItemDef {
  return { durable: true, hands: 1, ...o };
}

/**
 * Registers a file's items (the game's own, or a mod's): each is checked; a sound one is added, or
 * replaces the item of the same id where it stood. Returns what was wrong, item by item.
 */
export function registerItems(list: unknown, source: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(list)) return [`${source}: "items" must be a list`];
  list.forEach((o, i) => {
    const bad = checkItem(o);
    const id = (o as { id?: unknown })?.id;
    if (bad.length) {
      errors.push(`${source}: item ${typeof id === 'string' ? `"${id}"` : i + 1}: ${bad.join('; ')}`);
      return;
    }
    const d = withDefaults(o as ItemDef);
    const old = ITEM.get(d.id);
    if (old) ITEMS[ITEMS.indexOf(old)] = d;
    else ITEMS.push(d);
    ITEM.set(d.id, d);
  });
  return errors;
}

/** Checks that every item a container names in "only" exists (after all files are in). */
export function checkReferences(): string[] {
  const errors: string[] = [];
  for (const d of ITEMS) for (const id of d.container?.only ?? []) if (!ITEM.has(id)) errors.push(`item "${d.id}": container.only names "${id}", which is not an item`);
  for (const d of ITEMS) {
    if (d.mend?.kit && !ITEM.has(d.mend.kit)) errors.push(`item "${d.id}": mend.kit names "${d.mend.kit}", which is not an item`);
    for (const sk of [d.mend?.skill, d.teaches?.skill]) if (sk && !SKILL.has(sk)) errors.push(`item "${d.id}": no skill "${sk}"`);
  }
  for (const [g, list] of Object.entries(GEAR_ITEMS)) for (const x of list) if (!ITEM.has(x.id)) errors.push(`gear "${g}": no item "${x.id}"`);
  return errors;
}

/** Character creation's gear (actors/data/occupations.ts) as items: ids, a count, and a name if it is a special one. */
export const GEAR_ITEMS: Record<string, { id: string; qty?: number; name?: string; quality?: Quality }[]> = {};

/** Animals in the gear lists: owned, led, not carried. */
export const GEAR_ANIMALS = new Set<string>();

/** Registers what occupations' gear becomes (gear.json, or a mod's file of the same form). */
export function registerGear(file: { gear?: Record<string, unknown>; animals?: unknown }, source: string): string[] {
  const errors: string[] = [];
  for (const [g, list] of Object.entries(file.gear ?? {})) {
    if (!Array.isArray(list) || !list.every((x) => x && typeof x.id === 'string' && (x.quality === undefined || QUALITIES.includes(x.quality)))) {
      errors.push(`${source}: gear "${g}" must be a list of { id, qty?, name?, quality? }`);
      continue;
    }
    GEAR_ITEMS[g] = list;
  }
  if (file.animals !== undefined) {
    if (!Array.isArray(file.animals)) errors.push(`${source}: "animals" must be a list`);
    else for (const a of file.animals) GEAR_ANIMALS.add(String(a));
  }
  return errors;
}

export const QUALITIES = ['poor', 'common', 'fine', 'masterwork'] as const;
export type Quality = (typeof QUALITIES)[number];
export const QUALITY_VALUE: Record<Quality, number> = { poor: 0.5, common: 1, fine: 2.5, masterwork: 6 };

// The game's own items. A fault in them is a fault in the game, so it stops it here.
const BUILT_IN: [string, { items: unknown[] }][] = [
  ['containers.json', containers], ['clothing.json', clothing], ['armour.json', armour], ['jewellery.json', jewellery],
  ['weapons.json', weapons], ['tools.json', tools], ['provisions.json', provisions], ['goods.json', goods],
];
const faults = BUILT_IN.flatMap(([f, file]) => registerItems(file.items, f));
faults.push(...registerGear(gear, 'gear.json'), ...checkReferences());
if (faults.length) throw new Error(`The item data has faults:\n${faults.join('\n')}`);
