-- Chog Dash leaderboard storage for Supabase.
-- Run once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run).
-- Safe to run again: it only creates what is missing and replaces the functions.
--
-- The game server calls these functions through Supabase's REST API with the service role key.
-- Browsers never talk to the database: row level security is on with no policies, and the
-- functions can only be run by the service role.

-- Short-lived and small records: sign-in nonces, run sessions, cached metadata, usernames.
create table if not exists chog_kv (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz            -- null = never expires
);
create index if not exists chog_kv_expires_idx on chog_kv (expires_at) where expires_at is not null;

-- One row per player (wallet): their best validated total distance.
create table if not exists chog_leaderboard (
  wallet text primary key,
  total integer not null,           -- total distance = distance x tier multiplier
  record jsonb not null,            -- the run that set it (username is looked up separately)
  updated_at timestamptz not null default now()
);
create index if not exists chog_leaderboard_rank_idx on chog_leaderboard (total desc, updated_at asc);

-- The separate DEMO leaderboard: demo runs (the 5 demo Chogs, any signed-in wallet). Same shape.
create table if not exists chog_demo_leaderboard (
  wallet text primary key,
  total integer not null,
  record jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists chog_demo_leaderboard_rank_idx on chog_demo_leaderboard (total desc, updated_at asc);

-- The weekly Chog NFT leaderboard (weeks start Monday 00:00 UTC): one row per player per week. The top 10 of a
-- finished week share that week's prize pool (contracts/ChogDashPool.sol).
create table if not exists chog_week_leaderboard (
  week integer not null,
  wallet text not null,
  total integer not null,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (week, wallet)
);
create index if not exists chog_week_leaderboard_rank_idx on chog_week_leaderboard (week, total desc, updated_at asc);

-- Every submitted run, validated or rejected, with the reason.
create table if not exists chog_runs (
  id bigserial primary key,
  record jsonb not null,
  created_at timestamptz not null default now()
);

alter table chog_kv enable row level security;
alter table chog_leaderboard enable row level security;
alter table chog_runs enable row level security;
alter table chog_demo_leaderboard enable row level security;
alter table chog_week_leaderboard enable row level security;

-- Belt and braces: the public keys get no table access at all (row level security already blocks them)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on chog_kv, chog_leaderboard, chog_runs, chog_demo_leaderboard, chog_week_leaderboard from anon, authenticated;
    revoke all on sequence chog_runs_id_seq from anon, authenticated;
  end if;
end;
$$;

-- ---------- Key-value ----------
create or replace function chog_kv_get(p_key text) returns jsonb
language sql stable as $$
  select value from chog_kv where key = p_key and (expires_at is null or expires_at > now());
$$;

-- Values for several keys, in the same order (null where missing or expired)
create or replace function chog_kv_mget(p_keys text[]) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(kv.value order by k.ord), '[]'::jsonb)
  from unnest(p_keys) with ordinality as k(key, ord)
  left join chog_kv kv on kv.key = k.key and (kv.expires_at is null or kv.expires_at > now());
$$;

create or replace function chog_kv_set(p_key text, p_value jsonb, p_ttl integer) returns boolean
language sql as $$
  insert into chog_kv (key, value, expires_at)
  values (p_key, p_value, case when p_ttl > 0 then now() + make_interval(secs => p_ttl) end)
  on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at;
  select true;
$$;

-- Set only if the key is missing or expired. Returns true if it was set.
-- Atomic: used so a run is only submitted once and a username is only taken once.
create or replace function chog_kv_set_nx(p_key text, p_value jsonb, p_ttl integer) returns boolean
language plpgsql as $$
declare n integer;
begin
  delete from chog_kv where key = p_key and expires_at is not null and expires_at <= now();
  insert into chog_kv (key, value, expires_at)
  values (p_key, p_value, case when p_ttl > 0 then now() + make_interval(secs => p_ttl) end)
  on conflict (key) do nothing;
  get diagnostics n = row_count;
  -- Tidy up other expired rows now and then
  if random() < 0.02 then delete from chog_kv where expires_at is not null and expires_at <= now(); end if;
  return n > 0;
end;
$$;

-- Adds p_delta to a number (missing = 0) unless the result would go below p_min. Returns the new value, or null.
-- Atomic: used for ticket balances, so two runs can't spend the same ticket.
create or replace function chog_kv_add(p_key text, p_delta integer, p_min integer) returns integer
language plpgsql as $$
declare v integer;
begin
  insert into chog_kv (key, value, expires_at) values (p_key, to_jsonb(0), null) on conflict (key) do nothing;
  update chog_kv set value = to_jsonb(value::text::integer + p_delta)
    where key = p_key and value::text::integer + p_delta >= p_min
    returning value::text::integer into v;
  return v;
end;
$$;

create or replace function chog_kv_del(p_key text) returns boolean
language sql as $$
  delete from chog_kv where key = p_key;
  select true;
$$;

-- ---------- Runs and leaderboard ----------
create or replace function chog_run_push(p_record jsonb) returns boolean
language sql as $$
  insert into chog_runs (record) values (p_record);
  select true;
$$;

