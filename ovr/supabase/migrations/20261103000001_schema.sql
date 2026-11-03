-- OVR schema: tables, enums, RLS.
-- All XP / OVR / league numbers are written ONLY by security-definer functions
-- (see 0002+). Clients get read access through RLS and write through RPCs.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- enums
create type public.attribute as enum ('body','mind','focus','discipline','social','craft');
create type public.difficulty as enum ('minor','standard','major','custom');
create type public.xp_reason as enum ('habit','perfect_day','quit_day','badge','undo');
create type public.reaction_kind as enum ('fire','flex','salute','clown');

-- ---------------------------------------------------------------- config
-- Server-side settings (app url for push dispatch, cron secret, league tz…).
-- `fake_now` exists ONLY for local tests; production never sets it.
create table private.app_config (
  key text primary key,
  value text not null
);
insert into private.app_config(key, value) values
  ('league_timezone', 'Pacific/Auckland'),
  ('season_epoch', '2026-11-02'),          -- a Monday; seasons are 6 ISO weeks from here
  ('daily_xp_cap', '500');

create or replace function private.cfg(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.app_config where key = p_key
$$;

create or replace function private.app_now() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce((select value::timestamptz from private.app_config where key = 'fake_now'), now())
$$;

create or replace function private.is_valid_tz(p_tz text) returns boolean
language sql immutable as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz)
$$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle extensions.citext not null unique
    check (handle::text ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  avatar_seed text not null default md5(random()::text),
  timezone text not null default 'Pacific/Auckland' check (private.is_valid_tz(timezone)),
  baseline_ovr smallint not null default 55 check (baseline_ovr between 45 and 65),
  start_date date not null default (now() at time zone 'Pacific/Auckland')::date,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- Owner-only settings. (Spec put `setup` on profiles; moved here so goals,
-- self-ratings and notification times are never visible to the league.)
create table public.profile_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  setup jsonb not null default '{}'::jsonb,   -- {focus:[], ratings:{}, goal, timeframe}
  notify jsonb not null default
    '{"morning":"07:30","evening":"20:30","morning_on":true,"evening_on":true,"recap_on":true}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.invite_codes (
  code text primary key check (code ~ '^[A-Z0-9]{4,16}$'),
  created_by uuid references public.profiles(id) on delete set null,
  uses_left int not null default 1 check (uses_left >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- habits
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  emoji text not null default '✅' check (char_length(emoji) between 1 and 16),
  attribute public.attribute not null,
  difficulty public.difficulty not null default 'standard',
  custom_xp int check (custom_xp between 5 and 50),
  schedule jsonb not null default '{"type":"daily","target_per_day":1}'::jsonb,
  reminder_time time,                       -- groups Today into morning/afternoon/evening
  visible_to_league boolean not null default true,
  sort_order int not null default 0,
  start_date date not null,                 -- set by trigger; OVR/XP counts from here
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint custom_xp_iff_custom check ((difficulty = 'custom') = (custom_xp is not null)),
  constraint schedule_shape check (
    schedule ? 'type'
    and schedule->>'type' in ('daily','weekdays','times_per_week')
    and coalesce((schedule->>'target_per_day')::int, 1) between 1 and 20
    and (schedule->>'type' <> 'weekdays' or jsonb_array_length(coalesce(schedule->'days','[]'::jsonb)) between 1 and 7)
    and (schedule->>'type' <> 'times_per_week' or coalesce((schedule->>'times_per_week')::int,0) between 1 and 7)
  )
);
create index on public.habits(user_id);

create table public.completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  count int not null check (count between 1 and 20),
  xp_awarded int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, local_date)
);
create index on public.completions(user_id, local_date);

-- Idempotency for offline-queued operations.
create table public.completion_ops (
  op_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null,
  reason public.xp_reason not null,
  ref_id uuid,
  local_date date not null,
  created_at timestamptz not null default private.app_now()   -- same clock as the undo window
);
create index on public.xp_ledger(user_id, local_date);
create index on public.xp_ledger(ref_id);
create unique index xp_ledger_quit_day_once on public.xp_ledger(ref_id, local_date) where reason = 'quit_day';
create unique index xp_ledger_badge_once on public.xp_ledger(user_id, ref_id) where reason = 'badge';

create table public.ovr_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  overall smallint not null,
  body smallint, mind smallint, focus smallint, discipline smallint, social smallint, craft smallint,
  xp_total int not null default 0,
  level int not null default 1,
  ovr_raw double precision,
  top_reasons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

