/**
 * What residents say (docs/design/npcs.md, Talking and dealing; Stage 1 step 4): a greeting by
 * what they think of the wanderer and the hour, and one line from what they are about, their
 * trade, or the people in their life (their ties to the neighbours). Rumours and quests come with
 * the quest generator.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { Resident } from './population';

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

/** A greeting, by the hour, how they regard the wanderer, and whether they have met. */
export function greeting(r: Resident, opinion: number, met: boolean, hour: number, player: string): string {
  const part = hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening';
  if (opinion <= -40) return 'What do you want?';
  if (opinion <= -12) return 'Oh. It is you.';
  if (opinion >= 40 && met) return `${player}! Good to see you.`;
  if (opinion >= 12 && met) return `Good ${part} to you again.`;
  if (r.p.template === 'beggar' && /beggar/.test(r.p.trade)) return 'Bless you, traveller.';
  if (r.p.template === 'guard') return 'Hold there. What is your business?';
  return met ? `Good ${part}.` : `Good ${part}, stranger.`;
}

/** Lines by trade (a pattern of the trade), while at work. */
const AT_WORK: [RegExp, string[]][] = [
  [/smith|founder/, ['Mind the sparks.', 'The iron will not wait while it is hot.', 'Horseshoes, nails, hinges: whatever you need, I can make it.']],
  [/baker/, ['The next batch is nearly out of the oven.', 'Up before the sun, every day of the year.']],
  [/cooper/, ['Barrels, tubs and buckets, all tight as a drum.', 'The staves will not hoop themselves.']],
  [/carpenter|joiner|wheelwright|shipwright|boatwright/, ['Measure twice, cut once.', 'Good seasoned oak is hard to come by this year.']],
  [/tailor|seamstress|weaver|spinner/, ['Fine cloth, if you have the coin.', 'My eyes are not what they were for this close work.']],
  [/butcher/, ['Fresh this morning.', 'Mind the floor; it is slippery.']],
  [/tavern|innkeeper|tapster|potboy|potgirl|serving/, ['Ale, a bite to eat, a bed for the night, if you have the coin.', 'It will be busy tonight.']],
  [/priest|acolyte|monk|nun|prior|sexton|shrine/, ['The gods keep you.', 'The doors of the temple are open to all.']],
  [/guard|soldier|man-at-arms|woman-at-arms|sergeant|captain|turnkey|warden|watch/, ['Move along, and keep the peace.', 'Quiet today. Let us hope it stays that way.']],
  [/carter|porter|stevedore|dockhand/, ['Out of the way of the load, friend.', 'Heavy work, and poor pay for it.']],
  [/beggar|rag-picker/, ['A copper for the hungry?', 'Alms, for pity\'s sake.']],
  [/hawker|pedlar/, ['Ribbons, pins and needles! Fresh apples!', 'Best prices in the market, I promise you.']],
  [/farmer|plough|cottar|shepherd|swineherd|gardener|vine/, ['The weather will make or break us this year.', 'Plenty of work, never enough hands.']],
  [/merchant|money-lender|banker|factor|goldsmith/, ['Trade is slow this season.', 'Everything has its price.']],
  [/clerk|scribe|scrivener|notary|lawyer|copyist|librarian|scholar/, ['Forgive me, I must finish this before the light goes.', 'Ink, parchment and patience.']],
  [/servant|maid|cook|scullion|steward|footman|groom|nurse/, ['The household does not run itself.', 'Excuse me, I have work to do.']],
];
const GOING: Record<string, string> = {
  market: 'I cannot stop; I am off to the market.', tavern: 'Off to the tavern. Join me, if you like.', temple: 'I am on my way to the temple.',
  home: 'Home, at last.', bed: 'Home to bed.', table: 'Home for a meal.', work: 'I am late for work.', out: 'Off to work.', warehouse: 'Off to fetch a load.',
  gate: 'Off to the gate with a load.', square: 'Off for a breath of air in the square.',
};

/** A tie in a resident's own words, from its text ("Old friends with Aldo Venn (cooper), next door to the east."). */
export function tieLine(kind: string, text: string): string | null {
  const m = /(?:with|to|by|on) (.+?) \(([^)]+)\), ([^.]+?)(?:, over (.+))?\.$/.exec(text);
  if (!m) return null;
  const [, who, trade, where, over] = m;
  switch (kind) {
    case 'friend': return `${who}, the ${trade} ${where}, is an old friend of mine.`;
    case 'rival': return `Do not believe a word ${who} says. The ${trade}, ${where}.`;
    case 'owes': return `I owe ${who} money. Do not mention it, if you see the ${trade}.`;
    case 'owed': return `${who}, the ${trade} ${where}, still owes me money.`;
    case 'feud': return `${who}? We do not speak, not since ${over ?? 'what happened'}.`;
    case 'sweetheart': return `Have you met ${who}, the ${trade}? No reason. I only wondered.`;
    case 'kin': return `${who}, ${where}, is kin of mine by marriage.`;
    case 'partner': return `${who} and I are in business together.`;
    default: return null;
  }
}

/**
 * One line from a resident: where they are going, their work, the weather, or someone in their life.
 * The same on one day for one person and one time of asking (`n`: how many times today).
 */
export function lineOf(r: Resident, day: number, n: number, raining: boolean): string {
  const rnd = mulberry32(hashString(`${r.p.id}#talk#${day}#${n}`));
  const st = r.stop;
  if (r.where === 'walking' && st) return GOING[st.place] ?? 'I must be going.';
  const options: string[] = [];
  if (st?.act === 'work' || st?.act === 'worship') {
    const t = r.p.trade.toLowerCase();
    const lines = AT_WORK.find(([re]) => re.test(t))?.[1];
    if (lines) options.push(...lines);
  }
  if (st?.act === 'errand') options.push('Prices are up again.', 'The bread is dearer every week.');
  if (st?.act === 'leisure' && st.place === 'tavern') options.push('Sit down; the ale is not bad tonight.');
  if (st?.act === 'meal') options.push('You have caught us at our meal.');
  if (raining) options.push('Filthy weather.');
  // Someone in their life, now and then.
  const ties = r.p.ties ?? [];
  if (ties.length && rnd() < 0.5) {
    const tl = tieLine(...((tie) => [tie.kind, tie.text] as const)(pick(rnd, ties)));
    if (tl) options.push(tl, tl);
  }
  if (r.p.template === 'child') options.push('Are you a soldier?', 'Mother says I must not talk to strangers.');
  if (r.p.template === 'elder') options.push('In my day the winters were colder.', 'Sit a while, if your legs are young enough to get up again.');
  if (!options.length) options.push('A fair day to you.', 'Can I help you?', 'Mind how you go.');
  // Asked again the same day, they say the next thing they have to say.
  const first = Math.floor(mulberry32(hashString(`${r.p.id}#talk#${day}`))() * options.length);
  return options[(first + n) % options.length];
}
