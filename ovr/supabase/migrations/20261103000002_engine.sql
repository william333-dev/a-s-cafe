-- OVR engine: the authoritative XP / streak / OVR math.
-- Mirrors lib/rating-engine (TypeScript reference). Parity is enforced by
-- tests/db/parity.test.ts — change both or neither. See docs/rating-formula.md.

-- ---------------------------------------------------------------- small helpers
create or replace function private.attr_idx(a public.attribute) returns int
language sql immutable as $$ select array_position(enum_range(null::public.attribute), a) $$;

create or replace function private.base_xp(d public.difficulty, custom int) returns int
language sql immutable as $$
  select case d when 'minor' then 10 when 'standard' then 20 when 'major' then 35 else coalesce(custom, 20) end
$$;

create or replace function private.sched_type(s jsonb) returns text
language sql immutable as $$ select coalesce(s->>'type', 'daily') $$;

create or replace function private.target(s jsonb) returns int
language sql immutable as $$ select greatest(1, coalesce((s->>'target_per_day')::int, 1)) $$;

-- days use ISO weekday numbers: 1 = Monday … 7 = Sunday
create or replace function private.is_sched_day(s jsonb, d date) returns boolean
language sql immutable as $$
  select case private.sched_type(s)
    when 'daily' then true
    when 'weekdays' then coalesce(s->'days', '[]'::jsonb) @> to_jsonb(extract(isodow from d)::int)
    else false end
$$;

create or replace function private.per_week(s jsonb) returns int
language sql immutable as $$
  select case private.sched_type(s)
    when 'daily' then 7
    when 'weekdays' then jsonb_array_length(coalesce(s->'days', '[]'::jsonb))
    else coalesce((s->>'times_per_week')::int, 1) end
$$;

create or replace function private.week_start(d date) returns date
language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;

create or replace function private.iso_week(d date) returns text
language sql immutable as $$ select to_char(d, 'IYYY-"W"IW') $$;

-- prorated weekly quota for a times-per-week habit in a week that is cut short
-- (habit started mid-week, or the week straddles the 28-day window start)
create or replace function private.n_eff(n int, avail int) returns int
language sql immutable as $$ select least(n, ceil(n * avail / 7.0)::int) $$;

create or replace function private.level_need(l int) returns int
language sql immutable as $$ select round(50 * power(l::numeric, 1.6))::int $$;

create or replace function private.level_for(p_xp int, out level int, out into_level int, out needed int)
language plpgsql immutable as $$
declare rest int := greatest(p_xp, 0);
begin
  level := 1;
  loop
    needed := private.level_need(level + 1);
    exit when rest < needed;
    rest := rest - needed;
    level := level + 1;
  end loop;
  into_level := rest;
end $$;

create or replace function private.streak_mult(streak int) returns double precision
language sql immutable as $$ select 1 + least(greatest(streak, 0), 30) * 0.01 $$;

-- XP for the i-th increment of a multi-count habit; increments sum exactly to
-- round(base * mult) once the daily target is reached.
create or replace function private.increment_xp(base int, streak int, count_after int, tgt int) returns int
language sql immutable as $$
  select (round((base * private.streak_mult(streak) * count_after / tgt::double precision)::numeric)
        - round((base * private.streak_mult(streak) * (count_after - 1) / tgt::double precision)::numeric))::int
$$;

create or replace function private.day_xp(p_user uuid, p_date date) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0)::int from public.xp_ledger
   where user_id = p_user and local_date = p_date and reason <> 'badge'
$$;

create or replace function private.cap_award(p_user uuid, p_date date, p_raw int) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(0, least(p_raw, private.cfg('daily_xp_cap')::int - private.day_xp(p_user, p_date)))
$$;

-- ---------------------------------------------------------------- streaks
-- Streak of scheduled days done up to p_through. Days before p_today are final
-- (a miss burns a shield or resets); p_today itself is pending until done.
-- Shields: +1 per 7 streak days, max 2.
create or replace function private.habit_streak(p_habit uuid, p_through date, p_today date,
  out streak int, out shields int, out shields_used int, out last_shield_date date, out best int)
