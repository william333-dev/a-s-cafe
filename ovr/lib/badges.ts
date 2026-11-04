// Badge copy. Keys must match private.check_badges() in the database.
export const BADGES: Record<string, { name: string; emoji: string; how: string }> = {
  first_rep: { name: "First Rep", emoji: "🥇", how: "Log your first habit." },
  perfect_day: { name: "Perfect Day", emoji: "✨", how: "Finish every scheduled habit in a day." },
  streak_7: { name: "Week Locked", emoji: "🔥", how: "7-day streak on any habit." },
  streak_30: { name: "30-Day Streak", emoji: "🌋", how: "30-day streak on any habit." },
  level_10: { name: "Double Digits", emoji: "🔟", how: "Reach level 10." },
  gold: { name: "Gold Card", emoji: "🟡", how: "Hit 70 OVR." },
  apex: { name: "First Apex", emoji: "👑", how: "Hit 95 OVR (Apex)." },
  clean_30: { name: "Clean 30", emoji: "🧊", how: "30 days clean on a quit tracker." },
  week_winner: { name: "Week Winner", emoji: "🏆", how: "Finish a week #1 in the league." },
  full_house: { name: "Full House", emoji: "🃏", how: "Active habits in all six attributes." },
  dynamic_duo: { name: "Dynamic Duo", emoji: "🤜🤛", how: "Hit 80% combined in a duo week." },
};

export function badgeMeta(key: string) {
  if (key.startsWith("champion_s")) {
    return { name: `Season ${key.slice(10)} Champion`, emoji: "🏅", how: "Won a 6-week season." };
  }
  return BADGES[key] ?? { name: key, emoji: "🎖️", how: "" };
}
