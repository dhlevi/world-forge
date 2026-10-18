import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Faith, FaithFamily } from './faiths';

/**
 * A faith's holy emblem, drawn as SVG in the manner of heraldry: a field (a roundel, octagon,
 * hexagon, lozenge or stepped square, by archetype) in one tincture, a border and frame (rays,
 * a ring of dots for the gods, knotwork or a double ring), the faith's symbol as the core motif
 * in a metal, and now and then a small mark of one of its tenets (crossed swords for holy war,
 * stars for astrology, waves for sacred waters, leaves for sacred groves, an olive branch for
 * pacifism). Everything is drawn in a 100 by 100 box.
 */

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const f1 = (n: number) => +n.toFixed(1);

const TINCTURE = { azure: '#2c4f8c', gules: '#a8262b', vert: '#2f6b3a', sable: '#26221f', purpure: '#5b3a74', tenne: '#a0622a', teal: '#1f6f73', argent: '#eceae2' };
const METAL = { or: '#d9b44a', argent: '#eceae2', gules: '#a8262b' };
type Tinct = keyof typeof TINCTURE;
type Metal = keyof typeof METAL;

const COLOURS: Record<FaithFamily, [Tinct[], Metal[]]> = {
  church: [['azure', 'gules', 'purpure'], ['or', 'argent']], crescent: [['vert', 'azure', 'teal'], ['or', 'argent']], pantheon: [['purpure', 'azure', 'gules'], ['or']],
  oldgods: [['sable', 'gules', 'azure'], ['argent', 'or']], druid: [['vert', 'sable'], ['or', 'argent']], stars: [['azure', 'sable', 'purpure'], ['argent']],
  ancestors: [['sable', 'gules'], ['or']], sky: [['azure', 'teal'], ['argent', 'or']], heaven: [['gules', 'sable'], ['or']], kami: [['argent'], ['gules']],
  spirits: [['tenne', 'vert', 'teal'], ['argent', 'or']], sun: [['gules', 'sable', 'tenne'], ['or']], serpent: [['teal', 'vert', 'tenne'], ['or']],
};
const SHAPE: Record<FaithFamily, string[]> = {
  church: ['circle', 'circle', 'vesica'], crescent: ['octagon', 'circle'], pantheon: ['circle'], oldgods: ['circle', 'hexagon'], druid: ['circle'], stars: ['circle', 'lozenge'],
  ancestors: ['hexagon', 'octagon'], sky: ['circle'], heaven: ['circle', 'octagon'], kami: ['circle'], spirits: ['circle'], sun: ['step', 'circle'], serpent: ['step', 'square'],
};
const FRAME: Record<FaithFamily, string[]> = {
  church: ['double', 'rays', 'dots'], crescent: ['star8', 'double'], pantheon: ['laurel', 'dots'], oldgods: ['runes', 'knot'], druid: ['knot', 'dots'], stars: ['dots', 'double'],
  ancestors: ['runes', 'double'], sky: ['dots', 'rays'], heaven: ['double', 'dots'], kami: ['double'], spirits: ['feathers', 'dots'], sun: ['rays', 'step'], serpent: ['step', 'dots'],
};

// ---- Shapes ----------------------------------------------------------------------------------------

function poly(n: number, r: number, rot = 0): string {
  return Array.from({ length: n }, (_, k) => {
    const a = rot + (k / n) * Math.PI * 2;
    return `${f1(50 + Math.cos(a) * r)},${f1(50 + Math.sin(a) * r)}`;
  }).join(' ');
}
function star(n: number, ro: number, ri: number, cx = 50, cy = 50, rot = -Math.PI / 2): string {
  return Array.from({ length: n * 2 }, (_, k) => {
    const a = rot + (k / (n * 2)) * Math.PI * 2, rr = k % 2 ? ri : ro;
    return `${f1(cx + Math.cos(a) * rr)},${f1(cy + Math.sin(a) * rr)}`;
  }).join(' ');
}
function fieldShape(shape: string, r: number): string {
  switch (shape) {
    case 'octagon': return `<polygon points="${poly(8, r * 1.04, Math.PI / 8)}"/>`;
    case 'hexagon': return `<polygon points="${poly(6, r * 1.06, -Math.PI / 2)}"/>`;
    case 'lozenge': return `<polygon points="50,${50 - r * 1.12} ${50 + r * 0.9},50 50,${50 + r * 1.12} ${50 - r * 0.9},50"/>`;
    case 'square': return `<rect x="${50 - r * 0.9}" y="${50 - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.12}"/>`;
    case 'vesica': return `<path d="M50,${50 - r * 1.1}Q${50 + r * 1.15},50 50,${50 + r * 1.1}Q${50 - r * 1.15},50 50,${50 - r * 1.1}Z"/>`;
    case 'step': {
      const a = r * 0.92, s = r * 0.3;
      return `<path d="M${50 - a + s},${50 - a}H${50 + a - s}V${50 - a + s}H${50 + a}V${50 + a - s}H${50 + a - s}V${50 + a}H${50 - a + s}V${50 + a - s}H${50 - a}V${50 - a + s}H${50 - a + s}Z"/>`;
    }
    default: return `<circle cx="50" cy="50" r="${r}"/>`;
  }
}

