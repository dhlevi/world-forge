/**
 * Development: starts the game's Vite dev server, waits for it, then opens it in Electron (with
 * the main process freshly compiled). Edits to the game reload in the window as in a browser.
 */
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const desktop = path.resolve(here, '..');
const PORT = 5180;
const URL_ = `http://localhost:${PORT}/`;

execSync('npx tsc -p tsconfig.json', { cwd: desktop, stdio: 'inherit' });
const vite = spawn('npm', ['run', 'dev', '-w', '@worldforge/game', '--', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

async function waitFor(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`The dev server did not start at ${url}`);
}

await waitFor(URL_, 60000);
const electron = createRequire(import.meta.url)('electron');
const app = spawn(electron, ['.'], { cwd: desktop, stdio: 'inherit', env: { ...process.env, WF_DEV_URL: URL_ } });
const stop = () => {
  vite.kill();
  app.kill();
};
app.on('exit', () => {
  vite.kill();
  process.exit(0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
