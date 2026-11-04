"use client";
import { useEffect, useMemo, useRef } from "react";
import { RankEmblem } from "@/components/rating/rank-emblem";
import { ErrorState, Header, Skeleton } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { useLadder } from "@/lib/data";
import { ladderReach, RANKS, rankFor, TIERS } from "@/lib/rating-engine";

const pct = (x: number) => {
  const v = x * 100;
  if (v === 0) return "0%";
  if (v >= 10) return `${Math.round(v)}%`;
  return `${Number(v.toFixed(1))}%`;
};

/** Every rank, top to bottom, with how much of the league has reached it. */
export default function RankLadder() {
  const { data, isLoading, mutate } = useLadder();
  const youRef = useRef<HTMLDivElement>(null);
  const reach = useMemo(() => ladderReach(data?.bests ?? []), [data]);
  const current = data?.my_current != null ? rankFor(data.my_current) : null;
  const best = data?.my_best ?? data?.my_current ?? 40;

  useEffect(() => {
    if (current) youRef.current?.scrollIntoView({ block: "center" });
  }, [current]);

  if (!data && isLoading) return <Skeleton className="mt-16 h-[70dvh]" />;
  if (!data) return <ErrorState onRetry={() => mutate()} />;

  return (
    <div>
      <Header title={copy.ladder.title} back="/ovr" />
      <p className="mb-4 px-1 text-sm text-muted">{copy.ladder.sub}</p>
      <div className="space-y-3" data-testid="rank-ladder">
        {[...TIERS].reverse().map((tier) => {
          const ranks = RANKS.filter((r) => r.key === tier.key).reverse();
          const mine = current?.key === tier.key;
          return (
            <section key={tier.key} className={`overflow-hidden rounded-[var(--radius-card)] border bg-surface ${mine ? "border-ember/60" : "border-stroke"}`}>
              <h2 className="font-display px-4 pt-3 text-sm uppercase tracking-[0.16em] text-muted">{tier.label}</h2>
              <div className="divide-y divide-stroke">
                {ranks.map((r) => {
                  const isYou = current?.index === r.index;
                  const locked = best < r.min;
                  return (
                    <div
                      key={r.index}
                      ref={isYou ? youRef : undefined}
                      className={`flex items-center gap-3 px-4 py-2.5 ${isYou ? "bg-ember/10" : ""}`}
                      data-testid="ladder-row"
                      data-rank={r.label}
                      data-you={isYou}
                    >
                      <RankEmblem rankKey={r.key} division={r.division} size={42} locked={locked && !isYou} />
                      <span className={`flex flex-1 items-center gap-2 font-semibold ${locked ? "text-muted" : ""}`}>
                        {r.label}
                        {locked && <span aria-label="locked">🔒</span>}
                        {isYou && <span className="rounded-full bg-ember px-2 py-0.5 text-[11px] font-bold text-black">{copy.ladder.you}</span>}
                      </span>
                      <span className="text-right">
                        <span className="font-display tnum block text-xl leading-none">{pct(reach.get(r.index) ?? 0)}</span>
                        <span className="text-[11px] text-muted">{copy.ladder.reached}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-4 px-1 text-xs text-muted">
        {copy.ladder.best(rankFor(best).label)} · OVR {best}. Thresholds: {RANKS.map((r) => `${r.label} ${r.min}`).join(" · ")}
      </p>
    </div>
  );
}
