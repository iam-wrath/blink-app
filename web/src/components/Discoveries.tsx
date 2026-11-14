import type { Ctx } from '../state';
import { Btn, Check, Slider, Spark } from './ui';
import { model, simTarget } from '../lib/model';
import { DATES, PX, days, detect, lcPath, level } from '../lib/sim';

const TITLE = { rise: 'Brightening source', move: 'Moving object', fade: 'Fading source', art: 'Tiny spot (possible artifact)', known: 'Known object', unknown: 'Unknown, worth a second look' } as const;

export function DiscPage(ctx: Ctx) {
  const { S, set, team } = ctx;
  const m = model(S, team, S.showArt);
  const pc = (v: number, size: number) => (v / size) * 100;

  // name the candidates: T1, T2… for moving tracks, V1, V2… for the rest (simulated);
  // the team's own ids for real data
  const order = { rise: 0, move: 1, fade: 2, art: 3, known: 4, unknown: 5 };
  const items = m.list.slice().sort((a, b) => (m.team ? (b.conf ?? 0) - (a.conf ?? 0) : order[a.kind] - order[b.kind]));
  let nT = 0;
  let nV = 0;
  const named = items.map((c) => ({ ...c, name: m.team ? c.label : c.kind === 'move' ? `T${++nT}` : `V${++nV}` }));
  const dsel = Math.min(S.dsel, Math.max(0, named.length - 1));

  const tg = m.team ? null : simTarget(S);
  const realBg = m.team ? team.rd.url : null;
  const tracks = named.filter((c) => c.kind === 'move' && c.sx != null);
  const report = [
    `CANDIDATE REPORT (${m.team ? 'team data' : 'simulated sky'}, unconfirmed)`,
    `Target: ${m.name}${m.team ? '' : ` · ${DATES[S.A]} vs ${DATES[S.B]}`}`,
    m.team ? `Candidates: ${named.length}` : `Sensitivity: ${S.th} levels (≈ ${(S.th / 8).toFixed(1)}σ)`,
    '',
    ...named.map((c) => `[${c.name}] ${TITLE[c.kind]} at ${m.where(c.x, c.y)}${c.kind === 'move' && c.sx != null ? ` (moved from ${m.where(c.sx, c.sy!)})` : ''}${c.known ? ` · catalog: ${c.known}` : ''}${c.conf != null ? ` · confidence ${Math.round(c.conf * 100)}%` : ''}`),
  ].join('\n');
  const color = (k: string) => (k === 'art' ? '#3a3a3a' : k === 'rise' || k === 'unknown' ? '#9a3412' : '#1d4ed8');

  return (
    <>
      <aside className="panel" aria-label="Discoveries controls">
        <p className="m0">{m.team ? `Showing the team’s candidates (${team.source === 'api' ? 'live API' : 'built-in sample'}).` : `Comparing V${S.A + 1} (${DATES[S.A]}) with V${S.B + 1} (${DATES[S.B]}). Pick the visits in Compare.`}</p>
        {!m.team && (
          <>
            <Slider label={`Sensitivity (${S.th} levels)`} value={S.th} min={12} max={90} step={2} onChange={(v) => set({ th: v })} />
            <Check checked={S.showArt} onChange={(v) => set({ showArt: v })}>
              Show tiny spots (possible artifacts)
            </Check>
          </>
        )}
        <Btn wide onClick={() => (m.team ? team.run() : set({ dsel: 0 }))}>{m.team && team.running ? 'Running…' : 'Run detection again'}</Btn>
        <Btn wide onClick={() => set({ rep: !S.rep })}>{S.rep ? 'Hide' : 'Prepare'} candidate report</Btn>
        <Btn wide onClick={() => ctx.save({ type: 'set', A: S.A, B: S.B, n: named.length })}>Bookmark this set</Btn>
        <Btn wide onClick={() => set({ page: 'compare', mode: 'diff' })}>Open difference view in Compare</Btn>
        <p className="muted small m0">These are unconfirmed candidates. With real SPHEREx images, every result needs an independent check.</p>
      </aside>

      <main className="main dark">
        <div className="head">
          <h1>{m.team ? 'Candidates found' : `Changes found: ${DATES[S.A]} → ${DATES[S.B]}`}</h1>
          <span className="muted">{m.name}</span>
        </div>
        <table className="tiles">
          <tbody>
            <tr>
              {(m.team
                ? [
                    ['Candidates', String(named.length), 'from the detector'],
                    ['Known objects', String(named.filter((c) => c.kind === 'known').length), 'matched in the catalog'],
                    ['Unknown', String(named.filter((c) => c.kind === 'unknown').length), 'worth a second look'],
                    ['Reviewed', String(named.filter((c) => c.status !== 'pending').length), 'confirmed or rejected'],
                  ]
                : [
                    ['Sensitivity', `${S.th} levels`, `≈ ${(S.th / 8).toFixed(1)}σ of the noise`],
                    ['Smoothing', '3 × 3 box', 'before subtracting'],
                    ['Noise estimate', 'σ ≈ 8 levels', 'median-based'],
                    ['Time apart', `${days(S.A, S.B)} days`, `V${S.A + 1} → V${S.B + 1}`],
                  ]
              ).map(([k, v, s]) => (
                <td key={k}>
                  <span className="muted">{k}</span>
                  <br />
                  <b>{v}</b>
                  <br />
                  <span className="muted small">{s}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <div className="cols">
          <div className="col-img">
            <div className="sky" style={{ aspectRatio: String(m.w / m.h), background: '#7f7f7f' }}>
              {realBg ? (
                <img className="layer img" src={realBg} alt="" />
              ) : (
                !m.team &&
                m.evs.flatMap((e, i) => {
                  const pts =
                    e.t === 'move' && e.s
                      ? [
                          [e.s, '#ffffff'],
                          [e.e, '#000000'],
                        ]
                      : [[e.e, e.t === 'art' ? '#9a9a9a' : e.t === 'rise' ? '#000000' : '#ffffff']];
                  return pts.map(([pt, c], j) => (
                    <span key={`${i}-${j}`} className="blob" style={{ left: `${pc((pt as { x: number }).x, m.w)}%`, top: `${pc((pt as { y: number }).y, m.h)}%`, width: 12, height: 12, background: c as string }} />
                  ));
                })
              )}
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="layer">
                {tracks.map((c) => (
                  <line key={c.key} x1={pc(c.sx!, m.w)} y1={pc(c.sy!, m.h)} x2={pc(c.x, m.w)} y2={pc(c.y, m.h)} stroke="#111" strokeWidth={1.6} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              {named.map((c, k) => {
                const on = k === dsel;
                const col = color(c.kind);
                const pts: [string, number, number, string][] = c.kind === 'move' && c.sx != null ? [[c.name + 'A', c.sx, c.sy!, '#1d4ed8'], [c.name + 'B', c.x, c.y, '#9a3412']] : [[c.name, c.x, c.y, col]];
                return pts.map(([name, x, y, cc]) => (
                  <span key={name}>
                    <button type="button" className="ring" aria-label={name} onClick={() => set({ dsel: k })} style={{ left: `${pc(x, m.w)}%`, top: `${pc(y, m.h)}%`, width: on ? 30 : 22, height: on ? 30 : 22, border: `${on ? 3 : 2}px solid ${cc}` }} />
                    <span className="ring-tag" style={{ left: `${pc(x, m.w)}%`, top: `${pc(y, m.h)}%`, color: cc, transform: 'translate(14px, -26px)' }}>
                      {name}
                    </span>
                  </span>
                ));
              })}
              {m.team && !realBg && <div className="sky-note">{team.rd.loading ? 'Building the difference…' : 'Difference picture not available yet (needs the two images with CORS, or a diff.png).'}</div>}
            </div>
            <span className="muted small">Darker: brighter in B. Lighter: fainter in B. Dashed line: a possible moving object (fades in one spot, appears in another).</span>
            {S.rep && <textarea readOnly rows={9} aria-label="Candidate report" value={report} />}
          </div>
          <div className="col-info">
            <h2>Candidates ({named.length})</h2>
            {named.length === 0 && <p className="muted m0">No candidates found. Lower the sensitivity, or pick two visits further apart.</p>}
            {named.map((c, k) => {
              const lcOn = !!S.lc[c.name];
              const rows: [string, string][] = m.team
                ? [
                    ['Position', m.where(c.x, c.y)],
                    ['RA / Dec', `${c.ra?.toFixed(4)}°, ${c.dec?.toFixed(4)}°`],
                    ['Confidence', `${Math.round((c.conf ?? 0) * 100)}%`],
                    ['Catalog', c.known ? `${c.known}, ${c.sep?.toFixed(1)}″ away` : 'no known object nearby'],
                    ['Review', c.status === 'pending' ? 'not reviewed' : c.status],
                  ]
                : c.kind === 'move' && c.sx != null
                  ? [
                      ['Now (B)', m.where(c.x, c.y)],
                      ['Was (A)', m.where(c.sx, c.sy!)],
                      ['Apparent motion', `${((Math.hypot(c.x - c.sx, c.y - c.sy!) * PX) / Math.max(1, days(S.A, S.B))).toFixed(1)}″ per day`],
                      ['Track', `${(Math.hypot(c.x - c.sx, c.y - c.sy!) * PX).toFixed(0)}″ over ${days(S.A, S.B)} days`],
                      ['Known asteroid?', 'not checked for simulated skies'],
                    ]
                  : [
                      ['Position', m.where(c.x, c.y)],
                      ['Brightness', `${level(tg!.seed, S.A, c.x, c.y).toFixed(0)} → ${level(tg!.seed, S.B, c.x, c.y).toFixed(0)} (${((c.k ?? 0) / 8).toFixed(1)}σ)`],
                      ['Size', `${c.ar} px`],
                    ];
              return (
                <div key={c.name} className={k === dsel ? 'card on' : 'card'}>
                  <button type="button" className="card-title" onClick={() => set({ dsel: k })}>
                    {c.name} · {TITLE[c.kind]}
                  </button>
                  {rows.map(([kk, v]) => (
                    <span key={kk}>
                      <span className="muted">{kk}:</span> {v}
                    </span>
                  ))}
                  <div className="row-wrap">
                    {c.kind === 'move' || c.kind === 'unknown' ? (
                      <a href="https://minorplanetcenter.net/" target="_blank" rel="noopener">
                        Check the Minor Planet Center ↗
                      </a>
                    ) : null}
                    {!m.team && c.kind !== 'move' && (
                      <Btn small onClick={() => set({ lc: { ...S.lc, [c.name]: !lcOn } })}>
                        {lcOn ? 'Hide' : 'Show'} light curve
                      </Btn>
                    )}
                    {m.team && (
                      <Btn small onClick={() => set({ page: 'compare', sel: Math.max(0, m.list.findIndex((x) => x.key === c.key)) })}>
                        Review in Compare
                      </Btn>
                    )}
                  </div>
                  {lcOn && tg && <Spark d={lcPath(DATES.map((_, f) => level(tg.seed, f, c.x, c.y)))} label="Light curve of this spot" />}
                </div>
              );
            })}
            <span className="toast-line" role="status">
              {S.toast}
            </span>
          </div>
        </div>
      </main>
    </>
  );
}

export { detect };
