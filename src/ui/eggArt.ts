import type { EggId } from '../data/pets';

/**
 * Hand-built SVG art for the 12 eggs (drawn for this project after the owner's egg sheet).
 * Each egg: a gradient shell, decorations clipped to the shell, a dark ink outline, a shine,
 * then front pieces (leaves, coral, clouds, crystals...) around the base and on top.
 * viewBox 0 0 120 140; the shell spans y 16–126.
 */
const INK = '#1b2238';
const SHELL = 'M60 16C86 16 100 56 100 84C100 108 82 126 60 126C38 126 20 108 20 84C20 56 34 16 60 16Z';
let uid = 0;

const leaf = (x: number, y: number, len: number, w: number, a: number, fill: string, stroke = true) =>
  `<path d="M0 0Q${w} ${-len / 2} 0 ${-len}Q${-w} ${-len / 2} 0 0Z" transform="translate(${x} ${y}) rotate(${a})" fill="${fill}"${stroke ? ` stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"` : ''}/>`;

function starPts(cx: number, cy: number, r: number, inner: number, n = 5, rot = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
}
const star = (cx: number, cy: number, r: number, fill = '#ffd24a', inner = 0.46, n = 5) =>
  `<polygon points="${starPts(cx, cy, r, inner, n)}" fill="${fill}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
const spark = (cx: number, cy: number, r: number, fill = '#ffd24a') => star(cx, cy, r, fill, 0.32, 4);
/** Ink-outlined thick stroke path (outline first, colour on top). */
const inked = (d: string, color: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 4}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A rough rock/shard polygon around (cx, cy). */
function rock(cx: number, cy: number, r: number, fill: string, seed: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    const rr = r * (0.82 + 0.18 * Math.sin(seed * 7 + i * 2.3));
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr * 0.85).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
}
/** Tall crystal shard standing at (x, y), leaning by angle a. */
const shard = (x: number, y: number, h: number, w: number, a: number, fill: string, light = '#ffffff') =>
  `<g transform="translate(${x} ${y}) rotate(${a})"><polygon points="${-w},0 ${-w * 0.8},${-h * 0.7} 0,${-h} ${w * 0.8},${-h * 0.7} ${w},0" fill="${fill}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><polygon points="${-w * 0.25},${-h * 0.15} 0,${-h * 0.92} ${w * 0.3},${-h * 0.6}" fill="${light}" opacity=".45"/></g>`;
const flower = (x: number, y: number, r: number, petal: string, centre = '#ffc23d') =>
  [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return `<circle cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="${r * 0.72}" fill="${petal}" stroke="${INK}" stroke-width="2"/>`;
  }).join('') + `<circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="${centre}" stroke="${INK}" stroke-width="2"/>`;
/** Glowing crack line: blurred colour, then bright core. */
const glowLine = (d: string, glow: string, core: string, f: string) =>
  `<path d="${d}" fill="none" stroke="${glow}" stroke-width="9" stroke-linejoin="round" filter="url(#${f})"/><path d="${d}" fill="none" stroke="${glow}" stroke-width="5" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${core}" stroke-width="2" stroke-linejoin="round"/>`;

function spiral(cx: number, cy: number, r: number, turns: number): string {
  const n = 60;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const rr = 2 + (r - 2) * t;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return d;
}

interface Parts {
  colors: [string, string];
  /** Decorations clipped to the shell. */
  inside?: string;
  /** Drawn behind the shell (e.g. side coral). */
  back?: string;
  /** Drawn in front of the outlined shell. */
  front?: string;
}

