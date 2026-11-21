/**
 * Whatever the wanderer fights (docs/design/combat.md): a beast (world/fauna.ts) or a person
 * (world/population.ts, world/strife.ts), as the fight and shooting menus list them.
 */
import type { Animal } from '../world/fauna';
import type { Resident } from '../world/population';

export type Foe = { kind: 'beast'; a: Animal } | { kind: 'person'; r: Resident };

/** A foe's id ("p:" before a person's), and where they stand. */
export const foeId = (f: Foe): string => (f.kind === 'beast' ? f.a.id : `p:${f.r.p.id}`);
export const foeXY = (f: Foe): { x: number; y: number } => (f.kind === 'beast' ? f.a : f.r);
