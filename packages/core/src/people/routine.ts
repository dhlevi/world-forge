/**
 * Residents' days (docs/design/npcs.md, The mind: Schedule; Routines): each person's day plan as
 * a list of blocks from midnight to midnight, each an activity at a place, worked out from their
 * trade, their place in the household, the kind of building they live in, the day and the hours of
 * daylight. The same world, person and day always give the same plan (no Math.random).
 *
 * - **Templates** by kind of life: a craftsman's shop hours with a midday meal at home, a labourer's
 *   long day, a farmer's dawn to dusk, a merchant's, a guard's watches in turn, a priest's offices,
 *   an innkeeper's late hours, a servant's chores, a child's play, an elder's short days, a
 *   beggar's round of the square, a night trade's.
 * - **Variation:** the day's seed shifts the times by a little; traits shift them more (the
 *   diligent work longer, the slothful rise late, the gregarious go to the tavern, the pious to the
 *   temple); the household's means decides whether leisure is the tavern or the inn.
 * - **The week and the light:** one day in seven is a rest day (no work but for those whose work
 *   never stops, the temple in the morning); work out of doors keeps to daylight, and nobody lingers
 *   in the square after dark.
 *
 * Places are named here and found on the map by the worker (apps/game/src/worker/people.ts):
 * the bed, the home and its table, the workplace (their own building, or the nearest of its kind),
 * out of doors near home, the tavern or inn, the square, the temple.
 */
import { hashString, mulberry32 } from '../gen/rng';
import type { Household, Person, RKind } from './residents';

/** Where a person works: in their own building, at home, out of doors near home, elsewhere, or not at all. */
export type Work = 'shop' | 'home' | 'out' | 'away' | 'none';

/** What a person is doing. */
export type Act = 'sleep' | 'home' | 'meal' | 'work' | 'leisure' | 'worship';

/** Where a block is spent. */
export type Place = 'bed' | 'home' | 'table' | 'work' | 'out' | 'tavern' | 'square' | 'temple';

/** Places out of doors (kept to daylight, left in the rain). */
export const OUTDOOR_PLACES = new Set<Place>(['out', 'square']);

/** A part of the day: from and to (hours of the day, 0 to 24), what, and where. */
export interface Block {
  from: number;
  to: number;
  act: Act;
  place: Place;
}

/** Kinds of days. */
export type Template = 'craft' | 'labour' | 'farm' | 'merchant' | 'guard' | 'priest' | 'inn' | 'servant' | 'child' | 'elder' | 'beggar' | 'night' | 'idle' | 'guest';

/** The day's light, and whether it is a day of rest. */
export interface DayOpts {
  /** Sunrise and sunset (hours of the day). */
  rise: number;
  set: number;
}

/** Trades worked out of doors, near home. */
const OUT = new Set([
  'farmer', 'shepherd', 'ploughman', 'ploughwoman', 'cottar', 'swineherd', 'beekeeper', 'hedger', 'thatcher', 'gardener', 'woodcutter', 'sawyer', 'charcoal burner',
  'drover', 'vine-dresser', 'grape-picker', 'hunter', 'gatherer', 'fisher', 'fisherman', 'fisherwoman', 'fishwife', 'net-mender', 'hawker', 'beggar', 'rag-picker',
  'street sweeper', 'rat-catcher', 'mudlark', 'labourer', 'porter', 'carter', 'brickmaker', 'ropemaker', 'washerwoman', 'washerman',
  'laundress', 'launderer', 'dairymaid', 'dairyman', 'basket-weaver', 'salter', 'boatwright', 'hermit', 'pilgrim guide', 'night-soil man', 'night-soil woman',
]);
/** Trades worked away from home, at the nearest place of their kind (the worker finds it). */
const AWAY = new Set([
  'miner', 'smelter', 'ore-washer', 'sailor', 'dockhand', 'stevedore', 'shipwright', 'sailmaker', 'customs clerk', 'shipowner', 'alderman', 'lawyer', 'notary',
  'physician', 'money-lender', 'camp follower', 'sutler', 'merchant\'s factor', 'miller\'s hand', 'scribe',
]);
/** Kept late: an inn's and a tavern's people. */
const LATE = new Set(['innkeeper', 'tavern keeper', 'cook', 'serving girl', 'serving man', 'potboy', 'potgirl', 'tapster', 'ostler']);
/** Those who keep watch. */
const WATCH = /soldier|guard|man-at-arms|woman-at-arms|sergeant|captain|turnkey|warden|bailiff|beadle/;
/** Those of the faith. */
const FAITH = /priest|acolyte|monk|nun|prior|shrine keeper|sexton|brother of|hermit|sister|cunning/;
/** Those who sell and lend. */
const MERCHANT = /merchant|money-lender|banker|lawyer|notary|alderman|goldsmith|shipowner|retired captain|physician|clerk|reeve|scrivener|librarian|copyist|master|scholar|archmage|mage/;
/** The street trades. */
const STREET = /beggar|rag-picker|hawker|street sweeper|rat-catcher|mudlark|pedlar/;
/** The trades of the fields and the woods. */
const FIELD = /farmer|shepherd|plough|cottar|swineherd|beekeeper|hedger|thatcher|gardener|woodcutter|sawyer|charcoal|drover|vine|grape|hunter|gatherer|dairy/;
/** Night trades. */
const NIGHT = /night-soil/;
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

