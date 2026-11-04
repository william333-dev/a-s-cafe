// Ready-made habits for the New habit screen. Tap to add, or tap to tweak first.
// Every entry must satisfy the habits table constraints (tests/unit/habit-templates.test.ts).

import type { Attribute, Difficulty, Schedule } from "./rating-engine";

export type HabitTemplate = {
  title: string;
  emoji: string;
  attribute: Attribute;
  difficulty: Exclude<Difficulty, "custom">;
  schedule: Schedule;
  /** HH:MM — groups it under morning / afternoon / evening on Today */
  time?: string;
};

const daily = (target_per_day = 1): Schedule => ({ type: "daily", target_per_day });
const weekdays: Schedule = { type: "weekdays", days: [1, 2, 3, 4, 5], target_per_day: 1 };
const perWeek = (n: number): Schedule => ({ type: "times_per_week", times_per_week: n, target_per_day: 1 });

export const HABIT_TEMPLATES: HabitTemplate[] = [
  // ---------------------------------------------------------------- Body
  { title: "Gym session", emoji: "🏋️", attribute: "body", difficulty: "major", schedule: perWeek(3), time: "17:30" },
  { title: "Run 5k", emoji: "🏃", attribute: "body", difficulty: "major", schedule: perWeek(2), time: "07:00" },
  { title: "Morning walk (20 min)", emoji: "🚶", attribute: "body", difficulty: "standard", schedule: daily(), time: "07:00" },
  { title: "10k steps", emoji: "👟", attribute: "body", difficulty: "standard", schedule: daily() },
  { title: "50 pushups", emoji: "💪", attribute: "body", difficulty: "standard", schedule: daily() },
  { title: "Stretch 10 min", emoji: "🤸", attribute: "body", difficulty: "minor", schedule: daily(), time: "21:30" },
  { title: "8 glasses of water", emoji: "💧", attribute: "body", difficulty: "minor", schedule: daily(8) },
  { title: "In bed by 10:30", emoji: "😴", attribute: "body", difficulty: "standard", schedule: daily(), time: "22:30" },
  { title: "8 hours of sleep", emoji: "🛌", attribute: "body", difficulty: "standard", schedule: daily(), time: "07:00" },
  { title: "Veggies with dinner", emoji: "🥦", attribute: "body", difficulty: "minor", schedule: daily(), time: "18:30" },
  { title: "Protein with every meal", emoji: "🍗", attribute: "body", difficulty: "minor", schedule: daily(3) },
  { title: "Sport training", emoji: "⚽", attribute: "body", difficulty: "major", schedule: perWeek(2), time: "16:00" },

  // ---------------------------------------------------------------- Mind
  { title: "Read 10 pages", emoji: "📚", attribute: "mind", difficulty: "standard", schedule: daily(), time: "21:00" },
  { title: "Meditate 10 min", emoji: "🧘", attribute: "mind", difficulty: "minor", schedule: daily(), time: "07:15" },
  { title: "Write 3 things I'm grateful for", emoji: "🙏", attribute: "mind", difficulty: "minor", schedule: daily(), time: "21:30" },
  { title: "Language practice 15 min", emoji: "🗣️", attribute: "mind", difficulty: "standard", schedule: daily() },
  { title: "Sunlight within 30 min of waking", emoji: "☀️", attribute: "mind", difficulty: "minor", schedule: daily(), time: "07:00" },
  { title: "Box breathing 5 min", emoji: "🌬️", attribute: "mind", difficulty: "minor", schedule: daily() },
  { title: "Learn something new (podcast/video)", emoji: "🎧", attribute: "mind", difficulty: "minor", schedule: daily() },
  { title: "Walk without headphones", emoji: "🍃", attribute: "mind", difficulty: "minor", schedule: perWeek(3) },
  { title: "Brain dump before bed", emoji: "🗒️", attribute: "mind", difficulty: "minor", schedule: daily(), time: "22:00" },
  { title: "Read a book chapter", emoji: "📖", attribute: "mind", difficulty: "standard", schedule: perWeek(4), time: "21:00" },

  // ---------------------------------------------------------------- Focus
  { title: "90 min deep work", emoji: "🎯", attribute: "focus", difficulty: "major", schedule: weekdays, time: "09:00" },
  { title: "2 focus blocks", emoji: "⏱️", attribute: "focus", difficulty: "standard", schedule: daily(2) },
  { title: "4 pomodoros", emoji: "🍅", attribute: "focus", difficulty: "standard", schedule: daily(4) },
  { title: "Study 1 hour", emoji: "🧠", attribute: "focus", difficulty: "standard", schedule: weekdays, time: "16:00" },
  { title: "Homework done before 6pm", emoji: "📝", attribute: "focus", difficulty: "standard", schedule: weekdays, time: "17:00" },
  { title: "Write top 3 priorities", emoji: "✅", attribute: "focus", difficulty: "minor", schedule: daily(), time: "08:00" },
  { title: "Plan tomorrow", emoji: "🗓️", attribute: "focus", difficulty: "minor", schedule: daily(), time: "21:00" },
  { title: "Phone in another room while working", emoji: "📵", attribute: "focus", difficulty: "standard", schedule: weekdays },
  { title: "Weekly review", emoji: "🔍", attribute: "focus", difficulty: "standard", schedule: { type: "weekdays", days: [7], target_per_day: 1 }, time: "19:00" },
  { title: "Inbox / messages cleared", emoji: "📥", attribute: "focus", difficulty: "minor", schedule: weekdays, time: "17:00" },

  // ---------------------------------------------------------------- Discipline
  { title: "Cold shower", emoji: "🧊", attribute: "discipline", difficulty: "standard", schedule: daily(), time: "07:00" },
  { title: "Make your bed", emoji: "🛏️", attribute: "discipline", difficulty: "minor", schedule: daily(), time: "07:00" },
  { title: "Up by 6:30", emoji: "⏰", attribute: "discipline", difficulty: "standard", schedule: weekdays, time: "06:30" },
  { title: "No snooze", emoji: "🔕", attribute: "discipline", difficulty: "minor", schedule: daily(), time: "06:30" },
  { title: "No phone for the first hour", emoji: "📴", attribute: "discipline", difficulty: "standard", schedule: daily(), time: "07:30" },
  { title: "No social media before noon", emoji: "🚫", attribute: "discipline", difficulty: "standard", schedule: daily(), time: "12:00" },
  { title: "Screen time under 3h", emoji: "📱", attribute: "discipline", difficulty: "standard", schedule: daily(), time: "21:30" },
  { title: "No energy drinks", emoji: "🥤", attribute: "discipline", difficulty: "standard", schedule: daily() },
  { title: "No takeaways", emoji: "🍔", attribute: "discipline", difficulty: "standard", schedule: daily(), time: "19:00" },
  { title: "Hardest task first", emoji: "🐸", attribute: "discipline", difficulty: "standard", schedule: weekdays, time: "09:00" },
  { title: "Tidy room 10 min", emoji: "🧹", attribute: "discipline", difficulty: "minor", schedule: daily(), time: "20:00" },
  { title: "Screen-free hour before bed", emoji: "🌙", attribute: "discipline", difficulty: "standard", schedule: daily(), time: "21:30" },

  // ---------------------------------------------------------------- Social
  { title: "Message a mate", emoji: "💬", attribute: "social", difficulty: "minor", schedule: daily() },
  { title: "Call family", emoji: "📞", attribute: "social", difficulty: "standard", schedule: perWeek(2), time: "18:00" },
  { title: "Hang out in person", emoji: "🍻", attribute: "social", difficulty: "major", schedule: perWeek(1) },
  { title: "Train with a mate", emoji: "🤝", attribute: "social", difficulty: "standard", schedule: perWeek(2) },
  { title: "Give someone a genuine compliment", emoji: "🙌", attribute: "social", difficulty: "minor", schedule: daily() },
  { title: "Help someone out", emoji: "🫱", attribute: "social", difficulty: "minor", schedule: daily() },
  { title: "Family dinner, no phones", emoji: "🍽️", attribute: "social", difficulty: "standard", schedule: perWeek(3), time: "18:30" },
  { title: "Reach out to someone you've lost touch with", emoji: "👋", attribute: "social", difficulty: "standard", schedule: perWeek(1) },
  { title: "Reply to messages same day", emoji: "📲", attribute: "social", difficulty: "minor", schedule: daily(), time: "20:00" },
  { title: "Say hi to someone new", emoji: "😄", attribute: "social", difficulty: "standard", schedule: perWeek(2) },

  // ---------------------------------------------------------------- Craft
  { title: "Practice instrument 30 min", emoji: "🎸", attribute: "craft", difficulty: "standard", schedule: daily(), time: "17:00" },
  { title: "Code 1 hour", emoji: "💻", attribute: "craft", difficulty: "standard", schedule: daily() },
  { title: "Sketch 15 min", emoji: "✏️", attribute: "craft", difficulty: "minor", schedule: daily() },
  { title: "Write 300 words", emoji: "✍️", attribute: "craft", difficulty: "standard", schedule: daily() },
  { title: "Work on side project", emoji: "🛠️", attribute: "craft", difficulty: "standard", schedule: perWeek(4) },
  { title: "Ship something", emoji: "🚀", attribute: "craft", difficulty: "major", schedule: perWeek(1) },
  { title: "Learn a skill 20 min", emoji: "🧩", attribute: "craft", difficulty: "minor", schedule: daily() },
  { title: "Make content (post/edit/film)", emoji: "🎬", attribute: "craft", difficulty: "standard", schedule: perWeek(3) },
  { title: "Cook a new recipe", emoji: "🍳", attribute: "craft", difficulty: "standard", schedule: perWeek(1), time: "18:00" },
  { title: "Photo walk", emoji: "📷", attribute: "craft", difficulty: "minor", schedule: perWeek(1) },
];

