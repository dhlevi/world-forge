/**
 * How a people builds: the walls, the roof covering and the roof's form of its houses, by culture
 * template, for the isometric exterior (interiors/render.ts). Halls of stone (keeps, temples,
 * warehouses, monastic ranges) keep stone walls everywhere, under their people's roof.
 */
export type WallMat = 'timber' | 'stone' | 'plaster' | 'whitewash' | 'adobe' | 'log' | 'plank' | 'turf' | 'brick';
export type RoofMat = 'thatch' | 'tile' | 'slate' | 'shingle' | 'turf' | 'pantile' | 'glazed' | 'palm' | 'bark' | 'greenslate' | 'mud';
/** plain: as the building's kind has it; steep or low: a steeper or gentler pitch; flat: a flat roof behind a parapet; upturned: eaves curving up at the corners. */
export type RoofForm = 'plain' | 'steep' | 'low' | 'flat' | 'upturned';

export interface BuildStyle {
  wall: WallMat;
  roof: RoofMat;
  form: RoofForm;
  /** Wall colour: lit and shaded. */
  colour?: [string, string];
}

type Rule = { wall: WallMat; roof: RoofMat; form: RoofForm; colour?: [string, string]; cottage?: Partial<BuildStyle> };

const RULES: Record<string, Rule> = {
  anglo: { wall: 'timber', roof: 'tile', form: 'plain', cottage: { wall: 'plaster', roof: 'thatch' } },
  german: { wall: 'timber', roof: 'tile', form: 'steep', cottage: { roof: 'thatch' } },
  norse: { wall: 'plank', roof: 'turf', form: 'steep', colour: ['#a2805c', '#7b5e42'] },
  celtic: { wall: 'stone', roof: 'thatch', form: 'steep', colour: ['#cfc6b4', '#a89f8c'] },
  latin: { wall: 'plaster', roof: 'tile', form: 'low', colour: ['#ecd3a4', '#c9ab78'] },
  southern: { wall: 'whitewash', roof: 'pantile', form: 'low', colour: ['#f6f2e8', '#d6d0c2'] },
  slavic: { wall: 'log', roof: 'shingle', form: 'steep', colour: ['#b08a5f', '#86663f'] },
  desert: { wall: 'adobe', roof: 'mud', form: 'flat', colour: ['#e6caa0', '#c4a57a'] },
  sahelian: { wall: 'adobe', roof: 'mud', form: 'flat', colour: ['#d9a77c', '#b4825a'] },
  zanji: { wall: 'whitewash', roof: 'mud', form: 'flat', colour: ['#f2ede0', '#d2cbbb'] },
  indic: { wall: 'plaster', roof: 'mud', form: 'flat', colour: ['#efc9a8', '#cda382'] },
  steppe: { wall: 'adobe', roof: 'mud', form: 'flat', colour: ['#dccaa6', '#b9a580'] },
  sinic: { wall: 'brick', roof: 'glazed', form: 'upturned', colour: ['#c9c3b8', '#a49d91'] },
  japonic: { wall: 'plank', roof: 'glazed', form: 'upturned', colour: ['#a58c6c', '#7d6850'] },
  koreanic: { wall: 'plaster', roof: 'glazed', form: 'upturned', colour: ['#f1ece0', '#cfc8b8'] },
  elvish: { wall: 'stone', roof: 'greenslate', form: 'steep', colour: ['#e9e6dc', '#c6c2b4'] },
  dwarven: { wall: 'stone', roof: 'slate', form: 'low', colour: ['#b9b2a6', '#958e82'] },
  halfling: { wall: 'plaster', roof: 'thatch', form: 'plain', colour: ['#f0e2c0', '#cdbd98'] },
  orcish: { wall: 'log', roof: 'bark', form: 'low', colour: ['#94775a', '#6f5741'] },
  jungle: { wall: 'plaster', roof: 'palm', form: 'steep', colour: ['#ece4d0', '#c9c0aa'] },
  highland: { wall: 'stone', roof: 'thatch', form: 'steep', colour: ['#c9bba2', '#a5977e'] },
  woodland: { wall: 'plank', roof: 'bark', form: 'plain', colour: ['#a68a68', '#7e6a4e'] },
  islander: { wall: 'plank', roof: 'palm', form: 'steep', colour: ['#b8a07c', '#8f7a5a'] },
  lizardfolk: { wall: 'adobe', roof: 'palm', form: 'steep', colour: ['#b9a27d', '#94805e'] },
};

/** Kinds built of stone whoever builds them. */
const STONE = new Set(['keep', 'temple', 'warehouse', 'range', 'tower', 'bank', 'shrine', 'civic', 'university', 'library']);
/** Kinds that take the cottage variant (the smaller, poorer houses). */
const COTTAGE = new Set(['cottage', 'farmhouse', 'cabin', 'hut', 'witch']);

/** The style a building of `kind` takes among a people of template `culture` (none: the old defaults). */
export function buildStyle(culture: string | undefined, kind: string): BuildStyle | null {
  if (kind === 'burrow') return { wall: 'turf', roof: 'turf', form: 'plain', colour: ['#a8b77c', '#82925a'] };
  const r = culture ? RULES[culture] : undefined;
  if (!r) return null;
  const base: BuildStyle = { wall: r.wall, roof: r.roof, form: r.form, colour: r.colour };
  if (COTTAGE.has(kind) && r.cottage) Object.assign(base, r.cottage);
  if (STONE.has(kind)) {
    base.wall = 'stone';
    base.colour = undefined;
    // Flat-roofed peoples still roof their temples and halls (warehouses and keeps stay flat).
    if (base.form === 'flat' && kind !== 'keep' && kind !== 'warehouse') base.form = 'low';
  }
  return base;
}
