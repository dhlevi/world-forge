import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Deity, Faith, FaithFamily } from './faiths';

/**
 * A faith's myths and legends: how the world was made, a story for each of its gods (or saints,
 * prophets and holy figures), how the world will end and what waits after death, and legends of
 * its holy places and its prophet. All are told from templates by the faith's archetype, its gods'
 * domains, its doctrines and tenets, and the places and peoples of the map, on random streams of
 * their own (so nothing else in the world changes).
 */

export interface Myth {
  title: string;
  paragraphs: string[];
}
export interface GodStory {
  name: string;
  domain: string;
  story: string;
}
export interface FaithMyths {
  creation: Myth;
  gods: GodStory[];
  end: Myth;
  afterlife: Myth;
  legends: Myth[];
}

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const MONO = new Set<FaithFamily>(['church', 'crescent']);

// ---- Themes of the gods ----------------------------------------------------------------------------

type Theme =
  | 'sky' | 'thunder' | 'sea' | 'sun' | 'moon' | 'star' | 'dead' | 'war' | 'love' | 'harvest' | 'forge' | 'trick' | 'hunt' | 'wisdom' | 'hearth' | 'earth' | 'water'
  | 'wind' | 'mountain' | 'dream' | 'fate' | 'revel' | 'travel' | 'beast' | 'healing' | 'mercy' | 'rain' | 'night' | 'learning' | 'judge' | 'fertility' | 'stone' | 'tomb' | 'gate';

const THEME_WORDS: [Theme, RegExp][] = [
  ['sky', /all-father|king of the gods|father of all|great spirit|creator|one god|eternal sky|^heaven|jade lord|lady of the stars/i],
  ['dead', /dead|death|underworld|slain|nine underworld|cold spirits|flayed/i], ['tomb', /tomb/i], ['gate', /gate|bridge/i], ['thunder', /thunder|storm|lightning/i],
  ['sea', /\bsea\b|ocean|deep waters|sailors|dragon king/i], ['sun', /\bsun\b|dawn|morning star/i], ['moon', /moon/i], ['star', /star/i], ['war', /war|battle|combat|siege|archery|soldiers|bloodshed/i],
  ['love', /love|beauty|marriage/i], ['harvest', /harvest|maize|rice|fertility|grain/i], ['forge', /forge|smith|craft|mason|builders|stone-hewing/i], ['trick', /trickster|thieves|fox|smoking mirror/i],
  ['hunt', /hunt|bow/i], ['wisdom', /wisdom|sage|lore|memory/i], ['hearth', /hearth/i], ['earth', /earth|land|mother\b|mother,|the mother/i], ['water', /river|well|spring|cenote|water|lake|streams/i],
  ['wind', /wind|autumn/i], ['mountain', /mountain|peak|pass/i], ['dream', /dream/i], ['fate', /fate|weaver/i], ['revel', /wine|revel/i], ['travel', /travel|merchant|pilgrim|messenger|rainbow/i],
  ['beast', /beast|horse|wolf|bear|buffalo|llama|herd|serpent|horned/i], ['healing', /heal/i], ['mercy', /mercy|compassion|charity|poor|lost causes/i], ['rain', /rain/i], ['night', /night/i],
  ['learning', /learning|scholar|examination|literature|jurist|revelation/i], ['judge', /judg|wrath|last day|mandate/i], ['fertility', /childbearing|children|weav/i], ['stone', /stone|veins|underground/i],
  ['sky', /sky|heaven|celestial|all-father|king of the gods|father of all|great spirit|creator|one god|jade lord/i],
];
function themeOf(domain: string): Theme {
  for (const [t, re] of THEME_WORDS) if (re.test(domain)) return t;
  return 'sky';
}