language plpgsql stable security definer set search_path = '' as $$
declare
  h public.habits; tgt int; n int; r record; ws date; we date; lo date; ne int; done_cnt int;
begin
  streak := 0; shields := 0; shields_used := 0; best := 0;
  select * into h from public.habits where id = p_habit;
  if h.id is null or p_through < h.start_date then return; end if;
  tgt := private.target(h.schedule);

  if private.sched_type(h.schedule) <> 'times_per_week' then
    for r in
      select g::date as d, coalesce(c.count, 0) as cnt
        from generate_series(h.start_date, p_through, interval '1 day') g
        left join public.completions c on c.habit_id = p_habit and c.local_date = g::date
       order by 1
    loop
      continue when not private.is_sched_day(h.schedule, r.d);
      if r.cnt >= tgt then
        streak := streak + 1; best := greatest(best, streak);
        if streak % 7 = 0 then shields := least(2, shields + 1); end if;
      elsif r.d < p_today then
        if shields > 0 then
          shields := shields - 1; shields_used := shields_used + 1; last_shield_date := r.d;
        else
          streak := 0;
        end if;
      end if;
    end loop;
  else
    n := private.per_week(h.schedule);
    for ws in
      select g::date from generate_series(private.week_start(h.start_date), private.week_start(p_through), interval '7 days') g
    loop
      we := ws + 6;
      lo := greatest(ws, h.start_date);
      ne := private.n_eff(n, we - lo + 1);
      done_cnt := 0;
      for r in
        select c.local_date as d from public.completions c
         where c.habit_id = p_habit and c.local_date between lo and least(we, p_through) and c.count >= tgt
         order by c.local_date
      loop
        done_cnt := done_cnt + 1;
        streak := streak + 1; best := greatest(best, streak);
        if streak % 7 = 0 then shields := least(2, shields + 1); end if;
      end loop;
      if we < p_today and we <= p_through and done_cnt < ne then
        if shields > 0 then
          shields := shields - 1; shields_used := shields_used + 1; last_shield_date := we;
        else
          streak := 0;
        end if;
      end if;
    end loop;
  end if;
end $$;

-- consecutive clean days on a quit tracker ending at p_through (inclusive)
create or replace function private.quit_streak(p_tracker uuid, p_through date) returns int
language plpgsql stable security definer set search_path = '' as $$
declare q public.quit_trackers; d date; s int := 0;
begin
  select * into q from public.quit_trackers where id = p_tracker;
  d := p_through;
  while d >= q.credit_start loop
    exit when exists (select 1 from public.relapses where tracker_id = p_tracker and local_date = d);
    s := s + 1; d := d - 1;
    exit when s >= 400;
  end loop;
  return s;
end $$;

