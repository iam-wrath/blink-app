import { useMemo, useState } from 'react';
import type { Candidate, Source } from '../types';
import { Stage } from './Stage';
import { Icon } from './Icon';
import { centerOn, HOME, zoomAt, type View } from '../lib/view';
import { fitSky, skyAt, raHms, decDms } from '../lib/wcs';
import { useDiff } from '../lib/diff';

export type Mode = 'blink' | 'wipe' | 'side' | 'diff';
export type Epoch = 'A' | 'B';

export const MODES: { id: Mode; label: string; icon: string; key: string }[] = [
  { id: 'blink', label: 'Blink comparator', icon: 'blink', key: '1' },
  { id: 'wipe', label: 'Split slider (wipe)', icon: 'wipe', key: '2' },
  { id: 'side', label: 'Side by side, synced', icon: 'columns', key: '3' },
  { id: 'diff', label: 'Difference map', icon: 'diff', key: '4' },
];

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  epoch: Epoch;
  onFlip: () => void;
  playing: boolean;
  onPlaying: (v: boolean) => void;
  rate: number;
  onRate: (v: number) => void;
  split: number;
  onSplit: (v: number) => void;
  gain: number;
  onGain: (v: number) => void;
  markers: boolean;
  onMarkers: (v: boolean) => void;
  labels: boolean;
  onLabels: (v: boolean) => void;
  urls: { a: string; b: string; diff: string | null };
  width: number;
  height: number;
  candidates: Candidate[]; // visible after filters
  all: Candidate[];
  selected: Candidate | null;
  onSelect: (id: string) => void;
  view: View;
  onView: (v: View) => void;
  source: Source;
}

