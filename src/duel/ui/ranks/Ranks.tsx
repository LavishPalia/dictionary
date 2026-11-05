import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Board, BoardRow, Me, WeekPick } from '../../net-rules';
import type { Platform } from '../../platform/types';
import { addDays } from '../../progress';
import { dayMonth, type Nav } from '../dates';
import { BackBar } from '../settings/BackBar';
import { countdown, initials, ordinal, pointsWord } from './copy';
import { RenameSheet } from './RenameSheet';
import { useNet } from './WeekCard';

type Row = BoardRow & { me?: boolean };

const COLOURS = ['#7a2b22', '#3d5a2a', '#1e4887', '#6e5532', '#5b3a6b', '#2f6b6b', '#8a4b1f', '#4a4a6a'];
const colourOf = (name: string) => COLOURS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLOURS.length];

const OWL = (
  <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true">
    <ellipse cx="13" cy="15" rx="8" ry="8.500" fill="#c9d6e8" />
    <path d="M6 8 L9 11 M20 8 L17 11" stroke="#c9d6e8" strokeWidth="2" strokeLinecap="round" />
    <circle cx="10" cy="13" r="3" fill="#1e3a63" /><circle cx="16" cy="13" r="3" fill="#1e3a63" />
    <circle cx="10.600" cy="12.400" r="1" fill="#fff" /><circle cx="16.600" cy="12.400" r="1" fill="#fff" />
    <path d="M12 16 L13 18 L14 16Z" fill="#c9a24a" />
  </svg>
);

function Avatar({ row }: { row: Row }) {
  if (row.bot) return <span className="rank-av bot" aria-hidden="true">{OWL}</span>;
  return <span className="rank-av" style={{ background: colourOf(row.name) }} aria-hidden="true">{initials(row.name)}</span>;
}

const BotTag = () => <span className="rank-bot" data-bot>Bot</span>;

/** The list with your own row in its place: the public list is cached, and carries no ids, so it's matched by name. */
function withMe(rows: BoardRow[], me: Me | null): { rows: Row[]; mine: Row | null } {
  if (!me || me.rank === null) return { rows, mine: null };
  const others = rows.filter(r => r.bot || r.name !== me.name);
  if (me.rank > 100) return { rows: others, mine: { rank: me.rank, name: me.name, points: me.points, bot: false, me: true } };
  // Where the server says, so this screen and the end screen agree even on tied points.
  const at = Math.min(me.rank - 1, others.length);
  const merged = [...others.slice(0, at), { rank: 0, name: me.name, points: me.points, bot: false, me: true }, ...others.slice(at)].slice(0, 100);
  return { rows: merged.map((r, i) => ({ ...r, rank: i + 1 })), mine: null };
}

