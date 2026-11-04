"use client";
import Link from "next/link";
import { useState } from "react";
import { cleanFor, useNow } from "@/components/quit-strip";
import { Button, Card, EmptyState, ErrorState, Header, Input, Sheet, Skeleton, Toggle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { copy } from "@/lib/copy";
import { refreshToday, useToday } from "@/lib/data";
import { supabase } from "@/lib/supabase/client";

export default function Quit() {
  const { data, isLoading, mutate } = useToday();
  const now = useNow(1000);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [shared, setShared] = useState(false);
  const [since, setSince] = useState("");
  if (!data && isLoading) return <Skeleton className="mt-16 h-64" />;
  if (!data) return <ErrorState onRetry={() => mutate()} />;

  const add = async () => {
    if (!title.trim()) return;
    const { error } = await supabase()
      .from("quit_trackers")
      .insert({ user_id: data.profile.id, title: title.trim(), visible_to_league: shared, ...(since ? { started_at: new Date(since).toISOString() } : {}) });
    if (error) return toast(copy.toast.error, "warn");
    setOpen(false);
    setTitle("");
    setSince("");
    refreshToday();
  };

  return (
    <div>
      <Header title={copy.quit.title} back="/profile" right={<Button size="sm" onClick={() => setOpen(true)}>+ {copy.quit.add}</Button>} />
      {data.quit.length === 0 && <EmptyState emoji="🧊" title={copy.quit.empty} />}
      <div className="space-y-2">
        {data.quit.map((q) => {
          const t = cleanFor(q, now);
          return (
            <Link key={q.id} href={`/quit/${q.id}`}>
              <Card className="mb-2 p-4 active:bg-raised">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{q.title}</span>
                  <span className="text-xs text-muted">{q.visible_to_league ? "shared" : "private"}</span>
                </div>
                <div className="font-display tnum mt-1 text-3xl">
                  {t.d}d {t.h}h {t.m}m <span className="text-base text-muted">{copy.quit.clean}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-muted">{copy.quit.help}</p>
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.quit.add}>
        <div className="space-y-4">
          <Input label="What are you quitting?" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder={copy.quiz.quitPlaceholder} />
          <Input label="Clean since (optional)" type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} hint="For the counter. XP starts from today." />
          <Toggle label={copy.quit.share} checked={shared} onChange={setShared} />
          <Button className="w-full" size="lg" onClick={add}>Start</Button>
        </div>
      </Sheet>
    </div>
  );
}
