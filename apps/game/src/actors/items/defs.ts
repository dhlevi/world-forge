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
import { WEAR_SHAPE } from '@worldforge/core/local/figures';
import clothing from '../../data/items/clothing.json';
import armour from '../../data/items/armour.json';
import jewellery from '../../data/items/jewellery.json';
import weapons from '../../data/items/weapons.json';
import tools from '../../data/items/tools.json';
import provisions from '../../data/items/provisions.json';
import goods from '../../data/items/goods.json';
import gear from '../../data/items/gear.json';
import { SKILL } from '../data/skills';
import { SPECIES, type Species } from '@worldforge/core/local/fauna';
import { FISH, fishKg } from '../data/fish';

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
  /** Keeping off rain, wind and a hot sun (0 to 1), and whether it stays warm when wet (wool, fur): actors/needs.ts. */
  rain?: number;
  wind?: number;
  sun?: number;
  wool?: boolean;
}

/**
 * Fighting with a thing hand to hand (docs/design/combat.md; game/combat.ts): the skill it is used
 * with, its reach (tiles), the seconds a blow takes, the harm of each blow it can make (severity
 * points before skill, strength and armour), and how well it parries (or, a shield, blocks).
 */
export interface MeleeDef {
  skill: string;
  reach: number;
  seconds: number;
  cut?: number;
  thrust?: number;
  bash?: number;
  parry?: number;
  block?: number;
  /** Wielded in both hands. */
  hands?: 1 | 2;
}

/**
 * Shooting with a thing (combat.md, stage 3; game/ranged.ts): the skill, the missile it shoots (an
 * item id), the range it is good to and the farthest it carries (tiles), the seconds a shot takes
 * (drawing, or loading a crossbow), the wound its missile makes and how bad, how deep it goes, and
 * the Strength it needs to draw well (a long bow).
 */
export interface RangedDef {
  skill: string;
  ammo: string;
  range: number;
  max: number;
  seconds: number;
  kind: 'cut' | 'stab' | 'bruise';
  sev: number;
  deep: number;
  strength?: number;
}

/**
 * Thrown well (combat.md, stage 3): the wound it makes, how bad, the range it is good to (tiles),
 * and the seconds a throw takes. Anything can be thrown; things without this are thrown as their
 * weight and edge allow (game/ranged.ts, `thrownOf`).
 */