/** What each theme's god is known by: a sacred beast or thing, a deed, an offering. */
const T: Record<Theme, { sign: string[]; deed: string[]; gift: string[]; born: string[] }> = {
  sky: { sign: ['the eagle', 'the white bull', 'the high throne'], deed: ['set the sky upon four pillars so that it would not fall', 'divided the day from the night and gave each its hours', 'holds the oaths of kings and punishes those who break them'], gift: ['the first fruits of every harvest', 'a white beast at midsummer'], born: ['was the first to wake in the dark', 'rose from the first breath of the world'] },
  thunder: { sign: ['the hammer', 'the goat', 'the oak struck by lightning'], deed: ['fought the great serpent and drove it into the deep', 'splits the clouds so that the rain may fall on the fields', 'guards the gods’ hall against the giants of frost'], gift: ['ale poured on the stones', 'a goat at the spring storms'], born: ['was born in a clap of thunder', 'sprang from the clash of the sky and the sea'] },
  sea: { sign: ['the trident', 'the whale', 'the white horse of the waves'], deed: ['raised the islands from the deep and sank those who angered him', 'taught the first sailors to read the waves', 'keeps the drowned in halls of coral beneath the waves'], gift: ['wine poured into the sea before a voyage', 'a horse driven into the surf'], born: ['rose from the foam of the first wave', 'was born in the deep before the land was made'] },
  sun: { sign: ['the golden disc', 'the falcon', 'the chariot of fire'], deed: ['drives the burning chariot across the sky each day', 'fought the night on the first morning and has fought it every dawn since', 'gave fire to the first people in a hollow reed'], gift: ['gold and honey on the longest day', 'songs at dawn'], born: ['was born from the first fire', 'hatched from a golden egg at the edge of the world'] },
  moon: { sign: ['the silver bow', 'the hare', 'the white doe'], deed: ['walks the night sky and keeps watch while the sun sleeps', 'counts the months and turns the tides', 'guards travellers and women in childbirth by night'], gift: ['milk and white flowers at the full moon', 'silver left at crossroads'], born: ['was born from a tear of the sun', 'was cut from the sun’s own light'] },
  star: { sign: ['the silver star', 'the swan', 'the harp'], deed: ['kindled the stars one by one and named each of them', 'sang the paths of the stars so that sailors would never be lost', 'weaves starlight into the dreams of the faithful'], gift: ['songs under the open sky', 'lamps set adrift on still water'], born: ['woke under the first stars', 'was the first light in the dark'] },
  dead: { sign: ['the raven', 'the black hound', 'the key of the underworld'], deed: ['was the first to die, and so became ruler of all who follow', 'weighs the souls of the dead and sends each to its place', 'keeps the gates of the underworld, which open only inward'], gift: ['bread and salt left at graves', 'black beasts at the turning of the year'], born: ['was born in the dark beneath the roots of the world', 'came out of the first grave'] },
  war: { sign: ['the spear', 'the wolf', 'the red banner'], deed: ['led the gods to victory in the first war, and was wounded nine times', 'chooses who will fall in each battle', 'taught the first warriors the shield wall'], gift: ['captured arms hung in the temples', 'the blood of a bull before a war'], born: ['sprang full-armed from the head of the sky father', 'was born on a battlefield among the slain'] },
  love: { sign: ['the dove', 'the rose', 'the mirror'], deed: ['bound the first lovers with a golden thread', 'wept over a dead lover until the first flowers grew from her tears', 'rules the hearts of gods and mortals alike'], gift: ['flowers and sweet cakes', 'doves set free at weddings'], born: ['rose from the foam of the sea', 'was born from the first kiss between the sky and the earth'] },
  harvest: { sign: ['the sheaf', 'the sickle', 'the sow'], deed: ['taught the first people to sow and reap', 'dies each autumn with the fields and rises again in spring', 'brought the first seed out of the underworld'], gift: ['the last sheaf of the harvest', 'bread baked from the first grain'], born: ['grew from a seed planted by the earth mother', 'was born in a furrow'] },
  forge: { sign: ['the hammer and anvil', 'the tongs', 'the smoking mountain'], deed: ['forged the weapons of the gods and the chains of the great wolf', 'built the gods’ halls of bronze and gold', 'made the first people from metal, and then from clay when the metal ran short'], gift: ['the first work of every new smith', 'iron nails driven into holy trees'], born: ['was born lame and thrown from the sky, and learned the forge in the deep', 'was born in the fire of a mountain'] },
  trick: { sign: ['the fox', 'the crow', 'the mask'], deed: ['stole fire from the gods for the first people', 'tricked death into a sack and let it go again for a price', 'shapes himself into any beast, and has fathered strange children'], gift: ['the first cup of every feast, spilled', 'jokes and riddles at the winter feast'], born: ['was born of a giant and a goddess, and belongs to neither', 'was never born, and simply was'] },
  hunt: { sign: ['the stag', 'the bow', 'the hound'], deed: ['hunts the wild places at night with a pack of white hounds', 'taught the first hunters to give thanks for every kill', 'turned a hunter who spied on her into a stag'], gift: ['the heart of the first kill of the year', 'antlers hung over the door'], born: ['was born in the deep forest', 'was nursed by a she-wolf'] },
  wisdom: { sign: ['the owl', 'the open book', 'the well of memory'], deed: ['gave an eye for a drink from the well of wisdom', 'hung nine nights on the world tree to learn the runes', 'taught the first sages to write'], gift: ['the first page of every book', 'lamps lit through the night'], born: ['was born from the head of the sky father', 'woke already old and knowing'] },
  hearth: { sign: ['the flame', 'the cauldron', 'the hearthstone'], deed: ['keeps the fire burning in every home', 'gave up her throne among the gods to tend the hearth', 'guards the bond between host and guest'], gift: ['the first portion of every meal, put in the fire', 'a fire that never goes out'], born: ['was the eldest of the gods, born first and freed last', 'was born from a spark of the first fire'] },
  earth: { sign: ['the cow', 'the stone', 'the round mound'], deed: ['bore the mountains and the rivers and all that grows', 'sleeps beneath the fields, and her breath is the spring', 'takes back all the dead into her body'], gift: ['milk poured on the ground', 'the first bread of the year, buried'], born: ['was there before all others', 'was the body of the world itself'] },
  water: { sign: ['the salmon', 'the cup', 'the spring'], deed: ['dwells in every holy spring and heals those who come in faith', 'gave the first river its course', 'drowned the proud king who fouled her well'], gift: ['coins and pins thrown into wells', 'ribbons tied to trees by springs'], born: ['welled up from beneath the roots of the world', 'was born from a mountain’s tears'] },
  wind: { sign: ['the four horns', 'the falling leaf', 'the kite'], deed: ['carries the souls of the dead beyond the sea', 'scatters the seeds and brings the seasons', 'blows the ships of the faithful safely home'], gift: ['feathers and leaves cast into the wind', 'songs on high places'], born: ['was the first breath of the world', 'was born in the clash of four winds'] },
  mountain: { sign: ['the peak', 'the ram', 'the white stone'], deed: ['holds up the sky on his shoulders', 'guards the passes and lets through only the worthy', 'hid the first people in the mountain while the flood passed'], gift: ['cairns built on the passes', 'white stones carried to the summit'], born: ['rose from the earth when the world was young', 'was the first mountain'] },
  dream: { sign: ['the poppy', 'the moth', 'the veiled lamp'], deed: ['walks in the dreams of the faithful and shows them what will be', 'keeps the dreams of the dead', 'gave the first seers their sight'], gift: ['incense burned before sleep', 'dreams told aloud at dawn'], born: ['was dreamed by the first god before the world began', 'was born on the night between two years'] },
  fate: { sign: ['the spindle', 'the web', 'the three threads'], deed: ['spins the thread of every life, and cuts it when it is done', 'wove the fate of the gods themselves', 'sits at the roots of the world tree and waters it'], gift: ['a thread from every new cloth', 'silence at births'], born: ['was older than the gods, and none know her birth', 'came out of the well of fate'] },
  revel: { sign: ['the vine', 'the panther', 'the cup'], deed: ['wanders the world with a wild train of revellers', 'taught the first people to make wine', 'died and rose again in the vine'], gift: ['wine poured on the ground', 'dances through the night'], born: ['was born twice, once of his mother and once of his father', 'was born in the vineyards'] },
  travel: { sign: ['the staff', 'the winged sandal', 'the milestone'], deed: ['carries messages between the gods and mortals', 'guides the souls of the dead on their road', 'watches over every crossroads, market and inn'], gift: ['a coin left at crossroads', 'cairns along the roads'], born: ['was born at a crossroads', 'was born at dawn and stole a herd by noon'] },
  beast: { sign: ['the horse', 'the wolf', 'the bear'], deed: ['ran before the first people and led them to their land', 'gave the herds to the first people and teaches the young their ways', 'was the forebear of the first of the people’s kings'], gift: ['the first foal of the year', 'skulls hung in holy trees'], born: ['came out of the forest at the beginning of the world', 'was born of the moon and a mare'] },
  healing: { sign: ['the serpent staff', 'the herb', 'the bear'], deed: ['taught the first healers the herbs of the field', 'raised a dead man, and was punished for it by the sky father', 'sleeps through the winter and wakes the world in spring'], gift: ['wax models of healed limbs', 'herbs hung at the temple door'], born: ['was cut from his dying mother’s womb', 'was born in a cave of healing waters'] },
  mercy: { sign: ['the open hand', 'the lotus', 'the lamp'], deed: ['hears every prayer of the poor and the suffering', 'refused paradise until every soul could enter', 'gave away all she had and was given back a hundredfold'], gift: ['alms given in her name', 'lamps lit for the sick'], born: ['was born a mortal and raised up for her compassion', 'was born of a tear of the highest god'] },
  rain: { sign: ['the frog', 'the jar', 'the cloud'], deed: ['pours the rain from great jars when the people are faithful', 'withheld the rain for seven years when the people forgot him', 'sends the storms of the wet season'], gift: ['the blood of children in the old days, now incense and maize', 'songs and drums at planting'], born: ['was born in the clouds over the mountains', 'came out of the sacred well'] },
  night: { sign: ['the jaguar', 'the obsidian mirror', 'the owl'], deed: ['sees all deeds in his mirror of smoke', 'brings the night and the fears that walk in it', 'tempts the proud and breaks them'], gift: ['obsidian blades', 'offerings at midnight'], born: ['was born of the dark before the first sun', 'was the shadow of the first god'] },
  learning: { sign: ['the brush and scroll', 'the tablet', 'the lamp'], deed: ['brought writing and the calendar to the first people', 'set the laws in the tablets', 'judges the scholars and rewards the diligent'], gift: ['ink and paper burned at the temple', 'the first copy of every book'], born: ['was born from the first word spoken', 'came down from heaven on a cloud'] },
  judge: { sign: ['the scales', 'the sword', 'the book of deeds'], deed: ['weighs every soul at the end of days', 'keeps the book in which all deeds are written', 'grants rule to the just and takes it from the wicked'], gift: ['oaths sworn before the altar', 'fasting before great judgments'], born: ['was the first to be made, before the world', 'stands at the right hand of the highest'] },
  fertility: { sign: ['the spindle', 'the cradle', 'the pomegranate'], deed: ['watches over every birth', 'weaves the bodies of children in the womb', 'taught the first women to spin and weave'], gift: ['the first cloth of a bride', 'small figures of clay left at the shrine'], born: ['was born from a seed in the earth mother’s womb', 'was born under the full moon'] },
  stone: { sign: ['the pick', 'the vein of gold', 'the deep lamp'], deed: ['runs through the rock like water and shows the miners its veins', 'carved the first halls beneath the mountain', 'knows the name of every stone'], gift: ['the first ore of a new mine', 'lamps left burning in the deeps'], born: ['was carved from the living rock', 'was born in the dark at the mountain’s root'] },
  tomb: { sign: ['the sealed door', 'the stone eye', 'the lamp of the dead'], deed: ['watches over the tombs of the kings and never sleeps', 'curses those who rob the dead', 'keeps the names of the dead so that they are never forgotten'], gift: ['names carved on the tomb walls', 'lamps kept burning in the tombs'], born: ['was the first king to be laid in the stone', 'was born in silence'] },
  gate: { sign: ['the bridge', 'the key', 'the horn'], deed: ['guards the bridge between the worlds and will sound his horn at the end', 'keeps the deep gates shut against what lies below', 'lets through only the worthy'], gift: ['keys left at the shrine', 'watch-fires kept on the walls'], born: ['was born of nine mothers', 'was set at the gate when the world was made'] },
};

