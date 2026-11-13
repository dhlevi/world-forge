/**
 * What the wanderer does at a camp (docs/design/navigation.md, Camping): choosing the site and
 * laying it out, gathering wood and lighting the fire, putting up a shelter, foraging and setting
 * snares, and the night: its tasks (cooking, mending, keeping watch, tending the fire), sleep, and
 * what may happen in the dark.
 *
 * The same on the local map and from the travel map: on the travel map the camp is still laid out
 * on the local map about the party, and the night is worked out in summary.
 *
 * - **Wood** (Survival): an hour gathers an armful or more where there is wood, more with an axe.
 * - **Fire** (Survival): flint and steel and a little wood; harder in an exposed spot.
 * - **Shelter:** pitch a carried tent; build a windbreak (Survival) or a lean-to (Survival, with
 *   Carpentry helping, and a blade) where there is wood to build with.
 * - **Foraging** (the better of Survival and Herbalism): what the season and the land give:
 *   greens and roots in spring, berries in summer, nuts, mushrooms and berries in autumn, little
 *   in winter; now and then healing herbs.
 * - **Snares** (Trapping): set on runs about the camp; each may hold a rabbit when checked, by how
 *   well it was set, the land, and how long it has been.
 * - **The night's events** (placeholders until there are creatures and people about): animals at
 *   the food, a stranger, wolves. Keeping watch, a fire and a hidden site each turn them aside.
 *   Rain and snow are the real weather's (game/weather.ts): a tent or lean-to keeps them off, and
 *   heavy rain puts out an open fire.
 *
 * Proposed numbers, to tune in play.
 */
export * from './context';
export * from './pitch';
export * from './fire';
export * from './shelter';
export * from './food';
export * from './night';
