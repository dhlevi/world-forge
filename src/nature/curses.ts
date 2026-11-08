import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { CurseHeart } from '../gen/special';

/**
 * Curses: the kinds there are, how they come about, what they do (to a land, a person, a
 * bloodline, a place or a thing), the signs that give them away and how they may be lifted. The
 * world's cursed lands (gen/special.ts) are each read as a curse of one kind from their story;
 * a region also hears rumours of lesser curses.
 */

export type CurseTarget = 'land' | 'person' | 'bloodline' | 'place' | 'item';
export interface CurseType {
  id: string;
  name: string;
  targets: CurseTarget[];
  /** How it comes about. */
  sources: string[];
  /** What it does (with game effects in brackets). */
  effects: string[];
  signs: string[];
  /** Ways to lift it, from easiest to hardest. */
  lifting: string[];
  /** 1 (a nuisance) to 5 (a doom). */
  severity: number;
}

const C = (id: string, name: string, targets: CurseTarget[], severity: number, sources: string[], effects: string[], signs: string[], lifting: string[]): CurseType => ({ id, name, targets, severity, sources, effects, signs, lifting });

export const CURSE_TYPES: CurseType[] = [
  C('blight', 'The Withering', ['land', 'place'], 4, ['a witch\'s dying words', 'a broken oath to the old gods', 'poison from a slain wyrm'],
    ['crops fail and trees die where they stand (no food can be foraged; healing herbs do not grow)', 'the land spreads its blight a little every year', 'animals are born sickly or not at all'],
    ['grey, leafless trees that do not fall', 'silence: no birds, no insects', 'a smell of old ashes'],
    ['make good the wrong at the curse\'s heart', 'consecrate the heart with the rites of the faith that was slighted', 'burn the heart and salt its ground (the land dies, but the spread stops)']),
  C('restless-dead', 'The Unquiet Grave', ['land', 'place', 'bloodline'], 3, ['necromancy gone wrong', 'the dead left unburied after a massacre', 'a desecrated tomb'],
    ['the dead rise on moonless nights and walk to the places they knew (undead encounters at night)', 'graves are found open in the morning', 'the cursed family hears its dead calling'],
    ['disturbed earth in the graveyard', 'cold spots and the smell of grave-soil', 'dogs will not cross the threshold'],
    ['give the dead their proper rites', 'return what was taken from the tomb', 'destroy the one who raised them']),
  C('lycanthropy', 'The Wolf\'s Bite', ['person', 'bloodline'], 4, ['the bite of a werewolf', 'eating the meat of a beast killed by a werewolf', 'a curse laid on a hunter who slew a sacred wolf'],
    ['changes into a beast at the full moon and hunts (loses control on full-moon nights)', 'grows stronger and faster, but silver burns (harmed by silver)', 'passes the curse with a bite'],
    ['hair on the palms; eyebrows that meet', 'wounds that heal too quickly', 'livestock missing after the full moon'],
    ['wolfsbane taken before the first change', 'slay the werewolf that gave the bite before the third full moon', 'a blessing at a holy spring on midsummer night']),
  C('ill-luck', 'The Evil Eye', ['person', 'bloodline'], 1, ['the glance of one with the evil eye', 'a slight to a beggar who was more than a beggar', 'breaking a mirror in a holy place'],
    ['things go wrong: milk sours, tools break, journeys meet storms (the worse of two rolls on luck)', 'friends grow cold'],
    ['a run of small misfortunes', 'black cats crossing the path'],
    ['a blue-glass charm against the eye', 'a cunning woman\'s egg cleansing', 'a gift freely given to the one who laid it']),
  C('wasting', 'The Wasting', ['person', 'bloodline'], 3, ['a wax image pierced with pins', 'a hag\'s revenge', 'stolen grave-goods'],
    ['the cursed grows thin and weak however much they eat (strength fades week by week)', 'no physician can find the cause'],
    ['a hollow look and grey skin', 'hair turning white early', 'a little doll hidden somewhere close'],
    ['find and burn the image that was made', 'return the stolen thing to its grave', 'take the curse onto a willing other']),
  C('silence', 'The Stolen Voice', ['person', 'place'], 2, ['a spirit offended by song', 'a bargain with the fey', 'a lie told under oath'],
    ['the cursed cannot speak, or every word they speak is a lie (no speech, or no truth)', 'in a cursed place, no sound carries'],
    ['a mouth that moves without a sound', 'birds that do not sing near the cursed'],
    ['win back the voice from the one who holds it', 'a true word spoken for the cursed by one who loves them', 'sing at the spirit\'s spring at dawn']),
  C('eternal-winter', 'The Long Winter', ['land'], 5, ['the death of a summer god\'s priest', 'the theft of a frost giant\'s bride', 'a broken pact with the spirits of the cold'],
    ['winter does not end: snow in midsummer, frozen rivers (crops fail; cold every night)', 'wolves and worse come down from the north'],
    ['frost on the leaves in summer', 'a cold wind from no direction'],
    ['return what was stolen from the cold', 'relight the fire of the summer god\'s temple', 'face the spirit of winter in its hall']),
  C('drowning', 'The Drowned Call', ['land', 'place', 'person'], 3, ['a murder done in the water', 'a sacrifice withheld from a river spirit', 'a village built over a drowned shrine'],
    ['lights and voices lure the living into the deep water (a will roll near water at night)', 'the cursed cannot cross running water'],
    ['voices of the dead calling from the mist', 'wet footprints coming up from the water'],
    ['give the river its due', 'bring the murdered body up and bury it', 'rebuild the drowned shrine above the water']),
  C('madness', 'The Whispering', ['person', 'place', 'item'], 3, ['a fallen star', 'reading a forbidden book', 'a bargain with something below the earth'],
    ['voices whisper and the mind frays (sanity lost on long stays)', 'sleep brings the same dream each night'],
    ['strange carvings that no one remembers making', 'the same tune hummed by everyone in the place'],
    ['destroy the thing that whispers', 'leave the place and never return', 'a priest\'s exorcism over seven nights']),
  C('binding', 'The Binding', ['person', 'place'], 2, ['an oath broken', 'eating the food of the fey', 'a geas laid by a druid'],
    ['the cursed cannot leave a place, or must do (or never do) one thing (a geas: break it and suffer)', 'a place keeps those who sleep in it'],
    ['a mark like a scar in the shape of a knot', 'paths that lead back to the same place'],
    ['fulfil the terms of the oath', 'have the one who laid it release it', 'find another to take one\'s place']),
  C('greed', 'The Hoard Curse', ['item', 'bloodline'], 3, ['a dragon\'s dying breath over its gold', 'grave-goods taken from a barrow', 'coin minted from a temple\'s plate'],
    ['the owner grows greedy and suspicious and cannot part with it (will not sell or give away the cursed treasure)', 'misfortune falls on each who holds it'],
    ['gold that is always cold to the touch', 'its owners die young and by violence'],
    ['return it to where it was taken', 'cast it into a fire hot enough to melt it, or into the sea', 'pass it on freely to one who knows its curse']),
  C('beast-shape', 'The Beast Shape', ['person', 'bloodline'], 3, ['a witch\'s spite', 'the curse of a slighted god', 'a fey bargain gone wrong'],
    ['the cursed takes the shape of a beast, a swan, a bear or a toad, by day or by night (loses their own shape)', 'they keep their mind, but not their voice'],
    ['a beast that behaves too much like a person', 'a ring or chain that never comes off'],
    ['a true love\'s kiss, or one who weaves them a shirt of nettles in silence', 'break the witch\'s power', 'the god\'s forgiveness, won by a deed']),
];

