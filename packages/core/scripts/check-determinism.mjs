// Fails when the core uses anything whose result can differ between JavaScript engines, so the
// same seed makes the same world everywhere (src/dmath.ts says why). Run by `npm run typecheck`;
// plain JavaScript, so it runs wherever Node does. It looks for:
//   - transcendental Math functions and the ** operator (use DMath from src/dmath.ts);
//   - Math.random (use a seeded generator from src/gen/rng.ts);
//   - sort comparators that draw random numbers (how often an engine calls a comparator is its
//     own affair; use shuffle or sortByKey from src/gen/rng.ts) or return true or false;
//   - locale-dependent text (localeCompare, toLocale..., Intl; use src/format.ts).
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');
const FNS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh']);
/** Names the core gives its seeded random streams. */
const RNG = new Set(['r', 'r0', 'r1', 'r2', 'rnd', 'rng', 'rand', 'random', 'R']);
/**
 * Allowed engine maths: dmath.ts itself, and drawing that makes pictures only, never world data
 * (map tiles and previews, the illustrated town faces, the appearance sketches), kept on the
 * engine's own faster functions.
 */
const ALLOWED_MATH = ['dmath.ts', 'render/', 'towns/illustrate.ts', 'people/sketch.ts'];

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.ts') ? [join(d, f)] : []));
const bad = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  const mathOk = ALLOWED_MATH.some((a) => rel === a || rel.startsWith(a));
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const at = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const o = n.expression.text, p = n.name.text;
      if (o === 'Math' && FNS.has(p) && !mathOk) bad.push(`${at(n)}  Math.${p} (use DMath.${p})`);
      if (o === 'Math' && p === 'random') bad.push(`${at(n)}  Math.random (use a seeded generator)`);
      if (o === 'Intl') bad.push(`${at(n)}  Intl (locale-dependent)`);
    }
    if (ts.isPropertyAccessExpression(n) && /^(localeCompare|toLocaleString|toLocaleUpperCase|toLocaleLowerCase|toLocaleDateString|toLocaleTimeString)$/.test(n.name.text)) bad.push(`${at(n)}  ${n.name.text} (locale-dependent; see src/format.ts)`);
    if (!mathOk && ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken || n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) bad.push(`${at(n)}  ** (use DMath.pow)`);
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['sort', 'toSorted'].includes(n.expression.name.text) && n.arguments.length) {
      const cmp = n.arguments[0];
      const draws = (c) => (ts.isCallExpression(c) && ts.isIdentifier(c.expression) && RNG.has(c.expression.text)) || !!ts.forEachChild(c, (k) => (draws(k) ? true : undefined));
      if (draws(cmp)) bad.push(`${at(n)}  sort comparator draws random numbers (use shuffle or sortByKey)`);
      if ((ts.isArrowFunction(cmp) || ts.isFunctionExpression(cmp)) && ts.isArrowFunction(cmp) && !ts.isBlock(cmp.body) && ts.isBinaryExpression(cmp.body)
        && [ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(cmp.body.operatorToken.kind)) {
        bad.push(`${at(n)}  sort comparator returns true or false (return a number)`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
if (bad.length) {
  console.error(`Engine-dependent code in the core (worlds would differ between engines):\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log('Determinism check: nothing engine-dependent in the core.');
