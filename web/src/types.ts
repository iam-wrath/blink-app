// Shapes from the team contract (Blink step-by-step guide, page 3),
// plus `status`, which Kwaku's API adds for confirm/reject.

export type Status = 'pending' | 'confirmed' | 'rejected';

export interface KnownMatch {
  name: string;
  separationArcsec: number;
}

export interface Candidate {
  id: string;
  x: number; // pixel position in the PNG, (0,0) = top-left
  y: number;
  ra: number; // degrees
  dec: number; // degrees
  fluxDiff: number;
  confidence: number; // 0 to 1
  knownMatch: KnownMatch | null;
  status: Status;
}

export interface DetectResponse {
  regionId: string;
  imageSize: { width: number; height: number };
  images?: { epochA: string; epochB: string };
  candidates: Candidate[];
  counts: { total: number; matchedKnown: number; unmatched: number };
}

export interface Summary {
  total: number;
  matchedKnown: number;
  unmatched: number;
  confirmed: number;
  rejected: number;
}

export type Source = 'api' | 'fake';
