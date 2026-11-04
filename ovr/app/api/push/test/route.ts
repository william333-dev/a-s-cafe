// "Send a test" button in Settings: pushes to the caller's own devices.
import { createClient } from "@supabase/supabase-js";
import { sendAll, vapidSender, type DueNotification } from "@/lib/push/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sender = vapidSender();
  if (!sender) return Response.json({ error: "push not configured" }, { status: 500 });
  // RLS-scoped client acting as the user: only their own subscriptions are visible.
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u } = await userClient.auth.getUser(token);
  if (!u.user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data: subs } = await userClient.from("push_subscriptions").select("id, endpoint, keys");
  const { sent, gone } = await sendAll([{ user_id: u.user.id, kind: "test", subscriptions: subs ?? [] } as DueNotification], sender);
  if (gone.length) await userClient.from("push_subscriptions").delete().in("id", gone);
  return Response.json({ sent });
}