function design(id: EggId, f: string): Parts {
  switch (id) {
    case 'meadow':
      return {
        colors: ['#efffe0', '#a2dc80'],
        inside: leaf(38, 76, 26, 10, -32, '#73cc5f', false) + leaf(80, 54, 22, 9, 35, '#73cc5f', false) + leaf(72, 102, 24, 10, -12, '#73cc5f', false) + leaf(48, 40, 16, 7, 20, '#8ad673', false),
        front:
          inked('M60 18 Q61 10 60 6', '#4fae4a', 3) + leaf(60, 10, 22, 10, -58, '#5cc24a') + leaf(60, 10, 20, 9, 52, '#73d05a') +
          [[18, 128, -48], [30, 134, -28], [46, 138, -10], [74, 138, 10], [90, 134, 28], [102, 128, 48]].map(([x, y, a], i) => leaf(x, y, 40, 17, a, i % 2 ? '#58c25a' : '#3fa64a')).join('') +
          flower(88, 112, 6.5, '#ffffff'),
      };
    case 'reef':
      return {
        colors: ['#d4fbff', '#2fb8cf'],
        inside:
          `<path d="M10 78 Q25 66 40 78 T70 78 T100 78 T130 78 V102 Q115 92 100 102 T70 102 T40 102 T10 102Z" fill="#1f8fb0"/>` +
          `<path d="M36 90 a7 7 0 1 1 7 7" fill="none" stroke="#bff4ff" stroke-width="3" stroke-linecap="round"/><path d="M76 86 a6 6 0 1 1 6 6" fill="none" stroke="#bff4ff" stroke-width="3" stroke-linecap="round"/>` +
          `<circle cx="70" cy="36" r="5" fill="#e6fdff" opacity=".8"/><circle cx="52" cy="30" r="3" fill="#e6fdff" opacity=".8"/><circle cx="84" cy="50" r="3.5" fill="#e6fdff" opacity=".8"/><circle cx="40" cy="58" r="2.5" fill="#e6fdff" opacity=".8"/>`,
        front:
          inked('M20 134 L20 104 M20 116 L10 100 M20 108 L30 92 M10 100 L7 90 M30 92 L28 82 M20 104 L14 94', '#ff7a6b', 4.5) +
          inked('M100 134 L100 104 M100 116 L110 100 M100 108 L90 92 M110 100 L113 90 M90 92 L92 82 M100 104 L106 94', '#ff7a6b', 4.5) +
          `<path d="M40 134 Q38 112 60 104 Q82 112 80 134 Z" fill="#fff1d6" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/><path d="M60 107 L48 133 M60 107 L55 133 M60 107 L60 133 M60 107 L65 133 M60 107 L72 133" stroke="#d9b07a" stroke-width="2"/><rect x="54" y="130" width="12" height="6" rx="2" fill="#f2d5a8" stroke="${INK}" stroke-width="2"/>`,
      };
    case 'star':
      return {
        colors: ['#d9ccff', '#6a4fd8'],
        inside:
          `<path d="M10 104 Q35 92 55 104 T110 100 V140 H10Z" fill="#4a35a8"/>` +
          `<path d="M16 92 Q60 130 104 92 Q60 118 16 92Z" fill="#ffd24a" stroke="${INK}" stroke-width="2.5"/>`,
        front: star(60, 70, 19) + spark(34, 52, 6) + spark(86, 46, 6) + spark(84, 96, 5) + spark(37, 92, 4.5) + star(60, 10, 10),
      };
    case 'blossom':
      return {
        colors: ['#fff0f5', '#ff9fc0'],
        inside: leaf(44, 80, 26, 9, -18, '#ffd6e4', false) + leaf(76, 78, 26, 9, 18, '#ffd6e4', false) + leaf(60, 70, 28, 9, 0, '#ffe6ee', false),
        front:
          [[-66, 50], [66, 50], [-42, 52], [42, 52]].map(([a, l]) => leaf(60, 136, l, 24, a, '#ff8fb5')).join('') +
          [[-21, 50], [21, 50], [0, 52]].map(([a, l]) => leaf(60, 136, l, 24, a, '#ffc2d6')).join('') +
          leaf(16, 126, 16, 6, -70, '#5cbf5a') + leaf(104, 126, 16, 6, 70, '#5cbf5a') +
          leaf(48, 16, 12, 5, -70, '#5cbf5a') + leaf(72, 16, 12, 5, 70, '#5cbf5a') + flower(60, 12, 7, '#ffb3cc', '#ffd24a'),
      };
    case 'ember':
      return {
        colors: ['#7a625e', '#33272a'],
        inside:
          glowLine('M10 74 L28 62 L42 78 L60 60 L78 78 L92 62 L110 74', '#ff7a1a', '#ffe08a', f) +
          glowLine('M10 100 L26 92 L42 104 L58 92 L74 106 L90 94 L110 102', '#ff7a1a', '#ffe08a', f) +
          `<path d="M28 40 L40 50 M84 36 L74 48" stroke="#ff7a1a" stroke-width="3" opacity=".7"/>`,
        front:
          `<ellipse cx="60" cy="122" rx="44" ry="12" fill="#ff7a1a" filter="url(#${f})" opacity=".8"/>` +
          [[22, 116, 12, 1], [38, 126, 13, 2], [60, 130, 14, 3], [82, 126, 13, 4], [98, 116, 12, 5], [30, 106, 9, 6], [90, 106, 9, 7]].map(([x, y, r, s]) => rock(x, y, r, s % 2 ? '#4a3a38' : '#5a4745', s)).join('') +
          `<path d="M58 0 C64 10 76 14 74 26 C80 22 82 16 80 10 C90 22 86 36 72 40 H48 C36 36 34 24 42 16 C42 22 46 26 50 26 C46 16 52 8 58 0Z" fill="#ff7a2a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M60 14 C66 22 70 30 64 38 H54 C50 32 54 22 60 14Z" fill="#ffd24a"/>`,
      };
    case 'frost':
      return {
        colors: ['#f6fbff', '#a8cff7'],
        inside: `<circle cx="34" cy="48" r="3" fill="#ffffff" opacity=".8"/><circle cx="86" cy="58" r="2.5" fill="#ffffff" opacity=".8"/>`,
        front:
          (() => {
            let d = '';
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2;
              const x = 60 + Math.cos(a) * 18;
              const y = 72 + Math.sin(a) * 18;
              const bx = 60 + Math.cos(a) * 11;
              const by = 72 + Math.sin(a) * 11;
              d += `M60 72 L${x.toFixed(1)} ${y.toFixed(1)} M${bx.toFixed(1)} ${by.toFixed(1)} L${(bx + Math.cos(a + 0.9) * 6).toFixed(1)} ${(by + Math.sin(a + 0.9) * 6).toFixed(1)} M${bx.toFixed(1)} ${by.toFixed(1)} L${(bx + Math.cos(a - 0.9) * 6).toFixed(1)} ${(by + Math.sin(a - 0.9) * 6).toFixed(1)} `;
            }
            return inked(d, '#ffffff', 3.5);
          })() +
          spark(30, 58, 4, '#ffffff') +
          [[14, 132, 34, 7, -28, '#bfe3ff'], [28, 136, 40, 8, -14, '#8fc4f5'], [44, 138, 30, 7, -5, '#b9b0ff'], [76, 138, 30, 7, 5, '#bfe3ff'], [92, 136, 40, 8, 14, '#8fc4f5'], [106, 132, 34, 7, 28, '#b9b0ff']].map(([x, y, hh, w, a, c]) => shard(x as number, y as number, hh as number, w as number, a as number, c as string)).join('') +
          shard(48, 26, 18, 5, -22, '#8fc4f5') + shard(72, 26, 18, 5, 22, '#8fc4f5') + shard(60, 24, 24, 6, 0, '#bfe3ff'),
      };
    case 'storm':
      return {
        colors: ['#5a6fbf', '#18214a'],
        inside: `<path d="M24 48 Q40 40 50 50 M70 40 Q84 34 94 46" fill="none" stroke="#7b8fd6" stroke-width="3" opacity=".5" stroke-linecap="round"/>`,
        front:
          `<polygon points="68,36 42,78 57,78 48,112 80,62 64,62 76,36" fill="#ffd24a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
          `<polygon points="14,60 6,76 12,76 8,90 22,72 16,72 20,60" fill="#ffd24a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
          `<polygon points="106,60 98,76 104,76 100,90 114,72 108,72 112,60" fill="#ffd24a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
          (() => {
            const c = [[20, 124, 12], [38, 130, 13], [60, 132, 14], [82, 130, 13], [100, 124, 12], [30, 114, 10], [90, 114, 10], [60, 120, 11]];
            return c.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#c9d1e0" stroke="${INK}" stroke-width="3"/>`).join('') +
              c.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r - 1.6}" fill="#d9e0ec"/>`).join('') +
              `<path d="M30 124 a5 5 0 1 1 5 5 M56 128 a5 5 0 1 1 5 5 M84 124 a5 5 0 1 1 5 5" fill="none" stroke="#9aa6bf" stroke-width="2.4" stroke-linecap="round"/>`;
          })(),
      };
    case 'crystal':
      return {
        colors: ['#c99bff', '#5a2db0'],
        inside:
          `<polygon points="20,60 60,16 60,58" fill="#b27bff"/><polygon points="60,16 100,60 60,58" fill="#8f55f0"/><polygon points="20,60 60,58 40,96" fill="#7a3fe0"/>` +
          `<polygon points="100,60 60,58 80,96" fill="#a46bff"/><polygon points="40,96 60,58 80,96 60,126" fill="#6a30cc"/><polygon points="20,60 40,96 20,110" fill="#9a62f5"/><polygon points="100,60 80,96 100,110" fill="#6a30cc"/>` +
          `<path d="M20 60 L60 58 L100 60 M40 96 L60 58 L80 96 M40 96 L60 126 L80 96" fill="none" stroke="#d9b8ff" stroke-width="1.2" opacity=".6"/>`,
        front:
          `<polygon points="60,50 78,78 60,106 42,78" fill="#ffd24a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
          `<polygon points="60,58 72,78 60,98 48,78" fill="#b98aff" stroke="${INK}" stroke-width="2"/><polygon points="60,58 66,72 54,72" fill="#e9d8ff"/>` +
          [[14, 132, 32, 7, -26, '#8f55f0'], [28, 136, 40, 8, -12, '#6a30cc'], [44, 138, 28, 7, -4, '#a46bff'], [76, 138, 28, 7, 4, '#8f55f0'], [92, 136, 40, 8, 12, '#6a30cc'], [106, 132, 32, 7, 26, '#a46bff']].map(([x, y, hh, w, a, c]) => shard(x as number, y as number, hh as number, w as number, a as number, c as string, '#e9d8ff')).join(''),
      };
    case 'sunken':
      return {
        colors: ['#4fc0b4', '#124f54'],
        inside: inked('M14 102 Q38 92 60 104 Q82 116 106 100', '#e9b13a', 4) + inked('M30 34 Q60 22 90 34', '#e9b13a', 3),
        front:
          inked(spiral(60, 70, 22, 2.4), '#ffcf4a', 5) +
          inked('M14 136 Q4 118 14 104 Q24 90 12 72 Q6 64 12 56', '#3fae5a', 5) + inked('M24 136 Q18 124 24 112 Q30 100 22 90', '#2f8f4a', 4) +
          inked('M106 136 Q116 118 106 104 Q96 90 108 72 Q114 64 108 56', '#3fae5a', 5) + inked('M96 136 Q102 124 96 112 Q90 100 98 90', '#2f8f4a', 4) +
          [[26, 106, 4.5], [94, 110, 4], [82, 124, 3.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f6f2ff" stroke="${INK}" stroke-width="2"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff"/>`).join(''),
      };
    case 'lunar':
      return {
        colors: ['#fefcff', '#c9bbf3'],
        inside: `<path d="M10 104 Q28 94 44 104 T78 102 T112 98 V140 H10Z" fill="#5c45c4"/>` + inked('M10 104 Q28 94 44 104 T78 102 T112 98', '#ffcf4a', 3),
        front:
          `<path d="M70 52 A21 21 0 1 0 70 92 A26 26 0 0 1 70 52Z" fill="#9a7ff0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
          spark(88, 58, 6) + spark(40, 96, 5) + spark(84, 92, 4.5) + spark(36, 50, 4) +
          `<path d="M66 2 A10 10 0 1 0 66 22 A13 13 0 0 1 66 2Z" fill="#ffcf4a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
      };
    case 'solar':
      return {
        colors: ['#fffbf0', '#ffd58a'],
        inside: '',
        front:
          (() => {
            let r = '';
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              const x = 60 + Math.cos(a) * 24;
              const y = 72 + Math.sin(a) * 24;
              r += `<polygon points="${(60 + Math.cos(a - 0.18) * 16).toFixed(1)},${(72 + Math.sin(a - 0.18) * 16).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)} ${(60 + Math.cos(a + 0.18) * 16).toFixed(1)},${(72 + Math.sin(a + 0.18) * 16).toFixed(1)}" fill="#ffb347" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
            }
            return r;
          })() +
          `<circle cx="60" cy="72" r="14" fill="#ff9a2a" stroke="${INK}" stroke-width="3"/><circle cx="55" cy="67" r="4" fill="#ffd27a"/>` +
          [[-62, 44], [62, 44], [-36, 46], [36, 46]].map(([a, l]) => leaf(60, 134, l, 13, a, '#ffb21f')).join('') +
          [[-18, 46], [18, 46], [0, 48]].map(([a, l]) => leaf(60, 134, l, 13, a, '#ffd24a')).join('') +
          `<path d="M38 24 L42 10 L48 20 L54 4 L60 18 L66 4 L72 20 L78 10 L82 24 Q60 16 38 24Z" fill="#ffc23d" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
      };
    case 'rift':
      return {
        colors: ['#5a3f88', '#1a1030'],
        inside:
          glowLine('M10 70 L26 58 L40 74 L58 54 L74 74 L90 58 L110 70', '#ff4fe0', '#ffd6fa', f) +
          glowLine('M12 98 L30 88 L46 102 L62 86 L78 102 L94 90 L110 98', '#ff4fe0', '#ffd6fa', f),
        back:
          `<path d="M44 28 Q26 20 30 0 Q40 14 52 22Z" fill="#c86bff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" filter="url(#${f})" opacity=".8"/>` +
          `<path d="M76 28 Q94 20 90 0 Q80 14 68 22Z" fill="#c86bff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" filter="url(#${f})" opacity=".8"/>`,
        front:
          `<path d="M44 28 Q26 20 30 0 Q40 14 52 22Z" fill="#a44bff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M76 28 Q94 20 90 0 Q80 14 68 22Z" fill="#a44bff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>` +
          `<ellipse cx="60" cy="122" rx="44" ry="12" fill="#ff4fe0" filter="url(#${f})" opacity=".6"/>` +
          [[22, 116, 12, 1], [38, 126, 13, 2], [60, 130, 14, 3], [82, 126, 13, 4], [98, 116, 12, 5], [30, 106, 9, 6], [90, 106, 9, 7]].map(([x, y, r, s]) => rock(x, y, r, s % 2 ? '#2a1d40' : '#3a2858', s)).join(''),
      };
  }
}