export type HabitPack = { key: string; title: string; emoji: string; blurb: string; habits: string[] };

/** Themed bundles — titles must exist in HABIT_TEMPLATES. */
export const HABIT_PACKS: HabitPack[] = [
  {
    key: "morning",
    title: "Morning reset",
    emoji: "🌅",
    blurb: "Win the first hour.",
    habits: ["Make your bed", "Sunlight within 30 min of waking", "No phone for the first hour", "Cold shower", "Write top 3 priorities"],
  },
  {
    key: "gym",
    title: "Gym rat",
    emoji: "🏋️",
    blurb: "Train, walk, recover.",
    habits: ["Gym session", "10k steps", "8 glasses of water", "Protein with every meal", "In bed by 10:30"],
  },
  {
    key: "student",
    title: "Student grind",
    emoji: "🎓",
    blurb: "School sorted, no stress.",
    habits: ["Study 1 hour", "Homework done before 6pm", "Phone in another room while working", "Read 10 pages", "Plan tomorrow"],
  },
  {
    key: "sleep",
    title: "Sleep fix",
    emoji: "🌙",
    blurb: "Better nights, better days.",
    habits: ["Screen-free hour before bed", "In bed by 10:30", "No energy drinks", "Up by 6:30"],
  },
  {
    key: "dopamine",
    title: "Dopamine detox",
    emoji: "🧠",
    blurb: "Take your attention back.",
    habits: ["No social media before noon", "Screen time under 3h", "Walk without headphones", "Meditate 10 min"],
  },
  {
    key: "social",
    title: "Social battery",
    emoji: "🤝",
    blurb: "Show up for your people.",
    habits: ["Message a mate", "Call family", "Hang out in person", "Give someone a genuine compliment"],
  },
];

export function templateByTitle(title: string) {
  return HABIT_TEMPLATES.find((t) => t.title === title);
}

export function describeSchedule(s: Schedule): string {
  const base =
    s.type === "daily"
      ? "Daily"
      : s.type === "weekdays"
        ? s.days?.length === 5 && s.days.every((d) => d <= 5)
          ? "Weekdays"
          : (s.days ?? []).map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]).join(", ")
        : `${s.times_per_week}× a week`;
  return (s.target_per_day ?? 1) > 1 ? `${base} · ${s.target_per_day}× a day` : base;
}

/** Row for the habits table (user_id/sort_order added by the caller). */
export function templateRow(t: HabitTemplate) {
  return {
    title: t.title,
    emoji: t.emoji,
    attribute: t.attribute,
    difficulty: t.difficulty,
    custom_xp: null,
    schedule: t.schedule,
    reminder_time: t.time ?? null,
    visible_to_league: true,
  };
}
