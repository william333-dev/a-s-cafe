"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HabitRow } from "@/components/habits/habit-row";
import { StreakFlame } from "@/components/habits/streak-flame";
import { QuitStrip } from "@/components/quit-strip";
import { OvrCard } from "@/components/rating/ovr-card";
import { useSync } from "@/components/sync";
import { Button, Card, EmptyState, ErrorState, ProgressBar, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { useToday } from "@/lib/data";
import { addDays } from "@/lib/dates";
import { applyPending } from "@/lib/offline-queue";
import type { HabitState } from "@/lib/types";
import { attrsOf } from "@/lib/snapshot";

const slot = (t: string | null) => {
  if (!t) return "anytime";
  const h = Number(t.slice(0, 2));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
};
const SLOTS = ["morning", "afternoon", "evening", "anytime"] as const;


export default function Today() {
  const { data: raw, error, isLoading, mutate } = useToday();
  const { ops, tap, undo } = useSync();
  const [showYesterday, setShowYesterday] = useState(false);
  const data = useMemo(() => (raw ? applyPending(raw, ops) : undefined), [raw, ops]);

  if (!data && isLoading) return <TodaySkeleton />;
  if (!data) return <ErrorState onRetry={() => mutate()} message={error ? copy.states.error : undefined} />;

  const today = data.today;
  const yesterday = addDays(today, -1);
  const todays = data.habits.filter((h) => h.scheduled_today && !(h.schedule.type === "times_per_week" && h.week_done >= h.per_week && h.today_count === 0));
  const left = todays.filter((h) => h.today_count < h.target && h.schedule.type !== "times_per_week").length;
  const missedYesterday = data.habits.filter((h) => h.scheduled_yesterday && h.yesterday_count < h.target && h.schedule.type !== "times_per_week");
  const bestStreak = Math.max(0, ...data.habits.map((h) => h.streak));
  // no previous day yet (first day) → no movement badge
  const delta = data.prev_snapshot?.overall != null ? data.snapshot.overall - data.prev_snapshot.overall : null;
  const hour = new Date().getHours();
  const shieldYesterday = data.habits.some((h) => h.last_shield_date === yesterday);

  const groups = SLOTS.map((s) => ({ s, items: todays.filter((h) => slot(h.reminder_time) === s) })).filter((g) => g.items.length);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted">
            {new Date(`${today}T12:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "short" })}
          </div>
          <h1 className="font-display text-4xl uppercase">{copy.today.title}</h1>
        </div>
        <StreakFlame days={bestStreak} size="lg" />
      </div>

      <Link href="/ovr" aria-label="OVR details" className="block active:scale-[0.99]">
        <OvrCard compact overall={data.snapshot.overall} name={data.profile.display_name} level={data.level.level} attrs={attrsOf(data.snapshot)} avatarSeed={data.profile.avatar_seed} delta={delta} />
      </Link>

      <div className="mt-3 flex items-center gap-3 px-1">
        <div className="min-w-0 flex-1">
          <ProgressBar value={data.level.into + 0} max={data.level.needed} />
        </div>
        <span className="tnum text-xs text-muted" data-testid="xp-today">
          +{data.xp_today} XP today
        </span>
      </div>

      {shieldYesterday && <p className="mt-3 rounded-xl border border-ice/30 bg-ice/10 px-3 py-2 text-sm text-ice">{copy.toast.shieldUsed}</p>}
      {data.reactions_today.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          {data.reactions_today.slice(0, 3).map((r) => `${r.from} ${({ fire: "🔥", flex: "💪", salute: "🫡", clown: "🤡" } as Record<string, string>)[r.kind]}`).join(" · ")}
        </p>
      )}

      {data.habits.length === 0 ? (
        <EmptyState emoji="🏁" title={copy.today.emptyTitle} body={copy.today.emptyBody} action={<Link href="/habits/new"><Button>{copy.today.emptyCta}</Button></Link>} />
      ) : (
        <>
          <div className="mt-5 px-1 text-sm font-medium" data-testid="today-status">
            {data.perfect_today || (left === 0 && todays.length > 0) ? <span className="text-ember">{copy.today.allDone}</span> : <span className="text-muted">{copy.today.left(left)}</span>}
          </div>
          {groups.map((g) => (
            <section key={g.s}>
              <SectionTitle>{copy.today[g.s]}</SectionTitle>
              <div className="space-y-2">
                {g.items.map((h: HabitState) => (
                  <HabitRow key={h.id} habit={h} count={h.today_count} undoable={h.undoable_today || ops.some((o) => o.habit_id === h.id && o.local_date === today)} onTap={() => tap(h.id, today)} onUndo={() => undo(h.id, today)} />
                ))}
              </div>
            </section>
          ))}
          {data.habits.filter((h) => !h.scheduled_today).length > 0 && (
            <p className="mt-4 px-1 text-xs text-muted">
              {copy.today.notToday}: {data.habits.filter((h) => !h.scheduled_today).map((h) => h.title).join(", ")}
            </p>
          )}
          {missedYesterday.length > 0 && (
            <section>
              <SectionTitle action={<button className="min-h-11 text-xs text-muted" onClick={() => setShowYesterday((v) => !v)}>{showYesterday ? "Hide" : `Show ${missedYesterday.length}`}</button>}>
                {copy.today.yesterday}
              </SectionTitle>
              {showYesterday && (
                <div className="space-y-2">
                  <p className="px-1 text-xs text-muted">{copy.today.yesterdayHint}</p>
                  {missedYesterday.map((h) => (
                    <HabitRow key={h.id} habit={h} count={h.yesterday_count} dim undoable={h.undoable_yesterday} onTap={() => tap(h.id, yesterday)} onUndo={() => undo(h.id, yesterday)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {data.quit.length > 0 && (
        <>
          <SectionTitle action={<Link href="/quit" className="text-xs text-muted">All</Link>}>Quit</SectionTitle>
          <QuitStrip trackers={data.quit} />
        </>
      )}

      {(hour >= 17 || data.journal_today) && (
        <Link href="/journal" className="mt-6 block">
          <Card className="flex items-center gap-3 p-4 active:bg-raised">
            <span className="text-2xl">{data.journal_today ? copy.journal.moods[data.journal_today.mood - 1] : "📝"}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{copy.today.journalPrompt}</span>
              <span className="block truncate text-sm text-muted">{data.journal_today?.body || copy.journal.prompt}</span>
            </span>
          </Card>
        </Link>
      )}
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-48" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}
