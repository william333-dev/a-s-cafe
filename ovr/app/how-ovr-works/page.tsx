import Link from "next/link";

export const metadata = { title: "How OVR works · OVR" };

/** In-app copy of docs/rating-formula.md. */
export default function HowOvrWorksPage() {
  return (
    <main className="pt-safe mx-auto max-w-lg px-5 pb-16 leading-relaxed">
      <Link href="/ovr" className="mt-3 inline-block text-sm text-muted">‹ Back</Link>
      <h1 className="font-display mt-2 text-4xl uppercase">How OVR works</h1>
      <p className="mt-2 text-muted">The whole formula, in plain English. Nothing hidden, nothing faked.</p>

      <H>1. XP</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Each completion earns base XP: minor 10, standard 20, major 35, or a custom 5–50.</li>
        <li>Streak bonus: +1% per day of that habit&apos;s streak, up to +30% (30 days).</li>
        <li>Perfect day (every scheduled habit done): +25. Clean day on a quit tracker: 20 (it counts as a standard habit).</li>
        <li>Max 500 XP per day. You can log today and yesterday only. Yesterday&apos;s late logs count toward yesterday&apos;s cap.</li>
        <li>Undo works the same day you tapped. Otherwise XP never goes down.</li>
        <li>Levels: going from level L−1 to L takes round(50 × L<sup>1.6</sup>) XP.</li>
      </ul>

      <H>2. Streak shields</H>
      <p>Every 7 days of streak earns a shield (max 2). Miss a scheduled day and a shield gets used automatically — your streak survives. One missed day doesn&apos;t derail a habit; quitting after it does.</p>

      <H>3. Attribute scores</H>
      <p>Each habit belongs to one of six attributes. For each attribute we look at every scheduled day in the last 28 days:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Completion</b> for a day = count ÷ daily target (max 1). Today only counts once it&apos;s done.</li>
        <li><b>Recency</b>: a day&apos;s weight halves every 10 days.</li>
        <li><b>Difficulty</b>: bigger habits weigh more (by base XP).</li>
        <li><b>Score</b> S = weighted completion ÷ weighted possible, from 0 to 1.</li>
        <li><b>Ceiling</b>: weekly XP for the attribute (base XP × scheduled days a week) sets how high it can go — 70 + 29 × min(1, weekly XP ÷ 300). One easy habit tops out in the 70s.</li>
        <li><b>Attribute</b> = 40 + (ceiling − 40) × S.</li>
        <li>X-times-a-week habits count their weekly quota; unfilled slots only count once the week is over.</li>
        <li>Quit trackers feed Discipline as a daily 20-XP habit; a slip day is a 0.</li>
      </ul>

      <H>4. Overall</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>OVR = attributes averaged, weighted by each one&apos;s weekly XP, + a breadth bonus of +1 per active attribute beyond two (max +3). Clamped 40–99.</li>
        <li>Starting estimate: your setup-quiz ratings map to 45–65. Over your first 14 days it fades out and your real habits take over.</li>
        <li>OVR moves at most ±3 per day. Big jumps carry over to tomorrow.</li>
      </ul>

      <H>5. Ranks</H>
      <p>40–49 Rookie · 50–59 Bronze · 60–69 Silver · 70–79 Gold · 80–86 Platinum · 87–92 Diamond · 93–99 Apex.</p>

      <H>6. The league</H>
      <p>Weekly standings rank by completion rate (done ÷ scheduled), with XP as the tiebreak. It&apos;s computed on the server from your completions, so nobody can fake it — and adding 20 easy habits doesn&apos;t win, finishing what you scheduled does.</p>
    </main>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display mb-2 mt-8 text-2xl uppercase text-ember">{children}</h2>;
}
