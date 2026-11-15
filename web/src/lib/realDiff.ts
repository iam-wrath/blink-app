import { useEffect, useState } from 'react';

// Builds a difference from the team's two real PNGs in the browser:
// signed brightness change per pixel, plus a grey difference picture
// (darker = brighter in B, lighter = fainter in B), like the simulated one.
// Needs the images to be same-origin or sent with CORS headers; otherwise it
// falls back to the API's diff.png (picture only, no numbers).

export interface RealDiff {
  w: number;
  h: number;
  d: Float32Array; // B minus A, in 0..255 levels
  url: string; // difference picture
}

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + src));
    img.src = src;
  });
}

async function build(a: string, b: string): Promise<RealDiff> {
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = ia.naturalWidth;
  const h = ia.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(ia, 0, 0, w, h);
  const da = ctx.getImageData(0, 0, w, h).data;
  ctx.drawImage(ib, 0, 0, w, h);
  const out = ctx.getImageData(0, 0, w, h);
  const db = out.data;
  const d = new Float32Array(w * h);
  for (let i = 0, p = 0; i < db.length; i += 4, p++) {
    const la = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2];
    const lb = 0.299 * db[i] + 0.587 * db[i + 1] + 0.114 * db[i + 2];
    const v = lb - la;
    d[p] = v;
    const g = Math.max(0, Math.min(255, 127 - v * 2));
    db[i] = db[i + 1] = db[i + 2] = g;
    db[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return { w, h, d, url: c.toDataURL('image/png') };
}

export function useRealDiff(a: string | null, b: string | null, fallback: string | null) {
  const [state, setState] = useState<{ key: string; diff: RealDiff | null; url: string | null } | null>(null);
  const key = `${a}|${b}`;
  useEffect(() => {
    if (!a || !b || state?.key === key) return;
    let live = true;
    build(a, b)
      .then((diff) => live && setState({ key, diff, url: diff.url }))
      .catch(() => live && setState({ key, diff: null, url: fallback }));
    return () => {
      live = false;
    };
  }, [a, b, fallback, key, state?.key]);
  if (!a || !b) return { diff: null, url: null, loading: false };
  if (!state || state.key !== key) return { diff: null, url: null, loading: true };
  return { diff: state.diff, url: state.url, loading: false };
}

export function changedFraction(d: RealDiff, th: number) {
  let n = 0;
  for (let i = 0; i < d.d.length; i++) if (Math.abs(d.d[i]) > th) n++;
  return n / d.d.length;
}

export function profile(d: RealDiff, bins = 50) {
  const out = new Array(bins).fill(0);
  for (let y = 0; y < d.h; y += 2) {
    for (let x = 0; x < d.w; x += 2) out[Math.min(bins - 1, Math.floor((x / d.w) * bins))] += Math.abs(d.d[y * d.w + x]);
  }
  return out as number[];
}

export function levelAt(d: RealDiff, x: number, y: number) {
  const i = Math.round(y) * d.w + Math.round(x);
  return d.d[i] ?? 0;
}
