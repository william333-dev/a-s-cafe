"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo } from "react";
import { rankFor } from "@/lib/rating-engine";
import { RANK_GRADIENT } from "@/lib/rank-style";
import { RankEmblem } from "./rank-emblem";
import { useSync } from "../sync";

const COLORS = ["#FF6A1A", "#5AC8FA", "#2FD27A", "#FFD66B", "#F5F5F7", "#FF2D55"];
// deterministic pseudo-random so renders stay pure
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Particles({ n = 70, spread = 1 }: { n?: number; spread?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        i,
        x: (rand(i, 1) - 0.5) * 360 * spread,
        y: -(rand(i, 2) * 380 + 120) * spread,
        r: rand(i, 3) * 720 - 360,
        c: COLORS[i % COLORS.length],
        s: rand(i, 4) * 6 + 6,
        d: rand(i, 5) * 0.25,
      })),
    [n, spread],
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2">
      {parts.map((p) => (
        <motion.span
          key={p.i}
          className="absolute block rounded-[2px]"
          style={{ width: p.s, height: p.s * 0.45, background: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 520], opacity: [1, 1, 0], rotate: p.r }}
          transition={{ duration: 1.8, delay: p.d, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/** Confetti on perfect day; 1.2s card flip with particles on rank-up. */
export function Celebrations() {
  const { celebration, clearCelebration } = useSync();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(clearCelebration, celebration.kind === "rankup" ? 2600 : 2000);
    return () => clearTimeout(t);
  }, [celebration, clearCelebration]);

  return (
    <AnimatePresence>
      {celebration?.kind === "perfect" && !reduce && (
        <motion.div key="perfect" className="pointer-events-none fixed inset-0 z-40" initial={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="confetti">
          <div className="absolute inset-x-0 top-1/3">
            <Particles />
          </div>
        </motion.div>
      )}
      {celebration?.kind === "rankup" && (
        <motion.button
          key="rankup"
          onClick={clearCelebration}
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="rank-up"
        >
          {!reduce && <Particles n={90} spread={1.3} />}
          <motion.div
            initial={reduce ? { opacity: 0 } : { rotateY: 180, scale: 0.7 }}
            animate={reduce ? { opacity: 1 } : { rotateY: 0, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.2, 0.9, 0.3, 1.1] }}
            style={{ transformPerspective: 900 }}
            className="flex h-80 w-56 flex-col items-center justify-center rounded-[28px] text-black shadow-2xl"
          >
            <div className="absolute inset-0 rounded-[28px]" style={{ background: `linear-gradient(140deg, ${RANK_GRADIENT[rankFor(celebration.to).key].join(",")})` }} />
            <span className="relative mb-1"><RankEmblem rankKey={rankFor(celebration.to).key} division={rankFor(celebration.to).division} size={64} /></span>
            <span className="font-display relative text-8xl leading-none">{celebration.to}</span>
            <span className="font-display relative mt-2 text-3xl uppercase tracking-[0.2em]">{rankFor(celebration.to).label}</span>
            <span className="relative mt-4 text-sm font-semibold opacity-70">Rank up</span>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
