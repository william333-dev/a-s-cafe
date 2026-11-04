// XP + levels — pure reference implementation, mirrored by the database.
// `Simulator` replays a user's history exactly like the server does
// (log_completion / undo_completion / nightly job) for golden tests.

import { addDays, diffDays, weekStart, type LocalDate } from "../dates";
import {
  DAILY_XP_CAP,
  PERFECT_DAY_XP,
  QUIT_BASE_XP,
  baseXp,
  computeOvr,
  finalOverall,
  habitStreak,
  isScheduledDay,
  perWeek,
  pgRound,
  quitStreak,
  streakMultiplier,
  target,
  type Attribute,
  type CompletionInput,
  type HabitInput,
  type OvrResult,
  type QuitInput,
} from "../rating-engine";

/** XP needed to go from level L−1 to L. */
export function levelNeed(l: number): number {
  return pgRound(50 * Math.pow(l, 1.6));
}

export function levelFor(xp: number): { level: number; into: number; needed: number } {
  let rest = Math.max(0, xp);
  let level = 1;
  for (;;) {
    const needed = levelNeed(level + 1);
    if (rest < needed) return { level, into: rest, needed };
    rest -= needed;
    level++;
  }
}

/** XP for the i-th tap of a habit with a daily target; taps sum to round(base × mult). */
export function incrementXp(base: number, streak: number, countAfter: number, tgt: number): number {
  const m = streakMultiplier(streak);
  return pgRound((base * m * countAfter) / tgt) - pgRound((base * m * (countAfter - 1)) / tgt);
}

export function capAward(raw: number, dayTotal: number, cap = DAILY_XP_CAP): number {
  return Math.max(0, Math.min(raw, cap - dayTotal));
}

// ------------------------------------------------------------------ simulator

type Ledger = {
  id: number;
  amount: number;
  reason: "habit" | "perfect_day" | "quit_day" | "undo";
  ref: string | number | null;
  date: LocalDate;
  createdOn: LocalDate;
};

export class EngineError extends Error {}

export class Simulator {
  habits: HabitInput[] = [];
  completions: CompletionInput[] = [];
  quit: QuitInput[] = [];
  ledger: Ledger[] = [];
  snapshots = new Map<LocalDate, { overall: number; raw: number; ovr: OvrResult }>();
  private seq = 0;

  constructor(
    public baseline: number,
    public startDate: LocalDate,
    public ratings: Partial<Record<Attribute, number>> = {},
  ) {}

  addHabit(h: Omit<HabitInput, "startDate"> & { startDate?: LocalDate }) {
    this.habits.push({ ...h, startDate: h.startDate ?? this.startDate });
  }
  addQuit(id: string, creditStart: LocalDate) {
    this.quit.push({ id, creditStart, relapseDates: [] });
  }
  relapse(id: string, date: LocalDate) {
    this.quit.find((q) => q.id === id)!.relapseDates.push(date);
  }

  dayXp(date: LocalDate) {
    return this.ledger.filter((l) => l.date === date).reduce((a, l) => a + l.amount, 0);
  }
  xpTotal(through?: LocalDate) {
    return this.ledger.filter((l) => !through || l.date <= through).reduce((a, l) => a + l.amount, 0);
  }
  private count(habitId: string, date: LocalDate) {
    return this.completions.find((c) => c.habitId === habitId && c.date === date)?.count ?? 0;
  }
  private push(l: Omit<Ledger, "id">) {
    const row = { ...l, id: ++this.seq };
    this.ledger.push(row);
    return row;
  }

  isPerfectDay(date: LocalDate): boolean {
    const sched = this.habits.filter(
      (h) =>
        !h.archived && h.startDate <= date && h.schedule.type !== "times_per_week" && isScheduledDay(h.schedule, date),
    );
    return sched.length > 0 && sched.every((h) => this.count(h.id, date) >= target(h.schedule));
  }
  private perfectNet(date: LocalDate) {
    const ids = new Set(this.ledger.filter((l) => l.date === date && l.reason === "perfect_day").map((l) => l.id));
    return this.ledger
      .filter((l) => (l.date === date && l.reason === "perfect_day") || (l.reason === "undo" && ids.has(l.ref as number)))
      .reduce((a, l) => a + l.amount, 0);
  }

