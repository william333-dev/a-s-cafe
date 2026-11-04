// Row Level Security + privilege tests for every table.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ANON_KEY, API_URL, addHabit, asUser, createUser, errCode, member, pool, resetDb, rpc, setNow, sql, uuid } from "./helpers";

let A: string, B: string;
let pubHabit: string, privHabit: string, privQuit: string, pubQuit: string;

beforeAll(async () => {
  await resetDb();
  await setNow("2026-11-03T00:00:00Z");
  A = await member("alice");
  B = await member("bob");
  pubHabit = await addHabit(A, { title: "Gym", attribute: "body", difficulty: "major" });
  privHabit = await addHabit(A, { title: "Therapy homework", attribute: "mind", difficulty: "standard", visible_to_league: false });
  await rpc(A, "log_completion", [uuid(), pubHabit, "2026-11-03"]);
  await rpc(A, "log_completion", [uuid(), privHabit, "2026-11-03"]);
  await asUser(A, "insert into public.journal_entries(user_id, local_date, mood, body) values ($1, '2026-11-03', 2, 'rough day')", [A]);
  privQuit = (await asUser<{ id: string }>(A, "insert into public.quit_trackers(user_id, title) values ($1, 'Gambling') returning id", [A]))[0].id;
  pubQuit = (await asUser<{ id: string }>(A, "insert into public.quit_trackers(user_id, title, visible_to_league) values ($1, 'Vaping', true) returning id", [A]))[0].id;
  await rpc(A, "log_relapse", [privQuit, "stress", "private note"]);
  await asUser(A, "insert into public.push_subscriptions(user_id, endpoint, keys) values ($1, 'https://push.example/a', '{}')", [A]);
});
afterAll(async () => {
  await setNow(null);
  await pool.end();
});

const count = async (uid: string | null, q: string, p: unknown[] = []) =>
  Number((await asUser<{ n: string }>(uid, `select count(*) as n from (${q}) z`, p))[0].n);

describe("reads", () => {
  test("owner sees all their own rows", async () => {
    expect(await count(A, "select * from public.habits where user_id = $1", [A])).toBe(2);
    expect(await count(A, "select * from public.journal_entries")).toBe(1);
    expect(await count(A, "select * from public.relapses")).toBe(1);
    expect(await count(A, "select * from public.completions")).toBe(2);
    expect(await count(A, "select * from public.xp_ledger")).toBeGreaterThan(0);
    expect(await count(A, "select * from public.profile_settings")).toBe(1);
    expect(await count(A, "select * from public.push_subscriptions")).toBe(1);
  });
  test("league members see only public habits and public quit trackers", async () => {
    expect(await count(B, "select * from public.habits where user_id = $1", [A])).toBe(1);
    expect(await count(B, "select * from public.habits where id = $1", [privHabit])).toBe(0);
    expect(await count(B, "select * from public.quit_trackers where user_id = $1", [A])).toBe(1);
    expect(await count(B, "select * from public.quit_trackers where id = $1", [pubQuit])).toBe(1);
  });
  test("journal and relapse notes are owner-only, always", async () => {
    expect(await count(B, "select * from public.journal_entries")).toBe(0);
    expect(await count(B, "select * from public.relapses")).toBe(0);
    expect(await count(null, "select * from public.journal_entries").catch(() => 0)).toBe(0);
  });
  test("private tables are invisible to other members", async () => {
    for (const t of ["completions", "xp_ledger", "profile_settings", "push_subscriptions", "completion_ops", "notification_log"]) {
      expect(await count(B, `select * from public.${t} where user_id = $1`, [A]), t).toBe(0);
    }
    expect(await count(B, "select * from public.invite_codes")).toBe(0);
  });
  test("league-wide reads: profiles, snapshots, weekly scores", async () => {
    expect(await count(B, "select * from public.profiles")).toBe(2);
    expect(await count(B, "select * from public.ovr_snapshots where user_id = $1", [A])).toBeGreaterThan(0);
    await rpc(B, "league_board");
    expect(await count(B, "select * from public.weekly_scores where user_id = $1", [A])).toBe(1);
  });
  test("anon can read nothing", async () => {
    for (const t of ["profiles", "habits", "ovr_snapshots", "weekly_scores", "reactions"]) {
      expect(await errCode(asUser(null, `select * from public.${t}`)), t).toMatch(/permission denied/);
    }
    expect((await asUser<{ r: boolean }>(null, "select public.check_invite('LOCKIN') as r"))[0].r).toBe(true);
    expect(await errCode(asUser(null, "select public.get_today()"))).toMatch(/permission denied/);
  });
  test("member_card exposes only public habits", async () => {
    const card = await rpc<{ habits: { title: string }[]; quit: { title: string }[] }>(B, "member_card", ["alice"]);
    expect(card.habits.map((h) => h.title)).toEqual(["Gym"]);
    expect(card.quit.map((q) => q.title)).toEqual(["Vaping"]);
    expect(JSON.stringify(card)).not.toContain("Therapy");
    expect(JSON.stringify(card)).not.toContain("private note");
  });
});

