/**
 * Number formatting that does not depend on the engine's locale data: `thousands(12345)` is
 * "12,345" everywhere (`toLocaleString` can differ, or lack the data, in some engines and builds).
 */
export function thousands(n: number): string {
  const neg = n < 0;
  const s = String(Math.trunc(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return neg ? `-${out}` : out;
}
