/**
 * The fish (docs/design/fieldcraft.md, stage 4): what each water holds, by whether it is fresh or
 * salt, river, lake or shore, and the climate. Each is an item of its own, raw, gutted and roast
 * (actors/items/defs.ts), weighed by its size.
 */

export type FishWater = 'river' | 'lake' | 'shore';
export type FishClimate = 'cold' | 'temperate' | 'warm';

export interface Fish {
  id: string;
  name: string;
  plural: string;
  /** The waters it is found in, and the climates. */
  waters: FishWater[];
  climates: FishClimate[];
  /** Its weight as caught (kg): least and most. */
  kg: [number, number];
  /** How common it is where it lives (a weight among the others there). */
  common: number;
  /** Bites best at night (an eel); else at dawn and dusk. */
  night?: boolean;
  /** Found in the shallows, where a spear can take it. */
  shallows?: boolean;
  /** Takes a line baited with meat or guts (a hunter of other fish), rather than worms. */
  hunter?: boolean;
}

const F = (id: string, name: string, plural: string, waters: FishWater[], climates: FishClimate[], kg: [number, number], common: number, o: Partial<Fish> = {}): Fish => ({ id, name, plural, waters, climates, kg, common, ...o });

export const FISH: readonly Fish[] = [
  // Fresh water: rivers and lakes.
  F('trout', 'trout', 'trout', ['river', 'lake'], ['cold', 'temperate'], [0.3, 2], 5, { shallows: true }),
  F('grayling', 'grayling', 'grayling', ['river'], ['cold', 'temperate'], [0.3, 1.2], 3, { shallows: true }),
  F('salmon', 'salmon', 'salmon', ['river'], ['cold', 'temperate'], [3, 10], 1, { shallows: true }),
  F('char', 'char', 'char', ['lake'], ['cold'], [0.4, 2.5], 3),
  F('pike', 'pike', 'pike', ['river', 'lake'], ['cold', 'temperate'], [1, 8], 2, { hunter: true }),
  F('perch', 'perch', 'perch', ['river', 'lake'], ['cold', 'temperate', 'warm'], [0.1, 0.8], 6),
  F('roach', 'roach', 'roach', ['river', 'lake'], ['temperate'], [0.1, 0.5], 6, { shallows: true }),
  F('bream', 'bream', 'bream', ['lake', 'river'], ['temperate', 'warm'], [0.5, 3], 4),
  F('tench', 'tench', 'tench', ['lake'], ['temperate'], [0.5, 2.5], 3, { shallows: true }),
  F('carp', 'carp', 'carp', ['lake', 'river'], ['temperate', 'warm'], [1, 8], 3),
  F('barbel', 'barbel', 'barbel', ['river'], ['temperate', 'warm'], [0.8, 4], 3, { shallows: true }),
  F('eel', 'eel', 'eels', ['river', 'lake'], ['temperate', 'warm'], [0.3, 2], 3, { night: true, hunter: true }),
  F('catfish', 'catfish', 'catfish', ['river', 'lake'], ['warm'], [1, 15], 2, { night: true, hunter: true }),
  F('tilapia', 'tilapia', 'tilapia', ['lake', 'river'], ['warm'], [0.3, 1.5], 5, { shallows: true }),
  // The sea's shore.
  F('cod', 'cod', 'cod', ['shore'], ['cold', 'temperate'], [1, 8], 4, { hunter: true }),
  F('haddock', 'haddock', 'haddock', ['shore'], ['cold', 'temperate'], [0.5, 2], 3),
  F('herring', 'herring', 'herring', ['shore'], ['cold', 'temperate'], [0.1, 0.4], 5),
  F('mackerel', 'mackerel', 'mackerel', ['shore'], ['temperate', 'warm'], [0.2, 1], 5, { hunter: true }),
  F('plaice', 'plaice', 'plaice', ['shore'], ['cold', 'temperate'], [0.3, 2], 4, { shallows: true }),
  F('bass', 'sea bass', 'sea bass', ['shore'], ['temperate', 'warm'], [0.5, 4], 3, { hunter: true }),
  F('mullet', 'grey mullet', 'grey mullet', ['shore'], ['temperate', 'warm'], [0.5, 3], 3, { shallows: true }),
  F('sea_bream', 'sea bream', 'sea bream', ['shore'], ['warm'], [0.3, 2], 4),
  F('sardine', 'sardine', 'sardines', ['shore'], ['warm'], [0.05, 0.15], 5),
];

export const FISH_BY_ID = new Map(FISH.map((f) => [f.id, f]));

/** A fish's middling weight (kg), for its item. */
export const fishKg = (f: Fish): number => Math.round(Math.sqrt(f.kg[0] * f.kg[1]) * 100) / 100;
