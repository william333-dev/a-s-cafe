import { addDays, type LocalDate } from "../../lib/dates";
import { EngineError, Simulator } from "../../lib/xp-engine";
import { personaTimeline, todayFor, type Persona } from "./personas";

export type DayResult = {
  i: number;
  today: LocalDate;
  overall: number;
  raw: number;
  xpTotal: number;
  events: { op: string; key: string; status: string; xp?: number; bonus?: number }[];
};

export function runSim(p: Persona): { sim: Simulator; days: DayResult[] } {
  const sim = new Simulator(p.baseline, todayFor(personaTimeline(p)[0].instant, p.tz), p.ratings ?? {});
  const days: DayResult[] = [];
  for (const { i, instant, tz } of personaTimeline(p)) {
    const today = todayFor(instant, tz);
    sim.rollover(today);
    for (const h of p.habits)
      if ((h.createdDay ?? 0) === i)
        sim.addHabit({
          id: h.key,
          attribute: h.attribute,
          difficulty: h.difficulty,
          customXp: h.customXp ?? null,
          schedule: h.schedule,
          startDate: today,
        });
    if (i === 0) for (const q of p.quit ?? []) sim.addQuit(q, today);

    const a = p.plan(i, addDays(p.start, i));
    const events: DayResult["events"] = [];
    const run = (op: string, key: string, fn: () => { status: string; xp?: number; bonus?: number }) => {
      try {
        const r = fn();
        events.push({ op, key, status: r.status, xp: r.xp, bonus: r.bonus });
      } catch (e) {
        if (e instanceof EngineError) events.push({ op, key, status: e.message });
        else throw e;
      }
    };
    for (const k of a.relapse ?? []) {
      sim.relapse(k, today);
      events.push({ op: "relapse", key: k, status: "ok" });
    }
    for (const k of a.logYesterday ?? []) run("logY", k, () => sim.log(k, addDays(today, -1), today));
    for (const k of a.log ?? []) run("log", k, () => sim.log(k, today, today));
    for (const k of a.undo ?? []) run("undo", k, () => sim.undo(k, today, today));
    for (const k of a.undoYesterday ?? []) run("undoY", k, () => sim.undo(k, addDays(today, -1), today));
    sim.snapshot(today);
    const snap = sim.snapshots.get(today)!;
    days.push({ i, today, overall: snap.overall, raw: snap.raw, xpTotal: sim.xpTotal(), events });
  }
  return { sim, days };
}
