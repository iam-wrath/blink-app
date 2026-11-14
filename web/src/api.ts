import type { Candidate, DetectResponse, Source, Status, Summary } from './types';

// ---- Settings (change in web/.env, then restart `npm run dev`) ----
// VITE_API_URL   where Kwaku's API lives. Default: http://localhost:3000/api
//                On different laptops use his address, e.g. http://192.168.1.20:3000/api
// VITE_USE_FAKE  "true" = never call the API, always use the sample data
// VITE_IMAGE_A / VITE_IMAGE_B  override the two image URLs if Kwaku names them differently
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
export const FORCE_FAKE = import.meta.env.VITE_USE_FAKE === 'true';

export function imageUrls(source: Source) {
  if (source === 'fake') return { a: '/fake/a.png', b: '/fake/b.png' };
  return {
    a: import.meta.env.VITE_IMAGE_A ?? `${API_URL}/images/a.png`,
    b: import.meta.env.VITE_IMAGE_B ?? `${API_URL}/images/b.png`,
  };
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 6000): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---- Normalising: accept the contract shape, and also the database shape
// (knownName / knownSepArc, or a bare array), so the UI doesn't break if
// the API switches from the fake JSON to the database.
/* eslint-disable @typescript-eslint/no-explicit-any */
function toStatus(v: any): Status {
  return v === 'confirmed' || v === 'rejected' ? v : 'pending';
}

function toCandidate(c: any): Candidate {
  const known =
    c.knownMatch ??
    (c.knownName ? { name: String(c.knownName), separationArcsec: Number(c.knownSepArc ?? 0) } : null);
  return {
    id: String(c.id),
    x: Number(c.x),
    y: Number(c.y),
    ra: Number(c.ra),
    dec: Number(c.dec),
    fluxDiff: Number(c.fluxDiff ?? 0),
    confidence: Number(c.confidence ?? 0),
    knownMatch: known,
    status: toStatus(c.status),
  };
}

export function normalize(raw: any): DetectResponse {
  const list: any[] = Array.isArray(raw) ? raw : raw?.candidates ?? [];
  const candidates = list.map(toCandidate);
  const matched = candidates.filter((c) => c.knownMatch).length;
  if (Array.isArray(raw) || !raw?.imageSize) {
    console.warn('[blink] API response has no imageSize; assuming 1024 x 1024. Ask Kwaku to include it.');
  }
  return {
    regionId: raw?.regionId ?? 'region-01',
    imageSize: raw?.imageSize ?? { width: 1024, height: 1024 },
    images: raw?.images,
    candidates,
    counts: raw?.counts ?? { total: candidates.length, matchedKnown: matched, unmatched: candidates.length - matched },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- Endpoints (guide K5, K7, K8) ----
export const getCandidates = async () => normalize(await call('/candidates'));

export const getSummary = () => call<Summary>('/summary');

export const setStatus = (id: string, status: Status) =>
  call(`/candidates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });

// Detection can be slow: give it two minutes.
export const runDetect = async () =>
  normalize(
    await call(
      '/detect',
      {
        method: 'POST',
        body: JSON.stringify({
          regionId: 'region-01',
          epochA: 'data/region-01/epoch_a.fits',
          epochB: 'data/region-01/epoch_b.fits',
          threshold: 5.0,
        }),
      },
      120000,
    ),
  );

export function summarize(d: DetectResponse): Summary {
  const c = d.candidates;
  return {
    total: d.counts.total ?? c.length,
    matchedKnown: d.counts.matchedKnown ?? c.filter((x) => x.knownMatch).length,
    unmatched: d.counts.unmatched ?? c.filter((x) => !x.knownMatch).length,
    confirmed: c.filter((x) => x.status === 'confirmed').length,
    rejected: c.filter((x) => x.status === 'rejected').length,
  };
}
