import { useEffect, useState } from 'react';

// Builds a difference picture (B minus A) in the browser.
// Brighter in B = cyan, brighter in A = violet, unchanged = black.
// Works for the sample images. For the API images the server must send CORS headers
// on the PNGs; otherwise we fall back to a diff.png served by the API.
function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

async function compute(a: string, b: string, gain: number) {
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
  for (let i = 0; i < db.length; i += 4) {
    const la = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2];
    const lb = 0.299 * db[i] + 0.587 * db[i + 1] + 0.114 * db[i + 2];
    const t = Math.min(1, (Math.abs(lb - la) * gain) / 255);
    if (lb >= la) {
      db[i] = 0;
      db[i + 1] = 242 * t;
      db[i + 2] = 254 * t;
    } else {
      db[i] = 168 * t;
      db[i + 1] = 85 * t;
      db[i + 2] = 247 * t;
    }
    db[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL('image/png');
}

export function useDiff(a: string, b: string, fallback: string | null, enabled: boolean, gain = 3) {
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);
  const key = `${a}|${b}|${gain}`;
  useEffect(() => {
    if (!enabled || state?.key === key) return;
    let live = true;
    compute(a, b, gain)
      .then((url) => live && setState({ key, url, failed: false }))
      .catch(() => live && setState({ key, url: fallback, failed: !fallback }));
    return () => {
      live = false;
    };
  }, [a, b, gain, enabled, fallback, key, state?.key]);
  if (!state || state.key !== key) return { url: null, loading: enabled, failed: false };
  return { url: state.url, loading: false, failed: state.failed };
}
