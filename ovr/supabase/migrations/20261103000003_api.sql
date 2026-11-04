-- Client-facing RPCs. Every write that touches XP/OVR goes through here.

-- ---------------------------------------------------------------- badges
-- Definitions live in lib/badges.ts (copy) — keys must match.
create or replace function private.grant_badge(p_user uuid, p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ins int; d date := private.local_today(p_user);
begin
  insert into public.user_badges(user_id, badge_key, local_date) values (p_user, p_key, d)
  on conflict do nothing;
  get diagnostics ins = row_count;
  if ins > 0 then
    insert into public.xp_ledger(user_id, amount, reason, ref_id, local_date)
    values (p_user, 50, 'badge', md5('badge:' || p_key)::uuid, d) on conflict do nothing;
  end if;
  return ins > 0;
end $$;

create or replace function private.check_badges(p_user uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  got text[] := '{}'; today date := private.local_today(p_user); best int := 0; h record; snap public.ovr_snapshots;
begin
  if exists (select 1 from public.completions where user_id = p_user) then
    if private.grant_badge(p_user, 'first_rep') then got := array_append(got, 'first_rep'); end if;
  end if;
  if exists (select 1 from public.xp_ledger where user_id = p_user and reason = 'perfect_day' and amount > 0) then
    if private.grant_badge(p_user, 'perfect_day') then got := array_append(got, 'perfect_day'); end if;
  end if;
  for h in select id from public.habits where user_id = p_user and archived_at is null loop
    best := greatest(best, (private.habit_streak(h.id, today, today)).streak);
  end loop;
  if best >= 7 and private.grant_badge(p_user, 'streak_7') then got := array_append(got, 'streak_7'); end if;
  if best >= 30 and private.grant_badge(p_user, 'streak_30') then got := array_append(got, 'streak_30'); end if;
  select * into snap from public.ovr_snapshots where user_id = p_user order by local_date desc limit 1;
  if snap.level >= 10 and private.grant_badge(p_user, 'level_10') then got := array_append(got, 'level_10'); end if;
  if snap.overall >= 70 and private.grant_badge(p_user, 'gold') then got := array_append(got, 'gold'); end if;
  if snap.overall >= 93 and private.grant_badge(p_user, 'apex') then got := array_append(got, 'apex'); end if;
  if exists (select 1 from public.quit_trackers where user_id = p_user and archived_at is null
              and private.app_now() - last_reset_at >= interval '30 days') then
    if private.grant_badge(p_user, 'clean_30') then got := array_append(got, 'clean_30'); end if;
  end if;
  if (select count(distinct attribute) from public.habits where user_id = p_user and archived_at is null) = 6 then
    if private.grant_badge(p_user, 'full_house') then got := array_append(got, 'full_house'); end if;
  end if;
  return got;
end $$;

-- ---------------------------------------------------------------- completion state
create or replace function private.habit_state(p_user uuid, p_habit uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare h public.habits; today date := private.local_today(p_user); st record; tc int; yc int; wd int;
  tz text := (select timezone from public.profiles where id = p_user);
begin
  select * into h from public.habits where id = p_habit and user_id = p_user;
  if h.id is null then return null; end if;
  st := private.habit_streak(h.id, today, today);
  select coalesce(max(count) filter (where local_date = today), 0),
         coalesce(max(count) filter (where local_date = today - 1), 0)
    into tc, yc from public.completions where habit_id = h.id and local_date >= today - 1;
  select count(*) into wd from public.completions c
   where c.habit_id = h.id and c.local_date between private.week_start(today) and today
     and c.count >= private.target(h.schedule);
  return to_jsonb(h) || jsonb_build_object(
    'base_xp', private.base_xp(h.difficulty, h.custom_xp),
    'target', private.target(h.schedule),
    'per_week', private.per_week(h.schedule),
    'today_count', tc, 'yesterday_count', yc,
    'scheduled_today', private.sched_type(h.schedule) = 'times_per_week' or private.is_sched_day(h.schedule, today),
    'scheduled_yesterday', h.start_date <= today - 1 and
       (private.sched_type(h.schedule) = 'times_per_week' or private.is_sched_day(h.schedule, today - 1)),
    'week_done', wd,
    'streak', st.streak, 'shields', st.shields, 'last_shield_date', st.last_shield_date,
    'undoable_today', exists (select 1 from public.completions c join public.xp_ledger l on l.ref_id = c.id and l.reason = 'habit'
        where c.habit_id = h.id and c.local_date = today and (l.created_at at time zone tz)::date = today),
    'undoable_yesterday', exists (select 1 from public.completions c join public.xp_ledger l on l.ref_id = c.id and l.reason = 'habit'
        where c.habit_id = h.id and c.local_date = today - 1 and (l.created_at at time zone tz)::date = today));
end $$;

create or replace function private.after_change(p_user uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare today date := private.local_today(p_user); prev public.ovr_snapshots; snap public.ovr_snapshots; badges text[];
begin
  select * into prev from public.ovr_snapshots where user_id = p_user and local_date = today;
  if prev.user_id is null then
    select * into prev from public.ovr_snapshots where user_id = p_user order by local_date desc limit 1;
  end if;
  perform private.refresh_weekly(p_user, private.week_start(p_date), today);
  if private.week_start(p_date) <> private.week_start(today) then
    perform private.refresh_weekly(p_user, private.week_start(today), today);
  end if;
  snap := private.write_snapshot(p_user, today);
  badges := private.check_badges(p_user);
  if array_length(badges, 1) > 0 then snap := private.write_snapshot(p_user, today); end if;
  return jsonb_build_object('ovr', snap.overall, 'prev_ovr', prev.overall, 'level', snap.level,
    'prev_level', prev.level, 'xp_total', snap.xp_total, 'badges', to_jsonb(badges),
    'xp_today', private.day_xp(p_user, today));
end $$;

-- Tap to complete. Idempotent per op_id (offline queue replays are safe).
create or replace function public.log_completion(p_op_id uuid, p_habit_id uuid, p_local_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); today date; h public.habits; tgt int; c public.completions; st record;
  xp int; award int; bonus int := 0; perfect boolean := false; res jsonb; cnt int; wk int; lid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select result into res from public.completion_ops where op_id = p_op_id and user_id = uid;
  if res is not null then return res || '{"replayed":true}'::jsonb; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select result into res from public.completion_ops where op_id = p_op_id and user_id = uid;
  if res is not null then return res || '{"replayed":true}'::jsonb; end if;

  today := private.local_today(uid);
  select * into h from public.habits where id = p_habit_id and user_id = uid and archived_at is null;
  if h.id is null then raise exception 'habit_not_found' using errcode = 'P0001'; end if;
  if p_local_date not in (today, today - 1) then raise exception 'date_out_of_range' using errcode = 'P0001'; end if;
  if p_local_date < h.start_date then raise exception 'before_habit_start' using errcode = 'P0001'; end if;
  tgt := private.target(h.schedule);
  if private.sched_type(h.schedule) = 'times_per_week' then
    select count(*) into wk from public.completions
     where habit_id = h.id and local_date between private.week_start(p_local_date) and private.week_start(p_local_date) + 6
       and local_date <> p_local_date;
    if wk >= private.per_week(h.schedule) then raise exception 'weekly_target_hit' using errcode = 'P0001'; end if;
  elsif not private.is_sched_day(h.schedule, p_local_date) then
    raise exception 'not_scheduled' using errcode = 'P0001';
  end if;

  select * into c from public.completions where habit_id = h.id and local_date = p_local_date for update;
  cnt := coalesce(c.count, 0);
  if cnt >= tgt then
    res := jsonb_build_object('status', 'already_done', 'xp', 0, 'bonus', 0, 'habit', private.habit_state(uid, h.id))
           || private.after_change(uid, p_local_date);
    insert into public.completion_ops(op_id, user_id, result) values (p_op_id, uid, res);
    return res;
  end if;

  st := private.habit_streak(h.id, p_local_date - 1, today);
  xp := private.increment_xp(private.base_xp(h.difficulty, h.custom_xp), st.streak, cnt + 1, tgt);
  award := private.cap_award(uid, p_local_date, xp);

  insert into public.completions as x (habit_id, user_id, local_date, count, xp_awarded)
  values (h.id, uid, p_local_date, 1, award)
  on conflict (habit_id, local_date) do update set count = x.count + 1, xp_awarded = x.xp_awarded + award, updated_at = now()
  returning * into c;
  insert into public.xp_ledger(user_id, amount, reason, ref_id, local_date)
  values (uid, award, 'habit', c.id, p_local_date) returning id into lid;

  if private.is_perfect_day(uid, p_local_date) and private.perfect_bonus_net(uid, p_local_date) = 0 then
    perfect := true;
    bonus := private.cap_award(uid, p_local_date, 25);
    if bonus > 0 then
      insert into public.xp_ledger(user_id, amount, reason, ref_id, local_date)
      values (uid, bonus, 'perfect_day', null, p_local_date);
    end if;
  end if;

  res := jsonb_build_object('status', 'ok', 'xp', award, 'xp_raw', xp, 'capped', award < xp,
           'bonus', bonus, 'perfect', perfect, 'streak_before', st.streak,
           'habit', private.habit_state(uid, h.id))
         || private.after_change(uid, p_local_date);
  insert into public.completion_ops(op_id, user_id, result) values (p_op_id, uid, res);
  return res;
end $$;

-- Long-press undo. Only increments logged today (local) can be undone; XP otherwise never decreases.
create or replace function public.undo_completion(p_op_id uuid, p_habit_id uuid, p_local_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); today date; c public.completions; l public.xp_ledger; res jsonb; tz text; pb public.xp_ledger;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select result into res from public.completion_ops where op_id = p_op_id and user_id = uid;
  if res is not null then return res || '{"replayed":true}'::jsonb; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select result into res from public.completion_ops where op_id = p_op_id and user_id = uid;
  if res is not null then return res || '{"replayed":true}'::jsonb; end if;

  today := private.local_today(uid);
  select timezone into tz from public.profiles where id = uid;
  select * into c from public.completions where habit_id = p_habit_id and user_id = uid and local_date = p_local_date for update;
  if c.id is null then
    res := jsonb_build_object('status', 'nothing_to_undo', 'habit', private.habit_state(uid, p_habit_id));
    insert into public.completion_ops(op_id, user_id, result) values (p_op_id, uid, res);
    return res;
  end if;
  select * into l from public.xp_ledger x
   where x.ref_id = c.id and x.reason = 'habit' and (x.created_at at time zone tz)::date = today
     and not exists (select 1 from public.xp_ledger u where u.reason = 'undo' and u.ref_id = x.id)
   order by x.created_at desc limit 1;
  if l.id is null then raise exception 'undo_expired' using errcode = 'P0001'; end if;

  insert into public.xp_ledger(user_id, amount, reason, ref_id, local_date)
  values (uid, -l.amount, 'undo', l.id, p_local_date);
  if c.count <= 1 then
    delete from public.completions where id = c.id;
  else
    update public.completions set count = count - 1, xp_awarded = xp_awarded - l.amount, updated_at = now() where id = c.id;
  end if;

  if not private.is_perfect_day(uid, p_local_date) and private.perfect_bonus_net(uid, p_local_date) > 0 then
    select * into pb from public.xp_ledger x
     where x.user_id = uid and x.local_date = p_local_date and x.reason = 'perfect_day' and x.amount > 0
       and (x.created_at at time zone tz)::date = today
       and not exists (select 1 from public.xp_ledger u where u.reason = 'undo' and u.ref_id = x.id)
     limit 1;
    if pb.id is not null then
      insert into public.xp_ledger(user_id, amount, reason, ref_id, local_date)
      values (uid, -pb.amount, 'undo', pb.id, p_local_date);
    end if;
  end if;

  res := jsonb_build_object('status', 'ok', 'xp', -l.amount, 'habit', private.habit_state(uid, p_habit_id))
         || private.after_change(uid, p_local_date);
  insert into public.completion_ops(op_id, user_id, result) values (p_op_id, uid, res);
  return res;
end $$;

-- ---------------------------------------------------------------- reads
create or replace function public.get_today() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date; snap public.ovr_snapshots; prev public.ovr_snapshots; lv record;
  p public.profiles; habits jsonb; quit jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  today := private.local_today(uid);
  select * into p from public.profiles where id = uid;
  if p.id is null then raise exception 'no_profile'; end if;
  perform private.award_quit_days(uid, today - 1);
  snap := private.write_snapshot(uid, today);
  select * into prev from public.ovr_snapshots where user_id = uid and local_date < today order by local_date desc limit 1;
  lv := private.level_for(snap.xp_total);
  select coalesce(jsonb_agg(private.habit_state(uid, h.id) order by h.sort_order, h.created_at), '[]'::jsonb)
    into habits from public.habits h where h.user_id = uid and h.archived_at is null;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb) into quit
    from public.quit_trackers q where q.user_id = uid and q.archived_at is null;
  return jsonb_build_object(
    'today', today, 'now', private.app_now(),
    'profile', to_jsonb(p),
    'settings', (select to_jsonb(s) from public.profile_settings s where s.user_id = uid),
    'snapshot', to_jsonb(snap), 'prev_snapshot', to_jsonb(prev),
    'level', jsonb_build_object('level', lv.level, 'into', lv.into_level, 'needed', lv.needed, 'xp_total', snap.xp_total),
    'xp_today', private.day_xp(uid, today), 'xp_cap', private.cfg('daily_xp_cap')::int,
    'perfect_today', private.is_perfect_day(uid, today),
    'habits', habits, 'quit', quit,
    'journal_today', (select to_jsonb(j) from public.journal_entries j where j.user_id = uid and j.local_date = today),
    'reactions_today', (select coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'from', pr.display_name)), '[]'::jsonb)
                          from public.reactions r join public.profiles pr on pr.id = r.from_user
                         where r.to_user = uid and r.local_date >= today - 1),
    'badges', (select coalesce(jsonb_agg(b.badge_key), '[]'::jsonb) from public.user_badges b where b.user_id = uid));