/** The kind of day a person keeps. */
export function templateOf(p: Person, work: Work, kind: RKind): Template {
  const t = p.trade;
  if (p.role === 'guest') return 'guest';
  if (p.age < 12 || t === 'child') return 'child';
  if (NIGHT.test(t)) return 'night';
  if (LATE.has(t) && work === 'shop') return 'inn';
  if (WATCH.test(t)) return 'guard';
  if (FAITH.test(t) && work === 'shop') return 'priest';
  if (work === 'shop' && kind === 'mansion') return 'servant';
  if (STREET.test(t)) return 'beggar';
  if (FIELD.test(t)) return 'farm';
  if (t === 'retired' || p.age >= 66) return 'elder';
  if (work === 'none') return 'idle';
  if (MERCHANT.test(t)) return 'merchant';
  if (work === 'out' || work === 'away') return 'labour';
  return 'craft';
}

/** Whether a day is a day of rest (one in seven). */
export function restDay(day: number): boolean {
  return ((day % 7) + 7) % 7 === 6;
}

/**
 * A person's plan for a day (`key` names them: building, household and member): blocks from
 * midnight to midnight, in order, with no gaps.
 */
export function dayBlocks(seed: string, key: string, day: number, p: Person, work: Work, kind: RKind, o: DayOpts): Block[] {
  const r = mulberry32(hashString(`${seed}#day#${key}#${day}`));
  const tpl = templateOf(p, work, kind);
  const has = (t: string) => p.traits.includes(t);
  const rest = restDay(day) && !['guard', 'inn', 'priest', 'servant', 'night'].includes(tpl);
  const late = has('Slothful') ? 0.6 : has('Diligent') ? -0.4 : 0;
  const long = has('Diligent') ? 0.6 : has('Slothful') ? -0.5 : 0;
  const rise = Math.max(4, Math.min(9, o.rise)), set = Math.max(15, Math.min(22, o.set));
  // An evening out: the tavern (the inn for those with the means), by temper and purse.
  let tavern = p.female ? 0.06 : 0.16;
  if (has('Gregarious') || has('Charming')) tavern += 0.15;
  if (has('Shy') || has('Melancholy') || has('Pious')) tavern -= 0.08;
  if (p.age < 16) tavern = 0;
  if (rest) tavern += 0.1;
  const goesOut = r() < tavern;

  // The day as a list of (until, act, place), from midnight.
  const seq: [number, Act, Place][] = [];
  const add = (until: number, act: Act, place: Place) => seq.push([until, act, place]);
  const wake = (base: number, spread = 1) => Math.max(3.5, base + r() * spread + late);
  const bed = (base: number, spread = 1.5) => Math.min(23.9, base + r() * spread + (has('Sickly') ? -0.5 : 0));
  const evening = (from: number, sleepAt: number) => {
    // Supper at home, then an evening at home or out, then bed.
    add(Math.min(sleepAt, from + 0.75), 'meal', 'table');
    if (goesOut && sleepAt - from > 2.5) {
      add(Math.min(sleepAt - 0.6, from + 1.25), 'home', 'home');
      add(sleepAt - 0.4, 'leisure', 'tavern');
    }
    add(sleepAt, 'home', 'home');
    add(24, 'sleep', 'bed');
  };

  if (tpl === 'guest') {
    // A guest at an inn: about their business by day, back for the evening.
    const w = wake(7, 1.5), s = bed(21.5);
    add(w, 'sleep', 'bed');
    add(w + 0.75, 'meal', 'table');
    add(18 + r() * 1.5, 'work', 'work');
    add(s - 0.3, 'leisure', 'home');
    add(s, 'home', 'home');
    add(24, 'sleep', 'bed');
  } else if (tpl === 'child') {
    const w = wake(6.5), s = bed(p.age < 6 ? 19 : 19.5, 1);
    add(w, 'sleep', 'bed');
    add(w + 0.6, 'meal', 'table');
    if (p.age >= 5) {
      add(10 + r(), 'home', 'home');
      add(12, 'leisure', 'out');
      add(12.75, 'meal', 'table');
      add(14 + r(), 'home', 'home');
      add(17, 'leisure', 'out');
    }
    add(Math.max(17.5, w + 1), 'home', 'home');
    add(s - 1, 'meal', 'table');
    add(s, 'home', 'home');
    add(24, 'sleep', 'bed');
  } else if (tpl === 'guard') {
    // Watches in turn: day (06 to 14), evening (14 to 22) or night (22 to 06), by person and day.
    const watch = (hashString(`${key}#watch`) + Math.floor(day / 3)) % 3;
    if (watch === 0) {
      add(5.25, 'sleep', 'bed');
      add(5.75, 'meal', 'table');
      add(14, 'work', 'work');
      add(14.75, 'meal', 'table');
      add(18.5, 'home', 'home');
      evening(18.5, bed(21.5));
    } else if (watch === 1) {
      add(wake(7), 'sleep', 'bed');
      add(9, 'meal', 'table');
      add(13.25, 'home', 'home');
      add(13.75, 'meal', 'table');
      add(22, 'work', 'work');
      add(22.5, 'home', 'home');
      add(24, 'sleep', 'bed');
    } else {
      add(6, 'work', 'work');
      add(6.75, 'meal', 'table');
      add(14.5 + r(), 'sleep', 'bed');
      add(17.5, 'home', 'home');
      add(18.25, 'meal', 'table');
      add(21.75, goesOut ? 'leisure' : 'home', goesOut ? 'tavern' : 'home');
      add(24, 'work', 'work');
    }
  } else if (tpl === 'inn') {
    const w = wake(7.5);
    add(w, 'sleep', 'bed');
    add(w + 0.5, 'meal', 'table');
    add(10.5 + r() * 0.5, 'home', 'home');
    add(15, 'work', 'work');
    add(15.5, 'meal', 'table');
    add(23.25 + r() * 0.4, 'work', 'work');
    add(24, 'sleep', 'bed');
  } else if (tpl === 'priest') {
    // The offices: at dawn, midday and evening, with the day's work between.
    const w = wake(4.75, 0.5);
    add(w, 'sleep', 'bed');
    add(7, 'worship', 'work');
    add(7.5, 'meal', 'table');
    add(12, 'work', 'work');
    add(12.75, 'meal', 'table');
    add(18, 'work', 'work');
    add(19, 'worship', 'work');
    add(19.5, 'meal', 'table');
    add(bed(20.5, 0.75), 'home', 'home');
    add(24, 'sleep', 'bed');
  } else if (tpl === 'servant') {
    const w = wake(5, 0.5);
    add(w, 'sleep', 'bed');
    add(w + 0.4, 'meal', 'table');
    add(12.5, 'work', 'work');
    add(13, 'meal', 'table');
    const s = bed(21.25, 0.75);
    add(s - 0.5, 'work', 'work');
    add(s, 'home', 'home');
    add(24, 'sleep', 'bed');
  } else if (tpl === 'night') {
    add(3.5 + r() * 0.5, 'work', 'out');
    add(4.5, 'home', 'home');
    add(13 + r(), 'sleep', 'bed');
    add(14, 'meal', 'table');
    add(19, 'home', 'home');
    add(19.5, 'meal', 'table');
    add(22.5, 'sleep', 'bed');
    add(24, 'work', 'out');
  } else if (rest) {
    // A day of rest: a late rising, the temple in the morning for the faithful, the square in the afternoon.
    const w = wake(tpl === 'farm' ? rise - 0.25 : 7);
    add(w, 'sleep', 'bed');
    add(w + 0.75, 'meal', 'table');
    if (has('Pious') || r() < 0.55) {
      add(Math.max(w + 1, 9), 'home', 'home');
      add(10.75, 'worship', 'temple');
    }
    add(12.25, 'home', 'home');
    add(13, 'meal', 'table');
    if (r() < 0.5) {
      add(14 + r(), 'home', 'home');
      add(16.5 + r(), 'leisure', 'square');
    }
    add(18, 'home', 'home');
    evening(18, bed(21.5));
  } else {
    // A working day, by template: (wake, start, midday meal and where, end).
    let w: number, start: number, end: number, noon: Place = 'table', workAt: Place = work === 'out' ? 'out' : work === 'home' ? 'home' : 'work';
    let sleepAt = bed(21);
    switch (tpl) {
      case 'farm':
        w = Math.max(3.5, rise - 0.75 - r() * 0.5);
        start = rise;
        end = set - 0.25 - r() * 0.5;
        noon = 'out';
        sleepAt = Math.min(23, Math.max(set + 2, 20) + r());
        break;
      case 'labour':
        w = wake(5, 0.75);
        start = w + 0.5;
        end = 18 + r() * 0.75 + long;
        noon = workAt === 'home' ? 'table' : workAt;
        break;
      case 'merchant':
        w = wake(6.5);
        start = w + 1 + r() * 0.5;
        end = 16.5 + r() + long;
        break;
      case 'beggar':
        w = wake(6);
        start = w + 1;
        end = 17.5 + r();
        workAt = 'square';
        noon = 'square';
        break;
      case 'elder':
        w = wake(6, 1);
        start = 9.5 + r();
        end = 11.75 + r() * 0.5;
        workAt = 'square';
        sleepAt = bed(20, 1);
        break;
      case 'idle':
        w = wake(6);
        start = 10 + r();
        end = start + 0.75 + r() * 0.5;
        workAt = 'square';
        break;
      default:
        w = wake(5.75);
        start = w + 0.75 + r() * 0.5;
        end = 17.5 + r() * 1.25 + long;
    }
    end = Math.min(end, sleepAt - 1.25);
    add(w, 'sleep', 'bed');
    add(Math.min(start, w + 0.6), 'meal', 'table');
    add(start, 'home', 'home');
    if (tpl === 'elder' || tpl === 'idle') {
      // A short round: the square (or a neighbour's bench), then home for the day.
      add(end, 'leisure', workAt);
      add(12.25, 'home', 'home');
      add(13, 'meal', 'table');
      add(17.5, 'home', 'home');
      evening(17.5, sleepAt);
    } else {
      const act: Act = 'work';
      if (start < 12) add(12, act, workAt);
      add(Math.max(start, 12) + 0.75, 'meal', noon);
      add(end, act, workAt);
      evening(end, sleepAt);
    }
  }

  // Out of doors only by daylight (the night trades and the watch apart): before dawn and after dusk, at home.
  const blocks: Block[] = [];
  let from = 0;
  for (const [until0, act, place] of seq) {
    const until = Math.min(24, Math.max(from, until0));
    if (until <= from) continue;
    if (OUTDOOR_PLACES.has(place) && tpl !== 'night') {
      const a = Math.max(from, rise + 0.25), b = Math.min(until, set - 0.25);
      if (a >= b) push(blocks, from, until, 'home', 'home');
      else {
        push(blocks, from, a, 'home', 'home');
        push(blocks, a, b, act, place);
        push(blocks, b, until, 'home', 'home');
      }
    } else push(blocks, from, until, act, place);
    from = until;
  }
  if (from < 24) push(blocks, from, 24, 'sleep', 'bed');
  return blocks;
}

function push(out: Block[], from: number, to: number, act: Act, place: Place): void {
  if (to <= from) return;
  const last = out[out.length - 1];
  if (last && last.act === act && last.place === place) last.to = to;
  else out.push({ from, to, act, place });
}

/** The block a plan is in at an hour of the day. */
export function blockAt(blocks: Block[], hour: number): Block {
  for (const b of blocks) if (hour >= b.from && hour < b.to) return b;
  return blocks[blocks.length - 1];
}
