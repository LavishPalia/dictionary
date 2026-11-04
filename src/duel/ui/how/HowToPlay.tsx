import type { Nav } from '../dates';
import { BackBar } from '../settings/BackBar';

/** A cell of the real board, in the board's own classes, for the legend. */
function Sample({ cls, letter, tile }: { cls?: string; letter?: string; tile?: boolean }) {
  return (
    <span className={`duel-cell duel-l ${cls ?? ''}`} aria-hidden="true">
      {tile ? <span className="duel-tile pend"><span className="lt">{letter}</span></span> : letter && <span className={`lt${cls === 'ghost' ? ' gl' : ''}`}>{letter}</span>}
    </span>
  );
}

/** How to play (UI-DESIGN §3.6 as changed by §0): six pages, with the coached game a tap away. */
export function HowToPlay({ nav, back }: { nav: Nav; back: () => void }) {
  return (
    <div className="duel-page duel-guide" id="duel-how">
      <BackBar title="How to Play" back={back} />
      <section className="page-card how-page">
        <h2><span>1</span>The duel</h2>
        <p>It’s a crossword with clues inside the grid. Each clue’s arrow points to where its answer starts. You and Professor Quill take turns filling it with letter tiles.</p>
        <p className="hi" lang="hi">आप और प्रोफ़ेसर क्विल बारी-बारी से अक्षर भरते हैं।</p>
        <p>When the last square is filled, the higher score wins.</p>
      </section>
      <section className="page-card how-page">
        <h2><span>2</span>Your turn</h2>
        <p>Drag tiles from your rack onto empty squares, or tap a tile and then a square. Place as many as you like. Tap a placed tile to take it back.</p>
        <p>Press <b>Submit</b> when you’re ready. Every tile you hold fits somewhere on the board. Right tiles stay; wrong ones come back to your rack. With nothing placed, the button reads <b>Pass</b>.</p>
        <p>Tap a clue to read it larger.</p>
      </section>
      <section className="page-card how-page">
        <h2><span>3</span>Scoring</h2>
        <table className="how-score">
          <tbody>
            <tr><td>Each right tile</td><td>+1</td></tr>
            <tr><td>Each word you finish, across or down</td><td>+ its length</td></tr>
            <tr><td>All 5 tiles played in one turn</td><td>+5</td></tr>
            <tr><td>Each wrong tile</td><td className="minus">−1</td></tr>
          </tbody>
        </table>
        <p className="how-ex">You place <b>A G O T A</b>, all right, finishing <b>EGO</b> and <b>TIE</b>:<br />5 tiles +5 · EGO +3 · TIE +3 · empty hand +5 = <b>16 points</b></p>
      </section>
      <section className="page-card how-page">
        <h2><span>4</span>Reading the board</h2>
        <div className="duel-board-legend">
          <Sample cls="by-given" letter="S" /><span>Given at the start</span>
          <Sample cls="by-you" letter="M" /><span>Settled letters, yours and Professor Quill’s</span>
          <Sample cls="by-quill last" letter="O" /><span>Professor Quill’s last move, in blue</span>
          <Sample letter="E" tile /><span>Tiles you’ve placed but not submitted</span>
          <Sample cls="ghost" letter="O" /><span>A revealed word: faint letters you still fill</span>
          <Sample cls="hint" /><span>Hint: one of your tiles fits here</span>
        </div>
      </section>
      <section className="page-card how-page">
        <h2><span>5</span>Help when you’re stuck</h2>
        <p><b>Hint</b> lights every square where your tiles belong, for the whole turn.</p>
        <p><b>Word</b> lets you pick a clue and shows its answer in faint letters.</p>
        <p><b>Swap</b> trades tiles with the bag. Swap and pass is free and ends your turn.</p>
        <p>You get 1 Hint and 1 Word free each day, and earn more by winning and by finishing review sessions.</p>
      </section>
      <section className="page-card how-page">
        <h2><span>6</span>Daily puzzles</h2>
        <p>There’s a new puzzle every day, the same for everyone. Win it to star the day; lost days stay open to replay. Win every day of a month to earn its seal.</p>
        <a className="bigbtn" id="how-guide" href="/play?guide=1" onClick={(e) => { e.preventDefault(); nav('/play?guide=1'); }}>Replay the first-game guide</a>
      </section>
    </div>
  );
}
