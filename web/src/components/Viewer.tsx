import type { Candidate, Source } from '../types';
import { SkyImage, clampPan, type View } from './SkyImage';

export type Mode = 'blink' | 'side';
export type Epoch = 'A' | 'B';

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  epoch: Epoch;
  onFlip: () => void;
  urls: { a: string; b: string };
  width: number;
  height: number;
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  view: View;
  onView: (v: View) => void;
  source: Source;
}

const ZOOMS = [1, 1.5, 2, 3, 4];

export function Viewer(p: Props) {
  const zi = ZOOMS.indexOf(p.view.zoom);
  // Zooming centres on the selected candidate, so "zoom in" shows the dot you are looking at.
  const setZoom = (z: number) => {
    if (z === 1) return p.onView({ zoom: 1, panX: 0, panY: 0 });
    const sel = p.candidates.find((c) => c.id === p.selectedId);
    if (!sel) return p.onView({ ...p.view, zoom: z, panX: clampPan(p.view.panX, z), panY: clampPan(p.view.panY, z) });
    p.onView({
      zoom: z,
      panX: clampPan(-(sel.x / p.width - 0.5) * z, z),
      panY: clampPan(-(sel.y / p.height - 0.5) * z, z),
    });
  };
  const images = [
    { key: 'A', src: p.urls.a },
    { key: 'B', src: p.urls.b },
  ];

  return (
    <section className="card viewer" aria-label="Sky viewer">
      <div className="viewer-bar">
        <div className="toggle" role="group" aria-label="View mode">
          <button aria-pressed={p.mode === 'blink'} onClick={() => p.onMode('blink')}>
            Blink
          </button>
          <button aria-pressed={p.mode === 'side'} onClick={() => p.onMode('side')}>
            Side by side
          </button>
        </div>

        {p.mode === 'blink' && (
          <div className="flip-row">
            <span className="showing">
              Showing <span className={`epoch-badge epoch-${p.epoch}`}>{p.epoch}</span>
            </span>
            <button className="btn btn-sun" onClick={p.onFlip}>
              Flip! <kbd>Space</kbd>
            </button>
          </div>
        )}

        <div className="zoom" role="group" aria-label="Zoom">
          <button className="icon-btn" aria-label="Zoom out" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[zi - 1])}>
            −
          </button>
          <button className="icon-btn zoom-level" aria-label="Reset zoom" onClick={() => setZoom(1)}>
            {p.view.zoom}×
          </button>
          <button
            className="icon-btn"
            aria-label="Zoom in"
            disabled={zi >= ZOOMS.length - 1}
            onClick={() => setZoom(ZOOMS[zi + 1])}
          >
            +
          </button>
        </div>
      </div>

      {p.mode === 'blink' ? (
        <div className="sky-wrap">
          <SkyImage
            label={`Sky image, epoch ${p.epoch}`}
            images={images}
            visible={p.epoch}
            width={p.width}
            height={p.height}
            candidates={p.candidates}
            selectedId={p.selectedId}
            onSelect={p.onSelect}
            view={p.view}
            onView={p.onView}
          />
          {p.source === 'fake' && <span className="sample-tag">Sample data</span>}
        </div>
      ) : (
        <div className="side-grid">
          {(['A', 'B'] as const).map((e) => (
            <div key={e} className="side-col">
              <div className="side-label">
                <span className={`epoch-badge small epoch-${e}`}>{e}</span> Epoch {e}
              </div>
              <SkyImage
                label={`Sky image, epoch ${e}`}
                images={images}
                visible={e}
                width={p.width}
                height={p.height}
                candidates={p.candidates}
                selectedId={p.selectedId}
                onSelect={p.onSelect}
                view={p.view}
                onView={p.onView}
                compact
              />
            </div>
          ))}
        </div>
      )}

      <p className="hint">
        Watch for the dot that jumps when you flip. That's something moving.
        {p.view.zoom > 1 && ' Drag the picture to look around.'}
      </p>
    </section>
  );
}
