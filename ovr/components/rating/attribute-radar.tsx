"use client";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { ATTRIBUTE_META } from "@/lib/copy";
import { ATTRIBUTES, type Attribute } from "@/lib/rating-engine";
import { useReducedMotion } from "motion/react";

export function AttributeRadar({ attrs }: { attrs: Partial<Record<Attribute, number | null>> }) {
  const reduce = useReducedMotion();
  const data = ATTRIBUTES.map((a) => ({ k: ATTRIBUTE_META[a].short, v: attrs[a] ?? 40 }));
  return (
    <div className="h-64 w-full" aria-label="Attribute radar">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#2A2A33" />
          <PolarAngleAxis dataKey="k" tick={{ fill: "#A1A1AA", fontSize: 12, fontWeight: 700 }} />
          <PolarRadiusAxis domain={[40, 99]} tick={false} axisLine={false} />
          <Radar dataKey="v" stroke="#FF6A1A" strokeWidth={2.5} fill="#FF6A1A" fillOpacity={0.25} isAnimationActive={!reduce} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
