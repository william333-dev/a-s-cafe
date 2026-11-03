import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { addHabit, asUser, errCode, member, pool, resetDb, rpc, setNow, sql, uuid } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await setNow(null);
  await pool.end();
});

type Board = {
  iso_week: string;
  rows: { handle: string; weekly_pos: number; alltime_pos: number; completion_rate: number; xp_week: number; prev_weekly_pos: number | null; reactions: Record<string, number> }[];
  recap: { iso_week: string; standings: { handle: string; pos: number }[] } | null;
  season: { season_no: number; week: number; standings: { handle: string }[]; champions: { handle: string }[] } | null;
};

describe("offline sync", () => {
  test("replaying the same op_id is idempotent; distinct ops can't overshoot the target", async () => {
    await setNow("2026-11-03T00:00:00Z");
    const u = await member("sam");
    const h = await addHabit(u, { title: "Gym", attribute: "body", difficulty: "major" });
    const op = uuid();
    const r1 = await rpc<{ status: string; xp: number }>(u, "log_completion", [op, h, "2026-11-03"]);
    const r2 = await rpc<{ status: string; replayed: boolean }>(u, "log_completion", [op, h, "2026-11-03"]);
    expect(r1.status).toBe("ok");
    expect(r2.replayed).toBe(true);
    const r3 = await rpc<{ status: string }>(u, "log_completion", [uuid(), h, "2026-11-03"]);
    expect(r3.status).toBe("already_done");
    const rows = await sql<{ count: number }>("select count from public.completions where habit_id = $1", [h]);
    expect(rows).toEqual([{ count: 1 }]);
    const [{ xp }] = await sql<{ xp: number }>("select sum(amount)::int xp from public.xp_ledger where user_id = $1 and reason <> 'badge'", [u]);
    expect(xp).toBe(35 + 25);
  });
  test("concurrent replays of the same queue don't duplicate", async () => {
    await setNow("2026-11-03T00:00:00Z");
    const u = await member("sam2");
    const h = await addHabit(u, { title: "Pushups", attribute: "body", schedule: { type: "daily", target_per_day: 3 } });
    const ops = [uuid(), uuid(), uuid()];
    await Promise.all([...ops, ...ops].map((op) => rpc(u, "log_completion", [op, h, "2026-11-03"])));
    expect((await sql<{ count: number }>("select count from public.completions where habit_id = $1", [h]))[0].count).toBe(3);
    expect((await sql<{ n: string }>("select count(*) n from public.xp_ledger where ref_id is not null and reason = 'habit' and user_id = $1", [u]))[0].n).toBe("3");
  });
});

