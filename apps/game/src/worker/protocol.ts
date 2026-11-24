/** Messages between the game and its worker (worker/game.worker.ts), which holds the world. */
import type { RouteOptions } from '@worldforge/core/local/travel';
import type { Roof } from '@worldforge/core/local/roofs';
import type { ChunkLayer } from '@worldforge/core/local/chunk';
import type { WorldSettings } from '@worldforge/core/settings';

export interface StartSite {
  id: string;
  name: string;
  tier: string;
  population: number;
  lon: number;
  lat: number;
  /** The realm it lies in (its top liege), and its people. */
  realm?: string;
  culture?: string;
  /** The realm's political unit id, and the culture's index (CULTURES). */
  realmId?: number;
  cultureIndex?: number;
  coastal?: boolean;
  university?: boolean;
  /** The land region it lies in (a range, a forest, a plain), for nature lore. */
  region?: string;
}

/** A tile on a floor (null: the ground floor, or the ground). */
export interface Spot {
  x: number;
  y: number;
  z: number | null;
}

/**
 * A part of a resident's day (core people/routine.ts, Block) with the tile it is spent on (null:
 * somewhere beyond the bubble).
 */
export interface PlanStop {
  from: number;
  to: number;
  act: 'sleep' | 'home' | 'meal' | 'work' | 'leisure' | 'worship' | 'errand';
  place: 'bed' | 'home' | 'table' | 'work' | 'out' | 'tavern' | 'square' | 'temple' | 'market' | 'warehouse' | 'gate';
  at: Spot | null;
}

/**
 * A resident of the bubble (docs/design/npcs.md, Stage 1): who they are, from their building's
 * households (core people/plan-residents.ts), how they look, their day's plan with its places,
 * and where that plan has them at the hour asked.
 */
export interface PlacedPerson {
  /** Their building, household and place in it: "<bid>#<household>#<member>". */
  id: string;
  name: string;
  given: string;
  female: boolean;
  age: number;
  /** Their people (index into CULTURES) and its name ("the Varskish"). */
  culture: number;
  people: string;
  trade: string;
  /** Their place in the household ("head", "wife", "apprentice"). */
  role: string;
  traits: string[];
  note?: string;
  means: 'destitute' | 'poor' | 'middling' | 'comfortable' | 'rich';
  /** The household's name, and the home's building id and name (for a notable building). */
  household: string;
  homeId: string;
  homeName?: string;
  /** Their ties to the neighbours (the household's head's; core people/residents.ts). */
  ties: { kind: string; text: string }[];
  /** The kind of day they keep (core people/routine.ts, Template). */
  template: string;
  /** The day the plan is for (days since the start), and the plan. */
  day: number;
  plan: PlanStop[];
  /** A tile in their home, to shelter in from the rain. */
  home: Spot;
  /** Where the plan has them at the hour asked (null: away beyond the bubble). */
  at: Spot | null;
  facing: 'n' | 'e' | 's' | 'w';
  look: {
    kind: string;
    skin: string;
    hair: string;
    hairStyle: string;
    beard: string;
    /** Cloth colours ("#rrggbb"): the body garment, the legs, the cloak. */
    cloth: [string, string, string];
    /** The people's headwear, as a garment shape (none: bare-headed). */
    head?: string;
  };
}

/**
 * A group of animals about the wanderer (worker/fauna.ts): a species (core local/fauna.ts), its
 * members' tiles (on the ground), its home range, and water near it to drink at.
 */
export interface AnimalGroup {
  /** Wild "w:<chunk>:<week>:<species>:<n>", kept "k:<building>:<species>", street "s:...". */
  id: string;
  species: string;
  members: Spot[];
  home: { x: number; y: number; r: number };
  water: Spot | null;
  /** A group the hunt placed (game/hunt.ts): its trail passes near here, where the hunter took it up. */
  trailFrom?: Spot;
}