/** The weekly leaderboard (UI-DESIGN §3.5). */
export function Ranks({ platform, nav, back }: { platform: Platform; nav: Nav; back: () => void }) {
  const { net } = platform;
  useNet(net);
  const [tab, setTab] = useState<WeekPick>('this');
  // `shown`: the server has answered, rather than this being the copy from the device.
  const [state, setState] = useState<{ tab: WeekPick; board: Board | null; stale: boolean; me: Me | null; shown: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    // The copy on this device at once, so a slow connection never leaves an empty screen.
    const copy = net.lastBoard(tab);
    setState(s => (s?.tab === tab ? s : copy ? { tab, board: copy, stale: false, me: null, shown: false } : null));
    void (async () => {
      await net.flush(); // anything unsent counts before the board is read
      const [board, me] = await Promise.all([net.board(tab), net.me(tab)]);
      if (live) setState({ tab, board: board.data, stale: board.stale, me, shown: true });
    })();
    return () => { live = false; };
  }, [net, tab, attempt]);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const player = net.player(), week = net.week();
  // Offline, your place comes from the last thing the server said.
  const me: Me | null = state?.me ?? (tab === 'this' && (state?.stale || !state?.shown) && player?.name && week && week.points > 0
    ? { name: player.name, week: week.week, points: week.points, games: 0, rank: week.rank, of: 0 } : null);
  const { rows, mine } = withMe(state?.board?.rows ?? [], me);
  const podium = rows.slice(0, 3), list = rows.slice(3);
  const myIndex = rows.findIndex(r => r.me);
  const myPlace = myIndex >= 0 ? rows[myIndex] : mine;
  const myName = myPlace?.name;

  // ── Your own row stays in sight: pinned until the real one scrolls into view ──
  const realRow = useRef<HTMLLIElement>(null);
  const [rowVisible, setRowVisible] = useState(false);
  const inList = myIndex >= 3;
  useEffect(() => {
    if (!inList || !realRow.current || typeof IntersectionObserver === 'undefined') { setRowVisible(false); return; }
    const io = new IntersectionObserver(([e]) => setRowVisible(e.isIntersecting), { threshold: 0.9 });
    io.observe(realRow.current);
    return () => io.disconnect();
  }, [inList, myIndex]);

  // ── Arriving with new points: your row glides up past the players you overtook, once ──
  const [gain, setGain] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const glide = useCallback((from: number, to: number) => {
    const rowEls = [...(listRef.current?.children ?? [])] as HTMLElement[];
    const mineEl = realRow.current;
    if (!mineEl) return;
    const step = mineEl.offsetHeight || 54;
    const ease = 'cubic-bezier(.3,.7,.2,1)';
    const myAt = rowEls.indexOf(mineEl), moved = from - to;
    rowEls.forEach((el, i) => {
      if (i > myAt && i <= myAt + moved) el.animate([{ transform: `translateY(${-step}px)` }, { transform: 'none' }], { duration: 700, easing: ease });
    });
    mineEl.animate([{ transform: `translateY(${moved * step}px)` }, { transform: 'none' }], { duration: 900, easing: ease });
    mineEl.scrollIntoView({ block: 'center' });
    const num = mineEl.querySelector('.rank-num');
    if (num) {
      let shown = from;
      num.textContent = String(shown);
      const every = Math.max(60, 700 / moved);
      const timer = setInterval(() => {
        shown--;
        num.textContent = String(shown);
        if (shown <= to) clearInterval(timer);
      }, every);
    }
  }, []);

  useLayoutEffect(() => {
    if (!state || state.tab !== 'this' || !state.me || state.me.rank === null || state.stale) return;
    const seen = net.week()?.seen ?? null;
    const place = myPlace?.rank ?? state.me.rank;
    net.markSeen(place, state.me.points);
    if (!seen) return;
    if (state.me.points > seen.points) setGain(state.me.points - seen.points);
    if (seen.rank !== null && place < seen.rank && !platform.reducedMotion()) glide(seen.rank, place);
    // Once for each answer from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const board = state?.board ?? null;
  const loaded = state?.tab === tab;
  const showPinned = !!myPlace && myIndex !== 0 && myIndex !== 1 && myIndex !== 2 && !rowVisible;

  const row = (r: Row, ref?: React.Ref<HTMLLIElement>) => (
    <li key={`${r.bot ? 'b' : 'p'}:${r.name}`} ref={ref} className={`rank-row${r.me ? ' me' : ''}`}>
      <span className="rank-num">{r.rank}</span>
      <Avatar row={r} />
      <span className="rank-name">
        {r.me ? `You · ${r.name}` : r.name}{r.bot && <BotTag />}
        {r.me && tab === 'this' && <button type="button" className="rank-edit" onClick={() => setRenaming(true)}>rename</button>}
      </span>
      <span className="rank-pts">{r.points.toLocaleString('en-IN')}</span>
      {r.me && gain !== null && tab === 'this' && <span className="rank-gain" aria-hidden="true">+{gain}</span>}
    </li>
  );

  return (
    <div className="duel-page duel-ranks" id="duel-ranks">
      <BackBar title={tab === 'this' ? 'This Week’s Ranks' : 'Last Week’s Ranks'} back={back} />
      <div className="rank-seg" role="group" aria-label="Which week">
        <button type="button" data-tab="this" aria-pressed={tab === 'this'} onClick={() => setTab('this')}>This week</button>
        <button type="button" data-tab="last" aria-pressed={tab === 'last'} onClick={() => setTab('last')}>Last week</button>
      </div>

      {!board && loaded && (
        <div className="rank-empty" role="status">
          <p>{state.stale ? 'Can’t reach the ranks right now.' : 'Nothing here yet.'}</p>
          <button type="button" className="bigbtn pri" onClick={() => setAttempt(n => n + 1)}>Try again</button>
        </div>
      )}
      {!loaded && <div className="rank-loading" aria-busy="true" />}

      {board && loaded && (
        <>
          <p className="rank-reset">
            {tab === 'this'
              ? <>Resets in <b>{countdown(board.endsAt, new Date())}</b> · Monday, midnight IST</>
              : `Final standings · ${dayMonth(board.week)} to ${dayMonth(addDays(board.week, 6))}`}
          </p>
          {state.stale && <p className="rank-note" role="status">You’re offline, so this is the last copy.</p>}
          {!player?.name && tab === 'this' && <p className="rank-note">Finish a game to join this week’s ranks.</p>}

          {tab === 'last' && me && me.rank !== null && (
            <div className="page-card rank-last" data-last-card>
              <span>You finished</span>
              <b>{ordinal(me.rank)}{me.of ? ` of ${me.of.toLocaleString('en-IN')}` : ''}</b>
              <span>{pointsWord(me.points)}</span>
            </div>
          )}

          <div className="rank-podium">
            {[podium[1], podium[0], podium[2]].map((r, i) => r && (
              <div className={`rank-pod p${r.rank}${r.me ? ' me' : ''}`} key={r.name} data-rank={r.rank}>
                {r.rank === 1 && <span className="rank-crown" aria-hidden="true">♛</span>}
                <Avatar row={r} />
                <div className="rank-pod-name">{r.me ? 'You' : r.name}{r.bot && <BotTag />}</div>
                <div className="rank-pod-pts">{r.points.toLocaleString('en-IN')}</div>
                <div className="rank-plinth" aria-hidden="true">{[2, 1, 3][i]}</div>
              </div>
            ))}
          </div>

          <ol className="page-card rank-list" ref={listRef} start={4}>
            {list.map(r => row(r, r.me ? realRow : undefined))}
          </ol>

          {showPinned && myPlace && (
            <ul className="rank-pinned">{row(myPlace)}</ul>
          )}

          <p className="rank-foot">
            Showing the top 100. Points come from finished games only, and each game is checked before it counts.{' '}
            <a href="/play/how" onClick={(e) => { e.preventDefault(); nav('/play/how'); }}>How scoring works</a>
          </p>
        </>
      )}

      {renaming && myName && <RenameSheet net={net} current={myName} onClose={() => { setRenaming(false); setAttempt(n => n + 1); }} />}
    </div>
  );
}
