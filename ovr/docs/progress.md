# Progress

## 2026-11-04: Live

- **Production:** https://ovr-jet.vercel.app (Vercel project `ovr`; Supabase project `ovr`, Sydney, ref `ixmkigxbdblqtzqsonqi`).
- **Database:** all 5 migrations applied, including the 15-minute cron job, which reaches `/api/push/dispatch` and gets a 200.
- **Auth:** plain email + password. Confirm email is off, minimum password length is 8, and `require_invite = false`.
- **Smoke test on production:** sign-up → straight to the setup quiz, with no email and no console errors. The test account was deleted afterwards.
- **Still to check on a real phone:** iPhone Home Screen install and push delivery.
- **Not wired up yet:** Vercel isn't connected to the GitHub repo, so pushes don't auto-deploy. Deploy with `npx vercel --prod` from `ovr/`, or connect the repo in Vercel → Settings → Git (Root Directory `ovr`).


## 2026-11-03: Phases 0–5 built and tested locally (Phase 6 coach not built, as instructed)

### Done

| Phase | What | Where |
|---|---|---|
| P0 Setup | Next 16 + TS strict + Tailwind 4, local Supabase (Postgres 17), migrations, PWA manifest + icons + hand-written service worker, logo | `supabase/`, `app/manifest.ts`, `public/sw.js`, `public/icons/` |
| P1 Design system | Tokens (`@theme`), Inter + Barlow Condensed, OvrCard (metallic tier frames, Apex sheen), HabitRow, XpToast, StreakFlame, AttributeRadar, HeatmapGrid, HoldToLockInButton, LeagueRow, ReactionBar, EmptyState/ErrorState/Skeleton, `/dev/gallery` | `components/`, `app/dev/gallery` |
| P2 Auth + engines | Invite-gated email-OTP signup (auth hook + DB trigger), XP/level/streak/shield/OVR engine in SQL **and** TS, 10 golden personas, timezone + NZ DST handling | `supabase/migrations/*`, `lib/rating-engine`, `lib/xp-engine`, `lib/dates` |
| P3 Core loop | 9-step setup quiz with hold-to-lock-in, habits CRUD, Today (grouped by time of day, yesterday catch-up, quit strip, journal prompt), OVR detail + "why it moved" + "How OVR works", Stats (history 7/30/90/all, heatmap, per-habit streak and 28-day %, level), quit trackers (live counter, slip flow, 1737), micro-journal, offline queue (IndexedDB, idempotent) | `app/(app)/*`, `app/onboarding`, `lib/offline-queue.ts`, `components/sync.tsx` |
| P4 League + push + share | Weekly board (completion %, XP tiebreak, server-side) + all-time OVR board, movement arrows, "X just passed you" banner, reactions, member cards, Sunday 7pm recap, web push (morning plan / evening streak-at-risk / Sunday recap, max 2/day, user-set times), share cards 1080×1920 PNG (OVR card + 30-day chart), settings (notification times, export JSON, delete account, sign out) | `app/(app)/league`, `app/api/push/*`, `lib/share-card`, `supabase/migrations/*_api.sql`, `*_cron.sql` |
| P5 Extras | Seasons (6 weeks, champion + badge), 10 badges (+ Dynamic Duo, Season Champion), Duos (weekly pair, 80% combined → badge). Feature Challenges are in decisions.md | same |

### Tests (all run locally against the real stack)

