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

export const THEME_WORDS: [Theme, RegExp][] = [
  ['sky', /all-father|king of the gods|father of all|great spirit|creator|one god|eternal sky|^heaven|jade lord|lady of the stars|high heavens|celestial dome|lord of the azure|sky-father|cloud-weaver/i],
  ['dead', /dead|death|underworld|slain|nine underworld|cold spirits|flayed|shades|ghosts|nether-realm|lord of bones|phantom|sepulcher|mortem/i],
  ['tomb', /tomb|mausoleum|crypt|sarcophagus|burial vault|ossuary|death-chamber|resting place/i],
  ['gate', /gate|bridge|threshold|portals|archway|frontier|boundary|limbo|crossing/i],
  ['thunder', /thunder|storm|lightning|tempest|storm-bringer|bolt-thrower|rumbling sky|flash-fire|cyclone/i],
  ['sea', /\bsea\b|ocean|deep waters|sailors|dragon king|tide|abyss|mariner|leviathan|salt-realm|maelstrom|waves/i],
  ['sun', /\bsun\b|dawn|morning star|solar|golden disc|daylight|noon|radiance|helios|sol invictus|day-bringer/i],
  ['moon', /moon|lunar|silver bow|night-lamp|crescent|night-queen|selene|hail-night|phase-walker/i],
  ['star', /star|starlight|constellation|astral|stellar|night-beacon|cosmos|astronomer|stargazer/i],
  ['war', /war|battle|combat|siege|archery|soldiers|bloodshed|warrior|spear-master|blood-iron|conqueror|slaughter|shield-wall/i],
  ['love', /love|beauty|marriage|passion|desire|heart|romance|amorous|couple|beloved|venus|aphrodite/i],
  ['harvest', /harvest|maize|rice|fertility|grain|crop|sow|reap|barley|wheat|fields|bountiful|cornucopia/i],
  ['forge', /forge|smith|craft|mason|builders|stone-hewing|anvil|hammer|metalwork|foundry|ore-master|artisan/i],
  ['trick', /trickster|thieves|fox|smoking mirror|mischief|deception|knave|illusionist|slippery|cunning|joke/i],
  ['hunt', /hunt|bow|stalker|tracker|forest-stride|quarry|arrow|wild-chase|hounds|game-master/i],
  ['wisdom', /wisdom|sage|lore|memory|knowledge|truth|philosopher|oracle|seer|mind|intellect/i],
  ['hearth', /hearth|home|fireside|domestic|chimney|family-fire|warmth|house-spirit|flame-tender/i],
  ['earth', /earth|land|mother\b|mother,|the mother|soil|ground|terra|dirt|roots|gaia|world-body/i],
  ['water', /river|well|spring|cenote|water|lake|streams|brook|cascade|fountain|aquifer|liquid/i],
  ['wind', /wind|autumn|gale|breeze|zephyr|tornado|gust|air|breath|tempest-air/i],
  ['mountain', /mountain|peak|pass|summit|high-tor|crag|cliff|stone-giant|highland|alp/i],
  ['dream', /dream|vision|somnus|nightmare|slumber|sleeper|moth|illusion|subconscious/i],
  ['fate', /fate|weaver|destiny|doom|spinning wheel|threads|necessity|moira|inevitable/i],
  ['revel', /wine|revel|feast|maddness|joy|merry|sexual intercourse|orgy|debauchery|cup-bearer|drinker|jubilee|banquet/i],
  ['travel', /travel|merchant|pilgrim|messenger|rainbow|wayfarer|roads|crossroads|pathfinder|wanderer/i],
  ['beast', /beast|horse|wolf|bear|buffalo|llama|herd|serpent|horned|fauna|wildlife|pack|creature/i],
  ['healing', /heal|medicine|cure|salve|remedy|physician|apothecary|wholeness|soothe|restorative/i],
  ['mercy', /mercy|compassion|charity|poor|lost causes|pity|grace|forgiveness|kindness|orphans|benevolence/i],
  ['rain', /rain|shower|downpour|storm-water|precipitation|monsoon|cloud-burst|drizzle/i],
  ['night', /night|midnight|darkness|shadow|evening|nocturnal|dark-realm|twilight|moon|dreams|mystery|gloaming/i],
  ['learning', /learning|scholar|examination|literature|jurist|revelation|academy|scripture|reading|scribal/i],
  ['judge', /judg|wrath|last day|mandate|arbitrator|law-giver|sentence|scales|punishment|verdict/i],
  ['fertility', /childbearing|children|weav|womb|birth|progeny|nursery|seedling|generation|matron/i],
  ['stone', /stone|veins|underground|rock|mineral|crystal|gems|bedrock|flint|obsidian|boulder/i],
  ['sky', /sky|heaven|celestial|all-father|king of the gods|father of all|great spirit|creator|one god|jade lord|firmament/i],
];
function themeOf(domain: string): Theme {
  for (const [t, re] of THEME_WORDS) if (re.test(domain)) return t;
  return 'sky';
}

