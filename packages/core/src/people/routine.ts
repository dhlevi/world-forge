/**
 * The first, simple day plan of a resident (docs/design/npcs.md, Stage 1 step 2): where a person
 * is at an hour of a day, from their trade, their place in the household and the kind of building
 * they live in. Asleep at night, at work by day, at home in the morning and the evening.
 *
 * Where a person works is, for now:
 * - in their own building ("shop"): the keepers of a trade, an inn or a temple, a household's
 *   journeymen and apprentices, the staff of a barracks or a guildhall, a great house's servants;
 * - at home ("home"): the crafts worked in the house (a weaver, a cobbler), and those who keep it;
 * - out of doors near home ("out"): the farmers, herders, labourers, carters and hawkers;
 * - elsewhere ("away"): those whose work lies away from home (a miner, a sailor, a lawyer), and an
 *   inn's guests by day. They are not placed by day until their workplaces are worked out (step 3).
 *
 * Deterministic: the same world, person and day give the same plan (no Math.random).
 */
import { hashString, mulberry32 } from '../gen/rng';
import type { Household, Person, RKind } from './residents';

/** Where a person works. */
export type Work = 'shop' | 'home' | 'out' | 'away' | 'none';

/** Where a person is at an hour. */
export type Whereabouts = 'asleep' | 'home' | 'work' | 'out' | 'away';

/** A day's plan, in hours of the day (0 to 24). */
export interface DayPlan {
  wake: number;
  /** The working hours (none: no work away from the house's own round). */
  work?: [number, number];
  /** Bedtime (before midnight). */
  sleep: number;
}

/** Trades worked out of doors, near home. */
const OUT = new Set([
  'farmer', 'shepherd', 'ploughman', 'ploughwoman', 'cottar', 'swineherd', 'beekeeper', 'hedger', 'thatcher', 'gardener', 'woodcutter', 'sawyer', 'charcoal burner',
  'drover', 'vine-dresser', 'grape-picker', 'hunter', 'gatherer', 'fisher', 'fisherman', 'fisherwoman', 'fishwife', 'net-mender', 'hawker', 'beggar', 'rag-picker',
  'street sweeper', 'rat-catcher', 'mudlark', 'labourer', 'porter', 'carter', 'dockhand', 'stevedore', 'brickmaker', 'ropemaker', 'washerwoman', 'washerman',
  'laundress', 'launderer', 'dairymaid', 'dairyman', 'basket-weaver', 'salter', 'boatwright', 'shipwright', 'sailmaker', 'hermit', 'pilgrim guide',
]);
/** Trades worked away from home. */
const AWAY = new Set([
  'miner', 'smelter', 'ore-washer', 'sailor', 'customs clerk', 'shipowner', 'alderman', 'lawyer', 'notary', 'physician', 'money-lender', 'night-soil man',
  'night-soil woman', 'camp follower', 'sutler', 'merchant\'s factor', 'miller\'s hand',
]);
/** Kept late: an inn's and a tavern's people. */
const LATE = new Set(['innkeeper', 'tavern keeper', 'cook', 'serving girl', 'serving man', 'potboy', 'potgirl', 'tapster', 'ostler']);
/** Buildings whose people work in them. */
const WORKPLACE = new Set<RKind>(['trade', 'inn', 'temple', 'shrine', 'monks', 'keep', 'barracks', 'prison', 'guild', 'civic', 'library', 'university', 'bank', 'tower', 'store', 'mill', 'stables', 'hall', 'witch', 'warehouse']);

/** Where a member of a household works, by their trade, their place in it and the building. */
export function workOf(p: Person, h: Household, kind: RKind, shop?: string): Work {
  if (p.age < 10 || p.trade === 'child' || p.trade === 'retired' || p.trade === 'helps at home') return 'none';
  if (p.role === 'guest') return 'away';
  const head = h.members[0];
  const ofHouse = !!head && (p === head || p.trade === head.trade || p.trade.includes(head.trade) || p.role === 'apprentice' || p.role === 'journeyman');
  // A workplace's own people, and a great house's servants (not the family), work in the building.
  if (WORKPLACE.has(kind) && (ofHouse || p.role === p.trade)) return 'shop';
  if (kind === 'mansion' && p.role === p.trade) return 'shop';
  if (shop && ofHouse) return 'shop';
  if (OUT.has(p.trade)) return 'out';
  if (AWAY.has(p.trade)) return 'away';
  return 'home';
}

/** A person's plan for a day (`key` names them: building, household and member). */
export function dayPlan(seed: string, key: string, day: number, p: Person, work: Work): DayPlan {
  const r = mulberry32(hashString(`${seed}#day#${key}#${day}`));
  const late = LATE.has(p.trade) && work === 'shop';
  if (p.age < 12) return { wake: 6.5 + r(), sleep: 19.5 + r() };
  if (late) return { wake: 7.5 + r(), work: [10.5 + r(), 23 + r() * 0.5], sleep: 23.6 + r() * 0.3 };
  const old = p.age >= 60;
  const wake = (old ? 5 : 5.5) + r() * 1.5;
  const sleep = (old ? 20.5 : 21) + r() * 2;
  if (work === 'none') return { wake, sleep };
  // Out of doors work ends with the light, near enough (step 3 brings the seasons in).
  const start = wake + 0.75 + r() * 0.75, end = (work === 'out' ? 17 : 17.5) + r() * 1.25;
  return { wake, work: [start, Math.min(end, sleep - 1)], sleep };
}

/** Where a person is at an hour of the day by their plan. */
export function whereabouts(plan: DayPlan, work: Work, hour: number): Whereabouts {
  if (hour < plan.wake || hour >= plan.sleep) return 'asleep';
  if (plan.work && hour >= plan.work[0] && hour < plan.work[1]) {
    if (work === 'shop') return 'work';
    if (work === 'home') return 'home';
    if (work === 'out') return 'out';
    if (work === 'away') return 'away';
  }
  return 'home';
}
