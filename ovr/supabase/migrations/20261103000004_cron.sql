-- Scheduled jobs: every 15 minutes, roll days over (snapshots, quit-day XP,
-- weekly scores, recaps, badges, seasons) and ping the push dispatcher.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- To enable push in production set these two rows (see docs/deploy.md):
--   insert into private.app_config values ('app_url','https://<your-app>.vercel.app');
--   insert into private.app_config values ('cron_secret','<same as CRON_SECRET env var>');
create or replace function private.ping_push_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare u text := private.cfg('app_url'); k text := private.cfg('cron_secret');
begin
  if u is null or k is null then return; end if;
  perform net.http_post(
    url := u || '/api/push/dispatch',
    headers := jsonb_build_object('authorization', 'Bearer ' || k, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000);
end $$;

select cron.schedule('ovr-every-15-min', '*/15 * * * *',
  $$ select public.run_daily_jobs(); select private.ping_push_dispatch(); $$);
