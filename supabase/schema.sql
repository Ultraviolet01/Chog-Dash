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

-- Every submitted run, validated or rejected, with the reason.
create table if not exists chog_runs (
  id bigserial primary key,
  record jsonb not null,
  created_at timestamptz not null default now()
);

alter table chog_kv enable row level security;
alter table chog_leaderboard enable row level security;
alter table chog_runs enable row level security;

-- Belt and braces: the public keys get no table access at all (row level security already blocks them)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on chog_kv, chog_leaderboard, chog_runs from anon, authenticated;
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

-- Best records, highest total first (earlier runs win ties)
create or replace function chog_top(p_n integer) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(record order by total desc, updated_at asc), '[]'::jsonb)
  from (select record, total, updated_at from chog_leaderboard order by total desc, updated_at asc limit p_n) t;
$$;

-- Only the server (service role) may run these. Supabase lets anyone with the public anon key
-- call functions in the public schema unless execute is revoked, so revoke it.
do $$
declare f text;
begin
  foreach f in array array[
    'chog_kv_get(text)', 'chog_kv_mget(text[])', 'chog_kv_set(text,jsonb,integer)',
    'chog_kv_set_nx(text,jsonb,integer)', 'chog_kv_del(text)', 'chog_run_push(jsonb)',
    'chog_best_update(text,integer,jsonb)', 'chog_rank(text)', 'chog_top(integer)'
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
