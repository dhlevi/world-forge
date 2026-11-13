/**
 * Screens: each part of the game the player is in (the title, making a world, character
 * creation, the map) is a Screen, kept on a stack by the ScreenManager.
 *
 * - **The top screen is active:** it alone is sent keys and updated each frame.
 * - **Screens beneath stay alive:** a screen pushed over another pauses it rather than ending it,
 *   and it resumes when the one above is closed. A **popup** (a character sheet, a dialogue) is
 *   drawn over the screen beneath, which stays in sight; any other screen hides those beneath.
 * - **Each screen has a view:** a Vue component, given the screen as its `screen` prop, that
 *   draws it and calls its methods. The screen keeps what the view shows in `state` (reactive),
 *   and everything else as plain fields.
 *
 * Lifecycle: `enter` when pushed, `pause` when another is pushed above, `resume` when it is the
 * top again, `leave` when removed.
 */
import { markRaw, shallowReactive, type Component } from 'vue';

let uid = 0;

export abstract class Screen {
  /** The Vue component that draws this screen; it receives the screen as its `screen` prop. */
  abstract readonly view: Component;
  /** Drawn over the screen beneath (which stays in sight but paused). */
  popup = false;
  /** A key for the view. */
  readonly uid = ++uid;
  manager: ScreenManager | null = null;
  /** What to stop when the screen is removed (watches it keeps while open). */
  private stops: (() => void)[] = [];

  constructor() {
    // The screen itself is never made reactive (it holds the game's machinery); views read `state`.
    markRaw(this);
  }

  enter(): void {}
  leave(): void {}
  pause(): void {}
  resume(): void {}
  /** Each frame while on top; dt in seconds. */
  update(_dt: number): void {}
  /** A key pressed while on top. Returns true if used (the browser's default is then stopped). */
  key(_e: KeyboardEvent): boolean {
    return false;
  }

  /** Whether this screen is on top (reactive, for views). */
  get active(): boolean {
    return this.manager?.top === this;
  }

  /** Keeps `stop` to be called when this screen is removed (ending a watch it began). */
  protected whileOpen(stop: () => void): void {
    this.stops.push(stop);
  }

  /** Called by the manager after `leave`: ends what the screen kept while open. */
  ended(): void {
    for (const stop of this.stops.splice(0)) stop();
  }

  /** Removes this screen from the stack. */
  close(): void {
    this.manager?.remove(this);
  }
}

export class ScreenManager {
  /** Bottom first. Reactive in its membership, for the host view. */
  readonly stack = shallowReactive<Screen[]>([]);
  private frame = 0;
  private last = 0;

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** The screens in sight: the top one, and those beneath it down to the first that is not a popup. */
  get visible(): Screen[] {
    let i = this.stack.length - 1;
    while (i > 0 && this.stack[i].popup) i--;
    return this.stack.slice(Math.max(0, i));
  }

  isVisible(s: Screen): boolean {
    return this.visible.includes(s);
  }

  /** Puts a screen on top, pausing the one beneath. */
  push(s: Screen): Screen {
    this.top?.pause();
    s.manager = this;
    this.stack.push(s);
    s.enter();
    return s;
  }

  /** Removes the top screen and resumes the one beneath. */
  pop(): Screen | undefined {
    const s = this.stack.pop();
    if (!s) return undefined;
    s.leave();
    s.ended();
    s.manager = null;
    this.top?.resume();
    return s;
  }

  /** Removes a screen wherever it is in the stack. */
  remove(s: Screen): void {
    if (this.top === s) {
      this.pop();
      return;
    }
    const i = this.stack.indexOf(s);
    if (i < 0) return;
    this.stack.splice(i, 1);
    s.leave();
    s.ended();
    s.manager = null;
  }

  /** Clears the stack and puts this screen alone on it (moving on to another part of the game). */
  switchTo(s: Screen): Screen {
    while (this.stack.length) this.pop();
    return this.push(s);
  }

  /** Begins sending keys and frames to the top screen. */
  start(): void {
    window.addEventListener('keydown', this.onKey);
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.25, (t - this.last) / 1000);
      this.last = t;
      this.top?.update(dt);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    window.removeEventListener('keydown', this.onKey);
    cancelAnimationFrame(this.frame);
  }

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    // Typing in a field is the field's, except Escape.
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && e.code !== 'Escape') return;
    if (this.top?.key(e)) e.preventDefault();
  };
}
