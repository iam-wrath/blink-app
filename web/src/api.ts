import type { FrameQuery, FramesResponse, Target } from './types';

// Where the Blink API lives (set VITE_API_URL in web/.env, then restart `npm run dev`).
// `npm run dev` defaults to http://localhost:3000/api.
// Production builds default to /api on the site's own domain (Vercel or nginx pass it on to the API).
export const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000/api' : '/api')).replace(/\/$/, '');

async function call<T>(path: string, timeoutMs = 6000): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// PNG paths in the contract are relative to the API origin (the API serves /data/).
const API_ORIGIN = new URL(API_URL, window.location.href).origin;
export const pngUrl = (png: string) => (/^https?:\/\//.test(png) ? png : `${API_ORIGIN}/${png.replace(/^\/+/, '')}`);

export const getTargets = () => call<Target[]>('/targets');

// Live IRSA searches can be slow: wait a little longer than the API's own 5-minute limit.
export async function getFrames(q: FrameQuery): Promise<FramesResponse> {
  const qs = new URLSearchParams({ ra: String(q.ra), dec: String(q.dec), fov: String(q.fov), detector: q.detector, mode: q.mode, coadd: q.coadd });
  let res: Response;
  try {
    res = await fetch(`${API_URL}/frames?${qs}`, { signal: AbortSignal.timeout(330_000) });
  } catch (e) {
    throw new Error((e as Error).name === 'TimeoutError' ? 'The search timed out. Try a smaller field of view.' : `Cannot reach the API at ${API_URL}.`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `The API returned an error (${res.status}).`);
  }
  const data = (await res.json()) as FramesResponse;
  return { ...data, frames: [...data.frames].sort((a, b) => a.obsTime.localeCompare(b.obsTime)) };
}