export const T: Record<Theme, { sign: string[]; deed: string[]; gift: string[]; born: string[] }> = {
  sky: {
    sign: [
      'the eagle',
      'the white bull',
      'the high throne',
      'the scepter of light',
      'the feather of truth',
      'the soaring falcon'
    ],
    deed: [
      'set the sky upon four pillars so that it would not fall',
      'divided the day from the night and gave each its hours',
      'holds the oaths of kings and punishes those who break them',
      'swallowed the chaos-dragon and bound its bones into the vault of Heaven',
      'cast down the towering mountain that sought to pierce the highest sphere',
      'decreed the sacred laws by which both gods and mortals are bound'
    ],
    gift: [
      'the first fruits of every harvest',
      'a white beast at midsummer',
      'incense burned upon high hilltops',
      'a flawless white ram sacrificed under the noon sun',
      'golden crowns left at the highest altar',
      'pourings of unmixed wine at the coronation of kings'
    ],
    born: [
      'was the first to wake in the dark',
      'rose from the first breath of the world',
      'emerged from the golden primordial egg that split the void',
      'was carved from the crystal vault of the first sky',
      'sprang fully grown from the silent thought of the supreme void',
      'woke when the first beam of light pierced the ancient mist'
    ]
  },
  thunder: {
    sign: [
      'the hammer',
      'the goat',
      'the oak struck by lightning',
      'the bronze chariot',
      'the jagged spear',
      'the double-headed axe'
    ],
    deed: [
      'fought the great serpent and drove it into the deep',
      'splits the clouds so that the rain may fall on the fields',
      'guards the gods’ hall against the giants of frost',
      'struck the mountain peak in two to let the trapped waters flow',
      'forged the first bolt of lightning from molten star-iron',
      'shattered the iron gates of the sky to unleash the spring storm'
    ],
    gift: [
      'ale poured on the stones',
      'a goat at the spring storms',
      'iron weapons buried in oak groves',
      'a red bull slain before the autumn ploughing',
      'sparks struck from flint over the hearth fire',
      'a vessel of dark beer buried at the foot of an oak'
    ],
    born: [
      'was born in a clap of thunder',
      'sprang from the clash of the sky and the sea',
      'was born from a spark struck when the first iron hit the rock',
      'hatched from a storm-cloud over the highest peak',
      'was cut from the heart of a burning oak tree',
      'leaped from the sky-father’s belt during the first tempest'
    ]
  },
  sea: {
    sign: [
      'the trident',
      'the whale',
      'the white horse of the waves',
      'the conch shell',
      'the iron anchor',
      'the leviathan'
    ],
    deed: [
      'raised the islands from the deep and sank those who angered him',
      'taught the first sailors to read the waves',
      'keeps the drowned in halls of coral beneath the waves',
      'stirred the primary ocean with his spear to distill the salt of the earth',
      'bound the sea-monsters in dark trenches until the end of days',
      'swallowed the fleet of the wicked empire in a single whirlpool'
    ],
    gift: [
      'wine poured into the sea before a voyage',
      'a horse driven into the surf',
      'black pearls left upon the tide-line',
      'silver coins tossed into the deep water',
      'the first catch of every fishing net cast back into the foam',
      'a carved wooden hull filled with oil and set ablaze'
    ],
    born: [
      'rose from the foam of the first wave',
      'was born in the deep before the land was made',
      'sprang from the tears shed by the earth when the land was torn',
      'was hatched from a sea-shell cradled in abyssal darkness',
      'rose from the abyss when the sky first touched the water',
      'was born in the heart of a ocean storm that lasted a hundred years'
    ]
  },
  sun: {
    sign: [
      'the golden disc',
      'the falcon',
      'the chariot of fire',
      'the golden lotus',
      'the rooster',
      'the radiant crown'
    ],
    deed: [
      'drives the burning chariot across the sky each day',
      'fought the night on the first morning and has fought it every dawn since',
      'gave fire to the first people in a hollow reed',
      'blinded the shadow-king with a single glance of his golden eye',
      'melts the winter frost each year to awaken the sleeping fields',
      'carved the path of the twelve hours across the sky with a sunbeam'
    ],
    gift: [
      'gold and honey on the longest day',
      'songs at dawn',
      'sunflowers and golden grain offered at noon',
      'pure beeswax candles lit on the summer solstice',
      'a white stallion led to the altar at sunrise',
      'golden coins melted down in the temple braziers'
    ],
    born: [
      'was born from the first fire',
      'hatched from a golden egg at the edge of the world',
      'sprang from the open lotus that floated on the primeval waters',
      'rose from the glowing heart of the first mountain',
      'was birthed by the dawn-mother upon the eastern peak',
      'was forged in the solar furnace before time began'
    ]
  },
  moon: {
    sign: [
      'the silver bow',
      'the hare',
      'the white doe',
      'the silver crescent',
      'the mirror of water',
      'the owl of midnight'
    ],
    deed: [
      'walks the night sky and keeps watch while the sun sleeps',
      'counts the months and turns the tides',
      'guards travellers and women in childbirth by night',
      'drew the veil of silver light to hide the world from shadow-beasts',
      'soothed the madness of the first beasts with her gentle light',
      'wove the silver roads through the night sky for lost souls'
    ],
    gift: [
      'milk and white flowers at the full moon',
      'silver left at crossroads',
      'bowls of clear water set out to reflect the moon',
      'white silk ribbons tied to willow branches',
      'pearls dropped into silent woodland pools',
      'cakes of fine white flour baked under the night sky'
    ],
    born: [
      'was born from a tear of the sun',
      'was cut from the sun’s own light',
      'rose from the sea when the sun first set beneath the horizon',
      'was born of a silver thread spun by the fate-weavers',
      'sprang from the cold mirror held by the night goddess',
      'woke in a cradle of pearl upon the first midnight'
    ]
  },
  star: {
    sign: [
      'the silver star',
      'the swan',
      'the harp',
      'the silver compass',
      'the constellation banner',
      'the night-bloom'
    ],
    deed: [
      'kindled the stars one by one and named each of them',
      'sang the paths of the stars so that sailors would never be lost',
      'weaves starlight into the dreams of the faithful',
      'pinned the sky vault to the pole so the world would not tilt',
      'scattered silver dust across the void to guide wandering spirits',
      'wrote the fate of empires in constellations across the dark'
    ],
    gift: [
      'songs under the open sky',
      'lamps set adrift on still water',
      'silver needles and clear crystal left on high rocks',
      'hymns sung at the rising of the evening star',
      'bowls of sweet oils burned under the clear night',
      'fine linen woven with silver thread left at the sanctuary'
    ],
    born: [
      'woke under the first stars',
      'was the first light in the dark',
      'sprang from the sparks struck when the sky-vault was forged',
      'was born from the silver ashes of a fallen moon',
      'rose from the quietest thought of the void',
      'was birthed by the night sky on the coldest winter eve'
    ]
  },
  dead: {
    sign: [
      'the raven',
      'the black hound',
      'the key of the underworld',
      'the cypress bough',
      'the iron coin',
      'the skull crown'
    ],
    deed: [
      'was the first to die, and so became ruler of all who follow',
      'weighs the souls of the dead and sends each to its place',
      'keeps the gates of the underworld, which open only inward',
      'judges the deeds of kings and serfs with absolute impartiality',
      'tricked the shadow-demons into building the road of the dead',
      'bound the unquiet ghosts in chains of cold iron'
    ],
    gift: [
      'bread and salt left at graves',
      'black beasts at the turning of the year',
      'silver coins placed upon the eyes of the deceased',
      'libations of dark wine poured into open grave-trench',
      'incense of myrrh burned at twilight',
      'black wool blankets given to the poor in memory of the dead'
    ],
    born: [
      'was born in the dark beneath the roots of the world',
      'came out of the first grave',
      'was born when mortality first entered the mortal mind',
      'sprang from the shadow cast by the first living creature',
      'woke in the cold earth before the first tree took root',
      'was birthed by the silent night when the first life ended'
    ]
  },
  war: {
    sign: [
      'the spear',
      'the wolf',
      'the red banner',
      'the bronze helm',
      'the iron gauntlet',
      'the vulture'
    ],
    deed: [
      'led the gods to victory in the first war, and was wounded nine times',
      'chooses who will fall in each battle',
      'taught the first warriors the shield wall',
      'broke the impenetrable wall of the elder giants with a single blow',
      'bathed his blade in dragon-fire to make it unbreakable',
      'turned the tide of ten thousand battles with his war-cry'
    ],
    gift: [
      'captured arms hung in the temples',
      'the blood of a bull before a war',
      'trophy banners taken from fallen enemies',
      'a notched sword buried in red clay',
      'libations of strong spirits poured on war-drums',
      'the iron horseshoes of a war-stallion offered after victory'
    ],
    born: [
      'sprang full-armed from the head of the sky father',
      'was born on a battlefield among the slain',
      'was forged in the blood and fire of the first murder',
      'sprang from the thunderclap that ended the age of peace',
      'was born of a war-goddess who drank the blood of dragons',
      'woke from the earth when the first bronze spear was cast'
    ]
  },
  love: {
    sign: [
      'the dove',
      'the rose',
      'the mirror',
      'the golden apple',
      'the myrtle wreath',
      'the pair of swans'
    ],
    deed: [
      'bound the first lovers with a golden thread',
      'wept over a dead lover until the first flowers grew from her tears',
      'rules the hearts of gods and mortals alike',
      'reconciled two warring pantheons with a single smile',
      'tamed the wild beast of the forest with sweet song and gentle touch',
      'healed the broken spirit of the earth with the gift of devotion'
    ],
    gift: [
      'flowers and sweet cakes',
      'doves set free at weddings',
      'honeycomb and sweet wine placed on private altars',
      'woven rings of myrtle and wild rose',
      'perfumed oils burned in alabaster lamps',
      'silk ribbons inscribed with secret vows'
    ],
    born: [
      'rose from the foam of the sea',
      'was born from the first kiss between the sky and the earth',
      'sprang from a blossom that opened under the first morning star',
      'was born from the laughter of the high goddess',
      'hatched from a crystal egg cradled in a bed of roses',
      'emerged from the warm spring dew on the morning of creation'
    ]
  },
  harvest: {
    sign: [
      'the sheaf',
      'the sickle',
      'the sow',
      'the cornucopia',
      'the golden stalk',
      'the threshing floor'
    ],
    deed: [
      'taught the first people to sow and reap',
      'dies each autumn with the fields and rises again in spring',
      'brought the first seed out of the underworld',
      'blessed the barren soil when the great famine struck',
      'drove away the locust-swarm with a golden sickle',
      'stored the life-force of the earth in the first grain kernel'
    ],
    gift: [
      'the last sheaf of the harvest',
      'bread baked from the first grain',
      'a fat sow offered at the autumn equinox',
      'vessels of new beer and sweet cider',
      'garlands of wheat and poppies hung over granary doors',
      'the first loaf of winter bread broken and given to strangers'
    ],
    born: [
      'grew from a seed planted by the earth mother',
      'was born in a furrow',
      'sprang from the golden dust of the first autumn harvest',
      'was born when the first rain struck the plowed field',
      'emerged from a sacred granary guarded by serpents',
      'was birthed in a golden basket woven from wheat straws'
    ]
  },
  forge: {
    sign: [
      'the hammer and anvil',
      'the tongs',
      'the smoking mountain',
      'the crucible',
      'the bellows',
      'the iron spark'
    ],
    deed: [
      'forged the weapons of the gods and the chains of the great wolf',
      'built the gods’ halls of bronze and gold',
      'made the first people from metal, and then from clay when the metal ran short',
      'trapped the treacherous god of fire inside an iron cage',
      'crafted the golden plow that carved the first rivers',
      'smelted the sky-metal into armor that no blade can pierce'
    ],
    gift: [
      'the first work of every new smith',
      'iron nails driven into holy trees',
      'coal and iron ore piled at the forge altar',
      'a blade quenched in holy spring water',
      'fine bronze vessel filled with tallow and oil',
      'the scrap-iron of a broken plow offered in gratitude'
    ],
    born: [
      'was born lame and thrown from the sky, and learned the forge in the deep',
      'was born in the fire of a mountain',
      'sprang from the spark struck by the first hammer fall',
      'was forged from cold iron in the subterranean furnace',
      'rose from the slag heap of the world’s creation',
      'was birthed by the volcano-mother amidst ash and flame'
    ]
  },
  trick: {
    sign: [
      'the fox',
      'the crow',
      'the mask',
      'the crooked staff',
      'the double tongue',
      'the loaded dice'
    ],
    deed: [
      'stole fire from the gods for the first people',
      'tricked death into a sack and let it go again for a price',
      'shapes himself into any beast, and has fathered strange children',
      'stole the moon and hid it in a leather bag to outwit the sun',
      'fooled the warlord into surrendering his army without a fight',
      'swapped the holy scriptures with a book of tavern songs'
    ],
    gift: [
      'the first cup of every feast, spilled',
      'jokes and riddles at the winter feast',
      'a silver coin with two heads left at the tavern threshold',
      'stolen sweets left at a hollow tree',
      'a broken lock or key left at the crossroads',
      'a mask carved from willow wood buried in autumn'
    ],
    born: [
      'was born of a giant and a goddess, and belongs to neither',
      'was never born, and simply was',
      'was born from a lie told by the sky father',
      'sprang from a shadow that detached itself from a campfire',
      'was birthed during an eclipse when light and dark were confused',
      'hatched from a crow’s egg laid in a fox’s den'
    ]
  },
  hunt: {
    sign: [
      'the stag',
      'the bow',
      'the hound',
      'the horn',
      'the silver arrowhead',
      'the boar spear'
    ],
    deed: [
      'hunts the wild places at night with a pack of white hounds',
      'taught the first hunters to give thanks for every kill',
      'turned a hunter who spied on her into a stag',
      'slain the giant shadow-bear that devoured the high mountain herds',
      'bound the wild beasts with a cord woven from silver grass',
      'carved the secret trails through the deep forest that no prey can hide from'
    ],
    gift: [
      'the heart of the first kill of the year',
      'antlers hung over the door',
      'the hide of an unblemished stag',
      'silver arrowheads buried under the roots of an ash tree',
      'the first draught of water taken from a mountain stream',
      'feathers of a hunting hawk laid upon the stone altar'
    ],
    born: [
      'was born in the deep forest',
      'was nursed by a she-wolf',
      'sprang from the rustle of dry leaves in the primeval woods',
      'was born under the horn of the hunters’ moon',
      'was birthed by a mountain nymph beneath an ancient pine',
      'woke in a lair of moss and deer-bones at the world’s dawn'
    ]
  },
  wisdom: {
    sign: [
      'the owl',
      'the open book',
      'the well of memory',
      'the eye of amber',
      'the scroll of laws',
      'the silver lamp'
    ],
    deed: [
      'gave an eye for a drink from the well of wisdom',
      'hung nine nights on the world tree to learn the runes',
      'taught the first sages to write',
      'solved the unsolvable riddle of the sphinx to save the city',
      'counted every leaf upon the world tree and recorded their names',
      'wove the first alphabet from the pattern of flying cranes'
    ],
    gift: [
      'the first page of every book',
      'lamps lit through the night',
      'vessels of ink and polished quill pens',
      'a silver coin left in a hollow stone at a place of study',
      'scrolls of philosophy burned as incense in the shrine',
      'pure spring water poured into a stone basin'
    ],
    born: [
      'was born from the head of the sky father',
      'woke already old and knowing',
      'was birthed from the reflection of the stars upon the deep well',
      'sprang from the first secret whispered between the ancient gods',
      'rose from the ash of the sacred scroll burned in the first temple',
      'was born from the silence that followed the world’s creation'
    ]
  },
  hearth: {
    sign: [
      'the flame',
      'the cauldron',
      'the hearthstone',
      'the woven blanket',
      'the iron pot',
      'the house key'
    ],
    deed: [
      'keeps the fire burning in every home',
      'gave up her throne among the gods to tend the hearth',
      'guards the bond between host and guest',
      'drove the cold winter demon from the first human settlement',
      'blessed the first hearthstone laid in the wilderness',
      'curse the host who breaks the law of bread and salt'
    ],
    gift: [
      'the first portion of every meal, put in the fire',
      'a fire that never goes out',
      'poured fat and oil upon the domestic hearth',
      'sweet bread baked with honey placed by the chimney',
      'a bundle of dried lavender and sage burned in the hearth',
      'clean water sprinkled upon the floor before the threshold'
    ],
    born: [
      'was the eldest of the gods, born first and freed last',
      'was born from a spark of the first fire',
      'sprang from the warm ashes of the world-creator’s hearth',
      'was birthed in the center of the first house built by mortal hands',
      'rose from the smoke that ascended from the first sacrifice',
      'was born when the first family gathered together against the cold'
    ]
  },
  earth: {
    sign: [
      'the cow',
      'the stone',
      'the round mound',
      'the clay bowl',
      'the cavern entrance',
      'the fertile soil'
    ],
    deed: [
      'bore the mountains and the rivers and all that grows',
      'sleeps beneath the fields, and her breath is the spring',
      'takes back all the dead into her body',
      'swallowed the army of the wicked king in a single fissure',
      'gave her own flesh to form the clay from which humanity was molded',
      'anchored the restless continents upon the subterranean ocean'
    ],
    gift: [
      'milk poured on the ground',
      'the first bread of the year, buried',
      'vessels of dark wine and honey poured into deep crevices',
      'smooth river stones painted with sacred red ochre',
      'unblemished grain buried in clay jars before planting',
      'the blood of a black heifer poured directly upon the soil'
    ],
    born: [
      'was there before all others',
      'was the body of the world itself',
      'rose from the primeval sludge when the waters receded',
      'was birthed from the great void before the sun took light',
      'sprang from the deep slumber of the elder cosmos',
      'emerged fully formed when the sky first embraced the chaos'
    ]
  },
  water: {
    sign: [
      'the salmon',
      'the cup',
      'the spring',
      'the lotus blossom',
      'the water lily',
      'the silver jar'
    ],
    deed: [
      'dwells in every holy spring and heals those who come in faith',
      'gave the first river its course',
      'drowned the proud king who fouled her well',
      'cleansed the land of ancient filth with a hundred-day flood',
      'turned a drought-stricken valley into a fertile oasis with her tears',
      'guarded the cauldron of inspiration in the deep lake'
    ],
    gift: [
      'coins and pins thrown into wells',
      'ribbons tied to trees by springs',
      'silver rings dropped into clear mountain streams',
      'bowls of goat’s milk set floating down the river',
      'unrefined salt sprinkled over natural water sources',
      'garlands of fresh wild mint cast into the rapids'
    ],
    born: [
      'welled up from beneath the roots of the world',
      'was born from a mountain’s tears',
      'sprang from the mist when the sun first warmed the cold rocks',
      'was birthed by a cloud that condensed upon the sacred peak',
      'rose from the subterranean river that flows beneath the underworld',
      'was born from the first rain drop that struck the dry earth'
    ]
  },
  wind: {
    sign: [
      'the four horns',
      'the falling leaf',
      { sign: 'the kite' }.sign, // keeping string structure clean
      'the feather',
      'the wind-vane',
      'the howling shell'
    ],
    deed: [
      'carries the souls of the dead beyond the sea',
      'scatters the seeds and brings the seasons',
      'blows the ships of the faithful safely home',
      'drove back the pestilence-cloud with a mighty gale',
      'stole the voices of the proud and scattered them across the hills',
      'whispered the secret names of the gods into the ears of the first seers'
    ],
    gift: [
      'feathers and leaves cast into the wind',
      'songs on high places',
      'incense burned on open windy ridges',
      'prayer banners set on high mountain passes to catch the breeze',
      'flour scattered from the palm into a autumn draft',
      'chimes hung from high branches that sing in the gale'
    ],
    born: [
      'was the first breath of the world',
      'was born in the clash of four winds',
      'sprang from the sigh of the earth when the sky father departed',
      'was birthed by the gale that tore the first mountain asunder',
      'woke in the high sky before the birds were given wings',
      'rose from the rush of air beneath the wings of the celestial eagle'
    ]
  },
  mountain: {
    sign: [
      'the peak',
      'the ram',
      'the white stone',
      'the cedar tree',
      'the granite crag',
      'the snow cap'
    ],
    deed: [
      'holds up the sky on his shoulders',
      'guards the passes and lets through only the worthy',
      'hid the first people in the mountain while the flood passed',
      'crushed the rebellious titan beneath a million tons of granite',
      'spat fire and ash to destroy the invading dragon-horde',
      'turned an invading fleet to stone when they approached his coast'
    ],
    gift: [
      'cairns built on the passes',
      'white stones carried to the summit',
      'horns of mountain rams offered at the tree line',
      'coins buried beneath cairn stones on high tracks',
      'cups of barley liquor poured upon bare rock',
      'iron pitons driven into the stone face with prayer'
    ],
    born: [
      'rose from the earth when the world was young',
      'was the first mountain',
      'sprang from a bone of the elder giant slain in the primordial war',
      'was birthed when the earth mother thrust her spine toward the sky',
      'carved itself out of the deep rock before the valleys were hollowed',
      'was formed from the frozen throne of the winter king'
    ]
  },
  dream: {
    sign: [
      'the poppy',
      'the moth',
      'the veiled lamp',
      'the silver key',
      'the spider web',
      'the dark mirror'
    ],
    deed: [
      'walks in the dreams of the faithful and shows them what will be',
      'keeps the dreams of the dead',
      'gave the first seers their sight',
      'trapped the nightmare-demon inside an ivory box',
      'led the lost king back to his throne through a series of visions',
      'wove the tapestry of illusions that veils the true world from mortals'
    ],
    gift: [
      'incense burned before sleep',
      'dreams told aloud at dawn',
      'dried poppy heads laid beneath the pillow',
      'silver coins placed in bowls of water beside the bed',
      'small dream-catchers woven from willow and spider-silk',
      'cups of warm milk mixed with honey and nightshade'
    ],
    born: [
      'was dreamed by the first god before the world began',
      'was born on the night between two years',
      'sprang from the shadow that sits between waking and sleep',
      'was birthed from the mist that rises over the river of forgetfulness',
      'rose from the first quiet sigh of a sleeping child',
      'was born when the moon first cast shadows across the earth'
    ]
  },
  fate: {
    sign: [
      'the spindle',
      'the web',
      'the three threads',
      'the shears',
      'the loom of stone',
      'the hourglass'
    ],
    deed: [
      'spins the thread of every life, and cuts it when it is done',
      'wove the fate of the gods themselves',
      'sits at the roots of the world tree and waters it',
      'decreed the exact day and hour when the world shall end',
      'bound the dragon of chaos in a net woven from destiny',
      'wrote the unalterable book of deeds in letters of starlight'
    ],
    gift: [
      'a thread from every new cloth',
      'silence at births',
      'unspun wool and silver needles left at the well',
      'braided locks of hair offered at the turning of the year',
      'small iron shears buried beneath the threshold',
      'a vessel of clean spring water poured at the roots of an ash'
    ],
    born: [
      'was older than the gods, and none know her birth',
      'came out of the well of fate',
      'was born before light and dark were separated from the void',
      'sprang from the first thought of necessity in the cosmos',
      'was birthed by the silence before the first word was spoken',
      'emerged from the loom of time when the universe took shape'
    ]
  },
  revel: {
    sign: [
      'the vine',
      'the panther',
      'the cup',
      'the ivy crown',
      'the pine-cone staff',
      'the bronze cymbal'
    ],
    deed: [
      'wanders the world with a wild train of revellers',
      'taught the first people to make wine',
      'died and rose again in the vine',
      'drove the tyrant mad so that he tore down his own palace',
      'turned the pirate crew that captured him into leaping dolphins',
      'unbound the chains of the slaves and set them dancing in the streets'
    ],
    gift: [
      'wine poured on the ground',
      'dances through the night',
      'garlands of ivy and wild grapevines hung on shrine posts',
      'the first bowl of fermented grape-must from the autumn press',
      'goat-skins filled with sweet wine left at the forest edge',
      'wild, uninhibited song sung under the full moon'
    ],
    born: [
      'was born twice, once of his mother and once of his father',
      'was born in the vineyards',
      'sprang from the thigh of the sky-father amidst lightning-bolts',
      'was birthed in a cave guarded by dancing nymphs',
      'rose from the crushed sweet grapes of the first harvest',
      'was born of a mortal princess consumed by divine fire'
    ]
  },
  travel: {
    sign: [
      'the staff',
      'the winged sandal',
      'the milestone',
      'the cloak of grey',
      'the broad hat',
      'the crossroads pillar'
    ],
    deed: [
      'carries messages between the gods and mortals',
      'guides the souls of the dead on their road',
      'watches over every crossroads, market and inn',
      'stole the herd of the sun-god while still wrapped in his swaddling clothes',
      'carved the first road through the wilderness with his staff',
      'tricked the giant sentry so the heroes could pass the narrow bridge'
    ],
    gift: [
      'a coin left at crossroads',
      'cairns along the roads',
      'worn sandals hung on milestone posts',
      'small iron keys left in hollow stones by the highway',
      'a cup of clear water left outside the gate for wanderers',
      'fat and bread shared with strangers at a roadside shrine'
    ],
    born: [
      'was born at a crossroads',
      'was born at dawn and stole a herd by noon',
      'sprang from the dust kicked up by the first wanderer',
      'was birthed in a mountain cave at the meeting of three borders',
      'rose from the wind that blows across open plains',
      'was born of a star and a cloud that never stayed in one place'
    ]
  },
  beast: {
    sign: [
      'the horse',
      'the wolf',
      'the bear',
      'the horned stag',
      'the great boar',
      'the mountain lion'
    ],
    deed: [
      'ran before the first people and led them to their land',
      'gave the herds to the first people and teaches the young their ways',
      'was the forebear of the first of the people’s kings',
      'slain the hunter who killed beasts for pleasure rather than food',
      'led the wild hunt through the clouds on the winter solstice',
      'protected the sacred forest from the woodcutter’s axe'
    ],
    gift: [
      'the first foal of the year',
      'skulls hung in holy trees',
      'horns and antlers piled at the forest edge',
      'sweet fats and marrow bones left on wild rocks',
      'unstripped hides laid before the sacred grove',
      'bowls of fresh milk placed at the forest border'
    ],
    born: [
      'came out of the forest at the beginning of the world',
      'was born of the moon and a mare',
      'sprang from the heart of the primeval wilderness',
      'was birthed by the great cave-bear in the deep mountain',
      'rose from the soil where the first beast shed its blood',
      'was born from the union of the forest god and a wild wolf'
    ]
  },
  healing: {
    sign: [
      'the serpent staff',
      'the herb',
      'the bear',
      'the silver bowl',
      'the alabaster jar',
      'the golden leaf'
    ],
    deed: [
      'taught the first healers the herbs of the field',
      'raised a dead man, and was punished for it by the sky father',
      'sleeps through the winter and wakes the world in spring',
      'drew the poison of the chaos-serpent out of the earth mother',
      'cleansed the great plague-city using boiling water and sacred sage',
      'discovered the elixir of eternal life in the root of a mountain lotus'
    ],
    gift: [
      'wax models of healed limbs',
      'herbs hung at the temple door',
      'vessels of clean spring water and sweet honey',
      'silver pins pushed into sacred wooden shrines',
      'bundles of dried sage, yarrow, and nightshade burned on the altar',
      'crutches and bandages left at the holy well by those restored'
    ],
    born: [
      'was cut from his dying mother’s womb',
      'was born in a cave of healing waters',
      'sprang from a drop of divine nectar that fell upon a medicinal herb',
      'was birthed by the sun goddess to soothe the ills of mortal flesh',
      'rose from the sacred pool when the world was young',
      'was born of a gentle nymph who knew the speech of plants'
    ]
  },
  mercy: {
    sign: [
      'the open hand',
      'the lotus',
      'the lamp',
      'the white veil',
      'the weeping eye',
      'the olive branch'
    ],
    deed: [
      'hears every prayer of the poor and the suffering',
      'refused paradise until every soul could enter',
      'gave away all she had and was given back a hundredfold',
      'stepped between the executioner’s blade and the repentant sinner',
      'poured healing balm into the wounds of enemy warriors',
      'turned the vengeful judge’s heart to compassion with a single tear'
    ],
    gift: [
      'alms given in her name',
      'lamps lit for the sick',
      'vessels of pure oil for shrine lamps',
      'white cloths laid upon the steps of her sanctuary',
      'loaves of white bread distributed to widows and orphans',
      'debts forgiven and captives released on her feast day'
    ],
    born: [
      'was born a mortal and raised up for her compassion',
      'was born of a tear of the highest god',
      'sprang from the heart of the first mother who prayed for her child',
      'was birthed when the first act of forgiveness was shown',
      'emerged from the white blossom that grew on a battlefield',
      'rose from the quiet sighs of the innocent and suffering'
    ]
  },
  rain: {
    sign: [
      'the frog',
      'the jar',
      'the cloud',
      'the dragon',
      'the lightning flash',
      'the rainbow bridge'
    ],
    deed: [
      'pours the rain from great jars when the people are faithful',
      'withheld the rain for seven years when the people forgot him',
      'sends the storms of the wet season',
      'slain the drought-demon that drank up all the rivers of the earth',
      'rides the storm-dragon across the sky to strike the dry soil',
      'opened the doors of the sky-reservoir with a bronze key'
    ],
    gift: [
      'the blood of children in the old days, now incense and maize',
      'songs and drums at planting',
      'jars of clean spring water buried in dry fields',
      'clay figures of frogs left at mountain shrines',
      'maize-cakes soaked in sweet water offered before sowing',
      'drums struck in unison at the first sign of the thunderhead'
    ],
    born: [
      'was born in the clouds over the mountains',
      'came out of the sacred well',
      'sprang from the breath of the sea dragon',
      'was birthed in the dark vault beneath the lake',
      'rose from the steam when fire first touched cold water',
      'was born of a thunder-cloud that broke over the dry plain'
    ]
  },
  night: {
    sign: [
      'the jaguar',
      'the obsidian mirror',
      'the owl',
      'the black cloak',
      'the eclipse',
      'the smoking mirror'
    ],
    deed: [
      'sees all deeds in his mirror of smoke',
      'brings the night and the fears that walk in it',
      'tempts the proud and breaks them',
      'stole the sun’s warmth and hid it in an obsidian cavern',
      'prowls the shadow-realm testing the hearts of sleeping men',
      'draped the velvet mantle of dark across the burning sky'
    ],
    gift: [
      'obsidian blades',
      'offerings at midnight',
      'black candles lit at the moonless hour',
      'bowls of dark soot mixed with water set outside the door',
      'copal incense burned in dark underground chambers',
      'sacrifices of black fowl offered before the shadow-altar'
    ],
    born: [
      'was born of the dark before the first sun',
      'was the shadow of the first god',
      'sprang from the void when the first fire flickered out',
      'was birthed by the primordial chaos before light was spoken',
      'rose from the dark abyss beneath the underworld',
      'woke in the endless night before the world took shape'
    ]
  },
  learning: {
    sign: [
      'the brush and scroll',
      'the tablet',
      'the lamp',
      'the inkstone',
      'the turtle shell',
      'the scholar’s cap'
    ],
    deed: [
      'brought writing and the calendar to the first people',
      'set the laws in the tablets',
      'judges the scholars and rewards the diligent',
      'carved the history of the world upon the shell of the great turtle',
      'compiled the holy dictionary of divine names',
      'taught the kings how to govern by the wisdom of the ancients'
    ],
    gift: [
      'ink and paper burned at the temple',
      'the first copy of every book',
      'polished stones and fine quills left at the shrine',
      'vessels of pure black ink offered on exam days',
      'scrolls of philosophy laid upon the stone table',
      'lamps kept burning with clear oil in the study halls'
    ],
    born: [
      'was born from the first word spoken',
      'came down from heaven on a cloud',
      'sprang from the ink that dripped from the divine brush',
      'was birthed by the sage-goddess in the hall of scrolls',
      'rose from the ancient turtle-shell carved with holy signs',
      'woke in the library of the gods before men knew how to read'
    ]
  },
  judge: {
    sign: [
      'the scales',
      'the sword',
      'the book of deeds',
      'the iron gavel',
      'the white pillar',
      'the blindfold'
    ],
    deed: [
      'weighs every soul at the end of days',
      'keeps the book in which all deeds are written',
      'grants rule to the just and takes it from the wicked',
      'cast the tyrant king into the fiery abyss for his crimes',
      'cut through the tangled web of lies with her blade of truth',
      'settled the great quarrel between sky and earth at the dawn of time'
    ],
    gift: [
      'oaths sworn before the altar',
      'fasting before great judgments',
      'silver coins placed upon the scales of justice',
      'white stone tablets inscribed with solemn vows',
      'vessels of pure water for cleansing hands before trial',
      'swords laid down in pledge of peace and law'
    ],
    born: [
      'was the first to be made, before the world',
      'stands at the right hand of the highest',
      'sprang from the divine mind when law was first established',
      'was birthed by the sun father and the truth goddess',
      'rose from the foundation stone of the universe',
      'was carved from the white marble pillar of justice'
    ]
  },
  fertility: {
    sign: [
      'the spindle',
      'the cradle',
      'the pomegranate',
      'the rabbit',
      'the clay womb',
      'the green sprout'
    ],
    deed: [
      'watches over every birth',
      'weaves the bodies of children in the womb',
      'taught the first women to spin and weave',
      'lifted the curse of barrenness from the royal house',
      'blessed the barren soil so that it produced a hundredfold',
      'guarded the sacred cradle from night-demons and fever'
    ],
    gift: [
      'the first cloth of a bride',
      'small figures of clay left at the shrine',
      'pomegranates and figs offered at the temple threshold',
      'bowls of warm milk and honey left by the birth-bed',
      'silver cradles and embroidered baby garments',
      'braided locks of hair from young maidens'
    ],
    born: [
      'was born from a seed in the earth mother’s womb',
      'was born under the full moon',
      'sprang from the fruit of the first tree of life',
      'was birthed in a cave of warm red clay',
      'rose from the spring-soil when the winter ice broke',
      'emerged from the golden blossom of the wild lotus'
    ]
  },
  stone: {
    sign: [
      'the pick',
      'the vein of gold',
      'the deep lamp',
      'the iron chisel',
      'the granite hammer',
      'the geode'
    ],
    deed: [
      'runs through the rock like water and shows the miners its veins',
      'carved the first halls beneath the mountain',
      'knows the name of every stone',
      'sealed the subterranean chasm to stop the fire-demons',
      'turned the invading army into stone statues',
      'forged the secret pillars that support the continents'
    ],
    gift: [
      'the first ore of a new mine',
      'lamps left burning in the deeps',
      'unrefined gold and silver nuggets laid upon the stone altar',
      'iron chisels and hammerheads quenched in holy water',
      'cups of strong dwarf-ale placed in rock niches',
      'smooth gems left in their rough state as offerings'
    ],
    born: [
      'was carved from the living rock',
      'was born in the dark at the mountain’s root',
      'sprang from the spark struck when the first mountain fell',
      'was birthed in the magma-chamber deep beneath the crust',
      'rose from the diamond core of the ancient earth',
      'woke inside a giant geode at the center of the world'
    ]
  },
  tomb: {
    sign: [
      'the sealed door',
      'the stone eye',
      'the lamp of the dead',
      'the urn of basalt',
      'the iron lock',
      'the scarab of slate'
    ],
    deed: [
      'watches over the tombs of the kings and never sleeps',
      'curses those who rob the dead',
      'keeps the names of the dead so that they are never forgotten',
      'seals the sarcophagus of the righteous against corruption',
      'drove the grave-hags out of the royal mausoleum',
      'guides the spirit through the narrow dark hall below'
    ],
    gift: [
      'names carved on the tomb walls',
      'lamps kept burning in the tombs',
      'vessels of embalming oils and myrrh',
      'silver coins and grave-goods left undisturbed',
      'stone seals carved with protective wards',
      'loaves of barley bread and cups of water placed in niches'
    ],
    born: [
      'was the first king to be laid in the stone',
      'was born in silence',
      'sprang from the cold shadow of the first sarcophagus',
      'was birthed in the dark subterranean vault beneath the city',
      'rose from the dust of forgotten ancestors',
      'woke when the first burial door was locked'
    ]
  },
  gate: {
    sign: [
      'the bridge',
      'the key',
      'the horn',
      'the archway',
      'the double doors',
      'the threshold stone'
    ],
    deed: [
      'guards the bridge between the worlds and will sound his horn at the end',
      'keeps the deep gates shut against what lies below',
      'lets through only the worthy',
      'held the gate against a million demons for nine days',
      'turned the key that locked the night-monsters in the abyss',
      'built the rainbow bridge that links earth to the hall of gods'
    ],
    gift: [
      'keys left at the shrine',
      'watch-fires kept on the walls',
      'iron padlocks locked onto the sanctuary grates',
      'horns blown at sunset and sunrise',
      'bread and salt placed upon the threshold stone',
      'libations of wine poured over the gate posts'
    ],
    born: [
      'was born of nine mothers',
      'was set at the gate when the world was made',
      'sprang from the archway where sky and earth meet',
      'was birthed by the horizon goddess at dawn',
      'rose from the first boundary stone laid by mortal hands',
      'woke standing vigil at the threshold before time began'
    ]
  }
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
