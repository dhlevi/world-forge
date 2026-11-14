/** How roofs are shown (game/renderer.ts): never, always, or unless the wanderer is inside. */
export type RoofMode = 'off' | 'on' | 'auto';

/** The settings in turn (Shift+R), and how each is told. */
export const ROOF_MODES: readonly RoofMode[] = ['auto', 'on', 'off'];
export const ROOF_WORDS: Record<RoofMode, string> = {
  auto: 'Roofs are shown, except over a building you are in.',
  on: 'Roofs are always shown.',
  off: 'Roofs are hidden.',
};
