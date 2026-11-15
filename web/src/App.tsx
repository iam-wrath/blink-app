import { FramesPage } from './components/Frames';

export default function App() {
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
            <circle cx="11" cy="11" r="8" fill="none" stroke="#f2f2f2" strokeWidth="2" />
            <circle cx="23" cy="11" r="8" fill="none" stroke="#f2f2f2" strokeWidth="2" strokeDasharray="3 2.5" />
            <circle cx="23" cy="11" r="2.2" fill="#ff3b30" />
          </svg>
          <div>
            <span className="brand-name">Blink</span>
            <span className="brand-sub">SPHEREx time-lapse viewer</span>
          </div>
        </div>
      </header>
      <div className="body">
        <FramesPage />
      </div>
    </div>
  );
}
