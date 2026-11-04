"use client";
import Link from "next/link";
import { StreakFlame } from "@/components/habits/streak-flame";
import { Button, Card, EmptyState, ErrorState, Header, Skeleton } from "@/components/ui/primitives";
import { ATTRIBUTE_META, copy } from "@/lib/copy";
import { useToday } from "@/lib/data";

const describe = (s: { type: string; days?: number[]; times_per_week?: number; target_per_day?: number }) => {
  const base = s.type === "daily" ? "Every day" : s.type === "weekdays" ? (s.days ?? []).map((d) => "MTWTFSS"[d - 1]).join(" ") : `${s.times_per_week}× a week`;
  return (s.target_per_day ?? 1) > 1 ? `${base} · ${s.target_per_day}× a day` : base;
};

export default function Habits() {
  const { data, isLoading, mutate } = useToday();
  if (!data && isLoading) return <Skeleton className="mt-16 h-64" />;
  if (!data) return <ErrorState onRetry={() => mutate()} />;
  return (
    <div>
      <Header title={copy.habits.title} back="/profile" />
      {data.habits.length === 0 ? (
        <EmptyState title={copy.habits.empty} action={<Link href="/habits/new"><Button>{copy.habits.new}</Button></Link>} />
      ) : (
        <div className="space-y-2">
          {data.habits.map((h) => (
            <Link key={h.id} href={`/habits/${h.id}`}>
              <Card className="mb-2 flex items-center gap-3 p-3 active:bg-raised">
                <span className="text-2xl">{h.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.title}</span>
                  <span className="text-xs text-muted">{ATTRIBUTE_META[h.attribute].label} · {describe(h.schedule)} · {h.base_xp} XP {h.visible_to_league ? "" : "· private"}</span>
                </span>
                <StreakFlame days={h.streak} shields={h.shields} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
