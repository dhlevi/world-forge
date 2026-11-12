/**
 * Actors: the people of the world (the player among them), and later animals and monsters, made
 * of components (docs/design/characters.md). An Actor is little more than an id and its
 * components; what a person is lies in them: who they are (Identity), their body, traits, skills,
 * pools, mood, belongings and history. Animals take fewer of them.
 *
 * - **Components** are plain classes, one of each kind per actor, found by their class
 *   (`actor.get(Traits)`). Each names its `key` for saving.
 * - **Messages:** an actor is a message receiver (engine/messages.ts). A message sent to it is
 *   offered to each component that has `onMessage`, in the order they were added.
 * - **Saving:** `toJSON` gives each component's data under its key; `Actor.fromJSON` makes them
 *   again through the registry (`registerComponent`), so a save never holds class instances.
 */
import type { Message, Receiver } from '../engine/messages';

export abstract class Component {
  /** The actor this belongs to (set when added). */
  actor!: Actor;
  /** The key the component is saved under: the class's `static key`. */
  get key(): string {
    return (this.constructor as ComponentClass).key;
  }
  /** Called when added to an actor. */
  attached(): void {}
  /** A message sent to the actor; return true if dealt with. */
  onMessage?(m: Message): boolean | void;
  /** Plain data for saving. */
  abstract toJSON(): unknown;
}

export interface ComponentClass<C extends Component = Component> {
  readonly key: string;
  new (...args: never[]): C;
}

type Loader = (data: never) => Component;
const LOADERS = new Map<string, Loader>();

/** Makes a component kind loadable from its saved data. */
export function registerComponent<C extends Component>(cls: ComponentClass<C> & { fromJSON(data: never): C }): void {
  LOADERS.set(cls.key, (d) => cls.fromJSON(d));
}

export type ActorKind = 'person' | 'animal';

export interface ActorData {
  id: number;
  kind: ActorKind;
  components: Record<string, unknown>;
}

let nextId = 1;

export class Actor implements Receiver {
  readonly id: number;
  private parts = new Map<string, Component>();

  constructor(readonly kind: ActorKind, id?: number) {
    this.id = id ?? nextId++;
    if (this.id >= nextId) nextId = this.id + 1;
  }

  add<C extends Component>(c: C): C {
    c.actor = this;
    this.parts.set(c.key, c);
    c.attached();
    return c;
  }

  get<C extends Component>(cls: ComponentClass<C>): C | undefined {
    return this.parts.get(cls.key) as C | undefined;
  }

  /** The component, which the actor must have. */
  need<C extends Component>(cls: ComponentClass<C>): C {
    const c = this.get(cls);
    if (!c) throw new Error(`Actor ${this.id} has no ${cls.key}.`);
    return c;
  }

  has(cls: ComponentClass): boolean {
    return this.parts.has(cls.key);
  }

  remove(cls: ComponentClass): void {
    this.parts.delete(cls.key);
  }

  get components(): Component[] {
    return [...this.parts.values()];
  }

  receive(m: Message): boolean {
    let used = false;
    for (const c of this.parts.values()) if (c.onMessage?.(m)) used = true;
    return used;
  }

  toJSON(): ActorData {
    const components: Record<string, unknown> = {};
    for (const [k, c] of this.parts) components[k] = c.toJSON();
    return { id: this.id, kind: this.kind, components };
  }

  static fromJSON(d: ActorData): Actor {
    const a = new Actor(d.kind, d.id);
    for (const [k, data] of Object.entries(d.components)) {
      const load = LOADERS.get(k);
      if (load) a.add(load(data as never));
      else console.warn(`Unknown actor component "${k}" left out.`);
    }
    return a;
  }
}
