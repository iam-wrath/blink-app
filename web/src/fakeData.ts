import type { DetectResponse, Status } from './types';

// Sample data in the contract shape. Used when the API is not running yet,
// or when VITE_USE_FAKE=true. The two images in public/fake/ match these
// positions: c-001 and c-002 really do move between a.png and b.png.
export const FAKE_RESPONSE: DetectResponse = {
  regionId: 'region-01',
  imageSize: { width: 1024, height: 1024 },
  candidates: [
    { id: 'c-001', x: 412.5, y: 630.2, ra: 150.1234, dec: 2.3456, fluxDiff: 18.7, confidence: 0.82, knownMatch: null, status: 'pending' },
    { id: 'c-002', x: 220, y: 180, ra: 150.0871, dec: 2.4012, fluxDiff: 15.1, confidence: 0.74, knownMatch: { name: 'Sample known object', separationArcsec: 4.2 }, status: 'pending' },
    { id: 'c-003', x: 760, y: 410, ra: 150.1679, dec: 2.379, fluxDiff: 9.8, confidence: 0.61, knownMatch: null, status: 'pending' },
    { id: 'c-004', x: 880, y: 850, ra: 150.1866, dec: 2.2795, fluxDiff: 7.2, confidence: 0.38, knownMatch: null, status: 'pending' },
    { id: 'c-005', x: 130, y: 720, ra: 150.0601, dec: 2.3203, fluxDiff: 6.1, confidence: 0.22, knownMatch: null, status: 'pending' },
  ],
  counts: { total: 5, matchedKnown: 1, unmatched: 4 },
};

// In fake mode, review choices are kept in the browser so they survive a refresh.
const KEY = 'blink-fake-status';

export function loadFakeStatuses(): Record<string, Status> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveFakeStatus(id: string, status: Status) {
  try {
    const all = loadFakeStatuses();
    all[id] = status;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: ignore */
  }
}

export function fakeResponse(): DetectResponse {
  const st = loadFakeStatuses();
  return {
    ...FAKE_RESPONSE,
    candidates: FAKE_RESPONSE.candidates.map((c) => ({ ...c, status: st[c.id] ?? 'pending' })),
  };
}
