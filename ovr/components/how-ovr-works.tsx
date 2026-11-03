import Link from "next/link";

/** Plain-English summary of docs/rating-formula.md (keep in sync). */
export function HowOvrWorks() {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-fg/90">
      <p><b>OVR runs 40–99.</b> It&apos;s built from six attributes — Body, Mind, Focus, Discipline, Social, Craft — each fed by the habits you put in it.</p>
      <p><b>Consistency is most of it.</b> For each attribute we look at the last 28 days of scheduled reps. Recent days count more (a day 10 days ago counts half as much as today). Today only counts once you&apos;ve done it.</p>
      <p><b>Volume sets your ceiling.</b> One tiny habit can&apos;t get you to 99. An attribute&apos;s ceiling goes from 70 up to 99 as its weekly XP approaches 300.</p>
      <p><b>Breadth helps a bit.</b> Working 3+ attributes adds up to +3.</p>
      <p><b>New here?</b> You start from your quiz estimate (45–65). Over 14 days your real habits take over.</p>
      <p><b>No wild swings.</b> OVR moves at most ±3 a day.</p>
      <p><b>Quit trackers</b> count as a daily Discipline habit. A slip day counts as a miss — that&apos;s it. No shame, progress kept.</p>
      <p><b>XP</b>: minor 10 · standard 20 · major 35 (or custom 5–50), +1% per streak day up to +30%. Perfect day +25. Max 500 a day. Streak shields: earn one per 7-day streak (max 2); a miss uses one and your streak survives.</p>
      <p><b>League</b> ranks by weekly completion %, not raw XP — so adding 20 easy habits doesn&apos;t win.</p>
      <p><Link className="underline" href="/how-ovr-works">Full formula →</Link></p>
    </div>
  );
}
