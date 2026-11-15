import type { Ctx, SavedItem } from '../state';
import { storeSaved } from '../state';
import { Btn, Check, Radios } from './ui';
import { DATES, days, customTarget, TARGETS, skyOf, level, detect } from '../lib/sim';

const TYPE = { compare: 'COMPARISON', set: 'CANDIDATE SET', pixel: 'PIXEL' } as const;

function rowsOf(o: SavedItem): [string, string][] {
  if (o.type === 'pixel') return [['Visit', `${(o.f ?? 0) + 1} of 8 · ${DATES[o.f ?? 0]}`], ['Pixel', `${o.x}, ${o.y}`], ['Brightness', `${o.lv} / 255`]];
  if (o.src === 'team') return [['Data', 'team epochs A → B'], [o.type === 'set' ? 'Candidates' : 'Regions found', String(o.n)]];
  return [['Visits', `${DATES[o.A ?? 0]} → ${DATES[o.B ?? 7]}`], ['Spacing', `${days(o.A ?? 0, o.B ?? 7)} days`], [o.type === 'set' ? 'Candidates' : 'Regions found', String(o.n)]];
}

export function SavedPage(ctx: Ctx) {
  const { S, set } = ctx;
  const update = (saved: SavedItem[]) => {
    storeSaved(saved);
    set({ saved });
  };
  const q = S.oq.toLowerCase();
  const list = S.saved
    .filter((o) => (S.of === 'all' || o.type === S.of) && (!q || `${o.name} ${o.note}`.toLowerCase().includes(q)))
    .sort((a, b) => (S.oldFirst ? a.ts - b.ts : b.ts - a.ts));
  const cnt = (t: SavedItem['type']) => S.saved.filter((o) => o.type === t).length;
  const asText = [`MY OBSERVATIONS (${S.saved.length})`, '', ...S.saved.map((o) => `[${TYPE[o.type]}] ${o.name} | ${rowsOf(o).map(([k, v]) => `${k.toLowerCase()}: ${v}`).join(' | ')}${o.note ? ` | note: ${o.note}` : ''}`)].join('\n');

  const open = (o: SavedItem) => {
    const base = { src: o.src, custom: o.custom ?? null };
    if (o.type === 'pixel') set({ ...base, page: 'explore', xc: o.f ?? 0, pix: { x: o.x ?? 512, y: o.y ?? 512 } });
    else set({ ...base, page: o.type === 'set' ? 'disc' : 'compare', A: o.A ?? 0, B: o.B ?? 7, ran: o.type === 'compare', sel: 0 });
  };
  const addExamples = () => {
    const tg = TARGETS[0];
    const o = skyOf(tg.seed);
    const now = Date.now();
    const mk = (p: Partial<SavedItem>, i: number): SavedItem => ({ id: `ex-${tg.key}-${i}`, ts: now + i, src: tg.key, name: tg.n, note: '', type: 'compare', ...p });
    const ex = [
      mk({ type: 'compare', A: 0, B: 7, n: detect(tg.seed, 0, 7, S.th, true).length }, 1),
      mk({ type: 'set', A: 0, B: 7, n: detect(tg.seed, 0, 7, S.th, false).length }, 2),
      mk({ type: 'pixel', f: 7, x: Math.round(o.vari.x), y: Math.round(o.vari.y), lv: Math.round(level(tg.seed, 7, o.vari.x, o.vari.y)), note: 'Example: a star that brightens in later visits.' }, 3),
    ];
    const same = (a: SavedItem, b: SavedItem) => a.type === b.type && a.src === b.src && a.A === b.A && a.B === b.B && a.f === b.f && a.x === b.x && a.y === b.y;
    update([...ex.filter((x) => !S.saved.some((s) => s.id === x.id || same(s, x))), ...S.saved]);
  };

  return (
    <>
      <aside className="panel" aria-label="Saved controls">
        <Radios name="of" legend="Show" value={S.of} onChange={(v) => set({ of: v })} options={[['all', 'Everything'], ['compare', 'Comparisons'], ['set', 'Candidate sets'], ['pixel', 'Pixels']]} />
        <label className="slider">
          Search targets and notes
          <input value={S.oq} onChange={(e) => set({ oq: e.target.value })} />
        </label>
        <Check checked={S.oldFirst} onChange={(v) => set({ oldFirst: v })}>
          Oldest first
        </Check>
        <Btn wide onClick={() => set({ orep: !S.orep })}>{S.orep ? 'Hide' : 'Show'} list as text</Btn>
        <Btn wide onClick={addExamples}>Add three example items</Btn>
        <p className="muted small m0">Saved in this browser only.</p>
      </aside>
      <main className="main light">
        <div className="head">
          <h1>My observations</h1>
          <span className="muted">
            {S.saved.length} saved · {cnt('compare')} comparisons · {cnt('set')} sets · {cnt('pixel')} pixels
          </span>
        </div>
        {S.saved.length === 0 && <p className="lead">Nothing saved yet. Use “Save comparison” in Compare, “Bookmark this set” in Discoveries and “Save this pixel” in Sky Explorer, or add three examples from the panel on the left.</p>}
        {S.orep && <textarea readOnly rows={7} aria-label="Saved items as text" value={asText} />}
        <div className="cards">
          {list.map((o) => (
            <div key={o.id} className="scard">
              <span className="muted small caps">{TYPE[o.type]}</span>
              <b className="big">{o.name}</b>
              {rowsOf(o).map(([k, v]) => (
                <span key={k}>
                  <span className="muted">{k}:</span> {v}
                </span>
              ))}
              <label className="slider">
                Note
                <textarea rows={2} value={o.note} onChange={(e) => update(S.saved.map((x) => (x.id === o.id ? { ...x, note: e.target.value } : x)))} />
              </label>
              <div className="row">
                <Btn onClick={() => open(o)} wide>
                  Open
                </Btn>
                <Btn kind="no" onClick={() => (S.arm === o.id ? (update(S.saved.filter((x) => x.id !== o.id)), set({ arm: null })) : set({ arm: o.id }))}>
                  {S.arm === o.id ? 'Sure?' : 'Delete'}
                </Btn>
              </div>
            </div>
          ))}
          {S.saved.length > 0 && list.length === 0 && <p className="muted">Nothing matches your filter.</p>}
        </div>
      </main>
    </>
  );
}