describe("writes", () => {
  test("nobody can write XP, completions or scores directly", async () => {
    expect(await errCode(asUser(A, "insert into public.completions(habit_id, user_id, local_date, count, xp_awarded) values ($1, $2, '2026-11-02', 1, 999)", [pubHabit, A]))).toMatch(/row-level security/);
    expect(await errCode(asUser(A, "insert into public.xp_ledger(user_id, amount, reason, local_date) values ($1, 9999, 'habit', '2026-11-03')", [A]))).toMatch(/row-level security/);
    expect(await errCode(asUser(A, "insert into public.ovr_snapshots(user_id, local_date, overall) values ($1, '2026-11-04', 99)", [A]))).toMatch(/row-level security/);
    expect(await errCode(asUser(A, "insert into public.weekly_scores(user_id, iso_week, completion_rate) values ($1, '2026-W45', 1)", [A]))).toMatch(/row-level security/);
    await asUser(A, "update public.completions set xp_awarded = 9999");
    await asUser(A, "update public.weekly_scores set completion_rate = 1");
    expect((await sql<{ m: number }>("select max(xp_awarded) as m from public.completions where user_id = $1", [A]))[0].m).toBeLessThan(100);
  });
  test("can't change baseline, start date or onboarding flags", async () => {
    expect(await errCode(asUser(A, "update public.profiles set baseline_ovr = 65 where id = $1", [A]))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "update public.profiles set start_date = '2020-01-01' where id = $1", [A]))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "update public.habits set start_date = '2020-01-01' where id = $1", [pubHabit]))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "update public.quit_trackers set credit_start = '2020-01-01' where id = $1", [pubQuit]))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "update public.quit_trackers set last_reset_at = '2020-01-01' where id = $1", [pubQuit]))).toMatch(/permission denied/);
    // allowed: display fields
    await asUser(A, "update public.profiles set display_name = 'Al' where id = $1", [A]);
  });
  test("backdated quit trackers get no back-pay", async () => {
    const r = await asUser<{ credit_start: string }>(A, "insert into public.quit_trackers(user_id, title, started_at) values ($1, 'Sugar', now() - interval '60 days') returning credit_start::text", [A]);
    expect(r[0].credit_start).toBe("2026-11-03");
  });
  test("other members can't touch your stuff", async () => {
    await asUser(B, "update public.habits set title = 'hacked' where id = $1", [pubHabit]);
    await asUser(B, "update public.journal_entries set body = 'hacked'");
    await asUser(B, "delete from public.push_subscriptions");
    expect((await sql<{ title: string }>("select title from public.habits where id = $1", [pubHabit]))[0].title).toBe("Gym");
    expect(await count(A, "select * from public.push_subscriptions")).toBe(1);
    expect(await errCode(asUser(B, "insert into public.habits(user_id, title, attribute) values ($1, 'x', 'body')", [A]))).toMatch(/row-level security/);
    expect(await errCode(rpc(B, "log_completion", [uuid(), pubHabit, "2026-11-03"]))).toBe("habit_not_found");
    expect((await rpc<{ status: string }>(B, "undo_completion", [uuid(), pubHabit, "2026-11-03"])).status).toBe("nothing_to_undo");
    expect((await sql<{ n: string }>("select count(*) n from public.completions where habit_id = $1", [pubHabit]))[0].n).toBe("1");
    expect(await errCode(rpc(B, "log_relapse", [pubQuit, null, null]))).toBe("tracker_not_found");
  });
  test("reactions: send as yourself only, never to yourself", async () => {
    await asUser(B, "insert into public.reactions(from_user, to_user, kind) values ($1, $2, 'fire')", [B, A]);
    expect(await errCode(asUser(B, "insert into public.reactions(from_user, to_user, kind) values ($1, $2, 'clown')", [A, B]))).toMatch(/row-level security/);
    expect(await errCode(asUser(B, "insert into public.reactions(from_user, to_user, kind) values ($1, $1, 'flex')", [B]))).toMatch(/check constraint/);
    expect(await errCode(asUser(B, "insert into public.reactions(from_user, to_user, kind) values ($1, $2, 'fire')", [B, A]))).toMatch(/duplicate/);
    await asUser(A, "delete from public.reactions");
    expect(await count(B, "select * from public.reactions")).toBe(1);
  });
  test("server-only functions are not callable by users", async () => {
    expect(await errCode(asUser(A, "select public.run_daily_jobs()"))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "select public.claim_due_notifications()"))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "select public.hook_before_user_created('{}'::jsonb)"))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "select private.cfg('cron_secret')"))).toMatch(/permission denied/);
    expect(await errCode(asUser(A, "truncate public.reactions"))).toMatch(/permission denied/);
  });
});

