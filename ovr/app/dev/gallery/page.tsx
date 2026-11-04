"use client";
import { useState } from "react";
import { HeatmapGrid } from "@/components/charts/heatmap";
import { OvrHistoryChart } from "@/components/charts/ovr-history";
import { HabitRow } from "@/components/habits/habit-row";
import { StreakFlame } from "@/components/habits/streak-flame";
import { LeagueRow } from "@/components/league/league-row";
import { ReactionBar } from "@/components/league/reaction-bar";
import { AttributeRadar } from "@/components/rating/attribute-radar";
import { OvrCard } from "@/components/rating/ovr-card";
import { RankEmblem } from "@/components/rating/rank-emblem";
import { RANKS } from "@/lib/rating-engine";
import { Button, Card, EmptyState, ErrorState, ProgressBar, SectionTitle, Segmented, Skeleton, Toggle } from "@/components/ui/primitives";
import { HoldToLockInButton } from "@/components/ui/hold-button";
import { useToast } from "@/components/ui/toast";
import { addDays } from "@/lib/dates";
import type { HabitState, LeagueRow as Row, ReactionKind } from "@/lib/types";

const habit = (o: Partial<HabitState>): HabitState => ({
  id: "h", title: "Gym", emoji: "🏋️", attribute: "body", difficulty: "major", custom_xp: null, schedule: { type: "daily" }, reminder_time: null,
  visible_to_league: true, sort_order: 0, start_date: "2026-11-01", base_xp: 35, target: 1, per_week: 7, today_count: 0, yesterday_count: 0,
  scheduled_today: true, scheduled_yesterday: true, week_done: 0, streak: 9, shields: 1, last_shield_date: null, undoable_today: true, undoable_yesterday: false, ...o,
});
const row = (o: Partial<Row>): Row => ({
  user_id: "u", handle: "sam", display_name: "Sam", avatar_seed: "s", overall: 74, level: 6, xp_total: 3000, completion_rate: 0.86, xp_week: 640,
  weekly_pos: 1, alltime_pos: 2, prev_weekly_pos: 3, prev_alltime_pos: 2, is_me: false, reactions: { fire: 2 }, my_reactions: [], ...o,
});

/** /dev/gallery — every component, every tier, for design QA at 360–430px. */
export default function Gallery() {
  const toast = useToast();
  const [count, setCount] = useState(0);
  const [seg, setSeg] = useState<"a" | "b">("a");
  const [tg, setTg] = useState(true);
  const [mine, setMine] = useState<ReactionKind[]>(["fire"]);
  const pts = Array.from({ length: 30 }, (_, i) => ({ d: addDays("2026-10-05", i), o: Math.round(52 + i * 0.8 + Math.sin(i) * 2) }));
  const heat = Array.from({ length: 120 }, (_, i) => ({ d: addDays("2026-07-06", i), done: (i * 7) % 4, sched: 3 }));
  return (
    <main className="pt-safe mx-auto max-w-lg px-4 pb-20">
      <h1 className="font-display mt-4 text-4xl uppercase">Gallery</h1>
      <SectionTitle>Rank emblems · all 25</SectionTitle>
      <div className="grid grid-cols-5 gap-2" data-testid="emblem-grid">
        {RANKS.map((r) => (
          <div key={r.index} className="flex flex-col items-center text-center text-[10px] text-muted">
            <RankEmblem rankKey={r.key} division={r.division} size={48} />
            {r.label}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2"><RankEmblem rankKey="gold" division={2} size={40} locked /><span className="self-center text-xs text-muted">locked state</span></div>
      <SectionTitle>OvrCard · every tier</SectionTitle>
      <div className="grid grid-cols-1 gap-3">
        {[45, 55, 65, 73, 79, 85, 89, 93, 96].map((o) => (
          <OvrCard key={o} overall={o} name="Will" handle="will" level={7} attrs={{ body: o, mind: o - 3, focus: o + 2, discipline: null, social: o - 8, craft: o - 1 }} compact={o !== 96} delta={o === 75 ? 2 : null} />
        ))}
      </div>
      <SectionTitle>HabitRow</SectionTitle>
      <div className="space-y-2">
        <HabitRow habit={habit({})} count={count} undoable onTap={() => { setCount(1); toast("Rep logged. +37 XP.", "xp", 37); }} onUndo={() => setCount(0)} />
        <HabitRow habit={habit({ title: "Pushups", emoji: "💪", target: 4, schedule: { type: "daily", target_per_day: 4 } })} count={2} undoable onTap={() => {}} onUndo={() => {}} />
        <HabitRow habit={habit({ title: "Call a mate", emoji: "📞", attribute: "social", schedule: { type: "times_per_week", times_per_week: 3 }, per_week: 3, week_done: 2, streak: 0, shields: 0 })} count={0} undoable={false} onTap={() => {}} onUndo={() => {}} />
      </div>
      <SectionTitle>StreakFlame · XpToast</SectionTitle>
      <div className="flex items-center gap-4">
        <StreakFlame days={3} /> <StreakFlame days={12} shields={2} size="lg" />
        <Button size="sm" onClick={() => toast("Rep logged. +20 XP.", "xp", 20)}>XP toast</Button>
      </div>
      <SectionTitle>HoldToLockInButton</SectionTitle>
      <div className="flex justify-center"><HoldToLockInButton label="Hold to lock in" doneLabel="Locked in." onComplete={() => toast("Locked in.", "good")} /></div>
      <SectionTitle>AttributeRadar</SectionTitle>
      <Card className="p-2"><AttributeRadar attrs={{ body: 82, mind: 70, focus: 88, discipline: 64, social: 58, craft: 75 }} /></Card>
      <SectionTitle>Charts</SectionTitle>
      <Card className="p-3"><OvrHistoryChart points={pts} /></Card>
      <Card className="mt-2 p-3"><HeatmapGrid days={heat} /></Card>
      <SectionTitle>League</SectionTitle>
      <div className="space-y-2">
        <LeagueRow row={row({})} mode="weekly" />
        <LeagueRow row={row({ handle: "will", display_name: "Will", is_me: true, weekly_pos: 2, prev_weekly_pos: 1, overall: 91, completion_rate: 0.8 })} mode="weekly" />
        <LeagueRow row={row({ handle: "hunter", display_name: "Hunter", weekly_pos: 3, prev_weekly_pos: 3, overall: 58 })} mode="alltime" />
      </div>
      <div className="mt-3"><ReactionBar counts={{ fire: 3, clown: 1 }} mine={mine} onToggle={(k) => setMine((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]))} /></div>
      <SectionTitle>Primitives</SectionTitle>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button loading>x</Button></div>
        <Segmented value={seg} onChange={setSeg} options={[{ value: "a", label: "This week" }, { value: "b", label: "All-time" }]} />
        <Toggle label="Toggle" sub="with sub" checked={tg} onChange={setTg} />
        <ProgressBar value={60} max={100} />
        <Skeleton className="h-12" />
      </div>
      <SectionTitle>States</SectionTitle>
      <Card><EmptyState title="No habits yet." body="Add your first rep." action={<Button>Add a habit</Button>} /></Card>
      <Card className="mt-2"><ErrorState onRetry={() => {}} /></Card>
    </main>
  );
}
