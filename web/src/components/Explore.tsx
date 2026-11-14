import type { Ctx } from '../state';
import { Btn, Check, KV, Radios, Slider, Spark } from './ui';
import { Sky, type Blob } from './Sky';
import { simTarget, isTeam } from '../lib/model';
import { DATES, MON, WL, N, PX, detect, ecliptic, frame, galactic, hms, lcPath, level, simSky, type Ev } from '../lib/sim';

// Sky Explorer runs on the simulated sky: it needs 8 visits, which the
// team's pipeline (two epochs) doesn't provide yet.
export function ExplorePage(ctx: Ctx) {
  const { S, set } = ctx;
  const tg = isTeam(S) ? simTarget({ ...S, src: 'm42', custom: null }) : simTarget(S);
  const seed = tg.seed;
  const xc = S.xc;
  const shownF = S.xblink && S.bph ? Math.max(0, xc - 1) : xc;
  const z = S.xz;
  const P = S.pix ?? { x: N / 2, y: N / 2 };
  const pc = (v: number) => (v / N) * 100;
  const ox = S.pix && z > 1 ? pc(P.x) : 50;
  const oy = S.pix && z > 1 ? pc(P.y) : 50;
  const stretch = S.stretch === 'linear' ? 'none' : S.stretch === 'sqrt' ? 'brightness(1.25)' : 'contrast(1.35) brightness(1.3)';

  const blobs = (list: Ev[], rise: string, fade: string, size = 12): Blob[] =>
    list.flatMap((e) =>
      e.t === 'move' && e.s
        ? [
            { l: pc(e.s.x), t: pc(e.s.y), s: size, c: fade },
            { l: pc(e.e.x), t: pc(e.e.y), s: size, c: rise },
          ]
        : [{ l: pc(e.e.x), t: pc(e.e.y), s: e.t === 'art' ? 6 : size, c: e.t === 'art' ? '#9a9a9a' : e.t === 'rise' ? rise : fade }],
    );
  const base = S.layer === 'prev' ? Math.max(0, xc - 1) : 0;
  const diff = S.layer === 'img' ? [] : blobs(detect(seed, base, xc, S.th, true), '#000000', '#ffffff');
  const mask = S.mask && xc > 0 && S.layer === 'img' ? blobs(detect(seed, xc - 1, xc, S.th, false), '#c2410c', '#1d4ed8', 18) : [];
  const f = frame(seed, shownF);

  const toImg = (u: number, o: number) => o / 100 + (u - o / 100) / z;
  const gl = (axis: 'x' | 'y', u: number) => {
    const v = toImg(u, axis === 'x' ? ox : oy) * N;
    if (S.coord === 'off' || tg.ra == null) return ((v - N / 2) * PX).toFixed(0) + '″';
    const s = simSky(tg, axis === 'x' ? v : N / 2, axis === 'y' ? v : N / 2)!;
    return axis === 'x' ? hms(s.ra / 15, false) : hms(s.dec, true);
  };
  const lv = (fr: number) => level(seed, fr, P.x, P.y);
  const lvs = DATES.map((_, fr) => lv(fr));
  const lo = Math.min(...lvs);
  const hi = Math.max(...lvs);
  const counts = DATES.map((_, fr) => (fr === 0 ? 0 : detect(seed, fr - 1, fr, S.th, false).length));
  const where = (x: number, y: number) => {
    const s = simSky(tg, x, y);
    return s ? `RA ${hms(s.ra / 15, false)}, Dec ${hms(s.dec, true)}` : `${((x - N / 2) * PX).toFixed(0)}″ x, ${((y - N / 2) * PX).toFixed(0)}″ y from centre`;
  };
  const s2 = simSky(tg, P.x, P.y);
  const coordRows: [string, string][] = s2
    ? (() => {
        const g = galactic(s2.ra, s2.dec);
        const e = ecliptic(s2.ra, s2.dec);
        return [
          ['Right ascension', hms(s2.ra / 15, false)],
          ['Declination', hms(s2.dec, true)],
          ['Galactic l, b', `${g[0].toFixed(2)}°, ${g[1].toFixed(2)}°`],
          ['Ecliptic λ, β', `${e[0].toFixed(2)}°, ${e[1].toFixed(2)}°`],
        ];
      })()
    : [
        ['Position', where(P.x, P.y)],
        ['Sky coordinates', 'none for a made-up sky'],
      ];
  const sx = (P.x / N - ox / 100) * z * 100 + ox;
  const sy = (P.y / N - oy / 100) * z * 100 + oy;
  const change = xc > 0 ? lv(xc) - lv(xc - 1) : 0;
  const summary = [
    'TARGET SUMMARY (simulated sky)',
    'Target: ' + tg.n,
    'Point: ' + where(P.x, P.y),
    `Visit ${xc + 1} of 8 (${DATES[xc]}), wavelength ≈ ${WL[xc].toFixed(2)} µm`,
    'Brightness here: ' + lv(xc).toFixed(1) + ' / 255',
    'Changes vs previous visit: ' + (xc ? counts[xc] : 'baseline'),
  ].join('\n');

  return (
    <>
      <aside className="panel" aria-label="Sky Explorer controls">
        <Radios name="layer" legend="Layer" value={S.layer} onChange={(v) => set({ layer: v })} options={[['img', 'Image'], ['prev', 'Change vs previous visit'], ['first', 'Change vs first visit']]} />
        <Radios name="stretch" legend="Stretch" value={S.stretch} onChange={(v) => set({ stretch: v })} options={[['asinh', 'Asinh (brings out faint things)'], ['linear', 'Linear'], ['sqrt', 'Square root']]} />
        <Radios name="coord" legend="Grid labels" value={S.coord} onChange={(v) => set({ coord: v })} options={[['sky', 'Sky (RA / Dec)'], ['off', 'Offset from centre (″)']]} />
        <Slider label={`Zoom (${z.toFixed(1)}×)`} value={z} min={1} max={8} step={0.5} onChange={(v) => set({ xz: v })} />
        <div className="group tight">
          <Check checked={S.grid} onChange={(v) => set({ grid: v })}>
            Coordinate grid
          </Check>
          <Check checked={S.mask} onChange={(v) => set({ mask: v })}>
            Difference mask (vs previous)
          </Check>
          <Check checked={S.xblink} onChange={(v) => set({ xblink: v, bph: false })}>
            Blink with previous visit
          </Check>
          <Check checked={S.invert} onChange={(v) => set({ invert: v })}>
            Invert
          </Check>
        </div>
        <div className="box">
          <span>Time machine</span>
          <div className="row-wrap">
            <Btn small onClick={() => set({ xc: Math.max(0, xc - 1) })}>◀ Prev</Btn>
            <Btn small onClick={() => set({ xplay: !S.xplay })}>{S.xplay ? 'Pause' : 'Play'}</Btn>
            <Btn small onClick={() => set({ xc: Math.min(7, xc + 1) })}>Next ▶</Btn>
          </div>
          <Radios inline name="speed" legend="Speed" value={S.speed} onChange={(v) => set({ speed: v })} options={[[1, '1×'], [2, '2×'], [3, '3×']]} />
          <Check checked={S.loop} onChange={(v) => set({ loop: v })}>
            Loop
          </Check>
        </div>
        <Btn wide onClick={() => ctx.save({ type: 'pixel', f: xc, x: Math.round(P.x), y: Math.round(P.y), lv: Math.round(lv(xc)) })}>Save this pixel</Btn>
        <Btn wide onClick={() => set({ page: 'compare', src: isTeam(S) ? 'm42' : S.src, A: 0, B: xc > 0 ? xc : 7, ran: false, sel: 0 })}>Compare first visit with this one</Btn>
        <Btn wide onClick={() => set({ page: 'disc', src: isTeam(S) ? 'm42' : S.src, A: xc > 0 ? xc - 1 : 0, B: xc > 0 ? xc : 1, dsel: 0 })}>Find changes vs previous visit</Btn>
        <Btn wide onClick={() => set({ xrep: !S.xrep })}>{S.xrep ? 'Hide' : 'Show'} target summary as text</Btn>
      </aside>

      <main className="main dark">
        <div className="head">
          <h1>
            Visit {xc + 1} of 8 – {DATES[xc]}
            {shownF !== xc ? ` (showing visit ${shownF + 1})` : ''}
          </h1>
          <span className="muted">
            {tg.n} · simulated sky ·{' '}
            {xc === 0 ? 'baseline visit' : counts[xc] ? `${counts[xc]} change${counts[xc] === 1 ? '' : 's'} since the previous visit` : 'no change since the previous visit'}
          </span>
        </div>
        <div className="cols">
          <div className="col-img">
            <Sky
              label={`Visit ${xc + 1}`}
              ratio={1}
              show={S.layer === 'img' ? 'B' : 'diff'}
              sim={{ a: f, b: f, diff }}
              filter={stretch}
              invert={S.invert && S.layer === 'img'}
              split={50}
              zoom={z}
              ox={ox}
              oy={oy}
              rings={[]}
              labels={false}
              overlay={mask}
              cursor="crosshair"
              onClickImg={(fx, fy) => set({ pix: { x: fx * N, y: fy * N } })}
            >
              {S.grid &&
                [0.2, 0.4, 0.6, 0.8].map((u) => (
                  <span key={'v' + u}>
                    <span className="grid-v" style={{ left: `${u * 100}%` }} />
                    <span className="grid-lab bottom" style={{ left: `${u * 100}%` }}>
                      {gl('x', u)}
                    </span>
                    <span className="grid-h" style={{ top: `${u * 100}%` }} />
                    <span className="grid-lab right" style={{ top: `${u * 100}%` }}>
                      {gl('y', u)}
                    </span>
                  </span>
                ))}
              {S.pix && (
                <>
                  <span className="pix-ring" style={{ left: `${sx}%`, top: `${sy}%` }} />
                  <span className="pix-pop" style={{ left: `${sx}%`, top: `${sy}%`, transform: sx > 62 ? 'translate(calc(-100% - 16px), -50%)' : 'translate(16px, -50%)' }}>
                    {`Pixel ${Math.round(P.x)}, ${Math.round(P.y)}\n${where(P.x, P.y)}\nLevel ${lv(shownF).toFixed(0)} / 255${xc > 0 ? ` · change vs previous ${change >= 0 ? '+' : ''}${change.toFixed(0)}` : ''}`}
                  </span>
                </>
              )}
            </Sky>
            <span className="muted small">Click the picture to read a pixel.</span>
            <div className="timeline">
              {DATES.map((d, fr) => (
                <button key={d} type="button" className={fr === xc ? 'tl on' : fr < xc ? 'tl past' : 'tl'} aria-current={fr === xc ? 'step' : undefined} onClick={() => set({ xc: fr })}>
                  V{fr + 1}
                  <br />
                  {MON[fr]}
                  <br />
                  {fr === 0 ? 'baseline' : counts[fr] ? `${counts[fr]} change${counts[fr] === 1 ? '' : 's'}` : 'no change'}
                </button>
              ))}
            </div>
            {S.xrep && <textarea readOnly rows={6} aria-label="Target summary" value={summary} />}
          </div>
          <div className="col-info">
            <h2>{S.pix ? 'Selected pixel' : 'Field centre'}</h2>
            <KV rows={coordRows} />
            <h2>Observation</h2>
            <KV
              rows={[
                ['Instrument', 'SPHEREx (simulated)'],
                ['Pixel scale', `${PX}″ / px`],
                ['Field of view', `${((N * PX) / 3600).toFixed(2)}° × ${((N * PX) / 3600).toFixed(2)}°`],
                ['Visit', `${xc + 1} of 8 · ${DATES[xc]}`],
                ['Wavelength', `λ ≈ ${WL[xc].toFixed(2)} µm`],
              ]}
            />
            <span className="muted small">Brightness here across all 8 visits</span>
            <Spark d={lcPath(lvs)} label="Light curve" dot={{ x: (xc / 7) * 196 + 2, y: 46 - ((lvs[xc] - lo) / Math.max(1, hi - lo)) * 40 }} />
            <span className="muted small">
              {lo.toFixed(0)}–{hi.toFixed(0)} levels · {MON[0]} to {MON[7]}
            </span>
            <span className="toast-line" role="status">
              {S.toast}
            </span>
          </div>
        </div>
      </main>
    </>
  );
}
