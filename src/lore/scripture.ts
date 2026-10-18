import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Token } from '../lang/language';
import { PROPER, translate } from '../lang/translate';
import { type Faith, type FaithFamily, TENETS, godly } from './faiths';

/**
 * Verses of a faith's scripture: one or two for each of its tenets, and for its doctrines (its
 * head, clergy, conversion, other faiths, the dead and marriage), with a few of its own sayings,
 * each cited by book, chapter and verse (or song and stanza where the lore is oral), and said in
 * the faith's holy tongue. The verses are kept short and plain, so the translator can say them.
 */

export interface Verse {
  /** English, with the god's or prophet's name in it. */
  en: string;
  /** Citation ("the Book of Varsk 3:12"). */
  cite: string;
  /** What it teaches ("Holy War", "The dead"). */
  about: string;
  /** The verse in the holy tongue (each clause translated), empty without a tongue. */
  tokens: Token[];
}

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];

/** {G} the chief god, {P} the prophet (or the chief god where there is none), {F} the faithful. */
export const TENET_VERSES: Record<string, string[]> = {
  holyWar: [
    'Take up the sword against the unbeliever. Whoever falls in the holy war is saved.',
    'The enemies of {G} are your enemies. Do not rest until their shrines are fallen.',
    'Sanctify your blade in holy water before marching out against the heathens.',
    'He who strikes down the blasphemer earns a crown of glory in the high hall of {G}.',
    'No peace shall be forged with the idolater while his altars pollute the land.',
    'March forth under the banner of {G}, for victory is promised to the resolute.',
    'Let your heart know no pity when executing the righteous judgment of Heaven.',
    'The blood of the martyr seeds the earth with ten thousand new champions.',
    'Cast down their fortress towers and cleanse their cities with holy fire.',
    'To die with weapon drawn in the cause of {P} is to step directly into paradise.'
  ],
  pilgrimage: [
    'Go up to the holy city once in your life. The road is the prayer.',
    'Leave your house and walk to the holy places, and {G} will walk beside you.',
    'Dust upon the sandals of the pilgrim is precious as gold in the eyes of {G}.',
    'The journey purges the soul of sin long before the eye beholds the sacred sanctuary.',
    'Walk barefoot over the stony pass, for every step brings the believer closer to grace.',
    'Endure the blisters, the heat, and the cold, for the road itself tests the heart.',
    'He who perishes on the way to the holy threshold is counted among the blessed.',
    'Carry only your staff and blanket; let faith sustain your soul upon the long trail.',
    'At the sacred altar, lay down your burden and receive the gift of total renewal.',
    'The water of the holy shrine washes away decades of worldly transgression.'
  ],
  charity: [
    'Give to the poor, and {G} will give to you.',
    'The open hand is blessed. The closed hand is cursed.',
    'Share your bread with the hungry stranger, lest {G} leave your own table bare.',
    'Silver spent to clothe the destitute earns interest in the treasure-house of Heaven.',
    'He who turns away the beggar turns away the blessing of the holy ones.',
    'Give in secret without boasting, so your reward may be laid up in paradise.',
    'A cup of cold water given in love weighs heavier than a mountain of gold.',
    'Wealth is a loan from {G}; pass it to the needy before the debt comes due.',
    'The widow’s small copper bit shines brighter than the proud lord’s purse.',
    'Feed the orphan and protect the helpless, for they are the special flock of {P}.'
  ],
  monasticism: [
    'Leave the world and keep the holy books. The silent house is near to {G}.',
    'The monk who copies the word lights a lamp in the dark.',
    'Shut the heavy gates against the world, and listen to the quiet voice of the divine.',
    'In solitude and labor, the soul is polished like a silver chalice.',
    'The cloister is a fortress where the warrior of the spirit wages war against temptation.',
    'Rise at matins before the dawn, and let your first breath be a psalm of praise.',
    'Vow poverty, obedience, and chastity, that your path to {G} remain unburdened.',
    'The quiet gardens of the monastery mirror the peace that awaits in the heavens.',
    'Work with your hands and pray with your spirit through all hours of the day.',
    'A life of contemplation unlocks mysteries hidden from kings and conquerors.'
  ],
  mendicants: [
    'Carry nothing on the road but the word.',
    'Go from town to town, and eat what the poor give you.',
    'Neither purse nor spare coat shall the servant of {G} carry on his journey.',
    'Depend upon the mercy of the faithful, for the birds of the air sow not, yet are fed.',
    'He who begs for his daily bread in the name of {P} walks in the footsteps of saints.',
    'Rest your head upon stone or moss, content in the knowledge that {G} provides.',
    'Preach in the village square and by the roadside, accepting only bread for your wage.',
    'Let no silver weigh down your pockets, lest your heart grow attached to the dust.',
    'Bless the cottage that grants you shelter, and wipe the dust from your feet where turned away.',
    'The wandering friar carries no worldly home, for his home is the kingdom above.'
  ],
  endTimes: [
    'The end is near. Keep your lamp lit, for no one knows the hour.',
    'The world will burn, and only the faithful will stand.',
    'When the sun turns to blood and the mountains tremble, know that {G} is at the door.',
    'Watch the heavens for signs, for the age of iron and tears draws to its close.',
    'The great judgment comes like a thief in the night; purge your soul while light remains.',
    'Seven seals shall shatter, and the seas shall boil with sulfur and fire.',
    'Put no trust in earthly kingdoms, for they shall crumble into ash before the dawn.',
    'When brother turns against brother and plagues scour the land, the end is upon us.',
    'The righteous shall be gathered into the high heavens, while the wicked drown in flame.',
    'Prepare your spirit today, for tomorrow the final trumpet sounds over the world.'
  ],
  sacredLaw: [
    'The law is the word of {G}. No king may change it.',
    'Judge by the book, and the judges will be just.',
    'Deviate not a hair’s breadth from the statute written by the hand of {P}.',
    'Human decrees crumble like dry dust, but the sacred canon stands forever unyielding.',
    'In the strict execution of the law lies the safety and prosperity of the whole realm.',
    'Neither rank nor riches shall shield the offender from the swift sword of justice.',
    'Let the elders recite the canon daily, so no commandment is forgotten or obscured.',
    'He who breaks the holy statute tears a thread from the fabric of cosmic order.',
    'The law guides the feet of the righteous through the labyrinth of mortal error.',
    'To alter a single letter of scripture is to commit blasphemy against {G}.'
  ],
  aniconism: [
    'Make no image of a living thing. {G} has no face that the hand can carve.',
    'Do not bow before stone or wood. Bow before {G} alone.',
    'Smash the painted idols, for to depict the divine is to bind the infinite in mortal clay.',
    'Let the sanctuary be bare of images, adorned only with the light of truth and scripture.',
    'Cursed is the craftsman who carves an altar-piece and calls it the face of the holy.',
    'The divine is spirit and wind; no brush or chisel can capture its majesty.',
    'Adorn the temple walls with sacred script and geometric truth, not painted faces.',
    'Venerate the unseen creator, and turn your face away from graven abominations.',
    'Whoever bows before a statue kneels to dead stone and denies the living spirit.',
    'Keep your heart free from the delusion of worshiping the work of human hands.'
  ],
  purity: [
    'Wash before you pray. The unclean hand may not touch the holy.',
    'Do not eat the meat of the pig. Do not touch the dead without washing.',
    'Pure water poured thrice over the head cleanses the stain of the world.',
    'Keep your garments white and your heart free from the corruption of decay and blood.',
    'Touch not the carcass of the unclean beast, lest your prayers be rejected at the threshold.',
    'Submerge in the running river to wash away the defilements of the market and street.',
    'Separate the clean from the unclean in your kitchen, your house, and your altar.',
    'An impure body corrupts the prayer; purify the flesh before approaching {G}.',
    'Avoid the touch of the infected and the dead until the prescribed days of cleansing pass.',
    'Purity of body is the first step toward the sanctification of the spirit.'
  ],
  ritualSacrifice: [
    'Feed the gods with blood, and they will feed the fields.',
    'The gods gave their blood for the world. Give your blood in return.',
    'Pour the life-breath upon the stone altar, so the sun may rise and the rains descend.',
    'An unblemished lamb slain at twilight turns away the wrathful plague from the city.',
    'Without the shedding of blood, the covenant fails and the land becomes barren.',
    'Catch the warm life-blood in silver bowls and sprinkle it upon the four cornerstones.',
    'Bind the offering upon the high altar when the solstice sun touches the peak.',
    'The aroma of burning fat and incense ascends to the heavens to gladden {G}.',
    'Give up your most prized beast to the knife, and prosperity shall fill your barns.',
    'Life balances life; offer the creature’s blood so your own house may endure.'
  ],
  divination: [
    'Read the birds before the battle. The gods speak in signs.',
    'Cast the lots before every great deed, and do as they say.',
    'Inspect the liver of the white ram to discern whether {G} grants victory or defeat.',
    'When the smoke rises straight toward Heaven, the omen is favorable to your undertaking.',
    'Listen to the rustling of the sacred leaves, for the wind carries the answers of the future.',
    'Scatter the ancient bones upon the cloth, and let the pattern reveal hidden truths.',
    'Read the flight of eagles across the sun before leading armies into the mountain pass.',
    'Draw the runic staves from the linen pouch to discover what fate weaves today.',
    'Observe the clouds at daybreak; their shapes foretell the fortunes of the realm.',
    'Ignorant is the captain who marches to war without consulting the augurs.'
  ],
  feastDays: [
    'Keep the great feasts, and the year will turn well.',
    'On the holy days eat and drink and give thanks to the gods.',
    'Strike the drums and light the bonfires when the solstice sun reaches its height.',
    'Let no man labor on the holy day, but let all gather to sing the ancient praises.',
    'Pour the wine high and feast together, for joy in the holy season honors the divine.',
    'Bake sweet bread and roast the fat ox to celebrate the turning of the sacred wheel.',
    'Adorn the village gates with flower garlands when the festival day dawns.',
    'Open your doors to neighbors and kin; let song fill the hall until midnight.',
    'To fast on a feast day is an insult to the bounty granted by {G}.',
    'Rejoice together as one people, for the holy feast unites earth with Heaven.'
  ],
  hospitality: [
    'Feed the stranger at your door. The gods walk among us in rags.',
    'The guest under your roof is under the protection of the gods.',
    'Wash the feet of the traveler who knocks at dusk, and set before him your finest bread.',
    'He who harms a guest under his roof draws down a curse upon seven generations.',
    'Break bread with the wanderer, for you know not if an angel sits beside your hearth.',
    'Offer your warm hearth and dry blanket before asking the stranger his name or business.',
    'The salt and bread shared at the table bind host and guest in sacred peace.',
    'Never close your timber gate against those who seek shelter from the night storm.',
    'To turn away a traveler in the wilderness is to shed innocent blood before {G}.',
    'A household known for its generous board shall never lack the protection of Heaven.'
  ],
  astrology: [
    'The stars write the fate of every child. Read them at every birth.',
    'Do not march when the red star is high.',
    'When the seven wanderers align in the sky, great kings rise and thrones fall.',
    'Consult the astrolabe before laying the foundation stone of temple or wall.',
    'The celestial spheres weave the harmony of world affairs; read their signs and be wise.',
    'As above in the starry heavens, so below upon the clay of the earth.',
    'The constellation of the Dragon heralds years of flood, famine, and war.',
    'Born under the Golden Scale, a man shall be just in judgment and prosperous in trade.',
    'Chart the movement of the wanderers to know the auspicious hours for coronation.',
    'The heavens speak a silent language carved in light; only the wise scholar understands.'
  ],
  warriorCult: [
    'The brave who die in battle feast with {G} for ever.',
    'Cattle die and kinsmen die. The name of the brave never dies.',
    'Stain your spear with the blood of the enemy, and fear not the cold stroke of death.',
    'The coward dies a thousand shameful deaths, but the hero lives eternally in song.',
    'A sword in hand at the final breath is the golden key to the High Hall.',
    'Show no fear when the shield-wall clashes, for the Valkyries choose the valiant.',
    'Carve your name upon the bones of your foes, so posterity remembers your strength.',
    'A warrior’s true home is the battlefield; his true bride is victory.',
    'Weep not for the fallen brother; he rests now in the hall of champions.',
    'To yield without a fight is to surrender your soul to eternal dishonor.'
  ],
  sacredGroves: [
    'The gods live in the groves. Whoever cuts a holy tree will die.',
    'Pray under the old trees, for they are older than kings.',
    'In the deep green silence of the ancient oaks, the presence of {G} is felt.',
    'Tie your wool ribbons to the low boughs, and ask the forest spirit for healing.',
    'Fell not a single branch in the sacred grove, lest the earth withhold its green harvest.',
    'Step softly upon the moss of the inner circle, for the ground is holy.',
    'The ancient heart-tree hears the whispers of the faithful and remembers their vows.',
    'Light no fire and draw no iron blade beneath the green canopy of the shrine.',
    'The spirits of the woods shelter those who honor the sacred timber.',
    'An axe struck against the sacred oak draws blood from the heart of the earth.'
  ],
  sacredWaters: [
    'Do not foul the springs, for the gods drink from them.',
    'The river is holy. Give it gifts, and it will give you life.',
    'Toss silver coins and bronze blades into the deep pool to appease the water spirit.',
    'Wash your wounds in the sacred spring, and the cold water shall draw out the poison.',
    'Defile not the running stream, for water is the pure blood of the earth mother.',
    'At the confluence of the two rivers, build the altar and offer libations.',
    'Drink deeply from the holy well to receive clarity of sight and health of limb.',
    'The nymph of the spring grants blessings to those who keep her waters clean.',
    'Pour no offal or filth into the stream, lest the waters turn sour and breed pestilence.',
    'The deep lake conceals secret treasures placed there by ancient kings.'
  ],
  nature: [
    'Take nothing from the land without thanks.',
    'The wolf and the deer and the people are brothers.',
    'Walk softly upon the earth, for every leaf and stone breathes with divine life.',
    'Kill only what you must eat, and ask the spirit of the beast for pardon before you skin it.',
    'The mountain, the forest, and the river are the true temples not made by human hands.',
    'Disturb not the balance of the wild, lest nature rise up in wrath against your fields.',
    'Listen to the song of the mountain breeze; it speaks the mind of the creator.',
    'The earth feeds all her children; show gratitude for every root and berry gathered.',
    'He who cuts down the forest without cause brings desert and drought upon his kin.',
    'Revere the cycles of frost and thaw, for all living things bow to nature’s law.'
  ],
  rebirth: [
    'The soul is born again and again. Your deeds choose your next life.',
    'Death is a door, and not a wall.',
    'As a man sheds old garments and puts on new, so the soul casts off worn bodies.',
    'Live righteously in this span, that you may be born as a sage or prince in the next.',
    'Weep not for the dead, for their spirit merely steps into another room of the house.',
    'The wheel of existence turns endlessly until the soul achieves pure liberation.',
    'Every act of malice in this life forged a chain that binds you in the next.',
    'A gentle man may rise to be a king, while a tyrant returns as a worm in the mire.',
    'Fear not the decay of the flesh; the divine spark within cannot be destroyed.',
    'Your present joy or suffering was planted by your own hands in lives long past.'
  ],
  ancestors: [
    'Feed your dead and ask them for counsel.',
    'The dead watch over the living. Do not shame them.',
    'Pour libations of wine upon the tomb, so the spirits of the fathers do not grow thirsty.',
    'A man who honors his ancestors stands firm like a oak with deep roots.',
    'Light incense before the family tablets, and the ancestral spirits will guard the hearth.',
    'Recite the names of your grandfathers back ten generations at every solstice.',
    'Consult the spirits of the clan before making war or marrying your children.',
    'The blessing of the departed brings bountiful harvests and healthy sons.',
    'An neglected ancestor becomes a wandering ghost that haunts the house with misfortune.',
    'Keep the family burial mound clean and weed-free to ensure lasting prosperity.'
  ],
  kingship: [
    'Heaven chooses the king. Whoever rebels against him rebels against heaven.',
    'The just king rules by the mandate of heaven. The unjust king loses it.',
    'The sovereign is the shield of the weak and the iron hammer against blasphemers.',
    'Anoint the forehead of the rightful heir, and the land shall bloom under his rule.',
    'A wicked king brings drought and pestilence upon his people until he is cast down.',
    'Bow low before the royal scepter, for it embodies the divine power on earth.',
    'The throne stands as the pillar connecting the low earth to the high heavens.',
    'To serve the anointed king faithfully is to earn the favor of {G}.',
    'When the sovereign walks in righteousness, peace and abundance cover the kingdom.',
    'A kingdom without a legitimate king is like a ship tossed upon a stormy sea without a helm.'
  ],
  asceticism: [
    'Fast and pray, and the flesh will become light.',
    'The rich man carries a heavy load. The poor man walks freely to {G}.',
    'Subdue the cravings of the belly, that the eye of the spirit may be opened.',
    'Suffer cold and hunger gladly, for mortification of the body purifies the soul.',
    'He who conquers his own desires is greater than a general who conquers a city.',
    'Wear rough hair-cloth and sleep upon cold stone to tame the wild impulses of the flesh.',
    'Renounce luxury, comfort, and praise, for they are gilded traps for the soul.',
    'In the emptiness of fasting, the voice of {G} resounds with thunderous clarity.',
    'Strip away all earthly possessions until nothing remains between you and the divine.',
    'Master your breath, your appetite, and your thoughts to attain holy perfection.'
  ],
  pacifism: [
    'Do not kill. The blood of your brother cries out from the ground.',
    'Answer the sword with the open hand.',
    'He who takes up the blade shall perish by the blade; overcome wrath with gentleness.',
    'Strike not back when reviled, for peace is the highest sacrifice offered to {G}.',
    'Blessed are the merciful, for forgiveness breaks the endless chain of blood-vengeance.',
    'Put away the bow and spear; conquer your enemy with kindness and truth.',
    'To shed human blood is to defile the image of the divine creator.',
    'Turn the other cheek when struck, showing that your spirit cannot be harmed by iron.',
    'A gentle tongue diffuses anger faster than a hundred shields stop arrows.',
    'Refuse the call to war, choosing rather to suffer persecution than inflict harm.'
  ],
  craft: [
    'The good work of your hand is a prayer.',
    'The masterwork is the gift of the smith to the Maker.',
    'Forge every link with care and truth, for the divine eye sees every hidden flaw.',
    'The mason who carves the stone with devotion builds a shrine that outlasts empires.',
    'Honest labor with hammer and chisel honors {G} more than empty lip-service.',
    'Let every joint be tight, every edge true, and every seam polished like glass.',
    'The spirit of the creator dwells in the hands of the faithful artisan.',
    'Waste not precious timber or iron, but fashion every tool with reverence.',
    'A masterwork crafted with devotion carries a blessing that protects its owner.',
    'Skill in craft is a sacred talent entrusted by {G}; use it for the good of all.'
  ],
  dualism: [
    'The light and the dark make war in every heart. Choose the light.',
    'Every good deed is a blow against the dark.',
    'The world is a battlefield between the Prince of Light and the Lord of Shadows.',
    'Stand firm in the ranks of the righteous, for twilight comes when the faithful waver.',
    'Pure fire shall consume the darkness at the end of days, leaving only truth.',
    'Align your soul with the sun, and cast out the creeping shadows of malice.',
    'Two eternal forces wrestle for dominion over creation; choose your master wisely.',
    'Light a candle against the abyss, for even the smallest flame scatters darkness.',
    'The children of light walk in truth, while the servants of shade lie in ambush.',
    'Fear not the darkness, for the ultimate triumph belongs to the eternal light.'
  ],
  carnalism: [
    'The pleasures of the body are a gift of the gods. Take them with thanks.',
    'Love is holy. Do not be ashamed of it.',
    'Delight in the warmth of the flesh, for {G} created passion to gladden the human heart.',
    'Deny not the natural desires of the body, but celebrate them in joyous feasts.',
    'To embrace with love and joy is to taste the nectar of the immortals on earth.',
    'Pour the sweet wine and hold your lover close; the gods smile upon mortal joy.',
    'The union of bodies mirrors the sacred creation through which all life flows.',
    'Rejoice in the senses—sight, touch, taste, and sound—for they are divine gifts.',
    'Banish shame and guilt from the bedchamber; passion is a fire lit by {G}.',
    'Life is brief; harvest its pleasures eagerly before cold age claims the flesh.'
  ],
  communion: [
    'Eat the holy bread together, and you will be one body.',
    'Whoever eats at the table of {G} is never alone.',
    'Share the consecrated chalice, and the divine spirit shall unite your hearts.',
    'At the holy table, serf and lord break the same bread as equal brethren.',
    'By partaking in the sacred meal, the faithful are bound together in eternal brotherhood.',
    'Eat of the holy feast, and receive the strength and presence of {P} within.',
    'Gather around the altar as one family, laying aside all grudges and strife.',
    'The shared cup seals a covenant that neither distance nor death can sever.',
    'Blessed is the bread blessed in the name of {G}; it feeds both body and soul.',
    'Whenever you break bread in remembrance of the divine, {G} is present among you.'
  ],
  ecclesiarchy: [
    'The temple rules over all things, for its priests speak for the gods.',
    'Obey the priests as you obey the gods.',
    'Subordinate the crown to the altar, for heavenly law transcends earthly decrees.',
    'The council of bishops holds the supreme authority to judge all matters in the realm.',
    'He who defies the decree of the holy priesthood cuts himself off from salvation.',
    'The keys of the kingdom belong to the temple; no king rules without its blessing.',
    'Bring your disputes to the priest-judges, for their wisdom is guided by {G}.',
    'Pay the holy tithe faithfully to maintain the temples and support the priesthood.',
    'The decrees of the sacred synod bind kings, nobles, and commoners alike.',
    'Reverence the robes of the clergy, for they carry the weight of divine office.'
  ],
  adorcism: [
    'Open your body to the spirit, and the god will speak with your mouth.',
    'Dance until the god comes down.',
    'Yield your limbs to the divine rhythm, and let the spirit ride your form.',
    'When the trance takes hold, the words spoken are not yours, but the voice of {G}.',
    'Prepare the vessel through chant and drum, so the god may descend among his folk.',
    'Clear your mind of self and fear; let the holy presence possess your spirit.',
    'The wild dance opens the secret door through which the divine enters the world.',
    'He who is ridden by the god speaks prophecies that never fail.',
    'Feel the divine power surge through your veins as the spirit takes the reins.',
    'Honor the chosen vessel through whom {G} speaks to the gathered tribe.'
  ],
  witchcraft: [
    'The hidden powers are the gifts of the gods. Use them wisely.',
    'The wise woman knows the words that bind and loose.',
    'Gather nightshade and root under the full moon to brew remedies for soul and body.',
    'The secret runes and whispered charms hold the ancient magic of the world.',
    'Weave the thread and tie the knot, for the unseen threads of fate obey the knowing.',
    'Consult the herb-wife when sickness strikes, for her potions carry old earth-lore.',
    'Inscribe the warding sign upon the lintel to keep the night-ghouls from the cradle.',
    'Speak the secret names of power in whispers, lest the uninitiated hear and perish.',
    'Stir the cauldron under the starlight, weaving health, luck, or bane as needed.',
    'Magic is the subtle art of whispering to the hidden spirits of creation.'
  ],
  hedonism: [
    'Eat and drink and love, for the gods love the joyful.',
    'Joy is the first prayer.',
    'Life is short as a summer sunset; fill your cup with sweet wine and feast while you may.',
    'Turn away from gloom and fasting; a laughing heart brings smile to the immortals.',
    'Music, wine, and warm embrace are the true blessings granted to mortals.',
    'Why mourn for tomorrow when tonight’s feast lies spread before you?',
    'The highest virtue is to drink life to the dregs and share laughter with friends.',
    'Drown sorrow in golden wine and let the harps play until the morning stars fade.',
    'The gods gave us world and senses so we might revel in their endless delight.',
    'Count the day lost that passes without song, feast, or passionate kiss.'
  ],
  suicide: [
    'A noble death washes away shame.',
    'When honour is lost, the blade restores it.',
    'Choose a clean death by your own hand rather than live as a captive or disgraced man.',
    'Falling upon one’s sword when all is lost is the final act of an invincible spirit.',
    'The soul that departs with dignity on its own terms walks unbowed into the afterlife.',
    'Let no enemy hold you in chains; end your life as a free man when defeat comes.',
    'Wipe out the stain upon your clan-line by offering your life upon the steel.',
    'To choose the hour and manner of your end is the ultimate mastery over fate.',
    'Better to die by your own blade with honor than to live in shame as a slave.',
    'The gods welcome the brave soul that refuses to outlive its honor.'
  ],
  filialPiety: [
    'Honour your father and your mother all your days.',
    'The child who serves the parents serves heaven.',
    'Care for your aging parents with tenderness, as they nursed you in your helpless youth.',
    'Disobedience to the wishes of your elders brings the swift curse of Heaven upon your house.',
    'A dutiful son brings honor to his clan-line and peace to the spirits of the ancestors.',
    'Bow low before your parents morning and evening, asking for their wise counsel.',
    'Never raise your voice or hand against those who gave you life and blood.',
    'Support your mother in her widowhood and defend your father’s good name after death.',
    'The blessings of pleased parents build a foundation that no storm can shake.',
    'Filial devotion is the chief of all virtues; from it spring all justice and order.'
  ],
  takamine: [
    'The mountains are the homes of the spirits. Climb them with a pure heart.',
    'Bow to the mountain, for it was here before you.',
    'Purify yourself in the cold waterfall before ascending the sacred peak.',
    'On the high granite summit, where the wind roars, mortal men stand closest to {G}.',
    'Treat the mountain trails with reverence, for every rock is a throne of the spirits.',
    'Leave offerings of rice and wine at the stone cairns marking the high mountain passes.',
    'The peak touches the sky; stand upon it to utter your deepest prayers to Heaven.',
    'Disturb no stones on the sacred ridge, lest the mountain spirit send down avalanches.',
    'Endure the thin air and freezing winds as a holy test of spiritual endurance.',
    'The mountain stands eternal while empires crumble; learn wisdom from its silence.'
  ],
  sacredLearning: [
    'Seek knowledge, for it is the light of {G}.',
    'The scholar’s ink is holier than the blood of the martyr.',
    'Read the ancient scrolls with diligence, for wisdom is a shield against delusion.',
    'A town with a library and scholars is beloved by Heaven and immune to dark ignorance.',
    'Spend your nights in the study of truth, and your mind shall shine like a polished lamp.',
    'Copy the holy texts with exact care; every letter preserved carries divine light.',
    'Debate scripture with reason and humility, seeking the deeper truth within the word.',
    'Ignorance is a darkness that breeds vice, while learning illuminates the soul.',
    'Honor the master who teaches you the ancient script as you honor your own father.',
    'A single hour spent in deep study of truth outweighs a year of blind ritual.'
  ]
};
export const DOCTRINE_VERSES: Record<string, Record<string, string[]>> = {
  head: {
    pontiff: [
      'Obey the high priest, for he holds the keys of heaven.',
      'One shepherd leads the flock of {G}.',
      'The word from the Holy See binds the soul on earth and in the heavens.',
      'He who rebels against the supreme seat speaks with the voice of heresy.',
      'The high vicar alone holds authority to interpret the sacred canon.',
      'Look to the central crown for guidance when darkness clouds the land.'
    ],
    ruler: [
      'The king is the priest of his people. His word is the word of the gods.',
      'Bow to the throne, for the gods sit upon it.',
      'Anoint the sovereign with oil, for the crown and the altar are one.',
      'To oppose the decree of the ruler is to reject the mandate of Heaven.',
      'The royal bloodline bears the divine spark; serve the king and serve the faith.',
      'In the ruler’s right hand rests the scepter, and in his left, the holy law.'
    ],
    none: [
      'No man stands between you and the gods.',
      'Every temple is the house of the gods, and none is greater than another.',
      'Seek no pope nor monarch; the divine spirit speaks directly to the pure heart.',
      'Cursed is he who bows before a mortal wearing the robes of high office.',
      'The truth belongs to every believer, not to a gilded throne in a far city.',
      'Every hearth is an altar, and every faithful servant a priest.'
    ],
  },
  clergy: {
    celibate: [
      'The priest takes no wife, for his bride is the faith.',
      'Give up worldly loves, that your heart may belong entirely to {G}.',
      'Unburdened by household or heir, the clergy walks the path of pure service.',
      'The flesh must be subdued so the spirit may burn like a clear lamp.',
      'No child of man shall claim the inheritance of those set apart for Heaven.'
    ],
    married: [
      'Let the priest marry, and let his house be a lamp to the town.',
      'A shepherd who governs his own household well is fit to guide the flock.',
      'Marriage purifies the flesh and anchors the servant of the faith in truth.',
      'From the union of faithful hearts spring the future keepers of the shrine.',
      'Share in the joys and trials of the people, that your counsel may be wise.'
    ],
    hereditary: [
      'The priesthood passes from father to son, as the flame passes from lamp to lamp.',
      'The blood of the sacred line retains the memory and favor of the ancestors.',
      'Teach your sons the ancient rites, that the altar fire never goes cold.',
      'No stranger to the clan may lay hands upon the holy relics.',
      'From generation to generation, the sacred duty flows through the vein.'
    ],
    priestesses: [
      'Only women may serve at the altar, for the gods first spoke to a woman.',
      'The sacred mystery of life belongs to the priestesses who tend the flame.',
      'Man wields the sword of earth, but woman weaves the thread of Heaven.',
      'Listen to the counsel of the shrine-mothers, for they hear the subtle voices.',
      'At the sacred spring, only the daughters of the faith may pour libations.'
    ],
    open: [
      'Whoever is called may serve, man or woman.',
      'The spirit chooses its vessel without regard to birth, rank, or gender.',
      'Step forward to the altar if your heart is pure and your voice is true.',
      'Neither bloodline nor sex bars the faithful from entering the holy brotherhood.',
      'The calling comes like the wind; answer it, whether you be serf or noble.'
    ],
  },
  conversion: {
    missionary: [
      'Carry the word to every people, to the ends of the earth.',
      'Hide not the light under a bushel; preach the truth in every marketplace.',
      'Wander the highways and hedgerows, compelling all to enter the house of {G}.',
      'A true believer rests not while a single soul remains in the shadow of error.',
      'Cross the seas and the mountains to bring the divine law to the heathens.'
    ],
    closed: [
      'The faith is the inheritance of our fathers. Do not give it to strangers.',
      'Cast not your pearls before swine, nor offer the sacred covenant to outsiders.',
      'We are the chosen people; let the tribes of the earth walk in their own darkness.',
      'To sell or teach the secret lore to foreign folk is high treason to {G}.',
      'Keep the bloodline pure and the rites hidden behind the closed gate.'
    ],
    sword: [
      'Bring the unbelievers to the faith by the sword, if they will not come by the word.',
      'Cleanse the land of heresy with iron and fire; yield no quarter to blasphemy.',
      'Let the blood of the obstinate flow upon their shattered altars.',
      'Compel them to bow before {G}, or let their names be erased from the living.',
      'Blessed is the blade that cuts away the rotten bough of idolatry.'
    ],
  },
  others: {
    pluralist: [
      'There are many roads up the mountain.',
      'Do not mock the gods of other peoples.',
      'The divine shines through many windows; honor the truth wherever it is found.',
      'Let each man pray in his own tongue, for {G} understands all speech.',
      'A wise city welcomes the temples of its neighbors with hospitality.'
    ],
    righteous: [
      'Let the unbeliever live among you, and let him pay the tax.',
      'Protect the stranger who obeys the law, though he kneels at a different shrine.',
      'The truth shall prevail through virtue, not by oppressing those who wander.',
      'Allow the foreigner his rites in private, so long as he does not insult the true god.',
      'Justice is owed to all men, whether they be of the covenant or outside it.'
    ],
    fundamentalist: [
      'Throw down the altars of the false gods.',
      'There is no peace with the idolater.',
      'Suffer not a witch, a heretic, or a foreign priest to draw breath in the land.',
      'Smash the graven images and burn the books of false doctrine to ashes.',
      'Compromise with error is betrayal of {G}; purify the realm without mercy.'
    ],
  },
  death: {
    burial: [
      'From the earth you came, and to the earth you will return.',
      'Lay the dead gently in the soil, that they may rest in the lap of the earth mother.',
      'Lower the body into the dark loam; seed planted in faith shall rise again.',
      'Mark the grave with a stone, so the living remember where the ancestor sleeps.',
      'Disturb not the slumber of the buried, lest the earth curse the desecrator.'
    ],
    burning: [
      'Give the dead to the fire, and the smoke will carry them to the gods.',
      'The pyre purifies the flesh, freeing the immortal spirit to leap toward the stars.',
      'Consuming flame burns away the clay, leaving only the pure essence for {G}.',
      'Gather the white ashes into an urn, and scatter the rest to the four winds.',
      'Let the heat of the fire speed the warrior to the hall of the high ones.'
    ],
    barrows: [
      'Lay the great in the mound with their swords, for they will need them.',
      'Raise a high earthen barrow on the headland, visible to ships passing at sea.',
      'Bury the chief with his horse, his armor, and his gold to maintain his state below.',
      'The mound is a fortress in the deep earth; let no thief break its seals.',
      'Pour libations upon the turf of the barrow, so the dead king protects his realm.'
    ],
    tombs: [
      'Keep the bodies of the dead, for their souls will come home.',
      'Seal the embalmed corpse within marble and granite; preserve the form forever.',
      'Carve the history of their noble deeds upon the crypt walls for all generations.',
      'In the cold stone chamber, the dead await the turning of the great age.',
      'Anoint the sarcophagus with spices and resins to ward off decay.'
    ],
    sky: [
      'Give the dead to the birds, and they will carry them to the sky.',
      'Lay the body upon the high stone tower; let the sun and eagles claim the flesh.',
      'Return the physical shell to the air and the wind whence it came.',
      'The sky-burial leaves no corruption behind; the spirit rises on wings.',
      'Clean white bones left under the blue sky speak of a soul set free.'
    ],
    sea: [
      'Give the dead to the sea, and they will sail beyond the edge of the world.',
      'Commit the body to the deep waters; the current carries the soul home.',
      'Set the ship ablaze and push it into the dark waves at the hour of twilight.',
      'The ocean is the great cradle; in its dark depths the dead find eternal peace.',
      'Toss gold and iron into the waves to pay the drowned boatman for the passage.'
    ],
  },
  marriage: {
    monogamy: [
      'Let a man have one wife, and a woman one husband, until death.',
      'Two become one flesh in the sight of {G}; let no mortal divide them.',
      'Faithfulness to one partner is the foundation of a stable hearth and realm.',
      'A single true companion is a gift higher than gold or rubies.',
      'Swear the marriage oath once, and keep it unbroken through fair and foul.'
    ],
    concubines: [
      'A man may keep one wife in his house, and others beside her.',
      'The spouse holds the keys of the estate, but the holy concubines bring grace to the hall.',
      'Expand the household according to your wealth, providing for all under your roof.',
      'Children born of the inner hearth are legitimate before the law and the altars.',
      'Order and rank among the spouses maintain peace within the great family.'
    ],
    polygamy: [
      'A man may take as many wives as he can feed.',
      'A vast family with many sons is a crown of glory granted by the gods.',
      'Multiply the clan through many unions, strengthening the house against enemies.',
      'Treat each wife with justice and share your wealth fairly among her children.',
      'A strong leader binds many houses to his lineage through the sacred marriage bond.'
    ],
  },
};
const GROUP_ABOUT: Record<string, string> = { head: 'The head of the faith', clergy: 'The priesthood', conversion: 'Spreading the faith', others: 'Other faiths', death: 'The dead', marriage: 'Marriage' };

