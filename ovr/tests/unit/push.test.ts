import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { messageFor, sendAll, type DueNotification } from "@/lib/push/server";

const sub = (id: string) => ({ id, endpoint: `https://push.example/${id}`, keys: { p256dh: "x", auth: "y" } });

describe("push", () => {
  test("messages use the voice from copy.ts", () => {
    expect(messageFor({ kind: "evening", remaining: 2 } as DueNotification)).toMatchObject({ title: "Streak at risk.", url: "/today" });
    expect(messageFor({ kind: "recap", week: "03", pos: "2", ahead_name: "Hunter", ahead_by: 4 } as DueNotification).body).toBe("You're #2. Hunter's 4% ahead.");
  });
  test("dead subscriptions (404/410) are reported for cleanup", async () => {
    const send = vi.fn(async (s: { id: string }, payload: string) => ({ statusCode: s.id === "dead" && payload ? 410 : 201 }));
    const r = await sendAll([{ user_id: "u", kind: "morning", scheduled: 3, subscriptions: [sub("ok"), sub("dead")] }], send);
    expect(r).toEqual({ sent: 1, gone: ["dead"] });
    expect(JSON.parse(send.mock.calls[0][1]).body).toContain("3 reps");
  });
});
