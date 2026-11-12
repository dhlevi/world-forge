/**
 * The fate cards (docs/design/creation.md, The cards): a deck of the game's own in the manner of
 * the major arcana, drawn upright or reversed into four positions. Each card leans each position
 * its own way: Birth (standing), Hearth (family), Path (occupation), Omen (a mark on the future).
 * Proposed.
 */
import type { StandingId } from '../components';
import type { TrackId } from './occupations';
import type { TraitId } from './traits';

export interface FateCard {
  id: string;
  name: string;
  /** What it means upright and reversed. */
  upright: string;
  reversed: string;
  /** Birth: the standing it gives upright (reversed: a family fallen from it). */
  standing: StandingId;
  /** Hearth and Omen: the trait it touches. */
  trait: TraitId;
  /** Path: the track it leans toward. */
  track: TrackId;
  /** Omen: what it foretells upright and reversed. */
  omenUp: string;
  omenDown: string;
}

const C = (id: string, name: string, upright: string, reversed: string, standing: StandingId, trait: TraitId, track: TrackId, omenUp: string, omenDown: string): FateCard =>
  ({ id, name, upright, reversed, standing, trait, track, omenUp, omenDown });

export const DECK: FateCard[] = [
  C('wanderer', 'The Wanderer', 'beginnings, the open road', 'recklessness, a road without end', 'peasant', 'agility', 'trades', 'A long road lies ahead, and it will be kind.', 'You will never be long in one place.'),
  C('hearth', 'The Hearth', 'home, kin, warmth', 'a cold house, kin estranged', 'townsfolk', 'charm', 'farming', 'You will be welcomed where you go.', 'Home will call you back, and it will not be as you left it.'),
  C('crown', 'The Crown', 'rule, birthright', 'a fall from high places', 'noble', 'gravitas', 'civil', 'Others will follow where you lead.', 'An old claim will come looking for you.'),
  C('tower', 'The Tower', 'sudden upheaval', 'disaster held off, for now', 'minor', 'willpower', 'military', 'What falls will make room for you.', 'A ruin in your past is not finished with you.'),
  C('star', 'The Star', 'hope, guidance', 'lost faith, a dimmed light', 'clergy', 'wisdom', 'religion', 'A light will show the way when it is darkest.', 'You will doubt what you were taught.'),
  C('moon', 'The Moon', 'dreams, secrets', 'deceit uncovered', 'townsfolk', 'aura', 'thief', 'You will see what others hide.', 'Someone close keeps a secret from you.'),
  C('sun', 'The Sun', 'health, plenty', 'pride, a burning', 'merchant', 'constitution', 'trades', 'You will be hale where others sicken.', 'Success will make you enemies.'),
  C('wheel', 'The Wheel', 'fortune turning', 'ill luck', 'merchant', 'intelligence', 'trades', 'Fortune will favour you.', 'Fortune has not finished testing you.'),
  C('sword', 'The Sword', 'strife, courage', 'cruelty, a broken blade', 'minor', 'strength', 'military', 'You will win a fight others think lost.', 'A blood debt follows you.'),
  C('plough', 'The Plough', 'toil, the harvest', 'famine, a barren year', 'peasant', 'constitution', 'farming', 'Your labour will bear fruit.', 'Lean years are coming.'),
  C('ship', 'The Ship', 'voyages, far shores', 'shipwreck, being stranded', 'townsfolk', 'agility', 'seafaring', 'The sea will carry you to fortune.', 'The water owes you a death.'),
  C('wolf', 'The Wolf', 'the wild, the hunt', 'the hunted, hunger', 'peasant', 'wisdom', 'woodland', 'The wild will feed you.', 'Something hunts you.'),
  C('raven', 'The Raven', 'tidings, memory', 'ill news, forgetting', 'clergy', 'intelligence', 'academia', 'You will learn what was lost.', 'A letter will bring ill news.'),
  C('scales', 'The Scales', 'justice, balance', 'a crooked judgement', 'townsfolk', 'gravitas', 'civil', 'A just cause will find you.', 'You will be judged unjustly.'),
  C('lamp', 'The Lamp', 'learning, patience', 'learning hoarded, a lamp gone out', 'clergy', 'intelligence', 'academia', 'A teacher will find you.', 'Knowledge will cost you dearly.'),
  C('mask', 'The Mask', 'play, disguise', 'a face that will not come off', 'townsfolk', 'charm', 'performance', 'You will be welcome in any hall.', 'You will be taken for someone else.'),
  C('forge', 'The Forge', 'making, mastery', 'a flawed work', 'craftsman', 'strength', 'craft', 'Your hands will make your name.', 'A thing you made will come back to harm you.'),
  C('chalice', 'The Chalice', 'healing, mercy', 'poison, a cup refused', 'clergy', 'wisdom', 'healing', 'You will save a life that matters.', 'A cup offered in friendship holds poison.'),
  C('serpent', 'The Serpent', 'cunning, hidden ways', 'betrayal', 'townsfolk', 'aura', 'outlaw', 'Your cunning will save you.', 'A friend will betray you.'),
  C('oak', 'The Oak', 'endurance, roots', 'stubbornness, a fallen tree', 'peasant', 'constitution', 'woodland', 'You will outlast your troubles.', 'Your roots will be torn up.'),
  C('bones', 'The Bones', 'death, ending, what remains', 'a death cheated', 'peasant', 'willpower', 'outlaw', 'Death will pass you by once.', 'You walk with the dead more than you know.'),
  C('weaver', 'The Weaver', 'fate, the pattern', 'tangled threads', 'craftsman', 'intelligence', 'magic', 'You have a part in something greater.', 'A prophecy has your name in it, and it is not kind.'),
];

export const CARD = new Map(DECK.map((c) => [c.id, c]));

export const POSITIONS = ['birth', 'hearth', 'path', 'omen'] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_INFO: Record<Position, { name: string; about: string }> = {
  birth: { name: 'Birth', about: 'Origin and standing' },
  hearth: { name: 'Hearth', about: 'Family and upbringing' },
  path: { name: 'Path', about: 'The life it leans toward' },
  omen: { name: 'Omen', about: 'A mark on the future' },
};
