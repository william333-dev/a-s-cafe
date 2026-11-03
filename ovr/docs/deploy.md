# Deploying OVR (free tiers: Supabase + Vercel)

About 30 minutes, once. You need: a GitHub repo with this code, a Supabase account, and a Vercel account.

## 0. Put the code in its own repo (recommended)

The app was built in `ovr/` inside `a-s-cafe`. To give it its own repo with full history:

```bash
git subtree split --prefix ovr -b ovr-only
git push git@github.com:<you>/ovr.git ovr-only:main
```

## 1. Supabase project

1. Go to supabase.com and create a **New project** in region **Sydney (ap-southeast-2)**. Save the DB password.
2. Link the project and push the schema from your machine:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push          # applies supabase/migrations/*
   ```
3. Under **Authentication → Sign In / Providers → Email**, make sure Email is enabled. "Confirm email" can stay on, because OTP verification confirms it.
4. **Authentication → Emails → Templates.** In **both** "Magic Link" **and** "Confirm signup", put the code in the body:
   ```html
   <h2>Time to lock in.</h2><p>Your OVR code:</p>
   <p style="font-size:32px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   ```
   Without `{{ .Token }}` people get a link and no code.
5. **Authentication → Hooks → Before User Created**: choose Postgres function `public.hook_before_user_created`. This gives the friendly "invite code invalid" error. The DB trigger blocks signups without a code either way.
6. **Authentication → URL Configuration**: set Site URL to `https://<your-app>.vercel.app`.
7. Email sending: the built-in Supabase SMTP is rate-limited to a few emails an hour. For 30 friends signing up on the same night, add a free SMTP provider (for example Resend's free tier, 3k/month) under **Authentication → Emails → SMTP Settings**.
8. Create the first invite code in the SQL editor:
   ```sql
   insert into public.invite_codes(code, uses_left) values ('LOCKIN', 30);
   ```
   After that, members create single-use codes in Profile → "Invite a mate".

## 2. Vercel

1. **Add New → Project**, import the repo. If you didn't split it out, set **Root Directory** to `ovr`.
2. Add these Environment Variables (Production + Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role/secret key (server-only) |
   | `CRON_SECRET` | any long random string |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `npx web-push generate-vapid-keys` |
   | `VAPID_PRIVATE_KEY` | from the same command |
   | `VAPID_SUBJECT` | `mailto:you@example.com` |

3. Deploy. Every branch gets a preview URL automatically.

## 3. Turn on the scheduler and push

In the Supabase SQL editor (use your real URL and the same `CRON_SECRET`):

```sql
insert into private.app_config(key, value) values
  ('app_url', 'https://<your-app>.vercel.app'),
  ('cron_secret', '<CRON_SECRET>')
on conflict (key) do update set value = excluded.value;
```

pg_cron already runs `ovr-every-15-min`. It rolls days over (snapshots, quit-day XP, weekly scores, Sunday recap, badges, seasons) and calls `/api/push/dispatch`. To check it:

```sql
select * from cron.job_run_details order by start_time desc limit 5;
select * from net._http_response order by created desc limit 5;
```

## 4. iPhone check

1. Open the Vercel URL in Safari, tap **Share → Add to Home Screen**, then open OVR from the Home Screen.
2. Sign up with `LOCKIN`, finish the quiz, and turn on notifications (iOS 16.4+ only, from the installed app).
3. Settings → **Send a test** should make a notification appear.

## Free-tier watch list

- **Supabase free:** 500 MB DB (you'll use well under 50 MB) and 50k MAU. Projects **pause after 7 days with no activity**, but the 15-minute cron keeps it busy, so that shouldn't happen. Daily backups aren't included on free; use Settings → "Export my data" or `supabase db dump` now and then.
- **Vercel Hobby:** this setup stays well within it. About 96 dispatch calls a day plus normal traffic. Hobby is for non-commercial use, which this is.
- **Auth emails:** the built-in SMTP limit is the first thing you'll hit. See step 1.7.
