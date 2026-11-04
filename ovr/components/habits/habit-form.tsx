"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Segmented, Toggle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ATTRIBUTE_META, copy } from "@/lib/copy";
import { refreshAll } from "@/lib/data";
import { ATTRIBUTES, baseXp, type Attribute, type Difficulty, type Schedule } from "@/lib/rating-engine";
import { supabase } from "@/lib/supabase/client";
import type { HabitState } from "@/lib/types";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const EMOJIS = ["✅", "🏋️", "🏃", "🚶", "🧘", "📚", "🎯", "🧊", "📵", "💬", "📞", "🎸", "🚀", "💧", "😴", "🥗", "✍️", "🧹"];

export function HabitForm({ habit, count }: { habit?: HabitState; count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? "✅");
  const [attribute, setAttribute] = useState<Attribute>(habit?.attribute ?? "body");
  const [difficulty, setDifficulty] = useState<Difficulty>(habit?.difficulty ?? "standard");
  const [customXp, setCustomXp] = useState(habit?.custom_xp ?? 25);
  const [schedule, setSchedule] = useState<Schedule>(habit?.schedule ?? { type: "daily", target_per_day: 1 });
  const [time, setTime] = useState(habit?.reminder_time?.slice(0, 5) ?? "");
  const [shared, setShared] = useState(habit?.visible_to_league ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast("Give it a name.", "warn");
    setBusy(true);
    const { data: u } = await supabase().auth.getUser();
    const row = {
      title: title.trim(),
      emoji,
      attribute,
      difficulty,
      custom_xp: difficulty === "custom" ? customXp : null,
      schedule: { ...schedule, target_per_day: Math.max(1, schedule.target_per_day ?? 1) },
      reminder_time: time || null,
      visible_to_league: shared,
    };
    const { error } = habit
      ? await supabase().from("habits").update(row).eq("id", habit.id)
      : await supabase().from("habits").insert({ ...row, user_id: u.user!.id, sort_order: count });
    setBusy(false);
    if (error) return toast(copy.toast.error, "warn");
    toast(copy.toast.saved, "good");
    await refreshAll();
    router.replace("/today");
  };
  const archive = async () => {
    if (!habit) return;
    const { error } = await supabase().from("habits").update({ archived_at: new Date().toISOString() }).eq("id", habit.id);
    if (error) return toast(copy.toast.error, "warn");
    toast(copy.habits.archived, "good");
    await refreshAll();
    router.replace("/habits");
  };

  const xp = difficulty === "custom" ? customXp : baseXp(difficulty);
  return (
    <div className="space-y-4">
      {!habit && count >= 10 && <p className="rounded-xl border border-stroke bg-raised p-3 text-sm text-muted">{copy.habits.tooMany}</p>}
      <Card className="space-y-4 p-4">
        <Input label={copy.habits.name} name="title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Gym" />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">{copy.habits.emoji}</span>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} className={`grid size-11 place-items-center rounded-xl text-xl ${emoji === e ? "bg-ember/20 ring-2 ring-ember" : "bg-raised"}`} aria-label={e}>
                {e}
              </button>
            ))}
            <input aria-label="Custom emoji" value={EMOJIS.includes(emoji) ? "" : emoji} onChange={(e) => e.target.value && setEmoji([...e.target.value].slice(-1)[0])} placeholder="+" className="size-11 rounded-xl bg-raised text-center text-xl outline-none" />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <span className="mb-2 block text-sm font-medium text-muted">{copy.habits.attribute}</span>
        <div className="grid grid-cols-3 gap-2">
          {ATTRIBUTES.map((a) => (
            <button key={a} type="button" onClick={() => setAttribute(a)} aria-pressed={attribute === a} className={`min-h-12 rounded-xl border text-sm font-semibold ${attribute === a ? "border-ember bg-ember/10" : "border-stroke bg-raised"}`}>
              {ATTRIBUTE_META[a].emoji} {ATTRIBUTE_META[a].label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted">{copy.habits.difficulty}</span>
          <span className="font-display tnum text-ember">{xp} XP</span>
        </div>
        <Segmented<Difficulty> value={difficulty} onChange={setDifficulty} options={[{ value: "minor", label: "Minor" }, { value: "standard", label: "Standard" }, { value: "major", label: "Major" }, { value: "custom", label: "Custom" }]} />
        {difficulty === "custom" && (
          <label className="block">
            <span className="text-sm text-muted">{copy.habits.customXp}</span>
            <input type="range" min={5} max={50} value={customXp} onChange={(e) => setCustomXp(Number(e.target.value))} className="w-full accent-[#FF6A1A]" />
          </label>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <span className="block text-sm font-medium text-muted">{copy.habits.schedule}</span>
        <Segmented<Schedule["type"]>
          value={schedule.type}
          onChange={(t) => setSchedule((s) => ({ type: t, target_per_day: s.target_per_day, days: t === "weekdays" ? (s.days ?? [1, 2, 3, 4, 5]) : undefined, times_per_week: t === "times_per_week" ? (s.times_per_week ?? 3) : undefined }))}
          options={[{ value: "daily", label: copy.habits.daily }, { value: "weekdays", label: copy.habits.weekdays }, { value: "times_per_week", label: "X / week" }]}
        />
        {schedule.type === "weekdays" && (
          <div className="flex justify-between gap-1">
            {DAYS.map((d, n) => {
              const iso = n + 1;
              const on = schedule.days?.includes(iso);
              return (
                <button key={n} type="button" aria-pressed={on} onClick={() => setSchedule((s) => ({ ...s, days: on ? (s.days ?? []).filter((x) => x !== iso) : [...(s.days ?? []), iso].sort() }))} className={`size-11 rounded-full text-sm font-bold ${on ? "bg-ember text-black" : "bg-raised text-muted"}`}>
                  {d}
                </button>
              );
            })}
          </div>
        )}
        {schedule.type === "times_per_week" && (
          <Stepper label={copy.habits.timesPerWeek} value={schedule.times_per_week ?? 3} min={1} max={7} onChange={(v) => setSchedule((s) => ({ ...s, times_per_week: v }))} />
        )}
        <Stepper label={copy.habits.targetPerDay} value={schedule.target_per_day ?? 1} min={1} max={20} onChange={(v) => setSchedule((s) => ({ ...s, target_per_day: v }))} />
        <label className="flex items-center justify-between">
          <span className="text-[15px]">{copy.habits.timeOfDay}</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="tnum min-h-11 rounded-xl border border-stroke bg-raised px-3" aria-label={copy.habits.timeOfDay} />
        </label>
      </Card>

      <Card className="px-4 py-2">
        <Toggle label={copy.habits.shared} checked={shared} onChange={setShared} />
      </Card>

      <Button size="lg" className="w-full" onClick={save} loading={busy} disabled={schedule.type === "weekdays" && !schedule.days?.length} data-testid="save-habit">
        {copy.habits.save}
      </Button>
      {habit && (
        <Button variant="ghost" className="w-full" onClick={archive}>
          {copy.habits.archive}
        </Button>
      )}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[15px]">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="size-11 rounded-xl bg-raised text-xl" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label}`}>−</button>
        <span className="font-display tnum w-8 text-center text-2xl">{value}</span>
        <button type="button" className="size-11 rounded-xl bg-raised text-xl" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label}`}>+</button>
      </div>
    </div>
  );
}
