"use client";
import { isoDow } from "@/lib/dates";

/** GitHub-style consistency grid; columns are weeks (Mon→Sun). */
export function HeatmapGrid({ days }: { days: { d: string; done: number; sched: number }[] }) {
  if (!days.length) return null;
  const pad = isoDow(days[0].d) - 1;
  const cells: ({ d: string; done: number; sched: number } | null)[] = [...Array(pad).fill(null), ...days];
  const cols: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
  const shade = (c: { done: number; sched: number }) => {
    if (c.sched === 0) return "#16161B";
    const r = c.done / c.sched;
    if (r === 0) return "#232329";
    if (r < 0.5) return "rgba(255,106,26,.30)";
    if (r < 1) return "rgba(255,106,26,.60)";
    return "#FF6A1A";
  };
  return (
    <div className="scrollbar-none flex gap-[3px] overflow-x-auto pb-1" data-testid="heatmap" dir="rtl">
      <div className="flex gap-[3px]" dir="ltr">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((c, j) =>
              c ? <div key={j} title={`${c.d}: ${c.done}/${c.sched}`} className="size-3.5 rounded-[3px]" style={{ background: shade(c) }} /> : <div key={j} className="size-3.5" />,
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
