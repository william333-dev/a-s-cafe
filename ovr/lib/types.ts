import type { Attribute, Difficulty, Schedule } from "./rating-engine";

export type Snapshot = {
  user_id: string;
  local_date: string;
  overall: number;
  body: number | null;
  mind: number | null;
  focus: number | null;
  discipline: number | null;
  social: number | null;
  craft: number | null;
  xp_total: number;
  level: number;
  ovr_raw: number | null;
  top_reasons: Reason[];
};

export type Reason = { attribute: Attribute | "calibration" | "cap"; delta: number | null; value?: number; done7?: number; sched7?: number };

export type HabitState = {
  id: string;
  title: string;
  emoji: string;
  attribute: Attribute;
  difficulty: Difficulty;
  custom_xp: number | null;
  schedule: Schedule;
  reminder_time: string | null;
  visible_to_league: boolean;
  sort_order: number;
  start_date: string;
  base_xp: number;
  target: number;
  per_week: number;
  today_count: number;
  yesterday_count: number;
  scheduled_today: boolean;
  scheduled_yesterday: boolean;
  week_done: number;
  streak: number;
  shields: number;
  last_shield_date: string | null;
  undoable_today: boolean;
  undoable_yesterday: boolean;
};

export type QuitTracker = {
  id: string;
  title: string;
  started_at: string;
  last_reset_at: string;
  best_streak_seconds: number;
  visible_to_league: boolean;
  credit_start: string;
};

export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_seed: string;
  timezone: string;
  baseline_ovr: number;
  start_date: string;
  onboarded: boolean;
};

export type Notify = { morning: string; evening: string; morning_on: boolean; evening_on: boolean; recap_on: boolean };

export type TodayData = {
  today: string;
  now: string;
  profile: Profile;
  settings: { setup: { focus?: Attribute[]; ratings?: Record<string, number>; goal?: string; timeframe?: string }; notify: Notify };
  snapshot: Snapshot;
  prev_snapshot: Snapshot | null;
  level: { level: number; into: number; needed: number; xp_total: number };
  xp_today: number;
  xp_cap: number;
  perfect_today: boolean;
  habits: HabitState[];
  quit: QuitTracker[];
  journal_today: { mood: number; body: string } | null;
  reactions_today: { kind: string; from: string }[];
  badges: string[];
};

export type CompletionResult = {
  status: "ok" | "already_done" | "nothing_to_undo";
  xp: number;
  bonus?: number;
  perfect?: boolean;
  capped?: boolean;
  habit: HabitState;
  ovr: number;
  prev_ovr: number | null;
  level: number;
  prev_level: number | null;
  xp_total: number;
  xp_today: number;
  badges: string[] | null;
  replayed?: boolean;
};

export type LeagueRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_seed: string;
  overall: number;
  level: number;
  xp_total: number;
  completion_rate: number;
  xp_week: number;
  weekly_pos: number;
  alltime_pos: number;
  prev_weekly_pos: number | null;
  prev_alltime_pos: number | null;
  is_me: boolean;
  reactions: Partial<Record<ReactionKind, number>>;
  my_reactions: ReactionKind[];
};
export type ReactionKind = "fire" | "flex" | "salute" | "clown";

export type LeagueData = {
  iso_week: string;
  league_today: string;
  rows: LeagueRow[];
  recap: { iso_week: string; standings: { user_id: string; display_name: string; handle: string; pos: number; rate: number; xp_week: number }[] } | null;
  season: {
    season_no: number;
    start: string;
    end: string;
    week: number;
    standings: { user_id: string; display_name: string; handle: string; avg_rate: number; xp: number }[];
    champions: { season_no: number; display_name: string; handle: string; avg_rate: number }[];
  } | null;
};

export type StatsData = {
  today: string;
  history: { d: string; o: number }[];
  heatmap: { d: string; done: number; sched: number }[];
  habits: { id: string; title: string; emoji: string; attribute: Attribute; streak: number; shields: number; best: number; rate28: number | null; total: number }[];
  level: { level: number; into_level: number; needed: number };
  xp_total: number;
};

export type MemberCard = {
  profile: { id: string; handle: string; display_name: string; avatar_seed: string; start_date: string };
  snapshot: Snapshot | null;
  history: { d: string; o: number }[];
  week: { completion_rate: number; xp_week: number } | null;
  habits: { title: string; emoji: string; attribute: Attribute; streak: number; done_today: boolean }[];
  quit: { title: string; last_reset_at: string; best_streak_seconds: number }[];
  badges: string[];
  is_me: boolean;
};

export type Duo = {
  id: string;
  status: "pending" | "active" | "declined";
  a: { display_name: string; handle: string; avatar_seed: string; rate: number };
  b: { display_name: string; handle: string; avatar_seed: string; rate: number };
  combined: number;
  i_am_invitee: boolean;
};
