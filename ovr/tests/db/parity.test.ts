// Golden personas through the REAL database RPCs, compared tick-for-tick with
// the TypeScript reference engine. Any drift between the two fails here.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { addDays } from "@/lib/dates";
import { PERSONAS, personaTimeline, todayFor } from "../fixtures/personas";
import { runSim } from "../fixtures/run-sim";
import { addHabit, asUser, errCode, member, pool, resetDb, rpc, setNow, sql, uuid } from "./helpers";

beforeAll(resetDb);
afterAll(async () => {
  await setNow(null);
  await pool.end();
});

describe("TS engine ↔ database parity", () => {
  for (const p of PERSONAS) {
    test(p.name, async () => {
      await sql("delete from auth.users");
      const expected = runSim(p).days;
      const timeline = personaTimeline(p);
      await setNow(timeline[0].instant);
      const uid = await member(`p_${p.name}`.slice(0, 20), { tz: p.tz, baseline: p.baseline, ratings: p.ratings });
      const ids: Record<string, string> = {};
      const qids: Record<string, string> = {};

      for (const { i, instant, tz } of timeline) {
        await setNow(instant);
        const a = p.plan(i, addDays(p.start, i));
        if (a.setTz) await asUser(uid, "update public.profiles set timezone = $2 where id = $1", [uid, a.setTz]);
        await sql("select public.run_daily_jobs()");
        const today = todayFor(instant, tz);
        for (const h of p.habits)
          if ((h.createdDay ?? 0) === i)
            ids[h.key] = await addHabit(uid, {
              title: h.title,
              attribute: h.attribute,
              difficulty: h.difficulty,
              custom_xp: h.customXp ?? null,
              schedule: h.schedule,
            });
        if (i === 0)
          for (const q of p.quit ?? []) {
            const r = await asUser<{ id: string }>(uid, "insert into public.quit_trackers(user_id, title) values ($1, $2) returning id", [uid, q]);
            qids[q] = r[0].id;
          }

        const events: { op: string; key: string; status: string; xp?: number; bonus?: number }[] = [];
        const call = async (op: string, key: string, fn: string, date: string) => {
          try {
            const r = await rpc<{ status: string; xp: number; bonus?: number }>(uid, fn, [uuid(), ids[key], date]);
            events.push({ op, key, status: r.status, xp: r.xp, bonus: r.bonus });
          } catch (e) {
            events.push({ op, key, status: (e as Error).message });
          }
        };
        for (const k of a.relapse ?? []) {
          await rpc(uid, "log_relapse", [qids[k], null, null]);
          events.push({ op: "relapse", key: k, status: "ok" });
        }
        for (const k of a.logYesterday ?? []) await call("logY", k, "log_completion", addDays(today, -1));
        for (const k of a.log ?? []) await call("log", k, "log_completion", today);
        for (const k of a.undo ?? []) await call("undo", k, "undo_completion", today);
        for (const k of a.undoYesterday ?? []) await call("undoY", k, "undo_completion", addDays(today, -1));

        const [snap] = await sql<{ overall: number; ovr_raw: number }>(
          "select overall, ovr_raw from public.ovr_snapshots where user_id = $1 and local_date = $2",
          [uid, today],
        );
        const [{ xp }] = await sql<{ xp: number }>(
          "select coalesce(sum(amount), 0)::int as xp from public.xp_ledger where user_id = $1 and reason <> 'badge'",
          [uid],
        );
        const exp = expected[i];
        const label = `${p.name} day ${i} (${today})`;
        expect(today, label).toBe(exp.today);
        expect(events.map((e) => [e.op, e.key, e.status, e.xp ?? null, e.op === "log" || e.op === "logY" ? (e.bonus ?? 0) : null]), label).toEqual(
          exp.events.map((e) => [e.op, e.key, e.status, e.xp ?? null, e.op === "log" || e.op === "logY" ? (e.bonus ?? 0) : null]),
        );
        expect(snap.overall, label).toBe(exp.overall);
        expect(snap.ovr_raw, label).toBeCloseTo(exp.raw, 9);
        expect(xp, label).toBe(exp.xpTotal);
      }
    });
  }

  test("an out-of-range date is refused server-side", async () => {
    await setNow("2026-08-10T00:00:00Z");
    const uid = await member("range_check");
    const h = await addHabit(uid, { title: "x", attribute: "body", difficulty: "minor" });
    expect(await errCode(rpc(uid, "log_completion", [uuid(), h, "2026-08-08"]))).toBe("date_out_of_range");
    expect(await errCode(rpc(uid, "log_completion", [uuid(), h, "2026-08-11"]))).toBe("date_out_of_range");
  });
});
