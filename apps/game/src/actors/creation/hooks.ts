/**
 * How a life begins (docs/design/quests.md, The task log; stage Q3): the starts offered at the end
 * of character creation, drawn from the character's own ties and the Omen card, and the quiet
 * starts for one who wants an empty slate. The quests themselves are made when play begins
 * (game/life.ts), where the world can be asked.
 */
import { hashString } from '@worldforge/core/gen/rng';
import type { Tie } from '../components/history';

export type HookKind = 'debt' | 'love' | 'lost' | 'family' | 'affairs' | 'rival' | 'feud' | 'omen' | 'work' | 'quiet' | 'clean';

/** A way to begin: a starting quest from a tie or the Omen, or none. */
export interface StartHook {
  id: string;
  kind: HookKind;
  label: string;
  about: string;
  /** The tie it comes from (its key, `tieKey`). */
  tie?: string;
}

/** A stable key for a tie, which is also the id of the person in the world (`tie:` and a hash). */
export function tieKey(t: Tie): string {
  return `tie:${hashString(`${t.kind}|${t.name ?? t.text}`).toString(36)}`;
}

/** Whether a tie is a love who waits (a friend tie that speaks of love, living, not lost). */
export const isLove = (t: Tie) => t.kind === 'friend' && /\blove/.test(t.text) && !/\blost\b/.test(t.text);
/** A love lost, whose fate is not known for sure. */
export const isLost = (t: Tie) => t.kind === 'friend' && /\blost\b/.test(t.text);
/** A debt to a named person, and its amount (copper). */
export function debtOf(t: Tie): number | null {
  if (t.kind !== 'debt') return null;
  const m = /(\d+) copper/.exec(t.text);
  return m ? Number(m[1]) : t.name ? 60 : 100;
}

/**
 * The starts offered: up to three quests drawn from the character's ties and the Omen (a debt called
 * in, word from a love or from home, a rival's move, a dead parent's affairs, the Omen's sign, or work
 * in the town), then a quiet start (no starting quest, the obligations of the life kept) and a clean
 * slate (neither).
 */
export function startHooks(ties: Tie[], omen: string | undefined, home: string): StartHook[] {
  const out: StartHook[] = [];
  const add = (h: StartHook) => {
    if (out.length < 3 && !out.some((x) => x.kind === h.kind)) out.push(h);
  };
  const debt = ties.find((t) => debtOf(t) !== null && t.name && t.alive !== false);
  if (debt) add({ id: `debt:${tieKey(debt)}`, kind: 'debt', tie: tieKey(debt), label: `${debt.name} calls in the debt`, about: `${debt.text} Word has come that ${debt.name} wants it paid, and soon.` });
  const love = ties.find(isLove);
  const lost = ties.find(isLost);
  if (love?.name) add({ id: `love:${tieKey(love)}`, kind: 'love', tie: tieKey(love), label: `A letter from ${love.name}`, about: `${love.name} has written, asking you to come back to ${home}.` });
  else if (lost?.name) add({ id: `lost:${tieKey(lost)}`, kind: 'lost', tie: tieKey(lost), label: `What became of ${lost.name}`, about: `You loved ${lost.name}, and lost them. Someone in ${home} may know what became of them.` });
  const rival = ties.find((t) => t.kind === 'rival' && t.name && t.alive !== false);
  const feud = ties.find((t) => t.kind === 'feud');
  if (rival) add({ id: `rival:${tieKey(rival)}`, kind: 'rival', tie: tieKey(rival), label: `${rival.name} moves against you`, about: `${rival.name} has been speaking against you in ${home}. It must be answered, one way or another.` });
  else if (feud) add({ id: `feud:${tieKey(feud)}`, kind: 'feud', tie: tieKey(feud), label: 'The feud flares', about: `${feud.text} Blood has been spilt again, and your family looks to you.` });
  const parent = ties.find((t) => t.kind === 'parent' && t.alive !== false && t.name);
  const dead = ties.find((t) => t.kind === 'parent' && t.alive === false && t.name);
  if (dead && ties.some((t) => (t.kind === 'parent' || t.kind === 'sibling') && t.alive !== false && t.name)) add({ id: `affairs:${tieKey(dead)}`, kind: 'affairs', tie: tieKey(dead), label: `${dead.name}'s affairs`, about: `${dead.text} What they left behind is still to be settled with your family in ${home}.` });
  else if (parent) add({ id: `family:${tieKey(parent)}`, kind: 'family', tie: tieKey(parent), label: 'Word from home', about: `${parent.name} has fallen ill, and the family asks you to come home to ${home}.` });
  if (omen) add({ id: 'omen', kind: 'omen', label: 'The sign in the cards', about: `The cards said: ${omen} A place in the country about seems to answer them.` });
  add({ id: 'work', kind: 'work', label: 'Looking for work', about: `You arrive in ${home} with an empty purse and an eye for work.` });
  out.push({ id: 'quiet', kind: 'quiet', label: 'No starting quest', about: 'Begin with no quest in hand. What you owe and who you know are still in your journal.' });
  out.push({ id: 'clean', kind: 'clean', label: 'A clean slate', about: 'Begin with no quest and no obligations: the people of your life are in the world, but nothing is pressing.' });
  return out;
}
