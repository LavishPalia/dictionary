// The leaderboard in a real browser, with the real server code on a real Postgres (PGlite) behind the page's requests.
// Usage: npx tsx scripts/test-duel-ranks-browser.mts   (needs the app running on localhost:3000)
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RULES_ID, type Action } from '../src/duel/engine';
import { getBoard, getMe } from '../src/duel/server/board';
import { query, setDb } from '../src/duel/server/db';
import { submitGame } from '../src/duel/server/games';
import { registerPlayer, renamePlayer } from '../src/duel/server/players';
import { weekOf, addWeeks } from '../src/duel/week';
import { DESKTOP, istDay, PHONE, run } from './duel/browser-harness.mjs';
import { loadPuzzle, playGame } from './duel/play';
import { testDb } from './duel/test-db';

const KEY = 'p0067.v1';
const P = loadPuzzle(KEY);
const FILE = `${KEY}.${(JSON.parse(readFileSync('data/duel/published.json', 'utf8')) as Record<string, { hash: string }>)[KEY].hash.slice(0, 8)}.json`;
const TODAY = istDay(), YESTERDAY = istDay(-1);
const SCHEDULE = { dates: { [TODAY]: KEY, [YESTERDAY]: KEY }, files: { [KEY]: FILE } };
const THIS_WEEK = weekOf(new Date());

/** The real handlers, by the path the page asked for. */
const handlers = async (req: Request) => {
  const path = new URL(req.url).pathname;
  if (path.endsWith('/players')) return registerPlayer(req);
  if (path.endsWith('/players/me')) return renamePlayer(req);
  if (path.endsWith('/games')) return submitGame(req);
  if (path.endsWith('/leaderboard/me')) return getMe(req);
  return getBoard(req);
};

/** A real game saved one move before its end, started ten minutes ago. */
function almost(seed: number) {
  const played = playGame(P, seed);
  const last = played.actions[played.actions.length - 1];
  const before = playGame(P, seed, 1, Math.random, played.actions.length - 1);
  return {
    seed, last, final: played.state,
    save: { puzzleId: P.id, puzzleVersion: P.version, rules: RULES_ID, seed, log: before.actions, startedAt: new Date(Date.now() - 600_000).toISOString(), score: before.state.scores, over: false },
  };
}

