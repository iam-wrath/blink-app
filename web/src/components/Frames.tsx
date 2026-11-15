import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getFrames, getTargets, pngUrl } from '../api';
import type { FrameMode, FrameQuery, FramesResponse, Target } from '../types';
import { motion } from 'motion/react';
import { Btn, Check } from './ui';

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PLAY = 'M4 2.5v11l9-5.5z';
const PAUSE = 'M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z';
const PREV = 'M11.5 2.5v11L4 8z';
const NEXT = 'M4.5 2.5v11L12 8z';

// Red cross-hair with an open centre at the searched position, so the target itself stays visible.
// Its position is where the target was at the catalogue epoch; a fast mover drifts out of the gap over the year.
function TargetMarker({ w, h, at }: { w: number; h: number; at?: { x: number; y: number } }) {
  const { x, y } = at ?? { x: w / 2, y: h / 2 };
  const gap = Math.max(w, h) * 0.045;
  const len = Math.max(w, h) * 0.07;
  const sw = Math.max(w, h) * 0.006;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <g stroke="#ff3b30" strokeWidth={sw} strokeLinecap="round">
        <line x1={x - gap - len} y1={y} x2={x - gap} y2={y} />
        <line x1={x + gap} y1={y} x2={x + gap + len} y2={y} />
        <line x1={x} y1={y - gap - len} x2={x} y2={y - gap} />
        <line x1={x} y1={y + gap} x2={x} y2={y + gap + len} />
      </g>
    </svg>
  );
}

// Time-lapse viewer for the frames contract: enter RA/Dec (or pick a preset),
// fetch every SPHEREx frame of that patch sorted by date, and play them like a little video.
// The search is mirrored in the URL (?ra=&dec=&fov=&detector=&mode=) so it can be shared or embedded.

const DETECTORS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const DEFAULT: FrameQuery = { ra: 133.7951, dec: -7.2451, fov: 0.1, detector: 'D2', mode: 'raw', coadd: 'none' };

function queryFromUrl(): FrameQuery | null {
  const p = new URLSearchParams(window.location.search);
  const ra = parseFloat(p.get('ra') ?? '');
  const dec = parseFloat(p.get('dec') ?? '');
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  const fov = parseFloat(p.get('fov') ?? '');
  const det = p.get('detector') ?? '';
  return {
    ra,
    dec,
    fov: Number.isFinite(fov) && fov > 0 ? fov : DEFAULT.fov,
    detector: DETECTORS.includes(det) ? det : DEFAULT.detector,
    mode: p.get('mode') === 'diff' ? 'diff' : 'raw',
    coadd: p.get('coadd') === 'visit' ? 'visit' : 'none',
  };
}

function writeUrl(q: FrameQuery) {
  const p = new URLSearchParams({ ra: String(q.ra), dec: String(q.dec), fov: String(q.fov), detector: q.detector, mode: q.mode });
  if (q.coadd === 'visit') p.set('coadd', 'visit');
  window.history.replaceState(null, '', `${window.location.pathname}?${p}${window.location.hash}`);
}

// Which part of the spectrum a wavelength is in (astronomers' ranges), and its frequency.
// SPHEREx covers 0.75–5 µm, which is all near-infrared.
function bandName(um: number) {
  if (um < 0.38) return 'Ultraviolet';
  if (um < 0.75) return 'Visible light';
  if (um < 5) return 'Near-infrared';
  if (um < 25) return 'Mid-infrared';
  return 'Far-infrared';
}
const frequencyTHz = (um: number) => 299.792458 / um; // c / wavelength

const fmtDate = (iso: string) => iso.replace('T', ' ').replace(/(:\d\d)(\.\d+)?Z?$/, '$1 UTC');

