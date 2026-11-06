// The Duel's seals (UI-DESIGN §3.2, §3.4), as plain SVG: a wax seal for the end of a game, a gold one for a month.

const SCALLOPS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * 2 * Math.PI;
  return { x: 37 + 27 * Math.cos(a), y: 37 + 27 * Math.sin(a), r: 6 + (i % 3) };
});

/** A feather and its nib, in gold. */
const Quill = () => (
  <g fill="#e6c877" stroke="#7a5a1c" strokeWidth=".6" strokeLinejoin="round">
    <path d="M51 20c-10 2-19 9-23 19-1 3-2 6-2 9l3-1c1-2 2-4 4-5l1 3c5-3 9-7 12-12l-4 0c4-2 7-5 9-13z" />
    <path d="M26 48l-3 7 5-5" fill="none" strokeWidth="1.3" stroke="#e6c877" strokeLinecap="round" />
  </g>
);

/** The seal at the end of a game: red wax for a win, half red and half blue for a tie, a pencilled ring for a loss. */
export function SealArt({ kind }: { kind: 'win' | 'loss' | 'tie' }) {
  if (kind === 'loss') {
    return (
      <svg className="seal-art" viewBox="0 0 74 74" aria-hidden="true">
        <circle cx="37" cy="37" r="31" fill="none" stroke="var(--pg-muted)" strokeWidth="2.5" strokeDasharray="7 5" strokeLinecap="round" />
      </svg>
    );
  }
  const wax = kind === 'win' ? 'url(#seal-wax)' : 'url(#seal-tie)';
  return (
    <svg className="seal-art" viewBox="0 0 74 74" aria-hidden="true">
      <defs>
        <radialGradient id="seal-wax" cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#b5452f" /><stop offset="1" stopColor="#5b1f19" /></radialGradient>
        <linearGradient id="seal-tie"><stop offset=".5" stopColor="#7a2b22" /><stop offset=".5" stopColor="#1e4887" /></linearGradient>
      </defs>
      <g fill={wax}>
        {kind === 'win' && SCALLOPS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#6b241c" />)}
        <circle cx="37" cy="37" r={kind === 'win' ? 29 : 32} />
      </g>
      <circle cx="37" cy="37" r="24" fill="none" stroke="rgba(244, 230, 197, .4)" strokeWidth="1.5" />
      <Quill />
    </svg>
  );
}

const LEAVES = Array.from({ length: 7 }, (_, i) => (i + 1) * 21 + 15);

/** A month's gold seal: ribbons behind, a laurel around, the month's first letters in the middle. */
export function MonthSealArt({ month, className, size = 52 }: { month: string; className?: string; size?: number }) {
  return (
    <svg className={className} viewBox="0 0 52 52" width={size} height={size} aria-hidden="true">
      <path d="M17 38l-5 13 7-3 5 3 2-11zM35 38l5 13-7-3-5 3-2-11z" fill="#7a2b22" />
      <circle cx="26" cy="24" r="21" className="seal-gold" />
      <g fill="#94722a">
        {LEAVES.map(a => [a, -a].map(d => (
          <ellipse key={d} cx="26" cy="7" rx="1.500" ry="3.200" transform={`rotate(${d} 26 24)`} />
        )))}
      </g>
      <text x="26" y="28.500" textAnchor="middle">{month}</text>
    </svg>
  );
}