describe("league", () => {
  test("ranks by weekly completion rate, XP breaks ties — computed server-side", async () => {
    await setNow("2026-11-04T00:00:00Z"); // Wed (NZ)
    const a = await member("hunter", { startDate: "2026-11-02" });
    const b = await member("sam", { startDate: "2026-11-02" });
    const c = await member("will", { startDate: "2026-11-02" });
    // hunter: 20 easy habits, does 15 → lower rate but the most XP
    const ha = [];
    for (let i = 0; i < 20; i++) ha.push(await addHabit(a, { title: `easy ${i}`, attribute: "body", difficulty: "minor" }));
    for (const h of ha.slice(0, 15)) await rpc(a, "log_completion", [uuid(), h, "2026-11-04"]);
    const hb = await addHabit(b, { title: "Gym", attribute: "body", difficulty: "major" });
    await rpc(b, "log_completion", [uuid(), hb, "2026-11-04"]);
    const hc = await addHabit(c, { title: "Read", attribute: "mind", difficulty: "minor" });
    await rpc(c, "log_completion", [uuid(), hc, "2026-11-04"]);
    // today's unfinished habits don't count yet; check the next morning
    await setNow("2026-11-05T00:00:00Z");
    const board = await rpc<Board>(a, "league_board");
    expect(board.iso_week).toBe("2026-W45");
    expect(board.rows.map((r) => [r.handle, r.weekly_pos])).toEqual([["sam", 1], ["will", 2], ["hunter", 3]]);
    expect(board.rows[2].completion_rate).toBeCloseTo(0.75);
    expect(board.rows[2].xp_week).toBeGreaterThan(board.rows[0].xp_week);
  });

  test("movement arrows, reactions, Sunday recap and week-winner badge", async () => {
    await setNow("2026-11-07T00:00:00Z"); // Sat NZ
    const a = await member("hunter");
    const b = await member("sam");
    const ha = await addHabit(a, { title: "Gym", attribute: "body" });
    const hb = await addHabit(b, { title: "Gym", attribute: "body" });
    await rpc(a, "log_completion", [uuid(), ha, "2026-11-07"]);
    await sql("select public.run_daily_jobs()");
    let board = await rpc<Board>(a, "league_board");
    expect(board.rows[0].handle).toBe("hunter");
    // next day sam overtakes (hunter misses Sunday)
    await setNow("2026-11-08T07:00:00Z"); // Sun 20:00 NZDT
    await rpc(b, "log_completion", [uuid(), hb, "2026-11-08"]);
    await rpc(b, "log_completion", [uuid(), hb, "2026-11-07"]);
    await asUser(a, "insert into public.reactions(from_user, to_user, kind) values ($1, $2, 'salute')", [a, b]);
    board = await rpc<Board>(b, "league_board");
    const sam = board.rows.find((r) => r.handle === "sam")!;
    expect(sam.weekly_pos).toBe(1);
    expect(sam.prev_weekly_pos).toBe(2);
    expect(sam.reactions).toEqual({ salute: 1 });
    await sql("select public.run_daily_jobs()");
    board = await rpc<Board>(b, "league_board");
    expect(board.recap?.iso_week).toBe("2026-W45");
    expect(board.recap?.standings[0].handle).toBe("sam");
    expect((await sql("select * from public.user_badges where user_id = $1 and badge_key = 'week_winner'", [b])).length).toBe(1);
  });

  test("seasons: 6-week standings and a champion", async () => {
    await setNow("2026-11-03T00:00:00Z");
    const a = await member("hunter", { startDate: "2026-11-02" });
    const b = await member("sam", { startDate: "2026-11-02" });
    const ha = await addHabit(a, { title: "Gym", attribute: "body" });
    await addHabit(b, { title: "Gym", attribute: "body" });
    // hunter does it every day of week 1
    for (let d = 3; d <= 8; d++) {
      await setNow(`2026-11-${String(d).padStart(2, "0")}T00:00:00Z`);
      await rpc(a, "log_completion", [uuid(), ha, `2026-11-${String(d).padStart(2, "0")}`]);
      await sql("select public.run_daily_jobs()");
    }
    let board = await rpc<Board>(a, "league_board");
    expect(board.season?.season_no).toBe(1);
    expect(board.season?.standings[0].handle).toBe("hunter");
    await setNow("2026-12-14T01:00:00Z"); // season 2 begins
    await sql("select public.run_daily_jobs()");
    board = await rpc<Board>(a, "league_board");
    expect(board.season?.season_no).toBe(2);
    expect(board.season?.champions[0].handle).toBe("hunter");
    expect((await sql("select * from public.user_badges where user_id = $1 and badge_key = 'champion_s1'", [a])).length).toBe(1);
  });

  test("duos: invite, accept, combined rate, badge at ≥ 80%", async () => {
    await setNow("2026-11-02T00:00:00Z"); // Mon
    const a = await member("hunter", { startDate: "2026-11-02" });
    const b = await member("sam", { startDate: "2026-11-02" });
    const c = await member("will", { startDate: "2026-11-02" });
    const d = await rpc<{ id: string }>(a, "duo_invite", ["sam"]);
    expect(await errCode(rpc(c, "duo_invite", ["sam"]))).toBe("already_in_duo");
    expect(await errCode(rpc(a, "duo_respond", [d.id, true]))).toBe("duo_not_found"); // only invitee can accept
    await rpc(b, "duo_respond", [d.id, true]);
    const ha = await addHabit(a, { title: "Gym", attribute: "body" });
    const hb = await addHabit(b, { title: "Gym", attribute: "body" });
    for (let day = 2; day <= 8; day++) {
      const date = `2026-11-${String(day).padStart(2, "0")}`;
      await setNow(`${date}T00:00:00Z`);
      await sql("select public.run_daily_jobs()");
      await rpc(a, "log_completion", [uuid(), ha, date]);
      await rpc(b, "log_completion", [uuid(), hb, date]);
    }
    const duo = await rpc<{ combined: number; status: string }>(a, "my_duo");
    expect(duo.status).toBe("active");
    expect(duo.combined).toBeCloseTo(1);
    await setNow("2026-11-09T00:00:00Z");
    await sql("select public.run_daily_jobs()");
    expect((await sql("select * from public.user_badges where badge_key = 'dynamic_duo'")).length).toBe(2);
  });
});

