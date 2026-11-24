/**
 * Shooting and throwing (docs/design/combat.md, stage 3): bows, crossbows and slings, and anything
 * that can be held thrown, along a real line of fire.
 *
 * - **What can be loosed:** a bow, crossbow or sling with its missile carried (an arrow, a bolt, a
 *   stone; actors/items/defs.ts, `ranged`), or anything carried thrown: things made for it (a knife,
 *   a hatchet, a spear, a stone; `throw`) well, the rest as their weight and edge allow (a sword
 *   tumbles, a pot flies short). Glass and fragile things break where they land.
 * - **The line of fire** runs from the wanderer through the target and on to the farthest the
 *   missile carries. Walls stop it; a tree or a boulder may take it; a bush may turn it; a beast in
 *   the way may be struck instead. A miss flies on past the target and lands beyond, where it can be
 *   picked up again (arrows and bolts sometimes break).
 * - **The chance** is the skill (Archery, Crossbow, Sling, Throwing) against the range (easy within
 *   the weapon's good range, much harder beyond), the target's size, its moving or flying, the dark,
 *   a cross wind, the aim, and a long bow's pull against Strength. A beast that does not know the
 *   wanderer is there is far easier (hunting: combat.md, Decisions: stalk and shoot); one that has
 *   seen them close may dodge.
 * - **A hit** wounds as a blow does (game/combat.ts): the margin sets the severity, the hide takes
 *   some, a heavy stone breaks bone; an arrow, a bolt or a thrown blade may stay in the wound, to be
 *   found when the beast is butchered.
 *
 * Every shot is told in words, with the numbers in the log line's tip.
 *
 * Proposed numbers, to tune in play.
 */
import type { Actor } from '../actors/actor';
import { check, chanceFor, DC, type Mod } from '../actors/checks';
import { Skills, Traits } from '../actors/components/index';
import { outerPart, type HealthWound, type WoundKind } from '../actors/health';
import { Inventory } from '../actors/items/inventory';
import { defOf, itemName, makeItem, type Item } from '../actors/items/item';
import type { ItemDef, ThrowDef } from '../actors/items/defs';
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import type { AnimalSize } from '@worldforge/core/local/fauna';
import { aimMod, type Target } from './combat';
import { clamp } from '../util';

/** One way of loosing a missile: a weapon and what it shoots, or a thing thrown. */
export interface Missile {
  how: 'shoot' | 'throw';
  /** The bow, crossbow or sling (shooting); null for a throw. */
  launcher: Item | null;
  /** What flies: the stack of arrows (one is taken), or the thing thrown. */
  item: Item;
  /** "Shoot your hunting bow", "Throw your knife". */
  name: string;
  skill: string;
  kind: WoundKind;
  sev: number;
  deep: number;
  /** The range it is good to, and the farthest it carries (tiles). */
  range: number;
  max: number;
  seconds: number;
  /** The chance it breaks where it lands (or in the wound); fragile things always do. */
  breaks: number;
  /** It may stay in the wound (an arrow, a bolt, a blade). */
  lodges: number;
  /** A long bow's pull (Strength it wants), if any. */
  strength?: number;
}

/** Missiles loosed from a bow or crossbow only. */
const ITEMS_SHOT = new Set(['arrows', 'bolts']);

/** Things that break where they land, whatever is thrown at them. */
const FRAGILE = new Set(['potion', 'lantern', 'candle']);

/** How a thing flies thrown: as made for it, or by its weight and edge (null: too heavy, or not a thing to throw). */
export function thrownOf(d: ItemDef): ThrowDef | null {
  if (d.throw) return d.throw;
  if (d.weight > 8 || d.container || d.wear || d.id === 'coins') return null;
  const m = d.melee;
  if (m) {
    // A weapon not made for throwing tumbles: some of its harm, and not far.
    const thrust = m.thrust ?? 0, cut = m.cut ?? 0, bash = m.bash ?? 0;
    const best = Math.max(thrust, cut, bash);
    const kind = best === thrust ? 'stab' : best === cut ? 'cut' : 'bruise';
    return { kind, sev: best * 0.5, range: clamp(Math.round(9 - d.weight * 2), 3, 8), seconds: m.seconds + 0.4 };
  }
  if (d.weight < 0.05) return { kind: 'bruise', sev: 0.2, range: 4, seconds: 1 };
  return { kind: 'bruise', sev: clamp(0.4 + d.weight * 2, 0.3, 7), range: clamp(Math.round(15 - d.weight * 2.5), 2, 14), seconds: 1.2 + d.weight * 0.3 };
}

