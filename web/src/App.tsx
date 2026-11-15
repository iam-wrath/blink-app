import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { FramesPage } from './components/Frames';
import { LandingPage } from './pages/Landing';

// Two pages, no router library:
//   /            landing page
//   /#/explore   the time-lapse viewer
// Any URL with ?ra=&dec= opens the viewer directly, so shared and embedded links keep working.
type Route = 'landing' | 'explore';

function routeFromLocation(): Route {
  const p = new URLSearchParams(window.location.search);
  if (p.has('ra') && p.has('dec')) return 'explore';
  return window.location.hash.startsWith('#/explore') ? 'explore' : 'landing';
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation);

  useEffect(() => {
    const on = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, '', to);
    setRoute(routeFromLocation());
    window.scrollTo(0, 0);
  }, []);
  const base = window.location.pathname;
  const toLanding = base;
  const toExplore = `${base}#/explore`;
  const nav = (to: string) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <a className="skip" href="#main">Skip to content</a>
        <header className="top">
          <a className="brand" href={toLanding} onClick={nav(toLanding)} aria-label="Blink, home">
            <svg width="30" height="20" viewBox="0 0 34 22" aria-hidden="true">
              <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="23" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.5" />
              <circle cx="23" cy="11" r="2.2" fill="#ff3b30" />
            </svg>
            Blink
          </a>
          <nav className="nav" aria-label="Pages">
            <a href={toLanding} onClick={nav(toLanding)} aria-current={route === 'landing' ? 'page' : undefined}>Overview</a>
            <a href={toExplore} onClick={nav(toExplore)} aria-current={route === 'explore' ? 'page' : undefined}>Viewer</a>
          </nav>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={route} className="body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
            {route === 'landing' ? <LandingPage go={(search) => navigate(`${base}${search ?? ''}#/explore`)} /> : <FramesPage />}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