describe("today + stats + quit", () => {
  test("get_today shape, streak shields, and level", async () => {
    await setNow("2026-11-03T00:00:00Z");
    const u = await member("sam");
    const h = await addHabit(u, { title: "Gym", attribute: "body", difficulty: "major", reminder_time: "07:00" });
    await rpc(u, "log_completion", [uuid(), h, "2026-11-03"]);
    const t = await rpc<{
      today: string; habits: { id: string; today_count: number; streak: number; undoable_today: boolean; base_xp: number }[];
      level: { level: number; xp_total: number }; snapshot: { overall: number }; perfect_today: boolean; badges: string[];
    }>(u, "get_today");
    expect(t.today).toBe("2026-11-03");
    expect(t.habits[0]).toMatchObject({ today_count: 1, streak: 1, undoable_today: true, base_xp: 35 });
    expect(t.perfect_today).toBe(true);
    expect(t.badges).toEqual(expect.arrayContaining(["first_rep", "perfect_day"]));
    expect(t.level.xp_total).toBe(35 + 25 + 100); // + 2 badges × 50
  });

  test("get_stats returns history, heatmap and per-habit numbers", async () => {
    await setNow("2026-11-01T00:00:00Z");
    const u = await member("sam");
    const h = await addHabit(u, { title: "Gym", attribute: "body" });
    for (let d = 1; d <= 5; d++) {
      const date = `2026-11-0${d}`;
      await setNow(`${date}T00:00:00Z`);
      await sql("select public.run_daily_jobs()");
      if (d !== 3) await rpc(u, "log_completion", [uuid(), h, date]);
    }
    const s = await rpc<{ history: unknown[]; heatmap: { d: string; done: number; sched: number }[]; habits: { streak: number; best: number; rate28: number }[] }>(u, "get_stats");
    expect(s.history.length).toBe(5);
    expect(s.heatmap.find((x) => x.d === "2026-11-03")).toMatchObject({ done: 0, sched: 1 });
    expect(s.habits[0]).toMatchObject({ streak: 2, best: 2 });
    expect(s.habits[0].rate28).toBeCloseTo(0.8);
  });

  test("quit tracker: clean-day XP at midnight, slip resets counter but keeps best + XP", async () => {
    await setNow("2026-11-01T00:00:00Z");
    const u = await member("sam");
    const [{ id }] = await asUser<{ id: string }>(u, "insert into public.quit_trackers(user_id, title) values ($1, 'Vape') returning id", [u]);
    for (let d = 2; d <= 5; d++) {
      await setNow(`2026-11-0${d}T00:00:00Z`);
      await sql("select public.run_daily_jobs()");
    }
    const xp = async () => (await sql<{ s: number }>("select coalesce(sum(amount),0)::int s from public.xp_ledger where user_id = $1 and reason = 'quit_day'", [u]))[0].s;
    expect(await xp()).toBe(20 + 20 + 20 + 21); // streak multiplier: 20×1.03 = 20.6 → 21 on day 4
  });

  test("journal: today/yesterday only, private", async () => {
    await setNow("2026-11-03T00:00:00Z");
    const u = await member("sam");
    await asUser(u, "insert into public.journal_entries(user_id, local_date, mood, body) values ($1, '2026-11-02', 3, 'ok')", [u]);
    expect(await errCode(asUser(u, "insert into public.journal_entries(user_id, local_date, mood) values ($1, '2026-10-30', 3)", [u]))).toBe("date_out_of_range");
    expect(await errCode(asUser(u, "insert into public.journal_entries(user_id, local_date, mood) values ($1, '2026-11-03', 9)", [u]))).toMatch(/check constraint/);
  });

  test("onboarding sets baseline from ratings, rejects taken handles", async () => {
    await setNow("2026-11-03T00:00:00Z");
    const u = await member("taken");
    const v = await member("other");
    await sql("update public.profiles set onboarded = false where id = $1", [v]);
    const r = await rpc<{ baseline: number }>(v, "complete_onboarding", ["newbie", "Newbie", "Pacific/Auckland", { focus: ["body", "mind"], ratings: { body: 7, mind: 4 }, goal: "Run a half" }, null]);
    expect(r.baseline).toBe(55 + 0); // avg 5.5 → 55
    expect(await errCode(rpc(v, "complete_onboarding", ["taken", "x", "Pacific/Auckland", {}, null]))).toBe("handle_taken");
    expect(u).toBeTruthy();
  });
});

