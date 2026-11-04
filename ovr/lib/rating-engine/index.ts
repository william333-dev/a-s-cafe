// OVR rating engine — pure, deterministic reference implementation.
// The database (supabase/migrations/*_engine.sql) is authoritative in production;
// tests/db/parity.test.ts proves both produce identical numbers.
// Plain-English spec: docs/rating-formula.md

import {
  addDays,
  diffDays,
  isoDow,
  maxDate,
  minDate,
  rangeDays,
  weekStart,
  type LocalDate,
} from "../dates";

export const ATTRIBUTES = ["body", "mind", "focus", "discipline", "social", "craft"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Difficulty = "minor" | "standard" | "major" | "custom";

export type Schedule = {
  type: "daily" | "weekdays" | "times_per_week";
  /** ISO weekdays, 1 = Mon … 7 = Sun (weekdays type) */
  days?: number[];
  times_per_week?: number;
  target_per_day?: number;
};

export type HabitInput = {
  id: string;
  attribute: Attribute;
  difficulty: Difficulty;
  customXp?: number | null;
  schedule: Schedule;
  startDate: LocalDate;
  archived?: boolean;
};

export type CompletionInput = { habitId: string; date: LocalDate; count: number };

export type QuitInput = { id: string; creditStart: LocalDate; relapseDates: LocalDate[]; archived?: boolean };

export const QUIT_BASE_XP = 20; // quit trackers count as a daily standard habit
export const DAILY_XP_CAP = 500;
export const PERFECT_DAY_XP = 25;
export const MAX_DAILY_MOVE = 3;

/** Mirrors Postgres round(x::numeric): float8→numeric keeps 15 significant digits, ties away from zero. */
export function pgRound(x: number): number {
  const v = Number(x.toPrecision(15));
  return Math.sign(v) * Math.round(Math.abs(v));
}

export function baseXp(d: Difficulty, customXp?: number | null): number {
  switch (d) {
    case "minor":
      return 10;
    case "standard":
      return 20;
    case "major":
      return 35;
    default:
      return customXp ?? 20;
  }
}

export function target(s: Schedule): number {
  return Math.max(1, s.target_per_day ?? 1);
}

export function isScheduledDay(s: Schedule, d: LocalDate): boolean {
  if (s.type === "daily") return true;
  if (s.type === "weekdays") return (s.days ?? []).includes(isoDow(d));
  return false;
}

export function perWeek(s: Schedule): number {
  if (s.type === "daily") return 7;
  if (s.type === "weekdays") return (s.days ?? []).length;
  return s.times_per_week ?? 1;
}

/** Prorated weekly quota when a week is cut short (habit start / window start). */
export function nEff(n: number, avail: number): number {
  return Math.min(n, Math.ceil((n * avail) / 7));
}

export function streakMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(streak, 0), 30) * 0.01;
}

// ------------------------------------------------------------------ streaks

export type StreakState = {
  streak: number;
  shields: number;
  shieldsUsed: number;
  best: number;
  lastShieldDate: LocalDate | null;
};

function countMap(completions: CompletionInput[], habitId: string): Map<LocalDate, number> {
  const m = new Map<LocalDate, number>();
  for (const c of completions) if (c.habitId === habitId) m.set(c.date, c.count);
  return m;
}

/**
 * Streak of scheduled days done through `through`. Days before `today` are final:
 * a miss uses a shield (streak survives) or resets. `today` is pending until done.
 * Shields: +1 every 7 streak days, max 2.
 */
export function habitStreak(
  h: HabitInput,
  completions: CompletionInput[],
  through: LocalDate,
  today: LocalDate,
): StreakState {
  const st: StreakState = { streak: 0, shields: 0, shieldsUsed: 0, best: 0, lastShieldDate: null };
  if (through < h.startDate) return st;
  const counts = countMap(completions, h.id);
  const tgt = target(h.schedule);
  const hit = () => {
    st.streak++;
    st.best = Math.max(st.best, st.streak);
    if (st.streak % 7 === 0) st.shields = Math.min(2, st.shields + 1);
  };
  const miss = (d: LocalDate) => {
    if (st.shields > 0) {
      st.shields--;
      st.shieldsUsed++;
      st.lastShieldDate = d;
    } else st.streak = 0;
  };

  if (h.schedule.type !== "times_per_week") {
    for (const d of rangeDays(h.startDate, through)) {
      if (!isScheduledDay(h.schedule, d)) continue;
      if ((counts.get(d) ?? 0) >= tgt) hit();
      else if (d < today) miss(d);
    }
  } else {
    const n = perWeek(h.schedule);
    for (let ws = weekStart(h.startDate); ws <= weekStart(through); ws = addDays(ws, 7)) {
      const we = addDays(ws, 6);
      const lo = maxDate(ws, h.startDate);
      const ne = nEff(n, diffDays(we, lo) + 1);
      let done = 0;
      for (const d of rangeDays(lo, minDate(we, through))) {
        if ((counts.get(d) ?? 0) >= tgt) {
          done++;
          hit();
        }
      }
      if (we < today && we <= through && done < ne) miss(we);
    }
  }
  return st;
}

