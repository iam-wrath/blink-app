import { useMemo, useState } from 'react';
import type { Candidate } from '../types';
import { Icon } from './Icon';
import { FILTERS, lookOf, LOOK_LABEL, passes, toCsv, type Filter } from '../lib/status';

type Key = 'id' | 'confidence' | 'fluxDiff' | 'ra' | 'dec' | 'status' | 'known';

export function CandidatesPage(p: {
  all: Candidate[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  minConf: number;
  onMinConf: (v: number) => void;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'confidence', dir: -1 });
  const rows = useMemo(() => {
    const val = (c: Candidate): string | number =>
      sort.key === 'status' ? LOOK_LABEL[lookOf(c)] : sort.key === 'known' ? c.knownMatch?.name ?? '' : c[sort.key];
    return p.all
      .filter((c) => passes(c, p.filter, p.minConf))
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [p.all, p.filter, p.minConf, sort]);

  const head = (key: Key, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'id' ? 1 : -1 }))}>
        {label} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
      </button>
    </th>
  );

  const download = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'blink-candidates.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="page-pad">
      <div className="page-head">
        <div>
          <span className="eyebrow mono">REVIEW TABLE</span>
          <h1>Candidates</h1>
        </div>
        <button className="ghost" onClick={download}>
          <Icon name="download" size={16} /> Export CSV
        </button>
      </div>
      <div className="panel">
        <div className="table-tools">
          <div className="filters" role="group" aria-label="Filter candidates">
            {FILTERS.map((f) => (
              <button key={f.id} className={p.filter === f.id ? 'chip-btn on' : 'chip-btn'} aria-pressed={p.filter === f.id} onClick={() => p.onFilter(f.id)}>
                {f.label} <span className="mono">{p.all.filter((c) => passes(c, f.id, p.minConf)).length}</span>
              </button>
            ))}
          </div>
          <label className="range">
            <span>MIN CONFIDENCE</span>
            <input type="range" min={0} max={0.9} step={0.05} value={p.minConf} onChange={(e) => p.onMinConf(Number(e.target.value))} />
            <b>{Math.round(p.minConf * 100)}%</b>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {head('id', 'ID')}
                {head('status', 'STATUS')}
                {head('confidence', 'CONFIDENCE')}
                {head('fluxDiff', 'ΔFLUX')}
                {head('ra', 'RA (°)')}
                {head('dec', 'DEC (°)')}
                {head('known', 'CATALOG MATCH')}
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const look = lookOf(c);
                return (
                  <tr key={c.id} onDoubleClick={() => p.onOpen(c.id)}>
                    <td className="mono">{c.id}</td>
                    <td>
                      <span className={`status s-${look}`}>{LOOK_LABEL[look]}</span>
                    </td>
                    <td className="mono">
                      <span className="conf">
                        <span className="meter thin">
                          <span style={{ width: `${c.confidence * 100}%` }} />
                        </span>
                        {Math.round(c.confidence * 100)}%
                      </span>
                    </td>
                    <td className="mono">{c.fluxDiff.toFixed(1)}</td>
                    <td className="mono">{c.ra.toFixed(4)}</td>
                    <td className="mono">{c.dec.toFixed(4)}</td>
                    <td className={c.knownMatch ? 'violet' : 'muted'}>{c.knownMatch ? `${c.knownMatch.name} (${c.knownMatch.separationArcsec.toFixed(1)}″)` : '—'}</td>
                    <td>
                      <button className="ghost small" onClick={() => p.onOpen(c.id)}>
                        View <Icon name="right" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">No candidates match these filters.</p>}
        </div>
      </div>
    </section>
  );
}

export function AboutPage({ sample }: { sample: boolean }) {
  const steps: [string, string, string][] = [
    ['01', 'Get two images', 'Two SPHEREx observations of the same patch of sky, taken on different dates.'],
    ['02', 'Line them up', 'Epoch B is re-projected onto epoch A’s grid using the coordinates stored in each file, so every star sits on the same pixel.'],
    ['03', 'Subtract', 'Brightness is matched, then A is subtracted from B. Everything that stayed still cancels out. What is left moved or changed.'],
    ['04', 'Find the dots', 'Leftover spots stronger than the threshold become candidates, each with a pixel position, a sky position and a confidence.'],
    ['05', 'Check the catalog', 'Each candidate is compared with known asteroids and comets at that date. Known ones are marked, so new ones stand out.'],
    ['06', 'You decide', 'Blink, wipe or diff the two dates, then confirm or reject each candidate. Decisions are saved.'],
  ];
  return (
    <section className="page-pad">
      <div className="page-head">
        <div>
          <span className="eyebrow mono">PIPELINE</span>
          <h1>How Blink works</h1>
        </div>
      </div>
      <p className="lead">
        In 1930 a blink comparator found Pluto: an astronomer flipped between two photos of the sky until something jumped. Blink does the same for
        NASA’s SPHEREx infrared survey, and lets the computer do the first look.
      </p>
      <ol className="steps">
        {steps.map(([n, t, d]) => (
          <li key={n} className="panel">
            <span className="mono step-n">{n}</span>
            <h2>{t}</h2>
            <p>{d}</p>
          </li>
        ))}
      </ol>
      <p className="credit muted">
        {sample ? 'The pictures shown now are simulated sample data. ' : 'Images: NASA SPHEREx mission data. '}Built by team Blink Comparator (Christabel, Albert, Kwaku, Jude) at NASA Space Apps 2026, Kumasi.
      </p>
    </section>
  );
}
