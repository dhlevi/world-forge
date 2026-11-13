/**
 * Errors that escape: one place to note them, and to tell whoever shows them to the player (the
 * game's log while playing, the menus otherwise). Installed once at start (main.ts): Vue's own
 * errors, uncaught errors and promises rejected with nobody to catch them all come here, so that
 * nothing fails silently, and the game carries on where it can.
 */
import type { App } from 'vue';

type Listener = (message: string, where: string) => void;
const listeners = new Set<Listener>();

/** Hears every error reported; returns how to stop hearing. */
export function onError(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** An error in a sentence. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Notes an error (the console keeps the details) and tells the listeners. */
export function reportError(err: unknown, where = 'the game'): void {
  console.error(`[${where}]`, err);
  const msg = errorText(err);
  for (const l of listeners) {
    try {
      l(msg, where);
    } catch (e) {
      console.error('[error listener]', e);
    }
  }
}

/** Runs a promise in the background: a failure is reported, not lost. */
export function background(p: Promise<unknown>, where: string): void {
  p.catch((err: unknown) => reportError(err, where));
}

/** Sends Vue's errors, uncaught errors and unhandled rejections to reportError. */
export function installErrorHandlers(app: App): void {
  app.config.errorHandler = (err, _instance, info) => reportError(err, info || 'the interface');
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'the page'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'a background task'));
}