/** A people of the world, for character creation. */
export interface CultureInfo {
  index: number;
  /** "Varskish" (also the language). */
  name: string;
  /** "the Varskish". */
  people: string;
  /** The folk (race): "Humans", "Elves"... */
  folk: string;
  newWorld: boolean;
  deep: boolean;
  ethos: string;
  traditions: string[];
  /** Names of the ethos and traditions, for showing. */
  ethosName: string;
  traditionNames: string[];
  faith?: string;
  seafaring: boolean;
  /** The look of the people (people/appearance.ts). */
  look: {
    /** The kind of people (human, elf, dwarf...), for the figure. */
    kind?: string;
    h: number;
    broad: number;
    skins: [string, string][];
    hairs: [string, string][];
    hairM: string[];
    hairF: string[];
    beards: string[];
    marks?: string;
    text: string[];
  };
}

export interface WarInfo {
  name: string;
  start: number;
  end?: number;
  cause: string;
}

export interface RealmInfo {
  id: number;
  name: string;
  wars: WarInfo[];
}

/** What character creation needs of the world. */
export interface Catalogue {
  /** The world's year now. */
  year: number;
  cultures: CultureInfo[];
  realms: RealmInfo[];
}

export interface PersonName {
  given: string;
  family?: string;
  full: string;
}

/** Map styles the world view can show (the core's tile renderer layers). */
export type ViewLayer = 'fantasy' | 'terrain' | 'biomes';

export interface WorldSummary {
  cities: number;
  towns: number;
  realms: number;
  ms: number;
}

/** A settlement near the local map, in local metres (x east, y north). */
export interface LocalSite {
  id: string;
  name: string;
  tier: string;
  x: number;
  y: number;
  radiusM: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  ground: Uint8Array;
  object: Uint8Array;
  area: Uint16Array;
  areas: string[];
  elev: Int16Array;
  sites: { tx: number; ty: number; kind: string; name: string; id: string }[];
  /** The roofs of the buildings standing (in part) here (core local/roofs.ts). */
  roofs: Roof[];
  /** Floors above and below the ground, by level (core local/chunk.ts). */
  layers: ChunkLayer[];
  ms: number;
}

/** One step of a route on the travel map: a chunk, and what crossing it is like. */
export interface RouteStep {
  cx: number;
  cy: number;
  /** Minutes to walk into it. */
  min: number;
  way: string;
  ford: boolean;
  /** A river to swim or raft across (backlog T3). */
  swim?: boolean;
  biome: number;
  /** How far the land can be seen from it (m). */
  sight: number;
  /** How steep the step into it is (rise over run, either way). */
  slope?: number;
  /** The chance of a robber band camped about it in any week (worker/bandits.ts). */
  banditry?: number;
}

/** What the travel map draws over the tiles: ways and places in an area. */
export interface TravelArea {
  roads: { cls: string; pts: [number, number][] }[];
  /** Settlements (with their extent, for their plans) and lairs. */
  places: { id: string; name: string; tier: string; lon: number; lat: number; kind?: string; radiusM?: number }[];
}

/** A way into a settlement: a gate in its walls, or where a road reaches its edge (local m from its centre too). */
export interface Gate {
  name: string;
  /** The road that comes in there ("South Road"), if any. */
  road: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  walled: boolean;
}

export type PlaceKind = 'gate' | 'market' | 'inn' | 'tavern' | 'temple' | 'keep' | 'civic' | 'guild' | 'shop' | 'dock' | 'district';

/** A place of note in a settlement (the city view). */
export interface SitePlace {
  id: string;
  kind: PlaceKind;
  name: string;
  lon: number;
  lat: number;
  /** The quarter it is in. */
  quarter: string;
  about: string;
  /** The building's part in the town (inn, smithy, guild:mages...). */
  role?: string;
}

