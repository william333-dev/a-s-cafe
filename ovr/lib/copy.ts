// Every user-facing string lives here. Tweak freely.
// Voice: direct, cocky, gym-buddy. Banter yes, cruelty never. No shame on slips.

import type { Attribute } from "./rating-engine";

export const copy = {
  appName: "OVR",
  tagline: "Self-improvement, ranked.",

  auth: {
    title: "Time to lock in.",
    signUpTab: "Sign up",
    signInTab: "Sign in",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordHint: "8+ characters.",
    signUp: "Create account",
    signIn: "Lock in",
    forgot: "Forgot password?",
    resetSent: (email: string) => `Reset link sent to ${email}. Open it, set a new password, then sign in here.`,
    resetTitle: "New password",
    resetSave: "Save password",
    resetDone: "Password saved. You're in.",
    resetInvalid: "That reset link has expired. Request a new one from the sign-in screen.",
    checkEmail: (email: string) => `Almost there — confirm the email we sent to ${email}, then sign in.`,
    wrongPassword: "Wrong email or password.",
    exists: "You've already got an account. Sign in instead.",
    weakPassword: "Password needs to be at least 8 characters.",
    privacy:
      "Privacy, plainly: OVR is a private app for one friend group. We store your email, habits, completions and scores in a Supabase database in Sydney. Your league sees your name, OVR, weekly completion %, reactions, and only the habits and quit trackers you mark as shared. Your journal and relapse notes are visible to you only — always. No ads, no trackers, no selling anything. Export or delete everything any time in Settings.",
  },

  quiz: {
    focusTitle: "What are we working on?",
    focusSub: "Pick your areas. You can add more later.",
    rateTitle: "Be honest. Where are you at?",
    rateSub: "1 = rough, 10 = elite. This sets your starting estimate.",
    goalTitle: "One big goal.",
    goalPlaceholder: "Run a half marathon",
    timeframeLabel: "By when?",
    timeframes: ["4 weeks", "3 months", "6 months", "This year"],
    starterTitle: "Your starting reps.",
    starterSub: "We picked a few. Tweak, swap, or bin them.",
    quitTitle: "Anything to quit?",
    quitSub: "Optional. Vaping, doomscrolling, sugar — whatever. Private unless you share it.",
    quitPlaceholder: "e.g. Vaping",
    skip: "Skip",
    notifyTitle: "When should we nudge you?",
    notifySub: "Max two pings a day. Morning plan, evening streak check.",
    profileTitle: "What do we call you?",
    handleLabel: "Handle",
    nameLabel: "Display name",
    revealTitle: "Your starting card.",
    revealSub: (ovr: number, rank: string) => `Starting estimate: ${ovr} · ${rank}`,
    revealNote: "It's an estimate. Your habits take over within 14 days.",
    commitTitle: "Make it official.",
    commitSub: "Hold to lock in.",
    holdLabel: "Hold to lock in",
    locked: "Locked in.",
    next: "Next",
    back: "Back",
  },

  today: {
    title: "Today",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    anytime: "Anytime",
    yesterday: "Yesterday",
    yesterdayHint: "Missed a tap yesterday? Log it here. Today's the last chance.",
    emptyTitle: "No habits yet.",
    emptyBody: "Add your first rep. Start small — you can stack later.",
    emptyCta: "Add a habit",
    allDone: "Perfect day. That's how it's done.",
    left: (n: number) => (n === 1 ? "1 rep left today." : `${n} reps left today.`),
    journalPrompt: "How'd today go?",
    weekly: (done: number, n: number) => `${done}/${n} this week`,
    notToday: "Not today",
    holdToUndo: "Long-press to undo",
  },

  toast: {
    rep: (xp: number) => `Rep logged. +${xp} XP.`,
    repCapped: "Rep logged. Daily XP cap hit — still counts for OVR.",
    perfect: (xp: number) => (xp > 0 ? `Perfect day. +${xp} bonus.` : "Perfect day. That's how it's done."),
    undo: "Undone. XP returned.",
    undoExpired: "Too late to undo — that one's locked in.",
    queued: "Offline. Saved — we'll sync when you're back.",
    synced: (n: number) => `Back online. ${n} rep${n === 1 ? "" : "s"} synced.`,
    shieldUsed: "Missed yesterday? Shield used. Streak safe.",
    tooLate: "That day's closed. Today and yesterday only.",
    notScheduled: "Not on the schedule today.",
    weeklyDone: "Weekly target already smashed.",
    badge: (name: string) => `Badge unlocked: ${name}. +50 XP.`,
    rankUp: (rank: string) => `Rank up. Welcome to ${rank}.`,
    levelUp: (l: number) => `Level ${l}. Keep stacking.`,
    error: "Something broke. Try again.",
    saved: "Saved.",
  },

  ovr: {
    title: "Your OVR",
    whyTitle: "Why it moved",
    noChange: "Holding steady. Do the reps and it moves.",
    calibration: "Calibrating — your starting estimate fades out over 14 days.",
    cap: "Daily movement capped at ±3. The rest carries over.",
    nextRank: (pts: number, rank: string) => `${pts} to ${rank}`,
    maxRank: "Apex. Nowhere left to climb — so defend it.",
    howTitle: "How OVR works",
    reason: (attr: string, delta: number | null, done: number, sched: number) =>
      delta == null
        ? `${attr} unlocked: ${done}/${sched} this week`
        : `${delta > 0 ? "+" : ""}${delta} ${attr}: ${done}/${sched} done this week`,
  },

  stats: {
    title: "Stats",
    history: "OVR history",
    heatmap: "Consistency",
    habits: "Habits",
    level: (l: number) => `Level ${l}`,
    xpToNext: (n: number) => `${n} XP to next level`,
    streak: (n: number) => `${n}-day streak`,
    best: (n: number) => `Best ${n}`,
    rate: (p: number) => `${p}% (28d)`,
    empty: "Nothing to chart yet. Log a few days and come back.",
  },

  league: {
    title: "League",
    weekly: "This week",
    allTime: "All-time OVR",
    you: "You",
    passedYou: (name: string) => `${name} just passed you. Respond.`,
    youPassed: (name: string) => `You just passed ${name}. Don't look back.`,
    recapTitle: (w: string) => `Week ${w} recap`,
    recapLine: (pos: number, aheadName?: string | null, aheadBy?: number | null) =>
      pos === 1
        ? "You took #1. Crown's yours — for now."
        : `You finished #${pos}.${aheadName ? ` ${aheadName}'s ${aheadBy ?? 0}% ahead.` : ""}`,
    empty: "Just you so far. Invite the crew.",
    seasonTitle: (n: number, w: number) => `Season ${n} · Week ${w}/6`,
    champions: "Champions",
    reactSent: "Sent.",
    duoTitle: "Duo challenge",
    duoNone: "Team up with one mate this week. Hit 80% combined and you both get a badge.",
    duoInvite: "Pick a partner",
    duoPending: (name: string) => `Waiting on ${name}…`,
    duoIncoming: (name: string) => `${name} wants to duo this week.`,
    duoActive: (pct: number) => `Combined: ${pct}% — target 80%`,
  },

  quit: {
    title: "Quit trackers",
    add: "New tracker",
    clean: "clean",
    best: (s: string) => `Best: ${s}`,
    slipped: "I slipped",
    slipTitle: "It happens. Log it and go again.",
    triggerLabel: "What set it off? (optional)",
    triggers: ["Stress", "Bored", "Social", "Tired", "Craving", "Other"],
    noteLabel: "Note to self (private, optional)",
    confirmSlip: "Log it",
    afterSlip: "Logged. Counter reset, progress kept.",
    help: "Need to talk? Free call or text 1737, any time.",
    share: "Show on my league card",
    empty: "Nothing to quit? Respect. Or add one when you're ready.",
  },

  journal: {
    title: "Journal",
    prompt: "One line. How was today?",
    moodLabel: "Mood",
    moods: ["😞", "😕", "😐", "🙂", "😄"],
    save: "Save",
    private: "Only you can see this. Ever.",
    empty: "No entries yet. One line a day adds up.",
  },

  habits: {
    title: "Habits",
    new: "New habit",
    edit: "Edit habit",
    name: "Name",
    emoji: "Emoji",
    attribute: "Attribute",
    difficulty: "Difficulty",
    customXp: "Custom XP (5–50)",
    schedule: "Schedule",
    daily: "Every day",
    weekdays: "Pick days",
    timesPerWeek: "X times a week",
    targetPerDay: "Times per day",
    timeOfDay: "Usual time",
    shared: "Show on my league card",
    save: "Save habit",
    archive: "Archive",
    archived: "Archived. History kept.",
    empty: "No habits yet.",
    tooMany: "That's a lot of habits. Fewer, harder reps beat twenty easy ones.",
  },

  profile: {
    title: "Profile",
    share: "Share card",
    shareChart: "Share 30-day chart",
    invite: "Invite a mate",
    inviteText: "Join my OVR league — self-improvement, ranked.",
    inviteCopied: "Link copied. Send it to the group chat.",
    badges: "Badges",
    settings: "Settings",
    habits: "Manage habits",
    quit: "Quit trackers",
    journal: "Journal",
    rules: "How OVR works",
  },

  settings: {
    title: "Settings",
    notifications: "Notifications",
    morning: "Morning plan",
    evening: "Evening streak check",
    recap: "Sunday recap",
    enablePush: "Turn on notifications",
    pushOn: "Notifications on for this device.",
    pushDenied: "Notifications are blocked in your browser settings.",
    pushUnsupported: "This browser can't do push.",
    iosInstall: "On iPhone, push needs the app on your Home Screen first (iOS 16.4+): Share → Add to Home Screen, then open it from there.",
    testPush: "Send a test",
    timezone: "Timezone",
    export: "Export my data (JSON)",
    delete: "Delete my account",
    deleteConfirm: "This deletes everything — habits, history, journal. No undo. Type DELETE to confirm.",
    signOut: "Sign out",
    profile: "Profile",
  },

  install: {
    title: "Install OVR",
    android: "Add OVR to your home screen for the full app feel.",
    ios: "Tap Share, then “Add to Home Screen”.",
    cta: "Install",
    dismiss: "Not now",
  },

  states: {
    loading: "Loading…",
    offline: "Offline — showing your last sync. Taps are saved.",
    error: "Couldn't load that.",
    retry: "Try again",
  },

  push: {
    morning: (n: number) => ({ title: "Morning. Plan's set.", body: `${n} rep${n === 1 ? "" : "s"} on the board today. Go.` }),
    evening: (n: number) => ({ title: "Streak at risk.", body: `${n} rep${n === 1 ? "" : "s"} left. Don't let today slip.` }),
    recap: (week: string, pos: number, aheadName?: string | null, aheadBy?: number | null) => ({
      title: `Week ${week} recap`,
      body:
        pos === 1
          ? "You're #1. Defend it next week."
          : `You're #${pos}.${aheadName ? ` ${aheadName}'s ${aheadBy ?? 0}% ahead.` : ""}`,
    }),
    test: { title: "OVR", body: "Push works. Now go do something." },
  },
} as const;

