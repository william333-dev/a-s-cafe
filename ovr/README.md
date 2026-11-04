# OVR — self-improvement, ranked

**Live:** https://ovr-jet.vercel.app

A private PWA for one friend group. Tick habits, earn XP, and watch your **OVR** (40–99, sports-card style) climb across six attributes. Compete in a private weekly league.

- **Stack:** Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · Motion · Recharts · Supabase (Postgres + RLS + email/password Auth + pg_cron) · Web Push · Vercel
- **Docs:** [rating formula](docs/rating-formula.md) · [decisions](docs/decisions.md) · [progress](docs/progress.md) · [deploy](docs/deploy.md)

## Run it locally

Needs Node 22+ and Docker.

```bash
npm install
npx supabase start          # local Postgres/Auth/Mailpit; applies migrations + seed
npm run build && npm start  # http://localhost:3000  (or: npm run dev)
```

Sign up at http://localhost:3000/login with any email and a password (8+ characters). `.env.local` holds the local demo keys (copy `.env.example` for production).

## Tests

```bash
npm run test:unit   # engines, dates, offline queue, push, copy (Vitest)
npm run test:db     # RLS on every table, RPCs, league, jobs, push queue, TS↔SQL parity for 10 golden personas
npm run test:e2e    # Playwright against the production build: signup → quiz → Today → offline sync → league → share PNG → PWA
npm test            # all of the above
```

## Layout

```
app/(auth)/login          email + password (reset-password too)
app/onboarding            9-step setup quiz with hold-to-lock-in
app/(app)/…               today, ovr, stats, league, league/[handle], profile, settings, habits, quit, journal
app/api/push/*            push dispatch (cron) + test push
components/…              ui, rating (OvrCard, radar, celebrations), habits, league, charts
lib/rating-engine         OVR math (TS reference; DB is authoritative)
lib/xp-engine             XP, levels, Simulator (replays history like the server)
lib/offline-queue         IndexedDB tap queue (idempotent by op_id)
lib/copy.ts               every user-facing string
supabase/migrations       schema + RLS, engine, RPCs, cron
tests/{unit,db,e2e}
```
