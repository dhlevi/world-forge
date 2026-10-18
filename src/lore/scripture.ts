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
const TENET_VERSES: Record<string, string[]> = {
  holyWar: ['Take up the sword against the unbeliever. Whoever falls in the holy war is saved.', 'The enemies of {G} are your enemies. Do not rest until their shrines are fallen.'],
  pilgrimage: ['Go up to the holy city once in your life. The road is the prayer.', 'Leave your house and walk to the holy places, and {G} will walk beside you.'],
  charity: ['Give to the poor, and {G} will give to you.', 'The open hand is blessed. The closed hand is cursed.'],
  monasticism: ['Leave the world and keep the holy books. The silent house is near to {G}.', 'The monk who copies the word lights a lamp in the dark.'],
  mendicants: ['Carry nothing on the road but the word.', 'Go from town to town, and eat what the poor give you.'],
  endTimes: ['The end is near. Keep your lamp lit, for no one knows the hour.', 'The world will burn, and only the faithful will stand.'],
  sacredLaw: ['The law is the word of {G}. No king may change it.', 'Judge by the book, and the judges will be just.'],
  aniconism: ['Make no image of a living thing. {G} has no face that the hand can carve.', 'Do not bow before stone or wood. Bow before {G} alone.'],
  purity: ['Wash before you pray. The unclean hand may not touch the holy.', 'Do not eat the meat of the pig. Do not touch the dead without washing.'],
  ritualSacrifice: ['Feed the gods with blood, and they will feed the fields.', 'The gods gave their blood for the world. Give your blood in return.'],
  divination: ['Read the birds before the battle. The gods speak in signs.', 'Cast the lots before every great deed, and do as they say.'],
  feastDays: ['Keep the great feasts, and the year will turn well.', 'On the holy days eat and drink and give thanks to the gods.'],
  hospitality: ['Feed the stranger at your door. The gods walk among us in rags.', 'The guest under your roof is under the protection of the gods.'],
  astrology: ['The stars write the fate of every child. Read them at every birth.', 'Do not march when the red star is high.'],
  warriorCult: ['The brave who die in battle feast with {G} for ever.', 'Cattle die and kinsmen die. The name of the brave never dies.'],
  sacredGroves: ['The gods live in the groves. Whoever cuts a holy tree will die.', 'Pray under the old trees, for they are older than kings.'],
  sacredWaters: ['Do not foul the springs, for the gods drink from them.', 'The river is holy. Give it gifts, and it will give you life.'],
  nature: ['Take nothing from the land without thanks.', 'The wolf and the deer and the people are brothers.'],
  rebirth: ['The soul is born again and again. Your deeds choose your next life.', 'Death is a door, and not a wall.'],
  ancestors: ['Feed your dead and ask them for counsel.', 'The dead watch over the living. Do not shame them.'],
  kingship: ['Heaven chooses the king. Whoever rebels against him rebels against heaven.', 'The just king rules by the mandate of heaven. The unjust king loses it.'],
  asceticism: ['Fast and pray, and the flesh will become light.', 'The rich man carries a heavy load. The poor man walks freely to {G}.'],
  pacifism: ['Do not kill. The blood of your brother cries out from the ground.', 'Answer the sword with the open hand.'],
  craft: ['The good work of your hand is a prayer.', 'The masterwork is the gift of the smith to the Maker.'],
  dualism: ['The light and the dark make war in every heart. Choose the light.', 'Every good deed is a blow against the dark.'],
  carnalism: ['The pleasures of the body are a gift of the gods. Take them with thanks.', 'Love is holy. Do not be ashamed of it.'],
  communion: ['Eat the holy bread together, and you will be one body.', 'Whoever eats at the table of {G} is never alone.'],
  ecclesiarchy: ['The temple rules over all things, for its priests speak for the gods.', 'Obey the priests as you obey the gods.'],
  adorcism: ['Open your body to the spirit, and the god will speak with your mouth.', 'Dance until the god comes down.'],
  witchcraft: ['The hidden powers are the gifts of the gods. Use them wisely.', 'The wise woman knows the words that bind and loose.'],
  hedonism: ['Eat and drink and love, for the gods love the joyful.', 'Joy is the first prayer.'],
  suicide: ['A noble death washes away shame.', 'When honour is lost, the blade restores it.'],
  filialPiety: ['Honour your father and your mother all your days.', 'The child who serves the parents serves heaven.'],
  takamine: ['The mountains are the homes of the spirits. Climb them with a pure heart.', 'Bow to the mountain, for it was here before you.'],
  sacredLearning: ['Seek knowledge, for it is the light of {G}.', 'The scholar’s ink is holier than the blood of the martyr.'],
};
const DOCTRINE_VERSES: Record<string, Record<string, string[]>> = {
  head: {
    pontiff: ['Obey the high priest, for he holds the keys of heaven.', 'One shepherd leads the flock of {G}.'],
    ruler: ['The king is the priest of his people. His word is the word of the gods.', 'Bow to the throne, for the gods sit upon it.'],
    none: ['No man stands between you and the gods.', 'Every temple is the house of the gods, and none is greater than another.'],
  },
  clergy: {
    celibate: ['The priest takes no wife, for his bride is the faith.'],
    married: ['Let the priest marry, and let his house be a lamp to the town.'],
    hereditary: ['The priesthood passes from father to son, as the flame passes from lamp to lamp.'],
    priestesses: ['Only women may serve at the altar, for the gods first spoke to a woman.'],
    open: ['Whoever is called may serve, man or woman.'],
  },
  conversion: {
    missionary: ['Carry the word to every people, to the ends of the earth.'],
    closed: ['The faith is the inheritance of our fathers. Do not give it to strangers.'],
    sword: ['Bring the unbelievers to the faith by the sword, if they will not come by the word.'],
  },
  others: {
    pluralist: ['There are many roads up the mountain.', 'Do not mock the gods of other peoples.'],
    righteous: ['Let the unbeliever live among you, and let him pay the tax.'],
    fundamentalist: ['Throw down the altars of the false gods.', 'There is no peace with the idolater.'],
  },
  death: {
    burial: ['From the earth you came, and to the earth you will return.'],
    burning: ['Give the dead to the fire, and the smoke will carry them to the gods.'],
    barrows: ['Lay the great in the mound with their swords, for they will need them.'],
    tombs: ['Keep the bodies of the dead, for their souls will come home.'],
    sky: ['Give the dead to the birds, and they will carry them to the sky.'],
    sea: ['Give the dead to the sea, and they will sail beyond the edge of the world.'],
  },
  marriage: {
    monogamy: ['Let a man have one wife, and a woman one husband, until death.'],
    concubines: ['A man may keep one wife in his house, and others beside her.'],
    polygamy: ['A man may take as many wives as he can feed.'],
  },
};
const GROUP_ABOUT: Record<string, string> = { head: 'The head of the faith', clergy: 'The priesthood', conversion: 'Spreading the faith', others: 'Other faiths', death: 'The dead', marriage: 'Marriage' };

