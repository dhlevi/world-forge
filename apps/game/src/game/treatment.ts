/**
 * Treating wounds (docs/design/characters.md, Health: treatment; combat.md, stage 1): first aid
 * with Medicine, the hands and what is carried. Each treatment is a Medicine check: done well it
 * works well; a narrow failure works poorly; a failure wastes the materials; a fumble makes it worse.
 *
 * - **Bandage** (a bandage): slows an open wound's bleeding and lets it clot.
 * - **Clean** (a drink of water from a waterskin, or water beside): makes festering much less likely.
 * - **Stitch** (a surgeon's kit, or a use of a sewing kit): closes a cut, stab or bite; it all but
 *   stops bleeding and heals faster (an uncleaned wound stitched shut festers the more).
 * - **Splint** (a splint, or firewood and a bandage): holds a broken bone so it knits straight.
 * - **Poultice** (healing herbs): less festering, a little less pain, and it helps the body fight
 *   an infection.
 * - **A remedy** (a potion): eases pain for some hours.
 *
 * Treating oneself is harder than treating another, and harder still with hurt hands.
 */
import type { Actor } from '../actors/actor';
import { check, DC, type Grade, type Mod } from '../actors/checks';
import { PART } from '../actors/components';
import { Health, splintable, woundWords, type HealthWound } from '../actors/health';
import { Inventory } from '../actors/items/inventory';
import type { Item } from '../actors/items/item';
import { usePortion } from './tasks';

export type Treat = 'bandage' | 'clean' | 'stitch' | 'splint' | 'poultice';
export const TREATS: Treat[] = ['clean', 'stitch', 'bandage', 'splint', 'poultice'];
export const TREAT_NAMES: Record<Treat, string> = { bandage: 'Bandage', clean: 'Clean', stitch: 'Stitch', splint: 'Splint', poultice: 'Poultice' };

const OPEN = new Set(['cut', 'stab', 'bite', 'crush', 'burn', 'frostbite']);
/** How well it was done, by grade (none: not done at all). */
const QUALITY: Record<Grade, number | null> = { fine: 1, success: 0.8, near: 0.55, fail: null, fumble: null };
/** Minutes each takes. */
const MINUTES: Record<Treat, number> = { bandage: 3, clean: 4, stitch: 15, splint: 12, poultice: 6 };

export interface TreatResult {
  ok: boolean;
  text: string;
  seconds: number;
}

/** Whether a treatment suits a wound, and if not why not (null: it suits). */
export function unsuited(w: HealthWound, t: Treat): string | null {
  const open = OPEN.has(w.kind);
  switch (t) {
    case 'bandage': return !open && !(w.kind === 'fracture' && w.ruin) ? 'There is nothing to bandage.' : w.bandaged !== undefined && w.bandaged >= 0.8 ? 'It is bandaged already.' : null;
    case 'clean': return !open ? 'The skin is not broken.' : w.cleaned !== undefined ? 'It is clean already.' : w.infection !== undefined ? 'It festers already: cleaning will not help now.' : null;
    case 'stitch': return w.kind !== 'cut' && w.kind !== 'stab' && w.kind !== 'bite' && !(w.ruin && PART.get(w.part)?.sever) ? 'It cannot be stitched.' : w.stitched !== undefined ? 'It is stitched already.' : w.start < Math.max(2, (PART.get(w.part)?.hp ?? 20) * 0.12) ? 'It is too small to need stitches.' : null;
    case 'splint': return w.kind !== 'fracture' ? 'There is no broken bone.' : w.splinted !== undefined ? 'It is splinted already.' : !splintable(w.part) ? 'That bone cannot be splinted; it must knit at rest.' : null;
    case 'poultice': return !open && w.infection === undefined ? 'A poultice would do nothing for it.' : null;
  }
}

/** What a treatment needs from the pack (the items, best first), and whether it is there. */
export function materials(inv: Inventory, t: Treat, water: boolean): { items: Item[]; text: string; mods: Mod[] } | { missing: string } {
  const find = (id: string) => inv.d.items.find((i) => i.def === id);
  switch (t) {
    case 'bandage': {
      const b = find('bandages');
      return b ? { items: [b], text: 'a bandage', mods: [] } : { missing: 'You have no bandages.' };
    }
    case 'clean': {
      if (water) return { items: [], text: 'water', mods: [] };
      const ws = inv.d.items.find((i) => i.def === 'waterskin' && (i.uses ?? 1) > 0);
      return ws ? { items: [ws], text: 'water from your waterskin', mods: [] } : { missing: 'You have no water to clean it with.' };
    }
    case 'stitch': {
      const kit = find('surgeon_kit');
      if (kit) return { items: [], text: 'your surgeon\'s kit', mods: [{ why: 'a surgeon\'s kit', value: 15 }] };
      const sew = find('sewing_kit');
      return sew ? { items: [sew], text: 'a needle and thread from your sewing kit', mods: [] } : { missing: 'You have no needle and thread: a surgeon\'s kit or a sewing kit.' };
    }
    case 'splint': {
      const sp = find('splint');
      if (sp) return { items: [sp], text: 'a splint', mods: [] };
      const wood = find('firewood'), b = find('bandages');
      return wood && b ? { items: [wood, b], text: 'a stick of firewood bound on with a bandage', mods: [{ why: 'a makeshift splint', value: -10 }] } : { missing: 'You have no splint (or firewood and a bandage to make one).' };
    }
    case 'poultice': {
      const h = find('herbs');
      return h ? { items: [h], text: 'healing herbs', mods: [] } : { missing: 'You have no healing herbs.' };
    }
  }
}