-- Keeps the higher total. Returns true if the player's best changed.
create or replace function chog_best_update(p_wallet text, p_total integer, p_record jsonb) returns boolean
language plpgsql as $$
declare n integer;
begin
  insert into chog_leaderboard (wallet, total, record, updated_at)
  values (p_wallet, p_total, p_record, now())
  on conflict (wallet) do update set total = excluded.total, record = excluded.record, updated_at = now()
    where chog_leaderboard.total < excluded.total;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- 1-based rank (players with a strictly higher total, plus one), or null if not on the board
create or replace function chog_rank(p_wallet text) returns integer
language sql stable as $$
  select 1 + (select count(*)::integer from chog_leaderboard o where o.total > me.total)
  from chog_leaderboard me where me.wallet = p_wallet;
$$;

-- One player's best run record, or null
create or replace function chog_best(p_wallet text) returns jsonb
language sql stable as $$
  select record from chog_leaderboard where wallet = p_wallet;
$$;

-- Best records, highest total first (earlier runs win ties)
create or replace function chog_top(p_n integer) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(record order by total desc, updated_at asc), '[]'::jsonb)
  from (select record, total, updated_at from chog_leaderboard order by total desc, updated_at asc limit p_n) t;
$$;

-- ---------- DEMO leaderboard (same as above, on chog_demo_leaderboard) ----------
create or replace function chog_demo_best_update(p_wallet text, p_total integer, p_record jsonb) returns boolean
language plpgsql as $$
declare n integer;
begin
  insert into chog_demo_leaderboard (wallet, total, record, updated_at)
  values (p_wallet, p_total, p_record, now())
  on conflict (wallet) do update set total = excluded.total, record = excluded.record, updated_at = now()
    where chog_demo_leaderboard.total < excluded.total;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function chog_demo_rank(p_wallet text) returns integer
language sql stable as $$
  select 1 + (select count(*)::integer from chog_demo_leaderboard o where o.total > me.total)
  from chog_demo_leaderboard me where me.wallet = p_wallet;
$$;

create or replace function chog_demo_best(p_wallet text) returns jsonb
language sql stable as $$
  select record from chog_demo_leaderboard where wallet = p_wallet;
$$;

create or replace function chog_demo_top(p_n integer) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(record order by total desc, updated_at asc), '[]'::jsonb)
  from (select record, total, updated_at from chog_demo_leaderboard order by total desc, updated_at asc limit p_n) t;
$$;

-- ---------- Weekly Chog NFT leaderboard ----------
create or replace function chog_week_best_update(p_week integer, p_wallet text, p_total integer, p_record jsonb) returns boolean
language plpgsql as $$
declare n integer;
begin
  insert into chog_week_leaderboard (week, wallet, total, record, updated_at)
  values (p_week, p_wallet, p_total, p_record, now())
  on conflict (week, wallet) do update set total = excluded.total, record = excluded.record, updated_at = now()
    where chog_week_leaderboard.total < excluded.total;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function chog_week_rank(p_week integer, p_wallet text) returns integer
language sql stable as $$
  select 1 + (select count(*)::integer from chog_week_leaderboard o where o.week = p_week and o.total > me.total)
  from chog_week_leaderboard me where me.week = p_week and me.wallet = p_wallet;
$$;

create or replace function chog_week_best(p_week integer, p_wallet text) returns jsonb
language sql stable as $$
  select record from chog_week_leaderboard where week = p_week and wallet = p_wallet;
$$;

create or replace function chog_week_top(p_week integer, p_n integer) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(record order by total desc, updated_at asc), '[]'::jsonb)
  from (select record, total, updated_at from chog_week_leaderboard where week = p_week
        order by total desc, updated_at asc limit p_n) t;
$$;

-- Disqualifies a player from a week (before the payout)
create or replace function chog_week_remove(p_week integer, p_wallet text) returns boolean
language sql as $$
  delete from chog_week_leaderboard where week = p_week and wallet = p_wallet;
  select true;
$$;

-- Only the server (service role) may run these. Supabase lets anyone with the public anon key
-- call functions in the public schema unless execute is revoked, so revoke it.
do $$
declare f text;
begin
  foreach f in array array[
    'chog_kv_get(text)', 'chog_kv_mget(text[])', 'chog_kv_set(text,jsonb,integer)',
    'chog_kv_set_nx(text,jsonb,integer)', 'chog_kv_del(text)', 'chog_run_push(jsonb)',
    'chog_best_update(text,integer,jsonb)', 'chog_rank(text)', 'chog_best(text)', 'chog_top(integer)',
    'chog_demo_best_update(text,integer,jsonb)', 'chog_demo_rank(text)', 'chog_demo_best(text)', 'chog_demo_top(integer)',
    'chog_kv_add(text,integer,integer)', 'chog_week_best_update(integer,text,integer,jsonb)', 'chog_week_rank(integer,text)',
    'chog_week_best(integer,text)', 'chog_week_top(integer,integer)', 'chog_week_remove(integer,text)'
  ] loop
    execute 'revoke all on function ' || f || ' from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'revoke all on function ' || f || ' from anon, authenticated';
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant execute on function ' || f || ' to service_role';
    end if;
  end loop;
end;
$$;
