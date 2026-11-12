/**
 * Drawing the fate cards, and the quick start: a whole character drawn from a seed, every step
 * at random but within what the world and the character allow (docs/design/creation.md).
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { DECK, POSITIONS, type Position } from '../data/cards';
import { STANDINGS } from '../data/standing';
import { CRAFTS, SCHOOLS, TRACK, type TrackId } from '../data/occupations';
import { TRAITS, TRAIT_SPREAD, type TraitId } from '../data/traits';
import type { StandingId } from '../components';
import { newChoices, resolve, trackOptions, type CardDraw, type Choices, type CreationWorld } from './resolve';

const rngOf = (seed: string, tag: string) => mulberry32(hashString(`${seed}|${tag}`));
const pickW = <T>(r: () => number, items: [T, number][]): T => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
};

/** A spread of four different cards, each upright or reversed. */
export function drawSpread(seed: string, n: number): CardDraw[] {
  const r = rngOf(seed, `spread${n}`);
  const deck = [...DECK];
  return POSITIONS.map((position) => {
    const card = deck.splice(Math.floor(r() * deck.length), 1)[0];
    return { position, card: card.id, reversed: r() < 0.35 };
  });
}

/** Draws one position again, from the cards not already in the spread. */
export function redrawOne(ch: Choices, position: Position): Choices {
  const r = rngOf(ch.seed, `redraw${ch.redraws}:${position}`);
  const inUse = new Set((ch.spread ?? []).map((d) => d.card));
  const free = DECK.filter((c) => !inUse.has(c.id));
  const card = free[Math.floor(r() * free.length)];
  const spread = (ch.spread ?? []).map((d) => (d.position === position ? { position, card: card.id, reversed: r() < 0.35 } : d));
  return withBirth({ ...ch, spread, redraws: ch.redraws + 1 });
}

/** The Birth card sets the family's standing (reversed: the same standing, fallen on hard times). */
export function withBirth(ch: Choices): Choices {
  const b = ch.spread?.find((d) => d.position === 'birth');
  const card = b && DECK.find((c) => c.id === b.card);
  return card ? { ...ch, standing: card.standing } : ch;
}

/** The standings likely in a place of this size. */
export function rollStanding(r: () => number, tier: string): StandingId {
  return pickW(r, STANDINGS.map((s) => [s.id, tier === 'city' ? s.weight.city : s.weight.town] as [StandingId, number]));
}

/** The occupations each standing most often leads to. */
const AFFINITY: Record<StandingId, Partial<Record<TrackId, number>>> = {
  peasant: { farming: 4, woodland: 3, military: 2, civil: 2, outlaw: 1 },
  townsfolk: { craft: 3, trades: 2, military: 2, thief: 1.5, performance: 1.5, civil: 1.5 },
  craftsman: { craft: 6, trades: 2, military: 1 },
  merchant: { trades: 6, seafaring: 1.5, academia: 1.5 },
  clergy: { religion: 5, academia: 3, healing: 2 },
  minor: { military: 5, civil: 2, academia: 1.5, religion: 1 },
  noble: { military: 4, civil: 3, academia: 2, religion: 1.5 },
};

/** Trades a parent may hand on as a craft. */
const PARENT_CRAFT: Record<string, string> = {
  smith: 'smith', carpenter: 'carpenter', mason: 'mason', tanner: 'tanner', weaver: 'tailor', tailor: 'tailor', cooper: 'carpenter', potter: 'potter', jeweller: 'jeweller', baker: 'brewer', innkeeper: 'brewer',
};

/** A whole character at random: one click from the quick start. */
export function quickStart(seed: string, culture: number, homeId: string, w: CreationWorld): Choices {
  const r = rngOf(seed, 'quick');
  const home = w.starts.find((s) => s.id === homeId) ?? w.starts[0];
  let ch = newChoices(seed, culture, homeId, r() < 0.5);
  ch.spread = drawSpread(seed, 0);
  // The Birth card leans the standing; often the place decides instead.
  ch = r() < 0.6 ? withBirth(ch) : { ...ch, standing: rollStanding(r, home.tier) };

  // Trait points, mostly toward the life the Path card leans to.
  const first = resolve(ch, w);
  const lean: TraitId[] = first.path ? [...TRACK.get(first.path)!.lean, ...TRACK.get(first.path)!.promote] : [];
  const spend: Partial<Record<TraitId, number>> = {};
  for (let i = 0; i < first.budget; i++) {
    for (let tries = 0; tries < 10; tries++) {
      const t = lean.length && r() < 0.6 ? lean[Math.floor(r() * lean.length)] : TRAITS[Math.floor(r() * TRAITS.length)];
      if ((spend[t] ?? 0) < TRAIT_SPREAD) {
        spend[t] = (spend[t] ?? 0) + 1;
        break;
      }
    }
  }
  ch = { ...ch, spend };

  // A run of terms.
  const n = pickW(r, [[1, 0.15], [2, 0.35], [3, 0.3], [4, 0.2]] as [number, number][]);
  for (let i = 0; i < n; i++) {
    const res = resolve(ch, w);
    const open = trackOptions(res).filter((o) => !o.reason);
    if (!open.length) break;
    const last = ch.terms[ch.terms.length - 1]?.track;
    const lastOpt = open.find((o) => o.track.id === last);
    let track: TrackId;
    if (lastOpt && lastOpt.rank < lastOpt.track.ranks.length - 1 && r() < 0.75) track = lastOpt.track.id;
    else if (i === 0 && res.path && open.some((o) => o.track.id === res.path) && r() < 0.7) track = res.path;
    else {
      const aff = AFFINITY[res.family.standing.id];
      track = pickW(r, open.map((o) => [o.track.id, (aff[o.track.id] ?? 0.4) + (o.track.id === res.path ? 2 : 0)] as [TrackId, number]));
    }
    let choice: string | undefined = ch.terms.find((t) => t.track === track)?.choice;
    if (!choice && track === 'craft') choice = PARENT_CRAFT[res.family.father.trade.name] ?? CRAFTS[Math.floor(r() * CRAFTS.length)].id;
    if (!choice && track === 'magic') choice = SCHOOLS[Math.floor(r() * SCHOOLS.length)].id;
    ch = { ...ch, terms: [...ch.terms, { track, ...(choice ? { choice } : {}) }] };
  }

  ch.name = Math.floor(r() * 6);
  ch.look = { skin: Math.floor(r() * 4), hair: Math.floor(r() * 4), hairStyle: Math.floor(r() * 6), beard: Math.floor(r() * 6), build: Math.floor(r() * 4) };
  return ch;
}