// ---- Creation --------------------------------------------------------------------------------------

type Ctx = { r: Rng; f: Faith; chief: Deity; others: Deity[]; folk: string; place: (i: number) => string; elder: string };

/** The kinds of beginning each archetype tells. */
const BEGIN: Record<FaithFamily, string[]> = {
  church: ['word'], crescent: ['word'], pantheon: ['chaos', 'egg', 'titans'], oldgods: ['giant', 'void'], druid: ['sea', 'tree'], stars: ['song'], ancestors: ['stone'],
  sky: ['diver', 'sky'], heaven: ['split', 'egg'], kami: ['spear'], spirits: ['diver', 'emerge'], sun: ['lake', 'emerge'], serpent: ['suns', 'emerge'],
};

function creation(c: Ctx): Myth {
  const { r, f, chief, others, folk, elder } = c;
  const kind = pick(r, BEGIN[f.family]);
  const g = (i: number) => others[i]?.name ?? chief.name;
  const P: string[] = [];
  let title = 'The making of the world';
  switch (kind) {
    case 'word':
      title = 'The Creation';
      P.push(`In the beginning there was nothing but ${chief.name}, and ${chief.name} was alone. Then ${chief.name} spoke, and the first word was light, and the light was good.`);
      P.push(`On the days that followed ${chief.name} parted the waters above from the waters below, raised the dry land, and set the sun, the moon and the stars in their courses. ${chief.name} filled the sea with fish and the air with birds, and the land with beasts of every kind.`);
      P.push(`Last of all ${chief.name} took ${pick(r, ['dust from the ground', 'clay from a riverbank', 'red earth from the hills'])} and made the first man and the first woman, and breathed life into them, and gave them the world to keep. But they ${pick(r, ['ate of the fruit that was forbidden them', 'listened to the whispering one, and grew proud', 'broke the one law they were given'])}, and so death and toil came into the world, and ${f.missionary ? `the faithful wait for the word of ${f.prophet} to lead them home` : 'their children have sought their way back ever since'}.`);
      break;
    case 'chaos':
      P.push(`Before all things there was Chaos, a yawning dark without form. Out of it came ${elder}, the broad earth, and the starry sky that lay upon her, and from their joining came the elder gods, huge and wild.`);
      P.push(`The eldest of them devoured his own children, fearing that one would overthrow him. But ${chief.name} was hidden in a cave and raised in secret, and when grown ${chief.name} freed the others and made war on the elder gods for ten years, until they were thrown down into the deep beneath the world.`);
      P.push(`Then the victors divided the world by lot: ${chief.name} took the sky, ${g(1)} ${themeOf(others[1]?.domain ?? '') === 'sea' ? 'the sea' : 'a share of their own'}, and ${g(2)} the realm below. ${pick(r, [`The first people were made by a wise one of the elder race from clay and water, and given fire against the gods’ will.`, `The ${folk} say that their first parents were made from the ash trees of the mountains.`, `People were made five times; the golden race lived like gods, but each after was worse, down to the iron race of today.`])}`);
      break;
    case 'titans':
    case 'egg':
      title = kind === 'egg' ? 'The egg of the world' : title;
      P.push(`In the beginning there was only a great egg, floating in the dark. For ages it lay there, and within it slept ${chief.name}.`);
      P.push(`When ${chief.name} woke and broke out of the shell, the light of the egg became the sky, and its heavy yolk sank and became the earth. ${chief.name} stood between them and pushed them apart, growing taller each day, until they were set where they are now.`);
      P.push(`From the broken shell came ${list(others.slice(0, 3).map((d) => d.name)) || 'the other gods'}. ${pick(r, [`The first ${folk} were made from the shell’s fragments, and that is why they are hard and bright.`, `The fleas upon ${chief.name}’s body became the first people.`, `The first people were made from clay by ${g(1)}, who tired, and so made the later ones by flicking mud from a rope.`])}`);
      break;
    case 'giant':
    case 'void':
      title = 'The giant’s body';
      P.push(`In the beginning there was neither sand nor sea nor cool waves, no earth below nor sky above, only the yawning gap between the fire in the south and the ice in the north. Where the heat met the frost, the ice melted, and from its drops came ${elder}, the first giant, and a great cow whose milk fed him.`);
      P.push(`The cow licked the salt ice, and from it came the grandfather of the gods. His grandsons, ${chief.name} and his brothers, slew ${elder}, and so much blood flowed from him that all the giants drowned but one.`);
      P.push(`From ${elder}’s flesh they made the earth, from his blood the sea and the lakes, from his bones the mountains, from his skull the sky, and from his brains the clouds. Then, walking on the shore, they found two trees, an ash and an elm, and made of them the first man and the first woman.`);
      break;
    case 'sea':
    case 'tree':
      title = kind === 'tree' ? 'The tree of the world' : 'The coming of the land';
      P.push(kind === 'tree' ? `Before the world there was the Tree, whose roots drank from the dark below and whose branches held up the sky. In its roots slept ${elder}, and in its crown sang the birds that became the stars.` : `In the beginning was the sea, grey and endless, and ${elder} who dwelt in it.`);
      P.push(`${chief.name} ${kind === 'tree' ? `climbed down the Tree and shook from its branches the seeds of every living thing, and where they fell the land grew green` : `drew the land out of the sea with a net of words, and set the islands and the hills in their places, and called up the rivers from the deep`}.`);
      P.push(`The ${folk} came over the sea in waves, each people taking the land from the one before, and the last of them were the children of ${g(1)}. The gods are only the first of those peoples, who went into the hollow hills when the mortals came.`);
      break;
    case 'song':
      title = 'The great song';
      P.push(`Before the world was, ${chief.name} sang in the dark, and the song was the first light. ${chief.name} taught the theme to the other powers, and they sang with her, ${list(others.slice(0, 3).map((d) => d.name)) || 'each in their turn'}, and their music became the world.`);
      P.push(`But one of the singers grew proud and wove a theme of his own, loud and discordant, and so it is that there is darkness and ruin in the world as well as light. Even so, his notes were taken up into the greater song, and nothing can be sung that was not in it from the beginning.`);
      P.push(`The ${folk} woke beneath the first stars by a still lake, before the sun and the moon were made, and that is why they love the starlight above all things.`);
      break;
    case 'stone':
      title = 'The carving of the first folk';
      P.push(`The world was a single stone, without hall or hollow, and within it dwelt ${chief.name}, the Maker, alone in the dark.`);
      P.push(`${chief.name} grew weary of the silence and took up hammer and chisel. First the Maker carved the deep halls and the roads beneath the mountains, then the veins of gold and silver, and last of all, from the hardest stone, the seven fathers of the ${folk}.`);
      P.push(`The Maker laid them to sleep in seven halls beneath the mountains, to wake when the world was ready. When they woke, each founded a house, and the ${folk} are the children of those seven. When a ${folk.replace(/s$/, '')} dies, the stone takes them back, and the Maker carves them anew.`);
      break;
    case 'diver':
    case 'sky':
      title = kind === 'diver' ? 'The earth-diver' : 'The sky and the earth';
      P.push(`In the beginning there was only water, and above it the endless sky, ${chief.name}. Nothing stood upon the water, and the sky was alone.`);
      P.push(`${chief.name} sent the creatures of the water down to find the bottom. The ${pick(r, ['otter', 'beaver', 'loon', 'muskrat', 'duck'])} dived first, and failed, and many others after. Last of all the smallest dived, and stayed below so long that all thought it dead, but it rose at last with a little mud in its paws.`);
      P.push(`The mud was spread upon the back of a great turtle, and it grew and grew until it became the land on which the ${folk} live. ${g(1)} then came down to it, and from ${pick(r, ['her body grew the first maize, beans and squash', 'the corn and the herds the first people were fed', 'the wolf and the doe were born the first of the people'])}.`);
      break;
    case 'emerge':
      title = 'The emergence';
      P.push(`The first people did not live upon this world but in the worlds beneath it, one below another, each darker than the last. They were not yet people, but crawled and quarrelled in the dark.`);
      P.push(`${chief.name} pitied them and sent ${g(1)} to lead them up. They climbed through a hollow reed, from world to world, and each world was brighter than the last, until they came out through ${pick(r, ['a lake', 'a hole in the earth', 'a cave in the mountains'])} into this one, the fourth world, under the sun.`);
      P.push(`The place where they came out is holy to the ${folk}, and the dead return there, down the same road, to the worlds below.`);
      break;
    case 'lake':
      title = 'The rising from the lake';
      P.push(`In the beginning there was darkness, and a great lake in the high mountains. Out of the lake rose ${chief.name}, the Creator.`);
      P.push(`${chief.name} made a first race of giants from stone, but they were wild and disobedient, and the Creator drowned them in a flood and turned some of them back into stone, which still stand on the hills.`);
      P.push(`Then ${chief.name} made the sun and the moon and the stars and set them rising from an island in the lake, and made the ${folk} anew from clay, painting each people in its own dress, and sent them down into the earth to come out where each would live, from caves, springs and hills.`);
      break;
    case 'suns':
      title = 'The five suns';
      P.push(`This is not the first world. Four times before the gods have made a world and a sun to light it, and four times it has ended: by jaguars, by wind, by a rain of fire, and by a flood.`);
      P.push(`After the fourth sun the gods met in darkness to make a fifth. The proud god who offered himself first was afraid to leap into the fire, but the humble one, covered in sores, leaped without fear and rose as the new sun. Even so, the sun would not move until the gods gave their own blood to feed it.`);
      P.push(`${chief.name} went down into the land of the dead and took the bones of the people of the old world, and ground them, and mixed them with blood, and from them made the ${folk}. That is why the people owe the gods their blood in turn.`);
      break;
    case 'split':
      title = 'The separation of heaven and earth';
      P.push(`In the beginning heaven and earth were one, a great egg of chaos. Within it ${elder} grew for eighteen thousand years.`);
      P.push(`When ${elder} woke, the light and pure rose and became heaven, and the heavy and dark sank and became the earth. ${elder} stood between them and held them apart for another eighteen thousand years, and grew taller each day, until they were fixed.`);
      P.push(`When ${elder} died, his breath became the wind, his voice the thunder, his eyes the sun and moon, his body the mountains, his blood the rivers, and his hair the stars. ${chief.name} then set the order of the world and of the court of heaven, and gave the mandate to rule to the wisest of men.`);
      break;
    case 'spear':
      title = 'The making of the islands';
      P.push(`In the beginning the world was soft and formless, floating like oil on water. ${chief.name} and ${g(1)} stood upon the floating bridge of heaven and stirred the sea below with a jewelled spear.`);
      P.push(`When they lifted the spear, the brine that dripped from its tip hardened into the first island. They went down to it and married, and from their union were born the other islands, and the gods of the wind, the trees and the mountains.`);
      P.push(`From the descendants of the gods came the line of the rulers of the ${folk}, who are the children of the sun.`);
      break;
  }
  return { title, paragraphs: P };
}

