import type { Candidate, Status } from '../types';
import { lookFor } from './SkyImage';

interface Props {
  c: Candidate | null;
  onStatus: (s: Status) => void;
  saving: boolean;
}

// J5 + J6: details of the selected candidate, with Confirm / Reject.
export function DetailPanel({ c, onStatus, saving }: Props) {
  if (!c) {
    return (
      <div className="card detail">
        <h2>Pick a dot</h2>
        <p className="muted">Click a ring on the sky or a row in the list to see its details.</p>
      </div>
    );
  }
  const look = lookFor(c);
  return (
    <div className="card detail">
      <div className="detail-head">
        <h2>{c.id}</h2>
        <span className={`chip status-chip ${look.cls}`}>{look.label}</span>
      </div>
      <dl className="facts">
        <div>
          <dt>RA</dt>
          <dd>{c.ra.toFixed(4)}°</dd>
        </div>
        <div>
          <dt>Dec</dt>
          <dd>{c.dec.toFixed(4)}°</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{Math.round(c.confidence * 100)}%</dd>
        </div>
        <div>
          <dt>Known object?</dt>
          <dd>
            {c.knownMatch ? (
              <>
                {c.knownMatch.name}
                <span className="sep"> {c.knownMatch.separationArcsec.toFixed(1)}″ away</span>
              </>
            ) : (
              'Unknown'
            )}
          </dd>
        </div>
      </dl>
      <div className="decide">
        <button className="btn btn-mint" disabled={saving} onClick={() => onStatus('confirmed')}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Confirm
        </button>
        <button className="btn btn-coral" disabled={saving} onClick={() => onStatus('rejected')}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          Reject
        </button>
      </div>
      <p className="keys muted">
        Keys: <kbd>Space</kbd> flip · <kbd>C</kbd> confirm · <kbd>R</kbd> reject
      </p>
      {c.status !== 'pending' && (
        <button className="link-btn" disabled={saving} onClick={() => onStatus('pending')}>
          Undo, mark as pending
        </button>
      )}
    </div>
  );
}
