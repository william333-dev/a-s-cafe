# Decisions log

Newest first within each day. Format: **decision** — why. (Will = owner; "go" = approved.)

## 2026-11-04

- **Plain email + password sign-up. No invite code, no emailed code.** Will's call ("I just want normal sign up"). This replaces the email-OTP and invite-code decisions below.
  - The invite gate is kept but **off**: `private.app_config.require_invite = 'false'`. Setting it to `'true'` turns the auth hook and the `auth.users` trigger guard back on (tested both ways in `tests/db/rls.test.ts`).
  - "Confirm email" is off in Supabase, so sign-up logs you straight in.
  - Forgot password sends a reset email to `/reset-password`. It's the only email the app sends.
  - "Invite a mate" now just shares the app link.
  - Tradeoff: anyone with the URL can make an account and appear in the league. The URL is unlisted; flip the switch if it becomes a problem.

## 2026-11-03 — build session (Will said: "make every decision yourself using your recommendations")

### Product / scope

- **Name: OVR.** Will picked it. Logo is an Ember→Apex-red shield with "OVR" in Barlow Condensed (`public/icons/`, made by `scripts/make-icons.mjs`).
- **Auth: email OTP codes, not magic links.** Will's call. Magic links open in Safari, not in the installed Home Screen app, so the session would land in the wrong place on iPhone. The email template must contain `{{ .Token }}`. The local template is in `supabase/templates/otp.html`; the production steps are in `docs/deploy.md`.
- **No Google sign-in.** For about 30 mates, OTP alone is enough. Google would need a Google Cloud OAuth client (more setup and upkeep) and adds nothing in the PWA.
- **All XP and OVR are computed server-side in Postgres functions.** Will's call. Clients can't write `completions`, `xp_ledger`, `ovr_snapshots` or `weekly_scores` (RLS has no write policies on them). Every write goes through security-definer RPCs.
- **There are two engines with a parity test.** `lib/rating-engine` + `lib/xp-engine` (TypeScript) is the readable reference with 100% unit coverage of the math. `supabase/migrations/*_engine.sql` is authoritative. `tests/db/parity.test.ts` replays all 10 golden personas through the real RPCs and checks the result against the TS engine tick by tick. Why: the spec wanted a pure, unit-tested engine *and* Will wanted server-side numbers. Doing both, with a test that fails on any drift, gives both.
- **Quit trackers count as standard habits (20 XP), not major (35).** Will's call. A clean day awards 20 × streak multiplier, and in OVR it feeds Discipline as a daily 20-XP habit.
- **Yesterday's late logs count toward yesterday's 500 XP cap.** Will's call. The cap is enforced per `local_date`.
- **Phase 5 (seasons, badges, duos) was built because Will said "build all phases except the coach".** Each one has a Feature Challenge below with my recommendation. All three are lean: no new screens, they live inside League and Profile.
- **AI coach (Phase 6) was not built,** as instructed.

### Formula details the spec left open (all mirrored in TS and SQL)

- **"Today counts only if done" means fully done** (count ≥ daily target), for both OVR and the weekly completion rate. A half-done multi-count habit doesn't count against you until the day is over.
- **A habit only affects OVR once it has a scheduled day in the window.** A habit added today doesn't drag your OVR down before its first chance. An attribute is "active" only if it has such a habit.
- **Times-per-week habits.** Each ISO week has N slots. Slots are filled by completions in date order. Unfilled slots only count as misses once the week is over (weighted at the Sunday). A week that's cut short (the habit started mid-week, or the week straddles the start of the 28-day window) gets a prorated quota: `ceil(N × days/7)`.
- **Schedule days use ISO numbering:** 1 = Monday … 7 = Sunday.
- **Streak shields are per habit.** A missed scheduled day before today uses a shield (the streak is kept but not incremented). Shields come from the habit's own 7-day multiples, max 2. Times-per-week habits are checked per week.
- **Streak multiplier uses the streak *before* the tap.** The first day is ×1.00. XP for multi-count habits is split per tap so the taps add up exactly to `round(base × mult)`.
- **Perfect day** means every daily or weekday habit scheduled that day is done (times-per-week habits are excluded). It needs at least one such habit. The bonus is only reversed by a same-day undo.
- **Rounding uses Postgres `round(numeric)`** (ties away from zero, after float8→numeric at 15 significant digits). This is mirrored by `pgRound()` in TS. Postgres `round(double)` uses banker's rounding, which caused a parity bug that the tests caught.
- **Displayed attribute values blend the quiz self-rating during calibration:** `(1−α)·B_k + α·A_k`. B_k comes from that attribute's 1–10 rating, mapped to 45–65 (or B if it wasn't rated). Overall OVR follows the spec formula exactly.
- **With no active attributes, OVR_calc = B.** You hold your starting estimate.
- **The ±3/day cap is applied after rounding,** against the latest snapshot before today. The result is then clamped to 40–99.
- **"Why it moved" is stored as data, not text:** `{attribute, delta, done7, sched7}`. Copy turns it into "+2 Focus: 4/4 done this week". There are extra reasons for "calibration" and "cap".
- **Weekly completion rate for times-per-week habits in the current week:** the denominator is `max(done, floor(quota × days elapsed / 7))`, so a 3×/week habit isn't 0% on Monday morning.
- **Badges award +50 XP each** (one-off) and aren't subject to the daily cap.
- **The undo window uses the same clock as the ledger** (`private.app_now()`, which is `now()` in production). Tests set a fake clock in `private.app_config.fake_now`, which only exists in the local DB.

