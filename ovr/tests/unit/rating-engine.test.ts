import { describe, expect, test } from "vitest";
import {
  baseXp, baselineFromRatings, computeOvr, finalOverall, habitStreak, isScheduledDay, nEff, nextRank, perWeek,
  pgRound, quitStreak, rankFor, streakMultiplier, target, type HabitInput, type CompletionInput,
} from "@/lib/rating-engine";
import { addDays, rangeDays } from "@/lib/dates";

const H = (over: Partial<HabitInput> = {}): HabitInput => ({
  id: "h", attribute: "body", difficulty: "standard", schedule: { type: "daily" }, startDate: "2026-08-03", ...over,
});
const doneEvery = (id: string, from: string, to: string, count = 1): CompletionInput[] =>
  rangeDays(from, to).map((date) => ({ habitId: id, date, count }));

describe("basics", () => {
  test("base XP by difficulty", () => {
    expect([baseXp("minor"), baseXp("standard"), baseXp("major"), baseXp("custom", 42)]).toEqual([10, 20, 35, 42]);
  });
  test("streak multiplier caps at 1.30", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(10)).toBeCloseTo(1.1);
    expect(streakMultiplier(30)).toBeCloseTo(1.3);
    expect(streakMultiplier(300)).toBeCloseTo(1.3);
  });
  test("schedules", () => {
    expect(isScheduledDay({ type: "weekdays", days: [6, 7] }, "2026-08-08")).toBe(true); // Sat
    expect(isScheduledDay({ type: "weekdays", days: [6, 7] }, "2026-08-07")).toBe(false);
    expect(isScheduledDay({ type: "times_per_week", times_per_week: 3 }, "2026-08-07")).toBe(false);
    expect(perWeek({ type: "weekdays", days: [1, 3, 5] })).toBe(3);
    expect(perWeek({ type: "daily" })).toBe(7);
    expect(target({ type: "daily", target_per_day: 4 })).toBe(4);
    expect(nEff(3, 7)).toBe(3);
    expect(nEff(3, 2)).toBe(1);
    expect(nEff(5, 4)).toBe(3);
  });
  test("pgRound mirrors Postgres numeric rounding", () => {
    expect(pgRound(2.5)).toBe(3);
    expect(pgRound(-2.5)).toBe(-3);
    expect(pgRound(20 * 1.15)).toBe(23);
    expect(pgRound(0.49999999999999994)).toBe(1); // 15 significant digits → 0.5
  });
  test("ranks", () => {
    expect(rankFor(40).label).toBe("Rookie");
    expect(rankFor(59).label).toBe("Bronze");
    expect(rankFor(60).label).toBe("Silver");
    expect(rankFor(79).label).toBe("Gold");
    expect(rankFor(86).label).toBe("Platinum");
    expect(rankFor(87).label).toBe("Diamond");
    expect(rankFor(92).label).toBe("Diamond");
    expect(rankFor(93).label).toBe("Apex");
    expect(nextRank(57)).toMatchObject({ label: "Silver", pointsToGo: 3 });
    expect(nextRank(99)).toBeNull();
  });
  test("baseline from quiz ratings maps 1–10 to 45–65", () => {
    expect(baselineFromRatings({ body: 1 })).toBe(45);
    expect(baselineFromRatings({ body: 10, mind: 10 })).toBe(65);
    expect(baselineFromRatings({ body: 5, mind: 6 })).toBe(55);
    expect(baselineFromRatings({})).toBe(55);
  });
  test("daily movement capped at ±3 and clamped 40–99", () => {
    expect(finalOverall(70.4, null)).toBe(70);
    expect(finalOverall(80, 70)).toBe(73);
    expect(finalOverall(50, 70)).toBe(67);
    expect(finalOverall(120, 98)).toBe(99);
    expect(finalOverall(10, null)).toBe(40);
  });
});

