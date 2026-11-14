import { useEffect, useState } from 'react';
import type { Candidate, Status, Summary } from '../types';
import { Icon } from './Icon';
import { FILTERS, lookOf, LOOK_LABEL, passes, type Filter } from '../lib/status';
import { raHms, decDms } from '../lib/wcs';

// ---------- Detection run card ----------
interface RunProps {
  summary: Summary | null;
  all: Candidate[];
  minConf: number;
  onMinConf: (v: number) => void;
  threshold: number;
  onThreshold: (v: number) => void;
  running: boolean;
  onRun: () => void;
}

export function RunCard(p: RunProps) {
  const s = p.summary;
  const bins = Array.from({ length: 10 }, (_, i) => p.all.filter((c) => Math.min(9, Math.floor(c.confidence * 10)) === i).length);
  const max = Math.max(1, ...bins);
  const reviewed = s ? s.confirmed + s.rejected : 0;
  return (
    <div className="panel">
      <div className="panel-head">
        <Icon name="radar" size={18} className="cyan" />
        <h2>Detection run</h2>
        <span className="badge mono">σ {p.threshold.toFixed(1)}</span>
      </div>
      <div className="metrics">
        <div>
          <span className="lbl">CANDIDATES</span>
          <b className="mono">{s?.total ?? '–'}</b>
          <span className="sub">found by differencing</span>
        </div>
        <div>
          <span className="lbl">KNOWN OBJECTS</span>
          <b className="mono violet">{s?.matchedKnown ?? '–'}</b>
          <span className="sub">matched in catalog</span>
        </div>
        <div>
          <span className="lbl">UNKNOWN</span>
          <b className="mono amber">{s?.unmatched ?? '–'}</b>
          <span className="sub">worth a second look</span>
        </div>
        <div>
          <span className="lbl">REVIEWED</span>
          <b className="mono">
            {reviewed}
            <small>/{s?.total ?? 0}</small>
          </b>
          <span className="sub">
            {s?.confirmed ?? 0} confirmed · {s?.rejected ?? 0} rejected
          </span>
        </div>
      </div>

      <div className="histo">
        <div className="histo-head">
          <span className="lbl">CONFIDENCE · click a bar to filter</span>
          <span className="mono cyan">≥ {Math.round(p.minConf * 100)}%</span>
        </div>
        <div className="bars">
          {bins.map((n, i) => (
            <button
              key={i}
              className={i / 10 < p.minConf - 1e-9 ? 'bar off' : 'bar'}
              style={{ height: `${8 + (n / max) * 52}px` }}
              onClick={() => p.onMinConf(p.minConf === i / 10 ? 0 : i / 10)}
              aria-label={`${n} candidates at ${i * 10} to ${i * 10 + 10} percent. Show only ${i * 10} percent and up.`}
              title={`${i * 10}–${i * 10 + 10}%: ${n}`}
            >
              {n > 0 && <span>{n}</span>}
            </button>
          ))}
        </div>
        <div className="axis mono">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="run-row">
        <label className="range grow">
          <span>THRESHOLD</span>
          <input type="range" min={3} max={10} step={0.5} value={p.threshold} onChange={(e) => p.onThreshold(Number(e.target.value))} />
          <b>{p.threshold.toFixed(1)}σ</b>
        </label>
      </div>
      <button className="primary" onClick={p.onRun} disabled={p.running}>
        {p.running ? (
          <>
            <span className="spinner" /> Scanning the sky…
          </>
        ) : (
          <>
            Run change detection <Icon name="right" size={18} />
          </>
        )}
      </button>
    </div>
  );
}

// ---------- Selected candidate card ----------
function Cutout({ src, c, width, height, label }: { src: string; c: Candidate; width: number; height: number; label: string }) {
  const crop = Math.min(96, width, height);
  const left = Math.max(0, Math.min(width - crop, c.x - crop / 2));
  const top = Math.max(0, Math.min(height - crop, c.y - crop / 2));
  return (
    <figure className="cutout">
      <div
        className="cutout-img"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundSize: `${(width / crop) * 100}% ${(height / crop) * 100}%`,
          backgroundPosition: `${width === crop ? 0 : (left / (width - crop)) * 100}% ${height === crop ? 0 : (top / (height - crop)) * 100}%`,
        }}
      >
        <span className="cutout-ring" style={{ left: `${((c.x - left) / crop) * 100}%`, top: `${((c.y - top) / crop) * 100}%` }} />
      </div>
      <figcaption className="mono">{label}</figcaption>
    </figure>
  );
}

interface CandProps {
  c: Candidate | null;
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onStatus: (s: Status) => void;
  saving: boolean;
  urls: { a: string; b: string };
  width: number;
  height: number;
}