end $$;

create or replace function public.get_stats() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date; heat jsonb; per_habit jsonb; hist jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  today := private.local_today(uid);
  select coalesce(jsonb_agg(jsonb_build_object('d', local_date, 'o', overall) order by local_date), '[]'::jsonb)
    into hist from public.ovr_snapshots where user_id = uid;
  -- heatmap: share of scheduled (daily/weekday) habits fully done, last 182 days
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 'done', done, 'sched', sched) order by d), '[]'::jsonb) into heat
  from (
    select g::date as d,
      count(*) filter (where private.sched_type(h.schedule) = 'times_per_week' and c.count >= private.target(h.schedule))
        + count(*) filter (where private.sched_type(h.schedule) <> 'times_per_week' and c.count >= private.target(h.schedule)
                             and private.is_sched_day(h.schedule, g::date)) as done,
      count(*) filter (where private.sched_type(h.schedule) <> 'times_per_week' and private.is_sched_day(h.schedule, g::date))
        + count(*) filter (where private.sched_type(h.schedule) = 'times_per_week' and c.count >= private.target(h.schedule)) as sched
    from generate_series(today - 181, today, interval '1 day') g
    join public.habits h on h.user_id = uid and h.archived_at is null and h.start_date <= g::date
    left join public.completions c on c.habit_id = h.id and c.local_date = g::date
    group by g
  ) t;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'title', h.title, 'emoji', h.emoji, 'attribute', h.attribute,
      'streak', (private.habit_streak(h.id, today, today)).streak,
      'shields', (private.habit_streak(h.id, today, today)).shields,
      'best', (private.habit_streak(h.id, today, today)).best,
      'rate28', case when private.sched_type(h.schedule) = 'times_per_week' then
          (select least(1, count(*)::numeric / greatest(1, least(private.per_week(h.schedule) * 4, ceil(private.per_week(h.schedule) * least(28, today - h.start_date + 1) / 7.0))))
             from public.completions c where c.habit_id = h.id and c.local_date > today - 28 and c.count >= private.target(h.schedule))
        else (select case when count(*) > 0 then avg(least(coalesce(c.count, 0)::numeric / private.target(h.schedule), 1)) end
            from generate_series(greatest(today - 27, h.start_date), today, interval '1 day') g
            left join public.completions c on c.habit_id = h.id and c.local_date = g::date
           where private.is_sched_day(h.schedule, g::date)
             and not (g::date = today and coalesce(c.count, 0) < private.target(h.schedule))) end,
      'total', (select count(*) from public.completions c where c.habit_id = h.id and c.count >= private.target(h.schedule))
    ) order by h.sort_order, h.created_at), '[]'::jsonb)
    into per_habit from public.habits h where h.user_id = uid and h.archived_at is null;
  return jsonb_build_object('today', today, 'history', hist, 'heatmap', heat, 'habits', per_habit,
    'level', (select to_jsonb(private.level_for(coalesce(sum(amount), 0)::int)) from public.xp_ledger where user_id = uid),
    'xp_total', (select coalesce(sum(amount), 0) from public.xp_ledger where user_id = uid),
    'weeks', (select coalesce(jsonb_agg(to_jsonb(w) order by w.iso_week), '[]'::jsonb) from public.weekly_scores w where w.user_id = uid));
