"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { splitDuration } from "@/lib/dates";
import type { QuitTracker } from "@/lib/types";

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function cleanFor(q: Pick<QuitTracker, "last_reset_at">, now: number) {
  return splitDuration(now - new Date(q.last_reset_at).getTime());
}

export function QuitStrip({ trackers }: { trackers: QuitTracker[] }) {
  const now = useNow(30_000);
  if (!trackers.length) return null;
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4" data-testid="quit-strip">
      {trackers.map((q) => {
        const t = cleanFor(q, now);
        return (
          <Link key={q.id} href={`/quit/${q.id}`} className="min-w-36 shrink-0 rounded-2xl border border-stroke bg-surface px-3 py-2.5 active:bg-raised">
            <div className="truncate text-xs text-muted">{q.title}</div>
            <div className="font-display tnum text-2xl">
              {t.d}
              <span className="text-sm text-muted">d</span> {t.h}
              <span className="text-sm text-muted">h</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
