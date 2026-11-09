import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { CurseHeart } from '../gen/special';

/**
 * Curses: the kinds there are, how they come about, what they do (to a land, a person, a
 * bloodline, a place or a thing), the signs that give them away and how they may be lifted. The
 * world's cursed lands (gen/special.ts) are each read as a curse of one kind from their story;
 * a region also hears rumours of lesser curses.
 */

export type CurseTarget = 'land' | 'person' | 'bloodline' | 'place' | 'item';
/**
 * A sign of a curse: a clause that reads on its own after "Folk will tell you that", written with
 * {them} and {their} for whatever is cursed (filled in by `signText`). `for` keeps it to some
 * targets only.
 */
export interface CurseSign {
  t: string;
  for?: CurseTarget[];
}
export interface CurseType {
  id: string;
  name: string;
  targets: CurseTarget[];
  /** How it comes about: clauses that follow "ever since" ("a lie was told under oath"). */
  sources: string[];
  /** What it does, as clauses (with game effects in brackets). */
  effects: string[];
  signs: CurseSign[];
  /** Ways to lift it, from easiest to hardest: phrases that follow "lifted by". */
  lifting: string[];
  /** 1 (a nuisance) to 5 (a doom). */
  severity: number;
}

const C = (id: string, name: string, targets: CurseTarget[], severity: number, sources: string[], effects: string[], signs: (string | CurseSign)[], lifting: string[]): CurseType =>
  ({ id, name, targets, severity, sources, effects, signs: signs.map((x) => (typeof x === 'string' ? { t: x } : x)), lifting });

