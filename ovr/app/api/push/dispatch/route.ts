// Called every 15 min by pg_cron (pg_net) with `Authorization: Bearer CRON_SECRET`.
// Claims due notifications in the DB (dedupe + max 2/day) and sends them.
import { createClient } from "@supabase/supabase-js";
import { sendAll, vapidSender, type DueNotification } from "@/lib/push/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sender = vapidSender();
  if (!sender) return Response.json({ error: "push not configured" }, { status: 500 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("claim_due_notifications");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const { sent, gone } = await sendAll((data ?? []) as DueNotification[], sender);
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return Response.json({ due: (data ?? []).length, sent, removed: gone.length });
}