// ---- Motifs ----------------------------------------------------------------------------------------

/** Each motif draws in `m` (the metal) with `bg` (the field) for cut-outs. */
type Draw = (m: string, bg: string, r: Rng) => string;
const S = (m: string, w = 3.2) => `fill="none" stroke="${m}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const F = (m: string) => `fill="${m}"`;

const M: Record<string, Draw> = {
  sun: (m) => `<circle cx="50" cy="50" r="10" ${F(m)}/>${Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2, l = k % 2 ? 20 : 25;
    return `<path d="M${f1(50 + Math.cos(a) * 14)},${f1(50 + Math.sin(a) * 14)}L${f1(50 + Math.cos(a) * l)},${f1(50 + Math.sin(a) * l)}" ${S(m, 2.6)}/>`;
  }).join('')}`,
  rising: (m) => `<path d="M30,60A20,20 0 0 1 70,60Z" ${F(m)}/><path d="M24,64H76" ${S(m)}/>${Array.from({ length: 7 }, (_, k) => {
    const a = Math.PI + ((k + 1) / 8) * Math.PI;
    return `<path d="M${f1(50 + Math.cos(a) * 24)},${f1(60 + Math.sin(a) * 24)}L${f1(50 + Math.cos(a) * 32)},${f1(60 + Math.sin(a) * 32)}" ${S(m, 2.4)}/>`;
  }).join('')}`,
  crescent: (m, bg) => `<circle cx="50" cy="50" r="22" ${F(m)}/><circle cx="58" cy="45" r="18" ${F(bg)}/>`,
  crescentStar: (m, bg) => `<circle cx="46" cy="50" r="22" ${F(m)}/><circle cx="54" cy="47" r="18" ${F(bg)}/><polygon points="${star(5, 8, 3.4, 63, 46)}" ${F(m)}/>`,
  star: (m) => `<polygon points="${star(5, 24, 10)}" ${F(m)}/>`,
  star8: (m, bg) => `<polygon points="${star(8, 25, 14)}" ${F(m)}/><circle cx="50" cy="50" r="6" ${F(bg)}/>`,
  cross: (m) => `<path d="M45,24H55V38H68V48H55V76H45V48H32V38H45Z" ${F(m)}/>`,
  stepCross: (m) => `<path d="M44,26H56V32H62V44H74V56H62V68H56V74H44V68H38V56H26V44H38V32H44Z" ${F(m)}/>`,
  wheel: (m) => `<circle cx="50" cy="50" r="22" ${S(m)}/><circle cx="50" cy="50" r="5" ${F(m)}/>${Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2;
    return `<path d="M${f1(50 + Math.cos(a) * 5)},${f1(50 + Math.sin(a) * 5)}L${f1(50 + Math.cos(a) * 22)},${f1(50 + Math.sin(a) * 22)}" ${S(m, 2.2)}/>`;
  }).join('')}`,
  medicine: (m) => `<circle cx="50" cy="50" r="22" ${S(m, 3.4)}/><path d="M50,28V72M28,50H72" ${S(m, 3.4)}/><circle cx="50" cy="50" r="4" ${F(m)}/>${[0, 1, 2, 3].map((k) => `<path d="M${50 + [22, 0, -22, 0][k]},${50 + [0, 22, 0, -22][k]}l${[5, -3, -5, 3][k]},${[4, 5, -4, -5][k]}" ${S(m, 2)}/>`).join('')}`,
  tree: (m) => `<path d="M50,74V44M50,56L38,46M50,52L62,42M50,62L41,58M50,60L60,56" ${S(m, 3)}/><circle cx="50" cy="38" r="15" ${F(m)}/><path d="M42,74Q50,68 58,74M38,76H62" ${S(m, 2.4)}/>`,
  leaf: (m) => `<path d="M30,70Q50,52 70,30" ${S(m, 2.6)}/>${[0, 1, 2, 3, 4].map((k) => {
    const x = 34 + k * 8, y = 66 - k * 8;
    return `<path d="M${x},${y}q-10,-2 -12,-10q8,0 12,10Z" ${F(m)}/><path d="M${x},${y}q2,10 10,12q0,-8 -10,-12Z" ${F(m)}/>`;
  }).join('')}`,
  acorn: (m) => `<path d="M38,46Q38,36 50,34Q62,36 62,46Z" ${F(m)}/><path d="M40,48Q40,70 50,74Q60,70 60,48Z" ${S(m, 3)}/><path d="M50,34V27" ${S(m, 3)}/>`,
  blossom: (m, bg) => `${[0, 1, 2, 3, 4].map((k) => {
    const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
    return `<circle cx="${f1(50 + Math.cos(a) * 13)}" cy="${f1(50 + Math.sin(a) * 13)}" r="10" ${F(m)}/>`;
  }).join('')}<circle cx="50" cy="50" r="6" ${F(bg)}/><circle cx="50" cy="50" r="3" ${F(m)}/>`,
  lotus: (m) => `<path d="M50,30Q60,46 50,66Q40,46 50,30Z" ${F(m)}/><path d="M50,66Q34,62 28,44Q42,46 50,66Z" ${F(m)}/><path d="M50,66Q66,62 72,44Q58,46 50,66Z" ${F(m)}/><path d="M30,70H70" ${S(m, 2.6)}/>`,
  fruit: (m, bg) => `<circle cx="50" cy="54" r="18" ${F(m)}/><path d="M43,36L46,30L50,35L54,30L57,36Z" ${F(m)}/><path d="M44,52l3,4M52,50l3,4M48,60l3,4" ${S(bg, 2)}/>`,
  hammer: (m) => `<path d="M34,30H66V44H34Z" ${F(m)}/><path d="M50,44V76" ${S(m, 5)}/>`,
  anvil: (m) => `<path d="M26,36H72Q70,44 60,46V54H66V62H34V54H40V46Q30,44 26,36Z" ${F(m)}/><path d="M30,70H70" ${S(m, 3)}/>`,
  axe: (m) => `<path d="M48,24V78" ${S(m, 4)}/><path d="M50,28Q70,26 72,44Q66,52 50,50Z" ${F(m)}/>`,
  pick: (m) => `<path d="M30,38Q50,24 70,38" ${S(m, 4)}/><path d="M50,31V70" ${S(m, 4)}/><path d="M38,70H62V78H38Z" ${F(m)}/>`,
  sword: (m) => `<path d="M50,22L54,30V62H46V30Z" ${F(m)}/><path d="M38,62H62M50,62V76" ${S(m, 4)}/><circle cx="50" cy="78" r="3" ${F(m)}/>`,
  flameSword: (m) => `${M.sword(m, '', () => 0)}<path d="M44,34q-4,-6 0,-12M56,34q4,-6 0,-12M42,48q-6,-6 -2,-12M58,48q6,-6 2,-12" ${S(m, 2)}/>`,
  scimitar: (m) => `<path d="M46,70Q40,44 58,24Q52,46 54,66Z" ${F(m)}/><path d="M38,66H62M50,66V78" ${S(m, 4)}/>`,
  spear: (m) => `<path d="M50,20L56,36L50,40L44,36Z" ${F(m)}/><path d="M50,38V80" ${S(m, 3.4)}/><path d="M46,42q-4,8 -2,14M54,42q4,8 2,14" ${S(m, 1.8)}/>`,
  bow: (m) => `<path d="M38,24Q66,50 38,76" ${S(m, 3.4)}/><path d="M38,24V76" ${S(m, 1.4)}/><path d="M30,50H72M66,45L72,50L66,55" ${S(m, 2.6)}/>`,
  trident: (m) => `<path d="M50,30V80M36,26V40Q36,48 50,48Q64,48 64,40V26" ${S(m, 3.6)}/><path d="M50,22L54,30H46ZM36,22L39,28H33ZM64,22L67,28H61Z" ${F(m)}/>`,
  key: (m) => `<circle cx="50" cy="32" r="9" ${S(m, 4)}/><path d="M50,41V76M50,64H60M50,72H58" ${S(m, 4)}/>`,
  lock: (m, bg) => `<path d="M40,46V38Q40,26 50,26Q60,26 60,38V46" ${S(m, 4)}/><rect x="34" y="46" width="32" height="28" rx="3" ${F(m)}/><circle cx="50" cy="58" r="3.5" ${F(bg)}/><path d="M50,60V67" stroke="${bg}" stroke-width="3"/>`,
  book: (m, bg) => `<path d="M26,36Q38,32 50,38Q62,32 74,36V68Q62,64 50,70Q38,64 26,68Z" ${F(m)}/><path d="M50,38V70" stroke="${bg}" stroke-width="2"/><path d="M32,44q8,-2 14,1M32,52q8,-2 14,1M54,45q6,-3 14,-1M54,53q6,-3 14,-1" stroke="${bg}" stroke-width="1.5" fill="none"/>`,
  tablet: (m, bg) => `<rect x="34" y="24" width="32" height="52" rx="4" ${F(m)}/>${[34, 44, 54, 64].map((y) => `<path d="M40,${y}H60" stroke="${bg}" stroke-width="2"/>`).join('')}`,
  scroll: (m) => `<path d="M34,30H62V70H34Z" ${S(m, 3)}/><circle cx="34" cy="30" r="4" ${F(m)}/><circle cx="34" cy="70" r="4" ${F(m)}/><path d="M70,24L52,58" ${S(m, 3)}/><path d="M52,58l-3,6l6,-3Z" ${F(m)}/>`,
  cup: (m) => `<path d="M32,30H68Q68,54 50,56Q32,54 32,30Z" ${F(m)}/><path d="M50,56V70M38,72H62" ${S(m, 4)}/>`,
  bloodCup: (m) => `${M.cup(m, '', () => 0)}<path d="M40,30q0,8 -2,10M56,30q1,6 -1,9" ${S(m, 2)}/><circle cx="38" cy="44" r="2" ${F(m)}/>`,
  cauldron: (m) => `<path d="M28,40H72Q72,70 50,72Q28,70 28,40Z" ${F(m)}/><path d="M24,40H76M36,72L32,78M64,72L68,78" ${S(m, 3)}/><path d="M42,34q-4,-6 0,-10M50,34q-4,-6 0,-10M58,34q-4,-6 0,-10" ${S(m, 2)}/>`,
  vessel: (m) => `<path d="M42,26H58V32Q70,40 66,58Q62,72 50,74Q38,72 34,58Q30,40 42,32Z" ${F(m)}/>`,
  vial: (m, bg) => `<path d="M45,24H55V36Q66,44 64,60Q60,74 50,74Q40,74 36,60Q34,44 45,36Z" ${F(m)}/><polygon points="${star(4, 7, 2.5, 50, 58)}" ${F(bg)}/>`,
  lamp: (m) => `<path d="M30,56Q50,72 70,56H30Z" ${F(m)}/><path d="M70,56q6,-4 8,-10" ${S(m, 3)}/><path d="M50,48q-6,-8 0,-18q6,10 0,18Z" ${F(m)}/>`,
  bell: (m) => `<path d="M50,24V30M36,66Q38,36 50,32Q62,36 64,66Z" ${F(m)}/><path d="M30,68H70" ${S(m, 3)}/><circle cx="50" cy="72" r="4" ${F(m)}/>`,
  drum: (m, bg) => `<ellipse cx="50" cy="50" rx="24" ry="24" ${F(m)}/><ellipse cx="50" cy="50" rx="19" ry="19" ${F(bg)}/><path d="M50,36L58,52H42Z" ${F(m)}/><path d="M42,58H58" ${S(m, 2.4)}/>`,
  mirror: (m, bg) => `<circle cx="50" cy="44" r="18" ${F(m)}/><circle cx="50" cy="44" r="12" ${F(bg)}/><path d="M50,62V78" ${S(m, 5)}/>`,
  smokeMirror: (m, bg) => `${M.mirror(m, bg, () => 0)}<path d="M44,32q-6,-6 0,-12q6,-6 0,-10M56,32q6,-6 0,-12" ${S(m, 2)}/>`,
  mask: (m, bg) => `<path d="M30,30H70Q70,64 50,74Q30,64 30,30Z" ${F(m)}/><path d="M36,42H46M54,42H64" stroke="${bg}" stroke-width="4"/><path d="M42,60H58" stroke="${bg}" stroke-width="3"/>`,
  horn: (m) => `<path d="M26,40Q50,72 74,40Q50,58 26,40Z" ${F(m)}/><path d="M28,36Q50,24 72,36" ${S(m, 3)}/>`,
  horns: (m) => `<path d="M38,56Q24,44 26,24Q34,40 44,46ZM62,56Q76,44 74,24Q66,40 56,46Z" ${F(m)}/><path d="M40,48H60V62Q60,72 50,74Q40,72 40,62Z" ${F(m)}/>`,
  mountain: (m) => `<path d="M24,72L44,34L52,46L60,38L76,72Z" ${F(m)}/>`,
  peakSun: (m, bg) => `<circle cx="50" cy="34" r="10" ${F(m)}/><path d="M22,74L44,42L50,50L56,44L78,74Z" ${F(m)}/><path d="M44,42L50,50L56,44" stroke="${bg}" stroke-width="2" fill="none"/>`,
  clouds: (m) => [[38, 40], [60, 50], [42, 62]].map(([x, y]) => `<path d="M${x - 14},${y}q0,-8 8,-8q2,-8 10,-6q8,-2 10,6q8,0 8,8Z" ${F(m)}/>`).join(''),
  gate: (m) => `<path d="M24,32Q50,26 76,32V38H24Z" ${F(m)}/><path d="M30,44H70" ${S(m, 4)}/><path d="M34,36V76M66,36V76" ${S(m, 5)}/>`,
  tower: (m) => `<path d="M44,74V40L50,22L56,40V74Z" ${F(m)}/><path d="M38,48H62M40,60H60M36,74H64" ${S(m, 3)}/>`,
  pagoda: (m) => `${[28, 40, 52, 64].map((y, k) => `<path d="M${30 + k * -1},${y + 6}Q50,${y - 4} ${70 + k},${y + 6}Z" ${F(m)}/>`).join('')}<path d="M50,20V30M44,70H56V78H44Z" ${S(m, 3)}/>`,
  valknut: (m) => {
    const tri = (dx: number, dy: number) => `<polygon points="${50 + dx},${30 + dy} ${66 + dx},${58 + dy} ${34 + dx},${58 + dy}" ${S(m, 3)}/>`;
    return tri(0, -4) + tri(-7, 8) + tri(7, 8);
  },
  triskele: (m) => [0, 1, 2].map((k) => `<path d="M50,50Q50,30 62,30Q72,32 68,42Q64,48 58,44" ${S(m, 3.4)} transform="rotate(${k * 120} 50 50)"/>`).join(''),
  tomoe: (m) => [0, 1, 2].map((k) => `<g transform="rotate(${k * 120} 50 50)"><circle cx="50" cy="38" r="7" ${F(m)}/><path d="M57,38Q60,50 46,56Q54,48 50,45Z" ${F(m)}/></g>`).join(''),
  knot: (m) => `<circle cx="50" cy="50" r="20" ${S(m, 3)}/>${[0, 1, 2, 3].map((k) => `<circle cx="${50 + [0, 20, 0, -20][k]}" cy="${50 + [-20, 0, 20, 0][k]}" r="9" ${S(m, 3)}/>`).join('')}`,
  seal: (m, bg) => `<rect x="30" y="30" width="40" height="40" rx="3" ${F(m)}/><path d="M38,38H62M50,38V62M38,62H62M38,50H46M54,50H62" stroke="${bg}" stroke-width="3" fill="none"/>`,
  feather: (m, bg) => `<path d="M60,22Q74,44 50,70Q36,50 60,22Z" ${F(m)}/><path d="M58,30Q54,52 42,78" stroke="${bg}" stroke-width="2" fill="none"/>`,
  dreamcatcher: (m) => `<circle cx="50" cy="40" r="16" ${S(m, 3)}/><polygon points="${star(6, 12, 5, 50, 40)}" ${S(m, 1.2)}/><path d="M40,54V72M50,56V76M60,54V72" ${S(m, 2)}/><path d="M38,70l2,6l2,-6ZM48,74l2,6l2,-6ZM58,70l2,6l2,-6Z" ${F(m)}/>`,
  pipe: (m) => `<path d="M24,64L70,40" ${S(m, 4)}/><path d="M66,32H78V46Q72,50 66,46Z" ${F(m)}/><path d="M34,58l-4,12M42,54l-4,12" ${S(m, 1.8)}/>`,
  bird: (m) => `<path d="M50,36Q42,30 22,32Q36,40 46,48L44,58L38,72H62L56,58L54,48Q64,40 78,32Q58,30 50,36Z" ${F(m)}/><circle cx="50" cy="32" r="5" ${F(m)}/>`,
  dove: (m) => `<path d="M26,54Q40,48 50,54Q58,40 74,32Q66,48 60,56Q56,66 40,66Q32,62 26,54Z" ${F(m)}/><path d="M28,52l-6,-2" ${S(m, 2)}/>`,
  serpent: (m) => `<path d="M34,72Q20,58 36,50Q54,44 48,34Q44,26 56,24" ${S(m, 5)}/><path d="M56,20L66,24L56,29Z" ${F(m)}/><path d="M66,24l5,-2M66,24l5,2" ${S(m, 1.4)}/>`,
  coil: (m) => `<path d="M50,50m-4,0a4,4 0 1,1 8,0a10,10 0 1,1 -20,0a16,16 0 1,1 32,0a22,22 0 1,1 -44,0" ${S(m, 4)}/><path d="M28,50l-4,-6l8,0Z" ${F(m)}/>`,
  dragon: (m) => `${M.coil(m, '', () => 0)}<path d="M26,44l-4,-8M30,42l2,-8" ${S(m, 2)}/>`,
  featherSerpent: (m) => `${M.serpent(m, '', () => 0)}${[[36, 50], [44, 46], [50, 38]].map(([x, y]) => `<path d="M${x},${y}q-8,-8 -4,-14" ${S(m, 2)}/>`).join('')}`,
  staff: (m) => `<path d="M50,22V80" ${S(m, 3.4)}/><path d="M50,72Q38,66 50,60Q62,54 50,48Q38,42 50,36Q58,32 54,26" ${S(m, 3)}/>`,
  wolf: (m, bg) => `<path d="M32,26L42,40H58L68,26L70,46Q66,64 50,76Q34,64 30,46Z" ${F(m)}/><path d="M40,48l5,2M60,48l-5,2" stroke="${bg}" stroke-width="2.6"/><path d="M46,64H54L50,70Z" ${F(bg)}/>`,
  cat: (m, bg) => `${M.wolf(m, bg, () => 0)}<path d="M38,58l-6,-2M38,62l-6,2M62,58l6,-2M62,62l6,2" ${S(bg, 1.4)}/>`,
  paw: (m) => `<ellipse cx="50" cy="60" rx="14" ry="12" ${F(m)}/>${[[34, 44], [44, 36], [56, 36], [66, 44]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="6" ${F(m)}/>`).join('')}`,
  stag: (m) => `<path d="M42,46Q30,34 32,20M34,32l-8,-4M33,25l-7,0M58,46Q70,34 68,20M66,32l8,-4M67,25l7,0" ${S(m, 2.8)}/><path d="M42,44H58L56,62L50,74L44,62Z" ${F(m)}/>`,
  horse: (m, bg) => `<path d="M40,76L42,56Q34,48 38,36Q44,24 58,26L66,22L64,30Q72,44 62,48L56,46L54,56L60,76Z" ${F(m)}/><circle cx="56" cy="34" r="2" ${F(bg)}/>`,
  bull: (m, bg) => `${M.horns(m, bg, () => 0)}<circle cx="45" cy="56" r="2" ${F(bg)}/><circle cx="55" cy="56" r="2" ${F(bg)}/>`,
  fish: (m, bg) => `<path d="M24,50Q44,30 64,50Q44,70 24,50Z" ${F(m)}/><path d="M62,50L78,38V62Z" ${F(m)}/><circle cx="34" cy="48" r="2" ${F(bg)}/>`,
  twinFish: (m) => `<g transform="translate(0,-12) scale(1,0.8) translate(0,8)">${M.fish(m, 'none', () => 0)}</g><g transform="rotate(180 50 50) translate(0,-12) scale(1,0.8) translate(0,8)">${M.fish(m, 'none', () => 0)}</g>`,
  skull: (m, bg) => `<path d="M32,46Q32,24 50,24Q68,24 68,46Q68,56 62,58V68H38V58Q32,56 32,46Z" ${F(m)}/><circle cx="43" cy="46" r="5" ${F(bg)}/><circle cx="57" cy="46" r="5" ${F(bg)}/><path d="M44,62V68M50,62V68M56,62V68" stroke="${bg}" stroke-width="2"/>`,
  ship: (m) => `<path d="M22,58H78Q72,72 50,72Q28,72 22,58Z" ${F(m)}/><path d="M22,58Q18,48 24,44M78,58Q82,48 76,44M50,58V26" ${S(m, 3)}/><path d="M50,28L68,38L50,48Z" ${F(m)}/>`,
  lyre: (m) => `<path d="M36,72Q30,40 36,26M64,72Q70,40 64,26M36,72H64M34,32H66" ${S(m, 3.4)}/><path d="M44,32V72M50,32V72M56,32V72" ${S(m, 1.4)}/>`,
  box: (m, bg) => `<path d="M32,44L50,32L68,44V70H32Z" ${F(m)}/><path d="M50,48V64M43,54H57" stroke="${bg}" stroke-width="3"/>`,
  talisman: (m, bg) => `<rect x="38" y="22" width="24" height="56" ${F(m)}/>${[32, 42, 52, 62].map((y) => `<path d="M44,${y}h12" stroke="${bg}" stroke-width="2.4"/>`).join('')}<circle cx="50" cy="70" r="3" ${F(bg)}/>`,
  maize: (m, bg) => `<path d="M42,30Q50,20 58,30V64Q50,72 42,64Z" ${F(m)}/>${[36, 44, 52, 60].map((y) => `<path d="M44,${y}h12" stroke="${bg}" stroke-width="1.6"/>`).join('')}<path d="M42,64Q30,58 28,44M58,64Q70,58 72,44" ${S(m, 2.6)}/>`,
  beard: (m, bg) => `<path d="M32,32H68V44Q68,64 50,78Q32,64 32,44Z" ${F(m)}/><path d="M44,48V66M50,48V72M56,48V66" stroke="${bg}" stroke-width="2"/><path d="M40,38H60" stroke="${bg}" stroke-width="3"/>`,
  rune: (m) => `<path d="M42,24V76M42,32L60,44M42,46L60,58" ${S(m, 4)}/>`,
  callipers: (m) => `<path d="M50,24L36,74M50,24L64,74M42,52H58" ${S(m, 3.4)}/><circle cx="50" cy="24" r="4" ${F(m)}/>`,
  harp: (m) => `<path d="M34,76V26Q56,22 66,42Q68,60 34,76" ${S(m, 3.4)}/><path d="M40,32V72M46,32V68M52,34V64M58,38V58" ${S(m, 1.3)}/>`,
  pool: (m) => `<ellipse cx="50" cy="62" rx="24" ry="8" ${S(m, 3)}/>${Array.from({ length: 8 }, (_, k) => `<circle cx="${30 + k * 6}" cy="${34 + Math.sin(k) * 6}" r="2.2" ${F(m)}/>`).join('')}`,
  crown: (m) => `<path d="M30,64L28,36L40,48L50,30L60,48L72,36L70,64Z" ${F(m)}/><path d="M28,72H72" ${S(m, 3)}/>`,
  thorns: (m) => `<circle cx="50" cy="50" r="18" ${S(m, 3)}/>${Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2;
    return `<path d="M${f1(50 + Math.cos(a) * 18)},${f1(50 + Math.sin(a) * 18)}L${f1(50 + Math.cos(a + 0.2) * 26)},${f1(50 + Math.sin(a + 0.2) * 26)}" ${S(m, 2)}/>`;
  }).join('')}`,
  helmet: (m, bg) => `<path d="M32,62Q30,36 50,34Q70,36 68,62Z" ${F(m)}/><path d="M50,40V62" stroke="${bg}" stroke-width="2.4"/><path d="M34,46Q20,36 24,22M66,46Q80,36 76,22" ${S(m, 4)}/>`,
  hand: (m) => `<path d="M36,74V48Q36,42 40,44V30Q44,26 46,30V44V24Q50,20 52,24V44V28Q56,24 58,28V48Q62,40 66,44L58,64Q56,74 50,74Z" ${F(m)}/>`,
  bolt: (m) => `<path d="M56,20L36,52H50L42,80L66,44H52L62,20Z" ${F(m)}/>`,
  eye: (m, bg) => `<path d="M22,50Q50,24 78,50Q50,76 22,50Z" ${F(m)}/><circle cx="50" cy="50" r="10" ${F(bg)}/><circle cx="50" cy="50" r="5" ${F(m)}/>`,
};

/** The motif for a symbol's English name (the symbols of faiths.ts), else one for the archetype. */
const MOTIF_OF: [RegExp, string][] = [
  [/thunderbolt/, 'bolt'], [/rising sun/, 'rising'], [/sunburst/, 'peakSun'], [/sun/, 'sun'], [/crescent moon and star/, 'crescentStar'], [/crescent/, 'crescent'], [/eight stars/, 'pool'], [/star-tile|geometric star/, 'star8'], [/star/, 'star'],
  [/stepped cross/, 'stepCross'], [/crown of thorns/, 'thorns'], [/cross/, 'cross'], [/medicine wheel/, 'medicine'], [/wheel/, 'wheel'], [/tree|oak/, 'tree'], [/acorn/, 'acorn'],
  [/leaf|laurel|palm|mistletoe|pine bough/, 'leaf'], [/blossom/, 'blossom'], [/lotus/, 'lotus'], [/pomegranate/, 'fruit'], [/anvil/, 'anvil'], [/pickaxe/, 'pick'], [/hammer/, 'hammer'],
  [/axe/, 'axe'], [/burning sword/, 'flameSword'], [/scimitar|obsidian blade/, 'scimitar'], [/sword/, 'sword'], [/spear/, 'spear'], [/bow/, 'bow'], [/trident/, 'trident'], [/key/, 'key'], [/lock/, 'lock'],
  [/open book/, 'book'], [/jade tablet/, 'tablet'], [/brush|scroll/, 'scroll'], [/chalice/, 'bloodCup'], [/cup/, 'cup'], [/cauldron/, 'cauldron'], [/vial/, 'vial'], [/water vessel/, 'vessel'],
  [/lamp/, 'lamp'], [/hearth-fire/, 'lamp'], [/bell/, 'bell'], [/drum/, 'drum'], [/smoking mirror/, 'smokeMirror'], [/mirror/, 'mirror'], [/mask/, 'mask'], [/horned helmet/, 'helmet'], [/horned bull/, 'bull'],
  [/horn/, 'horn'], [/three clouds|clouds/, 'clouds'], [/mountain/, 'mountain'], [/gateway/, 'gate'], [/pagoda/, 'pagoda'], [/minaret/, 'tower'], [/valknut/i, 'valknut'], [/triskele/, 'triskele'],
  [/comma/, 'tomoe'], [/knot|vine ring/, 'knot'], [/seal/, 'seal'], [/quetzal|feathered serpent/, 'featherSerpent'], [/feather/, 'feather'], [/dreamcatcher/, 'dreamcatcher'], [/pipe/, 'pipe'],
  [/dove|swan|crane/, 'dove'], [/thunderbird|eagle|falcon|condor|owl|raven on a skull|raven|bird/, 'bird'], [/skull/, 'skull'], [/serpent staff/, 'staff'], [/coiled dragon|dragon/, 'dragon'],
  [/coiled rattlesnake|coiled/, 'coil'], [/serpent|snake/, 'serpent'], [/fox|wolf/, 'wolf'], [/jaguar|tiger|puma/, 'cat'], [/paw/, 'paw'], [/stag/, 'stag'], [/horse|llama/, 'horse'], [/lamb/, 'horns'],
  [/twin fish/, 'twinFish'], [/salmon|fish/, 'fish'], [/longship/, 'ship'], [/lyre/, 'lyre'], [/harp/, 'harp'], [/reliquary/, 'box'], [/talisman/, 'talisman'], [/maize/, 'maize'], [/beard/, 'beard'],
  [/rune/, 'rune'], [/thunderbolt/, 'bolt'], [/callipers/, 'callipers'], [/sickle/, 'crescent'],
];
const FAMILY_MOTIF: Record<FaithFamily, string> = {
  church: 'cross', crescent: 'crescentStar', pantheon: 'leaf', oldgods: 'valknut', druid: 'triskele', stars: 'star', ancestors: 'hammer', sky: 'sun', heaven: 'clouds', kami: 'tomoe',
  spirits: 'feather', sun: 'sun', serpent: 'featherSerpent',
};
export function motifOf(f: Faith): string {
  for (const [re, k] of MOTIF_OF) if (re.test(f.symbol)) return k;
  return FAMILY_MOTIF[f.family];
}

// ---- Frames and tenet marks ----------------------------------------------------------------------------

function frame(kind: string, m: string, n: number, r: Rng, letters: string): string {
  switch (kind) {
    case 'rays': return Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return `<path d="M${f1(50 + Math.cos(a) * 37)},${f1(50 + Math.sin(a) * 37)}L${f1(50 + Math.cos(a) * (k % 2 ? 41 : 43))},${f1(50 + Math.sin(a) * (k % 2 ? 41 : 43))}" ${S(m, 1.6)}/>`;
    }).join('');
    case 'dots': return Array.from({ length: Math.max(3, n) }, (_, k) => {
      const a = -Math.PI / 2 + (k / Math.max(3, n)) * Math.PI * 2;
      return `<circle cx="${f1(50 + Math.cos(a) * 39)}" cy="${f1(50 + Math.sin(a) * 39)}" r="2.4" ${F(m)}/>`;
    }).join('');
    case 'double': return `<circle cx="50" cy="50" r="38" ${S(m, 1.2)}/><circle cx="50" cy="50" r="41" ${S(m, 1.2)}/>`;
    case 'knot': return `<circle cx="50" cy="50" r="39" ${S(m, 2.4)} stroke-dasharray="7 3"/><circle cx="50" cy="50" r="42" ${S(m, 1)}/>`;
    case 'star8': return `<polygon points="${star(8, 43, 37)}" ${S(m, 1.4)}/>`;
    case 'laurel': return [-1, 1].map((s) => Array.from({ length: 8 }, (_, k) => {
      const a = Math.PI / 2 + s * (0.35 + k * 0.32);
      const x = 50 + Math.cos(a) * 39, y = 50 + Math.sin(a) * 39;
      return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="3.6" ry="1.6" transform="rotate(${f1((a * 180) / Math.PI + s * 60)} ${f1(x)} ${f1(y)})" ${F(m)}/>`;
    }).join('')).join('');
    case 'feathers': return Array.from({ length: 4 }, (_, k) => {
      const a = Math.PI / 4 + (k / 4) * Math.PI * 2;
      const x = 50 + Math.cos(a) * 40, y = 50 + Math.sin(a) * 40;
      return `<path d="M${f1(x)},${f1(y)}l${f1(Math.cos(a) * 9)},${f1(Math.sin(a) * 9)}" ${S(m, 3)}/>`;
    }).join('');
    case 'step': return `<rect x="16" y="16" width="68" height="68" ${S(m, 1.2)}/>`;
    case 'runes': return letters;
    default: return '';
  }
}
function tenetMark(f: Faith, m: string): string {
  const t = f.tenets;
  if (t.includes('holyWar')) return `<path d="M30,30L70,70M70,30L30,70" ${S(m, 2)} opacity="0.85"/><path d="M27,35l8,-8M65,27l8,8" ${S(m, 2.4)}/>`;
  if (t.includes('astrology')) return [[30, 30], [70, 30], [30, 70], [70, 70]].map(([x, y]) => `<polygon points="${star(4, 4, 1.4, x, y)}" ${F(m)}/>`).join('');
  if (t.includes('sacredWaters')) return `<path d="M32,78q4,-3 8,0t8,0t8,0t8,0" ${S(m, 1.6)}/>`;
  if (t.includes('pacifism')) return `<path d="M30,76Q50,86 70,76" ${S(m, 1.6)}/>${[36, 44, 56, 64].map((x) => `<ellipse cx="${x}" cy="${x < 50 ? 77 + (x - 30) * 0.1 : 77 + (70 - x) * 0.1}" rx="2.6" ry="1.2" ${F(m)}/>`).join('')}`;
  if (t.includes('sacredGroves')) return [32, 68].map((x) => `<path d="M${x},74q-4,-4 0,-8q4,4 0,8Z" ${F(m)}/>`).join('');
  return '';
}

/** The faith's emblem as an SVG, `size` pixels across. `letters` draws the faith's name in its script around the frame (SVG markup in the 100 box, in the given ink). */
export function emblemSvg(f: Faith, size = 96, letters?: (ink: string) => string): string {
  const r = mulberry32(hashString(`emblem#${f.id}#${f.name}#${f.symbol}`));
  const [fields, metals] = COLOURS[f.family];
  const fieldName = pick(r, fields);
  let metalName = pick(r, metals);
  if (fieldName === 'argent' && metalName === 'argent') metalName = 'gules';
  const bg = TINCTURE[fieldName], m = METAL[metalName];
  const shape = pick(r, SHAPE[f.family]);
  let fr = pick(r, FRAME[f.family]);
  if (fr === 'runes' && !letters) fr = 'double';
  const ring = fr === 'runes' && letters ? letters(m) : '';
  const motif = M[motifOf(f)] ?? M.star;
  const edge = fieldName === 'argent' ? '#8b8478' : m;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><g fill="${bg}" stroke="${edge}" stroke-width="2.4">${fieldShape(shape, 46)}</g>${frame(fr, m, f.deities.length, r, ring)}${tenetMark(f, m)}${motif(m, bg, r)}</svg>`;
}
