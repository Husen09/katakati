create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key,
  email text not null default '',
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_user_id uuid references profiles(id) on delete set null,
  status text not null check (status in ('setup', 'secret', 'guess', 'result')),
  range_max integer not null default 0,
  sec_idx integer not null default 0,
  turn_idx integer not null default 0,
  state jsonb not null default '{"status":"setup","range":0,"players":[],"secIdx":0,"turn":0,"board":[],"logs":[]}'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table games add column if not exists host_user_id uuid references profiles(id) on delete set null;
alter table games add column if not exists state jsonb not null default '{"status":"setup","range":0,"players":[],"secIdx":0,"turn":0,"board":[],"logs":[]}'::jsonb;
alter table games add column if not exists participants jsonb not null default '[]'::jsonb;
alter table games add column if not exists updated_at timestamptz not null default now();

create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_order integer not null,
  name text not null,
  secret_number integer,
  guessed_by_name text,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, player_order),
  unique (game_id, lower(name)),
  unique (game_id, secret_number)
);

create table if not exists game_board_cells (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  number_value integer not null,
  gone boolean not null default false,
  removed_at timestamptz,
  unique (game_id, number_value)
);

create table if not exists game_logs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  guesser_name text not null,
  guessed_number integer not null,
  was_hit boolean not null default false,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_players_game_id on game_players(game_id);
create index if not exists idx_game_board_cells_game_id on game_board_cells(game_id);
create index if not exists idx_game_logs_game_id on game_logs(game_id);
create index if not exists idx_games_updated_at on games(updated_at desc);
