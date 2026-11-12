/**
 * Messaging: the one way the parts of the game tell each other what happened, so they need not
 * know of each other. A message has a type, a sender, a receiver (or none, to go to everyone who
 * listens for its type), a payload, and a time it is due.
 *
 * - **Made by the factory** (`MessageFactory`), which numbers them and reuses spent ones.
 * - **Sent now or later:** a message with no delay is delivered at once; a delayed one waits in a
 *   queue ordered by game time and is delivered when the clock reaches it (`update(now)`, called
 *   whenever game time passes). Delays are in game seconds, so a message "in an hour" means an
 *   hour of the game, however long that takes to play.
 * - **Direct or broadcast:** a message to a receiver goes to that receiver (an actor, by id);
 *   a message to no one goes to the handlers subscribed to its type.
 *
 * Message types and their payloads are declared where they belong, by adding to `MessageTypes`:
 *
 * ```ts
 * declare module '../engine/messages' {
 *   interface MessageTypes { 'world.ready': { starts: StartSite[] } }
 * }
 * ```
 *
 * A delivered message goes back to the factory to be reused, so handlers must copy what they keep
 * from it rather than keep the message itself.
 */

/** Every message type and its payload, added to by the modules that send them. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MessageTypes {}

export type MessageType = keyof MessageTypes & string;

/** The sender of messages from the game itself, and the receiver meaning "everyone listening". */
export const SYSTEM = 0;
export const BROADCAST = 0;

export interface Message<K extends MessageType = MessageType> {
  /** Numbered in order of sending, so messages due at one time keep their order. */
  id: number;
  type: K;
  sender: number;
  /** An actor's id, or BROADCAST. */
  receiver: number;
  payload: MessageTypes[K];
  /** Game time (seconds) it is due. */
  at: number;
}

/** Something that can be sent messages directly (actors). */
export interface Receiver {
  readonly id: number;
  /** Returns true if the message was dealt with. */
  receive(m: Message): boolean | void;
}

export type Handler<K extends MessageType> = (payload: MessageTypes[K], m: Message<K>) => void;

export interface SendOptions {
  from?: number;
  to?: number;
  /** Game seconds from now; 0 or none to deliver at once. */
  delay?: number;
}

/** Makes messages, reusing spent ones. */
export class MessageFactory {
  private next = 1;
  private pool: Message[] = [];

  create<K extends MessageType>(type: K, payload: MessageTypes[K], sender: number, receiver: number, at: number): Message<K> {
    const m = (this.pool.pop() ?? {}) as Message<K>;
    m.id = this.next++;
    m.type = type;
    m.payload = payload;
    m.sender = sender;
    m.receiver = receiver;
    m.at = at;
    return m;
  }

  /** Takes a delivered message back. */
  release(m: Message): void {
    (m as { payload: unknown }).payload = undefined;
    if (this.pool.length < 256) this.pool.push(m);
  }
}

/** The queue of delayed messages: a binary heap by due time, then by order of sending. */
class MessageQueue {
  private h: Message[] = [];
  get size(): number {
    return this.h.length;
  }
  private less(a: Message, b: Message): boolean {
    return a.at < b.at || (a.at === b.at && a.id < b.id);
  }
  push(m: Message): void {
    const h = this.h;
    h.push(m);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  peek(): Message | undefined {
    return this.h[0];
  }
  pop(): Message | undefined {
    const h = this.h;
    const top = h[0];
    const last = h.pop();
    if (h.length && last) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
  clear(): Message[] {
    const all = this.h;
    this.h = [];
    return all;
  }
}

/** Delivers messages: at once, or when the game clock reaches them. */
export class MessageDispatcher {
  readonly factory = new MessageFactory();
  private receivers = new Map<number, Receiver>();
  private handlers = new Map<string, Set<Handler<MessageType>>>();
  private queue = new MessageQueue();
  /** Game time as last told (seconds). */
  now = 0;
  /** How deep messages sent from handlers have nested, to catch a loop. */
  private depth = 0;

  /** Adds a receiver (an actor) to be sent messages by id; returns a function to remove it. */
  register(r: Receiver): () => void {
    this.receivers.set(r.id, r);
    return () => this.unregister(r.id);
  }

  unregister(id: number): void {
    this.receivers.delete(id);
  }

  /** Listens for every message of a type (broadcast or direct); returns a function to stop. */
  on<K extends MessageType>(type: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<MessageType>);
    return () => set!.delete(handler as Handler<MessageType>);
  }

  /** Listens for the next message of a type only. */
  once<K extends MessageType>(type: K, handler: Handler<K>): () => void {
    const off = this.on(type, (p, m) => {
      off();
      handler(p, m);
    });
    return off;
  }

  /** Sends a message, now or after a delay in game seconds. */
  send<K extends MessageType>(type: K, payload: MessageTypes[K], o: SendOptions = {}): void {
    const delay = o.delay ?? 0;
    const m = this.factory.create(type, payload, o.from ?? SYSTEM, o.to ?? BROADCAST, this.now + Math.max(0, delay));
    if (delay > 0) this.queue.push(m as Message);
    else this.deliver(m as Message);
  }

  /** The clock has moved on: delivers every delayed message now due, in order. */
  update(now: number): void {
    this.now = now;
    for (let m = this.queue.peek(); m && m.at <= now; m = this.queue.peek()) this.deliver(this.queue.pop()!);
  }

  /** Delayed messages still waiting. */
  get pending(): number {
    return this.queue.size;
  }

  /** Drops every delayed message (a new game, or loading one), and sets the clock. */
  reset(now = 0): void {
    for (const m of this.queue.clear()) this.factory.release(m);
    this.now = now;
  }

  private deliver(m: Message): void {
    if (this.depth > 32) {
      console.warn(`Message loop? Dropped "${m.type}".`);
      return;
    }
    this.depth++;
    try {
      if (m.receiver !== BROADCAST) this.receivers.get(m.receiver)?.receive(m);
      const set = this.handlers.get(m.type);
      if (set) for (const h of [...set]) h(m.payload, m);
    } finally {
      this.depth--;
      this.factory.release(m);
    }
  }
}
