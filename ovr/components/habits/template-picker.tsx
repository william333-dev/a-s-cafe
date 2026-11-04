"use client";
import { useMemo, useState } from "react";
import { Card, SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ATTRIBUTE_META } from "@/lib/copy";
import { refreshAll } from "@/lib/data";
import { describeSchedule, HABIT_PACKS, HABIT_TEMPLATES, templateByTitle, templateRow, type HabitTemplate } from "@/lib/habit-templates";
import { buzz } from "@/lib/haptics";
import { ATTRIBUTES, baseXp, type Attribute } from "@/lib/rating-engine";
import { supabase } from "@/lib/supabase/client";

const norm = (s: string) => s.trim().toLowerCase();

/** Browse ready-made habits: one tap adds, tapping the row opens it in the editor. */
export function TemplatePicker({
  existingTitles,
  count,
  onCustomise,
}: {
  existingTitles: string[];
  count: number;
  onCustomise: (t: HabitTemplate) => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [attr, setAttr] = useState<Attribute | "all">("all");
  const [added, setAdded] = useState<Set<string>>(() => new Set(existingTitles.map(norm)));
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(
    () =>
      HABIT_TEMPLATES.filter(
        (t) => (attr === "all" || t.attribute === attr) && (!q.trim() || norm(t.title).includes(norm(q)) || t.attribute.includes(norm(q))),
      ),
    [q, attr],
  );

  async function insert(templates: HabitTemplate[]) {
    const fresh = templates.filter((t) => !added.has(norm(t.title)));
    if (!fresh.length) return 0;
    const { data: u } = await supabase().auth.getUser();
    const { error } = await supabase()
      .from("habits")
      .insert(fresh.map((t, i) => ({ ...templateRow(t), user_id: u.user!.id, sort_order: count + i })));
    if (error) throw error;
    setAdded((s) => new Set([...s, ...fresh.map((t) => norm(t.title))]));
    refreshAll();
    return fresh.length;
  }

  async function addOne(t: HabitTemplate) {
    setBusy(t.title);
    try {
      await insert([t]);
      buzz(12);
      toast(`Added: ${t.title}`, "good");
    } catch {
      toast("Couldn't add that. Try again.", "warn");
    } finally {
      setBusy(null);
    }
  }

  async function addPack(key: string) {
    const pack = HABIT_PACKS.find((p) => p.key === key)!;
    setBusy(key);
    try {
      const n = await insert(pack.habits.map((h) => templateByTitle(h)!));
      buzz([12, 30, 12]);
      toast(n ? `${pack.title}: ${n} habit${n === 1 ? "" : "s"} added.` : "You've already got all of these.", n ? "good" : "info");
    } catch {
      toast("Couldn't add that pack. Try again.", "warn");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="template-picker">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search habits (gym, read, sleep…)"
        aria-label="Search habit templates"
        className="min-h-12 w-full rounded-2xl border border-stroke bg-raised px-4 text-base outline-none placeholder:text-muted/60 focus:border-ember"
      />
      <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Filter by attribute">
        {(["all", ...ATTRIBUTES] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={attr === a}
            onClick={() => setAttr(a)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${attr === a ? "border-ember bg-ember text-black" : "border-stroke bg-surface text-muted"}`}
          >
            {a === "all" ? "All" : `${ATTRIBUTE_META[a].emoji} ${ATTRIBUTE_META[a].label}`}
          </button>
        ))}
      </div>

      {attr === "all" && !q.trim() && (
        <>
          <SectionTitle>Packs</SectionTitle>
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="packs">
            {HABIT_PACKS.map((p) => {
              const all = p.habits.every((h) => added.has(norm(h)));
              return (
                <Card key={p.key} className="flex w-56 shrink-0 flex-col p-4">
                  <div className="text-3xl">{p.emoji}</div>
                  <div className="font-display mt-1 text-xl uppercase">{p.title}</div>
                  <div className="text-xs text-muted">{p.blurb}</div>
                  <div className="mt-2 flex-1 text-xs leading-relaxed text-muted">{p.habits.map((h) => templateByTitle(h)!.emoji).join(" ")} · {p.habits.length} habits</div>
                  <button
                    onClick={() => addPack(p.key)}
                    disabled={all || busy === p.key}
                    className={`mt-3 min-h-11 rounded-xl text-sm font-bold ${all ? "bg-raised text-muted" : "bg-ember text-black active:scale-[0.97]"}`}
                    aria-label={`Add pack ${p.title}`}
                  >
                    {all ? "Added ✓" : busy === p.key ? "Adding…" : "Add pack"}
                  </button>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {ATTRIBUTES.filter((a) => list.some((t) => t.attribute === a)).map((a) => (
        <section key={a}>
          <SectionTitle>
            {ATTRIBUTE_META[a].emoji} {ATTRIBUTE_META[a].label}
          </SectionTitle>
          <div className="space-y-2">
            {list
              .filter((t) => t.attribute === a)
              .map((t) => {
                const isAdded = added.has(norm(t.title));
                return (
                  <div key={t.title} className="flex min-h-16 items-center gap-3 rounded-2xl border border-stroke bg-surface px-3 py-2.5" data-testid="template-row" data-template={t.title}>
                    <button onClick={() => onCustomise(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Customise ${t.title}`}>
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-raised text-2xl">{t.emoji}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{t.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {describeSchedule(t.schedule)} · {baseXp(t.difficulty)} XP
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => addOne(t)}
                      disabled={isAdded || busy === t.title}
                      aria-label={isAdded ? `${t.title} added` : `Add ${t.title}`}
                      className={`min-h-10 shrink-0 rounded-xl px-3 text-sm font-bold ${isAdded ? "text-muted" : "bg-ember text-black active:scale-95"}`}
                    >
                      {isAdded ? "✓" : "+ Add"}
                    </button>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
      {list.length === 0 && <p className="mt-8 text-center text-sm text-muted">Nothing matches. Tap "Make your own" up top.</p>}
    </div>
  );
}