/** Consecutive clean days ending at `through` (inclusive). */
export function quitStreak(q: QuitInput, through: LocalDate): number {
  const slips = new Set(q.relapseDates);
  let s = 0;
  for (let d = through; d >= q.creditStart && !slips.has(d) && s < 400; d = addDays(d, -1)) s++;
  return s;
}

// ------------------------------------------------------------------ OVR

export type AttrResult = { s: number; wx: number; a: number; display: number; done7: number; sched7: number };

export type OvrResult = {
  raw: number;
  calc: number;
  alpha: number;
  baseline: number;
  active: number;
  attrs: Partial<Record<Attribute, AttrResult>>;
};

export type OvrInput = {
  habits: HabitInput[];
  completions: CompletionInput[];
  quit?: QuitInput[];
  baseline: number;
  /** setup-quiz self ratings 1–10 per attribute (optional) */
  ratings?: Partial<Record<Attribute, number>>;
  startDate: LocalDate;
  today: LocalDate;
};

export function computeOvr(inp: OvrInput): OvrResult {
  const { today } = inp;
  const num = [0, 0, 0, 0, 0, 0];
  const den = [0, 0, 0, 0, 0, 0];
  const wx = [0, 0, 0, 0, 0, 0];
  const done7 = [0, 0, 0, 0, 0, 0];
  const sched7 = [0, 0, 0, 0, 0, 0];
  const winFrom = addDays(today, -27);
  const w = (d: LocalDate) => Math.pow(0.5, diffDays(today, d) / 10);
  const recent = (d: LocalDate) => d > addDays(today, -7);

  for (const h of inp.habits) {
    if (h.archived || h.startDate > today) continue;
    const b = baseXp(h.difficulty, h.customXp);
    const tgt = target(h.schedule);
    const k = ATTRIBUTES.indexOf(h.attribute);
    const counts = countMap(inp.completions, h.id);
    const lo = maxDate(winFrom, h.startDate);
    let hn = 0;
    let hd = 0;
    if (h.schedule.type !== "times_per_week") {
      for (const d of rangeDays(lo, today)) {
        if (!isScheduledDay(h.schedule, d)) continue;
        const cnt = counts.get(d) ?? 0;
        if (d === today && cnt < tgt) continue;
        const cc = Math.min(cnt / tgt, 1);
        hn += w(d) * b * cc;
        hd += w(d) * b;
        if (recent(d)) {
          sched7[k] += 1;
          done7[k] += cc;
        }
      }
    } else {
      const n = perWeek(h.schedule);
      for (let ws = weekStart(lo); ws <= weekStart(today); ws = addDays(ws, 7)) {
        const we = addDays(ws, 6);
        const from = maxDate(ws, lo);
        const ne = nEff(n, diffDays(we, from) + 1);
        let filled = 0;
        for (const d of rangeDays(from, minDate(we, today))) {
          if (filled >= ne) break;
          const cnt = counts.get(d) ?? 0;
          if (cnt <= 0) continue;
          if (d === today && cnt < tgt) continue;
          const cc = Math.min(cnt / tgt, 1);
          hn += w(d) * b * cc;
          hd += w(d) * b;
          filled++;
          if (recent(d)) {
            sched7[k] += 1;
            done7[k] += cc;
          }
        }
        if (we < today && ne > filled) {
          hd += (ne - filled) * w(we) * b;
          if (recent(we)) sched7[k] += ne - filled;
        }
      }
    }
    if (hd > 0) {
      num[k] += hn;
      den[k] += hd;
      wx[k] += b * perWeek(h.schedule);
    }
  }

  const kd = ATTRIBUTES.indexOf("discipline");
  for (const q of inp.quit ?? []) {
    if (q.archived || !(q.creditStart < today)) continue;
    const slips = new Set(q.relapseDates);
    let hn = 0;
    let hd = 0;
    for (const d of rangeDays(maxDate(winFrom, q.creditStart), addDays(today, -1))) {
      const cc = slips.has(d) ? 0 : 1;
      hn += w(d) * QUIT_BASE_XP * cc;
      hd += w(d) * QUIT_BASE_XP;
      if (recent(d)) {
        sched7[kd] += 1;
        done7[kd] += cc;
      }
    }
    if (hd > 0) {
      num[kd] += hn;
      den[kd] += hd;
      wx[kd] += QUIT_BASE_XP * 7;
    }
  }

  const alpha = Math.min(Math.max(diffDays(today, inp.startDate) / 14, 0), 1);
  const attrs: OvrResult["attrs"] = {};
  let active = 0;
  let sumWx = 0;
  let acc = 0;
  ATTRIBUTES.forEach((name, k) => {
    if (den[k] <= 0) return;
    const s = num[k] / den[k];
    const v = Math.min(1, wx[k] / 300);
    const ceil = 70 + 29 * v;
    const a = 40 + (ceil - 40) * s;
    active++;
    sumWx += wx[k];
    acc += a * wx[k];
    const r = inp.ratings?.[name];
    const bk = r != null ? 45 + ((r - 1) / 9) * 20 : inp.baseline;
    attrs[name] = { s, wx: wx[k], a, display: pgRound((1 - alpha) * bk + alpha * a), done7: done7[k], sched7: sched7[k] };
  });
  const calc =
    active === 0 ? inp.baseline : Math.min(99, Math.max(40, acc / sumWx + Math.min(3, Math.max(0, active - 2))));
  const raw = (1 - alpha) * inp.baseline + alpha * calc;
  return { raw, calc, alpha, baseline: inp.baseline, active, attrs };
}

