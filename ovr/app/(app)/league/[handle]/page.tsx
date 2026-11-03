"use client";
import { useParams } from "next/navigation";
import { mutate as gmutate } from "swr";
import { OvrHistoryChart } from "@/components/charts/ovr-history";
import { StreakFlame } from "@/components/habits/streak-flame";
import { ReactionBar } from "@/components/league/reaction-bar";
import { OvrCard } from "@/components/rating/ovr-card";
import { cleanFor, useNow } from "@/components/quit-strip";
import { Card, EmptyState, ErrorState, Header, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { badgeMeta } from "@/lib/badges";
import { copy } from "@/lib/copy";
import { useLeague, useMember } from "@/lib/data";
import { attrsOf } from "@/lib/snapshot";
import { supabase } from "@/lib/supabase/client";
import type { ReactionKind } from "@/lib/types";
import { buzz } from "@/lib/haptics";

export default function Member() {
  const { handle } = useParams<{ handle: string }>();
  const { data, isLoading, mutate } = useMember(handle);
  const { data: league } = useLeague();
  const toast = useToast();
  const now = useNow(60_000);
  if (data === undefined && isLoading) return <Skeleton className="mt-16 h-96" />;
  if (data === undefined) return <ErrorState onRetry={() => mutate()} />;
  if (data === null) return <EmptyState title="No such player." />;
  const row = league?.rows.find((r) => r.handle.toLowerCase() === handle.toLowerCase());

  const toggle = async (k: ReactionKind) => {
    if (!row || row.is_me) return;
    buzz(10);
    const { data: u } = await supabase().auth.getUser();
    const on = row.my_reactions.includes(k);
    const q = on
      ? supabase().from("reactions").delete().match({ from_user: u.user!.id, to_user: row.user_id, kind: k, local_date: league!.league_today })
      : supabase().from("reactions").insert({ from_user: u.user!.id, to_user: row.user_id, kind: k });
    const { error } = await q;
    if (error) toast(copy.toast.error, "warn");
    else if (!on) toast(copy.league.reactSent, "good");
    gmutate(["league_board"]);
  };

  return (
    <div>
      <Header title={data.profile.display_name} back="/league" />
      <OvrCard overall={data.snapshot?.overall ?? 50} name={data.profile.display_name} handle={data.profile.handle} level={data.snapshot?.level ?? 1} attrs={attrsOf(data.snapshot)} avatarSeed={data.profile.avatar_seed} />
      {!data.is_me && row && (
        <div className="mt-4 flex justify-center">
          <ReactionBar counts={row.reactions} mine={row.my_reactions} onToggle={toggle} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <div className="font-display tnum text-3xl">{data.week ? Math.round(data.week.completion_rate * 100) : 0}%</div>
          <div className="text-xs text-muted">this week</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="font-display tnum text-3xl">{row?.weekly_pos ?? "–"}</div>
          <div className="text-xs text-muted">weekly rank</div>
        </Card>
      </div>
      <SectionTitle>30 days</SectionTitle>
      <Card className="p-3">
        <OvrHistoryChart points={data.history} />
      </Card>
      <SectionTitle>Public habits</SectionTitle>
      {data.habits.length === 0 ? (
        <p className="px-1 text-sm text-muted">Keeping it private.</p>
      ) : (
        <div className="space-y-2">
          {data.habits.map((h, n) => (
            <Card key={n} className="flex items-center gap-3 p-3">
              <span className="text-xl">{h.emoji}</span>
              <span className="flex-1 truncate">{h.title}</span>
              <StreakFlame days={h.streak} />
              {h.done_today && <span className="text-ember">✓</span>}
            </Card>
          ))}
        </div>
      )}
      {data.quit.length > 0 && (
        <>
          <SectionTitle>Quitting</SectionTitle>
          {data.quit.map((q, n) => {
            const t = cleanFor(q, now);
            return (
              <Card key={n} className="mb-2 flex items-center justify-between p-3">
                <span>{q.title}</span>
                <span className="font-display tnum text-xl">{t.d}d {t.h}h</span>
              </Card>
            );
          })}
        </>
      )}
      {data.badges.length > 0 && (
        <>
          <SectionTitle>Badges</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {data.badges.map((b) => (
              <span key={b} className="rounded-full border border-stroke bg-surface px-3 py-1.5 text-sm" title={badgeMeta(b).how}>
                {badgeMeta(b).emoji} {badgeMeta(b).name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
