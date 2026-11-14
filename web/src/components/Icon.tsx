// Small inline icon set, so nothing loads from the internet.
const P: Record<string, string> = {
  satellite: 'M7 7l3 3M14 14l3 3M4.5 9.5l5-5 3 3-5 5zM11.5 16.5l5-5 3 3-5 5zM9 15l6-6M5 19c0-1.7 1.3-3 3-3',
  compare: 'M12 3v18M4 6h5v12H4zM15 6h5v12h-5z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  radar: 'M12 21a9 9 0 119-9M12 16a4 4 0 114-4M12 12l7-7',
  wipe: 'M12 3v18M4 5h16v14H4zM9 12l-2-2M9 12l-2 2M15 12l2-2M15 12l2 2',
  columns: 'M4 5h7v14H4zM13 5h7v14h-7z',
  blink: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  diff: 'M5 5h9v9H5zM10 10h9v9h-9z',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 8.5h.01',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 15a3 3 0 100-6 3 3 0 000 6zM12 1v4M12 19v4M1 12h4M19 12h4',
  focus: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4',
};

export function Icon({ name, size = 18, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={P[name] ?? ''} />
    </svg>
  );
}