export const GENERAL: Record<FaithFamily, string[]> = {
  church: [
    'Love {G} with all your heart.',
    'Blessed are the poor, for they will see {G}.',
    'Forgive your enemy, as {G} forgives you.',
    'The light shines in the darkness, and the darkness has not overcome it.',
    'What shall it profit a man to gain the whole world and lose his soul?',
    'Lethal is the path of the wicked, but the righteous shall endure.',
    'Give to the Kings of men what is theirs, and give to {G} what belongs to {G}.',
    'Blessed are the peacemakers, for they shall be called children of the divine.',
    'Faith without works is dead, like a lamp stripped of oil.',
    '{G} gives, and {G} takes away; blessed be the name.',
    'Ask, and it shall be given you; seek, and ye shall find.',
    'A tree is known by its fruit, as a man is known by his deeds.',
    'Pride goeth before destruction, and an haughty spirit before a fall.',
    'The truth shall set you free from the chains of this lower world.',
    'In {G}\'s house are many mansions; I go to prepare a place for you.',
    'He that is without sin among you, let him first cast a stone.',
    'Be vigilant and sober, for the adversary prowls like a roaring lion.',
    'Though I walk through the valley of the shadow of death, I will fear no evil.',
    'Where your treasure is, there will your heart be also.',
    'The first shall be last, and the last shall be first when judgment comes.'
  ],
  crescent: [
    'There is no god but {G}.',
    'Pray five times each day, facing the holy city.',
    'Paradise lies at the feet of your mother.',
    'Indeed, with every hardship comes ease.',
    'Speak the truth, even if it be against yourself.',
    'Help one another in righteousness and piety, but not in sin.',
    'The ink of the scholar is more sacred than the blood of the martyr.',
    'Do not walk upon the earth with insolence, for you cannot cleave the mountains.',
    'Whosoever slays an innocent soul, it is as if he killed all humanity.',
    'To {G} belongs whatever is in the heavens and whatever is on the earth.',
    'Patience is the key to paradise, and endurance is a virtue.',
    'Feed the hungry, visit the sick, and free the captive.',
    'The best among you are those who have the best manners and character.',
    'Guard your tongue, for words can wound deeper than iron blades.',
    'Seek knowledge from the cradle to the grave.',
    'God does not burden any soul beyond what it can bear.',
    'A kind word and forgiveness are better than charity followed by injury.',
    'Wealth does not come from abundant possessions, but from a contented heart.',
    'Rely upon {G}, for He is the best disposer of all affairs.',
    'The life of this world is merely enjoyment of delusion.'
  ],
  pantheon: [
    'Know yourself.',
    'Nothing in excess.',
    'The gods help those who help themselves.',
    'Mortals are but shadows, the dreams of a shadow.',
    'Fate leads the willing, and drags the unwilling.',
    'Offer libations to the immortals before you break your morning bread.',
    'Hubris is the seed from which nemesis grows.',
    'Honesty is the shortest road to the favour of {G}.',
    'No man can escape the thread spun for him at his birth.',
    'Revere the guest and the suppliant, for Hermes walks in disguise.',
    'Wife, child, and hearth are sacred trust under the eyes of Heaven.',
    'Great gifts from the gods are not to be cast away lightly.',
    'A sharp tongue brings ruin upon the man who boasts over victory.',
    'Even the immortal gods bow before the balance of Necessity.',
    'Honor your parents, and perform the proper sacrifices at the solstice.',
    'Justice may slumber, but the gods never close their eyes.',
    'Death is the common lot of men; glory alone endures beyond the pyre.',
    'Do not mock the dead, for they have paid their debt to life.',
    'Count no man happy until he has reached the end of his days in peace.',
    'Courage in battle wins the favor of the high ones on the peak.'
  ],
  oldgods: [
    'Keep your oath, for the gods hear it.',
    'A man should be a friend to his friend.',
    'The fool lies awake all night and worries.',
    'Cattle die, kinsmen die, you yourself shall also die; one thing never dies: the fame of a dead man’s deeds.',
    'No man should step a foot from his weapons out on the open road.',
    'Better to fall in battle with a smile than to live in shame as a coward.',
    'The tree slakes its thirst on blood painted upon the roots.',
    'Silent and thoughtful should a king’s child be, and bold in battle.',
    'An oak grows slow, but its wood holds against the winter storm.',
    'Wake early if you would take another man’s land or life.',
    'A guest needs water, a towel, and a warm welcome at the hearth.',
    'The wolf waits behind the door of every man who forgets his kin.',
    'Never trust the words of a maiden, nor the promises of a night-born stranger.',
    'Gold bought with treachery burns through the purse.',
    'Runes carved in bone speak true when painted with stallion blood.',
    'A small shield is better than no shield when spears fly.',
    'A man’s own hearth is best, though it be humble and smoky.',
    'The sea takes what it wills; pay libation before you push off the keel.',
    'Keep your blade sharp and your horn full for the final battle.',
    'Fair words cost nothing, but a broken vow costs a man his honor.'
  ],
  druid: [
    'Three things are holy: truth, the land and the bond of the guest.',
    'The druid speaks before the king.',
    'The soul perishes not, but passes from one vessel into another.',
    'Cut the mistletoe with a golden sickle when the moon is full.',
    'What is sown in blood in the autumn shall bloom as wheat in the spring.',
    'The oak remembers the first dawn, and the stone remembers the deep fire.',
    'Never turn a stranger from your hearth while the cauldron boils.',
    'He who pollutes the sacred spring shall drink its bitterness sevenfold.',
    'The forest does not belong to man; man is a leaf upon its boughs.',
    'Swear your oath by wind, by wave, and by the stone beneath your feet.',
    'The three foundations of wisdom: listening, observing, and suffering.',
    'Speak no falsehood under the canopy of the heart-oak.',
    'The stag knows the path through the mist where men lose their way.',
    'When the heart-tree bleeds, a king shall fall before the harvest.',
    'Three things no man can hide: love, fire, and a broken oath.',
    'Respect the elder trees, for they anchor the spirit of the hills.',
    'Knowledge without understanding is like a nut without a kernel.',
    'The dead return to the soil, and from the soil green life arises.',
    'Let the cauldron turn, and the cycle of seasons remain unbroken.',
    'Listen to the song of the raven, for she counts the fallen warriors.'
  ],
  stars: [
    'The stars were first, and we are their children.',
    'Remember the light of the first days.',
    'A song sung in the glade echoes forever in the halls of the West.',
    'Do not fell the heart-tree, lest the melody of the world falter.',
    'Starlight purified in cold water reveals what the eye cannot see.',
    'All rivers run at last to the silver sea.',
    'Grief is deep, but memory is eternal as the evening star.',
    'Walk softly under the canopy, for the forest dreams of ancient times.',
    'Beauty is the mirror through which {G} speaks to mortal eyes.',
    'The silver needle stitches together the past and what is yet to come.',
    'Fade not into darkness, for the morning star shall rise again.',
    'A silver harp tuned in silence plays the song of the stars.',
    'The wisdom of the elders is as deep as the moonlit forest pool.',
    'Trust not the fleeting shadow, but the constant light above.',
    'The ship sails west, but the song remains behind on the shore.',
    'Guard the sacred glade from the axe and the torch of iron men.',
    'In the reflection of starlight upon calm water lies hidden truth.',
    'Patience is the virtue of those who live through thousand winters.',
    'The stars weave no illusions; only men deceive themselves.',
    'When the night is darkest, the star-singers strike their highest chord.'
  ],
  ancestors: [
    'Stone does not forget.',
    'Keep the grudge until the debt is paid.',
    'The hall endures when the smith is dust.',
    'An oath forged in cold iron binds the blood beyond the grave.',
    'Flawless craft is the highest prayer a dwarf can offer.',
    'Dig deep, but beware what slumbers in the roots of the mountain.',
    'Honor the hall of your fathers, and your line shall never crumble.',
    'A clan without memory is like an anvil without a hammer.',
    'Gold bought with cowardice turns to lead in the pocket.',
    'The ancestors watch from the dark stone; do not make them bow their heads.',
    'A grudge carved in granite outlasts ten generations of men.',
    'Measure twice, strike once, and let the hammer ring true.',
    'The deep veins hold the tears of the Forge-father.',
    'Strength in the arm, iron in the blood, and truth in the heart.',
    'One without his clan is a single stone cast out upon the plain.',
    'Revere the ancient runes, for they hold the weight of forgotten kings.',
    'Slight not the work of your elders, lest your own smithing fail.',
    'A sealed gate and a sharp axe ensure peaceful nights in the deep halls.',
    'Let your word be as unyielding as cold-forged iron.',
    'The roots of the mountain are old, but our clan-line is older.'
  ],
  sky: [
    'The sky sees everything.',
    'Do not foul the water or the grass, for they belong to the sky.',
    'A rider who respects his horse shall never lose his way in the blizzard.',
    'The eternal blue sky grants victory to those whose hearts are pure.',
    'Pour milk upon the earth before you cross the high mountain pass.',
    'The wind carries the words of the ancestors to those who listen.',
    'A warrior’s blood belongs to the soil; his spirit belongs to the wind.',
    'Fire purifies all things; cross the hearth-fire before you sit at the feast.',
    'The wolf hunts with the pack, but the eagle rides the sky alone.',
    'Fear not the cold winter, but the leader who breaks his word.',
    'A steppe horse knows its rider’s soul better than his own brother.',
    'The sky gives power to rule, and the sky takes it away from the cruel.',
    'Strike like thunder from the high hill, but rest quietly as the valley mist.',
    'Do not burn garbage in the hearth-fire, for the hearth is sacred.',
    'A guest in the felt tent is sent by the Eternal Sky.',
    'The bone-reader sees tomorrow in the cracks of the sheep’s shoulder.',
    'A nine-tasseled spear stands firm against a thousand cowards.',
    'Honor the earth mother, for her grass feeds the herds that sustain life.',
    'The eagle flies high, but returns to the mountain crag at dusk.',
    'Scatter wine to the four corners before riding out to war.'
  ],
  heaven: [
    'The superior man is calm and at ease.',
    'Rule by virtue, and the people will follow like stars around the pole.',
    'Filial duty is the root of all human goodness.',
    'He who moves a mountain begins by carrying away small stones.',
    'When Heaven grants the mandate, the mountains bow and rivers clear.',
    'A state governed by greed invites lightning and famine.',
    'Do not impose on others what you yourself do not desire.',
    'Study without thought is labor lost; thought without study is perilous.',
    'The jade tablet must be carved and polished before it shines.',
    'Respect the spirits, but keep your distance while performing the rites.',
    'To know what you know and what you do not know, that is true knowledge.',
    'A journey of a thousand leagues begins beneath one’s feet.',
    'The scholar who seeks truth does not ashamed himself of poor clothes.',
    'When ruler and subject honor the rites, peace reigns under Heaven.',
    'Cultivate virtue in yourself, then in your family, then in the state.',
    'The bamboo bends before the storm, while the stiff oak breaks.',
    'Offer incense to the ancestor-tablets morning and evening.',
    'A word once spoken cannot be overtaken by a chariot with four horses.',
    'Govern the people with dignity, and they will show respect.',
    'Heaven sees as the people see; Heaven hears as the people hear.'
  ],
  kami: [
    'Keep the heart pure, as the water of the mountain.',
    'The spirits dwell in every stone and tree.',
    'Wash away impurity at the running stream before approaching the gate.',
    'A clean heart repels the dark influences of the mountain.',
    'Even an old mirror acquires a soul after a hundred winters.',
    'Revere the sun-maiden, for her light yields the rice of the fields.',
    'Blood and decay defile the shrine; enter only in white robes.',
    'The wind through the pines is the breathing of the ancestral spirits.',
    'Offer seasonal fruits at the altar, and the harvests shall not fail.',
    'Walk with reverence beneath the vermilion gate.',
    'The fox-spirit rewards the respectful and punishes the arrogant.',
    'A peaceful mind reflects the world like a still mountain lake.',
    'Sweep the shrine grounds clean, and the kami will descend to dwell.',
    'Fold the paper talisman with care, for it carries a spirit’s ward.',
    'The waterfall cleanses both body and soul of malice.',
    'Revere the emperor, for his bloodline descends from the high heavens.',
    'Do not cut down the ancient cedar with sacred ropes bound around it.',
    'The kagura dance pleases the gods and dispels dark omens.',
    'Spring blossoms fade quickly; live each day with a clear heart.',
    'Even a blade of grass carries the breath of the eight million spirits.'
  ],
  spirits: [
    'Walk softly on the earth, for she is your mother.',
    'We do not inherit the land. We borrow it from our children.',
    'Listen to the wind, for it speaks with the voices of the elders.',
    'Take only what you need from the forest, and give thanks for the life taken.',
    'All things are connected like the blood that unites one family.',
    'The trickster teaches wisdom through the folly of proud men.',
    'Smoke carries the smoke-offering to the spirits of the four directions.',
    'A man who breaks his promise to the river shall find no fish in his nets.',
    'Honor the white buffalo, and the herds will return with the spring.',
    'The wheel of life turns for all—beast, tree, and man alike.',
    'The drumbeat is the heartbeat of the earth mother.',
    'When you hunt the deer, offer tobacco and ask its spirit for pardon.',
    'Beware the raven when he speaks with the voice of your brother.',
    'A vision received on the mountain peak guides a warrior through life.',
    'Do not speak ill of the dead, for their spirits linger near the camp.',
    'The cedar tree gives its bark for canoes, but asks for respect in return.',
    'A greedy man eats alone, but a wise man feeds the whole village.',
    'The turtle carries the world on its back; walk lightly upon its shell.',
    'The four winds bring four seasons; welcome each as a guest.',
    'Strength lies not in the bow string, but in the heart of the hunter.'
  ],
  sun: [
    'The sun is the father of kings.',
    'Do not steal. Do not lie. Do not be idle.',
    'Without the golden rays of {G}, the crops wither and darkness reigns.',
    'The Inca rules by divine blood, straight from the high disk.',
    'Offer gold to the temple, for it is the tears shed by the sun.',
    'When the eclipse comes, beat the drums lest the celestial jaguar devour the light.',
    'The road of the sun runs from peak to peak across the world.',
    'Labor given to the terraces is labor given to the gods.',
    'The high mountain peaks are the closest altars to the divine disk.',
    'Keep the eternal flame lit in the sun-house night and day.',
    'Gold is the sweat of the sun, and silver is the tears of the moon.',
    'Build stone walls that lock together, as the folk bind together in duty.',
    '{G} sees into every dark valley and hidden corner.',
    'Bring firstfruits to the high altar before eating of the harvest.',
    'The royal mummy retains his spirit while his lineage feeds his memory.',
    'Four quarters united under one golden crown bring order to the world.',
    'A lazy man steals warmth from the sun without paying in sweat.',
    'Perform the Inti rites faithfully, or the winter frost will never lift.',
    'The high priest speaks with the voice of the morning ray.',
    'Walk the stone road with pride, for it was built by order of Heaven.'
  ],
  serpent: [
    'The sun must be fed, or it will die.',
    'All flowers fade. All songs end.',
    'Blood poured upon obsidian feeds the earth and keeps the night at bay.',
    'Life comes from death, as green corn springs from buried seed.',
    'We come only to sleep, we come only to dream; it is not true that we come to live.',
    'The feathered serpent weaves the wind and brings the seasonal rain.',
    'Carve the heart swiftly with jade, lest the fifth sun go dark forever.',
    'Even jade shatters, even gold breaks, even quetzal feathers tear.',
    'The underworld has nine courts; walk them with obsidian in hand.',
    'Honesty in war pleases the lords of the night.',
    'The world was born in blood and must be sustained with blood.',
    'When the smoking mirror speaks, even kings must bow their heads.',
    'Draw the thorn through your tongue to purify your prayers to the gods.',
    'The jaguar stalks the night realm while mortals sleep.',
    'Plant the maize seed deep, and water it with sacred offerings.',
    'The fifth sun shall end in fire and earth tremors, as was foretold.',
    'A warrior captured in war goes as a divine messenger to the sun.',
    'Carve the calendar wheel in basalt, for time moves in eternal circles.',
    'The serpent sheds its skin, as the earth sheds winter for green spring.',
    'Not forever on earth; only a little while here. So make of it what you must.'
  ]
};