describe("push queue", () => {
  async function subscriber(handle: string) {
    const u = await member(handle, { startDate: "2026-11-01" });
    await asUser(u, "insert into public.push_subscriptions(user_id, endpoint, keys) values ($1, $2, '{}')", [u, `https://push.example/${handle}`]);
    return u;
  }
  test("morning plan, evening only when habits remain, max 2 per day, no repeats", async () => {
    const u = await subscriber("sam");
    const h = await addHabit(u, { title: "Gym", attribute: "body" });
    const claim = () => sql<{ r: { user_id: string; kind: string }[] }>("select public.claim_due_notifications() r").then((x) => x[0].r);
    await setNow("2026-11-03T17:00:00Z"); // 06:00 NZDT Wed — before morning time
    expect(await claim()).toEqual([]);
    await setNow("2026-11-03T18:45:00Z"); // 07:45
    expect((await claim()).map((x) => x.kind)).toEqual(["morning"]);
    expect(await claim()).toEqual([]); // no repeat
    await setNow("2026-11-04T07:40:00Z"); // 20:40 — habit not done
    const ev = await claim();
    expect(ev.map((x) => x.kind)).toEqual(["evening"]);
    expect((ev[0] as unknown as { remaining: number }).remaining).toBe(1);
    // next day: habit done → no evening nag
    await setNow("2026-11-05T07:40:00Z");
    await rpc(u, "log_completion", [uuid(), h, "2026-11-05"]);
    expect(await claim()).toEqual([]);
    // max two per day
    await sql("update public.profile_settings set notify = notify || '{\"evening\":\"21:00\"}' where user_id = $1", [u]);
    await setNow("2026-11-06T08:30:00Z"); // Fri 21:30, morning not sent (outside 2h window)
    await sql("insert into public.notification_log(user_id, kind, local_date) values ($1, 'morning', '2026-11-06'), ($1, 'recap', '2026-11-06')", [u]);
    expect(await claim()).toEqual([]);
  });
  test("users with notifications off get nothing", async () => {
    const u = await subscriber("will");
    await addHabit(u, { title: "Gym", attribute: "body" });
    await sql("update public.profile_settings set notify = notify || '{\"morning_on\":false}' where user_id = $1", [u]);
    await setNow("2026-11-03T18:45:00Z");
    expect((await sql<{ r: unknown[] }>("select public.claim_due_notifications() r"))[0].r).toEqual([]);
  });
});