export interface SiteInfo {
  id: string;
  name: string;
  tier: string;
  population: number;
  lon: number;
  lat: number;
  coreM: number;
  radiusM: number;
  walls: boolean;
  /** Its people's name ("Varskish"): who makes what is sold there. */
  culture?: string;
  quarters: { name: string; lon: number; lat: number }[];
  places: SitePlace[];
  /** What a visitor learns of it on arriving (worker/sites.ts, townAccount). */
  account?: string[];
}

/** A settlement's plan drawn as an image, and the box (lon/lat) it covers. */
export interface PlanImage {
  id: string;
  bitmap: ImageBitmap;
  west: number;
  south: number;
  east: number;
  north: number;
}

export type ToWorker =
  | { type: 'world'; settings: WorldSettings }
  | { type: 'start'; id: string }
  | { type: 'chunk'; cx: number; cy: number }
  /** A 256 px map tile of the world (Web Mercator z/x/y), for the world view. */
  | { type: 'tile'; id: number; z: number; x: number; y: number; layer: ViewLayer }
  /** A route on the travel map from a chunk toward a point (lon/lat). */
  | { type: 'route'; id: number; from: [number, number]; to: [number, number]; options?: RouteOptions }
  /** Roads, tracks and places in a box (lon/lat), with tracks and villages only when `fine`. */
  | { type: 'area'; id: number; west: number; south: number; east: number; north: number; fine: boolean }
  /** What character creation needs of the world. */
  | { type: 'catalogue'; id: number }
  /** Personal names of a culture, from a seed. */
  | { type: 'names'; id: number; culture: number; seed: string; count: number }
  /** A settlement's places of note and its gates (lon/lat help find a village). */
  | { type: 'site'; id: number; siteId: string; lon?: number; lat?: number }
  /** The climate at a place: its warmest and coldest months (°C). */
  | { type: 'climate'; id: number; lon: number; lat: number }
  /** The wild game a place holds (worker/fauna.ts, gameAt). */
  | { type: 'game'; id: number; lon: number; lat: number; winter: boolean }
  /** A settlement's plan as an image: metres per pixel, the radius drawn, and the style. */
  | { type: 'plan'; id: number; siteId: string; lon?: number; lat?: number; mpp: number; radius: number; illustrated: boolean }
  /** The residents about a tile at a time (game seconds), placed by their day plan (worker/people.ts). */
  | { type: 'people'; id: number; x: number; y: number; time: number; rise: number; set: number; ambush?: [number, number] }
  /** The animals about a tile in the week of a time (worker/fauna.ts). */
  | { type: 'animals'; id: number; x: number; y: number; time: number; winter: boolean };

export type FromWorker =
  | { type: 'progress'; stage: string; pct: number }
  | { type: 'world'; ms: number; starts: StartSite[]; summary: WorldSummary }
  | { type: 'started'; site: StartSite; tile: [number, number]; sites: LocalSite[]; ms: number }
  | { type: 'chunk'; chunk: ChunkData }
  | { type: 'tile'; id: number; bitmap: ImageBitmap | null }
  | { type: 'route'; id: number; steps: RouteStep[] | null; minutes: number; partial: boolean }
  | { type: 'area'; id: number; area: TravelArea }
  | { type: 'catalogue'; id: number; catalogue: Catalogue }
  | { type: 'names'; id: number; male: PersonName[]; female: PersonName[] }
  | { type: 'site'; id: number; site: SiteInfo | null; gates: Gate[] }
  | { type: 'plan'; id: number; image: PlanImage | null }
  | { type: 'people'; id: number; people: PlacedPerson[]; radius: number }
  | { type: 'animals'; id: number; groups: AnimalGroup[]; radius: number }
  | { type: 'game'; id: number; species: { id: string; density: number }[] }
  | { type: 'climate'; id: number; warm: number; cold: number; precipSummer: number; precipWinter: number; windU: number; windV: number }
  /** Something went wrong: with the id of the request it answers, or none (making the world, starting, a chunk). */
  | { type: 'error'; message: string; id?: number };