export function CandidateCard(p: CandProps) {
  const [blinkB, setBlinkB] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setBlinkB((x) => !x), 650);
    return () => clearInterval(t);
  }, []);

  if (!p.c) {
    return (
      <div className="panel">
        <div className="panel-head">
          <Icon name="target" size={18} className="amber" />
          <h2>Candidate</h2>
        </div>
        <p className="muted">Click a ring on the sky, or a row below.</p>
      </div>
    );
  }
  const c = p.c;
  const look = lookOf(c);
  return (
    <div className="panel">
      <div className="panel-head">
        <Icon name="target" size={18} className="amber" />
        <h2 className="mono">{c.id}</h2>
        <span className={`status s-${look}`}>{LOOK_LABEL[look]}</span>
      </div>

      <div className="cutouts">
        <Cutout src={p.urls.a} c={c} width={p.width} height={p.height} label="EPOCH A" />
        <Cutout src={p.urls.b} c={c} width={p.width} height={p.height} label="EPOCH B" />
        <Cutout src={blinkB ? p.urls.b : p.urls.a} c={c} width={p.width} height={p.height} label={`BLINK · ${blinkB ? 'B' : 'A'}`} />
      </div>

      <dl className="facts mono">
        <div>
          <dt>RA</dt>
          <dd>
            {raHms(c.ra)} <span className="muted">{c.ra.toFixed(4)}°</span>
          </dd>
        </div>
        <div>
          <dt>DEC</dt>
          <dd>
            {decDms(c.dec)} <span className="muted">{c.dec.toFixed(4)}°</span>
          </dd>
        </div>
        <div>
          <dt>PIXEL</dt>
          <dd>
            {c.x.toFixed(1)}, {c.y.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt>ΔFLUX</dt>
          <dd className="amber">{c.fluxDiff.toFixed(1)}</dd>
        </div>
        <div>
          <dt>CONFIDENCE</dt>
          <dd className="conf">
            <span className="meter">
              <span style={{ width: `${c.confidence * 100}%` }} />
            </span>
            {Math.round(c.confidence * 100)}%
          </dd>
        </div>
        <div>
          <dt>CATALOG</dt>
          <dd className={c.knownMatch ? 'violet' : ''}>
            {c.knownMatch ? `${c.knownMatch.name} · ${c.knownMatch.separationArcsec.toFixed(1)}″` : 'No known object nearby'}
          </dd>
        </div>
      </dl>

      <div className="decide">
        <button className="confirm" disabled={p.saving} onClick={() => p.onStatus('confirmed')} aria-pressed={c.status === 'confirmed'}>
          <Icon name="check" size={16} /> Confirm <kbd>C</kbd>
        </button>
        <button className="reject" disabled={p.saving} onClick={() => p.onStatus('rejected')} aria-pressed={c.status === 'rejected'}>
          <Icon name="x" size={16} /> Reject <kbd>R</kbd>
        </button>
      </div>
      <div className="nav-row">
        <button className="ghost small" onClick={p.onPrev} aria-label="Previous candidate (K)">
          <Icon name="left" size={14} /> Prev
        </button>
        <span className="mono muted">
          {p.index + 1} / {p.count}
        </span>
        {c.status !== 'pending' ? (
          <button className="ghost small" onClick={() => p.onStatus('pending')} disabled={p.saving}>
            <Icon name="undo" size={14} /> Undo
          </button>
        ) : (
          <span />
        )}
        <button className="ghost small" onClick={p.onNext} aria-label="Next candidate (J)">
          Next <Icon name="right" size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------- Queue (compact list) ----------
interface QueueProps {
  all: Candidate[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  minConf: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Queue(p: QueueProps) {
  const shown = p.all.filter((c) => passes(c, p.filter, p.minConf));
  return (
    <div className="panel">
      <div className="panel-head">
        <Icon name="list" size={18} className="cyan" />
        <h2>Candidate queue</h2>
        <span className="badge mono">{shown.length}</span>
      </div>
      <div className="filters" role="group" aria-label="Filter candidates">
        {FILTERS.map((f) => (
          <button key={f.id} className={p.filter === f.id ? 'chip-btn on' : 'chip-btn'} aria-pressed={p.filter === f.id} onClick={() => p.onFilter(f.id)}>
            {f.label} <span className="mono">{p.all.filter((c) => passes(c, f.id, p.minConf)).length}</span>
          </button>
        ))}
      </div>
      {p.all.length === 0 ? (
        <p className="empty">No candidates found.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No candidates match. Try another filter or lower the confidence cut.</p>
      ) : (
        <ul className="queue">
          {shown.map((c) => {
            const look = lookOf(c);
            return (
              <li key={c.id}>
                <button className="qrow" aria-pressed={c.id === p.selectedId} onClick={() => p.onSelect(c.id)}>
                  <i className={`dot d-${look}`} aria-hidden="true" />
                  <span className="mono id">{c.id}</span>
                  <span className="qmid">
                    <span className="muted">{LOOK_LABEL[look]}</span>
                    <span className="meter thin">
                      <span style={{ width: `${c.confidence * 100}%` }} />
                    </span>
                  </span>
                  <span className="mono">{Math.round(c.confidence * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