- **Unit (Vitest), 56 tests:** rating engine (ranks, caps, ceilings, breadth, calibration, decay, quit → Discipline, times-per-week), streaks and shields, XP and levels, dates (ISO weeks, NZ DST both directions, timezone changes), offline queue (ordering, network failure, permanent rejection, concurrent flushes, optimistic overlay), push messages and dead-subscription cleanup, copy voice and no-shame check, **10 golden personas**.
- **DB (Vitest + real Postgres), 42 tests:**
  - **Parity:** all 10 personas are replayed through the real RPCs day by day. Every day's OVR, raw OVR (to 1e-9), XP total and each tap's XP, bonus and error code match the TS engine.
  - **RLS** for every table: owner-only journal and relapses, hidden private habits and trackers, no direct XP/score writes, column grants, anon locked out, server-only functions, invite gate (OTP + admin paths), single-use member codes, export, account deletion cascade.
  - **API:** offline replay idempotency (sequential and concurrent), league ranking by rate vs XP, movement, reactions, Sunday recap and week-winner badge, seasons and champion, duos and badge, Today and Stats payloads, quit-day XP, journal date window, onboarding baseline and handle clash, push queue (windows, evening only if reps left, max 2/day, opt-outs).
- **E2E (Playwright, production build, 390×844 touch), 11 tests:**
  - Invite gate.
  - Full signup → quiz → hold-to-lock-in → Today → complete all → perfect-day toast → long-press undo → DB check → OVR detail → sign out/in.
  - Offline tap → queued → back online → synced once (DB checked).
  - Habit create/edit/archive.
  - League + member card + reaction, share PNG is 1080×1920, quit slip, journal, JSON export.
  - Manifest and icons, service worker serving Today offline, gallery at 360/390/430 px with no horizontal scroll, reduced motion.

**Final local run (2026-11-03): 56 unit + 42 DB + 11 e2e = 109 passed, 0 failed** (`npm test`, exit 0). Lint and `tsc --noEmit` are clean.

Bugs the e2e suite caught and fixed this session:
- Onboarding skipped creating starter habits because RLS made other members' habits visible to an unfiltered "do I have habits?" query.
- SWR's global `mutate` was a no-op against the persisted cache provider, so post-tap and post-onboarding updates never reached the UI cache. There's now a bound mutator.
- Offline navigation to a never-visited tab crashed because its JS chunks weren't cached. The SW now precaches each shell page's chunks and is versioned per deploy.
- Explicit sign-out no longer carries a `?next=` return path.

### Acceptance criteria status

| AC | Status |
|---|---|
| P0: installs to iPhone Home Screen | Manifest, icons, apple meta and SW are verified in Chromium. **Needs a real iPhone after deploy.** |
| P0: RLS tests pass | ✅ |
| P1: looks right at 360–430px; reduced motion works | ✅ automated (no horizontal scroll, animations disabled under reduced motion) |
| P2: all 10 personas pass; ±3 cap and XP cap enforced | ✅ in TS and in SQL (parity) |
| P3: offline completions sync without duplicates | ✅ e2e + DB tests |
| P3: full flow on a real iPhone feels instant | **Needs a real iPhone.** Taps are optimistic (IndexedDB first), so there's no network wait. |
| P4: server leaderboard matches fixtures | ✅ |
| P4: push arrives on an installed iPhone PWA | **Needs deploy + iPhone.** Queue/claim logic and sender are tested. Real APNs/FCM delivery can't be tested in a sandbox. |
| P4: share PNG renders correctly | ✅ 1080×1920 PNG verified |

### Not done / open

- **GitHub push failed (403):** the Claude GitHub App doesn't have access to `william333-dev/a-s-cafe`. Everything is committed locally on `claude/github-repo-setup-4xo9ab`, and a git bundle was handed over.
- Real-device checks (iPhone install, push delivery) need a deploy first. See `docs/deploy.md`.
- **Phase 6 AI coach:** not built (on hold until Will says go). Estimated cost if built: 30 users × ~5 msgs/day × (≈1.5k input + ≤500 output tokens) on a small model ≈ 4.5k msgs/month. That's roughly **US$3–8/month**, depending on the model chosen at the time.

### Free-tier notes

The cron runs every 15 minutes (≈2,900 runs/month), each a few ms of SQL plus one HTTP call to Vercel. That's comfortably inside Supabase free and Vercel Hobby. The first limit you'll hit is **Supabase's built-in auth email limit**. Add free SMTP (see deploy.md §1.7) before inviting everyone.