// ---- Gods ------------------------------------------------------------------------------------------

const REL = ['child', 'sibling', 'spouse', 'rival'] as const;

function godStories(c: Ctx): GodStory[] {
  const { r, f, chief, folk, place } = c;
  const mono = MONO.has(f.family);
  const used = new Set<string>();
  return f.deities.map((d, i) => {
    const th = themeOf(d.domain);
    const t = T[th];
    const S: string[] = [];
    const she = /goddess|queen|mother|lady|grandmother|priestess|sister|daughter/i.test(d.domain.split(',')[0]);
    const pr = she ? 'she' : 'he', Pr = cap(pr), pos = she ? 'her' : 'his';
    if (mono && i === 0) {
      S.push(`${d.name} is ${d.domain}, without beginning or end, who made all things and holds them in being.`);
      S.push(`${d.name} has no image and needs none; ${f.tenets.includes('aniconism') ? 'to carve one is the gravest of sins' : 'the faithful know God through the scripture and the saints'}.`);
      S.push(pick(r, [`It is said that ${d.name} has a hundred names, of which the faithful know ninety-nine.`, `${d.name} sees every deed, and will judge every soul at the end of days.`, `Every good thing comes from ${d.name}, and every evil from turning away.`]));
    } else if (mono) {
      const town = place(i);
      if (/prophet/.test(d.domain)) {
        S.push(`${d.name} was born ${town ? `at ${town}` : 'among the poor'}, and worked as a ${pick(r, ['shepherd', 'carpenter', 'merchant', 'potter', 'fisherman'])} until ${pick(r, ['the fortieth year', 'the thirtieth year'])} of ${pos} life, when ${pr} went alone into the wilderness and the word came to ${she ? 'her' : 'him'}.`);
        S.push(`${Pr} preached in the towns and was mocked, then followed, and then hunted by the ${pick(r, ['kings', 'priests of the old gods', 'rulers of the cities'])}. ${pick(r, [`${Pr} was put to death, and ${pos} followers say that ${pr} rose again and was taken up into heaven.`, `${Pr} fled with a handful of followers, and returned at the head of a multitude.`, `${Pr} died old and honoured, and ${pos} tomb is the holiest place of the faith.`])}`);
      } else if (/angel/.test(d.domain)) {
        S.push(`${d.name} is ${d.domain}, first among the servants of God, ${pick(r, ['who carries the word to the prophets', 'who stands at the gate of heaven with a sword of fire', 'who will sound the trumpet at the end of days'])}.`);
        S.push(`${Pr} is shown with wings and ${pick(r, ['a sword', 'a trumpet', 'a pair of scales', 'a book'])}.`);
      } else {
        S.push(`${d.name} was born ${town ? `at ${town}` : 'in a far town'}, ${pick(r, ['the child of a poor family', 'the child of a great lord', 'a foundling raised by monks'])}, and ${pick(r, ['gave away all ' + pos + ' goods to the poor', 'healed the sick with a touch', 'preached to the soldiers and converted many', 'kept the faith through years of prison', 'built the first church of the faith in ' + (town || 'that land')])}.`);
        const end = pick(r, ['was martyred by the unbelievers', 'died in peace in great old age', 'vanished into the wilderness and was never seen again', 'was killed defending the faithful']);
        S.push(`${Pr} ${end}${/vanished/.test(end) ? ', and many wonders are told of ' + pos + ' return' : ', and miracles were soon reported at ' + pos + ' tomb'}. ${Pr} is ${d.domain}, and is shown with ${pick(r, ['a book', 'a staff', 'a lamp', 'a sword', 'a key', 'a lily', 'a chalice', 'a broken chain'])}.`);
      }
    } else {
      if (i === 0) S.push(`${d.name}, ${d.domain}, ${pick(r, t.born)}, and is the eldest and greatest of the gods of the ${f.adherents.replace(/^the /, '')}.`);
      else {
        const chiefShe = /goddess|queen|mother|lady|grandmother/i.test(chief.domain.split(',')[0]);
        const opts = REL.filter((x) => (x !== 'spouse' || (chiefShe !== she && !used.has('spouse'))) && (x !== 'rival' || !used.has('rival')));
        const rel = /queen of the gods|sister-wife|consort/i.test(d.domain) && !used.has('spouse') ? 'spouse' : pick(r, [...opts, 'child', 'sibling']);
        used.add(rel);
        const relText = rel === 'child' ? `is the ${she ? 'daughter' : 'son'} of ${chief.name}` : rel === 'sibling' ? `is ${she ? 'sister' : 'brother'} to ${chief.name}` : rel === 'spouse' ? `is the ${she ? 'wife' : 'husband'} of ${chief.name}` : `is the old rival of ${chief.name}, and they have quarrelled since the world was young`;
        S.push(`${d.name}, ${d.domain}, ${relText}. It is said that ${pr} ${pick(r, t.born)}.`);
      }
      S.push(`${Pr} ${pick(r, t.deed)}.`);
      if (r() < 0.6) S.push(`${Pr} ${pick(r, t.deed.filter((x) => !S.join(' ').includes(x)))}.`);
      S.push(`${cap(pick(r, t.sign))} is sacred to ${she ? 'her' : 'him'}, and the ${folk} offer ${pos} shrines ${pick(r, t.gift)}.`);
    }
    return { name: d.name, domain: d.domain, story: S.join(' ') };
  });
}