export function FramesPage() {
  const fromUrl = queryFromUrl();
  const [form, setForm] = useState({
    ra: String((fromUrl ?? DEFAULT).ra),
    dec: String((fromUrl ?? DEFAULT).dec),
    fov: String((fromUrl ?? DEFAULT).fov),
    detector: (fromUrl ?? DEFAULT).detector,
    mode: (fromUrl ?? DEFAULT).mode,
    coadd: (fromUrl ?? DEFAULT).coadd,
  });
  const [targets, setTargets] = useState<Target[]>([]);
  const [resp, setResp] = useState<FramesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(2);
  const [showMarker, setShowMarker] = useState(true);

  const search = useCallback(async (q: FrameQuery) => {
    writeUrl(q);
    setLoading(true);
    setErr('');
    setPlaying(false);
    try {
      const r = await getFrames(q);
      setResp(r);
      setIdx(0);
      if (r.frames.length === 0) setErr('No SPHEREx images found for this position, field of view and detector.');
      else setPlaying(r.frames.length > 1);
    } catch (e) {
      setResp(null);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // presets, and restore a search from the URL on first load
  useEffect(() => {
    getTargets()
      .then(setTargets)
      .catch(() => setErr('Cannot load the preset targets from the API.'));
    const q = queryFromUrl();
    if (q) search(q);
  }, [search]);

  // playback
  const n = resp?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % n), 1000 / fps);
    return () => window.clearInterval(t);
  }, [playing, n, fps]);

  // preload all frames so playback does not flicker
  useEffect(() => {
    resp?.frames.forEach((f) => {
      new Image().src = pngUrl(f.png);
    });
  }, [resp]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q: FrameQuery = { ra: parseFloat(form.ra), dec: parseFloat(form.dec), fov: parseFloat(form.fov), detector: form.detector, mode: form.mode, coadd: form.coadd };
    if (!Number.isFinite(q.ra) || !Number.isFinite(q.dec) || !Number.isFinite(q.fov) || q.fov <= 0) {
      setErr('RA, Dec and field of view must be numbers (degrees), and the field of view must be above 0.');
      return;
    }
    search(q);
  };

  const pickPreset = (name: string) => {
    const t = targets.find((x) => x.name === name);
    if (!t) return;
    const detector = t.detector && DETECTORS.includes(t.detector) ? t.detector : form.detector;
    const coadd = t.coadd === 'visit' ? 'visit' : 'none';   // faint targets (WISE 0855) come with co-adding on
    const q: FrameQuery = { ra: t.ra, dec: t.dec, fov: t.fov, detector, mode: form.mode, coadd };
    setForm({ ...form, ra: String(t.ra), dec: String(t.dec), fov: String(t.fov), detector, coadd });
    search(q);
  };

  const frame = resp && n ? resp.frames[Math.min(idx, n - 1)] : null;
  // name the target when the search is one of the presets
  const named = resp ? targets.find((t) => Math.abs(t.ra - resp.query.ra) < 1e-3 && Math.abs(t.dec - resp.query.dec) < 1e-3) : undefined;
  const waves = resp?.frames.map((f) => f.wavelengthUm) ?? [];
  const field = (key: 'ra' | 'dec' | 'fov', label: string, hint: string) => (
    <label className="slider">
      {label}
      <input inputMode="decimal" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} aria-describedby={`${key}-hint`} />
      <span id={`${key}-hint`} className="muted small">{hint}</span>
    </label>
  );

  return (
    <>
      <form className="panel" onSubmit={submit} aria-label="Search">
        <label className="slider">
          Preset target
          <select value="" onChange={(e) => pickPreset(e.target.value)}>
            <option value="">Choose a target…</option>
            {targets.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {field('ra', 'Right Ascension', '0 to 360°')}
        {field('dec', 'Declination', '−90 to 90°')}
        {field('fov', 'Field of view', 'degrees')}
        <label className="slider">
          Detector
          <select value={form.detector} onChange={(e) => setForm({ ...form, detector: e.target.value })}>
            {DETECTORS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <fieldset className="radios inline">
          <legend>Mode</legend>
          {(['raw', 'diff'] as FrameMode[]).map((m) => (
            <label key={m} className="check">
              <input type="radio" name="mode" checked={form.mode === m} onChange={() => setForm({ ...form, mode: m })} /> {m === 'raw' ? 'Raw' : 'Difference'}
            </label>
          ))}
        </fieldset>
        <Check checked={form.coadd === 'visit'} onChange={(v) => setForm({ ...form, coadd: v ? 'visit' : 'none' })}>
          Co-add each visit (less noise)
        </Check>
        <button type="submit" className="btn primary wide" disabled={loading}>
          {loading ? 'Searching SPHEREx…' : 'Show frames'}
        </button>
      </form>

      <main id="main" className="main">
        <div className="head">
          <h1>{named ? named.name : 'Time-lapse'}</h1>
          {resp && (
            <span className="mono">
              {n} {resp.query.coadd === 'visit' ? 'co-added visits' : 'frames'} · {resp.query.detector} · {resp.query.mode}
            </span>
          )}
        </div>
        <p className="status" role="status" aria-live="polite">
          {loading ? 'Fetching frames. A new spot can take a few minutes.' : err}
        </p>
        {loading && <div className="loading-bar" aria-hidden="true" />}
        {!resp && !loading && !err && (
          <p className="empty">Choose a target, or enter coordinates.</p>
        )}

        {frame && resp && (
          <motion.div className="cols" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}>
            <div className="col-img">
              <div className="stage">
                <img
                  src={pngUrl(frame.png)}
                  alt={`SPHEREx frame ${idx + 1} of ${n}, ${fmtDate(frame.obsTime)}`}
                  width={resp.imageSize.width}
                  height={resp.imageSize.height}
                />
                {showMarker && <TargetMarker w={resp.imageSize.width} h={resp.imageSize.height} at={resp.target} />}
              </div>
              <div className="row-wrap">
                <Btn onClick={() => setPlaying(!playing)} on={playing} disabled={n < 2}>
                  <Icon d={playing ? PAUSE : PLAY} />
                  {playing ? 'Pause' : 'Play'}
                </Btn>
                <Btn small onClick={() => { setPlaying(false); setIdx((idx - 1 + n) % n); }} disabled={n < 2}>
                  <Icon d={PREV} />
                  Prev
                </Btn>
                <Btn small onClick={() => { setPlaying(false); setIdx((idx + 1) % n); }} disabled={n < 2}>
                  Next
                  <Icon d={NEXT} />
                </Btn>
                <label className="check small">
                  Speed
                  <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                    {[1, 2, 4, 8].map((v) => (
                      <option key={v} value={v}>
                        {v} fps
                      </option>
                    ))}
                  </select>
                </label>
                <Check checked={showMarker} onChange={setShowMarker}>
                  <span className="small">Mark target</span>
                </Check>
              </div>
              <label className="slider">
                {fmtDate(frame.obsTime)} · {idx + 1} of {n}
                <input type="range" min={0} max={n - 1} step={1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} />
              </label>
            </div>

            <div className="col-info">
              <table className="kv">
                <tbody>
                  <tr><td>Date</td><td>{fmtDate(frame.obsTime)}</td></tr>
                  <tr><td>Wavelength</td><td>{frame.wavelengthUm.toFixed(3)} µm</td></tr>
                  <tr><td>Band</td><td>{bandName(frame.wavelengthUm)}</td></tr>
                  <tr><td>Frequency</td><td>{frequencyTHz(frame.wavelengthUm).toFixed(1)} THz</td></tr>
                  <tr><td>Detector</td><td>{frame.detector}</td></tr>
                  <tr><td>Release</td><td>{frame.release || '—'}</td></tr>
                  <tr><td>Flags</td><td>{frame.flags}</td></tr>
                  {frame.nFrames !== undefined && <tr><td>Frames co-added</td><td>{frame.nFrames}</td></tr>}
                  <tr><td>Frame id</td><td className="small">{frame.id}</td></tr>
                </tbody>
              </table>
              <p className="muted small m0">
                Wavelength varies by frame ({Math.min(...waves).toFixed(2)}–{Math.max(...waves).toFixed(2)} µm), so some changes are colour, not motion.
              </p>
            </div>
          </motion.div>
        )}
      </main>
    </>
  );
}
