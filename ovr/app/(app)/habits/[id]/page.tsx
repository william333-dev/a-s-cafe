"use client";
import { useParams } from "next/navigation";
import { HabitForm } from "@/components/habits/habit-form";
import { EmptyState, Header, Skeleton } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { useToday } from "@/lib/data";

export default function EditHabit() {
  const { id } = useParams<{ id: string }>();
  const { data } = useToday();
  if (!data) return <Skeleton className="mt-16 h-96" />;
  const habit = data.habits.find((h) => h.id === id);
  return (
    <div>
      <Header title={copy.habits.edit} back="/habits" />
      {habit ? <HabitForm habit={habit} count={data.habits.length} /> : <EmptyState title="Habit not found." />}
    </div>
  );
}