end $$;

-- ---------------------------------------------------------------- league
create or replace function private.league_today() returns date
language sql stable security definer set search_path = '' as $$
  select (private.app_now() at time zone private.cfg('league_timezone'))::date
$$;

create or replace function private.board(p_ws date) returns table(
  user_id uuid, handle text, display_name text, avatar_seed text, overall int, level int, xp_total int,
  completion_rate double precision, xp_week int, weekly_pos int, alltime_pos int)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (s.user_id) s.user_id, s.overall, s.level, s.xp_total
      from public.ovr_snapshots s order by s.user_id, s.local_date desc),
  base as (
    select p.id, p.handle::text, p.display_name, p.avatar_seed,
           coalesce(l.overall, p.baseline_ovr)::int as overall, coalesce(l.level, 1) as level,
           coalesce(l.xp_total, 0) as xp_total,
           coalesce(w.completion_rate, 0) as rate, coalesce(w.xp_week, 0) as xpw
      from public.profiles p
      left join latest l on l.user_id = p.id
      left join public.weekly_scores w on w.user_id = p.id and w.iso_week = private.iso_week(p_ws)
     where p.onboarded)
  select id, handle, display_name, avatar_seed, overall, level, xp_total, rate, xpw,
         (rank() over (order by rate desc, xpw desc))::int,
         (rank() over (order by overall desc, xp_total desc))::int
    from base
