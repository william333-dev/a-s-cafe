import "server-only";
import webpush from "web-push";
import { copy } from "../copy";

export type DueNotification = {
  user_id: string;
  kind: "morning" | "evening" | "recap" | "test";
  scheduled?: number;
  remaining?: number;
  pos?: string;
  week?: string;
  ahead_name?: string | null;
  ahead_by?: number | null;
  subscriptions: { id: string; endpoint: string; keys: { p256dh: string; auth: string } }[];
};

export function messageFor(n: DueNotification): { title: string; body: string; url: string } {
  switch (n.kind) {
    case "morning":
      return { ...copy.push.morning(n.scheduled ?? 0), url: "/today" };
    case "evening":
      return { ...copy.push.evening(n.remaining ?? 0), url: "/today" };
    case "recap":
      return { ...copy.push.recap(n.week ?? "", Number(n.pos ?? 0), n.ahead_name, n.ahead_by), url: "/league" };
    default:
      return { ...copy.push.test, url: "/today" };
  }
}

export type Sender = (sub: DueNotification["subscriptions"][number], payload: string) => Promise<{ statusCode: number }>;

export function vapidSender(): Sender | null {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  return async (sub, payload) => {
    try {
      const r = await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 3600 });
      return { statusCode: r.statusCode };
    } catch (e) {
      return { statusCode: (e as { statusCode?: number }).statusCode ?? 500 };
    }
  };
}

/** Send every due notification; returns subscription ids that are gone (404/410) for cleanup. */
export async function sendAll(due: DueNotification[], send: Sender) {
  const gone: string[] = [];
  let sent = 0;
  for (const n of due) {
    const payload = JSON.stringify(messageFor(n));
    for (const s of n.subscriptions ?? []) {
      const r = await send(s, payload);
      if (r.statusCode === 404 || r.statusCode === 410) gone.push(s.id);
      else if (r.statusCode < 300) sent++;
    }
  }
  return { sent, gone };
}
