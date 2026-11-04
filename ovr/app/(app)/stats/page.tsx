"use client";
import { useMemo, useState } from "react";
import { HeatmapGrid } from "@/components/charts/heatmap";
import { OvrHistoryChart } from "@/components/charts/ovr-history";
import { StreakFlame } from "@/components/habits/streak-flame";
import { Card, EmptyState, ErrorState, Header, ProgressBar, SectionTitle, Segmented, Skeleton } from "@/components/ui/primitives";
import { ATTRIBUTE_META, copy } from "@/lib/copy";
import { useStats } from "@/lib/data";

type Range = "7" | "30" | "90" | "all";

export default function Stats() {
  const { data, isLoading, mutate } = useStats();
  const [range, setRange] = useState<Range>("30");
  const points = useMemo(() => {
    const h = data?.history ?? [];
    return range === "all" ? h : h.slice(-Number(range));
  }, [data, range]);

  if (!data && isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="mt-14 h-60" />
        <Skeleton className="h-32" />
      </div>
    );
  if (!data) return <ErrorState onRetry={() => mutate()} />;

  return (
    <div>
      <Header title={copy.stats.title} />
      <Card className="p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-3xl uppercase" data-testid="level">{copy.stats.level(data.level.level)}</span>
          <span className="tnum text-sm text-muted">{data.xp_total.toLocaleString()} XP</span>
        </div>
        <ProgressBar value={data.level.into_level} max={data.level.needed} />
        <div className="tnum mt-1.5 text-xs text-muted">{copy.stats.xpToNext(data.level.needed - data.level.into_level)}</div>
      </Card>

      <SectionTitle>{copy.stats.history}</SectionTitle>
      <Card className="p-3">
        <div className="mb-2">
          <Segmented<Range> value={range} onChange={setRange} options={[{ value: "7", label: "7D" }, { value: "30", label: "30D" }, { value: "90", label: "90D" }, { value: "all", label: "All" }]} />
        </div>
        <OvrHistoryChart points={points} />
      </Card>

      <SectionTitle>{copy.stats.heatmap}</SectionTitle>
      <Card className="p-3">
        <HeatmapGrid days={data.heatmap} />
      </Card>

      <SectionTitle>{copy.stats.habits}</SectionTitle>
      {data.habits.length === 0 ? (
        <EmptyState title={copy.habits.empty} body={copy.stats.empty} />
      ) : (
        <div className="space-y-2">
          {data.habits.map((h) => (
            <Card key={h.id} className="flex items-center gap-3 p-3" data-testid="stat-habit">
              <span className="text-2xl">{h.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{h.title}</span>
                <span className="flex gap-2 text-xs text-muted">
                  {ATTRIBUTE_META[h.attribute].label} · {copy.stats.best(h.best)} · {h.total} total
                </span>
              </span>
              <span className="text-right">
                <span className="font-display tnum block text-xl">{h.rate28 == null ? "--" : `${Math.round(h.rate28 * 100)}%`}</span>
                <StreakFlame days={h.streak} shields={h.shields} />
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