### Privacy / security

- **Owner-only settings moved off `profiles`.** The spec had `setup jsonb` on `profiles`, which the league can read, so goals, self-ratings and notification times would have leaked. They now live in `profile_settings` (owner-only).
- **Column-level grants.** Users can only update `handle, display_name, avatar_seed, timezone` on their profile. They can't change their baseline, start date or onboarding flag. Habits and quit trackers can't change `start_date` or `credit_start` (triggers also force them).
- **Backdated quit trackers get no back-pay.** `started_at` can be backdated so the counter is honest ("clean for 40 days already"), but XP and OVR only count from `credit_start`, which is set to the day the tracker was created.
- **Invite gate in two layers:** the `before_user_created` auth hook gives a friendly 403, and an `auth.users` insert trigger also raises if there's no valid code (in case the hook is ever disabled). Codes members make are single-use, last 14 days, and each member can have at most 3 live.
- **An invite is consumed when the code is requested,** not when it's verified (Supabase creates the user when it sends the OTP). The cost is that a typo'd email burns one use. That's acceptable for a friend group, and members can mint more.
- **Account deletion is a security-definer RPC** (`delete_my_account`) that deletes the `auth.users` row, which cascades everywhere. No service-role key ships to the client.
- **Journal entries and relapses have owner-only RLS,** and are never returned by any league RPC. `member_card` only exposes public habits and trackers. Both are tested in `tests/db/rls.test.ts`.
- **No analytics, trackers or third-party scripts.** The only external fetch is Google Fonts, self-hosted at build time by `next/font`.

### Stack (versions verified on npm on 2026-11-03)

| Package | Version | Note |
|---|---|---|
| next | 16.4.5 | App Router, Turbopack default |
| react / react-dom | 19.3.0 | |
| tailwindcss | 4.3.x | CSS-first `@theme` tokens in `app/globals.css` |
| motion | 14.9.0 | Framer Motion's current package name (`motion/react`) |
| recharts | 3.10.1 | radar + history chart |
| @supabase/supabase-js | 2.118.0 | browser client, session in localStorage |
| swr | 2.5.x | data cache, persisted to localStorage for offline |
| web-push | 3.6.7 | VAPID sender in a route handler |
| supabase CLI | 3.0.0 | local stack (Postgres 17) |
| vitest | 5.1.0 | unit + DB integration |
| @playwright/test | 1.63.0 | matches the pre-installed Chromium |

