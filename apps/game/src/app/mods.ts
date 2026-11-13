/**
 * Mods: more item files, loaded at start after the game's own (actors/items/defs.ts). A mod file
 * has the same form as the game's files in src/data/items/ (see item.schema.json there): "items",
 * and optionally "gear" and "animals" as in gear.json. An item with a new id is added; one with
 * the id of an existing item replaces it.
 *
 * Where they are found:
 * - The desktop app: every .json file in the "mods" folder of the game's data folder, in name order.
 * - A browser: the files listed in mods/index.json beside the page (["more-tools.json", ...]).
 *
 * A file or item with faults is left out, and the faults are reported; the game still starts.
 */
import { desktop } from '../desktop';
import { checkReferences, registerGear, registerItems } from '../actors/items/defs';

export interface ModReport {
  /** The files read, and how many items each gave. */
  loaded: { file: string; items: number }[];
  errors: string[];
}

/** Registers one mod file's text. */
export function applyMod(file: string, text: string, report: ModReport): void {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch (e) {
    report.errors.push(`${file}: not valid JSON (${(e as Error).message})`);
    return;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    report.errors.push(`${file}: expected an object with "items"`);
    return;
  }
  const m = o as { items?: unknown; gear?: Record<string, unknown>; animals?: unknown };
  const before = report.errors.length;
  let items = 0;
  if (m.items !== undefined) {
    const errs = registerItems(m.items, file);
    report.errors.push(...errs);
    items = Array.isArray(m.items) ? m.items.length - errs.length : 0;
  }
  if (m.gear !== undefined || m.animals !== undefined) report.errors.push(...registerGear(m, file));
  if (m.items === undefined && m.gear === undefined && m.animals === undefined) report.errors.push(`${file}: has no "items", "gear" or "animals"`);
  if (report.errors.length === before || items) report.loaded.push({ file, items });
}

/** Finds and registers every mod file. */
export async function loadMods(): Promise<ModReport> {
  const report: ModReport = { loaded: [], errors: [] };
  const files: { file: string; text: () => Promise<string | null> }[] = [];
  if (desktop) {
    for (const name of await desktop.data.list('mods')) {
      if (!name.endsWith('.json')) continue;
      // The data folder only serves plain names (apps/desktop/src/main.ts, dataPath).
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) report.errors.push(`${name}: rename it with only letters, digits, ".", "_" and "-"`);
      else files.push({ file: name, text: () => desktop!.data.read(`mods/${name}`) });
    }
  } else {
    const base = `${import.meta.env.BASE_URL}mods/`;
    const list = await fetchText(`${base}index.json`);
    if (list) {
      let names: unknown;
      try {
        names = JSON.parse(list);
      } catch {
        names = null;
      }
      if (!Array.isArray(names)) report.errors.push('mods/index.json: expected a list of file names');
      else for (const n of names) if (typeof n === 'string') files.push({ file: n, text: () => fetchText(base + n) });
    }
  }
  for (const f of files) {
    const text = await f.text().catch(() => null);
    if (text === null) report.errors.push(`${f.file}: could not be read`);
    else applyMod(f.file, text, report);
  }
  if (files.length) report.errors.push(...checkReferences());
  for (const e of report.errors) console.warn(`[mods] ${e}`);
  return report;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    // A missing file on a dev server comes back as the page itself.
    if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) return null;
    return await r.text();
  } catch {
    return null;
  }
}