/** The ways the wanderer can loose something now: each weapon with its missiles carried, then each kind of thing that can be thrown (what is in hand first). */
export function missilesOf(inv: Inventory): Missile[] {
  const out: Missile[] = [];
  const carried = inv.d.items.filter((i) => i.loc?.at !== 'worn');
  for (const w of carried) {
    const r = defOf(w).ranged;
    if (!r) continue;
    const ammo = carried.find((i) => i.def === r.ammo);
    if (!ammo) continue;
    out.push({
      how: 'shoot', launcher: w, item: ammo, name: `${r.skill === 'sling' ? 'Sling a stone' : `Shoot your ${itemName(w)}`}`, skill: r.skill, kind: r.kind, sev: r.sev, deep: r.deep,
      range: r.range, max: r.max, seconds: r.seconds, breaks: r.kind === 'bruise' ? 0 : r.ammo === 'bolts' ? 0.15 : 0.25, lodges: r.kind === 'stab' ? 0.6 : 0, strength: r.strength,
    });
  }
  const seen = new Set<string>();
  const order = [...carried].sort((a, b) => Number(b.loc?.at === 'hand') - Number(a.loc?.at === 'hand'));
  for (const it of order) {
    const d = defOf(it);
    // Bows are shot, not thrown; arrows and bolts are loosed from them.
    if (seen.has(it.def) || d.ranged || ITEMS_SHOT.has(it.def)) continue;
    // Not what is inside something else's pack (only what can be got at quickly: in hand, at the belt, slung, or a missile in a quiver).
    if (it.loc?.at === 'in' && inv.get(it.loc.parent)?.loc?.at === 'back' && !d.throw) continue;
    if (inv.d.items.some((c) => c.loc?.at === 'in' && c.loc.parent === it.uid)) continue;
    const t = thrownOf(d);
    if (!t) continue;
    seen.add(it.def);
    const blade = t.kind !== 'bruise';
    out.push({
      how: 'throw', launcher: null, item: it, name: `Throw ${it.qty > 1 ? (/^[aeiou]/.test(itemName({ ...it, qty: 1 })) ? 'an' : 'a') : 'your'} ${itemName({ ...it, qty: 1 })}`, skill: 'throwing', kind: t.kind, sev: t.sev, deep: t.kind === 'stab' ? 0.45 : t.kind === 'cut' ? 0.2 : 0.25,
      range: t.range, max: Math.round(t.range * 2.2), seconds: t.seconds + (it.loc?.at === 'hand' ? 0 : 0.8), breaks: FRAGILE.has(it.def) ? 1 : 0, lodges: blade ? (t.kind === 'stab' ? 0.5 : 0.3) : 0,
    });
  }
  // Things made for throwing first, then weapons, then the rest.
  const rank = (m: Missile) => (m.how === 'shoot' ? 0 : defOf(m.item).throw ? 1 : defOf(m.item).melee ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

/**
 * Takes up a bow (or crossbow, or sling) to shoot, putting away what is in the hands. Returns what
 * was done and the seconds it took; null if it is in hand already.
 */
export function readyLauncher(inv: Inventory, launcher: Item): { seconds: number; text: string } | null {
  if (launcher.loc?.at === 'hand') return null;
  let seconds = Math.max(1.5, inv.seconds(launcher, { at: 'hand', hand: 'right' }) * 0.6);
  for (const h of inv.d.items.filter((i) => i.loc?.at === 'hand')) {
    if (inv.stow(h)) return null;
    seconds += 2;
  }
  if (inv.put(launcher, { at: 'hand', hand: 'both' }) && inv.put(launcher, { at: 'hand', hand: 'right' })) return null;
  return { seconds, text: `You take up your ${itemName(launcher)}.` };
}

// ---- The line of fire ---------------------------------------------------------------------------

/** The tiles from one to another and on beyond, out to `max` tiles from the start (the start left out). */
export function lineOfFire(x0: number, y0: number, x1: number, y1: number, max: number): [number, number][] {
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy));
  if (!n) return [];
  const out: [number, number][] = [];
  for (let i = 1; i <= max; i++) out.push([Math.round(x0 + (dx * i) / n), Math.round(y0 + (dy * i) / n)]);
  return out;
}

