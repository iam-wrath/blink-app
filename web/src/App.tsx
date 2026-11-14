import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { fakeResponse, saveFakeStatus } from './fakeData';
import type { DetectResponse, Source, Status, Summary } from './types';
import { Viewer, type Epoch, type Mode } from './components/Viewer';
import { CandidateCard, Queue, RunCard } from './components/Inspector';
import { HelpDialog, Sidebar, TopBar, type Route } from './components/Chrome';
import { AboutPage, CandidatesPage } from './components/Pages';
import { centerOn, HOME, zoomAt, type View } from './lib/view';
import { passes, type Filter } from './lib/status';

const ROUTES: Route[] = ['compare', 'candidates', 'about'];
const routeFromHash = (): Route => {
  const h = window.location.hash.replace('#', '') as Route;
  return ROUTES.includes(h) ? h : 'compare';
};

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'err';
}

export default function App() {
  const [data, setData] = useState<DetectResponse | null>(null);
  const [source, setSource] = useState<Source>(api.FORCE_FAKE ? 'fake' : 'api');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(routeFromHash);

  // viewer state
  const [mode, setMode] = useState<Mode>('blink');
  const [epoch, setEpoch] = useState<Epoch>('B');
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(2);
  const [split, setSplit] = useState(50);
  const [gain, setGain] = useState(4);
  const [view, setView] = useState<View>(HOME);
  const [markers, setMarkers] = useState(true);
  const [labels, setLabels] = useState(true);

  // review state
  const [filter, setFilter] = useState<Filter>('all');
  const [minConf, setMinConf] = useState(0);
  const [threshold, setThreshold] = useState(5);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [help, setHelp] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const refreshSummary = useCallback(async (d: DetectResponse, src: Source) => {
    if (src === 'api') {
      try {
        setSummary(await api.getSummary());
        return;
      } catch {
        /* count locally instead */
      }
    }
    setSummary(api.summarize(d));
  }, []);

  const show = useCallback(
    (d: DetectResponse, src: Source) => {
      setData(d);
      setSource(src);
      setSelectedId((cur) =>
        d.candidates.some((c) => c.id === cur) ? cur : ([...d.candidates].sort((a, b) => b.confidence - a.confidence)[0]?.id ?? null),
      );
      refreshSummary(d, src);
    },
    [refreshSummary],
  );

  // First load: the API if it answers, otherwise sample data so work never stops.
  useEffect(() => {
    (async () => {
      if (api.FORCE_FAKE) return show(fakeResponse(), 'fake');
      try {
        show(await api.getCandidates(), 'api');
      } catch (e) {
        console.warn('[blink] API not reachable, using sample data', e);
        show(fakeResponse(), 'fake');
        toast(`API not reachable at ${api.API_URL}. Showing sample data.`, 'err');
      }
    })();
  }, [show, toast]);

  // Auto-blink
  useEffect(() => {
    if (!playing || mode !== 'blink') return;
    const t = setInterval(() => setEpoch((e) => (e === 'A' ? 'B' : 'A')), 1000 / (rate * 2));
    return () => clearInterval(t);
  }, [playing, rate, mode]);

  const sorted = useMemo(() => (data ? [...data.candidates].sort((a, b) => b.confidence - a.confidence) : []), [data]);
  const visible = useMemo(() => sorted.filter((c) => passes(c, filter, minConf) || c.id === selectedId), [sorted, filter, minConf, selectedId]);
  const queue = useMemo(() => sorted.filter((c) => passes(c, filter, minConf)), [sorted, filter, minConf]);
  const selected = sorted.find((c) => c.id === selectedId) ?? null;
  const qIndex = Math.max(0, queue.findIndex((c) => c.id === selectedId));

  const select = useCallback((id: string) => setSelectedId(id), []);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!queue.length) return;
      const i = queue.findIndex((c) => c.id === selectedId);
      const next = queue[(i + dir + queue.length) % queue.length];
      setSelectedId(next.id);
      if (view.zoom > 1 && data) setView(centerOn(next.x / data.imageSize.width, next.y / data.imageSize.height, view.zoom));
    },
    [queue, selectedId, view.zoom, data],
  );

  const onStatus = useCallback(
    async (status: Status) => {
      if (!data || !selected) return;
      const id = selected.id;
      const prev = data;
      const next = { ...data, candidates: data.candidates.map((c) => (c.id === id ? { ...c, status } : c)) };
      setData(next);
      const msg = status === 'pending' ? `${id} back to unreviewed` : `${id} ${status}`;
      if (source === 'fake') {
        saveFakeStatus(id, status);
        setSummary(api.summarize(next));
        toast(msg);
        return;
      }
      setSaving(true);
      try {
        await api.setStatus(id, status);
        await refreshSummary(next, 'api');
        toast(msg);
      } catch (e) {
        console.error(e);
        setData(prev);
        toast(`Couldn't save ${id}. Is the API running?`, 'err');
      } finally {
        setSaving(false);
      }
    },
    [data, selected, source, refreshSummary, toast],
  );

  const onRun = useCallback(async () => {
    setRunning(true);
    try {
      if (api.FORCE_FAKE) {
        await new Promise((r) => setTimeout(r, 1400));
        show(fakeResponse(), 'fake');
        toast('Sample detection finished');
      } else {
        const d = await api.runDetect(threshold);
        show(d, 'api');
        toast(`Detection finished: ${d.candidates.length} candidates`);
      }
    } catch (e) {
      console.error(e);
      toast('Detection failed or the API is down. Keeping the last result.', 'err');
    } finally {
      setRunning(false);
    }
  }, [show, threshold, toast]);

  const jump = useCallback(
    (q: string): string | null => {
      const t = q.trim();
      if (!t || !data) return null;
      const byId = sorted.find((c) => c.id.toLowerCase() === t.toLowerCase() || c.id.toLowerCase().endsWith(t.toLowerCase()));
      const nums = t.split(/[\s,]+/).map(Number);
      let target = byId;
      if (!target && nums.length === 2 && nums.every(Number.isFinite)) {
        const [ra, dec] = nums;
        target = [...sorted].sort(
          (a, b) => Math.hypot((a.ra - ra) * Math.cos((dec * Math.PI) / 180), a.dec - dec) - Math.hypot((b.ra - ra) * Math.cos((dec * Math.PI) / 180), b.dec - dec),
        )[0];
      }
      if (!target) return 'No match';
      setSelectedId(target.id);
      setFilter('all');
      setMinConf(0);
      window.location.hash = 'compare';
      setView(centerOn(target.x / data.imageSize.width, target.y / data.imageSize.height, 3));
      return null;
    },
    [data, sorted],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.getAttribute('role') === 'slider');
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') return setHelp(false);
      if (typing(e.target) || help) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return;
        setPlaying(false);
        setMode('blink');
        setEpoch((x) => (x === 'A' ? 'B' : 'A'));
        return;
      }
      const map: Record<string, () => void> = {
        p: () => {
          setMode('blink');
          setPlaying((x) => !x);
        },
        '1': () => setMode('blink'),
        '2': () => setMode('wipe'),
        '3': () => setMode('side'),
        '4': () => setMode('diff'),
        j: () => step(1),
        arrowright: () => step(1),
        k: () => step(-1),
        arrowleft: () => step(-1),
        c: () => onStatus('confirmed'),
        r: () => onStatus('rejected'),
        u: () => onStatus('pending'),
        f: () => selected && data && setView(centerOn(selected.x / data.imageSize.width, selected.y / data.imageSize.height, Math.max(3, view.zoom))),
        '+': () => setView((v) => zoomAt(v, 0.5, 0.5, v.zoom * 1.5)),
        '=': () => setView((v) => zoomAt(v, 0.5, 0.5, v.zoom * 1.5)),
        '-': () => setView((v) => zoomAt(v, 0.5, 0.5, v.zoom / 1.5)),
        '0': () => setView(HOME),
        m: () => setMarkers((x) => !x),
        l: () => setLabels((x) => !x),
        '?': () => setHelp(true),
      };
      const fn = map[k];
      if (fn && route === 'compare') {
        e.preventDefault();
        fn();
      } else if (k === '?') setHelp(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [help, onStatus, route, selected, step, data, view.zoom]);

  if (!data) {
    return (
      <div className="boot">
        <span className="spinner" /> <span className="mono">CONNECTING TO SKY DATA…</span>
      </div>
    );
  }

  const urls = api.imageUrls(source);

  return (
    <div className="app">
      <Sidebar route={route} source={source} apiUrl={api.API_URL} regionId={data.regionId} onHelp={() => setHelp(true)} />
      <div className="main-col">
        <TopBar summary={summary} onJump={jump} />
        {route === 'compare' && (
          <>
            <div className="ribbon">
              <span className="mono cyan-text">
                <i className="pulse" /> DUAL-EPOCH COMPARATOR
              </span>
              <span className="sep" />
              <span className="mono muted">REGION</span>
              <b className="region">{data.regionId}</b>
              <span className="mono chip-dim">
                {data.imageSize.width} × {data.imageSize.height} PX
              </span>
              <span className="grow" />
              <span className="mono chip-dim">
                <i className="dot dot-a" /> EPOCH A
              </span>
              <span className="mono muted">⇄</span>
              <span className="mono chip-dim">
                <i className="dot dot-b" /> EPOCH B
              </span>
              <span className="mono chip-dim">PAN &amp; ZOOM: SYNCED</span>
            </div>
            <main className="workspace">
              <div className="ws-main">
                <Viewer
                  mode={mode}
                  onMode={(m) => {
                    setMode(m);
                    if (m !== 'blink') setPlaying(false);
                  }}
                  epoch={epoch}
                  onFlip={() => {
                    setPlaying(false);
                    setEpoch((x) => (x === 'A' ? 'B' : 'A'));
                  }}
                  playing={playing}
                  onPlaying={setPlaying}
                  rate={rate}
                  onRate={setRate}
                  split={split}
                  onSplit={setSplit}
                  gain={gain}
                  onGain={setGain}
                  markers={markers}
                  onMarkers={setMarkers}
                  labels={labels}
                  onLabels={setLabels}
                  urls={urls}
                  width={data.imageSize.width}
                  height={data.imageSize.height}
                  candidates={visible}
                  all={sorted}
                  selected={selected}
                  onSelect={select}
                  view={view}
                  onView={setView}
                  source={source}
                />
              </div>
              <aside className="ws-side" aria-label="Inspector">
                <CandidateCard
                  c={selected}
                  index={qIndex}
                  count={queue.length}
                  onPrev={() => step(-1)}
                  onNext={() => step(1)}
                  onStatus={onStatus}
                  saving={saving}
                  urls={urls}
                  width={data.imageSize.width}
                  height={data.imageSize.height}
                />
                <RunCard
                  summary={summary}
                  all={sorted}
                  minConf={minConf}
                  onMinConf={setMinConf}
                  threshold={threshold}
                  onThreshold={setThreshold}
                  running={running}
                  onRun={onRun}
                />
                <Queue all={sorted} filter={filter} onFilter={setFilter} minConf={minConf} selectedId={selectedId} onSelect={select} />
              </aside>
            </main>
          </>
        )}
        {route === 'candidates' && (
          <CandidatesPage
            all={sorted}
            filter={filter}
            onFilter={setFilter}
            minConf={minConf}
            onMinConf={setMinConf}
            onOpen={(id) => {
              setSelectedId(id);
              window.location.hash = 'compare';
            }}
          />
        )}
        {route === 'about' && <AboutPage sample={source === 'fake'} />}
      </div>

      {help && <HelpDialog onClose={() => setHelp(false)} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