- **Hand-written service worker (`public/sw.js`), not Serwist.** `@serwist/next` is built around webpack, and Next 16 builds with Turbopack by default. Next's own PWA guide uses a hand-written worker. Ours is about 100 lines: network-first navigations with a cache fallback, cache-first for hashed static assets, and push and notification-click handling. Fewer moving parts for one maintainer.
- **No `@supabase/ssr` and no server-rendered data.** Screens are client components that read through RLS. SWR caches the data and persists it to localStorage, so every screen renders instantly from the last sync, including offline. Server code is only the two push route handlers.
- **`cacheComponents` / `partialPrefetching` are off.** They're the create-next-app defaults, but with client-side data they add Suspense constraints for no benefit.
- **No shadcn/ui.** About 10 small primitives (`components/ui/primitives.tsx`) were less code than restyling shadcn to the design system.
- **Offline queue is plain IndexedDB** (about 80 lines, `lib/offline-queue.ts`), with no library. Each tap gets a UUID `op_id`, and the server stores results in `completion_ops`, so replays are idempotent. A per-user advisory lock serialises concurrent replays. Ops the server rejects for good (`date_out_of_range`, etc.) are dropped with a toast. Network failures stay queued.
- **Push scheduling:** pg_cron runs every 15 minutes, calls `run_daily_jobs()`, then uses `pg_net` to POST to `/api/push/dispatch` with `CRON_SECRET`. Vercel Hobby cron only runs daily, which is too coarse for user-set times. `claim_due_notifications()` marks notifications as sent *before* sending, which enforces dedupe and max 2/day in SQL. Push windows are 2 hours wide after the user's chosen time.
- **SWR uses a persisted cache provider plus a bound mutator** (`lib/data.ts` → `MutateBinder`). SWR's exported `mutate` only touches the default cache, so calling it against a custom provider silently does nothing. That bug was found by e2e.
- **The service worker is versioned per deploy.** It's registered as `/sw.js?v=<build id>` (Vercel commit SHA). Each deploy installs a fresh worker that precaches every shell page *and the JS/CSS chunks those pages reference*, then deletes the previous build's cache. Uncached dynamic URLs fall back to `/offline`.
- **An explicit sign-out goes to a plain `/login`.** Only an unauthenticated visit carries `?next=` back to where you were.
- **Per-habit "reminder time" is used for Today grouping** (morning, afternoon, evening), not separate pushes. Separate pushes would break the max-2-per-day rule.
- **Share cards are drawn on a `<canvas>` on the device** (1080×1920 PNG), then shared with the Web Share API or downloaded. This has no server cost, works offline, and needs no `@vercel/og`.
- **Seasons are 6 ISO weeks from a fixed epoch** (2026-11-02, set in `private.app_config.season_epoch`). Standings use the average weekly completion rate. A champion is decided on the first job run after the season ends.

### Repository

- **The code lives in `ovr/` inside `william333-dev/a-s-cafe`** on branch `claude/github-repo-setup-4xo9ab`. This session couldn't create a new GitHub repo, and pushing to `a-s-cafe` was refused (403: the Claude GitHub App isn't installed on the repo). Commits are local in the session, and a git bundle is provided. `docs/deploy.md` covers moving it into its own repo (`git subtree split --prefix ovr`).

---

## Feature Challenges (Phase 5)

### Seasons (6-week league resets + champion badge)
- **Problem:** after a few weeks, the all-time board stops moving and late joiners can't catch up.
- **Who needs it:** everyone below #3, and anyone who joins late.
- **Build:** about 2 hours. Pure SQL (`season_info`, `decide_seasons`) plus one card on League.
- **Daily use:** small but positive. It gives a reason to care about week 5 of 6.
- **Upkeep:** almost none. There's no reset job; seasons are computed from weekly scores.
- **Recommendation:** build it. Built.

### Badges (~10 earned)
- **Problem:** long stretches with no rank change feel flat.
- **Who needs it:** newer players, between rank-ups.
- **Build:** about 2 hours. One `check_badges()` SQL function, run after completions and nightly, plus a grid on Profile.
- **Daily use:** a small dopamine hit on milestones. +50 XP each.
- **Upkeep:** low. The definitions are copy in `lib/badges.ts` plus conditions in SQL.
- **Recommendation:** build it, capped at about 10. No badge treadmill. Built 10, plus Dynamic Duo and Season Champion.

### Duos (pair challenge, combined weekly completion)
- **Problem:** the league is every-man-for-himself, and some mates want a buddy.
- **Who needs it:** pairs who already train together.
- **Build:** about 3 hours. One table, 4 RPCs and one card.
- **Daily use:** moderate for pairs, and invisible to everyone else.
- **Upkeep:** low. It's weekly with no state machine beyond pending, active and declined.
- **Recommendation:** borderline. It's the first thing I'd cut if it confuses people. Built, because Will said build all phases. Settled Monday, with a Dynamic Duo badge at ≥ 80% combined.