await run('Duel ranks', async (t: any) => {
  const { check, waitFor, evaluate, open, click, text, exists, setSize, setSchedule, setApi, reduceMotion, axe } = t;
  const db = await testDb();
  setDb(db);
  await query('select count(*) from players');
  setSchedule(SCHEDULE);
  setApi(handlers);
  await reduceMotion(true);

  const gameKey = (d: string) => `panna_duel_game:${d}`;
  const lastMove = async (g: ReturnType<typeof almost>) => {
    await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
    const a = g.last as Action;
    if (a.t === 'submit') {
      for (const pl of a.place) {
        await evaluate(`document.querySelector('[data-rack="${pl.rackSlot}"] .duel-tile').click(); true`);
        await waitFor(`window.__duel.snapshot().lifted === ${pl.rackSlot}`, 2000);
        await evaluate(`document.querySelector('.duel-board [data-cell="${pl.cell}"]').click(); true`);
        await waitFor(`window.__duel.snapshot().pending.some((x) => x.cell === ${pl.cell})`, 3000);
      }
    }
    await click('[data-act="submit"]');
    return waitFor(`Boolean(document.querySelector('.duel-end'))`, 30000);
  };
  const totalPoints = async () => (await query<{ s: number }>('select coalesce(sum(points), 0)::int as s from weekly_totals'))[0].s;
  const addPlayer = async (name: string, points: number, week = THIS_WEEK) => {
    const id = randomUUID();
    await query(`insert into players (id, token_hash, name, name_key) values ($1::uuid, $2, $3, $4)`, [id, randomBytes(32).toString('hex'), name, name.toLowerCase().replace(/ /g, '')]);
    await query(`insert into weekly_totals (player_id, week, points, games) values ($1::uuid, $2::text::date, $3::int, 1)`, [id, week, points]);
  };

  for (const [size, S] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
    await setSize(S);
    await db.clear();

    // ── No player yet ──
    await open('/play/ranks', {});
    check(`${size}: no player: the board still shows`, await waitFor(`document.querySelectorAll('.rank-pod').length === 3`));
    check(`${size}: and says how to join`, (await text('#duel-ranks')).includes('Finish a game to join this week’s ranks'));
    check(`${size}: bots carry their label`, await evaluate(`document.querySelectorAll('[data-bot]').length === 8`));
    check(`${size}: the podium has 3, and the list starts at 4`, (await text('.rank-list .rank-num')) === '4');
    check(`${size}: the time left shows`, /Resets in .*Monday, midnight IST/.test(await text('.rank-reset')), await text('.rank-reset'));
    await open('/play/settings', {});
    check(`${size}: no player: Settings says the name comes later`, await waitFor(`document.querySelector('#set-name')?.innerText.includes('after your first finished game')`));
    await open('/play', { }); await waitFor(`Boolean(document.querySelector('#duel-week-card'))`, 15000);
    check(`${size}: the home's card says how to join`, (await text('#duel-week-card')).includes('Finish a game to join'), await text('#duel-week-card'));

    // ── The whole loop ──
    const g = almost(size === 'phone' ? 11 : 12);
    await open(`/play/game/${TODAY}?seed=${g.seed}`, { [gameKey(TODAY)]: g.save });
    check(`${size}: the game ends`, await lastMove(g));
    check(`${size}: the end screen shows the score and a rank`, await waitFor(`/#\\d+/.test(document.querySelector('[data-stat="week"]')?.innerText ?? '')`, 15000), await text('[data-stat="week"]'));
    check(`${size}: with the server's total`, (await text('[data-stat="week"]')).includes(g.final.scores.you.toLocaleString('en-IN')), await text('[data-stat="week"]'));
    check(`${size}: the server stored it`, await totalPoints() === g.final.scores.you, await totalPoints());
    check(`${size}: and the outbox is empty`, await evaluate(`JSON.parse(localStorage.getItem('panna_duel_outbox') || '[]').length === 0`));
    await click('[data-end="ranks"]');
    check(`${size}: Ranks opens`, await waitFor(`Boolean(document.querySelector('#duel-ranks'))`));
    check(`${size}: your row is there, marked`, await waitFor(`Array.from(document.querySelectorAll('.rank-row.me, .rank-pod.me')).length >= 1`, 15000));
    const name = JSON.parse(await evaluate(`localStorage.getItem('panna_duel_player')`)).name as string;
    check(`${size}: it reads You · your name`, (await text('.rank-row.me .rank-name, .rank-pod.me')).includes('You'), await text('.rank-row.me .rank-name'));
    check(`${size}: the name came from the server`, /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name), name);

    // ── Offline ──
    const off = almost(size === 'phone' ? 21 : 22);
    const before = await totalPoints();
    const stored = await evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('panna_duel_')).map(k => [k, JSON.parse(localStorage.getItem(k))])))`);
    await open(`/play/game/${YESTERDAY}?seed=${off.seed}`, { ...JSON.parse(stored), [gameKey(YESTERDAY)]: off.save });
    await waitFor(`Boolean(window.__duel)`, 20000);
    setApi('fail');
    check(`${size}: offline: the game still ends`, await lastMove(off));
    check(`${size}: offline: it says it will count later`, await waitFor(`(document.querySelector('[data-stat="week"]')?.innerText ?? '').includes('will count when you’re online')`, 20000), await text('[data-stat="week"]'));
    check(`${size}: offline: the last total plus what's waiting`, (await text('[data-stat="week"]')).includes((before + off.final.scores.you).toLocaleString('en-IN')), await text('[data-stat="week"]'));
    check(`${size}: offline: it waits in the outbox`, await evaluate(`JSON.parse(localStorage.getItem('panna_duel_outbox')).length === 1`));
    check(`${size}: offline: nothing reached the server`, await totalPoints() === before);
    setApi(handlers);
    await evaluate(`dispatchEvent(new Event('online')); true`);
    check(`${size}: back online: it is sent`, await waitFor(`JSON.parse(localStorage.getItem('panna_duel_outbox')).length === 0`, 15000));
    check(`${size}: and counted once`, await totalPoints() === before + off.final.scores.you, await totalPoints());
    check(`${size}: the card now has a rank`, await waitFor(`/#\\d+/.test(document.querySelector('[data-stat="week"]')?.innerText ?? '')`));

    // ── A game the server refuses ──
    const bad = almost(size === 'phone' ? 31 : 32);
    const stored2 = await evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('panna_duel_')).map(k => [k, JSON.parse(localStorage.getItem(k))])))`);
    await open(`/play/game/${YESTERDAY}?seed=${bad.seed}`, { ...JSON.parse(stored2), [gameKey(YESTERDAY)]: { ...bad.save, startedAt: new Date().toISOString() } });
    await lastMove(bad);
    check(`${size}: a refused game says so plainly`, await waitFor(`(document.querySelector('[data-stat="week"]')?.innerText ?? '').includes('This game couldn’t be counted')`, 15000), await text('[data-stat="week"]'));
    check(`${size}: its result stands on the device`, await evaluate(`JSON.parse(localStorage.getItem('panna_duel_results')).some((r) => r.date === ${JSON.stringify(YESTERDAY)})`));

    // ── A full board: pinned row, rename, Last week ──
    await db.clear();
    for (let i = 0; i < 30; i++) await addPlayer(`Reader ${String(i).padStart(2, '0')}`, 90_000 - i);
    await addPlayer('Old Reader', 1234, addWeeks(THIS_WEEK, -1));
    const finished = await evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('panna_duel_')).map(k => [k, JSON.parse(localStorage.getItem(k))])))`);
    const low = almost(size === 'phone' ? 41 : 42);
    await open(`/play/game/${TODAY}?seed=${low.seed}`, { panna_duel_player: JSON.parse(finished).panna_duel_player, [gameKey(TODAY)]: low.save });
    await lastMove(low);
    await click('[data-end="ranks"]');
    await waitFor(`Boolean(document.querySelector('.rank-row.me'))`, 15000);
    const serverRank = JSON.parse(await evaluate(`localStorage.getItem('panna_duel_week')`)).rank;
    check(`${size}: this screen and the server agree on your rank`, (await text('.rank-list .rank-row.me .rank-num')) === String(serverRank), [await text('.rank-list .rank-row.me .rank-num'), serverRank]);
    check(`${size}: your row is pinned while it's off-screen`, await waitFor(`Boolean(document.querySelector('.rank-pinned .rank-row.me'))`), await text('#duel-ranks'));
    await evaluate(`document.querySelector('.rank-list .rank-row.me').scrollIntoView({ block: 'center' }); true`);
    check(`${size}: the pinned copy hides when the real one is in view`, await waitFor(`!document.querySelector('.rank-pinned')`, 3000));
    await axe(`${size}: ranks, Day`);
    await t.light('evening');
    await axe(`${size}: ranks, Evening`);
    await t.light('day');

    await click('.rank-list .rank-row.me .rank-edit');
    check(`${size}: rename opens`, await waitFor(`Boolean(document.querySelector('#duel-rename'))`));
    const type = (v: string) => evaluate(`(() => { const i = document.querySelector('#rename-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const tryName = async (v: string, want: string) => {
      await type(v);
      await click('#rename-save');
      check(`${size}: rename "${v}": ${want}`, await waitFor(`document.querySelector('#rename-err')?.textContent.includes(${JSON.stringify(want)})`, 5000), await text('#rename-err'));
    };
    await tryName('ab', 'At least 3 letters');
    await tryName('fuck you', 'isn’t allowed');
    await tryName('Reader 00', 'already has that name');
    await tryName('पन्ना जी', 'English letters');
    await click('#rename-die');
    check(`${size}: the die fills the box`, /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(await evaluate(`document.querySelector('#rename-input').value`)));
    check(`${size}: three suggestions`, await evaluate(`document.querySelectorAll('.rename-sugg button').length === 3`));
    await axe(`${size}: rename`);
    await type('Tea Lover');
    await click('#rename-save');
    check(`${size}: saving updates your row`, await waitFor(`document.querySelector('.rank-list .rank-row.me .rank-name')?.innerText.includes('Tea Lover')`, 8000), await text('.rank-list .rank-row.me .rank-name'));
    check(`${size}: and the device`, JSON.parse(await evaluate(`localStorage.getItem('panna_duel_player')`)).name === 'Tea Lover');

    await click('[data-tab="last"]');
    check(`${size}: Last week shows final standings`, await waitFor(`(document.querySelector('.rank-reset')?.innerText ?? '').includes('Final standings')`), await text('.rank-reset'));
    check(`${size}: with last week's players`, (await text('#duel-ranks')).includes('Old Reader'));
    check(`${size}: and no card when you didn't play then`, !(await exists('[data-last-card]')));
    await click('[data-tab="this"]');
    await waitFor(`Boolean(document.querySelector('.rank-reset b'))`);

    // ── Settings and home show the new name and place ──
    const nowStored = await evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('panna_duel_')).map(k => [k, JSON.parse(localStorage.getItem(k))])))`);
    await open('/play/settings', JSON.parse(nowStored));
    check(`${size}: Settings shows the name`, await waitFor(`document.querySelector('#set-name')?.innerText.includes('Tea Lover')`));
    await click('#set-name');
    check(`${size}: Settings can rename too`, await waitFor(`Boolean(document.querySelector('#duel-rename'))`));
    await axe(`${size}: settings rename`);
    await open('/play', JSON.parse(nowStored));
    check(`${size}: the home's card shows your points and place`, await waitFor(`/#\\d+/.test(document.querySelector('#duel-week-card')?.innerText ?? '') && (document.querySelector('#duel-week-card')?.innerText ?? '').includes('This week')`, 15000), await text('#duel-week-card'));
    await click('#duel-week-card');
    check(`${size}: and opens the ranks`, await waitFor(`location.pathname === '/play/ranks'`));

    // ── Offline with a copy, and without ──
    await waitFor(`Boolean(document.querySelector('.rank-list'))`, 10000);
    setApi('fail');
    await t.go('/play/ranks');
    check(`${size}: offline: the last copy`, await waitFor(`(document.querySelector('.rank-note')?.innerText ?? '').includes('last copy')`, 10000), await text('#duel-ranks'));
    check(`${size}: offline: your place from what the server last said`, await waitFor(`Boolean(document.querySelector('.rank-row.me'))`, 3000));
    await open('/play/ranks', {});
    check(`${size}: offline, no copy: a plain message and Try again`, await waitFor(`(document.querySelector('.rank-empty')?.innerText ?? '').includes('Can’t reach the ranks')`, 10000), await text('#duel-ranks'));
    setApi(handlers);
    await click('.rank-empty .bigbtn');
    check(`${size}: Try again works`, await waitFor(`document.querySelectorAll('.rank-pod').length === 3`, 10000));
  }

  // ── The climb ──
  await setSize(PHONE);
  await db.clear();
  for (let i = 0; i < 20; i++) await addPlayer(`Reader ${String(i).padStart(2, '0')}`, 90_000 - i * 100);
  const me = { id: randomUUID(), token: randomBytes(32).toString('hex') };
  await registerPlayer(new Request('http://t/players', { method: 'POST', body: JSON.stringify(me) }));
  await query(`insert into weekly_totals (player_id, week, points, games) values ($1::uuid, $2::text::date, 88500, 3)`, [me.id, THIS_WEEK]);
  const playerName = (await query<{ name: string }>(`select name from players where id = $1::uuid`, [me.id]))[0].name;
  const stored = {
    panna_duel_player: { ...me, name: playerName },
    panna_duel_week: { week: THIS_WEEK, points: 80_000, rank: 22, day: TODAY, dayRank: 22, seen: { rank: 22, points: 80_000 } },
  };
  await reduceMotion(false);
  await open('/play/ranks', stored);
  check('climb: your row glides up', await waitFor(`(document.querySelector('.rank-list .rank-row.me')?.getAnimations() ?? []).length > 0`, 10000));
  check('climb: only transforms move', await evaluate(`[...document.querySelector('.rank-list .rank-row.me').getAnimations()].every((a) => a.effect.getKeyframes().every((k) => !('top' in k) && !('height' in k)))`));
  check('climb: +N shows', (await text('.rank-list .rank-row.me .rank-gain')) === '+8500', await text('.rank-list .rank-row.me .rank-gain'));
  check('climb: the rank ends right', await waitFor(`document.querySelector('.rank-list .rank-row.me .rank-num').textContent === String([...document.querySelectorAll('.rank-list .rank-row')].findIndex((r) => r.classList.contains('me')) + 4)`, 5000), await text('.rank-list .rank-row.me .rank-num'));
  const seenNow = JSON.parse(await evaluate(`localStorage.getItem('panna_duel_week')`)).seen;
  check('climb: what was shown is remembered', seenNow.points === 88500 && seenNow.rank < 22, seenNow);
  await t.go('/play/ranks');
  await waitFor(`Boolean(document.querySelector('.rank-list .rank-row.me'))`, 10000);
  await new Promise(r => setTimeout(r, 400));
  check('climb: a second visit doesn\'t replay it', await evaluate(`document.querySelector('.rank-list .rank-row.me').getAnimations().length === 0 && !document.querySelector('.rank-gain')`));
  await reduceMotion(true);
  await open('/play/ranks', stored);
  await waitFor(`Boolean(document.querySelector('.rank-list .rank-row.me'))`, 10000);
  await new Promise(r => setTimeout(r, 200));
  check('climb: reduced motion: no glide', await evaluate(`document.querySelector('.rank-list .rank-row.me').getAnimations().filter((a) => a.constructor.name === 'Animation' && !a.animationName).length === 0`));

  // ── The real route, with no database behind it ──
  setApi(null);
  const res = await evaluate(`fetch('/api/duel/leaderboard?week=this').then(async (r) => ({ status: r.status, body: await r.json(), cache: r.headers.get('cache-control') }))`);
  check('the real route answers 503 with no database', res.status === 503 && res.body.error === 'unavailable', res);
  await open('/play/ranks', {});
  check('and the screen says it can\'t reach the ranks', await waitFor(`(document.querySelector('.rank-empty')?.innerText ?? '').includes('Can’t reach the ranks')`, 10000));
});