-- ---------------------------------------------------------------- OVR
create or replace function private.compute_ovr(p_user uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  prof public.profiles; setup jsonb;
  num double precision[] := array[0,0,0,0,0,0]; den double precision[] := array[0,0,0,0,0,0];
  wx double precision[] := array[0,0,0,0,0,0];
  done7 double precision[] := array[0,0,0,0,0,0]; sched7 double precision[] := array[0,0,0,0,0,0];
  h public.habits; q public.quit_trackers; r record;
  b int; tgt int; k int; n int; ne int; filled int; hn double precision; hd double precision;
  w double precision; cc double precision; ws date; we date; lo date; win_from date;
  s_k double precision; v_k double precision; ceil_k double precision; a_k double precision;
  active int := 0; sum_wx double precision := 0; acc double precision := 0;
  calc double precision; alpha double precision; raw double precision; base double precision;
  b_k double precision; attrs jsonb := '{}'::jsonb; names text[] := enum_range(null::public.attribute)::text[];
begin
  select * into prof from public.profiles where id = p_user;
  select ps.setup into setup from public.profile_settings ps where ps.user_id = p_user;
  base := prof.baseline_ovr;
  win_from := p_today - 27;

  for h in select * from public.habits
            where user_id = p_user and archived_at is null and start_date <= p_today
  loop
    b := private.base_xp(h.difficulty, h.custom_xp);
    tgt := private.target(h.schedule);
    k := private.attr_idx(h.attribute);
    hn := 0; hd := 0;
    lo := greatest(win_from, h.start_date);
    if private.sched_type(h.schedule) <> 'times_per_week' then
      for r in
        select g::date as d, coalesce(c.count, 0) as cnt
          from generate_series(lo, p_today, interval '1 day') g
          left join public.completions c on c.habit_id = h.id and c.local_date = g::date
      loop
        continue when not private.is_sched_day(h.schedule, r.d);
        continue when r.d = p_today and r.cnt < tgt;
        w := power(0.5::double precision, (p_today - r.d) / 10.0::double precision);
        cc := least(r.cnt::double precision / tgt, 1);
        hn := hn + w * b * cc; hd := hd + w * b;
        if r.d > p_today - 7 then sched7[k] := sched7[k] + 1; done7[k] := done7[k] + cc; end if;
      end loop;
    else
      n := private.per_week(h.schedule);
      for ws in select g::date from generate_series(private.week_start(lo), private.week_start(p_today), interval '7 days') g
      loop
        we := ws + 6;
        ne := private.n_eff(n, we - greatest(ws, lo) + 1);
        filled := 0;
        for r in
          select c.local_date as d, c.count as cnt from public.completions c
           where c.habit_id = h.id and c.local_date between greatest(ws, lo) and least(we, p_today)
             and not (c.local_date = p_today and c.count < tgt)
           order by c.local_date limit ne
        loop
          w := power(0.5::double precision, (p_today - r.d) / 10.0::double precision);
          cc := least(r.cnt::double precision / tgt, 1);
          hn := hn + w * b * cc; hd := hd + w * b; filled := filled + 1;
          if r.d > p_today - 7 then sched7[k] := sched7[k] + 1; done7[k] := done7[k] + cc; end if;
        end loop;
        if we < p_today and ne > filled then
          hd := hd + (ne - filled) * power(0.5::double precision, (p_today - we) / 10.0::double precision) * b;
          if we > p_today - 7 then sched7[k] := sched7[k] + (ne - filled); end if;
        end if;
      end loop;
    end if;
    if hd > 0 then
      num[k] := num[k] + hn; den[k] := den[k] + hd; wx[k] := wx[k] + b * private.per_week(h.schedule);
    end if;
  end loop;

  -- quit trackers feed Discipline as a daily standard (20 XP) habit; today excluded
  k := private.attr_idx('discipline');
  for q in select * from public.quit_trackers
            where user_id = p_user and archived_at is null and credit_start < p_today
  loop
    hn := 0; hd := 0;
    for r in
      select g::date as d,
             exists (select 1 from public.relapses x where x.tracker_id = q.id and x.local_date = g::date) as slipped
        from generate_series(greatest(win_from, q.credit_start), p_today - 1, interval '1 day') g
    loop
      w := power(0.5::double precision, (p_today - r.d) / 10.0::double precision);
      cc := case when r.slipped then 0 else 1 end;
      hn := hn + w * 20 * cc; hd := hd + w * 20;
      if r.d > p_today - 7 then sched7[k] := sched7[k] + 1; done7[k] := done7[k] + cc; end if;
    end loop;
    if hd > 0 then num[k] := num[k] + hn; den[k] := den[k] + hd; wx[k] := wx[k] + 20 * 7; end if;
  end loop;

  alpha := least(greatest((p_today - prof.start_date) / 14.0, 0), 1);

  for k in 1..6 loop
    if den[k] > 0 then
      s_k := num[k] / den[k];
      v_k := least(1, wx[k] / 300.0);
      ceil_k := 70 + 29 * v_k;
      a_k := 40 + (ceil_k - 40) * s_k;
      active := active + 1;
      sum_wx := sum_wx + wx[k];
      acc := acc + a_k * wx[k];
      b_k := coalesce(45 + ((setup->'ratings'->>names[k])::double precision - 1) / 9.0 * 20, base);
      attrs := attrs || jsonb_build_object(names[k], jsonb_build_object(
        's', s_k, 'wx', wx[k], 'a', a_k,
        'display', round(((1 - alpha) * b_k + alpha * a_k)::numeric),
        'done7', done7[k], 'sched7', sched7[k]));
    end if;
  end loop;

  if active = 0 then
    calc := base;
  else
    calc := least(99, greatest(40, acc / sum_wx + least(3, greatest(0, active - 2))));
  end if;
  raw := (1 - alpha) * base + alpha * calc;

  return jsonb_build_object('raw', raw, 'calc', calc, 'alpha', alpha, 'baseline', base,
                            'active', active, 'attrs', attrs);
end $$;

-- Writes (upserts) the snapshot for p_date with the ±3/day cap vs the previous
-- snapshot, plus the top 3 "why it moved" reasons.
create or replace function private.write_snapshot(p_user uuid, p_date date) returns public.ovr_snapshots
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb; prev public.ovr_snapshots; overall int; xp int; lv record; reasons jsonb := '[]'::jsonb;
  names text[] := enum_range(null::public.attribute)::text[]; nm text; cur int; old int; snap public.ovr_snapshots;
  cand jsonb := '[]'::jsonb;
begin
  o := private.compute_ovr(p_user, p_date);
  select * into prev from public.ovr_snapshots
   where user_id = p_user and local_date < p_date order by local_date desc limit 1;
  overall := round((o->>'raw')::numeric);
  if prev.user_id is not null then
    overall := greatest(prev.overall - 3, least(prev.overall + 3, overall));
  end if;
  overall := greatest(40, least(99, overall));

  select coalesce(sum(amount), 0)::int into xp from public.xp_ledger where user_id = p_user and local_date <= p_date;
  lv := private.level_for(xp);

  foreach nm in array names loop
    cur := (o->'attrs'->nm->>'display')::int;
    execute format('select ($1).%I', nm) into old using prev;
    if cur is not null and (old is null or cur <> old) then
      cand := cand || jsonb_build_array(jsonb_build_object(
        'attribute', nm,
        'delta', case when old is null then null else cur - old end,
        'value', cur,
        'done7', round((o->'attrs'->nm->>'done7')::numeric, 1),
        'sched7', (o->'attrs'->nm->>'sched7')::numeric));
    end if;
  end loop;
  select coalesce(jsonb_agg(e order by coalesce(abs((e->>'delta')::int), 99) desc), '[]'::jsonb) into reasons
    from (select e from jsonb_array_elements(cand) e
          order by coalesce(abs((e->>'delta')::int), 99) desc limit 3) t;
  if jsonb_array_length(reasons) = 0 and prev.user_id is not null and overall <> prev.overall
     and (o->>'alpha')::double precision < 1 then
    reasons := jsonb_build_array(jsonb_build_object('attribute', 'calibration', 'delta', overall - prev.overall));
  end if;
  if prev.user_id is not null and overall <> round((o->>'raw')::numeric) then
    reasons := reasons || jsonb_build_array(jsonb_build_object('attribute', 'cap', 'delta', overall - prev.overall));
  end if;

  insert into public.ovr_snapshots as s (user_id, local_date, overall, body, mind, focus, discipline, social, craft,
                                          xp_total, level, ovr_raw, top_reasons, updated_at)
  values (p_user, p_date, overall,
          (o->'attrs'->'body'->>'display')::int, (o->'attrs'->'mind'->>'display')::int,
          (o->'attrs'->'focus'->>'display')::int, (o->'attrs'->'discipline'->>'display')::int,
          (o->'attrs'->'social'->>'display')::int, (o->'attrs'->'craft'->>'display')::int,
          xp, lv.level, (o->>'raw')::double precision, reasons, now())
  on conflict (user_id, local_date) do update set
    overall = excluded.overall, body = excluded.body, mind = excluded.mind, focus = excluded.focus,
    discipline = excluded.discipline, social = excluded.social, craft = excluded.craft,
    xp_total = excluded.xp_total, level = excluded.level, ovr_raw = excluded.ovr_raw,
    top_reasons = excluded.top_reasons, updated_at = now()
  returning * into snap;
  return snap;
end $$;

-- ---------------------------------------------------------------- perfect day / weekly
create or replace function private.is_perfect_day(p_user uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  with sched as (
    select h.id, private.target(h.schedule) as tgt from public.habits h
     where h.user_id = p_user and h.archived_at is null and h.start_date <= p_date
       and private.sched_type(h.schedule) <> 'times_per_week'
       and private.is_sched_day(h.schedule, p_date))
  select count(*) > 0 and bool_and(coalesce(c.count, 0) >= s.tgt)
    from sched s left join public.completions c on c.habit_id = s.id and c.local_date = p_date
$$;

create or replace function private.perfect_bonus_net(p_user uuid, p_date date) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.amount), 0)::int
       + coalesce((select sum(u.amount) from public.xp_ledger u
                    where u.reason = 'undo' and u.ref_id in (
                      select id from public.xp_ledger
                       where user_id = p_user and local_date = p_date and reason = 'perfect_day')), 0)::int
    from public.xp_ledger l where l.user_id = p_user and l.local_date = p_date and l.reason = 'perfect_day'