-- ---------------------------------------------------------------- quit
create table public.quit_trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  started_at timestamptz not null default now(),   -- may be backdated (for the counter)
  last_reset_at timestamptz not null default now(),
  best_streak_seconds bigint not null default 0,
  visible_to_league boolean not null default false,
  credit_start date not null,                        -- set by trigger; XP/OVR only from here
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.quit_trackers(user_id);

create table public.relapses (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.quit_trackers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  trigger_tag text check (char_length(trigger_tag) <= 30),
  note text check (char_length(note) <= 280)
);
create index on public.relapses(tracker_id, local_date);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  mood smallint not null check (mood between 1 and 5),
  body text not null default '' check (char_length(body) <= 140),
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

-- ---------------------------------------------------------------- league
create table public.weekly_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  iso_week text not null check (iso_week ~ '^\d{4}-W\d{2}$'),
  completion_rate double precision not null default 0,
  xp_week int not null default 0,
  done double precision not null default 0,
  scheduled double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, iso_week)
);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  kind public.reaction_kind not null,
  local_date date not null,
  created_at timestamptz not null default now(),
  check (from_user <> to_user),
  unique (from_user, to_user, kind, local_date)
);
create index on public.reactions(to_user, local_date);

create table public.league_positions (
  local_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekly_pos int not null,
  alltime_pos int not null,
  primary key (local_date, user_id)
);

create table public.weekly_recaps (
  iso_week text primary key,
  standings jsonb not null,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('morning','evening','recap','test')),
  local_date date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, local_date)
);

-- ---------------------------------------------------------------- phase 5
create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  local_date date not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

create table public.season_champions (
  season_no int primary key,
  user_id uuid references public.profiles(id) on delete set null,
  avg_rate double precision not null,
  decided_at timestamptz not null default now()
);

create table public.duos (
  id uuid primary key default gen_random_uuid(),
  iso_week text not null,
  user_a uuid not null references public.profiles(id) on delete cascade,  -- inviter
  user_b uuid not null references public.profiles(id) on delete cascade,  -- invitee
  status text not null default 'pending' check (status in ('pending','active','declined')),
  created_at timestamptz not null default now(),
  check (user_a <> user_b)
);
create index on public.duos(iso_week);

-- ================================================================ RLS
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

alter table public.profiles enable row level security;
alter table public.profile_settings enable row level security;
alter table public.invite_codes enable row level security;
alter table public.habits enable row level security;
alter table public.completions enable row level security;
alter table public.completion_ops enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.ovr_snapshots enable row level security;
alter table public.quit_trackers enable row level security;
alter table public.relapses enable row level security;
alter table public.journal_entries enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.reactions enable row level security;
alter table public.league_positions enable row level security;
alter table public.weekly_recaps enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.user_badges enable row level security;
alter table public.season_champions enable row level security;
alter table public.duos enable row level security;

-- profiles: league-readable; owner may update display fields only (column grants below)
create policy profiles_read on public.profiles for select to authenticated using (public.is_member());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (handle, display_name, avatar_seed, timezone) on public.profiles to authenticated;

create policy settings_own on public.profile_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.profile_settings from authenticated, anon;

create policy invites_own on public.invite_codes for select to authenticated using (created_by = auth.uid());

-- habits: owner CRUD; league reads visible ones
create policy habits_own on public.habits for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habits_league on public.habits for select to authenticated
  using (visible_to_league and public.is_member());
revoke update on public.habits from authenticated;
grant update (title, emoji, attribute, difficulty, custom_xp, schedule, reminder_time,
              visible_to_league, sort_order, archived_at) on public.habits to authenticated;
revoke delete on public.habits from authenticated;   -- archive instead (keeps history)

-- owner-read only, writes via RPC
create policy completions_own on public.completions for select to authenticated using (user_id = auth.uid());
create policy ledger_own on public.xp_ledger for select to authenticated using (user_id = auth.uid());
create policy relapses_own on public.relapses for select to authenticated using (user_id = auth.uid());
create policy pushsubs_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notiflog_own on public.notification_log for select to authenticated using (user_id = auth.uid());

-- journal: owner-only, always
create policy journal_own on public.journal_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- league-readable, server-written
create policy snapshots_read on public.ovr_snapshots for select to authenticated using (public.is_member());
create policy weekly_read on public.weekly_scores for select to authenticated using (public.is_member());
create policy positions_read on public.league_positions for select to authenticated using (public.is_member());
create policy recaps_read on public.weekly_recaps for select to authenticated using (public.is_member());
create policy badges_read on public.user_badges for select to authenticated using (public.is_member());
create policy champions_read on public.season_champions for select to authenticated using (public.is_member());
create policy duos_read on public.duos for select to authenticated using (public.is_member());

