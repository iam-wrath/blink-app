import type { Ctx } from '../state';
import { Btn, Check, KV, Radios, Slider, Spark } from './ui';
import { Sky, type Blob, type Ring } from './Sky';
import { KIND_LABEL, model, simFrames, simTarget, customTarget, type UC } from '../lib/model';
import { DATES, WL, TARGETS, days, PX, hms } from '../lib/sim';
import { changedFraction, profile } from '../lib/realDiff';

export function ringColors(invert: boolean) {
  return invert
    ? { pending: '#3a3a3a', known: '#1d4ed8', confirmed: '#15803d', rejected: '#b91c1c' }
    : { pending: '#d0d0d0', known: '#8fb8ff', confirmed: '#4ade80', rejected: '#ff6b6b' };
}
const TEXT_ON_DARK = { pending: '#d6d6d6', known: '#9cc3ff', confirmed: '#6ee7a0', rejected: '#ff8a8a' };
export const STATUS_LABEL = { pending: 'Not reviewed', confirmed: 'Confirmed', rejected: 'Rejected' } as const;

export function lookOf(c: UC): 'pending' | 'known' | 'confirmed' | 'rejected' {
  if (c.status !== 'pending') return c.status;
  return c.kind === 'known' ? 'known' : 'pending';
}

export function compareView(ctx: Ctx) {
  const { S, team } = ctx;
  const m = model(S, team);
  const shown = m.list.filter((c) => !(S.hideKnown && c.kind === 'known'));
  const showRings = S.rings && (m.team || S.ran);
  const selIdx = Math.min(S.sel, Math.max(0, shown.length - 1));
  const sel: UC | null = (m.team || S.ran) && shown.length ? shown[selIdx] : null;
  return { m, shown, showRings, selIdx, sel };
}

