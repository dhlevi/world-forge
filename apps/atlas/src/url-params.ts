/**
 * The world settings in the page address (`?seed=forge&land=0.3&plates=14&erosion=0.5&settled=0.6&drift=0.3&races=1&res=1024`),
 * so a world can be bookmarked, shared or reloaded. The address follows the world that was last
 * generated (not settings changed since), and each new world is a step in the browser history:
 * Back and Forward return to the worlds made before. The settings themselves and their checking
 * are the core's (settings.ts).
 */
import { type UrlParams, readSettingsQuery, settingsQuery } from '@worldforge/core/settings';

export type { UrlParams };

/** Reads the settings in an address into `params` (leaving out any that are missing or invalid); true if any were found. */
export function readUrlParams(params: UrlParams, search = window.location.search): boolean {
  return readSettingsQuery(params, search);
}

/** The address query for the settings. */
export const urlQuery = settingsQuery;

/**
 * Puts the settings of a newly made world in the address: a new history step when they differ from
 * the address's (`replace` keeps the current step, for the first world and for Back / Forward).
 */
export function writeUrlParams(p: UrlParams, replace: boolean): void {
  const query = urlQuery(p);
  if (query === window.location.search) return;
  const url = `${window.location.pathname}${query}${window.location.hash}`;
  try {
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  } catch {
    // Some embedded or sandboxed pages forbid changing the address; the world still works.
  }
}