$$;

create or replace function private.record_positions() returns void
language sql security definer set search_path = '' as $$
  insert into public.league_positions(local_date, user_id, weekly_pos, alltime_pos)
  select private.league_today(), b.user_id, b.weekly_pos, b.alltime_pos
    from private.board(private.week_start(private.league_today())) b
  on conflict (local_date, user_id) do update set weekly_pos = excluded.weekly_pos, alltime_pos = excluded.alltime_pos
$$;

-- League board. Rates are recomputed server-side from completions on every call.
create or replace function public.league_board() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lt date; ws date; p record; rows jsonb;
begin
  if not public.is_member() then raise exception 'not_member'; end if;
  lt := private.league_today(); ws := private.week_start(lt);
  for p in select id from public.profiles where onboarded loop
    perform private.refresh_weekly(p.id, private.week_start(private.local_today(p.id)), private.local_today(p.id));
  end loop;
  perform private.record_positions();
  select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'prev_weekly_pos', (select lp.weekly_pos from public.league_positions lp
                           where lp.user_id = b.user_id and lp.local_date < lt order by lp.local_date desc limit 1),
      'prev_alltime_pos', (select lp.alltime_pos from public.league_positions lp
                           where lp.user_id = b.user_id and lp.local_date < lt order by lp.local_date desc limit 1),
      'is_me', b.user_id = auth.uid(),
      'reactions', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
                      select r.kind, count(*) n from public.reactions r
                       where r.to_user = b.user_id and r.local_date = lt group by r.kind) z),
      'my_reactions', (select coalesce(jsonb_agg(r.kind), '[]'::jsonb) from public.reactions r
                        where r.to_user = b.user_id and r.from_user = auth.uid() and r.local_date = lt)
    ) order by b.weekly_pos, b.display_name), '[]'::jsonb) into rows
    from private.board(ws) b;
  return jsonb_build_object('iso_week', private.iso_week(ws), 'league_today', lt, 'rows', rows,
    'recap', (select to_jsonb(r) from public.weekly_recaps r order by r.iso_week desc limit 1),
    'season', private.season_info(lt));
