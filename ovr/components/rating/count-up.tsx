"use client";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Numeral that counts up/down to its new value. */
export function CountUp({ value, className = "", duration = 0.9 }: { value: number; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduce || prev.current === value) {
      setShown(value);
      prev.current = value;
      return;
    }
    const c = animate(prev.current, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce, duration]);
  return <span className={`tnum ${className}`}>{shown}</span>;
}