/** What the line of fire needs of the map, the beasts and the people. */
export interface FireWorld {
  objectAt(x: number, y: number): number;
  passable(x: number, y: number): boolean;
  /** A beast on a tile (on the ground: birds in flight are passed over), as a Target, with its id. */
  beastAt(x: number, y: number): { id: string; t: Target } | null;
  /** A person on a tile (the shot is not taken through them). */
  personAt(x: number, y: number): string | null;
}

/** What lies on the line between the wanderer and a target: what may take the missile first, in words, and a person in the way. */
export function inTheWay(w: FireWorld, from: [number, number], to: [number, number]): { cover: string[]; person: string | null; blocked: string | null; clear: number } {
  const path = lineOfFire(from[0], from[1], to[0], to[1], Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])));
  const cover: string[] = [];
  let person: string | null = null, blocked: string | null = null;
  /** The chance the missile gets past all that is in the way (as fire() has it). */
  let clear = 1;
  for (const [x, y] of path.slice(0, -1)) {
    const o = OBJECT_TILES[w.objectAt(x, y)];
    if (o && o.name !== 'none' && !w.passable(x, y) && !o.gap) blocked ??= o.look;
    else if (o && o.name !== 'none' && (o.gap || o.slow)) {
      cover.push(o.look);
      clear *= 1 - stopChance(o.name, !!o.gap);
    }
    const b = w.beastAt(x, y);
    if (b) {
      cover.push(b.t.name);
      clear *= 1 - SIZE_IN_WAY[b.t.size];
    }
    person ??= w.personAt(x, y);
  }
  return { cover: [...new Set(cover)], person, blocked, clear: blocked ? 0 : clear };
}

/** The chance something in the way (a tree, a bush, a boulder) takes a missile passing it. */
function stopChance(name: string, gap: boolean): number {
  return name.startsWith('tree') || name === 'tree_trunk' ? 0.35 : gap ? 0.5 : 0.12;
}

const SIZE_MOD: Record<AnimalSize, number> = { tiny: -15, small: -8, medium: 0, large: 6, huge: 10 };
const SIZE_IN_WAY: Record<AnimalSize, number> = { tiny: 0.15, small: 0.3, medium: 0.45, large: 0.65, huge: 0.85 };
const pct = (x: number) => `${Math.round(x)}%`;
const fmt = (x: number) => (Math.round(x * 10) / 10).toString();

/** How hard a shot is at a distance, and the modifiers of the shooter and the target (the session adds the dark, the wind, the target's moving). */
function shotTerms(a: Actor, m: Missile, t: Target, dist: number, aim: string | null, extra: Mod[]): { difficulty: number; mods: Mod[] } {
  const mods: Mod[] = [...extra];
  const difficulty = Math.round(DC.trivial + 15 + 1.5 * Math.min(dist, m.range) + 3 * Math.max(0, dist - m.range) + (!t.unaware && dist <= 3 ? t.fight.dodge * 0.3 : 0));
  if (SIZE_MOD[t.size]) mods.push({ why: t.size === 'tiny' || t.size === 'small' ? 'a small target' : 'a big target', value: SIZE_MOD[t.size] });
  if (t.unaware) mods.push({ why: 'it does not know you are there', value: 15 });
  if (t.asleep) mods.push({ why: 'it lies still', value: 10 });
  const part = aim ? t.health.partOf(aim) : undefined;
  if (part && !t.health.isLost(part.id)) mods.push({ why: `aiming at the ${part.name}`, value: aimMod(part) });
  const str = a.get(Traits)?.get('strength') ?? 10;
  if (m.strength && str < m.strength) mods.push({ why: 'a pull too strong for you', value: -(m.strength - str) * 4 });
  return { difficulty, mods };
}

