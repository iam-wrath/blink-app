import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { fakeResponse, saveFakeStatus } from './fakeData';
import type { DetectResponse, Source, Status, Summary } from './types';
import { INITIAL, loadSaved, storeSaved, type Ctx, type Page, type SavedItem, type St, type Team } from './state';
import { useRealDiff } from './lib/realDiff';
import { model, simTarget, isTeam } from './lib/model';
import { ComparePage, compareView } from './components/Compare';
import { ExplorePage } from './components/Explore';
import { DiscPage } from './components/Discoveries';
import { AboutPage, SavedPage } from './components/SavedAbout';

const PAGES: [Page, string][] = [
  ['compare', 'Compare'],
  ['explore', 'Sky Explorer'],
  ['disc', 'Discoveries'],
  ['saved', 'Saved'],
  ['about', 'About'],
];
const pageFromHash = (): Page => {
  const h = window.location.hash.replace('#', '') as Page;
  return PAGES.some(([p]) => p === h) ? h : 'compare';
};

export default function App() {
  const [S, setS] = useState<St>(() => ({ ...INITIAL, page: pageFromHash(), saved: loadSaved() }));
  const set = useCallback((p: Partial<St>) => setS((s) => ({ ...s, ...p })), []);
  const ref = useRef(S);
  ref.current = S;

  // ---------- team data (Kwaku's API, or the built-in sample) ----------
  const [data, setData] = useState<DetectResponse | null>(null);
  const [source, setSource] = useState<Source>(api.FORCE_FAKE ? 'fake' : 'api');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [teamRunning, setTeamRunning] = useState(false);

  const say = useCallback((t: string) => {
    set({ toast: t });
    window.clearTimeout((say as unknown as { t?: number }).t);
    (say as unknown as { t?: number }).t = window.setTimeout(() => set({ toast: '' }), 2600);
  }, [set]);

  const refreshSummary = useCallback(async (d: DetectResponse, src: Source) => {
    if (src === 'api') {
      try {
        setSummary(await api.getSummary());
        return;
      } catch {
        /* count locally */
      }
    }
    setSummary(api.summarize(d));
  }, []);

  const show = useCallback(
    (d: DetectResponse, src: Source) => {
      setData(d);
      setSource(src);
      refreshSummary(d, src);
    },
    [refreshSummary],
  );

  useEffect(() => {
    (async () => {
      if (api.FORCE_FAKE) return show(fakeResponse(), 'fake');
      try {
        show(await api.getCandidates(), 'api');
      } catch (e) {
        console.warn('[blink] API not reachable, using the built-in sample', e);
        show(fakeResponse(), 'fake');
      }
    })();
  }, [show]);

  const sorted = useMemo(() => (data ? [...data.candidates].sort((a, b) => b.confidence - a.confidence) : []), [data]);
  const urls = api.imageUrls(source);
  const rd = useRealDiff(data ? urls.a : null, data ? urls.b : null, urls.diff);

  const setTeamStatus = useCallback(
    async (id: string, status: Status) => {
      if (!data) return;
      const prev = data;
      const next = { ...data, candidates: data.candidates.map((c) => (c.id === id ? { ...c, status } : c)) };
      setData(next);
      const msg = status === 'pending' ? `${id} back to not reviewed` : `${id} ${status}`;
      if (source === 'fake') {
        saveFakeStatus(id, status);
        setSummary(api.summarize(next));
        return say(msg + ' (sample data, saved in this browser)');
      }
      try {
        await api.setStatus(id, status);
        await refreshSummary(next, 'api');
        say(msg);
      } catch (e) {
        console.error(e);
        setData(prev);
        say(`Couldn’t save ${id}: is the API running, and does it have PATCH /api/candidates/:id?`);
      }
    },
    [data, source, refreshSummary, say],
  );

  const runTeam = useCallback(async () => {
    setTeamRunning(true);
    try {
      if (api.FORCE_FAKE) {
        await new Promise((r) => setTimeout(r, 900));
        show(fakeResponse(), 'fake');
      } else {
        const d = await api.runDetect(ref.current.th >= 12 ? 5.0 : 5.0);
        show(d, 'api');
        say(`Detection finished: ${d.candidates.length} candidates`);
      }
    } catch (e) {
      console.error(e);
      say('Detection failed or POST /api/detect is not there yet. Keeping the last result.');
    } finally {
      setTeamRunning(false);
    }
  }, [show, say]);

  const team: Team = { data, source, summary, urls, sorted, setStatus: setTeamStatus, run: runTeam, running: teamRunning, rd };

  // ---------- saving ----------
  const tgName = isTeam(S) ? `Team data · ${data?.regionId ?? 'region-01'}` : simTarget(S).n;
  const save: Ctx['save'] = (item) => {
    const cur = ref.current;
    const full: SavedItem = { ...item, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), note: '', name: tgName, src: cur.src, custom: cur.custom ?? undefined };
    const dup = cur.saved.some((o) => o.type === full.type && o.src === full.src && o.A === full.A && o.B === full.B && o.f === full.f && o.x === full.x && o.y === full.y);
    if (dup) return say('Already in My observations');
    const saved = [full, ...cur.saved];
    storeSaved(saved);
    set({ saved });
    say('Saved to My observations');
  };
  const ctx: Ctx = { S, set, team, say, save, tgName };

  // ---------- page in the address bar ----------
  useEffect(() => {
    const on = () => set({ page: pageFromHash() });
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [set]);
  useEffect(() => {
    if (window.location.hash.replace('#', '') !== S.page) window.location.hash = S.page;
  }, [S.page]);

  // ---------- timers: blink, time machine ----------
  useEffect(() => {
    const last = { blink: 0, tm: 0, xb: 0 };
    const t = setInterval(() => {
      const s = ref.current;
      const now = Date.now();
      const up: Partial<St> = {};
      if (s.page === 'compare' && s.playing && s.mode === 'blink' && now - last.blink >= s.interval) {
        up.epoch = s.epoch === 'A' ? 'B' : 'A';
        last.blink = now;
      }
      if (s.page === 'explore' && s.xplay && now - last.tm >= 1400 / s.speed) {
        last.tm = now;
        if (s.xc < 7) up.xc = s.xc + 1;
        else if (s.loop) up.xc = 0;
        else up.xplay = false;
      }
      if (s.page === 'explore' && s.xblink && now - last.xb >= 400) {
        up.bph = !s.bph;
        last.xb = now;
      }
      if (Object.keys(up).length) setS((x) => ({ ...x, ...up }));
    }, 50);
    return () => clearInterval(t);
  }, []);

  // ---------- keyboard (Compare) ----------
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      const s = ref.current;
      if (s.page !== 'compare' || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const { shown, selIdx, sel, m } = compareView({ ...ctx, S: s });
      const k = e.key.toLowerCase();
      const status = (v: Status) => {
        if (!sel) return;
        if (m.team) setTeamStatus(sel.key, v);
        else {
          const tg = simTarget(s);
          set({ simStatus: { ...s.simStatus, [`${tg.key}|${s.A}|${s.B}|${sel.key}`]: v } });
        }
      };
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) set({ playing: false, mode: 'blink', epoch: s.epoch === 'A' ? 'B' : 'A' });
      } else if (k === 'p') set({ playing: !s.playing, mode: 'blink' });
      else if (k === 'c') status('confirmed');
      else if (k === 'r') status('rejected');
      else if (k === 'u') status('pending');
      else if ((k === 'j' || k === 'arrowright') && shown.length) set({ sel: (selIdx + 1) % shown.length });
      else if ((k === 'k' || k === 'arrowleft') && shown.length) set({ sel: (selIdx - 1 + shown.length) % shown.length });
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && ref.current.page === 'compare' && !typing(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const savedN = S.saved.length;
  void model;

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
            <span className="brand-sub">SPHEREx moving-object finder</span>
          </div>
        </div>
        <nav className="menu" aria-label="Pages">
          {PAGES.map(([p, label]) => (
            <button key={p} type="button" className={S.page === p ? 'on' : ''} aria-current={S.page === p ? 'page' : undefined} onClick={() => set({ page: p })}>
              {label}
              {p === 'saved' && savedN ? ` (${savedN})` : ''}
            </button>
          ))}
        </nav>
      </header>
      <div className="body">
        {S.page === 'compare' && <ComparePage {...ctx} />}
        {S.page === 'explore' && <ExplorePage {...ctx} />}
        {S.page === 'disc' && <DiscPage {...ctx} />}
        {S.page === 'saved' && <SavedPage {...ctx} />}
        {S.page === 'about' && <AboutPage />}
      </div>
    </div>
  );
}