// ---- The end, and the dead ---------------------------------------------------------------------------

function ending(c: Ctx): Myth {
  const { r, f, chief, others, folk } = c;
  const has = (t: string) => f.tenets.includes(t);
  const P: string[] = [];
  const foe = pick(r, ['the great wolf', 'the world serpent', 'the lord of the dark', 'the devourer', 'the black dragon']);
  let title = 'The end of days';
  if (has('rebirth') || f.family === 'heaven') {
    title = 'The turning of the wheel';
    P.push(`The world has no end, only turnings. Ages follow one another as the seasons do: a golden age, a silver, a bronze and an iron, each worse than the last, and at the end of the iron age the world is unmade and made again.`);
    P.push(`The souls of the ${folk} are born again and again, higher or lower by their deeds, until ${pick(r, ['they are pure enough to leave the wheel and rest in the light', 'they become one with heaven', 'they join the gods in the stillness beyond the stars'])}.`);
  } else if (f.family === 'serpent' || f.family === 'sun') {
    title = 'The death of the sun';
    P.push(`The sun is old, and must be fed, or it will fail. Every fifty-two years the fires are put out across the land, and the people wait in darkness to learn whether the sun will rise again.`);
    P.push(`One day it will not. ${pick(r, ['The earth will shake and the stars will come down as monsters to devour the last people', 'The sun will fall from the sky and the jaguars of the dark will be loosed', 'The waters will rise from the underworld and drown the land'])}, and the gods will gather once more in the dark to make a new world.`);
  } else if (MONO.has(f.family) || has('endTimes') || has('dualism')) {
    title = 'The day of judgment';
    P.push(`At the end of days ${pick(r, ['a trumpet will sound from heaven', 'the sun will rise in the west', 'the stars will fall like rain', 'a great fire will sweep the world'])}, and the dead will rise from their graves.`);
    P.push(`${has('dualism') ? `The armies of the light and of the dark will meet in the last battle, and every soul must stand on one side or the other.` : `${f.missionary && f.prophet ? `${f.prophet} will return` : 'A deliverer will come'} to lead the faithful against ${foe}, who will be loosed from his prison for a little while.`} ${chief.name} will judge every soul by its deeds: the righteous will dwell in light for ever, and the wicked will be cast out into the fire.`);
    P.push(`Then there will be a new heaven and a new earth, without sorrow or death, ${pick(r, ['and the holy city will come down from the sky', 'and the faithful will see the face of God', 'and the gardens of paradise will have no end'])}.`);
  } else if (has('warriorCult') || f.family === 'oldgods') {
    title = 'The doom of the gods';
    P.push(`There will come three winters with no summer between them, and brother will kill brother, and the bonds of all things will break. ${cap(foe)} will break free and the giants will march on the gods’ hall.`);
    P.push(`${chief.name} will lead the gods and the honoured dead out to the last battle. ${chief.name} will be devoured, ${others[0]?.name ?? 'the thunderer'} will slay the serpent and die of its poison, and fire will consume the world.`);
    P.push(`But the earth will rise again from the sea, green and fair. A few of the gods will survive, and two people hidden in the world tree will come out to begin the race of ${folk} anew.`);
  } else {
    title = 'The end of the world';
    P.push(`The ${folk} say that the world will last as long as ${pick(r, ['the people keep the old rites', 'the sacred fire is kept burning', 'the holy tree stands', 'the gods are remembered'])}. When it fails, ${pick(r, ['the sky will fall', 'the sea will rise over the land', 'the dead will walk', 'the mountains will open'])}.`);
    P.push(`Then ${chief.name} will ${pick(r, ['make the world anew, as it was in the beginning', 'gather the faithful into the hollow hills', 'sleep, and dream another world'])}.`);
  }
  return { title, paragraphs: P };
}