/** The chance of a shot or throw at a target now (for the menu). */
export function shotChance(a: Actor, m: Missile, t: Target, dist: number, aim: string | null, extra: Mod[] = []): { chance: number; mods: Mod[]; difficulty: number } {
  const { difficulty, mods } = shotTerms(a, m, t, dist, aim, extra);
  const c = chanceFor(a, m.skill, { difficulty, mods });
  return { chance: c.chance, mods: c.mods, difficulty };
}

/** What became of a missile. */
export interface Shot {
  text: string;
  tip: string;
  seconds: number;
  /** The beast struck (the target, or one in the way) and its wounds; whether it died of it. */
  struck: { id: string; wounds: HealthWound[]; killed: boolean } | null;
  /** The missile: stuck in the beast, landed on a tile, or broken (neither). */
  lodged: boolean;
  landed: [number, number] | null;
  broke: boolean;
}

/**
 * Looses a missile at a target along the line of fire: what it meets on the way, the check at the
 * target, the wound, and where the missile ends up. The missile itself (one arrow, the thing thrown)
 * is the caller's to take from the pack and put where the Shot says.
 */
export function fire(a: Actor, m: Missile, w: FireWorld, from: [number, number], to: [number, number], targetId: string, aim: string | null, now: number, extra: Mod[] = []): Shot {
  const rng = () => a.get(Skills)?.random() ?? Math.random();
  const dist = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  const target = w.beastAt(to[0], to[1]);
  const path = lineOfFire(from[0], from[1], to[0], to[1], m.max);
  const what = m.how === 'shoot' ? (m.item.def === 'stone' ? 'the stone' : `the ${itemName({ ...m.item, qty: 1 })}`) : `the ${itemName({ ...m.item, qty: 1 })}`;
  const opener = m.how === 'shoot'
    ? (m.item.def === 'stone' ? `You sling a stone at ${target?.t.name ?? 'it'}` : `You loose ${/^[aeiou]/.test(itemName({ ...m.item, qty: 1 })) ? 'an' : 'a'} ${itemName({ ...m.item, qty: 1 })} at ${target?.t.name ?? 'it'}`)
    : `You throw your ${itemName({ ...m.item, qty: 1 })} at ${target?.t.name ?? 'it'}`;
  let r: ReturnType<typeof check> | null = null;
  let tip = '';
  if (target) {
    const { difficulty, mods } = shotTerms(a, m, target.t, dist, aim, extra);
    r = check(a, m.skill, { difficulty, mods, now });
    tip = `${m.name} at ${dist} tiles: chance ${pct(r.chance)} (skill score ${Math.round(r.score)} against ${difficulty}${r.mods.length ? `; ${r.mods.map((x) => `${x.why} ${x.value > 0 ? '+' : ''}${x.value}`).join(', ')}` : ''}); rolled ${r.roll}.`;
  }
  const breakIt = (k = 1) => rng() < Math.min(1, m.breaks * k);
  const done = (text: string, landed: [number, number] | null, k = 1, struck: Shot['struck'] = null): Shot => {
    const broke = breakIt(k);
    return { text: `${opener}. ${text}${broke && m.breaks > 0 && m.breaks < 1 ? ` ${what[0].toUpperCase()}${what.slice(1)} breaks.` : broke && m.breaks >= 1 ? ` ${what[0].toUpperCase()}${what.slice(1)} shatters.` : ''}`, tip, seconds: m.seconds, struck, lodged: false, landed: broke ? null : landed, broke };
  };
  // A miss flies on past the target, as far as it carries.
  const missLand = r && !r.ok ? path.findIndex(([x, y]) => x === to[0] && y === to[1]) + 1 + Math.floor(rng() * Math.max(1, Math.min(8, m.max - dist))) : Infinity;
  let last: [number, number] = from;
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    const o = OBJECT_TILES[w.objectAt(x, y)];
    const isTarget = x === to[0] && y === to[1];
    // Walls stop it; trees, boulders and bushes may.
    if (o && o.name !== 'none') {
      if (!w.passable(x, y) && !o.gap) return done(`It strikes ${o.look}${isTarget ? '' : ' short of its mark'}.`, last, 1.5);
      if (!isTarget && (o.gap || o.slow) && rng() < stopChance(o.name, !!o.gap)) {
        return done(o.slow ? `It is turned aside by ${o.look}.` : `It strikes ${o.look} in the way.`, o.slow ? [x, y] : last, 1.2);
      }
    }
    if (i >= missLand) return done(i - 1 >= 0 && missLand <= path.length ? 'It misses, and flies on to land beyond.' : 'It misses.', [x, y]);
    if (!isTarget) {
      const b = w.beastAt(x, y);
      if (b && rng() < SIZE_IN_WAY[b.t.size]) return hitBeast(a, m, b, null, 10, rng, now, opener, `It strikes ${b.t.name} in the way`, tip, [x, y], what);
      last = [x, y];
      continue;
    }
    if (!target || !r) return done('It lands.', [x, y]);
    if (!r.ok) {
      last = [x, y];
      continue;
    }
    return hitBeast(a, m, target, aim, clamp(r.chance - r.roll, 0, 60) * (r.grade === 'fine' ? 1.2 : 1), rng, now, opener, 'It strikes', tip, [x, y], what);
  }
  return done('It flies out of sight.', null);
}