const byId = new Map(CURSE_TYPES.map((c) => [c.id, c]));
export const curseType = (id: string) => byId.get(id)!;

/** The kind of curse a cursed land's story tells of. */
export function curseOfHeart(h: CurseHeart): CurseType {
  const s = h.story.toLowerCase();
  if (h.mire && /lights|drowned|water/.test(s)) return curseType('drowning');
  if (/necromancer|dead in its crypt|seals|walks out/.test(s)) return curseType('restless-dead');
  if (/star fell|came back changed/.test(s)) return curseType('madness');
  if (/bargained|below the earth/.test(s)) return curseType('wasting');
  if (/hag|firstborn/.test(s)) return curseType('beast-shape');
  if (/wyrm/.test(s)) return curseType('blight');
  return curseType('blight');
}

export interface CurseRumour {
  type: CurseType;
  /** What is said. */
  text: string;
}

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

/**
 * Rumours of lesser curses in a region: a family, a thing, a house, a person (named in the
 * region's own manner, by the `name` function).
 */
export function curseRumours(seed: string, key: string, name: (r: Rng, female: boolean) => string, place: string): CurseRumour[] {
  const r = mulberry32(hashString(`${seed}#curses#${key}`));
  const out: CurseRumour[] = [];
  const n = r() < 0.3 ? 1 : r() < 0.85 ? 2 : 3;
  const personal = CURSE_TYPES.filter((c) => c.targets.some((t) => t !== 'land'));
  for (let i = 0; i < n; i++) {
    const t = pick(r, personal);
    const target = pick(r, t.targets.filter((x) => x !== 'land'));
    const who = name(r, r() < 0.5);
    const src = pick(r, t.sources);
    const sign = pick(r, t.signs);
    const text = target === 'bloodline' ? `The family of ${who} in ${place} is said to carry ${t.name.toLowerCase()} since ${src}; ${sign}.`
      : target === 'item' ? `A ${pick(r, ['sword', 'ring', 'cup', 'necklace', 'mirror', 'helm', 'coin', 'book'])} that passed through the hands of ${who} carries ${t.name.toLowerCase()}, from ${src}; its owners know it by ${sign}.`
        : target === 'place' ? `An old ${pick(r, ['mill', 'well', 'tower', 'farmhouse', 'bridge', 'chapel'])} near ${place} lies under ${t.name.toLowerCase()}, since ${src}; ${sign}.`
          : `${who} of ${place} suffers ${t.name.toLowerCase()} after ${src}; ${sign}.`;
    out.push({ type: t, text: text.replace(/^./, (c) => c.toUpperCase()) });
  }
  return out;
}