export const CURSE_TYPES: CurseType[] = [
  C('blight', 'The Withering', ['land', 'place'], 4,
    ['a witch spoke her dying words over the ground', 'an oath to the old gods was broken there', 'a wyrm was slain and its poison soaked into the soil'],
    ['crops fail and trees die where they stand (nothing can be foraged, and healing herbs will not grow)', 'the blight spreads a little further every year', 'beasts are born sickly, or not at all'],
    ['grey, leafless trees stand about {them} and never fall', 'no bird or insect is heard near {them}', 'the air about {them} smells of old ashes'],
    ['making good the wrong at the curse\'s heart', 'consecrating the heart with the rites of the faith that was slighted', 'burning the heart and salting its ground (the land dies, but the blight stops spreading)']),
  C('restless-dead', 'The Unquiet Grave', ['land', 'place', 'bloodline'], 3,
    ['a necromancer\'s working went wrong', 'the dead of a massacre were left unburied', 'a tomb was robbed and its dead disturbed'],
    ['the dead rise on moonless nights and walk to the places they knew (undead encounters at night)', 'graves are found open in the morning', 'the living hear their dead calling them by name'],
    ['the graveyard earth near {them} is found turned over in the morning', 'there are cold spots and a smell of grave soil about {them}', 'dogs will not go near {them}'],
    ['giving the dead their proper rites', 'returning what was taken from the tomb', 'destroying the one who raised them']),
  C('lycanthropy', 'The Wolf\'s Bite', ['person', 'bloodline'], 4,
    ['a werewolf\'s bite drew blood', 'meat from a beast a werewolf had killed was eaten', 'a hunter slew a sacred wolf'],
    ['the cursed changes into a beast at the full moon and hunts (control is lost on full-moon nights)', 'the cursed grows stronger and faster, but silver burns (harmed by silver)', 'the curse passes on with a bite'],
    ['{their} eyebrows meet and hair grows on {their} palms', '{their} wounds heal far too quickly', 'livestock near {them} go missing after every full moon'],
    ['wolfsbane taken before the first change', 'slaying the werewolf that gave the bite before the third full moon', 'a blessing at a holy spring on midsummer night']),
  C('ill-luck', 'The Evil Eye', ['person', 'bloodline'], 1,
    ['a stranger with the evil eye passed through', 'a beggar who was more than a beggar was turned away from the door', 'a mirror was broken in a holy place'],
    ['small things go wrong at every turn, from soured milk to broken tools and storms on the road (roll twice for luck and take the worse)', 'friends grow cold and stay away'],
    ['a run of small mishaps dogs {their} every step', 'black cats are forever crossing {their} path', 'milk sours overnight in {their} house'],
    ['a blue-glass charm against the eye', 'a cunning woman\'s cleansing with an egg', 'a gift freely given to the one who laid it']),
  C('wasting', 'The Wasting', ['person', 'bloodline'], 3,
    ['someone pierced a wax image with pins', 'a hag took her revenge', 'goods were stolen from a grave'],
    ['the cursed grows thin and weak however much they eat (strength fades week by week)', 'no physician can find the cause'],
    [{ t: '{their} face has grown hollow and grey', for: ['person'] }, { t: 'their faces have grown hollow and grey', for: ['bloodline'] }, '{their} hair is turning white too early', 'a little wax doll lies hidden somewhere close to {them}'],
    ['finding and burning the image that was made', 'returning the stolen goods to the grave', 'a willing other taking the curse upon themselves']),
  C('silence', 'The Stolen Voice', ['person', 'place'], 2,
    ['a spirit was offended by a song', 'a bargain was struck with the fey', 'a lie was told under oath'],
    ['the cursed cannot speak, or every word they speak is a lie (no speech, or no truth)', 'in a cursed place, no sound carries'],
    [{ t: '{their} lips move but make no sound', for: ['person'] }, 'no bird sings near {them}', { t: 'footsteps make no sound inside {them}', for: ['place'] }],
    ['winning back the voice from whoever holds it', 'a true word spoken for the cursed by one who loves them', 'singing at the spirit\'s spring at dawn']),
  C('eternal-winter', 'The Long Winter', ['land'], 5,
    ['the priest of a summer god was killed', 'a frost giant\'s bride was stolen', 'a pact with the spirits of the cold was broken'],
    ['winter never ends, with snow in midsummer and frozen rivers (crops fail, and every night is cold)', 'wolves and worse come down from the north'],
    ['frost lies on the leaves in summer', 'a cold wind blows from no direction'],
    ['returning what was stolen from the cold', 'relighting the fire of the summer god\'s temple', 'facing the spirit of winter in its hall']),
  C('drowning', 'The Drowned Call', ['land', 'place', 'person'], 3,
    ['a murder was done in the water', 'a river spirit was denied its sacrifice', 'a village was built over a drowned shrine'],
    ['lights and voices lure the living into deep water (a test of will near water at night)', 'the cursed cannot cross running water'],
    ['the voices of the drowned call to {them} from the mist', 'wet footprints lead up from the water to {them}'],
    ['giving the river its due', 'raising the murdered body and burying it', 'rebuilding the drowned shrine above the water']),
  C('madness', 'The Whispering', ['person', 'place', 'item'], 3,
    ['a star fell from the sky', 'a forbidden book was read', 'a bargain was struck with something below the earth'],
    ['voices whisper and the mind frays (sanity is lost on long stays)', 'sleep brings the same dream every night'],
    ['strange carvings that no one remembers making turn up about {them}', 'everyone who comes near {them} catches themselves humming the same tune'],
    ['destroying the thing that whispers', 'leaving and never returning', 'a priest\'s exorcism over seven nights']),
  C('binding', 'The Binding', ['person', 'place'], 2,
    ['an oath was broken', 'the food of the fey was eaten', 'a druid laid a geas'],
    ['the cursed cannot leave a certain place, or must always (or never) do one thing (a geas, and breaking it brings suffering)', 'a cursed place keeps those who sleep in it'],
    [{ t: 'a scar shaped like a knot marks {their} skin', for: ['person'] }, 'every path near {them} leads back to the same spot'],
    ['fulfilling the terms of the oath', 'the one who laid it releasing it', 'finding another to take the cursed one\'s place']),
  C('greed', 'The Hoard Curse', ['item', 'bloodline'], 3,
    ['a dragon breathed its last over its gold', 'grave goods were taken from a barrow', 'coin was minted from a temple\'s plate'],
    ['its owner grows greedy and suspicious and cannot part with the treasure (will not sell or give it away)', 'misfortune falls on each who holds it'],
    [{ t: 'it is always cold to the touch', for: ['item'] }, { t: 'its owners die young, and by violence', for: ['item'] }, { t: '{their} gold is always cold to the touch', for: ['bloodline'] }, { t: '{their} heirs die young, and by violence', for: ['bloodline'] }],
    ['returning it to where it was taken', 'melting it in a great fire or casting it into the sea', 'passing it on freely to one who knows its curse']),
  C('beast-shape', 'The Beast Shape', ['person', 'bloodline'], 3,
    ['a witch was spited', 'a god was slighted', 'a bargain with the fey went wrong'],
    ['the cursed takes the shape of a beast (a swan, a bear or a toad) by day or by night (their own shape is lost)', 'the cursed keeps their mind, but not their voice'],
    ['a beast that behaves too much like a person is often seen near {them}', 'a ring that will not come off sits on {their} finger'],
    ['a true love\'s kiss, or a shirt of nettles woven in silence', 'breaking the witch\'s power', 'winning the god\'s forgiveness by a great deed']),
  // ---- Further curses ----
  C('rust-rot', 'The Iron Rust', ['item', 'person'], 3,
    ['someone touched a broken forge altar', 'a smith cursed the thief of his tools'],
    ['metal held or worn corrodes and flakes to red dust within days', 'weapons snap at the first heavy blow in combat'],
    [{ t: 'orange rust stains keep spreading on {their} hands and clothes', for: ['person'] }, { t: 'orange rust creeps back over it however often it is cleaned', for: ['item'] }, 'the air about {them} has a harsh metallic tang'],
    ['soaking the cursed metal in pure olive oil for a lunar month', 'paying the wronged smith double the value of the stolen goods', 'smelting the rusted metal in a volcanic forge']),
  C('sleepless', 'The Sleepless Doom', ['person', 'bloodline'], 4,
    ['an oath sworn on the pale moon was broken', 'nightshade was stolen from a hag\'s garden'],
    ['the eyes cannot close in sleep, and exhaustion clouds the mind until madness takes hold after seven days', 'figures are seen standing just beyond the lamplight'],
    ['{their} eyes are dark and sunken, ringed with deep purple', '{their} hands never stop trembling'],
    ['a sleeping draught brewed from crushed poppy and moonflower', 'confessing the broken oath before a shrine', 'a night of dreamless sleep granted by a fey lord']),
  C('namelessness', 'The Stolen Name', ['person'], 3,
    ['a secret name was stolen from an ancient spirit', 'a god punished a lie sworn in public'],
    ['whoever looks away at once forgets the cursed one\'s name and face, and written records of them fade to blank paper', 'family and friends treat the cursed as a stranger'],
    ['people falter mid-sentence when they try to speak to {them}', 'blank spaces stand where {their} name once was in the parish ledgers'],
    ['the spirit that laid the curse speaking the true name aloud', 'a naming ceremony with the blood of an unblemished white lamb', 'a legendary deed that forces the world to remember']),
  C('corpse-stench', 'The Grave-Rot', ['person', 'place'], 2,
    ['a burial vault was robbed and the robber never washed', 'an open battlefield was desecrated'],
    ['a smell of rotting flesh and grave soil surrounds the cursed, drawing scavengers and flies', 'food spoils at once nearby'],
    ['swarms of blowflies hang about {them}', { t: 'flowers wilt at {their} touch', for: ['person'] }, { t: 'flowers wilt on {their} doorstep', for: ['place'] }],
    ['bathing in a barrel of spring water with crushed rue and salt', 'returning all grave goods to their rightful owners', 'burning the clothing worn at the desecration']),
  C('phantom-pain', 'The Ghost Wounds', ['person'], 3,
    ['a massacre was survived by playing dead while comrades died', 'a suppliant seeking sanctuary was slain'],
    ['the cursed relives the pain and wounds of old battles, or of the crime they committed', 'sudden collapses come with any hard exertion'],
    ['{their} body flinches violently from unseen blows', 'scars appear on {their} skin where there were none before'],
    ['full restitution to the victims\' surviving kin', 'three days of fasting in a silent cell', 'absolution from a high priest']),
  C('bitter-water', 'The Poisoned Spring', ['land', 'place'], 4,
    ['a sacred well was fouled with human blood', 'a dryad died cursing the felling of her valley'],
    ['all fresh water within the cursed bounds turns bitter and poisonous, causing violent illness', 'livestock that drink from the streams bloat and die'],
    ['a greasy, rainbow-sheened film coats the water about {them}', 'a foul smell of sulphur hangs over the wells near {them}'],
    ['purifying the headspring with holy silver and rites of spring water', 'planting a ring of young willows around every poisoned pool', 'turning the water through an underground bed of charcoal and blessed lime']),
  C('doppelganger', 'The Shadow Self', ['person'], 4,
    ['a cursed mirror was stolen', 'a bargain was struck with a shadow demon in the deep woods'],
    ['a phantom double commits crimes and spreads ruin in the cursed one\'s name, turning friends and the law against them', 'the true person grows weak while the double is abroad'],
    ['witnesses swear they saw {them} in two distant places at once', 'things go missing and trust breaks down among {their} friends'],
    ['smashing the mirror under starlight', 'meeting the shadow self and defeating it in single combat', 'a binding spell cast by an archmage']),
  C('wandering-roads', 'The Endless Maze', ['place', 'land'], 3,
    ['the old boundary stones were moved', 'a trickster god played a prank on a greedy lord'],
    ['roads and paths twist and loop without end, and travellers never reach the next town without magical guidance', 'caravans wander in circles until their supplies run dry'],
    ['the milestones on the roads near {them} repeat themselves in reverse order', 'the sun seems to rise in the wrong quarter of the sky'],
    ['returning the boundary stones to their old places', 'sacrificing a white cockerel at the central crossroads', 'walking the bounds backward while chanting an ancient ward']),
  C('silt-lung', 'The Drowning Air', ['place', 'person'], 3,
    ['an innocent was drowned in a shallow marsh', 'a house was built over a hidden lake underground'],
    ['the air grows thick, heavy and wet, and the cursed struggle to breathe as if under water', 'walking uphill is like swimming against a strong current'],
    [{ t: '{their} breath comes in gasps, even in dry air', for: ['person'] }, { t: 'all who enter it gasp and choke, even in dry air', for: ['place'] }, 'water beads on the walls near {them}'],
    ['draining the hidden water beneath the foundations', 'the rites of air purification on the highest hill', 'a lungwort charm blessed by a mountain priest']),
  C('blood-feud', 'The Bitter Lineage', ['bloodline'], 5,
    ['a guest was murdered under the family roof', 'a dying matriarch laid a curse across the generations'],
    ['two bloodlines are driven to hatred and violence, and every meeting between them ends in bloodshed', 'children born into the line inherit a blinding rage'],
    ['{their} sons brawl with their neighbours in the village streets', '{their} heirlooms are stained with the blood of both families'],
    ['the marriage of the youngest heirs of the two lines', 'giving all the disputed lands to the temple', 'a formal trial by combat judged by a neutral king']),
  C('hollow-shadow', 'The Shadowless', ['person'], 2,
    ['a shadow was sold to a merchant of the deep night', 'a death spirit was cheated'],
    ['the cursed casts no shadow in sunlight or torchlight, unsettling animals and children', 'the warmth of a fire is no longer felt'],
    ['dogs growl and bark at the empty space behind {them}', 'frost forms around the soles of {their} boots'],
    ['winning back the shadow in a game of dice with a night spirit', 'standing under the midday sun at midsummer and praying for forgiveness', 'a cloak woven from raven feathers']),
  C('stuttering-time', 'The Temporal Stutter', ['place'], 5,
    ['the tomb of a chronomancer was disturbed', 'a cosmic seal was broken'],
    ['time loops and stutters, events repeat every hour, and travellers age quickly or are thrown backward', 'shattered things put themselves back together'],
    ['the clocks near {them} run backward', 'people near {them} see past versions of themselves walking down the street'],
    ['restoring the chronomancer\'s hourglass to its pedestal', 'finding the anchor of time hidden in the ruins and breaking it', 'living through twenty-four turns of the loop without changing what happens']),
  C('gilded-shackle', 'The Debt Curse', ['item', 'person'], 3,
    ['a temple treasury was swindled', 'a dying labourer was refused his wage'],
    ['gold and silver the cursed spends vanishes from the merchant\'s purse and returns to theirs, piling up debts that can never be paid', 'greed poisons every friendship'],
    [{ t: 'coins feel heavy and warm in {their} purse', for: ['person'] }, { t: 'coins kept near it grow heavy and warm', for: ['item'] }, { t: 'merchants refuse to trade with {them}, fearing phantom losses', for: ['person'] }, { t: 'merchants refuse to trade with whoever carries it', for: ['item'] }],
    ['repaying the stolen sum tenfold to the rightful heirs', 'casting every cursed coin into a running river', 'a week of fasting and public service']),
  C('swarm-herald', 'The Plague of Gnats', ['person'], 3,
    ['a sacred beehive was defiled', 'a witch punished cruelty to animals'],
    ['a cloud of biting gnats, flies and stinging insects follows the cursed everywhere, making sleep and speech hard', 'crops wither nearby'],
    ['a buzzing never leaves {their} head', '{their} face and neck are covered in welts and bites'],
    ['bathing in honey and sitting in a wild meadow until the insects have gorged', 'an apology to the beekeeper\'s family', 'a veil of woven horsehair blessed by a priest']),
  C('stone-heart', 'The Petrifying Blood', ['bloodline'], 4,
    ['the flesh of a stone golem was eaten', 'a pact with the spirits of the mountain was broken'],
    ['members of the bloodline slowly turn to living stone over the decades, from the hands and feet inward, until they cannot move', 'the skin grows grey and cold'],
    ['{their} footfalls are heavy and clumsy', '{their} skin sounds like slate when tapped'],
    ['bathing in the molten sulphur springs of the high volcano', 'offering a statue of pure gold carved in the mountain spirit\'s likeness', 'climbing the highest peak barefoot in winter']),
];

