"use client";
// Owns the tap → queue → server loop. Taps are written to IndexedDB first,
// shown instantly, then flushed (now, or when the connection returns).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { copy } from "@/lib/copy";
import { BADGES, badgeMeta } from "@/lib/badges";
import { buzz } from "@/lib/haptics";
import { enqueue, flush, pending, type QueuedOp } from "@/lib/offline-queue";
import { rankChange, rankFor } from "@/lib/rating-engine";
import { rpc, RpcError } from "@/lib/supabase/client";
import { mutate } from "@/lib/data";
import type { CompletionResult, TodayData } from "@/lib/types";
import { useToast } from "./ui/toast";

export type Celebration = { kind: "perfect" } | { kind: "rankup"; from: number; to: number } | null;

type Ctx = {
  online: boolean;
  ops: QueuedOp[];
  tap: (habitId: string, date: string) => Promise<void>;
  undo: (habitId: string, date: string) => Promise<void>;
  celebration: Celebration;
  clearCelebration: () => void;
};

const SyncCtx = createContext<Ctx | null>(null);
export const useSync = () => useContext(SyncCtx)!;

const ERR: Record<string, string> = {
  date_out_of_range: copy.toast.tooLate,
  not_scheduled: copy.toast.notScheduled,
  weekly_target_hit: copy.toast.weeklyDone,
  undo_expired: copy.toast.undoExpired,
};

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [celebration, setCelebration] = useState<Celebration>(null);
  const wasOffline = useRef(false);

  const refreshOps = useCallback(async () => {
    try {
      setOps(await pending());
    } catch {
      /* IndexedDB unavailable */
    }
  }, []);

  const applyResult = useCallback((op: QueuedOp, r: CompletionResult) => {
    mutate<TodayData>(
      ["get_today"],
      (d) =>
        d && {
          ...d,
          habits: d.habits.map((h) => (h.id === r.habit?.id ? r.habit : h)),
          snapshot: { ...d.snapshot, overall: r.ovr ?? d.snapshot.overall, level: r.level ?? d.snapshot.level, xp_total: r.xp_total ?? d.snapshot.xp_total },
          level: { ...d.level, xp_total: r.xp_total ?? d.level.xp_total },
          xp_today: r.xp_today ?? d.xp_today,
          perfect_today: op.local_date === d.today ? (r.perfect ?? d.perfect_today) && op.kind === "log" : d.perfect_today,
        },
      { revalidate: false },
    );
  }, []);

  const send = useCallback(
    async (op: QueuedOp) => {
      try {
        const r = await rpc<CompletionResult>(op.kind === "log" ? "log_completion" : "undo_completion", {
          p_op_id: op.op_id,
          p_habit_id: op.habit_id,
          p_local_date: op.local_date,
        });
        return { ok: true as const, result: r };
      } catch (e) {
        const err = e as RpcError;
        return { ok: false as const, network: err.network || !navigator.onLine, error: err.message };
      }
    },
    [],
  );

  const runFlush = useCallback(async () => {
    const res = await flush(send, (op, r) => {
      if (r.ok) {
        const x = r.result;
        applyResult(op, x);
        if (!x.replayed && wasOffline.current === false) {
          if (op.kind === "log" && x.status === "ok") {
            toast(x.xp > 0 ? copy.toast.rep(x.xp) : copy.toast.repCapped, "xp", x.xp);
            if (x.perfect) {
              setCelebration({ kind: "perfect" });
              toast(copy.toast.perfect(x.bonus ?? 0), "good");
              buzz([20, 40, 20, 40, 60]);
            }
          } else if (op.kind === "undo" && x.status === "ok") toast(copy.toast.undo, "warn");
        }
        const change = x.prev_ovr != null && x.ovr != null ? rankChange(x.prev_ovr, x.ovr) : null;
        if (change === "tier") setCelebration({ kind: "rankup", from: x.prev_ovr!, to: x.ovr });
        if (change) toast(copy.toast.rankUp(rankFor(x.ovr).label), "good");
        if (x.prev_level != null && x.level > x.prev_level) toast(copy.toast.levelUp(x.level), "good");
        for (const b of x.badges ?? []) if (BADGES[b] || b.startsWith("champion")) toast(copy.toast.badge(badgeMeta(b).name), "good");
      } else if (!r.network) {
        toast(ERR[r.error] ?? copy.toast.error, "warn");
      }
    });
    await refreshOps();
    if (wasOffline.current && res.sent > 0) toast(copy.toast.synced(res.sent), "good");
    if (res.remaining === 0) wasOffline.current = false;
    if (res.sent > 0 || res.failed > 0) {
      mutate(["get_today"]);
      mutate(["league_board"]);
      mutate(["get_stats"]);
    }
    return res;
  }, [send, applyResult, refreshOps, toast]);

  const queue = useCallback(
    async (kind: "log" | "undo", habitId: string, date: string) => {
      const op: QueuedOp = { op_id: crypto.randomUUID(), kind, habit_id: habitId, local_date: date, queued_at: Date.now() };
      await enqueue(op);
      await refreshOps();
      buzz(kind === "log" ? 14 : [8, 30, 8]);
      if (!navigator.onLine) {
        wasOffline.current = true;
        toast(copy.toast.queued, "warn");
        return;
      }
      const r = await runFlush();
      if (r.remaining > 0) {
        wasOffline.current = true;
        toast(copy.toast.queued, "warn");
      }
    },
    [refreshOps, runFlush, toast],
  );

  useEffect(() => {
    // initial load of the IndexedDB queue (external store) + first sync
    queueMicrotask(() => refreshOps().then(() => runFlush()));
    const on = () => runFlush();
    const vis = () => document.visibilityState === "visible" && runFlush();
    window.addEventListener("online", on);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("online", on);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refreshOps, runFlush]);

  const value = useMemo<Ctx>(
    () => ({
      online,
      ops,
      tap: (h, d) => queue("log", h, d),
      undo: (h, d) => queue("undo", h, d),
      celebration,
      clearCelebration: () => setCelebration(null),
    }),
    [online, ops, queue, celebration],
  );
  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}