export interface ThrowDef {
  kind: 'cut' | 'stab' | 'bruise';
  sev: number;
  range: number;
  seconds: number;
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
  /** Weapons (and things that serve as one): fighting with it hand to hand. */
  melee?: MeleeDef;
  /** Bows, crossbows and slings: shooting with it. */
  ranged?: RangedDef;
  /** Made (or fit) for throwing. */
  throw?: ThrowDef;
  /** Worn things: the shape it is drawn as on the figure (core local/figures.ts), and its cloth's colour ("#rrggbb"). */
  figure?: string;
  colour?: string;
  container?: ContainerDef;
  /** Things that come in many (arrows, coins of bread): the most in one stack. */
  stack?: number;
  /** Uses or portions in a full one, and what they are called. */
  uses?: number;
  useWord?: string;
  /** Food and drink: what one use or portion gives (kcal 0 for a drink), and the words for it. */
  food?: { kcal: number; water?: number; verb: string; raw?: boolean };
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
const FIELDS = new Set(['id', 'name', 'plural', 'kind', 'weight', 'bulk', 'size', 'value', 'hands', 'belt', 'back', 'strap', 'loops', 'wear', 'melee', 'ranged', 'throw', 'figure', 'colour', 'container', 'stack', 'uses', 'useWord', 'food', 'teaches', 'mend', 'durable', 'sold', 'about']);

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
  opt('figure', (v) => typeof v === 'string' && WEAR_SHAPE.has(v), `one of the figure shapes (${[...WEAR_SHAPE.keys()].join(', ')})`);
  opt('colour', (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v), 'a colour such as "#7a6a50"');
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
      for (const k of ['rain', 'wind', 'sun']) if (w[k] !== undefined && (typeof w[k] !== 'number' || (w[k] as number) < 0 || (w[k] as number) > 1)) bad.push(`wear.${k} must be from 0 to 1`);
      if (w.wool !== undefined && typeof w.wool !== 'boolean') bad.push('wear.wool must be true or false');
    }
  }
  const me = r.melee as Record<string, unknown> | undefined;
  if (me !== undefined) {
    if (!me || typeof me !== 'object') bad.push('melee must be an object');
    else {
      if (typeof me.skill !== 'string' || !SKILL.has(me.skill)) bad.push('melee.skill must be a skill id');
      if (!Number.isInteger(me.reach) || (me.reach as number) < 1 || (me.reach as number) > 3) bad.push('melee.reach must be 1, 2 or 3');
      num('melee.seconds', me.seconds, 0.3);
      for (const k of ['cut', 'thrust', 'bash', 'parry', 'block']) if (me[k] !== undefined) num(`melee.${k}`, me[k]);
      if (!me.cut && !me.thrust && !me.bash) bad.push('melee needs a cut, thrust or bash');
      if (me.hands !== undefined && me.hands !== 1 && me.hands !== 2) bad.push('melee.hands must be 1 or 2');
    }
  }
  const ra = r.ranged as Record<string, unknown> | undefined;
  if (ra !== undefined) {
    if (!ra || typeof ra !== 'object') bad.push('ranged must be an object');
    else {
      if (typeof ra.skill !== 'string' || !SKILL.has(ra.skill)) bad.push('ranged.skill must be a skill id');
      if (typeof ra.ammo !== 'string') bad.push('ranged.ammo must be an item id');
      for (const k of ['range', 'max', 'seconds', 'sev', 'deep']) num(`ranged.${k}`, ra[k]);
      if (!['cut', 'stab', 'bruise'].includes(ra.kind as string)) bad.push('ranged.kind must be cut, stab or bruise');
      if (ra.strength !== undefined) num('ranged.strength', ra.strength);
    }
  }
  const th = r.throw as Record<string, unknown> | undefined;
  if (th !== undefined) {
    if (!th || typeof th !== 'object') bad.push('throw must be an object');
    else {
      for (const k of ['range', 'seconds', 'sev']) num(`throw.${k}`, th[k]);
      if (!['cut', 'stab', 'bruise'].includes(th.kind as string)) bad.push('throw.kind must be cut, stab or bruise');
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
      if (f.raw !== undefined && typeof f.raw !== 'boolean') bad.push('food.raw must be true or false');
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
    if (d.ranged && !ITEM.has(d.ranged.ammo)) errors.push(`item "${d.id}": ranged.ammo names "${d.ranged.ammo}", which is not an item`);
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
/** A beast's skin by its kind: the furred ones give a pelt. */
const PELT = /fox|wolf|bear|lynx|hare|rabbit|badger|squirrel|beaver|otter|marten|sable|mink|ermine|cat|lion|tiger|leopard|seal|wolverine|hyena/;
/** A skin's weight (kg) by the beast's size; its worth much the same for now (to be priced by the economy). */
const HIDE_KG = { tiny: 0.1, small: 0.4, medium: 2.5, large: 7, huge: 20 } as const;
const HIDE_VALUE = { tiny: 3, small: 4, medium: 6, large: 7, huge: 8 } as const;

/** The item id of a beast's hide or pelt (fieldcraft.md, stage 2). */
export const hideId = (s: Species): string => `${PELT.test(s.id) ? 'pelt' : 'hide'}_${s.id}`;

/** A hide or pelt for each beast that gives one: its own item, named and weighted for the beast. */
function beastHides(): unknown[] {
  return SPECIES.filter((s) => s.yields.some(([id]) => id === 'hide')).map((s) => {
    const pelt = PELT.test(s.id);
    return {
      id: hideId(s), name: `${s.name} ${pelt ? 'pelt' : 'hide'}`, plural: `${s.name} ${pelt ? 'pelts' : 'hides'}`, kind: 'goods',
      weight: HIDE_KG[s.size], bulk: Math.max(0.3, Math.round(HIDE_KG[s.size] * 2 * 10) / 10), size: s.size === 'huge' ? 'large' : s.size === 'large' ? 'medium' : 'small',
      value: HIDE_VALUE[s.size], durable: false,
      about: `The ${pelt ? 'pelt' : 'hide'} of a ${s.name}, untanned and scraped clean. A ${pelt ? 'furrier' : 'tanner'} pays for good ones.`,
    };
  });
}

/** Kilocalories in a portion of fish (about a third of a kilogram), raw or roast. */
const FISH_PORTION_KG = 0.35, FISH_KCAL = 200, ROAST_FISH_KCAL = 230;

/** The item ids of a fish: as caught, gutted, and roast (fieldcraft.md, stage 4). */
export const fishIds = (id: string) => ({ raw: `fish_${id}`, gutted: `gutted_${id}`, roast: `roast_${id}` });

/** Portions in a fish of a weight (kg). */
export const fishPortions = (kg: number): number => Math.max(1, Math.round(kg / FISH_PORTION_KG));

/** Each fish its own items: as caught, gutted, and roast, weighed and portioned by its size. */
function fishItems(): unknown[] {
  return FISH.flatMap((f) => {
    const kg = fishKg(f), ids = fishIds(f.id), uses = fishPortions(kg);
    const size = kg < 0.3 ? 'tiny' : kg < 2 ? 'small' : 'medium';
    const base = { kind: 'food', uses, useWord: 'portions', size, durable: false, bulk: Math.max(0.2, Math.round(kg * 1.5 * 10) / 10) };
    const value = Math.max(1, Math.round(1 + kg));
    return [
      { ...base, id: ids.raw, name: f.name, plural: f.plural, weight: kg, value, sold: ['market'], food: { kcal: FISH_KCAL, verb: `eat some of the ${f.name}`, raw: true }, about: `A ${f.name}, as it came from the water. Gut it before you roast it.` },
      { ...base, id: ids.gutted, name: `gutted ${f.name}`, plural: `gutted ${f.plural}`, weight: Math.round(kg * 0.85 * 100) / 100, value, food: { kcal: FISH_KCAL, verb: `eat some of the ${f.name}`, raw: true }, about: `A ${f.name}, gutted and cleaned, ready for the fire.` },
      { ...base, id: ids.roast, name: `roast ${f.name}`, plural: `roast ${f.plural}`, weight: Math.round(kg * 0.75 * 100) / 100, value: value + 1, food: { kcal: ROAST_FISH_KCAL, verb: `eat some of the roast ${f.name}` }, about: `A ${f.name} roasted over a fire.` },
    ];
  });
}

const faults = [...BUILT_IN.flatMap(([f, file]) => registerItems(file.items, f)), ...registerItems(beastHides(), 'the beasts\' hides'), ...registerItems(fishItems(), 'the fish')];
faults.push(...registerGear(gear, 'gear.json'), ...checkReferences());
if (faults.length) throw new Error(`The item data has faults:\n${faults.join('\n')}`);
