/**
 * Bringing saved games up to date, and checking them (game/save.ts).
 *
 * - **Upgrades** are one step per version, on the save as plain JSON, in order: a save of
 *   version 1 goes through step 1 (to version 2), and so on to SAVE_VERSION. Each step is written
 *   once, when the format changes, and never edited after: so that a save from any version comes
 *   out the same. When the format changes, add the next step, raise SAVE_VERSION, and add a
 *   fixture of the old format to scripts/fixtures/ (scripts/save-test.ts runs them all).
 * - **The check** comes after the upgrades: the save must have the shape this game reads, or it is
 *   refused with a plain message naming what is wrong, rather than failing somewhere in the game.
 *   A save comes from the player's own files, but may be damaged, edited, or from somewhere else.
 *
 * Components keep their own small defaults for fields that are filled in lazily (the dice, when a
 * skill was last used); those are not upgrades, and stay with the components.
 */
import { startingInventory } from '../actors/items/inventory';
import { Needs } from '../actors/needs';

/** The version saves are written at. Raise it with each new upgrade step. */
export const SAVE_VERSION = 2;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The upgrade from each version to the next. */
const STEPS: Record<number, (s: Json) => void> = {
  /**
   * 1 to 2: everything saved before versions were counted (the prototype's saves, all marked 1),
   * whatever they held: the lists the game keeps filled in, and the character's components as
   * they are now (belongings as items rather than names, and needs).
   */
  1: (s) => {
    s.changes ??= [];
    s.seen ??= {};
    s.log ??= [];
    s.ground ??= [];
    s.camps ??= [];
    const ch = s.character;
    if (!isObj(ch) || !isObj(ch.components)) return;
    const c = ch.components;
    // Belongings saved as a list of names: dress and pack the character again from them.
    const inv = c.inventory;
    if (isObj(inv) && Array.isArray(inv.items) && inv.items.length && isObj(inv.items[0]) && typeof inv.items[0].uid !== 'string') {
      const names = (inv.items as Json[]).map((x) => String(x.name ?? ''));
      const female = isObj(c.identity) && c.identity.female === true;
      c.inventory = startingInventory(names, isNum(inv.copper) ? inv.copper : 0, { female }).toJSON();
    } else if (isObj(inv)) inv.animals ??= [];
    // Characters from before needs were kept begin fed and rested.
    if (!isObj(c.needs)) c.needs = Needs.fresh();
  },
};

/** Brings a save (plain JSON) up to SAVE_VERSION; returns it, changed in place. */
export function migrateSave(s: Json): Json {
  let v = isNum(s.version) && s.version >= 1 ? Math.floor(s.version) : 1;
  while (v < SAVE_VERSION) {
    const step = STEPS[v];
    if (!step) throw new Error(`There is no way to bring a save of version ${v} up to date.`);
    step(s);
    v++;
    s.version = v;
  }
  return s;
}