-- quit trackers: owner CRUD (no delete: archive), league reads visible ones
create policy quit_own on public.quit_trackers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quit_league on public.quit_trackers for select to authenticated
  using (visible_to_league and public.is_member());
revoke update on public.quit_trackers from authenticated;
grant update (title, visible_to_league, archived_at) on public.quit_trackers to authenticated;
revoke delete on public.quit_trackers from authenticated;

-- reactions: members read all; send as yourself; take back your own
create policy reactions_read on public.reactions for select to authenticated using (public.is_member());
create policy reactions_insert on public.reactions for insert to authenticated
  with check (from_user = auth.uid() and public.is_member());
create policy reactions_delete on public.reactions for delete to authenticated using (from_user = auth.uid());
revoke update on public.reactions from authenticated;

-- anon gets nothing on tables; nobody gets truncate/trigger/references
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ================================================================ triggers
create or replace function private.local_today(p_user uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (private.app_now() at time zone coalesce(
            (select timezone from public.profiles where id = p_user), 'Pacific/Auckland'))::date
$$;

create or replace function private.habits_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.start_date := private.local_today(new.user_id);
    new.created_at := now();
  else
    new.start_date := old.start_date;
    new.user_id := old.user_id;
  end if;
  return new;
end $$;
create trigger habits_before_write before insert or update on public.habits
  for each row execute function private.habits_before_write();

create or replace function private.quit_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.credit_start := private.local_today(new.user_id);
    if new.started_at > private.app_now() then new.started_at := private.app_now(); end if;
    new.last_reset_at := new.started_at;
    new.best_streak_seconds := 0;
  else
    new.credit_start := old.credit_start;
    new.user_id := old.user_id;
  end if;
  return new;
end $$;
create trigger quit_before_write before insert or update on public.quit_trackers
  for each row execute function private.quit_before_write();

create or replace function private.journal_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- journal can be written for today or yesterday only
  if new.local_date not in (private.local_today(new.user_id), private.local_today(new.user_id) - 1) then
    raise exception 'date_out_of_range' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger journal_before_write before insert or update on public.journal_entries
  for each row execute function private.journal_before_write();

create or replace function private.reactions_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.local_date := (private.app_now() at time zone private.cfg('league_timezone'))::date;
  return new;
end $$;
create trigger reactions_before_insert before insert on public.reactions
  for each row execute function private.reactions_before_insert();

-- ================================================================ signup / invites
-- Auth hook: reject signups without a valid invite (friendly 403).
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(trim(coalesce(event->'user'->'user_metadata'->>'invite_code', '')));
begin
  if exists (select 1 from public.invite_codes
             where code = v_code and uses_left > 0
               and (expires_at is null or expires_at > now())) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Invite code invalid or used up. Ask a mate for a fresh one.'));
end $$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- Belt and braces: the same check runs in the users trigger, so signup is
-- invite-only even if the hook is ever disabled.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_name text := split_part(coalesce(new.email, 'player'), '@', 1);
begin
  update public.invite_codes set uses_left = uses_left - 1
   where code = v_code and uses_left > 0 and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'invite_required' using errcode = 'P0001';
  end if;
  insert into public.profiles(id, handle, display_name, start_date)
  values (new.id,
          'p_' || substr(replace(new.id::text, '-', ''), 1, 10),
          left(coalesce(nullif(v_name, ''), 'Player'), 30),
          (private.app_now() at time zone 'Pacific/Auckland')::date);
  insert into public.profile_settings(user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.check_invite(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invite_codes
                 where code = upper(trim(p_code)) and uses_left > 0
                   and (expires_at is null or expires_at > now()))
$$;
grant execute on function public.check_invite(text) to anon, authenticated;

create or replace function public.create_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_active int;
begin
  if not public.is_member() then raise exception 'not_member'; end if;
  select count(*) into v_active from public.invite_codes
   where created_by = auth.uid() and uses_left > 0 and (expires_at is null or expires_at > now());
  if v_active >= 3 then raise exception 'invite_limit' using errcode = 'P0001'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.invite_codes(code, created_by, uses_left, expires_at)
  values (v_code, auth.uid(), 1, now() + interval '14 days');
  return v_code;
end $$;
revoke execute on function public.create_invite() from anon;
