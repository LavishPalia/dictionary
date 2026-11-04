/** The top bar of a screen you came to from somewhere: back to it. */
export function BackBar({ title, back }: { title: string; back: () => void }) {
  return (
    <header className="duel-top">
      <a className="ib" href="/play" aria-label="Back" onClick={(e) => { e.preventDefault(); back(); }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </a>
      <h1 className="ttl"><b>{title}</b></h1>
      <span className="ib" aria-hidden="true" />
    </header>
  );
}
