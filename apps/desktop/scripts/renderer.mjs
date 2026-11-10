/**
 * Builds the game (apps/game) and copies it into renderer/, which the desktop app serves.
 */
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = path.resolve(here, '../renderer');
execSync('npm run build -w @worldforge/game', { cwd: root, stdio: 'inherit', env: { ...process.env, BASE_PATH: '/' } });
const dist = path.join(root, 'apps/game/dist');
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('The game build left no index.html.');
rmSync(out, { recursive: true, force: true });
cpSync(dist, out, { recursive: true });
console.log(`Copied the game into ${out}`);