/** What is wrong with a save's shape (after upgrading), or an empty list. */
export function checkSave(s: Json): string[] {
  const bad: string[] = [];
  const need = (cond: boolean, what: string) => {
    if (!cond) bad.push(what);
  };
  need(typeof s.id === 'string' && s.id.length > 0, 'it has no id');
  need(isObj(s.settings) && typeof s.settings.seed === 'string', 'its world settings are missing');
  need(isObj(s.start) && typeof s.start.siteId === 'string', 'where the game began is missing');
  need(isObj(s.player) && isNum(s.player.x) && isNum(s.player.y), 'where the wanderer stands is missing');
  need(isNum(s.time) && s.time >= 0, 'the game time is missing');
  need(Array.isArray(s.changes) && s.changes.every((x) => Array.isArray(x) && x.length === 3 && x.every(isNum)), 'the changes to the map are damaged');
  need(isObj(s.seen) && Object.values(s.seen).every((x) => typeof x === 'string'), 'what has been seen is damaged');
  need(Array.isArray(s.log), 'the message log is damaged');
  need(s.discovered === undefined || (Array.isArray(s.discovered) && s.discovered.every(isNum)), 'what has been discovered is damaged');
  need(Array.isArray(s.ground) && s.ground.every((x) => Array.isArray(x) && isNum(x[0]) && isNum(x[1]) && Array.isArray(x[2])), 'the things left on the ground are damaged');
  need(Array.isArray(s.camps) && s.camps.every((c) => isObj(c) && isNum(c.x) && isNum(c.y) && isObj(c.fire) && Array.isArray(c.placed)), 'the camps are damaged');
  need(s.dice === undefined || isNum(s.dice), "the game's dice are damaged");
  if (s.character !== undefined) {
    const ch = s.character;
    if (!isObj(ch) || !isObj(ch.components)) bad.push('the character is damaged');
    else {
      const c = ch.components;
      need(isObj(c.identity) && typeof c.identity.full === 'string', "the character's name is missing");
      need(isObj(c.inventory) && Array.isArray(c.inventory.items) && (c.inventory.items as unknown[]).every((i) => isObj(i) && typeof i.uid === 'string' && typeof i.def === 'string'), "the character's belongings are damaged");
      need(isObj(c.needs) && isNum(c.needs.fatigue), "the character's needs are damaged");
      need(c.skills === undefined || (isObj(c.skills) && isObj(c.skills.levels)), "the character's skills are damaged");
    }
  }
  return bad;
}

/**
 * Leaves out things of kinds this game does not know (from a mod no longer installed, or a newer
 * game): carried, on the ground, or a pitched tent. Returns what was left out, in words.
 */
export function pruneUnknown(s: Json, known: (id: string) => boolean): string[] {
  const gone = new Map<string, number>();
  const note = (id: string) => gone.set(id, (gone.get(id) ?? 0) + 1);
  let inside = 0;
  /** Keeps the items whose kind is known; what was inside or strapped to an unknown one goes with it. */
  const keep = (items: Json[]): Json[] => {
    const dropped = new Set<string>();
    for (const it of items) if (!known(String(it.def))) {
      dropped.add(String(it.uid));
      note(String(it.def));
    }
    // What was inside or strapped to a dropped thing goes with it.
    let more = true;
    while (more) {
      more = false;
      for (const it of items) {
        const loc = it.loc as Json | undefined;
        if (!dropped.has(String(it.uid)) && loc && (loc.at === 'in' || loc.at === 'strap') && dropped.has(String(loc.parent))) {
          dropped.add(String(it.uid));
          inside++;
          more = true;
        }
      }
    }
    return items.filter((it) => !dropped.has(String(it.uid)));
  };
  const ch = s.character;
  if (isObj(ch) && isObj(ch.components) && isObj(ch.components.inventory) && Array.isArray(ch.components.inventory.items)) {
    ch.components.inventory.items = keep(ch.components.inventory.items as Json[]);
  }
  if (Array.isArray(s.ground)) {
    s.ground = (s.ground as [number, number, Json[]][]).map(([x, y, items]) => [x, y, keep(items)] as [number, number, Json[]]).filter(([, , items]) => items.length);
  }
  if (Array.isArray(s.camps)) {
    for (const c of s.camps as Json[]) {
      const sh = c.shelter as Json | undefined;
      if (isObj(sh) && isObj(sh.tent) && !known(String(sh.tent.def))) {
        note(String(sh.tent.def));
        delete sh.tent;
      }
    }
  }
  if (!gone.size) return [];
  const list = [...gone].map(([id, n]) => (n > 1 ? `${n} of "${id}"` : `"${id}"`)).join(', ');
  const within = inside ? ` (and ${inside === 1 ? 'one thing' : `${inside} things`} inside or strapped to them)` : '';
  return [`Some things in this game are of kinds this game does not know (perhaps from a mod no longer installed), and were left out: ${list}${within}.`];
}
