import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { applyPending, enqueue, flush, pending, remove, type QueuedOp } from "@/lib/offline-queue";
import type { TodayData } from "@/lib/types";

const op = (n: number, over: Partial<QueuedOp> = {}): QueuedOp => ({
  op_id: `op-${n}`, kind: "log", habit_id: "h1", local_date: "2026-11-03", queued_at: n, ...over,
});

beforeEach(async () => {
  for (const o of await pending()) await remove(o.op_id);
});

describe("offline queue", () => {
  test("keeps order and survives re-enqueue of the same op (idempotent key)", async () => {
    await enqueue(op(2));
    await enqueue(op(1));
    await enqueue(op(1));
    expect((await pending()).map((o) => o.op_id)).toEqual(["op-1", "op-2"]);
  });

  test("network failure stops the flush and keeps the rest for later", async () => {
    for (const n of [1, 2, 3]) await enqueue(op(n));
    let calls = 0;
    const r = await flush(async () => (++calls === 2 ? { ok: false, network: true, error: "offline" } : { ok: true, result: null }));
    expect(r).toEqual({ sent: 1, failed: 0, remaining: 2 });
    const r2 = await flush(async () => ({ ok: true, result: null }));
    expect(r2).toEqual({ sent: 2, failed: 0, remaining: 0 });
  });

  test("permanent server rejections are dropped, not retried forever", async () => {
    await enqueue(op(1));
    await enqueue(op(2));
    const seen: string[] = [];
    const r = await flush(async (o) => {
      seen.push(o.op_id);
      return o.op_id === "op-1" ? { ok: false, network: false, error: "date_out_of_range" } : { ok: true, result: null };
    });
    expect(seen).toEqual(["op-1", "op-2"]);
    expect(r).toEqual({ sent: 1, failed: 1, remaining: 0 });
  });

  test("concurrent flushes share one run (no double send)", async () => {
    for (const n of [1, 2, 3]) await enqueue(op(n));
    const sent: string[] = [];
    const send = async (o: QueuedOp) => {
      sent.push(o.op_id);
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true as const, result: null };
    };
    await Promise.all([flush(send), flush(send), flush(send)]);
    expect(sent).toEqual(["op-1", "op-2", "op-3"]);
  });

  test("pending taps overlay the cached Today state", () => {
    const data = {
      today: "2026-11-03",
      habits: [{ id: "h1", today_count: 0, yesterday_count: 0, target: 2 }, { id: "h2", today_count: 1, yesterday_count: 0, target: 1 }],
    } as unknown as TodayData;
    const out = applyPending(data, [op(1), op(2), op(3), op(4, { habit_id: "h2", kind: "undo" }), op(5, { local_date: "2026-11-02" })]);
    expect(out.habits.map((h) => [h.today_count, h.yesterday_count])).toEqual([[2, 1], [0, 0]]);
  });
});
