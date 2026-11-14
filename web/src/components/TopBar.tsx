import type { Summary } from '../types';
import { Mascot } from './Mascot';

interface Props {
  summary: Summary | null;
  running: boolean;
  onRun: () => void;
}

// J2 + J7: title, summary chips, Run detection.
export function TopBar({ summary, running, onRun }: Props) {
  return (
    <header className="card topbar">
      <div className="brand">
        <Mascot busy={running} />
        <div>
          <h1>Blink</h1>
          <p className="tagline">Flip between skies, find what moved.</p>
        </div>
      </div>
      <div className="topbar-right" aria-live="polite">
        {summary && (
          <>
            <span className="chip chip-cream">{summary.total} found</span>
            <span className="chip chip-lilac">{summary.matchedKnown} known</span>
            <span className="chip chip-sun">{summary.unmatched} unmatched</span>
            <span className="chip chip-mint">{summary.confirmed} confirmed</span>
          </>
        )}
        <button className="btn btn-orange" onClick={onRun} disabled={running}>
          {running ? 'Scanning the sky…' : 'Run detection'}
        </button>
      </div>
    </header>
  );
}
