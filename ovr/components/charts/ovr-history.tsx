"use client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "motion/react";

export function OvrHistoryChart({ points }: { points: { d: string; o: number }[] }) {
  const reduce = useReducedMotion();
  if (points.length < 2) return <div className="grid h-48 place-items-center text-sm text-muted">Need 2+ days to draw a line.</div>;
  const lo = Math.max(40, Math.min(...points.map((p) => p.o)) - 3);
  const hi = Math.min(99, Math.max(...points.map((p) => p.o)) + 3);
  return (
    <div className="h-52 w-full" data-testid="ovr-history">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -28 }}>
          <defs>
            <linearGradient id="ovrfill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#FF6A1A" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#FF6A1A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="d" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[lo, hi]} tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#1C1C22", border: "1px solid #2A2A33", borderRadius: 12, color: "#F5F5F7" }}
            labelStyle={{ color: "#A1A1AA" }}
            formatter={(v) => [v, "OVR"]}
          />
          <Area type="monotone" dataKey="o" stroke="#FF6A1A" strokeWidth={2.5} fill="url(#ovrfill)" isAnimationActive={!reduce} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
