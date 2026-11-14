import { useRef, useState } from 'react';
import type { Candidate } from '../types';

// panX / panY are fractions of the picture's size, so they stay right at any window size.
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const clampPan = (v: number, zoom: number) => {
  const max = (zoom - 1) / 2;
  return Math.max(-max, Math.min(max, v));
};

interface Props {
  label: string;
  // Images stacked in this box. Only `visible` is shown; the others stay
  // loaded so blinking is instant with no flicker.
  images: { key: string; src: string }[];
  visible: string;
  width: number;
  height: number;
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  view: View;
  onView: (v: View) => void;
  compact?: boolean;
}

export const STATUS_LOOK = {
  pending: { cls: 'm-pending', label: 'Pending' },
  known: { cls: 'm-known', label: 'Known' },
  confirmed: { cls: 'm-confirmed', label: 'Confirmed' },
  rejected: { cls: 'm-rejected', label: 'Rejected' },
} as const;

export function lookFor(c: Candidate) {
  if (c.status === 'confirmed') return STATUS_LOOK.confirmed;
  if (c.status === 'rejected') return STATUS_LOOK.rejected;
  if (c.knownMatch) return STATUS_LOOK.known;
  return STATUS_LOOK.pending;
}

// J3 + J4: the sky picture with candidate rings on top.
// Rings are placed in PERCENT of the image size, so they stay in the right
// place at any window size with no resize code.
// Zoom and pan move the image and rings together; rings are counter-scaled
// so they stay the same size on screen.
export function SkyImage(p: Props) {
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (p.view.zoom <= 1 || (e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: p.view.panX, panY: p.view.panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    p.onView({
      ...p.view,
      panX: clampPan(d.panX + (e.clientX - d.x) / box.clientWidth, p.view.zoom),
      panY: clampPan(d.panY + (e.clientY - d.y) / box.clientHeight, p.view.zoom),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const anyBroken = p.images.some((im) => im.key === p.visible && broken[im.key]);

  return (
    <div
      ref={boxRef}
      className={`sky ${p.view.zoom > 1 ? 'sky-pannable' : ''}`}
      style={{ aspectRatio: `${p.width} / ${p.height}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={p.label}
      role="group"
    >
      <div
        className="sky-inner"
        style={
          {
            transform: `translate(${p.view.panX * 100}%, ${p.view.panY * 100}%) scale(${p.view.zoom})`,
            '--z': p.view.zoom,
          } as React.CSSProperties
        }
      >
        {p.images.map((im) => (
          <img
            key={im.key}
            src={im.src}
            alt=""
            draggable={false}
            className="sky-img"
            style={{ visibility: im.key === p.visible ? 'visible' : 'hidden' }}
            onError={() => setBroken((b) => ({ ...b, [im.key]: true }))}
            onLoad={() => setBroken((b) => ({ ...b, [im.key]: false }))}
          />
        ))}
        {p.candidates.map((c) => {
          const look = lookFor(c);
          const sel = c.id === p.selectedId;
          return (
            <button
              key={c.id}
              className={`marker ${look.cls} ${sel ? 'selected' : ''} ${p.compact ? 'compact' : ''}`}
              style={{ left: `${(c.x / p.width) * 100}%`, top: `${(c.y / p.height) * 100}%` }}
              onClick={() => p.onSelect(c.id)}
              aria-label={`Candidate ${c.id}, ${look.label}`}
              aria-pressed={sel}
            >
              {!p.compact && <span className="marker-tag">{c.id}</span>}
            </button>
          );
        })}
      </div>
      {anyBroken && <div className="sky-missing">Image not available yet</div>}
    </div>
  );
}