/** Full SVG markup for an egg. */
export function eggSvg(id: EggId, cls = ''): string {
  const u = `e${++uid}`;
  const f = `${u}f`;
  const p = design(id, f);
  return (
    `<svg class="egg-svg ${cls}" viewBox="0 0 120 140" aria-hidden="true" focusable="false">` +
    `<defs><radialGradient id="${u}g" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="${p.colors[0]}"/><stop offset="1" stop-color="${p.colors[1]}"/></radialGradient>` +
    `<clipPath id="${u}c"><path d="${SHELL}"/></clipPath><filter id="${f}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter></defs>` +
    `<ellipse cx="60" cy="134" rx="40" ry="5" fill="#000" opacity=".2"/>` +
    (p.back ?? '') +
    `<path d="${SHELL}" fill="url(#${u}g)"/>` +
    `<g clip-path="url(#${u}c)">${p.inside ?? ''}<ellipse cx="88" cy="104" rx="30" ry="40" fill="#000" opacity=".1"/></g>` +
    `<path d="${SHELL}" fill="none" stroke="${INK}" stroke-width="3.5"/>` +
    `<ellipse cx="42" cy="44" rx="6.5" ry="12" fill="#fff" opacity=".6" transform="rotate(-22 42 44)"/>` +
    (p.front ?? '') +
    `</svg>`
  );
}
