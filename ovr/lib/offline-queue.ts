// Offline completion queue (IndexedDB). Every tap becomes an op with a UUID.
// The server dedupes by op_id, so replaying the queue (twice, concurrently,
// after a crash) can never double-count. See tests/unit/offline-queue.test.ts.

import type { HabitState, TodayData } from "./types";

export type QueuedOp = {
  op_id: string;
  kind: "log" | "undo";
  habit_id: string;
  local_date: string;
  queued_at: number;
};

const DB = "ovr-offline";
const STORE = "ops";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "op_id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(r ? (r.result as T) : undefined);
    };
    t.onerror = () => reject(t.error);
  });
}

export async function enqueue(op: QueuedOp): Promise<void> {
  await tx("readwrite", (s) => s.put(op));
}

export async function pending(): Promise<QueuedOp[]> {
  const all = (await tx<QueuedOp[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedOp[]>)) ?? [];
  return all.sort((a, b) => a.queued_at - b.queued_at);
}

export async function remove(opId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(opId));
}

export type SendResult<R> = { ok: true; result: R } | { ok: false; network: boolean; error: string };

let flushing: Promise<unknown> | null = null;

/**
 * Send queued ops in order. Stops at the first network failure (keeps the rest);
 * drops ops the server rejects for good (e.g. date_out_of_range) and reports them.
 */
export function flush<R>(
  send: (op: QueuedOp) => Promise<SendResult<R>>,
  onEach?: (op: QueuedOp, r: SendResult<R>) => void,
): Promise<{ sent: number; failed: number; remaining: number }> {
  if (flushing) return flushing as Promise<{ sent: number; failed: number; remaining: number }>;
  const run = (async () => {
    let sent = 0;
    let failed = 0;
    const ops = await pending();
    for (const op of ops) {
      const r = await send(op);
      onEach?.(op, r);
      if (r.ok) {
        sent++;
        await remove(op.op_id);
      } else if (r.network) {
        break;
      } else {
        failed++;
        await remove(op.op_id);
      }
    }
    return { sent, failed, remaining: (await pending()).length };
  })();
  flushing = run.finally(() => {
    flushing = null;
  });
  return run;
}

/** Overlay not-yet-synced taps onto the last server state so the UI is instant offline. */
export function applyPending(data: TodayData, ops: QueuedOp[]): TodayData {
  if (!ops.length) return data;
  const yesterday = shiftDate(data.today, -1);
  const habits = data.habits.map((h): HabitState => {
    let today = h.today_count;
    let yest = h.yesterday_count;
    for (const op of ops) {
      if (op.habit_id !== h.id) continue;
      const d = op.kind === "log" ? 1 : -1;
      if (op.local_date === data.today) today = clamp(today + d, 0, h.target);
      else if (op.local_date === yesterday) yest = clamp(yest + d, 0, h.target);
    }
    return { ...h, today_count: today, yesterday_count: yest };
  });
  return { ...data, habits };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function shiftDate(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
