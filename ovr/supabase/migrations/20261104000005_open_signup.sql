-- Plain email + password sign-up (Will, 2026-11-04): no invite code required.
-- The invite gate stays in place behind a switch. To turn it back on:
--   update private.app_config set value = 'true' where key = 'require_invite';

insert into private.app_config(key, value) values ('require_invite', 'false')
on conflict (key) do nothing;

create or replace function private.invites_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from private.app_config where key = 'require_invite'), 'false') = 'true'
$$;

create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(trim(coalesce(event->'user'->'user_metadata'->>'invite_code', '')));
begin
  if not private.invites_required() then
    return '{}'::jsonb;
  end if;
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

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_name text := split_part(coalesce(new.email, 'player'), '@', 1);
begin
  if v_code <> '' then
    update public.invite_codes set uses_left = uses_left - 1
     where code = v_code and uses_left > 0 and (expires_at is null or expires_at > now());
  end if;
  if private.invites_required() and (v_code = '' or not found) then
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