/** How hard each treatment is (Medicine). */
const DIFFICULTY: Record<Treat, number> = { bandage: DC.trivial + 5, clean: DC.trivial + 5, stitch: DC.routine, splint: DC.easy + 5, poultice: DC.easy };

/**
 * Treats a wound of `patient` (the healer's own, if the same). `water`: there is water to hand
 * (a river, a well). Returns what happened; the game time it took is the caller's to pass.
 */
export function treat(healer: Actor, patient: Actor, w: HealthWound, t: Treat, now: number, water = false): TreatResult {
  const no = unsuited(w, t);
  if (no) return { ok: false, text: no, seconds: 0 };
  const inv = healer.get(Inventory);
  if (!inv) return { ok: false, text: 'You have nothing to treat it with.', seconds: 0 };
  const m = materials(inv, t, water);
  if ('missing' in m) return { ok: false, text: m.missing, seconds: 0 };
  const hands = healer.get(Health)?.capacities().manipulation ?? 1;
  const self = healer === patient;
  const mods: Mod[] = [...m.mods];
  if (self) {
    const arm = /^(arm|hand|thumb|f\d)/.test(w.part);
    mods.push({ why: arm ? 'one-handed, on yourself' : 'on yourself', value: arm ? -15 : -8 });
  }
  if (hands < 0.95) mods.push({ why: 'your hands', value: -Math.round((1 - hands) * 40) });
  // Deep and bad wounds are harder to treat.
  const hp = PART.get(w.part)?.hp ?? 20;
  if (w.sev / hp >= 0.4) mods.push({ why: 'a bad wound', value: -10 });
  const r = check(healer, 'medicine', { difficulty: DIFFICULTY[t], mods, now });
  const q = QUALITY[r.grade];
  const name = PART.get(w.part)?.name ?? w.part, what = woundWords(w);
  const whose = self ? 'your' : 'the';
  const seconds = MINUTES[t] * 60 * (r.grade === 'fine' ? 0.8 : r.grade === 'near' ? 1.3 : 1);
  // Materials go, whether it works or not (but not the water beside, or a surgeon's kit).
  for (const it of m.items) usePortion(inv, it);
  if (r.grade === 'fumble') {
    // A fumble makes it worse: a stitch torn, the wound opened again.
    if (t === 'stitch' || t === 'splint' || t === 'bandage') {
      w.sev += 1;
      w.start = Math.max(w.start, w.sev);
      w.at = now;
    }
    if (t === 'clean') w.cleaned = undefined;
    patient.changed();
    return { ok: false, text: `You fumble at ${whose} ${what} on the ${name}${t === 'stitch' ? ', tearing it open further' : t === 'splint' ? ', jarring the broken bone' : ''}.`, seconds };
  }
  if (q === null) return { ok: false, text: `You try to ${t} ${whose} ${what} on the ${name} with ${m.text}, but make a poor job of it, and must try again.`, seconds };
  switch (t) {
    case 'bandage': w.bandaged = q; break;
    case 'clean': w.cleaned = q; break;
    case 'stitch': w.stitched = q; break;
    case 'splint': w.splinted = q; break;
    case 'poultice': w.poultice = now; break;
  }
  patient.changed();
  const well = r.grade === 'fine' ? ', neatly' : r.grade === 'near' ? ', after a fashion' : '';
  const verb = { bandage: 'bandage', clean: 'clean', stitch: 'stitch', splint: 'splint', poultice: 'put a poultice on' }[t];
  return { ok: true, text: `You ${verb} ${whose} ${what} on the ${name} with ${m.text}${well}.`, seconds };
}

/** Takes a remedy (a potion) for the pain: eased for six hours. */
export function takeRemedy(a: Actor, now: number): TreatResult {
  const inv = a.get(Inventory), h = a.get(Health);
  const p = inv?.d.items.find((i) => i.def === 'potion');
  if (!inv || !h || !p) return { ok: false, text: 'You have no remedy for the pain.', seconds: 0 };
  usePortion(inv, p);
  h.d.eased = now + 6 * 3600;
  a.changed();
  return { ok: true, text: 'You drink the remedy; the pain dulls.', seconds: 60 };
}
