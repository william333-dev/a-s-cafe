"use client";
import { motion } from "motion/react";
import { useRef } from "react";
import { ATTRIBUTE_META, copy } from "@/lib/copy";
import { streakMultiplier } from "@/lib/rating-engine";
import type { HabitState } from "@/lib/types";
import { StreakFlame } from "./streak-flame";

type Props = {
  habit: HabitState;
  count: number;
  onTap: () => void;
  onUndo: () => void;
  undoable: boolean;
  dim?: boolean;
};

/** Tap to complete. Long-press to undo. */
export function HabitRow({ habit, count, onTap, onUndo, undoable, dim }: Props) {
  const done = count >= habit.target;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const xp = Math.round(habit.base_xp * streakMultiplier(habit.streak));
  const weekly = habit.schedule.type === "times_per_week";

  const down = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      if (count > 0 && undoable) onUndo();
    }, 550);
  };
  const up = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const click = () => {
    if (longPressed.current) return;
    if (!done) onTap();
  };

  return (
    <motion.button
      layout
      type="button"
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      onClick={click}
      whileTap={{ scale: 0.98 }}
      className={`no-select relative flex min-h-16 w-full items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-colors ${
        done ? "border-ember/40 bg-ember/10" : "border-stroke bg-surface active:bg-raised"
      } ${dim ? "opacity-50" : ""}`}
      aria-pressed={done}
      aria-label={`${habit.title}${done ? ", done" : ""}`}
      data-testid="habit-row"
      data-habit={habit.title}
      data-done={done}
    >
      {habit.target > 1 && count > 0 && !done && (
        <motion.div className="absolute inset-y-0 left-0 bg-ember/10" initial={false} animate={{ width: `${(count / habit.target) * 100}%` }} />
      )}
      <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-raised text-2xl">{habit.emoji}</span>
      <span className="relative min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-semibold ${done ? "text-fg" : ""}`}>{habit.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>{ATTRIBUTE_META[habit.attribute].label}</span>
          {weekly && <span className="tnum">· {copy.today.weekly(habit.week_done, habit.per_week)}</span>}
          {habit.target > 1 && <span className="tnum">· {count}/{habit.target}</span>}
          <StreakFlame days={habit.streak} shields={habit.shields} />
        </span>
      </span>
      <span className="relative flex shrink-0 items-center">
        {done ? (
          <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 600, damping: 18 }} className="grid size-9 place-items-center rounded-full bg-ember text-black">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </motion.span>
        ) : (
          <span className="font-display tnum rounded-lg border border-stroke px-2 py-1 text-sm text-ember">+{habit.target > 1 ? Math.round(xp / habit.target) : xp}</span>
        )}
      </span>
    </motion.button>
  );
}
