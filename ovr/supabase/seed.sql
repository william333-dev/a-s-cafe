-- Local dev seed: an invite code so you can sign up at http://localhost:3000
insert into public.invite_codes(code, uses_left) values ('LOCKIN', 100) on conflict do nothing;
