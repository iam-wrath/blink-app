import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getFrames, getTargets, pngUrl } from '../api';
import type { FrameMode, FrameQuery, FramesResponse, Target } from '../types';
import { Btn } from './ui';

// Time-lapse viewer for the frames contract: enter RA/Dec (or pick a preset),
// fetch every SPHEREx frame of that patch sorted by date, and play them like a little video.
// The search is mirrored in the URL (?ra=&dec=&fov=&detector=&mode=) so it can be shared or embedded.

const DETECTORS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const DEFAULT: FrameQuery = { ra: 133.7951, dec: -7.2451, fov: 0.1, detector: 'D2', mode: 'raw' };

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
  };
}

function writeUrl(q: FrameQuery) {
  const p = new URLSearchParams({ ra: String(q.ra), dec: String(q.dec), fov: String(q.fov), detector: q.detector, mode: q.mode });
  window.history.replaceState(null, '', `${window.location.pathname}?${p}${window.location.hash}`);
}

const fmtDate = (iso: string) => iso.replace('T', ' ').replace(/(:\d\d)(\.\d+)?Z?$/, '$1 UTC');

export function FramesPage() {
  const fromUrl = queryFromUrl();
  const [form, setForm] = useState({
    ra: String((fromUrl ?? DEFAULT).ra),
    dec: String((fromUrl ?? DEFAULT).dec),
    fov: String((fromUrl ?? DEFAULT).fov),
    detector: (fromUrl ?? DEFAULT).detector,
    mode: (fromUrl ?? DEFAULT).mode,
  });
  const [targets, setTargets] = useState<Target[]>([]);
  const [resp, setResp] = useState<FramesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(2);

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
    const q: FrameQuery = { ra: parseFloat(form.ra), dec: parseFloat(form.dec), fov: parseFloat(form.fov), detector: form.detector, mode: form.mode };
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
    const q: FrameQuery = { ra: t.ra, dec: t.dec, fov: t.fov, detector, mode: form.mode };
    setForm({ ...form, ra: String(t.ra), dec: String(t.dec), fov: String(t.fov), detector });
    search(q);
  };

  const frame = resp && n ? resp.frames[Math.min(idx, n - 1)] : null;
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
        {field('ra', 'Right Ascension (RA)', 'degrees, 0 to 360')}
        {field('dec', 'Declination (Dec)', 'degrees, −90 to 90')}
        {field('fov', 'Field of view', 'degrees; larger is slower')}
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
              <input type="radio" name="mode" checked={form.mode === m} onChange={() => setForm({ ...form, mode: m })} /> {m === 'raw' ? 'Raw' : 'Difference (minus first)'}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn wide" disabled={loading}>
          {loading ? 'Searching SPHEREx…' : 'Show frames'}
        </button>
        <p className="muted small m0">Data: NASA SPHEREx via NASA/IPAC IRSA. The link in your address bar repeats this search.</p>
      </form>

      <main className="main dark">
        <div className="head">
          <h1>Time-lapse</h1>
          {resp && <span className="muted">{n} frames · {resp.query.detector} · {resp.query.mode}</span>}
        </div>
        <p className="warn m0" role="status" aria-live="polite">
          {loading ? 'Fetching frames from the archive (first search of a spot can take a few minutes)…' : err}
        </p>

        {frame && resp && (
          <div className="cols">
            <div className="col-img">
              <img
                src={pngUrl(frame.png)}
                alt={`SPHEREx frame ${idx + 1} of ${n}, ${fmtDate(frame.obsTime)}`}
                width={resp.imageSize.width}
                height={resp.imageSize.height}
                style={{ width: '100%', height: 'auto', imageRendering: 'pixelated', border: '1px solid #555', background: '#111' }}
              />
              <div className="row-wrap">
                <Btn onClick={() => setPlaying(!playing)} on={playing} disabled={n < 2}>
                  {playing ? 'Pause' : 'Play'}
                </Btn>
                <Btn small onClick={() => { setPlaying(false); setIdx((idx - 1 + n) % n); }} disabled={n < 2}>
                  ◀ Prev
                </Btn>
                <Btn small onClick={() => { setPlaying(false); setIdx((idx + 1) % n); }} disabled={n < 2}>
                  Next ▶
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
              </div>
              <label className="slider">
                Date: {fmtDate(frame.obsTime)} (frame {idx + 1} of {n})
                <input type="range" min={0} max={n - 1} step={1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} />
              </label>
              <p className="muted small m0">
                {fmtDate(resp.frames[0].obsTime)} → {fmtDate(resp.frames[n - 1].obsTime)}
              </p>
            </div>

            <div className="col-info">
              <h2>This frame</h2>
              <table className="kv">
                <tbody>
                  <tr><td>Date</td><td>{fmtDate(frame.obsTime)}</td></tr>
                  <tr><td>Wavelength</td><td>{frame.wavelengthUm.toFixed(3)} µm</td></tr>
                  <tr><td>Detector</td><td>{frame.detector}</td></tr>
                  <tr><td>Release</td><td>{frame.release || '—'}</td></tr>
                  <tr><td>Flags</td><td>{frame.flags}</td></tr>
                  <tr><td>Frame id</td><td className="small">{frame.id}</td></tr>
                </tbody>
              </table>
              <p className="muted small m0">
                Wavelengths in this series: {Math.min(...waves).toFixed(3)}–{Math.max(...waves).toFixed(3)} µm. SPHEREx sees a slightly different
                infrared colour on each visit, so some brightness changes are colour, not motion.
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