describe("streaks + shields", () => {
  const h = H();
  test("earn a shield every 7, max 2", () => {
    const c = doneEvery("h", "2026-08-03", addDays("2026-08-03", 20));
    const s = habitStreak(h, c, addDays("2026-08-03", 20), addDays("2026-08-03", 21));
    expect(s.streak).toBe(21);
    expect(s.shields).toBe(2);
  });
  test("a miss uses a shield and the streak survives", () => {
    const c = doneEvery("h", "2026-08-03", "2026-08-09"); // 7 days → 1 shield
    c.push(...doneEvery("h", "2026-08-11", "2026-08-12")); // missed 08-10
    const s = habitStreak(h, c, "2026-08-12", "2026-08-13");
    expect(s).toMatchObject({ streak: 9, shields: 0, shieldsUsed: 1, lastShieldDate: "2026-08-10" });
  });
  test("a miss without shields resets", () => {
    const c = doneEvery("h", "2026-08-03", "2026-08-05");
    c.push({ habitId: "h", date: "2026-08-07", count: 1 });
    expect(habitStreak(h, c, "2026-08-07", "2026-08-08")).toMatchObject({ streak: 1, best: 3 });
  });
  test("today is pending, not a miss", () => {
    const c = doneEvery("h", "2026-08-03", "2026-08-05");
    expect(habitStreak(h, c, "2026-08-06", "2026-08-06").streak).toBe(3);
  });
  test("partial count is not done", () => {
    const h4 = H({ schedule: { type: "daily", target_per_day: 4 } });
    const c = [{ habitId: "h", date: "2026-08-03", count: 3 }];
    expect(habitStreak(h4, c, "2026-08-03", "2026-08-04").streak).toBe(0);
  });
  test("times-per-week: a missed quota week burns a shield or resets", () => {
    const t = H({ schedule: { type: "times_per_week", times_per_week: 2 } });
    const c = ["2026-08-03", "2026-08-05", "2026-08-10"].map((date) => ({ habitId: "h", date, count: 1 }));
    // week 2 only 1/2 → reset after Sunday 08-16
    expect(habitStreak(t, c, "2026-08-17", "2026-08-17").streak).toBe(0);
    // still inside week 2 → pending
    expect(habitStreak(t, c, "2026-08-12", "2026-08-12").streak).toBe(3);
  });
  test("quit streak counts clean days ending at a date", () => {
    const q = { id: "q", creditStart: "2026-08-01", relapseDates: ["2026-08-05"] };
    expect(quitStreak(q, "2026-08-04")).toBe(4);
    expect(quitStreak(q, "2026-08-05")).toBe(0);
    expect(quitStreak(q, "2026-08-08")).toBe(3);
  });
});

