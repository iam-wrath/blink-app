import type { CSSProperties, ReactNode } from 'react';
import type { Dot } from '../lib/sim';

export interface Ring {
  key: string;
  label: string;
  l: number; // percent of image
  t: number;
  size: number;
  border: string;
  color: string;
  onPick: () => void;
}

export interface Blob {
  l: number;
  t: number;
  s: number;
  c: string;
}

interface Props {
  label: string;
  ratio: number; // width / height
  show: 'A' | 'B' | 'wipe' | 'diff';
  sim?: { a: Dot[]; b: Dot[]; diff: Blob[] };
  real?: { a: string; b: string; diff: string | null };
  filter: string;
  invert: boolean;
  split: number;
  zoom: number;
  ox: number;
  oy: number;
  rings: Ring[];
  labels: boolean;
  overlay?: Blob[]; // e.g. difference mask, drawn in image space
  onMove?: (fx: number, fy: number) => void; // image fractions 0..1
  onLeave?: () => void;
  onClickImg?: (fx: number, fy: number) => void;
  children?: ReactNode; // screen-space extras (grid, popups)
  note?: string | null;
  cursor?: string;
}

function Dots({ list }: { list: Dot[] }) {
  return (
    <>
      {list.map((d, i) => (
        <span
          key={i}
          className="dot"
          style={{ left: `${d.l}%`, top: `${d.t}%`, width: d.s, height: d.s, opacity: d.o, filter: `blur(${d.b}px)` }}
        />
      ))}
    </>
  );
}

function Blobs({ list, round }: { list: Blob[]; round?: boolean }) {
  return (
    <>
      {list.map((d, i) => (
        <span
          key={i}
          className={round ? 'blob round' : 'blob'}
          style={{ left: `${d.l}%`, top: `${d.t}%`, width: d.s, height: d.s, background: d.c }}
        />
      ))}
    </>
  );
}

// One sky picture: simulated dots or the team's real PNGs, with zoom
// towards (ox, oy), wipe, difference, rings and labels.
export function Sky(p: Props) {
  const z = p.zoom;
  const zoomStyle: CSSProperties = { transform: `scale(${z})`, transformOrigin: `${p.ox}% ${p.oy}%` };
  const frac = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    return { fx: p.ox / 100 + (fx - p.ox / 100) / z, fy: p.oy / 100 + (fy - p.oy / 100) / z };
  };
  const showA = p.show === 'A' || p.show === 'wipe';
  const showB = p.show === 'B' || p.show === 'wipe';
  const clipA = p.show === 'wipe' ? `inset(0 ${100 - p.split}% 0 0)` : undefined;
  const flt = p.filter + (p.invert ? ' invert(1)' : '');

  return (
    <div
      className="sky"
      role="group"
      aria-label={p.label}
      style={{ aspectRatio: String(p.ratio), background: p.invert ? '#f5f5f5' : '#0a0a0a', cursor: p.cursor }}
      onMouseMove={p.onMove ? (e) => { const f = frac(e); p.onMove!(f.fx, f.fy); } : undefined}
      onMouseLeave={p.onLeave}
      onClick={p.onClickImg ? (e) => { if ((e.target as HTMLElement).closest('button')) return; const f = frac(e); if (f.fx >= 0 && f.fx <= 1 && f.fy >= 0 && f.fy <= 1) p.onClickImg!(f.fx, f.fy); } : undefined}
    >
      <div className="zoom" style={zoomStyle}>
        <div className="layers" style={{ filter: flt }}>
          {p.show === 'diff' &&
            (p.sim ? (
              <div className="layer grey">
                <Blobs list={p.sim.diff} />
              </div>
            ) : p.real?.diff ? (
              <img className="layer img" src={p.real.diff} alt="" draggable={false} />
            ) : null)}
          {showB && (
            <div className="layer black">
              {p.sim ? <Dots list={p.sim.b} /> : p.real && <img className="layer img" src={p.real.b} alt="" draggable={false} />}
            </div>
          )}
          {showA && (
            <div className="layer black" style={{ clipPath: clipA }}>
              {p.sim ? <Dots list={p.sim.a} /> : p.real && <img className="layer img" src={p.real.a} alt="" draggable={false} />}
            </div>
          )}
        </div>
        {p.overlay && <Blobs list={p.overlay} round />}
        {p.rings.map((r) => (
          <button
            key={r.key}
            type="button"
            className="ring"
            aria-label={r.label}
            onClick={r.onPick}
            style={{ left: `${r.l}%`, top: `${r.t}%`, width: r.size, height: r.size, border: r.border, transform: `translate(-50%, -50%) scale(${1 / z})` }}
          />
        ))}
        {p.labels &&
          p.rings.map((r) => (
            <span
              key={'t' + r.key}
              className="ring-tag"
              aria-hidden="true"
              style={{ left: `${r.l}%`, top: `${r.t}%`, color: r.color, transform: `translate(${(r.size / 2 + 4) / z}px, -${(r.size / 2 + 16) / z}px) scale(${1 / z})` }}
            >
              {r.label.split(',')[0].replace('Candidate ', '')}
            </span>
          ))}
      </div>
      {p.show === 'wipe' && (
        <>
          <span className="wipe-line" style={{ left: `${p.split}%` }} />
          <span className="corner left" style={{ color: p.invert ? '#222' : '#eee' }}>A</span>
          <span className="corner right" style={{ color: p.invert ? '#222' : '#eee' }}>B</span>
        </>
      )}
      {p.children}
      {p.note && <div className="sky-note">{p.note}</div>}
    </div>
  );
}
