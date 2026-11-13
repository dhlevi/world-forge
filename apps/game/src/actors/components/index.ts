/**
 * The components a person is made of (docs/design/characters.md), one file each. Each keeps plain
 * data, saves itself with `toJSON` and is made again by its `fromJSON` (registered in
 * actors/cast.ts). Import them from here; within this folder, files import one another directly.
 */
export * from './time';
export * from './identity';
export * from './body';
export * from './traits';
export * from './skills';
export * from './pools';
export * from './mood';
export * from './money';
export * from './history';
export * from './knowledge';
