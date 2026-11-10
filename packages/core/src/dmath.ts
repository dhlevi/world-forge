/**
 * Deterministic maths: the transcendental functions the generator uses, computed the same way in
 * every JavaScript engine and version.
 *
 * `Math.sin`, `Math.exp`, `Math.pow` and their kin are only required to be close to the true
 * value, and engines differ in the last digits (Node 22 and a current Chromium disagree on nearly
 * all of them), so the same seed would make very slightly different worlds in different places.
 * These functions are ports of fdlibm (the freely distributable maths library most engines began
 * from) and use only what IEEE 754 requires to be exact in every engine: + - * /, `Math.sqrt`,
 * `Math.abs`, `Math.floor`, `Math.trunc`, comparisons and reading or writing a number's bits.
 * They are accurate to a few units in the last place (sin, cos, exp, log, atan and atan2 match
 * fdlibm exactly; a fractional power is good to about 1e-14), and angles beyond about a million
 * radians are reduced less exactly (no world needs them).
 *
 * The core uses `DMath` wherever a result can reach a world (packages/core/scripts/check-math.ts
 * enforces it; see there for the few drawing modules left on `Math`).
 */

// ---- A number's bits --------------------------------------------------------------------------

const BUF = new ArrayBuffer(8);
const F64 = new Float64Array(BUF);
const U32 = new Uint32Array(BUF);
/** Which 32-bit word holds the sign and exponent (the platform's byte order). */
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;
const LO = 1 - HI;

function highWord(x: number): number {
  F64[0] = x;
  return U32[HI] | 0;
}
function lowWord(x: number): number {
  F64[0] = x;
  return U32[LO] | 0;
}
function withHigh(x: number, hi: number): number {
  F64[0] = x;
  U32[HI] = hi >>> 0;
  return F64[0];
}
function fromWords(hi: number, lo: number): number {
  U32[HI] = hi >>> 0;
  U32[LO] = lo >>> 0;
  return F64[0];
}
/** x times 2 to the n, exactly (unless the result is subnormal). */
function scalbn(x: number, n: number): number {
  while (n > 1023) {
    x *= fromWords(0x7fe00000, 0);
    n -= 1023;
  }
  while (n < -1022) {
    x *= fromWords(0x00100000, 0);
    n += 1022;
  }
  return x * fromWords((n + 1023) << 20, 0);
}

// ---- exp and log ------------------------------------------------------------------------------

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+0;
const P1 = 1.66666666666666019037e-1, P2 = -2.77777777770155933842e-3, P3 = 6.61375632143793436117e-5, P4 = -1.65339022054652515390e-6, P5 = 4.13813679705723846039e-8;

function exp(x: number): number {
  if (x !== x) return x;
  if (x > 7.09782712893383973096e+2) return Infinity;
  if (x < -7.45133219101941108420e+2) return 0;
  const ax = x < 0 ? -x : x;
  if (ax < 3.725290298461914e-9) return 1 + x;
  let hi: number, lo: number, k = 0;
  if (ax > 0.5 * LN2_HI) {
    k = Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5));
    hi = x - k * LN2_HI;
    lo = k * LN2_LO;
  } else {
    hi = x;
    lo = 0;
  }
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((r * c) / (c - 2) - r);
  const y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  return scalbn(y, k);
}

const LG1 = 6.666666666666735130e-1, LG2 = 3.999999999940941908e-1, LG3 = 2.857142874366239149e-1, LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1, LG6 = 1.531383769920937332e-1, LG7 = 1.479819860511658591e-1;
const TWO54 = 1.80143985094819840000e+16;

function log(x: number): number {
  let hx = highWord(x);
  const lx = lowWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHigh(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  const dk = k;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO;
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - R : dk * LN2_HI - ((R - dk * LN2_LO) - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + R)) : dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f);
  }
  return k === 0 ? f - s * (f - R) : dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f);
}

function expm1(x: number): number {
  const ax = x < 0 ? -x : x;
  if (x !== x) return x;
  if (ax < 1e-5) return x + x * x * 0.5 + x * x * x / 6;
  if (ax < 0.5) {
    // The series, summed smallest first.
    let term = x, n = 1;
    const terms: number[] = [];
    while (n <= 18) {
      terms.push(term);
      n++;
      term = (term * x) / n;
    }
    let s = 0;
    for (let i = terms.length - 1; i >= 0; i--) s += terms[i];
    return s;
  }
  return exp(x) - 1;
}

