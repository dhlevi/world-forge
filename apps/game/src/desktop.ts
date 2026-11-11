/**
 * The desktop app's bridge (apps/desktop/src/preload.cts), present only when the game runs in
 * the desktop window: a native file dialog and a data folder for the game's own files. In a
 * browser `desktop` is undefined and the game falls back to what a page can do.
 */
export interface DesktopInfo {
  version: string;
  electron: string;
  platform: string;
  dataDir: string;
}

export interface DesktopBridge {
  desktop: true;
  info(): Promise<DesktopInfo>;
  /** A native open dialog for a world file: its name and text, or null if cancelled. */
  openWorldFile(): Promise<{ name: string; text: string } | null>;
  /** Closes the app. */
  quit(): Promise<void>;
  /** Text files in the game's data folder, by names such as "settings.json" or "saves/a.json". */
  data: {
    read(name: string): Promise<string | null>;
    write(name: string, text: string): Promise<boolean>;
    list(dir?: string): Promise<string[]>;
    remove(name: string): Promise<boolean>;
    show(): Promise<string>;
  };
  onMenu(cb: (what: string) => void): () => void;
}

declare global {
  interface Window {
    worldforge?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.worldforge : undefined;

/** Reads a JSON data file (desktop only), or the fallback. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (!desktop) return fallback;
  try {
    const t = await desktop.data.read(name);
    return t ? ({ ...fallback, ...JSON.parse(t) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  if (!desktop) return;
  try {
    await desktop.data.write(name, JSON.stringify(value, null, 2));
  } catch {
    // Not worth stopping the game for.
  }
}
