/**
 * What can happen in a term of an occupation (docs/design/creation.md: "Each term draws an event,
 * as in Darklands and Traveller"). Proposed.
 */
import type { TrackId } from '../data/occupations';

export type TermEventKind = 'quiet' | 'wound' | 'war' | 'windfall' | 'contact' | 'rival' | 'debt' | 'crime' | 'illness' | 'mentor' | 'love' | 'loss' | 'calling';

/** How likely each event is, for everyone, and the extra weight each track adds. */
const BASE: Record<TermEventKind, number> = {
  quiet: 4, wound: 1, war: 1.5, windfall: 1, contact: 2, rival: 1, debt: 1, crime: 0.3, illness: 1, mentor: 1.2, love: 1, loss: 0.8, calling: 0.7,
};

const BY_TRACK: Partial<Record<TrackId, Partial<Record<TermEventKind, number>>>> = {
  military: { wound: 4, war: 4, contact: 1, rival: 1 },
  outlaw: { wound: 3, crime: 3, rival: 1 },
  thief: { crime: 3, rival: 1, debt: 1 },
  woodland: { wound: 1.5, mentor: 1 },
  seafaring: { wound: 1, windfall: 1, illness: 0.5 },
  trades: { windfall: 2, debt: 2, contact: 2, rival: 1 },
  religion: { calling: 1, mentor: 1, quiet: 2 },
  academia: { mentor: 2, rival: 1, contact: 1 },
  healing: { illness: 1.5, contact: 1 },
  performance: { love: 2, contact: 2, debt: 1 },
  craft: { mentor: 2, rival: 1 },
  farming: { quiet: 3, loss: 1, illness: 0.5 },
  civil: { contact: 2, rival: 1 },
  magic: { mentor: 2, rival: 1, wound: 0.5 },
};

export function eventWeights(track: TrackId): [TermEventKind, number][] {
  const add = BY_TRACK[track] ?? {};
  return (Object.keys(BASE) as TermEventKind[]).map((k) => [k, BASE[k] + (add[k] ?? 0)]);
}

export function pickEvent(track: TrackId, r: () => number, allowed: (k: TermEventKind) => boolean): TermEventKind {
  const w = eventWeights(track).filter(([k]) => allowed(k));
  const total = w.reduce((s, [, x]) => s + x, 0);
  let x = r() * total;
  for (const [k, v] of w) {
    x -= v;
    if (x <= 0) return k;
  }
  return 'quiet';
}

export const SCAR_PARTS = ['face', 'left arm', 'right arm', 'left hand', 'right hand', 'chest', 'back', 'left leg', 'right leg', 'scalp', 'side'];
export const WOUND_HOW: Partial<Record<TrackId, string[]>> = {
  military: ['a spear thrust', 'an arrow', 'a sword cut', 'a fall in the press of a battle'],
  outlaw: ['a fight over a share of the take', 'a watchman\'s crossbow', 'a knife in the dark'],
  thief: ['a fall from a roof', 'a beating by a mark\'s guards'],
  woodland: ['a boar\'s tusks', 'a fall from a tree', 'a wolf\'s bite'],
  seafaring: ['a block that fell from the rigging', 'a rope that ran through your hands'],
  magic: ['a spell that went wrong'],
};
export const WOUND_ANY = ['a tavern brawl', 'a kick from a horse', 'an accident at work', 'robbers on the road'];