  log(habitId: string, date: LocalDate, today: LocalDate) {
    const h = this.habits.find((x) => x.id === habitId && !x.archived);
    if (!h) throw new EngineError("habit_not_found");
    if (date !== today && date !== addDays(today, -1)) throw new EngineError("date_out_of_range");
    if (date < h.startDate) throw new EngineError("before_habit_start");
    const tgt = target(h.schedule);
    if (h.schedule.type === "times_per_week") {
      const ws = weekStart(date);
      const wk = this.completions.filter(
        (c) => c.habitId === h.id && c.date >= ws && c.date <= addDays(ws, 6) && c.date !== date,
      ).length;
      if (wk >= perWeek(h.schedule)) throw new EngineError("weekly_target_hit");
    } else if (!isScheduledDay(h.schedule, date)) throw new EngineError("not_scheduled");
    const cnt = this.count(h.id, date);
    if (cnt >= tgt) return { status: "already_done", xp: 0, bonus: 0 };
    const st = habitStreak(h, this.completions, addDays(date, -1), today);
    const xp = incrementXp(baseXp(h.difficulty, h.customXp), st.streak, cnt + 1, tgt);
    const award = capAward(xp, this.dayXp(date));
    const existing = this.completions.find((c) => c.habitId === h.id && c.date === date);
    if (existing) existing.count++;
    else this.completions.push({ habitId: h.id, date, count: 1 });
    this.push({ amount: award, reason: "habit", ref: `${h.id}|${date}`, date, createdOn: today });
    let bonus = 0;
    let perfect = false;
    if (this.isPerfectDay(date) && this.perfectNet(date) === 0) {
      perfect = true;
      bonus = capAward(PERFECT_DAY_XP, this.dayXp(date));
      if (bonus > 0) this.push({ amount: bonus, reason: "perfect_day", ref: null, date, createdOn: today });
    }
    this.snapshot(today);
    return { status: "ok", xp: award, xpRaw: xp, bonus, perfect, streakBefore: st.streak };
  }

  undo(habitId: string, date: LocalDate, today: LocalDate) {
    const c = this.completions.find((x) => x.habitId === habitId && x.date === date);
    if (!c) return { status: "nothing_to_undo" };
    const reversed = new Set(this.ledger.filter((l) => l.reason === "undo").map((l) => l.ref));
    const l = [...this.ledger]
      .reverse()
      .find((x) => x.reason === "habit" && x.ref === `${habitId}|${date}` && x.createdOn === today && !reversed.has(x.id));
    if (!l) throw new EngineError("undo_expired");
    this.push({ amount: -l.amount, reason: "undo", ref: l.id, date, createdOn: today });
    if (c.count <= 1) {
      this.completions = this.completions.filter((x) => x !== c);
      // completion row is deleted server-side; old ledger rows no longer match a live completion
      for (const x of this.ledger) if (x.ref === `${habitId}|${date}`) x.ref = `${habitId}|${date}|dead${x.id}`;
    } else c.count--;
    if (!this.isPerfectDay(date) && this.perfectNet(date) > 0) {
      const pb = this.ledger.find(
        (x) => x.date === date && x.reason === "perfect_day" && x.amount > 0 && x.createdOn === today && !reversed.has(x.id),
      );
      if (pb) this.push({ amount: -pb.amount, reason: "undo", ref: pb.id, date, createdOn: today });
    }
    this.snapshot(today);
    return { status: "ok", xp: -l.amount };
  }

  /** Clean-day XP for a finished day (nightly job). */
  awardQuitDays(date: LocalDate, today: LocalDate) {
    if (date >= today) return;
    for (const q of this.quit) {
      if (q.archived || q.creditStart > date || q.relapseDates.includes(date)) continue;
      if (this.ledger.some((l) => l.reason === "quit_day" && l.ref === q.id && l.date === date)) continue;
      const amt = capAward(pgRound(QUIT_BASE_XP * streakMultiplier(quitStreak(q, addDays(date, -1)))), this.dayXp(date));
      this.push({ amount: amt, reason: "quit_day", ref: q.id, date, createdOn: today });
    }
  }

  snapshot(today: LocalDate) {
    const ovr = computeOvr({
      habits: this.habits,
      completions: this.completions,
      quit: this.quit,
      baseline: this.baseline,
      ratings: this.ratings,
      startDate: this.startDate,
      today,
    });
    const prevKey = [...this.snapshots.keys()].filter((d) => d < today).sort().pop();
    const prev = prevKey ? this.snapshots.get(prevKey)!.overall : null;
    const overall = finalOverall(ovr.raw, prev);
    this.snapshots.set(today, { overall, raw: ovr.raw, ovr });
    return overall;
  }

  /** What the 15-minute job does once a user's local day has started. */
  rollover(today: LocalDate) {
    this.awardQuitDays(addDays(today, -1), today);
    return this.snapshot(today);
  }

  daysSinceStart(today: LocalDate) {
    return diffDays(today, this.startDate);
  }
}
