"use client";
import { useState } from "react";
import useSWR from "swr";
import { Button, Card, EmptyState, Header, SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { copy } from "@/lib/copy";
import { refreshToday, useToday } from "@/lib/data";
import { supabase } from "@/lib/supabase/client";

type Entry = { local_date: string; mood: number; body: string };

export default function Journal() {
  const { data: today } = useToday();
  const toast = useToast();
  const { data: entries, mutate } = useSWR<Entry[]>(["journal"], async () => {
    const { data, error } = await supabase().from("journal_entries").select("local_date, mood, body").order("local_date", { ascending: false }).limit(60);
    if (error) throw error;
    return data;
  });
  return (
    <div>
      <Header title={copy.journal.title} back="/profile" />
      <EntryForm key={today ? `${today.today}-${today.journal_today?.mood ?? 0}` : "loading"} initialMood={today?.journal_today?.mood ?? 0} initialBody={today?.journal_today?.body ?? ""} onSave={async (mood, body) => {
        if (!today || !mood) return;
        const { error } = await supabase()
          .from("journal_entries")
          .upsert({ user_id: today.profile.id, local_date: today.today, mood, body: body.trim() }, { onConflict: "user_id,local_date" });
        if (error) return toast(copy.toast.error, "warn");
        toast(copy.toast.saved, "good");
        mutate();
        refreshToday();
      }} />
      <History entries={entries} />
    </div>
  );
}

function EntryForm({ initialMood, initialBody, onSave }: { initialMood: number; initialBody: string; onSave: (mood: number, body: string) => void }) {
  const [mood, setMood] = useState(initialMood);
  const [body, setBody] = useState(initialBody);
  const save = () => onSave(mood, body);
  return (
      <Card className="p-4">
        <p className="font-semibold">{copy.journal.prompt}</p>
        <div className="my-3 flex justify-between" role="radiogroup" aria-label={copy.journal.moodLabel}>
          {copy.journal.moods.map((m, n) => (
            <button key={n} role="radio" aria-checked={mood === n + 1} onClick={() => setMood(n + 1)} className={`grid size-14 place-items-center rounded-2xl text-3xl transition ${mood === n + 1 ? "scale-110 bg-ember/20 ring-2 ring-ember" : "bg-raised"}`}>
              {m}
            </button>
          ))}
        </div>
        <input value={body} maxLength={140} onChange={(e) => setBody(e.target.value)} placeholder="One line…" className="min-h-12 w-full rounded-2xl border border-stroke bg-raised px-4 outline-none focus:border-ember" aria-label="Journal line" />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>🔒 {copy.journal.private}</span>
          <span className="tnum">{body.length}/140</span>
        </div>
        <Button className="mt-3 w-full" onClick={save} disabled={!mood}>{copy.journal.save}</Button>
      </Card>
  );
}

function History({ entries }: { entries: Entry[] | undefined }) {
  return (
    <>
      <SectionTitle>History</SectionTitle>
      {!entries?.length ? (
        <EmptyState emoji="📓" title={copy.journal.empty} />
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <Card key={e.local_date} className="flex items-center gap-3 p-3">
              <span className="text-2xl">{copy.journal.moods[e.mood - 1]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">{new Date(`${e.local_date}T12:00:00`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="block truncate">{e.body || "—"}</span>
              </span>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
