import type { Candidate } from '../types';

export type Look = 'pending' | 'known' | 'confirmed' | 'rejected';

export const LOOK_LABEL: Record<Look, string> = {
  pending: 'Pending',
  known: 'Known object',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

// What a candidate looks like on screen. A review decision wins over "known".
export function lookOf(c: Candidate): Look {
  if (c.status === 'confirmed') return 'confirmed';
  if (c.status === 'rejected') return 'rejected';
  if (c.knownMatch) return 'known';
  return 'pending';
}

export type Filter = 'all' | 'unmatched' | 'known' | 'pending' | 'confirmed' | 'rejected';

export const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unmatched', label: 'Unknown' },
  { id: 'known', label: 'Known' },
  { id: 'pending', label: 'To review' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'rejected', label: 'Rejected' },
];

export function passes(c: Candidate, f: Filter, minConf: number) {
  if (c.confidence < minConf) return false;
  switch (f) {
    case 'unmatched':
      return !c.knownMatch;
    case 'known':
      return !!c.knownMatch;
    case 'pending':
      return c.status === 'pending';
    case 'confirmed':
      return c.status === 'confirmed';
    case 'rejected':
      return c.status === 'rejected';
    default:
      return true;
  }
}

export function toCsv(cs: Candidate[]) {
  const head = 'id,x,y,ra,dec,fluxDiff,confidence,knownName,knownSepArcsec,status';
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = cs.map((c) =>
    [c.id, c.x, c.y, c.ra, c.dec, c.fluxDiff, c.confidence, c.knownMatch ? q(c.knownMatch.name) : '', c.knownMatch?.separationArcsec ?? '', c.status].join(','),
  );
  return [head, ...rows].join('\n');
}
