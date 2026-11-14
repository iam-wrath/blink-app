// Simulated sky used for the demo targets and Sky Explorer.
// A moving asteroid, a drifting nearby star and a brightening star are placed
// in a field of fixed stars, over 8 visits, so the tools have something to find.

export const DATES = ['2025-08-12', '2025-09-30', '2025-11-18', '2026-01-09', '2026-02-27', '2026-04-15', '2026-06-03', '2026-07-21'];
export const WL = [1.1, 1.11, 1.1, 1.45, 1.11, 1.1, 1.12, 1.11];
export const MON = ['Aug ’25', 'Sep ’25', 'Nov ’25', 'Jan ’26', 'Feb ’26', 'Apr ’26', 'Jun ’26', 'Jul ’26'];
export const N = 1024; // simulated image size in pixels
export const PX = 2.9; // arcseconds per pixel

export interface SimTarget {
  key: string;
  n: string;
  ra: number | null;
  dec: number | null;
  seed: number;
}

export const TARGETS: SimTarget[] = [
  { key: 'm42', n: 'Orion Nebula (M42)', ra: 83.8221, dec: -5.3911, seed: 42 },
  { key: 'm31', n: 'Andromeda Galaxy (M31)', ra: 10.6847, dec: 41.2687, seed: 31 },
  { key: 'tr', n: 'TRAPPIST-1', ra: 346.6224, dec: -5.0414, seed: 7 },
];

export function customTarget(name: string): SimTarget {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return { key: 'custom:' + name, n: name.slice(0, 40), ra: null, dec: null, seed: h + 1 };
}

export function rng(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pt {
  x: number;
  y: number;
}
interface SkyCfg {
  stars: { x: number; y: number; s: number; o: number }[];
  ast: { x0: number; y0: number; x1: number; y1: number };
  near: { x: number; y: number; dx: number; dy: number };
  vari: Pt;
}

const cache = new Map<number, SkyCfg>();
export function skyOf(seed: number): SkyCfg {
  const hit = cache.get(seed);
  if (hit) return hit;
  const r = rng(seed * 7 + 3);
  const stars = [];
  for (let i = 0; i < 110; i++) {
    const k = r();
    stars.push({ x: 8 + r() * 1008, y: 8 + r() * 1008, s: k > 0.93 ? 11 : k > 0.7 ? 7 : 5, o: 0.35 + r() * 0.65 });
  }
  const sg = () => (r() < 0.5 ? 1 : -1);
  const cfg: SkyCfg = {
    stars,
    ast: { x0: 60 + r() * 120, y0: 720 + r() * 200, x1: 800 + r() * 150, y1: 60 + r() * 160 },
    near: { x: 260 + r() * 480, y: 220 + r() * 480, dx: sg() * (8 + r() * 4), dy: sg() * (4 + r() * 4) },
    vari: { x: 90 + r() * 840, y: 90 + r() * 840 },
  };
  cache.set(seed, cfg);
  return cfg;
}

export function posAt(seed: number, f: number) {
  const o = skyOf(seed);
  const u = f / 7;
  return {
    ast: { x: o.ast.x0 + (o.ast.x1 - o.ast.x0) * u, y: o.ast.y0 + (o.ast.y1 - o.ast.y0) * u },
    near: { x: o.near.x + o.near.dx * f, y: o.near.y + o.near.dy * f },
    vari: { x: o.vari.x, y: o.vari.y, b: 0.15 + 0.85 * Math.max(0, (f - 2) / 5) },
  };
}

export interface Dot {
  l: number; // percent
  t: number;
  s: number; // px
  o: number;
  b: number; // blur px
}

export function frame(seed: number, f: number): Dot[] {
  const o = skyOf(seed);
  const p = posAt(seed, f);
  const pc = (v: number) => (v / N) * 100;
  const list: Dot[] = o.stars.map((s) => ({ l: pc(s.x), t: pc(s.y), s: s.s, o: s.o, b: s.s > 9 ? 1.6 : 1 }));
  list.push({ l: pc(p.ast.x), t: pc(p.ast.y), s: 9, o: 0.95, b: 1.2 });
  list.push({ l: pc(p.near.x), t: pc(p.near.y), s: 11, o: 1, b: 1.4 });
  list.push({ l: pc(p.vari.x), t: pc(p.vari.y), s: 10, o: p.vari.b, b: 1.3 });
  return list;
}

export function level(seed: number, f: number, x: number, y: number) {
  const o = skyOf(seed);
  const p = posAt(seed, f);
  let v = 22 + (((Math.sin(x * 12.9898 + y * 78.233 + f) * 43758.5453) % 1) + 1) * 2;
  const add = (px: number, py: number, a: number) => {
    const d2 = (px - x) ** 2 + (py - y) ** 2;
    if (d2 < 400) v += a * Math.exp(-d2 / 18);
  };
  o.stars.forEach((s) => add(s.x, s.y, s.o * 230));
  add(p.ast.x, p.ast.y, 190);
  add(p.near.x, p.near.y, 230);
  add(p.vari.x, p.vari.y, 30 + 225 * Math.max(0, (f - 2) / 5));
  return Math.min(255, Math.max(0, v));
}

export type EvType = 'move' | 'rise' | 'fade' | 'art';
export interface Ev {
  t: EvType;
  s?: Pt; // start (movers)
  e: Pt; // end / position
  k: number; // strength in levels
  ar: number; // area in px
}

export function detect(seed: number, a: number, b: number, th: number, withArt: boolean): Ev[] {
  if (a === b) return [];
  const pa = posAt(seed, a);
  const pb = posAt(seed, b);
  const out: Ev[] = [{ t: 'move', s: pa.ast, e: pb.ast, k: 190, ar: 34 }];
  if (Math.hypot(pb.near.x - pa.near.x, pb.near.y - pa.near.y) > 6) out.push({ t: 'move', s: pa.near, e: pb.near, k: 230, ar: 40 });
  const dv = 225 * (pb.vari.b - pa.vari.b);
  if (Math.abs(dv) > th) out.push({ t: dv > 0 ? 'rise' : 'fade', e: pb.vari, k: Math.abs(dv), ar: 26 });
  const r = rng(seed + a * 13 + b * 7);
  for (let i = 0; i < 4; i++) {
    const k = 14 + r() * 36;
    const x = 40 + r() * 940;
    const y = 40 + r() * 940;
    if (k > th && withArt) out.push({ t: 'art', e: { x, y }, k, ar: 6 });
  }
  return out;
}

export const days = (a: number, b: number) => Math.abs(Math.round((+new Date(DATES[b]) - +new Date(DATES[a])) / 864e5));

// ---- coordinates ----
export function hms(d: number, signed: boolean) {
  const s = Math.abs(d);
  const a = Math.floor(s);
  const m = Math.floor((s - a) * 60);
  const c = ((s - a) * 60 - m) * 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    (signed ? (d < 0 ? '−' : '+') : '') +
    p(a) +
    (signed ? '° ' : 'h ') +
    p(m) +
    (signed ? '′ ' : 'm ') +
    (signed ? p(Math.round(c)) : c.toFixed(1).padStart(4, '0')) +
    (signed ? '″' : 's')
  );
}

