/**
 * The skill list (docs/design/skills.md): every person has every skill, most at 0. Levels run
 * from 0 to 100 (20 a beginner, 50 a journeyman, 75 a master). Languages, literacy and the
 * regional knowledge skills are held separately, one per language, realm, faith or region
 * (components/skills.ts).
 */
import type { Attribute } from './traits';

export type SkillGroup = 'Crafting' | 'Physical' | 'Social' | 'Knowledge' | 'Combat' | 'Magic';

export interface SkillDef {
  id: string;
  name: string;
  group: SkillGroup;
  /** Traits and senses that set its cap and help its checks. */
  traits: Attribute[];
  /** Cannot rise above this other skill (the specialist smiths). */
  under?: string;
  /** Cannot be used at all at level 0. */
  trained?: boolean;
}

const S = (group: SkillGroup, id: string, name: string, traits: Attribute[], o: Partial<SkillDef> = {}): SkillDef => ({ id, name, group, traits, ...o });

export const SKILLS: SkillDef[] = [
  S('Crafting', 'agriculture', 'Agriculture', ['constitution', 'wisdom']),
  S('Crafting', 'carpentry', 'Carpentry', ['strength', 'agility']),
  S('Crafting', 'masonry', 'Masonry', ['strength', 'intelligence']),
  S('Crafting', 'cooking', 'Cooking', ['wisdom', 'taste']),
  S('Crafting', 'alchemy', 'Alchemy', ['intelligence', 'wisdom']),
  S('Crafting', 'hideworking', 'Hideworking', ['agility', 'touch']),
  S('Crafting', 'tailoring', 'Tailoring', ['agility', 'touch']),
  S('Crafting', 'mining', 'Mining', ['strength', 'constitution']),
  S('Crafting', 'smithing', 'Smithing', ['strength', 'constitution']),
  S('Crafting', 'armorsmith', 'Armorsmith', ['strength', 'intelligence'], { under: 'smithing' }),
  S('Crafting', 'weaponsmith', 'Weaponsmith', ['strength', 'agility'], { under: 'smithing' }),
  S('Crafting', 'jewelsmith', 'Jewelsmith', ['agility', 'eyesight']),
  S('Crafting', 'artistry', 'Artistry', ['agility', 'wisdom']),
  S('Crafting', 'artificing', 'Artificing', ['intelligence', 'agility'], { trained: true }),
  S('Crafting', 'animals', 'Animal handling', ['wisdom', 'charm']),
  S('Physical', 'fishing', 'Fishing', ['wisdom', 'agility']),
  S('Physical', 'trapping', 'Trapping', ['intelligence', 'agility']),
  S('Physical', 'tracking', 'Tracking', ['wisdom', 'eyesight', 'smell']),
  S('Physical', 'survival', 'Survival', ['wisdom', 'constitution']),
  S('Physical', 'climbing', 'Climbing', ['strength', 'agility']),
  S('Physical', 'swimming', 'Swimming', ['constitution', 'strength']),
  S('Physical', 'sailing', 'Sailing', ['agility', 'wisdom'], { trained: true }),
  S('Physical', 'sneak', 'Sneak', ['agility', 'hearing']),
  S('Physical', 'athletics', 'Athletics', ['strength', 'constitution']),
  S('Physical', 'acrobatics', 'Acrobatics', ['agility']),
  S('Physical', 'disguise', 'Disguise', ['charm', 'aura']),
  S('Physical', 'sleight', 'Sleight of hand', ['agility', 'touch']),
  S('Physical', 'lockpicking', 'Lockpicking', ['agility', 'touch', 'intelligence'], { trained: true }),
  S('Physical', 'riding', 'Mount riding', ['agility', 'wisdom']),
  S('Social', 'persuasion', 'Persuasion', ['charm', 'gravitas', 'aura']),
  S('Social', 'trading', 'Trading', ['intelligence', 'charm']),
  S('Social', 'music', 'Musicianship', ['charm', 'hearing']),
  S('Social', 'dance', 'Dance', ['agility', 'charm']),
  S('Social', 'storytelling', 'Storytelling', ['charm', 'intelligence', 'aura']),
  S('Social', 'leadership', 'Leadership', ['gravitas', 'charm', 'willpower']),
  S('Knowledge', 'herbalism', 'Herbalism', ['wisdom', 'smell']),
  S('Knowledge', 'medicine', 'Medicine', ['intelligence', 'touch']),
  S('Knowledge', 'stewardship', 'Stewardship', ['intelligence', 'wisdom']),
  S('Knowledge', 'cartography', 'Cartography', ['intelligence', 'agility']),
  S('Combat', 'dodge', 'Dodge', ['agility']),
  S('Combat', 'shield', 'Shield', ['strength', 'agility']),
  S('Combat', 'shortblades', 'Short blades', ['agility']),
  S('Combat', 'longblades', 'Long blades', ['strength', 'agility']),
  S('Combat', 'clubs', 'Clubs', ['strength']),
  S('Combat', 'axes', 'Axes', ['strength']),
  S('Combat', 'polearms', 'Polearms', ['strength', 'agility']),
  S('Combat', 'throwing', 'Throwing', ['agility', 'eyesight']),
  S('Combat', 'archery', 'Archery', ['strength', 'agility', 'eyesight']),
  S('Combat', 'crossbow', 'Crossbow', ['strength', 'eyesight']),
  S('Combat', 'sling', 'Sling', ['agility', 'eyesight']),
  S('Combat', 'unarmed', 'Unarmed', ['strength', 'agility']),
  ...(['abjuration', 'conjuration', 'divination', 'evocation', 'illusion', 'necromancy', 'transmutation', 'enchantment'] as const).map((s) =>
    S('Magic', `spell.${s}`, `Spellcraft: ${s[0].toUpperCase()}${s.slice(1)}`, ['intelligence', 'willpower'], { trained: true }),
  ),
];

export const SKILL = new Map(SKILLS.map((s) => [s.id, s]));
export const SKILL_GROUPS: SkillGroup[] = ['Crafting', 'Physical', 'Social', 'Knowledge', 'Combat', 'Magic'];

/** The regional knowledge skills, held per realm, faith or region. */
export type KnowledgeKind = 'history' | 'law' | 'theology' | 'nature';
export const KNOWLEDGE: Record<KnowledgeKind, { name: string; traits: Attribute[] }> = {
  history: { name: 'History and heraldry', traits: ['intelligence'] },
  law: { name: 'Law', traits: ['intelligence', 'gravitas'] },
  theology: { name: 'Theology', traits: ['intelligence', 'wisdom'] },
  nature: { name: 'Nature lore', traits: ['wisdom', 'intelligence'] },
};

/** How a level reads in words. */
export function skillWord(v: number): string {
  if (v <= 0) return 'untrained';
  if (v < 10) return 'a smattering';
  if (v < 20) return 'novice';
  if (v < 35) return 'beginner';
  if (v < 50) return 'competent';
  if (v < 65) return 'journeyman';
  if (v < 75) return 'expert';
  if (v < 90) return 'master';
  return 'among the best';
}

/** Fluency in a language, in words. */
export function fluencyWord(v: number): string {
  if (v <= 0) return 'none';
  if (v < 20) return 'a few words';
  if (v < 50) return 'broken';
  if (v < 90) return 'fluent';
  return 'native';
}