function log1p(x: number): number {
  if (x !== x || x < -1) return NaN;
  if (x === -1) return -Infinity;
  if (x === Infinity) return x;
  const ax = x < 0 ? -x : x;
  if (ax < 1e-4) return x - (x * x) / 2 + (x * x * x) / 3 - (x * x * x * x) / 4;
  const u = 1 + x;
  // log(u) corrected for the rounding of 1 + x.
  return log(u) - ((u - 1) - x) / u;
}

const INV_LN10 = 4.34294481903251816668e-1;
const INV_LN2D = 1.44269504088896338700e+0;

function log2(x: number): number {
  // Exact for powers of two (normal numbers whose fraction bits are all zero).
  const hx = highWord(x);
  if (hx > 0x000fffff && hx < 0x7ff00000 && (hx & 0x000fffff) === 0 && lowWord(x) === 0) return (hx >> 20) - 1023;
  return log(x) * INV_LN2D;
}

function log10(x: number): number {
  const r = log(x) * INV_LN10;
  // Exact for powers of ten that are themselves exact.
  const n = Math.round(r);
  if (n >= 0 && n <= 22 && Math.abs(r - n) < 1e-9 && powInt(10, n) === x) return n;
  return r;
}

// ---- Powers and roots -------------------------------------------------------------------------

/** x to a whole power, by repeated squaring. */
function powInt(x: number, n: number): number {
  let m = n < 0 ? -n : n;
  let r = 1, b = x;
  while (m > 0) {
    if (m & 1) r *= b;
    m = Math.floor(m / 2);
    if (m > 0) b *= b;
  }
  return n < 0 ? 1 / r : r;
}

function pow(x: number, y: number): number {
  // Squares and cubes (most powers in the generator), exactly as repeated squaring makes them.
  if (y === 2) return x * x;
  if (y === 3) return x * (x * x);
  if (y === 1) return x;
  if (y === 0) return 1;
  if (y !== y || x !== x) return NaN;
  const yInt = Math.floor(y) === y;
  // Whole powers up to 2^31 by squaring (exact where the result is).
  if (yInt && Math.abs(y) <= 2147483648 && Math.abs(x) !== Infinity) return powInt(x, y);
  const ax = x < 0 ? -x : x;
  if (y === Infinity || y === -Infinity) {
    if (ax === 1) return NaN;
    return (ax > 1) === (y > 0) ? Infinity : 0;
  }
  const odd = yInt && Math.abs(y) < 9007199254740992 && Math.abs(y % 2) === 1;
  if (ax === Infinity) {
    const r = y > 0 ? Infinity : 0;
    return x < 0 && odd ? -r : r;
  }
  if (x === 0) {
    const r = y > 0 ? 0 : Infinity;
    return 1 / x < 0 && odd ? -r : r;
  }
  if (x < 0 && !yInt) return NaN;
  const r = exp(y * log(ax));
  return x < 0 && odd ? -r : r;
}

function cbrt(x: number): number {
  if (x !== x || x === 0 || x === Infinity || x === -Infinity) return x;
  const a = x < 0 ? -x : x;
  let y = exp(log(a) / 3);
  y -= (y * y * y - a) / (3 * y * y);
  y -= (y * y * y - a) / (3 * y * y);
  return x < 0 ? -y : y;
}

