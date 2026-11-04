import { describe, expect, test } from "vitest";
import { describeSchedule, HABIT_PACKS, HABIT_TEMPLATES, templateByTitle, templateRow } from "@/lib/habit-templates";
import { ATTRIBUTES } from "@/lib/rating-engine";

describe("habit templates", () => {
  test("plenty to pick from, in every attribute", () => {
    expect(HABIT_TEMPLATES.length).toBeGreaterThanOrEqual(60);
    for (const a of ATTRIBUTES) expect(HABIT_TEMPLATES.filter((t) => t.attribute === a).length, a).toBeGreaterThanOrEqual(8);
  });
  test("every template satisfies the habits table constraints", () => {
    const titles = new Set<string>();
    for (const t of HABIT_TEMPLATES) {
      expect(titles.has(t.title.toLowerCase()), `duplicate ${t.title}`).toBe(false);
      titles.add(t.title.toLowerCase());
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.title.length).toBeLessThanOrEqual(60);
      expect([...t.emoji].length).toBeLessThanOrEqual(16);
      const s = t.schedule;
      const tpd = s.target_per_day ?? 1;
      expect(tpd).toBeGreaterThanOrEqual(1);
      expect(tpd).toBeLessThanOrEqual(20);
      if (s.type === "weekdays") {
        expect(s.days!.length).toBeGreaterThanOrEqual(1);
        expect(s.days!.every((d) => d >= 1 && d <= 7)).toBe(true);
      }
      if (s.type === "times_per_week") expect(s.times_per_week).toBeGreaterThanOrEqual(1);
      if (t.time) expect(t.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(templateRow(t).custom_xp).toBeNull();
    }
  });
  test("packs only reference real templates", () => {
    for (const p of HABIT_PACKS) for (const h of p.habits) expect(templateByTitle(h), `${p.key}: ${h}`).toBeTruthy();
  });
  test("schedule labels", () => {
    expect(describeSchedule({ type: "daily", target_per_day: 8 })).toBe("Daily · 8× a day");
    expect(describeSchedule({ type: "weekdays", days: [1, 2, 3, 4, 5] })).toBe("Weekdays");
    expect(describeSchedule({ type: "weekdays", days: [7] })).toBe("Sun");
    expect(describeSchedule({ type: "times_per_week", times_per_week: 3 })).toBe("3× a week");
  });
});
