// Ten golden personas. Each is replayed through the TS Simulator (unit tests)
// and through the real database RPCs (tests/db/parity.test.ts); both must agree.

import { addDays, localDate, type LocalDate } from "../../lib/dates";
import type { Attribute, Difficulty, Schedule } from "../../lib/rating-engine";

export type PersonaHabit = {
  key: string;
  title: string;
  attribute: Attribute;
  difficulty: Difficulty;
  customXp?: number;
  schedule: Schedule;
  /** day index the habit is created (default 0) */
  createdDay?: number;
};

export type DayActions = {
  log?: string[];
  logYesterday?: string[];
  undo?: string[];
  undoYesterday?: string[];
  relapse?: string[];
  /** change profile timezone before this day's actions */
  setTz?: string;
};

export type Persona = {
  name: string;
  baseline: number;
  ratings?: Partial<Record<Attribute, number>>;
  tz: string;
  start: LocalDate;
  days: number;
  habits: PersonaHabit[];
  quit?: string[];
  /** wall-clock instant for day i (defaults to `${date}T00:00:00Z`) */
  instant?: (i: number, date: LocalDate) => Date;
  plan: (i: number, date: LocalDate) => DayActions;
};

const daily = (target_per_day = 1): Schedule => ({ type: "daily", target_per_day });

export const START = "2026-08-03"; // a Monday

export function dayInstant(p: Persona, i: number): Date {
  const date = addDays(p.start, i);
  return p.instant ? p.instant(i, date) : new Date(`${date}T00:00:00Z`);
}

/** The local "today" a persona sees on day i — recomputed from the instant + current tz. */
export function personaTimeline(p: Persona): { i: number; instant: Date; tz: string }[] {
  let tz = p.tz;
  const out = [];
  for (let i = 0; i < p.days; i++) {
    const a = p.plan(i, addDays(p.start, i));
    if (a.setTz) tz = a.setTz;
    out.push({ i, instant: dayInstant(p, i), tz });
  }
  return out;
}
export const todayFor = (instant: Date, tz: string) => localDate(instant, tz);

