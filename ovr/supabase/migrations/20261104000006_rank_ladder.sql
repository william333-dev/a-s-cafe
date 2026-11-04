-- Rank ladder (2026-11-04): 9 tiers with divisions I–III (Apex is a single top rank).
-- Thresholds live in lib/rating-engine (TIERS). "First Apex" now means OVR 95.

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
  if snap.overall >= 95 and private.grant_badge(p_user, 'apex') then got := array_append(got, 'apex'); end if;
  if exists (select 1 from public.quit_trackers where user_id = p_user and archived_at is null
              and private.app_now() - last_reset_at >= interval '30 days') then
    if private.grant_badge(p_user, 'clean_30') then got := array_append(got, 'clean_30'); end if;
  end if;
  if (select count(distinct attribute) from public.habits where user_id = p_user and archived_at is null) = 6 then
    if private.grant_badge(p_user, 'full_house') then got := array_append(got, 'full_house'); end if;
  end if;
  return got;
end $$;

-- Everyone's best-ever OVR (league-visible data already) for the ladder's "% reached".
create or replace function public.rank_ladder() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bests', coalesce((
      select jsonb_agg(b order by b desc) from (
        select max(s.overall)::int as b
          from public.ovr_snapshots s join public.profiles p on p.id = s.user_id
         where p.onboarded group by s.user_id) z), '[]'::jsonb),
    'my_best', (select max(overall) from public.ovr_snapshots where user_id = auth.uid()),
    'my_current', (select overall from public.ovr_snapshots where user_id = auth.uid() order by local_date desc limit 1))
  where public.is_member()
$$;
revoke execute on function public.rank_ladder() from public, anon;
grant execute on function public.rank_ladder() to authenticated;