$$;

create or replace function private.refresh_weekly(p_user uuid, p_ws date, p_today date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.habits; r record; we date := p_ws + 6; tgt int; n int; ne int; lo date; dn int;
  done double precision := 0; sched double precision := 0; xpw int;
begin
  for h in select * from public.habits where user_id = p_user and archived_at is null and start_date <= least(we, p_today)
  loop
    tgt := private.target(h.schedule);
    lo := greatest(p_ws, h.start_date);
    if private.sched_type(h.schedule) <> 'times_per_week' then
      for r in
        select g::date as d, coalesce(c.count, 0) as cnt
          from generate_series(lo, least(we, p_today), interval '1 day') g
          left join public.completions c on c.habit_id = h.id and c.local_date = g::date
      loop
        continue when not private.is_sched_day(h.schedule, r.d);
        continue when r.d = p_today and r.cnt < tgt;
        sched := sched + 1;
        done := done + least(r.cnt::double precision / tgt, 1);
      end loop;
    else
      n := private.per_week(h.schedule);
      ne := private.n_eff(n, we - lo + 1);
      select count(*) into dn from public.completions c
       where c.habit_id = h.id and c.local_date between lo and least(we, p_today) and c.count >= tgt;
      dn := least(dn, ne);
      done := done + dn;
      if we < p_today then
        sched := sched + ne;
      else
        sched := sched + greatest(dn, floor(ne * (p_today - lo) / 7.0));
      end if;
    end if;
  end loop;
  select coalesce(sum(amount), 0)::int into xpw from public.xp_ledger
   where user_id = p_user and local_date between p_ws and we;
  insert into public.weekly_scores as w (user_id, iso_week, completion_rate, xp_week, done, scheduled, updated_at)
  values (p_user, private.iso_week(p_ws), case when sched > 0 then done / sched else 0 end, xpw, done, sched, now())
  on conflict (user_id, iso_week) do update set completion_rate = excluded.completion_rate,
    xp_week = excluded.xp_week, done = excluded.done, scheduled = excluded.scheduled, updated_at = now();
end $$;

-- ---------------------------------------------------------------- quit days
create or replace function private.award_quit_days(p_user uuid, p_date date) returns int
language plpgsql security definer set search_path = '' as $$
declare q public.quit_trackers; amt int; total int := 0; ins int;
begin
  if p_date >= private.local_today(p_user) then return 0; end if;
  for q in select * from public.quit_trackers
            where user_id = p_user and archived_at is null and credit_start <= p_date
  loop
    continue when exists (select 1 from public.relapses where tracker_id = q.id and local_date = p_date);
    continue when exists (select 1 from public.xp_ledger where reason = 'quit_day' and ref_id = q.id and local_date = p_date);
    amt := round((20 * private.streak_mult(private.quit_streak(q.id, p_date - 1)))::numeric)::int;
    amt := private.cap_award(p_user, p_date, amt);
    insert into public.xp_ledger(user_id, amount, reason, ref_id, local_date)
    values (p_user, amt, 'quit_day', q.id, p_date) on conflict do nothing;
    get diagnostics ins = row_count;
    if ins > 0 then total := total + amt; end if;
  end loop;
  return total;
end $$;
