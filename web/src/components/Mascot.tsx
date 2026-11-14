// "Blinky", the team mascot. Original drawing; the eyelid blinks via CSS.
export function Mascot({ size = 56, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={busy ? 'mascot busy' : 'mascot'}>
      <path
        className="mascot-star"
        d="M50 6 l2.5 5.5 5.5 2.5 -5.5 2.5 -2.5 5.5 -2.5 -5.5 -5.5 -2.5 5.5 -2.5z"
        fill="#FF8A3D"
        stroke="#1B1B3A"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="36" r="24" fill="#FFC93C" stroke="#1B1B3A" strokeWidth="3" />
      <ellipse cx="30" cy="32" rx="12" ry="11" fill="#FFFFFF" stroke="#1B1B3A" strokeWidth="3" />
      <circle className="mascot-pupil" cx="33" cy="32" r="5" fill="#1B1B3A" />
      <circle cx="35" cy="30" r="1.6" fill="#FFFFFF" />
      <path d="M22 47 q8 6 16 0" fill="none" stroke="#1B1B3A" strokeWidth="3" strokeLinecap="round" />
      <g className="mascot-lid">
        <ellipse cx="30" cy="32" rx="13.5" ry="12.5" fill="#FFC93C" stroke="#1B1B3A" strokeWidth="3" />
      </g>
    </svg>
  );
}