function hypot(...v: number[]): number {
  let m = 0, nan = false;
  for (const x of v) {
    const a = x < 0 ? -x : x;
    if (a === Infinity) return Infinity;
    if (a !== a) nan = true;
    else if (a > m) m = a;
  }
  if (nan) return NaN;
  if (m === 0) return 0;
  // Scaled by the largest when the squares would overflow or vanish.
  if (m > 1e150 || m < 1e-150) {
    let s = 0;
    for (const x of v) {
      const q = x / m;
      s += q * q;
    }
    return m * Math.sqrt(s);
  }
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

function hypot2(x: number, y: number): number {
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  if (ax === Infinity || ay === Infinity) return Infinity;
  const m = ax > ay ? ax : ay;
  if (m > 1e150 || m < 1e-150) return hypot(x, y);
  return Math.sqrt(x * x + y * y);
}

// ---- Sine, cosine and tangent -----------------------------------------------------------------

const S1 = -1.66666666666666324348e-1, S2 = 8.33333333332248946124e-3, S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6, S5 = -2.50507602534068634195e-8, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2, C2 = -1.38888888888741095749e-3, C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7, C5 = 2.08757232129817482790e-9, C6 = -1.13596475577881948265e-11;

function kSin(x: number, y: number, iy: number): number {
  const z = x * x, v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
// The kernels' thresholds as numbers (|x| below the double whose high word is the threshold is
// the same test as fdlibm's on the high word), so the hot paths need not read a number's bits.
const T_TINY = fromWords(0x3e400000, 0), T_COS1 = fromWords(0x3fd33333, 0), T_COS2 = fromWords(0x3fe90001, 0), T_PIO4 = fromWords(0x3fe921fc, 0);

function kCos(x: number, y: number): number {
  const ax = x < 0 ? -x : x;
  if (ax < T_TINY) return 1;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ax < T_COS1) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ax >= T_COS2 ? 0.28125 : fromWords((highWord(x) & 0x7fffffff) - 0x00200000, 0);
  const hz = 0.5 * z - qx, a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417e+0, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
const TWO_PI = 6.28318530717958647692;
const R2 = [0, 0];

/** x reduced to [-pi/4, pi/4] as R2[0] + R2[1], and which quarter turn it was in. */
function remPio2(x: number): number {
  let t = x < 0 ? -x : x;
  if (t > 1647099.3291652855) {
    // Beyond 2^20 pi/2 (no world needs it): reduce by whole turns first, less exactly.
    t -= TWO_PI * Math.floor(t / TWO_PI);
  }
  const n = Math.floor(t * INV_PIO2 + 0.5);
  const fn = n;
  let r = t - fn * PIO2_1;
  let w = fn * PIO2_1T;
  const j = highWord(t) >> 20;
  let y0 = r - w;
  let i = j - ((highWord(y0) >> 20) & 0x7ff);
  if (i > 16) {
    let tt = r;
    w = fn * PIO2_2;
    r = tt - w;
    w = fn * PIO2_2T - ((tt - r) - w);
    y0 = r - w;
    i = j - ((highWord(y0) >> 20) & 0x7ff);
    if (i > 49) {
      tt = r;
      w = fn * PIO2_3;
      r = tt - w;
      w = fn * PIO2_3T - ((tt - r) - w);
      y0 = r - w;
    }
  }
  const y1 = (r - y0) - w;
  if (x < 0) {
    R2[0] = -y0;
    R2[1] = -y1;
    return -n;
  }
  R2[0] = y0;
  R2[1] = y1;
  return n;
}

function sin(x: number): number {
  const ax = x < 0 ? -x : x;
  if (ax < T_PIO4) return ax < T_TINY ? x : kSin(x, 0, 0);
  if (!(ax < Infinity)) return NaN;
  const n = remPio2(x) & 3;
  const a = R2[0], b = R2[1];
  return n === 0 ? kSin(a, b, 1) : n === 1 ? kCos(a, b) : n === 2 ? -kSin(a, b, 1) : -kCos(a, b);
}

function cos(x: number): number {
  const ax = x < 0 ? -x : x;
  if (ax < T_PIO4) return kCos(x, 0);
  if (!(ax < Infinity)) return NaN;
  const n = remPio2(x) & 3;
  const a = R2[0], b = R2[1];
  return n === 0 ? kCos(a, b) : n === 1 ? -kSin(a, b, 1) : n === 2 ? -kCos(a, b) : kSin(a, b, 1);
}

function tan(x: number): number {
  return sin(x) / cos(x);
}

// ---- Arc tangents and arc sines ---------------------------------------------------------------

const ATANHI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800e+0];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1, 9.09088713343650656196e-2,
  -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.65315727442169155270e-2,
  1.62858201153657823623e-2,
];

function atan(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    if (x !== x) return x;
    return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
  }
  let id: number;
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000) return x;
    id = -1;
  } else {
    x = x < 0 ? -x : x;
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return hx < 0 ? -r : r;
}

const PI = 3.1415926535897931160e+0, PI_LO = 1.2246467991473531772e-16, PI_O_2 = 1.5707963267948965580e+0, PI_O_4 = 7.8539816339744827900e-1;

function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const yNeg = y < 0 || (y === 0 && 1 / y < 0);
  const xNeg = x < 0 || (x === 0 && 1 / x < 0);
  if (y === 0) return xNeg ? (yNeg ? -PI : PI) : y;
  if (x === 0) return yNeg ? -PI_O_2 : PI_O_2;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) return xNeg ? (yNeg ? -3 * PI_O_4 : 3 * PI_O_4) : yNeg ? -PI_O_4 : PI_O_4;
    return xNeg ? (yNeg ? -PI : PI) : yNeg ? -0 : 0;
  }
  if (y === Infinity || y === -Infinity) return yNeg ? -PI_O_2 : PI_O_2;
  const k = ((highWord(y) & 0x7fffffff) >> 20) - ((highWord(x) & 0x7fffffff) >> 20);
  let z: number;
  if (k > 60) z = PI_O_2 + 0.5 * PI_LO;
  else if (xNeg && k < -60) z = 0;
  else z = atan(Math.abs(y / x));
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? (z - PI_LO) - PI : PI - (z - PI_LO);
}