end $$;

create or replace function public.member_card(p_handle text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; t date;
begin
  if not public.is_member() then raise exception 'not_member'; end if;
  select * into p from public.profiles where handle = p_handle::extensions.citext;
  if p.id is null then return null; end if;
  t := private.local_today(p.id);
  return jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'handle', p.handle, 'display_name', p.display_name,
                                  'avatar_seed', p.avatar_seed, 'start_date', p.start_date),
    'snapshot', (select to_jsonb(s) from public.ovr_snapshots s where s.user_id = p.id order by local_date desc limit 1),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('d', local_date, 'o', overall) order by local_date), '[]'::jsonb)
                  from public.ovr_snapshots where user_id = p.id and local_date > t - 30),
    'week', (select to_jsonb(w) from public.weekly_scores w where w.user_id = p.id and w.iso_week = private.iso_week(private.week_start(t))),
    'habits', (select coalesce(jsonb_agg(jsonb_build_object('title', h.title, 'emoji', h.emoji, 'attribute', h.attribute,
                   'streak', (private.habit_streak(h.id, t, t)).streak,
                   'done_today', exists (select 1 from public.completions c where c.habit_id = h.id and c.local_date = t
                                         and c.count >= private.target(h.schedule)))
                 order by h.sort_order), '[]'::jsonb)
                 from public.habits h where h.user_id = p.id and h.visible_to_league and h.archived_at is null),
    'quit', (select coalesce(jsonb_agg(jsonb_build_object('title', q.title, 'last_reset_at', q.last_reset_at,
                 'best_streak_seconds', q.best_streak_seconds)), '[]'::jsonb)
               from public.quit_trackers q where q.user_id = p.id and q.visible_to_league and q.archived_at is null),
    'badges', (select coalesce(jsonb_agg(b.badge_key order by b.earned_at), '[]'::jsonb) from public.user_badges b where b.user_id = p.id),
    'is_me', p.id = auth.uid());
end $$;

-- ---------------------------------------------------------------- quit + onboarding + settings
create or replace function public.log_relapse(p_tracker uuid, p_trigger text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); q public.quit_trackers; nowt timestamptz := private.app_now();
begin
  select * into q from public.quit_trackers where id = p_tracker and user_id = uid and archived_at is null for update;
  if q.id is null then raise exception 'tracker_not_found' using errcode = 'P0001'; end if;
  insert into public.relapses(tracker_id, user_id, occurred_at, local_date, trigger_tag, note)
  values (q.id, uid, nowt, private.local_today(uid), nullif(trim(p_trigger), ''), nullif(trim(p_note), ''));
  update public.quit_trackers
     set best_streak_seconds = greatest(best_streak_seconds, extract(epoch from nowt - last_reset_at)::bigint),
         last_reset_at = nowt
   where id = q.id;
  -- direct column write bypasses the column grant (security definer), trigger keeps credit_start
  return (select to_jsonb(t) from public.quit_trackers t where t.id = q.id);
end $$;