/** The pronouns for what a curse lies on. */
function pronouns(target: CurseTarget, female?: boolean): { them: string; their: string } {
  if (target === 'person') return female ? { them: 'her', their: 'her' } : { them: 'him', their: 'his' };
  if (target === 'bloodline') return { them: 'them', their: 'their' };
  return { them: 'it', their: 'its' };
}

/** The signs of a curse that suit a target, written out for it. */
export function signText(type: CurseType, target: CurseTarget, female?: boolean): string[] {
  const p = pronouns(target, female);
  return type.signs.filter((x) => !x.for || x.for.includes(target)).map((x) => x.t.replace(/\{them\}/g, p.them).replace(/\{their\}/g, p.their));
}

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
  const FRAME = ['Folk will tell you that ', 'Neighbours say that ', 'Those who know say that '];
  for (let i = 0; i < n; i++) {
    const t = pick(r, personal);
    const target = pick(r, t.targets.filter((x) => x !== 'land'));
    const female = r() < 0.5;
    const who = name(r, female);
    const src = pick(r, t.sources);
    const signs = signText(t, target, female);
    const sign = signs.length ? pick(r, signs) : '';
    const frame = pick(r, FRAME);
    const curse = t.name.toLowerCase();
    const lead = target === 'bloodline' ? `The family of ${who} in ${place} is said to have carried ${curse} ever since ${src}.`
      : target === 'item' ? `A ${pick(r, ['sword', 'ring', 'cup', 'necklace', 'mirror', 'helm', 'coin', 'book'])} that passed through the hands of ${who} has carried ${curse} ever since ${src}.`
        : target === 'place' ? `An old ${pick(r, ['mill', 'well', 'tower', 'farmhouse', 'bridge', 'chapel'])} near ${place} has lain under ${curse} ever since ${src}.`
          : `${who} of ${place} has suffered ${curse} ever since ${src}.`;
    const text = sign ? `${lead} ${frame}${sign}.` : lead;
    out.push({ type: t, text: text.replace(/^./, (c) => c.toUpperCase()) });
  }
  return out;
}