/** The books a verse may be cited from, by archetype ({P} = prophet, {G} = god, {S} = saint or second god). */
export const BOOKS: Record<FaithFamily, { oral?: boolean; books: string[] }> = {
  church: {
    books: [
      'the Book of {P}',
      'the Letters of {S}',
      'the Psalms',
      'the Proverbs',
      'the Revelation of {S}',
      'the Book of Judges',
      'the Acts of the Apostles',
      'the Gospel of {P}',
      'the Lamentations of {S}',
      'the Book of Martyrs',
      'the Epistles of the Holy',
      'the Chronicles of the Covenant'
    ]
  },
  crescent: {
    books: [
      'the Chapter of the Light',
      'the Chapter of the Cow',
      'the Chapter of Mercy',
      'the Chapter of the Pen',
      'the Sayings of {P}',
      'the Chapter of the Night Journey',
      'the Chapter of the Dawn',
      'the Chapter of the Iron',
      'the Chapter of the Star',
      'the Traditions of {S}',
      'the Book of the Straight Path',
      'the Covenant of the Prophets'
    ]
  },
  pantheon: {
    books: [
      'the Hymn to {G}',
      'the Hymn to {S}',
      'the Oracle',
      'the Works and Days',
      'the Birth of the Gods',
      'the Epic of {G}',
      'the Sacred Contests',
      'the Oracles of Delphi',
      'the Catalogue of Heroes',
      'the Rites of {G}',
      'the Hymn to the Underworld',
      'the Metamorphoses of {S}'
    ]
  },
  oldgods: {
    oral: true,
    books: [
      'the Sayings of {G}',
      'the Lay of {S}',
      'the Prophecy of the Seeress',
      'the Lay of the Giant',
      'the Lay of the High One',
      'the Song of {S}',
      'the Poem of Creation',
      'the Flyting of {G}',
      'the Saga of the Valkyries',
      'the Runic Staves of {S}',
      'the Song of the Iron Wood'
    ]
  },
  druid: {
    oral: true,
    books: [
      'the Triads',
      'the Song of {G}',
      'the Song of {S}',
      'the Teaching of the Grove',
      'the Ogham Verses',
      'the Lay of the Horned One',
      'the Cauldron Canticles',
      'the Lore of the Standing Stones',
      'the Prophecy of the Oak',
      'the Book of the Four Feasts',
      'the Song of the Sacred Spring'
    ]
  },
  stars: {
    books: [
      'the Lay of {G}',
      'the Lament for {S}',
      'the Song of the First Light',
      'the Book of the West',
      'the High Canticles of the Moon',
      'the Chronicle of the Haven',
      'the Starlit Annals',
      'the Weaving of {G}',
      'the Lay of the Evening Star',
      'the Hymn to the Canopy',
      'the Book of the Silver Seas'
    ]
  },
  ancestors: {
    books: [
      'the Book of Grudges',
      'the Tablet of the Fathers',
      'the Law of the Forge',
      'the Saga of the First Shaping',
      'the Carved Code of Cold Iron',
      'the Anvil-Roll of Kings',
      'the Ledger of Oaths',
      'the Rune-Stones of {G}',
      'the Chant of the Deep Vein',
      'the Lament for the Fallen Halls',
      'the Testament of the First Smiths'
    ]
  },
  sky: {
    oral: true,
    books: [
      'the Chant of {G}',
      'the Song of {S}',
      'the Birch-bark Sayings',
      'the Song of the Nine Spirits',
      'the Epic of the White Wolf',
      'the Chant of the Steppe-Riders',
      'the Law of the Great Sky',
      'the Song of the Hearth-Fire',
      'the Tales of the Iron Hero',
      'the Divinations of {G}',
      'the Lay of the Nine Pines'
    ]
  },
  heaven: {
    books: [
      'the Analects',
      'The Annals of Heaven',
      'The Annals of {P}',
      'the Book of Rites',
      'the Book of Odes',
      'the Book of Changes',
      'the Sayings of {P}',
      'the Spring and Autumn Annals',
      'the Classic of Filial Piety',
      'the Sutra of the Golden Lotus',
      'the Great Learning of {P}',
      'the Canon of the Jade Emperor',
      'the Commentary of the Sages',
      'the Book of Heavenly Harmony'
    ]
  },
  kami: {
    books: [
      'the Records of Ancient Matters, book',
      'the Prayer to {G}',
      'the Chronicle of the Gods',
      'the Prayer to {S}',
      'the Ritual Songs of the Mirror',
      'the Sutra of the Mountain Ascetics',
      'the Secret Scrolls of {G}',
      'the Oracles of the Sun-Maiden',
      'the Purification Rites of {S}',
      'the Tales of the Eight Million Souls',
      'the Imperial Records of Rites'
    ]
  },
  spirits: {
    oral: true,
    books: [
      'the Story of {G}',
      'the Story of {S}',
      'the Song of the Four Winds',
      'the Words of the Elders',
      'the Tales of the Trickster',
      'the Song of the Thunderbird',
      'the Vision of the Medicine Wheel',
      'the Lore of the Seven Generations',
      'the Chant of the Sun Dance',
      'the Pipe-Carrier’s Legend',
      'the Wampum Records of Peace'
    ]
  },
  sun: {
    books: [
      'the Song of {G}',
      'the Hymn to {S}',
      'the Cords of the Kings',
      'the Calendar of the Sun',
      'the Quipu Records of the High Priests',
      'the Chant of the Golden Disk',
      'the Saga of the Four Quarters',
      'the Chronicle of the Mummies',
      'the Song of {S}',
      'the High Peak Rituals of {G}',
      'the Tablets of the Sun-Maidens'
    ]
  },
  serpent: {
    books: [
      'the Book of Days',
      'the Song of {G}',
      'the Book of {S}',
      'the Song of the Five Suns',
      'the Codex of the Blood-Altar',
      'the Annals of the Serpent-King',
      'the Calendar of the 260 Days',
      'the Hymn to the Feathered Lord',
      'the Songs of the Underworld Courts',
      'the Prophecy of the Solar Eclipse',
      'the Rituals of Jade and Obsidian'
    ]
  },
};