/** A missile strikes a beast: where, the hide, the wound, and whether the missile stays in it. */
function hitBeast(a: Actor, m: Missile, b: { id: string; t: Target }, aim: string | null, margin: number, rng: () => number, now: number, opener: string, lead: string, tip: string, at: [number, number], what: string): Shot {
  const h = b.t.health;
  let part = aim && h.partOf(aim) && !h.isLost(aim) && rng() < 0.75 ? h.partOf(aim)! : h.partOf(outerPart(rng, undefined, h.plan).id)!;
  if (/^(thumb|f\d|t\d)\./.test(part.id)) part = h.partOf(part.parent ?? 'torso')!;
  const str = a.get(Traits)?.get('strength') ?? 10;
  const pull = m.how === 'throw' ? Math.pow(str / 10, 0.5) : m.strength ? Math.min(1, Math.pow(str / m.strength, 0.5)) : 1;
  let sev = m.sev * pull * (0.7 + margin / 80) * (0.85 + rng() * 0.3);
  const worn = b.t.armour?.(part.region);
  const hideF = m.kind === 'cut' ? 1 : m.kind === 'stab' ? 0.4 : 0.5;
  const prot = (worn ? worn.points * (m.kind === 'cut' ? 1 : m.kind === 'stab' ? 0.6 : 0.5) : b.t.fight.hide * hideF) * (0.5 + rng() * 0.5);
  sev -= prot;
  tip += ` Severity ${fmt(sev + prot)}${prot > 0.05 ? `, less ${fmt(prot)} for ${worn ? 'what is worn' : 'the hide'}` : ''}, against the ${part.name}'s ${fmt(part.hp)}.`;
  const beastName = b.t.name;
  if (sev <= 0.3) {
    const broke = rng() < m.breaks;
    return { text: `${opener}. ${lead === 'It strikes' ? `It strikes ${beastName} on the ${part.name}, but does not get through ${worn?.names[0] ? `the ${worn.names[0]}` : `${b.t.its ?? 'its'} ${b.t.armour ? 'clothes' : 'hide'}`}` : `${lead}, but does no harm`}.${broke ? ` ${what[0].toUpperCase()}${what.slice(1)} ${m.breaks >= 1 ? 'shatters' : 'breaks'}.` : ''}`, tip, seconds: m.seconds, struck: { id: b.id, wounds: [], killed: false }, lodged: false, landed: broke ? null : at, broke };
  }
  let kind = m.kind;
  if (kind === 'bruise' && sev >= part.hp * 0.3 && !/^(eye|ear|nose|tail)/.test(part.id)) kind = 'fracture';
  const wounds = h.hurt({ kind, sev, part: part.id, cause: m.how === 'shoot' ? `the wanderer's ${itemName({ ...m.item, qty: 1 })}` : `a thrown ${itemName({ ...m.item, qty: 1 })}`, deep: m.deep, now });
  const main = wounds[wounds.length - 1];
  const deeper = wounds.filter((w) => w !== main && h.partOf(w.part)?.inside);
  let text = `${opener}. ${lead === 'It strikes' ? `It takes ${beastName} in the ${part.name}` : `${lead}, in the ${part.name}`}`;
  if (main) text += main.ruin ? (part.sever ? ', and takes it off.' : ': it is ruined.') : `: ${/^[aeiou]/.test(h.woundWords(main)) ? 'an' : 'a'} ${h.woundWords(main)}.`;
  else text += '.';
  if (deeper.length) text += ` It goes deep, into the ${deeper.map((w) => h.partOf(w.part)?.name ?? w.part).join(' and ')}.`;
  const lodged = !h.dead && rng() < m.lodges;
  const broke = !lodged && rng() < m.breaks * 1.4;
  if (lodged) text += ` ${what[0].toUpperCase()}${what.slice(1)} stays in the wound.`;
  else if (broke) text += ` ${what[0].toUpperCase()}${what.slice(1)} ${m.breaks >= 1 ? 'shatters' : 'breaks'}.`;
  return { text, tip, seconds: m.seconds, struck: { id: b.id, wounds, killed: h.dead }, lodged, landed: lodged || broke ? null : at, broke };
}

