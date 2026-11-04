import { describe, expect, test } from "vitest";
import { addDays, diffDays, isoDow, isoWeek, localDate, localTime, rangeDays, splitDuration, weekStart } from "@/lib/dates";

describe("dates", () => {
  test("weekday + week maths", () => {
    expect(isoDow("2026-11-02")).toBe(1); // Monday
    expect(isoDow("2026-11-08")).toBe(7);
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(isoWeek("2026-11-03")).toBe("2026-W45");
    expect(isoWeek("2026-12-31")).toBe("2026-W53");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(diffDays("2026-03-01", "2026-02-27")).toBe(2);
    expect(rangeDays("2026-01-30", "2026-02-02")).toHaveLength(4);
  });

  test("NZ daylight saving: no skipped or repeated dates", () => {
    // DST starts 2026-09-27 02:00 NZST → 03:00 NZDT; ends 2027-04-04 03:00 → 02:00
    expect(localDate(new Date("2026-09-26T13:59:00Z"), "Pacific/Auckland")).toBe("2026-09-27"); // 01:59 NZST
    expect(localTime(new Date("2026-09-26T14:00:00Z"), "Pacific/Auckland")).toBe("03:00"); // jumped
    expect(localDate(new Date("2026-09-27T10:59:00Z"), "Pacific/Auckland")).toBe("2026-09-27"); // 23:59 NZDT
    expect(localDate(new Date("2026-09-27T11:00:00Z"), "Pacific/Auckland")).toBe("2026-09-28");
    expect(localDate(new Date("2027-04-03T13:30:00Z"), "Pacific/Auckland")).toBe("2027-04-04");
    // 23:30 local every night across the switch → consecutive dates
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const date = addDays("2026-09-23", i);
      const off = date >= "2026-09-27" ? 13 : 12;
      seen.push(localDate(new Date(new Date(`${date}T23:30:00Z`).getTime() - off * 3.6e6), "Pacific/Auckland"));
    }
    expect(seen).toEqual(rangeDays("2026-09-23", "2026-10-02"));
  });

  test("timezone changes shift the local date, not stored dates", () => {
    const t = new Date("2026-11-03T02:00:00Z");
    expect(localDate(t, "Pacific/Auckland")).toBe("2026-11-03");
    expect(localDate(t, "America/Los_Angeles")).toBe("2026-11-02");
    expect(localDate(t, "Europe/London")).toBe("2026-11-03");
  });

  test("duration split for quit counters", () => {
    expect(splitDuration(((3 * 24 + 4) * 60 + 5) * 60_000 + 9000)).toEqual({ d: 3, h: 4, m: 5, s: 9 });
    expect(splitDuration(-5)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
});
