import { describe, expect, test } from "vitest";
import { PERSONAS } from "../fixtures/personas";
import { runSim } from "../fixtures/run-sim";
import { habitStreak } from "@/lib/rating-engine";
import { addDays } from "@/lib/dates";

const P = (name: string) => runSim(PERSONAS.find((p) => p.name === name)!);

describe("golden personas", () => {
  test("every persona moves at most ±3 per day and stays 40–99", () => {
    for (const p of PERSONAS) {
      const { days } = runSim(p);
      for (let i = 1; i < days.length; i++) {
        if (days[i].today <= days[i - 1].today) continue;
        expect(Math.abs(days[i].overall - days[i - 1].overall), p.name).toBeLessThanOrEqual(3);
      }
      for (const d of days) expect(d.overall).toBeGreaterThanOrEqual(40);
      for (const d of days) expect(d.overall).toBeLessThanOrEqual(99);
    }
  });

  test("1. day 1 shows the starting estimate", () => {
    const { days } = P("day1");
    expect(days[0].overall).toBe(54);
    expect(days[0].xpTotal).toBe(35 + 20 + 25); // + perfect day
  });

  test("2. perfect 28 days climbs to Apex territory, gated by the ±3 cap", () => {
    const { days } = P("perfect28");
    expect(days.map((d) => d.overall).slice(0, 4)).toEqual([55, 58, 61, 64]);
    expect(days[27].overall).toBe(96);
    expect(days.every((d) => d.events.every((e) => e.status === "ok"))).toBe(true);
  });

  test("3. one trivial habit can't reach 99", () => {
    const { days } = P("one_trivial_habit");
    expect(Math.max(...days.map((d) => d.overall))).toBe(77);
  });

  test("4. weekend-only habits aren't punished on weekdays", () => {
    const { days } = P("weekend_only");
    expect(days.slice(0, 5).every((d) => d.overall === 52)).toBe(true);
    // week 3 weekdays: no drop
    expect(days[16].overall).toBeGreaterThanOrEqual(days[13].overall);
    expect(days[20].overall).toBe(76);
  });

  test("5. relapse: no XP that day, Discipline dips, no shame on the counter", () => {
    const { sim, days } = P("relapse");
    const quitXp = (d: string) => sim.ledger.filter((l) => l.reason === "quit_day" && l.date === d).length;
    expect(quitXp(days[9].today)).toBe(0);
    expect(quitXp(days[10].today)).toBe(0);
    expect(quitXp(days[8].today)).toBe(1);
    expect(days[11].overall).toBe(days[10].overall); // flat while the slips are in the window
    expect(days[19].overall).toBe(81);
  });

  test("6. shield use keeps the streak alive", () => {
    const { sim, days } = P("shield_use");
    const h = sim.habits[0];
    const st = habitStreak(h, sim.completions, days[16].today, days[16].today);
    expect(st.shieldsUsed).toBe(2);
    expect(st.streak).toBe(15);
    const xpDay16 = days[16].events[0].xp;
    expect(xpDay16).toBe(Math.round(20 * 1.14)); // multiplier kept: streak 14 before the tap
  });

  test("7. timezone change: the repeated local date can't be double-logged", () => {
    const { days } = P("timezone_change");
    expect(days[6].today).toBe(days[5].today);
    expect(days[6].events[0].status).toBe("already_done");
    expect(days[7].today).toBe(addDays(days[5].today, 1));
    const xps = days.flatMap((d) => d.events.map((e) => e.xp ?? 0));
    expect(xps.filter((x) => x > 0)).toHaveLength(11);
  });

  test("8. NZ daylight-saving switch: one log per calendar day, continuous dates", () => {
    const { days } = P("nz_dst_switch");
    for (let i = 1; i < days.length; i++) expect(days[i].today).toBe(addDays(days[i - 1].today, 1));
    expect(days.find((d) => d.today === "2026-09-27")).toBeTruthy();
    expect(days.every((d) => d.events.every((e) => e.status === "ok"))).toBe(true);
    expect(days[13].overall).toBe(79);
  });

  test("9. daily XP cap hit at exactly 500", () => {
    const { sim, days } = P("cap_hit");
    for (const d of days) expect(sim.dayXp(d.today)).toBe(500);
    const day0 = days[0].events;
    expect(day0.slice(0, 10).every((e) => e.xp === 50)).toBe(true);
    expect(day0[10].xp).toBe(0);
    expect(day0[11].bonus).toBe(0); // perfect but capped
  });

  test("10. undo: same-day reverses XP and the perfect bonus; next-day undo is refused", () => {
    const { sim, days } = P("undo");
    expect(sim.dayXp(days[0].today)).toBe(20 + 10 + 25); // re-completed via late log next day
    expect(days[0].events.find((e) => e.op === "undo")).toMatchObject({ status: "ok", xp: -10 });
    expect(days[2].events.find((e) => e.op === "undoY")?.status).toBe("undo_expired");
    expect(days[1].events.find((e) => e.op === "logY")?.bonus).toBe(25);
  });
});