/** Round, cap movement at ±3/day vs the previous snapshot, clamp 40–99. */
export function finalOverall(raw: number, prevOverall: number | null): number {
  let o = pgRound(raw);
  if (prevOverall != null) o = Math.max(prevOverall - MAX_DAILY_MOVE, Math.min(prevOverall + MAX_DAILY_MOVE, o));
  return Math.max(40, Math.min(99, o));
}

/** Baseline B from setup-quiz self ratings (1–10) → 45–65. */
export function baselineFromRatings(ratings: Partial<Record<Attribute, number>>): number {
  const vals = Object.values(ratings).filter((v): v is number => typeof v === "number");
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 5.5;
  return Math.max(45, Math.min(65, pgRound(45 + ((avg - 1) / 9) * 20)));
}

// ------------------------------------------------------------------ ranks
// 9 tiers; every tier except Apex has divisions I–III (25 ranks in total).
// `mins` are the OVR needed for division I, II, III.

export const TIERS = [
  { key: "rookie", label: "Rookie", mins: [40, 44, 47] },
  { key: "bronze", label: "Bronze", mins: [50, 53, 56] },
  { key: "silver", label: "Silver", mins: [60, 63, 66] },
  { key: "gold", label: "Gold", mins: [70, 72, 74] },
  { key: "platinum", label: "Platinum", mins: [76, 78, 80] },
  { key: "diamond", label: "Diamond", mins: [82, 84, 86] },
  { key: "master", label: "Master", mins: [88, 89, 90] },
  { key: "legend", label: "Legend", mins: [91, 92, 93] },
  { key: "apex", label: "Apex", mins: [95] },
] as const;
export type RankKey = (typeof TIERS)[number]["key"];

export type Rank = {
  /** tier key (drives colours and emblem) */
  key: RankKey;
  tier: string;
  /** 1–3, or null for single-division tiers (Apex) */
  division: 1 | 2 | 3 | null;
  /** e.g. "Gold II" */
  label: string;
  min: number;
  /** position on the ladder, 0 = Rookie I */
  index: number;
};

const ROMAN = ["I", "II", "III"] as const;

export const RANKS: Rank[] = TIERS.flatMap((t) =>
  t.mins.map((min, i) => ({
    key: t.key,
    tier: t.label,
    division: t.mins.length > 1 ? ((i + 1) as 1 | 2 | 3) : null,
    label: t.mins.length > 1 ? `${t.label} ${ROMAN[i]}` : t.label,
    min,
    index: 0,
  })),
).map((r, index) => ({ ...r, index }));

export function rankFor(ovr: number): Rank {
  let r = RANKS[0];
  for (const x of RANKS) if (ovr >= x.min) r = x;
  return r;
}

export function nextRank(ovr: number) {
  const r = RANKS.find((x) => x.min > ovr);
  return r ? { ...r, pointsToGo: r.min - ovr } : null;
}

/** "tier" when a whole new tier is reached, "division" for I→II etc., null otherwise. */
export function rankChange(prevOvr: number, ovr: number): "tier" | "division" | null {
  const a = rankFor(prevOvr);
  const b = rankFor(ovr);
  if (b.index <= a.index) return null;
  return a.key === b.key ? "division" : "tier";
}

/** Share (0–1) of members whose best-ever OVR reaches each rank. */
export function ladderReach(bests: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of RANKS) out.set(r.index, bests.length ? bests.filter((b) => b >= r.min).length / bests.length : 0);
  return out;
}
