"use client";
import { HabitForm } from "@/components/habits/habit-form";
import { Header } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { useToday } from "@/lib/data";

export default function NewHabit() {
  const { data } = useToday();
  return (
    <div>
      <Header title={copy.habits.new} back="/today" />
      <HabitForm count={data?.habits.length ?? 0} />
    </div>
  );
}
