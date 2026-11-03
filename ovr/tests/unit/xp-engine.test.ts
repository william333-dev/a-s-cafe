import { describe, expect, test } from "vitest";
import { capAward, incrementXp, levelFor, levelNeed, Simulator } from "@/lib/xp-engine";

describe("levels", () => {
  test("XP from L−1 to L = round(50 × L^1.6)", () => {
    expect(levelNeed(2)).toBe(152);
    expect(levelNeed(10)).toBe(1991); // 50 × 39.81 = 1990.5 → 1991
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 152 });
    expect(levelFor(151).level).toBe(1);
    expect(levelFor(152)).toMatchObject({ level: 2, into: 0 });
    expect(levelFor(152 + levelNeed(3))).toMatchObject({ level: 3, into: 0 });
  });
});

describe("xp", () => {
  test("multi-count habits split XP so taps sum exactly", () => {
    const parts = [1, 2, 3].map((i) => incrementXp(35, 12, i, 3));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(Math.round(35 * 1.12));
    expect(incrementXp(20, 0, 1, 1)).toBe(20);
    expect(incrementXp(20, 30, 1, 1)).toBe(26);
  });
  test("cap", () => {
    expect(capAward(50, 480)).toBe(20);
    expect(capAward(50, 500)).toBe(0);
    expect(capAward(50, 10)).toBe(50);
  });
  test("only today and yesterday can be logged", () => {
    const s = new Simulator(55, "2026-08-03");
    s.addHabit({ id: "a", attribute: "body", difficulty: "standard", schedule: { type: "daily" } });
    expect(() => s.log("a", "2026-08-01", "2026-08-05")).toThrow("date_out_of_range");
    expect(() => s.log("a", "2026-08-06", "2026-08-05")).toThrow("date_out_of_range");
    expect(s.log("a", "2026-08-04", "2026-08-05").status).toBe("ok");
    expect(() => s.log("a", "2026-08-02", "2026-08-03")).toThrow("before_habit_start");
  });
  test("unscheduled days and full weekly quotas are rejected", () => {
    const s = new Simulator(55, "2026-08-03");
    s.addHabit({ id: "w", attribute: "body", difficulty: "standard", schedule: { type: "weekdays", days: [6] } });
    s.addHabit({ id: "t", attribute: "body", difficulty: "standard", schedule: { type: "times_per_week", times_per_week: 1 } });
    expect(() => s.log("w", "2026-08-03", "2026-08-03")).toThrow("not_scheduled");
    s.log("t", "2026-08-03", "2026-08-03");
    expect(() => s.log("t", "2026-08-04", "2026-08-04")).toThrow("weekly_target_hit");
  });
  test("streak multiplier applies from the streak before the tap", () => {
    const s = new Simulator(55, "2026-08-03");
    s.addHabit({ id: "a", attribute: "body", difficulty: "standard", schedule: { type: "daily" } });
    const xs = [];
    for (let i = 0; i < 12; i++) {
      const d = `2026-08-${String(3 + i).padStart(2, "0")}`;
      s.rollover(d);
      xs.push(s.log("a", d, d).xp);
    }
    expect(xs.slice(0, 3)).toEqual([20, 20, 20]); // 20×1.01 → 20, 20×1.02 → 20
    expect(xs[10]).toBe(22); // streak 10 → 20 × 1.10
  });
});
