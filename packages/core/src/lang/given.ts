import { table } from '../names/bundles';

/**
 * Given names by template ([male, female]), for languages that keep their template's names
 * (respelled by their sound changes). Each is kept in its culture's bundle (names/bundles).
 */
export const GIVEN: Record<string, [string[], string[]]> = table((b) => b.given);