// ---- Making arrows --------------------------------------------------------------------------------

/** What making arrows needs from the pack, and what is missing (null: all there). */
export function fletchingNeeds(inv: Inventory): { feathers: Item; shafts: Item; blade: Item } | string {
  const find = (ids: string[]) => inv.d.items.find((i) => ids.includes(i.def));
  const feathers = find(['feathers']), shafts = find(['stick', 'firewood']), blade = find(['knife', 'dagger', 'machete', 'hatchet']);
  if (!feathers) return 'You need feathers.';
  if (!shafts) return 'You need sticks (or firewood) for the shafts.';
  if (!blade) return 'You need a knife to whittle and notch them.';
  return { feathers, shafts, blade };
}

/**
 * Makes arrows (Carpentry): a bunch of feathers and a stick (or an armful of firewood) whittled into
 * shafts, notched and fletched, with fire-hardened points, in an hour. A good hand makes more, and
 * none are wasted; a poor one spoils most.
 */
export function fletch(a: Actor, inv: Inventory, now: number): { items: Item[]; text: string; seconds: number } | string {
  const need = fletchingNeeds(inv);
  if (typeof need === 'string') return need;
  const r = check(a, 'carpentry', { difficulty: DC.easy, now });
  const n = { fine: 8, success: 6, near: 4, fail: 2, fumble: 0 }[r.grade];
  const use = (it: Item) => {
    if (it.qty > 1) it.qty -= 1;
    else inv.drop(it.uid);
  };
  use(need.feathers);
  use(need.shafts);
  const items = n ? [makeItem('arrows', { qty: n })] : [];
  const words = {
    fine: 'You make eight good arrows, straight and true.', success: 'You make six arrows.', near: 'You make four arrows; the rest of the shafts warp or split.',
    fail: 'You make two passable arrows, and spoil the rest.', fumble: 'Every shaft splits or warps: no arrows come of it.',
  };
  return { items, text: words[r.grade], seconds: 3600 };
}
