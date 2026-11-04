"use client";
import { motion } from "motion/react";
import { ATTRIBUTE_META } from "@/lib/copy";
import { ATTRIBUTES, rankFor, type Attribute } from "@/lib/rating-engine";
import { RANK_GRADIENT, RANK_INK, avatarColors } from "@/lib/rank-style";
import { CountUp } from "./count-up";
import { RankEmblem } from "./rank-emblem";

export type OvrCardProps = {
  overall: number;
  name: string;
  handle?: string;
  level?: number;
  attrs?: Partial<Record<Attribute, number | null>>;
  avatarSeed?: string;
  compact?: boolean;
  delta?: number | null;
  className?: string;
};

/** FIFA-style card: metallic tier frame, big numeral, six attribute stats. */
export function OvrCard({ overall, name, handle, level, attrs = {}, avatarSeed = "x", compact, delta, className = "" }: OvrCardProps) {
  const rank = rankFor(overall);
  const [g1, g2] = RANK_GRADIENT[rank.key];
  const ink = RANK_INK[rank.key];
  const [a1, a2] = avatarColors(avatarSeed);
  return (
    <div
      className={`relative overflow-hidden rounded-[26px] p-[2px] ${className}`}
      style={{ background: `linear-gradient(135deg, ${g1}, ${g2})`, boxShadow: `0 20px 60px -24px ${g1}` }}
      data-testid="ovr-card"
      data-rank={rank.key}
    >
      <div className="relative overflow-hidden rounded-[24px] p-5" style={{ background: `linear-gradient(150deg, ${g1} 0%, ${g2} 100%)`, color: ink }}>
        {/* metallic sheen */}
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "linear-gradient(115deg, rgba(255,255,255,.35) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,.12) 62%, rgba(255,255,255,0) 80%)" }} />
        {rank.key === "apex" && (
          <div className="pointer-events-none absolute inset-y-0 w-1/3 animate-sheen" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent)" }} />
        )}
        <div className="relative flex items-start gap-4">
          <div className="flex flex-col items-start leading-none">
            <CountUp value={overall} className={`font-display ${compact ? "text-7xl" : "text-[104px]"} leading-[0.85]`} />
            <span className="mt-1 flex items-center gap-1.5">
              <RankEmblem rankKey={rank.key} division={rank.division} size={compact ? 24 : 30} />
              <span className="font-display text-lg uppercase tracking-[0.14em] opacity-90">{rank.label}</span>
            </span>
            {delta != null && delta !== 0 && (
              <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-display tnum mt-1 rounded-md bg-black/25 px-1.5 text-sm" style={{ color: delta > 0 ? "#BFF0FF" : ink }}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} today
              </motion.span>
            )}
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            <div className="grid size-14 place-items-center rounded-2xl text-2xl font-black text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${a1}, ${a2})` }} aria-hidden>
              {name.slice(0, 1).toUpperCase()}
            </div>
            {level != null && <span className="font-display tnum text-base opacity-90">LV {level}</span>}
          </div>
        </div>
        {!compact && (
          <div className="relative mt-3 text-center">
            <div className="font-display truncate text-3xl uppercase">{name}</div>
            {handle && <div className="text-xs font-semibold opacity-75">@{handle}</div>}
          </div>
        )}
        <div className={`relative ${compact ? "mt-3" : "mt-4 border-t pt-3"} grid grid-cols-3 gap-x-3 gap-y-1`} style={{ borderColor: `${ink}33` }}>
          {ATTRIBUTES.map((a) => (
            <div key={a} className="flex items-baseline gap-1.5" data-testid={`attr-${a}`}>
              <span className="font-display tnum text-2xl">{attrs[a] ?? "--"}</span>
              <span className="font-display text-xs uppercase opacity-80">{ATTRIBUTE_META[a].short}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
