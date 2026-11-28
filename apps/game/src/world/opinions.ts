/**
 * What each person the wanderer has met thinks of them (docs/design/npcs.md, Reputation: Personal
 * opinion; Stage 1 step 4): an opinion from −100 to +100, the sum of its causes ("spoke civilly",
 * "jostled me", "woke me"), each fading toward nothing at its own pace (a half-life in days), so
 * that every opinion drifts back to neutral in time. Kept for the people met, and saved.
 *
 * Standing with cities, regions, nations and factions comes with the second pass (Stage 3).
 */

/** A cause of an opinion: why, by how much, when, and how fast it fades. */
export interface Cause {
  why: string;
  value: number;
  /** Game seconds. */
  t: number;
  /** Days for it to fade by half. */
  half: number;
}

export interface OpinionData {
  /** Their name (for the save's sake, and the journal later). */
  name: string;
  /** When they first met the wanderer (game seconds). */
  met: number;
  /** Known of, not met: they think of the wanderer (struck by them, or saw them do wrong) but have not been introduced. */
  unmet?: boolean;
  causes: Cause[];
  /** What they have told the wanderer of themselves (from play, 27 November 2026): name, trade, traits, family, history, opinions. */
  told?: Told[];
}

/** The things a person keeps to themselves until asked, and willing to tell. */
export type Told = 'name' | 'trade' | 'traits' | 'family' | 'history' | 'opinions';

/** A cause smaller than this is let go. */
const FADED = 0.25;

export class Opinions {
  private d = new Map<string, OpinionData>();

  /** Whether the wanderer has met them. */
  knows(id: string): boolean {
    const o = this.d.get(id);
    return !!o && !o.unmet;
  }

  get size(): number {
    return this.d.size;
  }

  /** Marks a first meeting (nothing more if they have met). */
  meet(id: string, name: string, t: number): void {
    const o = this.d.get(id);
    if (!o) this.d.set(id, { name, met: t, causes: [] });
    else if (o.unmet) {
      o.unmet = undefined;
      o.met = t;
    }
  }

  /** Whether they have told the wanderer a thing of themselves. */
  has(id: string, what: Told): boolean {
    return !!this.d.get(id)?.told?.includes(what);
  }

  /** They tell the wanderer things of themselves (meeting them if not met). Returns what was new. */
  learn(id: string, name: string, what: Told[], t: number): Told[] {
    this.meet(id, name, t);
    const o = this.d.get(id)!;
    const fresh = what.filter((w) => !o.told?.includes(w));
    if (fresh.length) o.told = [...(o.told ?? []), ...fresh];
    return fresh;
  }

  /** Adds a cause (meeting them if not met; `meet` false: they think of the wanderer without having met). */
  add(id: string, name: string, why: string, value: number, t: number, half = 7, meet = true): void {
    if (meet) this.meet(id, name, t);
    else if (!this.d.has(id)) this.d.set(id, { name, met: t, unmet: true, causes: [] });
    this.d.get(id)!.causes.push({ why, value, t, half });
  }

  /** The opinion now: the causes, each faded by its age (−100 to +100; 0 for strangers). */
  of(id: string, t: number): number {
    const o = this.d.get(id);
    if (!o) return 0;
    let v = 0;
    for (const c of o.causes) v += c.value * Math.pow(0.5, Math.max(0, t - c.t) / (c.half * 86400));
    return Math.max(-100, Math.min(100, v));
  }

  /** The causes still felt, strongest first, with their weight now. */
  causes(id: string, t: number): { why: string; value: number }[] {
    const o = this.d.get(id);
    if (!o) return [];
    return o.causes.map((c) => ({ why: c.why, value: c.value * Math.pow(0.5, Math.max(0, t - c.t) / (c.half * 86400)) }))
      .filter((c) => Math.abs(c.value) >= FADED).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  /** Times a cause was given within a while (seconds), e.g. how often they were jostled lately. */
  recent(id: string, why: string, t: number, within: number): number {
    return this.d.get(id)?.causes.filter((c) => c.why === why && t - c.t <= within).length ?? 0;
  }

  /** Lets faded causes go (the meeting is remembered). */
  prune(t: number): void {
    for (const o of this.d.values()) o.causes = o.causes.filter((c) => Math.abs(c.value * Math.pow(0.5, Math.max(0, t - c.t) / (c.half * 86400))) >= FADED);
  }

  export(): Record<string, OpinionData> {
    const out: Record<string, OpinionData> = {};
    for (const [k, o] of this.d) out[k] = { name: o.name, met: o.met, ...(o.unmet ? { unmet: true } : {}), causes: o.causes.map((c) => ({ ...c })), ...(o.told?.length ? { told: [...o.told] } : {}) };
    return out;
  }

  import(data: Record<string, OpinionData> | undefined): void {
    this.d.clear();
    for (const [k, o] of Object.entries(data ?? {})) {
      if (!o || typeof o.name !== 'string' || typeof o.met !== 'number' || !Array.isArray(o.causes)) continue;
      const told = Array.isArray(o.told) ? o.told.filter((x): x is Told => ['name', 'trade', 'traits', 'family', 'history', 'opinions'].includes(x)) : [];
      this.d.set(k, { name: o.name, met: o.met, ...(o.unmet ? { unmet: true } : {}), ...(told.length ? { told } : {}), causes: o.causes.filter((c) => c && typeof c.value === 'number' && typeof c.t === 'number').map((c) => ({ why: String(c.why), value: c.value, t: c.t, half: typeof c.half === 'number' && c.half > 0 ? c.half : 7 })) });
    }
  }
}

/** An opinion in words. */
export function opinionWords(v: number): string {
  if (v >= 40) return 'warmly disposed toward you';
  if (v >= 12) return 'well disposed toward you';
  if (v > -12) return 'neither warm nor cold toward you';
  if (v > -40) return 'cool toward you';
  return 'hostile toward you';
}