export function AboutPage() {
  return (
    <>
      <aside className="panel" aria-label="About">
        <p className="m0">Keys on Compare: Space flips, P starts or stops blinking, C confirms, R rejects, U undoes, J and K move between candidates.</p>
        <p className="muted small m0">Team data comes from the team’s detector and API. M42, M31, TRAPPIST-1 and Sky Explorer use a simulated sky.</p>
      </aside>
      <main className="main light">
        <div className="about">
          <h1>About SPHEREx and Blink</h1>
          <p>
            SPHEREx is a NASA space telescope that launched in March 2025. It photographs the whole sky in 102 infrared colours, from 0.75 to 5.0 µm, and goes back over the whole sky about every six months: four all-sky maps in its two-year mission.
          </p>
          <p>
            Because it keeps returning to the same places, it gives us pictures of the same patch of sky on different dates. Blink flips between those dates, subtracts one from the other, and circles what changed: asteroids and comets that moved, nearby stars that drifted, and stars that brightened or faded. In 1930 a blink comparator, flipping between two photographic plates, is how Pluto was found.
          </p>
          <p>
            <b>A tricky part:</b> SPHEREx may see a different infrared colour on different visits, so two pictures can differ because of colour, not movement. That is why every visit shows its wavelength, and why Blink warns when two visits use different colours.
          </p>
          <h2>What is real and what is simulated</h2>
          <p>
            <b>Real:</b> the mission facts on this page, the team’s data from our detector and API, the positions of the example targets (Orion Nebula, Andromeda, TRAPPIST-1) and the coordinate maths in Sky Explorer.
          </p>
          <p>
            <b>Simulated:</b> the pictures, visit dates and changes for the example targets and in Sky Explorer. A moving asteroid, a drifting star and a brightening star are placed there so there is something to find.
          </p>
          <h2>Learn more</h2>
          <p>
            <a href="https://www.jpl.nasa.gov/missions/spherex/">NASA JPL: SPHEREx mission</a>
            <br />
            <a href="https://spherex.caltech.edu/">SPHEREx at Caltech</a>
            <br />
            <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html">IRSA: SPHEREx data</a>
          </p>
          <p className="muted">Made by team Blink Comparator (Christabel, Albert, Kwaku, Jude), KNUST, for NASA Space Apps 2026 in Kumasi. An independent student project, not an official NASA product.</p>
        </div>
      </main>
    </>
  );
}

export { customTarget };
