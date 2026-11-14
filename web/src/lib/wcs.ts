import type { Candidate } from '../types';

// Approximate pixel -> sky mapping, fitted from the candidates' own (x, y) and (RA, Dec).
// Over a small patch of sky a flat (affine) fit is close enough for a cursor readout.
// Shown with "≈" in the UI. Returns null if there are not enough points.
export interface SkyFit {
  ra: [number, number, number];
  dec: [number, number, number];
}

function solve3(m: number[][], r: number[]): [number, number, number] | null {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return null;
  const out = [0, 1, 2].map((col) => det(m.map((row, i) => row.map((v, j) => (j === col ? r[i] : v)))) / d);
  return out as [number, number, number];
}

export function fitSky(cs: Candidate[]): SkyFit | null {
  if (cs.length < 3) return null;
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rr = [0, 0, 0];
  const rd = [0, 0, 0];
  for (const c of cs) {
    const v = [c.x, c.y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += v[i] * v[j];
      rr[i] += v[i] * c.ra;
      rd[i] += v[i] * c.dec;
    }
  }
  const ra = solve3(m, rr);
  const dec = solve3(m, rd);
  return ra && dec ? { ra, dec } : null;
}

export function skyAt(f: SkyFit, x: number, y: number) {
  return { ra: f.ra[0] * x + f.ra[1] * y + f.ra[2], dec: f.dec[0] * x + f.dec[1] * y + f.dec[2] };
}

export function raHms(deg: number) {
  let h = (((deg % 360) + 360) % 360) / 15;
  const hh = Math.floor(h);
  h = (h - hh) * 60;
  const mm = Math.floor(h);
  const ss = (h - mm) * 60;
  return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m ${ss.toFixed(1).padStart(4, '0')}s`;
}

export function decDms(deg: number) {
  const sign = deg < 0 ? '−' : '+';
  let d = Math.abs(deg);
  const dd = Math.floor(d);
  d = (d - dd) * 60;
  const mm = Math.floor(d);
  const ss = (d - mm) * 60;
  return `${sign}${String(dd).padStart(2, '0')}° ${String(mm).padStart(2, '0')}′ ${ss.toFixed(0).padStart(2, '0')}″`;
}
