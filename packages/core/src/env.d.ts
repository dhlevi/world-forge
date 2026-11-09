/**
 * The few globals the core uses that every place it runs has (browsers, workers, Node, Deno,
 * Bun, Electron), declared here because the core is checked without the DOM's or Node's types.
 */
declare const performance: { now(): number };
declare const console: { log(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
declare class URLSearchParams {
  constructor(init?: string);
  get(name: string): string | null;
  set(name: string, value: string): void;
  toString(): string;
}
