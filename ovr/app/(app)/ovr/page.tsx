"use client";
import Link from "next/link";
import { useState } from "react";
import { AttributeRadar } from "@/components/rating/attribute-radar";
import { OvrCard } from "@/components/rating/ovr-card";
import { Card, ErrorState, Header, ProgressBar, SectionTitle, Sheet, Skeleton } from "@/components/ui/primitives";
import { ATTRIBUTE_META, copy } from "@/lib/copy";
import { useToday } from "@/lib/data";
import { nextRank, rankFor, TIERS, type Attribute } from "@/lib/rating-engine";
import { RankEmblem } from "@/components/rating/rank-emblem";
import { attrsOf } from "@/lib/snapshot";
import { HowOvrWorks } from "@/components/how-ovr-works";

export default function OvrDetail() {
  const { data, isLoading, mutate } = useToday();
  const [how, setHow] = useState(false);
  if (!data && isLoading) return <Skeleton className="mt-16 h-96" />;
  if (!data) return <ErrorState onRetry={() => mutate()} />;
  const s = data.snapshot;
  const rank = rankFor(s.overall);
  const nr = nextRank(s.overall);
  const reasons = (s.top_reasons ?? []).filter(Boolean);
  const delta = data.prev_snapshot ? s.overall - data.prev_snapshot.overall : null;

  return (
    <div>
      <Header title={copy.ovr.title} back="/today" right={<button className="min-h-11 text-sm text-muted underline" onClick={() => setHow(true)}>{copy.ovr.howTitle}</button>} />
      <OvrCard overall={s.overall} name={data.profile.display_name} handle={data.profile.handle} level={data.level.level} attrs={attrsOf(s)} avatarSeed={data.profile.avatar_seed} delta={delta} />

      <Card className="mt-4 p-4">
        <div className="mb-2 flex items-center gap-3">
          <RankEmblem rankKey={rank.key} division={rank.division} size={48} />
          <span className="font-display flex-1 text-2xl uppercase">{rank.label}</span>
          <span className="text-sm text-muted" data-testid="next-rank">{nr ? copy.ovr.nextRank(nr.pointsToGo, nr.label) : copy.ovr.maxRank}</span>
        </div>
        {nr && <ProgressBar value={s.overall - rank.min} max={nr.min - rank.min} color="bg-ice" />}
        <div className="mt-3 flex justify-between text-[10px] uppercase text-muted">
          {TIERS.map((t) => (
            <span key={t.key} className={t.key === rank.key ? "text-fg" : ""}>{t.mins[0]}</span>
          ))}
        </div>
        <Link href="/ranks" className="mt-3 flex min-h-11 items-center justify-between rounded-xl bg-raised px-3 text-sm font-semibold active:opacity-80" data-testid="ladder-link">
          <span>{copy.ladder.link}</span>
          <span className="text-muted">›</span>
        </Link>
      </Card>

      <SectionTitle>{copy.ovr.whyTitle}</SectionTitle>
      <Card className="divide-y divide-stroke" data-testid="why-it-moved">
        {reasons.length === 0 && <p className="p-4 text-sm text-muted">{copy.ovr.noChange}</p>}
        {reasons.map((r, n) => (
          <div key={n} className="flex items-center gap-3 p-4">
            <span className={`font-display tnum w-10 text-xl ${r.delta == null || r.delta > 0 ? "text-ice" : "text-muted"}`}>
              {r.delta == null ? "NEW" : `${r.delta > 0 ? "+" : ""}${r.delta}`}
            </span>
            <span className="text-sm">
              {r.attribute === "calibration"
                ? copy.ovr.calibration
                : r.attribute === "cap"
                  ? copy.ovr.cap
                  : copy.ovr.reason(ATTRIBUTE_META[r.attribute as Attribute].label, r.delta, Number(r.done7 ?? 0), Number(r.sched7 ?? 0))}
            </span>
          </div>
        ))}
      </Card>

      <SectionTitle>Attributes</SectionTitle>
      <Card className="p-2">
        <AttributeRadar attrs={attrsOf(s)} />
      </Card>
      <p className="mt-4 px-1 text-xs text-muted">
        Attributes without habits show “--”. Add one from <Link href="/habits/new" className="underline">a new habit</Link>.
      </p>

      <Sheet open={how} onClose={() => setHow(false)} title={copy.ovr.howTitle}>
        <HowOvrWorks />
      </Sheet>
    </div>
  );
}
