/**
 * Traits and senses (docs/design/characters.md): 1 to 20, 10 the human average.
 */

export const TRAITS = ['intelligence', 'wisdom', 'willpower', 'strength', 'constitution', 'agility', 'charm', 'gravitas', 'aura'] as const;
export type TraitId = (typeof TRAITS)[number];

export const SENSES = ['eyesight', 'hearing', 'smell', 'taste', 'touch'] as const;
export type SenseId = (typeof SENSES)[number];

/** A trait or a sense: what skills name as governing them. */
export type Attribute = TraitId | SenseId;

export const TRAIT_GROUPS: { name: string; traits: TraitId[] }[] = [
  { name: 'Mental', traits: ['intelligence', 'wisdom', 'willpower'] },
  { name: 'Physical', traits: ['strength', 'constitution', 'agility'] },
  { name: 'Personality', traits: ['charm', 'gravitas', 'aura'] },
];

export const PHYSICAL: TraitId[] = ['strength', 'constitution', 'agility'];

export const TRAIT_INFO: Record<Attribute, { name: string; about: string }> = {
  intelligence: { name: 'Intelligence', about: 'Learning, languages, reading, complex crafts, memory' },
  wisdom: { name: 'Wisdom', about: 'Judgement and intuition: reading people and places, herb lore, healing' },
  willpower: { name: 'Willpower', about: 'The mental pools; resisting pain, fear, temptation and addiction' },
  strength: { name: 'Strength', about: 'Force and damage, lifting and carrying, the physical burst pool' },
  constitution: { name: 'Constitution', about: 'The physical day pool, blood and recovery; resisting disease, cold and hunger' },
  agility: { name: 'Agility', about: 'Speed, balance, dodging, fine and quick movement' },
  charm: { name: 'Charm', about: 'Being liked: persuasion, bargaining, performance, friendship' },
  gravitas: { name: 'Gravitas', about: 'Being taken seriously: authority, command, intimidation' },
  aura: { name: 'Aura', about: 'Social perception and grace: reading subtext, tact, knowing what not to say' },
  eyesight: { name: 'Eyesight', about: 'Seeing far and in poor light, noticing details, aiming' },
  hearing: { name: 'Hearing', about: 'Hearing what is out of sight, being heard, overheard talk' },
  smell: { name: 'Smell', about: 'Tracking, smoke, rot, animals' },
  taste: { name: 'Taste', about: 'Cooking and brewing, noticing poison or spoilage' },
  touch: { name: 'Touch', about: 'Fine work, locks, stitching, working in the dark' },
};

/** How a value reads in words (for the hardcore realism mode, and alongside numbers). */
export function traitWord(v: number): string {
  if (v <= 3) return 'wretched';
  if (v <= 5) return 'very poor';
  if (v <= 7) return 'poor';
  if (v <= 9) return 'below average';
  if (v <= 11) return 'average';
  if (v <= 13) return 'good';
  if (v <= 15) return 'very good';
  if (v <= 17) return 'excellent';
  return 'remarkable';
}

/** Values allowed at creation. */
export const TRAIT_MIN = 3;
export const TRAIT_MAX = 18;
/** Points to spend on traits at creation, and how far a trait may move from its base. */
export const TRAIT_BUDGET = 8;
export const TRAIT_SPREAD = 4;
