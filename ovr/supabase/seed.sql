-- Local dev seed: an invite code (only used if private.app_config.require_invite is switched on)
insert into public.invite_codes(code, uses_left) values ('LOCKIN', 100) on conflict do nothing;
