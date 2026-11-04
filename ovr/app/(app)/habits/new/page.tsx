"use client";
import { useState } from "react";
import { HabitForm } from "@/components/habits/habit-form";
import { TemplatePicker } from "@/components/habits/template-picker";
import { Header, Segmented } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { useToday } from "@/lib/data";
import type { HabitTemplate } from "@/lib/habit-templates";

export default function NewHabit() {
  const { data } = useToday();
  const [tab, setTab] = useState<"templates" | "custom">("templates");
  const [template, setTemplate] = useState<HabitTemplate | undefined>();
  const count = data?.habits.length ?? 0;
  return (
    <div>
      <Header title={copy.habits.new} back="/today" />
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={(t) => {
            setTab(t);
            if (t === "templates") setTemplate(undefined);
          }}
          options={[
            { value: "templates", label: "Templates" },
            { value: "custom", label: template ? "Customise" : "Make your own" },
          ]}
        />
      </div>
      {tab === "templates" ? (
        <TemplatePicker
          existingTitles={(data?.habits ?? []).map((h) => h.title)}
          count={count}
          onCustomise={(t) => {
            setTemplate(t);
            setTab("custom");
            window.scrollTo({ top: 0 });
          }}
        />
      ) : (
        <HabitForm key={template?.title ?? "blank"} count={count} template={template} />
      )}
    </div>
  );
}