create or replace function public.complete_onboarding(p_handle text, p_display_name text, p_timezone text,
  p_setup jsonb, p_notify jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ratings jsonb := coalesce(p_setup->'ratings', '{}'::jsonb); avg_r double precision; b int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select avg(value::text::double precision) into avg_r from jsonb_each(ratings);
  b := greatest(45, least(65, round((45 + (coalesce(avg_r, 5.5) - 1) / 9.0 * 20)::numeric)))::int;
  update public.profiles set handle = p_handle, display_name = p_display_name,
         timezone = coalesce(nullif(p_timezone, ''), timezone), baseline_ovr = b, onboarded = true,
         start_date = case when onboarded then start_date else private.local_today(uid) end
   where id = uid;
  update public.profile_settings set setup = coalesce(p_setup, '{}'::jsonb),
         notify = coalesce(p_notify, notify), updated_at = now()
   where user_id = uid;
  perform private.write_snapshot(uid, private.local_today(uid));
  return jsonb_build_object('baseline', b);
exception when unique_violation then
  raise exception 'handle_taken' using errcode = 'P0001';
end $$;

create or replace function public.export_my_data() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'settings', (select to_jsonb(s) from public.profile_settings s where s.user_id = auth.uid()),
    'habits', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.habits x where x.user_id = auth.uid()),
    'completions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.completions x where x.user_id = auth.uid()),
    'xp_ledger', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.xp_ledger x where x.user_id = auth.uid()),
    'ovr_snapshots', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.ovr_snapshots x where x.user_id = auth.uid()),
    'quit_trackers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.quit_trackers x where x.user_id = auth.uid()),
    'relapses', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.relapses x where x.user_id = auth.uid()),
    'journal_entries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.journal_entries x where x.user_id = auth.uid()),
    'weekly_scores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.weekly_scores x where x.user_id = auth.uid()),
    'reactions_sent', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.reactions x where x.from_user = auth.uid()),
    'badges', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.user_badges x where x.user_id = auth.uid()))
$$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();   -- cascades through profiles to every table
end $$;