export function simSky(tg: SimTarget, x: number, y: number) {
  if (tg.ra == null || tg.dec == null) return null;
  return {
    ra: (((tg.ra - ((x - N / 2) * PX) / 3600 / Math.cos((tg.dec * Math.PI) / 180)) % 360) + 360) % 360,
    dec: tg.dec - ((y - N / 2) * PX) / 3600,
  };
}

export function galactic(a: number, d: number): [number, number] {
  const R = Math.PI / 180;
  const ap = 192.85948 * R;
  const dp = 27.12825 * R;
  const al = a * R;
  const de = d * R;
  const sb = Math.sin(de) * Math.sin(dp) + Math.cos(de) * Math.cos(dp) * Math.cos(al - ap);
  const l = 122.93192 * R - Math.atan2(Math.cos(de) * Math.sin(al - ap), Math.sin(de) * Math.cos(dp) - Math.cos(de) * Math.sin(dp) * Math.cos(al - ap));
  return [(((l / R) % 360) + 360) % 360, Math.asin(sb) / R];
}

export function ecliptic(a: number, d: number): [number, number] {
  const R = Math.PI / 180;
  const e = 23.4392911 * R;
  const al = a * R;
  const de = d * R;
  return [
    (((Math.atan2(Math.sin(al) * Math.cos(de) * Math.cos(e) + Math.sin(de) * Math.sin(e), Math.cos(al) * Math.cos(de)) / R) % 360) + 360) % 360,
    Math.asin(Math.sin(de) * Math.cos(e) - Math.cos(de) * Math.sin(e) * Math.sin(al)) / R,
  ];
}

export function lcPath(vals: number[]) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const n = Math.max(1, vals.length - 1);
  return vals.map((t, j) => (j ? 'L' : 'M') + ((j / n) * 196 + 2).toFixed(1) + ',' + (46 - ((t - lo) / Math.max(1, hi - lo)) * 40).toFixed(1)).join(' ');
}
