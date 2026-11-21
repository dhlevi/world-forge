/**
 * Grooming (docs/design/survival.md, Cleanliness and grooming): cutting and dressing the hair,
 * shaving and trimming the beard, and putting both in order, by one's own hand or a barber's.
 * Hair and beard grow by themselves (actors/components/body.ts); a cut only shortens them, so the
 * ways they can be worn are those their length allows.
 *
 * By one's own hand, cutting and shaving need a knife, and a shave may nick: dry it often does,
 * with water seldom, with soap and water hardly ever. A barber needs nothing and never slips.
 */
import type { Actor } from '../actors/actor';
import { BEARD_GROWTH, Body, HAIR_GROWTH, type GrowthDef } from '../actors/components';
import { Health } from '../actors/health';
import { Inventory } from '../actors/items/inventory';
import { usePortion } from '../rules/tasks';

/** Each way of wearing the hair and the beard: what to call choosing it, and the doing of it in words. */
const HAIR_WAYS: Record<string, [string, string]> = {
  shaved: ['Shave the head', 'shave your head'], short: ['Cut it short', 'crop your hair short'], crest: ['A crest, the sides shaved', 'shave the sides of your head, leaving a crest'],
  curly: ['Leave it in curls', 'let your hair fall in its curls'], topknot: ['A topknot, the sides shaved', 'shave the sides of your head and knot the rest on the crown'],
  tied: ['Tie it back', 'tie your hair back'], bun: ['Pin it up', 'pin your hair up'], long: ['Wear it long', 'comb your hair out long'], braids: ['Braid it', 'braid your hair'], loose: ['Wear it loose', 'shake your hair loose'],
};
const BEARD_WAYS: Record<string, [string, string]> = {
  none: ['Shave clean', 'shave your face clean'], moustache: ['A moustache only', 'shave your chin, leaving the moustache'], short: ['Trim it short', 'trim your beard short'],
  full: ['A full beard', 'trim your beard full and even'], forked: ['Fork it', 'part your beard into two forks'], long: ['Wear it long', 'comb your beard out long'], braided: ['Braid it', 'braid your beard'],
};
/** Ways kept by shaving, where a blade may slip. */
const SHAVES = new Set(['shaved', 'crest', 'topknot', 'none', 'moustache']);
/** The chance a shave by one's own hand nicks: dry, with water, and with soap and water. */
const NICK = { dry: 0.3, water: 0.12, soap: 0.04 };

export type GroomWhat = 'hair' | 'beard';

export interface GroomOption {
  style: string;
  label: string;
  /** Worn so now. */
  current: boolean;
  /** Why it cannot be done (no blade), or null. */
  why: string | null;
}

export interface GroomResult {
  ok: boolean;
  text: string;
  seconds: number;
}

/** Whether a way needs cutting or shaving from the length now (and so a blade). */
const needsBlade = (style: string, g: GrowthDef | undefined, cm: number) => SHAVES.has(style) || (g?.cut !== undefined && cm > g.cut);
const hasKnife = (a: Actor) => !!a.get(Inventory)?.d.items.some((i) => i.def === 'knife');

/** The ways the hair or the beard can be worn at its length now, and whether each can be done here. */
export function groomOptions(a: Actor, what: GroomWhat, barber = false): GroomOption[] {
  const b = a.get(Body);
  if (!b) return [];
  const hair = what === 'hair', cm = hair ? b.hairCm : b.beardCm, blade = barber || hasKnife(a);
  return (hair ? b.hairChoices() : b.beardChoices()).map((style) => ({
    style, label: (hair ? HAIR_WAYS : BEARD_WAYS)[style]?.[0] ?? style, current: (hair ? b.d.hairStyle : b.d.beard) === style,
    why: !blade && needsBlade(style, (hair ? HAIR_GROWTH : BEARD_GROWTH)[style], cm) ? 'You have no knife to cut it with.' : null,
  }));
}

/**
 * Wears the hair or the beard a way (one of `groomOptions`). `water`: there is water to hand for
 * a shave; `random`: the dice for a slip of the blade. The time it takes is the caller's to pass.
 */
export function groom(a: Actor, what: GroomWhat, style: string, o: { now: number; barber?: boolean; water?: boolean; random: () => number }): GroomResult {
  const b = a.get(Body), opt = groomOptions(a, what, o.barber).find((x) => x.style === style);
  if (!b || !opt) return { ok: false, text: what === 'hair' ? 'Your hair is not long enough for that.' : 'Your beard is not long enough for that.', seconds: 0 };
  if (opt.why) return { ok: false, text: opt.why, seconds: 0 };
  const hair = what === 'hair', cm = hair ? b.hairCm : b.beardCm;
  const blade = needsBlade(style, (hair ? HAIR_GROWTH : BEARD_GROWTH)[style], cm);
  if (hair) b.setHair(style, o.now);
  else b.setBeard(style, o.now);
  const seconds = (blade ? (hair ? 20 : 10) : 5) * 60;
  if (o.barber) return { ok: true, text: `The barber's hands are quick and sure: ${opt.label[0].toLowerCase()}${opt.label.slice(1)}.`, seconds };
  let text = `You ${(hair ? HAIR_WAYS : BEARD_WAYS)[style]?.[1] ?? 'see to it'}${blade ? ' with your knife' : ''}`;
  // A shave by one's own hand: soap and water spare the skin.
  if (SHAVES.has(style)) {
    const inv = a.get(Inventory), soap = o.water ? inv?.d.items.find((i) => i.def === 'soap') : undefined;
    if (soap && inv) usePortion(inv, soap);
    text += soap ? ', lathered with soap' : o.water ? ', wetted with water' : ', dry';
    if (o.random() < (soap ? NICK.soap : o.water ? NICK.water : NICK.dry)) {
      const part = hair ? 'head' : 'jaw';
      a.get(Health)?.hurt({ kind: 'cut', sev: 0.8 + o.random() * 1.2, part, cause: 'a slip of your blade, shaving', now: o.now });
      text += `. The blade slips, and nicks your ${hair ? 'scalp' : 'jaw'}`;
    }
  }
  return { ok: true, text: `${text}.`, seconds };
}

/** Combs and trims both as they are worn (no blade needed): in order again. */
export function tidy(a: Actor, now: number, barber = false): GroomResult {
  const b = a.get(Body);
  if (!b) return { ok: false, text: '', seconds: 0 };
  b.tidy(now);
  return { ok: true, text: barber ? 'The barber combs and trims you into good order.' : 'You comb out the tangles with your fingers and put yourself in order.', seconds: 10 * 60 };
}
