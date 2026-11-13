// Fails when modules import one another in a circle (value imports; `import type` is free), in the
// core, the game and the atlas. Circles work only by the luck of load order, so they are kept out:
// move what both sides need into a module of its own. Run by `npm run typecheck`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['packages/core/src', 'apps/game/src', 'apps/atlas/src'];

function files(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|vue)$/.test(f) && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function resolve(from, spec) {
  const t = path.resolve(path.dirname(from), spec);
  for (const c of [t, `${t}.ts`, path.join(t, 'index.ts')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

let found = 0;
for (const src of SOURCES) {
  const dir = path.join(root, src);
  const edges = new Map();
  for (const f of files(dir)) {
    const text = fs.readFileSync(f, 'utf8');
    const to = new Set();
    // Value imports and re-exports from relative paths (not `import type` / `export type`).
    for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      const r = resolve(f, m[1]);
      if (r) to.add(r);
    }
    edges.set(f, to);
  }
  // Tarjan's strongly connected components.
  let index = 0;
  const stack = [], on = new Set(), idx = new Map(), low = new Map();
  const visit = (v) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!edges.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) {
        found++;
        console.error(`Import cycle in ${src}: ${scc.map((p) => path.relative(dir, p)).join(' -> ')}`);
      }
    }
  };
  for (const v of edges.keys()) if (!idx.has(v)) visit(v);
}
if (found) {
  console.error(`${found} import cycle(s): move what both sides need into a module of its own.`);
  process.exit(1);
}
console.log('Import cycles: none in the core, the game or the atlas.');