export function ComparePage(ctx: Ctx) {
  const { S, set, team, say } = ctx;
  const { m, shown, showRings, selIdx, sel } = compareView(ctx);
  const z = S.zoom;
  const pal = ringColors(S.invert);
  const ox = sel && z > 1 ? (sel.x / m.w) * 100 : 50;
  const oy = sel && z > 1 ? (sel.y / m.h) * 100 : 50;

  const rings: Ring[] = showRings
    ? shown.map((c, i) => {
        const look = lookOf(c);
        const on = i === selIdx;
        return {
          key: c.key,
          label: `Candidate ${c.label}, ${STATUS_LABEL[c.status]}`,
          l: (c.x / m.w) * 100,
          t: (c.y / m.h) * 100,
          size: on ? 40 : 28,
          color: pal[look],
          border: `${on ? 3 : 2}px ${look === 'pending' ? 'dashed' : 'solid'} ${pal[look]}`,
          onPick: () => set({ sel: i }),
        };
      })
    : [];

  // ---- frame comparison numbers ----
  let fcDays = '—';
  let fcWl = '—';
  let fcPix = '—';
  let prof: number[] = [];
  if (m.team) {
    if (team.rd.diff) {
      fcPix = '≈ ' + (changedFraction(team.rd.diff, S.th) * 100).toFixed(3) + '%';
      prof = profile(team.rd.diff);
    } else fcPix = team.rd.loading ? 'measuring…' : 'needs image access (CORS)';
  } else {
    fcDays = days(S.A, S.B) + ' days';
    fcWl = WL[S.A].toFixed(2) + ' → ' + WL[S.B].toFixed(2) + ' µm';
    const changed = m.evs.reduce((a, e) => a + e.ar * (e.t === 'move' ? 2 : 1), 0);
    fcPix = '≈ ' + ((changed / (1024 * 1024)) * 100).toFixed(3) + '%';
    prof = new Array(50).fill(0);
    m.evs.forEach((e) => {
      const pts = e.t === 'move' && e.s ? [e.s, e.e] : [e.e];
      pts.forEach((pt) => {
        const i = Math.min(49, Math.floor((pt.x / 1024) * 50));
        prof[i] += e.k;
        if (i > 0) prof[i - 1] += e.k * 0.4;
        if (i < 49) prof[i + 1] += e.k * 0.4;
      });
    });
  }
  const mx = Math.max(1, ...prof);
  const pk = prof.indexOf(mx);
  const profD = prof.map((v, i) => (i ? 'L' : 'M') + ((i / Math.max(1, prof.length - 1)) * 200).toFixed(1) + ',' + (46 - (v / mx) * 40).toFixed(1)).join(' ');

  // ---- pictures ----
  const frames = m.team ? null : simFrames(S);
  const diffBlobs: Blob[] = m.team
    ? []
    : m.evs.flatMap((e) => {
        const pc = (v: number) => (v / 1024) * 100;
        if (e.t === 'move' && e.s) return [{ l: pc(e.s.x), t: pc(e.s.y), s: 12, c: '#ffffff' }, { l: pc(e.e.x), t: pc(e.e.y), s: 12, c: '#000000' }];
        return [{ l: pc(e.e.x), t: pc(e.e.y), s: e.t === 'art' ? 6 : 12, c: e.t === 'art' ? '#9a9a9a' : e.t === 'rise' ? '#000000' : '#ffffff' }];
      });
  const filter = `contrast(${S.contrast}%) brightness(${S.brightness}%)`;
  const dateOf = (e: 'A' | 'B') => (m.team ? 'Epoch ' + e : DATES[e === 'A' ? S.A : S.B]);
  const heading = m.team
    ? S.mode === 'blink' ? `Epoch ${S.epoch}` : S.mode === 'wipe' ? 'Epoch A  |  Epoch B' : S.mode === 'side' ? 'Epoch A  vs  Epoch B' : 'Epoch B minus Epoch A'
    : S.mode === 'blink' ? `Epoch ${S.epoch} – ${dateOf(S.epoch)}` : S.mode === 'wipe' ? `${dateOf('A')}  |  ${dateOf('B')}` : S.mode === 'side' ? `${dateOf('A')}  vs  ${dateOf('B')}` : `${dateOf('B')} minus ${dateOf('A')}`;

  const skyCommon = {
    ratio: m.w / m.h,
    filter,
    invert: S.invert,
    split: S.split,
    zoom: z,
    ox,
    oy,
    labels: S.labels,
    onMove: (fx: number, fy: number) => {
      const x = fx * m.w;
      const y = fy * m.h;
      if (!S.cur || Math.abs(S.cur.x - x) > 3 || Math.abs(S.cur.y - y) > 3) set({ cur: { x, y } });
    },
    onLeave: () => set({ cur: null }),
  };
  const sim = frames ? { a: frames.a, b: frames.b, diff: diffBlobs } : undefined;
  const real = m.team ? { a: team.urls.a, b: team.urls.b, diff: team.rd.url } : undefined;
  const offTxt = (x: number, y: number) => {
    const f = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0);
    return m.team ? `pixel ${Math.round(x)}, ${Math.round(y)}` : `${f((x - 512) * PX)}″ x, ${f((y - 512) * PX)}″ y from centre`;
  };

  // ---- actions ----
  const setStatus = (v: 'confirmed' | 'rejected' | 'pending') => {
    if (!sel) return;
    if (m.team) team.setStatus(sel.key, v);
    else {
      const tg = simTarget(S);
      set({ simStatus: { ...S.simStatus, [`${tg.key}|${S.A}|${S.B}|${sel.key}`]: v } });
      say(`${sel.label} ${v === 'pending' ? 'back to not reviewed' : v}`);
    }
  };
  const run = () => {
    if (m.team) return team.run();
    set({ running: true });
    setTimeout(() => {
      const label = `${m.name}: V${S.A + 1} vs V${S.B + 1}, ${m.list.length} found`;
      set({ running: false, ran: true, sel: 0, hist: [{ label, src: S.src, custom: S.custom, A: S.A, B: S.B }, ...S.hist.filter((h) => h.label !== label)].slice(0, 4) });
    }, 800);
  };
  const pickSrc = (src: string) => set({ src, custom: null, A: 0, B: 7, ran: false, sel: 0, pix: null, xc: 0, cur: null });
  const wlDiff = !m.team && Math.abs(WL[S.A] - WL[S.B]) > 0.05;
  const running = m.team ? team.running : S.running;

  return (
    <>
      <aside className="panel" aria-label="Compare controls">
        <div className="group">
          <span>Data</span>
          <div className="row-wrap">
            <Btn small on={S.src === 'team'} onClick={() => pickSrc('team')} title={team.source === 'api' ? 'Kwaku’s API is connected' : 'API not reachable: built-in sample'}>
              Team data{team.source === 'api' ? '' : ' (sample)'}
            </Btn>
            {TARGETS.map((t) => (
              <Btn key={t.key} small on={!S.custom && S.src === t.key} onClick={() => pickSrc(t.key)}>
                {t.key === 'm42' ? 'M42 Orion' : t.key === 'm31' ? 'M31 Andromeda' : 'TRAPPIST-1'}
              </Btn>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const q = S.q.trim();
              if (!q) return;
              const hit = TARGETS.find((t) => q.toLowerCase().replace(/\s/g, '').includes(t.key) || t.n.toLowerCase().includes(q.toLowerCase()));
              if (hit) return pickSrc(hit.key);
              const c = customTarget(q);
              set({ src: c.key, custom: c, A: 0, B: 7, ran: false, sel: 0, pix: null, cur: null });
            }}
          >
            <label className="sr-only" htmlFor="q">
              Any name
            </label>
            <input id="q" value={S.q} onChange={(e) => set({ q: e.target.value })} placeholder="or type any name (simulated)…" />
            <button type="submit" className="btn small">
              Go
            </button>
          </form>
        </div>

        {!m.team && (
          <div className="group">
            <span>Epoch A (earlier)</span>
            <div className="grid4">
              {DATES.map((d, i) => (
                <Btn key={d} small on={S.A === i} title={`${d} · λ ${WL[i].toFixed(2)} µm`} onClick={() => set({ A: i, ran: false, sel: 0 })}>
                  V{i + 1}
                </Btn>
              ))}
            </div>
            <span>Epoch B (later)</span>
            <div className="grid4">
              {DATES.map((d, i) => (
                <Btn key={d} small on={S.B === i} title={`${d} · λ ${WL[i].toFixed(2)} µm`} onClick={() => set({ B: i, ran: false, sel: 0 })}>
                  V{i + 1}
                </Btn>
              ))}
            </div>
            <span className={wlDiff ? 'warn' : 'muted'}>
              λ {WL[S.A].toFixed(2)} → {WL[S.B].toFixed(2)} µm{wlDiff ? ': different colours, some changes may be colour, not movement' : ': similar colours'}
            </span>
          </div>
        )}

        <Radios
          name="mode"
          legend="View"
          value={S.mode}
          onChange={(v) => set({ mode: v })}
          options={[
            ['blink', 'Blink'],
            ['wipe', 'Wipe (slide between dates)'],
            ['side', 'Side by side'],
            ['diff', 'Difference (B minus A)'],
          ]}
        />
        {S.mode === 'blink' && <Slider label={`Blink interval (${S.interval} ms)`} value={S.interval} min={150} max={1500} step={50} onChange={(v) => set({ interval: v })} />}
        {S.mode === 'wipe' && <Slider label={`Wipe position (${S.split}%)`} value={S.split} min={0} max={100} step={1} onChange={(v) => set({ split: v })} />}
        <Slider label={`Zoom (${z.toFixed(1)}×, centred on selected)`} value={z} min={1} max={4} step={0.5} onChange={(v) => set({ zoom: v })} />
        <div className="box">
          <Slider label={`Contrast (${S.contrast}%)`} value={S.contrast} min={50} max={300} step={10} onChange={(v) => set({ contrast: v })} />
          <Slider label={`Brightness (${S.brightness}%)`} value={S.brightness} min={50} max={200} step={10} onChange={(v) => set({ brightness: v })} />
        </div>
        <Slider label={`Sensitivity (${S.th} levels; lower finds fainter changes)`} value={S.th} min={12} max={90} step={2} onChange={(v) => set({ th: v })} />
        <div className="group tight">
          <Check checked={S.playing} onChange={(v) => set({ playing: v })}>
            Blink automatically <kbd>P</kbd>
          </Check>
          <Check checked={S.invert} onChange={(v) => set({ invert: v })}>
            Invert (dark stars on white)
          </Check>
          <Check checked={S.rings} onChange={(v) => set({ rings: v })}>
            Circle the candidates
          </Check>
          <Check checked={S.labels} onChange={(v) => set({ labels: v })}>
            Show candidate names
          </Check>
          {m.team && (
            <Check checked={S.hideKnown} onChange={(v) => set({ hideKnown: v, sel: 0 })}>
              Hide already-known objects
            </Check>
          )}
        </div>
        <Btn wide onClick={run} disabled={running}>
          {running ? 'Running detection…' : 'Run change detection'}
        </Btn>
        <Btn wide onClick={() => ctx.save({ type: 'compare', A: S.A, B: S.B, n: m.list.length })}>Save comparison</Btn>
        <Btn wide onClick={() => set({ zoom: 1, contrast: 100, brightness: 100, split: 50, interval: 500 })}>Reset view</Btn>
        <div className="group tight">
          <span>Recent comparisons</span>
          {S.hist.length === 0 && <span className="muted">Your runs will appear here.</span>}
          {S.hist.map((h) => (
            <button key={h.label} type="button" className="rowbtn" onClick={() => set({ src: h.src, custom: h.custom, A: h.A, B: h.B, ran: true, sel: 0 })}>
              {h.label}
            </button>
          ))}
        </div>
      </aside>

      <main className="main dark">
        <div className="head">
          <h1>{heading}</h1>
          <span className="muted">{m.team ? `${m.name} · ${team.source === 'api' ? 'live from the team API' : 'API not reachable, showing the built-in sample'}` : `${m.name}${m.tg && m.tg.ra != null ? ` · RA ${hms(m.tg.ra / 15, false)}, Dec ${hms(m.tg.dec!, true)}` : ' · made-up sky, no real coordinates'} · simulated`}</span>
        </div>
        <div className="cols">
          <div className="col-img">
            {S.mode === 'side' ? (
              <div className="side">
                {(['A', 'B'] as const).map((e) => (
                  <div key={e} className="side-col">
                    <span className="side-name">{m.team ? `Epoch ${e}` : `${e} – ${dateOf(e)}`}</span>
                    <Sky {...skyCommon} label={`Epoch ${e}`} show={e} sim={sim} real={real} rings={rings} labels={false} />
                  </div>
                ))}
              </div>
            ) : (
              <Sky
                {...skyCommon}
                label={S.mode === 'blink' ? `Epoch ${S.epoch}` : S.mode === 'wipe' ? 'Wipe comparison' : 'Difference'}
                show={S.mode === 'blink' ? S.epoch : S.mode === 'wipe' ? 'wipe' : 'diff'}
                sim={sim}
                real={real}
                rings={rings}
                note={m.team && S.mode === 'diff' && !team.rd.url ? (team.rd.loading ? 'Building the difference…' : 'Difference not available: the API needs CORS on the images, or a diff.png') : m.team && !team.data?.candidates.length ? 'No candidates found.' : null}
              />
            )}
            <span className="muted small">{S.cur ? `Cursor: ${offTxt(S.cur.x, S.cur.y)}${m.team ? '' : ' · ' + m.where(S.cur.x, S.cur.y)}` : 'Move over the picture to read a position. Space flips, C confirms, R rejects, J/K next and previous.'}</span>
          </div>

          <div className="col-info">
            <h2>Frame comparison</h2>
            <KV
              rows={[
                ['Time apart', fcDays],
                ['Wavelength', fcWl],
                ['Changed pixels', fcPix],
                ['Regions found', String(m.list.length)],
              ]}
            />
            <span className="muted small">Change along the picture, left to right</span>
            <Spark d={profD} label="Amount of change across the picture" />
            <span className="muted small">{prof.some((v) => v > 0) ? `Most change ${Math.round((pk / Math.max(1, prof.length - 1)) * 100)}% of the way across` : 'No change measured yet'}</span>

            <h2>Candidates</h2>
            {!sel ? (
              <p className="muted">{m.team ? 'No candidates found.' : S.ran ? 'Nothing changed above the current sensitivity. Lower it, or pick visits further apart.' : 'Press “Run change detection” to circle what changed between the two visits.'}</p>
            ) : (
              <>
                <div className="row-wrap">
                  {shown.map((c, i) => (
                    <Btn key={c.key} small on={i === selIdx} onClick={() => set({ sel: i })}>
                      {c.label}
                    </Btn>
                  ))}
                </div>
                <div className="detail">
                  <b className="big">
                    {sel.label} · {KIND_LABEL[sel.kind]}
                  </b>
                  <span style={{ color: TEXT_ON_DARK[lookOf(sel)] }}>{STATUS_LABEL[sel.status]}</span>
                  {m.team ? (
                    <>
                      <span>
                        RA {sel.ra?.toFixed(4)}°, Dec {sel.dec?.toFixed(4)}° · pixel {sel.x.toFixed(1)}, {sel.y.toFixed(1)}
                      </span>
                      <span>
                        Confidence {Math.round((sel.conf ?? 0) * 100)}% · flux change {sel.flux?.toFixed(1)}
                      </span>
                      <span>Catalog: {sel.known ? `${sel.known}, ${sel.sep?.toFixed(1)}″ away` : 'no known object nearby'}</span>
                    </>
                  ) : (
                    <>
                      <span>At {m.where(sel.x, sel.y)}</span>
                      <span>
                        {sel.kind === 'move' && sel.sx != null
                          ? `Moved ${(Math.hypot(sel.x - sel.sx, sel.y - sel.sy!) * PX).toFixed(0)}″ in ${days(S.A, S.B)} days (${((Math.hypot(sel.x - sel.sx, sel.y - sel.sy!) * PX) / Math.max(1, days(S.A, S.B))).toFixed(1)}″/day)`
                          : `Change ${((sel.k ?? 0) / 8).toFixed(1)}σ over ${sel.ar} px`}
                      </span>
                      <span className="muted">Catalog: not checked for simulated skies</span>
                    </>
                  )}
                </div>
                <div className="row-wrap">
                  <Btn small onClick={() => set({ sel: (selIdx - 1 + shown.length) % shown.length })}>◀</Btn>
                  <Btn small kind="ok" onClick={() => setStatus('confirmed')}>
                    Confirm
                  </Btn>
                  <Btn small kind="no" onClick={() => setStatus('rejected')}>
                    Reject
                  </Btn>
                  <Btn small onClick={() => setStatus('pending')}>Undo</Btn>
                  <Btn small onClick={() => set({ sel: (selIdx + 1) % shown.length })}>▶</Btn>
                </div>
              </>
            )}
            <span className="toast-line" role="status">
              {S.toast}
            </span>
          </div>
        </div>
      </main>
    </>
  );
}

export { DATES };