export const PERSONAS: Persona[] = [
  {
    name: "day1",
    baseline: 54,
    ratings: { body: 6, focus: 4 },
    tz: "Pacific/Auckland",
    start: START,
    days: 1,
    habits: [
      { key: "gym", title: "Gym", attribute: "body", difficulty: "major", schedule: daily() },
      { key: "read", title: "Read 10 pages", attribute: "mind", difficulty: "standard", schedule: daily() },
    ],
    plan: () => ({ log: ["gym", "read"] }),
  },
  {
    name: "perfect28",
    baseline: 55,
    tz: "Pacific/Auckland",
    start: START,
    days: 28,
    habits: [
      { key: "gym", title: "Gym", attribute: "body", difficulty: "major", schedule: daily() },
      { key: "walk", title: "10k steps", attribute: "body", difficulty: "standard", schedule: daily() },
      { key: "deep", title: "Deep work", attribute: "focus", difficulty: "major", schedule: daily(2) },
      { key: "read", title: "Read", attribute: "mind", difficulty: "standard", schedule: daily() },
      { key: "call", title: "Call a mate", attribute: "social", difficulty: "minor", schedule: { type: "times_per_week", times_per_week: 3 } },
    ],
    plan: (i, date) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 1 = Mon
      const log = ["gym", "walk", "deep", "deep", "read"];
      if (dow === 1 || dow === 3 || dow === 5) log.push("call");
      return { log };
    },
  },
  {
    name: "one_trivial_habit",
    baseline: 50,
    tz: "Pacific/Auckland",
    start: START,
    days: 30,
    habits: [{ key: "water", title: "Drink water", attribute: "body", difficulty: "minor", schedule: daily() }],
    plan: () => ({ log: ["water"] }),
  },
  {
    name: "weekend_only",
    baseline: 52,
    tz: "Pacific/Auckland",
    start: START,
    days: 21,
    habits: [
      { key: "hike", title: "Hike", attribute: "body", difficulty: "major", schedule: { type: "weekdays", days: [6, 7] } },
      { key: "jam", title: "Guitar", attribute: "craft", difficulty: "standard", schedule: { type: "weekdays", days: [6, 7] } },
    ],
    plan: (_i, date) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      return dow === 0 || dow === 6 ? { log: ["hike", "jam"] } : {};
    },
  },
  {
    name: "relapse",
    baseline: 50,
    tz: "Pacific/Auckland",
    start: START,
    days: 20,
    habits: [{ key: "med", title: "Meditate", attribute: "mind", difficulty: "standard", schedule: daily() }],
    quit: ["vape"],
    plan: (i) => ({ log: ["med"], relapse: i === 9 || i === 10 ? ["vape"] : [] }),
  },
  {
    name: "shield_use",
    baseline: 55,
    tz: "Pacific/Auckland",
    start: START,
    days: 24,
    habits: [{ key: "run", title: "Run", attribute: "body", difficulty: "standard", schedule: daily() }],
    // done 14 days (earns 2 shields), misses day 14 and 15, back from day 16 → streak survives
    plan: (i) => (i === 14 || i === 15 ? {} : { log: ["run"] }),
  },
  {
    name: "timezone_change",
    baseline: 56,
    tz: "Pacific/Auckland",
    start: START,
    days: 12,
    habits: [{ key: "code", title: "Ship code", attribute: "craft", difficulty: "major", schedule: daily() }],
    // day 6: moves to LA — local "today" jumps back a day; logging again must not double-award
    plan: (i) => (i === 6 ? { setTz: "America/Los_Angeles", log: ["code"] } : { log: ["code"] }),
  },
  {
    name: "nz_dst_switch",
    baseline: 53,
    tz: "Pacific/Auckland",
    start: "2026-09-21", // DST starts Sun 2026-09-27 02:00 → 03:00
    days: 14,
    habits: [
      { key: "journal", title: "Plan tomorrow", attribute: "focus", difficulty: "minor", schedule: daily() },
      { key: "stretch", title: "Stretch", attribute: "body", difficulty: "standard", schedule: daily() },
    ],
    // 23:30 local every night, straddling the switch (UTC offset +12 → +13)
    instant: (_i, date) => {
      const off = date >= "2026-09-27" ? 13 : 12;
      const d = new Date(`${date}T23:30:00Z`);
      return new Date(d.getTime() - off * 3_600_000);
    },
    plan: (i) => ({ log: ["journal", "stretch"], logYesterday: i === 7 ? [] : [] }),
  },
  {
    name: "cap_hit",
    baseline: 60,
    tz: "Pacific/Auckland",
    start: START,
    days: 3,
    habits: Array.from({ length: 12 }, (_, n) => ({
      key: `h${n}`,
      title: `Big habit ${n + 1}`,
      attribute: (["body", "mind", "focus", "discipline", "social", "craft"] as const)[n % 6],
      difficulty: "custom" as const,
      customXp: 50,
      schedule: daily(),
    })),
    plan: () => ({ log: Array.from({ length: 12 }, (_, n) => `h${n}`) }),
  },
  {
    name: "undo",
    baseline: 55,
    tz: "Pacific/Auckland",
    start: START,
    days: 4,
    habits: [
      { key: "a", title: "Cold shower", attribute: "discipline", difficulty: "standard", schedule: daily() },
      { key: "b", title: "No phone in bed", attribute: "discipline", difficulty: "minor", schedule: daily() },
    ],
    plan: (i) => {
      if (i === 0) return { log: ["a", "b"], undo: ["b"] }; // perfect-day bonus reversed too
      if (i === 1) return { logYesterday: ["b"], log: ["a", "b"] }; // late log for yesterday
      if (i === 2) return { log: ["a"], undoYesterday: ["b"] }; // yesterday's tap logged yesterday → expired
      return { log: ["a", "b"] };
    },
  },
];