-- ---------------------------------------------------------------- seasons (phase 5)
create or replace function private.season_info(p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare epoch date := private.cfg('season_epoch')::date; no int; s date; e date;
begin
  if p_date < epoch then return null; end if;
  no := floor((p_date - epoch) / 42.0)::int + 1;
  s := epoch + (no - 1) * 42; e := s + 41;
  return jsonb_build_object('season_no', no, 'start', s, 'end', e,
    'week', floor((p_date - s) / 7.0)::int + 1,
    'standings', (select coalesce(jsonb_agg(z order by z.avg_rate desc, z.xp desc), '[]'::jsonb) from (
        select p.id as user_id, p.display_name, p.handle, avg(coalesce(w.completion_rate, 0)) as avg_rate,
               sum(coalesce(w.xp_week, 0)) as xp
          from public.profiles p
          cross join generate_series(s, least(e, p_date), interval '7 days') wk
          left join public.weekly_scores w on w.user_id = p.id and w.iso_week = private.iso_week(wk::date)
         where p.onboarded and private.week_start(p.start_date) <= wk::date
         group by p.id) z),
    'champions', (select coalesce(jsonb_agg(jsonb_build_object('season_no', c.season_no, 'display_name', pr.display_name,
                    'handle', pr.handle, 'avg_rate', c.avg_rate) order by c.season_no desc), '[]'::jsonb)
                    from public.season_champions c left join public.profiles pr on pr.id = c.user_id));
end $$;

create or replace function private.decide_seasons() returns void
language plpgsql security definer set search_path = '' as $$
declare lt date := private.league_today(); epoch date := private.cfg('season_epoch')::date; no int; s date; win record;
begin
  if lt < epoch + 42 then return; end if;
  no := floor((lt - epoch) / 42.0)::int;     -- last completed season
  loop
    exit when no < 1 or exists (select 1 from public.season_champions where season_no = no);
    s := epoch + (no - 1) * 42;
    select p.id, avg(coalesce(w.completion_rate, 0)) as r, sum(coalesce(w.xp_week, 0)) as x into win
      from public.profiles p
      cross join generate_series(s, s + 35, interval '7 days') wk
      left join public.weekly_scores w on w.user_id = p.id and w.iso_week = private.iso_week(wk::date)
     where p.onboarded and private.week_start(p.start_date) <= wk::date
     group by p.id order by 2 desc, 3 desc limit 1;
    insert into public.season_champions(season_no, user_id, avg_rate) values (no, win.id, coalesce(win.r, 0));
    if win.id is not null then perform private.grant_badge(win.id, 'champion_s' || no); end if;
    no := no - 1;
  end loop;
end $$;

-- ---------------------------------------------------------------- duos (phase 5)
create or replace function public.duo_invite(p_handle text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); other uuid; wk text := private.iso_week(private.week_start(private.league_today())); d public.duos;
begin
  if not public.is_member() then raise exception 'not_member'; end if;
  select id into other from public.profiles where handle = p_handle::extensions.citext and onboarded;
  if other is null or other = uid then raise exception 'bad_partner' using errcode = 'P0001'; end if;
  if exists (select 1 from public.duos where iso_week = wk and status <> 'declined'
              and (uid in (user_a, user_b) or other in (user_a, user_b))) then
    raise exception 'already_in_duo' using errcode = 'P0001';
  end if;
  insert into public.duos(iso_week, user_a, user_b) values (wk, uid, other) returning * into d;
  return to_jsonb(d);
end $$;

create or replace function public.duo_respond(p_duo uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.duos;
begin
  update public.duos set status = case when p_accept then 'active' else 'declined' end
   where id = p_duo and user_b = auth.uid() and status = 'pending' returning * into d;
  if d.id is null then raise exception 'duo_not_found' using errcode = 'P0001'; end if;
  return to_jsonb(d);
end $$;

create or replace function public.duo_cancel(p_duo uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.duos where id = p_duo and auth.uid() in (user_a, user_b) and status = 'pending'
$$;

create or replace function public.my_duo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); wk text := private.iso_week(private.week_start(private.league_today())); d public.duos;
  ra double precision; rb double precision;
begin
  select * into d from public.duos where iso_week = wk and status <> 'declined' and uid in (user_a, user_b)
   order by created_at desc limit 1;
  if d.id is null then return null; end if;
  select completion_rate into ra from public.weekly_scores where user_id = d.user_a and iso_week = wk;
  select completion_rate into rb from public.weekly_scores where user_id = d.user_b and iso_week = wk;
  return to_jsonb(d) || jsonb_build_object(
    'a', (select jsonb_build_object('display_name', display_name, 'handle', handle, 'avatar_seed', avatar_seed, 'rate', coalesce(ra, 0)) from public.profiles where id = d.user_a),
    'b', (select jsonb_build_object('display_name', display_name, 'handle', handle, 'avatar_seed', avatar_seed, 'rate', coalesce(rb, 0)) from public.profiles where id = d.user_b),
    'combined', (coalesce(ra, 0) + coalesce(rb, 0)) / 2,
    'i_am_invitee', d.user_b = uid);
end $$;

create or replace function private.settle_duos(p_week text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.duos; ra double precision; rb double precision;
begin
  for d in select * from public.duos where iso_week = p_week and status = 'active' loop
    select coalesce(completion_rate, 0) into ra from public.weekly_scores where user_id = d.user_a and iso_week = p_week;
    select coalesce(completion_rate, 0) into rb from public.weekly_scores where user_id = d.user_b and iso_week = p_week;
    if (coalesce(ra, 0) + coalesce(rb, 0)) / 2 >= 0.8 then
      perform private.grant_badge(d.user_a, 'dynamic_duo');
      perform private.grant_badge(d.user_b, 'dynamic_duo');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- jobs (pg_cron, every 15 min)
create or replace function public.run_daily_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p record; today date; last date; d date; n int := 0; lt date := private.league_today(); ws date; lastweek text;
begin
  for p in select id, start_date from public.profiles where onboarded loop
    today := private.local_today(p.id);
    select max(local_date) into last from public.ovr_snapshots where user_id = p.id and local_date < today;
    d := greatest(coalesce(last + 1, p.start_date), today - 35, p.start_date);
    while d <= today loop
      perform private.award_quit_days(p.id, d - 1);
      perform private.write_snapshot(p.id, d);
      d := d + 1;
    end loop;
    perform private.refresh_weekly(p.id, private.week_start(today), today);
    if extract(isodow from today) = 1 then
      perform private.refresh_weekly(p.id, private.week_start(today - 1), today);
    end if;
    if array_length(private.check_badges(p.id), 1) > 0 then perform private.write_snapshot(p.id, today); end if;
    n := n + 1;
  end loop;

  perform private.record_positions();
  ws := private.week_start(lt);

  -- Sunday-night recap (league timezone, from 19:00)
  if extract(isodow from lt) = 7
     and extract(hour from private.app_now() at time zone private.cfg('league_timezone')) >= 19
     and not exists (select 1 from public.weekly_recaps where iso_week = private.iso_week(ws)) then
    insert into public.weekly_recaps(iso_week, standings)
    select private.iso_week(ws), coalesce(jsonb_agg(jsonb_build_object('user_id', b.user_id, 'display_name', b.display_name,
             'handle', b.handle, 'pos', b.weekly_pos, 'rate', b.completion_rate, 'xp_week', b.xp_week, 'overall', b.overall)
             order by b.weekly_pos), '[]'::jsonb)
      from private.board(ws) b;
    perform private.grant_badge(b.user_id, 'week_winner') from private.board(ws) b
     where b.weekly_pos = 1 and b.completion_rate > 0;
  end if;

  -- Monday: settle last week's duos, decide finished seasons
  if extract(isodow from lt) = 1 then
    lastweek := private.iso_week(ws - 7);
    perform private.settle_duos(lastweek);
  end if;
  perform private.decide_seasons();
  return jsonb_build_object('users', n, 'league_today', lt);
end $$;

-- ---------------------------------------------------------------- push queue
-- Called by /api/push/dispatch with the service role. Marks notifications as
-- sent (dedupe + max 2/day) and returns what to send.
create or replace function public.claim_due_notifications() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p record; s public.profile_settings; t timestamptz := private.app_now(); local_ts timestamp; today date; tm time;
  v_out jsonb := '[]'::jsonb; sent int; remaining int; scheduled int; recap public.weekly_recaps; me jsonb; ahead jsonb;
  mt time; et time; payload jsonb; ins int;
begin
  for p in select pr.id, pr.timezone, pr.display_name from public.profiles pr
            where pr.onboarded and exists (select 1 from public.push_subscriptions ps where ps.user_id = pr.id)
  loop
    select * into s from public.profile_settings where user_id = p.id;
    local_ts := t at time zone p.timezone; today := local_ts::date; tm := local_ts::time;
    select count(*) into sent from public.notification_log where user_id = p.id and local_date = today and kind <> 'test';
    continue when sent >= 2;
    payload := null;

    select count(*) filter (where private.is_sched_day(h.schedule, today) and private.sched_type(h.schedule) <> 'times_per_week'),
           count(*) filter (where private.is_sched_day(h.schedule, today) and private.sched_type(h.schedule) <> 'times_per_week'
                              and coalesce(c.count, 0) < private.target(h.schedule))
      into scheduled, remaining
      from public.habits h left join public.completions c on c.habit_id = h.id and c.local_date = today
     where h.user_id = p.id and h.archived_at is null and h.start_date <= today;

    mt := coalesce((s.notify->>'morning')::time, '07:30'); et := coalesce((s.notify->>'evening')::time, '20:30');

    if extract(isodow from today) = 7 and coalesce((s.notify->>'recap_on')::boolean, true) and tm >= '19:00' then
      select * into recap from public.weekly_recaps where iso_week = private.iso_week(private.week_start(today));
      if recap.iso_week is not null then
        select e into me from jsonb_array_elements(recap.standings) e where e->>'user_id' = p.id::text;
        select e into ahead from jsonb_array_elements(recap.standings) e where (e->>'pos')::int = (me->>'pos')::int - 1 limit 1;
        payload := jsonb_build_object('kind', 'recap', 'pos', me->>'pos', 'week', right(recap.iso_week, 2),
          'ahead_name', ahead->>'display_name',
          'ahead_by', case when ahead is null then null else round((((ahead->>'rate')::numeric - (me->>'rate')::numeric) * 100))::int end);
      end if;
    end if;
    if payload is null and coalesce((s.notify->>'evening_on')::boolean, true) and tm >= et and tm - et < interval '2 hours'
       and remaining > 0 then
      payload := jsonb_build_object('kind', 'evening', 'remaining', remaining);
    end if;
    if payload is null and coalesce((s.notify->>'morning_on')::boolean, true) and tm >= mt and tm - mt < interval '2 hours'
       and scheduled > 0 then
      payload := jsonb_build_object('kind', 'morning', 'scheduled', scheduled);
    end if;
    continue when payload is null;

    insert into public.notification_log(user_id, kind, local_date) values (p.id, payload->>'kind', today)
    on conflict do nothing;
    get diagnostics ins = row_count;
    continue when ins = 0;
    v_out := v_out || jsonb_build_array(payload || jsonb_build_object('user_id', p.id,
      'subscriptions', (select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'keys', ps.keys))
                          from public.push_subscriptions ps where ps.user_id = p.id)));
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema public from public, anon;
grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.log_completion(uuid, uuid, date) to authenticated;
grant execute on function public.undo_completion(uuid, uuid, date) to authenticated;
grant execute on function public.get_today() to authenticated;
grant execute on function public.get_stats() to authenticated;
grant execute on function public.league_board() to authenticated;
grant execute on function public.member_card(text) to authenticated;
grant execute on function public.log_relapse(uuid, text, text) to authenticated;
grant execute on function public.complete_onboarding(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.duo_invite(text) to authenticated;
grant execute on function public.duo_respond(uuid, boolean) to authenticated;
grant execute on function public.duo_cancel(uuid) to authenticated;
grant execute on function public.my_duo() to authenticated;
revoke execute on function public.run_daily_jobs() from authenticated;
revoke execute on function public.claim_due_notifications() from authenticated;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated;
grant execute on function public.run_daily_jobs() to service_role;
grant execute on function public.claim_due_notifications() to service_role;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.invite_codes to supabase_auth_admin;