const PIO2_HI = 1.57079632679489655800e+0, PIO2_LO = 6.12323399573676603587e-17, PIO4_HI = 7.85398163397448278999e-1;
const PS0 = 1.66666666666666657415e-1, PS1 = -3.25565818622400915405e-1, PS2 = 2.01212532134862925881e-1, PS3 = -4.00555345006794114027e-2;
const PS4 = 7.91534994289814532176e-4, PS5 = 3.47933107596021167570e-5;
const QS1 = -2.40339491173441421878e+0, QS2 = 2.02094576023350569471e+0, QS3 = -6.88283971605453293030e-1, QS4 = 7.70381505559019352791e-2;
const T_ASIN_HI = fromWords(0x3fef3333, 0);

function asin(x: number): number {
  const ax = x < 0 ? -x : x;
  if (!(ax < 1)) return ax === 1 ? x * PIO2_HI + x * PIO2_LO : NaN;
  if (ax < 0.5) {
    if (ax < T_TINY) return x;
    const t = x * x;
    const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    const q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    return x + x * (p / q);
  }
  const w0 = 1 - ax;
  const t = w0 * 0.5;
  let p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
  let q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
  const s = Math.sqrt(t);
  let r: number;
  if (ax >= T_ASIN_HI) {
    const w = p / q;
    r = PIO2_HI - (2 * (s + s * w) - PIO2_LO);
  } else {
    // The high half of s (Veltkamp's split: few enough bits that w * w is exact), as fdlibm
    // gets by clearing the low word, without reading the number's bits.
    const sc = s * 134217729;
    const w = sc - (sc - s);
    const c = (t - w * w) / (s + w);
    const rr = p / q;
    p = 2 * s * rr - (PIO2_LO - 2 * c);
    q = PIO4_HI - 2 * w;
    r = PIO4_HI - (p - q);
  }
  return x < 0 ? -r : r;
}
function acos(x: number): number {
  return atan2(Math.sqrt((1 - x) * (1 + x)), x);
}

// ---- Hyperbolic functions ---------------------------------------------------------------------

function sinh(x: number): number {
  const a = x < 0 ? -x : x;
  let r: number;
  if (a < 1) {
    const t = expm1(a);
    r = 0.5 * (t + t / (t + 1));
  } else {
    const e = exp(a);
    r = 0.5 * (e - 1 / e);
  }
  return x < 0 ? -r : r;
}
function cosh(x: number): number {
  const e = exp(x < 0 ? -x : x);
  return 0.5 * (e + 1 / e);
}
function tanh(x: number): number {
  const a = x < 0 ? -x : x;
  if (a !== a) return a;
  const r = a > 22 ? 1 : (() => {
    const t = expm1(2 * a);
    return t / (t + 2);
  })();
  return x < 0 ? -r : r;
}
function asinh(x: number): number {
  const a = x < 0 ? -x : x;
  const r = a !== a || a === Infinity ? a : a > 1e150 ? log(a) + LN2_HI + LN2_LO : a < 0.5 ? log1p(a + (a * a) / (1 + Math.sqrt(1 + a * a))) : log(a + Math.sqrt(a * a + 1));
  return x < 0 ? -r : r;
}
function acosh(x: number): number {
  if (x < 1 || x !== x) return NaN;
  if (x === Infinity) return x;
  if (x > 1e150) return log(x) + LN2_HI + LN2_LO;
  const t = x - 1;
  return t < 1 ? log1p(t + Math.sqrt(2 * t + t * t)) : log(x + Math.sqrt(x * x - 1));
}
function atanh(x: number): number {
  const a = x < 0 ? -x : x;
  if (a > 1 || a !== a) return NaN;
  if (a === 1) return x < 0 ? -Infinity : Infinity;
  const r = 0.5 * log1p((2 * a) / (1 - a));
  return x < 0 ? -r : r;
}

/**
 * The deterministic stand-ins for `Math`'s transcendental functions, with the same names and
 * meanings (`hypot` takes any number of arguments; `hypot2` is the quicker two-argument form).
 */
export const DMath = {
  sin, cos, tan, asin, acos, atan, atan2, exp, expm1, log, log1p, log2, log10, pow, cbrt, hypot, hypot2, sinh, cosh, tanh, asinh, acosh, atanh,
} as const;