describe("invites + account lifecycle", () => {
  test("open sign-up by default: no invite needed (password path)", async () => {
    const r = await fetch(`${API_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email: `open${Date.now()}@ovr.test`, password: "password-123" }),
    });
    expect(r.status).toBe(200);
    expect(await createUser({ invite: null })).toBeTruthy();
  });
  test("with require_invite switched on, sign-up needs a valid code", async () => {
    await sql("update private.app_config set value = 'true' where key = 'require_invite'");
    try {
      const signup = (email: string, invite?: string) =>
        fetch(`${API_URL}/auth/v1/signup`, {
          method: "POST",
          headers: { apikey: ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email, password: "password-123", data: invite ? { invite_code: invite } : {} }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }));
      const bad = await signup(`stranger${Date.now()}@ovr.test`, "NOPE1234");
      expect(bad.status).toBe(403);
      expect(bad.body.msg).toMatch(/Invite code invalid/);
      expect((await signup(`stranger2${Date.now()}@ovr.test`)).status).toBe(403);
      expect((await signup(`friend${Date.now()}@ovr.test`, "lockin")).status).toBe(200);
      // any other path is still guarded by the trigger
      expect(await errCode(createUser({ invite: null }))).toMatch(/Invite code invalid|invite_required|Database error/);
      await sql("insert into public.invite_codes(code, uses_left, expires_at) values ('OLDCODE', 5, now() - interval '1 day') on conflict do nothing");
      expect(await errCode(createUser({ invite: "OLDCODE" }))).toMatch(/Invite code invalid|invite_required|Database error/);
      const code = await rpc<string>(A, "create_invite");
      await createUser({ invite: code.toLowerCase() });
      expect(await errCode(createUser({ invite: code }))).toMatch(/Invite code invalid|invite_required/);
    } finally {
      await sql("update private.app_config set value = 'false' where key = 'require_invite'");
    }
  });
  test("member invite codes: max 3 active each", async () => {
    await rpc(A, "create_invite");
    await rpc(A, "create_invite");
    await rpc(A, "create_invite");
    expect(await errCode(rpc(A, "create_invite"))).toBe("invite_limit");
  });
  test("export contains my private data and nobody else's", async () => {
    const ex = await rpc<Record<string, unknown[]>>(A, "export_my_data");
    expect(ex.journal_entries).toHaveLength(1);
    expect(ex.relapses).toHaveLength(1);
    expect(JSON.stringify(ex)).not.toContain(B);
  });
  test("delete my account removes everything", async () => {
    const C = await member("carol");
    const h = await addHabit(C, { title: "x", attribute: "body" });
    await rpc(C, "log_completion", [uuid(), h, "2026-11-03"]);
    await asUser(C, "insert into public.journal_entries(user_id, local_date, mood) values ($1, '2026-11-03', 4)", [C]);
    await rpc(C, "delete_my_account");
    for (const t of ["profiles", "habits", "completions", "xp_ledger", "journal_entries", "ovr_snapshots"]) {
      const col = t === "profiles" ? "id" : "user_id";
      expect((await sql<{ n: string }>(`select count(*) n from public.${t} where ${col} = $1`, [C]))[0].n, t).toBe("0");
    }
    expect((await sql<{ n: string }>("select count(*) n from auth.users where id = $1", [C]))[0].n).toBe("0");
  });
});
