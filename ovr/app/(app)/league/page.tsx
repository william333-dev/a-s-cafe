"use client";
import { useState } from "react";
import { Avatar } from "@/components/league/avatar";
import { LeagueRow } from "@/components/league/league-row";
import { Button, Card, EmptyState, ErrorState, Header, SectionTitle, Segmented, Sheet, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { copy } from "@/lib/copy";
import { mutate as gmutate, useDuo, useLeague } from "@/lib/data";
import { rpc } from "@/lib/supabase/client";

export default function League() {
  const { data, isLoading, mutate } = useLeague();
  const [mode, setMode] = useState<"weekly" | "alltime">("weekly");
  if (!data && isLoading)
    return (
      <div className="space-y-2">
        <Skeleton className="mt-14 h-12" />
        {[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-16" />)}
      </div>
    );
  if (!data) return <ErrorState onRetry={() => mutate()} />;

  const rows = [...data.rows].sort((a, b) => (mode === "weekly" ? a.weekly_pos - b.weekly_pos : a.alltime_pos - b.alltime_pos));
  const me = data.rows.find((r) => r.is_me);
  // "rank changed" moment: someone who was below you yesterday is above you now (weekly)
  const passer = me && me.prev_weekly_pos != null ? data.rows.find((r) => !r.is_me && r.prev_weekly_pos != null && r.prev_weekly_pos > me.prev_weekly_pos! && r.weekly_pos < me.weekly_pos) : null;
  const passed = me && me.prev_weekly_pos != null ? data.rows.find((r) => !r.is_me && r.prev_weekly_pos != null && r.prev_weekly_pos < me.prev_weekly_pos! && r.weekly_pos > me.weekly_pos) : null;
  const recapMe = data.recap?.standings.find((s) => s.user_id === me?.user_id);
  const recapAhead = recapMe ? data.recap?.standings.find((s) => s.pos === recapMe.pos - 1) : null;

  return (
    <div>
      <Header title={copy.league.title} right={<span className="tnum text-xs text-muted">{data.iso_week}</span>} />
      {passer && <p className="mb-3 rounded-xl border border-ember/40 bg-ember/10 px-3 py-2 text-sm font-semibold text-ember" data-testid="passed-banner">{copy.league.passedYou(passer.display_name)}</p>}
      {!passer && passed && <p className="mb-3 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm font-semibold text-success">{copy.league.youPassed(passed.display_name)}</p>}

      {data.recap && recapMe && (
        <Card className="mb-3 p-4" data-testid="recap">
          <div className="font-display text-sm uppercase tracking-widest text-muted">{copy.league.recapTitle(data.recap.iso_week.slice(-2))}</div>
          <div className="mt-1 font-semibold">{copy.league.recapLine(recapMe.pos, recapAhead?.display_name, recapAhead ? Math.round((recapAhead.rate - recapMe.rate) * 100) : null)}</div>
        </Card>
      )}

      <Segmented value={mode} onChange={setMode} options={[{ value: "weekly", label: copy.league.weekly }, { value: "alltime", label: copy.league.allTime }]} />
      <div className="mt-3 space-y-2">
        {rows.length <= 1 && <EmptyState emoji="👥" title={copy.league.empty} />}
        {rows.map((r) => (
          <LeagueRow key={r.user_id} row={r} mode={mode} />
        ))}
      </div>

      <DuoCard handles={data.rows.filter((r) => !r.is_me).map((r) => ({ handle: r.handle, name: r.display_name, seed: r.avatar_seed }))} />

      {data.season && (
        <>
          <SectionTitle>{copy.league.seasonTitle(data.season.season_no, Math.min(6, data.season.week))}</SectionTitle>
          <Card className="divide-y divide-stroke" data-testid="season">
            {data.season.standings.slice(0, 5).map((s, n) => (
              <div key={s.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="font-display tnum w-6 text-lg text-muted">{n + 1}</span>
                <span className="flex-1 truncate">{s.display_name}</span>
                <span className="font-display tnum text-lg">{Math.round(s.avg_rate * 100)}%</span>
              </div>
            ))}
            {data.season.champions.length > 0 && (
              <div className="px-4 py-3 text-sm text-muted">
                {copy.league.champions}: {data.season.champions.map((c) => `S${c.season_no} 🏅 ${c.display_name}`).join(" · ")}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DuoCard({ handles }: { handles: { handle: string; name: string; seed: string }[] }) {
  const { data: duo, mutate } = useDuo();
  const toast = useToast();
  const [pick, setPick] = useState(false);
  const act = async (fn: string, args: Record<string, unknown>) => {
    try {
      await rpc(fn, args);
      await mutate();
      gmutate(["league_board"]);
    } catch (e) {
      toast((e as Error).message === "already_in_duo" ? "They're already in a duo this week." : copy.toast.error, "warn");
    }
  };
  return (
    <>
      <SectionTitle>{copy.league.duoTitle}</SectionTitle>
      <Card className="p-4" data-testid="duo">
        {!duo && (
          <>
            <p className="text-sm text-muted">{copy.league.duoNone}</p>
            {handles.length > 0 && (
              <Button variant="secondary" className="mt-3 w-full" onClick={() => setPick(true)}>
                {copy.league.duoInvite}
              </Button>
            )}
          </>
        )}
        {duo?.status === "pending" && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm">{duo.i_am_invitee ? copy.league.duoIncoming(duo.a.display_name) : copy.league.duoPending(duo.b.display_name)}</p>
            {duo.i_am_invitee ? (
              <>
                <Button size="sm" onClick={() => act("duo_respond", { p_duo: duo.id, p_accept: true })}>Accept</Button>
                <Button size="sm" variant="ghost" onClick={() => act("duo_respond", { p_duo: duo.id, p_accept: false })}>No</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => act("duo_cancel", { p_duo: duo.id })}>Cancel</Button>
            )}
          </div>
        )}
        {duo?.status === "active" && (
          <div>
            <div className="flex items-center justify-between">
              {[duo.a, duo.b].map((m) => (
                <div key={m.handle} className="flex items-center gap-2">
                  <Avatar seed={m.avatar_seed} name={m.display_name} size={32} />
                  <span className="text-sm">{m.display_name}</span>
                  <span className="font-display tnum text-lg">{Math.round(m.rate * 100)}%</span>
                </div>
              ))}
            </div>
            <div className={`font-display mt-3 text-center text-xl uppercase ${duo.combined >= 0.8 ? "text-success" : ""}`}>{copy.league.duoActive(Math.round(duo.combined * 100))}</div>
          </div>
        )}
      </Card>
      <Sheet open={pick} onClose={() => setPick(false)} title={copy.league.duoInvite}>
        <div className="space-y-2">
          {handles.map((h) => (
            <button key={h.handle} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-stroke bg-raised px-3" onClick={() => { setPick(false); act("duo_invite", { p_handle: h.handle }); }}>
              <Avatar seed={h.seed} name={h.name} size={36} />
              <span className="font-semibold">{h.name}</span>
              <span className="text-xs text-muted">@{h.handle}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