function afterlife(c: Ctx): Myth {
  const { r, f, chief, others, folk } = c;
  const d = f.doctrines.death;
  const has = (t: string) => f.tenets.includes(t);
  const dead = f.deities.find((x) => themeOf(x.domain) === 'dead')?.name;
  const P: string[] = [];
  const how: Record<string, string> = {
    burial: 'The dead are laid in holy ground, facing the rising sun, to wait for the end of days.',
    burning: 'The dead are burned, and their souls rise with the smoke; the hotter the fire, the swifter the journey.',
    barrows: 'The great are laid in mounds with their weapons, horses and treasure, for they will need them on the road.',
    tombs: 'The dead are kept in tombs of stone; the bodies of the great are preserved, so that their souls have a home to return to.',
    sky: 'The dead are laid out on high places for the birds, who carry them back into the sky.',
    sea: 'The dead are set adrift in boats, to sail beyond the edge of the world.',
  };
  P.push(how[d] ?? how.burial);
  if (MONO.has(f.family)) P.push(`The souls of the righteous go to ${chief.name} in paradise, ${pick(r, ['a garden watered by four rivers', 'a city of light', 'the house of many rooms'])}; the wicked are cast into ${pick(r, ['the fire', 'the outer dark', 'the pit'])}; and those between ${pick(r, ['are cleansed by long penance before they enter', 'sleep until the end of days'])}.`);
  else if (has('warriorCult')) P.push(`Those who die bravely in battle are carried to ${chief.name}’s hall, where they feast and fight until the last battle. Those who die in their beds go down to ${dead ?? 'the grey land below'}, where it is cold and dim.`);
  else if (has('rebirth')) P.push(`The soul does not stay with the dead, but is born again within a year, in a body fitting its deeds. The wicked return as beasts, the good as kings and priests.`);
  else if (has('ancestors')) P.push(`The dead stay near the living, in the family shrine, and are fed and asked for counsel. A dead soul that is forgotten becomes a hungry ghost, and haunts the living.`);
  else P.push(`The souls of the dead ${pick(r, ['cross a river and a bridge as narrow as a hair', 'walk a long road to the west', 'go down into the hollow hills', 'climb the world tree to the stars'])}, to the land of ${dead ?? others[0]?.name ?? chief.name}, where ${pick(r, ['it is always evening', 'the ancestors feast in the long halls', 'every pain is forgotten'])}.`);
  if (f.family === 'stars') P.push(`The ${folk} do not die as other peoples do; they fade, or sail into the west, to the land beyond the sea, from which none return.`);
  if (f.family === 'ancestors') P.push(`The dead of the ${folk} return to the stone, and the Maker carves them anew in a later age.`);
  return { title: 'The road of the dead', paragraphs: P };
}