/** A verse in the holy tongue: each clause translated, names kept as they are. */
function inTongue(f: Faith, en: string, names: string[]): Token[] {
  const L = f.lang;
  if (!L) return [];
  const out: Token[] = [];
  for (const clause of en.split(/(?<=[.,;:])\s+/)) {
    let src = clause.replace(/[.,;:!?]+$/, '');
    for (const n of names) if (n) src = src.split(n).join(PROPER(n));
    try {
      const t = translate(L, src);
      const prev = out[out.length - 1]?.form ?? '.';
      if (t.length && /[.!?]$/.test(prev)) t[0] = { ...t[0], form: t[0].form.charAt(0).toUpperCase() + t[0].form.slice(1) };
      const end = clause.match(/[.,;:!?]+$/)?.[0] ?? '';
      if (t.length && end) t[t.length - 1] = { ...t[t.length - 1], form: t[t.length - 1].form + end };
      out.push(...t);
    } catch {
      /* A clause the translator cannot say is left out of the holy tongue. */
    }
  }
  return out;
}

/** Some verses of a faith's scripture. */
export function scriptureVerses(f: Faith): Verse[] {
  const r = mulberry32(hashString(`scripture#${f.id}#${f.name}`));
  const G = f.deities[0]?.name ?? 'the gods';
  const S = f.deities[1]?.name ?? f.deities[0]?.name ?? 'the Wise';
  const P = f.prophet && f.missionary ? f.prophet : G;
  const names = [G, S, P].filter((x) => /^\p{Lu}/u.test(x));
  const fill = (s: string) => godly(f, s.replace(/\{G\}/g, G).replace(/\{S\}/g, S).replace(/\{P\}/g, P));
  const bk = BOOKS[f.family];
  const cite = () => {
    const b = fill(pick(r, bk.books));
    const ch = 1 + Math.floor(r() ** 1.4 * 40), v = 1 + Math.floor(r() * 50);
    return bk.oral ? `${b}, stanza ${v}` : b.endsWith('book') ? `${b} ${ch}, verse ${v}` : `${b} ${ch}:${v}`;
  };
  const out: Verse[] = [];
  const add = (en: string, about: string) => {
    const t = fill(en);
    out.push({ en: t, cite: cite(), about, tokens: inTongue(f, t, names) });
  };
  for (const t of f.tenets) {
    const vs = TENET_VERSES[t];
    if (!vs) continue;
    add(pick(r, vs), TENETS[t]?.name ?? t);
  }
  const groups = Object.keys(DOCTRINE_VERSES).filter((g) => DOCTRINE_VERSES[g][f.doctrines[g as keyof Faith['doctrines']]]);
  for (const g of groups.sort(() => r() - 0.5).slice(0, 3)) add(pick(r, DOCTRINE_VERSES[g][f.doctrines[g as keyof Faith['doctrines']]]), GROUP_ABOUT[g]);
  for (const s of [...GENERAL[f.family]].sort(() => r() - 0.5).slice(0, 2)) add(s, 'Sayings');
  return out;
}