describe("OVR", () => {
  const base = { baseline: 55, startDate: "2026-07-01", today: "2026-08-30" };
  test("no habits → baseline", () => {
    expect(computeOvr({ ...base, habits: [], completions: [] }).raw).toBe(55);
  });
  test("one trivial habit done perfectly can't pass its ceiling", () => {
    const h = H({ difficulty: "minor" });
    const r = computeOvr({ ...base, habits: [h], completions: doneEvery("h", "2026-08-03", "2026-08-30") });
    expect(r.attrs.body!.s).toBe(1);
    expect(r.attrs.body!.a).toBeCloseTo(70 + 29 * (70 / 300));
    expect(r.raw).toBeLessThan(77);
  });
  test("volume ≥ 300 XP/week unlocks 99", () => {
    const hs = [H({ id: "a", difficulty: "major" }), H({ id: "b", difficulty: "standard" })];
    const c = [...doneEvery("a", "2026-08-03", "2026-08-30"), ...doneEvery("b", "2026-08-03", "2026-08-30")];
    expect(computeOvr({ ...base, habits: hs, completions: c }).raw).toBeCloseTo(99);
  });
  test("today counts only when done", () => {
    const h = H();
    const c = doneEvery("h", "2026-08-03", "2026-08-29");
    const r1 = computeOvr({ ...base, habits: [h], completions: c });
    expect(r1.attrs.body!.s).toBe(1);
  });
  test("recent days weigh more (half-life 10 days)", () => {
    const h = H();
    const early = computeOvr({ ...base, habits: [h], completions: doneEvery("h", "2026-08-03", "2026-08-16") });
    const late = computeOvr({ ...base, habits: [h], completions: doneEvery("h", "2026-08-17", "2026-08-30") });
    expect(late.attrs.body!.s).toBeGreaterThan(early.attrs.body!.s);
  });
  test("breadth bonus for 3+ attributes (max +3)", () => {
    const attrs = ["body", "mind", "focus", "social", "craft"] as const;
    const hs = attrs.map((a) => H({ id: a, attribute: a, difficulty: "minor" }));
    const c = attrs.flatMap((a) => doneEvery(a, "2026-08-03", "2026-08-30"));
    const r = computeOvr({ ...base, habits: hs, completions: c });
    expect(r.active).toBe(5);
    expect(r.calc).toBeCloseTo(70 + 29 * (70 / 300) + 3);
  });
  test("archived habits and future habits are ignored", () => {
    const r = computeOvr({ ...base, habits: [H({ archived: true }), H({ id: "f", startDate: "2026-09-01" })], completions: [] });
    expect(r.active).toBe(0);
  });
  test("new habit with no scheduled days yet doesn't drag OVR", () => {
    const r = computeOvr({ ...base, habits: [H({ startDate: "2026-08-30" })], completions: [] });
    expect(r.active).toBe(0);
    expect(r.raw).toBe(55);
  });
  test("calibration: baseline fades over 14 days", () => {
    const h = H({ startDate: "2026-08-23" });
    const c = doneEvery("h", "2026-08-23", "2026-08-30");
    const r = computeOvr({ ...base, startDate: "2026-08-23", habits: [h], completions: c });
    expect(r.alpha).toBeCloseTo(7 / 14);
    expect(r.raw).toBeCloseTo(0.5 * 55 + 0.5 * r.calc);
  });
  test("quit trackers feed Discipline as a daily 20-XP habit; a slip day counts 0", () => {
    const q = { id: "q", creditStart: "2026-08-03", relapseDates: ["2026-08-29"] };
    const r = computeOvr({ ...base, habits: [], completions: [], quit: [q] });
    expect(r.attrs.discipline!.wx).toBe(140);
    expect(r.attrs.discipline!.s).toBeLessThan(1);
    expect(r.attrs.discipline!.s).toBeGreaterThan(0.9);
  });
  test("times-per-week habits count quota slots", () => {
    const h = H({ schedule: { type: "times_per_week", times_per_week: 3 } });
    // weeks of 08-03..08-23 fully done (3/wk), week of 08-24..30: none yet but week ends today → pending
    const dates = ["2026-08-04", "2026-08-05", "2026-08-07", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-18", "2026-08-19", "2026-08-20"];
    const r = computeOvr({ ...base, habits: [h], completions: dates.map((date) => ({ habitId: "h", date, count: 1 })) });
    expect(r.attrs.body!.s).toBe(1);
    // the following Monday the empty week becomes 3 misses
    const r2 = computeOvr({ ...base, today: "2026-08-31", habits: [h], completions: dates.map((date) => ({ habitId: "h", date, count: 1 })) });
    expect(r2.attrs.body!.s).toBeLessThan(0.8);
  });
  test("display attributes blend the quiz rating during calibration", () => {
    const h = H();
    const r = computeOvr({ ...base, startDate: "2026-08-30", ratings: { body: 10 }, habits: [h], completions: doneEvery("h", "2026-08-03", "2026-08-30") });
    expect(r.alpha).toBe(0);
    expect(r.attrs.body!.display).toBe(65);
  });
});
