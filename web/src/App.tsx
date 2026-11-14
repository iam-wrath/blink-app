import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { fakeResponse, saveFakeStatus } from './fakeData';
import type { DetectResponse, Source, Status, Summary } from './types';
import { TopBar } from './components/TopBar';
import { Viewer, type Epoch, type Mode } from './components/Viewer';
import { CandidateList } from './components/CandidateList';
import { DetailPanel } from './components/DetailPanel';
import type { View } from './components/SkyImage';

export default function App() {
  const [data, setData] = useState<DetectResponse | null>(null);
  const [source, setSource] = useState<Source>(api.FORCE_FAKE ? 'fake' : 'api');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('blink');
  const [epoch, setEpoch] = useState<Epoch>('B');
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Summary: from GET /api/summary when the API is up, otherwise counted here.
  const refreshSummary = useCallback(async (d: DetectResponse, src: Source) => {
    if (src === 'api') {
      try {
        setSummary(await api.getSummary());
        return;
      } catch {
        /* fall through to local count */
      }
    }
    setSummary(api.summarize(d));
  }, []);

  const show = useCallback(
    (d: DetectResponse, src: Source) => {
      setData(d);
      setSource(src);
      setSelectedId((cur) =>
        d.candidates.some((c) => c.id === cur)
          ? cur
          : ([...d.candidates].sort((a, b) => b.confidence - a.confidence)[0]?.id ?? null),
      );
      refreshSummary(d, src);
    },
    [refreshSummary],
  );

  // First load: try the API, fall back to sample data so you are never blocked.
  useEffect(() => {
    (async () => {
      if (api.FORCE_FAKE) return show(fakeResponse(), 'fake');
      try {
        show(await api.getCandidates(), 'api');
        setNotice(null);
      } catch (e) {
        console.warn('[blink] API not reachable, using sample data', e);
        show(fakeResponse(), 'fake');
        setNotice(`Can't reach the API at ${api.API_URL}. Showing sample data.`);
      }
    })();
  }, [show]);

  const sorted = useMemo(
    () => (data ? [...data.candidates].sort((a, b) => b.confidence - a.confidence) : []),
    [data],
  );
  const selected = sorted.find((c) => c.id === selectedId) ?? null;

  const onStatus = useCallback(
    async (status: Status) => {
      if (!data || !selected) return;
      const id = selected.id;
      const prev = data;
      const next = { ...data, candidates: data.candidates.map((c) => (c.id === id ? { ...c, status } : c)) };
      setData(next); // update the screen straight away
      if (source === 'fake') {
        saveFakeStatus(id, status);
        setSummary(api.summarize(next));
        return;
      }
      setSaving(true);
      try {
        await api.setStatus(id, status);
        await refreshSummary(next, 'api');
      } catch (e) {
        console.error(e);
        setData(prev); // undo on failure
        setNotice(`Couldn't save ${id}. Is the API running?`);
      } finally {
        setSaving(false);
      }
    },
    [data, selected, source, refreshSummary],
  );

  const onRun = useCallback(async () => {
    setRunning(true);
    setNotice(null);
    try {
      if (source === 'fake' && api.FORCE_FAKE) {
        await new Promise((r) => setTimeout(r, 1200));
        show(fakeResponse(), 'fake');
      } else {
        show(await api.runDetect(), 'api');
      }
    } catch (e) {
      console.error(e);
      setNotice('Detection failed or the API is down. Showing the last result.');
    } finally {
      setRunning(false);
    }
  }, [source, show]);

  // Keyboard: Space = flip, C = confirm, R = reject.
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault(); // no page scroll, no double-click on a focused button
        if (!e.repeat) {
          setMode('blink');
          setEpoch((x) => (x === 'A' ? 'B' : 'A'));
        }
      } else if (e.key === 'c' || e.key === 'C') onStatus('confirmed');
      else if (e.key === 'r' || e.key === 'R') onStatus('rejected');
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
  }, [onStatus]);

  if (!data) {
    return (
      <div className="page">
        <div className="card loading">Loading the sky…</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="wrap">
        <TopBar summary={summary} running={running} onRun={onRun} />
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="link-btn" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}
        <div className="main">
          <Viewer
            mode={mode}
            onMode={setMode}
            epoch={epoch}
            onFlip={() => setEpoch((x) => (x === 'A' ? 'B' : 'A'))}
            urls={api.imageUrls(source)}
            width={data.imageSize.width}
            height={data.imageSize.height}
            candidates={sorted}
            selectedId={selectedId}
            onSelect={setSelectedId}
            view={view}
            onView={setView}
            source={source}
          />
          <aside className="side" aria-label="Candidates">
            <DetailPanel c={selected} onStatus={onStatus} saving={saving} />
            <CandidateList candidates={sorted} selectedId={selectedId} onSelect={setSelectedId} />
          </aside>
        </div>
      </div>
    </div>
  );
}
