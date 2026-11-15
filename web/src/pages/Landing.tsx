import { lazy, Suspense, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getFrames, getTargets, pngUrl } from '../api';
import type { FramesResponse, Target } from '../types';

// three.js is only needed for the hero, so it loads as its own chunk after the text is on screen
const SkySphere = lazy(() => import('../components/SkySphere'));

// One short line per challenge target. Coordinates come from the API (contract/targets.json);
// FALLBACK is only used when the API is not running.
const ABOUT: Record<string, string> = {
  "Barnard's Star": 'The fastest-moving star in the sky.',
  'Epsilon Indi B': 'Two brown dwarfs, drifting together.',
  'WISE 0855': 'A very cold, fast-moving brown dwarf.',
  'RW Aurigae': 'A young star that dims without warning.',
  'R Draconis': 'A red giant that pulses every 245 days.',
};
const FALLBACK: Target[] = [
  { name: "Barnard's Star", ra: 269.44636, dec: 4.76705, fov: 0.2, detector: 'D2' },
  { name: 'WISE 0855', ra: 133.76044, dec: -7.24229, fov: 0.1, detector: 'D6', coadd: 'visit' },
  { name: 'Epsilon Indi B', ra: 331.09562, dec: -56.80083, fov: 0.1, detector: 'D2' },
  { name: 'RW Aurigae', ra: 76.95609, dec: 30.40113, fov: 0.1, detector: 'D2' },
  { name: 'R Draconis', ra: 248.16667, dec: 66.75472, fov: 0.1, detector: 'D2' },
];
const BARNARD = FALLBACK[0];

const searchFor = (t: Target) =>
  `?ra=${t.ra}&dec=${t.dec}&fov=${t.fov}&detector=${t.detector ?? 'D2'}&mode=raw${t.coadd === 'visit' ? '&coadd=visit' : ''}`;

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3l5 5-5 5" />
  </svg>
);

// Content rises in once as it scrolls into view (skipped under reduced motion via MotionConfig)
function Reveal({ children, delay = 0, as = 'div', className }: { children: ReactNode; delay?: number; as?: 'div' | 'li'; className?: string }) {
  const M = as === 'li' ? motion.li : motion.div;
  return (
    <M className={className} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -10% 0px' }} transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </M>
  );
}

// A small live blink loop of Barnard's Star, from the same API the viewer uses
function BarnardLoop() {
  const [resp, setResp] = useState<FramesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(!useReducedMotion());

  useEffect(() => {
    getFrames({ ra: BARNARD.ra, dec: BARNARD.dec, fov: BARNARD.fov, detector: 'D2', mode: 'raw', coadd: 'none' })
      .then((r) => {
        if (!r.frames.length) return setFailed(true);
        r.frames.forEach((f) => { new Image().src = pngUrl(f.png); });
        setResp(r);
      })
      .catch(() => setFailed(true));
  }, []);

  const n = resp?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % n), 450);
    return () => window.clearInterval(t);
  }, [playing, n]);

  const frame = resp?.frames[Math.min(idx, n - 1)];
  return (
    <figure>
      <div className="stage">
        {frame ? (
          <img src={pngUrl(frame.png)} width={resp!.imageSize.width} height={resp!.imageSize.height} alt={`Barnard's Star seen by SPHEREx, frame ${idx + 1} of ${n}`} />
        ) : (
          <p className="demo-note">{failed ? 'The preview needs the Blink API to be running.' : 'Loading…'}</p>
        )}
      </div>
      {frame && (
        <figcaption>
          <span>{frame.obsTime.slice(0, 10)}</span>
          <button type="button" className="btn small" onClick={() => setPlaying(!playing)}>
            {playing ? 'Pause' : 'Play'}
          </button>
        </figcaption>
      )}
    </figure>
  );
}

export function LandingPage({ go }: { go: (search?: string) => void }) {
  const still = !!useReducedMotion();
  const [targets, setTargets] = useState<Target[]>(FALLBACK);

  useEffect(() => {
    getTargets()
      .then((t) => { if (t.length) setTargets([...t].sort((a, b) => Number(b.name === BARNARD.name) - Number(a.name === BARNARD.name))); })
      .catch(() => undefined);
  }, []);

  const link = (search?: string) => ({
    href: `${window.location.pathname}${search ?? ''}#/explore`,
    onClick: (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
      e.preventDefault();
      go(search);
    },
  });

  const rise = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.2, 0.7, 0.2, 1] as const } } };

  return (
    <main id="main" className="landing">
      <motion.section className="wrap hero" aria-labelledby="hero-title" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.1 } } }}>
        <motion.h1 id="hero-title" variants={rise}>Watch the sky move.</motion.h1>
        <motion.p className="lede" variants={rise}>Every SPHEREx image of one patch of sky, played as a time-lapse.</motion.p>
        <motion.div className="actions" variants={rise}>
          <a className="cta primary" {...link()}>Open the viewer</a>
          <a className="cta quiet" {...link(searchFor(BARNARD))}>See Barnard’s Star <Chevron /></a>
        </motion.div>
        <motion.div className="sky-tile" variants={rise}>
          <Suspense fallback={<div className="hero-sky hero-sky-fallback" aria-hidden="true" />}>
            <SkySphere still={still} />
          </Suspense>
        </motion.div>
      </motion.section>

      <section className="wrap section" aria-labelledby="demo-title">
        <Reveal>
          <h2 id="demo-title">Spot the mover.</h2>
          <p className="intro">Thirteen months of Barnard’s Star, in real SPHEREx frames.</p>
        </Reveal>
        <Reveal className="demo" delay={0.08}>
          <BarnardLoop />
        </Reveal>
      </section>

      <section className="wrap section" aria-labelledby="targets-title">
        <Reveal>
          <h2 id="targets-title">Five to watch.</h2>
        </Reveal>
        <ul className="targets">
          {targets.map((t, i) => (
            <Reveal as="li" key={t.name} delay={i * 0.05}>
              <a {...link(searchFor(t))}>
                <h3>{t.name}</h3>
                <span className="what">{ABOUT[t.name] ?? 'A SPHEREx target.'}</span>
                <span className="open">Open <Chevron /></span>
              </a>
            </Reveal>
          ))}
        </ul>
      </section>

      <footer className="wrap foot">
        Images: NASA SPHEREx (NASA / JPL-Caltech) via the NASA/IPAC Infrared Science Archive.
        <br />
        Built for NASA Space Apps 2026 by Albert, Christabel, Kwaku and Jude.
      </footer>
    </main>
  );
}