const GENERAL: Record<FaithFamily, string[]> = {
  church: ['Love {G} with all your heart.', 'Blessed are the poor, for they will see {G}.', 'Forgive your enemy, as {G} forgives you.'],
  crescent: ['There is no god but {G}.', 'Pray five times each day, facing the holy city.', 'Paradise lies at the feet of your mother.'],
  pantheon: ['Know yourself.', 'Nothing in excess.', 'The gods help those who help themselves.'],
  oldgods: ['Keep your oath, for the gods hear it.', 'A man should be a friend to his friend.', 'The fool lies awake all night and worries.'],
  druid: ['Three things are holy: truth, the land and the bond of the guest.', 'The druid speaks before the king.'],
  stars: ['The stars were first, and we are their children.', 'Remember the light of the first days.'],
  ancestors: ['Stone does not forget.', 'Keep the grudge until the debt is paid.', 'The hall endures when the smith is dust.'],
  sky: ['The sky sees everything.', 'Do not foul the water or the grass, for they belong to the sky.'],
  heaven: ['The superior man is calm and at ease.', 'Rule by virtue, and the people will follow like stars around the pole.'],
  kami: ['Keep the heart pure, as the water of the mountain.', 'The spirits dwell in every stone and tree.'],
  spirits: ['Walk softly on the earth, for she is your mother.', 'We do not inherit the land. We borrow it from our children.'],
  sun: ['The sun is the father of kings.', 'Do not steal. Do not lie. Do not be idle.'],
  serpent: ['The sun must be fed, or it will die.', 'All flowers fade. All songs end.'],
};

/** The books a verse may be cited from, by archetype ({P}, {G}, {S} a saint or second god). */
const BOOKS: Record<FaithFamily, { oral?: boolean; books: string[] }> = {
  church: { books: ['the Book of {P}', 'the Letters of {S}', 'the Psalms', 'the Proverbs', 'the Revelation of {S}', 'the Book of Judges'] },
  crescent: { books: ['the Chapter of the Light', 'the Chapter of the Cow', 'the Chapter of Mercy', 'the Chapter of the Pen', 'the Sayings of {P}', 'the Chapter of the Night Journey'] },
  pantheon: { books: ['the Hymn to {G}', 'the Hymn to {S}', 'the Oracle', 'the Works and Days', 'the Birth of the Gods'] },
  oldgods: { oral: true, books: ['the Sayings of {G}', 'the Lay of {S}', 'the Prophecy of the Seeress', 'the Lay of the Giant'] },
  druid: { oral: true, books: ['the Triads', 'the Song of {G}', 'the Song of {S}', 'the Teaching of the Grove'] },
  stars: { books: ['the Lay of {G}', 'the Lament for {S}', 'the Song of the First Light', 'the Book of the West'] },
  ancestors: { books: ['the Book of Grudges', 'the Tablet of the Fathers', 'the Law of the Forge', 'the Saga of the First Shaping'] },
  sky: { oral: true, books: ['the Chant of {G}', 'the Song of {S}', 'the Birch-bark Sayings', 'the Song of the Nine Spirits'] },
  heaven: { books: ['the Analects', 'the Book of Rites', 'the Book of Odes', 'the Book of Changes', 'the Sayings of {P}'] },
  kami: { books: ['the Records of Ancient Matters, book', 'the Prayer to {G}', 'the Chronicle of the Gods', 'the Prayer to {S}'] },
  spirits: { oral: true, books: ['the Story of {G}', 'the Story of {S}', 'the Song of the Four Winds', 'the Words of the Elders'] },
  sun: { books: ['the Song of {G}', 'the Hymn to {S}', 'the Cords of the Kings', 'the Calendar of the Sun'] },
  serpent: { books: ['the Book of Days', 'the Song of {G}', 'the Book of {S}', 'the Song of the Five Suns'] },
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
