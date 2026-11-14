import type { ReactNode } from 'react';

// Small plain controls, styled in styles.css.

export function Btn(p: { onClick: () => void; children: ReactNode; on?: boolean; kind?: 'ok' | 'no'; small?: boolean; title?: string; disabled?: boolean; wide?: boolean }) {
  const cls = ['btn', p.on ? 'on' : '', p.kind ?? '', p.small ? 'small' : '', p.wide ? 'wide' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={p.onClick} aria-pressed={p.on} title={p.title} disabled={p.disabled}>
      {p.children}
    </button>
  );
}

export function Check(p: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} /> {p.children}
    </label>
  );
}

export function Radios<T extends string | number>(p: { name: string; legend: string; value: T; options: [T, string][]; onChange: (v: T) => void; inline?: boolean }) {
  return (
    <fieldset className={p.inline ? 'radios inline' : 'radios'}>
      <legend>{p.legend}</legend>
      {p.options.map(([v, label]) => (
        <label key={String(v)} className="check">
          <input type="radio" name={p.name} checked={p.value === v} onChange={() => p.onChange(v)} /> {label}
        </label>
      ))}
    </fieldset>
  );
}

export function Slider(p: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      {p.label}
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} />
    </label>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="kv">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Spark({ d, label, dot }: { d: string; label: string; dot?: { x: number; y: number } }) {
  return (
    <svg className="spark" viewBox="0 0 200 50" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {dot && <circle cx={dot.x} cy={dot.y} r={3} fill="#ff3b30" />}
    </svg>
  );
}
