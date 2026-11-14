import type { Candidate } from '../types';
import { lookFor } from './SkyImage';

interface Props {
  candidates: Candidate[]; // already sorted by confidence
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// J5: list sorted by confidence. Clicking a row selects the same ring on the sky.
export function CandidateList({ candidates, selectedId, onSelect }: Props) {
  return (
    <div className="card list">
      <h2>
        Candidates <span className="muted small">by confidence</span>
      </h2>
      {candidates.length === 0 ? (
        <p className="empty">No candidates found.</p>
      ) : (
        <ul>
          {candidates.map((c) => {
            const look = lookFor(c);
            const pct = Math.round(c.confidence * 100);
            return (
              <li key={c.id}>
                <button className="row" aria-pressed={c.id === selectedId} onClick={() => onSelect(c.id)}>
                  <span className={`dot ${look.cls}`} aria-hidden="true" />
                  <span className="row-main">
                    <span className="row-top">
                      <span>{c.id}</span>
                      <span className="muted">{look.label}</span>
                    </span>
                    <span className="bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                  <span className="row-pct">{pct}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
