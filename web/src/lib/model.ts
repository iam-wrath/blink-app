import type { St, Team } from '../state';
import type { Status } from '../types';
import { customTarget, detect, frame, hms, N, PX, simSky, TARGETS, type Ev, type SimTarget } from './sim';
import { fitSky, skyAt } from './wcs';

// One list of candidates for whatever is being viewed:
// the team's real candidates from the API, or detections in a simulated sky.
export interface UC {
  key: string;
  label: string;
  x: number;
  y: number;
  sx?: number; // start position for moving objects (simulated only)
  sy?: number;
  kind: 'move' | 'rise' | 'fade' | 'art' | 'known' | 'unknown';
  status: Status;
  conf?: number;
  k?: number; // strength in levels (simulated)
  ar?: number;
  ra?: number;
  dec?: number;
  known?: string;
  sep?: number;
  flux?: number;
}

export function simTarget(S: St): SimTarget {
  if (S.custom) return S.custom;
  return TARGETS.find((t) => t.key === S.src) ?? TARGETS[0];
}

export function isTeam(S: St) {
  return S.src === 'team';
}

export const KIND_LABEL: Record<UC['kind'], string> = {
  move: 'Possible moving object',
  rise: 'Appeared or brightened',
  fade: 'Faded or moved away',
  art: 'Tiny spot, maybe an artifact',
  known: 'Known object',
  unknown: 'Unknown, worth a second look',
};

export function model(S: St, team: Team, withArt = true) {
  if (isTeam(S)) {
    const d = team.data;
    const w = d?.imageSize.width ?? 1024;
    const h = d?.imageSize.height ?? 1024;
    const list: UC[] = team.sorted.map((c) => ({
      key: c.id,
      label: c.id,
      x: c.x,
      y: c.y,
      kind: c.knownMatch ? 'known' : 'unknown',
      status: c.status,
      conf: c.confidence,
      ra: c.ra,
      dec: c.dec,
      known: c.knownMatch?.name,
      sep: c.knownMatch?.separationArcsec,
      flux: c.fluxDiff,
    }));
    const fit = fitSky(team.sorted);
    const where = (x: number, y: number) => {
      if (!fit) return `pixel ${Math.round(x)}, ${Math.round(y)}`;
      const s = skyAt(fit, x, y);
      return `RA ${hms(s.ra / 15, false)}, Dec ${hms(s.dec, true)} (≈)`;
    };
    return { team: true as const, w, h, list, where, name: `Team data · ${d?.regionId ?? 'region-01'}`, evs: [] as Ev[] };
  }
  const tg = simTarget(S);
  const evs = detect(tg.seed, S.A, S.B, S.th, withArt);
  const list: UC[] = evs.map((e, i) => {
    const key = `#${i + 1}`;
    return {
      key,
      label: key,
      x: e.e.x,
      y: e.e.y,
      sx: e.s?.x,
      sy: e.s?.y,
      kind: e.t,
      status: S.simStatus[`${tg.key}|${S.A}|${S.B}|${key}`] ?? 'pending',
      k: e.k,
      ar: e.ar,
    };
  });
  const where = (x: number, y: number) => {
    const s = simSky(tg, x, y);
    if (s) return `RA ${hms(s.ra / 15, false)}, Dec ${hms(s.dec, true)}`;
    const f = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v * PX).toFixed(0) + '″';
    return `${f(x - N / 2)} x, ${f(y - N / 2)} y from centre`;
  };
  return { team: false as const, w: N, h: N, list, where, name: tg.n, evs, tg };
}

export function simFrames(S: St) {
  const tg = simTarget(S);
  return { a: frame(tg.seed, S.A), b: frame(tg.seed, S.B) };
}

export { customTarget };
