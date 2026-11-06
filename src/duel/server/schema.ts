// The Duel's tables. One statement each, because Neon's HTTP driver runs one at a time; all safe to run again.
export const SCHEMA = [
  `create table if not exists players (
    id uuid primary key,
    token_hash text not null,
    name text not null,
    name_key text unique not null,
    created_at timestamptz not null default now(),
    last_seen timestamptz not null default now()
  )`,
  `create table if not exists games (
    player_id uuid not null references players,
    puzzle text not null,
    seed bigint not null,
    rules text not null,
    date date not null,
    actions jsonb,
    score int not null,
    quill_score int not null,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    received_at timestamptz not null default now(),
    week date not null,
    status text not null,
    reject_reason text,
    primary key (player_id, puzzle, seed)
  )`,
  `create table if not exists weekly_totals (
    player_id uuid not null references players,
    week date not null,
    points int not null,
    games int not null,
    updated_at timestamptz not null default now(),
    primary key (player_id, week)
  )`,
  `create table if not exists rate_events (key text not null, at timestamptz not null default now())`,
  `create index if not exists weekly_totals_rank on weekly_totals (week, points desc, updated_at)`,
  `create index if not exists games_recent on games (player_id, received_at)`,
  `create index if not exists rate_events_key on rate_events (key, at)`,
];
