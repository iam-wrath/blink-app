import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Candidate } from '../types';
import { boxToImage, clampPan, zoomAt, type View } from '../lib/view';
import { lookOf, LOOK_LABEL } from '../lib/status';

export type Show = 'A' | 'B' | 'wipe' | 'diff';

interface Props {
  label: string;
  width: number;
  height: number;
  urls: { a: string; b: string; diff: string | null };
  show: Show;
  split: number; // wipe position, 0..100 (A on the left)
  onSplit: (v: number) => void;
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  view: View;
  onView: (v: View) => void;
  markers: boolean;
  labels: boolean;
  onCursor?: (p: { x: number; y: number } | null) => void;
  corner?: ReactNode;
  compact?: boolean;
  note?: string | null; // message shown over the picture, e.g. while building the difference
}

// One sky picture with everything on top of it: wipe split, candidate rings,
// wheel / double-click zoom, drag to pan. Rings are placed in percent of the
// image, so they line up at any size and zoom.
export function Stage(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { kind: 'pan'; x: number; y: number; panX: number; panY: number } | { kind: 'split' }>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const viewRef = useRef(p.view);
  viewRef.current = p.view;
  const onViewRef = useRef(p.onView);
  onViewRef.current = p.onView;

  // Wheel zoom around the cursor (needs a non-passive listener to stop page scroll).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      onViewRef.current(zoomAt(v, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const frac = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, r };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.split-handle')) {
      drag.current = { kind: 'split' };
    } else if (t.closest('button')) {
      return;
    } else if (p.view.zoom > 1) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, panX: p.view.panX, panY: p.view.panY };
    } else if (p.show === 'wipe') {
      drag.current = { kind: 'split' };
      p.onSplit(Math.max(2, Math.min(98, frac(e).fx * 100)));
    } else return;
    box.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { fx, fy, r } = frac(e);
    if (p.onCursor) {
      const { u, w } = boxToImage(p.view, fx, fy);
      p.onCursor(u >= 0 && u <= 1 && w >= 0 && w <= 1 ? { x: u * p.width, y: w * p.height } : null);
    }
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'split') p.onSplit(Math.max(2, Math.min(98, fx * 100)));
    else
      p.onView({
        ...p.view,
        panX: clampPan(d.panX + (e.clientX - d.x) / r.width, p.view.zoom),
        panY: clampPan(d.panY + (e.clientY - d.y) / r.height, p.view.zoom),
      });
  };

  const end = () => {
    drag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, .split-handle')) return;
    const { fx, fy } = frac(e);
    p.onView(zoomAt(p.view, fx, fy, p.view.zoom >= 6 ? 1 : p.view.zoom * 2));
  };

  const inner: CSSProperties = {
    transform: `translate(${p.view.panX * 100}%, ${p.view.panY * 100}%) scale(${p.view.zoom})`,
    ['--z' as string]: p.view.zoom,
  };

  const layer = (key: 'A' | 'B' | 'D', src: string | null, visible: boolean, clip?: string) => (
    <div className="layer" style={{ visibility: visible ? 'visible' : 'hidden', clipPath: clip }}>
      <div className="layer-inner" style={inner}>
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setBroken((b) => ({ ...b, [key]: true }))}
            onLoad={() => setBroken((b) => ({ ...b, [key]: false }))}
          />
        )}
      </div>
    </div>
  );

  const showA = p.show === 'A' || p.show === 'wipe';
  const showB = p.show === 'B' || p.show === 'wipe';
  const missing = (showA && broken.A) || (showB && broken.B) || (p.show === 'diff' && (!p.urls.diff || broken.D));
  const ratio = p.width / p.height;

  return (
    <div
      ref={box}
      className={`stage ${p.view.zoom > 1 ? 'pannable' : ''} ${p.show === 'wipe' ? 'wiping' : ''}`}
      style={{ aspectRatio: `${p.width} / ${p.height}`, width: `min(100%, calc(var(--stage-h) * ${ratio}))` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => p.onCursor?.(null)}
      onDoubleClick={onDoubleClick}
      role="group"
      aria-label={p.label}
    >
      {layer('B', p.urls.b, showB)}
      {layer('A', p.urls.a, showA, p.show === 'wipe' ? `inset(0 ${100 - p.split}% 0 0)` : undefined)}
      {layer('D', p.urls.diff, p.show === 'diff')}

      {p.markers && (
        <div className="layer markers">
          <div className="layer-inner" style={inner}>
            {p.candidates.map((c) => {
              const look = lookOf(c);
              const sel = c.id === p.selectedId;
              return (
                <button
                  key={c.id}
                  className={`ring ring-${look} ${sel ? 'sel' : ''} ${p.compact ? 'compact' : ''}`}
                  style={{ left: `${(c.x / p.width) * 100}%`, top: `${(c.y / p.height) * 100}%` }}
                  onClick={() => p.onSelect(c.id)}
                  aria-label={`Candidate ${c.id}, ${LOOK_LABEL[look]}`}
                  aria-pressed={sel}
                >
                  {sel && <span className="cross" aria-hidden="true" />}
                  {p.labels && !p.compact && (
                    <span className="ring-tag">
                      {c.id}
                      {sel && <em>{Math.round(c.confidence * 100)}%</em>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {p.show === 'wipe' && (
        <>
          <div className="split-line" style={{ left: `${p.split}%` }} />
          <div
            className="split-handle"
            style={{ left: `${p.split}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Wipe position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p.split)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') p.onSplit(Math.max(2, p.split - 5));
              if (e.key === 'ArrowRight') p.onSplit(Math.min(98, p.split + 5));
            }}
          >
            <span>◂ ▸</span>
            <small>{Math.round(p.split)}%</small>
          </div>
          <span className="epoch-tag left">
            <i className="dot dot-a" /> EPOCH A
          </span>
          <span className="epoch-tag right">
            <i className="dot dot-b" /> EPOCH B
          </span>
        </>
      )}
      {p.corner}
      {p.note && <div className="stage-missing">{p.note}</div>}
      {missing && !p.note && (
        <div className="stage-missing">
          {p.show === 'diff' ? 'Difference image not available' : 'Image not available yet'}
        </div>
      )}
    </div>
  );
}
