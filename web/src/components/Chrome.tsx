import { useState } from 'react';
import type { Source, Summary } from '../types';
import { Icon } from './Icon';

export type Route = 'compare' | 'candidates' | 'about';

const NAV: { id: Route; label: string; icon: string }[] = [
  { id: 'compare', label: 'Compare images', icon: 'compare' },
  { id: 'candidates', label: 'Candidates', icon: 'list' },
  { id: 'about', label: 'How it works', icon: 'info' },
];

export function Sidebar(p: { route: Route; source: Source; apiUrl: string; regionId: string; onHelp: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand">
          <span className="logo">
            <Icon name="satellite" size={22} />
          </span>
          <span>
            <b>Blink</b>
            <small className="mono">SPHEREX · MOVING-OBJECT FINDER</small>
          </span>
        </div>
        <div className="status-row">
          <span className={`live mono ${p.source}`}>
            <i />
            {p.source === 'api' ? 'API CONNECTED' : 'SAMPLE DATA'}
          </span>
          <span className="mono muted">{p.regionId.toUpperCase()}</span>
        </div>
      </div>
      <nav aria-label="Sections">
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} className={p.route === n.id ? 'nav on' : 'nav'} aria-current={p.route === n.id ? 'page' : undefined}>
            <Icon name={n.icon} size={19} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
      <div className="side-foot">
        <div className="hud-box mono">
          <div>
            <span className="muted">DATA</span>
            <span>{p.source === 'api' ? 'NASA SPHEREx' : 'Simulated sample'}</span>
          </div>
          <div>
            <span className="muted">API</span>
            <span className="ellipsis" title={p.apiUrl}>
              {p.source === 'api' ? p.apiUrl.replace(/^https?:\/\//, '') : 'offline'}
            </span>
          </div>
        </div>
        <button className="ghost small full" onClick={p.onHelp}>
          <Icon name="keyboard" size={15} /> Keyboard shortcuts <kbd>?</kbd>
        </button>
      </div>
    </aside>
  );
}

interface TopProps {
  summary: Summary | null;
  onJump: (q: string) => string | null; // returns an error message, or null when found
}

export function TopBar({ summary, onJump }: TopProps) {
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <header className="topbar">
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const msg = onJump(q);
          setErr(msg);
          // hand the keyboard back to the viewer so Space / C / R work straight away
          if (!msg) (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <Icon name="search" size={17} />
        <label htmlFor="jump" className="sr-only">
          Jump to a candidate
        </label>
        <input
          id="jump"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setErr(null);
          }}
          placeholder="Jump to candidate id, or RA, Dec in degrees…"
          autoComplete="off"
        />
        <span className="mono tagj">[ENTER]</span>
        {err && (
          <span className="search-err" role="alert">
            {err}
          </span>
        )}
      </form>
      <div className="top-stats">
        <span className="pill mono">
          <span className="muted">FOUND</span> <b>{summary?.total ?? '–'}</b>
        </span>
        <span className="pill mono">
          <span className="muted">KNOWN</span> <b className="violet">{summary?.matchedKnown ?? '–'}</b>
        </span>
        <span className="pill mono">
          <span className="muted">UNKNOWN</span> <b className="amber">{summary?.unmatched ?? '–'}</b>
        </span>
        <span className="pill mono">
          <span className="muted">CONFIRMED</span> <b className="cyan">{summary?.confirmed ?? '–'}</b>
        </span>
      </div>
    </header>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Space', 'Flip between epoch A and B'],
    ['P', 'Start / stop auto-blink'],
    ['1 – 4', 'Blink · Wipe · Side by side · Difference'],
    ['J / →', 'Next candidate'],
    ['K / ←', 'Previous candidate'],
    ['C', 'Confirm selected'],
    ['R', 'Reject selected'],
    ['U', 'Undo (back to unreviewed)'],
    ['F', 'Zoom to selected'],
    ['+ / −', 'Zoom in / out'],
    ['0', 'Reset view'],
    ['M / L', 'Show rings / labels'],
    ['Wheel', 'Zoom at the cursor'],
    ['Double-click', 'Zoom in at that spot'],
    ['Drag', 'Pan when zoomed in, or move the wipe line'],
  ];
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <Icon name="keyboard" size={18} className="cyan" />
          <h2 id="help-title">Keyboard shortcuts</h2>
          <button className="icon" onClick={onClose} aria-label="Close" autoFocus>
            <Icon name="x" size={16} />
          </button>
        </div>
        <dl className="keys">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
