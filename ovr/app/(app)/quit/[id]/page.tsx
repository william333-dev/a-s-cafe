"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { cleanFor, useNow } from "@/components/quit-strip";
import { Button, Card, EmptyState, Header, Input, Sheet, Skeleton, Toggle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { copy } from "@/lib/copy";
import { refreshToday, useToday } from "@/lib/data";
import { splitDuration } from "@/lib/dates";
import { rpc, supabase } from "@/lib/supabase/client";

export default function QuitDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useToday();
  const now = useNow(1000);
  const toast = useToast();
  const [slip, setSlip] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) return <Skeleton className="mt-16 h-80" />;
  const q = data.quit.find((x) => x.id === id);
  if (!q) return <EmptyState title="Tracker not found." />;
  const t = cleanFor(q, now);
  const bestS = Math.max(q.best_streak_seconds, Math.floor((now - new Date(q.last_reset_at).getTime()) / 1000));
  const b = splitDuration(bestS * 1000);

  const logSlip = async () => {
    setBusy(true);
    try {
      await rpc("log_relapse", { p_tracker: q.id, p_trigger: tag, p_note: note || null });
      toast(copy.quit.afterSlip, "info");
      setSlip(false);
      setTag(null);
      setNote("");
      refreshToday();
    } catch {
      toast(copy.toast.error, "warn");
    } finally {
      setBusy(false);
    }
  };
  const update = async (patch: Record<string, unknown>) => {
    await supabase().from("quit_trackers").update(patch).eq("id", q.id);
    refreshToday();
  };

  return (
    <div>
      <Header title={q.title} back="/quit" />
      <Card className="p-6 text-center">
        <div className="text-xs uppercase tracking-widest text-muted">{copy.quit.clean}</div>
        <div className="font-display tnum mt-2 flex items-end justify-center gap-3" data-testid="quit-counter">
          {[["d", t.d], ["h", t.h], ["m", t.m], ["s", t.s]].map(([l, v]) => (
            <span key={l as string}>
              <span className="text-6xl leading-none">{String(v).padStart(l === "d" ? 1 : 2, "0")}</span>
              <span className="text-lg text-muted">{l}</span>
            </span>
          ))}
        </div>
        <div className="mt-3 text-sm text-muted">{copy.quit.best(`${b.d}d ${b.h}h`)}</div>
      </Card>
      <Button variant="secondary" size="lg" className="mt-4 w-full" onClick={() => setSlip(true)} data-testid="slip">
        {copy.quit.slipped}
      </Button>
      <Card className="mt-4 px-4 py-2">
        <Toggle label={copy.quit.share} checked={q.visible_to_league} onChange={(v) => update({ visible_to_league: v })} />
      </Card>
      <a href="tel:1737" className="mt-6 block text-center text-sm text-ice underline">{copy.quit.help}</a>
      <Button variant="ghost" className="mt-6 w-full" onClick={async () => { await update({ archived_at: new Date().toISOString() }); router.replace("/quit"); }}>
        Archive tracker
      </Button>

      <Sheet open={slip} onClose={() => setSlip(false)} title={copy.quit.slipTitle}>
        <p className="mb-2 text-sm text-muted">{copy.quit.triggerLabel}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {copy.quit.triggers.map((x) => (
            <button key={x} onClick={() => setTag(tag === x ? null : x)} className={`min-h-11 rounded-full border px-4 text-sm ${tag === x ? "border-ember bg-ember/10" : "border-stroke"}`}>
              {x}
            </button>
          ))}
        </div>
        <Input label={copy.quit.noteLabel} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
        <Button size="lg" className="mt-4 w-full" onClick={logSlip} loading={busy} data-testid="confirm-slip">{copy.quit.confirmSlip}</Button>
        <a href="tel:1737" className="mt-4 block text-center text-sm text-ice underline">{copy.quit.help}</a>
      </Sheet>
    </div>
  );
}
