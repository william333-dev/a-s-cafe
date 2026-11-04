import Link from "next/link";
import { rankFor } from "@/lib/rating-engine";
import { RankEmblem } from "../rating/rank-emblem";
import type { LeagueRow as Row } from "@/lib/types";
import { Avatar } from "./avatar";

export function Movement({ now, prev }: { now: number; prev: number | null }) {
  if (prev == null || prev === now) return <span className="w-6 text-center text-xs text-muted">–</span>;
  const up = prev > now;
  return (
    <span className={`font-display tnum w-6 text-center text-xs ${up ? "text-success" : "text-muted"}`} aria-label={up ? `up ${prev - now}` : `down ${now - prev}`}>
      {up ? "▲" : "▼"}
      {Math.abs(prev - now)}
    </span>
  );
}

export function LeagueRow({ row, mode }: { row: Row; mode: "weekly" | "alltime" }) {
  const pos = mode === "weekly" ? row.weekly_pos : row.alltime_pos;
  const prev = mode === "weekly" ? row.prev_weekly_pos : row.prev_alltime_pos;
  const rank = rankFor(row.overall);
  const reacts = Object.values(row.reactions ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <Link
      href={`/league/${row.handle}`}
      className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2.5 active:bg-raised ${row.is_me ? "border-ember/50 bg-ember/5" : "border-stroke bg-surface"}`}
      data-testid="league-row"
      data-handle={row.handle}
    >
      <span className={`font-display tnum w-7 text-center text-2xl ${pos === 1 ? "text-ember" : "text-muted"}`}>{pos}</span>
      <Movement now={pos} prev={prev} />
      <Avatar seed={row.avatar_seed} name={row.display_name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {row.display_name} {row.is_me && <span className="text-xs text-muted">(you)</span>}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <RankEmblem rankKey={rank.key} division={rank.division} size={18} />
            <span className="font-display text-[11px] uppercase text-fg/80">{rank.label}</span>
          </span>
          {reacts > 0 && <span>{reacts} 🔥</span>}
        </span>
      </span>
      <span className="text-right">
        {mode === "weekly" ? (
          <>
            <span className="font-display tnum block text-2xl leading-none">{Math.round(row.completion_rate * 100)}%</span>
            <span className="tnum text-[11px] text-muted">{row.xp_week} XP</span>
          </>
        ) : (
          <>
            <span className="font-display tnum block text-2xl leading-none">{row.overall}</span>
            <span className="tnum text-[11px] text-muted">LV {row.level}</span>
          </>
        )}
      </span>
    </Link>
  );
}