export const ATTRIBUTE_META: Record<Attribute, { label: string; short: string; emoji: string; blurb: string }> = {
  body: { label: "Body", short: "BOD", emoji: "💪", blurb: "Training, sleep, movement" },
  mind: { label: "Mind", short: "MND", emoji: "🧠", blurb: "Reading, learning, calm" },
  focus: { label: "Focus", short: "FOC", emoji: "🎯", blurb: "Deep work, no distractions" },
  discipline: { label: "Discipline", short: "DIS", emoji: "🧱", blurb: "Hard things, on time" },
  social: { label: "Social", short: "SOC", emoji: "🤝", blurb: "Mates, family, people" },
  craft: { label: "Craft", short: "CRF", emoji: "🛠️", blurb: "Skills, side projects, art" },
};

export const STARTER_HABITS: Record<Attribute, { title: string; emoji: string; difficulty: "minor" | "standard" | "major" }[]> = {
  body: [
    { title: "Train", emoji: "🏋️", difficulty: "major" },
    { title: "8k steps", emoji: "🚶", difficulty: "standard" },
    { title: "In bed by 11", emoji: "😴", difficulty: "standard" },
  ],
  mind: [
    { title: "Read 10 pages", emoji: "📚", difficulty: "standard" },
    { title: "10 min meditation", emoji: "🧘", difficulty: "minor" },
  ],
  focus: [
    { title: "90 min deep work", emoji: "🎯", difficulty: "major" },
    { title: "Plan tomorrow", emoji: "🗒️", difficulty: "minor" },
  ],
  discipline: [
    { title: "Cold shower", emoji: "🧊", difficulty: "standard" },
    { title: "No phone first hour", emoji: "📵", difficulty: "standard" },
  ],
  social: [
    { title: "Message a mate", emoji: "💬", difficulty: "minor" },
    { title: "Call family", emoji: "📞", difficulty: "standard" },
  ],
  craft: [
    { title: "Practice 30 min", emoji: "🎸", difficulty: "standard" },
    { title: "Ship something", emoji: "🚀", difficulty: "major" },
  ],
};