// ---- Legends ---------------------------------------------------------------------------------------

function legends(c: Ctx): Myth[] {
  const { r, f, chief, others } = c;
  const out: Myth[] = [];
  const g = () => pick(r, [chief, ...others]).name;
  if (f.missionary && f.prophet) {
    const at = f.sects[0]?.originName ?? 'the city';
    out.push({
      title: `The calling of ${f.prophet}`,
      paragraphs: [
        `${f.prophet} was a ${pick(r, ['shepherd', 'merchant', 'scribe', 'smith’s apprentice', 'widow’s son', 'soldier'])} of ${at}. ${pick(r, [`In the fortieth year of ${f.prophet}’s life`, `In the thirtieth year of ${f.prophet}’s life`, `In a hard winter, when ${f.prophet} was young`])}, ${pick(r, ['a voice spoke out of a burning tree', 'an angel came at night in a cave above the city', 'a light fell upon the road and blinded the traveller for three days', 'a dream came three nights running'])}, and ${f.prophet} rose and went down into ${at} to preach.`,
        `The ${pick(r, ['priests', 'lords', 'merchants'])} of ${at} drove the prophet out, ${pick(r, ['and only seven followed', 'and a stone thrown in the market left a scar that the faithful still honour', 'and the city was struck by a plague until it repented'])}. The faithful keep the day of the calling as their greatest feast.`,
      ],
    });
  }
  for (const s of f.holySites) {
    if (out.length >= 4) break;
    const w = s.what;
    let P: string[] | null = null;
    let title = s.name;
    if (/mountain|peak/.test(w)) {
      P = [`On the summit of ${s.name}, ${MONO.has(f.family) ? pick(r, [`${f.prophet || 'the prophet'} fasted for forty days and was given the law`, 'a hermit saint lived alone for forty years, fed by ravens', 'an angel appeared to the shepherds']) : pick(r, [`${g()} first set foot upon the world`, `${f.missionary ? f.prophet : g()} fasted for forty days and was given the law`, 'the gods hold their council, hidden in the clouds'])}. ${pick(r, ['No one may climb the last slope but the high priest, once a year.', 'Pilgrims climb it barefoot, carrying a stone to leave at the top.', 'A light is seen on the summit on holy nights.'])}`];
    } else if (/lake/.test(w)) {
      P = [`${s.name} is ${w.replace(/^a |^the /, 'the ')}. ${pick(r, [`It is said that a sword lies beneath its waters, waiting for a ruler worthy of it.`, MONO.has(f.family) ? 'A saint walked upon its waters to reach a drowning child.' : `${g()} rose from its waters when the world began.`, `Offerings of gold and weapons are sunk in it, and none dare fish there.`, `Its waters cure the sick who bathe at dawn on the holy day.`])}`];
    } else if (/grove|forest/.test(w)) {
      P = [`In ${s.name} stands a tree older than the world. ${pick(r, [`The faithful hang ${pick(r, ['offerings', 'the arms of the slain', 'ribbons'])} from its branches.`, `Whoever fells a tree in that forest dies within the year.`, `The druids meet there at the turning of the year, and no other may enter.`])}`];
    } else if (/isle|island/.test(w)) {
      P = [`${s.name} is ${w.replace(/^a |^the /, 'the ')}. ${pick(r, ['The boats of the honoured dead are steered toward it.', 'Hermits have lived there since the faith began, and keep a lamp lit that has never gone out.', 'Only the priests may set foot there.'])}`];
    } else if (/relic|tomb|miracle/.test(w)) {
      title = `The ${w.replace(/^the |^a /, '').replace(/^tomb of a great saint$/, 'saint’s tomb').replace(/^shrine of a holy relic$/, 'relic').replace(/^site of a miracle$/, 'miracle')} of ${s.name}`;
      P = [`At ${s.name} ${pick(r, [`a ${pick(r, ['blind woman', 'lame child', 'dying king'])} was healed on the steps of the temple, and the stone still bears the mark of ${pick(r, ['a hand', 'a knee', 'a tear'])}.`, `the ${pick(r, ['bones', 'cloak', 'staff', 'cup'])} of a saint is kept in a golden box, and carried through the streets once a year.`, `the river parted so that the faithful could flee their persecutors.`])}`];
    }
    if (P) out.push({ title, paragraphs: P });
  }
  return out;
}

// ---- Putting it together ---------------------------------------------------------------------------

/**
 * The myths of a faith. `peoples`: the names of the peoples who keep it (or kept it), `elder`
 * names an unnamed primordial being in the faith's tongue.
 */
export function faithMyths(f: Faith, peoples: string[]): FaithMyths {
  const r = mulberry32(hashString(`myths#${f.id}#${f.name}#${f.prophet}`));
  const chief = f.deities[0] ?? { name: 'the Creator', domain: 'the creator' };
  const others = f.deities.slice(1);
  const folk = peoples[0] ?? 'people';
  const elder = f.lang ? cap(f.lang.givenName(mulberry32(hashString(`elder#${f.id}#${f.name}`)), false, true)) : 'the first giant';
  const places = [...f.holySites.map((h) => h.name), ...f.sects.map((s) => s.originName)].filter(Boolean);
  const c: Ctx = { r, f, chief, others, folk, place: (i) => places[(i * 7) % Math.max(1, places.length)] ?? '', elder };
  return { creation: creation(c), gods: godStories(c), end: ending(c), afterlife: afterlife(c), legends: legends(c) };
}