export function Viewer(p: Props) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const sky = useMemo(() => fitSky(p.all), [p.all]);
  const diff = useDiff(p.urls.a, p.urls.b, p.urls.diff, p.mode === 'diff', p.gain);

  const stageProps = {
    width: p.width,
    height: p.height,
    split: p.split,
    onSplit: p.onSplit,
    candidates: p.candidates,
    selectedId: p.selected?.id ?? null,
    onSelect: p.onSelect,
    view: p.view,
    onView: p.onView,
    markers: p.markers,
    labels: p.labels,
    onCursor: setCursor,
  };
  const urls = { ...p.urls, diff: diff.url };
  const pos = cursor && sky ? skyAt(sky, cursor.x, cursor.y) : null;

  const focusSelected = () => {
    if (p.selected) p.onView(centerOn(p.selected.x / p.width, p.selected.y / p.height, Math.max(3, p.view.zoom)));
  };

  const epochCorner = (e: Epoch) => (
    <span className="epoch-tag left">
      <i className={`dot dot-${e.toLowerCase()}`} /> EPOCH {e}
      {p.source === 'fake' && <b className="sample">SAMPLE DATA</b>}
    </span>
  );

  return (
    <section className="viewer" aria-label="Sky comparator">
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Comparison mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={p.mode === m.id}
              className={p.mode === m.id ? 'tab on' : 'tab'}
              onClick={() => p.onMode(m.id)}
              title={`${m.label} (key ${m.key})`}
            >
              <Icon name={m.icon} size={16} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="tool-right">
          {p.mode === 'blink' && (
            <>
              <button className="ghost" onClick={p.onFlip} title="Flip (Space)">
                <span className={`epoch-pill e-${p.epoch.toLowerCase()}`}>{p.epoch}</span> Flip <kbd>Space</kbd>
              </button>
              <button
                className={p.playing ? 'ghost on' : 'ghost'}
                onClick={() => p.onPlaying(!p.playing)}
                aria-pressed={p.playing}
                title="Auto-blink (P)"
              >
                <Icon name={p.playing ? 'pause' : 'play'} size={14} /> {p.playing ? 'Pause' : 'Auto-blink'}
              </button>
              <label className="range">
                <span>RATE</span>
                <input type="range" min={0.5} max={5} step={0.5} value={p.rate} onChange={(e) => p.onRate(Number(e.target.value))} />
                <b>{p.rate.toFixed(1)} Hz</b>
              </label>
            </>
          )}
          {p.mode === 'wipe' && (
            <>
              <span className="hint-chip">Drag the line, or click anywhere on the picture</span>
              <button className="ghost" onClick={() => p.onSplit(50)}>
                Center split
              </button>
            </>
          )}
          {p.mode === 'diff' && (
            <>
              <span className="legend">
                <i className="sw sw-b" /> brighter in B <i className="sw sw-a" /> brighter in A
              </span>
              <label className="range">
                <span>GAIN</span>
                <input type="range" min={1} max={10} step={1} value={p.gain} onChange={(e) => p.onGain(Number(e.target.value))} />
                <b>×{p.gain}</b>
              </label>
            </>
          )}
          <div className="toggles">
            <button className={p.markers ? 'chip-btn on' : 'chip-btn'} aria-pressed={p.markers} onClick={() => p.onMarkers(!p.markers)} title="Show rings (M)">
              <Icon name="target" size={14} /> Rings
            </button>
            <button className={p.labels ? 'chip-btn on' : 'chip-btn'} aria-pressed={p.labels} onClick={() => p.onLabels(!p.labels)} title="Show labels (L)">
              <Icon name="tag" size={14} /> Labels
            </button>
          </div>
        </div>
      </div>

      <div className="stage-area">
        {p.mode === 'side' ? (
          <div className="side-grid">
            {(['A', 'B'] as const).map((e) => (
              <Stage key={e} {...stageProps} label={`Epoch ${e}`} urls={urls} show={e} corner={epochCorner(e)} compact />
            ))}
          </div>
        ) : (
          <Stage
            {...stageProps}
            label={p.mode === 'blink' ? `Epoch ${p.epoch}` : p.mode === 'wipe' ? 'Wipe comparison' : 'Difference map'}
            urls={urls}
            show={p.mode === 'blink' ? p.epoch : p.mode === 'wipe' ? 'wipe' : 'diff'}
            note={p.all.length === 0 ? 'No candidates found.' : p.mode === 'diff' ? (diff.loading ? 'Building difference…' : diff.failed ? 'Difference not available: ask Kwaku to serve diff.png or add CORS to the images' : null) : null}
            corner={
              p.mode === 'blink' ? (
                epochCorner(p.epoch)
              ) : p.mode === 'diff' ? (
                <span className="epoch-tag left">
                  <i className="dot dot-d" /> B − A DIFFERENCE
                </span>
              ) : null
            }
          />
        )}

        <div className="hud" role="toolbar" aria-label="Zoom and position">
          <button aria-label="Zoom out" onClick={() => p.onView(zoomAt(p.view, 0.5, 0.5, p.view.zoom / 1.5))} disabled={p.view.zoom <= 1}>
            <Icon name="minus" size={16} />
          </button>
          <span className="mono">{p.view.zoom.toFixed(2)}×</span>
          <button aria-label="Zoom in" onClick={() => p.onView(zoomAt(p.view, 0.5, 0.5, p.view.zoom * 1.5))} disabled={p.view.zoom >= 8}>
            <Icon name="plus" size={16} />
          </button>
          <i className="sep" />
          <span className="mono cursor-read">
            <span className="muted">CURSOR</span>{' '}
            {cursor ? (
              <>
                x {cursor.x.toFixed(0).padStart(4, ' ')} y {cursor.y.toFixed(0).padStart(4, ' ')}
                {pos && (
                  <span className="muted">
                    {' '}
                    ≈ {raHms(pos.ra)} {decDms(pos.dec)}
                  </span>
                )}
              </>
            ) : (
              <span className="muted">move over the image</span>
            )}
          </span>
          <i className="sep" />
          <button className="text" onClick={focusSelected} disabled={!p.selected} title="Zoom to selected (F)">
            <Icon name="focus" size={15} /> Focus
          </button>
          <button className="text" onClick={() => p.onView(HOME)} title="Reset view (0)">
            <Icon name="fit" size={15} /> Reset
          </button>
        </div>
      </div>
    </section>
  );
}
