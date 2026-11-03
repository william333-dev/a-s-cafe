"use client";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "xp" | "info" | "good" | "warn";
type Toast = { id: number; text: string; tone: Tone; xp?: number };

const Ctx = createContext<(text: string, tone?: Tone, xp?: number) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone: Tone = "info", xp?: number) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, text, tone, xp }]);
    setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ top: "calc(var(--safe-top) + 12px)" }}
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className={`flex max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur ${
                t.tone === "xp"
                  ? "border-ember/40 bg-raised/95"
                  : t.tone === "good"
                    ? "border-success/40 bg-raised/95"
                    : t.tone === "warn"
                      ? "border-stroke bg-raised/95 text-muted"
                      : "border-stroke bg-raised/95"
              }`}
              data-testid="toast"
            >
              {t.xp != null && t.xp > 0 && (
                <span className="font-display tnum rounded-lg bg-ember px-2 py-0.5 text-base text-black">+{t.xp}</span>
              )}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
