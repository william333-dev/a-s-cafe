"use client";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { buzz } from "@/lib/haptics";

/** Hold for `ms` to confirm — ring fills, Ember glow builds, vibrates on lock. */
export function HoldToLockInButton({ onComplete, label, ms = 1500, doneLabel }: { onComplete: () => void; label: string; ms?: number; doneLabel?: string }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);
  const reduce = useReducedMotion();

  const tick = (t: number) => {
    if (start.current == null) start.current = t;
    const p = Math.min(1, (t - start.current) / ms);
    setProgress(p);
    if (p >= 1) {
      setDone(true);
      buzz([30, 50, 80]);
      onComplete();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (done) return;
    buzz(10);
    start.current = null;
    raf.current = requestAnimationFrame(tick);
  };
  const cancel = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (!done) setProgress(0);
  };
  useEffect(() => () => cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const R = 72;
  const C = 2 * Math.PI * R;
  return (
    <button
      type="button"
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && begin()}
      onKeyUp={cancel}
      className="no-select relative grid size-48 touch-none place-items-center rounded-full"
      aria-label={label}
      data-testid="hold-to-lock-in"
      data-progress={progress.toFixed(2)}
    >
      <motion.div
        className="absolute inset-4 rounded-full bg-ember"
        animate={{ opacity: 0.15 + progress * 0.85, scale: reduce ? 1 : 0.9 + progress * 0.1 }}
        style={{ boxShadow: `0 0 ${20 + progress * 80}px ${progress * 30}px rgba(255,106,26,${0.2 + progress * 0.5})` }}
      />
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#2A2A33" strokeWidth="8" />
        <circle cx="80" cy="80" r={R} fill="none" stroke="#FF6A1A" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      <span className={`font-display relative text-xl uppercase tracking-widest ${progress > 0.5 ? "text-black" : "text-fg"}`}>{done ? (doneLabel ?? "✓") : label}</span>
    </button>
  );
}
